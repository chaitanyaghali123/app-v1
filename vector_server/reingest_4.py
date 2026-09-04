import os, sys, time
os.environ['EMBED_OFFLINE'] = 'true'
os.environ['EMBED_DEFER_ON_QUOTA'] = 'true'
os.environ['ENABLE_VISUAL_VERBALIZATION'] = 'false'
sys.path.insert(0, '/app')
from pathlib import Path
import ingest_hybrid as ih

ih.root_folder = Path('/app/data/gs2')
BASE = Path('/app/data/gs2')

def count_chunks(fh):
    conn = ih.get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM upsc_chunks WHERE file_hash=%s", (fh,))
            return cur.fetchone()[0]
    finally:
        ih.release_conn(conn)

rows = [
    ('disaster-management/NDMA_Drought.pdf', 'NDMA_Drought.pdf'),
    ('disaster-management/NDMA_GLOF.pdf', 'NDMA_GLOF.pdf'),
    ('culture/NIOS223_Lesson12_English.pdf', 'NIOS223_Lesson12_English.pdf'),
]

for rel, bare in rows:
    fp = BASE / rel
    fh = ih.file_checksum(fp)
    # wipe old bare-name records + documents row
    conn = ih.get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT DISTINCT file_hash FROM upsc_chunks WHERE source_file=%s", (bare,))
            old_hashes = [r[0] for r in cur.fetchall()]
            for oh in old_hashes:
                ih.delete_existing_file_data(oh)
                cur.execute("DELETE FROM documents WHERE file_hash=%s", (oh,))
        conn.commit()
    finally:
        ih.release_conn(conn)
    ih.process_file(fp)
    print(f"[OK] {rel} chunks={count_chunks(fh)}", flush=True)

print("done 3/3")