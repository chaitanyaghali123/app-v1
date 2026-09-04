"""Add 2nd ARC Report 14 (Financial Management Systems) for GS4 public-funds/financial-probity gap."""
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

items = [
    # (subdir, diskname, url)
    ("governance", "ARC_Report14_Financial_Management.pdf",
     "https://vajiramias.sgp1.cdn.digitaloceanspaces.com/strapi/Strengthening_Financial_Management_Systems_4636921b93.pdf"),
]

for subdir, name, url in items:
    disk_dir = "/app/data/" + subdir
    os.makedirs(disk_dir, exist_ok=True)
    dest = os.path.join(disk_dir, name)
    if os.path.exists(dest) and os.path.getsize(dest) > 3000:
        print("exists", dest)
        continue
    try:
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=120, context=ctx) as r:
            data = r.read()
    except Exception as e:
        print("fetch FAIL", name, e)
        continue
    if len(data) < 3000:
        print("too small", name, len(data))
        continue
    d = data
    if not d[:5].startswith(b"%PDF"):
        idx = d.find(b"%PDF")
        if idx != -1:
            d = d[idx:]
        else:
            print("not PDF", name, d[:20])
            continue
    with open(dest, "wb") as f:
        f.write(d)
    fh = sha256_hex(dest)
    conn = ingest_hybrid.get_conn()
    rel = f"{subdir}/{name}"
    if subdir == "governance":
        r2key = f"gs2/{subdir}/{name}"
    elif subdir == "ethics":
        r2key = f"gs4/{subdir}/{name}"
    else:
        r2key = f"{subdir}/{name}"
    r2_store.upload_r2_object(r2key, dest)
    with conn.cursor() as cur:
        cur.execute("INSERT INTO documents (file_hash,file_name,subject_id,status) VALUES (%s,%s,%s,'indexed') ON CONFLICT (file_hash) DO UPDATE SET file_name=EXCLUDED.file_name,subject_id=EXCLUDED.subject_id,status='indexed',error_message=NULL,updated_at=NOW()", (fh, rel, subdir))
    conn.commit()
    ingest_hybrid.release_conn(conn)
    print("OK", rel, len(d), "bytes, r2="+r2key)
