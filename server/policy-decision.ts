/**
 * The policy decision point (PDP): the one place that decides whether an agent
 * may call a tool (S0.2 of the external-agent governance plan).
 *
 * Today two engines make that decision and disagree: dispatchToolCall
 * (server/tool-dispatcher.ts, every native engine) and the AAR route's own
 * evaluator (evaluateActionAgainstConstraints in server/routes/aar.ts, which
 * external callers meet). Both also WRITE while they decide -- approvals, AAR
 * decision rows, audit events -- so neither can be run beside the other to
 * compare them without filing duplicate approvals.
 *
 * This module splits the two concerns:
 *
 *   decide()        reads only, and returns the decision plus the writes it
 *                   would make (effects). Safe to run as a shadow.
 *   applyEffects()  makes those writes, in the order the legacy code made them.
 *   enforce()       decide (consuming a rate-limit token) then applyEffects.
 *
 * Gate order, first refusal wins (the dispatcher's, plus policy_rule):
 *   0 lockdown -> 1 skill allowlist -> 2 policy bundle (hard; monitor flags)
 *   -> 3 policy_rule (arg-level block rules) -> 4 AAR lists (standing grant,
 *   human approval) -> 5 warrant -> 6 declared scope -> 7 rate limit.
 *
 * Shadow dry-run, idempotency, redaction, spans, the tool_invocations record
 * and execution are not policy and stay in the dispatcher.
 *
 * C2 status: nothing calls this yet. dispatchToolCall and the AAR routes keep
 * their own copies of this logic and stay authoritative until C4 wires this in;
 * tests/pdp-decide-parity.test.ts proves it reproduces the dispatcher's
 * characterization golden apart from the intended changes it names by case id.
 * Those intended changes, all made here deliberately:
 *   - every gate audit event carries organizationId, every approval agentId;
 *   - the AAR decision row's risk tier is upper case;
 *   - a missing agent row takes the caller's organization, and a
 *     require-approval decision for it still files a real approval;
 *   - a human-approved call files no new approval;
 *   - a failed read is a named, audited block (gate "pdp_error"), not an
 *     exception escaping the dispatcher.
 */
import { storage } from "./storage";
import { shadowApprovalRisk, type ApprovalRiskShadowArgs } from "./approval-risk-shadow";
import { blockedConnectorKind } from "./connector-lockdown";
import { nativeToolAllowed } from "./lockdown";
import { hasReadOnlyToolName } from "./tool-read-only";
import { BUILTIN_SKILL_SERVER_ID } from "./builtin-skill-tools";
import { BUILTIN_ATTACHMENT_SERVER_ID } from "./attachment-tool-defs";
import { BUILTIN_MEMORY_SERVER_ID } from "./builtin-memory-tools";
import { BUILTIN_SKILL_PROPOSAL_SERVER_ID } from "./skill-proposal-constants";
import { BUILTIN_ONTOLOGY_PROPOSAL_SERVER_ID } from "./ontology-proposal-constants";
import { BUILTIN_HISTORY_SERVER_ID } from "./history-search-constants";
import type { AvailableTool, DispatchOutcome, PolicyBundle } from "./tool-dispatcher";
import type { InsertAuditEvent, InsertApproval, InsertAarActionDecision } from "@shared/schema";

// ── Types ────────────────────────────────────────────────────────────────────

/** Who is asking. Only "native" is wired before C4; "mcp-gateway" arrives in S1.1. */
export type PdpActorKind = "native" | "aar" | "code-execution" | "mcp-gateway";

export interface PdpRequest {
  actor: { kind: PdpActorKind; agentId: string; orgId: string | null; platform?: string };
  tool: AvailableTool;
  args: Record<string, unknown>;
  ctx: {
    policyBundle?: PolicyBundle | null;
    /** Lowercased tool names granted by active skills; null/undefined = no skill gate. */
    skillAllowlist?: Set<string> | null;
    /** Lowercased tool names the run declared up front; null/undefined/empty = no scope gate. */
    declaredScope?: Set<string> | null;
    /** A person approved THIS call: satisfies an approval gate once, never a block. */
    humanApprovedApprovalId?: string;
    traceId?: string;
    iteration?: number;
    deploymentId?: string;
  };
}

export type PdpGate =
  | "lockdown" | "skill" | "policy_bundle" | "policy_rule" | "aar_list"
  | "warrant" | "scope" | "rate_limit" | "pdp_error";

/** The dispatcher's outcome strings, plus the PDP's own two. */
export type PdpOutcome = DispatchOutcome | "gate_blocked_pdp_error" | "passed";

export type PdpEffect =
  | { kind: "audit"; event: InsertAuditEvent }
  | { kind: "approval"; gate: "aar_list" | "warrant"; input: InsertApproval }
  /** approvalFrom: the row's approvalId is the id of the approval this decision files at that gate. */
  | { kind: "aar_decision"; row: InsertAarActionDecision; approvalFrom?: "aar_list" }
  | { kind: "approval_risk_shadow"; args: ApprovalRiskShadowArgs }
  | { kind: "log"; message: string };

export interface PdpDecision {
  decision: "ALLOW" | "ALERT_AND_ALLOW" | "REQUIRE_APPROVAL" | "BLOCK";
  /** The gate that decided; null when the call passed every gate. */
  gate: PdpGate | null;
  outcome: PdpOutcome;
  reason: string;
  rulesTriggered: string[];
  policyIds?: string[];
  monitorFlagged: boolean;
  aarDecision?: string;
  warrantDecision?: string;
  /** Filled in by applyEffects when this decision files an approval. */
  approvalId?: string;
  /** Set when a person's approval of this call satisfied an approval gate. */
  humanApproved?: { approvalId: string; gates: Array<"aar_list" | "warrant"> };
  effects: PdpEffect[];
  evaluationUs: number;
}

/** Everything the PDP reads and writes, injectable so a shadow run can be made provably read-only. */
export interface PdpDeps {
  getAgent: (agentId: string) => Promise<any>;
  getAarConfig: (agentId: string) => Promise<any>;
  getLatestApprovalDecision: (agentId: string, type: string, objectName: string) => Promise<any>;
  listAgentTaskClasses: (agentId: string) => Promise<any[]>;
  getActiveWarrant: (taskClassId: string, orgId?: string) => Promise<any>;
  blockedConnectorKind: (serverId: string) => Promise<string | null>;
  nativeToolAllowed: (tool: "documents") => boolean;
  isDocumentTool: (tool: AvailableTool) => Promise<boolean>;
  createAuditEvent: (event: InsertAuditEvent) => Promise<unknown>;
  createApproval: (input: InsertApproval) => Promise<{ id: string }>;
  createAarActionDecision: (row: InsertAarActionDecision) => Promise<unknown>;
  shadowApprovalRisk: (args: ApprovalRiskShadowArgs) => Promise<void>;
}

export const defaultPdpDeps: PdpDeps = {
  getAgent: (id) => storage.getAgent(id),
  getAarConfig: (id) => storage.getAarConfig(id),
  getLatestApprovalDecision: (id, type, name) => storage.getLatestApprovalDecision(id, type, name),
  listAgentTaskClasses: (id) => storage.listAgentTaskClasses(id),
  getActiveWarrant: (tcId, orgId) => storage.getActiveWarrant(tcId, orgId),
  blockedConnectorKind: (serverId) => blockedConnectorKind(serverId),
  nativeToolAllowed: (t) => nativeToolAllowed(t),
  // A lazy import, as in the dispatcher: the document tools pull in the whole data layer.
  isDocumentTool: async (tool) => (await import("./builtin-document-tools")).isBuiltinDocumentTool(tool),
  createAuditEvent: (e) => storage.createAuditEvent(e),
  createApproval: (a) => storage.createApproval(a),
  createAarActionDecision: (r) => storage.createAarActionDecision(r),
  shadowApprovalRisk: (a) => shadowApprovalRisk(a),
};

/** The same reads; every write throws. What a shadow comparison runs decide() with. */
export function readOnlyPdpDeps(deps: PdpDeps = defaultPdpDeps): PdpDeps {
  const refuse = (what: string) => async (): Promise<never> => { throw new Error(`policy decision attempted a write in read-only mode: ${what}`); };
  return {
    ...deps,
    createAuditEvent: refuse("createAuditEvent"),
    createApproval: refuse("createApproval"),
    createAarActionDecision: refuse("createAarActionDecision"),
    shadowApprovalRisk: refuse("shadowApprovalRisk"),
  };
}

// ── Shared pieces ────────────────────────────────────────────────────────────

/**
 * Built-in tools that only read the agent's own material or file a request a
 * person must approve. They skip the allow-lists, AAR (except an explicit deny),
 * the warrant and the declared scope -- each written before the tool existed --
 * but not an explicit policy block, the rate limit or the audit trail. See the
 * matching comment in dispatchToolCall.
 */
export function isExemptFromAllowLists(tool: AvailableTool): boolean {
  return [
    BUILTIN_SKILL_SERVER_ID, BUILTIN_ATTACHMENT_SERVER_ID, BUILTIN_MEMORY_SERVER_ID,
    BUILTIN_SKILL_PROPOSAL_SERVER_ID, BUILTIN_ONTOLOGY_PROPOSAL_SERVER_ID, BUILTIN_HISTORY_SERVER_ID,
  ].includes(tool.serverId);
}

/** Same rule as the dispatcher's isSideEffectful; kept here so the PDP does not import the dispatcher. */
function isSideEffectful(tool: AvailableTool): boolean {
  if ((tool.toolMethod || "").toUpperCase() === "GET") return false;
  return !hasReadOnlyToolName(tool.toolName);
}

/** Approval risk from what is known at the gate: the agent's tier, and whether the tool changes anything. */
export function computeApprovalRiskScore(riskLevel: string, sideEffectful: boolean): number {
  const normalized = (riskLevel || "").toUpperCase();
  const base = normalized === "HIGH" ? 0.6 : normalized === "LOW" ? 0.2 : 0.4;
  const score = base + (sideEffectful ? 0.25 : 0);
  return Math.min(1, Math.round(score * 100) / 100);
}

export type PolicyRule = {
  name?: string;
  condition?: { toolName?: string | string[]; args?: Record<string, string | number | boolean> };
  block?: boolean;
};

/** A rule matches when its tool names (if any) include the tool and every listed arg equals, compared as strings. */
export function matchesPolicyRule(rule: PolicyRule, toolName: string, args: Record<string, unknown>): boolean {
  const cond = rule.condition;
  if (!cond) return true;
  const toolCond = cond.toolName;
  const toolMatches = !toolCond || (Array.isArray(toolCond) ? toolCond.includes(toolName) : toolCond === toolName);
  if (!toolMatches) return false;
  for (const [k, v] of Object.entries(cond.args ?? {})) {
    if (String(args[k] ?? "") !== String(v)) return false;
  }
  return true;
}

// ── Rate limit: one token bucket per agent:tool ──────────────────────────────
// aarConfig.rateLimits sets it: { requestsPerMinute, burstCapacity } globally,
// or per tool under the tool's name. Default 100 a minute with a burst of 100,
// which refuses the 101st call of a burst exactly as the dispatcher's sliding
// window did, and refills continuously rather than reopening after a minute.

const DEFAULT_RPM = 100;
const DEFAULT_BURST = 100;
const buckets = new Map<string, { tokens: number; lastRefill: number }>();

function bucketLimits(rateLimits: Record<string, any> | null | undefined, toolName: string) {
  const perTool = rateLimits?.[toolName] as Record<string, unknown> | undefined;
  const eff = (perTool && typeof perTool === "object" ? perTool : rateLimits) ?? {};
  const rpm = typeof eff.requestsPerMinute === "number" ? eff.requestsPerMinute : DEFAULT_RPM;
  const burst = typeof eff.burstCapacity === "number" ? eff.burstCapacity : DEFAULT_BURST;
  return { capacity: burst, refillPerMs: rpm / 60_000 };
}

/** Whether a call may proceed now; consumes a token only when `consume` is set. */
function rateCheck(agentId: string, toolName: string, rateLimits: Record<string, any> | null | undefined, consume: boolean) {
  const key = `${agentId}:${toolName}`;
  const { capacity, refillPerMs } = bucketLimits(rateLimits, toolName);
  const now = Date.now();
  const b = buckets.get(key) ?? { tokens: capacity, lastRefill: now };
  const tokens = Math.min(capacity, b.tokens + (now - b.lastRefill) * refillPerMs);
  const allowed = tokens >= 1;
  if (consume) buckets.set(key, { tokens: allowed ? tokens - 1 : tokens, lastRefill: now });
  const retryAfterMs = allowed ? 0 : Math.ceil((1 - tokens) / (refillPerMs || 1e-9));
  return { allowed, retryAfterMs };
}

/** For tests: forget every bucket. */
export function resetPdpRateLimits(): void { buckets.clear(); }

// ── decide() ─────────────────────────────────────────────────────────────────

interface DecideOptions { consumeRateToken?: boolean }

export async function decide(req: PdpRequest, deps: PdpDeps = defaultPdpDeps, opts: DecideOptions = {}): Promise<PdpDecision> {
  const startedMs = performance.now();
  const { actor, tool, ctx } = req;
  const agentId = actor.agentId;
  const toolName = tool.toolName;
  const toolNameLower = toolName.toLowerCase();
  const exempt = isExemptFromAllowLists(tool);
  const effects: PdpEffect[] = [];
  const rulesTriggered: string[] = [];
  let monitorFlagged = false;
  let agent: any;
  let aarConfig: any;
  const orgOf = (): string | null => agent?.organizationId ?? actor.orgId ?? null;
  const audit = (event: Omit<InsertAuditEvent, "organizationId">) =>
    effects.push({ kind: "audit", event: { ...event, organizationId: orgOf() ?? undefined } as InsertAuditEvent });
  const done = (d: Omit<PdpDecision, "effects" | "evaluationUs" | "rulesTriggered" | "monitorFlagged">): PdpDecision => ({
    rulesTriggered, monitorFlagged, ...d, effects, evaluationUs: Math.round((performance.now() - startedMs) * 1000),
  });

  try {
    agent = await deps.getAgent(agentId);
    const riskLevel: string = String(agent?.riskTier ?? "MEDIUM").toUpperCase();
    const autonomyMode: string = agent?.autonomyMode ?? "supervised";
    const agentLabel = agent?.name ?? agentId;

    // 0. Platform lockdown.
    const lockedKind = ((await deps.isDocumentTool(tool)) && !deps.nativeToolAllowed("documents"))
      ? "documents"
      : await deps.blockedConnectorKind(tool.serverId);
    if (lockedKind) {
      const reason = lockedKind === "documents"
        ? "Document generation is disabled by this deployment's platform policy"
        : `The "${lockedKind}" connector type is disabled by this deployment's platform policy`;
      audit({
        actorType: "system", actorId: "platform_lockdown", action: "tool_blocked_lockdown", objectType: "agent", objectId: agentId,
        details: JSON.stringify({ toolName, serverName: tool.serverName, connectorKind: lockedKind, reason, iteration: ctx.iteration, traceId: ctx.traceId }),
      });
      return done({ decision: "BLOCK", gate: "lockdown", outcome: "gate_blocked_lockdown", reason });
    }

    // 1. Skill allowlist.
    if (!exempt && ctx.skillAllowlist && !ctx.skillAllowlist.has(toolNameLower)) {
      const reason = `Tool "${toolName}" is not granted by any active skill (skill allowlist enforcement)`;
      audit({
        actorType: "system", actorId: "skill-gate", action: "tool_blocked_skill", objectType: "agent", objectId: agentId,
        details: JSON.stringify({ toolName, serverName: tool.serverName, reason, iteration: ctx.iteration, traceId: ctx.traceId }),
      });
      return done({ decision: "BLOCK", gate: "skill", outcome: "gate_blocked_skill", reason });
    }

    // 2. Policy bundle: strict/block hard-blocks; monitor flags and proceeds.
    const bundle = ctx.policyBundle;
    if (bundle) {
      const isHardBlocked = bundle.blockedTools.some(b => b.toLowerCase() === toolNameLower);
      const allowlistActive = bundle.toolAllowlist.length > 0;
      const isAllowed = exempt || !allowlistActive || bundle.toolAllowlist.some(a => a.toLowerCase() === toolNameLower);
      if (isHardBlocked || (!isAllowed && allowlistActive)) {
        const reason = isHardBlocked
          ? `Tool "${toolName}" is blocked by a strict/block-enforcement policy`
          : `Tool "${toolName}" is not in the policy tool allowlist (strict enforcement)`;
        const policyIds = bundle.blockedToolsToPolicyIds?.[toolNameLower] ??
          bundle.appliedPolicies.filter(p => p.enforcement === "strict" || p.enforcement === "block").map(p => p.id);
        audit({
          actorType: "system", actorId: "policy-gate", action: "hard_violation", objectType: "agent", objectId: agentId,
          details: JSON.stringify({
            blockReason: reason, toolName, serverName: tool.serverName, enforcementMode: "strict/block",
            policyCount: bundle.appliedPolicies.length,
            appliedPolicies: bundle.appliedPolicies.map(p => ({ id: p.id, name: p.name, version: p.version, enforcement: p.enforcement })),
            iteration: ctx.iteration, deploymentId: ctx.deploymentId,
          }),
        });
        return done({ decision: "BLOCK", gate: "policy_bundle", outcome: "gate_blocked_policy", reason, policyIds });
      }
      if (bundle.monitorBlockedTools?.some(b => b.toLowerCase() === toolNameLower)) {
        monitorFlagged = true;
        audit({
          actorType: "system", actorId: "policy-gate", action: "policy_violation", objectType: "agent", objectId: agentId,
          details: JSON.stringify({
            blockReason: `Tool "${toolName}" is flagged by a monitor-mode policy (dispatch allowed)`,
            toolName, serverName: tool.serverName, enforcementMode: "monitor", iteration: ctx.iteration, deploymentId: ctx.deploymentId,
          }),
        });
      }

      // 3. Arg-level block rules from the agent's own policies (D1). Exempt tools are
      //    refused only by a rule that names them, as with every other explicit block.
      for (const { policyId, policyName, rule } of bundle.blockRules ?? []) {
        if (exempt && !rule.condition?.toolName) continue;
        if (!matchesPolicyRule(rule, toolName, req.args)) continue;
        const ruleName = rule.name ?? `policy-${policyId}-rule`;
        rulesTriggered.push(ruleName);
        const reason = `Tool "${toolName}" is blocked by policy rule "${ruleName}" (policy: ${policyName})`;
        audit({
          actorType: "system", actorId: "policy-gate", action: "hard_violation", objectType: "agent", objectId: agentId,
          details: JSON.stringify({
            blockReason: reason, toolName, serverName: tool.serverName, enforcementMode: "rule",
            rule: { policyId, name: ruleName }, iteration: ctx.iteration, deploymentId: ctx.deploymentId,
          }),
        });
        return done({ decision: "BLOCK", gate: "policy_rule", outcome: "gate_blocked_policy", reason, policyIds: [policyId] });
      }
    }

    // 4. AAR constraint lists. An exempt tool honours only an explicit deny.
    aarConfig = await deps.getAarConfig(agentId);
    const allowedTools: string[] = aarConfig?.allowedTools ?? [];
    const deniedTools: string[] = aarConfig?.deniedTools ?? [];
    const requireApprovalTools: string[] = aarConfig?.requireApprovalTools ?? [];
    let humanApproved: PdpDecision["humanApproved"];
    if (exempt) {
      if (deniedTools.includes(toolName)) {
        const reason = `Tool '${toolName}' is in the denied tools list`;
        return done({ decision: "BLOCK", gate: "aar_list", outcome: "gate_blocked_aar", reason, aarDecision: "BLOCK" });
      }
    } else {
      const aarStartMs = performance.now();
      const policiesEvaluated = ["constraint-list-policy", "autonomy-policy"];
      const aarRules: string[] = [];
      let decision: PdpDecision["decision"] = "ALLOW";
      let reason = "Action passed all constraint checks";
      if (deniedTools.length > 0 && deniedTools.includes(toolName)) {
        aarRules.push("denied-tool-list"); decision = "BLOCK"; reason = `Tool '${toolName}' is in the denied tools list`;
      } else if (allowedTools.length > 0 && !allowedTools.includes(toolName)) {
        aarRules.push("not-in-allowed-list"); decision = "BLOCK"; reason = `Tool '${toolName}' is not in the allowed tools list`;
      } else if (requireApprovalTools.length > 0 && requireApprovalTools.includes(toolName)) {
        aarRules.push("require-approval-tool-list"); decision = "REQUIRE_APPROVAL"; reason = `Tool '${toolName}' requires explicit approval before invocation`;
      } else if (riskLevel === "HIGH" && autonomyMode === "supervised") {
        aarRules.push("high-risk-supervised-alert"); decision = "ALERT_AND_ALLOW"; reason = `Tool '${toolName}' invocation logged — agent is high-risk in supervised mode`;
      }

      let fileApproval = false;
      let rowApprovalId: string | null = null;
      if (decision === "REQUIRE_APPROVAL") {
        const prior = await deps.getLatestApprovalDecision(agentId, "tool-invocation", toolName);
        if (prior?.status === "approved") {
          decision = "ALLOW";
          reason = `Tool '${toolName}' was approved by ${prior.decidedBy ?? "a reviewer"} and remains authorized`;
          aarRules.push("previously-approved");
        } else if (ctx.humanApprovedApprovalId) {
          // A person approved this exact call: no new approval to file.
          aarRules.push("human-approved");
          rowApprovalId = ctx.humanApprovedApprovalId;
          humanApproved = { approvalId: ctx.humanApprovedApprovalId, gates: ["aar_list"] };
        } else {
          fileApproval = true;
          effects.push({ kind: "approval", gate: "aar_list", input: {
            organizationId: orgOf() ?? undefined, agentId, type: "tool-invocation", objectType: "mcp-tool",
            objectId: tool.serverId ?? agentId, objectName: toolName,
            riskScore: computeApprovalRiskScore(riskLevel, isSideEffectful(tool)), status: "pending",
            requestedBy: agentId, requesterType: "agent",
            description: `AAR policy gate: agent '${agentLabel}' requires approval to call tool '${toolName}'`,
          } as InsertApproval });
        }
      }

      effects.push({ kind: "approval_risk_shadow", args: {
        agentId, agentName: agent?.name, agentDescription: agent?.description, riskTier: riskLevel, autonomyMode,
        tool: { toolName, toolDescription: tool.toolDescription, serverName: tool.serverName, sideEffectful: isSideEffectful(tool) },
        decision, reason, latencyMs: Math.round(performance.now() - aarStartMs), orgId: orgOf(),
      } as ApprovalRiskShadowArgs });
      effects.push({
        kind: "aar_decision",
        row: {
          agentId, orgId: orgOf(), toolName, serverId: tool.serverId ?? null, decision, reason, policiesEvaluated,
          rulesTriggered: aarRules, riskLevel, approvalId: rowApprovalId, evaluationTimeUs: Math.round((performance.now() - aarStartMs) * 1000),
        } as InsertAarActionDecision,
        ...(fileApproval ? { approvalFrom: "aar_list" as const } : {}),
      });
      if (decision === "ALERT_AND_ALLOW") {
        effects.push({ kind: "log", message: `[AAR] ALERT_AND_ALLOW: agent=${agentId} tool=${toolName} reason=${reason}` });
      }
      rulesTriggered.push(...aarRules);

      if (decision === "BLOCK") {
        return done({ decision, gate: "aar_list", outcome: "gate_blocked_aar", reason, aarDecision: decision });
      }
      if (decision === "REQUIRE_APPROVAL" && !humanApproved) {
        return done({ decision, gate: "aar_list", outcome: "gate_requires_approval", reason, aarDecision: decision });
      }
      if (humanApproved) {
        audit({
          actorType: "system", actorId: "workspace-approval", action: "tool_human_approved", objectType: "tool", objectId: toolName,
          details: `Tool "${toolName}" required approval and was human-approved (approvalId=${ctx.humanApprovedApprovalId}) for agent ${agentId}.`,
        });
      }
    }

    // 5. Warrant: only engages when a task class explicitly covers this tool.
    if (!exempt) {
      const taskClasses = await deps.listAgentTaskClasses(agentId);
      const covering = taskClasses.filter(tc => Array.isArray(tc.coveredTools) && tc.coveredTools.includes(toolName));
      for (const tc of covering) {
        const warrant = await deps.getActiveWarrant(tc.id, agent?.organizationId ?? undefined);
        if (!warrant || warrant.grants === "denied") {
          const reason = warrant
            ? `Task class "${tc.name}" warrant denies tool "${toolName}"`
            : `No active warrant grants task class "${tc.name}" (tool "${toolName}") -- authority has expired or was never issued`;
          return done({ decision: "BLOCK", gate: "warrant", outcome: "gate_blocked_warrant", reason, warrantDecision: "BLOCK", humanApproved });
        }
        if (warrant.grants === "requires_approval") {
          const prior = await deps.getLatestApprovalDecision(agentId, "tool-invocation", toolName);
          if (prior?.status === "approved") continue;
          if (ctx.humanApprovedApprovalId) {
            humanApproved = { approvalId: ctx.humanApprovedApprovalId, gates: [...(humanApproved?.gates ?? []), "warrant"] };
            audit({
              actorType: "system", actorId: "workspace-approval", action: "tool_human_approved", objectType: "tool", objectId: toolName,
              details: `Tool "${toolName}" required warrant approval and was human-approved (approvalId=${ctx.humanApprovedApprovalId}) for agent ${agentId}.`,
            });
            break; // as the dispatcher does: the approved call proceeds past the warrant gate
          }
          effects.push({ kind: "approval", gate: "warrant", input: {
            organizationId: orgOf() ?? undefined, agentId, type: "tool-invocation", objectType: "mcp-tool",
            objectId: tool.serverId ?? agentId, objectName: toolName,
            riskScore: computeApprovalRiskScore(riskLevel, isSideEffectful(tool)), status: "pending",
            requestedBy: agentId, requesterType: "agent",
            description: `Warrant gate: agent '${agentLabel}' requires approval to call tool '${toolName}' under task class "${tc.name}" (warrant grants=requires_approval)`,
            requiredReviewerRole: tc.requiredReviewerRole ?? undefined,
          } as InsertApproval });
          return done({
            decision: "REQUIRE_APPROVAL", gate: "warrant", outcome: "gate_requires_approval",
            reason: `Task class "${tc.name}" warrant requires approval for tool "${toolName}"`, warrantDecision: "REQUIRE_APPROVAL", humanApproved,
          });
        }
      }
    }

    // 6. Declared scope.
    if (!exempt && ctx.declaredScope && ctx.declaredScope.size > 0 && !ctx.declaredScope.has(toolNameLower)) {
      const reason = `Tool "${toolName}" was not in the scope this run declared at the start (intent-based authorization: blocking scope drift)`;
      audit({
        actorType: "system", actorId: "scope-gate", action: "tool_blocked_scope_drift", objectType: "agent", objectId: agentId,
        details: JSON.stringify({ toolName, serverName: tool.serverName, declaredScope: Array.from(ctx.declaredScope), reason, iteration: ctx.iteration, traceId: ctx.traceId }),
      });
      return done({ decision: "BLOCK", gate: "scope", outcome: "gate_blocked_scope_drift", reason, humanApproved });
    }

    // 7. Rate limit.
    const rate = rateCheck(agentId, toolName, aarConfig?.rateLimits, !!opts.consumeRateToken);
    if (!rate.allowed) {
      const reason = `Rate limit exceeded for tool "${toolName}". Retry after ${rate.retryAfterMs}ms`;
      audit({
        action: "tool_proxy_rate_limited", objectType: "tool", objectId: toolName, actorId: agentId, actorType: "agent",
        details: `Rate limit exceeded for ${toolName} by agent ${agentId}. Retry after ${rate.retryAfterMs}ms`,
      });
      return done({ decision: "BLOCK", gate: "rate_limit", outcome: "rate_limited", reason, humanApproved });
    }

    const alert = rulesTriggered.includes("high-risk-supervised-alert");
    return done({ decision: alert ? "ALERT_AND_ALLOW" : "ALLOW", gate: null, outcome: "passed", reason: "Passed every policy gate", humanApproved });
  } catch (err: any) {
    // A read that fails cannot answer the question, so the call does not run (fail closed),
    // and it says why instead of surfacing as an exception from the dispatcher.
    const reason = `Policy could not be evaluated: ${err?.message ?? String(err)}`;
    effects.length = 0;
    audit({
      actorType: "system", actorId: "policy-decision", action: "tool_blocked_pdp_error", objectType: "agent", objectId: agentId,
      details: JSON.stringify({ toolName, serverName: tool.serverName, error: err?.message ?? String(err), iteration: ctx.iteration, traceId: ctx.traceId }),
    });
    return done({ decision: "BLOCK", gate: "pdp_error", outcome: "gate_blocked_pdp_error", reason });
  }
}

// ── applyEffects() / enforce() ───────────────────────────────────────────────

/**
 * Makes the writes a decision describes, in the order the legacy code made
 * them. Approvals and the AAR row are awaited (the caller needs the approval
 * id); audit events and the approval-risk shadow are fire-and-forget, as before,
 * and a failed write never changes the decision.
 */
export async function applyEffects(d: PdpDecision, _req: PdpRequest, deps: PdpDeps = defaultPdpDeps): Promise<PdpDecision> {
  const filed: Partial<Record<"aar_list" | "warrant", string>> = {};
  for (const e of d.effects) {
    switch (e.kind) {
      case "audit":
        try { void deps.createAuditEvent(e.event)?.catch?.(() => {}); } catch { /* audit must never fail a decision */ }
        break;
      case "approval": {
        const approval = await deps.createApproval(e.input);
        filed[e.gate] = approval.id;
        break;
      }
      case "aar_decision":
        try {
          await deps.createAarActionDecision({ ...e.row, approvalId: e.approvalFrom ? filed[e.approvalFrom] ?? null : e.row.approvalId } as InsertAarActionDecision);
        } catch (err: any) {
          console.error(`[policy-decision] failed to persist AAR decision (non-fatal): ${err?.message ?? err}`);
        }
        break;
      case "approval_risk_shadow":
        try { void deps.shadowApprovalRisk(e.args)?.catch?.(() => {}); } catch { /* never on the critical path */ }
        break;
      case "log":
        console.warn(e.message);
        break;
    }
  }
  const approvalId = d.decision === "REQUIRE_APPROVAL" && d.gate && d.gate !== "pdp_error"
    ? filed[d.gate as "aar_list" | "warrant"]
    : undefined;
  return approvalId ? { ...d, approvalId } : d;
}

/** decide, consuming a rate-limit token when the call gets that far, then apply its effects. */
export async function enforce(req: PdpRequest, deps: PdpDeps = defaultPdpDeps): Promise<PdpDecision> {
  const d = await decide(req, deps, { consumeRateToken: true });
  return applyEffects(d, req, deps);
}

/** The fields of a dispatcher result a refusal carries. A passed decision carries only the monitor flag. */
export function toDispatchFields(d: PdpDecision): {
  outcome: PdpOutcome; reason?: string; error?: string; policyIds?: string[]; approvalId?: string;
  aarDecision?: string; warrantDecision?: string; monitorFlagged?: boolean;
} {
  if (d.outcome === "passed") return { outcome: "passed", monitorFlagged: d.monitorFlagged };
  // The gates before the monitor check refuse without a monitor flag, as the dispatcher's did.
  const early = d.gate === "lockdown" || d.gate === "skill" || d.gate === "policy_bundle" || d.gate === "pdp_error";
  return {
    outcome: d.outcome, reason: d.reason, error: d.reason,
    ...(d.policyIds ? { policyIds: d.policyIds } : {}),
    ...(d.approvalId ? { approvalId: d.approvalId } : {}),
    ...(d.aarDecision ? { aarDecision: d.aarDecision } : {}),
    ...(d.warrantDecision ? { warrantDecision: d.warrantDecision } : {}),
    ...(early ? {} : { monitorFlagged: d.monitorFlagged }),
  };
}
