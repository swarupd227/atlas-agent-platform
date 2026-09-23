/**
 * An SSE writer with a heartbeat, so Azure's idle timeout doesn't cut a long turn.
 *
 * Azure App Service closes a connection that has gone quiet for about 230
 * seconds. A route that streams progress around a single long model call is
 * silent for exactly that stretch, so without the heartbeat the browser sees
 * the connection reset and neither the result nor the route's own error
 * message ever arrives -- the failure looks like a bug in the work rather than
 * a closed socket. Live 2026-09-23: drafting a team from a 22-step process
 * flow died at ~249s with ERR_CONNECTION_RESET, about 233s after its last
 * event, however much abort budget the route was given.
 *
 * Compression leaves event streams alone (server/compression.ts), so the
 * heartbeat is written out rather than buffered.
 */
import type { Response } from "express";

const HEARTBEAT_MS = 15_000;

/** Opens the stream and returns the writer for it. */
export function openSse<TEvent>(res: Response): (event: TEvent) => void {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  // A proxy that buffers the response would hold the heartbeat back with it.
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const heartbeat = setInterval(() => {
    try { res.write(":hb\n\n"); } catch { /* client gone */ }
  }, HEARTBEAT_MS);
  const stopHeartbeat = () => clearInterval(heartbeat);
  res.on("close", stopHeartbeat);
  res.on("finish", stopHeartbeat);

  return (event: TEvent) => {
    try { res.write(`data: ${JSON.stringify(event)}\n\n`); } catch { /* client gone; the work still completes */ }
  };
}
