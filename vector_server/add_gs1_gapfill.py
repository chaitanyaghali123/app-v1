"""GS1 gap-fill ingestion: download open NCERT/NIOS PDFs that close the four
documented GS1 coverage gaps (Post-Independence, Modern History depth, World
History/Decolonization, Indian Society). All sources are government OER
(NCERT/NIOS) - zero copyright risk.

Downloads to /app/data/<subdir>, uploads to R2, registers in `documents`.
Chunking is done separately (chunk_gs1_gapfill.py) with embedding deferred.
"""
import os, sys, ssl, urllib.request
from pathlib import Path

sys.path.insert(0, "/app")
os.environ.setdefault("R2_PREFIX", "")
import r2_store, ingest_hybrid

ctx = ssl._create_unverified_context()
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"}

def sha256_hex(p):
    import hashlib
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for c in iter(lambda: f.read(8192), b""): h.update(c)
    return h.hexdigest()

# (subdir, disk_name, url)
HIST316 = "https://nios.ac.in/media/documents/SrSec315NEW/315_History_Eng/315_History_Eng_Lesson"
SOC331 = "https://cdn.nios.ac.in/cms/documents/2020/Jul/01/"

items = [
    # Post-Independence Consolidation (was 0%)
    ("history", "NCERT_Class12_Politics_in_India_Since_Independence.pdf",
     "https://ncert.nic.in/textbook/pdf/leps2ps.pdf"),
    # Modern Indian History depth
    ("history", "NIOS315_History_L16_Establishment_of_British_Rule_till_1857.pdf", HIST316 + "16.pdf"),
    ("history", "NIOS315_History_L18_Social_Changes_in_Modern_India.pdf", HIST316 + "18.pdf"),
    ("history", "NIOS315_History_L19_Popular_Resistance_to_Company_Rule.pdf", HIST316 + "19.pdf"),
    ("history", "NIOS315_History_L20_Nationalism.pdf", HIST316 + "20.pdf"),
    ("history", "NIOS315_History_L21_National_Movement_and_Indian_Democracy.pdf", HIST316 + "21.pdf"),
    # World History / Decolonization
    ("history", "NIOS315_History_L22_World_in_1900_Nineteenth_Century_Legacy.pdf", HIST316 + "22.pdf"),
    ("history", "NIOS315_History_L23_World_War1_and_Russian_Revolution.pdf", HIST316 + "23.pdf"),
    ("history", "NIOS315_History_L24_Interwar_Period_and_Second_World_War.pdf", HIST316 + "24.pdf"),
    ("history", "NIOS315_History_L25_Cold_War_and_Its_Effects.pdf", HIST316 + "25.pdf"),
    ("history", "NIOS315_History_L26_National_Liberation_Movements.pdf", HIST316 + "26.pdf"),
    # Indian Society & Social Issues
    ("society", "NIOS331_Sociology_L24_Unity_and_Diversity.pdf", SOC331 + "l-24_unity_and_diversity.pdf"),
    ("society", "NIOS331_Sociology_L25_National_Integration.pdf", SOC331 + "l-25_national_integration_concept_and_challenge.pdf"),
    ("society", "NIOS331_Sociology_L26_Indian_Society_Tribal_Rural_Urban.pdf", SOC331 + "l-26_indian_society_tribal_rural_and_urban.pdf"),
    ("society", "NIOS331_Sociology_L27_Caste_System_in_India.pdf", SOC331 + "l-27_caste_system_in_india.pdf"),
    ("society", "NIOS331_Sociology_L28_Major_Religious_Communities.pdf", SOC331 + "l-28_major_religious_communities_in_india.pdf"),
    ("society", "NIOS331_Sociology_L29_Major_Social_Problems_of_India.pdf", SOC331 + "l-29_majotr_social_problems_of_india.pdf"),
    ("society", "NIOS331_Sociology_L30_Problems_of_SC_and_ST.pdf", SOC331 + "l-30_problems_of_scheduled_castes_and_schedulesd_tr.pdf"),
    ("society", "NIOS331_Sociology_L31_Other_Deprived_Sections.pdf", SOC331 + "l-31_problems_of_other_deprived_sectios.pdf"),
    ("society", "NIOS331_Sociology_L32_Status_of_Women_Socio_Historical.pdf", SOC331 + "optional_module-1_l-32_status_of_women_in_indian_society_a_socio_histor.pdf"),
    ("society", "NIOS331_Sociology_L33_Gender_Discrimination_and_Equality.pdf", SOC331 + "optional_module-1_l-33_gender_discrimination_and_gender_equality.pdf"),
    ("society", "NIOS331_Sociology_L34_Problems_of_Women.pdf", SOC331 + "optional_module-1_l-34_problems_of_women.pdf"),
    ("society", "NIOS331_Sociology_L35_Women_Empowerment_and_Emancipation.pdf", SOC331 + "optional_module-1_l-35_womens_empowerment_and_emancipation.pdf"),
]

ok = fail = skip = 0
for subdir, name, url in items:
    disk_dir = Path("/app/data") / subdir
    disk_dir.mkdir(parents=True, exist_ok=True)
    dest = disk_dir / name
    rel = f"{subdir}/{name}"
    if dest.exists() and dest.stat().st_size > 3000:
        print("[exists]", rel)
        skip += 1
        continue
    try:
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=180, context=ctx) as r:
            data = r.read()
    except Exception as e:
        print("[fetch FAIL]", rel, repr(e)[:100])
        fail += 1
        continue
    if len(data) < 3000:
        print("[too small]", rel, len(data))
        fail += 1
        continue
    if not data[:5].startswith(b"%PDF"):
        idx = data.find(b"%PDF")
        if idx != -1:
            data = data[idx:]
        else:
            print("[not PDF]", rel, data[:20])
            fail += 1
            continue
    dest.write_bytes(data)
    fh = sha256_hex(dest)
    r2key = rel
    r2_store.upload_r2_object(r2key, str(dest))
    conn = ingest_hybrid.get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO documents (file_hash,file_name,subject_id,status) VALUES (%s,%s,%s,'indexed') "
                "ON CONFLICT (file_hash) DO UPDATE SET file_name=EXCLUDED.file_name,subject_id=EXCLUDED.subject_id,"
                "status='indexed',error_message=NULL,updated_at=NOW()",
                (fh, rel, subdir))
        conn.commit()
    finally:
        ingest_hybrid.release_conn(conn)
    print("[ok]", rel, len(data), "bytes, r2=" + r2key)
    ok += 1

print(f"DONE: ok={ok} fail={fail} skip={skip}")
