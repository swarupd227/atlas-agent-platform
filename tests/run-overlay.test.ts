/**
 * A run painted onto the flow it ran (shared/run-overlay.ts): the state of
 * every step, the branch a decision took, and the probabilities it weighed.
 * The editor draws this on the canvas and the monitor reads the decision from it.
 */
import { describe, it, expect } from "vitest";
import { buildRunOverlay, decisionOutcomeOf, branchMatchesChoice, branchProbability } from "../shared/run-overlay";

const nodes = [
  { id: "intake", label: "Intake", nodeType: "internal_agent" },
  { id: "triage", label: "Triage", nodeType: "decision" },
  { id: "refer", label: "Refer to underwriter", nodeType: "internal_agent" },
  { id: "auto", label: "Auto-approve", nodeType: "internal_agent" },
  { id: "gate", label: "Sign-off", nodeType: "edge_gate" },
  { id: "notify", label: "Notify", nodeType: "internal_agent" },
];
const edges = [
  { id: "e1", sourceNodeId: "intake", targetNodeId: "triage" },
  { id: "e2", sourceNodeId: "triage", targetNodeId: "refer", label: "Refer", evaluationMode: "decision" },
  // No label: the branch is named by its target.
  { id: "e3", sourceNodeId: "triage", targetNodeId: "auto", evaluationMode: "decision" },
  { id: "e4", sourceNodeId: "refer", targetNodeId: "gate" },
  { id: "e5", sourceNodeId: "gate", targetNodeId: "notify" },
];
const plan = { waves: [
  { wave_number: 1, nodes: ["intake"] },
  { wave_number: 2, nodes: ["triage"] },
  { wave_number: 3, nodes: ["refer", "auto"] },
  { wave_number: 4, nodes: ["gate"] },
  { wave_number: 5, nodes: ["notify"] },
] };

const triageOutput = {
  triage: {
    choice: "Refer",
    probabilities: { Refer: 0.82, "Auto-approve": 0.18 },
    confidence: 0.82,
    engine: "jev",
    model: "jev-1.13.0",
    question: "Does this need an underwriter?",
    options: ["Refer", "Auto-approve"],
  },
};

describe("reading a decision out of a step's output", () => {
  it("finds the record under whatever state key it was saved as", () => {
    const d = decisionOutcomeOf(triageOutput);
    expect(d?.choice).toBe("Refer");
    expect(d?.probabilities).toEqual({ Refer: 0.82, "Auto-approve": 0.18 });
    expect(d?.confidence).toBe(0.82);
    expect(d?.engine).toBe("jev");
    expect(d?.question).toBe("Does this need an underwriter?");
    expect(d?.options).toEqual(["Refer", "Auto-approve"]);
  });

  it("is null for ordinary output and for an empty choice", () => {
    expect(decisionOutcomeOf({ summary: "all good" })).toBeNull();
    expect(decisionOutcomeOf({ x: { choice: "  " } })).toBeNull();
    expect(decisionOutcomeOf(null)).toBeNull();
  });

  it("keeps only numeric probabilities and marks a fallback", () => {
    const d = decisionOutcomeOf({ k: { choice: "A", probabilities: { A: 0.5, B: "n/a" }, confidence: null, fallbackReason: "below_threshold", routedToGate: true } });
    expect(d?.probabilities).toEqual({ A: 0.5 });
    expect(d?.confidence).toBeNull();
    expect(d?.fallbackReason).toBe("below_threshold");
    expect(d?.routedToGate).toBe(true);
  });
});

describe("matching a branch to a choice, the way the engine does", () => {
  it("matches by the link's label or the target's label, through the same slug", () => {
    expect(branchMatchesChoice("Refer", "Refer", "Refer to underwriter")).toBe(true);
    expect(branchMatchesChoice("auto approve", undefined, "Auto-Approve")).toBe(true);
    expect(branchMatchesChoice("Refer", "Decline", "Decline it")).toBe(false);
    expect(branchMatchesChoice("", "Refer", "Refer")).toBe(false);
  });

  it("finds the probability the model gave a branch, under the model's own spelling", () => {
    const d = decisionOutcomeOf(triageOutput)!;
    expect(branchProbability(d, "refer", undefined)).toBe(0.82);
    expect(branchProbability(d, undefined, "Auto-approve")).toBe(0.18);
    expect(branchProbability(d, "Decline", "Decline")).toBeUndefined();
    expect(branchProbability({ ...d, probabilities: null }, "Refer", undefined)).toBeUndefined();
  });
});

describe("a finished run on the graph", () => {
  const run = {
    id: "r1",
    status: "completed_with_skips",
    waveResults: [
      { waveNumber: 1, nodes: [{ nodeId: "intake", status: "completed", durationMs: 1200, output: { intake: "ok" } }] },
      { waveNumber: 2, nodes: [{ nodeId: "triage", status: "completed", durationMs: 240, output: triageOutput }] },
      { waveNumber: 3, nodes: [
        { nodeId: "refer", status: "completed", durationMs: 5000, output: { refer: "referred" } },
        { nodeId: "auto", status: "skipped", durationMs: 0, error: "No incoming edge condition was satisfied", output: {} },
      ] },
      { waveNumber: 4, nodes: [{ nodeId: "gate", status: "completed", durationMs: 60000, output: { sign_off: { approved: true } } }] },
      { waveNumber: 5, nodes: [{ nodeId: "notify", status: "completed", durationMs: 800, output: { notify: "sent" } }] },
    ],
  };
  const overlay = buildRunOverlay(run, nodes, edges, plan);

  it("gives every step its state and duration", () => {
    expect(overlay.live).toBe(false);
    expect(overlay.nodes.intake).toMatchObject({ state: "completed", durationMs: 1200 });
    expect(overlay.nodes.auto).toMatchObject({ state: "skipped", error: "No incoming edge condition was satisfied" });
    expect(overlay.nodes.gate.state).toBe("completed");
  });

  it("reads the decision only from a decision step", () => {
    expect(overlay.nodes.triage.decision?.choice).toBe("Refer");
    expect(overlay.nodes.intake.decision).toBeNull();
  });

  it("marks the path taken and prices the decision's branches", () => {
    expect(overlay.edges.e1.taken).toBe(true);
    expect(overlay.edges.e2).toEqual({ taken: true, probability: 0.82 });
    expect(overlay.edges.e3).toEqual({ taken: false, probability: 0.18 });
    expect(overlay.edges.e4.taken).toBe(true);
    expect(overlay.edges.e5.taken).toBe(true);
  });

  it("does not treat an agent's own `choice` field as a branch", () => {
    const o = buildRunOverlay(
      { id: "r2", status: "completed", waveResults: [{ waveNumber: 1, nodes: [{ nodeId: "intake", status: "completed", output: { intake: { choice: "prose" } } }] }] },
      nodes, edges, plan,
    );
    expect(o.nodes.intake.decision).toBeNull();
  });
});

describe("a live run on the graph", () => {
  const stored = [
    { waveNumber: 1, nodes: [{ nodeId: "intake", status: "completed", durationMs: 1200, output: {} }] },
    { waveNumber: 2, nodes: [{ nodeId: "triage", status: "completed", durationMs: 240, output: triageOutput }] },
  ];

  it("shows the wave in flight as working and what follows as not run", () => {
    const o = buildRunOverlay({ id: "r3", status: "running", waveResults: stored }, nodes, edges, plan);
    expect(o.live).toBe(true);
    expect(o.nodes.refer.state).toBe("running");
    expect(o.nodes.auto.state).toBe("running");
    expect(o.nodes.gate.state).toBe("pending");
    expect(o.nodes.notify.state).toBe("pending");
    // The chosen branch is already taken, and the link into a working step is taken too.
    expect(o.edges.e2.taken).toBe(true);
    expect(o.edges.e4.taken).toBe(false);
  });

  it("parks the rest of a wave behind a waiting gate, not as working", () => {
    const o = buildRunOverlay(
      { id: "r4", status: "waiting_approval", waveResults: [...stored, { waveNumber: 3, nodes: [{ nodeId: "refer", status: "completed", durationMs: 10, output: {} }, { nodeId: "auto", status: "skipped", output: {} }] }] },
      nodes, edges, plan,
    );
    expect(o.nodes.gate.state).toBe("waiting");
    expect(o.nodes.notify.state).toBe("pending");
    expect(o.edges.e4.taken).toBe(true);
    expect(o.edges.e5.taken).toBe(false);
  });

  it("copes without a plan: steps not yet reached are simply not run", () => {
    const o = buildRunOverlay({ id: "r5", status: "running", waveResults: stored }, nodes, edges, undefined);
    expect(o.nodes.refer.state).toBe("pending");
    expect(o.nodes.triage.state).toBe("completed");
  });
});
