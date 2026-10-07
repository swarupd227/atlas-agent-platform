/**
 * Two routes that were an availability problem, not just a slow one.
 *
 * Measured against the live app on 6 Oct 2026, one process, warm:
 *   GET /api/drift-signals   72,744ms   (701 suites, one query EACH, sequential)
 *   GET /api/audit-events     5,432ms   (12,176 events, 11.3MB, no limit at all)
 *
 * Node is single-threaded, so for the 72 seconds drift-signals ran, every other
 * request queued behind it: /version, which touches no database and is a
 * compile-time constant, was taking seconds, and the Dashboard and Monitor
 * rendered their sidebar and nothing else. A peer session reported it as "the
 * app has gone slow" and suspected a database migration; it was neither the
 * database nor the migration.
 *
 * These tests COUNT the queries rather than asserting the response, because the
 * response was always correct -- that is exactly why it survived. A test on the
 * output would have passed throughout.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import type { Server } from "http";

const state: any = { suites: [], runs: [], agents: [], events: [], calls: { perSuite: 0, batched: 0 } };

const RUN = (over: any = {}) => ({
  id: over.id ?? "run1", suiteId: over.suiteId ?? "s1", status: "completed",
  passRate: 0.9, avgLatencyMs: 100, startedAt: new Date("2026-10-01T00:00:00Z"),
  repeats: 1, tags: [], ...over,
});

vi.mock("../server/storage", () => ({
  storage: {
    getEvalSuites: vi.fn(async () => state.suites),
    getAgents: vi.fn(async () => state.agents),
    // The shape that caused it. If anything calls this again from a loop, the
    // counter below catches it.
    getEvalRunsBySuite: vi.fn(async (id: string) => { state.calls.perSuite++; return state.runs.filter((r: any) => r.suiteId === id); }),
    getEvalRunsBySuiteIds: vi.fn(async (ids: string[]) => { state.calls.batched++; return state.runs.filter((r: any) => ids.includes(r.suiteId)); }),
    getAuditEvents: vi.fn(async () => state.events),
    getDriftSignals: vi.fn(async () => []),
  },
}));
vi.mock("../server/auth", () => ({ getOrgId: () => "org1", getDefaultOrgId: () => "org1", resolveRequestOrgId: () => "org1" }));
vi.mock("../server/permissions", () => ({
  checkPermission: () => (_req: any, _res: any, next: any) => next(),
  getRequestRole: () => "admin",
  getRedactionLevel: () => "none",
  redactPayload: (e: any) => e,
}));

let server: Server;
let base = "";
const get = async (p: string) => {
  const r = await fetch(`${base}${p}`);
  return { status: r.status, body: await r.json().catch(() => ([])), headers: r.headers };
};

beforeEach(async () => {
  state.calls = { perSuite: 0, batched: 0 };
  state.agents = [{ id: "a1", name: "E&S Orchestrator" }];
  if (!server) {
    // governance.ts exports the Router itself, not a factory.
    const { default: governanceRouter } = await import("../server/routes/governance");
    const app = express();
    app.use(express.json());
    app.use(governanceRouter);
    await new Promise<void>((res) => { server = app.listen(0, () => { base = `http://127.0.0.1:${(server.address() as any).port}`; res(); }); });
  }
});

describe("GET /api/drift-signals asks the database once, not once per suite", () => {
  it("issues ONE query for 300 suites, across BOTH of the route's loops", async () => {
    // The suite types matter. This route walks every suite twice: once for
    // pass-rate and latency drift, and again for red_team/accuracy/
    // faithfulness suites only. A fixture of plain "regression" suites never
    // enters the second loop, so the first version of this test reported a
    // clean green while half the N+1 was still there. The mix is the test.
    const types = ["regression", "red_team", "accuracy", "faithfulness"];
    state.suites = Array.from({ length: 300 }, (_, i) => ({ id: `s${i}`, name: `Suite ${i}`, agentId: "a1", type: types[i % types.length] }));
    state.runs = [];
    const r = await get("/api/drift-signals");
    expect(r.status).toBe(200);
    // The number that matters. 300 here stood for 701 on the live app.
    expect(state.calls.perSuite, "a per-suite query came back").toBe(0);
    expect(state.calls.batched).toBe(1);
  });

  it("finds drift in a red_team suite too, which only the second loop reports", async () => {
    // Proves the second loop still WORKS after being repointed at the map,
    // not merely that it stopped querying.
    state.suites = [{ id: "s1", name: "Adversarial", agentId: "a1", type: "red_team" }];
    state.runs = [
      RUN({ id: "r1", passRate: 0.9, startedAt: new Date("2026-10-01T00:00:00Z") }),
      RUN({ id: "r2", passRate: 0.9, startedAt: new Date("2026-10-02T00:00:00Z") }),
      RUN({ id: "r3", passRate: 0.4, startedAt: new Date("2026-10-03T00:00:00Z") }),
    ];
    const r = await get("/api/drift-signals");
    expect((r.body as any[]).length).toBeGreaterThan(0);
    expect(state.calls.perSuite).toBe(0);
  });

  it("still finds the drift it is for, so the fix is not just 'do less'", async () => {
    state.suites = [{ id: "s1", name: "Core Regression", agentId: "a1", type: "regression" }];
    state.runs = [
      RUN({ id: "r1", passRate: 0.95, startedAt: new Date("2026-10-01T00:00:00Z") }),
      RUN({ id: "r2", passRate: 0.95, startedAt: new Date("2026-10-02T00:00:00Z") }),
      RUN({ id: "r3", passRate: 0.50, startedAt: new Date("2026-10-03T00:00:00Z") }),
    ];
    const r = await get("/api/drift-signals");
    const passRate = (r.body as any[]).find((x) => x.metric === "pass_rate");
    expect(passRate, "the degradation was not reported").toBeTruthy();
    expect(passRate.status).toBe("degraded");
    expect(passRate.suiteName).toBe("Core Regression");
  });

  it("does not query at all when there are no suites", async () => {
    state.suites = []; state.runs = [];
    await get("/api/drift-signals");
    expect(state.calls.perSuite).toBe(0);
  });
});

describe("GET /api/audit-events pages and filters instead of sending everything", () => {
  const ev = (over: any = {}) => ({ id: over.id ?? "e1", action: "agent.config_changed", objectId: "a1", ontologyTags: {}, createdAt: new Date(), ...over });

  it("caps an unasked-for request and SAYS the page is a page", async () => {
    state.events = Array.from({ length: 1500 }, (_, i) => ev({ id: `e${i}` }));
    const r = await get("/api/audit-events");
    expect((r.body as any[]).length).toBe(1000);
    // Headers, so the array response shape is unchanged for existing callers.
    expect(r.headers.get("x-total-count")).toBe("1500");
    expect(r.headers.get("x-returned-count")).toBe("1000");
  });

  it("filters server-side, which is what the agent page needed", async () => {
    state.events = [
      ev({ id: "a", action: "agent.config_changed", objectId: "a1" }),
      ev({ id: "b", action: "agent.config_changed", objectId: "OTHER" }),
      ev({ id: "c", action: "something.else", objectId: "a1" }),
    ];
    const r = await get("/api/audit-events?action=agent.config_changed&object_id=a1");
    expect((r.body as any[]).map((x) => x.id)).toEqual(["a"]);
    expect(r.headers.get("x-total-count")).toBe("1");
  });

  it("honours an explicit limit and offset", async () => {
    state.events = Array.from({ length: 10 }, (_, i) => ev({ id: `e${i}` }));
    const first = await get("/api/audit-events?limit=3");
    expect((first.body as any[]).map((x) => x.id)).toEqual(["e0", "e1", "e2"]);
    const second = await get("/api/audit-events?limit=3&offset=3");
    expect((second.body as any[]).map((x) => x.id)).toEqual(["e3", "e4", "e5"]);
    expect(second.headers.get("x-total-count")).toBe("10");
  });
});
