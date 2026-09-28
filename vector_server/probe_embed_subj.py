import glob, subprocess, sys

files = glob.glob("/app/embed_*.py") + glob.glob("/app/emb*.py")
for f in sorted(files):
    try:
        src = open(f).read()
        if "prelims_chunks" not in src:
            continue
        subj = "HAS-subject-filter" if "subject_id" in src else "ANY-rows"
        print(f.split("/")[-1], subj)
    except Exception:
        pass
print("-- embed_*.py with prelims_chunks above --")
