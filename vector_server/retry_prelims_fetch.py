import sys, ssl, urllib.request, tempfile
from pathlib import Path
sys.path.insert(0, "/app")
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
    "economy": "economy",
    "science-tech": "science-tech",
}


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


def fetch(url, dest):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=240, context=ctx) as r:
        data = r.read()
    if len(data) < 3000 or not data[:5].startswith(b"%PDF"):
        raise ValueError(f"bad {len(data)} {data[:20]!r}")
    dest.write_bytes(data)
    return len(data)


def first_page_text(path):
    try:
        import ingest_hybrid as ih

        out = []
        for rec in ih.read_pdf_pages(path):
            t = (rec["text"] if isinstance(rec, dict) else "") or ""
            out.append(t)
            if len("".join(out)) > 500:
                break
        return " ".join(out).lower()
    except Exception as e:
        return "ERR " + repr(e)[:60]


ok = fail = 0

try:
    dest = Path("/app/data/prelims/polity-governance/Constitution_of_India_As_on_2020.pdf")
    if not (dest.exists() and dest.stat().st_size > 3000):
        fetch(
            "https://www.indiacode.nic.in/bitstream/123456789/19150/1/constitution_of_india.pdf",
            dest,
        )
        r2_store.upload_r2_object(
            "prelims/polity-governance/Constitution_of_India_As_on_2020.pdf", str(dest)
        )
        register("prelims/polity-governance/Constitution_of_India_As_on_2020.pdf", "polity")
        print("[ok] constitution", dest.stat().st_size, flush=True)
        ok += 1
except Exception as e:
    print("[FAIL] constitution", repr(e)[:90], flush=True)
    fail += 1

try:
    dest = Path("/app/data/prelims/economy/RBI_Annual_Report_2024-25_Assessment.pdf")
    if not (dest.exists() and dest.stat().st_size > 3000):
        fetch(
            "https://rbidocs.rbi.org.in/rdocs/AnnualReport/PDFs/01ASSESSMENT290520252C1E3001DF03471CA4DB97E69C306E2F.PDF",
            dest,
        )
        r2_store.upload_r2_object(
            "prelims/economy/RBI_Annual_Report_2024-25_Assessment.pdf", str(dest)
        )
        register("prelims/economy/RBI_Annual_Report_2024-25_Assessment.pdf", "economy")
        print("[ok] rbi-assessment", dest.stat().st_size, flush=True)
        ok += 1
except Exception as e:
    print("[FAIL] rbi", repr(e)[:90], flush=True)
    fail += 1

comm_ok = False
for code in ["leph207", "leph208"]:
    try:
        tmp = Path(tempfile.gettempdir()) / f"{code}.pdf"
        fetch(f"https://www.ncertbooks.net/textbook/pdf/{code}.pdf", tmp)
        txt = first_page_text(tmp)
        print("  [cand]", code, repr(txt[:100]), flush=True)
        if "communication" in txt:
            dest = Path(
                "/app/data/prelims/science-tech/NCERT_Class12_Physics_CommunicationSystems_chapter.pdf"
            )
            dest.write_bytes(tmp.read_bytes())
            tmp.unlink(missing_ok=True)
            r2_store.upload_r2_object(
                "prelims/science-tech/NCERT_Class12_Physics_CommunicationSystems_chapter.pdf",
                str(dest),
            )
            register(
                "prelims/science-tech/NCERT_Class12_Physics_CommunicationSystems_chapter.pdf",
                "science-tech",
            )
            print("[ok] comms via", code, dest.stat().st_size, flush=True)
            ok += 1
            comm_ok = True
            break
    except Exception as e:
        print("  [cand fail]", code, repr(e)[:80], flush=True)
if not comm_ok:
    fail += 1

print(f"RETRY DONE ok={ok} fail={fail}", flush=True)