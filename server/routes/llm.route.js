// routes/llm.route.js

import express from "express";
import { handleAnswer } from "../controllers/answer.controller.js";

const router = express.Router();

// ✅ Final endpoint: POST /api/answer
// This now routes to OpenAI-powered handleAnswer
router.post("/answer", handleAnswer);

export default router;
