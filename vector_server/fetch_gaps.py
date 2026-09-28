"""Batch download official public PDFs, register in documents, upload to R2.

Usage: python /app/fetch_gaps.py
Reads MANIFEST from same directory, downloads each PDF, registers it.
Resumable: skips already-indexed files (documents.status='indexed' AND exists in upsc_chunks).
"""
import os, sys, json, hashlib, time
from pathlib import Path

sys.path.insert(0, "/app")
import ingest_hybrid as ih
import r2_store

DATA = Path("/app/data")

MANIFEST = [
    # ── GS2: Social Justice ──
    {"url": "https://www.dhsprogram.com/pubs/pdf/OF43/India_National_Fact_Sheet.pdf",
     "subject": "social-justice", "name": "NFHS5_India_National_Fact_Sheet.pdf"},
    {"url": "https://mospi.gov.in/sites/default/files/publication_reports/AR_PLFS_2022_23N.pdf",
     "subject": "social-justice", "name": "PLFS_2022-23_AnnualReport.pdf"},
    {"url": "https://socialjustice.gov.in/writereaddata/UploadFile/32691723633555.pdf",
     "subject": "social-justice", "name": "MSJE_AnnualReport_2023-24.pdf"},

    # ── GS2: International Relations ──
    {"url": "https://www.mea.gov.in/Uploads/PublicationDocs/36286_MEA_Annual_Report_2022_English_web.pdf",
     "subject": "international-relations", "name": "MEA_AnnualReport_2022-23.pdf"},
    {"url": "https://mealib.nic.in/?pdf18867?000",
     "subject": "international-relations", "name": "MEA_AnnualReport_2023-24.pdf"},

    # ── GS3: Agriculture ──
    {"url": "https://agcensus.da.gov.in/document/agcen1516/ac_1516_report_final-220221.pdf",
     "subject": "agriculture", "name": "AgriculturalCensus_AllIndia_2015-16.pdf"},
    {"url": "https://dfpd.gov.in/WriteReadData/AnnualRecordUploadDocuments/b9c640b8-5889-4ffd-a62d-5b56c5d4f029_Food%20AR%202024-25%20English%20small%20size.pdf",
     "subject": "agriculture", "name": "DFPD_AnnualReport_2024-25.pdf"},
    {"url": "https://pmkisan.gov.in/Documents/OPERATIONAL%20GUIDELINES.pdf",
     "subject": "agriculture", "name": "PMKISAN_OperationalGuidelines_2019.pdf"},
    {"url": "https://www.agriwelfare.gov.in/Documents/AR_Eng_2024_25.pdf",
     "subject": "agriculture", "name": "DAFW_AnnualReport_2024-25.pdf"},
    {"url": "https://agriwelfare.gov.in/Documents/operational_guidelines_pmfby_2023.pdf",
     "subject": "agriculture", "name": "PMFBY_OperationalGuidelines_2023.pdf"},
    {"url": "https://agriwelfare.gov.in/sites/default/files/NCF3%20(1).pdf",
     "subject": "agriculture", "name": "SwaminathanCommission_NCF3_2006.pdf"},

    # ── GS3: Science & Technology ──
    {"url": "https://dbt.gov.in/storage/media/report/DBT%20Annual%20Report%202024-25.pdf",
     "subject": "science-tech", "name": "DBT_AnnualReport_2024-25.pdf"},
    {"url": "https://nhsrcindia.org/sites/default/files/2021-07/National%20Health%20Policy%202017%20(English)%20.pdf",
     "subject": "science-tech", "name": "NationalHealthPolicy_2017.pdf"},
    {"url": "https://www.drdo.gov.in/drdo/sites/default/files/publication-document/TF_MarApr2026.pdf",
     "subject": "science-tech", "name": "DRDO_TechnologyFocus_2026.pdf"},
    {"url": "https://www.niti.gov.in/sites/default/files/2023-03/National-Strategy-for-Artificial-Intelligence.pdf",
     "subject": "science-tech", "name": "NITI_NationalAIStrategy_2018.pdf"},

    # ── GS3: Environment ──
    {"url": "https://moef.gov.in/uploads/2023/05/Annual-Report-English-2023-24.pdf",
     "subject": "environment", "name": "MoEFCC_AnnualReport_2023-24.pdf"},
    {"url": "https://fsi.nic.in/uploads/isfr2023/isfr_book_eng-vol-1_2023.pdf",
     "subject": "environment", "name": "India_StateofForestReport_2023_Vol1.pdf"},
    {"url": "https://unfccc.int/sites/default/files/NDC/2022-08/India%20Updated%20First%20Nationally%20Determined%20Contrib.pdf",
     "subject": "environment", "name": "India_UpdatedFirstNDC_2022.pdf"},
    {"url": "https://prana.cpcb.gov.in/ncapDashboard/download_public_portal_file/NCAP_Report.pdf",
     "subject": "environment", "name": "NationalCleanAirProgramme_2019.pdf"},
    {"url": "https://ntca.gov.in/assets/uploads/Reports/Others/Wildlife_Action_Plan_2017_31.pdf",
     "subject": "environment", "name": "NationalWildlifeActionPlan_2017-31.pdf"},
    {"url": "http://nbaindia.org/uploaded/Biodiversityindia/NBAP.pdf",
     "subject": "environment", "name": "NationalBiodiversityActionPlan_2008.pdf"},
]


def sha256_hex(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def is_indexed(fh):
    c = ih.get_conn()
    try:
        with c.cursor() as cur:
            cur.execute("SELECT 1 FROM upsc_chunks WHERE file_hash=%s LIMIT 1", (fh,))
            return cur.fetchone() is not None
    finally:
        ih.release_conn(c)


def register_doc(file_name, subject_id, fh):
    c = ih.get_conn()
    try:
        with c.cursor() as cur:
            cur.execute("""
                INSERT INTO documents (file_hash, file_name, subject_id, status)
                VALUES (%s, %s, %s, 'indexed')
                ON CONFLICT (file_hash) DO UPDATE SET
                    file_name=EXCLUDED.file_name, subject_id=EXCLUDED.subject_id, status=EXCLUDED.status
            """, (fh, file_name, subject_id))
        c.commit()
    finally:
        ih.release_conn(c)


def download_and_register(entry):
    url = entry["url"]
    subject = entry["subject"]
    name = entry["name"]
    dest_dir = DATA / subject
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / name
    file_name = f"{subject}/{name}"

    if dest.exists() and dest.stat().st_size > 1000:
        fh = sha256_hex(dest)
        if is_indexed(fh):
            return {"status": "skip", "file": file_name, "reason": "already indexed"}
    else:
        import requests as req
        try:
            r = req.get(url, timeout=120, stream=True, headers={"User-Agent": "Mozilla/5.0"})
            r.raise_for_status()
            with open(dest, "wb") as f:
                for chunk in r.iter_content(65536):
                    f.write(chunk)
            print(f"  downloaded {dest.name} ({dest.stat().st_size/1024:.0f}KB)", flush=True)
        except Exception as e:
            return {"status": "error", "file": file_name, "reason": str(e)[:200]}
        fh = sha256_hex(dest)

    if is_indexed(fh):
        return {"status": "skip", "file": file_name, "reason": "already indexed"}

    register_doc(file_name, subject, fh)
    try:
        key = r2_store.build_key(subject, name)
        r2_store.upload_r2_object(key, str(dest))
        print(f"  r2 uploaded: {key}", flush=True)
    except Exception as e:
        print(f"  r2 warn: {e}", flush=True)
    return {"status": "registered", "file": file_name, "hash": fh[:16]}


def main():
    ok = skip = err = 0
    t0 = time.time()
    for i, entry in enumerate(MANIFEST):
        print(f"[{i+1}/{len(MANIFEST)}] {entry['subject']}/{entry['name']}", flush=True)
        result = download_and_register(entry)
        st = result["status"]
        if st == "registered":
            ok += 1
            print(f"  -> registered ({result.get('hash','')})", flush=True)
        elif st == "skip":
            skip += 1
            print(f"  -> skip: {result['reason']}", flush=True)
        else:
            err += 1
            print(f"  -> ERROR: {result['reason']}", flush=True)
    print(f"\nDONE registered={ok} skipped={skip} errors={err} elapsed={time.time()-t0:.0f}s", flush=True)
    print("Next: run chunk_persistent.py to chunk the new files, then backfill for embeddings.", flush=True)


if __name__ == "__main__":
    main()