/**
 * GitHub MCP Server — 10 real tools via GitHub REST API v3.
 * Extends RealMcpBase; auth via Bearer (Personal Access Token or GitHub App token).
 * Mounted at /api/integrations/github
 */

import { Router, Request, Response } from "express";
import { RealMcpBase, type McpToolResult, type RealMcpToolDef } from "../../real-mcp-base";
import { GitHubClient, GH_BASE } from "./client";
import { getOrgId, getDefaultOrgId } from "../../auth";
import {
  gh_search_issues,
  gh_get_issue,
  gh_create_issue,
  gh_update_issue,
  gh_add_comment,
  gh_list_prs,
  gh_get_pr,
  gh_get_repo,
  gh_search_code,
  gh_list_commits,
} from "./tools";

export class GitHubMcpServer extends RealMcpBase {
  readonly integrationId = "github";

  readonly tools: RealMcpToolDef[] = [
    {
      name: "gh_search_issues",
      description: "Search GitHub issues and pull requests across repositories with label, state, and assignee filters.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "GitHub search query (e.g. 'memory leak' or 'auth bug')" },
          repo: { type: "string", description: "Limit to a specific repo (format: owner/repo)" },
          state: { type: "string", enum: ["open", "closed", "all"], description: "Issue state (default: open)" },
          label: { type: "string", description: "Filter by label name" },
          assignee: { type: "string", description: "Filter by assignee GitHub username" },
          is_pr: { type: "boolean", description: "true = PRs only, false = issues only, omit = both" },
          per_page: { type: "number", description: "Results per page (default 20, max 50)" },
          page: { type: "number", description: "Page number (default 1)" },
        },
      },
    },
    {
      name: "gh_get_issue",
      description: "Get a full GitHub issue with body, labels, assignees, and latest comments.",
      inputSchema: {
        type: "object",
        properties: {
          repo: { type: "string", description: "Repository in owner/repo format (required)" },
          number: { type: "number", description: "Issue number (required)" },
        },
        required: ["repo", "number"],
      },
    },
    {
      name: "gh_create_issue",
      description: "Create a GitHub issue with title, body, labels, and assignees.",
      inputSchema: {
        type: "object",
        properties: {
          repo: { type: "string", description: "Repository in owner/repo format (required)" },
          title: { type: "string", description: "Issue title (required)" },
          body: { type: "string", description: "Issue body (Markdown supported)" },
          labels: { type: "array", items: { type: "string" }, description: "Labels to apply" },
          assignees: { type: "array", items: { type: "string" }, description: "GitHub usernames to assign" },
          milestone: { type: "number", description: "Milestone number" },
        },
        required: ["repo", "title"],
      },
    },
    {
      name: "gh_update_issue",
      description: "Update a GitHub issue: title, body, labels, state (open/closed), or assignees.",
      inputSchema: {
        type: "object",
        properties: {
          repo: { type: "string", description: "Repository in owner/repo format (required)" },
          number: { type: "number", description: "Issue number (required)" },
          title: { type: "string" },
          body: { type: "string" },
          state: { type: "string", enum: ["open", "closed"] },
          labels: { type: "array", items: { type: "string" } },
          assignees: { type: "array", items: { type: "string" } },
        },
        required: ["repo", "number"],
      },
    },
    {
      name: "gh_add_comment",
      description: "Add a Markdown comment to a GitHub issue or pull request.",
      inputSchema: {
        type: "object",
        properties: {
          repo: { type: "string", description: "Repository in owner/repo format (required)" },
          number: { type: "number", description: "Issue or PR number (required)" },
          body: { type: "string", description: "Comment body in Markdown (required)" },
        },
        required: ["repo", "number", "body"],
      },
    },
    {
      name: "gh_list_prs",
      description: "List open, merged, or closed pull requests for a GitHub repository.",
      inputSchema: {
        type: "object",
        properties: {
          repo: { type: "string", description: "Repository in owner/repo format (required)" },
          state: { type: "string", enum: ["open", "closed", "all"], description: "PR state (default: open)" },
          per_page: { type: "number", description: "Results per page (default 20, max 50)" },
        },
        required: ["repo"],
      },
    },
    {
      name: "gh_get_pr",
      description: "Get a GitHub PR with diff summary, review status, CI check results, and merge status.",
      inputSchema: {
        type: "object",
        properties: {
          repo: { type: "string", description: "Repository in owner/repo format (required)" },
          number: { type: "number", description: "PR number (required)" },
        },
        required: ["repo", "number"],
      },
    },
    {
      name: "gh_get_repo",
      description: "Get GitHub repository metadata including language, topics, star count, and recent activity.",
      inputSchema: {
        type: "object",
        properties: {
          repo: { type: "string", description: "Repository in owner/repo format (required)" },
        },
        required: ["repo"],
      },
    },
    {
      name: "gh_search_code",
      description: "Search code across GitHub repositories with language and path filters.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Code search query (required)" },
          repo: { type: "string", description: "Limit to a specific repo (owner/repo)" },
          language: { type: "string", description: "Filter by programming language" },
          path: { type: "string", description: "Filter by file path (e.g. src/)" },
          per_page: { type: "number", description: "Results (default 20, max 30)" },
        },
        required: ["query"],
      },
    },
    {
      name: "gh_list_commits",
      description: "List recent commits for a branch with author, message, and diff stats.",
      inputSchema: {
        type: "object",
        properties: {
          repo: { type: "string", description: "Repository in owner/repo format (required)" },
          branch: { type: "string", description: "Branch name (default: repository default branch)" },
          per_page: { type: "number", description: "Commits to return (default 20, max 50)" },
          since: { type: "string", description: "ISO 8601 date: only commits after this date" },
          until: { type: "string", description: "ISO 8601 date: only commits before this date" },
        },
        required: ["repo"],
      },
    },
  ];

  async handleTool(
    toolName: string,
    args: Record<string, unknown>,
    credentials: Record<string, string>,
    orgId: string
  ): Promise<McpToolResult> {
    const token = credentials.access_token ?? credentials.api_token ?? credentials.token;
    if (!token) return this.err("GitHub access_token (PAT) is not configured");

    const fetcher = async (path: string, options?: RequestInit) => {
      const url = path.startsWith("http") ? path : `${GH_BASE}${path}`;
      return this.fetchWithAuth(url, {
        ...options,
        bearerToken: token,
        orgId,
        headers: {
          ...(options?.headers as Record<string, string> | undefined),
          "X-GitHub-Api-Version": "2022-11-28",
          Accept: "application/vnd.github+json",
        },
      });
    };

    const client = new GitHubClient(fetcher);

    switch (toolName) {
      case "gh_search_issues":  return gh_search_issues(client, args);
      case "gh_get_issue":      return gh_get_issue(client, args);
      case "gh_create_issue":   return gh_create_issue(client, args);
      case "gh_update_issue":   return gh_update_issue(client, args);
      case "gh_add_comment":    return gh_add_comment(client, args);
      case "gh_list_prs":       return gh_list_prs(client, args);
      case "gh_get_pr":         return gh_get_pr(client, args);
      case "gh_get_repo":       return gh_get_repo(client, args);
      case "gh_search_code":    return gh_search_code(client, args);
      case "gh_list_commits":   return gh_list_commits(client, args);
      default:
        return this.err(`Unknown GitHub tool: ${toolName}`);
    }
  }
}

export const githubMcpServer = new GitHubMcpServer();

export function createGitHubRouter(): Router {
  const router = Router();

  router.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", integration: "github", tools: githubMcpServer.tools.length });
  });

  router.get("/tools", (_req: Request, res: Response) => {
    res.json({ tools: githubMcpServer.tools });
  });

  router.post("/tools/:toolName", async (req: Request, res: Response) => {
    const { toolName } = req.params;
    const orgId = getOrgId(req) ?? getDefaultOrgId();
    const args = (req.body?.args ?? req.body) as Record<string, unknown>;

    const result = await githubMcpServer.callTool(toolName, args, orgId);
    res.json(result);
  });

  router.post("/connection-test", async (req: Request, res: Response) => {
    const orgId = getOrgId(req) ?? getDefaultOrgId();
    const credentials = await githubMcpServer.getCredentials(orgId);
    if (!credentials) {
      return res.json({ connected: false, error: "No credentials configured" });
    }

    const token = credentials.access_token ?? credentials.api_token ?? credentials.token;
    if (!token) {
      return res.json({ connected: false, error: "access_token (PAT) is missing" });
    }

    try {
      const testRes = await githubMcpServer["fetchWithAuth"](`${GH_BASE}/user`, {
        bearerToken: token,
        orgId,
        headers: {
          "X-GitHub-Api-Version": "2022-11-28",
          Accept: "application/vnd.github+json",
        },
      });
      const connected = testRes.ok;
      const body = testRes.ok ? await testRes.json() : null;
      res.json({
        connected,
        statusCode: testRes.status,
        integration: "github",
        user: connected ? { login: (body as any)?.login, name: (body as any)?.name } : null,
      });
    } catch (err: any) {
      res.json({ connected: false, error: err?.message ?? "Connection test failed" });
    }
  });

  return router;
}
