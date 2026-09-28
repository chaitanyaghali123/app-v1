"""Tesseract-OCR chunking for the three old-NCERT history books whose scan text
layers are too poor for read_pdf_pages. Deletes existing 1-chunk rows for the
same files before re-ingesting, mirroring chunk_persistent_worker logic.
"""
import sys, os, io, json, hashlib, time

sys.path.insert(0, "/app")
os.environ.setdefault("R2_PREFIX", "")
import ingest_hybrid as ih

OCR_DPI = 200
OCR_MIN_CHARS = 200

BOOKS = [
    "prelims/history-art-culture/Old_NCERT_Ancient_India_RS_Sharma.pdf",
    "prelims/history-art-culture/Old_NCERT_Medieval_India_Satish_Chandra.pdf",
    "prelims/history-art-culture/Old_NCERT_Modern_India_Bipan_Chandra.pdf",
]


def sha256_hex(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for c in iter(lambda: f.read(8192), b""):
            h.update(c)
    return h.hexdigest()


def doc_hash(rel):
    conn = ih.get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT file_hash, subject_id FROM documents WHERE file_name=%s", (rel,))
            r = cur.fetchone()
            return (r[0], r[1]) if r else (sha256_hex("/app/data/" + rel), "history")
    finally:
        ih.release_conn(conn)


def table_for(path):
    import fitz
    from PIL import Image
    import pytesseract

    doc = fitz.open(path)
    pages = []
    for i, page in enumerate(doc):
        pix = page.get_pixmap(dpi=OCR_DPI)
        img = Image.open(io.BytesIO(pix.tobytes("png")))
        txt = pytesseract.image_to_string(img, lang="eng", config="--psm 3")
        pages.append((i + 1, txt))
        if (i + 1) % 25 == 0:
            print(f"[{Path(path).name}] tesseract {i+1}/{doc.page_count}", flush=True)
    doc.close()
    return pages


from pathlib import Path


def insert_rows(rows):
    if not rows:
        return 0
    import psycopg2
    from psycopg2.extras import execute_batch

    conn = ih.get_conn()
    try:
        with conn.cursor() as cur:
            execute_batch(
                cur,
                """INSERT INTO upsc_chunks (
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
                    gs_paper=EXCLUDED.gs_paper""",
                rows,
                page_size=200,
            )
        conn.commit()
    finally:
        ih.release_conn(conn)
    return len(rows)


total = 0
for rel in BOOKS:
    path = "/app/data/" + rel
    fh, subj = doc_hash(rel)
    gs = ih.folder_to_gs_paper(subj)

    conn = ih.get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM upsc_chunks WHERE file_hash=%s", (fh,))
        conn.commit()
        n = cur.rowcount
    finally:
        ih.release_conn(conn)
    print(f"[reset] {rel} removed {n} old chunks", flush=True)

    gidx = 0
    t0 = time.time()
    for pageno, text in table_for(path):
        cleaned = "\n".join(l for l in (text or "").splitlines() if l.strip())
        if len(cleaned) < OCR_MIN_CHARS:
            continue
        rows = []
        for c in ih.chunk_text(cleaned):
            rows.append(
                (
                    hashlib.sha256(f"{fh}_{gidx}".encode()).hexdigest(),
                    c["chunk_text"],
                    ih.detect_topic(c["chunk_text"]),
                    ih.detect_difficulty(c["chunk_text"]),
                    rel, fh, subj, gidx, pageno, 1, c["chunk_text"],
                    json.dumps(c.get("heading_hierarchy", [])),
                    c.get("parent_text", ""), c.get("is_parent_chunk", False),
                    None, gs,
                )
            )
            gidx += 1
        if rows:
            insert_rows(rows)
    print(
        f"[done] {rel} -> {gidx} chunks elapsed={round(time.time()-t0,1)}s",
        flush=True,
    )
    total += gidx

print(f"OCR DONE total={total}", flush=True)