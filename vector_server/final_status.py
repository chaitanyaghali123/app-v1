import os,sys;sys.path.insert(0,'/app');os.environ.setdefault('R2_PREFIX','')
import r2_store,ingest_hybrid
conn=ingest_hybrid.get_conn();cur=conn.cursor()
cur.execute("SELECT subject_id,count(*) FROM documents GROUP BY subject_id ORDER BY count(*) DESC")
rows=cur.fetchall()
print("=== DB documents by subject_id ===")
total=0
for s,c in rows:
    print("  %-38s %d" % (s, c))
    total+=c
print("  %-38s %d" % ("TOTAL", total))
ingest_hybrid.release_conn(conn)
