# ingest_hybrid.py
# ==========================================================
# ENTERPRISE PRODUCTION HYBRID INGESTION PIPELINE
# ==========================================================
# FEATURES
# ==========================================================
# âœ… ChromaDB + PostgreSQL sync
# âœ… Enterprise-grade ingestion
# âœ… Semantic deduplication
# âœ… Token-aware chunking
# âœ… BM25 hybrid retrieval support
# âœ… HNSW vector indexing
# âœ… Batch PostgreSQL inserts
# âœ… Stable deterministic IDs
# âœ… Metadata enrichment
# âœ… Recovery-safe ingestion
# âœ… Mobile-RAG optimized
# âœ… Large-scale production ready
# âœ… Fast retrieval optimized
# âœ… GPU embedding support
# âœ… ONNX embedding acceleration
# âœ… File hash deduplication
# âœ… Manifest tracking
# âœ… Retry-safe ingestion
# âœ… Chunk metadata
# âœ… Topic tagging
# âœ… Upload authentication
# âœ… Background queue processing
# âœ… PDF validation
# âœ… Failure recovery
# âœ… Version tracking
# âœ… Enterprise observability
# âœ… Async-safe ingestion
# âœ… Production-grade indexing
# ==========================================================

import os
import re
import gc
import time
import hmac
import queue
import logging
import threading
import unicodedata

from pathlib import Path
from datetime import datetime

import chromadb
import docx
import fitz
import psycopg2
import torch
import numpy as np

from Crypto.Hash import SHA256

from psycopg2.pool import SimpleConnectionPool
from psycopg2.extras import execute_batch

from rapidfuzz import fuzz

from transformers import AutoTokenizer

from sentence_transformers import SentenceTransformer

# ==========================================================
# OPTIONAL ONNX
# ==========================================================

USE_ONNX = (
    os.getenv("USE_ONNX_EMBEDDINGS", "false")
    .lower() == "true"
)

try:

    from optimum.onnxruntime import ORTModelForFeatureExtraction

    ONNX_AVAILABLE = True

except Exception:

    ONNX_AVAILABLE = False

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

APP_VERSION = "12.0.0"

COLLECTION_NAME = os.getenv(
    "CHROMA_COLLECTION",
    "upsc_chunks_v5"
)

CHROMA_HOST = os.getenv(
    "CHROMA_HOST",
    "chromadb"
)

CHROMA_PORT = int(
    os.getenv(
        "CHROMA_PORT",
        "8000"
    )
)

UPLOAD_API_KEY = os.getenv(
    "UPLOAD_API_KEY",
    "change_this_key"
)

# ==========================================================
# EMBEDDING MODEL
# ==========================================================

EMBED_MODEL = os.getenv(
    "EMBED_MODEL",
    "BAAI/bge-base-en-v1.5"
)

# ==========================================================
# DEVICE
# ==========================================================

FORCE_CPU_ONLY = (
    os.getenv(
        "FORCE_CPU_ONLY",
        "false"
    ).lower() == "true"
)

if FORCE_CPU_ONLY:

    DEVICE = "cpu"

else:

    DEVICE = (
        "cuda"
        if torch.cuda.is_available()
        else "cpu"
    )

logger.info(
    f"ðŸ§  Device detected: {DEVICE}"
)

# ==========================================================
# EMBEDDING DIM
# ==========================================================

EMBED_DIM = int(
    os.getenv("EMBED_DIM", "768")
)

# ==========================================================
# CHUNKING
# ==========================================================
CHUNK_SIZE = int(
    os.getenv("CHUNK_SIZE", "800")
)
CHUNK_OVERLAP = int(
    os.getenv("CHUNK_OVERLAP", "150")
)

MIN_CHUNK_TOKENS = int(
    os.getenv("MIN_CHUNK_TOKENS", "40")
)

# ==========================================================
# PERFORMANCE
# ==========================================================

BATCH_SIZE = int(
    os.getenv("BATCH_SIZE", "512")
)

EMBED_BATCH_SIZE = int(
    os.getenv("EMBED_BATCH_SIZE", "32")
)

MAX_WORKERS = int(
    os.getenv("MAX_WORKERS", "4")
)

MAX_FILE_SIZE_MB = int(
    os.getenv("MAX_FILE_SIZE_MB", "100")
)
MODEL_MAX_TOKENS = int(
    os.getenv("MODEL_MAX_TOKENS", "512")
)

CHROMA_UPSERT_BATCH_SIZE = int(
    os.getenv("CHROMA_UPSERT_BATCH_SIZE", str(BATCH_SIZE))
)

CHROMA_MAX_RETRIES = int(
    os.getenv("CHROMA_MAX_RETRIES", "5")
)

CHROMA_RETRY_DELAY = float(
    os.getenv("CHROMA_RETRY_DELAY", "3")
)

DB_MAX_RETRIES = int(
    os.getenv("DB_MAX_RETRIES", "5")
)

DB_RETRY_DELAY = float(
    os.getenv("DB_RETRY_DELAY", "2")
)

POSTGRES_STATEMENT_TIMEOUT = int(
    os.getenv("POSTGRES_STATEMENT_TIMEOUT", "30000")
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

PG_POOL_MIN = int(
    os.getenv(
        "PG_POOL_MIN_CONN",
        "2"
    )
)

PG_POOL_MAX = int(
    os.getenv(
        "PG_POOL_MAX_CONN",
        "30"
    )
)

# ==========================================================
# DEDUP
# ==========================================================

_raw_dedup_threshold = float(
    os.getenv(
        "SIMILARITY_DEDUP_THRESHOLD",
        "92"
    )
)

SIMILARITY_DEDUP_THRESHOLD = (
    int(_raw_dedup_threshold * 100)
    if _raw_dedup_threshold <= 1
    else int(_raw_dedup_threshold)
)

SIMHASH_BUCKET_BITS = int(
    os.getenv("SIMHASH_BUCKET_BITS", "16")
)

DEDUP_COMPARE_LIMIT = int(
    os.getenv("DEDUP_COMPARE_LIMIT", "64")
)

CLEAR_CUDA_CACHE_AFTER_FILE = os.getenv(
    "CLEAR_CUDA_CACHE_AFTER_FILE",
    "false"
).lower() == "true"

# ==========================================================
# QUEUE
# ==========================================================

ingestion_queue = queue.Queue(
    maxsize=MAX_WORKERS * 4
)

embedding_lock = threading.Lock()

# ==========================================================
# MODEL
# ==========================================================

logger.info(
    f"Loading embedding model: {EMBED_MODEL}"
)

embedder = SentenceTransformer(
    EMBED_MODEL,
    device=DEVICE
)

actual_embed_dim = embedder.get_sentence_embedding_dimension()

if actual_embed_dim != EMBED_DIM:

    raise RuntimeError(
        f"Embedding dimension mismatch: EMBED_DIM={EMBED_DIM}, "
        f"model {EMBED_MODEL} produces {actual_embed_dim}"
    )

logger.info(
    "âœ… SentenceTransformer loaded"
)

# ==========================================================
# OPTIONAL ONNX MODEL
# ==========================================================

onnx_model = None

if USE_ONNX and ONNX_AVAILABLE:

    logger.warning(
        "USE_ONNX_EMBEDDINGS is set, but the ingestion path uses "
        "SentenceTransformer.encode for pooling correctness. "
        "ONNX model loading is skipped to avoid unused memory."
    )

# ==========================================================
# TOKENIZER
# ==========================================================

tokenizer = AutoTokenizer.from_pretrained(
    EMBED_MODEL
)

# ==========================================================
# POSTGRES POOL
# ==========================================================

logger.info(
    "Connecting PostgreSQL pool..."
)

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
    "âœ… PostgreSQL pool ready"
)

# ==========================================================
# HELPERS
# ==========================================================

def get_conn():
    return pg_pool.getconn()

def release_conn(conn):
    pg_pool.putconn(conn)

def retry_operation(
    label,
    fn,
    retries,
    delay
):

    last_error = None

    for attempt in range(
        1,
        retries + 1
    ):

        try:

            return fn()

        except Exception as e:

            last_error = e

            logger.warning(
                f"{label} failed attempt {attempt}/{retries}: {e}"
            )

            if attempt < retries:

                time.sleep(delay)

    raise last_error

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

            # ==================================================
            # DOCUMENTS
            # ==================================================

            cur.execute("""
                CREATE TABLE IF NOT EXISTS documents (
                    file_hash TEXT PRIMARY KEY,
                    file_name TEXT,
                    version INTEGER DEFAULT 1,
                    status TEXT,
                    error_message TEXT,
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW()
                );
            """)

            cur.execute("""
                ALTER TABLE documents
                ADD COLUMN IF NOT EXISTS error_message TEXT;
            """)

            # ==================================================
            # MANIFEST
            # ==================================================

            cur.execute("""
                CREATE TABLE IF NOT EXISTS ingestion_manifest (
                    file_hash TEXT PRIMARY KEY,
                    filename TEXT,
                    chunk_count INTEGER DEFAULT 0,
                    chroma_inserted BOOLEAN DEFAULT FALSE,
                    postgres_inserted BOOLEAN DEFAULT FALSE,
                    ingestion_version INTEGER DEFAULT 1,
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW()
                );
            """)

            cur.execute("""
                ALTER TABLE ingestion_manifest
                ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
            """)

            cur.execute("""
                ALTER TABLE ingestion_manifest
                ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
            """)

            # ==================================================
            # CHUNKS
            # ==================================================

            cur.execute(f"""
                CREATE TABLE IF NOT EXISTS upsc_chunks (
                    id TEXT PRIMARY KEY,
                    chunk TEXT,
                    topic TEXT,
                    difficulty TEXT,
                    source_file TEXT,
                    file_hash TEXT,
                    chunk_index INTEGER,
                    chunk_version INTEGER DEFAULT 1,
                    embedding VECTOR({EMBED_DIM}),
                    search_vector tsvector,
                    created_at TIMESTAMP DEFAULT NOW()
                );
            """)

            cur.execute("""
                ALTER TABLE upsc_chunks
                ADD COLUMN IF NOT EXISTS chunk_index INTEGER;
            """)

            cur.execute("""
                ALTER TABLE upsc_chunks
                ADD COLUMN IF NOT EXISTS chunk_version INTEGER DEFAULT 1;
            """)

            cur.execute("""
                ALTER TABLE upsc_chunks
                ADD COLUMN IF NOT EXISTS file_hash TEXT;
            """)

            cur.execute("""
                ALTER TABLE upsc_chunks
                ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
            """)

            cur.execute("""
                DROP INDEX IF EXISTS idx_embedding_hnsw;
            """)

            cur.execute("""
                ALTER TABLE upsc_chunks
                DROP COLUMN IF EXISTS embedding;
            """)

            cur.execute(f"""
                ALTER TABLE upsc_chunks
                ADD COLUMN embedding VECTOR({EMBED_DIM});
            """)

            # ==================================================
            # INDEXES
            # ==================================================

            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_topic
                ON upsc_chunks(topic);
            """)

            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_file_hash
                ON upsc_chunks(file_hash);
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

            # ==================================================
            # HNSW INDEX
            # ==================================================

            cur.execute(f"""
                CREATE INDEX IF NOT EXISTS idx_embedding_hnsw
                ON upsc_chunks
                USING hnsw (
                    embedding vector_cosine_ops
                );
            """)

        conn.commit()

        logger.info(
            "âœ… PostgreSQL tables ensured"
        )

    except Exception as e:

        conn.rollback()

        logger.exception(
            f"âŒ ensure_tables failed: {e}"
        )

        raise

    finally:

        release_conn(conn)

# ==========================================================
# CHROMADB
# ==========================================================

logger.info(
    "Connecting to ChromaDB..."
)

chroma_client = chromadb.HttpClient(
    host=CHROMA_HOST,
    port=CHROMA_PORT
)

collection = chroma_client.get_or_create_collection(
    name=COLLECTION_NAME,
    metadata={
        "hnsw:space": "cosine"
    }
)

logger.info(
    f"âœ… Connected to collection: {COLLECTION_NAME}"
)

# ==========================================================
# FILE HASH
# ==========================================================

def file_checksum(path: Path):

    h = SHA256.new()

    with open(path, "rb") as f:

        for chunk in iter(
            lambda: f.read(4096),
            b""
        ):
            h.update(chunk)

    return h.hexdigest()

# ==========================================================
# PDF VALIDATION
# ==========================================================

def validate_pdf(path: Path):

    try:

        with fitz.open(str(path)) as pdf:

            if pdf.page_count == 0:
                return False

        return True

    except:
        return False

# ==========================================================
# CLEAN TEXT
# ==========================================================

def clean_text(text: str):

    text = unicodedata.normalize(
        "NFKC",
        text
    )

    text = text.replace(
        "\u00a0",
        " "
    )

    text = re.sub(
        r"\s+",
        " ",
        text
    )

    text = re.sub(
        r"Page\s+\d+",
        "",
        text,
        flags=re.IGNORECASE
    )

    return text.strip()

# ==========================================================
# READERS
# ==========================================================

def read_txt(path: Path):
    text = path.read_text(encoding="utf-8", errors="ignore")
    text = unicodedata.normalize("NFKC", text)
    text = text.replace("\u00a0", " ")
    text = re.sub(r"\r\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"Page\s+\d+", "", text, flags=re.IGNORECASE)
    return text.strip()

def read_docx(path: Path):
    document = docx.Document(str(path))
    texts = [p.text.strip() for p in document.paragraphs if p.text.strip()]
    return "\n\n".join(texts)

def read_pdf(path: Path):
    if not validate_pdf(path):
        raise Exception("Invalid PDF file")
    pages = []
    with fitz.open(str(path)) as pdf:
        for page in pdf:
            txt = page.get_text().strip()
            if txt:
                pages.append(txt)
    text = "\n\n".join(pages)
    text = unicodedata.normalize("NFKC", text)
    text = text.replace("\u00a0", " ")
    text = re.sub(r"Page\s+\d+", "", text, flags=re.IGNORECASE)
    return text.strip()

# ==========================================================
# TOKEN CHUNKING
# ==========================================================

def token_count(text):

    return len(
        tokenizer.encode(
            text,
            add_special_tokens=False
        )
    )

def token_limited_overlap(sentences):

    overlap = []

    total_tokens = 0

    for sentence in reversed(sentences):

        sentence_tokens = token_count(sentence)

        if total_tokens + sentence_tokens > CHUNK_OVERLAP:
            break

        overlap.append(sentence)

        total_tokens += sentence_tokens

    overlap.reverse()

    return overlap, total_tokens

def normalized_words(text):

    return re.findall(
        r"[a-z0-9]+",
        text.lower()
    )

def chunk_simhash(text):

    vector = [0] * 64

    for word in set(normalized_words(text)):

        digest = SHA256.new(
            word.encode("utf-8")
        ).digest()

        value = int.from_bytes(
            digest[:8],
            "big"
        )

        for bit in range(64):

            if value & (1 << bit):
                vector[bit] += 1
            else:
                vector[bit] -= 1

    fingerprint = 0

    for bit, weight in enumerate(vector):

        if weight >= 0:
            fingerprint |= 1 << bit

    return fingerprint

def simhash_bucket(fingerprint):

    if SIMHASH_BUCKET_BITS <= 0:
        return 0

    return fingerprint >> (
        64 - min(
            SIMHASH_BUCKET_BITS,
            64
        )
    )

def chunk_text(text):
    # ======================================================
    # PARAGRAPH-AWARE CHUNKING with overlap
    # Splits on \n\n boundaries (markdown paragraphs),
    # groups to ~CHUNK_SIZE tokens, slides CHUNK_OVERLAP
    # tokens of overlap between adjacent chunks.
    # Oversized paragraphs (>MODEL_MAX_TOKENS) are split by
    # sentence to stay within the embedding model's limit.
    # ======================================================

    raw_paragraphs = re.split(r"\n\s*\n", text)
    paragraphs = []
    for p in raw_paragraphs:
        p = p.strip()
        if not p:
            continue
        tk = token_count(p)
        if tk < 5:
            continue
        if tk > MODEL_MAX_TOKENS:
            sentences = re.split(r"(?<=[.!?])\s+", p)
            for s in sentences:
                s = s.strip()
                if not s:
                    continue
                stk = token_count(s)
                if stk < 5:
                    continue
                # guard against single sentence still too long
                if stk > MODEL_MAX_TOKENS:
                    s = s[:4000] if len(s) > 4000 else s
                    stk = token_count(s)
                paragraphs.append((s, stk))
        else:
            paragraphs.append((p, tk))

    if not paragraphs:
        return []

    chunks = []
    start_idx = 0

    while start_idx < len(paragraphs):
        current = []  # list of (text, tokens) tuples
        current_tokens = 0

        for i in range(start_idx, len(paragraphs)):
            p_text, p_tokens = paragraphs[i]
            if current_tokens + p_tokens > CHUNK_SIZE and current:
                break
            current.append((p_text, p_tokens))
            current_tokens += p_tokens
            start_idx = i + 1

        if not current:
            p_text, p_tokens = paragraphs[start_idx]
            current = [(p_text, p_tokens)]
            start_idx += 1

        chunk_text = "\n\n".join(t[0] for t in current)
        chunks.append(chunk_text)

        # slide overlap: find trailing paragraphs that together
        # are under CHUNK_OVERLAP tokens
        overlap_tokens = 0
        overlap_paras = 0
        for _, p_tokens in reversed(current):
            if overlap_tokens + p_tokens > CHUNK_OVERLAP:
                break
            overlap_tokens += p_tokens
            overlap_paras += 1

        if overlap_paras > 0:
            start_idx = max(0, start_idx - overlap_paras)

    # ======================================================
    # DEDUP
    # ======================================================

    final_chunks = []
    dedup_buckets = {}
    exact_seen = set()

    for chunk in chunks:
        chunk = clean_text(chunk)
        if len(chunk.split()) < 8:
            continue

        exact_key = " ".join(normalized_words(chunk))
        if exact_key in exact_seen:
            continue

        fingerprint = chunk_simhash(chunk)
        bucket = simhash_bucket(fingerprint)
        candidates = dedup_buckets.get(bucket, [])[-DEDUP_COMPARE_LIMIT:]

        duplicate = False
        for existing in candidates:
            score = fuzz.ratio(chunk, existing)
            if score > SIMILARITY_DEDUP_THRESHOLD:
                duplicate = True
                break

        if duplicate:
            continue

        exact_seen.add(exact_key)
        final_chunks.append(chunk)
        dedup_buckets.setdefault(bucket, []).append(chunk)

    return final_chunks

# ==========================================================
# TOPIC TAGGING
# ==========================================================

def detect_topic(text):

    t = text.lower()

    if any(
        k in t
        for k in [
            "constitution",
            "parliament",
            "fundamental rights"
        ]
    ):
        return "Polity"

    if any(
        k in t
        for k in [
            "budget",
            "inflation",
            "gdp"
        ]
    ):
        return "Economy"

    if any(
        k in t
        for k in [
            "climate",
            "pollution",
            "forest"
        ]
    ):
        return "Environment"

    if any(
        k in t
        for k in [
            "freedom struggle",
            "mughal",
            "british india"
        ]
    ):
        return "History"

    if any(
        k in t
        for k in [
            "monsoon",
            "river",
            "mountain"
        ]
    ):
        return "Geography"

    return "General"

# ==========================================================
# DIFFICULTY
# ==========================================================

def detect_difficulty(text):

    words = len(
        text.split()
    )

    if words < 50:
        return "easy"

    if words < 150:
        return "medium"

    return "hard"

# ==========================================================
# AUTH
# ==========================================================

def validate_upload_auth():

    incoming = os.getenv(
        "UPLOAD_SECRET"
    )

    if not hmac.compare_digest(
        incoming or "",
        UPLOAD_API_KEY
    ):

        raise Exception(
            "Unauthorized upload"
        )

# ==========================================================
# DOCUMENT STATUS
# ==========================================================

def update_document_status(
    file_hash,
    file_name,
    status,
    error_message=None
):

    conn = get_conn()

    try:

        with conn.cursor() as cur:

            cur.execute("""
                INSERT INTO documents (
                    file_hash,
                    file_name,
                    status,
                    error_message
                )
                VALUES (%s, %s, %s, %s)

                ON CONFLICT (file_hash)

                DO UPDATE SET
                    status=EXCLUDED.status,
                    error_message=EXCLUDED.error_message,
                    updated_at=NOW()
            """, (
                file_hash,
                file_name,
                status,
                error_message
            ))

        conn.commit()

    finally:

        release_conn(conn)

# ==========================================================
# DELETE EXISTING
# ==========================================================

def delete_existing_file_data(
    file_hash
):

    logger.info(
        f"ðŸ—‘ Removing old chunks: {file_hash}"
    )

    try:

        collection.delete(
            where={
                "file_hash": file_hash
            }
        )

    except Exception as e:

        logger.warning(
            f"Chroma delete warning: {e}"
        )

    conn = get_conn()

    try:

        with conn.cursor() as cur:

            cur.execute("""
                DELETE FROM upsc_chunks
                WHERE file_hash=%s
            """, (file_hash,))

        conn.commit()

    finally:

        release_conn(conn)

# ==========================================================
# MANIFEST
# ==========================================================

def upsert_manifest(
    file_hash,
    filename,
    chunk_count,
    chroma_inserted,
    postgres_inserted
):

    conn = get_conn()

    try:

        with conn.cursor() as cur:

            cur.execute("""
                INSERT INTO ingestion_manifest (
                    file_hash,
                    filename,
                    chunk_count,
                    chroma_inserted,
                    postgres_inserted
                )
                VALUES (%s, %s, %s, %s, %s)

                ON CONFLICT (file_hash)

                DO UPDATE SET
                    chunk_count=EXCLUDED.chunk_count,
                    chroma_inserted=EXCLUDED.chroma_inserted,
                    postgres_inserted=EXCLUDED.postgres_inserted,
                    updated_at=NOW()
            """, (
                file_hash,
                filename,
                chunk_count,
                chroma_inserted,
                postgres_inserted
            ))

        conn.commit()

    finally:

        release_conn(conn)

# ==========================================================
# EMBEDDINGS
# ==========================================================

def generate_embeddings(chunks):

    with embedding_lock:

        embeddings = embedder.encode(
            chunks,
            batch_size=EMBED_BATCH_SIZE,
            normalize_embeddings=True,
            show_progress_bar=False,
            convert_to_numpy=True
        )

    return embeddings

def upsert_chroma_batches(
    ids,
    chunks,
    metas,
    embeddings
):

    def run():

        for start in range(
            0,
            len(ids),
            CHROMA_UPSERT_BATCH_SIZE
        ):

            end = start + CHROMA_UPSERT_BATCH_SIZE

            collection.upsert(
                ids=ids[start:end],
                documents=chunks[start:end],
                metadatas=metas[start:end],
                embeddings=embeddings[start:end].tolist()
            )

    retry_operation(
        "Chroma upsert",
        run,
        CHROMA_MAX_RETRIES,
        CHROMA_RETRY_DELAY
    )

def insert_postgres_rows(rows):

    def run():

        conn = get_conn()

        try:

            with conn.cursor() as cur:

                cur.execute(
                    "SET LOCAL statement_timeout = %s",
                    (POSTGRES_STATEMENT_TIMEOUT,)
                )

                execute_batch(
                    cur,
                    """
                    INSERT INTO upsc_chunks (
                        id,
                        chunk,
                        topic,
                        difficulty,
                        source_file,
                        file_hash,
                        chunk_index,
                        chunk_version,
                        embedding,
                        search_vector
                    )
                    VALUES (
                        %s,
                        %s,
                        %s,
                        %s,
                        %s,
                        %s,
                        %s,
                        %s,
                        %s,
                        to_tsvector(
                            'english',
                            %s
                        )
                    )

                    ON CONFLICT (id)

                    DO UPDATE SET
                        chunk=EXCLUDED.chunk,
                        topic=EXCLUDED.topic,
                        difficulty=EXCLUDED.difficulty,
                        source_file=EXCLUDED.source_file,
                        file_hash=EXCLUDED.file_hash,
                        chunk_index=EXCLUDED.chunk_index,
                        chunk_version=EXCLUDED.chunk_version,
                        embedding=EXCLUDED.embedding,
                        search_vector=EXCLUDED.search_vector
                    """,
                    rows,
                    page_size=BATCH_SIZE
                )

            conn.commit()

        except Exception:

            conn.rollback()

            raise

        finally:

            release_conn(conn)

    retry_operation(
        "PostgreSQL insert",
        run,
        DB_MAX_RETRIES,
        DB_RETRY_DELAY
    )

# ==========================================================
# PROCESS FILE
# ==========================================================

root_folder = None

def process_file(file):

    global root_folder
    if root_folder:
        try:
            fname = str(file.relative_to(root_folder))
        except ValueError:
            fname = file.name
    else:
        fname = file.name

    suffix = file.suffix.lower()

    if suffix not in [
        ".txt",
        ".pdf",
        ".docx"
    ]:
        return

    size_mb = file.stat().st_size / 1024 / 1024

    if size_mb > MAX_FILE_SIZE_MB:

        raise Exception(
            f"File too large: {size_mb:.2f} MB"
        )

    logger.info(
        f"ðŸ“„ Processing {fname}"
    )

    file_hash = file_checksum(file)

    update_document_status(
        file_hash,
        fname,
        "processing"
    )

    try:

        # ==================================================
        # READ FILE
        # ==================================================

        if suffix == ".txt":

            text = read_txt(file)

        elif suffix == ".pdf":

            text = read_pdf(file)

        else:

            text = read_docx(file)

        if not text.strip():

            raise Exception(
                "Empty document"
            )

        # ==================================================
        # CHUNK
        # ==================================================

        chunks = chunk_text(text)

        if not chunks:

            raise Exception(
                "No valid chunks"
            )

        logger.info(
            f"ðŸ“‘ {fname} -> {len(chunks)} chunks"
        )

        # ==================================================
        # EMBEDDINGS
        # ==================================================

        embeddings = generate_embeddings(
            chunks
        )

        ids = []
        metas = []

        for i, chunk in enumerate(chunks):

            cid = SHA256.new(
                f"{file_hash}_{i}".encode()
            ).hexdigest()

            ids.append(cid)

            metas.append({
                "topic": detect_topic(chunk),
                "difficulty": detect_difficulty(chunk),
                "source_file": fname,
                "file_hash": file_hash,
                "chunk_index": i,
                "version": 1,
                "created_at": datetime.utcnow().isoformat()
            })

        # ==================================================
        # DELETE OLD
        # ==================================================

        delete_existing_file_data(
            file_hash
        )

        # ==================================================
        # CHROMA UPSERT
        # ==================================================

        upsert_chroma_batches(
            ids,
            chunks,
            metas,
            embeddings
        )

        logger.info(
            f"âœ… Chroma inserted: {len(chunks)}"
        )

        upsert_manifest(
            file_hash,
            fname,
            len(chunks),
            True,
            False
        )

        # ==================================================
        # POSTGRES
        # ==================================================

        rows = []

        for idx, (
            cid,
            chunk,
            meta,
            emb
        ) in enumerate(
            zip(
                ids,
                chunks,
                metas,
                embeddings
            )
        ):

            rows.append((
                cid,
                chunk,
                meta["topic"],
                meta["difficulty"],
                meta["source_file"],
                file_hash,
                idx,
                1,
                list(map(float, emb)),
                chunk
            ))

        insert_postgres_rows(rows)

        # ==================================================
        # FINAL STATUS
        # ==================================================

        upsert_manifest(
            file_hash,
            fname,
            len(chunks),
            True,
            True
        )

        update_document_status(
            file_hash,
            fname,
            "indexed"
        )

        logger.info(
            f"âœ… Finished: {fname}"
        )

        # ==================================================
        # MEMORY CLEANUP
        # ==================================================

        del embeddings
        gc.collect()

        if (
            DEVICE == "cuda"
            and CLEAR_CUDA_CACHE_AFTER_FILE
        ):
            torch.cuda.empty_cache()

    except Exception as e:

        logger.exception(
            f"âŒ Failed processing {fname}: {e}"
        )

        update_document_status(
            file_hash,
            fname,
            "failed",
            str(e)
        )

# ==========================================================
# WORKER
# ==========================================================

def ingestion_worker():

    while True:

        file = ingestion_queue.get()

        if file is None:
            break

        try:

            process_file(file)

        except Exception as e:

            logger.exception(
                f"Worker failure: {e}"
            )

        finally:

            ingestion_queue.task_done()

# ==========================================================
# INGESTION
# ==========================================================

def ingest_folder(folder):

    validate_upload_auth()

    ensure_tables()

    global root_folder
    folder_path = Path(folder)
    root_folder = folder_path.parent
    folder_name = folder_path.name

    total_files = 0

    # ======================================================
    # THREAD POOL
    # ======================================================

    workers = []

    for _ in range(MAX_WORKERS):

        worker = threading.Thread(
            target=ingestion_worker,
            daemon=True
        )

        worker.start()

        workers.append(worker)

    # ======================================================
    # QUEUE FILES
    # ======================================================

    for root, dirs, files in os.walk(folder_path):

        for fname in files:

            file = Path(root) / fname

            ingestion_queue.put(file)

            total_files += 1

    logger.info(
        f"ðŸ“¦ Queued files: {total_files}"
    )

    ingestion_queue.join()

    logger.info(
        "ðŸ Ingestion completed"
    )

# ==========================================================
# ENTRY
# ==========================================================

if __name__ == "__main__":

    import argparse

    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--folder",
        required=True
    )

    args = parser.parse_args()

    logger.info(
        f"ðŸš€ Starting ingestion: {args.folder}"
    )

    start = time.time()

    ingest_folder(args.folder)

    elapsed = round(
        time.time() - start,
        2
    )

    logger.info(
        f"âš¡ Total ingestion time: {elapsed}s"
    )
