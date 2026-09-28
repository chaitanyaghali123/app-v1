import ssl, urllib.request, sys
import warnings
warnings.filterwarnings("ignore")

CANDIDATES = [
    ("ncert kegy101 (plate tectonics cls11)", "https://ncert.nic.in/ncerts/l/kegy101.pdf"),
    ("ncert leyp108 (industry diagnostics?)", "https://ncert.nic.in/ncerts/l/leyp108.pdf"),
    ("ncert legy105 (movements/earthquake)", "https://ncert.nic.in/ncerts/l/legy101.pdf"),
    ("niti mpi 2023 report", "https://www.niti.gov.in/sites/default/files/2023-08/MPI-Report.pdf"),
    ("wipo ip handbook", "https://www.wipo.int/edocs/pubdocs/en/wipo_pub_450_2018.pdf"),
    ("gutenberg bhagavad gita", "https://www.gutenberg.org/ebooks/2388.txt.utf-8"),
]

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE
opener = urllib.request.build_opener(urllib.request.HTTPSHandler(context=ctx))

for label, url in CANDIDATES:
    try:
        with opener.open(url, timeout=25) as r:
            head = r.read(4096)
            print(f"OK   {label:42} {r.status} {r.headers.get('Content-Type','')} head={head[:20]!r}")
    except Exception as e:
        try:
            alt = url.replace("https://", "http://")
            with opener.open(alt, timeout=25) as r:
                head = r.read(4096)
                print(f"HTTP {label:42} {r.status} {r.headers.get('Content-Type','')} head={head[:20]!r}")
        except Exception as e2:
            print(f"FAIL {label:42} {repr(e)[:60]} / alt {repr(e2)[:60]}")