"""
Add official Government-of-India essay-reference PDF documents (Ministry of
Finance Economic Survey chapters) to the essay Source Material library.

Each is downloaded, uploaded to R2 as  essay/essay/<name>.pdf, and registered
in `documents` under subject_id='essay' - exactly like the gs1-gs4 PDF sources.

Run inside the ingestor container:

    python /app/download_essay_official.py
"""

import hashlib
import os
import sys
import urllib.request
from pathlib import Path

import ingest_hybrid

DATA_DIR = Path("/app/data")
SUBJECT = "essay"
SUBJECT_DIR = DATA_DIR / SUBJECT

USER_AGENT = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
    )
}

# (local name, official source URL)
SOURCES = [
    (
        "Economic_Survey_2024-25_Preface.pdf",
        "https://www.indiabudget.gov.in/budget2025-26/economicsurvey/doc/eschapter/epreface.pdf",
    ),
    (
        "Economic_Survey_2024-25_Ch1_StateOfEconomy.pdf",
        "https://www.indiabudget.gov.in/budget2025-26/economicsurvey/doc/eschapter/echap01.pdf",
    ),
    (
        "Economic_Survey_2024-25_Ch9_Agriculture.pdf",
        "https://www.indiabudget.gov.in/budget2025-26/economicsurvey/doc/eschapter/echap09.pdf",
    ),
    (
        "Economic_Survey_2024-25_Ch11_SocialSector.pdf",
        "https://www.indiabudget.gov.in/budget2025-26/economicsurvey/doc/eschapter/echap11.pdf",
    ),
]


def sha256_hex(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def register_document(file_name: str, local_path: Path, cursor) -> None:
    fh = sha256_hex(local_path)
    cursor.execute(
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
        (fh, file_name, SUBJECT),
    )


def main() -> None:
    SUBJECT_DIR.mkdir(parents=True, exist_ok=True)
    from r2_store import build_key, r2_enabled, upload_r2_object

    enabled = r2_enabled()
    conn = ingest_hybrid.get_conn()
    done, failed = [], []
    try:
        with conn.cursor() as cur:
            for name, url in SOURCES:
                local = SUBJECT_DIR / name
                try:
                    req = urllib.request.Request(url, headers=USER_AGENT)
                    with urllib.request.urlopen(req, timeout=180) as r:
                        data = r.read()
                    if not data.startswith(b"%PDF"):
                        raise RuntimeError("not a PDF (bad magic)")
                    local.write_bytes(data)
                except Exception as exc:
                    failed.append((name, str(exc)))
                    print(f"ERR {name}: {exc!r}", flush=True)
                    continue

                file_name = f"{SUBJECT}/{name}"
                r2status = "skipped"
                if enabled:
                    try:
                        upload_r2_object(build_key(SUBJECT, name), local)
                        r2status = "uploaded"
                    except Exception as exc:
                        print(f"  R2 upload failed {name}: {exc!r}", flush=True)
                        r2status = "r2-error"
                register_document(file_name, local, cur)
                done.append((file_name, local.stat().st_size))
                print(f"OK  {file_name}  ({local.stat().st_size:,} bytes, r2={r2status})", flush=True)
        conn.commit()
    except Exception as exc:
        conn.rollback()
        print(f"DB error: {exc!r}", flush=True)
        sys.exit(1)
    finally:
        ingest_hybrid.release_conn(conn)

    print(f"\nAdded {len(done)} official PDFs. Failed: {len(failed)}")
    for name, size in done:
        print(f"  + {name} ({size:,} bytes)")
    for name, err in failed:
        print(f"  ! {name}: {err}")


if __name__ == "__main__":
    main()
