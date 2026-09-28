"""Round-3 Prelims downloads: class-12 biotech chapters (ncert.nic.in) and the
full NCERT Class-12 Physics Part II (covers Semiconductor + Communication
Systems). Replaces the standalone semiconductor chapter with the full book.
"""
import sys, ssl, urllib.request
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
            if len(" ".join(out)) > 400:
                break
        return " ".join(out).lower()
    except Exception as e:
        return "ERR " + repr(e)[:60]


ok = fail = 0

# --- replace standalone semiconductor chapter with full Part-II book ---
OLD = "prelims/science-tech/NCERT_Class12_Physics_Semiconductor_chapter.pdf"
conn = ingest_hybrid.get_conn()
try:
    with conn.cursor() as cur:
        cur.execute("SELECT file_hash FROM documents WHERE file_name=%s", (OLD,))
        row = cur.fetchone()
        if row:
            fh = row[0]
            cur.execute("DELETE FROM upsc_chunks WHERE file_hash=%s", (fh,))
            cur.execute("DELETE FROM documents WHERE file_hash=%s", (fh,))
            print("[removed standalone semiconductor] chunks + doc", flush=True)
    conn.commit()
finally:
    ingest_hybrid.release_conn(conn)
try:
    r2_store.delete_r2_object(OLD)
    print("[r2 deleted]", OLD, flush=True)
except Exception as e:
    print("[r2 del fail]", repr(e)[:80], flush=True)

phys_srcs = [
    "https://www.drishtiias.com/images/pdf/NCERT-Class-12-Physics-Part-2.pdf",
    "https://ensureias.com/wp-content/uploads/2025/07/NCERT-Class-12-Physics-Part-2.pdf",
]
phys_done = False
for url in phys_srcs:
    try:
        dest = Path("/app/data/prelims/science-tech/NCERT_Class12_Physics_PartII_full.pdf")
        fetch(url, dest)
        txt = first_page_text(dest)
        if "semiconductor" not in txt and "ray optics" not in txt:
            print("[phys MISM]", repr(txt[:120]), flush=True)
            fail += 1
            continue
        r2_store.upload_r2_object(
            "prelims/science-tech/NCERT_Class12_Physics_PartII_full.pdf", str(dest)
        )
        register("prelims/science-tech/NCERT_Class12_Physics_PartII_full.pdf", "science-tech")
        print("[ok] physics-part2", dest.stat().st_size, repr(txt[:80]), flush=True)
        phys_done = True
        ok += 1
        break
    except Exception as e:
        print("[phys FAIL]", repr(e)[:90], flush=True)
        fail += 1
if not phys_done:
    fail += 1

bio = [
    ("lebo109", "Biotechnology_Principles_and_Processes", "principles"),
    ("lebo110", "Biotechnology_and_its_Applications", "applications"),
]
for code, stem, kw in bio:
    rel = f"prelims/science-tech/NCERT_Class12_Biology_{stem}.pdf"
    dest = Path("/app/data") / rel
    if dest.exists() and dest.stat().st_size > 3000:
        print("[exists]", rel, flush=True)
        ok += 1
        continue
    try:
        fetch(f"https://ncert.nic.in/textbook/pdf/{code}.pdf", dest)
        txt = first_page_text(dest)
        if kw not in txt and "biotechnology" not in txt:
            print("[bio MISM]", code, repr(txt[:120]), flush=True)
            dest.unlink(missing_ok=True)
            fail += 1
            continue
        r2_store.upload_r2_object(rel, str(dest))
        register(rel, "science-tech")
        print("[ok]", rel, dest.stat().st_size, repr(txt[:70]), flush=True)
        ok += 1
    except Exception as e:
        print("[bio FAIL]", code, repr(e)[:90], flush=True)
        fail += 1

print(f"ROUND3 DONE ok={ok} fail={fail}", flush=True)