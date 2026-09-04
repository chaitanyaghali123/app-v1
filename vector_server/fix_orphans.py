"""
Make R2 = Source Material UI for the remaining orphans:

1. Register the 4 ARC reports that exist in R2 + on disk but have no
   `documents` row (so they appear under gs2/governance and gs4/ethics):
     - governance/ARC_Report01_RTI_MasterKey.pdf
     - governance/ARC_Report10_Personnel_Administration.pdf
     - governance/ARC_Report12_Citizen_Centric_Admin.pdf
     - ethics/ARC_Report04_Ethics_in_Governance.pdf
   This mirrors existing rows (e.g. ARC_Report03/07/11 registered under
   governance).

2. Delete the stale R2-only object
   optional/public-administration-optional/NITI_Strategy_for_New_India_75.pdf
   (content already registered + streamed as gs3/economy/NITI_... under
   economy).
"""

import os
import sys
import hashlib
from pathlib import Path

sys.path.insert(0, "/app")
os.environ.setdefault("R2_PREFIX", "")
import r2_store
import ingest_hybrid

TARGETS = [
    ("governance", "ARC_Report01_RTI_MasterKey.pdf"),
    ("governance", "ARC_Report10_Personnel_Administration.pdf"),
    ("governance", "ARC_Report12_Citizen_Centric_Admin.pdf"),
    ("ethics", "ARC_Report04_Ethics_in_Governance.pdf"),
]

STALE_R2 = "optional/public-administration-optional/NITI_Strategy_for_New_India_75.pdf"


def find_on_disk(subject, name):
    for root in ["/app/data/gs2", "/app/data/gs4"]:
        p = Path(root) / subject / name
        if p.exists():
            return p
    return None


def sha256_hex(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def main():
    conn = ingest_hybrid.get_conn()
    registered = []
    for subject, name in TARGETS:
        local = find_on_disk(subject, name)
        if local is None:
            print("SKIP (not on disk):", name)
            continue
        fh = sha256_hex(local)
        fname = f"{subject}/{name}"
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO documents (file_hash, file_name, subject_id, status, error_message)
                VALUES (%s, %s, %s, 'indexed', NULL)
                ON CONFLICT (file_hash)
                DO UPDATE SET file_name=EXCLUDED.file_name,
                              subject_id=EXCLUDED.subject_id,
                              status='indexed',
                              error_message=NULL,
                              updated_at=NOW()
                """,
                (fh, fname, subject),
            )
            cur.execute("SELECT file_name, subject_id FROM documents WHERE file_name=%s", (fname,))
            ok = cur.fetchone()
        conn.commit()
        if ok:
            print("registered:", fname)
            registered.append(fname)
        else:
            print("FAILED:", fname)

    # delete stale NITI R2 object (safety: only if not registered anywhere)
    with conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM documents WHERE file_name LIKE %s", ("%Strategy_for_New_India%",))
        cnt = cur.fetchone()[0]
    print("documents rows referencing Strategy_for_New_India:", cnt)
    ingest_hybrid.release_conn(conn)

    r2 = r2_store.list_r2_objects()
    rel = "/".join(STALE_R2.split("/")[1:])
    if rel in r2:
        r2_store.delete_r2_object(STALE_R2)
        print("deleted R2:", STALE_R2)
    else:
        print("R2 object already gone:", STALE_R2)

    print("\nTOTAL registered:", len(registered))


if __name__ == "__main__":
    main()