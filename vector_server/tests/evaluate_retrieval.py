#!/usr/bin/env python3
"""Baseline retrieval evaluation runner.

Hits the live /chunks endpoint for each query in a queries JSON file and
records the rank at which the expected section is first matched.

Usage (inside aryabhata-ingestor container; /app == vector_server):
    docker cp evaluation/queries_v1.json <container>:/tmp/queries_v1.json
    docker exec aryabhata-ingestor python /app/tests/evaluate_retrieval.py \
        /tmp/queries_v1.json /tmp/baseline_v1.json
    docker cp <container>:/tmp/baseline_v1.json evaluation/baseline_v1.json
"""

import argparse
import json
import os
import sys
import time

try:
    import requests
except ImportError:
    print("ERROR: requests is required", file=sys.stderr)
    sys.exit(1)

DEFAULT_BASE = os.getenv("VECTOR_API", "http://localhost:7860")
DEFAULT_KEY = os.getenv("API_KEY", "CHANGE_THIS_TO_64_CHAR_SECRET")


def chunk_matches(chunk, expected_section):
    """Match against heading hierarchy, chunk text, and parent text."""
    expected = (expected_section or "").strip().lower()
    if not expected:
        return False

    meta = chunk.get("metadata") or {}
    hierarchy = meta.get("heading_hierarchy") or []
    if expected in " > ".join(hierarchy).lower():
        return True

    text = chunk.get("text") or ""
    if expected in text.lower():
        return True

    parent_text = meta.get("parent_text") or ""
    if expected in parent_text.lower():
        return True

    return False


def run_query(base, api_key, q):
    resp = requests.post(
        f"{base}/chunks",
        json={"query": q["query"], "top_k": 20},
        headers={"x-api-key": api_key},
        timeout=90,
    )
    resp.raise_for_status()
    payload = resp.json()
    return payload


def main():
    ap = argparse.ArgumentParser(description="Retrieval baseline evaluator")
    ap.add_argument("queries_file", help="Path to queries JSON (array of objects)")
    ap.add_argument("output_file", help="Path to write results JSON")
    ap.add_argument("--base-url", default=DEFAULT_BASE)
    ap.add_argument("--api-key", default=DEFAULT_KEY)
    args = ap.parse_args()

    with open(args.queries_file, encoding="utf-8") as f:
        queries = json.load(f)

    results = []
    summary_not_found = []

    for q in queries:
        qid = q.get("id", "?")
        expected = q.get("expected_section", "")
        try:
            payload = run_query(args.base_url, args.api_key, q)
        except Exception as exc:  # noqa: BLE001
            print(f"  ERROR {qid}: {exc}", file=sys.stderr)
            results.append({
                "id": qid,
                "query": q.get("query"),
                "expected_section": expected,
                "rank": None,
                "error": str(exc),
            })
            summary_not_found.append(qid)
            continue

        rank = None
        matched = None
        for i, chunk in enumerate(payload.get("chunks", [])):
            if chunk_matches(chunk, expected):
                rank = i + 1
                matched = chunk
                break

        meta = (matched or {}).get("metadata") or {}
        entry = {
            "id": qid,
            "query": q.get("query"),
            "expected_section": expected,
            "rank": rank,
            "matched_source": meta.get("source_file"),
            "matched_hierarchy": meta.get("heading_hierarchy"),
            "matched_id": (matched or {}).get("id"),
        }
        if matched:
            entry["snippet"] = ((matched.get("text") or "")[:120])
        results.append(entry)
        if rank is None:
            summary_not_found.append(qid)

        print(f"  {qid:24s} rank={rank}")

    found = [r for r in results if r["rank"] is not None]
    ranks = [r["rank"] for r in found]
    out = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "top_k": 20,
        "endpoint": f"{args.base_url}/chunks",
        "queries": results,
        "summary": {
            "total": len(results),
            "found": len(found),
            "not_found": summary_not_found,
            "avg_rank_found": round(sum(ranks) / len(ranks), 2) if ranks else None,
            "median_rank_found": sorted(ranks)[len(ranks) // 2] if ranks else None,
            "best_rank_found": min(ranks) if ranks else None,
        },
    }

    with open(args.output_file, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)

    print(f"\nSummary: {out['summary']}")
    return 0 if summary_not_found == [] else 0


if __name__ == "__main__":
    sys.exit(main())
