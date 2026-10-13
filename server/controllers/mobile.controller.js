import { getGeminiKeyRecord, markGeminiKeyFailure, markGeminiKeyValidated } from "../services/db.service.js";
import { decryptGeminiApiKeyRecord, fingerprintGeminiApiKey, proxyGeminiCall, toPublicGeminiError } from "../services/gemini.service.js";
import { enforceGeminiAbusePolicy, recordGeminiFailureForAbuse } from "../services/gemini-abuse.service.js";
import { anonymizeIdentifier, logGeminiEvent, recordGeminiMetric } from "../services/gemini-monitoring.service.js";
import { retrieveLegalGrounding, buildGroundingBlock, isGroundingEnabled, selectGroundingMode, buildGeminiGroundingBlock } from "../services/legalGrounding.service.js";
import { correctSubjectTypo } from "./gsMapping.js";

// Length policy: the model decides how long an answer should be underneath a
// paper-specific ceiling. GS papers and optional subjects have ONLY a maximum
// (2000 words, no minimum); Essay enforces a hard band of at least 1000 words
// and at most 1400. Subjects outside these tables keep the runaway guard.
const DIRECT_MAX_TARGET_TOKENS = Number(
  process.env.GEMINI_DIRECT_MAX_TARGET_TOKENS ||
    process.env.GEMINI_MAX_TARGET_TOKENS ||
    8192
);
// English runs at roughly 1.3 tokens per word, and markdown headings, bold
// runs and bullets add overhead on top of the prose itself. 1.7 sizes the
// token ceiling so a compliant max-word answer is never cut off prematurely.
const WORDS_TO_TOKENS = 1.7;

const MAX_OR_BAND_BY_SUBJECT = new Map([
  ["essay", { min: 1000, max: 1400 }],
]);
const GS_MAX_WORDS = { max: 2000 };
const OPTIONAL_MAX_WORDS = { max: 2000 };
const GS_SUBJECT_IDS = new Set(["gs1", "gs2", "gs3", "gs4"]);

// Returns the word range for a paper ({max} for a ceiling-only paper, {min,
// max} for a hard band), or null when the app enforces no range and the model
// judges length within the token backstop.
function getWordRange(subject) {
  const id = String(subject || "").trim().toLowerCase();
  if (!id) return null;
  if (MAX_OR_BAND_BY_SUBJECT.has(id)) return MAX_OR_BAND_BY_SUBJECT.get(id);
  if (GS_SUBJECT_IDS.has(id)) return GS_MAX_WORDS;
  if (id.endsWith("-optional")) return OPTIONAL_MAX_WORDS;
  return null;
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

  const resolvedQuestion = correctSubjectTypo(question, subject) || question;
  const wordRange = getWordRange(subject);
  // The token budget is sized off the paper's max so a compliant answer is never
  // cut off; the range object itself is passed to the prompt (max-only for GS/
  // optional, a hard band for essay).
  const targetTokens = wordRange?.max
    ? Math.ceil(wordRange.max * WORDS_TO_TOKENS)
    : requestedTargetTokens > 0
      ? Math.min(requestedTargetTokens, DIRECT_MAX_TARGET_TOKENS)
      : DIRECT_MAX_TARGET_TOKENS;
  const cappedTargetTokens = Math.min(targetTokens, DIRECT_MAX_TARGET_TOKENS);

  console.log(
    `[direct] device=${deviceId ? `${deviceId.slice(0, 8)}...` : "NONE"} keyResolved=${Boolean(userApiKey)} subject=${subject || "-"} wordRange=${wordRange ? (wordRange.min ? `${wordRange.min}-${wordRange.max}` : `max ${wordRange.max}`) : "-"} targetTokens=${cappedTargetTokens} prepMs=${Date.now() - prepStartedAt}`
  );

  return {
    userApiKey,
    deviceId,
    question,
    subject,
    resolvedQuestion,
    wordRange,
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

    // Selective legal/current-affairs grounding (opt-in). Only qualifying
    // questions trigger retrieval; the block tells the model to use verified
    // excerpts and to declare uncertainty when retrieval fails.
    let groundingInfo = { enabled: isGroundingEnabled(), mode: null, status: isGroundingEnabled() ? "not_needed" : "disabled", provider: null, sourceCount: 0, reasons: [], latencyMs: 0 };
    let groundingBlock = "";
    let geminiGrounding = false;

    if (groundingInfo.enabled) {

      const mode = selectGroundingMode();
        if (mode === "gemini") {
          // Gemini searches during generation; capture + return citations.
          geminiGrounding = true;
          groundingBlock = buildGeminiGroundingBlock();
          groundingInfo = { enabled: true, mode: "gemini", status: "gemini_search", provider: "gemini", sourceCount: 0, reasons: [], latencyMs: 0 };
          console.log(`[mobile-answer] grounding mode=gemini reasons=${[].join("; ")}`);
        } else if (mode === "search_api") {
          const result = await retrieveLegalGrounding(ctx.resolvedQuestion);
          groundingBlock = buildGroundingBlock(result);
          groundingInfo = { enabled: true, mode: "search_api", status: result.status, provider: result.provider, sourceCount: result.excerpts.length, reasons: [], latencyMs: result.latencyMs || 0 };
          console.log(`[mobile-answer] grounding mode=search_api status=${result.status} provider=${result.provider} sources=${result.excerpts.length} reasons=${[].join("; ")}`);
        } else {
          // Enabled but no usable provider → require explicit uncertainty.
          groundingBlock = buildGroundingBlock({ status: "no_provider" });
          groundingInfo = { enabled: true, mode: null, status: "no_provider", provider: null, sourceCount: 0, reasons: [], latencyMs: 0 };
          console.log(`[mobile-answer] grounding enabled but no provider configured`);


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
      wordLimit: ctx.wordRange ? ctx.wordRange.max : null,
      direct: true,
      retrievalMode: groundingInfo.mode || "none",
      chunkCount: 0,
      chunks: [],
      chunkScores: null,
      sourceFile: null,
      sourceChunkCount: 0,
      sourceSufficient: true,
      sourceIssue: null,
      strictRag: false,
      grounding: groundingInfo,
    };
    res.write(`data: ${JSON.stringify(contextEvent)}\n\n`);
    if (typeof res.flush === "function") res.flush();

    const result = await proxyGeminiCall(ctx.userApiKey, {
      question: ctx.resolvedQuestion,
      subjectId: ctx.subject,
      targetTokens: ctx.cappedTargetTokens,
      wordRange: ctx.wordRange,
      groundingBlock,
      geminiGrounding,
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
        grounding: groundingInfo,
        groundingSources: result.groundingSources || [],
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