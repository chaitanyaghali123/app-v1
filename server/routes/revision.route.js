// revision.route.js

import express from "express";
import {
  getRevisionsBySubject,
  getRevisionsByResponseId
} from "../controllers/revision.controller.js";
import { createRateLimiter } from "../middleware/rateLimiter.js";

const router = express.Router();

// -----------------------------
// 🔥 Rate limiter (light, since it's read-heavy)
// -----------------------------
const historyLimiter = createRateLimiter(60, 60); // 60 req/min

// -----------------------------
// Routes
// -----------------------------

// GET /api/revisions?subject_id=&user_id=&cursor=
router.get("/", historyLimiter, getRevisionsBySubject);

// GET /api/revisions/:responseId
router.get("/:responseId", historyLimiter, getRevisionsByResponseId);

export default router;