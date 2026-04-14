# UC AI Baseline Dataset — Enrichment and Verification Log

Generated: 2026-04-14
Updated: 2026-04-14 (v0.6.0)

This log tracks what's been captured, what needs manual download, and where the dataset could be enriched with deeper document review.

## Status

The baseline JSON (`uc_ai_baseline.json`) v0.6.0 contains 219 data points across 20 entities. Enriched through five passes: web page captures, Chrome markdown archives, priority PDF extraction, full remaining PDF extraction, and comprehensive web archive enrichment.

### Version History

- **v0.1.0** — Initial schema and web-derived data
- **v0.2.0** — Web page captures (17 archived as markdown)
- **v0.3.0** — Inventory metadata integration (193 data points)
- **v0.4.0** — Priority PDF extraction: ucop-02 (RAI Principles), ucop-05 (AI Council Executive Summary), ucop-07a (Risk Assessment Guide), ucd-02 (Davis AI Council Draft Report). ~200 data points.
- **v0.5.0** — Full remaining PDF extraction (2026-04-14). Equal treatment across all entities. 203 data points, 20 entities. Sources: ucop-01 (Working Group conclusions), ucop-03 (Regents Nov 2021), ucop-06 (Transparency Report detail), ucop-07b (Initial Assessment form), ucop-08 (Legal task force mapping), ucop-09/10 (OGC guidance detail), ucop-12 (AI Glossary detail), ucop-14/14b (Health Data Governance detail), ucb-03 (Berkeley GenAI Guidance 2025), ucr-03 (Riverside Marketing AI Guidelines), ucsd-sawg-research (UCSD Research SAWG), ucsd-sawg-education (UCSD Education SAWG), ucsf-14 (Sara Murray panel), llnl-01/02 (AI Safety + Policy Primer detail), lbnl-01 (DOE AI for Science detail).
- **v0.6.0** — Web archive enrichment pass (2026-04-14). Processed all batch2 web archives across 10 campuses, 5 health systems, cross-UC health, and 3 national labs. 50 set operations, 16 net new fields. 219 data points, 20 entities. Sources include: campus AI portals (TritonAI, OAI, campusai.ucsc.edu, ai.ucmerced.edu), governance pages, comprehensive FAQs (UCSC AI Council), tool pages, training guides, chancellor statements, health AI council pages (UCLA HAIC), HIMSS case study (UC Davis S.M.A.R.T./S.A.F.E.), clinical AI pilots (Abridge scribe), VALID AI initiative, UC Health Grand Rounds, CBorg portal (LBNL), OpenAI-LANL partnership. Pages not fetched: 4 UCSC news pages (404 after site redesign), UCSF pages behind MyAccess auth, LLNL workshop (404), LANL insidehpc.com (SSL error).

## PDF Download Status

21 of 24 PDFs successfully downloaded. 3 inaccessible:

- **ucop-17** — UCEP Annual Reminder on Academic Integrity (GenAI Provisions). URL returns error: https://senate.universityofcalifornia.edu/files/committees/ucep/updated_uceptocouncil_academicintegrity_sept2025.pdf
- **ucd-09** — Academic Senate Support for Responsible AI (Divisional Priority). URL returns error: https://academicsenate.ucdavis.edu/sites/g/files/dgvnsk3876/files/inline-files/ra-call-2025.10.06.pdf
- **ucr-01** — Guidelines for Using Generative AI in Instructional Settings at UCR. URL returns error: https://provost.ucr.edu/media/2947/download?attachment=

These may be behind authentication, expired, or moved. Could try alternative access paths (campus contacts, Wayback Machine, direct requests).

## Web Pages Archived via Chrome (17 total)

Captured 2026-04-14 as markdown in entity subfolders:

- ucop-systemwide: ucop-04b (AI Council portal), ucop-13 (applicable law and policy)
- uc-berkeley: ucb-01 (PAC-AI), ucb-04 (new AI tools announcement)
- uc-davis: ucd-01 (AI Council), ucd-05 (Aggie AI)
- uc-irvine: uci-02 (ZotGPT Suite)
- ucla: ucla-02 (AI governance overview), ucla-08 (available AI tools matrix)
- uc-merced: ucm-02 (AI central hub)
- uc-riverside: ucr-02 (generative AI portal)
- uc-san-diego: ucsd-05 (Blink AI overview), ucsd-12 (Health AI public page)
- uc-san-francisco: ucsf-09 (Versa announcement)
- uc-santa-barbara: ucsb-02 (AI use guidelines)
- uc-santa-cruz: ucsc-03 (guiding principles)
- uc-davis-health: ucdh-01 (S.M.A.R.T. and S.A.F.E. framework)
- ucla-health: uclah-01 (Health AI Council)
- lbnl: lbnl-02 (CBorg portal)

## Web Pages Archived via Chrome — Batch 2 (~80 pages attempted)

Captured 2026-04-14 as consolidated batch2 markdown files in entity subfolders:

- **ucla**: 9 pages (ucla-01, 03, 04, 05[404], 06, 07, 09, 10, 11). OAI portal, CDAIO Mattmann, UCUES 67% GenAI usage, ChatGPT Enterprise first in CA.
- **uc-merced**: 6 pages (ucm-01, 01b, 03, 04, 05, 06). AI Advisory Council (Feb 2026), 3 workgroups, How I AI series.
- **uc-riverside**: 4 pages (ucr-01b, 04, 05, 06). First Google enterprise AI agreement, The Grove (Gemini+Agentic AI), P4 data approved.
- **uc-san-diego**: 14 pages (ucsd-01 through 16). TritonAI hub, TritonGPT (SDSC/Onyx), FAVES health principles, Singh CHAIO, Khalessi CIO.
- **uc-san-francisco**: 11 pages attempted (ucsf-01 through 17; several behind MyAccess). IMPACC $5M, Yazdany exec dir, ChatGPT Enterprise replacing Versa, 8-pillar med ed strategy, Trustworthy AI framework.
- **uc-santa-barbara**: 8 pages (ucsb-03 through 09). Senate-Admin AI Committee (Sherwood/Parks), no plagiarism detection support, Writing Program policy, AI CoP.
- **uc-santa-cruz**: 8 pages (ucsc-04 through 11; 4 news pages 404). Comprehensive FAQ, security statement (Douglas), EVC guidance (Kletzer), TLC policy guide, Gemini/NotebookLM staff-only, GenAI Center, Chancellor Larive essay.
- **ucla-health**: 1 page (uclah-01). HAIC governance, UC RAI Principles adopted, risk assessment framework in development.
- **uc-davis-health**: 2 pages (ucdh-01 via HIMSS, ucdh-02). S.M.A.R.T./S.A.F.E. framework, Abridge AI scribe pilot, Analytics Oversight Committee.
- **cross-uc-health**: 2 pages (cuch-01, cuch-02). VALID AI initiative (30+ partners), UC Health Grand Rounds (400+ attendees).
- **lbnl**: 1 page (lbnl-02). CBorg AI Portal — enterprise contracts, non-public data acceptable.
- **llnl**: 1 page attempted (llnl-03). 404 — page removed.
- **lanl**: 2 pages attempted (lanl-01 SSL error, lanl-02 fetched). OpenAI-LANL bioscience safety evaluation.

## Web Pages Not Fetched

Pages that could not be archived due to access issues:

- **UCSF**: ucsf-02, 03, 04, 07 (behind MyAccess authentication); ucsf-08 (404); ucsf-11 (redirected)
- **UCSC**: ucsc-05 old URL (404, fetched from correct news URL); ucsc-06 old URL (404, fetched from correct news URL); ucsc-10 news URL (404, fetched from genai.ucsc.edu)
- **LLNL**: llnl-03 (404 — article removed from llnl.gov)
- **LANL**: lanl-01 (SSL error on insidehpc.com)
- **UCSD**: ucsd-10 (behind Canvas authentication)

## PDF Extraction Complete (v0.5.0)

All 20 downloaded PDFs have been fully extracted into the baseline JSON. Key extractions include:

- **ucop-02**: Exact 8 RAI Principles text (extracted in v0.4.0)
- **ucop-07a**: Risk categories, scoring methodology, two-phase assessment (extracted in v0.4.0)
- **ucop-01**: 4 overarching Working Group recommendations, 32 members from all 10 campuses
- **ucop-06**: Transparency survey — 264 responses, 205 AI uses, 57 high-impact cases
- **ucop-08**: Legal task force mapping — 18 members, CA legislation references
- **ucop-14/14b**: Health Data Governance — 5 principles, 3 work groups, Regents presentation
- **ucb-03**: Berkeley GenAI guidance — syllabus templates, AI detection position
- **ucr-03**: Riverside marketing guidelines — 6 principles, acceptable/prohibited uses
- **ucsd-sawg-research/education**: 9 combined recommendations, 6 ethical considerations, TritonGPT reference
- **ucsf-14**: HIPAC platform, Epic CCP, 5-year clinical AI roadmap
- **llnl-01/02**: AI safety framework (6 recommendations), CA policy primer ($372bn funding stat)
- **lbnl-01**: DOE AI research roadmap — 19 chapters, exascale computing context

## Remaining Enrichment Opportunities

### From ~95 unarchived web pages
- Deeper platform detail (models, pricing, adoption metrics)
- Additional school/department-level policies
- Updated tool matrices

### Cross-entity comparisons that could be derived
- Which campuses have adopted systemwide principles verbatim vs. adapted their own
- Maturity gradient across campuses and health systems
- Timeline of AI governance establishment
- Gap analysis: what the Steering Committee should consider requiring vs. recommending

## Coverage Gaps (from inventory)

These were noted in the original inventory document and should inform Steering Committee discussion:

- **UC Irvine**: No campus-level AI council equivalent. Governance distributed across OVPTL, OIT, Office of Research.
- **UC Merced**: No standalone provost or chancellor AI memo.
- **UC Riverside**: No dedicated campus AI task force. Provost guidelines are the primary governance document.
- **National labs**: Governed by DOE/NNSA directives, not UC frameworks. No standalone institutional AI governance policies for LBNL, LLNL, or LANL (though LLNL's Data Science Institute has produced governance-adjacent reports).
- **UCI Health**: Active governance process but no publicly posted standalone policy document.
- **UCR Health/School of Medicine**: No health-specific AI governance documents identified publicly.
- Several campuses may have internal-only documents behind authentication not discoverable through public web search.
