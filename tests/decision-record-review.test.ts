/**
 * The review queue for decision records.
 *
 * Why it exists: the recall gate shipped with PATCH /api/decision-records/:id
 * and POST /api/decision-records/:id/supersede and nothing that would give you
 * an :id. So INTELLIGENCE_RECALL_REQUIRE_REVIEW could be switched on, every
 * unreviewed record would be withheld from reuse, and there was no way to work
 * through the backlog that created. A gate nobody can clear is an off switch,
 * not a quality control.
 *
 * What these pin is the part a flat list would lose: each row carries the
 * recall gate's OWN verdict, from the same function resolveContext calls, so a
 * reviewer is told "withheld because nobody reviewed it" rather than being
 * handed an undifferentiated list and left to guess. That distinction is the
 * entire reason this layer exists, and it has already been re-broken once one
 * layer down (absence claims firing for records the gate had withheld).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import type { Server } from "http";

const state: any = { records: [], settings: {}, updates: [], audits: [] };

const matching = (opts: any) => {
  const now = new Date();
  return state.records.filter((r: any) => {
    if (opts.subject && r.subject !== opts.subject) return false;
    if (opts.reviewState && r.reviewState !== opts.reviewState) return false;
    switch (opts.lifecycle ?? "live") {
      case "all": return true;
      case "superseded": return !!r.supersededAt;
      case "expired": return !r.supersededAt && r.expiresAt && new Date(r.expiresAt) <= now;
      case "pending": return !r.supersededAt && r.reviewState === "unreviewed";
      default: return !r.supersededAt && (!r.expiresAt || new Date(r.expiresAt) > now)
        && (!r.effectiveFrom || new Date(r.effectiveFrom) <= now);
    }
  });
};

vi.mock("../server/storage", () => ({
  storage: {
    // Mirrors the real query's filtering so the route is tested against the
    // shape it actually gets, and returns the unfiltered total separately --
    // the thing a caller needs to tell "that is all" from "there is more".
    listDecisionRecords: vi.fn(async (opts: any) => {
      const all = matching(opts);
      const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
      const offset = Math.max(opts.offset ?? 0, 0);
      return { rows: all.slice(offset, offset + limit), total: all.length };
    }),
    getDecisionRecord: vi.fn(async (id: string) => state.records.find((r: any) => r.id === id)),
    updateDecisionRecord: vi.fn(async (id: string, patch: any) => { state.updates.push({ id, patch }); return { ...state.records.find((r: any) => r.id === id), ...patch }; }),
    supersedeDecisionRecord: vi.fn(async (id: string, by: any) => ({ ...state.records.find((r: any) => r.id === id), supersededAt: new Date(), ...by })),
    getPlatformSetting: vi.fn(async (k: string) => (k in state.settings ? { value: state.settings[k] } : undefined)),
    createAuditEvent: vi.fn(async (e: any) => { state.audits.push(e); return e; }),
    getEvalSuite: vi.fn(async () => null),
    getEvalRuns: vi.fn(async () => []),
  },
}));
vi.mock("../server/auth", () => ({ getOrgId: () => "org1", getDefaultOrgId: () => "org1" }));
vi.mock("../server/permissions", () => ({
  checkPermission: () => (_req: any, _res: any, next: any) => next(),
  getRequestRole: () => "admin",
}));
vi.mock("../server/claude", () => ({
  callClaude: vi.fn(async () => "{}"),
  callClaudeWithUsage: vi.fn(async () => ({ text: "{}", model: "m", latencyMs: 1, inputTokens: 1, costUsd: 0 })),
  stripJsonFences: (s: string) => s,
  getAnthropicClient: vi.fn(() => ({})),
}));
vi.mock("../server/decision-provider", () => ({ decideMany: vi.fn(async () => ({})), knownIncumbent: vi.fn() }));

const { default: createEvaluationsRouter } = await import("../server/routes/evaluations");

let server: Server;
let base = "";
const get = async (p: string) => { const r = await fetch(`${base}${p}`); return { status: r.status, body: await r.json().catch(() => ({})) }; };
const patch = async (p: string, b: any) => { const r = await fetch(`${base}${p}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
const post = async (p: string, b: any) => { const r = await fetch(`${base}${p}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }); return { status: r.status, body: await r.json().catch(() => ({})) }; };

const rec = (over: any = {}) => ({
  id: over.id ?? "r1", subject: "submission:SUB-2026-8891", subjectType: "submission",
  teamAgentId: "teamA", runId: "runaaaaaaaa", reviewState: "unreviewed",
  decidedAt: new Date("2026-10-03T10:00:00Z"), decision: { status: "bound and active" },
  evidence: {}, fromKeys: ["status"], organizationId: "org1", ...over,
});

beforeEach(async () => {
  state.records = []; state.settings = {}; state.updates = []; state.audits = [];
  if (!server) {
    const app = express();
    app.use(express.json());
    app.use(createEvaluationsRouter({}));
    await new Promise<void>((res) => { server = app.listen(0, () => { base = `http://127.0.0.1:${(server.address() as any).port}`; res(); }); });
  }
});

describe("GET /api/decision-records", () => {
  it("hands back the ids the review routes need, which nothing did before", async () => {
    state.records = [rec({ id: "r1" }), rec({ id: "r2", subject: "binder:CP-1" })];
    const r = await get("/api/decision-records");
    expect(r.status).toBe(200);
    expect(r.body.records.map((x: any) => x.id).sort()).toEqual(["r1", "r2"]);
  });

  it("says WHY each withheld record is withheld, not merely that it is", async () => {
    state.settings = { INTELLIGENCE_RECALL_REQUIRE_REVIEW: "on" };
    state.records = [
      rec({ id: "unrev", reviewState: "unreviewed" }),
      rec({ id: "low", reviewState: "reviewed", confidence: 0.2 }),
      rec({ id: "ok", reviewState: "reviewed" }),
    ];
    const r = await get("/api/decision-records?lifecycle=all");
    const by = Object.fromEntries(r.body.records.map((x: any) => [x.id, x.recall]));
    expect(by.unrev.recallable).toBe(false);
    expect(by.unrev.reason).toBe("unreviewed");
    expect(by.unrev.detail).toMatch(/no one has reviewed it/);
    expect(by.low.reason).toBe("low_confidence");
    expect(by.ok).toEqual({ recallable: true, reason: null, detail: null });
  });

  it("follows the supersession chain instead of leaving the reader an id", async () => {
    state.records = [
      rec({ id: "old", supersededAt: new Date("2026-10-06T09:00:00Z"), supersededBy: "new", supersededReason: "clausesUsed was wrong" }),
      rec({ id: "new", reviewState: "reviewed", decision: { status: "bound_active" } }),
    ];
    const r = await get("/api/decision-records/old");
    expect(r.status).toBe(200);
    expect(r.body.recall.reason).toBe("superseded");
    expect(r.body.recall.detail).toMatch(/clausesUsed was wrong/);
    // Readable, not hidden: "we decided X then replaced it with Y" is the audit story.
    expect(r.body.supersededByRecord.id).toBe("new");
    expect(r.body.supersededByRecord.decision.status).toBe("bound_active");
  });

  it("reports the total behind the page, so a short page is not read as the whole queue", async () => {
    state.records = Array.from({ length: 7 }, (_, i) => rec({ id: `r${i}` }));
    const r = await get("/api/decision-records?limit=2");
    expect(r.body.returned).toBe(2);
    expect(r.body.total).toBe(7);
  });

  it("says whether reviewing actually unblocks anything", async () => {
    // With the requirement off, reviewing is curation rather than unblocking,
    // and a queue that did not say so would imply the backlog is holding
    // records back when it is not.
    const off = await get("/api/decision-records");
    expect(off.body.reviewRequirement).toBe("off");
    expect(off.body.reviewRequirementNote).toMatch(/still offered for reuse/);
    state.settings = { INTELLIGENCE_RECALL_REQUIRE_REVIEW: "on" };
    const on = await get("/api/decision-records");
    expect(on.body.reviewRequirement).toBe("on");
    expect(on.body.reviewRequirementNote).toMatch(/being withheld/);
  });

  it("filters to the reviewer's working set with lifecycle=pending", async () => {
    state.records = [
      rec({ id: "todo", reviewState: "unreviewed" }),
      rec({ id: "done", reviewState: "reviewed" }),
      rec({ id: "gone", reviewState: "unreviewed", supersededAt: new Date() }),
    ];
    const r = await get("/api/decision-records?lifecycle=pending");
    expect(r.body.records.map((x: any) => x.id)).toEqual(["todo"]);
  });

  it("refuses a lifecycle or reviewState it does not understand, rather than silently listing everything", async () => {
    expect((await get("/api/decision-records?lifecycle=whatever")).status).toBe(400);
    expect((await get("/api/decision-records?reviewState=great")).status).toBe(400);
  });
});

describe("the review actions the queue now makes reachable", () => {
  it("records a review and audits it", async () => {
    state.records = [rec({ id: "r1" })];
    const r = await patch("/api/decision-records/r1", { reviewState: "reviewed", confidence: 0.9 });
    expect(r.status).toBe(200);
    expect(state.updates[0].patch).toMatchObject({ reviewState: "reviewed", confidence: 0.9 });
    expect(state.audits.map((a: any) => a.action)).toContain("decision_record_reviewed");
  });

  it("refuses a confidence outside 0-1, which is a mistake rather than a strong opinion", async () => {
    state.records = [rec({ id: "r1" })];
    expect((await patch("/api/decision-records/r1", { confidence: 90 })).status).toBe(400);
    expect(state.updates).toHaveLength(0);
  });

  it("requires a reason to supersede, because it is a judgement", async () => {
    state.records = [rec({ id: "r1" }), rec({ id: "r2" })];
    expect((await post("/api/decision-records/r1/supersede", { supersededBy: "r2" })).status).toBe(400);
    const ok = await post("/api/decision-records/r1/supersede", { supersededBy: "r2", reason: "later run is correct" });
    expect(ok.status).toBe(200);
    expect(state.audits.map((a: any) => a.action)).toContain("decision_record_superseded");
  });

  it("refuses a replacement about a different object", async () => {
    state.records = [rec({ id: "r1" }), rec({ id: "r2", subject: "binder:CP-9" })];
    const r = await post("/api/decision-records/r1/supersede", { supersededBy: "r2", reason: "x" });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/binder:CP-9/);
  });
});
