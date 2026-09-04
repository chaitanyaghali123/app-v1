import logging
import os
import sys
import time

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
sys.path.insert(0, "/app")

import ingest_hybrid as ingest_hybrid

BATCH = 8
DELAY = 20          # between batches
QUOTA_SLEEP = 300   # on quota-exhausted, wait before retrying
IDLE_SLEEP = 30
GS_FILTER = (os.getenv("GS_FILTER") or "").strip() or None

started = time.time()
total_completed = 0


def remaining_count():
    conn = ingest_hybrid.get_conn()
    try:
        with conn.cursor() as cur:
            if GS_FILTER:
                cur.execute(
                    "SELECT COUNT(*) FROM upsc_chunks WHERE embedding IS NULL AND gs_paper = %s",
                    (GS_FILTER,),
                )
            else:
                cur.execute("SELECT COUNT(*) FROM upsc_chunks WHERE embedding IS NULL")
            row = cur.fetchone()
            return row[0] if row else 0
    finally:
        ingest_hybrid.release_conn(conn)


def next_ids(limit):
    conn = ingest_hybrid.get_conn()
    try:
        with conn.cursor() as cur:
            if GS_FILTER:
                cur.execute(
                    "SELECT id FROM upsc_chunks "
                    "WHERE embedding IS NULL AND gs_paper = %s "
                    "ORDER BY id LIMIT %s",
                    (GS_FILTER, limit),
                )
            else:
                cur.execute(
                    "SELECT id FROM upsc_chunks "
                    "WHERE embedding IS NULL ORDER BY id LIMIT %s",
                    (limit,),
                )
            return [r[0] for r in cur.fetchall()]
    finally:
        ingest_hybrid.release_conn(conn)


while True:
    remaining = remaining_count()
    if remaining <= 0:
        print(f"=== DONE: all{' ' + GS_FILTER if GS_FILTER else ''} chunks embedded ({(time.time()-started)/60:.1f} min) ===", flush=True)
        sys.exit(0)

    ids = next_ids(BATCH)
    if not ids:
        print(f"=== DONE: scope{' ' + GS_FILTER if GS_FILTER else ''} empty ({(time.time()-started)/60:.1f} min) ===", flush=True)
        sys.exit(0)

    attempted, completed = ingest_hybrid.backfill_embedding_embeds(chunk_ids=ids)
    total_completed += completed

    print(
        f"attempted={attempted} completed={completed} total={total_completed} "
        f"remaining={max(remaining - completed, 0)} elapsed={(time.time()-started)/60:.1f}min",
        flush=True,
    )

    if attempted > 0 and completed == 0:
        print(f"=== quota exhausted; sleeping {QUOTA_SLEEP}s then retrying ===", flush=True)
        time.sleep(QUOTA_SLEEP)
        continue

    time.sleep(DELAY)