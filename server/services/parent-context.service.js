// server/services/parent-context.service.js
//
// Recover the text that retrieval cut off.
//
// The problem: the evidence budget slices chunks to fit (budgetChunksFairly ->
// relevantChunkWindow). When a chunk is longer than its quota, the tail of the
// passage is discarded, and the sentence that CONTINUES the argument usually sits
// at the start of the NEXT chunk in the same document. The model then sees a claim
// whose reasoning was amputated, and the grounding layer correctly flags the
// sentence it writes to fill the gap. Widening the same chunk cannot fix this -
// the text is genuinely in a different row.
//
// The fix: for each chunk that was truncated by the budget, fetch its immediate
// neighbours (chunk_index +/- 1) from the same source and attach the part that
// continues it - the head of the successor, the tail of the predecessor.
//
// On `parent_chunk`: the column exists and is 100% populated, but for PDFs it holds
// the whole PDF_PAGE_BATCH (measured: 111,577 chars shared by chunks 11-27 of the
// NCERT Themes file, ~11x the entire 10,000-char budget). It is a page batch, not a
// semantic parent, so it cannot be used as expansion context. Neighbour lookup by
// (source_file, chunk_index) is the correct granularity and is what this uses.
//
// Constraints:
//  - No extra model call, no re-ranking, no change to which chunks are SELECTED.
//    The same 4 primaries are used; context is additive and always subordinate.
//  - Every context unit is real corpus text, so it is appended to the SAME array
//    that buildRagPrompt renders and verifyGrounding scores. Context therefore can
//    never support a claim the grounding layer has not also seen - the safeguard
//    stays closed.
//  - Off by default. Retrieval changes must be measured against the live baseline
//    before they ship; see PARENT_CONTEXT_ENABLED.

import { pool as defaultPool } from "./db.service.js";
import { describeChunk } from "./evidence-hierarchy.service.js";

// Per-unit cap, so one long neighbour cannot consume the whole reserve.
const MAX_CONTEXT_UNIT_CHARS = 700;
// Never attach more context than primaries actually asked for.
const MAX_CONTEXT_UNITS = 3;

function asInt(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

export function isParentContextEnabled() {
  return String(process.env.PARENT_CONTEXT_ENABLED || "").toLowerCase() === "true";
}

/**
 * Which neighbours does this evidence set need?
 *
 * Only truncated chunks qualify. An untruncated chunk already shows all its text,
 * so a neighbour adds cost with no informational gain. Chunks whose neighbour is
 * already present in the primary set are skipped too - that continuation is
 * already in the prompt.
 */
export function planNeighborContext(chunks, options = {}) {
  const list = Array.isArray(chunks) ? chunks : [];
  const present = new Set(
    list
      .map((c) => describeChunk(c))
      .filter((i) => i.source && i.chunkIndex !== null)
      .map((i) => `${i.source}::${i.chunkIndex}`)
  );

  const plans = [];
  // Adjacent truncated anchors both point at the same middle row (15 and 17 both
  // want 16). That row can only be fetched once, so the later plan would silently
  // overwrite the earlier one in fetchNeighborContext's key map, costing a unit
  // slot for nothing. Dedupe here so the cap counts real, reachable targets.
  const planned = new Set();
  for (const chunk of list) {
    const info = describeChunk(chunk);
    if (info.source === "" || info.chunkIndex === null) continue;
    if (chunk?.metadata?.budget_truncated !== true) continue;

    for (const delta of [1, -1]) {
      // Checked per direction, not per anchor: each plan yields at most one context
      // unit, so the cap must bound plans. Checking once per anchor let the last
      // anchor push the list one over.
      if (plans.length >= (options.maxUnits ?? MAX_CONTEXT_UNITS)) break;
      const target = info.chunkIndex + delta;
      if (target < 0) continue;
      const key = `${info.source}::${target}`;
      // The continuation is already in the prompt as a primary - nothing to add.
      if (present.has(key)) continue;
      if (planned.has(key)) continue;
      planned.add(key);
      plans.push({
        id: `${info.source}#${target}`,
        sourceFile: info.source,
        chunkIndex: target,
        anchorIndex: info.chunkIndex,
        // Successor continues the argument; predecessor supplies what led to it.
        role: delta === 1 ? "continues-after" : "continues-before",
      });
    }
  }
  return plans;
}

/**
 * Fetch the planned neighbours in a single query, scoped to the source files and
 * index range of the plans so it stays an index range scan rather than a scan of
 * every chunk in the corpus.
 */
export async function fetchNeighborContext(plans, options = {}) {
  const db = options.pool || defaultPool;
  const list = Array.isArray(plans) ? plans : [];
  if (list.length === 0) return [];

  const files = [...new Set(list.map((p) => p.sourceFile))];
  const minIndex = Math.min(...list.map((p) => p.chunkIndex));
  const maxIndex = Math.max(...list.map((p) => p.chunkIndex));
  const params = [files, minIndex, maxIndex];
  let sql = `
    SELECT source_file, chunk_index, chunk, topic, page_number, heading_hierarchy, subject_id
    FROM upsc_chunks
    WHERE source_file = ANY($1) AND chunk_index BETWEEN $2 AND $3
  `;
  if (options.subjectIds && options.subjectIds.length > 0) {
    sql += ` AND subject_id = ANY($4)`;
    params.push(options.subjectIds);
  }

  const byKey = new Map();
  for (const plan of list) byKey.set(`${plan.sourceFile}::${plan.chunkIndex}`, plan);

  const { rows } = await db.query(sql, params);
  const found = [];
  for (const row of rows || []) {
    const key = `${row.source_file}::${row.chunk_index}`;
    const plan = byKey.get(key);
    if (!plan) continue;
    found.push({
      plan,
      text: String(row.chunk || ""),
      topic: row.topic || "",
      page: row.page_number ?? null,
      heading: row.heading_hierarchy || [],
      subjectId: row.subject_id || "",
    });
  }
  return found;
}

/**
 * Cut each neighbour down to the part that actually continues the truncated chunk.
 *
 * Successor -> its HEAD (the sentence that picks up where the primary was cut).
 * Predecessor -> its TAIL (the setup the primary's opening refers back to).
 * Both are snapped to a sentence boundary so a context unit never opens or ends
 * mid-clause, which would just relocate the truncation problem.
 */
export function buildContextUnits(found, reserveChars, options = {}) {
  const perUnitCap = options.maxUnitChars ?? MAX_CONTEXT_UNIT_CHARS;
  const reserve = Math.max(0, Math.floor(reserveChars));
  let spent = 0;
  const units = [];

  // Predecessors first: they supply the setup that makes the primary's argument
  // legible, and they are the half most likely to be dropped by a greedy fill.
  const ordered = [...(found || [])].sort((a, b) => {
    const rank = (u) => (u.plan.role === "continues-before" ? 0 : 1);
    return rank(a) - rank(b) || a.plan.chunkIndex - b.plan.chunkIndex;
  });

  for (const item of ordered) {
    if (units.length >= (options.maxUnits ?? MAX_CONTEXT_UNITS)) break;
    const room = Math.min(perUnitCap, reserve - spent);
    if (room < 120) break;

    const text = item.text.trim();
    let slice;
    if (item.plan.role === "continues-before") {
      slice = text.slice(Math.max(0, text.length - room));
      // Advance to the first sentence boundary so the unit opens cleanly.
      const boundary = slice.search(/[.!?]\s+/);
      if (boundary >= 0 && boundary < room * 0.5) slice = slice.slice(boundary + 1);
    } else {
      slice = text.slice(0, room);
      // Retreat to the last sentence boundary so the unit ends cleanly.
      const boundary = Math.max(
        slice.lastIndexOf(". "),
        slice.lastIndexOf("! "),
        slice.lastIndexOf("? "),
      );
      if (boundary > room * 0.5) slice = slice.slice(0, boundary + 1);
    }
    slice = slice.trim();
    if (slice.length < 120) continue;

    spent += slice.length;
    units.push({
      id: item.plan.id,
      text: slice,
      relevanceScore: 0,
      metadata: {
        source_file: item.plan.sourceFile,
        chunk_index: item.plan.chunkIndex,
        page_number: item.page,
        topic: item.topic,
        heading_hierarchy: item.heading,
        subject_id: item.subjectId,
        // Drives both the prompt label and the prompt rule. The model is told these
        // support a primary; the grounding layer treats them as ordinary evidence.
        rag_facet: "context-continuation",
        context_role: item.plan.role,
        context_anchor_chunk: item.plan.anchorIndex,
      },
    });
  }

  return { units, chars: spent };
}

/**
 * Full expansion for one evidence set. Returns the original chunks plus context
 * units, or the untouched input when expansion is off or finds nothing to do.
 */
export async function expandWithParentContext(chunks, options = {}) {
  if (!isParentContextEnabled()) {
    return { chunks, added: 0, chars: 0, enabled: false };
  }
  const startedAt = Date.now();
  const plans = planNeighborContext(chunks, options);
  if (plans.length === 0) {
    return { chunks, added: 0, chars: 0, enabled: true, ms: 0 };
  }

  // The caller passes the reserve it already carved out of the total budget. This
  // must not re-apply a ratio: doing so shrinks the reserve twice and starves
  // expansion to a single unit.
  const reserve = Math.floor(options.contextBudget || 0);
  if (reserve < 120) {
    return { chunks, added: 0, chars: 0, enabled: true, ms: 0 };
  }

  const found = await fetchNeighborContext(plans, options);
  const { units, chars } = buildContextUnits(found, reserve, options);
  if (units.length === 0) {
    return { chunks, added: 0, chars: 0, enabled: true, ms: Date.now() - startedAt };
  }

  return {
    chunks: interleaveContextUnits(chunks, units),
    added: units.length,
    chars,
    enabled: true,
    ms: Date.now() - startedAt,
  };
}

/**
 * Place each context unit immediately beside the chunk it belongs with.
 *
 * Appending them at the end put "CONTEXT BEFORE chunk 16" after evidence 4, so the
 * model had to jump across the whole block to find the setup its chunk referred to.
 * Splicing next to the anchor lets orderChunksBySourceProximity group them as one
 * contiguous document-order run, which is the whole point of the feature.
 */
function interleaveContextUnits(chunks, units) {
  const out = [...chunks];
  // The anchor must be matched on source AND index. Matching on chunkIndex alone
  // spliced context next to the wrong document whenever two sources in the evidence
  // set happened to share an index, which put a Chapter-4 continuation directly
  // under an Ashokan inscription.
  const anchorAt = (unit) => {
    const { context_anchor_chunk: index, source_file: source } = unit.metadata;
    return out.findIndex((c) => {
      const info = describeChunk(c);
      return info.chunkIndex === index && (!source || info.source === source);
    });
  };
  // Insert from the end backwards so earlier splices do not shift later indices.
  const positions = units
    .map((unit) => ({ unit, at: anchorAt(unit) }))
    .filter((p) => p.at >= 0)
    .sort((a, b) => b.at - a.at);

  for (const { unit, at } of positions) {
    // "continues-before" precedes its anchor; "continues-after" follows it.
    const offset = unit.metadata.context_role === "continues-before" ? 0 : 1;
    out.splice(at + offset, 0, unit);
  }
  return out;
}
