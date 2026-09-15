/**
 * watchTeamRun (server/astra/team-run-watch.ts): following a team run.
 */
import { describe, it, expect } from "vitest";
import { watchTeamRun } from "../server/astra/team-run-watch";
import type { DagRunEvent } from "../server/dag-run-events";

function harness(rows: Array<{ status: string; pendingApprovalId: string | null } | null>, buffered: DagRunEvent[] = []) {
  let clock = 0;
  let listener: ((e: DagRunEvent) => void) | null = null;
  let unsubscribed = false;
  let i = 0;
  const seen: DagRunEvent[] = [];
  const deps = {
    subscribe: (_id: string, fn: (e: DagRunEvent) => void) => { listener = fn; return () => { unsubscribed = true; }; },
    buffer: () => buffered,
    loadRow: async () => rows[Math.min(i++, rows.length - 1)],
    now: () => clock,
    sleep: async (ms: number) => { clock += ms; },
  };
  return { deps, seen, onEvent: (e: DagRunEvent) => seen.push(e), fire: (e: DagRunEvent) => listener?.(e), unsubscribed: () => unsubscribed };
}

const ev = (type: DagRunEvent["type"], extra: Partial<DagRunEvent> = {}): DagRunEvent => ({ type, ts: "t", ...extra });

describe("watchTeamRun", () => {
  it("replays what already happened, once each, and reports the finish from the run row", async () => {
    const first = ev("node_start", { label: "Gather" });
    const h = harness([{ status: "running", pendingApprovalId: null }, { status: "completed", pendingApprovalId: null }], [first, ev("node_complete", { label: "Gather", status: "completed" })]);
    const result = await watchTeamRun({ runId: "r", onEvent: h.onEvent, maxWaitMs: 60_000, pollMs: 1000 }, h.deps);
    expect(result).toEqual({ state: "finished", status: "completed" });
    expect(h.seen.map((e) => e.type)).toEqual(["node_start", "node_complete"]);
    h.fire(first);
    expect(h.unsubscribed()).toBe(true);
  });

  it("sees a pause from the row alone (another instance runs it, so no events arrive)", async () => {
    const h = harness([{ status: "running", pendingApprovalId: null }, { status: "waiting_approval", pendingApprovalId: "apr-1" }]);
    expect(await watchTeamRun({ runId: "r", onEvent: h.onEvent, maxWaitMs: 60_000, pollMs: 1000 }, h.deps)).toEqual({ state: "paused", approvalId: "apr-1", label: null });
  });

  it("names the gate from its event, and ignores the approval just decided until the run moves on", async () => {
    const h = harness(
      [
        { status: "waiting_approval", pendingApprovalId: "apr-1" },
        { status: "running", pendingApprovalId: null },
        { status: "waiting_approval", pendingApprovalId: "apr-2" },
      ],
      [ev("approval_pending", { approvalId: "apr-2", label: "Final sign-off" })],
    );
    expect(await watchTeamRun({ runId: "r", onEvent: h.onEvent, maxWaitMs: 60_000, pollMs: 1000, ignoreApprovalId: "apr-1" }, h.deps)).toEqual({ state: "paused", approvalId: "apr-2", label: "Final sign-off" });
  });

  it("stops waiting after the limit, and says when the run can't be found", async () => {
    const running = harness([{ status: "running", pendingApprovalId: null }]);
    expect(await watchTeamRun({ runId: "r", onEvent: running.onEvent, maxWaitMs: 5000, pollMs: 1000 }, running.deps)).toEqual({ state: "still_running" });
    const gone = harness([null]);
    expect(await watchTeamRun({ runId: "r", onEvent: gone.onEvent, maxWaitMs: 5000 }, gone.deps)).toEqual({ state: "missing" });
  });
});
