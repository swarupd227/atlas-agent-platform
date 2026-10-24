/**
 * Characterization of today's tool-call policy decisions (S0.2, commit C1).
 *
 * Pins what dispatchToolCall decides for a fixed matrix of cases -- each gate
 * alone, every adjacent pair of gates that both fire, the built-in exemptions,
 * and the odd edges -- and, as importantly, every WRITE it makes while
 * deciding: audit events (with their organizationId), approvals, AAR decision
 * rows, the approval-risk shadow call, the tool_invocations record, and
 * whether the tool actually executed.
 *
 * The unified policy decision point (server/policy-decision.ts, C2) must
 * reproduce this file exactly, apart from the intended changes listed in the
 * S0.2 plan. So the golden file is a specification, not a snapshot to refresh:
 * regenerate it (PDP_GOLDEN_WRITE=1) only together with a reviewed reason.
 *
 * Storage, the MCP client, the built-in tool executors and fetch are mocked --
 * no DB or network -- so this runs in the deterministic CI unit-test job.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";

// vi.mock factories are hoisted above every other statement, so what they use is hoisted too.
const { executed, builtin } = vi.hoisted(() => {
  const executed = { calls: [] as string[] };
  // Built-in tools: keep each module's ids and predicates, record execution.
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

import { dispatchToolCall, type DispatchRequest } from "../server/tool-dispatcher";
import { storage } from "../server/storage";
import { shadowApprovalRisk } from "../server/approval-risk-shadow";
import { CASES, applySetup, caseRequest, recordPolicyEffects, assertUniqueCaseIds, scrub, calls, type Case } from "./fixtures/pdp-cases";

const GOLDEN_PATH = resolve(__dirname, "__golden__/pdp-characterization.json");
const WRITE = process.env.PDP_GOLDEN_WRITE === "1";

// ── Recording ───────────────────────────────────────────────────────────────

function clearRecorders(fetchMock: ReturnType<typeof vi.fn>) {
  for (const fn of Object.values(storage as any)) vi.mocked(fn as any).mockClear();
  vi.mocked(shadowApprovalRisk).mockClear();
  fetchMock.mockClear();
  executed.calls.length = 0;
}

async function runCase(c: Case, fetchMock: ReturnType<typeof vi.fn>) {
  applySetup(storage, c.setup);
  const req: DispatchRequest = caseRequest(c);
  for (let i = 0; i < (c.warmupCalls ?? 0); i++) await dispatchToolCall({ ...req, declaredScope: null });
  clearRecorders(fetchMock);

  let res: Awaited<ReturnType<typeof dispatchToolCall>> | null = null;
  let threw: string | null = null;
  try { res = await dispatchToolCall(req); } catch (e: any) { threw = e.message; }
  await new Promise(r => setTimeout(r, 0)); // let fire-and-forget writes register

  const m = storage as any;
  return {
    what: c.what,
    result: res ? {
      outcome: res.outcome, ok: res.ok, reason: scrub(res.reason) ?? null, error: scrub(res.error) ?? null,
      policyIds: res.policyIds ?? null, approvalId: res.approvalId ?? null, aarDecision: res.aarDecision ?? null,
      warrantDecision: res.warrantDecision ?? null, monitorFlagged: res.monitorFlagged ?? null,
    } : null,
    threw,
    executed: fetchMock.mock.calls.length > 0 || executed.calls.length > 0,
    effects: {
      ...recordPolicyEffects(m, shadowApprovalRisk),
      toolInvocations: calls(m.recordToolInvocation).map(t => ({ outcome: t.outcome, organizationId: t.organizationId ?? null })),
    },
  };
}

// ── Run ─────────────────────────────────────────────────────────────────────

const actual: Record<string, unknown> = {};
const savedLockdown = process.env.ASTRA_LOCKDOWN;
let golden: Record<string, unknown> = {};

beforeAll(async () => {
  const fetchMock = vi.fn().mockImplementation(async () => ({
    ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({ created: true }),
  }));
  vi.stubGlobal("fetch", fetchMock);
  const m = vi.mocked(storage as any);
  m.createAuditEvent.mockResolvedValue({});
  m.createAarActionDecision.mockResolvedValue({});
  m.createApproval.mockImplementation(async () => ({ id: "approval-1" }));
  m.getMcpServerTools.mockResolvedValue([]);
  m.recordToolInvocation.mockResolvedValue({});

  assertUniqueCaseIds(CASES);
  for (const c of CASES) actual[c.id] = await runCase(c, fetchMock);

  if (WRITE) {
    mkdirSync(dirname(GOLDEN_PATH), { recursive: true });
    const sorted = Object.fromEntries(Object.keys(actual).sort().map(k => [k, actual[k]]));
    writeFileSync(GOLDEN_PATH, JSON.stringify(sorted, null, 2) + "\n");
  }
  golden = JSON.parse(readFileSync(GOLDEN_PATH, "utf8"));
});

afterAll(() => {
  if (savedLockdown === undefined) delete process.env.ASTRA_LOCKDOWN; else process.env.ASTRA_LOCKDOWN = savedLockdown;
  vi.unstubAllGlobals();
});

describe("tool-call policy decisions match the characterization golden", () => {
  it("covers exactly the cases in the golden file", () => {
    expect(Object.keys(actual).sort()).toEqual(Object.keys(golden).sort());
  });
  it.each(CASES.map(c => [c.id, c.what]))("%s — %s", (id) => {
    expect(actual[id]).toEqual(golden[id]);
  });
});
