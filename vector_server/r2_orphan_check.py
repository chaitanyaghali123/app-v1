"""
Find R2 objects that have no corresponding `documents` row.

A file counts as "registered" if a documents row exists whose subject_id matches
the R2 subject-folder AND whose basename matches. We also handle the content-
dedupe case: a row registered under a different name with the same file_hash
still makes the content visible in the UI (not an orphan).

So we classify each R2 object as:
  - registered (row exists: same subject folder + same basename, OR same file_hash anywhere)
  - content-backed (a row with the same file_hash exists => content shown in UI)
  - ORPHAN (no row by name, no row by hash)
"""

import os
import sys
import hashlib
from collections import defaultdict

sys.path.insert(0, "/app")
os.environ.setdefault("R2_PREFIX", "")
import r2_store
import ingest_hybrid

BUCKET = os.getenv("R2_BUCKET", "upsc-rag-docs")

def main():
    r2 = r2_store.list_r2_objects()
    print("total r2 keys:", len(r2))

    conn = ingest_hybrid.get_conn()
    with conn.cursor() as cur:
        cur.execute("SELECT file_name, subject_id, file_hash FROM documents")
        rows = cur.fetchall()
    ingest_hybrid.release_conn(conn)

    hash_to_row = defaultdict(list)
    name_rows = set()
    for fname, sid, fh in rows:
        hash_to_row[fh].append(fname)
        name_rows.add(sid + "/" + fname.split("/")[-1])

    registered = []
    content_backed = []
    orphans = []

    for rel, meta in r2.items():
        parts = rel.split("/")
        if len(parts) < 2:
            # raw key doesn't have subject-folder/filename shape
            orphans.append((rel, "no-subject-folder"))
            continue
        sid = parts[0]
        bname = parts[-1]
        # documents file_name is stored as "<subject_id>/<name>" where subject_id
        # is the subject folder (e.g. history-optional -> documents.subject_id)
        key = sid + "/" + bname
        r2_key = meta.get("key", "")
        if key in name_rows:
            registered.append(rel)
            continue
        # check hash: fetch object hash? R2 doesn't expose md5 easily here.
        # Instead, check disk (the pipeline mirrors R2 on disk) -> compare hashes.
        local = "/app/data/optional/" + sid + "/" + bname
        if os.path.exists(local):
            h = hashlib.sha256()
            with open(local, "rb") as f:
                for chunk in iter(lambda: f.read(8192), b""):
                    h.update(chunk)
            fh = h.hexdigest()
            if fh in hash_to_row:
                content_backed.append((rel, hash_to_row[fh][0], fh))
                continue
            orphans.append((rel, "no-row-by-name-or-hash"))
        else:
            orphans.append((rel, "no-disk-copy") )

    print("\n=== REGISTERED (name matches) ===")
    print(len(registered), "objects")
    print("\n=== CONTENT-BACKED (same file_hash as a registered row) ===")
    for rel, other, _ in sorted(content_backed):
        print(f"  {rel}  -> same hash as {other}")
    print("\n=== ORPHANS (would NOT appear in UI) ===")
    for rel, why in sorted(orphans):
        print(f"  {rel}  [{why}]")

if __name__ == "__main__":
    main()