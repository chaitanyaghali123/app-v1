import crypto from "crypto";
import { verifyGrounding } from "./grounding.service.js";
import { orderChunksBySourceProximity, formatEvidenceChunks } from "./evidence-hierarchy.service.js";

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
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
const GEMINI_MODEL_FALLBACKS = String(
  process.env.GEMINI_MODEL_FALLBACKS || ""
)
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);
const GEMINI_MODEL_CHAIN = [...new Set([GEMINI_MODEL, ...GEMINI_MODEL_FALLBACKS].filter(Boolean))];
const GEMINI_MODEL_BUSY_STATUSES = new Set([429, 500, 502, 503, 504]);
const GEMINI_REQUEST_TIMEOUT_MS = Number(process.env.GEMINI_REQUEST_TIMEOUT_MS || 90000);
const GEMINI_KEY_VALIDATION_TIMEOUT_MS = Number(process.env.GEMINI_KEY_VALIDATION_TIMEOUT_MS || 15000);
const GEMINI_MAX_RETRIES = Math.max(0, Number(process.env.GEMINI_MAX_RETRIES || 1));
const GEMINI_THINKING_LEVEL = String(process.env.GEMINI_THINKING_LEVEL || "minimal").toLowerCase();
const GEMINI_THINKING_BUDGET = Number(process.env.GEMINI_THINKING_BUDGET ?? 0);

const RETRYABLE_GEMINI_STATUS_CODES = new Set([408, 409, 429, 500, 502, 503, 504]);

const GEMINI_MODEL_BUSY_COOLDOWN_MS = Number(process.env.GEMINI_MODEL_BUSY_COOLDOWN_MS || 60000);
const modelBusySince = new Map();

export function getGeminiModel() {
  return GEMINI_MODEL;
}

function getGeminiModelNameFromUrl(url) {
  return url.match(/models\/([^:?/]+)/)?.[1] || url;
}

function noteModelBusy(modelUrl) {
  modelBusySince.set(getGeminiModelNameFromUrl(modelUrl), Date.now());
}

function buildGeminiUrls(action) {
  const now = Date.now();
  const ordered = [...GEMINI_MODEL_CHAIN].sort((a, b) => {
    const activeA = modelBusySince.get(a);
    const activeB = modelBusySince.get(b);
    const coolingA = activeA && now - activeA < GEMINI_MODEL_BUSY_COOLDOWN_MS ? activeA : -Infinity;
    const coolingB = activeB && now - activeB < GEMINI_MODEL_BUSY_COOLDOWN_MS ? activeB : -Infinity;
    return coolingA - coolingB;
  });
  return ordered.map((model) => `${GEMINI_API_BASE}/${model}${action}`);
}

function getGeminiThinkingConfig() {
  if (process.env.GEMINI_THINKING_ENABLED === "false") {
    return null;
  }
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
  let isRetriable = retriable;

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
  } else if (
    combined.includes("quota exceeded") ||
    combined.includes("quota metric") ||
    combined.includes("resource_exhausted") ||
    combined.includes("usage quota") ||
    combined.includes("daily request limit") ||
    combined.includes("daily token limit") ||
    combined.includes("quota for quota")
  ) {
    code = "GEMINI_QUOTA_EXCEEDED";
    publicStatus = 429;
    isRetriable = false;
    userMessage = "This Gemini API key has reached its usage quota. Please use another key or wait for the quota to reset.";
  } else if (
    combined.includes("rate limit") ||
    combined.includes("rate_limit") ||
    combined.includes("ratelimited") ||
    combined.includes("too many requests") ||
    combined.includes("throttl") ||
    combined.includes("slow down")
  ) {
    code = "GEMINI_RATE_LIMITED";
    publicStatus = 429;
    userMessage = "Gemini is temporarily rate-limiting this key. Please try again in a moment.";
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
    code = "GEMINI_RATE_LIMITED";
    publicStatus = 429;
    userMessage = "Gemini is temporarily rate-limiting this key. Please try again in a moment.";
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
    retriable: isRetriable,
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

function readStreamWithDeadline(reader, controller, deadlineMs) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => controller.abort(), Math.max(0, deadlineMs - Date.now()));
    reader.read().then(
      (chunk) => {
        clearTimeout(timer);
        resolve({ timedOut: false, chunk });
      },
      (err) => {
        clearTimeout(timer);
        if (err?.name === "AbortError") {
          resolve({ timedOut: true });
        } else {
          resolve({ timedOut: false, error: err });
        }
      }
    );
  });
}

const GEMINI_LAST_MODEL_PATIENCE_MS = Number(
  process.env.GEMINI_LAST_MODEL_PATIENCE_MS || 30000
);
// Streaming timing. These three values cannot be tuned independently:
//   headerMs = min(HEADER, TTFT)
//   first token must land by attemptStart + TTFT
//   attempt ends at attemptStart + ATTEMPT
// All deadlines are absolute from the start of a model attempt, so raising TTFT
// without also raising ATTEMPT silently shortens the window left for generation.
// ATTEMPT - TTFT is the generation budget, so the defaults below keep that at 20s
// while giving Gemini 10s to start streaming, which a ~10k-char evidence prompt can
// legitimately need. At 4s/5s/20s both models aborted on header timeout before
// producing anything, surfacing "Gemini took too long to respond".
const GEMINI_STREAM_TTFT_TIMEOUT_MS = Number(process.env.GEMINI_STREAM_TTFT_TIMEOUT_MS || 10000);
const GEMINI_STREAM_ATTEMPT_TIMEOUT_MS = Number(process.env.GEMINI_STREAM_ATTEMPT_TIMEOUT_MS || 30000);
const GEMINI_STREAM_HEADER_TIMEOUT_MS = Number(process.env.GEMINI_STREAM_HEADER_TIMEOUT_MS || 10000);
// Minimum characters required to treat a timed-out stream as a usable partial
// answer rather than surfacing an error. Below this we have too little content
// to show the user, so a clean error is the better outcome.
const MIN_USABLE_PARTIAL_CHARS = Number(process.env.GEMINI_MIN_USABLE_PARTIAL_CHARS || 200);
// TEST-ONLY hook. When set, it shortens the per-attempt generation budget so
// the timeout/recovery path can be exercised deterministically without waiting
// for real upstream degradation. Never set in production.
const GEMINI_TEST_ABORT_AFTER_MS = process.env.GEMINI_TEST_ABORT_AFTER_MS
  ? Number(process.env.GEMINI_TEST_ABORT_AFTER_MS)
  : 0;

async function requestGemini(apiKey, url, init, {
  operation,
  timeoutMs = GEMINI_REQUEST_TIMEOUT_MS,
  retries = GEMINI_MAX_RETRIES,
  patienceMs = GEMINI_LAST_MODEL_PATIENCE_MS,
} = {}) {
  const urls = Array.isArray(url) ? url : [url];
  let lastError;

  for (let modelIndex = 0; modelIndex < urls.length; modelIndex++) {
    const modelUrl = urls[modelIndex];
    const isLastModel = modelIndex === urls.length - 1;
    const patienceDeadline = isLastModel
      ? Date.now() + patienceMs
      : null;

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
          response._geminiModel = getGeminiModelNameFromUrl(modelUrl);
          console.log(
            `[gemini] ${operation} served by ${response._geminiModel} (attempt ${attempt + 1})`
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

      if (!lastError?.retriable) {
        break;
      }

      const busyWithFallback =
        modelIndex < urls.length - 1 &&
        lastError &&
        (GEMINI_MODEL_BUSY_STATUSES.has(lastError.status) || lastError.status >= 500);
      if (busyWithFallback) {
        noteModelBusy(modelUrl);
        break;
      }

      if (isLastModel && patienceDeadline && Date.now() < patienceDeadline) {
        const wait = getRetryDelayMs(lastError, attempt);
        if (Date.now() + wait <= patienceDeadline) {
          await sleep(wait);
          continue;
        }
        break;
      }

      if (attempt >= retries) {
        break;
      }

      await sleep(getRetryDelayMs(lastError, attempt));
    }

    const isBusy = lastError && (GEMINI_MODEL_BUSY_STATUSES.has(lastError.status) || lastError.status >= 500);
    if (isBusy && modelIndex < urls.length - 1) {
      noteModelBusy(modelUrl);
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

function detectWordLimit(question, subjectId) {
  const ids = Array.isArray(subjectId)
    ? subjectId
    : String(subjectId || "")
        .split(/[,\s]+/)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);

  const idSet = new Set(ids);
  if (idSet.has("essay")) return 1300;
  return 600;
}

function countWords(text) {
  const t = String(text || "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_`]/g, "")
    .replace(/^\s*(?:[-•*]|\d+\.)\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
  return t ? t.split(" ").filter(Boolean).length : 0;
}

function clampAnswerToLimit(text, wordLimit) {
  const src = String(text || "");
  const limit = Number(wordLimit);
  if (!src.trim() || !Number.isFinite(limit) || limit <= 0) return src.trim();

  // Walk the original string instead of a whitespace-split copy. "\s" matches
  // newlines, so splitting on it and rejoining with " " returned the entire answer
  // as a single line with every "## Heading" flattened into the prose around it.
  // That only surfaced on the runs where the answer exceeded the word limit, which
  // is why it looked intermittent. Slicing the source preserves headings, paragraph
  // breaks and blank lines.
  let end = 0;
  let boundary = -1;
  let words = 0;
  let i = 0;
  while (words < limit) {
    while (i < src.length && /\s/.test(src[i])) i++;
    if (i >= src.length) break;
    const start = i;
    while (i < src.length && !/\s/.test(src[i])) i++;
    words++;
    end = i;
    if (/[.!?]["')\]*]{0,2}$/.test(src.slice(start, i))) boundary = i;
  }
  return src.slice(0, boundary >= 0 ? boundary : end).trim();
}

// Finish reasons that end generation for content reasons rather than a budget or
// network problem. Generation up to this point is valid and shown to the user.
const SAFETY_FINISH_REASONS = new Set([
  "SAFETY",
  "RECITATION",
  "BLOCKLIST",
  "PROHIBITED_CONTENT",
  "SPII",
]);

// The frame is Introduction -> dimensions -> Conclusion, and the model reaches
// for a Conclusion most of the time but not reliably: four of five recent runs
// ended without one, and one left a bare "4." with no body under it. Prompt text
// alone has not fixed it, so repair the structure before returning.
//
// This relabels existing prose and drops empty headings. It never writes a
// sentence, because inventing a closing synthesis would breach SOURCE-LOCK - the
// conclusion must be the model's own words, so the best available repair is to
// promote the paragraph the model already wrote as its closing argument.
function ensureFrameStructure(text) {
  const src = String(text || "");
  if (!src.trim()) return { text: src, repaired: false };

  const lines = src.split("\n");
  const isHeading = (l) => /^#{1,6}\s+\S/.test(l);
  const headingIndexes = [];
  lines.forEach((l, i) => {
    if (isHeading(l)) headingIndexes.push(i);
  });
  if (headingIndexes.length < 2) return { text: src, repaired: false };

  // Drop a heading with nothing under it: any heading whose next non-blank line
  // is another heading or nothing at all. A trailing bare "4." is the common case.
  const drop = new Set();
  headingIndexes.forEach((idx, n) => {
    const nextHeading = headingIndexes[n + 1];
    const end = nextHeading != null ? nextHeading : lines.length;
    let hasBody = false;
    for (let j = idx + 1; j < end; j++) {
      const t = lines[j].trim();
      if (t) { hasBody = true; break; }
    }
    if (!hasBody) drop.add(idx);
  });

  let out = lines.filter((_, i) => !drop.has(i));
  let repaired = drop.size > 0;

  const headingText = (l) =>
    l.replace(/^#{1,6}\s+/, "").replace(/\*\*/g, "").trim();

  const hasConclusion = out.some((l) => isHeading(l) && /conclusion/i.test(headingText(l)));
  const hasIntroduction = out.some((l) => isHeading(l) && /introduction/i.test(headingText(l)));
  const remaining = out.filter((l) => isHeading(l));

  // Only repair an answer that clearly follows the frame. Anything else - a bare
  // list, a short factual answer - is left exactly as written.
  if (!hasConclusion && hasIntroduction && remaining.length >= 2) {
    const lastHeadingIdx = out.map((l, i) => (isHeading(l) ? i : -1)).filter((i) => i >= 0).pop();
    let blockStart = -1;
    for (let j = lastHeadingIdx + 1; j < out.length; j++) {
      if (out[j].trim()) { blockStart = j; break; }
    }
    // Title the closing paragraph ONLY when it actually reads as a conclusion.
    // Retitling the last dimension's own body would steal that dimension's prose
    // and leave it orphaned, which is worse than the missing heading. A synthesising
    // opener is the evidence that the model meant this block as its close.
    const closingPara = blockStart > -1 ? out[blockStart].trim() : "";
    const readsAsConclusion = /^(thus|therefore|in conclusion|to conclude|hence|overall|in sum|it follows)\b/i.test(
      closingPara
    );
    if (blockStart > lastHeadingIdx + 1 && readsAsConclusion) {
      out = [...out.slice(0, blockStart), "## **Conclusion**", "", ...out.slice(blockStart)];
      repaired = true;
    }
  }

  return { text: out.join("\n").replace(/\n{3,}/g, "\n\n").trim(), repaired };
}

function enforceWordLimit(answer, wordLimit) {
  const text = String(answer || "");
  const wordCount = countWords(text);
  if (!wordLimit || !text.trim() || wordCount <= wordLimit) {
    return { answer: text, wordCount, clamped: false };
  }
  const clamped = clampAnswerToLimit(text, wordLimit);
  return { answer: clamped, wordCount: countWords(clamped), clamped: true };
}

function buildRagPrompt({ question, chunks, subjectId }) {
  if (!chunks || chunks.length === 0) {
    throw new Error("No evidence chunks provided to buildRagPrompt");
  }

  // Preserve the source's own structure: keep contiguous same-source chunks
  // together in document order and label each chunk with its origin, so the model
  // can attribute a statement and see the direction of a stated relationship.
  const { chunks: orderedChunks, layout } = orderChunksBySourceProximity(chunks);
  const chunkText = formatEvidenceChunks(orderedChunks, layout, { label: (i) => `EVIDENCE ${i + 1}` });

  const wordLimit = detectWordLimit(question, subjectId);

  const mainsStructure =
    "Standard UPSC Mains shape: ## **Introduction**, then the question-specific dimensions, then ## **Conclusion**. The Introduction is 2-3 sentences of genuine context and a direct answer to the directive verb; the Conclusion is 2-3 sentences of synthesis or verdict, never a summary of what was just said. Number the body sections 1., 2., 3. in the order the question demands. The number, name, order and nature of those dimensions come from the question - there is no fixed list and no fixed count. A question with five strands may yield five sections, a narrow factual question two. What is fixed is the frame; what the model chooses is everything inside it. Total must still reach the word range.";
  const essayStructure =
    "Introduction = 100–120 words, then the question-derived body sections = ~1080 words, then Conclusion = 90–100 words, using 8–9 body paragraphs. The frame stays; the body sections come from the question.";
  const wordLimitInstruction = wordLimit
    ? `
LENGTH TARGET — ${wordLimit === 1300 ? "1170–1300" : "500–700"} words (headings excluded). This is a RANGE with a hard floor and a hard ceiling, not a soft suggestion: an answer under 500 words is too short to score, and one over 700 has stopped answering the question. Aim near the middle (~600 words).
- GIVE EACH DIMENSION A WORD FLOOR, then count as you go. Divide the budget across the dimensions you have chosen, subtract the Introduction and Conclusion, and give every remaining dimension an equal share — roughly ${wordLimit === 1300 ? "150" : "95"}–${wordLimit === 1300 ? "200" : "130"} words each. With 4 dimensions that is about 110 words per section; with 5, about 95. A dimension is not finished when you have stated it: it is finished when you have explained WHY it matters, given the concrete evidence for it, and drawn out its significance to the question. Two thin sentences under a heading is the single most common way to fall short of the floor.
- COUNT AS YOU GO: before you finish, check the running total. Under 500 words? Expand the thinnest sections with additional evidence from the chunks. Over 700 words? Cut the weakest material, and never the verdict the verb asks for.
- Structure: ${wordLimit === 1300 ? essayStructure : mainsStructure}
- COMPLETE THE ENTIRE ANSWER: finish every section, and any verdict the verb calls for, before stopping. Never truncate and never end mid-sentence. If the budget tightens, compress wording (shorter clauses, fewer adjectives) rather than cutting a section.
- EACH SECTION MUST BE DISTINCT: every section carries a separate argument directly relevant to the question, supported by its own evidence from the chunks. Do not repeat an earlier argument in different words.
- DEPTH OVER BREADTH: reach the word range by developing each argument further — more concrete detail drawn from the chunks (names, dates, institutions, figures, worked examples), more analysis of why each fact matters, more precisely what the evidence does and does not establish. Never add sections that restate the opening, and never pad with generalities about Indian society. If the evidence is thin on one section, say less there and say more on the sections the evidence actually supports.
- If the evidence does not support a section you were planning, do NOT invent information to fill it — substitute a different argument the evidence does support.
- NO REPETITION: state each provision, example, statistic, and argument exactly once. Do not lean repeatedly on the same framing terms (e.g. "development", "equity", "vulnerability", "inclusive growth", "social progress") — vary the vocabulary and let each term carry a distinct idea.
- NO FILLER: no generic praise, no moral framing, no "it is important to note" throat-clearing, and no textbook-definition openers unless the question explicitly asks for a definition. Every sentence must advance a distinct argument or supply its evidence.`
    : "";

  return `You are an expert UPSC Mains answer-writer for ${(subjectId || "general studies").toUpperCase()} (${wordLimit ? `${wordLimit} words` : "concise"}).

== HOW TO ANSWER ==
- Match structure to the command verb: enumerations become bolded point lists; "compare/distinguish" becomes point-by-point contrast under a heading per side or axis; "examine/critically examine" argues FOR then AGAINST with a final judgment; "to what extent" states a determined extent; "evaluate" weighs criteria and closes with a verdict; "comment" names the core issue of the proposition, then lays out what was actually done and why, then any broader objectives, then the tension or limitation, and delivers the comment itself in a closing section headed after the verb ("Comment"); "causes→effects" sequences with explicit causal links; multiple directives are all answered in proportion.
- IDENTIFY OBJECT, VERB AND SCOPE BEFORE WRITING: parse the question into its object (who or what is being asked about), its command verb, and its SCOPE — any qualifier that bounds or extends the subject, such as "almost all subaltern classes", "all aspects", "social, economic and political aspects", "various factors", "multiple dimensions", "the causes and effects". The object and the verb tell you what to say; the scope tells you what the headings must be.
- MAKE THE SCOPE VISIBLE IN THE HEADINGS: when the question names a scope, the headings are the distinct parts of that scope, one heading per part, and each section says what the subject did about that part. "Phule's writings and efforts of social reforms touched issues of almost all subaltern classes. Discuss." is not answered by headings about Phule's anti-caste contribution in general; it is answered by headings that are the classes and issues inside that scope — Peasants and Agricultural Labourers (his critique of exploitation and rural economic structure), Lower-Caste Communities and Shudras-Atishudras (caste hierarchy, purity-pollution rules, Brahmanical domination), Women and Gender Inequality (women's education, widowhood, child marriage), any further group the evidence supports, and a closing section on the broader programme of social justice that cuts across them.
- A SCOPE COLLAPSED INTO ONE THEME HAS NOT BEEN ANSWERED: if every heading could be summarised under a single broad label ("his challenge to caste", "his educational legacy"), the answer has described the subject instead of the question. Ask of each heading: which distinct part of the named scope is this? If two headings answer the same part, merge them and split a part that has none. Include a part as a section only where the evidence supports it, and where the evidence does not support one, do not invent it and do not announce its absence.
- IDENTIFY THE CENTRAL PROPOSITION FIRST: a "comment", "critically examine" or "to what extent" question puts one specific claim on trial (for example "planned economy was adopted to address regional imbalances"). Restate that claim in your own words, then work out what would have to be established in order to settle it — why it was felt necessary, the mechanism actually used, objectives pursued beyond it, whether it worked, where it fell short. Those become your sections, ordered as that argument requires. The sections are derived from the proposition; never from a list supplied in advance.
- A QUOTE OR MAXIM IS A LIST OF TERMS: when the question puts a quotation, slogan or maxim on trial ("Ideas are timeless and spaceless", "the tragedy of the commons", "swaraj is not merely political freedom"), the concepts the statement ASSERTS are your headings. Read the claim apart first: what distinct things is it claiming? Each one becomes its own heading, unpacked from the evidence. Then close by addressing how the terms hold together - the relationship between them is what the directive asks you to elucidate, and leaving it out answers only half the question. The terms come from the quotation itself, never from a fixed scheme: a maxim making three claims yields three sections, one making two yields two, and a single-claim proposition yields one section developed properly rather than three padded ones.
- THE QUESTION DICTATES THE SCOPE, NEVER THE CONTEXT: the same rule governs any question that names its own terms - a pair or list of variables ("administration and education", "social, economic and political aspects"), a quotation, a named scope. Break the question into those terms and give each its own heading. The sections come strictly from the words of the question, and NEVER from a topic that happens to sit in the retrieved chunks. If the question asks about administration and education, do not write a section on visual arts because visual arts fill three of the four chunks; that is the source's subject, not the question's. The evidence supplies the FACTS under a heading - it never supplies the heading itself.
- FOR "WHAT ARE THE..." DEMANDS: when a question asks for the features, characteristics, attributes, elements, causes, significance, effects, or challenges of a subject, first work out what that subject actually comprises — the aspects a specialist would list — then give each aspect its own concise heading. "Discuss the salient features of Harappan architecture" must DISCOVER planned towns and grid-pattern streets, drainage and sanitation, domestic architecture, monumental and public architecture, fortifications, water-management structures; it must not decide in advance that it needs six sections, and it must not stop after the first three that come to mind. The sections come from the subject's own dimensions, and the evidence decides which of those dimensions can actually be written.
- THE HEADINGS ARE THE FEATURES: on an enumerative demand the main headings must themselves BE the features being asked for, so the skeleton of the answer visibly answers "what are the salient features?". Write each as a short feature noun phrase naming the feature and its most telling quality — "Planned Towns with Grid-Pattern Streets", "Sophisticated Drainage and Sanitation System", "Courtyard-Based Houses with Emphasis on Privacy", "Monumental and Public Architecture", "Advanced Water-Management Structures" — and let the paragraph beneath it explain the feature from the retrieved evidence. Do NOT use a descriptive or argumentative heading here: "Unique Town Planning and Grid-Pattern Layout" or "Carefully Planned Drainage Systems" read as commentary about a feature rather than the feature itself, while the frame's own "Introduction" and "Conclusion" remain fine around them.
- NO FIXED NUMBER OF FEATURES: give as many feature sections as the evidence genuinely supports, and stop once they are adequately covered. Three well-evidenced features is a complete answer, five is a better one, six invented to fill a quota is a failed answer. Never pad the list, and never merge two distinct features into one heading to save space.
- COVER EVERY DIMENSION THE EVIDENCE SUPPORTS: before writing, enumerate the dimensions internally and check the finished answer against that list. A features/characteristics/causes question whose evidence supports five dimensions is UNDER-WRITTEN at three sections. If a dimension the evidence clearly covers has no section, add it; if a dimension is absent from the evidence, leave it out silently and do not invent it.
- FEATURES ARE PARALLEL, NOT NESTED: if the evidence mentions a dimension only as a subordinate clause, an aside or an example inside another section, but the question asks for features, that dimension gets its OWN heading - it is a feature in its own right. Do not bury fortifications inside the town-planning section ("at Dholavira and Lothal the entire settlement was fortified"), do not fold wells or water management into domestic architecture, and do not compress public or monumental buildings into a closing sentence. A reader who sees only the headings must be able to list the salient features; if a salient feature is missing from that list, it has not been answered.
- DO NOT MIRROR THE SOURCES: the chunks are arranged by their book's chapters, and their titles describe the SOURCE's organisation, not the question's demand. Never lift a heading from the evidence — "Genesis of Planned Economy", "Structural Transformation", "Commanding Heights of the Economy" are chapter labels, and reusing them reproduces the textbook instead of answering the question. Apply this test to every candidate heading: if it would make an equally good title for a chapter of a textbook, it is the wrong heading. A heading must state the claim you are settling ("Planning Had Objectives Beyond Regional Balance"), not name a topic, policy or institution ("Industrial Policy Resolution of 1956"). Each section must be something the question makes you establish, not something the source happens to contain. This applies to argumentative demands (why, causes, examine, evaluate, comment); on an enumerative demand the heading is instead the feature itself, as described above — but it is still never a chapter title lifted from the source.
- USE THE STANDARD FRAME, QUESTION-SPECIFIC INSIDE IT. The frame is Introduction → numbered dimensions → Conclusion, and that frame is welcome - it is the UPSC Mains format. What must NOT be fixed is the content of the frame. Never a generic "Body", "Content" or "Main Points" heading, and never a placeholder Introduction that only restates the question.
- THE DIMENSIONS COME FROM THE QUESTION, NOT FROM A LIST. FIRST read the question and work out what it demands — the cause-and-effect chain, the axes of comparison, the scope it names, the dimensions or groups it asks you to identify, the judgment it wants. THEN build the body from that demand and the retrieved evidence. The number, the names, the order and the nature of the sections all change with the question. "The French Revolution has enduring relevance to the contemporary world. Explain." becomes four dimensions - Shift from Absolute Monarchy to Constitutional Governance, Universalization of Rights and Global Anti-Colonial Impact, Institutionalization of Free Press and Public Sphere, Foundations of Global Gender Equality and Political Mobilization. "Discuss the salient features of Harappan architecture." becomes Planned Urban Layout, Advanced Drainage Systems, Domestic Architecture, Public and Monumental Architecture. "Phule's writings and efforts of social reforms touched issues of almost all subaltern classes." becomes Shudras and Atishudras: Challenge to Caste Hierarchy, Peasants and Rural Exploitation, Women and Gender-Based Oppression, Education and Social Emancipation, Wider Anti-Caste Mobilization. Three different questions, three different structures.
- NUMBER THE BODY SECTIONS 1., 2., 3. in the order the question demands, so the examiner can see the dimensions at a glance. Each heading names its own dimension and is short enough to read at a glance.
- TWO FORMS ARE AVAILABLE, both acceptable. (a) A bold heading per dimension with prose beneath it, e.g. \`## **1. Planned Towns with Grid-Pattern Streets**\` followed by a paragraph. (b) When a demand is naturally a roster of places, groups, regions or causes, use ONE aspect heading followed by a numbered list whose items are a bolded name plus two or three nested bullets of specifics, e.g. \`### Geographical distribution of offshore oil reserves\` then \`1. **Persian Gulf and Middle East**\` with bullets naming the countries and the geology. Form (b) is right for "distribution across regions" and "which groups" demands; form (a) is right for arguments, themes and assessments. Do not mix both forms within one answer.
- Sections may contain prose paragraphs, bullets, evidence and examples as the content requires - use whatever form fits the material, the way a strong ChatGPT answer would.
- For a comparison, contrast the two sides directly: a heading per side or per axis, paired bullets, or - when several axes line up - a markdown table (see RENDERING).
- Weave the specifics into the prose: names, dates, Acts, schemes, institutions and case data belong inside the sentences that need them, not appended to a lead-in as a list.

== EVIDENCE RULES ==
- SOURCE-LOCK (MANDATORY): the chunks below are the factual boundary. Every fact, statistic, date, name, study, example or causal claim MUST come from them. Never infer, generalize, convert historical evidence to present-day, splice fragments into composite facts, or add pretrained "known facts" — even confident ones. If a detail is uncertain, OMIT it. Never fabricate sources.
- PRESERVE SCOPE: keep each chunk's time period and population ("NSSO 55th Round (1999–2000) indicated…", "urban SCs in that survey", not "all SCs today").
- PRESERVE DIRECTION: keep every stated relationship pointing the way the evidence states it — cause→effect, parent→child, superior→subordinate, earlier→later. Never reverse a relationship, and never assert a relationship the evidence does not state. Joining two supported facts with an unsupported link ("A enabled B", "A proves B") is a source-lock violation even when both facts are quoted correctly.
- READ CONTIGUOUS CHUNKS AS ONE PASSAGE: each chunk is labelled with its source and position. Chunks marked as continuing the passage above belong to the same section and must be read as continuous text, not as unrelated evidence.
- READ CONTEXT CHUNKS AS PART OF THEIR PASSAGE: a unit labelled \`CONTEXT BEFORE/AFTER chunk N\` is the neighbouring text of chunk N, retrieved because the evidence budget truncated chunk N. It is the missing beginning or end of that argument — read it as continuous prose with chunk N, never as a separate source, and never attribute it to a different chapter, period or author.
- ATTRIBUTION: figures/studies illustrate or corroborate — never "prove" causation; avoid absolutes unless the source confirms them.
- UNSUPPORTED POINTS: express cautiously as an explicit analytical inference, or omit — do not manufacture evidence.
- EXAMPLES: for "with examples", lead the body with named evidence-based examples (3–5 solid beats 10 vague); majority from the asked subject, not its background.
- ORIGINALITY: rephrase all prose in your own words; keep dates, names, figures exactly as stated; never copy chunk sentences.

== RENDERING ==
The answer is displayed by a simple line-based renderer. Anything it cannot parse reaches the user as raw text, so the output must stay inside this list:
- Section heading: \`## **Bold Title**\` on its own line, then a blank line, then the body. This is what the user sees as the bold section title.
- ONE PARAGRAPH PER LINE. Never hard-wrap a paragraph across several lines: the renderer draws one text block per line, so a wrapped paragraph breaks into ragged fragments. Write each paragraph as one unbroken line.
- Blank line between a heading and its paragraph, and between paragraphs.
- **Bold** for the term that carries a point, mid-sentence: **Planning Commission**, **grid pattern**. No other inline styling exists.
- \`- item\` bullets for genuinely enumerable content. Indent a sub-item by two spaces to nest it one level under its parent - two levels is the maximum, deeper indentation renders flat.
- A markdown table IS supported and is the right form for a side-by-side contrast across several axes (offshore vs onshore, merits vs demerits, similarity vs difference): header row, at most 4 columns and 6-9 rows, one axis per row, each cell a short phrase, with a blank line before and after it.
- NEVER use: italics (\`*x*\` or \`_x_\`), strikethrough, inline code backticks, links or URLs, blockquotes, horizontal rules, or emoji. Bold is the only inline markup available, and there is no image support - never write \`![alt](url)\`.
- Do not announce the structure ("The following sections...", "Let us now look at..."). Go straight into the content.

== FORMAT ==
- \`## **Introduction**\`, then \`## **1. <dimension>\` … \`## **2. <dimension>\` … for each dimension you derive from the question, then \`## **Conclusion**\`. Headings excluded from word count.
- THE CONCLUSION IS NOT OPTIONAL: every answer ends with \`## **Conclusion**\`. An answer that stops on a numbered dimension, however good that dimension is, is unfinished - the examiner reads the conclusion as the claim being settled. Write it last, always, even when the last dimension feels like it has already said everything.
- NEVER emit a heading with no body: every heading must be immediately followed by at least one full sentence. A leading heading that restates the question as a claim is welcome, but the thesis or verdict goes DIRECTLY under it — a bare title is never acceptable.
- NEVER write a heading that comments on the state of the evidence ("Absence of Supported Facts", "Insufficient Evidence", "No Reliable Data"). If the retrieved chunks support only part of the question, build the sections that the supported part supports, and state the limitation once as a plain closing sentence. An answer must never narrate its own retrieval.
- Bold thematic heading, then flowing explanatory prose - clean, direct, confident English of the kind a subject expert writes when asked to explain something across several sub-topics. No exam scaffolding: no "Point -> Evidence -> Tie-back", no rubric labels, no verdict boilerplate, no "This shows that..." restatement after every paragraph. No citations, [EVIDENCE X], or LaTeX - Unicode arrows OK.

${wordLimitInstruction}

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

  out = out
    .replace(/\u00e2\u20ac\u201d/g, "\u2014")
    .replace(/\u00e2\u20ac\u201c/g, "\u2013")
    .replace(/\u00e2\u20ac\u0153/g, "\u201c")
    .replace(/\u00e2\u20ac\u2122/g, "\u2019")
    .replace(/\u00e2\u20ac\u02dc/g, "\u2018")
    .replace(/\u00e2\u20ac\u00a6/g, "\u2026")
    .replace(/\u00e2\u20ac\u00a2/g, "\u2022")
    .replace(/\u00e2\u20ac\u00b9/g, "\u2039")
    .replace(/\u00e2\u20ac\u00ba/g, "\u203a")
    .replace(/(\*\*[^*\n]*\*\*)/g, "\u0000$1\u0000")
    .replace(/\*/g, "")
    .replace(/\u0000/g, "");;

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
  const proxyStartedAt = Date.now();
  let firstTokenAt = 0;
  // --- stream timing instrumentation (diagnostic only; no behavior change) ---
  let lastTokenAt = 0;
  let chunkCount = 0;
  let lastGapMs = 0;
  let maxGapMs = 0;
  // Best partial output seen from any model in the chain. Retained so that a
  // mid-generation timeout on a later attempt can still yield a usable answer.
  let bestPartial = { text: "", model: "", elapsedMs: 0, estTokens: 0 };
  // Set when the model chain was exhausted by timeouts but usable partial text
  // was retained, so the caller can label the answer as incomplete.
  let timeoutPartial = false;

  onStatus?.("writing mains answer");
  const rawSubjectId = options.subjectId || (chunks?.[0]?.subject_id) || null;
  const subjectId = Array.isArray(rawSubjectId) ? rawSubjectId.find((s) => typeof s === "string") || null : rawSubjectId;
  const userPrompt = buildRagPrompt({ question, chunks, subjectId });
  const urls = buildGeminiUrls(":streamGenerateContent?alt=sse");
  const maxOutputTokens = targetTokens > 0 ? Math.min(targetTokens, 65536) : 8192;
  const answerWordLimit = detectWordLimit(question, subjectId);
  const maxOutputTokensCapped = answerWordLimit ? Math.min(maxOutputTokens, Math.round(answerWordLimit * 2.4) + 200) : maxOutputTokens;
  const generationConfig = buildGeminiGenerationConfig({
    temperature: 0.6,
    topP: 0.95,
    maxOutputTokens: maxOutputTokensCapped,
  });
  console.log(
    `[gemini] request config: mode=${mode || "limited"}, chunks=${chunks.length}, maxOutputTokens=${maxOutputTokensCapped}, thinking=${JSON.stringify(generationConfig.thinkingConfig || null)}`
  );

  const requestBody = JSON.stringify({
    systemInstruction: {
      parts: [{ text: "You are an expert UPSC Mains answer-writer. Obey the instructions in the user message exactly: the question-derived answer structure, the SOURCE-LOCK evidence rules, and the word budget. Use the standard UPSC frame - Introduction → numbered question-specific dimensions → Conclusion - but choose every dimension from the question itself: features/characteristics demands are organised by the features themselves, causes/effects by cause and effect themes, comparisons as parallel points with one heading per side or axis, comment/evaluate/examine/to-what-extent by the dimensions the assessment needs. The number, names, order and nature of those dimensions change with every question; there is no preset list and no fixed count, and never a generic \"Body\" or \"Content\" heading. The retrieved chunks are the factual boundary: organize, synthesize, and write in your own words only — never add facts absent from the chunks." }],
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
  });

  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";
  let lastEmitted = 0;
  let tokenCount = 0;
  let finishReason = "";
  let promptTokenCount = 0;
  let thoughtTokenCount = 0;
  let totalTokenCount = 0;
  let servedModel = "";
  const STREAM_FLUSH_CHARS = 256;
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
        const nowMs = Date.now();
        if (!firstTokenAt) firstTokenAt = nowMs;
        if (lastTokenAt) {
          lastGapMs = nowMs - lastTokenAt;
          if (lastGapMs > maxGapMs) maxGapMs = lastGapMs;
        }
        lastTokenAt = nowMs;
        chunkCount += 1;
        fullText += text;
        if (onToken && fullText.length - lastEmitted >= STREAM_FLUSH_CHARS) {
          lastEmitted = fullText.length;
          onToken(restoreExactDiagrams(cleanModelOutput(fullText), chunks));
        }
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

  // Model chain. Wrapped so that a hard failure (quota/HTTP/network) on a later
  // model can still fall back to text already captured from an earlier attempt.
  try {
  for (let modelIndex = 0; modelIndex < urls.length; modelIndex++) {
    const modelUrl = urls[modelIndex];
    const isLastModel = modelIndex === urls.length - 1;
    const attemptStart = Date.now();
    const testAbortApplies =
      GEMINI_TEST_ABORT_AFTER_MS > 0 &&
      (process.env.GEMINI_TEST_ABORT_PRIMARY_ONLY !== "true" || modelIndex === 0);
    const attemptBudgetMs = testAbortApplies ? GEMINI_TEST_ABORT_AFTER_MS : GEMINI_STREAM_ATTEMPT_TIMEOUT_MS;
    const ttftDeadline = attemptStart + GEMINI_STREAM_TTFT_TIMEOUT_MS;
    const attemptDeadline = attemptStart + attemptBudgetMs;
    const controller = new AbortController();

    buffer = "";
    fullText = "";
    lastEmitted = 0;
    tokenCount = 0;
    finishReason = "";
    promptTokenCount = 0;
    thoughtTokenCount = 0;
    totalTokenCount = 0;
    firstTokenAt = 0;
    lastTokenAt = 0;
    chunkCount = 0;
    lastGapMs = 0;
    maxGapMs = 0;

    try {
      const headerMs = Math.min(GEMINI_STREAM_HEADER_TIMEOUT_MS, GEMINI_STREAM_TTFT_TIMEOUT_MS);
      const headerTimer = setTimeout(() => controller.abort(), headerMs);
      let attemptResponse;
      try {
        attemptResponse = await fetch(modelUrl, {
          method: "POST",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": apiKey,
          },
          body: requestBody,
        });
        clearTimeout(headerTimer);
        attemptResponse._geminiModel = getGeminiModelNameFromUrl(modelUrl);
        servedModel = attemptResponse._geminiModel;
      } catch (fetchErr) {
        clearTimeout(headerTimer);
        if (fetchErr?.name === "AbortError") {
          console.warn(
            `[gemini] ABORT_METRIC abortReason=HEADER_TIMEOUT model=${getGeminiModelNameFromUrl(modelUrl)} ` +
              `modelIndex=${modelIndex + 1}/${urls.length} isLastModel=${isLastModel} elapsedMs=${Date.now() - attemptStart} ` +
              `budgetMs=${headerMs} chunks=0 chars=0 estOutputTokens=0 lastTokenAgeMs=null maxGapMs=0`
          );
          console.warn(`[gemini] stream_answer header timeout (>${headerMs}ms) on ${getGeminiModelNameFromUrl(modelUrl)}`);
          if (isLastModel) {
            throw new GeminiApiError({
              message: `Gemini header timeout after ${headerMs}ms on ${getGeminiModelNameFromUrl(modelUrl)}`,
              status: 504,
              code: "GEMINI_TIMEOUT",
              userMessage: "Gemini took too long to respond. Please try again.",
              retriable: true,
              operation: "stream_answer",
            });
          }
          noteModelBusy(modelUrl);
          console.warn(`[gemini] stream_answer header timeout on ${getGeminiModelNameFromUrl(modelUrl)}, trying fallback model`);
          continue;
        }
        throw fetchErr;
      }

      if (!attemptResponse.ok) {
        const err = await buildGeminiError(attemptResponse, "stream_answer");
        console.error(
          `[gemini] stream_answer HTTP failure: model=${getGeminiModelNameFromUrl(modelUrl)} ` +
            `http=${err.originalError?.httpStatus} ` +
            `status=${err.originalError?.apiStatus || "unknown"} ` +
            `code=${err.originalError?.apiCode || "unknown"} ` +
            `message=${err.originalError?.apiMessage || err.message}`
        );
        const busy = GEMINI_MODEL_BUSY_STATUSES.has(err.status) || err.status >= 500;
        if (busy && !isLastModel) {
          noteModelBusy(modelUrl);
          console.warn(`[gemini] stream_answer failed on ${getGeminiModelNameFromUrl(modelUrl)} (${err.status}), trying fallback model`);
          continue;
        }
        throw err;
      }

      console.log(`[gemini] stream_answer served by ${servedModel} (attempt ${modelIndex + 1}/${urls.length})`);

      const reader = attemptResponse.body?.getReader();
      if (!reader) {
        throw new Error("Gemini streaming not available.");
      }

      let ttftAborted = false;
      let attemptAborted = false;
      while (true) {
        const deadline = firstTokenAt ? attemptDeadline : ttftDeadline;
        const { timedOut, chunk, error } = await readStreamWithDeadline(reader, controller, deadline);
        if (timedOut) {
          if (!firstTokenAt) {
            ttftAborted = true;
          } else {
            attemptAborted = true;
          }
          break;
        }
        if (error) {
          throw new GeminiApiError({
            message: `Gemini stream error (${firstTokenAt ? "mid-generation" : "before first token"}): ${error?.message || error}`,
            status: 502,
            code: "GEMINI_NETWORK_ERROR",
            userMessage: "Lost connection to Gemini while writing your answer. Please retry.",
            retriable: true,
            operation: "stream_answer",
          });
        }
        const { done, value } = chunk;
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) processStreamLine(line);
      }

      console.log(
        `[gemini] stream_answer attempt: ${servedModel} ttftMs=${firstTokenAt ? firstTokenAt - attemptStart : "none"} streamMs=${Date.now() - attemptStart}`
      );
      console.log(
        `[gemini] COMPLETE_METRIC model=${servedModel} modelIndex=${modelIndex + 1}/${urls.length} ` +
          `ttftMs=${firstTokenAt ? firstTokenAt - attemptStart : "none"} elapsedMs=${Date.now() - attemptStart} ` +
          `chunks=${chunkCount} chars=${fullText.length} outputTokens=${tokenCount} finishReason=${finishReason || "STOP"} ` +
          `maxGapMs=${maxGapMs} lastTokenAgeMs=${lastTokenAt ? Date.now() - lastTokenAt : "n/a"}`
      );

      if (ttftAborted) {
        console.warn(
          `[gemini] ABORT_METRIC abortReason=TTFT_TIMEOUT model=${servedModel} ` +
            `modelIndex=${modelIndex + 1}/${urls.length} isLastModel=${isLastModel} elapsedMs=${Date.now() - attemptStart} ` +
            `budgetMs=${GEMINI_STREAM_TTFT_TIMEOUT_MS} chunks=${chunkCount} chars=${fullText.length} ` +
            `estOutputTokens=${Math.round(fullText.length / 4)} lastTokenAgeMs=${lastTokenAt ? Date.now() - lastTokenAt : null} maxGapMs=${maxGapMs}`
        );
        if (isLastModel) {
          throw new GeminiApiError({
            message: `Gemini ${servedModel} produced no first token within ${GEMINI_STREAM_TTFT_TIMEOUT_MS}ms`,
            status: 504,
            code: "GEMINI_TIMEOUT",
            userMessage: "Gemini took too long to start generating. Please try again.",
            retriable: true,
            operation: "stream_answer",
          });
        }
        noteModelBusy(modelUrl);
        console.warn(`[gemini] stream_answer TTFT timeout (>${GEMINI_STREAM_TTFT_TIMEOUT_MS}ms, no first token) on ${servedModel}, trying fallback model`);
        continue;
      }

      if (attemptAborted) {
        const abortAt = Date.now();
        const stallSinceLastToken = lastTokenAt ? abortAt - lastTokenAt : null;
        const elapsedMs = abortAt - attemptStart;
        const estOutputTokens = Math.round(fullText.length / 4);
        console.warn(
          `[gemini] ABORT_METRIC abortReason=ATTEMPT_BUDGET_EXCEEDED model=${servedModel} ` +
            `modelIndex=${modelIndex + 1}/${urls.length} isLastModel=${isLastModel} ` +
            `attemptStartOffsetMs=${attemptStart - proxyStartedAt} ttftMs=${firstTokenAt ? firstTokenAt - attemptStart : "none"} ` +
            `elapsedMs=${elapsedMs} budgetMs=${attemptBudgetMs} ` +
            `chunks=${chunkCount} chars=${fullText.length} estOutputTokens=${estOutputTokens} reportedTokens=${tokenCount} ` +
            `lastTokenAgeMs=${stallSinceLastToken} maxGapMs=${maxGapMs} lastGapMs=${lastGapMs} ` +
            `hasConclusion=${/##\s*\*\*?conclusion/i.test(fullText)} streamHealthy=${stallSinceLastToken !== null && stallSinceLastToken < 2000}`
        );

        // Retain any usable text from this attempt before moving on. A longer
        // partial from an earlier model always wins, so we never regress to a
        // shorter fragment.
        if (fullText.length > bestPartial.text.length) {
          bestPartial = {
            text: fullText,
            model: servedModel,
            elapsedMs,
            estTokens: estOutputTokens,
          };
        }

        if (!isLastModel) {
          // Fall back to the next model in the chain rather than discarding work.
          // The retained partial stays available if the fallback also fails.
          noteModelBusy(modelUrl);
          console.warn(
            `[gemini] stream_answer mid-generation timeout on ${servedModel}, ` +
              `retaining ${bestPartial.text.length} chars as fallback and trying next model`
          );
          continue;
        }

        // Last model in the chain timed out. If we captured meaningful text we
        // return it as a partial answer; otherwise surface a real error.
        if (bestPartial.text.trim().length >= MIN_USABLE_PARTIAL_CHARS) {
          console.warn(
            `[gemini] stream_answer last model timed out; returning retained partial ` +
              `(${bestPartial.text.length} chars from ${bestPartial.model || servedModel})`
          );
          timeoutPartial = true;
          break;
        }

        throw new GeminiApiError({
          message: `Gemini ${servedModel} exceeded generation budget of ${attemptBudgetMs}ms before producing usable output`,
          status: 504,
          code: "GEMINI_TIMEOUT",
          userMessage: "Gemini took too long to finish your answer. Please retry.",
          retriable: true,
          operation: "stream_answer",
        });
      }

      break;
    } catch (err) {
      throw err;
    }
  }
  } catch (chainErr) {
    // A model in the chain failed outright (e.g. quota, HTTP, or a network
    // error). If an earlier attempt already produced usable text, prefer that
    // partial over surfacing a hard error the user never asked for.
    if (bestPartial.text.trim().length >= MIN_USABLE_PARTIAL_CHARS) {
      console.warn(
        `[gemini] stream chain failed (${chainErr?.code || chainErr?.message || "unknown"}); ` +
          `returning retained partial of ${bestPartial.text.length} chars from ${bestPartial.model}`
      );
      fullText = bestPartial.text;
      servedModel = bestPartial.model || servedModel;
      timeoutPartial = true;
    } else {
      throw chainErr;
    }
  }

  buffer += decoder.decode();
  if (buffer.trim()) {
    for (const line of buffer.split("\n")) processStreamLine(line);
  }

  // If every model in the chain timed out, fall back to the best partial we
  // retained rather than surfacing an error over text the user already saw.
  if (!fullText && bestPartial.text.trim().length >= MIN_USABLE_PARTIAL_CHARS) {
    fullText = bestPartial.text;
    servedModel = bestPartial.model || servedModel;
    timeoutPartial = true;
  }

  if (!fullText) {
    throw new Error("Gemini returned an empty response.");
  }

  if (onToken && fullText.length > lastEmitted) {
    onToken(restoreExactDiagrams(cleanModelOutput(fullText), chunks));
  }

  const cleaned = restoreExactDiagrams(cleanModelOutput(fullText), chunks);

  // Programmatic source-lock check against the exact chunks we sent.
  const grounding = verifyGrounding(cleaned, chunks, {
    enforceLowSupport: process.env.GEMINI_GROUNDING_ENFORCE_LOW_SUPPORT === "true",
    // Strict source-lock tiers for Layer 2. Default off: this layer's measured
    // precision is ~50%, so enforcing it unconditionally would delete legitimate
    // UPSC analysis. "hard" = unconditional evidential claims only;
    // "all" = also spliced soft-marker claims.
    enforceRelational: ["hard", "all"].includes(
      (process.env.GEMINI_GROUNDING_ENFORCE_RELATIONAL || "").toLowerCase()
    )
      ? process.env.GEMINI_GROUNDING_ENFORCE_RELATIONAL.toLowerCase()
      : false,
  });
  if (grounding.removed.length || grounding.flagged.length || grounding.relational.length) {
    console.warn(
      `[gemini] grounding: support=${grounding.supportAvg} removed=${grounding.removed.length} flagged=${grounding.flagged.length} relational=${grounding.relational.length} sentences=${grounding.total}`
    );
    for (const r of grounding.removed) {
      console.warn(`[gemini] grounding removed (${r.reason}): "${r.text}"`);
    }
    for (const f of grounding.flagged) {
      console.warn(`[gemini] grounding flagged [${f.support}]: "${f.text}"`);
    }
    for (const rel of grounding.relational) {
      console.warn(
        `[gemini] grounding relational [severity=${rel.severity} marker=${rel.marker} strength=${rel.strength} spliced=${rel.spliced} support=${rel.support}]: "${rel.text}"`
      );
    }
  }
  const groundedText = grounding.answer;

  // Every model in the chain timed out; we are returning a retained partial.
  // Grounding still runs over it so the safeguard applies to partial answers too.
  if (timeoutPartial) {
    console.warn(
      `[gemini] answer incomplete: model chain exhausted by timeouts, returning retained partial ` +
        `(${groundedText.length} chars, estTokens=${bestPartial.estTokens})`
    );
    const enforcedPartial = enforceWordLimit(groundedText, answerWordLimit);
    return {
      answer: enforcedPartial.answer,
      tokenCount: tokenCount || bestPartial.estTokens,
      wordCount: enforcedPartial.wordCount,
      wordLimit: answerWordLimit || null,
      wordLimitClamped: enforcedPartial.clamped,
      truncated: true,
      timedOut: true,
      finishReason: "TIMEOUT_PARTIAL",
      grounding: {
        supportAvg: grounding.supportAvg,
        removed: grounding.removed.length,
        flagged: grounding.flagged.length,
        grounded: grounding.grounded,
      },
    };
  }

  if (finishReason && finishReason !== "STOP") {
    // SAFETY and RECITATION terminate generation mid-answer. The partial text is
    // still grounded, still rendered, and still worth showing - discarding it for a
    // 502 throws away a complete-looking answer the user was already reading.
    // The notice uses ** markers because the client renderer only parses bold.
    if (SAFETY_FINISH_REASONS.has(finishReason) && groundedText.length > 0) {
      const enforcedSafety = enforceWordLimit(groundedText, answerWordLimit);
      console.warn(
        `[gemini] answer stopped by ${finishReason} after ${tokenCount} output tokens, returning partial answer`
      );
      return {
        answer: `${enforcedSafety.answer}\n\n**Response stopped early by model ${finishReason.toLowerCase()} filters. What you see is the part generated before they triggered.**`,
        tokenCount,
        wordCount: enforcedSafety.wordCount,
        wordLimit: answerWordLimit || null,
        wordLimitClamped: enforcedSafety.clamped,
        truncated: true,
        stoppedByFilter: true,
        finishReason,
        grounding: {
          supportAvg: grounding.supportAvg,
          removed: grounding.removed.length,
          flagged: grounding.flagged.length,
          relational: grounding.relational.length,
          grounded: grounding.grounded,
        },
      };
    }
    if (finishReason === "MAX_TOKENS" && groundedText.length > 0) {
      console.warn(`[gemini] answer truncated at MAX_TOKENS (${tokenCount} output tokens), returning partial answer with truncated flag`);
      const enforcedPartial = enforceWordLimit(groundedText, answerWordLimit);
      return {
        answer: enforcedPartial.answer,
        tokenCount,
        wordCount: enforcedPartial.wordCount,
        wordLimit: answerWordLimit || null,
        wordLimitClamped: enforcedPartial.clamped,
        truncated: true,
        finishReason,
        grounding: {
          supportAvg: grounding.supportAvg,
          removed: grounding.removed.length,
          flagged: grounding.flagged.length,
          relational: grounding.relational.length,
          grounded: grounding.grounded,
        },
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
    `[gemini] usage: prompt=${promptTokenCount || "unknown"}, output=${tokenCount || "unknown"}, thoughts=${thoughtTokenCount || 0}, total=${totalTokenCount || "unknown"}, maxOutputTokens=${maxOutputTokensCapped}`
  );
  console.log(
    `[gemini] proxy — ${cleaned.length} chars, ${tokenCount} tokens`
  );

  console.log(
    `[gemini] textgen: model=${servedModel}, ttftMs=${firstTokenAt ? firstTokenAt - proxyStartedAt : -1} genMs=${Date.now() - proxyStartedAt} outputTokens=${tokenCount} tokPerSec=${tokenCount > 0 && Date.now() - proxyStartedAt > 0 ? Math.round((tokenCount / Math.max(1, Date.now() - proxyStartedAt)) * 1000) : 0}`
  );

  const framed = ensureFrameStructure(groundedText);
  if (framed.repaired) {
    console.warn("[gemini] frame repaired: restored a missing Conclusion or dropped an empty heading");
  }
  const enforced = enforceWordLimit(framed.text, answerWordLimit);
  if (enforced.clamped) {
    console.warn(
      `[gemini] word-limit clamp: ${enforced.wordCount} words (limit ${answerWordLimit}) after enforcing`
    );
  }

  const minAnswerWords = answerWordLimit
    ? Math.max(200, Math.round(answerWordLimit * 0.92))
    : 0;
  if (answerWordLimit && enforced.wordCount < minAnswerWords) {
    console.warn(
      `[gemini] answer below target: ${enforced.wordCount}/${answerWordLimit} words (single-call generation)`
    );
  }

  return {
    answer: enforced.answer,
    tokenCount,
    wordCount: enforced.wordCount,
    wordLimit: answerWordLimit || null,
    wordLimitClamped: enforced.clamped,
    grounding: {
      supportAvg: grounding.supportAvg,
      removed: grounding.removed.length,
      flagged: grounding.flagged.length,
      relational: grounding.relational.length,
      grounded: grounding.grounded,
    },
  };
}

const RAG_ANSWER_SYSTEM_INSTRUCTION = "You are an expert UPSC Mains answer-writer for UPSC study material. The answer follows the standard UPSC Mains frame - Introduction → numbered dimensions → Conclusion - but everything inside that frame comes from the question, not from a preset. Work out what the question demands first, then derive the dimensions and their number, names, order and nature from it:\n- Features/characteristics demands: organise directly by the features themselves, one concise heading each, covering every dimension the evidence supports and stopping where the evidence stops.\n- Causes/effects demands: organise by cause and effect themes with explicit links.\n- Compare/distinguish: parallel point-by-point contrast under a heading per side or per axis, paired bullets, or a markdown table when several axes line up.\n- Comment/evaluate/critically examine/to what extent: organise around the dimensions the assessment needs, then close with a short verdict in the Conclusion.\n- Write the Introduction as 2-3 sentences of real context that directly addresses the directive verb (never a restatement of the question), number the body sections 1., 2., 3. in the order the question demands, and close with a Conclusion of 2-3 sentences that synthesises or judges rather than summarising. Sections may mix prose, bullets, evidence and examples as the material requires. The frame is fixed; the content of the frame is entirely question-specific.\nEach section develops one distinct argument or dimension in flowing prose - a bold thematic heading followed by continuous explanatory paragraphs that weave the specifics into the sentences that need them. Bold a term only where it carries the point, and never use a Point → Evidence → Tie-back scaffold, rubric labels, or a restatement after every paragraph. Never use a generic \"Body\" or \"Content\" heading, never lift a heading from the source's chapter titles, and never emit a heading with no body under it. Ground every claim in the EVIDENCE chunks, mining ALL chunks. STRICT SOURCE-LOCK: use ONLY the evidence chunks - never add facts, names, dates, numbers, or examples from memory, even if confidently known; if a needed point is not in the chunks, omit it and never fill from prior knowledge. NEVER invent figures, dates, or quotes. For enumerative demands (distinctive features/characteristics/factors), list each feature/factor explicitly with a bolded name and concrete example. Report only certain facts - omit doubtful numbers/years; precision beats breadth. Do not manufacture specificity: attribute only what the evidence establishes; prefer broader, well-supported statements over impressive but weakly supported ones. REQUIRE VERIFIED EXAMPLES: anchor each body point in 1-3 concrete named examples from the evidence; 3-5 supported examples beat 10 uncertain ones; never answer an \"with examples\" question with zero named examples. For amalgamation/synthesis questions, for amalgamation/synthesis questions use natural thematic headings and weave the past-vs-contemporary contrast into each section (no mechanical label pairs); prefer examples of the subject asked about over its predecessors. Grade confidence by source: assert evidence-supported facts confidently; keep beyond-evidence additions subordinate and conservative. Honor the word limit in the question (600 words for Mains, 1300 words for Essay). Rephrase prose in your own words. No citations, no odd generic sub-headings unless the evidence contains the theme, no LaTeX, no verbatim box-diagrams (describe instead).";

// Refuse to answer only when the model is highly confident the evidence cannot
// answer the question. Anything less - low confidence, unparseable output, an API
// error, a timeout - resolves to canAnswer:true, because wrongly refusing a
// question the notes DO answer is the worse failure by far.
const EVIDENCE_JUDGE_MIN_CONFIDENCE = 0.85;
const EVIDENCE_JUDGE_CHUNK_CHARS = 1400;

const EVIDENCE_JUDGE_SYSTEM_INSTRUCTION = `You decide whether a set of source excerpts is about the SAME SUBJECT as a question. That is the only thing you decide.

You are NOT judging:
- completeness or depth. Excerpts that cover only one or two aspects of a question are still on-subject. Most exam questions need far more than the excerpts show. Never refuse for being partial, brief, or excerpted.
- whether the excerpts use the question's wording. A quotation or an abstract idea is often covered by excerpts sharing almost none of its words. Judge subject matter, not vocabulary.
- answer quality, length, or exam style.

Set onTopic=false ONLY when the excerpts are about a clearly different subject from the one the question asks about. Examples of onTopic=false: excerpts about art history and painting for a question about education policy or agricultural administration; excerpts about constitutional law for a question about medieval trade routes.

Set onTopic=true when the excerpts genuinely discuss the question's subject, even partially, even if they never use the question's words, and even if the excerpts are cut off mid-sentence.

When unsure, answer onTopic=true. A false refusal denies the user an answer their notes do support, which is the worse error.

Respond with JSON only, no prose, no code fences:
{"onTopic": true|false, "confidence": 0.0-1.0, "excerptSubject": "what the excerpts are actually about, one short phrase", "reason": "one short sentence"}`;

// Second opinion, asked only when the first call says off-topic.
//
// A single judge call is not trusted with a refusal. Measured: asked whether
// excerpts could answer "the tragedy of the commons", one call correctly said
// yes, and another confidently said no - describing the same excerpts as
// "landownership in Mughal India, Indian forestry, conservation and pastoralism",
// which is precisely the material that question is answered from. The failure is
// conceptual: a quotation names its topic abstractly and the excerpts name it
// concretely, so surface subject mismatch looks like a different field.
//
// So this variant is framed in the opposite direction and defaults to on-topic.
// A refusal must survive both.
const EVIDENCE_JUDGE_CONFIRM_INSTRUCTION = `A previous check judged a set of source excerpts to be about a different subject than the question, and is asking you to re-examine that judgement.

Examine the excerpts again before answering. Quote, maxims and abstract concepts name their subject abstractly ("the tragedy of the commons"), while the excerpts discuss that same subject concretely and technically (landownership, common pasture, forest use, pastoralism, resource depletion). That is a match, not a mismatch.

Answer onTopic=true if ANY excerpt could support a substantive part of the answer, including when it approaches the subject through a specific historical, technical or regional case. Only answer onTopic=false when the excerpts belong to an unmistakably different field and no plausible reading connects them to the question.

Default to onTopic=true.

Respond with JSON only, no prose, no code fences:
{"onTopic": true|false, "confidence": 0.0-1.0, "excerptSubject": "what the excerpts are actually about, one short phrase", "reason": "one short sentence"}`;

function parseJudgeJson(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  const unfenced = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  const candidate = start > -1 && end > start ? unfenced.slice(start, end + 1) : unfenced;
  try {
    const parsed = JSON.parse(candidate);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export async function judgeEvidenceRelevance({
  apiKey,
  question,
  chunks,
  variant = "primary",
  timeoutMs = 20000,
} = {}) {
  const cleanKey = String(apiKey || "").trim();
  const list = Array.isArray(chunks) ? chunks.filter((c) => c?.text) : [];
  if (!cleanKey || list.length === 0 || !question) {
    return { onTopic: true, confidence: 0, reason: "judge skipped", judged: false };
  }
  const isConfirm = variant === "confirm";

  const excerpt = list
    .slice(0, 6)
    .map((c, i) => `[${i + 1}] ${String(c.text).slice(0, EVIDENCE_JUDGE_CHUNK_CHARS)}`)
    .join("\n\n");

  const requestBody = {
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `QUESTION:\n${String(question).slice(0, 600)}\n\nSOURCE EXCERPTS:\n${excerpt}`,
          },
        ],
      },
    ],
    systemInstruction: {
      parts: [
        {
          text: isConfirm
            ? EVIDENCE_JUDGE_CONFIRM_INSTRUCTION
            : EVIDENCE_JUDGE_SYSTEM_INSTRUCTION,
        },
      ],
    },
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 400,
      responseMimeType: "application/json",
    },
  };

  try {
    const response = await requestGemini(
      cleanKey,
      buildGeminiUrls(":generateContent"),
      { method: "POST", body: JSON.stringify(requestBody) },
      { operation: "judge_evidence", timeoutMs, retries: 0 }
    );
    const data = await response.json();
    const candidate = data?.candidates?.[0] || {};
    const text = (candidate?.content?.parts || []).map((p) => p?.text || "").join("");
    const parsed = parseJudgeJson(text);
    if (!parsed || typeof parsed.onTopic !== "boolean") {
      console.warn(`[evidence-judge] unusable response, treating as on-topic: ${text.slice(0, 160)}`);
      return { onTopic: true, confidence: 0, reason: "unparseable judge response", judged: false };
    }
    const confidence = Number.isFinite(Number(parsed.confidence))
      ? Math.max(0, Math.min(1, Number(parsed.confidence)))
      : 0;
    // Refuse only on a confident off-topic call; anything shakier answers.
    const onTopic = parsed.onTopic === true || confidence < EVIDENCE_JUDGE_MIN_CONFIDENCE;
    console.log(
      `[evidence-judge${isConfirm ? ":confirm" : ""}] onTopic=${onTopic} raw=${parsed.onTopic} conf=${confidence.toFixed(2)} ` +
        `excerptSubject="${String(parsed.excerptSubject || "").slice(0, 60)}" q="${String(question).slice(0, 60)}"`
    );
    return {
      onTopic,
      confidence,
      excerptSubject: String(parsed.excerptSubject || "").slice(0, 160),
      reason: String(parsed.reason || "").slice(0, 300),
      judged: true,
    };
  } catch (error) {
    // A judge that cannot run must not become a refusal.
    console.warn(`[evidence-judge] failed, treating as on-topic: ${error?.message || error}`);
    return {
      onTopic: true,
      confidence: 0,
      reason: `judge unavailable: ${error?.message || error}`,
      judged: false,
    };
  }
}

export async function generateAnswer({ apiKey, question, chunks, subjectId, options = {} }) {
  const cleanKey = String(apiKey || "").trim();
  if (!cleanKey) {
    throw new GeminiApiError({
      message: "Missing Gemini API key for answer generation.",
      status: 401,
      code: "GEMINI_INVALID_KEY",
      userMessage: "Please provide a valid Gemini API key to proceed.",
      operation: "generate_answer",
    });
  }

  if (!chunks || chunks.length === 0) {
    throw new Error("No evidence chunks provided to generateAnswer");
  }

  const userPrompt = buildRagPrompt({ question, chunks, subjectId });

  const requestBody = {
    contents: [
      { role: "user", parts: [{ text: userPrompt }] },
    ],
    systemInstruction: {
      parts: [{ text: RAG_ANSWER_SYSTEM_INSTRUCTION }],
    },
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
    ],
    generationConfig: buildGeminiGenerationConfig({
      maxOutputTokens: options.maxOutputTokens || 8192,
      temperature: options.temperature ?? 0.0,
      topP: options.topP ?? 1,
    }),
  };

  const response = await requestGemini(
    cleanKey,
    buildGeminiUrls(":generateContent"),
    {
      method: "POST",
      body: JSON.stringify(requestBody),
    },
    {
      operation: "generate_answer",
      timeoutMs: options.timeoutMs || GEMINI_REQUEST_TIMEOUT_MS,
      retries: options.retries ?? GEMINI_MAX_RETRIES,
    }
  );

  const data = await response.json();
  const candidate = data?.candidates?.[0] || {};
  const parts = candidate?.content?.parts || [];
  const text = parts.map((part) => part?.text || "").join("");
  const answerWordLimit = detectWordLimit(question, subjectId);
  const finishReason = candidate?.finishReason;

  // Distinguish "the filter fired" from "the model produced nothing". A blocked
  // response carries a finishReason but no text, so it can never be salvaged.
  const blockedWithNoText =
    !text.trim() && finishReason && SAFETY_FINISH_REASONS.has(finishReason);

  if (!text.trim() && !blockedWithNoText) {
    throw new GeminiApiError({
      message: "Gemini returned an empty response or was blocked by safety filters.",
      status: 502,
      code: "GEMINI_EMPTY_RESPONSE",
      userMessage: "Unable to generate an answer. Please try rephrasing your question.",
      operation: "generate_answer",
    });
  }

  const cleaned = restoreExactDiagrams(cleanModelOutput(text), chunks);
  const framed = ensureFrameStructure(cleaned);
  const enforced = enforceWordLimit(framed.text, answerWordLimit);
  const stoppedByFilter = Boolean(text.trim()) && SAFETY_FINISH_REASONS.has(finishReason);

  return {
    answer: stoppedByFilter
      ? `${enforced.answer}\n\n**Response stopped early by model ${String(finishReason).toLowerCase()} filters. What you see is the part generated before they triggered.**`
      : enforced.answer,
    modelUsed: getGeminiModel(),
    usage: data?.usageMetadata || null,
    wordCount: enforced.wordCount,
    wordLimit: answerWordLimit || null,
    wordLimitClamped: enforced.clamped,
    ...(stoppedByFilter ? { truncated: true, stoppedByFilter: true, finishReason } : {}),
  };
}
