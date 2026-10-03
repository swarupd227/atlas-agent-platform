/**
 * The simulated Salesforce KYC system behaves like a system of record: it masks
 * what the design says must be masked, does the exact comparisons itself, opens
 * a review case only for a result that needs one, refuses to clear a High result
 * without a reason and evidence, and offers no way to approve, block or pay.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import express from "express";
import type { Server } from "http";
import kycRouter, { teamsRouter, resetKycWorld } from "../server/mock-mcp/365-kyc";
import { CROSSWALK } from "../server/mock-mcp/365-data-lake-data";

let server: Server;
let base = "";

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/kyc", kycRouter);
  app.use("/teams", teamsRouter);
  await new Promise<void>((resolve) => { server = app.listen(0, () => resolve()); });
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
beforeEach(() => { resetKycWorld(); CROSSWALK.length = 0; });

const get = async (path: string) => {
  const r = await fetch(base + path);
  return { status: r.status, body: await r.json() };
};
const post = async (path: string, body: unknown) => {
  const r = await fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
};
const signalNames = async (formId: string) => (await get(`/kyc/match-signals?form_id=${formId}`)).body.signals.map((s: any) => s.signal) as string[];

describe("masking", () => {
  it("returns tax IDs and bank accounts as last four only, never the full value", async () => {
    const { body } = await get("/kyc/kyc-form?form_id=KYC-1003");
    expect(body.taxIdMasked).toBe("***6779");
    expect(body.bankAccountMasked).toBe("****0088");
    const text = JSON.stringify(body);
    expect(text).not.toContain("31-5566779");
    expect(text).not.toContain("000777440088");
  });

  it("masks a tax ID printed inside a document's text too", async () => {
    const { body } = await get("/kyc/kyc-form?form_id=KYC-1006");
    expect(JSON.stringify(body)).not.toContain("56-3344999");
    expect(body.documents[0].extractedText).toContain("***4999");
  });

  it("returns only verdicts and masked values from the exact-match check", async () => {
    const { body } = await get("/kyc/match-signals?form_id=KYC-1003");
    const text = JSON.stringify(body);
    expect(text).not.toContain("000777440088");
    expect(text).not.toContain("31-5566779");
    expect(body.signals.find((s: any) => s.signal === "bank_account_shared").matches[0]).toMatchObject({ id: "KYC-1004", masked: "****0088" });
  });
});

describe("the planted scenarios", () => {
  it("a clean form raises no signal", async () => {
    expect(await signalNames("KYC-1001")).toEqual([]);
  });

  it("the Cantaloupe twin of a 365 customer shares the tax ID, address and phone", async () => {
    const names = await signalNames("KYC-1002");
    expect(names).toEqual(expect.arrayContaining(["tax_id_shared", "address_shared", "phone_shared"]));
    expect(names).not.toContain("same_master_key_other_brand");
  });

  it("reads UC02's published key, so a keyed twin is reported as the same customer", async () => {
    CROSSWALK.push(
      { masterKey: "MCK-SFA-1001", recordId: "SFA-1001", source: "365_salesforce", rule: "steward_decision", decider: "admin", decidedAt: "", reason: "" },
      { masterKey: "MCK-SFA-1001", recordId: "CNT-2001", source: "cantaloupe_salesforce", rule: "steward_decision", decider: "admin", decidedAt: "", reason: "" },
    );
    const { body } = await get("/kyc/match-signals?form_id=KYC-1002");
    expect(body.masterKey).toBe("MCK-SFA-1001");
    expect(body.signals.find((s: any) => s.signal === "same_master_key_other_brand").matches[0]).toMatchObject({ id: "SFA-1001", brand: "365" });
  });

  it("the high-risk bank update raises the bank, device, failure and bank-change signals", async () => {
    expect(await signalNames("KYC-1003")).toEqual(expect.arrayContaining(["bank_account_shared", "recent_bank_change", "many_devices_new_account", "repeated_failures"]));
  });

  it("a document that prints a different tax ID is flagged as a mismatch", async () => {
    expect(await signalNames("KYC-1006")).toContain("document_value_mismatch");
  });
});

describe("documents expiring", () => {
  it("lists what expires in the window, soonest first, with the owner", async () => {
    const { body } = await get("/kyc/documents-expiring?within_days=30");
    expect(body.rows.map((r: any) => r.formId)).toEqual(["KYC-1004", "KYC-1002"]);
    expect(body.rows[0]).toMatchObject({ account: "Great Lakes Snack Solutions LLC", daysLeft: 12 });
    expect(body.rows[0].owner).toContain("@");
  });
});

describe("review cases and risk status", () => {
  it("opens a case for a High result and files it with Compliance", async () => {
    const { status, body } = await post("/kyc/review-case", { formId: "KYC-1003", riskResult: "High", reasons: ["Bank account shared"], suggestedNextStep: "Call the customer" });
    expect(status).toBe(200);
    expect(body.case).toMatchObject({ caseId: "CASE-0001", assignedQueue: "Compliance" });
  });

  it("refuses a case for a Low result, and says why", async () => {
    const { status, body } = await post("/kyc/review-case", { formId: "KYC-1001", riskResult: "Low", reasons: ["fine"], suggestedNextStep: "none" });
    expect(status).toBe(409);
    expect(body.error).toMatch(/Medium or High/);
  });

  it("does not open the same case twice", async () => {
    const args = { formId: "KYC-1002", riskResult: "Medium", reasons: ["Shared tax ID"], suggestedNextStep: "Confirm the link" };
    await post("/kyc/review-case", args);
    const again = await post("/kyc/review-case", args);
    expect(again.body).toMatchObject({ created: false, alreadyOpen: true });
  });

  it("lets a Low result proceed but never a Medium or High one", async () => {
    expect((await post("/kyc/risk-status", { formId: "KYC-1001", riskResult: "Low", status: "Proceed", decidedBy: "system" })).status).toBe(200);
    expect((await post("/kyc/risk-status", { formId: "KYC-1003", riskResult: "High", status: "Proceed", decidedBy: "system" })).status).toBe(409);
  });

  it("treats clearing a High result as an override that needs a reason and evidence", async () => {
    const bare = await post("/kyc/risk-status", { formId: "KYC-1003", riskResult: "High", status: "Cleared by reviewer", decidedBy: "compliance.lee" });
    expect(bare.status).toBe(409);
    const ok = await post("/kyc/risk-status", { formId: "KYC-1003", riskResult: "High", status: "Cleared by reviewer", decidedBy: "compliance.lee", overrideReason: "Customer verified by phone", overrideEvidence: "Call note 2026-10-04" });
    expect(ok.status).toBe(200);
    expect(ok.body.status).toMatchObject({ overrideReason: "Customer verified by phone" });
  });

  it("writes every change and every refusal to the audit", async () => {
    await post("/kyc/risk-status", { formId: "KYC-1003", riskResult: "High", status: "Proceed", decidedBy: "system" });
    await post("/kyc/risk-status", { formId: "KYC-1001", riskResult: "Low", status: "Proceed", decidedBy: "system" });
    const { body } = await get("/kyc/audit");
    expect(body.events.map((e: any) => e.action)).toEqual(["write_refused", "risk_status_written"]);
  });

  it("offers no way to approve KYC, block an account, change a bank or activate payments", async () => {
    for (const p of ["/kyc/approve", "/kyc/block", "/kyc/bank-update", "/kyc/activate-payments"]) {
      const r = await fetch(base + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      expect(r.status).toBe(404);
    }
    const bad = await post("/kyc/risk-status", { formId: "KYC-1001", riskResult: "Low", status: "Approved", decidedBy: "system" });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toMatch(/stay with people/);
  });
});

describe("Teams", () => {
  it("sends a message and lists it", async () => {
    await post("/teams/message", { channel: "KYC Alerts", to: "onboarding.kim@365retail.example", text: "W-9 expires in 12 days" });
    const { body } = await get("/teams/messages");
    expect(body.count).toBe(1);
    expect(body.messages[0]).toMatchObject({ channel: "KYC Alerts" });
  });
});
