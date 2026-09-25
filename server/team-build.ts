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
import { parseConditionToRule } from "@shared/condition-to-rule";
import { classifyStep } from "@shared/flow-execution-kind";

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
    // something the engine can evaluate itself, auditably. parseConditionToRule
    // returns null for anything that is genuine judgement, which keeps the
    // model on the decisions that need one.
    const parsed = parseConditionToRule(spec.branchCondition);
    if (parsed) return { condition: spec.branchCondition, evaluationMode: "deterministic", rule: parsed };
    return { condition: spec.branchCondition, evaluationMode: "ai" };
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
function executionFromAuthoredStep(proposal: any, stepsByLabel?: Map<string, any>): Record<string, unknown> | null {
  if (!stepsByLabel || stepsByLabel.size === 0) return null;
  const labels = Array.isArray(proposal?.flowStepLabels) ? proposal.flowStepLabels.filter((l: unknown) => typeof l === "string") : [];
  if (labels.length !== 1) return null;
  const step = stepsByLabel.get(String(labels[0]).trim().toLowerCase());
  if (!step) return null;
  const config = (step.config ?? {}) as Record<string, any>;
  switch (classifyStep({ type: step.type, config })) {
    case "expression":
      return { kind: "expression", expression: config.expression };
    case "knowledge_base":
      return { kind: "knowledge_base", knowledgeBaseId: config.kbId, knowledgeBaseQuery: config.kbQuery || step.description || step.label };
    case "tool_call":
      return { kind: "tool_call", toolServerId: config.toolServerId, toolName: config.toolName, toolArgs: config.toolArgs };
    case "skill":
      return { kind: "skill", skillId: config.skillId };
    default:
      return null;
  }
}

function deterministicNodeFor(
  proposal: any,
  stepsByLabel?: Map<string, any>,
): { nodeType: string; refSkillId?: string; refKnowledgeBaseId?: string; config: Record<string, unknown> } | null {
  const exec = proposal?.execution ?? executionFromAuthoredStep(proposal, stepsByLabel);
  if (!exec || typeof exec !== "object") return null;
  const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  switch (exec.kind) {
    case "expression":
      return text(exec.expression) ? { nodeType: "expression", config: { expression: text(exec.expression) } } : null;
    case "knowledge_base":
      return text(exec.knowledgeBaseId)
        // The query is fixed at authoring time: this is retrieval scoped to the
        // graph, not an agent that can reformulate what it asks for. The step's
        // own description is the sensible default for what to look up.
        ? { nodeType: "knowledge_base", refKnowledgeBaseId: text(exec.knowledgeBaseId), config: { kbQuery: text(exec.knowledgeBaseQuery) || text(proposal?.description) } }
        : null;
    case "skill":
      return text(exec.skillId) ? { nodeType: "skill", refSkillId: text(exec.skillId), config: {} } : null;
    case "tool_call":
      return text(exec.toolServerId) && text(exec.toolName)
        ? { nodeType: "tool_call", config: { toolServerId: text(exec.toolServerId), toolName: text(exec.toolName), toolArgs: (exec.toolArgs && typeof exec.toolArgs === "object") ? exec.toolArgs : {} } }
        : null;
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
  }).nullable().optional(),
  processFlowSteps: z.array(z.any()).optional(),
});

export type TeamAgentProposal = z.infer<typeof teamAgentProposalSchema>;
export type TeamBuildBody = z.infer<typeof teamBuildBodySchema>;

/**
 * When a reviewing step has asked for the work to be redone.
 *
 * decideRevision evaluates this against the reviewer's structured output as
 * well as its raw text, so it has to cover the vocabularies a reviewer
 * actually uses, not one word. Live 2026-09-24: a contract-certainty step
 * emitted {"accepted":false,"escalate":false,"redraft":true} -- asking for a
 * redraft in as many words -- and the old rule, which matched only the text
 * "fail", did not fire. Neither outgoing branch matched either, so the six
 * steps after it were skipped and the run still reported success.
 *
 * A field that is absent reads as "undefined" and matches none of these, so a
 * reviewer that approves (or says nothing about rework) never triggers a loop.
 */
export const REWORK_REQUESTED_RULE: RuleGroup = {
  combinator: "OR",
  conditions: [
    { field: "output", operator: "contains", value: "fail" },
    { field: "accepted", operator: "==", value: false },
    { field: "approved", operator: "==", value: false },
    { field: "redraft", operator: "==", value: true },
    { field: "rejected", operator: "==", value: true },
    { field: "requiresRevision", operator: "==", value: true },
  ],
};

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

  const orchestratorLinkResult = await linkMcpBindings(teamAgent.id, orchestrator.mcpToolBindings);

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
  const authoredStepsByLabel = new Map<string, any>(
    (Array.isArray(processFlowSteps) ? processFlowSteps : [])
      .filter((step: any) => step && typeof step.label === "string")
      .map((step: any) => [String(step.label).trim().toLowerCase(), step]),
  );

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
      processFlowSteps: processFlowSteps || [],
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
        const det = isGate ? null : deterministicNodeFor(workers[workerIdx >= 0 ? workerIdx : j], authoredStepsByLabel);
        const node = await storage.createTeamBlueprintNode({
          blueprintId: blueprint.id,
          nodeType: isGate ? "edge_gate" : det ? det.nodeType : "internal_agent",
          label: worker.name,
          positionX: startX + j * 260,
          positionY: yOffset,
          // A deterministic node runs no agent, so it holds no agent reference --
          // the same shape a gate node has.
          refAgentId: isGate || det ? null : worker.id,
          refSkillId: det?.refSkillId,
          refKnowledgeBaseId: det?.refKnowledgeBaseId,
          gateType: isGate ? "approval" : undefined,
          config: { role: "worker", workerIndex: workerIdx >= 0 ? workerIdx : j, tier: tierIdx, parallel: agentCount > 1, ...(det?.config ?? {}) },
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
      const posX = isSequential ? 400 : 150 + i * Math.floor(600 / Math.max(createdWorkers.length, 1));
      const posY = isSequential ? 150 + i * 120 : 220;
      const isGate = humanCheckpointWorkerIds.has(createdWorkers[i].id);
      const det = isGate ? null : deterministicNodeFor(workers[i], authoredStepsByLabel);
      const node = await storage.createTeamBlueprintNode({
        blueprintId: blueprint.id,
        nodeType: isGate ? "edge_gate" : det ? det.nodeType : "internal_agent",
        label: createdWorkers[i].name,
        positionX: posX,
        positionY: posY,
        refAgentId: isGate || det ? null : createdWorkers[i].id,
        refSkillId: det?.refSkillId,
        refKnowledgeBaseId: det?.refKnowledgeBaseId,
        gateType: isGate ? "approval" : undefined,
        config: { role: "worker", workerIndex: i, ...(det?.config ?? {}) },
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
    // Does `to` already lead back to `from` through the edges built so far? Then an edge
    // from -> to would close a loop, and computeWaves() rejects any graph with one.
    const leadsTo = (from: string, to: string) => {
      const seen = new Set([from]);
      const queue = [from];
      while (queue.length > 0) {
        const id = queue.shift()!;
        if (id === to) return true;
        for (const e of created) if (e.sourceNodeId === id && !seen.has(e.targetNodeId)) { seen.add(e.targetNodeId); queue.push(e.targetNodeId); }
      }
      return false;
    };
    for (const edgeSpec of pipeline!.edges!) {
      const source = resolveNode(edgeSpec.from);
      const target = resolveNode(edgeSpec.to);
      if (!source || !target || source.id === target.id) continue;
      // "Send it back for a rewrite" arrives as an edge pointing back up the flow. As an edge it
      // would make the graph cyclic -- no execution stages, so the team could not run at all. The
      // platform expresses rework as a revision rule on the reviewing step instead: when its output
      // says the work failed, the target step runs again, and everything after it follows.
      if (leadsTo(target.id, source.id)) {
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
      await storage.createTeamBlueprintEdge({
        blueprintId: blueprint.id,
        sourceNodeId: source.id,
        targetNodeId: target.id,
        label: edgeSpec.label || (edgeSpec.type === "conditional" ? "branch" : "handoff"),
        failureMode: pipeline?.errorHandling?.includes("retry") ? "retry" : "escalate",
        ...resolveEdgeRuleFromSpec(edgeSpec),
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
      processFlowSteps: processFlowSteps || [],
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

  return {
    teamAgent,
    workers: createdWorkers,
    blueprint,
    membershipCount: createdWorkers.length,
    evalSuiteIds,
    unconnectedBindings,
    unresolvedBindings,
    structureWarnings,
  };
}
