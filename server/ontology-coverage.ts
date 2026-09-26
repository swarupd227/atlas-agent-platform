/**
 * How much of an industry's vocabulary the organization's agents actually use.
 *
 * Lifted out of GET /api/ontology/coverage so the page and Astra count the
 * same way. Note what the two halves are scoped by, because it is asymmetric
 * and worth stating wherever the figures are shown: the concepts are the
 * platform's for that industry (reference data, not the tenant's), while the
 * usage is the organization's own agents and their ontology tags.
 */
import { storage } from "./storage";

export interface CoverageConcept {
  id: string;
  label: string;
  category: string | null;
  subVerticals: string[];
}

export interface OntologyCoverage {
  industryId: string;
  subVertical: string | null;
  totalConcepts: number;
  usedCount: number;
  unusedCount: number;
  unused: CoverageConcept[];
  /** Only for the industry-wide view: a concept counts toward each sub-vertical it is tagged with. */
  bySubVertical?: Array<{ subVertical: string; total: number; unused: number }>;
  /** How many of the organization's agents carry any ontology tag at all. */
  agentsTagged: number;
  agentsTotal: number;
}

export async function ontologyCoverage(orgId: string | undefined, industryId: string, subVertical?: string): Promise<OntologyCoverage> {
  const concepts = await storage.getOntologyConcepts(industryId, subVertical);
  const allAgents = await storage.getAgents(orgId);

  const usedConceptIds = new Set<string>();
  let agentsTagged = 0;
  for (const a of allAgents) {
    const tags = Array.isArray(a.ontologyTags) ? (a.ontologyTags as Array<{ conceptId?: string }>) : [];
    if (tags.some((t) => t?.conceptId)) agentsTagged += 1;
    for (const t of tags) {
      if (t?.conceptId) usedConceptIds.add(t.conceptId);
    }
  }

  const unused: CoverageConcept[] = concepts
    .filter((c) => !usedConceptIds.has(c.id))
    .map((c) => ({ id: c.id, label: c.label, category: c.category, subVerticals: c.subVerticals || [] }));

  // Sub-vertical breakdown only makes sense on the unscoped (industry-wide)
  // view -- a concept counts toward every sub-vertical it's tagged with, and
  // industry-wide concepts (no subVerticals) count toward none.
  let bySubVertical: OntologyCoverage["bySubVertical"];
  if (!subVertical) {
    const counts = new Map<string, { total: number; unused: number }>();
    for (const c of concepts) {
      for (const sv of c.subVerticals || []) {
        const entry = counts.get(sv) || { total: 0, unused: 0 };
        entry.total += 1;
        if (!usedConceptIds.has(c.id)) entry.unused += 1;
        counts.set(sv, entry);
      }
    }
    bySubVertical = Array.from(counts.entries())
      .map(([sv, v]) => ({ subVertical: sv, total: v.total, unused: v.unused }))
      .sort((a, b) => b.unused / b.total - a.unused / a.total);
  }

  return {
    industryId,
    subVertical: subVertical || null,
    totalConcepts: concepts.length,
    usedCount: concepts.length - unused.length,
    unusedCount: unused.length,
    unused,
    bySubVertical,
    agentsTagged,
    agentsTotal: allAgents.length,
  };
}
