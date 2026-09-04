"""
Ingest IGNOU MSW/MSWE courses for the Sociology Optional Paper-2 gap-fill on
social movements & marginal groups (user selected this option). Reuses the
proven SoScraper from download_sociology_optional_mso.py; files land in the
same sociology-optional mirror/DB subject.

Added courses (eGyanKosh, open-access, legally redistributable IGNOU SLM,
revised MSW series which exposes full block-unit structure):
  - MSW-004 Social Work and Social Development (revised; Block-1 Social
    Dynamics & Change, Block-2 Concepts of Development, Block-3 Development:
    Human Rights Perspective, Block-4 Social Legislations)  [Paper-2 gaps:
    visions of social change, planning, land reforms, development strategies]
  - MSW-002 Professional Social Work: Indian Perspectives (revised; Indian
    social realities, marginal groups)
  - MSW-003 Basic Social Science Concepts (revised; sociological grounding)
  - MSWE-002 Women and Child Development (revised; status of women, marginal
    groups, development initiatives)  [Paper-2 marginal groups]

Run inside the aryabhata-ingestor container:
    python /app/download_sociology_optional_msw.py
"""

import os
import sys

sys.path.insert(0, "/app")
os.environ.setdefault("R2_PREFIX", "")
import download_sociology_optional_mso as _mso

_subj = _mso.SUBJECT
_mso.BASE = _mso.Path("/app/data/optional") / _subj

# course_code, eGyanKosh handle  (revised MSW = full block→unit structure)
MSW_COURSES = [
    ("MSW-004", "123456789/118418"),  # Social Work and Social Development
    ("MSW-002", "123456789/118345"),  # Professional Social Work: Indian Perspectives
    ("MSW-003", "123456789/118373"),  # Basic Social Science Concepts
    ("MSWE-002", "123456789/58818"),  # Women and Child Development
]

# Never descend into these sibling/meta handles
for _c, _h in MSW_COURSES:
    _mso.SKIP.add(_h.split('/')[-1])
_mso.SKIP.update({
    "2369", "51691", "51692", "51739", "51740", "51979", "51980", "51981",
    "51983", "51989", "51991", "51992", "51993", "52003", "53518", "58694",
    "58703", "58781", "58786", "58685", "58950", "51994", "51995", "51998",
    "51999", "52000", "52001", "52002", "59007", "59047", "59051", "60253",
    "118556", "51732", "51735", "91028", "1", "26", "1641", "1644", "1645",
    "1749", "57585",
})


def main():
    _mso.BASE.mkdir(parents=True, exist_ok=True)
    total = 0
    for code, handle in MSW_COURSES:
        try:
            total += _mso.SoScraper(code, handle).scrape()
        except Exception as exc:
            print('  ERROR', code, handle, exc, flush=True)
    print("\nTOTAL files:", total)


if __name__ == "__main__":
    main()