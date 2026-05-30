import { test } from "node:test";
import assert from "node:assert/strict";

import { entityIds } from "../baseline.ts";
import { entityIdForSourceKey, inventoryByEntity, readInventory } from "./inventory.ts";

const REPO_ROOT = process.cwd();

test("every inventory key maps to a real baseline entity_id", () => {
  const known = new Set(entityIds());
  const inv = readInventory(REPO_ROOT);
  const keys = Object.keys(inv);
  assert.ok(keys.length > 0, "inventory should not be empty");
  for (const key of keys) {
    const mapped = entityIdForSourceKey(key);
    assert.ok(mapped, `inventory key "${key}" did not map to any entity`);
    assert.ok(known.has(mapped!), `inventory key "${key}" mapped to unknown entity "${mapped}"`);
  }
});

test("hyphen→underscore transform handles representative keys", () => {
  assert.equal(entityIdForSourceKey("ucop-systemwide"), "ucop_systemwide");
  assert.equal(entityIdForSourceKey("uc-san-diego"), "uc_san_diego");
  assert.equal(entityIdForSourceKey("ucla"), "ucla");
  assert.equal(entityIdForSourceKey("ucla-health"), "ucla_health");
});

test("an unknown key maps to null rather than a bogus entity", () => {
  assert.equal(entityIdForSourceKey("not-a-real-campus"), null);
});

test("inventoryByEntity leaves nothing unmapped for the shipped inventory", () => {
  const { unmapped } = inventoryByEntity(REPO_ROOT);
  assert.equal(unmapped.length, 0, `unexpected unmapped keys: ${unmapped.map((u) => u.key).join(", ")}`);
});
