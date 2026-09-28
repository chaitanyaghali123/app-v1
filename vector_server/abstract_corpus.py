"""Abstract (paraphrase-to-facts) the entire upsc_chunks corpus.

For every chunk, replace the stored `chunk` text with a fact-dense, fully
paraphrased set of knowledge points authored with NO verbatim reproduction of
the source. This removes stored / served copyrighted full-text while preserving
the facts, dates, names, and numbers needed for UPSC retrieval.

Pipeline (per chunk):
  1. build_abstract(text) -> Gemini generateContent summarise in own words.
  2. Update upsc_chunks.chunk = abstract (replace raw text).
  3. Recompute embedding (single embedContent) so retrieval matches new text.
  4. Recompute search_vector = to_tsvector('english', abstract).

Resumable + quota-tolerant: progress tracked in a `chunk_abstraction` table
(chunk_id PK). On Gemini 429 it sleeps and continues; safe to re-run.
"""
import os, sys, time
from concurrent.futures import ThreadPoolExecutor, as_completed
import requests

ABST_MODEL = os.getenv("ABST_MODEL", "gemini-3.6-flash")
ABST_BATCH = int(os.getenv("ABST_BATCH", "1000"))
EMBED_MODEL = os.getenv("EMBED_MODEL", "gemini-embedding-2")
DIM = int(os.getenv("EMBED_DIM", "3072"))
KEY = os.getenv("GEMINI_API_KEY", "")
GEN_WORKERS = int(os.getenv("ABST_CONCURRENCY", "4"))
EMBED_WORKERS = int(os.getenv("EMBED_CONCURRENCY", "4"))
DRY_RUN = os.getenv("ABST_DRY_RUN", "0") == "1"

GEN_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{ABST_MODEL}:generateContent?key={KEY}"
EMBED_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{EMBED_MODEL}:embedContent?key={KEY}"
gen_session = requests.Session()
embed_session = requests.Session()

ABST_PROMPT = """You are an ingestion pipeline that rewrites study material into ORIGINAL, fact-dense knowledge points for a vector retrieval index.

Rewrite the text below as a concise set of bullet knowledge points. STRICT REQUIREMENTS:
- Express every fact in YOUR OWN WORDS. Do NOT copy or reproduce any sentence, phrase, clause, or contiguous run of the source text verbatim.
- Never copy tables cell-for-cell, blockquoted definitions, direct quotes, or ASCII diagrams. Restate all such content in your own words.
- Preserve EVERY fact, name, date, number, definition, concept, and example exactly in substance.
- Do NOT add outside knowledge. If a fact is absent, omit it.
- Output only the paraphrased bullet points (no preamble, no "Here is...")."""

def get_conn():
    import psycopg2
    return psycopg2.connect(
        host=os.getenv("PG_HOST", "postgres"),
        dbname=os.getenv("PG_DB", "aryabhata_db"),
        user=os.getenv("PG_USER", "aryabhata_user"),
        password=os.getenv("PG_PASS", "Password123"))

def ensure_tracking_table(conn):
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS chunk_abstraction (
                chunk_id TEXT PRIMARY KEY,
                abstracted_at TIMESTAMP DEFAULT NOW()
            )
        """)
    conn.commit()

def get_todo(limit):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT c.id, c.chunk
                FROM upsc_chunks c
                LEFT JOIN chunk_abstraction a ON a.chunk_id = c.id
                WHERE a.chunk_id IS NULL
                ORDER BY c.id
                LIMIT %s
            """, (limit,))
            return cur.fetchall()
    finally:
        conn.close()

def mark_done(cid, done, error=None):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            if done:
                cur.execute("INSERT INTO chunk_abstraction (chunk_id) VALUES (%s) ON CONFLICT (chunk_id) DO NOTHING", (cid,))
            else:
                cur.execute("INSERT INTO chunk_abstraction (chunk_id) VALUES (%s) ON CONFLICT (chunk_id) DO NOTHING", (cid,))
        conn.commit()
    finally:
        conn.close()

def abstract_one(text):
    payload = {
        "contents": [{"parts": [{"text": ABST_PROMPT + "\n\nTEXT:\n" + text}]}],
        "generationConfig": {"temperature": 0.3, "maxOutputTokens": 2048},
    }
    for attempt in range(6):
        try:
            r = gen_session.post(GEN_URL, json=payload, timeout=120)
            if r.status_code == 429:
                return ("QUOTA", None)
            r.raise_for_status()
            data = r.json()
            out = (data.get("candidates") or [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
            if out and out.strip():
                return ("OK", out.strip())
            return ("EMPTY", None)
        except Exception as e:
            if "429" in str(e):
                return ("QUOTA", None)
            if attempt == 5:
                return ("ERR", None)
            time.sleep((2 ** attempt) * 2)
    return ("ERR", None)

def embed_one(text):
    body = {"model": f"models/{EMBED_MODEL}", "content": {"parts": [{"text": text}]},
            "taskType": "RETRIEVAL_DOCUMENT", "outputDimensionality": DIM}
    for attempt in range(6):
        try:
            r = embed_session.post(EMBED_URL, json=body, timeout=60)
            if r.status_code == 429:
                return ("QUOTA", None)
            r.raise_for_status()
            return ("OK", r.json()["embedding"]["values"])
        except Exception as e:
            if "429" in str(e):
                return ("QUOTA", None)
            if attempt == 5:
                return ("ERR", None)
            time.sleep((2 ** attempt) * 2)
    return ("ERR", None)

def write_abstract(cid, new_text, vec):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE upsc_chunks SET chunk=%s, search_vector=to_tsvector('english', %s), embedding=NULL::halfvec WHERE id=%s",
                (new_text, new_text, cid))
            if vec:
                vals = "[" + ",".join(str(float(v)) for v in vec) + "]"
                cur.execute("UPDATE upsc_chunks SET embedding=%s::halfvec WHERE id=%s", (vals, cid))
        conn.commit()
    finally:
        conn.close()

def main():
    ensure_tracking_table(get_conn())
    started = time.time()
    total = 0
    while True:
        todo = get_todo(ABST_BATCH)
        if not todo:
            print(f"[{round((time.time()-started)/60,1)}m] no pending chunks; exiting", flush=True)
            return
        # 1) abstract in parallel
        abstracts = {}
        abst_quota = abst_err = 0
        with ThreadPoolExecutor(max_workers=GEN_WORKERS) as ex:
            futs = {ex.submit(abstract_one, c): cid for cid, c in todo}
            done_ct = 0
            for fut in as_completed(futs):
                cid = futs[fut]
                status, out = fut.result()
                done_ct += 1
                if status == "OK":
                    abstracts[cid] = out
                elif status == "QUOTA":
                    abst_quota += 1
                elif status == "ERR":
                    abst_err += 1
                if done_ct % 25 == 0:
                    print(f"[{round((time.time()-started)/60,1)}m] abstract {done_ct}/{len(todo)} ok={len(abstracts)} err={abst_err} quota={abst_quota}", flush=True)
        print(f"[{round((time.time()-started)/60,1)}m] abstract round ok={len(abstracts)} quota={abst_quota} err={abst_err}", flush=True)

        # 2) embed the abstracts in parallel
        embeds = {}
        emb_quota = emb_err = 0
        with ThreadPoolExecutor(max_workers=EMBED_WORKERS) as ex:
            futs = {ex.submit(embed_one, abstracts[cid]): cid for cid in abstracts}
            for fut in as_completed(futs):
                cid = futs[fut]
                status, vec = fut.result()
                if status == "OK" and vec:
                    embeds[cid] = vec
                elif status == "QUOTA":
                    emb_quota += 1
                else:
                    emb_err += 1
        print(f"[{round((time.time()-started)/60,1)}m] embed round ok={len(embeds)} quota={emb_quota} err={emb_err}", flush=True)

        # 3) write to DB (abstraction is the point; embedding re-run is best-effort so failures don't block)
        written = 0
        if DRY_RUN:
            for cid, new_text in abstracts.items():
                print(f"    {cid}: {new_text[:120].replace(chr(10),' ')}...", flush=True)
        else:
            for cid, new_text in abstracts.items():
                write_abstract(cid, new_text, embeds.get(cid))
                mark_done(cid, True)
                written += 1
        total += written
        print(f"[{round((time.time()-started)/60,1)}m] abstracted={len(abstracts)} stored={written} total={total}", flush=True)

        if DRY_RUN:
            print("=== DRY RUN: stopping after one round (no DB writes) ===", flush=True)
            return

        if abst_quota > 0 and len(abstracts) == 0:
            print("=== generation quota hit; sleeping 300s ===", flush=True)
            for _ in range(60):
                time.sleep(5)
        else:
            time.sleep(2)

if __name__ == "__main__":
    main()
