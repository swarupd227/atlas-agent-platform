/**
 * buildTeamFromProposal (server/team-build.ts): what a team build creates,
 * against an in-memory storage. Moved out of POST
 * /api/ai/create-team-from-proposals, so these also pin that route's behaviour.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({
  agents: [] as any[],
  blueprints: [] as any[],
  nodes: [] as any[],
  edges: [] as any[],
  links: [] as any[],
  members: [] as any[],
  suites: [] as any[],
  outcomes: [] as any[],
  outcomeUpdates: [] as any[],
  policies: [] as any[],
  outcomePolicies: [] as any[],
  servers: [] as any[],
  connections: [] as any[],
  agentUpdates: [] as any[],
  seq: 0,
}));

vi.mock("../server/storage", () => {
  const id = (p: string) => `${p}-${++state.seq}`;
  return {
    storage: {
      getOutcome: vi.fn(async (outcomeId: string, orgId?: string) =>
        state.outcomes.find((o) => o.id === outcomeId && (!orgId || o.organizationId === orgId))),
      getMcpServers: vi.fn(async () => state.servers),
      getSkills: vi.fn(async () => []),
      getPolicies: vi.fn(async () => state.policies),
      getPoliciesByScope: vi.fn(async () => state.outcomePolicies),
      getOntologyConcepts: vi.fn(async () => []),
      getKnowledgeBases: vi.fn(async () => []),
      listIntegrationConnections: vi.fn(async () => state.connections),
      createAgent: vi.fn(async (a: any) => {
        const row = { id: id("agent"), organizationId: a.organizationId ?? "default-org", policyBindings: [], ...a };
        state.agents.push(row);
        return row;
      }),
      updateAgent: vi.fn(async (agentId: string, data: any, orgId?: string) => {
        state.agentUpdates.push({ agentId, data, orgId });
        return { id: agentId, ...data };
      }),
      upsertAgentMandate: vi.fn(async () => ({})),
      getAgentMcpServerByIds: vi.fn(async (agentId: string, serverId: string) => state.links.find((l) => l.agentId === agentId && l.serverId === serverId)),
      createAgentMcpServer: vi.fn(async (l: any) => { state.links.push(l); return l; }),
      createAgentTeamMember: vi.fn(async (m: any) => { state.members.push(m); return m; }),
      createAgentKnowledgeBase: vi.fn(async (k: any) => k),
      createBlueprint: vi.fn(async (b: any) => {
        const owner = state.agents.find((a) => a.id === b.agentId);
        const row = { id: id("bp"), organizationId: b.organizationId ?? owner?.organizationId, ...b };
        state.blueprints.push(row);
        return row;
      }),
      createTeamBlueprintNode: vi.fn(async (n: any) => { const row = { id: id("node"), ...n }; state.nodes.push(row); return row; }),
      createTeamBlueprintEdge: vi.fn(async (e: any) => { const row = { id: id("edge"), ...e }; state.edges.push(row); return row; }),
      updateOutcome: vi.fn(async (outcomeId: string, data: any, orgId?: string) => { state.outcomeUpdates.push({ outcomeId, data, orgId }); return {}; }),
      createEvalSuite: vi.fn(async (s: any) => { const row = { id: id("suite"), ...s }; state.suites.push(row); return row; }),
      updateEvalSuite: vi.fn(async () => ({})),
    },
  };
});

vi.mock("../server/routes/helpers", () => ({
  generateOntologyEvalCases: vi.fn(async () => ({ count: 0 })),
}));

vi.mock("../server/auth", () => ({ getDefaultOrgId: () => "default-org" }));

import { buildTeamFromProposal, teamBuildBodySchema, TeamBuildNotFoundError } from "../server/team-build";
import { computeWaves } from "../server/dag-execution-engine";

const worker = (name: string, extra: Record<string, unknown> = {}) => ({ name, description: `${name} does its step`, ...extra });

function reset() {
  for (const key of Object.keys(state) as Array<keyof typeof state>) {
    if (Array.isArray(state[key])) (state[key] as any[]).length = 0;
  }
  state.seq = 0;
}

const nodeLabel = (nodeId: string) => state.nodes.find((n) => n.id === nodeId)?.label;
const edgePairs = () => state.edges.map((e) => `${nodeLabel(e.sourceNodeId)} -> ${nodeLabel(e.targetNodeId)}`);

beforeEach(reset);

describe("buildTeamFromProposal", () => {
  it("builds a sequential team: orchestrator, workers in order, a blueprint and eval suites", async () => {
    const body = teamBuildBodySchema.parse({
      orchestrator: worker("AR Orchestrator"),
      workers: [worker("Gather AR"), worker("Decide Action"), worker("Notify Customer")],
      pipeline: { pattern: "sequential" },
    });
    const result = await buildTeamFromProposal(body, { orgId: "org-a" });

    expect(result.teamAgent).toMatchObject({ name: "AR Orchestrator", agentType: "team" });
    expect(result.workers.map((w: any) => w.name)).toEqual(["Gather AR", "Decide Action", "Notify Customer"]);
    expect(result.membershipCount).toBe(3);
    expect(edgePairs()).toEqual(["AR Orchestrator -> Gather AR", "Gather AR -> Decide Action", "Decide Action -> Notify Customer"]);
    expect(Object.keys(result.evalSuiteIds)).toHaveLength(4);
    expect(state.blueprints[0]).toMatchObject({ agentId: result.teamAgent.id, status: "draft" });
  });

  it("turns a human checkpoint into a real approval gate node with no agent", async () => {
    const body = teamBuildBodySchema.parse({
      orchestrator: worker("Expense Team"),
      workers: [worker("Check Expense"), worker("Manager Approval", { isHumanCheckpoint: true }), worker("Pay Out")],
      pipeline: { pattern: "sequential" },
    });
    await buildTeamFromProposal(body, { orgId: "org-a" });
    const gate = state.nodes.find((n) => n.label === "Manager Approval");
    expect(gate).toMatchObject({ nodeType: "edge_gate", gateType: "approval", refAgentId: null });
  });

  it("uses the proposal's own edges when it gives them, including a branch that skips a step", async () => {
    const body = teamBuildBodySchema.parse({
      orchestrator: worker("Claims Team"),
      workers: [worker("Route Decision"), worker("Adjuster Review"), worker("Process Outcome")],
      pipeline: {
        pattern: "conditional",
        edges: [
          { from: "orchestrator", to: "Route Decision" },
          { from: "Route Decision", to: "Adjuster Review", type: "conditional", branchCondition: "needs review" },
          { from: "Route Decision", to: "Process Outcome", type: "conditional", branchRule: { field: "route", operator: "== ", value: "auto" } },
          { from: "Adjuster Review", to: "Process Outcome" },
        ],
      },
    });
    await buildTeamFromProposal(body, { orgId: "org-a" });
    expect(edgePairs()).toEqual([
      "Claims Team -> Route Decision",
      "Route Decision -> Adjuster Review",
      "Route Decision -> Process Outcome",
      "Adjuster Review -> Process Outcome",
    ]);
    const skip = state.edges[2];
    expect(skip).toMatchObject({ evaluationMode: "deterministic", rule: { combinator: "AND", conditions: [{ field: "route", operator: "==", value: "auto" }] } });
    expect(state.edges[1]).toMatchObject({ evaluationMode: "ai", condition: "needs review" });
  });

  it("a multi-stage fan-out/fan-in team has no edge back to the orchestrator, so it can run", async () => {
    const body = teamBuildBodySchema.parse({
      orchestrator: worker("Review Team"),
      workers: [worker("Extract A"), worker("Extract B"), worker("Merge")],
      pipeline: { pattern: "fan_out_fan_in", executionGraph: [{ stage: 1, agents: ["Extract A", "Extract B"] }, { stage: 2, agents: ["Merge"] }] },
    });
    await buildTeamFromProposal(body, { orgId: "org-a" });
    expect(edgePairs()).not.toContain("Merge -> Review Team");
    expect(() => computeWaves(state.nodes as any, state.edges as any)).not.toThrow();
  });

  it("reports connector bindings it couldn't resolve or whose integration isn't connected", async () => {
    state.servers.push(
      { id: "srv-dealer", name: "Dealer Operations", integrationId: "dealer-operations" },
      { id: "srv-sap", name: "SAP S/4HANA", integrationId: "sap" },
    );
    state.connections.push({ integrationId: "dealer-operations", status: "connected" });
    const body = teamBuildBodySchema.parse({
      orchestrator: worker("AR Team"),
      workers: [
        worker("Gather AR", { mcpToolBindings: [{ server: "Dealer Operations", tool: "get_open_ar" }] }),
        worker("Post to ERP", { mcpToolBindings: [{ server: "SAP", tool: "post_journal" }, { server: "Oracle Fusion", tool: "post" }] }),
      ],
    });
    const result = await buildTeamFromProposal(body, { orgId: "org-a" });
    expect(result.unconnectedBindings).toEqual(["SAP S/4HANA"]);
    expect(result.unresolvedBindings).toEqual(["Oracle Fusion"]);
    expect(state.links.map((l) => l.serverId).sort()).toEqual(["srv-dealer", "srv-sap"]);
  });

  it("throws not found for an outcome the organization can't see", async () => {
    state.outcomes.push({ id: "out-1", organizationId: "org-b", status: "awaiting_agent_plan" });
    const body = teamBuildBodySchema.parse({ outcomeId: "out-1", orchestrator: worker("T"), workers: [worker("W")] });
    await expect(buildTeamFromProposal(body, { orgId: "org-a" })).rejects.toBeInstanceOf(TeamBuildNotFoundError);
    expect(state.agents).toHaveLength(0);
  });

  it("marks the outcome's agents as assigned once the team exists", async () => {
    state.outcomes.push({ id: "out-1", organizationId: "org-a", status: "awaiting_agent_plan" });
    const body = teamBuildBodySchema.parse({ outcomeId: "out-1", orchestrator: worker("T"), workers: [worker("W")] });
    await buildTeamFromProposal(body, { orgId: "org-a" });
    expect(state.outcomeUpdates).toEqual([expect.objectContaining({ outcomeId: "out-1", data: { status: "agents_assigned" } })]);
  });
});
