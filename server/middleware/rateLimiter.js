import cache from "../config/redis.js";

const activeConcurrency = new Map();

function defaultRateKey(req) {
  return req.user?.id || req.ip || "anonymous";
}

function normalizeRateKey(value) {
  return String(value || "anonymous").replace(/[^a-zA-Z0-9:._-]/g, "_").slice(0, 160);
}

export function createRateLimiter(maxRequests, windowSeconds = 60, options = {}) {
  const keyGenerator = options.keyGenerator || defaultRateKey;
  const keyPrefix = options.keyPrefix || "rate";

  return async (req, res, next) => {
    try {
      if (process.env.RATE_LIMIT_DISABLED === "true" || process.env.NODE_ENV === "development") {
        return next();
      }

      const userId = normalizeRateKey(keyGenerator(req));

      const key = `${keyPrefix}:${userId}:${req.path}`;
      const current = await cache.incr(key);

      if (current === 1) {
        await cache.expire(key, windowSeconds);
      }

      const ttl = Math.max(1, await cache.ttl(key));

      res.setHeader("X-RateLimit-Limit", maxRequests);
      res.setHeader("X-RateLimit-Remaining", Math.max(0, maxRequests - current));
      res.setHeader("X-RateLimit-Reset", ttl);

      if (current > maxRequests) {
        return res.status(429).json({ error: "Too many requests", retry_after: ttl });
      }

      return next();
    } catch (err) {
      console.error("❌ Rate limiter error:", err.message);
      return res.status(429).json({ error: "Too many requests", retry_after: 60 });
    }
  };
}

export function createConcurrencyLimiter(maxConcurrent, options = {}) {
  const keyGenerator = options.keyGenerator || defaultRateKey;
  const keyPrefix = options.keyPrefix || "concurrent";

  return (req, res, next) => {
    if (!Number.isFinite(maxConcurrent) || maxConcurrent <= 0) {
      return next();
    }
    if (process.env.RATE_LIMIT_DISABLED === "true") {
      return next();
    }

    const key = `${keyPrefix}:${normalizeRateKey(keyGenerator(req))}:${req.path}`;
    const current = activeConcurrency.get(key) || 0;

    if (current >= maxConcurrent) {
      return res.status(429).json({
        error: "Too many concurrent requests. Please wait for the current answer to finish.",
        code: "TOO_MANY_CONCURRENT_REQUESTS",
        retry_after: 10,
      });
    }

    activeConcurrency.set(key, current + 1);

    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      const nextCount = Math.max(0, (activeConcurrency.get(key) || 1) - 1);
      if (nextCount === 0) {
        activeConcurrency.delete(key);
      } else {
        activeConcurrency.set(key, nextCount);
      }
    };

    res.on("finish", release);
    res.on("close", release);
    return next();
  };
}
