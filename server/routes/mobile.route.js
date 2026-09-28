import express from "express";
import {
  getMobileRagContext,
  getMobileAnswer,
} from "../controllers/mobile.controller.js";
import { authenticate } from "../middleware/auth.js";
import { createConcurrencyLimiter, createRateLimiter } from "../middleware/rateLimiter.js";

const router = express.Router();

const deviceKey = (req) => req.body?.deviceId || req.ip;
const ipKey = (req) => req.ip;

const answerDeviceLimiter = createRateLimiter(
  Number(process.env.GEMINI_PROXY_DEVICE_RATE_LIMIT || 20),
  60,
  { keyPrefix: "gemini:answer:device", keyGenerator: deviceKey }
);

const answerIpLimiter = createRateLimiter(
  Number(process.env.GEMINI_PROXY_IP_RATE_LIMIT || 300),
  60,
  { keyPrefix: "gemini:answer:ip", keyGenerator: ipKey }
);

const answerConcurrencyLimiter = createConcurrencyLimiter(
  Number(process.env.GEMINI_MAX_CONCURRENT_PER_DEVICE || 1),
  { keyPrefix: "gemini:answer:concurrency", keyGenerator: deviceKey }
);

router.post("/rag-context", authenticate, getMobileRagContext);
router.post(
  "/answer",
  answerIpLimiter,
  answerDeviceLimiter,
  answerConcurrencyLimiter,
  authenticate,
  getMobileAnswer
);

export default router;
