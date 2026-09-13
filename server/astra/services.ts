/**
 * Production data access for Astra's tools. Every function takes the caller's
 * organization and returns only what that organization may see: connectors go
 * through the tenant-scoped catalog (storage.getMcpServers(orgId)) and agents
 * through storage.getAgents(orgId) / getAgent(id, orgId).
 */
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { agentMcpServers, agents } from "@shared/schema";
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
  };
}
