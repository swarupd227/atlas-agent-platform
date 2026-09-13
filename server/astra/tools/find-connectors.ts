import { z } from "zod";
import type { AstraTool } from "../types";

interface Connector {
  id: string;
  name: string;
  description: string | null;
  integrationId: string | null;
  status: string;
  riskTier: string;
  connected: boolean | null;
  toolCount: number;
  writeToolCount: number;
}

const LIMIT_MAX = 25;

export const findConnectorsTool: AstraTool<{ query?: string; integrationId?: string; includeLinkedAgents?: boolean; limit?: number }> = {
  name: "find_connectors",
  description:
    "Find connectors (MCP servers and enterprise integrations) this organization can use, with whether each is connected, how many tools it exposes and how many of those change data. Set includeLinkedAgents to see which of the organization's agents can already reach each one.",
  input: z.object({
    query: z.string().optional().describe("Text matched against connector name, description and integration id, e.g. \"dealer\" or \"salesforce\"."),
    integrationId: z.string().optional().describe("Exact integration id, e.g. dealer-operations."),
    includeLinkedAgents: z.boolean().optional().describe("Also list the agents linked to each connector found."),
    limit: z.number().int().optional().describe(`At most this many connectors (default 10, max ${LIMIT_MAX}).`),
  }),
  permission: "view_agents",
  confirm: false,
  run: async (ctx, input) => {
    const all: Connector[] = await ctx.services.listConnectors(ctx.orgId);
    const query = input.query?.trim().toLowerCase();
    const matching = all.filter((c) => {
      if (input.integrationId && c.integrationId !== input.integrationId) return false;
      if (!query) return true;
      return `${c.name} ${c.description ?? ""} ${c.integrationId ?? ""}`.toLowerCase().includes(query);
    });
    const limit = Math.min(Math.max(input.limit ?? 10, 1), LIMIT_MAX);
    const connectors = matching.slice(0, limit);

    let linked: Array<{ serverId: string; agentId: string; agentName: string; agentStatus: string | null }> = [];
    if (input.includeLinkedAgents) {
      linked = await ctx.services.agentsLinkedToConnectors(ctx.orgId, connectors.map((c) => c.id));
    }

    const rows = connectors.map((c) => ({
      ...c,
      description: c.description && c.description.length > 140 ? `${c.description.slice(0, 137)}…` : c.description,
      ...(input.includeLinkedAgents
        ? { linkedAgents: linked.filter((l) => l.serverId === c.id).map((l) => ({ id: l.agentId, name: l.agentName, status: l.agentStatus })) }
        : {}),
    }));

    return {
      payload: { total: matching.length, returned: rows.length, connectors: rows },
      artifact: {
        kind: "connectorList",
        title: query || input.integrationId ? `Connectors matching ${input.integrationId ?? `"${input.query}"`}` : "Connectors available to you",
        props: { connectors: rows, total: matching.length, includeLinkedAgents: !!input.includeLinkedAgents },
        fullViewHref: "/integrations/mcp-servers",
      },
    };
  },
};
