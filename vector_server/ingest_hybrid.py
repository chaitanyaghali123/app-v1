# ingest_hybrid.py
# Bulk ingestion without subject classification or citations

import os, re, time, unicodedata, logging
from pathlib import Path
import psycopg2, docx, fitz, requests
from sentence_transformers import SentenceTransformer
from Crypto.Hash import SHA256

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

# -----------------------------
# Config
# -----------------------------
CHROMA_BASE = os.getenv(
    "VECTOR_API",
    "http://chromadb:8000/api/v2/tenants/default_tenant/databases/default_database"
)
COLLECTION_NAME = os.getenv("CHROMA_COLLECTION", "upsc_chunks_v2")

EMBED_MODEL = os.getenv("EMBED_MODEL", "all-MiniLM-L6-v2")
EMBED_DIM = int(os.getenv("EMBED_DIM", "384"))

PG_DB = os.getenv("POSTGRESDB", "aryabhata_db")
PG_USER = os.getenv("POSTGRESUSER", "aryabhata_user")
PG_PASS = os.getenv("POSTGRES_PASSWORD", "Password123")
PG_HOST = os.getenv("POSTGRES_HOST", "postgres")
PG_PORT = os.getenv("POSTGRES_PORT", "5432")

embedder = SentenceTransformer(EMBED_MODEL)
conn = psycopg2.connect(
    dbname=PG_DB, user=PG_USER, password=PG_PASS,
    host=PG_HOST, port=PG_PORT
)
conn.autocommit = True
session = requests.Session()

# -----------------------------
# Helpers
# -----------------------------
def ensure_tables():
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



def insert_chunk(collection_id, chunk_id, chunk, metadata, embedding):
    embedding = [float(x) for x in embedding]
    payload = {
        "documents": [chunk],
        "metadatas": [metadata],
        "ids": [chunk_id],
        "embeddings": [embedding]
    }
    resp = session.post(f"{CHROMA_BASE}/collections/{collection_id}/add", json=payload)
    logging.info(f"Chroma insert {chunk_id}: {resp.status_code} {resp.text}")
    return resp.status_code in [200, 201]

def file_checksum(path: Path):
    h = SHA256.new()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(4096), b""):
            h.update(chunk)
    return h.hexdigest()

def read_txt(path): return path.read_text(encoding="utf-8", errors="ignore")
def read_docx(path): return "\n".join(p.text for p in docx.Document(str(path)).paragraphs)
def read_pdf(path): return "".join(page.get_text() for page in fitz.open(str(path)))

def chunk_text(text, max_len=500):
    sentences = re.split(r"(?<=[.!?])\s+", text)
    chunks, cur = [], ""
    for s in sentences:
        s = unicodedata.normalize("NFKC", s)
        if len(cur) + len(s) < max_len:
            cur += " " + s
        else:
            if len(cur) > 50:
                chunks.append(cur.strip())
            cur = s
    if len(cur) > 50:
        chunks.append(cur.strip())
    return chunks

def detect_topic(t):
    t = t.lower()
    if "constitution" in t: return "Polity"
    if "budget" in t: return "Economy"
    if "monsoon" in t: return "Geography"
    if "freedom" in t: return "History"
    if "climate" in t: return "Environment"
    return "General"

def detect_difficulty(t):
    w = len(t.split())
    if w < 50: return "easy"
    if w < 150: return "medium"
    return "hard"

# -----------------------------
# Ingestion
# -----------------------------
def ingest_folder(folder):
    ensure_tables()
    ensure_collection(COLLECTION_NAME)
    col_id = get_collection_id(COLLECTION_NAME)
    if not col_id:
        logging.error("❌ ChromaDB collection not found")
        return

    folder_path = Path(folder)
    ingested_files = skipped_files = unsupported_files = total_chunks = 0
    ext_counts = {"txt": 0, "docx": 0, "pdf": 0}

    for root, dirs, files in os.walk(folder_path):
        rel_root = Path(root).relative_to(folder_path)
        logging.info(f"📂 Entering folder: {rel_root if rel_root != Path('.') else '/'}")

        for fname in files:
            file = Path(root) / fname
            if not file.is_file():
                continue

            file_hash = file_checksum(file)
            with conn.cursor() as cur:
                cur.execute("SELECT 1 FROM upsc_chunks WHERE file_hash=%s LIMIT 1", (file_hash,))
                if cur.fetchone():
                    skipped_files += 1
                    continue

            if file.suffix.lower() == ".txt":
                text = read_txt(file); ext_counts["txt"] += 1
            elif file.suffix.lower() == ".docx":
                text = read_docx(file); ext_counts["docx"] += 1
            elif file.suffix.lower() == ".pdf":
                text = read_pdf(file); ext_counts["pdf"] += 1
            else:
                unsupported_files += 1
                continue

            if not text.strip():
                skipped_files += 1
                continue

            chunks = chunk_text(text)
            embeddings = embedder.encode(chunks, show_progress_bar=False)
            now = int(time.time())

            for i, (chunk, emb) in enumerate(zip(chunks, embeddings)):
                emb = emb.tolist()
                cid = f"{fname}_{now}_{i}"
                meta = {
                    "topic": detect_topic(chunk),
                    "difficulty": detect_difficulty(chunk)
                }

                insert_chunk(col_id, cid, chunk, meta, emb)
                with conn.cursor() as cur:
                    cur.execute(
                        """INSERT INTO upsc_chunks (id, chunk, topic, difficulty, embedding, file_hash)
                           VALUES (%s, %s, %s, %s, %s, %s) ON CONFLICT DO NOTHING""",
                        (cid, chunk, meta["topic"], meta["difficulty"], emb, file_hash)
                    )
                total_chunks += 1
            ingested_files += 1

    logging.info("🏁 Ingestion complete.")
    logging.info(f"📊 Summary: Ingested={ingested_files}, Skipped={skipped_files}, Unsupported={unsupported_files}, Total chunks={total_chunks}")
    logging.info(f"📑 Extension breakdown: DOCX={ext_counts['docx']}, PDF={ext_counts['pdf']}, TXT={ext_counts['txt']}")

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Bulk UPSC notes ingestion")
    parser.add_argument("--folder", required=True, help="Path to folder with TXT/PDF/DOCX files")
    args = parser.parse_args()
    logging.info(f"🏁 Starting ingestion for folder={args.folder}")
    ingest_folder(args.folder)