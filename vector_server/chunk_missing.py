"""Chunk every registered document that has zero chunks yet (embedding NULL).

Runs fully offline (no Gemini). Skips rejects; safe to re-run; resumable.
Scanned image PDFs with no text layer fall back to tesseract OCR.
"""
import os, sys, json, hashlib, time, tempfile, shutil, io
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
sys.path.insert(0, "/app")
os.environ.setdefault("R2_PREFIX", "")
os.environ.setdefault("ENABLE_SOURCE_SAFETY_GATE", "false")
import ingest_hybrid as ih
import r2_store

DATA = Path("/app/data")
DOC_STATUS = os.getenv("DOC_STATUS", "indexed").strip()
WORKERS = int(os.getenv("CHUNK_WORKERS", "4"))
OCR_WORKERS = int(os.getenv("OCR_WORKERS", "1"))
ENABLE_OCR = os.getenv("ENABLE_OCR", "true").lower() == "true"
OCR_MIN_CHARS = int(os.getenv("OCR_MIN_CHARS", "200"))
OCR_DPI = int(os.getenv("OCR_DPI", "150"))
OCR_LANG = "eng"
OCR_CONFIG = "--psm 3"
OCR_SEM = __import__("threading").BoundedSemaphore(OCR_WORKERS)

def ocr_pdf(path):
    import fitz
    import pytesseract
    from PIL import Image
    doc = fitz.open(str(path))
    parts = []
    for i, page in enumerate(doc):
        pix = page.get_pixmap(dpi=OCR_DPI)
        img = Image.open(io.BytesIO(pix.tobytes("png")))
        txt = pytesseract.image_to_string(img, lang=OCR_LANG, config=OCR_CONFIG)
        parts.append(f"\n--- page {i+1} ---\n{txt}")
        if (i + 1) % 5 == 0:
            print(f"  ocr'd {i+1}/{doc.page_count} pages of {Path(path).name}", flush=True)
    return "\n".join(parts)

def sha256_hex(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for c in iter(lambda: f.read(8192), b""):
            h.update(c)
    return h.hexdigest()

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

def chunks_for_file(path, fname, fh, subj, gs):
    rows = []
    gidx = 0
    suffix = path.suffix.lower()
    if suffix == ".pdf":
        batch = []
        texts = []
        for rec in ih.read_pdf_pages(path):
            rec = dict(rec)
            batch.append(rec)
            texts.append(rec["text"])
            if len(batch) >= ih.PDF_PAGE_BATCH_SIZE:
                for c in ih.chunk_text("\n\n".join(texts)):
                    page = ih.infer_chunk_page_number(c["chunk_text"], batch) or 0
                    rows.append(row_tuple(c, fname, fh, subj, gs, gidx, page))
                    gidx += 1
                batch.clear()
                texts.clear()
        if texts:
            for c in ih.chunk_text("\n\n".join(texts)):
                page = ih.infer_chunk_page_number(c["chunk_text"], batch) or 0
                rows.append(row_tuple(c, fname, fh, subj, gs, gidx, page))
                gidx += 1
        if not rows and ENABLE_OCR:
            with OCR_SEM:
                rows = chunk_ocr_scan(path, fname, fh, subj, gs)
        elif not rows:
            print(f"  [needs-ocr] {Path(path).name}", flush=True)
    else:
        if suffix == ".txt":
            gen = ih.read_txt_blocks(path)
        else:
            gen = ih.read_docx_blocks(path)
        for block in gen:
            for c in ih.chunk_text(block["text"]):
                rows.append(row_tuple(c, fname, fh, subj, gs, gidx, 0))
                gidx += 1
    return rows

def chunk_ocr_scan(path, fname, fh, subj, gs):
    try:
        text = ocr_pdf(path)
    except Exception as e:
        print(f"  [ocr-error] {Path(path).name}: {type(e).__name__}: {e}", flush=True)
        return []
    cleaned = "\n".join(line for line in text.splitlines() if line.strip())
    if len(cleaned) < OCR_MIN_CHARS:
        print(f"  [low-ocr] {Path(path).name}: {len(cleaned)} chars", flush=True)
        return []
    rows = []
    gidx = 0
    for c in ih.chunk_text(cleaned):
        rows.append(row_tuple(c, fname, fh, subj, gs, gidx, 0))
        gidx += 1
    return rows

def insert_rows(rows):
    conn = ih.get_conn()
    try:
        with conn.cursor() as cur:
            from psycopg2.extras import execute_batch
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

def main():
    conn = ih.get_conn()
    try:
        with conn.cursor() as cur:
            if DOC_STATUS:
                cur.execute(
                    """
                    SELECT file_name, subject_id, file_hash
                    FROM documents
                    WHERE status=%s
                    ORDER BY subject_id, file_name
                    """,
                    (DOC_STATUS,),
                )
            else:
                cur.execute(
                    """
                    SELECT file_name, subject_id, file_hash
                    FROM documents
                    ORDER BY subject_id, file_name
                    """
                )
            docs = cur.fetchall()
    finally:
        ih.release_conn(conn)

    indexed_files = set()
    conn = ih.get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT DISTINCT source_file FROM upsc_chunks")
            indexed_files = {r[0] for r in cur.fetchall()}
    finally:
        ih.release_conn(conn)

    r2_remote = r2_store.list_r2_objects()

    todo = []
    max_files = int(os.getenv("MAX_FILES", "0"))
    for fname, subj, fh in docs:
        if fname in indexed_files:
            continue
        if max_files and len(todo) >= max_files:
            break
        base = Path(fname).name
        cands = [
            DATA / fname,
            DATA / subj / base,
            DATA / subj / base.lower(),
            DATA / "optional" / subj / base,
            DATA / "optional" / subj / base.lower(),
        ]
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
        gs = ih.folder_to_gs_paper(subj)
        todo.append((disk, fname, subj, gs, fh, mode, r2meta))

    print(
        f"to chunk: {len(todo)} files"
        + (f" (documents.status={DOC_STATUS})" if DOC_STATUS else ""),
        flush=True,
    )
    total_rows = 0
    t0 = time.time()
    ok = fail = 0
    lock = __import__("threading").Lock()

    def work(item):
        disk, fname, subj, gs, fh, mode, r2meta = item
        tmpfile = None
        try:
            if mode == "r2-temp":
                tmpfile = Path(tempfile.gettempdir()) / (hashlib.sha256(fname.encode()).hexdigest()[:24] + Path(fname).suffix.lower())
                r2_store.download_r2_object(r2meta["key"], str(tmpfile))
                disk = tmpfile
            if ih.classify_source(fname) == "reject":
                return ("reject", fname, 0, None)
            fh = fh or sha256_hex(disk)
            rows = chunks_for_file(disk, fname, fh, subj, gs)
            if not rows:
                return ("no-chunks", fname, 0, None)
            insert_rows(rows)
            return ("ok", fname, len(rows), None)
        except Exception as e:
            return ("error", fname, 0, str(e))
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
                    print(f"[no-chunks] {fname}", flush=True)
    print(f"DONE ok={ok} fail={fail} total_chunks={total_rows} elapsed={round(time.time()-t0,1)}s", flush=True)

if __name__ == "__main__":
    main()
