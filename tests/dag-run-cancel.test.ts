/**
 * Cancelling a team run.
 *
 * Nothing could stop a run short of a redeploy: a 25-minute deck build going
 * wrong ran to the end, and a run cut off before resume support existed stayed
 * "running" forever. A run that is running or waiting for approval can now be
 * cancelled; a live one stops before its next wave, and nothing it writes later
 * can flip it back to "running".
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const runs = new Map<string, any>();
const approvals = new Map<string, any>();
const ACTIVE = new Set(["running", "waiting_approval"]);

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
      { id: "first", blueprintId: "bp1", nodeType: "internal_agent", label: "First", refAgentId: "ag-first", refTeamAgentId: null, refToolIds: [], stateKey: "one", timeoutMs: 30000, config: null },
      { id: "second", blueprintId: "bp1", nodeType: "internal_agent", label: "Second", refAgentId: "ag-second", refTeamAgentId: null, refToolIds: [], stateKey: "two", timeoutMs: 30000, config: null },
    ]),
    getTeamBlueprintEdges: vi.fn(async () => [{ id: "e1", blueprintId: "bp1", sourceNodeId: "first", targetNodeId: "second", condition: null, evaluationMode: null, rule: null }]),
    getDagStateSchemaByTeamAgent: vi.fn(async () => null),
    createDagExecutionRun: vi.fn(async (data: any) => {
      const row = { id: `run-${runs.size + 1}`, ...data };
      runs.set(row.id, row);
      return row;
    }),
    getDagExecutionRun: vi.fn(async (id: string) => (runs.has(id) ? { ...runs.get(id) } : undefined)),
    getDagExecutionRunStatus: vi.fn(async (id: string) => runs.get(id)?.status),
    updateDagExecutionRun: vi.fn(async (id: string, data: any) => {
      runs.set(id, { ...runs.get(id), ...data });
      return runs.get(id);
    }),
    updateActiveDagExecutionRun: vi.fn(async (id: string, data: any) => {
      const r = runs.get(id);
      if (!r || !ACTIVE.has(r.status)) return undefined;
      runs.set(id, { ...r, ...data });
      return runs.get(id);
    }),
    cancelActiveDagExecutionRun: vi.fn(async (id: string, reason: string) => {
      const r = runs.get(id);
      if (!r || !ACTIVE.has(r.status)) return undefined;
      runs.set(id, { ...r, status: "cancelled", error: reason, completedAt: new Date() });
      return runs.get(id);
    }),
    touchDagExecutionRunHeartbeat: vi.fn(async () => {}),
    updateApproval: vi.fn(async (id: string, data: any) => {
      approvals.set(id, { ...approvals.get(id), ...data });
      return approvals.get(id);
    }),
    createAuditEvent: vi.fn(async () => ({})),
    createTrace: vi.fn(async () => ({})),
  },
}));

import { cancelTeamAgentDagRun, runTeamAgentDag, DagRunCancelledError } from "../server/dag-execution-engine";

describe("cancelTeamAgentDagRun", () => {
  let executeWorkerAgent: any;
  let storage: any;
  beforeEach(async () => {
    runs.clear();
    approvals.clear();
    ({ executeWorkerAgent } = (await import("../server/agent-runtime")) as any);
    ({ storage } = (await import("../server/storage")) as any);
    executeWorkerAgent.mockReset();
    storage.createAuditEvent.mockClear();
  });

  it("stops a live run before its next step and leaves it cancelled, not failed or running", async () => {
    let release!: () => void;
    const firstStepBlocked = new Promise<void>((r) => (release = r));
    executeWorkerAgent.mockImplementation(async (agentId: string) => {
      if (agentId === "ag-first") {
        await firstStepBlocked;
        return { success: true, output: "first done" };
      }
      return { success: true, output: "second should never run" };
    });

    const running = runTeamAgentDag("team-1", "bp1", "do the work").catch((e) => e);
    await vi.waitFor(() => expect(executeWorkerAgent).toHaveBeenCalledTimes(1));
    const runId = Array.from(runs.keys())[0];

    const outcome = await cancelTeamAgentDagRun(runId, "wrong brief", "swarup");
    expect(outcome).toEqual({ cancelled: true, stoppedLiveExecution: true });

    release(); // the step in progress finishes after the cancel
    const err = await running;

    expect(err).toBeInstanceOf(DagRunCancelledError);
    expect(executeWorkerAgent.mock.calls.map((c: any[]) => c[0])).toEqual(["ag-first"]);
    expect(runs.get(runId).status).toBe("cancelled");
    expect(runs.get(runId).error).toBe("Cancelled by swarup: wrong brief");
    expect(storage.createAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "dag_run.cancelled", objectId: runId, actorId: "swarup" }));
  });

  it("closes a stuck run that has no live execution, and the approval it was waiting on", async () => {
    runs.set("stuck", { id: "stuck", teamAgentId: "team-1", status: "waiting_approval", pendingApprovalId: "appr-1" });
    approvals.set("appr-1", { id: "appr-1", status: "pending" });

    const outcome = await cancelTeamAgentDagRun("stuck", "interrupted by a restart before resume support existed", "swarup");

    expect(outcome).toEqual({ cancelled: true, stoppedLiveExecution: false });
    expect(runs.get("stuck").status).toBe("cancelled");
    expect(approvals.get("appr-1").status).toBe("rejected");
  });

  it("refuses to cancel a run that has already finished", async () => {
    runs.set("done", { id: "done", teamAgentId: "team-1", status: "completed" });
    expect(await cancelTeamAgentDagRun("done", "too late", "swarup")).toEqual({ cancelled: false, status: "completed" });
    expect(runs.get("done").status).toBe("completed");
  });

  it("never lets a late write from a running strand flip a cancelled run back to running", async () => {
    runs.set("r", { id: "r", teamAgentId: "team-1", status: "running" });
    await cancelTeamAgentDagRun("r", "stop", "swarup");
    await storage.updateActiveDagExecutionRun("r", { status: "running", currentWave: 2 });
    expect(runs.get("r").status).toBe("cancelled");
  });
});
