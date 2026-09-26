/**
 * Changing a flow by describing the change.
 *
 * Drawing one from a description was the easy half. The half people live in is
 * coming back and saying "put a fraud check before the payout" — and the naive
 * way to do that, regenerating from an amended description, is wrong twice:
 * it throws away the positions somebody arranged on the canvas, and it
 * rewrites steps nobody asked about.
 *
 * So a revision is a change set applied to the stored graph. What this file
 * pins is that untouched steps are untouched — same ids, same coordinates —
 * that removing a step heals the path through it rather than severing the
 * flow, and that a step the model couldn't find is reported rather than
 * silently skipped.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { applyChangeSet, findNode } from "../server/process-flow-revise";
import { versionLine } from "../server/process-flow-versions";
import type { ProcessFlowGraph } from "../shared/process-flow";

const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");
const services = read("server", "astra", "services.ts");
const routes = read("server", "routes", "outcomes.ts");
const tool = read("server", "astra", "tools", "process-flow.ts");
const db = read("server", "db.ts");

const flow = (): ProcessFlowGraph => ({
  version: 1,
  name: "Claims",
  nodes: [
    { id: "n1", type: "trigger", label: "Claim arrives", description: "", actor: "System", position: { x: 0, y: 0 } },
    { id: "n2", type: "make_decision", label: "Over £10k?", description: "", actor: "System", position: { x: 240, y: 0 } },
    { id: "n3", type: "take_action", label: "Pay out", description: "", actor: "System", position: { x: 480, y: 0 } },
    { id: "n4", type: "end", label: "Closed", description: "", actor: "System", position: { x: 720, y: 0 } },
  ],
  edges: [
    { id: "e1", from: "n1", to: "n2" },
    { id: "e2", from: "n2", to: "n3", condition: "amount > 10000" },
    { id: "e3", from: "n3", to: "n4" },
  ],
} as ProcessFlowGraph);

describe("adding a step", () => {
  it("splices it in after the step named, and says so", () => {
    const { graph, changed } = applyChangeSet(flow(), { addNodes: [{ label: "Fraud check", type: "ai_reasoning", after: "Claim arrives" }] });
    expect(changed).toEqual(['Adds "Fraud check" after "Claim arrives".']);
    const added = graph.nodes.find((n) => n.label === "Fraud check")!;
    // What left the anchor now leaves the new step: the chain is unbroken.
    expect(graph.edges.find((e) => e.from === "n1")!.to).toBe(added.id);
    expect(graph.edges.find((e) => e.from === added.id)!.to).toBe("n2");
  });

  it("puts it before when that is what was asked", () => {
    const { graph, changed } = applyChangeSet(flow(), { addNodes: [{ label: "Fraud check", before: "Pay out" }] });
    expect(changed[0]).toContain('before "Pay out"');
    const added = graph.nodes.find((n) => n.label === "Fraud check")!;
    expect(graph.edges.find((e) => e.to === added.id)!.from).toBe("n2");
    expect(graph.edges.find((e) => e.from === added.id)!.to).toBe("n3");
  });

  it("leaves every other step exactly where it was", () => {
    const before = flow();
    const { graph } = applyChangeSet(before, { addNodes: [{ label: "Fraud check", after: "n1" }] });
    for (const original of before.nodes) {
      const after = graph.nodes.find((n) => n.id === original.id)!;
      expect(after.label, original.id).toBe(original.label);
      expect(after.position, original.id).toEqual(original.position);
    }
  });

  it("places the new step beside its anchor rather than nowhere", () => {
    const { graph } = applyChangeSet(flow(), { addNodes: [{ label: "Fraud check", after: "n1" }] });
    expect(graph.nodes.find((n) => n.label === "Fraud check")!.position).toEqual({ x: 220, y: 60 });
  });

  it("says when it couldn't find the step it was told to attach to", () => {
    const { changed, skipped } = applyChangeSet(flow(), { addNodes: [{ label: "Fraud check", after: "Underwriting" }] });
    expect(changed).toEqual([]);
    expect(skipped[0]).toContain('there\'s no step called "Underwriting"');
  });
});

describe("removing a step", () => {
  it("heals the path through it instead of severing the flow", () => {
    const { graph, changed } = applyChangeSet(flow(), { removeNodes: ["Pay out"] });
    expect(changed[0]).toContain("joining up what it sat between");
    expect(graph.nodes.find((n) => n.id === "n3")).toBeUndefined();
    expect(graph.edges.some((e) => e.from === "n2" && e.to === "n4")).toBe(true);
    expect(graph.edges.some((e) => e.from === "n3" || e.to === "n3")).toBe(false);
  });

  it("carries the condition of the path that led in", () => {
    const { graph } = applyChangeSet(flow(), { removeNodes: ["n3"] });
    expect(graph.edges.find((e) => e.from === "n2" && e.to === "n4")!.condition).toBe("amount > 10000");
  });
});

describe("paths and conditions", () => {
  it("changes when a branch is taken", () => {
    const { graph, changed } = applyChangeSet(flow(), { setConditions: [{ from: "Over £10k?", to: "Pay out", condition: "amount > 25000" }] });
    expect(changed[0]).toBe('Changes when "Over £10k?" goes to "Pay out": amount > 25000.');
    expect(graph.edges.find((e) => e.from === "n2" && e.to === "n3")!.condition).toBe("amount > 25000");
  });

  it("adds and removes a path by the names people use", () => {
    const added = applyChangeSet(flow(), { addEdges: [{ from: "Over £10k?", to: "Closed", condition: "amount <= 10000" }] });
    expect(added.changed[0]).toContain('Connects "Over £10k?" to "Closed" when amount <= 10000');
    const removed = applyChangeSet(added.graph, { removeEdges: [{ from: "n1", to: "n2" }] });
    expect(removed.changed[0]).toContain('Removes the path from "Claim arrives" to "Over £10k?"');
  });

  it("reports a path that isn't there rather than pretending", () => {
    const { skipped } = applyChangeSet(flow(), { removeEdges: [{ from: "n1", to: "n4" }] });
    expect(skipped[0]).toContain("there isn't one");
  });
});

describe("naming a step", () => {
  it("is by id or by label, because people say the label", () => {
    expect(findNode(flow(), "n2")!.label).toBe("Over £10k?");
    expect(findNode(flow(), "over £10K?")!.id).toBe("n2");
    expect(findNode(flow(), "nope")).toBeUndefined();
  });

  it("renames without touching anything else", () => {
    const { graph, changed } = applyChangeSet(flow(), { renameNodes: [{ node: "n3", label: "Settle the claim" }] });
    expect(changed[0]).toBe('Renames "Pay out" to "Settle the claim".');
    expect(graph.edges).toHaveLength(3);
  });
});

describe("being able to undo it", () => {
  it("keeps a version on every save, from either surface", () => {
    expect(db).toContain("CREATE TABLE IF NOT EXISTS process_flow_versions");
    expect(routes).toContain('via: "Studio"');
    expect(services).toContain('via: "Astra Cowork"');
  });

  it("records the state being replaced for a flow that predates the history", () => {
    // Otherwise the first AI change to an old flow would have nothing behind it.
    expect(services).toContain("As it was before Astra's first change");
  });

  it("makes restoring itself a save, so an undo can be undone", () => {
    expect(routes).toContain("Restored the version from");
    expect(services).toContain("Undid the last change, back to");
  });

  it("reads as a line a person can choose from", () => {
    const line = versionLine({ createdAt: new Date("2026-09-26T09:15:00Z"), via: "Astra Cowork", changeNote: "Added a fraud check", savedBy: "admin" });
    expect(line).toContain("by admin");
    expect(line).toContain("Astra Cowork");
    expect(line).toContain("Added a fraud check");
  });
});

describe("the card", () => {
  it("lists what moves, what it couldn't do, and what the compiler thinks", () => {
    expect(tool).toContain("...plan.changed,");
    expect(tool).toContain("What I couldn't do:");
    expect(tool).toContain("Worth checking after this:");
    expect(tool).toContain("Everything not listed above keeps its place. You can undo this afterwards.");
  });

  it("refuses rather than guessing when nothing resolved", () => {
    expect(tool).toContain("I couldn't see what to change from that. Name the step, and say what should happen before or after it.");
  });
});
