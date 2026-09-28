import hashlib, os, tempfile
import psycopg2
from chunk_persistent import r2_store
from pathlib import Path

R2_KEYS = [
    "public-administration-optional/EPA-04_123456789-19286_Unit-21.pdf",
    "sociology-optional/MSWE-002_123456789-58861_Unit1.pdf",
]

conn = psycopg2.connect(host="postgres", dbname="aryabhata_db", user="aryabhata_user", password="Password123")
cur = conn.cursor()

for key in R2_KEYS:
    base = key.split("/")[-1]
    subj = key.split("/")[0]
    tmp = Path(tempfile.gettempdir()) / base
    r2_store.download_r2_object(key, str(tmp))
    fh = hashlib.sha256(tmp.read_bytes()).hexdigest()
    size = tmp.stat().st_size
    cur.execute("""INSERT INTO documents (file_hash, file_name, subject_id, status, error_message)
                   VALUES (%s, %s, %s, 'indexed', NULL)
                   ON CONFLICT (file_hash) DO UPDATE SET
                     file_name=EXCLUDED.file_name, subject_id=EXCLUDED.subject_id,
                     status='indexed', error_message=NULL, updated_at=NOW()""",
                (fh, key, subj))
    print(f"ingested {key} subj={subj} size={size} hash={fh[:12]}")
conn.commit()
conn.close()
print("done")