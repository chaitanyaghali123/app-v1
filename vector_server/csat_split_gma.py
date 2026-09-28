"""Split the merged LR+GMA R2 group into two blueprint subjects:
  logical-reasoning-analytical-ability  (keeps Class 11 Math)
  general-mental-ability               (takes Class 12 Math P1 + P2)

R2: copy (doesn't delete) the two NCERT PDFs from the LR group into the GMA
group, then delete the two keys from the LR group so every PDF has exactly one
owner. DB label update happens separately (see csat_relabel_db.py).
"""
import sys
sys.path.insert(0, "/app")
import r2_store

S = r2_store._settings()
CLI = r2_store._get_client()
B = S["bucket"]
LR = "prelims/paper-ii-csat/logical-reasoning-general-mental-ability/"
GMA = "prelims/paper-ii-csat/general-mental-ability/"
FILES = ["NCERT_Class12_Math_Part1.pdf", "NCERT_Class12_Math_Part2.pdf"]


def main():
    for f in FILES:
        CLI.copy_object(Bucket=B, Key=GMA + f,
                        CopySource={"Bucket": B, "Key": LR + f})
        CLI.delete_object(Bucket=B, Key=LR + f)
        print("r2 {} -> {}".format(LR + f, GMA + f))


if __name__ == "__main__":
    main()
