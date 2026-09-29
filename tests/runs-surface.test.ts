/**
 * The Runs surface.
 *
 * Measured on the live fleet 2026-09-28, across the 85 most recent team runs:
 * 536 of 1,501 steps never ran, 61 of 85 runs skipped at least one, and only 14
 * completed cleanly. Nearly all of them were recorded `completed_with_skips` —
 * a word that reads as success on a run where the step that binds the policy
 * never executed.
 *
 * What these tests pin is the honesty of the surface rather than its layout:
 * a status is never shown without how much of the run happened; a skipped step
 * always carries WHY; and the why is worked out from the run's own graph, so
 * runs recorded before the engine distinguished the causes are classified just
 * as well as new ones.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  causeFromMessage, durationWords, effortWords, isProblemCause, isStuck,
  runHeadline, runTone, skipCauseAdvice, skipCauseLabel,
} from "../shared/run-words";

const db = vi.hoisted(() => ({ runs: [] as any[], agents: new Map<string, any>(), nodes: [] as any[], edges: [] as any[] }));

vi.mock("../server/storage", () => ({
  storage: {
    listDagExecutionRunsByOrg: vi.fn(async () => db.runs),
    listDagExecutionRunsByTeamAgent: vi.fn(async () => db.runs),
    getDagExecutionRun: vi.fn(async (id: string) => db.runs.find((r) => r.id === id)),
    getAgent: vi.fn(async (id: string) => db.agents.get(id)),
    getTeamBlueprintNodes: vi.fn(async () => db.nodes),
    getTeamBlueprintEdges: vi.fn(async () => db.edges),
  },
}));

const { runsOverview, explainRun, causeOfSkip, stepsNeverRun } = await import("../server/run-actions");

const node = (id: string, status: string, error: string | null = null, extra: Record<string, unknown> = {}) => ({ nodeId: id, status, error, ...extra });
const run = (over: Record<string, unknown> = {}) => ({
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
  db.agents = new Map([["team-1", { id: "team-1", name: "E&S Property Placement Orchestrator", blueprintId: "bp-1" }]]);
});

describe("a status is never shown on its own", () => {
  it("reads completed_with_skips as what it is: a run that did part of its work", () => {
    // The live case: 4 of 22 steps ran, recorded as completed_with_skips.
    expect(runHeadline("completed_with_skips", 4, 22)).toBe("Completed — 4 of 22 steps ran");
    expect(runHeadline("completed", 22, 22)).toBe("Completed — every step ran");
    expect(runHeadline("failed", 4, 27)).toBe("Failed — 4 of 27 steps ran");
    expect(runHeadline("running", 7, 9)).toBe("Running — 7 of 9 steps ran so far");
  });

  it("colours a partial run as needing attention even when it says completed", () => {
    expect(runTone("completed_with_skips", 4, 22)).toBe("warn");
    expect(runTone("completed", 22, 22)).toBe("good");
    expect(runTone("failed", 1, 3)).toBe("bad");
  });

  it("puts cost against what was done, because the two only mean something together", () => {
    expect(effortWords(0.55, 4, 22)).toBe("$0.55 for 4 of 22 steps");
    expect(effortWords(0.55, 22, 22)).toBe("$0.55 for all 22 steps");
    expect(effortWords(null, 1, 2)).toContain("no recorded cost");
  });

  it("knows a run that has stopped moving", () => {
    const now = new Date("2026-09-28T12:00:00Z").getTime();
    expect(isStuck("running", "2026-09-28T10:00:00Z", null, now)).toBe(true);
    expect(isStuck("running", "2026-09-28T11:45:00Z", null, now)).toBe(false);
    // A heartbeat is newer evidence than the start time.
    expect(isStuck("running", "2026-09-28T10:00:00Z", "2026-09-28T11:50:00Z", now)).toBe(false);
    expect(isStuck("completed", "2026-09-01T10:00:00Z", null, now)).toBe(false);
  });

  it("says durations the way a person would", () => {
    expect(durationWords(45_000)).toBe("45s");
    expect(durationWords(3_600_000)).toBe("1h 0m");
    expect(durationWords(null)).toBe("—");
  });
});

describe("why a step was skipped", () => {
  it("separates the causes, and only two of them are defects", () => {
    expect(skipCauseLabel("predecessor_skipped")).toBe("The step before it never ran");
    expect(skipCauseAdvice("condition_false")).toContain("Working as drawn");
    expect(skipCauseAdvice("missing_field")).toContain("A real defect");
    expect(isProblemCause("missing_field")).toBe(true);
    expect(isProblemCause("no_condition")).toBe(true);
    expect(isProblemCause("condition_false")).toBe(false);
    expect(isProblemCause("predecessor_skipped")).toBe(false);
  });

  it("reads the engine's own wording", () => {
    expect(causeFromMessage("The step before it did not run (confidence_check), so its own condition was never evaluated")).toBe("predecessor_skipped");
    expect(causeFromMessage("No condition to evaluate: the edge from x carries no condition")).toBe("no_condition");
    expect(causeFromMessage("No incoming edge condition was satisfied (no upstream step output the routing field a.b)")).toBe("missing_field");
    expect(causeFromMessage("No incoming edge condition was satisfied")).toBe("condition_false");
    expect(causeFromMessage(null)).toBe("unknown");
  });

  it("lets the GRAPH overrule the message, which is what makes old runs legible", () => {
    // The live shape: 14 of the 22 steps that had never run were skipped because
    // their predecessor never ran, while every one of them recorded a message
    // about its own condition. Every run before 2026-09-29 looks like this.
    const incoming = new Map([["c", ["b"]], ["b", ["a"]]]);
    const statusById = new Map([["a", "completed"], ["b", "skipped"], ["c", "skipped"]]);
    expect(causeOfSkip({ nodeId: "b", error: "No incoming edge condition was satisfied" }, incoming, statusById)).toBe("condition_false");
    expect(causeOfSkip({ nodeId: "c", error: "No incoming edge condition was satisfied" }, incoming, statusById)).toBe("predecessor_skipped");
  });

  it("falls back to the message when the graph is unknown", () => {
    expect(causeOfSkip({ nodeId: "x", error: "No condition to evaluate: the edge from y carries no condition" }, new Map(), new Map())).toBe("no_condition");
  });
});

describe("explaining one run", () => {
  beforeEach(() => {
    db.nodes = [
      { id: "a", label: "Confidence and Mandatory Fields Checker", stateKey: "confidence_check" },
      { id: "b", label: "Schedule Fetcher", stateKey: "fetch_schedule" },
      { id: "c", label: "Policy Binder and Ledger Poster", stateKey: "policy_binder" },
    ];
    db.edges = [
      { id: "e1", sourceNodeId: "a", targetNodeId: "b", evaluationMode: "deterministic", rule: { combinator: "AND", conditions: [{ field: "confidence_check.needsReview", operator: "==", value: false }] } },
      { id: "e2", sourceNodeId: "b", targetNodeId: "c", evaluationMode: "deterministic", rule: { combinator: "AND", conditions: [{ field: "fetch_schedule.ok", operator: "==", value: true }] } },
    ];
    db.runs = [run({ waveResults: [{ nodes: [
      node("a", "completed", null, { durationMs: 4200, costUsd: 0.2 }),
      node("b", "skipped", "No incoming edge condition was satisfied"),
      node("c", "skipped", "No incoming edge condition was satisfied"),
    ] }] })];
  });

  it("names the steps, and attributes each skip to the right cause", async () => {
    const out = await explainRun("org-1", "run-1");
    expect(out.planKnown).toBe(true);
    expect(out.steps.map((s) => s.label)).toEqual([
      "Confidence and Mandatory Fields Checker",
      "Schedule Fetcher",
      "Policy Binder and Ledger Poster",
    ]);
    // The binder was not skipped by its own condition: the step before it never ran.
    expect(out.steps[2]).toMatchObject({ label: "Policy Binder and Ledger Poster", cause: "predecessor_skipped" });
    expect(out.steps[1].cause).toBe("condition_false");
    expect(out.byCause).toEqual({ condition_false: 1, predecessor_skipped: 1 });
  });

  it("carries the headline with it, so the caller cannot show the status alone", async () => {
    const out = await explainRun("org-1", "run-1");
    expect(out.run.steps).toEqual({ total: 3, ran: 1, skipped: 2, failed: 0 });
    expect(runHeadline(out.run.status, out.run.steps.ran, out.run.steps.total)).toBe("Completed — 1 of 3 steps ran");
  });

  it("refuses a run from another organization rather than reporting it", async () => {
    db.agents = new Map();
    await expect(explainRun("org-other", "run-1")).rejects.toThrow(/another organization/);
  });

  it("still names what it can when the team's graph is gone", async () => {
    db.agents = new Map([["team-1", { id: "team-1", name: "Orphaned team", blueprintId: null }]]);
    const out = await explainRun("org-1", "run-1");
    expect(out.planKnown).toBe(false);
    // No labels, but the causes still come from the recorded messages.
    expect(out.steps[1].cause).toBe("condition_false");
  });
});

describe("the list of recent runs", () => {
  it("counts how much ran, not just how many runs there were", async () => {
    db.runs = [
      run({ id: "r1", status: "completed", waveResults: [{ nodes: [node("a", "completed"), node("b", "completed")] }] }),
      run({ id: "r2", waveResults: [{ nodes: [node("a", "completed"), node("b", "skipped", "No incoming edge condition was satisfied")] }] }),
      run({ id: "r3", status: "failed", waveResults: [{ nodes: [node("a", "failed")] }] }),
    ];
    const out = await runsOverview("org-1");
    expect(out.counts).toMatchObject({ runs: 3, cleanRuns: 1, runsWithSkips: 1, failed: 1, steps: 5, stepsSkipped: 1 });
  });

  it("marks the skips that are defects, so a list can sort by them", async () => {
    db.runs = [
      run({ id: "r1", waveResults: [{ nodes: [node("a", "skipped", "No incoming edge condition was satisfied (no upstream step output the routing field x.y)")] }] }),
      run({ id: "r2", waveResults: [{ nodes: [node("a", "skipped", "No incoming edge condition was satisfied")] }] }),
    ];
    const out = await runsOverview("org-1");
    expect(out.runs.find((r) => r.id === "r1")!.problemSkips).toBe(1);
    expect(out.runs.find((r) => r.id === "r2")!.problemSkips).toBe(0);
  });

  it("names a team that has since been deleted rather than showing an id", async () => {
    db.agents = new Map();
    db.runs = [run({ waveResults: [{ nodes: [node("a", "completed")] }] })];
    const out = await runsOverview("org-1");
    expect(out.runs[0].team.name).toBe("a team that is no longer here");
  });
});

describe("steps a team never runs", () => {
  it("names them only once there are enough runs to mean it", async () => {
    db.nodes = [{ id: "a", label: "Reader" }, { id: "z", label: "Senior Underwriter Escalation Handler" }];
    const runs = (n: number) => Array.from({ length: n }, (_, i) =>
      run({ id: `r${i}`, waveResults: [{ nodes: [node("a", "completed"), node("z", "skipped", "No incoming edge condition was satisfied")] }] }));

    db.runs = runs(2);
    expect((await stepsNeverRun("org-1", "team-1")).steps).toEqual([]);

    db.runs = runs(4);
    const out = await stepsNeverRun("org-1", "team-1");
    expect(out.steps).toEqual([{ nodeId: "z", label: "Senior Underwriter Escalation Handler", seen: 4 }]);
  });
});

describe("the page says what the data says", () => {
  const page = readFileSync(join(__dirname, "..", "client", "src", "pages", "runs.tsx"), "utf8").replace(/\r\n/g, "\n");

  it("never renders a status without how much of the run happened", () => {
    expect(page).toContain("runHeadline(r.status, r.steps.ran, r.steps.total)");
    expect(page).toContain("runHeadline(selected.status, selected.steps.ran, selected.steps.total)");
    // No bare status rendering anywhere in the component.
    expect(page).not.toMatch(/>\s*\{r\.status\}\s*</);
    expect(page).not.toMatch(/>\s*\{selected\.status\}\s*</);
  });

  it("imports the shared vocabulary rather than writing its own", () => {
    expect(page).toContain('from "@shared/run-words"');
    expect(page).toContain("skipCauseLabel");
    expect(page).toContain("skipCauseAdvice");
  });

  it("says when a cause came from the record rather than the graph", () => {
    expect(page).toContain("could not be read, so each cause comes from what the run recorded");
  });
});
