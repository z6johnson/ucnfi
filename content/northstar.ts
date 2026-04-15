/**
 * North Star, Opportunity Areas, and research topics for the UC Next
 * Frontier Initiative. This is the single source of truth consumed by
 * the dashboard, the OA pages, and (in Cut 2) the Claude system prompt.
 */

export type PillarId = "scale" | "reshape" | "uplift";

export type Pillar = {
  id: PillarId;
  number: 1 | 2 | 3;
  name: string;
  statement: string;
  cssVar: string;
};

export type OpportunityArea = {
  id: string; // "oa-1" … "oa-8"
  number: number;
  pillar: PillarId;
  title: string;
  summary: string;
};

export type ResearchTopic = {
  number: number;
  prompt: string;
};

export const pillars: Pillar[] = [
  {
    id: "scale",
    number: 1,
    name: "Scale Ethical AI",
    statement:
      "Redefine standards for trustworthy AI and build partnerships that treat excellence and equitable access as one and the same.",
    cssVar: "--color-pillar-scale",
  },
  {
    id: "reshape",
    number: 2,
    name: "Reshape Education",
    statement:
      "Pioneer an interdisciplinary AI solution that elevates learning, streamlines operations, and reinvests savings into impact.",
    cssVar: "--color-pillar-reshape",
  },
  {
    id: "uplift",
    number: 3,
    name: "Uplift Humanity",
    statement:
      "Harness the full depth of human knowledge to confront humanity's greatest challenges and drive meaningful, visible change.",
    cssVar: "--color-pillar-uplift",
  },
];

export const opportunityAreas: OpportunityArea[] = [
  {
    id: "oa-1",
    number: 1,
    pillar: "scale",
    title: "The \"Trusted AI\" Standard",
    summary:
      "Establish a systemwide benchmark for trustworthy AI — the definition, the assurance framework, and the public commitments.",
  },
  {
    id: "oa-2",
    number: 2,
    pillar: "scale",
    title: "Strategic Expansion and Economic Partnerships",
    summary:
      "Build the external relationships that extend UC's trusted-AI posture into industry, civic institutions, and economic development.",
  },
  {
    id: "oa-3",
    number: 3,
    pillar: "scale",
    title: "National AI Literacy",
    summary:
      "Position UC as the public anchor for AI literacy — curricula, open courseware, and workforce upskilling that reach beyond the system.",
  },
  {
    id: "oa-4",
    number: 4,
    pillar: "reshape",
    title: "AI Infrastructure Development",
    summary:
      "Design the compute, data, and platform foundations a proprietary UC AI solution would require — and the shared services to operate it.",
  },
  {
    id: "oa-5",
    number: 5,
    pillar: "reshape",
    title: "Operational Streamlining and Capital Reallocation",
    summary:
      "Identify the operational savings AI can unlock and the mechanism to reinvest those savings into mission impact.",
  },
  {
    id: "oa-6",
    number: 6,
    pillar: "reshape",
    title: "The 21st Century Public University",
    summary:
      "Reimagine teaching, learning, and the student experience for an AI-native public university.",
  },
  {
    id: "oa-7",
    number: 7,
    pillar: "uplift",
    title: "Interdisciplinary Solutions for Humanity's Grand Challenges",
    summary:
      "Organize cross-disciplinary teams to apply UC's AI capability to the largest problems the public looks to a public research university to solve.",
  },
  {
    id: "oa-8",
    number: 8,
    pillar: "uplift",
    title: "360° Health Intelligence",
    summary:
      "Unify clinical, research, and population-health AI across UC Health into a single, governed intelligence capability.",
  },
];

export const researchTopics: ResearchTopic[] = [
  {
    number: 1,
    prompt:
      "Identify existing AI solutions across the UC system and their current state of interdisciplinary ML.",
  },
  {
    number: 2,
    prompt:
      "Analyze pros and cons of enhancing existing AI solutions vs. developing a new, proprietary solution from the ground up (assumption: partnering with third-party AI providers is not aligned with program objectives).",
  },
  {
    number: 3,
    prompt:
      "Review Steering Committee and Advisory Board members' expertise to identify any knowledge gaps (e.g., history, anthropology, philosophy).",
  },
  {
    number: 4,
    prompt:
      "Understand the trajectory of AI evolution (e.g., from traditional/generative AI to quantum computing) and how UC's solution can stay ahead of the curve rather than catch up.",
  },
  {
    number: 5,
    prompt:
      "Understand the current landscape of AI ethics, who leads this space, and leverageable gaps.",
  },
  {
    number: 6,
    prompt:
      "Understand the current usage of AI across higher education, who leads this space, and leverageable gaps.",
  },
  {
    number: 7,
    prompt:
      "Identify leverageable gaps in state-level and national government operations.",
  },
  {
    number: 8,
    prompt:
      "Note examples of state-level and national opportunities (e.g., grand challenges, partnerships).",
  },
];

export function pillarFor(oaId: string): Pillar {
  const oa = opportunityAreas.find((o) => o.id === oaId);
  const id = oa?.pillar ?? "scale";
  return pillars.find((p) => p.id === id)!;
}
