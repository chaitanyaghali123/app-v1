import io
from pathlib import Path
import fitz, pytesseract
from PIL import Image

DATA_DIR = Path("/app/data")
FOLDERS = ["gs1", "gs2", "gs3", "essay"]
PREFIXES = ("UPSC_GS", "UPSC_Essay_PYP")
DPI = 150

def ocr_pdf(path):
    doc = fitz.open(str(path))
    parts = []
    for i, page in enumerate(doc):
        pix = page.get_pixmap(dpi=DPI)
        img = Image.open(io.BytesIO(pix.tobytes("png")))
        txt = pytesseract.image_to_string(img, lang="eng", config="--psm 3")
        parts.append(f"--- page {i + 1} ---\n{txt}")
    return "\n".join(parts)

def main():
    pdfs = []
    for folder in FOLDERS:
        d = DATA_DIR / folder
        if not d.exists():
            continue
        for f in sorted(d.glob("*.pdf")):
            if f.name.startswith(PREFIXES):
                pdfs.append(f)
    print(f"pdfs: {len(pdfs)}", flush=True)
    for p in pdfs:
        txt_path = p.with_suffix(".ocr.txt")
        if txt_path.exists() and txt_path.stat().st_size > 400:
            continue
        try:
            text = ocr_pdf(p)
            cleaned = "\n".join(line for line in text.splitlines() if line.strip())
            if len(cleaned.strip()) < 150:
                print(f"[low-ocr] {p.name}: {len(cleaned.strip())}", flush=True)
                continue
            txt_path.write_text(cleaned, encoding="utf-8")
            print(f"[ocr-ok] {p.name} ({len(cleaned)} chars)", flush=True)
        except Exception as e:
            print(f"[ocr-err] {p.name}: {type(e).__name__}: {e}", flush=True)
    print("OCR DONE", flush=True)

if __name__ == "__main__":
    main()