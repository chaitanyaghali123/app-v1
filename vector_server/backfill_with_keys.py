"""Drain all upsc_chunks rows with NULL embedding, rotating across the
configured Gemini API keys (GEMINI_API_KEYS + GEMINI_API_KEY).

Run inside the ingestor container:
    docker exec aryabhata-ingestor python /app/backfill_with_keys.py
"""

import sys
import time

sys.path.insert(0, "/app")

import ingest_hybrid as ih


def main():
    keys = ih.GEMINI_API_KEYS
    batch = int(
        __import__("os").getenv(
            "BACKFILL_LIMIT",
            str(ih.EMBED_SUB_BATCH_SIZE),  # one batch per round
        )
    )
    # Tables to drain, in order. Default: mains then prelims.
    targets = [
        t.strip()
        for t in __import__("os").getenv("BACKFILL_TABLES", "upsc_chunks,prelims_chunks").split(",")
        if t.strip()
    ]

    print(f"API keys loaded: {len(keys)}")
    print(f"Concurrency: {ih.EMBED_CONCURRENCY} | sub-batch: {ih.EMBED_SUB_BATCH_SIZE}")
    print(f"Per-call limit: {batch}")
    print(f"Tables: {targets}")

    start = time.time()
    total_completed = 0
    round_no = 0
    idle_rounds = 0
    table_idx = 0
    while True:
        table = targets[table_idx]
        remaining = ih.count_unembedded_chunks(table=table)
        if remaining == 0:
            if table_idx + 1 < len(targets):
                table_idx += 1
                idle_rounds = 0
                continue
            print("DONE: 0 chunks remaining")
            break

        round_no += 1
        attempted, completed = ih.backfill_embedding_embeds(limit=batch, table=table)
        total_completed += completed
        elapsed = time.time() - start
        rate = total_completed / elapsed if elapsed > 0 else 0
        after = ih.count_unembedded_chunks(table=table)
        print(
            f"[round {round_no}] table={table} attempted={attempted} completed={completed} "
            f"remaining={after} elapsed={elapsed:.0f}s rate={rate:.1f}/s "
            f"keys_left={ih.gemini_keys_available()}/{len(keys)}"
        )

        if completed == 0:
            idle_rounds += 1
            if idle_rounds >= 6:
                # Daily per-key quota exhausted: stop hammering and wait for
                # the next reset window (midnight Pacific ~ 12:30 PM IST).
                print(
                    f"[{time.strftime('%H:%M:%S')}] 6+ zero rounds: keys "
                    f"daily-capped. Sleeping 30 min before retry."
                )
                time.sleep(1800)
                idle_rounds = 0
                continue
            # Sleep adaptively until at least one key leaves cooldown.
            waited = 0
            while ih.gemini_keys_available() == 0:
                if waited % 60 == 0:
                    print(
                        f"[round {round_no}] waiting for key cooldown "
                        f"(waited {waited}s)..."
                    )
                time.sleep(10)
                waited += 10
        else:
            idle_rounds = 0

    print(f"TOTAL embedded this run: {total_completed}")


if __name__ == "__main__":
    main()
