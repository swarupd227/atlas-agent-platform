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
import { hasCycle } from "../shared/graph-cycles";
import { REWORK_REQUESTED_RULE } from "../shared/rework-rule";

const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");

const ORG = "org-a";
const state = {
  nodes: [] as any[],
  edges: [] as any[],
  runs: [] as any[],
  agents: new Map<string, any>(),
  created: [] as any[],
  deletedNodes: [] as string[],
  updatedNodes: [] as Array<{ id: string; patch: any }>,
  audits: [] as any[],
  members: [] as Array<{ id: string; teamAgentId: string; memberAgentId: string }>,
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
    // Config is REPLACED, as the real one does, so a test that asserts on a
    // node's config sees exactly what the sync wrote.
    updateTeamBlueprintNode: vi.fn(async (id: string, patch: any) => {
      const node = state.nodes.find((n) => n.id === id);
      if (node) Object.assign(node, patch);
      state.updatedNodes.push({ id, patch });
      return node;
    }),
    createTeamBlueprintEdge: vi.fn(async (e: any) => { const edge = { id: `edge-${state.edges.length + 1}`, ...e }; state.edges.push(edge); return edge; }),
    updateTeamBlueprintEdge: vi.fn(async (id: string, patch: any) => { const edge = state.edges.find((e) => e.id === id); if (edge) Object.assign(edge, patch); return edge; }),
    deleteTeamBlueprintEdge: vi.fn(async (id: string) => { state.edges = state.edges.filter((e) => e.id !== id); return true; }),
    createAuditEvent: vi.fn(async (e: any) => { state.audits.push(e); return e; }),
    // Membership is a separate table from the blueprint, and what
    // planTeamRemoval and flowStepBehind read.
    getAgentTeamMembers: vi.fn(async (teamAgentId: string) => state.members.filter((m) => m.teamAgentId === teamAgentId)),
    createAgentTeamMember: vi.fn(async (m: any) => {
      const row = { id: `m-${state.members.length + 1}`, ...m };
      state.members.push(row);
      return row;
    }),
    deleteAgentTeamMember: vi.fn(async (id: string) => { state.members = state.members.filter((m) => m.id !== id); return true; }),
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
  state.updatedNodes = [];
  state.audits = [];
  state.members = [];
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

describe("a synced-in agent joins the team", () => {
  it("gets a membership row, or deleting the team orphans it", async () => {
    // Live 2026-09-27: the sync created an agent with a blueprint node and no
    // membership, so deleting the team left it behind and the removal plan --
    // which reads membership, not blueprint nodes -- could not even list it.
    const before = graph();
    state.nodes = blueprintFromFlow(before);
    state.members = [{ id: "m-0", teamAgentId: "team-1", memberAgentId: "agent-s4" }];
    const after = graph();
    after.nodes.push({ id: "s5", type: "take_action", label: "File surplus lines", description: "", actor: "System" });

    await applyFlowSync(ORG, target(after));
    const added = state.created.find((n) => n.config?.sourceProcessNodeId === "s5");
    expect(added.refAgentId).toBeTruthy();
    expect(state.members.map((m) => m.memberAgentId)).toContain(added.refAgentId);
  });

  it("and a superseded agent leaves it", async () => {
    const before = graph();
    state.nodes = blueprintFromFlow(before);
    state.members = [{ id: "m-1", teamAgentId: "team-1", memberAgentId: "agent-s4" }];
    // Removing the "Bind" step supersedes agent-s4.
    await applyFlowSync(ORG, target(graph({}, "s4")));
    expect(state.members.map((m) => m.memberAgentId)).not.toContain("agent-s4");
  });
});

/**
 * A step's result lands under the step's own name, whatever the sync builds it as.
 *
 * Live 2026-09-29: a step drawn as "Endorsement Accepted?" was built as an
 * agent named "Endorsement Accepted? Agent" with no state key, so the engine
 * filed its result under endorsement_accepted_agent while the author's rules
 * read endorsement_accepted.approved. Both branches unsatisfied, nine steps
 * skipped, and the build, the sync and the deploy all green.
 */
describe("a step's result key is the step's own name", () => {
  const rowFor = (processNodeId: string) => state.nodes.find((n) => n.config?.sourceProcessNodeId === processNodeId);
  const ruleOn = (field: string) => ({ combinator: "AND", conditions: [{ field, operator: "==", value: true }] });
  /** A blueprint whose rows already hold their step's key, as one built today does. */
  const keyEveryRow = () => {
    for (const n of state.nodes) if (n.config?.sourceLabel) n.stateKey = n.config.sourceLabel.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  };

  it("gives a drafted agent the step's key, not a slug of the name a model chose for it", async () => {
    state.nodes = blueprintFromFlow(graph());
    const after = graph();
    after.nodes.push({ id: "s5", type: "take_action", label: "File surplus lines", description: "", actor: "System" });
    await applyFlowSync(ORG, target(after));
    const added = state.created.find((n) => n.config?.sourceProcessNodeId === "s5");
    // The node is labelled with the drafted name; its result is not.
    expect(added.label).toMatch(/^Agent for /);
    expect(added.stateKey).toBe("file_surplus_lines");
  });

  it("and the same for a gate, an expression and a sub-flow, which used to get the step's id", async () => {
    state.nodes = blueprintFromFlow(graph({}, "s3"));
    const after = graph({ checkExpression: "aggregate <= 50000000" });
    after.nodes.push({ id: "s6", type: "sub_flow", label: "Call the filing flow", description: "", actor: "System", config: { refTeamAgentId: "team-filing" } });
    await applyFlowSync(ORG, target(after));
    expect(state.created.find((n) => n.config?.sourceProcessNodeId === "s3")).toMatchObject({ nodeType: "edge_gate", stateKey: "carrier_referral" });
    expect(state.created.find((n) => n.config?.sourceProcessNodeId === "s2")).toMatchObject({ nodeType: "expression", stateKey: "treaty_check" });
    expect(state.created.find((n) => n.config?.sourceProcessNodeId === "s6")).toMatchObject({ nodeType: "sub_flow", stateKey: "call_the_filing_flow" });
  });

  it("follows a renamed step with the rules that read its old key, and says so on the card and in the summary", async () => {
    state.nodes = blueprintFromFlow(graph());
    keyEveryRow();
    expect(rowFor("s2").stateKey).toBe("treaty_check");
    state.edges = [{
      id: "edge-old", sourceNodeId: rowFor("s2").id, targetNodeId: rowFor("s3").id,
      condition: "treaty_check.breached == true", evaluationMode: "deterministic", rule: ruleOn("treaty_check.breached"),
    }];
    // The author renamed the step but left the condition naming the old key.
    const after = graph({ checkLabel: "Treaty limit check" });
    after.edges[1].condition = "treaty_check.breached == true";

    const expected = [{ step: "Treaty limit check", from: "treaty_check", to: "treaty_limit_check", connections: ['"Treaty limit check" → "Carrier referral"'] }];
    const plan = await planFlowSync(ORG, target(after));
    expect(plan.stateKeyRenames).toEqual(expected);

    const r = await applyFlowSync(ORG, target(after));
    expect((r as any).summary.stateKeyRenames).toEqual(expected);
    const rebuilt = rowFor("s2");
    expect(rebuilt.stateKey).toBe("treaty_limit_check");
    const edge = state.edges.find((e) => e.sourceNodeId === rebuilt.id);
    expect(edge).toMatchObject({ condition: "treaty_limit_check.breached == true", evaluationMode: "deterministic" });
    expect(edge.rule.conditions[0].field).toBe("treaty_limit_check.breached");
    // And the audit trail carries it.
    expect(JSON.parse(state.audits.at(-1)!.details).stateKeyRenames).toEqual(expected);
  });

  it("gives a row left in place the step's key when it had none, and rewrites the rule that read the drafted name", async () => {
    // Every row from the old build has no key: each ran under a slug of its
    // agent's name, e.g. treaty_check_agent. A rule an admin hardened against
    // that name is on the s2 -> s3 connection, whose endpoints do not change.
    state.nodes = blueprintFromFlow(graph());
    state.edges = [{
      id: "edge-kept", sourceNodeId: rowFor("s2").id, targetNodeId: rowFor("s3").id,
      condition: "treaty_check_agent.breached == true", evaluationMode: "deterministic", rule: ruleOn("treaty_check_agent.breached"),
    }];
    const g = graph();
    g.edges[1].condition = "treaty_check_agent.breached == true";

    const r = await applyFlowSync(ORG, target(g));
    const renames = (r as any).summary.stateKeyRenames;
    expect(renames.map((x: any) => [x.from, x.to])).toEqual([
      ["normalise_cope_agent", "normalise_cope"],
      ["treaty_check_agent", "treaty_check"],
      ["carrier_referral_agent", "carrier_referral"],
      ["bind_agent", "bind"],
    ]);
    expect(renames.find((x: any) => x.from === "treaty_check_agent").connections).toEqual(['"Treaty check" → "Carrier referral"']);
    // The rows now hold the key they write under …
    for (const id of ["s1", "s2", "s3", "s4"]) expect(rowFor(id).stateKey).toBeTruthy();
    expect(state.updatedNodes).toContainEqual({ id: rowFor("s2").id, patch: { stateKey: "treaty_check" } });
    // … the kept connection reads the new name, in place, without being recreated …
    const kept = state.edges.find((e) => e.id === "edge-kept");
    expect(kept).toMatchObject({ sourceNodeId: rowFor("s2").id, targetNodeId: rowFor("s3").id, condition: "treaty_check.breached == true" });
    expect(kept.rule.conditions[0].field).toBe("treaty_check.breached");
    expect(state.edges.filter((e) => e.sourceNodeId === rowFor("s2").id && e.targetNodeId === rowFor("s3").id)).toHaveLength(1);
    // … and no step was rebuilt for it.
    expect(state.deletedNodes).toEqual([]);
  });

  it("has nothing to say when every row already writes under its step's name", async () => {
    state.nodes = blueprintFromFlow(graph());
    keyEveryRow();
    const plan = await planFlowSync(ORG, target(graph()));
    expect(plan.stateKeyRenames).toEqual([]);
    const r = await applyFlowSync(ORG, target(graph()));
    expect((r as any).summary.stateKeyRenames).toEqual([]);
    expect(state.updatedNodes).toEqual([]);
  });
});

/**
 * A flow's loops, which are the one thing a sync must NOT build as drawn.
 *
 * Found live 2026-09-27 by another session doing governance work: a team rebuilt
 * from a flow with three revision loops had 26 edges including 3 back-edges, and
 * every run died at wave computation -- "Cycle detected in team graph" -- while
 * the build, the sync and the deploy had all reported success. Zero runs, and
 * nothing anywhere said why.
 */
describe("a loop in the flow", () => {
  /** draft -> review -> file, with review sending work back to draft twice over. */
  const loopGraph = (over: { backEdge?: boolean; maxRounds?: number; draftLabel?: string } = {}) => ({
    version: 1,
    name: "Endorsement",
    nodes: [
      { id: "s0", type: "trigger", label: "Request arrives", description: "", actor: "Broker" },
      { id: "s1", type: "take_action", label: over.draftLabel ?? "Draft endorsement", description: "", actor: "System" },
      { id: "s2", type: "get_info", label: "Check contract certainty", description: "", actor: "System" },
      { id: "s3", type: "take_action", label: "File it", description: "", actor: "System" },
      { id: "s9", type: "end", label: "Filed", description: "", actor: "System" },
    ],
    edges: [
      { id: "e1", from: "s1", to: "s2" },
      { id: "e2", from: "s2", to: "s3" },
      ...(over.backEdge === false ? [] : [{ id: "e3", from: "s2", to: "s1", label: "Send back", maxRounds: over.maxRounds ?? 2 }]),
    ],
  }) as any;

  const nodeFor = (processNodeId: string) =>
    state.nodes.find((n) => n.config?.sourceProcessNodeId === processNodeId);
  const revisionOn = (processNodeId: string) => (nodeFor(processNodeId)?.config as any)?.revision;

  it("becomes a revision rule on the reviewing step, never an edge", async () => {
    const g = loopGraph();
    state.nodes = blueprintFromFlow(g);
    const r = await applyFlowSync(ORG, target(g));

    // No edge for the pair that points backwards...
    expect(state.edges.some((e) => e.sourceNodeId === "node-s2" && e.targetNodeId === "node-s1")).toBe(false);
    // ...so the graph the engine has to plan is acyclic, which is the whole point.
    expect(hasCycle(state.nodes.map((n) => n.id), state.edges.map((e) => ({ from: e.sourceNodeId, to: e.targetNodeId })))).toBe(false);
    // ...and the loop is still there, as the rule the engine actually honours.
    expect(revisionOn("s2")).toMatchObject({ targetNodeId: "node-s1", maxRounds: 2 });
    expect(revisionOn("s2").when).toEqual(REWORK_REQUESTED_RULE);
    expect((r as any).summary.revisionLoops.set).toEqual(["Check contract certainty"]);
  });

  it("deletes a back-edge a previous sync wrote, because that edge is what made the team unrunnable", async () => {
    const g = loopGraph();
    state.nodes = blueprintFromFlow(g);
    // Exactly what the live blueprint held: the loop recorded twice, once as node
    // config and once as a real edge.
    state.edges = [
      { id: "edge-fwd", sourceNodeId: "node-s1", targetNodeId: "node-s2" },
      { id: "edge-loop", sourceNodeId: "node-s2", targetNodeId: "node-s1" },
    ];
    (nodeFor("s2")!.config as any).revision = { targetNodeId: "node-s1", when: REWORK_REQUESTED_RULE, maxRounds: 2 };

    await applyFlowSync(ORG, target(g));
    expect(state.edges.some((e) => e.id === "edge-loop")).toBe(false);
    expect(hasCycle(state.nodes.map((n) => n.id), state.edges.map((e) => ({ from: e.sourceNodeId, to: e.targetNodeId })))).toBe(false);
  });

  it("repoints the loop when the step it sends work back to is superseded", async () => {
    // The live one, and the reason a hand-fix wouldn't have helped: revising the
    // target step deletes its node and redrafts it under a NEW id, and the
    // pointer was left aimed at the retired node -- so the loop silently could
    // not fire even once the cycle was resolved.
    const before = loopGraph();
    state.nodes = blueprintFromFlow(before);
    (nodeFor("s2")!.config as any).revision = { targetNodeId: "node-s1", when: REWORK_REQUESTED_RULE, maxRounds: 2 };

    const after = loopGraph({ draftLabel: "Draft endorsement with treaty citation" });
    await applyFlowSync(ORG, target(after));

    const redrafted = state.created.find((n) => n.config?.sourceProcessNodeId === "s1");
    expect(state.deletedNodes).toContain("node-s1");
    expect(redrafted.id).not.toBe("node-s1");
    expect(revisionOn("s2")).toMatchObject({ targetNodeId: redrafted.id, maxRounds: 2 });
  });

  it("takes the rule off the step when the loop is removed from the flow", async () => {
    const before = loopGraph();
    state.nodes = blueprintFromFlow(before);
    (nodeFor("s2")!.config as any).revision = { targetNodeId: "node-s1", when: REWORK_REQUESTED_RULE, maxRounds: 2 };

    const r = await applyFlowSync(ORG, target(loopGraph({ backEdge: false })));
    expect(revisionOn("s2")).toBeUndefined();
    expect((r as any).summary.revisionLoops.cleared).toEqual(["Check contract certainty"]);
  });

  it("carries the number of rounds the flow drew, capped where the engine caps it", async () => {
    state.nodes = blueprintFromFlow(loopGraph());
    await applyFlowSync(ORG, target(loopGraph({ maxRounds: 9 })));
    expect(revisionOn("s2").maxRounds).toBe(3);

    state.nodes = blueprintFromFlow(loopGraph());
    state.edges = [];
    await applyFlowSync(ORG, target(loopGraph({ maxRounds: 1 })));
    expect(revisionOn("s2").maxRounds).toBe(1);
  });

  it("refreshes a matcher that predates the current rework rule, even when the target and rounds look right", async () => {
    // Found by a peer session measuring af9a6f18 before it ever ran: matching on
    // target and rounds alone let a rule written before 2026-09-24 survive every
    // re-sync. That rule tests only the text "fail", so it does not fire on
    // {"accepted":false,"redraft":true} -- a loop that reads as configured, is
    // reported as set, and never fires.
    const stale = { combinator: "OR", conditions: [{ field: "output", operator: "contains", value: "fail" }] };
    const g = loopGraph();
    state.nodes = blueprintFromFlow(g);
    (nodeFor("s2")!.config as any).revision = { targetNodeId: "node-s1", when: stale, maxRounds: 2 };

    const r = await applyFlowSync(ORG, target(g));
    expect(revisionOn("s2").when).toEqual(REWORK_REQUESTED_RULE);
    expect((r as any).summary.revisionLoops.set).toEqual(["Check contract certainty"]);
  });

  it("leaves a loop that is already right alone, so a sync does not churn what it agrees with", async () => {
    const g = loopGraph();
    state.nodes = blueprintFromFlow(g);
    (nodeFor("s2")!.config as any).revision = { targetNodeId: "node-s1", when: REWORK_REQUESTED_RULE, maxRounds: 2 };

    const r = await applyFlowSync(ORG, target(g));
    // No revision write: the only patch a keyless row from an old build gets is
    // its step's state key, which is a different repair and is tested as one.
    expect(state.updatedNodes.filter((u) => "config" in u.patch).map((u) => u.id)).not.toContain("node-s2");
    expect((r as any).summary.revisionLoops).toMatchObject({ set: [], cleared: [], unresolved: [] });
  });

  it("follows a target superseded twice, because the pointer is rebuilt from the step and never from a supersede record", async () => {
    // A peer's caution: their loop target had been replaced, and then the
    // replacement was replaced. Depth cannot matter -- the pointer is recomputed
    // as "whichever node now carries this step" -- and this pins that, so a later
    // change that reads a supersede record instead fails here.
    state.nodes = blueprintFromFlow(loopGraph());

    await applyFlowSync(ORG, target(loopGraph({ draftLabel: "Draft endorsement with treaty citation" })));
    const first = nodeFor("s1")!;
    expect(first.id).not.toBe("node-s1");
    expect(revisionOn("s2")).toMatchObject({ targetNodeId: first.id, maxRounds: 2 });

    await applyFlowSync(ORG, target(loopGraph({ draftLabel: "Draft endorsement citing treaty and roof age" })));
    const second = nodeFor("s1")!;
    expect(second.id).not.toBe(first.id);
    expect(state.deletedNodes).toContain(first.id);
    expect(revisionOn("s2")).toMatchObject({ targetNodeId: second.id, maxRounds: 2 });
    expect(revisionOn("s2").when).toEqual(REWORK_REQUESTED_RULE);
  });

  it("leaves the loop off rather than pointing it at nothing, and says so", async () => {
    const { draftSingleAgent } = await import("../server/routes/helpers");
    const before = loopGraph();
    state.nodes = blueprintFromFlow(before);
    // The target step changed, so it is redrafted -- and the draft fails.
    vi.mocked(draftSingleAgent).mockRejectedValueOnce(new Error("model unavailable"));

    const r = await applyFlowSync(ORG, target(loopGraph({ draftLabel: "Draft endorsement, citing the treaty" })));
    const summary = (r as any).summary;
    expect(summary.draftFailures).toHaveLength(1);
    expect(summary.revisionLoops.unresolved).toEqual(["Check contract certainty"]);
    // A pointer to a node that does not exist is worse than no loop: it reads as
    // configured and can never fire.
    expect(revisionOn("s2")).toBeUndefined();
  });
});

/**
 * Connections, which a step-by-step diff cannot see.
 *
 * Live 2026-09-27: four edge conditions were removed from a flow through the
 * API, and the sync answered "already matches the flow step for step, nothing to
 * sync" while the automation still carried all four. An edge-only change could
 * never reach the team built from the flow -- the same drift this module exists to
 * close, with a hole in it.
 */
describe("a change to the connections only", () => {
  const conditioned = (condition?: string) => {
    const g = graph();
    g.edges = [
      { id: "e1", from: "s1", to: "s2" },
      { id: "e2", from: "s2", to: "s3", ...(condition ? { condition } : {}) },
      { id: "e3", from: "s3", to: "s4" },
    ];
    return g;
  };

  it("is planned, not answered with nothing to sync", async () => {
    const before = conditioned("breached");
    state.nodes = blueprintFromFlow(before);
    state.edges = [
      { id: "edge-1", sourceNodeId: "node-s1", targetNodeId: "node-s2" },
      { id: "edge-2", sourceNodeId: "node-s2", targetNodeId: "node-s3", condition: "breached" },
      { id: "edge-3", sourceNodeId: "node-s3", targetNodeId: "node-s4" },
    ];

    const plan = await planFlowSync(ORG, target(conditioned()));
    // Every step is untouched -- this is exactly the case that used to report
    // nothing to sync.
    expect(plan.changed).toEqual([]);
    expect(plan.added).toEqual([]);
    expect(plan.removed).toEqual([]);
    expect(plan.connections.changed).toEqual(['"Treaty check" → "Carrier referral" no longer waits on a condition']);
  });

  it("names a connection that was added and one that was dropped", async () => {
    const before = conditioned();
    state.nodes = blueprintFromFlow(before);
    state.edges = [
      { id: "edge-1", sourceNodeId: "node-s1", targetNodeId: "node-s2" },
      { id: "edge-2", sourceNodeId: "node-s2", targetNodeId: "node-s3" },
      { id: "edge-3", sourceNodeId: "node-s3", targetNodeId: "node-s4" },
    ];
    // Redrawn so the treaty check skips the referral and binds directly.
    const after = conditioned();
    after.edges = [
      { id: "e1", from: "s1", to: "s2" },
      { id: "e2", from: "s2", to: "s4" },
    ];
    const plan = await planFlowSync(ORG, target(after));
    expect(plan.connections.added).toEqual(['"Treaty check" → "Bind"']);
    expect(plan.connections.removed.sort()).toEqual(['"Carrier referral" → "Bind"', '"Treaty check" → "Carrier referral"']);
  });

  it("reports a loop being drawn, and one being taken away", async () => {
    const withLoop = conditioned();
    withLoop.edges.push({ id: "e4", from: "s3", to: "s2", maxRounds: 2 } as any);
    state.nodes = blueprintFromFlow(conditioned());
    const plan = await planFlowSync(ORG, target(withLoop));
    expect(plan.connections.loopsAdded).toEqual(['"Carrier referral" sends work back to "Treaty check"']);

    // And the other direction: the team holds the rule, the flow no longer draws it.
    state.nodes = blueprintFromFlow(conditioned());
    const reviewer = state.nodes.find((n) => n.config?.sourceProcessNodeId === "s3")!;
    (reviewer.config as any).revision = { targetNodeId: "node-s2", when: REWORK_REQUESTED_RULE, maxRounds: 2 };
    const without = await planFlowSync(ORG, target(conditioned()));
    expect(without.connections.loopsRemoved).toEqual(['"Carrier referral" stops sending work back']);
  });

  it("applies the condition with the same classification the build uses, so a comparison is not a model call", async () => {
    const g = conditioned("aggregate > 40000000");
    state.nodes = blueprintFromFlow(conditioned());
    await applyFlowSync(ORG, target(g));
    const edge = state.edges.find((e) => e.sourceNodeId === "node-s2" && e.targetNodeId === "node-s3")!;
    expect(edge.evaluationMode).toBe("deterministic");
    expect(edge.rule).toMatchObject({ combinator: "AND", conditions: [{ field: "aggregate", operator: ">", value: 40000000 }] });
  });

  it("leaves genuine judgement to the model, which is the point of the classification", async () => {
    const g = conditioned("the broker's story does not add up");
    state.nodes = blueprintFromFlow(conditioned());
    await applyFlowSync(ORG, target(g));
    const edge = state.edges.find((e) => e.sourceNodeId === "node-s2" && e.targetNodeId === "node-s3")!;
    expect(edge.evaluationMode).toBe("ai");
    expect(edge.rule).toBeUndefined();
    expect(edge.condition).toBe("the broker's story does not add up");
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
/**
 * A decision step syncs as a decision node -- one decision-model call over its
 * labelled branches, no agent drafted -- and a step whose KIND changed is a
 * changed step even when its words did not, so the flag reaches existing teams.
 */
describe("a decision step", () => {
  const decisionGraph = () => ({
    version: 1,
    name: "Endorsement",
    nodes: [
      { id: "s0", type: "trigger", label: "Endorsement drafted", description: "", actor: "System" },
      { id: "s1", type: "get_info", label: "Read the endorsement", description: "", actor: "System" },
      { id: "s6", type: "make_decision", label: "Decide", description: "Was the endorsement accepted by the carrier?", actor: "AI", config: { decisionKind: true } },
      { id: "s3", type: "expert_approval", label: "Carrier referral", description: "", actor: "Carrier" },
      { id: "s4", type: "take_action", label: "Bind", description: "", actor: "System" },
      { id: "s9", type: "end", label: "Bound", description: "", actor: "System" },
    ],
    edges: [
      { id: "e1", from: "s1", to: "s6" },
      { id: "e2", from: "s6", to: "s3", label: "Refer", condition: "Endorsement rejected" },
      { id: "e3", from: "s6", to: "s4", label: "Bind it", condition: "Endorsement accepted" },
    ],
  }) as any;

  it("is planned as a kind change with no agent to draft, and the branches as chosen by the step", async () => {
    const g = decisionGraph();
    state.nodes = blueprintFromFlow(g);
    // An earlier sync wrote this branch as a judged ("ai") edge; the card must
    // say it is now chosen by the step itself.
    state.edges = [{ id: "edge-old", sourceNodeId: "node-s6", targetNodeId: "node-s3", label: "Refer", condition: "Endorsement rejected", evaluationMode: "ai", rule: null }];
    const plan = await planFlowSync(ORG, target(g));
    expect(plan.changed).toEqual(["Decide"]);
    expect(plan.drafts).toBe(0);
    expect(plan.connections.changed.some((c) => c.includes("chosen by"))).toBe(true);
    // The other two connections have no edge yet, so they are simply added.
    expect(plan.connections.added).toHaveLength(2);
  });

  it("syncs as a decision node whose branches are decision edges", async () => {
    const g = decisionGraph();
    state.nodes = blueprintFromFlow(g);
    const r = await applyFlowSync(ORG, target(g));
    expect("summary" in r).toBe(true);
    expect((r as any).summary.changed).toEqual(["Decide"]);
    const decision = state.created.find((n) => n.nodeType === "decision");
    expect(decision).toBeTruthy();
    expect(decision.refAgentId).toBeNull();
    expect(decision.config.decision).toEqual({
      question: "Was the endorsement accepted by the carrier?",
      options: [{ label: "Refer", description: "Endorsement rejected" }, { label: "Bind it", description: "Endorsement accepted" }],
    });
    const out = state.edges.filter((e) => e.sourceNodeId === decision.id).map((e) => [e.label, e.evaluationMode, e.condition]);
    expect(out).toEqual([["Refer", "decision", "Endorsement rejected"], ["Bind it", "decision", "Endorsement accepted"]]);
    // No agent was drafted for it (the fixture's pre-existing "Decide Agent" is
    // the superseded one; a drafted agent would be named "Agent for Decide...").
    expect(Array.from(state.agents.values()).some((a) => String(a.name).startsWith("Agent for Decide"))).toBe(false);
  });
});
