/**
 * assessTeamWiring (server/astra/wiring-assess.ts) and validateTeamGraph
 * (server/team-graph-validate.ts, moved from blueprint compile).
 */
import { describe, it, expect } from "vitest";
import { assessTeamWiring, type WiringSnapshot } from "../server/astra/wiring-assess";
import { validateTeamGraph } from "../server/team-graph-validate";

const node = (id: string, label: string, extra: Record<string, unknown> = {}) => ({ id, label, nodeType: "internal_agent", gateType: null, refAgentId: null, refTeamAgentId: null, config: {}, ...extra }) as any;
const edge = (from: string, to: string) => ({ id: `${from}-${to}`, sourceNodeId: from, targetNodeId: to }) as any;
const agent = (id: string, name: string, extra: Record<string, unknown> = {}) => ({ id, name, status: "active", agentType: "single", organizationId: "org-a", mcpToolBindings: [], policyBindings: [], ...extra });

function snapshot(over: Partial<WiringSnapshot> = {}): WiringSnapshot {
  return {
    orgId: "org-a",
    team: { id: "team", name: "Collections Team", riskTier: "MEDIUM", organizationId: "org-a", blueprintId: "bp" },
    blueprint: { id: "bp", organizationId: "org-a", status: "draft" },
    nodes: [node("n0", "Collections Team", { refAgentId: "team" }), node("n1", "Gather AR", { refAgentId: "a1" }), node("n2", "Manager Approval", { nodeType: "edge_gate", gateType: "approval" })],
    edges: [edge("n0", "n1"), edge("n1", "n2")],
    agents: [agent("team", "Collections Team", { agentType: "team" }), agent("a1", "Gather AR", { mcpToolBindings: [{ server: "Dealer Operations", tool: "get_open_ar" }] })],
    links: { a1: [{ serverId: "c1", name: "Dealer Operations", visible: true, connected: true, toolNames: ["get_open_ar"] }] },
    connectors: [{ id: "c1", name: "Dealer Operations", connected: true }],
    activePolicyIds: [],
    waves: { totalWaves: 3 },
    ...over,
  };
}

const codes = (s: WiringSnapshot, severity?: string) => assessTeamWiring(s).issues.filter((i) => !severity || i.severity === severity).map((i) => i.code);

describe("assessTeamWiring", () => {
  it("a well-wired team is ready, and notes where it pauses for a person", () => {
    const r = assessTeamWiring(snapshot());
    expect(r).toMatchObject({ ready: true, blockers: 0, warnings: 0, gates: 1, totalWaves: 3 });
    expect(r.issues.find((i) => i.code === "approval_gate")!.message).toContain("Manager Approval");
  });

  it("blocks a team with no blueprint, a loop, or a step whose agent is gone", () => {
    expect(codes(snapshot({ blueprint: null, team: { ...snapshot().team, blueprintId: null } }), "blocker")).toContain("team_blueprint_missing");
    expect(codes(snapshot({ waves: { cycleError: "cycle at n1" } }), "blocker")).toContain("graph_cycle");
    expect(codes(snapshot({ agents: [snapshot().agents[0]] }), "blocker")).toContain("node_ref_missing");
  });

  it("blocks agents from another organization and connectors that aren't usable or connected", () => {
    const s = snapshot();
    expect(codes({ ...s, agents: [s.agents[0], { ...s.agents[1], organizationId: "org-b" }] }, "blocker")).toContain("agent_other_org");
    expect(codes({ ...s, links: { a1: [{ ...s.links.a1[0], visible: false }] } }, "blocker")).toContain("connector_not_visible");
    expect(codes({ ...s, links: { a1: [{ ...s.links.a1[0], connected: false }] } }, "blocker")).toContain("connector_not_connected");
  });

  it("warns about missing tools, unlinked or unknown connectors, inactive policies and non-runnable agents", () => {
    const s = snapshot();
    const a1 = s.agents[1];
    expect(codes({ ...s, agents: [s.agents[0], { ...a1, mcpToolBindings: [{ server: "Dealer Operations", tool: "post_cash" }] }] }, "warning")).toEqual(["binding_tool_missing"]);
    expect(codes({ ...s, agents: [s.agents[0], { ...a1, mcpToolBindings: [{ server: "Oracle Fusion", tool: "x" }] }] }, "warning")).toEqual(["binding_server_unresolved"]);
    expect(codes({ ...s, links: { a1: [] } }, "warning")).toEqual(["binding_server_not_linked"]);
    expect(codes({ ...s, agents: [s.agents[0], { ...a1, policyBindings: [{ policyId: "p-gone", policyName: "Old rule" }] }] }, "warning")).toEqual(["policy_binding_inactive"]);
    expect(codes({ ...s, agents: [s.agents[0], { ...a1, status: "draft" }] }, "warning")).toEqual(["agent_not_runnable_status"]);
  });

  it("warns a high-risk team with no approval gate (the compile rule)", () => {
    const s = snapshot({ team: { ...snapshot().team, riskTier: "HIGH" } });
    expect(codes({ ...s, nodes: s.nodes.slice(0, 2), edges: s.edges.slice(0, 1) }, "warning")).toContain("graph_policy");
  });
});

describe("validateTeamGraph", () => {
  it("keeps the compile route's rules: missing references are errors, disconnected steps and untyped gates are warnings", () => {
    const r = validateTeamGraph(
      { riskTier: "LOW" },
      [node("a", "Step A"), node("b", "Gate", { nodeType: "edge_gate" }), node("c", "Lonely", { refAgentId: "x" })],
      [edge("a", "b"), edge("a", "ghost")],
    );
    expect(r.errors.map((e) => e.message)).toEqual(["Internal Agent node 'Step A' has no agent selected", "Edge references non-existent target node 'ghost'"]);
    expect(r.warnings.map((w) => w.message)).toEqual(["Edge Gate node 'Gate' has no gate type selected", "Node 'Lonely' is disconnected from the workflow"]);
  });
});
