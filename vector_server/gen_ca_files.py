import os
import re
import sys
from pathlib import Path

import psycopg2

DATA_DIR = Path("/app/data")
SUBJECT_DIR = DATA_DIR / "current-affairs"
SUBJECT_DIR.mkdir(parents=True, exist_ok=True)

SAFE_SOURCES = {"PIB", "RBI", "MEA", "DARPG", "NITI Aayog", "PRS", "UGC", "NDMA", "MHA", "MoEFCC"}

def safe_prefix(source_name):
    if source_name in SAFE_SOURCES:
        return "PIB_"
    return "News_"

def main():
    conn = psycopg2.connect(
        host=os.getenv("DB_HOST", "postgres"),
        port=int(os.getenv("DB_PORT", "5432")),
        dbname=os.getenv("DB_NAME", "aryabhata_db"),
        user=os.getenv("DB_USER", "aryabhata_user"),
        password=os.getenv("DB_PASSWORD", "Password123"),
    )
    cur = conn.cursor()
    cur.execute(
        "SELECT id, title, summary, source_name, source_url, "
        "published_date, topics FROM current_affairs ORDER BY published_date"
    )
    rows = cur.fetchall()
    cur.close()
    conn.close()

    print(f"total rows: {len(rows)}", flush=True)

    written = 0
    for rid, title, summary, source, url, pubdate, topics in rows:
        title = (title or "").strip()
        if not title:
            continue
        summary = (summary or "").strip()
        body = title
        if summary:
            body = f"{title}\n\n{summary}"
        if url:
            body = f"{body}\n\nSource: {url}"
        topics_txt = ""
        if topics:
            try:
                topics_txt = ", ".join(t for t in topics if t)
            except Exception:
                topics_txt = ""
        if topics_txt:
            body = f"{body}\n\nTopics: {topics_txt}"

        date_part = str(pubdate) if pubdate else "nodate"
        src_clean = re.sub(r"[^A-Za-z0-9]+", "", source or "misc")[:12]
        fname = f"{safe_prefix(source)}{date_part}_{src_clean}_{rid}.txt"
        (SUBJECT_DIR / fname).write_text(body, encoding="utf-8")
        written += 1
        if written % 100 == 0:
            print(f"wrote {written}", flush=True)

    print(f"files written: {written}", flush=True)

if __name__ == "__main__":
    main()