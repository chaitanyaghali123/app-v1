import sys
from pathlib import Path
sys.path.insert(0, "/app")
import r2_store as R

DATA = Path("/app/data")
NEW_RELS = [
    "agriculture/Economic_Survey_2024-25_Ch9_Agriculture.pdf",
    "social-justice/Economic_Survey_2024-25_Ch11_SocialSector.pdf",
]
OBLV_RELS = [
    "essay/Economic_Survey_2024-25_Ch9_Agriculture.pdf",
    "essay/Economic_Survey_2024-25_Ch11_SocialSector.pdf",
]

objs = R.list_r2_objects()

manifest = R._load_manifest(DATA)

# download the two newly-placed subject docs
for rel in NEW_RELS:
    meta = objs.get(rel)
    if not meta:
        print("MISSING on R2:", rel)
        continue
    local = DATA / rel
    if local.exists():
        print("already local:", rel)
    else:
        R.download_r2_object(meta["key"], local)
        print("downloaded:", rel)
    manifest[rel] = meta["etag"]

# prune the moved-away essay entries (local + manifest)
for rel in OBLV_RELS:
    local = DATA / rel
    if local.exists():
        local.unlink()
        print("pruned local:", rel)
    manifest.pop(rel, None)

R._save_manifest(DATA, manifest)
print("manifest entries:", len(manifest))
for rel in sorted(manifest):
    if "Economic_Survey_2024-25_Ch9" in rel or "Economic_Survey_2024-25_Ch11" in rel:
        print("  manifest ->", rel)