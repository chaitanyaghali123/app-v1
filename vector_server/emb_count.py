import sys
sys.path.insert(0, '/app')
import psycopg2
from ingest_hybrid import PG_DB, PG_USER, PG_PASS, PG_HOST, PG_PORT
c = psycopg2.connect(dbname=PG_DB, user=PG_USER, password=PG_PASS, host=PG_HOST, port=PG_PORT)
cur = c.cursor()
cur.execute("SELECT COUNT(*) FROM upsc_chunks")
print('total_chunks', cur.fetchone()[0])
cur.execute("SELECT COUNT(*) FROM upsc_chunks WHERE embedding IS NOT NULL")
print('embedded', cur.fetchone()[0])
cur.execute("SELECT COUNT(*) FROM upsc_chunks WHERE embedding IS NULL")
print('unembedded', cur.fetchone()[0])
cur.execute("SELECT COUNT(DISTINCT source_file) FROM upsc_chunks")
print('distinct_files', cur.fetchone()[0])
c.close()