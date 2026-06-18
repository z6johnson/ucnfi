/**
 * Minimal Resend client for transactional email.
 *
 * Mirrors the env-assertion style of lib/litellm.ts. Talks to the Resend
 * REST API directly via global fetch (Node 22) so there's no new npm
 * dependency and the module resolves under plain
 * `node --experimental-strip-types` in the CLI scripts.
 *
 * No "server-only" import: used by the weekly-brief CLI, not just Next.js.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/**
 * True only when both the API key and a from-address are present. Callers
 * use this to skip sending silently in local/dev runs where Resend isn't
 * configured.
 */
export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.BRIEF_FROM_EMAIL);
}

export type SendEmailInput = {
  to: string[];
  cc?: string[];
  subject: string;
  html: string;
};

export type SendEmailResult = {
  id: string;
};

/**
 * POST a single email to the Resend API. Throws on a non-2xx response with
 * the response body attached so the caller can log a useful message.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.BRIEF_FROM_EMAIL;
  if (!apiKey) throw new Error("RESEND_API_KEY is not set.");
  if (!from) throw new Error("BRIEF_FROM_EMAIL is not set.");

  const body: Record<string, unknown> = {
    from,
    to: input.to,
    subject: input.subject,
    html: input.html,
  };
  if (input.cc && input.cc.length > 0) body.cc = input.cc;

  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Resend API ${res.status} ${res.statusText}: ${text}`);
  }

  let parsed: { id?: string };
  try {
    parsed = JSON.parse(text) as { id?: string };
  } catch {
    parsed = {};
  }
  return { id: parsed.id ?? "" };
}
