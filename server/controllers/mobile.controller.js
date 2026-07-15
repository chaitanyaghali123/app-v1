import { queryChroma } from "../services/vector.service.js";
import { pool } from "../services/db.service.js";

import fs from "fs";
import path from "path";
const DEFAULT_MAX_CHUNKS = 5;

const DEFAULT_MAX_CONTEXT_CHARS = 4000;
const MOBILE_GEMINI_MAX_CHUNKS = Math.max(
  1,
  Number(process.env.GEMINI_MAX_CHUNKS || 8)
);
const MOBILE_GEMINI_MAX_CONTEXT_CHARS = Math.max(
  300,
  Number(process.env.GEMINI_MAX_CONTEXT_CHARS || 12000)
);
const MAX_FILE_COVERAGE_SOURCE_CHUNKS = 240;
const MIN_USEFUL_CHUNK_CHARS = 20;
const MOBILE_MODEL_DIR = path.resolve("mobile-models");
const MOBILE_MODEL_FILES = new Set([
  "llama3_2_1b_instruct_vulkan_8w_fp16_et11.pte",
  "llama3_2_1b_tokenizer.json",
  "llama3_2_1b_tokenizer_config.json",
  "tokenizer.json",
  "tokenizer_config.json",
]);
const SEARCH_STOP_WORDS = new Set([
  "about",
  "define",
  "describe",
  "discuss",
  "does",
  "explain",
  "from",
  "have",
  "into",
  "that",
  "their",
  "this",
  "what",
  "when",
  "where",
  "which",
  "with",
]);

const EVIDENCE_FACETS = [
  {
    name: "definition",
    pattern:
      /\b(definition|defined as|means|refers to|is a digital|launched a cryptocurrency|origin|satoshi|is an? (?:organised|organized|system|process|technology|institution))\b/i,
  },
  {
    name: "india",
    pattern:
      /\b(india|indian|rbi|reserve bank|parliament|article 19|ministry|meity|fema|gst|income tax)\b/i,
  },
  {
    name: "challenges",
    pattern:
      /\b(challenge|risk|misuse|fraud|tax evasion|terror|volatile|volatility|pollution|e-waste|hacking|black money|ponzi|consumer protection)\b/i,
  },
  {
    name: "examples",
    pattern:
      /\b(example|application|use case|world bank|unicef|el salvador|ethereum|litecoin|bitcoin|case study)\b/i,
  },
  {
    name: "way-forward",
    pattern:
      /\b(regulation|regulatory|framework|reform|committee|transparency|data protection|accountability|way forward|calibrated)\b/i,
  },
];

const DOMAIN_QUERY_EXPANSIONS = [
  {
    pattern: /\btrade\s+unions?\b/i,
    query:
      "industrial relations collective bargaining workers participation labour welfare industrial disputes social security",
  },
  {
    pattern: /\b(bitcoin|crypto(?:currency|currencies)?)\b/i,
    query:
      "Satoshi 2009 decentralized virtual currency blockchain RBI Supreme Court taxation volatility mining regulation illegal trade terror finance",
  },
  {
    pattern: /\bmetallic\s+money\b/i,
    query:
      "commodity money coins intrinsic value full bodied coins token coins Indian currency history",
  },
];

function cleanChunkText(text) {
  return String(text || "")
    .replace(/₹/g, "Rs ")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function chunkQualityPenalty(text) {
  let penalty = 0;
  if (/\.{8,}/.test(text)) penalty += 30;
  if (/\b(answer codes|find correct statement|mcq|table of contents)\b/i.test(text)) {
    penalty += 24;
  }
  if ((text.match(/\b\d+\.\d+(?:\.\d+)?\b/g) || []).length >= 4) penalty += 18;
  if ((text.match(/\?{2,}|_{3,}/g) || []).length >= 2) penalty += 12;
  return penalty;
}

function chunkRelevanceScore(chunk, question) {
  const text = cleanChunkText(chunk.text);
  const lower = text.toLowerCase();
  const terms = getSearchTerms(question);
  const phrase = terms.join(" ");
  let score = Number(chunk.metadata?.search_score || 0) * 20;

  if (phrase && lower.includes(phrase)) score += 24;
  for (const term of terms) {
    const matches = lower.match(new RegExp(`\\b${term}\\w*`, "g"));
    score += Math.min(matches?.length || 0, 4) * 6;
  }

  if (/\b(definition|defined as|means|refers to)\b/i.test(text)) score += 12;
  if (/\b(india|indian|rbi|reserve bank|supreme court|parliament)\b/i.test(text)) {
    score += 7;
  }
  score -= chunkQualityPenalty(text);
  return score;
}

function significantWords(text) {
  return new Set(
    cleanChunkText(text)
      .toLowerCase()
      .match(/[a-z]{4,}/g)
      ?.filter((word) => !SEARCH_STOP_WORDS.has(word)) || []
  );
}

function isNearDuplicate(left, right) {
  const a = significantWords(left);
  const b = significantWords(right);
  if (a.size === 0 || b.size === 0) return false;

  let overlap = 0;
  for (const word of a) {
    if (b.has(word)) overlap += 1;
  }

  return overlap / Math.min(a.size, b.size) >= 0.82;
}

function matchesEvidenceFacet(text, facet, question) {
  if (facet.name !== "definition") return facet.pattern.test(text);

  const lower = text.toLowerCase();
  const terms = getSearchTerms(question);
  const subject = terms.join(" ").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (
    subject &&
    new RegExp(
      `\\b${subject}\\s*(?:means\\b|refers to\\b|is\\s+(?:a|an|the)\\b)`,
      "i"
    ).test(text)
  ) {
    return true;
  }
  if (!facet.pattern.test(text)) return false;
  const definitionSignals = [
    "definition",
    "defined as",
    "means",
    "refers to",
    "is a digital",
    "launched a cryptocurrency",
    "origin",
    "satoshi",
  ];

  return terms.some((term) => {
    const termIndex = lower.indexOf(term);
    if (termIndex < 0) return false;
    return definitionSignals.some((signal) => {
      const signalIndex = lower.indexOf(signal);
      return signalIndex >= 0 && Math.abs(signalIndex - termIndex) <= 80;
    });
  });
}

function wordOverlap(a, b) {
  const wa = significantWords(a);
  const wb = significantWords(b);
  if (wa.size === 0 || wb.size === 0) return 0;
  let overlap = 0;
  for (const w of wa) { if (wb.has(w)) overlap += 1; }
  return overlap / Math.max(wa.size, wb.size);
}

function tagEvidenceFacets(chunks, question) {
  return chunks.map((chunk) => {
    const matchedFacet = EVIDENCE_FACETS.find((facet) =>
      matchesEvidenceFacet(chunk.text, facet, question)
    );

    return {
      ...chunk,
      metadata: {
        ...(chunk.metadata || {}),
        rag_facet: matchedFacet?.name || "supporting-evidence",
      },
    };
  });
}

function selectBalancedChunks(chunks, question, maxChunks) {
  const ranked = chunks
    .map((chunk) => ({
      ...chunk,
      text: cleanChunkText(chunk.text),
      relevanceScore: chunkRelevanceScore(chunk, question),
    }))
    .filter((chunk) => chunk.text.length >= MIN_USEFUL_CHUNK_CHARS)
    .sort((a, b) => b.relevanceScore - a.relevanceScore);

  const bestScore = ranked[0]?.relevanceScore || 0;
  const relevanceFloor = Math.max(0.2, bestScore * 0.005);
  const relevant = ranked.filter(
    (chunk) => chunk.relevanceScore >= relevanceFloor
  );

  if (relevant.length === 0) return [];

  // MMR selection: λ=0.6 → balance relevance and diversity
  const lambda = 0.6;
  const selected = [relevant[0]];
  const candidates = relevant.slice(1);

  while (selected.length < maxChunks && candidates.length > 0) {
    let bestIdx = -1;
    let bestMMR = -Infinity;
    for (let i = 0; i < candidates.length; i++) {
      const rel = candidates[i].relevanceScore / Math.max(bestScore, 1);
      let maxSim = 0;
      for (const s of selected) {
        const sim = wordOverlap(candidates[i].text, s.text);
        if (sim > maxSim) maxSim = sim;
      }
      const mmr = lambda * rel - (1 - lambda) * maxSim;
      if (mmr > bestMMR) { bestMMR = mmr; bestIdx = i; }
    }
    if (bestIdx === -1) break;
    selected.push(candidates[bestIdx]);
    candidates.splice(bestIdx, 1);
  }

  return tagEvidenceFacets(selected, question);
}

function assessSourceSufficiency(question, chunks) {
  const requiresDefinition =
    /^\s*(?:what\s+(?:is|are)|define|give\s+(?:the\s+)?meaning\s+of)\b/i.test(
      question
    );
  const hasDefinition = chunks.some(
    (chunk) => chunk.metadata?.rag_facet === "definition"
  );

  if (requiresDefinition && !hasDefinition) {
    return {
      sufficient: false,
      issue:
        "The retrieved notes mention this topic but do not contain its definition. Add substantive source material before generating an answer.",
    };
  }

  return { sufficient: true, issue: null };
}

function relevantChunkWindow(text, question, maxChars) {
  if (text.length <= maxChars) return text;

  const lower = text.toLowerCase();
  const queryTerms = getSearchTerms(question);
  const terms = [...queryTerms].sort((a, b) => b.length - a.length);
  const phraseIndex = lower.indexOf(queryTerms.join(" "));
  const termIndices = terms
    .map((term) => lower.indexOf(term))
    .filter((index) => index >= 0);
  const focusIndex = phraseIndex >= 0 ? phraseIndex : Math.min(...termIndices);

  if (!Number.isFinite(focusIndex)) return text.slice(0, maxChars).trim();

  let start = Math.max(0, focusIndex - Math.floor(maxChars * 0.22));
  if (start > 0) {
    const nextBoundary = text.slice(start, start + 90).search(/[.!?]\s+/);
    if (nextBoundary >= 0 && start + nextBoundary < focusIndex) {
      start += nextBoundary + 2;
    }
  }

  return text.slice(start, start + maxChars).trim();
}

function budgetChunksFairly(chunks, contextBudget, question) {
  if (chunks.length === 0) return [];
  const quota = Math.max(
    MIN_USEFUL_CHUNK_CHARS,
    Math.floor(contextBudget / chunks.length)
  );

  return chunks
    .map((chunk) => {
      const text = relevantChunkWindow(chunk.text, question, quota);
      if (text.length < MIN_USEFUL_CHUNK_CHARS) return null;
      return { ...chunk, text };
    })
    .filter(Boolean);
}

function budgetChunksForCoverage(chunks, contextBudget) {
  if (chunks.length === 0) return [];

  const totalChars = chunks.reduce(
    (sum, chunk) => sum + cleanChunkText(chunk.text).length,
    0
  );
  if (totalChars <= contextBudget) {
    return chunks;
  }

  const quota = Math.max(
    MIN_USEFUL_CHUNK_CHARS,
    Math.floor(contextBudget / chunks.length)
  );

  return chunks
    .map((chunk) => {
      const text = cleanChunkText(chunk.text).slice(0, quota).trim();
      if (text.length < MIN_USEFUL_CHUNK_CHARS) return null;
      return { ...chunk, text };
    })
    .filter(Boolean);
}

function isBroadCoverageQuestion(question, subject) {
  const normalized = String(question || "").toLowerCase();
  const terms = getSearchTerms(question);
  const subjectTerms = String(subject || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/[\s-]+/)
    .filter((term) => term.length > 2);

  const hasBroadIntent =
    /\b(explain|describe|discuss|overview|introduction|meaning|notes?|short\s+note|write\s+(?:about|on)|what\s+(?:is|are))\b/i.test(
      normalized
    );
  if (!hasBroadIntent) return false;
  if (terms.length <= 2) return true;

  const subjectTermSet = new Set(subjectTerms);
  const nonSubjectTerms = terms.filter((term) => !subjectTermSet.has(term));
  return nonSubjectTerms.length <= 1;
}

function getChunkSourceFile(chunk) {
  const sourceFile = chunk?.metadata?.source_file || chunk?.source;
  return typeof sourceFile === "string" && sourceFile.trim()
    ? sourceFile.trim()
    : null;
}

function pickBestSourceFile(chunks, question) {
  const sourceScores = new Map();

  for (const chunk of chunks) {
    const sourceFile = getChunkSourceFile(chunk);
    if (!sourceFile) continue;

    const current = sourceScores.get(sourceFile) || {
      sourceFile,
      count: 0,
      score: 0,
    };
    current.count += 1;
    current.score +=
      Number(chunk.metadata?.search_score || 0) + chunkRelevanceScore(chunk, question);
    sourceScores.set(sourceFile, current);
  }

  return Array.from(sourceScores.values()).sort(
    (a, b) => b.count - a.count || b.score - a.score
  )[0]?.sourceFile || null;
}

function chunkOrderIndex(chunk, fallbackIndex) {
  const rawIndex = Number(chunk?.metadata?.chunk_index);
  return Number.isFinite(rawIndex) ? rawIndex : fallbackIndex;
}

function pickCoverageChunks(chunks, maxChunks, question) {
  if (chunks.length <= maxChunks) return chunks;
  if (maxChunks <= 1) return chunks.slice(0, 1);

  const scored = chunks
    .map((chunk, index) => {
      const orderIndex = chunkOrderIndex(chunk, index);
      return {
        chunk,
        index,
        orderIndex,
        score: chunkRelevanceScore(chunk, question),
      };
    })
    .sort((a, b) => b.score - a.score || a.orderIndex - b.orderIndex);

  const bestScore = scored[0]?.score || 0;
  const relevanceFloor = Math.max(1, bestScore * 0.18);
  const relevant = scored.filter((item) => item.score >= relevanceFloor);
  const candidates = relevant.length > 0 ? relevant : scored;
  const selected = [];

  const addIfUseful = (candidate, minDistance) => {
    if (selected.some((item) => item.index === candidate.index)) return false;
    if (
      minDistance > 0 &&
      selected.some(
        (item) => Math.abs(item.orderIndex - candidate.orderIndex) < minDistance
      )
    ) {
      return false;
    }
    if (
      selected.some((item) =>
        isNearDuplicate(item.chunk.text, candidate.chunk.text)
      )
    ) {
      return false;
    }
    selected.push(candidate);
    return true;
  };

  const minDistance = chunks.length > maxChunks * 2 ? 2 : 1;
  for (const candidate of candidates) {
    if (selected.length >= maxChunks) break;
    addIfUseful(candidate, minDistance);
  }

  for (const candidate of candidates) {
    if (selected.length >= maxChunks) break;
    addIfUseful(candidate, 0);
  }

  if (selected.length < maxChunks) {
    for (let i = 0; i < maxChunks; i += 1) {
      if (selected.length >= maxChunks) break;
      const index = Math.round((i * (chunks.length - 1)) / (maxChunks - 1));
      const candidate = scored.find((item) => item.index === index);
      if (candidate) addIfUseful(candidate, 0);
    }
  }

  return selected
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((item) => item.chunk);
}

function buildChunkAnswerPrompt({ question, chunks, targetTokens, mode }) {
  const context = chunks
    .map((chunk, index) => `Chunk ${index + 1}:\n${chunk.text}`)
    .join("\n\n");

  const lengthInstruction = mode === "sufficient"
    ? `Cover ALL information present in every available chunk. Extract every distinct point across all chunks. Keep the answer within approximately ${targetTokens} tokens.`
    : `Cover ALL information present in every available chunk. Extract every distinct point across all chunks. Be thorough and complete.`;

  return `You are an extractive summarizer. Do NOT add, infer, or expand. Only rephrase words that appear strictly in the reference chunks below.

CRITICAL RULES:
- Every sentence must be directly extractable from the reference chunks.
- Do NOT introduce any concept, example, date, name, law, institution, or explanation that is not explicitly written in the chunks.
- Do NOT make inferences, generalizations, or logical connections not present verbatim.
- If the chunks are insufficient, say only what the chunks contain and stop.

${lengthInstruction}

Write one UPSC Mains answer using this exact structure:
**Introduction:**
**Body:**
**Conclusion:**
Inside Body, use numbered bold evidence-based subheadings before related paragraphs, like **1. Physical Geography**.
Do not invent subheadings that are not supported by the reference chunks.
Keep all factual content strictly grounded in the reference chunks.

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
    .filter((term) => term.length > 2 && !SEARCH_STOP_WORDS.has(term))
    .slice(0, 8);
}

async function queryPostgresChunks({ question, maxChunks, sourceFilter }) {
  const limit = Math.max(maxChunks * 15, 50);
  const searchQuestion = getSearchTerms(question).join(" ") || question;

  const hasFilter = sourceFilter && sourceFilter.length > 0;

  try {
    let query, params;
    if (hasFilter) {
      const filterClauses = sourceFilter.map((_, i) => `source_file ILIKE $${i + 3}`);
      query = `
        SELECT
          id,
          chunk,
          topic,
          difficulty,
          source_file,
          chunk_index,
          ts_rank(search_vector, plainto_tsquery('english', $1)) AS score
        FROM upsc_chunks
        WHERE search_vector @@ plainto_tsquery('english', $1)
          AND (${filterClauses.join(" OR ")})
        ORDER BY score DESC, created_at DESC
        LIMIT $2
      `;
      params = [searchQuestion, limit, ...sourceFilter.map((f) => `%${f}%`)];
    } else {
      query = `
        SELECT
          id,
          chunk,
          topic,
          difficulty,
          source_file,
          chunk_index,
          ts_rank(search_vector, plainto_tsquery('english', $1)) AS score
        FROM upsc_chunks
        WHERE search_vector @@ plainto_tsquery('english', $1)
        ORDER BY score DESC, created_at DESC
        LIMIT $2
      `;
      params = [searchQuestion, limit];
    }

    const ranked = await pool.query(query, params);

    let rows = ranked.rows;

    if (rows.length === 0) {
      const terms = getSearchTerms(question);

      if (terms.length === 0) return [];

      let fallbackQuery, fallbackParams;
      const termClauses = terms.map((_, i) => `chunk ILIKE $${i + 1}`).join(" OR ");

      if (hasFilter) {
        const filterClauses = sourceFilter.map((_, i) => `source_file ILIKE $${terms.length + 1 + i}`);
        fallbackQuery = `
          SELECT id, chunk, topic, difficulty, source_file, chunk_index
          FROM upsc_chunks
          WHERE (${termClauses})
            AND (${filterClauses.join(" OR ")})
          ORDER BY created_at DESC
          LIMIT $${terms.length + sourceFilter.length + 1}
        `;
        fallbackParams = [...terms.map((t) => `%${t}%`), ...sourceFilter.map((f) => `%${f}%`), limit];
      } else {
        fallbackQuery = `
          SELECT id, chunk, topic, difficulty, source_file, chunk_index
          FROM upsc_chunks
          WHERE ${termClauses}
          ORDER BY created_at DESC
          LIMIT $${terms.length + 1}
        `;
        fallbackParams = [...terms.map((t) => `%${t}%`), limit];
      }

      const fallback = await pool.query(fallbackQuery, fallbackParams);
      rows = fallback.rows;
    }

    return rows.map((row) => ({
      id: row.id,
      text: cleanChunkText(row.chunk),
      metadata: {
        topic: row.topic,
        difficulty: row.difficulty,
        source_file: row.source_file,
        chunk_index: row.chunk_index,
        source: "postgres",
        search_score: Number(row.score || 0),
      },
    }));
  } catch (err) {
    console.warn("PostgreSQL chunk fallback failed:", err.message);
    return [];
  }
}

async function queryPostgresSourceFileChunks({ sourceFile, maxChunks }) {
  if (!sourceFile) return [];

  const limit = Math.max(maxChunks, 1);
  const sourceBaseName = path.basename(sourceFile);

  try {
    let result = await pool.query(
      `
      SELECT id, chunk, topic, difficulty, source_file, chunk_index
      FROM upsc_chunks
      WHERE source_file = $1
      ORDER BY COALESCE(chunk_index, 0), id
      LIMIT $2
      `,
      [sourceFile, limit]
    );

    if (result.rows.length === 0 && sourceBaseName) {
      result = await pool.query(
        `
        SELECT id, chunk, topic, difficulty, source_file, chunk_index
        FROM upsc_chunks
        WHERE source_file ILIKE $1
        ORDER BY COALESCE(chunk_index, 0), id
        LIMIT $2
        `,
        [`%${sourceBaseName}`, limit]
      );
    }

    return result.rows.map((row) => ({
      id: row.id,
      text: cleanChunkText(row.chunk),
      metadata: {
        topic: row.topic,
        difficulty: row.difficulty,
        source_file: row.source_file,
        chunk_index: row.chunk_index,
        source: "postgres-file-coverage",
      },
    }));
  } catch (err) {
    console.warn("PostgreSQL file coverage retrieval failed:", err.message);
    return [];
  }
}

async function queryPostgresExpandedChunks({ question, maxChunks, sourceFiles, sourceFilter }) {
  const expansion = DOMAIN_QUERY_EXPANSIONS.find(({ pattern }) =>
    pattern.test(question)
  );
  if (!expansion || !sourceFiles?.length) return [];

  const terms = getSearchTerms(expansion.query);
  if (terms.length === 0) return [];

  const webQuery = terms.map((term) => `"${term}"`).join(" OR ");
  const limit = Math.max(maxChunks * 10, 30);

  try {
    const result = await pool.query(
      `
      SELECT
        id,
        chunk,
        topic,
        difficulty,
        source_file,
        chunk_index,
        ts_rank(search_vector, websearch_to_tsquery('english', $1)) AS score
      FROM upsc_chunks
      WHERE search_vector @@ websearch_to_tsquery('english', $1)
        AND source_file = ANY($3::text[])
      ORDER BY score DESC, created_at DESC
      LIMIT $2
      `,
      [webQuery, limit, sourceFiles]
    );

    return result.rows.map((row) => ({
      id: row.id,
      text: cleanChunkText(row.chunk),
      metadata: {
        topic: row.topic,
        difficulty: row.difficulty,
        source_file: row.source_file,
        chunk_index: row.chunk_index,
        source: "postgres-expanded",
        search_score: Number(row.score || 0),
      },
    }));
  } catch (err) {
    console.warn("PostgreSQL expanded retrieval failed:", err.message);
    return [];
  }
}

const SUBJECT_FOLDER_MAP = {
  history: ["history"],
  "art-culture": ["heritage", "culture", "art"],
  geography: ["geography"],
  "polity-governance": ["polity", "governance"],
  constitution: ["constitution"],
  economy: ["economy", "economic"],
  environment: ["environment", "ecology", "biodiversity"],
  "science-tech": ["science", "technology"],
  "social-justice": ["social justice", "social_justice"],
  "international-relations": ["international", "international relations"],
  "disaster-management": ["disaster"],
  "internal-security": ["security"],
  ethics: ["ethics", "integrity"],
  agriculture: ["agriculture"],
  "indian-society": ["society"],
  "current-affairs": ["current"],
  essay: ["essay"],
  optional: ["optional"],
};

export async function getMobileRagContext(req, res) {
  try {
    const {
      question,
      subject,
      maxChunks = DEFAULT_MAX_CHUNKS,
      maxContextChars = DEFAULT_MAX_CONTEXT_CHARS,
    } = req.body || {};

    if (!question || typeof question !== "string") {
      return res.status(400).json({ error: "question is required" });
    }

    const requestedMaxChunks = Math.max(
      1,
      Math.min(Number(maxChunks) || DEFAULT_MAX_CHUNKS, MOBILE_GEMINI_MAX_CHUNKS)
    );
    const contextBudget = Math.min(
      MOBILE_GEMINI_MAX_CONTEXT_CHARS,
      Math.max(300, Number(maxContextChars) || DEFAULT_MAX_CONTEXT_CHARS)
    );

    const folderPatterns = subject ? (SUBJECT_FOLDER_MAP[subject] || [subject]) : null;
    const broadCoverage = isBroadCoverageQuestion(question, subject);

    const [pgChunks, chromaChunks] = await Promise.all([
      queryPostgresChunks({
        question,
        maxChunks: requestedMaxChunks,
        sourceFilter: folderPatterns,
      }),
      queryChroma({
        prompt: question,
        topK: requestedMaxChunks,
        topic: subject || undefined,
      }),
    ]);

    let usefulChunks = [...pgChunks, ...chromaChunks]
      .reduce((map, chunk) => {
        const id = chunk.id || chunk.chunk_id;
        if (!map.has(id)) {
          map.set(id, {
            id,
            text: cleanChunkText(chunk.text || chunk.content || chunk.chunk_text || ""),
            metadata: chunk.metadata || {},
          });
        }
        return map;
      }, new Map())
      .values();
    usefulChunks = Array.from(usefulChunks)
      .filter((chunk) => chunk.text.length >= MIN_USEFUL_CHUNK_CHARS);

    let limitedChunks = [];
    let sourceFile = null;
    let sourceChunkCount = 0;
    let retrievalMode = "ranked";

    if (broadCoverage) {
      sourceFile = pickBestSourceFile(usefulChunks, question);
      const sourceChunks = await queryPostgresSourceFileChunks({
        sourceFile,
        maxChunks: MAX_FILE_COVERAGE_SOURCE_CHUNKS,
      });
      sourceChunkCount = sourceChunks.length;

      if (sourceChunks.length > 0) {
        limitedChunks = tagEvidenceFacets(
          pickCoverageChunks(sourceChunks, requestedMaxChunks, question),
          question
        );
        retrievalMode =
          sourceChunks.length <= requestedMaxChunks
            ? "full-file"
            : "file-section-coverage";
      }
    }

    if (limitedChunks.length === 0) {
      limitedChunks = selectBalancedChunks(
        usefulChunks,
        question,
        requestedMaxChunks
      );
    }

    const mode =
      retrievalMode === "ranked"
        ? limitedChunks.length >= 3
          ? "sufficient"
          : "limited"
        : retrievalMode;
    const targetTokens =
      mode === "limited" && retrievalMode === "ranked" ? 800 : 3000;

    const budgetedChunks =
      retrievalMode === "ranked"
        ? budgetChunksFairly(limitedChunks, contextBudget, question)
        : budgetChunksForCoverage(limitedChunks, contextBudget);
    const sourceAssessment = assessSourceSufficiency(
      question,
      budgetedChunks
    );

    return res.json({
      question,
      subject,
      chunks: budgetedChunks,
      chunkCount: budgetedChunks.length,
      mode,
      retrievalMode,
      sourceFile,
      sourceChunkCount,
      strictRag: true,
      sourceSufficient: sourceAssessment.sufficient,
      sourceIssue: sourceAssessment.issue,
      suggestedSubject: null,
      targetTokens,
      prompt: buildChunkAnswerPrompt({
        question,
        chunks: budgetedChunks,
        targetTokens,
        mode,
      }),
      generation: {
        runtime: "gemini-2.5-flash-strict-rag",
        local: false,
        maxTokens: targetTokens,
        temperature: 0,
      },
    });
  } catch (err) {
    console.error("Mobile RAG context error:", err.message);
    return res.status(500).json({ error: "Failed to prepare mobile context" });
  }
}

export function getMobileModelArtifact(req, res) {
  const fileName = path.basename(String(req.params.file || ""));
  if (!MOBILE_MODEL_FILES.has(fileName)) {
    return res.status(404).json({ error: "Mobile model file not found" });
  }

  const filePath = path.join(MOBILE_MODEL_DIR, fileName);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "Mobile model file not available" });
  }

  if (fileName.endsWith(".json")) {
    res.type("application/json");
  } else {
    res.type("application/octet-stream");
  }
  return res.sendFile(filePath);
}
