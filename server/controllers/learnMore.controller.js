// server/controllers/learnMore.controller.js

import * as db from "../services/db.service.js";
import { chat } from "../services/chat-orchestrator.js";
import { isPrimeUser } from "../config/user.config.js";

export async function handleLearnMore(req, res) {
  try {
    const { response_id } = req.body;
    if (!response_id) {
      return res.status(400).json({ error: "response_id is required" });
    }

    const prime = isPrimeUser();

    const result = await db.getRevision(response_id);
    if (!result) {
      return res.status(404).json({ error: "Response not found" });
    }

    // 🚫 Non-prime
    if (!prime) {
      return res.json({
        revision_id: response_id,
        detailed: "Upgrade to Prime to access Learn More.",
        citations: [],
      });
    }

    // ✅ Prime → routed LLM (OpenAI → Claude fallback)
    const sessionId = `${result.user_id}:${result.subject_id}`;

    const { answer } = await chat({
      sessionId,
      prompt: result.answer,     // expand previous answer
      chunks: null,              // no chunks for learn-more
      subject_id: result.subject_id,
      user_id: result.user_id,
      mode: "learn_more"
    });

    const expandedAnswer = answer || result.answer;

    await db.updateRevisionExpanded(response_id, expandedAnswer);

    return res.json({
      revision_id: response_id,
      detailed: expandedAnswer.trim(),
      citations: [],
    });
  } catch (err) {
    console.error("[handleLearnMore] error:", err.message);
    res.status(500).json({ error: "Learn more failed" });
  }
}
