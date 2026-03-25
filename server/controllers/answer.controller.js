import path from "path";
import { queryChroma } from "../services/vector.service.js";
import { handleLLMAnswer } from "../services/llm-response-handler.js";
import { saveRevision } from "../services/db.service.js";
import redis from "../config/redis.js"; // 🔹 new import
import { ANSWER_TTL } from "../config/cache.js";

export const handleAnswer = async (req, res) => {
  const { prompt, subject_id = "General", user_id = "guest" } = req.body;

  // 🔹 Build a cache key (unique per subject/user/prompt)
  const cacheKey = `answer:${subject_id}:${user_id}:${Buffer.from(prompt).toString("base64")}`;

  try {
    // 1️⃣ Check cache first
    const cached = await redis.get(cacheKey);
    if (cached) {
      console.log("⚡ Cache hit:", cacheKey);
      return res.json(JSON.parse(cached));
    }

    // 2️⃣ Normal flow (unchanged)
    const chunks = await queryChroma({ prompt, subject_id });

    const { answer, citations, context_source } =
      await handleLLMAnswer({ prompt, chunks, user_id, subject_id });

    const rev = await saveRevision({
      user_id,
      subject_id,
      prompt,
      answer,
      citations,
      chunk_ids: chunks.map((c) => c.metadata?.id || c.id || "unknown"),
    });

    const rawCitations =
      citations?.length > 0
        ? citations
        : chunks.map((c) => ({
            chunk_id: c.metadata?.id || c.id,
            source: c.metadata?.source || "",
            topic: c.metadata?.topic || "",
            difficulty: c.metadata?.difficulty || "",
            subject_id: c.metadata?.subject_id || subject_id,
          }));

    const seen = new Set();
    const cleanCitations = rawCitations.filter((c) => {
      const filename = c.source ? path.basename(c.source) : "";
      if (seen.has(filename)) return false;
      seen.add(filename);
      c.source = filename;
      return true;
    });

    const response = {
      prompt,
      subject_id,
      answer,
      citations: cleanCitations,
      context_source,
      revision_id: rev.id,
    };

    // 3️⃣ Save to cache (TTL 60 seconds)
    await redis.set(cacheKey, JSON.stringify(response), "EX", ANSWER_TTL);
    res.json(response);
  } catch (err) {
    console.error("[handleAnswer] error:", err.message);
    res.status(500).json({ error: "Answer generation failed" });
  }
};
