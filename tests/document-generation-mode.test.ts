import { describe, it, expect } from "vitest";
import { resolveDocumentMode, documentToolsForSkills, GENERATE_PPTX_TOOL, GENERATE_PDF_TOOL } from "../server/builtin-document-tools";
import { buildCodeExecutionRequestConfig } from "../server/anthropic-code-execution";

/**
 * agents.documentGenerationMode lets a user pick which route an agent takes to
 * produce a document, since steering it by prompt wording ("do not use the
 * generate_pptx tool") is not something a real feature can rely on. "auto"
 * preserves the behaviour that existed before this setting -- these tests
 * pin that the other two modes actually change what happens, not just what
 * is documented.
 */

const docSkill = (over: Record<string, any> = {}) =>
  ({
    id: "s1", name: "PDF & PPTX Generator", status: "active",
    skillKind: "code_execution", codeExecutionApproved: true,
    anthropicSkillIds: ["pptx", "pdf"],
    ...over,
  }) as any;

// A second code-execution skill unrelated to documents, to prove "platform"
// mode narrows only the document skill ids and does not disable code
// execution entirely.
const dataSkill = (over: Record<string, any> = {}) =>
  ({
    id: "s2", name: "Data Analysis", status: "active",
    skillKind: "code_execution", codeExecutionApproved: true,
    anthropicSkillIds: ["xlsx-analysis-custom"],
    ...over,
  }) as any;

describe("resolveDocumentMode", () => {
  it("defaults to auto for null, undefined, and unrecognised values", () => {
    expect(resolveDocumentMode(null)).toBe("auto");
    expect(resolveDocumentMode(undefined)).toBe("auto");
    expect(resolveDocumentMode("")).toBe("auto");
    expect(resolveDocumentMode("bogus")).toBe("auto");
  });

  it("recognises platform and sandbox", () => {
    expect(resolveDocumentMode("platform")).toBe("platform");
    expect(resolveDocumentMode("sandbox")).toBe("sandbox");
  });
});

describe("documentToolsForSkills mode gating", () => {
  it("auto (default) offers the portable tools, same as before this setting existed", () => {
    const tools = documentToolsForSkills([docSkill()]);
    expect(tools.map(t => t.toolName)).toEqual([GENERATE_PPTX_TOOL, GENERATE_PDF_TOOL]);
  });

  it("platform mode also offers the portable tools", () => {
    const tools = documentToolsForSkills([docSkill()], "platform");
    expect(tools.map(t => t.toolName)).toEqual([GENERATE_PPTX_TOOL, GENERATE_PDF_TOOL]);
  });

  it("sandbox mode withholds the portable tools even though the skill grants them", () => {
    // Otherwise a cheaper tool sits right there and the model reaches for it,
    // making the setting advisory rather than a real gate.
    const tools = documentToolsForSkills([docSkill()], "sandbox");
    expect(tools).toEqual([]);
  });
});

describe("buildCodeExecutionRequestConfig excludeDocumentSkills", () => {
  it("includes the document skill ids by default (auto/sandbox behaviour)", () => {
    const cfg = buildCodeExecutionRequestConfig([docSkill()]);
    const ids = cfg?.anthropicContainer.skills.map(s => s.skill_id).sort();
    expect(ids).toEqual(["pdf", "pptx"]);
  });

  it("drops only the document skill ids when platform mode asks for it", () => {
    const cfg = buildCodeExecutionRequestConfig([docSkill(), dataSkill()], undefined, true);
    const ids = cfg?.anthropicContainer.skills.map(s => s.skill_id).sort();
    // The unrelated code-execution skill survives -- "platform" mode narrows
    // document generation specifically, it does not disable code execution.
    expect(ids).toEqual(["xlsx-analysis-custom"]);
  });

  it("returns null when excluding document skills leaves nothing to offer", () => {
    const cfg = buildCodeExecutionRequestConfig([docSkill()], undefined, true);
    expect(cfg).toBeNull();
  });
});
