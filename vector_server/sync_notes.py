"""Swap the 3 updated PRELUDE notes: upload new content to R2, replace the
document rows (+ delete old chunks), and re-chunk the new note text."""
import sys, os, hashlib, json
from pathlib import Path

sys.path.insert(0, "/app")
os.environ.setdefault("R2_PREFIX", "")
import r2_store, ingest_hybrid as ih

TABLE = os.getenv("CHUNK_TABLE", "upsc_chunks")

FILES = [
    "prelims/polity-governance/PRELUDE_note_missing_sources.txt",
    "prelims/history-art-culture/PRELUDE_note_missing_sources.txt",
    "prelims/science-tech/PRELUDE_note_missing_sources.txt",
]

CANON = {
    "polity-governance": "polity",
    "history-art-culture": "history",
    "science-tech": "science-tech",
}


def chunk_and_insert(txt, rel, fh, subj):
    gs = ih.folder_to_gs_paper(subj)
    import psycopg2
    from psycopg2.extras import execute_batch

    rows = []
    gidx = 0
    for c in ih.chunk_text(txt):
        rows.append(
            (
                hashlib.sha256(f"{fh}_{gidx}".encode()).hexdigest(),
                c["chunk_text"],
                ih.detect_topic(c["chunk_text"]),
                ih.detect_difficulty(c["chunk_text"]),
                rel, fh, subj, gidx, 0, 1, c["chunk_text"],
                "[]", None, False, None, gs,
            )
        )
        gidx += 1
    if not rows:
        return 0
    conn = ih.get_conn()
    try:
        with conn.cursor() as cur:
            execute_batch(
                cur,
                f"""INSERT INTO {TABLE} (
                    id, chunk, topic, difficulty, source_file, file_hash,
                    subject_id, chunk_index, page_number, chunk_version, embedding,
                    search_vector, heading_hierarchy, parent_chunk, is_parent_chunk,
                    diagram_url, gs_paper
                ) VALUES (
                    %s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NULL::halfvec,
                    to_tsvector('english', %s), %s::jsonb, %s, %s, %s, %s
                )
                ON CONFLICT (id, subject_id) DO UPDATE SET chunk=EXCLUDED.chunk""",
                rows,
                page_size=200,
            )
        conn.commit()
    finally:
        ih.release_conn(conn)
    return len(rows)


for rel in FILES:
    local = Path("/app/data") / rel
    data = local.read_bytes()
    fh = hashlib.sha256(data).hexdigest()
    subj = CANON[rel.split("/")[1]]

    conn = ih.get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT file_hash FROM documents WHERE file_name=%s", (rel,))
            old = cur.fetchone()
            if old and old[0] != fh:
                cur.execute(f"DELETE FROM {TABLE} WHERE file_hash=%s", (old[0],))
                cur.execute("DELETE FROM documents WHERE file_hash=%s", (old[0],))
        conn.commit()
    finally:
        ih.release_conn(conn)

    r2_store.upload_r2_object(rel, str(local))

    conn = ih.get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO documents (file_hash,file_name,subject_id,status) "
                "VALUES (%s,%s,%s,'indexed') ON CONFLICT (file_hash) DO UPDATE "
                "SET file_name=EXCLUDED.file_name,subject_id=EXCLUDED.subject_id,"
                "status='indexed',error_message=NULL,updated_at=NOW()",
                (fh, rel, subj),
            )
        conn.commit()
    finally:
        ih.release_conn(conn)

    n = chunk_and_insert(data.decode("utf-8", "replace"), rel, fh, subj)
    print(f"[ok] {rel} hash={fh[:12]} chunks={n}", flush=True)

print("NOTE SYNC DONE", flush=True)