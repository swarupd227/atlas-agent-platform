import { describe, it, expect } from "vitest";
import { encodeControlFrame, decodeControlFrame, encodeDataFrame, decodeDataFrame } from "../server/relay/protocol";

const STREAM_ID = "a1b2c3d4-0000-4000-8000-0123456789ab"; // 36 chars

describe("relay control frames", () => {
  it("round-trips an open frame", () => {
    const wire = encodeControlFrame({ type: "open", streamId: STREAM_ID, targetHost: "10.0.1.5", targetPort: 5432 });
    expect(decodeControlFrame(wire)).toEqual({ type: "open", streamId: STREAM_ID, targetHost: "10.0.1.5", targetPort: 5432 });
  });

  it("round-trips an error frame", () => {
    const wire = encodeControlFrame({ type: "error", streamId: STREAM_ID, message: "ECONNREFUSED" });
    expect(decodeControlFrame(wire)).toEqual({ type: "error", streamId: STREAM_ID, message: "ECONNREFUSED" });
  });

  it("rejects non-JSON", () => {
    expect(() => decodeControlFrame("not json")).toThrow();
  });

  it("rejects JSON missing a streamId", () => {
    expect(() => decodeControlFrame(JSON.stringify({ type: "open" }))).toThrow(/malformed/i);
  });
});

describe("relay data frames", () => {
  it("round-trips a binary payload with the streamId prefix", () => {
    const payload = Buffer.from([0x01, 0x02, 0xff, 0x00, 0x10]);
    const wire = encodeDataFrame(STREAM_ID, payload);
    const decoded = decodeDataFrame(wire);
    expect(decoded.streamId).toBe(STREAM_ID);
    expect(decoded.payload).toEqual(payload);
  });

  it("round-trips an empty payload", () => {
    const wire = encodeDataFrame(STREAM_ID, Buffer.alloc(0));
    const decoded = decodeDataFrame(wire);
    expect(decoded.streamId).toBe(STREAM_ID);
    expect(decoded.payload.length).toBe(0);
  });

  it("rejects a streamId of the wrong length", () => {
    expect(() => encodeDataFrame("too-short", Buffer.alloc(1))).toThrow(/36 chars/);
  });

  it("rejects a buffer shorter than the streamId prefix on decode", () => {
    expect(() => decodeDataFrame(Buffer.from("short"))).toThrow(/shorter than/i);
  });
});
