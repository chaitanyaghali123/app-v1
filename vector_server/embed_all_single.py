"""Embed ALL unembedded upsc_chunks (any gs_paper) using SINGLE embedContent calls.
Bypasses the exhausted batchEmbedContents free-tier quota by using the single
embedContent endpoint (separate quota). Modest concurrency; auto-resumes through
daily-quota sleeps until every NULL-embedding chunk is done.

Drains gs4, gs1, gs2, gs3 in a single pass.
"""
import os, sys, time, threading
from concurrent.futures import ThreadPoolExecutor, as_completed
import requests

MODEL = os.getenv("EMBED_MODEL", "gemini-embedding-2")
DIM = int(os.getenv("EMBED_DIM", "3072"))
KEY = os.getenv("GEMINI_API_KEY", "")
WORKERS = int(os.getenv("EMBED_CONCURRENCY", "4"))
URL = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:embedContent?key={KEY}"
session = requests.Session()

def embed_one(text):
    body = {"model": f"models/{MODEL}", "content": {"parts": [{"text": text}]},
            "taskType": "RETRIEVAL_DOCUMENT", "outputDimensionality": DIM}
    for attempt in range(6):
        try:
            resp = session.post(URL, json=body, timeout=60)
            if resp.status_code == 429:
                if "quota" in (resp.text or "").lower():
                    return ("QUOTA", None)
                time.sleep((2 ** min(attempt, 3)) * 2)
                continue
            resp.raise_for_status()
            return ("OK", resp.json()["embedding"]["values"])
        except Exception as e:
            if "429" in str(e):
                return ("QUOTA", None)
            if attempt == 5:
                return ("ERR", None)
            time.sleep((2 ** attempt) * 2)
    return ("ERR", None)

def get_conn():
    import psycopg2
    return psycopg2.connect(host=os.getenv("PG_HOST","postgres"),
                            dbname=os.getenv("PG_DB","aryabhata_db"),
                            user=os.getenv("PG_USER","aryabhata_user"),
                            password=os.getenv("PG_PASS","Password123"))

def get_todo(limit):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id, chunk FROM upsc_chunks WHERE embedding IS NULL ORDER BY id LIMIT %s", (limit,))
            return cur.fetchall()
    finally:
        conn.close()

def write_embedding(cid, vec):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            vals = "[" + ",".join(str(float(v)) for v in vec) + "]"
            cur.execute("UPDATE upsc_chunks SET embedding=%s::halfvec WHERE id=%s", (vals, cid))
        conn.commit()
    finally:
        conn.close()

def main():
    started = time.time()
    total = 0
    empty_streak = 0
    while True:
        todo = get_todo(3000)
        if not todo:
            empty_streak += 1
            print(f"[{round((time.time()-started)/60,1)}m] no unembedded chunks; empty streak {empty_streak}", flush=True)
            if empty_streak >= 3:
                print("=== DONE: all chunks embedded ===", flush=True)
                return
            time.sleep(10)
            continue
        empty_streak = 0
        ok = quota_hits = errors = 0
        with ThreadPoolExecutor(max_workers=WORKERS) as ex:
            futs = {ex.submit(embed_one, chunk): cid for cid, chunk in todo}
            for fut in as_completed(futs):
                cid = futs[fut]
                status, vec = fut.result()
                if status == "OK" and vec:
                    write_embedding(cid, vec)
                    ok += 1
                elif status == "QUOTA":
                    quota_hits += 1
                else:
                    errors += 1
        total += ok
        print(f"[{round((time.time()-started)/60,1)}m] ok={ok} quota_hits={quota_hits} errors={errors} total_done={total}", flush=True)
        if quota_hits > 0 and ok == 0:
            print("=== single-embed quota hit; sleeping 300s ===", flush=True)
            for _ in range(60):
                time.sleep(5)
        else:
            time.sleep(2)

if __name__ == "__main__":
    main()
