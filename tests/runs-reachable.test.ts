/**
 * A page nobody can navigate to has not shipped.
 *
 * `/runs` was added to the sidebar's nav list but to no role's allowedRoutes,
 * and isRouteAllowed matches allowedRoutes by prefix — so the entry was
 * filtered out for every role including admin, and the page was reachable only
 * by typing the URL. Confirmed live 2026-09-30: the sidebar showed /monitor and
 * no /runs. The same thing had already happened to /files, which carries a
 * comment in role-provider.tsx saying so; a comment did not stop it recurring,
 * so this is a test.
 *
 * The invariant is that the two lists agree: the client offers the page to
 * exactly the roles the server will serve it to. Either direction is a bug —
 * invisible to someone entitled to it, or offered to someone the API refuses.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { ROLES } from "../client/src/components/role-provider";
import { hasPermission, type RoleId } from "../server/permissions";

const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");

/** The client's own rule, copied from role-provider.tsx. */
const allows = (role: { allowedRoutes: string[] }, route: string) =>
  role.allowedRoutes.some((a) => (a === "/" ? route === "/" : route.startsWith(a)));

describe("the Runs page is reachable by exactly the roles that may read runs", () => {
  it("is offered to every role that may view agents", () => {
    const missing = ROLES.filter((r) => hasPermission(r.id as RoleId, "view_agents") && !allows(r, "/runs")).map((r) => r.id);
    expect(missing).toEqual([]);
  });

  it("is offered to no role that may not", () => {
    const wrongly = ROLES.filter((r) => !hasPermission(r.id as RoleId, "view_agents") && allows(r, "/runs")).map((r) => r.id);
    expect(wrongly).toEqual([]);
  });

  it("covers the detail view too, since the page selects a run in place", () => {
    const admin = ROLES.find((r) => r.id === "admin")!;
    expect(allows(admin, "/runs?run=abc")).toBe(true);
  });

  it("does not accidentally open a neighbouring route", () => {
    // "/runs" must not act as a prefix for anything else, and the routes that
    // merely look similar must keep needing their own entry.
    const finance = ROLES.find((r) => r.id === "finance");
    if (finance) {
      expect(allows(finance, "/runs")).toBe(false);
      expect(allows(finance, "/runtime/runs/abc")).toBe(false);
    }
    const admin = ROLES.find((r) => r.id === "admin")!;
    expect(admin.allowedRoutes).toContain("/runbook-automation");
    // Adding "/runs" must not have been what allows /runbook-automation.
    expect(allows({ allowedRoutes: ["/runs"] }, "/runbook-automation")).toBe(false);
  });
});

describe("the two run views reach each other", () => {
  // They are not duplicates and neither replaces the other: /dag-runs/:id is the
  // engine view (waves, approvals, cancel, re-run) and /runs explains what the
  // work amounted to, including which skips are defects rather than the graph
  // working as drawn. Measured 2026-10-03: /runs linked out to /dag-runs, and
  // the engine view's only back-link went to the blueprint or the teams list --
  // so a user arriving from a Cowork teamRun card, an approval, or gate evidence
  // could not reach the explanation of the run they were looking at.
  const runs = read("client", "src", "pages", "runs.tsx");
  const monitor = read("client", "src", "pages", "dag-run-monitor.tsx");

  it("the explain view offers the full run record", () => {
    expect(runs).toContain("`/dag-runs/${selected.id}`");
  });

  it("the run record offers the explanation", () => {
    expect(monitor).toContain("`/runs?run=${runId}`");
    expect(monitor).toContain('data-testid="link-explain-run"');
  });

  it("links to the run it is showing, not to the list", () => {
    // /runs with no ?run= selects a run by facet, so a bare link would silently
    // present somebody else's run under the one the user clicked.
    const idx = monitor.indexOf('data-testid="link-explain-run"');
    expect(idx).toBeGreaterThan(-1);
    expect(monitor.slice(Math.max(0, idx - 400), idx)).toContain("`/runs?run=${runId}`");
  });
});

describe("the nav entry and the API agree", () => {
  it("still lists Runs in the sidebar", () => {
    expect(read("client", "src", "components", "app-sidebar.tsx")).toContain('url: "/runs"');
  });

  it("guards every run route with the permission the nav list is keyed on", () => {
    const routes = read("server", "routes", "runs.ts");
    const handlers = routes.match(/router\.get\(/g) ?? [];
    const guarded = routes.match(/checkPermission\("view_agents"\)/g) ?? [];
    expect(handlers.length).toBeGreaterThan(0);
    expect(guarded.length).toBe(handlers.length);
  });
});
