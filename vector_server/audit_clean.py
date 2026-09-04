"""
Clean per-subject reconciliation: disk vs R2 vs documents (DB).

For each optional subject directory under /app/data/optional:
  - disk set  = basenames of *.pdf on disk
  - r2 set    = basenames of R2 keys under <subject>/
  - db set    = basenames of documents.file_name where subject_id=<subject>

Reports symmetric differences so real gaps (vs content-dedupe) are visible.
"""

import os
import sys
from pathlib import Path
from collections import defaultdict

sys.path.insert(0, "/app")
os.environ.setdefault("R2_PREFIX", "")
import r2_store
import ingest_hybrid

BASE = Path("/app/data/optional")

def main():
    r2 = r2_store.list_r2_objects()
    # group r2 keys by first path part
    r2_by_subj = defaultdict(set)
    for k in r2:
        parts = k.split("/", 1)
        if len(parts) == 2:
            r2_by_subj[parts[0]].add(parts[1])

    conn = ingest_hybrid.get_conn()
    db_by_subj = defaultdict(set)
    with conn.cursor() as cur:
        cur.execute("SELECT file_name, subject_id FROM documents")
        for fname, sid in cur.fetchall():
            db_by_subj[sid].add(fname.split("/")[-1])
    ingest_hybrid.release_conn(conn)

    subjects = sorted(d.name for d in BASE.iterdir() if d.is_dir())
    ignore = {".r2_manifest.json"}
    subjects = [s for s in subjects if s not in ignore]

    print(f"{'subject':<32} {'DISK':>5} {'R2':>5} {'DB':>5}  disk-not-R2  disk-not-DB  DB-not-disk")
    print("-" * 96)
    for s in subjects:
        disk = {p.name for p in (BASE / s).glob("*.pdf")}
        r2n = r2_by_subj.get(s, set())
        dbn = db_by_subj.get(s, set())
        d_not_r2 = sorted(disk - r2n)
        d_not_db = sorted(disk - dbn)
        db_not_d = sorted(dbn - disk)
        print(f"{s:<32} {len(disk):>5} {len(r2n):>5} {len(dbn):>5}  {len(d_not_r2):>9}  {len(d_not_db):>10}  {len(db_not_d):>10}")
        if d_not_r2 or d_not_db or db_not_d:
            for n in d_not_r2[:6]:
                print(f"    disk-not-R2  {n}")
            for n in d_not_db[:6]:
                print(f"    disk-not-DB  {n}")
            for n in db_not_d[:6]:
                print(f"    DB-not-disk {n}")

if __name__ == "__main__":
    main()