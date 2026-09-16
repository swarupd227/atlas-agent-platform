import { z } from "zod";
import type { AstraTool } from "../types";

/**
 * The industry in effect and what the platform knows about it. That is the
 * organization's industry, unless the user is viewing another one for
 * themselves; the payload says which.
 */
export const getIndustryContextTool: AstraTool<Record<string, never>> = {
  name: "get_industry_context",
  description:
    "Get the industry in effect -- the organization's, or one the user is viewing for themselves (the result says which) -- and the platform's industry pack for it: regulatory frameworks, sub-verticals, ontology and policy packs. Says so when no industry is set or there is no pack yet.",
  input: z.object({}),
  confirm: false,
  run: async (ctx) => {
    const context = await ctx.services.getIndustryContext(ctx.industryId ?? null);
    const source = {
      source: ctx.industrySource === "tenant" ? "organization" : ctx.industrySource === "request" ? "personal_view" : ctx.industrySource ?? null,
      organizationIndustryId: ctx.organizationIndustryId ?? null,
      subVertical: ctx.subVertical ?? null,
    };
    if (!context.selected) {
      return {
        payload: { selected: false, ...source, message: "No industry has been set for this organization, and the user isn't viewing one. An admin can set it for everyone." },
        proof: { industry: { status: "not_measured", reason: "No industry set for the organization." } },
      };
    }
    const viewNote = ctx.industrySource === "request" ? " · personal view" : "";
    if (!context.pack) {
      return {
        payload: { selected: true, ...source, industryId: context.industryId, pack: false, message: "This industry has no industry pack yet, so there is no curated regulatory or ontology context." },
        proof: { industry: { status: "not_measured", reason: `No industry pack for ${context.industryId}.` } },
      };
    }
    return {
      payload: { ...context, ...source },
      artifact: { kind: "text", title: context.label, props: { lines: [context.description, `Ontology: ${context.ontology}`, `Regulatory frameworks: ${context.regulatoryFrameworks.join(", ")}`] } },
      proof: {
        industry: {
          status: "measured",
          summary: `${context.label} pack · ${context.regulatoryFrameworks.length} regulatory frameworks · ${context.policyPacks.length} policy packs${viewNote}`,
        },
      },
    };
  },
};
