/**
 * What a business step will actually cost to run.
 *
 * The DAG engine has always had node types that execute for nothing -- an
 * `expression` is JSONata over shared state, `knowledge_base` is a pgvector
 * search, `skill` injects a procedure's text, `edge_gate` waits for a person --
 * but the flow-to-team conversion could only ever emit `internal_agent` and
 * `edge_gate` (three call sites in team-build.ts). So an author who drew an
 * Expression step got a language model doing arithmetic, and the only way to a
 * free node was hand-editing the blueprint afterwards.
 *
 * This is the one classification both sides use: the flow compiler, to tell an
 * author what their flow will cost before they commission it, and team-build, to
 * emit the node the step actually described.
 *
 * The rules only ever read what the author explicitly bound in the step
 * inspector. A step is never demoted out of an agent on a guess: a bound
 * knowledge base on a "get information" step is unambiguous, whereas a bound
 * skill on a reasoning step means "follow this procedure", not "replace the
 * thinking with a text lookup" -- so that one needs `deterministic: true`,
 * which the inspector offers where it applies.
 */

import type { ProcessNode, ProcessFlowGraph } from "./process-flow";
import { parseConditionToRule } from "./condition-to-rule";

export type ExecutionKind =
  /** A language model call. The only kind that costs tokens. */
  | "agent"
  /**
   * One decision-model call over the step's labelled branches; exactly one
   * branch is taken. A make_decision step used to be an agent call PLUS one
   * model call per branch, judged independently, so zero or two branches could
   * fire. Opt-in: the platform flag DECISION_STEP_KIND or the step's own
   * config.decisionKind, and only with two or more labelled branches.
   */
  | "decision"
  /** JSONata over shared state, evaluated in-process under a 5s ceiling. */
  | "expression"
  /** A real pgvector search whose chunks land in state. */
  | "knowledge_base"
  /** A skill's procedure text injected into state. */
  | "skill"
  /** One bound tool, arguments mapped from state. No model in the loop. */
  | "tool_call"
  /** A person decides. */
  | "gate"
  /** Markers: start, end, and a parallel fan-out. Nothing executes. */
  | "structural";

/** The kinds that reach the model provider. Everything else is free. */
export function costsTokens(kind: ExecutionKind): boolean {
  return kind === "agent";
}

interface StepConfigShape {
  expression?: unknown;
  kbId?: unknown;
  skillId?: unknown;
  toolName?: unknown;
  toolServerId?: unknown;
  /** The author's explicit "run this without a model" on a step that could go either way. */
  deterministic?: unknown;
}

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** One branch out of a decision step: what the author labelled it, and the condition if any. */
export interface DecisionBranch {
  label: string;
  condition?: string;
  to?: string;
}

/**
 * The branches a decision step can choose between: its outgoing edges that
 * carry a label or a condition. The label is the option's name; a branch with
 * only a condition is named by it.
 */
/**
 * What a decision step answers with. "branch" is the original kind: one choice
 * over the step's labelled branches, and exactly one edge is taken. "classify"
 * and "score" are the same node writing a VALUE to state instead -- a label
 * from the step's own options, or a level index on its ladder -- for the rules
 * downstream to read. They are authored choices: no flag and no branches are
 * needed, only the options or the levels.
 */
export type DecisionAnswerType = "branch" | "classify" | "score";

export function decisionAnswerType(config: unknown): DecisionAnswerType {
  const v = (config as { answerType?: unknown } | null | undefined)?.answerType;
  return v === "classify" || v === "score" ? v : "branch";
}

/** A classify step's options, as the author wrote them: strings, or {label, description}. */
export function decisionOptionsFor(config: unknown): Array<{ label: string; description?: string }> {
  const raw = (config as { options?: unknown } | null | undefined)?.options;
  if (!Array.isArray(raw)) return [];
  const out: Array<{ label: string; description?: string }> = [];
  const seen = new Set<string>();
  for (const o of raw) {
    const label = typeof o === "string" ? o.trim() : str((o as { label?: unknown })?.label);
    if (!label || seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());
    const description = typeof o === "object" && o ? str((o as { description?: unknown }).description) : "";
    out.push({ label, ...(description ? { description } : {}) });
  }
  return out;
}

/** A score step's levels, low to high; the model's answer is an index into this. The seam allows 2 to 10. */
export function decisionLevelsFor(config: unknown): string[] {
  const raw = (config as { levels?: unknown } | null | undefined)?.levels;
  if (!Array.isArray(raw)) return [];
  const levels = raw.map((l) => (typeof l === "string" ? l.trim() : "")).filter(Boolean);
  return levels.length >= 2 && levels.length <= 10 ? levels : [];
}

/** The shape of an edge the classifier reads: a flow's ProcessEdge, or a build's derived branch. */
export type BranchLike = { to?: string; label?: string; condition?: string };

export function decisionBranchesFor(edges: BranchLike[] | undefined): DecisionBranch[] {
  const out: DecisionBranch[] = [];
  const seen = new Set<string>();
  for (const e of edges ?? []) {
    const label = str(e.label) || str(e.condition);
    if (!label || seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());
    out.push({ label, ...(str(e.condition) ? { condition: str(e.condition) } : {}), ...(e.to ? { to: e.to } : {}) });
  }
  return out;
}

/**
 * Whether every branch out of a decision is a comparison the engine can settle
 * itself -- two or more of them, each with a condition that parses into a rule.
 *
 * One unparseable branch is enough to fail this: routing half a decision by
 * rule and half by a model is the outcome nobody wants, and the decision stays
 * whole.
 */
export function branchesAreAllRules(edges: BranchLike[] | undefined): boolean {
  const branches = decisionBranchesFor(edges);
  if (branches.length < 2) return false;
  return branches.every((b) => !!b.condition && !!parseConditionToRule(b.condition));
}

/**
 * What a classifier needs beyond the step itself. A single step cannot say
 * whether it is a decision: that is a property of its branches and of the
 * platform flag, so callers that have the graph pass them, and callers that
 * do not get the answer they always got.
 */
export interface ClassifyContext {
  outgoingEdges?: BranchLike[];
  /** The platform flag DECISION_STEP_KIND. A step's config.decisionKind (true/false) overrides it either way. */
  decisionKind?: boolean;
}

/**
 * How this step will execute. Pure: same step in, same kind out, no lookups.
 */
export function classifyStep(node: Pick<ProcessNode, "type" | "config">, ctx?: ClassifyContext): ExecutionKind {
  const config = (node.config ?? {}) as StepConfigShape & { decisionKind?: unknown };
  const wantsDeterministic = config.deterministic === true;

  // A parallel step is a fan-out marker, not work: it exists to say that its
  // successors run together. It had no case here, so it fell through to
  // "agent" and every parallel branch in a flow cost a model call to produce
  // prose nobody reads. Found on a 35-step close flow where two of its three
  // remaining model steps were these markers.
  if (node.type === "trigger" || node.type === "end" || node.type === "parallel") return "structural";
  if (node.type === "expert_approval") return "gate";

  // A decision that writes a value needs no branches and no flag: its options
  // or its levels are the whole question. Settled before the rule check below,
  // because the edges out of such a step are ordinarily rules over the value
  // it writes, and those must not read as "decided by the edges".
  if (node.type === "make_decision") {
    const answerType = decisionAnswerType(config);
    if (answerType === "classify") return decisionOptionsFor(config).length >= 2 ? "decision" : "agent";
    if (answerType === "score") return decisionLevelsFor(config).length >= 2 ? "decision" : "agent";
  }

  // A decision every one of whose branches is a plain comparison is decided by
  // the edges themselves. The build walks through such a step and puts each
  // branch's rule on the edge out of the step before it, so no node runs and
  // nothing is charged -- and this has to agree, or the Studio quotes an
  // author a price the build does not charge.
  if (node.type === "make_decision" && branchesAreAllRules(ctx?.outgoingEdges)) return "structural";

  // A decision drawn with branches is one choice, not an agent plus a model
  // call per branch -- when the flag or the step says so, and only with two
  // or more branches to choose between.
  if (node.type === "make_decision") {
    const optIn = config.decisionKind === true || (config.decisionKind !== false && ctx?.decisionKind === true);
    if (optIn && decisionBranchesFor(ctx?.outgoingEdges).length >= 2) return "decision";
  }

  // An expression step with an expression IS the computation -- there is nothing
  // for a model to add. Without one it is an unconfigured step, and the engine
  // would fail it, so it stays an agent until the author fills it in.
  if (node.type === "expression" && str(config.expression)) return "expression";

  // A bound tool plus its server says exactly which call to make. "Post the
  // assessment to the change record" does not need a model to decide anything.
  if (str(config.toolName) && str(config.toolServerId)) return "tool_call";

  // Gathering information from a bound knowledge base is retrieval, which the
  // engine does natively. A step with a skill bound as well keeps its agent: the
  // skill is there to shape judgement about what was retrieved.
  if (node.type === "get_info" && str(config.kbId) && !str(config.skillId)) return "knowledge_base";

  // Everything below is a genuine judgement step unless the author said otherwise.
  if (wantsDeterministic) {
    if (str(config.expression)) return "expression";
    if (str(config.kbId)) return "knowledge_base";
    if (str(config.skillId)) return "skill";
  }

  return "agent";
}

/** Why a step is classified the way it is, for the compiler's report and the inspector. */
export function explainKind(node: Pick<ProcessNode, "type" | "config">, ctx?: ClassifyContext): string {
  const kind = classifyStep(node, ctx);
  switch (kind) {
    case "decision": {
      const answerType = node.type === "make_decision" ? decisionAnswerType(node.config) : "branch";
      if (answerType === "classify") return "Classified by one decision-model call over its options; the chosen label is written to state for later steps and rules. No agent call.";
      if (answerType === "score") return "Scored by one decision-model call on its ladder; the level is written to state for later steps and rules. No agent call.";
      return "Decided by one decision-model call over its branches; exactly one branch is taken. No agent call.";
    }
    case "structural":
      if (node.type === "parallel") return "A fan-out marker: the steps after it run together. Nothing runs here, and no model call.";
      if (node.type === "make_decision") return "Decided by its branches' own rules, on the edges. Nothing runs here, and no model call.";
      return "A marker, not a step that runs.";
    case "gate": return "Waits for a person to decide.";
    case "expression": return "Evaluated in-process as an expression over the run's state. No model call.";
    case "knowledge_base": return "Answered by a search of the bound knowledge base. No model call.";
    case "skill": return "Answered by injecting the bound skill's procedure. No model call.";
    case "tool_call": return "Calls the bound tool directly, with its arguments taken from state. No model call.";
    case "agent": return "Runs as an agent: one model call, or more if it uses tools.";
  }
}

export interface FlowCostEstimate {
  /** Steps that will each become at least one model call. */
  modelSteps: number;
  /** Steps the engine runs for nothing. */
  freeSteps: number;
  /** Conditional edges with no deterministic rule: each is its own model call at run time. */
  aiRoutedEdges: number;
  /** Total model calls per run, at minimum -- a step that uses tools costs more turns. */
  minModelCalls: number;
  /** Decision steps: one decision-model call each, priced separately and far below a model step. */
  decisionSteps: number;
  /** Rough dollars per run. Deliberately coarse: it is there to show the shape, not to bill. */
  approxUsdPerRun: number;
  byKind: Record<ExecutionKind, number>;
}

/**
 * A measured run of a five-agent journey (CI Ownership Inference, 24 Sep 2026)
 * cost $0.79 over 194k prompt tokens: ~$0.16 per agent step, with tool-using
 * steps well above the mean and simple ones below it. That is the number this
 * estimate is anchored on, and it is why the report says "approximately".
 */
const USD_PER_MODEL_STEP = 0.16;
/** A routing decision is one short call against one step's output, not a whole step's context. */
const USD_PER_AI_EDGE = 0.01;
/** A decision step is one decision-model call: ~2k tokens at $0.042 per million (Phase 0 measured $0.02 for 210 such calls). */
const USD_PER_DECISION_STEP = 0.0001;

/**
 * What this flow will cost every time it runs, from the steps as authored.
 *
 * An author currently gets no signal at all that a twenty-step flow is twenty
 * model calls; this is the number the compiler puts in front of them.
 */
export function estimateFlowCost(graph: Pick<ProcessFlowGraph, "nodes" | "edges">, ctx?: Pick<ClassifyContext, "decisionKind">): FlowCostEstimate {
  const byKind: Record<ExecutionKind, number> = {
    agent: 0, decision: 0, expression: 0, knowledge_base: 0, skill: 0, tool_call: 0, gate: 0, structural: 0,
  };
  const decisionNodeIds = new Set<string>();
  for (const node of graph.nodes) {
    const kind = classifyStep(node, { outgoingEdges: graph.edges.filter((e) => e.from === node.id), decisionKind: ctx?.decisionKind });
    byKind[kind]++;
    if (kind === "decision") decisionNodeIds.add(node.id);
  }

  // An edge that guards a branch needs its condition evaluated. With a rule that
  // happens in-process; without one the engine falls back to asking a model --
  // unless the condition is plainly a comparison, which team-build parses into a
  // rule at build time. Counting those as model calls overstated the cost of
  // exactly the flows an author had got right: "score > 5" was reported as a
  // model call it will never make. A branch out of a decision step is decided by
  // that step's one call, so it is not an edge call either.
  const aiRoutedEdges = graph.edges.filter((e) => {
    if (decisionNodeIds.has(e.from)) return false;
    const condition = str(e.condition);
    const hasCondition = !!condition || !!str(e.label);
    if (!hasCondition) return false;
    if ((e as { rule?: unknown }).rule) return false;
    return !parseConditionToRule(condition);
  }).length;

  const modelSteps = byKind.agent;
  const decisionSteps = byKind.decision;
  const freeSteps = byKind.expression + byKind.knowledge_base + byKind.skill + byKind.tool_call;
  return {
    modelSteps,
    freeSteps,
    aiRoutedEdges,
    minModelCalls: modelSteps + aiRoutedEdges,
    decisionSteps,
    approxUsdPerRun: Math.round((modelSteps * USD_PER_MODEL_STEP + aiRoutedEdges * USD_PER_AI_EDGE + decisionSteps * USD_PER_DECISION_STEP) * 100) / 100,
    byKind,
  };
}
