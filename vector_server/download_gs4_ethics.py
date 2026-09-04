"""
Download IGNOU Philosophy + EI courses from eGyanKosh for GS4 (Ethics) gap-fill.

Courses:
  MPYE-002 Ethics         handle 123456789/4774  (20 units)
  MPY-001 Indian Phil     handle 123456789/4723  (30 units)
  MPY-002 Western Phil    handle 123456789/4795  (30 units)
  MPYE-015 Gandhian Phil  handle 123456789/4853  (16 units)
  BPCS-183 Emotional Int  handle 123456789/68063 (13 units)

Register under subject_id='ethics' in documents. Save to disk at
/app/data/ethics/ethics/, upload to R2 as gs4/ethics/<file>.

Run inside the aryabhata-ingestor container:
    python /app/download_gs4_ethics.py
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

SUBJECT_ID = "ethics"
DISK_DIR = Path("/app/data/ethics") / SUBJECT_ID
DISK_DIR.mkdir(parents=True, exist_ok=True)

ctx = ssl._create_unverified_context()
UA = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/120 Safari/537.36"
}

COURSES = [
    ("MPYE-002", "123456789/4774"),
    ("MPY-001",  "123456789/4723"),
    ("MPY-002",  "123456789/4795"),
    ("MPYE-015", "123456789/4853"),
    ("BPCS-183", "123456789/68063"),
]

# Handles to skip (shared parents, programme-level)
SKIP = {"1757", "1", "26", "1641", "1644", "1645", "1749", "57585",
        "4774", "4723", "4795", "4853", "68063"}
# Also skip sibling course handles
for _c, _h in COURSES:
    SKIP.add(_h.split("/")[-1])

MAX_FILES_PER_COURSE = 50


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


class GS4Scraper:
    def __init__(self, code, handle):
        self.code = code
        self.handle = handle
        self.seen_files = set()
        self.count = 0
        self.conn = ingest_hybrid.get_conn()

    def safe_name(self, name, hid):
        base = re.sub(r'[^\w.\-]+', '_', self.code)
        fname = re.sub(r'[^\w.\-]+', '_', Path(name).stem)
        ext = Path(name).suffix or '.pdf'
        if fname.lower().startswith(base.lower()):
            fname = fname[len(base):].lstrip('_-') or 'index'
        return f"{base}_{hid.replace('/', '-')}_{fname}{ext}"

    def register(self, local):
        fh = sha256_hex(local)
        rel = f"{SUBJECT_ID}/{local.name}"
        key = f"gs4/{SUBJECT_ID}/{local.name}"
        try:
            r2_store.upload_r2_object(key, str(local))
        except Exception as exc:
            print("  R2 FAIL", key, exc)
            return
        with self.conn.cursor() as cur:
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
                (fh, rel, SUBJECT_ID),
            )
        self.conn.commit()

    def download_bitstream(self, url, name, hid):
        safe = self.safe_name(name, hid)
        if self.count >= MAX_FILES_PER_COURSE or safe in self.seen_files:
            return
        dest = DISK_DIR / safe
        if dest.exists() and dest.stat().st_size > 3000:
            self.seen_files.add(safe)
            self.count += 1
            print("  exists", safe)
            self.register(dest)
            return
        data = fetch("https://egyankosh.ac.in" + url)
        if not data or len(data) < 3000 or not data[:5].startswith(b'%PDF'):
            print("  bad", url, len(data) if data else 0)
            return
        dest.write_bytes(data)
        self.seen_files.add(safe)
        self.count += 1
        print("  saved+registered", safe, len(data))
        self.register(dest)
        time.sleep(1.5)

    def bitstreams_from(self, page, hid):
        pat = re.compile(r'/bitstream/' + re.escape(hid) + r'/(\d+)/([^"\']+?\.pdf)', re.I)
        found = set()
        for m in pat.finditer(page or ''):
            name = html.unescape(m.group(2))
            url = '/bitstream/' + hid + '/' + m.group(1) + '/' + m.group(2)
            found.add((url, name))
        return sorted(found)

    def sub_ids_from(self, page, hid):
        base = hid.split('/')[0]
        pat = re.compile(r'/handle/' + re.escape(base) + r'/(\d+)', re.I)
        ids = set()
        for m in pat.finditer(page or ''):
            sid = m.group(1)
            if sid in SKIP or sid == hid.split('/')[-1]:
                continue
            ids.add(sid)
        return ids

    def walk(self, hid, depth=0, maxdepth=2, visited=None):
        if visited is None:
            visited = set()
        if hid in visited or depth > maxdepth or self.count >= MAX_FILES_PER_COURSE:
            return
        visited.add(hid)
        time.sleep(1)
        page = fetch_text('https://egyankosh.ac.in/handle/' + hid)
        if not page:
            return
        bs = self.bitstreams_from(page, hid)
        if bs:
            for url, name in bs:
                self.download_bitstream(url, name, hid)
        if self.count >= MAX_FILES_PER_COURSE:
            return
        for sid in self.sub_ids_from(page, hid):
            if self.count >= MAX_FILES_PER_COURSE:
                break
            child = hid.split('/')[0] + '/' + sid
            if child in visited:
                continue
            self.walk(child, depth + 1, maxdepth, visited)

    def scrape(self):
        print(f'== {self.code} {self.handle} ==', flush=True)
        self.walk(self.handle, 0, 2)
        print(f'  files: {self.count}', flush=True)
        ingest_hybrid.release_conn(self.conn)
        return self.count


def main():
    DISK_DIR.mkdir(parents=True, exist_ok=True)
    total = 0
    for code, handle in COURSES:
        try:
            total += GS4Scraper(code, handle).scrape()
        except Exception as exc:
            print(f'  ERROR {code}: {exc}', flush=True)

    # Also fetch 2 individual units via direct bitstream
    individual = [
        ("EPA-04_Unit21", "https://egyankosh.ac.in/bitstream/123456789/19286/1/BPAC108_Unit21.pdf"),
        ("BPAC-108_Unit8", "https://egyankosh.ac.in/bitstream/123456789/76667/1/BPAC108_Unit8.pdf"),
    ]
    for name, url in individual:
        safe = f"{name}.pdf"
        dest = DISK_DIR / safe
        if dest.exists() and dest.stat().st_size > 3000:
            print(f"  exists: {safe}")
            continue
        data = fetch(url)
        if data and len(data) > 3000 and data[:5].startswith(b'%PDF'):
            dest.write_bytes(data)
            fh = sha256_hex(dest)
            rel = f"{SUBJECT_ID}/{safe}"
            key = f"gs4/{SUBJECT_ID}/{safe}"
            try:
                r2_store.upload_r2_object(key, str(dest))
            except Exception as exc:
                print("  R2 FAIL", key, exc)
                continue
            conn = ingest_hybrid.get_conn()
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
                    (fh, rel, SUBJECT_ID),
                )
            conn.commit()
            ingest_hybrid.release_conn(conn)
            print(f"  saved+registered: {safe} ({len(data)} bytes)")
            total += 1
        else:
            print(f"  FAIL: {name} ({len(data) if data else 0} bytes)")

    print(f"\nTOTAL GS4 new files: {total}")


if __name__ == "__main__":
    main()
