// Pure state-transition logic for the worker-task lifecycle (Initiative 04).
// No DB, no imports — the storage layer and routes call these to decide what a
// claim / complete / fail / lease-expiry does, so the rules are unit-tested in
// isolation. The atomic "claim the next pending task" query lives in storage;
// everything about *validity* and *what state results* lives here.

export type WorkerTaskStatus = "pending" | "claimed" | "completed" | "failed";

export interface WorkerTaskState {
  status: WorkerTaskStatus;
  attempts: number;
  maxAttempts: number;
  leaseExpiresAt?: Date | string | null;
}

export interface TransitionPatch {
  status?: WorkerTaskStatus;
  attempts?: number;
  output?: unknown;
  error?: string | null;
  leaseExpiresAt?: Date | null;
  claimedBy?: string | null;
}

export interface TransitionResult {
  ok: boolean;
  reason?: string;
  patch?: TransitionPatch;
}

export const DEFAULT_LEASE_MS = 60_000;

function leaseExpired(t: WorkerTaskState, now: Date): boolean {
  if (!t.leaseExpiresAt) return true;
  const exp = t.leaseExpiresAt instanceof Date ? t.leaseExpiresAt : new Date(t.leaseExpiresAt);
  return exp.getTime() <= now.getTime();
}

/** A worker claims a task: allowed from `pending`, or from `claimed` whose lease
 *  has expired (the previous claimant died). Bumps attempts and sets a fresh
 *  lease. Rejected once the attempt budget is spent, or when already terminal. */
export function claimTransition(t: WorkerTaskState, now: Date, claimedBy: string, leaseMs = DEFAULT_LEASE_MS): TransitionResult {
  const claimable = t.status === "pending" || (t.status === "claimed" && leaseExpired(t, now));
  if (!claimable) return { ok: false, reason: `not claimable from status ${t.status}` };
  if (t.attempts >= t.maxAttempts) return { ok: false, reason: "attempts exhausted" };
  return {
    ok: true,
    patch: {
      status: "claimed",
      attempts: t.attempts + 1,
      leaseExpiresAt: new Date(now.getTime() + leaseMs),
      claimedBy,
      error: null,
    },
  };
}

/** A worker reports success. Only a claimed task can complete. */
export function completeTransition(t: WorkerTaskState, output: unknown): TransitionResult {
  if (t.status !== "claimed") return { ok: false, reason: `cannot complete from status ${t.status}` };
  return { ok: true, patch: { status: "completed", output, error: null, leaseExpiresAt: null, claimedBy: null } };
}

/** A worker reports failure: requeue to `pending` if attempts remain, else mark
 *  `failed` terminally. Only a claimed task can fail this way. */
export function failTransition(t: WorkerTaskState, error: string): TransitionResult {
  if (t.status !== "claimed") return { ok: false, reason: `cannot fail from status ${t.status}` };
  if (t.attempts < t.maxAttempts) {
    return { ok: true, patch: { status: "pending", error, leaseExpiresAt: null, claimedBy: null } };
  }
  return { ok: true, patch: { status: "failed", error, leaseExpiresAt: null, claimedBy: null } };
}

/** Sweeper: a claimed task whose lease expired is reclaimable — requeue it to
 *  `pending` if attempts remain, else fail it. No-op for any other state. */
export function expireTransition(t: WorkerTaskState, now: Date): TransitionResult {
  if (t.status !== "claimed" || !leaseExpired(t, now)) return { ok: false, reason: "not an expired claim" };
  if (t.attempts < t.maxAttempts) {
    return { ok: true, patch: { status: "pending", leaseExpiresAt: null, claimedBy: null, error: "lease expired — requeued" } };
  }
  return { ok: true, patch: { status: "failed", leaseExpiresAt: null, claimedBy: null, error: "lease expired — attempts exhausted" } };
}

export const isTerminal = (s: WorkerTaskStatus): boolean => s === "completed" || s === "failed";
