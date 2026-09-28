import concurrent.futures
import threading
from pathlib import Path

import ingest_hybrid

DATA_DIR = Path("/app/data")
SUBJECT_DIR = DATA_DIR / "environment"

counter_lock = threading.Lock()
progress = {"done": 0, "failed": 0}

def process_one(f):
    try:
        ingest_hybrid.process_file(f)
        with counter_lock:
            progress["done"] += 1
    except Exception as e:
        with counter_lock:
            progress["failed"] += 1
        print(f"[FAIL] {f.name}: {e}", flush=True)

def main():
    ingest_hybrid.root_folder = DATA_DIR
    ingest_hybrid.ensure_tables()
    files = sorted(SUBJECT_DIR.glob("*.*"))
    total = len(files)
    print(f"files to process: {total}", flush=True)

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as ex:
        futs = [ex.submit(process_one, f) for f in files]
        done_count = 0
        for fut in concurrent.futures.as_completed(futs):
            done_count += 1
            if done_count % 1 == 0 or done_count == total:
                with counter_lock:
                    cur = dict(progress)
                print(f"progress {done_count}/{total} ok={cur['done']} failed={cur['failed']}", flush=True)

    with counter_lock:
        final = dict(progress)
    print(f"COMPLETE total={total} ok={final['done']} failed={final['failed']}", flush=True)

if __name__ == "__main__":
    main()