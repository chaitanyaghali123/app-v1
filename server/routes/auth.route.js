import express from "express";
import { signup, login, refresh, logout } from "../controllers/auth.controller.js";
import { createRateLimiter } from "../middleware/rateLimiter.js";

const router = express.Router();

// -----------------------------
// 🔐 Rate limit configs
// -----------------------------
const signupLimiter = createRateLimiter(5, 60);     // 5 requests/min
const loginLimiter = createRateLimiter(10, 60);     // 10 requests/min
const refreshLimiter = createRateLimiter(20, 60);   // 20 requests/min

// -----------------------------
// Routes
// -----------------------------

// ✅ Signup (strict - prevent spam accounts)
router.post("/signup", signupLimiter, signup);

// ✅ Login (protect brute-force attacks)
router.post("/login", loginLimiter, login);

// ✅ Refresh token (moderate usage)
router.post("/refresh", refreshLimiter, refresh);

// ✅ Logout (safe - no limiter needed)
router.post("/logout", logout);

export default router;