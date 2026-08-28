import sys, hashlib, zlib
from pathlib import Path
sys.path.insert(0, '/app')
from ingest_hybrid import read_pdf_pages, chunk_text, PDF_PAGE_BATCH_SIZE
import fitz

path = Path('/app/data/gs2/culture/NIOS223_Lesson13_English.pdf')

# 1) decompress ALL page content streams and grep for foreign text
doc = fitz.open(str(path))
found = False
for i in range(doc.page_count):
    page = doc[i]
    try:
        streams = page.read_contents()  # bytes of all content streams
    except Exception as e:
        streams = b''
    if b'European' in streams or b'Cagle' in streams or b'onstitu' in streams:
        print(f"page {i+1}: FOREIGN TEXT IN CONTENT STREAMS!")
        found = True
# also walk every xref Flate stream
for xnum in range(1, doc.xref_length()):
    try:
        obj = doc.xref_object(xnum, compressed=True)
    except Exception:
        continue
    if isinstance(obj, bytes):
        obj = obj.decode('latin-1', 'ignore')
    if 'European' in obj or 'constitution' in obj.lower():
        print("xref", xnum, "contains foreign text")
print("content-stream forensic complete, found=", found)
doc.close()

# 2) default get_text per page '?' ratio
doc = fitz.open(str(path))
for i in range(doc.page_count):
    t = doc[i].get_text()
    q = t.count('?')
    print(f"page {i+1}: text-mode chars={len(t)} '?'={q} foreign={'European constitution' in t}")
doc.close()

# 3) reproduce exact ingest chunking
batch = []
batch_texts = []
all_chunks = []
for pr in read_pdf_pages(path):
    batch.append(pr)
    batch_texts.append(pr["text"])
    if len(batch) >= PDF_PAGE_BATCH_SIZE:
        all_chunks.extend(chunk_text("\n\n".join(batch_texts)))
        batch, batch_texts = [], []
if batch_texts:
    all_chunks.extend(chunk_text("\n\n".join(batch_texts)))

print("reproduced chunks:", len(all_chunks))
c0 = all_chunks[0]["chunk_text"]
print("chunk0 len:", len(c0), "| '?' count:", c0.count('?'))
print("has foreign:", ('European constitution' in c0) or ('government will be constituted' in c0))
print("chunk0 sha256:", hashlib.sha256(c0.encode()).hexdigest())
print("chunk0 first 200:", repr(c0[:200]))