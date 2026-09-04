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
    print("=== " + h + " (len %d)" % len(page))
    # all handle links
    links = re.findall(r'href="/handle/123456789/(\d+)"', page)
    print("handle-link count:", len(links))
    for x in sorted(set(links))[:20]:
        print("  /handle/123456789/" + x)
    # bitstream links
    bs = re.findall(r'href="(/bitstream/123456789/[^"]+\.pdf)"', page)
    print("bitstream count:", len(bs))
    for b in bs[:10]:
        print("  " + b)
    # sub-community section headings
    sub = re.findall(r'<option[^>]*>([^<]+?)</option>', page)
    print("options:", sub[:10])