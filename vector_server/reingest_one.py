import os, sys
os.environ['EMBED_OFFLINE'] = 'true'
os.environ['EMBED_DEFER_ON_QUOTA'] = 'true'
os.environ['ENABLE_VISUAL_VERBALIZATION'] = 'false'
os.environ['ENABLE_TABLE_EXTRACTION'] = 'false'
sys.path.insert(0, '/app')

from pathlib import Path
import ingest_hybrid as ih

ih.root_folder = Path('/app/data/gs2')
rel = 'culture/NIOS223_Lesson13_English.pdf'
fp = Path('/app/data/gs2') / rel

fh = ih.file_checksum(fp)
print("hash:", fh)
ih.delete_existing_file_data(fh)
conn = ih.get_conn()
with conn.cursor() as cur:
    cur.execute("DELETE FROM documents WHERE file_hash=%s", (fh,))
conn.commit()
ih.release_conn(conn)

ih.process_file(fp)

conn = ih.get_conn()
cur = conn.cursor()
cur.execute("SELECT chunk_index, char_length(chunk), embedding IS NOT NULL, chunk FROM upsc_chunks WHERE file_hash=%s ORDER BY chunk_index", (fh,))
rows = cur.fetchall()
conn.close()

print("FRESH chunk count:", len(rows))
bad = [r for r in rows if 'European constitution' in r[3] or 'government will be constituted' in r[3]]
print("still-contains-foreign:", len(bad))
for r in rows[:3]:
    print("  i=%s len=%s emb=%s | %s..." % (r[0], r[1], r[2], r[3][:90].replace(chr(10), ' ')))
print("OK" if not bad else "FAIL")