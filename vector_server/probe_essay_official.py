import urllib.request

URLS = [
    "https://www.indiabudget.gov.in/budget2025-26/economicsurvey/doc/eschapter/epreface.pdf",
    "https://www.indiabudget.gov.in/budget2025-26/economicsurvey/doc/eschapter/echap01.pdf",
    "https://www.indiabudget.gov.in/budget2025-26/economicsurvey/doc/eschapter/echap09.pdf",
    "https://www.indiabudget.gov.in/budget2025-26/economicsurvey/doc/eschapter/echap11.pdf",
    "https://www.indiabudget.gov.in/budget2025-26/economicsurvey/doc/Infographics%20English.pdf",
]

for u in URLS:
    try:
        req = urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=60) as r:
            data = r.read(256)
            n = r.headers.get("Content-Length")
            ct = r.headers.get("Content-Type")
            print(f"OK   {n} {ct}  {u}")
    except Exception as e:
        print(f"ERR  {u!r}: {e}")
