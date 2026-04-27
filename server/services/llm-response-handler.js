//llm-response-handler.js

import axios from "axios";
import { isPrimeUser } from "../config/user.config.js";

// ==========================
// 🔒 ENV VALIDATION
// ==========================
function requireEnv(name, optional = false) {
  const value = process.env[name];
  if (!value && !optional) {
    throw new Error(`❌ Missing env variable: ${name}`);
  }
  return value;
}

// ==========================
// 🔧 CONFIG (lengths from .env)
// ==========================
const CONFIG = {
  MAX_TOKENS_SHORT: parseInt(process.env.MAX_TOKENS_SHORT || "256", 10),
  MAX_TOKENS_MEDIUM: parseInt(process.env.MAX_TOKENS_MEDIUM || "1024", 10),
  MAX_TOKENS_LONG: parseInt(process.env.MAX_TOKENS_LONG || "2048", 10),
  TEMPERATURE: parseFloat(process.env.LLM_TEMPERATURE || "0.7"),
  MAX_CONTEXT: parseInt(process.env.MAX_CONTEXT_CHARS || "4000", 10),
  MAX_HISTORY: parseInt(process.env.MAX_HISTORY_MESSAGES || "10", 10),
  MAX_CHUNKS: parseInt(process.env.MAX_CHUNKS || "5", 10),
};

// ==========================
// 🔁 PROVIDERS
// ==========================
const PROVIDERS = [
  {
    name: "Groq",
    key: requireEnv("GROQ_API_KEY", true),
    url: "https://api.groq.com/openai/v1/chat/completions",
    model: "llama-3.3-70b-versatile",
    type: "openai",
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
  },
  {
    name: "Mistral",
    key: requireEnv("MISTRAL_API_KEY", true),
    url: "https://api.mistral.ai/v1/chat/completions",
    model: "mistral-small",
    type: "openai",
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
  },
  {
    name: "Cloudflare",
    key: requireEnv("CLOUDFLARE_API_KEY", true),
    url: `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/meta/llama-3-8b-instruct`,
    model: "@cf/meta/llama-3-8b-instruct",
    type: "cloudflare",
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
  },
  {
    name: "Cerebras",
    key: requireEnv("CEREBRAS_API_KEY", true),
    url: "https://api.cerebras.ai/v1/chat/completions",
    model: "llama3.1-8b",
    type: "openai",
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
  },
];

// ==========================
// 🚀 CALL PROVIDER
// ==========================
async function callProvider(provider, messages, maxTokens) {
  if (!provider.key) {
    console.warn(`⏭️ Skipping ${provider.name} (no API key)`);
    return null;
  }

  try {
    let payload;

    switch (provider.type) {
      case "openai":
        payload = {
          model: provider.model,
          messages,
          max_tokens: maxTokens,
          temperature: CONFIG.TEMPERATURE,
        };
        break;

      case "cloudflare":
        payload = { messages };
        break;

      default:
        return null;
    }

    const res = await axios.post(provider.url, payload, {
      headers: {
        "Content-Type": "application/json",
        ...provider.headers(provider.key),
      },
      timeout: 15000,
    });

    switch (provider.type) {
      case "openai":
        return res.data?.choices?.[0]?.message?.content || "";

      case "cloudflare":
        return res.data?.result?.response || "";

      default:
        return null;
    }
  } catch (err) {
    console.warn(`❌ ${provider.name} failed:`, err.response?.data || err.message);
    return null;
  }
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

  // ✅ Always use medium length by default
  const maxTokens = CONFIG.MAX_TOKENS_MEDIUM;

  // ✅ Context from syllabus/vector DB chunks
  const limitedChunks = chunks.slice(0, CONFIG.MAX_CHUNKS);
  const contextText = limitedChunks
    .map((c) => c.text)
    .join("\n\n")
    .slice(0, CONFIG.MAX_CONTEXT);

    // 🔍 Log how many chunks are injected
    console.log(`📚 Chunks injected into LLM: ${limitedChunks.length}`);
    limitedChunks.forEach((chunk, idx) => {
      console.log(`   Chunk ${idx + 1}: ${chunk.text.substring(0, 200)}...`);
    });
    console.log("📖 Final contextText length:", contextText.length);

  // ✅ History
  const formattedHistory = history
    .slice(-CONFIG.MAX_HISTORY)
    .map((m) => ({
      role: m.role,
      content: m.content,
    }));

  // ✅ Messages sent to LLM
  const messages = [
    {
      role: "system",
      content:
        "You are a highly intelligent AI tutor and UPSC mentor. Always provide complete, accurate, and structured answers using HTML formatting. Use the reference context provided to ground your answers.",
    },
    ...formattedHistory,
    {
      role: "user",
      content: `${prompt}\n\nREFERENCE CONTEXT:\n${contextText}`,
    },
  ];

  // ✅ Try providers in order
  for (const provider of PROVIDERS) {
    const answer = await callProvider(provider, messages, maxTokens);

    if (answer && answer.trim()) {
      console.log(`✅ Provider used: ${provider.name}`);

      return {
        answer: answer
          .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
          .replace(/### (.*?)/g, "<strong>$1</strong><br/>")
          .replace(/\n\n/g, "<br/><br/>")
          .replace(/\n/g, "<br/>"),
        context_source: limitedChunks.length
          ? "chunks_plus_llm"
          : "llm_only",
        tokensUsed: 0,
        provider: provider.name,
      };
    } else {
      console.warn(`⚠️ ${provider.name} failed or returned empty`);
    }
  }

  return {
    answer: "⚠️ All providers failed. Try again later.",
    context_source: "llm_error",
    tokensUsed: 0,
  };
}
