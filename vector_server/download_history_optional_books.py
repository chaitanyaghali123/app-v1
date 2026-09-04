"""
Download public-domain Old NCERT / DLI history books for the History Optional
subject, save into /app/data/optional/history-optional/, upload to R2 under
`optional/history-optional/<file>`, and register in the `documents` table with
subject_id='history-optional' so they appear in the optional Source Material
panel the same way gs/essay PDFs do.

Books (all legally redistributable public-domain items hosted by the Internet
Archive / Digital Library of India, old NCERT editions):
  1. Ancient India          - R.S. Sharma, Class XI (1978)
  2. Medieval India         - Satish Chandra, Old NCERT
  3. Modern India           - Bipan Chandra, Class XII (1971)
  4. Story of Civilization II - Arjun Dev (World History), Class X (1989)

Run inside the ingestor container:
    python /app/download_history_optional_books.py
"""

import hashlib
import json
import os
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, "/app")
os.environ.setdefault("R2_PREFIX", "")
import r2_store
import ingest_hybrid

SUBJECT = "history-optional"
DEST = Path("/app/data/optional") / SUBJECT

BOOKS = [
    {
        "name": "Ancient_India_RS_Sharma_Old_NCERT.pdf",
        "url": "https://archive.org/download/dli.ernet.4087/4087-Ancient%20India%20A%20Textbook%20For%20Class%20Xi_text.pdf",
    },
    {
        "name": "Medieval_India_Satish_Chandra_Old_NCERT.pdf",
        "url": "https://archive.org/download/old-ncert-medieval-india-satish-chandra/Old%20NCERT%20Medieval%20India%20-%20Satish%20Chandra_text.pdf",
    },
    {
        "name": "Modern_India_Bipan_Chandra_Old_NCERT.pdf",
        "url": "https://archive.org/download/dli.ernet.231730/231730-Modern%20India%20A%20History%20Textbook%20For%20Class-xii_text.pdf",
    },
    {
        "name": "World_History_Story_of_Civilization_Vol2_Arjun_Dev.pdf",
        "url": "https://archive.org/download/dli.ernet.231727/231727-The%20Story%20Of%20Civilization%20Vol-ii_text.pdf",
    },
]

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}


def download(url, dest):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=120) as r:
        data = r.read()
    dest.write_bytes(data)
    return len(data)


def sha256_hex(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def main():
    DEST.mkdir(parents=True, exist_ok=True)
    conn = ingest_hybrid.get_conn()
    results = []
    try:
        with conn.cursor() as cur:
            for book in BOOKS:
                name = book["name"]
                local = DEST / name
                if not local.exists() or local.stat().st_size == 0:
                    try:
                        size = download(book["url"], local)
                        print(f"DOWNLOADED {name} ({size} bytes)", flush=True)
                    except Exception as exc:
                        print(f"DOWNLOAD FAIL {name}: {exc!r}", flush=True)
                        results.append((name, "download_failed", str(exc)))
                        continue
                else:
                    print(f"EXISTS {name} ({local.stat().st_size} bytes)", flush=True)

                # verify PDF
                head = local.read_bytes()[:5]
                if head[:4] != b"%PDF":
                    print(f"NOT A PDF {name}, skipping", flush=True)
                    results.append((name, "not_pdf", ""))
                    continue

                # upload to R2
                key = f"optional/{SUBJECT}/{name}"
                try:
                    r2_store.upload_r2_object(key, str(local))
                    print(f"R2 UPLOADED {key}", flush=True)
                except Exception as exc:
                    print(f"R2 FAIL {key}: {exc!r}", flush=True)
                    results.append((name, "r2_failed", str(exc)))
                    continue

                # register in documents
                fh = sha256_hex(local)
                rel = f"{SUBJECT}/{name}"
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
                    (fh, rel, SUBJECT),
                )
                conn.commit()
                print(f"REGISTERED {rel}", flush=True)
                results.append((name, "ok", local.stat().st_size))

        # refresh local R2 manifest to match
        remote = r2_store.list_r2_objects()
        manifest = {}
        for rel, meta in remote.items():
            manifest[rel] = meta["etag"]
        Path("/app/data/.r2_manifest.json").write_text(
            json.dumps(manifest, indent=2), encoding="utf-8"
        )
    except Exception as exc:
        conn.rollback()
        print(f"DB ERROR: {exc!r}", flush=True)
        sys.exit(1)
    finally:
        ingest_hybrid.release_conn(conn)

    print("\n=== SUMMARY ===")
    for name, status, detail in results:
        print(f"{status.upper():16} {name} ({detail})")


if __name__ == "__main__":
    main()
