/**
 * The three Mutual Bancorp CRE fixture systems hold one book that agrees with
 * itself, plant exactly what Journey 2's demo needs, and enforce what its
 * policies say a system of record must: borrower identity stays with the
 * owning bank, a spread copies its source cells, each loan is rated on its own
 * bank's scale by that bank's credit officer, memo numbers are traced, and
 * external data comes only from the approved source.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import express from "express";
import type { Server } from "http";
import loans from "../server/mock-mcp/mbcre-loans";
import financials from "../server/mock-mcp/mbcre-financials";
import policy from "../server/mock-mcp/mbcre-policy";
import { resetCreState } from "../server/mock-mcp/mbcre-state";
import { BANKS, CRE_TARGET, FACILITIES, FINANCIAL_DOCUMENTS, POLICIES, RENT_ROLLS, REVIEW_DATE, STRESS_SCENARIOS, annualDebtService, facilityById } from "../server/mock-mcp/mbcre-seed";
import { mbCreServerDefinitions } from "../server/mock-mcp/mbcre-register";
import { mbMortgageServerDefinitions } from "../server/mock-mcp/mb-mortgage-register";

let server: Server;
let base = "";
beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/mock/mbcre-loans", loans);
  app.use("/api/mock/mbcre-financials", financials);
  app.use("/api/mock/mbcre-policy", policy);
  await new Promise<void>((resolve) => { server = app.listen(0, () => resolve()); });
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
beforeEach(() => resetCreState());

const get = async (p: string) => { const r = await fetch(`${base}/api/mock${p}`); return { status: r.status, body: await r.json() as any }; };
const post = async (p: string, body: unknown) => {
  const r = await fetch(`${base}/api/mock${p}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() as any };
};

const TC = "FAC-BLU-1007", MS = "FAC-CC5-2011", ML = "FAC-FID-3004";
const RM = { actorId: "kevin.sheehan", actorRole: "relationship_manager", approvalId: "APR-RM-1" };
const t12Noi = (docId: string) => { const d = FINANCIAL_DOCUMENTS.find((x) => x.documentId === docId)!; return Object.values(d.lines.at(-1)!.values)[0]; };
const gprOf = (docId: string) => Object.values(FINANCIAL_DOCUMENTS.find((x) => x.documentId === docId)!.lines[0].values)[0];

describe("the book agrees with itself", () => {
  it("lands each bank's CRE and construction totals to the dollar", () => {
    for (const b of ["CC5", "FID", "BLU"] as const) {
      const fs = FACILITIES.filter((f) => f.bankId === b);
      expect(fs).toHaveLength(CRE_TARGET[b].count);
      expect(fs.reduce((s, f) => s + f.balance, 0)).toBe(CRE_TARGET[b].total);
      expect(fs.filter((f) => f.propertyType === "construction_land").reduce((s, f) => s + f.balance, 0)).toBe(CRE_TARGET[b].constructionLand);
      expect(fs.every((f) => f.balance > 0)).toBe(true);
    }
  });

  it("states each facility's debt service on its own terms", () => {
    for (const f of FACILITIES) expect(f.annualDebtService).toBeCloseTo(annualDebtService(f.balance, f.noteRatePct, f.amortizationMonthsRemaining, f.interestOnly), 2);
  });

  it("adds up every operating statement", () => {
    for (const d of FINANCIAL_DOCUMENTS) for (const p of d.periods) {
      const v = (label: string) => d.lines.find((l) => l.label === label)!.values[p];
      expect(v("Effective gross income")).toBe(v("Gross potential rent") - v("Less vacancy and credit loss") + v("Expense reimbursements"));
      const opex = d.lines.slice(4, -2).reduce((s, l) => s + l.values[p], 0);
      expect(v("Total operating expenses")).toBe(opex);
      expect(v("Net operating income")).toBe(v("Effective gross income") - opex);
    }
  });
});

describe("what the demo needs is in the raw data, and nothing computes it", () => {
  it("Bluestone meets both 2006 criteria on its own capital; Cape Cod 5 and Fidelity do not", () => {
    const pct = (b: "CC5" | "FID" | "BLU") => CRE_TARGET[b].total / BANKS[b].totalRiskBasedCapital;
    const growth = (b: "CC5" | "FID" | "BLU") => CRE_TARGET[b].total / BANKS[b].creBalance36MonthsAgo - 1;
    expect(pct("BLU")).toBeGreaterThanOrEqual(3); expect(growth("BLU")).toBeGreaterThanOrEqual(0.5);
    expect(pct("CC5")).toBeLessThan(3); expect(pct("FID")).toBeLessThan(3);
    for (const b of ["CC5", "FID", "BLU"] as const) expect(CRE_TARGET[b].constructionLand / BANKS[b].totalRiskBasedCapital).toBeLessThan(1);
  });

  it("Taunton Commons passes today and falls below Bluestone's DSCR floor under rates up and vacancy up", () => {
    const f = facilityById(TC)!;
    const noi = t12Noi("OS-BLU-1007-T12-2026-06");
    expect(noi / f.annualDebtService).toBeGreaterThan(POLICIES.BLU.dscrMinimum);
    const s = STRESS_SCENARIOS.find((x) => x.scenarioId === "STR-RATE-200-VAC-5")!;
    const stressedDs = annualDebtService(f.balance, f.noteRatePct + s.rateShockBp / 100, f.amortizationMonthsRemaining, false);
    expect((noi - gprOf("OS-BLU-1007-T12-2026-06") * s.vacancyIncreasePts / 100) / stressedDs).toBeLessThan(POLICIES.BLU.dscrMinimum);
  });

  it("Taunton Commons' anchor is over a quarter of rent and expires within twelve months", () => {
    const rr = RENT_ROLLS["RR-BLU-1007-2026-09"];
    const total = rr.rows.reduce((s, r) => s + r.annualBaseRent, 0);
    const anchor = rr.rows[0];
    expect(anchor.annualBaseRent / total).toBeGreaterThan(POLICIES.BLU.earlyWarning.tenantShareOfIncome);
    const months = (new Date(anchor.leaseExpiry).getTime() - new Date(REVIEW_DATE).getTime()) / (30.44 * 864e5);
    expect(months).toBeLessThan(12);
  });

  it("Main Street Medical breaches its DSCR covenant on the T12 and resets inside the stress horizon", () => {
    const f = facilityById(MS)!;
    expect(t12Noi("OS-CC5-2011-T12-2026-09") / f.annualDebtService).toBeLessThan(f.covenants[0].threshold);
    expect(t12Noi("OS-CC5-2011-T12-2026-09") / f.annualDebtService).toBeGreaterThan(1.1);
    expect(new Date(f.resetDate!).getTime() - new Date(REVIEW_DATE).getTime()).toBeLessThan(24 * 30.44 * 864e5);
  });

  it("Leominster Mill Lofts is healthy but its appraisal is older than Fidelity's limit", () => {
    const f = facilityById(ML)!;
    expect(t12Noi("OS-FID-3004-T12-2026-09") / f.annualDebtService).toBeGreaterThan(1.5);
    const ageMonths = (new Date(REVIEW_DATE).getTime() - new Date(f.appraisal.effectiveDate).getTime()) / (30.44 * 864e5);
    expect(ageMonths).toBeGreaterThan(POLICIES.FID.appraisalMaxAgeMonths);
  });

  it("the loan system serves no spread, rating, rollup or warning before anyone records one", async () => {
    const r = (await get(`/mbcre-loans/review?facilityId=${TC}`)).body.review;
    expect([r.spreads, r.proposedRatings, r.memos, r.stressResults]).toEqual([[], [], [], []]);
    expect((await get("/mbcre-loans/early-warnings")).body.warnings).toEqual([]);
    expect((await get("/mbcre-loans/group-position")).body.latestRollup).toBeNull();
  });
});

describe("borrower identity stays with the owning bank", () => {
  it("shows borrowers to the owning bank only", async () => {
    const own = await get(`/mbcre-loans/facilities?viewerBankId=BLU&bankId=BLU`);
    expect(own.body.facilities.every((f: any) => f.borrowerName)).toBe(true);
    const hold = await get(`/mbcre-loans/facilities?viewerBankId=HOLDCO`);
    expect(hold.body.facilities).toHaveLength(FACILITIES.length);
    expect(JSON.stringify(hold.body.facilities)).not.toMatch(/borrowerName|guarantor|Taunton Commons Associates/);
    expect((await get(`/mbcre-loans/facility?facilityId=${TC}&viewerBankId=CC5&includeBorrower=true`)).status).toBe(403);
    expect((await get(`/mbcre-loans/facilities`)).status).toBe(422);
  });
});

describe("the annual review", () => {
  it("documents arrive only once the relationship manager sends the request, and only a person in that role can", async () => {
    expect((await get(`/mbcre-financials/document?documentId=OS-BLU-1007-T12-2026-06`)).status).toBe(409);
    expect((await post("/mbcre-loans/document-request/draft", { facilityId: TC, items: ["T12 operating statement", "Rent roll"], message: "Please send..." })).status).toBe(200);
    expect((await post("/mbcre-loans/document-request/send", { facilityId: TC, actorId: "x", actorRole: "review_agent", approvalId: "A" })).status).toBe(403);
    const sent = await post("/mbcre-loans/document-request/send", { facilityId: TC, ...RM });
    expect(sent.body.documentsReceived.sort()).toEqual(["OS-BLU-1007-FY2025", "OS-BLU-1007-T12-2026-06", "RR-BLU-1007-2026-09"]);
    expect((await get(`/mbcre-financials/document?documentId=OS-BLU-1007-T12-2026-06`)).status).toBe(200);
    expect((await get(`/mbcre-financials/rent-roll?documentId=RR-BLU-1007-2026-09`)).body.rentRoll.rows[0].cite).toBe("RR-BLU-1007-2026-09!R01");
  });

  it("a spread line must copy the cell it cites", async () => {
    await post("/mbcre-loans/document-request/send", { facilityId: TC, ...RM });
    const noiRef = "OS-BLU-1007-T12-2026-06!L13@T12 2026-06";
    expect((await post("/mbcre-loans/spread", { facilityId: TC, period: "T12 2026-06", lines: [{ line: "NOI", value: 1_800_000, sourceRef: noiRef }], ratios: {} })).status).toBe(422);
    expect((await post("/mbcre-loans/spread", { facilityId: TC, period: "T12 2026-06", lines: [{ line: "NOI", value: 1_745_600, sourceRef: noiRef }], ratios: { dscr: 1.4 } })).status).toBe(200);
    expect((await post("/mbcre-loans/spread", { facilityId: MS, period: "T12", lines: [{ line: "NOI", value: 652_900, sourceRef: "OS-CC5-2011-T12-2026-09!L12@T12 2026-09" }], ratios: {} })).status).toBe(409);
  });

  it("every covenant must be tested", async () => {
    expect((await post("/mbcre-loans/covenant-tests", { facilityId: TC, results: [{ covenantId: "FAC-BLU-1007-COV1", value: 1.39, result: "pass" }] })).status).toBe(422);
    const ok = await post("/mbcre-loans/covenant-tests", { facilityId: MS, results: [{ covenantId: "FAC-CC5-2011-COV1", value: 1.17, result: "breach" }] });
    expect(ok.body.breaches).toEqual(["FAC-CC5-2011-COV1"]);
  });

  it("rates on the owning bank's scale, by that bank's credit officer only", async () => {
    expect((await post("/mbcre-loans/rating/propose", { facilityId: TC, grade: "5", rationale: "x" })).status).toBe(422);
    const p = await post("/mbcre-loans/rating/propose", { facilityId: TC, grade: "C", rationale: "Anchor expiry and stressed DSCR below policy." });
    expect(p.body.groupGrade).toBe("G4");
    const cc5Officer = { actorId: "j.burke", actorRole: "credit_officer", approvalId: "APR-CO-1", actorBankId: "CC5" };
    expect((await post("/mbcre-loans/rating/final", { facilityId: TC, ...cc5Officer })).status).toBe(403);
    expect((await post("/mbcre-loans/rating/final", { facilityId: TC, ...cc5Officer, actorBankId: "BLU", actorRole: "rating_agent" })).status).toBe(403);
    const fin = await post("/mbcre-loans/rating/final", { facilityId: TC, ...cc5Officer, actorBankId: "BLU" });
    expect(fin.body.finalRating).toMatchObject({ grade: "C", groupGrade: "G4", actorBankId: "BLU" });
  });

  it("traces memo figures to received cells and loan-system fields, and lists missing sections", async () => {
    await post("/mbcre-loans/document-request/send", { facilityId: TC, ...RM });
    const ds = facilityById(TC)!.annualDebtService;
    const r = await post("/mbcre-loans/memo", { facilityId: TC, sections: { relationshipSummary: "..." }, figures: [
      { label: "T12 NOI", value: 1_745_600, sourceRefs: ["OS-BLU-1007-T12-2026-06!L13@T12 2026-06"] },
      { label: "Debt service", value: ds, sourceRefs: [`LS:${TC}.annualDebtService`] },
      { label: "Anchor rent", value: 874_000, sourceRefs: ["RR-BLU-1007-2026-09!R01"] },
      { label: "DSCR", value: 1.4, sourceRefs: ["OS-BLU-1007-T12-2026-06!L13@T12 2026-06", `LS:${TC}.annualDebtService`], derived: true },
      { label: "Market vacancy", value: 9, sourceRefs: [] },
      { label: "Wrong NOI", value: 1_900_000, sourceRefs: ["OS-BLU-1007-T12-2026-06!L13@T12 2026-06"] },
    ] });
    expect(r.body.tracedPct).toBe(66.7);
    expect(r.body.untraced.map((x: any) => x.label)).toEqual(["Market vacancy", "Wrong NOI"]);
    expect(r.body.missingSections).toContain("stressTesting");
  });
});

describe("memo citations cover what a tenancy memo states", () => {
  it("traces rent roll fields, document fields, dates, covenant thresholds and grade bands", async () => {
    await post("/mbcre-loans/document-request/send", { facilityId: TC, ...RM });
    const RR = "RR-BLU-1007-2026-09";
    const r = await post("/mbcre-loans/memo", { facilityId: TC, sections: {}, figures: [
      { label: "Anchor square feet", value: 42_000, sourceRefs: [`${RR}!R01.sqft`] },
      { label: "Gross leasable area", value: 112_400, sourceRefs: [`${RR}!gla`] },
      { label: "Anchor lease expiry", value: "2027-06-30", sourceRefs: [`${RR}!R01.leaseExpiry`] },
      { label: "Anchor tenant", value: "Harbor Fresh Grocery", sourceRefs: [`${RR}!R01.tenant`] },
      { label: "Maturity", value: "2029-06-30", sourceRefs: [`LS:${TC}.maturityDate`] },
      { label: "Appraisal date", value: "2025-04-18", sourceRefs: [`LS:${TC}.appraisal.effectiveDate`] },
      { label: "Occupancy covenant minimum", value: 85, sourceRefs: [`LS:${TC}.covenants.FAC-BLU-1007-COV2.threshold`] },
      { label: "B+ band maximum LTV", value: 75, sourceRefs: ["POL:BLU.ratingScale.B+.maxLtv"] },
      { label: "Occupancy", value: 87, sourceRefs: [`${RR}!gla`, `${RR}!R10.sqft`, `${RR}!R11.sqft`], derived: true },
    ] });
    expect(r.body.untraced).toEqual([]);
    expect(r.body.tracedPct).toBe(100);
  });

  it("says why a figure is untraced", async () => {
    await post("/mbcre-loans/document-request/send", { facilityId: TC, ...RM });
    const RR = "RR-BLU-1007-2026-09";
    const r = await post("/mbcre-loans/memo", { facilityId: TC, sections: {}, figures: [
      { label: "Anchor square feet cited to the row", value: 42_000, sourceRefs: [`${RR}!R01`] },
      { label: "Wrong expiry", value: "2027-12-31", sourceRefs: [`${RR}!R01.leaseExpiry`] },
      { label: "Another bank's policy", value: 1.25, sourceRefs: ["POL:CC5.dscrMinimum"] },
      { label: "Unknown field", value: 1, sourceRefs: [`${RR}!R01.colour`] },
    ] });
    const reasons = Object.fromEntries(r.body.untraced.map((x: any) => [x.label, x.reason]));
    expect(reasons["Anchor square feet cited to the row"]).toMatch(/is 874000/);
    expect(reasons["Wrong expiry"]).toMatch(/is 2027-06-30/);
    expect(reasons["Another bank's policy"]).toMatch(/not a source/);
    expect(reasons["Unknown field"]).toMatch(/not a source/);
  });

  it("a spread line still cites an amount, never a date or a name", async () => {
    await post("/mbcre-loans/document-request/send", { facilityId: TC, ...RM });
    const bad = await post("/mbcre-loans/spread", { facilityId: TC, period: "T12", lines: [{ line: "Anchor rent", value: 874_000, sourceRef: "RR-BLU-1007-2026-09!R01.leaseExpiry" }], ratios: {} });
    expect(bad.status).toBe(422);
    expect((await post("/mbcre-loans/spread", { facilityId: TC, period: "T12", lines: [{ line: "Anchor rent", value: 874_000, sourceRef: "RR-BLU-1007-2026-09!R01.annualBaseRent" }], ratios: {} })).status).toBe(200);
  });
});

describe("portfolio and policy", () => {
  it("records warnings only of known types for known facilities", async () => {
    expect((await post("/mbcre-loans/early-warnings", { warnings: [{ facilityId: TC, type: "vibes", detail: "x" }] })).status).toBe(422);
    expect((await post("/mbcre-loans/early-warnings", { warnings: [{ facilityId: TC, type: "tenant_expiry", severity: "high", detail: "Anchor 42% of rent expires 2027-06-30", evidenceRefs: ["RR-BLU-1007-2026-09!R01"] }] })).status).toBe(200);
    expect((await get("/mbcre-loans/group-position")).body.earlyWarningsByBank).toEqual({ BLU: { tenant_expiry: 1 } });
  });

  it("serves market data only from the approved source, and the rating map keeps each scale", async () => {
    expect((await get(`/mbcre-policy/market-data?subMarket=${encodeURIComponent("Taunton / Raynham")}&source=CoStar`)).status).toBe(403);
    expect((await get(`/mbcre-policy/market-data?subMarket=${encodeURIComponent("Taunton / Raynham")}`)).body.data.length).toBeGreaterThan(0);
    const map = (await get("/mbcre-policy/rating-map")).body;
    expect(map.banks.BLU.map((g: any) => g.grade)).toContain("B+");
    expect(map.banks.CC5.find((g: any) => g.grade === "6").groupGrade).toBe("G4");
  });

  it("the MCP definitions point at routes that answer JSON, with names no other connector uses", async () => {
    const defs = mbCreServerDefinitions(base);
    const mortgage = new Set(mbMortgageServerDefinitions(base).flatMap((d) => d.tools.map((t) => t.name)));
    for (const d of defs) for (const t of d.tools) {
      expect(mortgage.has(t.name), t.name).toBe(false);
      const url = `${d.baseUrl}${t.endpoint}${t.method === "GET" ? `?facilityId=${TC}&viewerBankId=BLU&bankId=BLU&documentId=x&subMarket=x` : ""}`;
      const r = await fetch(url, t.method === "GET" ? undefined : { method: t.method, headers: { "Content-Type": "application/json" }, body: "{}" });
      expect(r.headers.get("content-type") ?? "", `${t.name}`).toMatch(/json/);
    }
  });
});
