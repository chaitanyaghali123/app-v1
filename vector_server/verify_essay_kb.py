import sys
sys.path.insert(0, "/app")
import ingest_hybrid
c = ingest_hybrid.get_conn()
cur = c.cursor()
cur.execute(
    "SELECT content_type, COUNT(*) FROM essay_knowledge_base GROUP BY content_type ORDER BY 2 DESC"
)
print("essay_knowledge_base by content_type:")
for r in cur.fetchall():
    print("  ", r[0], r[1])
cur.execute(
    "SELECT COUNT(*) FILTER (WHERE embedding IS NOT NULL) FROM essay_knowledge_base"
)
print("with embedding:", cur.fetchone()[0])
ingest_hybrid.release_conn(c)
