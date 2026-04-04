import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";
import type { McpServer } from "@shared/schema";

export interface McpToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface McpResourceDef {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface McpPromptDef {
  name: string;
  description?: string;
  arguments?: Array<{ name: string; description?: string; required?: boolean }>;
}

export interface McpInitResult {
  protocolVersion: string;
  capabilities: Record<string, unknown>;
  serverInfo: { name: string; version: string };
  tools: McpToolDef[];
  resources: McpResourceDef[];
  prompts: McpPromptDef[];
}

const LOCALHOST_PATTERNS = [/^https?:\/\/localhost[:/]/i, /^https?:\/\/127\.0\.0\.1[:/]/i];

export function isRealMcpServer(server: Pick<McpServer, "url" | "transportType">): boolean {
  if (!server.url) return false;
  if (server.transportType !== "streamable-http" && server.transportType !== "sse") return false;
  return !LOCALHOST_PATTERNS.some((rx) => rx.test(server.url!));
}

interface CachedConnection {
  client: Client;
  transport: StreamableHTTPClientTransport;
}

const connectionCache = new Map<string, CachedConnection>();

async function getConnection(serverId: string, serverUrl: string): Promise<CachedConnection> {
  const existing = connectionCache.get(serverId);
  if (existing) return existing;

  const transport = new StreamableHTTPClientTransport(new URL(serverUrl));
  const client = new Client({ name: "atlas-platform", version: "1.0.0" });
  await client.connect(transport);

  const conn: CachedConnection = { client, transport };
  connectionCache.set(serverId, conn);
  return conn;
}

function evictConnection(serverId: string): void {
  const conn = connectionCache.get(serverId);
  if (conn) {
    try { conn.client.close(); } catch { /* ignore */ }
    connectionCache.delete(serverId);
  }
}

export async function mcpInitialize(server: McpServer): Promise<McpInitResult> {
  if (!server.url) throw new Error("MCP server has no URL");

  evictConnection(server.id);
  const { client, transport } = await getConnection(server.id, server.url);

  const sdkServerVersion = client.getServerVersion();
  const sdkCapabilities = client.getServerCapabilities() ?? {};

  const serverInfo = {
    name: sdkServerVersion?.name ?? server.name,
    version: sdkServerVersion?.version ?? "unknown",
  };
  const capabilities = sdkCapabilities as Record<string, unknown>;

  const protocolVersion = transport.protocolVersion ?? LATEST_PROTOCOL_VERSION;

  const hasTools = "tools" in sdkCapabilities;
  const hasResources = "resources" in sdkCapabilities;
  const hasPrompts = "prompts" in sdkCapabilities;

  const [toolsResult, resourcesResult, promptsResult] = await Promise.allSettled([
    hasTools ? client.listTools() : Promise.resolve({ tools: [] }),
    hasResources ? client.listResources() : Promise.resolve({ resources: [] }),
    hasPrompts ? client.listPrompts() : Promise.resolve({ prompts: [] }),
  ]);

  const tools: McpToolDef[] = toolsResult.status === "fulfilled"
    ? toolsResult.value.tools.map((t) => ({
        name: t.name,
        description: t.description ?? "",
        inputSchema: (t.inputSchema ?? {}) as Record<string, unknown>,
      }))
    : [];

  const resources: McpResourceDef[] = resourcesResult.status === "fulfilled"
    ? resourcesResult.value.resources.map((r) => ({
        uri: r.uri,
        name: r.name,
        description: r.description,
        mimeType: r.mimeType,
      }))
    : [];

  const prompts: McpPromptDef[] = promptsResult.status === "fulfilled"
    ? promptsResult.value.prompts.map((p) => ({
        name: p.name,
        description: p.description,
        arguments: p.arguments?.map((a) => ({
          name: a.name,
          description: a.description,
          required: a.required,
        })),
      }))
    : [];

  return { protocolVersion, capabilities, serverInfo, tools, resources, prompts };
}

export async function mcpListTools(server: McpServer): Promise<McpToolDef[]> {
  if (!server.url) throw new Error("MCP server has no URL");
  let conn: CachedConnection;
  try {
    conn = await getConnection(server.id, server.url);
  } catch {
    evictConnection(server.id);
    conn = await getConnection(server.id, server.url);
  }
  const result = await conn.client.listTools();
  return result.tools.map((t) => ({
    name: t.name,
    description: t.description ?? "",
    inputSchema: (t.inputSchema ?? {}) as Record<string, unknown>,
  }));
}

export async function mcpCallTool(
  server: McpServer,
  toolName: string,
  args: Record<string, unknown>
): Promise<unknown> {
  if (!server.url) throw new Error("MCP server has no URL");
  let conn: CachedConnection;
  try {
    conn = await getConnection(server.id, server.url);
  } catch {
    evictConnection(server.id);
    conn = await getConnection(server.id, server.url);
  }
  const result = await conn.client.callTool({ name: toolName, arguments: args });
  return result;
}

export async function mcpListResources(server: McpServer): Promise<McpResourceDef[]> {
  if (!server.url) throw new Error("MCP server has no URL");
  const { client } = await getConnection(server.id, server.url);
  const result = await client.listResources();
  return result.resources.map((r) => ({
    uri: r.uri,
    name: r.name,
    description: r.description,
    mimeType: r.mimeType,
  }));
}

export async function mcpListPrompts(server: McpServer): Promise<McpPromptDef[]> {
  if (!server.url) throw new Error("MCP server has no URL");
  const { client } = await getConnection(server.id, server.url);
  const result = await client.listPrompts();
  return result.prompts.map((p) => ({
    name: p.name,
    description: p.description,
    arguments: p.arguments?.map((a) => ({
      name: a.name,
      description: a.description,
      required: a.required,
    })),
  }));
}
