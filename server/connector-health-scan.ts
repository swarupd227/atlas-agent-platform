/**
 * The database side of connector health probes (see connector-health-probe.ts):
 * which connectors to probe, their credentials, the agents that use them, and
 * the alerts raised and closed for them.
 */
import { and, desc, eq, inArray, isNotNull, like } from "drizzle-orm";
import { agentAlerts, agentMcpServers, agents, mcpServers } from "@shared/schema";
import { db } from "./db";
import { storage } from "./storage";
import { buildMcpAuthHeaders } from "./mcp-client";
import {
  CONNECTOR_ALERT_TYPE,
  probeConnector,
  scanConnectorHealth,
  type HealthScanDeps,
  type ProbeTarget,
} from "./connector-health-probe";

const alertPrefix = (target: Pick<ProbeTarget, "name">) => `Connector "${target.name}"`;

export const connectorHealthDeps: HealthScanDeps = {
  async listTargets() {
    const rows = await db
      .select({ id: mcpServers.id, name: mcpServers.name, url: mcpServers.url, healthCheckPath: mcpServers.healthCheckPath, healthStatus: mcpServers.healthStatus })
      .from(mcpServers)
      .where(isNotNull(mcpServers.healthCheckPath));
    return rows;
  },

  async probe(target) {
    const server = await storage.getMcpServer(target.id);
    const auth = server ? await storage.getMcpServerAuth(target.id) : null;
    const headers = server ? await buildMcpAuthHeaders(server, auth) : {};
    return probeConnector(target, headers);
  },

  async saveHealth(targetId, healthy, detail, at) {
    await db
      .update(mcpServers)
      .set({ healthStatus: healthy ? "healthy" : "unhealthy", healthDetail: detail, lastHealthCheck: at })
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
