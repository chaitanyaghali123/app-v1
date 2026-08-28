import fitz, json
path = '/app/data/gs2/culture/NIOS223_Lesson13_English.pdf'
d = fitz.open(path)
pg = d[0]

print("== get_text('blocks') first 2500 ==")
blocks = pg.get_text("blocks")
out = [b[4].strip() for b in blocks if b[6] == 0 and b[4].strip()]
bl = "\n\n".join(out)
print(bl[:2500])
print("...")
print("qmark ratio blocks:", bl.count('?') / max(len(bl), 1))

try:
    import pymupdf4llm
    md = pymupdf4llm.to_markdown(d, header=False, footer=False, show_progress=False, page_chunks=True)
    t = md[0]['text']
    print("== pymupdf4llm first 1500 ==")
    print(t[:1500])
    print("qmark ratio md:", t.count('?') / max(len(t), 1))
except Exception as e:
    print("pymupdf4llm failed:", e)

print("== rawdict sample: first 3 spans chars + unicode ==")
raw = pg.get_text("rawdict")
count = 0
for block in raw["blocks"]:
    for line in block.get("lines", []):
        for span in line.get("spans", []):
            s = span["text"]
            print("span chars:", s[:60], "| font:", span.get("font"), "flags:", span.get("flags"))
            count += 1
            if count >= 6:
                break
        if count >= 6:
            break
    if count >= 6:
        break
d.close()