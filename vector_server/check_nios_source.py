import sys, glob, os
import fitz

candidates = glob.glob('/app/data/gs2/**/NIOS223*', recursive=True)
print("PDF FOUND:", candidates)

path = [c for c in candidates if c.lower().endswith('.pdf')]
if not path:
    sys.exit("no pdf found")
path = path[0]

d = fitz.open(path)
print("page_count=", d.page_count)
# find all pages containing the foreign text
for i in range(d.page_count):
    t = d[i].get_text()
    if 'government will be constituted' in t or 'European constitution' in t.lower():
        print(f"PAGE {i+1} CONTAINS FOREIGN TEXT (chars={len(t)})")
print("==== PAGE 1 FULL TEXT ====")
print(d[0].get_text())
d.close()