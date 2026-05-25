/**
 * GitHub tool implementations — 10 tools.
 * Each function receives a GitHubClient and the validated args.
 */

import { GitHubClient, parseRepo } from "./client";
import type { McpToolResult } from "../../real-mcp-base";

// ── Tool: gh_search_issues ────────────────────────────────────────────────────

export async function gh_search_issues(
  client: GitHubClient,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  const repo = args.repo as string | undefined;
  const query = args.query as string | undefined;
  const state = (args.state as string | undefined) ?? "open";
  const label = args.label as string | undefined;
  const assignee = args.assignee as string | undefined;
  const is_pr = args.is_pr as boolean | undefined;
  const per_page = Math.min(Number(args.per_page ?? 20), 50);
  const page = Number(args.page ?? 1);

  let q = query ?? "";
  if (repo) q += ` repo:${repo}`;
  if (state && state !== "all") q += ` state:${state}`;
  if (label) q += ` label:"${label}"`;
  if (assignee) q += ` assignee:${assignee}`;
  if (is_pr === true) q += " is:pr";
  else if (is_pr === false) q += " is:issue";

  const result = await client.searchIssues(q.trim(), per_page, page);

  const items = result.items.map(i => ({
    number: i.number,
    title: i.title,
    state: i.state,
    is_pr: !!i.pull_request,
    labels: i.labels.map(l => l.name),
    assignees: i.assignees.map(a => a.login),
    author: i.user.login,
    created_at: i.created_at,
    updated_at: i.updated_at,
    comments: i.comments,
    html_url: i.html_url,
    repository: i.repository_url?.split("/").slice(-2).join("/"),
  }));

  return ok({
    total_count: result.total_count,
    page,
    count: items.length,
    has_more: result.total_count > (page - 1) * per_page + items.length,
    items,
  });
}

// ── Tool: gh_get_issue ────────────────────────────────────────────────────────

export async function gh_get_issue(
  client: GitHubClient,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  const repo = args.repo as string | undefined;
  const number = args.number as number | undefined;
  if (!repo) throw new Error("repo is required (format: owner/repo)");
  if (!number) throw new Error("number is required");

  const { owner, repo: repoName } = parseRepo(repo);
  const [issue, comments] = await Promise.all([
    client.getIssue(owner, repoName, number),
    client.getIssueComments(owner, repoName, number),
  ]);

  return ok({
    number: issue.number,
    title: issue.title,
    state: issue.state,
    body: issue.body,
    labels: issue.labels.map(l => l.name),
    assignees: issue.assignees.map(a => a.login),
    author: issue.user.login,
    is_pr: !!issue.pull_request,
    created_at: issue.created_at,
    updated_at: issue.updated_at,
    html_url: issue.html_url,
    comments_count: issue.comments,
    latest_comments: comments.slice(-5).map(c => ({
      author: c.user.login,
      body: c.body,
      created_at: c.created_at,
    })),
  });
}

// ── Tool: gh_create_issue ─────────────────────────────────────────────────────

export async function gh_create_issue(
  client: GitHubClient,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  const repo = args.repo as string | undefined;
  const title = args.title as string | undefined;
  if (!repo) throw new Error("repo is required (format: owner/repo)");
  if (!title) throw new Error("title is required");

  const { owner, repo: repoName } = parseRepo(repo);
  const issue = await client.createIssue(owner, repoName, {
    title,
    body: args.body as string | undefined,
    labels: args.labels as string[] | undefined,
    assignees: args.assignees as string[] | undefined,
    milestone: args.milestone as number | undefined,
  });

  return ok({
    created: true,
    number: issue.number,
    title: issue.title,
    html_url: issue.html_url,
    labels: issue.labels.map(l => l.name),
  });
}

// ── Tool: gh_update_issue ─────────────────────────────────────────────────────

export async function gh_update_issue(
  client: GitHubClient,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  const repo = args.repo as string | undefined;
  const number = args.number as number | undefined;
  if (!repo) throw new Error("repo is required");
  if (!number) throw new Error("number is required");

  const { owner, repo: repoName } = parseRepo(repo);
  const updated = await client.updateIssue(owner, repoName, number, {
    title: args.title as string | undefined,
    body: args.body as string | undefined,
    state: args.state as "open" | "closed" | undefined,
    labels: args.labels as string[] | undefined,
    assignees: args.assignees as string[] | undefined,
  });

  return ok({
    updated: true,
    number: updated.number,
    title: updated.title,
    state: updated.state,
    html_url: updated.html_url,
  });
}

// ── Tool: gh_add_comment ──────────────────────────────────────────────────────

export async function gh_add_comment(
  client: GitHubClient,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  const repo = args.repo as string | undefined;
  const number = args.number as number | undefined;
  const body = args.body as string | undefined;
  if (!repo) throw new Error("repo is required");
  if (!number) throw new Error("number is required");
  if (!body) throw new Error("body is required");

  const { owner, repo: repoName } = parseRepo(repo);
  const comment = await client.addComment(owner, repoName, number, body);
  return ok({ added: true, id: comment.id, html_url: comment.html_url });
}

// ── Tool: gh_list_prs ─────────────────────────────────────────────────────────

export async function gh_list_prs(
  client: GitHubClient,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  const repo = args.repo as string | undefined;
  if (!repo) throw new Error("repo is required");

  const { owner, repo: repoName } = parseRepo(repo);
  const prs = await client.listPRs(
    owner,
    repoName,
    (args.state as "open" | "closed" | "all" | undefined) ?? "open",
    Math.min(Number(args.per_page ?? 20), 50)
  );

  const items = prs.map(pr => ({
    number: pr.number,
    title: pr.title,
    state: pr.state,
    draft: pr.draft,
    author: pr.user.login,
    head: pr.head.ref,
    base: pr.base.ref,
    labels: pr.labels.map(l => l.name),
    assignees: pr.assignees.map(a => a.login),
    created_at: pr.created_at,
    updated_at: pr.updated_at,
    merged_at: pr.merged_at,
    html_url: pr.html_url,
  }));

  return ok({ count: items.length, prs: items });
}

// ── Tool: gh_get_pr ───────────────────────────────────────────────────────────

export async function gh_get_pr(
  client: GitHubClient,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  const repo = args.repo as string | undefined;
  const number = args.number as number | undefined;
  if (!repo) throw new Error("repo is required");
  if (!number) throw new Error("number is required");

  const { owner, repo: repoName } = parseRepo(repo);
  const pr = await client.getPR(owner, repoName, number);
  const [reviews, checks] = await Promise.all([
    client.getPRReviews(owner, repoName, number),
    client.getPRChecks(owner, repoName, pr.head.sha).catch(() => ({ total_count: 0, check_runs: [] })),
  ]);

  const checkRuns = checks.check_runs ?? [];
  const reviewSummary = reviews.reduce((acc: Record<string, string>, r) => {
    acc[r.user.login] = r.state;
    return acc;
  }, {});

  return ok({
    number: pr.number,
    title: pr.title,
    state: pr.state,
    draft: pr.draft,
    body: pr.body,
    author: pr.user.login,
    head: `${pr.head.repo?.full_name ?? owner + "/" + repoName}:${pr.head.ref}`,
    base: pr.base.ref,
    labels: pr.labels.map(l => l.name),
    assignees: pr.assignees.map(a => a.login),
    created_at: pr.created_at,
    updated_at: pr.updated_at,
    merged_at: pr.merged_at,
    diff_summary: { additions: pr.additions, deletions: pr.deletions, changed_files: pr.changed_files },
    mergeable: pr.mergeable,
    merge_commit_sha: pr.merge_commit_sha,
    reviews: reviewSummary,
    checks: {
      total: checkRuns.length,
      passed: checkRuns.filter(c => c.conclusion === "success").length,
      failed: checkRuns.filter(c => c.conclusion === "failure").length,
      pending: checkRuns.filter(c => c.status === "in_progress" || c.status === "queued").length,
    },
    html_url: pr.html_url,
  });
}

// ── Tool: gh_get_repo ─────────────────────────────────────────────────────────

export async function gh_get_repo(
  client: GitHubClient,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  const repo = args.repo as string | undefined;
  if (!repo) throw new Error("repo is required (format: owner/repo)");

  const { owner, repo: repoName } = parseRepo(repo);
  const r = await client.getRepo(owner, repoName);

  return ok({
    full_name: r.full_name,
    description: r.description,
    default_branch: r.default_branch,
    language: r.language,
    visibility: r.visibility,
    stars: r.stargazers_count,
    forks: r.forks_count,
    open_issues: r.open_issues_count,
    topics: r.topics,
    html_url: r.html_url,
    pushed_at: r.pushed_at,
    created_at: r.created_at,
    updated_at: r.updated_at,
  });
}

// ── Tool: gh_search_code ──────────────────────────────────────────────────────

export async function gh_search_code(
  client: GitHubClient,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  const query = args.query as string | undefined;
  const repo = args.repo as string | undefined;
  const language = args.language as string | undefined;
  const path_filter = args.path as string | undefined;
  const per_page = Math.min(Number(args.per_page ?? 20), 30);

  if (!query) throw new Error("query is required");

  let q = query;
  if (repo) q += ` repo:${repo}`;
  if (language) q += ` language:${language}`;
  if (path_filter) q += ` path:${path_filter}`;

  const result = await client.searchCode(q.trim(), per_page);

  const items = result.items.map(item => ({
    file: item.name,
    path: item.path,
    repository: item.repository.full_name,
    html_url: item.html_url,
    fragments: (item.text_matches ?? []).map(m => m.fragment).slice(0, 2),
  }));

  return ok({
    total_count: result.total_count,
    count: items.length,
    has_more: result.total_count > items.length,
    items,
  });
}

// ── Tool: gh_list_commits ─────────────────────────────────────────────────────

export async function gh_list_commits(
  client: GitHubClient,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  const repo = args.repo as string | undefined;
  if (!repo) throw new Error("repo is required");

  const { owner, repo: repoName } = parseRepo(repo);
  const perPage = Math.min(Number(args.per_page ?? 10), 30);
  const commits = await client.listCommits(
    owner,
    repoName,
    args.branch as string | undefined,
    perPage,
    args.since as string | undefined,
    args.until as string | undefined
  );

  const withStats = Boolean(args.include_stats ?? false);
  let enriched: Array<{ sha: string; additions?: number; deletions?: number; total_changes?: number }> = [];

  if (withStats && commits.length > 0 && commits.length <= 10) {
    const statResults = await Promise.all(
      commits.map(c => client.getCommit(owner, repoName, c.sha).catch(() => null))
    );
    enriched = statResults.map((c, i) => ({
      sha: commits[i].sha,
      additions: c?.stats?.additions,
      deletions: c?.stats?.deletions,
      total_changes: c?.stats?.total,
    }));
  }

  const statsMap = new Map(enriched.map(e => [e.sha, e]));

  const items = commits.map(c => {
    const stats = statsMap.get(c.sha);
    const base: Record<string, unknown> = {
      sha: c.sha.slice(0, 7),
      full_sha: c.sha,
      message: c.commit.message.split("\n")[0],
      author_name: c.commit.author.name,
      author_login: c.author?.login ?? null,
      date: c.commit.author.date,
      html_url: c.html_url,
      verified: c.commit.verification?.verified ?? null,
    };
    if (withStats && stats) {
      base.additions = stats.additions ?? null;
      base.deletions = stats.deletions ?? null;
      base.total_changes = stats.total_changes ?? null;
    }
    return base;
  });

  return ok({
    count: items.length,
    has_more: commits.length === perPage,
    stats_included: withStats && enriched.length > 0,
    commits: items,
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function ok(data: unknown): McpToolResult {
  return {
    content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }],
  };
}
