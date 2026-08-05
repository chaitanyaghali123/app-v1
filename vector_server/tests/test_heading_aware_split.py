#!/usr/bin/env python3
"""Regression tests for the heading-aware Phase 3 chunk splitter.

Runs statelessly against `ingest_hybrid.chunk_text` using the fixtures in
./fixtures. No database access.

The splitter constants are monkeypatched to small values so the compact
fixtures exercise the full algorithm (heading-aware boundary splitting,
greedy merge, paragraph/sentence/token fallback, hierarchy assignment,
reconstruction) deterministically.

Usage:
    docker exec aryabhata-ingestor python /app/tests/test_heading_aware_split.py
"""

import os
import re
import sys
import difflib

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import ingest_hybrid as ih

ih.CHUNK_SIZE = 150
ih.CHUNK_OVERLAP = 40
ih.CHUNK_SIZE_TOLERANT = int(round(ih.CHUNK_SIZE * (1.0 + ih.CHUNK_SIZE_TOLERANCE)))

FIXTURES = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures")

failures = []
checks = 0


def check(name, cond, detail=""):
    global checks
    checks += 1
    if cond:
        print(f"  PASS  {name}")
    else:
        print(f"  FAIL  {name} {detail}")
        failures.append(name)


def load(name):
    with open(os.path.join(FIXTURES, name), encoding="utf-8") as f:
        return f.read()


def body(text):
    """Strip the [Context: ...] prefix that _prefix_headings adds."""
    return re.sub(r"^\[Context:[^\]]*\]\s*", "", text)


def normalize(text):
    return re.sub(r"\s+", " ", text).strip()


def greedy_assemble(bodies):
    if not bodies:
        return ""
    full = normalize(bodies[0])
    for nxt in bodies[1:]:
        nxt = normalize(nxt)
        if not nxt:
            continue
        best = 0
        limit = min(len(full), len(nxt))
        for k in range(limit, 0, -1):
            if full.endswith(nxt[:k]):
                best = k
                break
        full += nxt[best:]
    return full


def within_tolerance(chunk):
    return ih.token_count(chunk["chunk_text"]) <= ih.CHUNK_SIZE_TOLERANT + 1


SUB_HEADINGS = ("Geomorphology", "Climatology", "Hydrology", "Human Geography")

print("== heading_aware.md ==")
chunks = ih.chunk_text(load("heading_aware.md"))
check("produced chunks", len(chunks) >= 6, f"(got {len(chunks)})")
check("has parent chunks", any(c["is_parent_chunk"] for c in chunks))
check("all chunks within tolerant bound", all(within_tolerance(c) for c in chunks))

hier_set = set()
for c in chunks:
    hier_set.update(c["heading_hierarchy"])
for sub in SUB_HEADINGS:
    check(f"hierarchy mentions {sub}", sub in hier_set)

# A chunk labelled with a sub-heading must carry that heading in its own
# leading text (heading-aware split must not mislabel content).
for c in chunks:
    last = c["heading_hierarchy"][-1] if c["heading_hierarchy"] else ""
    if last in SUB_HEADINGS:
        lead = normalize(body(c["chunk_text"]))[:60].lower()
        ok = last.lower() in lead
        check(f"child {last} carries its heading", ok, f"(lead={lead[:40]!r})")

# Reconstruction: assembling child bodies must recover each parent text.
groups = {}
for c in chunks:
    groups.setdefault(c["parent_text"], []).append(c)
check("parent groups match", len(groups) >= 3, f"(got {len(groups)})")
for ptxt, group in groups.items():
    assembled = greedy_assemble([body(c["chunk_text"]) for c in group])
    ratio = difflib.SequenceMatcher(None, normalize(ptxt), assembled).ratio()
    check(f"reconstruct parent ({len(group)} chunks)", ratio >= 0.9, f"(ratio={ratio:.3f})")

print("== no_headings.md ==")
chunks2 = ih.chunk_text(load("no_headings.md"))
check("produced chunks", len(chunks2) >= 10, f"(got {len(chunks2)})")
check("no context prefix (no headings)", all("[Context:" not in c["chunk_text"] for c in chunks2))
check("no heading hierarchy", all(not c["heading_hierarchy"] for c in chunks2))
check("all chunks within tolerant bound", all(within_tolerance(c) for c in chunks2))
assembled2 = greedy_assemble([body(c["chunk_text"]) for c in chunks2])
ratio2 = difflib.SequenceMatcher(None, normalize(load("no_headings.md")), assembled2).ratio()
check("reconstruct no-headings doc", ratio2 >= 0.85, f"(ratio={ratio2:.3f})")

print("== upsc_style.md ==")
chunks3 = ih.chunk_text(load("upsc_style.md"))
check("produced chunks", len(chunks3) >= 5, f"(got {len(chunks3)})")
hier3 = set()
for c in chunks3:
    hier3.update(c["heading_hierarchy"])
for sub in ("Parliament", "Rajya Sabha", "Lok Sabha",
            "Speaker of the Lok Sabha", "Parliamentary Committees"):
    check(f"hierarchy mentions {sub}", sub in hier3)
# "Sessions of Parliament" is small, so it merges under the "Speaker of the
# Lok Sabha" parent; its content must still survive in the chunk text.
check("sessions content preserved", any(
    "Sessions of Parliament" in c["chunk_text"] for c in chunks3
))
assembled3 = greedy_assemble([body(c["chunk_text"]) for c in chunks3])
ratio3 = difflib.SequenceMatcher(None, normalize(load("upsc_style.md")), assembled3).ratio()
check("reconstruct upsc doc", ratio3 >= 0.85, f"(ratio={ratio3:.3f})")

print(f"\n{checks} checks, {len(failures)} failures")
sys.exit(1 if failures else 0)
