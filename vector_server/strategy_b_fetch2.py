import ssl, urllib.request, warnings
from pathlib import Path
warnings.filterwarnings("ignore")

OUT = Path("/app/tmp_sources"); OUT.mkdir(exist_ok=True, parents=True)
ctx = ssl.create_default_context(); ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE
opener = urllib.request.build_opener(urllib.request.HTTPSHandler(context=ctx))

CANDIDATES = {
 "NCERT-c12-primary.pdf":    "https://ncert.nic.in/textbook/pdf/legy105.pdf",
 "NCERT-c12-secondary.pdf":  "https://ncert.nic.in/textbook/pdf/legy106.pdf",
 "NCERT-c12-tertiary.pdf":   "https://ncert.nic.in/textbook/pdf/legy107.pdf",
 "NCERT-c12-land-agri.pdf":  "https://ncert.nic.in/textbook/pdf/legy205.pdf",
 "NCERT-c12-water.pdf":      "https://ncert.nic.in/textbook/pdf/legy206.pdf",
 "NCERT-c12-minerals.pdf":   "https://ncert.nic.in/textbook/pdf/legy207.pdf",
 "NCERT-c12-industries.pdf": "https://ncert.nic.in/textbook/pdf/legy208.pdf",
 "NCERT-c12-geo-persp.pdf":  "https://ncert.nic.in/textbook/pdf/legy212.pdf",
 "DPIIT-IPR-Policy-2016.pdf": "https://www.dpiit.gov.in/static/uploads/2025/07/442648f225695b31b259e9d9edd0a8b1.pdf",
}
ok = []
for name, url in CANDIDATES.items():
    dest = OUT / name
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with opener.open(req, timeout=40) as r:
            data = r.read() or b""
        dest.write_bytes(data)
        head = data[:12]
        if len(data) > 2000:
            ok.append(name)
            print(f"OK   {name:30} {len(data):>9} {r.status} {head!r}")
        else:
            print(f"SMALL {name:28} {len(data):>9} {r.status} {head!r}")
    except Exception as e:
        print(f"FAIL {name:30} {repr(e)[:70]}")
print("ok:", ok)