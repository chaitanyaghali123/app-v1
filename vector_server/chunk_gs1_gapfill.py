"""Chunk the newly-added GS1 gap-fill PDFs (history/ + society/) into upsc_chunks
with gs_paper='gs1' and embedding NULL (embedding deferred to avoid Gemini quota).
"""
import os, sys, json, hashlib
from pathlib import Path
sys.path.insert(0, "/app")
os.environ.setdefault("R2_PREFIX", "")
import ingest_hybrid as ih

GS_PAPER = "gs1"

def sha256_hex(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for c in iter(lambda: f.read(8192), b""): h.update(c)
    return h.hexdigest()

def already_chunked(fname):
    conn = ih.get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM upsc_chunks WHERE source_file=%s", (fname,))
            return cur.fetchone()[0] > 0
    finally:
        ih.release_conn(conn)

def chunks_for_file(path, fname, file_hash, subject):
    all_rows = []
    batch = []
    texts = []
    gidx = 0
    for rec in ih.read_pdf_pages(path):
        batch.append(rec)
        texts.append(rec["text"])
        if len(batch) >= ih.PDF_PAGE_BATCH_SIZE:
            chunked = ih.chunk_text("\n\n".join(texts))
            for c in chunked:
                cid = hashlib.sha256(f"{file_hash}_{gidx}".encode()).hexdigest()
                all_rows.append((
                    cid, c["chunk_text"], "general", "medium",
                    fname, file_hash, subject, gidx, 0, 1,
                    c["chunk_text"],
                    json.dumps(c.get("heading_hierarchy", [])),
                    c.get("parent_text", ""),
                    c.get("is_parent_chunk", False),
                    None,
                    GS_PAPER,
                ))
                gidx += 1
            batch.clear()
            texts.clear()
    if texts:
        chunked = ih.chunk_text("\n\n".join(texts))
        for c in chunked:
            cid = hashlib.sha256(f"{file_hash}_{gidx}".encode()).hexdigest()
            all_rows.append((
                cid, c["chunk_text"], "general", "medium",
                fname, file_hash, subject, gidx, 0, 1,
                c["chunk_text"],
                json.dumps(c.get("heading_hierarchy", [])),
                c.get("parent_text", ""),
                c.get("is_parent_chunk", False),
                None,
                GS_PAPER,
            ))
            gidx += 1
    return all_rows

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
            cur.execute(
                "SELECT file_name FROM documents WHERE subject_id IN ('history','society') "
                "AND (file_name LIKE 'history/NIOS%' OR file_name LIKE 'society/NIOS%' "
                "OR file_name = 'history/NCERT_Class12_Politics_in_India_Since_Independence.pdf')")
            names = [r[0] for r in cur.fetchall()]
    finally:
        ih.release_conn(conn)

    todo = []
    for name in names:
        subdir, base = name.split("/", 1)
        disk = Path("/app/data") / subdir / base
        if not disk.exists():
            print("[skip-missing]", name); continue
        if already_chunked(name):
            print("[already]", name); continue
        todo.append((disk, name, subdir))

    print(f"to chunk: {len(todo)} files", flush=True)
    total = 0
    for disk, fname, subject in todo:
        try:
            fh = sha256_hex(disk)
            rows = chunks_for_file(disk, fname, fh, subject)
            if not rows:
                print("[no-chunks]", fname); continue
            insert_rows(rows)
            total += len(rows)
            print(f"[ok] {fname} -> {len(rows)} chunks (cum {total})", flush=True)
        except Exception as e:
            print(f"[error] {fname}: {e}", flush=True)
    print("DONE total new chunks:", total, flush=True)

if __name__ == "__main__":
    main()
