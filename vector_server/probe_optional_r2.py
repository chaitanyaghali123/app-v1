import sys
sys.path.insert(0, "/app")
import r2_store
from pathlib import Path

print("=== R2 objects under optional/ ===")
try:
    objs = r2_store.list_r2_objects()
    opt = {k: v for k, v in objs.items() if k.split("/")[0] in (
        "history-optional", "geography-optional", "public-administration-optional",
        "sociology-optional", "political-science-optional", "philosophy-optional",
        "optional",
    ) or "optional" in k}
    print("count:", len(opt))
    for k, v in sorted(opt.items()):
        print(f"  {k}  ({v['size']:,}B)")
except Exception as e:
    print("ERR", repr(e))

print()
print("=== Local mirror /app/data/optional ===")
base = Path("/app/data/optional")
if base.exists():
    for p in sorted(base.rglob("*")):
        if p.is_file():
            print(f"  {p.relative_to('/app/data')}  ({p.stat().st_size:,}B)")
else:
    print("  (no /app/data/optional dir)")
