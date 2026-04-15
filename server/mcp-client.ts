import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";
import type { McpServer, McpServerAuth } from "@shared/schema";

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

// ─── CredentialManager: build HTTP headers from a McpServerAuth record ────────
// Supports: none | api_key | bearer | basic | oauth2
// Config shapes (stored in mcpServerAuth.config jsonb):
//   api_key:  { headerName?: string, value: string }        → X-API-Key (or custom header)
//   bearer:   { token: string }                             → Authorization: Bearer <token>
//   basic:    { username: string, password: string }        → Authorization: Basic <b64>
//   oauth2:   { accessToken: string }                       → Authorization: Bearer <accessToken>

export function buildMcpAuthHeaders(auth: McpServerAuth | undefined | null): Record<string, string> {
  if (!auth || auth.authType === "none") return {};
  const cfg = (auth.config as Record<string, unknown> | null) ?? {};

  switch (auth.authType) {
    case "api_key": {
      const headerName = (cfg.headerName as string | undefined) ?? "X-API-Key";
      const value = cfg.value as string | undefined;
      if (!value) return {};
      return { [headerName]: value };
    }
    case "bearer": {
      const token = cfg.token as string | undefined;
      if (!token) return {};
      return { Authorization: `Bearer ${token}` };
    }
    case "basic": {
      const username = (cfg.username as string | undefined) ?? "";
      const password = (cfg.password as string | undefined) ?? "";
      const encoded = Buffer.from(`${username}:${password}`).toString("base64");
      return { Authorization: `Basic ${encoded}` };
    }
    case "oauth2": {
      const accessToken = cfg.accessToken as string | undefined;
      if (!accessToken) return {};
      return { Authorization: `Bearer ${accessToken}` };
    }
    default:
      return {};
  }
}

// ─── Connection cache ─────────────────────────────────────────────────────────
// Cache key includes a fingerprint of auth headers so that rotated credentials
// automatically evict the old connection and open a fresh authenticated one.

interface CachedConnection {
  client: Client;
  transport: StreamableHTTPClientTransport;
  serverUrl: string;
  authFingerprint: string;
}

const connectionCache = new Map<string, CachedConnection>();

function authFingerprint(headers: Record<string, string>): string {
  const keys = Object.keys(headers).sort();
  if (keys.length === 0) return "";
  return keys.map((k) => `${k}=${headers[k]}`).join("|");
}

async function getConnection(
  serverId: string,
  serverUrl: string,
  authHeaders: Record<string, string> = {},
): Promise<CachedConnection> {
  const fp = authFingerprint(authHeaders);
  const existing = connectionCache.get(serverId);

  if (existing) {
    if (existing.serverUrl === serverUrl && existing.authFingerprint === fp) return existing;
    evictConnection(serverId);
  }

  const hasHeaders = Object.keys(authHeaders).length > 0;
  const transport = hasHeaders
    ? new StreamableHTTPClientTransport(new URL(serverUrl), {
        requestInit: { headers: authHeaders },
      })
    : new StreamableHTTPClientTransport(new URL(serverUrl));

  const client = new Client({ name: "atlas-platform", version: "1.0.0" });
  await client.connect(transport);

  const conn: CachedConnection = { client, transport, serverUrl, authFingerprint: fp };
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

export async function mcpInitialize(server: McpServer, auth?: McpServerAuth | null): Promise<McpInitResult> {
  if (!server.url) throw new Error("MCP server has no URL");

  evictConnection(server.id);
  const authHeaders = buildMcpAuthHeaders(auth);
  const { client, transport } = await getConnection(server.id, server.url, authHeaders);

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

export async function mcpListTools(server: McpServer, auth?: McpServerAuth | null): Promise<McpToolDef[]> {
  if (!server.url) throw new Error("MCP server has no URL");
  const authHeaders = buildMcpAuthHeaders(auth);
  let conn: CachedConnection;
  try {
    conn = await getConnection(server.id, server.url, authHeaders);
  } catch {
    evictConnection(server.id);
    conn = await getConnection(server.id, server.url, authHeaders);
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
  args: Record<string, unknown>,
  auth?: McpServerAuth | null,
): Promise<unknown> {
  if (!server.url) throw new Error("MCP server has no URL");
  const authHeaders = buildMcpAuthHeaders(auth);
  let conn: CachedConnection;
  try {
    conn = await getConnection(server.id, server.url, authHeaders);
  } catch {
    evictConnection(server.id);
    conn = await getConnection(server.id, server.url, authHeaders);
  }
  const result = await conn.client.callTool({ name: toolName, arguments: args });
  return result;
}

export async function mcpListResources(server: McpServer, auth?: McpServerAuth | null): Promise<McpResourceDef[]> {
  if (!server.url) throw new Error("MCP server has no URL");
  const authHeaders = buildMcpAuthHeaders(auth);
  const { client } = await getConnection(server.id, server.url, authHeaders);
  const result = await client.listResources();
  return result.resources.map((r) => ({
    uri: r.uri,
    name: r.name,
    description: r.description,
    mimeType: r.mimeType,
  }));
}

export async function mcpListPrompts(server: McpServer, auth?: McpServerAuth | null): Promise<McpPromptDef[]> {
  if (!server.url) throw new Error("MCP server has no URL");
  const authHeaders = buildMcpAuthHeaders(auth);
  const { client } = await getConnection(server.id, server.url, authHeaders);
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
