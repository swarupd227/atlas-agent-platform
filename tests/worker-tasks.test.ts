import { describe, it, expect } from "vitest";
import { claimTransition, completeTransition, failTransition, expireTransition, isTerminal, DEFAULT_LEASE_MS, type WorkerTaskState } from "../server/worker-tasks";

// Worker-task lifecycle rules (Initiative 04), unit-tested in isolation — no DB.
const now = new Date("2026-09-12T12:00:00Z");
const base: WorkerTaskState = { status: "pending", attempts: 0, maxAttempts: 3, leaseExpiresAt: null };

describe("worker-task claim", () => {
  it("claims a pending task, bumping attempts and setting a lease", () => {
    const r = claimTransition(base, now, "worker-1");
    expect(r.ok).toBe(true);
    expect(r.patch).toMatchObject({ status: "claimed", attempts: 1, claimedBy: "worker-1" });
    expect((r.patch!.leaseExpiresAt as Date).getTime()).toBe(now.getTime() + DEFAULT_LEASE_MS);
  });
  it("reclaims a claimed task whose lease has expired (dead worker)", () => {
    const expired: WorkerTaskState = { status: "claimed", attempts: 1, maxAttempts: 3, leaseExpiresAt: new Date(now.getTime() - 1000) };
    expect(claimTransition(expired, now, "worker-2").ok).toBe(true);
  });
  it("refuses to claim a claimed task with a live lease", () => {
    const live: WorkerTaskState = { status: "claimed", attempts: 1, maxAttempts: 3, leaseExpiresAt: new Date(now.getTime() + 30_000) };
    expect(claimTransition(live, now, "w").ok).toBe(false);
  });
  it("refuses to claim once attempts are exhausted", () => {
    expect(claimTransition({ status: "pending", attempts: 3, maxAttempts: 3, leaseExpiresAt: null }, now, "w").ok).toBe(false);
  });
  it("refuses to claim a terminal task", () => {
    expect(claimTransition({ ...base, status: "completed" }, now, "w").ok).toBe(false);
  });
});

describe("worker-task complete", () => {
  it("completes only from claimed and carries output", () => {
    const claimed: WorkerTaskState = { status: "claimed", attempts: 1, maxAttempts: 3, leaseExpiresAt: new Date(now.getTime() + 30_000) };
    const r = completeTransition(claimed, { result: 42 });
    expect(r.ok).toBe(true);
    expect(r.patch).toMatchObject({ status: "completed", output: { result: 42 }, leaseExpiresAt: null });
  });
  it("cannot complete a pending task", () => {
    expect(completeTransition(base, {}).ok).toBe(false);
  });
});

describe("worker-task fail", () => {
  it("requeues to pending when attempts remain", () => {
    const claimed: WorkerTaskState = { status: "claimed", attempts: 1, maxAttempts: 3, leaseExpiresAt: null };
    const r = failTransition(claimed, "boom");
    expect(r.patch).toMatchObject({ status: "pending", error: "boom" });
  });
  it("fails terminally once the attempt budget is spent", () => {
    const claimed: WorkerTaskState = { status: "claimed", attempts: 3, maxAttempts: 3, leaseExpiresAt: null };
    const r = failTransition(claimed, "boom");
    expect(r.patch).toMatchObject({ status: "failed", error: "boom" });
  });
});

describe("worker-task lease expiry (sweeper)", () => {
  it("requeues an expired claim when attempts remain", () => {
    const expired: WorkerTaskState = { status: "claimed", attempts: 1, maxAttempts: 3, leaseExpiresAt: new Date(now.getTime() - 1) };
    expect(expireTransition(expired, now).patch).toMatchObject({ status: "pending" });
  });
  it("fails an expired claim with no attempts left", () => {
    const expired: WorkerTaskState = { status: "claimed", attempts: 3, maxAttempts: 3, leaseExpiresAt: new Date(now.getTime() - 1) };
    expect(expireTransition(expired, now).patch).toMatchObject({ status: "failed" });
  });
  it("is a no-op on a live claim", () => {
    const live: WorkerTaskState = { status: "claimed", attempts: 1, maxAttempts: 3, leaseExpiresAt: new Date(now.getTime() + 30_000) };
    expect(expireTransition(live, now).ok).toBe(false);
  });
});

describe("isTerminal", () => {
  it("marks completed and failed terminal, others not", () => {
    expect(isTerminal("completed")).toBe(true);
    expect(isTerminal("failed")).toBe(true);
    expect(isTerminal("pending")).toBe(false);
    expect(isTerminal("claimed")).toBe(false);
  });
});
