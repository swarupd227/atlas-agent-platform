/**
 * Promoted fields carry provenance and reach a step only where their source
 * step's output does; the orchestrator's fields are not promoted at all; an
 * approval gate says what it approved.
 *
 * Live 2026-10-19 (J2 run 8c697d65): the orchestrator pre-decided a carrier in
 * wave one, the comparison step recommended the other one, a person approved
 * the comparison, and every later step delivered the orchestrator's pick --
 * because both recommendations sat at the top level of run state, unscoped and
 * unattributed, and the gate's output said only "approved: true".
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

vi.mock("../server/agent-runtime", () => ({
  detectTranscriptionDrift: () => [],
  executeWorkerAgent: vi.fn(),
  waitForApproval: vi.fn(),
  evaluateCondition: vi.fn(),
  extractStructuredOutput: vi.fn((text: string) => { try { return JSON.parse(text); } catch { return null; } }),
  buildPipelineState: () => ({}),
}));
vi.mock("../server/storage", () => ({ storage: { getDagStateSchemaByTeamAgent: vi.fn(async () => null) } }));

import { mergeWaveOutputs, buildAgentInput, computeWaves, orchestratorStateKeys, PROMOTED_FIELDS_STATE_KEY } from "../server/dag-execution-engine";

const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");
const result = (nodeId: string, stateKey: string, text: string) => ({ nodeId, agentId: "a", status: "completed" as const, output: { [stateKey]: text }, durationMs: 1, promptTokens: 0, completionTokens: 0, traceId: "" }) as any;

describe("mergeWaveOutputs: promotion with provenance", () => {
  it("promotes a step's fields with the step they came from, last writer winning both the value and the provenance", () => {
    const s1 = mergeWaveOutputs({}, [result("orch", "orchestrator", '{"recommended_carrier":"Gulf Mutual","market":"hard"}')], {});
    expect(s1.recommended_carrier).toBe("Gulf Mutual");
    expect(s1[PROMOTED_FIELDS_STATE_KEY]).toEqual({ recommended_carrier: "orchestrator", market: "orchestrator" });
    const s2 = mergeWaveOutputs(s1, [result("cmp", "compare_quotes", '{"recommendedCarrier":"Magnolia","market":"hardening"}')], {});
    expect(s2.market).toBe("hardening");
    expect(s2[PROMOTED_FIELDS_STATE_KEY]).toEqual({ recommended_carrier: "orchestrator", market: "compare_quotes", recommendedCarrier: "compare_quotes" });
    // The slug-keyed text is untouched and prose promotes nothing.
    expect(s2.compare_quotes).toContain("Magnolia");
    const s3 = mergeWaveOutputs(s2, [result("n", "notice", "Dear risk manager, the notice is ready.")], {});
    expect(s3[PROMOTED_FIELDS_STATE_KEY]).toEqual(s2[PROMOTED_FIELDS_STATE_KEY]);
  });

  it("does not promote the fields of a step named in noPromotion, but still keeps its own key", () => {
    const s = mergeWaveOutputs({}, [
      result("orch", "orchestrator", '{"recommended_carrier":"Gulf Mutual"}'),
      result("cmp", "compare_quotes", '{"recommendedCarrier":"Magnolia"}'),
    ], {}, new Set(["orchestrator"]));
    expect(s.recommended_carrier).toBeUndefined();
    expect(s.orchestrator).toContain("Gulf Mutual");
    expect(s.recommendedCarrier).toBe("Magnolia");
    expect(s[PROMOTED_FIELDS_STATE_KEY]).toEqual({ recommendedCarrier: "compare_quotes" });
  });
});

describe("computeWaves: the orchestrator node is marked", () => {
  it("reads config.role and lists the orchestrator's state key", () => {
    const base = { blueprintId: "bp", nodeType: "internal_agent", positionX: 0, positionY: 0, refAgentId: "ag", refRemoteAgentId: null, refTeamAgentId: null, stateKey: null, outputSchema: null, fallbackOutput: null, timeoutMs: null, retryPolicy: null, gateType: null, refToolIds: null, config: null };
    const plan = computeWaves([
      { ...base, id: "o", label: "Orchestrator", config: { role: "orchestrator", pattern: "supervisor" } } as any,
      { ...base, id: "w", label: "Compare Quotes" } as any,
    ], [{ id: "e", blueprintId: "bp", sourceNodeId: "o", targetNodeId: "w", condition: null, evaluationMode: null, rule: null, label: null, failureMode: null } as any]);
    expect(plan.nodeConfig.o.isOrchestrator).toBe(true);
    expect(plan.nodeConfig.w.isOrchestrator).toBe(false);
    expect([...orchestratorStateKeys(plan)]).toEqual(["orchestrator"]);
  });
});

describe("buildAgentInput: what a later step is shown", () => {
  const state = {
    request: "Place the programme.",
    orchestrator: '{"recommended_carrier":"Gulf Mutual"}',
    compare_quotes: '{"recommendedCarrier":"Magnolia"}',
    notice: undefined,
    recommended_carrier: "Gulf Mutual",
    recommendedCarrier: "Magnolia",
    legacy_input: "given at the start, no provenance",
    [PROMOTED_FIELDS_STATE_KEY]: { recommended_carrier: "orchestrator", recommendedCarrier: "compare_quotes" },
  };
  const scope = { visible: new Set(["compare_quotes", "notice"]), owned: new Set(["orchestrator", "compare_quotes", "notice"]) };
  const nc = { label: "Prepare Notice", stateKey: "notice" } as any;

  it("shows a promoted field only when the step it came from is visible, and never the provenance map itself", () => {
    const text = buildAgentInput("n", state, nc, state.request, undefined, undefined, undefined, undefined, undefined, undefined, scope);
    expect(text).toContain("## STATE: recommendedCarrier");
    expect(text).toContain("## STATE: compare_quotes");
    expect(text).not.toContain("## STATE: recommended_carrier");
    expect(text).not.toContain("## STATE: orchestrator");
    expect(text).not.toContain("__promoted");
    // A field with no provenance (run input) is shown as before.
    expect(text).toContain("## STATE: legacy_input");
    expect(text).not.toContain("FRAME AND DELEGATE");
  });

  it("tells the orchestrator to frame and delegate rather than decide", () => {
    const text = buildAgentInput("o", { request: "Place the programme." }, { label: "Orchestrator", stateKey: "orchestrator", isOrchestrator: true } as any, "Place the programme.");
    expect(text).toContain("## YOUR PART: FRAME AND DELEGATE");
    expect(text).toContain("nothing you conclude here is the decision");
  });
});

describe("the approval gate names what it approved", () => {
  it("writes decidedOn, approvedOutput and the standing sentence onto its output", () => {
    const engine = read("server", "dag-execution-engine.ts");
    expect(engine).toContain("decidedOn: upstreamKeys,");
    expect(engine).toContain("...(result.approved ? approvedDecision : { reason: result.reason || undefined }) } }");
    expect(engine).toContain("This is the decision that stands.");
  });
  it("the drafted orchestrator prompt says the same", () => {
    expect(read("server", "team-build.ts")).toContain("do not produce them yourself, and never state a verdict a later step or a person is there to decide");
  });
});
