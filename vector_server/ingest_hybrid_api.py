# ingest_hybrid_api.py
# ==========================================================
# ENTERPRISE HYBRID RETRIEVAL API
# ==========================================================

import os
import re
import json
import hmac
import hashlib
import time
import uuid
import asyncio
import logging
import threading
import unicodedata

from typing import List, Dict, Optional
from collections import OrderedDict

import psycopg2
import numpy as np
import torch
import redis
import httpx

from fastapi import (
    FastAPI,
    Request,
    HTTPException,
    Header
)

from fastapi.responses import JSONResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from psycopg2.pool import SimpleConnectionPool
from psycopg2.extras import RealDictCursor

from starlette.concurrency import run_in_threadpool
from prometheus_client import Counter, Histogram, Gauge, generate_latest, CONTENT_TYPE_LATEST

# ==========================================================
# LOGGING
# ==========================================================

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s [%(levelname)s] %(message)s"
)

logger = logging.getLogger(__name__)

# ==========================================================
# CONFIG
# ==========================================================

APP_VERSION = "16.0.0"


ENVIRONMENT = os.getenv(
    "ENVIRONMENT",
    "development"
).lower()

MAX_QUERY_LENGTH = int(
    os.getenv(
        "MAX_QUERY_LENGTH",
        "1000"
    )
)


MIN_QUERY_LENGTH = int(
    os.getenv(
        "MIN_QUERY_LENGTH",
        "2"
    )
)

# ==========================================================
# SECURITY
# ==========================================================

API_KEY = os.getenv(
    "API_KEY",
    "change_this_in_production"
)

ENABLE_AUTH = os.getenv(
    "ENABLE_AUTH",
    "true"
).lower() == "true"

RATE_LIMIT_PER_MINUTE = int(
    os.getenv("RATE_LIMIT_PER_MINUTE", "120")
)


ENABLE_RATE_LIMIT = os.getenv(
    "ENABLE_RATE_LIMIT",
    "true"
).lower() == "true"

TRUST_PROXY_HEADERS = os.getenv(
    "TRUST_PROXY_HEADERS",
    "false"
).lower() == "true"

# ==========================================================
# DEVICE
# ==========================================================

DEVICE = "cpu"

logger.info(
    f"Embedding provider: Gemini API (text-embedding-004)"
)

# ==========================================================
# EMBEDDING MODEL (local sentence-transformers)
# ==========================================================

EMBED_PROVIDER = "local"

EMBED_MODEL = os.getenv(
    "EMBED_MODEL",
    "gemini-embedding-001"
)

EMBEDDING_RETRIES = int(
    os.getenv("EMBEDDING_RETRIES", "3")
)

EMBEDDING_RETRY_DELAY = float(
    os.getenv("EMBEDDING_RETRY_DELAY", "2")
)

EMBED_DIM = int(
    os.getenv("EMBED_DIM", "3072")
)

# ==========================================================
# RERANK MODEL
# ==========================================================

RERANK_MODEL = os.getenv(
    "RERANK_MODEL",
    "BAAI/bge-reranker-base"
)

ENABLE_RERANK = os.getenv(
    "ENABLE_RERANK",
    "true"
).lower() == "true"

# ==========================================================
# RETRIEVAL CONFIG
# ==========================================================

TOP_K = int(
    os.getenv("TOP_K", "5")
)

MAX_TOP_K = int(
    os.getenv("MAX_TOP_K", "20")
)

VECTOR_CANDIDATES = int(
    os.getenv("VECTOR_CANDIDATES", "40")
)

HNSW_EF_SEARCH = int(
    os.getenv("HNSW_EF_SEARCH", "80")
)

BM25_CANDIDATES = int(
    os.getenv("BM25_CANDIDATES", "40")
)

RERANK_CANDIDATES = int(
    os.getenv("RERANK_CANDIDATES", "30")
)
MAX_CHUNK_CHARS = int(

    os.getenv("MAX_CHUNK_CHARS", "2000")

)
MIN_SIMILARITY_SCORE = float(
    os.getenv("MIN_SIMILARITY_SCORE", "0.15")
)

# ==========================================================
# CACHE
# ==========================================================

CACHE_SIZE = int(
    os.getenv("CACHE_SIZE", "5000")
)

CACHE_TTL_SECONDS = int(
    os.getenv("CACHE_TTL_SECONDS", "300")
)


ENABLE_CACHE = os.getenv(
    "ENABLE_CACHE",
    "true"
).lower() == "true"

ENABLE_REDIS_CACHE = os.getenv(
    "ENABLE_REDIS_CACHE",
    "false"
).lower() == "true"

REDIS_HOST = os.getenv("REDIS_HOST", "redis")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))
REDIS_DB = int(os.getenv("REDIS_DB", "0"))
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD") or None

query_cache = OrderedDict()

cache_lock = threading.Lock()

# ==========================================================
# RATE LIMIT
# ==========================================================

request_tracker = {}

rate_limit_lock = threading.Lock()


redis_client = None

if ENABLE_REDIS_CACHE:

    try:

        redis_client = redis.Redis(
            host=REDIS_HOST,
            port=REDIS_PORT,
            db=REDIS_DB,
            password=REDIS_PASSWORD,
            socket_timeout=float(os.getenv("REDIS_SOCKET_TIMEOUT", "5")),
            socket_connect_timeout=float(os.getenv("REDIS_SOCKET_CONNECT_TIMEOUT", "5")),
            decode_responses=True
        )

        redis_client.ping()

        logger.info("Redis connected")

    except Exception as e:

        redis_client = None

        logger.warning(
            f"Redis unavailable, using local memory fallback: {e}"
        )

# ==========================================================
# POSTGRES
# ==========================================================

PG_DB = os.getenv(
    "DB_NAME",
    "aryabhata_db"
)

PG_USER = os.getenv(
    "DB_USER",
    "aryabhata_user"
)

PG_PASS = os.getenv(
    "DB_PASSWORD",
    "Password123"
)

PG_HOST = os.getenv(
    "DB_HOST",
    "postgres"
)

PG_PORT = os.getenv(
    "DB_PORT",
    "5432"
)


PG_POOL_MIN = int(os.getenv("PG_POOL_MIN_CONN", "2"))
PG_POOL_MAX = int(os.getenv("PG_POOL_MAX_CONN", "20"))
POSTGRES_STATEMENT_TIMEOUT = int(os.getenv("POSTGRES_STATEMENT_TIMEOUT", "30000"))

REQUEST_COUNT = Counter(
    "hybrid_api_requests_total",
    "Total API requests",
    ["endpoint", "status"]
)

REQUEST_LATENCY = Histogram(
    "hybrid_api_request_latency_seconds",
    "Request latency in seconds",
    ["endpoint"]
)

CACHE_HITS = Counter(
    "hybrid_api_cache_hits_total",
    "Total cache hits",
    ["backend"]
)

CACHE_MISSES = Counter(
    "hybrid_api_cache_misses_total",
    "Total cache misses"
)

PGVECTOR_DOCS = Gauge(
    "hybrid_api_pgvector_documents",
    "Documents with embeddings in PostgreSQL pgvector"
)

# ==========================================================
# GEMINI API EMBEDDING
# ==========================================================

import requests as _requests

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_EMBED_URL = (
    "https://generativelanguage.googleapis.com/v1/"
    "models/gemini-embedding-001:batchEmbedContents"
)
GEMINI_EMBED_BATCH = int(
    os.getenv("GEMINI_EMBED_BATCH", "20")
)
GEMINI_EMBED_TASK_QUERY = (
    os.getenv("GEMINI_EMBED_TASK", "RETRIEVAL_QUERY")
)

_gemini_session = _requests.Session()


def _gemini_embed_batch(texts, task_type="RETRIEVAL_QUERY"):
    """Call Gemini batchEmbedContents API for a list of texts."""
    payload = {
        "requests": [
            {
                "model": f"models/{EMBED_MODEL}",
                "content": {"parts": [{"text": t}]},
            }
            for t in texts
        ]
    }
    for attempt in range(8):
        try:
            resp = _gemini_session.post(
                f"{GEMINI_EMBED_URL}?key={GEMINI_API_KEY}",
                json=payload,
                timeout=90,
            )
            if resp.status_code == 429:
                wait = (2 ** attempt) * 2
                logger.warning(
                    f"Gemini embed 429, attempt {attempt+1}/8, retry in {wait}s"
                )
                time.sleep(wait)
                continue
            resp.raise_for_status()
            data = resp.json()
            return [
                e["values"] for e in data["embeddings"]
            ]
        except Exception as exc:
            if attempt == 7:
                raise
            wait = (2 ** attempt) * 2
            logger.warning(
                f"Gemini embed error ({exc}), attempt {attempt+1}/8, retry in {wait}s"
            )
            time.sleep(wait)
    raise RuntimeError("Failed to embed batch after 8 retries")

# ==========================================================
# LOAD RERANKER
# ==========================================================

reranker = None
rerank_tokenizer = None

model_lock = threading.Lock()
reranker_load_attempted = False


def get_reranker():

    global reranker
    global rerank_tokenizer
    global reranker_load_attempted

    if not ENABLE_RERANK:
        return None, None

    if reranker is not None and rerank_tokenizer is not None:
        return reranker, rerank_tokenizer

    with model_lock:

        if reranker is not None and rerank_tokenizer is not None:
            return reranker, rerank_tokenizer

        if reranker_load_attempted:
            return reranker, rerank_tokenizer

        reranker_load_attempted = True

        try:

            import torch
            torch.set_grad_enabled(False)
            from transformers import AutoTokenizer, AutoModelForSequenceClassification

            logger.info(
                f"Loading reranker: {RERANK_MODEL}"
            )

            loaded_tokenizer = AutoTokenizer.from_pretrained(
                RERANK_MODEL
            )

            loaded_model = AutoModelForSequenceClassification.from_pretrained(
                RERANK_MODEL,
                torch_dtype=torch.float32
            )

            loaded_model.eval()

            rerank_tokenizer = loaded_tokenizer
            reranker = loaded_model

            logger.info(
                "Reranker loaded"
            )

        except Exception as e:

            logger.exception(
                f"Reranker failed: {e}"
            )

        return reranker, rerank_tokenizer

def normalize_embedding_matrix(values):

    embeddings = np.asarray(
        values,
        dtype=np.float32
    )

    if embeddings.ndim != 2:
        raise RuntimeError(
            "Embedding response did not contain a 2D embedding matrix"
        )

    if embeddings.shape[1] != EMBED_DIM:
        raise RuntimeError(
            f"Embedding dimension mismatch: EMBED_DIM={EMBED_DIM}, "
            f"returned {embeddings.shape[1]}"
        )

    norms = np.linalg.norm(
        embeddings,
        axis=1,
        keepdims=True
    )

    norms[norms == 0] = 1

    return embeddings / norms


async def generate_embeddings(texts):

    if not texts:
        return np.empty(
            (0, EMBED_DIM),
            dtype=np.float32
        )

    def _encode():
        all_embs = []
        for i in range(0, len(texts), GEMINI_EMBED_BATCH):
            sub = texts[i : i + GEMINI_EMBED_BATCH]
            batch_embs = _gemini_embed_batch(
                sub, task_type=GEMINI_EMBED_TASK_QUERY
            )
            all_embs.extend(batch_embs)
        return all_embs

    embeddings = await run_in_threadpool(_encode)

    return np.asarray(
        embeddings,
        dtype=np.float32
    )

# ==========================================================
# POSTGRES POOL
# ==========================================================

pg_pool = SimpleConnectionPool(
    minconn=PG_POOL_MIN,
    maxconn=PG_POOL_MAX,
    dbname=PG_DB,
    user=PG_USER,
    password=PG_PASS,
    host=PG_HOST,
    port=PG_PORT
)

logger.info(
    "✅ PostgreSQL pool ready"
)

# ==========================================================
# HELPERS
# ==========================================================

def get_conn():
    conn = pg_pool.getconn()

    with conn.cursor() as cur:

        cur.execute(
            "SET statement_timeout = %s",
            (POSTGRES_STATEMENT_TIMEOUT,)
        )

    return conn

def release_conn(conn):
    pg_pool.putconn(conn)


def validate_production_config():

    if ENVIRONMENT != "production":
        return

    weak_values = {
        "change_this_in_production",
        "CHANGE_THIS_TO_64_CHAR_SECRET",
        "change_this_key",
        "Password123",
        ""
    }

    if ENABLE_AUTH and API_KEY in weak_values:

        raise RuntimeError(
            "Refusing to start production API with an unsafe API_KEY"
        )

    if PG_PASS in weak_values:

        raise RuntimeError(
            "Refusing to start production API with an unsafe DB_PASSWORD"
        )

# ==========================================================
# ENSURE TABLES
# ==========================================================

def ensure_tables():

    conn = get_conn()

    try:

        with conn.cursor() as cur:

            cur.execute(
                "CREATE EXTENSION IF NOT EXISTS vector;"
            )

            cur.execute(
                "CREATE EXTENSION IF NOT EXISTS pg_trgm;"
            )

            cur.execute("""
                CREATE TABLE IF NOT EXISTS api_logs (
                    id BIGSERIAL PRIMARY KEY,
                    request_id TEXT,
                    query TEXT,
                    topic TEXT,
                    latency FLOAT,
                    top_k INTEGER,
                    client_ip TEXT,
                    created_at TIMESTAMP DEFAULT NOW()
                );
            """)

            cur.execute("""
                ALTER TABLE api_logs
                ADD COLUMN IF NOT EXISTS request_id TEXT;
            """)

            cur.execute("""
                ALTER TABLE api_logs
                ADD COLUMN IF NOT EXISTS query TEXT;
            """)

            cur.execute("""
                ALTER TABLE api_logs
                ADD COLUMN IF NOT EXISTS topic TEXT;
            """)

            cur.execute("""
                ALTER TABLE api_logs
                ADD COLUMN IF NOT EXISTS latency FLOAT;
            """)

            cur.execute("""
                ALTER TABLE api_logs
                ADD COLUMN IF NOT EXISTS top_k INTEGER;
            """)

            cur.execute("""
                ALTER TABLE api_logs
                ADD COLUMN IF NOT EXISTS client_ip TEXT;
            """)

            cur.execute("""
                ALTER TABLE api_logs
                ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
            """)

            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_api_logs_created
                ON api_logs(created_at);
            """)

            cur.execute("""
                ALTER TABLE IF EXISTS upsc_chunks
                ADD COLUMN IF NOT EXISTS page_number INTEGER;
            """)


            cur.execute("""
                ALTER TABLE IF EXISTS upsc_chunks
                ADD COLUMN IF NOT EXISTS subject_id TEXT;
            """)

            cur.execute(f"""
                CREATE TABLE IF NOT EXISTS upsc_chunks (
                    id TEXT PRIMARY KEY,
                    chunk TEXT,
                    topic TEXT,
                    difficulty TEXT,
                    source_file TEXT,
                    file_hash TEXT,
                    chunk_index INTEGER,
                    page_number INTEGER,
                    chunk_version INTEGER DEFAULT 1,
                    embedding VECTOR({EMBED_DIM}),
                    search_vector tsvector,
                    heading_hierarchy jsonb DEFAULT '[]'::jsonb,
                    parent_chunk TEXT DEFAULT '',
                    is_parent_chunk boolean DEFAULT false,
                    created_at TIMESTAMP DEFAULT NOW()
                );
            """)

            cur.execute(f"""
                ALTER TABLE upsc_chunks
                ADD COLUMN IF NOT EXISTS embedding VECTOR({EMBED_DIM});
            """)

            cur.execute("""
                ALTER TABLE upsc_chunks
                ADD COLUMN IF NOT EXISTS search_vector tsvector;
            """)

            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_topic
                ON upsc_chunks(topic);
            """)

            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_search_vector
                ON upsc_chunks
                USING GIN(search_vector);
            """)

            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_chunk_trgm
                ON upsc_chunks
                USING GIN(chunk gin_trgm_ops);
            """)

            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_embedding_hnsw
                ON upsc_chunks
                USING hnsw (
                    embedding vector_cosine_ops
                );
            """)

        conn.commit()

    finally:

        release_conn(conn)

# ==========================================================
# NORMALIZE QUERY
# ==========================================================

def normalize_query(query: str):

    query = unicodedata.normalize(
        "NFKC",
        query
    )

    query = query.lower()

    query = re.sub(
        r"\s+",
        " ",
        query
    )

    return query.strip()

# ==========================================================
# CACHE
# ==========================================================

def get_cache(key):

    if not ENABLE_CACHE:
        return None

    if redis_client:

        try:

            raw = redis_client.get(
                f"query_cache:{hashlib.sha256(key.encode()).hexdigest()}"
            )

            if raw:

                CACHE_HITS.labels(backend="redis").inc()

                return json.loads(raw)

        except Exception as e:

            logger.warning(f"Redis cache read failed: {e}")

    with cache_lock:

        if key not in query_cache:
            CACHE_MISSES.inc()
            return None

        payload = query_cache[key]

        age = time.time() - payload["timestamp"]

        if age > CACHE_TTL_SECONDS:

            del query_cache[key]

            return None

        query_cache.move_to_end(key)

        CACHE_HITS.labels(backend="memory").inc()

        return payload["data"]

def set_cache(key, value):

    if not ENABLE_CACHE:
        return

    if redis_client:

        try:

            redis_client.setex(
                f"query_cache:{hashlib.sha256(key.encode()).hexdigest()}",
                CACHE_TTL_SECONDS,
                json.dumps(value)
            )

            return

        except Exception as e:

            logger.warning(f"Redis cache write failed: {e}")

    with cache_lock:

        query_cache[key] = {
            "timestamp": time.time(),
            "data": value
        }

        query_cache.move_to_end(key)

        if len(query_cache) > CACHE_SIZE:

            query_cache.popitem(last=False)

# ==========================================================
# RATE LIMIT
# ==========================================================

def check_rate_limit(ip):

    if not ENABLE_RATE_LIMIT:
        return

    if redis_client:

        key = f"rate_limit:{ip}:{int(time.time() // 60)}"

        try:

            count = redis_client.incr(key)

            if count == 1:
                redis_client.expire(key, 70)

            if count > RATE_LIMIT_PER_MINUTE:

                raise HTTPException(
                    status_code=429,
                    detail="Rate limit exceeded"
                )

            return

        except HTTPException:
            raise

        except Exception as e:

            logger.warning(f"Redis rate limit failed: {e}")

    now = time.time()

    with rate_limit_lock:

        requests = request_tracker.get(ip, [])

        requests = [
            r
            for r in requests
            if now - r < 60
        ]

        if len(requests) >= RATE_LIMIT_PER_MINUTE:

            raise HTTPException(
                status_code=429,
                detail="Rate limit exceeded"
            )

        requests.append(now)

        request_tracker[ip] = requests

# ==========================================================
# AUTH
# ==========================================================

def verify_api_key(x_api_key):

    if not ENABLE_AUTH:
        return

    if not x_api_key:

        raise HTTPException(
            status_code=401,
            detail="Missing API key"
        )

    if not hmac.compare_digest(x_api_key, API_KEY):

        raise HTTPException(
            status_code=403,
            detail="Invalid API key"
        )

# ==========================================================
# VECTOR SEARCH
# ==========================================================

def pgvector_literal(embedding):
    values = (
        embedding.tolist()
        if hasattr(embedding, "tolist")
        else list(embedding)
    )

    return "[" + ",".join(str(float(value)) for value in values) + "]"

def pgvector_search(
    query_embedding,
    topic=None,
    subject_ids=None
):

    conn = get_conn()
    query_vector = pgvector_literal(query_embedding)

    try:

        with conn.cursor(
            cursor_factory=RealDictCursor
        ) as cur:

            cur.execute("SET LOCAL hnsw.ef_search = %s", (HNSW_EF_SEARCH,))

            if topic and subject_ids:

                cur.execute("""
                    SELECT
                        id,
                        chunk,
                        topic,
                        subject_id,
                        difficulty,
                        source_file,
                        chunk_index,
                        page_number,
                        heading_hierarchy,
                        parent_chunk,
                        is_parent_chunk,
                        1 - (embedding <=> %s::vector) AS vector_score
                    FROM upsc_chunks
                    WHERE embedding IS NOT NULL
                      AND topic=%s
                      AND subject_id = ANY(%s::text[])
                    ORDER BY embedding <=> %s::vector
                    LIMIT %s
                """, (
                    query_vector,
                    topic,
                    subject_ids,
                    query_vector,
                    VECTOR_CANDIDATES
                ))

            elif topic:

                cur.execute("""
                    SELECT
                        id,
                        chunk,
                        topic,
                        subject_id,
                        difficulty,
                        source_file,
                        chunk_index,
                        page_number,
                        heading_hierarchy,
                        parent_chunk,
                        is_parent_chunk,
                        1 - (embedding <=> %s::vector) AS vector_score
                    FROM upsc_chunks
                    WHERE embedding IS NOT NULL
                      AND topic=%s
                    ORDER BY embedding <=> %s::vector
                    LIMIT %s
                """, (
                    query_vector,
                    topic,
                    query_vector,
                    VECTOR_CANDIDATES
                ))

            elif subject_ids:

                cur.execute("""
                    SELECT
                        id,
                        chunk,
                        topic,
                        subject_id,
                        difficulty,
                        source_file,
                        chunk_index,
                        page_number,
                        heading_hierarchy,
                        parent_chunk,
                        is_parent_chunk,
                        1 - (embedding <=> %s::vector) AS vector_score
                    FROM upsc_chunks
                    WHERE embedding IS NOT NULL
                      AND subject_id = ANY(%s::text[])
                    ORDER BY embedding <=> %s::vector
                    LIMIT %s
                """, (
                    query_vector,
                    subject_ids,
                    query_vector,
                    VECTOR_CANDIDATES
                ))

            else:

                cur.execute("""
                    SELECT
                        id,
                        chunk,
                        topic,
                        subject_id,
                        difficulty,
                        source_file,
                        chunk_index,
                        page_number,
                        heading_hierarchy,
                        parent_chunk,
                        is_parent_chunk,
                        1 - (embedding <=> %s::vector) AS vector_score
                    FROM upsc_chunks
                    WHERE embedding IS NOT NULL
                    ORDER BY embedding <=> %s::vector
                    LIMIT %s
                """, (
                    query_vector,
                    query_vector,
                    VECTOR_CANDIDATES
                ))

            rows = cur.fetchall()

            chunks = []

            for row in rows:

                score = max(
                    0.0,
                    float(row["vector_score"] or 0)
                )

                if score < MIN_SIMILARITY_SCORE:
                    continue

                # Parent-Child: return parent_chunk for generation context
                # but keep child chunk for search precision
                parent_text = row.get("parent_chunk") or ""
                child_text = row["chunk"]
                heading_hierarchy = row.get("heading_hierarchy") or []

                # Use parent chunk if available (richer context for Gemini)
                text_for_generation = parent_text if parent_text else child_text

                chunks.append({
                    "id": row["id"],
                    "text": text_for_generation,
                    "child_text": child_text,
                    "metadata": {
                        "subject_id": row.get("subject_id") or "",
                        "topic": row["topic"],
                        "difficulty": row["difficulty"],
                        "source_file": row["source_file"],
                        "chunk_index": row.get("chunk_index") or 0,
                        "page_number": row.get("page_number") or 0,
                        "heading_hierarchy": heading_hierarchy,
                        "is_parent_chunk": row.get("is_parent_chunk") or False,
                    },
                    "vector_score": round(score, 4)
                })

            return chunks

    except Exception as e:

        logger.exception(
            f"âŒ pgvector search failed: {e}"
        )

        return []

    finally:

        release_conn(conn)

# ==========================================================
# REQUEST HELPERS
# ==========================================================

def request_bool(
    body,
    key,
    default=False
):

    value = body.get(
        key,
        default
    )

    if isinstance(value, bool):
        return value

    if isinstance(value, str):
        return value.strip().lower() in {
            "1",
            "true",
            "yes",
            "on"
        }

    return bool(value)

# ==========================================================
# BM25 SEARCH
# ==========================================================

def postgres_bm25_search(
    query,
    topic=None,
    subject_ids=None
):

    conn = get_conn()

    try:

        with conn.cursor(
            cursor_factory=RealDictCursor
        ) as cur:

            if topic and subject_ids:

                cur.execute("""
                    SELECT
                        id,
                        chunk,
                        topic,
                        subject_id,
                        difficulty,
                        source_file,
                        page_number,
                        heading_hierarchy,
                        parent_chunk,
                        is_parent_chunk,
                        ts_rank(
                            search_vector,
                            plainto_tsquery(
                                'english',
                                %s
                            )
                        ) AS bm25_score

                    FROM upsc_chunks

                    WHERE
                        search_vector @@ plainto_tsquery(
                            'english',
                            %s
                        )
                        AND topic=%s
                        AND subject_id = ANY(%s::text[])

                    ORDER BY bm25_score DESC
                    LIMIT %s
                """, (
                    query,
                    query,
                    topic,
                    subject_ids,
                    BM25_CANDIDATES
                ))

            elif topic:

                cur.execute("""
                    SELECT
                        id,
                        chunk,
                        topic,
                        subject_id,
                        difficulty,
                        source_file,
                        page_number,
                        heading_hierarchy,
                        parent_chunk,
                        is_parent_chunk,
                        ts_rank(
                            search_vector,
                            plainto_tsquery(
                                'english',
                                %s
                            )
                        ) AS bm25_score

                    FROM upsc_chunks

                    WHERE
                        search_vector @@ plainto_tsquery(
                            'english',
                            %s
                        )
                        AND topic=%s

                    ORDER BY bm25_score DESC
                    LIMIT %s
                """, (
                    query,
                    query,
                    topic,
                    BM25_CANDIDATES
                ))

            elif subject_ids:

                cur.execute("""
                    SELECT
                        id,
                        chunk,
                        topic,
                        subject_id,
                        difficulty,
                        source_file,
                        page_number,
                        heading_hierarchy,
                        parent_chunk,
                        is_parent_chunk,
                        ts_rank(
                            search_vector,
                            plainto_tsquery(
                                'english',
                                %s
                            )
                        ) AS bm25_score

                    FROM upsc_chunks

                    WHERE
                        search_vector @@ plainto_tsquery(
                            'english',
                            %s
                        )
                        AND subject_id = ANY(%s::text[])

                    ORDER BY bm25_score DESC
                    LIMIT %s
                """, (
                    query,
                    query,
                    subject_ids,
                    BM25_CANDIDATES
                ))

            else:

                cur.execute("""
                    SELECT
                        id,
                        chunk,
                        topic,
                        subject_id,
                        difficulty,
                        source_file,
                        page_number,
                        heading_hierarchy,
                        parent_chunk,
                        is_parent_chunk,
                        ts_rank(
                            search_vector,
                            plainto_tsquery(
                                'english',
                                %s
                            )
                        ) AS bm25_score

                    FROM upsc_chunks

                    WHERE
                        search_vector @@ plainto_tsquery(
                            'english',
                            %s
                        )

                    ORDER BY bm25_score DESC
                    LIMIT %s
                """, (
                    query,
                    query,
                    BM25_CANDIDATES
                ))

            rows = cur.fetchall()

            results = []

            for row in rows:

                parent_text = row.get("parent_chunk") or ""
                child_text = row["chunk"]
                heading_hierarchy = row.get("heading_hierarchy") or []

                text_for_generation = parent_text if parent_text else child_text

                results.append({
                    "id": row["id"],
                    "text": text_for_generation,
                    "child_text": child_text,
                    "metadata": {
                        "subject_id": row.get("subject_id") or "",
                        "topic": row["topic"],
                        "difficulty": row["difficulty"],
                        "source_file": row["source_file"],
                        "page_number": row.get("page_number") or 0,
                        "heading_hierarchy": heading_hierarchy,
                        "is_parent_chunk": row.get("is_parent_chunk") or False,
                    },
                    "bm25_score": float(
                        row["bm25_score"]
                    )
                })

            return results

    finally:

        release_conn(conn)

# ==========================================================
# RRF FUSION
# ==========================================================

def reciprocal_rank_fusion(
    vector_results,
    bm25_results
):

    combined = {}

    k = 60

    for rank, item in enumerate(vector_results):

        cid = item["id"]

        if cid not in combined:
            combined[cid] = item

        combined[cid]["rrf_score"] = (
            combined[cid].get(
                "rrf_score",
                0
            )
            + 1 / (k + rank + 1)
        )

    for rank, item in enumerate(bm25_results):

        cid = item["id"]

        if cid not in combined:
            combined[cid] = item

        combined[cid]["rrf_score"] = (
            combined[cid].get(
                "rrf_score",
                0
            )
            + 1 / (k + rank + 1)
        )

    results = list(combined.values())

    results.sort(
        key=lambda x: x["rrf_score"],
        reverse=True
    )

    return results

# ==========================================================
# DEDUP
# ==========================================================

def deduplicate_chunks(chunks):

    seen = set()

    final = []

    for chunk in chunks:

        key = (
            chunk["text"][:200]
            .strip()
            .lower()
        )

        if key in seen:
            continue

        seen.add(key)

        final.append(chunk)

    return final


def semantic_deduplicate(chunks, threshold=88):

    if len(chunks) <= 1:
        return chunks

    try:
        from rapidfuzz import fuzz
    except ImportError:
        return chunks

    chunks.sort(
        key=lambda x: x.get(
            "rrf_score",
            0
        ),
        reverse=True
    )

    kept = []
    kept_lower = []

    for chunk in chunks:
        text = chunk.get(
            "text",
            ""
        ).strip()
        if not text:
            continue

        text_lower = text.lower()
        is_dup = False

        for existing_lower in kept_lower:
            similarity = fuzz.ratio(
                text_lower,
                existing_lower
            )
            if similarity >= threshold:
                is_dup = True
                break

        if not is_dup:
            kept.append(chunk)
            kept_lower.append(text_lower)

    return kept


def deduplicate_parent_chunks(chunks):

    parent_map = {}

    for chunk in chunks:

        parent_key = (
            chunk["text"][:300]
            .strip()
            .lower()
        )

        best_score = (
            chunk.get("rrf_score", 0)
            + chunk.get("vector_score", 0)
            + chunk.get("bm25_score", 0)
        )

        if parent_key not in parent_map:
            parent_map[parent_key] = {
                "chunk": chunk,
                "score": best_score
            }
        elif best_score > parent_map[parent_key]["score"]:
            parent_map[parent_key] = {
                "chunk": chunk,
                "score": best_score
            }

    return [
        entry["chunk"]
        for entry in parent_map.values()
    ]

# ==========================================================
# DIVERSITY
# ==========================================================

def diversify_chunks(chunks):

    topic_counter = {}

    final = []

    for chunk in chunks:

        topic = chunk["metadata"].get(
            "topic",
            "General"
        )

        count = topic_counter.get(
            topic,
            0
        )

        if count >= 2:
            continue

        topic_counter[topic] = count + 1

        final.append(chunk)

    return final

# ==========================================================
# RERANK
# ==========================================================

def rerank_chunks(
    query,
    chunks,
    final_top_k
):

    model, tokenizer = get_reranker()

    if model is None or tokenizer is None:
        return chunks[:final_top_k]

    try:

        # Filter out chunks with empty/invalid text (avoids tokenizer crash)
        valid = [c for c in chunks if c.get("text") and len(c["text"].strip()) > 0]
        if not valid:
            return chunks[:final_top_k]

        queries = [query] * len(valid)
        docs = [c["text"] for c in valid]

        inputs = tokenizer(
            queries,
            docs,
            padding=True,
            truncation=True,
            max_length=512,
            return_tensors="pt"
        )

        with torch.no_grad():

            outputs = model(
                **inputs
            )

        scores = (
            outputs.logits
            .squeeze(-1)
            .cpu()
            .numpy()
        )

        reranked = []

        for chunk, score in zip(
            valid,
            scores
        ):

            chunk["rerank_score"] = round(
                float(score),
                4
            )

            reranked.append(chunk)

        reranked.sort(
            key=lambda x: x["rerank_score"],
            reverse=True
        )

        return reranked[:final_top_k]

    except Exception as e:

        logger.exception(
            f"❌ Rerank failed: {e}"
        )

        return chunks[:final_top_k]

# ==========================================================
# FINAL RETRIEVAL
# ==========================================================

async def hybrid_retrieval(
    query,
    top_k,
    topic=None,
    subject_ids=None,
    use_rerank=True
):

    cache_key = (
        f"{query}_{topic}_{subject_ids}_{top_k}_{use_rerank}"
    )

    cached = get_cache(cache_key)

    if cached:
        return cached

    q_emb = (
        await generate_embeddings(
            [query]
        )
    )[0]

    vector_results = await run_in_threadpool(
        pgvector_search,
        q_emb,
        topic,
        subject_ids
    )

    bm25_results = await run_in_threadpool(
        postgres_bm25_search,
        query,
        topic,
        subject_ids
    )

    fused = reciprocal_rank_fusion(
        vector_results,
        bm25_results
    )

    fused = deduplicate_chunks(
        fused
    )

    fused = semantic_deduplicate(
        fused,
        threshold=88
    )

    if use_rerank and ENABLE_RERANK:

        fused = await run_in_threadpool(
            rerank_chunks,
            query,
            fused[:RERANK_CANDIDATES],
            top_k
        )

    else:

        fused = fused[:top_k]

    fused = diversify_chunks(
        fused
    )

    fused = deduplicate_parent_chunks(
        fused
    )

    final = []

    for item in fused[:top_k]:

        text = item["text"]

        if len(text) > MAX_CHUNK_CHARS:

            text = text[:MAX_CHUNK_CHARS]

        item["text"] = text

        final.append(item)

    set_cache(
        cache_key,
        final
    )

    return final

# ==========================================================
# REQUEST LOGGING
# ==========================================================

def log_request(
    request_id,
    query,
    topic,
    latency,
    top_k,
    client_ip
):

    conn = get_conn()

    try:

        with conn.cursor() as cur:

            cur.execute("""
                INSERT INTO api_logs (
                    request_id,
                    query,
                    topic,
                    latency,
                    top_k,
                    client_ip
                )
                VALUES (%s,%s,%s,%s,%s,%s)
            """, (
                request_id,
                query,
                topic,
                latency,
                top_k,
                client_ip
            ))

        conn.commit()

    except Exception as e:

        logger.warning(
            f"Request log failed: {e}"
        )

    finally:

        release_conn(conn)

# ==========================================================
# FASTAPI
# ==========================================================

app = FastAPI(
    title="Enterprise Hybrid Retrieval API",
    version=APP_VERSION
)

CORS_ALLOW_ORIGINS = [
    origin.strip()
    for origin in os.getenv("CORS_ALLOW_ORIGINS", "*").split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ALLOW_ORIGINS,
    allow_methods=[
        method.strip()
        for method in os.getenv("CORS_ALLOW_METHODS", "*").split(",")
        if method.strip()
    ],
    allow_headers=[
        header.strip()
        for header in os.getenv("CORS_ALLOW_HEADERS", "*").split(",")
        if header.strip()
    ]
)

app.add_middleware(
    GZipMiddleware,
    minimum_size=1000
)

# ==========================================================
# STARTUP
# ==========================================================

@app.on_event("startup")
def startup():

    logger.info(
        "🚀 Starting API"
    )

    validate_production_config()

    ensure_tables()


@app.middleware("http")
async def security_headers(request, call_next):

    response = await call_next(request)

    if os.getenv("ENABLE_SECURITY_HEADERS", "true").lower() == "true":

        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"

    return response

# ==========================================================
# GLOBAL ERROR
# ==========================================================

@app.exception_handler(Exception)
async def global_exception_handler(
    request,
    exc
):

    logger.exception(
        f"❌ Unhandled exception: {exc}"
    )

    return JSONResponse(
        status_code=500,
        content={
            "status": "error",
            "message": str(exc)
        }
    )

# ==========================================================
# RETRIEVAL ENDPOINT
# ==========================================================

@app.post("/chunks")
async def chunks_api(
    request: Request,
    x_api_key: str = Header(None)
):

    verify_api_key(x_api_key)

    client_ip = request.client.host

    if TRUST_PROXY_HEADERS:

        forwarded_for = request.headers.get("x-forwarded-for")

        if forwarded_for:

            client_ip = forwarded_for.split(",")[0].strip()

    check_rate_limit(client_ip)

    request_id = str(uuid.uuid4())

    start_time = time.time()

    try:

        body = await request.json()

        query = body.get(
            "query",
            ""
        ).strip()

        topic = body.get(
            "topic",
            None
        )

        subject_id = body.get(
            "subject_id",
            None
        )

        if subject_id:
            subject_id = subject_id.strip().lower()

        subject_ids = body.get(
            "subject_ids",
            None
        )

        if subject_ids and isinstance(subject_ids, list):
            subject_ids = [
                s.strip().lower()
                for s in subject_ids
                if s and s.strip()
            ]
            if not subject_ids:
                subject_ids = None

        top_k = int(
            body.get(
                "top_k",
                TOP_K
            )
        )

        top_k = max(
            1,
            min(
                top_k,
                MAX_TOP_K
            )
        )

        use_rerank = (
            ENABLE_RERANK
            and not request_bool(
                body,
                "skip_rerank",
                False
            )
        )

        if "rerank" in body:

            use_rerank = request_bool(
                body,
                "rerank",
                use_rerank
            )

        if not query:

            raise HTTPException(
                status_code=400,
                detail="Query required"
            )

        if len(query) > MAX_QUERY_LENGTH:

            raise HTTPException(
                status_code=400,
                detail="Query too long"
            )

        if len(query) < MIN_QUERY_LENGTH:

            raise HTTPException(
                status_code=400,
                detail="Query too short"
            )

        query = normalize_query(query)

        logger.info(
            f"🔎 Query: {query}"
        )

        effective_subject_ids = (
            subject_ids if subject_ids
            else [subject_id] if subject_id
            else None
        )

        chunks = await hybrid_retrieval(
            query=query,
            top_k=top_k,
            topic=topic,
            subject_ids=effective_subject_ids,
            use_rerank=use_rerank
        )

        latency = round(
            time.time() - start_time,
            3
        )

        log_request(
            request_id,
            query,
            topic,
            latency,
            top_k,
            client_ip
        )

        REQUEST_COUNT.labels(endpoint="/chunks", status="success").inc()
        REQUEST_LATENCY.labels(endpoint="/chunks").observe(latency)

        return {
            "request_id": request_id,
            "query": query,
            "count": len(chunks),
            "latency_seconds": latency,
            "device": DEVICE,
            "reranking_enabled": (
                use_rerank and ENABLE_RERANK and reranker is not None
            ),
            "hybrid_search": True,
            "chunks": chunks
        }

    except HTTPException:

        REQUEST_COUNT.labels(endpoint="/chunks", status="client_error").inc()

        raise

    except Exception as e:

        logger.exception(
            f"❌ Retrieval failed: {e}"
        )

        REQUEST_COUNT.labels(endpoint="/chunks", status="error").inc()

        return {
            "request_id": request_id,
            "error": str(e),
            "chunks": []
        }

# ==========================================================
# FAITHFULNESS VERIFICATION
# ==========================================================

VERIFY_THRESHOLD = float(
    os.getenv("VERIFY_THRESHOLD", "0.45")
)


@app.post("/verify")
async def verify_faithfulness(
    request: Request,
    x_api_key: str = Header(None)
):

    verify_api_key(x_api_key)

    client_ip = request.client.host

    if TRUST_PROXY_HEADERS:

        forwarded_for = request.headers.get("x-forwarded-for")

        if forwarded_for:

            client_ip = forwarded_for.split(",")[0].strip()

    check_rate_limit(client_ip)

    body = await request.json()

    sentences = body.get("sentences", [])

    chunks = body.get("chunks", [])

    threshold = float(
        body.get(
            "threshold",
            VERIFY_THRESHOLD
        )
    )

    if not sentences or not chunks:

        raise HTTPException(
            status_code=400,
            detail="sentences and chunks are required"
        )

    chunk_texts = [
        c.get("text", "")
        for c in chunks
    ]

    chunk_ids = [
        c.get("id", f"chunk_{i}")
        for i, c in enumerate(chunks)
    ]

    all_texts = sentences + chunk_texts

    embeddings = await generate_embeddings(
        all_texts
    )

    sentence_embs = embeddings[:len(sentences)]

    chunk_embs = embeddings[len(sentences):]

    sim_matrix = np.dot(
        sentence_embs,
        chunk_embs.T
    )

    chunk_max_scores = [0.0] * len(chunks)

    results = []

    for i, sentence in enumerate(sentences):

        scores = sim_matrix[i]

        max_idx = int(np.argmax(scores))

        max_score = float(scores[max_idx])

        chunk_max_scores[max_idx] = max(
            chunk_max_scores[max_idx],
            max_score
        )

        verdict = (
            "SUPPORTED"
            if max_score >= threshold
            else "UNSUPPORTED"
        )

        results.append({
            "sentence": sentence,
            "score": round(max_score, 4),
            "bestChunkId": chunk_ids[max_idx],
            "verdict": verdict
        })

    return {
        "results": results,
        "chunkScores": [
            round(s, 4)
            for s in chunk_max_scores
        ]
    }


# ==========================================================
# INGESTION ENDPOINTS
# ==========================================================

@app.post("/ingest-hybrid")
async def ingest_hybrid_endpoint(
    request: Request,
    x_api_key: str = Header(None)
):

    verify_api_key(x_api_key)

    body = await request.json()
    folder = body.get(
        "folder",
        "/app/data"
    )

    try:
        from tasks import ingest_folder_task

        task = ingest_folder_task.delay(folder)

        return {
            "status": "queued",
            "job_id": task.id,
            "folder": folder
        }

    except Exception as e:

        logger.exception(
            f"Failed to queue ingestion: {e}"
        )

        raise HTTPException(
            status_code=500,
            detail=f"Failed to queue ingestion: {str(e)}"
        )


@app.post("/ingest-file")
async def ingest_file_endpoint(
    request: Request,
    x_api_key: str = Header(None)
):

    verify_api_key(x_api_key)

    body = await request.json()
    file_path = body.get(
        "file_path",
        None
    )

    if not file_path:

        raise HTTPException(
            status_code=400,
            detail="file_path is required"
        )

    try:
        from tasks import ingest_file_task

        if not file_path.startswith("/"):
            file_path = f"/app/data/{file_path}"

        task = ingest_file_task.delay(file_path)

        return {
            "status": "queued",
            "job_id": task.id,
            "file": file_path
        }

    except Exception as e:

        logger.exception(
            f"Failed to queue file ingestion: {e}"
        )

        raise HTTPException(
            status_code=500,
            detail=f"Failed to queue ingestion: {str(e)}"
        )


@app.get("/ingest-status/{job_id}")
async def ingest_status(
    job_id: str,
    x_api_key: str = Header(None)
):

    verify_api_key(x_api_key)

    try:
        from celery_app import celery as celery_app

        result = celery_app.AsyncResult(job_id)

        return {
            "job_id": job_id,
            "status": result.status,
            "result": result.result if result.ready() else None
        }

    except Exception as e:

        raise HTTPException(
            status_code=500,
            detail=f"Failed to get status: {str(e)}"
        )


# ==========================================================
# HEALTH
# ==========================================================

@app.get("/health")
def health():

    postgres_ok = False
    pgvector_count = 0

    try:
        conn = get_conn()

        with conn.cursor() as cur:

            cur.execute("SELECT 1")
            cur.execute("""
                SELECT COUNT(*)
                FROM upsc_chunks
                WHERE embedding IS NOT NULL
            """)
            pgvector_count = int(cur.fetchone()[0])

        postgres_ok = True
        PGVECTOR_DOCS.set(pgvector_count)

    except:
        postgres_ok = False

    finally:

        try:
            release_conn(conn)
        except:
            pass

    return {
        "status": "ok",
        "version": APP_VERSION,
        "device": DEVICE,
        "postgres": postgres_ok,
        "vector_store": "postgres_pgvector",
        "embedding_provider": EMBED_PROVIDER,
        "embedding_model": EMBED_MODEL,
        "local_embedding": True,
        "reranker_model": RERANK_MODEL,
        "reranker_model_loaded": reranker is not None,
        "cache_entries": len(query_cache),
        "rate_limit_per_minute": RATE_LIMIT_PER_MINUTE,
        "pgvector_documents": pgvector_count
    }

# ==========================================================
# METRICS
# ==========================================================

@app.get("/metrics")
def metrics():

    return Response(
        content=generate_latest(),
        media_type=CONTENT_TYPE_LATEST
    )

# ==========================================================
# ROOT
# ==========================================================

@app.get("/")
def root():

    return {
        "service": "Enterprise Hybrid Retrieval API",
        "status": "running",
        "version": APP_VERSION,
        "gpu": DEVICE == "cuda",
        "vector_store": "postgres_pgvector",
        "hybrid_retrieval": True,
        "mobile_rag_optimized": True,
        "production_ready": True
    }
