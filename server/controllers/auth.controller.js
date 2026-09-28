// controllers/auth.controller.js

import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import axios from "axios";
import {
  createUser,
  findUserByEmail,
  getUserById,
  getUserByIdWithPassword,
  updateUserProfile,
  updateUserPassword,
  setEmailVerified,
  deleteUserData,
} from "../services/user.service.js";

import {
  saveRefreshToken,
  findRefreshToken,
  deleteRefreshToken,
  deleteAllUserTokens,
  saveAuthCode,
  findActiveAuthCode,
  markAuthCodeUsed,
  invalidateAuthCodes,
} from "../services/db.service.js";

import { sendAuthCodeEmail } from "../services/email.service.js";

// -----------------------------
// Config
// -----------------------------
const AUTH_CODE_TTL_MINUTES = Number(process.env.AUTH_CODE_TTL_MINUTES || 15);

// jsonwebtoken treats numbers as SECONDS and strings via ms() as MILLISECONDS.
// The env file uses bare integers (900 = 15 min, 604800 = 7 days), so normalize
// numeric values to numbers to get the intended second-based expiry.
function normalizeTtlSeconds(value, fallback) {
  const raw = String(value || "").trim();
  if (/^\d+$/.test(raw)) return Number(raw);
  return raw || fallback;
}

const JWT_ACCESS_TTL = normalizeTtlSeconds(process.env.ACCESS_TOKEN_TTL, "15m");
const JWT_REFRESH_TTL = normalizeTtlSeconds(process.env.REFRESH_TOKEN_TTL, "7d");

function refreshTtlMs() {
  const refreshSeconds =
    typeof JWT_REFRESH_TTL === "number"
      ? JWT_REFRESH_TTL * 1000
      : (() => {
          const match = String(JWT_REFRESH_TTL).match(/^(\d+)([smhd])$/);
          if (!match) return 7 * 24 * 60 * 60 * 1000;
          const multipliers = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
          return Number(match[1]) * multipliers[match[2]];
        })();
  return refreshSeconds;
}

function isValidEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function isValidPassword(password) {
  return typeof password === "string" && password.length >= 8;
}

function generateOtp() {
  return crypto.randomInt(100000, 999999).toString();
}

function hashOtp(code) {
  return crypto.createHash("sha256").update(String(code)).digest("hex");
}

function safeUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name || "",
    email: row.email,
    phone: row.phone || "",
    emailVerified: Boolean(row.email_verified_at),
    isSubscribed: Boolean(row.is_subscribed),
    createdAt: row.created_at,
  };
}

// -----------------------------
// Token generators
// -----------------------------
function generateAccessToken(user) {
  return jwt.sign(
    { userId: user.id, email: user.email || null },
    process.env.JWT_SECRET,
    { expiresIn: JWT_ACCESS_TTL }
  );
}

function generateRefreshToken(user) {
  return jwt.sign(
    { userId: user.id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: JWT_REFRESH_TTL }
  );
}

function refreshExpiresAt() {
  return new Date(Date.now() + refreshTtlMs());
}

// -----------------------------
// === Signup ===
// -----------------------------
export const signup = async (req, res) => {
  try {
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const phone = typeof req.body.phone === "string" ? req.body.phone.trim() : "";
    const password = req.body.password;

    if (!name || !email || !password || !phone) {
      return res.status(400).json({ error: "All fields required" });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: "Please enter a valid email address" });
    }
    if (!isValidPassword(password)) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    let user;
    try {
      user = await createUser({ name, email, password: hashedPassword, phone });
    } catch (err) {
      if (err.code === "23505") {
        return res.status(409).json({ error: "Email already registered" });
      }
      throw err;
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);
    await saveRefreshToken(user.id, refreshToken, refreshExpiresAt());

    // ✅ ALWAYS return response FIRST
    res.status(201).json({
      message: "Signup successful",
      user: safeUser(user),
      accessToken,
      refreshToken,
    });

    // 🔥 fire-and-forget verification email + webhook (won't break response)
    const otp = generateOtp();
    await saveAuthCode(user.id, "verify_email", hashOtp(otp), new Date(Date.now() + AUTH_CODE_TTL_MINUTES * 60_000));
    sendAuthCodeEmail({ to: email, code: otp, purpose: "verify_email" }).catch((err) =>
      console.error("verification email failed:", err.message)
    );

    if (process.env.N8N_WEBHOOK_URL) {
      axios.post(process.env.N8N_WEBHOOK_URL, {
        name,
        email,
        phone,
        user_id: user.id,
      }).catch(err =>
        console.error("n8n webhook failed:", err.message)
      );
    }
  } catch (err) {
    console.error("Signup error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// -----------------------------
// === Login ===
// -----------------------------
export const login = async (req, res) => {
  try {
    const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = req.body.password;

    if (!email || !password) {
      return res.status(400).json({ error: "Email & password required" });
    }

    const user = await findUserByEmail(email);

    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(String(password), user.password);

    if (!isMatch) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    await saveRefreshToken(user.id, refreshToken, refreshExpiresAt());

    return res.status(200).json({
      success: true,
      user: safeUser(user),
      accessToken,
      refreshToken,
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// -----------------------------
// === REFRESH (ROTATION) ===
// -----------------------------
export const refresh = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({ error: "Refresh token required" });
    }

    const existing = await findRefreshToken(refreshToken);

    if (!existing) {
      console.warn("⚠️ Refresh token reuse detected!");

      try {
        const decoded = jwt.verify(
          refreshToken,
          process.env.JWT_REFRESH_SECRET
        );
        await deleteAllUserTokens(decoded.userId);
      } catch (rotateErr) {
        console.error("Token rotation error during reuse detection:", rotateErr.message);
      }

      return res.status(403).json({ error: "Invalid refresh token" });
    }

    if (existing.expires_at && new Date(existing.expires_at).getTime() < Date.now()) {
      await deleteAllUserTokens(existing.user_id);
      return res.status(403).json({ error: "Refresh token expired" });
    }

    const decoded = jwt.verify(
      refreshToken,
      process.env.JWT_REFRESH_SECRET
    );

    await deleteRefreshToken(refreshToken);

    const newAccessToken = generateAccessToken({ id: decoded.userId });
    const newRefreshToken = generateRefreshToken({ id: decoded.userId });

    await saveRefreshToken(decoded.userId, newRefreshToken, refreshExpiresAt());

    return res.status(200).json({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });
  } catch (err) {
    console.error("Refresh error:", err.message);
    return res.status(403).json({ error: "Invalid or expired refresh token" });
  }
};

// -----------------------------
// === Logout ===
// -----------------------------
export const logout = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ error: "Refresh token required" });
    }

    await deleteRefreshToken(refreshToken);

    return res.status(200).json({ message: "Logged out successfully" });
  } catch (err) {
    console.error("Logout error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// -----------------------------
// === Verify Email ===
// -----------------------------
export const verifyEmail = async (req, res) => {
  try {
    const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const otp = typeof req.body.otp === "string" ? req.body.otp.trim() : "";

    if (!email || !otp) {
      return res.status(400).json({ error: "Email and code required" });
    }

    const user = await findUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: "Invalid verification code" });
    }

    const active = await findActiveAuthCode(user.id, "verify_email");
    if (!active || active.code_hash !== hashOtp(otp)) {
      return res.status(400).json({ error: "Invalid or expired verification code" });
    }

    await markAuthCodeUsed(active.id);
    await setEmailVerified(user.id);

    const updated = await getUserById(user.id);
    return res.status(200).json({ message: "Email verified", user: safeUser(updated) });
  } catch (err) {
    console.error("Verify email error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// -----------------------------
// === Resend Verification ===
// -----------------------------
export const resendVerification = async (req, res) => {
  try {
    const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: "Please enter a valid email address" });
    }

    const user = await findUserByEmail(email);
    if (!user) {
      return res.status(200).json({ message: "If the account exists, a verification code has been sent." });
    }
    if (user.email_verified_at) {
      return res.status(400).json({ error: "Email is already verified" });
    }

    await invalidateAuthCodes(user.id, "verify_email");
    const otp = generateOtp();
    await saveAuthCode(user.id, "verify_email", hashOtp(otp), new Date(Date.now() + AUTH_CODE_TTL_MINUTES * 60_000));
    sendAuthCodeEmail({ to: email, code: otp, purpose: "verify_email" }).catch((err) =>
      console.error("resend verification email failed:", err.message)
    );

    return res.status(200).json({ message: "Verification code sent" });
  } catch (err) {
    console.error("Resend verification error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// -----------------------------
// === Forgot Password ===
// -----------------------------
export const forgotPassword = async (req, res) => {
  try {
    const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: "Please enter a valid email address" });
    }

    const user = await findUserByEmail(email);
    if (user) {
      await invalidateAuthCodes(user.id, "reset_password");
      const otp = generateOtp();
      await saveAuthCode(user.id, "reset_password", hashOtp(otp), new Date(Date.now() + AUTH_CODE_TTL_MINUTES * 60_000));
      sendAuthCodeEmail({ to: email, code: otp, purpose: "reset_password" }).catch((err) =>
        console.error("forgot-password email failed:", err.message)
      );
    }

    // Generic response — never reveal whether an account exists.
    return res.status(200).json({
      message: "If the account exists, a password reset code has been sent.",
    });
  } catch (err) {
    console.error("Forgot password error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// -----------------------------
// === Reset Password ===
// -----------------------------
export const resetPassword = async (req, res) => {
  try {
    const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const otp = typeof req.body.otp === "string" ? req.body.otp.trim() : "";
    const newPassword = req.body.newPassword;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({ error: "Email, code and new password required" });
    }
    if (!isValidPassword(newPassword)) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    const user = await findUserByEmail(email);
    if (!user) {
      return res.status(400).json({ error: "Invalid or expired reset code" });
    }

    const active = await findActiveAuthCode(user.id, "reset_password");
    if (!active || active.code_hash !== hashOtp(otp)) {
      return res.status(400).json({ error: "Invalid or expired reset code" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await updateUserPassword(user.id, hashedPassword);
    await deleteAllUserTokens(user.id);
    await invalidateAuthCodes(user.id, "reset_password");
    await markAuthCodeUsed(active.id);

    return res.status(200).json({ message: "Password reset successful. Please sign in." });
  } catch (err) {
    console.error("Reset password error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// -----------------------------
// === Get Profile ===
// -----------------------------
export const getMe = async (req, res) => {
  try {
    const user = await getUserById(req.user.id);
    if (!user) {
      return res.status(401).json({ error: "Account not found" });
    }
    return res.status(200).json({ user: safeUser(user) });
  } catch (err) {
    console.error("Get profile error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// -----------------------------
// === Update Profile ===
// -----------------------------
export const updateMe = async (req, res) => {
  try {
    const name = typeof req.body.name === "string" ? req.body.name.trim() : undefined;
    const phone = typeof req.body.phone === "string" ? req.body.phone.trim() : undefined;

    if (name === undefined && phone === undefined) {
      return res.status(400).json({ error: "Nothing to update" });
    }

    const updated = await updateUserProfile(req.user.id, { name, phone });
    return res.status(200).json({ user: safeUser(updated) });
  } catch (err) {
    console.error("Update profile error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// -----------------------------
// === Change Password ===
// -----------------------------
export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "Current and new password required" });
    }
    if (!isValidPassword(newPassword)) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    const user = await getUserByIdWithPassword(req.user.id);
    if (!user) {
      return res.status(401).json({ error: "Account not found" });
    }

    const isMatch = await bcrypt.compare(String(currentPassword), user.password);
    if (!isMatch) {
      return res.status(401).json({ error: "Current password is incorrect" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await updateUserPassword(user.id, hashedPassword);

    // Rotate refresh tokens so old sessions are revoked but this session continues.
    await deleteAllUserTokens(user.id);
    const newRefreshToken = generateRefreshToken(user);
    await saveRefreshToken(user.id, newRefreshToken, refreshExpiresAt());
    const newAccessToken = generateAccessToken(user);

    return res.status(200).json({
      message: "Password updated",
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });
  } catch (err) {
    console.error("Change password error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// -----------------------------
// === Delete Account ===
// -----------------------------
export const deleteAccount = async (req, res) => {
  try {
    const { currentPassword } = req.body;

    if (!currentPassword) {
      return res.status(400).json({ error: "Password required to delete account" });
    }

    const user = await getUserByIdWithPassword(req.user.id);
    if (!user) {
      return res.status(401).json({ error: "Account not found" });
    }

    const isMatch = await bcrypt.compare(String(currentPassword), user.password);
    if (!isMatch) {
      return res.status(401).json({ error: "Incorrect password" });
    }

    await deleteUserData(user.id);

    return res.status(200).json({ message: "Account deleted" });
  } catch (err) {
    console.error("Delete account error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};