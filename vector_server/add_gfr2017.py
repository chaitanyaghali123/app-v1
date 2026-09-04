"""Add GFR 2017 (official DoE) for procurement probity + financial audit integrity."""
import os, sys, hashlib, ssl, urllib.request
sys.path.insert(0, "/app")
os.environ.setdefault("R2_PREFIX", "")
import r2_store, ingest_hybrid

ctx = ssl._create_unverified_context()
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"}

def sha256_hex(p):
    h = hashlib.sha256()
    with open(p,"rb") as f:
        for c in iter(lambda: f.read(8192), b""): h.update(c)
    return h.hexdigest()

# (subdir, diskname, [candidate urls])
items = [
    ("governance", "GFR2017_Updated_financial_rules.pdf", [
        "https://doe.gov.in/files/circulars_document/FInal_GFR_upto_31_07_2024.pdf",
        "https://cag.gov.in/uploads/media/General-Financial-Rules-2017-English-20200627111633.pdf",
        "https://doe.gov.in/files/inline-documents/GFR2017.pdf",
    ]),
]

for subdir, name, urls in items:
    disk_dir = "/app/data/" + subdir
    os.makedirs(disk_dir, exist_ok=True)
    dest = os.path.join(disk_dir, name)
    if os.path.exists(dest) and os.path.getsize(dest) > 50000:
        print("exists", dest, os.path.getsize(dest))
        d_ok = True
    else:
        d_ok = False
    for url in urls:
        try:
            if d_ok:
                break
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=180, context=ctx) as r:
                data = r.read()
            if len(data) < 50000:
                print("too small", url, len(data)); continue
            d = data
            if not d[:5].startswith(b"%PDF"):
                idx = d.find(b"%PDF")
                if idx != -1: d = d[idx:]
            if not d[:5].startswith(b"%PDF"):
                print("not PDF", url); continue
            with open(dest, "wb") as f:
                f.write(d)
            d_ok = True
            print("OK fetched", url, len(d), "bytes")
            break
        except Exception as e:
            print("fetch FAIL", url, e)
    if not d_ok and not os.path.exists(dest):
        print("NO SOURCE for", name); continue

    fh = sha256_hex(dest)
    rel = f"{subdir}/{name}"
    r2key = f"gs2/{subdir}/{name}"
    r2_store.upload_r2_object(r2key, dest)
    conn = ingest_hybrid.get_conn()
    with conn.cursor() as cur:
        cur.execute("INSERT INTO documents (file_hash,file_name,subject_id,status) VALUES (%s,%s,%s,'indexed') "
                    "ON CONFLICT (file_hash) DO UPDATE SET file_name=EXCLUDED.file_name,subject_id=EXCLUDED.subject_id,"
                    "status='indexed',error_message=NULL,updated_at=NOW()", (fh, rel, subdir))
    conn.commit()
    ingest_hybrid.release_conn(conn)
    print("OK", rel, os.path.getsize(dest), "bytes, r2="+r2key)
