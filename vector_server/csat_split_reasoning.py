"""Move Class 11/12 Math NCERTs from basic-numeracy into the logical-reasoning
group: rename R2 keys (copy+delete), then update prelims_chunks.source_file so
the DB path matches the blueprint grouping.
"""
import sys
sys.path.insert(0, "/app")
import r2_store

SRC_GROUP = "prelims/paper-ii-csat/basic-numeracy-quantitative-aptitude/"
DST_GROUP = "prelims/paper-ii-csat/logical-reasoning-general-mental-ability/"
MOVE = [
    "NCERT_Class11_Math.pdf",
    "NCERT_Class12_Math_Part1.pdf",
    "NCERT_Class12_Math_Part2.pdf",
]


def main():
    objs = r2_store.list_r2_objects()
    cli = r2_store._get_client()
    buck = r2_store._settings()["bucket"]
    for name in MOVE:
        src, dst = SRC_GROUP + name, DST_GROUP + name
        if src in objs:
            cli.copy_object(
                Bucket=buck, Key=dst,
                CopySource={"Bucket": buck, "Key": src})
            cli.delete_object(Bucket=buck, Key=src)
            print("r2 moved", name)
        else:
            print("r2 MISSING", name)
    import ingest_hybrid as ih
    conn = ih.get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE prelims_chunks SET source_file = replace(source_file, %s, %s) "
                "WHERE subject_id='csat' AND source_file LIKE %s",
                (SRC_GROUP, DST_GROUP, SRC_GROUP + "%"))
            print("db rows updated:", cur.rowcount)
        conn.commit()
    finally:
        ih.release_conn(conn)


if __name__ == "__main__":
    main()
