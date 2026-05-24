// server/services/llm-response-handler.js

import axios from "axios";
import { isPrimeUser } from "../config/user.config.js";

// ==========================
// 🔧 CONFIG
// ==========================
const CONFIG = {
  // Faster + stable generation
  MAX_TOKENS_LONG: parseInt(
    process.env.MAX_TOKENS_LONG || "900",
    10
  ),

  TEMPERATURE: parseFloat(
    process.env.LLM_TEMPERATURE || "0.4"
  ),

  MAX_HISTORY: parseInt(
    process.env.MAX_HISTORY_MESSAGES || "3",
    10
  ),

  MAX_CHUNKS: parseInt(
    process.env.MAX_CHUNKS || "4",
    10
  ),

  MAX_CHARS_PER_CHUNK: parseInt(
    process.env.MAX_CHARS_PER_CHUNK || "900",
    10
  ),

  MAX_TOTAL_CONTEXT_TOKENS: parseInt(
    process.env.MAX_TOTAL_CONTEXT_TOKENS || "1800",
    10
  ),

  TIMEOUT: parseInt(
    process.env.LLM_TIMEOUT || "300000",
    10
  ),

  RETRIES: parseInt(
    process.env.LLM_RETRIES || "2",
    10
  ),

  RETRY_DELAY: parseInt(
    process.env.LLM_RETRY_DELAY_MS || "1000",
    10
  ),
};

// ==========================
// 🧠 vLLM CONFIG
// ==========================

// .env should be:
//
// LLAMA_API_URL=https://xxxxx-8000.proxy.runpod.net
//
// DO NOT ADD /v1

const BASE_URL =
  process.env.LLAMA_API_URL ||
  "http://localhost:8000";

// HuggingFace model name
const MODEL_NAME =
  process.env.LLAMA_MODEL ||
  "Qwen/Qwen2.5-7B-Instruct";

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
// ⏳ DELAY
// ==========================
function delay(ms) {
  return new Promise((resolve) =>
    setTimeout(resolve, ms)
  );
}

// ==========================
// 🚀 CALL vLLM
// ==========================
async function callLlama(messages, maxTokens) {
  for (
    let attempt = 1;
    attempt <= CONFIG.RETRIES;
    attempt++
  ) {
    try {
      console.log(
        `🚀 Sending request to vLLM (attempt ${attempt})`
      );

      const payload = {
        model: MODEL_NAME,

        messages,

        max_tokens: maxTokens,

        temperature: CONFIG.TEMPERATURE,

        stream: false,
      };

      const response = await axios.post(
        `${BASE_URL}/v1/chat/completions`,
        payload,
        {
          headers: {
            "Content-Type": "application/json",
          },

          timeout: CONFIG.TIMEOUT,

          validateStatus: (status) => status < 500,
        }
      );

      // Handle API-level errors
      if (response.status !== 200) {
        console.error(
          "❌ vLLM API error:",
          response.status,
          response.data
        );

        throw new Error(
          `vLLM returned ${response.status}`
        );
      }

      console.log("✅ vLLM response received");

      const answer =
        response.data?.choices?.[0]?.message
          ?.content || "";

      return answer;

    } catch (err) {
      console.error(
        "❌ vLLM error:",
        err.response?.data || err.message
      );

      if (attempt < CONFIG.RETRIES) {
        console.log(
          `⏳ Retrying in ${CONFIG.RETRY_DELAY}ms`
        );

        await delay(CONFIG.RETRY_DELAY);
      }
    }
  }

  return null;
}

// ==========================
// 🧹 FORMAT OUTPUT
// ==========================
function formatAnswer(text) {
  if (!text) return "";

  let formatted = text;

  // Remove markdown fences
  formatted = formatted.replace(
    /```html/g,
    ""
  );

  formatted = formatted.replace(
    /```/g,
    ""
  );

  // Bold markdown
  formatted = formatted.replace(
    /\*\*(.*?)\*\*/g,
    "<strong>$1</strong>"
  );

  // Headings
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

  // Numbered points
  formatted = formatted.replace(
    /^\d+\.\s/gm,
    "<br/>• "
  );

  // Bullet points
  formatted = formatted.replace(
    /^-\s/gm,
    "<br/>• "
  );

  // Paragraph spacing
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
      ).slice(0, 350),
    }));

  // ==========================
  // 💬 SYSTEM PROMPT
  // ==========================
  const systemPrompt = `
You are Aryabhata, an elite UPSC Civil Services mentor.

Generate detailed UPSC mains answers.

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
- Reports
- Committees
- Current affairs
- Case studies

3. Writing style:
- Analytical
- Structured
- High information density
- UPSC ranker style

4. NEVER:
- Give very short answers
- Stop abruptly
- Hallucinate fake facts
- Repeat unnecessarily

5. Keep answers:
- Balanced
- Multi-dimensional
- Exam-oriented

6. Use HTML formatting.
`;

  // ==========================
  // 💬 USER PROMPT
  // ==========================
  const userPrompt = `
QUESTION:
${prompt}

REFERENCE CONTEXT:
${contextText || "No reference context available."}

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

  // Trim history if too large
  if (estimatedPromptTokens > 3500) {
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
    return {
      answer: formatAnswer(rawAnswer),

      context_source: contextText
        ? "chunks_plus_llm"
        : "llm_only",

      tokensUsed:
        estimateTokens(rawAnswer),

      provider: "vllm-qwen",
    };
  }

  // ==========================
  // ❌ FAILURE
  // ==========================
  return {
    answer:
      "⚠️ AI server unavailable or returned empty response.",

    context_source: "llm_error",

    tokensUsed: 0,
  };
}