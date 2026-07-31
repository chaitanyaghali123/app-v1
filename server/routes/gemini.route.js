import express from "express";
import {
  decryptGeminiApiKeyRecord,
  encrypt,
  fingerprintGeminiApiKey,
  proxyGeminiCall,
  toPublicGeminiError,
  validateGeminiApiKey,
} from "../services/gemini.service.js";
import {
  deleteGeminiKey,
  getGeminiKeyRecord,
  markGeminiKeyFailure,
  markGeminiKeyValidated,
  upsertGeminiKey,
} from "../services/db.service.js";
import { createConcurrencyLimiter, createRateLimiter } from "../middleware/rateLimiter.js";
import {
  enforceGeminiAbusePolicy,
  recordGeminiFailureForAbuse,
} from "../services/gemini-abuse.service.js";
import {
  anonymizeIdentifier,
  getGeminiMetricsJson,
  getGeminiMetricsPrometheus,
  logGeminiEvent,
  recordGeminiMetric,
} from "../services/gemini-monitoring.service.js";
import { isDistributedCacheEnabled } from "../config/redis.js";

const router = express.Router();

const MAX_GEMINI_CHUNKS = Number(process.env.GEMINI_MAX_CHUNKS || 25);
const MAX_GEMINI_CONTEXT_CHARS = Number(process.env.GEMINI_MAX_CONTEXT_CHARS || 40000);
const MAX_GEMINI_TARGET_TOKENS = Number(process.env.GEMINI_MAX_TARGET_TOKENS || 4096);

const deviceKey = (req) => req.body?.deviceId || req.ip;
const ipKey = (req) => req.ip;

const storeKeyLimiter = createRateLimiter(
  Number(process.env.GEMINI_STORE_KEY_RATE_LIMIT || 30),
  60,
  { keyPrefix: "gemini:store", keyGenerator: ipKey }
);

const proxyDeviceLimiter = createRateLimiter(
  Number(process.env.GEMINI_PROXY_DEVICE_RATE_LIMIT || 20),
  60,
  { keyPrefix: "gemini:proxy:device", keyGenerator: deviceKey }
);

const proxyIpLimiter = createRateLimiter(
  Number(process.env.GEMINI_PROXY_IP_RATE_LIMIT || 300),
  60,
  { keyPrefix: "gemini:proxy:ip", keyGenerator: ipKey }
);

const proxyConcurrencyLimiter = createConcurrencyLimiter(
  Number(process.env.GEMINI_MAX_CONCURRENT_PER_DEVICE || 2),
  { keyPrefix: "gemini:proxy", keyGenerator: deviceKey }
);

function isValidDeviceId(deviceId) {
  return typeof deviceId === "string" && deviceId.length >= 8 && deviceId.length <= 160;
}

function sanitizeGeminiRequest(body) {
  const question = typeof body.question === "string" ? body.question.trim() : "";
  const chunks = Array.isArray(body.chunks) ? body.chunks : [];

  if (!question) {
    return { error: "question is required." };
  }
  if (question.length > 4000) {
    return { error: "question is too long." };
  }
  if (!chunks.length) {
    return { error: "chunks are required." };
  }
  if (chunks.length > MAX_GEMINI_CHUNKS) {
    return { error: `Too many chunks. Maximum allowed is ${MAX_GEMINI_CHUNKS}.` };
  }

  let totalChars = 0;
  const safeChunks = chunks
    .map((chunk) => {
      const text = typeof chunk?.text === "string" ? chunk.text.trim() : "";
      totalChars += text.length;
      return {
        text,
        facet: typeof chunk?.facet === "string" ? chunk.facet.slice(0, 120) : undefined,
        source: typeof chunk?.source === "string" ? chunk.source.slice(0, 240) : undefined,
        id: typeof chunk?.id === "string" ? chunk.id.slice(0, 120) : undefined,
      };
    })
    .filter((chunk) => chunk.text);

  if (!safeChunks.length) {
    return { error: "chunks must contain text." };
  }
  if (totalChars > MAX_GEMINI_CONTEXT_CHARS) {
    return {
      error: `Gemini context is too large. Maximum allowed is ${MAX_GEMINI_CONTEXT_CHARS} characters.`,
    };
  }

  const targetTokens = Math.min(
    Math.max(Number(body.targetTokens) || 1400, 1),
    MAX_GEMINI_TARGET_TOKENS
  );

  return {
    value: {
      question,
      chunks: safeChunks,
      targetTokens,
      mode: typeof body.mode === "string" ? body.mode : "limited",
    },
  };
}

function sendGeminiError(res, err) {
  const { status, body } = toPublicGeminiError(err);
  if (body.retryAfter) {
    res.setHeader("Retry-After", body.retryAfter);
  }
  return res.status(status).json(body);
}

function getContextChars(chunks) {
  return chunks.reduce((sum, chunk) => sum + (chunk.text?.length || 0), 0);
}

function requireMetricsAuth(req, res, next) {
  const token = process.env.GEMINI_METRICS_TOKEN;
  if (!token && process.env.NODE_ENV !== "production") {
    return next();
  }

  const authHeader = req.headers.authorization || "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const provided = bearer || req.headers["x-metrics-token"];
  if (token && provided === token) {
    return next();
  }

  return res.status(404).json({ error: "Not found" });
}

router.post("/gemini/store-key", storeKeyLimiter, async (req, res) => {
  const startedAt = Date.now();
  let deviceId = null;
  try {
    ({ deviceId } = req.body);
    const { apiKey } = req.body;
    if (!isValidDeviceId(deviceId) || !apiKey) {
      return res.status(400).json({ error: "deviceId and apiKey are required." });
    }

    const cleanKey = String(apiKey).trim();
    if (process.env.GEMINI_VALIDATE_KEYS_ON_SAVE !== "false") {
      await validateGeminiApiKey(cleanKey);
    }

    const encrypted = encrypt(cleanKey);
    await upsertGeminiKey(deviceId, encrypted, {
      keyHash: fingerprintGeminiApiKey(cleanKey),
    });

    recordGeminiMetric({
      route: "store_key",
      outcome: "success",
      latencyMs: Date.now() - startedAt,
    });
    logGeminiEvent("gemini_store_key_success", {
      device: anonymizeIdentifier(deviceId),
      ip: anonymizeIdentifier(req.ip),
      latencyMs: Date.now() - startedAt,
    });
    return res.json({ stored: true });
  } catch (err) {
    const publicError = toPublicGeminiError(err);
    recordGeminiMetric({
      route: "store_key",
      outcome: "error",
      code: publicError.body.code,
      latencyMs: Date.now() - startedAt,
    });
    if (deviceId) {
      try {
        await recordGeminiFailureForAbuse({
          deviceId,
          ip: req.ip,
          code: publicError.body.code,
        });
      } catch (abuseErr) {
        console.error("[gemini] failed to persist store-key abuse state:", abuseErr.message);
      }
    }
    console.error("[gemini] store-key error:", err.code || err.message);
    return sendGeminiError(res, err);
  }
});

router.post(
  "/gemini/proxy",
  proxyIpLimiter,
  proxyDeviceLimiter,
  proxyConcurrencyLimiter,
  async (req, res) => {
    const startedAt = Date.now();
    let deviceId = null;
    let keyHash = null;
    let contextChars = 0;

    try {
      deviceId = req.body?.deviceId;
      if (!isValidDeviceId(deviceId)) {
        return res.status(400).json({ error: "deviceId is required." });
      }

      const parsed = sanitizeGeminiRequest(req.body);
      if (parsed.error) {
        return res.status(400).json({ error: parsed.error });
      }
      const { question, chunks, targetTokens, mode } = parsed.value;
      contextChars = getContextChars(chunks);

      const keyRecord = await getGeminiKeyRecord(deviceId);
      if (!keyRecord?.encrypted_key) {
        return res.status(404).json({
          error: "No API key found for this device. Please store your key first.",
          code: "GEMINI_KEY_NOT_FOUND",
        });
      }

      const apiKey = await decryptGeminiApiKeyRecord(keyRecord);
      keyHash = keyRecord.key_hash || fingerprintGeminiApiKey(apiKey);

      await enforceGeminiAbusePolicy({
        deviceId,
        ip: req.ip,
        keyHash,
        contextChars,
        targetTokens,
      });

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      });

      if (req.socket) req.socket.setNoDelay(true);

      const result = await proxyGeminiCall(apiKey, {
        question,
        chunks,
        targetTokens,
        mode,
        onToken: (token) => {
          res.write(`data: ${JSON.stringify({ type: "token", text: token })}\n\n`);
          if (typeof res.flush === "function") res.flush();
        },
        onStatus: (status) => {
          res.write(`data: ${JSON.stringify({ type: "status", status })}\n\n`);
          if (typeof res.flush === "function") res.flush();
        },
      });

      await markGeminiKeyValidated(deviceId);
      recordGeminiMetric({
        route: "proxy",
        outcome: "success",
        latencyMs: Date.now() - startedAt,
        tokenCount: result.tokenCount || 0,
        contextChars,
      });
      logGeminiEvent("gemini_proxy_success", {
        device: anonymizeIdentifier(deviceId),
        key: anonymizeIdentifier(keyHash),
        ip: anonymizeIdentifier(req.ip),
        latencyMs: Date.now() - startedAt,
        tokenCount: result.tokenCount || 0,
        contextChars,
      });
      res.write(
        `data: ${JSON.stringify({
          type: "done",
          answer: result.answer,
          tokenCount: result.tokenCount,
          sentenceScores: result.sentenceScores,
          chunkScores: result.chunkScores,
        })}\n\n`
      );
      return res.end();
    } catch (err) {
      const publicError = toPublicGeminiError(err);
      recordGeminiMetric({
        route: "proxy",
        outcome: "error",
        code: publicError.body.code,
        latencyMs: Date.now() - startedAt,
        contextChars,
      });
      logGeminiEvent("gemini_proxy_error", {
        device: anonymizeIdentifier(deviceId),
        key: anonymizeIdentifier(keyHash),
        ip: anonymizeIdentifier(req.ip),
        code: publicError.body.code,
        latencyMs: Date.now() - startedAt,
      });
      console.error("[gemini] proxy error:", err.code || err.message);

      if (deviceId && publicError.body.code) {
        try {
          await markGeminiKeyFailure(deviceId, publicError.body.code);
          await recordGeminiFailureForAbuse({
            deviceId,
            ip: req.ip,
            keyHash,
            code: publicError.body.code,
          });
        } catch (dbErr) {
          console.error("[gemini] failed to persist key health/abuse state:", dbErr.message);
        }
      }

      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ type: "error", ...publicError.body })}\n\n`);
        return res.end();
      }

      if (publicError.body.retryAfter) {
        res.setHeader("Retry-After", publicError.body.retryAfter);
      }
      return res.status(publicError.status).json(publicError.body);
    }
  }
);

router.get("/gemini/health", (_req, res) => {
  res.json({
    status: "ok",
    feature: "gemini-byok",
    distributedRateLimits: isDistributedCacheEnabled(),
    abuseProtection: process.env.GEMINI_ABUSE_PROTECTION_DISABLED !== "true",
    limits: {
      maxChunks: MAX_GEMINI_CHUNKS,
      maxContextChars: MAX_GEMINI_CONTEXT_CHARS,
      maxTargetTokens: MAX_GEMINI_TARGET_TOKENS,
      proxyDeviceRateLimitPerMinute: Number(process.env.GEMINI_PROXY_DEVICE_RATE_LIMIT || 20),
      proxyIpRateLimitPerMinute: Number(process.env.GEMINI_PROXY_IP_RATE_LIMIT || 300),
      proxyKeyRateLimitPerMinute: Number(process.env.GEMINI_PROXY_KEY_RATE_LIMIT || 120),
      maxConcurrentPerDevice: Number(process.env.GEMINI_MAX_CONCURRENT_PER_DEVICE || 2),
      maxDevicesPerKeyPerDay: Number(process.env.GEMINI_MAX_DEVICES_PER_KEY_PER_DAY || 5),
    },
  });
});

router.get("/gemini/metrics", requireMetricsAuth, (req, res) => {
  if (req.query.format === "json" || req.headers.accept?.includes("application/json")) {
    return res.json(getGeminiMetricsJson());
  }

  res.setHeader("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
  return res.send(getGeminiMetricsPrometheus());
});

router.delete("/gemini/store-key", async (req, res) => {
  try {
    const { deviceId } = req.body;
    if (!isValidDeviceId(deviceId)) {
      return res.status(400).json({ error: "deviceId is required." });
    }
    await deleteGeminiKey(deviceId);
    return res.json({ deleted: true });
  } catch (err) {
    console.error("[gemini] delete-key error:", err.message);
    return res.status(500).json({ error: "Failed to delete API key." });
  }
});

export default router;
