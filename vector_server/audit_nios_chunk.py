import sys
sys.path.insert(0, '/app')
from ingest_hybrid import get_conn

conn = get_conn()
cur = conn.cursor()
cur.execute("""
  SELECT id, source_file, gs_paper, chunk_index, page_number,
         char_length(chunk) AS len, embedding IS NOT NULL AS has_emb
  FROM upsc_chunks
  WHERE chunk ILIKE '%European constitution%'
  ORDER BY id
  LIMIT 20
""")
cols = [d[0] for d in cur.description]
rows = cur.fetchall()
print("MATCHES:", len(rows))
for r in rows:
    print(dict(zip(cols, r)))
print("==== full text of first match ====")
if rows:
    cur.execute("SELECT chunk, source_file, page_number, chunk_index FROM upsc_chunks WHERE id = %s", (rows[0][0],))
    text, sf, pn, ci = cur.fetchone()
    print("source_file=", sf, "page=", pn, "chunk_index=", ci)
    print(text)
conn.close()