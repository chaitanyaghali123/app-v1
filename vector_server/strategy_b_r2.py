import sys
sys.path.insert(0, "/app")
import r2_store as R

objs = R.list_r2_objects()

MOVES = [
    ("essay/Economic_Survey_2024-25_Ch9_Agriculture.pdf",
     "gs3/agriculture/Economic_Survey_2024-25_Ch9_Agriculture.pdf",
     "/app/data/essay/Economic_Survey_2024-25_Ch9_Agriculture.pdf"),
    ("essay/Economic_Survey_2024-25_Ch11_SocialSector.pdf",
     "gs2/social-justice/Economic_Survey_2024-25_Ch11_SocialSector.pdf",
     "/app/data/essay/Economic_Survey_2024-25_Ch11_SocialSector.pdf"),
]

for rel_src, key_dst, src_local in MOVES:
    meta = objs.get(rel_src)
    if not meta:
        print("SKIP (not on R2):", rel_src)
        continue
    R.upload_r2_object(key_dst, src_local)
    print("UPLOADED:", key_dst)
    R.delete_r2_object(meta["key"])
    print("DELETED :", meta["key"])