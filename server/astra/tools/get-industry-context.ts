import { z } from "zod";
import type { AstraTool } from "../types";

/**
 * The industry the user is working in and what the platform knows about it.
 * Increment 1 reads the industry selected in the user's client; storing it on
 * the organization is backlog E-UX6.
 */
export const getIndustryContextTool: AstraTool<Record<string, never>> = {
  name: "get_industry_context",
  description:
    "Get the industry the user is working in and the platform's industry pack for it: regulatory frameworks, sub-verticals, ontology and policy packs. Says so when no industry is selected or there is no pack yet.",
  input: z.object({}),
  confirm: false,
  run: async (ctx) => {
    const context = await ctx.services.getIndustryContext(ctx.industryId ?? null);
    if (!context.selected) {
      return {
        payload: { selected: false, message: "No industry is selected for this user." },
        proof: { industry: { status: "not_measured", reason: "No industry selected." } },
      };
    }
    if (!context.pack) {
      return {
        payload: { selected: true, industryId: context.industryId, pack: false, message: "This industry has no industry pack yet, so there is no curated regulatory or ontology context." },
        proof: { industry: { status: "not_measured", reason: `No industry pack for ${context.industryId}.` } },
      };
    }
    return {
      payload: context,
      artifact: { kind: "text", title: context.label, props: { lines: [context.description, `Ontology: ${context.ontology}`, `Regulatory frameworks: ${context.regulatoryFrameworks.join(", ")}`] } },
      proof: {
        industry: {
          status: "measured",
          summary: `${context.label} pack · ${context.regulatoryFrameworks.length} regulatory frameworks · ${context.policyPacks.length} policy packs`,
        },
      },
    };
  },
};
