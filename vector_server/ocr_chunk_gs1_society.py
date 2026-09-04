"""OCR the 12 image-scan GS1/society PDFs and chunk them into upsc_chunks (gs_paper=gs1).
These NIOS 331 Sociology PDFs have no text layer (image scans), so OCR is required.
Skips docs that already have chunks.
"""
import os, sys, json, hashlib, io, time
from pathlib import Path
sys.path.insert(0, "/app"); os.environ.setdefault("R2_PREFIX","")
import fitz
import pytesseract
from PIL import Image
import ingest_hybrid as ih

SOCIETY_DIR = Path("/app/data/society")
SUBJECT = "society"
GS_PAPER = "gs1"
DPI = 150
OCR_LANG = "eng"
OCR_CONFIG = "--psm 3"
OCR_NAMES = [
    "NIOS331_Sociology_L24_Unity_and_Diversity.pdf",
    "NIOS331_Sociology_L25_National_Integration.pdf",
    "NIOS331_Sociology_L26_Indian_Society_Tribal_Rural_Urban.pdf",
    "NIOS331_Sociology_L27_Caste_System_in_India.pdf",
    "NIOS331_Sociology_L28_Major_Religious_Communities.pdf",
    "NIOS331_Sociology_L29_Major_Social_Problems_of_India.pdf",
    "NIOS331_Sociology_L30_Problems_of_SC_and_ST.pdf",
    "NIOS331_Sociology_L31_Other_Deprived_Sections.pdf",
    "NIOS331_Sociology_L32_Status_of_Women_Socio_Historical.pdf",
    "NIOS331_Sociology_L33_Gender_Discrimination_and_Equality.pdf",
    "NIOS331_Sociology_L34_Problems_of_Women.pdf",
    "NIOS331_Sociology_L35_Women_Empowerment_and_Emancipation.pdf",
]

def hashed(p):
    h=hashlib.sha256()
    with open(p,"rb") as f:
        for c in iter(lambda:f.read(8192),b""): h.update(c)
    return h.hexdigest()

def already_chunked(fname):
    conn=ih.get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM upsc_chunks WHERE source_file=%s",(fname,))
            return cur.fetchone()[0]>0
    finally:
        ih.release_conn(conn)

def ocr_pdf(path):
    doc=fitz.open(str(path))
    parts=[]
    for i,page in enumerate(doc):
        pix = page.get_pixmap(dpi=DPI)
        img = Image.open(io.BytesIO(pix.tobytes("png")))
        txt = pytesseract.image_to_string(img, lang=OCR_LANG, config=OCR_CONFIG)
        parts.append(f"\n--- page {i+1} ---\n"+txt)
        if (i+1)%5==0:
            print(f"  ocr'd {i+1}/{doc.page_count} pages of {path.name}", flush=True)
    return "\n".join(parts)

def insert_rows(rows):
    conn=ih.get_conn()
    try:
        with conn.cursor() as cur:
            from psycopg2.extras import execute_batch
            execute_batch(cur, """
                INSERT INTO upsc_chunks (
                    id, chunk, topic, difficulty, source_file, file_hash,
                    subject_id, chunk_index, page_number, chunk_version, embedding,
                    search_vector, heading_hierarchy, parent_chunk, is_parent_chunk,
                    diagram_url, gs_paper
                ) VALUES (
                    %s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NULL::halfvec,
                    to_tsvector('english', %s), %s::jsonb, %s, %s, %s, %s
                ) ON CONFLICT (id, subject_id) DO UPDATE SET
                    chunk=EXCLUDED.chunk, source_file=EXCLUDED.source_file,
                    file_hash=EXCLUDED.file_hash, chunk_index=EXCLUDED.chunk_index,
                    gs_paper=EXCLUDED.gs_paper
            """, rows, page_size=200)
        conn.commit()
    finally:
        ih.release_conn(conn)

def build_rows(text, fname, fh):
    rows=[]; gidx=0
    chunked = ih.chunk_text(text)
    for c in chunked:
        cid = hashlib.sha256(f"{fh}_{gidx}".encode()).hexdigest()
        rows.append((cid,c["chunk_text"],"general","medium",fname,fh,SUBJECT,gidx,0,1,
                     c["chunk_text"],json.dumps(c.get("heading_hierarchy",[])),c.get("parent_text",""),
                     c.get("is_parent_chunk",False),None,GS_PAPER))
        gidx+=1
    return rows

total=0
for name in OCR_NAMES:
    disk=SOCIETY_DIR/name
    if not disk.exists():
        print("[missing]", name); continue
    fname=f"society/{name}"
    if already_chunked(fname):
        print("[already]", fname); continue
    try:
        text=ocr_pdf(disk)
        cleaned="\n".join(line for line in text.splitlines() if line.strip())
        if len(cleaned.strip()) < 200:
            print(f"[low-ocr] {name}: {len(cleaned)} chars, skipping", flush=True); continue
        fh=hashed(disk)
        rows=build_rows(cleaned, fname, fh)
        if not rows:
            print(f"[no-chunks] {name}", flush=True); continue
        insert_rows(rows)
        total+=len(rows)
        print(f"[ok] {fname} -> {len(rows)} chunks (cum {total}), {len(cleaned)} chars", flush=True)
    except Exception as e:
        print(f"[error] {name}: {type(e).__name__}: {e}", flush=True)
print("DONE OCR total:", total, flush=True)
