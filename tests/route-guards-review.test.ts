/**
 * Guards added when reviewing the mutating routes that had drifted past the
 * authz ratchet, and the Workspace resume rules: a run from another
 * organization doesn't exist for the caller, and an approval routed to a
 * reviewer role is decided by that role (or admin) only.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { canDecideApproval } from "../server/permissions";

const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");

describe("guarded routes", () => {
  it.each([
    ["server/routes/evaluations.ts", 'router.post("/api/blueprints/:id/submit-for-review", checkPermission("create_modify_blueprints")'],
    ["server/routes/golden-eval.ts", 'router.post("/api/evals/:suiteId/run-golden", checkPermission("create_modify_blueprints")'],
    ["server/routes/golden-eval.ts", 'router.post("/api/golden-datasets/link-suites", checkPermission("create_modify_blueprints")'],
    ["server/routes/worker-tasks.ts", 'router.post("/api/worker-tasks", checkPermission("manage_agents")'],
    ["server/routes/worker-tasks.ts", 'router.post("/api/worker-tasks/poll", checkPermission("manage_agents")'],
    ["server/routes/worker-tasks.ts", 'router.post("/api/worker-tasks/:id/complete", checkPermission("manage_agents")'],
    ["server/routes/worker-tasks.ts", 'router.post("/api/worker-tasks/:id/fail", checkPermission("manage_agents")'],
    ["server/routes/worker-tasks.ts", 'router.delete("/api/worker-tasks/:id", checkPermission("manage_agents")'],
  ])("%s: %s", (file, line) => {
    expect(read(file)).toContain(line);
  });

  it("stores a new worker task under the caller's organization", () => {
    expect(read("server/routes/worker-tasks.ts")).toContain("organizationId: getOrgId(req) ?? null,");
  });
});

describe("Workspace resume", () => {
  const src = read("server/workspace-run.ts");
  const fn = src.slice(src.indexOf("export async function resumeWorkspaceRun"), src.indexOf("export async function getWorkspaceRun"));

  it("treats another organization's run as not found, before anything is decided", () => {
    const check = fn.indexOf('if (!run || (orgId && run.organizationId && run.organizationId !== orgId)) throw new Error("Run not found");');
    expect(check).toBeGreaterThan(0);
    expect(check).toBeLessThan(fn.indexOf("storage.updateApproval"));
  });

  it("applies reviewer routing before the approval is updated", () => {
    const check = fn.indexOf("canDecideApproval(params.role, approval.requiredReviewerRole)");
    expect(check).toBeGreaterThan(0);
    expect(check).toBeLessThan(fn.indexOf("storage.updateApproval"));
  });

  it("gets the decider's role from the Workspace routes and from Astra", () => {
    const routes = read("server/routes/workspace.ts");
    expect(routes.match(/role: getRequestRole\(req\)/g)?.length).toBe(2);
    expect(routes).toContain("res.status(e.status ?? (/not found/i.test(e.message) ? 404 : 400))");
    expect(read("server/astra/services.ts")).toContain("resumeWorkspaceRun({ runId, decision, orgId, actorId: role, role }, onEvent)");
  });

  it("routing means only that role or admin", () => {
    expect(canDecideApproval("finance", "compliance_security").allowed).toBe(false);
    expect(canDecideApproval("compliance_security", "compliance_security").allowed).toBe(true);
    expect(canDecideApproval("admin", "compliance_security").allowed).toBe(true);
  });
});
