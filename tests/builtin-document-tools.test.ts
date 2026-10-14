import { describe, it, expect, vi, beforeEach } from "vitest";

const createAgentGeneratedFile = vi.fn();
const getAgentGeneratedFile = vi.fn();
vi.mock("../server/storage", () => ({
  storage: {
    createAgentGeneratedFile: (...a: any[]) => createAgentGeneratedFile(...a),
    getAgentGeneratedFile: (...a: any[]) => getAgentGeneratedFile(...a),
  },
}));
const readAttachedFiles = vi.fn();
vi.mock("../server/attachment-context", () => ({
  readAttachedFiles: (...a: any[]) => readAttachedFiles(...a),
}));

const {
  documentToolsForSkills,
  executeBuiltinDocumentTool,
  isBuiltinDocumentTool,
  skillGrantsDocumentGeneration,
  readDocumentToolDef,
  GENERATE_PPTX_TOOL,
  GENERATE_PDF_TOOL,
  FILL_TEMPLATE_TOOL,
  INSPECT_DOCUMENT_TOOL,
  READ_DOCUMENT_TOOL,
  READ_DOCUMENT_DEFAULT_CHARS,
  GENERATED_FILE_MARKER,
  stripGeneratedFileMarker,
} = await import("../server/builtin-document-tools");

const skill = (over: Record<string, any> = {}) =>
  ({ id: "s1", name: "PDF & PPTX Generator", status: "active", skillKind: "code_execution", anthropicSkillIds: ["pptx", "pdf"], ...over }) as any;

const SPEC = {
  title: "Q3 Marketing Campaign",
  sections: [{ heading: "Results", bullets: ["Revenue +18%"] }],
};

describe("built-in document tools", () => {
  beforeEach(() => {
    createAgentGeneratedFile.mockReset();
    getAgentGeneratedFile.mockReset();
    readAttachedFiles.mockReset();
    createAgentGeneratedFile.mockResolvedValue({ id: "file-1", filename: "q3-marketing-campaign.pptx", mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation" });
    getAgentGeneratedFile.mockResolvedValue(undefined);
    readAttachedFiles.mockResolvedValue([]);
  });

  it("offers the generators, the template fill, the inspector and the reader to an agent holding the document skill", () => {
    const tools = documentToolsForSkills([skill()]);
    expect(tools.map(t => t.toolName)).toEqual([GENERATE_PPTX_TOOL, GENERATE_PDF_TOOL, FILL_TEMPLATE_TOOL, INSPECT_DOCUMENT_TOOL, READ_DOCUMENT_TOOL]);
    expect(tools.every(isBuiltinDocumentTool)).toBe(true);
  });

  it("offers nothing to an agent without it, so no existing tool surface changes", () => {
    expect(documentToolsForSkills([])).toEqual([]);
    expect(documentToolsForSkills([skill({ anthropicSkillIds: [] })])).toEqual([]);
    expect(documentToolsForSkills([skill({ status: "draft" })])).toEqual([]);
  });

  it("gates on the skill, not the model -- the reason a GPT agent now works", () => {
    // No model is consulted anywhere in this path.
    expect(skillGrantsDocumentGeneration(skill())).toBe(true);
  });

  it("renders and persists a pptx, returning the marker the engines fold into the run", async () => {
    const result = await executeBuiltinDocumentTool(GENERATE_PPTX_TOOL, SPEC, { orgId: "org-1", agentId: "agent-1" });

    expect(result.ok).toBe(true);
    expect(result.filename).toBe("q3-marketing-campaign.pptx");
    expect(result[GENERATED_FILE_MARKER]).toEqual({ id: "file-1", filename: "q3-marketing-campaign.pptx", mimeType: expect.any(String) });
    // No URL anywhere the model can see -- given one, gpt-4o rendered
    // "sandbox:/api/agent-files/..." into its reply as a dead link.
    expect(JSON.stringify(result)).not.toContain("/api/agent-files");
    expect(result.message).toMatch(/do not include a link/i);

    // The raw id is still present at this layer (engines extract it from HERE
    // via GENERATED_FILE_MARKER before stripping it for the model -- see
    // stripGeneratedFileMarker below). Confirming that is deliberate: this
    // function's job is to hand the id to the ENGINE, not to hide it from
    // everyone. Hiding it from the MODEL is the engines' job, tested next.
    expect(JSON.stringify(result)).toContain("file-1");

    const row = createAgentGeneratedFile.mock.calls[0][0];
    expect(row.source).toBe("platform");
    expect(row.anthropicFileId).toBeNull();
    expect(Buffer.isBuffer(row.content)).toBe(true);
    expect(row.sizeBytes).toBe(row.content.length);
    expect(row.organizationId).toBe("org-1");
  });

  it("renders a pdf with the pdf mime type", async () => {
    createAgentGeneratedFile.mockResolvedValue({ id: "file-2", filename: "q3-marketing-campaign.pdf", mimeType: "application/pdf" });
    const result = await executeBuiltinDocumentTool(GENERATE_PDF_TOOL, SPEC, { agentId: "agent-1" });
    expect(result.ok).toBe(true);
    expect(createAgentGeneratedFile.mock.calls[0][0].mimeType).toBe("application/pdf");
    expect(createAgentGeneratedFile.mock.calls[0][0].content.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("returns a readable error for an invalid spec instead of failing the run", async () => {
    const result = await executeBuiltinDocumentTool(GENERATE_PPTX_TOOL, { title: "x" }, { agentId: "agent-1" });
    expect(result.ok).toBe(false);
    expect(result.details.join(" ")).toContain("sections");
    expect(createAgentGeneratedFile).not.toHaveBeenCalled();
  });

  it("refuses without an agent context rather than orphaning a file row", async () => {
    await expect(executeBuiltinDocumentTool(GENERATE_PPTX_TOOL, SPEC, {})).rejects.toThrow(/agent context/i);
  });

  describe("stripGeneratedFileMarker", () => {
    /**
     * Caught live in the UI (Workspace, real deploy, real gpt-4o run): even
     * with the message field saying "do not include a link", the model
     * fabricated `[Download](sandbox:/<raw-file-id>)` in its reply once the
     * raw id was sitting in the tool-result JSON it read back on its next
     * turn. The message text is not enforcement; not exposing the id is.
     * Both engines (workspace-run.ts, agent-runtime.ts) call this on
     * dispatch.result -- AFTER pulling the marker out for their own
     * generatedFiles bookkeeping -- and use only the stripped copy to build
     * the "tool" role message the model reads.
     */
    it("removes the marker key so the model never sees the raw file id", async () => {
      const toolResult = await executeBuiltinDocumentTool(GENERATE_PPTX_TOOL, SPEC, { agentId: "agent-1" });
      expect(toolResult[GENERATED_FILE_MARKER]).toBeTruthy(); // sanity: it's really there pre-strip

      const modelVisible = stripGeneratedFileMarker(toolResult) as Record<string, unknown>;
      expect(GENERATED_FILE_MARKER in modelVisible).toBe(false);
      expect(JSON.stringify(modelVisible)).not.toContain("file-1");
      // Nothing else about the result changes -- only the marker is gone.
      expect(modelVisible.ok).toBe(true);
      expect(modelVisible.filename).toBe(toolResult.filename);
      expect(modelVisible.message).toBe(toolResult.message);
    });

    it("passes through results with no marker unchanged (every non-document tool)", () => {
      const plain = { ok: true, rows: [1, 2, 3] };
      expect(stripGeneratedFileMarker(plain)).toEqual(plain);
      expect(stripGeneratedFileMarker(null)).toBeNull();
      expect(stripGeneratedFileMarker(undefined)).toBeUndefined();
      expect(stripGeneratedFileMarker("a string result")).toBe("a string result");
      expect(stripGeneratedFileMarker([1, 2, 3])).toEqual([1, 2, 3]);
    });
  });
});

/**
 * read_document: a worker handed a file it cannot open was told to say so, and
 * it did -- the notification steps of two journeys opened with "I could not
 * inspect the summary PDF" (live 2026-10-12). Now it reads the file.
 */
describe("read_document", () => {
  beforeEach(() => {
    createAgentGeneratedFile.mockReset();
    getAgentGeneratedFile.mockReset();
    readAttachedFiles.mockReset();
    getAgentGeneratedFile.mockResolvedValue(undefined);
    readAttachedFiles.mockResolvedValue([]);
  });

  it("is a built-in document tool that names the file by id or filename and needs no agent to attribute anything to", () => {
    const def = readDocumentToolDef();
    expect(isBuiltinDocumentTool(def)).toBe(true);
    expect(def.toolName).toBe(READ_DOCUMENT_TOOL);
    expect(Object.keys((def.toolInputSchema as any).properties)).toEqual(["documentFileId", "documentFilename", "maxChars"]);
  });

  it("reads back the text of a PDF this run generated, through the same reader uploads go through", async () => {
    createAgentGeneratedFile.mockResolvedValue({ id: "file-2", filename: "placement-summary.pdf", mimeType: "application/pdf" });
    const made = await executeBuiltinDocumentTool(GENERATE_PDF_TOOL, {
      title: "Placement Summary",
      sections: [{ heading: "Insurer", body: "Carrier A, rated A+ by A.M. Best, premium 410000." }, { heading: "Retention", bullets: ["400000 per occurrence"] }],
    }, { orgId: "org-1", agentId: "agent-1" });
    expect(made.ok).toBe(true);
    const stored = createAgentGeneratedFile.mock.calls[0][0];
    getAgentGeneratedFile.mockResolvedValue({ id: "file-2", filename: "placement-summary.pdf", mimeType: "application/pdf", content: stored.content });

    const read = await executeBuiltinDocumentTool(READ_DOCUMENT_TOOL, { documentFileId: "file-2" }, { orgId: "org-1" });
    expect(getAgentGeneratedFile).toHaveBeenCalledWith("file-2", "org-1");
    expect(read.ok).toBe(true);
    expect(read).toMatchObject({ filename: "placement-summary.pdf", kind: "pdf", truncated: false });
    expect(read.chars).toBeGreaterThan(50);
    expect(read.text).toContain("Carrier A");
    expect(read.text).toContain("410000");
    expect(read.text).toContain("Retention");
    // Nothing a model could render as a link.
    expect(JSON.stringify(read)).not.toContain("/api/agent-files");
  });

  it("serves an uploaded file by id from the text the upload reader already extracted, keeping its partial-reading flag", async () => {
    readAttachedFiles.mockResolvedValue([{ id: "up-1", filename: "statement-of-values.xlsx", kind: "xlsx", extractedText: "Location 1, 2800 Riverbend Industrial Blvd, 18000000", extractMeta: { truncated: true, sheets: ["SOV"] } }]);
    const read = await executeBuiltinDocumentTool(READ_DOCUMENT_TOOL, { documentFileId: "up-1" }, { orgId: "org-1" });
    expect(readAttachedFiles).toHaveBeenCalledWith(["up-1"], "org-1");
    expect(read).toMatchObject({ ok: true, filename: "statement-of-values.xlsx", kind: "xlsx", truncated: true });
    expect(read.text).toContain("Riverbend");
    expect(read.note).toMatch(/partial reading/);
  });

  it("cuts long text at maxChars, says so, and never returns more than the cap", async () => {
    const long = "word ".repeat(4_000).trim();
    readAttachedFiles.mockResolvedValue([{ id: "up-2", filename: "loss-runs.csv", kind: "csv", extractedText: long, extractMeta: {} }]);
    const read = await executeBuiltinDocumentTool(READ_DOCUMENT_TOOL, { documentFileId: "up-2", maxChars: 1_000 }, {});
    expect(read.ok).toBe(true);
    expect(read.chars).toBe(long.length);
    expect(read.text).toHaveLength(1_000);
    expect(read.truncated).toBe(true);
    expect(read.note).toContain(`1000 of ${long.length}`);
    // Without a cap the default applies, which is more than this file needs.
    const whole = await executeBuiltinDocumentTool(READ_DOCUMENT_TOOL, { documentFileId: "up-2" }, {});
    expect(whole.text).toHaveLength(long.length);
    expect(whole.truncated).toBe(false);
    expect(long.length).toBeLessThan(READ_DOCUMENT_DEFAULT_CHARS);
  });

  it("says plainly when a file has no readable text, instead of handing back an empty document", async () => {
    readAttachedFiles.mockResolvedValue([{ id: "up-3", filename: "scanned-sov.pdf", kind: "pdf", extractedText: "", extractMeta: { empty: true } }]);
    const read = await executeBuiltinDocumentTool(READ_DOCUMENT_TOOL, { documentFileId: "up-3" }, {});
    expect(read).toMatchObject({ ok: true, chars: 0, text: "" });
    expect(read.note).toMatch(/No text could be read/);
  });

  it("returns an error, not a throw, for a file that is not there, one whose bytes live in a sandbox, and a call that names nothing", async () => {
    const missing = await executeBuiltinDocumentTool(READ_DOCUMENT_TOOL, { documentFileId: "nope" }, { orgId: "org-1" });
    expect(missing).toMatchObject({ ok: false });
    expect(missing.error).toContain("No document found");

    getAgentGeneratedFile.mockResolvedValue({ id: "sb-1", filename: "deck.pptx", mimeType: "x", content: null });
    const sandbox = await executeBuiltinDocumentTool(READ_DOCUMENT_TOOL, { documentFileId: "sb-1" }, { orgId: "org-1" });
    expect(sandbox.ok).toBe(false);
    expect(sandbox.error).toMatch(/sandbox/);

    const unnamed = await executeBuiltinDocumentTool(READ_DOCUMENT_TOOL, {}, {});
    expect(unnamed.ok).toBe(false);
    expect(unnamed.error).toMatch(/documentFileId/);
  });
});
