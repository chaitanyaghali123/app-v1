import sys, os, hashlib, re
from pathlib import Path
from concurrent.futures import ProcessPoolExecutor
sys.path.insert(0, '/app')
import psycopg2
from ingest_hybrid import read_pdf_pages, chunk_text, PDF_PAGE_BATCH_SIZE

BASE = Path('/app/data/gs2')
DONE_LOG = '/tmp/contamination_audit2.txt'
OUT_LOG = '/tmp/contamination_audit3.txt'

def fresh_conn():
    from ingest_hybrid import PG_DB, PG_USER, PG_PASS, PG_HOST, PG_PORT
    return psycopg2.connect(dbname=PG_DB, user=PG_USER, password=PG_PASS, host=PG_HOST, port=PG_PORT)

def worker(args):
    source_file, file_hash = args
    fp = BASE / source_file
    if not fp.exists():
        return ("[skip]", source_file, '', f"[skip] {source_file}: file missing on disk")
    conn = fresh_conn()
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT chunk_index, chunk FROM upsc_chunks
            WHERE source_file = %s AND file_hash = %s
            ORDER BY chunk_index
        """, (source_file, file_hash))
        stored = cur.fetchall()
        if not stored:
            return ("[skip]", source_file, '', f"[skip] {source_file}: NO_STORED_CHUNKS")
        stored_first = stored[0][1][:150]
        stored_n = len(stored)
        stored_join = "\n\n".join(c for _, c in stored).encode()
    finally:
        conn.close()

    if fp.suffix.lower() != '.pdf':
        return ("[skip]", source_file, '', f"[skip] {source_file}: NONPDF_SKIP")

    try:
        all_chunks, batch, batch_texts = [], [], []
        for pr in read_pdf_pages(fp):
            batch.append(pr); batch_texts.append(pr["text"])
            if len(batch) >= PDF_PAGE_BATCH_SIZE:
                all_chunks.extend(chunk_text("\n\n".join(batch_texts)))
                batch, batch_texts = [], []
        if batch_texts:
            all_chunks.extend(chunk_text("\n\n".join(batch_texts)))
    except Exception as e:
        return ("[error]", source_file, '', f"[error] {source_file}: {e}")

    fresh_texts = [c["chunk_text"] for c in all_chunks]
    fresh_n = len(fresh_texts)
    fresh_first = fresh_texts[0][:150] if fresh_texts else '(none)'
    fresh_join = "\n\n".join(fresh_texts).encode()

    same_n = (stored_n == fresh_n)
    same_head = (stored_first == fresh_first)
    same_sha = hashlib.sha256(stored_join).hexdigest() == hashlib.sha256(fresh_join).hexdigest()
    status = "CLEAN" if (same_n and same_head and same_sha) else "STALE/CONTAMINATED"
    line = (f"[{status}] {source_file} | stored={stored_n} fresh={fresh_n} "
            f"same_n={same_n} same_head={same_head} same_sha={same_sha}")
    extra = ''
    if not same_head:
        extra = f"   stored_head: {stored_first!r}\n   fresh_head : {fresh_first!r}"
    return (f"[{status}]", source_file, line, extra)

def main():
    conn = fresh_conn()
    cur = conn.cursor()
    cur.execute("SELECT DISTINCT source_file, file_hash FROM upsc_chunks ORDER BY source_file")
    docs = cur.fetchall()
    conn.close()
    total = len(docs)

    done = {}
    if os.path.exists(DONE_LOG):
        pat = re.compile(r'^\[(CLEAN|STALE/CONTAMINATED|skip|error)\] (.*?) \|')
        for line in open(DONE_LOG, encoding='utf-8'):
            m = pat.match(line.strip())
            if m:
                done[m.group(2)] = line.strip()
    print(f"total={total} already_done={len(done)} remaining={total - len(done)}", flush=True)

    todo = [(s, h) for (s, h) in docs if s not in done]
    results = []
    workers = min(os.cpu_count() or 4, 8)
    print(f"workers={workers}", flush=True)
    with ProcessPoolExecutor(max_workers=workers) as ex:
        for r in ex.map(worker, todo):
            results.append(r)

    lines = {}
    for status, name, line, extra in results:
        lines[name] = line
        if extra:
            lines[name + "~head"] = extra
    for name, line in done.items():
        lines[name] = line

    order = sorted(lines.keys())
    body = []
    for name in order:
        body.append(lines[name])
        body.sort()

    reconf = re.compile(r'^\[(CLEAN|STALE/CONTAMINATED)\]')
    clean = [l for l in body if l.startswith('[CLEAN]')]
    stale = [l for l in body if l.startswith('[STALE')]
    flagged = [re.sub(r'^\[[^]]+\] (\S+).*', r'\1', l) for l in stale]
    skipped = [l for l in body if l.startswith('[skip]') or l.startswith('[error]')]

    with open(OUT_LOG, 'w', encoding='utf-8') as fo:
        fo.write(f"distinct source_files: {total}\n")
        for l in body:
            fo.write(l + "\n")
        fo.write("\n")
        fo.write(f"SUMMARY: total={total} clean={len(clean)} flagged={len(flagged)} skipped={len(skipped)}\n")
        fo.write(f"FLAGGED DOCS ({len(flagged)}):\n")
        for f in flagged:
            fo.write("  " + f + "\n")
        fo.write("SKIPPED:\n")
        for s in skipped:
            fo.write("  " + s + "\n")

    print(f"SUMMARY: total={total} clean={len(clean)} flagged={len(flagged)} skipped={len(skipped)}")
    for l in clean[-6:]:
        print(" ", l)
    for l in stale:
        print(" ", l)
    for s in skipped:
        print(" ", s)

if __name__ == '__main__':
    main()