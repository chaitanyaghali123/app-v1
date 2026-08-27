import os
from pathlib import Path
from r2_store import list_r2_objects, download_r2_object

data_dir = Path("/app/data/gs2")
data_dir.mkdir(parents=True, exist_ok=True)

files = list_r2_objects()
gs2 = {k: v for k, v in files.items() if k.startswith(("polity/","constitution/","governance/","international/","international-relations/"))}

count = 0
for key, meta in sorted(gs2.items()):
    dest = data_dir / key.replace("/", "_")
    if dest.exists():
        print(f"skip: {key}")
        continue
    download_r2_object(meta["key"], str(dest))
    count += 1
    sz = meta.get("size", 0) // 1024
    print(f"ok: {key} ({sz}KB)")

print(f"Downloaded {count} new, {len(list(data_dir.iterdir()))} total in gs2/")
