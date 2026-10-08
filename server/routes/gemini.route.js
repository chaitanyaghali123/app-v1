import express from "express";
import {
  encrypt,
  fingerprintGeminiApiKey,
  toPublicGeminiError,
  validateGeminiApiKey,
} from "../services/gemini.service.js";
import {
  deleteGeminiKey,
  upsertGeminiKey,
} from "../services/db.service.js";
import { createRateLimiter } from "../middleware/rateLimiter.js";
import {
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
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

const MAX_GEMINI_TARGET_TOKENS = Number(process.env.GEMINI_MAX_TARGET_TOKENS || 4096);

const ipKey = (req) => req.ip;

const storeKeyLimiter = createRateLimiter(
  Number(process.env.GEMINI_STORE_KEY_RATE_LIMIT || 30),
  60,
  { keyPrefix: "gemini:store", keyGenerator: ipKey }
);

function isValidDeviceId(deviceId) {
  return typeof deviceId === "string" && deviceId.length >= 8 && deviceId.length <= 160;
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

function sendGeminiError(res, err) {
  const { status, body } = toPublicGeminiError(err);
  if (body.retryAfter) {
    res.setHeader("Retry-After", body.retryAfter);
  }
  return res.status(status).json(body);
}

router.post("/gemini/store-key", storeKeyLimiter, authenticate, async (req, res) => {
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
      userId: req.user?.id || null,
    });

    try {
      const fs = await import("fs");
      fs.appendFileSync(
        "/app/uploads/rag-debug.log",
        `${new Date().toISOString()} STORE_KEY device=${deviceId} fp=${fingerprintGeminiApiKey(cleanKey).slice(0, 16)} ip=${req.ip}\n`
      );
    } catch {}

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


router.get("/gemini/health", (_req, res) => {
  res.json({
    status: "ok",
    feature: "gemini-byok",
    distributedRateLimits: isDistributedCacheEnabled(),
    limits: {
      maxTargetTokens: MAX_GEMINI_TARGET_TOKENS,
      storeKeyRateLimitPerMinute: Number(process.env.GEMINI_STORE_KEY_RATE_LIMIT || 30),
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

router.delete("/gemini/store-key", authenticate, async (req, res) => {
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
