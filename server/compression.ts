/**
 * Compress responses, but never a stream.
 *
 * Nothing was compressed before: the approvals list went out as 3.3 MB of
 * JSON and took 47s to reach the browser, and every page paid the same way.
 * JSON compresses to a small fraction of that.
 *
 * Live streams are left alone. Compression buffers output until it has enough
 * to compress, so an event stream (Astra's turns, team-run events, the demo
 * live runs) would arrive in lumps or not until the end.
 */
import compression from "compression";
import type { Request, Response } from "express";

/** Whether a response may be compressed: anything compressible except a stream. */
export function shouldCompress(req: Pick<Request, "headers">, res: Pick<Response, "getHeader">): boolean {
  const accept = String(req.headers.accept ?? "");
  if (accept.includes("text/event-stream")) return false;
  const type = String(res.getHeader("Content-Type") ?? "");
  if (/text\/event-stream|ndjson|stream\+json/.test(type)) return false;
  return compression.filter(req as Request, res as Response);
}

export const compressResponses = compression({ filter: shouldCompress, threshold: 1024 });
