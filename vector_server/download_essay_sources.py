"""
Download the essay source library defined in essay_sources_manifest.json,
register each file in the `documents` table under subject_id='essay', and
upload to R2 so the app's "Source Material" panel can list and open them.

Run inside the ingestor container:

    python /app/download_essay_sources.py

Sources that are plain-text books (Gutenberg) are downloaded verbatim.
Encyclopedia entries (SEP/IEP) are HTML pages fetched and cleaned to text.
Gov landing pages (Yojana/Kurukshetra/NITI/Economic Survey/DARPG) are skipped
because they are navigation pages, not stable single-file PDFs.
"""

import hashlib
import html
import os
import re
import sys
import urllib.request
from pathlib import Path

DATA_DIR = Path("/app/data")
SUBJECT = "essay"
SUBJECT_DIR = DATA_DIR / SUBJECT
MAX_CHARS = 400_000  # trim very large encyclopaedia pages to keep files manageable

USER_AGENT = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
    )
}


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers=USER_AGENT)
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def clean_html(raw: bytes) -> str:
    text = raw.decode("utf-8", "replace")
    text = re.sub(r"<(script|style|nav|footer|header|aside)[^>]*>.*?</\1>", " ", text, flags=re.S | re.I)
    text = re.sub(r"<br\s*/?>", " ", text, flags=re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    text = html.unescape(text)
    text = re.sub(r"[ \t\u00a0]+", " ", text)
    text = re.sub(r" *\n *", "\n", text)
    text = re.sub(r"\n\s*\n+", "\n\n", text)
    i = text.find("First published")
    if i > 4000:
        text = text[i:]
    return text.strip()


def sha256_hex(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(4096), b""):
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

    # (name, kind, source)  kind: 'plain' -> download raw bytes as-is,
    #                       'html'  -> fetch page and clean to text
    sources = [
        # Gutenberg classics (raw project gutenberg text)
        ("Plato_Republic.txt", "plain",
         "https://www.gutenberg.org/cache/epub/1497/pg1497.txt"),
        ("Marcus_Aurelius_Meditations.txt", "plain",
         "https://www.gutenberg.org/cache/epub/2680/pg2680.txt"),
        ("Aristotle_Nicomachean_Ethics.txt", "plain",
         "https://www.gutenberg.org/cache/epub/8438/pg8438.txt"),
        ("Mill_On_Liberty.txt", "plain",
         "https://www.gutenberg.org/cache/epub/34901/pg34901.txt"),
        ("Tagore_Stray_Birds.txt", "plain",
         "https://www.gutenberg.org/cache/epub/25224/pg25224.txt"),
        # Encyclopaedia entries (HTML -> clean text)
        ("SEP_Justice.txt", "html",
         "https://plato.stanford.edu/entries/justice/"),
        ("SEP_Ethics_MoralTheory.txt", "html",
         "https://plato.stanford.edu/entries/moral-theory/"),
        ("SEP_Utilitarianism.txt", "html",
         "https://plato.stanford.edu/entries/utilitarianism-history/"),
        ("SEP_Stoicism.txt", "html",
         "https://plato.stanford.edu/entries/stoicism/"),
        ("IEP_Justice_Western.txt", "html",
         "https://iep.utm.edu/justwest/"),
    ]

    downloaded = []
    failed = []
    for name, kind, url in sources:
        local = SUBJECT_DIR / name
        try:
            if kind == "plain":
                raw = fetch(url)
                body = raw.decode("utf-8", "replace")
            else:
                body = clean_html(fetch(url))
            if not body.strip():
                raise RuntimeError("empty body")
            body = body[:MAX_CHARS]
            local.write_text(body, encoding="utf-8")
            downloaded.append((name, local.stat().st_size))
            print(f"OK  {name} ({local.stat().st_size:,} bytes)", flush=True)
        except Exception as exc:
            failed.append((name, str(exc)))
            print(f"ERR {name}: {exc!r}", flush=True)

    # Upload to R2 + register in documents
    from r2_store import build_key, r2_enabled, upload_r2_object
    import ingest_hybrid

    enabled = r2_enabled()
    print(f"\nR2 enabled: {enabled}  |  {len(downloaded)} files downloaded", flush=True)
    if not downloaded:
        sys.exit(1)

    conn = ingest_hybrid.get_conn()
    try:
        with conn.cursor() as cur:
            for name, _size in downloaded:
                file_name = f"{SUBJECT}/{name}"
                local = SUBJECT_DIR / name
                # R2 upload (best-effort)
                r2status = "skipped"
                if enabled:
                    try:
                        upload_r2_object(build_key(SUBJECT, name), local)
                        r2status = "uploaded"
                    except Exception as exc:
                        print(f"  R2 upload failed for {name}: {exc!r}", flush=True)
                        r2status = "r2-error"
                register_document(file_name, local, cur)
                print(f"reg {file_name}  (r2={r2status})", flush=True)
        conn.commit()
    except Exception as exc:
        conn.rollback()
        print(f"DB registration failed: {exc!r}", flush=True)
        sys.exit(1)
    finally:
        ingest_hybrid.release_conn(conn)

    print("\nFailed:")
    for name, err in failed or [("(none)", "")]:
        print(f"  {name}: {err}", flush=True)


if __name__ == "__main__":
    main()
