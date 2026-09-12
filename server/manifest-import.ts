// Write path for importing Astra Manifest v2 team/flow manifests (Initiative 01,
// deferred slice). Dependency-injected so the full orchestration — including the
// node key -> new-id remap that edges must follow — unit-tests with fake storage
// and performs ZERO real writes. The import-manifest route wires real storage.
//
// CREATE-only for now: both functions create new rows and never mutate an
// existing team/flow, so importing can't corrupt live data. Refs (agent/policy/
// skill/kb slugs) are passed through as-is per the derive-on-read slug decision;
// a ref that doesn't resolve in the target org lands as a dangling ref exactly
// as a hand-built node would (cross-org resolution is the deferred slug work).

import { manifestToTeam, manifestToFlow, type AstraManifest, type TeamSpec, type FlowSpec } from "@shared/manifest-v2";

export interface TeamImportDeps {
  createAgent(input: Record<string, any>): Promise<{ id: string }>;
  createBlueprint(input: Record<string, any>): Promise<{ id: string }>;
  createNode(input: Record<string, any>): Promise<{ id: string }>;
  createEdge(input: Record<string, any>): Promise<{ id: string }>;
  updateAgent(id: string, patch: Record<string, any>): Promise<unknown>;
  createStateSchema(input: Record<string, any>): Promise<unknown>;
  orgId?: string;
}

export interface TeamImportResult { agentId: string; blueprintId: string; nodes: number; edges: number; droppedEdges: number; }

export async function importTeamManifest(m: AstraManifest<TeamSpec>, deps: TeamImportDeps): Promise<TeamImportResult> {
  const t = manifestToTeam(m);

  const teamAgent = await deps.createAgent({
    name: m.metadata.name,
    description: `Imported from Astra Manifest v2 (${m.metadata.slug})`,
    owner: "system",
    agentType: "team",
    riskTier: "MEDIUM",
    autonomyMode: "assisted",
    modelProvider: "anthropic",
    modelName: "claude-sonnet-4-5",
    organizationId: deps.orgId,
  });

  const blueprint = await deps.createBlueprint({
    name: `${m.metadata.name} - Team Blueprint`,
    description: `Imported from Astra Manifest v2`,
    agentId: teamAgent.id,
    status: "draft",
    blueprintJson: { importedFromManifest: true, apiVersion: m.apiVersion, slug: m.metadata.slug },
  });

  // Create nodes, recording manifest-key -> new DB id so edges can be remapped.
  const keyToId: Record<string, string> = {};
  for (const n of t.nodes as Array<Record<string, any>>) {
    const created = await deps.createNode({
      blueprintId: blueprint.id,
      nodeType: n.nodeType,
      label: n.label,
      refAgentId: n.refAgentId ?? null,
      refTeamAgentId: n.refTeamAgentId ?? null,
      refRemoteAgentId: n.refRemoteAgentId ?? null,
      refPolicyId: n.refPolicyId ?? null,
      refSkillId: n.refSkillId ?? null,
      refKnowledgeBaseId: n.refKnowledgeBaseId ?? null,
      refToolIds: Array.isArray(n.refToolIds) ? n.refToolIds : [],
      gateType: n.gateType ?? null,
      stateKey: n.stateKey ?? null,
      timeoutMs: n.timeoutMs ?? null,
      retryPolicy: n.retryPolicy ?? null,
      config: n.config ?? null,
      outputSchema: n.outputSchema ?? null,
      fallbackOutput: n.fallbackOutput ?? null,
      outputContractId: n.outputContractId ?? null,
      positionX: n.positionX ?? 0,
      positionY: n.positionY ?? 0,
    });
    keyToId[String(n.id)] = created.id;
  }

  let edges = 0, droppedEdges = 0;
  for (const e of t.edges as Array<Record<string, any>>) {
    const src = keyToId[String(e.sourceNodeId)];
    const tgt = keyToId[String(e.targetNodeId)];
    // Validation already guaranteed no dangling edges, but never write one:
    // a remap miss is skipped and counted, not silently pointed at nothing.
    if (!src || !tgt) { droppedEdges++; continue; }
    await deps.createEdge({
      blueprintId: blueprint.id,
      sourceNodeId: src,
      targetNodeId: tgt,
      label: e.label ?? null,
      condition: e.condition ?? null,
      rule: e.rule ?? null,
      evaluationMode: e.evaluationMode ?? null,
      failureMode: e.failureMode ?? null,
      slaTimeoutMs: e.slaTimeoutMs ?? null,
      contentPartTypes: Array.isArray(e.contentPartTypes) ? e.contentPartTypes : [],
      allowedMetadata: e.allowedMetadata ?? null,
      config: e.config ?? null,
    });
    edges++;
  }

  await deps.updateAgent(teamAgent.id, { blueprintId: blueprint.id });

  if (t.stateSchema?.fields && Object.keys(t.stateSchema.fields).length > 0) {
    await deps.createStateSchema({ teamAgentId: teamAgent.id, fields: t.stateSchema.fields, reducers: t.stateSchema.reducers });
  }

  return { agentId: teamAgent.id, blueprintId: blueprint.id, nodes: t.nodes.length, edges, droppedEdges };
}

export interface FlowImportDeps {
  createProcessFlow(input: Record<string, any>): Promise<{ id: string }>;
  orgId?: string;
}
export interface FlowImportResult { processFlowId: string; nodes: number; edges: number; }

export async function importFlowManifest(m: AstraManifest<FlowSpec>, deps: FlowImportDeps): Promise<FlowImportResult> {
  const f = manifestToFlow(m);
  const created = await deps.createProcessFlow({
    name: m.metadata.name,
    description: `Imported from Astra Manifest v2 (${m.metadata.slug})`,
    graph: { version: 2, name: m.metadata.name, nodes: f.nodes, edges: f.edges },
    organizationId: deps.orgId,
  });
  return { processFlowId: created.id, nodes: f.nodes.length, edges: f.edges.length };
}
