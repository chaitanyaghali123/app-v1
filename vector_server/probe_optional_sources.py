import sys
sys.path.insert(0, "/app")
import ingest_hybrid
c = ingest_hybrid.get_conn()
cur = c.cursor()
cur.execute("SELECT DISTINCT subject_id FROM documents ORDER BY subject_id")
print("DISTINCT subject_id in documents:")
for r in cur.fetchall():
    print("  ", r[0])
print()
opt_ids = [
    "history-optional", "geography-optional", "public-administration-optional",
    "sociology-optional", "political-science-optional", "philosophy-optional",
]
for sid in opt_ids:
    cur.execute(
        "SELECT file_name FROM documents WHERE subject_id=%s ORDER BY file_name",
        (sid,),
    )
    rows = [r[0] for r in cur.fetchall()]
    print(f"[{sid}] {len(rows)} rows")
    for f in rows[:8]:
        print("    ", f)
ingest_hybrid.release_conn(c)
