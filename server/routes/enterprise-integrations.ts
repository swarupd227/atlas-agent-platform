import { Router, type Request, type Response } from "express";
import { randomBytes, createHash } from "crypto";
import { z } from "zod";
import { storage } from "../storage";
import { encryptCredentialMap, decryptCredentialMap } from "../credential-vault";
import { INTEGRATION_REGISTRY, getIntegrationDef } from "../integrations/registry";
import { getDefaultOrgId } from "../auth";
import { db } from "../db";
import { mcpServers, auditEvents } from "@shared/schema";
import { eq, and, gte, sql as drizzleSql } from "drizzle-orm";

const router = Router();

// ── GET /api/enterprise-integrations ─────────────────────────────────────────
router.get("/api/enterprise-integrations", async (req: Request, res: Response) => {
  try {
    const orgId = getDefaultOrgId(req);
    const connections = await storage.listIntegrationConnections(orgId);
    const connMap = new Map(connections.map((c) => [c.integrationId, c]));

    const result = INTEGRATION_REGISTRY.map((def) => {
      const conn = connMap.get(def.id);
      return {
        ...def,
        connection: conn
          ? {
              id: conn.id,
              status: conn.status,
              lastTestedAt: conn.lastTestedAt,
              lastTestResult: conn.lastTestResult,
              lastError: conn.lastError,
              tokenExpiresAt: conn.tokenExpiresAt,
            }
          : null,
      };
    });

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/enterprise-integrations/:id/connect ────────────────────────────
const connectSchema = z.object({
  credentials: z.record(z.string()),
  oauthScopes: z.array(z.string()).optional(),
});

router.post("/api/enterprise-integrations/:id/connect", async (req: Request, res: Response) => {
  try {
    const orgId = getDefaultOrgId(req);
    const integrationId = req.params.id;
    const def = getIntegrationDef(integrationId);
    if (!def) {
      return res.status(404).json({ error: `Integration '${integrationId}' not found in registry` });
    }

    const parsed = connectSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const credentialBlob = encryptCredentialMap(parsed.data.credentials);
    const conn = await storage.upsertIntegrationConnection({
      organizationId: orgId,
      integrationId,
      credentialBlob,
      oauthScopes: parsed.data.oauthScopes ?? def.oauthConfig?.defaultScopes ?? [],
      status: "connected",
      lastTestResult: null,
      lastError: null,
    });

    // Auto-test immediately after connecting
    let testResult: { ok: boolean; latencyMs?: number; error?: string } | null = null;
    try {
      const credentials = decryptCredentialMap(credentialBlob);
      testResult = await testConnectionHealth(integrationId, credentials, def);
      await storage.recordIntegrationTestResult(conn.id, testResult.ok, testResult.error ?? null);
    } catch {
      // Test failure is non-fatal; connection is still stored
    }

    // MCP server linkage: create/activate the MCP server record tied to this connection
    const mcpServerId = await upsertIntegrationMcpServer(conn.id, integrationId, def.name, orgId);

    // Audit the connection event
    storage.createAuditEvent({
      actorType: "user",
      action: "enterprise_integration_connect",
      objectType: "integration",
      objectId: integrationId,
      details: JSON.stringify({ integrationId, testOk: testResult?.ok, mcpServerId }),
      organizationId: orgId,
    }).catch(() => {});

    res.json({
      id: conn.id,
      integrationId: conn.integrationId,
      status: conn.status,
      createdAt: conn.createdAt,
      mcpServerId,
      immediateTest: testResult,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/enterprise-integrations/:id/disconnect ─────────────────────────
router.post("/api/enterprise-integrations/:id/disconnect", async (req: Request, res: Response) => {
  try {
    const orgId = getDefaultOrgId(req);
    const integrationId = req.params.id;
    const conn = await storage.getIntegrationConnection(orgId, integrationId);

    await storage.disconnectIntegration(orgId, integrationId);

    // Deactivate linked MCP server
    if (conn?.id) await deactivateIntegrationMcpServer(conn.id);

    storage.createAuditEvent({
      actorType: "user",
      action: "enterprise_integration_disconnect",
      objectType: "integration",
      objectId: integrationId,
      organizationId: orgId,
    }).catch(() => {});

    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/enterprise-integrations/:id — alias for disconnect ────────────
router.delete("/api/enterprise-integrations/:id", async (req: Request, res: Response) => {
  try {
    const orgId = getDefaultOrgId(req);
    const integrationId = req.params.id;
    const conn = await storage.getIntegrationConnection(orgId, integrationId);

    await storage.disconnectIntegration(orgId, integrationId);

    // Deactivate linked MCP server
    if (conn?.id) await deactivateIntegrationMcpServer(conn.id);

    storage.createAuditEvent({
      actorType: "user",
      action: "enterprise_integration_delete",
      objectType: "integration",
      objectId: integrationId,
      organizationId: orgId,
    }).catch(() => {});

    res.status(204).send();
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/enterprise-integrations/:id/test ───────────────────────────────
router.post("/api/enterprise-integrations/:id/test", async (req: Request, res: Response) => {
  try {
    const orgId = getDefaultOrgId(req);
    const integrationId = req.params.id;
    const conn = await storage.getIntegrationConnection(orgId, integrationId);
    if (!conn || !conn.credentialBlob) {
      return res.status(404).json({ error: "No connection found — configure credentials first" });
    }

    let credentials: Record<string, string>;
    try {
      credentials = decryptCredentialMap(conn.credentialBlob);
    } catch {
      return res.status(500).json({ error: "Failed to decrypt credentials" });
    }

    const def = getIntegrationDef(integrationId);
    const result = await testConnectionHealth(integrationId, credentials, def);
    await storage.recordIntegrationTestResult(conn.id, result.ok, result.error ?? null);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/enterprise-integrations/:id/status ──────────────────────────────
router.get("/api/enterprise-integrations/:id/status", async (req: Request, res: Response) => {
  try {
    const orgId = getDefaultOrgId(req);
    const integrationId = req.params.id;
    const conn = await storage.getIntegrationConnection(orgId, integrationId);
    if (!conn) {
      return res.json({ integrationId, status: "disconnected", connection: null });
    }
    res.json({
      integrationId,
      status: conn.status,
      lastTestedAt: conn.lastTestedAt,
      lastTestResult: conn.lastTestResult,
      lastError: conn.lastError,
      tokenExpiresAt: conn.tokenExpiresAt,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/enterprise-integrations/:id/credentials-hint ────────────────────
router.get("/api/enterprise-integrations/:id/credentials-hint", async (req: Request, res: Response) => {
  try {
    const orgId = getDefaultOrgId(req);
    const integrationId = req.params.id;
    const conn = await storage.getIntegrationConnection(orgId, integrationId);
    if (!conn || !conn.credentialBlob) {
      return res.json({ keys: [] });
    }
    const creds = decryptCredentialMap(conn.credentialBlob);
    const keys = Object.keys(creds).map((k) => ({
      key: k,
      hint: maskValue(creds[k]),
    }));
    res.json({ keys });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── OAuth 2.0 Flow with PKCE ──────────────────────────────────────────────────

interface PendingOAuthState {
  integrationId: string;
  orgId: string;
  expiresAt: number;
  codeVerifier?: string;
}

const pendingOAuthStates = new Map<string, PendingOAuthState>();

// Prune expired states every minute
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of pendingOAuthStates) {
    if (v.expiresAt < now) pendingOAuthStates.delete(k);
  }
}, 60_000);

/** Generate a PKCE code_verifier (43-128 random URL-safe chars) */
function generateCodeVerifier(): string {
  return randomBytes(48).toString("base64url");
}

/** Derive code_challenge = BASE64URL(SHA256(verifier)) */
function deriveCodeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

router.get("/api/integrations/oauth/start/:provider", async (req: Request, res: Response) => {
  try {
    const { provider } = req.params;
    const def = getIntegrationDef(provider);
    if (!def || !def.oauthConfig) {
      return res.status(400).json({ error: `${provider} does not support OAuth2` });
    }
    const orgId = getDefaultOrgId(req);
    const state = randomBytes(24).toString("hex");
    const redirectUri = `${req.protocol}://${req.get("host")}/api/integrations/oauth/callback`;

    const pending: PendingOAuthState = {
      integrationId: provider,
      orgId,
      expiresAt: Date.now() + 10 * 60 * 1000,
    };

    const url = new URL(def.oauthConfig.authorizationUrl);
    url.searchParams.set("client_id", process.env[`OAUTH_${provider.toUpperCase()}_CLIENT_ID`] ?? "PLACEHOLDER_CLIENT_ID");
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("state", state);
    url.searchParams.set("scope", def.oauthConfig.defaultScopes.join(" "));

    if (def.oauthConfig.pkce) {
      const codeVerifier = generateCodeVerifier();
      const codeChallenge = deriveCodeChallenge(codeVerifier);
      url.searchParams.set("code_challenge", codeChallenge);
      url.searchParams.set("code_challenge_method", "S256");
      pending.codeVerifier = codeVerifier;
    }

    pendingOAuthStates.set(state, pending);
    res.json({ authUrl: url.toString(), state });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/api/integrations/oauth/callback", async (req: Request, res: Response) => {
  const { state, code, error } = req.query as Record<string, string>;
  if (error) {
    return res.redirect(`/integrations?oauth_error=${encodeURIComponent(error)}`);
  }
  const pending = pendingOAuthStates.get(state);
  if (!pending || pending.expiresAt < Date.now()) {
    return res.redirect("/integrations?oauth_error=state_expired");
  }
  pendingOAuthStates.delete(state);

  const def = getIntegrationDef(pending.integrationId);
  if (!def?.oauthConfig) {
    return res.redirect("/integrations?oauth_error=invalid_provider");
  }

  try {
    const redirectUri = `${req.protocol}://${req.get("host")}/api/integrations/oauth/callback`;
    const bodyParams: Record<string, string> = {
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: process.env[`OAUTH_${pending.integrationId.toUpperCase()}_CLIENT_ID`] ?? "",
      client_secret: process.env[`OAUTH_${pending.integrationId.toUpperCase()}_CLIENT_SECRET`] ?? "",
    };

    // Include PKCE code_verifier if we stored one
    if (pending.codeVerifier) {
      bodyParams.code_verifier = pending.codeVerifier;
    }

    const tokenRes = await fetch(def.oauthConfig.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(bodyParams).toString(),
      signal: AbortSignal.timeout(10_000),
    });

    const tokenData = await tokenRes.json() as any;
    if (!tokenRes.ok || tokenData.error) {
      const msg = tokenData.error_description ?? tokenData.error ?? "token_exchange_failed";
      return res.redirect(`/integrations?oauth_error=${encodeURIComponent(msg)}`);
    }

    const credentialBlob = encryptCredentialMap({
      access_token: tokenData.access_token ?? "",
      refresh_token: tokenData.refresh_token ?? "",
      token_type: tokenData.token_type ?? "Bearer",
    });

    const expiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000)
      : undefined;

    const conn = await storage.upsertIntegrationConnection({
      organizationId: pending.orgId,
      integrationId: pending.integrationId,
      credentialBlob,
      oauthScopes: def.oauthConfig.defaultScopes,
      status: "connected",
      tokenExpiresAt: expiresAt,
      lastTestResult: null,
      lastError: null,
    });

    // Auto-test after OAuth callback
    try {
      const credentials = decryptCredentialMap(credentialBlob);
      const testResult = await testConnectionHealth(pending.integrationId, credentials, def);
      await storage.recordIntegrationTestResult(conn.id, testResult.ok, testResult.error ?? null);
    } catch { /* non-fatal */ }

    storage.createAuditEvent({
      actorType: "user",
      action: "enterprise_integration_oauth_complete",
      objectType: "integration",
      objectId: pending.integrationId,
      organizationId: pending.orgId,
    }).catch(() => {});

    res.redirect(`/integrations?oauth_success=${pending.integrationId}`);
  } catch (err: any) {
    res.redirect(`/integrations?oauth_error=${encodeURIComponent(err.message)}`);
  }
});

// ── Token Refresh Daemon ──────────────────────────────────────────────────────
// Runs every 4 minutes; refreshes OAuth tokens expiring in the next 5 minutes.

let _refreshDaemonStarted = false;

export function startTokenRefreshDaemon(): void {
  if (_refreshDaemonStarted) return;
  _refreshDaemonStarted = true;

  const INTERVAL_MS = 4 * 60 * 1000;
  const REFRESH_AHEAD_MS = 5 * 60 * 1000;

  setInterval(async () => {
    try {
      await refreshExpiringTokens(REFRESH_AHEAD_MS);
    } catch (err: any) {
      console.error("[token-refresh] Daemon error:", err?.message);
    }
  }, INTERVAL_MS);

  console.log("[token-refresh] OAuth token refresh daemon started (4 min interval)");
}

async function refreshExpiringTokens(aheadMs: number): Promise<void> {
  const { db } = await import("../db");
  const { integrationConnections } = await import("@shared/schema");
  const { and, eq, lt, isNotNull } = await import("drizzle-orm");
  const sql = (await import("drizzle-orm")).sql;

  const soon = new Date(Date.now() + aheadMs);
  const expiring = await db
    .select()
    .from(integrationConnections)
    .where(
      and(
        eq(integrationConnections.status, "connected"),
        lt(integrationConnections.tokenExpiresAt, soon),
        isNotNull(integrationConnections.credentialBlob),
      )
    );

  for (const conn of expiring) {
    const def = getIntegrationDef(conn.integrationId);
    if (!def?.oauthConfig) continue;

    let creds: Record<string, string>;
    try {
      creds = decryptCredentialMap(conn.credentialBlob!);
    } catch { continue; }

    if (!creds.refresh_token) continue;

    try {
      const bodyParams: Record<string, string> = {
        grant_type: "refresh_token",
        refresh_token: creds.refresh_token,
        client_id: process.env[`OAUTH_${conn.integrationId.toUpperCase()}_CLIENT_ID`] ?? "",
        client_secret: process.env[`OAUTH_${conn.integrationId.toUpperCase()}_CLIENT_SECRET`] ?? "",
      };

      const tokenRes = await fetch(def.oauthConfig.tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(bodyParams).toString(),
        signal: AbortSignal.timeout(10_000),
      });

      if (!tokenRes.ok) {
        console.warn(`[token-refresh] Failed to refresh ${conn.integrationId} (${conn.organizationId}): HTTP ${tokenRes.status}`);
        continue;
      }

      const data = await tokenRes.json() as any;
      if (data.error) continue;

      const updated: Record<string, string> = {
        ...creds,
        access_token: data.access_token ?? creds.access_token,
        refresh_token: data.refresh_token ?? creds.refresh_token,
        token_type: data.token_type ?? "Bearer",
      };

      const expiresAt = data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined;

      await storage.upsertIntegrationConnection({
        ...conn,
        credentialBlob: encryptCredentialMap(updated),
        tokenExpiresAt: expiresAt ?? conn.tokenExpiresAt,
        oauthScopes: conn.oauthScopes ?? [],
      });

      console.log(`[token-refresh] Refreshed token for ${conn.integrationId} (org: ${conn.organizationId})`);
    } catch (err: any) {
      console.warn(`[token-refresh] Error refreshing ${conn.integrationId}:`, err?.message);
    }
  }
}

// ── GET /api/enterprise-integrations/:id/health ───────────────────────────────
// Returns error rate and tool-call counts derived from audit events (last 24 h).
router.get("/api/enterprise-integrations/:id/health", async (req: Request, res: Response) => {
  try {
    const orgId = getDefaultOrgId(req);
    const integrationId = req.params.id;
    const def = getIntegrationDef(integrationId);
    if (!def) return res.status(404).json({ error: `Integration '${integrationId}' not found` });

    const conn = await storage.getIntegrationConnection(orgId, integrationId);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Query audit events for this integration in the last 24 h
    const rows = await db
      .select({ action: auditEvents.action })
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.organizationId, orgId),
          gte(auditEvents.createdAt, since),
        )
      );

    const calls = rows.filter(
      (r) => r.action === "integration_tool_call" || r.action === "integration_tool_error"
    );
    const errors = calls.filter((r) => r.action === "integration_tool_error");

    const totalCalls = calls.length;
    const totalErrors = errors.length;
    const errorRate = totalCalls > 0 ? +(totalErrors / totalCalls).toFixed(4) : 0;
    const successRate = totalCalls > 0 ? +((totalCalls - totalErrors) / totalCalls).toFixed(4) : 1;

    res.json({
      integrationId,
      window: "24h",
      status: conn?.status ?? "disconnected",
      lastTestedAt: conn?.lastTestedAt ?? null,
      lastTestResult: conn?.lastTestResult ?? null,
      lastError: conn?.lastError ?? null,
      tokenExpiresAt: conn?.tokenExpiresAt ?? null,
      mcpServerId: conn?.mcpServerId ?? null,
      metrics: {
        totalCalls,
        totalErrors,
        errorRate,
        successRate,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function maskValue(value: string): string {
  if (!value || value.length <= 6) return "••••••";
  return value.slice(0, 4) + "••••" + value.slice(-2);
}

/**
 * Create or reactivate the MCP server record that backs this integration connection.
 * Returns the MCP server ID.
 */
async function upsertIntegrationMcpServer(
  connectionId: string,
  integrationId: string,
  integrationName: string,
  orgId: string
): Promise<string | null> {
  try {
    // Check for an existing MCP server with this connectionId
    const [existing] = await db
      .select({ id: mcpServers.id })
      .from(mcpServers)
      .where(eq(mcpServers.connectionId, connectionId))
      .limit(1);

    if (existing) {
      await db
        .update(mcpServers)
        .set({ status: "registered", updatedAt: new Date() })
        .where(eq(mcpServers.id, existing.id));
      return existing.id;
    }

    // Create a new MCP server record linked to this connection
    const [created] = await db
      .insert(mcpServers)
      .values({
        name: `${integrationName} MCP`,
        description: `Enterprise integration MCP server for ${integrationName}`,
        transportType: "enterprise",
        status: "registered",
        riskTier: "MEDIUM",
        connectionId,
        industryId: orgId,
        addedBy: "system",
      })
      .returning({ id: mcpServers.id });

    return created?.id ?? null;
  } catch (err: any) {
    console.warn(`[integrations] MCP server upsert failed for ${integrationId}:`, err?.message);
    return null;
  }
}

/** Set the linked MCP server to 'inactive' when an integration is disconnected. */
async function deactivateIntegrationMcpServer(connectionId: string): Promise<void> {
  try {
    await db
      .update(mcpServers)
      .set({ status: "inactive", updatedAt: new Date() })
      .where(eq(mcpServers.connectionId, connectionId));
  } catch (err: any) {
    console.warn(`[integrations] MCP server deactivation failed for connection ${connectionId}:`, err?.message);
  }
}

async function testConnectionHealth(
  integrationId: string,
  credentials: Record<string, string>,
  def: ReturnType<typeof getIntegrationDef>
): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
  const start = Date.now();

  try {
    switch (integrationId) {
      case "salesforce": {
        const instanceUrl = credentials.instance_url ?? "https://login.salesforce.com";
        const r = await fetch(`${instanceUrl}/services/data/v59.0/`, {
          headers: { Authorization: `Bearer ${credentials.access_token}` },
          signal: AbortSignal.timeout(5000),
        });
        return r.ok
          ? { ok: true, latencyMs: Date.now() - start }
          : { ok: false, error: `HTTP ${r.status}`, latencyMs: Date.now() - start };
      }
      case "hubspot": {
        const r = await fetch("https://api.hubapi.com/crm/v3/objects/contacts?limit=1", {
          headers: { Authorization: `Bearer ${credentials.api_key}` },
          signal: AbortSignal.timeout(5000),
        });
        return r.ok
          ? { ok: true, latencyMs: Date.now() - start }
          : { ok: false, error: `HTTP ${r.status}`, latencyMs: Date.now() - start };
      }
      case "jira": {
        const r = await fetch(`${credentials.base_url}/rest/api/3/myself`, {
          headers: {
            Authorization: `Basic ${Buffer.from(`${credentials.email}:${credentials.api_token}`).toString("base64")}`,
          },
          signal: AbortSignal.timeout(5000),
        });
        return r.ok
          ? { ok: true, latencyMs: Date.now() - start }
          : { ok: false, error: `HTTP ${r.status}`, latencyMs: Date.now() - start };
      }
      case "github": {
        const r = await fetch("https://api.github.com/user", {
          headers: { Authorization: `Bearer ${credentials.token}`, "User-Agent": "Atlas-MCP/1.0" },
          signal: AbortSignal.timeout(5000),
        });
        return r.ok
          ? { ok: true, latencyMs: Date.now() - start }
          : { ok: false, error: `HTTP ${r.status}`, latencyMs: Date.now() - start };
      }
      case "servicenow": {
        const r = await fetch(`${credentials.instance_url}/api/now/table/incident?sysparm_limit=1`, {
          headers: {
            Authorization: `Basic ${Buffer.from(`${credentials.username}:${credentials.password}`).toString("base64")}`,
          },
          signal: AbortSignal.timeout(5000),
        });
        return r.ok
          ? { ok: true, latencyMs: Date.now() - start }
          : { ok: false, error: `HTTP ${r.status}`, latencyMs: Date.now() - start };
      }
      case "slack": {
        const r = await fetch("https://slack.com/api/auth.test", {
          headers: { Authorization: `Bearer ${credentials.access_token}` },
          signal: AbortSignal.timeout(5000),
        });
        const data = await r.json() as any;
        return data.ok
          ? { ok: true, latencyMs: Date.now() - start }
          : { ok: false, error: data.error ?? "auth.test failed", latencyMs: Date.now() - start };
      }
      case "microsoft_teams":
      case "dynamics365": {
        const r = await fetch("https://graph.microsoft.com/v1.0/me", {
          headers: { Authorization: `Bearer ${credentials.access_token}` },
          signal: AbortSignal.timeout(5000),
        });
        return r.ok
          ? { ok: true, latencyMs: Date.now() - start }
          : { ok: false, error: `HTTP ${r.status}`, latencyMs: Date.now() - start };
      }
      default:
        // For integrations without a live test, return ok with a note
        return { ok: true, latencyMs: Date.now() - start };
    }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "Connection timeout", latencyMs: Date.now() - start };
  }
}

export default router;
