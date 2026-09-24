/**
 * A conversation whose live updates stop.
 *
 * The turn keeps running on the server when the stream drops (a proxy
 * timeout, a deploy mid-turn), but the client resynced once, saw it still
 * running, and told the person to reload — so a finished answer never
 * appeared and the conversation looked stuck. It now watches until the turn
 * settles. A turn whose process died is freed by the server after
 * STALE_RUNNING_MINUTES, and the watch gives up at about the same point.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { keepWatching, nextDelayMs, watchOutcome } from "../client/src/astra/watch-turn";

const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");

describe("how often to look", () => {
  it("checks soon, then backs off", () => {
    expect(nextDelayMs(0)).toBe(2_000);
    expect(nextDelayMs(3)).toBe(5_000);
    expect(nextDelayMs(50)).toBe(10_000);
  });
});

describe("when to stop looking", () => {
  it("watches while the turn is running", () => {
    expect(keepWatching("running", 10_000)).toBe(true);
    expect(keepWatching("idle", 10_000)).toBe(false);
    expect(keepWatching("awaiting_confirmation", 10_000)).toBe(false);
    expect(keepWatching("failed", 10_000)).toBe(false);
  });

  it("gives up once the server would have freed the conversation", () => {
    expect(keepWatching("running", 3 * 60_000)).toBe(true);
    expect(keepWatching("running", 5 * 60_000)).toBe(false);
  });
});

describe("what it says at the end", () => {
  it("shows the answer when the turn finished", () => {
    expect(watchOutcome("idle")).toEqual({ settled: true, message: null });
    expect(watchOutcome("awaiting_confirmation").settled).toBe(true);
  });

  it("says the turn errored, and that what it did is kept", () => {
    expect(watchOutcome("failed")).toMatchObject({ settled: true });
    expect(watchOutcome("failed").message).toContain("already done is saved");
  });

  it("says plainly when a turn was interrupted, without blaming the person", () => {
    const out = watchOutcome("running");
    expect(out.settled).toBe(false);
    expect(out.message).toContain("frees itself in a few minutes");
    expect(out.message).not.toMatch(/reload/i);
  });
});

describe("the client", () => {
  const api = read("client", "src", "astra", "api.ts");

  it("watches instead of asking for a reload", () => {
    expect(api).toContain("The live updates stopped. The work is still running on the server");
    expect(api).toContain("if (dropped) await watchUntilSettled(id, controller);");
    expect(api).not.toContain("reload the conversation to see it");
  });

  it("stops watching when the conversation is opened elsewhere", () => {
    const at = api.indexOf("const watchUntilSettled");
    expect(api.slice(at, at + 900)).toContain("if (controller.signal.aborted || abortRef.current !== controller) return;");
  });
});

describe("the server's own recovery", () => {
  it("frees a conversation minutes after its turn stopped heartbeating, not ten", () => {
    const store = read("server", "astra", "store.ts");
    expect(store).toContain("const STALE_RUNNING_MINUTES = 3;");
    // Safe only because a live turn touches the row while a long tool runs.
    expect(store).toContain("async touchTurn(");
    expect(read("server", "astra", "engine.ts")).toContain("const DEFAULT_KEEP_ALIVE_MS = 60_000;");
  });
});
