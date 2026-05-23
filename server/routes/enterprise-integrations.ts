import { Router, type Request, type Response } from "express";
import { randomBytes } from "crypto";
import { z } from "zod";
import { storage } from "../storage";
import { encryptCredentialMap, decryptCredentialMap } from "../credential-vault";
import { INTEGRATION_REGISTRY, getIntegrationDef } from "../integrations/registry";
import { getDefaultOrgId } from "../auth";

const router = Router();

// ── GET /api/enterprise-integrations ─────────────────────────────────────────
// Returns all registry entries enriched with per-org connection status
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

    res.json({
      id: conn.id,
      integrationId: conn.integrationId,
      status: conn.status,
      createdAt: conn.createdAt,
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
    await storage.disconnectIntegration(orgId, integrationId);
    res.json({ ok: true });
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

// ── GET /api/enterprise-integrations/:id/credentials-hint ────────────────────
// Returns masked/hinted credential keys (no values) for the connected integration
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

// ── OAuth 2.0 Flow ────────────────────────────────────────────────────────────
// In-memory pending states (TTL 10 min, sufficient for browser redirect round-trip)
const pendingOAuthStates = new Map<string, {
  integrationId: string;
  orgId: string;
  expiresAt: number;
  codeVerifier?: string;
}>();

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of pendingOAuthStates) {
    if (v.expiresAt < now) pendingOAuthStates.delete(k);
  }
}, 60_000);

router.get("/api/integrations/oauth/start/:provider", async (req: Request, res: Response) => {
  try {
    const { provider } = req.params;
    const def = getIntegrationDef(provider);
    if (!def || !def.oauthConfig) {
      return res.status(400).json({ error: `${provider} does not support OAuth2` });
    }
    const orgId = getDefaultOrgId(req);
    const state = randomHex(24);
    const redirectUri = `${req.protocol}://${req.get("host")}/api/integrations/oauth/callback`;

    pendingOAuthStates.set(state, {
      integrationId: provider,
      orgId,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });

    const url = new URL(def.oauthConfig.authorizationUrl);
    url.searchParams.set("client_id", process.env[`OAUTH_${provider.toUpperCase()}_CLIENT_ID`] ?? "PLACEHOLDER_CLIENT_ID");
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("state", state);
    url.searchParams.set("scope", def.oauthConfig.defaultScopes.join(" "));

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
    const tokenRes = await fetch(def.oauthConfig.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: process.env[`OAUTH_${pending.integrationId.toUpperCase()}_CLIENT_ID`] ?? "",
        client_secret: process.env[`OAUTH_${pending.integrationId.toUpperCase()}_CLIENT_SECRET`] ?? "",
      }).toString(),
    });

    const tokenData = await tokenRes.json() as any;
    if (!tokenRes.ok || tokenData.error) {
      return res.redirect(`/integrations?oauth_error=${encodeURIComponent(tokenData.error_description ?? tokenData.error ?? "token_exchange_failed")}`);
    }

    const credentialBlob = encryptCredentialMap({
      access_token: tokenData.access_token ?? "",
      refresh_token: tokenData.refresh_token ?? "",
      token_type: tokenData.token_type ?? "Bearer",
    });

    const expiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000)
      : null;

    await storage.upsertIntegrationConnection({
      organizationId: pending.orgId,
      integrationId: pending.integrationId,
      credentialBlob,
      oauthScopes: def.oauthConfig.defaultScopes,
      status: "connected",
      tokenExpiresAt: expiresAt ?? undefined,
      lastTestResult: null,
      lastError: null,
    });

    res.redirect(`/integrations?oauth_success=${pending.integrationId}`);
  } catch (err: any) {
    res.redirect(`/integrations?oauth_error=${encodeURIComponent(err.message)}`);
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function randomHex(bytes: number): string {
  return randomBytes(bytes).toString("hex");
}

function maskValue(value: string): string {
  if (!value || value.length <= 6) return "••••••";
  return value.slice(0, 4) + "••••" + value.slice(-2);
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
      default:
        return { ok: true, latencyMs: Date.now() - start };
    }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "Connection timeout", latencyMs: Date.now() - start };
  }
}

export default router;
