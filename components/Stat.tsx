import type { ReactNode } from "react";

export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="label">{label}</span>
      <span
        className="text-xl font-bold tracking-tight"
        style={{ color: "var(--color-ink)" }}
      >
        {value}
      </span>
      {hint ? (
        <span
          className="text-xs"
          style={{ color: "var(--color-text-subtle)" }}
        >
          {hint}
        </span>
      ) : null}
    </div>
  );
}
