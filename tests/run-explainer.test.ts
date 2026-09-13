import { describe, it, expect } from "vitest";
import { buildRunExplanationContext, renderFactsForPrompt, buildExplanationPrompt, RUN_EXPLAINER_SYSTEM } from "../server/run-explainer";

// Explainability (Initiative 05): the grounded fact-extraction that the LLM
// explanation is built from. The whole point is no fabrication — so these tests
// pin that the context contains exactly what the run recorded, cites node
// labels/ids, and identifies the first failure.

const failedRun = {
  id: "run-1",
  status: "failed",
  totalWaves: 3,
  error: "wave 2 failed",
  totalCostUsd: 0.0123,
  totalToolCalls: 5,
  waveResults: [
    { waveNumber: 1, nodes: [{ nodeId: "n-intake", status: "completed", durationMs: 1200, output: { claimId: "C-9" } }] },
    { waveNumber: 2, nodes: [
      { nodeId: "n-triage", status: "failed", durationMs: 800, error: "Integration 'sap' is not connected" },
      { nodeId: "n-notify", status: "skipped" },
    ] },
  ],
};
const labels = { "n-intake": "Claim Intake", "n-triage": "Triage", "n-notify": "Notify" };

describe("buildRunExplanationContext", () => {
  it("extracts grounded per-node facts from waveResults", () => {
    const ctx = buildRunExplanationContext(failedRun, labels);
    expect(ctx.status).toBe("failed");
    expect(ctx.completedWaves).toBe(2);
    expect(ctx.costUsd).toBeCloseTo(0.0123);
    expect(ctx.nodes).toHaveLength(3);
    const triage = ctx.nodes.find(n => n.nodeId === "n-triage")!;
    expect(triage).toMatchObject({ wave: 2, label: "Triage", status: "failed", error: "Integration 'sap' is not connected" });
    const intake = ctx.nodes.find(n => n.nodeId === "n-intake")!;
    expect(intake.outputPreview).toContain("C-9");
  });

  it("identifies the first failure and classifies failed/skipped", () => {
    const ctx = buildRunExplanationContext(failedRun, labels);
    expect(ctx.firstFailure?.nodeId).toBe("n-triage");
    expect(ctx.failedNodeIds).toEqual(["n-triage"]);
    expect(ctx.skippedNodeIds).toEqual(["n-notify"]);
  });

  it("handles a clean completed run with no failures", () => {
    const ctx = buildRunExplanationContext({ id: "r2", status: "completed", totalWaves: 1, waveResults: [{ waveNumber: 1, nodes: [{ nodeId: "a", status: "completed", output: "done" }] }] });
    expect(ctx.failedNodeIds).toEqual([]);
    expect(ctx.firstFailure).toBeUndefined();
  });

  it("tolerates a run with no wave results", () => {
    const ctx = buildRunExplanationContext({ id: "r3", status: "pending" });
    expect(ctx.nodes).toEqual([]);
    expect(ctx.completedWaves).toBe(0);
  });
});

describe("prompt rendering (grounding)", () => {
  it("renders citeable fact lines and never invents beyond the facts", () => {
    const ctx = buildRunExplanationContext(failedRun, labels);
    const facts = renderFactsForPrompt(ctx);
    expect(facts).toContain('"Triage" (n-triage): failed');
    expect(facts).toContain("Integration 'sap' is not connected");
    expect(facts).toContain("Skipped (untaken branches, normal): n-notify");
    // The prompt embeds the facts and the system prompt forbids fabrication.
    expect(buildExplanationPrompt(ctx)).toContain(facts);
    expect(RUN_EXPLAINER_SYSTEM).toMatch(/ONLY the facts provided/i);
  });

  it("flags a truncated node output", () => {
    const ctx = buildRunExplanationContext({ id: "r4", status: "completed", totalWaves: 1, waveResults: [{ waveNumber: 1, nodes: [{ nodeId: "big", status: "completed", truncated: true, output: "x".repeat(500) }] }] });
    expect(renderFactsForPrompt(ctx)).toContain("[output truncated at model limit]");
  });
});
