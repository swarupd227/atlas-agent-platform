/**
 * Claim versus facts (Phase 2, item 5).
 *
 * A review step that pronounces a verdict, in a run that holds verified facts
 * or a failed file attempt, is asked one question through the decision seam:
 * does the verdict agree with them? A "no" is appended to the step's output the
 * way a transcription drift is, and recorded as a judgment on the step. It
 * fails the step only when the step is set to and the check is sure enough
 * (Phase 3, item 10); it is not asked when there is no verdict or nothing to
 * check it against.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { computeWaves, DAGExecutionEngine, VERDICT_RE } from "../server/dag-execution-engine";
import type { TeamBlueprintNode, TeamBlueprintEdge } from "@shared/schema";
import { stepCorrelation, stepUnchanged } from "../shared/process-flow-correlation";
import { resolveDecisionRoute } from "../server/decision-settings";

const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");

const worker = { output: "## QA: PASS\n\nThe deck has 12 slides and no overflow.", verifiedFacts: undefined as Record<string, unknown> | undefined, failedFileAttempts: undefined as string[] | undefined };
vi.mock("../server/agent-runtime", () => ({
  detectTranscriptionDrift: () => [],
  executeWorkerAgent: vi.fn(async () => ({ success: true, output: worker.output, verifiedFacts: worker.verifiedFacts, failedFileAttempts: worker.failedFileAttempts })),
  waitForApproval: vi.fn().mockResolvedValue({ approved: true, decidedBy: "admin", approvalId: "a1" }),
  evaluateCondition: vi.fn().mockResolvedValue(true),
  extractStructuredOutput: vi.fn().mockReturnValue(null),
  buildPipelineState: () => ({}),
}));
const decideMock = vi.fn(async (_req: any) => ({ kind: "noul", answer: false, probabilities: { true: 0.08, false: 0.92 }, confidence: 0.84, engine: "jev", mode: "jev", model: "jev-1.13.0", latencyMs: 200, inputTokens: 700, costUsd: 0.00003 }));
vi.mock("../server/decision-provider", () => ({ decide: (req: any) => decideMock(req) }));
vi.mock("../server/decision-settings", () => ({
  resolveDecisionRoute: vi.fn(async () => ({ mode: "jev", threshold: 0.85, reason: "platform" })),
  DEFAULT_THRESHOLDS: { review: 0.6, act: 0.85 },
  getDecisionSettings: vi.fn(async () => ({ mode: "jev", thresholds: { review: 0.6, act: 0.85 }, siteOverrides: {}, stepKind: true })),
}));

function node(overrides: Partial<TeamBlueprintNode>): TeamBlueprintNode {
  return {
    id: "n1", blueprintId: "bp1", nodeType: "internal_agent", label: "Node", positionX: 0, positionY: 0,
    refAgentId: "agent-1", refRemoteAgentId: null, refToolIds: [], refPolicyId: null, gateType: null, config: null,
    createdAt: new Date(), stateKey: "node_output", outputSchema: null, fallbackOutput: null, timeoutMs: 30000,
    retryPolicy: null, refTeamAgentId: null, outputContractId: null, refSkillId: null, ...overrides,
  } as TeamBlueprintNode;
}
const plan = (config: Record<string, unknown> | null = null) => computeWaves([node({ id: "qa", label: "QA the deck", stateKey: "qa", refAgentId: "agent-qa", config: config as any })], [] as TeamBlueprintEdge[]);
const run = () => new DAGExecutionEngine().execute({ executionPlan: plan(), stateSchema: {}, initialState: { request: "check the deck" }, errorStrategy: "best_effort", teamAgentId: "team-1", organizationId: "org-9" } as any);
const qa = (result: any) => result.waveResults.flatMap((w: any) => w.nodes).find((n: any) => n.nodeId === "qa");

beforeEach(() => {
  decideMock.mockClear();
  worker.output = "## QA: PASS\n\nThe deck has 12 slides and no overflow.";
  worker.verifiedFacts = { inspect_document: { slides: 12, overflows: 10 } };
  worker.failedFileAttempts = undefined;
});

describe("a verdict the facts contradict", () => {
  it("is asked through the seam with the verdict, the output, the facts and the file outcomes", async () => {
    await run();
    expect(decideMock).toHaveBeenCalledTimes(1);
    const req = decideMock.mock.calls[0][0];
    expect(req).toMatchObject({ kind: "noul", site: "claim_vs_facts", orgId: "org-9", subject: "QA the deck" });
    expect(req.state.verdict).toBe("## QA: PASS");
    expect(req.state.verified_facts).toEqual({ inspect_document: { slides: 12, overflows: 10 } });
    expect(req.state.failed_file_attempts).toEqual([]);
    expect(req.instructions).toContain('the verdict "## QA: PASS"');
  });

  it("is marked on the output and recorded as a judgment, and the step still completes", async () => {
    const result = await run();
    const n = qa(result);
    expect(n.status).toBe("completed");
    expect(n.output.qa).toContain("VERDICT DISAGREES WITH THE FACTS");
    expect(n.output.qa).toContain('The verdict "## QA: PASS" is contradicted by the run\'s verified facts or file outcomes (the decision model, 92% that it does not).');
    expect(n.judgments).toEqual([{ kind: "facts", subject: "Verdict against the verified facts", ok: false, evidence: expect.stringContaining("is contradicted") }]);
    expect(result.success).toBe(true);
  });
});

describe("a verdict the facts support", () => {
  it("is recorded as a judgment that passed, with nothing appended", async () => {
    decideMock.mockImplementationOnce(async () => ({ kind: "noul", answer: true, probabilities: { true: 0.97, false: 0.03 }, confidence: 0.94, engine: "jev", mode: "jev", model: "jev-1.13.0", latencyMs: 200, inputTokens: 700, costUsd: 0.00003 }));
    const result = await run();
    const n = qa(result);
    expect(n.output.qa).not.toContain("VERDICT DISAGREES");
    expect(n.judgments).toEqual([{ kind: "facts", subject: "Verdict against the verified facts", ok: true, evidence: expect.stringContaining("is consistent") }]);
  });
});

describe("when there is nothing to ask", () => {
  it("skips a step whose output carries no verdict", async () => {
    worker.output = "Here is a summary of the deck. It looks complete.";
    const result = await run();
    expect(decideMock).not.toHaveBeenCalled();
    expect(qa(result).judgments).toBeUndefined();
  });

  it("skips a verdict with no facts and no file outcomes to check it against", async () => {
    worker.verifiedFacts = undefined;
    await run();
    expect(decideMock).not.toHaveBeenCalled();
  });

  it("asks when a file attempt failed even without connector facts", async () => {
    worker.verifiedFacts = undefined;
    worker.failedFileAttempts = ["build_deck: the sandbox produced no file"];
    await run();
    expect(decideMock).toHaveBeenCalledTimes(1);
    expect(decideMock.mock.calls[0][0].state.failed_file_attempts).toEqual(["build_deck: the sandbox produced no file"]);
  });

  it("never fails the step when the seam cannot answer", async () => {
    decideMock.mockRejectedValueOnce(new Error("Jev HTTP 529"));
    const result = await run();
    const n = qa(result);
    expect(n.status).toBe("completed");
    expect(n.output.qa).not.toContain("VERDICT DISAGREES");
    expect(n.judgments).toBeUndefined();
  });
});

describe("one definition of a verdict", () => {
  it("is shared with the approval gate's evidence", () => {
    expect("## QA: PASS".match(VERDICT_RE)?.[0]).toBe("## QA: PASS");
    expect("# Review verdict: REJECTED because".match(VERDICT_RE)?.[0]).toBe("# Review verdict: REJECTED because");
    expect("passed the review".match(VERDICT_RE)).toBeNull();
    const engine = read("server", "dag-execution-engine.ts");
    expect(engine.match(/const VERDICT_RE = /g)).toHaveLength(1);
    expect(engine).toContain("const verdictLine = text.match(VERDICT_RE)?.[0]?.trim();");
  });
});

describe("a step set to fail on it (Phase 3, item 10)", () => {
  const strict = () => new DAGExecutionEngine().execute({ executionPlan: plan({ factsCheck: "fail" }), stateSchema: {}, initialState: { request: "check the deck" }, errorStrategy: "best_effort", teamAgentId: "team-1", organizationId: "org-9" } as any);

  it("fails the step, with the disagreement as the error, when the check is sure enough to act on", async () => {
    const result = await strict();
    const n = qa(result);
    expect(n.status).toBe("failed");
    expect(n.error).toBe('The verdict "## QA: PASS" disagrees with the run\'s verified facts: The verdict "## QA: PASS" is contradicted by the run\'s verified facts or file outcomes (the decision model, 92% that it does not).');
    expect(n.output).toEqual({});
    expect(n.judgments).toEqual([{ kind: "facts", subject: "Verdict against the verified facts", ok: false, evidence: expect.stringMatching(/is contradicted .* This step is set to fail on it, and did\.$/) }]);
    expect(result.success).toBe(false);
  });

  it("asks the site's act threshold, for the organization", async () => {
    await strict();
    expect(resolveDecisionRoute).toHaveBeenCalledWith("claim_vs_facts", "org-9");
  });

  it("flags instead when the check is below the act threshold, and says so", async () => {
    decideMock.mockResolvedValueOnce({ kind: "noul", answer: false, probabilities: { true: 0.3, false: 0.7 }, confidence: 0.4, engine: "jev", mode: "jev", model: "jev-1.13.0", latencyMs: 200, inputTokens: 700, costUsd: 0.00003 });
    const result = await strict();
    const n = qa(result);
    expect(n.status).toBe("completed");
    expect(n.output.qa).toContain("VERDICT DISAGREES WITH THE FACTS");
    expect(n.judgments[0].evidence).toContain("This step is set to fail on it, but the check is not sure enough to act on (70% against the 85% needed), so it is flagged.");
  });

  it("flags instead when the answer came with no probability", async () => {
    decideMock.mockResolvedValueOnce({ kind: "noul", answer: false, confidence: null, engine: "llm", mode: "jev", model: "gpt-4.1", latencyMs: 900, inputTokens: 700, costUsd: 0.001, fallbackReason: "jev_error" });
    const n = qa(await strict());
    expect(n.status).toBe("completed");
    expect(n.judgments[0].evidence).toContain("(no probability came back), so it is flagged.");
  });

  it("does not fail a verdict the facts support, and leaves a step set to flag alone", async () => {
    decideMock.mockResolvedValueOnce({ kind: "noul", answer: true, probabilities: { true: 0.97, false: 0.03 }, confidence: 0.94, engine: "jev", mode: "jev", model: "jev-1.13.0", latencyMs: 200, inputTokens: 700, costUsd: 0.00003 });
    expect(qa(await strict()).status).toBe("completed");
    const flagged = qa(await run());
    expect(flagged.status).toBe("completed");
    expect(flagged.judgments[0].evidence).not.toContain("set to fail");
  });

  it("falls back to the platform act threshold when the settings cannot be read", async () => {
    vi.mocked(resolveDecisionRoute).mockRejectedValueOnce(new Error("settings unavailable"));
    expect(qa(await strict()).status).toBe("failed");
  });
});

describe("where the setting lives", () => {
  it("is part of what a blueprint node remembers about its step, so a change reaches the team on the next sync", () => {
    const step = { id: "s1", label: "QA the deck", type: "ai_reasoning", config: { factsCheck: "fail" } };
    expect(stepCorrelation(step).factsCheck).toBe("fail");
    expect(stepCorrelation({ ...step, config: {} }).factsCheck).toBe("flag");
    expect(stepUnchanged(stepCorrelation(step), step)).toBe(true);
    expect(stepUnchanged(stepCorrelation({ ...step, config: {} }), step)).toBe(false);
    // A node written before the setting existed reads as "flag", the default.
    expect(stepUnchanged({ ...stepCorrelation({ ...step, config: {} }), factsCheck: undefined }, { ...step, config: {} })).toBe(true);
  });

  it("is read by the engine from the node's config, and set from both editors", () => {
    expect(read("server", "dag-execution-engine.ts")).toContain('factsCheck: (node.config as any)?.factsCheck === "fail" ? "fail" : "flag",');
    expect(read("client", "src", "components", "flow-graph-canvas.tsx")).toContain('data-testid="select-node-facts-check"');
    expect(read("client", "src", "pages", "team-graph-editor.tsx")).toContain('data-testid="select-facts-check"');
  });
});
