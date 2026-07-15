import cache, { getCache, setCache } from "../config/redis.js";

const DAY_SECONDS = 24 * 60 * 60;
const FIFTEEN_MINUTES_SECONDS = 15 * 60;

function readPositiveInt(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function sanitizeKeyPart(value) {
  return String(value || "unknown").replace(/[^a-zA-Z0-9:._-]/g, "_").slice(0, 160);
}

function makeLimitError(message, code, retryAfter = 60) {
  const error = new Error(message);
  error.name = "GeminiAbuseError";
  error.status = 429;
  error.code = code;
  error.retryAfterSeconds = retryAfter;
  error.userMessage = message;
  return error;
}

async function incrementWindow(key, limit, windowSeconds, value = 1) {
  const amount = Math.max(1, Number(value || 1));
  const current = amount === 1 ? await cache.incr(key) : await cache.incrBy(key, amount);
  if (current === amount) {
    await cache.expire(key, windowSeconds);
  }

  const retryAfter = Math.max(1, await cache.ttl(key));
  return {
    allowed: current <= limit,
    current,
    limit,
    retryAfter,
  };
}

async function assertNotLocked(lockKey, message, code) {
  const locked = await getCache(lockKey);
  if (locked) {
    throw makeLimitError(message, code, FIFTEEN_MINUTES_SECONDS);
  }
}

export async function enforceGeminiAbusePolicy({
  deviceId,
  ip,
  keyHash,
  contextChars,
  targetTokens,
}) {
  if (process.env.GEMINI_ABUSE_PROTECTION_DISABLED === "true") {
    return;
  }

  const safeDeviceId = sanitizeKeyPart(deviceId);
  const safeIp = sanitizeKeyPart(ip);
  const safeKeyHash = sanitizeKeyPart(keyHash).slice(0, 64);
  const estimatedTokens = Math.ceil(Number(contextChars || 0) / 4) + Number(targetTokens || 0);

  await assertNotLocked(
    `gemini:abuse:lock:device:${safeDeviceId}`,
    "Too many failed Gemini requests from this device. Please wait and try again.",
    "GEMINI_DEVICE_TEMPORARILY_BLOCKED"
  );
  await assertNotLocked(
    `gemini:abuse:lock:ip:${safeIp}`,
    "Too many failed Gemini requests from this network. Please wait and try again.",
    "GEMINI_NETWORK_TEMPORARILY_BLOCKED"
  );

  const devicesForKey = `gemini:abuse:key_devices:${safeKeyHash}`;
  await cache.sadd(devicesForKey, safeDeviceId);
  await cache.expire(devicesForKey, DAY_SECONDS);
  const uniqueDevices = await cache.scard(devicesForKey);
  const maxDevices = readPositiveInt("GEMINI_MAX_DEVICES_PER_KEY_PER_DAY", 5);
  if (uniqueDevices > maxDevices) {
    throw makeLimitError(
      "This Gemini key is being used on too many devices today. Please use your own key.",
      "GEMINI_KEY_SHARED_TOO_MUCH",
      DAY_SECONDS
    );
  }

  const keyMinute = await incrementWindow(
    `gemini:abuse:key_minute:${safeKeyHash}`,
    readPositiveInt("GEMINI_PROXY_KEY_RATE_LIMIT", 120),
    60
  );
  if (!keyMinute.allowed) {
    throw makeLimitError(
      "This Gemini key is receiving too many requests. Please wait and try again.",
      "GEMINI_KEY_RATE_LIMITED",
      keyMinute.retryAfter
    );
  }

  const deviceDaily = await incrementWindow(
    `gemini:abuse:device_day:${safeDeviceId}`,
    readPositiveInt("GEMINI_DEVICE_DAILY_LIMIT", 500),
    DAY_SECONDS
  );
  if (!deviceDaily.allowed) {
    throw makeLimitError(
      "Daily Gemini request limit reached for this device.",
      "GEMINI_DEVICE_DAILY_LIMIT_REACHED",
      deviceDaily.retryAfter
    );
  }

  const tokenBudget = await incrementWindow(
    `gemini:abuse:device_token_day:${safeDeviceId}`,
    readPositiveInt("GEMINI_DEVICE_DAILY_TOKEN_BUDGET", 1000000),
    DAY_SECONDS,
    Math.max(1, estimatedTokens)
  );
  if (!tokenBudget.allowed) {
    throw makeLimitError(
      "Daily Gemini usage limit reached for this device.",
      "GEMINI_DEVICE_DAILY_TOKEN_LIMIT_REACHED",
      tokenBudget.retryAfter
    );
  }
}

export async function recordGeminiFailureForAbuse({ deviceId, ip, code }) {
  if (process.env.GEMINI_ABUSE_PROTECTION_DISABLED === "true") {
    return;
  }

  const trackedCodes = new Set([
    "GEMINI_INVALID_KEY",
    "GEMINI_PERMISSION_DENIED",
    "GEMINI_BILLING_REQUIRED",
    "GEMINI_QUOTA_EXCEEDED",
  ]);
  if (!trackedCodes.has(code)) return;

  const failureLimit = readPositiveInt("GEMINI_FAILURE_LOCK_LIMIT", 12);
  const failureWindow = readPositiveInt("GEMINI_FAILURE_LOCK_WINDOW_SECONDS", FIFTEEN_MINUTES_SECONDS);

  const safeDeviceId = sanitizeKeyPart(deviceId);
  const safeIp = sanitizeKeyPart(ip);

  for (const [scope, value] of [
    ["device", safeDeviceId],
    ["ip", safeIp],
  ]) {
    const key = `gemini:abuse:fail:${scope}:${value}`;
    const current = await cache.incr(key);
    if (current === 1) {
      await cache.expire(key, failureWindow);
    }
    if (current >= failureLimit) {
      await setCache(`gemini:abuse:lock:${scope}:${value}`, true, failureWindow);
    }
  }
}
