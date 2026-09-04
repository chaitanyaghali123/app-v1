import os, sys, shutil
os.environ['EMBED_OFFLINE'] = 'true'
os.environ['EMBED_DEFER_ON_QUOTA'] = 'true'
os.environ['ENABLE_VISUAL_VERBALIZATION'] = 'false'
sys.path.insert(0, '/app')
from pathlib import Path
import ingest_hybrid as ih

ih.root_folder = Path('/app/data/gs2')
BASE = Path('/app/data/gs2')
fp = BASE / 'disaster-management/NDMA_Heat_Wave.pdf'

# wipe old scanned-hash rows
conn = ih.get_conn()
try:
    with conn.cursor() as cur:
        cur.execute("SELECT DISTINCT file_hash FROM upsc_chunks WHERE source_file=%s OR source_file=%s",
                    ('disaster-management/NDMA_Heat_Wave.pdf', 'NDMA_Heat_Wave.pdf'))
        for (oh,) in cur.fetchall():
            ih.delete_existing_file_data(oh)
            cur.execute("DELETE FROM documents WHERE file_hash=%s", (oh,))
    conn.commit()
finally:
    ih.release_conn(conn)

# drop the scanned file, copy in the text version under the same name
old_hash = ih.file_checksum(fp) if fp.exists() else None
fp.unlink(missing_ok=True)
shutil.copy('/tmp/heatwave_nidm.pdf', fp)
new_hash = ih.file_checksum(fp)
print('old_hash', old_hash)
print('new_hash', new_hash)

ih.process_file(fp)

conn = ih.get_conn()
try:
    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM upsc_chunks WHERE file_hash=%s", (new_hash,))
        n = cur.fetchone()[0]
        cur.execute("SELECT chunk_index, left(chunk, 90) FROM upsc_chunks WHERE file_hash=%s ORDER BY chunk_index LIMIT 2", (new_hash,))
        rows = cur.fetchall()
finally:
    ih.release_conn(conn)
print('chunks', n)
for r in rows:
    print(' ', r)