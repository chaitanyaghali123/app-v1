import { queryVector } from "../services/vector.service.js";
import { pool } from "../services/db.service.js";
import { getGeminiKeyRecord, markGeminiKeyFailure, markGeminiKeyValidated } from "../services/db.service.js";
import { decryptGeminiApiKeyRecord, fingerprintGeminiApiKey, proxyGeminiCall, toPublicGeminiError } from "../services/gemini.service.js";
import { enforceGeminiAbusePolicy, recordGeminiFailureForAbuse } from "../services/gemini-abuse.service.js";
import { anonymizeIdentifier, logGeminiEvent, recordGeminiMetric } from "../services/gemini-monitoring.service.js";
import { SUBJECT_FOLDER_MAP, GS_PAPER_FOLDER_MAP } from "./gsMapping.js";
import { orderChunksBySourceProximity, formatEvidenceChunks } from "../services/evidence-hierarchy.service.js";

import fs from "fs";
import path from "path";
const DEFAULT_MAX_CHUNKS = 15;

const DEFAULT_MAX_CONTEXT_CHARS = 15000;
const MOBILE_GEMINI_MAX_CHUNKS = Math.max(
  1,
  Number(process.env.GEMINI_MAX_CHUNKS || 40)
);
const MOBILE_GEMINI_MAX_CONTEXT_CHARS = Math.max(
  300,
  Number(process.env.GEMINI_MAX_CONTEXT_CHARS || 60000)
);
const MAX_FILE_COVERAGE_SOURCE_CHUNKS = 240;
const MIN_USEFUL_CHUNK_CHARS = 20;
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

const MOJIBAKE_REPLACEMENTS = [
  ["â€”", "—"],
  ["â€“", "–"],
  ["â€˜", "‘"],
  ["â€™", "’"],
  ["â€œ", "“"],
  ["â€", "”"],
  ["â€¦", "…"],
  ["â‚¹", "₹"],
];

function repairMojibake(text) {
  let repaired = String(text || "");
  for (const [broken, fixed] of MOJIBAKE_REPLACEMENTS) {
    repaired = repaired.split(broken).join(fixed);
  }
  return repaired;
}

function cleanDisplayText(text) {
  const lines = repairMojibake(text)
    .replace(/\u0000/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim()
    .split("\n");
  const inDiagram = new Array(lines.length).fill(false);
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("┌")) {
      let end = i;
      for (let j = i; j < lines.length; j++) {
        if (lines[j].includes("└") || lines[j].includes("┘")) end = j;
      }
      for (let k = i; k <= end; k++) inDiagram[k] = true;
      i = end;
    }
  }
  return lines
    .map((ln, idx) =>
      inDiagram[idx] ? ln : ln.replace(/[ \t]+/g, " ").replace(/^[ \t]+/, "").replace(/[ \t]+$/, "")
    )
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

function cleanChunkText(text) {
  return cleanDisplayText(text)
    .replace(/₹/g, "Rs ")
    .normalize("NFKD")
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

  const rr = numericValue(chunk.metadata?.rerank_score);
  if (rr !== null) {
    score += Math.tanh(rr) * 5;
  }

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
    .map((chunk) => {
      const text = cleanDisplayText(chunk.text);
      return {
        ...chunk,
        text,
        relevanceScore: chunkRelevanceScore({ ...chunk, text }, question),
      };
    })
    .filter((chunk) => chunk.text.length >= MIN_USEFUL_CHUNK_CHARS)
    .sort((a, b) => b.relevanceScore - a.relevanceScore);

  const bestScore = ranked[0]?.relevanceScore || 0;
  const relevanceFloor = Math.max(0.05, bestScore * 0.005);
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

const THIN_EVIDENCE_MESSAGE =
  "No relevant evidence found for this question in the retrieved source notes.";

export function isThinEvidence(chunks) {
  const text = (chunks || [])
    .map((c) => c.text || c.chunk || c.content || "")
    .filter(Boolean)
    .join("\n")
    .trim();
  if (!text) return { thin: true, reason: "no-evidence" };

  const words = (text.match(/[A-Za-z0-9][A-Za-z0-9'-]*/g) || []).length;
  if (words < 150) return { thin: true, reason: "tiny-evidence" };

  const sentenceEndings = (text.match(/[a-z]{2}\.\s+[A-Z]/g) || []).filter(
    (m) => !/^(etc|e\.g|i\.e|vs)\.\s+[A-Z]/.test(m)
  ).length;
  if (sentenceEndings === 0 && words < 400) {
    return { thin: true, reason: "outline-only" };
  }
  return { thin: false, reason: null };
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
    (sum, chunk) => sum + cleanDisplayText(chunk.text).length,
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
      const text = cleanDisplayText(chunk.text).slice(0, quota).trim();
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

  const subjectTermSet = new Set(subjectTerms);
  if (
    subjectTermSet.size > 0 &&
    terms.length > 0 &&
    terms.every((term) => subjectTermSet.has(term))
  ) {
    return true;
  }

  const hasBroadIntent =
    /\b(explain|describe|discuss|overview|introduction|meaning|notes?|short\s+note|write\s+(?:about|on)|what\s+(?:is|are))\b/i.test(
      normalized
    );
  if (!hasBroadIntent) return false;
  if (terms.length <= 2) return true;

  const nonSubjectTerms = terms.filter((term) => !subjectTermSet.has(term));
  return nonSubjectTerms.length <= 1;
}

function filterRelevantChunks(chunks, maxChunks) {
  const scored = chunks.map((chunk) => ({
    chunk,
    rr: numericValue(chunk.metadata?.rerank_score),
  }));
  const ranked = [...scored].sort(
    (a, b) => (b.rr ?? -Infinity) - (a.rr ?? -Infinity)
  );
  const keep = ranked.filter(({ rr }) => rr !== null);
  const limit = maxChunks > 0 ? maxChunks : keep.length;
  const slice = keep.slice(0, limit);
  if (slice.length > 0) return slice.map(({ chunk }) => chunk);
  return chunks.slice(0, maxChunks > 0 ? maxChunks : chunks.length);
}

function getChunkSourceFile(chunk) {
  const sourceFile = chunk?.metadata?.source_file || chunk?.source;
  return typeof sourceFile === "string" && sourceFile.trim()
    ? sourceFile.trim()
    : null;
}

function numericValue(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function getRawChunkScore(chunk) {
  const candidates = [
    chunk?.metadata?.relevance_score,
    chunk?.relevanceScore,
    chunk?.metadata?.vector_score,
    chunk?.vector_score,
    chunk?.metadata?.search_score,
    chunk?.metadata?.rerank_score,
    chunk?.rerank_score,
  ];

  for (const candidate of candidates) {
    const score = numericValue(candidate);
    if (score !== null) return score;
  }

  return null;
}

function withNormalizedChunkScores(chunks) {
  const rawScores = chunks.map(getRawChunkScore);
  const validScores = rawScores.filter(
    (score) => score !== null && Number.isFinite(score) && score >= 0
  );

  if (validScores.length === 0) {
    return { chunks, chunkScores: undefined };
  }

  const maxScore = Math.max(...validScores);
  if (maxScore <= 0) {
    return { chunks, chunkScores: undefined };
  }
  const normalizedScores = rawScores.map((score) => {
    if (score === null || !Number.isFinite(score) || score < 0) return null;
    return Math.max(0, Math.min(1, maxScore > 1 ? score / maxScore : score));
  });

  return {
    chunks: chunks.map((chunk, index) => {
      const normalizedScore = normalizedScores[index];
      if (normalizedScore === null) return chunk;

      return {
        ...chunk,
        metadata: {
          ...(chunk.metadata || {}),
          relevance_score: Number(normalizedScore.toFixed(4)),
          raw_relevance_score: getRawChunkScore(chunk),
        },
      };
    }),
    chunkScores: normalizedScores.every((score) => score !== null)
      ? normalizedScores
      : undefined,
  };
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
  const attachScore = (chunk) => {
    const score = chunkRelevanceScore(chunk, question);
    return {
      ...chunk,
      relevanceScore: score,
      metadata: {
        ...(chunk.metadata || {}),
        raw_relevance_score: score,
      },
    };
  };

  if (chunks.length <= maxChunks) return chunks.map(attachScore);
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
    .map((item) => ({
      ...item.chunk,
      relevanceScore: item.score,
      metadata: {
        ...(item.chunk.metadata || {}),
        raw_relevance_score: item.score,
      },
    }));
}

function detectWordLimit(question, subject) {
  const ids = (Array.isArray(subject) ? subject : [subject])
    .map((s) => String(s || "").trim().toLowerCase())
    .filter(Boolean);
  const idSet = new Set(ids);
  if (idSet.has("essay")) return 1300;
  return 600;
}

function buildChunkAnswerPrompt({ question, chunks, targetTokens, mode, wordLimit }) {
  // Same hierarchy handling as the production prompt, so an audit of this route
  // reflects what the answer path actually receives.
  const { chunks: orderedChunks, layout } = orderChunksBySourceProximity(chunks);
  const context = formatEvidenceChunks(orderedChunks, layout, { label: (index) => `[${index + 1}]` });

  const wordLimitInstruction = wordLimit
    ? `
WORD LIMIT (${wordLimit} words) - NON-NEGOTIABLE:
- ${wordLimit === 1300 ? "This is a 1300-word Essay paper question. Introduction should be 100-120 words, Body = ~1080 words, Conclusion = 90-100 words." : "This is a 600-word Mains question. Introduction 60-70 words, Conclusion 45-60 words; everything else is the body."}
- ${wordLimit === 1300 ? "Total essay words (headings excluded) must be ≤ 1300: write 1170-1300 words across 8-9 body paragraphs of 120-140 words each. PLAN the allocation BEFORE writing a single word. - HARD MINIMUM: the finished answer MUST be at least 1170 words (headings excluded). If, after writing your body paragraphs, you are below 1170 words, KEEP EXPANDING with new evidence-based paragraphs - NEVER write a Conclusion while under 1170 words. A Conclusion at the 3rd-of-budget mark is an automatic FAIL." : "Total answer words (headings excluded) must be ≤ 600: write 550-600 words across 4 body paragraphs of 90-110 words each. PLAN the allocation BEFORE writing a single word. - HARD MINIMUM: the finished answer MUST be at least 550 words (headings excluded). If, after writing your body paragraphs, you are below 550 words, KEEP EXPANDING with new evidence-based paragraphs - NEVER write a Conclusion while under 550 words."}
- Silently count before finishing. Cut ruthlessly: no filler, no restating the question, no re-listed points. If over, delete the weakest sentence in each body paragraph until within limit.`
    : "";

  return `You are an expert UPSC Mains answer-writer. Write the answer in EXACTLY the standard UPSC Mains format examiners expect.

== FORMAT ==
The answer MUST have exactly three parts:

## **Introduction** (short)
- ONE compact paragraph: a crisp definition or one-line context, then a single thesis sentence that directly answers the question's directive verb.
- Never restate the question, never open with padding ("In modern times", "India is a diverse country").

## **Body** — 4 dense thematic paragraphs (600-word Mains) or 8–9 (1300-word Essay)
- Each body paragraph = ONE clear argument with a bolded keyword opening and 1–2 concrete supporting facts. Structure: Point → Evidence → Tie-back to the verb.
- The analysis must follow the question's command verb:
  * Analyze → cause–effect, dimensions, dynamics.
  * Discuss / Comment → balanced treatment of both sides.
  * Critically examine / Examine → evidence for AND against, then a judgment.
  * Elucidate → explain with characteristics and examples.
  * Evaluate → criteria-led verdict (use the social/political/economic/cultural lenses if the question names them).
- Use exam salting: names, dates, Acts, Commissions, schemes, institutions, case data — the specifics that separate a 10/15-marker from a list.

## **Conclusion** — ONE short paragraph
- A balanced verdict (NOT a summary) + a single forward-looking line ("further reforms required", "sustained investment needed", etc.). 2–3 sentences max.

== EVIDENCE RULES ==
- The reference chunks are your ONLY source of facts (strict source-lock) — mine every chunk for names, dates, acts, schemes, definitions, examples and use them.
- STRICT SOURCE-LOCK — every name, date, number, scheme, and example in the answer MUST come from the reference chunks. Never add outside or prior knowledge, even confidently-known UPSC facts. If the chunks cannot support a needed point, omit it rather than fill from memory — NEVER invent figures, statistics, dates, or quotes.
- Never fabricate citations, studies, or sources.
- PRESERVE DIRECTION: keep every stated relationship pointing the way the evidence states it — cause→effect, parent→child, superior→subordinate, earlier→later. Never reverse a relationship, and never assert a relationship the evidence does not state. Joining two supported facts with an unsupported link ("A enabled B", "A proves B") is a source-lock violation even when both facts are quoted correctly.
- READ CONTIGUOUS CHUNKS AS ONE PASSAGE: each chunk is labelled with its source and position. Chunks marked as continuing the passage above belong to the same section and must be read as continuous text, not as unrelated evidence.

== LANGUAGE & PRESENTATION ==
1. Formal, impersonal, crisp exam English; active sentences.
2. Bold key terms and facts as on-paper underlining would (e.g. **regional planning**, **Planning Commission**).
3. Minimal bullets — real Mains answers are paragraphs. Bullets only for enumerable items (e.g. the target-area programmes) and then keep each bullet to one line.
4. Markdown headers \`## **Introduction**\`, optional \`## **<short thematic heading>**\` for the body, \`## **Conclusion**\`. Headings are short and do not count toward the word limit.
5. Total output must end at the word limit — the examiner stops reading beyond it.
6. No citations, no [1]/[2], no footnotes, no URLs, no LaTeX; use Unicode arrows/symbols (→, ×, ≤).

${wordLimitInstruction}

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

function collapseOutsideCodeFences(text) {
  const segments = String(text || "").split("```");
  return segments
    .map((seg, idx) => {
      if (idx % 2 === 1) return seg;
      return collapseOutsideDiagrams(seg);
    })
    .join("```");
}

function sanitizeLatexArtifacts(text) {
  return String(text || "")
    .replace(/\\\$/g, "$")
    .replace(/\$\$\s*([\s\S]*?)\s*\$\$/g, "$1")
    .replace(/\\\[([\s\S]*?)\\\]/g, "$1")
    .replace(/\\\(([\s\S]*?)\\\)/g, "$1")
    .replace(/\\text\{([^{}]*)\}/g, "$1")
    .replace(/\\langle/g, "<")
    .replace(/\\rangle/g, ">")
    .replace(/\\longrightarrow/g, "\u2192")
    .replace(/\\rightarrow/g, "\u2192")
    .replace(/\\Rightarrow/g, "\u21D2")
    .replace(/\\times/g, "\u00D7")
    .replace(/\\leq/g, "\u2264")
    .replace(/\\geq/g, "\u2265")
    .replace(/\\approx/g, "\u2248")
    .replace(/\\neq/g, "\u2260")
    .replace(/\\cdots/g, "\u2026")
    .replace(/\\ldots/g, "\u2026")
    .replace(/\\bullet/g, "\u2022")
    .replace(/\\%/g, "%")
    .replace(/\\&/g, "&")
    .replace(/\\([a-zA-Z]+)/g, "$1")
    .replace(/\{\s*|\s*\}/g, " ");
}

function collapseOutsideDiagrams(seg) {
  seg = sanitizeLatexArtifacts(seg)
    .replace(/([^\n#])(#{2,6}\s+)/g, "$1\n\n$2")
    .replace(/([^\n*])(\*\s+)/g, "$1\n$2")
    .replace(/(?<![#\d*\n])(?<![#*\d][ \t])(\d{1,2}\.\s+)/g, "\n$1");
  const lines = seg.split("\n");
  const isRegion = new Array(lines.length).fill(false);
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("┌")) {
      let end = i;
      for (let j = i; j < lines.length; j++) {
        if (lines[j].includes("└") || lines[j].includes("┘")) end = j;
      }
      for (let k = i; k <= end; k++) isRegion[k] = true;
      i = end;
    }
  }
  return lines
    .map((ln, i) => (isRegion[i] ? ln : ln.replace(/[ \t]+/g, " ").trim()))
    .join("\n");
}

function alignDiagramIndentation(text) {
  const lines = String(text || "").split("\n");
  const out = [];
  let block = [];
  const flush = () => {
    if (block.length === 0) return;
    for (let i = 0; i < block.length; i++) {
      if (block[i].trimStart().startsWith("┌")) {
        const indents = [];
        for (let j = i + 1; j < block.length; j++) {
          const m = block[j].match(/^\s*[│└┘┐┌┬▼▲]/);
          if (m) indents.push(block[j].match(/^\s*/)[0].length);
        }
        if (indents.length > 0) {
          const sorted = [...indents].sort((a, b) => a - b);
          const target = sorted[Math.floor(sorted.length / 2)];
          const current = block[i].match(/^\s*/)[0].length;
          if (current !== target) {
            block[i] = " ".repeat(target) + block[i].trimStart();
          }
        }
        break;
      }
    }
    out.push(...block);
    block = [];
  };
  for (const ln of lines) {
    if (/^```/.test(ln.trim())) {
      flush();
      out.push(ln);
    } else {
      block.push(ln);
    }
  }
  flush();
  return out.join("\n");
}

function fenceDiagrams(text) {
  const lines = String(text || "").split("\n");
  const out = [];
  let inFence = false;
  let i = 0;
  while (i < lines.length) {
    const ln = lines[i];
    if (/^```/.test(ln.trim())) {
      inFence = !inFence;
      out.push(ln);
      i++;
      continue;
    }
    if (!inFence && ln.includes("┌")) {
      let end = i;
      for (let j = i; j < lines.length; j++) {
        if (lines[j].includes("└") || lines[j].includes("┘")) end = j;
      }
      out.push("```text", ...lines.slice(i, end + 1), "```", "");
      i = end + 1;
      continue;
    }
    out.push(ln);
    i++;
  }
  return out.join("\n");
}

function normalizeFenceBlocks(text) {
  const tokens = String(text || "").split(/(```[a-zA-Z][a-zA-Z0-9_-]*|```)/);
  let out = "";
  let prevWasFence = false;
  for (const t of tokens) {
    if (/^```/.test(t)) {
      if (out.length > 0 && !out.endsWith("\n")) out += "\n";
      out += t;
      prevWasFence = true;
    } else if (t !== "") {
      if (prevWasFence && !t.startsWith("\n")) out += "\n";
      out += t;
      prevWasFence = false;
    }
  }
  const lines = out.split("\n");
  const result = [];
  for (const ln of lines) {
    if (/^```/.test(ln)) {
      if (result.length > 0 && result[result.length - 1] !== "") result.push("");
      result.push(ln);
    } else if (ln !== "") {
      if (result.length > 0 && result[result.length - 1] === "```") result.push("");
      result.push(ln);
    } else {
      result.push(ln);
    }
  }
  return result.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function cleanPolishText(text) {
  return String(text || "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 420);
}

function cleanFullPolishAnswer(text) {
  const out = String(text || "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .replace(/^#{1,6}\s+\d+\.\s*Conclusion\s*$/gim, "## Conclusion");
  return alignDiagramIndentation(normalizeFenceBlocks(fenceDiagrams(collapseOutsideCodeFences(out)))).slice(0, 5200);
}

function cleanReplacementText(text) {
  const out = String(text || "")
    .replace(/<[^>]+>/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return alignDiagramIndentation(normalizeFenceBlocks(fenceDiagrams(collapseOutsideCodeFences(out)))).slice(0, 360);
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
      text: cleanDisplayText(row.chunk),
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
      text: cleanDisplayText(row.chunk),
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


function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = new Array(n + 1);
  let cur = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}

function subjectNameWords(subject) {
  const raw = [
    String(subject || ""),
    ...(SUBJECT_FOLDER_MAP[subject] || []),
  ];
  const words = new Set();
  for (const part of raw) {
    for (const word of String(part)
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)) {
      if (word.length > 2) words.add(word);
    }
  }
  return [...words];
}

export function correctSubjectTypo(question, subject) {
  const canonical = subjectNameWords(subject);
  if (canonical.length === 0) return null;
  const original = String(question || "");
  const corrected = original.replace(/[a-z0-9]{3,}/gi, (word) => {
    const lower = word.toLowerCase();
    let best = null;
    for (const c of canonical) {
      if (lower === c) return word;
      const d = levenshtein(lower, c);
      if (d > 0 && d <= 2 && (best === null || d < best.d)) {
        best = { c, d };
      }
    }
    return best ? best.c : word;
  });
  return corrected === original ? null : corrected;
}

async function prepareMobileRagContext({ question, subject, maxChunks = DEFAULT_MAX_CHUNKS, maxContextChars = DEFAULT_MAX_CONTEXT_CHARS, targetTokens: requestedTargetTokens = 0, deviceId }) {
  if (!question || typeof question !== "string") {
    const err = new Error("question is required");
    err.status = 400;
    throw err;
  }
  const prepStartedAt = Date.now();
  const stageMark = (name) => ({ [name]: Date.now() - prepStartedAt });

  let userApiKey = null;
  if (deviceId && typeof deviceId === "string" && deviceId.length >= 8) {
    try {
      const keyRecord = await getGeminiKeyRecord(deviceId);
      if (keyRecord?.encrypted_key) {
        userApiKey = await decryptGeminiApiKeyRecord(keyRecord);
      }
    } catch (keyErr) {
      console.warn("Mobile rag-context: failed to resolve user API key:", keyErr.message);
    }
  }
  console.log(
    `[rag-context] device=${deviceId ? `${deviceId.slice(0, 8)}…` : "NONE"} keyResolved=${Boolean(userApiKey)}`
  );
  try {
    const fs = await import("fs");
    fs.appendFileSync(
      "/app/uploads/rag-debug.log",
      `${new Date().toISOString()} device=${deviceId ? deviceId : "NONE"} keyResolved=${Boolean(userApiKey)} keyLen=${userApiKey?.length ?? 0} q=${question.slice(0, 40)}\n`
    );
  } catch {}

  const isEssay = String(subject || "").trim().toLowerCase() === "essay";
  const requestedMaxChunks = Math.max(
    1,
    Math.min(
      Number(maxChunks) || (isEssay ? 35 : 20),
      isEssay ? 35 : 20,
      MOBILE_GEMINI_MAX_CHUNKS
    )
  );
  const desiredContextBudget = isEssay ? 60000 : 40000;
  const contextBudget = Math.min(
    MOBILE_GEMINI_MAX_CONTEXT_CHARS,
    Math.max(300, Number(maxContextChars) || DEFAULT_MAX_CONTEXT_CHARS),
    desiredContextBudget
  );

  const folderPatterns = subject ? (SUBJECT_FOLDER_MAP[subject] || [subject]) : null;
  const resolvedQuestion = correctSubjectTypo(question, subject) || question;
  const broadCoverage = isBroadCoverageQuestion(resolvedQuestion, subject);

  let vectorChunks;
  try {
    const retrievalStartedAt = Date.now();
    const vectorResult = await queryVector({
      prompt: resolvedQuestion,
      topK: Math.max(requestedMaxChunks * 2, 8),
      skipRerank: false,
      subjectIds: folderPatterns ? folderPatterns.map((f) => f.toLowerCase()) : null,
      apiKey: userApiKey,
    });
    vectorChunks = vectorResult.chunks;
    const retrievalMs = Date.now() - retrievalStartedAt;
    const vt = vectorResult.timings || {};
    console.log(
      `[rag-prep] stage vector_retrieval..${retrievalMs}ms query=${resolvedQuestion.slice(0, 60)} embedMs=${vt.embed_ms ?? "-"} pgvectorMs=${vt.pgvector_ms ?? "-"} bm25Ms=${vt.bm25_ms ?? "-"} rerankMs=${vt.rerank_ms ?? "-"} postRerankMs=${vt.post_rerank_ms ?? "-"}`
    );
    stageMark(`retrieval:${retrievalMs}`);
  } catch (retrievalErr) {
    if (retrievalErr?.code === "GEMINI_QUOTA_EXCEEDED") {
      try {
        const fs = await import("fs");
        fs.appendFileSync(
          "/app/uploads/rag-debug.log",
          `${new Date().toISOString()} RETRIEVAL_QUOTA_FAIL device=${deviceId}\n`
        );
      } catch {}
      const quotaErr = new Error(retrievalErr.message);
      quotaErr.code = "GEMINI_QUOTA_EXCEEDED";
      quotaErr.status = 429;
      throw quotaErr;
    }
    throw retrievalErr;
  }

  const pgChunks = Array.isArray(vectorChunks)
    ? vectorChunks
        .filter(
          (c) =>
            !(/_PYP|_PYQ|PYP_|PYQ_/i.test(c.metadata?.source_file || ""))
        )
        .map((c) => ({
        id: c.id,
        text: c.text,
        metadata: {
          topic: c.metadata?.topic || "",
          difficulty: c.metadata?.difficulty || "",
          source_file: c.metadata?.source_file || "",
          chunk_index: c.metadata?.chunk_index || 0,
          heading_hierarchy: c.metadata?.heading_hierarchy || [],
          source: "vector_server",
          vector_score: c.vector_score ?? 0,
          rerank_score: c.rerank_score ?? null,
        },
      }))
    : [];

  let usefulChunks = pgChunks
    .reduce((map, chunk) => {
      const id = chunk.id || chunk.chunk_id;
      if (!map.has(id)) {
        map.set(id, {
          id,
          text: cleanDisplayText(chunk.text || chunk.content || chunk.chunk_text || ""),
          metadata: chunk.metadata || {},
        });
      }
      return map;
    }, new Map())
    .values();
  usefulChunks = Array.from(usefulChunks)
    .filter((chunk) => chunk.text.length >= MIN_USEFUL_CHUNK_CHARS);
  usefulChunks = filterRelevantChunks(usefulChunks, requestedMaxChunks * 2);

  let limitedChunks = [];
  let sourceFile = null;
  let sourceChunkCount = 0;
  let retrievalMode = "ranked";

  if (broadCoverage) {
    const coverageStartedAt = Date.now();
    sourceFile = pickBestSourceFile(usefulChunks, resolvedQuestion);
    const sourceChunks = await queryPostgresSourceFileChunks({
      sourceFile,
      maxChunks: MAX_FILE_COVERAGE_SOURCE_CHUNKS,
    });
    sourceChunkCount = sourceChunks.length;
    const coverageMs = Date.now() - coverageStartedAt;
    console.log(`[rag-prep] stage coverage..${coverageMs}ms sourceFile=${sourceFile} chunks=${sourceChunks.length}`);
    stageMark(`coverage:${coverageMs}`);

    if (sourceChunks.length > 0) {
      limitedChunks = tagEvidenceFacets(
        pickCoverageChunks(sourceChunks, requestedMaxChunks, resolvedQuestion),
        resolvedQuestion
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
      resolvedQuestion,
      requestedMaxChunks
    );
  }

  if (limitedChunks.length === 0 && usefulChunks.length > 0) {
    limitedChunks = [...usefulChunks]
      .sort(
        (a, b) =>
          (numericValue(b.metadata?.rerank_score) ?? -Infinity) -
          (numericValue(a.metadata?.rerank_score) ?? -Infinity)
      )
      .slice(0, requestedMaxChunks);
  }

  const mode =
    retrievalMode === "ranked"
      ? limitedChunks.length >= 3
        ? "sufficient"
        : "limited"
      : retrievalMode;
  const wordLimit = detectWordLimit(resolvedQuestion, subject);
  const targetTokens = requestedTargetTokens > 0 && !isEssay
    ? requestedTargetTokens
    : isEssay
    ? 2600
    : mode === "limited" && retrievalMode === "ranked"
    ? 850
    : 4600;
  const cappedTargetTokens = wordLimit
    ? Math.min(targetTokens, Math.round(wordLimit * 1.55))
    : targetTokens;

  const rawBudgetedChunks =
    retrievalMode === "ranked"
      ? budgetChunksFairly(limitedChunks, contextBudget, resolvedQuestion)
      : budgetChunksForCoverage(limitedChunks, contextBudget);
  const scoredContext = withNormalizedChunkScores(rawBudgetedChunks);
  const budgetedChunks = scoredContext.chunks;
  const sourceAssessment = assessSourceSufficiency(
    resolvedQuestion,
    budgetedChunks
  );
  const thinAssessment = isThinEvidence(budgetedChunks);
  const sufficient = sourceAssessment.sufficient && !thinAssessment.thin;
  const sourceIssue = thinAssessment.thin
    ? THIN_EVIDENCE_MESSAGE
    : sourceAssessment.issue;

  console.log(
    `[rag-prep] total=${Date.now() - prepStartedAt}ms ${Object.entries({
      key: userApiKey ? 1 : 0,
      chunksInput: pgChunks.length,
      useful: usefulChunks.length,
      limited: limitedChunks.length,
      final: budgetedChunks.length,
    })
      .map(([k, v]) => `${k}=${v}`)
      .join(" ")}`
  );

  return {
    userApiKey,
    deviceId,
    question,
    subject,
    isEssay,
    requestedMaxChunks,
    contextBudget,
    resolvedQuestion,
    broadCoverage,
    retrievalMode,
    sourceFile,
    sourceChunkCount,
    mode,
    wordLimit,
    targetTokens,
    cappedTargetTokens,
    scoredContext,
    budgetedChunks,
    sufficient,
    sourceIssue,
  };
}

function toMobileRagError(err) {
  if (err?.code === "GEMINI_QUOTA_EXCEEDED" || (err?.status === 429 && err?.code === "GEMINI_QUOTA_EXCEEDED")) {
    return { status: 429, body: { error: err.message || "This Gemini API key has reached its usage quota.", code: "GEMINI_QUOTA_EXCEEDED" } };
  }
  if (err?.status === 429 || err?.code === "GEMINI_RATE_LIMITED") {
    return { status: 429, body: { error: err.message || "Gemini is temporarily rate-limiting this key.", code: "GEMINI_RATE_LIMITED" } };
  }
  if (err?.code === "GEMINI_KEY_UNAUTHORIZED") {
    return {
      status: 401,
      body: {
        error:
          "Your stored Gemini API key was rejected. It may be invalid or expired — update your API key in settings and try again.",
        code: "GEMINI_KEY_UNAUTHORIZED",
      },
    };
  }
  if (err?.status === 400) {
    return { status: 400, body: { error: err.message } };
  }
  return { status: 500, body: { error: "Failed to prepare mobile context" } };
}

export async function getMobileRagContext(req, res) {
  const ragStartedAt = Date.now();
  try {
    const ctx = await prepareMobileRagContext(req.body || {});

    console.log(
      `[rag-context] totalMs=${Date.now() - ragStartedAt} returnedChunks=${ctx.budgetedChunks.length} budgetChars=${ctx.contextBudget} mode=${ctx.mode}`
    );

    return res.json({
      question: ctx.question,
      subject: ctx.subject,
      chunks: ctx.budgetedChunks,
      chunkScores: ctx.scoredContext.chunkScores,
      chunkCount: ctx.budgetedChunks.length,
      mode: ctx.mode,
      retrievalMode: ctx.retrievalMode,
      sourceFile: ctx.sourceFile,
      sourceChunkCount: ctx.sourceChunkCount,
      strictRag: true,
      sourceSufficient: ctx.sufficient,
      sourceIssue: ctx.sourceIssue,
      suggestedSubject: null,
      targetTokens: ctx.targetTokens,
      prompt: buildChunkAnswerPrompt({
        question: ctx.resolvedQuestion,
        chunks: ctx.budgetedChunks,
        targetTokens: ctx.cappedTargetTokens,
        mode: ctx.mode,
        wordLimit: ctx.wordLimit,
      }),
      generation: {
        runtime: "gemini-2.5-flash-strict-rag",
        local: false,
        maxTokens: ctx.cappedTargetTokens,
        temperature: 0,
      },
      wordLimit: ctx.wordLimit,
    });
  } catch (err) {
    console.error("Mobile RAG context error:", err.message);
    const { status, body } = toMobileRagError(err);
    return res.status(status).json(body);
  }
}

export async function getMobileAnswer(req, res) {
  const startedAt = Date.now();
  let keyHash = null;
  let contextChars = 0;
  let prepareMs = 0;

  const prepareError = (err, res) => {
    const parsed = toMobileRagError(err);
    console.error("[mobile-answer] prepare error:", err.message);
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ type: "error", ...parsed.body })}\n\n`);
      return res.end();
    }
    return res.status(parsed.status).json(parsed.body);
  };

  try {
    const prepareStartedAt = Date.now();
    const ctx = await prepareMobileRagContext(req.body || {});
    prepareMs = Date.now() - prepareStartedAt;
    contextChars = ctx.budgetedChunks.reduce((sum, c) => sum + (c.text?.length || 0), 0);

    if (!ctx.userApiKey) {
      return res.status(404).json({
        error: "No API key found for this device. Please store your key first.",
        code: "GEMINI_KEY_NOT_FOUND",
      });
    }
    keyHash = fingerprintGeminiApiKey(ctx.userApiKey);

    await enforceGeminiAbusePolicy({
      deviceId: ctx.deviceId,
      ip: req.ip,
      keyHash,
      contextChars,
      targetTokens: ctx.cappedTargetTokens,
    });

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    });
    if (req.socket) req.socket.setNoDelay(true);

    const contextEvent = {
      type: "context",
      question: ctx.question,
      subject: ctx.subject,
      mode: ctx.mode,
      retrievalMode: ctx.retrievalMode,
      sourceFile: ctx.sourceFile,
      sourceChunkCount: ctx.sourceChunkCount,
      strictRag: true,
      sourceSufficient: ctx.sufficient,
      sourceIssue: ctx.sourceIssue,
      chunkCount: ctx.budgetedChunks.length,
      chunkScores: ctx.scoredContext.chunkScores,
      chunks: ctx.budgetedChunks,
      targetTokens: ctx.targetTokens,
      wordLimit: ctx.wordLimit,
    };
    res.write(`data: ${JSON.stringify(contextEvent)}\n\n`);
    if (typeof res.flush === "function") res.flush();

    if (ctx.budgetedChunks.length === 0) {
      res.write(
        `data: ${JSON.stringify({ type: "done", answer: "", tokenCount: 0, sentenceScores: [], chunkScores: ctx.scoredContext.chunkScores, generationReason: "no_chunks" })}\n\n`
      );
      return res.end();
    }

    if (!ctx.sufficient) {
      const answer = ctx.sourceIssue || "The retrieved source chunks do not contain enough information to answer this question.";
      res.write(
        `data: ${JSON.stringify({ type: "done", answer, tokenCount: 0, sentenceScores: [], chunkScores: ctx.scoredContext.chunkScores, generationReason: "strict_rag_insufficient" })}\n\n`
      );
      return res.end();
    }

    const result = await proxyGeminiCall(ctx.userApiKey, {
      question: ctx.resolvedQuestion,
      chunks: ctx.budgetedChunks.map((c) => ({
        text: c.text,
        facet: typeof c.metadata?.rag_facet === "string" ? c.metadata.rag_facet : "supporting-evidence",
        source: typeof c.metadata?.source_file === "string" ? c.metadata.source_file : c.metadata?.source || "",
        subject_id: Array.isArray(c.subject_id) && c.subject_id.length ? c.subject_id : c.metadata?.subject_id,
        // Carry the source coordinates through so the prompt can label each chunk
        // with its origin and position. Without this the evidence arrives as an
        // unattributed bag of text and stated relationships have no direction.
        metadata: c.metadata,
      })).filter((c) => Boolean(c.text)),
      targetTokens: ctx.cappedTargetTokens,
      mode: ctx.mode,
      subjectId: ctx.subject,
      onToken: (token) => {
        res.write(`data: ${JSON.stringify({ type: "token", text: token })}\n\n`);
        if (typeof res.flush === "function") res.flush();
      },
      onStatus: (status) => {
        res.write(`data: ${JSON.stringify({ type: "status", status })}\n\n`);
        if (typeof res.flush === "function") res.flush();
      },
    });

    await markGeminiKeyValidated(ctx.deviceId);
    recordGeminiMetric({
      route: "mobile-answer",
      outcome: "success",
      latencyMs: Date.now() - startedAt,
      tokenCount: result.tokenCount || 0,
      contextChars,
    });
    logGeminiEvent("mobile_answer_success", {
      device: anonymizeIdentifier(ctx.deviceId),
      key: anonymizeIdentifier(keyHash),
      ip: anonymizeIdentifier(req.ip),
      latencyMs: Date.now() - startedAt,
      tokenCount: result.tokenCount || 0,
      contextChars,
    });
    console.log(
      `[mobile-answer] success: prepareMs=${prepareMs} genMs=${Date.now() - startedAt - prepareMs} totalMs=${Date.now() - startedAt} tokens=${result.tokenCount || 0} words=${result.wordCount || 0} truncated=${Boolean(result.truncated)} grounding=${JSON.stringify(result.grounding || null)}`
    );
    res.write(
      `data: ${JSON.stringify({
        type: "done",
        answer: result.answer,
        tokenCount: result.tokenCount,
        wordCount: result.wordCount,
        truncated: Boolean(result.truncated),
        timedOut: Boolean(result.timedOut),
        finishReason: result.finishReason || null,
        grounding: result.grounding || null,
        sentenceScores: result.sentenceScores,
        chunkScores: result.chunkScores,
      })}\n\n`
    );
    return res.end();
  } catch (err) {
    const publicError = toPublicGeminiError(err);
    recordGeminiMetric({
      route: "mobile-answer",
      outcome: "error",
      code: publicError.body.code,
      latencyMs: Date.now() - startedAt,
      contextChars,
    });
    logGeminiEvent("mobile_answer_error", {
      device: anonymizeIdentifier(req.body?.deviceId),
      key: anonymizeIdentifier(keyHash),
      ip: anonymizeIdentifier(req.ip),
      code: publicError.body.code,
      latencyMs: Date.now() - startedAt,
    });
    console.error("[mobile-answer] error:", err.code || err.message);

    if (req.body?.deviceId && publicError.body.code) {
      try {
        await markGeminiKeyFailure(req.body.deviceId, publicError.body.code);
        await recordGeminiFailureForAbuse({
          deviceId: req.body.deviceId,
          ip: req.ip,
          keyHash,
          code: publicError.body.code,
        });
      } catch (dbErr) {
        console.error("[mobile-answer] failed to persist key health/abuse state:", dbErr.message);
      }
    }

    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ type: "error", ...publicError.body })}\n\n`);
      return res.end();
    }
    if (publicError.body.retryAfter) {
      res.setHeader("Retry-After", publicError.body.retryAfter);
    }
    if (err?.status === 429 || err?.status === 400) {
      return prepareError(err, res);
    }
    return res.status(publicError.status).json(publicError.body);
  }
}
