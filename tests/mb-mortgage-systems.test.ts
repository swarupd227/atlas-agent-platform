/**
 * The three Mutual Bancorp mortgage fixture systems hold a raw loan file that
 * agrees with itself to the cent, plant exactly the two problems the demo
 * needs, and enforce what the journey's policies say a system of record must:
 * government monitoring information never leaves the LOS, a loan is checked
 * only against its own bank's overlays, a finding without a page and a rule
 * citation is withheld, agents never decide, and an agent clears only a
 * documentary condition on its bank's schedule with a matching document.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import express from "express";
import type { Server } from "http";
import los from "../server/mock-mcp/mb-mortgage-los";
import documents from "../server/mock-mcp/mb-loan-documents";
import guidelines from "../server/mock-mcp/mb-guidelines";
import { resetMortgageState } from "../server/mock-mcp/mb-mortgage-state";
import { LOANS, FEDERAL_HOLIDAYS_2026, BANK_CLOSURES_2026 } from "../server/mock-mcp/mb-mortgage-seed";
import { mbMortgageServerDefinitions } from "../server/mock-mcp/mb-mortgage-register";

let server: Server;
let base = "";
beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/mock/mb-mortgage-los", los);
  app.use("/api/mock/mb-loan-documents", documents);
  app.use("/api/mock/mb-guidelines", guidelines);
  await new Promise<void>((resolve) => { server = app.listen(0, () => resolve()); });
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
beforeEach(() => resetMortgageState());

const get = async (p: string) => { const r = await fetch(`${base}/api/mock${p}`); return { status: r.status, body: await r.json() as any }; };
const post = async (p: string, body: unknown) => {
  const r = await fetch(`${base}/api/mock${p}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() as any };
};

const DEMO = "LN-CC5-26-04417";
const FID = "LN-FID-26-01162";
const UW = { actorId: "susan.mendes", actorRole: "underwriter", approvalId: "APR-UW-1" };
const LO = { actorId: "kevin.doherty", actorRole: "loan_officer", approvalId: "APR-LO-1" };
const amount = (s: string) => Number(s.replace(/,/g, ""));
const pageOf = (loanId: string, re: RegExp) => LOANS[loanId].pages.find((p) => re.test(p.text))!;

describe("the demo file agrees with itself", () => {
  const l = LOANS[DEMO];

  it("prices the housing payment the LOS records", () => {
    const r = l.noteRate / 100 / 12;
    const pi = l.loanAmount * r / (1 - Math.pow(1 + r, -l.termMonths));
    expect(l.housingExpense.principalAndInterest).toBeCloseTo(pi, 2);
  });

  it("every bank statement's transactions add up to its ending balance", () => {
    for (const loan of [LOANS[DEMO], LOANS[FID]]) {
      const byStatement = new Map<string, string[]>();
      for (const p of loan.pages.filter((x) => x.document === "BANK_STATEMENT")) {
        const key = p.text.split("\n").slice(0, 3).join("|");
        byStatement.set(key, [...(byStatement.get(key) ?? []), p.text]);
      }
      for (const texts of byStatement.values()) {
        const all = texts.join("\n");
        const opening = amount(all.match(/Beginning balance ([\d,.]+)/)![1]);
        const ending = amount(all.match(/Ending balance ([\d,.]+)\s*$/)![1]);
        const moves = [...all.matchAll(/ ([+-])([\d,]+\.\d{2})  bal /g)].map((m) => (m[1] === "-" ? -1 : 1) * amount(m[2]));
        expect(Math.round((opening + moves.reduce((s, v) => s + v, 0)) * 100) / 100).toBe(ending);
      }
    }
  });

  it("each Schedule C's expenses add up to its net profit, and the returns carry it", () => {
    for (const year of ["2025", "2024"]) {
      const c = pageOf(DEMO, new RegExp(`${year} Schedule C \\(Form 1040\\) Profit or Loss`)).text;
      const gross = amount(c.match(/Line 1 Gross receipts: ([\d,.]+)/)![1]);
      const lines = [...c.matchAll(/  Line [^:]+: ([\d,.]+)/g)].map((m) => amount(m[1]));
      const net = amount(c.match(/Line 31 Net profit: ([\d,.]+)/)![1]);
      expect(gross - lines.reduce((s, v) => s + v, 0)).toBe(net);
      expect(pageOf(DEMO, new RegExp(`${year} Schedule 1`)).text).toContain(`${net.toLocaleString("en-US", { minimumFractionDigits: 2 })}`);
    }
  });
});

describe("the two planted problems are in the raw file, and nothing computes them", () => {
  it("the latest pay stub's year-to-date is four pay periods short of its own rate and the W-2 trend", () => {
    const stub = pageOf(DEMO, /Pay date: 09\/25\/2026/).text;
    const perPeriod = 100000 / 26;
    const ytd = amount(stub.match(/Gross pay\s+[\d,.]+\s+([\d,.]+)/)![1]);
    expect(Math.round((20 * perPeriod - ytd) / perPeriod)).toBe(4);
    const w2 = amount(pageOf(DEMO, /2025 Form W-2/).text.match(/Box 5 Medicare wages and tips: ([\d,.]+)/)![1]);
    expect(ytd / (268 / 365)).toBeLessThan(w2 * 0.9);
  });

  it("a single unexplained deposit exceeds half the stated monthly income, and without it assets fall short of cash to close", () => {
    const l = LOANS[DEMO];
    const page = pageOf(DEMO, /MOBILE DEPOSIT CHECK #1047/);
    expect(page.text).toMatch(/\+18,500\.00/);
    expect(18500).toBeGreaterThan(0.5 * 12333.33);
    const ending = (re: RegExp) => amount(pageOf(DEMO, re).text.match(/Ending balance ([\d,.]+)\s*$/)![1]);
    const checking = ending(/Premier Checking \*\*\*\*2231[\s\S]*08\/01\/2026 - 08\/31\/2026[\s\S]*Ending balance [\d,.]+\s*$/);
    const savings = ending(/Statement Savings \*\*\*\*2245[\s\S]*08\/01\/2026/);
    const verified = checking + savings + 31000;
    expect(verified).toBeGreaterThanOrEqual(l.cashToClose.estimatedCashToClose);
    expect(verified - 18500).toBeLessThan(l.cashToClose.estimatedCashToClose);
  });

  it("the LOS serves no computed income, finding or condition before an agent writes one", async () => {
    const { body } = await get(`/mb-mortgage-los/loan?loanId=${DEMO}`);
    expect(JSON.stringify(body)).not.toMatch(/qualifyingIncome|finding|largeDeposit/i);
    expect((await get(`/mb-mortgage-los/conditions?loanId=${DEMO}`)).body.conditions).toEqual([]);
  });

  it("the HMDA record's loan amount disagrees with the LOS, for the edit check to find", async () => {
    const h = (await get(`/mb-mortgage-los/hmda?loanId=${DEMO}`)).body;
    expect(h.hmdaRecord.loanAmount).not.toBe(LOANS[DEMO].loanAmount);
  });

  it("the calendar places Veterans Day on the Wednesday before the demo closing", () => {
    expect(new Date("2026-11-11T12:00:00Z").getUTCDay()).toBe(3);
    expect(FEDERAL_HOLIDAYS_2026.map((h) => h.date)).toContain("2026-11-11");
    expect(BANK_CLOSURES_2026.CC5).toContain("2026-04-20");
    expect(BANK_CLOSURES_2026.FID).not.toContain("2026-04-20");
  });
});

describe("government monitoring information never leaves the LOS", () => {
  it("no read endpoint returns a demographic value, for any loan", async () => {
    for (const id of Object.keys(LOANS)) {
      const reads = [
        `/mb-mortgage-los/loan?loanId=${id}`, `/mb-mortgage-los/hmda?loanId=${id}`, `/mb-mortgage-los/activity?loanId=${id}`,
        `/mb-loan-documents/package?loanId=${id}`, `/mb-loan-documents/pages?loanId=${id}&fromPage=1&toPage=4`,
      ];
      for (const p of reads) expect(JSON.stringify((await get(p)).body)).not.toMatch(/White|Asian|Black|Hispanic or Latino|\(Male\)|\(Female\)/);
    }
  });

  it("the fair-lending pair is identical through every tool apart from its ids", async () => {
    const strip = (v: unknown) => JSON.stringify(v).replace(/05101|05102/g, "X").replace(/"retrievedAt":"[^"]+"/g, "");
    const a = await get("/mb-mortgage-los/loan?loanId=LN-CC5-26-05101");
    const b = await get("/mb-mortgage-los/loan?loanId=LN-CC5-26-05102");
    expect(strip(a.body)).toBe(strip(b.body));
    for (let from = 1; from <= 41; from += 12) {
      const to = Math.min(41, from + 11);
      expect(strip((await get(`/mb-loan-documents/pages?loanId=LN-CC5-26-05101&fromPage=${from}&toPage=${to}`)).body))
        .toBe(strip((await get(`/mb-loan-documents/pages?loanId=LN-CC5-26-05102&fromPage=${from}&toPage=${to}`)).body));
    }
  });
});

describe("each loan is checked only against its own bank's overlays", () => {
  it("serves the owning bank's overlays and refuses another bank's", async () => {
    const ok = await get(`/mb-guidelines/overlays?loanId=${FID}`);
    expect(ok.body.overlays.every((r: any) => r.bankId === "FID")).toBe(true);
    expect((await get(`/mb-guidelines/overlays?loanId=${FID}&bankId=CC5`)).status).toBe(403);
  });

  it("refuses a condition on a Fidelity loan that cites a Cape Cod 5 overlay", async () => {
    const r = await post("/mb-mortgage-los/conditions/propose", { loanId: FID, conditions: [{ code: "ASSET_SOURCING", timing: "prior_to_doc", description: "Source the 5,600 transfer", borrowerRequest: "Please send the statement for account 8812.", evidenceRefs: ["PKG-01162:p8"], ruleRefs: ["OVL-CC5-4.2(a)"] }] });
    expect(r.status).toBe(422);
    expect(JSON.stringify(r.body.rejected)).toMatch(/Cape Cod 5 overlay/);
  });
});

describe("every finding cites a page and a rule", () => {
  it("rejects a condition without a page citation, and one citing a page that does not exist", async () => {
    const base = { code: "ASSET_SOURCING", timing: "prior_to_doc", description: "Source the deposit", borrowerRequest: "Please explain the deposit.", ruleRefs: ["FNMA-B3-4.2-02"] };
    expect((await post("/mb-mortgage-los/conditions/propose", { loanId: DEMO, conditions: [{ ...base, evidenceRefs: [] }] })).status).toBe(422);
    expect((await post("/mb-mortgage-los/conditions/propose", { loanId: DEMO, conditions: [{ ...base, evidenceRefs: ["PKG-04417:p99"] }] })).status).toBe(422);
  });

  it("withholds an uncited brief finding from the underwriter's view", async () => {
    const depositPage = pageOf(DEMO, /MOBILE DEPOSIT CHECK #1047/).page;
    const r = await post("/mb-mortgage-los/brief", { loanId: DEMO, summary: "Purchase, 80% LTV.", findings: [
      { title: "Large deposit", severity: "high", evidenceRefs: [`PKG-04417 p.${depositPage}`], ruleRefs: ["B3-4.2-02", "OVL-CC5-4.2(a)"] },
      { title: "Borrower seems stretched", severity: "medium", evidenceRefs: [], ruleRefs: [] },
    ] });
    expect(r.body.findingsShown).toBe(1);
    expect(r.body.findingsWithheld).toHaveLength(1);
    const view = (await get(`/mb-mortgage-los/brief?loanId=${DEMO}`)).body.brief;
    expect(view.findings.map((f: any) => f.title)).toEqual(["Large deposit"]);
    expect(view.findings[0].ruleRefs).toEqual(["FNMA-B3-4.2-02", "OVL-CC5-4.2(a)"]);
    expect(view.withheldCount).toBe(1);
  });
});

describe("agents propose, people decide", () => {
  it("refuses an agent role on the underwriter review and an underwriter on the borrower request", async () => {
    expect((await post("/mb-mortgage-los/underwriter-review", { loanId: DEMO, actorId: "x", actorRole: "underwriting_agent", approvalId: "A" })).status).toBe(403);
    expect((await post("/mb-mortgage-los/borrower-request", { loanId: DEMO, ...UW })).status).toBe(403);
  });

  it("checks the income proposal adds up", async () => {
    const r = await post("/mb-mortgage-los/income-calculation", { loanId: DEMO, totalMonthlyQualifyingIncome: 12500, borrowers: [
      { borrowerId: "04417-B1", incomeType: "base", monthlyAmount: 8333.33, evidenceRefs: ["PKG-04417:p6"], ruleRefs: ["FNMA-B3-3.1-02"] },
      { borrowerId: "04417-B2", incomeType: "self_employment", monthlyAmount: 4000, evidenceRefs: ["PKG-04417:p12"], ruleRefs: ["FNMA-B3-3.2-01"] },
    ] });
    expect(r.status).toBe(422);
  });
});

async function proposeDemoConditions() {
  const depositPage = pageOf(DEMO, /MOBILE DEPOSIT CHECK #1047/).page;
  const stubPage = pageOf(DEMO, /Pay date: 09\/25\/2026/).page;
  const floodPage = pageOf(DEMO, /STANDARD FLOOD HAZARD/).page;
  const formPage = pageOf(DEMO, /4506-C IVES/).page;
  const appraisalPage = pageOf(DEMO, /\(Form 1004\) -- Subject/).page;
  const r = await post("/mb-mortgage-los/conditions/propose", { loanId: DEMO, conditions: [
    { code: "ASSET_SOURCING", timing: "prior_to_doc", description: "Source the $18,500 mobile deposit of 08/14", borrowerRequest: "Please tell us where the $18,500 deposit on August 14 came from.", evidenceRefs: [`PKG-04417:p${depositPage}`], ruleRefs: ["FNMA-B3-4.2-02", "OVL-CC5-4.2(a)"] },
    { code: "INCOME_VERIFICATION", timing: "prior_to_doc", description: "YTD base pay is four periods short of the salary", borrowerRequest: "Please explain the lower year-to-date pay.", evidenceRefs: [`PKG-04417:p${stubPage}`], ruleRefs: ["FNMA-B3-3.1-02", "OVL-CC5-3.1(c)"] },
    { code: "FLOOD_INS_EVIDENCE", timing: "prior_to_doc", description: "Zone AE: flood insurance required", borrowerRequest: "Please send your flood insurance declarations page.", evidenceRefs: [`PKG-04417:p${floodPage}`], ruleRefs: ["FNMA-B7-3-06"] },
    { code: "HAZARD_INS_EVIDENCE", timing: "prior_to_doc", description: "Homeowner's insurance", borrowerRequest: "Please send your homeowner's insurance declarations page.", evidenceRefs: [`PKG-04417:p${appraisalPage}`], ruleRefs: ["FNMA-B7-3-01"] },
    { code: "SIGNED_4506C", timing: "prior_to_doc", description: "4506-C is unsigned", borrowerRequest: "Please sign the enclosed Form 4506-C.", evidenceRefs: [`PKG-04417:p${formPage}`], ruleRefs: ["OVL-CC5-7.4"] },
  ] });
  expect(r.status).toBe(200);
  expect(r.body.rejected).toEqual([]);
  return Object.fromEntries(r.body.proposed.map((c: any) => [c.code, c.conditionId]));
}

describe("from proposed conditions to clear-to-close", () => {
  it("clears documentary conditions with matching documents, refuses credit ones, and issues the clear-to-close only after the underwriter decides", async () => {
    const ids = await proposeDemoConditions();
    expect((await post("/mb-mortgage-los/conditions/clear-documentary", { loanId: DEMO, conditionId: ids.FLOOD_INS_EVIDENCE, evidenceRefs: ["PKG-04417:p37"] })).status).toBe(409);

    expect((await post("/mb-mortgage-los/underwriter-review", { loanId: DEMO, confirmedMonthlyQualifyingIncome: 12333.33, ...UW })).status).toBe(200);
    const sent = await post("/mb-mortgage-los/borrower-request", { loanId: DEMO, message: "Please send the following.", ...LO });
    expect(sent.status).toBe(200);
    const uploads = (await get(`/mb-loan-documents/uploads?loanId=${DEMO}`)).body.uploads;
    const doc = (kind: string) => uploads.find((u: any) => u.kind === kind).documentId;
    expect(uploads.map((u: any) => u.kind).sort()).toEqual(["borrower_explanation", "donor_bank_statement", "flood_insurance_declarations", "gift_letter", "hazard_insurance_declarations", "signed_4506c", "written_voe"]);

    // The wrong document does not clear a condition.
    const wrong = await post("/mb-mortgage-los/conditions/clear-documentary", { loanId: DEMO, conditionId: ids.FLOOD_INS_EVIDENCE, evidenceRefs: [`${doc("hazard_insurance_declarations")}:p1`] });
    expect(wrong.status).toBe(422);
    for (const [code, kind] of [["FLOOD_INS_EVIDENCE", "flood_insurance_declarations"], ["HAZARD_INS_EVIDENCE", "hazard_insurance_declarations"], ["SIGNED_4506C", "signed_4506c"]]) {
      const r = await post("/mb-mortgage-los/conditions/clear-documentary", { loanId: DEMO, conditionId: ids[code], evidenceRefs: [`${doc(kind)}:p1`] });
      expect(r.status, code).toBe(200);
    }

    // A credit condition is never an agent's to clear, even with the right document.
    const credit = await post("/mb-mortgage-los/conditions/clear-documentary", { loanId: DEMO, conditionId: ids.ASSET_SOURCING, evidenceRefs: [`${doc("gift_letter")}:p1`] });
    expect(credit.status).toBe(403);
    for (const code of ["ASSET_SOURCING", "INCOME_VERIFICATION"]) {
      expect((await post("/mb-mortgage-los/conditions/route", { loanId: DEMO, conditionId: ids[code], reason: "Credit condition; documents received.", documentRefs: [`${doc(code === "ASSET_SOURCING" ? "gift_letter" : "written_voe")}:p1`] })).status).toBe(200);
    }

    const early = await post("/mb-mortgage-los/clear-to-close", { loanId: DEMO, ...UW });
    expect(early.status).toBe(422);
    expect(early.body.gaps.join(" ")).toMatch(/routed_to_underwriter/);
    expect((await post("/mb-mortgage-los/conditions/underwriter-decision", { loanId: DEMO, conditionIds: ["all_routed"], decision: "clear", rationale: "Gift documented; leave explained by WVOE.", ...UW, approvalId: "APR-UW-2" })).status).toBe(200);
    const ctc = await post("/mb-mortgage-los/clear-to-close", { loanId: DEMO, ...UW, approvalId: "APR-UW-3" });
    expect(ctc.status).toBe(200);
    expect(ctc.body.status).toBe("clear_to_close");
  });

  it("holds Fidelity's narrower clearing schedule", async () => {
    const page = pageOf(FID, /PURCHASE AND SALE AGREEMENT/).page;
    const p = await post("/mb-mortgage-los/conditions/propose", { loanId: FID, conditions: [{ code: "PURCHASE_CONTRACT_ADDENDUM", timing: "prior_to_doc", description: "Extend commitment date", borrowerRequest: "Please send the executed addendum.", evidenceRefs: [`PKG-01162:p${page}`], ruleRefs: ["FNMA-B2-1.1-01"] }] });
    const id = p.body.proposed[0].conditionId;
    await post("/mb-mortgage-los/underwriter-review", { loanId: FID, ...UW });
    await post("/mb-mortgage-los/borrower-request", { loanId: FID, ...LO, actorId: "rachel.ouellette" });
    const up = (await get(`/mb-loan-documents/uploads?loanId=${FID}`)).body.uploads[0].documentId;
    const r = await post("/mb-mortgage-los/conditions/clear-documentary", { loanId: FID, conditionId: id, evidenceRefs: [`${up}:p1`] });
    expect(r.status).toBe(403);
    expect(r.body.error).toMatch(/Fidelity Bank's clearing schedule/);
  });
});

describe("the document repository", () => {
  it("reads at most twelve pages a call and refuses overlapping classification", async () => {
    expect((await get(`/mb-loan-documents/pages?loanId=${DEMO}&fromPage=1&toPage=13`)).status).toBe(422);
    const r = await post("/mb-loan-documents/classification", { loanId: DEMO, documents: [{ type: "URLA", pageFrom: 1, pageTo: 4 }, { type: "PAY_STUB", pageFrom: 4, pageTo: 6 }] });
    expect(r.status).toBe(422);
    const ok = await post("/mb-loan-documents/classification", { loanId: DEMO, documents: [{ type: "URLA", pageFrom: 1, pageTo: 4 }, { type: "PAY_STUB", borrower: "Daniel J. Rourke", pageFrom: 5, pageTo: 6 }] });
    expect(ok.body.documents[1].documentId).toBe("DOC-04417-02");
    expect(ok.body.unclassifiedPages).toHaveLength(LOANS[DEMO].pages.length - 6);
  });
});

describe("the MCP definitions", () => {
  it("point every tool at a route that answers in JSON", async () => {
    const defs = mbMortgageServerDefinitions(base);
    expect(defs.map((d) => d.name)).toEqual(["Mutual Bancorp Mortgage LOS", "Mutual Bancorp Loan Document Repository", "Mutual Bancorp Investor & Bank Guidelines Library"]);
    for (const d of defs) for (const t of d.tools) {
      const url = `${d.baseUrl}${t.endpoint}${t.method === "GET" ? `?loanId=${DEMO}&fromPage=1&toPage=2&documentId=x&ruleId=FNMA-B3-4.2-02` : ""}`;
      const r = await fetch(url, t.method === "GET" ? undefined : { method: t.method, headers: { "Content-Type": "application/json" }, body: "{}" });
      expect(r.headers.get("content-type") ?? "", `${t.name} ${t.endpoint}`).toMatch(/json/);
    }
  });
});
