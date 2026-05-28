import Link from "next/link";
import type { GapMatrix } from "@/lib/brief/gaps";

type Props = {
  matrix: GapMatrix;
};

export function GapMatrixTable({ matrix }: Props) {
  return (
    <div className="mt-8 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className="label text-left py-2 pr-4 border-b" style={{ borderColor: "var(--color-border-hair)" }}>
              Dimension
            </th>
            <th className="label text-right py-2 pr-4 border-b" style={{ borderColor: "var(--color-border-hair)" }}>
              UC has position
            </th>
            <th className="label text-right py-2 pr-4 border-b" style={{ borderColor: "var(--color-border-hair)" }}>
              UC silent
            </th>
            <th className="label text-right py-2 pr-4 border-b" style={{ borderColor: "var(--color-border-hair)" }}>
              UC contradicts
            </th>
            <th className="label text-right py-2 pr-4 border-b" style={{ borderColor: "var(--color-border-hair)" }}>
              Peers ahead
            </th>
            <th className="label text-left py-2 pr-4 border-b" style={{ borderColor: "var(--color-border-hair)" }}>
              Peer example
            </th>
          </tr>
        </thead>
        <tbody>
          {matrix.rows.map((row) => (
            <tr key={row.dimension}>
              <td className="py-3 pr-4 border-b" style={{ borderColor: "var(--color-border-hair)" }}>
                <Link
                  href={`/brief/gaps/${row.dimension}`}
                  className="font-semibold no-underline hover:underline"
                  style={{ color: "var(--color-ink)" }}
                >
                  {row.label}
                </Link>
              </td>
              <td className="py-3 pr-4 text-right border-b" style={{ borderColor: "var(--color-border-hair)", color: "var(--color-accent)" }}>
                {row.uc_has_position}
              </td>
              <td className="py-3 pr-4 text-right border-b" style={{ borderColor: "var(--color-border-hair)", color: "var(--color-warn)" }}>
                {row.uc_silent}
              </td>
              <td className="py-3 pr-4 text-right border-b" style={{ borderColor: "var(--color-border-hair)", color: "var(--color-warn-strong)" }}>
                {row.uc_contradicts}
              </td>
              <td className="py-3 pr-4 text-right border-b" style={{ borderColor: "var(--color-border-hair)" }}>
                {row.peers_ahead}
              </td>
              <td className="py-3 pr-4 border-b text-xs" style={{ borderColor: "var(--color-border-hair)", color: "var(--color-text-muted)" }}>
                {row.peer_example
                  ? `${row.peer_example.peer_name} · ${row.peer_example.field}`
                  : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
