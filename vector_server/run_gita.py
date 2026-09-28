import sys
from pathlib import Path
sys.path.insert(0, "/app")
import ingest_hybrid as IH

IH.process_file(Path("/app/data/essay/Bhagavad_Gita_Arnold.txt"), subject_id="essay")
print("DONE essay/Gita")