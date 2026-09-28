from ingest_hybrid import get_conn
conn = get_conn()
c = conn.cursor()
c.execute("SELECT subject_id, COUNT(1) FROM upsc_chunks GROUP BY subject_id ORDER BY 2 DESC")
for r in c.fetchall():
    print(r[0], "|", r[1])
c.execute("SELECT COUNT(1) FROM upsc_chunks")
print("TOTAL", c.fetchone()[0])
c.execute("SELECT COUNT(1) FROM documents WHERE status='indexed' AND file_name NOT IN (SELECT DISTINCT source_file FROM upsc_chunks)")
print("UNCHUNKED DOCS", c.fetchone()[0])