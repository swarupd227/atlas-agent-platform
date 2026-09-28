/**
 * Does anything in this build actually serve a given path?
 *
 * Asked by the connector health checks. Roughly half the connector estate is
 * backed by routers this process serves itself — the simulated backends under
 * `/api/mock/` and the demonstration surfaces under `/demo-api` — and their
 * characteristic failure is that a connector row outlives the code that served
 * it: the row is listed, agents are bound to it, and every call 404s.
 *
 * Two ways to know were possible. One is to record each mount as it happens,
 * which means bookkeeping at sixty-odd call sites that a future mount can
 * silently skip. The other is to ask Express, which already knows exactly what
 * it mounted — so that is what this does, using the router layers' own matcher
 * functions rather than a parallel list that can drift.
 *
 * It fails SAFE: when the app has not been recorded, or Express's internals are
 * not the shape this expects, it answers `null` — "cannot determine" — and a
 * caller must never read that as "not mounted". Reporting a connector as dead
 * because an introspection detail changed would be exactly the kind of confident
 * wrong answer these checks exist to remove.
 */
import type { Express } from "express";

let appRef: Express | null = null;

/** Called once, after every route is mounted. */
export function recordApp(app: Express): void {
  appRef = app;
}

interface MatcherLayer {
  name?: string;
  matchers?: unknown;
}

function layerHandles(layer: MatcherLayer, pathname: string): boolean {
  const matchers = Array.isArray(layer.matchers) ? layer.matchers : [layer.matchers];
  for (const match of matchers) {
    if (typeof match !== "function") continue;
    try {
      if (match(pathname)) return true;
    } catch {
      // Not a matcher we understand; another layer may still answer.
    }
  }
  return false;
}

/**
 * True when a router in this build handles the path, false when nothing does,
 * null when the question cannot be answered. Only router layers are consulted:
 * app-level middleware matches everything and would make every path look served.
 */
export function isPathHandled(pathname: string): boolean | null {
  const app = appRef as any;
  const stack = app?.router?.stack ?? app?._router?.stack;
  if (!Array.isArray(stack) || stack.length === 0) return null;

  let sawUsableLayer = false;
  for (const layer of stack as MatcherLayer[]) {
    if (layer?.name !== "router") continue;
    const matchers = Array.isArray(layer.matchers) ? layer.matchers : [layer.matchers];
    if (!matchers.some((m) => typeof m === "function")) continue;
    sawUsableLayer = true;
    if (layerHandles(layer, pathname)) return true;
  }
  // No router layer was even inspectable: that is "we cannot tell", not "no".
  return sawUsableLayer ? false : null;
}

/** The path part of a URL, or null when it is not a URL at all. */
export function pathnameOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).pathname;
  } catch {
    return null;
  }
}
