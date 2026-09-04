import urllib.request, fitz, os, sys

url = 'https://nidm.gov.in/pdf/guidelines/new/heatwaveguidelines2017.pdf'
tmp = '/tmp/heatwave_nidm.pdf'
try:
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    data = urllib.request.urlopen(req, timeout=60).read()
    open(tmp, 'wb').write(data)
    print('downloaded', len(data))
except Exception as e:
    print('DL FAIL', e)
    sys.exit(1)

doc = fitz.open(tmp)
n = doc.page_count
txt = sum(len(doc[i].get_text("text").strip()) for i in range(n))
print('pages', n, 'chars', txt)
print('head:', doc[0].get_text('text')[:200].replace(chr(10), ' '))
doc.close()