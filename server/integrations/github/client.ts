/**
 * GitHub REST API v3 client.
 * Fetcher is injected by the MCP server so fetchWithAuth handles retries,
 * 401 handling, and 429/5xx backoff (GitHub secondary rate limits).
 *
 * Auth: Bearer (Personal Access Token or GitHub App installation token)
 * Base URL: https://api.github.com
 */

export interface GHIssue {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: string;
  html_url: string;
  labels: Array<{ name: string; color: string }>;
  assignees: Array<{ login: string }>;
  user: { login: string };
  created_at: string;
  updated_at: string;
  comments: number;
  pull_request?: { url: string; merged_at: string | null };
  milestone?: { title: string } | null;
  repository_url?: string;
}

export interface GHPR {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: string;
  html_url: string;
  head: { ref: string; sha: string; repo: { full_name: string } };
  base: { ref: string; sha: string };
  user: { login: string };
  assignees: Array<{ login: string }>;
  labels: Array<{ name: string }>;
  created_at: string;
  updated_at: string;
  merged_at: string | null;
  draft: boolean;
  reviews_url: string;
  additions: number;
  deletions: number;
  changed_files: number;
  mergeable: boolean | null;
  merge_commit_sha: string | null;
}

export interface GHRepo {
  id: number;
  full_name: string;
  description: string | null;
  html_url: string;
  default_branch: string;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  topics: string[];
  visibility: string;
  pushed_at: string;
  created_at: string;
  updated_at: string;
}

export interface GHCommit {
  sha: string;
  commit: {
    message: string;
    author: { name: string; email: string; date: string };
    verification?: { verified: boolean };
  };
  author: { login: string } | null;
  html_url: string;
  stats?: { additions: number; deletions: number; total: number };
}

export interface GHSearchResult<T> {
  total_count: number;
  incomplete_results: boolean;
  items: T[];
}

export type GhFetcher = (path: string, options?: RequestInit) => Promise<Response>;

export class GitHubClient {
  constructor(private readonly fetcher: GhFetcher) {}

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const res = await this.fetcher(path, options);

    if (!res.ok) {
      let errorText = await res.text().catch(() => res.statusText);
      try {
        const errJson = JSON.parse(errorText);
        const msg = errJson?.message ?? errorText;
        if (res.status === 401) throw new GitHubAuthError("GitHub authentication failed — check Personal Access Token");
        if (res.status === 403) {
          const rateLimitRemaining = res.headers.get("X-RateLimit-Remaining");
          if (rateLimitRemaining === "0") {
            const resetAt = res.headers.get("X-RateLimit-Reset");
            const resetTime = resetAt ? new Date(parseInt(resetAt, 10) * 1000).toISOString() : "unknown";
            throw new GitHubRateLimitError(`GitHub rate limit exhausted. Resets at ${resetTime}`);
          }
          throw new Error(`GitHub permission denied: ${msg}`);
        }
        if (res.status === 404) throw new Error(`GitHub resource not found: ${path}`);
        if (res.status === 422) throw new Error(`GitHub validation error: ${msg}`);
        throw new Error(`GitHub API ${res.status}: ${msg}`);
      } catch (e) {
        if (e instanceof GitHubAuthError || e instanceof GitHubRateLimitError ||
            (e as Error).message?.startsWith("GitHub")) throw e;
        throw new Error(`GitHub API ${res.status}: ${errorText}`);
      }
    }

    if (res.status === 204) return {} as T;
    return res.json() as Promise<T>;
  }

  /** Search issues and PRs */
  async searchIssues(
    query: string,
    perPage = 20,
    page = 1
  ): Promise<GHSearchResult<GHIssue>> {
    const sp = new URLSearchParams({
      q: query,
      per_page: String(Math.min(perPage, 100)),
      page: String(page),
    });
    return this.request<GHSearchResult<GHIssue>>(`/search/issues?${sp.toString()}`);
  }

  /** Get a single issue */
  async getIssue(owner: string, repo: string, number: number): Promise<GHIssue> {
    return this.request<GHIssue>(`/repos/${owner}/${repo}/issues/${number}`);
  }

  /** Get issue comments */
  async getIssueComments(owner: string, repo: string, number: number): Promise<
    Array<{ id: number; user: { login: string }; body: string; created_at: string }>
  > {
    return this.request(`/repos/${owner}/${repo}/issues/${number}/comments?per_page=20`);
  }

  /** Create an issue */
  async createIssue(
    owner: string,
    repo: string,
    data: {
      title: string;
      body?: string;
      labels?: string[];
      assignees?: string[];
      milestone?: number;
    }
  ): Promise<GHIssue> {
    return this.request<GHIssue>(`/repos/${owner}/${repo}/issues`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  /** Update an issue */
  async updateIssue(
    owner: string,
    repo: string,
    number: number,
    data: {
      title?: string;
      body?: string;
      state?: "open" | "closed";
      labels?: string[];
      assignees?: string[];
      milestone?: number | null;
    }
  ): Promise<GHIssue> {
    return this.request<GHIssue>(`/repos/${owner}/${repo}/issues/${number}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  /** Add a comment to an issue or PR */
  async addComment(
    owner: string,
    repo: string,
    number: number,
    body: string
  ): Promise<{ id: number; html_url: string }> {
    return this.request<{ id: number; html_url: string }>(
      `/repos/${owner}/${repo}/issues/${number}/comments`,
      { method: "POST", body: JSON.stringify({ body }) }
    );
  }

  /** List PRs for a repository */
  async listPRs(
    owner: string,
    repo: string,
    state: "open" | "closed" | "all" = "open",
    perPage = 20
  ): Promise<GHPR[]> {
    const sp = new URLSearchParams({
      state,
      per_page: String(Math.min(perPage, 100)),
      sort: "updated",
      direction: "desc",
    });
    return this.request<GHPR[]>(`/repos/${owner}/${repo}/pulls?${sp.toString()}`);
  }

  /** Get a single PR */
  async getPR(owner: string, repo: string, number: number): Promise<GHPR> {
    return this.request<GHPR>(`/repos/${owner}/${repo}/pulls/${number}`);
  }

  /** Get PR reviews */
  async getPRReviews(owner: string, repo: string, number: number): Promise<
    Array<{ user: { login: string }; state: string; submitted_at: string; body: string }>
  > {
    return this.request(`/repos/${owner}/${repo}/pulls/${number}/reviews`);
  }

  /** Get PR check runs (CI status) */
  async getPRChecks(owner: string, repo: string, ref: string): Promise<{
    total_count: number;
    check_runs: Array<{ name: string; status: string; conclusion: string | null; html_url: string }>;
  }> {
    return this.request(`/repos/${owner}/${repo}/check-runs?ref=${encodeURIComponent(ref)}&per_page=10`);
  }

  /** Get repository metadata */
  async getRepo(owner: string, repo: string): Promise<GHRepo> {
    return this.request<GHRepo>(`/repos/${owner}/${repo}`);
  }

  /** Search code */
  async searchCode(
    query: string,
    perPage = 20
  ): Promise<GHSearchResult<{
    name: string;
    path: string;
    html_url: string;
    repository: { full_name: string };
    text_matches?: Array<{ fragment: string }>;
  }>> {
    const sp = new URLSearchParams({
      q: query,
      per_page: String(Math.min(perPage, 30)),
    });
    return this.request(`/search/code?${sp.toString()}`);
  }

  /** List commits for a branch */
  async listCommits(
    owner: string,
    repo: string,
    branch?: string,
    perPage = 20,
    since?: string,
    until?: string
  ): Promise<GHCommit[]> {
    const sp = new URLSearchParams({ per_page: String(Math.min(perPage, 100)) });
    if (branch) sp.set("sha", branch);
    if (since) sp.set("since", since);
    if (until) sp.set("until", until);
    return this.request<GHCommit[]>(`/repos/${owner}/${repo}/commits?${sp.toString()}`);
  }
}

export class GitHubAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitHubAuthError";
  }
}

export class GitHubRateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitHubRateLimitError";
  }
}

/** Parse "owner/repo" format into { owner, repo } */
export function parseRepo(fullName: string): { owner: string; repo: string } {
  const parts = fullName.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(`Invalid repository format '${fullName}' — expected 'owner/repo'`);
  }
  return { owner: parts[0], repo: parts[1] };
}

/** GitHub API base URL */
export const GH_BASE = "https://api.github.com";
