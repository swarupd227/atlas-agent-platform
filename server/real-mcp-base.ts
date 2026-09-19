import { decryptCredentialMap } from "./credential-vault";
import { storage } from "./storage";

export interface McpToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

export interface RealMcpToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 500;

/** Masks credential-like values in tool args for safe audit logging */
export function maskAuditArgs(args: Record<string, unknown>): Record<string, unknown> {
  const SENSITIVE = /token|secret|key|pass|auth|credential/i;
  return Object.fromEntries(
    Object.entries(args).map(([k, v]) => {
      if (SENSITIVE.test(k) && typeof v === "string") {
        const s = v as string;
        return [k, s.length > 6 ? s.slice(0, 3) + "••••" + s.slice(-2) : "••••••"];
      }
      if (typeof v === "string" && v.length > 200) {
        return [k, v.slice(0, 100) + "…[truncated]"];
      }
      return [k, v];
    })
  );
}

export abstract class RealMcpBase {
  abstract readonly integrationId: string;
  abstract readonly tools: RealMcpToolDef[];

  abstract handleTool(
    toolName: string,
    args: Record<string, unknown>,
    credentials: Record<string, string>,
    orgId: string
  ): Promise<McpToolResult>;

  // ── Credential retrieval ──────────────────────────────────────────────────

  // Resolution order, most specific first:
  //   1. per-agent credential (agent_integration_credentials) when agentId is given
  //   2. the connection this tool is pinned to, when connectionId is given
  //   3. the org's default connection for the integration type
  //
  // The per-agent credential deliberately still outranks the pin. Every
  // mcp_servers row written since connect populates connection_id, so letting
  // the pin win would silently switch off per-agent identity for every org that
  // already uses it -- and that table is keyed by (agentId, integrationId), so
  // it has no notion of which connection it belongs to anyway.
  async getCredentials(orgId: string, agentId?: string, connectionId?: string): Promise<Record<string, string> | null> {
    if (agentId) {
      const agentConn = await storage.getAgentIntegrationCredential(agentId, this.integrationId);
      if (agentConn && agentConn.credentialBlob && agentConn.status !== "disconnected") {
        try {
          return decryptCredentialMap(agentConn.credentialBlob);
        } catch {
          // Fall through to the org-level connection on a decrypt failure.
        }
      }
    }
    const conn = connectionId
      ? await storage.getIntegrationConnectionById(orgId, connectionId)
      : await storage.getIntegrationConnection(orgId, this.integrationId);
    // A pinned connection that is missing, cross-tenant, or of a different
    // integration type resolves to nothing -- it must NOT fall back to the org
    // default. Falling back would run the call against a different database than
    // the one the tool was bound to, which is worse than failing the call.
    if (connectionId && conn && conn.integrationId !== this.integrationId) return null;
    if (!conn || !conn.credentialBlob || conn.status === "disconnected") return null;
    try {
      return decryptCredentialMap(conn.credentialBlob);
    } catch {
      return null;
    }
  }

  // ── Refresh OAuth access token using stored refresh_token ─────────────────

  async refreshOAuthToken(orgId: string, connectionId?: string): Promise<Record<string, string> | null> {
    const { getIntegrationDef } = await import("./integrations/registry");
    const def = getIntegrationDef(this.integrationId);
    if (!def?.oauthConfig) return null;

    const credentials = await this.getCredentials(orgId, undefined, connectionId);
    if (!credentials?.refresh_token) return null;

    try {
      const { resolveOAuthApp, withTenant } = await import("./integrations/oauth-app");
      const oauthApp = await resolveOAuthApp(orgId, this.integrationId);
      const res = await fetch(withTenant(def.oauthConfig.tokenUrl, oauthApp.tenantId), {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: credentials.refresh_token,
          client_id: oauthApp.clientId,
          client_secret: oauthApp.clientSecret,
        }).toString(),
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) return null;
      const data = await res.json() as any;
      if (data.error) return null;

      const { encryptCredentialMap } = await import("./credential-vault");
      const updated: Record<string, string> = {
        ...credentials,
        access_token: data.access_token ?? credentials.access_token,
        refresh_token: data.refresh_token ?? credentials.refresh_token,
        token_type: data.token_type ?? "Bearer",
      };
      const credentialBlob = encryptCredentialMap(updated);
      const expiresAt = data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null;

      const conn = connectionId
        ? await storage.getIntegrationConnectionById(orgId, connectionId)
        : await storage.getIntegrationConnection(orgId, this.integrationId);
      // Write back by id. Spreading the row through the type-level upsert would
      // re-resolve to the org's DEFAULT connection and stamp the refreshed token
      // onto it -- corrupting a sibling connection's credentials whenever a
      // non-default connection refreshed.
      if (conn) {
        await storage.upsertIntegrationConnection({
          ...conn,
          credentialBlob,
          tokenExpiresAt: expiresAt ?? conn.tokenExpiresAt,
        }, conn.id);
      }
      return updated;
    } catch {
      return null;
    }
  }

  // ── Primary tool dispatch with error handling and audit ───────────────────

  async callTool(
    toolName: string,
    args: Record<string, unknown>,
    orgId: string,
    agentId?: string,
    connectionId?: string
  ): Promise<McpToolResult> {
    const credentials = await this.getCredentials(orgId, agentId, connectionId);
    if (!credentials) {
      // Distinguish the two failures: a pinned connection that resolves to
      // nothing is a broken binding (deleted or disconnected instance), not an
      // integration the org never connected -- and the fixes differ.
      return this.err(connectionId
        ? `Integration '${this.integrationId}' has no usable connection '${connectionId}' for this organization -- the connection may have been deleted, disconnected, or bound to a different integration.`
        : `Integration '${this.integrationId}' is not connected for this organization.`);
    }

    const startMs = Date.now();
    let result: McpToolResult;
    try {
      // A tool the connector does not define itself may be a custom API tool
      // an admin added from the UI for this org (integrations/custom-rest.ts).
      const custom = this.tools.some((t) => t.name === toolName)
        ? null
        : await this.loadCustomTool(orgId, toolName);
      result = custom
        ? await this.runCustomTool(custom, args, credentials, orgId)
        : await this.handleTool(toolName, args, credentials, orgId);
    } catch (err: any) {
      result = this.err(`Tool '${toolName}' failed: ${err?.message ?? "Unknown error"}`);
    }

    const latencyMs = Date.now() - startMs;

    // Emit enriched audit event: masked args, latency, outcome, integration/tool IDs, org
    const maskedArgs = maskAuditArgs(args);
    storage.createAuditEvent({
      actorType: "agent",
      action: result.isError ? "integration_tool_error" : "integration_tool_call",
      objectType: "integration",
      objectId: `${this.integrationId}:${toolName}`,
      details: JSON.stringify({
        toolName,
        integrationId: this.integrationId,
        maskedArgs,
        latencyMs,
        outcome: result.isError ? "error" : "success",
      }),
      organizationId: orgId,
    }).catch(() => {});

    return result;
  }

  // ── Custom API tools (admin-defined, per organization) ────────────────────

  private async loadCustomTool(orgId: string, toolName: string) {
    const { readDef } = await import("./integrations/custom-rest");
    const server = await storage.getCustomToolsServer(orgId, this.integrationId);
    if (!server) return null;
    const tool = (await storage.getMcpServerTools(server.id)).find((t) => t.name === toolName && t.enabled);
    const def = tool ? readDef(tool.annotations) : null;
    return def ? { def } : null;
  }

  private async runCustomTool(
    custom: { def: import("./integrations/custom-rest").CustomRestDef },
    args: Record<string, unknown>,
    credentials: Record<string, string>,
    orgId: string,
  ): Promise<McpToolResult> {
    const { getIntegrationDef } = await import("./integrations/registry");
    const { runCustomRest } = await import("./integrations/custom-rest");
    const apiBaseUrl = getIntegrationDef(this.integrationId)?.apiBaseUrl;
    if (!apiBaseUrl) return this.err(`Integration '${this.integrationId}' does not support custom API tools.`);
    const token = credentials.access_token ?? credentials.token;
    if (!token) return this.err(`Integration '${this.integrationId}' has no access token. Reconnect it in Integrations.`);
    const out = await runCustomRest(custom.def, args, apiBaseUrl, (url, init) =>
      this.fetchWithAuth(url, { ...init, bearerToken: token, orgId }),
    );
    return out.ok ? this.ok(out.text) : this.err(out.text);
  }

  // ── Response helpers ──────────────────────────────────────────────────────

  protected ok(data: unknown): McpToolResult {
    return {
      content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }],
    };
  }

  protected err(message: string): McpToolResult {
    return { content: [{ type: "text", text: message }], isError: true };
  }

  // ── HTTP helper with retry, timeout, 401-refresh, rate-limit backoff ──────

  protected async fetchWithAuth(
    url: string,
    options: RequestInit & {
      bearerToken?: string;
      basicAuth?: { username: string; password: string };
      orgId?: string;
      timeoutMs?: number;
    }
  ): Promise<Response> {
    const { bearerToken, basicAuth, orgId, timeoutMs = DEFAULT_TIMEOUT_MS, ...rest } = options;

    const buildHeaders = (token?: string): Record<string, string> => {
      const h: Record<string, string> = {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(rest.headers as Record<string, string> | undefined),
      };
      const effectiveToken = token ?? bearerToken;
      if (effectiveToken) {
        h["Authorization"] = `Bearer ${effectiveToken}`;
      } else if (basicAuth) {
        const encoded = Buffer.from(`${basicAuth.username}:${basicAuth.password}`).toString("base64");
        h["Authorization"] = `Basic ${encoded}`;
      }
      return h;
    };

    let currentToken = bearerToken;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const res = await fetch(url, {
          ...rest,
          headers: buildHeaders(currentToken),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        // 401 → try token refresh once then retry
        if (res.status === 401 && attempt === 0 && orgId) {
          const refreshed = await this.refreshOAuthToken(orgId);
          if (refreshed?.access_token) {
            currentToken = refreshed.access_token;
            continue;
          }
          return res;
        }

        // 429 → respect Retry-After header, then retry
        if (res.status === 429 && attempt < MAX_RETRIES - 1) {
          const retryAfter = parseInt(res.headers.get("Retry-After") ?? "0", 10);
          const waitMs = retryAfter > 0 ? retryAfter * 1000 : RETRY_BASE_MS * Math.pow(2, attempt);
          await sleep(Math.min(waitMs, 30_000));
          continue;
        }

        // 5xx transient errors → exponential backoff
        if (res.status >= 500 && attempt < MAX_RETRIES - 1) {
          await sleep(RETRY_BASE_MS * Math.pow(2, attempt));
          continue;
        }

        return res;
      } catch (err: any) {
        clearTimeout(timeoutId);
        const isAbort = err?.name === "AbortError";
        if (!isAbort && attempt < MAX_RETRIES - 1) {
          await sleep(RETRY_BASE_MS * Math.pow(2, attempt));
          continue;
        }
        if (isAbort) throw new Error(`Request to ${url} timed out after ${timeoutMs}ms`);
        throw err;
      }
    }

    throw new Error(`All ${MAX_RETRIES} attempts to ${url} failed`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
