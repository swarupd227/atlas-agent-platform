/**
 * Real Model Context Protocol (JSON-RPC / streamable-HTTP) transport for any
 * RealMcpBase connector. Generic over the base class -- applies to every
 * enterprise connector (Salesforce, Jira, Snowflake, ... not just the 3 SQL
 * dialects wired to it today), mounted additively alongside each connector's
 * existing REST routes (/tools, /health, /connection-test) so nothing
 * internal changes.
 *
 * Uses the SDK's low-level `Server` (not the newer `McpServer`) deliberately:
 * our tools are JSON-Schema-native (RealMcpToolDef.inputSchema, built
 * dynamically per connector -- see buildSqlToolDefs), while McpServer's
 * registerTool() expects a Zod/Standard-Schema validator per tool. The
 * low-level Server operates on raw protocol messages, so RealMcpBase.tools
 * passes straight through with no adapter.
 */
import { Router, type Request, type Response } from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { RealMcpBase, McpToolResult } from "./real-mcp-base";
import { storage } from "./storage";
import type { McpServer } from "@shared/schema";
import type { DispatchResult } from "./tool-dispatcher";

/**
 * A leaked/misused agent API key can only reach the specific MCP servers its
 * own agent was explicitly granted via "Assign MCP Server" -- not any org
 * integration ambiently. This returns the agent's own mcp_servers row for this
 * connector: one it is linked to, owned by its organization or a platform
 * catalog row. That row names the connection the call uses.
 *
 * Resolved from the agent's links rather than by integration id: an
 * integration has one row per connection (production held 7 for postgres), and
 * a lookup by integration id returned whichever was created first, so an agent
 * linked to any other row was refused and one that passed queried the org's
 * default connection instead of its own.
 *
 * Two linked rows for one integration are refused: the URL names the
 * integration, not the connection, so the call cannot say which it means.
 */
export async function resolveAgentConnectorServer(
  agentId: string, integrationId: string, orgId: string,
): Promise<{ server: McpServer } | { status: 403 | 409; error: string }> {
  const links = await storage.getAgentMcpServers(agentId);
  const rows = (await Promise.all(links.map(l => storage.getMcpServer(l.serverId))))
    .filter((s): s is McpServer => !!s && s.integrationId === integrationId
      && (s.organizationId == null || s.organizationId === orgId));
  if (rows.length === 0) {
    return { status: 403, error: `This agent is not linked to the '${integrationId}' MCP server. Assign it via the agent's MCP Servers tab first.` };
  }
  if (rows.length > 1) {
    return { status: 409, error: `This agent is linked to ${rows.length} '${integrationId}' MCP servers, and this endpoint cannot tell which connection a call means. Unlink all but one.` };
  }
  return { server: rows[0] };
}

/**
 * A tools/call from outside Astra, decided by the same gates as a call the
 * agent makes inside it (lockdown, policy, AAR, warrant, rate limit), recorded
 * in tool_invocations and counted by the PDP shadow comparison. The skill
 * allow-list and declared scope belong to a run, and an external call has none.
 * Policies that cannot be read refuse the call: a PDP error fails closed.
 */
export async function callConnectorToolGoverned(
  base: RealMcpBase, integrationId: string, server: McpServer,
  orgId: string, agentId: string, name: string, args: Record<string, unknown>,
): Promise<McpToolResult> {
  const def = base.tools.find(t => t.name === name);
  if (!def) return refused(`Unknown tool '${name}' on '${integrationId}'.`);
  // Lazy, like the dispatcher's own connector import: every connector router
  // loads this module, and the dispatcher reaches back into the registry.
  const { resolvePolicyBundle } = await import("./routes/helpers");
  const { dispatchToolCall } = await import("./tool-dispatcher");
  let policyBundle: Awaited<ReturnType<typeof resolvePolicyBundle>>;
  try {
    policyBundle = await resolvePolicyBundle(agentId, orgId);
  } catch {
    return refused("This agent's policies could not be read, so the call was refused.");
  }
  const dispatch = await dispatchToolCall({
    agentId,
    orgId,
    args,
    policyBundle,
    tool: {
      serverId: server.id,
      serverName: server.name,
      serverUrl: server.url ?? "",
      toolName: def.name,
      toolDescription: def.description,
      toolInputSchema: def.inputSchema,
      enterpriseIntegration: integrationId,
      connectionId: server.connectionId || undefined,
    },
  });
  return toMcpToolResult(dispatch);
}

/** A dispatch as an MCP tool result: the connector's own result when it ran, else the gate's refusal as an error. */
export function toMcpToolResult(d: DispatchResult): McpToolResult {
  if (d.result && Array.isArray(d.result.content)) return d.result;
  const text = d.outcome === "gate_requires_approval"
    ? `Approval required: ${d.reason}${d.approvalId ? ` (approval ${d.approvalId}, decided in Astra)` : ""}`
    : d.error ?? d.reason ?? `Tool call refused (${d.outcome}).`;
  return refused(text);
}

function refused(text: string): McpToolResult {
  return { content: [{ type: "text", text }], isError: true };
}

/**
 * The integrations this build actually mounts a protocol endpoint for.
 *
 * Recorded here, by the function that does the mounting, because the absence of
 * a /mcp route is invisible from outside: a connector's REST /tools and
 * /connection-test stay green while no agent can call it over the protocol at
 * all. Counting the mounts is the only way a health answer can say so, and
 * recording it at the call site means the list cannot drift from the code the
 * way a hand-kept one would.
 */
const mountedIntegrations = new Set<string>();

export function isMcpProtocolMounted(integrationId: string): boolean {
  return mountedIntegrations.has(integrationId);
}

export function mountedMcpIntegrations(): string[] {
  return Array.from(mountedIntegrations).sort();
}

export function createMcpProtocolRouter(base: RealMcpBase, integrationId: string): Router {
  mountedIntegrations.add(integrationId);
  const router = Router();

  router.post("/mcp", async (req: Request, res: Response) => {
    // authMiddleware's bearer-key branch (server/auth.ts) sets these on
    // req.authUser for a key with "mcp" scope -- see extended pathAllowsBearer.
    const orgId = req.authUser?.organizationId;
    const agentId = req.authUser?.apiKeyAgentId;
    if (!orgId || !agentId) {
      res.status(401).json({ error: "This endpoint requires an agent API key with 'mcp' scope (Authorization: Bearer <key>)." });
      return;
    }

    const resolved = await resolveAgentConnectorServer(agentId, integrationId, orgId);
    if ("error" in resolved) {
      res.status(resolved.status).json({ error: resolved.error });
      return;
    }
    const connectorServer = resolved.server;

    // Fresh Server + transport per request -- the shipped SDK's own usage
    // pattern for stateless mode assumes this; a shared instance across
    // concurrent requests risks request/response state bleeding.
    const server = new Server(
      { name: `astra-${integrationId}`, version: "1.0.0" },
      { capabilities: { tools: {} } }
    );

    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: base.tools.map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
    }));

    // Cast: the SDK's generic Server<RequestT, ...> type parameters make the
    // handler's inferred "extra" type a narrower union than what
    // setRequestHandler's own overload expects when Server is constructed
    // without explicit generics (the common case, matching the SDK's own
    // documented usage) -- a structural mismatch in the .d.ts, not a real
    // type error in this handler's own logic.
    server.setRequestHandler(CallToolRequestSchema, (async (request: { params: { name: string; arguments?: Record<string, unknown> } }) => {
      const { name, arguments: args } = request.params;
      // Through the dispatcher's gates, never the connector directly (S0.3).
      return callConnectorToolGoverned(base, integrationId, connectorServer, orgId, agentId, name, args ?? {});
    }) as Parameters<typeof server.setRequestHandler>[1]);

    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      transport.close().catch(() => {});
      server.close().catch(() => {});
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err: any) {
      if (!res.headersSent) {
        // JSON-RPC 2.0 spec: id MUST be null when it couldn't be determined
        // from the request (e.g. the transport itself failed before parsing).
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: err?.message ?? "Internal server error" },
          id: null,
        });
      }
    }
  });

  return router;
}
