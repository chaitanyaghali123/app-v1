import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import axios from "axios";
import {
  createUser,
  findUserByEmail,
  saveRefreshToken,
  verifyRefreshToken,
  revokeRefreshToken
} from "../services/user.service.js";

const ACCESS_TTL = "15m"; // short-lived access token
const REFRESH_TTL = "7d"; // long-lived refresh token

// === Signup ===
export const signup = async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;
    if (!name || !email || !password || !phone) {
      return res.status(400).json({ error: "All fields required" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await createUser({ name, email, password: hashedPassword, phone });

    res.status(201).json({ message: "Signup successful", user_id: user.id });

    // Trigger n8n workflow asynchronously
    axios.post(process.env.N8N_WEBHOOK_URL, {
      name, email, phone, user_id: user.id
    }).catch(err => console.error("n8n webhook failed:", err.message));

  } catch (err) {
    console.error("Signup error:", err.message);
    if (err.code === "23505") {
      return res.status(409).json({ error: "Email already registered" });
    }
    res.status(500).json({ error: "Internal server error" });
  }
};

// === Login ===
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await findUserByEmail(email);

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const accessToken = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: ACCESS_TTL });
    const refreshToken = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: REFRESH_TTL });

    await saveRefreshToken(user.id, refreshToken); // store refresh token

    res.json({ accessToken, refreshToken });
  } catch (err) {
    console.error("Login error:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// === Refresh Token ===
export const refresh = async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(401).json({ error: "No token provided" });

  try {
    const valid = await verifyRefreshToken(refreshToken);
    if (!valid) return res.status(403).json({ error: "Invalid refresh token" });

    const payload = jwt.verify(refreshToken, process.env.JWT_SECRET);
    const accessToken = jwt.sign({ userId: payload.userId }, process.env.JWT_SECRET, { expiresIn: ACCESS_TTL });

    res.json({ accessToken });
  } catch (err) {
    console.error("Refresh error:", err.message);
    res.status(403).json({ error: "Invalid or expired refresh token" });
  }
};

// === Logout ===
export const logout = async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ error: "No token provided" });

  try {
    const payload = jwt.verify(refreshToken, process.env.JWT_SECRET);
    await revokeRefreshToken(payload.userId, refreshToken);
    res.json({ message: "Logged out successfully" });
  } catch (err) {
    console.error("Logout error:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
};
