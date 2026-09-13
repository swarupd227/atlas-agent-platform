/**
 * Production data access for Astra's tools. Every function takes the caller's
 * organization and returns only what that organization may see: connectors go
 * through the tenant-scoped catalog (storage.getMcpServers(orgId)) and agents
 * through storage.getAgents(orgId) / getAgent(id, orgId).
 */
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { agentMcpServers, agents, workspaceRuns, type InsertPolicy } from "@shared/schema";
import { getWorkspaceAgents, getWorkspaceRun, resumeWorkspaceRun, startWorkspaceRun, type OnWorkspaceEvent } from "../workspace-run";
import { getRedactionLevel, redactPayload, type RoleId } from "../permissions";
import { getIndustryPack } from "@shared/industry-packs";
import { isSideEffectful, type AvailableTool } from "../tool-dispatcher";
import { isMcpServerVisibleToOrg } from "../tenant-scope";
import type { AstraServices } from "./types";

export interface ConnectorSummary {
  id: string;
  name: string;
  description: string | null;
  integrationId: string | null;
  status: string;
  riskTier: string;
  /** Enterprise integration connected for this organization; null for non-integration servers. */
  connected: boolean | null;
  toolCount: number;
  writeToolCount: number;
}

function asAvailableTool(serverId: string, tool: { name: string; annotations?: unknown }): AvailableTool {
  const annotations = (tool.annotations ?? {}) as { method?: string };
  return {
    serverId,
    serverName: "",
    serverUrl: "",
    toolName: tool.name,
    toolDescription: "",
    toolInputSchema: {},
    toolMethod: annotations.method,
  };
}

async function listAgents(orgId: string) {
  return storage.getAgents(orgId);
}

async function getAgent(orgId: string, agentId: string) {
  return storage.getAgent(agentId, orgId);
}

async function listAgentConnectors(orgId: string, agentId: string) {
  const agent = await storage.getAgent(agentId, orgId);
  if (!agent) return [];
  const links = await storage.getAgentMcpServers(agentId);
  const out: Array<{ linkId: string; serverId: string; name: string; integrationId: string | null; riskTier: string; status: string }> = [];
  for (const link of links) {
    const server = await storage.getMcpServer(link.serverId);
    if (!server || !isMcpServerVisibleToOrg(server, orgId)) continue;
    out.push({ linkId: link.id, serverId: server.id, name: server.name, integrationId: server.integrationId, riskTier: server.riskTier, status: server.status });
  }
  return out;
}

async function listConnectors(orgId: string): Promise<ConnectorSummary[]> {
  const [servers, tools, connections] = await Promise.all([
    storage.getMcpServers(orgId),
    storage.getAllMcpServerTools(orgId),
    storage.listIntegrationConnections(orgId).catch(() => []),
  ]);
  const toolsByServer = new Map<string, typeof tools>();
  for (const t of tools) {
    const list = toolsByServer.get(t.serverId) ?? [];
    list.push(t);
    toolsByServer.set(t.serverId, list);
  }
  return servers.map((s) => {
    const serverTools = toolsByServer.get(s.id) ?? [];
    const connection = s.connectionId
      ? connections.find((c) => c.id === s.connectionId)
      : connections.find((c) => c.integrationId === s.integrationId && c.status === "connected");
    return {
      id: s.id,
      name: s.name,
      description: s.description,
      integrationId: s.integrationId,
      status: s.status,
      riskTier: s.riskTier,
      connected: s.integrationId ? connection?.status === "connected" : null,
      toolCount: serverTools.length,
      writeToolCount: serverTools.filter((t) => isSideEffectful(asAvailableTool(s.id, t))).length,
    };
  });
}

/** Agents in this organization linked to any of the given connectors. */
async function agentsLinkedToConnectors(orgId: string, serverIds: string[]) {
  if (serverIds.length === 0) return [];
  return db
    .select({ serverId: agentMcpServers.serverId, agentId: agents.id, agentName: agents.name, agentStatus: agents.status })
    .from(agentMcpServers)
    .innerJoin(agents, eq(agents.id, agentMcpServers.agentId))
    .where(and(inArray(agentMcpServers.serverId, serverIds), eq(agents.organizationId, orgId)));
}

async function getIndustryContext(industryId: string | null | undefined) {
  if (!industryId) return { selected: false as const };
  const pack = getIndustryPack(industryId);
  if (!pack) return { selected: true as const, industryId, pack: false as const };
  return {
    selected: true as const,
    industryId,
    pack: true as const,
    label: pack.profile.label,
    description: pack.profile.description,
    ontology: pack.profile.ontology,
    regulatoryFrameworks: pack.profile.regulatoryFrameworks,
    subVerticals: pack.profile.subVerticals,
    policyPacks: pack.policyPacks.map((p) => p.name),
  };
}

// ── attach_connector ─────────────────────────────────────────────────────────

async function getConnector(orgId: string, serverId: string) {
  const server = await storage.getMcpServer(serverId);
  if (!server || !isMcpServerVisibleToOrg(server, orgId)) return undefined;
  return { id: server.id, name: server.name, integrationId: server.integrationId, riskTier: server.riskTier };
}

async function getConnectorTools(orgId: string, serverId: string) {
  if (!(await getConnector(orgId, serverId))) return [];
  const tools = await storage.getMcpServerTools(serverId);
  return tools.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    riskClassification: t.riskClassification,
    annotations: t.annotations,
    sideEffectful: isSideEffectful(asAvailableTool(serverId, t)),
  }));
}

async function isConnectorLinked(orgId: string, agentId: string, serverId: string) {
  if (!(await storage.getAgent(agentId, orgId))) return false;
  return !!(await storage.getAgentMcpServerByIds(agentId, serverId));
}

async function listPolicies(orgId: string) {
  return storage.getPolicies(orgId);
}

async function createPolicy(orgId: string, policy: Omit<InsertPolicy, "organizationId">) {
  return storage.createPolicy({ ...policy, organizationId: orgId });
}

async function deletePolicy(orgId: string, policyId: string) {
  return storage.deletePolicy(policyId, orgId);
}

async function linkConnector(orgId: string, agentId: string, serverId: string) {
  // Both ends re-checked against the organization at the moment of writing.
  if (!(await storage.getAgent(agentId, orgId))) throw new Error("Agent not found in this organization.");
  if (!(await getConnector(orgId, serverId))) throw new Error("Connector not available to this organization.");
  if (await storage.getAgentMcpServerByIds(agentId, serverId)) throw new Error("The connector is already attached to this agent.");
  return storage.createAgentMcpServer({ agentId, serverId, assignedBy: "astra-workspace" });
}

async function recordAudit(
  orgId: string,
  userId: string | null,
  event: { action: string; objectType: string; objectId: string; details: Record<string, unknown> },
) {
  await storage.createAuditEvent({
    actorType: "user",
    actorId: userId ?? "unknown",
    action: event.action,
    objectType: event.objectType,
    objectId: event.objectId,
    organizationId: orgId,
    details: JSON.stringify(event.details),
  });
}

// ── run_agent / get_run ──────────────────────────────────────────────────────

/** The agents this role may run in the Workspace (runnable, in its audience, not a team's internal worker). */
async function listRunnableAgents(orgId: string, role: RoleId) {
  return getWorkspaceAgents(orgId, role);
}

/**
 * Runs are addressed by id alone in workspace-run.ts; Astra only touches a run
 * that belongs to the caller's organization (a run with no organization is
 * treated as belonging to none).
 */
async function runInOrg(orgId: string, runId: string): Promise<boolean> {
  const [row] = await db.select({ organizationId: workspaceRuns.organizationId }).from(workspaceRuns).where(eq(workspaceRuns.id, runId)).limit(1);
  return !!row && row.organizationId === orgId;
}

/** Workspace semantics: the actor is the caller's role. */
async function startAgentRun(orgId: string, role: RoleId, agentId: string, request: string, onEvent: OnWorkspaceEvent) {
  return startWorkspaceRun({ agentId, input: request, orgId, actorId: role }, onEvent);
}

async function getAgentRun(orgId: string, runId: string) {
  if (!(await runInOrg(orgId, runId))) return null;
  return getWorkspaceRun(runId, orgId);
}

async function decideAgentRun(orgId: string, role: RoleId, runId: string, decision: "approve" | "deny", onEvent: OnWorkspaceEvent) {
  if (!(await runInOrg(orgId, runId))) throw new Error("Run not found in this organization.");
  return resumeWorkspaceRun({ runId, decision, orgId, actorId: role }, onEvent);
}

/** A run as the role may see it: payloads redacted to the role's level. */
async function getRunForRole(orgId: string, role: RoleId, runId: string) {
  const run = await getAgentRun(orgId, runId);
  if (!run) return null;
  return redactPayload(run, getRedactionLevel(role)) as typeof run;
}

async function getOrganizationName(orgId: string) {
  const org = await storage.getOrganization(orgId).catch(() => undefined);
  return org?.name ?? null;
}

export function createAstraServices(): AstraServices {
  return {
    listAgents,
    getAgent,
    listAgentConnectors,
    listConnectors,
    agentsLinkedToConnectors,
    getIndustryContext,
    getOrganizationName,
    getConnector,
    getConnectorTools,
    isConnectorLinked,
    listPolicies,
    createPolicy,
    deletePolicy,
    linkConnector,
    recordAudit,
    listRunnableAgents,
    startAgentRun,
    getAgentRun,
    decideAgentRun,
    getRunForRole,
  };
}
