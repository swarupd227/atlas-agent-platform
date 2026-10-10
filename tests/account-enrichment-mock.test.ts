/**
 * The enrichment service behaves like a third-party provider that charges:
 * a cache read is free and says how old it is, an account never enriched is
 * reported as never enriched rather than as stale, a refresh inside the window
 * is refused with what the refusal saved, a forced refresh is attributed and
 * charged, "refreshed" is not reported as "changed", and enrichment is never
 * sold per policy or per location.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import express from "express";
import type { Server } from "http";
import router from "../server/mock-mcp/account-enrichment";

let server: Server;
let base = "";

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/", router);
  await new Promise<void>((resolve) => { server = app.listen(0, () => resolve()); });
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const get = async (path: string) => (await fetch(base + path)).json();
const getRaw = async (path: string) => {
  const r = await fetch(base + path);
  return { status: r.status, body: await r.json() };
};
const post = async (path: string, body: unknown) => {
  const r = await fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
};
// Refreshes mutate the cache and the ledger, so each test starts from the seed.
beforeEach(async () => { await post("/reset", {}); });

describe("reading what is held", () => {
  it("returns the held record with its age and source, and charges nothing", async () => {
    const res = await get("/enrichment?accountId=ACCT-100417");
    expect(res.cacheHit).toBe(true);
    expect(res.costIncurred).toBe(0);
    expect(res.enrichment.source).toContain("Mercantile");
    expect(res.enrichment.profile.duns).toBe("07-412-9930");
    // Age is derived from the seed offset, so it stays coherent however long
    // this fixture lives -- a date literal would drift into staleness.
    expect(res.ageDays).toBeGreaterThanOrEqual(11);
    expect(res.ageDays).toBeLessThanOrEqual(13);
    expect(res.stale).toBe(false);
  });

  it("marks a record past the window as stale and says to quote it as-of", async () => {
    const res = await get("/enrichment?accountId=ACCT-100733");
    expect(res.stale).toBe(true);
    expect(res.ageDays).toBeGreaterThan(90);
    expect(String(res.guidance)).toContain("do not present it as current");
  });

  it("does not report an account that was never enriched as stale", async () => {
    // "Never fetched" and "fetched long ago" are different facts: one needs a
    // baseline, the other needs a decision about cost. Conflating them turns a
    // first fetch into an "update" and an empty cache into a finding about the
    // business.
    const res = await get("/enrichment?accountId=ACCT-101233");
    expect(res.enrichment).toBeNull();
    expect(res.neverFetched).toBe(true);
    expect(res.stale).toBeNull();
    expect(res.ageDays).toBeNull();
    expect(res.available).toBe(true);
    expect(String(res.guidance)).toContain("not a finding about the business");
  });

  it("counts reuse, so avoiding a charge is a measured number", async () => {
    await get("/enrichment?accountId=ACCT-100417");
    await get("/enrichment?accountId=ACCT-100417");
    const third = await get("/enrichment?accountId=ACCT-100417");
    expect(third.reusedThisSession).toBe(3);
    const ledger = await get("/cost-ledger?accountId=ACCT-100417");
    expect(ledger.totalEntries).toBe(0);
    expect(ledger.cacheReuses).toBe(3);
    expect(ledger.costAvoidedByReuse).toBe(127.5); // 3 x 42.50
  });
});

describe("enrichment is an account-level purchase", () => {
  it("refuses a policy-scoped request and names the rule", async () => {
    // This IS Feature 6: enrichment bought per policy is bought many times
    // over. An agent asking per policy should be told, not quietly charged.
    const r = await getRaw("/enrichment?accountId=ACCT-100417&policyNumber=CPP-2026-004417");
    expect(r.status).toBe(400);
    expect(String(r.body.error)).toContain("account level only");
    expect(String(r.body.guidance)).toContain("paid for many times over");
  });

  it("refuses a location-scoped request", async () => {
    const r = await getRaw("/enrichment?accountId=ACCT-100417&locationId=LOC-4417-01");
    expect(r.status).toBe(400);
    expect(r.body.refused.locationId).toBe("LOC-4417-01");
  });

  it("allows an explicitly account-scoped request", async () => {
    const r = await getRaw("/enrichment?accountId=ACCT-100417&scope=account");
    expect(r.status).toBe(200);
    expect(r.body.cacheHit).toBe(true);
  });
});

describe("refreshing costs money, so it has to be justified", () => {
  it("refuses a refresh inside the window and says what the refusal saved", async () => {
    const r = await post("/enrichment/refresh", { accountId: "ACCT-100417", reason: "producer asked us to be sure", actor: "D. Ruiz" });
    expect(r.status).toBe(200); // a business refusal, not a transport error
    expect(r.body.refreshed).toBe(false);
    expect(r.body.reason).toBe("within_refresh_window");
    expect(r.body.costIncurred).toBe(0);
    expect(r.body.costAvoided).toBe(42.5);
    expect(r.body.daysUntilRefreshDue).toBeGreaterThan(0);
    const ledger = await get("/cost-ledger?accountId=ACCT-100417");
    expect(ledger.totalEntries).toBe(0);
  });

  it("will not refresh without a reason", async () => {
    const r = await post("/enrichment/refresh", { accountId: "ACCT-100733", actor: "D. Ruiz" });
    expect(r.status).toBe(400);
    expect(String(r.body.error)).toContain("reason is required");
  });

  it("refreshes a stale record, charges once, and reports what changed", async () => {
    const r = await post("/enrichment/refresh", { accountId: "ACCT-100733", reason: "Record is past the 90-day window ahead of renewal", actor: "D. Ruiz" });
    expect(r.body.refreshed).toBe(true);
    expect(r.body.establishedBaseline).toBe(false);
    expect(r.body.costIncurred).toBe(42.5);
    expect(r.body.charge.actor).toBe("D. Ruiz");
    expect(r.body.charge.scope).toBe("account");
    // The stale record did not know about the open claim; the current one does.
    const fields = r.body.changes.map((c: any) => c.field).sort();
    expect(fields).toContain("riskIndicators");
    expect(fields).toContain("creditScoreBand");
    expect(r.body.changeCount).toBeGreaterThan(0);
    expect(r.body.enrichment.profile.riskIndicators).toContain("Open property claim in last 12 months");
  });

  it("does not report a refresh that changed nothing as a change", async () => {
    // "Refreshed" and "changed" are different claims and a renewal decision
    // can hang on the difference.
    await post("/enrichment/refresh", { accountId: "ACCT-100733", reason: "past the window", actor: "D. Ruiz" });
    const again = await post("/enrichment/refresh", { accountId: "ACCT-100733", reason: "checking again", actor: "D. Ruiz", force: true });
    expect(again.body.refreshed).toBe(true);
    expect(again.body.changeCount).toBe(0);
    expect(String(again.body.guidance)).toContain('"Refreshed" is not "changed"');
  });

  it("treats a first fetch as a baseline, not an update", async () => {
    const r = await post("/enrichment/refresh", { accountId: "ACCT-101233", reason: "No enrichment held for this account", actor: "D. Ruiz" });
    expect(r.body.refreshed).toBe(true);
    expect(r.body.establishedBaseline).toBe(true);
    expect(r.body.changeCount).toBe(0);
    expect(r.body.previousAgeDays).toBeNull();
    expect(String(r.body.guidance)).toContain("first fetch, not an update");
    // And it is now readable as a held record rather than as never-fetched.
    const after = await get("/enrichment?accountId=ACCT-101233");
    expect(after.neverFetched).toBe(false);
    expect(after.enrichment.fetchedBy).toBe("D. Ruiz");
  });

  it("requires an actor to force a refresh inside the window", async () => {
    const r = await post("/enrichment/refresh", { accountId: "ACCT-100417", reason: "new loss notified", force: true });
    expect(r.status).toBe(400);
    expect(String(r.body.error)).toContain("someone owns the charge");
  });

  it("allows a forced refresh inside the window and records it as forced", async () => {
    const r = await post("/enrichment/refresh", { accountId: "ACCT-100417", reason: "Headcount disputed at renewal", actor: "D. Ruiz", force: true });
    expect(r.body.refreshed).toBe(true);
    expect(r.body.forced).toBe(true);
    expect(r.body.changes.map((c: any) => c.field)).toEqual(["employeeCount"]);
    expect(r.body.changes[0]).toMatchObject({ was: 138, now: 142 });
    const ledger = await get("/cost-ledger?accountId=ACCT-100417");
    expect(ledger.forcedRefreshes).toBe(1);
    expect(ledger.totalCost).toBe(42.5);
  });

  it("will not refresh an account the provider has never heard of", async () => {
    const r = await post("/enrichment/refresh", { accountId: "ACCT-999999", reason: "x", actor: "t" });
    expect(r.status).toBe(404);
    expect(r.body.costIncurred).toBe(0);
  });
});

describe("the ledger is the evidence", () => {
  it("records one charge per account with who and why, never per policy", async () => {
    await post("/enrichment/refresh", { accountId: "ACCT-100733", reason: "Past the window ahead of renewal", actor: "D. Ruiz" });
    const ledger = await get("/cost-ledger?accountId=ACCT-100733");
    expect(ledger.totalEntries).toBe(1);
    expect(ledger.totalCost).toBe(42.5);
    expect(ledger.entries[0]).toMatchObject({ scope: "account", actor: "D. Ruiz", reason: "Past the window ahead of renewal" });
    expect(ledger.entries[0].chargeId).toMatch(/^ENR-/);
  });

  it("shows nothing when a refresh was refused", async () => {
    await post("/enrichment/refresh", { accountId: "ACCT-100417", reason: "to be sure", actor: "t" });
    const ledger = await get("/cost-ledger?accountId=ACCT-100417");
    expect(ledger.totalEntries).toBe(0);
    expect(ledger.totalCost).toBe(0);
  });

  it("publishes the refresh policy it actually enforces", async () => {
    const p = await get("/refresh-policy");
    expect(p.windowDays).toBe(90);
    expect(p.costPerRefresh).toBe(42.5);
    expect(p.scope).toBe("account");
    // The refusal above is this rule, so the published policy is not decoration.
    const refused = await post("/enrichment/refresh", { accountId: "ACCT-100417", reason: "x", actor: "t" });
    expect(refused.body.rule).toBe(p.rule);
  });
});
