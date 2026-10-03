/**
 * The job that runs a repeated eval.
 *
 * The route answers 202 and the worker runs the cases, so nobody is watching
 * when it goes wrong. These tests pin what the job does for the people reading
 * the run afterwards:
 *   - a run that finishes reports its figures and leaves the run row to the
 *     runner that completed it;
 *   - a run that throws is marked failed, not left "running" forever, and the
 *     error still reaches the worker so the job fails too;
 *   - the job beats a heartbeat into its payload and reports progress;
 *   - a job that has stopped beating is recognised as orphaned, and one that is
 *     beating, finished, or queued is not.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const state: any = { updates: [] as any[], runUpdates: [] as any[], runnerImpl: null as any };
// A chainable stand-in for the two statements the recovery sweep makes.
const dbState = vi.hoisted(() => ({ processing: [] as any[], claim: true, writes: [] as Array<{ table: string; patch: any }> }));

vi.mock("../server/db", async () => {
  const { jobs } = await import("@shared/schema");
  return {
    db: {
      select: () => ({ from: () => ({ where: async () => dbState.processing }) }),
      update: (table: unknown) => ({
        set: (patch: any) => ({
          where: () => {
            const name = table === jobs ? "jobs" : "evalRuns";
            dbState.writes.push({ table: name, patch });
            return { returning: async () => (name === "jobs" && dbState.claim ? [{ id: "claimed" }] : []), then: (res: any) => res(undefined) };
          },
        }),
      }),
    },
  };
});
vi.mock("../server/storage", () => ({
  storage: {
    updateJob: vi.fn(async (id: string, patch: any) => { state.updates.push({ id, patch }); return patch; }),
    updateEvalRun: vi.fn(async (id: string, patch: any) => { state.runUpdates.push({ id, patch }); return patch; }),
  },
}));
vi.mock("../server/routes/golden-eval", () => ({
  runEvalRepeatJob: vi.fn(async (...args: any[]) => state.runnerImpl(...args)),
}));

const { processEvalRepeatRun, isOrphanedEvalJob, recoverOrphanedEvalRepeatJobs, ORPHANED_AFTER_MS, HEARTBEAT_INTERVAL_MS } = await import("../server/eval-repeat-job");

const payload = { mode: "golden", suiteId: "s1", runId: "run1", agentId: "a1", caseIds: ["c1"], repeats: 3, orgId: "org1" };
const job = (over: any = {}) => ({ id: "job1", type: "eval_repeat_run", status: "processing", payload, ...over }) as any;

beforeEach(() => {
  state.updates = [];
  state.runUpdates = [];
  dbState.processing = [];
  dbState.claim = true;
  dbState.writes = [];
  state.runnerImpl = async () => ({ passRate: 0.5, stability: { flakyCases: 1 } });
});

describe("processEvalRepeatRun", () => {
  it("returns the run's figures and does not touch the run row on success", async () => {
    const result = await processEvalRepeatRun(job());
    expect(result).toEqual({ runId: "run1", mode: "golden", repeats: 3, passRate: 0.5, stability: { flakyCases: 1 } });
    // The runner that completed the run wrote its row; the job must not overwrite it.
    expect(state.runUpdates).toHaveLength(0);
  });

  it("marks the run failed, with the reason, when the run throws, and rethrows so the job fails", async () => {
    state.runnerImpl = async () => { throw new Error("agent no longer exists"); };
    await expect(processEvalRepeatRun(job())).rejects.toThrow("agent no longer exists");
    expect(state.runUpdates).toHaveLength(1);
    expect(state.runUpdates[0].id).toBe("run1");
    expect(state.runUpdates[0].patch).toMatchObject({ status: "failed", resultsJson: { repeats: 3, error: "agent no longer exists" } });
    expect(state.runUpdates[0].patch.completedAt).toBeInstanceOf(Date);
  });

  it("beats a heartbeat into the payload before it starts, keeping the rest of the payload", async () => {
    await processEvalRepeatRun(job());
    const first = state.updates[0];
    expect(first.id).toBe("job1");
    expect(first.patch.payload).toMatchObject({ ...payload });
    expect(Date.parse(first.patch.payload.heartbeatAt)).not.toBeNaN();
  });

  it("reports progress as a percentage, never 100 until the worker completes the job", async () => {
    state.runnerImpl = async (_p: any, onProgress: any) => {
      await onProgress(0, 4); await onProgress(2, 4); await onProgress(4, 4);
      return { passRate: 1 };
    };
    await processEvalRepeatRun(job());
    const progress = state.updates.map((u: any) => u.patch.progress).filter((p: any) => p !== undefined);
    expect(progress).toEqual([0, 50, 99]);
  });

  it("stops the heartbeat when the run ends, whether it succeeded or threw", async () => {
    vi.useFakeTimers();
    try {
      await processEvalRepeatRun(job());
      state.updates = [];
      vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS * 3);
      expect(state.updates).toHaveLength(0);

      state.runnerImpl = async () => { throw new Error("boom"); };
      await expect(processEvalRepeatRun(job())).rejects.toThrow("boom");
      state.updates = [];
      vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS * 3);
      expect(state.updates).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps beating while a long run is working", async () => {
    vi.useFakeTimers();
    try {
      let release: () => void = () => {};
      state.runnerImpl = () => new Promise(res => { release = () => res({ passRate: 1 }); });
      const done = processEvalRepeatRun(job());
      await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS * 2 + 10);
      const beats = state.updates.filter((u: any) => u.patch.payload?.heartbeatAt);
      expect(beats.length).toBeGreaterThanOrEqual(3);
      release();
      await done;
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("isOrphanedEvalJob", () => {
  const now = Date.parse("2026-10-03T12:00:00Z");
  const ago = (ms: number) => new Date(now - ms).toISOString();

  it("is orphaned when the last heartbeat is older than the limit", () => {
    expect(isOrphanedEvalJob({ status: "processing", startedAt: new Date(now - 60 * 60_000), payload: { heartbeatAt: ago(ORPHANED_AFTER_MS + 1000) } }, now)).toBe(true);
  });

  it("is not orphaned while it is beating, even if it started long ago", () => {
    expect(isOrphanedEvalJob({ status: "processing", startedAt: new Date(now - 60 * 60_000), payload: { heartbeatAt: ago(HEARTBEAT_INTERVAL_MS) } }, now)).toBe(false);
  });

  it("falls back to when it started if it never beat, so a job that died at once is still caught", () => {
    expect(isOrphanedEvalJob({ status: "processing", startedAt: new Date(now - ORPHANED_AFTER_MS - 1000), payload: {} }, now)).toBe(true);
    expect(isOrphanedEvalJob({ status: "processing", startedAt: new Date(now - 1000), payload: {} }, now)).toBe(false);
  });

  it("treats an unreadable heartbeat as if it never beat", () => {
    expect(isOrphanedEvalJob({ status: "processing", startedAt: new Date(now - 1000), payload: { heartbeatAt: "not a date" } }, now)).toBe(false);
    expect(isOrphanedEvalJob({ status: "processing", startedAt: new Date(now - ORPHANED_AFTER_MS - 1000), payload: { heartbeatAt: "not a date" } }, now)).toBe(true);
  });

  it("is never orphaned unless it says it is processing", () => {
    for (const status of ["queued", "completed", "failed"]) {
      expect(isOrphanedEvalJob({ status, startedAt: new Date(now - 60 * 60_000), payload: { heartbeatAt: ago(60 * 60_000) } }, now)).toBe(false);
    }
  });

  it("is orphaned only after several missed beats, not one", () => {
    expect(ORPHANED_AFTER_MS).toBeGreaterThanOrEqual(HEARTBEAT_INTERVAL_MS * 5);
  });
});

describe("recoverOrphanedEvalRepeatJobs", () => {
  const now = Date.parse("2026-10-03T12:00:00Z");
  const row = (id: string, runId: string | undefined, heartbeatAgoMs: number | null, startedAgoMs = 60 * 60_000) => ({
    id, status: "processing", type: "eval_repeat_run",
    startedAt: new Date(now - startedAgoMs),
    payload: { ...(runId ? { runId } : {}), ...(heartbeatAgoMs === null ? {} : { heartbeatAt: new Date(now - heartbeatAgoMs).toISOString() }) },
  });

  it("fails each orphaned job and its run, and leaves a job that is still beating alone", async () => {
    dbState.processing = [
      row("dead", "r1", ORPHANED_AFTER_MS + 5000),
      row("alive", "r2", HEARTBEAT_INTERVAL_MS),
      row("never-beat", "r3", null),
    ];
    expect(await recoverOrphanedEvalRepeatJobs(now)).toBe(2);
    const jobWrites = dbState.writes.filter(w => w.table === "jobs");
    const runWrites = dbState.writes.filter(w => w.table === "evalRuns");
    expect(jobWrites).toHaveLength(2);
    expect(runWrites).toHaveLength(2);
    expect(jobWrites.every(w => w.patch.status === "failed" && /stopped/.test(w.patch.error))).toBe(true);
    expect(runWrites.every(w => w.patch.status === "failed")).toBe(true);
  });

  it("does nothing to a run whose job finished between the check and the claim", async () => {
    dbState.processing = [row("dead", "r1", ORPHANED_AFTER_MS + 5000)];
    dbState.claim = false;
    expect(await recoverOrphanedEvalRepeatJobs(now)).toBe(0);
    expect(dbState.writes.filter(w => w.table === "evalRuns")).toHaveLength(0);
  });

  it("fails an orphaned job that carries no run id without writing a run", async () => {
    dbState.processing = [row("dead", undefined, ORPHANED_AFTER_MS + 5000)];
    expect(await recoverOrphanedEvalRepeatJobs(now)).toBe(1);
    expect(dbState.writes.filter(w => w.table === "evalRuns")).toHaveLength(0);
  });

  it("reports zero when nothing is processing", async () => {
    expect(await recoverOrphanedEvalRepeatJobs(now)).toBe(0);
    expect(dbState.writes).toHaveLength(0);
  });
});
