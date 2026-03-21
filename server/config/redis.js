import Redis from "ioredis";

const redis = new Redis({
  host: process.env.REDIS_HOST || "aryabhata-redis", // matches docker-compose service name
  port: 6379,
});

redis.on("connect", () => console.log("✅ Redis connected"));
redis.on("error", (err) => console.error("❌ Redis error:", err));

export default redis;
