/**
 * Rate limiters — bound the abuse surfaces that matter most:
 *   1. Auth endpoints (login/register) — credential stuffing / brute force.
 *   2. LLM-invoking endpoints (runtime/run, workspace runs, run-test,
 *      playground) — a caller can otherwise burn real API spend in a tight
 *      loop with no cost to themselves.
 *   3. The real-MCP-protocol tool-call route (server/real-mcp-transport.ts)
 *      — an externally-reachable endpoint that can run real queries against
 *      a live customer database; the abuse surface is DB load, not $ spend,
 *      so it's keyed by the authenticated agent/key id rather than IP.
 *
 * Deliberately NOT applied blanket across all 500+ routes in this pass —
 * scope matches the production re-review's specific call-out. Limits are
 * generous enough not to trip during normal E2E test runs (which fire a
 * modest, non-bursty number of requests per suite) while still bounding a
 * genuine abuse loop.
 *
 * What each is counted against matters as much as the limit:
 *   - never a header the caller sets (a limit keyed on one is dodged by changing it on every request);
 *   - an address only through clientAddress() (server/client-address.ts), because behind a proxy every client has the proxy's
 *     address unless ASTRA_TRUST_PROXY says how many proxies there are;
 *   - sign-in per (address, user name), so guessing one person's password cannot lock everybody else out, with a higher cap
 *     per address against trying many names.
 */
import rateLimit from "express-rate-limit";
import type { Request, Response, NextFunction } from "express";
import { getSecurityMode } from "./auth";
import { clientAddress } from "./client-address";

// express-rate-limit's rateLimit() returns RequestHandler & {extra methods},
// an intersection type that (unlike a plain arrow middleware such as
// checkPermission's return type) perturbs TypeScript's overload resolution
// when passed inline as router.post(path, limiter, handler) — the specific
// route's `req.params` loses its narrowed typing. Wrapping in a plain
// (req, res, next) => void delegate matches the shape every other middleware
// in this codebase already uses and avoids the ripple entirely.
function asMiddleware(limiter: ReturnType<typeof rateLimit>) {
  return (req: Request, res: Response, next: NextFunction) => limiter(req, res, next);
}

/** The signed-in caller as a counting key, or null when there is none (demo mode, or a route that runs before sign-in). */
function callerKey(req: Request): string | null {
  const who = req.authUser;
  if (!who) return null;
  // An API key counts as the agent it belongs to, so minting more keys for one agent buys no extra budget.
  if (who.apiKeyAgentId) return `agent:${who.apiKeyAgentId}`;
  return who.userId ? `user:${who.userId}` : null;
}

/**
 * Agent runs and AI assist: the signed-in caller; failing that, the address. Demo mode has no signed-in user, so there the demo
 * role header also splits the budget (one noisy role must not starve another in the same demo); outside demo mode that header is
 * the caller's to set and is never part of a key.
 */
export function spendKey(req: Request): string {
  const caller = callerKey(req);
  if (caller) return caller;
  const address = clientAddress(req);
  return getSecurityMode() === "demo" ? `${address}:${(req.headers["x-role"] as string) || "anon"}` : address;
}

// Sign-in: a user name is the same user whatever its case or spacing.
const signInName = (req: Request): string => {
  const raw = (req.body as { username?: unknown } | undefined)?.username;
  return (typeof raw === "string" ? raw : "").trim().toLowerCase().slice(0, 100);
};

const authPerUserLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many authentication attempts. Try again in a few minutes." },
  keyGenerator: (req) => `${clientAddress(req)}|${signInName(req)}`,
});
// Trying many different names from one address: not the same budget as guessing one person's password, but not unlimited either.
const authPerAddressLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many authentication attempts. Try again in a few minutes." },
  keyGenerator: (req) => clientAddress(req),
});
export const authRateLimiter = (req: Request, res: Response, next: NextFunction) =>
  authPerUserLimiter(req, res, (err?: unknown) => (err ? next(err) : authPerAddressLimiter(req, res, next)));

const llmInvokeLimiter = rateLimit({
  windowMs: 10 * 60_000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many agent-run requests from this client. Try again shortly." },
  keyGenerator: spendKey,
});
export const llmInvokeRateLimiter = asMiddleware(llmInvokeLimiter);

// Every /api/ai/* assist call (outcome discovery, KPI and policy drafting, …)
// is an LLM call too. Separate budget from agent runs, keyed by the signed-in
// user where there is one so a whole office behind one address doesn't share
// it. GETs are job polls (a long transcription polls for minutes), not calls.
const aiAssistLimiter = rateLimit({
  windowMs: 10 * 60_000,
  limit: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many AI assist requests. Try again shortly." },
  skip: (req) => req.method === "GET",
  keyGenerator: spendKey,
});
export const aiAssistRateLimiter = asMiddleware(aiAssistLimiter);

/** MCP tool calls: the agent behind the key, else the cleaned address. */
export const mcpToolCallKey = (req: Request): string => (req as any).authUser?.apiKeyAgentId || clientAddress(req);

const mcpToolCallLimiter = rateLimit({
  windowMs: 5 * 60_000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many MCP tool calls from this agent. Try again shortly." },
  // Keyed by the authenticated agent/key id (set by authMiddleware's bearer
  // branch before this runs), not IP -- callers can share IPs/proxies, and
  // the thing being protected is DB load per agent, not a per-network budget.
  // Falls back to the address only in the case this ever ran before auth (shouldn't
  // happen given mount order, but avoids a keyGenerator crash if it did).
  keyGenerator: mcpToolCallKey,
});
export const mcpToolCallRateLimiter = asMiddleware(mcpToolCallLimiter);
