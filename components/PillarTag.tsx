import type { Pillar } from "@/content/northstar";

export function PillarTag({ pillar }: { pillar: Pillar }) {
  return (
    <span
      className="label"
      style={{
        color: `var(${pillar.cssVar})`,
        letterSpacing: "0.1em",
      }}
    >
      {pillar.name}
    </span>
  );
}
