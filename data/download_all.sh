#!/bin/bash
# UC System AI Governance Document Inventory — Bulk Download Script
# Run from the reference/ directory: cd reference && bash download_all.sh
# Requires: curl
# Generated: 2026-04-14

set -e

echo "=== UC System AI Governance Document Download ==="
echo "This script downloads all PDF documents from the inventory."
echo "Web pages are cataloged in inventory_urls.json but not downloaded here."
echo ""

# --- UCOP / Systemwide ---
echo "--- UCOP / Systemwide ---"
curl -sL -o "ucop-systemwide/ucop-01_uc-ai-working-group-final-report.pdf" "https://ai.universityofcalifornia.edu/_files/documents/uc-ai-working-group-final-report.pdf" && echo "OK: ucop-01" || echo "FAIL: ucop-01"
curl -sL -o "ucop-systemwide/ucop-02_uc-responsible-ai-principles.pdf" "https://ai.universityofcalifornia.edu/_files/documents/ai-council-uc-responsible-ai-principles.pdf" && echo "OK: ucop-02" || echo "FAIL: ucop-02"
curl -sL -o "ucop-systemwide/ucop-03_regents-presidential-working-group-on-ai.pdf" "https://regents.universityofcalifornia.edu/regmeet/nov21/b2.pdf" && echo "OK: ucop-03" || echo "FAIL: ucop-03"
curl -sL -o "ucop-systemwide/ucop-05_ai-council-executive-summary-fy23-24.pdf" "https://ai.universityofcalifornia.edu/_files/uc-ai-council-executive-summary-fy-23_24-final.pdf" && echo "OK: ucop-05" || echo "FAIL: ucop-05"
curl -sL -o "ucop-systemwide/ucop-06_transparency-subcommittee-report.pdf" "https://ai.universityofcalifornia.edu/_files/documents/transparency-subcommittee-report-june-28-2024_accessible-1.pdf" && echo "OK: ucop-06" || echo "FAIL: ucop-06"
curl -sL -o "ucop-systemwide/ucop-07a_risk-assessment-guide-v1.1.pdf" "https://ai.universityofcalifornia.edu/_files/documents/uc-ai-council-risk-assessment-guide-1.1-1.pdf" && echo "OK: ucop-07a" || echo "FAIL: ucop-07a"
curl -sL -o "ucop-systemwide/ucop-07b_risk-assessment-guide-v1.1-initial.pdf" "https://ai.universityofcalifornia.edu/_files/documents/uc-ai-council-risk-assessment-guide-1.1-initial-assessment-final-1.pdf" && echo "OK: ucop-07b" || echo "FAIL: ucop-07b"
curl -sL -o "ucop-systemwide/ucop-08_legal-ai-practice-areas-expertise-chart.pdf" "https://ai.universityofcalifornia.edu/_files/ai-ogc-24-06-28-practice-areas-expertise-chart-for-website-1.pdf" && echo "OK: ucop-08" || echo "FAIL: ucop-08"
curl -sL -o "ucop-systemwide/ucop-09_legal-alert-on-ai-tools.pdf" "https://ai.universityofcalifornia.edu/_files/documents/ai-alert.pdf" && echo "OK: ucop-09" || echo "FAIL: ucop-09"
curl -sL -o "ucop-systemwide/ucop-10_statement-of-awareness-on-ai.pdf" "https://ai.universityofcalifornia.edu/_files/documents/statement-of-awareness-on-ai.pdf" && echo "OK: ucop-10" || echo "FAIL: ucop-10"
curl -sL -o "ucop-systemwide/ucop-12_uc-ai-glossary.pdf" "https://ai.universityofcalifornia.edu/_files/documents/ai-council-uc-ai-glossary.pdf" && echo "OK: ucop-12" || echo "FAIL: ucop-12"
curl -sL -o "ucop-systemwide/ucop-14_health-data-governance-task-force-report.pdf" "https://ai.universityofcalifornia.edu/uchealth-data-governance-task-force-report_2024_final_06272024.pdf" && echo "OK: ucop-14" || echo "FAIL: ucop-14"
curl -sL -o "ucop-systemwide/ucop-14b_health-data-governance-regents.pdf" "https://regents.universityofcalifornia.edu/regmeet/june24/h4.pdf" && echo "OK: ucop-14b" || echo "FAIL: ucop-14b"
curl -sL -o "ucop-systemwide/ucop-17_ucep-academic-integrity-genai.pdf" "https://senate.universityofcalifornia.edu/files/committees/ucep/updated_uceptocouncil_academicintegrity_sept2025.pdf" && echo "OK: ucop-17" || echo "FAIL: ucop-17"

# --- UC Berkeley ---
echo "--- UC Berkeley ---"
curl -sL -o "uc-berkeley/ucb-03_genai-guidance-for-instructors-2025.pdf" "https://academic-senate.berkeley.edu/sites/default/files/genai_guidance_for_instructors_2025.pdf" && echo "OK: ucb-03" || echo "FAIL: ucb-03"

# --- UC Davis ---
echo "--- UC Davis ---"
curl -sL -o "uc-davis/ucd-02_ai-council-draft-report-2025.pdf" "https://leadership.ucdavis.edu/sites/g/files/dgvnsk1166/files/media/documents/AI%20Council_report_2025-02-18_CLEAN%20(1).pdf" && echo "OK: ucd-02" || echo "FAIL: ucd-02"
curl -sL -o "uc-davis/ucd-09_academic-senate-responsible-ai-priority.pdf" "https://academicsenate.ucdavis.edu/sites/g/files/dgvnsk3876/files/inline-files/ra-call-2025.10.06.pdf" && echo "OK: ucd-09" || echo "FAIL: ucd-09"

# --- UC Riverside ---
echo "--- UC Riverside ---"
curl -sL -o "uc-riverside/ucr-01_provost-genai-guidelines.pdf" "https://provost.ucr.edu/media/2947/download?attachment=" && echo "OK: ucr-01" || echo "FAIL: ucr-01"
curl -sL -o "uc-riverside/ucr-03_ai-marcomms-guidelines.pdf" "https://documents.ucr.edu/university-relations/AI_Marcomms_Guidelines.pdf" && echo "OK: ucr-03" || echo "FAIL: ucr-03"

# --- UCSF ---
echo "--- UC San Francisco ---"
curl -sL -o "uc-san-francisco/ucsf-12_ighs-policy-on-use-of-ai.pdf" "https://globalhealthsciences.ucsf.edu/wp-content/uploads/2025/01/IGHS-Policy-on-Use-of-AI_Final.pdf" && echo "OK: ucsf-12" || echo "FAIL: ucsf-12"
curl -sL -o "uc-san-francisco/ucsf-14_health-ai-readiness-presentation.pdf" "https://ai.ucsf.edu/sites/ai.ucsf.edu/files/2024-06/Jan%2012%20Panel_AI%20in%20RW%20Clinical%20Settings.pdf" && echo "OK: ucsf-14" || echo "FAIL: ucsf-14"

# --- National Labs ---
echo "--- National Labs ---"
curl -sL -o "lbnl/lbnl-01_ai4ses-report-2023.pdf" "https://www.anl.gov/sites/www/files/2023-06/AI4SESReport-2023-v5.pdf" && echo "OK: lbnl-01" || echo "FAIL: lbnl-01"
curl -sL -o "llnl/llnl-01_safe-ai-for-doe.pdf" "https://data-science.llnl.gov/sites/data_science/files/2024-12/SafeAIforDOE%20Digital.pdf" && echo "OK: llnl-01" || echo "FAIL: llnl-01"
curl -sL -o "llnl/llnl-02_ai-in-8-pages.pdf" "https://data-science.llnl.gov/sites/data_science/files/2026-01/ai-in-8-final_report_for_web.pdf" && echo "OK: llnl-02" || echo "FAIL: llnl-02"

echo ""
echo "=== Download complete ==="
echo "Check file sizes — any file under 1KB is likely a failed download or redirect."
echo "find . -name '*.pdf' -size -1k"
