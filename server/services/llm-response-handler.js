import path from "path";
import axios from "axios";
import { isPrimeUser } from "../config/user.config.js";

export async function handleLLMAnswer({
  prompt,
  chunks = [],
  subject_id = "General",
  user_id = "anon",
  mode = "ask",
}) {
  if (!prompt) throw new Error("Prompt required");

  const prime = isPrimeUser();
  if (!prime) {
    return {
      answer: "Upgrade to Prime to access AI-powered answers.",
      citations: [],
      context_source: "blocked_non_prime",
    };
  }

  // Limit context to 3 chunks (optional, adjust for GPU memory)
  const limitedChunks = chunks.slice(0, 3);
  const contextText =
    limitedChunks.length > 0
      ? limitedChunks.map((c) => c.text).join("\n\n")
      : "No reference material available.";

  try {
    const response = await axios.post(
      `${process.env.VLLM_API_URL}/v1/chat/completions`,
      {
        model: process.env.VLLM_MODEL,
        messages: [
          {
            role: "system",
            content: `You are a UPSC expert. Use the CONTEXT.
            Respond in clean HTML (<strong>, <br/>, <p>).
            Avoid Markdown symbols like **.`
          },
          {
            role: "user",
            content: `CONTEXT:\n${contextText}\n\nQUESTION:\n${prompt}`
          }
        ],
        max_tokens: mode === "learn_more" ? 2800 : 1200,
        temperature: 0.3,
      },
      { timeout: 240000 }
    );

    let rawAnswer = response.data?.choices?.[0]?.message?.content?.trim() || "";

    const formattedAnswer = rawAnswer
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/### (.*?)\n/g, '<strong>$1</strong><br/>')
      .replace(/\n\n/g, '<br/><br/>')
      .replace(/\n/g, '<br/>');

    return {
      answer: formattedAnswer,
      citations: limitedChunks.length ? normalizeChunkCitations(limitedChunks) : [],
      context_source: limitedChunks.length ? "chunks_plus_llm" : "llm_only",
    };
  } catch (err) {
    console.error("❌ Phi3 vLLM Connection Error:", err.message);

    const isTimeout = err.code === 'ECONNABORTED' || err.message.includes('timeout');

    return {
      answer: isTimeout
        ? "The GPU is currently overloaded. Please wait and try again."
        : "Local AI server is busy. Restarting the service may help.",
      citations: [],
      context_source: "llm_error",
    };
  }
}

function normalizeChunkCitations(chunks = []) {
  const seen = new Set();
  return chunks
    .map((c) => {
      const source = c.metadata?.source ? path.basename(c.metadata.source) : "";
      return { chunk_id: c.metadata?.id || c.id || "unknown", source };
    })
    .filter((c) => {
      if (!c.source || seen.has(c.source)) return false;
      seen.add(c.source);
      return true;
    });
}
