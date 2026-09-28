#!/usr/bin/env python
"""Bulk-chunk every prelims/ R2 object into prelims_chunks (standalone prelims corpus).

- Downloads missing files from R2 into /app/data/prelims/<folder>/<name>.
- source_file = 'prelims/<folder>/<name>' (matches existing prelims rows).
- Uses chunk_gemini_ocr worker (crash-isolated) with auto text extraction and
  Gemini-OCR fallback for scanned PDFs; key rotation; no documents-table use.
- Skips files that already have rows in prelims_chunks.

Usage (in aryabhata-ingestor):
  CHUNK_TABLE=prelims_chunks python /app/prelims_full_chunk.py
"""
import os, sys, json, hashlib, time, tempfile
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

sys.path.insert(0, "/app")
os.environ.setdefault("R2_PREFIX", "")
os.environ.setdefault("ENABLE_SOURCE_SAFETY_GATE", "false")
os.environ.setdefault("GEMINI_OCR_MODEL", "gemini-3.5-flash")
os.environ.setdefault("CHUNK_TABLE", "prelims_chunks")

import ingest_hybrid as ih
import r2_store
import chunk_gemini_ocr as go

DATA = Path("/app/data")
PRELIMS = DATA / "prelims"
WORKERS = int(os.getenv("WORKERS", "6"))

FOLDER_SUBJECT = {
    "economy": "economy",
    "environment-ecology": "environment",
    "geography": "geography",
    "history-art-culture": "history",
    "polity-governance": "polity",
    "science-tech": "science-tech",
    "current-affairs": "current-affairs",
    "constitution": "constitution",
    "paper-ii-csat": "csat",
}

EXCLUDE_KEYS = {"prelims/society/"}

ALLOWED = {".txt", ".pdf", ".docx"}


def excluded(key: str, name: str) -> bool:
    if any(key.startswith(p) for p in EXCLUDE_KEYS):
        return True
    base = Path(name).name
    if base.startswith("News_") or "test_embed_check" in base:
        return True
    return False


def sha256_hex(p: Path) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def main():
    import boto3
    from collections import Counter

    s = os.environ
    endpoint = (s.get("R2_ENDPOINT_URL") or "").strip()
    if not endpoint and s.get("R2_ACCOUNT_ID"):
        endpoint = f"https://{s['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com"
    cli = boto3.client(
        "s3", endpoint_url=endpoint,
        aws_access_key_id=s["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=s["R2_SECRET_ACCESS_KEY"],
    )
    bucket = s["R2_BUCKET"]
    keys = []
    paginator = cli.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=bucket, Prefix="prelims/"):
        for o in page.get("Contents") or []:
            k = o["Key"]
            if "." in Path(k).suffix.lower() and Path(k).suffix.lower() in ALLOWED:
                keys.append((k, o["Size"]))
    print(f"prelims R2 objects (allowed ext): {len(keys)}", flush=True)

    conn = ih.get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT DISTINCT source_file FROM prelims_chunks")
            existing = {r[0] for r in cur.fetchall()}
    finally:
        ih.release_conn(conn)
    print(f"already indexed in prelims_chunks: {len(existing)}", flush=True)

    go.ensure_worker()

    todo = []
    for key, size in keys:
        if excluded(key, key.split("/", 2)[-1] if len(key.split("/")) > 2 else ""):
            print(f"[skip-excluded] {key}", flush=True)
            continue
        parts = key.split("/")
        folder = parts[1]
        name = "/".join(parts[2:])
        subj = FOLDER_SUBJECT.get(folder)
        if not subj:
            print(f"[skip-folder] {key}", flush=True)
            continue
        rel = f"{folder}/{name}"
        src = f"prelims/{rel}"
        if src in existing:
            continue
        local = PRELIMS / rel
        todo.append((key, local, src, subj))

    print(f"to chunk: {len(todo)}", flush=True)
    lock = __import__("threading").Lock()
    ok = fail = skip_no_chunks = 0
    total_rows = 0

    def work(item):
        key, local, src, subj = item
        try:
            if not local.exists() or local.stat().st_size == 0:
                r2_store.download_r2_object(key, str(local))
            fh = sha256_hex(local)
            gs = ih.folder_to_gs_paper(subj)
            res = go.run_worker(src, str(local), subj, gs, fh, "auto", timeout=1800)
            st = res.get("status", "error")
            n = res.get("chunks", 0)
            if st in ("no-text", "segfault", "no-json", "timeout", "error"):
                res2 = go.run_worker(src, str(local), subj, gs, fh, "ocr", timeout=3600)
                st = res2.get("status", "error")
                n = res2.get("chunks", 0)
            return (st, src, n, str(res.get("detail", ""))[:150])
        except Exception as e:
            return ("error", src, 0, f"{type(e).__name__}: {e}")

    t0 = time.time()
    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        futures = {ex.submit(work, t): t[1] for t in todo}
        for fut in as_completed(futures):
            st, src, n, detail = fut.result()
            if st in ("ok-text", "ok-ocr", "ok-ocr-gemini", "ok-ocr-tesseract"):
                ok += 1
                total_rows += n
            elif st == "no-chunks":
                skip_no_chunks += 1
            else:
                fail += 1
            with lock:
                print(f"[{st}] {src} -> {n} |{detail}", flush=True)

    print(f"DONE ok={ok} no_chunks={skip_no_chunks} fail={fail} "
          f"total_chunks={total_rows} elapsed={round(time.time()-t0,1)}s", flush=True)


if __name__ == "__main__":
    main()