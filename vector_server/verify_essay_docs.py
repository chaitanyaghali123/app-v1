import sys
sys.path.insert(0, "/app")
import ingest_hybrid
c = ingest_hybrid.get_conn()
cur = c.cursor()
cur.execute("SELECT file_name FROM documents WHERE subject_id='essay' ORDER BY file_name")
print("DB essay rows:")
for r in cur.fetchall():
    print("  ", r[0])
cur.execute("SELECT COUNT(*) FROM documents WHERE file_name LIKE 'essay/%'")
print("total essay-prefixed:", cur.fetchone()[0])
ingest_hybrid.release_conn(c)
