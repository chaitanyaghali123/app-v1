// server/services/llm-response-handler.js

import axios from "axios";
import { isPrimeUser } from "../config/user.config.js";

// ==========================
// 🔧 CONFIG
// ==========================
const CONFIG = {
  // ONLY LONG UPSC ANSWERS
  MAX_TOKENS_LONG: parseInt(
    process.env.MAX_TOKENS_LONG || "1400",
    10
  ),

  TEMPERATURE: parseFloat(
    process.env.LLM_TEMPERATURE || "0.4"
  ),

  // Context control
  MAX_CONTEXT: parseInt(
    process.env.MAX_CONTEXT_CHARS || "1800",
    10
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

  // Phi-3 safe zone
  MAX_TOTAL_CONTEXT_TOKENS: parseInt(
    process.env.MAX_TOTAL_CONTEXT_TOKENS || "1400",
    10
  ),

  TIMEOUT: parseInt(
    process.env.LLM_TIMEOUT || "300000",
    10
  ),
};

// ==========================
// 🧠 LLAMA CONFIG
// ==========================
const BASE_URL =
  process.env.LLAMA_API_URL ||
  "http://llama-server:8080";

const MODEL_PATH =
  process.env.LLAMA_MODEL ||
  "/models/Phi-3-mini-4k-instruct-q4.gguf";

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
// 🚀 CALL LLAMA
// ==========================
async function callLlama(messages, maxTokens) {
  try {
    const payload = {
      model: MODEL_PATH,
      messages,
      max_tokens: maxTokens,
      temperature: CONFIG.TEMPERATURE,
      stream: true,
    };

    const response = await axios.post(
      `${BASE_URL}/v1/chat/completions`,
      payload,
      {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: CONFIG.TIMEOUT,
        responseType: "stream",
      }
    );

    let output = "";

    const stream = response.data;

    return new Promise((resolve, reject) => {
      stream.on("data", (chunk) => {
        try {
          const lines = chunk
            .toString()
            .split("\n")
            .filter(Boolean);

          for (const line of lines) {
            if (!line.startsWith("data: "))
              continue;

            const data = line.replace(
              "data: ",
              ""
            );

            if (data === "[DONE]") continue;

            const parsed = JSON.parse(data);

            const delta =
              parsed?.choices?.[0]?.delta?.content;

            if (delta) {
              output += delta;

              process.stdout.write(delta);
            }
          }
        } catch (err) {
          console.error(
            "❌ Stream parse error:",
            err.message
          );
        }
      });

      stream.on("end", () => {
        resolve(output);
      });

      stream.on("error", (err) => {
        reject(err);
      });
    });
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

  // Bullet points
  formatted = formatted.replace(
    /^\d+\.\s/gm,
    "<br/>• "
  );

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
      ).slice(0, 250),
    }));

  // ==========================
  // 💬 SYSTEM PROMPT
  // ==========================
  const systemPrompt = `
You are Aryabhata, an elite UPSC Civil Services Examination mentor.

Your job is to generate FULL-LENGTH UPSC MAINS ANSWERS exactly like top UPSC rankers.

STRICT INSTRUCTIONS:

1. EVERY answer must contain:
- Introduction
- Main Body
- Conclusion

2. Generate LONG analytical answers suitable for:
- UPSC GS Papers
- Essay-style analytical answers
- 10 marker and 15 marker questions

3. The answer MUST:
- Be detailed
- Be multidimensional
- Be content-rich
- Be exam-oriented
- Be analytical rather than descriptive

4. Include wherever relevant:
- Constitutional provisions
- Supreme Court judgments
- Committees
- Government schemes
- Committees and commissions
- Current affairs
- Reports
- Data and statistics
- Examples
- Case studies

5. Use multidimensional analysis:
- Political
- Economic
- Social
- Historical
- Ethical
- Governance
- Environmental
- International Relations

6. Writing Style:
- Crisp
- Analytical
- High-information density
- Structured
- Ranker-style presentation

7. IMPORTANT:
- NEVER generate short answers
- NEVER give one paragraph answers
- NEVER stop abruptly
- NEVER generate unrelated content
- Prioritize context heavily
- Avoid hallucinations
- Keep answer complete and balanced

FORMATTING RULES:
- Use HTML formatting
- Use <strong> for headings
- Use bullet points
- Maintain readable spacing
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
Generate a FULL-LENGTH UPSC Mains answer.

The answer must:
- Be detailed and analytical
- Follow Introduction, Body, Conclusion
- Be suitable for 2-page UPSC answer writing
- Include multidimensional analysis
- Use headings and bullet points
- Be rich in content
- Be UPSC ranker-level quality
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
    estimateTokens(JSON.stringify(messages));

  console.log(
    `🧠 Estimated prompt tokens: ${estimatedPromptTokens}`
  );

  // Prevent Phi-3 overflow
  if (estimatedPromptTokens > 1700) {
    console.warn(
      "⚠️ Prompt too large, trimming history"
    );

    messages.splice(1, formattedHistory.length);
  }

  // ==========================
  // 🚀 ALWAYS LONG ANSWERS
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

      tokensUsed: estimateTokens(rawAnswer),

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