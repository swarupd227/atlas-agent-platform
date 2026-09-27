/**
 * A run that decides nothing and calls itself a success.
 *
 * `execute()` already detects this (routingDeadEndNodeIds, 8ba2735): a node
 * that completed, branches, and whose every branch target was skipped means the
 * run stopped there having taken no path at all. It sets success = false, and
 * deriveRunStatus turns that into "failed".
 *
 * Live 2026-09-27 it did not fire. Run 925ee58d on the E&S underwriting team
 * reached "Endorsement Decision Router" (nodeType expression, emitting
 * {"route":"escalate"}), whose two outgoing edges read "Endorsement approved"
 * and "Endorsement rejected". Neither matched, both targets were skipped along
 * with the nine steps behind them -- no policy bound, no bordereau filed -- and
 * the run reported completed_with_skips. Verified by node id against the
 * blueprint: the router `completed`, both targets `skipped`.
 *
 * These tests pin the detector against that shape, so that whatever the live
 * gap turns out to be, the engine's own behaviour is nailed down first.
 */
import { describe, it, expect, vi } from "vitest";
import { computeWaves, DAGExecutionEngine, deriveRunStatus } from "../server/dag-execution-engine";
import type { TeamBlueprintNode, TeamBlueprintEdge } from "@shared/schema";

vi.mock("../server/agent-runtime", () => ({
  detectTranscriptionDrift: () => [],
  executeWorkerAgent: vi.fn().mockResolvedValue({ success: true, output: "ok" }),
  waitForApproval: vi.fn(),
  evaluateCondition: vi.fn().mockResolvedValue(true),
  extractStructuredOutput: vi.fn().mockReturnValue(null),
  buildPipelineState: (outputs: Map<string, string>, labels: Map<string, string>) => {
    const state: Record<string, any> = {};
    for (const [nodeId, text] of Array.from(outputs.entries())) {
      const label = labels.get(nodeId) || nodeId;
      try { Object.assign(state, JSON.parse(text)); } catch { state[label] = text; }
    }
    return state;
  },
}));

function node(overrides: Partial<TeamBlueprintNode>): TeamBlueprintNode {
  return {
    id: "n1", blueprintId: "bp1", nodeType: "internal_agent", label: "Node",
    positionX: 0, positionY: 0, refAgentId: "agent-1", refRemoteAgentId: null,
    refToolIds: [], refPolicyId: null, gateType: null, config: null,
    createdAt: new Date(), stateKey: "node_output", outputSchema: null,
    fallbackOutput: null, timeoutMs: 30000, retryPolicy: null,
    refTeamAgentId: null, outputContractId: null, refSkillId: null,
    ...overrides,
  } as TeamBlueprintNode;
}
function edge(overrides: Partial<TeamBlueprintEdge>): TeamBlueprintEdge {
  return {
    id: "e1", blueprintId: "bp1", sourceNodeId: "n1", targetNodeId: "n2",
    label: null, contentPartTypes: [], allowedMetadata: null, slaTimeoutMs: null,
    failureMode: null, retryPolicy: null, condition: null, evaluationMode: "ai",
    rule: null, config: null,
    ...overrides,
  } as unknown as TeamBlueprintEdge;
}

/** The live shape: one step branching two ways, neither branch satisfied. */
function deadEndPlan() {
  const router = node({ id: "router", label: "Endorsement Decision Router", stateKey: "router_out", refAgentId: "agent-router" });
  const approved = node({ id: "approved", label: "Filing Requirements Lookup", stateKey: "filing_out", refAgentId: "agent-filing" });
  const rejected = node({ id: "rejected", label: "Senior Underwriter Escalation", stateKey: "escalation_out", refAgentId: "agent-escalation" });
  return computeWaves([router, approved, rejected], [
    edge({ id: "e-app", sourceNodeId: "router", targetNodeId: "approved", condition: "Endorsement approved" }),
    edge({ id: "e-rej", sourceNodeId: "router", targetNodeId: "rejected", condition: "Endorsement rejected" }),
  ]);
}

describe("a step that decides nothing", () => {
  it("does not let the run call itself a success", async () => {
    const { executeWorkerAgent, evaluateCondition } = await import("../server/agent-runtime");
    (executeWorkerAgent as any).mockImplementation(async () => ({ success: true, output: JSON.stringify({ route: "escalate" }) }));
    // Neither branch's wording matches what the step emitted.
    (evaluateCondition as any).mockResolvedValue(false);

    const engine = new DAGExecutionEngine();
    const result = await engine.execute({
      executionPlan: deadEndPlan(), stateSchema: {}, initialState: {},
      errorStrategy: "best_effort", teamAgentId: "team-1",
    } as any);

    const router = result.waveResults.flatMap((w) => w.nodes).find((n) => n.nodeId === "router");
    expect(router?.status).toBe("completed");
    expect(result.skippedNodeIds).toEqual(expect.arrayContaining(["approved", "rejected"]));

    // The claim under test: the run took no path at all, so it is not a success.
    expect(result.routingDeadEndNodeIds).toEqual(["router"]);
    expect(result.success).toBe(false);
    expect(deriveRunStatus(result)).toBe("failed");
  });

  it("leaves an ordinary not-taken branch alone", async () => {
    // One branch matches: the other being skipped is normal routing, not a
    // dead end. This is most of every healthy run and must stay green.
    const { executeWorkerAgent, evaluateCondition } = await import("../server/agent-runtime");
    (executeWorkerAgent as any).mockImplementation(async () => ({ success: true, output: JSON.stringify({ route: "approve" }) }));
    (evaluateCondition as any).mockImplementation(async (condition: string) => /approved/i.test(String(condition)));

    const engine = new DAGExecutionEngine();
    const result = await engine.execute({
      executionPlan: deadEndPlan(), stateSchema: {}, initialState: {},
      errorStrategy: "best_effort", teamAgentId: "team-1",
    } as any);

    expect(result.skippedNodeIds).toEqual(["rejected"]);
    expect(result.routingDeadEndNodeIds ?? []).toEqual([]);
    expect(result.success).toBe(true);
    expect(deriveRunStatus(result)).toBe("completed_with_skips");
  });
});

/**
 * The boundary: how many unsatisfied branches make a dead end.
 *
 * Making the detector live turned dag-conditional-edges' "skips (not fails) a
 * node whose deterministic gating rule fails" red, and that test was right. A
 * single conditional edge that does not fire is an ordinary stop -- "below the
 * threshold, so no approval is needed" -- and has been a success since before
 * the detector existed. What went wrong live was a step with TWO branches and
 * no answer: it was there to choose, and chose nothing.
 */
describe("how many unsatisfied branches make a dead end", () => {
  it("leaves a single conditional edge that does not fire as a success", async () => {
    const check = node({ id: "check", label: "Amount Check", stateKey: "check_out", refAgentId: "agent-check" });
    const gate = node({ id: "approval", label: "Approval", stateKey: "approval_out", refAgentId: "agent-approval" });
    const plan = computeWaves([check, gate], [
      edge({ sourceNodeId: "check", targetNodeId: "approval", evaluationMode: "deterministic",
             rule: { combinator: "AND", conditions: [{ field: "amount", operator: ">", value: 10000 }] } as any }),
    ]);

    const { executeWorkerAgent } = await import("../server/agent-runtime");
    (executeWorkerAgent as any).mockImplementation(async () => ({ success: true, output: JSON.stringify({ amount: 500 }) }));

    const engine = new DAGExecutionEngine();
    const result = await engine.execute({
      executionPlan: plan, stateSchema: {}, initialState: {},
      errorStrategy: "best_effort", teamAgentId: "team-1",
    } as any);

    expect(result.skippedNodeIds).toEqual(["approval"]);
    expect(result.routingDeadEndNodeIds ?? []).toEqual([]);
    expect(result.success).toBe(true);
  });
});
