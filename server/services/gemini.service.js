import crypto from "crypto";
import axios from "axios";

const ENCRYPTION_ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
let warnedWeakEncryptionSecret = false;

function getEncryptionKey() {
  const secret = process.env.GEMINI_ENCRYPTION_SECRET;
  if (!secret) {
    throw new Error(
      "GEMINI_ENCRYPTION_SECRET env var is required for key vault."
    );
  }
  if (secret.length < KEY_LENGTH && !warnedWeakEncryptionSecret) {
    console.warn(
      "[gemini] GEMINI_ENCRYPTION_SECRET should be at least 32 characters in production."
    );
    warnedWeakEncryptionSecret = true;
  }
  const key = Buffer.from(secret, "utf8");
  if (key.length >= KEY_LENGTH) {
    return key.subarray(0, KEY_LENGTH);
  }
  const padded = Buffer.alloc(KEY_LENGTH, 0);
  key.copy(padded);
  return padded;
}

export function encrypt(text) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decrypt(encoded) {
  const key = getEncryptionKey();
  const parts = encoded.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted format");
  }
  const iv = Buffer.from(parts[0], "hex");
  const authTag = Buffer.from(parts[1], "hex");
  const encrypted = Buffer.from(parts[2], "hex");
  const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_REQUEST_TIMEOUT_MS = Number(process.env.GEMINI_REQUEST_TIMEOUT_MS || 90000);
const GEMINI_KEY_VALIDATION_TIMEOUT_MS = Number(process.env.GEMINI_KEY_VALIDATION_TIMEOUT_MS || 15000);
const GEMINI_MAX_RETRIES = Math.max(0, Number(process.env.GEMINI_MAX_RETRIES || 2));
const VECTOR_SERVER_URL = process.env.FASTAPI_URL || process.env.VECTOR_API || "http://aryabhata-ingestor:7860";
const VECTOR_API_KEY = process.env.VECTOR_API_KEY || "CHANGE_THIS_TO_64_CHAR_SECRET";
const VERIFY_THRESHOLD = Number(process.env.VERIFY_THRESHOLD || 0.45);
const VERIFY_TIMEOUT_MS = Number(process.env.VERIFY_TIMEOUT_MS || 12000);

const RETRYABLE_GEMINI_STATUS_CODES = new Set([408, 409, 429, 500, 502, 503, 504]);

export class GeminiApiError extends Error {
  constructor({
    message,
    status = 500,
    code = "GEMINI_ERROR",
    userMessage = "Gemini request failed. Please try again.",
    retryAfterSeconds = null,
    retriable = false,
    operation = "gemini",
  }) {
    super(message);
    this.name = "GeminiApiError";
    this.status = status;
    this.code = code;
    this.userMessage = userMessage;
    this.retryAfterSeconds = retryAfterSeconds;
    this.retriable = retriable;
    this.operation = operation;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfter(headers) {
  const raw = headers?.get?.("retry-after");
  if (!raw) return null;
  const numeric = Number(raw);
  if (Number.isFinite(numeric)) return Math.max(1, Math.ceil(numeric));
  const parsedDate = Date.parse(raw);
  if (Number.isNaN(parsedDate)) return null;
  return Math.max(1, Math.ceil((parsedDate - Date.now()) / 1000));
}

function parseGeminiErrorPayload(body) {
  try {
    const payload = JSON.parse(body);
    const error = payload?.error || payload;
    return {
      message: String(error?.message || ""),
      status: String(error?.status || ""),
      code: String(error?.code || ""),
    };
  } catch {
    return { message: String(body || ""), status: "", code: "" };
  }
}

function classifyGeminiError(status, body, statusText, retryAfterSeconds, operation) {
  const parsed = parseGeminiErrorPayload(body);
  const combined = `${parsed.status} ${parsed.code} ${parsed.message} ${statusText || ""}`.toLowerCase();
  const retriable = RETRYABLE_GEMINI_STATUS_CODES.has(status);
  let code = "GEMINI_ERROR";
  let userMessage = "Gemini request failed. Please try again.";
  let publicStatus = status >= 500 ? 502 : status;

  if (status === 400) {
    code = "GEMINI_BAD_REQUEST";
    userMessage = "Gemini rejected this request. Please shorten the question or evidence and try again.";
  } else if (status === 401 || combined.includes("api key not valid") || combined.includes("invalid api key")) {
    code = "GEMINI_INVALID_KEY";
    publicStatus = 401;
    userMessage = "This Gemini API key is invalid. Please check the key and save it again.";
  } else if (
    status === 402 ||
    combined.includes("billing") ||
    combined.includes("payment") ||
    combined.includes("quota project")
  ) {
    code = "GEMINI_BILLING_REQUIRED";
    publicStatus = 402;
    userMessage = "This Gemini key cannot be used because billing or API access is not enabled for its Google project.";
  } else if (status === 403 || combined.includes("permission_denied")) {
    code = "GEMINI_PERMISSION_DENIED";
    publicStatus = 403;
    userMessage = "This Gemini key does not have permission to use the selected model. Enable Gemini API access or use another key.";
  } else if (status === 404) {
    code = "GEMINI_MODEL_NOT_FOUND";
    publicStatus = 502;
    userMessage = "The configured Gemini model is not available for this key or region.";
  } else if (status === 429 || combined.includes("quota") || combined.includes("rate limit")) {
    code = "GEMINI_QUOTA_EXCEEDED";
    publicStatus = 429;
    userMessage = "This Gemini key has reached its quota or rate limit. Please wait and try again, or use another key.";
  } else if (status >= 500) {
    code = "GEMINI_TEMPORARY_FAILURE";
    publicStatus = 502;
    userMessage = "Gemini is temporarily unavailable. Please try again shortly.";
  }

  const detail = parsed.message || body || statusText || "Gemini request failed";
  return new GeminiApiError({
    message: `Gemini ${operation} error (${status}): ${detail}`,
    status: publicStatus,
    code,
    userMessage,
    retryAfterSeconds,
    retriable,
    operation,
  });
}

async function buildGeminiError(response, operation) {
  let body = "";
  try {
    body = await response.text();
  } catch {}
  return classifyGeminiError(
    response.status,
    body,
    response.statusText,
    parseRetryAfter(response.headers),
    operation
  );
}

function getRetryDelayMs(error, attempt) {
  if (error.retryAfterSeconds) {
    return Math.min(error.retryAfterSeconds * 1000, 15000);
  }
  const jitter = Math.floor(Math.random() * 250);
  return Math.min(750 * 2 ** attempt + jitter, 8000);
}

async function requestGemini(apiKey, url, init, {
  operation,
  timeoutMs = GEMINI_REQUEST_TIMEOUT_MS,
  retries = GEMINI_MAX_RETRIES,
} = {}) {
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          ...(init.headers || {}),
        },
      });

      if (response.ok) {
        return response;
      }

      lastError = await buildGeminiError(response, operation);
    } catch (err) {
      if (err?.name === "AbortError") {
        lastError = new GeminiApiError({
          message: `Gemini ${operation} timed out after ${timeoutMs}ms`,
          status: 504,
          code: "GEMINI_TIMEOUT",
          userMessage: "Gemini took too long to respond. Please try again.",
          retriable: true,
          operation,
        });
      } else if (err instanceof GeminiApiError) {
        lastError = err;
      } else {
        lastError = new GeminiApiError({
          message: `Gemini ${operation} network error: ${err?.message || err}`,
          status: 502,
          code: "GEMINI_NETWORK_ERROR",
          userMessage: "Could not reach Gemini. Please check the connection and try again.",
          retriable: true,
          operation,
        });
      }
    } finally {
      clearTimeout(timeout);
    }

    if (!lastError?.retriable || attempt >= retries) {
      throw lastError;
    }

    await sleep(getRetryDelayMs(lastError, attempt));
  }

  throw lastError;
}

export function fingerprintGeminiApiKey(apiKey) {
  const secret = process.env.GEMINI_ENCRYPTION_SECRET || "gemini-key-fingerprint";
  return crypto.createHmac("sha256", secret).update(String(apiKey)).digest("hex");
}

export function toPublicGeminiError(err) {
  if (err instanceof GeminiApiError) {
    return {
      status: err.status,
      body: {
        error: err.userMessage,
        code: err.code,
        retryAfter: err.retryAfterSeconds,
      },
    };
  }

  if (err?.status && err?.code && err?.userMessage) {
    return {
      status: err.status,
      body: {
        error: err.userMessage,
        code: err.code,
        retryAfter: err.retryAfterSeconds || null,
      },
    };
  }

  return {
    status: 500,
    body: {
      error: "Gemini request failed. Please try again.",
      code: "GEMINI_ERROR",
    },
  };
}

export async function validateGeminiApiKey(apiKey) {
  const cleanKey = String(apiKey || "").trim();
  if (cleanKey.length < 20 || cleanKey.length > 4096) {
    throw new GeminiApiError({
      message: "Gemini API key failed basic length validation.",
      status: 400,
      code: "GEMINI_INVALID_KEY_FORMAT",
      userMessage: "Please enter a valid Gemini API key.",
      operation: "key_validation",
    });
  }

  const url = `${GEMINI_API_BASE}/${GEMINI_MODEL}:generateContent`;
  await requestGemini(
    cleanKey,
    url,
    {
      method: "POST",
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: "Reply with OK." }] }],
        generation_config: { temperature: 0, max_output_tokens: 1 },
      }),
    },
    {
      operation: "key_validation",
      timeoutMs: GEMINI_KEY_VALIDATION_TIMEOUT_MS,
      retries: 0,
    }
  );

  return true;
}

const COVERAGE_MODES = new Set(["full-file", "file-section-coverage"]);

function isCoverageMode(mode) {
  return COVERAGE_MODES.has(String(mode || "").toLowerCase());
}

function countWords(text) {
  return String(text || "").match(/\b[\w'-]+\b/g)?.length || 0;
}

function countCoveredChunks(chunkScores, threshold = 0.12) {
  return (chunkScores || []).filter((score) => Number(score) >= threshold).length;
}

function buildExtractPrompt(chunks, mode = "limited") {
  const chunksText = chunks
    .map((chunk, idx) => `EVIDENCE ${idx + 1}:\n${chunk.text}`)
    .join("\n\n");
  const coverageInstruction = isCoverageMode(mode)
    ? `FULL-FILE COVERAGE MODE:
- You MUST process every EVIDENCE block from EVIDENCE 1 through EVIDENCE ${chunks.length}.
- Return facts grouped under headings "EVIDENCE 1 FACTS", "EVIDENCE 2 FACTS", etc.
- Do not stop after the definition or introduction. Later evidence blocks are equally important.`
    : "Return as a single numbered list.";

  return `You are an exact fact extractor. Extract EVERY distinct fact, claim, statement, detail, and data point from the EVIDENCE below. Do NOT summarize, combine, paraphrase, or omit anything. Preserve all numbers, names, lists, sub-items, and specific terminology exactly as written.

LIST HANDLING — READ CAREFULLY:
If you see a bulleted list (items starting with * or -) or a numbered list in the evidence, you MUST extract EACH list item as its OWN separate numbered entry. NEVER summarize a list using phrases like "such as" or "including" or "among others". Every single item in the source list must appear as a separate numbered fact in your output.

Return as a single numbered list. Each item must be one atomic fact or detail. Do not group related facts into one item — each fact gets its own number.

${coverageInstruction}

EVIDENCE:
${chunksText}

EXTRACTED FACTS:`;
}

function buildSynthesizePrompt({ question, factsText, chunks, targetTokens, mode }) {
  const coverageInstruction = isCoverageMode(mode)
    ? `FULL-FILE COVERAGE REQUIREMENT:
- This is a broad topic question. Do NOT write only a definition or introduction.
- Cover EVIDENCE 1 through EVIDENCE ${chunks.length} in order.
- Write at least ${chunks.length} substantial paragraphs, with coverage from every evidence block.
- Include all major sections present in the evidence: definition/introduction, physical geography, human geography, space/place and human activity, historical and modern human-environment relations, modern tools/digital geography, global challenges, and conclusion when present.
- If an evidence block contains a list, include each list item explicitly.`
    : "Cover the relevant facts completely.";

  return `QUESTION:\n${question}\n\nEXTRACTED FACTS:\n${factsText}\n\nYou are an extractive answer writer. Write a flowing answer using ONLY the EXTRACTED FACTS listed above. Do NOT add, infer, expand, or introduce any information not present in the extracted facts.

Rules:
${coverageInstruction}
- Use this exact answer structure:
  **Introduction:**
  **Body:**
  **Conclusion:**
- Put the main evidence coverage inside Body.
- Inside Body, use numbered bold evidence-based subheadings before related paragraphs, like **1. Physical Geography**.
- Choose subheadings only from themes actually present in the evidence, such as Physical Geography, Human Geography, Space and Place, Historical Human-Environment Relations, Modern Technologies, GIS, Remote Sensing, GPS, Global Challenges, Sustainable Resource Management, Disaster Risk Reduction, Urban Sprawl and Migration, Limitations, Way Forward, or Future Scope.
- Do not invent subheadings that are not supported by the evidence.
- Use clean Markdown bolding for headings only. Do not bold entire paragraphs.
- Target length: up to ${targetTokens || 3000} tokens. For full-file coverage, prefer complete coverage over brevity.
- Every sentence must be directly traceable to a fact in the list above.
- Cover ALL facts — do not skip any.
- NEVER use phrases like "such as" or "including" or "among others" to skip items. If the extracted facts contain a sequence of related items (like numbered list entries covering subfields, branches, tools, etc.), include EVERY single one explicitly in the answer.
- Weave related facts into smooth paragraphs, but preserve every detail.
- If multiple facts cover the same topic, group them together without dropping anything.`;
}

function buildDirectCoveragePrompt({ question, chunks, targetTokens }) {
  const chunkText = chunks
    .map((chunk, idx) => `EVIDENCE ${idx + 1}:\n${chunk.text}`)
    .join("\n\n");

  return `QUESTION:
${question}

REFERENCE EVIDENCE:
${chunkText}

You are writing a strict RAG answer using ONLY the reference evidence above.

MANDATORY FULL-FILE COVERAGE RULES:
- You must cover EVIDENCE 1 through EVIDENCE ${chunks.length}, in order.
- Use this exact answer structure:
  **Introduction:**
  **Body:**
  **Conclusion:**
- Put the main evidence coverage inside Body.
- Inside Body, use numbered bold evidence-based subheadings before related paragraphs, like **1. Physical Geography**.
- Choose subheadings only from themes actually present in the evidence, such as Physical Geography, Human Geography, Space and Place, Historical Human-Environment Relations, Modern Technologies, GIS, Remote Sensing, GPS, Global Challenges, Sustainable Resource Management, Disaster Risk Reduction, Urban Sprawl and Migration, Limitations, Way Forward, or Future Scope.
- Do not invent subheadings that are not supported by the evidence.
- Use clean Markdown bolding for headings only. Do not bold entire paragraphs.
- The Body must cover EVIDENCE 1 through EVIDENCE ${chunks.length}, in order.
- Do not stop after the definition/introduction.
- If an evidence block contains bullet/list items, include every item explicitly.
- Do not add any fact, example, institution, date, term, or explanation that is not present in the evidence.
- Do not use outside knowledge.
- Do not mention "Evidence", "Chunk", or paragraph numbers in the answer.
- Target length: use up to ${targetTokens || 3000} tokens. Prefer complete coverage over brevity.

The answer is incomplete unless it includes the later sections such as modern tools, GIS, Remote Sensing, GPS, global challenges, and conclusion when they appear in the evidence.`;
}

function cleanModelOutput(text) {
  return String(text || "")
    .replace(/^```(?:text|markdown)?\s*/i, "")
    .replace(/```$/i, "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function filterUnsupportedSentencesLexical(answer, chunks) {
  if (!answer || !chunks || chunks.length === 0) {
    return { filtered: answer, sentenceScores: [], chunkScores: [] };
  }

  const chunkTexts = chunks.map((c) => (c.text || "").toLowerCase());
  const combinedChunkText = chunkTexts.join(" ");

  const contentWords = new Set(
    combinedChunkText
      .split(/\s+/)
      .filter((w) => w.length > 3)
      .map((w) => w.replace(/[^a-z0-9]/g, ""))
      .filter(Boolean)
  );

  const paragraphs = answer.split(/\n\n+/);
  const allSentenceScores = [];
  const chunkOverlapCounts = new Array(chunks.length).fill(0);
  const chunkTotalUnique = new Array(chunks.length).fill(0);
  const chunkWordSets = chunkTexts.map((text) => {
    const words = text
      .split(/\s+/)
      .filter((w) => w.length > 3)
      .map((w) => w.replace(/[^a-z0-9]/g, ""))
      .filter(Boolean);
    return new Set(words);
  });

  const filteredParagraphs = [];

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    const sentences = trimmed.match(/[^.!?]+[.!?]+/g) || [trimmed];
    const kept = [];

    for (const sentence of sentences) {
      const s = sentence.trim();
      if (!s) continue;

      const words = s
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 3)
        .map((w) => w.replace(/[^a-z0-9]/g, ""))
        .filter(Boolean);

      if (words.length === 0) {
        kept.push(s);
        allSentenceScores.push({ sentence: s, score: 0, bestChunkId: "", verdict: "UNSUPPORTED" });
        continue;
      }

      const supported = words.filter((w) => contentWords.has(w));
      const ratio = supported.length / words.length;

      let bestChunkIdx = 0;
      let bestOverlap = 0;
      for (let i = 0; i < chunkWordSets.length; i++) {
        const overlap = words.filter((w) => chunkWordSets[i].has(w)).length;
        if (overlap > bestOverlap) {
          bestOverlap = overlap;
          bestChunkIdx = i;
        }
      }

      if (ratio >= 0.4 || words.length <= 2) {
        kept.push(s);
      }

      const lexicalScore = words.length > 0 ? Math.min(1, bestOverlap / words.length) : 0;
      allSentenceScores.push({
        sentence: s,
        score: Math.round(lexicalScore * 10000) / 10000,
        bestChunkId: String(bestChunkIdx),
        verdict: ratio >= 0.4 || words.length <= 2 ? "SUPPORTED" : "UNSUPPORTED",
      });

      if (bestOverlap > chunkOverlapCounts[bestChunkIdx]) {
        chunkOverlapCounts[bestChunkIdx] = bestOverlap;
      }
      chunkTotalUnique[bestChunkIdx] = Math.max(chunkTotalUnique[bestChunkIdx], words.length);
    }

    if (kept.length > 0) {
      filteredParagraphs.push(kept.join(" "));
    }
  }

  const chunkScores = chunks.map((_, i) => {
    if (chunkTotalUnique[i] === 0) return 0;
    return Math.round((chunkOverlapCounts[i] / Math.max(chunkTotalUnique[i], 1)) * 10000) / 10000;
  });

  return {
    filtered: filteredParagraphs.join("\n\n"),
    sentenceScores: allSentenceScores,
    chunkScores,
  };
}

async function filterUnsupportedSentencesSemantic(answer, chunks) {
  if (!answer || !chunks || chunks.length === 0) return { filtered: answer, sentenceScores: [], chunkScores: [] };

  const paragraphs = answer.split(/\n\n+/);
  const allResults = [];
  const allScores = [];

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    const sentences = trimmed.match(/[^.!?]+[.!?]+/g) || [trimmed];
    const trimmedSentences = sentences.map((s) => s.trim()).filter(Boolean);
    if (trimmedSentences.length === 0) continue;

    try {
      const payload = {
        sentences: trimmedSentences,
        chunks: chunks.map((c, i) => ({
          id: c.id || String(i),
          text: c.text || "",
        })),
        threshold: VERIFY_THRESHOLD,
      };

      const response = await axios.post(
        `${VECTOR_SERVER_URL}/verify`,
        payload,
        {
          timeout: VERIFY_TIMEOUT_MS,
          headers: { "x-api-key": VECTOR_API_KEY },
        }
      );

      const { results, chunkScores: paraChunkScores } = response.data;
      const kept = [];
      for (let i = 0; i < results.length; i++) {
        if (results[i].verdict === "SUPPORTED") {
          kept.push(trimmedSentences[i]);
        }
      }

      if (kept.length > 0) {
        allResults.push(kept.join(" "));
      }
      allScores.push({ scores: results, chunkScores: paraChunkScores });
    } catch (err) {
      console.warn("[gemini] Semantic verify failed, falling back to lexical filter:", err.message);
      const lexical = filterUnsupportedSentencesLexical(answer, chunks);
      return lexical;
    }
  }

  const chunkScores = new Array(chunks.length).fill(0);
  for (const item of allScores) {
    const scores = item.chunkScores || [];
    for (let i = 0; i < chunks.length; i += 1) {
      chunkScores[i] = Math.max(chunkScores[i], Number(scores[i] || 0));
    }
  }
  const sentenceScores = allScores.flatMap((s) => s.scores);

  return {
    filtered: allResults.join("\n\n"),
    sentenceScores,
    chunkScores,
  };
}

async function extractFactsFromChunks(apiKey, chunks, mode) {
  const extractPrompt = buildExtractPrompt(chunks, mode);
  const url = `${GEMINI_API_BASE}/${GEMINI_MODEL}:generateContent`;

  const response = await requestGemini(
    apiKey,
    url,
    {
      method: "POST",
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: "You are an exact fact extractor. Your only job is to extract facts verbatim without summarizing, combining, or omitting anything. In full-file coverage mode, you must extract facts from every evidence block, not only the first block." }],
        },
        contents: [{ role: "user", parts: [{ text: extractPrompt }] }],
        generation_config: { temperature: 0.0, max_output_tokens: 8192 },
      }),
    },
    { operation: "extract_facts" }
  );

  const data = await response.json();
  const facts = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  if (!facts) {
    throw new Error("Gemini returned empty facts during extraction step.");
  }

  console.log(`[gemini] Extract step — ${facts.length} chars, ${facts.split("\n").length} lines`);
  return facts;
}

export async function proxyGeminiCall(apiKey, options) {
  const { question, chunks, targetTokens, mode, onToken, onStatus } = options;

  let userPrompt;
  if (isCoverageMode(mode)) {
    onStatus?.("writing full-file coverage");
    userPrompt = buildDirectCoveragePrompt({
      question,
      chunks,
      targetTokens,
    });
  } else {
    onStatus?.("extracting");
    const extractedFacts = await extractFactsFromChunks(apiKey, chunks, mode);

    onStatus?.("writing");
    userPrompt = buildSynthesizePrompt({
      question,
      factsText: extractedFacts,
      chunks,
      targetTokens,
      mode,
    });
  }
  const url = `${GEMINI_API_BASE}/${GEMINI_MODEL}:streamGenerateContent?alt=sse`;

  const response = await requestGemini(
    apiKey,
    url,
    {
      method: "POST",
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: "You are an extractive answer writer. Write using ONLY the extracted facts provided below. Do NOT add, infer, or expand. Never introduce concepts, examples, dates, names, or explanations not in the extracted facts. Every sentence must be directly traceable to a specific extracted fact. If facts are insufficient, say only what the facts say and nothing more. In full-file coverage mode, you must cover every evidence block and must not stop after the introduction." }],
        },
        safety_settings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
        ],
        contents: [
          {
            role: "user",
            parts: [{ text: userPrompt }],
          },
        ],
        generation_config: {
          temperature: 0.0,
          top_p: 1,
          max_output_tokens: targetTokens > 0 ? targetTokens : 8192,
        },
      }),
    },
    { operation: "stream_answer" }
  );

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Gemini streaming not available.");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";
  let tokenCount = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data: ")) continue;
      const jsonStr = trimmed.slice(6).trim();
      if (!jsonStr || jsonStr === "[DONE]") continue;
      try {
        const data = JSON.parse(jsonStr);
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
        if (text) {
          fullText += text;
          onToken?.(cleanModelOutput(fullText));
        }
        if (data?.usageMetadata?.candidatesTokenCount) {
          tokenCount = data.usageMetadata.candidatesTokenCount;
        }
      } catch {}
    }
  }

  if (!fullText) {
    throw new Error("Gemini returned an empty response.");
  }

  const cleaned = cleanModelOutput(fullText);
  let { filtered, sentenceScores, chunkScores } = await filterUnsupportedSentencesSemantic(cleaned, chunks);

  if (isCoverageMode(mode)) {
    const semanticWords = countWords(filtered);
    const cleanedWords = countWords(cleaned);
    const semanticCoveredChunks = countCoveredChunks(chunkScores);
    const requiredCoveredChunks = Math.max(1, Math.ceil(chunks.length * 0.6));

    if (
      cleanedWords > 0 &&
      (semanticWords < Math.min(220, cleanedWords * 0.5) ||
        semanticCoveredChunks < requiredCoveredChunks)
    ) {
      const lexical = filterUnsupportedSentencesLexical(cleaned, chunks);
      const lexicalWords = countWords(lexical.filtered);
      const lexicalCoveredChunks = countCoveredChunks(lexical.chunkScores);

      if (
        lexicalWords > semanticWords &&
        lexicalCoveredChunks >= semanticCoveredChunks
      ) {
        filtered = lexical.filtered;
        sentenceScores = lexical.sentenceScores;
        chunkScores = lexical.chunkScores;
        console.warn(
          `[gemini] semantic verification trimmed full-file answer too much; using lexical grounded filter (${semanticWords}/${cleanedWords} words, chunks ${semanticCoveredChunks}/${chunks.length})`
        );
      }
    }
  }

  console.log(
    `[gemini] proxy — ${filtered.length} chars, ${tokenCount} tokens, filtered from ${cleaned.length}, sentences: ${sentenceScores.length}`
  );

  return {
    answer: filtered,
    tokenCount,
    sentenceScores,
    chunkScores,
  };
}
