// server/services/llm.service.js

import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config({ path: "/app/.env" });

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY not set");
}

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Unified OpenAI LLM call
 * (Gemini completely removed)
 */
export async function callOpenAI(
  prompt,
  chunks = null,
  subject_id = "General",
  user_id = "anon",
  mode = "ask"
) {
  try {
    // -----------------------------
    // Build context
    // -----------------------------
    let contextText = "No reference material available.";

    if (Array.isArray(chunks) && chunks.length > 0) {
      contextText = chunks
        .map(
          (c, i) =>
            `Source ${i + 1} (${c.metadata?.source || "notes"}):\n${c.text}`
        )
        .join("\n\n")
        .slice(0, 12000);
    }

    // -----------------------------
    // System prompt (mode-aware)
    // -----------------------------
    let systemPrompt = `
You are a UPSC-focused academic assistant.
Use ONLY the given context when available.
Always respond in clear, academic ENGLISH only.
Do not use Hindi or any other language.
If context is insufficient, provide a UPSC-ready English explanation.
Respond in well-structured HTML.
`;

    if (mode === "learn_more") {
      systemPrompt += `
Expand deeply with:
- Background
- Case studies
- Examples
- Pros & cons
- Future outlook
(All content must be in English only.)
`;
    }

    // -----------------------------
    // Final user prompt
    // -----------------------------
    const userPrompt = `
SUBJECT: ${subject_id}

CONTEXT:
${contextText}

QUESTION:
${prompt}
`;

    // -----------------------------
    // OpenAI GPT-5.2 call
    // -----------------------------
    const response = await client.responses.create({
      model: "gpt-5.2",
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      max_output_tokens: 1200,
    });

    return {
      answer: response.output_text || "",
      citations: [], // citations still come from chunks
    };
  } catch (err) {
    console.error("❌ OpenAI error:", err.message);
    return {
      answer: "Answer generation failed.",
      citations: [],
    };
  }
}
