import { describe, it, expect } from "vitest";
import {
  teamToManifest, manifestToTeam, flowToManifest, manifestToFlow,
  upgradeV1AgentManifest, isV1AgentManifest, isV2Manifest, agentManifestToV1Shape,
  normalizeForCompare, validateManifest,
  ASTRA_MANIFEST_API_VERSION,
  type TeamInput, type FlowInput,
} from "../shared/manifest-v2";

// S2 — the round-trip guarantee: toManifest(fromManifest(toManifest(x))) is
// semantically stable (identical up to cosmetics). With identity ref resolvers
// (the default), no DB is involved, so this runs pure and fast.

// A team that exercises every mapped column: an agent node, a gate node with a
// deterministic rule edge, a KB node, and a state schema.
const teamInput: TeamInput = {
  blueprint: { name: "Claims Intake & Triage", version: 3, id: "bp-1" },
  stateSchema: {
    fields: {
      paidAmount: { type: "number", writable_by: ["*"], reducer: "last_wins" },
      notes: { type: "array", writable_by: ["*"], reducer: "append" },
    },
    reducers: { paidAmount: "last_wins", notes: "append" },
  },
  nodes: [
    { id: "intake", nodeType: "internal_agent", label: "Claim Intake", refAgentId: "fnol-intake-agent", stateKey: "intake", timeoutMs: 30000, retryPolicy: { max_attempts: 2, backoff_ms: [1000, 2000] }, positionX: 0, positionY: 60, refToolIds: ["t1", "t2"] },
    { id: "kb", nodeType: "knowledge_base", label: "Return Policy", refKnowledgeBaseId: "return-policy-kb", stateKey: "policy_ctx", config: { kbQuery: "damaged goods" }, positionX: 280, positionY: 0 },
    { id: "gate", nodeType: "edge_gate", label: "Adjuster Approval", gateType: "approval", refPolicyId: "adjuster-authority", positionX: 560, positionY: 60 },
  ],
  edges: [
    { sourceNodeId: "intake", targetNodeId: "gate", evaluationMode: "deterministic", rule: { combinator: "AND", conditions: [{ field: "amount", operator: ">", value: 10000 }] }, failureMode: "escalate", contentPartTypes: ["text"] },
    { sourceNodeId: "kb", targetNodeId: "gate", evaluationMode: "ai", condition: "policy allows", failureMode: "skip" },
  ],
};

const flowInput: FlowInput = {
  name: "Returns & Refunds",
  version: 1,
  id: "flow-1",
  nodes: [
    { id: "t", type: "trigger", label: "Return requested", actor: "Customer", position: { x: 0, y: 0 } },
    { id: "d", type: "make_decision", label: "Within 30 days?", position: { x: 240, y: 0 } },
    { id: "e", type: "end", label: "Closed", position: { x: 480, y: 0 } },
  ],
  edges: [
    { id: "e1", from: "t", to: "d" },
    { id: "e2", from: "d", to: "e", label: "Yes", condition: "days <= 30" },
  ],
};

describe("Astra Manifest v2 — team round-trip", () => {
  it("produces a valid team manifest with every column mapped", () => {
    const m = teamToManifest(teamInput);
    expect(m.apiVersion).toBe(ASTRA_MANIFEST_API_VERSION);
    expect(m.kind).toBe("team");
    expect(m.metadata.slug).toBe("claims-intake-triage");
    expect(validateManifest(m)).toEqual([]);
    const gate = m.spec.nodes.find(n => n.key === "gate")!;
    expect(gate.gateType).toBe("approval");
    expect(gate.policy).toBe("adjuster-authority");
    expect(m.spec.stateSchema?.paidAmount).toEqual({ type: "number", reducer: "last_wins", writableBy: ["*"] });
  });

  it("is stable across a full export -> import -> export cycle (zero-diff)", () => {
    const once = teamToManifest(teamInput);
    const twice = teamToManifest(manifestToTeam(once));
    expect(normalizeForCompare(twice)).toEqual(normalizeForCompare(once));
  });

  it("preserves the deterministic rule and ref* fields through the round-trip", () => {
    const back = manifestToTeam(teamToManifest(teamInput));
    const intake = back.nodes.find(n => n.id === "intake")!;
    expect(intake.refAgentId).toBe("fnol-intake-agent");
    expect(intake.refToolIds).toEqual(["t1", "t2"]);
    const ruleEdge = back.edges.find(e => e.sourceNodeId === "intake")!;
    expect(ruleEdge.evaluationMode).toBe("deterministic");
    expect((ruleEdge.rule as any).conditions[0]).toEqual({ field: "amount", operator: ">", value: 10000 });
  });
});

describe("Astra Manifest v2 — flow round-trip", () => {
  it("is stable across export -> import -> export", () => {
    const once = flowToManifest(flowInput);
    expect(once.kind).toBe("flow");
    expect(validateManifest(once)).toEqual([]);
    const twice = flowToManifest(manifestToFlow(once));
    expect(normalizeForCompare(twice)).toEqual(normalizeForCompare(once));
  });

  it("keeps branch conditions on the edge", () => {
    const back = manifestToFlow(flowToManifest(flowInput));
    const branch = back.edges.find(e => e.to === "e")!;
    expect(branch.condition).toBe("days <= 30");
    expect(branch.label).toBe("Yes");
  });
});

describe("Astra Manifest v2 — v1.0 upgrade", () => {
  const v1 = {
    manifestVersion: "1.0",
    agentVersion: "1.0.0",
    agentId: "326ecfab",
    agent: { name: "Sales Analyst", description: "d", modelProvider: "anthropic", modelName: "claude-sonnet-4-5", riskTier: "MEDIUM", autonomyMode: "supervised", toolsConfig: [{ name: "sql" }], permissionsConfig: {}, systemPrompt: "hi" },
    blueprint: { name: "bp", blueprintJson: { steps: 3 }, version: 1 },
    policies: [{ name: "PII Redaction", domain: "privacy", version: 2 }],
    evalSuites: [{ name: "smoke", type: "regression" }],
  };

  it("detects a v1 manifest and upgrades it to a v2 kind:agent", () => {
    expect(isV1AgentManifest(v1)).toBe(true);
    const m = upgradeV1AgentManifest(v1);
    expect(m.apiVersion).toBe(ASTRA_MANIFEST_API_VERSION);
    expect(m.kind).toBe("agent");
    expect(m.metadata.slug).toBe("sales-analyst");
    expect(m.metadata.sourceId).toBe("326ecfab");
    expect(m.spec.model).toEqual({ provider: "anthropic", name: "claude-sonnet-4-5" });
    expect(m.spec.blueprintJson).toEqual({ steps: 3 });
    expect(m.spec.policies?.[0].ref).toBe("pii-redaction");
    expect(validateManifest(m)).toEqual([]);
  });

  it("does not mistake a v2 manifest for v1", () => {
    expect(isV1AgentManifest(teamToManifest(teamInput))).toBe(false);
  });
});

describe("Astra Manifest v2 — S3 route adapters", () => {
  const v1 = {
    manifestVersion: "1.0", agentVersion: "2.0.0", agentId: "abc",
    agent: { name: "Sales Analyst", description: "d", modelProvider: "anthropic", modelName: "claude-sonnet-4-5", riskTier: "HIGH", autonomyMode: "supervised", toolsConfig: [{ name: "sql" }], permissionsConfig: { x: 1 }, systemPrompt: "p" },
    blueprint: { name: "bp", blueprintJson: { a: 1 }, version: 2 },
  };

  it("isV2Manifest distinguishes v1 from v2", () => {
    expect(isV2Manifest(teamToManifest(teamInput))).toBe(true);
    expect(isV2Manifest(v1)).toBe(false);
  });

  it("v1 -> v2 -> v1-shape preserves the agent's core config (import path fidelity)", () => {
    const back = agentManifestToV1Shape(upgradeV1AgentManifest(v1));
    expect(back.manifestVersion).toBe("1.0");
    expect(back.agent.name).toBe("Sales Analyst");
    expect(back.agent.modelProvider).toBe("anthropic");
    expect(back.agent.modelName).toBe("claude-sonnet-4-5");
    expect(back.agent.riskTier).toBe("HIGH");
    expect(back.agent.toolsConfig).toEqual([{ name: "sql" }]);
    expect(back.agent.permissionsConfig).toEqual({ x: 1 });
    expect(back.blueprint.blueprintJson).toEqual({ a: 1 });
    // The adapted shape is exactly what the existing import route expects.
    expect(back.agent.name && back.manifestVersion).toBeTruthy();
  });
});

describe("Astra Manifest v2 — validation refuses malformed manifests", () => {
  it("flags a duplicate node key", () => {
    const m = teamToManifest(teamInput);
    m.spec.nodes.push({ ...m.spec.nodes[0] });
    expect(validateManifest(m).some(i => i.code === "duplicate_key")).toBe(true);
  });

  it("flags an edge to a non-existent node", () => {
    const m = teamToManifest(teamInput);
    m.spec.edges.push({ from: "intake", to: "ghost" });
    expect(validateManifest(m).some(i => i.code === "dangling_edge")).toBe(true);
  });

  it("flags a wrong apiVersion and missing slug", () => {
    const issues = validateManifest({ apiVersion: "astra/v1", kind: "team", metadata: { name: "x" }, spec: { nodes: [], edges: [] } });
    expect(issues.some(i => i.code === "bad_api_version")).toBe(true);
    expect(issues.some(i => i.code === "no_slug")).toBe(true);
  });
});
