import sys
sys.path.insert(0, '/app')
import psycopg2
from ingest_hybrid import PG_DB, PG_USER, PG_PASS, PG_HOST, PG_PORT
c = psycopg2.connect(dbname=PG_DB, user=PG_USER, password=PG_PASS, host=PG_HOST, port=PG_PORT)
cur = c.cursor()

# Does upsc_chunks.source_file store WITHOUT the subject prefix? Show samples from chunk table
cur.execute("SELECT DISTINCT source_file FROM upsc_chunks ORDER BY source_file LIMIT 120")
print('sample source_file values in upsc_chunks:')
for r in cur.fetchall():
    print('  ', r[0])

# total documents count and how many have any chunk (regardless of naming)
cur.execute("SELECT COUNT(*) FROM documents")
print('\ntotal documents (all subjects):', cur.fetchone()[0])
c.close()
