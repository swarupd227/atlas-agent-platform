/**
 * Turning a process flow into a running automation, from the conversation.
 *
 * Cowork could draw a flow and change it, and then had nothing to say when the
 * user asked how to make it run: propose_team planned from an outcome or from a
 * description, never from the flow sitting in the library. The Studio's own
 * button did it, so the answer was "leave the conversation".
 *
 * What this file pins is the three things that make the new path honest rather
 * than merely present: the flow reaches the build, so the team is linked to the
 * drawing and mirrors its steps; a plan that lost the flow's ordering says so
 * instead of being described as following the process; and a team built from a
 * flow is attached to no outcome, which is stated with the action that fixes it
 * rather than left as a dead warning.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { runTurn, resolveAction, type EngineDeps } from "../server/astra/engine";
import { ToolRegistry } from "../server/astra/registry";
import { MemoryThreadStore } from "../server/astra/memory-store";
import { scriptedComplete, result, call } from "../server/astra/scripted-brain";
import { finishTurnTool } from "../server/astra/tools/finish-turn";
import { automateProcessFlowTool } from "../server/astra/tools/process-flow";
import { buildTeamTool } from "../server/astra/tools/build-team";
import { attachTeamToOutcomeTool, measurementLine } from "../server/astra/tools/attach-outcome";
import { flowIdOf, flowOwnerId, threadIdOf, threadOwnerId } from "../server/astra/team-draft";
import { hasPermission, type RoleId } from "../server/permissions";
import type { AstraContext } from "../server/astra/types";

const ORG = "org-a";
const as = (role: RoleId): AstraContext => ({ orgId: ORG, userId: "u1", role, industryId: "equipment_dealer" });
const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");

const plan = () => ({
  orchestrator: { name: "Refund Handling Team", description: "Runs refunds" },
  agents: [
    { name: "Intake Agent", role: "intake", description: "Reads the request", flowStepLabels: ["Refund requested"] },
    { name: "Manager Approval", role: "approval", description: "A person approves", isHumanCheckpoint: true, flowStepLabels: ["Manager approves refund"] },
    { name: "Payout Agent", role: "payout", description: "Pays it out", flowStepLabels: ["Pay the customer"] },
  ],
  pipeline: { pattern: "sequential", description: "One step after another", edges: [] },
  proposalId: "prop-1",
});

interface Options {
  sequencing?: { ok: false; warning: string } | { ok: true };
  flowWarnings?: string[];
  flowGone?: boolean;
  structureWarnings?: string[];
  attachedTo?: string | null;
  measurement?: { kpis: number; fromRuns: number; byHand: number; undeclared: number; agentsAttached: number };
}

function setup(steps: Parameters<typeof scriptedComplete>[0], opts: Options = {}) {
  const store = new MemoryThreadStore();
  const threadId = store.createThread(ORG);
  const state = { built: [] as any[], attached: [] as any[] };
  const flow = { id: "flow-1", name: "Refund handling", steps: 3, warnings: opts.flowWarnings ?? [] };
  const services = {
    proposeTeamForFlow: vi.fn(async (org: string, _thread: string, flowId: string) =>
      org === ORG && flowId === "flow-1"
        ? {
            ok: true as const,
            flow,
            plan: plan(),
            proposalId: "prop-1",
            bindings: { agents: plan().agents.map((a) => ({ name: a.name, connectors: [], issues: [] })), issues: [], connectorsChecked: 4 },
            sequencing: opts.sequencing ?? { ok: true as const },
          }
        : { ok: false as const, error: "No process flow with that id in this organization." }),
    getProposalForBuild: vi.fn(async (org: string, id: string) =>
      org === ORG && id === "prop-1"
        ? {
            proposal: { id: "prop-1", status: "draft", orchestrator: plan().orchestrator, workers: plan().agents, pipeline: plan().pipeline },
            outcome: null,
            pendingReviewApprovalId: null,
            ...(opts.flowGone ? { flowGone: true } : { flow: { id: flow.id, name: flow.name, steps: flow.steps } }),
            hash: "h1",
          }
        : null),
    assessBindings: vi.fn(async (_org: string, agents: any[]) => ({
      agents: agents.map((a) => ({ name: a.name, connectors: [], issues: [] })),
      issues: [],
      connectorsChecked: 4,
    })),
    resolvePolicyNames: vi.fn(async () => ({ resolved: [], unresolved: [] })),
    buildTeam: vi.fn(async (org: string, body: any) => {
      state.built.push({ org, body });
      return {
        teamAgent: { id: "team-1", name: body.orchestrator.name },
        blueprint: { id: "bp-1" },
        workers: body.workers.map((w: any, i: number) => ({ id: `w-${i}`, name: w.name, status: "active" })),
        unconnectedBindings: [],
        unresolvedBindings: [],
        structureWarnings: opts.structureWarnings ?? [],
      };
    }),
    markProposalBuilt: vi.fn(async () => {}),
    listTeams: vi.fn(async () => [{ id: "team-1", name: "Refund Handling Team", status: "active", riskTier: "MEDIUM", blueprintId: "bp-1" }]),
    listOutcomeNames: vi.fn(async () => [{ id: "out-1", name: "Refunds settled same day" }, { id: "out-2", name: "Refund accuracy" }]),
    getAgent: vi.fn(async (_org: string, id: string) => ({ id, name: "Refund Handling Team", outcomeId: opts.attachedTo ?? null })),
    outcomeMeasurement: vi.fn(async (_org: string, outcomeId: string) => ({
      outcome: { id: outcomeId, name: "Refunds settled same day", status: "active" },
      ...(opts.measurement ?? { kpis: 3, fromRuns: 1, byHand: 1, undeclared: 1, agentsAttached: 2 }),
    })),
    attachTeamToOutcomeAs: vi.fn(async (_org: string, _uid: string | null, actor: string, teamId: string, outcomeId: string) => {
      state.attached.push({ actor, teamId, outcomeId });
      return {
        agent: { id: teamId, name: "Refund Handling Team" },
        outcome: { id: outcomeId, name: "Refunds settled same day", status: "active" },
        movedFrom: opts.attachedTo ?? null,
        kpiCount: 3,
        kpisReRead: 1,
        evalCases: 6,
      };
    }),
    getUserDisplayName: vi.fn(async () => "admin"),
  };
  const deps: EngineDeps = {
    store,
    registry: new ToolRegistry([finishTurnTool, automateProcessFlowTool, buildTeamTool, attachTeamToOutcomeTool], hasPermission),
    complete: scriptedComplete(steps),
    can: hasPermission,
    audit: vi.fn(async () => {}),
    services,
    model: "test",
  };
  return { store, threadId, deps, services, state, onEvent: () => {} };
}

const automate = (args: Record<string, unknown> = { flow: "flow-1" }) => ({ toolCalls: [{ name: "automate_process_flow", arguments: args }] });
const build = () => ({ toolCalls: [{ name: "build_team", arguments: { proposalId: "prop-1" } }] });
const attach = (args: Record<string, unknown> = { team: "Refund Handling Team", outcome: "Refunds settled same day" }) => ({
  toolCalls: [{ name: "attach_team_to_outcome", arguments: args }],
});
const done = (text: string) => result(text, [call("finish_turn", { suggestions: [] })]);
const lastTool = (messages: any[]) => JSON.parse(messages.filter((m) => m.role === "tool").at(-1).content);
const pending = async (t: ReturnType<typeof setup>) => (await t.store.loadThread(t.threadId, ORG))!.pendingAction!;

describe("planning the team a flow would become", () => {
  it("plans from the saved flow, and says what building it does and does not do", async () => {
    const t = setup([
      automate(),
      (m) => {
        const payload = lastTool(m).result;
        expect(payload).toMatchObject({ planned: true, proposalId: "prop-1", orchestrator: "Refund Handling Team", orderedFromTheFlow: true });
        expect(payload.flow).toMatchObject({ id: "flow-1", name: "Refund handling", steps: 3 });
        // Which of the flow's steps each agent covers: the link between the
        // drawing and the team, and what the ordering rests on.
        expect(payload.agents.map((a: any) => a.covers)).toEqual([["Refund requested"], ["Manager approves refund"], ["Pay the customer"]]);
        expect(payload.approvalGates).toEqual(["Manager Approval"]);
        expect(payload.next).toContain("attach_team_to_outcome");
        expect(payload.next).toContain("Building is not deploying");
        return done("Planned.");
      },
    ]);
    expect(await runTurn(t.deps, as("admin"), t.threadId, "Turn the refund flow into an automation", t.onEvent)).toBe("idle");
    expect(t.services.proposeTeamForFlow).toHaveBeenCalled();
    // Planning builds nothing.
    expect(t.services.buildTeam).not.toHaveBeenCalled();
  });

  it("says the flow's own order was not carried into the team, rather than calling it sequenced", async () => {
    // The planner reports this when no agent claimed a step: the team would run
    // every agent at once, so the decisions and gates in the drawing enforce
    // nothing. Summarizing it away is how a fan-out ships as a process.
    const warning = "The drafted agents did not say which process-flow steps they cover.";
    const t = setup([], { sequencing: { ok: false, warning } });
    const r = await automateProcessFlowTool.run!(
      { orgId: ORG, userId: "u1", role: "admin", industryId: null, threadId: "t1", services: t.services } as any,
      { flow: "flow-1" },
    );
    expect(r.payload).toMatchObject({ orderedFromTheFlow: false, sequencing: warning });
    expect(r.proof!.context).toMatchObject({ status: "not_measured" });
  });

  it("passes on what the compiler flags about the flow itself", async () => {
    const t = setup([], { flowWarnings: ["No step starts this flow."] });
    const r = await automateProcessFlowTool.run!(
      { orgId: ORG, userId: "u1", role: "admin", industryId: null, threadId: "t1", services: t.services } as any,
      { flow: "flow-1" },
    );
    expect((r.payload as any).flowNeedsChecking).toEqual(["No step starts this flow."]);
  });

  it("refuses a flow that isn't this organization's", async () => {
    const t = setup([automate({ flow: "flow-x" }), (m) => { expect(lastTool(m).result.error).toContain("No process flow with that id"); return done("Not here."); }]);
    await runTurn(t.deps, as("admin"), t.threadId, "Automate it", t.onEvent);
  });

  it("isn't offered to a role that can't create agents", async () => {
    const t = setup([automate(), (m) => { expect(lastTool(m).error).toMatch(/No tool named "automate_process_flow"/); return done("Can't."); }]);
    await runTurn(t.deps, as("outcome_owner"), t.threadId, "Automate it", t.onEvent);
    expect(t.services.proposeTeamForFlow).not.toHaveBeenCalled();
  });
});

describe("building what was planned from a flow", () => {
  it("carries the flow into the build, so the team mirrors it and the flow records the journey", async () => {
    const t = setup([build(), done("Built.")]);
    expect(await runTurn(t.deps, as("admin"), t.threadId, "Build it", t.onEvent)).toBe("awaiting_confirmation");
    const action = await pending(t);
    expect(action.summary).toContain('from the process flow "Refund handling"');
    expect(action.details!.join(" ")).toContain('Follows "Refund handling" as it is drawn now (3 steps)');

    await resolveAction(t.deps, as("admin"), t.threadId, action.id, "confirm", t.onEvent);
    expect(t.state.built).toHaveLength(1);
    // The build reads the flow's authored steps itself and links flow to team.
    expect(t.state.built[0].body.processFlowId).toBe("flow-1");
    expect(t.state.built[0].body.outcomeId).toBeUndefined();
  });

  it("offers the step that makes it measurable, instead of only naming the gap", async () => {
    const t = setup([build(), done("Built.")]);
    await runTurn(t.deps, as("admin"), t.threadId, "Build it", t.onEvent);
    const noOutcome = (await pending(t)).warnings!.find((w) => w.title === "No outcome behind this team")!;
    expect(noOutcome.detail).toContain("attach it to one afterwards");
  });

  it("reports what the build itself found about the team's shape", async () => {
    // The build has always reported these; nothing read them, so a team that
    // lost its ordering was announced as built and nothing more.
    const shape = "This team has no order: all 3 agents run at once, because the plan carried no connections between them.";
    const t = setup([
      build(),
      (m) => {
        expect(lastTool(m).result).toMatchObject({ built: true, fromProcessFlow: "Refund handling", linkedToFlow: true, toTellTheUser: [shape] });
        expect(lastTool(m).result.next).toContain("attach_team_to_outcome");
        return done("Built, with a warning.");
      },
    ], { structureWarnings: [shape] });
    await runTurn(t.deps, as("admin"), t.threadId, "Build it", t.onEvent);
    await resolveAction(t.deps, as("admin"), t.threadId, (await pending(t)).id, "confirm", t.onEvent);
  });

  it("says when the flow was deleted between planning and building", async () => {
    const t = setup([build(), done("Built.")], { flowGone: true });
    await runTurn(t.deps, as("admin"), t.threadId, "Build it", t.onEvent);
    const action = await pending(t);
    expect(action.warnings!.map((w) => w.title)).toContain("The process flow this was planned from is gone");
    await resolveAction(t.deps, as("admin"), t.threadId, action.id, "confirm", t.onEvent);
    expect(t.state.built[0].body.processFlowId).toBeUndefined();
  });
});

describe("attaching it to an outcome", () => {
  it("says what attaching moves, and what it leaves alone", async () => {
    const t = setup([attach(), done("Attached.")]);
    expect(await runTurn(t.deps, as("admin"), t.threadId, "Attach it to the same-day refunds outcome", t.onEvent)).toBe("awaiting_confirmation");
    const action = await pending(t);
    expect(action.summary).toBe('Attach "Refund Handling Team" to the outcome "Refunds settled same day"');
    const details = action.details!.join(" ");
    expect(details).toContain("1 measured from agent runs, re-read now");
    expect(details).toContain("1 read by a person, unchanged");
    expect(details).toContain("1 with no source declared, so not measured");
    expect(details).toContain("Nothing is deployed and nothing runs");
    expect(t.services.attachTeamToOutcomeAs).not.toHaveBeenCalled();

    await resolveAction(t.deps, as("admin"), t.threadId, action.id, "confirm", t.onEvent);
    expect(t.state.attached).toEqual([{ actor: "admin", teamId: "team-1", outcomeId: "out-1" }]);
  });

  it("warns when nothing here is measured from runs, rather than implying the outcome now measures itself", async () => {
    const t = setup([attach(), done("Attached.")], { measurement: { kpis: 2, fromRuns: 0, byHand: 2, undeclared: 0, agentsAttached: 0 } });
    await runTurn(t.deps, as("admin"), t.threadId, "Attach it", t.onEvent);
    expect((await pending(t)).warnings!.map((w) => w.title)).toContain("No KPI here is measured from agent runs");
  });

  it("warns that a team already on another outcome moves", async () => {
    const t = setup([attach(), done("Attached.")], { attachedTo: "out-2" });
    await runTurn(t.deps, as("admin"), t.threadId, "Attach it", t.onEvent);
    expect((await pending(t)).warnings!.map((w) => w.title)).toContain("This team is attached to another outcome");
  });

  it("refuses when it is already attached to that outcome, and when the outcome is ambiguous", async () => {
    const already = setup([attach(), (m) => { expect(lastTool(m).error).toContain("already attached"); return done("Already there."); }], { attachedTo: "out-1" });
    expect(await runTurn(already.deps, as("admin"), already.threadId, "Attach it", already.onEvent)).toBe("idle");

    const ambiguous = setup([attach({ team: "Refund Handling Team", outcome: "Refund" }), (m) => { expect(lastTool(m).error).toContain("Several outcomes match"); return done("Which one?"); }]);
    await runTurn(ambiguous.deps, as("admin"), ambiguous.threadId, "Attach it", ambiguous.onEvent);
    expect(ambiguous.services.attachTeamToOutcomeAs).not.toHaveBeenCalled();
  });

  it("reads as a line about measurement, including when there is none", () => {
    const base = { outcome: { id: "out-1", name: "Refunds settled same day", status: "active" }, agentsAttached: 0 };
    expect(measurementLine({ ...base, kpis: 0, fromRuns: 0, byHand: 0, undeclared: 0 })).toContain("has no KPIs, so attaching the team still measures nothing");
    expect(measurementLine({ ...base, kpis: 1, fromRuns: 1, byHand: 0, undeclared: 0 })).toBe("1 KPI: 1 measured from agent runs, re-read now.");
  });
});

describe("which plan belongs to which flow", () => {
  it("remembers the flow a plan was made from, without a column for it", () => {
    const owner = flowOwnerId("thread-9", "flow-1");
    expect(threadIdOf(owner)).toBe("thread-9");
    expect(flowIdOf(owner)).toBe("flow-1");
    // A plan made from a description still belongs to its conversation alone.
    expect(threadIdOf(threadOwnerId("thread-9"))).toBe("thread-9");
    expect(flowIdOf(threadOwnerId("thread-9"))).toBeNull();
    // An outcome's own plan is neither.
    expect(threadIdOf("out-1")).toBeNull();
    expect(flowIdOf("out-1")).toBeNull();
  });
});

describe("what Astra is told about making a flow live", () => {
  it("separates built, deployed and run rather than calling any of them live", () => {
    const prompt = read("server", "astra", "prompt.ts");
    expect(prompt).toContain("built means the agents exist, deployed means they are released, run means they did the work");
    expect(prompt).toContain("attach_team_to_outcome");
  });

  it("offers both tools to every conversation, not behind a studio pack", () => {
    const wiring = read("server", "astra", "wiring.ts");
    expect(wiring).toContain("attachTeamToOutcomeTool");
    expect(automateProcessFlowTool.pack).toBeUndefined();
    expect(attachTeamToOutcomeTool.pack).toBeUndefined();
  });
});
