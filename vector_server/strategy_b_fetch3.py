import ssl, urllib.request, warnings, time
from pathlib import Path
warnings.filterwarnings("ignore")

OUT = Path("/app/tmp_sources"); OUT.mkdir(exist_ok=True, parents=True)
ctx = ssl.create_default_context(); ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE
opener = urllib.request.build_opener(urllib.request.HTTPSHandler(context=ctx))

CANDIDATES = {
 "NCERT-c12-primary.pdf":    "https://ncert.nic.in/textbook/pdf/legy105.pdf",
 "NCERT-c12-geo-persp.pdf":  "https://ncert.nic.in/textbook/pdf/legy212.pdf",
}
for name, url in CANDIDATES.items():
    dest = OUT / name
    got = False
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0", "Accept": "*/*"})
            with opener.open(req, timeout=45) as r:
                data = r.read() or b""
            dest.write_bytes(data)
            if len(data) > 2000:
                print(f"OK   {name:30} {len(data):>9} attempt={attempt+1} {r.status}")
                got = True
            else:
                print(f"SMALL {name:28} {len(data):>9} attempt={attempt+1}")
            break
        except Exception as e:
            print(f"RETRY {name:28} attempt={attempt+1} {repr(e)[:60]}")
            time.sleep(3)
    if not got:
        print(f"GIVEUP {name}")