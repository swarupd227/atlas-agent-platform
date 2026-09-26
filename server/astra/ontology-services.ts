/**
 * Astra services for the Ontology & Graph pack.
 *
 * The asymmetry here matters and is carried through to every payload: the
 * concepts are the platform's reference data for an industry -- shared, not the
 * tenant's -- while everything about usage (which agents carry a concept, what
 * a connector's parameters matched) is the caller's own organization. So
 * concepts are read by industry and agents are always read with the orgId.
 *
 * Nothing in this pack writes. Creating or editing a concept is the Ontology
 * page's job; it changes shared reference data that other organizations on the
 * same industry read, which is not something to do from a chat turn.
 */
import { storage } from "../storage";
import { assessToolAlignment } from "../ontology-alignment";
import { ontologyCoverage } from "../ontology-coverage";
import { checkVocabulary } from "@shared/ontology-vocabulary";

const conceptRow = (c: any) => ({
  id: c.id,
  label: c.label,
  category: c.category,
  description: c.description,
  synonyms: (c.synonyms ?? []) as string[],
  tags: (c.tags ?? []) as string[],
  subVerticals: (c.subVerticals ?? []) as string[],
  source: c.source,
  ontologyName: c.ontologyName,
  regulations: (Array.isArray(c.linkedRegulations) ? c.linkedRegulations : []).length,
  relationships: (Array.isArray(c.relationships) ? c.relationships : []).length,
});

/** Concepts in the industry's vocabulary, by label, synonym, category or tag. */
async function findConcepts(industryId: string, query?: string, subVertical?: string) {
  const concepts = await storage.getOntologyConcepts(industryId, subVertical);
  const needle = query?.trim().toLowerCase();
  const matched = !needle
    ? concepts
    : concepts.filter((c) =>
        c.label.toLowerCase().includes(needle) ||
        (c.category ?? "").toLowerCase().includes(needle) ||
        (c.description ?? "").toLowerCase().includes(needle) ||
        (c.synonyms ?? []).some((s: string) => s.toLowerCase().includes(needle)) ||
        (c.tags ?? []).some((t: string) => t.toLowerCase().includes(needle)),
      );
  return { total: concepts.length, matched: matched.length, concepts: matched.slice(0, 25).map(conceptRow) };
}

/**
 * One concept in full, with the caller's own agents that carry it. A concept's
 * relationships name other concepts by id; the ones that resolve within the
 * same industry are labelled, and the ones that don't are reported as dangling
 * rather than quietly dropped.
 */
async function conceptDetail(orgId: string, conceptId: string) {
  const concept = await storage.getOntologyConcept(conceptId);
  if (!concept) throw new Error("No ontology concept with that id.");
  const siblings = await storage.getOntologyConcepts(concept.industryId);
  const labelById = new Map(siblings.map((c) => [c.id, c.label]));
  const rels = (Array.isArray(concept.relationships) ? concept.relationships : []) as any[];
  const linked = await storage.getAgentsByOntologyConcept(conceptId, orgId).catch(() => []);
  const regulations = (Array.isArray(concept.linkedRegulations) ? concept.linkedRegulations : []) as any[];

  return {
    ...conceptRow(concept),
    industryId: concept.industryId,
    version: concept.version ?? 1,
    properties: (Array.isArray(concept.properties) ? concept.properties : []).map((p: any) => ({ name: p?.name ?? null, type: p?.type ?? null, required: !!p?.required })),
    relatedTo: rels.map((r) => ({
      type: r?.type ?? r?.relationship ?? null,
      targetId: r?.targetId ?? null,
      targetLabel: r?.targetId ? labelById.get(r.targetId) ?? null : null,
      dangling: !!r?.targetId && !labelById.has(r.targetId),
    })),
    regulations: regulations.map((r) => ({ ref: r?.ref ?? r?.id ?? r?.name ?? null, section: r?.section ?? null, description: r?.description ?? null })),
    sensitivity: concept.sensitivityClassification ?? null,
    // The organization's own agents, not every agent on the platform.
    agents: linked.map((a: any) => ({
      id: a.id,
      name: a.name,
      status: a.status,
      needsRevalidation: !!a.requiresRevalidation,
      revalidationReason: a.revalidationReason ?? null,
    })),
  };
}

/** How much of the industry's vocabulary the organization's agents actually carry. */
async function conceptCoverage(orgId: string, industryId: string, subVertical?: string) {
  const coverage = await ontologyCoverage(orgId, industryId, subVertical);
  return {
    ...coverage,
    // The unused list can be long; the tool shows a few and says how many.
    unused: coverage.unused.slice(0, 40),
    unusedShown: Math.min(coverage.unused.length, 40),
  };
}

/**
 * An agent's ontology tags, and the tool-parameter alignment the production
 * gate applies. Both halves are reported separately because they are different
 * things: the tags are what the agent is *about*, the alignment is whether its
 * connector parameters were matched to concepts.
 */
async function agentAlignment(orgId: string, agentId: string) {
  const agent = await storage.getAgent(agentId, orgId);
  if (!agent) throw new Error("No agent with that id in this organization.");
  // Two tag shapes exist in the data: {conceptId, conceptLabel} written by the
  // build and the audit helpers, and {label} alone written by older paths. Only
  // an id can be matched to a concept, so a label-only tag makes an agent look
  // tagged while counting towards nothing -- read both, and say which is which.
  const tags = (Array.isArray(agent.ontologyTags) ? agent.ontologyTags : []) as Array<{ conceptId?: string; conceptLabel?: string; label?: string; category?: string }>;
  const assessment = await assessToolAlignment(agent.id);
  return {
    agent: { id: agent.id, name: agent.name, status: agent.status, industryId: agent.industryId ?? null },
    concepts: tags.map((t) => ({
      id: t.conceptId ?? null,
      label: t.conceptLabel ?? t.label ?? null,
      category: t.category ?? null,
      linkedToAConcept: !!t.conceptId,
    })),
    needsRevalidation: !!(agent as any).requiresRevalidation,
    revalidationReason: (agent as any).revalidationReason ?? null,
    ...assessment,
  };
}

/** Terms in a piece of text that match the vocabulary, and terms that only resemble one. */
async function vocabularyCheck(industryId: string | null, text: string) {
  const concepts = industryId ? await storage.getOntologyConcepts(industryId) : await storage.getAllOntologyConcepts();
  return { conceptsChecked: concepts.length, industryId, ...checkVocabulary(concepts as any, text) };
}

export const ontologyServices = {
  findConcepts,
  conceptDetail,
  conceptCoverage,
  agentAlignment,
  vocabularyCheck,
};
