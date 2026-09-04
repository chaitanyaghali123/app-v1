"""
Convert the essay source library texts (.txt) into properly-formatted PDF
documents so the "Source Material" panel presents them exactly like the
gs1-gs4 subjects (which are PDF documents, not raw text).

For each /app/data/essay/*.txt:
    - renders a paginated PDF (title banner, justified body, page numbers)
    - uploads it to R2 as  essay/essay/<Name>.pdf
    - registers it in `documents` under subject_id='essay' with a .pdf file_name
    - removes the previous .txt registration + R2 object for the same source

Run inside the ingestor container:

    python /app/essay_txt_to_pdf.py
"""

import hashlib
import os
import re
import sys
from pathlib import Path

import ingest_hybrid

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    PageTemplate,
    Paragraph,
    Spacer,
)

DATA_DIR = Path("/app/data")
SUBJECT = "essay"
SUBJECT_DIR = DATA_DIR / SUBJECT

FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"
FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"

MAX_PDF_CHARS = 320_000  # keep generated PDFs reasonably sized


def sha256_hex(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(4096), b""):
            h.update(chunk)
    return h.hexdigest()


def clean_title(name: str) -> str:
    base = name.rsplit(".", 1)[0]
    base = base.replace("_", " ")
    base = re.sub(r"\s+", " ", base).strip()
    return base


def render_pdf(txt_path: Path, pdf_path: Path) -> None:
    raw = txt_path.read_text(encoding="utf-8", errors="replace")
    body = raw.strip()
    if len(body) > MAX_PDF_CHARS:
        body = body[:MAX_PDF_CHARS]

    pdfmetrics.registerFont(TTFont("DejaVuSerif", FONT))
    pdfmetrics.registerFont(TTFont("DejaVuSerifBold", FONT_BOLD))

    title = clean_title(txt_path.name)

    doc = BaseDocTemplate(
        str(pdf_path),
        pagesize=A4,
        leftMargin=22 * mm,
        rightMargin=22 * mm,
        topMargin=22 * mm,
        bottomMargin=20 * mm,
        title=title,
        author="UPSC Essay Source Library",
    )

    style_body = ParagraphStyle(
        "Body",
        fontName="DejaVuSerif",
        fontSize=10,
        leading=15,
        alignment=4,  # justified
        spaceAfter=8,
    )
    style_h1 = ParagraphStyle(
        "H1",
        fontName="DejaVuSerifBold",
        fontSize=20,
        leading=26,
        spaceAfter=6,
    )
    style_sub = ParagraphStyle(
        "Sub",
        fontName="DejaVuSerif",
        fontSize=10,
        leading=14,
        spaceAfter=18,
        textColor="#555555",
    )

    def header_footer(canvas, _doc):
        canvas.saveState()
        canvas.setFont("DejaVuSerif", 8)
        canvas.setFillColorRGB(0.35, 0.35, 0.35)
        canvas.drawCentredString(A4[0] / 2.0, 10 * mm, f"{title}  —  {canvas.getPageNumber()}")
        canvas.restoreState()

    frame = Frame(
        doc.leftMargin,
        doc.bottomMargin,
        doc.width,
        doc.height,
        id="main",
    )
    doc.addPageTemplates([PageTemplate(id="page", frames=[frame], onPage=header_footer)])

    story = [Paragraph(title, style_h1), Paragraph("UPSC Essay Source Library", style_sub)]

    for para in body.split("\n\n"):
        cleaned = " ".join(para.split())
        if not cleaned:
            continue
        if len(cleaned) > 4000:
            for chunk_start in range(0, len(cleaned), 4000):
                story.append(Paragraph(cleaned[chunk_start : chunk_start + 4000], style_body))
            continue
        story.append(Paragraph(cleaned, style_body))

    doc.build(story)


def register_document(file_name: str, local_path: Path, cursor) -> None:
    fh = sha256_hex(local_path)
    cursor.execute(
        """
        INSERT INTO documents (file_hash, file_name, subject_id, status, error_message)
        VALUES (%s, %s, %s, 'indexed', NULL)
        ON CONFLICT (file_hash)
        DO UPDATE SET file_name=EXCLUDED.file_name,
                      subject_id=EXCLUDED.subject_id,
                      status='indexed',
                      error_message=NULL,
                      updated_at=NOW()
        """,
        (fh, file_name, SUBJECT),
    )


def main() -> None:
    SUBJECT_DIR.mkdir(parents=True, exist_ok=True)
    from r2_store import build_key, delete_r2_object, r2_enabled, upload_r2_object

    enabled = r2_enabled()
    sources = sorted(SUBJECT_DIR.glob("*.txt"))
    if not sources:
        print("No *.txt files found under", SUBJECT_DIR)
        sys.exit(1)

    conn = ingest_hybrid.get_conn()
    made = []
    try:
        with conn.cursor() as cur:
            for txt in sources:
                base = txt.stem
                pdf_path = SUBJECT_DIR / f"{base}.pdf"
                try:
                    render_pdf(txt, pdf_path)
                except Exception as exc:
                    print(f"ERR render {txt.name}: {exc!r}", flush=True)
                    continue

                file_name = f"{SUBJECT}/{pdf_path.name}"
                r2status = "skipped"
                if enabled:
                    try:
                        upload_r2_object(build_key(SUBJECT, pdf_path.name), pdf_path)
                        r2status = "uploaded"
                    except Exception as exc:
                        print(f"  R2 upload failed {pdf_path.name}: {exc!r}", flush=True)
                        r2status = "r2-error"

                register_document(file_name, pdf_path, cur)

                # Drop the old .txt registration + R2 object for the same source
                old_name = f"{SUBJECT}/{txt.name}"
                cur.execute("DELETE FROM documents WHERE file_name=%s", (old_name,))
                if enabled:
                    try:
                        delete_r2_object(build_key(SUBJECT, txt.name))
                    except Exception as exc:
                        print(f"  R2 delete old failed {txt.name}: {exc!r}", flush=True)

                size = pdf_path.stat().st_size
                made.append((file_name, size))
                print(f"OK  {file_name}  ({size:,} bytes, r2={r2status})", flush=True)
        conn.commit()
    except Exception as exc:
        conn.rollback()
        print(f"DB error: {exc!r}", flush=True)
        sys.exit(1)
    finally:
        ingest_hybrid.release_conn(conn)

    print(f"\nConverted {len(made)} essay sources to PDF.")
    for name, size in made:
        print(f"  + {name} ({size:,} bytes)")


if __name__ == "__main__":
    main()
