/**
 * Characterization of the AAR route's own policy evaluator,
 * evaluateActionAgainstConstraints (server/routes/aar.ts) -- S0.2, commit C1.
 *
 * This is the second decision engine: the one external callers of
 * /api/agents/:id/aar/evaluate-action and /aar/invoke-tool meet. It differs
 * from the dispatcher's (rate limit first, arg-level policy rules, no
 * standing grant, no lockdown/bundle/warrant), and the unified policy decision
 * point changes it on purpose. This golden records today's behaviour so that
 * every one of those changes is visible as a named diff in C4, never a
 * surprise. Regenerate only with PDP_GOLDEN_WRITE=1 and a reviewed reason.
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";

vi.mock("../server/storage", () => ({
  storage: {
    getAgent: vi.fn(),
    getAarConfig: vi.fn(),
    getPoliciesByScope: vi.fn(),
  },
}));

import { evaluateActionAgainstConstraints } from "../server/routes/aar";
import { storage } from "../server/storage";

const GOLDEN_PATH = resolve(__dirname, "__golden__/aar-characterization.json");
const WRITE = process.env.PDP_GOLDEN_WRITE === "1";
const ORG = "org-1";

const agent = (id: string, over: Record<string, unknown> = {}) =>
  ({ id, name: "Claims Agent", riskTier: "MEDIUM", autonomyMode: "autonomous", organizationId: ORG, ...over });
const aar = (over: Record<string, unknown> = {}) => ({ allowedTools: [], deniedTools: [], requireApprovalTools: [], rateLimits: null, ...over });
const policy = (id: string, rules: unknown[], status = "active") => ({ id, name: `Policy ${id}`, status, policyJson: { rules } });

interface Case {
  id: string;
  what: string;
  agent?: Record<string, unknown> | null;
  aar?: Record<string, unknown> | null;
  policies?: unknown[];
  tool?: string;
  args?: Record<string, unknown>;
  /** Calls made first (same agent and tool) whose results are not recorded. */
  warmupCalls?: number;
}

// Each case uses its own agent id: the AAR token bucket is module state keyed by agent:tool.
const CASES: Case[] = [
  { id: "base.allow", what: "no config, no policies" },
  { id: "base.no_agent_row", what: "agent row not found", agent: null },
  { id: "list.deny", what: "deny list names the tool", aar: aar({ deniedTools: ["create_ticket"] }) },
  { id: "list.allow_miss", what: "allow list omits the tool", aar: aar({ allowedTools: ["other_tool"] }) },
  { id: "list.allow_hit", what: "allow list names the tool", aar: aar({ allowedTools: ["create_ticket"] }) },
  { id: "list.require_approval", what: "require-approval list names the tool", aar: aar({ requireApprovalTools: ["create_ticket"] }) },
  { id: "list.deny_over_require", what: "deny and require-approval both name it", aar: aar({ deniedTools: ["create_ticket"], requireApprovalTools: ["create_ticket"] }) },
  { id: "risk.high_supervised", what: "HIGH + supervised", agent: { riskTier: "HIGH", autonomyMode: "supervised" } },
  { id: "risk.high_lowercase_supervised", what: "lower-case high + supervised", agent: { riskTier: "high", autonomyMode: "supervised" } },
  { id: "risk.high_autonomous", what: "HIGH + autonomous", agent: { riskTier: "HIGH" } },
  { id: "rule.block_by_tool", what: "block rule matching the tool name", policies: [policy("p1", [{ name: "no-tickets", condition: { toolName: "create_ticket" }, block: true }])] },
  { id: "rule.block_tool_array", what: "block rule with a tool-name array", policies: [policy("p1", [{ name: "no-writes", condition: { toolName: ["create_ticket", "delete_ticket"] }, block: true }])] },
  { id: "rule.block_other_tool", what: "block rule for a different tool", policies: [policy("p1", [{ name: "no-deletes", condition: { toolName: "delete_ticket" }, block: true }])] },
  { id: "rule.block_args_match", what: "block rule matching an arg value", args: { priority: "P1" },
    policies: [policy("p1", [{ name: "no-p1", condition: { toolName: "create_ticket", args: { priority: "P1" } }, block: true }])] },
  { id: "rule.block_args_mismatch", what: "block rule whose arg value differs", args: { priority: "P3" },
    policies: [policy("p1", [{ name: "no-p1", condition: { toolName: "create_ticket", args: { priority: "P1" } }, block: true }])] },
  { id: "rule.block_args_number_vs_string", what: "arg rule compares as strings (1200 vs '1200')", args: { amount: 1200 },
    policies: [policy("p1", [{ name: "amount-1200", condition: { args: { amount: "1200" } }, block: true }])] },
  { id: "rule.unconditional_block", what: "rule with no condition blocks every tool", policies: [policy("p1", [{ name: "freeze", block: true }])] },
  { id: "rule.non_block_match", what: "matching rule without block: recorded, allowed", policies: [policy("p1", [{ name: "watch", condition: { toolName: "create_ticket" } }])] },
  { id: "rule.inactive_policy", what: "matching block rule on an inactive policy is ignored",
    policies: [policy("p1", [{ name: "no-tickets", condition: { toolName: "create_ticket" }, block: true }], "draft")] },
  { id: "rule.unnamed", what: "unnamed matching block rule gets a generated name", policies: [policy("p9", [{ condition: { toolName: "create_ticket" }, block: true }])] },
  { id: "order.rule_over_require", what: "block rule beats the require-approval list", aar: aar({ requireApprovalTools: ["create_ticket"] }),
    policies: [policy("p1", [{ name: "no-tickets", condition: { toolName: "create_ticket" }, block: true }])] },
  { id: "order.allow_miss_over_rule", what: "allow-list miss is decided before policy rules", aar: aar({ allowedTools: ["other_tool"] }),
    policies: [policy("p1", [{ name: "no-tickets", condition: { toolName: "create_ticket" }, block: true }])] },
  { id: "rate.within_burst", what: "second call with burst 2: allowed", aar: aar({ rateLimits: { requestsPerMinute: 1, burstCapacity: 2 } }), warmupCalls: 1 },
  { id: "rate.over_burst", what: "third call with burst 2: rate limited", aar: aar({ rateLimits: { requestsPerMinute: 1, burstCapacity: 2 } }), warmupCalls: 2 },
  { id: "rate.over_burst_on_denied_tool", what: "rate limit is checked before the deny list",
    aar: aar({ deniedTools: ["create_ticket"], rateLimits: { requestsPerMinute: 1, burstCapacity: 1 } }), warmupCalls: 1 },
  { id: "rate.per_tool_limit", what: "per-tool limit overrides the global one",
    aar: aar({ rateLimits: { requestsPerMinute: 600, burstCapacity: 50, create_ticket: { requestsPerMinute: 1, burstCapacity: 1 } } }), warmupCalls: 1 },
];

const actual: Record<string, unknown> = {};
let golden: Record<string, unknown> = {};

beforeAll(async () => {
  const m = vi.mocked(storage as any);
  const ids = new Set<string>();
  for (const c of CASES) {
    if (ids.has(c.id)) throw new Error(`duplicate case id ${c.id}`);
    ids.add(c.id);
    const agentId = `agent-${c.id}`;
    m.getAgent.mockResolvedValue(c.agent === null ? undefined : agent(agentId, c.agent ?? {}));
    m.getAarConfig.mockResolvedValue(c.aar ?? null);
    m.getPoliciesByScope.mockResolvedValue(c.policies ?? []);
    const tool = c.tool ?? "create_ticket";
    for (let i = 0; i < (c.warmupCalls ?? 0); i++) await evaluateActionAgainstConstraints(agentId, tool, "srv-1", ORG, c.args ?? {});
    const r = await evaluateActionAgainstConstraints(agentId, tool, "srv-1", ORG, c.args ?? {});
    actual[c.id] = { what: c.what, ...r };
  }
  if (WRITE) {
    mkdirSync(dirname(GOLDEN_PATH), { recursive: true });
    const sorted = Object.fromEntries(Object.keys(actual).sort().map(k => [k, actual[k]]));
    writeFileSync(GOLDEN_PATH, JSON.stringify(sorted, null, 2) + "\n");
  }
  golden = JSON.parse(readFileSync(GOLDEN_PATH, "utf8"));
});

describe("AAR route policy decisions match the characterization golden", () => {
  it("covers exactly the cases in the golden file", () => {
    expect(Object.keys(actual).sort()).toEqual(Object.keys(golden).sort());
  });
  it.each(CASES.map(c => [c.id, c.what]))("%s — %s", (id) => {
    expect(actual[id]).toEqual(golden[id]);
  });
});
