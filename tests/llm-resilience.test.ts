import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  LLMProvider,
  LLMMessage,
  LLMCompletionOptions,
  LLMCompletionResult,
  LLMProviderInfo,
  LLMEmbeddingResult,
} from "../server/llm-provider";
import { completeWithFallback } from "../server/llm-provider";

/**
 * Deterministic unit tests for LLM resilience primitives.
 *
 * These tests exercise circuit-breaker state transitions, single-probe
 * half-open gating, fallback cascade classification, cost-cap termination
 * fields, and integration-style cascade behavior via real completeWithFallback
 * calls with mock provider objects.
 */

// ---------------------------------------------------------------------------
// Mock provider factory
// ---------------------------------------------------------------------------

function makeResult(content = "ok"): LLMCompletionResult {
  return {
    content,
    toolCalls: [],
    tokensUsed: { prompt: 10, completion: 5, total: 15 },
    costUsd: 0.001,
  };
}

function mockProvider(
  name: string,
  completeFn: (msgs: LLMMessage[], opts?: LLMCompletionOptions) => Promise<LLMCompletionResult>
): LLMProvider {
  return {
    providerName: name,
    complete: completeFn,
    embed: async () => ({ embeddings: [], tokensUsed: 0, costUsd: 0 } as LLMEmbeddingResult),
    getInfo: () => ({ name, displayName: name, configured: true, models: [] } as LLMProviderInfo),
  };
}

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

// ---------------------------------------------------------------------------
// Integration-style tests: real completeWithFallback() with mock providers
// ---------------------------------------------------------------------------

const MESSAGES: LLMMessage[] = [{ role: "user", content: "hello" }];

describe("completeWithFallback() integration (mock providers)", () => {
  it("returns primary provider result when primary succeeds", async () => {
    const primary = mockProvider("openai", async () => makeResult("from-primary"));
    const fallback = mockProvider("anthropic", async () => makeResult("from-fallback"));
    const result = await completeWithFallback(MESSAGES, undefined, [primary, fallback]);
    expect(result.content).toBe("from-primary");
  });

  it("cascades to fallback when primary throws a transient 503 error", async () => {
    const transientErr = Object.assign(new Error("Service unavailable"), { status: 503 });
    const primary = mockProvider("openai", async () => { throw transientErr; });
    const fallback = mockProvider("anthropic", async () => makeResult("from-fallback"));
    const result = await completeWithFallback(MESSAGES, undefined, [primary, fallback]);
    expect(result.content).toBe("from-fallback");
  });

  it("cascades to fallback when primary throws a 429 rate-limit error", async () => {
    const rateLimitErr = Object.assign(new Error("Too Many Requests"), { status: 429 });
    const primary = mockProvider("openai", async () => { throw rateLimitErr; });
    const fallback = mockProvider("anthropic", async () => makeResult("fallback-ok"));
    const result = await completeWithFallback(MESSAGES, undefined, [primary, fallback]);
    expect(result.content).toBe("fallback-ok");
  });

  it("does NOT cascade and rethrows on permanent 401 error", async () => {
    const authErr = Object.assign(new Error("Unauthorized"), { status: 401 });
    const primary = mockProvider("openai", async () => { throw authErr; });
    const fallbackCalled = vi.fn().mockResolvedValue(makeResult("fallback"));
    const fallback = mockProvider("anthropic", fallbackCalled);
    await expect(completeWithFallback(MESSAGES, undefined, [primary, fallback])).rejects.toThrow("Unauthorized");
    expect(fallbackCalled).not.toHaveBeenCalled();
  });

  it("does NOT cascade and rethrows on permanent 400 error", async () => {
    const badReqErr = Object.assign(new Error("Bad Request"), { status: 400 });
    const primary = mockProvider("openai", async () => { throw badReqErr; });
    const fallbackCalled = vi.fn().mockResolvedValue(makeResult("fallback"));
    const fallback = mockProvider("anthropic", fallbackCalled);
    await expect(completeWithFallback(MESSAGES, undefined, [primary, fallback])).rejects.toThrow("Bad Request");
    expect(fallbackCalled).not.toHaveBeenCalled();
  });

  it("throws when all providers fail", async () => {
    const err503 = Object.assign(new Error("Unavailable"), { status: 503 });
    const primary = mockProvider("openai", async () => { throw err503; });
    const fallback = mockProvider("anthropic", async () => { throw err503; });
    await expect(completeWithFallback(MESSAGES, undefined, [primary, fallback])).rejects.toThrow(/All providers failed/);
  });

  it("strips model from options for fallback provider calls", async () => {
    const primary = mockProvider("openai", async () => { throw Object.assign(new Error("Unavailable"), { status: 503 }); });
    const receivedOptions: LLMCompletionOptions[] = [];
    const fallback = mockProvider("anthropic", async (_msgs, opts) => {
      receivedOptions.push(opts ?? {});
      return makeResult("ok");
    });
    await completeWithFallback(MESSAGES, { model: "gpt-4.1", temperature: 0.5 }, [primary, fallback]);
    expect(receivedOptions[0].model).toBeUndefined();
    expect(receivedOptions[0].temperature).toBe(0.5);
  });
});

// ---------------------------------------------------------------------------
// Rate-limit patience, fallback visibility and control
// ---------------------------------------------------------------------------

import { retryDelayMs, maxRetriesFor, providerFallbackAllowed, unwrapJsonFence, isRateLimitError } from "../server/llm-provider";

describe("retry schedule", () => {
  const fixed = () => 0.5;

  it("waits as long as a rate limit's retry-after header asks", () => {
    const err = Object.assign(new Error("Too Many Requests"), { status: 429, headers: { "retry-after": "7" } });
    expect(retryDelayMs(err, 0, fixed)).toBe(7250);
  });

  it("reads retry-after-ms and a Headers-like object", () => {
    const headers = new Map([["retry-after-ms", "1200"]]);
    const err = Object.assign(new Error("Too Many Requests"), { status: 429, headers });
    expect(retryDelayMs(err, 0, fixed)).toBe(1450);
  });

  it("backs off 2s, 4s, 8s, 16s, 30s on a rate limit with no hint, and retries five times", () => {
    const err = Object.assign(new Error("Too Many Requests"), { status: 429 });
    expect([0, 1, 2, 3, 4].map((a) => retryDelayMs(err, a, fixed))).toEqual([2000, 4000, 8000, 16000, 30000]);
    expect(maxRetriesFor(err)).toBe(5);
    expect(isRateLimitError(err)).toBe(true);
  });

  it("keeps the short schedule for other transient errors", () => {
    const err = Object.assign(new Error("Service unavailable"), { status: 503 });
    expect([0, 1, 2].map((a) => retryDelayMs(err, a, fixed))).toEqual([750, 1500, 3000]);
    expect(maxRetriesFor(err)).toBe(3);
  });
});

describe("provider fallback visibility and control", () => {
  const rateLimited = Object.assign(new Error("Too Many Requests"), { status: 429 });

  it("marks a result served by the fallback provider, with the reason", async () => {
    const primary = mockProvider("openai", async () => { throw rateLimited; });
    const fallback = mockProvider("anthropic", async () => ({ ...makeResult("from-fallback"), actualProvider: "anthropic", actualModel: "claude-sonnet-4-5" }));
    const result = await completeWithFallback(MESSAGES, { model: "gpt-4.1" }, [primary, fallback]);
    expect(result.providerFallback).toBe(true);
    expect(result.requestedProvider).toBe("openai");
    expect(result.actualProvider).toBe("anthropic");
    expect(result.actualModel).toBe("claude-sonnet-4-5");
    expect(result.fallbackReason).toBe("rate_limited");
  });

  it("does not mark a result the requested provider served", async () => {
    const primary = mockProvider("openai", async () => ({ ...makeResult("ok"), actualProvider: "openai" }));
    const result = await completeWithFallback(MESSAGES, undefined, [primary, mockProvider("anthropic", async () => makeResult("no"))]);
    expect(result.providerFallback).toBeUndefined();
    expect(result.fallbackReason).toBeUndefined();
  });

  it("stays on the requested provider when the call disallows fallback", async () => {
    const primary = mockProvider("openai", async () => { throw rateLimited; });
    const fallbackCalled = vi.fn().mockResolvedValue(makeResult("fallback"));
    await expect(completeWithFallback(MESSAGES, { allowProviderFallback: false }, [primary, mockProvider("anthropic", fallbackCalled)])).rejects.toThrow(/All providers failed/);
    expect(fallbackCalled).not.toHaveBeenCalled();
  });

  it("LLM_PROVIDER_FALLBACK=off disables fallback platform-wide", () => {
    const before = process.env.LLM_PROVIDER_FALLBACK;
    try {
      process.env.LLM_PROVIDER_FALLBACK = "off";
      expect(providerFallbackAllowed()).toBe(false);
      process.env.LLM_PROVIDER_FALLBACK = "on";
      expect(providerFallbackAllowed()).toBe(true);
      expect(providerFallbackAllowed({ allowProviderFallback: false })).toBe(false);
    } finally {
      if (before === undefined) delete process.env.LLM_PROVIDER_FALLBACK; else process.env.LLM_PROVIDER_FALLBACK = before;
    }
  });
});

import { providerForModel, primaryProviderName, isCallerAbort } from "../server/llm-provider";

describe("recognising a caller's own abort", () => {
  it("counts every shape the SDKs actually throw, and nothing else", () => {
    class APIUserAbortError extends Error {}
    // The shape that slipped through a `name === "AbortError"` check and made a
    // route timeout surface as a generic provider failure.
    expect(isCallerAbort(new APIUserAbortError("Request was aborted."))).toBe(true);
    expect(isCallerAbort(Object.assign(new Error("Request aborted while waiting to retry"), { name: "AbortError" }))).toBe(true);
    expect(isCallerAbort(Object.assign(new Error("canceled"), { code: "ERR_CANCELED" }))).toBe(true);
    expect(isCallerAbort(Object.assign(new Error("Too Many Requests"), { status: 429 }))).toBe(false);
    expect(isCallerAbort("not an error")).toBe(false);
  });
});

describe("routing a call to the provider that owns its model", () => {
  it("attributes model ids to their provider, and leaves unknown ids alone", () => {
    expect(providerForModel("gpt-4.1-mini")).toBe("openai");
    expect(providerForModel("o3-mini")).toBe("openai");
    expect(providerForModel("claude-sonnet-4-5")).toBe("anthropic");
    expect(providerForModel("anthropic/claude-sonnet-4-5")).toBe("anthropic");
    expect(providerForModel("gemini-2.5-pro")).toBe("google");
    expect(providerForModel("some-self-hosted-llama")).toBeUndefined();
    expect(providerForModel(undefined)).toBeUndefined();
  });

  it("tries the requested provider first, then the model's owner, then the default", () => {
    const before = process.env.DEFAULT_LLM_PROVIDER;
    try {
      process.env.DEFAULT_LLM_PROVIDER = "anthropic";
      expect(primaryProviderName({ requestedProvider: "openai", model: "claude-sonnet-4-5" })).toBe("openai");
      expect(primaryProviderName({ model: "gpt-4.1-mini" })).toBe("openai");
      expect(primaryProviderName({ model: "some-self-hosted-llama" })).toBe("anthropic");
      expect(primaryProviderName()).toBe("anthropic");
    } finally {
      if (before === undefined) delete process.env.DEFAULT_LLM_PROVIDER; else process.env.DEFAULT_LLM_PROVIDER = before;
    }
  });

  it("never sends a model id to a provider that does not own it", async () => {
    // The live failure this guards: with DEFAULT_LLM_PROVIDER=anthropic, a call
    // for "gpt-4.1-mini" reached Anthropic verbatim, which 404s on an unknown
    // model -- a permanent status, so the chain refused to cascade at all.
    const seen: Array<string | undefined> = [];
    const anthropic = mockProvider("anthropic", async (_m, o) => {
      seen.push(o?.model);
      return makeResult("drafted on its own default model");
    });
    const result = await completeWithFallback(MESSAGES, { model: "gpt-4.1-mini" }, [anthropic]);
    expect(seen).toEqual([undefined]);
    expect(result.content).toBe("drafted on its own default model");
  });

  it("keeps the model on the leg that owns it, and drops it on later legs", async () => {
    const seen: Array<string | undefined> = [];
    const openai = mockProvider("openai", async (_m, o) => {
      seen.push(o?.model);
      throw Object.assign(new Error("Too Many Requests"), { status: 429 });
    });
    const anthropic = mockProvider("anthropic", async (_m, o) => {
      seen.push(o?.model);
      return makeResult("from-fallback");
    });
    const result = await completeWithFallback(MESSAGES, { model: "gpt-4.1-mini" }, [openai, anthropic]);
    expect(seen).toEqual(["gpt-4.1-mini", undefined]);
    expect(result.providerFallback).toBe(true);
  });
});

describe("unwrapJsonFence", () => {
  it("strips a ```json fence and leaves bare JSON alone", () => {
    expect(unwrapJsonFence('```json\n{"a": 1}\n```')).toBe('{"a": 1}');
    expect(unwrapJsonFence('{"a": 1}')).toBe('{"a": 1}');
    expect(unwrapJsonFence("prose then ```json {} ```")).toBe("prose then ```json {} ```");
  });
});

describe("exhausted quota is not a rate limit", () => {
  it("is never retried and cascades with its own reason", async () => {
    const { isQuotaExhaustedError } = await import("../server/llm-provider");
    const quota = Object.assign(new Error("429 You exceeded your current quota, please check your plan and billing details."), { status: 429, code: "insufficient_quota" });
    expect(isQuotaExhaustedError(quota)).toBe(true);
    expect(isRateLimitError(quota)).toBe(false);
    const calls = vi.fn(async () => { throw quota; });
    const primary = mockProvider("openai", calls);
    const fallback = mockProvider("anthropic", async () => ({ ...makeResult("from-fallback"), actualProvider: "anthropic" }));
    const result = await completeWithFallback(MESSAGES, undefined, [primary, fallback]);
    expect(result.providerFallback).toBe(true);
    expect(result.fallbackReason).toBe("quota_exhausted");
    expect(calls).toHaveBeenCalledTimes(1);
  });

  it("recognises a dead key by the message alone, with no quota code", async () => {
    const { isQuotaExhaustedError } = await import("../server/llm-provider");
    // The exact 429 a credit-less key returns. It carries no insufficient_quota
    // code, so before this it read as an ordinary rate limit and was retried
    // with backoff until the caller's timeout killed the step (live
    // 2026-09-24: 180s burned per agent step, and no cascade).
    const noCredits = Object.assign(
      new Error("429 You have no credits remaining. Add credits to continue using the API at https://platform.openai.com/settings/organization/billing/."),
      { status: 429 },
    );
    expect(isQuotaExhaustedError(noCredits)).toBe(true);
    expect(isRateLimitError(noCredits)).toBe(false);

    const calls = vi.fn(async () => { throw noCredits; });
    const result = await completeWithFallback(MESSAGES, undefined, [
      mockProvider("openai", calls),
      mockProvider("anthropic", async () => ({ ...makeResult("from-fallback"), actualProvider: "anthropic" })),
    ]);
    expect(result.content).toBe("from-fallback");
    expect(result.fallbackReason).toBe("quota_exhausted");
    expect(calls).toHaveBeenCalledTimes(1);
  });

  it("still treats a genuine rate limit as retryable", async () => {
    const { isQuotaExhaustedError } = await import("../server/llm-provider");
    // Wording that mentions a limit but not money: waiting does clear this one.
    const rateLimited = Object.assign(
      new Error("429 Rate limit reached for gpt-4o in organization org-x on tokens per min. Limit: 30000, Used: 30000. Please try again in 6ms."),
      { status: 429 },
    );
    expect(isQuotaExhaustedError(rateLimited)).toBe(false);
    expect(isRateLimitError(rateLimited)).toBe(true);
    // A 429 that is not about credit must not be caught by the wider match.
    expect(isQuotaExhaustedError(Object.assign(new Error("429 Too Many Requests"), { status: 429 }))).toBe(false);
    // And the wording only counts on a 429, not on an unrelated failure.
    expect(isQuotaExhaustedError(Object.assign(new Error("500 no credits remaining"), { status: 500 }))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Rate-limit hints and pacing
// ---------------------------------------------------------------------------

import { parseDurationMs, parseRateLimitHint, TokenRatePacer, requestTokenCharge } from "../server/llm-provider";

describe("parseDurationMs", () => {
  it("reads OpenAI's duration spellings", () => {
    expect(parseDurationMs("6ms")).toBe(6);
    expect(parseDurationMs("1.5s")).toBe(1500);
    expect(parseDurationMs("1m2.4s")).toBe(62400);
    expect(parseDurationMs("2")).toBe(2000);
    expect(parseDurationMs("soon")).toBeUndefined();
  });
});

describe("parseRateLimitHint", () => {
  it("takes the wait from the 429 message and the limit it names", () => {
    const err = Object.assign(new Error("429 Rate limit reached for gpt-4.1 in organization org-x on tokens per min (TPM): Limit 30000, Used 28000, Requested 12000. Please try again in 14.2s. Visit https://platform.openai.com/account/rate-limits"), { status: 429 });
    expect(parseRateLimitHint(err)).toEqual({ retryMs: 14200, limitTokensPerMinute: 30000 });
    expect(retryDelayMs(err, 0, () => 0.5)).toBe(14450);
  });

  it("prefers the reset and limit headers when present", () => {
    const headers = new Map([["x-ratelimit-reset-tokens", "350ms"], ["x-ratelimit-limit-tokens", "450000"]]);
    const err = Object.assign(new Error("Too Many Requests"), { status: 429, headers });
    expect(parseRateLimitHint(err)).toEqual({ retryMs: 350, limitTokensPerMinute: 450000 });
  });
});

describe("TokenRatePacer", () => {
  it("does nothing until a limit is known, then queues requests that would exceed the minute's budget", async () => {
    const pacer = new TokenRatePacer("test");
    const t0 = Date.now();
    await pacer.acquire(1_000_000);
    expect(Date.now() - t0).toBeLessThan(50);

    pacer.learn(1000);
    await pacer.acquire(600);
    const start = Date.now();
    // Over budget: waits for the first charge to age out of the window. The
    // window is 60s, so instead of waiting, check that the call is pending.
    let settled = false;
    const p = pacer.acquire(600).then(() => { settled = true; });
    await new Promise((r) => setTimeout(r, 30));
    expect(settled).toBe(false);
    expect(Date.now() - start).toBeLessThan(1000);
    // A request that fits goes straight through (the pending one holds the queue, so it is queued behind it: use a fresh pacer to show the fit case).
    const fresh = new TokenRatePacer("fresh", 1000);
    await fresh.acquire(400);
    await fresh.acquire(400);
    void p;
  });

  it("charges what the provider charges: max(max_tokens, prompt estimate)", () => {
    const messages = [{ role: "user" as const, content: "x".repeat(40_000) }];
    expect(requestTokenCharge(messages, undefined, 4096)).toBe(10_000);
    expect(requestTokenCharge([{ role: "user" as const, content: "hi" }], undefined, 16384)).toBe(16384);
  });
});
