/**
 * What a team run is given (Phase 3, item 11).
 *
 * A state schema field marked `input: true` is one the run receives at the
 * start. The Run dialog draws a form from these fields, the run route checks
 * the values against them before anything is persisted, and each value lands
 * in the run's initial state under the field's own name, beside `request`.
 * The check is shared (shared/run-input.ts), so the form and the server agree.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");

const db = vi.hoisted(() => ({ created: [] as any[], schema: null as any }));

vi.mock("../server/agent-runtime", () => ({
  detectTranscriptionDrift: () => [],
  executeWorkerAgent: vi.fn(async () => ({ success: true, output: "done", promptTokens: 1, completionTokens: 1 })),
  waitForApproval: vi.fn(),
  evaluateCondition: vi.fn().mockResolvedValue(true),
  extractStructuredOutput: () => null,
  canonicalJsonStringify: (v: unknown) => JSON.stringify(v),
  buildPipelineState: () => ({}),
}));

vi.mock("../server/storage", () => {
  const base: Record<string, any> = {
    getAgent: vi.fn(async (id: string) => (id === "team-1" ? { id, name: "Team", blueprintId: "bp1", runtimeConfig: {}, organizationId: "org-1" } : undefined)),
    getTeamBlueprintNodes: vi.fn(async () => [
      { id: "writer", blueprintId: "bp1", nodeType: "internal_agent", label: "Writer", refAgentId: "ag-writer", refTeamAgentId: null, refToolIds: [], stateKey: "draft", timeoutMs: 30000, config: null },
    ]),
    getTeamBlueprintEdges: vi.fn(async () => []),
    getDagStateSchemaByTeamAgent: vi.fn(async () => db.schema),
    createDagExecutionRun: vi.fn(async (row: any) => { const created = { id: `run-${db.created.length + 1}`, ...row }; db.created.push(created); return created; }),
    getDagExecutionRun: vi.fn(async (id: string) => db.created.find((r) => r.id === id)),
    getDagExecutionRunStatus: vi.fn(async () => "running"),
  };
  // Everything else the fire-and-forget execution touches is a no-op here.
  const storage = new Proxy(base, { get: (t, k: string) => (k in t ? t[k] : vi.fn(async () => undefined)) });
  return { storage };
});

import { inputFields, validateRunInput, RunInputError } from "../shared/run-input";
import { startTeamAgentDagRun } from "../server/dag-execution-engine";
import { storage } from "../server/storage";

const fields = {
  region: { type: "string", writable_by: ["*"], reducer: "last_wins", input: true, enum: ["EMEA", "APAC"], description: "Where the account is booked" },
  limit: { type: "number", writable_by: ["*"], reducer: "last_wins", input: true },
  expedite: { type: "boolean", writable_by: ["*"], reducer: "last_wins", input: true },
  filters: { type: "object", writable_by: ["*"], reducer: "merge_object", input: true },
  draft: { type: "string", writable_by: ["*"], reducer: "last_wins" },
};

beforeEach(() => {
  db.created.length = 0;
  db.schema = { id: "schema-1", teamAgentId: "team-1", fields, reducers: {} };
  vi.mocked(storage.createDagExecutionRun).mockClear();
});

describe("the fields a run is given", () => {
  it("are the ones marked input, in the schema's order, with their choices and description", () => {
    expect(inputFields(fields)).toEqual([
      { name: "region", type: "string", enum: ["EMEA", "APAC"], description: "Where the account is booked" },
      { name: "limit", type: "number" },
      { name: "expedite", type: "boolean" },
      { name: "filters", type: "object" },
    ]);
    expect(inputFields(null)).toEqual([]);
    expect(inputFields({ draft: { type: "string" } })).toEqual([]);
  });
});

describe("checking what came back", () => {
  it("coerces what a form can only hand back as text, and leaves out what was left blank", () => {
    const r = validateRunInput(fields, { region: "EMEA", limit: "12", expedite: "true", filters: '{"state":"FL"}' });
    expect(r.errors).toEqual([]);
    expect(r.value).toEqual({ region: "EMEA", limit: 12, expedite: true, filters: { state: "FL" } });
    expect(validateRunInput(fields, { region: "EMEA", limit: "", expedite: "   " })).toEqual({ value: { region: "EMEA" }, errors: [] });
  });

  it("names every value that does not fit, with the field it belongs to", () => {
    const r = validateRunInput(fields, { region: "LATAM", limit: "twelve", expedite: "maybe", filters: "{not json" });
    expect(r.errors).toEqual([
      "region: must be one of EMEA, APAC",
      "limit: must be a number",
      "expedite: must be true or false",
      "filters: must be JSON for an object",
    ]);
    expect(r.value).toEqual({});
  });

  it("refuses a key no input field names, so a typo never becomes a silent state entry", () => {
    expect(validateRunInput(fields, { draft: "x" }).errors).toEqual(["draft is not an input of this team"]);
    expect(validateRunInput(fields, { regon: "EMEA" }).errors).toEqual(["regon is not an input of this team"]);
    expect(validateRunInput(fields, ["EMEA"]).errors).toEqual(["input must be an object of field values"]);
  });

  it("is nothing to check when nothing was given", () => {
    expect(validateRunInput(fields, undefined)).toEqual({ value: {}, errors: [] });
    expect(validateRunInput(null, { anything: 1 }).errors).toEqual(["anything is not an input of this team"]);
  });
});

describe("starting a run with input", () => {
  it("seeds the initial state with the checked values beside the request", async () => {
    const { dagRunId } = await startTeamAgentDagRun("team-1", "bp1", "Underwrite it", { input: { region: "APAC", limit: "5", expedite: "false" } });
    expect(dagRunId).toBe("run-1");
    expect(vi.mocked(storage.createDagExecutionRun).mock.calls[0][0]).toMatchObject({
      teamAgentId: "team-1",
      initialState: { region: "APAC", limit: 5, expedite: false, request: "Underwrite it" },
      currentState: { region: "APAC", limit: 5, expedite: false, request: "Underwrite it" },
    });
  });

  it("keeps the request as the request, whatever the input says", async () => {
    await startTeamAgentDagRun("team-1", "bp1", "the real ask", { input: { request: "an impostor" } }).catch(() => undefined);
    // "request" is not an input field, so it is refused rather than overwritten.
    expect(vi.mocked(storage.createDagExecutionRun)).not.toHaveBeenCalled();
  });

  it("refuses input that does not fit before any run row is written", async () => {
    const err = await startTeamAgentDagRun("team-1", "bp1", "go", { input: { limit: "lots" } }).catch((e) => e);
    expect(err).toBeInstanceOf(RunInputError);
    expect(err.errors).toEqual(["limit: must be a number"]);
    expect(vi.mocked(storage.createDagExecutionRun)).not.toHaveBeenCalled();
  });

  it("runs as before when the team has no schema or no input", async () => {
    db.schema = null;
    await startTeamAgentDagRun("team-1", "bp1", "go");
    expect(vi.mocked(storage.createDagExecutionRun).mock.calls[0][0]).toMatchObject({ initialState: { request: "go" } });
  });
});

describe("where it is wired", () => {
  it("the run route passes the input through and answers 400 with every error", () => {
    const src = read("server", "routes", "runtime.ts");
    expect(src).toContain("...(req.body?.input !== undefined ? { input: req.body.input } : {})");
    expect(src).toContain("if (execErr instanceof RunInputError) return res.status(400).json({ error: execErr.message, errors: execErr.errors });");
  });

  it("the Run dialog draws the form from the schema and checks it before posting", () => {
    const src = read("client", "src", "pages", "team-graph-editor.tsx");
    expect(src).toContain('data-testid="form-run-input"');
    expect(src).toContain("const checked = validateRunInput(schemaFields, values);");
    expect(src).toContain("...(fields.length ? { input: checked.value } : {})");
    // The schema editor is where a field is marked as given to the run.
    expect(src).toContain("checkbox-schema-field-input-");
    expect(src).toContain("input-schema-field-description-");
  });

  it("the run monitor shows what the run was given, by the schema's field names", () => {
    const src = read("client", "src", "pages", "dag-run-monitor.tsx");
    expect(src).toContain('data-testid="section-run-input"');
    expect(src).toContain("inputFields((inputSchema?.fields as Record<string, any>) ?? null)");
  });
});
