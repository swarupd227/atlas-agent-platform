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
//
// 475 (was 483): tenant-isolation hardening guarded 20 mutating routes --
// agent-to-connector link/unlink, blueprint create/update/clone/compile, every
// enterprise-integration connect/edit/promote/disconnect/delete/test route and
// the in-app n8n call, and the mock-MCP register/seed-demo routes. NOTE: main
// had already drifted to 495 unguarded before that change (this test was red),
// so 12 routes added since 483 were never reviewed against this ratchet; they
// are still unguarded inside this number. The /api/admin/* routes are now
// guarded by a router-level checkPermission in tool-connectors.ts, which this
// per-route scanner can't see, so they are also still counted here.
//
// 466 (was 475): reviewed every mutating route that is unguarded now but was
// not an unguarded route at the 483 baseline (49c129c). Guarded 8:
// submit-for-review (create_modify_blueprints), golden run-golden and
// link-suites (create_modify_blueprints), and the 5 worker-task writes
// (manage_agents). Left unguarded on purpose, each with its own check:
// Slack/Teams webhooks (signature), A2A message and /api/v1 KB search (API
// key), PATCH /api/approvals/:id (reviewer routing, then approve_changes, in
// the handler), Workspace run/stream/resume (the consumption surface every
// role uses; runs are org-scoped and the agent's own gates apply; resume
// honours reviewer routing), deployments/:id/trigger (runs an active,
// org-scoped deployment, like a Workspace run), agent-files attach (org-scoped
// file into the caller's own conversation) and output-contracts
// check-strict-compat (computes an answer, changes nothing).
//
// 459 (was 466): outcome edits (PATCH, versions, regenerate-constraint-graph,
// sync-eval-feedback) and KPI create/update/delete need create_modify_outcomes.
//
// 455 (was 459): the outcome-authoring AI helpers (outcome-discover,
// enhance-outcome, generate-kpis, regulatory-constraints) need
// create_modify_outcomes. Every /api/ai/* POST is also rate-limited per user.
//
// 454 (was 455, briefly 456): the process-flow drafting helpers
// (process-flow/clarify, added unguarded in ac5ba87, and generate-process-flow)
// need create_modify_outcomes, like saving a process flow.
//
// 452 (was 454): proposing a team (/api/ai/propose-agents) needs
// create_modify_blueprints; Deploy & Run needs deploy_staging_pilot.
//
// 430 (was 452): every knowledge-base write (create/edit/delete, sources,
// embed, stats, staleness checks, tuning, agent link/unlink), skill-version
// PATCH and skill-chain create/edit/delete need create_modify_blueprints.
//
// 425 (was 430): policy test-case create/run, policy-exception create/update
// and compliance-report create need create_modify_policies.
//
// 412 (was 425): eval suite create, suite test-cases/runs, eval case results
// and the golden-dataset writes need create_modify_blueprints.
//
// 401 (was 412): every deployment write needs deploy_staging_pilot (raw PATCH,
// pipeline init/advance/evidence, promote, rollback, freeze, auto-promote,
// run-pipeline, start/stop runtime, execute-now), and reaching production
// additionally needs deploy_prod.
const BASELINE_UNGUARDED = 401;

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
