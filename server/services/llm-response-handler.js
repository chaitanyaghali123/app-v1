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
// 🔧 CONFIG
// ==========================
const CONFIG = {
  MAX_TOKENS: parseInt(process.env.MAX_TOKENS || "1024", 10),
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
    model: "llama-3.3-70b-versatile", // ✅ updated model name
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
  },
  {
    name: "Mistral",
    key: requireEnv("MISTRAL_API_KEY", true),
    url: "https://api.mistral.ai/v1/chat/completions",
    model: "mistral-small",
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
  },
  {
    name: "Cloudflare",
    key: requireEnv("CLOUDFLARE_API_KEY", true),
    url: `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/meta/llama-3-8b-instruct`,
    model: "llama-3-8b-instruct",
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
  },
  {
    name: "HuggingFace",
    key: requireEnv("HUGGINGFACE_API_KEY", true),
    url: "https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.2",
    model: "mistral-7b",
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
  },
  {
    name: "Google",
    key: requireEnv("GOOGLE_API_KEY", true),
    url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
    model: "gemini-2.0-flash",
    headers: (key) => ({ Authorization: `Bearer ${key}` }),
  },
];

// ==========================
// 🚀 CALL PROVIDER
// ==========================
async function callProvider(provider, messages) {
  if (!provider.key) return null;

  try {
    const payload =
      provider.name === "Google"
        ? { contents: [{ role: "user", parts: [{ text: messages.map(m => m.content).join("\n") }]}] }
        : { model: provider.model, messages, max_tokens: CONFIG.MAX_TOKENS, temperature: CONFIG.TEMPERATURE };

    const res = await axios.post(provider.url, payload, {
      headers: {
        "Content-Type": "application/json",
        ...provider.headers(provider.key),
      },
      timeout: 30000,
    });

    if (provider.name === "Google") {
      return res.data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    }
    if (provider.name === "HuggingFace") {
      return res.data?.generated_text || "";
    }
    return res.data?.choices?.[0]?.message?.content || "";
  } catch (err) {
    console.warn(`⚠️ ${provider.name} failed: ${err.message}`);
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

  // Context
  const limitedChunks = chunks.slice(0, CONFIG.MAX_CHUNKS);
  const contextText = limitedChunks.length
    ? limitedChunks.map((c) => c.text).join("\n\n").slice(0, CONFIG.MAX_CONTEXT)
    : "";

  // History
  const formattedHistory = history.slice(-CONFIG.MAX_HISTORY).map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const messages = [
    {
      role: "system",
      content: `You are a highly intelligent AI tutor and UPSC mentor. Answer clearly, structured, with HTML formatting.`,
    },
    ...formattedHistory,
    {
      role: "user",
      content: `${prompt}\n\n${contextText ? `REFERENCE CONTEXT:\n${contextText}` : ""}`,
    },
  ];

  // Try providers in order
  for (const provider of PROVIDERS) {
    const answer = await callProvider(provider, messages);
    if (answer && answer.trim()) {
      console.log(`✅ Provider used: ${provider.name}`);
      return {
        answer: answer
          .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
          .replace(/### (.*?)/g, "<strong>$1</strong><br/>")
          .replace(/\n\n/g, "<br/><br/>")
          .replace(/\n/g, "<br/>"),
        context_source: limitedChunks.length ? "chunks_plus_llm" : "llm_only",
        tokensUsed: 0,
        provider: provider.name,   // ✅ include provider in response
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
