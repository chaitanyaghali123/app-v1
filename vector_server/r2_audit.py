import sys
sys.path.insert(0, "/app")
import r2_store as R

print("r2_enabled:", R.r2_enabled())
objs = R.list_r2_objects()
print("total objects:", len(objs))
subjects = {}
for rel in objs:
    subj = rel.split("/")[0]
    subjects[subj] = subjects.get(subj, 0) + 1
print("by subject folder:")
for k in sorted(subjects, key=lambda x: -subjects[x]):
    print(f"  {k}: {subjects[k]}")
print("sample keys:")
for rel in list(objs)[:15]:
    print("  ", rel)