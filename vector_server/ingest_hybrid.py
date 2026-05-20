# ingest_hybrid.py
# Production-ready hybrid ingestion pipeline
# REST-only Chroma v2 implementation

import os
import re
import logging
import unicodedata
from pathlib import Path

import docx
import fitz
import psycopg2
import requests

from Crypto.Hash import SHA256
from psycopg2.pool import SimpleConnectionPool
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
    "EMBED_MODEL",
    "all-MiniLM-L6-v2"
)

EMBED_DIM = int(os.getenv("EMBED_DIM", "384"))

PG_DB = os.getenv("DB_NAME", "aryabhata_db")
PG_USER = os.getenv("DB_USER", "aryabhata_user")
PG_PASS = os.getenv("DB_PASSWORD", "Password123")
PG_HOST = os.getenv("DB_HOST", "postgres")
PG_PORT = os.getenv("DB_PORT", "5432")

CHUNK_SIZE = int(os.getenv("CHUNK_SIZE", "500"))
CHUNK_OVERLAP = int(os.getenv("CHUNK_OVERLAP", "80"))

# --------------------------------------------------
# Embedding model
# --------------------------------------------------

logging.info(f"Loading embedding model: {EMBED_MODEL}")

embedder = SentenceTransformer(EMBED_MODEL)

# --------------------------------------------------
# PostgreSQL Pool
# --------------------------------------------------

pg_pool = SimpleConnectionPool(
    minconn=1,
    maxconn=5,
    dbname=PG_DB,
    user=PG_USER,
    password=PG_PASS,
    host=PG_HOST,
    port=PG_PORT
)

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
# PostgreSQL Helpers
# --------------------------------------------------

def get_conn():
    return pg_pool.getconn()

def release_conn(conn):
    pg_pool.putconn(conn)

def ensure_tables():

    conn = get_conn()

    try:

        with conn.cursor() as cur:

            cur.execute(
                "CREATE EXTENSION IF NOT EXISTS vector;"
            )

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
                CREATE INDEX IF NOT EXISTS idx_file_hash
                ON upsc_chunks(file_hash);
            """)

        conn.commit()

        logging.info(
            "✅ PostgreSQL tables ensured"
        )

    finally:
        release_conn(conn)

# --------------------------------------------------
# Chroma Helpers
# --------------------------------------------------

def ensure_collection(name: str):

    resp = session.get(
        f"{CHROMA_BASE}/collections",
        timeout=30
    )

    if resp.status_code != 200:

        logging.error(
            f"❌ Failed fetching collections: {resp.text}"
        )

        return False

    data = resp.json()

    collections = (
        data if isinstance(data, list)
        else data.get("collections", [])
    )

    names = [c["name"] for c in collections]

    if name in names:

        logging.info(
            f"✅ Collection exists: {name}"
        )

        return True

    payload = {
        "name": name
    }

    r = session.post(
        f"{CHROMA_BASE}/collections",
        json=payload,
        timeout=30
    )

    if r.status_code in [200, 201]:

        logging.info(
            f"✅ Created collection: {name}"
        )

        return True

    logging.error(
        f"❌ Failed creating collection: {r.text}"
    )

    return False

def get_collection_id(name: str):

    resp = session.get(
        f"{CHROMA_BASE}/collections",
        timeout=30
    )

    if resp.status_code != 200:

        logging.error(
            f"❌ Failed reading collections: {resp.text}"
        )

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

def insert_batch(
    collection_id,
    ids,
    chunks,
    metadatas,
    embeddings
):

    embeddings = [
        [float(x) for x in emb.tolist()]
        if hasattr(emb, "tolist")
        else [float(x) for x in emb]
        for emb in embeddings
    ]

    payload = {
        "ids": ids,
        "documents": chunks,
        "metadatas": metadatas,
        "embeddings": embeddings
    }

    resp = session.post(
        f"{CHROMA_BASE}/collections/{collection_id}/upsert",
        json=payload,
        timeout=120
    )

    logging.info(
        f"Chroma response: "
        f"{resp.status_code} {resp.text}"
    )

    if resp.status_code in [200, 201]:

        logging.info(
            f"✅ Inserted batch ({len(ids)} chunks)"
        )

        return True

    logging.error(
        f"❌ Batch insert failed: "
        f"{resp.status_code} {resp.text}"
    )

    return False

# --------------------------------------------------
# File Helpers
# --------------------------------------------------

def file_checksum(path: Path):

    h = SHA256.new()

    with open(path, "rb") as f:

        for chunk in iter(
            lambda: f.read(4096),
            b""
        ):
            h.update(chunk)

    return h.hexdigest()

def clean_text(text: str):

    text = unicodedata.normalize(
        "NFKC",
        text
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

    text = re.sub(
        r"Cooking time for.*?$",
        "",
        text,
        flags=re.IGNORECASE
    )

    return text.strip()

def read_txt(path: Path):

    text = path.read_text(
        encoding="utf-8",
        errors="ignore"
    )

    return clean_text(text)

def read_docx(path: Path):

    document = docx.Document(str(path))

    text = "\n".join(
        p.text
        for p in document.paragraphs
        if p.text.strip()
    )

    return clean_text(text)

def read_pdf(path: Path):

    pages = []

    with fitz.open(str(path)) as pdf:

        for page in pdf:

            txt = page.get_text().strip()

            if txt:
                pages.append(txt)

    text = "\n".join(pages)

    return clean_text(text)

# --------------------------------------------------
# Chunking
# --------------------------------------------------

def chunk_text(
    text,
    max_len=CHUNK_SIZE,
    overlap=CHUNK_OVERLAP
):

    sentences = re.split(
        r"(?<=[.!?])\s+",
        text
    )

    chunks = []

    current_chunk = ""
    previous_tail = ""

    for sentence in sentences:

        sentence = sentence.strip()

        if not sentence:
            continue

        sentence = unicodedata.normalize(
            "NFKC",
            sentence
        )

        if len(sentence) < 15:
            continue

        if len(current_chunk) + len(sentence) <= max_len:

            current_chunk += " " + sentence

        else:

            cleaned = current_chunk.strip()

            if len(cleaned) > 40:

                chunks.append(cleaned)

                previous_tail = cleaned[-overlap:]

            current_chunk = (
                previous_tail + " " + sentence
            )

    if len(current_chunk.strip()) > 40:

        chunks.append(current_chunk.strip())

    cleaned_chunks = []

    seen = set()

    for chunk in chunks:

        chunk = clean_text(chunk)

        if chunk in seen:
            continue

        if len(chunk.split()) < 8:
            continue

        seen.add(chunk)

        cleaned_chunks.append(chunk)

    return cleaned_chunks

# --------------------------------------------------
# Metadata
# --------------------------------------------------

def detect_topic(text):

    t = text.lower()

    if "constitution" in t:
        return "Polity"

    if "budget" in t:
        return "Economy"

    if "monsoon" in t:
        return "Geography"

    if "freedom" in t:
        return "History"

    if "climate" in t:
        return "Environment"

    return "General"

def detect_difficulty(text):

    words = len(text.split())

    if words < 50:
        return "easy"

    if words < 150:
        return "medium"

    return "hard"

# --------------------------------------------------
# Ingestion
# --------------------------------------------------

def ingest_folder(folder):

    ensure_tables()

    if not ensure_collection(COLLECTION_NAME):
        return

    collection_id = get_collection_id(
        COLLECTION_NAME
    )

    if not collection_id:

        logging.error(
            "❌ Collection ID not found"
        )

        return

    folder_path = Path(folder)

    ingested_files = 0
    skipped_files = 0
    unsupported_files = 0
    total_chunks = 0

    ext_counts = {
        "txt": 0,
        "docx": 0,
        "pdf": 0
    }

    for root, dirs, files in os.walk(folder_path):

        rel_root = Path(root).relative_to(
            folder_path
        )

        logging.info(
            f"📂 Entering folder: "
            f"{rel_root if rel_root != Path('.') else '/'}"
        )

        for fname in files:

            file = Path(root) / fname

            if not file.is_file():
                continue

            try:

                file_hash = file_checksum(file)

                conn = get_conn()

                try:

                    with conn.cursor() as cur:

                        cur.execute(
                            """
                            SELECT 1
                            FROM upsc_chunks
                            WHERE file_hash=%s
                            LIMIT 1
                            """,
                            (file_hash,)
                        )

                        if cur.fetchone():

                            skipped_files += 1

                            logging.info(
                                f"⏭ Skipping duplicate: {fname}"
                            )

                            continue

                finally:
                    release_conn(conn)

                try:

                    suffix = file.suffix.lower()

                    if suffix == ".txt":

                        text = read_txt(file)
                        ext_counts["txt"] += 1

                    elif suffix == ".docx":

                        text = read_docx(file)
                        ext_counts["docx"] += 1

                    elif suffix == ".pdf":

                        text = read_pdf(file)
                        ext_counts["pdf"] += 1

                    else:

                        unsupported_files += 1
                        continue

                except Exception as e:

                    logging.exception(
                        f"❌ Failed reading {file}: {e}"
                    )

                    skipped_files += 1
                    continue

                if not text.strip():

                    skipped_files += 1
                    continue

                chunks = chunk_text(text)

                if not chunks:

                    skipped_files += 1
                    continue

                logging.info(
                    f"📑 File {fname} produced "
                    f"{len(chunks)} clean chunks"
                )

                embeddings = embedder.encode(
                    chunks,
                    show_progress_bar=False,
                    normalize_embeddings=True
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
                        "source_file": fname
                    })

                ok = insert_batch(
                    collection_id,
                    ids,
                    chunks,
                    metas,
                    embeddings
                )

                if not ok:

                    skipped_files += 1

                    logging.error(
                        f"❌ Failed inserting file: {fname}"
                    )

                    continue

                conn = get_conn()

                try:

                    with conn.cursor() as cur:

                        for cid, chunk, meta, emb in zip(
                            ids,
                            chunks,
                            metas,
                            embeddings
                        ):

                            cur.execute(
                                """
                                INSERT INTO upsc_chunks
                                (
                                    id,
                                    chunk,
                                    topic,
                                    difficulty,
                                    embedding,
                                    file_hash
                                )
                                VALUES
                                (%s, %s, %s, %s, %s, %s)
                                ON CONFLICT DO NOTHING
                                """,
                                (
                                    cid,
                                    chunk,
                                    meta["topic"],
                                    meta["difficulty"],
                                    emb.tolist(),
                                    file_hash
                                )
                            )

                    conn.commit()

                finally:
                    release_conn(conn)

                total_chunks += len(chunks)
                ingested_files += 1

                logging.info(
                    f"✅ Finished file: {fname}"
                )

            except Exception as e:

                logging.exception(
                    f"❌ Failed processing {fname}: {e}"
                )

                skipped_files += 1

    logging.info("🏁 Ingestion complete.")

    logging.info(
        f"📊 Summary: "
        f"Ingested={ingested_files}, "
        f"Skipped={skipped_files}, "
        f"Unsupported={unsupported_files}, "
        f"Total chunks={total_chunks}"
    )

    logging.info(
        f"📑 Extension breakdown: "
        f"DOCX={ext_counts['docx']}, "
        f"PDF={ext_counts['pdf']}, "
        f"TXT={ext_counts['txt']}"
    )

# --------------------------------------------------
# Entry
# --------------------------------------------------

if __name__ == "__main__":

    import argparse

    parser = argparse.ArgumentParser(
        description="Bulk UPSC Notes Ingestion"
    )

    parser.add_argument(
        "--folder",
        required=True,
        help="Path to TXT/PDF/DOCX files"
    )

    args = parser.parse_args()

    logging.info(
        f"🏁 Starting ingestion for folder={args.folder}"
    )

    ingest_folder(args.folder)