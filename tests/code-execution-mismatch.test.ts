import { describe, it, expect } from "vitest";
import { describeCodeExecutionModelMismatch, modelSupportsCodeExecution } from "../server/anthropic-code-execution";

const codeExecSkill = (over: Record<string, any> = {}) =>
  ({ id: "s1", name: "PDF & PPTX Generator", skillKind: "code_execution", codeExecutionApproved: true, anthropicSkillIds: ["pptx", "pdf"], ...over }) as any;

describe("code-execution model mismatch", () => {
  it("recognises only Claude models as able to run code execution", () => {
    expect(modelSupportsCodeExecution("claude-sonnet-4-5")).toBe(true);
    expect(modelSupportsCodeExecution("gpt-4o")).toBe(false);
    expect(modelSupportsCodeExecution(null)).toBe(false);
  });

  it("warns when nothing else covers the capability", () => {
    const r = describeCodeExecutionModelMismatch([codeExecSkill()], "gpt-4o", false);
    expect(r?.severity).toBe("warning");
    expect(r?.message).toMatch(/switch the agent to a claude model/i);
  });

  it("is informational, and never advises switching models, once the portable renderer covers it", () => {
    // Advising a switch here would move them off a path that already works --
    // the gpt-4o agent generates a real .pptx through the platform renderer.
    const r = describeCodeExecutionModelMismatch([codeExecSkill()], "gpt-4o", true);
    expect(r?.severity).toBe("info");
    expect(r?.message).not.toMatch(/switch/i);
    expect(r?.message).toMatch(/platform renderer/i);
  });

  it("says nothing when the model can run code execution, or no skill needs it", () => {
    expect(describeCodeExecutionModelMismatch([codeExecSkill()], "claude-sonnet-4-5", false)).toBeNull();
    expect(describeCodeExecutionModelMismatch([], "gpt-4o", false)).toBeNull();
    expect(describeCodeExecutionModelMismatch([codeExecSkill({ codeExecutionApproved: false })], "gpt-4o", false)).toBeNull();
  });
});
