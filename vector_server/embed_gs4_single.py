"""GS4-only embed backfill using SINGLE embedContent calls (bypasses exhausted
batchEmbedContents free-tier quota). Batch rate limit for free tier is separate
from the single (embedContent) quota, which still has room.

Embeds chunks whose embedding IS NULL AND gs_paper='gs4', one request at a time,
modest concurrency, and writes each embedding back with an UPDATE.
"""
import os, sys, time, threading
from concurrent.futures import ThreadPoolExecutor, as_completed

sys.path.insert(0, "/app")
os.environ.setdefault("R2_PREFIX", "")
os.environ.setdefault("GS_FILTER", "gs4")

import requests

EMBED_MODEL = os.getenv("EMBED_MODEL", "gemini-embedding-2")
EMBED_DIM = int(os.getenv("EMBED_DIM", "3072"))
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
WORKERS = int(os.getenv("EMBED_CONCURRENCY", "4"))
URL = f"https://generativelanguage.googleapis.com/v1beta/models/{EMBED_MODEL}:embedContent?key={GEMINI_API_KEY}"

session = requests.Session()

def embed_one(text):
    payload = {
        "model": f"models/{EMBED_MODEL}",
        "content": {"parts": [{"text": text}]},
        "taskType": "RETRIEVAL_DOCUMENT",
        "outputDimensionality": EMBED_DIM,
    }
    body = {"model": f"models/{EMBED_MODEL}", "content": {"parts": [{"text": text}]},
            "taskType": "RETRIEVAL_DOCUMENT", "outputDimensionality": EMBED_DIM}
    for attempt in range(6):
        try:
            resp = session.post(URL, json=body, timeout=60)
            if resp.status_code == 429:
                body_txt = resp.text or ""
                if "quota" in body_txt.lower():
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

def get_todo(limit):
    import psycopg2
    conn = psycopg2.connect(host=os.getenv("PG_HOST","postgres"),
                            dbname=os.getenv("PG_DB","aryabhata_db"),
                            user=os.getenv("PG_USER","aryabhata_user"),
                            password=os.getenv("PG_PASS","Password123"))
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id, chunk FROM upsc_chunks WHERE embedding IS NULL AND gs_paper='gs4' ORDER BY id LIMIT %s", (limit,))
            return cur.fetchall()
    finally:
        conn.close()

def write_embedding(cid, vec):
    import psycopg2
    conn = psycopg2.connect(host=os.getenv("PG_HOST","postgres"),
                            dbname=os.getenv("PG_DB","aryabhata_db"),
                            user=os.getenv("PG_USER","aryabhata_user"),
                            password=os.getenv("PG_PASS","Password123"))
    try:
        with conn.cursor() as cur:
            vals = "[" + ",".join(str(float(v)) for v in vec) + "]"
            cur.execute("UPDATE upsc_chunks SET embedding=%s::halfvec WHERE id=%s", (vals, cid))
        conn.commit()
    finally:
        conn.close()

def main():
    WAIT_LIMIT = int(os.getenv("EMBED_SINGLE_WAIT_LIMIT", "70000"))
    check_every = int(os.getenv("EMBED_SINGLE_CHECK_EVERY", "10"))
    quota_streak = 0
    total = 0
    started = time.time()
    while True:
        todo = get_todo(5000)
        if not todo:
            quota_streak += 1
            print(f"[{round((time.time()-started)/60,1)}m] no GS4 todo remaining; empty streak {quota_streak}", flush=True)
            if quota_streak >= 3:
                print("=== DONE: all GS4 embedded via single ===", flush=True)
                return
            time.sleep(check_every)
            continue
        quota_streak = 0
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
        print(f"[{round((time.time()-started)/60,1)}m] batch ok={ok} quota_hits={quota_hits} errors={errors} total_done={total}", flush=True)
        if quota_hits > 0 and ok == 0:
            print("=== single-embed quota hit; sleeping 300s ===", flush=True)
            for _ in range(60):
                time.sleep(5)
        else:
            time.sleep(2)

if __name__ == "__main__":
    main()
