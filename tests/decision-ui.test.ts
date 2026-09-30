/**
 * The decision step on every surface an author or reader meets it (Phase 1,
 * week 3): the studio inspector, the studio's step plan, the team-graph
 * editor's palette, node panel and link panel, the run overlay on that
 * canvas, and the run monitor's decision block.
 *
 * Source-text checks pin the seams the pages must keep; the behaviour behind
 * them is unit-tested in run-overlay.test.ts and decision-kind.test.ts.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");
const studioCanvas = read("client", "src", "components", "flow-graph-canvas.tsx");
const studioPage = read("client", "src", "pages", "process-flows.tsx");
const editor = read("client", "src", "pages", "team-graph-editor.tsx");
const teamCanvas = read("client", "src", "components", "team-graph-canvas.tsx");
const nodeMeta = read("client", "src", "lib", "team-graph-node-meta.ts");
const monitor = read("client", "src", "pages", "dag-run-monitor.tsx");

describe("the studio inspector configures a decision step", () => {
  it("asks the question, shows the branches, and offers the kind, confidence and fallback", () => {
    expect(studioCanvas).toContain('data-testid="input-node-question"');
    expect(studioCanvas).toContain('data-testid="decision-branches"');
    expect(studioCanvas).toContain('data-testid="select-node-decision-kind"');
    expect(studioCanvas).toContain('data-testid="input-node-confidence-threshold"');
    expect(studioCanvas).toContain('data-testid="select-node-unsure"');
  });

  it("writes the keys the build reads (server/team-build.ts, shared/flow-execution-kind.ts)", () => {
    expect(studioCanvas).toContain("question: e.target.value");
    expect(studioCanvas).toContain("decisionKind: v === \"on\"");
    expect(studioCanvas).toContain("confidenceThreshold: v");
    expect(studioCanvas).toContain('unsure: e.target.value === "gate" ? "gate" : undefined');
  });

  it("previews the kind with the same classifier, given the branches and the platform flag", () => {
    expect(studioCanvas).toContain('from "@shared/flow-execution-kind"');
    expect(studioCanvas).toContain("classifyStep({ type: d.ntype, config: d.config }, { outgoingEdges: outgoing, decisionKind })");
    expect(studioCanvas).toContain('data-testid="decision-kind-preview"');
    // The flag comes from the page, which reads the platform setting.
    expect(studioCanvas).toContain("decisionKind?: boolean;");
    expect(studioPage).toContain('queryKey: ["/api/platform-settings", "DECISION_STEP_KIND"]');
    expect(studioPage).toContain("decisionKind={decisionKindOn}");
  });

  it("counts decision steps in the studio's plan line", () => {
    expect(studioPage).toContain("flowCost.decisionSteps");
    expect(studioPage).toContain("compiled.cost.decisionSteps");
  });
});

describe("the team-graph editor has a decision step and a decision link", () => {
  it("offers the step in the palette, under Control", () => {
    expect(editor).toContain('{ type: "decision", label: "Decision", icon: GitBranch, color: "bg-sky-500" }');
    expect(editor).toContain('["Control", ["decision", "sub_flow"]]');
    expect(nodeMeta).toContain('decision: "bg-sky-500"');
    expect(nodeMeta).toContain("decision: GitBranch");
    expect(teamCanvas).toContain('decision: "Decision"');
  });

  it("configures the question, options, confidence and fallback under config.decision", () => {
    expect(editor).toContain('data-testid="input-decision-question"');
    expect(editor).toContain('data-testid="button-add-decision-option"');
    expect(editor).toContain('data-testid="input-decision-threshold"');
    expect(editor).toContain('data-testid="select-decision-unsure"');
    expect(editor).toContain("decision: { ...cfg, options, ...patch }");
    // A decision writes its choice to state, so it takes a state key.
    expect(editor).toContain('|| t === "decision"');
  });

  it("checks each Decision-routed link against the options, by the engine's slug", () => {
    expect(editor).toContain('outgoingEdges.filter((e) => e.evaluationMode === "decision")');
    expect(editor).toContain('from "@shared/state-key"');
    expect(editor).toContain("no option with this name");
  });

  it("offers Decision as a link's routing, beside AI, rule and handoff", () => {
    expect(editor).toContain('data-testid="button-mode-decision"');
    expect(editor).toContain('onClick={() => onUpdate({ evaluationMode: "decision" })}');
    expect(editor).toContain('data-testid="decision-branch-info"');
    expect(editor).toContain('data-testid="text-decision-source-not-decision"');
    for (const mode of ["ai", "deterministic", "handoff"]) expect(editor).toContain(`data-testid="button-mode-${mode}"`);
  });
});

describe("a run can be shown on the team-graph canvas", () => {
  it("builds the overlay from the run and passes it to the canvas", () => {
    expect(editor).toContain('from "@shared/run-overlay"');
    expect(editor).toContain("buildRunOverlay(overlayRun as any, nodes, edges, wavePlan)");
    expect(editor).toContain("overlay={overlay}");
    expect(teamCanvas).toContain("overlay?: RunOverlay;");
  });

  it("offers the last runs as a rail, and each run in the Runs panel, with one click to show it", () => {
    expect(editor).toContain('data-testid="run-rail"');
    expect(editor).toContain("data-testid={`button-run-rail-${run.id}`}");
    expect(editor).toContain("data-testid={`button-show-run-on-canvas-${run.id}`}");
    expect(editor).toContain('data-testid="run-overlay-banner"');
    expect(editor).toContain('data-testid="button-hide-run-overlay"');
  });

  it("keeps a shown run moving while it is live", () => {
    expect(editor).toContain("if (!overlayRunId) return false;");
    expect(editor).toContain('shown.status === "running" || shown.status === "waiting_approval" || shown.status === "pending") ? 3000 : false');
  });

  it("paints each card with its state and the decision it made, and the path taken in green", () => {
    expect(teamCanvas).toContain("run: overlay?.nodes[node.id]");
    expect(teamCanvas).toContain("data-run-state={run?.state}");
    expect(teamCanvas).toContain("chose <span className=\"font-medium\">{run.decision.choice}</span>");
    expect(teamCanvas).toContain("const ran = overlay?.edges[edge.id];");
    expect(teamCanvas).toContain("stroke: taken ? TAKEN_STROKE : hot ?");
    expect(teamCanvas).toContain("const notTaken = !!overlay && !taken;");
    // A decision's branch shows the probability the step gave it.
    expect(teamCanvas).toContain("`${Math.round(ran.probability * 100)}%`");
  });

  it("leaves the arrow-head contract the arrows test pins", () => {
    expect(teamCanvas).toContain("markerEnd: {");
    expect(teamCanvas).toContain('color: hot ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))",');
  });
});

describe("the answer types on every surface (Phase 3, item 2)", () => {
  it("the studio inspector offers the answer type, a labels editor and a ladder editor, and hides branch-only controls otherwise", () => {
    expect(studioCanvas).toContain('data-testid="select-node-answer-type"');
    expect(studioCanvas).toContain("patchNode(selNode.id, { config: v === \"branch\" ? rest : { ...rest, answerType: v } });");
    expect(studioCanvas).toContain('data-testid="button-add-node-option"');
    expect(studioCanvas).toContain("data-testid={`input-node-option-label-${i}`}");
    expect(studioCanvas).toContain('data-testid="button-add-node-level"');
    expect(studioCanvas).toContain("data-testid={`input-node-level-${i}`}");
    expect(studioCanvas).toContain('data-testid="decision-answer-preview"');
    expect(studioCanvas).toContain("decisionAnswerType, decisionOptionsFor, decisionLevelsFor } from \"@shared/flow-execution-kind\"");
    // The branch-only controls stay, shown only for a branch decision.
    expect(studioCanvas).toContain('{answerType === "branch" && (\n                      <div className="flex flex-col gap-1">\n                        <label className="font-mono text-[10.5px] text-muted-foreground uppercase tracking-[0.08em]">Runs as</label>');
  });

  it("the team-graph editor offers the answer type and a ladder, keeps branches and 'when unsure' for a branch decision, and warns a Decision-routed link out of a value decision", () => {
    expect(editor).toContain('data-testid="select-decision-answer-type"');
    expect(editor).toContain("write({ answerType: v === \"branch\" ? undefined : v });");
    expect(editor).toContain('data-testid="button-add-decision-level"');
    expect(editor).toContain("data-testid={`input-decision-level-${i}`}");
    expect(editor).toContain('data-testid="text-decision-needs-levels"');
    expect(editor).toContain("write({ levels: next.map((l) => l.trim()).filter(Boolean) });");
    expect(editor).toContain("decisionAnswerTypeOf((sourceNode.config as any)?.decision) !== \"branch\"");
    expect(editor).toContain("writes a value rather than choosing a branch");
  });

  it("the monitor names the answer type, shows a ladder by level name, and does not list the plain value twice", () => {
    expect(monitor).toContain('import { DECISION_RECORD_SUFFIX } from "@shared/run-overlay";');
    expect(monitor).toContain("const allEntries = outputEntries(step.result).filter((e) => !decisionValueKeys.has(e.key));");
    expect(monitor).toContain("classified ${chosen.choice}");
    expect(monitor).toContain("scored ${chosen.choice}");
    expect(monitor).toContain('chosen.answerType === "classify" ? "Classified" : chosen.answerType === "score" ? "Scored" : "Decided"');
    expect(monitor).toContain("const name = chosen.answerType === \"score\" && chosen.levels ? (chosen.levels[Number(option)] ?? option) : option;");
  });
});

describe("the run monitor shows what a decision step decided", () => {
  it("reads the decision through the shared reader, keyed off the node type", () => {
    expect(monitor).toContain('import { decisionOutcomeOf } from "@shared/run-overlay";');
    expect(monitor).toContain('const chosen = step.nodeType === "decision" ? decisionOutcomeOf(step.result?.output) : null;');
    expect(monitor).toContain('const chosen = s.nodeType === "decision" ? decisionOutcomeOf(s.result?.output) : null;');
  });

  it("says the choice on the timeline and shows the probabilities, confidence and engine in the detail", () => {
    expect(monitor).toContain("chose ${chosen.choice}");
    expect(monitor).toContain("data-testid={`panel-decision-${step.id}`}");
    expect(monitor).toContain("data-testid={`list-decision-probabilities-${step.id}`}");
    expect(monitor).toContain("% confident");
    expect(monitor).toContain('chosen.engine === "jev" ? "decision model" : "language model"');
    expect(monitor).toContain("sent to the approval branch");
  });

  it("does not also dump the decision record as JSON, and keeps kind two-valued", () => {
    expect(monitor).toContain("const entries = chosenKey ? allEntries.filter((e) => e.key !== chosenKey) : allEntries;");
    expect(monitor).toContain('kind: "agent" | "gate";');
  });
});
