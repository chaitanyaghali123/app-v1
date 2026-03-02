import axios from "axios";

if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error("ANTHROPIC_API_KEY not set");
}

export class AnthropicLLM {
  name = "anthropic";

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
      // Final prompt
      // -----------------------------
      const finalPrompt = `
SYSTEM:
${systemPrompt}

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
      // Claude call
      // -----------------------------
      const res = await axios.post(
        "https://api.anthropic.com/v1/messages",
        {
          model: "claude-3-haiku-20240307",
          max_tokens: maxTokens,
          messages: [{ role: "user", content: finalPrompt }]
        },
        {
          headers: {
            "x-api-key": process.env.ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json"
          },
          timeout: 30000
        }
      );

      return res.data.content[0].text || "";
    } catch (err) {
      err.llm = this.name;
      throw err;
    }
  }
}
