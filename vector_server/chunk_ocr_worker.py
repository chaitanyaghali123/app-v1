
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
