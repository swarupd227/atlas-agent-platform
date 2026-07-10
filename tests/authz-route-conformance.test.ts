/**
 * Route authz conformance — a ratchet, not a gate.
 *
 * The production security re-review found that only ~19% of mutating routes
 * (POST/PATCH/PUT/DELETE) carry a checkPermission(...) middleware; the rest
 * default-allow. Guarding all ~500+ of them is a multi-week rollout, not a
 * single pass, so this test does NOT fail on the existing backlog. Instead it
 * statically counts guarded vs unguarded mutating routes across server/routes
 * and asserts the unguarded count never goes UP — every future PR must guard
 * at least as many routes as it adds unguarded ones. Bump BASELINE_UNGUARDED
 * down (never up) as routes get hardened; a bump up should be a rare,
 * deliberate, reviewed exception, not a silent regression.
 *
 * This is static analysis (regex over source), not a runtime route
 * introspection — it never boots the app or touches a DB, so it's fast and
 * deterministic in CI. It will over- or under-count in genuinely unusual call
 * shapes; that's an acceptable tradeoff for a zero-dependency ratchet.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..");

const ROUTE_FILES = [
  ...readdirSync(join(ROOT, "server", "routes"))
    .filter(f => f.endsWith(".ts"))
    .map(f => join("server", "routes", f)),
  join("server", "demo-routes.ts"),
  join("server", "kb-routes.ts"),
  join("server", "routes.ts"),
].filter(rel => existsSync(join(ROOT, rel)));

const VERB_RE = /\b(?:router|app)\.(post|patch|put|delete)\(\s*(["'`])([^"'`]+)\2\s*,/g;

interface RouteEntry {
  verb: string;
  path: string;
  file: string;
  guarded: boolean;
}

function scanRoutes(): RouteEntry[] {
  const entries: RouteEntry[] = [];
  for (const rel of ROUTE_FILES) {
    const src = readFileSync(join(ROOT, rel), "utf8");
    let m: RegExpExecArray | null;
    VERB_RE.lastIndex = 0;
    while ((m = VERB_RE.exec(src))) {
      const [full, verb, , routePath] = m;
      const afterPathIdx = m.index + full.length;
      const rest = src.slice(afterPathIdx, afterPathIdx + 400);
      const handlerStart = rest.search(/async\s*\(|\(\s*req\s*[,)]|function\s*\(/);
      const argsSpan = handlerStart >= 0 ? rest.slice(0, handlerStart) : rest.slice(0, 200);
      entries.push({
        verb: verb.toUpperCase(),
        path: routePath,
        file: rel,
        guarded: /checkPermission\s*\(/.test(argsSpan),
      });
    }
  }
  return entries;
}

// Ratchet ceiling — lower this as routes get guarded. Never raise it without
// a deliberate, reviewed decision (this backlog is a known, tracked risk, not
// an accepted permanent state).
//
// 483 (was 482): POST /api/workspace/teams/messages — a Bot Framework
// webhook endpoint, gated by verifyTeamsAuth (JWT/JWKS signature
// verification), not checkPermission. Webhook endpoints authenticate the
// calling *service*, not an internal user role, so they're intentionally
// outside this scanner's checkPermission pattern — same as the pre-existing
// Slack webhook routes already counted in this baseline.
const BASELINE_UNGUARDED = 483;

describe("mutating-route authz conformance", () => {
  it("does not add new unguarded mutating routes beyond the tracked baseline", () => {
    const routes = scanRoutes();
    const unguarded = routes.filter(r => !r.guarded);
    const guarded = routes.filter(r => r.guarded);

    // eslint-disable-next-line no-console
    console.log(
      `[authz-conformance] ${guarded.length}/${routes.length} mutating routes guarded ` +
      `(${unguarded.length} unguarded, baseline ${BASELINE_UNGUARDED})`,
    );

    expect(
      unguarded.length,
      unguarded.length > BASELINE_UNGUARDED
        ? `Unguarded mutating-route count rose from baseline ${BASELINE_UNGUARDED} to ${unguarded.length}. ` +
          `Add checkPermission(...) to new mutating routes, or — if this is a deliberate, ` +
          `reviewed exception — lower BASELINE_UNGUARDED's justification in this file.`
        : undefined,
    ).toBeLessThanOrEqual(BASELINE_UNGUARDED);
  });

  it("guards the previously-flagged mass-assignment route: PATCH /api/agents/:id", () => {
    const routes = scanRoutes();
    const route = routes.find(r => r.verb === "PATCH" && r.path === "/api/agents/:id");
    expect(route).toBeDefined();
    expect(route!.guarded).toBe(true);
  });
});
