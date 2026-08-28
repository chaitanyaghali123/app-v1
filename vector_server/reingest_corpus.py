import os, sys, time
os.environ['EMBED_OFFLINE'] = 'true'
os.environ['EMBED_DEFER_ON_QUOTA'] = 'true'
os.environ['ENABLE_VISUAL_VERBALIZATION'] = 'false'
os.environ['ENABLE_TABLE_EXTRACTION'] = 'true'
sys.path.insert(0, '/app')

from pathlib import Path
import ingest_hybrid as ih

ih.root_folder = Path('/app/data/gs2')
BASE = Path('/app/data/gs2')

LOG = '/tmp/reingest_log.txt'
fout = open(LOG, 'w', encoding='utf-8')

def log(*a):
    line = " ".join(str(x) for x in a)
    print(line, flush=True)
    fout.write(line + "\n")
    fout.flush()

def delete_doc_row(file_hash):
    conn = ih.get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM documents WHERE file_hash=%s", (file_hash,))
        conn.commit()
    finally:
        ih.release_conn(conn)

def count_chunks(file_hash):
    conn = ih.get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM upsc_chunks WHERE file_hash=%s", (file_hash,))
            return cur.fetchone()[0]
    finally:
        ih.release_conn(conn)

# 1) parse flagged list from audit
flagged = []
in_flag = False
for line in open('/tmp/contamination_audit.txt', encoding='utf-8'):
    if line.startswith('FLAGGED DOCS'):
        in_flag = True
        continue
    if in_flag:
        if line.startswith('  '):
            flagged.append(line.strip())
        elif line.startswith('SKIPPED'):
            break

# 2) new statute PDFs not yet indexed
new_files = [
    'ethics/Right_to_Information_Act_2005.pdf',
    'ethics/Prevention_of_Corruption_Act_1988.pdf',
    'ethics/Lokpal_and_Lokayuktas_Act_2013.pdf',
]

docs = flagged + new_files
log(f"docs to process: {len(docs)} (flagged={len(flagged)}, new={len(new_files)})")

ok, failed, missing = [], [], []
for rel in docs:
    fp = BASE / rel
    if not fp.exists():
        missing.append(rel)
        log(f"[MISSING] {rel}")
        continue
    try:
        fh = ih.file_checksum(fp)
        ih.delete_existing_file_data(fh)
        delete_doc_row(fh)
        t0 = time.time()
        ih.process_file(fp)
        n = count_chunks(fh)
        ok.append((rel, n))
        log(f"[OK] {rel} ({time.time()-t0:.1f}s, {n} chunks)")
    except Exception as e:
        failed.append(rel)
        log(f"[FAIL] {rel}: {e}")

log("")
log(f"SUMMARY ok={len(ok)} failed={len(failed)} missing={len(missing)}")
for rel, n in ok:
    log(f"  ok {n:4d} {rel}")
for rel in failed:
    log(f"  FAIL {rel}")
for rel in missing:
    log(f"  MISSING {rel}")
fout.close()