/**
 * Admin session: a single-password cookie gate for editing routes
 * (today, just memo creation). Stateless — the cookie value is an HMAC
 * of a fixed payload keyed by ADMIN_PASSWORD, so rotating the password
 * invalidates every existing session.
 *
 * Uses Web Crypto so the helpers work in both Node (API routes) and
 * Edge (middleware) runtimes.
 */

export const ADMIN_COOKIE = "ucnfi_admin";
const SESSION_PAYLOAD = "ucnfi-admin-v1";
export const ADMIN_SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

const encoder = new TextEncoder();

function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

async function hmacHex(key: string, payload: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    encoder.encode(payload),
  );
  return toHex(sig);
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function signSession(): Promise<string | null> {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return null;
  return hmacHex(pw, SESSION_PAYLOAD);
}

export async function verifySession(
  cookieValue: string | undefined,
): Promise<boolean> {
  if (!cookieValue) return false;
  const expected = await signSession();
  if (!expected) return false;
  return constantTimeEqual(cookieValue, expected);
}

// Constant-time password compare. Length mismatch leaks only the length,
// acceptable for a solo-admin gate.
export function passwordMatches(input: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  return constantTimeEqual(input, expected);
}
