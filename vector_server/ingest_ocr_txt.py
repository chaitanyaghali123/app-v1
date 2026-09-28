from pathlib import Path
import ingest_hybrid as ih

DATA_DIR = Path("/app/data")
FOLDERS = ["gs1", "gs2", "gs3", "essay"]

def main():
    ih.root_folder = DATA_DIR
    ih.ensure_tables()
    files = []
    for folder in FOLDERS:
        d = DATA_DIR / folder
        if not d.exists():
            continue
        for f in sorted(d.glob("*.ocr.txt")):
            if f.name.startswith(("UPSC_GS", "UPSC_Essay_PYP")):
                files.append(f)
    print(f"txt to ingest: {len(files)}", flush=True)
    for i, f in enumerate(files, 1):
        try:
            ih.process_file(f)
            print(f"[ingested] {f.name}", flush=True)
        except Exception as e:
            print(f"[err] {f.name}: {type(e).__name__}: {e}", flush=True)
        if i % 4 == 0:
            print(f"  progress {i}/{len(files)}", flush=True)
    print("INGEST DONE", flush=True)

if __name__ == "__main__":
    main()