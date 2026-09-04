"""
Remove the 7 wrong-content PA files that were registered from bad manifest
handles (43843-43850 / 43851-43858). These resolved to unrelated IGNOU
material (Consumer Rights units, CHR-12 Human Rights in India, DECE
Diploma-in-Early-Childhood programme guides), NOT Public Administration.

Deletes from disk, R2, and the documents table. Only for these exact files.
"""

import os
import sys
from pathlib import Path

sys.path.insert(0, "/app")
os.environ.setdefault("R2_PREFIX", "")
import r2_store
import ingest_hybrid

SUBJECT = "public-administration-optional"
FILES = [
    "MPA-016_123456789-43843_Unit-18.pdf",
    "MPA-016_123456789-43844_Unit-19.pdf",
    "MPA-016_123456789-43845_Unit-20.pdf",
    "MPA-016_123456789-43846_Unit-21.pdf",
    "MPA-016_123456789-43847_CHR-12-E-B5.pdf",
    "MPAG-001_123456789-43852_DECE_20PROG_20HINDI.pdf",
    "MPAG-001_123456789-43853_DECE_20PROG_20ENGLISH.pdf",
]


def main():
    conn = ingest_hybrid.get_conn()
    for name in FILES:
        local = Path("/app/data/optional") / SUBJECT / name
        if local.exists():
            local.unlink()
            print("disk removed:", name)
        r2 = r2_store.list_r2_objects()
        rel = f"{SUBJECT}/{name}"
        key = f"optional/{SUBJECT}/{name}"
        r2_rel = rel
        if r2_rel in r2:
            r2_store.delete_r2_object(key)
            print("R2 removed:", key)
        with conn.cursor() as cur:
            cur.execute("DELETE FROM documents WHERE file_name=%s", (rel,))
            n = cur.rowcount
        conn.commit()
        if n:
            print("DB rows deleted:", rel, "count", n)
        else:
            print("DB (none):", rel)
    ingest_hybrid.release_conn(conn)
    print("done")


if __name__ == "__main__":
    main()