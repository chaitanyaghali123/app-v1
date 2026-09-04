"""
Gap-fill for Geography Optional: ingest the IGNOU MScGG courses that cover the
models/theory AND contemporary-India gaps identified in the Geography Optional
syllabus audit. Reuses the GeogScraper from download_geography_optional_mgg.py.

Added courses (eGyanKosh, open-access, legally redistributable IGNOU SLM):
  - MGG-006 Economic Geography        (Weber, Von Thunen, Christaller,
                                        Perroux growth pole, Rostow stages)
  - MGG-007 Environmental Geography
  - MGG-010 Urban Geography            (urban models, Losch)
  - MGGE-003 Natural Hazards and Disaster Management (Paper 2 contemporary)
  - MGGE-004 Hydrology and Water Resources          (river interlinking)

Run inside the aryabhata-ingestor container:
    python /app/download_geography_optional_gap.py
"""

import os
import sys

sys.path.insert(0, "/app")
os.environ.setdefault("R2_PREFIX", "")
import r2_store
import ingest_hybrid
from download_geography_optional_mgg import GeogScraper
from pathlib import Path

# (course_code, handle)
COURSES = [
    ("MGG-006", "123456789/103139"),
    ("MGG-007", "123456789/102616"),
    ("MGG-010", "123456789/102651"),
    ("MGGE-003", "123456789/113849"),
    ("MGGE-004", "123456789/112666"),
]

# Add the course handles being targeted to SKIP is done inside GeogScraper's
# module global; but to avoid cross-walk into siblings we set them here.
import download_geography_optional_mgg as _mgg
# Sibling handles to never descend into (all MSCGG courses + meta)
for _c, _h in COURSES:
    _mgg.SKIP.add(_h.split('/')[-1])
for _h in ["98159", "98160", "102615", "109915", "111395",
           "98161", "98350", "98394", "100008", "98297", "98945",
           "102660", "102616", "102651", "103139", "105797",
           "109916", "112553", "110204", "124214", "115216",
           "114195", "113858", "113849", "112666", "115218", "111396"]:
    _mgg.SKIP.add(_h)


def main():
    SUBJECT = _mgg.SUBJECT
    BASE = _mgg.BASE
    BASE.mkdir(parents=True, exist_ok=True)
    total = 0
    for code, handle in COURSES:
        try:
            total += GeogScraper(code, handle).scrape()
        except Exception as exc:
            print("ERROR", code, exc, flush=True)

    try:
        remote = r2_store.list_r2_objects()
        manifest = {}
        for rel, meta in remote.items():
            manifest[rel] = meta["etag"]
        Path("/app/data/.r2_manifest.json").write_text(
            __import__("json").dumps(manifest, indent=2), encoding="utf-8")
        print("manifest updated")
    except Exception as exc:
        print("manifest skip", exc)

    print("\nTOTAL files:", total)


if __name__ == "__main__":
    main()
