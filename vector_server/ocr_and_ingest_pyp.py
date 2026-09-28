"""OCR the scanned official UPSC mains question papers (GS1/2/3 + Essay, 2019-2026)
into text files, then ingest them through the normal pipeline (verbatim SAFE source
with full embeddings)."""
import io
import os
import sys
from pathlib import Path

import fitz
import pytesseract
from PIL import Image
import ingest_hybrid as ih

DATA_DIR = Path("/app/data")
FOLDERS = ["gs1", "gs2", "gs3", "essay"]
PREFIXES = ("UPSC_GS", "UPSC_Essay_PYP")
DPI = 150
OCR_LANG = "eng"
OCR_CONFIG = "--psm 3"

def ocr_pdf(path):
    doc = fitz.open(str(path))
    parts = []
    for i, page in enumerate(doc):
        pix = page.get_pixmap(dpi=DPI)
        img = Image.open(io.BytesIO(pix.tobytes("png")))
        txt = pytesseract.image_to_string(img, lang=OCR_LANG, config=OCR_CONFIG)
        parts.append(f"--- page {i + 1} ---\n{txt}")
        if (i + 1) % 4 == 0:
            print(f"  ocr {path.name} {i + 1}/{doc.page_count}", flush=True)
    return "\n".join(parts)

def main():
    ih.root_folder = DATA_DIR
    ih.ensure_tables()

    pdfs = []
    for folder in FOLDERS:
        d = DATA_DIR / folder
        if not d.exists():
            continue
        for f in sorted(d.glob("*.pdf")):
            if f.name.startswith(PREFIXES):
                pdfs.append(f)
    print(f"pdfs: {len(pdfs)}", flush=True)

    ocr_texts = []
    for p in pdfs:
        txt_path = p.with_suffix(".ocr.txt")
        if txt_path.exists() and txt_path.stat().st_size > 400:
            ocr_texts.append(txt_path)
            print(f"[cached] {txt_path.name}", flush=True)
            continue
        try:
            text = ocr_pdf(p)
            cleaned = "\n".join(line for line in text.splitlines() if line.strip())
            if len(cleaned.strip()) < 150:
                print(f"[low-ocr] {p.name}: {len(cleaned.strip())} chars", flush=True)
                continue
            txt_path.write_text(cleaned, encoding="utf-8")
            ocr_texts.append(txt_path)
            print(f"[ocr-ok] {p.name} -> {txt_path.name} ({len(cleaned)} chars)", flush=True)
        except Exception as e:
            print(f"[ocr-err] {p.name}: {type(e).__name__}: {e}", flush=True)

    print(f"text files to ingest: {len(ocr_texts)}", flush=True)
    for i, t in enumerate(ocr_texts, 1):
        try:
            ih.process_file(t)
            print(f"[ingested] {t.name}", flush=True)
        except Exception as e:
            print(f"[ingest-err] {t.name}: {type(e).__name__}: {e}", flush=True)
        finally:
            if i % 5 == 0:
                print(f"  progress {i}/{len(ocr_texts)}", flush=True)

    print("DONE", flush=True)

if __name__ == "__main__":
    main()