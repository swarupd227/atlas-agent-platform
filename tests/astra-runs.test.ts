/**
 * The Runs pack.
 *
 * The measurement behind it, read off the live fleet on 2026-09-28 across the 85
 * most recent team runs: 536 of 1,501 steps never ran, 61 of 85 runs skipped at
 * least one, and only 14 completed cleanly. The usual recorded status was
 * `completed_with_skips` — including on the E&S Placement Orchestrator, which ran
 * 4 of its 22 steps and never reached the step that binds the policy. Cowork
 * could report that run's status and cost, and nothing else.
 *
 * What this file pins is the honesty of the answers:
 * - a status never appears without how much of the run happened;
 * - a skipped step never appears without its cause, and the two causes that are
 *   defects are separated from the two that are a graph working as drawn;
 * - the cause comes from the run's GRAPH, so a cascade whose recorded message
 *   talks about its own condition is not reported as a dead gate — 14 of the 22
 *   steps that had never run were in exactly that position;
 * - a run that needs nobody says so with the number examined, rather than
 *   answering with silence;
 * - a link from a conversation to the page lands on the run it names.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { runTurn, type EngineDeps } from "../server/astra/engine";
import { ToolRegistry } from "../server/astra/registry";
import { MemoryThreadStore } from "../server/astra/memory-store";
import { scriptedComplete, result, call } from "../server/astra/scripted-brain";
import { finishTurnTool } from "../server/astra/tools/finish-turn";
import { loadToolsTool } from "../server/astra/tools/load-tools";
import { RUNS_TOOLS } from "../server/astra/tools/runs";
import { isProblemCause, skipCauseAdvice, skipCauseLabel } from "../shared/run-words";
import { PACKS } from "../server/astra/packs";
import { buildAstraSystemPrompt } from "../server/astra/prompt";
import { hasPermission, type RoleId } from "../server/permissions";
import type { AstraContext } from "../server/astra/types";

const db = vi.hoisted(() => ({ runs: [] as any[], agents: new Map<string, any>(), nodes: [] as any[], edges: [] as any[] }));

vi.mock("../server/storage", () => ({
  storage: {
    listDagExecutionRunsByOrg: vi.fn(async () => db.runs),
    listDagExecutionRunsByTeamAgent: vi.fn(async (teamId: string) => db.runs.filter((r) => r.teamAgentId === teamId)),
    getDagExecutionRun: vi.fn(async (id: string) => db.runs.find((r) => r.id === id)),
    getAgent: vi.fn(async (id: string) => db.agents.get(id)),
    getTeamBlueprintNodes: vi.fn(async () => db.nodes),
    getTeamBlueprintEdges: vi.fn(async () => db.edges),
  },
}));

const { compareRuns, runsNeedingAttention, causeOfSkip } = await import("../server/run-actions");

const ORG = "org-a";
const TEAM = "E&S Property Placement Orchestrator";
const as = (role: RoleId): AstraContext => ({ orgId: ORG, userId: "u1", role, industryId: "insurance" });
const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");

/** The live run: 22 steps, 4 of them ran, recorded as a success. */
const summary = (over: Record<string, unknown> = {}) => ({
  id: "run-a",
  team: { id: "team-1", name: TEAM },
  status: "completed_with_skips",
  startedAt: "2026-09-28T10:00:00.000Z",
  completedAt: "2026-09-28T10:04:00.000Z",
  durationMs: 240_000,
  steps: { total: 22, ran: 4, skipped: 18, failed: 0 },
  costUsd: 0.55,
  stuck: false,
  problemSkips: 2,
  waitingOnApproval: false,
  ...over,
});

const step = (nodeId: string, label: string, status: string, cause: string | null, detail: string | null = null) => ({
  nodeId,
  label,
  stateKey: null,
  status,
  cause,
  detail,
  durationMs: status === "completed" ? 4_000 : null,
  costUsd: status === "completed" ? 0.1 : null,
  toolCalls: null,
});

/** The real chain: a dead gate at step 4, and everything behind it a cascade. */
const explainFixture = (over: Record<string, unknown> = {}) => ({
  run: summary(),
  steps: [
    step("n1", "Intake submission", "completed", null),
    step("n2", "Lookup filing requirements", "completed", null),
    step("n3", "Confidence and mandatory fields check", "completed", null),
    step("n4", "Pre-bind quality check", "completed", null),
    step("n5", "Policy binder and ledger poster", "skipped", "missing_field", "No incoming edge condition was satisfied and no upstream step output the routing field pre_bind_quality_check.passed"),
    step("n6", "Endorsement router", "skipped", "missing_field", "No incoming edge condition was satisfied and no upstream step output the routing field endorsement_accepted.approved"),
    step("n7", "Manual review queue", "skipped", "condition_false", "No incoming edge condition was satisfied"),
    step("n8", "Notify broker of decline", "skipped", "predecessor_skipped", "The step before it did not run (policy_binder_and_ledger_poster), so its own condition was never evaluated"),
  ],
  byCause: { missing_field: 2, condition_false: 1, predecessor_skipped: 1 },
  planKnown: true,
  ...over,
});

interface Options {
  explain?: any;
  attention?: any;
  compare?: any;
  never?: any;
  teams?: any[];
}

function setup(steps: Parameters<typeof scriptedComplete>[0], opts: Options = {}) {
  const store = new MemoryThreadStore();
  const threadId = store.createThread(ORG);
  const services = {
    listTeams: vi.fn(async () => opts.teams ?? [{ id: "team-1", name: TEAM, status: "active", riskTier: "HIGH", blueprintId: "bp-1" }]),
    explainRun: vi.fn(async () => {
      if (opts.explain instanceof Error) throw opts.explain;
      return opts.explain ?? explainFixture();
    }),
    runsNeedingAttention: vi.fn(async () => opts.attention ?? {
      runs: [
        { ...summary(), reasons: ["2 steps were skipped by a condition that can never be satisfied"], problemSteps: [{ label: "Policy binder and ledger poster", cause: "missing_field", detail: null }, { label: "Endorsement router", cause: "missing_field", detail: null }] },
        { ...summary({ id: "run-b", status: "failed", steps: { total: 12, ran: 9, skipped: 0, failed: 1 } }), reasons: ["It failed"], problemSteps: [] },
      ],
      examined: 40,
      causesFrom: "graph",
    }),
    compareRuns: vi.fn(async () => {
      if (opts.compare instanceof Error) throw opts.compare;
      return opts.compare ?? {
        team: { id: "team-1", name: TEAM },
        runs: { a: summary(), b: summary({ id: "run-old", status: "completed", steps: { total: 22, ran: 22, skipped: 0, failed: 0 } }) },
        againstChosen: "the team's previous run",
        differences: [
          { label: "Policy binder and ledger poster", nodeId: "n5", a: { status: "skipped", cause: "missing_field" }, b: { status: "completed", cause: null } },
        ],
        sameSteps: 21,
        stepsOnlyIn: { a: [], b: [] },
      };
    }),
    stepsNeverRun: vi.fn(async () => opts.never ?? {
      team: { id: "team-1", name: TEAM },
      runsExamined: 5,
      steps: [{ nodeId: "n5", label: "Policy binder and ledger poster", seen: 5 }],
    }),
  };
  const deps: EngineDeps = {
    store,
    registry: new ToolRegistry([finishTurnTool, loadToolsTool, ...RUNS_TOOLS], hasPermission),
    complete: scriptedComplete(steps),
    can: hasPermission,
    audit: vi.fn(async () => {}),
    services,
    model: "test",
  };
  return { store, threadId, deps, services, onEvent: () => {} };
}

const load = () => ({ toolCalls: [{ name: "load_tools", arguments: { pack: "runs" } }] });
const use = (name: string, args: Record<string, unknown> = {}) => ({ toolCalls: [{ name, arguments: args }] });
const done = (text: string) => result(text, [call("finish_turn", { suggestions: [] })]);
const lastTool = (messages: any[]) => JSON.parse(messages.filter((m) => m.role === "tool").at(-1).content);

const node = (id: string, status: string, error: string | null = null) => ({ nodeId: id, status, error });
const rawRun = (over: Record<string, unknown> = {}) => ({
  id: "run-1",
  teamAgentId: "team-1",
  status: "completed_with_skips",
  startedAt: new Date("2026-09-28T10:00:00Z"),
  completedAt: new Date("2026-09-28T10:04:00Z"),
  totalCostUsd: 0.55,
  waveResults: [{ nodes: [] }],
  ...over,
});

beforeEach(() => {
  db.runs = [];
  db.nodes = [];
  db.edges = [];
  db.agents = new Map([["team-1", { id: "team-1", name: TEAM, blueprintId: "bp-1" }]]);
});
afterEach(() => vi.clearAllMocks());

describe("the pack", () => {
  it("is offered, and its tools arrive only once it is loaded", () => {
    expect(PACKS.map((p) => p.id)).toContain("runs");
    const registry = setup([]).deps.registry;
    const core = registry.canonicalDefinitions("admin").map((d) => d.name);
    expect(core).not.toContain("explain_run");
    const loaded = registry.canonicalDefinitions("admin", ["runs"]).map((d) => d.name);
    expect(loaded).toEqual(expect.arrayContaining(["explain_run", "why_skipped", "runs_needing_attention", "steps_never_run", "compare_runs"]));
  });

  it("says starting and following runs need no pack, since those are core", () => {
    expect(PACKS.find((p) => p.id === "runs")!.description).toContain("needs no pack");
  });

  it("changes nothing, so no tool in it asks for a confirmation", () => {
    expect(RUNS_TOOLS.every((t) => t.confirm === false)).toBe(true);
    expect(RUNS_TOOLS.every((t) => t.permission === "view_agents")).toBe(true);
  });

  it("offers no tool that claims to re-run from a step, because the engine cannot", () => {
    // resumeFromWave resumes a run paused at a gate or interrupted; it cannot
    // start an existing run again from an arbitrary step. A tool named for that
    // would describe a capability the platform does not have.
    expect(RUNS_TOOLS.map((t) => t.name)).not.toContain("rerun_from");
    expect(read("server", "astra", "tools", "runs.ts")).toContain("run_team starts a\n * fresh run");
  });
});

describe("what a run actually did", () => {
  it("answers with how much of it ran, never with the status alone", async () => {
    const t = setup([
      load(),
      use("explain_run", { run: "run-a" }),
      (m) => {
        const p = lastTool(m).result;
        expect(p.headline).toBe("Completed — 4 of 22 steps ran");
        expect(p.effort).toBe("$0.55 for 4 of 22 steps");
        expect(p.stepsSkipped).toBe(18);
        return done("4 of 22 steps ran.");
      },
    ]);
    await runTurn(t.deps, as("admin"), t.threadId, "What happened in run-a?", t.onEvent);
  });

  it("separates the steps no run can reach from the branches that routed elsewhere", async () => {
    const t = setup([
      load(),
      use("explain_run", { run: "run-a" }),
      (m) => {
        const p = lastTool(m).result;
        expect(p.defects.map((d: any) => d.step)).toEqual(["Policy binder and ledger poster", "Endorsement router"]);
        expect(p.defects[0].why).toContain("can never be taken");
        expect(p.whatThisMeans).toContain("the run still reports completed");
        // The cascade and the false condition are NOT defects: sending somebody
        // to look at them is how 536 skips stayed unexamined.
        expect(p.skippedByRouting.map((s: any) => s.cause)).toEqual(["condition_false", "predecessor_skipped"]);
        expect(p.defects.map((d: any) => d.step)).not.toContain("Notify broker of decline");
        return done("Two steps can never be reached.");
      },
    ]);
    await runTurn(t.deps, as("admin"), t.threadId, "Why did run-a skip so much?", t.onEvent);
  });

  it("says when the causes come from recorded messages instead of the graph", async () => {
    const t = setup([
      load(),
      use("explain_run", { run: "run-a" }),
      (m) => {
        const p = lastTool(m).result;
        expect(p.causesFrom).toContain("recorded message");
        expect(p.causesFrom).toContain("before 2026-09-29");
        return done("Read from the messages.");
      },
    ], { explain: explainFixture({ planKnown: false }) });
    await runTurn(t.deps, as("admin"), t.threadId, "Why did run-a skip so much?", t.onEvent);
  });

  it("does not invent a run it cannot read", async () => {
    const t = setup([
      load(),
      use("explain_run", { run: "nope" }),
      (m) => {
        const p = lastTool(m).result;
        expect(p.explained).toBe(false);
        expect(p.message).toContain("another organization");
        return done("Not yours.");
      },
    ], { explain: new Error("That run belongs to another organization.") });
    await runTurn(t.deps, as("admin"), t.threadId, "Explain run nope", t.onEvent);
  });
});

describe("why one step was skipped", () => {
  it("finds the step by its label and says what to do about that particular cause", async () => {
    const t = setup([
      load(),
      use("why_skipped", { run: "run-a", step: "policy binder" }),
      (m) => {
        const p = lastTool(m).result;
        expect(p.step).toBe("Policy binder and ledger poster");
        expect(p.isDefect).toBe(true);
        expect(p.message).toContain("can never be taken");
        expect(p.recorded).toContain("pre_bind_quality_check.passed");
        return done("It can never run.");
      },
    ]);
    await runTurn(t.deps, as("admin"), t.threadId, "Why was the policy binder skipped in run-a?", t.onEvent);
  });

  it("calls a cascade a cascade, and points upstream rather than at the step", async () => {
    const t = setup([
      load(),
      use("why_skipped", { run: "run-a", step: "Notify broker of decline" }),
      (m) => {
        const p = lastTool(m).result;
        expect(p.cause).toBe("predecessor_skipped");
        expect(p.isDefect).toBe(false);
        expect(p.message).toContain("Look further upstream");
        return done("Its predecessor never ran.");
      },
    ]);
    await runTurn(t.deps, as("admin"), t.threadId, "Why was the decline notice skipped?", t.onEvent);
  });

  it("says a step ran when it ran, rather than answering the question asked", async () => {
    const t = setup([
      load(),
      use("why_skipped", { run: "run-a", step: "Intake submission" }),
      (m) => {
        const p = lastTool(m).result;
        expect(p.message).toContain("was not skipped");
        expect(p.status).toBe("completed");
        return done("It ran.");
      },
    ]);
    await runTurn(t.deps, as("admin"), t.threadId, "Why was intake skipped?", t.onEvent);
  });

  it("lists every skipped step when no step is named, and says how many are defects", async () => {
    const t = setup([
      load(),
      use("why_skipped", { run: "run-a" }),
      (m) => {
        const p = lastTool(m).result;
        expect(p.skipped).toHaveLength(4);
        expect(p.worthAPersonsTime).toContain("2 of 4 are defects");
        return done("Two of four.");
      },
    ]);
    await runTurn(t.deps, as("admin"), t.threadId, "What was skipped in run-a?", t.onEvent);
  });

  it("says nothing was skipped without implying something is wrong", async () => {
    const clean = { run: summary({ status: "completed", steps: { total: 6, ran: 6, skipped: 0, failed: 0 } }), steps: [step("n1", "Intake", "completed", null)], byCause: {}, planKnown: true };
    const t = setup([
      load(),
      use("why_skipped", { run: "run-a" }),
      (m) => {
        const p = lastTool(m).result;
        expect(p.message).toContain("Nothing was skipped");
        expect(p.message).toContain("every step ran");
        return done("Nothing skipped.");
      },
    ], { explain: clean });
    await runTurn(t.deps, as("admin"), t.threadId, "What was skipped?", t.onEvent);
  });
});

describe("which runs need somebody", () => {
  it("gives the reason each run is on the list, not just the run", async () => {
    const t = setup([
      load(),
      use("runs_needing_attention"),
      (m) => {
        const p = lastTool(m).result;
        expect(p.needingAttention).toBe(2);
        expect(p.examined).toBe(40);
        expect(p.runs[0].why).toContain("2 steps were skipped by a condition that can never be satisfied");
        expect(p.runs[0].unreachableSteps[0]).toContain("Policy binder and ledger poster");
        expect(p.runs[1].why).toContain("It failed");
        expect(p.causesFrom).toContain("graph");
        return done("Two runs.");
      },
    ]);
    await runTurn(t.deps, as("admin"), t.threadId, "Which runs need me?", t.onEvent);
  });

  it("answers an empty list with the number examined, rather than with silence", async () => {
    const t = setup([
      load(),
      use("runs_needing_attention"),
      (m) => {
        const p = lastTool(m).result;
        expect(p.needingAttention).toBe(0);
        expect(p.message).toContain("last 40 runs");
        expect(p.message).toContain("none failed");
        return done("Nothing to do.");
      },
    ], { attention: { runs: [], examined: 40, causesFrom: "graph" } });
    await runTurn(t.deps, as("admin"), t.threadId, "Which runs need me?", t.onEvent);
  });
});

describe("two runs of the same team", () => {
  it("names the step that ran then and not now, with what to do about it", async () => {
    const t = setup([
      load(),
      use("compare_runs", { run: "run-a" }),
      (m) => {
        const p = lastTool(m).result;
        expect(p.against).toBe("the team's previous run");
        expect(p.stoppedRunning[0].step).toBe("Policy binder and ledger poster");
        expect(p.stoppedRunning[0].nowSkippedBecause).toContain("read a field nothing produced");
        expect(p.thisRun.headline).toBe("Completed — 4 of 22 steps ran");
        expect(p.otherRun.headline).toBe("Completed — every step ran");
        return done("One step stopped running.");
      },
    ]);
    await runTurn(t.deps, as("admin"), t.threadId, "It worked last week — compare run-a with the one before.", t.onEvent);
  });

  it("refuses two runs of different teams instead of lining up unrelated steps", async () => {
    const t = setup([
      load(),
      use("compare_runs", { run: "run-a", against: "run-z" }),
      (m) => {
        const p = lastTool(m).result;
        expect(p.compared).toBe(false);
        expect(p.message).toContain("different teams");
        return done("Different teams.");
      },
    ], { compare: new Error("Those two runs are of different teams, so their steps cannot be lined up. Compare runs of one team.") });
    await runTurn(t.deps, as("admin"), t.threadId, "Compare run-a with run-z", t.onEvent);
  });
});

describe("steps a team never runs", () => {
  it("refuses to call anything 'never' from fewer than three runs", async () => {
    const t = setup([
      load(),
      use("steps_never_run", { team: TEAM }),
      (m) => {
        const p = lastTool(m).result;
        expect(p.checked).toBe(false);
        expect(p.message).toContain("Three are needed");
        return done("Not enough runs.");
      },
    ], { never: { team: { id: "team-1", name: TEAM }, runsExamined: 2, steps: [] } });
    await runTurn(t.deps, as("admin"), t.threadId, "Which steps never run?", t.onEvent);
  });

  it("says which steps were skipped in every run, and where to look next", async () => {
    const t = setup([
      load(),
      use("steps_never_run", { team: TEAM }),
      (m) => {
        const p = lastTool(m).result;
        expect(p.stepsNeverRun).toBe(1);
        expect(p.steps[0]).toMatchObject({ step: "Policy binder and ledger poster", skippedInAllOf: 5 });
        expect(p.whatThisMeans).toContain("verify_wiring");
        return done("One step never runs.");
      },
    ]);
    await runTurn(t.deps, as("admin"), t.threadId, "Which steps of the placement orchestrator never run?", t.onEvent);
  });
});

describe("the cause comes from the graph, not from the message", () => {
  it("does not flag a cascade whose recorded message talks about its own condition", async () => {
    // The live shape, and the reason this matters: 14 of the 22 steps that had
    // never run were cascades, every one of them carrying the dead-gate wording.
    const cascadeMessage = "No incoming edge condition was satisfied and no upstream step output the routing field pre_bind_quality_check.passed";
    db.nodes = [
      { id: "n1", label: "Gate" },
      { id: "n2", label: "Binder" },
      { id: "n3", label: "Ledger poster" },
    ];
    db.edges = [
      { id: "e1", sourceNodeId: "n1", targetNodeId: "n2" },
      { id: "e2", sourceNodeId: "n2", targetNodeId: "n3" },
    ];
    db.runs = [
      rawRun({ id: "r1", waveResults: [{ nodes: [node("n1", "completed"), node("n2", "skipped", cascadeMessage), node("n3", "skipped", cascadeMessage)] }] }),
    ];

    const r = await runsNeedingAttention(ORG, 10);
    expect(r.causesFrom).toBe("graph");
    expect(r.runs).toHaveLength(1);
    // n2's own gate really is dead; n3 only follows it, so it is NOT reported as
    // a second defect however its message reads.
    expect(r.runs[0].problemSteps.map((s) => s.label)).toEqual(["Binder"]);
  });

  it("leaves a run that only routed elsewhere off the list entirely", async () => {
    db.nodes = [{ id: "n1", label: "Gate" }, { id: "n2", label: "Manual review" }];
    db.edges = [{ id: "e1", sourceNodeId: "n1", targetNodeId: "n2" }];
    db.runs = [
      rawRun({ id: "r1", status: "completed_with_skips", waveResults: [{ nodes: [node("n1", "completed"), node("n2", "skipped", "No incoming edge condition was satisfied")] }] }),
    ];
    const r = await runsNeedingAttention(ORG, 10);
    expect(r.examined).toBe(1);
    expect(r.runs).toHaveLength(0);
  });

  it("flags a failed run even when it skipped nothing", async () => {
    db.runs = [rawRun({ id: "r1", status: "failed", waveResults: [{ nodes: [node("n1", "failed")] }] })];
    const r = await runsNeedingAttention(ORG, 10);
    expect(r.runs[0].reasons).toContain("It failed");
  });
});

describe("comparing two runs", () => {
  it("picks the team's previous run, and only a run older than this one", async () => {
    db.nodes = [{ id: "n1", label: "Binder" }];
    db.runs = [
      rawRun({ id: "newer", startedAt: new Date("2026-09-28T12:00:00Z"), waveResults: [{ nodes: [node("n1", "completed")] }] }),
      rawRun({ id: "this", startedAt: new Date("2026-09-28T10:00:00Z"), waveResults: [{ nodes: [node("n1", "skipped", "No incoming edge condition was satisfied and no upstream step output the routing field x.y")] }] }),
      rawRun({ id: "older", startedAt: new Date("2026-09-27T10:00:00Z"), waveResults: [{ nodes: [node("n1", "completed")] }] }),
    ];
    const r = await compareRuns(ORG, "this");
    expect(r.againstChosen).toBe("the team's previous run");
    expect(r.runs.b.id).toBe("older");
    expect(r.differences[0]).toMatchObject({ label: "Binder", a: { status: "skipped", cause: "missing_field" }, b: { status: "completed", cause: null } });
  });

  it("says the team was edited rather than comparing steps that only exist in one run", async () => {
    db.nodes = [{ id: "n1", label: "Binder" }, { id: "n2", label: "New step" }];
    db.runs = [
      rawRun({ id: "this", startedAt: new Date("2026-09-28T10:00:00Z"), waveResults: [{ nodes: [node("n1", "completed"), node("n2", "completed")] }] }),
      rawRun({ id: "older", startedAt: new Date("2026-09-27T10:00:00Z"), waveResults: [{ nodes: [node("n1", "completed")] }] }),
    ];
    const r = await compareRuns(ORG, "this");
    expect(r.stepsOnlyIn.a).toEqual(["New step"]);
    expect(r.stepsOnlyIn.b).toEqual([]);
    expect(r.differences).toHaveLength(0);
  });

  it("refuses when there is nothing to compare with, instead of comparing a run with itself", async () => {
    db.runs = [rawRun({ id: "only", waveResults: [{ nodes: [node("n1", "completed")] }] })];
    await expect(compareRuns(ORG, "only")).rejects.toThrow(/only run so far/);
  });

  it("will not compare runs of different teams", async () => {
    db.agents.set("team-2", { id: "team-2", name: "Another team", blueprintId: "bp-2" });
    db.runs = [
      rawRun({ id: "a", waveResults: [{ nodes: [] }] }),
      rawRun({ id: "b", teamAgentId: "team-2", waveResults: [{ nodes: [] }] }),
    ];
    await expect(compareRuns(ORG, "a", "b")).rejects.toThrow(/different teams/);
  });
});

describe("the link from a conversation to the page", () => {
  it("names the run, and the page reads it", () => {
    expect(read("server", "astra", "tools", "runs.ts")).toContain("/runs?run=${encodeURIComponent");
    const page = read("client", "src", "pages", "runs.tsx");
    expect(page).toContain('new URLSearchParams(search).get("run")');
    // A linked run outside the loaded window must say so rather than let the
    // fallback selection present a different run under the link followed.
    expect(page).toContain("linkedMissing");
  });
});

describe("the rule the whole surface rests on", () => {
  const grounding = (toolNames: string[]) => ({ toolNames, organizationName: "Artizent", packs: [] }) as any;

  it("tells the model never to report a status without how much of the run happened", () => {
    const prompt = buildAstraSystemPrompt(as("admin"), grounding(["explain_run"]));
    expect(prompt).toContain("Never report a run's status on its own");
    expect(prompt).toContain("completed_with_skips");
    // And which causes are defects, since that is the half that changes what a
    // person does next.
    expect(prompt).toContain("can never run in ANY run");
  });

  it("does not carry the rule when the pack is not loaded", () => {
    expect(buildAstraSystemPrompt(as("admin"), grounding(["list_agents"]))).not.toContain("Never report a run's status");
  });
});

/**
 * A silent producer is not a dead gate.
 *
 * The live case that forced this apart (2026-09-29): the E&S carrier approval
 * gate has two incoming edges, one reading
 * `cat_accumulation_by_zone.concentrationBreached`. That step is an Expression
 * node computing the verdict as `$heaviest.shareOfCoastalLimitPct > 35`, and
 * with no coastal exposure `$heaviest` is undefined — JSONata then drops the
 * key entirely. So the field is reported as one "nothing produces" in exactly
 * the runs where the gate correctly should not fire, while the gate COMPLETES
 * in the runs that do have coastal exposure (verified on runs ed8d0f03 and
 * 66b81217). Across the 60 most recent runs, 7 of the 15 `missing_field` skips
 * were this, and the Runs pack was calling all 15 defects.
 */
describe("a producing step that ran and said nothing", () => {
  const MSG = (f: string) => `No incoming edge condition was satisfied (no upstream step output the routing field ${f})`;
  const FIELD = "cat_accumulation_by_zone.concentrationBreached";

  it("is not a defect, and says the producer ran", () => {
    expect(isProblemCause("producer_omitted_field")).toBe(false);
    expect(skipCauseLabel("producer_omitted_field")).toContain("ran without reporting it");
    expect(skipCauseAdvice("producer_omitted_field")).toContain("Routing is correct");
  });

  it("separates the silent producer from the field nothing produces, in stored runs", () => {
    const node = { nodeId: "gate", error: MSG(FIELD) };
    const none = new Map<string, string[]>();
    const statuses = new Map<string, string>();

    // The real inland shape: the step wrote its numbers, without the verdict.
    const inland = { cat_accumulation_by_zone: { zoneCount: 3, coastalZoneCount: 0, concentrationThresholdPct: 35 } };
    expect(causeOfSkip(node, none, statuses, inland)).toBe("producer_omitted_field");

    // Nothing wrote under that key at all: the branch really is unreachable.
    expect(causeOfSkip(node, none, statuses, { evaluate_treaty_limits: { breached: false } })).toBe("missing_field");

    // The verdict only ever moves on positive evidence of a silent producer.
    // If the field resolves in the final state, the recorded message and the
    // state disagree — which a real run cannot produce, since the engine writes
    // the message from that same state — so nothing is inferred and the
    // message's own verdict stands rather than a third reading being invented.
    const coastal = { cat_accumulation_by_zone: { concentrationBreached: false } };
    expect(causeOfSkip(node, none, statuses, coastal)).toBe("missing_field");
  });

  it("keeps a cascade a cascade, whatever the message says about fields", () => {
    const incoming = new Map([["gate", ["upstream"]]]);
    const statuses = new Map([["upstream", "skipped"]]);
    const inland = { cat_accumulation_by_zone: { coastalZoneCount: 0 } };
    expect(causeOfSkip({ nodeId: "gate", error: MSG(FIELD) }, incoming, statuses, inland)).toBe("predecessor_skipped");
  });

  it("does not reclassify without the run's state, so an unknown stays honest", () => {
    expect(causeOfSkip({ nodeId: "gate", error: MSG(FIELD) }, new Map(), new Map())).toBe("missing_field");
  });

  it("reads a partially-reported producer as silent rather than as a dead field", () => {
    // Only SOME of the named fields resolving means the others were omitted by
    // a producer that ran; both halves have to be omitted before the verdict
    // flips, so a genuinely dead field is never hidden behind a live one.
    const twoFields = { nodeId: "gate", error: `No incoming edge condition was satisfied (no upstream step output the routing fields ${FIELD}, ghost_step.flag)` };
    const state = { cat_accumulation_by_zone: { zoneCount: 3 } };
    expect(causeOfSkip(twoFields, new Map(), new Map(), state)).toBe("missing_field");
  });

  it("stops counting a silent producer as a run that needs attention", async () => {
    db.nodes = [{ id: "n1", label: "CAT Accumulation by Zone Agent" }, { id: "n2", label: "Carrier Underwriter Approval Agent" }];
    db.edges = [{ id: "e1", sourceNodeId: "n1", targetNodeId: "n2" }];
    db.runs = [rawRun({
      id: "inland",
      status: "completed_with_skips",
      finalState: { cat_accumulation_by_zone: { zoneCount: 3, coastalZoneCount: 0 } },
      waveResults: [{ nodes: [node("n1", "completed"), node("n2", "skipped", MSG(FIELD))] }],
    })];
    const quiet = await runsNeedingAttention(ORG, 10);
    expect(quiet.examined).toBe(1);
    expect(quiet.runs).toHaveLength(0);

    // The same message with nothing written under that key is still raised.
    db.runs = [rawRun({
      id: "dead",
      status: "completed_with_skips",
      finalState: { something_else: { ok: true } },
      waveResults: [{ nodes: [node("n1", "completed"), node("n2", "skipped", MSG(FIELD))] }],
    })];
    const raised = await runsNeedingAttention(ORG, 10);
    expect(raised.runs).toHaveLength(1);
    expect(raised.runs[0].problemSteps.map((s) => s.label)).toEqual(["Carrier Underwriter Approval Agent"]);
  });
});
