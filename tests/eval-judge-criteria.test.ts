/**
 * The eval judge's criteria through the decision seam (Phase 2, item 6).
 *
 * runLlmJudge keeps its one incumbent call: it gives the overall verdict and
 * the reason the pages show. When dimensions are passed, each criterion is
 * also asked on the site "eval_judge" with the incumbent's own per-criterion
 * answers as the known incumbent, so on the jev route the decision model's
 * confident answers replace them, on shadow they are compared, and on llm they
 * stand. A seam failure leaves the incumbent's answers as they were.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const sets: any[] = [];
const decideManyMock = vi.fn(async (set: any) => {
  sets.push(set);
  // Whatever the caller's incumbent says, unless a test overrides.
  const inc = await set.incumbent(Object.keys(set.questions));
  return Object.fromEntries(Object.keys(set.questions).map((k) => [k, { kind: "noul", answer: inc.answers[k], engine: "llm", mode: "llm", confidence: null, model: inc.model, latencyMs: 0, inputTokens: 0, costUsd: 0 }]));
});
vi.mock("../server/decision-provider", async () => {
  const real = await vi.importActual<typeof import("../server/decision-provider")>("../server/decision-provider");
  return { ...real, decideMany: (set: any) => decideManyMock(set) };
});
vi.mock("../server/llm-provider", () => ({
  completeWithFallback: vi.fn(async () => ({
    content: JSON.stringify({ passed: true, confidence: 0.9, reason: "Covers the disclosure.", dimensions: { compliance: { criteria_results: [{ criterion: "States the broker fee", met: true }, { criterion: "Names the carrier", met: false }] } } }),
    tokensUsed: { prompt: 900, completion: 60, total: 960 }, costUsd: 0.003, actualModel: "claude-sonnet-4-5", toolCalls: [],
  })),
}));
vi.mock("../server/deepeval-bridge", () => ({ measureWithDeepEval: vi.fn() }));

import { runLlmJudge } from "../server/eval-judge";

const dims = [{ id: "compliance", name: "Compliance", scoringCriteria: ["States the broker fee", "Names the carrier"] }];
beforeEach(() => { sets.length = 0; decideManyMock.mockClear(); });

describe("runLlmJudge with dimensions", () => {
  it("asks each criterion through the seam with the incumbent's answers as the known incumbent", async () => {
    const r = await runLlmJudge("fee disclosure", { q: "quote it" }, null, "ctx", "The broker fee is $250.", dims);
    expect(decideManyMock).toHaveBeenCalledTimes(1);
    const set = sets[0];
    expect(set.site).toBe("eval_judge");
    expect(Object.keys(set.questions)).toEqual(["compliance::0", "compliance::1"]);
    expect(set.questions["compliance::1"].instructions).toContain("Names the carrier");
    expect(set.state.actual_output).toBe("The broker fee is $250.");
    const inc = await set.incumbent(["compliance::0", "compliance::1"]);
    expect(inc).toMatchObject({ answers: { "compliance::0": true, "compliance::1": false }, model: "claude-sonnet-4-5", inputTokens: 900, costUsd: 0.003 });
    // The incumbent's verdict and reason are untouched.
    expect(r).toMatchObject({ isPassed: true, confidence: 0.9, reason: "Covers the disclosure." });
    expect(r.dimensionResults).toEqual([{ dimId: "compliance", criteriaResults: [{ criterion: "States the broker fee", met: true }, { criterion: "Names the carrier", met: false }] }]);
    expect(r.criteriaDecidedByModel).toBeUndefined();
  });

  it("takes the decision model's confident answer for a criterion, and counts it", async () => {
    decideManyMock.mockImplementationOnce(async (set: any) => ({
      "compliance::0": { kind: "noul", answer: true, engine: "jev", mode: "jev", confidence: 0.96, model: "jev-1.13.0", latencyMs: 200, inputTokens: 700, costUsd: 0.00003 },
      "compliance::1": { kind: "noul", answer: true, engine: "jev", mode: "jev", confidence: 0.91, model: "jev-1.13.0", latencyMs: 200, inputTokens: 0, costUsd: 0 },
    }));
    const r = await runLlmJudge("fee disclosure", { q: "quote it" }, null, "ctx", "Carrier: Lloyd's. The broker fee is $250.", dims);
    expect(r.dimensionResults![0].criteriaResults.map((c) => c.met)).toEqual([true, true]);
    expect(r.criteriaDecidedByModel).toBe(2);
    expect(r.isPassed).toBe(true);
  });

  it("keeps the incumbent's answers when the seam fails", async () => {
    decideManyMock.mockRejectedValueOnce(new Error("Jev HTTP 529"));
    const r = await runLlmJudge("fee disclosure", { q: "quote it" }, null, "ctx", "The broker fee is $250.", dims);
    expect(r.dimensionResults![0].criteriaResults.map((c) => c.met)).toEqual([true, false]);
    expect(r.criteriaDecidedByModel).toBeUndefined();
  });

  it("does not go to the seam without dimensions", async () => {
    const r = await runLlmJudge("fee disclosure", { q: "quote it" }, null, "ctx", "The broker fee is $250.");
    expect(decideManyMock).not.toHaveBeenCalled();
    expect(r.isPassed).toBe(true);
  });
});
