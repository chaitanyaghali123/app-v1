import sys
sys.path.insert(0, '/app')
import ingest_hybrid as ih
conn = ih.get_conn()
cur = conn.cursor()
cur.execute("SELECT source_file, count(*), max(created_at) FROM upsc_chunks GROUP BY source_file ORDER BY max(created_at) DESC LIMIT 8")
for r in cur.fetchall():
    print(r[0], r[1], r[2])
conn.close()