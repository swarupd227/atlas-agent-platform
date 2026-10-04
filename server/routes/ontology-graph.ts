/**
 * Reading the ontology as a graph, and bringing stored rows up to the
 * relationship shape in shared/ontology-relationships.ts.
 *
 * Separate from routes/skills.ts so the walk can be tested with a mocked
 * storage and nothing else; the skills router pulls in the agent runtime.
 */
import { Router } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { checkPermission } from "../permissions";
import {
  PREDICATES, PREDICATE_GROUPS, groupOf, inverseOf, readsAs, normalizeRelationship, systemsOfRecordFromTags, normalizeSystemsOfRecord,
  type OntologyRelationship,
} from "@shared/ontology-relationships";

const router = Router();

router.get("/api/ontology/relationship-vocabulary", (_req, res) => {
  res.json({
    groups: PREDICATE_GROUPS,
    predicates: Array.from(PREDICATES.values()),
  });
});

interface GraphNode { id: string; label: string; category: string; industryId: string; systemsOfRecord: unknown[] }
interface GraphEdge { from: string; to: string; predicate: string; group: string; reads: string; label?: string; cardinality?: string; inferred: boolean }

/**
 * The concept, its neighbours out to `depth` hops, and the edges between them.
 * Edges stored on the far side are reported from this side under their inverse
 * and marked `inferred`, so a concept that nobody linked FROM still shows what
 * links TO it.
 */
router.get("/api/ontology/concepts/:id/graph", async (req, res) => {
  try {
    const root = await storage.getOntologyConcept(req.params.id as string);
    if (!root) return res.status(404).json({ message: "Concept not found" });
    const depth = Math.max(1, Math.min(3, Number(req.query.depth) || 1));
    const all = await storage.getOntologyConcepts(root.industryId);
    const byId = new Map(all.map((c) => [c.id, c]));

    // Every edge in the industry, read in both directions, keyed by source.
    const outgoing = new Map<string, GraphEdge[]>();
    const push = (from: string, e: GraphEdge) => { const list = outgoing.get(from) ?? []; list.push(e); outgoing.set(from, list); };
    for (const c of all) {
      for (const raw of Array.isArray(c.relationships) ? (c.relationships as unknown[]) : []) {
        const r: OntologyRelationship | null = normalizeRelationship(raw);
        if (!r || !byId.has(r.targetId)) continue;
        push(c.id, { from: c.id, to: r.targetId, predicate: r.predicate, group: groupOf(r.predicate), reads: readsAs(r.predicate), label: r.label, cardinality: r.cardinality, inferred: false });
        const inv = r.inverse ?? inverseOf(r.predicate);
        if (inv) push(r.targetId, { from: r.targetId, to: c.id, predicate: inv, group: groupOf(inv), reads: readsAs(inv), inferred: true });
      }
    }

    const seen = new Set<string>([root.id]);
    const edges: GraphEdge[] = [];
    let frontier = [root.id];
    for (let hop = 0; hop < depth && frontier.length; hop++) {
      const next: string[] = [];
      for (const id of frontier) {
        for (const e of outgoing.get(id) ?? []) {
          edges.push(e);
          if (!seen.has(e.to)) { seen.add(e.to); next.push(e.to); }
        }
      }
      frontier = next;
    }
    const nodes: GraphNode[] = Array.from(seen).map((id) => byId.get(id)!).filter(Boolean).map((c) => ({
      id: c.id, label: c.label, category: c.category, industryId: c.industryId,
      systemsOfRecord: Array.isArray((c as { systemsOfRecord?: unknown }).systemsOfRecord) ? ((c as { systemsOfRecord: unknown[] }).systemsOfRecord) : [],
    }));
    // One row per (from, to, predicate); a stored edge wins over an inferred one.
    const uniq = new Map<string, GraphEdge>();
    for (const e of edges) { const k = `${e.from}|${e.to}|${e.predicate}`; const prev = uniq.get(k); if (!prev || (prev.inferred && !e.inferred)) uniq.set(k, e); }
    res.json({ root: root.id, depth, nodes, edges: Array.from(uniq.values()) });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * Bring an industry's stored rows up to the current shape: legacy `type`
 * values become predicates, label targets become ids where one concept has
 * that label, `sor:*` tags become systemsOfRecord. Dry run by default; `apply`
 * writes. Reports what it could not resolve rather than guessing.
 */
router.post("/api/ontology/migrate-relationships", checkPermission("create_modify_policies"), async (req, res) => {
  try {
    const body = z.object({ industryId: z.string().min(1), apply: z.boolean().optional() }).safeParse(req.body);
    if (!body.success) return res.status(400).json({ message: "Validation failed", errors: body.error.errors });
    const { industryId, apply } = body.data;
    const all = await storage.getOntologyConcepts(industryId);
    const ids = new Set(all.map((c) => c.id));
    const labelIndex = new Map<string, string[]>();
    for (const c of all) { const k = c.label.toLowerCase(); labelIndex.set(k, [...(labelIndex.get(k) ?? []), c.id]); }

    const report = { industryId, concepts: all.length, changed: 0, relationshipsNormalized: 0, targetsResolved: 0, systemsOfRecordSet: 0, unresolved: [] as string[], applied: !!apply };
    for (const c of all) {
      const before = JSON.stringify(c.relationships ?? []);
      const rels: OntologyRelationship[] = [];
      for (const raw of Array.isArray(c.relationships) ? (c.relationships as unknown[]) : []) {
        const r = normalizeRelationship(raw);
        if (!r) continue;
        if (!ids.has(r.targetId)) {
          const matches = labelIndex.get(r.targetId.toLowerCase()) ?? [];
          if (matches.length === 1) { r.targetId = matches[0]; report.targetsResolved++; }
          else { report.unresolved.push(`${c.label}: ${r.predicate} -> "${r.targetId}"${matches.length > 1 ? " (ambiguous label)" : ""}`); continue; }
        }
        rels.push(r);
      }
      const { systems, remainingTags } = systemsOfRecordFromTags(c.tags);
      const existingSor = normalizeSystemsOfRecord((c as { systemsOfRecord?: unknown }).systemsOfRecord);
      const mergedSor = existingSor.length ? existingSor : systems;
      const patch: Record<string, unknown> = {};
      if (JSON.stringify(rels) !== before) { patch.relationships = rels; report.relationshipsNormalized++; }
      if (systems.length && !existingSor.length) { patch.systemsOfRecord = mergedSor; patch.tags = remainingTags; report.systemsOfRecordSet++; }
      if (Object.keys(patch).length) {
        report.changed++;
        if (apply) await storage.updateOntologyConcept(c.id, patch as any);
      }
    }
    res.json(report);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
