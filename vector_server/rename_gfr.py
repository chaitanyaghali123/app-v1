"""Rename GFR 2017 file to an accurate canonical name on disk, R2, and DB."""
import os, sys, hashlib
sys.path.insert(0, "/app")
os.environ.setdefault("R2_PREFIX", "")
import r2_store, ingest_hybrid

old_rel = "governance/GFR2017_Updated_financial_rules.pdf"
new_name = "GFR_2017_General_Financial_Rules.pdf"
new_rel = "governance/" + new_name
old_disk = "/app/data/governance/GFR2017_Updated_financial_rules.pdf"
new_disk = "/app/data/governance/" + new_name
old_r2 = "gs2/governance/GFR2017_Updated_financial_rules.pdf"
new_r2 = "gs2/governance/" + new_name

if not os.path.exists(old_disk):
    print("old disk missing"); sys.exit(1)

def sha256_hex(p):
    h = hashlib.sha256()
    with open(p,"rb") as f:
        for c in iter(lambda: f.read(8192), b""): h.update(c)
    return h.hexdigest()

os.rename(old_disk, new_disk)
r2_store.upload_r2_object(new_r2, new_disk)
r2_store.delete_r2_object(old_r2)

fh = sha256_hex(new_disk)
conn = ingest_hybrid.get_conn()
with conn.cursor() as cur:
    cur.execute("UPDATE documents SET file_name=%s, updated_at=NOW() WHERE file_name=%s", (new_rel, old_rel))
conn.commit()
ingest_hybrid.release_conn(conn)
print("RENAMED ->", new_rel, "r2="+new_r2, os.path.getsize(new_disk), "bytes")
