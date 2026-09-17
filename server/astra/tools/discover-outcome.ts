import { z } from "zod";
import type { AstraTool, ProofEnvelope } from "../types";

/**
 * Ground an outcome the user and Astra are drafting in the conversation: what
 * the organization already has (similar outcomes, agents for the proposed
 * roles, which proposed tools exist, policies that would apply), the industry
 * pack's frameworks and KPI dimensions, and a composite risk read. Reads only.
 */

type Input = { name: string; description: string; riskTier?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"; kpiNames?: string[]; roles?: string[]; tools?: string[] };

export const discoverOutcomeTool: AstraTool<Input> = {
  name: "discover_outcome",
  description:
    "Check a drafted outcome against what the organization already has before creating it: possible duplicate outcomes, existing agents for the proposed roles, which proposed tools or connectors already exist, the policies that would apply, the industry's regulatory frameworks and KPI dimensions, and a composite risk level. Reads only.",
  input: z.object({
    name: z.string().min(3).max(200).describe("The outcome's name."),
    description: z.string().min(10).max(2000).describe("What success means, in the user's words."),
    riskTier: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
    kpiNames: z.array(z.string().max(120)).max(12).optional().describe("The KPIs drafted so far."),
    roles: z.array(z.string().max(120)).max(12).optional().describe("Agent roles the work would need, e.g. 'collections follow-up'."),
    tools: z.array(z.string().max(120)).max(20).optional().describe("Systems or tools the work would need, e.g. 'dealer management system'."),
  }),
  confirm: false,
  run: async (ctx, input) => {
    const g = await ctx.services.outcomeGrounding(ctx.orgId, ctx.industryId ?? null, input);

    const payload = {
      possibleDuplicates: g.possibleDuplicates,
      industry: g.industry.pack
        ? {
            label: g.industry.label,
            regulatoryFrameworks: g.industry.regulatoryFrameworks,
            kpiDimensions: g.industry.kpiDimensions.map((k: { label: string }) => k.label),
            regulatoryChecks: g.industry.regulatoryChecks.slice(0, 8),
          }
        : g.industry.builtIn
          ? { label: g.industry.label, regulatoryFrameworks: g.industry.regulatoryFrameworks, note: "Built-in industry profile: no KPI dimensions or regulatory checks from a pack." }
          : { note: g.industry.selected ? "No industry pack for this industry." : "No industry selected." },
      existingAgents: g.similarAgents.flatMap((r: any) => r.matches.map((m: any) => ({ role: r.role, name: m.name, status: m.status }))).slice(0, 10),
      toolCoverage: g.toolCoverage,
      policiesThatWouldApply: g.policies.map((p: any) => p.name),
      compositeRisk: g.compositeRisk,
    };

    const proof: Partial<ProofEnvelope> = {
      context: {
        status: "measured",
        summary: `Checked ${g.checked.outcomes} outcomes, ${g.checked.agents} agents, ${g.checked.connectors} connectors and ${g.checked.policies} policies`,
      },
      compliance: {
        status: "measured",
        summary: `${g.policies.length} ${g.policies.length === 1 ? "policy" : "policies"} would apply · composite risk ${g.compositeRisk.level}`,
      },
      industry: g.industry.pack
        ? { status: "measured", summary: `${g.industry.label} · ${g.industry.regulatoryFrameworks.length} regulatory frameworks` }
        : g.industry.builtIn
          ? { status: "measured", summary: `${g.industry.label} · ${g.industry.regulatoryFrameworks.length} regulatory frameworks (built-in profile)` }
          : { status: "not_measured", reason: g.industry.selected ? "There is no industry pack for this industry yet." : "No industry is selected." },
    };

    return {
      payload,
      artifact: { kind: "outcomeDraft", title: input.name, props: { draft: input, grounding: g } },
      proof,
    };
  },
};
