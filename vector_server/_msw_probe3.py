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


for h in sys.argv[1:]:
    page = fetch("https://egyankosh.ac.in/handle/" + h)
    print("=== " + h + " ===")
    for m in re.finditer(r'<a[^>]+href="([^"]*)"[^>]*>(.*?)</a>', page, re.S):
        href, text = m.group(1), re.sub(r'<[^>]+>', '', m.group(2)).strip()
        text = " ".join(text.split())
        if not text:
            continue
        if "block" in text.lower() or "unit" in text.lower() or "/handle/" in href:
            print("LINK", href, "::", text)