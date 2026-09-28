import os, sys, json
sys.path.insert(0, '/app')
os.environ.setdefault('R2_PREFIX', '')
from pathlib import Path
import r2_store
import ingest_hybrid

DATA = Path('/app/data')
remote = r2_store.list_r2_objects()
remote_rel = {rel: meta for rel, meta in remote.items()}

conn = ingest_hybrid.get_conn()
rows = []
with conn.cursor() as cur:
    cur.execute("SELECT file_name, subject_id FROM documents ORDER BY subject_id, file_name")
    rows = cur.fetchall()
ingest_hybrid.release_conn(conn)

uploaded, missing_local, skipped, failed = [], [], [], []
for fname, subject_id in rows:
    name = fname.split("/")[-1]
    key = r2_store.build_key(subject_id, name)
    rel = f"{subject_id if subject_id else 'general'}/{name}"
    if rel in remote_rel:
        continue
    local = DATA / fname
    if not local.exists():
        # some docs reference paths not under /app/data root
        alt = DATA / subject_id / name
        local = alt if alt.exists() else local
    if not local.exists():
        missing_local.append((fname, subject_id))
        continue
    key = r2_store.build_key(subject_id, local.name)
    try:
        r2_store.upload_r2_object(key, str(local))
        uploaded.append((rel, local.stat().st_size))
        print('UPLOADED', key, local.stat().st_size)
    except Exception as exc:
        failed.append((rel, str(exc)))
        print('FAILED', key, exc)

print('---')
print('uploaded', len(uploaded))
print('missing_local', len(missing_local))
print('failed', len(failed))
print('remote_total_after', len(r2_store.list_r2_objects()))
for f in missing_local[:50]:
    print('  NO_LOCAL', f)
if len(missing_local) > 50:
    print('  ...and', len(missing_local) - 50, 'more')