/**
 * The database and network side of connector health probes (see
 * connector-health-probe.ts): which connectors to check, WHICH check each one
 * can take, their credentials, the agents that use them, and the alerts raised
 * and closed for them.
 *
 * This used to select only connectors with a `healthCheckPath` — one row out of
 * 132 live — so the scan had nothing to do and the health column on the other
 * 131 was whatever had last been written by hand. Every connector now gets the
 * strongest check it can take, and a row nothing can check keeps no state at all.
 */
import { and, desc, eq, inArray, isNotNull, like } from "drizzle-orm";
import { agentAlerts, agentMcpServers, agents, integrationConnections, mcpServerTools, mcpServers } from "@shared/schema";
import { db } from "./db";
import { storage } from "./storage";
import { buildMcpAuthHeaders, mcpListTools } from "./mcp-client";
import { openCredentialMap } from "./credential-store";
import { isMcpProtocolMounted } from "./real-mcp-transport";
import { isPathHandled, pathnameOf } from "./app-mounts";
import { testConnectionHealth } from "./connector-connection-test";
import {
  CONNECTOR_ALERT_TYPE,
  chooseProbe,
  connectionTestResult,
  isLoopbackMockUrl,
  mountCheckResult,
  nothingToProbe,
  probeConnector,
  probeMockEndpoint,
  scanConnectorHealth,
  toolsListFailure,
  toolsListResult,
  type HealthScanDeps,
  type ProbeMethod,
  type ProbeResult,
  type ProbeTarget,
} from "./connector-health-probe";

const alertPrefix = (target: Pick<ProbeTarget, "name">) => `Connector "${target.name}"`;

/** A GET tool that needs no arguments: the only kind safe to call just to see if anything answers. */
function readOnlyEndpointOf(tools: Array<{ inputSchema: unknown; annotations: unknown }>): string | null {
  for (const tool of tools) {
    const ann = (tool.annotations ?? {}) as Record<string, unknown>;
    if (String(ann.method ?? "").toUpperCase() !== "GET") continue;
    const endpoint = typeof ann.endpoint === "string" ? ann.endpoint : null;
    if (!endpoint) continue;
    const required = ((tool.inputSchema ?? {}) as Record<string, unknown>).required;
    if (Array.isArray(required) && required.length > 0) continue;
    return endpoint;
  }
  return null;
}

/**
 * Enrich every connector with the facts `chooseProbe` needs.
 *
 * `hasConnection` is deliberately narrow here: a connection belongs to one
 * organization, while a platform catalog row (organizationId null) is visible to
 * every tenant and carries a single health column. Running one tenant's
 * credential test and writing the answer on a shared row would show that tenant's
 * outcome to all the others, so the scan leaves those rows alone and the read
 * path answers them per caller from that caller's own connection record
 * (see connector-actions.ts).
 */
export async function listProbeTargets(): Promise<ProbeTarget[]> {
  const rows = await db
    .select({
      id: mcpServers.id,
      name: mcpServers.name,
      url: mcpServers.url,
      healthCheckPath: mcpServers.healthCheckPath,
      healthStatus: mcpServers.healthStatus,
      lastHealthCheck: mcpServers.lastHealthCheck,
      transportType: mcpServers.transportType,
      integrationId: mcpServers.integrationId,
      organizationId: mcpServers.organizationId,
      connectionId: mcpServers.connectionId,
    })
    .from(mcpServers);

  const { getEnterpriseServerById } = await import("./integrations/register");

  // One query for the connections that could back an org-owned enterprise row.
  // The credential value itself is never selected — only whether one is on file.
  // Status is filtered here rather than in SQL because a NULL status would fall
  // out of a `ne` comparison and quietly look disconnected.
  const connectable = (await db
    .select({ orgId: integrationConnections.organizationId, integrationId: integrationConnections.integrationId, id: integrationConnections.id, status: integrationConnections.status })
    .from(integrationConnections)
    .where(isNotNull(integrationConnections.credentialBlob))).filter((c) => c.status !== "disconnected");
  const connectionByOrgType = new Set(connectable.map((c) => `${c.orgId}:${c.integrationId}`));
  const connectionById = new Set(connectable.map((c) => c.id));

  // One query for the mock endpoints, rather than one per connector.
  const mockIds = rows.filter((r) => isLoopbackMockUrl(r.url)).map((r) => r.id);
  const toolsByServer = new Map<string, Array<{ inputSchema: unknown; annotations: unknown }>>();
  if (mockIds.length > 0) {
    const tools = await db
      .select({ serverId: mcpServerTools.serverId, inputSchema: mcpServerTools.inputSchema, annotations: mcpServerTools.annotations })
      .from(mcpServerTools)
      .where(inArray(mcpServerTools.serverId, mockIds));
    for (const t of tools) {
      const list = toolsByServer.get(t.serverId) ?? [];
      list.push({ inputSchema: t.inputSchema, annotations: t.annotations });
      toolsByServer.set(t.serverId, list);
    }
  }

  return rows.map((row) => ({
    ...row,
    inThisBuild: row.integrationId ? !!getEnterpriseServerById(row.integrationId) : undefined,
    hasConnection: row.integrationId
      ? (row.connectionId ? connectionById.has(row.connectionId) : !!row.organizationId && connectionByOrgType.has(`${row.organizationId}:${row.integrationId}`))
      : undefined,
    protocolMounted: row.integrationId ? isMcpProtocolMounted(row.integrationId) : null,
    readOnlyEndpoint: readOnlyEndpointOf(toolsByServer.get(row.id) ?? []),
    mountedHere: isLoopbackMockUrl(row.url) ? isPathHandled(pathnameOf(row.url) ?? "") : null,
  }));
}

/**
 * A real MCP handshake and `tools/list`.
 *
 * The strongest check there is for a connector that really speaks the protocol:
 * it opens the transport, negotiates, and asks for the tool list with the
 * connector's own credentials, which is the same path an agent's call takes. It
 * also catches the drift a curl never would — a server that has quietly dropped
 * or renamed a tool the platform still has catalogued.
 */
export async function probeByToolsList(target: ProbeTarget): Promise<ProbeResult> {
  const server = await storage.getMcpServer(target.id);
  if (!server) return nothingToProbe("its row is no longer there to call");
  const auth = await storage.getMcpServerAuth(target.id).catch(() => null);
  try {
    const tools = await mcpListTools(server as any, auth as any);
    const catalogued = (await storage.getMcpServerTools(target.id).catch(() => [])).length;
    return toolsListResult(tools.length, catalogued > 0 ? catalogued : null);
  } catch (err) {
    return toolsListFailure(err);
  }
}

/**
 * The vendor call an enterprise connector's Connect form makes, run against a
 * stored connection. Records the outcome on the connection itself, which is
 * where the rest of the platform already reads it from — and only when something
 * was actually measured, so `not_verifiable` never flips a connection to
 * "connected".
 */
export async function vendorConnectionTest(integrationId: string, orgId: string, connectionId?: string | null): Promise<ProbeResult> {
  const conn = connectionId
    ? await storage.getIntegrationConnectionById(orgId, connectionId).catch(() => null)
    : await storage.getIntegrationConnection(orgId, integrationId).catch(() => null);
  if (!conn || !conn.credentialBlob || conn.status === "disconnected") {
    return nothingToProbe("nothing is connected to it, so there are no credentials to test with");
  }
  let credentials: Record<string, string>;
  try {
    credentials = await openCredentialMap(conn.credentialBlob);
  } catch {
    return { healthy: false, detail: "Its stored credentials cannot be read, so every call it makes will fail", method: "vendor_connection_test", probed: true };
  }
  const { getIntegrationDef } = await import("./integrations/registry");
  const raw = await testConnectionHealth(integrationId, credentials, getIntegrationDef(integrationId), orgId);
  const result = connectionTestResult(raw);
  if (result.probed) {
    await storage.recordIntegrationTestResult(conn.id, result.healthy, raw.friendlyError ?? raw.error ?? null).catch(() => {});
  }
  return result;
}

export const connectorHealthDeps: HealthScanDeps = {
  listTargets: listProbeTargets,

  async probe(target, method) {
    switch (method) {
      case "health_path": {
        const server = await storage.getMcpServer(target.id);
        const auth = server ? await storage.getMcpServerAuth(target.id) : null;
        const headers = server ? await buildMcpAuthHeaders(server, auth) : {};
        return probeConnector(target, headers);
      }
      case "mcp_tools_list":
        return probeByToolsList(target);
      case "vendor_connection_test": {
        if (!target.integrationId || !target.organizationId) {
          return nothingToProbe("its credentials belong to an organization, and this row is shared, so the scan cannot pick one");
        }
        return vendorConnectionTest(target.integrationId, target.organizationId, target.connectionId ?? null);
      }
      case "mock_endpoint":
        return probeMockEndpoint(target);
      case "mount_check":
        return mountCheckResult(target.mountedHere ?? null, pathnameOf(target.url));
      default:
        return nothingToProbe(chooseProbe(target).why);
    }
  },

  async saveHealth(targetId, healthy, detail, at, method) {
    await db
      .update(mcpServers)
      .set({ healthStatus: healthy ? "healthy" : "unhealthy", healthDetail: detail, lastHealthCheck: at, healthCheckKind: method })
      .where(eq(mcpServers.id, targetId));
  },

  async linkedAgents(targetId) {
    return db
      .select({ id: agents.id, name: agents.name, orgId: agents.organizationId })
      .from(agentMcpServers)
      .innerJoin(agents, eq(agents.id, agentMcpServers.agentId))
      .where(and(eq(agentMcpServers.serverId, targetId), eq(agents.status, "active")));
  },

  async alertsFor(target, agentIds) {
    if (agentIds.length === 0) return [];
    return db
      .select({ id: agentAlerts.id, agentId: agentAlerts.agentId, triggeredAt: agentAlerts.triggeredAt, acknowledgedAt: agentAlerts.acknowledgedAt })
      .from(agentAlerts)
      .where(
        and(
          eq(agentAlerts.alertType, CONNECTOR_ALERT_TYPE),
          inArray(agentAlerts.agentId, agentIds),
          like(agentAlerts.message, `${alertPrefix(target)}%`),
        ),
      )
      .orderBy(desc(agentAlerts.triggeredAt));
  },

  async createAlert(agent, _target, message) {
    await db.insert(agentAlerts).values({
      orgId: agent.orgId,
      agentId: agent.id,
      agentName: agent.name,
      alertType: CONNECTOR_ALERT_TYPE,
      severity: "critical",
      message,
    });
  },

  async acknowledgeAlerts(alertIds, at) {
    if (alertIds.length === 0) return;
    await db.update(agentAlerts).set({ acknowledgedAt: at }).where(inArray(agentAlerts.id, alertIds));
  },

  async audit(action, target, details) {
    await storage
      .createAuditEvent({
        action,
        objectType: "mcp_server",
        objectId: target.id,
        actorId: "connector-health-scan",
        actorType: "system",
        details: JSON.stringify({ connector: target.name, ...details }),
      } as any)
      .catch(() => {});
  },
};

export function runConnectorHealthScan(now: Date = new Date()) {
  return scanConnectorHealth(connectorHealthDeps, now);
}
