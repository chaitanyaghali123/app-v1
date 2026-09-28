import sys
sys.path.insert(0, "/app")
from ingest_hybrid import get_conn

conn = get_conn()
c = conn.cursor()

TOPICS = {
    "GS1":
    [
        ("Culture/Art/Literature", ["indus valley", "harappan", "classical", "architecture", "sculpture", "temple", "miniature painting", "mural", "literature", "sanskrit", "folk"]),
        ("Modern History", ["1857", "revolt", "national movement", "gandhi", "satyagraha", "congress", "partition", "independence act", "swadeshi", "civil disobedience"]),
        ("World History", ["world war", "industrial revolution", "colonization", "decolonization", "cold war", "french revolution", "marx", "communism", "imperialism", "league of nations"]),
        ("Indian Society", ["caste", "class", "gender", "urbanization", "social empowerment", "communalism", "secularism", "globalization", "demography", "population"]),
        ("Post-Independence", ["reorganisation", "sarkaria", "mandal", "green revolution", "panchayati", "economic liberalisation", "new economic policy"]),
    ],
    "GS2":
    [
        ("Constitution", ["basic structure", "fundamental rights", "directive principles", "judicial review", "writ", "article 356", "amendment", "constituent assembly", "preamble", "federalism"]),
        ("Polity/Organs", ["parliament", "judiciary", "executive", "president", "governor", "election commission", "rti", "ombudsman", "lokpal", "tribunal"]),
        ("Governance", ["e-governance", "digital india", "public policy", "accountability", "transparency", "decentralisation", "civil service", "good governance", "scheme", "subsidy"]),
        ("Social Justice", ["health", "education", "poverty", "hunger", "nutrition", "reservation", "women", "child", "disability", "nrega", "social security"]),
        ("International Relations", ["bilateral", "united nations", "g20", "brics", "saarc", "nepal", "bangladesh", "sri lanka", "diaspora", "asean"]),
    ],
    "GS3":
    [
        ("Economy", ["gdp", "inflation", "fiscal", "monetary", "budget", "banking", "rbi", "investment", "employment", "liberalisation", "pension", "infrastructure"]),
        ("Agriculture", ["irrigation", "cropping", "food processing", "horticulture", "farm subsidy", "minimum support price", "agri", "fertilizer", "pesticide", "pds", "storage"]),
        ("Science & Tech", ["space", "isro", "nuclear", "nanotechnology", "biotechnology", "internet", "ai", "quantum", "graphene", "supercomput"]),
        ("Environment", ["climate change", "biodiversity", "conservation", "wetland", "pollution", "endangered", "wasteland", "carbon", "deforestation", "bio-indicator"]),
        ("Disaster Mgmt", ["disaster", "cyclone", "earthquake", "flood", "mitigation", "ndma", "response", "relief", "tsunami", "drought"]),
        ("Security", ["internal security", "cyber", "terrorism", "money laundering", "border", "naxal", "intelligence", "insurgency", "maritime security"]),
    ],
    "GS4":
    [
        ("Ethics", ["ethics", "integrity", "probity", "morality", "virtue", "duty", "attitude", "emotional intelligence", "moral", "consequence"]),
        ("Case Studies/Public Ser", ["case study", "public service", "administrator", "conflict of interest", "courage", "corruption", "whistle", "dedication", "tolerance", "dilemma"]),
    ],
}

SUBJ_MAP = {
    "GS1": ["history", "history-optional", "culture", "heritage", "society", "sociology-optional", "geography", "geography-optional", "philosophy-optional"],
    "GS2": ["polity", "constitution", "governance", "social-justice", "international", "international-relations"],
    "GS3": ["economy", "agriculture", "science", "science-tech", "environment", "disaster-management", "disaster", "internal-security"],
    "GS4": ["ethics", "essay"],
}

for paper, topics in TOPICS.items():
    subj_list = SUBJ_MAP[paper]
    ph = ",".join(["%s"] * len(subj_list))
    c.execute(
        f"SELECT COUNT(DISTINCT source_file), COUNT(1) FROM upsc_chunks WHERE subject_id IN ({ph})",
        tuple(subj_list),
    )
    docs, ch = c.fetchone()
    print(f"\n===== {paper}: {docs} docs / {ch} chunks =====")
    for name, kws in topics:
        if not kws:
            print(f"  {name}: (no keywords)")
            continue
        q = "SELECT COUNT(1) FROM upsc_chunks WHERE subject_id IN ({}) AND ({}"
        conds = []
        args = list(subj_list)
        for k in kws:
            conds.append("LOWER(chunk) LIKE %s")
            args.append(f"%{k}%")
        c.execute(f"SELECT COUNT(DISTINCT source_file), COUNT(1) FROM upsc_chunks WHERE subject_id IN ({ph}) AND ({') OR ('.join(conds)})", tuple(args))
        d2, ch2 = c.fetchone()
        print(f"  {name:28s} topics-hit docs={d2:4d} chunk-hits={ch2:6d}")