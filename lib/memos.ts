/**
 * Memo loader. Memos are stored as markdown files with a minimal YAML
 * frontmatter block under `content/memos/`. This is intentionally
 * file-based for v1 so we don't need a database on the critical path
 * to "presentable" — the files ship with the repo and are rendered at
 * build time.
 *
 * Server-only. All memo rendering pages use `force-static` so the
 * filesystem read happens once per deploy.
 */

import "server-only";

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pillars, type PillarId } from "@/content/northstar";

export type MemoFrontmatter = {
  title: string;
  slug: string;
  summary: string;
  pillar?: PillarId;
  oa?: string;
  created: string; // ISO date
  author?: string;
};

export type Memo = MemoFrontmatter & {
  body: string;
};

const MEMOS_DIR = join(process.cwd(), "content", "memos");

/**
 * Parse a very small frontmatter subset:
 *
 *   ---
 *   key: value
 *   key: value
 *   ---
 *
 * No nested YAML, no arrays. Sufficient for memo metadata.
 */
function parseFrontmatter(source: string): {
  data: Record<string, string>;
  body: string;
} {
  if (!source.startsWith("---")) {
    return { data: {}, body: source };
  }
  const end = source.indexOf("\n---", 3);
  if (end === -1) {
    return { data: {}, body: source };
  }
  const head = source.slice(3, end).trim();
  const body = source.slice(end + 4).replace(/^\n/, "");
  const data: Record<string, string> = {};
  for (const line of head.split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    data[key] = value;
  }
  return { data, body };
}

function assertFrontmatter(
  data: Record<string, string>,
  file: string,
): MemoFrontmatter {
  const required = ["title", "slug", "summary", "created"] as const;
  for (const key of required) {
    if (!data[key]) {
      throw new Error(`Memo ${file} is missing required frontmatter: ${key}`);
    }
  }
  const pillarId = data.pillar as PillarId | undefined;
  if (pillarId && !pillars.some((p) => p.id === pillarId)) {
    throw new Error(`Memo ${file} has unknown pillar: ${pillarId}`);
  }
  return {
    title: data.title,
    slug: data.slug,
    summary: data.summary,
    pillar: pillarId,
    oa: data.oa,
    created: data.created,
    author: data.author,
  };
}

let cache: Memo[] | null = null;

export function listMemos(): Memo[] {
  if (cache) return cache;
  let files: string[];
  try {
    files = readdirSync(MEMOS_DIR).filter((f) => f.endsWith(".md"));
  } catch {
    cache = [];
    return cache;
  }
  const memos: Memo[] = [];
  for (const file of files) {
    const raw = readFileSync(join(MEMOS_DIR, file), "utf-8");
    const { data, body } = parseFrontmatter(raw);
    const fm = assertFrontmatter(data, file);
    memos.push({ ...fm, body });
  }
  memos.sort((a, b) => b.created.localeCompare(a.created));
  cache = memos;
  return memos;
}

export function getMemo(slug: string): Memo | undefined {
  return listMemos().find((m) => m.slug === slug);
}

export function memoSlugs(): string[] {
  return listMemos().map((m) => m.slug);
}

export function invalidateMemoCache(): void {
  cache = null;
}

export function memosDir(): string {
  return MEMOS_DIR;
}
