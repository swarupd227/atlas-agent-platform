/**
 * OpenAI completions carry the DAG node's abort signal, have the SDK's hidden
 * retries off (withRetry is the one retry loop), and a timeout sized to the
 * output they may write -- a stalled request is cut and retried, not left to
 * hang past the node's own timeout.
 */
import { describe, it, expect } from "vitest";
import { openaiRequestOptions, OPENAI_MIN_REQUEST_TIMEOUT_MS } from "../server/llm-provider";
import { runWithLlmAbortSignal } from "../server/llm-abort-context";

describe("openaiRequestOptions", () => {
  it("turns off SDK retries and uses the minimum timeout for ordinary outputs", () => {
    const o = openaiRequestOptions(4096);
    expect(o.maxRetries).toBe(0);
    expect(o.timeout).toBe(OPENAI_MIN_REQUEST_TIMEOUT_MS);
    expect(o.signal).toBeUndefined();
  });

  it("gives long outputs a longer ceiling", () => {
    expect(openaiRequestOptions(16000).timeout).toBeGreaterThan(OPENAI_MIN_REQUEST_TIMEOUT_MS);
  });

  it("carries the abort signal of the unit of work it runs in", async () => {
    const controller = new AbortController();
    const seen = await runWithLlmAbortSignal(controller.signal, async () => openaiRequestOptions().signal);
    controller.abort();
    expect(seen?.aborted).toBe(true);
  });
});
