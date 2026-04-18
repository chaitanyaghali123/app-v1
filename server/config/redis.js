import Redis from "ioredis";

// -----------------------------
// Redis Client
// -----------------------------
const redis = new Redis({
  host: process.env.REDIS_HOST || "aryabhata-redis", // ✅ docker service
  port: parseInt(process.env.REDIS_PORT) || 6379,

  // Optional (for cloud later)
  username: process.env.REDIS_USERNAME || undefined,
  password: process.env.REDIS_PASSWORD || undefined,

  // ✅ Reliability
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,

  // ✅ Auto reconnect strategy
  retryStrategy(times) {
    const delay = Math.min(times * 100, 2000);
    console.log(`🔁 Redis retry ${times}, delay ${delay}ms`);
    return delay;
  }
});

// -----------------------------
// Events (important for debugging)
// -----------------------------
redis.on("connect", () => {
  console.log("✅ Redis connected");
});

redis.on("ready", () => {
  console.log("🚀 Redis ready");
});

redis.on("error", (err) => {
  console.error("❌ Redis error:", err.message);
});

redis.on("close", () => {
  console.warn("⚠️ Redis connection closed");
});

redis.on("reconnecting", () => {
  console.log("🔄 Redis reconnecting...");
});

// -----------------------------
// Helper functions (clean usage)
// -----------------------------

// ✅ Set cache with TTL
export async function setCache(key, value, ttl = 60) {
  try {
    await redis.set(key, JSON.stringify(value), "EX", ttl);
  } catch (err) {
    console.error("Redis SET error:", err);
  }
}

// ✅ Get cache
export async function getCache(key) {
  try {
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  } catch (err) {
    console.error("Redis GET error:", err);
    return null;
  }
}

// ✅ Delete cache
export async function deleteCache(key) {
  try {
    await redis.del(key);
  } catch (err) {
    console.error("Redis DEL error:", err);
  }
}

// -----------------------------
// Export
// -----------------------------
export default redis;