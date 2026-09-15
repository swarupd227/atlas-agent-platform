/**
 * Follow a team run from the conversation until it pauses for a person,
 * finishes, or the wait runs out. Pure: everything is injected.
 *
 * Step events narrate the run, but they only exist in the process running it
 * and aren't kept forever, so the run row is the source of truth for whether
 * it is waiting on an approval or has finished -- the watcher polls it, and
 * wakes early when an event says something changed.
 */
import type { DagRunEvent } from "../dag-run-events";

export const TERMINAL_RUN_STATUSES = new Set(["completed", "completed_with_skips", "failed", "cancelled"]);

export interface WatchedRunRow {
  status: string;
  pendingApprovalId: string | null;
}

export type WatchResult =
  | { state: "paused"; approvalId: string; label: string | null }
  | { state: "finished"; status: string }
  | { state: "still_running" }
  | { state: "missing" };

export interface WatchDeps {
  subscribe: (runId: string, fn: (e: DagRunEvent) => void) => () => void;
  buffer: (runId: string) => DagRunEvent[];
  loadRow: () => Promise<WatchedRunRow | null>;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export interface WatchOptions {
  runId: string;
  onEvent: (e: DagRunEvent) => void;
  maxWaitMs: number;
  pollMs?: number;
  /** An approval just decided from here: the row keeps showing it until the run resumes. */
  ignoreApprovalId?: string | null;
}

export async function watchTeamRun(opts: WatchOptions, deps: WatchDeps): Promise<WatchResult> {
  const now = deps.now ?? Date.now;
  const pollMs = opts.pollMs ?? 3000;
  const started = now();
  const seen = new Set<DagRunEvent>();
  const gateLabels = new Map<string, string>();
  let wake: (() => void) | null = null;

  const handle = (e: DagRunEvent) => {
    if (seen.has(e)) return;
    seen.add(e);
    if (e.type === "approval_pending" && e.approvalId && e.label) gateLabels.set(e.approvalId, e.label);
    try {
      opts.onEvent(e);
    } catch {
      /* narration must never stop the watch */
    }
    if (e.type === "approval_pending" || e.type === "run_complete") wake?.();
  };

  // Subscribe first, then replay what already happened, so nothing falls between.
  const unsubscribe = deps.subscribe(opts.runId, handle);
  try {
    for (const e of deps.buffer(opts.runId)) handle(e);

    while (true) {
      const row = await deps.loadRow();
      if (!row) return { state: "missing" };
      if (TERMINAL_RUN_STATUSES.has(row.status)) return { state: "finished", status: row.status };
      if (row.status === "waiting_approval" && row.pendingApprovalId && row.pendingApprovalId !== opts.ignoreApprovalId) {
        return { state: "paused", approvalId: row.pendingApprovalId, label: gateLabels.get(row.pendingApprovalId) ?? null };
      }
      if (now() - started >= opts.maxWaitMs) return { state: "still_running" };

      const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
      await Promise.race([sleep(pollMs), new Promise<void>((r) => { wake = r; })]);
      wake = null;
    }
  } finally {
    unsubscribe();
  }
}
