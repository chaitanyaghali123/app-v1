const store = new Map();

let redis = null;
let redisReady = false;

if (process.env.REDIS_URL || process.env.REDIS_HOST) {
  try {
    const { default: Redis } = await import("ioredis");
    redis = process.env.REDIS_URL
      ? new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 3 })
      : new Redis({
          host: process.env.REDIS_HOST,
          port: Number(process.env.REDIS_PORT || 6379),
          username: process.env.REDIS_USERNAME || undefined,
          password: process.env.REDIS_PASSWORD || undefined,
          maxRetriesPerRequest: 3,
        });

    redis.on("connect", () => console.log("[redis] connected"));
    redis.on("ready", () => {
      redisReady = true;
      console.log("[redis] ready");
    });
    redis.on("close", () => {
      redisReady = false;
    });
    redis.on("end", () => {
      redisReady = false;
    });
    redis.on("error", (err) => {
      redisReady = false;
      console.error("[redis] error:", err.message);
    });
  } catch (err) {
    console.warn("[redis] ioredis unavailable; using in-memory cache:", err.message);
    redis = null;
  }
}

function getMemoryEntry(key) {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    store.delete(key);
    return null;
  }
  return entry;
}

export async function setCache(key, value, ttl = 60) {
  if (redis) {
    await redis.set(key, JSON.stringify(value), "EX", ttl);
    return;
  }
  store.set(key, { data: value, expires: Date.now() + ttl * 1000 });
}

export async function getCache(key) {
  if (redis) {
    const value = await redis.get(key);
    return value ? JSON.parse(value) : null;
  }

  const entry = getMemoryEntry(key);
  return entry ? entry.data : null;
}

export async function deleteCache(key) {
  if (redis) {
    await redis.del(key);
    return;
  }
  store.delete(key);
}

const cache = {
  async incr(key) {
    if (redis) {
      return redis.incr(key);
    }

    const existing = getMemoryEntry(key);
    const entry = existing || { count: 0, expires: 0 };
    entry.count = (entry.count || 0) + 1;
    if (!entry.expires) entry.expires = Date.now() + 60000;
    store.set(key, entry);
    return entry.count;
  },

  async incrBy(key, value) {
    if (redis) {
      return redis.incrby(key, value);
    }

    const existing = getMemoryEntry(key);
    const entry = existing || { count: 0, expires: 0 };
    entry.count = (entry.count || 0) + Number(value || 0);
    if (!entry.expires) entry.expires = Date.now() + 60000;
    store.set(key, entry);
    return entry.count;
  },

  async expire(key, seconds) {
    if (redis) {
      await redis.expire(key, seconds);
      return;
    }

    const entry = store.get(key);
    if (entry) entry.expires = Date.now() + seconds * 1000;
  },

  async ttl(key) {
    if (redis) {
      return redis.ttl(key);
    }

    const entry = getMemoryEntry(key);
    if (!entry) return -2;
    const remaining = Math.ceil((entry.expires - Date.now()) / 1000);
    return remaining > 0 ? remaining : -2;
  },

  async sadd(key, member) {
    if (redis) {
      return redis.sadd(key, member);
    }

    const existing = getMemoryEntry(key);
    const entry = existing || { set: new Set(), expires: 0 };
    if (!entry.set) entry.set = new Set();
    entry.set.add(String(member));
    store.set(key, entry);
    return entry.set.size;
  },

  async scard(key) {
    if (redis) {
      return redis.scard(key);
    }

    const entry = getMemoryEntry(key);
    return entry?.set?.size || 0;
  },
};

export function isDistributedCacheEnabled() {
  return Boolean(redis && redisReady);
}

export function getRedisClient() {
  return redis;
}

export default cache;
