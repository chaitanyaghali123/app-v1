import express from "express";
import {
  signup,
  login,
  refresh,
  logout,
  verifyEmail,
  resendVerification,
  forgotPassword,
  resetPassword,
  getMe,
  updateMe,
  changePassword,
  deleteAccount,
} from "../controllers/auth.controller.js";
import { authenticate } from "../middleware/auth.js";
import { createRateLimiter } from "../middleware/rateLimiter.js";

const router = express.Router();

const ipKey = (req) => req.ip;

const signupLimiter = createRateLimiter(
  Number(process.env.AUTH_SIGNUP_RATE_LIMIT || 10),
  60,
  { keyPrefix: "auth:signup", keyGenerator: ipKey }
);

const loginLimiter = createRateLimiter(
  Number(process.env.AUTH_LOGIN_RATE_LIMIT || 15),
  60,
  { keyPrefix: "auth:login", keyGenerator: ipKey }
);

const otpLimiter = createRateLimiter(
  Number(process.env.AUTH_OTP_RATE_LIMIT || 5),
  60,
  { keyPrefix: "auth:otp", keyGenerator: ipKey }
);

// ✅ Signup route
router.post("/signup", signupLimiter, signup);

// ✅ Login route
router.post("/login", loginLimiter, login);

// ✅ Refresh token route
router.post("/refresh", refresh);

// ✅ Logout route
router.post("/logout", logout);

// ✅ Email verification
router.post("/verify-email", otpLimiter, verifyEmail);
router.post("/resend-verification", otpLimiter, resendVerification);

// ✅ Password reset
router.post("/forgot-password", otpLimiter, forgotPassword);
router.post("/reset-password", otpLimiter, resetPassword);

// ✅ Profile (protected)
router.get("/me", authenticate, getMe);
router.put("/me", authenticate, updateMe);
router.post("/change-password", authenticate, changePassword);
router.delete("/me", authenticate, deleteAccount);

export default router;