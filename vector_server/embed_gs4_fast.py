"""Aggressive GS4-only embed backfill. High concurrency, large batches, minimal sleep.
Runs until embedding IS NULL count for gs4 is 0.
"""
import os, sys, time
sys.path.insert(0, "/app")
os.environ.setdefault("R2_PREFIX", "")
os.environ.setdefault("GS_FILTER", "gs4")
os.environ.setdefault("EMBED_CONCURRENCY", "4")
os.environ.setdefault("EMBED_SUB_BATCH_SIZE", "50")
os.environ.setdefault("GEMINI_EMBED_BATCH", "50")
os.environ.setdefault("EMBED_BATCH_DELAY", "0")

import ingest_hybrid as ih

# force env into module values that were read at import
ih.EMBED_CONCURRENCY = 4
ih.EMBED_SUB_BATCH_SIZE = 50
ih.GEMINI_EMBED_BATCH = 50

BATCH = 200
started = time.time()
total_done = 0
quota_streak = 0

def remaining_count():
    conn = ih.get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM upsc_chunks WHERE embedding IS NULL AND gs_paper='gs4'")
            return cur.fetchone()[0]
    finally:
        ih.release_conn(conn)

def next_ids(limit):
    conn = ih.get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM upsc_chunks WHERE embedding IS NULL AND gs_paper='gs4' ORDER BY id LIMIT %s", (limit,))
            return [r[0] for r in cur.fetchall()]
    finally:
        ih.release_conn(conn)

# drain existing gs4, then repeat until OCR adds more; stop when both 0 and idle
started = time.time()
while True:
    remaining = remaining_count()
    print(f"remaining={remaining} elapsed={round((time.time()-started)/60,1)}min", flush=True)
    if remaining <= 0:
        # keep draining newly-OCR'd chunks; end after 3 consecutive empty cycles
        quota_streak += 1
        if quota_streak >= 3:
            print("=== DONE all gs4 embedded ===", flush=True); break
        time.sleep(10)
        continue
    quota_streak = 0
    ids = next_ids(min(BATCH, remaining))
    if not ids:
        time.sleep(5); continue
    attempted, completed = ih.backfill_embedding_embeds(chunk_ids=ids)
    total_done += completed
    print(f"attempted={attempted} completed={completed} total={total_done} remaining={max(remaining-completed,0)}", flush=True)
    time.sleep(3)
    if attempted > 0 and completed == 0:
        print("=== quota hard-stop; sleeping 180s ===", flush=True)
        time.sleep(180)
