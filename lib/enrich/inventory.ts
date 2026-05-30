/**
 * Source-registry access for the enrichment pipeline.
 *
 * Loads data/inventory_urls.json (entity_key → InventorySource[]) and owns
 * the mapping between the inventory's hyphenated top-level keys
 * (e.g. "ucop-systemwide", "uc-san-diego") and the baseline's underscored
 * entity_ids (e.g. "ucop_systemwide", "uc_san_diego").
 *
 * Correctness-critical: a silent miss here would drop an entity from the
 * monthly sweep. Every inventory key is asserted to resolve to a real
 * baseline entity, and the mapping is unit-tested over all keys.
 *
 * No "server-only" import: read by Node CLI scripts.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { entityIds } from "../baseline.ts";
import type { InventorySource } from "./types.ts";

export type InventoryMap = Record<string, InventorySource[]>;

export function inventoryPath(repoRoot: string): string {
  return join(repoRoot, "data", "inventory_urls.json");
}

export function readInventory(repoRoot: string): InventoryMap {
  const p = inventoryPath(repoRoot);
  if (!existsSync(p)) return {};
  return JSON.parse(readFileSync(p, "utf-8")) as InventoryMap;
}

/**
 * Explicit overrides for any inventory key that does NOT map to a baseline
 * entity_id by the plain hyphen→underscore transform. Currently empty —
 * every key transforms cleanly — but kept as the documented escape hatch so
 * a future irregular key has an obvious home.
 */
const KEY_OVERRIDES: Record<string, string> = {};

/**
 * Maps an inventory top-level key to a baseline entity_id. Returns null if
 * the resulting id is not a known baseline entity (so callers can flag the
 * orphan rather than silently extracting against a non-existent entity).
 */
export function entityIdForSourceKey(key: string): string | null {
  const mapped = KEY_OVERRIDES[key] ?? key.replace(/-/g, "_");
  return entityIds().includes(mapped) ? mapped : null;
}

/**
 * All inventory sources grouped by baseline entity_id. Keys that don't
 * resolve to a baseline entity are collected under `unmapped` so a sweep
 * can warn instead of dropping them.
 */
export function inventoryByEntity(repoRoot: string): {
  byEntity: Map<string, InventorySource[]>;
  unmapped: Array<{ key: string; sources: InventorySource[] }>;
} {
  const inv = readInventory(repoRoot);
  const byEntity = new Map<string, InventorySource[]>();
  const unmapped: Array<{ key: string; sources: InventorySource[] }> = [];
  for (const [key, sources] of Object.entries(inv)) {
    const entityId = entityIdForSourceKey(key);
    if (!entityId) {
      unmapped.push({ key, sources });
      continue;
    }
    const existing = byEntity.get(entityId) ?? [];
    existing.push(...sources);
    byEntity.set(entityId, existing);
  }
  return { byEntity, unmapped };
}

/** Flat list of every inventory source across all keys. */
export function allInventorySources(repoRoot: string): InventorySource[] {
  return Object.values(readInventory(repoRoot)).flat();
}
