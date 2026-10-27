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
  // An array, not a map keyed by id, so reset() clears it with everything else.
  serverTools: [] as Array<{ serverId: string; tools: Array<{ id?: string; name: string; description?: string; riskClassification?: string; annotations?: unknown }> }>,
  auditEvents: [] as any[],
  connections: [] as any[],
  agentUpdates: [] as any[],
  flows: [] as any[],
  flowUpdates: [] as any[],
  seq: 0,
}));

vi.mock("../server/storage", () => {
  const id = (p: string) => `${p}-${++state.seq}`;
  return {
    storage: {
      getOutcome: vi.fn(async (outcomeId: string, orgId?: string) =>
        state.outcomes.find((o) => o.id === outcomeId && (!orgId || o.organizationId === orgId))),
      getMcpServers: vi.fn(async () => state.servers),
      getMcpServerTools: vi.fn(async (serverId: string) => state.serverTools.find((s) => s.serverId === serverId)?.tools ?? []),
      createAuditEvent: vi.fn(async (e: any) => { state.auditEvents.push(e); return e; }),
      getProcessFlow: vi.fn(async (flowId: string, orgId?: string) =>
        state.flows.find((f) => f.id === flowId && (!orgId || f.organizationId === orgId))),
      updateProcessFlow: vi.fn(async (flowId: string, data: any, orgId?: string) => {
        state.flowUpdates.push({ flowId, data, orgId });
        const row = state.flows.find((f) => f.id === flowId);
        if (row) Object.assign(row, data);
        return row;
      }),
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
      updateTeamBlueprintNode: vi.fn(async (nodeId: string, data: any) => {
        const row = state.nodes.find((n) => n.id === nodeId);
        if (row) Object.assign(row, data);
        return row;
      }),
      createTeamBlueprintEdge: vi.fn(async (e: any) => { const row = { id: id("edge"), ...e }; state.edges.push(row); return row; }),
      // Read back by the runnability check at the end of the build: a team whose
      // graph holds a loop cannot run, and the build used to report success anyway.
      getTeamBlueprintNodes: vi.fn(async (blueprintId: string) => state.nodes.filter((n: any) => n.blueprintId === blueprintId)),
      getTeamBlueprintEdges: vi.fn(async (blueprintId: string) => state.edges.filter((e: any) => e.blueprintId === blueprintId)),
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

import { buildTeamFromProposal, teamBuildBodySchema, TeamBuildNotFoundError, IncompletePlanError, ImplausibleClaimError } from "../server/team-build";
import { storage } from "../server/storage";
import { computeWaves } from "../server/dag-execution-engine";
import { gateEdgePolarity } from "../shared/gate-edge-polarity";

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

/**
 * An orchestrator drawn from a flow coordinates; it does not touch the systems.
 *
 * Live 2026-09-29, a binder period close: the orchestrator was linked to all
 * four connectors its steps use, made 15 tool calls of its own (every drawn step
 * made exactly one), and among them lodged the pack with the carrier and closed
 * the reporting period, naming an approver it invented. The finance sign-off
 * gate never ran, and the governed submit and close steps then failed 409 on
 * work already done.
 */
describe("what an orchestrator is allowed to touch", () => {
  const bindings = [{ server: "Binder Register", tool: "close_reporting_period" }];
  const base = {
    orchestrator: { name: "Close Orchestrator", description: "coordinates", mcpToolBindings: bindings },
    workers: [worker("Period Closer", { mcpToolBindings: bindings })],
  };
  const linksFor = (name: string) => {
    const agent = state.agents.find((a) => a.name === name);
    return state.links.filter((l) => l.agentId === agent?.id);
  };

  beforeEach(() => {
    state.servers.push({ id: "srv-binder", name: "Binder Register", integrationId: null });
  });

  it("gives a flow-built orchestrator no connectors, and says what it withheld", async () => {
    const body = teamBuildBodySchema.parse({ ...base, processFlowSteps: [{ id: "n1", label: "Close the period" }] });
    const result = await buildTeamFromProposal(body, { orgId: "org-a" });
    expect(linksFor("Close Orchestrator")).toHaveLength(0);
    expect(result.withheldFromOrchestrator).toEqual(["Binder Register"]);
  });

  it("recognises a flow build from the flow id or from the derived edges", async () => {
    for (const marker of [{ processFlowId: "flow-1" }, { pipeline: { edgesDerivedFromFlow: true } }]) {
      reset();
      state.servers.push({ id: "srv-binder", name: "Binder Register", integrationId: null });
      const body = teamBuildBodySchema.parse({ ...base, ...marker });
      const result = await buildTeamFromProposal(body, { orgId: "org-a" });
      expect(linksFor("Close Orchestrator")).toHaveLength(0);
      expect(result.withheldFromOrchestrator).toEqual(["Binder Register"]);
    }
  });

  it("leaves the workers' own bindings alone -- a step still calls its tool", async () => {
    const body = teamBuildBodySchema.parse({ ...base, processFlowId: "flow-1" });
    await buildTeamFromProposal(body, { orgId: "org-a" });
    expect(linksFor("Period Closer")).toHaveLength(1);
  });

  it("still links an orchestrator that was NOT drawn from a flow", async () => {
    // A team proposed in conversation has no drawn steps to carry the tools,
    // so taking the orchestrator's connectors away would leave it unable to work.
    const body = teamBuildBodySchema.parse(base);
    const result = await buildTeamFromProposal(body, { orgId: "org-a" });
    expect(linksFor("Close Orchestrator")).toHaveLength(1);
    expect(result.withheldFromOrchestrator).toEqual([]);
  });
});

/**
 * A proposer-invented expression must not replace a decision whose branches the
 * author wrote as sentences.
 *
 * Live 2026-09-27, af9a6f18: the flow drew "Endorsement Accepted?" as a
 * make_decision with NO expression of its own, and branches reading "Endorsement
 * approved" / "Endorsement rejected". The proposer volunteered an expression over
 * `review.*` -- fields no step writes, so it answered "escalate" every run -- while
 * the branches kept asking about approved and rejected. Neither matched, the seven
 * steps after it were skipped, and the run reported success having bound nothing.
 */
describe("a decision whose branches are sentences", () => {
  const router = (extra: Record<string, unknown> = {}) => worker("Endorsement Decision Router", {
    execution: { kind: "expression", expression: '{ "route": review.approved ? "approved" : "escalate" }' },
    ...extra,
  });
  const proseBranches = (from = "Endorsement Decision Router") => ({
    pattern: "conditional",
    edges: [
      { from: "orchestrator", to: from },
      { from, to: "Filing Lookup", type: "conditional", branchCondition: "Endorsement approved" },
      { from, to: "Escalation", type: "conditional", branchCondition: "Endorsement rejected" },
    ],
  });

  it("runs as an agent instead, so the branches can be judged against what it says", async () => {
    const body = teamBuildBodySchema.parse({
      orchestrator: worker("E&S Team"),
      workers: [router(), worker("Filing Lookup"), worker("Escalation")],
      pipeline: proseBranches(),
    });
    const result = await buildTeamFromProposal(body, { orgId: "org-a" });
    const node = state.nodes.find((n) => n.label === "Endorsement Decision Router");
    expect(node!.nodeType).toBe("internal_agent");
    expect(node!.refAgentId).toBeTruthy();
    expect(node!.config?.expression).toBeUndefined();
    // And says why, with the cheaper fix rather than only the refusal.
    const warning = result.structureWarnings.find((w: string) => w.includes("Endorsement Decision Router"))!;
    expect(warning).toContain("sentences, which only a model can judge");
    expect(warning).toContain("skipped every step after it while the run still reported success");
    expect(warning).toContain("write its branches as rules over the fields its own expression emits");
  });

  it("matches the step by its flow label too, since the agent is named something else", async () => {
    // The flow says "Endorsement Accepted?"; the proposer called the agent
    // "Endorsement Decision Router". The edge may use either.
    const body = teamBuildBodySchema.parse({
      orchestrator: worker("E&S Team"),
      workers: [router({ flowStepLabels: ["Endorsement Accepted?"] }), worker("Filing Lookup"), worker("Escalation")],
      pipeline: proseBranches("Endorsement Accepted?"),
    });
    await buildTeamFromProposal(body, { orgId: "org-a" });
    expect(state.nodes.find((n) => n.label === "Endorsement Decision Router")!.nodeType).toBe("internal_agent");
  });

  it("keeps the expression when a branch is a rule the engine can check itself", async () => {
    const body = teamBuildBodySchema.parse({
      orchestrator: worker("E&S Team"),
      workers: [router(), worker("Filing Lookup"), worker("Escalation")],
      pipeline: {
        pattern: "conditional",
        edges: [
          { from: "orchestrator", to: "Endorsement Decision Router" },
          { from: "Endorsement Decision Router", to: "Filing Lookup", type: "conditional", branchCondition: "route == approved" },
          { from: "Endorsement Decision Router", to: "Escalation", type: "conditional", branchCondition: "Endorsement rejected" },
        ],
      },
    });
    await buildTeamFromProposal(body, { orgId: "org-a" });
    expect(state.nodes.find((n) => n.label === "Endorsement Decision Router")!.nodeType).toBe("expression");
  });

  it("keeps an expression with no branches at all, which is an ordinary computation", async () => {
    const body = teamBuildBodySchema.parse({
      orchestrator: worker("E&S Team"),
      workers: [router(), worker("Filing Lookup")],
      pipeline: { pattern: "sequential" },
    });
    await buildTeamFromProposal(body, { orgId: "org-a" });
    expect(state.nodes.find((n) => n.label === "Endorsement Decision Router")!.nodeType).toBe("expression");
  });
});

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

  it("creates an agent row only for a step that runs an agent", async () => {
    // A gate and a deterministic step run no agent. Building a row for every
    // step left 21 of 25 agent rows unused on a 32-step flow, each with a
    // mandate, a team membership and a baseline eval suite.
    const body = teamBuildBodySchema.parse({
      orchestrator: worker("Rebalancing Team"),
      workers: [
        worker("Compute Drift", { execution: { kind: "expression", expression: '{ "breached": true }' } }),
        worker("Build Proposal"),
        worker("Portfolio Manager Approves", { isHumanCheckpoint: true }),
      ],
      pipeline: { pattern: "sequential" },
    });
    const result = await buildTeamFromProposal(body, { orgId: "org-a" });

    expect(state.agents.map((a) => a.name)).toEqual(["Rebalancing Team", "Build Proposal"]);
    expect(result.workers.map((w: any) => w.name)).toEqual(["Build Proposal"]);
    expect(result.membershipCount).toBe(1);
    expect(result.stepsWithoutAgent).toBe(2);
    expect(state.members.map((m) => m.memberAgentId)).toEqual([result.workers[0].id]);
    expect(Object.keys(result.evalSuiteIds).sort()).toEqual([result.teamAgent.id, result.workers[0].id].sort());
    const byLabel = (l: string) => state.nodes.find((n) => n.label === l);
    expect(byLabel("Compute Drift")).toMatchObject({ nodeType: "expression", refAgentId: null });
    expect(byLabel("Portfolio Manager Approves")).toMatchObject({ nodeType: "edge_gate", refAgentId: null });
    expect(byLabel("Build Proposal")).toMatchObject({ nodeType: "internal_agent", refAgentId: result.workers[0].id });
    // Every step is still a node, in order.
    expect(edgePairs()).toEqual(["Rebalancing Team -> Compute Drift", "Compute Drift -> Build Proposal", "Build Proposal -> Portfolio Manager Approves"]);
    // No placeholder id ever reaches storage.
    expect(state.nodes.some((n) => String(n.refAgentId ?? "").startsWith("step:"))).toBe(false);
    expect(state.agentUpdates.some((u) => String(u.agentId).startsWith("step:"))).toBe(false);
  });

  it("keeps a tool step's forEach list, and falls back to an agent when it does not parse", async () => {
    const SRV = "11111111-1111-4111-8111-111111111111";
    const step = (name: string, forEach: string) => worker(name, { execution: { kind: "tool_call", toolServerId: SRV, toolName: "screen_party", toolArgs: { fullName: { $expr: "$item.name" } }, forEach } });
    const body = teamBuildBodySchema.parse({
      orchestrator: worker("Onboarding Team"),
      workers: [step("Screen Each Party", "case.parties[role != 'beneficiary']"), step("Screen Badly", "((")],
      pipeline: { pattern: "sequential" },
    });
    const result = await buildTeamFromProposal(body, { orgId: "org-a" });
    const byLabel = (l: string) => state.nodes.find((n) => n.label === l);
    expect(byLabel("Screen Each Party")).toMatchObject({ nodeType: "tool_call", config: { forEach: "case.parties[role != 'beneficiary']", toolName: "screen_party" } });
    expect(byLabel("Screen Badly").nodeType).toBe("internal_agent");
    expect(result.structureWarnings.some((w: string) => w.includes("forEach list does not parse"))).toBe(true);
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

  /**
   * A declared tool name is the only one of the three "which tools has this
   * agent" fields that becomes a sentence in the agent's own system prompt, and
   * it was the only one nothing checked. Measured across the org on 2026-10-18:
   * 199 of 882 declared names resolved to nothing.
   *
   * The four kinds below are all real declarations read off live agents, and
   * they are why this repairs rather than filters -- 25 of those 199 named
   * something that exists.
   */
  it("repairs a declared tool name that resolves once normalised, and reports every one that does not", async () => {
    state.servers.push(
      { id: "srv-dealer", name: "Dealer Operations", integrationId: "dealer-operations" },
      { id: "srv-hub", name: "Receivables Hub", integrationId: "receivables-hub" },
    );
    state.serverTools.push(
      { serverId: "srv-dealer", tools: [{ name: "get_payment_batch" }, { name: "check_posting_period" }] },
      { serverId: "srv-hub", tools: [{ name: "get_open_ar" }] },
    );
    state.connections.push({ integrationId: "dealer-operations", status: "connected" }, { integrationId: "receivables-hub", status: "connected" });

    const body = teamBuildBodySchema.parse({
      orchestrator: worker("AR Team", { mcpToolBindings: [{ server: "Receivables Hub", tool: "get_open_ar" }] }),
      workers: [worker("Cash Application", {
        mcpToolBindings: [{ server: "Dealer Operations", tool: "get_payment_batch" }],
        tools: [
          // Real, with its connector glued on -- the live form, both separators.
          { name: "get_payment_batch - dealer operations (vitaledge)", description: "reads the batch" },
          { name: "dealer operations: check_posting_period", description: "checks the period" },
          // A real built-in, defeated by one trailing space.
          { name: "generate_pptx ", description: "makes a deck" },
          // Real, but on a connector THIS agent is not bound to.
          { name: "get_open_ar", description: "reads open AR" },
          // Invented: nine live agents declare exactly this one.
          { name: "policy_coverage_checker", description: "checks coverage" },
        ],
      })],
    });
    const result = await buildTeamFromProposal(body, { orgId: "org-a" });
    const built = state.agents.find((a) => a.name === "Cash Application")!;

    // The repair reaches the persisted declaration...
    expect((built.toolsConfig as Array<{ name: string }>).map((t) => t.name)).toEqual([
      "get_payment_batch", "check_posting_period", "generate_pptx", "get_open_ar", "policy_coverage_checker",
    ]);
    // ...and the prompt, which is the whole point: one declaration, read by both.
    expect(built.systemPrompt).toContain("get_payment_batch (reads the batch)");
    expect(built.systemPrompt).not.toContain("dealer operations (vitaledge)");

    const said = result.structureWarnings.join(" ");
    expect(said).toMatch(/corrected to the real one/);
    expect(said).toContain('"get_payment_batch - dealer operations (vitaledge)" -> get_payment_batch');
    expect(said).toContain('"generate_pptx " -> generate_pptx');
    // The three outcomes are reported as three different things, because they
    // need three different answers: fixed, link the connector, and invented.
    expect(said).toMatch(/"get_open_ar", which is a real tool on a connector it is not bound to/);
    expect(said).toMatch(/"policy_coverage_checker", which matches no tool on any connector in this plan/);
    // Nothing was dropped: an unresolvable name stays in the record.
    expect(said).not.toMatch(/removed|dropped|stripped/);
  });

  it("leaves declared tool names alone when no tool list can be read, rather than failing the build", async () => {
    // A connector with no discovered tools contributes no names, so every
    // declaration is simply unrepaired and reported -- the same distinction
    // assessProposalBindings draws with server_no_tools_discovered. The build
    // must not fall over, and must not call a name invented on that evidence.
    state.servers.push({ id: "srv-dealer", name: "Dealer Operations", integrationId: "dealer-operations" });
    state.connections.push({ integrationId: "dealer-operations", status: "connected" });
    const body = teamBuildBodySchema.parse({
      orchestrator: worker("AR Team"),
      workers: [worker("Cash Application", {
        mcpToolBindings: [{ server: "Dealer Operations", tool: "get_payment_batch" }],
        tools: [{ name: "get_payment_batch - dealer operations", description: "reads the batch" }],
      })],
    });
    const result = await buildTeamFromProposal(body, { orgId: "org-a" });
    const built = state.agents.find((a) => a.name === "Cash Application")!;
    expect((built.toolsConfig as Array<{ name: string }>)[0].name).toBe("get_payment_batch - dealer operations");
    expect(result.structureWarnings.join(" ")).toMatch(/matches no tool on any connector in this plan/);
  });

  /**
   * The policy check a person granting the same connector would have hit.
   *
   * Measured 2026-10-19: storage.createAgentMcpServer has 27 call sites and
   * exactly one -- POST /api/agents/:id/mcp-servers -- sat behind the policy
   * evaluation. So a binding made through the gated route was not durable: six
   * agents were granted a connector there with a data_handling policy bound
   * first, and rebuilding those teams regranted here with nothing re-checking.
   *
   * Granted and reported rather than refused, which is this file's existing
   * precedent for an unconnected connector. The pair below is what makes that
   * meaningful: the same build, warned when no policy governs the tool and
   * silent when one does.
   */
  const riskyConnector = () => {
    state.servers.push({ id: "srv-risky", name: "Core Banking", integrationId: "core-banking" });
    state.connections.push({ integrationId: "core-banking", status: "connected" });
    state.serverTools.push({ serverId: "srv-risky", tools: [
      { id: "t-post", name: "post_allocation", description: "Post an allocation to the ledger", riskClassification: "high" },
    ] });
  };
  const riskyPlan = (policyConstraints?: string[]) => teamBuildBodySchema.parse({
    orchestrator: worker("Ledger Team"),
    workers: [worker("Allocation Poster", {
      mcpToolBindings: [{ server: "Core Banking", tool: "post_allocation" }],
      ...(policyConstraints ? { policyConstraints } : {}),
    })],
  });

  it("grants a high-risk connector with no governing policy, records the mismatch, and says so", async () => {
    riskyConnector();
    const result = await buildTeamFromProposal(riskyPlan(), { orgId: "org-a" });

    // Granted -- a build does not stop over a defect whose fix is elsewhere.
    expect(state.links.map((l) => l.serverId)).toContain("srv-risky");
    // Recorded, which is the whole point: the mismatch is answerable afterwards.
    const mismatches = state.auditEvents.filter((e) => e.action === "agent.mcp_policy_mismatch");
    expect(mismatches).toHaveLength(1);
    const details = JSON.parse(mismatches[0].details);
    expect(details).toMatchObject({
      serverName: "Core Banking",
      toolName: "post_allocation",
      riskClassification: "high",
      requiredPolicyDomain: "tool_permissions",
      acknowledged: false,
      via: "team_build",
    });
    // And said out loud, not only written to a table nobody reads.
    expect(result.structureWarnings.join(" ")).toMatch(/post_allocation \(high, needs tool_permissions\)/);
    expect(result.structureWarnings.join(" ")).toMatch(/agent\.mcp_policy_mismatch/);
  });

  it("stays silent when a bound policy governs the tool", async () => {
    // The negative half. Without it the assertion above passes for a build that
    // warns about everything, which is the same as warning about nothing.
    riskyConnector();
    state.policies.push({ id: "pol-tools", name: "Tool permissions", domain: "tool_permissions", status: "active" });
    const result = await buildTeamFromProposal(riskyPlan(["Tool permissions"]), { orgId: "org-a" });

    expect(state.links.map((l) => l.serverId)).toContain("srv-risky");
    expect(state.auditEvents.filter((e) => e.action === "agent.mcp_policy_mismatch")).toEqual([]);
    expect(result.structureWarnings.join(" ")).not.toMatch(/without a policy governing/);
  });

  it("does not fall over when the store has no audit writer", async () => {
    // `storage.x(...).catch()` throws on `undefined(...)` before the catch
    // exists. The mismatch must still reach the report when the event cannot
    // be written, or a build on a store without auditing dies for want of a row.
    riskyConnector();
    const audit = (storage as any).createAuditEvent;
    (storage as any).createAuditEvent = undefined;
    try {
      const result = await buildTeamFromProposal(riskyPlan(), { orgId: "org-a" });
      expect(state.links.map((l) => l.serverId)).toContain("srv-risky");
      expect(result.structureWarnings.join(" ")).toMatch(/post_allocation \(high, needs tool_permissions\)/);
    } finally {
      (storage as any).createAuditEvent = audit;
    }
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

describe("organization", () => {
  it("every agent and blueprint the build creates belongs to the caller's organization", async () => {
    const body = teamBuildBodySchema.parse({
      orchestrator: worker("AR Team"),
      workers: [worker("Gather AR", { workflowSteps: ["Pull invoices", "Summarize"] }), worker("Notify")],
      pipeline: { pattern: "sequential" },
    });
    await buildTeamFromProposal(body, { orgId: "org-a" });
    expect(state.agents.length).toBe(3);
    expect(state.agents.every((a) => a.organizationId === "org-a")).toBe(true);
    expect(state.blueprints.length).toBe(2);
    expect(state.blueprints.every((b) => b.organizationId === "org-a")).toBe(true);
    expect(state.agentUpdates.length).toBeGreaterThan(0);
    expect(state.agentUpdates.every((u) => u.orgId === "org-a")).toBe(true);
  });

  it("inherits the outcome's policies only from the caller's organization", async () => {
    state.outcomes.push({ id: "out-1", organizationId: "org-a", status: "awaiting_agent_plan" });
    state.outcomePolicies.push(
      { id: "pol-a", name: "Ours", organizationId: "org-a", policyJson: { enforcement: "strict" } },
      { id: "pol-b", name: "Someone else's", organizationId: "org-b", policyJson: {} },
    );
    const body = teamBuildBodySchema.parse({ outcomeId: "out-1", orchestrator: worker("T"), workers: [worker("W")] });
    await buildTeamFromProposal(body, { orgId: "org-a" });
    const bindingUpdates = state.agentUpdates.filter((u) => u.data.policyBindings);
    expect(bindingUpdates).toHaveLength(2);
    for (const u of bindingUpdates) {
      expect(u.data.policyBindings.map((b: any) => b.policyId)).toEqual(["pol-a"]);
    }
    expect(state.outcomeUpdates[0]).toMatchObject({ orgId: "org-a" });
  });
});

describe("a flow that sends work back", () => {
  it("turns the loop into a revision rule on the reviewer instead of an edge, so the stages still compute", async () => {
    const body = teamBuildBodySchema.parse({
      orchestrator: worker("Launch Team"),
      workers: [worker("Write Copy"), worker("Review Copy"), worker("Schedule Launch")],
      pipeline: {
        pattern: "sequential",
        edges: [
          { from: "orchestrator", to: "Write Copy" },
          { from: "Write Copy", to: "Review Copy" },
          { from: "Review Copy", to: "Write Copy", label: "send back for a rewrite" },
          { from: "Review Copy", to: "Schedule Launch" },
        ],
      },
    });
    await buildTeamFromProposal(body, { orgId: "org-a" });

    // The backward edge is gone, so there is no cycle and the stages compute.
    expect(edgePairs()).toEqual([
      "Launch Team -> Write Copy",
      "Write Copy -> Review Copy",
      "Review Copy -> Schedule Launch",
    ]);
    expect(() => computeWaves(state.nodes as any, state.edges as any)).not.toThrow();

    // The rework itself is kept, as the platform's own revision rule on the reviewing step.
    const reviewer = state.nodes.find((n) => n.label === "Review Copy");
    const writer = state.nodes.find((n) => n.label === "Write Copy");
    expect(reviewer.config.revision).toMatchObject({ targetNodeId: writer.id, maxRounds: 1 });
    expect(reviewer.config.revision.when.conditions[0]).toMatchObject({ field: "verdict", operator: "==", value: "FAIL" });
    expect(reviewer.config.role).toBe("worker");
  });
});

describe("explicit edges without the orchestrator", () => {
  it("dispatches from the orchestrator to the first worker when the plan lists only worker handoffs", async () => {
    const body = teamBuildBodySchema.parse({
      orchestrator: worker("Fleet Team"),
      workers: [worker("Gather"), worker("Decide"), worker("Approve", { isHumanCheckpoint: true }), worker("Execute")],
      pipeline: {
        pattern: "sequential",
        edges: [{ from: "Gather", to: "Decide" }, { from: "Decide", to: "Approve" }, { from: "Approve", to: "Execute" }],
      },
    });
    await buildTeamFromProposal(body, { orgId: "org-a" });
    expect(edgePairs()).toEqual(["Gather -> Decide", "Decide -> Approve", "Approve -> Execute", "Fleet Team -> Gather"]);
    expect(computeWaves(state.nodes as any, state.edges as any).totalWaves).toBe(5);
  });
});

describe("the process flow a team was drawn from", () => {
  /**
   * A flow authored FROM a journey already carries teamAgentId. One drawn
   * first in the Studio and then turned into an automation had no way to
   * write it back, so the journey showed no process flow and every re-draft
   * orphaned another one (live 2026-09-24).
   */
  const body = (processFlowId?: string) => teamBuildBodySchema.parse({
    orchestrator: worker("Binding Team"),
    workers: [worker("Read Submission"), worker("Price It")],
    pipeline: { pattern: "sequential" },
    ...(processFlowId ? { processFlowId } : {}),
  });

  it("records the journey it became on the flow", async () => {
    state.flows.push({ id: "flow-1", organizationId: "org-a", teamAgentId: null });
    const result = await buildTeamFromProposal(body("flow-1"), { orgId: "org-a" });
    expect(state.flowUpdates).toEqual([{ flowId: "flow-1", data: { teamAgentId: result.teamAgent.id }, orgId: "org-a" }]);
    expect(state.flows[0].teamAgentId).toBe(result.teamAgent.id);
  });

  it("re-points a flow that already made a team, since a redraft makes a new one", async () => {
    state.flows.push({ id: "flow-1", organizationId: "org-a", teamAgentId: "older-team" });
    const result = await buildTeamFromProposal(body("flow-1"), { orgId: "org-a" });
    expect(state.flows[0].teamAgentId).toBe(result.teamAgent.id);
  });

  it("leaves flows alone when the team wasn't drawn from one", async () => {
    state.flows.push({ id: "flow-1", organizationId: "org-a", teamAgentId: null });
    await buildTeamFromProposal(body(), { orgId: "org-a" });
    expect(state.flowUpdates).toEqual([]);
    expect(state.flows[0].teamAgentId).toBeNull();
  });

  it("still builds the team when the flow can't be linked", async () => {
    // Another org's flow, or one since deleted: the team is the point, and a
    // bookkeeping link failing must not cost the caller the whole build.
    state.flows.push({ id: "flow-1", organizationId: "someone-else", teamAgentId: null });
    const result = await buildTeamFromProposal(body("flow-1"), { orgId: "org-a" });
    expect(result.teamAgent.id).toBeTruthy();
    expect(state.flowUpdates).toEqual([]);
    expect(state.flows[0].teamAgentId).toBeNull();
  });
});
/**
 * A decision drawn with labelled branches becomes ONE decision node whose
 * branches are "decision" edges: one decision-model call chooses, exactly one
 * branch is taken. Opt-in per step here (config.decisionKind); the platform
 * flag DECISION_STEP_KIND does the same for every flow.
 */
describe("a decision drawn with labelled branches", () => {
  const step = (config: Record<string, unknown> = {}) => ({
    id: "d1", type: "make_decision", label: "Endorsement Accepted?", description: "Was the endorsement accepted by the carrier?", config,
  });
  const body = (config: Record<string, unknown> = {}) => teamBuildBodySchema.parse({
    orchestrator: worker("E&S Team"),
    workers: [worker("Endorsement Decision Router", { flowStepLabels: ["Endorsement Accepted?"] }), worker("Filing Lookup"), worker("Escalation")],
    pipeline: {
      pattern: "conditional",
      edges: [
        { from: "orchestrator", to: "Endorsement Decision Router" },
        { from: "Endorsement Decision Router", to: "Filing Lookup", type: "conditional", label: "Approved", branchCondition: "Endorsement approved" },
        { from: "Endorsement Decision Router", to: "Escalation", type: "conditional", label: "Rejected", branchCondition: "Endorsement rejected" },
      ],
    },
    processFlowSteps: [step(config)],
  });

  it("becomes one decision node whose branches are decision edges", async () => {
    await buildTeamFromProposal(body({ decisionKind: true }), { orgId: "org-a" });
    const router = state.nodes.find((n) => n.label === "Endorsement Decision Router");
    expect(router.nodeType).toBe("decision");
    expect(router.refAgentId).toBeNull();
    expect(router.stateKey).toBe("endorsement_accepted");
    expect(router.config.decision).toEqual({
      question: "Was the endorsement accepted by the carrier?",
      options: [{ label: "Approved", description: "Endorsement approved" }, { label: "Rejected", description: "Endorsement rejected" }],
    });
    const out = state.edges.filter((e) => e.sourceNodeId === router.id).map((e) => [nodeLabel(e.targetNodeId), e.label, e.evaluationMode, e.condition]);
    expect(out).toEqual([["Filing Lookup", "Approved", "decision", "Endorsement approved"], ["Escalation", "Rejected", "decision", "Endorsement rejected"]]);
  });

  it("stays an agent whose branches are judged, without the opt-in", async () => {
    await buildTeamFromProposal(body(), { orgId: "org-a" });
    const router = state.nodes.find((n) => n.label === "Endorsement Decision Router");
    expect(router.nodeType).toBe("internal_agent");
    expect(state.edges.filter((e) => e.sourceNodeId === router.id).map((e) => e.evaluationMode)).toEqual(["ai", "ai"]);
  });
});

/**
 * A plan that does not cover its flow is refused.
 *
 * A step no agent claims is not built at all and its edges go with it. The
 * proposer has detected this since 2026-09-29 and nothing refused on it, so the
 * build returned 201 and the team deployed clean with steps missing -- including,
 * on a 40-step close, four of the six human approval gates. Every later check
 * reports success, because it reports on the steps that WERE built.
 */
describe("an incomplete plan", () => {
  const steps = [
    { id: "n0", type: "trigger", label: "A request arrives" },
    { id: "n1", type: "get_info", label: "Fetch the record" },
    { id: "n2", type: "expert_approval", label: "Approve the change" },
    { id: "n3", type: "end", label: "Done" },
  ];
  // Names deliberately unlike the step labels, so inferStepClaims cannot rescue
  // them and the gate is what is being tested.
  const twoWorkers = [worker("Alpha", { flowStepLabels: ["Fetch the record"] }), worker("Bravo")];

  it("refuses, naming the step nobody claimed", async () => {
    const body = teamBuildBodySchema.parse({
      orchestrator: { name: "Zulu Orchestrator", description: "coordinates" },
      workers: twoWorkers,
      processFlowSteps: steps,
    });
    await expect(buildTeamFromProposal(body, { orgId: "org-a" })).rejects.toThrow(IncompletePlanError);
    await expect(buildTeamFromProposal(body, { orgId: "org-a" })).rejects.toThrow(/Approve the change/);
  });

  it("creates nothing when it refuses", async () => {
    const body = teamBuildBodySchema.parse({
      orchestrator: { name: "Zulu Orchestrator", description: "coordinates" },
      workers: twoWorkers,
      processFlowSteps: steps,
    });
    await buildTeamFromProposal(body, { orgId: "org-a" }).catch(() => {});
    // A refusal that had already written half a team would be worse than the
    // silent build it replaces.
    expect(state.agents).toHaveLength(0);
    expect(state.blueprints).toHaveLength(0);
  });

  it("does not refuse over a routing step: deriveEdgesFromFlow walks through those", async () => {
    const body = teamBuildBodySchema.parse({
      orchestrator: { name: "Zulu Orchestrator", description: "coordinates" },
      workers: [worker("Alpha", { flowStepLabels: ["Fetch the record"] }), worker("Bravo", { flowStepLabels: ["Approve the change"] })],
      processFlowSteps: steps,
    });
    await expect(buildTeamFromProposal(body, { orgId: "org-a" })).resolves.toBeTruthy();
  });

  it("runs after claim inference, so a claim the proposer only implied is not refused", async () => {
    // "Fetch The Record Agent" says which step it covers in its name alone.
    // Refusing this would make the gate fire on plans the builder repairs itself.
    const body = teamBuildBodySchema.parse({
      orchestrator: { name: "Zulu Orchestrator", description: "coordinates" },
      workers: [worker("Fetch The Record Agent"), worker("Approve The Change Agent")],
      processFlowSteps: steps,
    });
    await expect(buildTeamFromProposal(body, { orgId: "org-a" })).resolves.toBeTruthy();
  });

  it("builds on an explicit acknowledgement, and records the gap on the blueprint", async () => {
    const body = teamBuildBodySchema.parse({
      orchestrator: { name: "Zulu Orchestrator", description: "coordinates" },
      workers: twoWorkers,
      processFlowSteps: steps,
      acknowledgeIncomplete: true,
    });
    await expect(buildTeamFromProposal(body, { orgId: "org-a" })).resolves.toBeTruthy();
    const bp = state.blueprints.find((b) => String(b.name).includes("Team Blueprint"));
    expect(bp.validationResults.incompletePlan.unclaimedSteps).toEqual(["Approve the change"]);
    expect(typeof bp.validationResults.incompletePlan.acknowledgedAt).toBe("string");
  });

  it("leaves a build with no authored steps alone", async () => {
    // A team proposed in conversation has no flow to be incomplete against.
    const body = teamBuildBodySchema.parse({
      orchestrator: { name: "Zulu Orchestrator", description: "coordinates" },
      workers: [worker("Alpha")],
    });
    await expect(buildTeamFromProposal(body, { orgId: "org-a" })).resolves.toBeTruthy();
  });
});

/**
 * A claim must be correct, not merely present.
 *
 * Coverage counted claims; nothing checked one was plausible. On the licence
 * journey the agent that writes the decision claimed "A licence request
 * arrives" — the trigger. Coverage passed, the step looked covered, and the
 * agent that should have done the writing was attached to a marker.
 *
 * Measured over 133 live teams before this became a refusal: one worker built
 * on a routing step, no step claimed twice.
 */
describe("a claim that names the wrong thing", () => {
  const steps = [
    { id: "s0", type: "trigger", label: "A request arrives" },
    { id: "s1", type: "get_info", label: "Fetch the record" },
    { id: "s2", type: "ai_reasoning", label: "Read the record" },
    { id: "s3", type: "end", label: "Done" },
  ];
  const build = (workers: any[], extra: Record<string, unknown> = {}) =>
    buildTeamFromProposal(
      teamBuildBodySchema.parse({
        orchestrator: { name: "Record Orchestrator", description: "coordinates" },
        workers,
        processFlowSteps: steps,
        ...extra,
      }),
      { orgId: "org-a" },
    );

  it("refuses an agent that claims the trigger, and says it is a marker", async () => {
    const workers = [
      worker("Fetch the record", { flowStepLabels: ["Fetch the record"] }),
      worker("Read the record", { flowStepLabels: ["Read the record"] }),
      worker("Writer", { flowStepLabels: ["A request arrives"] }),
    ];
    await expect(build(workers)).rejects.toThrow(ImplausibleClaimError);
    await expect(build(workers)).rejects.toThrow(/is a trigger, which is a marker/);
  });

  it("refuses an agent that claims the end step too", async () => {
    const workers = [
      worker("Fetch the record", { flowStepLabels: ["Fetch the record"] }),
      worker("Read the record", { flowStepLabels: ["Read the record"] }),
      worker("Monitor", { flowStepLabels: ["Done"] }),
    ];
    await expect(build(workers)).rejects.toThrow(/is a end, which is a marker|is an end, which is a marker/);
  });

  it("refuses two agents on one step, because only the last would be built", async () => {
    const workers = [
      worker("Fetch the record", { flowStepLabels: ["Fetch the record"] }),
      worker("Fetch it again", { flowStepLabels: ["Fetch the record"] }),
      worker("Read the record", { flowStepLabels: ["Read the record"] }),
    ];
    await expect(build(workers)).rejects.toThrow(/claimed by 2 agents/);
  });

  it("lets claim inference repair a near-miss before judging it", async () => {
    // "Fetch the recrod" names no step, but the agent's own name does, and
    // inferStepClaims repairs that. Refusing here would fire on plans the
    // builder fixes itself -- the same ordering BR-1's coverage check needs.
    const workers = [
      worker("Fetch the record", { flowStepLabels: ["Fetch the recrod"] }),
      worker("Read the record", { flowStepLabels: ["Read the record"] }),
    ];
    await expect(build(workers)).resolves.toBeTruthy();
  });

  it("refuses a claim that names no step and that inference cannot place", async () => {
    // Every real step is claimed by somebody else, so there is nothing for
    // inference to give this one, and a claim naming no step would otherwise
    // read exactly like an agent that claimed nothing at all.
    const workers = [
      worker("Fetch the record", { flowStepLabels: ["Fetch the record"] }),
      worker("Read the record", { flowStepLabels: ["Read the record"] }),
      worker("Zephyr", { flowStepLabels: ["Polish the brasswork"] }),
    ];
    await expect(build(workers)).rejects.toThrow(/names no step in this flow/);
  });

  it("creates nothing when it refuses, and is checked before the coverage count", async () => {
    // A claim on the trigger makes a step look covered, so this has to run
    // first or the coverage check passes on a plan that is wrong.
    const workers = [
      worker("Fetch the record", { flowStepLabels: ["Fetch the record"] }),
      worker("Read the record", { flowStepLabels: ["Read the record"] }),
      worker("Writer", { flowStepLabels: ["A request arrives"] }),
    ];
    await build(workers).catch(() => {});
    expect(state.agents).toHaveLength(0);
  });

  it("builds on an acknowledgement, like an incomplete plan", async () => {
    const workers = [
      worker("Fetch the record", { flowStepLabels: ["Fetch the record"] }),
      worker("Read the record", { flowStepLabels: ["Read the record"] }),
      worker("Writer", { flowStepLabels: ["A request arrives"] }),
    ];
    await expect(build(workers, { acknowledgeIncomplete: true })).resolves.toBeTruthy();
  });

  it("leaves a plain, correct plan alone", async () => {
    const workers = [
      worker("Fetch the record", { flowStepLabels: ["Fetch the record"] }),
      worker("Read the record", { flowStepLabels: ["Read the record"] }),
    ];
    await expect(build(workers)).resolves.toBeTruthy();
  });

  it("sequences a worker that covers two steps instead of walking through it", async () => {
    // soleAuthoredStep returns null for a worker claiming two steps, so it was
    // invisible to the edge restoration: connectedStepPairs saw no node for
    // either step and wired this worker's predecessor straight to its
    // successor, leaving it alone on the orchestrator edge back in wave one.
    const fourSteps = [
      ...steps.slice(0, 3),
      { id: "s4", type: "take_action", label: "Write it back" },
      steps[3],
    ];
    const edges = [
      { id: "e0", from: "s0", to: "s1" },
      { id: "e1", from: "s1", to: "s2" },
      { id: "e2", from: "s2", to: "s4" },
      { id: "e3", from: "s4", to: "s3" },
    ];
    const body = teamBuildBodySchema.parse({
      orchestrator: { name: "Record Orchestrator", description: "coordinates" },
      workers: [
        worker("Fetch the record", { flowStepLabels: ["Fetch the record"] }),
        worker("Reader and writer", { flowStepLabels: ["Read the record", "Write it back"] }),
      ],
      processFlowSteps: fourSteps,
      processFlowEdges: edges,
    });
    await buildTeamFromProposal(body, { orgId: "org-a" });
    expect(edgePairs()).toContain("Fetch the record -> Reader and writer");
  });
});

/**
 * A step must be built as what it was drawn as.
 *
 * classifyStep decides a step's kind and the build records it as
 * config.sourceType, but nothing checked the node came out that way. A
 * retrieval step arrived as an internal_agent carrying sourceType
 * "knowledge_base", with no knowledge base and no query, and reasoned without
 * the rules it was drawn to read. Reported rather than refused: every cause
 * found so far is upstream of the build.
 */
describe("a step built as something other than what it was drawn as", () => {
  const buildWithStep = async (step: Record<string, unknown>, workerExtra: Record<string, unknown> = {}) => {
    const body = teamBuildBodySchema.parse({
      orchestrator: { name: "Rules Orchestrator", description: "coordinates" },
      workers: [worker(String(step.label), { flowStepLabels: [String(step.label)], ...workerExtra })],
      processFlowSteps: [step],
    });
    return buildTeamFromProposal(body, { orgId: "org-a" });
  };

  it("says so when a step drawn to search a knowledge base is built as an agent", async () => {
    // get_info + kbId is retrieval. If it lands as an agent it answers from the
    // model, which reads as a working step.
    const result = await buildWithStep({ id: "n1", type: "get_info", label: "Read rules", config: { kbId: "kb-1", skillId: "skill-1" } });
    expect(result.structureWarnings.join(" ")).toMatch(/drawn to search a knowledge base but was built as an agent/);
  });

  it("stays quiet when the step really is an agent", async () => {
    const result = await buildWithStep({ id: "n1", type: "ai_reasoning", label: "Apply rules", description: "Weigh it up." });
    expect(result.structureWarnings.join(" ")).not.toMatch(/drawn to search a knowledge base/);
    expect(result.structureWarnings.join(" ")).not.toMatch(/was built without/);
  });

  it("names what a built knowledge step is missing", async () => {
    state.servers.push({ id: "srv-1", name: "Rules Base", integrationId: null });
    // Retrieval with a base but no query: buildable, and useless without one.
    const result = await buildWithStep({ id: "n1", type: "get_info", label: "Read rules", config: { kbId: "kb-1" } });
    const node = state.nodes.find((n) => n.label === "Read rules");
    if (node?.nodeType === "knowledge_base" && !node.config?.kbQuery) {
      expect(result.structureWarnings.join(" ")).toMatch(/what to search it for/);
    } else {
      // The builder gave it a query from the step's own description, which is
      // the documented default. Then there is nothing to warn about.
      expect(node?.config?.kbQuery ?? "").not.toBe("");
    }
  });
});

/**
 * The flow is the authority on what connects to what.
 *
 * Everything else sequences from pipeline.edges, computed at proposal time and
 * often a fan-out. Measured on the licence journey: eight blueprint edges, seven
 * of them orchestrator-to-worker. Every step therefore sat in one wave and the
 * fetch ran before the step producing its input had run, so the connector was
 * called with an empty record number and correctly refused. The team built
 * clean, deployed clean, and ran.
 */
describe("the connections the author drew", () => {
  const steps = [
    { id: "s0", type: "trigger", label: "A request arrives" },
    { id: "s1", type: "get_info", label: "Fetch the record" },
    { id: "s2", type: "ai_reasoning", label: "Read the record" },
    { id: "s3", type: "end", label: "Done" },
  ];
  const flowEdges = [
    { id: "e0", from: "s0", to: "s1" },
    { id: "e1", from: "s1", to: "s2" },
    { id: "e2", from: "s2", to: "s3" },
  ];
  const plan = {
    orchestrator: { name: "Record Orchestrator", description: "coordinates" },
    workers: [
      worker("Fetch the record", { flowStepLabels: ["Fetch the record"] }),
      worker("Read the record", { flowStepLabels: ["Read the record"] }),
    ],
    processFlowSteps: steps,
  };

  it("restores a connection the plan lost, so the steps run in the order drawn", async () => {
    // No pipeline edges at all: the shape that produced the star.
    const body = teamBuildBodySchema.parse({ ...plan, processFlowEdges: flowEdges });
    const result = await buildTeamFromProposal(body, { orgId: "org-a" });
    expect(edgePairs()).toContain("Fetch the record -> Read the record");
    expect(result.structureWarnings.join(" ")).toMatch(/restored from it/);
  });

  it("walks through a step that became no node, rather than dropping the connection", async () => {
    // trigger -> s1 -> parallel -> s2 -> end. The parallel is a routing step and
    // becomes no node; s1 still has to reach s2.
    const withRouting = [
      ...steps.slice(0, 3),
      { id: "sp", type: "parallel", label: "Fan out" },
      steps[3],
    ];
    const edges = [
      { id: "e0", from: "s0", to: "s1" },
      { id: "e1", from: "s1", to: "sp" },
      { id: "e2", from: "sp", to: "s2" },
      { id: "e3", from: "s2", to: "s3" },
    ];
    const body = teamBuildBodySchema.parse({ ...plan, processFlowSteps: withRouting, processFlowEdges: edges });
    await buildTeamFromProposal(body, { orgId: "org-a" });
    expect(edgePairs()).toContain("Fetch the record -> Read the record");
  });

  it("adds nothing when the plan already carried the connection", async () => {
    const body = teamBuildBodySchema.parse({
      ...plan,
      processFlowEdges: flowEdges,
      pipeline: { pattern: "sequential", edges: [{ from: "Fetch the record", to: "Read the record" }] },
    });
    const result = await buildTeamFromProposal(body, { orgId: "org-a" });
    const made = edgePairs().filter((p) => p === "Fetch the record -> Read the record");
    expect(made).toHaveLength(1);
    expect(result.structureWarnings.join(" ")).not.toMatch(/restored from it/);
  });

  it("does nothing at all when no flow connections were given", async () => {
    const body = teamBuildBodySchema.parse(plan);
    const result = await buildTeamFromProposal(body, { orgId: "org-a" });
    expect(result.structureWarnings.join(" ")).not.toMatch(/restored from it/);
  });

  it("reads the flow's connections even when the caller sent the steps inline", async () => {
    // The old condition read the flow only when no steps were sent, so the one
    // caller that has steps -- the Studio -- never had its connections read.
    state.flows.push({ id: "flow-9", organizationId: "org-a", graph: { nodes: steps, edges: flowEdges } });
    const body = teamBuildBodySchema.parse({ ...plan, processFlowId: "flow-9" });
    await buildTeamFromProposal(body, { orgId: "org-a" });
    expect(edgePairs()).toContain("Fetch the record -> Read the record");
  });

  it("restores a decision's branches as the rules the flow draws, not as two unconditional edges", async () => {
    const withDecision = [
      { id: "s0", type: "trigger", label: "A request arrives" },
      { id: "s1", type: "get_info", label: "Fetch the record" },
      { id: "sd", type: "make_decision", label: "Record found?" },
      { id: "s2", type: "ai_reasoning", label: "Read the record" },
      { id: "s4", type: "take_action", label: "Ask again" },
    ];
    const edges = [
      { id: "e0", from: "s0", to: "s1" },
      { id: "e1", from: "s1", to: "sd" },
      { id: "e2", from: "sd", to: "s2", condition: "fetch_the_record.found == true", label: "Found" },
      { id: "e3", from: "sd", to: "s4", condition: "fetch_the_record.found == false", label: "Not found" },
    ];
    const body = teamBuildBodySchema.parse({
      orchestrator: { name: "Record Orchestrator", description: "coordinates" },
      workers: [
        worker("Fetch the record", { flowStepLabels: ["Fetch the record"] }),
        worker("Read the record", { flowStepLabels: ["Read the record"] }),
        worker("Ask again", { flowStepLabels: ["Ask again"] }),
      ],
      processFlowSteps: withDecision,
      processFlowEdges: edges,
      pipeline: null,
    });
    await buildTeamFromProposal(body, { orgId: "org-a" });
    const edgeTo = (label: string) => state.edges.find((e) => nodeLabel(e.sourceNodeId) === "Fetch the record" && nodeLabel(e.targetNodeId) === label);
    expect(edgeTo("Read the record")).toMatchObject({ label: "Found", evaluationMode: "deterministic", rule: { combinator: "AND", conditions: [{ field: "fetch_the_record.found", operator: "==", value: true }] } });
    expect(edgeTo("Ask again")).toMatchObject({ label: "Not found", evaluationMode: "deterministic", rule: { conditions: [{ field: "fetch_the_record.found", operator: "==", value: false }] } });
  });

  it("keeps a gate's decline branch a decline when the connection is restored", async () => {
    const withGate = [
      { id: "s0", type: "trigger", label: "A request arrives" },
      { id: "sg", type: "expert_approval", label: "Manager approves" },
      { id: "sy", type: "take_action", label: "Record acceptance" },
      { id: "sn", type: "take_action", label: "Record override" },
    ];
    const edges = [
      { id: "e0", from: "s0", to: "sg" },
      { id: "e1", from: "sg", to: "sy", condition: "manager_approves.approved == true", label: "Approved" },
      { id: "e2", from: "sg", to: "sn", condition: "manager_approves.approved == false", label: "Rejected" },
    ];
    const body = teamBuildBodySchema.parse({
      orchestrator: { name: "Gate Orchestrator", description: "coordinates" },
      workers: [
        worker("Manager approves", { flowStepLabels: ["Manager approves"], isHumanCheckpoint: true }),
        worker("Record acceptance", { flowStepLabels: ["Record acceptance"] }),
        worker("Record override", { flowStepLabels: ["Record override"] }),
      ],
      processFlowSteps: withGate,
      processFlowEdges: edges,
    });
    await buildTeamFromProposal(body, { orgId: "org-a" });
    const out = (label: string) => state.edges.find((e) => nodeLabel(e.sourceNodeId) === "Manager approves" && nodeLabel(e.targetNodeId) === label);
    expect(gateEdgePolarity(out("Record acceptance"))).toBe("approve");
    expect(gateEdgePolarity(out("Record override"))).toBe("reject");
  });

  it("still restores an unconditional connection as plain step order, with no rule", async () => {
    // Pins the existing behaviour: the first test in this describe, plus the edge's shape.
    const body = teamBuildBodySchema.parse({ ...plan, processFlowEdges: flowEdges });
    await buildTeamFromProposal(body, { orgId: "org-a" });
    const e = state.edges.find((x) => nodeLabel(x.sourceNodeId) === "Fetch the record" && nodeLabel(x.targetNodeId) === "Read the record");
    expect(e).toMatchObject({ label: "step order" });
    expect(e.rule).toBeUndefined();
    expect(e.evaluationMode).toBeUndefined();
  });
});

/**
 * The authored step's description is the agent's instruction.
 *
 * The proposer writes its own systemPrompt and it is a stub: 66, 65, 80 and 64
 * characters across four agents built in October 2026. The author's paragraph
 * reached the node description, the correlation and the state key -- never the
 * agent -- so every journey needed a PATCH after build to be usable.
 */
describe("the agent's prompt", () => {
  const AUTHORED = "Name the one entitlement rule that covers this request and the outcome it requires. Granted only where a rule says so; everything else is referred, with the reason. You may not deny.";
  const steps = [{ id: "n1", type: "ai_reasoning", label: "Apply rules", description: AUTHORED }];

  const buildWith = async (workerExtra: Record<string, unknown>) => {
    const body = teamBuildBodySchema.parse({
      orchestrator: { name: "Rules Orchestrator", description: "coordinates" },
      workers: [worker("Apply rules", { flowStepLabels: ["Apply rules"], ...workerExtra })],
      processFlowSteps: steps,
    });
    await buildTeamFromProposal(body, { orgId: "org-a" });
    return state.agents.find((a) => a.name === "Apply rules");
  };

  it("takes the authored description over the proposer's stub", async () => {
    const agent = await buildWith({ systemPrompt: "Applies the entitlement rules to the request." });
    expect(agent.systemPrompt).toBe(AUTHORED);
  });

  it("keeps a proposer prompt that genuinely says more than the step did", async () => {
    const longer = `${AUTHORED} In addition, when two rules appear to apply, prefer the more specific one, and treat an elevation request as always the most specific.`;
    const agent = await buildWith({ systemPrompt: longer });
    expect(agent.systemPrompt).toBe(longer);
  });

  it("falls back to the proposer's prompt when the step carries no description", async () => {
    const body = teamBuildBodySchema.parse({
      orchestrator: { name: "Rules Orchestrator", description: "coordinates" },
      workers: [worker("Apply rules", { flowStepLabels: ["Apply rules"], systemPrompt: "Applies the rules." })],
      processFlowSteps: [{ id: "n1", type: "ai_reasoning", label: "Apply rules" }],
    });
    await buildTeamFromProposal(body, { orgId: "org-a" });
    expect(state.agents.find((a) => a.name === "Apply rules").systemPrompt).toBe("Applies the rules.");
  });
});
