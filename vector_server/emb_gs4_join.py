import sys
sys.path.insert(0, '/app')
import psycopg2
from ingest_hybrid import PG_DB, PG_USER, PG_PASS, PG_HOST, PG_PORT
c = psycopg2.connect(dbname=PG_DB, user=PG_USER, password=PG_PASS, host=PG_HOST, port=PG_PORT)
cur = c.cursor()

# documents with subject_id='ethics' and whether they have chunks + embedded
cur.execute("""
  SELECT COUNT(*) FROM documents WHERE subject_id='ethics' AND file_name IS NOT NULL
""")
print('ethics documents in documents table:', cur.fetchone()[0])

# distinct source_file values in chunks that correspond to ethics docs by joining on name
cur.execute("""
  SELECT d.file_name,
         COALESCE((SELECT COUNT(*) FROM upsc_chunks u WHERE u.source_file=d.file_name),0) AS chunks,
         COALESCE((SELECT COUNT(*) FROM upsc_chunks u WHERE u.source_file=d.file_name AND u.embedding IS NOT NULL),0) AS emb
  FROM documents d
  WHERE d.subject_id='ethics'
  ORDER BY chunks DESC
""")
rows = cur.fetchall()
withchunks = [r for r in rows if r[1] > 0]
print('ethics docs WITH chunks:', len(withchunks), '| without:', len(rows)-len(withchunks))
tot_c = sum(r[1] for r in rows)
tot_e = sum(r[2] for r in rows)
print('ethics total chunks:', tot_c, '| embedded:', tot_e, '| to embed:', tot_c-tot_e)
print('--- top 20 by chunks ---')
for r in rows[:20]:
    print(f'  {r[1]:4d}/{r[0]}: chunks={r[1]} emb={r[2]}')
c.close()
