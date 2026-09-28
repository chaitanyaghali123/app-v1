import fitz
import subprocess

for path in [
    "/app/data/gs3/UPSC_GS3_PYP_2024.pdf",
    "/app/data/gs1/UPSC_GS1_PYP_2019.pdf",
    "/app/data/essay/UPSC_Essay_PYP_2023.pdf",
    "/app/data/ethics/ethics/UPSC_GS4_PYP_2024.pdf",
]:
    try:
        d = fitz.open(path)
        text = "".join(p.get_text() for p in d)
        print(path, "pages=%d textchars=%d" % (d.page_count, len(text.strip())))
        if text.strip():
            print("   sample:", " | ".join(text.splitlines()[1:4]))
    except Exception as e:
        print(path, "ERR", e)

print("tesseract:", subprocess.run(["which", "tesseract"], capture_output=True, text=True).stdout.strip())