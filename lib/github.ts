/**
 * Minimal GitHub Contents API wrapper.
 *
 * Used to commit new memo markdown files to the repo on Vercel, where the
 * serverless filesystem is read-only. Committing to the configured branch
 * triggers a Vercel redeploy via the standard Git integration, which is how
 * the new memo becomes visible on the live site.
 */

import "server-only";

const API_BASE = "https://api.github.com";
const API_VERSION = "2022-11-28";
const USER_AGENT = "ucnfi-memos";

export class GitHubApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "GitHubApiError";
  }
}

type GitHubConfig = {
  token: string;
  repo: string; // owner/repo
  branch: string;
};

function config(): GitHubConfig {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;
  if (!token) throw new GitHubApiError(500, "GITHUB_TOKEN is not set.");
  if (!repo || !repo.includes("/")) {
    throw new GitHubApiError(
      500,
      "GITHUB_REPO must be set in the form owner/repo.",
    );
  }
  return {
    token,
    repo,
    branch: process.env.GITHUB_BRANCH?.trim() || "main",
  };
}

function headers(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": API_VERSION,
    "User-Agent": USER_AGENT,
  };
}

export async function getFileSha(path: string): Promise<string | null> {
  const { token, repo, branch } = config();
  const url = `${API_BASE}/repos/${repo}/contents/${encodeURI(path)}?ref=${encodeURIComponent(branch)}`;
  const res = await fetch(url, { headers: headers(token), cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new GitHubApiError(
      res.status,
      `GitHub GET contents failed (${res.status}): ${body.slice(0, 200)}`,
    );
  }
  const data = (await res.json()) as { sha?: string };
  return data.sha ?? null;
}

/**
 * Read a file's current UTF-8 text from the configured branch, or null if it
 * doesn't exist (404). Used to read the append-only activity JSONL and the
 * seen ledger before adding a manually-curated item.
 */
export async function getRepoFileText(path: string): Promise<string | null> {
  const { token, repo, branch } = config();
  const url = `${API_BASE}/repos/${repo}/contents/${encodeURI(path)}?ref=${encodeURIComponent(branch)}`;
  const res = await fetch(url, { headers: headers(token), cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new GitHubApiError(
      res.status,
      `GitHub GET contents failed (${res.status}): ${body.slice(0, 200)}`,
    );
  }
  const data = (await res.json()) as { content?: string; encoding?: string };
  if (typeof data.content !== "string") return "";
  // The Contents API returns base64 (newline-wrapped) regardless of encoding.
  return Buffer.from(data.content, "base64").toString("utf-8");
}

/**
 * One file to include in a multi-file commit. Provide either UTF-8 `content`
 * (text) or pre-encoded `contentBase64` (binary, e.g. an uploaded PDF).
 */
export type CommitFile =
  | { path: string; content: string }
  | { path: string; contentBase64: string };

export type CommitFilesResult = {
  commitSha: string;
  htmlUrl: string;
};

/**
 * Commit several files (text and/or binary) in a single atomic commit via the
 * Git Data API. One commit → one Vercel rebuild, and no per-file read-modify-
 * write race: only the final ref update can conflict, which we retry once.
 *
 * Used by the manual "add to activity feed" flow to land an uploaded asset,
 * the appended items JSONL, and the updated seen ledger together.
 */
export async function commitFiles(params: {
  message: string;
  files: CommitFile[];
  committer?: { name: string; email: string };
}): Promise<CommitFilesResult> {
  const { token, repo, branch } = config();
  const h = headers(token);
  const jsonHeaders = { ...h, "Content-Type": "application/json" };

  async function gh<T>(
    method: string,
    apiPath: string,
    body?: unknown,
  ): Promise<T> {
    const res = await fetch(`${API_BASE}/repos/${repo}${apiPath}`, {
      method,
      headers: body ? jsonHeaders : h,
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new GitHubApiError(
        res.status,
        `GitHub ${method} ${apiPath} failed (${res.status}): ${text.slice(0, 200)}`,
      );
    }
    return (await res.json()) as T;
  }

  // Create the blobs once — they're content-addressed and independent of the
  // branch tip, so they survive a ref-conflict retry.
  const blobs = await Promise.all(
    params.files.map(async (f) => {
      const isBinary = "contentBase64" in f;
      const blob = await gh<{ sha: string }>("POST", "/git/blobs", {
        content: isBinary ? f.contentBase64 : f.content,
        encoding: isBinary ? "base64" : "utf-8",
      });
      return { path: f.path, sha: blob.sha };
    }),
  );

  // Branch names may contain slashes (e.g. "release/1.x"); percent-encoding
  // them would break the ref path, so encode each segment but keep the "/".
  const branchRef = branch.split("/").map(encodeURIComponent).join("/");

  const attempt = async (): Promise<CommitFilesResult> => {
    const ref = await gh<{ object: { sha: string } }>(
      "GET",
      `/git/ref/heads/${branchRef}`,
    );
    const parentSha = ref.object.sha;
    const parentCommit = await gh<{ tree: { sha: string } }>(
      "GET",
      `/git/commits/${parentSha}`,
    );
    const tree = await gh<{ sha: string }>("POST", "/git/trees", {
      base_tree: parentCommit.tree.sha,
      tree: blobs.map((b) => ({
        path: b.path,
        mode: "100644",
        type: "blob",
        sha: b.sha,
      })),
    });
    const commit = await gh<{ sha: string; html_url: string }>(
      "POST",
      "/git/commits",
      {
        message: params.message,
        tree: tree.sha,
        parents: [parentSha],
        ...(params.committer ? { committer: params.committer } : {}),
      },
    );
    await gh("PATCH", `/git/refs/heads/${branchRef}`, {
      sha: commit.sha,
      force: false,
    });
    return { commitSha: commit.sha, htmlUrl: commit.html_url };
  };

  try {
    return await attempt();
  } catch (err) {
    // A concurrent write (another manual add, or the daily scan pushing to the
    // same branch) moves the tip and the non-fast-forward PATCH 422s. Rebuild
    // the tree on the new tip and retry once.
    if (err instanceof GitHubApiError && (err.status === 422 || err.status === 409)) {
      return await attempt();
    }
    throw err;
  }
}

export type PutFileResult = {
  sha: string;
  commitSha: string;
  htmlUrl: string;
};

export async function putFile(params: {
  path: string;
  message: string;
  content: string; // raw UTF-8
  committer?: { name: string; email: string };
}): Promise<PutFileResult> {
  const { token, repo, branch } = config();
  const url = `${API_BASE}/repos/${repo}/contents/${encodeURI(params.path)}`;
  const body = {
    message: params.message,
    content: Buffer.from(params.content, "utf-8").toString("base64"),
    branch,
    ...(params.committer ? { committer: params.committer } : {}),
  };
  const res = await fetch(url, {
    method: "PUT",
    headers: { ...headers(token), "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new GitHubApiError(
      res.status,
      `GitHub PUT contents failed (${res.status}): ${text.slice(0, 200)}`,
    );
  }
  const data = (await res.json()) as {
    content?: { sha?: string };
    commit?: { sha?: string; html_url?: string };
  };
  return {
    sha: data.content?.sha ?? "",
    commitSha: data.commit?.sha ?? "",
    htmlUrl: data.commit?.html_url ?? "",
  };
}
