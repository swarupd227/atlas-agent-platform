/**
 * The policy-administration view of an account behaves like a system of
 * record: TIV counts a shared site once, an override is explained, a credit is
 * checked against the account rather than taken from the caller, and "no
 * claims recorded" is not reported as "loss-free".
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import express from "express";
import type { Server } from "http";
import router from "../server/mock-mcp/account-policy-register";

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
const post = async (path: string, body: unknown) => {
  const r = await fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
};
// Credits and overrides mutate the book, so each test starts from the seed.
beforeEach(async () => { await post("/reset", {}); });

describe("what is written for an account", () => {
  it("counts only in-force cover as a line the account holds", async () => {
    const res = await get("/policies?accountId=ACCT-101233");
    // Granite Ridge's only policy is expired: it holds no lines at all.
    expect(res.counts.expired).toBe(1);
    expect(res.counts.inForce).toBe(0);
    expect(res.linesInForce).toEqual([]);
    expect(res.inForcePremium).toBe(0);
  });

  it("keys on the same policy numbers the account system seeds", async () => {
    // A register with its own ids would let each journey pass alone and
    // contradict the others the moment they ran together.
    const res = await get("/policies?accountId=ACCT-100417");
    const nums = res.policies.map((p: any) => p.policyNumber).sort();
    expect(nums).toEqual(["CPP-2026-004417", "GL-2026-004418"]);
  });
});

describe("locations and TIV across policies", () => {
  it("reports a site that sits on two policies as one location to the account", async () => {
    const res = await get("/location-schedule?accountId=ACCT-100417");
    const shared = res.sharedAcrossPolicies.find((s: any) => s.address.startsWith("400 Harbor Way"));
    expect(shared).toBeTruthy();
    expect(shared.policyNumbers.sort()).toEqual(["CPP-2026-004417", "GL-2026-004418"]);
    expect(res.distinctAddresses).toBeLessThan(res.locations.length);
  });

  it("counts a shared site once in the account's TIV, and says what adding policies would double-count", async () => {
    const res = await get("/tiv-rollup?accountId=ACCT-100417");
    // 400 Harbor Way (10.5M) appears on both policies; 1820 Embarcadero (6.65M)
    // on one. The account is exposed to 17.15M, not 27.65M.
    expect(res.accountTiv).toBe(17_150_000);
    expect(res.sumOfPolicyTiv).toBe(27_650_000);
    expect(res.doubleCounted).toBe(10_500_000);
    expect(res.distinctAddressCount).toBe(2);
  });

  it("an override changes the rollup and names itself", async () => {
    const before = await get("/tiv-rollup?accountId=ACCT-100417");
    const r = await post("/policy-overrides", { locationId: "LOC-4417-02", field: "buildingValue", value: 4_000_000, reason: "Revised valuation after the 2026 survey", actor: "D. Ruiz" });
    expect(r.body.overridden).toBe(true);
    expect(r.body.was).toBe(5_250_000);
    const after = await get("/tiv-rollup?accountId=ACCT-100417");
    expect(after.accountTiv).toBe(before.accountTiv - 1_250_000);
    expect(after.overridesApplied).toBe(1);
    // Explained, not merely different: the schedule says who and why.
    const sched = await get("/location-schedule?accountId=ACCT-100417");
    expect(sched.overrides[0]).toMatchObject({ locationId: "LOC-4417-02", reason: "Revised valuation after the 2026 survey", actor: "D. Ruiz" });
  });

  it("will not take an override without a reason", async () => {
    const r = await post("/policy-overrides", { locationId: "LOC-4417-02", field: "buildingValue", value: 1 });
    expect(r.status).toBe(400);
    expect(String(r.body.error)).toContain("reason is required");
  });
});

describe("claims and billing", () => {
  it("does not report an account with no claim history as loss-free", async () => {
    // "No claims recorded" and "known to be loss-free" are different facts,
    // and a credit hangs on the difference.
    const none = await get("/claims-summary?accountId=ACCT-100417");
    expect(none.counts.total).toBe(0);
    expect(none.lossFree).toBeNull();
    const some = await get("/claims-summary?accountId=ACCT-100733");
    expect(some.counts.open).toBe(1);
    expect(some.lossFree).toBe(false);
    expect(some.largest.claimNumber).toBe("CLM-2026-5604");
  });

  it("carries the figure behind the account system's non-payment block", async () => {
    const res = await get("/billing-summary?accountId=ACCT-101233");
    expect(res.delinquent).toBe(true);
    expect(res.pastDueDays).toBeGreaterThan(90);
  });
});

describe("credits", () => {
  it("applies a multi-line credit where the account really has two in-force lines", async () => {
    const r = await post("/policy-credits", { policyNumber: "CPP-2026-004417", creditCode: "ACCT_MULTILINE", basis: "Property and GL both in force", actor: "D. Ruiz" });
    expect(r.status).toBe(201);
    expect(r.body.applied).toBe(true);
    expect(r.body.creditedPremium).toBe(170_662.5); // 184,500 less 7.5%
    expect(r.body.eligibility.found).toContain("2 in-force line(s)");
  });

  it("refuses a multi-line credit on a single-line account, naming what it found", async () => {
    // Eligibility is checked against the account, not taken from the caller.
    const r = await post("/policy-credits", { policyNumber: "GL-2026-010041", creditCode: "ACCT_MULTILINE", basis: "caller says so", actor: "tester" });
    expect(r.body.applied).toBe(false);
    expect(r.body.reason).toBe("not_eligible");
    expect(r.body.found).toContain("1 in-force line(s)");
    expect(r.status).toBe(200); // a business refusal, not a transport error
  });

  it("refuses a loss-free credit on an account with an incurred claim", async () => {
    const r = await post("/policy-credits", { policyNumber: "CPP-2026-007331", creditCode: "ACCT_LOSS_FREE", basis: "assumed clean", actor: "tester" });
    expect(r.body.applied).toBe(false);
    expect(r.body.found).toContain("claim(s) with incurred loss");
  });

  it("refuses a loss-free credit when there is no history to judge", async () => {
    // Absence of claims is not evidence of none: this must refuse rather than
    // read an empty history as a clean one.
    const r = await post("/policy-credits", { policyNumber: "CPP-2026-004417", creditCode: "ACCT_LOSS_FREE", basis: "no claims on file", actor: "tester" });
    expect(r.body.applied).toBe(false);
    expect(r.body.found).toContain("cannot be established");
  });

  it("refuses a payment-history credit on a delinquent account, and a credit on cover that is not in force", async () => {
    const expired = await post("/policy-credits", { policyNumber: "GL-2024-012330", creditCode: "ACCT_PAYMENT_HISTORY", basis: "x", actor: "t" });
    expect(expired.body.applied).toBe(false);
    expect(expired.body.reason).toBe("not_in_force");
    const quoted = await post("/policy-credits", { policyNumber: "Q-2026-118204", creditCode: "ACCT_MULTILINE", basis: "x", actor: "t" });
    expect(quoted.body.reason).toBe("not_in_force");
  });

  it("will not apply the same credit twice, and requires a basis", async () => {
    await post("/policy-credits", { policyNumber: "CPP-2026-004417", creditCode: "ACCT_MULTILINE", basis: "first", actor: "t" });
    const again = await post("/policy-credits", { policyNumber: "CPP-2026-004417", creditCode: "ACCT_MULTILINE", basis: "second", actor: "t" });
    expect(again.body.applied).toBe(false);
    expect(again.body.reason).toBe("already_applied");
    const noBasis = await post("/policy-credits", { policyNumber: "GL-2026-004418", creditCode: "ACCT_MULTILINE" });
    expect(noBasis.status).toBe(400);
    expect(String(noBasis.body.error)).toContain("basis is required");
  });

  it("records every applied credit with who, when and why", async () => {
    await post("/policy-credits", { policyNumber: "CPP-2026-004417", creditCode: "ACCT_MULTILINE", basis: "Property and GL both in force", actor: "D. Ruiz" });
    const audit = await get("/credit-audit?accountId=ACCT-100417");
    expect(audit.totalEntries).toBe(1);
    expect(audit.entries[0]).toMatchObject({ policyNumber: "CPP-2026-004417", creditCode: "ACCT_MULTILINE", actor: "D. Ruiz", basis: "Property and GL both in force" });
    expect(audit.entries[0].auditId).toBeTruthy();
  });

  it("shows nothing in the audit when nothing was applied", async () => {
    // A credit with no entry here was never applied, whatever a narrative says.
    await post("/policy-credits", { policyNumber: "GL-2026-010041", creditCode: "ACCT_MULTILINE", basis: "refused", actor: "t" });
    const audit = await get("/credit-audit?accountId=ACCT-101004");
    expect(audit.totalEntries).toBe(0);
  });
});
