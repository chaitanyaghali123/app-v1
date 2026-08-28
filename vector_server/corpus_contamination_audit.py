import sys, hashlib
from pathlib import Path
from collections import OrderedDict
sys.path.insert(0, '/app')
from ingest_hybrid import get_conn, read_pdf_pages, chunk_text, PDF_PAGE_BATCH_SIZE, token_count

LOG = '/tmp/contamination_audit.txt'
fout = open(LOG, 'w', encoding='utf-8')

def log(*a):
    line = " ".join(str(x) for x in a)
    print(line, flush=True)
    fout.write(line + "\n")
    fout.flush()

BASE = Path('/app/data/gs2')
conn = get_conn()
cur = conn.cursor()

cur.execute("SELECT DISTINCT source_file, file_hash FROM upsc_chunks ORDER BY source_file")
docs = cur.fetchall()
log(f"distinct source_files: {len(docs)}")

flagged = []
ok = 0
skipped = []

for source_file, file_hash in docs:
    fp = BASE / source_file
    if not fp.exists():
        skipped.append((source_file, 'MISSING_ON_DISK'))
        log(f"[skip] {source_file}: file missing on disk")
        continue

    # stored chunks for this doc, ordered
    cur.execute("""
        SELECT chunk_index, chunk FROM upsc_chunks
        WHERE source_file = %s AND file_hash = %s
        ORDER BY chunk_index
    """, (source_file, file_hash))
    stored = cur.fetchall()

    if not stored:
        skipped.append((source_file, 'NO_STORED_CHUNKS'))
        continue

    stored_first = stored[0][1][:150]
    stored_n = len(stored)
    stored_join = "\n\n".join(c for _, c in stored).encode()

    # fresh re-extraction using current pipeline
    try:
        if fp.suffix.lower() == '.pdf':
            batch, batch_texts, all_chunks = [], [], []
            for pr in read_pdf_pages(fp):
                batch.append(pr); batch_texts.append(pr["text"])
                if len(batch) >= PDF_PAGE_BATCH_SIZE:
                    all_chunks.extend(chunk_text("\n\n".join(batch_texts)))
                    batch, batch_texts = [], []
            if batch_texts:
                all_chunks.extend(chunk_text("\n\n".join(batch_texts)))
        else:
            # heuristic for non-pdf: not covered by this audit (pipeline supports pdf/docx/txt);
            # report stored only
            skipped.append((source_file, 'NONPDF_SKIP'))
            continue
    except Exception as e:
        skipped.append((source_file, f'EXTRACT_ERR:{e}'))
        log(f"[error] {source_file}: {e}")
        continue

    fresh_texts = [c["chunk_text"] for c in all_chunks]
    fresh_n = len(fresh_texts)
    fresh_first = fresh_texts[0][:150] if fresh_texts else '(none)'
    fresh_join = "\n\n".join(fresh_texts).encode()

    same_n = (stored_n == fresh_n)
    same_head = (stored_first == fresh_first)
    same_sha = hashlib.sha256(stored_join).hexdigest() == hashlib.sha256(fresh_join).hexdigest()

    status = "CLEAN" if (same_n and same_head and same_sha) else "STALE/CONTAMINATED"
    if status != "CLEAN":
        flagged.append(source_file)

    log(f"[{status}] {source_file} | stored={stored_n} fresh={fresh_n} "
        f"same_n={same_n} same_head={same_head} same_sha={same_sha}")
    if not same_head:
        log(f"   stored_head: {stored_first!r}")
        log(f"   fresh_head : {fresh_first!r}")

conn.close()

log("")
log(f"SUMMARY: clean={ok + 0 if False else 'n/a'} flagged={len(flagged)} skipped={len(skipped)}")
log(f"FLAGGED DOCS ({len(flagged)}):")
for s in flagged:
    log("  " + s)
log("SKIPPED:")
for s, why in skipped:
    log(f"  {s} ({why})")
fout.close()