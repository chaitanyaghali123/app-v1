import express from "express";
import { signup, login, refresh, logout } from "../controllers/auth.controller.js";

const router = express.Router();

// ✅ Signup route
router.post("/signup", signup);

// ✅ Login route
router.post("/login", login);

// ✅ Refresh token route
router.post("/refresh", refresh);

// ✅ Logout route
router.post("/logout", logout);

export default router;
