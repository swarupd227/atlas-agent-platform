/**
 * Jira Cloud REST API v3 client.
 * Fetcher is injected by the MCP server so fetchWithAuth handles retries,
 * 401 refresh, and 429/5xx backoff.
 *
 * Auth: Basic (email:api_token encoded as base64)
 * Base URL: https://${instance_url}/rest/api/3
 */

export interface JiraIssue {
  id: string;
  key: string;
  self: string;
  fields: Record<string, unknown>;
}

export interface JiraSearchResult {
  total: number;
  startAt: number;
  maxResults: number;
  issues: JiraIssue[];
}

export interface JiraProject {
  id: string;
  key: string;
  name: string;
  projectTypeKey: string;
  [key: string]: unknown;
}

export interface JiraTransition {
  id: string;
  name: string;
  to: { id: string; name: string; statusCategory: { key: string } };
}

export type JiraFetcher = (path: string, options?: RequestInit) => Promise<Response>;

export class JiraClient {
  constructor(private readonly fetcher: JiraFetcher) {}

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const res = await this.fetcher(path, options);

    if (!res.ok) {
      let errorText = await res.text().catch(() => res.statusText);
      try {
        const errJson = JSON.parse(errorText);
        const msgs: string[] = errJson?.errorMessages ?? [];
        const fieldErrs = Object.values(errJson?.errors ?? {}) as string[];
        const msg = [...msgs, ...fieldErrs].join("; ") || errJson?.message || errorText;
        if (res.status === 401) throw new JiraAuthError("Jira authentication failed — check email and API token");
        if (res.status === 403) throw new Error(`Jira permission denied: ${msg}`);
        if (res.status === 404) throw new Error(`Jira resource not found: ${path}`);
        throw new Error(`Jira API ${res.status}: ${msg}`);
      } catch (e) {
        if (e instanceof JiraAuthError || (e as Error).message?.startsWith("Jira")) throw e;
        throw new Error(`Jira API ${res.status}: ${errorText}`);
      }
    }

    if (res.status === 204) return {} as T;
    return res.json() as Promise<T>;
  }

  /** JQL search — returns issues with requested fields */
  async searchIssues(
    jql: string,
    fields: string[],
    maxResults = 20,
    startAt = 0
  ): Promise<JiraSearchResult> {
    return this.request<JiraSearchResult>("/search", {
      method: "POST",
      body: JSON.stringify({ jql, fields, maxResults: Math.min(maxResults, 100), startAt }),
    });
  }

  /** Get a single issue by key or ID */
  async getIssue(issueIdOrKey: string, fields?: string[]): Promise<JiraIssue> {
    const sp = fields?.length ? `?fields=${fields.join(",")}` : "";
    return this.request<JiraIssue>(`/issue/${issueIdOrKey}${sp}`);
  }

  /** Create an issue */
  async createIssue(data: {
    projectKey: string;
    summary: string;
    issueType: string;
    description?: string;
    priority?: string;
    labels?: string[];
    assigneeEmail?: string;
    parentKey?: string;
    customFields?: Record<string, unknown>;
  }): Promise<{ id: string; key: string; self: string }> {
    const fields: Record<string, unknown> = {
      project: { key: data.projectKey },
      summary: data.summary,
      issuetype: { name: data.issueType },
    };
    if (data.description) {
      fields.description = textToAdf(data.description);
    }
    if (data.priority) fields.priority = { name: data.priority };
    if (data.labels?.length) fields.labels = data.labels;
    if (data.assigneeEmail) fields.assignee = { emailAddress: data.assigneeEmail };
    if (data.parentKey) fields.parent = { key: data.parentKey };
    if (data.customFields) Object.assign(fields, data.customFields);

    return this.request<{ id: string; key: string; self: string }>("/issue", {
      method: "POST",
      body: JSON.stringify({ fields }),
    });
  }

  /** Update an issue — supports summary, description, priority, labels, custom fields */
  async updateIssue(issueKey: string, updates: {
    summary?: string;
    description?: string;
    priority?: string;
    labels?: string[];
    assigneeEmail?: string;
    customFields?: Record<string, unknown>;
  }): Promise<void> {
    const fields: Record<string, unknown> = {};
    if (updates.summary) fields.summary = updates.summary;
    if (updates.description) fields.description = textToAdf(updates.description);
    if (updates.priority) fields.priority = { name: updates.priority };
    if (updates.labels) fields.labels = updates.labels;
    if (updates.assigneeEmail !== undefined) fields.assignee = updates.assigneeEmail ? { emailAddress: updates.assigneeEmail } : null;
    if (updates.customFields) Object.assign(fields, updates.customFields);

    await this.request<void>(`/issue/${issueKey}`, {
      method: "PUT",
      body: JSON.stringify({ fields }),
    });
  }

  /** Get available transitions for an issue */
  async getTransitions(issueKey: string): Promise<JiraTransition[]> {
    const result = await this.request<{ transitions: JiraTransition[] }>(`/issue/${issueKey}/transitions`);
    return result.transitions ?? [];
  }

  /** Transition an issue to a new status */
  async transitionIssue(issueKey: string, transitionId: string, comment?: string): Promise<void> {
    const body: Record<string, unknown> = { transition: { id: transitionId } };
    if (comment) {
      body.update = {
        comment: [{ add: { body: textToAdf(comment) } }],
      };
    }
    await this.request<void>(`/issue/${issueKey}/transitions`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  /** Add a comment */
  async addComment(issueKey: string, body: string): Promise<{ id: string }> {
    return this.request<{ id: string }>(`/issue/${issueKey}/comment`, {
      method: "POST",
      body: JSON.stringify({ body: textToAdf(body) }),
    });
  }

  /** Assign an issue to a user by accountId or email */
  async assignIssue(issueKey: string, accountId: string): Promise<void> {
    await this.request<void>(`/issue/${issueKey}/assignee`, {
      method: "PUT",
      body: JSON.stringify({ accountId }),
    });
  }

  /** Get user by email (to resolve accountId) */
  async getUserByEmail(email: string): Promise<{ accountId: string; displayName: string } | null> {
    const result = await this.request<Array<{ accountId: string; displayName: string }>>(
      `/user/search?query=${encodeURIComponent(email)}&maxResults=1`
    );
    return Array.isArray(result) && result.length ? result[0] : null;
  }

  /** Get project info */
  async getProject(projectKey: string): Promise<JiraProject> {
    return this.request<JiraProject>(`/project/${projectKey}?expand=issueTypes,lead`);
  }

  /** List accessible projects */
  async listProjects(maxResults = 50): Promise<JiraProject[]> {
    const result = await this.request<{ values: JiraProject[] }>(
      `/project/search?maxResults=${Math.min(maxResults, 100)}&orderBy=name&expand=description`
    );
    return result.values ?? [];
  }

  /** Get a sprint by board ID */
  async getActiveSprint(boardId: number): Promise<unknown> {
    const result = await this.request<{ values: unknown[] }>(
      `/rest/agile/1.0/board/${boardId}/sprint?state=active&maxResults=1`
    );
    const sprint = result.values?.[0];
    if (!sprint) throw new Error(`No active sprint found for board ${boardId}`);
    return sprint;
  }

  /** Get sprint details with issue breakdown */
  async getSprintIssues(sprintId: number): Promise<{
    sprint: unknown;
    issues: JiraIssue[];
    total: number;
  }> {
    const [sprintRes, issuesRes] = await Promise.all([
      this.request<unknown>(`/rest/agile/1.0/sprint/${sprintId}`),
      this.request<{ issues: JiraIssue[]; total: number }>(
        `/rest/agile/1.0/sprint/${sprintId}/issue?maxResults=50`
      ),
    ]);
    return { sprint: sprintRes, issues: issuesRes.issues ?? [], total: issuesRes.total ?? 0 };
  }
}

export class JiraAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JiraAuthError";
  }
}

/**
 * Convert plain text to Atlassian Document Format (ADF).
 * Handles newlines as paragraph breaks for basic formatting.
 */
export function textToAdf(text: string): object {
  const paragraphs = text.split(/\n{2,}/).filter(Boolean);
  return {
    version: 1,
    type: "doc",
    content: paragraphs.map(para => ({
      type: "paragraph",
      content: [{ type: "text", text: para.replace(/\n/g, " ") }],
    })),
  };
}

/**
 * Convert ADF back to plain text for agent consumption.
 */
export function adfToText(adf: unknown): string {
  if (!adf || typeof adf !== "object") return "";
  const doc = adf as any;
  if (typeof doc === "string") return doc;

  const extractText = (node: any): string => {
    if (node.type === "text") return node.text ?? "";
    if (node.type === "hardBreak") return "\n";
    if (!node.content?.length) return "";
    const sep = node.type === "paragraph" || node.type === "heading" ? "\n" : "";
    return node.content.map(extractText).join("") + sep;
  };

  return (doc.content ?? []).map(extractText).join("").trim();
}

/** Default fields to return for issues */
export const DEFAULT_ISSUE_FIELDS = [
  "summary", "status", "assignee", "reporter", "priority", "issuetype",
  "labels", "components", "created", "updated", "resolutiondate",
  "description", "parent", "subtasks", "comment",
];
