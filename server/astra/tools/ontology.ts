import { z } from "zod";
import { resolveAgentRef } from "./refs";
import type { AstraTool, AstraToolContext, ProofEnvelope, ToolRunResult } from "../types";

/**
 * Ontology & Graph studio pack.
 *
 * The ontology was doing real work in Cowork and was invisible in it: it names
 * the concepts a plan matched, tags every agent the build creates, decides
 * which regulations an eval suite probes, and blocks a production deployment on
 * tool alignment -- but Astra could not read a concept, say how much of the
 * vocabulary the organization actually uses, or explain why a deployment was
 * refused. This pack reads all of that.
 *
 * Read-only. Creating or editing a concept changes reference data shared by
 * every organization on that industry, which belongs on the Ontology page, not
 * in a chat turn; list_concepts says so when asked.
 */

const PACK = "ontology";

/** The vocabulary is per industry, so without one there is nothing to read. */
function industryOf(ctx: AstraToolContext): { industryId: string } | { refuse: string } {
  if (!ctx.industryId) {
    return { refuse: "No industry is set, so there is no vocabulary to read. An admin can set the organization's industry, or you can view one for yourself." };
  }
  return { industryId: ctx.industryId };
}

const refused = (message: string): ToolRunResult => ({ payload: { ok: false, error: message } });

export const listConceptsTool: AstraTool<{ query?: string; subVertical?: string }> = {
  name: "list_concepts",
  description:
    "Search the industry's ontology: the concepts, their categories, synonyms and how many regulations each carries. Use it to answer what a term means here, or to find the concept an agent should be tagged with. Reading only -- concepts are reference data shared across the industry and are edited on the Ontology page.",
  input: z.object({
    query: z.string().max(120).optional().describe("Match a label, synonym, category, tag or description."),
    subVertical: z.string().max(80).optional().describe("Only concepts that apply to this sub-vertical."),
  }),
  permission: "view_agents",
  pack: PACK,
  confirm: false,
  run: async (ctx, input) => {
    const ind = industryOf(ctx);
    if ("refuse" in ind) return refused(ind.refuse);
    const r = await ctx.services.findConcepts(ind.industryId, input.query, input.subVertical ?? ctx.subVertical ?? undefined);
    return {
      payload: {
        industryId: ind.industryId,
        total: r.total,
        matched: r.matched,
        shown: r.concepts.length,
        concepts: r.concepts,
        ...(r.matched === 0 ? { note: "Nothing in this industry's vocabulary matches that." } : {}),
      },
      artifact: { kind: "concepts", title: input.query ? `Concepts matching "${input.query}"` : "Ontology concepts", props: { ...r, industryId: ind.industryId, query: input.query ?? null }, fullViewHref: "/ontology" },
      proof: {
        industry: { status: "measured", summary: `${r.matched} of ${r.total} concepts in ${ind.industryId}` },
        context: { status: "measured", summary: "Read from the industry's ontology" },
      },
    };
  },
};

export const getConceptTool: AstraTool<{ concept: string }> = {
  name: "get_concept",
  description:
    "One ontology concept in full: what it means, its properties, what it relates to, the regulations linked to it, its sensitivity, and which of this organization's agents are tagged with it (including any waiting for revalidation).",
  input: z.object({ concept: z.string().min(1).describe("The concept's id, from list_concepts.") }),
  permission: "view_agents",
  pack: PACK,
  confirm: false,
  run: async (ctx, input) => {
    let detail: any;
    try {
      detail = await ctx.services.conceptDetail(ctx.orgId, input.concept);
    } catch (e) {
      return refused((e as Error).message);
    }
    const dangling = detail.relatedTo.filter((r: any) => r.dangling).length;
    return {
      payload: {
        ...detail,
        agentCount: detail.agents.length,
        ...(dangling ? { danglingRelationships: dangling } : {}),
      },
      artifact: { kind: "concept", title: detail.label, props: detail, fullViewHref: `/ontology?concept=${encodeURIComponent(detail.id)}` },
      proof: {
        industry: { status: "measured", summary: `${detail.category} · ${detail.regulations.length} linked ${detail.regulations.length === 1 ? "regulation" : "regulations"}` },
        compliance: detail.regulations.length
          ? { status: "measured", summary: `${detail.regulations.length} ${detail.regulations.length === 1 ? "regulation" : "regulations"} linked to this concept` }
          : { status: "not_measured", reason: "No regulation is linked to this concept." },
        context: { status: "measured", summary: `${detail.agents.length} of this organization's agents carry it` },
      },
    };
  },
};

export const ontologyCoverageTool: AstraTool<{ subVertical?: string }> = {
  name: "ontology_coverage",
  description:
    "How much of the industry's vocabulary this organization's agents actually use: how many concepts are carried by at least one agent, which are used by none, and how many agents carry any concept at all. Names the sub-verticals with the most unused concepts.",
  input: z.object({ subVertical: z.string().max(80).optional().describe("Only concepts for this sub-vertical.") }),
  permission: "view_agents",
  pack: PACK,
  confirm: false,
  run: async (ctx, input) => {
    const ind = industryOf(ctx);
    if ("refuse" in ind) return refused(ind.refuse);
    const c = await ctx.services.conceptCoverage(ctx.orgId, ind.industryId, input.subVertical ?? ctx.subVertical ?? undefined);
    const worst = (c.bySubVertical ?? []).slice(0, 3);
    return {
      payload: {
        industryId: c.industryId,
        subVertical: c.subVertical,
        totalConcepts: c.totalConcepts,
        usedCount: c.usedCount,
        unusedCount: c.unusedCount,
        agentsTagged: c.agentsTagged,
        agentsTotal: c.agentsTotal,
        unusedShown: c.unusedShown,
        unused: c.unused.map((u: any) => u.label),
        ...(worst.length ? { mostUnusedSubVerticals: worst } : {}),
        // The two halves are scoped differently and the answer should say so.
        basis: "Concepts are the industry's shared vocabulary; usage is this organization's own agents and their tags.",
      },
      artifact: { kind: "ontologyCoverage", title: `Ontology coverage — ${c.industryId}`, props: c, fullViewHref: "/ontology" },
      proof: {
        industry: { status: "measured", summary: `${c.usedCount} of ${c.totalConcepts} concepts carried by an agent` },
        context: { status: "measured", summary: `Counted over ${c.agentsTotal} ${c.agentsTotal === 1 ? "agent" : "agents"}, ${c.agentsTagged} with any tag` },
      },
    };
  },
};

export const agentAlignmentTool: AstraTool<{ agent: string }> = {
  name: "agent_ontology_alignment",
  description:
    "An agent's ontology tags, and the tool-parameter alignment that decides whether it can be deployed to production: which of its tools are below the 50% threshold, how many parameters matched, and which have no parameter matching recorded at all. Use it to explain a blocked production deployment.",
  input: z.object({ agent: z.string().min(1).describe("The agent's name or id.") }),
  permission: "view_agents",
  pack: PACK,
  confirm: false,
  run: async (ctx, input) => {
    const found = await resolveAgentRef(ctx, input.agent);
    if ("refuse" in found) return refused(found.refuse);
    let r: any;
    try {
      r = await ctx.services.agentAlignment(ctx.orgId, found.item.id);
    } catch (e) {
      return refused((e as Error).message);
    }

    const unrecorded = r.unmatchedBecauseNothingRecorded.length;
    const blocked = r.low.length > 0;
    return {
      payload: {
        agent: r.agent.name,
        agentId: r.agent.id,
        concepts: r.concepts.map((c: any) => c.label).filter(Boolean),
        needsRevalidation: r.needsRevalidation,
        ...(r.revalidationReason ? { revalidationReason: r.revalidationReason } : {}),
        threshold: "50% of a tool's parameters matched to concepts",
        toolsExamined: r.examined.length,
        toolsBelowThreshold: r.low.map((t: any) => ({ tool: t.toolName, connector: t.serverName, matched: t.matched, parameters: t.total, score: t.score })),
        ...(unrecorded
          ? { noParameterMatchingRecorded: `${unrecorded} of those ${unrecorded === 1 ? "tool has" : "tools have"} no parameter matches recorded at all, which the gate counts as 0%. Run parameter matching on the connector before reading it as misalignment.` }
          : {}),
        ...(r.hasBlueprint
          ? {}
          : { note: `"${r.agent.name}" has no blueprint, so the production gate examines nothing and passes it. That is not a measure of alignment.` }),
        ...(r.hasBlueprint && r.serversLinked === 0 ? { note: "No connector is linked to this agent, so there are no tool parameters to align." } : {}),
        productionGate: r.hasBlueprint ? (blocked ? "would block" : "would pass") : "examines nothing",
      },
      artifact: { kind: "ontologyAlignment", title: `${r.agent.name} — ontology alignment`, props: r, fullViewHref: `/agents/${r.agent.id}` },
      proof: {
        industry: r.concepts.length
          ? { status: "measured", summary: r.concepts.slice(0, 4).map((c: any) => c.label).filter(Boolean).join(" · ") }
          : { status: "not_measured", reason: "This agent carries no ontology tags." },
        compliance: r.hasBlueprint
          ? { status: "measured", summary: `${r.low.length} of ${r.examined.length} tools below the production threshold` }
          : { status: "not_measured", reason: "No blueprint, so the production gate examines no tools." },
      },
    };
  },
};

export const checkVocabularyTool: AstraTool<{ text: string }> = {
  name: "check_vocabulary",
  description:
    "Check a piece of text against the industry's vocabulary: which terms are concepts (or their synonyms), and which only resemble one. The resemblance is string similarity, not meaning, so report those as suggestions for the user to judge -- never as errors.",
  input: z.object({ text: z.string().min(3).max(8000).describe("The text to check: a prompt, a policy, a step description.") }),
  permission: "view_agents",
  pack: PACK,
  confirm: false,
  run: async (ctx, input) => {
    const ind = industryOf(ctx);
    if ("refuse" in ind) return refused(ind.refuse);
    const r = await ctx.services.vocabularyCheck(ind.industryId, input.text);
    if (r.conceptsChecked === 0) {
      return refused(`There is no vocabulary for ${ind.industryId} yet, so there is nothing to check this against.`);
    }
    const recognised = Array.from(new Set(r.validTerms.map((v: any) => v.conceptLabel)));
    return {
      payload: {
        industryId: r.industryId,
        conceptsChecked: r.conceptsChecked,
        phrasesChecked: r.totalTermsChecked,
        recognised,
        lookAlikes: r.mismatches.map((m: any) => ({ wrote: m.term, resembles: m.suggestedTerm, similarity: m.confidence })),
        basis: "Exact match on a concept label or synonym; the rest is Levenshtein string similarity, not a judgement about meaning.",
      },
      artifact: { kind: "vocabularyCheck", title: "Vocabulary check", props: { ...r, recognised }, fullViewHref: "/ontology" },
      proof: {
        industry: { status: "measured", summary: `${recognised.length} ${recognised.length === 1 ? "concept" : "concepts"} recognised in the text` },
        // The look-alikes are a heuristic; saying they are measured would be the lie.
        context: { status: "not_measured", reason: "Term suggestions are string similarity, not a semantic match" },
      } as Partial<ProofEnvelope>,
    };
  },
};

export const ONTOLOGY_TOOLS: AstraTool[] = [listConceptsTool, getConceptTool, ontologyCoverageTool, agentAlignmentTool, checkVocabularyTool] as AstraTool[];
