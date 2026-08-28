import sys, re
sys.path.insert(0, '/app')
from ingest_hybrid import get_conn

# parse flagged list from audit log
flagged = []
in_flag = False
for line in open('/tmp/contamination_audit.txt', encoding='utf-8'):
    if line.startswith('FLAGGED DOCS'):
        in_flag = True
        continue
    if in_flag and line.startswith('  '):
        flagged.append(line.strip())
    elif in_flag and line.startswith('SKIPPED'):
        break

conn = get_conn()
cur = conn.cursor()
# total per-doc counts and embedded counts
cur.execute("""
  SELECT source_file, COUNT(*) AS n, COUNT(embedding) AS emb, MAX(chunk_index) AS max_idx
  FROM upsc_chunks
  GROUP BY source_file
""")
byfile = {r[0]: (r[1], r[2], r[3]) for r in cur.fetchall()}

tot_chunks = tot_emb = 0
for f in flagged:
    n, emb, mx = byfile.get(f, (0, 0, 0))
    tot_chunks += n
    tot_emb += emb
    print(f"{n:5d} chunks (emb={emb:3d})  {f}")

print("----")
print("FLAGGED docs:", len(flagged))
print("stale chunks total:", tot_chunks, "| embedded among them:", tot_emb)

cur.execute("SELECT COUNT(*), COUNT(embedding) FROM upsc_chunks")
alln, allemb = cur.fetchone()
print("corpus total:", alln, "| embedded:", allemb)
conn.close()