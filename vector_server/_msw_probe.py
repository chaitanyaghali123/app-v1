import re
import sys

sys.path.insert(0, "/app")
import urllib.request
import ssl

ctx = ssl._create_unverified_context()
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"}


def fetch(url):
    try:
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=60, context=ctx) as r:
            return r.read().decode("utf-8", errors="replace")
    except Exception as e:
        return "ERR " + str(e)


handles = sys.argv[1:]
for h in handles:
    page = fetch("https://egyankosh.ac.in/handle/" + h)
    print("=== " + h + " ===")
    # sub-communities: links pointing at handles with a short title
    for m in re.finditer(r'href="[^"]*handle/123456789/(\d+)"[^>]*>([^<]{2,90})<', page):
        sid, title = m.group(1), m.group(2).strip()
        if "simple-search" in title or "filterquery" in title:
            continue
        print(sid, "|", title)