/**
 * The six Harborview Wealth Partners fixture systems hold one wealth book that
 * agrees with itself, plant exactly what the Wealth Management journeys need,
 * and enforce what their policies say a system of record must: a household-
 * wide wash-sale scan with permanent IRA disallowance, insider windows and
 * client restrictions, cash and concentration, people releasing trades and
 * approving non-discretionary ones, a false positive cleared only on the
 * party's own identifiers, no account opened before screening, due diligence
 * and a confirmed profile, a title mismatch rejected, and the Marketing Rule
 * pre-check before anything reaches a client. The watchlist's PEP list is
 * additive: existing sanctions verdicts do not move.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import express from "express";
import type { Server } from "http";
import portfolio from "../server/mock-mcp/wm-portfolio";
import custodian from "../server/mock-mcp/wm-custodian";
import onboarding from "../server/mock-mcp/wm-onboarding";
import { planning, crm, performance } from "../server/mock-mcp/wm-advice";
import watchlist from "../server/mock-mcp/watchlist-screening";
import { resetWmState } from "../server/mock-mcp/wm-state";
import { ACCOUNTS, HOUSEHOLDS, accountValue, accountsOf, isEquity, security } from "../server/mock-mcp/wm-seed";
import { wmServerDefinitions } from "../server/mock-mcp/wm-register";
import { mbMortgageServerDefinitions } from "../server/mock-mcp/mb-mortgage-register";
import { mbCreServerDefinitions } from "../server/mock-mcp/mbcre-register";

let server: Server;
let base = "";
beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/mock/wm-portfolio", portfolio);
  app.use("/api/mock/wm-custodian", custodian);
  app.use("/api/mock/wm-onboarding", onboarding);
  app.use("/api/mock/wm-planning", planning);
  app.use("/api/mock/wm-crm", crm);
  app.use("/api/mock/wm-performance", performance);
  app.use("/api/mock/watchlist-screening", watchlist);
  await new Promise<void>((resolve) => { server = app.listen(0, () => resolve()); });
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
beforeEach(() => resetWmState());

const get = async (p: string) => { const r = await fetch(`${base}/api/mock${p}`); return { status: r.status, body: await r.json() as any }; };
const post = async (p: string, body: unknown) => {
  const r = await fetch(`${base}/api/mock${p}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() as any };
};
const HART = "ACCT-HHLD-HART-001";
const PM = { actorId: "sam.okoro", actorRole: "portfolio_manager", approvalId: "APR-PM-1" };
const ADV = { actorId: "jordan.ellis", actorRole: "advisor", approvalId: "APR-ADV-1" };
const OPS = { actorId: "lee.park", actorRole: "operations", approvalId: "APR-OPS-1" };
const CCO = { actorId: "maria.vance", actorRole: "compliance_officer", approvalId: "APR-CO-1" };
const CSA = { actorId: "nina.ortiz", actorRole: "client_service_associate", approvalId: "APR-CSA-1" };
const equityPct = (hh: string) => {
  const ips = accountsOf(hh).filter((a) => a.inIps);
  const tot = ips.reduce((s, a) => s + accountValue(a), 0);
  return ips.flatMap((a) => a.lots).filter((l) => isEquity(security(l.symbol)!.assetClass)).reduce((s, l) => s + l.quantity * security(l.symbol)!.price, 0) / tot * 100;
};

describe("the wealth book agrees with itself", () => {
  it("values every Hartman account exactly", () => {
    expect(accountsOf(HART).map((a) => [a.accountId, accountValue(a)])).toEqual([["ACCT-1001", 742000], ["ACCT-1002", 418000], ["ACCT-1003", 96000], ["ACCT-1005", 153000]]);
  });
  it("puts Hartman equities outside the band, the Mbeki control exactly on its edge, and Novalux above the cap", () => {
    const h = HOUSEHOLDS.find((x) => x.householdId === HART)!;
    expect(equityPct(HART)).toBeGreaterThan(h.ips.targetAllocation.equity + h.ips.driftBandPct);
    expect(equityPct("ACCT-HHLD-MBEK-004")).toBeCloseTo(75, 6);
    const hhValue = accountsOf(HART).reduce((s, a) => s + accountValue(a), 0);
    expect(312000 / hhValue * 100).toBeGreaterThan(h.ips.singleStockCapPct);
  });
  it("gives every lot a known security and every account an owner in its household", () => {
    for (const a of ACCOUNTS) {
      expect(a.lots.every((l) => security(l.symbol))).toBe(true);
      const members = HOUSEHOLDS.find((h) => h.householdId === a.householdId)!.members.map((m) => m.clientId);
      expect(a.owners.every((o) => members.includes(o))).toBe(true);
    }
  });
});

describe("pre-trade checks are the system's own", () => {
  it("blocks the Hartman harvest: a Roth IRA bought the same fund 12 days earlier, so the matched loss is permanently disallowed", async () => {
    const r = (await post("/wm-portfolio/pretrade-checks", { orders: [{ accountId: "ACCT-1001", symbol: "HVIX", side: "sell", quantity: 2400, lotId: "LOT-1001-04" }] })).body;
    const wash = r.results[0].findings.find((f: any) => f.rule === "PT-WASH");
    expect(r.results[0].result).toBe("block");
    expect(wash.permanent).toBe(true);
    expect(wash.disallowedLoss).toBeCloseTo(18400 * 100 / 2400, 2);
    expect(wash.evidence).toContain("TXN-1003-AI-1014");
  });
  it("allows the Lindqvist harvest whose IRA purchase was 31 days earlier, and a different-index replacement", async () => {
    const r = (await post("/wm-portfolio/pretrade-checks", { orders: [{ accountId: "ACCT-3001", symbol: "HVIX", side: "sell", quantity: 600, lotId: "LOT-3001-02" }, { accountId: "ACCT-1001", symbol: "HVXM", side: "buy", quantity: 100 }] })).body;
    expect(r.results.map((x: any) => x.result)).toEqual(["pass", "pass"]);
  });
  it("treats a same-group buy in the same batch as a wash sale", async () => {
    const r = (await post("/wm-portfolio/pretrade-checks", { orders: [{ accountId: "ACCT-3001", symbol: "HVIX", side: "sell", quantity: 600, lotId: "LOT-3001-02" }, { accountId: "ACCT-3002", symbol: "HVID", side: "buy", quantity: 10 }] })).body;
    expect(r.results[0].findings.some((f: any) => f.rule === "PT-WASH" && f.permanent)).toBe(true);
  });
  it("blocks the Novalux trim inside the insider window, a tobacco buy, an overdrawn buy and a concentration-raising buy", async () => {
    const r = (await post("/wm-portfolio/pretrade-checks", { orders: [
      { accountId: "ACCT-1001", symbol: "NVLX", side: "sell", quantity: 500 },
      { accountId: "ACCT-2002", symbol: "TBCO", side: "buy", quantity: 10 },
      { accountId: "ACCT-1003", symbol: "HVUS", side: "buy", quantity: 1000 },
      { accountId: "ACCT-1002", symbol: "NVLX", side: "buy", quantity: 10 },
    ] })).body;
    const rules = r.results.map((x: any) => x.findings.map((f: any) => f.rule));
    expect(rules[0]).toContain("PT-RESTRICT-BLACKOUT");
    expect(rules[1]).toEqual(expect.arrayContaining(["PT-ESG", "PT-DISCRETION"]));
    expect(rules[2]).toContain("PT-CASH");
    expect(rules[3]).toEqual(expect.arrayContaining(["PT-RESTRICT-BLACKOUT", "PT-CONC"]));
  });
});

describe("people release trades", () => {
  it("never stages a blocked order, holds a non-discretionary trade until the client approves, and refuses an agent releasing", async () => {
    const s = await post("/wm-portfolio/orders/stage", { orders: [{ accountId: "ACCT-1001", symbol: "HVIX", side: "sell", quantity: 2400, lotId: "LOT-1001-04" }, { accountId: "ACCT-2002", symbol: "HVUS", side: "sell", quantity: 100 }, { accountId: "ACCT-1002", symbol: "HVUS", side: "sell", quantity: 300 }] });
    expect(s.body.refused).toHaveLength(1);
    const [nd, d] = [s.body.staged.find((o: any) => o.accountId === "ACCT-2002"), s.body.staged.find((o: any) => o.accountId === "ACCT-1002")];
    expect(nd.needsClientApproval).toBe(true);
    expect((await post("/wm-portfolio/orders/submit", { actorId: "x", actorRole: "trading_agent", approvalId: "A" })).status).toBe(403);
    const first = await post("/wm-portfolio/orders/submit", PM);
    expect(first.body.released.map((o: any) => o.orderId)).toEqual([d.orderId]);
    expect(first.body.held.map((o: any) => o.orderId)).toEqual([nd.orderId]);
    expect((await post("/wm-portfolio/orders/client-approval", { accountId: "ACCT-2002", orderIds: [nd.orderId], ...ADV })).status).toBe(200);
    expect((await post("/wm-portfolio/orders/submit", { orderIds: [nd.orderId], ...PM })).body.released).toHaveLength(1);
  });
  it("reports taxable realised gains against the tax budget", async () => {
    await post("/wm-portfolio/orders/stage", { orders: [{ accountId: "ACCT-1001", symbol: "HVUS", side: "sell", quantity: 100, lotId: "LOT-1001-02" }] });
    await post("/wm-portfolio/orders/submit", PM);
    const g = (await get(`/wm-portfolio/realized-gains?householdId=${HART}`)).body;
    expect(g.taxableRealizedGainLoss).toBe(3600);
    expect(g.withinBudget).toBe(true);
  });
});

describe("onboarding the Castellano Family Trust", () => {
  const CASE = "ACCT-ONB-CAST-001";
  it("refuses to open the account and names every gap", async () => {
    const r = await post("/wm-custodian/accounts/open", { caseId: CASE, ...OPS });
    expect(r.status).toBe(422);
    const gaps = r.body.gaps.join(" ");
    expect(gaps).toMatch(/DOC-CAST-TRUSTCERT has 1 of 2 pages/);
    expect(gaps).toMatch(/Enhanced due diligence/);
    expect(gaps).toMatch(/suitability/);
  });
  it("clears a near-match only on the party's own identifiers", async () => {
    const own = [{ field: "dateOfBirth", partyValue: "1984-02-11", listValue: "1971-06-02" }, { field: "nationality", partyValue: "US", listValue: "LB" }];
    expect((await post("/wm-onboarding/screening-disposition", { caseId: CASE, partyId: "PTY-CAST-02", disposition: "false_positive", identifiersCompared: [{ field: "dateOfBirth", partyValue: "1971-06-03", listValue: "1971-06-02" }] })).status).toBe(422);
    expect((await post("/wm-onboarding/screening-disposition", { caseId: CASE, partyId: "PTY-CAST-02", disposition: "false_positive", identifiersCompared: [{ field: "address", partyValue: "x", listValue: "y" }] })).status).toBe(422);
    expect((await post("/wm-onboarding/screening-disposition", { caseId: CASE, partyId: "PTY-CAST-02", disposition: "false_positive", identifiersCompared: own })).status).toBe(200);
  });
  it("opens the account once everything is in place, then the transfer is rejected for the title and completes with a letter of authorization", async () => {
    expect((await post("/wm-onboarding/request-missing-documents", { caseId: CASE, message: "Please send page 2", ...CSA })).body.supplied).toHaveLength(1);
    for (const p of ["PTY-CAST-01", "PTY-CAST-02"]) expect((await post("/wm-onboarding/verify-identity", { caseId: CASE, partyId: p })).body.result).toBe("verified");
    await post("/wm-onboarding/screening-disposition", { caseId: CASE, partyId: "PTY-CAST-01", disposition: "clear" });
    await post("/wm-onboarding/screening-disposition", { caseId: CASE, partyId: "PTY-CAST-02", disposition: "false_positive", identifiersCompared: [{ field: "dateOfBirth", partyValue: "1984-02-11", listValue: "1971-06-02" }] });
    expect((await post("/wm-onboarding/aml-disposition", { caseId: CASE, outcome: "approved_with_edd", actorId: "x", actorRole: "advisor", approvalId: "A" })).status).toBe(403);
    await post("/wm-onboarding/aml-disposition", { caseId: CASE, outcome: "approved_with_edd", note: "Former official; source of funds documented.", ...CCO });
    expect((await post("/wm-custodian/accounts/open", { caseId: CASE, ...OPS })).body.gaps).toEqual(["The advisor has not confirmed the suitability profile."]);
    await post("/wm-onboarding/suitability/propose", { caseId: CASE, modelId: "MDL-CONS-4060", toleranceCapacityConflict: true, rationale: "Tolerance 72 but six-year horizon and 150k a year of withdrawals." });
    await post("/wm-onboarding/suitability/confirm", { caseId: CASE, ...ADV });
    const opened = await post("/wm-custodian/accounts/open", { caseId: CASE, ...OPS });
    expect(opened.body.accountId).toBe("ACCT-5001");
    const t = (await post("/wm-custodian/transfers/initiate", { caseId: CASE, ...OPS })).body.transfer;
    expect(t.status).toBe("rejected");
    expect(t.rejectReason).toMatch(/TITLE_MISMATCH.*Castellano Fam Trust/);
    expect((await post("/wm-custodian/transfers/resubmit", { caseId: CASE, transferId: t.transferId, correction: "letter_of_authorization", ...CSA })).body.transfer.status).toBe("completed");
  });
});

describe("the watchlist's PEP list is additive", () => {
  it("reports a PEP separately without a sanctions hit, and keeps the seeded sanctions verdicts", async () => {
    const elena = (await post("/watchlist-screening/screen-party", { fullName: "Elena Castellano Ruiz", entityType: "individual" })).body;
    expect(elena.pep.status).toBe("pep");
    const hasan = (await post("/watchlist-screening/screen-party", { fullName: "Hasan Mansur", entityType: "individual", dateOfBirth: "1984-02-11", country: "US" })).body;
    expect(hasan.status).toBe("potential_match");
    expect(hasan.matches[0].entryId).toBe("SDN-19042");
    expect(hasan.pep.status).toBe("not_pep");
    for (const [name, verdict] of [["Vostok Maritime Trading LLC", "match"], ["Hassan Karim Mansour", "match"], ["Meridian Freight Services Inc", "potential_match"], ["Northgate Industrial Supply", "pending"]]) {
      expect((await post("/watchlist-screening/screen-party", { fullName: name })).body.status, name).toBe(verdict);
    }
    expect((await get("/watchlist-screening/watchlists")).body.lists).toHaveLength(6);
  });
});

describe("advice systems", () => {
  it("runs only the planning tool's own scenarios", async () => {
    expect((await post("/wm-planning/scenario", { householdId: HART, scenario: "retire_at_61" })).body.probabilityOfSuccess).toBe(86);
    expect((await post("/wm-planning/scenario", { householdId: HART, scenario: "make_it_95" })).status).toBe(422);
  });
  it("flags a projected-return chart and lets only the advisor send a passed communication", async () => {
    const flagged = (await post("/wm-onboarding/marketing-review", { householdId: HART, text: "Your portfolio could grow to $3.2M by 2034 based on projected returns." })).body;
    expect(flagged.verdict).toBe("flagged");
    expect((await post("/wm-crm/communication/send", { householdId: HART, marketingReviewId: flagged.reviewId, ...ADV })).status).toBe(422);
    const clean = (await post("/wm-onboarding/marketing-review", { householdId: HART, text: "Over the year to 2026-09-30 your accounts returned 9.8% net of fees (10.6% gross) against 9.1% for the benchmark." })).body;
    expect(clean.verdict).toBe("pass");
    expect((await post("/wm-crm/communication/send", { householdId: HART, marketingReviewId: clean.reviewId, actorId: "x", actorRole: "review_agent", approvalId: "A" })).status).toBe(403);
    expect((await post("/wm-crm/communication/send", { householdId: HART, marketingReviewId: clean.reviewId, subject: "Agenda", ...ADV })).status).toBe(200);
  });
  it("shows Daniel's IRA has no contingent beneficiary, and serves the computed performance", async () => {
    const b = (await get(`/wm-crm/beneficiaries?householdId=${HART}`)).body.accounts.find((a: any) => a.accountId === "ACCT-1002");
    expect(b.designations.some((d: any) => d.type === "contingent")).toBe(false);
    const p = (await get(`/wm-performance/performance?householdId=${HART}`)).body.performance;
    expect([p.twrNetPct, p.mwrNetPct]).toEqual([9.8, 7.1]);
  });
});

describe("the MCP definitions", () => {
  it("point every tool at a route that answers JSON, with names no other connector uses", async () => {
    const defs = wmServerDefinitions(base);
    expect(defs).toHaveLength(6);
    const others = new Set([...mbMortgageServerDefinitions(base), ...mbCreServerDefinitions(base)].flatMap((d) => d.tools.map((t) => t.name)));
    const mine = defs.flatMap((d) => d.tools.map((t) => t.name));
    expect(new Set(mine).size).toBe(mine.length);
    for (const d of defs) for (const t of d.tools) {
      expect(others.has(t.name), t.name).toBe(false);
      const url = `${d.baseUrl}${t.endpoint}${t.method === "GET" ? `?householdId=${HART}&accountId=ACCT-1001&caseId=ACCT-ONB-CAST-001&modelId=MDL-GROWTH-7030&registration=trust` : ""}`;
      const r = await fetch(url, t.method === "GET" ? undefined : { method: t.method, headers: { "Content-Type": "application/json" }, body: "{}" });
      expect(r.headers.get("content-type") ?? "", t.name).toMatch(/json/);
    }
  });
});
