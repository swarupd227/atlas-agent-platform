/**
 * The policy decision point shadow comparison (server/pdp-shadow.ts, S0.2 C3).
 *
 * The property this exists to prove first: switching PDP_MODE to shadow changes
 * NOTHING about what the dispatcher decides or writes. The whole characterization
 * matrix runs through dispatchToolCall in shadow mode and must still equal the
 * committed C1 golden; what the shadow recorded on that matrix is pinned too.
 * Then the categories, the rails (legacy is inert, sampling, the in-flight cap,
 * failures never reach the caller, the detail cap), the setting's validation,
 * and the report's flip checks, including that nothing measured is never a pass.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const { executed, builtin } = vi.hoisted(() => {
  const executed = { calls: [] as string[] };
  const builtin = (modPath: string, execName: string) =>
    async (importOriginal: () => Promise<Record<string, unknown>>) => ({
      ...(await importOriginal()),
      [execName]: async (...a: any[]) => {
        executed.calls.push(`${modPath}:${typeof a[0] === "string" ? a[0] : a[0]?.toolName}`);
        return { ok: true };
      },
    });
  return { executed, builtin };
});

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
    getPlatformSetting: vi.fn(),
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
vi.mock("../server/builtin-document-tools", builtin("document", "executeBuiltinDocumentTool"));
vi.mock("../server/builtin-skill-tools", builtin("skill", "executeBuiltinSkillTool"));
vi.mock("../server/builtin-attachment-tools", builtin("attachment", "executeBuiltinAttachmentTool"));
vi.mock("../server/builtin-memory-tools", builtin("memory", "executeBuiltinMemoryTool"));
vi.mock("../server/builtin-skill-proposal-tools", builtin("skill-proposal", "executeBuiltinSkillProposalTool"));
vi.mock("../server/builtin-ontology-proposal-tools", builtin("ontology-proposal", "executeBuiltinOntologyProposalTool"));
vi.mock("../server/builtin-history-tools", builtin("history", "executeBuiltinHistoryTool"));

import { dispatchToolCall } from "../server/tool-dispatcher";
import { storage } from "../server/storage";
import { shadowApprovalRisk } from "../server/approval-risk-shadow";
import { resolvePolicyBundle } from "../server/routes/helpers";
import { resetPdpRateLimits } from "../server/policy-decision";
import { invalidatePdpSettingsCache, validatePdpSetting } from "../server/pdp-mode";
import {
  classify, classOfDispatch, classOfAarLegacy, classOfCodeExecutionLegacy, setPdpShadowRecorder, pdpShadowIdle,
  pdpShadowStats, resetPdpShadowState, shadowCompareAar, shadowCompareDispatch, takeDetailSlot, type ShadowComparison,
} from "../server/pdp-shadow";
import { summarise, FLIP } from "../server/routes/pdp-shadow";
import { CASES, applySetup, caseRequest, recordPolicyEffects, scrub, calls, TOOL } from "./fixtures/pdp-cases";

const m = vi.mocked(storage as any);
const golden: Record<string, any> = JSON.parse(readFileSync(resolve(__dirname, "__golden__/pdp-characterization.json"), "utf8"));
let recorded: ShadowComparison[] = [];
const savedEnv = { mode: process.env.PDP_MODE, sample: process.env.PDP_SHADOW_SAMPLE, lockdown: process.env.ASTRA_LOCKDOWN };

function setMode(mode?: string, sample?: string) {
  if (mode === undefined) delete process.env.PDP_MODE; else process.env.PDP_MODE = mode;
  if (sample === undefined) delete process.env.PDP_SHADOW_SAMPLE; else process.env.PDP_SHADOW_SAMPLE = sample;
  invalidatePdpSettingsCache();
}

beforeAll(() => {
  m.createAuditEvent.mockResolvedValue({});
  m.createAarActionDecision.mockResolvedValue({});
  m.createApproval.mockImplementation(async () => ({ id: "approval-1" }));
  m.getMcpServerTools.mockResolvedValue([]);
  m.recordToolInvocation.mockResolvedValue({});
  m.getPlatformSetting.mockResolvedValue(undefined); // unset: the env decides
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => ({
    ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({ created: true }),
  })));
  setPdpShadowRecorder(async (c) => { recorded.push(c); });
});

afterAll(() => {
  setPdpShadowRecorder();
  for (const [k, v] of [["PDP_MODE", savedEnv.mode], ["PDP_SHADOW_SAMPLE", savedEnv.sample], ["ASTRA_LOCKDOWN", savedEnv.lockdown]] as const) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
  invalidatePdpSettingsCache();
  vi.unstubAllGlobals();
});

// ── Shadow mode changes nothing ─────────────────────────────────────────────

describe("PDP_MODE=shadow changes nothing the dispatcher decides or writes", () => {
  const results: Record<string, { result: any; threw: string | null; effects: any; comparisons: ShadowComparison[] }> = {};

  beforeAll(async () => {
    setMode("shadow", "1");
    resetPdpShadowState();
    const fetchMock = vi.mocked(globalThis.fetch as any);
    for (const c of CASES) {
      applySetup(storage, c.setup);
      resetPdpRateLimits();
      const req = caseRequest(c);
      for (let i = 0; i < (c.warmupCalls ?? 0); i++) await dispatchToolCall({ ...req, declaredScope: null });
      await pdpShadowIdle();
      for (const fn of Object.values(storage as any)) vi.mocked(fn as any).mockClear();
      vi.mocked(shadowApprovalRisk).mockClear();
      fetchMock.mockClear();
      executed.calls.length = 0;
      recorded = [];

      let res: any = null; let threw: string | null = null;
      try { res = await dispatchToolCall(req); } catch (e: any) { threw = e.message; }
      await new Promise(r => setTimeout(r, 0));
      await pdpShadowIdle();
      results[c.id] = {
        result: res ? {
          outcome: res.outcome, ok: res.ok, reason: scrub(res.reason) ?? null, error: scrub(res.error) ?? null,
          policyIds: res.policyIds ?? null, approvalId: res.approvalId ?? null, aarDecision: res.aarDecision ?? null,
          warrantDecision: res.warrantDecision ?? null, monitorFlagged: res.monitorFlagged ?? null,
        } : null,
        threw,
        effects: { ...recordPolicyEffects(storage, shadowApprovalRisk), toolInvocations: calls(m.recordToolInvocation).map(t => ({ outcome: t.outcome, organizationId: t.organizationId ?? null })) },
        comparisons: [...recorded],
      };
    }
    setMode(undefined);
  });

  it.each(CASES.map(c => [c.id]))("%s: result and writes equal the C1 golden", (id) => {
    const g = golden[id];
    expect({ result: results[id].result, threw: results[id].threw, effects: results[id].effects })
      .toEqual({ result: g.result, threw: g.threw, effects: g.effects });
  });

  it("compares every dispatch that reaches finish(): 84 identical, 1 excluded rate limit, and the throwing case not at all", () => {
    const byCategory: Record<string, number> = {};
    const notCompared: string[] = [];
    for (const c of CASES) {
      const cs = results[c.id].comparisons;
      if (cs.length === 0) notCompared.push(c.id);
      expect(cs.length).toBeLessThanOrEqual(1);
      for (const x of cs) byCategory[x.category] = (byCategory[x.category] ?? 0) + 1;
    }
    expect(notCompared).toEqual(["aar.config_throws"]);
    expect(byCategory).toEqual({ identical: 84, excluded_rate_limit: 1 });
    expect(results["rate.call_101"].comparisons[0].category).toBe("excluded_rate_limit");
  });

  it("records no raw arguments: only their hash", () => {
    const c = results["base.allow"].comparisons[0];
    expect(c.argsHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(c)).not.toContain("Water damage");
  });
});

// ── Categories ──────────────────────────────────────────────────────────────

describe("classes and categories", () => {
  it("maps legacy answers to classes", () => {
    expect(["success", "tool_error", "shadow_skipped", "deduplicated"].map(classOfDispatch)).toEqual(["passed", "passed", "passed", "passed"]);
    expect(classOfDispatch("gate_requires_approval")).toBe("approval");
    expect(classOfDispatch("gate_blocked_scope_drift")).toBe("blocked:scope");
    expect(classOfDispatch("gate_blocked_policy")).toBe("blocked:policy");
    expect(classOfAarLegacy({ decision: "BLOCK", rulesTriggered: ["rate-limit-exceeded"] })).toBe("rate_limited");
    expect(classOfAarLegacy({ decision: "BLOCK", rulesTriggered: ["denied-tool-list"] })).toBe("blocked:aar");
    expect(classOfAarLegacy({ decision: "BLOCK", rulesTriggered: ["no-p1"] })).toBe("blocked:policy");
    expect(classOfAarLegacy({ decision: "ALERT_AND_ALLOW" })).toBe("passed");
    expect(classOfCodeExecutionLegacy("REQUIRE_APPROVAL")).toBe("approval");
  });

  const u = (cls: string, gate: any = null, extra: Record<string, unknown> = {}) => ({ cls, gate, ...extra });
  it.each([
    ["native", "passed", u("passed"), "identical"],
    ["native", "blocked:policy", u("blocked:policy", "policy_bundle", { policyIds: ["p1"] }), "identical", ["p1"]],
    ["native", "blocked:policy", u("blocked:policy", "policy_bundle", { policyIds: ["p2"] }), "unexpected", ["p1"]],
    ["native", "passed", u("blocked:policy", "policy_rule"), "expected_stricter"],
    ["native", "approval", u("blocked:policy", "policy_rule"), "expected_stricter"],
    ["native", "passed", u("blocked:warrant", "warrant"), "unexpected"],
    ["native", "blocked:aar", u("passed"), "unexpected"],
    ["native", "rate_limited", u("passed"), "excluded_rate_limit"],
    ["native", "passed", u("rate_limited", "rate_limit"), "excluded_rate_limit"],
    ["native", "passed", u("blocked:pdp_error", "pdp_error"), "shadow_error"],
    ["aar", "passed", u("blocked:lockdown", "lockdown"), "expected_stricter"],
    ["aar", "passed", u("blocked:policy", "policy_bundle"), "expected_stricter"],
    ["aar", "blocked:aar", u("blocked:policy", "policy_bundle"), "expected_stricter"],
    ["aar", "approval", u("blocked:warrant", "warrant"), "expected_stricter"],
    ["aar", "approval", u("passed", null, { rulesTriggered: ["require-approval-tool-list", "previously-approved"] }), "expected_looser"],
    ["aar", "approval", u("passed", null, { rulesTriggered: [] }), "unexpected"],
    ["aar", "rate_limited", u("blocked:aar", "aar_list"), "excluded_rate_limit"],
    ["code-execution", "passed", u("blocked:policy", "policy_bundle"), "expected_stricter"],
    ["code-execution", "passed", u("blocked:lockdown", "lockdown"), "unexpected"],
  ] as const)("%s: legacy %s vs %j -> %s", (actor, legacy, unified, expected, legacyIds?) => {
    expect(classify(actor as any, legacy, unified as any, (legacyIds as any) ?? null)).toBe(expected);
  });
});

// ── Rails ───────────────────────────────────────────────────────────────────

describe("rails", () => {
  const req = () => caseRequest({ id: "x", what: "x" });
  beforeEach(() => {
    applySetup(storage, {});
    resetPdpShadowState();
    recorded = [];
    setPdpShadowRecorder(async (c) => { recorded.push(c); });
  });

  it("legacy mode (the default) never decides and never records", async () => {
    setMode(undefined);
    m.getAgent.mockClear();
    shadowCompareDispatch(req(), { outcome: "success" });
    await new Promise(r => setTimeout(r, 10));
    await pdpShadowIdle();
    expect(recorded).toEqual([]);
    expect(m.getAgent).not.toHaveBeenCalled();
    expect(pdpShadowStats()).toMatchObject({ compared: 0, sampledOut: 0, dropped: 0, failed: 0 });
  });

  it("a stored PDP_MODE takes precedence over the environment, and an unknown value reads as legacy", async () => {
    setMode("shadow");
    m.getPlatformSetting.mockImplementation(async (k: string) => (k === "PDP_MODE" ? { value: "shadw" } : undefined));
    invalidatePdpSettingsCache();
    shadowCompareDispatch(req(), { outcome: "success" });
    await new Promise(r => setTimeout(r, 10));
    await pdpShadowIdle();
    expect(recorded).toEqual([]);
    m.getPlatformSetting.mockResolvedValue(undefined);
    setMode(undefined);
  });

  it("sample 0 compares nothing and counts it", async () => {
    setMode("shadow", "0");
    shadowCompareDispatch(req(), { outcome: "success" });
    await new Promise(r => setTimeout(r, 10));
    expect(recorded).toEqual([]);
    expect(pdpShadowStats().sampledOut).toBe(1);
    setMode(undefined);
  });

  it("drops the 21st concurrent comparison instead of queueing it", async () => {
    setMode("shadow", "1");
    let release!: () => void;
    const gate = new Promise<void>(r => { release = r; });
    m.getAgent.mockImplementation(async () => { await gate; return { id: "agent-1", organizationId: "org-1", riskTier: "LOW", autonomyMode: "autonomous" }; });
    for (let i = 0; i < 25; i++) shadowCompareDispatch(req(), { outcome: "success" });
    await new Promise(r => setTimeout(r, 20));
    expect(pdpShadowStats()).toMatchObject({ inFlight: 20, dropped: 5 });
    release();
    await pdpShadowIdle();
    expect(pdpShadowStats()).toMatchObject({ inFlight: 0, compared: 20, dropped: 5 });
    setMode(undefined);
  });

  it("a recorder that throws is counted as failed and never reaches the caller", async () => {
    setMode("shadow", "1");
    setPdpShadowRecorder(async () => { throw new Error("db down"); });
    expect(() => shadowCompareDispatch(req(), { outcome: "success" })).not.toThrow();
    await new Promise(r => setTimeout(r, 10));
    await pdpShadowIdle();
    expect(pdpShadowStats()).toMatchObject({ failed: 1, compared: 0 });
    setMode(undefined);
  });

  it("a PDP that cannot read is a shadow_error, not a disagreement", async () => {
    setMode("shadow", "1");
    m.getAgent.mockRejectedValue(new Error("connection reset"));
    shadowCompareDispatch(req(), { outcome: "success" });
    await new Promise(r => setTimeout(r, 10));
    await pdpShadowIdle();
    expect(recorded.map(r => r.category)).toEqual(["shadow_error"]);
    setMode(undefined);
  });

  it("an AAR comparison without an organization is skipped and counted, never resolved org-wide", async () => {
    setMode("shadow", "1");
    vi.mocked(resolvePolicyBundle).mockClear();
    shadowCompareAar({ agentId: "agent-1", orgId: null, toolName: TOOL.toolName, legacy: { decision: "ALLOW" } });
    await new Promise(r => setTimeout(r, 10));
    await pdpShadowIdle();
    expect(resolvePolicyBundle).not.toHaveBeenCalled();
    expect(pdpShadowStats()).toMatchObject({ failed: 1, compared: 0 });
    setMode(undefined);
  });

  it("caps detail rows at 20 per key per hour and starts again the next hour", () => {
    const hour = Date.UTC(2026, 9, 25, 10);
    const slots = Array.from({ length: 25 }, () => takeDetailSlot("k", hour));
    expect(slots.filter(Boolean)).toHaveLength(20);
    expect(takeDetailSlot("other", hour)).toBe(true);
    expect(takeDetailSlot("k", hour + 3_600_000)).toBe(true);
  });
});

// ── The setting ─────────────────────────────────────────────────────────────

describe("validatePdpSetting", () => {
  it.each([
    ["PDP_MODE", "legacy", null], ["PDP_MODE", "shadow", null], ["PDP_MODE", " Shadow ", null],
    ["PDP_MODE", "unified", "not available yet"], ["PDP_MODE", "shadw", "must be one of"], ["PDP_MODE", "", "must be one of"],
    ["PDP_SHADOW_SAMPLE", "0", null], ["PDP_SHADOW_SAMPLE", "0.25", null], ["PDP_SHADOW_SAMPLE", "1", null],
    ["PDP_SHADOW_SAMPLE", "1.5", "from 0 to 1"], ["PDP_SHADOW_SAMPLE", "-0.1", "from 0 to 1"], ["PDP_SHADOW_SAMPLE", "half", "from 0 to 1"],
    ["DECISION_PROVIDER", "anything", null],
  ])("%s=%s", (key, value, refusal) => {
    const r = validatePdpSetting(key, value);
    if (refusal === null) expect(r).toBeNull(); else expect(r).toContain(refusal);
  });
});

// ── The report ──────────────────────────────────────────────────────────────

describe("summarise (GET /api/pdp/shadow-summary)", () => {
  const now = new Date("2026-11-05T12:00:00Z");
  const proc = (samples: number, p95Ms: number | null) => ({
    inFlight: 0, compared: 0, sampledOut: 0, dropped: 0, failed: 0, since: "2026-11-01T00:00:00Z",
    latency: { samples, p50Ms: p95Ms, p95Ms },
  });
  const base = { diffs: [], now, hours: 168, settings: { mode: "shadow", sample: 1 } };

  it("with nothing compared: measured is false and every flip check fails as not measured", () => {
    const s = summarise({ ...base, counts: [], firstComparisonAt: null, process: proc(0, null) });
    expect(s.measured).toBe(false);
    expect(s.flip.met).toBe(false);
    expect(s.flip.checks.every(c => !c.ok && String(c.value).startsWith("not measured"))).toBe(true);
  });

  it("7 days, enough native comparisons, none unexpected and a fast p95: met", () => {
    const s = summarise({ ...base,
      counts: [
        { actor_kind: "native", category: "identical", n: 2400, us_sum: 2400 * 3000, us_max: 12000 },
        { actor_kind: "native", category: "excluded_rate_limit", n: 3, us_sum: 9000, us_max: 4000 },
        { actor_kind: "aar", category: "expected_stricter", n: 4, us_sum: 20000, us_max: 9000 },
      ],
      firstComparisonAt: "2026-10-28T09:00:00Z", process: proc(500, 6.2) });
    expect(s.totals).toMatchObject({ compared: 2407, byCategory: { identical: 2400, excluded_rate_limit: 3, expected_stricter: 4 } });
    expect(s.flip.met).toBe(true);
  });

  it("one unexpected comparison fails the flip", () => {
    const s = summarise({ ...base,
      counts: [
        { actor_kind: "native", category: "identical", n: 2400, us_sum: 1, us_max: 1 },
        { actor_kind: "native", category: "unexpected", n: 1, us_sum: 1, us_max: 1 },
      ],
      firstComparisonAt: "2026-10-28T09:00:00Z", process: proc(500, 6.2) });
    expect(s.flip.met).toBe(false);
    expect(s.flip.checks.find(c => c.name.includes("unexpected"))).toMatchObject({ ok: false, value: "1" });
  });

  it(`too few latency samples (< ${FLIP.minLatencySamples}) is not a measured p95`, () => {
    const s = summarise({ ...base, counts: [{ actor_kind: "native", category: "identical", n: 5000, us_sum: 1, us_max: 1 }],
      firstComparisonAt: "2026-10-20T00:00:00Z", process: proc(40, 3) });
    expect(s.flip.checks.find(c => c.name.includes("p95"))).toMatchObject({ ok: false });
    expect(s.flip.met).toBe(false);
  });
});
