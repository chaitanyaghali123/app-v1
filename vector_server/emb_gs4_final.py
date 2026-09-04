import sys
sys.path.insert(0, '/app')
import psycopg2
from ingest_hybrid import PG_DB, PG_USER, PG_PASS, PG_HOST, PG_PORT
c = psycopg2.connect(dbname=PG_DB, user=PG_USER, password=PG_PASS, host=PG_HOST, port=PG_PORT)
cur = c.cursor()

# Chunks that map to an ethics subject document (source_file == documents.file_name with subject ethics)
cur.execute("""
  SELECT COUNT(*) FROM upsc_chunks u
  JOIN documents d ON d.file_name = u.source_file AND d.subject_id='ethics'
""")
gs4_chunks = cur.fetchone()[0]
cur.execute("""
  SELECT COUNT(*) FROM upsc_chunks u
  JOIN documents d ON d.file_name = u.source_file AND d.subject_id='ethics'
  WHERE u.embedding IS NULL
""")
gs4_to_embed = cur.fetchone()[0]
cur.execute("""
  SELECT COUNT(*) FROM upsc_chunks u
  JOIN documents d ON d.file_name = u.source_file AND d.subject_id='ethics'
  WHERE u.embedding IS NOT NULL
""")
gs4_embedded = cur.fetchone()[0]

# How many ethics docs still have NO chunks at all
cur.execute("""
  SELECT COUNT(*) FROM documents d
  WHERE d.subject_id='ethics' AND NOT EXISTS (SELECT 1 FROM upsc_chunks u WHERE u.source_file=d.file_name)
""")
ethics_nochunks = cur.fetchone()[0]

print('GS4/ethics chunks (existing):', gs4_chunks)
print('  of which embedded:', gs4_embedded)
print('  of which to embed:', gs4_to_embed)
print('ethics docs with NO chunks yet:', ethics_nochunks)
c.close()
