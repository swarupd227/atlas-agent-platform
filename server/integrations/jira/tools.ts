/**
 * Jira tool implementations — 10 tools.
 * Each function receives a JiraClient and the validated args.
 */

import { JiraClient, adfToText, DEFAULT_ISSUE_FIELDS } from "./client";
import type { McpToolResult } from "../../real-mcp-base";

// ── Tool: jira_search ─────────────────────────────────────────────────────────

export async function jira_search(
  client: JiraClient,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  const jql = args.jql as string | undefined;
  const project = args.project as string | undefined;
  const text = args.text as string | undefined;
  const status = args.status as string | undefined;
  const assignee = args.assignee as string | undefined;
  const label = args.label as string | undefined;
  const issue_type = args.issue_type as string | undefined;
  const priority = args.priority as string | undefined;
  const max_results = Math.min(Number(args.max_results ?? 20), 50);
  const start_at = Number(args.start_at ?? 0);

  let finalJql = jql ?? "";
  if (!finalJql) {
    const parts: string[] = [];
    if (project) parts.push(`project = "${project}"`);
    if (status) parts.push(`status = "${status}"`);
    if (assignee) parts.push(`assignee = "${assignee}"`);
    if (label) parts.push(`labels = "${label}"`);
    if (issue_type) parts.push(`issuetype = "${issue_type}"`);
    if (priority) parts.push(`priority = "${priority}"`);
    if (text) parts.push(`text ~ "${text}"`);
    finalJql = parts.join(" AND ") || "ORDER BY updated DESC";
  }

  const result = await client.searchIssues(finalJql, DEFAULT_ISSUE_FIELDS, max_results, start_at);

  const issues = result.issues.map(issue => ({
    key: issue.key,
    summary: issue.fields.summary,
    status: (issue.fields.status as any)?.name,
    assignee: maskEmail((issue.fields.assignee as any)?.emailAddress) ??
              (issue.fields.assignee as any)?.displayName,
    priority: (issue.fields.priority as any)?.name,
    issuetype: (issue.fields.issuetype as any)?.name,
    labels: issue.fields.labels,
    updated: issue.fields.updated,
    created: issue.fields.created,
    url: `https://atlassian.net/browse/${issue.key}`,
  }));

  return ok({ total: result.total, start_at, count: issues.length, has_more: result.total > start_at + issues.length, issues });
}

// ── Tool: jira_get_issue ──────────────────────────────────────────────────────

export async function jira_get_issue(
  client: JiraClient,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  const issue_key = args.issue_key as string | undefined;
  if (!issue_key) throw new Error("issue_key is required (e.g. PROJ-123)");

  const issue = await client.getIssue(issue_key);
  const f = issue.fields;

  return ok({
    key: issue.key,
    summary: f.summary,
    status: (f.status as any)?.name,
    assignee: maskEmail((f.assignee as any)?.emailAddress) ?? (f.assignee as any)?.displayName ?? null,
    reporter: maskEmail((f.reporter as any)?.emailAddress) ?? (f.reporter as any)?.displayName ?? null,
    priority: (f.priority as any)?.name,
    issuetype: (f.issuetype as any)?.name,
    labels: f.labels,
    components: ((f.components as any[]) ?? []).map((c: any) => c.name),
    description: adfToText(f.description),
    created: f.created,
    updated: f.updated,
    resolutiondate: f.resolutiondate,
    parent: (f.parent as any)?.key ?? null,
    subtasks: ((f.subtasks as any[]) ?? []).map((s: any) => ({ key: s.key, summary: s.fields?.summary })),
    comments: {
      total: (f.comment as any)?.total ?? 0,
      latest: ((f.comment as any)?.comments ?? []).slice(-3).map((c: any) => ({
        author: maskEmail(c.author?.emailAddress) ?? c.author?.displayName,
        body: adfToText(c.body),
        created: c.created,
      })),
    },
  });
}

// ── Tool: jira_create_issue ───────────────────────────────────────────────────

export async function jira_create_issue(
  client: JiraClient,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  const project_key = args.project_key as string | undefined;
  const summary = args.summary as string | undefined;
  if (!project_key) throw new Error("project_key is required");
  if (!summary) throw new Error("summary is required");

  const created = await client.createIssue({
    projectKey: project_key,
    summary,
    issueType: (args.issue_type as string | undefined) ?? "Task",
    description: args.description as string | undefined,
    priority: args.priority as string | undefined,
    labels: args.labels as string[] | undefined,
    assigneeEmail: args.assignee_email as string | undefined,
    parentKey: args.parent_key as string | undefined,
  });

  return ok({ created: true, key: created.key, id: created.id, self: created.self });
}

// ── Tool: jira_update_issue ───────────────────────────────────────────────────

export async function jira_update_issue(
  client: JiraClient,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  const issue_key = args.issue_key as string | undefined;
  if (!issue_key) throw new Error("issue_key is required");

  await client.updateIssue(issue_key, {
    summary: args.summary as string | undefined,
    description: args.description as string | undefined,
    priority: args.priority as string | undefined,
    labels: args.labels as string[] | undefined,
    assigneeEmail: args.assignee_email as string | undefined,
  });

  return ok({ updated: true, key: issue_key });
}

// ── Tool: jira_transition_issue ───────────────────────────────────────────────

export async function jira_transition_issue(
  client: JiraClient,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  const issue_key = args.issue_key as string | undefined;
  const transition_name = args.transition_name as string | undefined;
  const transition_id = args.transition_id as string | undefined;
  const comment = args.comment as string | undefined;

  if (!issue_key) throw new Error("issue_key is required");
  if (!transition_name && !transition_id) throw new Error("Either transition_name or transition_id is required");

  let resolvedId = transition_id;
  if (!resolvedId) {
    const transitions = await client.getTransitions(issue_key);
    const match = transitions.find(t =>
      t.name.toLowerCase() === transition_name!.toLowerCase() ||
      t.name.toLowerCase().includes(transition_name!.toLowerCase())
    );
    if (!match) {
      const available = transitions.map(t => t.name).join(", ");
      throw new Error(`Transition '${transition_name}' not found. Available: ${available}`);
    }
    resolvedId = match.id;
  }

  await client.transitionIssue(issue_key, resolvedId, comment);
  return ok({ transitioned: true, key: issue_key, transition_id: resolvedId });
}

// ── Tool: jira_add_comment ────────────────────────────────────────────────────

export async function jira_add_comment(
  client: JiraClient,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  const issue_key = args.issue_key as string | undefined;
  const body = args.body as string | undefined;
  if (!issue_key) throw new Error("issue_key is required");
  if (!body) throw new Error("body is required");

  const comment = await client.addComment(issue_key, body);
  return ok({ added: true, id: comment.id, key: issue_key });
}

// ── Tool: jira_assign_issue ───────────────────────────────────────────────────

export async function jira_assign_issue(
  client: JiraClient,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  const issue_key = args.issue_key as string | undefined;
  const account_id = args.account_id as string | undefined;
  const email = args.email as string | undefined;

  if (!issue_key) throw new Error("issue_key is required");
  if (!account_id && !email) throw new Error("Either account_id or email is required");

  let resolvedAccountId = account_id;
  if (!resolvedAccountId && email) {
    const user = await client.getUserByEmail(email);
    if (!user) throw new Error(`No Jira user found with email matching '${maskEmail(email)}'`);
    resolvedAccountId = user.accountId;
  }

  await client.assignIssue(issue_key, resolvedAccountId!);
  return ok({ assigned: true, key: issue_key, account_id: resolvedAccountId });
}

// ── Tool: jira_get_project ────────────────────────────────────────────────────

export async function jira_get_project(
  client: JiraClient,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  const project_key = args.project_key as string | undefined;
  if (!project_key) throw new Error("project_key is required");

  const project = await client.getProject(project_key);
  return ok(project);
}

// ── Tool: jira_list_projects ──────────────────────────────────────────────────

export async function jira_list_projects(
  client: JiraClient,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  const max_results = Math.min(Number(args.max_results ?? 50), 100);
  const include_issue_counts = Boolean(args.include_issue_counts ?? true);
  const projects = await client.listProjects(max_results);

  let issueCounts: Record<string, number> = {};
  if (include_issue_counts && projects.length > 0) {
    const counts = await Promise.all(
      projects.map(p =>
        client.searchIssues(`project = "${p.key}"`, ["summary"], 0, 0)
          .then(r => ({ key: p.key, count: r.total }))
          .catch(() => ({ key: p.key, count: null as number | null }))
      )
    );
    issueCounts = Object.fromEntries(counts.map(c => [c.key, c.count ?? 0]));
  }

  const summary = projects.map(p => ({
    key: p.key,
    name: p.name,
    type: p.projectTypeKey,
    description: (p as any).description ?? null,
    lead: maskEmail((p as any).lead?.emailAddress) ?? (p as any).lead?.displayName ?? null,
    issue_count: include_issue_counts ? (issueCounts[p.key] ?? null) : undefined,
  }));

  return ok({ count: summary.length, projects: summary });
}

// ── Tool: jira_get_sprint ─────────────────────────────────────────────────────

export async function jira_get_sprint(
  client: JiraClient,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  const board_id = args.board_id as number | undefined;
  const sprint_id = args.sprint_id as number | undefined;

  if (!board_id && !sprint_id) throw new Error("Either board_id (for active sprint) or sprint_id is required");

  let resolvedSprintId = sprint_id;
  if (!resolvedSprintId) {
    const activeSprint = await client.getActiveSprint(board_id!) as any;
    resolvedSprintId = activeSprint.id;
  }

  const { sprint, issues, total } = await client.getSprintIssues(resolvedSprintId!);
  const sprintData = sprint as any;

  const breakdown = {
    todo: issues.filter(i => {
      const cat = ((i.fields.status as any)?.statusCategory?.key ?? "").toLowerCase();
      return cat === "new" || cat === "todo";
    }).length,
    in_progress: issues.filter(i => {
      const cat = ((i.fields.status as any)?.statusCategory?.key ?? "").toLowerCase();
      return cat === "indeterminate";
    }).length,
    done: issues.filter(i => {
      const cat = ((i.fields.status as any)?.statusCategory?.key ?? "").toLowerCase();
      return cat === "done";
    }).length,
  };

  return ok({
    sprint: {
      id: sprintData.id,
      name: sprintData.name,
      state: sprintData.state,
      start_date: sprintData.startDate,
      end_date: sprintData.endDate,
      goal: sprintData.goal ?? null,
    },
    total_issues: total,
    breakdown,
    issues: issues.slice(0, 20).map(i => ({
      key: i.key,
      summary: i.fields.summary,
      status: (i.fields.status as any)?.name,
      assignee: maskEmail((i.fields.assignee as any)?.emailAddress) ??
                (i.fields.assignee as any)?.displayName ?? null,
      priority: (i.fields.priority as any)?.name,
    })),
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function ok(data: unknown): McpToolResult {
  return {
    content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }],
  };
}

/** Partially mask an email address for audit-safe output */
function maskEmail(email: string | undefined | null): string | null {
  if (!email) return null;
  const at = email.indexOf("@");
  if (at <= 0) return "****";
  const local = email.slice(0, at);
  const domain = email.slice(at);
  const visible = local.length > 2 ? local.slice(0, 2) : local[0];
  return `${visible}****${domain}`;
}
