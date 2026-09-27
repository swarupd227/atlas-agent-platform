/**
 * What the compiler says about a condition that has nothing to choose between,
 * and the loop detection it now shares with the build and the sync.
 *
 * Both come from the same live finding (2026-09-27). Four revisions of an MGA
 * flow each wrote a sentence describing a handoff -- "Pass treaty clause citation
 * to bordereau entry" -- into the CONDITION of an edge that was the only way out
 * of its step. Every run of the team built from it then paid a model call to
 * answer a question with one possible answer, and the flow read as a branch it
 * was not.
 *
 * The fix is deliberately a report, not a rewrite: such a condition still gates
 * the work, so silently moving it to the label would delete a real gate wherever
 * one was meant. The author is told, and decides.
 */
import { describe, it, expect, vi } from "vitest";
import type { ProcessFlowGraph } from "@shared/process-flow";

vi.mock("../server/agent-runtime", () => ({
  detectTranscriptionDrift: () => [],
  executeWorkerAgent: vi.fn(),
  waitForApproval: vi.fn(),
  evaluateCondition: vi.fn().mockResolvedValue(true),
  extractStructuredOutput: vi.fn().mockReturnValue(null),
  buildPipelineState: () => ({}),
}));

const { compileProcessFlow } = await import("../server/process-flow-compile");

const node = (id: string, label: string, type = "take_action") => ({ id, type, label, description: "", actor: "System" });
const flow = (edges: ProcessFlowGraph["edges"], nodes = [node("n1", "Draft endorsement"), node("n2", "Check contract certainty"), node("n3", "File it")]): ProcessFlowGraph =>
  ({ version: 2, name: "Endorsement", nodes, edges } as ProcessFlowGraph);

const codes = (g: ProcessFlowGraph) => compileProcessFlow(g).issues.map((i) => i.code);
const issue = (g: ProcessFlowGraph, code: string) => compileProcessFlow(g).issues.find((i) => i.code === code);

describe("a condition on the only way out of a step", () => {
  it("is reported, with the step, the path and what it actually does", () => {
    const g = flow([
      { id: "e1", from: "n1", to: "n2", condition: "Pass treaty clause citation to bordereau entry" },
      { id: "e2", from: "n2", to: "n3" },
    ]);
    const found = issue(g, "condition_without_choice")!;
    expect(found).toBeTruthy();
    expect(found.edgeId).toBe("e1");
    expect(found.nodeId).toBe("n1");
    expect(found.message).toContain("Draft endorsement");
    expect(found.message).toContain("only one path out");
    // What it costs, and where the words belong if they are a note.
    expect(found.message).toContain("label");
  });

  it("is not reported when the step really does choose between paths", () => {
    const g = flow([
      { id: "e1", from: "n1", to: "n2", condition: "aggregate > 50000000" },
      { id: "e2", from: "n1", to: "n3", condition: "aggregate <= 50000000" },
    ]);
    expect(codes(g)).not.toContain("condition_without_choice");
  });

  it("is not reported for a loop's own edge, where the condition decides whether to send work back", () => {
    // n2 has two exits in the drawing, but the compiler counts the loop edge
    // separately -- and the condition on a loop is the thing that fires it.
    const g = flow([
      { id: "e1", from: "n1", to: "n2" },
      { id: "e2", from: "n2", to: "n3" },
      { id: "e3", from: "n2", to: "n1", condition: "clause check failed" },
    ]);
    const found = compileProcessFlow(g).issues.filter((i) => i.code === "condition_without_choice");
    expect(found.map((i) => i.edgeId)).not.toContain("e3");
  });

  it("leaves the flow itself alone -- the condition is still there to be read", () => {
    const g = flow([
      { id: "e1", from: "n1", to: "n2", condition: "Pass the citation on" },
      { id: "e2", from: "n2", to: "n3" },
    ]);
    compileProcessFlow(g);
    expect(g.edges[0].condition).toBe("Pass the citation on");
    expect(g.edges[0].label).toBeUndefined();
  });
});

describe("the loop the compiler reports", () => {
  it("is the same edge the build and the sync treat as a loop", () => {
    const g = flow([
      { id: "e1", from: "n1", to: "n2" },
      { id: "e2", from: "n2", to: "n3" },
      { id: "e3", from: "n2", to: "n1", label: "Send back" },
    ]);
    const compiled = compileProcessFlow(g);
    expect(compiled.loops).toEqual([{ from: "n2", to: "n1", label: "Send back", condition: undefined }]);
    // And the flow still compiles to a plan: the loop is not a dependency.
    expect(compiled.totalWaves).toBe(3);
  });
});
