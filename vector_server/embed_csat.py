"""Embed all prelims_chunks rows for subject csat (2,529 chunks) using Gemini
embedContent single calls (separate quota from batchEmbed, so it works after
the exhausted batch free-tier). Writes prelims_chunks.embedding (halfvec).

Run inside aryabhata-ingestor:
    python /app/embed_csat.py
"""
import os
import sys
import time
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import requests

sys.path.insert(0, "/app")

MODEL = os.getenv("EMBED_MODEL", "gemini-embedding-2")
DIM = int(os.getenv("EMBED_DIM", "3072"))
KEY = os.getenv("GEMINI_API_KEY", "")
WORKERS = int(os.getenv("EMBED_WORKERS", "4"))
ENDPOINT = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    "{}:embedContent".format(MODEL)
)
URL = "{}?key={}".format(ENDPOINT, KEY)


def get_conn():
    import psycopg2

    return psycopg2.connect(
        dbname=os.getenv("PG_DB", "aryabhata_db"),
        user=os.getenv("PG_USER", "aryabhata_user"),
        password=os.getenv("PG_PASS", "Password123"),
        host=os.getenv("PG_HOST", "postgres"),
    )


def embed_text(text):
    body = {
        "model": "models/" + MODEL,
        "content": {"parts": [{"text": text}]},
        "taskType": "RETRIEVAL_DOCUMENT",
        "outputDimensionality": DIM,
    }
    s = requests.Session()
    for attempt in range(7):
        try:
            r = s.post(URL, json=body, timeout=90)
            if r.status_code == 429 and "quota" in (r.text or "").lower():
                return None
            r.raise_for_status()
            return r.json()["embedding"]["values"]
        except Exception as e:
            if "429" in str(e) or "quota" in str(e).lower():
                return None
            if attempt >= 6:
                raise
            time.sleep((2 ** attempt) * 0.5)


def main():
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, chunk FROM prelims_chunks "
                "WHERE subject_id='csat' AND embedding IS NULL "
                "AND length(chunk) >= 20"
            )
            rows = cur.fetchall()
    finally:
        conn.close()

    todo = list(rows)
    print("to embed: {} rows".format(len(todo)), flush=True)

    done = 0
    fails = []
    while todo:
        batch = todo[:50]
        todo = todo[50:]
        results = {}
        with ThreadPoolExecutor(max_workers=WORKERS) as ex:
            futs = {ex.submit(embed_text, c): (i, c) for i, c in batch}
            for f in as_completed(futs):
                i, c = futs[f]
                try:
                    results[i] = f.result()
                except Exception as e:
                    results[i] = ("ERR", repr(e)[:80])
        conn = get_conn()
        try:
            with conn.cursor() as cur:
                for i, r in results.items():
                    if not r:
                        continue
                    if isinstance(r, tuple):
                        fails.append(i)
                        continue
                    cur.execute(
                        "UPDATE prelims_chunks SET embedding=%s WHERE id=%s",
                        ("[" + ",".join(map(str, r)) + "]", i),
                    )
            conn.commit()
        finally:
            conn.close()
        done += len(batch)
        print(".. {}/{} rows embedded".format(done, len(rows)), flush=True)
        time.sleep(0.7)

    print("DONE embedded={} fail={}".format(done - len(fails), len(fails)))


if __name__ == "__main__":
    main()
