import os, sys, json
sys.path.insert(0, '/app')
os.environ.setdefault('R2_PREFIX', '')
from pathlib import Path
import r2_store

BASE = Path('/app/data/optional')
remote = r2_store.list_r2_objects()

uploaded, unchanged, failed = [], 0, []
for p in sorted(BASE.rglob('*')):
    if p.suffix.lower() not in {'.pdf', '.docx', '.txt'}:
        continue
    parts = p.relative_to(BASE).parts
    if len(parts) < 2:
        continue
    folder, name = parts[0], p.name
    gs = r2_store.GS_SUBJECT_MAP.get(folder, folder)
    key = f"{gs}/{folder}/{name}"
    rel = f"{folder}/{name}"
    size = p.stat().st_size
    if rel in remote and remote[rel].get('size') == size:
        unchanged += 1
        continue
    try:
        r2_store.upload_r2_object(key, str(p))
        uploaded.append(rel)
        print('UPLOADED', key, size)
    except Exception as exc:
        failed.append((rel, str(exc)))
        print('FAILED', key, exc)

# refresh local manifest to match R2 state
remote = r2_store.list_r2_objects()
manifest = {}
for rel, meta in remote.items():
    manifest[rel] = meta['etag']
Path('/app/data/.r2_manifest.json').write_text(
    json.dumps(manifest, indent=2), encoding='utf-8')
print('manifest_rel_entries', len(manifest))
print('uploaded', len(uploaded), 'unchanged', unchanged, 'failed', len(failed), 'remote_total', len(remote))
for u in uploaded:
    print('  +', u)
