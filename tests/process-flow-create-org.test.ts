/**
 * Saving a new process flow carries the caller's organization.
 *
 * Live 2026-10-14: POST /api/process-flows answered 500 for every flow, from a
 * deploy at 05:37 UTC until a restart at 12:07 UTC, while PUT on an existing
 * flow kept working. The create route passed no organizationId, so the insert
 * fell back to the default org that server/index.ts sets once at boot -- and
 * that boot lookup had failed while the database was timing out, leaving the
 * id unset for the life of the process ("organizationId is required").
 *
 * The route now passes the request's organization the way createOutcome in the
 * same file does. This pins that, reading the route rather than a line window,
 * so a CRLF checkout or a moved route cannot make it pass or fail by accident.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const source = readFileSync(join(__dirname, "..", "server", "routes", "outcomes.ts"), "utf8").replace(/\r\n/g, "\n");

/** The text of one route handler: from its registration to the next one. */
function route(method: "post" | "put", path: string): string {
  const start = source.indexOf(`router.${method}("${path}"`);
  expect(start, `route ${method.toUpperCase()} ${path} is registered in server/routes/outcomes.ts`).toBeGreaterThan(-1);
  const next = source.indexOf("\n  router.", start + 1);
  return source.slice(start, next > 0 ? next : undefined);
}

describe("POST /api/process-flows", () => {
  it("passes the caller's organization to the insert, like createOutcome, instead of relying on the boot-time default", () => {
    const create = route("post", "/api/process-flows");
    const call = create.slice(create.indexOf("storage.createProcessFlow("));
    expect(call).toContain("organizationId: getOrgId(req) ?? getDefaultOrgId() ?? undefined");
    // The same fallback the outcome create uses, so the two cannot drift apart.
    const outcome = route("post", "/api/outcomes");
    expect(outcome).toContain("organizationId: getOrgId(req) ?? getDefaultOrgId() ?? undefined");
  });

  it("still scopes the update to the caller's organization", () => {
    const update = route("put", "/api/process-flows/:id");
    expect(update).toContain("storage.updateProcessFlow(String(req.params.id)");
    expect(update).toContain("getOrgId(req))");
  });
});
