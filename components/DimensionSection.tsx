import {
  DIMENSION_LABEL,
  humanizeField,
  type DimensionId,
  type FieldRecord,
} from "@/lib/baseline";

type Props = {
  dimension: DimensionId;
  fields: Array<[string, FieldRecord]>;
};

function renderValue(value: FieldRecord["value"]) {
  if (value === true) return "Yes";
  if (value === false) return "No";
  if (value === null || value === undefined) return "—";
  return String(value);
}

function valueTone(value: FieldRecord["value"]) {
  if (value === true) return "var(--color-accent)";
  if (value === false) return "var(--color-text-subtle)";
  return "var(--color-ink)";
}

export function DimensionSection({ dimension, fields }: Props) {
  if (fields.length === 0) return null;
  return (
    <section className="mt-10">
      <header className="hairline flex items-baseline justify-between pb-2">
        <h2 className="display" style={{ fontSize: "var(--text-lg)" }}>
          {DIMENSION_LABEL[dimension]}
        </h2>
        <span className="label">{fields.length} fields</span>
      </header>
      <ul className="mt-4 flex flex-col gap-6">
        {fields.map(([name, record]) => (
          <li key={name} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-4">
              <span
                className="text-sm font-semibold"
                style={{ color: "var(--color-text)" }}
              >
                {humanizeField(name)}
              </span>
              <span
                className="text-sm font-semibold"
                style={{ color: valueTone(record.value) }}
              >
                {renderValue(record.value)}
              </span>
            </div>
            {record.notes ? (
              <p
                className="text-sm"
                style={{ color: "var(--color-text-muted)" }}
              >
                {record.notes}
              </p>
            ) : null}
            {record.source_id || record.source_url ? (
              <div className="flex items-center gap-3 pt-1">
                {record.source_id ? (
                  <span className="label">{record.source_id}</span>
                ) : null}
                {record.source_url ? (
                  <a
                    href={record.source_url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-xs"
                  >
                    Source ↗
                  </a>
                ) : null}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
