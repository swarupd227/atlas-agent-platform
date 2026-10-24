/**
 * The tool-call policy case matrix (S0.2), shared by the characterization suite
 * (tests/pdp-characterization.test.ts, against dispatchToolCall) and the parity
 * suite (tests/pdp-decide-parity.test.ts, against server/policy-decision.ts), so
 * both always run exactly the same cases. Moved here verbatim from the
 * characterization suite; its golden file is unchanged by the move.
 *
 * Plain data and helpers only: no vi.mock here. Each suite mocks storage itself
 * and passes the mocked object in.
 */
import { vi } from "vitest";
import type { AvailableTool, DispatchRequest } from "../../server/tool-dispatcher";

// ── Fixtures ────────────────────────────────────────────────────────────────

export const ORG = "org-1";
export const TOOL: AvailableTool = {
  serverId: "srv-1", serverName: "Ticketing", serverUrl: "http://localhost:9999",
  toolName: "create_ticket", toolDescription: "Creates a ticket", toolInputSchema: {},
  toolEndpoint: "/tickets", toolMethod: "POST",
};
export const GET_TOOL: AvailableTool = { ...TOOL, toolName: "get_ticket", toolDescription: "Reads a ticket", toolEndpoint: "/tickets/1", toolMethod: "GET" };
export const builtinTool = (serverId: string, toolName: string): AvailableTool => ({
  serverId, serverName: serverId, serverUrl: "", toolName, toolDescription: toolName, toolInputSchema: {},
});
export const EXEMPT_TOOLS: Record<string, AvailableTool> = {
  skill_read: builtinTool("builtin:skills", "read_skill"),
  attachment_read: builtinTool("builtin:attachments", "read_attachment"),
  memory_propose: builtinTool("builtin:memory", "propose_memory"),
  skill_propose: builtinTool("builtin:skill-proposals", "propose_skill"),
  ontology_propose: builtinTool("builtin:ontology-proposals", "propose_ontology_concept"),
  history_read: builtinTool("builtin:history", "search_history"),
};
export const DOC_TOOL = builtinTool("builtin:document", "generate_pdf");

export const agent = (over: Record<string, unknown> = {}) => ({
  id: "agent-1", name: "Claims Agent", description: "Handles claims", riskTier: "MEDIUM",
  autonomyMode: "autonomous", organizationId: ORG, ...over,
});
export const aar = (over: Record<string, unknown> = {}) => ({ allowedTools: [], deniedTools: [], requireApprovalTools: [], ...over });
export const bundle = (over: Record<string, unknown> = {}) => ({
  appliedPolicies: [
    { id: "pol-strict", name: "Strict Tools", version: 1, enforcement: "strict" },
    { id: "pol-monitor", name: "Monitor Tools", version: 1, enforcement: "monitor" },
  ],
  blockedTools: [], toolAllowlist: [], monitorBlockedTools: [], blockedToolsToPolicyIds: {},
  redactPatterns: [], guardrails: [], agentConfig: null, ...over,
}) as any;
export const taskClass = (tools: string[], over: Record<string, unknown> = {}) =>
  ({ id: "tc-1", name: "Claims Handling", coveredTools: tools, requiredReviewerRole: "risk_officer", ...over });

// ── Case definitions ────────────────────────────────────────────────────────

export interface Setup {
  agent?: Record<string, unknown> | null;
  aar?: Record<string, unknown> | null;
  aarThrows?: boolean;
  priorDecision?: Record<string, unknown>;
  taskClasses?: Array<Record<string, unknown>>;
  warrants?: Record<string, Record<string, unknown> | undefined>;
  lockdown?: Record<string, unknown>;
  mcpServer?: Record<string, unknown> | null;
}
export interface Case {
  id: string;
  what: string;
  setup?: Setup;
  req?: Partial<DispatchRequest>;
  tool?: AvailableTool;
  /** Calls made first (same agent and tool) whose effects are not recorded. */
  warmupCalls?: number;
}

export const CASES: Case[] = [
  // (a) baseline
  { id: "base.allow", what: "no restriction anywhere: executes" },
  { id: "base.allow_get", what: "read-only GET tool, no restriction: executes", tool: GET_TOOL },
  { id: "base.no_bundle", what: "caller passes no policy bundle: policy gate skipped, executes", req: { policyBundle: null } },
  { id: "base.no_agent_row", what: "agent row not found, no restriction: executes", setup: { agent: null } },

  // (a) lockdown
  { id: "lockdown.connector_blocked", what: "connector kind not in connectors.allow",
    setup: { lockdown: { connectors: { allow: ["jira"] } }, mcpServer: { integrationId: null, transportType: "rest-proxy" } } },
  { id: "lockdown.connector_allowed", what: "connector kind in connectors.allow: executes",
    setup: { lockdown: { connectors: { allow: ["openapi"] } }, mcpServer: { integrationId: null, transportType: "rest-proxy" } } },
  { id: "lockdown.documents_off", what: "document tool while nativeTools.documents is off",
    tool: DOC_TOOL, setup: { lockdown: { nativeTools: { documents: "off" } } } },
  { id: "lockdown.documents_on", what: "document tool with documents on: executes", tool: DOC_TOOL },

  // (a) skill allowlist
  { id: "skill.listed", what: "skill allowlist lists the tool: executes", req: { skillAllowlist: new Set(["create_ticket"]) } },
  { id: "skill.missing", what: "skill allowlist omits the tool", req: { skillAllowlist: new Set(["other_tool"]) } },
  { id: "skill.empty_set", what: "empty skill allowlist set refuses everything", req: { skillAllowlist: new Set<string>() } },

  // (a) policy bundle
  { id: "bundle.hard_blocked", what: "strict policy blocks the tool by name",
    req: { policyBundle: bundle({ blockedTools: ["create_ticket"], blockedToolsToPolicyIds: { create_ticket: ["pol-strict"] } }) } },
  { id: "bundle.hard_blocked_case", what: "block list matches case-insensitively",
    req: { policyBundle: bundle({ blockedTools: ["CREATE_TICKET"], blockedToolsToPolicyIds: {} }) } },
  { id: "bundle.allowlist_miss", what: "strict allowlist omits the tool", req: { policyBundle: bundle({ toolAllowlist: ["other_tool"] }) } },
  { id: "bundle.allowlist_hit", what: "strict allowlist lists the tool: executes", req: { policyBundle: bundle({ toolAllowlist: ["create_ticket"] }) } },
  { id: "bundle.monitor_flagged", what: "monitor policy flags the tool: logged, executes",
    req: { policyBundle: bundle({ monitorBlockedTools: ["create_ticket"] }) } },

  // (a) AAR lists
  { id: "aar.no_config", what: "no AAR config row: executes", setup: { aar: null } },
  { id: "aar.deny", what: "AAR deny list names the tool", setup: { aar: aar({ deniedTools: ["create_ticket"] }) } },
  { id: "aar.allow_miss", what: "AAR allow list omits the tool", setup: { aar: aar({ allowedTools: ["other_tool"] }) } },
  { id: "aar.allow_hit", what: "AAR allow list lists the tool: executes", setup: { aar: aar({ allowedTools: ["create_ticket"] }) } },
  { id: "aar.require_approval", what: "AAR require-approval, no prior decision: approval created, not executed",
    setup: { aar: aar({ requireApprovalTools: ["create_ticket"] }) } },
  { id: "aar.require_approval_get", what: "require-approval on a read-only tool: lower risk score", tool: GET_TOOL,
    setup: { aar: aar({ requireApprovalTools: ["get_ticket"] }) } },
  { id: "aar.require_approval_high", what: "require-approval on a HIGH-tier agent: higher risk score",
    setup: { agent: agent({ riskTier: "HIGH" }), aar: aar({ requireApprovalTools: ["create_ticket"] }) } },
  { id: "aar.standing_grant", what: "require-approval with an earlier approved decision: executes",
    setup: { aar: aar({ requireApprovalTools: ["create_ticket"] }), priorDecision: { status: "approved", decidedBy: "alice" } } },
  { id: "aar.prior_rejected", what: "require-approval with an earlier REJECTED decision: asks again",
    setup: { aar: aar({ requireApprovalTools: ["create_ticket"] }), priorDecision: { status: "rejected", decidedBy: "bob" } } },
  { id: "aar.human_approved", what: "require-approval, human-approved this call (no standing grant): executes",
    setup: { aar: aar({ requireApprovalTools: ["create_ticket"] }) }, req: { humanApprovedApprovalId: "appr-human" } },
  { id: "aar.require_approval_no_agent", what: "require-approval when the agent row is missing: no approval row is created",
    setup: { agent: null, aar: aar({ requireApprovalTools: ["create_ticket"] }) } },
  { id: "aar.high_supervised", what: "HIGH tier + supervised: ALERT_AND_ALLOW, executes",
    setup: { agent: agent({ riskTier: "HIGH", autonomyMode: "supervised" }) } },
  { id: "aar.high_lowercase_supervised", what: "lower-case 'high' + supervised: ALERT_AND_ALLOW, executes",
    setup: { agent: agent({ riskTier: "high", autonomyMode: "supervised" }) } },
  { id: "aar.high_autonomous", what: "HIGH tier + autonomous: no alert, executes", setup: { agent: agent({ riskTier: "HIGH" }) } },
  { id: "aar.config_throws", what: "AAR config read throws: the exception escapes dispatchToolCall", setup: { aarThrows: true } },

  // (a) warrant
  { id: "warrant.not_covered", what: "task class does not cover the tool: no-op, executes",
    setup: { taskClasses: [taskClass(["other_tool"])] } },
  { id: "warrant.none_active", what: "covering task class with no active warrant",
    setup: { taskClasses: [taskClass(["create_ticket"])], warrants: {} } },
  { id: "warrant.denied", what: "active warrant grants denied",
    setup: { taskClasses: [taskClass(["create_ticket"])], warrants: { "tc-1": { grants: "denied" } } } },
  { id: "warrant.requires_approval", what: "warrant requires approval: approval with reviewer role",
    setup: { taskClasses: [taskClass(["create_ticket"])], warrants: { "tc-1": { grants: "requires_approval" } } } },
  { id: "warrant.requires_approval_no_role", what: "warrant requires approval, task class sets no reviewer role",
    setup: { taskClasses: [taskClass(["create_ticket"], { requiredReviewerRole: null })], warrants: { "tc-1": { grants: "requires_approval" } } } },
  { id: "warrant.requires_approval_standing", what: "warrant requires approval, earlier approved decision: executes",
    setup: { taskClasses: [taskClass(["create_ticket"])], warrants: { "tc-1": { grants: "requires_approval" } }, priorDecision: { status: "approved", decidedBy: "alice" } } },
  { id: "warrant.autonomous", what: "warrant grants autonomous: executes",
    setup: { taskClasses: [taskClass(["create_ticket"])], warrants: { "tc-1": { grants: "autonomous" } } } },
  { id: "warrant.two_classes_autonomous_then_denied", what: "two covering classes, autonomous then denied: blocked",
    setup: { taskClasses: [taskClass(["create_ticket"]), taskClass(["create_ticket"], { id: "tc-2", name: "Fraud Review" })],
      warrants: { "tc-1": { grants: "autonomous" }, "tc-2": { grants: "denied" } } } },
  { id: "warrant.human_approved", what: "warrant requires approval, human-approved this call: executes",
    setup: { taskClasses: [taskClass(["create_ticket"])], warrants: { "tc-1": { grants: "requires_approval" } } },
    req: { humanApprovedApprovalId: "appr-human" } },

  // (a) declared scope
  { id: "scope.in", what: "tool inside the declared scope: executes", req: { declaredScope: new Set(["create_ticket"]) } },
  { id: "scope.out", what: "tool outside the declared scope", req: { declaredScope: new Set(["other_tool"]) } },
  { id: "scope.empty", what: "empty declared scope disables the gate: executes", req: { declaredScope: new Set<string>() } },

  // (a) rate limit (in-memory, 100 per minute per agent:tool)
  { id: "rate.call_100", what: "the 100th call in a minute: executes", setup: { agent: agent({ id: "agent-rate-a" }) },
    req: { agentId: "agent-rate-a" }, warmupCalls: 99 },
  { id: "rate.call_101", what: "the 101st call in a minute: rate limited", setup: { agent: agent({ id: "agent-rate-b" }) },
    req: { agentId: "agent-rate-b" }, warmupCalls: 100 },

  // (a) shadow
  { id: "shadow.on", what: "shadow run: dry run, never executes", req: { shadow: true } },

  // (b) precedence: the earlier gate wins and the later one leaves no trace
  { id: "prec.lockdown_over_skill", what: "lockdown and skill miss",
    setup: { lockdown: { connectors: { allow: ["jira"] } }, mcpServer: { integrationId: null, transportType: "rest-proxy" } },
    req: { skillAllowlist: new Set(["other_tool"]) } },
  { id: "prec.skill_over_bundle", what: "skill miss and strict block",
    req: { skillAllowlist: new Set(["other_tool"]), policyBundle: bundle({ blockedTools: ["create_ticket"], blockedToolsToPolicyIds: { create_ticket: ["pol-strict"] } }) } },
  { id: "prec.bundle_over_aar", what: "strict block and AAR deny: AAR never evaluated",
    setup: { aar: aar({ deniedTools: ["create_ticket"] }) },
    req: { policyBundle: bundle({ blockedTools: ["create_ticket"], blockedToolsToPolicyIds: { create_ticket: ["pol-strict"] } }) } },
  { id: "prec.monitor_then_aar_deny", what: "monitor flag and AAR deny: blocked, still flagged",
    setup: { aar: aar({ deniedTools: ["create_ticket"] }) }, req: { policyBundle: bundle({ monitorBlockedTools: ["create_ticket"] }) } },
  { id: "prec.bundle_allow_hit_aar_allow_miss", what: "policy allowlist lists it, AAR allowlist omits it",
    setup: { aar: aar({ allowedTools: ["other_tool"] }) }, req: { policyBundle: bundle({ toolAllowlist: ["create_ticket"] }) } },
  { id: "prec.aar_deny_over_require", what: "AAR deny and require-approval lists both name it",
    setup: { aar: aar({ deniedTools: ["create_ticket"], requireApprovalTools: ["create_ticket"] }) } },
  { id: "prec.aar_deny_over_warrant", what: "AAR deny and warrant requires approval: no warrant approval",
    setup: { aar: aar({ deniedTools: ["create_ticket"] }), taskClasses: [taskClass(["create_ticket"])], warrants: { "tc-1": { grants: "requires_approval" } } } },
  { id: "prec.aar_require_over_warrant_denied", what: "AAR require-approval and warrant denied: approval, warrant not reached",
    setup: { aar: aar({ requireApprovalTools: ["create_ticket"] }), taskClasses: [taskClass(["create_ticket"])], warrants: { "tc-1": { grants: "denied" } } } },
  { id: "prec.human_approved_then_warrant_denied", what: "human approval passes AAR but not a denying warrant",
    setup: { aar: aar({ requireApprovalTools: ["create_ticket"] }), taskClasses: [taskClass(["create_ticket"])], warrants: { "tc-1": { grants: "denied" } } },
    req: { humanApprovedApprovalId: "appr-human" } },
  { id: "prec.human_approved_both", what: "human approval satisfies both AAR and warrant approval",
    setup: { aar: aar({ requireApprovalTools: ["create_ticket"] }), taskClasses: [taskClass(["create_ticket"])], warrants: { "tc-1": { grants: "requires_approval" } } },
    req: { humanApprovedApprovalId: "appr-human" } },
  { id: "prec.standing_grant_both", what: "one earlier approval satisfies both AAR and warrant approval",
    setup: { aar: aar({ requireApprovalTools: ["create_ticket"] }), taskClasses: [taskClass(["create_ticket"])],
      warrants: { "tc-1": { grants: "requires_approval" } }, priorDecision: { status: "approved", decidedBy: "alice" } } },
  { id: "prec.alert_then_warrant_denied", what: "high-risk alert and warrant denied: blocked",
    setup: { agent: agent({ riskTier: "HIGH", autonomyMode: "supervised" }), taskClasses: [taskClass(["create_ticket"])], warrants: { "tc-1": { grants: "denied" } } } },
  { id: "prec.warrant_over_scope", what: "warrant requires approval and scope miss: approval",
    setup: { taskClasses: [taskClass(["create_ticket"])], warrants: { "tc-1": { grants: "requires_approval" } } },
    req: { declaredScope: new Set(["other_tool"]) } },
  { id: "prec.scope_over_rate", what: "scope miss on the 101st call: scope refusal",
    setup: { agent: agent({ id: "agent-rate-c" }) }, req: { agentId: "agent-rate-c", declaredScope: new Set(["other_tool"]) }, warmupCalls: 100 },
  { id: "prec.scope_over_shadow", what: "scope miss in a shadow run: scope refusal, not a dry run",
    req: { shadow: true, declaredScope: new Set(["other_tool"]) } },
  { id: "prec.approval_over_shadow", what: "AAR require-approval in a shadow run: approval, not a dry run",
    setup: { aar: aar({ requireApprovalTools: ["create_ticket"] }) }, req: { shadow: true } },
];

// (a) built-in exemptions: each exempt kind against every restrictive list at once,
// against an explicit AAR deny, against an explicit policy block, and in shadow.
for (const [kind, tool] of Object.entries(EXEMPT_TOOLS)) {
  const name = tool.toolName;
  CASES.push(
    { id: `exempt.${kind}.all_lists_omit`, what: `${kind}: every allowlist omits it, warrant covers it, out of scope`, tool,
      setup: { aar: aar({ allowedTools: ["other_tool"], requireApprovalTools: [name] }), taskClasses: [taskClass([name])], warrants: { "tc-1": { grants: "denied" } } },
      req: { skillAllowlist: new Set(["other_tool"]), declaredScope: new Set(["other_tool"]), policyBundle: bundle({ toolAllowlist: ["other_tool"] }) } },
    { id: `exempt.${kind}.aar_deny`, what: `${kind}: an AAR deny naming it`, tool, setup: { aar: aar({ deniedTools: [name] }) } },
    { id: `exempt.${kind}.policy_block`, what: `${kind}: a strict policy blocking it by name`, tool,
      req: { policyBundle: bundle({ blockedTools: [name], blockedToolsToPolicyIds: { [name]: ["pol-strict"] } }) } },
    { id: `exempt.${kind}.shadow`, what: `${kind}: in a shadow run`, tool, req: { shadow: true } },
  );
}

// ── Shared helpers ──────────────────────────────────────────────────────────

const NUM_MS = /\d+ms/g;
export const scrub = (v: unknown): unknown => (typeof v === "string" ? v.replace(NUM_MS, "<n>ms") : v);
export const parseDetails = (d: unknown) => {
  if (typeof d !== "string") return d;
  try { return JSON.parse(scrub(d) as string); } catch { return scrub(d); }
};
export const calls = (fn: unknown) => (vi.mocked(fn as any).mock.calls as unknown[][]).map(c => c[0] as Record<string, any>);

/** Points the mocked storage (and the lockdown env) at one case's setup. */
export function applySetup(m: any, s: Setup = {}) {
  delete process.env.ASTRA_LOCKDOWN;
  if (s.lockdown) process.env.ASTRA_LOCKDOWN = JSON.stringify(s.lockdown);
  m.getAgent.mockResolvedValue(s.agent === undefined ? agent() : s.agent ?? undefined);
  if (s.aarThrows) m.getAarConfig.mockRejectedValue(new Error("connection terminated unexpectedly"));
  else m.getAarConfig.mockResolvedValue(s.aar === undefined ? null : s.aar);
  m.getLatestApprovalDecision.mockResolvedValue(s.priorDecision);
  m.listAgentTaskClasses.mockResolvedValue(s.taskClasses ?? []);
  m.getActiveWarrant.mockImplementation(async (tcId: string) => s.warrants?.[tcId]);
  m.getMcpServer.mockResolvedValue(s.mcpServer ?? null);
}

/** The dispatch request a case describes. */
export const caseRequest = (c: Case): DispatchRequest => ({
  agentId: "agent-1", orgId: ORG, tool: c.tool ?? TOOL, args: { title: "Water damage", amount: 1200 },
  policyBundle: bundle(), traceId: "trace-1", iteration: 1, ...c.req,
});

/** The policy writes recorded on the mocked storage and the approval-risk shadow since the last clear. */
export function recordPolicyEffects(m: any, shadowApprovalRisk: unknown) {
  return {
    auditEvents: calls(m.createAuditEvent).map(e => ({
      action: e.action, organizationId: e.organizationId ?? null, actorType: e.actorType ?? null,
      actorId: e.actorId ?? null, objectType: e.objectType ?? null, objectId: e.objectId ?? null, details: parseDetails(e.details),
    })),
    approvals: calls(m.createApproval).map(a => ({
      type: a.type, objectType: a.objectType, objectId: a.objectId, objectName: a.objectName,
      organizationId: a.organizationId ?? null, agentId: a.agentId ?? null, riskScore: a.riskScore,
      requiredReviewerRole: a.requiredReviewerRole ?? null, requestedBy: a.requestedBy, description: a.description,
    })),
    aarActionDecisions: calls(m.createAarActionDecision).map(d => ({
      orgId: d.orgId ?? null, toolName: d.toolName, serverId: d.serverId ?? null, decision: d.decision, reason: d.reason,
      policiesEvaluated: d.policiesEvaluated, rulesTriggered: d.rulesTriggered, riskLevel: d.riskLevel, approvalId: d.approvalId ?? null,
    })),
    approvalRiskShadow: calls(shadowApprovalRisk).map(s => ({ decision: s.decision, riskTier: s.riskTier, sideEffectful: s.tool?.sideEffectful, orgId: s.orgId ?? null })),
  };
}

/** Fails loudly on a duplicate id, so a golden keyed by id can never silently lose a case. */
export function assertUniqueCaseIds(cases: Case[]) {
  const ids = new Set<string>();
  for (const c of cases) { if (ids.has(c.id)) throw new Error(`duplicate case id ${c.id}`); ids.add(c.id); }
}
