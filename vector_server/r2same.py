import psycopg2
from chunk_persistent import r2_store

r2 = set(r2_store.list_r2_objects())

conn = psycopg2.connect(host="postgres", dbname="aryabhata_db", user="aryabhata_user", password="Password123")
cur = conn.cursor()
cur.execute("SELECT DISTINCT file_name, subject_id, status FROM documents")
docs = cur.fetchall()

# index by basename lower
by_base = {}
for fn, s, st in docs:
    by_base.setdefault(fn.split("/")[-1].lower(), []).append((fn, s, st))

no_doc = []
for k in sorted(r2):
    base = k.split("/")[-1].lower()
    subj = k.split("/")[0]
    if k not in [d[0] for d in docs] and base not in by_base:
        no_doc.append((k, subj))

print("R2 objects with NO doc match:", len(no_doc))
# group by subject dir
from collections import Counter
print(Counter(s for _, s in no_doc))

# For the no_doc EHI-04 / constitution files, show doc-side matches by basename
big = [k for k in no_doc if "EHI-04" in k or "Constitution" in k or "MoAFW" in k or "MEA_Annual" in k]
for k in big:
    base = k.split("/")[-1].lower()
    if base in by_base:
        print("MATCH-by-base:", k, "->", by_base[base])
    else:
        print("NO-match:", k)
conn.close()