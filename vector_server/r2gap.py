import psycopg2
from chunk_persistent import r2_store

r2 = set(r2_store.list_r2_objects())
print("R2 objects:", len(r2))

conn = psycopg2.connect(host="postgres", dbname="aryabhata_db", user="aryabhata_user", password="Password123")
cur = conn.cursor()

cur.execute("SELECT DISTINCT file_name FROM documents")
fnames = set(r[0] for r in cur.fetchall())
base_map = {}
for f in fnames:
    base_map.setdefault(f.split("/")[-1].lower(), []).append(f)

no_doc = []
for k in sorted(r2):
    base = k.split("/")[-1].lower()
    if k not in fnames and base not in base_map:
        no_doc.append(k)
print("\nR2 objects with NO matching document (by full path or basename):", len(no_doc))
for k in no_doc[:40]:
    print("  ", k)

# docs indexed but not in upsc_chunks source_file
cur.execute("""SELECT d.file_name FROM documents d
                WHERE d.status='indexed'
                AND NOT EXISTS (SELECT 1 FROM upsc_chunks c WHERE c.source_file=d.file_name)""")
rem = cur.fetchall()
print("\nindexed docs with NO chunks:", len(rem))
for r in rem: print("  ", r[0])

conn.close()