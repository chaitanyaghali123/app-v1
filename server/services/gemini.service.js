import crypto from "crypto";

const ENCRYPTION_ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const ENVELOPE_ENCRYPTION_VERSION = 2;
const LOCAL_ENVELOPE_PROVIDER = "local-envelope";
const AWS_KMS_PROVIDER = "aws-kms";
let warnedWeakEncryptionSecret = false;
let awsKmsSdkPromise = null;
let awsKmsClient = null;

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

function encodeEncryptedBuffer(buffer, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [
    "gcm",
    iv.toString("base64url"),
    authTag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":");
}

function decodeEncryptedBuffer(encoded, key) {
  const parts = String(encoded || "").split(":");
  if (parts.length !== 4 || parts[0] !== "gcm") {
    throw new Error("Invalid envelope encrypted format");
  }
  const iv = Buffer.from(parts[1], "base64url");
  const authTag = Buffer.from(parts[2], "base64url");
  const encrypted = Buffer.from(parts[3], "base64url");
  const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

function normalizeEnvelopeProvider(provider) {
  const value = String(provider || "").trim().toLowerCase();
  if (value === "aws" || value === "aws_kms" || value === AWS_KMS_PROVIDER) {
    return AWS_KMS_PROVIDER;
  }
  if (value === "local" || value === "local_envelope" || value === LOCAL_ENVELOPE_PROVIDER) {
    return LOCAL_ENVELOPE_PROVIDER;
  }
  return LOCAL_ENVELOPE_PROVIDER;
}

function getConfiguredEnvelopeProvider() {
  return normalizeEnvelopeProvider(
    process.env.GEMINI_KEY_VAULT_PROVIDER ||
      process.env.GEMINI_KMS_PROVIDER ||
      LOCAL_ENVELOPE_PROVIDER
  );
}

function getAwsKmsKeyId() {
  return process.env.GEMINI_KMS_KEY_ID || process.env.AWS_KMS_KEY_ID || "";
}

function getAwsKmsEncryptionContext() {
  const appName = process.env.APP_NAME || "upsc-rag";
  return {
    app: appName,
    purpose: "gemini-byok",
  };
}

async function getAwsKmsSdk() {
  if (!awsKmsSdkPromise) {
    awsKmsSdkPromise = import("@aws-sdk/client-kms").catch((err) => {
      awsKmsSdkPromise = null;
      throw new Error(
        `AWS KMS provider requires @aws-sdk/client-kms to be installed: ${err.message}`
      );
    });
  }
  return awsKmsSdkPromise;
}

async function getAwsKmsClient() {
  if (!awsKmsClient) {
    const { KMSClient } = await getAwsKmsSdk();
    awsKmsClient = new KMSClient({
      region: process.env.AWS_REGION || process.env.GEMINI_KMS_REGION || "ap-south-1",
    });
  }
  return awsKmsClient;
}

async function generateEnvelopeDataKey() {
  const provider = getConfiguredEnvelopeProvider();

  if (provider === AWS_KMS_PROVIDER) {
    const keyId = getAwsKmsKeyId();
    if (!keyId) {
      throw new Error("GEMINI_KMS_KEY_ID or AWS_KMS_KEY_ID is required for AWS KMS key vault.");
    }

    const { GenerateDataKeyCommand } = await getAwsKmsSdk();
    const client = await getAwsKmsClient();
    const response = await client.send(
      new GenerateDataKeyCommand({
        KeyId: keyId,
        KeySpec: "AES_256",
        EncryptionContext: getAwsKmsEncryptionContext(),
      })
    );

    if (!response.Plaintext || !response.CiphertextBlob) {
      throw new Error("AWS KMS did not return a usable data key.");
    }

    return {
      dataKey: Buffer.from(response.Plaintext),
      encryptedDataKey: `aws-kms:${Buffer.from(response.CiphertextBlob).toString("base64")}`,
      encryptionProvider: AWS_KMS_PROVIDER,
      encryptionKeyId: keyId,
    };
  }

  const dataKey = crypto.randomBytes(KEY_LENGTH);
  return {
    dataKey,
    encryptedDataKey: encodeEncryptedBuffer(dataKey, getEncryptionKey()),
    encryptionProvider: LOCAL_ENVELOPE_PROVIDER,
    encryptionKeyId: null,
  };
}

async function decryptEnvelopeDataKey(record) {
  const provider = normalizeEnvelopeProvider(record.encryption_provider);
  const encryptedDataKey = String(record.encrypted_data_key || "");

  if (provider === AWS_KMS_PROVIDER || encryptedDataKey.startsWith("aws-kms:")) {
    const { DecryptCommand } = await getAwsKmsSdk();
    const client = await getAwsKmsClient();
    const encoded = encryptedDataKey.replace(/^aws-kms:/, "");
    const response = await client.send(
      new DecryptCommand({
        CiphertextBlob: Buffer.from(encoded, "base64"),
        EncryptionContext: getAwsKmsEncryptionContext(),
      })
    );
    if (!response.Plaintext) {
      throw new Error("AWS KMS did not return a plaintext data key.");
    }
    return Buffer.from(response.Plaintext);
  }

  return decodeEncryptedBuffer(encryptedDataKey, getEncryptionKey());
}

export function getGeminiKeyVaultStatus() {
  const provider = getConfiguredEnvelopeProvider();
  return {
    provider,
    envelopeVersion: ENVELOPE_ENCRYPTION_VERSION,
    kmsKeyConfigured: provider !== AWS_KMS_PROVIDER || Boolean(getAwsKmsKeyId()),
  };
}

export async function encryptGeminiApiKey(apiKey) {
  const envelope = await generateEnvelopeDataKey();
  const dataKey = envelope.dataKey;

  try {
    return {
      encryptedKey: encodeEncryptedBuffer(Buffer.from(apiKey, "utf8"), dataKey),
      encryptedDataKey: envelope.encryptedDataKey,
      encryptionVersion: ENVELOPE_ENCRYPTION_VERSION,
      encryptionProvider: envelope.encryptionProvider,
      encryptionKeyId: envelope.encryptionKeyId,
    };
  } finally {
    dataKey.fill(0);
  }
}

export async function decryptGeminiApiKeyRecord(record) {
  if (!record?.encrypted_key) {
    throw new Error("Missing encrypted Gemini key");
  }

  if (
    Number(record.encryption_version || 1) >= ENVELOPE_ENCRYPTION_VERSION &&
    record.encrypted_data_key
  ) {
    const dataKey = await decryptEnvelopeDataKey(record);
    try {
      return decodeEncryptedBuffer(record.encrypted_key, dataKey).toString("utf8");
    } finally {
      dataKey.fill(0);
    }
  }

  return decrypt(record.encrypted_key);
}

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";
const GEMINI_MODEL_FALLBACKS = String(
  process.env.GEMINI_MODEL_FALLBACKS || "gemini-3.5-flash-lite,gemini-3.6-flash"
)
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);
const GEMINI_MODEL_CHAIN = [...new Set([GEMINI_MODEL, ...GEMINI_MODEL_FALLBACKS].filter(Boolean))];
const GEMINI_MODEL_BUSY_STATUSES = new Set([429, 500, 502, 503, 504]);
const GEMINI_REQUEST_TIMEOUT_MS = Number(process.env.GEMINI_REQUEST_TIMEOUT_MS || 90000);
const GEMINI_KEY_VALIDATION_TIMEOUT_MS = Number(process.env.GEMINI_KEY_VALIDATION_TIMEOUT_MS || 15000);
const GEMINI_MAX_RETRIES = Math.max(0, Number(process.env.GEMINI_MAX_RETRIES || 2));
const GEMINI_THINKING_LEVEL = String(process.env.GEMINI_THINKING_LEVEL || "minimal").toLowerCase();
const GEMINI_THINKING_BUDGET = Number(process.env.GEMINI_THINKING_BUDGET ?? 0);

const RETRYABLE_GEMINI_STATUS_CODES = new Set([408, 409, 429, 500, 502, 503, 504]);

export function getGeminiModel() {
  return GEMINI_MODEL;
}

function getGeminiModelNameFromUrl(url) {
  return url.match(/models\/([^:?/]+)/)?.[1] || url;
}

function buildGeminiUrls(action) {
  return GEMINI_MODEL_CHAIN.map((model) => `${GEMINI_API_BASE}/${model}${action}`);
}

function getGeminiThinkingConfig() {
  const model = String(GEMINI_MODEL || "").toLowerCase();
  if (model === "gemini-2.0-flash-thinking" || model === "gemini-2.5-pro" || model.includes("gemini-3.")) {
    return { thinkingLevel: GEMINI_THINKING_LEVEL };
  }
  if (model.includes("gemini-2.5-flash")) {
    return { thinkingBudget: Number.isFinite(GEMINI_THINKING_BUDGET) ? GEMINI_THINKING_BUDGET : 0 };
  }
  return null;
}

function buildGeminiGenerationConfig({ maxOutputTokens, temperature = 0.0, topP = null }) {
  const config = {
    temperature,
    maxOutputTokens,
  };
  if (topP !== null && topP !== undefined) {
    config.topP = topP;
  }
  const thinkingConfig = getGeminiThinkingConfig();
  if (thinkingConfig) {
    config.thinkingConfig = thinkingConfig;
  }
  return config;
}

export class GeminiApiError extends Error {
  constructor({
    message,
    status = 500,
    code = "GEMINI_ERROR",
    userMessage = "Gemini request failed. Please try again.",
    retryAfterSeconds = null,
    retriable = false,
    operation = "gemini",
    originalError = null,
  }) {
    super(message);
    this.name = "GeminiApiError";
    this.status = status;
    this.code = code;
    this.userMessage = userMessage;
    this.retryAfterSeconds = retryAfterSeconds;
    this.retriable = retriable;
    this.operation = operation;
    this.originalError = originalError;
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

  if (
    combined.includes("api key not valid") ||
    combined.includes("invalid api key")
  ) {
    code = "GEMINI_INVALID_KEY";
    publicStatus = 401;
    userMessage = "This Gemini API key is invalid. Please check the key and save it again.";
  } else if (combined.includes("quota project")) {
    code = "GEMINI_BILLING_REQUIRED";
    publicStatus = 402;
    userMessage = "This Gemini key cannot be used because billing or API access is not enabled for its Google project.";
  } else if (combined.includes("quota") || combined.includes("rate limit")) {
    code = "GEMINI_QUOTA_EXCEEDED";
    publicStatus = 429;
    userMessage = "This Gemini key has reached its quota or rate limit. Please wait and try again, or use another key.";
  } else if (
    combined.includes("billing") ||
    combined.includes("payment")
  ) {
    code = "GEMINI_BILLING_REQUIRED";
    publicStatus = 402;
    userMessage = "This Gemini key cannot be used because billing or API access is not enabled for its Google project.";
  } else if (combined.includes("permission_denied")) {
    code = "GEMINI_PERMISSION_DENIED";
    publicStatus = 403;
    userMessage = "This Gemini key does not have permission to use the selected model. Enable Gemini API access or use another key.";
  } else if (status === 404) {
    code = "GEMINI_MODEL_NOT_FOUND";
    publicStatus = 502;
    userMessage = "The configured Gemini model is not available for this key or region.";
  } else if (status === 429) {
    code = "GEMINI_QUOTA_EXCEEDED";
    publicStatus = 429;
    userMessage = "This Gemini key has reached its quota or rate limit. Please wait and try again, or use another key.";
  } else if (status === 403) {
    code = "GEMINI_PERMISSION_DENIED";
    publicStatus = 403;
    userMessage = "This Gemini key does not have permission to use the selected model. Enable Gemini API access or use another key.";
  } else if (status === 402) {
    code = "GEMINI_BILLING_REQUIRED";
    publicStatus = 402;
    userMessage = "This Gemini key cannot be used because billing or API access is not enabled for its Google project.";
  } else if (status === 400) {
    code = "GEMINI_BAD_REQUEST";
    userMessage = "Gemini rejected this request. Please shorten the question or evidence and try again.";
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
    originalError: {
      httpStatus: status,
      apiCode: parsed.code,
      apiStatus: parsed.status,
      apiMessage: parsed.message,
    },
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
  const urls = Array.isArray(url) ? url : [url];
  let lastError;

  for (let modelIndex = 0; modelIndex < urls.length; modelIndex++) {
    const modelUrl = urls[modelIndex];

    for (let attempt = 0; attempt <= retries; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(modelUrl, {
          ...init,
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": apiKey,
            ...(init.headers || {}),
          },
        });

        if (response.ok) {
          console.log(
            `[gemini] ${operation} served by ${getGeminiModelNameFromUrl(modelUrl)} (attempt ${attempt + 1})`
          );
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
        break;
      }

      await sleep(getRetryDelayMs(lastError, attempt));
    }

    const isBusy = lastError && (GEMINI_MODEL_BUSY_STATUSES.has(lastError.status) || lastError.status >= 500);
    if (isBusy && modelIndex < urls.length - 1) {
      console.warn(
        `[gemini] ${operation} failed on ${getGeminiModelNameFromUrl(modelUrl)} (${lastError.status}), trying fallback model`
      );
      await sleep(500);
      continue;
    }

    throw lastError;
  }

  throw lastError;
}

export function fingerprintGeminiApiKey(apiKey) {
  const secret = process.env.GEMINI_ENCRYPTION_SECRET || "gemini-key-fingerprint";
  return crypto.createHmac("sha256", secret).update(String(apiKey)).digest("hex");
}

export function toPublicGeminiError(err) {
  const body = {
    code: err instanceof GeminiApiError ? err.code : "GEMINI_ERROR",
    retryAfter: err?.retryAfterSeconds || null,
  };

  if (err instanceof GeminiApiError && err.originalError) {
    body.httpStatus = err.originalError.httpStatus;
    body.apiCode = err.originalError.apiCode;
    body.apiStatus = err.originalError.apiStatus;
    body.apiMessage = err.originalError.apiMessage;
    body.error = err.userMessage;
  } else {
    body.error = err?.userMessage || "Gemini request failed. Please try again.";
  }

  if (err?.message && !body.apiMessage) {
    body.detail = err.message;
  }

  return {
    status: err instanceof GeminiApiError ? err.status : 500,
    body,
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

  const urls = buildGeminiUrls(":generateContent");
  await requestGemini(
    cleanKey,
    urls,
    {
      method: "POST",
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: "Reply with OK." }] }],
        generationConfig: buildGeminiGenerationConfig({
          temperature: 0,
          maxOutputTokens: 16,
        }),
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

function buildRagPrompt({ question, chunks, subjectId }) {
  if (!chunks || chunks.length === 0) {
    throw new Error("No evidence chunks provided to buildRagPrompt");
  }

  const chunkText = chunks
    .map((chunk, idx) => `EVIDENCE ${idx + 1}:\n${chunk.text.trim()}`)
    .join("\n\n");

  const chunkSummaries = chunks
    .map((chunk, idx) => {
      const headings = (chunk.text.match(/##\s+(.+)/g) || []).map(h => h.replace(/^##\s+/, "").trim());
      const bullets = (chunk.text.match(/\*\s+\*\*([^:]+):\*\*/g) || []).map(b => b.replace(/^\*\s+\*\*:?/, "").replace(/:?\*\*$/, "").trim());
      const parts = [];
      if (headings.length) parts.push("headings: " + headings.join(", "));
      if (bullets.length) parts.push("topics: " + bullets.join(", "));
      return `EVIDENCE ${idx + 1} MUST cover: ${parts.length ? parts.join("; ") : "(general content from this chunk)"}`;
    })
    .join("\n");

  return `
You are an expert UPSC Mains AI Tutor for ${(subjectId || "general studies").toUpperCase()}. Structure your response using clean, natural Markdown.

CRITICAL RULES - VIOLATION IS FORBIDDEN:
1. YOU MUST NOT use ANY external knowledge, training data, or information not in the evidence.
2. EVERY fact, date, name, concept, and detail MUST come directly from the evidence chunks.
3. If evidence is insufficient or missing key information, you MUST state: "Insufficient evidence in provided chunks."
4. NEVER guess, infer, or add information that is not explicitly stated in the evidence.
5. NEVER use general knowledge about India, history, geography, or any topic.
6. If you are uncertain about any detail, omit it or state the uncertainty.
7. NEVER add generic summary sections like "Summary of ..." or "Overview of ...".
8. NEVER add blockquote callouts like "> UPSC Mains Takeaway" or "> UPSC Exam Takeaway". Answer directly without generic wrapper sections.

WORKFLOW — FOLLOW THESE TWO STEPS IN ORDER:
STEP 1 (EXTRACT): Read EVERY evidence chunk, one by one. From each chunk, extract a complete list of facts: names, dates, definitions, concepts, examples, and key points. Do this for ALL chunks INCLUDING the later ones — never stop at the first chunks. Silently build this fact list (do not output it).
STEP 2 (WRITE): Using ONLY the facts extracted in Step 1, write the final answer. Every sentence must trace back to a fact from Step 1. Structure the answer as:
  - **Introduction**: \`## **Introduction**\` heading, states the question's theme using extracted facts.
  - **Body**: bold major subheadings \`## **<Theme>**\` created ONLY from themes present in the evidence — copy each section heading VERBATIM from the evidence but STRIP any leading numbering (e.g. "10.4.3 💵💵Paper Money" becomes "💵💵Paper Money", "1. Physical Geography" becomes "Physical Geography") and adding NO numbers of your own. Sub-sections use \`### **<Sub-theme>**\` and are NOT numbered. Under each, mirror the evidence's structure: use bullet points (*) only where the evidence itself uses bullets (never numbered lists, never invent bold sub-labels inside bullets); write evidence prose as plain paragraphs without bullets.
  - **Conclusion**: \`## **Conclusion**\` heading, restates the key extracted points.
Cover ALL evidence chunks, including the LATER sections — the answer must not stop early or omit the final chunks' content.

FORMATTING RULES:
1. Use Markdown ATX headers with the heading text BOLDED inside the header: \`## **Introduction**\`, \`## **<Section Theme>**\`, and \`## **Conclusion**\` for major sections; use \`### **<Sub-theme>**\` for sub-sections. COPY every section heading VERBATIM from the evidence but STRIP any leading number (e.g. evidence heading \`## 1. Physical Geography\` becomes \`## **Physical Geography**\`, evidence heading \`## 10.4.3 💵💵Paper Money\` becomes \`## **💵💵Paper Money**\`). NEVER keep source numbers in headings, NEVER add numbers to headings that are unnumbered in the evidence, NEVER renumber or reorder sections, and NEVER number the sub-sections (no 1.1, 2.1 prefixes). NEVER use plain unbolded headers (e.g. \`## 1. ...\` or \`## Introduction\`), and NEVER use a bold line without a Markdown \`#\` header as a heading. Do NOT write literal "Introduction:", "Body:", "Conclusion:" labels.
2. Use Markdown blockquotes (> ) only for direct quotes or definitions from the evidence. Never use blockquotes for generic summaries or takeaway callouts.
3. Do NOT add citations of any kind — no [EVIDENCE X], no [1]/[2], no footnotes. Write facts as plain sentences.
4. Bold key terms and keywords essential for UPSC answers.
5. Use bullet points (lines starting with \`* \`) ONLY for content that is a bulleted list in the evidence — for those, never use numbered lists (1., 2., 3.). When the evidence presents content as plain prose/paragraphs, write it as plain sentences and paragraphs — do NOT turn prose into bullets.
6. If the evidence contains an ASCII/box diagram (usually inside a \`\`\`text block), COPY it character-for-character into a \`\`\`text block in your answer. Reproduce EVERY character EXACTLY: all box-drawing characters (─, │, ┌, ┐, └, ┘, ├, ┤, ▼), the leading indentation/spaces, the inner padding/spacing, and the labels. Do NOT re-indent, re-center, re-pad, trim spaces, or reformat the diagram in any way. Place the diagram as a STANDALONE block: leave a blank line before the opening \`\`\`text fence, put the opening fence on its own line, the diagram lines after it, then the closing \`\`\` fence on its own line followed by a blank line. Do NOT attach the fence to a bullet, heading, sentence, or citation.
7. Body subheadings MUST be created ONLY from themes that are actually present in the evidence chunks (e.g. topics listed in the chunk summaries above). NEVER invent headings like "Limitations", "Challenges", "Future Scope", "Way Forward", "Government Initiatives", "Impact", "Criticism", etc., unless that theme explicitly appears in the evidence. If the evidence does not contain a theme, do NOT create a heading for it.
8. NEVER create any sub-heading on your own. \`### **<Sub-theme>**\` sub-sections may ONLY be created from headings that literally appear in the evidence (e.g. "Physical Geography", "Human Geography", "Sustainable Resource Management", "Disaster Risk Reduction", "Urban Sprawl and Migration" when present in the evidence). When reusing an evidence heading as a sub-section heading, copy it VERBATIM but STRIP any leading number (e.g. evidence heading \`### 10.5.1 Iran\` becomes \`### **Iran**\`), never keep a source number in the heading, and never combine it with a number of your own (never "2. Iran"). NEVER create sub-subheadings or bold label prefixes inside bullets (e.g. "Resource Mapping:", "Policy Application:", "Hazard vs. Disaster:", "Urbanization Challenges:") unless the evidence literally contains such a label. Write bullet content as plain sentences. Use at most two heading levels (## and ###) — never a third level, and never turn bullet text into heading-like bold labels. Each distinct major section from the evidence must appear as its own \`##\` section in order — never fold a major evidence section inside another section as a sub-section.
9. NEVER use LaTeX math syntax for code, HTML tags, or any content — never output \`$$\` or \`\$\$...\$\$\`, \`\\(...\\)\`, \`\\text{...}\`, \`\\langle\`, \`\\rangle\`, \`\\longrightarrow\`, or any other LaTeX command. Write HTML tags, code, and symbols as plain text (e.g. write \`<ol><li>Item</li></ol>\` directly) or inside \`\`\` code fences. If you need arrows, write →; if you need math symbols, use Unicode (×, ≤, ≥, ≈, ≠).
10. Separate every heading and paragraph with a blank line. Every heading (\`##\`/\`###\`), bullet (\`* \`), numbered item (\`1. \`), and code fence must begin on its own fresh line — never run a heading or list item directly onto the end of the previous paragraph.

MANDATORY COVERAGE — YOU MUST INCLUDE CONTENT FROM EVERY EVIDENCE CHUNK:
${chunkSummaries}

QUESTION:
${question}

EVIDENCE CHUNKS:
${chunkText}
`;
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

function cleanModelOutput(text) {
  let out = String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .replace(/^#{1,6}\s+\*\*\s*\d+\.\s*Conclusion\s*\*\*\s*$/gim, "## **Conclusion**")
    .replace(/^#{1,6}\s+\d+\.\s*Conclusion\s*$/gim, "## **Conclusion**")
    .replace(/^#{1,6}\s+\*\*\s*\d+\.\s*\d+\.\s+([^*\n]+?)\s*\*\*\s*$/gim, "### **$1**")
    .replace(/^#{1,6}\s+\d+\.\s*\d+\.\s+([^\n]+?)\s*$/gim, "### $1");

  const isFullyFenced = /^```[\w-]*\s*[\s\S]*?```$/i.test(out);
  if (isFullyFenced) {
    out = out.replace(/^```[\w-]*\s*/i, "").replace(/```$/i, "");
  }

  const segments = out.split("```");
  const cleaned = segments.map((seg, idx) => {
    if (idx % 2 === 1) return seg;
    return collapseOutsideDiagrams(seg);
  });
  return alignDiagramIndentation(normalizeFenceBlocks(fenceDiagrams(cleaned.join("```"))).trim());
}

function diceCoefficient(a, b) {
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  if (a === b) return 1;
  const bigrams = new Map();
  for (let i = 0; i < a.length - 1; i++) {
    const bg = a.slice(i, i + 2);
    bigrams.set(bg, (bigrams.get(bg) || 0) + 1);
  }
  let overlap = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const bg = b.slice(i, i + 2);
    const n = bigrams.get(bg) || 0;
    if (n > 0) {
      bigrams.set(bg, n - 1);
      overlap++;
    }
  }
  return (2 * overlap) / (a.length - 1 + b.length - 1);
}

function extractTextFenceBlocks(text) {
  const blocks = [];
  const re = /```text\s*\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(text))) blocks.push(m[1]);
  return blocks;
}

function restoreExactDiagrams(answer, chunks) {
  const text = String(answer || "");
  if (!text.includes("```text") || !chunks?.length) return text;
  const sources = [];
  for (const chunk of chunks) {
    for (const b of extractTextFenceBlocks(String(chunk?.text || chunk?.content || ""))) {
      sources.push({ content: b.replace(/\r\n/g, "\n"), key: b.replace(/\s+/g, "") });
    }
  }
  if (sources.length === 0) return text;

  const re = /```text\s*\n([\s\S]*?)```/g;
  return text.replace(re, (match, content) => {
    const aKey = content.replace(/\s+/g, "");
    let best = null;
    for (const s of sources) {
      const sim = diceCoefficient(aKey, s.key);
      if (sim >= 0.85 && (best === null || sim > best.sim)) best = { sim, content: s.content };
    }
    if (best && best.content !== content.replace(/\r\n/g, "\n")) {
      return "```text\n" + best.content + "```";
    }
    return match;
  });
}

export async function proxyGeminiCall(apiKey, options) {
  const { question, chunks, targetTokens, mode, onToken, onStatus } = options;

  onStatus?.("writing strict RAG answer");
  const subjectId = options.subjectId || (chunks?.[0]?.subject_id) || null;
  const userPrompt = buildRagPrompt({ question, chunks, subjectId });
  const url = buildGeminiUrls(":streamGenerateContent?alt=sse");
  const maxOutputTokens = targetTokens > 0 ? Math.min(targetTokens + 4096, 65536) : 8192;
  const generationConfig = buildGeminiGenerationConfig({
    temperature: 0.0,
    topP: 1,
    maxOutputTokens,
  });
  console.log(
    `[gemini] request config: mode=${mode || "limited"}, chunks=${chunks.length}, maxOutputTokens=${maxOutputTokens}, thinking=${JSON.stringify(generationConfig.thinkingConfig || null)}`
  );

  const response = await requestGemini(
    apiKey,
    url,
    {
      method: "POST",
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: "You are a STRICT RAG answer engine. WORKFLOW: STEP 1 (EXTRACT) — read EVERY evidence chunk and extract all facts (names, dates, definitions, concepts, examples) from ALL chunks INCLUDING the later ones; never stop at the first chunks. STEP 2 (WRITE) — using ONLY the extracted facts, write the answer as: \`## **Introduction**\` (Markdown header with bold text inside), bold major headings \`## **<Theme>**\` for the Body created ONLY from themes present in the evidence — copy each heading VERBATIM from the evidence, STRIPPING any leading number (e.g. '10.4.3 💵💵Paper Money' becomes '💵💵Paper Money', '1. Physical Geography' becomes 'Physical Geography') and never adding numbers of your own — and \`## **Conclusion**\`. Never number the sub-sections — sub-sections use \`### **<Sub-theme>**\` with no 1.1, 2.1 prefixes. Inside sections, mirror the evidence's structure: use bullet points (*) only where the evidence itself uses bullets — never numbered lists (1., 2., 3.) — and write evidence prose as plain paragraphs without bullets. Cover EVERY chunk including the later sections — do not stop early. RULES: 1) NEVER use external knowledge. 2) EVERY fact MUST come from evidence chunks. 3) Do NOT add citations of any kind — no [EVIDENCE X], no [1]/[2], no footnotes; write facts as plain sentences. 4) You MUST cover ALL chunks — the prompt lists what each chunk contains. 5) If any chunk is missing from your answer, it is INVALID. 6) Never guess or infer. 7) If evidence is insufficient, say 'Insufficient evidence.' 8) Body subheadings MUST come ONLY from themes present in the evidence — NEVER invent 'Limitations', 'Challenges', 'Future Scope', 'Way Forward', 'Government Initiatives', 'Impact', 'Criticism' unless explicitly in the evidence. NEVER create any sub-heading on your own: ### sub-sections may only come from headings that literally appear in the evidence; when reusing an evidence heading, copy it VERBATIM but STRIP any leading number (e.g. '10.5.1 Iran' becomes 'Iran', '1. Physical Geography' becomes 'Physical Geography') — never keep a source number and never add a number of your own (never '## **2. 1. Physical Geography**'). Never create bold label prefixes inside bullets (like 'Resource Mapping:', 'Policy Application:') unless the evidence literally contains them — write bullets as plain sentences. Use at most two heading levels (## and ###). Each distinct major section from the evidence must appear as its own numbered ## section — never fold a major evidence section inside another as a sub-section. 9) If the evidence contains an ASCII/box diagram inside a ```text block, COPY it character-for-character into a ```text block in your answer — reproduce EVERY character EXACTLY: every box-drawing character (─, │, ┌, ┐, └, ┘, ├, ┤, ▼), the leading indentation/spaces, inner padding, and labels. Do NOT re-indent, re-center, re-pad, trim spaces, or reformat. Place it as a STANDALONE block: blank line before the opening fence, opening \`\`\`text fence on its own line, diagram lines, closing \`\`\` fence on its own line, blank line after. Do NOT attach the fence to a bullet, heading, sentence, or citation. Before finishing, mentally check each EVIDENCE N was covered. NEVER use LaTeX math syntax (\`$$\` or \`$$...$$\`, \`\\(...\\)\`, \`\\text{...}\`, \`\\langle\`, \`\\rangle\`, \`\\longrightarrow\`) for code or HTML — write HTML tags and code as plain text, e.g. <ol><li>Item</li></ol>. Separate every heading and paragraph with a blank line; every heading, bullet (*), numbered item (1.), and code fence must begin on its own fresh line." }],
        },
        safetySettings: [
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
        generationConfig,
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
  let finishReason = "";
  let promptTokenCount = 0;
  let thoughtTokenCount = 0;
  let totalTokenCount = 0;
  const processStreamLine = (line) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data: ")) return;
    const jsonStr = trimmed.slice(6).trim();
    if (!jsonStr || jsonStr === "[DONE]") return;
    try {
      const data = JSON.parse(jsonStr);
      const parts = data?.candidates?.[0]?.content?.parts || [];
      const text = parts.map((part) => part?.text || "").join("");
      if (text) {
        fullText += text;
        onToken?.(restoreExactDiagrams(cleanModelOutput(fullText), chunks));
      }
      const usage = data?.usageMetadata || {};
      if (usage.candidatesTokenCount) {
        tokenCount = usage.candidatesTokenCount;
      }
      if (usage.promptTokenCount) {
        promptTokenCount = usage.promptTokenCount;
      }
      if (usage.thoughtsTokenCount) {
        thoughtTokenCount = usage.thoughtsTokenCount;
      }
      if (usage.totalTokenCount) {
        totalTokenCount = usage.totalTokenCount;
      }
      if (data?.candidates?.[0]?.finishReason) {
        finishReason = data.candidates[0].finishReason;
      }
      if (data?.promptFeedback?.blockReason) {
        console.error("[gemini] stream blocked:", data.promptFeedback.blockReason, data.promptFeedback.safetyRatings);
      }
    } catch (parseErr) {
      console.error("[gemini] stream parse error on line:", trimmed.slice(0, 200), parseErr.message);
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) processStreamLine(line);
  }

  buffer += decoder.decode();
  if (buffer.trim()) {
    for (const line of buffer.split("\n")) processStreamLine(line);
  }

  if (!fullText) {
    throw new Error("Gemini returned an empty response.");
  }

  const cleaned = restoreExactDiagrams(cleanModelOutput(fullText), chunks);

  if (finishReason && finishReason !== "STOP") {
    if (finishReason === "MAX_TOKENS" && cleaned.length > 0) {
      console.warn(`[gemini] answer truncated at MAX_TOKENS (${tokenCount} output tokens), returning partial answer`);
      return {
        answer: `${cleaned}\n\n_[Answer truncated — Gemini hit its token limit while writing. Ask again with a more specific question.]_`,
        tokenCount,
      };
    }
    throw new GeminiApiError({
      message: `Gemini stopped before completing the answer: ${finishReason}`,
      status: 502,
      code: "GEMINI_INCOMPLETE_RESPONSE",
      userMessage: `Gemini stopped before completing the answer (${finishReason}). Please try again.`,
      retriable: true,
      operation: "stream_answer",
    });
  }

  if (finishReason) {
    console.log(`[gemini] finish reason: ${finishReason}, tokens: ${promptTokenCount}+${tokenCount} (thoughts: ${thoughtTokenCount})`);
  }
  console.log(
    `[gemini] usage: prompt=${promptTokenCount || "unknown"}, output=${tokenCount || "unknown"}, thoughts=${thoughtTokenCount || 0}, total=${totalTokenCount || "unknown"}, maxOutputTokens=${maxOutputTokens}`
  );
  console.log(
    `[gemini] proxy — ${cleaned.length} chars, ${tokenCount} tokens`
  );

  return {
    answer: cleaned,
    tokenCount,
  };
}
