"""Chunk the 6-7 GS4_MPA013 ethics files by reading from their PA-optional disk originals.
These are byte-identical to optional/public-administration-optional/MPA-013_<handle>_<file>.
Register chunks under ethics/GS4_MPA013_... source_file so GS4 retrieval covers them.
"""
import os, sys, json, hashlib, traceback
from pathlib import Path
sys.path.insert(0, "/app"); os.environ.setdefault("R2_PREFIX","")
import ingest_hybrid as ih

PA_DIR = Path("/app/data/optional/public-administration-optional")
SUBJECT = "ethics"
GS_PAPER = "gs4"

# map GS4_MPA013 name -> PA disk filename (strip GS4_ prefix)
def chunks_from_pdf(path, fname, file_hash):
    rows=[]; batch=[]; texts=[]; gidx=0
    for rec in ih.read_pdf_pages(path):
        batch.append(rec); texts.append(rec["text"])
        if len(batch) >= ih.PDF_PAGE_BATCH_SIZE:
            for c in ih.chunk_text("\n\n".join(texts)):
                cid = hashlib.sha256(f"{file_hash}_{gidx}".encode()).hexdigest()
                rows.append((cid,c["chunk_text"],"general","medium",fname,file_hash,SUBJECT,gidx,0,1,
                             c["chunk_text"],json.dumps(c.get("heading_hierarchy",[])),c.get("parent_text",""),
                             c.get("is_parent_chunk",False),None,GS_PAPER))
                gidx+=1
            batch.clear(); texts.clear()
    if texts:
        for c in ih.chunk_text("\n\n".join(texts)):
            cid = hashlib.sha256(f"{file_hash}_{gidx}".encode()).hexdigest()
            rows.append((cid,c["chunk_text"],"general","medium",fname,file_hash,SUBJECT,gidx,0,1,
                         c["chunk_text"],json.dumps(c.get("heading_hierarchy",[])),c.get("parent_text",""),
                         c.get("is_parent_chunk",False),None,GS_PAPER))
            gidx+=1
    return rows

def insert_rows(rows):
    conn=ih.get_conn()
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
                ) ON CONFLICT (id, subject_id) DO UPDATE SET
                    chunk=EXCLUDED.chunk, source_file=EXCLUDED.source_file,
                    file_hash=EXCLUDED.file_hash, chunk_index=EXCLUDED.chunk_index,
                    gs_paper=EXCLUDED.gs_paper
            """, rows, page_size=200)
        conn.commit()
    finally:
        ih.release_conn(conn)

# list ethics docs that need chunks: GS4_MPA013 name not yet chunked
conn=ih.get_conn()
try:
    with conn.cursor() as cur:
        cur.execute("SELECT file_name FROM documents WHERE subject_id='ethics' AND file_name LIKE '%GS4_MPA013%'")
        ethics_names=[r[0] for r in cur.fetchall()]
finally:
    ih.release_conn(conn)

def hashed(p):
    h=hashlib.sha256()
    with open(p,"rb") as f:
        for c in iter(lambda:f.read(8192),b""): h.update(c)
    return h.hexdigest()

total=0
for ename in ethics_names:
    base=Path(ename).name                       # GS4_MPA013_..._Unit-20.pdf
    pa_name = base[len("GS4_MPA013_"):] if base.startswith("GS4_MPA013_") else base
    pa_disk=PA_DIR/pa_name
    if not pa_disk.exists():
        print("[missing-pa]", ename, "->", pa_disk); continue
    fname=ename
    # skip if already chunked
    conn=ih.get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM upsc_chunks WHERE source_file=%s",(fname,))
            if cur.fetchone()[0]>0:
                print("[already]", fname); continue
    finally:
        ih.release_conn(conn)
    try:
        fh=hashed(pa_disk)
        rows=chunks_from_pdf(pa_disk, fname, fh)
        if not rows:
            print("[no-chunks]", fname); continue
        insert_rows(rows)
        total+=len(rows)
        print(f"[ok] {fname} -> {len(rows)} chunks (cum {total})")
    except Exception as e:
        traceback.print_exc()
print("DONE MPA013 total:", total)
