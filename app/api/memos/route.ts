import { NextResponse } from "next/server";
import { getFileSha, putFile, GitHubApiError } from "@/lib/github";
import { pillars, type PillarId } from "@/content/northstar";

export const runtime = "nodejs";

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function escapeFrontmatter(value: string): string {
  const needsQuotes = /[:#\n"']/.test(value);
  if (!needsQuotes) return value;
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

type Payload = {
  title?: unknown;
  summary?: unknown;
  body?: unknown;
  pillar?: unknown;
  oa?: unknown;
  author?: unknown;
  slug?: unknown;
};

export async function POST(req: Request) {
  let payload: Payload;
  try {
    payload = (await req.json()) as Payload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const title = typeof payload.title === "string" ? payload.title.trim() : "";
  const summary =
    typeof payload.summary === "string" ? payload.summary.trim() : "";
  const body = typeof payload.body === "string" ? payload.body.trim() : "";
  const author =
    typeof payload.author === "string" ? payload.author.trim() : "";
  const oa = typeof payload.oa === "string" ? payload.oa.trim() : "";
  const pillarRaw =
    typeof payload.pillar === "string" ? payload.pillar.trim() : "";
  const slugInput =
    typeof payload.slug === "string" ? payload.slug.trim() : "";

  if (!title) {
    return NextResponse.json({ error: "Title is required." }, { status: 400 });
  }
  if (!summary) {
    return NextResponse.json(
      { error: "Summary is required." },
      { status: 400 },
    );
  }
  if (!body) {
    return NextResponse.json({ error: "Body is required." }, { status: 400 });
  }

  const slug = slugInput ? slugify(slugInput) : slugify(title);
  if (!slug || !SLUG_RE.test(slug)) {
    return NextResponse.json(
      { error: "Could not derive a valid slug from title." },
      { status: 400 },
    );
  }

  let pillar: PillarId | undefined;
  if (pillarRaw) {
    if (!pillars.some((p) => p.id === pillarRaw)) {
      return NextResponse.json(
        { error: `Unknown pillar: ${pillarRaw}` },
        { status: 400 },
      );
    }
    pillar = pillarRaw as PillarId;
  }

  const created = new Date().toISOString().slice(0, 10);
  const fmLines = [
    "---",
    `title: ${escapeFrontmatter(title)}`,
    `slug: ${slug}`,
    `summary: ${escapeFrontmatter(summary)}`,
  ];
  if (pillar) fmLines.push(`pillar: ${pillar}`);
  if (oa) fmLines.push(`oa: ${escapeFrontmatter(oa)}`);
  fmLines.push(`created: ${created}`);
  if (author) fmLines.push(`author: ${escapeFrontmatter(author)}`);
  fmLines.push("---", "");

  const file = `${fmLines.join("\n")}\n${body}\n`;
  const path = `content/memos/${slug}.md`;

  try {
    const existingSha = await getFileSha(path);
    if (existingSha) {
      return NextResponse.json(
        { error: `A memo with slug "${slug}" already exists.` },
        { status: 409 },
      );
    }

    const result = await putFile({
      path,
      message: `memo: add ${slug}`,
      content: file,
      committer: {
        name: "UCNFI memo bot",
        email: "memos@ucnfi.invalid",
      },
    });

    return NextResponse.json(
      {
        slug,
        commitSha: result.commitSha,
        commitUrl: result.htmlUrl,
      },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof GitHubApiError) {
      if (err.status === 422) {
        return NextResponse.json(
          { error: `A memo with slug "${slug}" already exists.` },
          { status: 409 },
        );
      }
      console.error("[api/memos] GitHub error:", err.status, err.message);
      return NextResponse.json(
        { error: "Could not publish memo. Check server logs." },
        { status: 500 },
      );
    }
    console.error("[api/memos] Unexpected error:", err);
    return NextResponse.json(
      { error: "Unexpected error while publishing memo." },
      { status: 500 },
    );
  }
}
