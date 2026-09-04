import sys
sys.path.insert(0, '/app')
from pathlib import Path
import psycopg2
from ingest_hybrid import PG_DB, PG_USER, PG_PASS, PG_HOST, PG_PORT

base = Path('/app/data/gs2')
disk = sorted(p.relative_to(base).as_posix() for p in base.rglob('*.pdf'))

c = psycopg2.connect(dbname=PG_DB, user=PG_USER, password=PG_PASS, host=PG_HOST, port=PG_PORT)
cur = c.cursor()
cur.execute("SELECT DISTINCT source_file FROM upsc_chunks")
db = set(r[0] for r in cur.fetchall())
c.close()

for f in disk:
    if f not in db:
        print("NOT_DB:", f)
print("---")
print("disk", len(disk), "db", len(db))