"""
Fetch BPAC-108 "Public Policy and Administration in India" from eGyanKosh for
GS4 ethics (Citizen's Charter, Sevottam, service delivery, social welfare /
weaker sections). Registers under subject_id='ethics'.

Run inside the aryabhata-ingestor container:
    python /app/fetch_bpac108.py
"""

import os
import sys
import time

sys.path.insert(0, "/app")
os.environ.setdefault("R2_PREFIX", "")

import download_gs4_ethics as dg
from download_gs4_ethics import GS4Scraper

HANDLE = "123456789/76719"
CODE = "BPAC-108"

# skip set already includes shared parents via download_gs4_ethics
# add sibling handles to avoid crawling entire PA programme


def main():
    scraper = GS4Scraper(CODE, HANDLE)
    # BPAC-108 is large; raise per-course cap
    scraper.MAX_FILES = 60
    n = scraper.scrape()
    print(f"\nBPAC-108 files: {n}")


if __name__ == "__main__":
    # override max files
    import download_gs4_ethics
    download_gs4_ethics.MAX_FILES_PER_COURSE = 60
    main()
