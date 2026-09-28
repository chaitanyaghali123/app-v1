"""Round-2 Prelims downloads: confirmed public-domain PDFs.

Constitution (indiacode.nic.in), old NCERT history books (NCERT, mirrored),
Introduction to Indian Art Part I, RBI Annual Report 2024-25. Physics class-12
chapter PDFs are fetched from the ncertbooks.net mirror and verified by
first-page keyword text before being registered (avoids wrong-chapter ingest).
"""
import os, sys, ssl, urllib.request, tempfile
from pathlib import Path

sys.path.insert(0, "/app")
os.environ.setdefault("R2_PREFIX", "")
import r2_store, ingest_hybrid

ctx = ssl._create_unverified_context()
UA = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "Chrome/120 Safari/537.36"
    )
}

CANON = {
    "polity-governance": "polity",
    "history-art-culture": "history",
    "geography": "geography",
    "economy": "economy",
    "environment-ecology": "environment",
    "science-tech": "science-tech",
    "current-affairs": "current-affairs",
}

downloads = [
    ("polity-governance", "Constitution_of_India_As_on_2020.pdf",
     "https://www.indiacode.nic.in/bitstream/123456789/16124/1/the_constitution_of_india.pdf"),
    ("history-art-culture", "Old_NCERT_Ancient_India_RS_Sharma.pdf",
     "https://www.drishtiias.com/pdf/1639631925_1.%20Ancient_India_RS_Sharma.pdf"),
    ("history-art-culture", "Old_NCERT_Medieval_India_Satish_Chandra.pdf",
     "https://chromeias.com/wp-content/uploads/2020/03/Medieval-India-Satish-Chandra.pdf"),
    ("history-art-culture", "Old_NCERT_Modern_India_Bipan_Chandra.pdf",
     "https://chromeias.com/wp-content/uploads/2020/03/Modern-India-Bipan-Chandra.pdf"),
    ("history-art-culture", "NCERT_An_Introduction_to_Indian_Art_Part_I.pdf",
     "https://www.iaspcsprep.com/wp-content/uploads/2024/02/Class-11-Art-Culture-Introduction-to-Indian-Art-%E2%80%93-Part-I.pdf"),
    ("economy", "RBI_Annual_Report_2024-25.pdf",
     "https://rbidocs.rbi.org.in/rdocs/AnnualReport/PDFs/0ANNUALREPORT202425DA4AE08189C848C8846718B080F2A0A9.PDF"),
]

# class-12 physics part II chapter codes (ncertbooks.net mirror); verified by text.
PHYSICS_CANDS = [
    ("leph206", "semiconductor"),
    ("leph207", "communication"),
]
NB = "https://www.ncertbooks.net/textbook/pdf"


def sha256_hex(p):
    import hashlib
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for c in iter(lambda: f.read(8192), b""):
            h.update(c)
    return h.hexdigest()


def register(rel, subj):
    dest = Path("/app/data") / rel
    fh = sha256_hex(dest)
    conn = ingest_hybrid.get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO documents (file_hash,file_name,subject_id,status) "
                "VALUES (%s,%s,%s,'indexed') ON CONFLICT (file_hash) DO UPDATE "
                "SET file_name=EXCLUDED.file_name,subject_id=EXCLUDED.subject_id,"
                "status='indexed',error_message=NULL,updated_at=NOW()",
                (fh, rel, subj),
            )
        conn.commit()
    finally:
        ingest_hybrid.release_conn(conn)


def first_page_text(path):
    try:
        import ingest_hybrid as ih
        texts = []
        for rec in ih.read_pdf_pages(path):
            t = (rec["text"] if isinstance(rec, dict) else "") or ""
            texts.append(t)
            if len("".join(texts)) > 500:
                break
        return " ".join(texts).lower()
    except Exception as e:
        print("  [extract-fail]", repr(e)[:80], flush=True)
        return ""


def fetch(url, dest):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=240, context=ctx) as r:
        data = r.read()
    if len(data) < 3000 or not data[:5].startswith(b"%PDF"):
        raise ValueError(f"bad pdf {len(data)} {data[:20]!r}")
    dest.write_bytes(data)
    return len(data)


ok = fail = 0
for sub, name, url in downloads:
    rel = f"prelims/{sub}/{name}"
    dest = Path("/app/data") / rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 3000:
        print("[exists]", rel, flush=True)
        ok += 1
        continue
    try:
        n = fetch(url, dest)
    except Exception as e:
        print("[fetch FAIL]", name, repr(e)[:90], flush=True)
        fail += 1
        continue
    r2_store.upload_r2_object(rel, str(dest))
    register(rel, CANON[sub])
    print("[ok]", rel, n, flush=True)
    ok += 1

for code, kw in PHYSICS_CANDS:
    log_frag = code
    try:
        tmp = Path(tempfile.gettempdir()) / f"{code}.pdf"
        n = fetch(f"{NB}/{code}.pdf", tmp)
        txt = first_page_text(tmp)
        log_frag = txt[:120]
        if kw not in txt:
            print("[phy MISM]", code, kw, repr(txt[:120]), flush=True)
            tmp.unlink(missing_ok=True)
            fail += 1
            continue
        rel = f"prelims/science-tech/NCERT_Class12_Physics_{kw.title().replace(' ', '')}_chapter.pdf"
        dest = Path("/app/data") / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(tmp.read_bytes())
        tmp.unlink(missing_ok=True)
        r2_store.upload_r2_object(rel, str(dest))
        register(rel, "science-tech")
        print("[ok]", rel, n, flush=True)
        ok += 1
    except Exception as e:
        print("[phy FAIL]", code, repr(e)[:90], flush=True)
        fail += 1

print(f"ROUND2 DOWNLOAD DONE ok={ok} fail={fail}")