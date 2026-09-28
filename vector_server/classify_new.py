import sys
sys.path.insert(0, "/app")
import ingest_hybrid as IH

names = [
 "NCERT_Class12_MineralEnergyResources_legy207.pdf",
 "NITI_MPI_2023_ProgressReview.pdf",
 "NIP_Report_Vol1_2020.pdf",
 "DPIIT_National_IPR_Policy_2016.pdf",
 "Bhagavad_Gita_Arnold.txt",
 "NCERT_Class11_PlateTectonics_kegy204.pdf",
]
for n in names:
    print(f"{n:52} -> {IH.classify_source(n)}")