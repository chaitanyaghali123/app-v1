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
// 🔧 CONFIG
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
// 🔁 RETRY
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
// 🚀 MAIN
// ==========================
export async function handleLLMAnswer({
  prompt,
  chunks = [],
  user_id = "anon",
  history = []
}) {
  if (!prompt) throw new Error("Prompt required");

  const prime = isPrimeUser();

  if (!prime) {
    return {
      answer: "Upgrade to Prime to access AI-powered answers.",
      context_source: "blocked_non_prime",
      tokensUsed: 0
    };
  }

  // ==========================
  // 🔹 CONTEXT (RAG)
  // ==========================
  const limitedChunks = chunks.slice(0, CONFIG.MAX_CHUNKS);

  const contextText = limitedChunks.length
    ? limitedChunks.map((c) => c.text).join("\n\n").slice(0, CONFIG.MAX_CONTEXT)
    : "";

  // ==========================
  // 🔹 HISTORY
  // ==========================
  const formattedHistory = history
    .slice(-CONFIG.MAX_HISTORY)
    .map((m) => ({
      role: m.role,
      content: m.content
    }));

  try {
    // ==========================
    // 🚀 LLM CALL (IMPROVED PROMPT)
    // ==========================
    const response = await callLLM({
      model: CONFIG.MODEL,
      messages: [
        {
          role: "system",
          content: `You are a highly intelligent AI tutor and UPSC mentor.

CRITICAL THINKING RULES:
- Always understand context before answering
- If a term has multiple meanings, choose the MOST RELEVANT one
- Prefer UPSC / exam-related meaning over unrelated meanings
- NEVER give random or unrelated definitions

FILE HANDLING:
- If file content is present, you MUST explain it
- Do not ignore file content
- Do not say "no context provided"

ANSWER STYLE:
- Start with a direct answer
- Then explain clearly
- Use headings and bullet points
- Keep it simple and structured

INCLUDE:
• definition
• key points
• examples (if useful)
• comparison (if needed)

FORMAT:
- Use HTML: <p>, <strong>, <ul>, <li>, <br/>
- No markdown

GOAL:
Give accurate, context-aware answers like ChatGPT.`
        },

        ...formattedHistory,

        {
          role: "user",
          content: `
${prompt}

${contextText ? `\n\nREFERENCE CONTEXT:\n${contextText}` : ""}

IMPORTANT:
- Use the above content carefully
- Prefer relevant meaning based on context
`
        }
      ],
      max_tokens: CONFIG.MAX_TOKENS,
      temperature: CONFIG.TEMPERATURE
    });

    // ==========================
    // 🔹 RESPONSE
    // ==========================
    let rawAnswer =
      response.data?.choices?.[0]?.message?.content?.trim() || "";

    const tokensUsed = response.data?.usage?.total_tokens || 0;

    // ==========================
    // 🔹 FORMAT CLEAN (IMPROVED)
    // ==========================
    const formattedAnswer = rawAnswer
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/### (.*?)/g, "<strong>$1</strong><br/>")
      .replace(/\n\n/g, "<br/><br/>")
      .replace(/\n/g, "<br/>");

    return {
      answer: formattedAnswer,
      context_source: limitedChunks.length
        ? "chunks_plus_llm"
        : "llm_only",
      tokensUsed
    };

  } catch (err) {
    console.error("❌ LLM Error:", err.message);

    return {
      answer: "⚠️ AI server error. Try again.",
      context_source: "llm_error",
      tokensUsed: 0
    };
  }
}
