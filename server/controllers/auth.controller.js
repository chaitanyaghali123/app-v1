import bcrypt from "bcrypt";
import axios from "axios";
import { createUser } from "../services/user.service.js";

export const signup = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: "All fields required" });
    }

    // 1️⃣ Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // 2️⃣ Save to DB
    const user = await createUser({
      name,
      email,
      password: hashedPassword
    });

    // 3️⃣ Send success response immediately
    res.status(201).json({
      message: "Signup successful",
      user_id: user.id
    });

    // 4️⃣ Trigger n8n workflow asynchronously
    axios.post(process.env.N8N_WEBHOOK_URL, {
      name,
      email,
      user_id: user.id
    }).catch((err) => {
      console.error("n8n webhook failed:", err.message);
    });

  } catch (err) {
    console.error("Signup error:", err.message);

    // 🔥 Handle duplicate email properly
    if (err.code === "23505") {
      return res.status(409).json({
        error: "Email already registered"
      });
    }

    res.status(500).json({
      error: "Internal server error"
    });
  }
};
