/**
 * Syncing a changed flow into the automation built from it.
 *
 * The gap this closes, in a business user's words: they said "the treaty limit
 * is 50 million, not 40", Astra revised the flow, the card confirmed it -- and
 * the running team still used 40. Only the Studio could sync, only for an
 * outcome's flow, and only by telling you what it had changed after changing it.
 *
 * What this file pins:
 * - the diff is by the step id each blueprint node persists, never by label;
 * - a blueprint that can't be correlated says so instead of guessing, and
 *   PARTIAL correlation counts as none (otherwise the un-correlated nodes stay
 *   while their steps are added again, doubling the team);
 * - the build records that correlation, so a flow-built team is syncable at all;
 * - a revision says the automation is now out of date, every time.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { stepCorrelation, stepUnchanged, STRUCTURAL_NODE_TYPES, HUMAN_CHECKPOINT_NODE_TYPES } from "../shared/process-flow-correlation";

const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");

const ORG = "org-a";
const state = {
  nodes: [] as any[],
  edges: [] as any[],
  runs: [] as any[],
  agents: new Map<string, any>(),
  created: [] as any[],
  deletedNodes: [] as string[],
  audits: [] as any[],
};

vi.mock("../server/storage", () => ({
  storage: {
    listDagExecutionRunsByTeamAgent: vi.fn(async () => state.runs),
    getBlueprint: vi.fn(async (id: string) => ({ id, blueprintJson: { pattern: "sequential" } })),
    getTeamBlueprintNodes: vi.fn(async () => state.nodes),
    getTeamBlueprintEdges: vi.fn(async () => state.edges),
    getAgent: vi.fn(async (id: string) => state.agents.get(id)),
    createAgent: vi.fn(async (a: any) => {
      const agent = { id: `agent-${state.agents.size + 1}`, ...a };
      state.agents.set(agent.id, agent);
      return agent;
    }),
    createTeamBlueprintNode: vi.fn(async (n: any) => {
      const node = { id: `node-${state.created.length + 1}`, ...n };
      state.created.push(node);
      state.nodes.push(node);
      return node;
    }),
    deleteTeamBlueprintNode: vi.fn(async (id: string) => { state.deletedNodes.push(id); state.nodes = state.nodes.filter((n) => n.id !== id); return true; }),
    createTeamBlueprintEdge: vi.fn(async (e: any) => { const edge = { id: `edge-${state.edges.length + 1}`, ...e }; state.edges.push(edge); return edge; }),
    deleteTeamBlueprintEdge: vi.fn(async (id: string) => { state.edges = state.edges.filter((e) => e.id !== id); return true; }),
    createAuditEvent: vi.fn(async (e: any) => { state.audits.push(e); return e; }),
  },
}));

vi.mock("../server/routes/helpers", () => ({
  draftSingleAgent: vi.fn(async (description: string) => ({ draft: { name: `Agent for ${description.slice(0, 20)}`, description, riskTier: "MEDIUM" } })),
  resolveOntologyTags: vi.fn(() => []),
}));

const { planFlowSync, applyFlowSync } = await import("../server/process-flow-sync");

/** Three steps, drawn: gather, check the treaty, pay out. */
const graph = (over: Partial<Record<"checkLabel" | "checkExpression", string>> = {}, drop?: string) => ({
  version: 1,
  name: "E&S binding",
  nodes: [
    { id: "s0", type: "trigger", label: "Submission arrives", description: "", actor: "Broker" },
    { id: "s1", type: "get_info", label: "Normalise COPE", description: "", actor: "System" },
    { id: "s2", type: "expression", label: over.checkLabel ?? "Treaty check", description: "", actor: "System", config: { expression: over.checkExpression ?? "aggregate <= 40000000" } },
    { id: "s3", type: "expert_approval", label: "Carrier referral", description: "", actor: "Carrier" },
    { id: "s4", type: "take_action", label: "Bind", description: "", actor: "System" },
    { id: "s9", type: "end", label: "Bound", description: "", actor: "System" },
  ].filter((n) => n.id !== drop),
  edges: [
    { id: "e1", from: "s1", to: "s2" },
    { id: "e2", from: "s2", to: "s3", condition: "breached" },
    { id: "e3", from: "s3", to: "s4" },
  ],
}) as any;

/** A blueprint built from that flow, correlated step by step. */
function blueprintFromFlow(g: any, opts: { uncorrelate?: string[] } = {}) {
  const orchestrator = { id: "node-orch", label: "E&S Orchestrator", config: { role: "orchestrator" }, refAgentId: "agent-orch" };
  const nodes = [orchestrator];
  for (const step of g.nodes.filter((n: any) => !STRUCTURAL_NODE_TYPES.has(n.type))) {
    const agentId = `agent-${step.id}`;
    state.agents.set(agentId, { id: agentId, name: `${step.label} Agent` });
    const correlated = !(opts.uncorrelate ?? []).includes(step.id);
    nodes.push({
      id: `node-${step.id}`,
      label: `${step.label} Agent`,
      refAgentId: HUMAN_CHECKPOINT_NODE_TYPES.has(step.type) ? null : agentId,
      config: { role: "worker", ...(correlated ? stepCorrelation(step) : {}) },
    } as any);
  }
  return nodes;
}

const team = { id: "team-1", name: "E&S Binding Team", blueprintId: "bp-1", industry: "insurance", organizationId: ORG, outcomeId: null };
const target = (g: any) => ({ graph: g, flowName: "E&S binding", teamAgent: team as any });

beforeEach(() => {
  state.nodes = [];
  state.edges = [];
  state.runs = [];
  state.agents = new Map();
  state.created = [];
  state.deletedNodes = [];
  state.audits = [];
});

describe("the correlation itself", () => {
  it("is by the step's id, and notices any change to what the step says", () => {
    const step = { id: "s2", label: "Treaty check", description: "", type: "expression", config: { expression: "aggregate <= 40000000" } };
    const stored = stepCorrelation(step);
    expect(stored.sourceProcessNodeId).toBe("s2");
    expect(stepUnchanged(stored, step)).toBe(true);
    // The expression is the whole point of a deterministic step, and a change
    // confined to it is invisible to a label comparison.
    expect(stepUnchanged(stored, { ...step, config: { expression: "aggregate <= 50000000" } })).toBe(false);
    expect(stepUnchanged(stored, { ...step, label: "Treaty limit check" })).toBe(false);
  });

  it("leaves the steps that are drawn but never run out of it", () => {
    expect(STRUCTURAL_NODE_TYPES.has("trigger")).toBe(true);
    expect(STRUCTURAL_NODE_TYPES.has("end")).toBe(true);
    expect(HUMAN_CHECKPOINT_NODE_TYPES.has("expert_approval")).toBe(true);
  });
});

describe("planning a sync", () => {
  it("says nothing changed when nothing changed", async () => {
    const g = graph();
    state.nodes = blueprintFromFlow(g);
    const plan = await planFlowSync(ORG, target(g));
    expect(plan).toMatchObject({ unchanged: 4, changed: [], added: [], removed: [] });
    expect(plan.block).toBeUndefined();
  });

  it("names the step whose rule changed, and the agent that is superseded for it", async () => {
    const before = graph();
    state.nodes = blueprintFromFlow(before);
    const after = graph({ checkExpression: "aggregate <= 50000000" });
    const plan = await planFlowSync(ORG, target(after));
    expect(plan.changed).toEqual(["Treaty check"]);
    expect(plan.added).toEqual([]);
    expect(plan.unchanged).toBe(3);
    expect(plan.supersedes).toEqual([{ label: "Treaty check", agentId: "agent-s2", agentName: "Treaty check Agent" }]);
    // An expression step is rebuilt from the step itself, so no model writes it.
    expect(plan.drafts).toBe(0);
    // Nothing was written by planning it.
    expect(state.created).toEqual([]);
    expect(state.deletedNodes).toEqual([]);
  });

  it("counts the agents a model would have to write", async () => {
    const before = graph();
    state.nodes = blueprintFromFlow(before);
    const after = graph();
    after.nodes.push({ id: "s5", type: "take_action", label: "File surplus lines", description: "", actor: "System" });
    const plan = await planFlowSync(ORG, target(after));
    expect(plan.added).toEqual(["File surplus lines"]);
    expect(plan.drafts).toBe(1);
  });

  it("reports a removed step as removed, not as nothing", async () => {
    const before = graph();
    state.nodes = blueprintFromFlow(before);
    const plan = await planFlowSync(ORG, target(graph({}, "s4")));
    expect(plan.removed).toEqual(["Bind"]);
    expect(plan.supersedes.map((s) => s.label)).toEqual(["Bind"]);
  });

  it("refuses while a run is in progress, because a run reads the blueprint live", async () => {
    const g = graph();
    state.nodes = blueprintFromFlow(g);
    state.runs = [{ id: "run-9", status: "waiting_approval" }];
    const plan = await planFlowSync(ORG, target(graph({ checkExpression: "x" })));
    expect(plan.block).toMatchObject({ kind: "run_in_flight", runId: "run-9", runStatus: "waiting_approval" });
  });

  it("won't guess when a blueprint's agents can't be matched to steps", async () => {
    const g = graph();
    state.nodes = blueprintFromFlow(g, { uncorrelate: ["s1", "s2", "s3", "s4"] });
    const plan = await planFlowSync(ORG, target(g));
    expect(plan.block?.kind).toBe("legacy_blueprint");
    expect(plan.block?.message).toContain("can't be matched");
  });

  it("treats partial correlation as none, so a sync can't double the team", async () => {
    // With one node un-correlated, a step-by-step sync would leave it in place
    // AND add its step again as a new agent.
    const g = graph();
    state.nodes = blueprintFromFlow(g, { uncorrelate: ["s2"] });
    const plan = await planFlowSync(ORG, target(g));
    expect(plan.block?.kind).toBe("legacy_blueprint");
    expect(plan.block?.message).toContain("1 of 4");
  });
});

describe("applying it", () => {
  it("replaces only the step that changed, and leaves the rest alone", async () => {
    const before = graph();
    state.nodes = blueprintFromFlow(before);
    const keptNodeIds = state.nodes.filter((n) => n.id !== "node-s2").map((n) => n.id);
    const r = await applyFlowSync(ORG, target(graph({ checkExpression: "aggregate <= 50000000" })));
    expect("summary" in r).toBe(true);
    const summary = (r as any).summary;
    expect(summary).toMatchObject({ changed: ["Treaty check"], added: [], unchanged: 3 });
    expect(state.deletedNodes).toEqual(["node-s2"]);
    // Every other blueprint node is untouched, which is what preserves anything
    // hardened on it after the build.
    for (const id of keptNodeIds) expect(state.nodes.some((n) => n.id === id)).toBe(true);
    // The rebuilt node carries the NEW expression and the same step id.
    const rebuilt = state.created.find((n) => n.config?.sourceProcessNodeId === "s2");
    expect(rebuilt).toMatchObject({ nodeType: "expression" });
    expect(rebuilt.config.expression).toBe("aggregate <= 50000000");
  });

  it("builds an approval step as a gate, not an agent", async () => {
    const before = graph({}, "s3");
    state.nodes = blueprintFromFlow(before);
    await applyFlowSync(ORG, target(graph()));
    const gate = state.created.find((n) => n.config?.sourceProcessNodeId === "s3");
    expect(gate).toMatchObject({ nodeType: "edge_gate", gateType: "approval", refAgentId: null });
  });

  it("records what it did, and who asked", async () => {
    const before = graph();
    state.nodes = blueprintFromFlow(before);
    await applyFlowSync(ORG, target(graph({ checkExpression: "aggregate <= 50000000" })), { via: "Astra Cowork (admin)" });
    const audit = state.audits.at(-1)!;
    expect(audit.action).toBe("outcome.process_flow_synced");
    const details = JSON.parse(audit.details);
    expect(details).toMatchObject({ teamAgentId: "team-1", flow: "E&S binding", changed: ["Treaty check"], via: "Astra Cowork (admin)" });
  });

  it("refuses rather than racing a run, on the apply as well as the plan", async () => {
    const g = graph();
    state.nodes = blueprintFromFlow(g);
    state.runs = [{ id: "run-9", status: "running" }];
    const r = await applyFlowSync(ORG, target(graph({ checkExpression: "x" })));
    expect((r as any).blocked?.kind).toBe("run_in_flight");
    expect(state.created).toEqual([]);
  });

  it("hands a legacy blueprint back as a choice, not an error", async () => {
    const g = graph();
    state.nodes = blueprintFromFlow(g, { uncorrelate: ["s1", "s2", "s3", "s4"] });
    const r = await applyFlowSync(ORG, target(g));
    expect((r as any).needsChoice).toBe("legacy_blueprint");
    expect(state.created).toEqual([]);
  });

  it("rebuilds everything when that choice is taken", async () => {
    const g = graph();
    state.nodes = blueprintFromFlow(g, { uncorrelate: ["s1", "s2", "s3", "s4"] });
    const r = await applyFlowSync(ORG, target(g), { forceFullRebuild: true });
    const summary = (r as any).summary;
    expect(summary.added.length + summary.changed.length).toBe(4);
    expect(state.deletedNodes).toHaveLength(4);
    // Three agents, not four: the approval step is a gate and runs no agent, so
    // there is nothing to supersede for it.
    expect(summary.superseded.map((s: any) => s.label).sort()).toEqual(["Bind Agent", "Normalise COPE Agent", "Treaty check Agent"]);
  });
});

describe("the two callers", () => {
  it("has the Studio's route call the shared reconciliation, not its own copy", () => {
    const route = read("server", "routes", "outcomes.ts");
    expect(route).toContain('import { applyFlowSync } from "../process-flow-sync";');
    expect(route).not.toContain("const changedOldNodes = changed");
  });

  it("has the build record which step each node came from, or nothing could be synced", () => {
    const build = read("server", "team-build.ts");
    expect(build).toContain('import { stepCorrelation } from "@shared/process-flow-correlation";');
    // Both node-creation paths, tiered and flat.
    expect(build.match(/\.\.\.\(correlation \?\? \{\}\)/g)).toHaveLength(2);
    expect(build).toContain("function correlationFor(");
  });

  it("tells the user a revision hasn't changed what runs", () => {
    const tool = read("server", "astra", "tools", "process-flow.ts");
    expect(tool).toContain("That automation keeps the steps it was built with until you sync it");
    expect(tool).toContain("automationOutOfDate");
    const prompt = read("server", "astra", "prompt.ts");
    expect(prompt).toContain("Changing a flow changes the drawing, not what runs");
  });
});
