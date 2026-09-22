/**
 * The simulated MGA systems of record behave like systems of record: the
 * broker intake reports what a document did not state instead of filling it
 * in, the rating engine refuses a credit beyond authority, the policy system
 * refuses to bind on one signature or without the mandatory endorsement, and
 * the bordereau refuses to count a policy twice.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import type { Server } from "http";
import intakeRouter from "../server/mock-mcp/bridge-specialty-intake";
import ratingRouter from "../server/mock-mcp/insurity-rating";
import policyRouter from "../server/mock-mcp/insurity-policy-sor";
import complianceRouter from "../server/mock-mcp/surplus-lines-compliance";

let server: Server;
let base = "";

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/intake", intakeRouter);
  app.use("/rating", ratingRouter);
  app.use("/policy", policyRouter);
  app.use("/compliance", complianceRouter);
  await new Promise<void>((resolve) => { server = app.listen(0, () => resolve()); });
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const get = async (path: string) => {
  const r = await fetch(base + path);
  return { status: r.status, body: await r.json() };
};
const post = async (path: string, body: unknown) => {
  const r = await fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
};

describe("Bridge Specialty submission intake", () => {
  it("returns schedule aggregates, not 120 location rows", async () => {
    const { body } = await get("/intake/submission?submissionId=SUB-2026-8891");
    expect(body.scheduleSummary.locationCount).toBe(120);
    expect(body.locations).toBeUndefined();
    // The scenario's numbers: 14 Tier-1 coastal locations aggregating 72.4M,
    // largest single risk 18.5M. These drive the treaty evaluation.
    expect(body.scheduleSummary.coastalTier1.locationCount).toBe(14);
    expect(body.scheduleSummary.coastalTier1.aggregateTiv).toBe(72_400_000);
    expect(body.scheduleSummary.largestSingleLocation.tiv).toBe(18_500_000);
    expect(body.scheduleSummary.largestSingleLocation.locationId).toBe("001");
  });

  it("is deterministic: the same submission always reports the same schedule", async () => {
    const a = await get("/intake/submission?submissionId=SUB-2026-8891");
    const b = await get("/intake/submission?submissionId=SUB-2026-8891");
    expect(a.body.scheduleSummary).toEqual(b.body.scheduleSummary);
  });

  it("serves location rows separately, paginated and filterable by coastal tier", async () => {
    const page = await get("/intake/sov-locations?submissionId=SUB-2026-8891&limit=50&coastalTier=1");
    expect(page.body.totalMatching).toBe(14);
    expect(page.body.returned).toBe(14);
    expect(page.body.hasMore).toBe(false);
    expect(page.body.locations.every((l: any) => l.coastalTier === 1)).toBe(true);
    const capped = await get("/intake/sov-locations?submissionId=SUB-2026-8891&limit=500");
    expect(capped.body.returned).toBe(50);
    expect(capped.body.hasMore).toBe(true);
  });

  it("reports what the document did not state rather than inventing it", async () => {
    const { body } = await get("/intake/submission?submissionId=SUB-2026-8915");
    expect(body.extraction.overallConfidence).toBeLessThan(0.85);
    const missing = body.extraction.missingFields.map((m: any) => m.field);
    expect(missing).toContain("roofYear");
    expect(missing).toContain("sprinklered");
    expect(body.scheduleSummary.unknownRoofYearCount).toBe(3);
    expect(body.scheduleSummary.unknownProtectionCount).toBe(2);
    const rows = await get("/intake/sov-locations?submissionId=SUB-2026-8915&limit=50");
    expect(rows.body.locations.filter((l: any) => l.roofYear === null)).toHaveLength(3);
  });

  it("flags a document below the review floor in its own guidance", async () => {
    const low = await get("/intake/document?documentId=DOC-8915-SOV");
    expect(low.body.extractionConfidence).toBeLessThan(0.85);
    expect(low.body.guidance).toContain("below the 0.85 review floor");
    const ok = await get("/intake/document?documentId=DOC-8891-SOV");
    expect(ok.body.guidance).toContain("at or above the 0.85 review floor");
  });

  it("refuses an unknown status and names what it accepts", async () => {
    const res = await post("/intake/submission-status", { submissionId: "SUB-2026-8891", status: "obliterated" });
    expect(res.status).toBe(422);
    expect(res.body.allowed).toContain("referred");
  });
});

describe("Insurity rating and predict engine", () => {
  const rateBody = {
    submissionId: "SUB-2026-8891",
    totalTiv: 200_000_000,
    coastalTier1Tiv: 72_400_000,
    predominantIsoClass: 4,
    windstormDeductiblePct: 5,
    aopDeductible: 25_000,
    irpmCreditPct: -10,
    exposureByState: { FL: 120_000_000, TX: 50_000_000, AL: 30_000_000 },
  };

  it("rates deterministically and shows every factor that moved the premium", async () => {
    const first = await post("/rating/rate", rateBody);
    const second = await post("/rating/rate", rateBody);
    expect(first.status).toBe(200);
    expect(first.body.ratingId).toBe(second.body.ratingId);
    expect(first.body.premium.grossPremium).toBe(second.body.premium.grossPremium);
    const factors = first.body.factors.map((f: any) => f.factor);
    expect(factors).toEqual(["base_rate_per_100", "coastal_tier1_load", "wind_deductible_credit", "aop_deductible_credit", "irpm"]);
    expect(first.body.premium.netCarrierPremium).toBe(
      Math.round((first.body.premium.grossPremium - first.body.premium.brokerCommission) * 100) / 100,
    );
  });

  it("allocates surplus lines tax across the states of exposure", async () => {
    const { body } = await post("/rating/rate", rateBody);
    const states = body.taxAllocation.map((a: any) => a.state).sort();
    expect(states).toEqual(["AL", "FL", "TX"]);
    const florida = body.taxAllocation.find((a: any) => a.state === "FL");
    expect(florida.office).toBe("FSLSO");
    expect(florida.taxPct).toBe(4.94);
    expect(body.premium.surplusLinesTax).toBeCloseTo(
      body.taxAllocation.reduce((s: number, a: any) => s + a.tax, 0), 2,
    );
  });

  it("refuses a discretionary credit beyond authority instead of clamping it", async () => {
    const res = await post("/rating/rate", { ...rateBody, irpmCreditPct: -40 });
    expect(res.status).toBe(422);
    expect(res.body.authority).toEqual({ minPct: -25, maxPct: 25 });
    expect(res.body.error).toContain("outside underwriting authority");
  });

  it("refuses an unknown construction class and a deductible outside the filed range", async () => {
    expect((await post("/rating/rate", { ...rateBody, predominantIsoClass: 9 })).status).toBe(422);
    expect((await post("/rating/rate", { ...rateBody, windstormDeductiblePct: 25 })).status).toBe(422);
  });

  it("will not score a risk without loss history", async () => {
    const res = await post("/rating/predict-score", { submissionId: "SUB-2026-8891", totalTiv: 200_000_000, lossRuns: [] });
    expect(res.status).toBe(422);
    expect(res.body.error).toContain("not an assessment");
  });

  it("scores against the peer cohort for the occupancy", async () => {
    const { status, body } = await post("/rating/predict-score", {
      submissionId: "SUB-2026-8891",
      totalTiv: 200_000_000,
      coastalTier1Tiv: 72_400_000,
      sprinkleredPct: 72,
      predominantOccupancy: "Hotel - Limited Service",
      lossRuns: [
        { year: 2025, claimCount: 3, incurred: 412_000, largestClaim: 264_000, predominantCause: "Wind/Hail" },
        { year: 2024, claimCount: 2, incurred: 96_500, largestClaim: 71_000, predominantCause: "Water Damage" },
      ],
    });
    expect(status).toBe(200);
    expect(body.score).toBeGreaterThan(0);
    expect(body.score).toBeLessThanOrEqual(100);
    expect(body.peerCohort.mean).toBe(57);
    expect(body.drivers.map((d: any) => d.driver)).toContain("coastal_concentration");
  });

  it("returns the treaty limits and the clause behind each one", async () => {
    const { body } = await get("/rating/treaty?treatyId=CP-2026-17");
    expect(body.delegatedAuthority.singleRiskLimit).toBe(25_000_000);
    expect(body.delegatedAuthority.coastalTier1AggregateLimit).toBe(50_000_000);
    expect(body.clauses["4.3"]).toContain("50,000,000");
    expect((await get("/rating/treaty?treatyId=NOPE")).status).toBe(404);
  });
});

describe("Insurity policy system of record", () => {
  const bindable = {
    submissionId: "SUB-2026-8891",
    ratingId: "RTG-TESTONLY",
    insuredName: "Gulf Coast Hospitality Group LLC",
    effectiveDate: "2026-11-01",
    expiryDate: "2027-11-01",
    locationCount: 120,
    coastalTier1Tiv: 72_400_000,
    endorsementIds: ["ME-004"],
    signOffs: [
      { role: "underwriter", name: "R. Chen", decidedAt: "2026-09-20T10:00:00Z" },
      { role: "senior_underwriter", name: "P. Whitfield", decidedAt: "2026-09-20T11:30:00Z" },
    ],
    grossPremium: 412_500, brokerCommission: 49_500, surplusLinesTax: 20_377.5, stampingFee: 247.5, netCarrierPremium: 363_000,
  };

  beforeAll(async () => { await post("/policy/reset", {}); });

  it("refuses to bind without a rating id", async () => {
    const res = await post("/policy/policies", { ...bindable, ratingId: "" });
    expect(res.status).toBe(422);
    expect(res.body.error).toContain("no rating engine calculated");
  });

  it("refuses to bind on a single signature", async () => {
    const res = await post("/policy/policies", { ...bindable, signOffs: [bindable.signOffs[0]] });
    expect(res.status).toBe(422);
    expect(res.body.error).toContain("senior_underwriter");
    expect(res.body.requiredRoles).toEqual(["underwriter", "senior_underwriter"]);
  });

  it("refuses to bind coastal exposure without the mandatory endorsement", async () => {
    const res = await post("/policy/policies", { ...bindable, endorsementIds: [] });
    expect(res.status).toBe(422);
    expect(res.body.treatyClause).toBe("6.1");
  });

  it("mints the policy number from the submission and issues it pending its ledger", async () => {
    const res = await post("/policy/policies", bindable);
    expect(res.status).toBe(201);
    expect(res.body.policy.policyNumber).toBe("POL-2026-8891-CP");
    expect(res.body.policy.status).toBe("bound_pending_ledger");
    expect(res.body.phase).toBe("1_of_2");
    expect(res.body.policy.documentsArchived).toContain("POL-2026-8891-CP-ME-004.pdf");
  });

  it("refuses to bind the same submission twice", async () => {
    const res = await post("/policy/policies", bindable);
    expect(res.status).toBe(409);
    expect(res.body.policy.policyNumber).toBe("POL-2026-8891-CP");
  });

  it("completes the commit only when the premium figures reconcile, and refuses a second posting", async () => {
    // Every journal entry derives from gross, commission, tax and stamping, so
    // the journal balances whatever net is passed. Net is the caller's
    // assertion, so it is the figure that must be checked.
    const inconsistent = await post("/policy/ledger", { policyNumber: "POL-2026-8891-CP", grossPremium: 412_500, brokerCommission: 49_500, surplusLinesTax: 20_377.5, stampingFee: 247.5, netCarrierPremium: 400_000 });
    expect(inconsistent.status).toBe(422);
    expect(inconsistent.body.error).toContain("do not reconcile");
    expect(inconsistent.body.expected.netCarrierPremium).toBe(363_000);

    const posted = await post("/policy/ledger", { policyNumber: "POL-2026-8891-CP" });
    expect(posted.status).toBe(201);
    expect(posted.body.totals.balanced).toBe(true);
    expect(posted.body.status).toBe("bound_active");
    expect(posted.body.journalId).toBe("JRNL-2026-8891-CP");

    const again = await post("/policy/ledger", { policyNumber: "POL-2026-8891-CP" });
    expect(again.status).toBe(409);
    expect(again.body.error).toContain("already posted");
  });

  it("reads back the bound policy by submission id", async () => {
    const { body } = await get("/policy/policy?submissionId=SUB-2026-8891");
    expect(body.status).toBe("bound_active");
    expect(body.ledger.entries.length).toBeGreaterThan(0);
    expect(body.auditTrail.map((a: any) => a.action)).toEqual(["policy.issued_pending_ledger", "policy.bound_active"]);
  });
});

describe("Surplus lines compliance and bordereau", () => {
  beforeAll(async () => { await post("/compliance/reset", {}); });

  it("returns per-state filing requirements with the stamping office and deadline", async () => {
    const { body } = await get("/compliance/filing-requirements?state=FL,TX");
    const fl = body.requirements.find((r: any) => r.state === "FL");
    expect(fl.stampingOffice).toContain("FSLSO");
    expect(fl.premiumTaxPct).toBe(4.94);
    expect(fl.declinationsRequired).toBe(3);
    const tx = body.requirements.find((r: any) => r.state === "TX");
    expect(tx.filingDeadlineDays).toBe(60);
  });

  it("rejects a clause outside the carrier's taxonomy by name", async () => {
    const res = await post("/compliance/clause-check", {
      clauseIds: ["CP-0010", "ME-999"],
      exposure: { coastalTier1Tiv: 0, femaHighHazardLocationCount: 0 },
    });
    expect(res.status).toBe(422);
    expect(res.body.approved).toBe(false);
    expect(res.body.unapprovedClauses[0].clauseId).toBe("ME-999");
  });

  it("names the clauses the exposure makes mandatory when they are absent", async () => {
    const res = await post("/compliance/clause-check", {
      clauseIds: ["CP-0010"],
      exposure: { coastalTier1Tiv: 72_400_000, femaHighHazardLocationCount: 9 },
    });
    expect(res.status).toBe(422);
    const missing = res.body.missingRequiredClauses.map((c: any) => c.clauseId).sort();
    expect(missing).toEqual(["CP-1218", "ME-004", "ME-022"]);
  });

  it("refuses to let a standard form be amended, and approves compliant wording", async () => {
    const amended = await post("/compliance/clause-check", {
      clauseIds: ["CP-0010", "CP-1218", "ME-004", "ME-022"],
      amendedClauses: ["CP-1218"],
      exposure: { coastalTier1Tiv: 72_400_000, femaHighHazardLocationCount: 9 },
    });
    expect(amended.status).toBe(422);
    expect(amended.body.unamendableClausesAmended[0].clauseId).toBe("CP-1218");

    const clean = await post("/compliance/clause-check", {
      clauseIds: ["CP-0010", "CP-1218", "ME-004", "ME-022"],
      amendedClauses: ["ME-004"],
      exposure: { coastalTier1Tiv: 72_400_000, femaHighHazardLocationCount: 9 },
    });
    expect(clean.status).toBe(200);
    expect(clean.body.approved).toBe(true);
  });

  it("counts a policy once per reporting period", async () => {
    const row = { period: "2026-11", policyNumber: "POL-2026-8891-CP", insuredName: "Gulf Coast Hospitality Group LLC", locationCount: 120, grossPremium: 412_500, netCarrierPremium: 363_000, surplusLinesTax: 20_377.5, stampingFee: 247.5, statesOfExposure: ["FL", "TX", "AL", "LA"] };
    const first = await post("/compliance/bordereau", row);
    expect(first.status).toBe(201);
    expect(first.body.rowCount).toBe(1);

    const again = await post("/compliance/bordereau", row);
    expect(again.status).toBe(409);
    expect(again.body.error).toContain("already on the CARRIER-A bordereau");

    const file = await get("/compliance/bordereau?period=2026-11");
    expect(file.body.rowCount).toBe(1);
    expect(file.body.totals.locationCount).toBe(120);
    expect(file.body.totals.grossPremium).toBe(412_500);
  });

  it("refuses a malformed reporting period", async () => {
    expect((await post("/compliance/bordereau", { period: "Nov 2026", policyNumber: "POL-X" })).status).toBe(400);
  });
});

describe("reset restores every simulator to its seed", () => {
  it("clears bound policies and bordereau rows, and restores submissions", async () => {
    await post("/intake/submission-status", { submissionId: "SUB-2026-8891", status: "bound" });
    expect((await get("/intake/submission?submissionId=SUB-2026-8891")).body.status).toBe("bound");

    const intakeReset = await post("/intake/reset", {});
    expect(intakeReset.body.submissions).toBe(3);
    expect((await get("/intake/submission?submissionId=SUB-2026-8891")).body.status).toBe("new");

    await post("/policy/reset", {});
    expect((await get("/policy/policy?submissionId=SUB-2026-8891")).status).toBe(404);

    await post("/compliance/reset", {});
    expect((await get("/compliance/bordereau?period=2026-11")).body.rowCount).toBe(0);
  });
});
