/**
 * A document as a run input: shared/run-input.ts's `file` field, and
 * server/run-documents.ts turning the id it collects into the descriptor every
 * step reads.
 *
 * The case these tests exist for is the unreadable one. A scanned PDF extracts
 * to nothing today, and a run given one must say so -- in the descriptor and
 * in the text the model is shown. An empty extraction that reads as an empty
 * document is the difference between "this schedule lists no locations" and
 * "nobody read this schedule".
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { validateRunInput, inputFields, FILE_INPUT_TYPE } from "../shared/run-input";

const state = vi.hoisted(() => ({
  files: new Map<string, any>(),
  attachmentCalls: [] as Array<{ ids: string[]; orgId?: string; framing?: string[]; cap?: number }>,
  created: [] as any[],
  schema: null as any,
}));

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
    getAgent: vi.fn(async (id: string) =>
      id === "team-1" ? { id, name: "Team", blueprintId: "bp1", runtimeConfig: {}, organizationId: "org-1" } : undefined),
    getTeamBlueprintNodes: vi.fn(async () => [
      { id: "reader", blueprintId: "bp1", nodeType: "internal_agent", label: "Reader", refAgentId: "ag-reader", refTeamAgentId: null, refToolIds: [], stateKey: "triage_result", timeoutMs: 30000, config: null },
    ]),
    getTeamBlueprintEdges: vi.fn(async () => []),
    getDagStateSchemaByTeamAgent: vi.fn(async () => state.schema),
    createDagExecutionRun: vi.fn(async (row: any) => { const created = { id: `run-${state.created.length + 1}`, ...row }; state.created.push(created); return created; }),
    getDagExecutionRun: vi.fn(async (id: string) => state.created.find((r) => r.id === id)),
    getDagExecutionRunStatus: vi.fn(async () => "running"),
  };
  const storage = new Proxy(base, { get: (t, k: string) => (k in t ? t[k] : vi.fn(async () => undefined)) });
  return { storage };
});

vi.mock("../server/attachment-context", () => ({
  readAttachedFiles: async (ids: string[], orgId?: string) =>
    ids.map((id) => state.files.get(id)).filter((r) => r && (!orgId || r.organizationId === orgId)),
  buildAttachmentContext: async (ids: string[], orgId?: string, framing?: string[], cap?: number) => {
    state.attachmentCalls.push({ ids, orgId, framing, cap });
    const rows = ids.map((id) => state.files.get(id)).filter(Boolean);
    // Faithful to the real one: the framing leads, then a block per file.
    return {
      context: [...(framing ?? []), "", ...rows.map((r) => `--- Attached file: ${r.filename} ---\n${r.extractedText}`)].join("\n"),
      names: rows.map((r) => r.filename),
    };
  },
}));

const {
  resolveRunDocuments,
  runDocumentsInState,
  buildRunDocumentContext,
  fileInputFieldNames,
  isRunDocument,
} = await import("../server/run-documents");

const { startTeamAgentDagRun } = await import("../server/dag-execution-engine");

const file = (over: Record<string, unknown> = {}) => ({
  id: "f-sov",
  organizationId: "org-1",
  filename: "GCHG_SOV_2026.xlsx",
  kind: "xlsx",
  sizeBytes: 48_120,
  extractedText: "locationId,address,tiv\n001,Gulfport,18500000",
  extractMeta: {},
  ...over,
});

const schema = {
  sov_document: { type: FILE_INPUT_TYPE, writable_by: ["*"], reducer: "last_wins" as const, input: true },
  loss_runs: { type: FILE_INPUT_TYPE, writable_by: ["*"], reducer: "last_wins" as const, input: true },
  broker_name: { type: "string", writable_by: ["*"], reducer: "last_wins" as const, input: true },
  triage_result: { type: "object", writable_by: ["*"], reducer: "last_wins" as const },
};

beforeEach(() => {
  state.files.clear();
  state.attachmentCalls.length = 0;
  state.created.length = 0;
  state.schema = { id: "schema-1", teamAgentId: "team-1", fields: schema, reducers: {} };
  state.files.set("f-sov", file());
});

describe("a file field on the run form", () => {
  it("is offered as an input field with its type", () => {
    const fields = inputFields(schema);
    expect(fields.map((f) => f.name)).toEqual(["sov_document", "loss_runs", "broker_name"]);
    expect(fields.find((f) => f.name === "sov_document")?.type).toBe(FILE_INPUT_TYPE);
  });

  it("takes the uploaded file's id, as a bare string or as the picker's one-item list", () => {
    expect(validateRunInput(schema, { sov_document: "f-sov" })).toEqual({ value: { sov_document: "f-sov" }, errors: [] });
    expect(validateRunInput(schema, { sov_document: ["f-sov"] })).toEqual({ value: { sov_document: "f-sov" }, errors: [] });
  });

  it("refuses two documents in one field, naming the field", () => {
    const { errors } = validateRunInput(schema, { sov_document: ["f-sov", "f-other"] });
    expect(errors).toEqual(["sov_document: one document per field; attach a single file"]);
  });

  it("treats an empty picker as a field left blank, not as a failed attachment", () => {
    expect(validateRunInput(schema, { sov_document: [] })).toEqual({ value: {}, errors: [] });
  });

  it("refuses a value that is not an id", () => {
    expect(validateRunInput(schema, { sov_document: "   " }).value).toEqual({});
    expect(validateRunInput(schema, { sov_document: "not an id" }).errors)
      .toEqual(["sov_document: must be an uploaded file"]);
    expect(validateRunInput(schema, { sov_document: 42 }).errors)
      .toEqual(["sov_document: must be an uploaded file"]);
  });
});

describe("resolving an id into what the steps read", () => {
  it("describes the document without carrying its text", async () => {
    const { documents, missing } = await resolveRunDocuments(["f-sov"], "org-1");
    expect(missing).toEqual([]);
    expect(documents[0]).toEqual({
      fileId: "f-sov",
      filename: "GCHG_SOV_2026.xlsx",
      kind: "xlsx",
      sizeBytes: 48_120,
      chars: file().extractedText.length,
      readable: true,
      truncated: false,
    });
    expect(JSON.stringify(documents[0])).not.toContain("Gulfport");
  });

  it("reports a file belonging to another organization as missing, not as readable", async () => {
    state.files.set("f-theirs", file({ id: "f-theirs", organizationId: "org-2" }));
    const { documents, missing } = await resolveRunDocuments(["f-theirs"], "org-1");
    expect(documents).toEqual([]);
    expect(missing).toEqual(["f-theirs"]);
  });

  it("marks a file nothing could be read from as unreadable, with a note saying why", async () => {
    state.files.set("f-scan", file({ id: "f-scan", filename: "BeaconStreet_SOV_scan.pdf", kind: "pdf", extractedText: "" }));
    const { documents } = await resolveRunDocuments(["f-scan"], "org-1");
    expect(documents[0].readable).toBe(false);
    expect(documents[0].chars).toBe(0);
    expect(documents[0].note).toMatch(/scan or an image-only PDF/);
    expect(documents[0].note).toMatch(/Do not treat it as an empty document/);
  });

  it("says when the reader stopped early", async () => {
    state.files.set("f-big", file({ id: "f-big", extractMeta: { truncated: true } }));
    const { documents } = await resolveRunDocuments(["f-big"], "org-1");
    expect(documents[0].truncated).toBe(true);
    expect(documents[0].readable).toBe(true);
    expect(documents[0].note).toMatch(/incomplete/);
  });
});

describe("which steps see a document", () => {
  const descriptor = { fileId: "f-sov", filename: "GCHG_SOV_2026.xlsx", kind: "xlsx", sizeBytes: 1, chars: 48, readable: true, truncated: false };

  it("finds the file fields in a schema, and only those", () => {
    expect(fileInputFieldNames(schema)).toEqual(["sov_document", "loss_runs"]);
  });

  it("is scoped to the keys a step can see", () => {
    const runState = { sov_document: descriptor, broker_name: "Bridge Specialty" };
    expect(runDocumentsInState(schema, runState, new Set(["sov_document"])).map((d) => d.field)).toEqual(["sov_document"]);
    expect(runDocumentsInState(schema, runState, new Set(["broker_name"]))).toEqual([]);
    expect(runDocumentsInState(schema, runState).map((d) => d.field)).toEqual(["sov_document"]);
  });

  it("does not mistake a step's own output for a document the run was given", () => {
    const runState = { triage_result: { fileId: "x", filename: "made up" } };
    expect(runDocumentsInState(schema, runState)).toEqual([]);
    expect(isRunDocument(runState.triage_result)).toBe(true); // shape alone is not enough; the schema decides
  });
});

describe("what a step is shown", () => {
  it("inlines the text of a readable document, capped", async () => {
    const { documents } = await resolveRunDocuments(["f-sov"], "org-1");
    const context = await buildRunDocumentContext(documents, "org-1");
    expect(context).toContain("Gulfport");
    expect(context).toContain("This run was given the following document(s)");
    expect(state.attachmentCalls[0].cap).toBe(120_000);
    expect(state.attachmentCalls[0].orgId).toBe("org-1");
  });

  it("states an unreadable document instead of leaving it out", async () => {
    state.files.set("f-scan", file({ id: "f-scan", filename: "BeaconStreet_SOV_scan.pdf", kind: "pdf", extractedText: "" }));
    const { documents } = await resolveRunDocuments(["f-scan"], "org-1");
    const context = await buildRunDocumentContext(documents, "org-1");
    expect(context).toContain("could NOT be read");
    expect(context).toContain("BeaconStreet_SOV_scan.pdf");
    expect(context).toContain("Do not infer their contents");
    expect(state.attachmentCalls).toHaveLength(0); // nothing to inline, so no attachment call
  });

  it("shows both when one document reads and another does not", async () => {
    state.files.set("f-scan", file({ id: "f-scan", filename: "BeaconStreet_SOV_scan.pdf", extractedText: "" }));
    const { documents } = await resolveRunDocuments(["f-sov", "f-scan"], "org-1");
    const context = await buildRunDocumentContext(documents, "org-1");
    expect(context).toContain("Gulfport");
    expect(context).toContain("also given the following document(s), which could NOT be read");
    expect(context).toContain("BeaconStreet_SOV_scan.pdf");
  });

  it("is empty when the step was given no documents", async () => {
    expect(await buildRunDocumentContext([], "org-1")).toBe("");
  });
});

describe("starting a run with a document", () => {

  it("seeds the descriptor into the run's state, not the id and not the text", async () => {
    await startTeamAgentDagRun("team-1", "bp1", "Triage this submission", { input: { sov_document: "f-sov" } });
    expect(state.created).toHaveLength(1);
    const seeded = state.created[0].initialState;
    expect(seeded.request).toBe("Triage this submission");
    expect(seeded.sov_document).toMatchObject({
      fileId: "f-sov",
      filename: "GCHG_SOV_2026.xlsx",
      readable: true,
    });
    // The id alone would be a dangling reference to every step that reads it;
    // the text would ride along in every wave result.
    expect(typeof seeded.sov_document).toBe("object");
    expect(JSON.stringify(seeded)).not.toContain("Gulfport");
  });

  it("refuses an id from another organization before any run row exists", async () => {
    state.files.set("f-theirs", file({ id: "f-theirs", organizationId: "org-2" }));
    await expect(startTeamAgentDagRun("team-1", "bp1", "Triage", { input: { sov_document: "f-theirs" } }))
      .rejects.toThrow(/no uploaded file with that id is available to this team/);
    expect(state.created).toHaveLength(0);
  });

  it("carries the unreadable verdict into state, where a rule can route on it", async () => {
    state.files.set("f-scan", file({ id: "f-scan", filename: "BeaconStreet_SOV_scan.pdf", extractedText: "" }));
    await startTeamAgentDagRun("team-1", "bp1", "Triage", { input: { sov_document: "f-scan" } });
    const seeded = state.created[0].initialState;
    expect(seeded.sov_document.readable).toBe(false);
    expect(seeded.sov_document.note).toMatch(/scan or an image-only PDF/);
  });

  it("starts a run with no documents exactly as before", async () => {
    await startTeamAgentDagRun("team-1", "bp1", "Triage", { input: { broker_name: "Bridge Specialty" } });
    expect(state.created[0].initialState).toEqual({ broker_name: "Bridge Specialty", request: "Triage" });
  });
});
