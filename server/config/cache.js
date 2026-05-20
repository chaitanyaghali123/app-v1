// config/cache.js

/**
 * Answer TTL (cache duration)
 * Read from .env, fallback to 120 seconds
 * ⚠️ Note: frontend uses milliseconds, backend uses seconds
 */
export const ANSWER_TTL = parseInt(process.env.ANSWER_TTL, 10) || 120;
