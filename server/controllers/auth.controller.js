// controllers/auth.controller.js

import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import axios from "axios";
import {
  createUser,
  findUserByEmail
} from "../services/user.service.js";

import {
  saveRefreshToken,
  findRefreshToken,
  deleteRefreshToken,
  deleteAllUserTokens
} from "../services/db.service.js";

// -----------------------------
// Config
// -----------------------------
const ACCESS_TTL = "15m";
const REFRESH_TTL = "7d";

// -----------------------------
// Token generators
// -----------------------------
function generateAccessToken(user) {
  return jwt.sign(
    { userId: user.id, email: user.email || null },
    process.env.JWT_SECRET,
    { expiresIn: ACCESS_TTL }
  );
}

function generateRefreshToken(user) {
  return jwt.sign(
    { userId: user.id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: REFRESH_TTL }
  );
}

// -----------------------------
// === Signup ===
// -----------------------------
export const signup = async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;

    if (!name || !email || !password || !phone) {
      return res.status(400).json({ error: "All fields required" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await createUser({
      name,
      email,
      password: hashedPassword,
      phone
    });

    // ✅ ALWAYS return response FIRST
    res.status(201).json({
      message: "Signup successful",
      user_id: user.id
    });

    // 🔥 async webhook (SAFE — won't break response)
    if (process.env.N8N_WEBHOOK_URL) {
      axios.post(process.env.N8N_WEBHOOK_URL, {
        name,
        email,
        phone,
        user_id: user.id
      }).catch(err =>
        console.error("n8n webhook failed:", err.message)
      );
    }

  } catch (err) {
    console.error("Signup error:", err);

    if (err.code === "23505") {
      return res.status(409).json({ error: "Email already registered" });
    }

    return res.status(500).json({ error: "Internal server error" });
  }
};

// -----------------------------
// === Login ===
// -----------------------------
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email & password required" });
    }

    const user = await findUserByEmail(email);

    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    await saveRefreshToken(user.id, refreshToken);

    // ✅ IMPORTANT: always return
    return res.status(200).json({
      success: true,
      accessToken,
      refreshToken
    });

  } catch (err) {
    console.error("Login error:", err);

    return res.status(500).json({
      error: "Internal server error"
    });
  }
};

// -----------------------------
// 🔥 === REFRESH (ROTATION) ===
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
      } catch {}

      return res.status(403).json({
        error: "Invalid refresh token"
      });
    }

    const decoded = jwt.verify(
      refreshToken,
      process.env.JWT_REFRESH_SECRET
    );

    await deleteRefreshToken(refreshToken);

    const newAccessToken = generateAccessToken({
      id: decoded.userId
    });

    const newRefreshToken = generateRefreshToken({
      id: decoded.userId
    });

    await saveRefreshToken(decoded.userId, newRefreshToken);

    return res.status(200).json({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken
    });

  } catch (err) {
    console.error("Refresh error:", err);

    return res.status(403).json({
      error: "Invalid or expired refresh token"
    });
  }
};

// -----------------------------
// === Logout ===
// -----------------------------
export const logout = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        error: "Refresh token required"
      });
    }

    await deleteRefreshToken(refreshToken);

    return res.status(200).json({
      message: "Logged out successfully"
    });

  } catch (err) {
    console.error("Logout error:", err);

    return res.status(500).json({
      error: "Internal server error"
    });
  }
};