
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
            execute_batch(cur, """
                INSERT INTO upsc_chunks (
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
            """, rows, page_size=200)
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
