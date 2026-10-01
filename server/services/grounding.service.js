// server/services/grounding.service.js
//
// Programmatic source-lock verification.
//
// The RAG prompt asks Gemini to stay inside the retrieved chunks, but a prompt is
// only a request. Flash-Lite still occasionally fills a gap from pretrained
// knowledge (observed: a specific MPI household-methodology claim that appeared
// in NO retrieved chunk). This module checks the generated answer against the
// evidence it was given, and removes sentences that assert specifics the source
// does not support.
//
// Design constraints:
//  - No extra model call. Latency on this path is already the binding constraint.
//  - Conservative by design: a false positive silently deletes a good sentence,
//    so only sentences that assert unverifiable specifics are removed.

const STOPWORDS = new Set(
  ("a an the and or but if then than that this these those there here of in on at to for from by with without " +
    "as is are was were be been being being do does did doing have has had having will would shall should can " +
    "could may might must not no nor so such into over under about between among during before after above below " +
    "up down out off again further once only own same too very just also however therefore thus moreover " +
    "furthermore although though whereas since because while when where which who whom whose what how why " +
    "it its they them their he she his her we us our you your i me my one two also within upon across per " +
    "towards toward through throughout against near part many much more most other others another each any " +
    "both all few several such own same own able need needs needed using used use make makes made get gets " +
    "given give gives take takes taken come comes came go goes went see seen seen look looks new first second " +
    "new last long high low big small good bad best better worse way ways thing things lot lots kind sort " +
    "well even still yet already always never often sometimes usually really quite rather perhaps maybe")
    .split(/\s+/)
);

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^a-z0-9\s%]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function contentWords(sentence) {
  return normalize(sentence)
    .split(" ")
    .filter((w) => w.length > 3 && !STOPWORDS.has(w));
}

// Split the answer into blocks so we can rebuild it after removing sentences.
// A block = heading line, or a run of prose/bullet lines.
function splitBlocks(text) {
  const lines = String(text || "").split("\n");
  const blocks = [];
  let current = null;
  for (const line of lines) {
    const isHeading = /^\s*#{1,6}\s+/.test(line);
    const isBullet = /^\s*(?:[-•*]|\d+\.)\s+/.test(line);
    const isBlank = !line.trim();
    const startsNew =
      isHeading || isBullet || isBlank || !current || current.type === "heading";
    if (startsNew) {
      current = { type: isHeading ? "heading" : isBullet ? "bullet" : "para", lines: [line] };
      blocks.push(current);
    } else {
      current.lines.push(line);
    }
  }
  return blocks;
}

// Split a paragraph's prose into sentences, keeping the trailing newline layout.
function splitSentences(blockText) {
  const parts = String(blockText).split(/(?<=[.!?])\s+(?=[A-Z“"(*])/);
  return parts.map((s) => s.trim()).filter((s) => s.length > 0);
}

const NUMBER_RE = /\b\d[\d,.]*\s*(?:%|percent|lakh|crore|million|billion|thousand)?\b/gi;
// Only "significant" figures are enforced as fabrications. Single digits are often
// written as words in the evidence ("three dimensions" vs "3 dimensions"), so
// enforcing those would delete correct sentences.
const SIGNIFICANT_NUMBER_RE = /(?:\d{2,}|\d[\d,.]*\s*(?:%|percent|lakh|crore|million|billion))/gi;

function extractSignificantNumbers(sentence) {
  const found = String(sentence).match(SIGNIFICANT_NUMBER_RE) || [];
  return found.map((raw) => raw.replace(/\s+/g, " ").trim()).filter(Boolean);
}

// A sentence is dangerous when it asserts a specific we cannot trace:
//  - a figure/date absent from the evidence, or
//  - so little of its vocabulary is in the evidence that it reads as recalled knowledge.
function scoreSentence(sentence, evidenceNorm) {
  const words = contentWords(sentence);
  if (!words.length) return { support: 1, supportCount: 0, total: 0, missing: [], ungroundedNumbers: [] };

  let supportCount = 0;
  const missing = [];
  for (const w of words) {
    if (evidenceNorm.includes(w)) supportCount++;
    else missing.push(w);
  }
  const support = supportCount / words.length;

  const ungroundedNumbers = [];
  for (const raw of extractSignificantNumbers(sentence)) {
    const digits = raw.replace(/[^\d]/g, "");
    if (!digits) continue;
    if (!evidenceNorm.includes(digits)) ungroundedNumbers.push(raw);
  }

  return { support, supportCount, total: words.length, missing, ungroundedNumbers };
}

// Tuned against real answers: a fabricated methodology claim scored 0.11 while a
// legitimate thesis sentence ("poverty is measured beyond income alone") scored
// 0.33, so 0.25 separates recalled-knowledge from ordinary paraphrase. Only
// non-destructively flagged, so this threshold trades signal quality, not safety.
const LOW_SUPPORT_THRESHOLD = 0.25; // below this, sentence is suspicious (flag, not delete)

/**
 * Verify an answer against its evidence chunks.
 *
 * Two tiers, deliberately asymmetric:
 *  - ENFORCE (sentence removed): asserts a significant figure absent from the
 *    evidence. This is a provable fabrication, so removal carries no false-positive risk.
 *  - FLAG (sentence kept, reported): little of its vocabulary is in the evidence.
 *    This can be either a legitimate paraphrase or a recalled detail, and lexical
 *    overlap alone cannot tell them apart — so we surface it instead of deleting it.
 *
 * Returns the cleaned answer plus a report describing what was removed and flagged.
 */
export function verifyGrounding(answerText, chunks, options = {}) {
  const evidence = Array.isArray(chunks) ? chunks : [];
  const evidenceNorm = normalize(evidence.map((c) => (typeof c === "string" ? c : c?.text || "")).join("  \n  "));
  const dryRun = options.dryRun === true;
  const enforceLowSupport = options.enforceLowSupport === true; // opt-in, off by default

  if (!answerText || !evidenceNorm) {
    return {
      answer: answerText,
      removed: [],
      flagged: [],
      kept: 0,
      total: 0,
      supportAvg: 1,
      applied: false,
      grounded: true,
    };
  }

  const blocks = splitBlocks(answerText);
  const removed = [];
  const flagged = [];
  let kept = 0;
  let total = 0;
  const supportAll = [];
  const outBlocks = [];

  const assess = (sentence) => {
    const sc = scoreSentence(sentence, evidenceNorm);
    total++;
    supportAll.push(sc.support);
    const fabricated = sc.ungroundedNumbers.length > 0;
    const lowSupport = sc.support < LOW_SUPPORT_THRESHOLD;
    if (fabricated || (enforceLowSupport && lowSupport)) {
      removed.push({
        text: sentence.slice(0, 200),
        support: Number(sc.support.toFixed(2)),
        ungroundedNumbers: sc.ungroundedNumbers,
        reason: fabricated
          ? "asserts figure not present in retrieved chunks"
          : "content largely absent from retrieved chunks",
      });
      return false;
    }
    if (lowSupport) {
      flagged.push({
        text: sentence.slice(0, 200),
        support: Number(sc.support.toFixed(2)),
        reason: "low lexical support in retrieved chunks — may be recalled knowledge",
      });
    }
    kept++;
    return true;
  };

  for (const block of blocks) {
    const blockText = block.lines.join("\n");
    if (block.type === "heading" || !blockText.trim()) {
      outBlocks.push(block);
      continue;
    }

    const sentences = splitSentences(blockText);
    if (sentences.length <= 1) {
      assess(sentences[0] || blockText);
      outBlocks.push(block);
      continue;
    }

    const keepLines = [];
    for (const sentence of sentences) {
      if (assess(sentence)) keepLines.push(sentence);
    }
    outBlocks.push({ type: block.type, lines: [keepLines.join(" ")] });
  }

  // drop headings that lost all their body content
  const pruned = [];
  for (let i = 0; i < outBlocks.length; i++) {
    const b = outBlocks[i];
    if (b.type === "heading") {
      const next = outBlocks[i + 1];
      const hasBody = next && next.type !== "heading" && next.lines.join("").trim().length > 0;
      if (hasBody || (next && next.type === "heading")) pruned.push(b);
    } else {
      pruned.push(b);
    }
  }

  const cleaned = pruned
    .map((b) => b.lines.join("\n"))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const supportAvg = supportAll.length ? supportAll.reduce((a, b) => a + b, 0) / supportAll.length : 1;

  return {
    answer: dryRun ? answerText : cleaned,
    removed,
    flagged,
    kept,
    total,
    supportAvg: Number(supportAvg.toFixed(3)),
    applied: !dryRun && removed.length > 0,
    grounded: removed.length === 0 && flagged.length === 0,
  };
}

export const GROUNDING_THRESHOLDS = {
  lowSupport: LOW_SUPPORT_THRESHOLD,
};
