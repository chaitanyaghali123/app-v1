// routes/auth.route.js

import express from "express";
import { signup, login, refresh, logout } from "../controllers/auth.controller.js";
import { createRateLimiter } from "../middleware/rateLimiter.js";

const router = express.Router();

// -----------------------------
// 🔐 Rate limit configs
// -----------------------------
const signupLimiter = createRateLimiter(
  process.env.NODE_ENV === "development" ? 100 : 5,
  60
);

const loginLimiter = createRateLimiter(
  process.env.NODE_ENV === "development" ? 100 : 10,
  60
);

const refreshLimiter = createRateLimiter(
  process.env.NODE_ENV === "development" ? 200 : 20,
  60
);

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