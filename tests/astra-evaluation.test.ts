/**
 * Evaluation pack: the Eval Studio services (organization-strict, compare,
 * failures, watch) and the tools through the Astra loop.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  datasets: new Map<string, any>(),
  runs: new Map<string, any>(),
  traces: [] as any[],
  spans: new Map<string, any[]>(),
  goldens: new Map<string, any>(),
  agents: new Map<string, any>(),
  created: [] as any[],
  jobs: [] as any[],
  audit: [] as any[],
}));

vi.mock("../server/storage", () => ({
  storage: {
    getEvalDataset: vi.fn(async (id: string) => db.datasets.get(id)),
    getEvalDatasets: vi.fn(async (f: any) => Array.from(db.datasets.values()).filter((d) => d.organizationId === f.organizationId && (!f.agentId || d.agentId === f.agentId))),
    getEvalTestRun: vi.fn(async (id: string) => db.runs.get(id)),
    getEvalTestRuns: vi.fn(async (f: any) => Array.from(db.runs.values()).filter((r) => r.organizationId === (f.organizationId ?? null) && (!f.agentId || r.agentId === f.agentId))),
    getEvalTraces: vi.fn(async (f: any) => db.traces.filter((t) => t.runId === f.runId && (f.passFail === undefined || t.passFail === f.passFail)).slice(0, f.limit ?? 500)),
    getEvalSpans: vi.fn(async (traceId: string) => db.spans.get(traceId) ?? []),
    getEvalGolden: vi.fn(async (id: string) => db.goldens.get(id)),
    getAgent: vi.fn(async (id: string, orgId?: string) => { const a = db.agents.get(id); return a && (!orgId || a.organizationId === orgId) ? a : undefined; }),
    createEvalTestRun: vi.fn(async (r: any) => { const row = { id: "run-new", startedAt: new Date(), ...r }; db.created.push(row); db.runs.set(row.id, row); return row; }),
    createJob: vi.fn(async (j: any) => { db.jobs.push(j); return j; }),
    createAuditEvent: vi.fn(async (e: any) => { db.audit.push(e); return e; }),
  },
}));

import { evalServices } from "../server/astra/eval-services";
import { summarizeMetrics } from "../server/eval-runs";

beforeEach(() => {
  for (const m of [db.datasets, db.runs, db.spans, db.goldens, db.agents]) m.clear();
  db.traces.length = 0; db.created.length = 0; db.jobs.length = 0; db.audit.length = 0;
  db.agents.set("ag-1", { id: "ag-1", name: "Invoice Agent", organizationId: "org-a" });
  db.datasets.set("ds-1", { id: "ds-1", name: "Invoice goldens", organizationId: "org-a", agentId: "ag-1", goldenCount: 12, version: 2 });
  db.datasets.set("ds-demo", { id: "ds-demo", name: "Demo goldens", organizationId: null, goldenCount: 5, version: 1 });
  db.runs.set("run-prev", { id: "run-prev", organizationId: "org-a", agentId: "ag-1", datasetId: "ds-1", status: "completed", passRate: 0.9, passedCount: 9, failedCount: 1, totalGoldens: 10, completedAt: "2026-09-17T10:00:00Z", tags: ["gate:pass"] });
  db.runs.set("run-now", { id: "run-now", organizationId: "org-a", agentId: "ag-1", datasetId: "ds-1", status: "completed", passRate: 0.7, passedCount: 7, failedCount: 3, totalGoldens: 10, completedAt: "2026-09-18T10:00:00Z", tags: ["gate:fail"] });
  db.runs.set("run-other-org", { id: "run-other-org", organizationId: "org-b", agentId: "ag-9", datasetId: "x", status: "completed", passRate: 1 });
  db.traces.push(
    { id: "t1", runId: "run-now", goldenId: "g1", passFail: false, scores: { correctness: 0.2, overall: 0.3 }, agentFailed: false },
    { id: "t2", runId: "run-now", goldenId: "g2", passFail: true, scores: { correctness: 0.9, overall: 0.8 } },
    { id: "t3", runId: "run-prev", goldenId: "g1", passFail: true, scores: { correctness: 0.8, overall: 0.9 } },
  );
  db.goldens.set("g1", { id: "g1", input: "Match invoice 42 to PO 7", expectedOutput: "Matched" });
  db.spans.set("t1", [{ name: "metric:correctness", outputs: { score: 0.2 }, attributes: { metricName: "correctness", threshold: 0.5, pass: false, reason: "The answer named the wrong PO." } }]);
});

describe("Eval Studio services", () => {
  it("only show the caller's organization's datasets and runs, not organization-less demo records", async () => {
    expect((await evalServices.listEvalDatasets("org-a")).map((d) => d.id)).toEqual(["ds-1"]);
    expect(await evalServices.getEvalRunSummary("org-a", "run-other-org")).toBeNull();
  });

  it("summarise per metric and read the gate", async () => {
    const r = await evalServices.getEvalRunSummary("org-a", "run-now");
    expect(r!.run).toMatchObject({ passRate: 0.7, gate: "gate:fail" });
    expect(r!.metrics.map((m) => m.metric)).toEqual(["correctness", "overall"]);
    expect(summarizeMetrics([{ scores: { a: 0.5 } }, { scores: { a: 0.4 } }])).toEqual([{ metric: "a", total: 2, passed: 1, passRate: 0.5, avgScore: 0.45 }]);
  });

  it("compare with the previous completed run by the regression rule", async () => {
    const r = await evalServices.compareEvalRuns("org-a", "run-now");
    expect(r).toMatchObject({ baseline: { id: "run-prev" }, regressed: true, sameDataset: true });
    expect(r!.passRateDeltaPct).toBeCloseTo(-20);
    expect(r!.metrics.find((m) => m.metric === "correctness")).toMatchObject({ passRate: 0.5, baselinePassRate: 1, deltaPct: -50 });
  });

  it("explain failures from the judge's recorded reasoning", async () => {
    const r = await evalServices.evalFailures("org-a", "run-now");
    expect(r!.cases).toEqual([expect.objectContaining({ input: "Match invoice 42 to PO 7", metrics: [expect.objectContaining({ metric: "correctness", pass: false, reason: "The answer named the wrong PO." })] })]);
  });

  it("start a run like Eval Studio does, audited, and refuse other organizations' datasets", async () => {
    const run = await evalServices.startEvalRunAs("org-a", "ag-1", "ds-1", "admin");
    expect(run).toMatchObject({ id: "run-new", status: "pending", totalGoldens: 12 });
    expect(db.jobs[0]).toMatchObject({ type: "eval_test_run", payload: { runId: "run-new", organizationId: "org-a", datasetId: "ds-1" } });
    expect(db.audit[0]).toMatchObject({ organizationId: "org-a", action: "eval_run_started" });
    await expect(evalServices.startEvalRunAs("org-a", "ag-1", "ds-demo", "admin")).rejects.toThrow("No eval dataset");
  });

  it("watch a run to completion, reporting progress when counts change", async () => {
    db.runs.set("run-w", { id: "run-w", organizationId: "org-a", agentId: "ag-1", status: "running", passedCount: 0, failedCount: 0, totalGoldens: 2 });
    const labels: string[] = [];
    let tick = 0;
    const onProgress = (l: string) => {
      labels.push(l);
      tick++;
      db.runs.set("run-w", { ...db.runs.get("run-w"), passedCount: tick, status: tick >= 2 ? "completed" : "running", passRate: tick >= 2 ? 1 : null });
    };
    const r = await evalServices.watchEvalRun("org-a", "run-w", onProgress, 10_000, 1);
    expect(r).toMatchObject({ finished: true, status: "completed" });
    expect(labels[0]).toBe("0 of 2 cases scored (0 passed)");
  });
});

describe("run_eval through the confirm loop", () => {
  it("shows the case count and model-cost caveat, then starts, narrates and reports the result", async () => {
    const { runTurn, resolveAction } = await import("../server/astra/engine");
    const { ToolRegistry } = await import("../server/astra/registry");
    const { MemoryThreadStore } = await import("../server/astra/memory-store");
    const { scriptedComplete, result, call } = await import("../server/astra/scripted-brain");
    const { finishTurnTool } = await import("../server/astra/tools/finish-turn");
    const { loadToolsTool } = await import("../server/astra/tools/load-tools");
    const { EVALUATION_TOOLS } = await import("../server/astra/tools/evaluation");
    const { hasPermission } = await import("../server/permissions");

    const store = new MemoryThreadStore();
    const threadId = store.createThread("org-a");
    const events: any[] = [];
    const services = {
      listAgents: vi.fn(async () => [{ id: "ag-1", name: "Invoice Agent", organizationId: "org-a" }]),
      listEvalDatasets: vi.fn(async () => [{ id: "ds-1", name: "Invoice goldens", agentId: "ag-1", goldenCount: 12 }]),
      startEvalRunAs: vi.fn(async () => ({ id: "run-new", status: "pending" })),
      watchEvalRun: vi.fn(async (_o: string, _r: string, onProgress: (l: string) => void) => {
        onProgress("6 of 12 cases scored (5 passed)");
        return { id: "run-new", status: "completed", finished: true, passRate: 0.75, passed: 9, failed: 3, totalGoldens: 12, gate: "gate:pass" };
      }),
      getUserDisplayName: vi.fn(async () => "admin"),
    };
    const done = (text: string) => result(text, [call("finish_turn", { suggestions: [] })]);
    const deps: any = {
      store,
      registry: new ToolRegistry([finishTurnTool, loadToolsTool, ...EVALUATION_TOOLS], hasPermission),
      complete: scriptedComplete([
        { toolCalls: [{ name: "load_tools", arguments: { pack: "evaluation" } }] },
        { toolCalls: [{ name: "run_eval", arguments: { agent: "Invoice Agent", dataset: "invoice goldens" } }] },
        (m: any[]) => {
          const r = JSON.parse(m.filter((x) => x.role === "tool").at(-1).content);
          expect(r.result).toMatchObject({ runId: "run-new", finished: true, passRate: 0.75, gate: "gate:pass" });
          return done("75% passed.");
        },
      ]),
      can: hasPermission,
      audit: vi.fn(async () => {}),
      services,
      model: "test",
    };
    const ctx = { orgId: "org-a", userId: "user-1", role: "admin" as const };
    expect(await runTurn(deps, ctx, threadId, "Run Invoice Agent's evals", (e: any) => events.push(e))).toBe("awaiting_confirmation");
    const action = (await store.loadThread(threadId, "org-a"))!.pendingAction!;
    expect(action.summary).toBe("Run Invoice Agent's evaluation on Invoice goldens");
    expect(action.details![0]).toContain("12 cases");
    expect(action.details![0]).toContain("the cost isn't estimated in advance");
    expect(services.startEvalRunAs).not.toHaveBeenCalled();
    await resolveAction(deps, ctx, threadId, action.id, "confirm", (e: any) => events.push(e));
    expect(services.startEvalRunAs).toHaveBeenCalledWith("org-a", "ag-1", "ds-1", "admin");
    expect(events.some((e) => e.type === "working" && e.label === "6 of 12 cases scored (5 passed)")).toBe(true);
    expect(new ToolRegistry(EVALUATION_TOOLS, hasPermission).forRole("finance").map((x) => x.name)).not.toContain("run_eval");
  });
});
