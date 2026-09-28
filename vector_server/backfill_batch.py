import os, time
from concurrent.futures import ThreadPoolExecutor, as_completed
import requests, psycopg2

MODEL = os.getenv("EMBED_MODEL", "gemini-embedding-2")
DIM = int(os.getenv("EMBED_DIM", "3072"))
KEYS = [k.strip() for k in os.getenv("GEMINI_API_KEY", "").split(",") if k.strip()]
BATCH = int(os.getenv("EMBED_BATCH", "100"))
PACE = float(os.getenv("EMBED_PACE", "2.0"))
URL = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:batchEmbedContents?key={{}}"

def get_conn():
    return psycopg2.connect(host=os.getenv("DB_HOST", os.getenv("PG_HOST", "postgres")),
                            dbname=os.getenv("DB_NAME", os.getenv("PG_DB", "aryabhata_db")),
                            user=os.getenv("DB_USER", os.getenv("PG_USER", "aryabhata_user")),
                            password=os.getenv("DB_PASSWORD", os.getenv("PG_PASSWORD", "Password123")))

def get_todo(limit):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id, chunk FROM upsc_chunks WHERE embedding IS NULL LIMIT %s", (limit,))
            return cur.fetchall()
    finally:
        conn.close()

def embed_batch(texts, keys=None):
    pool = keys or KEYS
    last_err = None
    for k in pool:
        try:
            body = {"requests": [{"model": f"models/{MODEL}", "content": {"parts": [{"text": t}]},
                                  "outputDimensionality": DIM, "taskType": "RETRIEVAL_DOCUMENT"} for t in texts]}
            resp = requests.post(URL.format(k), json=body, timeout=120)
            if resp.status_code == 429:
                last_err = RuntimeError("QUOTA")
                continue
            resp.raise_for_status()
            return [e["values"] for e in resp.json()["embeddings"]]
        except requests.exceptions.Timeout:
            last_err = RuntimeError("TIMEOUT")
            continue
        except RuntimeError as e:
            if "QUOTA" in str(e):
                last_err = e
                continue
            raise
    raise last_err or RuntimeError("NO_KEYS")

def write_updates(rows):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            for cid, vec in rows:
                lit = "[" + ",".join(f"{v:.6f}" for v in vec) + "]"
                cur.execute("UPDATE upsc_chunks SET embedding=%s::halfvec WHERE id=%s AND embedding IS NULL", (lit, cid))
        conn.commit()
    finally:
        conn.close()

def drain_one(batch):
    texts = [c for _, c in batch]
    for attempt in range(200):
        try:
            vecs = embed_batch(texts)
            write_updates([(cid, v) for (cid, _), v in zip(batch, vecs)])
            time.sleep(PACE)
            return len(batch)
        except RuntimeError as e:
            if "QUOTA" in str(e):
                if attempt > 20:
                    return 0
                time.sleep(min(15, 4 + attempt * 2))
            else:
                if attempt > 10:
                    return 0
                time.sleep(5)
        except Exception as e:
            print(f"[err] attempt {attempt}: {type(e).__name__}: {str(e)[:120]}", flush=True)
            if attempt > 10:
                return 0
            time.sleep(5)
    return 0

def main():
    started = time.time()
    empty = 0
    while True:
        todo = get_todo(4000)
        if not todo:
            empty += 1
            print(f"[{round((time.time()-started)/60,1)}m] no unembedded; streak {empty}", flush=True)
            if empty >= 3:
                print("=== BATCH DONE ===", flush=True)
                return
            time.sleep(10)
            continue
        empty = 0
        batches = [todo[i:i + BATCH] for i in range(0, len(todo), BATCH)]
        done = 0
        with ThreadPoolExecutor(max_workers=3) as ex:
            futs = [ex.submit(drain_one, b) for b in batches]
            for fut in as_completed(futs):
                done += fut.result()
        print(f"[{round((time.time()-started)/60,1)}m] round: {done}/{len(todo)} embedded", flush=True)
        time.sleep(1)

if __name__ == "__main__":
    main()