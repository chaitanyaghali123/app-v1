import os, time
import ingest_hybrid as I

print("=== classify_source ===")
cases = [
    "history/NCERT_Class9_India_and_the_Contemporary_World_I.pdf",
    "ethics/MPY-001_123456789_Unit-1.pdf",
    "ethics/MPYE-002_123456789-34874_Unit-2.pdf",
    "ethics/BPCS-183_123456789-69776_Block-1.pdf",
    "books/Laxmikanth_Polity.pdf",
    "constitution/Constitution_of_India_2020_Full_Text.pdf",
    "economy/Economic_Survey_2025-26_Complete.pdf",
]
for c in cases:
    print(f"  {c} -> {I.classify_source(c)}")

print("=== abstract_one graceful behavior ===")
t0 = time.time()
r = I.abstract_one("Define federalism in a short paragraph.")
print(f"  result type: {type(r).__name__}, value: {str(r)[:80]!r}, in {round(time.time()-t0,1)}s")