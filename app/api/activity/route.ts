import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

import {
  commitFiles,
  getRepoFileText,
  GitHubApiError,
  type CommitFile,
} from "@/lib/github";
import {
  type ActivityItem,
  type ActivityScope,
  COMMITTEE_SCOPE_ID,
  TOPIC_SCOPE_ID,
  canonicalUrl,
  isoDateUTC,
  isoNowUTC,
  itemId,
} from "@/lib/activity";
import { memberIds } from "@/lib/committee";

export const runtime = "nodejs";
export const maxDuration = 60;

/* ------------------------------------------------------------------ */
/* Config                                                              */
/* ------------------------------------------------------------------ */

const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 MB — a single GitHub blob PUT.
const SNIPPET_MAX = 400;
const TITLE_MAX = 300;

// Uploaded-asset allowlist. Keys are lower-cased extensions.
const ALLOWED_EXT = new Set([
  "pdf",
  "doc",
  "docx",
  "ppt",
  "pptx",
  "txt",
  "md",
  "csv",
  "xls",
  "xlsx",
]);

const UPLOAD_DIR = "public/activity-uploads";
const ACTIVITY_ROOT = "data/ucnfi-committee/activity";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function fieldString(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  if (dot < 0 || dot === filename.length - 1) return "";
  return filename.slice(dot + 1).toLowerCase();
}

function sha256Hex(input: Buffer | string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 32);
}

function resolveScope(
  scope: string,
  memberId: string,
): { scope: ActivityScope; member_id: string } | { error: string } {
  if (scope === "committee") {
    return { scope: "committee", member_id: COMMITTEE_SCOPE_ID };
  }
  if (scope === "topic") {
    return { scope: "topic", member_id: TOPIC_SCOPE_ID };
  }
  if (scope === "member") {
    if (!memberId) return { error: "A member must be selected for member scope." };
    if (!memberIds().includes(memberId)) {
      return { error: `Unknown member: ${memberId}` };
    }
    return { scope: "member", member_id: memberId };
  }
  return { error: `Unknown scope: ${scope}` };
}

/** Validates an optional YYYY-MM-DD date and returns it as an ISO instant. */
function normalizePublishedAt(input: string): string | null {
  if (!input) return null;
  // Accept a plain calendar date; store as a UTC instant for consistency with
  // scan items (which carry full ISO timestamps).
  const t = Date.parse(input.length === 10 ? `${input}T00:00:00.000Z` : input);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString();
}

/* ------------------------------------------------------------------ */
/* Handler                                                             */
/* ------------------------------------------------------------------ */

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart/form-data." },
      { status: 400 },
    );
  }

  const mode = fieldString(form, "mode");
  const title = fieldString(form, "title").slice(0, TITLE_MAX);
  const summary = fieldString(form, "summary");
  const scopeRaw = fieldString(form, "scope");
  const memberIdRaw = fieldString(form, "memberId");
  const urlRaw = fieldString(form, "url");
  const text = typeof form.get("text") === "string" ? (form.get("text") as string) : "";
  const publishedAt = normalizePublishedAt(fieldString(form, "publishedAt"));

  if (!title) {
    return NextResponse.json({ error: "Title is required." }, { status: 400 });
  }

  const scoped = resolveScope(scopeRaw, memberIdRaw);
  if ("error" in scoped) {
    return NextResponse.json({ error: scoped.error }, { status: 400 });
  }

  // Resolve the item's id, public url, and any asset file to commit, per mode.
  let id: string;
  let itemUrl: string;
  let snippet = summary.slice(0, SNIPPET_MAX);
  const assetFiles: CommitFile[] = [];

  if (mode === "link") {
    let parsed: URL;
    try {
      parsed = new URL(urlRaw);
    } catch {
      return NextResponse.json({ error: "A valid URL is required." }, { status: 400 });
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return NextResponse.json(
        { error: "URL must be http(s)." },
        { status: 400 },
      );
    }
    itemUrl = canonicalUrl(urlRaw);
    id = itemId(urlRaw);
  } else if (mode === "text") {
    const body = text.trim();
    if (!body) {
      return NextResponse.json({ error: "Pasted text is required." }, { status: 400 });
    }
    id = sha256Hex(body);
    const path = `${UPLOAD_DIR}/${id}.md`;
    itemUrl = `/activity-uploads/${id}.md`;
    // Archive the pasted text as a titled markdown file.
    assetFiles.push({ path, content: `# ${title}\n\n${body}\n` });
    if (!snippet) snippet = body.replace(/\s+/g, " ").slice(0, SNIPPET_MAX);
  } else if (mode === "file") {
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "A file is required." }, { status: 400 });
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: `File exceeds ${MAX_FILE_BYTES / (1024 * 1024)} MB limit.` },
        { status: 400 },
      );
    }
    const ext = extensionOf(file.name);
    if (!ALLOWED_EXT.has(ext)) {
      return NextResponse.json(
        { error: `Unsupported file type: .${ext || "(none)"}` },
        { status: 400 },
      );
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    id = sha256Hex(bytes);
    const path = `${UPLOAD_DIR}/${id}.${ext}`;
    itemUrl = `/activity-uploads/${id}.${ext}`;
    assetFiles.push({ path, contentBase64: bytes.toString("base64") });
  } else {
    return NextResponse.json(
      { error: "Unknown mode. Expected link, text, or file." },
      { status: 400 },
    );
  }

  const item: ActivityItem = {
    id,
    member_id: scoped.member_id,
    scope: scoped.scope,
    tier: 1,
    source_kind: "manual",
    title,
    url: itemUrl,
    published_at: publishedAt,
    snippet,
    match_reason: "manually added",
    discovered_at: isoNowUTC(),
  };

  const today = isoDateUTC();
  const jsonlPath = `${ACTIVITY_ROOT}/items/${today}.jsonl`;
  const seenPath = `${ACTIVITY_ROOT}/seen.json`;

  try {
    // Read current append-only files (may be absent).
    const [existingJsonl, existingSeenText] = await Promise.all([
      getRepoFileText(jsonlPath),
      getRepoFileText(seenPath),
    ]);

    let seen: Record<string, string> = {};
    if (existingSeenText) {
      try {
        seen = JSON.parse(existingSeenText) as Record<string, string>;
      } catch {
        seen = {};
      }
    }
    if (seen[id]) {
      return NextResponse.json(
        { error: "This source is already in the feed." },
        { status: 409 },
      );
    }
    seen[id] = isoNowUTC();

    const nextJsonl = `${existingJsonl ?? ""}${JSON.stringify(item)}\n`;

    const files: CommitFile[] = [
      ...assetFiles,
      { path: jsonlPath, content: nextJsonl },
      { path: seenPath, content: JSON.stringify(seen, null, 2) + "\n" },
    ];

    const result = await commitFiles({
      message: `activity: add manual item ${id}`,
      files,
      committer: {
        name: "UCOP activity bot",
        email: "activity@ucnfi.invalid",
      },
    });

    return NextResponse.json(
      { id, url: itemUrl, commitSha: result.commitSha, commitUrl: result.htmlUrl },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof GitHubApiError) {
      console.error("[api/activity] GitHub error:", err.status, err.message);
      return NextResponse.json(
        { error: "Could not save item. Check server logs." },
        { status: 502 },
      );
    }
    console.error("[api/activity] Unexpected error:", err);
    return NextResponse.json(
      { error: "Unexpected error while saving item." },
      { status: 500 },
    );
  }
}
