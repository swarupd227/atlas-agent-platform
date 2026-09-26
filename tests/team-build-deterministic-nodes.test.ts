/**
 * The conversion from a business flow to a runnable team could only ever emit
 * `internal_agent` and `edge_gate`, so an authored Expression step was handed to
 * a language model to do arithmetic. These are the rules that decide what a
 * worker proposal becomes instead, read off the module's own source and its
 * shared classifier -- the build itself needs a database, so the contract is
 * asserted where it is decided.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { teamAgentProposalSchema } from "../server/team-build";
import { classifyStep } from "../shared/flow-execution-kind";
import { parseConditionToRule } from "../shared/condition-to-rule";
import { stateKeyForLabel } from "../shared/state-key";
import { evaluateRule } from "../server/rule-evaluator";
import { buildPipelineState } from "../server/agent-runtime";

const source = readFileSync(join(__dirname, "..", "server", "team-build.ts"), "utf8").replace(/\r\n/g, "\n");

describe("what a worker proposal may say about running without a model", () => {
  it("accepts each of the engine's zero-token kinds", () => {
    for (const execution of [
      { kind: "expression", expression: "$sum(items.amount)" },
      { kind: "knowledge_base", knowledgeBaseId: "kb-1", knowledgeBaseQuery: "retention policy" },
      { kind: "skill", skillId: "sk-1" },
      { kind: "tool_call", toolServerId: "srv-1", toolName: "snow_add_work_note", toolArgs: { ci: { $expr: "targetSysId" } } },
    ]) {
      const parsed = teamAgentProposalSchema.safeParse({ name: "Step", description: "d", execution });
      expect(parsed.success, JSON.stringify(execution)).toBe(true);
    }
  });

  it("rejects a kind the engine has no node for, rather than building a dead node", () => {
    const parsed = teamAgentProposalSchema.safeParse({ name: "Step", description: "d", execution: { kind: "http_request" } });
    expect(parsed.success).toBe(false);
  });

  it("keeps the flow step labels, which is how an authored step reaches the builder", () => {
    const parsed = teamAgentProposalSchema.safeParse({ name: "Step", description: "d", flowStepLabels: ["Score the claim"] });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.flowStepLabels).toEqual(["Score the claim"]);
  });
});

describe("the node a step becomes", () => {
  it("no longer hardcodes internal_agent at the worker node sites", () => {
    // Both worker-node paths (tiered and flat) must consult the descriptor.
    const hardcoded = source.match(/nodeType: isGate \? "edge_gate" : "internal_agent"/g) ?? [];
    expect(hardcoded).toHaveLength(0);
    expect(source.match(/nodeType: isGate \? "edge_gate" : det \? det\.nodeType : "internal_agent"/g) ?? []).toHaveLength(2);
  });

  it("holds no agent reference on a node that runs no agent", () => {
    expect(source).toContain("refAgentId: isGate || det ? null : worker.id");
    expect(source).toContain("refAgentId: isGate || det ? null : createdWorkers[i].id");
  });

  it("prefers the step the author configured over anything the model wrote", () => {
    // Order matters, and it used to be the other way round: a proposer that
    // volunteered an `execution` beat the binding the author had drawn. Live
    // 2026-09-25 that substituted an expression comparing a coastal AGGREGATE
    // against a SINGLE-RISK limit, over fields no system has, for the author's
    // own comparison. Confidently wrong beats an agent that says it is unsure,
    // in the worst direction.
    expect(source).toContain("const exec = executionFromAuthoredStep(proposal, stepsByLabel) ?? proposal?.execution;");
    // Still falls through to the proposer for a step carrying no configuration.
    expect(source).toContain("?? proposal?.execution");
  });

  it("only derives from an authored step when the agent covers exactly that one", () => {
    expect(source).toContain("if (labels.length !== 1) return null;");
  });

  it("reads the authored steps from the flow when the caller names it", () => {
    // The gap this closes: the Process Flow Studio sends processFlowId to this
    // call and the steps only to the DRAFTING call, so the map of authored
    // steps was always empty on the one path that has any -- and every
    // deterministic node was built from what the model invented instead. The
    // nodes appeared either way, which is exactly why it read as working.
    expect(source).toContain("if (authoredSteps.length === 0 && body.processFlowId)");
    expect(source).toContain("const nodes = (flow?.graph as any)?.nodes;");
    expect(source).toContain("if (Array.isArray(nodes)) authoredSteps = nodes;");
    // The map is built from the resolved steps, not from the request field.
    expect(source).toMatch(/authoredStepsByLabel = new Map<string, any>\(\s*authoredSteps/);
    // A caller that sends the steps outright is still honoured.
    expect(source).toContain("let authoredSteps: any[] = Array.isArray(processFlowSteps) ? processFlowSteps : [];");
  });

  it("falls back to an agent when an expression does not parse", async () => {
    // The rule below was applied only to a MISSING expression. One that is
    // present and does not compile is the same case, and cost a whole run:
    // live 2026-09-25 a drafting model wrote this for a confidence gate, the
    // node was built, and at wave 3 of 20 it failed to compile and every node
    // after it was skipped -- including a treaty evaluation that was correct.
    const jsonata = (await import("jsonata")).default;
    const MODELS_BROKEN_EXPRESSION =
      `$copeData := $states.cope_normalization_agent.output; {"confidenceMet": $copeData.extractionConfidence >= 0.85}`;
    // `;` is only legal inside a ( ) block. Knowable at build time.
    expect(() => jsonata(MODELS_BROKEN_EXPRESSION)).toThrow();
    // Wrapped, the same text is valid -- so the check must be a real compile,
    // not a substring rule that would reject both or neither.
    expect(() => jsonata(`(${MODELS_BROKEN_EXPRESSION})`)).not.toThrow();

    expect(source).toContain("function compiles(expression: string): string | null");
    expect(source).toContain("const broken = compiles(expression);");
    expect(source).toContain("if (broken) {");
    // Falls back rather than building a node guaranteed to fail...
    expect(source).toMatch(/if \(broken\) \{[\s\S]{0,400}?return null;/);
    // ...and says so, through the warnings the build already returns.
    expect(source).toContain("does not parse (${broken}), so it runs as an agent instead");
    // Both worker-node paths (tiered and flat) pass the sink.
    expect(source.match(/authoredStepsByLabel, \(m\) => structureWarnings\.push\(m\), allMcpServers\)/g) ?? []).toHaveLength(2);
  });

  it("resolves a connector named in prose to its id", () => {
    // A proposer names connectors the way a person does. That string landed in
    // toolServerId, where the dispatcher looks a server up BY ID and found
    // nothing, and the run said "the connector reported no tools" -- which
    // reads as a broken connector, not a wrong id. Live 2026-09-26 it killed
    // both rating steps of a journey whose other tool calls worked.
    expect(source).toContain("if (!UUID.test(serverId))");
    expect(source).toContain("resolveBindingServer(serverId, servers)");
    // The same matcher the worker-binding path uses, not a second one.
    expect(source).toContain('import { resolveBindingServer } from "./team-bindings"');
    // No match is an agent, not a node whose call can never dispatch.
    expect(source).toMatch(/if \(!matched\) \{[\s\S]{0,500}?return null;/);
    expect(source).toContain("and no connector of that name is available to this organization");
    // And the resolved id is what the node actually stores.
    expect(source).toContain("config: { toolServerId: serverId,");
    // A real id is still used as-is.
    expect(/\^\[0-9a-f\]\{8\}-/.test(source)).toBe(true);
  });

  it("gives a human checkpoint the authored step's state key as well", () => {
    // A gate's result is what the decision after it must read ("was the
    // contract certainty review approved?"). Its key was a slug of the agent
    // name the proposer invented, so that decision had no reliable name to read
    // and produced the same unsatisfiable-branch dead-end.
    expect(source).toContain("export function authoredStateKey(");
    expect(source.match(/isGate \? authoredStateKey\(/g) ?? []).toHaveLength(2);
    // Shared with the deterministic path, so both name a step the same way.
    expect(source).toContain("const key = step ? stateKeyForLabel(step.label ?? \"\") : \"\";");
  });

  it("checks a tool argument's expression too, which fails the same way", () => {
    // A $expr in toolArgs is evaluated against run state exactly as a node's
    // expression is; a broken one means the call is never dispatched.
    expect(source).toContain("const expr = (spec as { $expr?: unknown } | null)?.$expr;");
    expect(source).toMatch(/const broken = compiles\(expr\);[\s\S]{0,400}?return null;/);
  });

  it("falls back to an agent when a descriptor is incomplete", () => {
    // An expression node with no expression fails the run; an agent merely costs
    // money. The cheap failure is the wrong one to choose.
    expect(source).toContain("if (!expression) return null;");
    expect(source).toContain("if (!text(exec.toolServerId) || !text(exec.toolName)) return null;");
  });

  it("classifies the authored steps the derivation reads", () => {
    // The same classifier the compiler reports with, so the canvas's "free" badge
    // and the built node can never disagree.
    expect(classifyStep({ type: "expression", config: { expression: "a" } } as any)).toBe("expression");
    expect(classifyStep({ type: "take_action", config: { toolName: "t", toolServerId: "s" } } as any)).toBe("tool_call");
  });
});

/**
 * A gate is only deterministic if the author can name the field it reads.
 *
 * The result of a built node lands under a state key, and edge rules resolve
 * fields by exact dotted path from the top of state -- no nested search. Until
 * this, a node built from an authored step took its key from a slug of the
 * agent NAME THE PROPOSER INVENTED, which nobody drawing the flow could know in
 * advance. An edge written at authoring time therefore named a field no step
 * wrote, so BOTH branches of the decision evaluated false and the run
 * dead-ended, having paid for every step before it.
 */
describe("the state key a deterministic step writes to", () => {
  it("is the author's own label for the step", () => {
    expect(stateKeyForLabel("Evaluate Treaty Limits")).toBe("evaluate_treaty_limits");
    expect(stateKeyForLabel("Pre-Bind Quality Check")).toBe("pre_bind_quality_check");
    expect(stateKeyForLabel("  Rate & Tax  ")).toBe("rate_tax");
  });

  it("carries that label onto the node, for every deterministic kind", () => {
    expect(source).toContain("const stateKey = stateKeyForLabel(step.label ?? \"\");");
    // All four kinds, or an author would learn the rule on one step and find it
    // untrue on the next.
    for (const kind of ["expression", "knowledge_base", "tool_call", "skill"]) {
      expect(source, kind).toMatch(new RegExp(`kind: "${kind}",[^}]*stateKey`));
    }
    // And onto both worker-node paths (tiered and flat).
    expect(source.match(/stateKey: det\?\.stateKey \?\? \(isGate \? authoredStateKey\(/g) ?? []).toHaveLength(2);
  });

  it("leaves a proposer-supplied descriptor on the engine's default", () => {
    // Only an authored step has a label an author chose. A node the proposer
    // described keeps the slug-of-the-node-label behaviour it had.
    expect(source).toContain("const stateKey = text(exec.stateKey) || undefined;");
  });

  it("makes a gate written while authoring resolve against what the step wrote", () => {
    // The whole round trip: label -> key -> the condition an author types ->
    // a parsed rule -> evaluated against state shaped as the engine writes it.
    const key = stateKeyForLabel("Evaluate Treaty Limits");
    const breached = parseConditionToRule(`${key}.breached == true`)!;
    const clear = parseConditionToRule(`${key}.breached == false`)!;
    expect(breached).not.toBeNull();

    // Through the engine's OWN builder, not a hand-made object. Building the
    // state I wished for is exactly how this contract shipped broken: the
    // qualified name resolved here and not in a run, because the real builder
    // keyed only by display label, so both branches went unsatisfied and three
    // runs skipped everything downstream of the decision.
    const state = buildPipelineState(
      new Map([["n-treaty", JSON.stringify({ breached: true, coastalTier1AggregateTiv: 72_400_000, coastalTier1AggregateLimit: 50_000_000 })]]),
      new Map([["n-treaty", "Evaluate Treaty Limits"]]),
      new Map([["n-treaty", key]]),
    );
    expect(evaluateRule(breached, state).result).toBe(true);
    expect(evaluateRule(clear, state).result).toBe(false);

    // Exactly one branch is satisfied either way -- the dead-end this prevents
    // is both being false at once.
    const withinAuthority = { [key]: { breached: false } };
    expect(evaluateRule(breached, withinAuthority).result).toBe(false);
    expect(evaluateRule(clear, withinAuthority).result).toBe(true);
  });

  it("explains itself in the rule's trace, so a routing decision is auditable", () => {
    const key = stateKeyForLabel("Evaluate Treaty Limits");
    const trace = evaluateRule(parseConditionToRule(`${key}.breached == true`)!, { [key]: { breached: true } });
    expect(trace.reason).toContain(`${key}.breached`);
    expect(trace.inputs[`${key}.breached`]).toBe(true);
  });
});

describe("a branch the engine can decide for itself", () => {
  it("parses a comparison into a rule instead of paying a model per run", () => {
    expect(source).toContain("const parsed = parseConditionToRule(spec.branchCondition);");
    expect(source).toContain('if (parsed) return { condition: spec.branchCondition, evaluationMode: "deterministic", rule: parsed };');
  });

  it("still leaves judgement to the model", () => {
    expect(parseConditionToRule("the write-up reads as balanced")).toBeNull();
    expect(source).toContain('return { condition: spec.branchCondition, evaluationMode: "ai" };');
  });
});
