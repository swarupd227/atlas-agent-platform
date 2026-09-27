/**
 * Seeing what is running, stopping an automation, cancelling a run.
 *
 * Gaps 3 and 5 from an outside-in look, together because they are one
 * conversation: "stop it" is useless if you can't see what is going. Before
 * this, "what's running right now?" had no tool behind it at all -- /status
 * asked the question, get_team_run needed an id the user doesn't have, and
 * list_needs_me only covers decisions.
 *
 * The thing this file mostly exists to pin is the honesty of the word "stopped".
 * Stopping an automation stops it FIRING: it does not cancel a run in flight,
 * and nothing in the run paths checks a paused state, so a person can still run
 * it by hand. Both limits are on the card, because "stopped" otherwise sounds
 * like "out of service".
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { runTurn, resolveAction, type EngineDeps } from "../server/astra/engine";
import { ToolRegistry } from "../server/astra/registry";
import { MemoryThreadStore } from "../server/astra/memory-store";
import { scriptedComplete, result, call } from "../server/astra/scripted-brain";
import { finishTurnTool } from "../server/astra/tools/finish-turn";
import { AUTOMATION_CONTROL_TOOLS } from "../server/astra/tools/automation-control";
import { hasPermission, type RoleId } from "../server/permissions";
import type { AstraContext } from "../server/astra/types";

const ORG = "org-a";
const as = (role: RoleId): AstraContext => ({ orgId: ORG, userId: "u1", role, industryId: "insurance" });
const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");
const minutesAgo = (n: number) => new Date(Date.now() - n * 60000).toISOString();

interface Options {
  teamRuns?: any[];
  agentRuns?: any[];
  runStatus?: string;
  waitingOnApprovalId?: string | null;
  deployments?: Array<{ id: string; environment: string; status: string; runtimeActive: boolean }>;
  inFlightRuns?: Array<{ id: string; status: string }>;
}

function setup(steps: Parameters<typeof scriptedComplete>[0], opts: Options = {}) {
  const store = new MemoryThreadStore();
  const threadId = store.createThread(ORG);
  const done: any[] = [];
  const services = {
    listAgents: vi.fn(async () => [{ id: "team-1", name: "E&S Binding Team", organizationId: ORG }]),
    runningWork: vi.fn(async () => ({
      teamRuns: opts.teamRuns ?? [
        { id: "run-1", team: "E&S Binding Team", teamAgentId: "team-1", status: "waiting_approval", waitingOnApprovalId: "apr-9", startedAt: minutesAgo(12), request: "Bind submission 4417 for Gulf Coast Storage" },
        { id: "run-2", team: "Claims Triage", teamAgentId: "team-2", status: "running", waitingOnApprovalId: null, startedAt: minutesAgo(3), request: null },
      ],
      agentRuns: opts.agentRuns ?? [{ id: "ws-1", agent: "Wind Exposure Scorer", agentId: "a1", status: "running", startedAt: minutesAgo(1), request: "Score 4417" }],
    })),
    cancellableRun: vi.fn(async (_org: string, id: string) => {
      if (id !== "run-1") throw new Error("No run with that id in this organization.");
      const status = opts.runStatus ?? "waiting_approval";
      return {
        run: { id, status, waitingOnApprovalId: opts.waitingOnApprovalId === undefined ? "apr-9" : opts.waitingOnApprovalId, startedAt: minutesAgo(12), request: "Bind submission 4417" },
        team: { id: "team-1", name: "E&S Binding Team" },
        cancellable: ["running", "waiting_approval"].includes(status),
      };
    }),
    cancelRunAs: vi.fn(async (_org: string, id: string, reason: string, actor: string) => {
      done.push({ act: "cancel", id, reason, actor });
      return { cancelled: true, stoppedLiveExecution: true, runId: id };
    }),
    planStopAutomation: vi.fn(async (_org: string, agentId: string) => ({
      agent: { id: agentId, name: "E&S Binding Team", agentType: "team" },
      deployments: opts.deployments ?? [{ id: "d1", environment: "prod", status: "active", runtimeActive: true }],
      inFlightRuns: opts.inFlightRuns ?? [],
    })),
    stopAutomationAs: vi.fn(async (_org: string, agentId: string, actor: string) => {
      done.push({ act: "stop", agentId, actor });
      return { agent: { id: agentId, name: "E&S Binding Team" }, stopped: (opts.deployments ?? [{ id: "d1", environment: "prod", status: "active", runtimeActive: true }]).map((d) => ({ id: d.id, environment: d.environment, wasRunning: d.runtimeActive })), inFlightRuns: (opts.inFlightRuns ?? []).map((r) => r.id) };
    }),
    getUserDisplayName: vi.fn(async () => "admin"),
  };
  const deps: EngineDeps = {
    store,
    registry: new ToolRegistry([finishTurnTool, ...AUTOMATION_CONTROL_TOOLS], hasPermission),
    complete: scriptedComplete(steps),
    can: hasPermission,
    audit: vi.fn(async () => {}),
    services,
    model: "test",
  };
  return { store, threadId, deps, services, done, onEvent: () => {} };
}

const use = (name: string, args: Record<string, unknown> = {}) => ({ toolCalls: [{ name, arguments: args }] });
const reply = (text: string) => result(text, [call("finish_turn", { suggestions: [] })]);
const lastTool = (messages: any[]) => JSON.parse(messages.filter((m) => m.role === "tool").at(-1).content);
const pending = async (t: ReturnType<typeof setup>) => (await t.store.loadThread(t.threadId, ORG))!.pendingAction!;

beforeEach(() => vi.clearAllMocks());

describe("what's running", () => {
  it("answers the question that had no tool behind it, and says what each run is waiting on", async () => {
    const t = setup([
      use("list_runs"),
      (m) => {
        const p = lastTool(m).result;
        expect(p.message).toBe("3 in flight, 1 waiting for an approval");
        expect(p.teamRuns[0]).toMatchObject({ runId: "run-1", team: "E&S Binding Team", status: "waiting_approval", waitingOnApprovalId: "apr-9" });
        expect(p.teamRuns[0].minutesRunning).toBe(12);
        expect(p.agentRuns[0]).toMatchObject({ agent: "Wind Exposure Scorer", status: "running" });
        return reply("Three things are going.");
      },
    ]);
    await runTurn(t.deps, as("admin"), t.threadId, "What's running right now?", t.onEvent);
  });

  it("says nothing is running rather than returning an empty list", async () => {
    const t = setup([use("list_runs"), (m) => { expect(lastTool(m).result).toMatchObject({ total: 0, message: "Nothing is running" }); expect(lastTool(m).result.note).toContain("run history"); return reply("Nothing."); }], { teamRuns: [], agentRuns: [] });
    await runTurn(t.deps, as("admin"), t.threadId, "Anything running?", t.onEvent);
  });
});

describe("cancelling a run", () => {
  it("says what cancelling does and does not undo, and records the reason", async () => {
    const t = setup([use("cancel_run", { run: "run-1", reason: "Broker withdrew the submission" }), reply("Cancelled.")]);
    expect(await runTurn(t.deps, as("admin"), t.threadId, "Cancel that run", t.onEvent)).toBe("awaiting_confirmation");
    const action = await pending(t);
    expect(action.summary).toContain("Cancel the E&S Binding Team run (12 min in)");
    expect(action.details!.join(" ")).toContain("Reason recorded: Broker withdrew the submission");
    const titles = action.warnings!.map((w) => w.title);
    expect(titles).toContain("The approval it is waiting on is rejected");
    expect(titles).toContain("What it already did is not undone");

    await resolveAction(t.deps, as("admin"), t.threadId, action.id, "confirm", t.onEvent);
    expect(t.done).toEqual([{ act: "cancel", id: "run-1", reason: "Broker withdrew the submission", actor: "admin" }]);
  });

  it("doesn't mention rejecting an approval when the run isn't waiting on one", async () => {
    const t = setup([use("cancel_run", { run: "run-1", reason: "No longer needed" }), reply("Cancelled.")], { runStatus: "running", waitingOnApprovalId: null });
    await runTurn(t.deps, as("admin"), t.threadId, "Cancel it", t.onEvent);
    expect((await pending(t)).warnings!.map((w) => w.title)).not.toContain("The approval it is waiting on is rejected");
  });

  it("refuses a run that has already finished", async () => {
    const t = setup([use("cancel_run", { run: "run-1", reason: "Too late" }), (m) => { expect(lastTool(m).error).toContain("nothing to cancel"); return reply("Already done."); }], { runStatus: "completed" });
    expect(await runTurn(t.deps, as("admin"), t.threadId, "Cancel it", t.onEvent)).toBe("idle");
    expect(t.services.cancelRunAs).not.toHaveBeenCalled();
  });

  it("refuses a run that isn't this organization's", async () => {
    const t = setup([use("cancel_run", { run: "someone-elses", reason: "Curiosity" }), (m) => { expect(lastTool(m).error).toContain("No run with that id"); return reply("Not here."); }]);
    await runTurn(t.deps, as("admin"), t.threadId, "Cancel it", t.onEvent);
  });
});

describe("stopping an automation", () => {
  it("is explicit that it does not prevent a run by hand", async () => {
    const t = setup([use("stop_automation", { agent: "E&S Binding Team" }), reply("Stopped.")]);
    expect(await runTurn(t.deps, as("admin"), t.threadId, "Stop the binding team", t.onEvent)).toBe("awaiting_confirmation");
    const action = await pending(t);
    expect(action.summary).toBe("Stop E&S Binding Team firing (prod)");
    const byHand = action.warnings!.find((w) => w.title === "This does not prevent it being run by hand")!;
    expect(byHand.detail).toContain("roll the deployment back");
    expect(action.details!.join(" ")).toContain("marked inactive");

    await resolveAction(t.deps, as("admin"), t.threadId, action.id, "confirm", t.onEvent);
    expect(t.done).toEqual([{ act: "stop", agentId: "team-1", actor: "admin" }]);
  });

  it("says a run already in flight keeps going, and points at the tool that ends it", async () => {
    const t = setup([use("stop_automation", { agent: "E&S Binding Team" }), (m) => { expect(lastTool(m).result.next).toContain("cancel_run"); return reply("Stopped, but a run is going."); }], {
      inFlightRuns: [{ id: "run-1", status: "running" }],
    });
    await runTurn(t.deps, as("admin"), t.threadId, "Stop it", t.onEvent);
    const action = await pending(t);
    expect(action.warnings!.map((w) => w.title)).toContain("1 run already in flight keep going");
    await resolveAction(t.deps, as("admin"), t.threadId, action.id, "confirm", t.onEvent);
  });

  it("says when no runtime is actually live, rather than implying it stopped something", async () => {
    const t = setup([use("stop_automation", { agent: "E&S Binding Team" }), reply("Nothing was live.")], {
      deployments: [{ id: "d1", environment: "staging", status: "active", runtimeActive: false }],
    });
    await runTurn(t.deps, as("admin"), t.threadId, "Stop it", t.onEvent);
    expect((await pending(t)).warnings!.map((w) => w.title)).toContain("No runtime is actually live right now");
  });

  it("refuses when there is no live deployment at all, and points at the runs if there are any", async () => {
    const t = setup([use("stop_automation", { agent: "E&S Binding Team" }), (m) => { expect(lastTool(m).error).toContain("cancel_run stops those"); return reply("Nothing to stop."); }], {
      deployments: [],
      inFlightRuns: [{ id: "run-1", status: "running" }],
    });
    expect(await runTurn(t.deps, as("admin"), t.threadId, "Stop it", t.onEvent)).toBe("idle");
    expect(t.services.stopAutomationAs).not.toHaveBeenCalled();
  });

  it("is offered by role the way the equivalent routes are gated", () => {
    const registry = setup([]).deps.registry;
    const names = (role: RoleId) => registry.canonicalDefinitions(role).map((d) => d.name);
    expect(names("admin")).toEqual(expect.arrayContaining(["list_runs", "cancel_run", "stop_automation"]));
    // Reading what runs is not the same permission as ending it.
    expect(names("outcome_owner")).toContain("list_runs");
    expect(names("outcome_owner")).not.toContain("cancel_run");
  });
});

describe("what the platform actually supports", () => {
  it("cancels through the engine's own cancel, so a live executor is aborted and the approval decided", () => {
    const control = read("server", "automation-control.ts");
    expect(control).toContain('import { cancelTeamAgentDagRun } from "./dag-execution-engine";');
  });

  it("checks each deployment against the organization before stopping anything", () => {
    // The runtime functions take a deployment id and check nothing themselves.
    const control = read("server", "automation-control.ts");
    const body = control.slice(control.indexOf("export async function stopAutomationAs"));
    expect(body).toContain("const owned = await storage.getDeployment(dep.id, orgId);");
    expect(body.indexOf("getDeployment")).toBeLessThan(body.indexOf("stopAgentRuntime"));
  });

  it("tells the model the two acts are different and what stopping does not do", () => {
    const prompt = read("server", "astra", "prompt.ts");
    expect(prompt).toContain("does NOT prevent someone running it by hand");
    expect(prompt).toContain("rolling the deployment back is what takes it out of service");
  });
});
