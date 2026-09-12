import { describe, it, expect } from "vitest";
import { importTeamManifest, importFlowManifest, type TeamImportDeps, type FlowImportDeps } from "../server/manifest-import";
import { defineTeam, defineFlow } from "../shared/astra-sdk";

// The v2 team/flow import write path, exercised with FAKE storage — records
// every create call and hands back synthetic ids, so the full orchestration
// (including the node-key -> new-id edge remap) is verified with zero real
// writes.

function fakeTeamDeps() {
  const calls = { agents: [] as any[], blueprints: [] as any[], nodes: [] as any[], edges: [] as any[], updates: [] as any[], schemas: [] as any[] };
  let n = 0;
  const deps: TeamImportDeps = {
    createAgent: async (i) => { calls.agents.push(i); return { id: "agent-1" }; },
    createBlueprint: async (i) => { calls.blueprints.push(i); return { id: "bp-1" }; },
    createNode: async (i) => { calls.nodes.push(i); return { id: `node-${++n}` }; }, // synthetic new ids
    createEdge: async (i) => { calls.edges.push(i); return { id: `edge-${calls.edges.length + 1}` }; },
    updateAgent: async (id, p) => { calls.updates.push({ id, p }); },
    createStateSchema: async (i) => { calls.schemas.push(i); },
    orgId: "org-1",
  };
  return { deps, calls };
}

const teamManifest = defineTeam({ name: "Claims Intake & Triage", version: 2 })
  .state("paidAmount", { type: "number", reducer: "last_wins", writableBy: ["*"] })
  .agent("intake", { label: "Claim Intake", agent: "fnol-intake-agent", stateKey: "intake", timeoutMs: 30000, retryPolicy: { maxAttempts: 2, backoffMs: [1000, 2000] } })
  .gate("gate", { label: "Adjuster Approval", gateType: "approval", policy: "adjuster-authority" })
  .edge("intake", "gate", { evaluationMode: "deterministic", rule: { combinator: "AND", conditions: [{ field: "amount", operator: ">", value: 10000 }] }, failureMode: "escalate" })
  .build();

describe("importTeamManifest (fake storage)", () => {
  it("creates the team agent, blueprint, nodes, edges, and state schema", async () => {
    const { deps, calls } = fakeTeamDeps();
    const r = await importTeamManifest(teamManifest, deps);
    expect(calls.agents).toHaveLength(1);
    expect(calls.agents[0]).toMatchObject({ agentType: "team", name: "Claims Intake & Triage", organizationId: "org-1" });
    expect(calls.blueprints[0]).toMatchObject({ agentId: "agent-1", status: "draft" });
    expect(calls.nodes).toHaveLength(2);
    expect(calls.edges).toHaveLength(1);
    expect(calls.schemas).toHaveLength(1);
    expect(r).toMatchObject({ agentId: "agent-1", blueprintId: "bp-1", nodes: 2, edges: 1, droppedEdges: 0 });
  });

  it("remaps edge endpoints from manifest keys to the newly created node ids", async () => {
    const { deps, calls } = fakeTeamDeps();
    await importTeamManifest(teamManifest, deps);
    // Nodes were created in order: intake -> node-1, gate -> node-2.
    expect(calls.nodes[0]).toMatchObject({ nodeType: "internal_agent", refAgentId: "fnol-intake-agent" });
    expect(calls.nodes[1]).toMatchObject({ nodeType: "edge_gate", gateType: "approval", refPolicyId: "adjuster-authority" });
    const edge = calls.edges[0];
    expect(edge.sourceNodeId).toBe("node-1");   // NOT the manifest key "intake"
    expect(edge.targetNodeId).toBe("node-2");   // NOT the manifest key "gate"
    expect(edge.evaluationMode).toBe("deterministic");
    expect(edge.rule.conditions[0]).toMatchObject({ field: "amount", operator: ">", value: 10000 });
  });

  it("links the blueprint back onto the team agent and carries the state schema", async () => {
    const { deps, calls } = fakeTeamDeps();
    await importTeamManifest(teamManifest, deps);
    expect(calls.updates[0]).toEqual({ id: "agent-1", p: { blueprintId: "bp-1" } });
    expect(calls.schemas[0].teamAgentId).toBe("agent-1");
    expect(calls.schemas[0].fields.paidAmount).toMatchObject({ type: "number", reducer: "last_wins" });
  });
});

describe("importFlowManifest (fake storage)", () => {
  it("creates a single process-flow record carrying the graph", async () => {
    const flow = defineFlow("Returns & Refunds")
      .node("t", "trigger", "Return requested")
      .node("d", "make_decision", "Within 30 days?")
      .node("e", "end", "Closed")
      .edge("t", "d")
      .edge("d", "e", { label: "Yes", condition: "days <= 30" })
      .build();
    const created: any[] = [];
    const deps: FlowImportDeps = { createProcessFlow: async (i) => { created.push(i); return { id: "pf-1" }; }, orgId: "org-1" };
    const r = await importFlowManifest(flow, deps);
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ name: "Returns & Refunds", organizationId: "org-1" });
    expect(created[0].graph.nodes).toHaveLength(3);
    expect(created[0].graph.edges.find((e: any) => e.to === "e")?.condition).toBe("days <= 30");
    expect(r).toEqual({ processFlowId: "pf-1", nodes: 3, edges: 2 });
  });
});
