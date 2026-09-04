"""
Add the Indian philosophy / thought sources (Section A Indian thought) to the
essay Source Material library, exactly like the other essay PDFs:

    Tagore  - Nationalism          (Gutenberg #40766)
    Gandhi  - Indian Home Rule     (Gutenberg #40461)
    Vivekananda - Jnana Yoga Pt II (Gutenberg #72368)

Each Gutenberg plain text is downloaded, rendered into a paginated PDF,
uploaded to R2 as  essay/essay/<name>.pdf, and registered in `documents`
under subject_id='essay'.

Run inside the ingestor container:

    python /app/download_essay_indian.py
"""

import hashlib
import os
import re
import sys
import urllib.request
from pathlib import Path

import ingest_hybrid

from essay_txt_to_pdf import clean_title, register_document, render_pdf

DATA_DIR = Path("/app/data")
SUBJECT = "essay"
SUBJECT_DIR = DATA_DIR / SUBJECT

USER_AGENT = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
    )
}

# (pdf name, gutenberg plain text url)
SOURCES = [
    (
        "Tagore_Nationalism.pdf",
        "https://www.gutenberg.org/cache/epub/40766/pg40766.txt",
    ),
    (
        "Gandhi_Indian_Home_Rule.pdf",
        "https://www.gutenberg.org/cache/epub/40461/pg40461.txt",
    ),
    (
        "Vivekananda_JnanaYoga_Part2.pdf",
        "https://www.gutenberg.org/cache/epub/72368/pg72368.txt",
    ),
]


def main() -> None:
    SUBJECT_DIR.mkdir(parents=True, exist_ok=True)
    from r2_store import build_key, r2_enabled, upload_r2_object

    enabled = r2_enabled()
    conn = ingest_hybrid.get_conn()
    done, failed = [], []
    try:
        with conn.cursor() as cur:
            for pdf_name, url in SOURCES:
                txt_name = pdf_name.rsplit(".", 1)[0] + ".txt"
                txt_path = SUBJECT_DIR / txt_name
                pdf_path = SUBJECT_DIR / pdf_name
                try:
                    req = urllib.request.Request(url, headers=USER_AGENT)
                    with urllib.request.urlopen(req, timeout=120) as r:
                        data = r.read()
                    txt_path.write_bytes(data)
                    render_pdf(txt_path, pdf_path)
                except Exception as exc:
                    failed.append((pdf_name, str(exc)))
                    print(f"ERR {pdf_name}: {exc!r}", flush=True)
                    continue

                file_name = f"{SUBJECT}/{pdf_name}"
                r2status = "skipped"
                if enabled:
                    try:
                        upload_r2_object(build_key(SUBJECT, pdf_name), pdf_path)
                        r2status = "uploaded"
                    except Exception as exc:
                        print(f"  R2 upload failed {pdf_name}: {exc!r}", flush=True)
                        r2status = "r2-error"
                register_document(file_name, pdf_path, cur)
                size = pdf_path.stat().st_size
                done.append((file_name, size))
                print(f"OK  {file_name}  ({size:,} bytes, r2={r2status})", flush=True)
        conn.commit()
    except Exception as exc:
        conn.rollback()
        print(f"DB error: {exc!r}", flush=True)
        sys.exit(1)
    finally:
        ingest_hybrid.release_conn(conn)

    print(f"\nAdded {len(done)} Indian-thought PDFs. Failed: {len(failed)}")
    for name, size in done:
        print(f"  + {name} ({size:,} bytes)")
    for name, err in failed:
        print(f"  ! {name}: {err}")


if __name__ == "__main__":
    main()
