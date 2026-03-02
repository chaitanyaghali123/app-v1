// server/services/llm-response-handler.service.js

import path from "path";
import { isPrimeUser } from "../config/user.config.js";
import { chat } from "./chat-orchestrator.js";

export async function handleLLMAnswer({
  prompt,
  chunks = [],
  subject_id = "General",
  user_id = "anon",
  mode = "ask",
}) {
  if (!prompt) throw new Error("Prompt required");

  const prime = isPrimeUser();

  // 🚫 NON-PRIME
  if (!prime) {
    return {
      answer: "Upgrade to Prime to access AI-powered answers.",
      citations: [],
      context_source: "blocked_non_prime",
    };
  }

  const sessionId = `${user_id}:${subject_id}`;

  // ✅ CORRECT PARAM PASSING
  const { answer } = await chat({
    sessionId,
    prompt,
    chunks,
    subject_id,
    user_id,
    mode
  });

  return {
    answer: answer || "",
    citations: mode === "ask" ? normalizeChunkCitations(chunks) : [],
    context_source: chunks?.length ? "chunks_plus_llm" : "llm_only",
  };
}

// -----------------------------
// Citation helpers
// -----------------------------
function normalizeChunkCitations(chunks = []) {
  const seen = new Set();

  return chunks
    .map((c) => {
      const source = c.metadata?.source
        ? path.basename(c.metadata.source)
        : "";
      return {
        chunk_id: c.metadata?.id || c.id || "unknown",
        source,
      };
    })
    .filter((c) => {
      if (!c.source || seen.has(c.source)) return false;
      seen.add(c.source);
      return true;
    });
}
