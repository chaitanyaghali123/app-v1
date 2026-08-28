import fitz, os, glob
for f in sorted(glob.glob('/app/data/gs2/ethics/*.pdf')):
    d = fitz.open(f)
    chars = sum(len(d[i].get_text().strip()) for i in range(min(d.page_count, 5)))
    p0 = d[0].get_text().strip().replace('\n', ' | ')[:120]
    print(os.path.basename(f), '| pages=', d.page_count, '| first5_chars=', chars)
    print('   ', p0)
    d.close()