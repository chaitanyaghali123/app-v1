import sys, os
sys.path.insert(0, '/app')
os.environ.setdefault('R2_PREFIX', '')
import psycopg2
from pathlib import Path
import r2_store

print("R2 enabled:", r2_store.r2_enabled())
remote = r2_store.list_r2_objects()
print("R2 object count:", len(remote))

r2_keys = set(remote.keys())
db_paths = set()
import ingest_hybrid as ih
c = psycopg2.connect(dbname=ih.PG_DB, user=ih.PG_USER,
                     password=ih.PG_PASS, host=ih.PG_HOST, port=ih.PG_PORT)
cur = c.cursor()
cur.execute("SELECT DISTINCT source_file FROM upsc_chunks")
db_paths = set(r[0] for r in cur.fetchall())
c.close()

local = set(p.relative_to('/app/data/gs2').as_posix() for p in Path('/app/data/gs2').rglob('*') if p.suffix.lower() in {'.pdf','.docx','.txt'})

rel2root = {}
for k in r2_keys:
    parts = k.split('/')
    rel2root[k] = k
# r2 keys already collapsed to subject/file by list_r2_objects

in_r2_not_db = sorted(r2_keys - db_paths)
in_r2_not_local = sorted(r2_keys - local)
in_local_not_r2 = sorted(local - r2_keys)
in_db_not_r2 = sorted(db_paths - r2_keys)

print("=== R2 but NOT in DB (would be un-ingested):")
for k in in_r2_not_db:
    print(" ", k)
print("=== R2 but NOT on local disk:")
for k in in_r2_not_local:
    print(" ", k)
print("=== local but NOT in R2:")
for k in in_local_not_r2:
    print(" ", k)
print("=== in DB but NOT in R2:")
for k in in_db_not_r2:
    print(" ", k)