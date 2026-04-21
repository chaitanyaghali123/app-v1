// routes/revision.route.js

import express from "express";
import {
  getRevisionsByUser,
  getRevisionsByResponseId
} from "../controllers/revision.controller.js";
import { createRateLimiter } from "../middleware/rateLimiter.js";

const router = express.Router();

// -----------------------------
// 🔥 Rate limiter (light, since it's read-heavy)
// -----------------------------
const historyLimiter = createRateLimiter(
  process.env.NODE_ENV === "development" ? 1000 : 60,
  60
);

// -----------------------------
// Routes
// -----------------------------

// ✅ Cursor-based revisions by user
// GET /api/revisions?user_id=&cursor=
router.get("/", historyLimiter, getRevisionsByUser);

// ✅ Single revision by responseId
// GET /api/revisions/:responseId
router.get("/:responseId", historyLimiter, getRevisionsByResponseId);

export default router;
