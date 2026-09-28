"""Download confirmed official Prelims materials into prelims/<subject>/ and
write source-pointer notes for items whose exact PDFs need manual URLs.

Budget 2025-26 PDFs use URLs taken from indiabudget.gov.in directly.
Everything is government/public-domain.
"""
import os, sys, ssl, urllib.request
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
BUD = "https://www.indiabudget.gov.in/budget2025-26/doc"

downloads = [
    ("economy", "Budget_2025-26_At_a_Glance.pdf", f"{BUD}/Budget_at_Glance/budget_at_a_glance.pdf"),
    ("economy", "Budget_2025-26_Highlights_Key_Features.pdf", f"{BUD}/bh1.pdf"),
    ("economy", "Budget_2025-26_Finance_Minister_Speech.pdf", f"{BUD}/Budget_Speech.pdf"),
    ("economy", "Budget_2025-26_Expenditure_Budget_Vol1.pdf", f"{BUD}/eb/vol1.pdf"),
]


def sha256_hex(p):
    import hashlib
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for c in iter(lambda: f.read(8192), b""):
            h.update(c)
    return h.hexdigest()


def register(rel):
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
                (fh, rel, "prelims-" + rel.split("/")[0]),
            )
        conn.commit()
    finally:
        ingest_hybrid.release_conn(conn)


ok = fail = 0
for sub, name, url in downloads:
    rel = f"prelims/{sub}/{name}"
    dest = Path("/app/data") / rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 3000:
        print("[exists]", rel)
        continue
    try:
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=240, context=ctx) as r:
            data = r.read()
    except Exception as e:
        print("[fetch FAIL]", name, repr(e)[:90])
        fail += 1
        continue
    if len(data) < 3000 or not data[:5].startswith(b"%PDF"):
        print("[bad pdf]", name, len(data), data[:20])
        fail += 1
        continue
    dest.write_bytes(data)
    r2_store.upload_r2_object(rel, str(dest))
    register(rel)
    print("[ok]", rel, len(data))
    ok += 1

print(f"DOWNLOAD DONE ok={ok} fail={fail}")