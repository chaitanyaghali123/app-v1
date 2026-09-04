import sys, os
sys.path.insert(0,'/app'); os.environ.setdefault('R2_PREFIX','')
import psycopg2
from ingest_hybrid import PG_DB, PG_USER, PG_PASS, PG_HOST, PG_PORT
c = psycopg2.connect(dbname=PG_DB, user=PG_USER, password=PG_PASS, host=PG_HOST, port=PG_PORT)
cur=c.cursor()
cur.execute("SELECT COUNT(*) FROM upsc_chunks WHERE gs_paper='gs4'")
tot=cur.fetchone()[0]
cur.execute("SELECT COUNT(*) FROM upsc_chunks WHERE gs_paper='gs4' AND embedding IS NULL")
toemb=cur.fetchone()[0]
print('gs4 total:', tot, 'to_embed:', toemb)
c.close()
