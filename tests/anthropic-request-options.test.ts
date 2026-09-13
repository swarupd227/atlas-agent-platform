/**
 * Anthropic calls that sit inside withRetry must not also be retried by the
 * SDK. Stacked, the SDK's silent retries (default 2, each with a 10-minute
 * timeout) let a single hung request run for ~30 minutes behind what the logs
 * show as one attempt -- and keep going after the DAG node that made it had
 * already given up.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { ANTHROPIC_REQUEST_TIMEOUT_MS, anthropicRequestOptions } from "../server/anthropic-request-options";

describe("anthropicRequestOptions", () => {
  it("turns off the SDK's own retries so withRetry is the only retry loop", () => {
    expect(anthropicRequestOptions().maxRetries).toBe(0);
  });

  it("sets the timeout explicitly, and not below what a healthy long generation needs", () => {
    const { timeout } = anthropicRequestOptions();
    expect(timeout).toBe(ANTHROPIC_REQUEST_TIMEOUT_MS);
    // ~44 tokens/s measured: a 21k-token non-streaming answer needs ~8 minutes.
    expect(timeout).toBeGreaterThanOrEqual(8 * 60 * 1000);
    // The SDK refuses non-streaming requests expected to exceed 10 minutes.
    expect(timeout).toBeLessThanOrEqual(10 * 60 * 1000);
  });

  it("keeps the beta header the call sites used to pass", () => {
    expect(anthropicRequestOptions(["files-api-2025-04-14", "code-execution-2025-08-25"]).headers).toEqual({
      "anthropic-beta": "files-api-2025-04-14,code-execution-2025-08-25",
    });
    expect(anthropicRequestOptions([]).headers).toBeUndefined();
    expect(anthropicRequestOptions(undefined).headers).toBeUndefined();
  });
});

describe("llm-provider applies it to every retried Anthropic call", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "server", "llm-provider.ts"), "utf8");

  it("passes the options to both messages.create and messages.stream", () => {
    expect(source.match(/anthropicRequestOptions\(options\?\.anthropicBetas\)/g) ?? []).toHaveLength(2);
  });

  it("has no call left building its own header-only options, which would bring the SDK's retries back", () => {
    expect(source).not.toContain('options?.anthropicBetas?.length ? { headers:');
  });
});
