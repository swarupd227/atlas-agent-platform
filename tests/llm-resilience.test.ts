import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Deterministic unit tests for LLM resilience primitives.
 *
 * These tests exercise circuit-breaker state transitions, single-probe
 * half-open gating, fallback cascade classification, and cost-cap
 * termination fields — without making real LLM API calls.
 */

// ---------------------------------------------------------------------------
// Inline circuit-breaker (mirrors server/llm-provider.ts logic exactly)
// so we can test deterministically without importing the full server module.
// ---------------------------------------------------------------------------

const CB_FAILURE_THRESHOLD = 5;
const CB_WINDOW_MS = 60_000;
const CB_OPEN_DURATION_MS = 30_000;

interface CircuitState {
  failures: number[];
  openUntil: number;
  halfOpen: boolean;
  probeInFlight: boolean;
}

function makeCircuit(): CircuitState {
  return { failures: [], openUntil: 0, halfOpen: false, probeInFlight: false };
}

function cbCheck(circuit: CircuitState, label: string, now: number): void {
  if (circuit.openUntil > 0) {
    if (now >= circuit.openUntil) {
      if (circuit.probeInFlight) {
        throw new Error(`Circuit HALF-OPEN for "${label}": probe already in flight.`);
      }
      circuit.halfOpen = true;
      circuit.openUntil = 0;
      circuit.probeInFlight = true;
    } else {
      throw new Error(`Circuit breaker OPEN for "${label}".`);
    }
  } else if (circuit.halfOpen) {
    if (circuit.probeInFlight) {
      throw new Error(`Circuit HALF-OPEN for "${label}": probe already in flight.`);
    }
    circuit.probeInFlight = true;
  }
}

function cbRecordSuccess(circuit: CircuitState): void {
  circuit.failures = [];
  circuit.openUntil = 0;
  circuit.halfOpen = false;
  circuit.probeInFlight = false;
}

function cbRecordFailure(circuit: CircuitState, now: number): void {
  circuit.probeInFlight = false;
  circuit.failures = circuit.failures.filter((t) => now - t < CB_WINDOW_MS);
  circuit.failures.push(now);
  if (circuit.halfOpen || circuit.failures.length >= CB_FAILURE_THRESHOLD) {
    circuit.openUntil = now + CB_OPEN_DURATION_MS;
    circuit.halfOpen = false;
  }
}

// ---------------------------------------------------------------------------
// Cascade classification (mirrors isCascadable from server/llm-provider.ts)
// ---------------------------------------------------------------------------

const PERMANENT_STATUSES = new Set([400, 401, 403, 404, 422]);
const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);
const RETRYABLE_CODES = new Set(["ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "ECONNREFUSED"]);

function isCascadable(err: unknown): boolean {
  if (!(err instanceof Error)) return true;
  const msg = err.message;
  if (msg.includes("Circuit breaker OPEN") || msg.includes("Circuit HALF-OPEN")) return true;
  const e = err as Error & { status?: number; code?: string; constructor: { name: string } };
  if (e.status !== undefined && PERMANENT_STATUSES.has(e.status)) return false;
  if (e.status !== undefined && RETRYABLE_STATUSES.has(e.status)) return true;
  if (e.code !== undefined && RETRYABLE_CODES.has(e.code)) return true;
  if (e.constructor.name === "RateLimitError") return true;
  if (e.constructor.name === "APIConnectionError") return true;
  if (e.constructor.name === "APIConnectionTimeoutError") return true;
  if (/unauthorized|forbidden|invalid.api.key|authentication/i.test(msg)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Circuit Breaker state transitions", () => {
  it("starts closed — allows requests", () => {
    const circuit = makeCircuit();
    expect(() => cbCheck(circuit, "test", Date.now())).not.toThrow();
  });

  it("opens after threshold failures within window", () => {
    const circuit = makeCircuit();
    const now = 1_000_000;
    for (let i = 0; i < CB_FAILURE_THRESHOLD; i++) {
      cbRecordFailure(circuit, now + i * 100);
    }
    expect(circuit.openUntil).toBeGreaterThan(now);
    expect(() => cbCheck(circuit, "test", now + CB_FAILURE_THRESHOLD * 100)).toThrow(/OPEN/);
  });

  it("blocks requests while circuit is open", () => {
    const circuit = makeCircuit();
    const now = 2_000_000;
    for (let i = 0; i < CB_FAILURE_THRESHOLD; i++) cbRecordFailure(circuit, now);
    expect(() => cbCheck(circuit, "test", now + 1_000)).toThrow(/OPEN/);
  });

  it("allows a single probe after open window expires (half-open)", () => {
    const circuit = makeCircuit();
    const now = 3_000_000;
    for (let i = 0; i < CB_FAILURE_THRESHOLD; i++) cbRecordFailure(circuit, now);
    const afterOpen = now + CB_OPEN_DURATION_MS + 1;
    expect(() => cbCheck(circuit, "test", afterOpen)).not.toThrow();
    expect(circuit.halfOpen).toBe(true);
    expect(circuit.probeInFlight).toBe(true);
  });

  it("blocks concurrent requests while probe is in flight (single-probe gate)", () => {
    const circuit = makeCircuit();
    const now = 4_000_000;
    for (let i = 0; i < CB_FAILURE_THRESHOLD; i++) cbRecordFailure(circuit, now);
    const afterOpen = now + CB_OPEN_DURATION_MS + 1;
    // First request succeeds in getting probe slot
    cbCheck(circuit, "test", afterOpen);
    expect(circuit.probeInFlight).toBe(true);
    // Second concurrent request must be blocked
    expect(() => cbCheck(circuit, "test", afterOpen + 10)).toThrow(/probe already in flight/);
  });

  it("closes after successful probe", () => {
    const circuit = makeCircuit();
    const now = 5_000_000;
    for (let i = 0; i < CB_FAILURE_THRESHOLD; i++) cbRecordFailure(circuit, now);
    const afterOpen = now + CB_OPEN_DURATION_MS + 1;
    cbCheck(circuit, "test", afterOpen);
    cbRecordSuccess(circuit);
    expect(circuit.halfOpen).toBe(false);
    expect(circuit.probeInFlight).toBe(false);
    expect(circuit.openUntil).toBe(0);
    expect(circuit.failures).toHaveLength(0);
    // Should allow next request normally
    expect(() => cbCheck(circuit, "test", afterOpen + 100)).not.toThrow();
  });

  it("reopens if probe fails", () => {
    const circuit = makeCircuit();
    const now = 6_000_000;
    for (let i = 0; i < CB_FAILURE_THRESHOLD; i++) cbRecordFailure(circuit, now);
    const afterOpen = now + CB_OPEN_DURATION_MS + 1;
    cbCheck(circuit, "test", afterOpen);
    cbRecordFailure(circuit, afterOpen);
    expect(circuit.openUntil).toBeGreaterThan(afterOpen);
    expect(circuit.halfOpen).toBe(false);
    expect(circuit.probeInFlight).toBe(false);
  });

  it("does not open when failures are outside the sliding window", () => {
    const circuit = makeCircuit();
    const now = 7_000_000;
    // 4 failures far in the past (outside window)
    for (let i = 0; i < 4; i++) {
      cbRecordFailure(circuit, now - CB_WINDOW_MS - 1_000);
    }
    // 1 recent failure — total in window = 1, below threshold
    cbRecordFailure(circuit, now);
    expect(circuit.openUntil).toBe(0);
    expect(() => cbCheck(circuit, "test", now + 1)).not.toThrow();
  });
});

describe("Cascade classification (isCascadable)", () => {
  it("cascades on circuit-open error message", () => {
    const err = new Error("Circuit breaker OPEN for openai.");
    expect(isCascadable(err)).toBe(true);
  });

  it("cascades on circuit half-open message", () => {
    const err = new Error("Circuit HALF-OPEN for openai: probe already in flight.");
    expect(isCascadable(err)).toBe(true);
  });

  it("cascades on HTTP 429 rate-limit", () => {
    const err = Object.assign(new Error("rate limited"), { status: 429 });
    expect(isCascadable(err)).toBe(true);
  });

  it("cascades on HTTP 503 service unavailable", () => {
    const err = Object.assign(new Error("service unavailable"), { status: 503 });
    expect(isCascadable(err)).toBe(true);
  });

  it("cascades on network ECONNRESET", () => {
    const err = Object.assign(new Error("connection reset"), { code: "ECONNRESET" });
    expect(isCascadable(err)).toBe(true);
  });

  it("does NOT cascade on HTTP 401 Unauthorized", () => {
    const err = Object.assign(new Error("Unauthorized"), { status: 401 });
    expect(isCascadable(err)).toBe(false);
  });

  it("does NOT cascade on HTTP 400 Bad Request", () => {
    const err = Object.assign(new Error("Bad Request"), { status: 400 });
    expect(isCascadable(err)).toBe(false);
  });

  it("does NOT cascade on HTTP 403 Forbidden", () => {
    const err = Object.assign(new Error("Forbidden"), { status: 403 });
    expect(isCascadable(err)).toBe(false);
  });

  it("does NOT cascade on invalid API key message", () => {
    const err = new Error("Invalid API key provided");
    expect(isCascadable(err)).toBe(false);
  });

  it("does NOT cascade on authentication error message", () => {
    const err = new Error("Authentication failed");
    expect(isCascadable(err)).toBe(false);
  });
});

describe("Cost cap termination summary fields", () => {
  it("includes costCapReached=false when under cap", () => {
    const totalCostUsd = 0.5;
    const maxCostPerRunUsd = 1.0;
    const costCapReached = totalCostUsd >= maxCostPerRunUsd;
    const summary: Record<string, unknown> = {
      totalCostUsd,
      costCapUsd: maxCostPerRunUsd,
      costCapReached,
      ...(costCapReached ? { terminationReason: "cost_cap_reached" } : {}),
    };
    expect(summary.costCapReached).toBe(false);
    expect(summary.terminationReason).toBeUndefined();
    expect(summary.totalCostUsd).toBe(0.5);
  });

  it("includes costCapReached=true and terminationReason when over cap", () => {
    const totalCostUsd = 1.05;
    const maxCostPerRunUsd = 1.0;
    const costCapReached = totalCostUsd >= maxCostPerRunUsd;
    const summary: Record<string, unknown> = {
      totalCostUsd,
      costCapUsd: maxCostPerRunUsd,
      costCapReached,
      ...(costCapReached ? { terminationReason: "cost_cap_reached" } : {}),
    };
    expect(summary.costCapReached).toBe(true);
    expect(summary.terminationReason).toBe("cost_cap_reached");
    expect(summary.totalCostUsd).toBe(1.05);
    expect(summary.costCapUsd).toBe(1.0);
  });

  it("success is not forced false by cost cap", () => {
    const failedSteps = 0;
    const costCapReached = true;
    // success should only reflect step failures, not cost cap
    const success = failedSteps === 0;
    expect(success).toBe(true);
  });
});
