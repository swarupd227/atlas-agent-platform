import { Router, type Request, type Response } from "express";
import { randomBytes, createHash } from "crypto";
import { z } from "zod";
import { storage } from "../storage";
import { encryptCredentialMap, decryptCredentialMap } from "../credential-vault";
import { INTEGRATION_REGISTRY, getIntegrationDef } from "../integrations/registry";
import { callN8nWorkflow } from "../integrations/n8n";
import { getDefaultOrgId } from "../auth";
import { db } from "../db";
import { mcpServers, auditEvents, integrationConnections } from "@shared/schema";
import { eq, and, gte, like, isNull } from "drizzle-orm";

const router = Router();

// ── GET /api/enterprise-integrations ─────────────────────────────────────────
router.get("/api/enterprise-integrations", async (req: Request, res: Response) => {
  try {
    const orgId = getDefaultOrgId(req);
    const connections = await storage.listIntegrationConnections(orgId);

    // Group rather than collapse. Keying a Map by integrationId silently dropped
    // every sibling but the last, so an org with two PostgreSQL connections
    // could only ever see one of them here.
    const connsByType = new Map<string, typeof connections>();
    for (const c of connections) {
      const list = connsByType.get(c.integrationId);
      if (list) list.push(c);
      else connsByType.set(c.integrationId, [c]);
    }

    const shape = (c: (typeof connections)[number]) => ({
      id: c.id,
      name: c.name,
      isDefault: c.isDefault,
      status: c.status,
      lastTestedAt: c.lastTestedAt,
      lastTestResult: c.lastTestResult,
      lastError: c.lastError,
      tokenExpiresAt: c.tokenExpiresAt,
    });

    const result = INTEGRATION_REGISTRY.map((def) => {
      const conns = (connsByType.get(def.id) ?? [])
        .slice()
        .sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
      return {
        ...def,
        // `connection` stays the DEFAULT connection so existing callers keep
        // working unchanged; `connections` is the full list for the
        // multi-connection UI.
        connection: conns.length ? shape(conns[0]) : null,
        connections: conns.map(shape),
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
  /** Instance label, e.g. "Sales DB". Distinguishes sibling connections. */
  name: z.string().trim().min(1).max(120).optional(),
  /** Update this specific connection (re-auth of a known instance). */
  connectionId: z.string().optional(),
  /**
   * Add a NEW connection alongside any existing ones of this type. Opt-in on
   * purpose: the default remains "upsert the org's default connection", because
   * the existing UI calls this route to re-authenticate, and silently creating
   * a duplicate every time someone fixed their credentials would be worse than
   * the multi-connection gap it closes.
   */
  createNew: z.boolean().optional(),
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

    const connectionData = {
      organizationId: orgId,
      integrationId,
      name: parsed.data.name,
      credentialBlob,
      oauthScopes: parsed.data.oauthScopes ?? def.oauthConfig?.defaultScopes ?? [],
      status: "connected",
      lastTestResult: null,
      lastError: null,
    };

    // `createNew` always inserts a sibling; anything else keeps the historical
    // behaviour of upserting the org's default connection for this type.
    const conn = parsed.data.createNew
      ? await storage.createIntegrationConnection(connectionData)
      : await storage.upsertIntegrationConnection(connectionData, parsed.data.connectionId);

    // Auto-test immediately after connecting
    let testResult: { ok: boolean; status?: string; latencyMs?: number; error?: string } | null = null;
    try {
      const credentials = decryptCredentialMap(credentialBlob);
      testResult = await testConnectionHealth(integrationId, credentials, def);
      // Only persist test result for verifiable connectors — not_verifiable should not mark as error
      if ((testResult as any).status !== "not_verifiable") {
        await storage.recordIntegrationTestResult(conn.id, testResult.ok, testResult.error ?? null);
      }
    } catch {
      // Test failure is non-fatal; connection is still stored
    }

    // MCP server linkage: create/activate the MCP server record tied to this connection
    const mcpServerId = await upsertIntegrationMcpServer(conn.id, integrationId, def.name, orgId, conn.name);

    // Persist mcpServerId back onto the connection row
    if (mcpServerId) {
      await db.update(integrationConnections).set({ mcpServerId, updatedAt: new Date() })
        .where(eq(integrationConnections.id, conn.id));
    }

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
      name: conn.name,
      isDefault: conn.isDefault,
      status: conn.status,
      createdAt: conn.createdAt,
      mcpServerId,
      immediateTest: testResult,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Per-connection management (multi-connection phase 3) ─────────────────────
// These address one connection by id, unlike the type-level routes above which
// act on whichever connection is the org's default for that integration.

// GET /api/enterprise-integrations/:id/connections — every connection of a type
router.get("/api/enterprise-integrations/:id/connections", async (req: Request, res: Response) => {
  try {
    const orgId = getDefaultOrgId(req);
    const conns = await storage.listIntegrationConnectionsByType(orgId, req.params.id);
    res.json(conns.map((c) => ({
      id: c.id,
      integrationId: c.integrationId,
      name: c.name,
      isDefault: c.isDefault,
      status: c.status,
      lastTestedAt: c.lastTestedAt,
      lastTestResult: c.lastTestResult,
      lastError: c.lastError,
      tokenExpiresAt: c.tokenExpiresAt,
      mcpServerId: c.mcpServerId,
      createdAt: c.createdAt,
    })));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

const renameSchema = z.object({ name: z.string().trim().min(1).max(120) });

// PATCH /api/enterprise-integrations/connections/:connectionId — rename
router.patch("/api/enterprise-integrations/connections/:connectionId", async (req: Request, res: Response) => {
  try {
    const orgId = getDefaultOrgId(req);
    const parsed = renameSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const row = await storage.renameIntegrationConnection(orgId, req.params.connectionId, parsed.data.name);
    if (!row) return res.status(404).json({ error: "Connection not found" });

    storage.createAuditEvent({
      actorType: "user",
      action: "integration_connection_rename",
      objectType: "integration_connection",
      objectId: row.id,
      details: JSON.stringify({ integrationId: row.integrationId, name: parsed.data.name }),
      organizationId: orgId,
    }).catch(() => {});

    res.json({ id: row.id, name: row.name, isDefault: row.isDefault });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/enterprise-integrations/connections/:connectionId/promote
// Makes this the connection that type-only credential lookups resolve to.
router.post("/api/enterprise-integrations/connections/:connectionId/promote", async (req: Request, res: Response) => {
  try {
    const orgId = getDefaultOrgId(req);
    const row = await storage.promoteIntegrationConnectionToDefault(orgId, req.params.connectionId);
    if (!row) return res.status(404).json({ error: "Connection not found" });

    storage.createAuditEvent({
      actorType: "user",
      action: "integration_connection_promote_default",
      objectType: "integration_connection",
      objectId: row.id,
      details: JSON.stringify({ integrationId: row.integrationId }),
      organizationId: orgId,
    }).catch(() => {});

    res.json({ id: row.id, name: row.name, isDefault: row.isDefault });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/enterprise-integrations/connections/:connectionId/disconnect
// Disconnects ONE connection, leaving its siblings untouched -- unlike the
// type-level disconnect route below.
router.post("/api/enterprise-integrations/connections/:connectionId/disconnect", async (req: Request, res: Response) => {
  try {
    const orgId = getDefaultOrgId(req);
    const connectionId = req.params.connectionId;
    const conn = await storage.getIntegrationConnectionById(orgId, connectionId);
    if (!conn) return res.status(404).json({ error: "Connection not found" });

    await storage.disconnectIntegration(orgId, conn.integrationId, connectionId);
    await deactivateIntegrationMcpServer(connectionId);

    storage.createAuditEvent({
      actorType: "user",
      action: "integration_connection_disconnect",
      objectType: "integration_connection",
      objectId: connectionId,
      details: JSON.stringify({ integrationId: conn.integrationId, wasDefault: conn.isDefault }),
      organizationId: orgId,
    }).catch(() => {});

    // A disconnected row keeps its default flag: promoting a sibling is an
    // explicit choice, and silently moving the flag here would repoint every
    // type-only lookup at a different database as a side effect of a disconnect.
    res.json({ ok: true, wasDefault: conn.isDefault });
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
  /** Salesforce-specific: use test.salesforce.com endpoints when true */
  sandbox?: boolean;
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

    // Salesforce: caller may request sandbox mode via ?sandbox=true query param
    const isSandbox = provider === "salesforce" && req.query.sandbox === "true";

    const pending: PendingOAuthState = {
      integrationId: provider,
      orgId,
      expiresAt: Date.now() + 10 * 60 * 1000,
      ...(isSandbox ? { sandbox: true } : {}),
    };

    // Select the correct authorization base URL (sandbox vs production)
    const authorizationUrl = isSandbox
      ? def.oauthConfig.authorizationUrl.replace("login.salesforce.com", "test.salesforce.com")
      : def.oauthConfig.authorizationUrl;

    const url = new URL(authorizationUrl);
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

    // Salesforce sandbox: use test.salesforce.com for token exchange if sandbox flag is set
    const tokenUrl = pending.sandbox
      ? def.oauthConfig.tokenUrl.replace("login.salesforce.com", "test.salesforce.com")
      : def.oauthConfig.tokenUrl;

    const tokenRes = await fetch(tokenUrl, {
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
      // Salesforce-specific: instance_url is returned in the token response body
      ...(tokenData.instance_url ? { instance_url: tokenData.instance_url } : {}),
      // Salesforce sandbox flag: sourced from pending state set at OAuth start
      ...(pending.sandbox ? { sandbox: "true" } : {}),
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

    // MCP server linkage: create/activate the MCP server record tied to this connection
    const mcpServerId = await upsertIntegrationMcpServer(conn.id, pending.integrationId, def.name, pending.orgId);

    // Persist mcpServerId back onto the connection row
    if (mcpServerId) {
      await db.update(integrationConnections).set({ mcpServerId, updatedAt: new Date() })
        .where(eq(integrationConnections.id, conn.id));
    }

    storage.createAuditEvent({
      actorType: "user",
      action: "enterprise_integration_oauth_complete",
      objectType: "integration",
      objectId: pending.integrationId,
      details: JSON.stringify({ integrationId: pending.integrationId, mcpServerId }),
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

      // Credential rotation is a credential change — audit it (was a blind spot).
      storage.createAuditEvent({
        actorType: "system",
        actorId: "token-refresh",
        action: "credential_rotated",
        objectType: "integration",
        objectId: conn.integrationId,
        organizationId: conn.organizationId,
        details: `OAuth token auto-refreshed for '${conn.integrationId}'${expiresAt ? `, expires ${expiresAt.toISOString()}` : ""}`,
      }).catch(() => {});

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

    // Query audit events for this specific integration in the last 24 h
    // objectId is stored as `${integrationId}:${toolName}` for tool calls
    const rows = await db
      .select({ action: auditEvents.action })
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.organizationId, orgId),
          gte(auditEvents.createdAt, since),
          like(auditEvents.objectId, `${integrationId}:%`),
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
  orgId: string,
  connectionName?: string | null
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

    // Adopt the catalog row this integration already has, rather than inserting
    // a second one. registerEnterpriseIntegrations() seeds exactly one row per
    // integration at <BASE_URL>/api/integrations/<id> and hangs every tool off
    // it. Matching only on connectionId (null before the first connect) meant
    // every first-time connect created a parallel "<Name> MCP" row that carried
    // no tools and no URL — so the catalog showed two rows per integration and
    // the connection pointed at the empty one. Match on the route suffix, which
    // is stable even if the catalog row gets renamed.
    //
    // Only an UNCLAIMED seeded row may be adopted. There is exactly one seeded
    // row per integration type, so once a sibling connection owns it, adopting
    // it again would re-point that row at the new connection -- silently
    // hijacking the first connection's MCP server and its agent bindings. A
    // second connection of the same type gets its own row instead.
    const [seeded] = await db
      .select({ id: mcpServers.id })
      .from(mcpServers)
      .where(and(
        like(mcpServers.url, `%/api/integrations/${integrationId}`),
        isNull(mcpServers.connectionId),
      ))
      .limit(1);

    if (seeded) {
      await db
        .update(mcpServers)
        .set({ connectionId, status: "registered", updatedAt: new Date() })
        .where(eq(mcpServers.id, seeded.id));
      return seeded.id;
    }

    // No seeded catalog row (integration registered without one) — create it.
    const [created] = await db
      .insert(mcpServers)
      .values({
        // Sibling connections each get their own row, so the instance label has
        // to be in the name -- otherwise the catalog shows several
        // indistinguishable "PostgreSQL MCP" entries and there is no way to tell
        // which agent is bound to which database.
        name: connectionName ? `${integrationName} MCP (${connectionName})` : `${integrationName} MCP`,
        description: connectionName
          ? `Enterprise integration MCP server for ${integrationName} — ${connectionName}`
          : `Enterprise integration MCP server for ${integrationName}`,
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
      case "figma": {
        const r = await fetch("https://api.figma.com/v1/me", {
          headers: { "X-Figma-Token": credentials.token },
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
      case "n8n": {
        const baseUrl = credentials.baseUrl?.replace(/\/$/, "") || "";
        if (!baseUrl) return { ok: false, error: "n8n baseUrl not configured", latencyMs: Date.now() - start };
        // n8n exposes /healthz on self-hosted instances; try it first, then fall back to root
        const headers: Record<string, string> = {};
        if (credentials.apiKey) headers["X-N8N-API-KEY"] = credentials.apiKey;
        const r = await fetch(`${baseUrl}/healthz`, { headers, signal: AbortSignal.timeout(5000) });
        if (r.ok || r.status === 404) {
          // 404 on /healthz means n8n is reachable but endpoint doesn't exist on older builds
          return { ok: true, latencyMs: Date.now() - start };
        }
        return { ok: false, error: `HTTP ${r.status}`, latencyMs: Date.now() - start };
      }
      default:
        // Integration not yet implemented — return explicit "not_verifiable" instead of implicit success
        return { ok: true, status: "not_verifiable", latencyMs: Date.now() - start };
    }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "Connection timeout", latencyMs: Date.now() - start };
  }
}

// ── Route aliases: /api/integrations → same handlers ─────────────────────────
// Provides the canonical /api/integrations API contract alongside /api/enterprise-integrations

// GET /api/integrations — list all integrations with per-org connection status (mirrors /api/enterprise-integrations)
router.get("/api/integrations", async (req: Request, res: Response) => {
  try {
    const orgId = getDefaultOrgId(req);
    const connections = await storage.listIntegrationConnections(orgId);
    const connMap = new Map(connections.map((c) => [c.integrationId, c]));
    const result = INTEGRATION_REGISTRY.map((def) => {
      const conn = connMap.get(def.id);
      return {
        ...def,
        connection: conn
          ? { id: conn.id, status: conn.status, lastTestedAt: conn.lastTestedAt,
              lastTestResult: conn.lastTestResult, lastError: conn.lastError,
              tokenExpiresAt: conn.tokenExpiresAt, mcpServerId: conn.mcpServerId }
          : null,
      };
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/api/integrations/:id/status", async (req, res) => {
  req.url = `/api/enterprise-integrations/${req.params.id}/status`;
  const orgId = getDefaultOrgId(req);
  const conn = await storage.getIntegrationConnection(orgId, req.params.id).catch(() => null);
  if (!conn) return res.json({ integrationId: req.params.id, status: "disconnected", connection: null });
  res.json({ integrationId: req.params.id, status: conn.status, lastTestedAt: conn.lastTestedAt,
    lastTestResult: conn.lastTestResult, lastError: conn.lastError, tokenExpiresAt: conn.tokenExpiresAt,
    mcpServerId: conn.mcpServerId });
});

router.get("/api/integrations/:id/health", async (req, res) => {
  req.params.id = req.params.id;
  // Re-use the enterprise health handler logic
  const orgId = getDefaultOrgId(req);
  const integrationId = req.params.id;
  const def = getIntegrationDef(integrationId);
  if (!def) return res.status(404).json({ error: `Integration '${integrationId}' not found` });
  const conn = await storage.getIntegrationConnection(orgId, integrationId).catch(() => null);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const rows = await db.select({ action: auditEvents.action }).from(auditEvents)
    .where(and(eq(auditEvents.organizationId, orgId), gte(auditEvents.createdAt, since), like(auditEvents.objectId, `${integrationId}:%`)));
  const calls = rows.filter(r => r.action === "integration_tool_call" || r.action === "integration_tool_error");
  const errors = calls.filter(r => r.action === "integration_tool_error");
  const totalCalls = calls.length, totalErrors = errors.length;
  res.json({ integrationId, window: "24h", status: conn?.status ?? "disconnected",
    lastTestedAt: conn?.lastTestedAt ?? null, lastTestResult: conn?.lastTestResult ?? null,
    lastError: conn?.lastError ?? null, tokenExpiresAt: conn?.tokenExpiresAt ?? null,
    mcpServerId: conn?.mcpServerId ?? null,
    metrics: { totalCalls, totalErrors,
      errorRate: totalCalls > 0 ? +(totalErrors / totalCalls).toFixed(4) : 0,
      successRate: totalCalls > 0 ? +((totalCalls - totalErrors) / totalCalls).toFixed(4) : 1 } });
});

router.post("/api/integrations/:id/test", async (req, res) => {
  const orgId = getDefaultOrgId(req);
  const integrationId = req.params.id;
  const conn = await storage.getIntegrationConnection(orgId, integrationId).catch(() => null);
  if (!conn || !conn.credentialBlob) return res.status(404).json({ error: "No connection found" });
  try {
    const credentials = decryptCredentialMap(conn.credentialBlob);
    const def = getIntegrationDef(integrationId);
    const result = await testConnectionHealth(integrationId, credentials, def);
    await storage.recordIntegrationTestResult(conn.id, result.ok, (result as any).error ?? null);
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ── Case 2: Session-authed n8n test-call (in-app panel) ─────────────────────
// Distinct from the public API endpoint which requires an agent API key.
// This one uses the standard session auth so the in-app user can test without
// needing to know the public key.
router.post("/api/integrations/n8n/call", async (req: Request, res: Response) => {
  try {
    const orgId = getDefaultOrgId(req);
    const conn = await storage.getIntegrationConnection(orgId, "n8n");
    if (!conn || !conn.credentialBlob) {
      return res.status(404).json({ error: "n8n not connected — configure credentials first in Enterprise Connectors" });
    }
    const credentials = decryptCredentialMap(conn.credentialBlob);
    const baseUrl = credentials.baseUrl?.replace(/\/$/, "");
    if (!baseUrl) {
      return res.status(400).json({ error: "n8n baseUrl missing from stored credentials" });
    }

    const body = req.body || {};
    const path = typeof body.path === "string" ? body.path.replace(/^\//, "") : "";
    const payload = body.payload ?? null;
    const method: "POST" | "GET" = body.method === "GET" ? "GET" : "POST";

    if (!path) {
      return res.status(400).json({ error: "path is required (e.g. 'webhook/your-workflow-id')" });
    }

    const webhookUrl = `${baseUrl}/${path}`;
    const result = await callN8nWorkflow({
      webhookUrl,
      payload,
      method,
      apiKey: credentials.apiKey || undefined,
      timeoutMs: 15000,
    });

    res.json({ webhookUrl, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/api/integrations/:id/connect", async (req, res) => {
  res.redirect(307, `/api/enterprise-integrations/${req.params.id}/connect`);
});

router.post("/api/integrations/:id/disconnect", async (req, res) => {
  res.redirect(307, `/api/enterprise-integrations/${req.params.id}/disconnect`);
});

router.delete("/api/integrations/:id", async (req, res) => {
  res.redirect(307, `/api/enterprise-integrations/${req.params.id}`);
});

export default router;
