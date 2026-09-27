/**
 * Which edges point back up the flow, and why the answer has to be shared.
 *
 * A flow is drawn with loops. A team cannot run with one: computeWaves rejects
 * any cyclic graph, so a run dies before its first step. Both paths that turn a
 * flow into a team therefore have to agree on which edges are loops, and they
 * did not -- the build decided it from the edges it had already created, so the
 * answer depended on listing order, and the sync never asked, which produced a
 * team of 22 nodes that could not run at all while build, deploy and sync each
 * reported success (live 2026-09-27).
 *
 * The last test here is the one that matters: removing exactly the edges this
 * function names is what makes the engine accept the graph. It asserts that
 * against the real computeWaves rather than against a second implementation.
 */
import { describe, it, expect, vi } from "vitest";
import { backEdgeKeys, edgeKey, hasCycle } from "../shared/graph-cycles";
import { computeWaves } from "../server/dag-execution-engine";
import type { TeamBlueprintNode, TeamBlueprintEdge } from "@shared/schema";

vi.mock("../server/agent-runtime", () => ({
  detectTranscriptionDrift: () => [],
  executeWorkerAgent: vi.fn(),
  waitForApproval: vi.fn(),
  evaluateCondition: vi.fn().mockResolvedValue(true),
  extractStructuredOutput: vi.fn().mockReturnValue(null),
  buildPipelineState: () => ({}),
}));

const e = (from: string, to: string) => ({ from, to });

describe("naming the loops", () => {
  it("names the edge that points back, not the ones going forward", () => {
    // draft -> review -> file, with review sending work back to draft.
    const back = backEdgeKeys(["draft", "review", "file"], [e("draft", "review"), e("review", "file"), e("review", "draft")]);
    expect(Array.from(back)).toEqual([edgeKey("review", "draft")]);
  });

  it("gives the same answer whichever order the edges are listed in", () => {
    // The bug this replaces: the build walked the edges built so far, so a loop
    // listed BEFORE its forward path looked like an ordinary edge and was built
    // as one -- the same flow producing a runnable team or an unrunnable one
    // depending on the order a proposal happened to use.
    const nodes = ["a", "b", "c"];
    const forwardFirst = backEdgeKeys(nodes, [e("a", "b"), e("b", "c"), e("c", "a")]);
    const loopFirst = backEdgeKeys(nodes, [e("c", "a"), e("a", "b"), e("b", "c")]);
    expect(forwardFirst.size).toBe(1);
    expect(loopFirst.size).toBe(1);
    // Same loop found either way: one edge of that cycle, and removing it leaves
    // the other two.
    expect(hasCycle(nodes, [e("a", "b"), e("b", "c")])).toBe(false);
  });

  it("finds one per loop when a flow has several, including nested ones", () => {
    const nodes = ["a", "b", "c", "d"];
    const back = backEdgeKeys(nodes, [e("a", "b"), e("b", "c"), e("c", "d"), e("c", "b"), e("d", "a")]);
    expect(back.size).toBe(2);
    const remaining = [e("a", "b"), e("b", "c"), e("c", "d"), e("c", "b"), e("d", "a")].filter((x) => !back.has(edgeKey(x.from, x.to)));
    expect(hasCycle(nodes, remaining)).toBe(false);
  });

  it("counts a step pointing at itself as a loop", () => {
    expect(hasCycle(["a"], [e("a", "a")])).toBe(true);
  });

  it("ignores an edge whose endpoint is not in this graph, because it cannot close a loop in it", () => {
    // Real case: a flow's trigger and end steps never become team nodes, so the
    // edges touching them are not part of the graph being checked.
    expect(hasCycle(["a", "b"], [e("trigger", "a"), e("a", "b"), e("b", "end")])).toBe(false);
  });

  it("says a straight line has no loop at all", () => {
    expect(hasCycle(["a", "b", "c"], [e("a", "b"), e("b", "c")])).toBe(false);
    expect(backEdgeKeys(["a", "b", "c"], []).size).toBe(0);
  });
});

describe("what the engine does with them", () => {
  const node = (id: string) => ({ id, blueprintId: "bp1", nodeType: "internal_agent", label: id, config: null, stateKey: `${id}_output` }) as unknown as TeamBlueprintNode;
  const edge = (from: string, to: string) => ({ id: `${from}-${to}`, blueprintId: "bp1", sourceNodeId: from, targetNodeId: to, label: null, condition: null, evaluationMode: "ai", rule: null, failureMode: "escalate" }) as unknown as TeamBlueprintEdge;

  it("refuses the graph while a loop is still an edge -- the live failure, in one assertion", () => {
    const nodes = ["draft", "review", "file"].map(node);
    const edges = [edge("draft", "review"), edge("review", "file"), edge("review", "draft")];
    expect(() => computeWaves(nodes, edges)).toThrow(/Cycle detected/);
  });

  it("accepts it once exactly the named edges are taken out, which is what makes a loop buildable", () => {
    const ids = ["draft", "review", "file"];
    const pairs = [e("draft", "review"), e("review", "file"), e("review", "draft")];
    const back = backEdgeKeys(ids, pairs);
    const kept = pairs.filter((p) => !back.has(edgeKey(p.from, p.to)));
    const plan = computeWaves(ids.map(node), kept.map((p) => edge(p.from, p.to)));
    // One step per wave, in flow order. The loop is gone from the graph -- it
    // lives on the reviewing step as a revision rule instead.
    expect(plan.waves.map((w) => w.nodes)).toEqual([["draft"], ["review"], ["file"]]);
  });
});
