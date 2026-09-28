"""Relabel prelims.chunks src paths for csat to the 7-subject blueprint scheme,
one file = exactly one subject group.

Mapping (old src path -> new src path) for subject_id='csat':
  english/                         -> reading-comprehension-critical-reasoning/
  (class10 english are already rc-cr; class 12 english also rc-cr)
  logical-reasoning-general-.../   -> logical-reasoning-analytical-ability/        (class11)
  general-mental-ability/          -> gma class12 math (already r2-moved)
  basic-numeracy-quantitative...   -> stays (class6-10 math)
  interpersonal-skills-comm/       -> stays
  decision-making-problem-solving/ -> stays
  data-interpretation-data-suff/   -> stays
"""
import sys
sys.path.insert(0, "/app")
import r2_store
import psycopg2

OLD = {
    "prelims/paper-ii-csat/english/": "prelims/paper-ii-csat/reading-comprehension-critical-reasoning/",
    "prelims/paper-ii-csat/logical-reasoning-general-mental-ability/NCERT_Class11_Math.pdf":
        "prelims/paper-ii-csat/logical-reasoning-analytical-ability/NCERT_Class11_Math.pdf",
    "prelims/paper-ii-csat/logical-reasoning-general-mental-ability/NCERT_Class12_Math_Part1.pdf":
        "prelims/paper-ii-csat/general-mental-ability/NCERT_Class12_Math_Part1.pdf",
    "prelims/paper-ii-csat/logical-reasoning-general-mental-ability/NCERT_Class12_Math_Part2.pdf":
        "prelims/paper-ii-csat/general-mental-ability/NCERT_Class12_Math_Part2.pdf",
}

DB = dict(
    database=r2_store._settings().get("db_name", "aryabhata_db"),
    user=r2_store._settings().get("db_user", "aryabhata_user"),
    password=r2_store._settings().get("db_pass", "Password123"),
    host=r2_store._settings().get("db_host", "postgres"),
)


def main():
    conn = psycopg2.connect(**DB)
    cur = conn.cursor()
    moved = 0
    for old, new in OLD.items():
        cur.execute(
            "UPDATE prelims_chunks SET source_file=%s "
            "WHERE subject_id='csat' AND source_file=%s",
            (new, old),
        )
        moved += cur.rowcount
    conn.commit()
    print("db relabel rows:", moved)

    # verify 7 groups
    cur.execute(
        "SELECT split_part(source_file,'/',4) grp, count(*) FROM prelims_chunks "
        "WHERE subject_id='csat' GROUP BY 1 ORDER BY 1"
    )
    for g, c in cur.fetchall():
        print(f"{g:46} {c}")
    cur.close()
    conn.close()
    total = sum(c for _, c in [])
    print("total chunks:", moved and "(see above)")


if __name__ == "__main__":
    main()
