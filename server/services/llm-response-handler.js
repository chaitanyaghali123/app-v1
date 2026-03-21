import path from "path";
import axios from "axios";
import { isPrimeUser } from "../config/user.config.js";

/**
 * Handles generating an answer using the local llama-cpp GPU server
 */
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

  // Limit context to 3 chunks to save VRAM on GTX 1650
  const limitedChunks = chunks.slice(0, 3);
  const contextText =
    limitedChunks.length > 0
      ? limitedChunks.map((c) => c.text).join("\n\n")
      : "No reference material available.";

  try {
    const response = await axios.post(
      `${process.env.VLLM_API_URL}/v1/chat/completions`,
      {
        model: process.env.VLLM_MODEL || "local-model",
        messages: [
          {
            role: "system",
            content: `You are a UPSC expert. Use the CONTEXT.
            IMPORTANT: Use <strong> for subheadings and <br/> for line breaks.
            Avoid Markdown symbols like **.`
          },
          {
            role: "user",
            content: `CONTEXT:\n${contextText}\n\nQUESTION:\n${prompt}`
          }
        ],
        // 🔹 Adjusted for stability: 600 tokens is safer for 4GB VRAM to prevent Docker from sticking
        max_tokens: mode === "learn_more" ? 600 : 400, 
        temperature: 0.2, 
      },
      // 🔹 4-minute timeout to ensure the GPU has room to breathe
      { timeout: 240000 } 
    );

    let rawAnswer = response.data?.choices?.[0]?.message?.content?.trim() || "";

    // 🔹 FORMATTING ENGINE: Converts AI output into structured HTML
    const formattedAnswer = rawAnswer
      .replace(/\*\*\*(.*?)\*\*\*/g, '<strong>$1</strong>') // Triple star bold
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')    // Double star bold
      .replace(/### (.*?)\n/g, '<strong>$1</strong><br/>') // Headers to bold
      .replace(/\n\n/g, '<br/><br/>')                     // Double newline to paragraph
      .replace(/\n/g, '<br/>');                           // Single newline to break

    return {
      answer: formattedAnswer,
      citations: limitedChunks.length ? normalizeChunkCitations(limitedChunks) : [],
      context_source: limitedChunks.length ? "chunks_plus_llm" : "llm_only",
    };
  } catch (err) {
    console.error("❌ LLM Connection Error:", err.message);
    
    const isTimeout = err.code === 'ECONNABORTED' || err.message.includes('timeout');
    
    return {
      answer: isTimeout 
        ? "The GPU is currently overloaded. Please wait 10 seconds and try again."
        : "Local AI server is busy (Docker/WSL2 issue). Restarting the service is recommended.",
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