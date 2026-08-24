import { describe, it, expect, vi, beforeEach } from "vitest";

const createAgentGeneratedFile = vi.fn();
vi.mock("../server/storage", () => ({
  storage: { createAgentGeneratedFile: (...a: any[]) => createAgentGeneratedFile(...a) },
}));

const {
  documentToolsForSkills,
  executeBuiltinDocumentTool,
  isBuiltinDocumentTool,
  skillGrantsDocumentGeneration,
  GENERATE_PPTX_TOOL,
  GENERATE_PDF_TOOL,
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
    createAgentGeneratedFile.mockResolvedValue({ id: "file-1", filename: "q3-marketing-campaign.pptx", mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation" });
  });

  it("offers both tools to an agent holding the document skill", () => {
    const tools = documentToolsForSkills([skill()]);
    expect(tools.map(t => t.toolName)).toEqual([GENERATE_PPTX_TOOL, GENERATE_PDF_TOOL]);
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
