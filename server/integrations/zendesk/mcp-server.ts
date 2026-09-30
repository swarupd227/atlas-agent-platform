/**
 * Zendesk MCP Server — 7 real tools via Zendesk REST API v2.
 * Extends RealMcpBase; auth via API token Basic auth ({email}/token:api_token).
 * Mounted at /api/integrations/zendesk
 */

import { Router, Request, Response } from "express";
import { RealMcpBase, type McpToolResult, type RealMcpToolDef } from "../../real-mcp-base";
import { ZendeskClient } from "./client";
import { getOrgId, getDefaultOrgId } from "../../auth";
import {
  zendesk_search_tickets,
  zendesk_get_ticket,
  zendesk_add_internal_note,
  zendesk_add_tags,
  zendesk_update_status,
  zendesk_get_user,
  zendesk_list_recent_tickets,
} from "./tools";

export class ZendeskMcpServer extends RealMcpBase {
  readonly integrationId = "zendesk";

  readonly tools: RealMcpToolDef[] = [
    {
      name: "zendesk_search_tickets",
      description: "Search Zendesk tickets using query, status, priority, tag, assignee email, or free text. Returns id, subject, status, priority, tags, requester/assignee, and a link to the ticket.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Raw Zendesk search query syntax (e.g. 'type:ticket status:open'). If provided, combined with other filters." },
          status: { type: "string", description: "Ticket status (new, open, pending, hold, solved, closed)" },
          priority: { type: "string", description: "Priority (urgent, high, normal, low)" },
          tag: { type: "string", description: "Tag to filter by" },
          assignee_email: { type: "string", description: "Assignee email address" },
          text: { type: "string", description: "Free text search across subject and description" },
        },
      },
    },
    {
      name: "zendesk_get_ticket",
      description: "Get full Zendesk ticket details including description and recent comments, marked public or internal.",
      inputSchema: {
        type: "object",
        properties: {
          ticket_id: { type: "string", description: "Ticket ID (required)" },
        },
        required: ["ticket_id"],
      },
    },
    {
      name: "zendesk_add_internal_note",
      description: "Add a private (internal) note to a Zendesk ticket. Not visible to the requester.",
      inputSchema: {
        type: "object",
        properties: {
          ticket_id: { type: "string", description: "Ticket ID (required)" },
          body: { type: "string", description: "Note text (required)" },
        },
        required: ["ticket_id", "body"],
      },
    },
    {
      name: "zendesk_add_tags",
      description: "Add one or more tags to a Zendesk ticket.",
      inputSchema: {
        type: "object",
        properties: {
          ticket_id: { type: "string", description: "Ticket ID (required)" },
          tags: { type: "array", items: { type: "string" }, description: "Tags to add (required)" },
        },
        required: ["ticket_id", "tags"],
      },
    },
    {
      name: "zendesk_update_status",
      description: "Update a Zendesk ticket's status.",
      inputSchema: {
        type: "object",
        properties: {
          ticket_id: { type: "string", description: "Ticket ID (required)" },
          status: { type: "string", description: "New status: new, open, pending, hold, solved, or closed (required)" },
        },
        required: ["ticket_id", "status"],
      },
    },
    {
      name: "zendesk_get_user",
      description: "Look up a Zendesk user by user ID or email address.",
      inputSchema: {
        type: "object",
        properties: {
          user_id: { type: "string", description: "Zendesk user ID" },
          email: { type: "string", description: "User email address (used if user_id is not given)" },
        },
      },
    },
    {
      name: "zendesk_list_recent_tickets",
      description: "List tickets updated since a given timestamp, optionally filtered by status and priority. Intended for polling/trigger use.",
      inputSchema: {
        type: "object",
        properties: {
          updated_since: { type: "string", description: "ISO 8601 timestamp — only tickets updated after this time" },
          status: { type: "string", description: "Ticket status filter" },
          priority: { type: "string", description: "Priority filter" },
          max_results: { type: "number", description: "Max results (default 25, max 100)" },
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
    const subdomain = credentials.subdomain?.replace(/^https?:\/\//, "").replace(/\.zendesk\.com.*$/, "").replace(/\/+$/, "");
    if (!subdomain) return this.err("Zendesk subdomain is not configured (e.g. acme)");

    const email = credentials.email ?? credentials.username;
    const apiToken = credentials.api_token ?? credentials.password;
    if (!email || !apiToken) return this.err("Zendesk email and api_token are required");

    const baseUrl = `https://${subdomain}.zendesk.com/api/v2`;

    const fetcher = async (path: string, options?: RequestInit) => {
      const url = `${baseUrl}${path}`;
      return this.fetchWithAuth(url, {
        ...options,
        basicAuth: { username: `${email}/token`, password: apiToken },
        orgId,
      });
    };

    const client = new ZendeskClient(fetcher, subdomain);

    switch (toolName) {
      case "zendesk_search_tickets":     return zendesk_search_tickets(client, args);
      case "zendesk_get_ticket":         return zendesk_get_ticket(client, args);
      case "zendesk_add_internal_note":  return zendesk_add_internal_note(client, args);
      case "zendesk_add_tags":           return zendesk_add_tags(client, args);
      case "zendesk_update_status":      return zendesk_update_status(client, args);
      case "zendesk_get_user":           return zendesk_get_user(client, args);
      case "zendesk_list_recent_tickets": return zendesk_list_recent_tickets(client, args);
      default:
        return this.err(`Unknown Zendesk tool: ${toolName}`);
    }
  }
}

export const zendeskMcpServer = new ZendeskMcpServer();

export function createZendeskRouter(): Router {
  const router = Router();

  router.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", integration: "zendesk", tools: zendeskMcpServer.tools.length });
  });

  router.get("/tools", (_req: Request, res: Response) => {
    res.json({ tools: zendeskMcpServer.tools });
  });

  router.post("/tools/:toolName", async (req: Request, res: Response) => {
    const { toolName } = req.params as { toolName: string };
    const orgId = getOrgId(req) ?? getDefaultOrgId() ?? "";
    const args = (req.body?.args ?? req.body) as Record<string, unknown>;

    const result = await zendeskMcpServer.callTool(toolName, args, orgId);
    res.json(result);
  });

  router.post("/connection-test", async (req: Request, res: Response) => {
    const orgId = getOrgId(req) ?? getDefaultOrgId() ?? "";
    const credentials = await zendeskMcpServer.getCredentials(orgId);
    if (!credentials) {
      return res.json({ connected: false, error: "No credentials configured" });
    }

    const subdomain = credentials.subdomain?.replace(/^https?:\/\//, "").replace(/\.zendesk\.com.*$/, "").replace(/\/+$/, "");
    if (!subdomain) {
      return res.json({ connected: false, error: "subdomain is missing" });
    }

    const email = credentials.email ?? credentials.username;
    const apiToken = credentials.api_token ?? credentials.password;

    try {
      const testRes = await zendeskMcpServer["fetchWithAuth"](
        `https://${subdomain}.zendesk.com/api/v2/users/me.json`,
        { basicAuth: { username: `${email ?? ""}/token`, password: apiToken ?? "" }, orgId }
      );
      const connected = testRes.ok;
      const body = testRes.ok ? await testRes.json() : null;
      res.json({
        connected,
        statusCode: testRes.status,
        integration: "zendesk",
        user: connected ? { name: (body as any)?.user?.name, email: (body as any)?.user?.email } : null,
      });
    } catch (err: any) {
      res.json({ connected: false, error: err?.message ?? "Connection test failed" });
    }
  });

  return router;
}
