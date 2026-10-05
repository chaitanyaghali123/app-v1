import { getGeminiKeyRecord, markGeminiKeyFailure, markGeminiKeyValidated } from "../services/db.service.js";
import { decryptGeminiApiKeyRecord, fingerprintGeminiApiKey, proxyGeminiCall, toPublicGeminiError } from "../services/gemini.service.js";
import { enforceGeminiAbusePolicy, recordGeminiFailureForAbuse } from "../services/gemini-abuse.service.js";
import { anonymizeIdentifier, logGeminiEvent, recordGeminiMetric } from "../services/gemini-monitoring.service.js";
import { correctSubjectTypo } from "./gsMapping.js";

const DEFAULT_TARGET_TOKENS = 4600;
const ESSAY_TARGET_TOKENS = 2600;
const DOMAIN_QUERY_EXPANSIONS = [
  {
    pattern: /\btrade\s+unions?\b/i,
    query:
      "industrial relations collective bargaining workers participation labour welfare industrial disputes social security",
  },
  {
    pattern: /\b(bitcoin|crypto(?:currency|currencies)?)\b/i,
    query:
      "Satoshi 2009 decentralized virtual currency blockchain RBI Supreme Court taxation volatility mining regulation illegal trade terror finance",
  },
  {
    pattern: /\bmetallic\s+money\b/i,
    query:
      "commodity money coins intrinsic value full bodied coins token coins Indian currency history",
  },
];
const QUESTION_SCAFFOLDING = new Set([
  "discuss", "elucidate", "explain", "examine", "analyse", "analyze", "assess",
  "elaborate", "describe", "outline", "trace", "comment", "evaluate", "bring",
  "role", "roles", "impact", "impacts", "influence", "significance", "salient",
  "features", "feature", "aspects", "dimension", "dimensions", "nature",
  "meaning", "importance", "relevance", "relation", "relationship", "shaping",
  "shaped", "shape", "modern", "contemporary", "given", "briefly", "detail",
  "detailed", "manner", "way", "ways", "context", "perspective", "notable",
  "various", "overall", "systematically", "critically", "suitable", "possible",
]);
const REGION_MEMBERS = {
  "south asia": ["india", "pakistan", "bangladesh", "nepal", "bhutan", "sri lanka", "afghanistan", "maldives"],
  "south-east asia": ["india", "myanmar", "thailand", "vietnam", "indonesia", "malaysia", "philippines", "singapore", "cambodia", "laos"],
  "southeast asia": ["india", "myanmar", "thailand", "vietnam", "indonesia", "malaysia", "philippines", "singapore", "cambodia", "laos"],
  "east asia": ["china", "japan", "korea", "mongolia", "taiwan"],
  "central asia": ["kazakhstan", "uzbekistan", "turkmenistan", "kyrgyzstan", "tajikistan"],
  "west asia": ["saudi arabia", "iran", "iraq", "israel", "turkey", "uae", "qatar", "oman", "yemen", "syria"],
  "south america": ["brazil", "argentina", "chile", "peru", "colombia", "venezuela"],
  "european union": ["france", "germany", "italy", "spain", "netherlands", "belgium", "poland", "sweden"],
};

const NAMED_COUNTRIES = [
  "india", "pakistan", "bangladesh", "nepal", "bhutan", "sri lanka", "afghanistan", "maldives",
  "china", "japan", "myanmar", "thailand", "vietnam", "indonesia", "africa", "brazil", "russia",
  "france", "germany", "britain", "america", "australia", "canada", "korea", "turkey", "egypt",
  "nepal", "america", "iran", "iraq", "israel", "greece", "rome", "bharat",
];
function detectWordLimit(question, subject) {
  const ids = (Array.isArray(subject) ? subject : [subject])
    .map((s) => String(s || "").trim().toLowerCase())
    .filter(Boolean);
  const idSet = new Set(ids);
  if (idSet.has("essay")) return 1300;
  return 600;
}
function collapseOutsideCodeFences(text) {
  const segments = String(text || "").split("```");
  return segments
    .map((seg, idx) => {
      if (idx % 2 === 1) return seg;
      return collapseOutsideDiagrams(seg);
    })
    .join("```");
}

function sanitizeLatexArtifacts(text) {
  return String(text || "")
    .replace(/\\\$/g, "$")
    .replace(/\$\$\s*([\s\S]*?)\s*\$\$/g, "$1")
    .replace(/\\\[([\s\S]*?)\\\]/g, "$1")
    .replace(/\\\(([\s\S]*?)\\\)/g, "$1")
    .replace(/\\text\{([^{}]*)\}/g, "$1")
    .replace(/\\langle/g, "<")
    .replace(/\\rangle/g, ">")
    .replace(/\\longrightarrow/g, "\u2192")
    .replace(/\\rightarrow/g, "\u2192")
    .replace(/\\Rightarrow/g, "\u21D2")
    .replace(/\\times/g, "\u00D7")
    .replace(/\\leq/g, "\u2264")
    .replace(/\\geq/g, "\u2265")
    .replace(/\\approx/g, "\u2248")
    .replace(/\\neq/g, "\u2260")
    .replace(/\\cdots/g, "\u2026")
    .replace(/\\ldots/g, "\u2026")
    .replace(/\\bullet/g, "\u2022")
    .replace(/\\%/g, "%")
    .replace(/\\&/g, "&")
    .replace(/\\([a-zA-Z]+)/g, "$1")
    .replace(/\{\s*|\s*\}/g, " ");
}

function collapseOutsideDiagrams(seg) {
  seg = sanitizeLatexArtifacts(seg)
    .replace(/([^\n#])(#{2,6}\s+)/g, "$1\n\n$2")
    .replace(/([^\n*])(\*\s+)/g, "$1\n$2")
    .replace(/(?<![#\d*\n])(?<![#*\d][ \t])(\d{1,2}\.\s+)/g, "\n$1");
  const lines = seg.split("\n");
  const isRegion = new Array(lines.length).fill(false);
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("┌")) {
      let end = i;
      for (let j = i; j < lines.length; j++) {
        if (lines[j].includes("└") || lines[j].includes("┘")) end = j;
      }
      for (let k = i; k <= end; k++) isRegion[k] = true;
      i = end;
    }
  }
  return lines
    .map((ln, i) => (isRegion[i] ? ln : ln.replace(/[ \t]+/g, " ").trim()))
    .join("\n");
}

function alignDiagramIndentation(text) {
  const lines = String(text || "").split("\n");
  const out = [];
  let block = [];
  const flush = () => {
    if (block.length === 0) return;
    for (let i = 0; i < block.length; i++) {
      if (block[i].trimStart().startsWith("┌")) {
        const indents = [];
        for (let j = i + 1; j < block.length; j++) {
          const m = block[j].match(/^\s*[│└┘┐┌┬▼▲]/);
          if (m) indents.push(block[j].match(/^\s*/)[0].length);
        }
        if (indents.length > 0) {
          const sorted = [...indents].sort((a, b) => a - b);
          const target = sorted[Math.floor(sorted.length / 2)];
          const current = block[i].match(/^\s*/)[0].length;
          if (current !== target) {
            block[i] = " ".repeat(target) + block[i].trimStart();
          }
        }
        break;
      }
    }
    out.push(...block);
    block = [];
  };
  for (const ln of lines) {
    if (/^```/.test(ln.trim())) {
      flush();
      out.push(ln);
    } else {
      block.push(ln);
    }
  }
  flush();
  return out.join("\n");
}

function fenceDiagrams(text) {
  const lines = String(text || "").split("\n");
  const out = [];
  let inFence = false;
  let i = 0;
  while (i < lines.length) {
    const ln = lines[i];
    if (/^```/.test(ln.trim())) {
      inFence = !inFence;
      out.push(ln);
      i++;
      continue;
    }
    if (!inFence && ln.includes("┌")) {
      let end = i;
      for (let j = i; j < lines.length; j++) {
        if (lines[j].includes("└") || lines[j].includes("┘")) end = j;
      }
      out.push("```text", ...lines.slice(i, end + 1), "```", "");
      i = end + 1;
      continue;
    }
    out.push(ln);
    i++;
  }
  return out.join("\n");
}

function normalizeFenceBlocks(text) {
  const tokens = String(text || "").split(/(```[a-zA-Z][a-zA-Z0-9_-]*|```)/);
  let out = "";
  let prevWasFence = false;
  for (const t of tokens) {
    if (/^```/.test(t)) {
      if (out.length > 0 && !out.endsWith("\n")) out += "\n";
      out += t;
      prevWasFence = true;
    } else if (t !== "") {
      if (prevWasFence && !t.startsWith("\n")) out += "\n";
      out += t;
      prevWasFence = false;
    }
  }
  const lines = out.split("\n");
  const result = [];
  for (const ln of lines) {
    if (/^```/.test(ln)) {
      if (result.length > 0 && result[result.length - 1] !== "") result.push("");
      result.push(ln);
    } else if (ln !== "") {
      if (result.length > 0 && result[result.length - 1] === "```") result.push("");
      result.push(ln);
    } else {
      result.push(ln);
    }
  }
  return result.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
async function prepareMobileAnswerContext({ question, subject, targetTokens: requestedTargetTokens = 0, deviceId }) {
  if (!question || typeof question !== "string") {
    const err = new Error("question is required");
    err.status = 400;
    throw err;
  }
  const prepStartedAt = Date.now();

  let userApiKey = null;
  if (deviceId && typeof deviceId === "string" && deviceId.length >= 8) {
    try {
      const keyRecord = await getGeminiKeyRecord(deviceId);
      if (keyRecord?.encrypted_key) {
        userApiKey = await decryptGeminiApiKeyRecord(keyRecord);
      }
    } catch (keyErr) {
      console.warn("[mobile-answer] failed to resolve user API key:", keyErr.message);
    }
  }

  const isEssay = String(subject || "").trim().toLowerCase() === "essay";
  const resolvedQuestion = correctSubjectTypo(question, subject) || question;
  const wordLimit = detectWordLimit(resolvedQuestion, subject);
  const targetTokens = requestedTargetTokens > 0 && !isEssay
    ? requestedTargetTokens
    : isEssay
      ? ESSAY_TARGET_TOKENS
      : DEFAULT_TARGET_TOKENS;
  const cappedTargetTokens = wordLimit
    ? Math.min(targetTokens, Math.round(wordLimit * 2.6))
    : targetTokens;

  console.log(
    `[direct] device=${deviceId ? `${deviceId.slice(0, 8)}...` : "NONE"} keyResolved=${Boolean(userApiKey)} subject=${subject || "-"} wordLimit=${wordLimit || "-"} targetTokens=${cappedTargetTokens} prepMs=${Date.now() - prepStartedAt}`
  );

  return {
    userApiKey,
    deviceId,
    question,
    subject,
    isEssay,
    resolvedQuestion,
    wordLimit,
    targetTokens,
    cappedTargetTokens,
    prepStartedAt,
  };
}


function toMobileRagError(err) {
  if (err?.code === "GEMINI_QUOTA_EXCEEDED" || (err?.status === 429 && err?.code === "GEMINI_QUOTA_EXCEEDED")) {
    return { status: 429, body: { error: err.message || "This Gemini API key has reached its usage quota.", code: "GEMINI_QUOTA_EXCEEDED" } };
  }
  if (err?.status === 429 || err?.code === "GEMINI_RATE_LIMITED") {
    return { status: 429, body: { error: err.message || "Gemini is temporarily rate-limiting this key.", code: "GEMINI_RATE_LIMITED" } };
  }
  if (err?.code === "GEMINI_KEY_UNAUTHORIZED") {
    return {
      status: 401,
      body: {
        error:
          "Your stored Gemini API key was rejected. It may be invalid or expired — update your API key in settings and try again.",
        code: "GEMINI_KEY_UNAUTHORIZED",
      },
    };
  }
  if (err?.status === 400) {
    return { status: 400, body: { error: err.message } };
  }
  return { status: 500, body: { error: "Failed to prepare mobile context" } };
}

export async function getMobileAnswer(req, res) {
  const startedAt = Date.now();
  let keyHash = null;
  let prepareMs = 0;

  const prepareError = (err, res) => {
    const parsed = toMobileRagError(err);
    console.error("[mobile-answer] prepare error:", err.message);
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ type: "error", ...parsed.body })}\n\n`);
      return res.end();
    }
    return res.status(parsed.status).json(parsed.body);
  };

  try {
    const prepareStartedAt = Date.now();
    const ctx = await prepareMobileAnswerContext(req.body || {});
    prepareMs = Date.now() - prepareStartedAt;

    if (!ctx.userApiKey) {
      return res.status(404).json({
        error: "No API key found for this device. Please store your key first.",
        code: "GEMINI_KEY_NOT_FOUND",
      });
    }
    keyHash = fingerprintGeminiApiKey(ctx.userApiKey);

    await enforceGeminiAbusePolicy({
      deviceId: ctx.deviceId,
      ip: req.ip,
      keyHash,
      targetTokens: ctx.cappedTargetTokens,
    });

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    });
    if (req.socket) req.socket.setNoDelay(true);

    // The client renders whatever it receives here, so the shape is kept stable
    // even though retrieval no longer exists: an always-empty sources list is
    // less disruptive than a removed field.
    const contextEvent = {
      type: "context",
      question: ctx.question,
      subject: ctx.subject,
      targetTokens: ctx.targetTokens,
      wordLimit: ctx.wordLimit,
      direct: true,
      retrievalMode: "none",
      chunkCount: 0,
      chunks: [],
      chunkScores: null,
      sourceFile: null,
      sourceChunkCount: 0,
      sourceSufficient: true,
      sourceIssue: null,
      strictRag: false,
    };
    res.write(`data: ${JSON.stringify(contextEvent)}\n\n`);
    if (typeof res.flush === "function") res.flush();

    const result = await proxyGeminiCall(ctx.userApiKey, {
      question: ctx.resolvedQuestion,
      subjectId: ctx.subject,
      targetTokens: ctx.cappedTargetTokens,
      onToken: (token) => {
        res.write(`data: ${JSON.stringify({ type: "token", text: token })}\n\n`);
        if (typeof res.flush === "function") res.flush();
      },
      onStatus: (status) => {
        res.write(`data: ${JSON.stringify({ type: "status", status })}\n\n`);
        if (typeof res.flush === "function") res.flush();
      },
    });

    await markGeminiKeyValidated(ctx.deviceId);
    recordGeminiMetric({
      route: "mobile-answer",
      outcome: "success",
      latencyMs: Date.now() - startedAt,
      tokenCount: result.tokenCount || 0,
    });
    logGeminiEvent("mobile_answer_success", {
      device: anonymizeIdentifier(ctx.deviceId),
      key: anonymizeIdentifier(keyHash),
      ip: anonymizeIdentifier(req.ip),
      latencyMs: Date.now() - startedAt,
      tokenCount: result.tokenCount || 0,
    });
    console.log(
      `[mobile-answer] success: prepareMs=${prepareMs} genMs=${Date.now() - startedAt - prepareMs} totalMs=${Date.now() - startedAt} tokens=${result.tokenCount || 0} words=${result.wordCount || 0} truncated=${Boolean(result.truncated)}`
    );
    res.write(
      `data: ${JSON.stringify({
        type: "done",
        answer: result.answer,
        tokenCount: result.tokenCount,
        wordCount: result.wordCount,
        truncated: Boolean(result.truncated),
        timedOut: Boolean(result.timedOut),
        finishReason: result.finishReason || null,
        grounding: null,
        sentenceScores: null,
        chunkScores: null,
      })}\n\n`
    );
    return res.end();
  } catch (err) {
    const publicError = toPublicGeminiError(err);
    recordGeminiMetric({
      route: "mobile-answer",
      outcome: "error",
      code: publicError.body.code,
      latencyMs: Date.now() - startedAt,
    });
    logGeminiEvent("mobile_answer_error", {
      device: anonymizeIdentifier(req.body?.deviceId),
      key: anonymizeIdentifier(keyHash),
      ip: anonymizeIdentifier(req.ip),
      code: publicError.body.code,
      latencyMs: Date.now() - startedAt,
    });
    console.error("[mobile-answer] error:", err.code || err.message);

    if (req.body?.deviceId && publicError.body.code) {
      try {
        await markGeminiKeyFailure(req.body.deviceId, publicError.body.code);
        await recordGeminiFailureForAbuse({
          deviceId: req.body.deviceId,
          ip: req.ip,
          keyHash,
          code: publicError.body.code,
        });
      } catch (dbErr) {
        console.error("[mobile-answer] failed to persist key health/abuse state:", dbErr.message);
      }
    }

    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ type: "error", ...publicError.body })}\n\n`);
      return res.end();
    }
    if (publicError.body.retryAfter) {
      res.setHeader("Retry-After", publicError.body.retryAfter);
    }
    if (err?.status === 429 || err?.status === 400) {
      return prepareError(err, res);
    }
    return res.status(publicError.status).json(publicError.body);
  }
}
