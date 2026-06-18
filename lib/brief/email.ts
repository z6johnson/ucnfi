/**
 * Weekly Brief → email.
 *
 * Renders a published BriefEdition to a self-contained, inline-styled HTML
 * email and sends it to the committee chairs (To) and support team (Cc) via
 * Resend. Recipients come from env vars so no PII is committed to the repo.
 *
 * Wired into scripts/brief-weekly.ts: emailBrief(edition) runs right after a
 * fresh edition is written. Sending is best-effort — the caller catches and
 * logs any failure so a Resend outage never fails the brief run.
 *
 * No "server-only" import: shared by the CLI generator, not just Next.js.
 */

import { isEmailConfigured, sendEmail } from "../email/resend.ts";
import type { BriefEdition, BriefItem } from "./types.ts";

/** Public base URL for the /brief link. Mirrors the share-link default. */
const NFI_BASE_URL = process.env.NFI_BASE_URL || "http://localhost:3000";

/** Labels match the on-page section headers in lib/brief/storage.ts. */
const SECTION_LABELS: Array<{ key: keyof BriefItem; label: string }> = [
  { key: "what_happened", label: "What happened" },
  { key: "why_it_matters", label: "Why it matters to UC" },
  { key: "for_the_committee", label: "For the committee" },
];

export type BriefRecipients = {
  chairs: string[];
  support: string[];
};

/**
 * Parse BRIEF_TO_CHAIRS and BRIEF_TO_SUPPORT (comma/semicolon-separated email
 * lists) into deduped, trimmed arrays. Chairs land in To, support in Cc.
 */
export function briefRecipients(): BriefRecipients {
  return {
    chairs: parseList(process.env.BRIEF_TO_CHAIRS),
    support: parseList(process.env.BRIEF_TO_SUPPORT),
  };
}

function parseList(raw: string | undefined): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[,;]/)) {
    const email = part.trim();
    if (!email) continue;
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(email);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* HTML rendering                                                      */
/* ------------------------------------------------------------------ */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Render plain-ish prose: escape HTML, autolink bare URLs, split on blank
 * lines into paragraphs. Dependency-free — react-markdown is React/JSX-only
 * and can't emit a standalone email string.
 */
function renderProse(text: string): string {
  const blocks = text.trim().split(/\n\s*\n/);
  return blocks
    .map((block) => {
      const escaped = escapeHtml(block.trim()).replace(/\n/g, "<br />");
      const linked = escaped.replace(
        /(https?:\/\/[^\s<]+)/g,
        (url) =>
          `<a href="${url}" style="color:#0b5cad;">${url}</a>`,
      );
      return `<p style="margin:0 0 12px;line-height:1.5;">${linked}</p>`;
    })
    .join("\n");
}

function renderItem(item: BriefItem): string {
  const sections = SECTION_LABELS.map(({ key, label }) => {
    const prose = String(item[key] ?? "");
    return `
        <h3 style="margin:16px 0 6px;font-size:13px;text-transform:uppercase;letter-spacing:0.04em;color:#64748b;">${escapeHtml(
          label,
        )}</h3>
        ${renderProse(prose)}`;
  }).join("\n");

  return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border:1px solid #e2e8f0;border-radius:8px;">
        <tr><td style="padding:20px;">
          <h2 style="margin:0;font-size:18px;line-height:1.3;color:#0f172a;">${escapeHtml(
            item.headline,
          )}</h2>
          ${sections}
        </td></tr>
      </table>`;
}

export type RenderedBriefEmail = {
  subject: string;
  html: string;
};

export function renderBriefEmail(edition: BriefEdition): RenderedBriefEmail {
  const subject = `UC President's Brief — ${edition.edition_id} (week ending ${edition.week_ending})`;
  const briefUrl = `${NFI_BASE_URL.replace(/\/+$/, "")}/brief`;
  const itemCount = edition.items.length;
  const itemsHtml = edition.items.map(renderItem).join("\n");

  const html = `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 0;">
      <tr><td align="center">
        <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border-radius:12px;overflow:hidden;">
          <tr><td style="padding:28px 28px 8px;">
            <p style="margin:0 0 4px;font-size:13px;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;">UC President's Brief</p>
            <h1 style="margin:0;font-size:22px;color:#0f172a;">${escapeHtml(
              edition.edition_id,
            )}</h1>
            <p style="margin:6px 0 0;font-size:14px;color:#475569;">Week ending ${escapeHtml(
              edition.week_ending,
            )} · ${itemCount} item${itemCount === 1 ? "" : "s"}</p>
            <p style="margin:16px 0 0;">
              <a href="${briefUrl}" style="display:inline-block;padding:10px 18px;background:#0b5cad;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;">View on the web →</a>
            </p>
          </td></tr>
          <tr><td style="padding:20px 28px 4px;">
${itemsHtml}
          </td></tr>
          <tr><td style="padding:8px 28px 28px;border-top:1px solid #e2e8f0;">
            <p style="margin:12px 0 0;font-size:12px;color:#94a3b8;line-height:1.5;">
              Auto-generated by the UCNFI weekly brief pipeline. Read the full edition with sources and committee anchors at
              <a href="${briefUrl}" style="color:#0b5cad;">${escapeHtml(briefUrl)}</a>.
            </p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  return { subject, html };
}

/* ------------------------------------------------------------------ */
/* Orchestration                                                       */
/* ------------------------------------------------------------------ */

/**
 * Email a freshly written edition to chairs (To) + support (Cc). Skips
 * silently when Resend isn't configured or no recipients are set. Honors
 * EMAIL_DRY_RUN=1 to render and log without contacting Resend. Throws on a
 * real send failure so the caller can log it (non-fatal to the brief run).
 */
export async function emailBrief(edition: BriefEdition): Promise<void> {
  const dryRun =
    process.env.EMAIL_DRY_RUN === "1" || process.env.EMAIL_DRY_RUN === "true";

  if (!dryRun && !isEmailConfigured()) {
    console.info(
      "[brief] email skipped (RESEND_API_KEY/BRIEF_FROM_EMAIL unset)",
    );
    return;
  }

  const { chairs, support } = briefRecipients();
  if (chairs.length === 0 && support.length === 0) {
    console.info(
      "[brief] email skipped (no BRIEF_TO_CHAIRS/BRIEF_TO_SUPPORT recipients)",
    );
    return;
  }

  // Resend requires at least one To address; promote support to To when no
  // chairs are configured.
  const to = chairs.length > 0 ? chairs : support;
  const cc = chairs.length > 0 ? support : [];

  const { subject, html } = renderBriefEmail(edition);

  if (dryRun) {
    console.info(
      `[brief] EMAIL_DRY_RUN — would send "${subject}" ` +
        `to ${to.length} (${chairs.length} chair(s)) + cc ${cc.length} support; ` +
        `html=${html.length} bytes`,
    );
    return;
  }

  const { id } = await sendEmail({ to, cc, subject, html });
  console.info(
    `[brief] emailed ${id || "(no id)"} to ${chairs.length} chair(s) + ${support.length} support`,
  );
}
