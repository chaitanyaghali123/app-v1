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

// ---------------------------------------------------------------------------
// Layer 2: relational / causal claim verification.
//
// Layer 1 checks whether individual facts (figures, words) are present in the
// evidence. It cannot see a *newly invented relationship between two separately
// supported facts*. Observed in the Ashoka test:
//
//   "The successful decipherment of Asokan Brahmi in 1838 provided scholars with
//    a reliable palaeographic baseline to date other ancient texts."
//
// The evidence states "1838 Decipherment of Asokan Brahmi by James Prinsep" AND
// separately "dated on the basis of palaeography". Every word is supported. The
// *link* (decipherment -> provided a dating baseline) is not stated anywhere.
//
// This layer is fully deterministic and local: no second model call, so latency
// impact is sub-millisecond. It never deletes; unsupported links are flagged so a
// human can judge whether the synthesis is defensible.
// ---------------------------------------------------------------------------

// Markers that assert a factual link between two things. Split into strong
// (unambiguously evidential) and soft (often legitimate analytical connective).
const STRONG_RELATIONAL_MARKERS = [
  "caused", "causes", "causing", "cause", "led to", "leads to", "resulted in", "results in",
  "resulting in", "resulted from", "responsible for", "gave rise to", "giving rise to",
  "enabled", "enables", "enabling", "enable", "demonstrates", "demonstrate", "demonstrated",
  "demonstrating", "proves", "prove", "proved", "proving", "necessitated", "necessitates",
  "necessitate", "paved the way", "pave the way", "contributed to", "contribute to",
  "stemmed from", "originated in", "triggered", "spurred", "bolstered", "reinforced",
  "underpinned", "attributable to", "owing to", "on account of",
];

const SOFT_RELATIONAL_MARKERS = [
  "because", "due to", "therefore", "consequently", "thus", "hence",
  "strengthened", "strengthen", "weakened", "weaken", "provided", "provides", "provide",
  "allowed", "facilitated", "facilitate", "reflects", "reflecting", "reflect",
  "inferred", "suggests", "suggest", "indicating", "as a result", "insofar as", "which means",
];

// Require this many distinctive terms from EACH side of the relation to appear in
// the same evidence sentence before we accept the link as sourced. A single
// shared word is not evidence of a relationship: in the Ashoka case the sentence
// "Names of rulers such as Ajatasattu and Asoka, known from Prakrit texts" links
// "Asoka" and "texts" but establishes nothing about decipherment.
const MIN_LINK_TERMS_PER_SIDE = 2;

function stem(word) {
  return word.length > 7 ? word.slice(0, 6) : word;
}

function stemSet(sentence) {
  return new Set(contentWords(sentence).map(stem));
}

// Word-boundary matching is required, not cosmetic. Plain substring matching
// made "cause" fire inside "because" (silently reclassifying an analytical clause
// as a hard evidential claim) and "stem" fire inside "system".
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const STRONG_RELATIONAL_RE = new RegExp(
  `\\b(?:${STRONG_RELATIONAL_MARKERS.map(escapeRe).join("|")})\\b`,
  "i"
);
const SOFT_RELATIONAL_RE = new RegExp(
  `\\b(?:${SOFT_RELATIONAL_MARKERS.map(escapeRe).join("|")})\\b`,
  "i"
);

function findRelationalMarker(sentence) {
  const text = String(sentence);
  const strong = STRONG_RELATIONAL_RE.exec(text);
  const soft = SOFT_RELATIONAL_RE.exec(text);
  if (!strong && !soft) return null;
  // Earliest marker wins; strong wins a tie.
  if (strong && (!soft || strong.index <= soft.index)) {
    return { marker: strong[0].toLowerCase(), index: strong.index, length: strong[0].length, strength: "strong" };
  }
  return { marker: soft[0].toLowerCase(), index: soft.index, length: soft[0].length, strength: "soft" };
}

// Precompute per-evidence-sentence stem sets once, so the relational check is a
// set-intersection scan rather than repeated substring searches over the corpus.
function splitEvidenceUnits(text) {
  // Split on newlines first: bullet/timeline chunks would otherwise collapse into
  // one kitchen-sink "sentence" whose stems could establish links that no single
  // statement actually makes.
  return String(text || "")
    .split("\n")
    .flatMap((line) => splitSentences(line))
    .map((s) => s.trim())
    .filter(Boolean);
}

function buildEvidenceIndex(evidence) {
  const windows = [];
  for (const c of evidence) {
    const text = typeof c === "string" ? c : c?.text || "";
    const units = splitEvidenceUnits(text).map((s) => ({ text: s, stems: stemSet(s) }));
    for (let i = 0; i < units.length; i++) {
      if (units[i].stems.size > 0) windows.push(units[i].stems);
      // Also index the union of each adjacent pair. Source sentences routinely
      // split a single relation across two statements, e.g. the Kalinga evidence
      // puts "had been ruling for eight years ... was conquered by him" in one
      // sentence and "One hundred and fifty thousand men were deported" in the
      // next. Requiring the whole relation inside ONE sentence under-sourced it.
      if (i + 1 < units.length && units[i + 1].stems.size > 0) {
        const merged = new Set([...units[i].stems, ...units[i + 1].stems]);
        windows.push(merged);
      }
    }
  }
  return windows;
}

function countOverlaps(stems, evidenceStems) {
  let n = 0;
  for (const w of stems) if (evidenceStems.has(w)) n++;
  return n;
}

// Best single-window support for one side of a relation.
function sideSupport(stems, evidenceIndex) {
  let max = 0;
  for (const ev of evidenceIndex) {
    const n = countOverlaps(stems, ev);
    if (n > max) max = n;
  }
  return max;
}

// Conditional / hedged / normative framing marks a sentence as reasoning rather
// than assertion. "Relying SOLELY on economic and judicial mechanisms proves
// insufficient WHEN addressing systemic ecological crises" states a defensible
// analytical position; "early elections PROVED the viability of mass democracy"
// asserts a source-attributable conclusion the chunks never make. Both contain a
// strong marker, so framing is what separates them.
const HEDGE_FRAMING_RE =
  /\b(solely|only|merely|when|where|if|unless|although|though|may|might|could|would|should|must|ought|arguably|perhaps|generally|typically|usually|insofar|whether|it follows|one may)\b/;

// Layer 3 exemption: commentary ABOUT the evidence is analytical glue, not a
// factual claim about the past, so the relational check does not apply to it.
// e.g. "These limitations necessitate a cautious interpretation because
// epigraphy alone does not provide a full understanding..." is a defensible
// conclusion built on supported evidence, and must not be treated as invention.
const META_INTERPRETIVE_TERMS = new Set(
  ("cautious cautiously careful carefully prudent prudence interpret interpretation interpretive " +
    "supplement supplementary corroborate corroborating corroboration tentative qualify qualified " +
    "contextual context perspective perspectives bias biased omission omissions gap gaps silence " +
    "necessitate necessitates necessitated warrant warranted caution mindful limitation limitations " +
    "uncertain uncertainty incomplete complementary limited caveat caution evidentiary")
    .split(/\s+/)
);

function countMetaTerms(sentence) {
  let n = 0;
  for (const w of contentWords(sentence)) if (META_INTERPRETIVE_TERMS.has(w)) n++;
  return n;
}


/**
 * Decide whether a causal/relational assertion is established by the evidence.
 *
 * Returns null when the sentence is not a relational claim, or when the claim
 * looks like ordinary analytical connective tissue (too little substance on
 * either side to assert anything checkable). Otherwise returns a verdict object.
 */
function checkRelationalClaim(sentence, evidenceIndex) {
  // Layer 3: skip pure analytical/meta commentary before doing anything else.
  if (countMetaTerms(sentence) >= 2) return null;

  const hit = findRelationalMarker(sentence);
  if (!hit) return null;

  const raw = String(sentence);
  const idx = hit.index;
  const left = raw.slice(0, idx);
  const right = raw.slice(idx + hit.length);
  const leftStems = stemSet(left);
  const rightStems = stemSet(right);

  // Need enough substance on both sides to assert a checkable relationship.
  if (leftStems.size < 2 || rightStems.size < 2) return null;

  // The marker verb itself should not count as evidence for either side.
  for (const part of hit.marker.split(" ")) {
    const s = stem(part);
    leftStems.delete(s);
    rightStems.delete(s);
  }
  if (leftStems.size < 2 || rightStems.size < 2) return null;

  // Is the link itself stated? Require >= MIN_LINK_TERMS_PER_SIDE distinctive
  // terms from both halves inside one evidence sentence, or an adjacent pair.
  for (const ev of evidenceIndex) {
    if (
      countOverlaps(leftStems, ev) >= MIN_LINK_TERMS_PER_SIDE &&
      countOverlaps(rightStems, ev) >= MIN_LINK_TERMS_PER_SIDE
    ) {
      return { established: true, marker: hit.marker, strength: hit.strength, severity: "none" };
    }
  }

  // Link not stated. Classify how confident we are that this is a real
  // invention rather than acceptable synthesis, so a strict policy can act on
  // the confident cases only.
  //
  //  "spliced" = both halves are individually well supported by the evidence but
  //  never co-occur. That is the signature of a relationship manufactured by
  //  joining two separately sourced facts.
  const leftMax = sideSupport(leftStems, evidenceIndex);
  const rightMax = sideSupport(rightStems, evidenceIndex);
  const spliced =
    leftMax >= MIN_LINK_TERMS_PER_SIDE && rightMax >= MIN_LINK_TERMS_PER_SIDE;

  const hedged = HEDGE_FRAMING_RE.test(String(sentence).toLowerCase());

  let severity;
  if (hedged) {
    // Conditional/normative reasoning: keep regardless of marker.
    severity = "soft";
  } else if (leftMax < MIN_LINK_TERMS_PER_SIDE) {
    // The subject itself is not grounded, so we cannot claim the RELATION was
    // invented - only that its wording is ungrounded, which is Layer 1's job.
    //
    // Observed live: "This violent conflict triggered deep anguish and
    // repentance, turning the ruler toward an intense study, love, and
    // instruction of Dhamma" scored severity=hard purely on the strong marker
    // "triggered", even though the chunk states that relation outright ("This is
    // the repentance of Devanampiya on account of his conquest"). Only the
    // paraphrase differed - NCERT says "slaughter, death and deportation" where
    // the answer said "violent conflict" - so a hard marker must not by itself
    // authorise deletion.
    severity = "soft";
  } else if (hit.strength === "strong") {
    // Unconditional evidential assertion ("X caused/enabled/proved Y") between
    // two individually grounded halves that the evidence never joins.
    severity = "hard";
  } else if (spliced) {
    // Soft marker, but two individually sourced facts welded into a link that
    // the evidence never states. This is the Ashoka "provided a palaeographic
    // baseline" shape.
    severity = "elevated";
  } else {
    // Soft marker and the halves are not both grounded: most likely ordinary
    // analytical connective tissue.
    severity = "soft";
  }

  return {
    established: false,
    marker: hit.marker,
    strength: hit.strength,
    severity,
    spliced,
    hedged,
    leftSupport: leftMax,
    rightSupport: rightMax,
  };
}

/**
 * Verify an answer against its evidence chunks.
 *
 * Three layers, deliberately asymmetric, and never destructive beyond provable
 * fabrication:
 *
 *  Layer 1 — hard factual grounding
 *   - ENFORCE (sentence removed): asserts a significant figure absent from the
 *     evidence. This is a provable fabrication, so removal carries no
 *     false-positive risk.
 *   - FLAG (sentence kept, reported): little of its vocabulary is in the
 *     evidence. This can be either legitimate paraphrase or a recalled detail,
 *     and lexical overlap alone cannot tell them apart.
 *
 *  Layer 2 — relational / causal grounding
 *   - FLAG (sentence kept, reported): the words are supported but the asserted
 *     relationship between them is not stated in any single evidence sentence.
 *     This is the "newly invented link" failure mode that Layer 1 cannot see.
 *     Local and deterministic — no extra model call.
 *
 *  Layer 3 — analytical glue is explicitly allowed. Reasonable UPSC synthesis
 *   is not penalised merely for low literal overlap, and conclusions are not
 *   deleted.
 *
 * Returns the cleaned answer plus a report describing what was removed, flagged,
 * and which relational links could not be traced to the evidence.
 */
export function verifyGrounding(answerText, chunks, options = {}) {
  const evidence = Array.isArray(chunks) ? chunks : [];
  const evidenceNorm = normalize(evidence.map((c) => (typeof c === "string" ? c : c?.text || "")).join("  \n  "));
  const dryRun = options.dryRun === true;
  const enforceLowSupport = options.enforceLowSupport === true; // opt-in, off by default
  // "hard" | "all" | false — strict source-lock tiers for Layer 2, off by default.
  const enforceRelational = options.enforceRelational || false;

  if (!answerText || !evidenceNorm) {
    return {
      answer: answerText,
      removed: [],
      flagged: [],
      relational: [],
      kept: 0,
      total: 0,
      supportAvg: 1,
      applied: false,
      grounded: true,
    };
  }

  const blocks = splitBlocks(answerText);
  const evidenceIndex = buildEvidenceIndex(evidence);
  const removed = [];
  const flagged = [];
  const relational = [];
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
    } else {
      // Layer 2: the sentence is lexically supported, so Layer 1 has nothing to
      // say about it. Check whether the RELATIONSHIP it asserts is actually
      // present in the evidence, which is the class of claim Layer 1 misses.
      const rel = checkRelationalClaim(sentence, evidenceIndex);
      if (rel && !rel.established) {
        const entry = {
          text: sentence.slice(0, 200),
          support: Number(sc.support.toFixed(2)),
          marker: rel.marker,
          strength: rel.strength,
          severity: rel.severity,
          spliced: rel.spliced,
          reason:
            `asserts a ${rel.strength} relationship ("${rel.marker}") that the retrieved ` +
            "chunks do not state — synthesis may be inferred rather than sourced",
        };
        relational.push(entry);

        // Strict source-lock policy. OFF by default: measured precision of this
        // layer is ~50%, so deleting on it unconditionally would silently gut
        // legitimate analysis. "hard" removes only unconditional evidential
        // assertions; "all" additionally removes spliced soft-marker claims.
        const reject =
          enforceRelational === "all"
            ? rel.severity === "hard" || rel.severity === "elevated"
            : enforceRelational === "hard" && rel.severity === "hard";
        if (reject) {
          removed.push({
            text: entry.text,
            support: entry.support,
            marker: rel.marker,
            severity: rel.severity,
            reason: `unsupported ${rel.severity} causal/relational claim ("${rel.marker}")`,
          });
          relational.pop();
          return false;
        }
      }
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
    relational,
    kept,
    total,
    supportAvg: Number(supportAvg.toFixed(3)),
    applied: !dryRun && removed.length > 0,
    grounded: removed.length === 0 && flagged.length === 0 && relational.length === 0,
  };
}

export const GROUNDING_THRESHOLDS = {
  lowSupport: LOW_SUPPORT_THRESHOLD,
  minLinkTermsPerSide: MIN_LINK_TERMS_PER_SIDE,
};