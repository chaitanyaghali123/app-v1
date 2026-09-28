import sys
sys.path.insert(0, "/app")
from ingest_hybrid import get_conn

conn = get_conn()
c = conn.cursor()

TOPICS = {
    "GS3":
    [
        ("Economy", ["gdp", "inflation", "fiscal", "monetary", "budget", "banking", "rbi", "investment", "employment", "liberalisation", "infrastructure"]),
        ("Agriculture", ["irrigation", "cropping", "food processing", "horticulture", "farm subsidy", "minimum support price", "fertilizer", "msp", "pds", "storage"]),
        ("Science & Tech", ["space", "isro", "nuclear", "nanotechnology", "biotechnology", "internet", "artificial intelligence", "quantum", "supercomput"]),
        ("Environment", ["climate change", "biodiversity", "conservation", "wetland", "pollution", "endangered", "carbon", "deforestation", "ecosystem"]),
        ("Disaster Mgmt", ["disaster", "cyclone", "earthquake", "flood", "mitigation", "ndma", "tsunami", "drought", "landslide"]),
        ("Security", ["internal security", "cyber", "terrorism", "money laundering", "border", "naxal", "intelligence", "insurgency", "maritime"]),
    ],
    "GS4":
    [
        ("Ethics", ["ethics", "integrity", "probity", "morality", "virtue", "attitude", "emotional intelligence", "moral"]),
        ("Public Service/Case St.", ["case study", "public service", "conflict of interest", "corruption", "whistle", "dilemma", "administrative ethics"]),
    ],
}

SUBJ_MAP = {
    "GS3": ["economy", "agriculture", "science", "science-tech", "environment", "disaster-management", "disaster", "internal-security"],
    "GS4": ["ethics", "essay"],
}

def count(kw):
    c.execute(
        """SELECT COUNT(DISTINCT source_file), COUNT(1) FROM upsc_chunks
           WHERE search_vector @@ plainto_tsquery('english', %s)""",
        (kw,),
    )
    return c.fetchone()

for paper, topics in TOPICS.items():
    subj_list = SUBJ_MAP[paper]
    ph = ",".join(["%s"] * len(subj_list))
    c.execute(f"SELECT COUNT(DISTINCT source_file), COUNT(1) FROM upsc_chunks WHERE subject_id IN ({ph})", tuple(subj_list))
    docs, ch = c.fetchone()
    print(f"\n===== {paper}: {docs} docs / {ch} chunks =====")
    tot_d = tot_h = 0
    for name, kws in topics:
        d2 = set(); hits = 0
        for k in kws:
            dd, hh = count(k)
            hits += hh
        print(f"  {name:28s} hits={hits}")
    print(f"  TOTAL topic-chunk-hits (union of all keywords) = {hits}")