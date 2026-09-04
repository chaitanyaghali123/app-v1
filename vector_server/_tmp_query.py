import os,sys
sys.path.insert(0,"/app")
os.environ.setdefault("R2_PREFIX","")
import ingest_hybrid
conn=ingest_hybrid.get_conn()
cur=conn.cursor()
cur.execute("SELECT file_name FROM documents WHERE subject_id='governance' ORDER BY file_name")
for r in cur.fetchall(): print(r[0])
ingest_hybrid.release_conn(conn)
