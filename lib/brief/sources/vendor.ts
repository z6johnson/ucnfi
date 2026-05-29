/**
 * Feed #3 — vendor and capability shifts.
 *
 * Currently RSS-only. The plan calls for an optional Claude web_search
 * supplement for enterprise deals, pricing, and incidents where RSS is
 * thin; that's a follow-up because the wet run for the first brief
 * should be reproducible without LLM-search noise. The brief generator
 * already calls Claude once for synthesis — adding a second LLM call
 * here doubles the cost and the noise per run with no proof yet that
 * RSS alone misses the things that matter.
 */

import { collectFromRss } from "./rss.ts";
import type { BriefRawItem, SourcesConfig } from "../types.ts";

export type CollectVendorOpts = {
  config: SourcesConfig;
  lookbackDays: number;
  endDate: Date;
};

export async function collectVendor(
  opts: CollectVendorOpts,
): Promise<BriefRawItem[]> {
  const tasks: Promise<BriefRawItem[]>[] = [];
  for (const source of opts.config.vendor) {
    tasks.push(
      collectFromRss(source.url, {
        feedKind: "vendor",
        subkind: source.subkind,
        lookbackDays: opts.lookbackDays,
        endDate: opts.endDate,
        skipKeywordFilter: source.skip_ai_filter,
        contextLabel: source.url,
      }).catch((err: unknown) => {
        console.warn(
          `[brief] vendor feed failed url=${source.url} err=${(err as Error).message}`,
        );
        return [] as BriefRawItem[];
      }),
    );
  }
  const out: BriefRawItem[] = [];
  for (const r of await Promise.all(tasks)) out.push(...r);
  return out;
}
