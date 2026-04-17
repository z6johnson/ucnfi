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
