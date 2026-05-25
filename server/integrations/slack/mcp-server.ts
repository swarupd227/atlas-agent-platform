/**
 * Slack MCP Server — 12 real tools via Slack Web API.
 * Extends RealMcpBase; auth via Bot Token (xoxb-) for most tools.
 * User Token (xoxp-) required for search.messages (search:read scope).
 * Mounted at /api/integrations/slack
 */

import { Router, Request, Response } from "express";
import { RealMcpBase, type McpToolResult, type RealMcpToolDef } from "../../real-mcp-base";
import { SlackClient, SLACK_BASE } from "./client";
import { getOrgId, getDefaultOrgId } from "../../auth";
import { storage } from "../../storage";
import {
  slack_post_message,
  slack_post_threaded_reply,
  slack_get_channel_history,
  slack_search_messages,
  slack_get_user,
  slack_list_channels,
  slack_get_thread,
  slack_set_channel_topic,
  slack_add_reaction,
  slack_get_file,
  slack_create_canvas,
  slack_lookup_user_by_email,
} from "./tools";

const OUTBOUND_TOOLS = new Set(["slack_post_message", "slack_post_threaded_reply"]);

export class SlackMcpServer extends RealMcpBase {
  readonly integrationId = "slack";

  readonly tools: RealMcpToolDef[] = [
    {
      name: "slack_post_message",
      description: "Post a message to a Slack channel or DM. Supports plain text and Block Kit JSON. Automatically appends an agent attribution footer.",
      inputSchema: {
        type: "object",
        properties: {
          channel:    { type: "string", description: "Channel ID or name (e.g. C01234ABCD or #general)" },
          text:       { type: "string", description: "Message text (Slack mrkdwn supported)" },
          blocks:     { type: "array",  description: "Block Kit JSON blocks (optional, overrides text for layout)" },
          agent_name: { type: "string", description: "Name of the agent posting — included in attribution footer" },
        },
        required: ["channel"],
      },
    },
    {
      name: "slack_post_threaded_reply",
      description: "Reply in a Slack thread on an existing message. Appends agent attribution footer.",
      inputSchema: {
        type: "object",
        properties: {
          channel:    { type: "string", description: "Channel ID containing the parent message" },
          thread_ts:  { type: "string", description: "Timestamp of the parent message to reply to" },
          text:       { type: "string", description: "Reply text" },
          agent_name: { type: "string", description: "Agent name for attribution footer" },
        },
        required: ["channel", "thread_ts", "text"],
      },
    },
    {
      name: "slack_get_channel_history",
      description: "Fetch recent messages from a Slack channel with optional time range.",
      inputSchema: {
        type: "object",
        properties: {
          channel: { type: "string", description: "Channel ID (required)" },
          limit:   { type: "number", description: "Messages to return (default 20, max 100)" },
          oldest:  { type: "string", description: "Unix timestamp — only messages after this" },
          latest:  { type: "string", description: "Unix timestamp — only messages before this" },
        },
        required: ["channel"],
      },
    },
    {
      name: "slack_search_messages",
      description: "Full-text search across the Slack workspace. Requires a User Token (xoxp-) with search:read scope stored as user_token.",
      inputSchema: {
        type: "object",
        properties: {
          query:   { type: "string", description: "Search query (required)" },
          channel: { type: "string", description: "Limit to a specific channel name (without #)" },
          count:   { type: "number", description: "Results to return (default 20, max 100)" },
        },
        required: ["query"],
      },
    },
    {
      name: "slack_get_user",
      description: "Look up a Slack user by user_id or email. Returns profile fields and presence.",
      inputSchema: {
        type: "object",
        properties: {
          user_id: { type: "string", description: "Slack user ID (e.g. U01234ABCD)" },
          email:   { type: "string", description: "Email address to look up (alternative to user_id)" },
        },
      },
    },
    {
      name: "slack_list_channels",
      description: "List channels the bot is a member of, with member count and topic.",
      inputSchema: {
        type: "object",
        properties: {
          limit:  { type: "number", description: "Channels to return (default 100, max 1000)" },
          cursor: { type: "string", description: "Pagination cursor from previous response" },
        },
      },
    },
    {
      name: "slack_get_thread",
      description: "Fetch all replies in a Slack message thread.",
      inputSchema: {
        type: "object",
        properties: {
          channel:   { type: "string", description: "Channel ID containing the thread" },
          thread_ts: { type: "string", description: "Timestamp of the root message" },
          limit:     { type: "number", description: "Replies to return (default 50, max 200)" },
        },
        required: ["channel", "thread_ts"],
      },
    },
    {
      name: "slack_set_channel_topic",
      description: "Update the topic of a Slack channel. Requires channels:manage or groups:write scope.",
      inputSchema: {
        type: "object",
        properties: {
          channel: { type: "string", description: "Channel ID" },
          topic:   { type: "string", description: "New channel topic text" },
        },
        required: ["channel", "topic"],
      },
    },
    {
      name: "slack_add_reaction",
      description: "Add an emoji reaction to a Slack message — useful for acknowledgment workflows.",
      inputSchema: {
        type: "object",
        properties: {
          channel:   { type: "string", description: "Channel ID" },
          timestamp: { type: "string", description: "Message timestamp (ts)" },
          name:      { type: "string", description: "Emoji name without colons (e.g. white_check_mark)" },
        },
        required: ["channel", "timestamp", "name"],
      },
    },
    {
      name: "slack_get_file",
      description: "Get metadata and download URL for a shared Slack file.",
      inputSchema: {
        type: "object",
        properties: {
          file_id: { type: "string", description: "Slack file ID (e.g. F01234ABCD)" },
        },
        required: ["file_id"],
      },
    },
    {
      name: "slack_create_canvas",
      description: "Create a Slack Canvas document in a channel (requires canvases:write scope).",
      inputSchema: {
        type: "object",
        properties: {
          title:      { type: "string", description: "Canvas title (required)" },
          channel_id: { type: "string", description: "Channel to associate the canvas with" },
          markdown:   { type: "string", description: "Initial markdown content for the canvas" },
        },
        required: ["title"],
      },
    },
    {
      name: "slack_lookup_user_by_email",
      description: "Find a Slack user from an email address — useful for @mentioning or DM targeting.",
      inputSchema: {
        type: "object",
        properties: {
          email: { type: "string", description: "Email address to look up (required)" },
        },
        required: ["email"],
      },
    },
  ];

  async handleTool(
    toolName: string,
    args: Record<string, unknown>,
    credentials: Record<string, string>,
    orgId: string
  ): Promise<McpToolResult> {
    const botToken  = credentials.bot_token ?? credentials.access_token ?? credentials.token;
    const userToken = credentials.user_token ?? botToken;

    if (!botToken) return this.err("Slack bot_token is not configured");

    // search.messages requires user_token (xoxp- scope); fall back with clear message
    const isSearchTool = toolName === "slack_search_messages";
    const activeToken  = isSearchTool ? userToken : botToken;

    const fetcher = async (path: string, options?: RequestInit) => {
      return this.fetchWithAuth(`${SLACK_BASE}${path}`, {
        ...options,
        bearerToken: activeToken,
        orgId,
      });
    };

    const client = new SlackClient(fetcher);

    let result: McpToolResult;
    switch (toolName) {
      case "slack_post_message":        result = await slack_post_message(client, args); break;
      case "slack_post_threaded_reply": result = await slack_post_threaded_reply(client, args); break;
      case "slack_get_channel_history": result = await slack_get_channel_history(client, args); break;
      case "slack_search_messages":     result = await slack_search_messages(client, args); break;
      case "slack_get_user":            result = await slack_get_user(client, args); break;
      case "slack_list_channels":       result = await slack_list_channels(client, args); break;
      case "slack_get_thread":          result = await slack_get_thread(client, args); break;
      case "slack_set_channel_topic":   result = await slack_set_channel_topic(client, args); break;
      case "slack_add_reaction":        result = await slack_add_reaction(client, args); break;
      case "slack_get_file":            result = await slack_get_file(client, args); break;
      case "slack_create_canvas":       result = await slack_create_canvas(client, args); break;
      case "slack_lookup_user_by_email":result = await slack_lookup_user_by_email(client, args); break;
      default: return this.err(`Unknown Slack tool: ${toolName}`);
    }

    // Extra audit event for outbound communications
    if (!result.isError && OUTBOUND_TOOLS.has(toolName)) {
      storage.createAuditEvent({
        actorType: "agent",
        action: "agent_communication",
        objectType: "slack_message",
        objectId: `${toolName}:${String(args.channel ?? "")}`,
        details: JSON.stringify({
          tool: toolName,
          channel: args.channel,
          agent_name: args.agent_name ?? null,
          attribution_added: true,
        }),
        organizationId: orgId,
      }).catch(() => {});
    }

    return result;
  }
}

export const slackMcpServer = new SlackMcpServer();

export function createSlackRouter(): Router {
  const router = Router();

  router.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", integration: "slack", tools: slackMcpServer.tools.length });
  });

  router.get("/tools", (_req: Request, res: Response) => {
    res.json({ tools: slackMcpServer.tools });
  });

  router.post("/tools/:toolName", async (req: Request, res: Response) => {
    const { toolName } = req.params;
    const orgId = getOrgId(req) ?? getDefaultOrgId();
    const args  = (req.body?.args ?? req.body) as Record<string, unknown>;
    const result = await slackMcpServer.callTool(toolName, args, orgId);
    res.json(result);
  });

  router.post("/connection-test", async (req: Request, res: Response) => {
    const orgId = getOrgId(req) ?? getDefaultOrgId();
    const credentials = await slackMcpServer.getCredentials(orgId);
    if (!credentials) {
      return res.json({ connected: false, error: "No credentials configured" });
    }

    const token = credentials.bot_token ?? credentials.access_token ?? credentials.token;
    if (!token) {
      return res.json({ connected: false, error: "bot_token is missing from credentials" });
    }

    try {
      const testRes = await slackMcpServer["fetchWithAuth"](`${SLACK_BASE}/auth.test`, {
        bearerToken: token,
        orgId,
      });
      const body = await testRes.json() as any;
      const connected = body?.ok === true;
      res.json({
        connected,
        integration: "slack",
        workspace:  connected ? { team: body.team, bot_id: body.bot_id, user: body.user } : null,
        error: connected ? undefined : (body?.error ?? "auth.test failed"),
      });
    } catch (err: any) {
      res.json({ connected: false, error: err?.message ?? "Connection test failed" });
    }
  });

  return router;
}
