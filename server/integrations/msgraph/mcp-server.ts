/**
 * Microsoft Graph MCP Server — 14 real tools across Exchange, Teams, SharePoint, Azure AD.
 * Extends RealMcpBase; auth via Bearer access_token (OAuth2, Azure App Registration).
 * Credentials: access_token (required), refresh_token, tenant_id, client_id, client_secret,
 *              user_id (delegated mode) or service_account_email (app mode).
 * Mounted at /api/integrations/msgraph
 */

import { Router, Request, Response } from "express";
import { RealMcpBase, type McpToolResult, type RealMcpToolDef } from "../../real-mcp-base";
import { MicrosoftGraphClient, GRAPH_BASE } from "./client";
import { getOrgId, getDefaultOrgId } from "../../auth";
import { storage } from "../../storage";
import {
  graph_send_email,
  graph_get_email,
  graph_search_email,
  graph_list_calendar_events,
  graph_create_calendar_event,
  graph_get_user,
  graph_list_users,
  graph_post_teams_message,
  graph_get_teams_channel_messages,
  graph_list_teams,
  graph_search_sharepoint,
  graph_get_sharepoint_file,
  graph_read_sharepoint_page,
  graph_get_onedrive_file,
} from "./tools";

const OUTBOUND_TOOLS = new Set(["graph_send_email", "graph_post_teams_message"]);

export class MicrosoftGraphMcpServer extends RealMcpBase {
  readonly integrationId = "msgraph";

  readonly tools: RealMcpToolDef[] = [
    {
      name: "graph_send_email",
      description: "Send an email via Outlook on behalf of the authenticated user or a service account. Automatically appends agent attribution footer.",
      inputSchema: {
        type: "object",
        properties: {
          subject:      { type: "string", description: "Email subject (required)" },
          body:         { type: "string", description: "Email body content (required)" },
          to:           { description: "Recipient email address or array of addresses (required)", oneOf: [{ type: "string" }, { type: "array", items: { type: "string" } }] },
          cc:           { description: "CC email address or array", oneOf: [{ type: "string" }, { type: "array", items: { type: "string" } }] },
          content_type: { type: "string", enum: ["Text", "HTML"], description: "Body content type (default: Text)" },
          importance:   { type: "string", enum: ["Low", "Normal", "High"], description: "Email importance (default: Normal)" },
          user_id:      { type: "string", description: "Sender's UPN or email (default: authenticated user)" },
          agent_name:   { type: "string", description: "Agent name for attribution footer" },
        },
        required: ["subject", "body", "to"],
      },
    },
    {
      name: "graph_get_email",
      description: "Read a specific email by message ID with body, sender, and attachments list.",
      inputSchema: {
        type: "object",
        properties: {
          message_id: { type: "string", description: "Outlook message ID (required)" },
          user_id:    { type: "string", description: "Mailbox UPN or email (default: authenticated user)" },
        },
        required: ["message_id"],
      },
    },
    {
      name: "graph_search_email",
      description: "KQL search across the user's Outlook mailbox.",
      inputSchema: {
        type: "object",
        properties: {
          query:   { type: "string", description: "KQL search expression (required)" },
          top:     { type: "number", description: "Results to return (default 20, max 50)" },
          user_id: { type: "string", description: "Mailbox UPN (default: authenticated user)" },
        },
        required: ["query"],
      },
    },
    {
      name: "graph_list_calendar_events",
      description: "List upcoming calendar events for a user in a time window.",
      inputSchema: {
        type: "object",
        properties: {
          user_id:        { type: "string", description: "User UPN or email (default: authenticated user)" },
          start_datetime: { type: "string", description: "ISO 8601 start (default: now)" },
          end_datetime:   { type: "string", description: "ISO 8601 end (default: 7 days from now)" },
          top:            { type: "number", description: "Events to return (default 25, max 100)" },
        },
      },
    },
    {
      name: "graph_create_calendar_event",
      description: "Create a calendar event with attendees, optional Teams meeting link, and recurrence.",
      inputSchema: {
        type: "object",
        properties: {
          subject:          { type: "string", description: "Event subject (required)" },
          start_datetime:   { type: "string", description: "ISO 8601 start datetime (required)" },
          end_datetime:     { type: "string", description: "ISO 8601 end datetime (required)" },
          timezone:         { type: "string", description: "IANA timezone (default: UTC)" },
          body:             { type: "string", description: "Event description" },
          location:         { type: "string", description: "Physical or virtual location" },
          attendees:        { type: "array", items: { type: "string" }, description: "Array of attendee email addresses" },
          is_online_meeting: { type: "boolean", description: "Attach a Teams meeting link (default: true)" },
          user_id:          { type: "string", description: "Calendar owner UPN (default: authenticated user)" },
        },
        required: ["subject", "start_datetime", "end_datetime"],
      },
    },
    {
      name: "graph_get_user",
      description: "Azure AD user profile lookup by email or UPN.",
      inputSchema: {
        type: "object",
        properties: {
          user_id: { type: "string", description: "Email address or User Principal Name (required)" },
        },
        required: ["user_id"],
      },
    },
    {
      name: "graph_list_users",
      description: "Search the Azure AD organization directory by display name or department.",
      inputSchema: {
        type: "object",
        properties: {
          search:     { type: "string", description: "Free-text name search across displayName" },
          department: { type: "string", description: "Filter by department (exact match)" },
          top:        { type: "number", description: "Results to return (default 20, max 100)" },
        },
      },
    },
    {
      name: "graph_post_teams_message",
      description: "Post a plain-text message to a Microsoft Teams channel.",
      inputSchema: {
        type: "object",
        properties: {
          team_id:    { type: "string", description: "Teams team ID (required)" },
          channel_id: { type: "string", description: "Teams channel ID (required)" },
          content:    { type: "string", description: "Message text (required)" },
        },
        required: ["team_id", "channel_id", "content"],
      },
    },
    {
      name: "graph_get_teams_channel_messages",
      description: "Read recent messages from a Microsoft Teams channel.",
      inputSchema: {
        type: "object",
        properties: {
          team_id:    { type: "string", description: "Teams team ID (required)" },
          channel_id: { type: "string", description: "Teams channel ID (required)" },
          top:        { type: "number", description: "Messages to return (default 20, max 50)" },
        },
        required: ["team_id", "channel_id"],
      },
    },
    {
      name: "graph_list_teams",
      description: "Enumerate Microsoft Teams the service account or authenticated user is a member of.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "graph_search_sharepoint",
      description: "Search SharePoint and OneDrive for files, list items, and sites by keyword.",
      inputSchema: {
        type: "object",
        properties: {
          query:        { type: "string", description: "Search query (required)" },
          entity_types: { type: "array", items: { type: "string" }, description: "Entity types to search (default: driveItem, listItem, site)" },
          size:         { type: "number", description: "Results to return (default 10, max 25)" },
        },
        required: ["query"],
      },
    },
    {
      name: "graph_get_sharepoint_file",
      description: "Get metadata and download URL for a SharePoint file. Returns a permission error (not a crash) if the service account cannot read the file.",
      inputSchema: {
        type: "object",
        properties: {
          drive_id: { type: "string", description: "SharePoint drive ID (required)" },
          item_id:  { type: "string", description: "Drive item ID (required)" },
        },
        required: ["drive_id", "item_id"],
      },
    },
    {
      name: "graph_read_sharepoint_page",
      description: "Extract text content from a SharePoint site page.",
      inputSchema: {
        type: "object",
        properties: {
          site_id: { type: "string", description: "SharePoint site ID (required)" },
          page_id: { type: "string", description: "Page ID (required)" },
        },
        required: ["site_id", "page_id"],
      },
    },
    {
      name: "graph_get_onedrive_file",
      description: "Get metadata and download URL for a OneDrive file by path.",
      inputSchema: {
        type: "object",
        properties: {
          item_path: { type: "string", description: "File path relative to root (e.g. Documents/report.pdf) (required)" },
          user_id:   { type: "string", description: "User UPN or email (default: authenticated user)" },
        },
        required: ["item_path"],
      },
    },
  ];

  async handleTool(
    toolName: string,
    args: Record<string, unknown>,
    credentials: Record<string, string>,
    orgId: string
  ): Promise<McpToolResult> {
    const token = credentials.access_token ?? credentials.token;
    if (!token) return this.err("Microsoft Graph access_token is not configured. Connect your Azure App Registration via the Integrations settings.");

    const fetcher = async (path: string, options?: RequestInit) => {
      const url = path.startsWith("http") ? path : `${GRAPH_BASE}${path}`;
      return this.fetchWithAuth(url, {
        ...options,
        bearerToken: token,
        orgId,
        headers: {
          ...(options?.headers as Record<string, string> | undefined),
          ConsistencyLevel: "eventual",
        },
      });
    };

    const client = new MicrosoftGraphClient(fetcher);

    let result: McpToolResult;
    switch (toolName) {
      case "graph_send_email":                result = await graph_send_email(client, args); break;
      case "graph_get_email":                 result = await graph_get_email(client, args); break;
      case "graph_search_email":              result = await graph_search_email(client, args); break;
      case "graph_list_calendar_events":      result = await graph_list_calendar_events(client, args); break;
      case "graph_create_calendar_event":     result = await graph_create_calendar_event(client, args); break;
      case "graph_get_user":                  result = await graph_get_user(client, args); break;
      case "graph_list_users":                result = await graph_list_users(client, args); break;
      case "graph_post_teams_message":        result = await graph_post_teams_message(client, args); break;
      case "graph_get_teams_channel_messages":result = await graph_get_teams_channel_messages(client, args); break;
      case "graph_list_teams":                result = await graph_list_teams(client, args); break;
      case "graph_search_sharepoint":         result = await graph_search_sharepoint(client, args); break;
      case "graph_get_sharepoint_file":       result = await graph_get_sharepoint_file(client, args); break;
      case "graph_read_sharepoint_page":      result = await graph_read_sharepoint_page(client, args); break;
      case "graph_get_onedrive_file":         result = await graph_get_onedrive_file(client, args); break;
      default: return this.err(`Unknown Microsoft Graph tool: ${toolName}`);
    }

    // Extra audit event for outbound communications (email, Teams message)
    if (!result.isError && OUTBOUND_TOOLS.has(toolName)) {
      storage.createAuditEvent({
        actorType: "agent",
        action: "agent_communication",
        objectType: toolName === "graph_send_email" ? "email" : "teams_message",
        objectId: `${toolName}:${String(args.to ?? args.team_id ?? "")}`,
        details: JSON.stringify({
          tool: toolName,
          to: args.to ?? args.team_id ?? null,
          subject: args.subject ?? null,
          agent_name: args.agent_name ?? null,
          attribution_added: toolName === "graph_send_email",
        }),
        organizationId: orgId,
      }).catch(() => {});
    }

    return result;
  }
}

export const microsoftGraphMcpServer = new MicrosoftGraphMcpServer();

export function createMicrosoftGraphRouter(): Router {
  const router = Router();

  router.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", integration: "msgraph", tools: microsoftGraphMcpServer.tools.length });
  });

  router.get("/tools", (_req: Request, res: Response) => {
    res.json({ tools: microsoftGraphMcpServer.tools });
  });

  router.post("/tools/:toolName", async (req: Request, res: Response) => {
    const { toolName } = req.params;
    const orgId = getOrgId(req) ?? getDefaultOrgId();
    const args  = (req.body?.args ?? req.body) as Record<string, unknown>;
    const result = await microsoftGraphMcpServer.callTool(toolName, args, orgId);
    res.json(result);
  });

  /**
   * GET /api/integrations/msgraph/permissions
   * Returns the required Azure AD app permissions and admin-consent URL template.
   * Used by the Atlas connect-flow UI to show an admin-consent guidance step before OAuth.
   */
  router.get("/permissions", (_req: Request, res: Response) => {
    res.json({
      integration: "msgraph",
      adminConsentUrlTemplate: "https://login.microsoftonline.com/{tenant_id}/adminconsent?client_id={client_id}&redirect_uri={redirect_uri}",
      connectGuidance: "An Azure AD Global Administrator must grant admin consent for the permissions below before users can connect. Substitute {tenant_id} and {client_id} with your Azure App Registration values.",
      requiredPermissions: [
        { permission: "Mail.ReadWrite",          type: "Delegated",   description: "Read and send email on behalf of the signed-in user" },
        { permission: "Mail.Send",               type: "Delegated",   description: "Send email on behalf of the signed-in user" },
        { permission: "Calendars.ReadWrite",     type: "Delegated",   description: "Read and create calendar events" },
        { permission: "User.Read.All",           type: "Application", description: "Look up any user in the Azure AD directory" },
        { permission: "Team.ReadBasic.All",      type: "Application", description: "List Teams the service account is a member of" },
        { permission: "ChannelMessage.Send",     type: "Application", description: "Post messages to Teams channels" },
        { permission: "ChannelMessage.Read.All", type: "Application", description: "Read Teams channel messages" },
        { permission: "Files.Read.All",          type: "Application", description: "Read SharePoint and OneDrive files" },
        { permission: "Sites.Read.All",          type: "Application", description: "Read SharePoint site pages and content" },
      ],
    });
  });

  router.post("/connection-test", async (req: Request, res: Response) => {
    const orgId = getOrgId(req) ?? getDefaultOrgId();
    const credentials = await microsoftGraphMcpServer.getCredentials(orgId);
    if (!credentials) {
      return res.json({ connected: false, error: "No credentials configured" });
    }

    const token = credentials.access_token ?? credentials.token;
    if (!token) {
      return res.json({ connected: false, error: "access_token is missing" });
    }

    try {
      const testRes = await microsoftGraphMcpServer["fetchWithAuth"](`${GRAPH_BASE}/organization`, {
        bearerToken: token,
        orgId,
      });
      const connected = testRes.ok;
      const body = connected ? await testRes.json() as any : null;
      const org  = body?.value?.[0];
      res.json({
        connected,
        statusCode: testRes.status,
        integration: "msgraph",
        organization: connected
          ? { id: org?.id, display_name: org?.displayName, verified_domains: (org?.verifiedDomains ?? []).map((d: any) => d.name) }
          : null,
        error: connected ? undefined : `HTTP ${testRes.status}`,
      });
    } catch (err: any) {
      res.json({ connected: false, error: err?.message ?? "Connection test failed" });
    }
  });

  return router;
}
