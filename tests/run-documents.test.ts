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

  /**
   * These mirror what server/file-extract.ts actually writes. An earlier
   * version of this feature read `meta.pages` as an array of page spans; the
   * extractor sets it to a NUMBER, so that branch could never fire and the
   * tests agreed with it because they invented the shape themselves.
   */
  it("carries the page count the extractor recorded", async () => {
    state.files.set("f-pdf", file({ id: "f-pdf", filename: "GCHG_SOV.pdf", kind: "pdf", extractMeta: { pages: 18 } }));
    const { documents } = await resolveRunDocuments(["f-pdf"], "org-1");
    expect(documents[0].pages).toBe(18);
  });

  it("has no page count for a format without pages", async () => {
    const { documents } = await resolveRunDocuments(["f-sov"], "org-1");
    expect(documents[0].pages).toBeUndefined();
  });

  it("quotes the extractor's own statement of what was left out", async () => {
    state.files.set("f-cut", file({
      id: "f-cut",
      filename: "long_schedule.pdf",
      kind: "pdf",
      extractMeta: {
        pages: 18,
        truncated: true,
        coverage: {
          unit: "page", unitsTotal: 18, unitsKept: 6, charsKept: 120000, complete: false,
          omitted: "12 pages of 18, from page 7 on, were not read: the document is larger than the 120,000-character safety limit.",
        },
      },
    }));
    const { documents } = await resolveRunDocuments(["f-cut"], "org-1");
    expect(documents[0].pages).toBe(18);
    expect(documents[0].truncated).toBe(true);
    // the extractor's words, naming WHICH pages are missing -- not a generic note
    expect(documents[0].note).toContain("from page 7 on");
    expect(documents[0].note).not.toMatch(/what the steps are given is incomplete/);
  });
});

describe("which steps see a document", () => {
  const descriptor = { fileId: "f-sov", filename: "GCHG_SOV_2026.xlsx", kind: "xlsx", sizeBytes: 1, chars: 48, readable: true, truncated: false };

  it("finds the file fields in a schema, and only those", () => {
    expect(fileInputFieldNames(schema)).toEqual(["sov_document", "loss_runs"]);
  });

  /**
   * These mirror visibleStateKeys' return value, which is the whole point: the
   * first version of this test invented a Set of visible keys by hand and so
   * agreed with an implementation that could never work. In a real run
   * `visible` holds node stateKeys ONLY, so a `file` input is never in it --
   * and gating on `visible` alone meant no step ever received a document.
   */
  const scope = (visible: string[], owned: string[]) => ({ visible: new Set(visible), owned: new Set(owned) });

  it("shows an input field no node owns, exactly as the state dump does", () => {
    const runState = { sov_document: descriptor, broker_name: "Bridge Specialty" };
    // What a real run looks like: the nodes own their own output keys, nothing more.
    const real = scope(["triage_result"], ["triage_result"]);
    expect(runDocumentsInState(schema, runState, real).map((d) => d.field)).toEqual(["sov_document"]);
  });

  it("hides a document a step cannot see, when a node owns that key", () => {
    const runState = { sov_document: descriptor };
    expect(runDocumentsInState(schema, runState, scope([], ["sov_document"]))).toEqual([]);
    expect(runDocumentsInState(schema, runState, scope(["sov_document"], ["sov_document"])).map((d) => d.field))
      .toEqual(["sov_document"]);
  });

  it("shows everything when no scope is given", () => {
    const runState = { sov_document: descriptor, broker_name: "Bridge Specialty" };
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
    // the inventory names the file and its extent before the contents
    expect(context).toContain("- GCHG_SOV_2026.xlsx (");
    expect(context).toContain("characters read");
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

describe("what a step is told about extent", () => {
  it("marks a partial document PARTIAL and says which pages are missing", async () => {
    state.files.set("f-cut", file({
      id: "f-cut",
      filename: "long_schedule.pdf",
      kind: "pdf",
      extractedText: "page one of a long schedule",
      extractMeta: {
        pages: 18,
        truncated: true,
        coverage: { unit: "page", unitsTotal: 18, unitsKept: 6, charsKept: 120000, complete: false,
          omitted: "12 pages of 18, from page 7 on, were not read." },
      },
    }));
    const { documents } = await resolveRunDocuments(["f-cut"], "org-1");
    const context = await buildRunDocumentContext(documents, "org-1");
    expect(context).toContain("long_schedule.pdf (18 pages");
    expect(context).toContain("PARTIAL");
    expect(context).toContain("from page 7 on");
    expect(context).toContain("say so in your output");
  });

  it("does not call a whole document partial", async () => {
    const { documents } = await resolveRunDocuments(["f-sov"], "org-1");
    const context = await buildRunDocumentContext(documents, "org-1");
    // "PARTIAL" also appears in the standing instruction, so check the file's
    // OWN inventory line rather than the whole block.
    const line = context.split("\n").find((l) => l.startsWith("- GCHG_SOV_2026.xlsx"));
    expect(line).toBeDefined();
    expect(line).not.toContain("PARTIAL");
  });
});

/**
 * The descriptor must answer "is this the whole document?", not "did the
 * extractor hit its ceiling?" -- two different events that used to share one
 * field. Measured on the deployed app before this fix: a 359,214-character
 * schedule reached a step as its first 120,000 characters with
 * `truncated: false` in state, while the prompt said so in words. A routing
 * rule reads the field, not the prose.
 */
describe("truncation the step actually experiences", () => {
  const long = (n: number) => file({ id: "f-long", filename: "big_schedule.txt", extractedText: "x".repeat(n) });

  it("is truncated when the text is longer than one step may be handed", async () => {
    state.files.set("f-long", long(359_214));
    const { documents } = await resolveRunDocuments(["f-long"], "org-1");
    const d = documents[0];
    expect(d.chars).toBe(359_214);
    expect(d.charsShown).toBe(120_000);
    expect(d.truncated).toBe(true);
    expect(d.note).toContain("first 120,000 of 359,214 characters");
    expect(d.note).toContain("do not conclude it is absent");
  });

  it("is not truncated when the whole document fits", async () => {
    state.files.set("f-long", long(119_999));
    const { documents } = await resolveRunDocuments(["f-long"], "org-1");
    expect(documents[0].truncated).toBe(false);
    expect(documents[0].charsShown).toBeUndefined();
    expect(documents[0].note).toBeUndefined();
  });

  it("exactly at the cap is not truncated", async () => {
    state.files.set("f-long", long(120_000));
    const { documents } = await resolveRunDocuments(["f-long"], "org-1");
    expect(documents[0].truncated).toBe(false);
    expect(documents[0].charsShown).toBeUndefined();
  });

  it("says so when the reader stopped short AND the step cap also bit", async () => {
    state.files.set("f-long", file({ id: "f-long", filename: "big.pdf", kind: "pdf", extractedText: "y".repeat(200_000), extractMeta: { truncated: true, pages: 400 } }));
    const { documents } = await resolveRunDocuments(["f-long"], "org-1");
    expect(documents[0].truncated).toBe(true);
    expect(documents[0].note).toContain("the reader had already stopped short");
  });

  it("tells the step what arrived against what exists", async () => {
    state.files.set("f-long", long(359_214));
    const { documents } = await resolveRunDocuments(["f-long"], "org-1");
    const context = await buildRunDocumentContext(documents, "org-1");
    expect(context).toContain("120,000 of 359,214 characters shown");
    expect(context).toContain("PARTIAL");
    // and never the old line that contradicted the prompt
    expect(context).not.toContain("359,214 characters read");
  });
});
