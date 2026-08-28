import fitz, urllib.request, os
ua = {'User-Agent': 'Mozilla/5.0'}
def fetch(url, path, timeout=120):
    req = urllib.request.Request(url, headers=ua)
    data = urllib.request.urlopen(req, timeout=timeout).read()
    open(path, 'wb').write(data)
    return len(data)
def sample(path, n=12):
    d = fitz.open(path)
    pages = d.page_count
    idx = sorted(set([0, 1, 2, pages//2, pages//2+1, pages-3, pages-2, pages-1] + list(range(min(n, pages)))))
    idx = sorted(set(idx))
    chars = {i: len(d[i].get_text().strip()) for i in idx}
    total = sum(chars.values())
    print(os.path.basename(path), '| pages=', pages, '| sampled_pages=', len(idx), '| sampled_chars=', total, '| empty_pages=', sum(1 for v in chars.values() if v < 40))
    p0 = d[0].get_text().strip().replace('\n', ' | ')[:110] if chars.get(0, 0) > 0 else '(empty page0)'
    print('   first=', p0)
    return pages, total

fetch('https://cic.gov.in/sites/default/files/RTI_English.pdf', '/tmp/rti_cic.pdf')
sample('/tmp/rti_cic.pdf')

os.makedirs('/app/data/gs2/ethics', exist_ok=True)
fetch('https://home.wb.gov.in/public/assets/frontend/pdf/lokpal_lokayukt_act_2013.pdf', '/app/data/gs2/ethics/Lokpal_and_Lokayuktas_Act_2013.pdf')
sample('/app/data/gs2/ethics/Lokpal_and_Lokayuktas_Act_2013.pdf')

print('--- rajya sabha compendium sampling ---')
sample('/app/data/gs2/ethics/_Lokpal_RS_compendium.pdf' if os.path.exists('/app/data/gs2/ethics/_Lokpal_RS_compendium.pdf') else '/tmp/none.pdf') if False else None