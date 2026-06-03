import { queryChroma } from "../services/vector.service.js";
import { pool } from "../services/db.service.js";
import axios from "axios";

const DEFAULT_MAX_CHUNKS = 3;
const DEFAULT_MAX_CONTEXT_CHARS = 1200;
const MIN_USEFUL_CHUNK_CHARS = 80;
const LLAMA_BASE_URL = process.env.LLAMA_API_URL || "http://llama-server:8080";
const LLAMA_MODEL =
  process.env.LLAMA_MODEL || "qwen2.5-0.5b-instruct-q4_k_m.gguf";
const MOBILE_POLISH_MODE = process.env.MOBILE_POLISH_MODE || "full";
const MOBILE_POLISH_TIMEOUT_MS = Number(
  process.env.MOBILE_POLISH_TIMEOUT_MS || 600000
);
const MOBILE_POLISH_MAX_TOKENS = Number(
  process.env.MOBILE_POLISH_MAX_TOKENS || 900
);

function cleanChunkText(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildChunkAnswerPrompt({ question, chunks, targetTokens }) {
  const context = chunks
    .map((chunk, index) => `Chunk ${index + 1}:\n${chunk.text}`)
    .join("\n\n");

  return `You are an India-focused UPSC Mains answer writer.

Use ONLY the reference chunks for factual content. Do not add outside facts, laws, examples, institutions, years, or claims. If the chunks are insufficient, say so briefly and answer only from what is available.

Write one complete UPSC Mains answer of about ${targetTokens} generated tokens.
Use these headings exactly:
<strong>Introduction</strong>
<strong>Key Points</strong>
<strong>Challenges/Limitations</strong>
<strong>Way Forward</strong>
<strong>Conclusion</strong>

Do not repeat any sentence. Finish cleanly.

QUESTION:
${question}

REFERENCE CHUNKS:
${context || "NO_RELEVANT_CONTEXT_FOUND"}`;
}

function parseJsonObject(text) {
  const clean = String(text || "")
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    return JSON.parse(clean);
  } catch {
    const match = clean.match(/\{[\s\S]*\}/);
    if (!match) return null;

    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function cleanPolishText(text) {
  return String(text || "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 420);
}

function cleanFullPolishAnswer(text) {
  return String(text || "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 5200);
}

function cleanReplacementText(text) {
  return String(text || "")
    .replace(/<[^>]+>/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 360);
}

function hasRequiredHeadings(text) {
  return (
    /Introduction:/i.test(text) &&
    /Key Points:/i.test(text) &&
    /Challenges\/Limitations:/i.test(text) &&
    /Way Forward:/i.test(text) &&
    /Conclusion:/i.test(text)
  );
}

function parsePolishResponse(text) {
  const json = parseJsonObject(text);

  if (json) {
    const answer = cleanFullPolishAnswer(json.answer);
    return {
      answer: hasRequiredHeadings(answer) ? answer : "",
      intro: cleanPolishText(json.intro),
      conclusion: cleanPolishText(json.conclusion),
    };
  }

  const clean = String(text || "").trim();
  const fullAnswer = cleanFullPolishAnswer(clean);
  if (hasRequiredHeadings(fullAnswer) || fullAnswer.length >= 500) {
    return {
      answer: fullAnswer,
      intro: "",
      conclusion: "",
    };
  }

  const introMatch = clean.match(
    /(?:^|\n)(?:I|Intro|Introduction)\s*[:=]\s*([\s\S]*?)(?=\n(?:C|Conclusion)\s*[:=]|$)/i
  );
  const conclusionMatch = clean.match(
    /(?:^|\n)(?:C|Conclusion)\s*[:=]\s*([\s\S]*?)$/i
  );

  return {
    answer: "",
    intro: cleanPolishText(introMatch?.[1]),
    conclusion: cleanPolishText(conclusionMatch?.[1]),
  };
}

function parseReplacementResponse(text) {
  const json = parseJsonObject(text);
  const rawReplacements = Array.isArray(json?.replacements)
    ? json.replacements
    : [];

  return rawReplacements
    .map((item) => ({
      find: cleanReplacementText(item?.find),
      replace: cleanReplacementText(item?.replace),
    }))
    .filter(
      (item) =>
        item.find &&
        item.replace &&
        item.find !== item.replace &&
        item.find.split(/\s+/).length <= 16 &&
        item.replace.split(/\s+/).length <= 24
    )
    .slice(0, 10);
}

function applyReplacementPatch(answer, replacements) {
  let updated = String(answer || "");

  for (const { find, replace } of replacements) {
    if (!updated.includes(find)) continue;
    updated = updated.replace(find, replace);
  }

  return cleanFullPolishAnswer(updated);
}

function buildPolishPrompt({ question, answer }) {
  if (MOBILE_POLISH_MODE === "patch") {
    return buildPatchPolishPrompt({ question, answer });
  }

  if (MOBILE_POLISH_MODE === "full") {
    return buildFullPolishPrompt({ question, answer });
  }

  const answerForPolish = extractPolishBase(answer);

  return `Polish wording, no new facts. Reply exactly:
I=<intro under 14 words>
C=<conclusion under 14 words>
Q:${question}
${answerForPolish}
`;
}

function buildPatchPolishPrompt({ question, answer }) {
  return `You are a strict UPSC Mains language polisher.

TASK:
Return a small JSON patch that improves wording across the full DRAFT.

RULES:
- Do not add any new fact, law, example, institution, year, number, country, or claim.
- Use only facts already present in the DRAFT.
- Keep the same headings and meaning.
- Do not rewrite the whole answer.
- Return only JSON with this exact shape:
{"replacements":[{"find":"exact phrase from DRAFT","replace":"better phrase"}]}
- Each "find" must be an exact phrase copied from the DRAFT.
- Each replacement should improve UPSC language, remove repetition, or remove phrases like "the notes", "the material", "retrieved material".
- Maximum 10 replacements.
- If no safe replacement is possible, return {"replacements":[]}.

QUESTION:
${question}

DRAFT:
${cleanFullPolishAnswer(answer)}
`;
}

function buildFullPolishPrompt({ question, answer }) {
  return `You are a strict UPSC Mains answer polisher.

TASK:
Rewrite the entire DRAFT into cleaner UPSC Mains language.

RULES:
- Do not add any new fact, law, example, institution, year, number, country, or claim.
- Use only facts already present in the DRAFT.
- Keep the same meaning.
- Remove awkward wording, repetition, and phrases like "the notes state" where possible.
- Do not summarize the answer. Rewrite all sections of the DRAFT.
- Preserve the DRAFT length and structure as much as possible.
- Do not omit any heading or section.
- Keep these exact headings:
Introduction:
Key Points:
Challenges/Limitations:
Way Forward:
Conclusion:
- Return only the complete polished answer text.
- Do not return JSON.
- Do not wrap the answer in markdown fences.

QUESTION:
${question}

DRAFT:
${cleanFullPolishAnswer(answer)}
`;
}

function extractPolishBase(answer) {
  const text = String(answer || "");
  const intro = extractSection(text, "Introduction", [
    "Key Points",
    "Challenges/Limitations",
    "Way Forward",
    "Conclusion",
  ]);
  const conclusion = extractSection(text, "Conclusion", []);

  return [
    intro ? `I:${trimWords(intro, 32)}` : "",
    conclusion ? `C:${trimWords(conclusion, 28)}` : "",
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 700);
}

function trimWords(text, maxWords) {
  const words = cleanChunkText(text).split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return words.join(" ");
  return `${words.slice(0, maxWords).join(" ")}.`;
}

function extractSection(answer, heading, nextHeadings) {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const nextPattern = nextHeadings.length
    ? `(?=\\n\\n(?:${nextHeadings
        .map((item) => item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join("|")}):)`
    : "$";
  const match = answer.match(
    new RegExp(`${escapedHeading}:\\n([\\s\\S]*?)${nextPattern}`)
  );

  return cleanChunkText(match?.[1] || "");
}

function getSearchTerms(question) {
  return String(question || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((term) => term.length > 2)
    .slice(0, 8);
}

async function queryPostgresChunks({ question, maxChunks }) {
  const limit = Math.max(maxChunks * 3, 10);

  try {
    const ranked = await pool.query(
      `
      SELECT
        id,
        chunk,
        topic,
        difficulty,
        source_file,
        ts_rank(search_vector, plainto_tsquery('english', $1)) AS score
      FROM upsc_chunks
      WHERE search_vector @@ plainto_tsquery('english', $1)
      ORDER BY score DESC, created_at DESC
      LIMIT $2
      `,
      [question, limit]
    );

    let rows = ranked.rows;

    if (rows.length === 0) {
      const terms = getSearchTerms(question);

      if (terms.length === 0) return [];

      const clauses = terms
        .map((_, index) => `chunk ILIKE $${index + 1}`)
        .join(" OR ");

      const fallback = await pool.query(
        `
        SELECT id, chunk, topic, difficulty, source_file
        FROM upsc_chunks
        WHERE ${clauses}
        ORDER BY created_at DESC
        LIMIT $${terms.length + 1}
        `,
        [...terms.map((term) => `%${term}%`), limit]
      );

      rows = fallback.rows;
    }

    return rows.map((row) => ({
      id: row.id,
      text: cleanChunkText(row.chunk),
      metadata: {
        topic: row.topic,
        difficulty: row.difficulty,
        source_file: row.source_file,
        source: "postgres",
      },
    }));
  } catch (err) {
    console.warn("PostgreSQL chunk fallback failed:", err.message);
    return [];
  }
}

export async function getMobileRagContext(req, res) {
  try {
    const {
      question,
      maxChunks = DEFAULT_MAX_CHUNKS,
      maxContextChars = DEFAULT_MAX_CONTEXT_CHARS,
      targetTokens = 450,
    } = req.body || {};

    if (!question || typeof question !== "string") {
      return res.status(400).json({ error: "question is required" });
    }

    const requestedMaxChunks = Math.max(
      1,
      Number(maxChunks) || DEFAULT_MAX_CHUNKS
    );

    const retrievedChunks = await queryChroma({
      prompt: question,
      topK: requestedMaxChunks,
      skipRerank: true,
    });
    let usefulChunks = retrievedChunks
      .map((chunk) => ({
        id: chunk.id,
        text: cleanChunkText(chunk.text),
        metadata: chunk.metadata || {},
      }))
      .filter((chunk) => chunk.text.length >= MIN_USEFUL_CHUNK_CHARS);

    if (usefulChunks.length === 0) {
      usefulChunks = await queryPostgresChunks({
        question,
        maxChunks: requestedMaxChunks,
      });
    }

    const limitedChunks = usefulChunks
      .slice(0, requestedMaxChunks);

    let usedChars = 0;
    const contextBudget = Math.max(
      300,
      Number(maxContextChars) || DEFAULT_MAX_CONTEXT_CHARS
    );

    const budgetedChunks = limitedChunks
      .map((chunk) => {
        const remaining = contextBudget - usedChars;
        if (remaining < MIN_USEFUL_CHUNK_CHARS) return null;

        const text = chunk.text.slice(0, remaining);
        if (text.length < MIN_USEFUL_CHUNK_CHARS) return null;

        usedChars += text.length;

        return {
          ...chunk,
          text,
        };
      })
      .filter(Boolean);

    return res.json({
      question,
      chunks: budgetedChunks,
      chunkCount: budgetedChunks.length,
      targetTokens: Number(targetTokens) || 450,
      prompt: buildChunkAnswerPrompt({
        question,
        chunks: budgetedChunks,
        targetTokens: Number(targetTokens) || 450,
      }),
      generation: {
        runtime: "chunk-composer",
        local: true,
        maxTokens: Number(targetTokens) || 450,
        temperature: 0,
      },
    });
  } catch (err) {
    console.error("Mobile RAG context error:", err.message);
    return res.status(500).json({ error: "Failed to prepare mobile context" });
  }
}

export async function polishMobileAnswer(req, res) {
  try {
    const { question, answer, chunks = [] } = req.body || {};

    if (!question || typeof question !== "string") {
      return res.status(400).json({ error: "question is required" });
    }

    if (!answer || typeof answer !== "string") {
      return res.status(400).json({ error: "answer is required" });
    }

    const response = await axios.post(
      `${LLAMA_BASE_URL}/v1/chat/completions`,
      {
        model: LLAMA_MODEL,
        messages: [
          {
            role: "system",
            content:
              "You polish UPSC Mains answers. Never add facts. Return only the requested JSON or terse fields.",
          },
          {
            role: "user",
            content: buildPolishPrompt({ question, answer, chunks }),
          },
        ],
        max_tokens: MOBILE_POLISH_MAX_TOKENS,
        temperature: 0.2,
        stream: false,
      },
      {
        headers: { "Content-Type": "application/json" },
        timeout: MOBILE_POLISH_TIMEOUT_MS,
      }
    );

    const raw =
      response.data?.choices?.[0]?.message?.content ||
      response.data?.choices?.[0]?.text ||
      "";

    if (MOBILE_POLISH_MODE === "patch") {
      const replacements = parseReplacementResponse(raw);
      const patchedAnswer = applyReplacementPatch(answer, replacements);

      if (replacements.length === 0 || patchedAnswer === cleanFullPolishAnswer(answer)) {
        return res.json({
          polishApplied: false,
          reason: "empty_polish",
        });
      }

      return res.json({
        polishApplied: true,
        answer: patchedAnswer,
        intro: "",
        conclusion: "",
        provider: "llama-server",
        model: LLAMA_MODEL,
        mode: "patch",
        replacements: replacements.length,
      });
    }

    const { answer: polishedAnswer, intro, conclusion } = parsePolishResponse(raw);

    if (!polishedAnswer && !intro && !conclusion) {
      return res.json({
        polishApplied: false,
        reason: "empty_polish",
      });
    }

    return res.json({
      polishApplied: true,
      answer: polishedAnswer,
      intro,
      conclusion,
      provider: "llama-server",
      model: LLAMA_MODEL,
    });
  } catch (err) {
    console.warn(
      "Mobile polish skipped:",
      err.response?.data || err.message
    );

    return res.json({
      polishApplied: false,
      reason: "polish_timeout_or_unavailable",
    });
  }
}
