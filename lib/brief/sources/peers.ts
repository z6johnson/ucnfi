/**
 * Feed #2 — peer institution moves.
 *
 * RSS feeds per peer, stamped with the peer_id so the synthesis layer
 * can link moves back to peer baseline records.
 */

import { collectFromRss } from "./rss.ts";
import type { BriefRawItem, SourcesConfig } from "../types.ts";

export type CollectPeersOpts = {
  config: SourcesConfig;
  lookbackDays: number;
};

export async function collectPeerMoves(
  opts: CollectPeersOpts,
): Promise<BriefRawItem[]> {
  const tasks: Promise<BriefRawItem[]>[] = [];
  for (const source of opts.config.peers) {
    tasks.push(
      collectFromRss(source.url, {
        feedKind: "peer",
        subkind: source.peer_id,
        lookbackDays: opts.lookbackDays,
        peerId: source.peer_id,
        contextLabel: source.url,
      }).catch((err: unknown) => {
        console.warn(
          `[brief] peer feed failed peer=${source.peer_id} url=${source.url} err=${(err as Error).message}`,
        );
        return [] as BriefRawItem[];
      }),
    );
  }
  const out: BriefRawItem[] = [];
  for (const r of await Promise.all(tasks)) out.push(...r);
  return out;
}
