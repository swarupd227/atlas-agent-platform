/**
 * Jira Cloud MCP Server — 10 real tools via Jira REST API v3.
 * Extends RealMcpBase; auth via API token Basic auth (email:api_token).
 * Mounted at /api/integrations/jira
 */

import { Router, Request, Response } from "express";
import { RealMcpBase, type McpToolResult, type RealMcpToolDef } from "../../real-mcp-base";
import { JiraClient } from "./client";
import { getOrgId, getDefaultOrgId } from "../../auth";
import {
  jira_search,
  jira_get_issue,
  jira_create_issue,
  jira_update_issue,
  jira_transition_issue,
  jira_add_comment,
  jira_assign_issue,
  jira_get_project,
  jira_list_projects,
  jira_get_sprint,
} from "./tools";

export class JiraMcpServer extends RealMcpBase {
  readonly integrationId = "jira";

  readonly tools: RealMcpToolDef[] = [
    {
      name: "jira_search",
      description: "JQL search across Jira issues. Returns key fields: status, assignee, priority, labels, and updated time.",
      inputSchema: {
        type: "object",
        properties: {
          jql: { type: "string", description: "Full JQL query string. If provided, other filters are ignored." },
          project: { type: "string", description: "Project key (e.g. PROJ)" },
          status: { type: "string", description: "Issue status (e.g. 'In Progress', 'Done')" },
          assignee: { type: "string", description: "Assignee display name, email, or 'currentUser()'" },
          label: { type: "string", description: "Label to filter by" },
          issue_type: { type: "string", description: "Issue type (Bug, Story, Task, Epic)" },
          priority: { type: "string", description: "Priority (Highest, High, Medium, Low, Lowest)" },
          text: { type: "string", description: "Text search across summary, description, and comments" },
          max_results: { type: "number", description: "Max results (default 20, max 50)" },
          start_at: { type: "number", description: "Pagination offset (default 0)" },
        },
      },
    },
    {
      name: "jira_get_issue",
      description: "Get full Jira issue details including description, comments, subtasks, and attachments list.",
      inputSchema: {
        type: "object",
        properties: {
          issue_key: { type: "string", description: "Issue key (e.g. PROJ-123) (required)" },
        },
        required: ["issue_key"],
      },
    },
    {
      name: "jira_create_issue",
      description: "Create a new Jira issue with type, priority, labels, and description (plain text auto-converted to ADF).",
      inputSchema: {
        type: "object",
        properties: {
          project_key: { type: "string", description: "Project key (e.g. PROJ) (required)" },
          summary: { type: "string", description: "Issue summary (required)" },
          issue_type: { type: "string", description: "Issue type (default: Task). Common: Bug, Story, Task, Epic, Sub-task" },
          description: { type: "string", description: "Plain text description — auto-converted to Atlassian Document Format" },
          priority: { type: "string", description: "Priority: Highest, High, Medium, Low, Lowest" },
          labels: { type: "array", items: { type: "string" }, description: "Labels to apply" },
          assignee_email: { type: "string", description: "Assignee email address" },
          parent_key: { type: "string", description: "Parent issue key for sub-tasks or epics" },
        },
        required: ["project_key", "summary"],
      },
    },
    {
      name: "jira_update_issue",
      description: "Update Jira issue summary, description, priority, labels, or assignee.",
      inputSchema: {
        type: "object",
        properties: {
          issue_key: { type: "string", description: "Issue key (e.g. PROJ-123) (required)" },
          summary: { type: "string" },
          description: { type: "string", description: "Plain text — auto-converted to ADF" },
          priority: { type: "string" },
          labels: { type: "array", items: { type: "string" } },
          assignee_email: { type: "string" },
        },
        required: ["issue_key"],
      },
    },
    {
      name: "jira_transition_issue",
      description: "Move a Jira issue to a new status using the available workflow transitions.",
      inputSchema: {
        type: "object",
        properties: {
          issue_key: { type: "string", description: "Issue key (required)" },
          transition_name: { type: "string", description: "Transition name (e.g. 'In Progress', 'Done', 'Closed')" },
          transition_id: { type: "string", description: "Exact transition ID (overrides transition_name)" },
          comment: { type: "string", description: "Optional comment to add when transitioning" },
        },
        required: ["issue_key"],
      },
    },
    {
      name: "jira_add_comment",
      description: "Post a comment on a Jira issue. Plain text is auto-converted to Atlassian Document Format.",
      inputSchema: {
        type: "object",
        properties: {
          issue_key: { type: "string", description: "Issue key (required)" },
          body: { type: "string", description: "Comment text (required)" },
        },
        required: ["issue_key", "body"],
      },
    },
    {
      name: "jira_assign_issue",
      description: "Assign a Jira issue to a user by Atlassian account ID or email address.",
      inputSchema: {
        type: "object",
        properties: {
          issue_key: { type: "string", description: "Issue key (required)" },
          account_id: { type: "string", description: "Atlassian account ID" },
          email: { type: "string", description: "User email address (used to look up account ID)" },
        },
        required: ["issue_key"],
      },
    },
    {
      name: "jira_get_project",
      description: "Get Jira project metadata including issue types, statuses, and team lead.",
      inputSchema: {
        type: "object",
        properties: {
          project_key: { type: "string", description: "Project key (e.g. PROJ) (required)" },
        },
        required: ["project_key"],
      },
    },
    {
      name: "jira_list_projects",
      description: "Enumerate all accessible Jira projects with key, name, type, and description.",
      inputSchema: {
        type: "object",
        properties: {
          max_results: { type: "number", description: "Max projects to return (default 50, max 100)" },
        },
      },
    },
    {
      name: "jira_get_sprint",
      description: "Fetch the active sprint for a board, or a specific sprint by ID, with issue breakdown by status.",
      inputSchema: {
        type: "object",
        properties: {
          board_id: { type: "number", description: "Jira board ID (for active sprint lookup)" },
          sprint_id: { type: "number", description: "Specific sprint ID (overrides board_id)" },
        },
      },
    },
  ];

  async handleTool(
    toolName: string,
    args: Record<string, unknown>,
    credentials: Record<string, string>,
    orgId: string
  ): Promise<McpToolResult> {
    const instanceUrl = (credentials.instance_url ?? credentials.base_url)?.replace(/^https?:\/\//, "").replace(/\/+$/, "");
    if (!instanceUrl) return this.err("Jira instance_url is not configured (e.g. acme.atlassian.net)");

    const email = credentials.email ?? credentials.username;
    const apiToken = credentials.api_token ?? credentials.password;
    if (!email || !apiToken) return this.err("Jira email and api_token are required");

    const baseUrl = `https://${instanceUrl}/rest/api/3`;

    const fetcher = async (path: string, options?: RequestInit) => {
      const isAgileApi = path.startsWith("/rest/agile");
      const url = isAgileApi
        ? `https://${instanceUrl}${path}`
        : `${baseUrl}${path}`;

      return this.fetchWithAuth(url, {
        ...options,
        basicAuth: { username: email, password: apiToken },
        orgId,
      });
    };

    const client = new JiraClient(fetcher);

    switch (toolName) {
      case "jira_search":          return jira_search(client, args);
      case "jira_get_issue":       return jira_get_issue(client, args);
      case "jira_create_issue":    return jira_create_issue(client, args);
      case "jira_update_issue":    return jira_update_issue(client, args);
      case "jira_transition_issue": return jira_transition_issue(client, args);
      case "jira_add_comment":     return jira_add_comment(client, args);
      case "jira_assign_issue":    return jira_assign_issue(client, args);
      case "jira_get_project":     return jira_get_project(client, args);
      case "jira_list_projects":   return jira_list_projects(client, args);
      case "jira_get_sprint":      return jira_get_sprint(client, args);
      default:
        return this.err(`Unknown Jira tool: ${toolName}`);
    }
  }
}

export const jiraMcpServer = new JiraMcpServer();

export function createJiraRouter(): Router {
  const router = Router();

  router.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", integration: "jira", tools: jiraMcpServer.tools.length });
  });

  router.get("/tools", (_req: Request, res: Response) => {
    res.json({ tools: jiraMcpServer.tools });
  });

  router.post("/tools/:toolName", async (req: Request, res: Response) => {
    const { toolName } = req.params;
    const orgId = getOrgId(req) ?? getDefaultOrgId();
    const args = (req.body?.args ?? req.body) as Record<string, unknown>;

    const result = await jiraMcpServer.callTool(toolName, args, orgId);
    res.json(result);
  });

  router.post("/connection-test", async (req: Request, res: Response) => {
    const orgId = getOrgId(req) ?? getDefaultOrgId();
    const credentials = await jiraMcpServer.getCredentials(orgId);
    if (!credentials) {
      return res.json({ connected: false, error: "No credentials configured" });
    }

    const instanceUrl = (credentials.instance_url ?? credentials.base_url)?.replace(/^https?:\/\//, "").replace(/\/+$/, "");
    if (!instanceUrl) {
      return res.json({ connected: false, error: "instance_url/base_url is missing" });
    }

    const email = credentials.email ?? credentials.username;
    const apiToken = credentials.api_token ?? credentials.password;

    try {
      const testRes = await jiraMcpServer["fetchWithAuth"](
        `https://${instanceUrl}/rest/api/3/myself`,
        { basicAuth: { username: email ?? "", password: apiToken ?? "" }, orgId }
      );
      const connected = testRes.ok;
      const body = testRes.ok ? await testRes.json() : null;
      res.json({
        connected,
        statusCode: testRes.status,
        integration: "jira",
        user: connected ? { displayName: (body as any)?.displayName, emailAddress: (body as any)?.emailAddress } : null,
      });
    } catch (err: any) {
      res.json({ connected: false, error: err?.message ?? "Connection test failed" });
    }
  });

  return router;
}
