import OpenAI from "openai";

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY not set");
}

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export class OpenAILLM {
  name = "openai";

  async generate({
    prompt,
    history = [],
    chunks,
    subject_id = "General",
    user_id = "anon",
    mode = "ask"
  }) {
    try {
      // -----------------------------
      // Build memory context
      // -----------------------------
      let memoryText = "";

      if (Array.isArray(history) && history.length > 0) {
        memoryText = history
          .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
          .join("\n");
      }

      // -----------------------------
      // Build chunk context
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
      // System prompt
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
Ensure all sections are completed; keep answers concise if space is limited.
`;
      }

      // -----------------------------
      // Final user prompt
      // -----------------------------
      const userPrompt = `
PREVIOUS DISCUSSION:
${memoryText || "None"}

SUBJECT: ${subject_id}

CONTEXT:
${contextText}

QUESTION:
${prompt}
`;

      // -----------------------------
      // Token control
      // -----------------------------
      const maxTokens = mode === "learn_more" ? 2800 : 1200;

      // -----------------------------
      // OpenAI call
      // -----------------------------
      const response = await client.responses.create({
        model: "gpt-5.2",
        input: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.3,
        max_output_tokens: maxTokens
      });

      return response.output_text || "";
    } catch (err) {
      err.llm = this.name;
      throw err;
    }
  }
}
