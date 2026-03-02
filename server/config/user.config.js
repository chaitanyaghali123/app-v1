// config/user.config.js

/**
 * Single source of truth for PRIME vs NON-PRIME
 * Controlled only via .env (NO hardcoding)
 */
export function isPrimeUser() {
  return process.env.IS_PRIME_USER === "true";
}
