import ast, sys
try:
    src = open("ingest_hybrid.py", encoding="utf-8-sig").read()
    ast.parse(src)
    print("SYNTAX OK")
except SyntaxError as e:
    print("SYNTAX FAIL:", e)
    sys.exit(1)

try:
    import ingest_hybrid as I
    print("IMPORT OK")
    print("gate enabled:", I.ENABLE_SOURCE_SAFETY_GATE)
    print("classify NCERT_Class9:", I.classify_source("history/NCERT_Class9.pdf"))
    print("classify IGNOU MPY:", I.classify_source("ethics/MPY-001_Unit-1.pdf"))
    print("classify commercial:", I.classify_source("books/Laxmikanth.pdf"))
    print("classify MEA report:", I.classify_source("MEA_Annual_Report_2024.pdf"))
    print("classify weird:", I.classify_source("random/foo.pdf"))
except Exception as e:
    print("IMPORT FAIL:", type(e).__name__, e)
    sys.exit(1)