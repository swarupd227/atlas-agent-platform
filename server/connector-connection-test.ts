/**
 * The real vendor call behind "is this connector actually working".
 *
 * Lifted verbatim out of server/routes/enterprise-integrations.ts, where it was
 * private to the route that a person clicks. Nothing on a schedule could reach
 * it, so an enterprise connector's health could only ever be as fresh as the
 * last time somebody pressed a button -- and the connectors page read a
 * different column entirely (mcp_servers.health_status), which no code was
 * writing for these connectors at all.
 *
 * It is the only check here that talks to the customer's own system with the
 * customer's own credentials, which is why it is metered by cadence in
 * connector-health-probe.ts and confirmed before a person triggers it.
 */
import { getIntegrationDef } from "./integrations/registry";
import { getDefaultOrgId } from "./auth";
import { assertSafeOutboundUrl, UnsafeUrlError } from "./url-safety";

/** One source of truth for the shape: whatever the function below returns. */
export type ConnectionTestResult = Awaited<ReturnType<typeof testConnectionHealth>>;

/** Integrations whose connector extends SqlMcpServerBase and can self-test. */
const SQL_INTEGRATION_IDS = new Set(["postgres", "mysql", "sqlserver"]);

export async function testConnectionHealth(
  integrationId: string,
  credentials: Record<string, string>,
  def: ReturnType<typeof getIntegrationDef>,
  orgId?: string
): Promise<{ ok: boolean; latencyMs?: number; error?: string; status?: string; friendlyError?: string; hostFingerprint?: string }> {
  const start = Date.now();

  // SQL connectors already know how to verify themselves -- SqlMcpServerBase
  // .testConnection() runs SELECT 1, translates the driver error into
  // something readable, and surfaces an SSH tunnel's host-key fingerprint.
  // Without this they fell through to the `default:` branch below and were
  // recorded as "not_verifiable", so a database connection with entirely wrong
  // credentials saved and displayed as connected.
  if (SQL_INTEGRATION_IDS.has(integrationId)) {
    const { getEnterpriseServerById } = await import("./integrations/register");
    const connector = getEnterpriseServerById(integrationId) as any;

    if (!connector || typeof connector.testConnection !== "function") {
      return { ok: true, status: "not_verifiable", latencyMs: Date.now() - start };
    }

    // Relay mode reaches the database through a customer-side agent holding an
    // outbound WebSocket. If no agent is currently connected there is nothing
    // to test THROUGH, and the failure would say nothing about whether the
    // credentials are right -- so report it honestly instead of marking the
    // connection broken.
    if (credentials.connectionMode === "relay_agent") {
      const { isAgentConnected } = await import("./relay/relay-server");
      const relayAgentId = credentials.relayAgentId;
      if (!relayAgentId) {
        return { ok: true, status: "not_verifiable", error: "Relay mode selected but no relay agent chosen.", latencyMs: Date.now() - start };
      }
      if (!isAgentConnected(relayAgentId)) {
        return {
          ok: true,
          status: "not_verifiable",
          error: `Relay agent '${relayAgentId}' is not currently connected — cannot verify until it comes online.`,
          latencyMs: Date.now() - start,
        };
      }
    }

    // The session cache is keyed by org, so a missing org would build a
    // connector under a different cache key than every later call.
    const effectiveOrgId = orgId ?? getDefaultOrgId();
    if (!effectiveOrgId) {
      return { ok: true, status: "not_verifiable", error: "No organization context to test with.", latencyMs: Date.now() - start };
    }

    const result = await connector.testConnection(credentials, effectiveOrgId);
    return {
      ok: result.ok,
      error: result.error,
      friendlyError: result.friendlyError,
      hostFingerprint: result.hostFingerprint,
      latencyMs: Date.now() - start,
    };
  }

  try {
    // These tests fetch URLs the user supplied (instance_url, base_url, baseUrl),
    // with the user's credentials attached. Refuse private, loopback, link-local
    // and cloud-metadata addresses before any request is made, and don't follow
    // redirects, which would otherwise route around that check.
    const userSuppliedUrl =
      integrationId === "salesforce" ? credentials.instance_url
      : integrationId === "jira" ? credentials.base_url
      : integrationId === "servicenow" ? credentials.instance_url
      : integrationId === "n8n" ? credentials.baseUrl
      : undefined;
    if (userSuppliedUrl) {
      try {
        await assertSafeOutboundUrl(userSuppliedUrl);
      } catch (e: any) {
        return { ok: false, error: e instanceof UnsafeUrlError ? e.message : "That URL can't be reached from this test.", latencyMs: Date.now() - start };
      }
    }

    switch (integrationId) {
      case "salesforce": {
        const instanceUrl = credentials.instance_url ?? "https://login.salesforce.com";
        const r = await fetch(`${instanceUrl}/services/data/v59.0/`, {
          headers: { Authorization: `Bearer ${credentials.access_token}` },
          redirect: "manual",
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
          redirect: "manual",
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
          redirect: "manual",
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
        const r = await fetch(`${baseUrl}/healthz`, { headers, redirect: "manual", signal: AbortSignal.timeout(5000) });
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
