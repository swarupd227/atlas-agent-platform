// Astra Manifest v2 — canonical, round-trippable serialization for the three
// authored shapes (single agent, team blueprint, process flow). See the design
// spec (Initiative 01). This module is DELIBERATELY PURE and self-contained: it
// imports nothing from the server, storage, or db, has no side effects, and is
// not yet wired into any route. It exists to be unit-tested in isolation (S1 +
// S2). Route wiring (export-manifest / import-manifest) is a separate later step
// (S3), so shipping this file changes no existing behavior.
//
// Design rules pinned by tests/manifest-v2.test.ts:
//  - Round-trip: toManifest(fromManifest(m)) is semantically equal to m, up to
//    cosmetics (canvas positions, timestamps, sourceId) normalized out.
//  - Refs are opaque strings the caller resolves (slug<->id) by injecting a
//    resolver; the default is identity, which is what the round-trip test uses.
//  - v1.0 agent-manifest upgrades in-reader to a v2 `kind: agent`.

export const ASTRA_MANIFEST_API_VERSION = "astra/v2" as const;

export type ManifestKind = "agent" | "team" | "flow";

export interface ManifestMetadata {
  name: string;
  /** Stable, org-unique round-trip identity. */
  slug: string;
  version?: number;
  /** Export-only source DB id; ignored by cross-env import and by equality. */
  sourceId?: string;
}

export interface AstraManifest<S = unknown> {
  apiVersion: typeof ASTRA_MANIFEST_API_VERSION;
  kind: ManifestKind;
  metadata: ManifestMetadata;
  spec: S;
}

// ---- kind: agent -----------------------------------------------------------
// Faithful carry of the fields the existing v1.0 manifest already round-trips.
// toolsConfig / permissionsConfig are preserved verbatim (opaque) for fidelity;
// prettifying them into a tools[] shape is deferred so round-trip stays exact.
export interface AgentSpec {
  description?: string | null;
  model?: { provider?: string | null; name?: string | null };
  riskTier?: string | null;
  autonomyMode?: string | null;
  systemPrompt?: string | null;
  toolsConfig?: unknown;
  permissionsConfig?: unknown;
  blueprintJson?: Record<string, unknown> | null;
  knowledgeBases?: Array<{ ref: string }>;
  skills?: Array<{ ref: string; required?: boolean }>;
  policies?: Array<{ ref: string; domain?: string; version?: number }>;
  contextProfile?: { ref: string; version?: number } | null;
  memoryProfile?: { ref: string; version?: number } | null;
  evalSuites?: Array<{ name: string; type?: string }>;
}

// ---- kind: team ------------------------------------------------------------
export interface ManifestTeamNode {
  key: string;              // stable within-flow id (DB team_blueprint_nodes.id)
  type: string;             // nodeType
  label: string;
  stateKey?: string | null;
  timeoutMs?: number | null;
  retryPolicy?: unknown;
  gateType?: string | null;
  config?: unknown;
  outputSchema?: unknown;
  fallbackOutput?: unknown;
  outputContractId?: string | null;
  toolIds?: string[];       // refToolIds
  agent?: string | null;          // refAgentId    -> slug
  teamAgent?: string | null;      // refTeamAgentId -> slug
  remoteAgent?: string | null;    // refRemoteAgentId -> slug
  policy?: string | null;         // refPolicyId   -> slug
  skill?: string | null;          // refSkillId    -> slug
  knowledgeBase?: string | null;  // refKnowledgeBaseId -> slug
  position?: { x: number; y: number };   // cosmetic; excluded from equality
}

export interface ManifestTeamEdge {
  from: string;             // node key (sourceNodeId)
  to: string;               // node key (targetNodeId)
  label?: string | null;
  evaluationMode?: string | null;   // ai | deterministic | handoff
  condition?: string | null;
  rule?: unknown;
  failureMode?: string | null;
  retryPolicy?: unknown;
  slaTimeoutMs?: number | null;
  contentPartTypes?: string[];
  allowedMetadata?: unknown;
  config?: unknown;
}

export interface ManifestStateField {
  type?: string;
  reducer?: string;
  writableBy?: string[];
}

export interface TeamSpec {
  stateSchema?: Record<string, ManifestStateField>;
  nodes: ManifestTeamNode[];
  edges: ManifestTeamEdge[];
}

// ---- kind: flow ------------------------------------------------------------
export interface ManifestFlowNode {
  key: string;
  type: string;
  label: string;
  description?: string | null;
  actor?: string | null;
  estimatedMins?: number | null;
  config?: unknown;
  position?: { x: number; y: number };   // cosmetic
}
export interface ManifestFlowEdge {
  from: string;
  to: string;
  label?: string | null;
  condition?: string | null;
}
export interface FlowSpec {
  nodes: ManifestFlowNode[];
  edges: ManifestFlowEdge[];
}

// ---- ref resolution --------------------------------------------------------
// A resolver maps a DB id to a portable slug (on export) or a slug back to a DB
// id (on import). The default is identity, which is what the round-trip test
// uses; real callers inject org-scoped lookups at the route layer (S3).
export type RefResolver = (idOrSlug: string) => string;
const identity: RefResolver = (x) => x;
const mapRef = (v: string | null | undefined, r: RefResolver): string | null | undefined =>
  (v === null || v === undefined) ? v : r(v);

// ===========================================================================
//  team  <->  manifest
// ===========================================================================
export interface TeamInput {
  blueprint: { name: string; slug?: string; version?: number; id?: string };
  nodes: Array<Record<string, any>>;   // team_blueprint_nodes rows
  edges: Array<Record<string, any>>;   // team_blueprint_edges rows
  stateSchema?: { fields?: Record<string, any>; reducers?: Record<string, any> } | null;
}

function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "untitled";
}

export function teamToManifest(input: TeamInput, refToSlug: RefResolver = identity): AstraManifest<TeamSpec> {
  const nodes: ManifestTeamNode[] = input.nodes.map((n) => {
    const node: ManifestTeamNode = {
      key: String(n.id),
      type: n.nodeType,
      label: n.label,
      stateKey: n.stateKey ?? null,
      timeoutMs: n.timeoutMs ?? null,
      retryPolicy: n.retryPolicy ?? null,
      gateType: n.gateType ?? null,
      config: n.config ?? null,
      outputSchema: n.outputSchema ?? null,
      fallbackOutput: n.fallbackOutput ?? null,
      outputContractId: n.outputContractId ?? null,
      toolIds: Array.isArray(n.refToolIds) ? [...n.refToolIds] : [],
      agent: mapRef(n.refAgentId, refToSlug) ?? null,
      teamAgent: mapRef(n.refTeamAgentId, refToSlug) ?? null,
      remoteAgent: mapRef(n.refRemoteAgentId, refToSlug) ?? null,
      policy: mapRef(n.refPolicyId, refToSlug) ?? null,
      skill: mapRef(n.refSkillId, refToSlug) ?? null,
      knowledgeBase: mapRef(n.refKnowledgeBaseId, refToSlug) ?? null,
      position: { x: n.positionX ?? 0, y: n.positionY ?? 0 },
    };
    return node;
  });
  const edges: ManifestTeamEdge[] = input.edges.map((e) => ({
    from: String(e.sourceNodeId),
    to: String(e.targetNodeId),
    label: e.label ?? null,
    evaluationMode: e.evaluationMode ?? null,
    condition: e.condition ?? null,
    rule: e.rule ?? null,
    failureMode: e.failureMode ?? null,
    retryPolicy: e.retryPolicy ?? null,
    slaTimeoutMs: e.slaTimeoutMs ?? null,
    contentPartTypes: Array.isArray(e.contentPartTypes) ? [...e.contentPartTypes] : [],
    allowedMetadata: e.allowedMetadata ?? null,
    config: e.config ?? null,
  }));

  let stateSchema: Record<string, ManifestStateField> | undefined;
  if (input.stateSchema && input.stateSchema.fields) {
    stateSchema = {};
    for (const [field, def] of Object.entries(input.stateSchema.fields)) {
      const d = (def || {}) as Record<string, any>;
      const writableRaw = d.writable_by ?? d.writableBy;
      stateSchema[field] = {
        type: d.type,
        reducer: d.reducer ?? input.stateSchema.reducers?.[field],
        writableBy: Array.isArray(writableRaw) ? writableRaw : (writableRaw ? [String(writableRaw)] : undefined),
      };
    }
  }

  return {
    apiVersion: ASTRA_MANIFEST_API_VERSION,
    kind: "team",
    metadata: {
      name: input.blueprint.name,
      slug: input.blueprint.slug || slugify(input.blueprint.name),
      version: input.blueprint.version,
      sourceId: input.blueprint.id,
    },
    spec: { ...(stateSchema ? { stateSchema } : {}), nodes, edges },
  };
}

export function manifestToTeam(m: AstraManifest<TeamSpec>, slugToId: RefResolver = identity): TeamInput {
  const nodes = m.spec.nodes.map((n) => ({
    id: n.key,
    nodeType: n.type,
    label: n.label,
    stateKey: n.stateKey ?? null,
    timeoutMs: n.timeoutMs ?? null,
    retryPolicy: n.retryPolicy ?? null,
    gateType: n.gateType ?? null,
    config: n.config ?? null,
    outputSchema: n.outputSchema ?? null,
    fallbackOutput: n.fallbackOutput ?? null,
    outputContractId: n.outputContractId ?? null,
    refToolIds: Array.isArray(n.toolIds) ? [...n.toolIds] : [],
    refAgentId: mapRef(n.agent, slugToId) ?? null,
    refTeamAgentId: mapRef(n.teamAgent, slugToId) ?? null,
    refRemoteAgentId: mapRef(n.remoteAgent, slugToId) ?? null,
    refPolicyId: mapRef(n.policy, slugToId) ?? null,
    refSkillId: mapRef(n.skill, slugToId) ?? null,
    refKnowledgeBaseId: mapRef(n.knowledgeBase, slugToId) ?? null,
    positionX: n.position?.x ?? 0,
    positionY: n.position?.y ?? 0,
  }));
  const edges = m.spec.edges.map((e) => ({
    sourceNodeId: mapRef(e.from, slugToId),
    targetNodeId: mapRef(e.to, slugToId),
    label: e.label ?? null,
    evaluationMode: e.evaluationMode ?? null,
    condition: e.condition ?? null,
    rule: e.rule ?? null,
    failureMode: e.failureMode ?? null,
    slaTimeoutMs: e.slaTimeoutMs ?? null,
    contentPartTypes: Array.isArray(e.contentPartTypes) ? [...e.contentPartTypes] : [],
    allowedMetadata: e.allowedMetadata ?? null,
    config: e.config ?? null,
  }));
  let stateSchema: TeamInput["stateSchema"] = null;
  if (m.spec.stateSchema) {
    const fields: Record<string, any> = {};
    const reducers: Record<string, any> = {};
    for (const [field, def] of Object.entries(m.spec.stateSchema)) {
      fields[field] = { type: def.type, writable_by: def.writableBy ?? ["*"], reducer: def.reducer ?? "last_wins" };
      reducers[field] = def.reducer ?? "last_wins";
    }
    stateSchema = { fields, reducers };
  }
  return {
    blueprint: { name: m.metadata.name, slug: m.metadata.slug, version: m.metadata.version, id: m.metadata.sourceId },
    nodes,
    edges,
    stateSchema,
  };
}

// ===========================================================================
//  flow  <->  manifest   (shared/process-flow.ts ProcessNode / ProcessEdge)
// ===========================================================================
export interface FlowInput {
  name: string;
  slug?: string;
  version?: number;
  id?: string;
  nodes: Array<Record<string, any>>;   // ProcessNode[]
  edges: Array<Record<string, any>>;   // ProcessEdge[]
}

export function flowToManifest(input: FlowInput): AstraManifest<FlowSpec> {
  return {
    apiVersion: ASTRA_MANIFEST_API_VERSION,
    kind: "flow",
    metadata: { name: input.name, slug: input.slug || slugify(input.name), version: input.version, sourceId: input.id },
    spec: {
      nodes: input.nodes.map((n) => ({
        key: String(n.id),
        type: n.type,
        label: n.label,
        description: n.description ?? null,
        actor: n.actor ?? null,
        estimatedMins: n.estimatedMins ?? null,
        config: n.config ?? null,
        position: n.position ? { x: n.position.x ?? 0, y: n.position.y ?? 0 } : { x: 0, y: 0 },
      })),
      edges: input.edges.map((e) => ({
        from: String(e.from),
        to: String(e.to),
        label: e.label ?? null,
        condition: e.condition ?? null,
      })),
    },
  };
}

export function manifestToFlow(m: AstraManifest<FlowSpec>): FlowInput {
  return {
    name: m.metadata.name,
    slug: m.metadata.slug,
    version: m.metadata.version,
    id: m.metadata.sourceId,
    nodes: m.spec.nodes.map((n) => ({
      id: n.key,
      type: n.type,
      label: n.label,
      description: n.description ?? null,
      actor: n.actor ?? null,
      estimatedMins: n.estimatedMins ?? null,
      config: n.config ?? null,
      position: n.position ? { x: n.position.x, y: n.position.y } : { x: 0, y: 0 },
    })),
    edges: m.spec.edges.map((e) => ({ id: `${e.from}-${e.to}`, from: e.from, to: e.to, label: e.label ?? null, condition: e.condition ?? null })),
  };
}

// ===========================================================================
//  v1.0 agent-manifest  ->  v2 (kind: agent)
// ===========================================================================
export function upgradeV1AgentManifest(v1: Record<string, any>): AstraManifest<AgentSpec> {
  const a = (v1.agent || {}) as Record<string, any>;
  const name = a.name || v1.name || "Untitled agent";
  return {
    apiVersion: ASTRA_MANIFEST_API_VERSION,
    kind: "agent",
    metadata: { name, slug: slugify(name), version: undefined, sourceId: v1.agentId },
    spec: {
      description: a.description ?? null,
      model: { provider: a.modelProvider ?? null, name: a.modelName ?? null },
      riskTier: a.riskTier ?? null,
      autonomyMode: a.autonomyMode ?? null,
      systemPrompt: a.systemPrompt ?? null,
      toolsConfig: a.toolsConfig ?? null,
      permissionsConfig: a.permissionsConfig ?? null,
      blueprintJson: v1.blueprint?.blueprintJson ?? null,
      policies: Array.isArray(v1.policies) ? v1.policies.map((p: any) => ({ ref: slugify(p.name || ""), domain: p.domain, version: p.version })) : undefined,
      evalSuites: Array.isArray(v1.evalSuites) ? v1.evalSuites.map((s: any) => ({ name: s.name, type: s.type })) : undefined,
      contextProfile: v1.contextProfile ? { ref: slugify(v1.contextProfile.name || ""), version: v1.contextProfile.version } : null,
      memoryProfile: v1.memoryProfile ? { ref: slugify(v1.memoryProfile.name || ""), version: v1.memoryProfile.version } : null,
    },
  };
}

export function isV1AgentManifest(x: any): boolean {
  return !!x && typeof x === "object" && x.manifestVersion === "1.0" && !x.apiVersion;
}

export function isV2Manifest(x: any): boolean {
  return !!x && typeof x === "object" && x.apiVersion === ASTRA_MANIFEST_API_VERSION;
}

/** Adapt a v2 `kind: agent` manifest into the v1.0 import shape the existing
 *  import-manifest route already consumes, so v2 agent import reuses the proven
 *  write path instead of a parallel one. Inverse of upgradeV1AgentManifest for
 *  the agent fields (refs come back as names). */
export function agentManifestToV1Shape(m: AstraManifest<AgentSpec>): Record<string, any> {
  const s = (m.spec || {}) as AgentSpec;
  return {
    manifestVersion: "1.0",
    agentVersion: m.metadata.version ? String(m.metadata.version) : "1.0.0",
    ...(m.metadata.sourceId ? { agentId: m.metadata.sourceId } : {}),
    agent: {
      name: m.metadata.name,
      description: s.description ?? null,
      modelProvider: s.model?.provider ?? null,
      modelName: s.model?.name ?? null,
      riskTier: s.riskTier ?? null,
      autonomyMode: s.autonomyMode ?? null,
      toolsConfig: s.toolsConfig ?? null,
      permissionsConfig: s.permissionsConfig ?? null,
      systemPrompt: s.systemPrompt ?? null,
    },
    blueprint: s.blueprintJson ? { name: m.metadata.name, blueprintJson: s.blueprintJson, version: m.metadata.version ?? 1 } : null,
    contextProfile: s.contextProfile ? { name: s.contextProfile.ref, version: s.contextProfile.version } : null,
    memoryProfile: s.memoryProfile ? { name: s.memoryProfile.ref, version: s.memoryProfile.version } : null,
    policies: Array.isArray(s.policies) ? s.policies.map((p) => ({ name: p.ref, domain: p.domain, version: p.version })) : [],
    evalSuites: Array.isArray(s.evalSuites) ? s.evalSuites : [],
  };
}

// ===========================================================================
//  equality normalization + validation
// ===========================================================================
/** Strip cosmetics (positions, sourceId) so round-trip equality tests compare
 *  logic, not layout. Returns a deep-cloned, normalized copy. */
export function normalizeForCompare<T extends AstraManifest<any>>(m: T): T {
  const c = JSON.parse(JSON.stringify(m)) as any;
  if (c.metadata) delete c.metadata.sourceId;
  const stripPos = (arr: any[] | undefined) => Array.isArray(arr) && arr.forEach((n) => { if (n) delete n.position; });
  if (c.spec) { stripPos(c.spec.nodes); }
  return c;
}

export interface ManifestIssue { code: string; message: string; nodeKey?: string; }

/** Structural validation, in the same refuse-don't-drop spirit as the process-
 *  flow compiler: bad apiVersion/kind, missing metadata, duplicate node keys,
 *  or an edge referencing a non-existent node are hard errors. */
export function validateManifest(m: any): ManifestIssue[] {
  const issues: ManifestIssue[] = [];
  if (!m || typeof m !== "object") return [{ code: "not_object", message: "Manifest is not an object." }];
  if (m.apiVersion !== ASTRA_MANIFEST_API_VERSION) issues.push({ code: "bad_api_version", message: `Expected apiVersion "${ASTRA_MANIFEST_API_VERSION}".` });
  if (!["agent", "team", "flow"].includes(m.kind)) issues.push({ code: "bad_kind", message: `Unknown kind "${m.kind}".` });
  if (!m.metadata?.name) issues.push({ code: "no_name", message: "metadata.name is required." });
  if (!m.metadata?.slug) issues.push({ code: "no_slug", message: "metadata.slug is required." });

  if (m.kind === "team" || m.kind === "flow") {
    const nodes: any[] = Array.isArray(m.spec?.nodes) ? m.spec.nodes : [];
    const keys = new Set<string>();
    for (const n of nodes) {
      if (!n.key) { issues.push({ code: "node_no_key", message: "A node is missing its key." }); continue; }
      if (keys.has(n.key)) issues.push({ code: "duplicate_key", message: `Duplicate node key "${n.key}".`, nodeKey: n.key });
      keys.add(n.key);
    }
    for (const e of (Array.isArray(m.spec?.edges) ? m.spec.edges : [])) {
      if (!keys.has(e.from)) issues.push({ code: "dangling_edge", message: `Edge references unknown node "${e.from}".` });
      if (!keys.has(e.to)) issues.push({ code: "dangling_edge", message: `Edge references unknown node "${e.to}".` });
    }
  }
  return issues;
}
