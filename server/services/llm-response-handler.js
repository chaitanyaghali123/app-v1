// server/services/llm-response-handler.js

import axios from "axios";
import { isPrimeUser } from "../config/user.config.js";

// ==========================
// 🔧 CONFIG
// ==========================
const CONFIG = {
  MAX_TOKENS_LONG: parseInt(
    process.env.MAX_TOKENS_LONG || "1800",
    10
  ),

  TEMPERATURE: parseFloat(
    process.env.LLM_TEMPERATURE || "0.5"
  ),

  MAX_CONTEXT: parseInt(
    process.env.MAX_CONTEXT_CHARS || "2500",
    10
  ),

  MAX_HISTORY: parseInt(
    process.env.MAX_HISTORY_MESSAGES || "4",
    10
  ),

  MAX_CHUNKS: parseInt(
    process.env.MAX_CHUNKS || "6",
    10
  ),

  MAX_CHARS_PER_CHUNK: parseInt(
    process.env.MAX_CHARS_PER_CHUNK || "1200",
    10
  ),

  MAX_TOTAL_CONTEXT_TOKENS: parseInt(
    process.env.MAX_TOTAL_CONTEXT_TOKENS || "5000",
    10
  ),

  TIMEOUT: parseInt(
    process.env.LLM_TIMEOUT || "300000",
    10
  ),
};

// ==========================
// 🧠 LLAMA SERVER CONFIG
// ==========================
const BASE_URL =
  process.env.LLAMA_API_URL ||
  "http://llama-server:8080";

// IMPORTANT:
// llama.cpp automatically loads split files
// if you point to PART 1
const MODEL_PATH =
  process.env.LLAMA_MODEL ||
  "/models/qwen2.5-7b-instruct-q4_k_m-00001-of-00002.gguf";

// ==========================
// 🔢 TOKEN ESTIMATION
// ==========================
function estimateTokens(text = "") {
  return Math.ceil(text.length / 4);
}

// ==========================
// 🧹 CLEAN TEXT
// ==========================
function cleanText(text = "") {
  return text
    .replace(/\s+/g, " ")
    .replace(/\n+/g, " ")
    .trim();
}

// ==========================
// 🧹 CLEAN CHUNK
// ==========================
function cleanChunk(text = "") {
  return cleanText(text).slice(
    0,
    CONFIG.MAX_CHARS_PER_CHUNK
  );
}

// ==========================
// 📚 BUILD SAFE CONTEXT
// ==========================
function buildContext(chunks = []) {
  const finalChunks = [];

  let usedTokens = 0;

  for (const chunk of chunks.slice(0, CONFIG.MAX_CHUNKS)) {
    const rawText =
      typeof chunk === "string"
        ? chunk
        : chunk?.text || "";

    const cleaned = cleanChunk(rawText);

    if (!cleaned) continue;

    const tokens = estimateTokens(cleaned);

    if (
      usedTokens + tokens >
      CONFIG.MAX_TOTAL_CONTEXT_TOKENS
    ) {
      break;
    }

    usedTokens += tokens;

    finalChunks.push(cleaned);
  }

  return finalChunks.join("\n\n");
}

// ==========================
// 🚀 CALL LLAMA SERVER
// ==========================
async function callLlama(messages, maxTokens) {
  try {
    const payload = {
      model: MODEL_PATH,
      messages,
      max_tokens: maxTokens,
      temperature: CONFIG.TEMPERATURE,
      stream: false,
    };

    console.log(
      "🚀 Sending request to llama-server..."
    );

    const response = await axios.post(
      `${BASE_URL}/v1/chat/completions`,
      payload,
      {
        headers: {
          "Content-Type": "application/json",
        },

        timeout: CONFIG.TIMEOUT,
      }
    );

    return (
      response.data?.choices?.[0]?.message
        ?.content || ""
    );

  } catch (err) {
    console.error(
      "❌ llama-server error:",
      err.response?.data || err.message
    );

    return null;
  }
}

// ==========================
// 🧹 FORMAT OUTPUT
// ==========================
function formatAnswer(text) {
  if (!text) return "";

  let formatted = text;

  formatted = formatted.replace(
    /\*\*(.*?)\*\*/g,
    "<strong>$1</strong>"
  );

  formatted = formatted.replace(
    /^### (.*?)$/gm,
    "<br/><br/><strong>$1</strong><br/>"
  );

  formatted = formatted.replace(
    /^## (.*?)$/gm,
    "<br/><br/><strong>$1</strong><br/>"
  );

  formatted = formatted.replace(
    /^# (.*?)$/gm,
    "<br/><br/><strong>$1</strong><br/>"
  );

  formatted = formatted.replace(
    /^\d+\.\s/gm,
    "<br/>• "
  );

  formatted = formatted.replace(
    /^-\s/gm,
    "<br/>• "
  );

  formatted = formatted.replace(
    /\n\n/g,
    "<br/><br/>"
  );

  formatted = formatted.replace(
    /\n/g,
    "<br/>"
  );

  return formatted.trim();
}

// ==========================
// 🚀 MAIN HANDLER
// ==========================
export async function handleLLMAnswer({
  prompt,
  chunks = [],
  user_id = "anon",
  history = [],
}) {
  if (!prompt) {
    throw new Error("Prompt required");
  }

  // ==========================
  // 🔒 PRIME CHECK
  // ==========================
  if (!isPrimeUser()) {
    return {
      answer:
        "Upgrade to Prime to access AI-powered answers.",

      context_source: "blocked_non_prime",

      tokensUsed: 0,
    };
  }

  // ==========================
  // 📚 SAFE CONTEXT
  // ==========================
  const contextText = buildContext(chunks);

  console.log(
    `📚 Chunks injected: ${
      chunks.slice(0, CONFIG.MAX_CHUNKS).length
    }`
  );

  // ==========================
  // 🧠 HISTORY
  // ==========================
  const formattedHistory = history
    .slice(-CONFIG.MAX_HISTORY)
    .map((m) => ({
      role: m.role,

      content: cleanChunk(
        m.content || ""
      ).slice(0, 400),
    }));

  // ==========================
  // 💬 SYSTEM PROMPT
  // ==========================
  const systemPrompt = `
You are Aryabhata, an elite UPSC mentor.

Generate highly analytical UPSC mains answers.

STRICT RULES:

1. ALWAYS generate:
- Introduction
- Main Body
- Conclusion

2. Use:
- Headings
- Bullet points
- Examples
- Constitutional references
- Committees
- Reports
- Current affairs
- Case studies

3. Writing style:
- Analytical
- Structured
- UPSC ranker style
- High information density

4. NEVER:
- Give short answers
- Stop abruptly
- Hallucinate facts

5. Use HTML formatting.
`;

  // ==========================
  // 💬 USER PROMPT
  // ==========================
  const userPrompt = `
QUESTION:
${prompt}

REFERENCE CONTEXT:
${contextText}

TASK:
Generate a FULL UPSC MAINS answer.

Requirements:
- Detailed
- Analytical
- Introduction
- Body
- Conclusion
- Multi-dimensional analysis
- Rich examples
- Bullet points
- Structured formatting
`;

  // ==========================
  // 📨 FINAL MESSAGES
  // ==========================
  const messages = [
    {
      role: "system",
      content: systemPrompt,
    },

    ...formattedHistory,

    {
      role: "user",
      content: userPrompt,
    },
  ];

  // ==========================
  // 🔢 TOKEN SAFETY
  // ==========================
  const estimatedPromptTokens =
    estimateTokens(
      JSON.stringify(messages)
    );

  console.log(
    `🧠 Estimated prompt tokens: ${estimatedPromptTokens}`
  );

  if (estimatedPromptTokens > 7000) {
    console.warn(
      "⚠️ Prompt too large, trimming history"
    );

    messages.splice(
      1,
      formattedHistory.length
    );
  }

  // ==========================
  // 🚀 GENERATE ANSWER
  // ==========================
  const rawAnswer = await callLlama(
    messages,
    CONFIG.MAX_TOKENS_LONG
  );

  // ==========================
  // ✅ SUCCESS
  // ==========================
  if (rawAnswer && rawAnswer.trim()) {
    console.log(
      "\n✅ llama-server response received"
    );

    return {
      answer: formatAnswer(rawAnswer),

      context_source: contextText
        ? "chunks_plus_llm"
        : "llm_only",

      tokensUsed:
        estimateTokens(rawAnswer),

      provider: "llama-server",
    };
  }

  // ==========================
  // ❌ FAILURE
  // ==========================
  return {
    answer:
      "⚠️ Local AI server is unavailable or returned empty response.",

    context_source: "llm_error",

    tokensUsed: 0,
  };
}