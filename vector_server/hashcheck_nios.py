import sys, hashlib
sys.path.insert(0, '/app')
from ingest_hybrid import get_conn

# disk hash
path = '/app/data/gs2/culture/NIOS223_Lesson13_English.pdf'
h = hashlib.sha256(open(path, 'rb').read()).hexdigest()
print("DISK sha256:", h, "size:", __import__('os').path.getsize(path))

conn = get_conn()
cur = conn.cursor()
cur.execute("""
  SELECT id, chunk_index, page_number, source_file, file_hash,
         char_length(chunk) AS len, embedding IS NOT NULL AS has_emb
  FROM upsc_chunks
  WHERE source_file ILIKE '%NIOS223_Lesson13%'
  ORDER BY chunk_index
""")
rows = cur.fetchall()
print("CHUNKS for NIOS223_Lesson13:", len(rows))
cols = [d[0] for d in cur.description] if cur.description else []
for r in rows:
    print(dict(zip(cols, r)))
conn.close()

print("==== full text of chunk 0 ====")
conn = get_conn(); cur = conn.cursor()
cur.execute("SELECT chunk FROM upsc_chunks WHERE source_file ILIKE '%NIOS223_Lesson13%' ORDER BY chunk_index LIMIT 1")
print(cur.fetchone()[0])
conn.close()