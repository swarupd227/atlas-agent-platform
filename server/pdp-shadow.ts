/**
 * Shadow comparison for the policy decision point rollout (S0.2, C3).
 *
 * With PDP_MODE=shadow (server/pdp-mode.ts), every tool-call policy decision the
 * platform makes today -- in dispatchToolCall, in the AAR routes, at the code
 * execution gate -- is also put to the new PDP's decide() (server/policy-decision.ts),
 * and the two answers are compared and counted. Nothing routes on the PDP's
 * answer: today's code stays authoritative, decide() runs with deps that refuse
 * every write, and each entry point here is fire-and-forget and never throws.
 * In legacy mode (the default) each entry point returns after one cached read.
 *
 * Both answers are reduced to a class (passed / approval / blocked:<gate> /
 * rate_limited) and the pair to a category:
 *   identical            same class (and the same policies, for a policy block)
 *   excluded_rate_limit  either side rate limited: the legacy side has already
 *                        spent its token and the PDP's bucket is separate
 *   expected_stricter    the PDP is stricter through a gate on the S0.2
 *                        intended-change list for this caller
 *   expected_looser      AAR: the PDP honours a standing grant the AAR route never did
 *   shadow_error         the PDP could not read what it needed (pdp_error)
 *   unexpected           anything else -- the flip to unified requires none
 *
 * Every comparison is counted (pdp_shadow_counts), so "no disagreements" always
 * comes with how many calls were compared; anything not identical also gets a
 * detail row (pdp_shadow_diffs), at most 20 per key per hour, with a hash of the
 * arguments and never the arguments themselves. The report is
 * GET /api/pdp/shadow-summary (server/routes/pdp-shadow.ts).
 *
 * Known blind spot: a dispatch whose legacy policy read THREW never reaches
 * finish(), so it is not compared here; parity rule R7 covers that case.
 */
import { createHash } from "crypto";
import { decide, readOnlyPdpDeps, type PdpActorKind, type PdpDecision, type PdpGate, type PdpRequest } from "./policy-decision";
import { getPdpSettings } from "./pdp-mode";
import { resolvePolicyBundle } from "./routes/helpers";
import { storage } from "./storage";
import type { AvailableTool, DispatchRequest } from "./tool-dispatcher";

// ── Classes and categories ───────────────────────────────────────────────────

export type DecisionClass = string; // "passed" | "approval" | "rate_limited" | `blocked:${gate}`
export type ShadowCategory =
  | "identical" | "excluded_rate_limit" | "expected_stricter" | "expected_looser" | "shadow_error" | "unexpected";

/** A dispatcher outcome as a class. */
export function classOfDispatch(outcome: string): DecisionClass {
  switch (outcome) {
    case "success": case "tool_error": case "shadow_skipped": case "deduplicated": return "passed";
    case "gate_requires_approval": return "approval";
    case "rate_limited": return "rate_limited";
    case "gate_blocked_scope_drift": return "blocked:scope";
    default: return outcome.startsWith("gate_blocked_") ? `blocked:${outcome.slice("gate_blocked_".length)}` : `blocked:${outcome}`;
  }
}

/** The AAR route's own answer as a class. */
export function classOfAarLegacy(legacy: { decision: string; rulesTriggered?: string[] }): DecisionClass {
  const rules = legacy.rulesTriggered ?? [];
  if (legacy.decision === "BLOCK") {
    if (rules.includes("rate-limit-exceeded")) return "rate_limited";
    if (rules.includes("denied-tool-list") || rules.includes("not-in-allowed-list")) return "blocked:aar";
    return "blocked:policy";
  }
  if (legacy.decision === "REQUIRE_APPROVAL") return "approval";
  return "passed";
}

/** The code-execution gate's answer (evaluateActionPolicy: the AAR lists only) as a class. */
export function classOfCodeExecutionLegacy(decision: string): DecisionClass {
  return decision === "BLOCK" ? "blocked:aar" : decision === "REQUIRE_APPROVAL" ? "approval" : "passed";
}

const GATE_CLASS: Record<PdpGate, string> = {
  lockdown: "lockdown", skill: "skill", policy_bundle: "policy", policy_rule: "policy", aar_list: "aar",
  warrant: "warrant", scope: "scope", rate_limit: "rate_limited", pdp_error: "pdp_error",
};

/** The PDP's answer as a class. */
export function classOfUnified(d: Pick<PdpDecision, "outcome" | "gate">): DecisionClass {
  if (d.outcome === "passed") return "passed";
  if (d.outcome === "gate_requires_approval") return "approval";
  if (d.outcome === "rate_limited") return "rate_limited";
  return `blocked:${d.gate ? GATE_CLASS[d.gate] : "unknown"}`;
}

/** Gates through which the PDP is stricter ON PURPOSE, per caller (the S0.2 intended-change list). */
const EXPECTED_STRICTER: Record<PdpActorKind, ReadonlySet<PdpGate>> = {
  native: new Set<PdpGate>(["policy_rule"]),
  aar: new Set<PdpGate>(["lockdown", "policy_bundle", "policy_rule", "warrant"]),
  "code-execution": new Set<PdpGate>(["policy_bundle", "policy_rule", "warrant"]),
  "mcp-gateway": new Set<PdpGate>(),
};

const rank = (c: DecisionClass) => (c === "passed" ? 0 : c === "approval" ? 1 : 2);
const sameSet = (a?: string[] | null, b?: string[] | null) =>
  JSON.stringify([...(a ?? [])].sort()) === JSON.stringify([...(b ?? [])].sort());

export interface UnifiedSide { cls: DecisionClass; gate: PdpGate | null; policyIds?: string[]; rulesTriggered?: string[] }

export function classify(actor: PdpActorKind, legacy: DecisionClass, unified: UnifiedSide, legacyPolicyIds?: string[] | null): ShadowCategory {
  if (legacy === "rate_limited" || unified.cls === "rate_limited") return "excluded_rate_limit";
  if (unified.gate === "pdp_error") return "shadow_error";
  if (legacy === unified.cls) {
    if (legacy === "blocked:policy" && actor === "native" && legacyPolicyIds && !sameSet(legacyPolicyIds, unified.policyIds)) return "unexpected";
    return "identical";
  }
  const expectedGate = unified.gate !== null && EXPECTED_STRICTER[actor].has(unified.gate);
  if (rank(unified.cls) >= rank(legacy) && expectedGate) return "expected_stricter";
  if (actor === "aar" && legacy === "approval" && unified.cls === "passed" && (unified.rulesTriggered ?? []).includes("previously-approved")) {
    return "expected_looser";
  }
  return "unexpected";
}

// ── Recording ────────────────────────────────────────────────────────────────

export interface ShadowComparison {
  hour: Date;
  actor: PdpActorKind;
  organizationId: string | null;
  agentId: string;
  toolName: string;
  serverId: string | null;
  category: ShadowCategory;
  legacyClass: DecisionClass;
  legacyReason: string | null;
  unifiedClass: DecisionClass;
  unifiedGate: PdpGate | null;
  unifiedReason: string;
  rulesTriggered: string[];
  argsHash: string;
  traceId: string | null;
  decideUs: number;
  /** Whether this comparison also gets a detail row (non-identical, under the hourly cap). */
  detail: boolean;
}
export type ShadowRecorder = (c: ShadowComparison) => Promise<void>;

async function dbRecorder(c: ShadowComparison): Promise<void> {
  // Lazy: legacy mode, and every test that mocks storage, never loads the database.
  const [{ db }, { sql }] = await Promise.all([import("./db"), import("drizzle-orm")]);
  await db.execute(sql`
    INSERT INTO pdp_shadow_counts (hour, actor_kind, organization_id, agent_id, tool_name, category, n, decide_us_sum, decide_us_max)
    VALUES (${c.hour.toISOString()}::timestamp, ${c.actor}, ${c.organizationId}, ${c.agentId}, ${c.toolName}, ${c.category}, 1, ${c.decideUs}, ${c.decideUs})
    ON CONFLICT (hour, actor_kind, agent_id, tool_name, category) DO UPDATE SET
      n = pdp_shadow_counts.n + 1,
      decide_us_sum = pdp_shadow_counts.decide_us_sum + EXCLUDED.decide_us_sum,
      decide_us_max = GREATEST(pdp_shadow_counts.decide_us_max, EXCLUDED.decide_us_max)
  `);
  if (!c.detail) return;
  await db.execute(sql`
    INSERT INTO pdp_shadow_diffs (actor_kind, organization_id, agent_id, tool_name, server_id, category, legacy_class, legacy_reason,
      unified_class, unified_gate, unified_reason, rules_triggered, args_hash, trace_id)
    VALUES (${c.actor}, ${c.organizationId}, ${c.agentId}, ${c.toolName}, ${c.serverId}, ${c.category}, ${c.legacyClass}, ${c.legacyReason},
      ${c.unifiedClass}, ${c.unifiedGate}, ${c.unifiedReason}, ${JSON.stringify(c.rulesTriggered)}::jsonb, ${c.argsHash}, ${c.traceId})
  `);
}

let recorder: ShadowRecorder = dbRecorder;
/** For tests: where comparisons go. Pass nothing to restore the database recorder. */
export function setPdpShadowRecorder(r?: ShadowRecorder): void { recorder = r ?? dbRecorder; }

// Detail rows: at most DETAIL_CAP per key per hour; the counts keep the full volume.
const DETAIL_CAP = 20;
let detailHour = 0;
const detailCounts = new Map<string, number>();
export function takeDetailSlot(key: string, hourStartMs: number): boolean {
  if (hourStartMs !== detailHour) { detailHour = hourStartMs; detailCounts.clear(); }
  const n = detailCounts.get(key) ?? 0;
  if (n >= DETAIL_CAP) return false;
  detailCounts.set(key, n + 1);
  return true;
}

// ── Process-local rails and stats ────────────────────────────────────────────

const MAX_IN_FLIGHT = 20;
let inFlight = 0;
const startedAt = new Date().toISOString();
const stats = { compared: 0, sampledOut: 0, dropped: 0, failed: 0 };
const LATENCY_SAMPLES = 5_000;
const latencies: number[] = [];
let lastFailureLog = 0;
const idleWaiters: Array<() => void> = [];

export function pdpShadowStats() {
  const sorted = [...latencies].sort((a, b) => a - b);
  const pct = (p: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] / 1000 : null);
  return { inFlight, ...stats, since: startedAt, latency: { samples: sorted.length, p50Ms: pct(0.5), p95Ms: pct(0.95) } };
}

// Every comparison from the moment it is fired until it is done, including the
// settings read before it counts as in flight: what "idle" has to wait for.
let pending = 0;

/** For tests: resolves once no comparison is pending. */
export function pdpShadowIdle(): Promise<void> {
  return pending === 0 ? Promise.resolve() : new Promise(r => idleWaiters.push(r));
}

/** For tests. */
export function resetPdpShadowState(): void {
  Object.assign(stats, { compared: 0, sampledOut: 0, dropped: 0, failed: 0 });
  latencies.length = 0;
  detailCounts.clear();
}

function stableStringify(obj: unknown): string {
  if (obj === null || obj === undefined || typeof obj !== "object") return JSON.stringify(obj) ?? "null";
  if (Array.isArray(obj)) return "[" + obj.map(stableStringify).join(",") + "]";
  return "{" + Object.keys(obj as object).sort().map(k => JSON.stringify(k) + ":" + stableStringify((obj as any)[k])).join(",") + "}";
}

interface CompareInput {
  actor: PdpActorKind;
  agentId: string;
  orgId: string | null;
  tool: AvailableTool;
  args: Record<string, unknown>;
  traceId: string | null;
  legacyClass: DecisionClass;
  legacyReason: string | null;
  legacyPolicyIds?: string[] | null;
  buildRequest: () => Promise<PdpRequest>;
}

async function compare(input: CompareInput): Promise<void> {
  const settings = await getPdpSettings();
  if (settings.mode !== "shadow") return;
  if (Math.random() >= settings.sample) { stats.sampledOut++; return; }
  if (inFlight >= MAX_IN_FLIGHT) { stats.dropped++; return; }
  inFlight++;
  try {
    const req = await input.buildRequest();
    const t0 = performance.now();
    const d = await decide(req, readOnlyPdpDeps());
    const decideUs = Math.round((performance.now() - t0) * 1000);
    latencies.push(decideUs);
    if (latencies.length > LATENCY_SAMPLES) latencies.shift();

    const unifiedClass = classOfUnified(d);
    const category = classify(input.actor, input.legacyClass, { cls: unifiedClass, gate: d.gate, policyIds: d.policyIds, rulesTriggered: d.rulesTriggered }, input.legacyPolicyIds);
    const hourMs = Math.floor(Date.now() / 3_600_000) * 3_600_000;
    const detail = category !== "identical" &&
      takeDetailSlot([input.actor, input.agentId, input.tool.toolName, category, input.legacyClass, unifiedClass].join("|"), hourMs);
    await recorder({
      hour: new Date(hourMs), actor: input.actor, organizationId: input.orgId, agentId: input.agentId,
      toolName: input.tool.toolName, serverId: input.tool.serverId ?? null, category,
      legacyClass: input.legacyClass, legacyReason: input.legacyReason, unifiedClass, unifiedGate: d.gate, unifiedReason: d.reason,
      rulesTriggered: d.rulesTriggered, argsHash: createHash("sha256").update(stableStringify(input.args)).digest("hex"),
      traceId: input.traceId, decideUs, detail,
    });
    stats.compared++;
  } catch (err: any) {
    stats.failed++;
    if (Date.now() - lastFailureLog > 60_000) {
      lastFailureLog = Date.now();
      console.warn(`[pdp-shadow] comparison failed (counted, never surfaced to the caller): ${err?.message ?? err}`);
    }
  } finally {
    inFlight--;
  }
}

function settle(): void {
  pending--;
  if (pending === 0) idleWaiters.splice(0).forEach(r => r());
}

/** Runs a comparison without ever throwing into, or delaying, the caller. */
function fire(input: () => CompareInput): void {
  pending++;
  try {
    void compare(input()).catch(() => { stats.failed++; }).finally(settle);
  } catch {
    stats.failed++;
    settle();
  }
}

// ── Entry points ─────────────────────────────────────────────────────────────

/** From dispatchToolCall's finish(): every outcome of every native tool call. */
export function shadowCompareDispatch(req: DispatchRequest, partial: { outcome: string; reason?: string; policyIds?: string[] }): void {
  fire(() => ({
    actor: "native", agentId: req.agentId, orgId: req.orgId ?? null, tool: req.tool, args: req.args, traceId: req.traceId ?? null,
    legacyClass: classOfDispatch(partial.outcome), legacyReason: partial.reason ?? null, legacyPolicyIds: partial.policyIds ?? null,
    buildRequest: async () => ({
      actor: { kind: "native", agentId: req.agentId, orgId: req.orgId ?? null },
      tool: req.tool, args: req.args,
      ctx: {
        policyBundle: req.policyBundle, skillAllowlist: req.skillAllowlist, declaredScope: req.declaredScope,
        humanApprovedApprovalId: req.humanApprovedApprovalId, traceId: req.traceId, iteration: req.iteration, deploymentId: req.deploymentId,
      },
    }),
  }));
}

const syntheticTool = (toolName: string, serverId?: string | null): AvailableTool => ({
  serverId: serverId ?? "", serverName: "", serverUrl: "", toolName, toolDescription: "", toolInputSchema: {},
});

/** From the AAR routes, after evaluateActionAgainstConstraints. */
export function shadowCompareAar(input: {
  agentId: string; orgId?: string | null; toolName: string; serverId?: string | null; args?: Record<string, unknown>;
  legacy: { decision: string; reason?: string; rulesTriggered?: string[] };
}): void {
  const tool = syntheticTool(input.toolName, input.serverId);
  const orgId = input.orgId ?? null;
  fire(() => ({
    actor: "aar", agentId: input.agentId, orgId, tool, args: input.args ?? {}, traceId: null,
    legacyClass: classOfAarLegacy(input.legacy), legacyReason: input.legacy.reason ?? null,
    buildRequest: async () => {
      // No organization, no comparison: a bundle resolved without one could read every
      // organization's policies. Thrown here, so it is counted as failed in shadow mode only.
      if (!orgId) throw new Error(`AAR comparison skipped: no organization for agent ${input.agentId}`);
      return {
        actor: { kind: "aar", agentId: input.agentId, orgId },
        tool, args: input.args ?? {},
        ctx: { policyBundle: await resolvePolicyBundle(input.agentId, orgId) },
      };
    },
  }));
}

/** From the code-execution gate, after evaluateActionPolicy. */
export function shadowCompareCodeExecution(agentId: string, tool: AvailableTool, legacyDecision: string): void {
  fire(() => ({
    actor: "code-execution", agentId, orgId: null, tool, args: {}, traceId: null,
    legacyClass: classOfCodeExecutionLegacy(legacyDecision), legacyReason: null,
    buildRequest: async () => {
      // The gate has no request context, so the organization is the agent's own: a
      // bundle resolved without one could read every organization's policies.
      const orgId: string | null = (await storage.getAgent(agentId))?.organizationId ?? null;
      if (!orgId) throw new Error(`code-execution comparison skipped: agent ${agentId} has no organization`);
      return {
        actor: { kind: "code-execution", agentId, orgId },
        tool, args: {},
        ctx: { policyBundle: await resolvePolicyBundle(agentId, orgId) },
      };
    },
  }));
}
