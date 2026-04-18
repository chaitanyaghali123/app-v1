import redis from "../config/redis.js"; 

// -----------------------------
// Generic rate limiter factory
// -----------------------------
export function createRateLimiter(maxRequests, windowSeconds = 60) {
  return async (req, res, next) => {
    try {
      // Prefer user_id → fallback to IP
      const userId =
        req.body?.user_id ||
        req.query?.user_id ||
        req.headers["x-user-id"] ||
        req.ip;

      const key = `rate:${userId}:${req.path}`;

      const current = await redis.incr(key);

      if (current === 1) {
        await redis.expire(key, windowSeconds);
      }

      const ttl = await redis.ttl(key);

      // ✅ Headers (important for frontend/debugging)
      res.setHeader("X-RateLimit-Limit", maxRequests);
      res.setHeader("X-RateLimit-Remaining", Math.max(0, maxRequests - current));
      res.setHeader("X-RateLimit-Reset", ttl);

      if (current > maxRequests) {
        return res.status(429).json({
          error: "Too many requests. Please slow down.",
          retry_after: ttl
        });
      }

      next();
    } catch (err) {
      console.error("Rate limiter error:", err);
      next(); // fail open
    }
  };
}