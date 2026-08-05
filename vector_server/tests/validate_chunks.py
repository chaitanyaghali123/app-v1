#!/usr/bin/env python3
"""Chunk validator: prints a per-chunk audit of the indexed corpus and
flags chunks that violate the chunking contract.

Reads directly from the upsc_chunks table (needs DB access, run inside the
aryabhata-ingestor container where /app is the vector_server mount).

Usage:
    docker exec aryabhata-ingestor python /app/tests/validate_chunks.py [--strict]
"""

import argparse
import sys

sys.path.insert(0, "/app")

import ingest_hybrid as ih  # noqa: E402


def main():
    ap = argparse.ArgumentParser(description="Validate indexed chunks")
    ap.add_argument("--strict", action="store_true",
                    help="exit non-zero if any chunk violates the contract")
    ap.add_argument("--source", default=None,
                    help="only validate chunks from this source_file (substring)")
    args = ap.parse_args()

    conn = ih.get_conn()
    problems = []
    rows = []
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, chunk_index, chunk, heading_hierarchy,
                       parent_chunk, is_parent_chunk, source_file, topic
                FROM upsc_chunks
                WHERE embedding IS NOT NULL
                ORDER BY source_file, chunk_index
            """)
            rows = cur.fetchall()
    finally:
        ih.release_conn(conn)

    if args.source:
        rows = [r for r in rows if args.source in (r[6] or "")]

    parent_index = {}
    for r in rows:
        _id, cidx, _chunk, _hier, ptext, is_parent, _src, _topic = r
        if is_parent and ptext:
            parent_index.setdefault(ptext, cidx)

    print(f"== {len(rows)} indexed chunks (overlap={ih.CHUNK_OVERLAP}, "
          f"tolerant={ih.CHUNK_SIZE_TOLERANT}) ==")

    for r in rows:
        _id, cidx, chunk, hier, ptext, is_parent, src, topic = r
        tokens = ih.token_count(chunk)
        hier_txt = " ▸ ".join(hier) if hier else "-"
        parent_label = str(parent_index.get(ptext, "-")) if not is_parent else "(self)"
        line = (
            f"Chunk {cidx:<4} — Tokens: {tokens:<5} — "
            f"Hierarchy: {hier_txt[:60]} — "
            f"Parent: {parent_label:<6} — "
            f"Overlap: {ih.CHUNK_OVERLAP} — "
            f"Source: {src}"
        )
        print(line)

        if tokens > ih.CHUNK_SIZE_TOLERANT:
            problems.append(f"chunk {cidx} ({src}): {tokens} tokens > "
                            f"tolerant bound {ih.CHUNK_SIZE_TOLERANT}")
        if is_parent and not ptext:
            problems.append(f"chunk {cidx} ({src}): parent chunk without parent_text")
        if not is_parent and not ptext:
            problems.append(f"chunk {cidx} ({src}): orphan child chunk (no parent_text)")

    if problems:
        print("\n== PROBLEMS ==")
        for p in problems:
            print(f"  ! {p}")
    else:
        print("\n== no problems ==")

    if args.strict:
        return 1 if problems else 0
    return 0


if __name__ == "__main__":
    sys.exit(main())
