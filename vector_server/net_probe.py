import urllib.request
for u in ["https://www.indiabudget.gov.in/", "https://ncert.nic.in/"]:
    try:
        r = urllib.request.urlopen(u, timeout=10)
        print(u, "OK", r.status)
    except Exception as e:
        print(u, "FAIL", repr(e)[:120])