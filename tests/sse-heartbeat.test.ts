import { describe, it, expect, vi, afterEach } from "vitest";
import { openSse } from "../server/sse";

/**
 * The heartbeat exists for one reason: Azure closes a connection that has been
 * quiet for ~230s, and a route streaming progress around a single long model
 * call is quiet for exactly that stretch. These tests hold that property.
 */
function mockRes() {
  const writes: string[] = [];
  const headers: Record<string, string> = {};
  const handlers: Record<string, Array<() => void>> = {};
  return {
    writes,
    headers,
    setHeader: (k: string, v: string) => { headers[k] = v; },
    flushHeaders: () => {},
    write: (chunk: string) => { writes.push(chunk); return true; },
    on: (ev: string, fn: () => void) => { (handlers[ev] ||= []).push(fn); },
    emit: (ev: string) => (handlers[ev] || []).forEach((fn) => fn()),
  } as any;
}

describe("SSE heartbeat", () => {
  afterEach(() => vi.useRealTimers());

  it("keeps a silent stream alive, and stops once the client is gone", () => {
    vi.useFakeTimers();
    const res = mockRes();
    const send = openSse<{ type: string }>(res);

    expect(res.headers["Content-Type"]).toBe("text/event-stream");
    // A proxy that buffers the response would hold the heartbeat back with it.
    expect(res.headers["X-Accel-Buffering"]).toBe("no");

    // Three quarters of a minute of silence, well inside Azure's window.
    vi.advanceTimersByTime(46_000);
    expect(res.writes.filter((w: string) => w === ":hb\n\n")).toHaveLength(3);

    send({ type: "done" });
    expect(res.writes.at(-1)).toBe('data: {"type":"done"}\n\n');

    res.emit("close");
    vi.advanceTimersByTime(60_000);
    expect(res.writes.filter((w: string) => w === ":hb\n\n")).toHaveLength(3);
  });

  it("does not throw when the client has already gone", () => {
    vi.useFakeTimers();
    const res = mockRes();
    res.write = () => { throw new Error("EPIPE"); };
    const send = openSse(res);

    expect(() => vi.advanceTimersByTime(20_000)).not.toThrow();
    expect(() => send({ type: "done" })).not.toThrow();
  });
});
