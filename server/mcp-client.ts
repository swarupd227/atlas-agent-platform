import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";
import type { McpServer, McpServerAuth } from "@shared/schema";
import { findMcpOAuthProvider, getMcpOAuthClientCredentials } from "./mcp-oauth-providers";

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

/**
 * Returns a valid OAuth2 access token for this server, refreshing it first if
 * it's within 60s of expiry (or already expired) and a refresh token is on
 * file. Best-effort: a failed refresh falls back to the existing (possibly
 * stale) access token rather than failing the MCP call outright.
 */
async function getValidOAuthAccessToken(server: McpServer, cfg: Record<string, unknown>): Promise<string> {
  const accessToken = (cfg.accessToken as string | undefined) ?? "";
  const expiresAt = cfg.expiresAt as number | undefined;
  const refreshToken = cfg.refreshToken as string | undefined;

  if (!expiresAt || expiresAt - Date.now() > 60_000 || !refreshToken) {
    return accessToken;
  }

  const provider = findMcpOAuthProvider(server.url);
  if (!provider) return accessToken;

  try {
    const { clientId, clientSecret } = getMcpOAuthClientCredentials(provider);
    const bodyParams: Record<string, string> = { grant_type: "refresh_token", refresh_token: refreshToken };
    const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };
    if (provider.tokenAuthMethod === "basic") {
      headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
    } else {
      bodyParams.client_id = clientId;
      bodyParams.client_secret = clientSecret;
    }

    const res = await fetch(provider.refreshUrl, {
      method: "POST",
      headers,
      body: new URLSearchParams(bodyParams).toString(),
      signal: AbortSignal.timeout(10_000),
    });
    const data = await res.json() as any;
    if (!res.ok || data.error) {
      console.warn(`[mcp-client] OAuth refresh failed for server ${server.id}: ${data.error ?? res.status}`);
      return accessToken;
    }

    const newAccessToken = data.access_token ?? accessToken;
    const newExpiresAt = data.expires_in ? Date.now() + data.expires_in * 1000 : undefined;

    const { storage } = await import("./storage");
    await storage.upsertMcpServerAuth({
      serverId: server.id,
      authType: "oauth2",
      config: {
        ...cfg,
        accessToken: newAccessToken,
        refreshToken: data.refresh_token ?? refreshToken,
        expiresAt: newExpiresAt,
      },
    });

    return newAccessToken;
  } catch (err: any) {
    console.warn(`[mcp-client] OAuth refresh error for server ${server.id}:`, err?.message);
    return accessToken;
  }
}

export async function buildMcpAuthHeaders(
  server: McpServer,
  auth: McpServerAuth | undefined | null,
): Promise<Record<string, string>> {
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
      const accessToken = await getValidOAuthAccessToken(server, cfg);
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
  const authHeaders = await buildMcpAuthHeaders(server, auth);
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
  const authHeaders = await buildMcpAuthHeaders(server, auth);
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

// Backstop on top of the MCP SDK's own request timeout (60s by default,
// applied per-call inside client.callTool). Confirmed live: a real run
// against the Playwright MCP server hung for 20+ minutes with zero
// progress, and restarting that server afterward did NOT unstick it --
// the cached connection below is one long-lived object reused across every
// call to a given server, so once its transport wedges (a dropped
// connection, a browser action that never resolves server-side), every
// call sharing it hangs too, with nothing on this side ever timing out on
// its own. Evicting the cached connection on timeout, not just rejecting
// the call, is the actual fix -- otherwise the next call reuses the same
// broken object and hangs again.
const MCP_CALL_TOOL_TIMEOUT_MS = 120_000;

export async function mcpCallTool(
  server: McpServer,
  toolName: string,
  args: Record<string, unknown>,
  auth?: McpServerAuth | null,
): Promise<unknown> {
  if (!server.url) throw new Error("MCP server has no URL");
  const authHeaders = await buildMcpAuthHeaders(server, auth);
  let conn: CachedConnection;
  try {
    conn = await getConnection(server.id, server.url, authHeaders);
  } catch {
    evictConnection(server.id);
    conn = await getConnection(server.id, server.url, authHeaders);
  }
  try {
    const result = await Promise.race([
      conn.client.callTool({ name: toolName, arguments: args }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`MCP tool call "${toolName}" on server "${server.name || server.id}" timed out after ${MCP_CALL_TOOL_TIMEOUT_MS / 1000}s`)), MCP_CALL_TOOL_TIMEOUT_MS),
      ),
    ]);
    return result;
  } catch (err) {
    evictConnection(server.id);
    throw err;
  }
}

export async function mcpListResources(server: McpServer, auth?: McpServerAuth | null): Promise<McpResourceDef[]> {
  if (!server.url) throw new Error("MCP server has no URL");
  const authHeaders = await buildMcpAuthHeaders(server, auth);
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
  const authHeaders = await buildMcpAuthHeaders(server, auth);
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
