import sys
from pathlib import Path
sys.path.insert(0, "/app")
import ingest_hybrid as IH

FILES = [
 ("geography", "/app/data/geography/NCERT_Class11_PlateTectonics_DistributionOfOceans_kegy204.pdf"),
 ("geography", "/app/data/geography/NCERT_Class11_LandformsAndTheirEvolution_kegy207.pdf"),
 ("geography", "/app/data/geography/NCERT_Class11_AtmosphericCirculationAndWeatherSystems_kegy210.pdf"),
 ("geography", "/app/data/geography/NCERT_Class12_PrimaryActivities_legy105.pdf"),
 ("geography", "/app/data/geography/NCERT_Class12_SecondaryActivities_legy106.pdf"),
 ("geography", "/app/data/geography/NCERT_Class12_TertiaryAndQuaternaryActivities_legy107.pdf"),
 ("geography", "/app/data/geography/NCERT_Class12_LandResourcesAndAgriculture_legy205.pdf"),
 ("geography", "/app/data/geography/NCERT_Class12_WaterResources_legy206.pdf"),
 ("geography", "/app/data/geography/NCERT_Class12_MineralAndEnergyResources_legy207.pdf"),
 ("geography", "/app/data/geography/NCERT_Class12_ManufacturingIndustries_legy208.pdf"),
 ("social-justice", "/app/data/social-justice/NITI_MPI_2023_ProgressReview.pdf"),
 ("economy", "/app/data/economy/NIP_Report_Vol1_2020.pdf"),
 ("science-tech", "/app/data/science-tech/DPIIT_National_IPR_Policy_2016.pdf"),
 ("essay", "/app/data/essay/Bhagavad_Gita_Arnold.txt"),
]
for subj, path in FILES:
    print("=" * 70, flush=True)
    print("PROCESSING", subj, Path(path).name, flush=True)
    try:
        IH.process_file(Path(path), subject_id=subj)
        print("DONE", subj, flush=True)
    except Exception as e:
        print("ERROR", subj, repr(e)[:300], flush=True)