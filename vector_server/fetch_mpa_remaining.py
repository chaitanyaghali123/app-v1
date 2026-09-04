"""
Fetch MPA-016 (Decentralisation & Local Governance), MPA-017 (Electronic Governance),
and MPA-018 (Disaster Management) using the community-walk from download_pa_optional_mpa.py.

Run inside the aryabhata-ingestor container:
    python /app/fetch_mpa_remaining.py
"""

import os
import sys
import time
from pathlib import Path

sys.path.insert(0, "/app")
os.environ.setdefault("R2_PREFIX", "")

import download_pa_optional_mpa as mpam
from download_pa_optional_mpa import PAcraper

# Block shared parent handles to avoid crawling huge trees
mpam.SKIP.update({"1757"})

COURSES = [
    ("MPA-016", "123456789/25227"),
    ("MPA-017", "123456789/25230"),
    ("MPA-018", "123456789/25233"),
]


class ThrottledPAcraper(PAcraper):
    def download_bitstream(self, url, name, hid):
        super().download_bitstream(url, name, hid)
        time.sleep(1.5)

    def walk(self, hid, depth=0, maxdepth=2, visited=None):
        time.sleep(1)
        super().walk(hid, depth, maxdepth, visited)


def main():
    total = 0
    for code, handle in COURSES:
        try:
            p = ThrottledPAcraper(code, handle)
            n = p.scrape()
            print(f"  {code}: {n} files", flush=True)
            total += n
        except Exception as exc:
            print(f"  ERROR {code}: {exc}", flush=True)
    print(f"\nTOTAL new files: {total}")


if __name__ == "__main__":
    main()
