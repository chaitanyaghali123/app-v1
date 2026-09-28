import concurrent.futures
import threading
from pathlib import Path

import ingest_hybrid

DATA_DIR = Path("/app/data")
FOLDERS = ["gs1", "gs2", "gs3", "essay"]
PREFIXES = ("UPSC_GS", "UPSC_Essay_PYP")

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
    files = []
    for folder in FOLDERS:
        d = DATA_DIR / folder
        if not d.exists():
            print(f"missing folder: {folder}", flush=True)
            continue
        for f in sorted(d.glob("*.pdf")):
            if f.name.startswith(PREFIXES):
                files.append(f)
    total = len(files)
    print(f"files to process: {total}", flush=True)

    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex:
        futs = [ex.submit(process_one, f) for f in files]
        for i, fut in enumerate(concurrent.futures.as_completed(futs), 1):
            if i % 5 == 0 or i == total:
                with counter_lock:
                    cur = dict(progress)
                print(f"progress {i}/{total} ok={cur['done']} failed={cur['failed']}", flush=True)

    with counter_lock:
        final = dict(progress)
    print(f"COMPLETE total={total} ok={final['done']} failed={final['failed']}", flush=True)

if __name__ == "__main__":
    main()