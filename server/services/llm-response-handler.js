// server/services/llm-response-handler.js

import axios from "axios";
import { isPrimeUser } from "../config/user.config.js";

// ==========================
// 🔧 CONFIG (lengths from .env)
// ==========================
const CONFIG = {
  MAX_TOKENS_SHORT: parseInt(process.env.MAX_TOKENS_SHORT || "256", 10),
  MAX_TOKENS_MEDIUM: parseInt(process.env.MAX_TOKENS_MEDIUM || "512", 10), // lowered for CPU stability
  MIN_TOKENS_MEDIUM: parseInt(process.env.MIN_TOKENS_MEDIUM || "430", 10),
  TARGET_TOKENS: parseInt(process.env.ANSWER_TARGET_TOKENS || "450", 10),
  MAX_TOKENS_LONG: parseInt(process.env.MAX_TOKENS_LONG || "1024", 10),
  TEMPERATURE: parseFloat(process.env.LLM_TEMPERATURE || "0.7"),
  MAX_CONTEXT: parseInt(process.env.MAX_CONTEXT_CHARS || "2000", 10),
  MAX_HISTORY: parseInt(process.env.MAX_HISTORY_MESSAGES || "10", 10),
  MAX_CHUNKS: parseInt(process.env.MAX_CHUNKS || "5", 10),
  TIMEOUT: parseInt(
    process.env.LLM_TIMEOUT || process.env.LLM_TIMEOUT_MS || "120000",
    10
  ),
};

// ==========================
// 🧠 LLAMA SERVER CONFIG
// ==========================
const BASE_URL = process.env.LLAMA_API_URL || "http://llama-server:8080";
const MODEL_PATH =
  process.env.LLAMA_MODEL || "qwen2.5-0.5b-instruct-q4_k_m.gguf";

// ==========================
// 🚀 CALL LLAMA SERVER
// ==========================
async function callLlama(messages, maxTokens, minTokens = 0) {
  try {
    const payload = {
      model: MODEL_PATH,
      messages,
      max_tokens: maxTokens,
      temperature: CONFIG.TEMPERATURE,
      stream: false,
    };

    if (minTokens > 0) {
      payload.min_tokens = minTokens;
    }

    const response = await axios.post(
      `${BASE_URL}/v1/chat/completions`, // ✅ OpenAI-compatible endpoint
      payload,
      {
        headers: { "Content-Type": "application/json" },
        timeout: CONFIG.TIMEOUT,
      }
    );

    return response.data?.choices?.[0]?.message?.content || "";
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
  return text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/### (.*?)/g, "<strong>$1</strong><br/>")
    .replace(/\n\n/g, "<br/><br/>")
    .replace(/\n/g, "<br/>");
}

function estimateGeneratedTokens(text) {
  if (!text?.trim()) return 0;
  return Math.ceil(text.trim().split(/\s+/).length * 1.3);
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
  if (!prompt) throw new Error("Prompt required");

  if (!isPrimeUser()) {
    return {
      answer: "Upgrade to Prime to access AI-powered answers.",
      context_source: "blocked_non_prime",
      tokensUsed: 0,
    };
  }

  const maxTokens = CONFIG.MAX_TOKENS_MEDIUM;

  // 📚 Context (RAG)
  const limitedChunks = chunks.slice(0, CONFIG.MAX_CHUNKS);
  const contextText = limitedChunks
    .map((c) => c.text || "")
    .join("\n\n")
    .slice(0, CONFIG.MAX_CONTEXT);

  console.log(`📚 Chunks injected: ${limitedChunks.length}`);

  // 🧠 History
  const formattedHistory =
    CONFIG.MAX_HISTORY > 0
      ? history
          .slice(-CONFIG.MAX_HISTORY)
          .map((m) => ({ role: m.role, content: m.content }))
      : [];

  // 💬 System prompt
const systemPrompt = `
You are an India-focused UPSC Mains answer writer.

Rules:
- Every answer must be close to 450 generated tokens, even when the question is short.
- Finish the answer cleanly within the token budget; never end mid-sentence.
- Write in UPSC Mains style: brief introduction, analytical body, balanced conclusion.
- Use this structure exactly: <strong>Introduction</strong>, <strong>Key Points</strong>, <strong>Challenges/Limitations</strong>, <strong>Way Forward</strong>, <strong>Conclusion</strong>.
- Use Indian context first: Constitution, laws, schemes, institutions, committees, judgments, examples, and current governance relevance where applicable.
- Do not use US/foreign examples as the main evidence unless the question specifically asks for a global comparison.
- Use statute names, years, committees, cases, and facts that appear in the retrieved reference context.
- Do not add new statute names, years, committees, cases, or facts that are absent from the retrieved context, unless no relevant context was found.
- For labour/trade-union questions, prefer accurate Indian references such as Article 19(1)(c), Trade Unions Act 1926, Industrial Disputes Act 1947, Industrial Relations Code 2020, collective bargaining, industrial democracy, informal workers, SEWA, INTUC, AITUC, CITU, BMS, and labour reforms where relevant.
- Use <strong>Introduction</strong>, <strong>Body</strong>, and <strong>Conclusion</strong>.
- Use compact bullet points in the body.
- Do not repeat the same sentence or conclusion. Each bullet must add a new point.
- Avoid repetition, broken words, filler, and hallucinated facts.
- If reference context is provided, use only that context for factual content. Do not add outside facts.
- If reference context is empty, then answer from your own knowledge.
`;

  // 💬 Final messages
  const messages = [
    { role: "system", content: systemPrompt },
    ...formattedHistory,
    {
      role: "user",
      content: `QUESTION:\n${prompt}\n\nREFERENCE CONTEXT:\n${contextText || "NO_RELEVANT_CONTEXT_FOUND"}\n\nGROUNDING RULE:\n${contextText ? "Use ONLY the reference context for factual content. Do not add outside facts, laws, examples, institutions, years, or claims that are not present in the retrieved chunks. You may only organize and rephrase the chunk content in UPSC Mains style." : "No relevant chunks were found, so answer from your own knowledge."}\n\nANSWER REQUIREMENT:\nWrite one complete India-focused UPSC Mains answer of 420-470 generated tokens. Use these headings exactly: Introduction, Key Points, Challenges/Limitations, Way Forward, Conclusion. Do not repeat any sentence. Finish with one short conclusion only.`,
    },
  ];

  // 🚀 Call llama-server
  let rawAnswer = await callLlama(
    messages,
    maxTokens,
    CONFIG.MIN_TOKENS_MEDIUM
  );

  for (let attempt = 0; rawAnswer && attempt < 2; attempt += 1) {
    const estimatedTokens = estimateGeneratedTokens(rawAnswer);

    if (estimatedTokens >= CONFIG.TARGET_TOKENS - 40) {
      break;
    }

    const remainingTokens = Math.min(
      maxTokens,
      Math.max(180, CONFIG.TARGET_TOKENS - estimatedTokens + 80)
    );

    const continuation = await callLlama(
      [
        ...messages,
        { role: "assistant", content: rawAnswer },
        {
          role: "user",
          content:
            "The previous answer is too short. Continue from the last incomplete section only. Use only facts already present in the reference context and previous answer. Do not introduce outside facts, laws, examples, institutions, years, or claims. Do not repeat any previous sentence, definition, heading, or conclusion.",
        },
      ],
      remainingTokens
    );

    if (!continuation?.trim()) {
      break;
    }

    rawAnswer = `${rawAnswer}\n\n${continuation}`;
  }

  if (rawAnswer && rawAnswer.trim()) {
    console.log("✅ llama-server response received");
    return {
      answer: formatAnswer(rawAnswer),
      context_source: limitedChunks.length
        ? "chunks_plus_llm"
        : "llm_only",
      tokensUsed: 0,
      provider: "llama-server",
    };
  }

  return {
    answer: "⚠️ Local AI server is unavailable or returned empty response.",
    context_source: "llm_error",
    tokensUsed: 0,
  };
}
