// server/services/evidence-hierarchy.service.js
//
// Hierarchy/context preservation for retrieved evidence.
//
// The problem this solves: a RAG answer can contain the right entities and still
// be wrong, because the RELATIONSHIP or its DIRECTION was reversed. "Union ->
// State -> District" becomes "District -> Union"; a cause becomes an effect. The
// model has no way to notice, because the chunks arrive as an unordered bag of
// text with no positional information at all.
//
// This is deliberately NOT a hierarchy-retrieval system. Relevance still decides
// WHICH chunks are used. This module only preserves the structure the source
// already has, so the model can read the evidence the way the book reads:
//
//   1. carry the source's own coordinates (source, chunk_index, topic, heading)
//      into the prompt, so a statement can be attributed and its position known;
//   2. group chunks that are contiguous in the same source, and present each
//      group in document order, while keeping the GROUPS in relevance order;
//   3. tell the model that contiguous chunks are one continuous passage.
//
// Constraints:
//  - No extra model call, no extra retrieval pass, no re-ranking. Purely local
//    string/array work on chunks already in memory.
//  - Chunks are never dropped, merged, or reordered across groups, so evidence
//    coverage is identical to before. Only the order WITHIN a contiguous
//    same-source run changes, and only when such a run exists.
//  - page_number is not surfaced by the retrieval layer, so chunk_index is the
//    document-order key. See NOTE at the bottom.

// Two chunks are treated as contiguous when they come from the same source and
// their chunk_index values differ by no more than this. Consecutive chunks are
// 1 apart; 2 tolerates a skipped chunk that still sits in the same section.
const MAX_CONTIGUOUS_INDEX_GAP = 2;

function asInt(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

// Chunks reach this module in two shapes: raw retrieval chunks (coordinates under
// `metadata`) and the already-narrowed objects the answer path builds. Read both.
export function describeChunk(chunk) {
  const meta = chunk?.metadata || {};
  const rawHeading = meta.heading_hierarchy ?? chunk?.heading_hierarchy ?? chunk?.heading;
  const heading = Array.isArray(rawHeading)
    ? rawHeading.filter((h) => typeof h === "string" && h.trim())
    : typeof rawHeading === "string" && rawHeading.trim()
      ? [rawHeading.trim()]
      : [];
  return {
    source: meta.source_file || meta.source || chunk?.source_file || chunk?.source || "",
    chunkIndex: asInt(meta.chunk_index ?? chunk?.chunk_index ?? chunk?.chunkIndex),
    page: asInt(meta.page_number ?? chunk?.page_number ?? chunk?.page),
    topic: (typeof meta.topic === "string" && meta.topic) || (typeof chunk?.topic === "string" && chunk.topic) || "",
    heading: heading.length ? heading.join(" > ") : "",
  };
}

function shortSource(source) {
  if (!source) return "";
  const base = String(source).split("/").pop() || String(source);
  return base.replace(/\.pdf$/i, "").replace(/_/g, " ");
}

/**
 * Order chunks for presentation.
 *
 * Relevance still leads: a contiguous run is placed where its single best-ranked
 * member already sat, so promoting document order inside a run can never promote
 * a run that retrieval had ranked below another. Only order WITHIN a run changes.
 *
 * Returns the original chunk objects plus a parallel `layout` array describing
 * what happened, so callers can annotate the prompt without re-deriving anything.
 */
export function orderChunksBySourceProximity(chunks, options = {}) {
  const list = Array.isArray(chunks) ? chunks.slice() : [];
  const maxGap = Number.isFinite(options.maxIndexGap) ? options.maxIndexGap : MAX_CONTIGUOUS_INDEX_GAP;

  const runs = [];
  let run = [];

  const flush = () => {
    if (run.length) runs.push(run);
    run = [];
  };

  for (let i = 0; i < list.length; i++) {
    const info = describeChunk(list[i]);
    if (info.chunkIndex === null || !info.source) {
      flush();
      runs.push([i]);
      continue;
    }
    if (run.length) {
      const prev = describeChunk(list[run[run.length - 1]]);
      const sameSource = prev.source === info.source;
      const gap = Math.abs(info.chunkIndex - prev.chunkIndex);
      // Same source and nearby in the document, in either direction: one run.
      // A large gap means retrieval interleaved two distant regions, so they stay
      // separate. Distance, not direction, decides - [3,1,2] is a single region
      // retrieved slightly out of order and must be sorted, while [1,100,2] is
      // two regions and must not be.
      if (!sameSource || gap > maxGap) {
        flush();
      }
    }
    run.push(i);
  }
  flush();

  // Runs partition the array in retrieval order. Keeping that order and only
  // sorting WITHIN a contiguous run is what preserves relevance primacy: a run
  // can never move ahead of a run that retrieval ranked above it, and a
  // non-contiguous chunk is never moved at all.
  const ordered = [];
  const layout = [];

  for (const indices of runs) {
    const contiguous = indices.length > 1;
    const sorted = contiguous
      ? indices.slice().sort((a, b) => {
          const ai = describeChunk(list[a]).chunkIndex;
          const bi = describeChunk(list[b]).chunkIndex;
          if (ai !== bi) return ai - bi;
          return a - b;
        })
      : indices;

    const reordered = sorted.some((v, i) => v !== indices[i]);

    sorted.forEach((chunkIdx, pos) => {
      ordered.push(list[chunkIdx]);
      layout.push({
        contiguous,
        reordered,
        isFirst: pos === 0,
        sectionLength: sorted.length,
        info: describeChunk(list[chunkIdx]),
      });
    });
  }

  return { chunks: ordered, layout };
}

/**
 * Render evidence with a compact positional header per chunk.
 *
 * The header is deliberately short (~10-15 tokens). It exists to tell the model
 * where a statement sits, not to be read by a human, and it must not eat into the
 * 10,000-character evidence budget - which is measured on chunk text only, before
 * these headers are added.
 */
export function formatEvidenceChunks(chunks, layout, options = {}) {
  const label = options.label || ((i) => `EVIDENCE ${i + 1}`);
  const list = Array.isArray(chunks) ? chunks : [];
  return list
    .map((chunk, i) => {
      const info = describeChunk(chunk);
      const slot = (layout && layout[i]) || { contiguous: false, reordered: false };
      const bits = [];
      const src = shortSource(info.source);
      if (src) bits.push(src);
      if (info.page != null) bits.push(`p.${info.page}`);
      else if (info.chunkIndex != null) bits.push(`chunk ${info.chunkIndex}`);
      if (info.heading) bits.push(info.heading);
      else if (info.topic) bits.push(info.topic);
      // Mark contiguity so the model reads a same-section run as one passage.
      if (slot.contiguous && !slot.isFirst) bits.push("continues above");
      else if (slot.contiguous && slot.isFirst && slot.sectionLength > 1) bits.push("passage start");

      const head = bits.length ? `${label(i)} [${bits.join(" | ")}]:\n` : `${label(i)}:\n`;
      return head + String(chunk?.text || chunk || "").trim();
    })
    .join("\n\n");
}

// The one part of the hierarchy picture we cannot show the model: the retrieval
// layer does not surface page_number, even though the column exists in Postgres
// (upsc_chunks_history.page_number) and db.service.js carries the migration.
// Restoring it means changing the Python vector_server response, not this file.
// chunk_index is monotonic within a document, so document order is still
// recoverable without it.
