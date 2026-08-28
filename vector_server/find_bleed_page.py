import fitz
path = '/app/data/gs2/culture/NIOS223_Lesson13_English.pdf'
d = fitz.open(path)
targets = ['European constitution', 'government will be constituted', 'READ A CARTOON', 'Cagle', 'objectives']
for i in range(d.page_count):
    blocks = d[i].get_text("blocks")
    txt = "\n\n".join(b[4].strip() for b in blocks if b[6] == 0 and b[4].strip())
    hits = [t for t in targets if t.lower() in txt.lower()]
    print(f"--- page {i+1}: {len(txt)} chars, hits={hits}")
    if hits:
        print(txt[:4000])
d.close()