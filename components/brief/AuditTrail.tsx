import type { BriefEdition } from "@/lib/brief/types";

type Props = {
  edition: BriefEdition;
};

export function AuditTrail({ edition }: Props) {
  return (
    <footer className="hairline mt-12 pt-4 text-xs" style={{ color: "var(--color-text-subtle)" }}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {edition.reviewed_by ? (
          <span>
            Reviewed by <strong>{edition.reviewed_by}</strong>
            {edition.reviewed_at ? ` on ${edition.reviewed_at.slice(0, 10)}` : ""}
          </span>
        ) : (
          <span style={{ color: "var(--color-warn-strong)" }}>
            Reviewer not recorded
          </span>
        )}
        <span aria-hidden>·</span>
        <span>
          Generated {edition.generated_at.slice(0, 10)} by {edition.generated_by_model}
        </span>
        <span aria-hidden>·</span>
        <span>
          {edition.inputs_manifest.external.n} external · {edition.inputs_manifest.peer.n} peer ·{" "}
          {edition.inputs_manifest.vendor.n} vendor ·{" "}
          {edition.inputs_manifest.committee_signal_dates.length}-day committee window
        </span>
      </div>
      <p className="mt-2 italic">
        AI-assembled, human-reviewed. Drafts are not sent to the President — only
        editions a reviewer has explicitly published reach this page.
      </p>
    </footer>
  );
}
