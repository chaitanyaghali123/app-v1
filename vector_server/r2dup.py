import psycopg2, re
from chunk_persistent import r2_store

r2 = set(r2_store.list_r2_objects())
conn = psycopg2.connect(host="postgres", dbname="aryabhata_db", user="aryabhata_user", password="Password123")
cur = conn.cursor()
cur.execute("SELECT DISTINCT file_name FROM documents")
fnames = set(r[0] for r in cur.fetchall())
bases = {}
for f in fnames:
    bases.setdefault(f.split("/")[-1].lower(), []).append(f)

no_doc = [k for k in sorted(r2) if k not in fnames and k.split("/")[-1].lower() not in bases]
print("R2-only objects:", len(no_doc))

verified = drift = 0
for k in no_doc:
    base = k.split("/")[-1]
    m = re.search(r"(\d{6,}-\d+)", base)  # e.g. 123456789-20174
    if not m:
        continue
    sid = m.group(1)
    suffix = k.split("/")[-1].lower().split(sid)[-1]
    matches = [f for f in fnames if sid.lower() in f.lower() and suffix in f.lower()]
    if matches:
        drift += 1
        print("DRIFT:", k, "==>", matches[0])
    else:
        verified += 1
        print("NO-DUP:", k)
print("\ndrift-matched:", drift, " unmatched:", verified)
conn.close()