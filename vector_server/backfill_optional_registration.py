"""
Backfill-register optional files that are on disk + R2 but missing from the
`documents` table (so they show up in Source Material UI + become streamable):

  - history-optional: 24 EHI-02/EHI-03 unit & block PDFs (present on disk and
    R2 under optional/history-optional/, but zero documents rows)
  - political-science-optional: MEA_Annual_Report_2023.pdf exists in R2
    (optional/political-science-optional/MEA_Annual_Report_2023.pdf) but has no
    disk copy and no documents row -> pull from R2 to disk, then register.

Idempotent: rows that already exist are left untouched (upsert by file_hash).

Run inside the aryabhata-ingestor container:
    python /app/backfill_optional_registration.py
"""

import hashlib
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, "/app")
os.environ.setdefault("R2_PREFIX", "")
import r2_store
import ingest_hybrid

SUBJECTS = {
    "history-optional": "history-optional",
    "political-science-optional": "political-science-optional",
}


def sha256_hex(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def register(conn, subject_id, rel_name):
    local = Path("/app/data/optional") / subject_id / Path(rel_name).name
    fh = sha256_hex(local)
    rel = f"{subject_id}/{local.name}"
    # R2 key already exists at optional/<subject_id>/<name>
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
            (fh, rel, subject_id),
        )
        cur.execute("SELECT 1 FROM documents WHERE file_hash=%s", (fh,))
        ok = cur.fetchone() is not None
    conn.commit()
    return ok


def main():
    r2 = r2_store.list_r2_objects()
    conn = ingest_hybrid.get_conn()
    total = 0

    # 1) history-optional: register every disk PDF missing from documents
    hist_dir = Path("/app/data/optional/history-optional")
    with conn.cursor() as cur:
        cur.execute("SELECT file_name FROM documents WHERE subject_id='history-optional'")
        db_names = {r[0].split('/')[-1] for r in cur.fetchall()}
    for p in sorted(hist_dir.glob("*.pdf")):
        if p.name in db_names:
            continue
        if register(conn, "history-optional", p.name):
            print("registered history-optional:", p.name)
            total += 1

    # 2) political-science-optional: MEA report from R2 -> disk -> register
    mea_rel = "political-science-optional/MEA_Annual_Report_2023.pdf"
    if mea_rel in r2:
        dest = Path("/app/data/optional") / mea_rel
        if not dest.exists():
            r2_store.download_r2_object(r2[mea_rel]["key"], str(dest))
            print("downloaded from R2:", mea_rel)
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM documents WHERE file_name=%s", (mea_rel,))
            exists = cur.fetchone() is not None
        if not exists and register(conn, "political-science-optional", dest.name):
            print("registered political-science-optional:", dest.name)
            total += 1
        elif exists:
            print("MEA already registered")

    ingest_hybrid.release_conn(conn)

    # refresh manifest
    try:
        remote = r2_store.list_r2_objects()
        manifest = {rel: meta["etag"] for rel, meta in remote.items()}
        Path("/app/data/.r2_manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        print("manifest updated")
    except Exception as exc:
        print("manifest skip", exc)

    print("\nTOTAL registered:", total)


if __name__ == "__main__":
    main()