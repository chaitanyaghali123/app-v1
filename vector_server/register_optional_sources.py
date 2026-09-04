"""
Register the optional-subject source PDFs (already mirrored locally under
/app/data/optional/<subject>/ and present in R2) into the `documents` table
so the "Source Material" panel can list and open them - the same way gs/essay
PDFs are registered.

Each row: file_name=<subject>/<file>.pdf, subject_id=<subject> (e.g.
history-optional/EHI-01...pdf under subject_id='history-optional').

Run inside the ingestor container:

    python /app/register_optional_sources.py
"""

import hashlib
import sys
from pathlib import Path

import ingest_hybrid

OPTIONAL_SUBJECTS = [
    "history-optional",
    "geography-optional",
    "public-administration-optional",
    "sociology-optional",
    "political-science-optional",
    "philosophy-optional",
]

BASE = Path("/app/data/optional")
ALLOWED = {".pdf", ".docx", ".txt"}


def sha256_hex(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> None:
    if not BASE.exists():
        print("No /app/data/optional dir found")
        sys.exit(1)

    conn = ingest_hybrid.get_conn()
    added = 0
    try:
        with conn.cursor() as cur:
            for subject in OPTIONAL_SUBJECTS:
                sub_dir = BASE / subject
                if not sub_dir.exists():
                    print(f"[{subject}] dir missing, skipping", flush=True)
                    continue
                files = []
                for p in sorted(sub_dir.rglob("*")):
                    if p.is_file() and p.suffix.lower() in ALLOWED:
                        files.append(p)
                count = 0
                for p in files:
                    rel = f"{subject}/{p.name}"
                    fh = sha256_hex(p)
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
                        (fh, rel, subject),
                    )
                    count += 1
                conn.commit()
                added += count
                print(f"[{subject}] registered {count} files", flush=True)
    except Exception as exc:
        conn.rollback()
        print(f"DB error: {exc!r}", flush=True)
        sys.exit(1)
    finally:
        ingest_hybrid.release_conn(conn)

    print(f"\nTotal registered: {added}")


if __name__ == "__main__":
    main()
