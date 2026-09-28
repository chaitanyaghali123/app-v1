"""Gemini-OCR chunker for the 1,123 zero-chunk UPSC Mains docs.

Architecture: parent orchestrator + one subprocess per file.
  - Segfault in PyMuPDF text extraction on scanned PDFs kills ONLY the worker
    subprocess, never the parent. Parent detects the crash / "no-text" result
    and re-runs that file in OCR mode.
  - OCR: render pages at OCR_DPI, 5 pages/request (PAGES_PER_REQ), send inline
    PNG images to gemini-3.5-flash:generateContent with key rotation, chunk the
    returned text locally, insert with embedding NULL.

Usage (inside aryabhata-ingestor, /app):
  GEMINI_KEYS="k1,k2,k3" python /app/chunk_gemini_ocr.py
Optional env: MAX_FILES, DOC_STATUS, SOURCE=disk|r2|any, DPI, PAGES_PER_REQ,
              WORKERS, CHUNK_PAR, GEMINI_OCR_MODEL, OCR_MIN_CHARS.
Resumable: files already present in upsc_chunks are skipped.
"""
import os, sys, json, hashlib, time, tempfile, subprocess, traceback
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

sys.path.insert(0, "/app")
os.environ.setdefault("R2_PREFIX", "")
os.environ.setdefault("ENABLE_SOURCE_SAFETY_GATE", "false")

import ingest_hybrid as ih
import r2_store

DATA = Path("/app/data")
GO_KEYS = [k for k in os.getenv("GEMINI_KEYS", "").split(",") if k] or [
    os.getenv("GEMINI_API_KEY", "")
]
KEYS = [k for k in GO_KEYS if k]
MODEL = os.getenv("GEMINI_OCR_MODEL", "gemini-3.5-flash")
PAGES_PER_REQ = int(os.getenv("PAGES_PER_REQ", "5"))
OCR_DPI = int(os.getenv("OCR_DPI", "150"))
OCR_MIN_CHARS = int(os.getenv("OCR_MIN_CHARS", "200"))
WORKERS = int(os.getenv("WORKERS", "4"))
MAX_FILES = int(os.getenv("MAX_FILES", "0"))
DOC_STATUS = os.getenv("DOC_STATUS", "").strip()
SOURCE = os.getenv("SOURCE", "any").strip().lower()
RESUME_TABLE = os.getenv("CHUNK_TABLE", "upsc_chunks")
WORKER = Path("/app/chunk_ocr_worker.py")


# =====================================================================
# Worker subprocess script (crash-isolated)
# =====================================================================
WORKER_SRC = r'''
import os, sys, json, hashlib, time, re
import io, base64, requests
from pathlib import Path

sys.path.insert(0, "/app")
import ingest_hybrid as ih

KEYS = [k for k in os.getenv("GEMINI_API_KEY", "").split(",") if k]
MODEL = os.getenv("GEMINI_OCR_MODEL", "gemini-3.5-flash")
PAGES_PER_REQ = int(os.getenv("PAGES_PER_REQ", "5"))
OCR_DPI = int(os.getenv("OCR_DPI", "150"))
OCR_MIN_CHARS = int(os.getenv("OCR_MIN_CHARS", "200"))
TABLE = os.getenv("CHUNK_TABLE", "upsc_chunks")
URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
_api_idx = 0


def row_tuple(c, fname, fh, subj, gs, gidx, page):
    return (
        hashlib.sha256(f"{fh}_{gidx}".encode()).hexdigest(),
        c["chunk_text"],
        ih.detect_topic(c["chunk_text"]),
        ih.detect_difficulty(c["chunk_text"]),
        fname, fh, subj, gidx, page, 1,
        c["chunk_text"],
        json.dumps(c.get("heading_hierarchy", [])),
        c.get("parent_text", ""),
        c.get("is_parent_chunk", False),
        None,
        gs,
    )


def insert_rows(rows):
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


def _rotate_key():
    global _api_idx
    if not KEYS:
        return None
    k = KEYS[_api_idx % len(KEYS)]
    _api_idx += 1
    return k


def gemini_ocr_blocks(path):
    """Yield (start_page_1based, text) per PAGES_PER_REQ block."""
    import fitz
    doc = fitz.open(str(path))
    n = doc.page_count
    for s in range(0, n, PAGES_PER_REQ):
        e = min(s + PAGES_PER_REQ, n)
        parts = []
        for pno in range(s, e):
            pix = doc[pno].get_pixmap(dpi=OCR_DPI)
            b64 = base64.b64encode(pix.tobytes("png")).decode()
            parts.append({"inline_data": {"mime_type": "image/png", "data": b64}})
            parts.append({"text": f"\n--- BEGIN PAGE {pno+1} ---"})
        parts.append({
            "text": "Extract ALL text from every page above verbatim. Preserve "
                    "question numbering and layout. Keep the '--- BEGIN PAGE N ---' "
                    "markers. Output plain text."
        })
        body = {"contents": [{"parts": parts}]}
        text = None
        last_err = "no keys"
        for attempt in range(len(KEYS) or 1):
            key = _rotate_key()
            if not key:
                break
            try:
                r = requests.post(
                    URL.format(model=MODEL) + "?key=" + key,
                    json=body, timeout=180,
                )
                if r.status_code == 200:
                    j = r.json()
                    cands = j.get("candidates") or []
                    if cands:
                        pts = (cands[0].get("content") or {}).get("parts") or []
                        text = "".join(p.get("text", "") for p in pts)
                    break
                last_err = f"http{r.status_code}"
                if r.status_code == 429:
                    time.sleep(4)
                    continue
                if r.status_code in (400, 403, 404):
                    break
            except Exception as e:
                last_err = f"{type(e).__name__}: {e}"
                time.sleep(2)
        if text and len(text.strip()) >= OCR_MIN_CHARS:
            page = " ".join(p.split()[0] for p in text.splitlines() if "/" in p)
            yield s + 1, text
    doc.close()


def chunk_rows_from_text(text, fname, fh, subj, gs, gidx_start, page):
    rows = []
    gidx = gidx_start
    for c in ih.chunk_text(text):
        rows.append(row_tuple(c, fname, fh, subj, gs, gidx, page))
        gidx += 1
    return rows


def main():
    payload = json.loads(sys.argv[1])
    path, fname, subj, gs, fh, mode = (
        payload["path"], payload["fname"], payload["subj"],
        payload["gs"], payload["fh"], payload.get("mode", "auto"),
    )
    path = Path(path)
    result = {"status": "no-text", "chunks": 0, "detail": ""}
    # ---- fast path: real text extraction (may segfault -> caught by parent)
    if mode == "auto":
        try:
            texts = []
            if path.suffix.lower() == ".pdf":
                for rec in ih.read_pdf_pages(path):
                    texts.append(rec["text"])
            elif path.suffix.lower() == ".txt":
                for block in ih.read_txt_blocks(path):
                    texts.append(block["text"])
            else:
                for block in ih.read_docx_blocks(path):
                    texts.append(block["text"])
            full = "\n\n".join(texts)
            if len(full.strip()) >= OCR_MIN_CHARS:
                rows = chunk_rows_from_text(full, fname, fh, subj, gs, 0, 0)
                if rows:
                    insert_rows(rows)
                    result = {"status": "ok-text", "chunks": len(rows), "detail": ""}
                    print(json.dumps(result), flush=True)
                    return
            result["detail"] = f"low text: {len(full.strip())} chars"
        except Exception as e:
            result["detail"] = f"{type(e).__name__}: {e}"
        print(json.dumps(result), flush=True)
        return
    # ---- OCR path
    if mode == "ocr":
        try:
            total = 0
            gidx = 0
            try:
                if path.suffix.lower() == ".txt":
                    full = []
                    for block in ih.read_txt_blocks(path):
                        full.append(block["text"])
                    rows = chunk_rows_from_text("\n\n".join(full), fname, fh, subj, gs, 0, 0)
                    if rows:
                        insert_rows(rows)
                        total = len(rows)
                    st = "ok-text" if total else "no-chunks"
                    print(json.dumps({"status": st, "chunks": total, "detail": ""}), flush=True)
                    return
            except Exception:
                pass
            for page, text in gemini_ocr_blocks(path):
                rows = chunk_rows_from_text(text, fname, fh, subj, gs, gidx, page)
                if rows:
                    insert_rows(rows)
                    total += len(rows)
                    gidx = total
                print(f"  ocr block p{page}: {len(text)} chars -> {len(rows)} rows", flush=True)
            result = {"status": "ok-ocr" if total else "no-chunks", "chunks": total, "detail": ""}
        except Exception as e:
            result = {"status": "error", "chunks": 0,
                      "detail": f"{type(e).__name__}: {e}\n{traceback.format_exc()}"}
        print(json.dumps(result), flush=True)


if __name__ == "__main__":
    main()
'''


def ensure_worker():
    if not WORKER.exists() or os.getenv("FORCE_REWRITE_WORKER", "0") == "1":
        WORKER.write_text(WORKER_SRC, encoding="utf-8")
    # also verify the worker file that will actually be spawned
    if not Path("/app/chunk_ocr_worker.py").exists():
        Path("/app/chunk_ocr_worker.py").write_text(WORKER_SRC, encoding="utf-8")


# =====================================================================
# Parent orchestrator
# =====================================================================

def sha256_hex(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for c in iter(lambda: f.read(8192), b""):
            h.update(c)
    return h.hexdigest()


def classify_guard(fname):
    try:
        return ih.classify_source(fname) == "reject"
    except Exception:
        return False


def run_worker(fname, path, subj, gs, fh, mode, timeout=1200):
    payload = {"path": str(path), "fname": fname, "subj": subj,
               "gs": gs, "fh": fh, "mode": mode}
    env = dict(os.environ)
    env["GEMINI_API_KEY"] = ",".join(KEYS)
    env["GEMINI_OCR_MODEL"] = MODEL
    env["PAGES_PER_REQ"] = str(PAGES_PER_REQ)
    env["OCR_DPI"] = str(OCR_DPI)
    env["OCR_MIN_CHARS"] = str(OCR_MIN_CHARS)
    env["CHUNK_TABLE"] = RESUME_TABLE
    t0 = time.time()
    try:
        cp = subprocess.run(
            [sys.executable, str(WORKER), json.dumps(payload, ensure_ascii=False)],
            capture_output=True, text=True, env=env, timeout=timeout,
        )
        rc = cp.returncode
        detail = (cp.stdout or "")[-2000:] + (cp.stderr or "")[-2000:]
    except subprocess.TimeoutExpired:
        return {"status": "timeout", "chunks": 0, "detail": f"{time.time()-t0:.0f}s", "rc": -1}
    if rc < 0:
        return {"status": "segfault", "chunks": 0, "detail": f"rc={rc}", "rc": rc}
    res = None
    for line in reversed((cp.stdout or "").splitlines()):
        line = line.strip()
        if line.startswith("{"):
            try:
                res = json.loads(line)
                break
            except Exception:
                continue
    if res is None:
        return {"status": "no-json", "chunks": 0, "detail": detail, "rc": rc}
    res["rc"] = rc
    return res


def main():
    ensure_worker()
    conn = ih.get_conn()
    try:
        with conn.cursor() as cur:
            if DOC_STATUS:
                q = """SELECT file_name, subject_id, file_hash FROM documents
                       WHERE status=%s ORDER BY subject_id, file_name"""
                cur.execute(q, (DOC_STATUS,))
            else:
                cur.execute("""SELECT file_name, subject_id, file_hash
                               FROM documents ORDER BY subject_id, file_name""")
            docs = cur.fetchall()
    finally:
        ih.release_conn(conn)

    conn = ih.get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(f"SELECT DISTINCT source_file FROM {RESUME_TABLE}")
            indexed_files = {r[0] for r in cur.fetchall()}
    finally:
        ih.release_conn(conn)

    r2_remote = r2_store.list_r2_objects()

    todo = []
    for fname, subj, fh in docs:
        if fname in indexed_files:
            continue
        if MAX_FILES and len(todo) >= MAX_FILES:
            break
        base = Path(fname).name
        cands = [DATA / fname, DATA / subj / base, DATA / subj / base.lower(),
                 DATA / "optional" / subj / base, DATA / "optional" / subj / base.lower()]
        disk = next((p for p in cands if p.exists()), None)
        if disk is not None:
            mode = "disk"
            r2meta = None
        else:
            rel = f"{subj}/{base}" if subj else f"general/{base}"
            r2meta = r2_remote.get(rel)
            if r2meta is None:
                if subj == "ethics" and (DATA / "ethics" / "ethics" / base).exists():
                    disk = DATA / "ethics" / "ethics" / base
                    mode = "disk"
                else:
                    print("[skip-no-source]", fname, flush=True)
                    continue
            else:
                disk = None
                mode = "r2-temp"
        if SOURCE == "disk" and mode != "disk":
            continue
        if SOURCE == "r2" and mode != "r2-temp":
            continue
        gs = ih.folder_to_gs_paper(subj)
        todo.append((disk, fname, subj, gs, fh, mode, r2meta))

    print(f"to chunk: {len(todo)} files (mode={SOURCE})", flush=True)
    t0 = time.time()
    ok = fail = 0
    total_rows = 0
    lock = __import__("threading").Lock()

    def work(item):
        disk, fname, subj, gs, fh, mode, r2meta = item
        tmpfile = None
        result = None
        try:
            if classify_guard(fname):
                return ("reject", fname, 0, None)
            if mode == "r2-temp":
                tmpfile = Path(tempfile.gettempdir()) / (
                    hashlib.sha256(fname.encode()).hexdigest()[:24]
                    + Path(fname).suffix.lower()
                )
                r2_store.download_r2_object(r2meta["key"], str(tmpfile))
                disk = tmpfile
            if not fh:
                fh = sha256_hex(disk)
            result = run_worker(fname, disk, subj, gs, fh, "auto")
            n = result.get("chunks", 0)
            st = result.get("status", "error")
            if st == "no-chunks":
                # text present but nothing chunked (tiny stub) - do not OCR it
                return ("no-chunks", fname, 0, str(result.get("detail", ""))[:200])
            if st in ("no-text", "segfault", "no-json", "timeout", "error"):
                result3 = run_worker(fname, disk, subj, gs, fh, "ocr")
                n3 = result3.get("chunks", 0)
                detail = result3.get("detail", "")
                st = result3.get("status", "error")
                result = {"status": st, "chunks": n3, "detail": detail,
                          "first": result.get("status") + ": " + str(result.get("detail", ""))[:200]}
            status = result.get("status", "error")
            if status == "ok-text":
                return ("ok", fname, result.get("chunks", 0), None)
            if status == "ok-ocr":
                return ("ok", fname, result.get("chunks", 0), None)
            if status == "no-chunks":
                return ("no-chunks", fname, 0, result.get("detail"))
            return ("error", fname, 0, json.dumps(result)[:500])
        except Exception as e:
            return ("error", fname, 0, f"{type(e).__name__}: {e}")
        finally:
            if mode == "r2-temp" and tmpfile is not None:
                try:
                    tmpfile.unlink(missing_ok=True)
                except Exception:
                    pass

    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        futures = {ex.submit(work, t): t[1] for t in todo}
        for fut in as_completed(futures):
            status, fname, n, err = fut.result()
            if status == "ok":
                ok += 1
                total_rows += n
                with lock:
                    print(f"[ok] {fname} -> {n} (cum {total_rows})", flush=True)
            elif status == "error":
                fail += 1
                with lock:
                    print(f"[error] {fname}: {err}", flush=True)
            elif status == "reject":
                with lock:
                    print(f"[reject] {fname}", flush=True)
            else:
                with lock:
                    print(f"[no-chunks] {fname}: {err}", flush=True)
    print(f"DONE ok={ok} fail={fail} total_chunks={total_rows} "
          f"elapsed={round(time.time()-t0,1)}s", flush=True)


if __name__ == "__main__":
    main()