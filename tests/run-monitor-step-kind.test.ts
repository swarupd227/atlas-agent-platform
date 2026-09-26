/**
 * What a run's step says it is.
 *
 * Every step that was not an approval gate read "Agent", because the monitor
 * derived its badge from a two-valued kind: gate, or everything else. So a
 * treaty limit compared against a connector's own figures -- no model, thirty
 * milliseconds, no cost -- displayed as "Completed · 30ms · Agent", directly
 * under the figures a person was being asked to act on.
 *
 * That is wrong in the direction that matters. Someone deciding whether to
 * trust a number wants to know whether a model produced it or arithmetic did,
 * and this screen is where they look. It also made a 30ms step look like a
 * model call somebody paid for.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { stepKindLabel, runsWithoutAModel } from "../shared/run-step-kind";

const page = readFileSync(join(__dirname, "..", "client", "src", "pages", "dag-run-monitor.tsx"), "utf8").replace(/\r\n/g, "\n");

describe("what a step in a run says it is", () => {
  it("calls a calculation a calculation, not an agent", () => {
    // The live case: the treaty comparison, which runs no model at all.
    expect(stepKindLabel({ kind: "agent", nodeType: "expression" })).toBe("Calculation");
    expect(stepKindLabel({ kind: "agent", nodeType: "tool_call" })).toBe("System call");
    expect(stepKindLabel({ kind: "agent", nodeType: "knowledge_base" })).toBe("Knowledge lookup");
    expect(stepKindLabel({ kind: "agent", nodeType: "skill" })).toBe("Skill");
  });

  it("still calls an agent an agent, and a gate an approval step", () => {
    expect(stepKindLabel({ kind: "agent", nodeType: "internal_agent" })).toBe("Agent");
    expect(stepKindLabel({ kind: "agent" })).toBe("Agent");
    expect(stepKindLabel({ kind: "gate", nodeType: "edge_gate" })).toBe("Approval step");
    // A gate is an approval step whatever node type it happens to carry.
    expect(stepKindLabel({ kind: "gate", nodeType: "expression" })).toBe("Approval step");
  });

  it("marks only the steps that genuinely cost nothing", () => {
    expect(runsWithoutAModel({ kind: "agent", nodeType: "expression" })).toBe(true);
    expect(runsWithoutAModel({ kind: "agent", nodeType: "tool_call" })).toBe(true);
    // A knowledge lookup embeds its query, so it is cheap, not free. Saying
    // "no model" there would be the same overstatement this exists to correct.
    expect(runsWithoutAModel({ kind: "agent", nodeType: "knowledge_base" })).toBe(false);
    expect(runsWithoutAModel({ kind: "agent", nodeType: "internal_agent" })).toBe(false);
    expect(runsWithoutAModel({ kind: "gate", nodeType: "edge_gate" })).toBe(false);
  });
});

describe("the monitor uses it, and stays otherwise unchanged", () => {
  it("reads the node type from the run's own node config", () => {
    expect(page).toContain("const nodeTypeOf = (nodeId: string): string | undefined => cfg[nodeId]?.nodeType ?? undefined;");
    expect(page).toContain("nodeType: nodeTypeOf(n.nodeId),");
  });

  it("no longer hardcodes the badge", () => {
    expect(page).not.toContain('step.kind === "gate" ? "Approval step" : "Agent"');
    expect(page).toContain("<span>{stepKindLabel(step)}</span>");
  });

  it("leaves kind two-valued, so every gate branch behaves as before", () => {
    // A step that is neither gate nor agent must keep taking the non-gate
    // branch in all of them; widening the union would have changed each one.
    expect(page).toContain('kind: "agent" | "gate";');
    expect((page.match(/kind === "gate"/g) ?? []).length).toBeGreaterThanOrEqual(6);
  });
});
