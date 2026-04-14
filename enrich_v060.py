#!/usr/bin/env python3
"""
enrich_v060.py — Web Archive Enrichment (v0.6.0)
Processes all batch2 web archive data into the UC AI baseline JSON.
Equal treatment across all entities — no campus weighted more heavily.
"""

import json, copy, sys
from pathlib import Path

BASELINE = Path("uc_ai_baseline.json")

def load():
    with open(BASELINE) as f:
        return json.load(f)

def save(data):
    with open(BASELINE, "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"  Saved {BASELINE}")

def field(value, source_id, source_url, notes=None):
    """Create a boolean_with_source or string_with_source field."""
    return {"value": value, "source_id": source_id, "source_url": source_url, "notes": notes}

def set_field(entity, dim, key, value, source_id, source_url, notes=None, overwrite=False):
    """Set a field if it doesn't exist or if overwrite is True."""
    if dim not in entity:
        entity[dim] = {}
    if key not in entity[dim] or overwrite:
        entity[dim][key] = field(value, source_id, source_url, notes)
        return True
    return False

def enrich(data):
    e = data["entities"]
    changes = 0

    # ── UCLA (from ucla-web-archive-batch2.md) ──
    ent = e["ucla"]
    changes += set_field(ent, "infrastructure", "has_enterprise_ai_platform", True,
        "ucla-01", "https://oai.ucla.edu/",
        "ChatGPT Enterprise — UCLA first institution in CA to adopt (Jan 2024). Also Claude, Copilot, Gemini via OAI.")
    changes += set_field(ent, "leadership", "has_named_ai_leadership_role", True,
        "ucla-03", "https://oai.ucla.edu/about/",
        "Chris Mattmann — Chief Data and AI Officer (CDAIO), leads Office of Advanced AI (OAI). Lucy Avetisyan — CIO.", overwrite=True)
    changes += set_field(ent, "leadership", "ai_leader_title", "Chief Data and AI Officer",
        "ucla-03", "https://oai.ucla.edu/about/",
        "Chris Mattmann, CDAIO. OAI charter: provide enterprise GenAI tools, establish governance frameworks, promote responsible AI.")
    changes += set_field(ent, "engagement", "has_ai_survey_data", True,
        "ucla-06", "https://oai.ucla.edu/ai-adoption-overview/",
        "UCUES 2024: 67% of students using GenAI. OAI adoption dashboard with usage metrics.")
    changes += set_field(ent, "training", "has_ai_training_program", True,
        "ucla-07", "https://oai.ucla.edu/education-and-training/",
        "AI Training Hub, events, campus-wide training. Everyday AI video series.", overwrite=True)
    changes += set_field(ent, "engagement", "has_ai_hub_portal", True,
        "ucla-01", "https://oai.ucla.edu/",
        "Office of Advanced AI (OAI) central portal with tools, training, guidance, governance.")

    # ── UC Merced (from ucm-web-archive-batch2.md) ──
    ent = e["uc_merced"]
    changes += set_field(ent, "governance", "has_ai_council", True,
        "ucm-01", "https://ai.ucmerced.edu/advisory-council",
        "AI Advisory Council formed Feb 11, 2026. Chair: Avi Badwal (AVC Enterprise Tech). Exec sponsors: Dumont (EVC/Provost), Dugan (VC/CIO), Wilson (VC Research). 3 workgroups: Teaching & Learning, Research & Innovation, Admin Services & Digital Transformation.", overwrite=True)
    changes += set_field(ent, "training", "has_ai_training_program", True,
        "ucm-03", "https://teach.ucmerced.edu/generative-AI-syllabus",
        "Teaching Commons AI in Instruction guide. Faculty Fellows exploring AI. References UCSD symposium, Harvard AI Pedagogy Project.", overwrite=True)
    changes += set_field(ent, "engagement", "has_graduate_ai_showcase", True,
        "ucm-06", "https://graduatedivision.ucmerced.edu/AI-tools",
        "Grad Division 'How I AI' biweekly interview series showcasing faculty/grad student AI use across disciplines.")

    # ── UC Riverside (from ucr-web-archive-batch2.md) ──
    ent = e["uc_riverside"]
    changes += set_field(ent, "infrastructure", "has_enterprise_ai_platform", True,
        "ucr-06", "https://insideucr.ucr.edu/stories/2026/03/20/ucr-community-urged-use-google-ai-tools",
        "UCR first university nationally with campus-wide Google enterprise AI agreement (~3 years). Gemini + NotebookLM. P4 data approved with ITS consultation.", overwrite=True)
    changes += set_field(ent, "infrastructure", "enterprise_platform_name", "Google Gemini + NotebookLM (enterprise)",
        "ucr-06", "https://insideucr.ucr.edu/stories/2026/03/20/ucr-community-urged-use-google-ai-tools",
        "Also building 'The Grove' — central search assistant on Gemini Enterprise with Agentic AI, connecting to Google Workspace and ServiceNow.", overwrite=True)
    changes += set_field(ent, "training", "has_ai_training_program", True,
        "ucr-05", "https://teaching.ucr.edu/ai-classroom",
        "XCITE Center comprehensive teaching resource. Three approaches: Embrace, Understand, Limit AI. Sample syllabus statements. Rich Yueh UCR AI Forum Slack.", overwrite=True)
    changes += set_field(ent, "academic_integrity", "has_genai_academic_integrity_guidance", True,
        "ucr-04", "https://insideucr.ucr.edu/announcements/2023/11/03/update-artificial-intelligence-use-students",
        "Nov 2023 student announcement. Discuss with professors before using. Always cite. References Academic Integrity Policy.", overwrite=True)

    # ── UC San Diego (from ucsd-web-archive-batch2.md) ──
    ent = e["uc_san_diego"]
    changes += set_field(ent, "infrastructure", "has_enterprise_ai_platform", True,
        "ucsd-02", "https://tritonai.ucsd.edu/tritongpt/terms.html",
        "TritonGPT — hosted on SDSC-managed systems, Onyx middleware. 90-day retention, auto-delete. blink.ucsd.edu migrated to tritonai.ucsd.edu.", overwrite=True)
    changes += set_field(ent, "infrastructure", "enterprise_platform_name", "TritonGPT",
        "ucsd-02", "https://tritonai.ucsd.edu/tritongpt/terms.html",
        "SDSC-hosted, UC-controlled infrastructure. No data shared with third parties. Onyx middleware.", overwrite=True)
    changes += set_field(ent, "infrastructure", "has_ai_hub_portal", True,
        "ucsd-01", "https://tritonai.ucsd.edu/about/index.html",
        "TritonAI central hub — strategy, governance, responsible use. Workgroups: AI Development, TritonAI Champions CoP. Links to UC AI Council.")
    changes += set_field(ent, "governance", "has_ai_development_workgroup", True,
        "ucsd-06", "https://tritonai.ucsd.edu/about/workgroup.html",
        "AI Development Workgroup: resourcing, risk management, best practice sharing. 16 campus units represented.")
    changes += set_field(ent, "engagement", "has_communications_ai_guidance", True,
        "ucsd-07", "https://univcomms.ucsd.edu/resources/ai-guidance/index.html",
        "Campus communicators guidance. AI for brainstorming, note capture, text refinement. Avoid for crisis comms, reputational issues, bylined work.")
    changes += set_field(ent, "leadership", "has_chief_health_ai_officer", True,
        "ucsd-14", "https://health.ucsd.edu/news/press-releases/2023-12-12-karandeep-singh-md-named-inaugural-chief-health-ai-officer-at-uc-san-diego-health/",
        "Karandeep Singh, MD — inaugural CHAIO (Dec 2023), subsequently exec dir JCHI. Alexander Khalessi, MD, MBA — CIO + interim AVC Health Sciences Innovation and AI (Dec 2025).", overwrite=True)

    # ── UCSF (from ucsf-web-archive-batch2.md) ──
    ent = e["uc_san_francisco"]
    changes += set_field(ent, "infrastructure", "has_clinical_ai_monitoring", True,
        "ucsf-05", "https://docit.ucsf.edu/news/first-continuous-ai-monitoring-platform-clinical-care",
        "IMPACC — $5M gift from Ken/Kathy Hao. First continuous real-time automated AI monitoring for clinical care. Leaders: Julia Adler-Milstein (DoC-IT chief), Sara Murray (CHAIO).")
    changes += set_field(ent, "leadership", "has_ai_monitoring_director", True,
        "ucsf-06", "https://www.hcinnovationgroup.com/analytics-ai/artificial-intelligence-machine-learning/news/55275983/",
        "Jinoos Yazdany, MD, MPH — inaugural Executive Director of AI Monitoring in Clinical Care within DoC-IT.")
    changes += set_field(ent, "infrastructure", "has_enterprise_ai_platform", True,
        "ucsf-13", "https://irb.ucsf.edu/chatgpt-large-language-models-llm-artificial-intelligence-ai",
        "ChatGPT Enterprise replacing Versa Chat. P3 & P4 data approved. Versa platform for EHR/PII. Non-UCSF platforms require security risk assessment + Data Transfer Agreement.", overwrite=True)
    changes += set_field(ent, "infrastructure", "enterprise_platform_name", "ChatGPT Enterprise (replacing Versa Chat)",
        "ucsf-13", "https://irb.ucsf.edu/chatgpt-large-language-models-llm-artificial-intelligence-ai",
        "Also Versa platform (HIPAA compliant) for clinical use. AI Tiger Team for non-Versa platform consultation.", overwrite=True)
    changes += set_field(ent, "health_ai", "has_medical_education_ai_plan", True,
        "ucsf-15", "https://meded.ucsf.edu/artificial-intelligence-medical-education",
        "8 AI Charter Pillars: Competencies, Assessment, Data/Informatics, Operations, Research, Admissions, Ethics/Governance, Evaluations/CQI. Christy Boscardin PhD director. MedSimAI (with Yale, Weill Cornell), Versa Curate.", overwrite=True)
    changes += set_field(ent, "policy", "has_school_level_policies", True,
        "ucsf-10", "https://meded.ucsf.edu/policies-procedures/bridges-curriculum-generative-artificial-intelligence-usage-policy",
        "Bridges Curriculum GenAI Usage Policy (updated Dec 2024). Versa allowed for patient care. Commercial platforms prohibited for sensitive data. LCME Standards 5.9, 7.4, 7.7.", overwrite=True)
    changes += set_field(ent, "health_ai", "has_trustworthy_ai_framework", True,
        "ucsf-17", "https://ai.ucsf.edu/trustworthy",
        "Based on HHS TAI Playbook. 6 principles: Fair, Robust, Transparent, Responsible, Privacy, Safe. Aligned with FAVES, AMA, UCOP AI Strategy, NIST AI RMF, EU Ethics, Coalition for Health AI.")

    # ── UC Santa Barbara (from ucsb-web-archive-batch2.md) ──
    ent = e["uc_santa_barbara"]
    changes += set_field(ent, "governance", "has_academic_senate_ai_body", True,
        "ucsb-03", "https://evc.ucsb.edu/committees/AI-advisory-uses",
        "Senate-Administration Advisory Committee on Uses of AI in Academic Contexts. Co-chairs: Tim Sherwood (Dean CCS, CS) and Lisa Parks (Film & Media Studies). 12+ members. Ex officio: Josh Bright (CIO), Linda Adler-Kassner (AVC Teaching & Learning), Rita Raley (Divisional Chair).")
    changes += set_field(ent, "academic_integrity", "has_genai_academic_integrity_guidance", True,
        "ucsb-04", "https://evc.ucsb.edu/communications/memos/2023-05-01-behalf-office-teaching-and-learning-guidance-regarding-ai-writing",
        "May 2023 EVC memo from Linda Adler-Kassner. UCSB does NOT support plagiarism detection software (Turnitin, ChatGPT Zero). Shifts from detection to prevention. 5 sections: communicate expectations, use AI detection ethically, report, avoid issues, incorporate AI.", overwrite=True)
    changes += set_field(ent, "policy", "has_writing_ai_policy", True,
        "ucsb-07", "https://www.writing.ucsb.edu/resources/faculty/ai-policy",
        "Writing Program AI Policy. 4 points: AI as supportive feedback tool, academic integrity with AI acknowledgment, critical thinking about AI (rhetorical sovereignty), caution with detection tools.")
    changes += set_field(ent, "engagement", "has_ai_community_of_practice", True,
        "ucsb-08", "https://otl.ucsf.edu/cop/artificial-intelligence-community-practice",
        "AI Community of Practice (AI CoP). AI Spring Symposium 'AI Innovations and Impact at UCSB' Apr 27 - May 1, 2026.")
    changes += set_field(ent, "training", "has_ai_training_program", True,
        "ucsb-06", "https://otl.ucsb.edu/tales/ai-101",
        "OTL AI series: AI 101 (Course Policies, Prompt Engineering, Privacy), AI 102 (AI Literacy), AI 103 (Critical Thinking).", overwrite=True)

    # ── UC Santa Cruz (from ucsc-web-archive-batch2.md) ──
    ent = e["uc_santa_cruz"]
    changes += set_field(ent, "governance", "has_ai_council", True,
        "ucsc-04", "https://campusai.ucsc.edu/faq/",
        "UC Santa Cruz AI Council developed comprehensive FAQ. Grounded in UC Principles. No dedicated GenAI platform for all users yet — Gemini/NotebookLM for staff only (Feb 2026). Faculty/student access timeline consulting with Academic Senate.", overwrite=True)
    changes += set_field(ent, "policy", "has_security_statement", True,
        "ucsc-05", "https://news.ucsc.edu/2024/01/generative-ai-statement/",
        "Jan 2024 from Melanie Douglas (Acting VC-IT). Prohibited: PII, FERPA, P3/P4 data. Permitted: P1/P2 only. No GenAI licenses at time of memo. Embedded AI awareness warning (Zoom, Microsoft, Otter.AI).", overwrite=True)
    changes += set_field(ent, "academic_integrity", "has_vice_provost_guidance", True,
        "ucsc-06", "https://news.ucsc.edu/2023/09/generative-ai-in-teaching-and-learning-link-corrected/",
        "Sep 2023 from EVC Lori Kletzer. AI policies in syllabi. Reiterated March 2023 Hughey/Biehl guidance on detection tools.", overwrite=True)
    changes += set_field(ent, "academic_integrity", "has_genai_academic_integrity_guidance", True,
        "ucsc-07", "https://tlc.ucsc.edu/academic-integrity/generative-ai-use-policy/",
        "TLC guide: 'Drafting a GenAI-Use Policy for Your Course.' Policy frameworks, sample approaches (restrictive to permissive), attribution strategies.", overwrite=True)
    changes += set_field(ent, "infrastructure", "has_enterprise_ai_platform", True,
        "ucsc-08", "https://campusai.ucsc.edu/tools/",
        "Winter 2026: Gemini, NotebookLM (staff only). Zoom AI (Nov 2025). P3 data approved for campus-licensed tools under UC-Google agreement.", overwrite=True)
    changes += set_field(ent, "infrastructure", "enterprise_platform_name", "Google Gemini + NotebookLM (staff only) + Zoom AI",
        "ucsc-08", "https://campusai.ucsc.edu/tools/",
        "Staff-only as of Feb 2026. Faculty/student access pending Academic Senate consultation.", overwrite=True)
    changes += set_field(ent, "training", "has_ai_training_program", True,
        "ucsc-09", "https://campusai.ucsc.edu/training-and-guides/",
        "UC AI Primer, L&D workshops (Spring 2026), LinkedIn Learning, safety guide, TLC faculty workshops. Cross-UC resources: UCSD Everyday AI, UCI Prompt Library, UCSC Extension courses.", overwrite=True)
    changes += set_field(ent, "governance", "has_genai_research_center", True,
        "ucsc-10", "https://genai.ucsc.edu/",
        "UCSC Generative AI Center. 3 pillars: Core GenAI technologies, Applications, Policy & education. Summer Academy on AI for HS students (July 2026).", overwrite=True)
    changes += set_field(ent, "engagement", "has_chancellor_ai_statement", True,
        "ucsc-11", "https://www.santacruzworks.org/news/from-the-chancellor-harnessing-the-power-of-aiwhile-avoiding-its-perils",
        "Chancellor Cynthia Larive (Feb 2024). AI for research, admin automation, personalized learning. SlugBot chatbot. New Academic Integrity Office. Planned AI Center. Innovation and ethics focus.", overwrite=True)
    changes += set_field(ent, "security", "has_data_classification_for_ai", True,
        "ucsc-04", "https://campusai.ucsc.edu/faq/",
        "Detailed P1-P4 guidance in FAQ. P1/P2 for general AI tools. P3 approved for campus-licensed Gemini/NotebookLM under UC-Google contract. P4 never in AI prompts.")
    changes += set_field(ent, "academic_integrity", "has_ai_detection_policy", True,
        "ucsc-04", "https://campusai.ucsc.edu/faq/",
        "AI detection tools only if: hosted by UCSC with data protected, contracted through Purchasing, or student prior approval. FERPA compliance. March 2023 VP Hughey/Biehl guidance.")

    # ── UCLA Health (from uclah-web-archive-batch2.md) ──
    ent = e["ucla_health"]
    changes += set_field(ent, "governance", "has_health_ai_oversight", True,
        "uclah-01", "https://www.uclahealth.org/health-ai/ucla-health-ai-council-haic",
        "Health AI Council (HAIC) — AI guidelines, oversight, strategic direction for entire UCLA Health system. Adopted UC RAI Principles from 2021 Presidential Working Group.", overwrite=True)
    changes += set_field(ent, "health_ai", "has_health_ai_governance", True,
        "uclah-01", "https://www.uclahealth.org/health-ai/ucla-health-ai-council-haic",
        "HAIC responsibilities: governance of all clinical/operational AI, evaluating ethical/regulatory/operational implications, promoting safe AI solutions, knowledge exchange hub.", overwrite=True)
    changes += set_field(ent, "health_ai", "has_risk_assessment_framework", True,
        "uclah-01", "https://www.uclahealth.org/health-ai/ucla-health-ai-council-haic",
        "Developing comprehensive AI risk and impact assessment: evaluate from procurement through operational lifetime, stratify by risk level, collect documentation on all predictive AI systems.")
    changes += set_field(ent, "health_ai", "has_responsible_ai_principles", True,
        "uclah-01", "https://www.uclahealth.org/health-ai/ucla-health-ai-council-haic",
        "Adopted UC RAI Principles: Appropriateness, Transparency, Accuracy/Reliability/Safety, Fairness/Nondiscrimination, Privacy/Security, Human Values, Shared Benefit, Accountability.", overwrite=True)

    # ── UC Davis Health (from ucdh-web-archive-batch2.md) ──
    ent = e["uc_davis_health"]
    changes += set_field(ent, "health_ai", "has_health_ai_governance", True,
        "ucdh-02", "https://health.ucdavis.edu/news/headlines/pilot-program-in-emergency-medicine-department-trains-residents-to-use-ai-tool/2026/03",
        "Analytics Oversight Committee (AOC) reviews all advanced analytics models including AI for clinical decision-making. Jason Yeates Adams, MD chairs Health Analytics Core.", overwrite=True)
    changes += set_field(ent, "health_ai", "has_health_ai_framework", True,
        "ucdh-01", "https://www.himss.org/resources/university-of-california-davis-health-pioneers-framework-for-ethical-health-ai-and-data-governance/",
        "S.M.A.R.T. and S.A.F.E. framework via HIMSS AMAM. 25 AI models approved for implementation, 5 rejected. Novel data governance program.")
    changes += set_field(ent, "health_ai", "has_clinical_ai_deployments", True,
        "ucdh-02", "https://health.ucdavis.edu/news/headlines/pilot-program-in-emergency-medicine-department-trains-residents-to-use-ai-tool/2026/03",
        "Abridge AI scribe pilot in ED (March 2026) — first UC Davis residents on AI scribe. Also: hospitalization risk models, health equity models, aneurysm scanning.")
    changes += set_field(ent, "leadership", "has_named_ai_leadership_role", True,
        "ucdh-02", "https://health.ucdavis.edu/news/headlines/pilot-program-in-emergency-medicine-department-trains-residents-to-use-ai-tool/2026/03",
        "Ashish Atreja — CIO and Chief Digital Health Officer. Jason Yeates Adams — Chair, Health Analytics Core.")

    # ── Cross-UC Health (from cuch-web-archive-batch2.md) ──
    ent = e["cross_uc_health"]
    changes += set_field(ent, "governance", "has_multi_institutional_initiative", True,
        "cuch-01", "https://health.ucdavis.edu/news/headlines/uc-davis-health-and-leading-health-systems-launch-valid-ai/2023/10",
        "VALID AI: UC Davis Health + NODE.Health + all 6 UC Health systems + 30+ partners. Ashish Atreja and Dennis Chornenky lead. Van Williams quoted. 5 core values: Vision, Alignment, Learning, Innovation, Discovery.", overwrite=True)
    changes += set_field(ent, "engagement", "has_systemwide_health_education", True,
        "cuch-02", "https://health.universityofcalifornia.edu/news/uc-health-grand-rounds-explores-data-and-ai-asking-whats-real-whats-allowed-and-whats",
        "UC Health Grand Rounds Dec 2023: 400+ attendees from all 6 UC Health centers. Panelists: Murray, Neinstein, Han (Legal), Singh, Butte, Longhurst. CDI2 Data Governance Task Force.", overwrite=True)
    changes += set_field(ent, "governance", "has_health_data_governance_task_force", True,
        "cuch-02", "https://health.universityofcalifornia.edu/news/uc-health-grand-rounds-explores-data-and-ai-asking-whats-real-whats-allowed-and-whats",
        "UC Health Data Governance Task Force organized by CDI2 (Center for Data-driven Insights and Innovation). CDI2 oversees UC Health Data Warehouse.", overwrite=True)

    # ── LBNL (from lbnl-web-archive-batch2.md) ──
    ent = e["lbnl"]
    changes += set_field(ent, "infrastructure", "has_enterprise_ai_platform", True,
        "lbnl-02", "https://cborg.lbl.gov/about/",
        "CBorg AI Portal — Berkeley Lab IT Division platform. Chat, text analysis, summarization, search, coding, image analysis. Enterprise contracts with AWS, GCP, Azure.", overwrite=True)
    changes += set_field(ent, "infrastructure", "enterprise_platform_name", "CBorg AI Portal",
        "lbnl-02", "https://cborg.lbl.gov/about/",
        "Named partly after Glenn Seaborg. Acceptable for non-public data (prudent-to-protect, pre-publication). Sensitive data with approved access plan.")
    changes += set_field(ent, "security", "has_data_classification_for_ai", True,
        "lbnl-02", "https://cborg.lbl.gov/about/",
        "AI Tool Security Level Cheatsheet. Non-public data acceptable. Sensitive data requires approved access plan. IT Policy at itpolicy@lbl.gov.")

    # ── LLNL (llnl-03 was 404, no new web data) ──

    # ── LANL (from lanl-web-archive-batch2.md) ──
    ent = e["lanl"]
    changes += set_field(ent, "research", "has_ai_safety_partnership", True,
        "lanl-02", "https://openai.com/index/openai-and-los-alamos-national-laboratory-work-together/",
        "OpenAI-LANL bioscience safety evaluation (July 2024). First experiment testing multimodal frontier models in lab setting. GPT-4o uplift evaluation. Nick Generous leads AI Risks Technical Assessment Group.", overwrite=True)

    return changes

def main():
    data = load()
    old_version = data["metadata"]["version"]
    print(f"Loaded baseline v{old_version}")

    # Count pre-enrichment fields
    pre_count = 0
    for eid, ent in data["entities"].items():
        for dim in ent:
            if dim in ("entity_id", "entity_name", "entity_type"):
                continue
            if isinstance(ent[dim], dict):
                pre_count += len(ent[dim])

    changes = enrich(data)

    # Count post-enrichment fields
    post_count = 0
    for eid, ent in data["entities"].items():
        for dim in ent:
            if dim in ("entity_id", "entity_name", "entity_type"):
                continue
            if isinstance(ent[dim], dict):
                post_count += len(ent[dim])

    data["metadata"]["version"] = "0.6.0"
    data["metadata"]["notes"] = (
        "v0.6.0: Web archive enrichment pass (2026-04-14). Processed all batch2 web archives across "
        "10 campuses, 5 health systems, cross-UC health, and 3 national labs. Equal treatment across "
        "all entities. Sources: campus AI portals, governance pages, FAQ, tools pages, training guides, "
        "chancellor statements, health AI council pages, HIMSS case study, clinical AI pilots, "
        "VALID AI initiative, UC Health Grand Rounds, CBorg portal, OpenAI-LANL partnership. "
        f"20 entities, ~{post_count} data points."
    )

    save(data)
    print(f"\n  v{old_version} -> v0.6.0")
    print(f"  Fields: {pre_count} -> {post_count} (+{post_count - pre_count} new)")
    print(f"  Set operations: {changes}")

if __name__ == "__main__":
    main()
