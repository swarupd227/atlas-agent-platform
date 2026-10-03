/**
 * A request under /api or /demo-api that no route claimed is a 404.
 *
 * Without this it was a 200. The SPA catch-all (server/static.ts in production,
 * server/vite.ts in development) answers "/{*path}" with index.html, and it is
 * mounted after every API route -- so a mistyped, renamed or deleted endpoint
 * came back as a successful HTML response. To any caller that checks res.ok and
 * not the body, that is indistinguishable from a call that worked: the failure
 * surfaces later, as an unexpected shape or an empty render, somewhere other
 * than the line that asked for the wrong thing.
 *
 * The body shape is { message }, which is what the client's throwIfResNotOk
 * reads and what the demo-gate 404 in server/index.ts already returns, so the
 * error arrives as a sentence instead of "Unexpected token '<'".
 */
import type { Request, Response } from "express";

export function apiNotFound(req: Request, res: Response) {
  // The path only, never the query string: a 404 body is read in logs and
  // toasts, and a search term or an id has no business in either.
  const path = req.originalUrl.split("?")[0];
  res.status(404).json({ message: `No API endpoint for ${req.method} ${path}` });
}
