import { z } from "zod";
import type { AstraTool } from "../types";

export interface AgentSummary {
  id: string;
  name: string;
  status: string | null;
  agentType: string | null;
  riskTier: string | null;
  autonomyMode: string | null;
  modelName: string | null;
  description: string | null;
}

const LIMIT_MAX = 50;

/** Compact form for the model: enough to reason about, small enough to replay. */
export function summarizeAgent(agent: Record<string, any>): AgentSummary {
  const description = typeof agent.description === "string" ? agent.description : null;
  return {
    id: String(agent.id),
    name: String(agent.name ?? "Unnamed agent"),
    status: agent.status ?? null,
    agentType: agent.agentType ?? null,
    riskTier: agent.riskTier ?? null,
    autonomyMode: agent.autonomyMode ?? null,
    modelName: agent.modelName ?? null,
    description: description && description.length > 160 ? `${description.slice(0, 157)}…` : description,
  };
}

export const listAgentsTool: AstraTool<{ search?: string; status?: string; limit?: number }> = {
  name: "list_agents",
  description:
    "List the organization's agents with their status, type, risk tier and autonomy. Optionally filter by a name/description search or a status such as active, deployed or draft.",
  input: z.object({
    search: z.string().optional().describe("Case-insensitive text matched against agent name and description."),
    status: z.string().optional().describe("Only agents with this status."),
    limit: z.number().int().optional().describe(`At most this many agents (default 25, max ${LIMIT_MAX}).`),
  }),
  permission: "view_agents",
  confirm: false,
  run: async (ctx, input) => {
    const all: Record<string, any>[] = await ctx.services.listAgents(ctx.orgId);
    const search = input.search?.trim().toLowerCase();
    const matching = all.filter((a) => {
      if (input.status && String(a.status ?? "").toLowerCase() !== input.status.toLowerCase()) return false;
      if (!search) return true;
      return `${a.name ?? ""} ${a.description ?? ""}`.toLowerCase().includes(search);
    });
    const limit = Math.min(Math.max(input.limit ?? 25, 1), LIMIT_MAX);
    const agents = matching.slice(0, limit).map(summarizeAgent);
    return {
      payload: { total: matching.length, returned: agents.length, agents },
      artifact: {
        kind: "agentList",
        title: search || input.status ? `Agents matching ${[search && `"${input.search}"`, input.status].filter(Boolean).join(", ")}` : "Your agents",
        props: { agents, total: matching.length },
        fullViewHref: "/agents",
      },
    };
  },
};
