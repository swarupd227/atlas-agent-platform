// Astra SDK — a code-native builder that compiles to an Astra Manifest v2
// (Initiative 01, P2). Define a team or flow in TypeScript, get a validated v2
// manifest out — the same format the export/import routes already speak, so
// `astra push` (a later CLI slice) is a thin wrapper over import-manifest.
//
// DELIBERATELY PURE: imports only shared/manifest-v2 (itself pure). Nothing
// runtime imports this yet — it exists to be unit-tested and, later, extracted
// into a standalone @astra/sdk npm package. Shipping it changes no behavior.
//
// Slug identity is derive-on-read (slugify of the name) per the settled
// decision; a builder may still pass an explicit slug when it wants one.

import {
  ASTRA_MANIFEST_API_VERSION,
  validateManifest,
  type AstraManifest,
  type TeamSpec,
  type FlowSpec,
  type ManifestTeamNode,
  type ManifestTeamEdge,
  type ManifestFlowNode,
  type ManifestFlowEdge,
  type ManifestStateField,
} from "./manifest-v2";

function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "untitled";
}

/** Thrown by build() when the assembled manifest fails structural validation —
 *  the SDK's "validate on compile" guarantee, so a bad graph never leaves the
 *  developer's machine. */
export class ManifestBuildError extends Error {
  constructor(public issues: ReturnType<typeof validateManifest>) {
    super(`Manifest failed validation:\n${issues.map((i) => `  - [${i.code}] ${i.message}`).join("\n")}`);
    this.name = "ManifestBuildError";
  }
}

// ---------------------------------------------------------------------------
//  Team builder
// ---------------------------------------------------------------------------
export interface TeamBuilderOpts { name: string; slug?: string; version?: number; }

export interface AgentNodeOpts {
  label: string;
  agent?: string;            // referenced agent slug
  teamAgent?: string;        // sub-flow: referenced team slug
  stateKey?: string;
  timeoutMs?: number;
  retryPolicy?: { maxAttempts?: number; backoffMs?: number[] };
  tools?: string[];          // tool ids/slugs
  knowledgeBase?: string;
  skill?: string;
  config?: unknown;
}
export interface GateNodeOpts { label: string; gateType: "approval" | "policy_check" | "manual_review"; policy?: string; }
export interface EdgeOpts {
  label?: string;
  evaluationMode?: "ai" | "deterministic" | "handoff";
  condition?: string;
  rule?: unknown;
  failureMode?: "retry" | "skip" | "escalate";
}

export class TeamBuilder {
  private nodes: ManifestTeamNode[] = [];
  private edges: ManifestTeamEdge[] = [];
  private stateSchema: Record<string, ManifestStateField> = {};
  constructor(private opts: TeamBuilderOpts) {}

  /** An LLM agent step. */
  agent(key: string, o: AgentNodeOpts): this {
    this.nodes.push({
      key, type: "internal_agent", label: o.label,
      agent: o.agent ?? null, teamAgent: o.teamAgent ?? null,
      stateKey: o.stateKey ?? null,
      timeoutMs: o.timeoutMs ?? null,
      retryPolicy: o.retryPolicy ?? null,
      toolIds: o.tools ?? [],
      knowledgeBase: o.knowledgeBase ?? null,
      skill: o.skill ?? null,
      config: o.config ?? null,
    });
    return this;
  }

  /** A human-in-the-loop / policy gate step. */
  gate(key: string, o: GateNodeOpts): this {
    this.nodes.push({ key, type: "edge_gate", label: o.label, gateType: o.gateType, policy: o.policy ?? null });
    return this;
  }

  /** Escape hatch for any node type the typed helpers don't cover yet. */
  node(n: { key: string; type: string; label: string } & Partial<ManifestTeamNode>): this {
    this.nodes.push({ ...n } as ManifestTeamNode);
    return this;
  }

  edge(from: string, to: string, o: EdgeOpts = {}): this {
    this.edges.push({
      from, to,
      label: o.label ?? null,
      evaluationMode: o.evaluationMode ?? null,
      condition: o.condition ?? null,
      rule: o.rule ?? null,
      failureMode: o.failureMode ?? null,
    });
    return this;
  }

  state(field: string, def: ManifestStateField): this {
    this.stateSchema[field] = def;
    return this;
  }

  build(): AstraManifest<TeamSpec> {
    const manifest: AstraManifest<TeamSpec> = {
      apiVersion: ASTRA_MANIFEST_API_VERSION,
      kind: "team",
      metadata: { name: this.opts.name, slug: this.opts.slug || slugify(this.opts.name), version: this.opts.version },
      spec: {
        ...(Object.keys(this.stateSchema).length > 0 ? { stateSchema: this.stateSchema } : {}),
        nodes: this.nodes,
        edges: this.edges,
      },
    };
    const issues = validateManifest(manifest);
    if (issues.length > 0) throw new ManifestBuildError(issues);
    return manifest;
  }
}

export function defineTeam(opts: TeamBuilderOpts | string): TeamBuilder {
  return new TeamBuilder(typeof opts === "string" ? { name: opts } : opts);
}

// ---------------------------------------------------------------------------
//  Flow builder (pre-automation process-flow graph)
// ---------------------------------------------------------------------------
export interface FlowBuilderOpts { name: string; slug?: string; version?: number; }
export interface FlowNodeOpts { description?: string; actor?: string; config?: unknown; }
export interface FlowEdgeOpts { label?: string; condition?: string; }

export class FlowBuilder {
  private nodes: ManifestFlowNode[] = [];
  private edges: ManifestFlowEdge[] = [];
  constructor(private opts: FlowBuilderOpts) {}

  node(key: string, type: string, label: string, o: FlowNodeOpts = {}): this {
    this.nodes.push({ key, type, label, description: o.description ?? null, actor: o.actor ?? null, config: o.config ?? null });
    return this;
  }
  edge(from: string, to: string, o: FlowEdgeOpts = {}): this {
    this.edges.push({ from, to, label: o.label ?? null, condition: o.condition ?? null });
    return this;
  }
  build(): AstraManifest<FlowSpec> {
    const manifest: AstraManifest<FlowSpec> = {
      apiVersion: ASTRA_MANIFEST_API_VERSION,
      kind: "flow",
      metadata: { name: this.opts.name, slug: this.opts.slug || slugify(this.opts.name), version: this.opts.version },
      spec: { nodes: this.nodes, edges: this.edges },
    };
    const issues = validateManifest(manifest);
    if (issues.length > 0) throw new ManifestBuildError(issues);
    return manifest;
  }
}

export function defineFlow(opts: FlowBuilderOpts | string): FlowBuilder {
  return new FlowBuilder(typeof opts === "string" ? { name: opts } : opts);
}
