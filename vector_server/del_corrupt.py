from chunk_persistent import r2_store
import psycopg2

base = "NationalBiodiversityActionPlan_2008.pdf"
objs = r2_store.list_r2_objects()
hits = [k for k in objs if k.split("/")[-1] == base]
print("R2 keys:", hits)

for key in hits:
    subj = key.split("/")[0]
    prefix = ""
    gs = r2_store.GS_SUBJECT_MAP.get(subj.lower(), subj.lower())
    full = f"{prefix}/{gs}/{subj}/{base}" if prefix else f"{gs}/{subj}/{base}"
    r2_store.delete_r2_object(full)
    print("deleted from R2:", full)

conn = psycopg2.connect(host="postgres", dbname="aryabhata_db", user="aryabhata_user", password="Password123")
cur = conn.cursor()
cur.execute("DELETE FROM documents WHERE file_name=%s", ("environment/NationalBiodiversityActionPlan_2008.pdf",))
print("db rows deleted:", cur.rowcount)
conn.commit()
conn.close()
print("done")