import path from "path";
import axios from "axios";
import { isPrimeUser } from "../config/user.config.js";

// ==========================
// 🔒 ENV VALIDATION
// ==========================
function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`❌ Missing env variable: ${name}`);
  }
  return value;
}

function toInt(name) {
  const val = parseInt(requireEnv(name), 10);
  if (isNaN(val)) throw new Error(`❌ Invalid number for ${name}`);
  return val;
}

function toFloat(name) {
  const val = parseFloat(requireEnv(name));
  if (isNaN(val)) throw new Error(`❌ Invalid float for ${name}`);
  return val;
}

// ==========================
// 🔧 CONFIG (GENERIC LLM)
// ==========================
const CONFIG = {
  API_URL: requireEnv("LLM_API_URL"),
  MODEL: requireEnv("LLM_MODEL"),

  TIMEOUT: toInt("LLM_TIMEOUT_MS"),
  RETRIES: toInt("LLM_RETRIES"),
  RETRY_DELAY: toInt("LLM_RETRY_DELAY_MS"),

  MAX_TOKENS: toInt("MAX_TOKENS"),
  MAX_CONTEXT: toInt("MAX_CONTEXT_CHARS"),
  MAX_HISTORY: toInt("MAX_HISTORY_MESSAGES"),
  MAX_CHUNKS: toInt("MAX_CHUNKS"),

  TEMPERATURE: toFloat("LLM_TEMPERATURE")
};

// ==========================
// 🔁 UTIL
// ==========================
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ==========================
// 🔁 RETRY WRAPPER
// ==========================
async function callLLM(payload) {
  for (let i = 0; i <= CONFIG.RETRIES; i++) {
    try {
      return await axios.post(
        `${CONFIG.API_URL}/v1/chat/completions`,
        payload,
        { timeout: CONFIG.TIMEOUT }
      );
    } catch (err) {
      console.warn(`⚠️ LLM attempt ${i + 1} failed: ${err.message}`);

      if (i === CONFIG.RETRIES) throw err;

      await sleep(CONFIG.RETRY_DELAY);
    }
  }
}

// ==========================
// 🚀 MAIN FUNCTION
// ==========================
export async function handleLLMAnswer({
  prompt,
  chunks = [],
  subject_id = "General",
  user_id = "anon",
  history = []
}) {
  if (!prompt) throw new Error("Prompt required");

  const prime = isPrimeUser();

  // 🚫 Block non-prime users
  if (!prime) {
    return {
      answer: "Upgrade to Prime to access AI-powered answers.",
      citations: [],
      context_source: "blocked_non_prime",
      tokensUsed: 0
    };
  }

  // ==========================
  // 🔹 CONTEXT CONTROL
  // ==========================
  const limitedChunks = chunks.slice(0, CONFIG.MAX_CHUNKS);

  const contextText = limitedChunks.length
    ? limitedChunks.map((c) => c.text).join("\n\n").slice(0, CONFIG.MAX_CONTEXT)
    : "No reference material available.";

  // ==========================
  // 🔹 HISTORY CONTROL
  // ==========================
  const formattedHistory = history
    .slice(-CONFIG.MAX_HISTORY)
    .map((m) => ({
      role: m.role,
      content: m.content
    }));

  try {
    // ==========================
    // 🚀 LLM CALL
    // ==========================
    const response = await callLLM({
      model: CONFIG.MODEL,
      messages: [
        {
          role: "system",
          content: `You are an expert UPSC mentor who explains concepts clearly like ChatGPT.

Guidelines:
- Start with a direct answer
- Write in a natural, human-friendly way
- Use clear headings, bullet points, and short paragraphs
- Keep answers easy to read and well-structured
- Maintain UPSC relevance (Prelims + Mains)

When helpful include:
• definition
• key points
• examples
• pros & cons
• conclusion

Formatting:
- Use simple HTML: <p>, <strong>, <ul>, <li>, <br/>
- Avoid over-formatting
- No markdown (** or ###)

Goal:
Make the answer feel like ChatGPT — clear, structured, and helpful.`
        },

        // 🔥 CHAT HISTORY
        ...formattedHistory,

        // 🔥 CURRENT QUESTION
        {
          role: "user",
          content: `CONTEXT:\n${contextText}\n\nQUESTION:\n${prompt}`
        }
      ],
      max_tokens: CONFIG.MAX_TOKENS,
      temperature: CONFIG.TEMPERATURE
    });

    // ==========================
    // 🔹 RESPONSE PARSE
    // ==========================
    let rawAnswer =
      response.data?.choices?.[0]?.message?.content?.trim() || "";

    const tokensUsed = response.data?.usage?.total_tokens || 0;

    // ==========================
    // 🔹 CLEAN FORMAT
    // ==========================
    const formattedAnswer = rawAnswer
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\n\n/g, "<br/><br/>")
      .replace(/\n/g, "<br/>");

    return {
      answer: formattedAnswer,
      citations: limitedChunks.length
        ? normalizeChunkCitations(limitedChunks)
        : [],
      context_source: limitedChunks.length
        ? "chunks_plus_llm"
        : "llm_only",
      tokensUsed
    };

  } catch (err) {
    console.error("❌ LLM Error:", err.message);

    const isTimeout =
      err.code === "ECONNABORTED" ||
      err.message.includes("timeout");

    return {
      answer: isTimeout
        ? "⏳ The AI is taking too long. Please try again."
        : "⚠️ AI server is currently unavailable.",
      citations: [],
      context_source: "llm_error",
      tokensUsed: 0
    };
  }
}

// ==========================
// 📚 CITATIONS
// ==========================
function normalizeChunkCitations(chunks = []) {
  const seen = new Set();

  return chunks
    .map((c) => {
      const source = c.metadata?.source
        ? path.basename(c.metadata.source)
        : "";

      return {
        chunk_id: c.metadata?.id || c.id || "unknown",
        source
      };
    })
    .filter((c) => {
      if (!c.source || seen.has(c.source)) return false;
      seen.add(c.source);
      return true;
    });
}