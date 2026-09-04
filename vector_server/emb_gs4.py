import sys
sys.path.insert(0, '/app')
import psycopg2
from ingest_hybrid import PG_DB, PG_USER, PG_PASS, PG_HOST, PG_PORT
c = psycopg2.connect(dbname=PG_DB, user=PG_USER, password=PG_PASS, host=PG_HOST, port=PG_PORT)
cur = c.cursor()

cur.execute("SELECT COUNT(*) FROM upsc_chunks")
tot = cur.fetchone()[0]
cur.execute("SELECT COUNT(*) FROM upsc_chunks WHERE embedding IS NULL")
unemb = cur.fetchone()[0]
cur.execute("SELECT COUNT(*) FROM upsc_chunks WHERE embedding IS NOT NULL")
emb = cur.fetchone()[0]

# GS4 = subject 'ethics' documents; source_file name contains an ethics marker
cur.execute("""
  SELECT source_file FROM upsc_chunks
  WHERE source_file LIKE '%ethics%' OR source_file LIKE '%GS4%' OR source_file LIKE '%ARC%' OR source_file LIKE '%UPSC_GS4%'
""")
files = {r[0] for r in cur.fetchall()}
print('total_chunks', tot)
print('embedded', emb)
print('unembedded', unemb)
print('distinct ethics-ish files in chunks:', len(files))
c.close()
