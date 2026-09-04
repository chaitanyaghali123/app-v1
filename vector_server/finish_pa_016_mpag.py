"""Targeted finish for Public Admin manifest: only MPA-016 (remaining items)
and MPAG-001, which are the last two courses not yet completed. Reuses the
module functions from download_pa_optional_manifest.py with a shared conn.

Run inside the aryabhata-ingestor container:
    python /app/finish_pa_016_mpag.py
"""

import os
import sys

sys.path.insert(0, "/app")
os.environ.setdefault("R2_PREFIX", "")
import ingest_hybrid
from download_pa_optional_manifest import download_item, BASE, ITEMS

# Only handles that still need processing:
#  MPA-016: 43844..43850 (43843 already saved earlier)
#  MPAG-001: 43851..43858
TARGET = {
    ("MPA-016", str(hid)) for hid in range(43844, 43851)
} | {
    ("MPAG-001", str(hid)) for hid in range(43851, 43859)
}


def main():
    BASE.mkdir(parents=True, exist_ok=True)
    conn = ingest_hybrid.get_conn()
    total = 0
    try:
        for code, hid in ITEMS:
            if (code, hid) not in TARGET:
                continue
            try:
                total += download_item(code, hid, conn)
            except Exception as exc:
                print('  ERROR', code, hid, exc, flush=True)
                try:
                    conn.rollback()
                except Exception:
                    pass
    finally:
        ingest_hybrid.release_conn(conn)

    print("\nTOTAL:", total)


if __name__ == "__main__":
    main()
