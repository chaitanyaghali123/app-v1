import os, sys, time, requests, psycopg2

MODEL = os.getenv("EMBED_MODEL", "gemini-embedding-2")
DIM = int(os.getenv("EMBED_DIM", "3072"))
KEY = os.getenv("GEMINI_API_KEY", "")
BATCH = 100
URL = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:batchEmbedContents?key={KEY}"
LABEL = os.getenv("BACKFILL_LABEL", KEY[:20])

def get_conn():
    return psycopg2.connect(
        host=os.getenv("PG_HOST", "postgres"),
        dbname=os.getenv("PG_DB", "aryabhata_db"),
        user=os.getenv("PG_USER", "aryabhata_user"),
        password=os.getenv("PG_PASSWORD", "Password123"),
    )

def embed(texts):
    body = {
        "requests": [
            {"model": f"models/{MODEL}", "content": {"parts": [{"text": t}]},
             "outputDimensionality": DIM, "taskType": "RETRIEVAL_DOCUMENT"}
            for t in texts
        ]
    }
    for attempt in range(400):
        try:
            r = requests.post(URL, json=body, timeout=90)
        except requests.RequestException as e:
            print(f"[{LABEL}] req error: {e}; retry {attempt}", flush=True)
            time.sleep(min(30, 3 + attempt))
            continue
        if r.status_code == 200:
            return [e["values"] for e in r.json()["embeddings"]]
        if r.status_code == 429:
            wait = min(45, 5 + attempt * 3)
            print(f"[{LABEL}] 429 backoff {wait}s (att {attempt})", flush=True)
            time.sleep(wait)
            continue
        print(f"[{LABEL}] HTTP {r.status_code}: {r.text[:120]}", flush=True)
        if attempt > 30:
            return None
        time.sleep(5)
    return None

def main():
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT count(*) FROM upsc_chunks WHERE embedding IS NULL")
    total = cur.fetchone()[0]
    cur.close()
    conn.close()
    print(f"[{LABEL}] starting; {total} to embed", flush=True)
    done = 0
    failed = 0
    while True:
        conn = get_conn()
        conn.autocommit = True
        cur = conn.cursor()
        cur.execute("SELECT id, chunk FROM upsc_chunks WHERE embedding IS NULL LIMIT %s", (BATCH,))
        rows = cur.fetchall()
        cur.close()
        conn.close()
        if not rows:
            break
        vecs = embed([r[1] for r in rows])
        if vecs is None:
            failed += len(rows)
            print(f"[{LABEL}] batch failed, sleeping 60s", flush=True)
            time.sleep(60)
            continue
        conn = get_conn()
        conn.autocommit = True
        cur = conn.cursor()
        for (cid, _), vec in zip(rows, vecs):
            lit = "[" + ",".join(f"{v:.6f}" for v in vec) + "]"
            cur.execute("UPDATE upsc_chunks SET embedding=%s::halfvec WHERE id=%s AND embedding IS NULL", (lit, cid))
        cur.close()
        conn.close()
        done += len(rows)
        print(f"[{LABEL}] +{len(rows)} (total {done})", flush=True)
        time.sleep(0.5)
    print(f"[{LABEL}] DONE {done} embedded, {failed} failed", flush=True)

if __name__ == "__main__":
    main()