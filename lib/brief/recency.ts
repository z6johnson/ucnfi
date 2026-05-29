/**
 * Recency window for the weekly Brief.
 *
 * Single source of truth shared by the feed collectors (lib/brief/sources/*)
 * and the validator (lib/brief/validate.ts) so "is this item fresh enough
 * for the Brief?" is answered the same way everywhere.
 *
 * Two rules, decided deliberately:
 *   1. The window is anchored to the Brief's endDate, never wall-clock now,
 *      so regenerating or backfilling a past Brief is deterministic.
 *   2. When published_at is missing or unparseable we fall back to the
 *      scan's discovered_at as a recency proxy. An item is dropped only if
 *      neither timestamp lands inside the window.
 */

function isoDateUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export type WindowBounds = {
  /** Inclusive UTC start of the window (ms since epoch). */
  startMs: number;
  /** Inclusive UTC end-of-day of the window (ms since epoch). */
  endMs: number;
  /** ISO date (YYYY-MM-DD) for startMs — matches the inputs manifest "from". */
  startIso: string;
  /** ISO date (YYYY-MM-DD) for endMs — matches the inputs manifest "to". */
  endIso: string;
};

/**
 * The window for a Brief ending on `endDate` and reaching back `days` days
 * (inclusive of the end date). For days=7 ending 2026-05-28 this is
 * 2026-05-22T00:00:00Z .. 2026-05-28T23:59:59.999Z, matching the manifest.
 */
export function windowBounds(endDate: Date, days: number): WindowBounds {
  const endIso = isoDateUTC(endDate);
  const start = new Date(endDate);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  const startIso = isoDateUTC(start);
  return {
    startMs: Date.parse(`${startIso}T00:00:00.000Z`),
    endMs: Date.parse(`${endIso}T23:59:59.999Z`),
    startIso,
    endIso,
  };
}

/**
 * Best available timestamp for an item: published_at if parseable, else
 * discovered_at, else null (no usable date).
 */
export function effectiveDateMs(item: {
  published_at: string | null;
  discovered_at?: string | null;
}): number | null {
  if (item.published_at) {
    const t = Date.parse(item.published_at);
    if (Number.isFinite(t)) return t;
  }
  if (item.discovered_at) {
    const t = Date.parse(item.discovered_at);
    if (Number.isFinite(t)) return t;
  }
  return null;
}

/**
 * Fresh iff the item's effective date falls within [startMs, endMs].
 * No usable date ⇒ not fresh (we already tried the discovered_at fallback).
 */
export function isFresh(
  item: { published_at: string | null; discovered_at?: string | null },
  startMs: number,
  endMs: number,
): boolean {
  const t = effectiveDateMs(item);
  if (t === null) return false;
  return t >= startMs && t <= endMs;
}
