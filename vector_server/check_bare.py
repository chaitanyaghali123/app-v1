import sys
sys.path.insert(0, '/app')
import psycopg2
from ingest_hybrid import PG_DB, PG_USER, PG_PASS, PG_HOST, PG_PORT

c = psycopg2.connect(dbname=PG_DB, user=PG_USER, password=PG_PASS, host=PG_HOST, port=PG_PORT)
cur = c.cursor()
for name in ['NDMA_Drought.pdf', 'NDMA_GLOF.pdf', 'NDMA_Heat_Wave.pdf', 'NIOS223_Lesson12_English.pdf']:
    cur.execute("SELECT source_file, count(*), file_hash FROM upsc_chunks GROUP BY source_file, file_hash HAVING source_file=%s", (name,))
    for r in cur.fetchall():
        print("BARE:", r)
cur.execute("SELECT source_file FROM upsc_chunks WHERE source_file LIKE '%NIOS223_Lesson12%' OR source_file LIKE '%NDMA_Drought%' OR source_file LIKE '%NDMA_GLOF%' OR source_file LIKE '%NDMA_Heat_Wave%'")
for r in cur.fetchall():
    print("ANY:", r[0])
c.close()