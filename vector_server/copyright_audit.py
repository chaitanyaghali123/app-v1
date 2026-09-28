import re
from collections import Counter
from ingest_hybrid import get_conn

conn = get_conn()
cur = conn.cursor()
cur.execute("SELECT file_name FROM documents")
rows = [r[0] or "" for r in cur.fetchall()]
cur.close()
conn.close()

def classify(name):
    n = name.lower()
    # eGyanKosh / IGNOU course codes
    if any(c in n for c in ["egyankosh", "ignou_", "/mhi", "/mso", "/msw", "/mpa", "/mps", "/mgg", "/mpag"]):
        return "eGyanKosh/IGNOU"
    if re.search(r"(mhi|mso|msw|mpa|mps|mgg|mpag)-\d", n) or re.search(r"/(mhi|mso|msw|mpa|mps|mgg)\d", n):
        return "eGyanKosh/IGNOU"
    if "archive.org" in n or "dli.ernet" in n:
        return "Archive.org text (books)"
    if n.startswith("history/") or "/history" in n or "history-optional" in n:
        return "History source"
    if n.startswith("society/"):
        return "Society source"
    if "essay/" in n or "essay" in n:
        return "Essay"
    if "/nios" in n or "nios" in n:
        return "NIOS"
    if "/ncert" in n or "ncert" in n:
        return "NCERT"
    if "current" in n or "ca/" in n:
        return "Current Affairs"
    if "pyq" in n or "pyqs" in n:
        return "PYQ"
    return "Other"

c = Counter(classify(x) for x in rows)
print("TOTAL documents:", len(rows))
print()
for k, v in c.most_common():
    print(f"{v:6d}  {k}")
print()
print("=== samples per category ===")
for cat in ["eGyanKosh/IGNOU", "Other", "History source", "NCERT", "NIOS", "Society source"]:
    print(f"\n-- {cat} --")
    shown = 0
    for x in rows:
        if classify(x) == cat and shown < 10:
            print("   ", x)
            shown += 1
