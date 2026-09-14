/**
 * build_team through the Astra confirm loop, with fake services.
 */
import { describe, it, expect, vi } from "vitest";
import { runTurn, resolveAction, type EngineDeps } from "../server/astra/engine";
import { ToolRegistry } from "../server/astra/registry";
import { MemoryThreadStore } from "../server/astra/memory-store";
import { scriptedComplete, result, call } from "../server/astra/scripted-brain";
import { finishTurnTool } from "../server/astra/tools/finish-turn";
import { buildTeamTool, withoutWorkers } from "../server/astra/tools/build-team";
import { hasPermission, type RoleId } from "../server/permissions";
import type { AstraContext } from "../server/astra/types";

const ORG = "org-a";
const as = (role: RoleId): AstraContext => ({ orgId: ORG, userId: "u1", role, industryId: "equipment_dealer" });

const proposal = () => ({
  id: "prop-1",
  status: "draft",
  orchestrator: { name: "Collections Team", description: "Runs collections", policyConstraints: ["AR write-off approval"] },
  workers: [
    { name: "Gather AR", description: "Pulls open AR", mcpToolBindings: [{ server: "SAP", tool: "get_ar" }] },
    { name: "Manager Approval", description: "A person approves", isHumanCheckpoint: true },
    { name: "Notify Customer", description: "Sends the reminder" },
  ],
  pipeline: {
    pattern: "sequential",
    edges: [{ from: "orchestrator", to: "Gather AR" }, { from: "Gather AR", to: "Manager Approval" }, { from: "Manager Approval", to: "Notify Customer" }],
    executionGraph: [{ stage: 1, agents: ["Gather AR"] }, { stage: 2, agents: ["Manager Approval"] }, { stage: 3, agents: ["Notify Customer"] }],
  },
});

function setup(steps: Parameters<typeof scriptedComplete>[0], opts: { outcomeStatus?: string; riskTier?: string } = {}) {
  const store = new MemoryThreadStore();
  const threadId = store.createThread(ORG);
  const state = { hash: "h1", proposal: proposal(), built: [] as any[] };
  const services = {
    getProposalForBuild: vi.fn(async (org: string, id: string) =>
      org === ORG && id === "prop-1"
        ? {
            proposal: state.proposal,
            outcome: { id: "out-1", name: "Reduce DSO", status: opts.outcomeStatus ?? "awaiting_agent_plan", riskTier: opts.riskTier ?? "MEDIUM" },
            pendingReviewApprovalId: opts.outcomeStatus === "pending_review" ? "apr-7" : null,
            processFlowSteps: [{ label: "Gather", type: "task" }],
            hash: state.hash,
          }
        : null),
    assessBindings: vi.fn(async (_org: string, agents: any[]) => ({
      agents: agents.map((a) => ({ name: a.name, connectors: a.mcpToolBindings?.length ? ["SAP S/4HANA"] : [], issues: [] })),
      issues: agents.some((a) => a.mcpToolBindings?.length) ? [{ code: "server_not_connected", server: "SAP S/4HANA", agent: "Gather AR", message: "" }] : [],
      connectorsChecked: 5,
    })),
    resolvePolicyNames: vi.fn(async (_org: string, names: string[]) => ({ resolved: names, unresolved: [] })),
    buildTeam: vi.fn(async (org: string, body: any) => {
      state.built.push({ org, body });
      return {
        teamAgent: { id: "team-1", name: body.orchestrator.name },
        blueprint: { id: "bp-1" },
        workers: body.workers.map((w: any, i: number) => ({ id: `w-${i}`, name: w.name, status: "active" })),
        unconnectedBindings: ["SAP S/4HANA"],
        unresolvedBindings: [],
      };
    }),
    markProposalBuilt: vi.fn(async () => {}),
  };
  const deps: EngineDeps = {
    store,
    registry: new ToolRegistry([finishTurnTool, buildTeamTool], hasPermission),
    complete: scriptedComplete(steps),
    can: hasPermission,
    audit: vi.fn(async () => {}),
    services,
    model: "test",
  };
  return { store, threadId, deps, services, state, onEvent: () => {} };
}

const build = (args: Record<string, unknown> = { proposalId: "prop-1" }) => ({ toolCalls: [{ name: "build_team", arguments: args }] });
const done = (text: string) => result(text, [call("finish_turn", { suggestions: [] })]);
const lastTool = (messages: any[]) => JSON.parse(messages.filter((m) => m.role === "tool").at(-1).content);
const pending = async (t: ReturnType<typeof setup>) => (await t.store.loadThread(t.threadId, ORG))!.pendingAction!;

describe("build_team", () => {
  it("shows agents, gates, connectors and warnings on the card, and builds in the organization on Confirm", async () => {
    const t = setup([build(), (m) => { expect(lastTool(m).result).toMatchObject({ built: true, teamAgentId: "team-1", approvalGates: ["Manager Approval"], unconnectedConnectors: ["SAP S/4HANA"] }); return done("Built."); }]);
    expect(await runTurn(t.deps, as("admin"), t.threadId, "Build it", t.onEvent)).toBe("awaiting_confirmation");
    const action = await pending(t);
    expect(action.summary).toBe("Build Collections Team (3 agents) for Reduce DSO");
    expect(action.details!.join(" ")).toContain("Manager Approval (pauses for a person)");
    expect(action.details!.join(" ")).toContain("Does not deploy or run anything");
    expect(action.warnings!.map((w) => w.title)).toEqual(["1 connector isn't connected"]);
    expect(t.services.buildTeam).not.toHaveBeenCalled();

    await resolveAction(t.deps, as("admin"), t.threadId, action.id, "confirm", t.onEvent);
    expect(t.state.built).toHaveLength(1);
    expect(t.state.built[0]).toMatchObject({ org: ORG, body: { outcomeId: "out-1", industry: "equipment_dealer", processFlowSteps: [{ label: "Gather", type: "task" }] } });
    expect(t.services.markProposalBuilt).toHaveBeenCalledWith("prop-1");
    expect(t.store.threadMessages(t.threadId).at(-1)!.artifacts[0]).toMatchObject({ kind: "team", fullViewHref: "/agents/team-1" });
  });

  it("refuses to build if the proposal was replaced after the card was shown", async () => {
    const t = setup([build(), (m) => { expect(lastTool(m).error).toContain("changed after the confirm card"); return done("It changed."); }]);
    await runTurn(t.deps, as("admin"), t.threadId, "Build it", t.onEvent);
    t.state.hash = "h2";
    await resolveAction(t.deps, as("admin"), t.threadId, (await pending(t)).id, "confirm", t.onEvent);
    expect(t.services.buildTeam).not.toHaveBeenCalled();
  });

  it("waits for the outcome review, pointing at its approval", async () => {
    const t = setup([build(), (m) => { expect(lastTool(m).error).toContain("apr-7"); return done("Approve the review first."); }], { outcomeStatus: "pending_review" });
    expect(await runTurn(t.deps, as("admin"), t.threadId, "Build it", t.onEvent)).toBe("idle");
    expect(t.services.buildTeam).not.toHaveBeenCalled();
  });

  it("warns when a high-risk outcome's team has no approval gate", async () => {
    const t = setup([build({ proposalId: "prop-1", excludeWorkers: ["manager approval"] })], { riskTier: "HIGH" });
    await runTurn(t.deps, as("admin"), t.threadId, "Build without the approval", t.onEvent);
    expect((await pending(t)).warnings!.map((w) => w.title)).toContain("No approval gate for a HIGH-risk outcome");
  });

  it("Not now builds nothing; unknown proposals and worker names are refused", async () => {
    const t = setup([build(), done("Okay.")]);
    await runTurn(t.deps, as("admin"), t.threadId, "Build it", t.onEvent);
    await resolveAction(t.deps, as("admin"), t.threadId, (await pending(t)).id, "cancel", t.onEvent);
    expect(t.services.buildTeam).not.toHaveBeenCalled();

    for (const [args, expected] of [
      [{ proposalId: "prop-x" }, "No team proposal"],
      [{ proposalId: "prop-1", excludeWorkers: ["Nobody"] }, 'no worker named "Nobody"'],
    ] as Array<[Record<string, unknown>, string]>) {
      const u = setup([build(args), (m) => { expect(lastTool(m).error).toContain(expected); return done("No."); }]);
      expect(await runTurn(u.deps, as("admin"), u.threadId, "Build it", u.onEvent)).toBe("idle");
    }
  });

  it("isn't offered to roles that can't build teams", async () => {
    const t = setup([build(), (m) => { expect(lastTool(m).error).toMatch(/No tool named "build_team"/); return done("Can't."); }]);
    await runTurn(t.deps, as("outcome_owner"), t.threadId, "Build it", t.onEvent);
    expect(t.services.buildTeam).not.toHaveBeenCalled();
  });
});

describe("withoutWorkers", () => {
  it("drops a worker from the plan and the pipeline, reconnecting the steps around it", () => {
    const { workers, pipeline } = withoutWorkers(proposal(), ["Manager Approval"]);
    expect(workers.map((w) => w.name)).toEqual(["Gather AR", "Notify Customer"]);
    expect(pipeline.edges).toEqual([{ from: "orchestrator", to: "Gather AR" }, { from: "Gather AR", to: "Notify Customer" }]);
    expect(pipeline.executionGraph.map((s: any) => s.agents)).toEqual([["Gather AR"], ["Notify Customer"]]);
  });
});
