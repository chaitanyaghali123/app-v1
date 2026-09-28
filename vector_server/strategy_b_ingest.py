import sys
sys.path.insert(0, "/app")
import ingest_hybrid as IH

for subj, fname in [
    ("agriculture", "/app/data/agriculture/Economic_Survey_2024-25_Ch9_Agriculture.pdf"),
    ("social-justice", "/app/data/social-justice/Economic_Survey_2024-25_Ch11_SocialSector.pdf"),
]:
    print("=" * 70)
    print("PROCESSING", subj, fname)
    try:
        IH.process_file(__import__("pathlib").Path(fname), subject_id=subj)
        print("DONE", subj)
    except Exception as e:
        print("ERROR", subj, repr(e)[:300])