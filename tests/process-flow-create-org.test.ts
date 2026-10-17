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
import { unknownStepTypes, PROCESS_NODE_TYPES } from "@shared/process-flow";

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

/**
 * A flow may only be drawn with step types the platform knows.
 *
 * `nodes` is validated as z.array(z.any()), so a type nothing downstream has a
 * case for saved cleanly and then became an agent step everywhere: classifyStep
 * falls through to "agent", the build records the unknown type as
 * config.sourceType and builds an internal_agent, and the result is
 * indistinguishable from a step genuinely drawn as an agent -- it costs a model
 * call and does none of what it was drawn to do.
 *
 * Found by drawing retrieval as "knowledge_base", which is an ExecutionKind
 * (what a step is classified AS) and not a step type. A census of all 66 flows
 * in the org found exactly one carrying an unknown type: that step.
 */
describe("step types a flow may be saved with", () => {
  it("refuses an unknown type on create and on update, naming it and the legal set", () => {
    for (const [method, path] of [["post", "/api/process-flows"], ["put", "/api/process-flows/:id"]] as const) {
      const handler = route(method, path);
      expect(handler, `${method} ${path} checks the step types`).toContain("unknownStepTypes(");
      expect(handler).toContain("status(422)");
      // The author has to be told WHICH step type, and what they could have
      // used instead -- a refusal that says only "invalid" sends them reading
      // source.
      expect(handler).toContain("unknownStepTypes: unknown");
      expect(handler).toContain("allowed: [...PROCESS_NODE_TYPES]");
    }
  });

  it("checks the normalized graph, not the raw request body", () => {
    // normalizeToGraph accepts both the graph shape and the older flat step
    // array, so checking req.body would miss one of the two ways to save.
    const create = route("post", "/api/process-flows");
    const at = create.indexOf("unknownStepTypes(");
    expect(at).toBeGreaterThan(create.indexOf("normalizeToGraph("));
    expect(create.slice(at, at + 120)).toContain("graph.nodes");
  });
});

describe("unknownStepTypes", () => {
  it("names each unknown type once and passes every legal one", () => {
    expect(unknownStepTypes([{ type: "get_info" }, { type: "expert_approval" }, { type: "end" }])).toEqual([]);
    expect(unknownStepTypes([{ type: "knowledge_base" }, { type: "knowledge_base" }])).toEqual(["knowledge_base"]);
    expect(unknownStepTypes(PROCESS_NODE_TYPES.map((t) => ({ type: t })))).toEqual([]);
  });

  it("ignores a step with no type rather than calling it unknown", () => {
    // A step mid-draw has no type yet. Refusing to save that would make the
    // Studio unusable, and it is not the defect this guards.
    expect(unknownStepTypes([{}, { type: "" }, { type: "   " }])).toEqual([]);
  });
});
