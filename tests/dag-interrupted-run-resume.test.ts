/**
 * Runs cut off by a deploy or restart.
 *
 * A run whose process died while it was "running" used to stay "running"
 * forever: nothing resumed it and nothing failed it (live: five
 * content-workbench runs lost to deploys, one showing "running" with no step
 * recorded three hours after it started). A live run now refreshes a heartbeat;
 * the one-minute recovery scan resumes a recently interrupted run from its last
 * completed wave, fails an old one with a reason, and leaves live runs alone.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const runs = new Map<string, any>();
let claimAllowed = true;

vi.mock("../server/agent-runtime", () => ({
  detectTranscriptionDrift: () => [],
  executeWorkerAgent: vi.fn(),
  waitForApproval: vi.fn(),
  evaluateCondition: vi.fn().mockResolvedValue(true),
  extractStructuredOutput: () => null,
  canonicalJsonStringify: (v: unknown) => JSON.stringify(v),
  buildPipelineState: () => ({}),
}));

vi.mock("../server/storage", () => ({
  storage: {
    getAgent: vi.fn(async (id: string) => (id === "team-1" ? { id, name: "Team", blueprintId: "bp1", runtimeConfig: {} } : undefined)),
    getTeamBlueprintNodes: vi.fn(async () => [
      { id: "writer", blueprintId: "bp1", nodeType: "internal_agent", label: "Writer", refAgentId: "ag-writer", refTeamAgentId: null, refToolIds: [], stateKey: "draft", timeoutMs: 30000, config: null },
      { id: "reviewer", blueprintId: "bp1", nodeType: "internal_agent", label: "Reviewer", refAgentId: "ag-reviewer", refTeamAgentId: null, refToolIds: [], stateKey: "review", timeoutMs: 30000, config: null },
    ]),
    getTeamBlueprintEdges: vi.fn(async () => [{ id: "e1", blueprintId: "bp1", sourceNodeId: "writer", targetNodeId: "reviewer", condition: null, evaluationMode: null, rule: null }]),
    getDagStateSchemaByTeamAgent: vi.fn(async () => null),
    getDagExecutionRun: vi.fn(async (id: string) => (runs.has(id) ? { ...runs.get(id) } : undefined)),
    updateDagExecutionRun: vi.fn(async (id: string, data: any) => {
      runs.set(id, { ...runs.get(id), ...data });
      return runs.get(id);
    }),
    updateActiveDagExecutionRun: vi.fn(async (id: string, data: any) => {
      const r = runs.get(id);
      if (!r || !["running", "waiting_approval"].includes(r.status)) return undefined;
      runs.set(id, { ...r, ...data });
      return runs.get(id);
    }),
    getDagExecutionRunStatus: vi.fn(async (id: string) => runs.get(id)?.status),
    cancelActiveDagExecutionRun: vi.fn(async () => undefined),
    claimStaleRunningDagExecutionRun: vi.fn(async (id: string, staleBefore: Date) => {
      const r = runs.get(id);
      if (!claimAllowed || !r || r.status !== "running" || !r.heartbeatAt || !(new Date(r.heartbeatAt) < staleBefore)) return false;
      r.heartbeatAt = new Date();
      return true;
    }),
    listStaleRunningDagExecutionRuns: vi.fn(async (staleBefore: Date) =>
      Array.from(runs.values()).filter((r) => r.status === "running" && r.heartbeatAt && new Date(r.heartbeatAt) < staleBefore),
    ),
    touchDagExecutionRunHeartbeat: vi.fn(async () => {}),
    createAuditEvent: vi.fn(async () => ({})),
    createTrace: vi.fn(async () => ({})),
    getTracesByAgent: vi.fn(async () => []),
  },
}));

import {
  DAG_RUN_MAX_RESUME_AGE_MS,
  DAG_RUN_STALE_AFTER_MS,
  resumeInterruptedTeamAgentDagRun,
} from "../server/dag-execution-engine";
import { pollInterruptedDagRuns } from "../server/dag-resume-poller";

const NOW = new Date("2026-09-14T10:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);

/** A run that finished wave 1 (the writer) and died during wave 2. */
function interruptedRun(id: string, heartbeatAt: Date | null) {
  runs.set(id, {
    id,
    teamAgentId: "team-1",
    status: "running",
    currentWave: 1,
    totalWaves: 2,
    initialState: { request: "write it" },
    currentState: { request: "write it", draft: "the draft from before the restart" },
    waveResults: [
      {
        waveNumber: 1, startedAt: "", completedAt: "", durationMs: 1,
        nodes: [{ nodeId: "writer", agentId: "ag-writer", status: "completed", output: { draft: "the draft from before the restart" }, durationMs: 1, promptTokens: 1, completionTokens: 1, traceId: "" }],
      },
    ],
    pendingApprovalId: null,
    heartbeatAt,
    startedAt: ago(10 * 60 * 1000),
  });
}

const settle = () => new Promise((r) => setTimeout(r, 50));

describe("resumeInterruptedTeamAgentDagRun", () => {
  let executeWorkerAgent: any;
  beforeEach(async () => {
    runs.clear();
    claimAllowed = true;
    ({ executeWorkerAgent } = (await import("../server/agent-runtime")) as any);
    executeWorkerAgent.mockReset();
    executeWorkerAgent.mockImplementation(async (agentId: string, _team: unknown, input: string) => ({
      success: true,
      output: agentId === "ag-reviewer" ? `reviewed: ${input.includes("the draft from before the restart") ? "saw draft" : "no draft"}` : "rewritten",
    }));
  });

  it("resumes a recently interrupted run from the wave after its last completed one", async () => {
    interruptedRun("r1", ago(DAG_RUN_STALE_AFTER_MS + 60_000));

    expect(await resumeInterruptedTeamAgentDagRun("r1", NOW)).toBe("resumed");
    await settle();

    // Only the interrupted wave ran again; the completed writer was not re-run.
    const calledAgents = executeWorkerAgent.mock.calls.map((c: any[]) => c[0]);
    expect(calledAgents).toEqual(["ag-reviewer"]);
    // ...and it saw the work done before the restart.
    expect(runs.get("r1").finalState.review).toBe("reviewed: saw draft");
    expect(runs.get("r1").status).toBe("completed");
  });

  it("fails a run interrupted too long ago, with a reason, instead of resuming it", async () => {
    interruptedRun("old", ago(DAG_RUN_MAX_RESUME_AGE_MS + 60_000));

    expect(await resumeInterruptedTeamAgentDagRun("old", NOW)).toBe("failed_too_old");
    expect(executeWorkerAgent).not.toHaveBeenCalled();
    expect(runs.get("old").status).toBe("failed");
    expect(runs.get("old").error).toContain("Interrupted by a server restart");
  });

  it("leaves a run alone when another scan or instance claimed it first", async () => {
    interruptedRun("raced", ago(DAG_RUN_STALE_AFTER_MS + 60_000));
    claimAllowed = false;

    expect(await resumeInterruptedTeamAgentDagRun("raced", NOW)).toBe("skipped");
    expect(executeWorkerAgent).not.toHaveBeenCalled();
    expect(runs.get("raced").status).toBe("running");
  });

  it("never touches a run whose heartbeat is fresh, or one that never heartbeats", async () => {
    interruptedRun("live", ago(60_000));
    interruptedRun("legacy", null);

    expect(await resumeInterruptedTeamAgentDagRun("live", NOW)).toBe("skipped");
    expect(await resumeInterruptedTeamAgentDagRun("legacy", NOW)).toBe("skipped");
    expect(executeWorkerAgent).not.toHaveBeenCalled();
  });
});

describe("pollInterruptedDagRuns", () => {
  beforeEach(async () => {
    runs.clear();
    claimAllowed = true;
    const { executeWorkerAgent } = (await import("../server/agent-runtime")) as any;
    executeWorkerAgent.mockReset();
    executeWorkerAgent.mockResolvedValue({ success: true, output: "ok" });
  });

  it("recovers every stale run and reports what it did", async () => {
    interruptedRun("recent", ago(DAG_RUN_STALE_AFTER_MS + 60_000));
    interruptedRun("ancient", ago(DAG_RUN_MAX_RESUME_AGE_MS + 60_000));
    interruptedRun("alive", ago(30_000));

    const result = await pollInterruptedDagRuns(NOW);
    await settle();

    expect(result).toEqual({ checked: 2, resumed: 1, failed: 1, errors: 0 });
    expect(runs.get("alive").status).toBe("running");
  });
});

describe("a resumed run announces its finish", () => {
  it("tells listeners the outcome once the resumed run completes, so records that lost their caller can be finished", async () => {
    const { onDagRunFinished } = await import("../server/dag-execution-engine");
    const heard: any[] = [];
    onDagRunFinished((info) => { heard.push(info); });
    runs.clear();
    claimAllowed = true;
    const { executeWorkerAgent } = (await import("../server/agent-runtime")) as any;
    executeWorkerAgent.mockReset();
    executeWorkerAgent.mockImplementation(async () => ({ success: true, output: "reviewed after restart" }));
    interruptedRun("r-notify", ago(DAG_RUN_STALE_AFTER_MS + 60_000));

    expect(await resumeInterruptedTeamAgentDagRun("r-notify", NOW)).toBe("resumed");
    await settle();

    expect(heard).toHaveLength(1);
    expect(heard[0].dagRunId).toBe("r-notify");
    expect(heard[0].teamAgentId).toBe("team-1");
    expect(heard[0].status).toBe("completed");
    expect(heard[0].output).toContain("reviewed after restart");
    expect(heard[0].waveResults.map((w: any) => w.waveNumber)).toEqual([1, 2]);
  });
});
