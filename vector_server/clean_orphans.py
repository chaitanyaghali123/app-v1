"""Delete 2 orphan R2 objects using correct full keys."""
import os,sys;sys.path.insert(0,'/app');os.environ.setdefault('R2_PREFIX','')
import r2_store

orphans = [
    'gs4/ethics/BPAC-108_Unit8.pdf',
    'gs4/ethics/MPY-002_123456789-35328_Unit-3.pdf',
]

for key in orphans:
    try:
        r2_store.delete_r2_object(key)
        print('DELETED', key)
    except Exception as e:
        print('FAIL', key, e)
