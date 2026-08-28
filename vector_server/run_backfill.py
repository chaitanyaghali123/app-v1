import logging
import sys
import time

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
sys.path.insert(0, "/app")

import ingest_hybrid

TARGET_LIMIT = 9000
BATCH_LOG_EVERY = 200

total_attempted = 0
total_completed = 0
started = time.time()

while True:
    remaining = ingest_hybrid.count_unembedded_chunks()
    if remaining is None:
        remaining = 0
    if remaining <= 0:
        print(f"=== done: no unembedded chunks remain ({(time.time()-started)/60:.1f} min) ===", flush=True)
        sys.exit(0)

    limit = min(TARGET_LIMIT, remaining)
    print(f"=== backfill pass: {remaining} remaining, attempting {limit} ===", flush=True)

    attempted, completed = ingest_hybrid.backfill_embedding_embeds(limit=limit)

    total_attempted += attempted
    total_completed += completed

    print(
        f"=== pass finished: attempted={attempted} completed={completed} "
        f"total_completed={total_completed} elapsed={(time.time()-started)/60:.1f} min ===",
        flush=True,
    )

    if completed == 0 and attempted > 0:
        print("=== stopped: quota exhausted, will retry next window ===", flush=True)
        sys.exit(2)

    time.sleep(2)