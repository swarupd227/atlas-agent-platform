/**
 * Re-running a finished team run from one of its steps (Phase 3, item 11).
 *
 * The engine could resume a run paused at a gate or cut off by a restart; it
 * could not start a finished run again from a step of the author's choosing,
 * so a team whose last step failed re-ran every step. Now a new run starts at
 * the chosen step's wave with the parent's earlier results kept as they were,
 * the state replayed through the engine's own merge, and a link to the parent.
 * The plan is the blueprint as it stands, so a fix is what gets re-run; a
 * change that removed the ground under the chosen step is refused.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");

const db = vi.hoisted(() => ({
  runs: new Map<string, any>(),
  nodes: [] as any[],
  edges: [] as any[],
  created: [] as any[],
}));

const { executeWorkerAgent } = vi.hoisted(() => ({
  executeWorkerAgent: vi.fn(async (agentId: string) => ({ success: true, output: `${agentId} ran again`, promptTokens: 3, completionTokens: 2 })),
}));

vi.mock("../server/agent-runtime", () => ({
  detectTranscriptionDrift: () => [],
  executeWorkerAgent,
  waitForApproval: vi.fn(),
  evaluateCondition: vi.fn().mockResolvedValue(true),
  extractStructuredOutput: () => null,
  canonicalJsonStringify: (v: unknown) => JSON.stringify(v),
  buildPipelineState: () => ({}),
}));

vi.mock("../server/storage", () => {
  const base: Record<string, any> = {
    getAgent: vi.fn(async (id: string) => (id === "team-1" ? { id, name: "Team", blueprintId: "bp1", runtimeConfig: {}, organizationId: "org-1" } : undefined)),
    getTeamBlueprintNodes: vi.fn(async () => db.nodes),
    getTeamBlueprintEdges: vi.fn(async () => db.edges),
    getDagStateSchemaByTeamAgent: vi.fn(async () => ({ id: "schema-1", fields: { notes: { type: "array", writable_by: ["*"], reducer: "append" } } })),
    getDagExecutionRun: vi.fn(async (id: string) => (db.runs.has(id) ? { ...db.runs.get(id) } : undefined)),
    createDagExecutionRun: vi.fn(async (row: any) => {
      const created = { id: `run-new-${db.created.length + 1}`, ...row };
      db.created.push(created);
      db.runs.set(created.id, created);
      return created;
    }),
    updateActiveDagExecutionRun: vi.fn(async (id: string, data: any) => {
      const r = db.runs.get(id);
      if (!r || !["running", "waiting_approval"].includes(r.status)) return undefined;
      db.runs.set(id, { ...r, ...data });
      return db.runs.get(id);
    }),
    updateDagExecutionRun: vi.fn(async (id: string, data: any) => { db.runs.set(id, { ...db.runs.get(id), ...data }); return db.runs.get(id); }),
    getDagExecutionRunStatus: vi.fn(async (id: string) => db.runs.get(id)?.status),
  };
  const storage = new Proxy(base, { get: (t, k: string) => (k in t ? t[k] : vi.fn(async () => undefined)) });
  return { storage };
});

import { rerunTeamAgentDagRunFrom, RerunRefusedError } from "../server/dag-execution-engine";
import { rerunTeamFromTool } from "../server/astra/tools/run-team";
import { storage } from "../server/storage";

const node = (id: string, label: string, stateKey: string) => ({ id, blueprintId: "bp1", nodeType: "internal_agent", label, refAgentId: `ag-${id}`, refTeamAgentId: null, refToolIds: [], stateKey, timeoutMs: 30000, config: null });
const edge = (from: string, to: string) => ({ id: `${from}-${to}`, blueprintId: "bp1", sourceNodeId: from, targetNodeId: to, condition: null, evaluationMode: null, rule: null });
const wave = (waveNumber: number, nodes: any[]) => ({ waveNumber, startedAt: "2026-10-01T10:00:00.000Z", completedAt: "2026-10-01T10:01:00.000Z", durationMs: 60_000, nodes });
const result = (nodeId: string, status: string, output: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ nodeId, agentId: `ag-${nodeId}`, status, output, durationMs: 1000, promptTokens: 10, completionTokens: 5, costUsd: 0.01, toolCallCount: 0, traceId: "", ...extra });

const parent = () => ({
  id: "run-1",
  teamAgentId: "team-1",
  status: "failed",
  initialState: { request: "Draft the memo", notes: ["from the start"] },
  currentWave: 2,
  totalWaves: 2,
  waveResults: [
    wave(1, [result("writer", "completed", { draft: "The draft.", notes: ["writer's note"] })]),
    wave(2, [result("reviewer", "failed", {}, { error: "The verdict disagreed with the facts" })]),
  ],
});

const settled = async (id: string) => {
  for (let i = 0; i < 100; i++) {
    const r = db.runs.get(id);
    if (r && !["running", "waiting_approval"].includes(r.status)) return r;
    await new Promise((res) => setTimeout(res, 20));
  }
  throw new Error(`run ${id} did not settle`);
};

beforeEach(() => {
  db.runs.clear();
  db.created.length = 0;
  db.nodes = [node("writer", "Writer", "draft"), node("reviewer", "Reviewer", "review")];
  db.edges = [edge("writer", "reviewer")];
  db.runs.set("run-1", parent());
  executeWorkerAgent.mockClear();
  vi.mocked(storage.createDagExecutionRun).mockClear();
});

describe("a new run from a step of a finished one", () => {
  it("keeps the parent's earlier results, replays their state with the engine's own merge, and starts at the step's wave", async () => {
    const started = await rerunTeamAgentDagRunFrom("run-1", "reviewer");
    expect(started).toMatchObject({ dagRunId: "run-new-1", fromWave: 2, fromLabel: "Reviewer" });
    const row = vi.mocked(storage.createDagExecutionRun).mock.calls[0][0] as any;
    expect(row).toMatchObject({
      teamAgentId: "team-1",
      status: "running",
      currentWave: 1,
      totalWaves: 2,
      rerunOfRunId: "run-1",
      rerunFromNodeId: "reviewer",
    });
    expect(row.waveResults).toEqual([parent().waveResults[0]]);
    // "notes" appends, so the writer's note joins the one the run started with; "draft" is the writer's.
    expect(row.initialState).toEqual({ request: "Draft the memo", notes: ["from the start", "writer's note"], draft: "The draft." });

    const finished = await settled("run-new-1");
    expect(finished.status).toBe("completed");
    // Only the reviewer ran; the writer's result was kept, not re-run.
    expect(executeWorkerAgent).toHaveBeenCalledTimes(1);
    expect(executeWorkerAgent.mock.calls[0][0]).toBe("ag-reviewer");
    expect(finished.waveResults.map((w: any) => w.waveNumber)).toEqual([1, 2]);
    expect(finished.finalState.review).toBe("ag-reviewer ran again");
    expect(finished.finalState.draft).toBe("The draft.");
  });

  it("from the first step is a fresh run of the same request, with nothing kept", async () => {
    const started = await rerunTeamAgentDagRunFrom("run-1", "writer");
    expect(started.fromWave).toBe(1);
    const row = vi.mocked(storage.createDagExecutionRun).mock.calls[0][0] as any;
    expect(row).toMatchObject({ currentWave: 0, waveResults: [], initialState: { request: "Draft the memo", notes: ["from the start"] }, rerunOfRunId: "run-1" });
    await settled("run-new-1");
    expect(executeWorkerAgent).toHaveBeenCalledTimes(2);
  });
});

describe("what is refused, and why", () => {
  it("a step that is not in the blueprint", async () => {
    await expect(rerunTeamAgentDagRunFrom("run-1", "publisher")).rejects.toThrow(/not in the team's blueprint/);
    expect(storage.createDagExecutionRun).not.toHaveBeenCalled();
  });

  it("a run that has not finished", async () => {
    db.runs.set("run-1", { ...parent(), status: "running" });
    const err = await rerunTeamAgentDagRunFrom("run-1", "reviewer").catch((e) => e);
    expect(err).toBeInstanceOf(RerunRefusedError);
    expect(err.message).toBe("Only a finished run can be re-run from a step; this one is running.");
  });

  it("a team that changed so the chosen step now rests on a step the parent never ran", async () => {
    db.nodes = [node("writer", "Writer", "draft"), node("researcher", "Researcher", "research"), node("reviewer", "Reviewer", "review")];
    db.edges = [edge("writer", "reviewer"), edge("researcher", "reviewer")];
    const err = await rerunTeamAgentDagRunFrom("run-1", "reviewer").catch((e) => e);
    expect(err).toBeInstanceOf(RerunRefusedError);
    expect(err.message).toBe('The team changed since that run: "Researcher" now comes before "Reviewer" and has no result in it. Re-run from an earlier step, or start a fresh run.');
    expect(storage.createDagExecutionRun).not.toHaveBeenCalled();
  });

  it("a run that is not there", async () => {
    await expect(rerunTeamAgentDagRunFrom("run-9", "reviewer")).rejects.toThrow("That run was not found.");
  });
});

describe("from a conversation", () => {
  const view = (status = "failed") => ({
    id: "run-1",
    team: { id: "team-1", name: "Memo Team" },
    status,
    currentWave: 2,
    totalWaves: 2,
    error: null,
    costUsd: 0.2,
    toolCalls: 0,
    steps: [
      { nodeId: "writer", wave: 1, revision: 0, label: "Writer", status: "completed", error: null, durationMs: 1000, html: false },
      { nodeId: "reviewer", wave: 2, revision: 0, label: "Reviewer", status: "failed", error: "verdict", durationMs: 900, html: false },
    ],
    pending: null,
    answer: null,
  });
  const ctx = (over: Record<string, unknown> = {}) => ({
    orgId: "org-1", userId: "u1", role: "admin", industryId: "insurance", threadId: "t1",
    services: {
      getTeamRun: vi.fn(async () => view()),
      rerunTeamRunFrom: vi.fn(async () => ({ dagRunId: "run-new-1", fromNodeId: "reviewer", fromLabel: "Reviewer", fromWave: 2, totalWaves: 2, team: { id: "team-1", name: "Memo Team" } })),
      followTeamRun: vi.fn(async () => ({ state: "finished", status: "completed" })),
    },
    ...over,
  }) as any;

  it("previews what is kept and what runs again, by the step's label", async () => {
    const p = await rerunTeamFromTool.preview!(ctx(), { runId: "run-1", step: "reviewer" });
    expect(p).toMatchObject({ summary: 'Re-run Memo Team from "Reviewer"', frozen: { dagRunId: "run-1", nodeId: "reviewer", label: "Reviewer" } });
    expect((p as any).details[0]).toBe("Kept as they were: Writer.");
    expect((p as any).details[1]).toBe("Run again: Reviewer.");
  });

  it("refuses a run that has not finished, and a step the run does not have", async () => {
    const running = ctx({ services: { getTeamRun: vi.fn(async () => view("running")) } });
    expect(await rerunTeamFromTool.preview!(running, { runId: "run-1", step: "Reviewer" })).toEqual({ refuse: "Only a finished run can be re-run from a step; this one is running." });
    expect(await rerunTeamFromTool.preview!(ctx(), { runId: "run-1", step: "Publisher" })).toEqual({ refuse: 'Memo Team has no step called "Publisher" in that run.' });
  });

  it("starts the re-run on Confirm, follows it, and says what was kept", async () => {
    const c = ctx({ confirmation: { kind: "tool", frozen: { dagRunId: "run-1", nodeId: "reviewer", label: "Reviewer", teamName: "Memo Team" } } });
    const r: any = await rerunTeamFromTool.run(c, { runId: "run-1", step: "Reviewer" });
    expect(c.services.rerunTeamRunFrom).toHaveBeenCalledWith("org-1", "run-1", "reviewer");
    expect(r.payload.notes).toEqual(['Started again from "Reviewer" of run run-1; 1 stage before it kept from that run.']);
    expect(r.payload.runId).toBe("run-1");
  });

  it("does nothing on Not now", async () => {
    const c = ctx({ decision: "declined", confirmation: { kind: "tool", frozen: { dagRunId: "run-1", nodeId: "reviewer" } } });
    expect(await rerunTeamFromTool.run(c, { runId: "run-1", step: "Reviewer" })).toEqual({ payload: { started: false, message: "Not started." } });
    expect(c.services.rerunTeamRunFrom).not.toHaveBeenCalled();
  });

  it("is a core action beside run_team, not part of the read-only Runs pack", () => {
    expect(rerunTeamFromTool).toMatchObject({ name: "rerun_team_from", confirm: true, permission: "manage_agents" });
    expect(rerunTeamFromTool.pack).toBeUndefined();
    expect(read("server", "astra", "wiring.ts")).toContain("rerunTeamFromTool");
    expect(read("server", "astra", "services.ts")).toContain("rerunTeamRunFrom,");
  });
});

describe("where it is reachable", () => {
  it("the route refuses with the engine's reason, and scopes the run to the caller's organization", () => {
    const src = read("server", "routes", "runtime.ts");
    expect(src).toContain('router.post("/api/dag-execution-runs/:id/rerun-from", checkPermission("manage_agents")');
    expect(src).toContain("if (err instanceof RerunRefusedError) return res.status(409).json({ message: err.message });");
    expect(src).toContain("rerunOfRunId: run.id,");
  });

  it("the monitor offers it on every finished step of a finished run, and names the run a re-run came from", () => {
    const src = read("client", "src", "pages", "dag-run-monitor.tsx");
    expect(src).toContain('data-testid={`button-rerun-from-${step.id}`}');
    expect(src).toContain('(step.state === "completed" || step.state === "failed" || step.state === "skipped")');
    expect(src).toContain("onRerunFrom={runIsTerminal && !isMagentic ? (nodeId) => rerunMutation.mutate(nodeId) : undefined}");
    expect(src).toContain('data-testid="text-rerun-of"');
  });

  it("the run row remembers its parent and the step it started at", () => {
    const schema = read("shared", "schema.ts");
    expect(schema).toContain('rerunOfRunId: varchar("rerun_of_run_id"),');
    expect(schema).toContain('rerunFromNodeId: varchar("rerun_from_node_id"),');
    const boot = read("server", "db.ts");
    expect(boot).toContain("ALTER TABLE dag_execution_runs ADD COLUMN IF NOT EXISTS rerun_of_run_id VARCHAR;");
    expect(boot).toContain("ALTER TABLE dag_execution_runs ADD COLUMN IF NOT EXISTS rerun_from_node_id VARCHAR;");
  });
});
