/**
 * Synthetic scope identifiers for the activity scan, kept in a
 * dependency-free module (no node:fs / node:path) so client components
 * — e.g. components/brief/BriefItemCard.tsx — can import them without
 * pulling Node built-ins into the browser bundle. Re-exported from
 * lib/activity.ts for server-side callers.
 */

/**
 * Synthetic member_id used for items that mention the steering committee
 * itself rather than a single named member. Lets the existing JSONL +
 * seen-ledger pipeline carry committee-scope items without a parallel
 * storage layer.
 */
export const COMMITTEE_SCOPE_ID = "committee";

/**
 * Synthetic member_id for "field news" — AI-in-higher-education / AI-policy
 * items relevant to the committee's charge that name neither an individual
 * member nor the committee as a body (e.g. a UC study on AI use by students).
 * Rides the same JSONL + seen-ledger pipeline as the other scopes.
 */
export const TOPIC_SCOPE_ID = "topic";
