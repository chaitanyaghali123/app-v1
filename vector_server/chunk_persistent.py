"""Persistent-worker chunker with tesseract fallback.

Architecture:
  - Parent spawns N persistent worker processes (import once, ~12s startup).
  - Parent feeds file paths via stdin (JSON line per file).
  - Worker for each file: subprocess-read_pdf_pages (segfault isolated) → if
    no text → tesseract OCR → chunk_text → insert. When Gemini keys are
    available, Gemini OCR is tried first (higher quality), tesseract is fallback.
  - Output: one JSON result per line per file.

Usage (inside aryabhata-ingestor, /app):
  python /app/chunk_persistent.py
Usage (inside aryabhata-ingestor, /app):
  python /app/chunk_persistent.py
Env: GEMINI_KEYS (comma-sep), SOURCE=disk|r2|any, WORKERS, MAX_FILES, OCR_DPI,
      OCR_ENGINE=auto|tesseract|gemini, SUBJECTS=comma,separated (filter).
"""
import os, sys, json, hashlib, time, tempfile, subprocess, traceback, io
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

sys.path.insert(0, "/app")
os.environ.setdefault("R2_PREFIX", "")
os.environ.setdefault("ENABLE_SOURCE_SAFETY_GATE", "false")

import ingest_hybrid as ih
import r2_store

DATA = Path("/app/data")
WORKERS = int(os.getenv("WORKERS", "4"))
MAX_FILES = int(os.getenv("MAX_FILES", "0"))
DOC_STATUS = os.getenv("DOC_STATUS", "").strip()
SOURCE = os.getenv("SOURCE", "any").strip().lower()
OCR_DPI = int(os.getenv("OCR_DPI", "150"))
OCR_ENGINE = os.getenv("OCR_ENGINE", "auto").strip().lower()
OCR_MIN_CHARS = int(os.getenv("OCR_MIN_CHARS", "200"))
PAGES_PER_REQ = int(os.getenv("PAGES_PER_REQ", "5"))
GO_KEYS = [k for k in os.getenv("GEMINI_KEYS", "").split(",") if k] or [
    os.getenv("GEMINI_API_KEY", "")
]
KEYS = [k for k in GO_KEYS if k]
GEMINI_MODEL = os.getenv("GEMINI_OCR_MODEL", "gemini-3.5-flash")
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
TABLE = os.getenv("CHUNK_TABLE", "upsc_chunks")

WORKER_SRC = r'''
import os, sys, json, hashlib, time, io, base64, re
from pathlib import Path
sys.path.insert(0, "/app")
os.environ.setdefault("R2_PREFIX", "")
os.environ.setdefault("ENABLE_SOURCE_SAFETY_GATE", "false")
import ingest_hybrid as ih

OCR_DPI = int(os.getenv("OCR_DPI", "150"))
OCR_MIN_CHARS = int(os.getenv("OCR_MIN_CHARS", "200"))
PAGES_PER_REQ = int(os.getenv("PAGES_PER_REQ", "5"))
OCR_ENGINE = os.getenv("OCR_ENGINE", "auto").strip().lower()
TABLE = os.getenv("CHUNK_TABLE", "upsc_chunks")
GEMINI_KEYS = [k for k in os.getenv("GEMINI_KEYS", "").split(",") if k]
GEMINI_MODEL = os.getenv("GEMINI_OCR_MODEL", "gemini-3.5-flash")
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
_gemini_idx = 0


def row_tuple(c, fname, fh, subj, gs, gidx, page):
    return (
        hashlib.sha256(f"{fh}_{gidx}".encode()).hexdigest(),
        c["chunk_text"], ih.detect_topic(c["chunk_text"]),
        ih.detect_difficulty(c["chunk_text"]),
        fname, fh, subj, gidx, page, 1, c["chunk_text"],
        json.dumps(c.get("heading_hierarchy", [])),
        c.get("parent_text", ""), c.get("is_parent_chunk", False),
        None, gs,
    )


def insert_rows(rows):
    if not rows:
        return
    import psycopg2
    from psycopg2.extras import execute_batch
    conn = ih.get_conn()
    try:
        with conn.cursor() as cur:
            sql = f"""
                INSERT INTO {TABLE} (
                    id, chunk, topic, difficulty, source_file, file_hash,
                    subject_id, chunk_index, page_number, chunk_version, embedding,
                    search_vector, heading_hierarchy, parent_chunk, is_parent_chunk,
                    diagram_url, gs_paper
                ) VALUES (
                    %s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NULL::halfvec,
                    to_tsvector('english', %s), %s::jsonb, %s, %s, %s, %s
                )
                ON CONFLICT (id, subject_id)
                DO UPDATE SET chunk=EXCLUDED.chunk, source_file=EXCLUDED.source_file,
                    file_hash=EXCLUDED.file_hash, chunk_index=EXCLUDED.chunk_index,
                    gs_paper=EXCLUDED.gs_paper
            """
            execute_batch(cur, sql, rows, page_size=200)
        conn.commit()
    finally:
        ih.release_conn(conn)


def chunk_rows_from_text(text, fname, fh, subj, gs, gidx_start, page):
    rows = []
    gidx = gidx_start
    for c in ih.chunk_text(text):
        rows.append(row_tuple(c, fname, fh, subj, gs, gidx, page))
        gidx += 1
    return rows


def read_text_fast(path):
    """Try local text extraction in a subprocess (segfault safe)."""
    import subprocess as _sp
    _worker = os.environ.get("_PARENT_WORKER", "/app/chunk_persistent.py")
    _code = (
        "import sys,json; sys.path.insert(0,\"/app\"); "
        "os_=\"os\"; exec(f\"import {os_}\"); "
        f"p={repr(str(path))}; "
        "import ingest_hybrid as ih; from pathlib import Path; "
        "p=Path(p); "
        "texts=[]; "
        "suffix=p.suffix.lower(); "
        "gen=ih.read_pdf_pages(p) if suffix=='.pdf' else (ih.read_txt_blocks(p) if suffix=='.txt' else ih.read_docx_blocks(p))\n"
        "for rec in gen:\n"
        "    texts.append(rec['text'] if isinstance(rec,dict) else rec.get('text',''))\n"
        "print(json.dumps({'text':'\\n\\n'.join(texts)}))"
    )
    try:
        cp = _sp.run([sys.executable, "-c", _code], capture_output=True, text=True, timeout=120)
        if cp.returncode < 0:
            raise RuntimeError(f"segfault rc={cp.returncode}")
        for line in reversed(cp.stdout.splitlines()):
            line = line.strip()
            if line.startswith("{"):
                return json.loads(line).get("text", "")
        return ""
    except _sp.TimeoutExpired:
        raise RuntimeError("timeout")


def tesseract_ocr(path):
    """Local tesseract OCR for all pages."""
    import fitz
    import pytesseract
    from PIL import Image
    doc = fitz.open(str(path))
    parts = []
    for i, page in enumerate(doc):
        pix = page.get_pixmap(dpi=OCR_DPI)
        img = Image.open(io.BytesIO(pix.tobytes("png")))
        txt = pytesseract.image_to_string(img, lang="eng", config="--psm 3")
        parts.append((i + 1, txt))
        if (i + 1) % 10 == 0:
            print(json.dumps({"_log": f"tesseract {i+1}/{doc.page_count} pages"}), flush=True)
    return parts


def gemini_ocr_blocks(path):
    """Gemini vision OCR, 5 pages per request."""
    global _gemini_idx
    import requests, fitz
    doc = fitz.open(str(path))
    n = doc.page_count
    results = []
    for s in range(0, n, PAGES_PER_REQ):
        e = min(s + PAGES_PER_REQ, n)
        parts = []
        for pno in range(s, e):
            pix = doc[pno].get_pixmap(dpi=OCR_DPI)
            b64 = base64.b64encode(pix.tobytes("png")).decode()
            parts.append({"inline_data": {"mime_type": "image/png", "data": b64}})
            parts.append({"text": f"\n--- BEGIN PAGE {pno+1} ---"})
        parts.append({"text": "Extract ALL text from every page above verbatim. "
                              "Preserve question numbering and layout. "
                              "Keep the '--- BEGIN PAGE N ---' markers. Output plain text."})
        body = {"contents": [{"parts": parts}]}
        text = None
        for attempt in range(len(GEMINI_KEYS) or 1):
            key = GEMINI_KEYS[_gemini_idx % len(GEMINI_KEYS)] if GEMINI_KEYS else None
            _gemini_idx += 1
            if not key:
                break
            try:
                r = requests.post(GEMINI_URL.format(model=GEMINI_MODEL) + "?key=" + key,
                                  json=body, timeout=120)
                if r.status_code == 200:
                    j = r.json()
                    cands = j.get("candidates") or []
                    if cands:
                        pts = (cands[0].get("content") or {}).get("parts") or []
                        text = "".join(p.get("text", "") for p in pts)
                    break
                if r.status_code == 429:
                    time.sleep(3)
                    continue
            except Exception:
                time.sleep(2)
        if text and text.strip():
            results.append((s + 1, text))
    return results


def process_file(payload):
    path = payload["path"]
    fname = payload["fname"]
    subj = payload["subj"]
    gs = payload["gs"]
    fh = payload["fh"]
    mode = payload.get("mode", "auto")
    engine = payload.get("engine", OCR_ENGINE)

    total = 0
    gidx = 0

    # --- mode=auto: try local text extraction via subprocess ---
    if mode == "auto":
        try:
            text = read_text_fast(path)
            if len(text.strip()) >= OCR_MIN_CHARS:
                rows = chunk_rows_from_text(text, fname, fh, subj, gs, 0, 0)
                if rows:
                    insert_rows(rows)
                    print(json.dumps({"status": "ok-text", "chunks": len(rows), "file": fname}), flush=True)
                    return
            print(json.dumps({"status": "no-text", "chunks": 0, "file": fname,
                              "chars": len(text.strip())}), flush=True)
        except Exception as e:
            print(json.dumps({"status": "segfault", "chunks": 0, "file": fname,
                              "err": f"{type(e).__name__}"}), flush=True)
        return

    # --- mode=ocr: try Gemini first, fallback to tesseract ---
    if mode == "ocr":
        # 1) Try Gemini OCR if keys available
        if engine in ("auto", "gemini") and GEMINI_KEYS:
            try:
                blocks = gemini_ocr_blocks(path)
                for pageno, text in blocks:
                    rows = chunk_rows_from_text(text, fname, fh, subj, gs, gidx, pageno)
                    if rows:
                        insert_rows(rows)
                        total += len(rows)
                        gidx = total
                if total:
                    print(json.dumps({"status": "ok-ocr-gemini", "chunks": total, "file": fname}), flush=True)
                    return
            except Exception as e:
                print(json.dumps({"_log": f"gemini ocr failed: {e}"}), flush=True)

        # 2) Fallback to tesseract
        if engine in ("auto", "tesseract"):
            try:
                blocks = tesseract_ocr(path)
                for pageno, text in blocks:
                    cleaned = "\n".join(l for l in text.splitlines() if l.strip())
                    if len(cleaned) >= OCR_MIN_CHARS:
                        rows = chunk_rows_from_text(cleaned, fname, fh, subj, gs, gidx, pageno)
                        if rows:
                            insert_rows(rows)
                            total += len(rows)
                            gidx = total
                if total:
                    print(json.dumps({"status": "ok-ocr-tesseract", "chunks": total, "file": fname}), flush=True)
                    return
            except Exception as e:
                print(json.dumps({"_log": f"tesseract ocr failed: {e}"}), flush=True)

        print(json.dumps({"status": "no-chunks", "chunks": 0, "file": fname}), flush=True)


def main():
    import select
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            payload = json.loads(line)
            process_file(payload)
        except Exception as e:
            print(json.dumps({"status": "error", "chunks": 0, "file": "",
                              "err": f"{type(e).__name__}: {e}"}), flush=True)


if __name__ == "__main__":
    main()
'''


# =====================================================================
# Parent
# =====================================================================

def ensure_worker():
    Path("/app/chunk_persistent_worker.py").write_text(WORKER_SRC, encoding="utf-8")


def sha256_hex(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for c in iter(lambda: f.read(8192), b""):
            h.update(c)
    return h.hexdigest()


def build_todo():
    conn = ih.get_conn()
    try:
        with conn.cursor() as cur:
            if DOC_STATUS:
                cur.execute("SELECT file_name, subject_id, file_hash FROM documents WHERE status=%s ORDER BY subject_id, file_name", (DOC_STATUS,))
            else:
                cur.execute("SELECT file_name, subject_id, file_hash FROM documents ORDER BY subject_id, file_name")
            docs = cur.fetchall()
    finally:
        ih.release_conn(conn)

    conn = ih.get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(f"SELECT DISTINCT source_file FROM {TABLE}")
            indexed_files = {r[0] for r in cur.fetchall()}
    finally:
        ih.release_conn(conn)

    r2_remote = r2_store.list_r2_objects()
    subj_filter = set(s.strip() for s in os.getenv("SUBJECTS", "").split(",") if s.strip())
    todo = []
    for fname, subj, fh in docs:
        if fname in indexed_files:
            continue
        if subj_filter and subj not in subj_filter:
            continue
        if MAX_FILES and len(todo) >= MAX_FILES:
            break
        base = Path(fname).name
        cands = [DATA/fname, DATA/(subj or "")/base, DATA/(subj or "")/base.lower(),
                 DATA/"optional"/(subj or "")/base, DATA/"optional"/(subj or "")/base.lower()]
        disk = next((p for p in cands if p.exists()), None)
        if disk is not None:
            mode, r2meta = "disk", None
        else:
            rel = f"{subj}/{base}" if subj else f"general/{base}"
            r2meta = r2_remote.get(rel)
            if r2meta is None:
                print("[skip-no-source]", fname, flush=True)
                continue
            disk, mode = None, "r2-temp"
        if SOURCE == "disk" and mode != "disk":
            continue
        if SOURCE == "r2" and mode != "r2-temp":
            continue
        gs = ih.folder_to_gs_paper(subj)
        todo.append((disk, fname, subj, gs, fh, mode, r2meta))
    return todo


def run_persistent_worker(worker_id, items, results):
    """Run one persistent worker, feed items, collect results."""
    env = dict(os.environ)
    env["GEMINI_API_KEY"] = ",".join(KEYS)
    env["OCR_DPI"] = str(OCR_DPI)
    env["OCR_ENGINE"] = OCR_ENGINE
    env["OCR_MIN_CHARS"] = str(OCR_MIN_CHARS)
    env["PAGES_PER_REQ"] = str(PAGES_PER_REQ)

    proc = subprocess.Popen(
        [sys.executable, "/app/chunk_persistent_worker.py"],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        env=env, text=True, bufsize=1,
    )

    sent = 0
    received = 0
    pending_items = list(items)
    idx = 0

    def writer():
        nonlocal sent
        for payload in pending_items:
            line = json.dumps(payload, ensure_ascii=False)
            try:
                proc.stdin.write(line + "\n")
                proc.stdin.flush()
                sent += 1
            except Exception:
                break
        try:
            proc.stdin.close()
        except Exception:
            pass

    import threading
    writer_thread = threading.Thread(target=writer, daemon=True)
    writer_thread.start()

    for line in proc.stdout:
        line = line.strip()
        if not line:
            continue
        try:
            r = json.loads(line)
        except Exception:
            continue
        if r.get("_log"):
            print(f"[w{worker_id}] {r['_log']}", flush=True)
            continue
        results.append(r)
        received += 1
        st = r.get("status", "?")
        ch = r.get("chunks", 0)
        fn = r.get("file", "")
        if st.startswith("ok"):
            print(f"[w{worker_id}] {st} {fn} -> {ch}", flush=True)

    writer_thread.join(timeout=5)
    try:
        proc.wait(timeout=30)
    except Exception:
        proc.kill()
    print(f"[w{worker_id}] done sent={sent} received={received}", flush=True)


def main():
    ensure_worker()
    todo = build_todo()
    print(f"to chunk: {len(todo)} files", flush=True)

    tmpfiles = {}
    real_todo = []
    for disk, fname, subj, gs, fh, mode, r2meta in todo:
        tmpfile = None
        if mode == "r2-temp":
            tmpfile = Path(tempfile.gettempdir()) / (hashlib.sha256(fname.encode()).hexdigest()[:24] + Path(fname).suffix.lower())
            r2_store.download_r2_object(r2meta["key"], str(tmpfile))
            tmpfiles[fname] = tmpfile
            disk = tmpfile
        if not fh and disk:
            fh = sha256_hex(disk)
        real_todo.append({"path": str(disk) if disk else "", "fname": fname,
                          "subj": subj, "gs": gs, "fh": fh, "mode": "auto"})

    t0 = time.time()
    results = []
    n_workers = min(WORKERS, max(1, len(real_todo)))
    chunk_size = max(1, len(real_todo) // n_workers)
    worker_items = []
    for i in range(n_workers):
        start = i * chunk_size
        end = start + chunk_size if i < n_workers - 1 else len(real_todo)
        worker_items.append(real_todo[start:end])

    with ThreadPoolExecutor(max_workers=n_workers) as pool:
        futures = [pool.submit(run_persistent_worker, i, items, results)
                   for i, items in enumerate(worker_items)]
        for f in as_completed(futures):
            try:
                f.result(timeout=10)
            except Exception as e:
                print(f"[worker-error] {e}", flush=True)

    ok = fail = no_chunks = 0
    total_chunks = 0
    need_ocr_retry = []
    for r in results:
        st = r.get("status", "error")
        ch = r.get("chunks", 0)
        fn = r.get("file", "")
        if st.startswith("ok"):
            ok += 1
            total_chunks += ch
        elif st == "no-chunks":
            no_chunks += 1
        elif st in ("no-text", "segfault", "segfault-exit"):
            need_ocr_retry.append(fn)
        else:
            fail += 1

    for tmp in tmpfiles.values():
        try:
            tmp.unlink(missing_ok=True)
        except Exception:
            pass

    print(f"PASS1 ok={ok} fail={fail} no-chunks={no_chunks} need-ocr-retry={len(need_ocr_retry)} "
          f"total_chunks={total_chunks} elapsed={round(time.time()-t0,1)}s", flush=True)

    if need_ocr_retry:
        print(f"Starting OCR pass for {len(need_ocr_retry)} segfaulted files...", flush=True)
        ocr_todo = []
        for item in real_todo:
            if item["fname"] in need_ocr_retry:
                item["mode"] = "ocr"
                ocr_todo.append(item)
        results2 = []
        n_w2 = min(WORKERS, max(1, len(ocr_todo)))
        cs2 = max(1, len(ocr_todo) // n_w2)
        wi2 = []
        for i in range(n_w2):
            s = i * cs2
            e = s + cs2 if i < n_w2 - 1 else len(ocr_todo)
            wi2.append(ocr_todo[s:e])
        with ThreadPoolExecutor(max_workers=n_w2) as pool:
            futures = [pool.submit(run_persistent_worker, i, items, results2)
                       for i, items in enumerate(wi2)]
            for f in as_completed(futures):
                try:
                    f.result(timeout=10)
                except Exception:
                    pass
        for r in results2:
            st = r.get("status", "error")
            ch = r.get("chunks", 0)
            fn = r.get("file", "")
            if st.startswith("ok"):
                ok += 1
                total_chunks += ch
            elif st == "no-chunks":
                no_chunks += 1
            else:
                fail += 1
        print(f"PASS2 total ok={ok} fail={fail} no-chunks={no_chunks} "
              f"total_chunks={total_chunks} elapsed={round(time.time()-t0,1)}s", flush=True)


if __name__ == "__main__":
    main()