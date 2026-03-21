import * as db from "../services/db.service.js";
import axios from "axios";
import { isPrimeUser } from "../config/user.config.js";
import redis from "../config/redis.js"; // 🔹 new import
import { LEARNMORE_TTL } from "../config/cache.js";

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

    // 🚫 Non-prime users
    if (!prime) {
      return res.json({
        revision_id: response_id,
        detailed: "Upgrade to Prime to access Learn More.",
        citations: [],
      });
    }

    // 🔹 Cache key
    const cacheKey = `learnmore:${response_id}`;

    // 1️⃣ Check cache first
    const cached = await redis.get(cacheKey);
    if (cached) {
      console.log("⚡ Cache hit:", cacheKey);
      return res.json(JSON.parse(cached));
    }

    // ✅ Prime → Local llama-cpp call
    try {
      const response = await axios.post(
        `${process.env.VLLM_API_URL}/v1/chat/completions`,
        {
          model: process.env.VLLM_MODEL || "local-model",
          messages: [
            {
              role: "system",
              content: `You are an expert UPSC educator.
              Expand the previous answer into a detailed explanation.
              Always respond in clean, semantic HTML with:
              <h2> for section headings,
              <ul>/<li> for lists,
              <p> for paragraphs.
              Keep everything in English only.`
            },
            {
              role: "user",
              content: `Please expand on and provide more depth for this previous answer:\n\n"${result.answer}"`
            }
          ],
          max_tokens: 1024, // 🔹 increase from 14 to realistic expansion size
          temperature: 0.4,
        },
        { timeout: 180000 }
      );

      const expandedAnswer =
        response.data?.choices?.[0]?.message?.content?.trim() || result.answer;

      await db.updateRevisionExpanded(response_id, expandedAnswer);

      const finalResponse = {
        revision_id: response_id,
        detailed: expandedAnswer,
        citations: [],
      };

      // 2️⃣ Save to cache (TTL 5 minutes)
      await redis.set(cacheKey, JSON.stringify(detailed), "EX", LEARNMORE_TTL);
    } catch (err) {
      console.error("❌ GPU LearnMore error:", err.message);
      return res.status(500).json({ error: "Local AI server is busy or unavailable." });
    }
  } catch (err) {
    console.error("[handleLearnMore] error:", err.message);
    res.status(500).json({ error: "Learn more processing failed" });
  }
}
