/**
 * Feed #1 — external developments forcing a UC decision.
 *
 * Reads RSS endpoints from data/brief/sources_config.json under
 * `external`, applies the brief-specific keyword filter, and emits
 * BriefRawItem with feed_kind="external".
 */

import { collectFromRss } from "./rss.ts";
import type { BriefRawItem, SourcesConfig } from "../types.ts";

export type CollectExternalOpts = {
  config: SourcesConfig;
  lookbackDays: number;
};

export async function collectExternal(
  opts: CollectExternalOpts,
): Promise<BriefRawItem[]> {
  const tasks: Promise<BriefRawItem[]>[] = [];
  for (const source of opts.config.external) {
    tasks.push(
      collectFromRss(source.url, {
        feedKind: "external",
        subkind: source.subkind,
        lookbackDays: opts.lookbackDays,
        skipKeywordFilter: source.skip_ai_filter,
        contextLabel: source.url,
      }).catch((err: unknown) => {
        console.warn(
          `[brief] external feed failed url=${source.url} err=${(err as Error).message}`,
        );
        return [] as BriefRawItem[];
      }),
    );
  }
  const out: BriefRawItem[] = [];
  for (const r of await Promise.all(tasks)) out.push(...r);
  return out;
}
