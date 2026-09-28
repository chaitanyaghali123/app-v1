import os, sys, ast
SRC = "/app/abstract_corpus.py"
try:
    src = open(SRC).read()
    ast.parse(src)
    print("abstract_corpus.py: SYNTAX OK")
except Exception as e:
    print("abstract_corpus.py: SYNTAX FAIL", e)
    sys.exit(1)

try:
    import abstract_corpus as A
    print("import OK; GEN_URL uses:", A.ABST_MODEL)
except Exception as e:
    print("import FAIL:", e)
    sys.exit(1)

conn = A.get_conn()
with conn.cursor() as cur:
    cur.execute("DROP TABLE IF EXISTS chunk_abstraction")
conn.commit()
A.ensure_tracking_table(conn)
with conn.cursor() as cur:
    cur.execute("SELECT COUNT(*) FROM upsc_chunks")
    total = cur.fetchone()[0]
    cur.execute("""
        SELECT COUNT(*) FROM upsc_chunks c
        LEFT JOIN chunk_abstraction a ON a.chunk_id = c.id
        WHERE a.chunk_id IS NULL
    """)
    pending = cur.fetchone()[0]
    cur.execute("SELECT data_type FROM information_schema.columns WHERE table_name='upsc_chunks' AND column_name='id'")
    idtype = cur.fetchone()
print(f"upsc_chunks total={total} pending_abstract={pending} id_type={idtype[0] if idtype else '?'}")
conn.close()
