import { z } from "zod";
import type { AstraTool, ProofEnvelope } from "../types";
import { summarizeAgent } from "./list-agents";

function findByName(agents: Record<string, any>[], name: string): Record<string, any>[] {
  const needle = name.trim().toLowerCase();
  const exact = agents.filter((a) => String(a.name ?? "").toLowerCase() === needle);
  if (exact.length > 0) return exact;
  return agents.filter((a) => String(a.name ?? "").toLowerCase().includes(needle));
}

export const getAgentTool: AstraTool<{ agentId?: string; name?: string }> = {
  name: "get_agent",
  description:
    "Get one agent's details: status, model, autonomy, the connectors it can use, how many policies are bound to it, and its industry concepts. Identify it by id, or by name (exact or partial).",
  input: z.object({
    agentId: z.string().optional().describe("The agent's id."),
    name: z.string().optional().describe("The agent's name, or part of it, when the id isn't known."),
  }),
  permission: "view_agents",
  confirm: false,
  run: async (ctx, input) => {
    let agent: Record<string, any> | undefined;
    if (input.agentId) {
      agent = await ctx.services.getAgent(ctx.orgId, input.agentId);
    } else if (input.name) {
      const matches = findByName(await ctx.services.listAgents(ctx.orgId), input.name);
      if (matches.length > 1) {
        return { payload: { found: false, ambiguous: true, candidates: matches.slice(0, 8).map(summarizeAgent) } };
      }
      agent = matches[0];
    } else {
      throw new Error("Give an agentId or a name.");
    }
    if (!agent) return { payload: { found: false, message: "No agent with that id or name in this organization." } };

    const connectors: Array<{ serverId: string; name: string; integrationId: string | null; riskTier: string }> =
      await ctx.services.listAgentConnectors(ctx.orgId, agent.id);
    const policyBindings = Array.isArray(agent.policyBindings) ? agent.policyBindings : [];
    const ontologyTags: Array<{ conceptLabel?: string }> = Array.isArray(agent.ontologyTags) ? agent.ontologyTags : [];

    const proof: Partial<ProofEnvelope> = {
      compliance: {
        status: "measured",
        summary: `${policyBindings.length} ${policyBindings.length === 1 ? "policy" : "policies"} bound · autonomy ${agent.autonomyMode ?? "unknown"} · risk ${agent.riskTier ?? "unknown"}`,
      },
      industry: ontologyTags.length > 0
        ? { status: "measured", summary: ontologyTags.slice(0, 4).map((t) => t.conceptLabel).filter(Boolean).join(" · ") }
        : { status: "not_measured", reason: "No industry concepts are tagged on this agent." },
    };

    const detail = {
      ...summarizeAgent(agent),
      connectors: connectors.map((c) => ({ id: c.serverId, name: c.name, integrationId: c.integrationId, riskTier: c.riskTier })),
      policiesBound: policyBindings.length,
      industryConcepts: ontologyTags.map((t) => t.conceptLabel).filter(Boolean),
    };

    return {
      payload: { found: true, agent: detail },
      artifact: { kind: "agent", title: String(agent.name), props: { agent: detail }, fullViewHref: `/agents/${agent.id}` },
      proof,
    };
  },
};
