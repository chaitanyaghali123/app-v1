import psycopg2

conn = psycopg2.connect(host="postgres", dbname="aryabhata_db", user="aryabhata_user", password="Password123")
cur = conn.cursor()

cur.execute("SELECT subject_id, COUNT(*) FROM documents WHERE status='indexed' GROUP BY subject_id ORDER BY 2 DESC")
subs = cur.fetchall()
print(f"{'subject':40s} {'docs':>5s} {'chunked':>7s} {'missing':>7s}")
for s, n in subs:
    cur2 = conn.cursor()
    cur2.execute("""SELECT COUNT(DISTINCT source_file) FROM upsc_chunks c
                    JOIN documents d ON c.source_file=d.file_name
                    WHERE d.subject_id=%s""", (s,))
    cc = cur2.fetchone()[0]
    print(f"{s:40s} {n:5d} {cc:7d} {n-cc:7d}")

cur.execute("SELECT COUNT(DISTINCT source_file) FROM upsc_chunks")
unique = cur.fetchone()[0]
print("distinct source_file with chunks:", unique)
conn.close()