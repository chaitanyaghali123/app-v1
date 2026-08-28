import logging
import sys
import time

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
sys.path.insert(0, "/app")

import ingest_hybrid

BATCH = 8
DELAY = 20          # between batches
QUOTA_SLEEP = 300   # on quota-exhausted, wait before retrying
IDLE_SLEEP = 30

started = time.time()
total_completed = 0

while True:
    remaining = ingest_hybrid.count_unembedded_chunks() or 0
    if remaining <= 0:
        print(f"=== DONE: all chunks embedded ({(time.time()-started)/60:.1f} min) ===", flush=True)
        sys.exit(0)

    attempted, completed = ingest_hybrid.backfill_embedding_embeds(limit=BATCH)
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