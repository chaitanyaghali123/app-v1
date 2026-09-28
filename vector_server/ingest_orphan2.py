import hashlib, tempfile
import psycopg2
from chunk_persistent import r2_store
from pathlib import Path

# list all keys whose basenames match our 2 targets
r2 = r2_store.list_r2_objects()
targets = {
    "EPA-04_123456789-19286_Unit-21.pdf",
    "MSWE-002_123456789-58861_Unit1.pdf",
}
hits = [k for k in r2 if k.split("/")[-1] in targets]
print("matches:", hits)

conn = psycopg2.connect(host="postgres", dbname="aryabhata_db", user="aryabhata_user", password="Password123")
cur = conn.cursor()
for rel in hits:
    base = rel.split("/")[-1]
    subj = rel.split("/")[0]
    # find full R2 key
    objs = r2_store.list_r2_objects()
    key_hits = [k for k in objs if k.split("/")[-1] == base]
    print(rel, "-> full key candidates:", key_hits)
    if not key_hits:
        continue
    key = key_hits[0]
    # reconstruct full key with prefix/gs
    import os
    prefix = os.getenv("R2_PREFIX", "").strip().strip("/")
    gs = r2_store.GS_SUBJECT_MAP.get(subj.lower(), subj.lower())
    full = f"{prefix}/{gs}/{subj}/{base}" if prefix else f"{gs}/{subj}/{base}"
    print("full:", full)
    tmp = Path(tempfile.gettempdir()) / base
    r2_store.download_r2_object(full, str(tmp))
    fh = hashlib.sha256(tmp.read_bytes()).hexdigest()
    size = tmp.stat().st_size
    cur.execute("""INSERT INTO documents (file_hash, file_name, subject_id, status, error_message)
                   VALUES (%s, %s, %s, 'indexed', NULL)
                   ON CONFLICT (file_hash) DO UPDATE SET
                     file_name=EXCLUDED.file_name, subject_id=EXCLUDED.subject_id,
                     status='indexed', error_message=NULL, updated_at=NOW()""",
                (fh, f"{subj}/{base}", subj))
    print(f"INGESTED subj={subj} size={size} hash={fh[:12]}")
conn.commit()
conn.close()
print("done")