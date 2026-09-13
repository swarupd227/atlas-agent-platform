/**
 * Streamed Anthropic calls, watched for silence.
 *
 * A non-streaming call that stalls is indistinguishable from a slow one until
 * the SDK's 10-minute timeout; live, that cost roughly 30% of agent time on the
 * content workbench journeys. Streamed, a healthy call keeps emitting events,
 * so a call that goes silent can be abandoned and retried in two minutes -- and
 * a caller that has stopped wanting the answer (a DAG node that timed out) can
 * cancel it outright.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  ANTHROPIC_STREAM_IDLE_TIMEOUT_MS,
  StreamIdleTimeoutError,
  awaitStreamWithIdleTimeout,
} from "../server/anthropic-stream";
import { currentLlmAbortSignal, runWithLlmAbortSignal } from "../server/llm-abort-context";
import { completeWithFallback } from "../server/llm-provider";
import type { LLMCompletionResult, LLMEmbeddingResult, LLMMessage, LLMProvider, LLMProviderInfo } from "../server/llm-provider";

/** Same name the SDK uses, so the provider recognises it as a caller abort. */
class APIUserAbortError extends Error {
  constructor() {
    super("Request was aborted.");
  }
}

/** Stands in for the SDK's MessageStream: emit events, then finish or be aborted. */
class FakeStream<T> {
  abortCount = 0;
  private listeners: Record<string, Array<() => void>> = {};
  private settle!: { resolve: (v: T) => void; reject: (e: unknown) => void };
  private readonly done = new Promise<T>((resolve, reject) => {
    this.settle = { resolve, reject };
  });

  constructor() {
    // The real stream's promise is only observed once finalMessage() is awaited;
    // an abort that lands first must not surface as an unhandled rejection.
    this.done.catch(() => {});
  }
  on(event: string, listener: () => void) {
    (this.listeners[event] ||= []).push(listener);
    return this;
  }
  emit(event: "connect" | "streamEvent") {
    for (const l of this.listeners[event] ?? []) l();
  }
  abort() {
    this.abortCount++;
    this.settle.reject(new APIUserAbortError());
  }
  finish(value: T) {
    this.settle.resolve(value);
  }
  finalMessage() {
    return this.done;
  }
}

describe("awaitStreamWithIdleTimeout", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("returns the final message of a stream that completes", async () => {
    const stream = new FakeStream<{ id: string }>();
    const pending = awaitStreamWithIdleTimeout(stream, { idleTimeoutMs: 1000 });
    stream.emit("connect");
    stream.emit("streamEvent");
    stream.finish({ id: "msg_1" });
    await expect(pending).resolves.toEqual({ id: "msg_1" });
    expect(stream.abortCount).toBe(0);
  });

  it("abandons a stream that goes silent, with an error the retry loop treats as transient", async () => {
    const stream = new FakeStream<unknown>();
    const pending = awaitStreamWithIdleTimeout(stream, { idleTimeoutMs: 1000 });
    const assertion = expect(pending).rejects.toBeInstanceOf(StreamIdleTimeoutError);
    stream.emit("connect");
    await vi.advanceTimersByTimeAsync(1001);
    await assertion;
    expect(stream.abortCount).toBe(1);
  });

  it("never abandons a slow stream that keeps producing events", async () => {
    const stream = new FakeStream<string>();
    const pending = awaitStreamWithIdleTimeout(stream, { idleTimeoutMs: 1000 });
    // Twenty seconds of generation -- twenty times the idle limit -- with an event every 900ms.
    for (let i = 0; i < 22; i++) {
      await vi.advanceTimersByTimeAsync(900);
      stream.emit("streamEvent");
    }
    stream.finish("long answer");
    await expect(pending).resolves.toBe("long answer");
    expect(stream.abortCount).toBe(0);
  });

  it("cancels on the caller's signal with the abort error, not an idle timeout", async () => {
    const stream = new FakeStream<unknown>();
    const controller = new AbortController();
    const pending = awaitStreamWithIdleTimeout(stream, { idleTimeoutMs: 1000, signal: controller.signal });
    const assertion = expect(pending).rejects.toBeInstanceOf(APIUserAbortError);
    controller.abort();
    await assertion;
    expect(stream.abortCount).toBe(1);
  });

  it("does not start a call whose caller has already given up", async () => {
    const stream = new FakeStream<unknown>();
    const controller = new AbortController();
    controller.abort();
    await expect(awaitStreamWithIdleTimeout(stream, { idleTimeoutMs: 1000, signal: controller.signal })).rejects.toBeInstanceOf(
      APIUserAbortError,
    );
  });

  it("leaves no timer behind once the call is done", async () => {
    const stream = new FakeStream<string>();
    const pending = awaitStreamWithIdleTimeout(stream, { idleTimeoutMs: 1000 });
    stream.finish("done");
    await pending;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("tolerates a long pause before the first token, and still catches a stall far sooner than 10 minutes", () => {
    expect(ANTHROPIC_STREAM_IDLE_TIMEOUT_MS).toBeGreaterThanOrEqual(60_000);
    expect(ANTHROPIC_STREAM_IDLE_TIMEOUT_MS).toBeLessThanOrEqual(5 * 60_000);
  });
});

describe("llm abort scope", () => {
  it("is visible to every await inside the unit of work", async () => {
    const controller = new AbortController();
    const seen = await runWithLlmAbortSignal(controller.signal, async () => {
      await new Promise((r) => setTimeout(r, 1));
      return currentLlmAbortSignal();
    });
    expect(seen?.aborted).toBe(false);
    controller.abort();
    expect(seen?.aborted).toBe(true);
    expect(currentLlmAbortSignal()).toBeUndefined();
  });

  it("aborts a nested unit of work when the enclosing one is cancelled", async () => {
    const outer = new AbortController();
    const inner = new AbortController();
    const seen = await runWithLlmAbortSignal(outer.signal, () =>
      runWithLlmAbortSignal(inner.signal, async () => currentLlmAbortSignal()),
    );
    expect(seen?.aborted).toBe(false);
    outer.abort();
    expect(seen?.aborted).toBe(true);
  });
});

describe("completeWithFallback: stalls and cancellations", () => {
  const MESSAGES: LLMMessage[] = [{ role: "user", content: "hello" }];
  const result = (content: string): LLMCompletionResult => ({
    content,
    toolCalls: [],
    tokensUsed: { prompt: 1, completion: 1, total: 2 },
    costUsd: 0,
  });
  const provider = (name: string, complete: () => Promise<LLMCompletionResult>): LLMProvider => ({
    providerName: name,
    complete,
    embed: async () => ({ embeddings: [], tokensUsed: 0, costUsd: 0 }) as LLMEmbeddingResult,
    getInfo: () => ({ name, displayName: name, configured: true, models: [] }) as LLMProviderInfo,
  });

  it("treats a stalled stream like any other transient failure and falls back", async () => {
    const primary = provider("stall-primary", async () => {
      throw new StreamIdleTimeoutError(1000);
    });
    const fallback = provider("stall-fallback", async () => result("from-fallback"));
    await expect(completeWithFallback(MESSAGES, undefined, [primary, fallback])).resolves.toMatchObject({ content: "from-fallback" });
  });

  it("never hands a cancelled call to the fallback provider", async () => {
    const fallbackComplete = vi.fn(async () => result("should not run"));
    const primary = provider("abort-primary", async () => {
      throw new APIUserAbortError();
    });
    const fallback = provider("abort-fallback", fallbackComplete);
    await expect(completeWithFallback(MESSAGES, undefined, [primary, fallback])).rejects.toBeInstanceOf(APIUserAbortError);
    expect(fallbackComplete).not.toHaveBeenCalled();
  });
});
