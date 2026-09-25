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

export type ExecutionKind =
  /** A language model call. The only kind that costs tokens. */
  | "agent"
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
  /** Start and end markers: nothing executes. */
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

/**
 * How this step will execute. Pure: same step in, same kind out, no lookups.
 */
export function classifyStep(node: Pick<ProcessNode, "type" | "config">): ExecutionKind {
  const config = (node.config ?? {}) as StepConfigShape;
  const wantsDeterministic = config.deterministic === true;

  if (node.type === "trigger" || node.type === "end") return "structural";
  if (node.type === "expert_approval") return "gate";

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
export function explainKind(node: Pick<ProcessNode, "type" | "config">): string {
  const kind = classifyStep(node);
  switch (kind) {
    case "structural": return "A marker, not a step that runs.";
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

/**
 * What this flow will cost every time it runs, from the steps as authored.
 *
 * An author currently gets no signal at all that a twenty-step flow is twenty
 * model calls; this is the number the compiler puts in front of them.
 */
export function estimateFlowCost(graph: Pick<ProcessFlowGraph, "nodes" | "edges">): FlowCostEstimate {
  const byKind: Record<ExecutionKind, number> = {
    agent: 0, expression: 0, knowledge_base: 0, skill: 0, tool_call: 0, gate: 0, structural: 0,
  };
  for (const node of graph.nodes) byKind[classifyStep(node)]++;

  // An edge that guards a branch needs its condition evaluated. With a rule that
  // happens in-process; without one the engine falls back to asking a model.
  const aiRoutedEdges = graph.edges.filter((e) => {
    const hasCondition = !!str(e.condition) || !!str(e.label);
    const hasRule = !!(e as { rule?: unknown }).rule;
    return hasCondition && !hasRule;
  }).length;

  const modelSteps = byKind.agent;
  const freeSteps = byKind.expression + byKind.knowledge_base + byKind.skill + byKind.tool_call;
  return {
    modelSteps,
    freeSteps,
    aiRoutedEdges,
    minModelCalls: modelSteps + aiRoutedEdges,
    approxUsdPerRun: Math.round((modelSteps * USD_PER_MODEL_STEP + aiRoutedEdges * USD_PER_AI_EDGE) * 100) / 100,
    byKind,
  };
}
