# ingest_hybrid_api.py
# FastAPI service for retrieval and health
# Bulk ingestion is handled separately in ingest_hybrid.py

import os, logging, psycopg2, requests
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from sentence_transformers import SentenceTransformer
from requests.adapters import HTTPAdapter, Retry

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

# -----------------------------
# Config (aligned with .env)
# -----------------------------
CHROMA_BASE = os.getenv(
    "CHROMA_HOST",
    "http://chromadb:8000/api/v2/tenants/default_tenant/databases/default_database"
)
COLLECTION_NAME = os.getenv("CHROMA_COLLECTION", "upsc_chunks_v2")

EMBED_MODEL = os.getenv("EMBEDDING_MODEL", "all-MiniLM-L6-v2")
EMBED_DIM = int(os.getenv("EMBED_DIM", "384"))

PG_DB = os.getenv("DB_NAME", "aryabhata_db")
PG_USER = os.getenv("DB_USER", "aryabhata_user")
PG_PASS = os.getenv("DB_PASSWORD", "Password123")
PG_HOST = os.getenv("DB_HOST", "postgres")
PG_PORT = os.getenv("DB_PORT", "5432")

embedder = SentenceTransformer(EMBED_MODEL)

# -----------------------------
# PostgreSQL connection
# -----------------------------
pg_ready = False
conn = None
try:
    conn = psycopg2.connect(
        dbname=PG_DB, user=PG_USER, password=PG_PASS,
        host=PG_HOST, port=PG_PORT
    )
    conn.autocommit = True
    pg_ready = True
    logging.info("✅ Connected to PostgreSQL")
except Exception as e:
    logging.error("❌ PostgreSQL connection failed: %s", e)

# -----------------------------
# Ensure tables
# -----------------------------
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
        cur.execute("""
            CREATE TABLE IF NOT EXISTS chunk_keywords (
                chunk_id TEXT,
                keyword TEXT,
                PRIMARY KEY(chunk_id, keyword)
            );
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS chunk_links (
                id SERIAL PRIMARY KEY,
                chunk_id TEXT,
                related_chunk_id TEXT,
                relation_type TEXT,
                score FLOAT
            );
        """)
    logging.info("✅ Tables ensured")

# -----------------------------
# ChromaDB helpers
# -----------------------------
session = requests.Session()
session.mount("http://", HTTPAdapter(max_retries=Retry(
    total=5, backoff_factor=1, status_forcelist=[500, 502, 503, 504]
)))

def ensure_collection(name: str):
    resp = session.get(f"{CHROMA_BASE}/collections")
    if resp.status_code == 200:
        data = resp.json()
        # Handle both list and dict formats
        if isinstance(data, list):
            collections = data
        else:
            collections = data.get("collections", [])
        names = [c["name"] for c in collections]
        if name not in names:
            session.post(f"{CHROMA_BASE}/collections", json={"name": name})

def get_collection_id(name: str):
    resp = session.get(f"{CHROMA_BASE}/collections")
    if resp.status_code == 200:
        data = resp.json()
        if isinstance(data, list):
            collections = data
        else:
            collections = data.get("collections", [])
        for c in collections:
            if c["name"] == name:
                return c["id"]
    return None



def query_chunks(collection_id: str, query_embedding, n_results=5):
    payload = {
        "query_embeddings": [query_embedding],
        "n_results": n_results
    }
    resp = session.post(
        f"{CHROMA_BASE}/collections/{collection_id}/query",
        json=payload
    )
    if resp.status_code != 200:
        return []
    data = resp.json()
    docs = data.get("documents", [[]])[0]
    return [{"text": d} for d in docs]

# -----------------------------
# FastAPI setup
# -----------------------------
app = FastAPI(title="Hybrid Retrieval Service")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# -----------------------------
# Retrieval: nearest chunks
# -----------------------------
@app.post("/chunks")
async def chunks_api(request: Request):
    data = await request.json()
    query = data.get("query", "")

    ensure_tables()
    ensure_collection(COLLECTION_NAME)
    col_id = get_collection_id(COLLECTION_NAME)
    if not col_id:
        return {"chunks": [], "error": "ChromaDB collection not found"}

    q_emb = embedder.encode([query])[0].tolist()
    results = query_chunks(col_id, q_emb, n_results=10)

    return {"chunks": results}

# -----------------------------
# Health
# -----------------------------
@app.get("/health")
def health():
    return {"status": "ok"}