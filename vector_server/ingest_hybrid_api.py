# ingest_hybrid_api.py
# FastAPI retrieval service
# ChromaDB v2 REST API compatible

import os
import logging
import requests
import psycopg2

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from requests.adapters import HTTPAdapter, Retry
from sentence_transformers import SentenceTransformer

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)

# --------------------------------------------------
# Config
# --------------------------------------------------

CHROMA_BASE = os.getenv(
    "CHROMA_HOST",
    "http://chromadb:8000/api/v2/tenants/default_tenant/databases/default_database"
)

COLLECTION_NAME = os.getenv(
    "CHROMA_COLLECTION",
    "upsc_chunks_v2"
)

EMBED_MODEL = os.getenv(
    "EMBEDDING_MODEL",
    "all-MiniLM-L6-v2"
)

EMBED_DIM = int(os.getenv("EMBED_DIM", "384"))

PG_DB = os.getenv("DB_NAME", "aryabhata_db")
PG_USER = os.getenv("DB_USER", "aryabhata_user")
PG_PASS = os.getenv("DB_PASSWORD", "Password123")
PG_HOST = os.getenv("DB_HOST", "postgres")
PG_PORT = os.getenv("DB_PORT", "5432")

# --------------------------------------------------
# Embedding model
# --------------------------------------------------

logging.info(f"Loading embedding model: {EMBED_MODEL}")

embedder = SentenceTransformer(EMBED_MODEL)

# --------------------------------------------------
# PostgreSQL
# --------------------------------------------------

pg_ready = False

try:
    conn = psycopg2.connect(
        dbname=PG_DB,
        user=PG_USER,
        password=PG_PASS,
        host=PG_HOST,
        port=PG_PORT
    )

    conn.autocommit = True

    pg_ready = True

    logging.info("✅ Connected to PostgreSQL")

except Exception as e:

    logging.error(f"❌ PostgreSQL connection failed: {e}")

# --------------------------------------------------
# HTTP Session
# --------------------------------------------------

session = requests.Session()

retries = Retry(
    total=5,
    backoff_factor=1,
    status_forcelist=[500, 502, 503, 504]
)

adapter = HTTPAdapter(max_retries=retries)

session.mount("http://", adapter)
session.mount("https://", adapter)

# --------------------------------------------------
# Ensure tables
# --------------------------------------------------

def ensure_tables():

    if not pg_ready:
        return

    with conn.cursor() as cur:

        cur.execute("CREATE EXTENSION IF NOT EXISTS vector;")

        cur.execute(f"""
            CREATE TABLE IF NOT EXISTS upsc_chunks (
                id TEXT PRIMARY KEY,
                chunk TEXT,
                topic TEXT,
                difficulty TEXT,
                embedding VECTOR({EMBED_DIM}),
                file_hash TEXT
            );
        """)

    logging.info("✅ Tables ensured")

# --------------------------------------------------
# Chroma Helpers
# --------------------------------------------------

def ensure_collection(name: str):

    resp = session.get(
        f"{CHROMA_BASE}/collections",
        timeout=30
    )

    if resp.status_code != 200:
        logging.error(f"❌ Failed fetching collections: {resp.text}")
        return False

    data = resp.json()

    collections = (
        data if isinstance(data, list)
        else data.get("collections", [])
    )

    names = [c["name"] for c in collections]

    if name in names:
        return True

    r = session.post(
        f"{CHROMA_BASE}/collections",
        json={"name": name},
        timeout=30
    )

    if r.status_code in [200, 201]:
        logging.info(f"✅ Created collection: {name}")
        return True

    logging.error(f"❌ Failed creating collection: {r.text}")

    return False

def get_collection_id(name: str):

    resp = session.get(
        f"{CHROMA_BASE}/collections",
        timeout=30
    )

    if resp.status_code != 200:
        logging.error(f"❌ Failed reading collections: {resp.text}")
        return None

    data = resp.json()

    collections = (
        data if isinstance(data, list)
        else data.get("collections", [])
    )

    for c in collections:

        if c.get("name") == name:
            return c.get("id")

    return None

# --------------------------------------------------
# FIXED QUERY FUNCTION
# --------------------------------------------------

def query_chunks(collection_id, query_embedding, n_results=5):

    if hasattr(query_embedding, "tolist"):
        query_embedding = query_embedding.tolist()

    query_embedding = [float(x) for x in query_embedding]

    payload = {
        "query_embeddings": [query_embedding],
        "n_results": n_results,
        "include": [
            "documents",
            "metadatas",
            "distances"
        ]
    }

    # ✅ Correct Chroma v2 endpoint
    resp = session.post(
        f"{CHROMA_BASE}/collections/{collection_id}/query",
        json=payload,
        timeout=60
    )

    if resp.status_code != 200:

        logging.error(
            f"❌ Chroma query failed: "
            f"{resp.status_code} {resp.text}"
        )

        return []

    data = resp.json()

    docs = data.get("documents", [[]])[0]
    metas = data.get("metadatas", [[]])[0]
    distances = data.get("distances", [[]])[0]

    logging.info(f"✅ Retrieved {len(docs)} chunks from Chroma")

    results = []

    for doc, meta, dist in zip(docs, metas, distances):

        results.append({
            "text": doc,
            "metadata": meta,
            "distance": dist
        })

    return results

# --------------------------------------------------
# FastAPI
# --------------------------------------------------

app = FastAPI(title="Hybrid Retrieval Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"]
)

# --------------------------------------------------
# Retrieval Endpoint
# --------------------------------------------------

@app.post("/chunks")
async def chunks_api(request: Request):

    data = await request.json()

    query = data.get("query", "").strip()

    if not query:
        return {"chunks": []}

    ensure_tables()

    if not ensure_collection(COLLECTION_NAME):
        return {
            "chunks": [],
            "error": "Failed ensuring collection"
        }

    collection_id = get_collection_id(COLLECTION_NAME)

    if not collection_id:
        return {
            "chunks": [],
            "error": "Collection ID not found"
        }

    q_emb = embedder.encode([query])[0]

    results = query_chunks(
        collection_id,
        q_emb,
        n_results=10
    )

    return {
        "chunks": results
    }

# --------------------------------------------------
# Health
# --------------------------------------------------

@app.get("/health")
def health():

    return {
        "status": "ok"
    }