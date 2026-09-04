"""
Fetch GS4 gap-fill documents:
  - CCS Conduct Rules 1964 (official DoPT PDF) -> ethics
  - UPSC GS4 Mains Question Papers 2013-2025 -> ethics (case-study material)
  - BPAC-108 full course (Citizen-Admin interface, Social Welfare) -> ethics

Run inside the aryabhata-ingestor container:
    python /app/download_gs4_gaps.py
"""

import hashlib
import os
import ssl
import sys
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, "/app")
os.environ.setdefault("R2_PREFIX", "")
import r2_store
import ingest_hybrid

SUBJECT_ID = "ethics"
DISK_DIR = Path("/app/data/ethics") / SUBJECT_ID
DISK_DIR.mkdir(parents=True, exist_ok=True)

ctx = ssl._create_unverified_context()
UA = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/120 Safari/537.36"
}

# (filename, url) direct-download list
DIRECT = [
    ("CCS_Conduct_Rules_1964.pdf",
     "https://dopt.gov.in/sites/default/files/CCS_Conduct_Rules_1964_Updated_27Feb15_0.pdf"),
    ("UPSC_GS4_PYP_2026.pdf",
     "https://upsc.gov.in/sites/default/files/QP-CSM-26-010926-GENERAL-STUDIES-PAPER-IV.pdf"),
    ("UPSC_GS4_PYP_2025.pdf",
     "https://upsc.gov.in/sites/default/files/GENERAL-STUDIES-PAPER-IV-QP-CSM-25-010925.pdf"),
    ("UPSC_GS4_PYP_2024.pdf",
     "https://upsc.gov.in/sites/default/files/QP_CSM_2024_GenStud_IV_03102024.pdf"),
    ("UPSC_GS4_PYP_2023.pdf",
     "https://upsc.gov.in/sites/default/files/QP-CSM-23-GENERAL-STUDIES-PAPER-IV-180923.pdf"),
    ("UPSC_GS4_PYP_2022.pdf",
     "https://upsc.gov.in/sites/default/files/QP-CSM-22-GENERAL-STUDIES-PAPER%20IV-190922.pdf"),
    ("UPSC_GS4_PYP_2021.pdf",
     "https://upsc.gov.in/sites/default/files/QP-CSM-21-GENSTUDIESPAPER-IV-110122.pdf"),
    ("UPSC_GS4_PYP_2020.pdf",
     "https://upsc.gov.in/sites/default/files/Gen_St_P4.pdf"),
    ("UPSC_GS4_PYP_2019.pdf",
     "https://upsc.gov.in/sites/default/files/QP-CSM19-GeneralStudies-IV.pdf"),
    ("UPSC_GS4_PYP_2013.pdf",
     "https://www.iaspcsprep.com/wp-content/uploads/2024/02/UPSC-GS-4-Mains-Paper-2013.pdf"),
    ("UPSC_GS4_PYP_2014.pdf",
     "https://www.iaspcsprep.com/wp-content/uploads/2024/02/UPSC-GS-4-Mains-Paper-2014.pdf"),
    ("UPSC_GS4_PYP_2015.pdf",
     "https://www.iaspcsprep.com/wp-content/uploads/2024/02/UPSC-GS-4-Mains-Paper-2015.pdf"),
    ("UPSC_GS4_PYP_2016.pdf",
     "https://www.iaspcsprep.com/wp-content/uploads/2024/02/UPSC-GS-4-Mains-Paper-2016.pdf"),
    ("UPSC_GS4_PYP_2017.pdf",
     "https://www.iaspcsprep.com/wp-content/uploads/2024/02/UPSC-GS-4-Mains-Paper-2017.pdf"),
    ("UPSC_GS4_PYP_2018.pdf",
     "https://www.iaspcsprep.com/wp-content/uploads/2024/02/UPSC-GS-4-Mains-Paper-2018.pdf"),
]


def sha256_hex(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def register(local, conn):
    fh = sha256_hex(local)
    rel = f"{SUBJECT_ID}/{local.name}"
    key = f"gs4/{SUBJECT_ID}/{local.name}"
    try:
        r2_store.upload_r2_object(key, str(local))
    except Exception as exc:
        print("  R2 FAIL", key, exc)
        return
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO documents (file_hash, file_name, subject_id, status, error_message)
            VALUES (%s, %s, %s, 'indexed', NULL)
            ON CONFLICT (file_hash)
            DO UPDATE SET file_name=EXCLUDED.file_name,
                          subject_id=EXCLUDED.subject_id,
                          status='indexed',
                          error_message=NULL,
                          updated_at=NOW()
            """,
            (fh, rel, SUBJECT_ID),
        )
    conn.commit()


def fetch(url, retries=5):
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=120, context=ctx) as r:
                return r.read()
        except Exception as e:
            print(f"  attempt {i+1} fail: {e}")
            if i == retries - 1:
                return None
            time.sleep(min(2 * (i + 1), 10))
    return None


def main():
    conn = ingest_hybrid.get_conn()
    ok = fail = 0
    for name, url in DIRECT:
        dest = DISK_DIR / name
        if dest.exists() and dest.stat().st_size > 3000:
            register(dest, conn)
            print(f"  exists (re-registered): {name}")
            ok += 1
            continue
        print(f"  fetching {name} ...")
        data = fetch(url)
        if data and len(data) > 3000:
            d = data
            if not d[:5].startswith(b"%PDF"):
                idx = d.find(b"%PDF")
                if idx != -1:
                    d = d[idx:]
            if not d[:5].startswith(b"%PDF"):
                print(f"  FAIL (not PDF): {name} first bytes={d[:20]!r}")
                fail += 1
                continue
            dest.write_bytes(d)
            register(dest, conn)
            print(f"  saved+registered: {name} ({len(d)} bytes)")
            ok += 1
        else:
            print(f"  FAIL: {name} ({len(data) if data else 0} bytes)")
            fail += 1
        time.sleep(1)
    ingest_hybrid.release_conn(conn)
    print(f"\nTOTAL: {ok} ok, {fail} failed")


if __name__ == "__main__":
    main()
