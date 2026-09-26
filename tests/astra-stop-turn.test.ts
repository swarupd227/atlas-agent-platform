/**
 * Stopping a running turn.
 *
 * Cowork had no Stop: the composer disabled itself while a turn streamed, and
 * the only abort was the browser's on navigation — which drops the stream and
 * leaves the turn running on the server, spending and possibly calling tools.
 *
 * Stopping is cooperative. The engine checks between model calls and between
 * tool calls, never inside one: a tool that has started finishes and records
 * its result, because a half-written record is worse than a slow stop. The
 * turn then ends like any other — idle, with a message saying what happened —
 * rather than failed or stuck running.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import { readFileSync } from "fs";
import { join } from "path";
import { runTurn, type EngineDeps } from "../server/astra/engine";
import { ToolRegistry } from "../server/astra/registry";
import { MemoryThreadStore } from "../server/astra/memory-store";
import { scriptedComplete, result, call } from "../server/astra/scripted-brain";
import { finishTurnTool } from "../server/astra/tools/finish-turn";
import { hasPermission } from "../server/permissions";
import { isStopRequested, requestStop, resetStops, stoppedMessage, STOP_REQUEST_TTL_MS } from "../server/astra/stop-turn";
import type { AstraContext, AstraTool } from "../server/astra/types";

const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");
const routes = read("server", "routes", "astra.ts");
const thread = read("client", "src", "astra", "thread.tsx");
const api = read("client", "src", "astra", "api.ts");

const ORG = "org-a";
const ctx: AstraContext = { orgId: ORG, userId: "user-1", role: "admin" };

beforeEach(() => resetStops());

describe("the request", () => {
  it("is remembered, and cleared when it is honoured", () => {
    requestStop("t1");
    expect(isStopRequested("t1")).toBe(true);
    expect(isStopRequested("t2")).toBe(false);
  });

  it("goes stale rather than killing a turn started much later", () => {
    const at = 1_000_000;
    requestStop("t1", at);
    expect(isStopRequested("t1", at + STOP_REQUEST_TTL_MS - 1)).toBe(true);
    expect(isStopRequested("t1", at + STOP_REQUEST_TTL_MS + 1)).toBe(false);
    // Dropped, not just reported false.
    expect(isStopRequested("t1", at)).toBe(false);
  });

  it("says what stopping did and didn't undo", () => {
    expect(stoppedMessage(true)).toContain("What had already run stays done");
    expect(stoppedMessage(false)).toContain("before anything ran");
  });
});

/** A tool that records whether it ran, so a stop can be proven to spare it. */
function countingTool(name: string, ran: string[]): AstraTool<{}> {
  return {
    name,
    description: name,
    input: z.object({}),
    confirm: false,
    run: async () => {
      ran.push(name);
      return { payload: { ok: true } };
    },
  } as AstraTool<{}>;
}

function setup(steps: Parameters<typeof scriptedComplete>[0], tools: AstraTool[], stopWhen: () => boolean) {
  const store = new MemoryThreadStore();
  const threadId = store.createThread(ORG);
  const deps: EngineDeps = {
    store,
    registry: new ToolRegistry([finishTurnTool, ...tools], hasPermission),
    complete: scriptedComplete(steps),
    can: hasPermission,
    audit: vi.fn(async () => {}),
    services: {} as any,
    model: "test",
    stopRequested: stopWhen,
  };
  return { store, threadId, deps, onEvent: () => {} };
}

const done = (text: string) => result(text, [call("finish_turn", { suggestions: [] })]);

describe("a stopped turn", () => {
  it("ends idle, with a message, rather than failed or stuck running", async () => {
    const t = setup([done("All finished")], [], () => true);
    const status = await runTurn(t.deps, ctx, t.threadId, "Do the thing", t.onEvent);
    expect(status).toBe("idle");
    const last = t.store.threadMessages(t.threadId).at(-1)!;
    expect(last.role).toBe("astra");
    expect(last.markdown).toContain("Stopped at your request");
  });

  it("stops before calling the model at all when asked straight away", async () => {
    const complete = vi.fn();
    const t = setup([done("never reached")], [], () => true);
    t.deps.complete = complete as any;
    await runTurn(t.deps, ctx, t.threadId, "Do the thing", t.onEvent);
    expect(complete).not.toHaveBeenCalled();
  });

  it("lets a tool that already started finish, and skips the ones after it", async () => {
    const ran: string[] = [];
    let stop = false;
    const t = setup(
      [{ toolCalls: [{ name: "first", arguments: {} }, { name: "second", arguments: {} }] }, done("Done")],
      [countingTool("first", ran), countingTool("second", ran)],
      () => stop,
    );
    // Asked to stop while the first tool is running.
    const firstTool = t.deps.registry.get("first")!;
    const originalRun = firstTool.run;
    (firstTool as any).run = async (...args: any[]) => {
      stop = true;
      return (originalRun as any)(...args);
    };

    await runTurn(t.deps, ctx, t.threadId, "Do both", t.onEvent);
    // The one in flight completed; the next never started.
    expect(ran).toEqual(["first"]);
  });

  it("keeps what the turn had already said, above the stop notice", async () => {
    let stop = false;
    const ranNoop: string[] = [];
    const t = setup(
      // A script step is {reply, toolCalls}, not a completion object: passing
      // the latter silently drops the text before the engine ever sees it.
      [{ reply: "Here is what I found so far", toolCalls: [{ name: "noop", arguments: {} }] }, done("never reached")],
      [countingTool("noop", ranNoop)],
      () => stop,
    );
    const noop = t.deps.registry.get("noop")!;
    const original = noop.run;
    (noop as any).run = async (...args: any[]) => { stop = true; return (original as any)(...args); };

    await runTurn(t.deps, ctx, t.threadId, "Find things", t.onEvent);
    const last = t.store.threadMessages(t.threadId).at(-1)!;
    expect(last.markdown).toContain("Here is what I found so far");
    expect(last.markdown).toContain("Stopped at your request");
  });

  it("doesn't carry a stale request into the next turn", async () => {
    const t = setup([done("First"), done("Second")], [], () => isStopRequested(t.threadId));
    requestStop(t.threadId);
    await runTurn(t.deps, ctx, t.threadId, "One", t.onEvent);
    // runTurn clears a request left over from before it started.
    const status = await runTurn(t.deps, ctx, t.threadId, "Two", t.onEvent);
    expect(status).toBe("idle");
    expect(t.store.threadMessages(t.threadId).at(-1)!.markdown).not.toContain("Stopped at your request");
  });
});

describe("the route and the button", () => {
  it("refuses when nothing is running, rather than pretending", () => {
    expect(routes).toContain('router.post("/api/astra/threads/:id/stop", checkPermission("use_astra")');
    expect(routes).toContain('if (found.thread.status !== "running")');
    expect(routes).toContain("Nothing is running in this conversation.");
  });

  it("is a button next to what the turn is doing", () => {
    expect(thread).toContain('data-testid="astra-stop"');
    expect(thread).toContain('{stopping ? "Stopping…" : "Stop"}');
  });

  it("asks the server rather than dropping the stream", () => {
    // Aborting the stream client-side would leave the turn running and spending.
    expect(api).toContain("`/api/astra/threads/${threadId}/stop`");
    const at = api.indexOf("const stop = useCallback");
    expect(api.slice(at, at + 400)).not.toContain("abort()");
  });
});
