import os, sys, json
sys.path.insert(0, '/app')
os.environ.setdefault('R2_PREFIX', '')
import hashlib
from pathlib import Path
import r2_store

BASE = Path('/app/data/gs2')
remote = r2_store.list_r2_objects()

# 1) delete stale old-name constitution objects
for stale_rel in ['constitution/Constitution_of_India_Full_Text.pdf',
                  'polity/Constitution_of_India_Full_Text.pdf']:
    for rel, meta in list(remote.items()):
        if rel == stale_rel:
            r2_store.delete_r2_object(meta['key'])
            print('DELETED', rel, meta['key'])
            remote.pop(rel, None)

# 2) mirror local -> R2 (upload if missing or size differs)
uploaded, unchanged = [], 0
for p in sorted(BASE.rglob('*')):
    if p.suffix.lower() not in {'.pdf', '.docx', '.txt'}:
        continue
    folder = p.relative_to(BASE).parts[0]
    name = p.name
    gs = r2_store.GS_SUBJECT_MAP.get(folder, folder)
    key = f"{gs}/{folder}/{name}"
    rel = f"{folder}/{name}"
    size = p.stat().st_size
    if rel in remote and remote[rel]['size'] == size:
        unchanged += 1
        continue
    r2_store.upload_r2_object(key, str(p))
    uploaded.append(rel)
    print('UPLOADED', key, size)

# 3) refresh local manifest to match R2 state
remote = r2_store.list_r2_objects()
manifest = {}
for rel, meta in remote.items():
    manifest[rel] = meta['etag']
Path('/app/data/.r2_manifest.json').write_text(
    json.dumps(manifest, indent=2), encoding='utf-8')
print('manifest_rel_entries', len(manifest))
print('uploaded', len(uploaded), 'unchanged', unchanged, 'remote_total', len(remote))
for u in uploaded:
    print('  +', u)