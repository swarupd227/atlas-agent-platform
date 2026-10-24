/**
 * Parity of the policy decision point (server/policy-decision.ts) with today's
 * dispatcher (S0.2, commit C2).
 *
 * Replays every case of the characterization matrix (tests/fixtures/pdp-cases.ts)
 * through enforce() and compares it with the characterization golden
 * (tests/__golden__/pdp-characterization.json, recorded from dispatchToolCall),
 * projected onto what the PDP owns: the decision, the refusal's fields, and the
 * writes made while deciding. Execution, shadow dry-runs, deduplication and the
 * tool_invocations record are the dispatcher's and are not compared.
 *
 * The PDP changes a few things on purpose. Each is a rule below that rewrites the
 * golden's expectation, and each rule must change EXACTLY the case ids it lists:
 * a rule that starts touching another case, or stops touching one, fails. So
 * nothing can differ from today without a named rule saying so.
 *
 * A second block proves decide() is read-only: across the whole matrix it
 * records no write at all.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

vi.mock("../server/storage", () => ({
  storage: {
    createAuditEvent: vi.fn(),
    getAgent: vi.fn(),
    getAarConfig: vi.fn(),
    createAarActionDecision: vi.fn(),
    createApproval: vi.fn(),
    getLatestApprovalDecision: vi.fn(),
    getMcpServer: vi.fn(),
    getMcpServerTools: vi.fn(),
    getMcpServerAuth: vi.fn(),
    listAgentTaskClasses: vi.fn(),
    getActiveWarrant: vi.fn(),
    recordToolInvocation: vi.fn(),
  },
}));
vi.mock("../server/mcp-client", () => ({
  isRealMcpServer: vi.fn().mockReturnValue(false),
  mcpListTools: vi.fn().mockResolvedValue([]),
  mcpCallTool: vi.fn(),
  buildMcpAuthHeaders: vi.fn().mockResolvedValue({}),
}));
vi.mock("../server/routes/helpers", () => ({ resolvePolicyBundle: vi.fn() }));
vi.mock("../server/approval-risk-shadow", () => ({ shadowApprovalRisk: vi.fn() }));

import { decide, enforce, toDispatchFields, resetPdpRateLimits, type PdpRequest, type PdpDecision } from "../server/policy-decision";
import { storage } from "../server/storage";
import { shadowApprovalRisk } from "../server/approval-risk-shadow";
import { CASES, ORG, applySetup, caseRequest, recordPolicyEffects, assertUniqueCaseIds, scrub, type Case } from "./fixtures/pdp-cases";

const golden: Record<string, any> = JSON.parse(readFileSync(resolve(__dirname, "__golden__/pdp-characterization.json"), "utf8"));

// ── Projection of a golden entry onto the PDP's view ────────────────────────

const PASSED = new Set(["success", "tool_error", "shadow_skipped", "deduplicated"]);
const NOT_POLICY_AUDITS = new Set(["tool_proxy_shadow_dry_run", "tool_call_deduplicated"]);
const REFUSAL_FIELDS = ["reason", "error", "policyIds", "approvalId", "aarDecision", "warrantDecision", "monitorFlagged"] as const;

type View = { decision: string; fields: Record<string, unknown>; effects: ReturnType<typeof recordPolicyEffects> };

function projectGolden(g: any): View {
  const outcome = g.threw ? "threw" : g.result.outcome;
  const passed = PASSED.has(outcome);
  const fields: Record<string, unknown> = passed
    ? { monitorFlagged: g.result.monitorFlagged }
    : g.threw ? { threw: g.threw } : Object.fromEntries(REFUSAL_FIELDS.map(k => [k, g.result[k] ?? null]));
  const { toolInvocations: _t, ...effects } = g.effects;
  return {
    decision: passed ? "passed" : outcome,
    fields,
    effects: { ...effects, auditEvents: effects.auditEvents.filter((e: any) => !NOT_POLICY_AUDITS.has(e.action)) },
  };
}

function viewOf(d: PdpDecision, effects: View["effects"]): View {
  const f = toDispatchFields(d);
  const fields = d.outcome === "passed"
    ? { monitorFlagged: f.monitorFlagged }
    : Object.fromEntries(REFUSAL_FIELDS.map(k => [k, k === "reason" || k === "error" ? scrub((f as any)[k]) ?? null : (f as any)[k] ?? null]));
  return { decision: d.outcome, fields, effects };
}

// ── Intended changes, each naming exactly the cases it changes ──────────────

const GATE_AUDITS = new Set([
  "hard_violation", "policy_violation", "tool_blocked_lockdown", "tool_blocked_skill",
  "tool_blocked_scope_drift", "tool_proxy_rate_limited", "tool_human_approved",
]);
const HUMAN_APPROVED_ID = "appr-human";

interface Rule { id: string; what: string; cases: string[]; apply: (v: View, c: Case) => View }
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

const RULES: Rule[] = [
  { id: "R5", what: "a human-approved call files no new approval; the AAR row records the person's approval",
    cases: ["aar.human_approved", "prec.human_approved_both", "prec.human_approved_then_warrant_denied", "warrant.human_approved"],
    apply: (v, c) => {
      if (!c.req?.humanApprovedApprovalId) return v;
      const w = clone(v);
      w.effects.approvals = [];
      w.effects.aarActionDecisions = w.effects.aarActionDecisions.map((r: any) => r.decision === "REQUIRE_APPROVAL"
        ? { ...r, approvalId: HUMAN_APPROVED_ID, rulesTriggered: [...r.rulesTriggered, "human-approved"] } : r);
      return w;
    } },
  { id: "R1", what: "every gate audit event carries the organization",
    cases: [
      "aar.human_approved", "bundle.allowlist_miss", "bundle.hard_blocked", "bundle.hard_blocked_case", "bundle.monitor_flagged",
      "exempt.attachment_read.policy_block", "exempt.history_read.policy_block", "exempt.memory_propose.policy_block",
      "exempt.ontology_propose.policy_block", "exempt.skill_propose.policy_block", "exempt.skill_read.policy_block",
      "lockdown.connector_blocked", "lockdown.documents_off", "prec.bundle_over_aar", "prec.human_approved_both",
      "prec.human_approved_then_warrant_denied", "prec.lockdown_over_skill", "prec.monitor_then_aar_deny", "prec.scope_over_rate",
      "prec.scope_over_shadow", "prec.skill_over_bundle", "rate.call_101", "scope.out", "skill.empty_set", "skill.missing",
      "warrant.human_approved",
    ],
    apply: (v) => { const w = clone(v); w.effects.auditEvents = w.effects.auditEvents.map((e: any) =>
      GATE_AUDITS.has(e.action) && !e.organizationId ? { ...e, organizationId: ORG } : e); return w; } },
  { id: "R2", what: "every approval carries the agent",
    cases: [
      "aar.prior_rejected", "aar.require_approval", "aar.require_approval_get", "aar.require_approval_high",
      "prec.aar_require_over_warrant_denied", "prec.approval_over_shadow", "prec.warrant_over_scope",
      "warrant.requires_approval", "warrant.requires_approval_no_role",
    ],
    apply: (v) => { const w = clone(v); w.effects.approvals = w.effects.approvals.map((a: any) => a.agentId ? a : { ...a, agentId: a.requestedBy }); return w; } },
  { id: "R3", what: "the risk tier is upper case on the AAR row and the risk shadow",
    cases: ["aar.high_lowercase_supervised"],
    apply: (v) => { const w = clone(v);
      w.effects.aarActionDecisions = w.effects.aarActionDecisions.map((r: any) => ({ ...r, riskLevel: String(r.riskLevel).toUpperCase() }));
      w.effects.approvalRiskShadow = w.effects.approvalRiskShadow.map((s: any) => ({ ...s, riskTier: String(s.riskTier).toUpperCase() }));
      return w; } },
  { id: "R4", what: "a missing agent row takes the caller's organization",
    cases: ["aar.require_approval_no_agent", "base.no_agent_row"],
    apply: (v) => { const w = clone(v);
      w.effects.aarActionDecisions = w.effects.aarActionDecisions.map((r: any) => r.orgId ? r : { ...r, orgId: ORG });
      w.effects.approvalRiskShadow = w.effects.approvalRiskShadow.map((s: any) => s.orgId ? s : { ...s, orgId: ORG });
      return w; } },
  { id: "R6", what: "require-approval for a missing agent row files a real approval",
    cases: ["aar.require_approval_no_agent"],
    apply: (v, c) => {
      if (c.setup?.agent !== null || v.decision !== "gate_requires_approval" || v.effects.approvals.length) return v;
      const w = clone(v);
      w.fields.approvalId = "approval-1";
      w.effects.approvals = [{
        type: "tool-invocation", objectType: "mcp-tool", objectId: "srv-1", objectName: "create_ticket", organizationId: ORG,
        agentId: "agent-1", riskScore: 0.65, requiredReviewerRole: null, requestedBy: "agent-1",
        description: "AAR policy gate: agent 'agent-1' requires approval to call tool 'create_ticket'",
      }];
      w.effects.aarActionDecisions = w.effects.aarActionDecisions.map((r: any) => ({ ...r, approvalId: "approval-1" }));
      return w;
    } },
  { id: "R7", what: "a failed read is a named, audited block instead of an exception",
    cases: ["aar.config_throws"],
    apply: (v) => {
      if (v.decision !== "threw") return v;
      const msg = String(v.fields.threw);
      const reason = `Policy could not be evaluated: ${msg}`;
      return {
        decision: "gate_blocked_pdp_error",
        fields: { reason, error: reason, policyIds: null, approvalId: null, aarDecision: null, warrantDecision: null, monitorFlagged: null },
        effects: { ...v.effects, auditEvents: [{
          action: "tool_blocked_pdp_error", organizationId: ORG, actorType: "system", actorId: "policy-decision",
          objectType: "agent", objectId: "agent-1",
          details: { toolName: "create_ticket", serverName: "Ticketing", error: msg, iteration: 1, traceId: "trace-1" },
        }] },
      };
    } },
];

const changedBy: Record<string, string[]> = Object.fromEntries(RULES.map(r => [r.id, []]));
function expectedFor(c: Case): View {
  let v = projectGolden(golden[c.id]);
  for (const r of RULES) {
    const next = r.apply(v, c);
    if (JSON.stringify(next) !== JSON.stringify(v)) changedBy[r.id].push(c.id);
    v = next;
  }
  return v;
}

// ── Run ─────────────────────────────────────────────────────────────────────

const toPdp = (c: Case): PdpRequest => {
  const r = caseRequest(c);
  return {
    actor: { kind: "native", agentId: r.agentId, orgId: r.orgId ?? null },
    tool: r.tool, args: r.args,
    ctx: {
      policyBundle: r.policyBundle, skillAllowlist: r.skillAllowlist, declaredScope: r.declaredScope,
      humanApprovedApprovalId: r.humanApprovedApprovalId, traceId: r.traceId, iteration: r.iteration, deploymentId: r.deploymentId,
    },
  };
};

function clearRecorders() {
  for (const fn of Object.values(storage as any)) vi.mocked(fn as any).mockClear();
  vi.mocked(shadowApprovalRisk).mockClear();
}

async function warmUp(c: Case, req: PdpRequest) {
  resetPdpRateLimits();
  for (let i = 0; i < (c.warmupCalls ?? 0); i++) await enforce({ ...req, ctx: { ...req.ctx, declaredScope: null } });
}

const tick = () => new Promise(r => setTimeout(r, 0));
const actual: Record<string, View> = {};
const expected: Record<string, View> = {};
const decideOnly: Record<string, { decision: string; writes: number }> = {};
const savedLockdown = process.env.ASTRA_LOCKDOWN;

beforeAll(async () => {
  const m = vi.mocked(storage as any);
  m.createAuditEvent.mockResolvedValue({});
  m.createAarActionDecision.mockResolvedValue({});
  m.createApproval.mockImplementation(async () => ({ id: "approval-1" }));
  assertUniqueCaseIds(CASES);

  for (const c of CASES) {
    const req = toPdp(c);

    // enforce(): the decision and its writes
    applySetup(storage, c.setup);
    await warmUp(c, req);
    clearRecorders();
    const d = await enforce(req);
    await tick();
    actual[c.id] = viewOf(d, recordPolicyEffects(storage, shadowApprovalRisk));
    expected[c.id] = expectedFor(c);

    // decide() alone: the same decision, and nothing written
    applySetup(storage, c.setup);
    await warmUp(c, req);
    clearRecorders();
    const dd = await decide(req);
    await tick();
    const e = recordPolicyEffects(storage, shadowApprovalRisk);
    decideOnly[c.id] = { decision: dd.outcome, writes: e.auditEvents.length + e.approvals.length + e.aarActionDecisions.length + e.approvalRiskShadow.length };
  }
});

afterAll(() => { if (savedLockdown === undefined) delete process.env.ASTRA_LOCKDOWN; else process.env.ASTRA_LOCKDOWN = savedLockdown; });

describe("the policy decision point reproduces the dispatcher's decisions", () => {
  it("replays exactly the cases of the characterization golden", () => {
    expect(CASES.map(c => c.id).sort()).toEqual(Object.keys(golden).sort());
  });
  it.each(CASES.map(c => [c.id, c.what]))("%s — %s", (id) => {
    expect(actual[id]).toEqual(expected[id]);
  });
});

describe("each intended change touches exactly the cases it names", () => {
  it.each(RULES.map(r => [r.id, r.what]))("%s — %s", (id) => {
    const rule = RULES.find(r => r.id === id)!;
    expect(changedBy[id].slice().sort()).toEqual(rule.cases.slice().sort());
  });
  it("changes 39 of the 86 cases and leaves the other 47 exactly as the golden recorded them", () => {
    const touched = new Set(Object.values(changedBy).flat());
    expect({ cases: CASES.length, changed: touched.size }).toEqual({ cases: 86, changed: 39 });
  });
});

describe("decide() never writes", () => {
  it.each(CASES.map(c => [c.id]))("%s", (id) => {
    expect(decideOnly[id]).toEqual({ decision: actual[id].decision, writes: 0 });
  });
});
