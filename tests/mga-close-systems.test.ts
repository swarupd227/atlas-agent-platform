/**
 * The four systems a binder period close reads, and the one disagreement
 * between them that the whole workflow exists to find.
 *
 * The three-way match is only meaningful if each leg reports its own total and
 * they agree everywhere except where a break was seeded. These prove that: the
 * clean period reconciles to the cent, March breaks by exactly the seeded
 * amount, and posting the approved correction closes it.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import type { Server } from "http";
import binderRouter from "../server/mock-mcp/mga-binder-master";
import policyRouter from "../server/mock-mcp/mga-policy-admin";
import billingRouter from "../server/mock-mcp/mga-billing-gl";
import claimsRouter from "../server/mock-mcp/mga-tpa-claims";
import { PERIODS, BINDER_TERMS } from "../server/mock-mcp/mga-close-seed";

let server: Server;
let base = "";
beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/binder", binderRouter);
  app.use("/policy", policyRouter);
  app.use("/billing", billingRouter);
  app.use("/claims", claimsRouter);
  await new Promise<void>((r) => { server = app.listen(0, () => r()); });
  const a = server.address();
  base = `http://127.0.0.1:${typeof a === "object" && a ? a.port : 0}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

const get = async (p: string) => { const r = await fetch(base + p); return { status: r.status, body: await r.json() as any }; };
const post = async (p: string, b: unknown) => {
  const r = await fetch(base + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
  return { status: r.status, body: await r.json() as any };
};

describe("the three-way match", () => {
  it("reconciles a clean period to the cent", async () => {
    await post("/billing/reset", {});
    const { body } = await get("/billing/reconciliation?periodId=2026-01");
    expect(body.legs.policyAdministration).toBe(body.legs.billing);
    expect(body.legs.billing).toBe(body.legs.generalLedger);
    expect(body.variance).toBe(0);
    expect(body.withinTolerance).toBe(true);
    expect(body.candidateCause).toBeUndefined();
  });

  it("breaks March by exactly the seeded amount, above both tolerances", async () => {
    await post("/billing/reset", {});
    const { body } = await get("/billing/reconciliation?periodId=2026-03");
    expect(body.variance).toBe(PERIODS["2026-03"].billingBreak!.amount);
    expect(body.withinTolerance).toBe(false);
    // The system says what it posted and where, not why: a candidate, not a verdict.
    expect(body.candidateCause.appearsAgainstBinder).toBe("CP-2026-14");
    expect(body.candidateCause.correctBinder).toBe(BINDER_TERMS.binderId);
  });

  it("closes the variance once the approved correction is posted", async () => {
    await post("/billing/reset", {});
    const before = await get("/billing/reconciliation?periodId=2026-03");
    expect(before.body.withinTolerance).toBe(false);

    const posted = await post("/billing/post-adjusting-journal", {
      periodId: "2026-03", amount: PERIODS["2026-03"].billingBreak!.amount,
      account: "1200 Premium Receivable", approvedBy: "premium_accounting_manager",
      reason: "Reclassify endorsement AP booked to CP-2026-14",
    });
    expect(posted.status).toBe(200);
    expect(posted.body.journalId).toMatch(/^ADJ-202603-01$/);

    const after = await get("/billing/reconciliation?periodId=2026-03");
    expect(after.body.variance).toBe(0);
    expect(after.body.withinTolerance).toBe(true);
    expect(after.body.adjustingJournalsApplied).toBe(1);
  });

  it("refuses a journal nobody approved", async () => {
    const r = await post("/billing/post-adjusting-journal", { periodId: "2026-03", amount: 100, account: "1200" });
    expect(r.status).toBe(422);
    expect(r.body.guidance).toMatch(/approves the specific lines/i);
  });
});

describe("what the policy system hands over", () => {
  it("returns aggregates without the rows, and the rows on request", async () => {
    const s = await get("/policy/period-summary?periodId=2026-02");
    expect(s.body.transactionCount).toBe(51);
    expect(s.body.transactions).toBeUndefined();
    const t = await get("/policy/transactions?periodId=2026-02&limit=50");
    expect(t.body.returned).toBe(50);
    expect(t.body.totalMatching).toBe(51);
  });

  it("hands over a whole period in one call, so nothing validates a truncated page", async () => {
    // The largest period is 63 rows. A cap below that would let a close report
    // clean on transactions it never read.
    for (const [periodId, count] of [["2026-01", 42], ["2026-02", 51], ["2026-03", 47], ["2026-04", 63]] as const) {
      const t = await get(`/policy/transactions?periodId=${periodId}&limit=100`);
      expect([periodId, t.body.returned]).toEqual([periodId, count]);
      expect(t.body.returned).toBe(t.body.totalMatching);
    }
  });

  it("hands over February's defects unrepaired, because catching them is the point", async () => {
    const all: any[] = [];
    for (let o = 0; o < 51; o += 50) {
      const p = await get(`/policy/transactions?periodId=2026-02&offset=${o}&limit=50`);
      all.push(...p.body.transactions);
    }
    expect(all.filter((r) => r.buildingValue < 0)).toHaveLength(6);
    expect(all.filter((r) => r.isoConstructionClass === null)).toHaveLength(4);
  });

  it("names a prior carrier referral, so a ratified breach is not reported as a breach", async () => {
    const rows = (await get("/policy/transactions?periodId=2026-03&limit=50")).body.transactions;
    const under = rows.find((r: any) => r.coastalTier1Tiv > 0 && r.windstormDeductiblePct < BINDER_TERMS.minWindstormDeductiblePct);
    expect(under).toBeTruthy();
    const ev = await get(`/policy/authority-evidence?periodId=2026-03&policyNumber=${under.policyNumber}`);
    expect(ev.body.priorCarrierReferral?.reference).toBe("REF-2026-0214");
  });
});

describe("correcting a row, which is what lets the data-quality loop clear", () => {
  const defectRow = async () => {
    const rows: any[] = [];
    for (let o = 0; o < 51; o += 50) rows.push(...(await get(`/policy/transactions?periodId=2026-02&offset=${o}&limit=50`)).body.transactions);
    return rows.find((r) => r.buildingValue < 0);
  };

  it("refuses a correction with no owner, no reason, or no fields", async () => {
    await post("/policy/reset", {});
    const row = await defectRow();
    const base = { periodId: "2026-02", policyNumber: row.policyNumber, fields: { buildingValue: 46_414 } };
    const noOwner = await post("/policy/correct-transaction", { ...base, reason: "Sign flipped on import" });
    expect(noOwner.status).toBe(422);
    expect(noOwner.body.guidance).toMatch(/nobody's name/i);
    expect((await post("/policy/correct-transaction", { ...base, correctedBy: "ops" })).status).toBe(422);
    expect((await post("/policy/correct-transaction", { periodId: "2026-02", policyNumber: row.policyNumber, correctedBy: "ops", reason: "x" })).status).toBe(422);
  });

  it("refuses to change a field that is not a data-entry field", async () => {
    await post("/policy/reset", {});
    const row = await defectRow();
    const r = await post("/policy/correct-transaction", {
      periodId: "2026-02", policyNumber: row.policyNumber, fields: { grossPremium: 1 },
      correctedBy: "ops", reason: "wanted a different number",
    });
    expect(r.status).toBe(422);
    expect(r.body.guidance).toMatch(/endorsement or a rerate/i);
  });

  it("keeps the before value, and the next read returns the corrected row", async () => {
    await post("/policy/reset", {});
    const row = await defectRow();
    expect(row.buildingValue).toBeLessThan(0);

    const r = await post("/policy/correct-transaction", {
      periodId: "2026-02", policyNumber: row.policyNumber,
      fields: { buildingValue: Math.abs(row.buildingValue) },
      correctedBy: "ops_analyst", reason: "Sign flipped on import from the broker extract",
    });
    expect(r.status).toBe(200);
    expect(r.body.before.buildingValue).toBe(row.buildingValue);
    expect(r.body.after.buildingValue).toBe(Math.abs(row.buildingValue));

    const after = await defectRow();
    // The whole point: the defect this row carried is gone on the next read.
    expect(after?.policyNumber).not.toBe(row.policyNumber);
    const corrections = await get("/policy/corrections?periodId=2026-02");
    expect(corrections.body.corrections).toHaveLength(1);
    expect(corrections.body.corrections[0].correctedBy).toBe("ops_analyst");
  });

  it("clears every defect after correcting all ten, so the loop can actually exit", async () => {
    await post("/policy/reset", {});
    const all = async () => {
      const rows: any[] = [];
      for (let o = 0; o < 51; o += 50) rows.push(...(await get(`/policy/transactions?periodId=2026-02&offset=${o}&limit=50`)).body.transactions);
      return rows;
    };
    const before = await all();
    const bad = before.filter((r) => r.buildingValue < 0 || r.isoConstructionClass === null);
    expect(bad).toHaveLength(10);
    for (const r of bad) {
      const fields: Record<string, unknown> = {};
      if (r.buildingValue < 0) fields.buildingValue = Math.abs(r.buildingValue);
      if (r.isoConstructionClass === null) fields.isoConstructionClass = 5;
      const res = await post("/policy/correct-transaction", {
        periodId: "2026-02", policyNumber: r.policyNumber, fields,
        correctedBy: "ops_analyst", reason: "Corrected against the broker's statement of values",
      });
      expect(res.status).toBe(200);
    }
    const after = await all();
    expect(after.filter((r) => r.buildingValue < 0 || r.isoConstructionClass === null)).toHaveLength(0);
    expect(after).toHaveLength(51);
  });

  it("does not move premium, so a correction cannot break the three-way match", async () => {
    await post("/policy/reset", {});
    await post("/billing/reset", {});
    const gwpBefore = (await get("/policy/period-summary?periodId=2026-02")).body.grossWrittenPremium;
    const row = await defectRow();
    await post("/policy/correct-transaction", {
      periodId: "2026-02", policyNumber: row.policyNumber, fields: { buildingValue: Math.abs(row.buildingValue) },
      correctedBy: "ops_analyst", reason: "Sign flipped on import",
    });
    const summary = (await get("/policy/period-summary?periodId=2026-02")).body;
    expect(summary.grossWrittenPremium).toBe(gwpBefore);
    const rec = await get("/billing/reconciliation?periodId=2026-02");
    expect(rec.body.variance).toBe(0);
    expect(rec.body.withinTolerance).toBe(true);
    await post("/policy/reset", {});
  });
});

describe("the claims feed the MGA does not control", () => {
  it("carries two movements against policies this binder never wrote", async () => {
    const s = await get("/claims/incurred-summary?periodId=2026-02");
    expect(s.body.unmatched).toBe(2);
    expect(s.body.incurredMatchedOnly).toBeLessThan(s.body.incurredAllMovements);
  });

  it("has nothing unmatched in a clean period", async () => {
    const s = await get("/claims/incurred-summary?periodId=2026-01");
    expect(s.body.unmatched).toBe(0);
  });
});

describe("the binder register", () => {
  it("rolls the treaty year forward to the capacity scenario's position", async () => {
    const a = await get("/binder/treaty-aggregates?periodId=2026-04");
    expect(a.body.closingAggregateTiv).toBe(241_000_000);
    expect(a.body.utilisationPct).toBeCloseTo(96.4, 1);
    expect(a.body.aboveWarningThreshold).toBe(true);
    expect(a.body.headroomTiv).toBe(9_000_000);
    expect(a.body.projectedExhaustion).toBeTruthy();
  });

  it("refuses to close a period the carrier has not received", async () => {
    await post("/binder/reset", {});
    const r = await post("/binder/close-period", { periodId: "2026-01", closedBy: "ops" });
    expect(r.status).toBe(422);
    expect(r.body.guidance).toMatch(/unreported/i);
  });

  it("refuses to lodge a pack without finance sign-off", async () => {
    await post("/binder/reset", {});
    const r = await post("/binder/submit-to-carrier", { periodId: "2026-01", documentCount: 6, netDueToCarrier: 1_600_000 });
    expect(r.status).toBe(422);
    expect(r.body.guidance).toMatch(/settlement is made on/i);
  });

  it("lodges once, then closes, then refuses both a second time", async () => {
    await post("/binder/reset", {});
    const sub = await post("/binder/submit-to-carrier", { periodId: "2026-01", documentCount: 6, netDueToCarrier: 1_600_000, financeSignOffBy: "cfo" });
    expect(sub.status).toBe(200);
    expect(sub.body.reference).toMatch(/^DDM-202601-17$/);
    expect((await post("/binder/submit-to-carrier", { periodId: "2026-01", documentCount: 6, netDueToCarrier: 1_600_000, financeSignOffBy: "cfo" })).status).toBe(409);

    const close = await post("/binder/close-period", { periodId: "2026-01", closedBy: "ops_manager" });
    expect(close.status).toBe(200);
    expect(close.body.submissionReference).toBe(sub.body.reference);
    expect(close.body.nextPeriodOpened).toBe("2026-02");
    expect((await post("/binder/close-period", { periodId: "2026-01", closedBy: "ops_manager" })).status).toBe(409);
  });
});
