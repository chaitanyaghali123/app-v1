# gs4_ethics_kb.py
# ==========================================================
# GS4 (Ethics, Integrity & Aptitude) structured knowledge base.
#
# Copyright-safe sources only:
#   - Original encyclopedic summaries of public-domain philosophical
#     ideas and thinkers (facts and ideas are not copyrightable).
#   - Government reports (2nd ARC, CVC) published by the Government
#     of India (official publications are in the public domain).
#   - NCERT textbooks (open access OER, reproduced under CC BY-NC-SA
#     attribution terms; short identification quotes only).
#   - Case scenarios modelled on public UPSC syllabus patterns.
#
# The table mirrors the corpus chunk store but adds structured
# syllabus tags and module categories so GS4 theory (Section A) and
# case studies (Section B) can be answered authoritatively.
# ==========================================================

import os
import re
import logging
import threading

from datetime import datetime

import psycopg2
import psycopg2.extras

logger = logging.getLogger(__name__)

EMBED_DIM = int(os.getenv("EMBED_DIM", "1536"))
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_EMBED_URL = (
    "https://generativelanguage.googleapis.com/v1beta/"
    "models/gemini-embedding-001:batchEmbedContents"
)

TABLE = "gs4_ethics_knowledge_base"

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
CREATE TABLE IF NOT EXISTS gs4_ethics_knowledge_base (
    id BIGSERIAL PRIMARY KEY,
    module_category VARCHAR(50) NOT NULL,
    syllabus_tag VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    content_text TEXT NOT NULL,
    source_origin VARCHAR(100) NOT NULL,
    source_url TEXT,
    tags TEXT[] DEFAULT '{}',
    embedding VECTOR(%(dim)s),
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE (title, module_category)
);

CREATE INDEX IF NOT EXISTS idx_gs4_kb_category
    ON gs4_ethics_knowledge_base (module_category);

CREATE INDEX IF NOT EXISTS idx_gs4_kb_syllabus
    ON gs4_ethics_knowledge_base (syllabus_tag);

CREATE INDEX IF NOT EXISTS idx_gs4_kb_tags
    ON gs4_ethics_knowledge_base USING GIN (tags);

CREATE INDEX IF NOT EXISTS idx_gs4_kb_search
    ON gs4_ethics_knowledge_base USING GIN (
        to_tsvector('english', title || ' ' || content_text)
    );

CREATE INDEX IF NOT EXISTS idx_gs4_kb_embedding
    ON gs4_ethics_knowledge_base
    USING hnsw (embedding vector_cosine_ops);
"""


def ensure_table():
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("CREATE EXTENSION IF NOT EXISTS vector;")
            cur.execute(SCHEMA_SQL, {"dim": EMBED_DIM})
        conn.commit()
        logger.info("gs4_ethics_knowledge_base ensured")
    except Exception as exc:
        conn.rollback()
        logger.exception(f"ensure gs4 kb failed: {exc}")
        raise
    finally:
        conn.close()


# ==========================================================
# EMBEDDING (Gemini, same key as corpus; async best-effort)
# ==========================================================


def _embed_texts(texts):
    import requests

    payload = {
        "requests": [
            {
                "model": "models/gemini-embedding-001",
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


def upsert_entry(
    module_category,
    syllabus_tag,
    title,
    content_text,
    source_origin,
    source_url=None,
    tags=None,
    embed=True,
):
    with lock:
        conn = get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT id, embedding FROM %s
                    WHERE title = %%s AND module_category = %%s
                    """ % TABLE,
                    (title, module_category),
                )
                row = cur.fetchone()

                embed_literal = None
                if embed:
                    try:
                        emb = _embed_texts([content_text[:4000]])[0]
                        embed_literal = _pgvector_literal(emb)
                    except Exception as exc:
                        logger.warning(
                            f"Embedding skipped for '{title}': {exc}"
                        )

                if embed_literal is not None:
                    if row:
                        cur.execute(
                            """
                            UPDATE %s
                            SET syllabus_tag = %%s,
                                content_text = %%s,
                                source_origin = %%s,
                                source_url = %%s,
                                tags = %%s,
                                embedding = %%s::vector,
                                updated_at = NOW()
                            WHERE id = %%s
                            """ % TABLE,
                            (
                                syllabus_tag,
                                content_text,
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
                            INSERT INTO %s (
                                module_category, syllabus_tag, title,
                                content_text, source_origin, source_url,
                                tags, embedding
                            )
                            VALUES (%%s, %%s, %%s, %%s, %%s, %%s, %%s, %%s::vector)
                            """ % TABLE,
                            (
                                module_category,
                                syllabus_tag,
                                title,
                                content_text,
                                source_origin,
                                source_url,
                                tags or [],
                                embed_literal,
                            ),
                        )
                else:
                    if row:
                        cur.execute(
                            """
                            UPDATE %s
                            SET syllabus_tag = %%s,
                                content_text = %%s,
                                source_origin = %%s,
                                source_url = %%s,
                                tags = %%s,
                                updated_at = NOW()
                            WHERE id = %%s
                            """ % TABLE,
                            (
                                syllabus_tag,
                                content_text,
                                source_origin,
                                source_url,
                                tags or [],
                                row[0],
                            ),
                        )
                    else:
                        cur.execute(
                            """
                            INSERT INTO %s (
                                module_category, syllabus_tag, title,
                                content_text, source_origin, source_url, tags
                            )
                            VALUES (%%s, %%s, %%s, %%s, %%s, %%s, %%s)
                            """ % TABLE,
                            (
                                module_category,
                                syllabus_tag,
                                title,
                                content_text,
                                source_origin,
                                source_url,
                                tags or [],
                            ),
                        )
            conn.commit()
            return {"title": title, "category": module_category}
        except Exception as exc:
            conn.rollback()
            logger.exception(f"upsert gs4 entry failed: {exc}")
            raise
        finally:
            conn.close()


# ==========================================================
# SEARCH (BM25 tsvector + trigram now; vector when present)
# ==========================================================


def search_gs4_kb(
    query,
    top_k=8,
    module_category=None,
    syllabus_tag=None,
    tags=None,
):
    if _has_embeddings():
        vector_results = _vector_search(
            query,
            top_k=top_k,
            module_category=module_category,
            syllabus_tag=syllabus_tag,
            tags=tags,
        )
        if vector_results:
            return vector_results

    bm25_results = _bm25_search(
        query,
        top_k=top_k,
        module_category=module_category,
        syllabus_tag=syllabus_tag,
        tags=tags,
    )
    return bm25_results


def _has_embeddings():
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT COUNT(*) FROM {TABLE} WHERE embedding IS NOT NULL"
            )
            return int(cur.fetchone()[0]) > 0
    except Exception:
        return False
    finally:
        conn.close()


def _filters(
    module_category,
    syllabus_tag,
    tags,
    params,
):
    where = []
    if module_category:
        where.append("module_category = %(module_category)s")
        params["module_category"] = module_category
    if syllabus_tag:
        where.append("syllabus_tag = %(syllabus_tag)s")
        params["syllabus_tag"] = syllabus_tag
    if tags:
        params["tags"] = tags
        where.append("tags && %(tags)s::text[]")
    return where


def _rows_to_results(rows):
    results = []
    for row in rows:
        results.append({
            "id": row["id"],
            "module_category": row["module_category"],
            "syllabus_tag": row["syllabus_tag"],
            "title": row["title"],
            "text": row["content_text"],
            "source_origin": row["source_origin"],
            "source_url": row["source_url"] or "",
            "tags": row["tags"] or [],
            "score": float(row.get("score") or 0),
        })
    return results


def _vector_search(
    query,
    top_k=8,
    module_category=None,
    syllabus_tag=None,
    tags=None,
):
    """Vector search over embedded KB entries (if any exist)."""
    conn = get_conn()
    try:
        with conn.cursor(
            cursor_factory=psycopg2.extras.RealDictCursor
        ) as cur:
            try:
                q_emb = _embed_texts([query])[0]
            except Exception as exc:
                logger.warning(f"query embed skipped: {exc}")
                return []

            params = {}
            where = _filters(
                module_category, syllabus_tag, tags, params
            )
            where.append("embedding IS NOT NULL")
            where_sql = ("WHERE " + " AND ".join(where)) if where else ""

            cur.execute(
                f"""
                SELECT id, module_category, syllabus_tag, title,
                       content_text, source_origin, source_url, tags,
                       1 - (embedding <=> %(qv)s::vector) AS score
                FROM {TABLE}
                {where_sql}
                ORDER BY embedding <=> %(qv)s::vector
                LIMIT %(limit)s
                """,
                {
                    **params,
                    "qv": _pgvector_literal(q_emb),
                    "limit": top_k,
                },
            )
            rows = cur.fetchall()
            return _rows_to_results(rows)
    except Exception as exc:
        logger.exception(f"gs4 kb vector search failed: {exc}")
        return []
    finally:
        conn.close()


def _bm25_search(
    query,
    top_k=8,
    module_category=None,
    syllabus_tag=None,
    tags=None,
):
    """Ranked full-text + trigram search (works without embeddings)."""
    conn = get_conn()
    try:
        with conn.cursor(
            cursor_factory=psycopg2.extras.RealDictCursor
        ) as cur:
            params = {}
            where = _filters(
                module_category, syllabus_tag, tags, params
            )
            where.append(
                "("
                "  to_tsvector('english', title || ' ' || content_text) "
                "  @@ websearch_to_tsquery('english', %(query)s)"
                "  OR word_similarity(%(query)s, title) > 0.25"
                ")"
            )
            where_sql = ("WHERE " + " AND ".join(where)) if where else ""

            cur.execute(
                f"""
                SELECT id, module_category, syllabus_tag, title,
                       content_text, source_origin, source_url, tags,
                       0.6 * ts_rank_cd(
                           to_tsvector('english', title || ' ' || content_text),
                           websearch_to_tsquery('english', %(query)s)
                       ) +
                       0.4 * GREATEST(
                           word_similarity(%(query)s, title),
                           word_similarity(%(query)s, COALESCE(array_to_string(tags, ' '), ''))
                       ) AS score
                FROM {TABLE}
                {where_sql}
                ORDER BY score DESC, id DESC
                LIMIT %(limit)s
                """,
                {**params, "query": query, "limit": top_k * 3},
            )
            rows = cur.fetchall()

            results = []
            for row in rows:
                results.append({
                    "id": row["id"],
                    "module_category": row["module_category"],
                    "syllabus_tag": row["syllabus_tag"],
                    "title": row["title"],
                    "text": row["content_text"],
                    "source_origin": row["source_origin"],
                    "source_url": row["source_url"] or "",
                    "tags": row["tags"] or [],
                    "score": float(row["score"] or 0),
                })
            return results[:top_k]
    except Exception as exc:
        logger.exception(f"gs4 kb search failed: {exc}")
        return []
    finally:
        conn.close()


# ==========================================================
# STATS
# ==========================================================


def backfill_embeddings(limit=200, batch_size=8):
    """Embed every row that is missing a vector, best effort.

    Returns the number of rows successfully embedded.
    """
    conn = get_conn()
    done = 0
    try:
        with conn.cursor(
            cursor_factory=psycopg2.extras.RealDictCursor
        ) as cur:
            cur.execute(
                f"""
                SELECT id, title, content_text
                FROM {TABLE}
                WHERE embedding IS NULL
                ORDER BY id
                LIMIT %s
                """,
                (int(limit),),
            )
            rows = cur.fetchall()
        for i in range(0, len(rows), batch_size):
            batch = rows[i : i + batch_size]
            texts = [r["content_text"][:4000] for r in batch]
            try:
                embs = _embed_texts(texts)
            except Exception as exc:
                logger.warning(
                    f"backfill embed batch failed at row {i}: {exc}"
                )
                break
            with conn.cursor() as c2:
                for r, emb in zip(batch, embs):
                    c2.execute(
                        f"""
                        UPDATE {TABLE}
                        SET embedding = %s::vector
                        WHERE id = %s
                        """,
                        (_pgvector_literal(emb), r["id"]),
                    )
            conn.commit()
            done += len(batch)
            logger.info(f"gs4 kb backfill: embedded {done}/{len(rows)}")
        return done
    except Exception as exc:
        conn.rollback()
        logger.exception(f"backfill embeddings failed: {exc}")
        return done
    finally:
        conn.close()


def kb_stats():
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT COUNT(*) FROM {TABLE}"
            )
            total = int(cur.fetchone()[0])
            cur.execute(
                f"""
                SELECT module_category, COUNT(*)
                FROM {TABLE} GROUP BY 1 ORDER BY 2 DESC
                """
            )
            by_category = {r[0]: int(r[1]) for r in cur.fetchall()}
            cur.execute(
                f"SELECT COUNT(*) FROM {TABLE} WHERE embedding IS NOT NULL"
            )
            embedded = int(cur.fetchone()[0])
        return {
            "table": TABLE,
            "total_entries": total,
            "embedded_entries": embedded,
            "by_category": by_category,
        }
    except Exception as exc:
        logger.exception(f"gs4 kb stats failed: {exc}")
        return {"total_entries": 0, "by_category": {}, "error": str(exc)}
    finally:
        conn.close()