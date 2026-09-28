"""Split the previously-merged LR+GMA group into two per the official 2026 UPSC
headings: Logical Reasoning (Class 11 Math) and General Mental Ability
(Class 12 Math P1/P2). Also drop the Class 11/12 copies that still live in the
basic-numeracy group so every PDF belongs to exactly one group.

Run inside aryabhata-ingestor:
    python /app/csat_split_7.py
"""
import sys

sys.path.insert(0, "/app")
import r2_store

S = r2_store._settings()
CLI = r2_store._get_client()
B = S["bucket"]
BASE = "prelims/paper-ii-csat/"

LR = BASE + "logical-reasoning-analytical-ability/"
GMA = BASE + "general-mental-ability/"
NUM = BASE + "basic-numeracy-quantitative-aptitude/"


def copy(src, dst):
    CLI.copy_object(Bucket=B, Key=dst,
                    CopySource={"Bucket": B, "Key": src})


def drop(key):
    CLI.delete_object(Bucket=B, Key=key)


def main():
    # 1) GMA group <- Class12 P1/P2 (from the merged LR+GMA src)
    merged = BASE + "logical-reasoning-general-mental-ability/"
    for f in ("NCERT_Class12_Math_Part1.pdf", "NCERT_Class12_Math_Part2.pdf"):
        copy(merged + f, GMA + f)
        print("r2 copy ->", GMA + f)
    # 2) LR group keeps only Class 11; strip math 12 P1/P2 out of it
    cli = CLI
    keys = [o["Key"] for o in
            cli.list_objects_v2(Bucket=B, Prefix=merged).get("Contents") or []]
    for k in keys:
        if "NCERT_Class12_Math" in k:
            drop(k)
            print("r2 drop from LR+GMA:", k)
    # 3) basic-numeracy: delete the 3 math-11/12 duplicates (belong to LR/GMA)
    nums = [o["Key"] for o in
            cli.list_objects_v2(Bucket=B, Prefix=NUM).get("Contents") or []]
    for k in nums:
        if any(x in k for x in ("Class11", "Class12")):
            drop(k)
            print("r2 drop duplicate from numeracy:", k)
    print("R2 done")


if __name__ == "__main__":
    main()
