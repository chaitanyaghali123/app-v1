"""Force Gemini-OCR chunking for the 3 old-NCERT history books using the
proven chunk_gemini_ocr worker (mode=ocr, key rotation). Deletes the previous
1-chunk rows from the poor text extraction before re-OCR.
"""
import os, sys, time
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

sys.path.insert(0, "/app")
os.environ.setdefault("R2_PREFIX", "")
os.environ["GEMINI_OCR_MODEL"] = "gemini-3.5-flash"
os.environ["FORCE_REWRITE_WORKER"] = "1"
os.environ["OCR_DPI"] = "200"
os.environ.setdefault("CHUNK_TABLE", "upsc_chunks")
TABLE = os.getenv("CHUNK_TABLE", "upsc_chunks")
os.environ.setdefault("OCR_DPI", "150")
os.environ.setdefault("PAGES_PER_REQ", "5")
os.environ.setdefault("OCR_MIN_CHARS", "200")

import ingest_hybrid as ih
import chunk_gemini_ocr as go

BOOKS = [
    "prelims/history-art-culture/Old_NCERT_Ancient_India_RS_Sharma.pdf",
    "prelims/history-art-culture/Old_NCERT_Medieval_India_Satish_Chandra.pdf",
    "prelims/history-art-culture/Old_NCERT_Modern_India_Bipan_Chandra.pdf",
]


def doc_info(rel):
    conn = ih.get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT file_hash, subject_id FROM documents WHERE file_name=%s", (rel,))
            r = cur.fetchone()
            return r if r else (go.sha256_hex("/app/data/" + rel), "history")
    finally:
        ih.release_conn(conn)


def reset_chunks(fh, rel):
    conn = ih.get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(f"DELETE FROM {TABLE} WHERE file_hash=%s", (fh,))
            n = cur.rowcount
        conn.commit()
    finally:
        ih.release_conn(conn)
    print(f"[reset] {rel} removed {n} old chunks (hash {fh[:12]})", flush=True)


def run_one(rel, timeout=3600):
    fh, subj = doc_info(rel)
    reset_chunks(fh, rel)
    path = "/app/data/" + rel
    gs = ih.folder_to_gs_paper(subj)
    t0 = time.time()
    res = go.run_worker(rel, path, subj, gs, fh, "ocr", timeout=timeout)
    res["file"] = rel
    res["hash"] = fh[:12]
    res["elapsed"] = round(time.time() - t0, 1)
    return res


go.ensure_worker()
print(f"keys loaded: {len(go.KEYS)} model={go.MODEL} dpi={go.OCR_DPI} ppq={go.PAGES_PER_REQ}", flush=True)

results = []
with ThreadPoolExecutor(max_workers=3) as ex:
    futures = {ex.submit(run_one, rel): rel for rel in BOOKS}
    for fut in as_completed(futures):
        rel = futures[fut]
        try:
            r = fut.result()
            results.append(r)
            st = r.get("status", "?")
            ch = r.get("chunks", 0)
            rc = r.get("rc", "?")
            print(f"[res] {rel} status={st} chunks={ch} rc={rc} elapsed={r.get('elapsed')}s detail={str(r.get('detail',''))[:120]}", flush=True)
        except Exception as e:
            print(f"[res] {rel} EXC {type(e).__name__}: {e}", flush=True)

tot = sum(r.get("chunks", 0) for r in results)
print(f"GEMINI OCR DONE files={len(results)} total_chunks={tot}", flush=True)