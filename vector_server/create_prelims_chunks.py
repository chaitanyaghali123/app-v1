#!/usr/bin/env python
"""Create dedicated prelims_chunks partitioned table mirroring upsc_chunks structure."""
import os, re, sys, psycopg2

def parse_subject(bound: str) -> str:
    m = re.search(r"FOR VALUES IN \('([^']+)'\)", bound)
    return m.group(1)

def main():
    conn = psycopg2.connect(
        dbname=os.getenv("DB_NAME", os.getenv("PG_DB", "aryabhata_db")),
        user="aryabhata_user",
        password=os.getenv("DB_PASSWORD", os.getenv("PG_PASSWORD", "Password123")),
        host=os.getenv("DB_HOST", os.getenv("PG_HOST", "postgres")),
        port=os.getenv("DB_PORT", "5432"),
    )
    cur = conn.cursor()

    # 1) create parent table
    cur.execute("""
    CREATE TABLE IF NOT EXISTS prelims_chunks (
        id              text NOT NULL,
        chunk           text,
        topic           text,
        difficulty      text,
        source_file     text,
        file_hash       text,
        subject_id      text NOT NULL DEFAULT 'general',
        chunk_index     integer,
        page_number     integer,
        chunk_version   integer DEFAULT 1,
        embedding       halfvec(3072),
        search_vector   tsvector,
        heading_hierarchy jsonb DEFAULT '[]',
        parent_chunk    text DEFAULT '',
        is_parent_chunk boolean DEFAULT false,
        created_at      timestamp DEFAULT now(),
        diagram_url     text,
        gs_paper        text DEFAULT 'general'
    ) PARTITION BY LIST (subject_id);
    """)
    conn.commit()
    print("✓ prelims_chunks parent created")

    # 2) read existing partition subject values from upsc_chunks
    cur.execute("""
    SELECT pg_get_expr(c.relpartbound, c.oid, true) AS bound
      FROM pg_class c
      JOIN pg_inherits i ON i.inhrelid = c.oid
      JOIN pg_class p ON p.oid = i.inhparent
     WHERE p.relname = 'upsc_chunks'
     ORDER BY c.relname;
    """)
    subjects = [parse_subject(b) for (b,) in cur.fetchall()]
    print(f"Subjects to create: {len(subjects)}")

    for subj in subjects:
        tbl = f"prelims_chunks_{subj.replace('-','_')}"
        cur.execute(f"""
            CREATE TABLE IF NOT EXISTS public.{tbl}
            PARTITION OF public.prelims_chunks
            FOR VALUES IN ('{subj}');
        """)
        # per-partition non-unique indexes (mirrors upsc_chunks_<sub> naming)
        for idx_sql in [
            f"CREATE INDEX IF NOT EXISTS {tbl}_chunk_idx       ON public.{tbl} USING gin (chunk gin_trgm_ops);",
            f"CREATE INDEX IF NOT EXISTS {tbl}_embedding_idx   ON public.{tbl} USING hnsw (embedding halfvec_cosine_ops);",
            f"CREATE INDEX IF NOT EXISTS {tbl}_file_hash_idx   ON public.{tbl} USING btree (file_hash);",
            f"CREATE INDEX IF NOT EXISTS {tbl}_search_vector_idx ON public.{tbl} USING gin (search_vector);",
            f"CREATE INDEX IF NOT EXISTS {tbl}_subject_id_idx  ON public.{tbl} USING btree (subject_id);",
            f"CREATE INDEX IF NOT EXISTS {tbl}_topic_idx       ON public.{tbl} USING btree (topic);",
        ]:
            cur.execute(idx_sql)
        conn.commit()
        print(f"  partition + indexes: {subj}")

    # 3) add PK after partitions created
    cur.execute("""
    ALTER TABLE prelims_chunks
      ADD PRIMARY KEY (id, subject_id);
    """)
    conn.commit()
    print("✓ PK (id, subject_id) added")

    # 4) parent-only "ONLY" indexes (mirrors upsc_chunks parent def)
    parent_only_idxs = [
        ("prelims_chunks_file_hash_idx", "btree (file_hash)"),
        ("prelims_chunks_gin_searchvec", "gin (search_vector)"),
        ("prelims_chunks_gin_trgm", "gin (chunk gin_trgm_ops)"),
        ("prelims_chunks_hnsw_v", "hnsw (embedding halfvec_cosine_ops)"),
        ("prelims_chunks_subject_id_idx", "btree (subject_id)"),
        ("prelims_chunks_topic_idx", "btree (topic)"),
    ]
    for idx_name, idx_def in parent_only_idxs:
        cur.execute(f"CREATE INDEX IF NOT EXISTS {idx_name} ON ONLY public.prelims_chunks USING {idx_def};")
    conn.commit()
    print("✓ parent-only ONLY indexes created")

    cur.close()
    conn.close()

if __name__ == "__main__":
    main()
