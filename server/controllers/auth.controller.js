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
    { userId: user.id, email: user.email },
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

    res.status(201).json({
      message: "Signup successful",
      user_id: user.id
    });

    // 🔥 async webhook
    axios.post(process.env.N8N_WEBHOOK_URL, {
      name,
      email,
      phone,
      user_id: user.id
    }).catch(err => console.error("n8n webhook failed:", err.message));

  } catch (err) {
    console.error("Signup error:", err.message);

    if (err.code === "23505") {
      return res.status(409).json({ error: "Email already registered" });
    }

    res.status(500).json({ error: "Internal server error" });
  }
};

// -----------------------------
// === Login ===
// -----------------------------
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await findUserByEmail(email);

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    // ✅ store refresh token
    await saveRefreshToken(user.id, refreshToken);

    res.json({ accessToken, refreshToken });

  } catch (err) {
    console.error("Login error:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// -----------------------------
// 🔥 === REFRESH (ROTATION) ===
// -----------------------------
export const refresh = async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(401).json({ error: "Refresh token required" });
  }

  try {
    // 1. Check DB (IMPORTANT)
    const existing = await findRefreshToken(refreshToken);

    if (!existing) {
      // 🚨 TOKEN REUSE DETECTED
      console.warn("⚠️ Refresh token reuse detected!");

      try {
        const decoded = jwt.verify(
          refreshToken,
          process.env.JWT_REFRESH_SECRET
        );

        // 🔥 revoke all sessions
        await deleteAllUserTokens(decoded.userId);
      } catch {}

      return res.status(403).json({
        error: "Invalid refresh token (possible reuse attack)"
      });
    }

    // 2. Verify token
    const decoded = jwt.verify(
      refreshToken,
      process.env.JWT_REFRESH_SECRET
    );

    // 3. ROTATE → delete old token
    await deleteRefreshToken(refreshToken);

    // 4. Issue new tokens
    const newAccessToken = generateAccessToken({
      id: decoded.userId
    });

    const newRefreshToken = generateRefreshToken({
      id: decoded.userId
    });

    // 5. Save new refresh token
    await saveRefreshToken(decoded.userId, newRefreshToken);

    return res.json({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken
    });

  } catch (err) {
    console.error("Refresh error:", err.message);
    return res.status(403).json({
      error: "Invalid or expired refresh token"
    });
  }
};

// -----------------------------
// === Logout ===
// -----------------------------
export const logout = async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({ error: "Refresh token required" });
  }

  try {
    // delete specific session
    await deleteRefreshToken(refreshToken);

    res.json({ message: "Logged out successfully" });

  } catch (err) {
    console.error("Logout error:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

