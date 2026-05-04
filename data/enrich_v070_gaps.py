#!/usr/bin/env python3
"""
enrich_v070_gaps.py — Targeted Gap Fill (v0.7.0)

Closes the four substantively thin dimensions of the v0.6.0 baseline:
- security
- academic_integrity
- health_ai
- leadership

All additions are derived strictly from facts already cited in v0.6.0 notes
or from the underlying batch2 archives that informed v0.6.0. No invented
content. For entities where public sources confirm the absence of a
governance artifact (per data/ENRICHMENT_LOG.md), a value:false field with
a referenced note is recorded — that absence is itself a committee signal.

Idempotent. set_field() defaults to no-overwrite, so re-runs are safe.
"""

import json
import sys
from pathlib import Path

BASELINE = Path(__file__).parent / "uc_ai_baseline.json"


def load():
    with open(BASELINE) as f:
        return json.load(f)


def save(data):
    with open(BASELINE, "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"  Saved {BASELINE}")


def field(value, source_id, source_url, notes=None):
    return {"value": value, "source_id": source_id, "source_url": source_url, "notes": notes}


def set_field(entity, dim, key, value, source_id, source_url, notes=None, overwrite=False):
    if dim not in entity:
        entity[dim] = {}
    if key not in entity[dim] or overwrite:
        entity[dim][key] = field(value, source_id, source_url, notes)
        return 1
    return 0


def enrich(data):
    e = data["entities"]
    changes = 0

    # ── UCOP / Systemwide ─────────────────────────────────────────────
    ent = e["ucop_systemwide"]
    # security: derive from ucop-09 (OGC AI Alert references IS-3, prohibits PII)
    changes += set_field(ent, "security", "has_is3_reference", True,
        "ucop-09", "https://ai.universityofcalifornia.edu/_files/documents/ai-alert.pdf",
        "OGC AI Alert (March 2024) references UC IS-3 information security policy as the controlling standard for AI tool use.")
    changes += set_field(ent, "security", "prohibits_pii_in_ai_tools", True,
        "ucop-09", "https://ai.universityofcalifornia.edu/_files/documents/ai-alert.pdf",
        "OGC AI Alert prohibits sharing personal information with AI tools without a fully executed agreement covering UC data.")
    changes += set_field(ent, "security", "has_p3_p4_classification_in_assessment", True,
        "ucop-07a", "https://ai.universityofcalifornia.edu/_files/documents/uc-ai-council-risk-assessment-guide-1.1-1.pdf",
        "Risk Assessment Guide v1.1 references UC data classification P1-P4 with elevated scrutiny on third-party models trained on bulk P3/P4 data.")
    # leadership: name AI Council co-chairs and chief health data officer
    changes += set_field(ent, "leadership", "has_named_ai_leadership_role", True,
        "ucop-04a", "https://www.ucop.edu/ethics-compliance-audit-services/compliance/aicouncil/index.html",
        "UC AI Council co-chairs: Alexander Bustamante (SVP & Chief Compliance and Audit Officer, UCOP) and Alex Bui, PhD (Professor, Radiological Sciences and Bioinformatics, UCLA).")
    changes += set_field(ent, "leadership", "has_chief_health_data_officer", True,
        "ucop-19", "https://ai.universityofcalifornia.edu/ai-communities/",
        "Cora Han — Chief Health Data Officer, UC Health. Chairs UC Health AI Governance Forum (CDI2) and chaired the Health Data Governance Implementation Task Force.")
    # academic_integrity: ucop-17 remains inaccessible per ENRICHMENT_LOG; preserve the existing field, do not invent

    # ── UC Berkeley ──────────────────────────────────────────────────
    ent = e["uc_berkeley"]
    changes += set_field(ent, "security", "has_p3_p4_restrictions", True,
        "ucb-09", "https://oercs.berkeley.edu/",
        "OERCS appropriate-use guidelines restrict P3/P4 protected data from non-approved AI tools.")
    changes += set_field(ent, "academic_integrity", "has_ai_detection_position", "equivocal",
        "ucb-03", "https://academic-senate.berkeley.edu/genai",
        "Berkeley GenAI Guidance (Spring 2025) discusses AI detection tools but stops short of endorsing or prohibiting them; instructors are advised to weigh limitations.")

    # ── UC Davis ─────────────────────────────────────────────────────
    ent = e["uc_davis"]
    changes += set_field(ent, "security", "has_p3_p4_restrictions", True,
        "ucd-04", "https://itpolicy.ucdavis.edu/",
        "Sensitive data guidance memo with explicit AI-specific data classification rules; references UC IS-3 alignment.")
    # health_ai: existing has_health_ai_connection field stays; no further public artifacts beyond it

    # ── UC Irvine ────────────────────────────────────────────────────
    ent = e["uc_irvine"]
    changes += set_field(ent, "security", "has_p3_p4_restrictions", True,
        "uci-02", "https://oit.uci.edu/zotgpt/",
        "ZotGPT Suite enforces data-classification-based access controls; campus AI portal lists tool-by-tool data tiers.")

    # ── UCLA ─────────────────────────────────────────────────────────
    ent = e["ucla"]
    changes += set_field(ent, "security", "has_tool_security_matrix", True,
        "ucla-08", "https://oai.ucla.edu/tools/",
        "OAI tools matrix includes data classification levels for each approved AI tool (ChatGPT Enterprise, Claude, Copilot, Gemini).")
    changes += set_field(ent, "academic_integrity", "has_school_specific_ai_integrity", True,
        "ucla-06", "https://teaching.ucla.edu/resources/teaching-guidance-for-chatgpt-and-related-ai-developments/",
        "Teaching Guidance issued by Office of the Vice Provost for Teaching and Learning; campus-wide guidance with school-level adaptations encouraged.")

    # ── UC Merced ────────────────────────────────────────────────────
    # No additional public security or academic-integrity artifacts beyond v0.6.0 capture.

    # ── UC Riverside ─────────────────────────────────────────────────
    ent = e["uc_riverside"]
    changes += set_field(ent, "security", "has_data_classification_for_ai", True,
        "ucr-06", "https://insideucr.ucr.edu/stories/2026/03/20/ucr-community-urged-use-google-ai-tools",
        "UCR's Google Gemini + NotebookLM enterprise agreement explicitly approves P4 data with ITS consultation — a public posture decision worth surfacing.")

    # ── UC San Diego ─────────────────────────────────────────────────
    ent = e["uc_san_diego"]
    changes += set_field(ent, "security", "has_p3_p4_restrictions", True,
        "ucsd-02", "https://tritonai.ucsd.edu/tritongpt/terms.html",
        "TritonGPT Terms of Use explicitly restrict P3/P4 data; 90-day retention with auto-delete.")
    changes += set_field(ent, "security", "has_no_third_party_data_sharing", True,
        "ucsd-02", "https://tritonai.ucsd.edu/tritongpt/terms.html",
        "TritonGPT privacy statement: no data shared with third parties; SDSC-hosted, UC-controlled infrastructure with Onyx middleware.")

    # ── UC San Francisco ─────────────────────────────────────────────
    ent = e["uc_san_francisco"]
    changes += set_field(ent, "security", "has_baa_requirement", True,
        "ucsf-13", "https://irb.ucsf.edu/chatgpt-large-language-models-llm-artificial-intelligence-ai",
        "Non-UCSF AI platforms require a security risk assessment plus Data Transfer Agreement; AI Tiger Team consults on non-Versa platforms.")
    changes += set_field(ent, "academic_integrity", "has_school_specific_ai_integrity", True,
        "ucsf-10", "https://meded.ucsf.edu/policies-procedures/bridges-curriculum-generative-artificial-intelligence-usage-policy",
        "Bridges Curriculum GenAI Usage Policy (updated Dec 2024) — school-of-medicine-specific integrity policy; Versa allowed for patient care, commercial platforms prohibited for sensitive data. References LCME Standards 5.9, 7.4, 7.7.")

    # ── UC Santa Barbara ─────────────────────────────────────────────
    ent = e["uc_santa_barbara"]
    changes += set_field(ent, "academic_integrity", "has_no_plagiarism_detection_support", True,
        "ucsb-04", "https://evc.ucsb.edu/communications/memos/2023-05-01-behalf-office-teaching-and-learning-guidance-regarding-ai-writing",
        "May 2023 EVC memo (Linda Adler-Kassner): UCSB does NOT support plagiarism detection software (Turnitin, ChatGPT Zero); shifts campus posture from detection to prevention.")
    changes += set_field(ent, "leadership", "has_senate_admin_ai_committee_chairs", True,
        "ucsb-03", "https://evc.ucsb.edu/committees/AI-advisory-uses",
        "Senate-Administration Advisory Committee on Uses of AI in Academic Contexts. Co-chairs: Tim Sherwood (Dean CCS, CS) and Lisa Parks (Film & Media Studies). Ex officio: Josh Bright (CIO), Linda Adler-Kassner (AVC Teaching & Learning), Rita Raley (Divisional Chair).")

    # ── UC Santa Cruz ────────────────────────────────────────────────
    ent = e["uc_santa_cruz"]
    changes += set_field(ent, "security", "has_pii_restriction", True,
        "ucsc-05", "https://news.ucsc.edu/2024/01/generative-ai-statement/",
        "Jan 2024 statement (Melanie Douglas, Acting VC-IT): PII / FERPA / P3 / P4 data prohibited from GenAI; only P1/P2 permitted at time of memo.")
    changes += set_field(ent, "security", "has_embedded_ai_warning", True,
        "ucsc-05", "https://news.ucsc.edu/2024/01/generative-ai-statement/",
        "Same statement explicitly warns about embedded AI features in Zoom, Microsoft, and Otter.AI — campuses must consider data flowing through ambient AI features.")
    changes += set_field(ent, "leadership", "has_genai_center_role", True,
        "ucsc-10", "https://genai.ucsc.edu/",
        "UCSC Generative AI Center — three pillars: core GenAI technologies, applications, policy and education. Center leadership organizes Summer Academy on AI and AI Council FAQ.")

    # ── UCSD Health ──────────────────────────────────────────────────
    ent = e["ucsd_health"]
    changes += set_field(ent, "security", "has_phi_protection_for_ai", True,
        "ucsd-12", "https://health.ucsd.edu/health-services/ai/",
        "UCSD Health public transparency page describes safeguards for PHI in AI tools; predictive AI restricted to in-house deployments with patient transparency.")
    changes += set_field(ent, "health_ai", "has_jchi_center", True,
        "ucsd-14", "https://health.ucsd.edu/news/press-releases/2023-12-12-karandeep-singh-md-named-inaugural-chief-health-ai-officer-at-uc-san-diego-health/",
        "Joint Center for Health Innovation (JCHI) — Karandeep Singh, MD subsequently appointed Executive Director after his CHAIO appointment.")
    changes += set_field(ent, "health_ai", "has_faves_principles", True,
        "ucsd-12", "https://health.ucsd.edu/health-services/ai/",
        "UCSD Health adopts FAVES-aligned health AI principles: Fair, Appropriate, Valid, Effective, Safe — reflected in the public transparency page.")

    # ── UCSF Health ──────────────────────────────────────────────────
    ent = e["ucsf_health"]
    changes += set_field(ent, "health_ai", "has_clinical_ai_monitoring", True,
        "ucsf-05", "https://docit.ucsf.edu/news/first-continuous-ai-monitoring-platform-clinical-care",
        "IMPACC (Impact Monitoring Platform for AI in Clinical Care) — first continuous real-time automated AI monitoring platform for clinical care. $5M gift from Ken/Kathy Hao.")
    changes += set_field(ent, "health_ai", "has_responsible_ai_principles", True,
        "ucsf-17", "https://ai.ucsf.edu/trustworthy",
        "UCSF Trustworthy AI framework adopted health-system-wide: 6 principles (Fair, Robust, Transparent, Responsible, Privacy, Safe) aligned with HHS TAI Playbook.")
    changes += set_field(ent, "leadership", "ai_leader_title", "Chief Health AI Officer",
        "ucsf-04", "https://docit.ucsf.edu/",
        "Sara Murray, MD — Chief Health AI Officer, UCSF Health. Co-leads oversight with Julia Adler-Milstein, PhD (DoC-IT chief).")
    changes += set_field(ent, "leadership", "has_ai_monitoring_director", True,
        "ucsf-06", "https://www.hcinnovationgroup.com/analytics-ai/artificial-intelligence-machine-learning/news/55275983/",
        "Jinoos Yazdany, MD, MPH — inaugural Executive Director of AI Monitoring in Clinical Care within DoC-IT.")
    changes += set_field(ent, "security", "has_phi_protection_for_ai", True,
        "ucsf-13", "https://irb.ucsf.edu/chatgpt-large-language-models-llm-artificial-intelligence-ai",
        "Versa platform is the HIPAA-compliant pathway for clinical/EHR/PII use. ChatGPT Enterprise approved for P3/P4; non-Versa platforms require risk assessment + Data Transfer Agreement.")

    # ── UCLA Health ──────────────────────────────────────────────────
    ent = e["ucla_health"]
    changes += set_field(ent, "leadership", "has_health_ai_council", True,
        "uclah-01", "https://www.uclahealth.org/health-ai/ucla-health-ai-council-haic",
        "Health AI Council (HAIC) provides governance structure; specific named officer not publicly listed on the HAIC page as of v0.6.0 capture.")

    # ── UC Davis Health ──────────────────────────────────────────────
    ent = e["uc_davis_health"]
    changes += set_field(ent, "security", "has_phi_protection_for_ai", True,
        "ucdh-01", "https://www.himss.org/resources/university-of-california-davis-health-pioneers-framework-for-ethical-health-ai-and-data-governance/",
        "S.M.A.R.T. and S.A.F.E. framework includes data governance program for health AI deployments; HIMSS AMAM evaluation framework.")
    changes += set_field(ent, "health_ai", "has_aoc_committee", True,
        "ucdh-02", "https://health.ucdavis.edu/news/headlines/pilot-program-in-emergency-medicine-department-trains-residents-to-use-ai-tool/2026/03",
        "Analytics Oversight Committee (AOC) reviews all advanced analytics models including clinical AI. Chair: Jason Yeates Adams, MD.")

    # ── UCI Health (gap acknowledgement) ─────────────────────────────
    ent = e["uci_health"]
    changes += set_field(ent, "health_ai", "has_health_ai_governance", False,
        "inventory-gap", None,
        "Per data/ENRICHMENT_LOG.md: UCI Health has an active governance process but no publicly posted standalone AI policy document. This recorded gap is itself committee-actionable.")
    changes += set_field(ent, "leadership", "has_named_ai_leadership_role", False,
        "inventory-gap", None,
        "No publicly named CHAIO or equivalent for UCI Health as of v0.6.0 inventory. Errol Arkilich is named CIO at UCI campus level; health system role not publicly posted.")

    # ── Cross-UC Health ──────────────────────────────────────────────
    ent = e["cross_uc_health"]
    changes += set_field(ent, "health_ai", "has_systemwide_health_ai_initiative", True,
        "cuch-01", "https://health.ucdavis.edu/news/headlines/uc-davis-health-and-leading-health-systems-launch-valid-ai/2023/10",
        "VALID AI initiative spans all 6 UC Health systems plus 30+ external partners; co-led by Ashish Atreja (UC Davis Health) and Dennis Chornenky.")
    changes += set_field(ent, "health_ai", "has_health_ai_governance_forum", True,
        "ucop-19", "https://ai.universityofcalifornia.edu/ai-communities/",
        "UC Health AI Governance Forum (CDI2) provides monthly cross-health-system coordination. Chair: Cora Han.")
    changes += set_field(ent, "leadership", "has_systemwide_health_ai_leads", True,
        "cuch-01", "https://health.ucdavis.edu/news/headlines/uc-davis-health-and-leading-health-systems-launch-valid-ai/2023/10",
        "VALID AI co-leads: Ashish Atreja (UC Davis Health CIO/CDHO) and Dennis Chornenky. Cora Han chairs UC Health AI Governance Forum at the systemwide level.")

    # ── LBNL ─────────────────────────────────────────────────────────
    ent = e["lbnl"]
    changes += set_field(ent, "security", "has_doe_aligned_classification", True,
        "lbnl-02", "https://cborg.lbl.gov/about/",
        "CBorg's AI Tool Security Level Cheatsheet aligns with DOE classification posture: non-public data acceptable, sensitive data requires approved access plan via IT Policy (itpolicy@lbl.gov).")
    changes += set_field(ent, "leadership", "has_lab_ai_leadership", True,
        "lbnl-02", "https://cborg.lbl.gov/about/",
        "CBorg AI Portal is operated by Berkeley Lab IT Division leadership; specific platform leads not publicly named on the about page.")

    # ── LLNL (acknowledged gap) ──────────────────────────────────────
    ent = e["llnl"]
    changes += set_field(ent, "health_ai", "has_health_ai_governance", False,
        "inventory-gap", None,
        "National lab — no clinical/health enterprise. Health AI governance not applicable.")
    changes += set_field(ent, "leadership", "has_named_ai_leadership_role", False,
        "inventory-gap", None,
        "Per data/ENRICHMENT_LOG.md: LLNL governance is via DOE/NNSA directives. Data Science Institute has produced governance-adjacent reports (llnl-01, llnl-02) but no publicly named institutional AI officer at the lab level.")

    # ── LANL (acknowledged gap) ──────────────────────────────────────
    ent = e["lanl"]
    changes += set_field(ent, "health_ai", "has_health_ai_governance", False,
        "inventory-gap", None,
        "National lab — no clinical/health enterprise. Health AI governance not applicable.")
    changes += set_field(ent, "leadership", "has_ai_risks_assessment_lead", True,
        "lanl-02", "https://openai.com/index/openai-and-los-alamos-national-laboratory-work-together/",
        "Nick Generous leads the AI Risks Technical Assessment Group at LANL (per OpenAI-LANL bioscience safety evaluation announcement).")

    return changes


def count_fields(data):
    """Count total field records across all entities and dimensions."""
    total = 0
    for ent in data["entities"].values():
        for k, v in ent.items():
            if k in ("entity_id", "entity_name", "entity_type", "document_count"):
                continue
            if isinstance(v, dict):
                total += len(v)
    return total


def main():
    data = load()
    old_version = data["metadata"]["version"]
    print(f"Loaded baseline v{old_version}")

    pre_count = count_fields(data)
    changes = enrich(data)
    post_count = count_fields(data)

    data["metadata"]["version"] = "0.7.0"
    data["metadata"]["created"] = "2026-05-04"
    data["metadata"]["notes"] = (
        "v0.7.0: Targeted gap fill (2026-05-04). Closes thin dimensions across the v0.6.0 baseline: "
        "security expanded from 9 to ~17 entities; academic_integrity, health_ai, and leadership "
        "given depth where public sources support it. Sources are derived strictly from facts "
        "already cited in v0.6.0 notes and underlying batch2 archives — no invented content. "
        "For UCI Health, LLNL, and LANL, explicit value:false fields with 'inventory-gap' source_id "
        "record absent governance artifacts as committee-actionable signals. "
        f"20 entities, ~{post_count} data points."
    )

    save(data)
    print(f"\n  v{old_version} -> v0.7.0")
    print(f"  Fields: {pre_count} -> {post_count} (+{post_count - pre_count} new)")
    print(f"  Set operations: {changes}")


if __name__ == "__main__":
    main()
