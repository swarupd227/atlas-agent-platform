/**
 * Wire protocol for the relay tunnel: a single outbound WebSocket from a
 * relay agent (running inside a client's private network) to the
 * platform, multiplexing however many concurrent DB connections a
 * SqlConnector opens through it.
 *
 * Two message shapes on the same socket, distinguished by WS frame type:
 *  - TEXT  = control frames, JSON: {type, streamId, ...}
 *  - BINARY = data frames: first 36 bytes = streamId (a UUIDv4 string is
 *    always exactly 36 ASCII chars, so this needs no length prefix), the
 *    remainder is the raw TCP payload for that stream, unmodified.
 *
 * Binary framing (not JSON+base64) for data frames specifically because DB
 * wire protocols are binary and base64 costs ~33% size for no benefit here.
 */

const STREAM_ID_LEN = 36;

export type ControlFrame =
  | { type: "open"; streamId: string; targetHost: string; targetPort: number }
  | { type: "opened"; streamId: string }
  | { type: "close"; streamId: string }
  | { type: "error"; streamId: string; message: string };

export function encodeControlFrame(frame: ControlFrame): string {
  return JSON.stringify(frame);
}

export function decodeControlFrame(text: string): ControlFrame {
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || typeof parsed.type !== "string" || typeof parsed.streamId !== "string") {
    throw new Error("Malformed relay control frame");
  }
  return parsed as ControlFrame;
}

export function encodeDataFrame(streamId: string, payload: Buffer): Buffer {
  if (streamId.length !== STREAM_ID_LEN) throw new Error(`streamId must be exactly ${STREAM_ID_LEN} chars, got ${streamId.length}`);
  return Buffer.concat([Buffer.from(streamId, "ascii"), payload]);
}

export function decodeDataFrame(buf: Buffer): { streamId: string; payload: Buffer } {
  if (buf.length < STREAM_ID_LEN) throw new Error("Relay data frame shorter than the streamId prefix");
  return {
    streamId: buf.subarray(0, STREAM_ID_LEN).toString("ascii"),
    payload: buf.subarray(STREAM_ID_LEN),
  };
}
