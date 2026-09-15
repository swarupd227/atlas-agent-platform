/**
 * run_team and get_team_run through the engine, against a simulated team run
 * with approval gates.
 */
import { describe, it, expect, vi } from "vitest";
import { runTurn, resolveAction, type EngineDeps } from "../server/astra/engine";
import { ToolRegistry } from "../server/astra/registry";
import { MemoryThreadStore } from "../server/astra/memory-store";
import { scriptedComplete, result, call } from "../server/astra/scripted-brain";
import { finishTurnTool } from "../server/astra/tools/finish-turn";
import { runTeamTool, getTeamRunTool } from "../server/astra/tools/run-team";
import { canDecideApproval, hasPermission, type RoleId } from "../server/permissions";
import type { AstraContext, AstraEvent } from "../server/astra/types";

const ORG = "org-a";
const as = (role: RoleId): AstraContext => ({ orgId: ORG, userId: "u1", role });

function world(opts: { gates?: string[]; blockers?: string[] } = {}) {
  const gates = [...(opts.gates ?? [])];
  const run = { id: "run-1", status: "running", pendingApprovalId: null as string | null, steps: [] as any[], answer: null as string | null };
  const decisions: any[] = [];
  let gateNo = 0;

  const advance = () => {
    run.steps.push({ wave: run.steps.length + 1, label: `Step ${run.steps.length + 1}`, status: "completed", error: null, durationMs: 10 });
    const gate = gates.shift();
    if (gate) {
      gateNo += 1;
      run.status = "waiting_approval";
      run.pendingApprovalId = `apr-${gateNo}`;
    } else {
      run.status = "completed";
      run.pendingApprovalId = null;
      run.answer = "Transfer plan ready: move 3 excavators from BR-011 to BR-022.";
    }
  };

  const view = () => ({
    id: run.id, team: { id: "team-1", name: "Fleet Team" }, status: run.status, currentWave: run.steps.length, totalWaves: 3, error: null,
    costUsd: 0.02, toolCalls: 2, steps: [...run.steps], answer: run.answer,
    pending: run.pendingApprovalId ? { approvalId: run.pendingApprovalId, label: `Gate ${gateNo}`, description: "Approve the transfer" } : null,
  });

  const services = {
    listTeams: vi.fn(async (org: string) => (org === ORG ? [{ id: "team-1", name: "Fleet Team", status: "active", riskTier: "MEDIUM", blueprintId: "bp-1" }] : [])),
    verifyTeamWiring: vi.fn(async () => ({
      team: { id: "team-1", name: "Fleet Team" },
      steps: ["Gather", "Manager Approval", "Execute"],
      connectors: [{ name: "Dealer Operations", writeTools: 30, connected: true }],
      report: {
        ready: !(opts.blockers?.length), blockers: opts.blockers?.length ?? 0, warnings: 0, gates: 1, agentsChecked: 3, totalWaves: 3,
        issues: [
          ...(opts.blockers ?? []).map((m) => ({ severity: "blocker", code: "x", message: m })),
          { severity: "info", code: "approval_gate", message: 'The run pauses at "Manager Approval" for a person to approve.' },
        ],
      },
    })),
    startTeamRun: vi.fn(async (org: string, teamId: string, request: string) => {
      expect([org, teamId]).toEqual([ORG, "team-1"]);
      advance();
      return { dagRunId: run.id, totalWaves: 3, request };
    }),
    followTeamRun: vi.fn(async (_org: string, _id: string, o: any) => {
      o.onEvent({ type: "node_start", ts: "t", label: "Step 1" });
      o.onEvent({ type: "node_complete", ts: "t", label: "Step 1", status: "completed" });
      if (run.status === "waiting_approval" && run.pendingApprovalId !== o.ignoreApprovalId) return { state: "paused", approvalId: run.pendingApprovalId, label: `Gate ${gateNo}` };
      return run.status === "completed" || run.status === "failed" ? { state: "finished", status: run.status } : { state: "still_running" };
    }),
    getTeamRunRow: vi.fn(async (org: string, id: string) => (org === ORG && id === run.id ? { row: { status: run.status, pendingApprovalId: run.pendingApprovalId }, team: { id: "team-1" } } : null)),
    getTeamRun: vi.fn(async (org: string, _role: string, id: string) => (org === ORG && id === run.id ? view() : null)),
    getApprovalForDecision: vi.fn(async (_org: string, role: RoleId, id: string) => ({ id, status: "pending", description: "Approve the transfer", canDecide: canDecideApproval(role, null) })),
    getUserDisplayName: vi.fn(async () => "admin"),
    decideApprovalAs: vi.fn(async (...args: any[]) => {
      decisions.push(args);
      if (args[5] === "rejected") {
        run.status = "failed";
        run.pendingApprovalId = null;
      } else {
        advance();
      }
      return { approval: {}, outcomeStatus: null };
    }),
  };
  return { run, services, decisions };
}

function setup(steps: Parameters<typeof scriptedComplete>[0], w = world()) {
  const store = new MemoryThreadStore();
  const threadId = store.createThread(ORG);
  const events: AstraEvent[] = [];
  const deps: EngineDeps = {
    store,
    registry: new ToolRegistry([finishTurnTool, runTeamTool, getTeamRunTool], hasPermission),
    complete: scriptedComplete(steps),
    can: hasPermission,
    audit: vi.fn(async () => {}),
    services: w.services,
    model: "test",
  };
  return { ...w, store, threadId, deps, events, onEvent: (e: AstraEvent) => events.push(e) };
}

const runIt = { toolCalls: [{ name: "run_team", arguments: { team: "Fleet Team", request: "Balance the fleet for next week" } }] };
const done = (text: string) => result(text, [call("finish_turn", { suggestions: [] })]);
const lastTool = (messages: any[]) => JSON.parse(messages.filter((m) => m.role === "tool").at(-1).content);
const pending = async (t: ReturnType<typeof setup>) => (await t.store.loadThread(t.threadId, ORG))!.pendingAction!;

describe("run_team", () => {
  it("asks first, showing steps, gates and write-capable connectors; starts nothing until Confirm", async () => {
    const t = setup([runIt]);
    expect(await runTurn(t.deps, as("admin"), t.threadId, "Run it", t.onEvent)).toBe("awaiting_confirmation");
    const action = await pending(t);
    expect(action).toMatchObject({ kind: "tool_confirm", summary: "Run Fleet Team" });
    expect(action.details!.join(" ")).toContain("Steps: Gather → Manager Approval → Execute.");
    expect(action.details!.join(" ")).toContain("Pauses for a person at: Manager Approval.");
    expect(action.details!.join(" ")).toContain("Dealer Operations (30 write tools)");
    expect(t.services.startTeamRun).not.toHaveBeenCalled();
  });

  it("runs, narrates, pauses at a gate on a card, and on Confirm approves it and runs to the answer", async () => {
    const t = setup(
      [runIt, (m) => {
        const r = lastTool(m).result;
        expect(r).toMatchObject({ status: "completed", stepsDone: 2, answer: expect.stringContaining("3 excavators"), decisionsMadeHere: ['"Gate 1" approved by you on its approval card · audit recorded'] });
        return done("The team finished.");
      }],
      world({ gates: ["Manager Approval"] }),
    );
    await runTurn(t.deps, as("admin"), t.threadId, "Run it", t.onEvent);
    await resolveAction(t.deps, as("admin"), t.threadId, (await pending(t)).id, "confirm", t.onEvent);

    const gate = await pending(t);
    expect(gate).toMatchObject({ kind: "agent_approval", summary: "Fleet Team is waiting for approval: Gate 1" });
    expect(gate.details!.join(" ")).toContain("Not now rejects it, and the run stops here.");
    expect(t.events.some((e) => e.type === "tool_start" && (e as any).tool === "Fleet Team › Step 1")).toBe(true);

    expect(await resolveAction(t.deps, as("admin"), t.threadId, gate.id, "confirm", t.onEvent)).toBe("idle");
    expect(t.decisions[0]).toEqual([ORG, "admin", "u1", "admin", "apr-1", "approved"]);
    const final = t.store.threadMessages(t.threadId).at(-1)!;
    expect(final.artifacts[0]).toMatchObject({ kind: "teamRun", fullViewHref: "/dag-runs/run-1" });
    expect(final.proof!.compliance).toMatchObject({ summary: expect.stringContaining('"Gate 1" approved by you on its approval card') });
  });

  it("Not now at a gate rejects it and reports the stopped run", async () => {
    const t = setup([runIt, (m) => { expect(lastTool(m).result).toMatchObject({ status: "failed" }); return done("Stopped."); }], world({ gates: ["Manager Approval"] }));
    await runTurn(t.deps, as("admin"), t.threadId, "Run it", t.onEvent);
    await resolveAction(t.deps, as("admin"), t.threadId, (await pending(t)).id, "confirm", t.onEvent);
    await resolveAction(t.deps, as("admin"), t.threadId, (await pending(t)).id, "cancel", t.onEvent);
    expect(t.decisions[0][5]).toBe("rejected");
  });

  it("Not now on the start card starts nothing", async () => {
    const t = setup([runIt, (m) => { expect(lastTool(m).result).toEqual({ started: false, message: "Not started." }); return done("Okay."); }]);
    await runTurn(t.deps, as("admin"), t.threadId, "Run it", t.onEvent);
    await resolveAction(t.deps, as("admin"), t.threadId, (await pending(t)).id, "cancel", t.onEvent);
    expect(t.services.startTeamRun).not.toHaveBeenCalled();
  });

  it("sends nothing when the gate was already decided elsewhere", async () => {
    const t = setup([runIt, (m) => { expect(lastTool(m).result.notes[0]).toContain("already decided elsewhere"); return done("It was decided elsewhere."); }], world({ gates: ["Manager Approval"] }));
    await runTurn(t.deps, as("admin"), t.threadId, "Run it", t.onEvent);
    await resolveAction(t.deps, as("admin"), t.threadId, (await pending(t)).id, "confirm", t.onEvent);
    t.run.status = "completed";
    t.run.pendingApprovalId = null;
    await resolveAction(t.deps, as("admin"), t.threadId, (await pending(t)).id, "confirm", t.onEvent);
    expect(t.decisions).toHaveLength(0);
  });

  it("won't start a team whose wiring has blockers", async () => {
    const t = setup([runIt, (m) => { expect(lastTool(m).error).toContain("Gather AR belongs to another organization"); return done("It can't run."); }], world({ blockers: ["Gather AR belongs to another organization."] }));
    expect(await runTurn(t.deps, as("admin"), t.threadId, "Run it", t.onEvent)).toBe("idle");
    expect(t.services.startTeamRun).not.toHaveBeenCalled();
  });

  it("a role that can run but not approve gets no gate card, only where to decide it", async () => {
    const t = setup([runIt, (m) => { expect(lastTool(m).result).toMatchObject({ status: "waiting_approval", message: expect.stringContaining("Needs you") }); return done("Waiting on an approver."); }], world({ gates: ["Manager Approval"] }));
    await runTurn(t.deps, as("agent_engineer"), t.threadId, "Run it", t.onEvent);
    expect(await resolveAction(t.deps, as("agent_engineer"), t.threadId, (await pending(t)).id, "confirm", t.onEvent)).toBe("idle");
  });
});

describe("get_team_run", () => {
  it("reports a run in the organization and refuses one outside it", async () => {
    const w = world();
    const t = setup([
      { toolCalls: [{ name: "get_team_run", arguments: { runId: "run-1" } }] },
      (m) => { expect(lastTool(m).result).toMatchObject({ found: true, team: "Fleet Team", status: "running" }); return result("", [call("get_team_run", { runId: "run-x" })]); },
      (m) => { expect(lastTool(m).result).toMatchObject({ found: false }); return done("Done."); },
    ], w);
    await runTurn(t.deps, as("admin"), t.threadId, "How is run-1 doing?", t.onEvent);
  });
});
