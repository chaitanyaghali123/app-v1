import redis from "../config/redis.js";

export function createRateLimiter(maxRequests, windowSeconds = 60) {
  return async (req, res, next) => {
    try {
      const userId =
        req.body?.user_id ||
        req.query?.user_id ||
        req.headers["x-user-id"] ||
        req.ip;

      // ✅ Skip limiter if disabled or in dev mode
      if (process.env.RATE_LIMIT_DISABLED === "true" || process.env.NODE_ENV === "development") {
        return next();
      }

      const key = `rate:${userId}:${req.path}`;

      // 🔥 TIMEOUT PROTECTION
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Redis timeout")), 200) // safer timeout
      );

      const current = await Promise.race([
        redis.incr(key),
        timeoutPromise
      ]);

      if (current === 1) {
        await redis.expire(key, windowSeconds);
      }

      const ttl = await redis.ttl(key);

      res.setHeader("X-RateLimit-Limit", maxRequests);
      res.setHeader("X-RateLimit-Remaining", Math.max(0, maxRequests - current));
      res.setHeader("X-RateLimit-Reset", ttl);

      if (current > maxRequests) {
        return res.status(429).json({
          error: "Too many requests",
          retry_after: ttl
        });
      }

      return next();

    } catch (err) {
      console.error("❌ Rate limiter error:", err.message);
      // 🔥 FAIL OPEN (never block user if Redis fails)
      return next();
    }
  };
}
