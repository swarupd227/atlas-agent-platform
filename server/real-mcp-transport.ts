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
import type { RealMcpBase } from "./real-mcp-base";
import { storage } from "./storage";

/**
 * A leaked/misused agent API key can only reach the specific MCP servers its
 * own agent was explicitly granted via "Assign MCP Server" -- not any org
 * integration ambiently. Resolves this connector's own mcp_servers row (via
 * the integrationId reverse-lookup added alongside this feature) and checks
 * agent_mcp_servers for a matching link.
 */
export async function isAgentAuthorizedForIntegration(agentId: string, integrationId: string): Promise<boolean> {
  const server = await storage.getMcpServerByIntegrationId(integrationId);
  if (!server) return false;
  const links = await storage.getAgentMcpServers(agentId);
  return links.some(l => l.serverId === server.id);
}

export function createMcpProtocolRouter(base: RealMcpBase, integrationId: string): Router {
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

    const authorized = await isAgentAuthorizedForIntegration(agentId, integrationId);
    if (!authorized) {
      res.status(403).json({ error: `This agent is not linked to the '${integrationId}' MCP server. Assign it via the agent's MCP Servers tab first.` });
      return;
    }

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
      return base.callTool(name, args ?? {}, orgId, agentId);
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
