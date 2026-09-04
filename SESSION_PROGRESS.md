# Session Progress — Essay Sources, Optional Source Material, PYQ Sort

## Objective
- Convert UPSC Mains Essay Source Material from raw `.txt` to PDFs and grow the corpus to match the 4-layer essay RAG spec (philosophy, policy, evidence, quotes/execution) — "the same way" gs1–4 present PDFs.
- Wire optional-subject Source Material end-to-end (UI + backend + data), mirroring the essay pattern.

## Completed
- [x] Essay `.txt` → PDF conversion (`vector_server/essay_txt_to_pdf.py`): 10 sources converted, uploaded to R2, registered in `documents`, old `.txt` removed.
- [x] Added 4 official Economic Survey 2024-25 chapter PDFs (`download_essay_official.py`) — Preface, Ch.1 StateOfEconomy, Ch.9 Agriculture, Ch.11 SocialSector.
- [x] Added 3 Indian-thought Gutenberg PDFs (`download_essay_indian.py`) — Tagore *Nationalism*, Gandhi *Hind Swaraj*, Vivekananda *Jnana Yoga Pt II*.
- [x] `/api/sources/essay` live: 17 PDFs, correct `essay/essay/<file>.pdf` r2_keys, file streaming returns `application/pdf`.
- [x] Expanded essay quotes KB (`essay_quotes_content.py`): 31 → 196 QUOTEs across 16 themes.
- [x] Re-seeded `essay_knowledge_base` (`seed_all(embed=False)` → SEEDED 213): QUOTE=196, ANECDOTE=11, FRAMEWORK=6.
- [x] Optional Source Material data: registered 411 optional PDFs in `documents` via `vector_server/register_optional_sources.py` — history-optional 51, geography-optional 44, public-administration-optional 60, sociology-optional 89, political-science-optional 80, philosophy-optional 61.
- [x] Backend: `server/routes/source.routes.js` — added 6 optional ids to `VALID_PAPERS`.
- [x] Backend: `server/services/source.service.js` — `GS_PAPER_SUBJECTS[optional]=[id]`, `SUBJECT_DISPLAY` names, `SUBJECT_TO_GS[optional]="optional"` (R2 key = `optional/<subject>/<file>`).
- [x] Frontend: `App.tsx` (~line 752) — "Show Source Material" button now renders for optionals (`|| isOptionalSubject(activeSubject.id)`).
- [x] Verified `GET /api/sources/{each-optional}` returns 200 with grouped subjects; file streaming returns `application/pdf`.
- [x] PYQ sort fix: `server/services/upscPyq.service.js` — refresh path `ORDER BY year DESC` → `ORDER BY year DESC NULLS LAST` (Postgres `DESC` defaults to `NULLS FIRST`, pushing "Older" rows to top). Verified API now returns 2025 → 2019 → Older.
- [x] History Optional gap-fill: added 4 public-domain Old NCERT / DLI books (R.S. Sharma Ancient, Satish Chandra Medieval, Bipan Chandra Modern, Arjun Dev World/Story of Civilization Vol II) via `vector_server/download_history_optional_books.py` — downloaded→R2→registered. history-optional: 51 → 55 files.
- [x] Geography Optional expansion: added 6 IGNOU MScGG (Master's-in-Geography) courses from eGyanKosh via `vector_server/download_geography_optional_mgg.py` — 105 MGG files (MGG-001 Geographical Thought 9, MGG-002 Geomorphology 22, MGG-003 Regional Geography of India 21, MGG-004 Population & Settlement 20, MGG-005 Climatology 24, MGG-008 Advances in Geographical Thought 9). geography-optional: 44 → 149 files. Verified streaming `application/pdf`.
- [x] Public Administration Optional expansion (user: BPAC/EPA+2nd ARC insufficient for optional depth): added IGNOU MPA (Master of Arts in Public Admin) series from eGyanKosh via `vector_server/download_pa_optional_mpa.py` — **94 MPA files registered** so far: MPA-011 State/Society/Public Admin (20 units), MPA-012 Administrative Theory (20; thinkers Taylor/Fayol/Weber/Barnard/Simon/Argyris/McGregor/Likert; NPA/NPM/Public Choice/Critical Theory), MPA-013 Public Systems Management (20; PERT/CPM/O&M), MPA-014 HRM (20), plus MPA-015 Public Policy & Analysis (14/20; Dror/Lindblom/Riggs — 6 units pending). public-administration-optional: 60 → 154 files. Verified streaming `application/pdf`.
- [x] MPA programme handles (eGyanKosh `123456789/4895` → 1st yr `4896`/2nd yr `4897`): MPA-011 `25201`, MPA-012 `25205`, MPA-013 `25209`, MPA-014 `25214`, MPA-015 `25224`, MPA-016 `25227`, MPA-017 `25230`, MPA-018 `25233`.
- [x] Public Admin manifest-driven gap-fill (user supplied full eGyanKosh item-handle index BPAC-131/EPA-01/04/05/MPA-011-016/MPAG-001): new `vector_server/download_pa_optional_manifest.py` fetches each item handle's PDF bitstream directly (far more reliable than community traversal that was throttling). Completed MPA-015 to **30 files** (the 6 missing units 4,12,13,16,17,20 now filled) + EPA-01 (22), MPA-016 (5), MPAG-001 (2), plus block-level PDFs aggregated for BPAC-131/EPA-04/05/MPA-011-014. Fixed a connection-pool exhaustion bug (moved to one shared conn), survived one container OOM from a 79MB block (idempotent resume). public-administration-optional: 154 → **287 files**. Verified streaming `application/pdf`.
- [x] Sociology Optional expansion (user: ESO-11/12/13 + partial MSO insufficient): added IGNOU MSO (MA Sociology) + MSOE electives from eGyanKosh via `vector_server/download_sociology_optional_mso.py` — **251 new files registered**; sociology-optional: 89 → **309**. MSO-001 Sociological Theories (39; Marx/Durkheim/Weber/Parsons/Merton/Mead), MSO-002 Research Methodologies (35; positivism/qual-quant/sampling), MSO-003 Sociology of Development (35; dependency Frank/Wallerstein, modernization, sustainable dev), MSO-004 Sociology in India (35; Ghurye/Srinivas/AR Desai/Dumont/Ambedkar, village/caste), MSOE-001 Education (30), MSOE-002 Diaspora (24), MSOE-003 Religion (26), MSOE-004 Urban (27). Verified streaming `application/pdf`.
- [x] MSO programme handles (eGyanKosh `123456789/4320` → 1st yr `4322`/2nd yr `4324`): MSO-001 `4326`, MSO-002 `4340`, MSO-003 `4358`, MSO-004 `4368`, MSOE-001 `4383`, MSOE-002 `4394`, MSOE-003 `4403`, MSOE-004 `4418`.
- [x] PSIR/Political Science Optional expansion (user: BPSE/EPS undergrad insufficient): added IGNOU MPS/MPSE (MA Political Science) from eGyanKosh via `vector_server/download_psir_optional_mps.py` — **168 new files**; political-science-optional: 80 → **248**. MPS-001 Political Theory (29; State/Justice/Equality/Rights/Democracy; Liberalism/Marxism/Fascism/Feminism/Multiculturalism), MPS-002 International Relations: Theory & Problems (35; Realism/Liberalism/System theory/Hegemony/UN), MPS-003 India: Democracy & Development (27), MPS-004 Comparative Politics (30), MPSE-001 India & the World (17; foreign policy/bilateral), MPSE-003 Western Political Thought Plato-to-Marx (15), MPSE-004 Social & Political Thought in Modern India (15; Kautilya/Gandhi/Ambedkar/Roy). Verified streaming `application/pdf`.
- [x] MPS programme handles (eGyanKosh `123456789/5481` → 1st yr `5482`/2nd yr `5483`): MPS-001 `5486`, MPS-002 `5490`, MPS-003 `43903`, MPS-004 `43906`, MPSE-001 `24365`, MPSE-003 `24354`, MPSE-004 `24368`.
- [x] History Optional MA-level expansion (user: added IGNOU MHI MA History series to cover historiography/archaeology debates + World History + Modern/Post-independence gaps). Ingested 9 MHI courses via `vector_server/download_history_optional_mhi.py` — **311 new files**; history-optional: 79 → **366**. MHI-01 Ancient & Medieval Societies (35), MHI-02 Modern World (35; Enlightenment/Industrialization/French Rev/Imperialism/World Wars/Cold War/Decolonization), MHI-03 Historiography (35; Positivist/Marxist/Annales/Postmodern/Subaltern), MHI-04 Political Structures in India (34), MHI-05 History of Indian Economy (35; Feudalism debate), MHI-06 Evolution of Social Structures (35), MHI-08 History of Ecology & Environment (32), MHI-09 Indian National Movement (35), MHI-10 Urbanisation in India (35). Verified streaming `application/pdf`.
- [x] MHI programme handles (eGyanKosh `123456789/5306` → First yr `5310`/Second yr `5311`): MHI-01 `5314`, MHI-02 `5334`, MHI-03 `44373`, MHI-04 `5380`, MHI-05 `44483`, MHI-06 `5404`, MHI-08 `5414`, MHI-09 `44285`, MHI-10 `44358`.
- [x] Geography Optional model/theory + contemporary-India gap-fill (user: MGG set lacked Economic Geography models + contemporary issues): added 5 more MScGG courses via `vector_server/download_geography_optional_gap.py` — **108 new files**; geography-optional: 149 → **257**. MGG-006 Economic Geography (21; Weber/Von Thünen/Christaller/Perroux/Rostow), MGG-007 Environmental Geography (22), MGG-010 Urban Geography (24; Losch/urban models), MGGE-003 Natural Hazards & Disaster Mgmt (21), MGGE-004 Hydrology & Water Resources (20; river interlinking). Verified streaming `application/pdf`.
- [x] MSCGG semester handles (eGyanKosh `123456789/98159`; Sem-I `98160`, Sem-II `102615`, Sem-III `109915`, Sem-IV `111395`): MGG-006 `103139`, MGG-007 `102616`, MGG-010 `102651`, MGGE-003 `113849`, MGGE-004 `112666`.
- [x] Sociology MSW gap-fill (user: add social-work/social-movements + marginal-groups modules): new `vector_server/download_sociology_optional_msw.py` using **revised** MSW handles (original handles 51991/52000/51998/51990 exposed only 1 block each; revised `118418`/`118345`/`118373`/`58818` expose full block→unit structure). **88 new files**: MSW-004 Social Dynamics & Movements (23; conflict/cooperation/competition, pressure groups), MSW-002 (24), MSW-003 (22), MSWE-002 (19; urban/tribal/other marginal groups). sociology dir now **398 files**; MSW counts verified 24/22/23/1/19 re: MSW-009. Verified streaming `application/pdf`.
- [x] MSW/MSWE course handles (eGyanKosh): MSW-004 `123456789/118418`, MSW-002 `118345`, MSW-003 `118373`, MSWE-002 `58818`.
- [x] Backfill + R2/disk/DB audit (user: "is Source Material same on R2 and disk and DB?"). Clean reconciliation (`vector_server/audit_clean.py`): **all subjects aligned; every difference is content-dedupe by `file_hash`, not a gap.**
  - geography 257/257/257, philosophy 61/61/61, political-science **249**/249/249 = perfect.
  - history disk 390 = R2 390, DB **366**; 24 EHI-04 unit PDFs are byte-identical (same `file_hash`) to already-registered EHI-03 rows → `documents` unique-per-hash keeps 366 (no data loss; EHI-04 content already registered under EHI-03).
  - sociology disk 398 = R2 398, DB **397**; MSWE-002_58861_Unit1 byte-identical to registered 58834_Unit1 → same dedupe.
  - public-administration disk 289 / R2 290 / DB **287**: 2 disk NCERT Class-11 dupes (kept per user "keep as-is"; byte-identical to political-science rows) + 1 stale R2-only `NITI_Strategy_for_New_India_75.pdf` (not in DB, bytes live under `economy`).
- [x] Backfill executed (`vector_server/backfill_optional_registration.py`): registered the 24 history EHI files + downloaded `MEA_Annual_Report_2023.pdf` from R2 → disk → registered under political-science-optional. PSIR DB: 248 → **249**. API + streaming verified live (`history-optional` 366 files; `political-science-optional` 249 incl. MEA; EHI-02/03 stream `application/pdf`).
- [x] Note: earlier one-off basename diff (`diff_disk_db.py`) misleadingly reported *every* disk file as "NOT in R2/DB" — that output was a script artifact; `audit_clean.py` is the authoritative check (R2 keys are `<subject>/<file>`, DB `file_name` is `<subject_id>/<file>`).

## Active
- GS4 new PDFs need chunking/embedding once Gemini quota clears (115 new IGNOU philosophy + EI PDFs → ~500-700 new chunks expected).
- PA optional fully expanded: MPA-016 (20 units), MPA-017 (15 units), MPA-018 (19 units) ingested via community-walk with throttling. MPAG-001 manifest items (43852/43853) were wrong content (DECE programme guides) — removed from disk/R2/DB. PA total now **338 files** (283 post-cleanup + 54 MPA-016/017/018 + 1 NCERT dupe).

## Completed (this session)
- [x] R2/disk/DB orphan audit (`vector_server/r2_orphan_check.py`): found 5 R2-only orphans (4 ARC reports + 1 NITI PA-copy). All resolved.
- [x] Registered 4 missing ARC reports under gs2/governance + gs4/ethics (ARC_Report01 RTI, ARC_Report04 Ethics, ARC_Report10 Personnel, ARC_Report12 Citizen Centric). R2 = UI now verified.
- [x] Deleted stale R2-only `public-administration-optional/NITI_Strategy_for_New_India_75.pdf` (duplicate of economy-registered copy).
- [x] Removed 7 wrong-content PA files from manifest (5 MPA-016 Consumer Rights/CHR-12 units + 2 MPAG-001 DECE programme guides). Verified wrong content via PyMuPDF first-page text extraction.
- [x] PA MPA-016/017/018 community-walk scrape (`vector_server/fetch_mpa_remaining.py`): MPA-016 Decentralisation & Local Governance (20 units), MPA-017 Electronic Governance (15 units), MPA-018 Disaster Management (19 units). Added `1757` to skip set (shared parent community). PA optional: 283 → **338 files**.
- [x] GS4 Ethics gap-fill (`vector_server/download_gs4_ethics.py`): ingested 5 IGNOU courses + 2 individual units from eGyanKosh — **117 new files**; GS4 ethics: 6 → **123 documents**.
  - MPYE-002 Ethics (20 units: ethical theories, Bentham/Mill/Utilitarianism, Kant deontology, applied ethics)
  - MPY-001 Indian Philosophy (30 units: Buddha, Mahavira, Kautilya, Gandhi, Ambedkar, Vivekananda)
  - MPY-002 Western Philosophy (31 units: Socrates, Plato, Aristotle, Kant, Hegel, Marx, Nietzsche)
  - MPYE-015 Gandhian Philosophy (21 units: ahimsa, satyagraha, trusteeship, sarvodaya, swaraj)
  - BPCS-183 Emotional Intelligence (13 units: Goleman, Salovey-Mayer, EI in governance)
  - EPA-04 Unit-21 Administrative Ethics & Integrity (direct bitstream)
  - BPAC-108 Unit-8 Citizen's Charter + RTI framework (direct bitstream)
  Verified streaming `application/pdf`. API returns 123 ethics files. Chunks still 351 (new PDFs need ingestion pipeline).
- [x] GS4 gap-fill round 2 (`vector_server/download_gs4_gaps.py` + `fetch_bpac108.py`): GS4 ethics 123 → **154 documents**.
  - **Central Civil Services (Conduct) Rules 1964** (official DoPT PDF) — Integrity, conflict of interest, conduct rules.
  - **UPSC GS4 Mains Question Papers 2013–2024** (13 individual official papers) — fills the case-study gap; the single most GS4-weighted section (50% of exam). NOTE: 2019-2024 official upsc.gov.in URLs return bot-blocked HTML, so those were pulled from a mirror; 2025 official URL blocked (not ingested). 2013–2018 from free mirror.
  - **BPAC-108 "Public Policy & Administration in India"** (18 new files: Blocks 1-5 + Units 1-14) — Block-4 Citizen-Admin interface, Block-5 Social Welfare Administrations (values, empathy, weaker sections) — fills the Citizen's Charter/Sevottam/service-delivery + weakersections gaps.
  - Removed redundant 67MB combined PYP (overlaps individual papers). Removed combined PDF from disk/R2/DB.
  - Confirmed **2nd ARC Report 1 & 10 already present** under `governance` (GS2) — no gap there.
  - R2/UI sync verified: **0 orphans** (1935 registered R2 objects). Streaming `application/pdf` verified for CCS Conduct Rules.
- [x] GS4 gap-fill round 3 (DARPG + MPA-013 GS4 units): GS4 ethics 154 → **162 documents**.
  - **DARPG Citizen's Charters Handbook** (official, 467KB) — Citizen's Charter guidelines, Sevottam framework, service-delivery quality. Primary source for the Citizen's Charter/Sevottam gap.
  - **7 MPA-013 "Public Systems Management" GS4-relevant units** registered under ethics (content-dedupe from PA-optional disk files): U7-10 Governance (bureaucracy/executive/legislature roles), U11 Financial Management (probity/utilization of public funds), U19 Accountability, U20 Responsiveness/Service Delivery. R2 parity via `gs4/ethics/GS4_MPA013_*`.
  - Confirmed 2nd ARC Report 1 & 10 already present (governance/GS2). BPAC-108 Block-5 covers Social Welfare (the "BPAE-102 Social Welfare" recommendation resolves to BPAC-108, already ingested). ARC Report 12 = Sevottam, already present.
  - R2/UI sync re-verified: **0 orphans** (1936 registered R2 objects). Streaming `application/pdf` verified for Citizen's Charters Handbook.

## Blocked
- [ ] GS4 new PDFs (115 IGNOU philosophy/EI + 54 PA MPA + 31 GS4-gap files + 8 DARPG/MPA-013 + 7 round-3) need chunking/embedding — Gemini `429` quota exhaustion (~380 embedded only).
- [ ] UPSC GS4 2025 Mains paper not ingested (upsc.gov.in returns bot-blocked HTML; no reliable mirror found).
- [ ] DARPG Sevottam detailed guideline PDFs not confirmed (darpg.gov.in/relatedlinks/sevottam is JS-rendered, no direct .pdf href found); Citizen's Charter Handbook ingested as the primary Sevottam source.
- [ ] MPA-013 Unit-15 (missing from manifest) not present.
- [ ] Yojana/Kurukshetra/NITI official PDFs cannot be auto-fetched (landing pages / subscription-gated); need user-supplied direct URLs.
- [ ] DARPG administrative case-study/evidence layer not ingested (no stable single-file source).

## Next Move
1. Resume embedding once Gemini quota clears — retry ingestion for all new PDFs (GS4 philosophy/EI 115 PDFs, PA MPA-016/017/018 54 PDFs). Run `reingest_all.py` or `reingest_one.py` to chunk + embed.
2. Add DARPG / policy-evidence layer when a stable source is available.
3. Optional: Philosophy subject expansion (currently 61 files) — gap-fill with IGNOU MPY-001/MPY-002 core content (already in GS4 ethics; could be registered under philosophy-optional too if needed).

## Notes
- Optional dedup: `getSourceList` collapses duplicate base filenames (e.g. history shows 51 vs 75 registered) — expected behavior shared with gs/essay.
- Pre-existing TS type errors in `App.tsx` (line 780 `r2_key`; lines 861–905 `source_tier`) are unrelated to session changes and left untouched.
- Change-restart workflow: `docker restart semantic-backend` after editing `server/**`; `aryabhata-ingestor` mounts `./vector_server` → `/app` (run python scripts via `docker exec aryabhata-ingestor python /app/...`).
