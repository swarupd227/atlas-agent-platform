/**
 * Agent ontology proposals.
 *
 * An agent that works in a domain notices a concept its organization's ontology does
 * not have, or a better description of one it has added. It never writes the
 * ontology. It PROPOSES a concept through the propose_ontology_concept tool, which
 * files an "ontology_proposal" approval; the concept exists only when a person
 * approves it, and then ONLY IN THE PROPOSING AGENT'S ORGANIZATION.
 *
 * That last part is the design. Ontology concepts were shared by every organization in
 * an industry and are embedded in every agent's prompts, so an agent in one customer
 * writing to them would write into another customer's agents. A concept an agent
 * proposes is therefore an organization-private row (ontology_concepts.organization_id),
 * and the storage reads show another organization nothing but platform-wide concepts.
 * Its source is "custom-extension", which the Ontology page already shows as an
 * organization's own concept, and it carries the tag "agent-proposed".
 *
 * Until a person approves, nothing is stored in ontology_concepts at all: the table has
 * no status column and every reader would show a pending row. The proposed concept
 * lives in ontology_proposals; approval creates the row (add) or changes it (revise,
 * refused if the concept changed since the agent proposed it).
 *
 * What an agent cannot do here, by construction: touch a platform-wide concept (a
 * revision reaches only the organization's own), name a link target that is not an
 * existing concept (a relationship is resolved against the concepts it may see), use a
 * relationship predicate outside the vocabulary, reuse a name or synonym a concept
 * already has (the refusal names the concept, so the agent learns the vocabulary), or
 * file into another organization (the org comes from the agent).
 *
 * The rules (limits, scanning, shape) are pure and tested alone. The proposal and
 * decision flows take small dependencies so they run without a database.
 */

import { createHash, randomUUID } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import { ontologyProposals, type OntologyProposal } from "@shared/schema";
import { PREDICATES, normalizeRelationship, isKnownPredicate, readsAs, type OntologyRelationship } from "@shared/ontology-relationships";
import { db } from "./db";
import { storage } from "./storage";
import { getDefaultOrgId } from "./auth";
import { scanUntrustedText, shortId, type ScanResult } from "./agent-memory";
import { similarity } from "./text-similarity";
import { ONTOLOGY_PROPOSALS_SETTING, PROPOSE_ONTOLOGY_TOOL, BUILTIN_ONTOLOGY_PROPOSAL_SERVER_ID } from "./ontology-proposal-constants";

export { ONTOLOGY_PROPOSALS_SETTING, PROPOSE_ONTOLOGY_TOOL, BUILTIN_ONTOLOGY_PROPOSAL_SERVER_ID };

export const ONTOLOGY_PROPOSAL_LIMITS = {
  minLabelChars: 3,
  maxLabelChars: 80,
  minDescriptionChars: 20,
  maxDescriptionChars: 1000,
  maxCategoryChars: 60,
  maxProperties: 20,
  maxPropertyDescriptionChars: 200,
  maxRelationships: 10,
  maxSynonyms: 10,
  maxTags: 10,
  maxTermChars: 60,
  maxReasonChars: 300,
  /** Proposals waiting for a person, per agent. Stops an agent flooding the approvals queue. */
  maxPending: 10,
  /** Concepts one organization may add to one industry's ontology. */
  maxOrgConceptsPerIndustry: 300,
  /** Concepts shown to the reviewer as the nearest existing ones. */
  similarShown: 3,
  similarityFloor: 0.5,
} as const;

/** The source the Ontology page already treats as an organization's own concept. */
export const CUSTOM_CONCEPT_SOURCE = "custom-extension";
/** Marks a concept an agent proposed (and a person approved), so its origin stays visible on the concept. */
export const AGENT_PROPOSED_TAG = "agent-proposed";
export const withProvenanceTag = (tags: string[] | undefined): string[] => Array.from(new Set([...(tags ?? []), AGENT_PROPOSED_TAG]));

export const PROPERTY_TYPES =["string", "decimal", "integer", "boolean", "date", "enum"] as const;
const LABEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 _.&()/\-']*$/;
const PROPERTY_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]{1,59}$/;

// ── Pure rules ──────────────────────────────────────────────────────────────

export const normalizeLabel = (text: unknown): string => String(text ?? "").replace(/\s+/g, " ").trim();
const key = (text: unknown): string => normalizeLabel(text).toLowerCase();
const clean = (text: unknown): string => String(text ?? "").replace(/\s+/g, " ").trim();

export interface ConceptProperty { name: string; type: (typeof PROPERTY_TYPES)[number]; description?: string }

/** The fields of a proposed concept after normalisation. */
export interface ConceptDraft {
  label?: string;
  category?: string;
  description?: string;
  properties?: ConceptProperty[];
  relationships?: Array<{ predicate: string; target: string; label?: string; cardinality?: "one" | "many" }>;
  synonyms?: string[];
  tags?: string[];
}

export interface VisibleConcept { id: string; label: string; category?: string; description?: string; synonyms?: string[] | null; tags?: string[] | null; properties?: unknown; relationships?: unknown; version?: number | null; organizationId?: string | null; industryId?: string }

export const contentHash = (industryId: string, d: ConceptDraft): string =>
  createHash("sha256").update(JSON.stringify({
    i: industryId, l: key(d.label), c: key(d.category), d: clean(d.description),
    p: (d.properties ?? []).map((p) => [key(p.name), p.type, clean(p.description)]),
    r: (d.relationships ?? []).map((r) => [r.predicate, key(r.target), r.cardinality ?? ""]),
    s: (d.synonyms ?? []).map(key).sort(), t: (d.tags ?? []).map(key).sort(),
  })).digest("hex");

/** Every text field of a draft, labelled, for the scan. */
function textFields(d: ConceptDraft): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  if (d.label) out.push(["the label", d.label]);
  if (d.category) out.push(["the category", d.category]);
  if (d.description) out.push(["the description", d.description]);
  for (const p of d.properties ?? []) { out.push([`the property "${p.name}"`, p.name]); if (p.description) out.push([`the description of the property "${p.name}"`, p.description]); }
  for (const r of d.relationships ?? []) { out.push(["a relationship target", r.target]); if (r.label) out.push(["a relationship label", r.label]); }
  for (const s of d.synonyms ?? []) out.push(["a synonym", s]);
  for (const t of d.tags ?? []) out.push(["a tag", t]);
  return out;
}

/** Whether a draft may be proposed at all. A refusal says why, so the agent can fix it. */
export function scanConceptDraft(d: ConceptDraft, opts: { requireAll: boolean }): ScanResult {
  const L = ONTOLOGY_PROPOSAL_LIMITS;
  if (opts.requireAll || d.label !== undefined) {
    const label = normalizeLabel(d.label);
    if (label.length < L.minLabelChars || label.length > L.maxLabelChars) return { ok: false, reason: `the label must be ${L.minLabelChars}-${L.maxLabelChars} characters` };
    if (!LABEL_PATTERN.test(label)) return { ok: false, reason: "the label may only use letters, numbers, spaces and . _ & ( ) / - '" };
  }
  if (opts.requireAll || d.category !== undefined) {
    const category = clean(d.category);
    if (!category) return { ok: false, reason: "a category is required, such as the kind of thing the concept is" };
    if (category.length > L.maxCategoryChars) return { ok: false, reason: `the category is ${category.length} characters; at most ${L.maxCategoryChars}` };
  }
  if (opts.requireAll || d.description !== undefined) {
    const description = clean(d.description);
    if (description.length < L.minDescriptionChars) return { ok: false, reason: `the description is too short to define anything (at least ${L.minDescriptionChars} characters)` };
    if (description.length > L.maxDescriptionChars) return { ok: false, reason: `the description is ${description.length} characters; at most ${L.maxDescriptionChars}` };
  }
  if ((d.properties?.length ?? 0) > L.maxProperties) return { ok: false, reason: `at most ${L.maxProperties} properties` };
  const seenProps = new Set<string>();
  for (const p of d.properties ?? []) {
    if (!PROPERTY_NAME_PATTERN.test(p.name)) return { ok: false, reason: `the property name "${p.name}" must be a plain identifier (letters, digits, underscore)` };
    if (!(PROPERTY_TYPES as readonly string[]).includes(p.type)) return { ok: false, reason: `the property "${p.name}" has type "${p.type}"; use one of ${PROPERTY_TYPES.join(", ")}` };
    if ((p.description ?? "").length > L.maxPropertyDescriptionChars) return { ok: false, reason: `the description of the property "${p.name}" is too long (at most ${L.maxPropertyDescriptionChars})` };
    if (seenProps.has(key(p.name))) return { ok: false, reason: `the property "${p.name}" is listed twice` };
    seenProps.add(key(p.name));
  }
  if ((d.relationships?.length ?? 0) > L.maxRelationships) return { ok: false, reason: `at most ${L.maxRelationships} relationships` };
  for (const r of d.relationships ?? []) {
    if (!isKnownPredicate(r.predicate)) return { ok: false, reason: `the relationship predicate "${r.predicate}" is not in the vocabulary (${Array.from(PREDICATES.keys()).join(", ")})` };
  }
  for (const [what, list] of [["synonyms", d.synonyms], ["tags", d.tags]] as const) {
    const max = what === "synonyms" ? L.maxSynonyms : L.maxTags;
    if ((list?.length ?? 0) > max) return { ok: false, reason: `at most ${max} ${what}` };
    for (const t of list ?? []) if (clean(t).length < 2 || clean(t).length > L.maxTermChars) return { ok: false, reason: `a ${what === "synonyms" ? "synonym" : "tag"} must be 2-${L.maxTermChars} characters` };
  }
  // A definition may not carry a link: it is read into prompts and shown as the organization's own vocabulary.
  for (const [what, text] of textFields(d)) {
    const scan = scanUntrustedText(text, { allowLinks: false });
    if (!scan.ok) return { ok: false, reason: `${what}: ${scan.reason}` };
  }
  return { ok: true };
}

/** The concepts a draft most resembles, nearest first, so a reviewer can see what it might duplicate. */
export function nearestConcepts(draft: ConceptDraft, visible: VisibleConcept[], org: string, n: number = ONTOLOGY_PROPOSAL_LIMITS.similarShown): Array<{ id: string; label: string; scope: "platform" | "your organization"; similarity: number }> {
  const probe = `${draft.label ?? ""} ${draft.description ?? ""}`;
  return visible
    .map((c) => ({ id: c.id, label: c.label, scope: (c.organizationId === org ? "your organization" : "platform") as "platform" | "your organization", similarity: Math.round(Math.max(similarity(draft.label ?? "", c.label), similarity(probe, `${c.label} ${c.description ?? ""}`)) * 100) / 100 }))
    .filter((c) => c.similarity >= ONTOLOGY_PROPOSAL_LIMITS.similarityFloor)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, n);
}

/** A name or synonym of a visible concept that this draft would reuse, if any. */
export function vocabularyClash(draft: ConceptDraft, visible: VisibleConcept[], ignoreId?: string): { term: string; concept: VisibleConcept } | undefined {
  const mine = [draft.label, ...(draft.synonyms ?? [])].filter(Boolean).map(key);
  for (const c of visible) {
    if (c.id === ignoreId) continue;
    const theirs = new Set([key(c.label), ...((c.synonyms ?? []) as string[]).map(key)]);
    for (const t of mine) if (theirs.has(t)) return { term: t, concept: c };
  }
  return undefined;
}

// ── Dependencies ────────────────────────────────────────────────────────────

export interface OntologyProposalStore {
  list(orgId: string, agentId: string, statuses: string[]): Promise<OntologyProposal[]>;
  get(orgId: string, id: string): Promise<OntologyProposal | undefined>;
  insert(row: Omit<OntologyProposal, "id" | "createdAt" | "updatedAt">): Promise<OntologyProposal>;
  update(orgId: string, id: string, patch: Partial<OntologyProposal>): Promise<void>;
  remove(orgId: string, id: string): Promise<void>;
  removeAllForAgent(orgId: string, agentId: string): Promise<number>;
}

export interface ConceptOps {
  /** Platform-wide concepts plus this organization's own, for one industry. */
  visible(orgId: string, industryId: string): Promise<VisibleConcept[]>;
  get(orgId: string, id: string): Promise<VisibleConcept | undefined>;
  create(row: Record<string, unknown>): Promise<VisibleConcept>;
  update(orgId: string, id: string, patch: Record<string, unknown>): Promise<void>;
}

export interface OntologyProposalDeps {
  store: OntologyProposalStore;
  concepts: ConceptOps;
  getAgent(agentId: string, orgId?: string | null): Promise<{ id: string; name: string; organizationId?: string | null; industryId?: string | null } | undefined>;
  /** The industry the agent works in, or null when none is known. */
  industryOf(agent: { id: string; organizationId?: string | null; industryId?: string | null }): Promise<string | null>;
  createApproval(a: Record<string, unknown>): Promise<{ id: string }>;
  audit(e: { orgId: string; action: string; objectId: string; actorType: string; actorId: string; details: Record<string, unknown> }): Promise<void>;
}

const orgOf = (orgId?: string | null): string | null => orgId || getDefaultOrgId() || null;

export const dbOntologyProposalStore: OntologyProposalStore = {
  async list(orgId, agentId, statuses) {
    if (statuses.length === 0) return [];
    return db.select().from(ontologyProposals)
      .where(and(eq(ontologyProposals.organizationId, orgId), eq(ontologyProposals.agentId, agentId), inArray(ontologyProposals.status, statuses)))
      .orderBy(asc(ontologyProposals.createdAt));
  },
  async get(orgId, id) {
    const [row] = await db.select().from(ontologyProposals).where(and(eq(ontologyProposals.id, id), eq(ontologyProposals.organizationId, orgId))).limit(1);
    return row;
  },
  async insert(row) {
    const [created] = await db.insert(ontologyProposals).values(row as any).returning();
    return created;
  },
  async update(orgId, id, patch) {
    await db.update(ontologyProposals).set({ ...patch, updatedAt: new Date() } as any)
      .where(and(eq(ontologyProposals.id, id), eq(ontologyProposals.organizationId, orgId)));
  },
  async remove(orgId, id) {
    await db.delete(ontologyProposals).where(and(eq(ontologyProposals.id, id), eq(ontologyProposals.organizationId, orgId)));
  },
  async removeAllForAgent(orgId, agentId) {
    const gone = await db.delete(ontologyProposals).where(and(eq(ontologyProposals.organizationId, orgId), eq(ontologyProposals.agentId, agentId))).returning({ id: ontologyProposals.id });
    return gone.length;
  },
};

export const dbConceptOps: ConceptOps = {
  async visible(orgId, industryId) {
    return (await storage.getOntologyConcepts(industryId, undefined, orgId)) as VisibleConcept[];
  },
  async get(orgId, id) {
    return (await storage.getOntologyConcept(id, orgId)) as VisibleConcept | undefined;
  },
  async create(row) {
    return (await storage.createOntologyConcept(row as any)) as VisibleConcept;
  },
  async update(orgId, id, patch) {
    await storage.updateOntologyConcept(id, patch as any, orgId);
  },
};

export const defaultOntologyProposalDeps: OntologyProposalDeps = {
  store: dbOntologyProposalStore,
  concepts: dbConceptOps,
  getAgent: (agentId, orgId) => storage.getAgent(agentId, orgId ?? undefined) as any,
  industryOf: async (agent) => {
    const { resolveAgentIndustry } = await import("./agent-industry");
    return resolveAgentIndustry(agent, null);
  },
  createApproval: (a) => storage.createApproval(a as any) as any,
  // Ids and hashes only: an audit chain is signed and permanent, and a concept's text may need to be erased.
  audit: async (e) => {
    await storage.createAuditEvent({
      organizationId: e.orgId,
      actorType: e.actorType,
      actorId: e.actorId,
      action: e.action,
      objectType: "ontology_proposal",
      objectId: e.objectId,
      details: JSON.stringify(e.details),
    } as any);
  },
};

// ── Switching it on ─────────────────────────────────────────────────────────

export type OntologyGateReason = "on" | "agent-not-opted-in" | "flag-off" | "flag-unreadable";

/** On when the platform flag is on AND this agent has opted in (runtimeConfig.agentOntologyProposals.enabled). */
export async function ontologyProposalGate(runtimeConfig: Record<string, any> | null | undefined): Promise<{ enabled: boolean; reason: OntologyGateReason; flagValue?: string; error?: string }> {
  if (runtimeConfig?.agentOntologyProposals?.enabled !== true) return { enabled: false, reason: "agent-not-opted-in" };
  try {
    const row = await (storage as { getPlatformSetting?: (k: string) => Promise<{ value?: string | null } | undefined> }).getPlatformSetting?.(ONTOLOGY_PROPOSALS_SETTING);
    const flagValue = String(row?.value ?? "").trim().toLowerCase();
    return flagValue === "on" ? { enabled: true, reason: "on", flagValue } : { enabled: false, reason: "flag-off", flagValue };
  } catch (err: any) {
    return { enabled: false, reason: "flag-unreadable", error: String(err?.message ?? err).slice(0, 200) };
  }
}

export async function isOntologyProposalEnabled(runtimeConfig: Record<string, any> | null | undefined): Promise<boolean> {
  return (await ontologyProposalGate(runtimeConfig)).enabled;
}

// ── Proposing ───────────────────────────────────────────────────────────────

export interface ProposeConceptInput {
  orgId?: string | null;
  agentId: string;
  action: "create" | "revise";
  /** Revise only: the id (or a unique prefix of 6+ characters) of one of the organization's own concepts. */
  conceptId?: string;
  draft: ConceptDraft;
  reason?: string;
  runId?: string | null;
}

export type ProposeConceptResult =
  | { ok: true; status: "pending_approval"; proposalId: string; approvalId: string; message: string }
  | { ok: false; error: string; concepts?: Array<{ id: string; label: string }> };

/** Resolves a full id or a unique prefix of 6+ characters among these concepts. */
function findConceptRef(concepts: VisibleConcept[], ref: string | undefined): VisibleConcept | undefined {
  const r = String(ref ?? "").trim().replace(/^\[|\]$/g, "");
  if (r.length < 6) return undefined;
  const hits = concepts.filter((c) => c.id === r || c.id.startsWith(r));
  return hits.length === 1 ? hits[0] : undefined;
}

/** What the reviewer is shown for each relationship: where it points, in words. */
function describeRelationships(rels: OntologyRelationship[], visible: VisibleConcept[]) {
  const byId = new Map(visible.map((c) => [c.id, c]));
  return rels.map((r) => ({ predicate: r.predicate, reads: readsAs(r.predicate), targetId: r.targetId, targetLabel: byId.get(r.targetId)?.label ?? "(unknown)", ...(r.cardinality ? { cardinality: r.cardinality } : {}) }));
}

/** Resolves a draft's relationship targets, by label or id, against the concepts the organization can see. */
function resolveRelationships(draft: ConceptDraft, visible: VisibleConcept[], selfId?: string): { ok: true; relationships: OntologyRelationship[] } | { ok: false; error: string } {
  const byId = new Map(visible.map((c) => [c.id, c]));
  const byLabel = new Map<string, VisibleConcept[]>();
  for (const c of visible) for (const t of [c.label, ...((c.synonyms ?? []) as string[])]) { const k = key(t); byLabel.set(k, [...(byLabel.get(k) ?? []), c]); }
  const out: OntologyRelationship[] = [];
  for (const r of draft.relationships ?? []) {
    const target = byId.get(r.target) ?? (() => { const hits = byLabel.get(key(r.target)) ?? []; return new Set(hits.map((h) => h.id)).size === 1 ? hits[0] : undefined; })();
    if (!target) return { ok: false, error: `the relationship (${r.predicate}) points at "${r.target}", which is not a concept you can link to (name an existing concept exactly)` };
    if (target.id === selfId) return { ok: false, error: "a concept cannot be related to itself" };
    const rel = normalizeRelationship({ predicate: r.predicate, targetId: target.id, label: r.label, cardinality: r.cardinality });
    if (rel) out.push(rel);
  }
  return { ok: true, relationships: out };
}

export async function proposeOntologyConcept(input: ProposeConceptInput, deps: OntologyProposalDeps = defaultOntologyProposalDeps): Promise<ProposeConceptResult> {
  const L = ONTOLOGY_PROPOSAL_LIMITS;
  if (input.action !== "create" && input.action !== "revise") return { ok: false, error: 'action must be "create" or "revise".' };
  if (!input.agentId) return { ok: false, error: "No agent context to propose a concept for." };

  // The organization comes from the agent, not from the caller: a concept can only be proposed into the org that owns the agent.
  const agent = await deps.getAgent(input.agentId, input.orgId);
  const org = agent?.organizationId ?? orgOf(input.orgId);
  if (!agent || !org) return { ok: false, error: "This agent was not found." };

  const create = input.action === "create";
  const reason = clean(input.reason).slice(0, L.maxReasonChars);
  const draft: ConceptDraft = {
    ...(input.draft.label !== undefined ? { label: normalizeLabel(input.draft.label) } : {}),
    ...(input.draft.category !== undefined ? { category: clean(input.draft.category) } : {}),
    ...(input.draft.description !== undefined ? { description: clean(input.draft.description) } : {}),
    ...(input.draft.properties !== undefined ? { properties: input.draft.properties.map((p) => ({ name: clean(p.name), type: p.type, ...(p.description ? { description: clean(p.description) } : {}) })) } : {}),
    ...(input.draft.relationships !== undefined ? { relationships: input.draft.relationships } : {}),
    ...(input.draft.synonyms !== undefined ? { synonyms: Array.from(new Set(input.draft.synonyms.map(clean).filter(Boolean))) } : {}),
    ...(input.draft.tags !== undefined ? { tags: Array.from(new Set(input.draft.tags.map(clean).filter(Boolean))) } : {}),
  };

  const industryId = (await deps.industryOf(agent)) ?? "cross_industry";
  const visible = await deps.concepts.visible(org, industryId);
  const own = visible.filter((c) => c.organizationId === org);

  let target: VisibleConcept | undefined;
  if (!create) {
    target = findConceptRef(own, input.conceptId);
    if (!target) return { ok: false, error: "No concept of your organization matches that id. Only a concept your organization added can be revised; these are the ones you can.", concepts: own.map((c) => ({ id: shortId(c.id), label: c.label })) };
    if (draft.label !== undefined && key(draft.label) !== key(target.label)) return { ok: false, error: "A concept's label cannot be changed by a revision; propose a new concept instead." };
    delete draft.label;
    if (draft.category === undefined && draft.description === undefined && draft.properties === undefined && draft.relationships === undefined && draft.synonyms === undefined && draft.tags === undefined) return { ok: false, error: "Nothing to change: give at least one field to revise." };
  }

  const scan = scanConceptDraft(create ? draft : { ...draft, label: undefined }, { requireAll: create });
  if (!scan.ok) return { ok: false, error: `This concept was not proposed: ${scan.reason}.` };

  const pending = await deps.store.list(org, agent.id, ["pending"]);
  if (pending.length >= L.maxPending) return { ok: false, error: `${pending.length} proposals are already waiting for a person to decide. Wait for them before proposing more.` };
  if (create && own.length >= L.maxOrgConceptsPerIndustry) return { ok: false, error: `Your organization already has ${own.length} concepts of its own in this industry (the limit is ${L.maxOrgConceptsPerIndustry}).` };

  // The vocabulary is shared: a name or synonym an existing concept already has cannot be used again, and the refusal says which concept has it.
  const clash = vocabularyClash(create ? draft : { synonyms: draft.synonyms }, visible, target?.id);
  if (clash) return { ok: false, error: `"${clash.term}" is already a name or synonym of the concept "${clash.concept.label}" (${clash.concept.organizationId ? "your organization's" : "a platform"} concept). Use that concept${create ? ", or choose a different name" : ""}.` };

  let relationships: OntologyRelationship[] | undefined;
  if (draft.relationships !== undefined) {
    const resolved = resolveRelationships(draft, visible, target?.id);
    if (!resolved.ok) return { ok: false, error: `This concept was not proposed: ${resolved.error}.` };
    relationships = resolved.relationships;
  }

  const hash = contentHash(industryId, { ...draft, ...(create ? {} : { label: target!.label }) });
  if (pending.some((p) => p.contentHash === hash)) return { ok: false, error: "That concept is already waiting for a person to decide." };
  if (create && pending.some((p) => p.kind === "add" && key(p.label) === key(draft.label))) return { ok: false, error: "A concept with that name is already waiting for a person to decide." };
  if (!create && pending.some((p) => p.conceptId === target!.id)) return { ok: false, error: "A change to that concept is already waiting for a person to decide." };

  const conceptId = create ? randomUUID() : target!.id;
  const label = create ? draft.label! : target!.label;
  const payload = {
    ...(draft.category !== undefined ? { category: draft.category } : {}),
    ...(draft.description !== undefined ? { description: draft.description } : {}),
    ...(draft.properties !== undefined ? { properties: draft.properties } : {}),
    ...(relationships !== undefined ? { relationships } : {}),
    ...(draft.synonyms !== undefined ? { synonyms: draft.synonyms } : {}),
    ...(draft.tags !== undefined ? { tags: draft.tags } : {}),
  };
  const row = await deps.store.insert({
    organizationId: org, agentId: agent.id, kind: create ? "add" : "revise", conceptId, baseVersion: target?.version ?? null,
    label, industryId, payload, contentHash: hash, status: "pending", reason: reason || null, runId: input.runId ?? null,
    approvalId: null, decidedBy: null, decidedAt: null,
  });

  let approval: { id: string };
  try {
    approval = await deps.createApproval({
      organizationId: org,
      type: "ontology_proposal",
      objectType: "agent_ontology_proposal",
      objectId: row.id,
      objectName: label.slice(0, 80),
      status: "pending",
      requestedBy: agent.id,
      requesterType: "agent",
      agentId: agent.id,
      riskScore: 0.3,
      description: `${agent.name} proposes ${create ? "a new concept" : "a change to a concept"} for your organization's ontology: ${label}.`,
      recommendedAction: "Approve only if the definition is accurate, the name is the one your organization uses, and nothing in it reads as an instruction. It becomes part of the vocabulary your agents work from.",
      evidenceJson: {
        kind: create ? "add" : "revise",
        agentName: agent.name,
        label,
        industryId,
        category: payload.category ?? target?.category ?? null,
        description: payload.description ?? null,
        properties: payload.properties ?? null,
        relationships: relationships ? describeRelationships(relationships, visible) : null,
        synonyms: payload.synonyms ?? null,
        tags: payload.tags ?? null,
        current: create ? null : { category: target!.category ?? null, description: target!.description ?? null, synonyms: target!.synonyms ?? [], tags: target!.tags ?? [], properties: target!.properties ?? [], relationships: describeRelationships((Array.isArray(target!.relationships) ? target!.relationships : []) as OntologyRelationship[], visible) },
        similar: create ? nearestConcepts({ label, description: payload.description }, visible, org) : [],
        baseVersion: target?.version ?? null,
        reason: reason || null,
        runId: input.runId ?? null,
        proposedBy: "agent",
        effect: create
          ? "On approval the concept is added to YOUR organization's ontology only: your agents and screens see it, no other organization does."
          : "On approval the concept your organization added is changed; the previous version is kept in its history.",
      },
    });
  } catch (err: any) {
    await deps.store.remove(org, row.id).catch(() => {});
    return { ok: false, error: `The request could not be filed: ${err?.message ?? "approval failed"}.` };
  }
  await deps.store.update(org, row.id, { approvalId: approval.id });
  await deps.audit({ orgId: org, action: "ontology_proposal.proposed", objectId: row.id, actorType: "agent", actorId: agent.id, details: { kind: row.kind, agentId: agent.id, conceptId, industryId, approvalId: approval.id, contentHash: hash, runId: input.runId ?? null } }).catch(() => {});
  return { ok: true, status: "pending_approval", proposalId: shortId(row.id), approvalId: approval.id, message: "Proposed. A person must approve it before it is part of your organization's ontology; do not rely on it in this run." };
}

// ── Deciding ────────────────────────────────────────────────────────────────

export type OntologyDecisionResult = { applied: boolean; reason?: string };

/**
 * What a person's decision on an ontology_proposal approval does. Safe to call twice:
 * a proposal that is no longer pending is left alone. Everything is re-checked against
 * the ontology as it is NOW, because the agent proposed against the ontology as it was.
 */
export async function applyOntologyDecision(
  input: { orgId?: string | null; proposalId: string; decision: "approved" | "rejected"; decidedBy: string },
  deps: OntologyProposalDeps = defaultOntologyProposalDeps,
): Promise<OntologyDecisionResult> {
  const org = orgOf(input.orgId);
  if (!org) return { applied: false, reason: "no organization" };
  const row = await deps.store.get(org, input.proposalId);
  if (!row) return { applied: false, reason: "no such proposal" };
  if (row.status !== "pending") return { applied: false, reason: `already ${row.status}` };
  const now = new Date();
  const decide = { decidedBy: input.decidedBy, decidedAt: now };
  const audit = (action: string, extra: Record<string, unknown> = {}) =>
    deps.audit({ orgId: org, action, objectId: row.id, actorType: "user", actorId: input.decidedBy, details: { kind: row.kind, agentId: row.agentId, conceptId: row.conceptId, industryId: row.industryId, contentHash: row.contentHash, approvalId: row.approvalId, ...extra } }).catch(() => {});
  const stale = async (why: string): Promise<OntologyDecisionResult> => {
    await deps.store.update(org, row.id, { status: "stale", ...decide });
    await audit("ontology_proposal.rejected", { why });
    return { applied: false, reason: why };
  };

  if (input.decision === "rejected") {
    await deps.store.update(org, row.id, { status: "rejected", ...decide });
    await audit("ontology_proposal.rejected");
    return { applied: true };
  }

  const payload = (row.payload ?? {}) as { category?: string; description?: string; properties?: ConceptProperty[]; relationships?: OntologyRelationship[]; synonyms?: string[]; tags?: string[] };
  const visible = await deps.concepts.visible(org, row.industryId);
  const own = visible.filter((c) => c.organizationId === org);
  const visibleIds = new Set(visible.map((c) => c.id));
  // A link target that has gone since the agent proposed makes the proposal stale rather than a dangling edge.
  if ((payload.relationships ?? []).some((r) => !visibleIds.has(r.targetId))) return stale("a concept it links to no longer exists");

  if (row.kind === "add") {
    const clash = vocabularyClash({ label: row.label, synonyms: payload.synonyms }, visible, row.conceptId);
    if (clash) return stale(`"${clash.term}" has since become a name or synonym of "${clash.concept.label}"`);
    if (own.length >= ONTOLOGY_PROPOSAL_LIMITS.maxOrgConceptsPerIndustry) return stale("your organization is at its limit of concepts for this industry");
    await deps.concepts.create({
      id: row.conceptId, organizationId: org, industryId: row.industryId, ontologyName: "Organization ontology", label: row.label,
      category: payload.category ?? "Concept", description: payload.description ?? row.label,
      properties: payload.properties ?? [], relationships: payload.relationships ?? [], tags: withProvenanceTag(payload.tags), synonyms: payload.synonyms ?? [],
      // "custom-extension" is what the Ontology page already shows as an organization's own concept (badge, filter, count).
      source: CUSTOM_CONCEPT_SOURCE, version: 1, versionHistory: [],
    });
    await deps.store.update(org, row.id, { status: "approved", ...decide });
    await audit("ontology_proposal.approved");
    return { applied: true };
  }

  // A revision: refused if the concept is gone, is not the organization's own, or has changed since the agent proposed.
  const target = own.find((c) => c.id === row.conceptId);
  if (!target) return stale("the concept no longer exists");
  if ((target.version ?? 1) !== row.baseVersion) return stale("the concept changed since this was proposed");
  const clash = vocabularyClash({ synonyms: payload.synonyms }, visible, target.id);
  if (clash) return stale(`"${clash.term}" has since become a name or synonym of "${clash.concept.label}"`);
  const previous = { version: target.version ?? 1, category: target.category, description: target.description, properties: target.properties, relationships: target.relationships, synonyms: target.synonyms, tags: target.tags, changedAt: now.toISOString(), changedBy: input.decidedBy };
  const history = Array.isArray((target as { versionHistory?: unknown }).versionHistory) ? ((target as { versionHistory?: unknown[] }).versionHistory as unknown[]) : [];
  await deps.concepts.update(org, target.id, {
    ...(payload.category !== undefined ? { category: payload.category } : {}),
    ...(payload.description !== undefined ? { description: payload.description } : {}),
    ...(payload.properties !== undefined ? { properties: payload.properties } : {}),
    ...(payload.relationships !== undefined ? { relationships: payload.relationships } : {}),
    ...(payload.synonyms !== undefined ? { synonyms: payload.synonyms } : {}),
    ...(payload.tags !== undefined ? { tags: withProvenanceTag(payload.tags) } : {}),
    version: (target.version ?? 1) + 1,
    versionHistory: [...history, previous],
  });
  await deps.store.update(org, row.id, { status: "approved", ...decide });
  await audit("ontology_proposal.approved", { fromVersion: target.version ?? 1, toVersion: (target.version ?? 1) + 1 });
  return { applied: true };
}

// ── Reading and erasing ─────────────────────────────────────────────────────

/** Erasure: an agent's undecided proposals go with it. Concepts a person approved are the organization's now and stay. */
export async function deleteAgentOntologyProposals(orgId: string | null | undefined, agentId: string, store: OntologyProposalStore = dbOntologyProposalStore): Promise<number> {
  const org = orgOf(orgId);
  return org ? store.removeAllForAgent(org, agentId) : 0;
}

/** For the agent page: proposals waiting, and the recently decided ones. */
export async function ontologyProposalOverview(orgId: string | null | undefined, agentId: string, store: OntologyProposalStore = dbOntologyProposalStore) {
  const org = orgOf(orgId);
  if (!org) return { pending: [], recent: [], limits: ONTOLOGY_PROPOSAL_LIMITS };
  const rows = await store.list(org, agentId, ["pending", "approved", "rejected", "stale"]);
  // The payload is the proposed concept's text; the page lists proposals by name and reviewers read the approval.
  const brief = (p: OntologyProposal) => ({ id: p.id, kind: p.kind, conceptId: p.conceptId, label: p.label, industryId: p.industryId, status: p.status, reason: p.reason, approvalId: p.approvalId, decidedBy: p.decidedBy, decidedAt: p.decidedAt, createdAt: p.createdAt, runId: p.runId });
  return {
    pending: rows.filter((p) => p.status === "pending").map(brief),
    recent: rows.filter((p) => p.status !== "pending").slice(-20).reverse().map(brief),
    limits: ONTOLOGY_PROPOSAL_LIMITS,
  };
}
