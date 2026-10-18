/**
 * The Journey Library costs a fixed number of queries, not one per journey.
 *
 * GET /api/journeys asked storage for each team's memberships and then for each worker
 * individually, inside nested Promise.all. With 68 journeys and 472 worker memberships that is 542
 * round trips, issued concurrently against a connection pool of twelve (server/db.ts explains why
 * twelve is the ceiling) -- so one page load could hold every connection on the instance and the
 * rest of the application answered 500 "timeout exceeded when trying to connect", or 502 once the
 * gateway gave up waiting.
 *
 * The guard that matters is the COUNT, not the output: the shape was always right, and a
 * reintroduced per-row lookup would keep it right while putting the stall back. So this asserts
 * that the per-journey and per-worker calls are never made, however many journeys there are.
 */
import { describe, it, expect, vi, beforeEach, afterAll, beforeAll } from "vitest";
import express from "express";
import type { Server } from "http";
import type { AddressInfo } from "net";

const ORG = "org-a";
const OTHER_ORG = "org-b";

/** Three journeys, four workers each, plus one worker belonging to another organization. */
const orchestrators = [1, 2, 3].map((n) => ({
  id: `team-${n}`, name: `Journey ${n}`, description: `d${n}`, status: "active",
  journeyIndustryId: "cross_industry", journeySubVertical: "Security Services",
  blueprintId: `bp-${n}`, organizationId: ORG, ontologyTags: [],
}));
const workers = orchestrators.flatMap((t) =>
  [1, 2, 3, 4].map((w) => ({
    id: `${t.id}-w${w}`, name: `Worker ${w} of ${t.name}`, description: "w",
    organizationId: w === 4 && t.id === "team-3" ? OTHER_ORG : ORG, ontologyTags: [],
  })),
);
const memberships = workers.map((w, i) => ({
  id: `m-${i}`, teamAgentId: w.id.slice(0, w.id.indexOf("-w")), memberAgentId: w.id, role: "member",
}));

const calls = { perTeam: 0, perWorker: 0, bulkMembers: 0, bulkAgents: 0 };

vi.mock("../server/storage", () => ({
  storage: {
    getCuratedJourneys: vi.fn(async () => orchestrators),
    getProcessFlows: vi.fn(async () => []),
    summarizeDagExecutionRunsByTeamAgent: vi.fn(async () => ({ total: 0, completed: 0, failed: 0, latest: null })),
    // The two the route must NOT use per row any more.
    getAgentTeamMembers: vi.fn(async (teamAgentId: string) => {
      calls.perTeam++;
      return memberships.filter((m) => m.teamAgentId === teamAgentId);
    }),
    getAgent: vi.fn(async (id: string, orgId?: string) => {
      calls.perWorker++;
      const a = workers.find((w) => w.id === id);
      return a && (!orgId || a.organizationId === orgId) ? a : undefined;
    }),
    // The two it should use instead.
    getAgentTeamMembersForTeams: vi.fn(async (ids: string[]) => {
      calls.bulkMembers++;
      return memberships.filter((m) => ids.includes(m.teamAgentId));
    }),
    getAgentsByIds: vi.fn(async (ids: string[], orgId?: string) => {
      calls.bulkAgents++;
      return workers.filter((w) => ids.includes(w.id) && (!orgId || w.organizationId === orgId));
    }),
  },
}));

vi.mock("../server/auth", () => ({
  getOrgId: () => ORG,
  getDefaultOrgId: () => ORG,
}));

vi.mock("../server/permissions", () => ({
  checkPermission: () => (_req: any, _res: any, next: any) => next(),
  getRequestActorLabel: () => "test",
}));

const { default: journeysRouter } = await import("../server/routes/journeys");

let server: Server;
let base: string;
beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use(journeysRouter);
  await new Promise<void>((r) => { server = app.listen(0, "127.0.0.1", r); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => { await new Promise<void>((r) => server.close(() => r())); });
beforeEach(() => { calls.perTeam = 0; calls.perWorker = 0; calls.bulkMembers = 0; calls.bulkAgents = 0; });

describe("GET /api/journeys query count", () => {
  it("asks for memberships and workers once each, whatever the number of journeys", async () => {
    const res = await fetch(`${base}/api/journeys`);
    const payload = await res.json();
    // Print what the route said rather than only that it refused.
    expect(res.status, JSON.stringify(payload)).toBe(200);

    expect(calls.bulkMembers).toBe(1);
    expect(calls.bulkAgents).toBe(1);
    // Three journeys and twelve memberships: the old shape would be 3 and 12.
    expect(calls.perTeam).toBe(0);
    expect(calls.perWorker).toBe(0);
  });

  it("still returns each journey's own workers", async () => {
    const res = await fetch(`${base}/api/journeys`);
    const body = (await res.json()) as Array<{ teamAgentId: string; workers: Array<{ id: string }> }>;
    expect(body).toHaveLength(3);
    const first = body.find((j) => j.teamAgentId === "team-1")!;
    expect(first.workers.map((w) => w.id)).toEqual(["team-1-w1", "team-1-w2", "team-1-w3", "team-1-w4"]);
  });

  it("keeps the organization scope the per-worker lookup applied", async () => {
    // team-3's fourth worker belongs to another organization; getAgent(id, orgId) returned
    // undefined for it and the route dropped it. The bulk read has to drop it too, or a member of
    // another organization starts appearing in this one's library.
    const res = await fetch(`${base}/api/journeys`);
    const body = (await res.json()) as Array<{ teamAgentId: string; workers: Array<{ id: string }> }>;
    const third = body.find((j) => j.teamAgentId === "team-3")!;
    expect(third.workers.map((w) => w.id)).toEqual(["team-3-w1", "team-3-w2", "team-3-w3"]);
    expect(third.workers.some((w) => w.id === "team-3-w4")).toBe(false);
  });

  it("asks once even when nothing matches the industry filter", async () => {
    const res = await fetch(`${base}/api/journeys?industryId=insurance`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
    expect(calls.perTeam).toBe(0);
    expect(calls.perWorker).toBe(0);
  });
});
