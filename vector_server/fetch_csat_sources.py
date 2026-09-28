"""CSAT (Prelims Paper-II) source fetcher.

Downloads NCERT full-book zips from ncert.nic.in, merges the chapter PDFs into
one PDF, and uploads to R2 under prelims/paper-ii-csat/<group>/<name>.pdf.
Also uploads ARC report PDFs already present on disk, plus the live Economic
Survey chapters PDF from indiabudget.gov.in.

Run inside aryabhata-ingestor:
    python /app/fetch_csat_sources.py
"""
import io
import ssl
import sys
import shutil
import tempfile
import urllib.request
import zipfile
from pathlib import Path

sys.path.insert(0, "/app")
import r2_store

CTX = ssl._create_unverified_context()
UA = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "Chrome/120 Safari/537.36"
    )
}
BASE = "https://ncert.nic.in/textbook/pdf"
ROOT = Path("/app/data/prelims/paper-ii-csat")

# (group, dest_name, ncert_code)
NCERT = [
    ("english", "NCERT_Class10_English_First_Flight", "jeff1"),
    ("english", "NCERT_Class10_English_Footprints_Without_Feet", "jefp1"),
    ("english", "NCERT_Class12_English_Flamingo", "lefl1"),
    ("english", "NCERT_Class12_English_Vistas", "levt1"),
    ("math", "NCERT_Class6_Math", "femh1"),
    ("math", "NCERT_Class7_Math", "gemh1"),
    ("math", "NCERT_Class8_Math", "hemh1"),
    ("math", "NCERT_Class9_Math", "iemh1"),
    ("math", "NCERT_Class10_Math", "jemh1"),
    ("math", "NCERT_Class11_Math", "kemh1"),
    ("math", "NCERT_Class12_Math_Part1", "lemh1"),
    ("math", "NCERT_Class12_Math_Part2", "lemh2"),
    ("psychology", "NCERT_Class11_Psychology", "kepy1"),
    ("psychology", "NCERT_Class12_Psychology", "lepy1"),
]

# (group, dest_name, url) — single still-live official govt source
WEB = [
    ("government", "EconomicSurvey_2025-26_Chapters",
     "https://www.indiabudget.gov.in/economicsurvey/doc/echapter.pdF"),
]

# (src_path, group, dest_name)
LOCAL = [
    ("/app/data/constitution/ARC_Report01_RTI_MasterKey.pdf",
     "arc", "ARC_Report01_RTI_MasterKey"),
    ("/app/data/constitution/ARC_Report04_Ethics_in_Governance.pdf",
     "arc", "ARC_Report04_Ethics_in_Governance"),
    ("/app/data/constitution/ARC_Report10_Personnel_Administration.pdf",
     "arc", "ARC_Report10_Personnel_Administration"),
]


def fetch(url, timeout=300):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout, context=CTX) as r:
        return r.read()


def merge_zip_pdfs(raw, dest):
    import fitz

    zf = zipfile.ZipFile(io.BytesIO(raw))
    names = sorted(n for n in zf.namelist() if n.lower().endswith(".pdf"))
    if not names:
        raise ValueError("zip has no pdfs")
    tmp = Path(tempfile.mkdtemp())
    try:
        parts = []
        for n in names:
            p = tmp / Path(n).name
            p.write_bytes(zf.read(n))
            parts.append(p)
        out = fitz.open()
        for p in parts:
            with fitz.open(str(p)) as d:
                out.insert_pdf(d)
        dest.parent.mkdir(parents=True, exist_ok=True)
        out.save(str(dest))
        out.close()
        return len(parts)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def upload(local: Path, group, dest_name):
    key = "prelims/paper-ii-csat/{}/{}.pdf".format(group, dest_name)
    r2_store.upload_r2_object(key, str(local))
    return key


def main():
    ok = fail = 0
    for group, name, code in NCERT:
        dest = ROOT / group / (name + ".pdf")
        try:
            if dest.exists() and dest.stat().st_size > 20000:
                n = "cached"
            else:
                raw = fetch("{}/{}dd.zip".format(BASE, code))
                n = merge_zip_pdfs(raw, dest)
            key = upload(dest, group, name)
            print("OK  {:<55} chapters={} -> {}".format(name, n, key))
            ok += 1
        except Exception as e:
            print("FAIL {:<55} {}".format(name, repr(e)[:120]))
            fail += 1

    for group, name, url in WEB:
        dest = ROOT / group / (name + ".pdf")
        try:
            if dest.exists() and dest.stat().st_size > 20000:
                print("OK  {:<55} cached -> {}".format(name, url))
            else:
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(fetch(url))
            key = upload(dest, group, name)
            print("OK  {:<55} -> {}".format(name, key))
            ok += 1
        except Exception as e:
            print("FAIL {:<55} {}".format(name, repr(e)[:120]))
            fail += 1

    for src, group, name in LOCAL:
        try:
            p = Path(src)
            if not p.exists():
                raise FileNotFoundError(src)
            key = upload(p, group, name)
            print("OK  {:<55} local -> {}".format(name, key))
            ok += 1
        except Exception as e:
            print("FAIL {:<55} {}".format(name, repr(e)[:120]))
            fail += 1

    print("\nDONE ok={} fail={}".format(ok, fail))


if __name__ == "__main__":
    main()
