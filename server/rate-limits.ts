/**
 * Rate limiters — bound the two abuse surfaces that matter most:
 *   1. Auth endpoints (login/register) — credential stuffing / brute force.
 *   2. LLM-invoking endpoints (runtime/run, workspace runs, run-test,
 *      playground) — a caller can otherwise burn real API spend in a tight
 *      loop with no cost to themselves.
 *
 * Deliberately NOT applied blanket across all 500+ routes in this pass —
 * scope matches the production re-review's specific call-out. Limits are
 * generous enough not to trip during normal E2E test runs (which fire a
 * modest, non-bursty number of requests per suite) while still bounding a
 * genuine abuse loop.
 */
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import type { Request, Response, NextFunction } from "express";

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

const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many authentication attempts. Try again in a few minutes." },
});
export const authRateLimiter = asMiddleware(authLimiter);

const llmInvokeLimiter = rateLimit({
  windowMs: 10 * 60_000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many agent-run requests from this client. Try again shortly." },
  // Demo mode has no per-user session — key on IP + the demo role header so
  // one noisy role doesn't starve the rate budget for another in the same demo.
  // ipKeyGenerator normalizes IPv6 addresses to a /56 subnet so a single
  // client can't rotate suffixes to dodge the limit (and satisfies the
  // library's own validation against raw req.ip use).
  keyGenerator: (req) => `${ipKeyGenerator(req.ip || "")}:${(req.headers["x-role"] as string) || "anon"}`,
});
export const llmInvokeRateLimiter = asMiddleware(llmInvokeLimiter);
