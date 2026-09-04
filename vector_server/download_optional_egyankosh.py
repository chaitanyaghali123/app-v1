"""
Download representative eGyanKosh (IGNOU/DSpace) course PDFs for optional
subjects into /app/data/optional/<subject>/. Walks a course handle tree and
downloads item bitstreams (blocks/units), capped per course. Run INSIDE the
aryabhata-ingestor container.
"""
import os, re, ssl, sys, time, html, urllib.request, urllib.parse
from pathlib import Path

ctx = ssl._create_unverified_context()
BASE = Path('/app/data/optional')
BASE.mkdir(parents=True, exist_ok=True)

UA = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
                  '(KHTML, like Gecko) Chrome/120 Safari/537.36'
}

# breadcrumb / structural handles that are NOT content items
SKIP = {'1', '19', '5295', '13011', '13012', '13013', '13015', '17615',
        '17618'}

def fetch(url, retries=3):
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=90, context=ctx) as r:
                return r.read()
        except Exception as e:
            if i == retries - 1:
                print('  fetch fail', url, e)
                return None
            time.sleep(2)
    return None

def fetch_text(url):
    d = fetch(url)
    return d.decode('utf-8', errors='replace') if d is not None else None

def extract_id(handle_path):
    m = re.search(r'(\d+)/?$', handle_path or '')
    return m.group(1) if m else None

def dir_id(handle_path):
    return handle_path.replace('/', '-')

def bitstreams_from(page, hid):
    pat = re.compile(r'/bitstream/' + re.escape(hid) + r'/(\d+)/([^"\']+?\.pdf)', re.I)
    found = set()
    for m in pat.finditer(page or ''):
        name = html.unescape(m.group(2))
        url = '/bitstream/' + hid + '/' + m.group(1) + '/' + m.group(2)
        found.add((url, name))
    return sorted(found)

def sub_ids_from(page, hid):
    base = hid.split('/')[0]
    pat = re.compile(r'/handle/' + base + r'/(\d+)', re.I)
    ids = set()
    for m in pat.finditer(page or ''):
        sid = m.group(1)
        if sid in SKIP or sid == extract_id(hid):
            continue
        ids.add(sid)
    return ids


class Scraper:
    def __init__(self, subject, code, handle, cap=14, include_subdirs=True):
        self.subject = subject
        self.code = code
        self.handle = handle
        self.cap = cap
        self.include_subdirs = include_subdirs
        self.dir = BASE / subject
        self.dir.mkdir(parents=True, exist_ok=True)
        self.seen_files = set()
        self.count = 0

    def safe_name(self, name, hid):
        base = re.sub(r'[^\w.\-]+', '_', self.code)
        fname = re.sub(r'[^\w.\-]+', '_', Path(name).stem)
        ext = Path(name).suffix or '.pdf'
        return f"{base}_{dir_id(hid)}_{fname}{ext}"

    def download_bitstream(self, url, name, hid):
        safe = self.safe_name(name, hid)
        if self.count >= self.cap or safe in self.seen_files:
            return
        dest = self.dir / safe
        if dest.exists() and dest.stat().st_size > 3000:
            self.seen_files.add(safe)
            self.count += 1
            return
        data = fetch('https://egyankosh.ac.in' + url)
        if not data or len(data) < 3000 or not data[:5].startswith(b'%PDF'):
            print('  bad', url, len(data) if data else 0)
            return
        dest.write_bytes(data)
        self.seen_files.add(safe)
        self.count += 1
        print('  saved', safe, len(data))
        time.sleep(0.4)

    def walk(self, hid, depth=0, maxdepth=2, visited=None):
        if visited is None:
            visited = set()
        if hid in visited or depth > maxdepth or self.count >= self.cap:
            return
        visited.add(hid)
        page = fetch_text('https://egyankosh.ac.in/handle/' + hid)
        if not page:
            return
        bs = bitstreams_from(page, hid)
        if bs:
            for url, name in bs:
                self.download_bitstream(url, name, hid)
        if self.count >= self.cap:
            return
        # recurse into child ids (blocks/units)
        for sid in sub_ids_from(page, hid):
            if self.count >= self.cap:
                break
            child = hid.split('/')[0] + '/' + sid
            if child in visited:
                continue
            self.walk(child, depth + 1, maxdepth, visited)

    def scrape(self):
        print('==', self.code, self.handle, '==')
        self.walk(self.handle, 0, 2)
        print('  files', self.count, self.code)
        return self.count
