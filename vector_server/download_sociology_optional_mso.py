"""
Download IGNOU MSO (Master of Arts in Sociology) course PDFs from eGyanKosh
(open-access, legally redistributable official IGNOU SLM) for the Sociology
Optional subject. Adds MA-level depth that the existing ESO/NCERT list lacks:

  Paper 1 (Foundations):
    - MSO-001 Sociological Theories and Concepts (classical + contemporary
      thinkers: Marx/Durkheim/Weber/Parsons/Merton/Mead)
    - MSO-002 Research Methodologies and Methods (positivism, non-positivist,
      quantitative/qualitative, sampling, variables, data collection)
    - MSO-003 Sociology of Development (dependency: Frank/Wallerstein,
      modernization, sustainable development, knowledge society)
  Paper 2 (Indian Society):
    - MSO-004 Sociology in India (Indology Ghurye, structural-functionalism
      Srinivas, dialectical AR Desai, Dumont, Ambedkar, village/caste studies)
    - MSOE-001 Sociology of Education
    - MSOE-003 Sociology of Religion
    - MSOE-004 Urban Sociology

Files saved to /app/data/optional/sociology-optional/, uploaded to R2 under
`optional/sociology-optional/<file>`, registered in `documents` with
subject_id='sociology-optional'.

Run inside the aryabhata-ingestor container:
    python /app/download_sociology_optional_mso.py [course_code...]
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

SUBJECT = "sociology-optional"
BASE = Path("/app/data/optional") / SUBJECT
ctx = ssl._create_unverified_context()

UA = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/120 Safari/537.36"
}

COURSES = [
    ("MSO-001", "123456789/4326"),
    ("MSO-002", "123456789/4340"),
    ("MSO-003", "123456789/4358"),
    ("MSO-004", "123456789/4368"),
    ("MSOE-001", "123456789/4383"),
    ("MSOE-002", "123456789/4394"),
    ("MSOE-003", "123456789/4403"),
    ("MSOE-004", "123456789/4418"),
]

SKIP = set()
for _c, _h in COURSES:
    SKIP.add(_h.split('/')[-1])
# programme/meta parents
SKIP.update({"1", "26", "1641", "1644", "1645", "1749", "57585"})
SKIP.update({"4320", "4322", "4324", "54236", "50256", "27832",
             "4326", "4340", "4358", "4368", "4383", "4394", "4403", "4418"})

MAX_FILES_PER_COURSE = 30


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


class SoScraper:
    def __init__(self, code, handle):
        self.code = code
        self.handle = handle
        self.dir = BASE
        self.dir.mkdir(parents=True, exist_ok=True)
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
        rel = f"{SUBJECT}/{local.name}"
        key = f"optional/{SUBJECT}/{local.name}"
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
                (fh, rel, SUBJECT),
            )
        self.conn.commit()

    def download_bitstream(self, url, name, hid):
        safe = self.safe_name(name, hid)
        if self.count >= MAX_FILES_PER_COURSE or safe in self.seen_files:
            return
        dest = self.dir / safe
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
        time.sleep(0.4)

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
        pat = re.compile(r'/handle/' + base + r'/(\d+)', re.I)
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
        print('==', self.code, self.handle, '==', flush=True)
        self.walk(self.handle, 0, 2)
        print('  files', self.count, self.code, flush=True)
        ingest_hybrid.release_conn(self.conn)
        return self.count


def main():
    BASE.mkdir(parents=True, exist_ok=True)
    targets = sys.argv[1:]
    courses = [(c, h) for c, h in COURSES if not targets or c in targets]
    if not courses:
        courses = COURSES
    total = 0
    for code, handle in courses:
        try:
            total += SoScraper(code, handle).scrape()
        except Exception as exc:
            print('  ERROR', code, exc, flush=True)

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

    print("\nTOTAL files:", total)


if __name__ == "__main__":
    main()
