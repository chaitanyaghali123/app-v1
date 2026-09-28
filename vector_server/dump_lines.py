lines = open("ingest_hybrid.py", encoding="utf-8-sig").read().splitlines()
for i in range(2613, 2665):
    ln = lines[i]
    print(f"{i+1}: '\\t'={ln.count(chr(9))} ' '={len(ln) - len(ln.lstrip())} |{ln}|")