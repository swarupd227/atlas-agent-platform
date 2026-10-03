/**
 * Build a live agent team from a proposal: the team (orchestrator) agent, its
 * workers, their connector links, skills, knowledge bases and policies, the
 * team blueprint with its nodes and edges, per-worker workflow blueprints and
 * baseline eval suites.
 *
 * Moved unchanged from POST /api/ai/create-team-from-proposals
 * (server/routes/improvements.ts) so the Astra Workspace can build a team
 * without an HTTP request. That route now parses the body and calls this.
 */
import { z } from "zod";
import { storage } from "./storage";
import { isKnownIndustry } from "@shared/industry-filter";
import { generateOntologyEvalCases } from "./routes/helpers";
import { resolveBindingServer } from "./team-bindings";
import { ruleLeafSchema, ruleGroupSchema, type RuleGroup } from "@shared/schema";
import { edgeRuleForCondition, parseConditionToRule } from "@shared/condition-to-rule";
import { classifyStep, decisionAnswerType, decisionLevelsFor, decisionOptionsFor, withClassifier, type ClassifierBinding, type DecisionBranch } from "@shared/flow-execution-kind";
import { stateKeyForLabel } from "@shared/state-key";
import { getDecisionSettings } from "./decision-settings";
import { stepCorrelation } from "@shared/process-flow-correlation";
import { inferStepClaims } from "./flow-step-claims";
import { backEdgeKeys, edgeKey } from "@shared/graph-cycles";
import { REWORK_REQUESTED_RULE } from "@shared/rework-rule";
import { checkBlueprintInvariants } from "./blueprint-invariants";
import jsonata from "jsonata";
import { COL_WIDTH, LAYOUT_ORIGIN_X, LAYOUT_ROW_Y, workerNodePosition } from "@shared/graph-layout";

export class TeamBuildNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TeamBuildNotFoundError";
  }
}

// The model occasionally emits an operator with incidental whitespace
// (e.g. "!= " instead of "!="), which fails ruleOperatorSchema's exact
// enum match -- trim every operator in the (possibly nested leaf/group)
// shape before validating rather than let a stray space alone knock an
// otherwise well-formed AI-generated rule into the "malformed" fallback.
function trimRuleOperators(node: unknown): unknown {
  if (!node || typeof node !== "object") return node;
  const obj = node as Record<string, unknown>;
  if (typeof obj.operator === "string") {
    return { ...obj, operator: obj.operator.trim() };
  }
  if (Array.isArray(obj.conditions)) {
    return { ...obj, conditions: obj.conditions.map(trimRuleOperators) };
  }
  return node;
}
// A proposed edge's branchRule may arrive as a single leaf ({field,operator,value})
// or an already-compound group ({combinator,conditions}) -- normalize to RuleGroup
// so downstream storage always sees the same shape EdgeConfigPanel edits.
function normalizeBranchRule(rule: unknown): RuleGroup | null {
  if (!rule || typeof rule !== "object") return null;
  const trimmed = trimRuleOperators(rule);
  const leaf = ruleLeafSchema.safeParse(trimmed);
  if (leaf.success) return { combinator: "AND", conditions: [leaf.data] };
  const group = ruleGroupSchema.safeParse(trimmed);
  if (group.success) return group.data;
  return null; // hallucinated/malformed shape -- silently drop, edge falls back to AI-judged text
}
const pipelineEdgeSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  label: z.string().optional(),
  type: z.string().optional(),
  branchCondition: z.string().nullable().optional(),
  // Deliberately not validated against the strict leaf/group union here --
  // normalizeBranchRule (below) already re-validates and gracefully drops
  // a malformed/hallucinated shape per-edge. Enforcing the strict schema at
  // this outer gate meant one AI-mangled edge (e.g. a stray-whitespace
  // operator) failed the ENTIRE team-creation request with a raw Zod dump
  // instead of just falling that one edge back to AI-judged text, exactly
  // the fallback this file already documents as the intended behavior.
  branchRule: z.any().nullable().optional(),
}).passthrough();
// Resolves a single proposed edge spec into the fields
// storage.createTeamBlueprintEdge expects. Shared by resolveEdgeRule
// (which looks the spec up by target name -- fine when a target has only
// one incoming edge) and the direct pipeline.edges construction path
// (which already has the exact spec in hand, so no lookup/ambiguity risk).
function resolveEdgeRuleFromSpec(spec: any): { condition?: string; evaluationMode?: string; rule?: RuleGroup } {
  if (!spec) return {};
  const rule = normalizeBranchRule(spec.branchRule);
  if (rule) return { condition: spec.branchCondition || undefined, evaluationMode: "deterministic", rule };
  if (spec.type === "conditional" && spec.branchCondition) {
    // No rule supplied, but the condition may still be a plain comparison --
    // "amount > 50000" was costing a model call on every run to decide
    // something the engine can evaluate itself, auditably. The shared helper
    // returns an "ai" edge for anything that is genuine judgement, which keeps
    // the model on the decisions that need one, and keeps this answer identical
    // to the one the flow sync gives.
    return edgeRuleForCondition(spec.branchCondition);
  }
  return {};
}
// Finds the proposed edge (if any) whose "to" matches this handoff's target agent/role
// name. Only safe when that target has a single incoming edge in the spec --
// see the direct pipeline.edges construction path (below, in the route handler)
// for targets that can be reached via more than one edge (e.g. a branch
// that skips an intermediate node), where matching by target name alone
// would silently pick the wrong edge's rule.
function resolveEdgeRule(pipelineEdges: unknown, toName: string): { condition?: string; evaluationMode?: string; rule?: RuleGroup } {
  const edges = Array.isArray(pipelineEdges) ? pipelineEdges : [];
  const spec = edges.find((e: any) => e?.to === toName);
  return resolveEdgeRuleFromSpec(spec);
}

/**
 * The blueprint node a step with an `execution` descriptor becomes, or null for
 * an ordinary agent step.
 *
 * Returning null on an incomplete descriptor is deliberate: a step that costs a
 * model call still does its job, whereas a node the engine would refuse
 * (an expression node with no expression, a tool_call with no connector) fails
 * the run. Cost is the lesser problem, so the fallback is always the agent.
 */
/**
 * The `execution` descriptor an authored step implies, when the proposal did not
 * carry one.
 *
 * This is the point of the whole change. An author draws an Expression step, or
 * binds a knowledge base to a "gather the policy" step, or names the tool a
 * "post the note" step calls -- and that intent used to be thrown away, because
 * the conversion asked a language model to describe the step and the model
 * described an agent. The authored configuration is better evidence than the
 * proposal's prose, so it wins.
 *
 * Only for a step whose intent is unambiguous (classifyStep's own rules), and
 * only when this agent covers exactly that one step: an agent that spans three
 * steps is doing something no single node can.
 */
/**
 * The one authored step a proposal covers, or null when it covers none or many.
 */
function soleAuthoredStep(proposal: any, stepsByLabel?: Map<string, any>): any | null {
  if (!stepsByLabel || stepsByLabel.size === 0) return null;
  const labels = Array.isArray(proposal?.flowStepLabels) ? proposal.flowStepLabels.filter((l: unknown) => typeof l === "string") : [];
  if (labels.length !== 1) return null;
  return stepsByLabel.get(String(labels[0]).trim().toLowerCase()) ?? null;
}

/**
 * The state key an authored step's result belongs under, whatever KIND of node
 * it becomes -- including a human checkpoint.
 *
 * A gate's result is the thing a following decision has to read: "was the
 * contract certainty review approved?". Its key was a slug of the agent name
 * the proposer invented, so the decision node after it had no reliable name to
 * read, and the same unsatisfiable-branch dead-end followed. An approval drawn
 * as "Contract Certainty Review" now writes contract_certainty_review.
 *
 * The same is true of an agent, and for the same reason: an agent step drawn
 * as "Endorsement Accepted?" was built as "Endorsement Accepted? Agent" and
 * filed its result under that name's slug, while the author's rules read
 * endorsement_accepted. Both branches went unsatisfied and every later step
 * was skipped, with the build, the sync and the deploy all reporting success
 * (live 2026-09-29). Every node built from an authored step now writes under
 * the step's own key, whatever the agent was named.
 */
export function authoredStateKey(proposal: any, stepsByLabel?: Map<string, any>): string | undefined {
  const step = soleAuthoredStep(proposal, stepsByLabel);
  const key = step ? stateKeyForLabel(step.label ?? "") : "";
  return key || undefined;
}

/**
 * What the step this worker covers should be recorded as on its blueprint node.
 *
 * Without it, a team built from a flow could never be synced back from that
 * flow: the sync correlates by a persisted step id (shared/process-flow-correlation.ts)
 * and, finding none, can only offer to rebuild every agent from scratch. Only a
 * worker covering exactly ONE step gets a correlation -- a node covering two
 * cannot be diffed per step, and claiming otherwise would let a sync rewrite a
 * step nobody touched.
 */
function correlationFor(proposal: any, stepsByLabel?: Map<string, any>): Record<string, unknown> | null {
  const step = soleAuthoredStep(proposal, stepsByLabel);
  return step ? (stepCorrelation(step) as unknown as Record<string, unknown>) : null;
}

function executionFromAuthoredStep(proposal: any, stepsByLabel?: Map<string, any>): Record<string, unknown> | null {
  const step = soleAuthoredStep(proposal, stepsByLabel);
  if (!step) return null;
  const config = (step.config ?? {}) as Record<string, any>;
  // The authored step's own name is the key its result lands under, so a gate
  // written while drawing the flow ("treaty_check.breached == true") names a
  // field that exists. Without it the key is a slug of the agent name the
  // proposer invented, which nobody authoring the flow could have predicted --
  // and an edge rule naming a field no step writes leaves every branch
  // unsatisfied, dead-ending the run. See shared/state-key.ts.
  const stateKey = stateKeyForLabel(step.label ?? "");
  switch (classifyStep({ type: step.type, config })) {
    case "expression":
      return { kind: "expression", expression: config.expression, stateKey };
    case "knowledge_base":
      return { kind: "knowledge_base", knowledgeBaseId: config.kbId, knowledgeBaseQuery: config.kbQuery || step.description || step.label, stateKey };
    case "tool_call":
      return { kind: "tool_call", toolServerId: config.toolServerId, toolName: config.toolName, toolArgs: config.toolArgs, stateKey };
    case "skill":
      return { kind: "skill", skillId: config.skillId, stateKey };
    case "structural":
      // A fan-out marker, and a decision whose every branch is a rule, are
      // routing rather than work: what decides the next step is on the edges,
      // not in the node. Usually such a step is claimed by no agent at all and
      // deriveEdgesFromFlow walks straight through it; this is the case where
      // an agent DID claim one, and without it the step would fall through to
      // `null` and be built as an agent -- the cost the author was shown not
      // being the cost they paid. Kept as a free node rather than spliced out
      // so the flow and the built team stay one-to-one, which the
      // flow-to-automation sync needs to show a one-step diff instead of
      // "every agent superseded".
      return step.type === "parallel" || step.type === "make_decision"
        ? { kind: "expression", expression: '{ "branchesStartHere": true }', stateKey }
        : null;
    default:
      return null;
  }
}

/**
 * Why a JSONata string is compiled here and not left to the run.
 *
 * The rule above -- an incomplete descriptor falls back to an agent, because a
 * failed run is a worse outcome than a model call -- was only applied to a
 * MISSING expression. An expression that is present and does not parse is the
 * same case and was not covered, so a typo became a dead run.
 *
 * Live 2026-09-25: a drafting model wrote `$x := $states.foo.output; {...}` for
 * a confidence gate -- `;` is only legal inside a ( ) block, and `$states` is
 * a namespace this engine does not have. The node was built, the run reached
 * it at wave 3 of 20, the node failed to compile, and every node after it was
 * skipped: twenty agents' worth of work lost to one unparsed string that was
 * knowable at build time.
 */
function compiles(expression: string): string | null {
  try {
    jsonata(expression);
    return null;
  } catch (e: any) {
    return String(e?.message || e).slice(0, 200);
  }
}

/** A connector id, as opposed to a connector's human name. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The conditions on the branches leaving this step, as the proposal draws them.
 *
 * Matched by every name the edge's `from` might use: the agent the proposer named,
 * its role, or the flow step label the worker covers -- a flow's "Endorsement
 * Accepted?" becomes an agent called "Endorsement Decision Router", and the edge
 * may say either. No match means no conditions, which leaves the build exactly as
 * it was rather than guessing.
 */
function branchConditionsFor(proposal: any, pipeline: any): string[] {
  const edges = Array.isArray(pipeline?.edges) ? pipeline.edges : [];
  const names = new Set(
    [proposal?.name, proposal?.role, ...(Array.isArray(proposal?.flowStepLabels) ? proposal.flowStepLabels : [])]
      .map((v) => String(v ?? "").trim().toLowerCase())
      .filter(Boolean),
  );
  if (names.size === 0) return [];
  return edges
    .filter((e: any) => names.has(String(e?.from ?? "").trim().toLowerCase()))
    .map((e: any) => (typeof e?.branchCondition === "string" ? e.branchCondition.trim() : ""))
    .filter((c: string) => !!c);
}

/**
 * The branches out of the step this worker covers, as the decision kind needs
 * them: the author's label for each, and the condition if one was written.
 * Same matching as branchConditionsFor.
 */
function branchesFor(proposal: any, pipeline: any): DecisionBranch[] {
  const edges = Array.isArray(pipeline?.edges) ? pipeline.edges : [];
  const names = new Set(
    [proposal?.name, proposal?.role, ...(Array.isArray(proposal?.flowStepLabels) ? proposal.flowStepLabels : [])]
      .map((v) => String(v ?? "").trim().toLowerCase())
      .filter(Boolean),
  );
  if (names.size === 0) return [];
  const out: DecisionBranch[] = [];
  for (const e of edges) {
    if (!names.has(String(e?.from ?? "").trim().toLowerCase())) continue;
    const condition = typeof e?.branchCondition === "string" ? e.branchCondition.trim() : "";
    const label = (typeof e?.label === "string" && e.label.trim()) || condition;
    if (!label) continue;
    out.push({ label, ...(condition ? { condition } : {}), ...(typeof e?.to === "string" ? { to: e.to } : {}) });
  }
  return out;
}

/**
 * A make_decision step drawn with labelled branches becomes ONE decision node
 * (nodeType "decision") when the flag or the step opts in: one decision-model
 * call chooses among its branches, and its outgoing edges are "decision" edges
 * satisfied by that choice. Null when the step is not one, and the ordinary
 * derivation below applies.
 */
function decisionNodeFor(
  proposal: any,
  stepsByLabel: Map<string, any> | undefined,
  branches: DecisionBranch[] | undefined,
  decisionKind: boolean | undefined,
  classifiers?: Map<string, ClassifierBinding>,
  warn?: (message: string) => void,
): { nodeType: string; stateKey?: string; config: Record<string, unknown> } | null {
  const step = soleAuthoredStep(proposal, stepsByLabel);
  if (!step) return null;
  const raw = (step.config ?? {}) as Record<string, any>;
  // A step bound to a named classifier takes the classifier's question, options
  // or levels and threshold now, over the copy it carries, so an edit to the
  // classifier reaches the team on its next build. A row that is gone leaves
  // the copy standing, with a warning.
  const bound = typeof raw.classifierId === "string" && raw.classifierId ? classifiers?.get(raw.classifierId) : undefined;
  if (typeof raw.classifierId === "string" && raw.classifierId && classifiers && !bound) warn?.(`"${step.label}" is bound to a classifier that no longer exists; built from the copy the step carries.`);
  const config = withClassifier(raw, bound) as Record<string, any>;
  if (classifyStep({ type: step.type, config }, { outgoingEdges: branches ?? [], decisionKind }) !== "decision") return null;
  const threshold = Number(config.confidenceThreshold);
  const answerType = decisionAnswerType(config);
  if (answerType !== "branch") {
    // A value-writing decision: its options or levels come from the step itself,
    // its edges are ordinary, and "unsure: gate" has no branch to go to.
    const authored = answerType === "classify" ? { options: decisionOptionsFor(config) } : { levels: decisionLevelsFor(config) };
    return {
      nodeType: "decision",
      stateKey: stateKeyForLabel(step.label ?? ""),
      config: {
        decision: {
          answerType,
          question: String(config.question || step.description || step.label || "").trim() || `What is "${step.label}"?`,
          ...authored,
          ...(Number.isFinite(threshold) && threshold >= 0 && threshold <= 1 ? { threshold } : {}),
          ...(typeof config.classifierId === "string" && config.classifierId ? { classifierId: config.classifierId } : {}),
          ...(typeof config.classifierName === "string" && config.classifierName ? { classifierName: config.classifierName } : {}),
        },
      },
    };
  }
  const options = (branches ?? []).map((b) => ({ label: b.label, description: b.condition || b.label }));
  if (options.length < 2) return null;
  return {
    nodeType: "decision",
    stateKey: stateKeyForLabel(step.label ?? ""),
    config: {
      decision: {
        // The author's own question when the inspector holds one; else the step's description.
        question: String(config.question || step.description || step.label || "").trim() || `Which branch should "${step.label}" take?`,
        options,
        ...(Number.isFinite(threshold) && threshold >= 0 && threshold <= 1 ? { threshold } : {}),
        ...(config.unsure === "gate" ? { unsure: "gate" } : {}),
      },
    },
  };
}

function deterministicNodeFor(
  proposal: any,
  stepsByLabel?: Map<string, any>,
  warn?: (message: string) => void,
  servers?: Array<{ id: string; name: string }>,
  branchConditions?: string[],
  branches?: DecisionBranch[],
  decisionKind?: boolean,
  classifiers?: Map<string, ClassifierBinding>,
): { nodeType: string; refSkillId?: string; refKnowledgeBaseId?: string; stateKey?: string; config: Record<string, unknown> } | null {
  // A decision drawn with branches, when the kind is on: settled before the
  // ordinary derivation, which has no case for it.
  const decision = decisionNodeFor(proposal, stepsByLabel, branches, decisionKind, classifiers, warn);
  if (decision) return decision;
  // The authored step first, and only then whatever the proposer invented.
  //
  // This order is the point of the comment above, and it used to read the other
  // way round: a proposer that volunteered an `execution` beat the tool binding
  // and the expression the author had actually drawn. Live 2026-09-25, for a
  // step configured to compare a coastal aggregate against a treaty limit, the
  // model supplied an expression that compared the AGGREGATE against the
  // SINGLE-RISK limit, over three field names that exist in no system, and
  // would have run in place of the author's. It looks deterministic and is
  // confidently wrong, which is worse than an agent that says it is unsure.
  const authored = executionFromAuthoredStep(proposal, stepsByLabel);
  const exec = authored ?? proposal?.execution;
  if (!exec || typeof exec !== "object") return null;
  const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  // Only an authored step carries one; a proposer-supplied `execution` does not,
  // and those nodes keep the engine's slug-of-the-node-label default.
  const stateKey = text(exec.stateKey) || undefined;
  switch (exec.kind) {
    case "expression": {
      const expression = text(exec.expression);
      if (!expression) return null;
      const broken = compiles(expression);
      if (broken) {
        warn?.(`"${proposal?.name ?? "A step"}" was going to run without a model, but its expression does not parse (${broken}), so it runs as an agent instead. Fix the expression to make the step free and deterministic.`);
        console.warn(`[team-build] expression for "${proposal?.name}" does not compile, falling back to an agent: ${broken}`);
        return null;
      }
      // A proposer-invented expression must not replace a decision whose branches
      // the author wrote as sentences.
      //
      // Live 2026-09-27, af9a6f18: the flow drew "Endorsement Accepted?" as a
      // make_decision with NO expression, and three branches reading "Endorsement
      // approved", "Endorsement rejected AND fewer than 2 redraft rounds used",
      // "Endorsement rejected". The proposer volunteered
      //   { "route": review.approved ? "approved" : (review.redraftCount < 2 ? "redraft" : "escalate") }
      // over `review.*`, which no step writes -- so it evaluated to "escalate" on
      // every run -- while the branches kept asking about approved/rejected. The
      // step completed, neither branch matched, and every remaining step (filing,
      // pre-bind, both sign-offs, the binder, the bordereau, the notification) was
      // skipped. The run reported success having bound nothing.
      //
      // An agent's answer is prose, which is what those branches can actually be
      // judged against, so the step runs as an agent and the author is told how to
      // get determinism back. An expression the AUTHOR wrote is left alone: the
      // platform does not overrule a person's own step, it refuses a model's
      // invention that contradicts what the person drew (checkBlueprintInvariants
      // reports the authored case instead).
      const branches = (branchConditions ?? []).filter(Boolean);
      if (!authored && branches.length > 0 && branches.every((c) => !parseConditionToRule(c))) {
        warn?.(`"${proposal?.name ?? "A step"}" is drawn as a decision whose branches read ${branches.map((c) => `"${c}"`).join(" and ")} — sentences, which only a model can judge. It runs as an agent so those branches can be judged against what it says; the expression offered for it would have emitted fields of its own, satisfied neither branch, and skipped every step after it while the run still reported success. To make the step free and deterministic, write its branches as rules over the fields its own expression emits.`);
        console.warn(`[team-build] refusing a proposer-invented expression for "${proposal?.name}": its ${branches.length} branch condition(s) are prose and would never match the emitted fields`);
        return null;
      }
      return { nodeType: "expression", stateKey, config: { expression } };
    }
    case "knowledge_base":
      return text(exec.knowledgeBaseId)
        // The query is fixed at authoring time: this is retrieval scoped to the
        // graph, not an agent that can reformulate what it asks for. The step's
        // own description is the sensible default for what to look up.
        ? { nodeType: "knowledge_base", refKnowledgeBaseId: text(exec.knowledgeBaseId), stateKey, config: { kbQuery: text(exec.knowledgeBaseQuery) || text(proposal?.description) } }
        : null;
    case "skill":
      return text(exec.skillId) ? { nodeType: "skill", refSkillId: text(exec.skillId), stateKey, config: {} } : null;
    case "tool_call": {
      if (!text(exec.toolServerId) || !text(exec.toolName)) return null;
      // A proposer names connectors the way a person does -- "Insurity Rating &
      // Predict Engine" -- and that string lands in toolServerId, where the
      // dispatcher looks up a server BY ID and finds nothing. The run then says
      // "the connector reported no tools", which reads like a broken connector
      // rather than a wrong id: live 2026-09-26 it killed both rating steps of a
      // journey whose other tool calls, authored with real ids, worked fine.
      //
      // So resolve a non-id by name, with the same matcher the worker-binding
      // path already uses. If nothing matches, fall back to an agent rather than
      // building a node whose call can never dispatch.
      let serverId = text(exec.toolServerId);
      if (!UUID.test(serverId)) {
        const matched = servers && servers.length ? resolveBindingServer(serverId, servers) : undefined;
        if (!matched) {
          warn?.(`"${proposal?.name ?? "A step"}" was going to call ${text(exec.toolName)} on a connector named "${serverId}", and no connector of that name is available to this organization, so it runs as an agent instead.`);
          console.warn(`[team-build] toolServerId "${serverId}" for "${proposal?.name}" is not an id and matches no connector by name; falling back to an agent`);
          return null;
        }
        console.info(`[team-build] resolved connector name "${serverId}" to ${matched.id} ("${matched.name}") for "${proposal?.name}"`);
        serverId = matched.id;
      }
      const toolArgs = (exec.toolArgs && typeof exec.toolArgs === "object") ? exec.toolArgs as Record<string, any> : {};
      // An argument's $expr is evaluated against run state exactly as a node's
      // expression is, and fails the node the same way -- the call is never
      // dispatched. Checked here for the same reason.
      for (const [name, spec] of Object.entries(toolArgs)) {
        const expr = (spec as { $expr?: unknown } | null)?.$expr;
        if (typeof expr !== "string") continue;
        const broken = compiles(expr);
        if (broken) {
          warn?.(`"${proposal?.name ?? "A step"}" was going to call ${text(exec.toolName)} without a model, but the expression for its "${name}" argument does not parse (${broken}), so it runs as an agent instead.`);
          console.warn(`[team-build] toolArgs.${name} for "${proposal?.name}" does not compile, falling back to an agent: ${broken}`);
          return null;
        }
      }
      return { nodeType: "tool_call", stateKey, config: { toolServerId: serverId, toolName: text(exec.toolName), toolArgs } };
    }
    default:
      return null;
  }
}

export const teamAgentProposalSchema = z.object({
  name: z.string(),
  description: z.string(),
  role: z.string().optional(),
  riskTier: z.string().optional(),
  autonomyMode: z.string().optional(),
  modelProvider: z.string().optional(),
  modelName: z.string().optional(),
  tools: z.array(z.object({ name: z.string(), description: z.string() })).optional(),
  kpiBindings: z.array(z.string()).optional(),
  workflowSteps: z.array(z.string()).optional(),
  estimatedImpact: z.string().optional(),
  templateMatch: z.string().nullable().optional(),
  suggestedKnowledgeBases: z.array(z.object({ id: z.string(), name: z.string() })).optional(),
  mcpToolBindings: z.array(z.object({ server: z.string(), tool: z.string() })).optional(),
  matchedSkills: z.array(z.string()).optional(),
  matchedOntologyConcepts: z.array(z.string()).optional(),
  policyConstraints: z.array(z.string()).optional(),
  complianceTags: z.array(z.string()).optional(),
  systemPrompt: z.string().optional(),
  suggestedRagPipeline: z.string().nullable().optional(),
  suggestedBlueprintId: z.string().nullable().optional(),
  outputSchema: z.object({
    type: z.string(),
    description: z.string(),
    fields: z.array(z.object({ name: z.string(), type: z.string(), description: z.string() })),
  }).nullable().optional(),
  // True when this worker represents a manual human decision (manager
  // approval, compliance sign-off, manual review) rather than an
  // automated LLM/system step -- lets create-team-from-proposals build
  // a real pause-and-wait edge_gate blueprint node (dag-execution-engine.ts's
  // executeGateNode) instead of an internal_agent that merely
  // role-plays the human's decision via an LLM call.
  isHumanCheckpoint: z.boolean().optional(),
  /**
   * The business steps this agent covers, copied verbatim from the flow. The
   * proposal prompt already asks for these to sequence the team; they are also
   * how a step's own authored configuration reaches the builder, so an
   * Expression step drawn on the canvas becomes an expression node even when the
   * proposal forgot to say so.
   */
  flowStepLabels: z.array(z.string()).optional(),
  /**
   * How this step runs when it semantically needs no model at all -- the same idea as
   * isHumanCheckpoint above, for the engine's zero-token node types.
   *
   * Until this existed, the conversion could only ever emit internal_agent or
   * edge_gate, so an authored Expression step was handed to a language model to
   * do arithmetic, and a step that was purely "post this record" paid for a
   * model call to make one tool call. The engine has executed expression,
   * knowledge_base, skill and (now) tool_call nodes for nothing all along; this
   * is how a proposal reaches them.
   *
   * A malformed descriptor falls back to an ordinary agent rather than failing
   * the build: a step that costs too much still works, while a step wired to a
   * node the engine would refuse does not.
   */
  execution: z.object({
    kind: z.enum(["expression", "knowledge_base", "skill", "tool_call"]),
    /** expression: JSONata over the run's state. */
    expression: z.string().optional(),
    /** knowledge_base: the base to search, and the query to search it with. */
    knowledgeBaseId: z.string().optional(),
    knowledgeBaseQuery: z.string().optional(),
    /** skill: the procedure whose text this step contributes. */
    skillId: z.string().optional(),
    /** tool_call: the connector, the tool, and its arguments (literal, or { "$expr": "<JSONata>" }). */
    toolServerId: z.string().optional(),
    toolName: z.string().optional(),
    toolArgs: z.record(z.any()).optional(),
  }).optional(),
});

export const teamBuildBodySchema = z.object({
  // Optional: business-user flows (Create Team, Process Flows) call this without
  // a pre-existing Outcome Contract. When absent, outcome-scoped policy inheritance
  // and status updates are skipped -- everything else works standalone.
  outcomeId: z.string().optional(),
  industry: z.string().optional(),
  // Journey Library: when set, the created orchestrator is marked as a
  // curated, pre-built starting journey (see agents.isCuratedJourney)
  // instead of one-off scaffolding, so it shows up on the Journey
  // Library page. Left unset for ordinary chat-proposal team creation.
  markAsCuratedJourney: z.boolean().optional(),
  journeySubVertical: z.string().optional(),
  // The saved process flow this team was drawn from, so the flow can record
  // which journey it became. A flow authored FROM a journey already carries
  // that link; one drawn first in the Studio and then turned into an
  // automation had no way to write it back, leaving the journey with no
  // process flow attached and every re-draft orphaning another one.
  processFlowId: z.string().optional(),
  orchestrator: teamAgentProposalSchema,
  workers: z.array(teamAgentProposalSchema).min(1),
  pipeline: z.object({
    pattern: z.string().optional(),
    patternReasoning: z.string().optional(),
    description: z.string().optional(),
    edges: z.array(pipelineEdgeSchema).optional(),
    parallelGroups: z.array(z.array(z.string())).optional(),
    executionGraph: z.array(z.object({
      stage: z.number(),
      agents: z.array(z.string()),
      waitForAll: z.boolean().optional(),
    })).optional(),
    agentDependencyMatrix: z.array(z.object({
      agent: z.string(),
      inputs: z.array(z.string()).default([]),
      outputs: z.array(z.string()).default([]),
      dependsOn: z.array(z.string()).default([]),
    })).optional(),
    humanCheckpoints: z.array(z.object({
      agentName: z.string(),
      type: z.string().optional(),
      description: z.string().optional(),
    })).optional(),
    errorHandling: z.string().optional(),
    handoffRules: z.string().optional(),
    /** Set by propose-agents when the sequencing came from a drawn flow. */
    edgesDerivedFromFlow: z.boolean().optional(),
  }).nullable().optional(),
  processFlowSteps: z.array(z.any()).optional(),
});

export type TeamAgentProposal = z.infer<typeof teamAgentProposalSchema>;
export type TeamBuildBody = z.infer<typeof teamBuildBodySchema>;

/**
 * Re-exported from shared/ so the flow sync can write the same rule. Anything
 * importing it from here keeps working.
 */
export { REWORK_REQUESTED_RULE };

export async function buildTeamFromProposal(body: TeamBuildBody, opts: { orgId: string }) {
  // Everything the build creates or reads belongs to this organization.
  const orgId = opts.orgId;
  const { outcomeId, industry: reqIndustry, markAsCuratedJourney, journeySubVertical, orchestrator, workers, pipeline, processFlowSteps } = body;

  const outcome = outcomeId ? await storage.getOutcome(outcomeId, orgId) : null;
  if (outcomeId && !outcome) throw new TeamBuildNotFoundError("Outcome not found");

  // The auto-matcher links whatever it finds here to the new agents, so it
  // must never see another tenant's connectors.
  const allMcpServers = await storage.getMcpServers(orgId);

  // The AI proposal only names skills ("matchedSkills": exact skill names, per the
  // prompt schema above) -- resolve those against the real catalog so the created
  // agent's preloadedSkills (what agent-runtime.ts actually reads at prompt-assembly
  // time) is populated, not just the display-only runtimeConfig.matchedSkills below.
  const orgSkills = (await storage.getSkills(orgId)).filter(s => s.status === "active");
  const skillsByLowerName = new Map(orgSkills.map(s => [s.name.toLowerCase().trim(), s]));
  const resolveMatchedSkills = function(names?: string[]): { skillId: string; skillName: string }[] {
    if (!names?.length) return [];
    return names
      .map(name => skillsByLowerName.get(name.toLowerCase().trim()))
      .filter((s): s is typeof orgSkills[0] => !!s)
      .map(s => ({ skillId: s.id, skillName: s.name }));
  };

  // Third instance of the same shape bug. "policyConstraints" is policy
  // NAMES per the prompt schema, but both write sites below stored them as
  // { policies: [...names] } -- an object with no policy ids. That shape is
  // explicitly skipped by BOTH consumers: resolvePolicyBundle (helpers.ts)
  // bails on it because "old shape has no per-policy IDs", and
  // buildAgentSystemPrompt's ACTIVE POLICY ENFORCEMENT section requires
  // Array.isArray(policyBindings). So every policy an agent was supposedly
  // bound to reached neither the prompt nor the enforcement path. Resolve
  // names against the real table into the array-of-{policyId} shape those
  // consumers actually read.
  const orgPolicies = (await storage.getPolicies(orgId)).filter(p => p.status === "active");
  const policiesByLowerName = new Map(orgPolicies.map(p => [p.name.toLowerCase().trim(), p]));
  const resolvePolicyBindings = function(names?: string[]): Array<{ policyId: string; policyName: string; enforcement: string }> {
    if (!names?.length) return [];
    const out: Array<{ policyId: string; policyName: string; enforcement: string }> = [];
    for (const raw of names) {
      const match = policiesByLowerName.get((raw || "").toLowerCase().trim());
      if (!match || out.some(o => o.policyId === match.id)) continue;
      // Carry the policy's own declared enforcement rather than inventing
      // one -- a binding-level override here would silently upgrade a
      // monitor policy into a hard block.
      const enforcement = ((match.policyJson as any)?.enforcement
        || (match.policyJson as any)?.enforcement_mode
        || "monitor") as string;
      out.push({ policyId: match.id, policyName: match.name, enforcement });
    }
    return out;
  };

  // Same problem as skills above, but this one shipped broken: "matchedOntologyConcepts"
  // is exact ontology concept LABELS per the propose-agents prompt schema, but this route
  // (a separate request from propose-agents, with no access to that request's ranked
  // concept list) was previously writing them straight onto ontologyTags as
  // { concepts: [...labels] } -- a plain object of unresolved label strings, not the
  // Array<{conceptId, conceptLabel}> shape agent-runtime.ts's live prompt injection,
  // eval generation, compliance scoring, and skill matching all expect. Every one of
  // those silently no-ops on a non-array. Resolve against the real table instead, the
  // same "generate then post-validate" pattern already proven in draftSingleAgent
  // (helpers.ts) -- exact label match first, then a loose substring fallback for minor
  // drift, dropping anything that still doesn't resolve rather than inventing an id.
  //
  // Live data from generating the Phase 2 journey library caught a gap in that: this
  // ontology's concept ids aren't all UUIDs -- some are human-readable slugs (e.g.
  // "insurance-la-cash-value"), and propose-agents' own prompt shows the LLM both id
  // and label per candidate. The LLM sometimes echoes the id instead of the label
  // despite the schema asking for labels -- label-only matching then correctly (by
  // design) dropped those as unresolved, but that silently lost real grounding rather
  // than recovering it, e.g. one worker ended up with zero ontology tags. Try id first.
  const industryConcepts = reqIndustry ? await storage.getOntologyConcepts(reqIndustry) : [];
  const conceptsById = new Map(industryConcepts.map(c => [c.id, c]));
  const conceptsByLowerLabel = new Map(industryConcepts.map(c => [c.label.toLowerCase().trim(), c]));
  const resolveOntologyTags = function(labels?: string[]): { conceptId: string; conceptLabel: string }[] {
    if (!labels?.length || industryConcepts.length === 0) return [];
    const resolved: { conceptId: string; conceptLabel: string }[] = [];
    for (const raw of labels) {
      const needle = raw.toLowerCase().trim();
      const match = conceptsById.get(raw?.trim()) ?? conceptsByLowerLabel.get(needle) ?? industryConcepts.find(c => {
        const label = c.label.toLowerCase();
        return label.includes(needle) || needle.includes(label);
      });
      if (match) resolved.push({ conceptId: match.id, conceptLabel: match.label });
    }
    return resolved;
  };

  // The LLM only ever names knowledge bases; the id it returns alongside is
  // NOT trustworthy -- unlike skills and ontology concepts above, this path
  // previously passed kb.id straight into createAgentKnowledgeBase, so a
  // hallucinated id either violated the FK or silently pointed at nothing
  // (the surrounding try/catch swallowed both). Resolve against the real
  // table, same generate-then-post-validate discipline as everything else.
  const orgKnowledgeBases = await storage.getKnowledgeBases(orgId);
  const kbById = new Map(orgKnowledgeBases.map(k => [k.id, k]));
  const kbByLowerName = new Map(orgKnowledgeBases.map(k => [k.name.toLowerCase().trim(), k]));
  const resolveKnowledgeBases = function(suggested?: Array<{ id: string; name: string }>): string[] {
    if (!suggested?.length) return [];
    const ids: string[] = [];
    for (const s of suggested) {
      const match = kbById.get(s?.id) ?? kbByLowerName.get((s?.name || "").toLowerCase().trim());
      if (match && !ids.includes(match.id)) ids.push(match.id);
    }
    return ids;
  };

  // What actually decides whether a tool call works at run time is whether
  // the server's enterprise integration has a usable connection for this
  // org -- see RealMcpBase.callTool ("Integration 'x' is not connected"),
  // which fails on missing credentials, NOT on mcp_servers.status. Servers
  // with no integrationId (mock/demo routers) aren't gated this way.
  const connectionsOrgId = orgId;
  const connectedIntegrationIds = new Set(
    (connectionsOrgId
      ? await storage.listIntegrationConnections(connectionsOrgId).catch(() => [])
      : []
    ).filter(c => c.status === "connected").map(c => c.integrationId),
  );

  // Reports what it actually linked so the caller can surface honestly-unmet
  // bindings instead of silently leaving a gap. propose-agents can name a
  // server for an integration nobody has connected (a known, pre-existing
  // behaviour), and linking to one regardless produced an MCP Servers tab
  // that looked populated while the node would fail at run time.
  const linkMcpBindings = async function(agentId: string, bindings?: Array<{ server: string; tool: string }>) {
    const linked: string[] = [];
    const unresolved: string[] = [];
    const unconnected: string[] = [];
    if (!bindings?.length) return { linked, unresolved, unconnected };
    const serverNames = Array.from(new Set(bindings.map(b => b.server)));
    for (const serverName of serverNames) {
      const matched = resolveBindingServer(serverName, allMcpServers);
      if (!matched) { unresolved.push(serverName); continue; }
      // Still linked (the binding is a real, intentional part of the plan and
      // the integration may be connected later) -- but recorded separately so
      // it can be shown as needing connection rather than passing as ready.
      if (matched.integrationId && !connectedIntegrationIds.has(matched.integrationId)) {
        unconnected.push(matched.name);
      }
      try {
        const existing = await storage.getAgentMcpServerByIds(agentId, matched.id);
        if (!existing) {
          await storage.createAgentMcpServer({ agentId, serverId: matched.id });
        }
        linked.push(matched.name);
      } catch {}
    }
    return { linked, unresolved, unconnected };
  }

  const composeTaskPrompt = function(agent: TeamAgentProposal, isOrchestrator: boolean): string {
    const lines: string[] = [];
    lines.push(`Role: ${agent.role || agent.name}`);
    lines.push(`Goal: ${agent.description}`);
    const nonEmptySteps = (agent.workflowSteps || []).filter(step => step && step.trim());
    if (nonEmptySteps.length) {
      lines.push(`\nWorkflow Steps:`);
      nonEmptySteps.forEach((step, i) => lines.push(`${i + 1}. ${step}`));
    }
    if (agent.tools?.length) {
      lines.push(`\nAvailable Tools: ${agent.tools.map(t => t.name).join(", ")}`);
    }
    if (agent.kpiBindings?.length) {
      lines.push(`\nKPIs to optimize: ${agent.kpiBindings.join(", ")}`);
    }
    if (agent.estimatedImpact) {
      lines.push(`\nExpected Impact: ${agent.estimatedImpact}`);
    }
    if (isOrchestrator && pipeline) {
      lines.push(`\nOrchestration Pattern: ${pipeline.pattern || "supervisor"}`);
      if (pipeline.errorHandling) lines.push(`Error Handling: ${pipeline.errorHandling}`);
      if (pipeline.handoffRules) lines.push(`Handoff Rules: ${pipeline.handoffRules}`);
    }
    if (agent.outputSchema && agent.outputSchema.type === "record_list" && agent.outputSchema.fields?.length) {
      lines.push(`\n═══ STRUCTURED OUTPUT REQUIREMENTS ═══`);
      lines.push(`You MUST produce per-record structured output for every ${agent.outputSchema.description || "data record"} you process.`);
      lines.push(`After your natural language summary, output a JSON block wrapped in \`\`\`json ... \`\`\` markers containing a "processedRecords" array.`);
      lines.push(`Each element in the array must have these fields:`);
      for (const field of agent.outputSchema.fields) {
        lines.push(`  - ${field.name} (${field.type}): ${field.description}`);
      }
      lines.push(`Process EVERY record from the data — do not summarize or skip any.`);
      lines.push(`The platform will render this as an interactive data table for review.`);
    } else if (agent.outputSchema && agent.outputSchema.type === "summary" && agent.outputSchema.fields?.length) {
      // Downstream deterministic edges (buildPipelineState/extractStructuredOutput in
      // agent-runtime.ts) read fields directly off the first fenced JSON block in this
      // agent's output -- with no instruction to emit one, decision/verification agents
      // silently produce prose-only output and every conditional edge past them (including
      // human-approval gates) gets skipped as "no incoming edge condition satisfied".
      lines.push(`\n═══ STRUCTURED OUTPUT REQUIREMENTS ═══`);
      lines.push(`After your narrative analysis (${agent.outputSchema.description || "your findings"}), you MUST end your response with a JSON block wrapped in \`\`\`json ... \`\`\` markers.`);
      lines.push(`The JSON object must contain exactly these top-level fields:`);
      for (const field of agent.outputSchema.fields) {
        lines.push(`  - ${field.name} (${field.type}): ${field.description}`);
      }
      lines.push(`This is not optional — downstream automation reads these exact field names from your JSON block to decide what happens next (e.g. whether to route for approval). Omitting the JSON block will cause the pipeline to stall.`);
    }
    return lines.join("\n");
  }

  const composeSystemPrompt = function(agent: TeamAgentProposal, isOrchestrator: boolean): string {
    if (agent.systemPrompt && agent.systemPrompt.trim().length > 0) {
      return agent.systemPrompt;
    }
    const industry = reqIndustry || "general";
    const lines: string[] = [];
    lines.push(`You are ${agent.name}, an AI agent operating within the ${industry} industry.`);
    lines.push(`Your role: ${agent.role || agent.description}`);
    if (isOrchestrator) {
      lines.push(`You are the orchestrator agent responsible for coordinating worker agents to deliver "${outcome?.name || orchestrator.description}".`);
      lines.push(`Orchestration pattern: ${pipeline?.pattern || "supervisor"}.`);
    } else {
      lines.push(`You are a worker agent contributing to "${outcome?.name || orchestrator.description}".`);
    }
    if (agent.kpiBindings?.length) {
      lines.push(`You are responsible for optimizing these KPIs: ${agent.kpiBindings.join(", ")}.`);
    }
    if (agent.tools?.length) {
      lines.push(`You have access to these tools: ${agent.tools.map(t => `${t.name} (${t.description})`).join("; ")}.`);
    }
    lines.push(`Risk tier: ${agent.riskTier || "MEDIUM"}. Autonomy mode: ${agent.autonomyMode || "assisted"}.`);
    lines.push(`Always follow compliance requirements and escalate when operating outside your autonomy boundaries.`);
    return lines.join("\n");
  }

  // The industry the plan was built for, when it's a real one; otherwise the organization's (storage default).
  const planIndustryId = reqIndustry && isKnownIndustry(reqIndustry) ? reqIndustry : undefined;
  const teamAgent = await storage.createAgent({
    organizationId: orgId,
    industryId: planIndustryId,
    name: orchestrator.name,
    description: orchestrator.description,
    owner: "system",
    agentType: "team",
    riskTier: orchestrator.riskTier || "MEDIUM",
    autonomyMode: orchestrator.autonomyMode || "assisted",
    modelProvider: orchestrator.modelProvider || "openai",
    modelName: orchestrator.modelName || "gpt-4.1",
    outcomeId,
    toolsConfig: orchestrator.tools || [],
    systemPrompt: composeSystemPrompt(orchestrator, true),
    complianceTags: orchestrator.complianceTags || [],
    ontologyTags: resolveOntologyTags(orchestrator.matchedOntologyConcepts),
    policyBindings: resolvePolicyBindings(orchestrator.policyConstraints),
    preloadedSkills: resolveMatchedSkills(orchestrator.matchedSkills),
    isCuratedJourney: !!markAsCuratedJourney,
    journeyIndustryId: markAsCuratedJourney ? (reqIndustry || null) : null,
    journeySubVertical: markAsCuratedJourney ? (journeySubVertical || null) : null,
    runtimeConfig: {
      prompt: composeTaskPrompt(orchestrator, true),
      kpiBindings: orchestrator.kpiBindings || [],
      workflowSteps: orchestrator.workflowSteps || [],
      estimatedImpact: orchestrator.estimatedImpact || "",
      matchedSkills: orchestrator.matchedSkills || [],
      suggestedRagPipeline: orchestrator.suggestedRagPipeline || null,
      mcpToolBindings: orchestrator.mcpToolBindings || [],
      orchestration: {
        pattern: pipeline?.pattern || "supervisor",
        patternReasoning: pipeline?.patternReasoning || "",
        description: pipeline?.description || "",
        errorHandling: pipeline?.errorHandling || "retry then escalate",
        handoffRules: pipeline?.handoffRules || "pass output as input",
        parallelGroups: pipeline?.parallelGroups || [],
        executionGraph: pipeline?.executionGraph || [],
      },
    },
  });

  // An orchestrator drawn from a flow coordinates; it does not touch the
  // systems. Every call the process makes is a step somebody drew, and those
  // steps carry the tool binding, the arguments and the approval that has to
  // come first.
  //
  // Handing the orchestrator the same connectors gave it the whole journey's
  // reach with none of the journey's controls. Live 2026-09-29, a binder close:
  // the orchestrator made 15 tool calls of its own -- while every drawn step
  // made exactly one -- and among them it lodged the pack with the carrier and
  // closed the reporting period, naming an approver it invented ("Operations
  // Manager David Chen"). The finance sign-off gate never ran; the governed
  // submit and close steps then failed with 409 because the work was already
  // done. Whether a run passed depended on whether the orchestrator got there
  // first, which is why the same team closed one period cleanly and corrupted
  // the next.
  //
  // So a flow-built orchestrator is linked to nothing, and what was withheld is
  // reported rather than dropped quietly -- an author who bound a connector
  // should be told it did not take effect, the same way an unresolved or
  // unconnected binding is surfaced instead of swallowed.
  const builtFromFlow = !!(
    body.processFlowId ||
    (body.processFlowSteps?.length ?? 0) > 0 ||
    pipeline?.edgesDerivedFromFlow
  );
  const withheldFromOrchestrator = builtFromFlow
    ? Array.from(new Set((orchestrator.mcpToolBindings ?? []).map((b) => b.server)))
    : [];
  const orchestratorLinkResult = builtFromFlow
    ? { linked: [], unresolved: [], unconnected: [] }
    : await linkMcpBindings(teamAgent.id, orchestrator.mcpToolBindings);
  if (withheldFromOrchestrator.length) {
    console.info(`[team-build] orchestrator drawn from a flow: withheld ${withheldFromOrchestrator.length} connector binding(s) so every system call stays a drawn step — ${withheldFromOrchestrator.join(", ")}`);
  }

  // Seed a draft mandate from what the proposal already has. No real human
  // owner exists yet at this point (owner: "system" above is an internal
  // placeholder, not a person), so accountableOwnerUserId is left unset for
  // whoever reviews the mandate to fill in. Best-effort: a seeding failure
  // must never block team creation, which already succeeded by this point.
  //
  // Only fields with REAL backing data are populated -- a mandate is a
  // governance document a human signs off on, so an invented "when to stop"
  // is worse than a blank one the reviewer is prompted to fill in.
  const buildMandate = function(a: TeamAgentProposal, isOrchestrator: boolean) {
    const humanCheckpoint = (pipeline?.humanCheckpoints || []).find(h => h.agentName === a.name);
    const kpis = a.kpiBindings || [];
    return {
      whatItDoes: a.description || null,
      mustNever: a.policyConstraints?.length ? a.policyConstraints.join("\n") : null,
      whenToAskAHuman: humanCheckpoint
        ? `${humanCheckpoint.description || humanCheckpoint.type || "Human decision point"} (defined as a checkpoint in this team's flow)`
        : a.isHumanCheckpoint
          ? "This step IS the human decision point in the flow -- it always requires a person."
          : a.autonomyMode === "assisted"
            ? "Autonomy mode is 'assisted': surface the proposed action for approval before acting."
            : null,
      whenToStop: isOrchestrator && pipeline?.errorHandling ? pipeline.errorHandling : null,
      fallbackBehavior: isOrchestrator && pipeline?.handoffRules ? pipeline.handoffRules : null,
      howWeKnowItsWorking: kpis.length
        ? `Bound KPIs: ${kpis.join(", ")}${a.estimatedImpact ? `. Expected impact: ${a.estimatedImpact}` : ""}`
        : a.estimatedImpact || null,
    };
  };

  storage.upsertAgentMandate(teamAgent.id, buildMandate(orchestrator, true), orgId).catch(() => {});

  // The steps as the business user drew them, by label, so a worker that covers
  // exactly one of them can be built as the node that step described rather than
  // as an agent that re-describes it.
  //
  // A caller that names the flow does not also have to send its steps. The
  // Process Flow Studio sends processFlowId only -- it sends the steps to the
  // DRAFTING call, not to this one -- so this map was always empty on the one
  // path that has authored steps at all, and every deterministic node was built
  // from whatever the model invented instead. The nodes still appeared, which
  // is why this read as working: a treaty comparison authored against a
  // connector's own schedule summary ran, live 2026-09-25, as the model's
  // arithmetic over three field names that exist in no system.
  let authoredSteps: any[] = Array.isArray(processFlowSteps) ? processFlowSteps : [];
  if (authoredSteps.length === 0 && body.processFlowId) {
    try {
      const flow = await storage.getProcessFlow(body.processFlowId, orgId);
      const nodes = (flow?.graph as any)?.nodes;
      if (Array.isArray(nodes)) authoredSteps = nodes;
    } catch (err: any) {
      // Not fatal: without the steps every worker is built as an agent, which
      // is the behaviour this had before. Say so, because the difference is
      // otherwise invisible -- a working team that quietly costs a model call
      // per step the author had already made deterministic.
      console.warn(`[create-team] could not read process flow ${body.processFlowId} for its authored steps, so every worker will be built as an agent: ${err?.message}`);
    }
  }
  const authoredStepsByLabel = new Map<string, any>(
    authoredSteps
      .filter((step: any) => step && typeof step.label === "string")
      .map((step: any) => [String(step.label).trim().toLowerCase(), step]),
  );
  // A proposal whose workers did not say which step they cover, or said so in
  // words naming no step, is read from their names here as well as at drafting
  // (server/flow-step-claims.ts): a proposal drafted before that, or edited in
  // between, otherwise reaches this point with nothing to correlate on, and
  // every authored step is built as an agent that re-describes it.
  if (authoredSteps.length > 0) {
    const claimed = inferStepClaims(workers, authoredSteps);
    if (claimed.inferred.length) {
      console.info(`[create-team] inferred the step ${claimed.inferred.length} worker(s) cover from their names: ${claimed.inferred.map((x) => `"${x.agent}" -> "${x.step}"`).join(", ")}`);
      claimed.agents.forEach((w, i) => { workers[i] = w; });
    }
  }
  // Whether a make_decision step with labelled branches becomes a decision node
  // (server/decision-settings.ts); a step's own config.decisionKind overrides it.
  const decisionKind = (await getDecisionSettings().catch(() => null))?.stepKind ?? false;
  // Named classifiers the flow's steps may be bound to (Phase 3): a bound step
  // takes the classifier's question, options or levels and threshold at build.
  const classifiers = new Map<string, ClassifierBinding>();
  try { for (const c of await storage.getDecisionClassifiers(orgId)) classifiers.set(c.id, c as ClassifierBinding); } catch { /* an older storage: steps keep the copy they carry */ }

  const createdWorkers: any[] = [];
  const workerLinkResults: Array<{ linked: string[]; unresolved: string[]; unconnected: string[] }> = [];
  for (const worker of workers) {
    const workerAgent = await storage.createAgent({
      organizationId: orgId,
      industryId: planIndustryId,
      name: worker.name,
      description: worker.description,
      owner: "system",
      agentType: "single",
      riskTier: worker.riskTier || "LOW",
      autonomyMode: worker.autonomyMode || "assisted",
      modelProvider: worker.modelProvider || "openai",
      modelName: worker.modelName || "gpt-4.1-mini",
      outcomeId,
      toolsConfig: worker.tools || [],
      systemPrompt: composeSystemPrompt(worker, false),
      complianceTags: worker.complianceTags || [],
      ontologyTags: resolveOntologyTags(worker.matchedOntologyConcepts),
      policyBindings: resolvePolicyBindings(worker.policyConstraints),
      preloadedSkills: resolveMatchedSkills(worker.matchedSkills),
      blueprintId: worker.suggestedBlueprintId || undefined,
      runtimeConfig: {
        prompt: composeTaskPrompt(worker, false),
        kpiBindings: worker.kpiBindings || [],
        workflowSteps: worker.workflowSteps || [],
        estimatedImpact: worker.estimatedImpact || "",
        matchedSkills: worker.matchedSkills || [],
        suggestedRagPipeline: worker.suggestedRagPipeline || null,
        mcpToolBindings: worker.mcpToolBindings || [],
        outputSchema: worker.outputSchema || null,
      },
    });
    createdWorkers.push(workerAgent);

    storage.upsertAgentMandate(workerAgent.id, buildMandate(worker, false), orgId).catch(() => {});

    workerLinkResults.push(await linkMcpBindings(workerAgent.id, worker.mcpToolBindings));

    await storage.createAgentTeamMember({
      teamAgentId: teamAgent.id,
      memberAgentId: workerAgent.id,
      role: "member",
    });

    for (const kbId of resolveKnowledgeBases(worker.suggestedKnowledgeBases)) {
      try {
        await storage.createAgentKnowledgeBase({ agentId: workerAgent.id, knowledgeBaseId: kbId });
      } catch {}
    }
  }

  // workers[] and createdWorkers[] are parallel arrays (same loop, same
  // order) -- so this maps each created agent back to whether its
  // proposal was flagged as a real human decision, letting the node
  // creation below build a pause-and-wait edge_gate node instead of an
  // internal_agent that would otherwise role-play the human's decision
  // via an LLM call.
  const humanCheckpointWorkerIds = new Set<string>(
    createdWorkers.filter((_, i) => workers[i]?.isHumanCheckpoint).map(w => w.id),
  );

  for (const kbId of resolveKnowledgeBases(orchestrator.suggestedKnowledgeBases)) {
    try {
      await storage.createAgentKnowledgeBase({ agentId: teamAgent.id, knowledgeBaseId: kbId });
    } catch {}
  }

  // Inherit outcome-scoped policies into all created agents so bound governance flows into execution
  if (outcomeId) {
    try {
      // Scope lookup matches on the outcome id alone; keep only this organization's policies.
      const outcomePolicies = (await storage.getPoliciesByScope("outcome", outcomeId)).filter(p => p.organizationId === orgId);
      if (outcomePolicies.length > 0) {
        const allCreated = [teamAgent, ...createdWorkers];
        for (const created of allCreated) {
          // Append in the SAME array-of-{policyId} shape the agent was
          // created with. This previously rewrote policyBindings into the
          // { policies: [...names] } object, which would have undone the
          // resolution above and put the agent back in the shape both
          // resolvePolicyBundle and buildAgentSystemPrompt ignore.
          const existing = Array.isArray(created.policyBindings)
            ? (created.policyBindings as Array<{ policyId?: string }>)
            : [];
          const existingIds = new Set(existing.map(b => b.policyId).filter(Boolean));
          const additions = outcomePolicies
            .filter(p => !existingIds.has(p.id))
            .map(p => ({
              policyId: p.id,
              policyName: p.name,
              enforcement: ((p.policyJson as any)?.enforcement || (p.policyJson as any)?.enforcement_mode || "monitor") as string,
              source: "outcome" as const,
            }));
          if (additions.length > 0) {
            await storage.updateAgent(created.id, {
              policyBindings: [...existing, ...additions],
            }, orgId);
          }
        }
      }
    } catch (_) {}
  }

  const blueprint = await storage.createBlueprint({
    name: `${orchestrator.name} - Team Blueprint`,
    description: pipeline?.description || `Orchestration blueprint for ${orchestrator.name}`,
    agentId: teamAgent.id,
    status: "draft",
    blueprintJson: {
      pattern: pipeline?.pattern || "supervisor",
      patternReasoning: pipeline?.patternReasoning || "",
      description: pipeline?.description || "",
      edges: pipeline?.edges || [],
      parallelGroups: pipeline?.parallelGroups || [],
      executionGraph: pipeline?.executionGraph || [],
      agentDependencyMatrix: pipeline?.agentDependencyMatrix || [],
      humanCheckpoints: pipeline?.humanCheckpoints || [],
      errorHandling: pipeline?.errorHandling || "retry then escalate",
      handoffRules: pipeline?.handoffRules || "pass output as input",
      processFlowSteps: authoredSteps,
    },
  });

  const orchestratorNode = await storage.createTeamBlueprintNode({
    blueprintId: blueprint.id,
    nodeType: "internal_agent",
    label: orchestrator.name,
    positionX: 400,
    positionY: 50,
    refAgentId: teamAgent.id,
    config: { role: "orchestrator", pattern: pipeline?.pattern || "supervisor" },
  });

  const workerNodes: any[] = [];

  const pGroups = pipeline?.parallelGroups;
  const execGraph = pipeline?.executionGraph;
  const depMatrix = pipeline?.agentDependencyMatrix;

  let tiers: Array<{ agents: string[] }> = [];
  if (execGraph && execGraph.length > 0) {
    tiers = execGraph.map(eg => ({ agents: eg.agents }));
  } else if (pGroups && pGroups.length > 0) {
    tiers = pGroups.map(group => ({ agents: group }));
  } else if (depMatrix && depMatrix.length > 0) {
    // Derive wave-ordered tiers from the dependency matrix (Kahn's topological sort)
    const stageMap = new Map<string, number>();
    const allNames = new Set(depMatrix.map((e: any) => e.agent));
    let changed = true;
    while (changed) {
      changed = false;
      for (const entry of depMatrix) {
        const depStages = (entry.dependsOn as string[])
          .filter((d: string) => allNames.has(d))
          .map((d: string) => stageMap.get(d) ?? -1);
        const minStage = depStages.length === 0 ? 0 : Math.max(...depStages) + 1;
        if ((stageMap.get(entry.agent) ?? -1) < minStage) {
          stageMap.set(entry.agent, minStage);
          changed = true;
        }
      }
    }
    const maxStage = Math.max(0, ...Array.from(stageMap.values()));
    tiers = Array.from({ length: maxStage + 1 }, (_, s) => ({
      agents: Array.from(stageMap.entries()).filter(([, st]) => st === s).map(([n]) => n),
    })).filter(t => t.agents.length > 0);
  }

  const hasParallelInfo = tiers.length > 0;
  // When the LLM gave us its own edge topology, build edges directly
  // from it (below, after nodes exist) instead of re-deriving a coarser
  // graph from tier/stage adjacency. Tier adjacency only ever connects
  // consecutive tiers, so it silently drops any edge that skips a tier
  // (e.g. a decision branching straight to a terminal step, bypassing
  // an intermediate approval node reached by the *other* branch) --
  // exactly the shape a decision-with-two-alternatives produces.
  const hasExplicitEdgeSpec = !!(pipeline?.edges && pipeline.edges.length > 0);
  // Problems worth telling the caller about rather than shipping quietly, the
  // same way unconnectedBindings is returned instead of swallowed.
  const structureWarnings: string[] = [];
  // Set where the orchestrator is wired to every worker and to nothing else.
  let builtAsFanOut = false;

  if (hasParallelInfo && tiers.length > 0) {
    let yOffset = 150;
    const tierNodes: Array<any[]> = [];

    // Exact-name lookup, built once, so a stage's agent-name string maps
    // unambiguously to its worker even when several agents share a
    // common first word or substring (e.g. "Claim Details Extraction
    // Agent" and "Claim Routing Decision Agent" both start with
    // "Claim") -- a first-word-only fuzzy match would bind every such
    // stage to whichever of those workers happens to be first in
    // createdWorkers, silently wiring the wrong agent into the node.
    const workerByExactName = new Map(createdWorkers.map(w => [w.name.toLowerCase(), w]));

    for (let tierIdx = 0; tierIdx < tiers.length; tierIdx++) {
      const tier = tiers[tierIdx];
      const tierAgentNodes: any[] = [];
      const agentCount = tier.agents.length;
      const startX = agentCount === 1 ? 400 : 400 - ((agentCount - 1) * 130);

      for (let j = 0; j < tier.agents.length; j++) {
        const agentRole = tier.agents[j];
        let worker = workerByExactName.get(agentRole.toLowerCase());
        let workerIdx = worker ? createdWorkers.indexOf(worker) : -1;
        if (!worker) {
          // No exact match -- fall back to substring matching, preferring
          // the most specific (longest) worker name found within
          // agentRole so a short shared prefix ("Claim") can't outrank a
          // fuller, more specific match ("Claim Routing Decision Agent").
          let bestLen = 0;
          for (let k = 0; k < createdWorkers.length; k++) {
            const w = createdWorkers[k];
            const wName = w.name.toLowerCase();
            const matches = agentRole.toLowerCase().includes(wName) || wName.includes(agentRole.toLowerCase());
            if (matches && wName.length > bestLen) {
              worker = w;
              workerIdx = k;
              bestLen = wName.length;
            }
          }
        }
        if (!worker) worker = createdWorkers[j + tierNodes.flat().length];
        if (!worker) continue;

        const isGate = humanCheckpointWorkerIds.has(worker.id);
        const det = isGate ? null : deterministicNodeFor(workers[workerIdx >= 0 ? workerIdx : j], authoredStepsByLabel, (m) => structureWarnings.push(m), allMcpServers, branchConditionsFor(workers[workerIdx >= 0 ? workerIdx : j], pipeline), branchesFor(workers[workerIdx >= 0 ? workerIdx : j], pipeline), decisionKind, classifiers);
        const correlation = correlationFor(workers[workerIdx >= 0 ? workerIdx : j], authoredStepsByLabel);
        const node = await storage.createTeamBlueprintNode({
          blueprintId: blueprint.id,
          nodeType: isGate ? "edge_gate" : det ? det.nodeType : "internal_agent",
          label: worker.name,
          positionX: startX + j * COL_WIDTH,
          positionY: yOffset,
          // A deterministic node runs no agent, so it holds no agent reference --
          // the same shape a gate node has.
          refAgentId: isGate || det ? null : worker.id,
          refSkillId: det?.refSkillId,
          refKnowledgeBaseId: det?.refKnowledgeBaseId,
          stateKey: det?.stateKey ?? authoredStateKey(workers[workerIdx >= 0 ? workerIdx : j], authoredStepsByLabel),
          gateType: isGate ? "approval" : undefined,
          config: { role: "worker", workerIndex: workerIdx >= 0 ? workerIdx : j, tier: tierIdx, parallel: agentCount > 1, ...(det?.config ?? {}), ...(correlation ?? {}) },
        } as any);
        tierAgentNodes.push(node);
        workerNodes.push(node);
      }
      tierNodes.push(tierAgentNodes);
      yOffset += 140;
    }

    if (!hasExplicitEdgeSpec) {
      if (tierNodes[0]?.length > 0) {
        for (const node of tierNodes[0]) {
          await storage.createTeamBlueprintEdge({
            blueprintId: blueprint.id,
            sourceNodeId: orchestratorNode.id,
            targetNodeId: node.id,
            label: tierNodes[0].length > 1 ? "fork" : "dispatch",
            failureMode: "escalate",
            ...resolveEdgeRule(pipeline?.edges, node.label),
          });
        }
      }

      for (let t = 0; t < tierNodes.length - 1; t++) {
        const currentTier = tierNodes[t];
        const nextTier = tierNodes[t + 1];
        for (const src of currentTier) {
          for (const tgt of nextTier) {
            await storage.createTeamBlueprintEdge({
              blueprintId: blueprint.id,
              sourceNodeId: src.id,
              targetNodeId: tgt.id,
              label: currentTier.length > 1 ? "join → fork" : "handoff",
              failureMode: pipeline?.errorHandling?.includes("retry") ? "retry" : "escalate",
              ...resolveEdgeRule(pipeline?.edges, tgt.label),
            });
          }
        }
      }

      // "Return results to orchestrator" only makes sense for a true
      // single-stage fan-out/fan-in (the orchestrator dispatches one wave
      // of parallel workers and collects their results directly). For a
      // multi-tier pipeline, the orchestrator node is already the root
      // (tierNodes[0] is wired FROM it above), so wiring the LAST tier
      // back to it would create a literal cycle -- computeWaves() rejects
      // any such graph outright, making the blueprint unrunnable. A
      // multi-tier pipeline's last tier is its natural terminus and needs
      // no edge back to the start.
      if (pipeline?.pattern === "fan_out_fan_in" && tierNodes.length === 1) {
        const lastTier = tierNodes[tierNodes.length - 1];
        for (const node of lastTier) {
          await storage.createTeamBlueprintEdge({
            blueprintId: blueprint.id,
            sourceNodeId: node.id,
            targetNodeId: orchestratorNode.id,
            label: "return results",
            failureMode: "escalate",
            ...resolveEdgeRule(pipeline?.edges, orchestratorNode.label),
          });
        }
      }
    }
  } else {
    const isSequential = pipeline?.pattern === "sequential";
    for (let i = 0; i < createdWorkers.length; i++) {
      // Spaced by the card's own width, not by dividing a fixed band: the old
      // form gave six workers 100px each for a 244px card, so they overlapped.
      const { x: posX, y: posY } = workerNodePosition(i, isSequential);
      const isGate = humanCheckpointWorkerIds.has(createdWorkers[i].id);
      const det = isGate ? null : deterministicNodeFor(workers[i], authoredStepsByLabel, (m) => structureWarnings.push(m), allMcpServers, branchConditionsFor(workers[i], pipeline), branchesFor(workers[i], pipeline), decisionKind, classifiers);
      const correlation = correlationFor(workers[i], authoredStepsByLabel);
      const node = await storage.createTeamBlueprintNode({
        blueprintId: blueprint.id,
        nodeType: isGate ? "edge_gate" : det ? det.nodeType : "internal_agent",
        label: createdWorkers[i].name,
        positionX: posX,
        positionY: posY,
        refAgentId: isGate || det ? null : createdWorkers[i].id,
        refSkillId: det?.refSkillId,
        refKnowledgeBaseId: det?.refKnowledgeBaseId,
        stateKey: det?.stateKey ?? authoredStateKey(workers[i], authoredStepsByLabel),
        gateType: isGate ? "approval" : undefined,
        config: { role: "worker", workerIndex: i, ...(det?.config ?? {}), ...(correlation ?? {}) },
      } as any);
      workerNodes.push(node);
    }

    if (!hasExplicitEdgeSpec) {
      if (isSequential) {
        const firstEdgeLabel = pipeline?.edges?.find((e: any) => e.from === "orchestrator" || e.from === orchestrator.name)?.label;
        await storage.createTeamBlueprintEdge({
          blueprintId: blueprint.id,
          sourceNodeId: orchestratorNode.id,
          targetNodeId: workerNodes[0].id,
          label: firstEdgeLabel || "dispatch",
          failureMode: "escalate",
          ...resolveEdgeRule(pipeline?.edges, workerNodes[0].label),
        });
        for (let i = 0; i < workerNodes.length - 1; i++) {
          const edgeLabel = pipeline?.edges?.find((e: any) => e.to === createdWorkers[i + 1].name)?.label;
          await storage.createTeamBlueprintEdge({
            blueprintId: blueprint.id,
            sourceNodeId: workerNodes[i].id,
            targetNodeId: workerNodes[i + 1].id,
            label: edgeLabel || "handoff",
            failureMode: pipeline?.errorHandling?.includes("retry") ? "retry" : "escalate",
            ...resolveEdgeRule(pipeline?.edges, workerNodes[i + 1].label),
          });
        }
      } else {
        builtAsFanOut = true;
        for (let i = 0; i < workerNodes.length; i++) {
          const edgeLabel = pipeline?.edges?.find((e: any) => e.to === createdWorkers[i].name)?.label;
          await storage.createTeamBlueprintEdge({
            blueprintId: blueprint.id,
            sourceNodeId: orchestratorNode.id,
            targetNodeId: workerNodes[i].id,
            label: edgeLabel || "delegate",
            failureMode: "escalate",
            ...resolveEdgeRule(pipeline?.edges, workerNodes[i].label),
          });
        }

        if (pipeline?.pattern === "fan_out_fan_in") {
          builtAsFanOut = false;
          for (let i = 0; i < workerNodes.length; i++) {
            await storage.createTeamBlueprintEdge({
              blueprintId: blueprint.id,
              sourceNodeId: workerNodes[i].id,
              targetNodeId: orchestratorNode.id,
              label: "return results",
              failureMode: "escalate",
              ...resolveEdgeRule(pipeline?.edges, orchestratorNode.label),
            });
          }
        }
      }
    }
  }

  // Build edges directly from the LLM's own pipeline.edges topology when
  // it gave us one, instead of the tier/stage-adjacency construction
  // above (which is skipped via hasExplicitEdgeSpec in that case). This
  // is what lets a decision branch straight to a later node while
  // skipping an intermediate one -- e.g. "Route Decision" -> "Process
  // Outcome" bypassing "Adjuster Review" for the auto-approve path --
  // which tier-adjacency can never represent since it only ever
  // connects consecutive tiers. Matching each edge's rule/condition
  // directly from its own spec (not by a target-name lookup that can't
  // tell two edges into the same target apart) also fixes a case tier
  // adjacency got wrong even when it DID build the right edge: a target
  // reachable by two different incoming edges (e.g. both the skip-branch
  // and the "review then continue" handoff into "Process Outcome") was
  // always getting whichever edge's rule happened to be found first,
  // regardless of which edge that rule actually belonged to.
  if (hasExplicitEdgeSpec) {
    const nodeByName = new Map<string, any>();
    nodeByName.set("orchestrator", orchestratorNode);
    nodeByName.set(orchestrator.name.toLowerCase(), orchestratorNode);
    for (const node of workerNodes) nodeByName.set(node.label.toLowerCase(), node);

    const resolveNode = (name: string | undefined) => {
      if (!name) return undefined;
      const lower = name.toLowerCase();
      const exact = nodeByName.get(lower);
      if (exact) return exact;
      // No exact match -- fall back to the most specific (longest)
      // substring match, same rationale as the worker-matching fix above.
      let best: any; let bestLen = 0;
      for (const [key, node] of Array.from(nodeByName.entries())) {
        const matches = lower.includes(key) || key.includes(lower);
        if (matches && key.length > bestLen) { best = node; bestLen = key.length; }
      }
      return best;
    };

    const created: Array<{ sourceNodeId: string; targetNodeId: string }> = [];
    // Which edges point back up the flow is a property of the whole graph, so it
    // is settled before a single edge is written. Deciding it from the edges
    // created so far made it depend on the order the proposal happened to list
    // them: the same loop became a revision rule when its forward path was listed
    // first, and a real edge -- an unrunnable team -- when it was listed second.
    const resolvedSpecs = pipeline!.edges!
      .map((edgeSpec) => ({ edgeSpec, source: resolveNode(edgeSpec.from), target: resolveNode(edgeSpec.to) }))
      .filter((r): r is { edgeSpec: typeof r.edgeSpec; source: any; target: any } => !!r.source && !!r.target && r.source.id !== r.target.id);
    const specEdges = resolvedSpecs.map((r) => ({ from: r.source.id, to: r.target.id }));
    const backKeys = backEdgeKeys(Array.from(new Set(specEdges.flatMap((e) => [e.from, e.to]))), specEdges);
    for (const { edgeSpec, source, target } of resolvedSpecs) {
      // "Send it back for a rewrite" arrives as an edge pointing back up the flow. As an edge it
      // would make the graph cyclic -- no execution stages, so the team could not run at all. The
      // platform expresses rework as a revision rule on the reviewing step instead: when its output
      // says the work failed, the target step runs again, and everything after it follows.
      if (backKeys.has(edgeKey(source.id, target.id))) {
        const existing = (source.config ?? {}) as Record<string, unknown>;
        await storage.updateTeamBlueprintNode(source.id, {
          config: {
            ...existing,
            revision: {
              targetNodeId: target.id,
              when: REWORK_REQUESTED_RULE,
              // A flow that says "at most two rounds" means two, not one. The
              // engine caps this at 3 regardless.
              maxRounds: Math.min(3, Math.max(1, Number((edgeSpec as any).maxRounds) || 1)),
            },
          },
        } as any);
        continue;
      }
      // A branch out of a decision node is chosen by that node's one call: the
      // edge keeps the author's label (what the choice names) and condition (for
      // the reader), and is evaluated by the choice rather than by a rule or a
      // model.
      // Only a branch decision chooses its edges; a classify or score node writes
      // a value and its edges are rules or conditions over it, like any producer's.
      const decisionEdge = source.nodeType === "decision" && decisionAnswerType((source.config as any)?.decision) === "branch";
      await storage.createTeamBlueprintEdge({
        blueprintId: blueprint.id,
        sourceNodeId: source.id,
        targetNodeId: target.id,
        label: edgeSpec.label || (edgeSpec.type === "conditional" ? "branch" : "handoff"),
        failureMode: pipeline?.errorHandling?.includes("retry") ? "retry" : "escalate",
        ...(decisionEdge
          ? { condition: (edgeSpec as any).branchCondition || edgeSpec.label || undefined, evaluationMode: "decision" }
          : resolveEdgeRuleFromSpec(edgeSpec)),
      });
      created.push({ sourceNodeId: source.id, targetNodeId: target.id });
    }

    // Proposals often list only the handoffs between workers. Without an edge
    // from the orchestrator it becomes a disconnected step that runs alongside
    // the first worker instead of starting the flow: dispatch it to every
    // worker nothing else leads into.
    if (!created.some((e) => e.sourceNodeId === orchestratorNode.id)) {
      const hasIncoming = new Set(created.map((e) => e.targetNodeId));
      for (const node of workerNodes) {
        if (hasIncoming.has(node.id)) continue;
        await storage.createTeamBlueprintEdge({
          blueprintId: blueprint.id,
          sourceNodeId: orchestratorNode.id,
          targetNodeId: node.id,
          label: "dispatch",
          failureMode: "escalate",
        });
      }
    }
  }

  // A team of more than a couple of workers with no worker-to-worker edge is a
  // star: every agent runs in one wave, so nothing gates anything. That is
  // occasionally what was asked for, but far more often it means the proposal
  // arrived without sequencing -- and the built team looks complete either way,
  // which is how a 22-step flow shipped as 17 agents running at once.
  if (builtAsFanOut && createdWorkers.length > 2) {
    structureWarnings.push(
      `This team has no order: all ${createdWorkers.length} agents run at once, because the plan carried no connections between them. Any decision, approval gate or rework loop in the original process is not enforced.`,
    );
    console.warn(`[team-build] built a team with ${createdWorkers.length} workers and no worker-to-worker edges: every agent will run in one wave`);
  }

  for (let i = 0; i < createdWorkers.length; i++) {
    const worker = workers[i];
    if (worker.workflowSteps?.length) {
      const workerBlueprint = await storage.createBlueprint({
        name: `${worker.name} - Workflow`,
        description: worker.description,
        agentId: createdWorkers[i].id,
        status: "draft",
        blueprintJson: {
          type: "workflow",
          steps: worker.workflowSteps.map((step, stepIdx) => ({
            id: `step-${stepIdx + 1}`,
            label: step,
            order: stepIdx + 1,
            type: stepIdx === 0 ? "trigger" : stepIdx === worker.workflowSteps!.length - 1 ? "output" : "process",
          })),
          edges: worker.workflowSteps.slice(0, -1).map((_, stepIdx) => ({
            from: `step-${stepIdx + 1}`,
            to: `step-${stepIdx + 2}`,
            label: "next",
          })),
          tools: worker.tools || [],
          kpiBindings: worker.kpiBindings || [],
        },
      });
      await storage.updateAgent(createdWorkers[i].id, {
        blueprintJson: workerBlueprint.blueprintJson,
      }, orgId);
    }
  }

  await storage.updateAgent(teamAgent.id, {
    blueprintId: blueprint.id,
    runtimeConfig: {
      prompt: composeTaskPrompt(orchestrator, true),
      kpiBindings: orchestrator.kpiBindings || [],
      workflowSteps: orchestrator.workflowSteps || [],
      estimatedImpact: orchestrator.estimatedImpact || "",
      matchedSkills: orchestrator.matchedSkills || [],
      suggestedRagPipeline: orchestrator.suggestedRagPipeline || null,
      mcpToolBindings: orchestrator.mcpToolBindings || [],
      processFlowSteps: authoredSteps,
      orchestration: {
        pattern: pipeline?.pattern || "supervisor",
        patternReasoning: pipeline?.patternReasoning || "",
        description: pipeline?.description || "",
        errorHandling: pipeline?.errorHandling || "retry then escalate",
        handoffRules: pipeline?.handoffRules || "pass output as input",
        parallelGroups: pipeline?.parallelGroups || [],
        executionGraph: pipeline?.executionGraph || [],
        agentDependencyMatrix: pipeline?.agentDependencyMatrix || [],
        humanCheckpoints: pipeline?.humanCheckpoints || [],
        workerIds: createdWorkers.map((w: any) => w.id),
        edges: pipeline?.edges || [],
        blueprintId: blueprint.id,
      },
    },
  }, orgId);

  if (outcome && (outcome.status === "awaiting_agent_plan" || outcome.status === "active" || outcome.status === "draft")) {
    try {
      await storage.updateOutcome(outcomeId!, { status: "agents_assigned" }, orgId);
    } catch {}
  }

  // Every agent created here gets a real eval suite, matching the bar the
  // single-agent path (POST /api/agents) has always enforced -- it
  // unconditionally auto-scaffolds a suite on creation, while this route
  // created none at all, so a team-built agent shipped with an empty Eval
  // tab and no baseline to regress against. generateKpiAlignedEvalSuite was
  // even imported in this file but never called.
  //
  // The suite rows are created synchronously (DB-only, fast) so the Eval tab
  // is never empty; the ontology-grounded CASES are generated fire-and-forget
  // because that is a real LLM call per agent and must not hold the response
  // open. generateOntologyEvalCases draws on each agent's real ontologyTags
  // plus those concepts' agentUseCases/riskFactors, so a journey agent gets
  // domain-specific cases rather than generic latency probes -- and it
  // no-ops safely (returns 0 cases) for any agent whose tags didn't resolve.
  const evalSuiteIds: Record<string, string> = {};
  for (const created of [teamAgent, ...createdWorkers]) {
    try {
      const suite = await storage.createEvalSuite({
        agentId: created.id,
        name: `${created.name} - Baseline Suite`,
        type: "regression",
        totalCases: 0,
      });
      evalSuiteIds[created.id] = suite.id;
      generateOntologyEvalCases(suite.id, orgId)
        .then(r => {
          if (r.count > 0) storage.updateEvalSuite(suite.id, { totalCases: r.count }).catch(() => {});
        })
        .catch(err => console.warn(`[create-team] ontology eval generation failed for ${created.name}:`, err?.message));
    } catch (evalErr: any) {
      console.error(`[create-team] eval suite creation failed for ${created.name}:`, evalErr?.message);
    }
  }

  // The flow this team was drawn from now knows which journey it became.
  // Best-effort: the team exists either way, and a failure here should not
  // undo a build. Re-pointing rather than refusing when the flow already has
  // an owner is deliberate -- redrafting a flow makes a NEW team, and the
  // flow belongs with the one it most recently produced.
  if (body.processFlowId) {
    try {
      const flow = await storage.getProcessFlow(body.processFlowId, orgId);
      if (!flow) {
        console.warn(`[create-team] process flow ${body.processFlowId} not found; team "${teamAgent.name}" left unlinked`);
      } else {
        await storage.updateProcessFlow(body.processFlowId, { teamAgentId: teamAgent.id } as any, orgId);
      }
    } catch (err: any) {
      console.warn(`[create-team] could not link process flow ${body.processFlowId} to "${teamAgent.name}": ${err?.message}`);
    }
  }

  // Bindings the LLM named that resolve to an integration nobody has
  // connected. Returned rather than swallowed so the caller can show a
  // journey as needing setup instead of silently shipping a team whose
  // nodes will fail at run time with "Integration 'x' is not connected".
  const unconnectedBindings = Array.from(new Set([
    ...orchestratorLinkResult.unconnected,
    ...workerLinkResults.flatMap(r => r.unconnected),
  ]));
  const unresolvedBindings = Array.from(new Set([
    ...orchestratorLinkResult.unresolved,
    ...workerLinkResults.flatMap(r => r.unresolved),
  ]));

  // Read the graph back before calling this a success. A build that leaves a
  // loop as an edge produces a team whose every run dies at wave computation,
  // and until this the only way to find that out was to press run.
  const invariants = await checkBlueprintInvariants(blueprint.id);
  for (const finding of invariants.findings) structureWarnings.push(finding.message);

  return {
    teamAgent,
    workers: createdWorkers,
    blueprint,
    membershipCount: createdWorkers.length,
    evalSuiteIds,
    unconnectedBindings,
    unresolvedBindings,
    structureWarnings,
    // Named, not dropped: an author who bound a connector to the orchestrator
    // should be told it did not take effect and why.
    withheldFromOrchestrator,
    runnable: invariants.runnable,
  };
}
