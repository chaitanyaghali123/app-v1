import sys
from pathlib import Path
sys.path.insert(0, "/app")
import r2_store as R
import ingest_hybrid as IH

SRC = Path("/app/tmp_sources")

UPLOADS = [
 ("gs1/geography/NCERT_Class11_PlateTectonics_DistributionOfOceans_kegy204.pdf", "NCERT-c11-l234.pdf"),
 ("gs1/geography/NCERT_Class11_LandformsAndTheirEvolution_kegy207.pdf", "NCERT-c11-landform.pdf"),
 ("gs1/geography/NCERT_Class11_AtmosphericCirculationAndWeatherSystems_kegy210.pdf", "NCERT-c11-atm-circ.pdf"),
 ("gs1/geography/NCERT_Class12_PrimaryActivities_legy105.pdf", "NCERT-c12-primary.pdf"),
 ("gs1/geography/NCERT_Class12_SecondaryActivities_legy106.pdf", "NCERT-c12-secondary.pdf"),
 ("gs1/geography/NCERT_Class12_TertiaryAndQuaternaryActivities_legy107.pdf", "NCERT-c12-tertiary.pdf"),
 ("gs1/geography/NCERT_Class12_LandResourcesAndAgriculture_legy205.pdf", "NCERT-c12-land-agri.pdf"),
 ("gs1/geography/NCERT_Class12_WaterResources_legy206.pdf", "NCERT-c12-water.pdf"),
 ("gs1/geography/NCERT_Class12_MineralAndEnergyResources_legy207.pdf", "NCERT-c12-minerals.pdf"),
 ("gs1/geography/NCERT_Class12_ManufacturingIndustries_legy208.pdf", "NCERT-c12-industries.pdf"),
 ("gs2/social-justice/NITI_MPI_2023_ProgressReview.pdf", "NITI-MPI-2023.pdf"),
 ("gs3/economy/NIP_Report_Vol1_2020.pdf", "NIP-Vol1-PIB.pdf"),
 ("gs3/science-tech/DPIIT_National_IPR_Policy_2016.pdf", "DPIIT-IPR-Policy-2016.pdf"),
 ("essay/Bhagavad_Gita_Arnold.txt", "Gita-2388.txt"),
]

# 1) upload to R2
for key, fname in UPLOADS:
    src = SRC / fname
    if not src.exists():
        print("MISSING LOCAL:", fname)
        continue
    R.upload_r2_object(key, str(src))
    print("UPLOADED", key)

# 2) targeted sync: fetch the new rels into /app/data, update manifest
DATA = Path("/app/data")
objs = R.list_r2_objects()
manifest = R._load_manifest(DATA)
for key, fname in UPLOADS:
    parts = key.split("/")
    rel = "/".join(parts[1:]) if len(parts) == 3 else key
    meta = objs.get(rel)
    if not meta:
        print("NOT IN R2 LIST:", rel)
        continue
    local = DATA / rel
    if not local.exists():
        R.download_r2_object(meta["key"], local)
        print("SYNCED", rel)
    manifest[rel] = meta["etag"]
R._save_manifest(DATA, manifest)
print("manifest entries:", len(manifest))