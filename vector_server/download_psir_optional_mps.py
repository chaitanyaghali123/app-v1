"""
Download IGNOU MPS / MPSE (Master of Arts in Political Science) course PDFs
from eGyanKosh (open-access, legally redistributable official IGNOU SLM) for
the PSIR Optional subject. Adds MA-level depth missing from the current
BPSE/EPS undergraduate list:

  Paper 1 (Political Theory & Thought):
    - MPS-001 Political Theory (State/Justice/Equality/Rights/Democracy;
      ideologies: Liberalism, Marxism, Socialism, Libertarianism, Fascism,
      Feminism, Multiculturalism; Gandhi, Communitarianism)
    - MPSE-003 Western Political Thought (Plato to Marx: Aristotle,
      Machiavelli, Hobbes, Locke, Mill, Gramsci, Arendt)
    - MPSE-004 Social and Political Thought in Modern India (Kautilya,
      Syed Ahmed Khan, Aurobindo, Gandhi, Ambedkar, Roy)
  Paper 1 (Comparative & Indian Government):
    - MPS-004 Comparative Politics: Issues and Trends
    - MPS-003 India: Democracy and Development
  Paper 2 (International Relations & India & the World):
    - MPS-002 International Relations: Theory and Problems (Realism,
      Liberalism, System Theory, Hegemony, Arms Race, UN security)
    - MPSE-001 India and the World (foreign policy, bilateral, groupings)

Files saved to /app/data/optional/political-science-optional/, uploaded to R2
under `optional/political-science-optional/<file>`, registered in `documents`
with subject_id='political-science-optional'.

Run inside the aryabhata-ingestor container:
    python /app/download_psir_optional_mps.py [course_code...]
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

SUBJECT = "political-science-optional"
BASE = Path("/app/data/optional") / SUBJECT
ctx = ssl._create_unverified_context()

UA = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/120 Safari/537.36"
}

# (course_code, handle) — priority courses per user request
COURSES = [
    ("MPS-001", "123456789/5486"),
    ("MPS-002", "123456789/5490"),
    ("MPS-003", "123456789/43903"),
    ("MPS-004", "123456789/43906"),
    ("MPSE-001", "123456789/24365"),
    ("MPSE-003", "123456789/24354"),
    ("MPSE-004", "123456789/24368"),
]

# Never walk into: programme/meta parents plus ALL sibling course handles.
SKIP = set()
for _c, _h in COURSES:
    SKIP.add(_h.split('/')[-1])
for _h in ["5486", "5490", "43903", "43906", "24365", "24354", "24368",
           "24344", "24584", "24590", "24594", "24596", "24861", "24873",
           "24877", "24880", "5639", "5645", "43971", "43935", "43945",
           "43951", "43957", "24362"]:
    SKIP.add(_h)
SKIP.update({"1", "26", "1641", "1644", "1645", "1749", "1757", "57585"})
SKIP.update({"5481", "5482", "5483", "55782", "43964"})

MAX_FILES_PER_COURSE = 35


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


class PSScraper:
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
            total += PSScraper(code, handle).scrape()
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
