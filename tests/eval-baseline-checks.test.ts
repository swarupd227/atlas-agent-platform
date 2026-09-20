/**
 * An eval baseline's static checks must be checks, not decoration. They used
 * to be five hardcoded "pass" lines with invented messages, produced without
 * looking at anything. Each one now runs for real or says it was not checked.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { runBaselineStaticChecks, findCycle, isHumanNode } from "../server/eval-baseline-checks";

const agent = { id: "ag-1", autonomyMode: "assisted" as string | null, toolsConfig: [] as unknown };
const statusOf = (r: ReturnType<typeof runBaselineStaticChecks>, name: string) => r.checks.find((c) => c.name === name)!;

describe("findCycle", () => {
  const nodes = [{ id: "a" }, { id: "b" }, { id: "c" }];
  it("finds a loop and names the steps on it", () => {
    const cycle = findCycle(nodes, [{ fromNodeId: "a", toNodeId: "b" }, { fromNodeId: "b", toNodeId: "c" }, { fromNodeId: "c", toNodeId: "a" }]);
    expect(cycle).not.toBeNull();
    expect(new Set(cycle!)).toEqual(new Set(["a", "b", "c"]));
  });

  it("accepts a graph that only flows forward, including a diamond", () => {
    expect(findCycle(nodes, [{ fromNodeId: "a", toNodeId: "b" }, { fromNodeId: "b", toNodeId: "c" }])).toBeNull();
    expect(findCycle([...nodes, { id: "d" }], [
      { sourceNodeId: "a", targetNodeId: "b" }, { sourceNodeId: "a", targetNodeId: "c" },
      { sourceNodeId: "b", targetNodeId: "d" }, { sourceNodeId: "c", targetNodeId: "d" },
    ])).toBeNull();
  });
});

describe("isHumanNode", () => {
  it("recognises a step that waits for a person, by type or by config", () => {
    expect(isHumanNode({ id: "1", nodeType: "human_approval" })).toBe(true);
    expect(isHumanNode({ id: "2", nodeType: "hitl_gate" })).toBe(true);
    expect(isHumanNode({ id: "3", nodeType: "internal_agent", config: { isHumanCheckpoint: true } })).toBe(true);
    expect(isHumanNode({ id: "4", nodeType: "internal_agent", config: { requiresApproval: true } })).toBe(true);
    expect(isHumanNode({ id: "5", nodeType: "internal_agent" })).toBe(false);
  });
});

describe("runBaselineStaticChecks", () => {
  it("says what it could not check instead of passing it", () => {
    const r = runBaselineStaticChecks({ agent });
    expect(statusOf(r, "Circular dependencies").status).toBe("not_checked");
    expect(statusOf(r, "Human checkpoint").status).toBe("not_checked");
    expect(statusOf(r, "Policies").status).toBe("not_checked");
    expect(statusOf(r, "Tools").status).toBe("not_checked");
    expect(r.passCount).toBe(0);
    expect(r.notCheckedCount).toBe(5);
  });

  it("fails a blueprint that loops, and passes one that doesn't", () => {
    const nodes = [{ id: "a", label: "Draft" }, { id: "b", label: "Review" }];
    const looping = runBaselineStaticChecks({ agent, nodes, edges: [{ fromNodeId: "a", toNodeId: "b" }, { fromNodeId: "b", toNodeId: "a" }] });
    expect(statusOf(looping, "Circular dependencies")).toMatchObject({ status: "fail" });
    expect(statusOf(looping, "Circular dependencies").message).toContain("Draft");
    expect(looping.failCount).toBe(1);
    const fine = runBaselineStaticChecks({ agent, nodes, edges: [{ fromNodeId: "a", toNodeId: "b" }] });
    expect(statusOf(fine, "Circular dependencies")).toMatchObject({ status: "pass" });
  });

  it("warns when nothing waits for a person, and says so plainly for an autonomous agent", () => {
    const nodes = [{ id: "a", nodeType: "internal_agent" }];
    expect(statusOf(runBaselineStaticChecks({ agent, nodes }), "Human checkpoint").status).toBe("warning");
    const autonomous = runBaselineStaticChecks({ agent: { ...agent, autonomyMode: "full" }, nodes });
    expect(statusOf(autonomous, "Human checkpoint").message).toContain("fully autonomously");
    const gated = runBaselineStaticChecks({ agent, nodes: [...nodes, { id: "b", nodeType: "human_approval" }] });
    expect(statusOf(gated, "Human checkpoint")).toMatchObject({ status: "pass" });
  });

  it("reports the policies that actually resolve", () => {
    expect(statusOf(runBaselineStaticChecks({ agent, appliedPolicies: [] }), "Policies")).toMatchObject({ status: "warning", message: "No policy applies to this agent" });
    expect(statusOf(runBaselineStaticChecks({ agent, appliedPolicies: [{ id: "p1" }, { id: "p2" }] }), "Policies")).toMatchObject({ status: "pass" });
  });

  it("warns when tools are configured but no connector can serve them", () => {
    const withTools = { ...agent, toolsConfig: [{ name: "send_email" }] };
    expect(statusOf(runBaselineStaticChecks({ agent: withTools, linkedConnectorCount: 0 }), "Tools")).toMatchObject({ status: "warning" });
    expect(statusOf(runBaselineStaticChecks({ agent: withTools, linkedConnectorCount: 2 }), "Tools")).toMatchObject({ status: "pass" });
    expect(statusOf(runBaselineStaticChecks({ agent, linkedConnectorCount: 0 }), "Tools")).toMatchObject({ status: "not_checked" });
  });

  it("checks the blueprint's shape", () => {
    expect(statusOf(runBaselineStaticChecks({ agent, blueprintJson: { nodes: [{}, {}] } }), "Blueprint")).toMatchObject({ status: "pass" });
    expect(statusOf(runBaselineStaticChecks({ agent, blueprintJson: { nodes: [] } }), "Blueprint")).toMatchObject({ status: "warning" });
    expect(statusOf(runBaselineStaticChecks({ agent, blueprintJson: { steps: [] } }), "Blueprint")).toMatchObject({ status: "fail" });
  });
});

describe("the baseline job uses them", () => {
  const src = readFileSync(join(__dirname, "..", "server", "worker.ts"), "utf8").replace(/\r\n/g, "\n");
  it("passes the industry's own scoring dimensions to the judge in a Studio run", () => {
    expect(src).toContain("industryDimensions: studioIndustryDims,");
    expect(src).not.toContain("industryDimensions: undefined,");
  });

  it("no longer reports invented passes", () => {
    expect(src).toContain("runBaselineStaticChecks({");
    expect(src).not.toContain("Blueprint JSON conforms to schema v2");
    expect(src).not.toContain("All referenced tools are registered");
    expect(src).not.toContain("Required policies are bound");
  });
});
