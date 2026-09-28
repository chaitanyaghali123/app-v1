import os, sys, json
sys.path.insert(0, '/app')
os.environ.setdefault('R2_PREFIX', '')
from pathlib import Path
from collections import defaultdict
import r2_store

DATA = Path('/app/data')
remote = r2_store.list_r2_objects()

def rel_key_for(p, root=DATA):
    try:
        rel = p.relative_to(root)
    except Exception:
        return None
    parts = list(rel.parts)
    if len(parts) < 2:
        return None
    subject = parts[0]
    gs = r2_store.GS_SUBJECT_MAP.get(subject, subject)
    name = parts[-1]
    return f"{gs}/{subject}/{name}"

local_files = [p for p in DATA.rglob('*')
               if p.is_file() and p.suffix.lower() in {'.pdf', '.docx', '.txt'}]

stats = defaultdict(int)
by_subj = defaultdict(lambda: [0, 0])
for p in local_files:
    key = rel_key_for(p)
    if key is None:
        stats['skipped_layout'] += 1
        continue
    subject = p.relative_to(DATA).parts[0]
    size = p.stat().st_size
    if key in remote and remote[key]['size'] == size:
        stats['ok'] += 1
        by_subj[subject][0] += 1
        continue
    if key in remote:
        stats['size_changed'] += 1
    else:
        stats['missing'] += 1
    by_subj[subject][1] += 1
    r2_store.upload_r2_object(key, str(p))
    print('UPLOADED', key)

print('--- summary ---')
print('ok(already in R2, same size):', stats['ok'])
print('missing(now uploaded):', stats['missing'])
print('size_changed(re-uploaded):', stats['size_changed'])
print('skipped_layout:', stats['skipped_layout'])
print('per-subject (ok, uploaded_now):')
for s in sorted(by_subj):
    ok, up = by_subj[s]
    if up:
        print(f'  {s:<28} ok={ok:<4} uploaded_now={up}')