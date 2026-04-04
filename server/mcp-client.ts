import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
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

const clientCache = new Map<string, Client>();

async function getClient(serverId: string, serverUrl: string): Promise<Client> {
  const existing = clientCache.get(serverId);
  if (existing) return existing;

  const transport = new StreamableHTTPClientTransport(new URL(serverUrl));
  const client = new Client({ name: "atlas-platform", version: "1.0.0" });
  await client.connect(transport);
  clientCache.set(serverId, client);
  return client;
}

function evictClient(serverId: string) {
  const c = clientCache.get(serverId);
  if (c) {
    try { c.close(); } catch {}
    clientCache.delete(serverId);
  }
}

export async function mcpInitialize(server: McpServer): Promise<McpInitResult> {
  if (!server.url) throw new Error("MCP server has no URL");

  evictClient(server.id);
  const client = await getClient(server.id, server.url);

  const serverInfo = client.getServerVersion() ?? { name: server.name, version: "unknown" };
  const capabilities = (client.getServerCapabilities() ?? {}) as Record<string, unknown>;

  const [toolsResult, resourcesResult, promptsResult] = await Promise.allSettled([
    capabilities.tools ? client.listTools() : Promise.resolve({ tools: [] }),
    capabilities.resources ? client.listResources() : Promise.resolve({ resources: [] }),
    capabilities.prompts ? client.listPrompts() : Promise.resolve({ prompts: [] }),
  ]);

  const tools: McpToolDef[] = toolsResult.status === "fulfilled"
    ? (toolsResult.value.tools ?? []).map((t: any) => ({
        name: t.name,
        description: t.description ?? "",
        inputSchema: (t.inputSchema ?? {}) as Record<string, unknown>,
      }))
    : [];

  const resources: McpResourceDef[] = resourcesResult.status === "fulfilled"
    ? (resourcesResult.value.resources ?? []).map((r: any) => ({
        uri: r.uri,
        name: r.name,
        description: r.description,
        mimeType: r.mimeType,
      }))
    : [];

  const prompts: McpPromptDef[] = promptsResult.status === "fulfilled"
    ? (promptsResult.value.prompts ?? []).map((p: any) => ({
        name: p.name,
        description: p.description,
        arguments: p.arguments,
      }))
    : [];

  const sdkProtocolVersion = (client as any)._options?.protocolVersion
    ?? (client as any).protocolVersion
    ?? server.expectedProtocolVersion
    ?? "2025-03-26";

  return {
    protocolVersion: sdkProtocolVersion,
    capabilities,
    serverInfo: { name: serverInfo.name, version: serverInfo.version },
    tools,
    resources,
    prompts,
  };
}

export async function mcpListTools(server: McpServer): Promise<McpToolDef[]> {
  if (!server.url) throw new Error("MCP server has no URL");
  let client: Client;
  try {
    client = await getClient(server.id, server.url);
  } catch (err) {
    evictClient(server.id);
    client = await getClient(server.id, server.url);
  }
  const result = await client.listTools();
  return (result.tools ?? []).map((t: any) => ({
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
  let client: Client;
  try {
    client = await getClient(server.id, server.url);
  } catch (err) {
    evictClient(server.id);
    client = await getClient(server.id, server.url);
  }
  const result = await client.callTool({ name: toolName, arguments: args });
  return result;
}

export async function mcpListResources(server: McpServer): Promise<McpResourceDef[]> {
  if (!server.url) throw new Error("MCP server has no URL");
  const client = await getClient(server.id, server.url);
  const result = await client.listResources();
  return (result.resources ?? []).map((r: any) => ({
    uri: r.uri,
    name: r.name,
    description: r.description,
    mimeType: r.mimeType,
  }));
}

export async function mcpListPrompts(server: McpServer): Promise<McpPromptDef[]> {
  if (!server.url) throw new Error("MCP server has no URL");
  const client = await getClient(server.id, server.url);
  const result = await client.listPrompts();
  return (result.prompts ?? []).map((p: any) => ({
    name: p.name,
    description: p.description,
    arguments: p.arguments,
  }));
}
