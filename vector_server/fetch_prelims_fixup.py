import sys, os, ssl, urllib.request, time
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


def fetch(url, dest, tries=3):
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=240, context=ctx) as r:
                data = r.read()
            if len(data) < 3000 or not data[:5].startswith(b"%PDF"):
                raise ValueError(f"bad {len(data)} {data[:20]!r}")
            dest.write_bytes(data)
            return len(data)
        except Exception as e:
            last = e
            time.sleep(2)
    raise last


def first_page_text(path):
    try:
        import ingest_hybrid as ih

        out = []
        for rec in ih.read_pdf_pages(path):
            t = (rec["text"] if isinstance(rec, dict) else "") or ""
            out.append(t)
            if len(" ".join(out)) > 400:
                break
        return " ".join(out).lower()
    except Exception as e:
        return "ERR " + repr(e)[:60]


ok = fail = 0

phys = Path("/app/data/prelims/science-tech/NCERT_Class12_Physics_PartII_full.pdf")
rel = "prelims/science-tech/NCERT_Class12_Physics_PartII_full.pdf"
if phys.exists() and phys.stat().st_size > 3000:
    r2_store.upload_r2_object(rel, str(phys))
    register(rel, "science-tech")
    print("[ok] physics-part2 registered", phys.stat().st_size, flush=True)
    ok += 1

bio_srcs = [
    "https://www.ncertbooks.net/textbook/pdf/lebo109.pdf",
    "https://ncert.nic.in/textbook/pdf/lebo109.pdf",
]
bio_done = False
for url in bio_srcs:
    try:
        dest = Path("/app/data/prelims/science-tech/NCERT_Class12_Biology_Biotechnology_Principles_and_Processes.pdf")
        fetch(url, dest)
        txt = first_page_text(dest)
        if "biotechnolog" not in txt:
            print("[bio MISM]", repr(txt[:110]), flush=True)
            continue
        r2_store.upload_r2_object(
            "prelims/science-tech/NCERT_Class12_Biology_Biotechnology_Principles_and_Processes.pdf",
            str(dest),
        )
        register(
            "prelims/science-tech/NCERT_Class12_Biology_Biotechnology_Principles_and_Processes.pdf",
            "science-tech",
        )
        print("[ok] biotech-principles", dest.stat().st_size, repr(txt[:70]), flush=True)
        ok += 1
        bio_done = True
        break
    except Exception as e:
        print("[bio fail]", repr(e)[:80], flush=True)
if not bio_done:
    fail += 1

print(f"FIXUP DONE ok={ok} fail={fail}", flush=True)