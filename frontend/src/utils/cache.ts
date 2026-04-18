// frontend/src/utils/cache.ts

const ANSWER_TTL = Number(import.meta.env.VITE_ANSWER_TTL) || 120000;
const MAX_ENTRIES = Number(import.meta.env.VITE_CACHE_MAX_ENTRIES) || 50;

type CacheEntry = { value: any; expiry: number };
const memoryCache: Record<string, CacheEntry> = {};
const cacheOrder: string[] = [];

function evictIfNeeded() {
  while (cacheOrder.length > MAX_ENTRIES) {
    const oldestKey = cacheOrder.shift();
    if (oldestKey) {
      delete memoryCache[oldestKey];
      localStorage.removeItem(oldestKey);
    }
  }
}

export function getCached(key: string) {
  const entry =
    memoryCache[key] ||
    JSON.parse(localStorage.getItem(key) || "null");

  if (!entry) return null;

  if (Date.now() > entry.expiry) {
    delete memoryCache[key];
    localStorage.removeItem(key);
    return null;
  }

  console.log("⚡ UI cache hit:", key);
  return entry.value;
}

export function setCached(key: string, value: any, ttlMs?: number) {
  const ttl = ttlMs ?? ANSWER_TTL; // ✅ simplified

  const entry: CacheEntry = {
    value,
    expiry: Date.now() + ttl,
  };

  memoryCache[key] = entry;
  localStorage.setItem(key, JSON.stringify(entry));

  if (!cacheOrder.includes(key)) cacheOrder.push(key);
  evictIfNeeded();
}