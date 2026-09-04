"""
Manifest-driven ingestion for Public Administration (Optional) from the
user-supplied eGyanKosh handle index. Each handle is an ITEM page
(/handle/123456789/<id>) that links to its PDF bitstream. We fetch each item
page, extract the bitstream, download the PDF, upload to R2 and register in
`documents` (subject_id='public-administration-optional') idempotently.

Covers BPAC-131, EPA-01/04/05, MPA-011/012/013/014/015/016, MPAG-001.
Any already-present files short-circuit via the existing dest/exists check.

Run inside the aryabhata-ingestor container:
    python /app/download_pa_optional_manifest.py
"""

import html
import hashlib
import json
import os
import re
import ssl
import sys
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, "/app")
os.environ.setdefault("R2_PREFIX", "")
import r2_store
import ingest_hybrid

SUBJECT = "public-administration-optional"
BASE = Path("/app/data/optional") / SUBJECT
ctx = ssl._create_unverified_context()

UA = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/120 Safari/537.36"
}

# (course_code, item_handle_id) — from the user manifest (IDs only, base 123456789)
ITEMS = [
    # BPAC 131
    ("BPAC-131", "53878"), ("BPAC-131", "53880"), ("BPAC-131", "53884"),
    ("BPAC-131", "53888"), ("BPAC-131", "53900"), ("BPAC-131", "53903"),
    ("BPAC-131", "53906"), ("BPAC-131", "53908"), ("BPAC-131", "53913"),
    ("BPAC-131", "53918"), ("BPAC-131", "53922"), ("BPAC-131", "53926"),
    # EPA 01
    ("EPA-01", "25528"), ("EPA-01", "25529"), ("EPA-01", "25530"),
    ("EPA-01", "25531"), ("EPA-01", "25532"), ("EPA-01", "25533"),
    ("EPA-01", "25534"), ("EPA-01", "25535"), ("EPA-01", "25536"),
    ("EPA-01", "25537"), ("EPA-01", "25538"), ("EPA-01", "25539"),
    ("EPA-01", "25540"), ("EPA-01", "25541"), ("EPA-01", "25542"),
    ("EPA-01", "25543"), ("EPA-01", "25544"), ("EPA-01", "25545"),
    ("EPA-01", "25546"), ("EPA-01", "25547"), ("EPA-01", "25548"),
    ("EPA-01", "25549"), ("EPA-01", "25550"),
    # EPA 04
    ("EPA-04", "25580"), ("EPA-04", "25581"), ("EPA-04", "25582"),
    ("EPA-04", "25583"), ("EPA-04", "25584"), ("EPA-04", "25585"),
    ("EPA-04", "25586"), ("EPA-04", "25587"), ("EPA-04", "25588"),
    ("EPA-04", "25589"), ("EPA-04", "25590"), ("EPA-04", "25591"),
    ("EPA-04", "25592"), ("EPA-04", "25593"),
    # EPA 05
    ("EPA-05", "25605"), ("EPA-05", "25606"), ("EPA-05", "25607"),
    ("EPA-05", "25608"), ("EPA-05", "25609"), ("EPA-05", "25610"),
    ("EPA-05", "25611"), ("EPA-05", "25612"), ("EPA-05", "25613"),
    ("EPA-05", "25614"), ("EPA-05", "25615"), ("EPA-05", "25616"),
    ("EPA-05", "25617"), ("EPA-05", "25618"),
    # MPA 011
    ("MPA-011", "43763"), ("MPA-011", "43764"), ("MPA-011", "43765"),
    ("MPA-011", "43766"), ("MPA-011", "43767"), ("MPA-011", "43768"),
    ("MPA-011", "43769"), ("MPA-011", "43770"), ("MPA-011", "43771"),
    ("MPA-011", "43772"), ("MPA-011", "43773"), ("MPA-011", "43774"),
    ("MPA-011", "43775"), ("MPA-011", "43776"), ("MPA-011", "43777"),
    ("MPA-011", "43778"),
    # MPA 012
    ("MPA-012", "43779"), ("MPA-012", "43780"), ("MPA-012", "43781"),
    ("MPA-012", "43782"), ("MPA-012", "43783"), ("MPA-012", "43784"),
    ("MPA-012", "43785"), ("MPA-012", "43786"), ("MPA-012", "43787"),
    ("MPA-012", "43788"), ("MPA-012", "43789"), ("MPA-012", "43790"),
    ("MPA-012", "43791"), ("MPA-012", "43792"), ("MPA-012", "43793"),
    ("MPA-012", "43794"),
    # MPA 013
    ("MPA-013", "43795"), ("MPA-013", "43796"), ("MPA-013", "43797"),
    ("MPA-013", "43798"), ("MPA-013", "43799"), ("MPA-013", "43800"),
    ("MPA-013", "43801"), ("MPA-013", "43802"), ("MPA-013", "43803"),
    ("MPA-013", "43804"), ("MPA-013", "43805"), ("MPA-013", "43806"),
    ("MPA-013", "43807"), ("MPA-013", "43808"), ("MPA-013", "43809"),
    ("MPA-013", "43810"),
    # MPA 014
    ("MPA-014", "43811"), ("MPA-014", "43812"), ("MPA-014", "43813"),
    ("MPA-014", "43814"), ("MPA-014", "43815"), ("MPA-014", "43816"),
    ("MPA-014", "43817"), ("MPA-014", "43818"), ("MPA-014", "43819"),
    ("MPA-014", "43820"), ("MPA-014", "43821"), ("MPA-014", "43822"),
    ("MPA-014", "43823"), ("MPA-014", "43824"), ("MPA-014", "43825"),
    ("MPA-014", "43826"),
    # MPA 015
    ("MPA-015", "43827"), ("MPA-015", "43828"), ("MPA-015", "43829"),
    ("MPA-015", "43830"), ("MPA-015", "43831"), ("MPA-015", "43832"),
    ("MPA-015", "43833"), ("MPA-015", "43834"), ("MPA-015", "43835"),
    ("MPA-015", "43836"), ("MPA-015", "43837"), ("MPA-015", "43838"),
    ("MPA-015", "43839"), ("MPA-015", "43840"), ("MPA-015", "43841"),
    ("MPA-015", "43842"),
    # MPA 016
    ("MPA-016", "43843"), ("MPA-016", "43844"), ("MPA-016", "43845"),
    ("MPA-016", "43846"), ("MPA-016", "43847"), ("MPA-016", "43848"),
    ("MPA-016", "43849"), ("MPA-016", "43850"),
    # MPAG 001
    ("MPAG-001", "43851"), ("MPAG-001", "43852"), ("MPAG-001", "43853"),
    ("MPAG-001", "43854"), ("MPAG-001", "43855"), ("MPAG-001", "43856"),
    ("MPAG-001", "43857"), ("MPAG-001", "43858"),
]


def fetch(url, retries=8):
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=120, context=ctx) as r:
                return r.read()
        except Exception as e:
            if i == retries - 1:
                print("  fetch fail", url, e)
                return None
            time.sleep(min(2 * (i + 1), 20))
    return None


def fetch_text(url):
    d = fetch(url)
    return d.decode("utf-8", errors="replace") if d is not None else None


def sha256_hex(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def safe_name(code, hid, name):
    base = re.sub(r'[^\w.\-]+', '_', code)
    fname = re.sub(r'[^\w.\-]+', '_', Path(name).stem)
    ext = Path(name).suffix or '.pdf'
    if fname.lower().startswith(base.lower()):
        fname = fname[len(base):].lstrip('_-') or 'index'
    return f"{base}_{hid.replace('/', '-')}_{fname}{ext}"


def register(local, conn):
    fh = sha256_hex(local)
    rel = f"{SUBJECT}/{local.name}"
    key = f"optional/{SUBJECT}/{local.name}"
    try:
        r2_store.upload_r2_object(key, str(local))
    except Exception as exc:
        print("  R2 FAIL", key, exc)
        return
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
            (fh, rel, SUBJECT),
        )
    conn.commit()


def download_item(code, hid, conn):
    full = "123456789/" + hid
    page = fetch_text('https://egyankosh.ac.in/handle/' + full)
    if not page:
        print("  no page", code, hid)
        return 0
    pat = re.compile(r'/bitstream/' + re.escape(full) + r'/(\d+)/([^"\']+?\.pdf)', re.I)
    found = 0
    for m in pat.finditer(page):
        name = html.unescape(m.group(2))
        url = '/bitstream/' + full + '/' + m.group(1) + '/' + m.group(2)
        safe = safe_name(code, full, name)
        dest = BASE / safe
        if dest.exists() and dest.stat().st_size > 3000:
            print("  exists", safe)
            register(dest, conn)
            found += 1
            continue
        data = fetch("https://egyankosh.ac.in" + url)
        if not data or len(data) < 3000 or not data[:5].startswith(b'%PDF'):
            print("  bad", code, hid, len(data) if data else 0)
            continue
        dest.write_bytes(data)
        print("  saved+registered", safe, len(data))
        register(dest, conn)
        found += 1
        time.sleep(0.4)
    return found


def main():
    BASE.mkdir(parents=True, exist_ok=True)
    conn = ingest_hybrid.get_conn()
    total = 0
    try:
        for code, hid in ITEMS:
            try:
                total += download_item(code, hid, conn)
            except Exception as exc:
                print('  ERROR', code, hid, exc, flush=True)
                try:
                    conn.rollback()
                except Exception:
                    pass
    finally:
        ingest_hybrid.release_conn(conn)

    try:
        remote = r2_store.list_r2_objects()
        manifest = {}
        for rel, meta in remote.items():
            manifest[rel] = meta['etag']
        Path('/app/data/.r2_manifest.json').write_text(
            json.dumps(manifest, indent=2), encoding='utf-8')
        print('manifest updated')
    except Exception as exc:
        print('manifest skip', exc)

    print("\nTOTAL:", total)


if __name__ == "__main__":
    main()
