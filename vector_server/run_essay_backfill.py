import logging
import sys
import time

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
sys.path.insert(0, "/app")

from essay_kb import backfill_embeds, count_unembedded

TARGET_LIMIT = 9000

total_completed = 0
started = time.time()

while True:
    remaining = count_unembedded()
    if remaining <= 0:
        print(f"=== done: all essay entries embedded ({(time.time()-started)/60:.1f} min) ===", flush=True)
        sys.exit(0)

    limit = min(TARGET_LIMIT, remaining)
    print(f"=== essay backfill pass: {remaining} remaining, attempting {limit} ===", flush=True)

    attempted, completed = backfill_embeds(limit=limit)
    total_completed += completed

    print(
        f"=== essay pass finished: attempted={attempted} completed={completed} "
        f"total_completed={total_completed} elapsed={(time.time()-started)/60:.1f} min ===",
        flush=True,
    )

    if completed == 0 and attempted > 0:
        print("=== stopped: quota exhausted, will retry next window ===", flush=True)
        sys.exit(2)

    time.sleep(2)
