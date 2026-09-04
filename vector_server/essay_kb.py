# essay_kb.py
# ==========================================================
# UPSC Mains Essay Paper structured knowledge base.
#
# Copyright-safe + public-domain sources only:
#   - Curated public-domain quotes (authors/attribution only).
#   - Short encyclopedic summaries of historical events/ideas.
#   - Public-domain philosophy (Project Gutenberg / SEP / IEP).
#   - Official Government of India publications (public domain).
#
# Unlike gs4_ethics_kb, this table carries a `content_type` so a
# single store can hold four retrieval layers used when drafting an
# essay:
#   QUOTE       -> hooks + introductions + conclusions
#   ANECDOTE    -> historical evidence for body paragraphs
#   FRAMEWORK   -> essay structuring rules (how to write)
#   SOURCE      -> pointer to an external reference (no text/embed)
#
# Embeddings are OPT-IN via embed=True. The default (embed=False)
# stores structured content + its text WITHOUT any API call, so the
# corpus can be seeded safely while the embed quota is exhausted and
# vectorised later in one batch pass (see backfill_embeds).
# ==========================================================

import os
import re
import json
import logging
import threading

import psycopg2
import psycopg2.extras

logger = logging.getLogger(__name__)

EMBED_DIM = int(os.getenv("EMBED_DIM", "1536"))
EMBED_MODEL = os.getenv("EMBED_MODEL", "gemini-embedding-001")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_EMBED_URL = (
    "https://generativelanguage.googleapis.com/v1beta/"
    f"models/{EMBED_MODEL}:batchEmbedContents"
)

TABLE = "essay_knowledge_base"

CONTENT_TYPES = ("QUOTE", "ANECDOTE", "FRAMEWORK", "SOURCE")

lock = threading.Lock()


def pg_conf():
    return {
        "dbname": os.getenv("DB_NAME", "aryabhata_db"),
        "user": os.getenv("DB_USER", "aryabhata_user"),
        "password": os.getenv("DB_PASSWORD", "Password123"),
        "host": os.getenv("DB_HOST", "postgres"),
        "port": int(os.getenv("DB_PORT", "5432")),
    }


def get_conn():
    return psycopg2.connect(**pg_conf())


# ==========================================================
# SCHEMA
# ==========================================================

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS essay_knowledge_base (
    id BIGSERIAL PRIMARY KEY,
    content_type VARCHAR(20) NOT NULL,
    theme VARCHAR(80) NOT NULL DEFAULT 'general',
    title VARCHAR(255) NOT NULL,
    content_text TEXT,
    author VARCHAR(120) DEFAULT '',
    source_origin VARCHAR(120) DEFAULT '',
    source_url TEXT,
    tags TEXT[] DEFAULT '{}',
    embedding HALFVEC(%(dim)s),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE (content_type, theme, title)
);

CREATE INDEX IF NOT EXISTS idx_essay_kb_type
    ON essay_knowledge_base (content_type, theme);

CREATE INDEX IF NOT EXISTS idx_essay_kb_tags
    ON essay_knowledge_base USING GIN (tags);

CREATE INDEX IF NOT EXISTS idx_essay_kb_search
    ON essay_knowledge_base USING GIN (
        to_tsvector('english', coalesce(content_text, '') || ' ' || title)
    );

CREATE INDEX IF NOT EXISTS idx_essay_kb_embedding
    ON essay_knowledge_base
    USING hnsw (embedding halfvec_cosine_ops);
"""


def ensure_table():
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("CREATE EXTENSION IF NOT EXISTS vector;")
            cur.execute(SCHEMA_SQL, {"dim": EMBED_DIM})
        conn.commit()
        logger.info("essay_knowledge_base ensured")
    except Exception as exc:
        conn.rollback()
        logger.exception(f"ensure essay kb failed: {exc}")
        raise
    finally:
        conn.close()


# ==========================================================
# EMBEDDING (optional; no API call unless embed=True)
# ==========================================================

def _embed_texts(texts):
    import requests

    payload = {
        "requests": [
            {
                "model": f"models/{EMBED_MODEL}",
                "content": {"parts": [{"text": t}]},
                "taskType": "RETRIEVAL_DOCUMENT",
                "outputDimensionality": EMBED_DIM,
            }
            for t in texts
        ]
    }
    resp = requests.post(
        f"{GEMINI_EMBED_URL}?key={GEMINI_API_KEY}",
        json=payload,
        timeout=90,
    )
    if resp.status_code == 429:
        raise RuntimeError("Gemini embed 429 (quota exceeded)")
    resp.raise_for_status()
    data = resp.json()
    return [e["values"] for e in data["embeddings"]]


def _pgvector_literal(embedding):
    return "[" + ",".join(str(float(v)) for v in embedding) + "]"


# ==========================================================
# UPSERT
# ==========================================================

def upsert_entry(
    content_type,
    theme,
    title,
    content_text,
    author="",
    source_origin="",
    source_url=None,
    tags=None,
    embed=False,
):
    """Upsert one essay KB entry.

    embed=False (default) stores the entry WITHOUT calling the embed
    API. Set embed=True only when quota/billing allows vectorisation.
    """
    if content_type not in CONTENT_TYPES:
        content_type = "SOURCE"

    with lock:
        conn = get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT id FROM %s
                    WHERE content_type = %%s AND theme = %%s AND title = %%s
                    """ % TABLE,
                    (content_type, theme, title),
                )
                row = cur.fetchone()

                embed_literal = None
                if embed and content_text:
                    try:
                        emb = _embed_texts([content_text[:4000]])[0]
                        embed_literal = _pgvector_literal(emb)
                    except Exception as exc:
                        logger.warning(
                            f"Embedding skipped for '{content_type}:{title}': {exc}"
                        )

                if row:
                    if embed_literal is not None:
                        cur.execute(
                            """
                            UPDATE %s
                            SET content_text = %%s,
                                author = %%s,
                                source_origin = %%s,
                                source_url = %%s,
                                tags = %%s,
                                embedding = %%s::halfvec,
                                updated_at = NOW()
                            WHERE id = %%s
                            """ % TABLE,
                            (
                                content_text,
                                author,
                                source_origin,
                                source_url,
                                tags or [],
                                embed_literal,
                                row[0],
                            ),
                        )
                    else:
                        cur.execute(
                            """
                            UPDATE %s
                            SET content_text = %%s,
                                author = %%s,
                                source_origin = %%s,
                                source_url = %%s,
                                tags = %%s,
                                updated_at = NOW()
                            WHERE id = %%s
                            """ % TABLE,
                            (
                                content_text,
                                author,
                                source_origin,
                                source_url,
                                tags or [],
                                row[0],
                            ),
                        )
                else:
                    cols = (
                        "content_type, theme, title, content_text, author, "
                        "source_origin, source_url, tags"
                    )
                    ph = "%s, %s, %s, %s, %s, %s, %s, %s"
                    data = (
                        content_type,
                        theme,
                        title,
                        content_text,
                        author,
                        source_origin,
                        source_url,
                        tags or [],
                    )
                    if embed_literal is not None:
                        cols += ", embedding"
                        ph += ", %s::halfvec"
                        data = data + (embed_literal,)
                    cur.execute(
                        f"INSERT INTO {TABLE} ({cols}) VALUES ({ph})",
                        data,
                    )
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()


# ==========================================================
# BACKFILL EMBEDDINGS (batch, resumable, quota-aware)
# ==========================================================

def backfill_embeds(limit=500):
    """Embed QUOTE/ANECDOTE/FRAMEWORK rows whose embedding IS NULL.

    Returns (attempted, completed). Call repeatedly (e.g. via
    run_essay_backfill.py) until 0 remain; stops on quota.
    """
    conn = get_conn()
    rows = None
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, content_text FROM %s
                WHERE content_type <> 'SOURCE'
                  AND content_text IS NOT NULL
                  AND embedding IS NULL
                LIMIT %%s
                """ % TABLE,
                (limit,),
            )
            rows = cur.fetchall()
        conn.commit()
    finally:
        conn.close()

    if not rows:
        return (0, 0)

    completed = 0
    for i in range(0, len(rows), 20):
        inner = rows[i : i + 20]
        ids = [r[0] for r in inner]
        texts = [r[1] for r in inner]
        try:
            embs = _embed_texts(texts)
        except Exception as exc:
            logger.warning(f"Essay backfill stopped at {i}: {exc}")
            return (len(rows), completed)

        conn = get_conn()
        try:
            with conn.cursor() as cur:
                for cid, emb in zip(ids, embs):
                    cur.execute(
                        """
                        UPDATE %s
                        SET embedding = %%s::halfvec
                        WHERE id = %%s
                        """ % TABLE,
                        (_pgvector_literal(emb), cid),
                    )
            conn.commit()
        finally:
            conn.close()
        completed += len(ids)

    return (len(rows), completed)


def count_unembedded():
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT count(*) FROM %s
                WHERE content_type <> 'SOURCE'
                  AND content_text IS NOT NULL
                  AND embedding IS NULL
                """ % TABLE,
            )
            return cur.fetchone()[0]
    finally:
        conn.close()


# ==========================================================
# SEARCH
# ==========================================================

def search(
    query_embedding=None,
    content_type=None,
    theme=None,
    limit=10,
    min_score=0.0,
):
    """Keyword/BM25 search over essay_knowledge_base.

    A query_embedding (list) makes it a hybrid vector+text search;
    otherwise it returns text matches only (no API embed needed here;
    caller provides the embedding).
    """
    conn = get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            params = []
            where = []
            if content_type:
                where.append("content_type = %s")
                params.append(content_type)
            if theme:
                where.append("theme = %s")
                params.append(theme)

            select_cols = "id, content_type, theme, title, content_text, author, source_origin, source_url, tags"
            order = ""
            if query_embedding is not None:
                params.append(_pgvector_literal(query_embedding))
                select_cols += (
                    ", 1 - (embedding <=> %s::halfvec) AS vector_score"
                )
                order = "ORDER BY embedding <=> %s::halfvec"
                params.append(_pgvector_literal(query_embedding))
                if min_score > 0:
                    where.append(
                        "1 - (embedding <=> %s::halfvec) >= %s"
                    )
                    params.append(_pgvector_literal(query_embedding))
                    params.append(min_score)
            else:
                select_cols += ", NULL AS vector_score"
                where.append("content_type <> 'SOURCE'")

            where_clause = ("WHERE " + " AND ".join(where)) if where else ""
            sql = (
                f"SELECT {select_cols} FROM {TABLE} {where_clause} {order} LIMIT %s"
            )
            params.append(limit)
            cur.execute(sql, params)
            return cur.fetchall()
    finally:
        conn.close()


# ==========================================================
# STATS
# ==========================================================

def kb_stats():
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT count(*) AS total,
                       count(*) FILTER (WHERE embedding IS NOT NULL) AS embedded
                FROM %s
                """ % TABLE,
            )
            total, embedded = cur.fetchone()
            cur.execute(
                """
                SELECT content_type, count(*) FROM %s
                GROUP BY content_type ORDER BY 2 DESC
                """ % TABLE,
            )
            by_type = dict(cur.fetchall())
        return {"total": total, "embedded": embedded, "by_type": by_type}
    finally:
        conn.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    ensure_table()
    print(kb_stats())
