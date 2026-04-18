import express from "express";
import { llmQueue } from "../queue.js";

const router = express.Router();

/**
 * 🚀 POST /api/llm/answer
 * Adds request to queue instead of calling LLM directly
 */
router.post("/answer", async (req, res) => {
  try {
    const { question } = req.body;

    // Basic validation
    if (!question || typeof question !== "string") {
      return res.status(400).json({
        error: "Question is required"
      });
    }

    // Add job to queue
    const job = await llmQueue.add("llm-job", {
      question
    });

    return res.json({
      status: "queued",
      jobId: job.id
    });

  } catch (err) {
    console.error("❌ Queue error:", err);
    return res.status(500).json({
      error: "Failed to queue request"
    });
  }
});

export default router;