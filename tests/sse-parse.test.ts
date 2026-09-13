/**
 * The client's SSE parser (client/src/lib/sse.ts): chunk boundaries anywhere,
 * CRLF, heartbeats, multi-line data and malformed events.
 */
import { describe, it, expect } from "vitest";
import { createSseParser } from "../client/src/lib/sse";

function collect(chunks: string[], end = true) {
  const events: unknown[] = [];
  const invalid: string[] = [];
  const parser = createSseParser((e) => events.push(e), (raw) => invalid.push(raw));
  for (const c of chunks) parser.push(c);
  if (end) parser.end();
  return { events, invalid };
}

const STREAM = 'data: {"type":"turn_started","threadId":"t1"}\n\n:hb\n\ndata: {"type":"working","label":"Thinking"}\n\ndata: {"type":"done","status":"idle"}\n\n';

describe("createSseParser", () => {
  it("parses events and ignores heartbeat comments", () => {
    expect(collect([STREAM]).events).toEqual([
      { type: "turn_started", threadId: "t1" },
      { type: "working", label: "Thinking" },
      { type: "done", status: "idle" },
    ]);
  });

  it("gives the same events however the stream is split, down to one character at a time", () => {
    const expected = collect([STREAM]).events;
    expect(collect(STREAM.split("")).events).toEqual(expected);
    for (let cut = 1; cut < STREAM.length; cut += 7) {
      expect(collect([STREAM.slice(0, cut), STREAM.slice(cut)]).events).toEqual(expected);
    }
  });

  it("accepts CRLF line endings, including a CRLF split across chunks", () => {
    const crlf = STREAM.replace(/\n/g, "\r\n");
    expect(collect([crlf]).events).toHaveLength(3);
    const at = crlf.indexOf("\r\n");
    expect(collect([crlf.slice(0, at + 1), crlf.slice(at + 1)]).events).toHaveLength(3);
  });

  it("joins multi-line data and tolerates a missing space after the colon", () => {
    expect(collect(['data:{"a":\n', 'data: 1}\n\n']).events).toEqual([{ a: 1 }]);
  });

  it("does not emit an event until its blank line arrives, unless the stream ends", () => {
    expect(collect(['data: {"x":1}\n'], false).events).toEqual([]);
    expect(collect(['data: {"x":1}']).events).toEqual([{ x: 1 }]);
  });

  it("reports malformed JSON without stopping later events", () => {
    const { events, invalid } = collect(["data: {not json\n\n", 'data: {"ok":true}\n\n']);
    expect(invalid).toEqual(["{not json"]);
    expect(events).toEqual([{ ok: true }]);
  });

  it("ignores other SSE fields", () => {
    expect(collect(['event: message\nid: 7\nretry: 100\ndata: {"y":2}\n\n']).events).toEqual([{ y: 2 }]);
  });
});
