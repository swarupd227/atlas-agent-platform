/**
 * The five Workers' Compensation fixture systems hold the design specification's
 * acceptance figures exactly, and enforce what the specification says a person,
 * a gate or a system of record must enforce: payroll is conserved, the current
 * mod is verified before quote-ready rating, the forecast never prices, a stale
 * write is refused, agents cannot approve, a duplicate command makes one
 * operation, and only a confirmed bind is Bound.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import express from "express";
import type { Server } from "http";
import workbench from "../server/mock-mcp/wc-workbench";
import classBureau from "../server/mock-mcp/wc-class-bureau";
import rating from "../server/mock-mcp/insurity-wc-rating";
import pas from "../server/mock-mcp/insurity-wc-pas";
import bordereau from "../server/mock-mcp/wc-bordereau";
import { resetWcState } from "../server/mock-mcp/wc-state";
import { wcServerDefinitions } from "../server/mock-mcp/wc-register";

let server: Server;
let base = "";
beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/mock/wc-workbench", workbench);
  app.use("/api/mock/wc-class-bureau", classBureau);
  app.use("/api/mock/insurity-wc-rating", rating);
  app.use("/api/mock/insurity-wc-pas", pas);
  app.use("/api/mock/wc-bordereau", bordereau);
  await new Promise<void>((resolve) => { server = app.listen(0, () => resolve()); });
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}/api/mock`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
beforeEach(() => resetWcState());

const get = async (p: string) => { const r = await fetch(base + p); return { status: r.status, body: await r.json() as any }; };
const post = async (p: string, body: unknown) => {
  const r = await fetch(base + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() as any };
};

const APEX = "SUB-2026-4471";
const UW = { actorId: "maria.lopez", actorRole: "underwriter", approvalId: "APR-UW-1" };
const SCHED_35 = { percent: 3.5, criteria: ["safety_organization"], rationale: "Safety program is informal: no designated coordinator and inspections are ad hoc.", approvedBy: "maria.lopez", authorityRole: "underwriter" };

const classFinding = {
  findingId: "FND-4471-CLS-01", producerNodeId: "a03_class_verification", category: "classification", status: "proposed", severity: "high",
  summary: "Four FL project managers ($320,000) spend ~60% of time supervising on active sites with no manual labor; 8810 does not describe that exposure and 5606 prerequisites appear met.",
  evidenceRefs: ["DOC-4471-SUPP p.2, Q7", "DOC-4471-PAYROLL row 4"], ruleRefs: ["CLS-8810-R2", "CLS-5606-R1", "CLS-5606-R2"],
  proposedAction: { type: "reallocate_payroll", fromAllocationId: "ALC-4471-01", fromClassCode: "8810", toClassCode: "5606", payroll: 320000 },
  uncertainty: "Duty split is self-reported by the insured.", blockingStage: "rating", ownerRole: "underwriter",
};

async function payrollBy(state: string, cls: string) {
  const { body } = await get(`/wc-workbench/submission?submissionId=${APEX}`);
  return body.exposure.payrollByStateAndClass[`${state} ${cls}`] ?? 0;
}

/** Drives Apex to a signed-off, quotable state on the accept path; returns the rating id and revision. */
async function apexToSignoff(): Promise<{ ratingId: string; revision: number }> {
  expect((await post("/wc-workbench/findings", { submissionId: APEX, inputRevision: 1, findings: [classFinding] })).status).toBe(200);
  expect((await post("/wc-workbench/disposition", { submissionId: APEX, expectedRevision: 1, action: "accept", findingIds: "FND-4471-CLS-01", ...UW })).status).toBe(200);
  expect((await post("/wc-workbench/verify-mod", { submissionId: APEX, worksheetId: "MOD-4471-2026", ...UW })).status).toBe(200);
  const rated = await post("/insurity-wc-rating/rate-quote", { submissionId: APEX, revision: 2, scheduleAdjustment: SCHED_35 });
  expect(rated.status).toBe(200);
  expect((await post("/wc-workbench/authority-decision", { submissionId: APEX, revision: 2, outcome: "referral_required", ruleRefs: "AUTH-FCST-01" })).status).toBe(200);
  expect((await post("/wc-workbench/referral", { submissionId: APEX, revision: 2, outcome: "approved", actorId: "carrier.reviewer", actorRole: "carrier_referral_approver", approvalId: "APR-REF-1" })).status).toBe(200);
  const sections = { riskSummary: "x", operationsExposure: "x", classRationale: "x", historicalLosses: "x", ratingAssumptions: "x", unresolvedSubjectivities: "x", authorityReferralStatus: "x", evidenceProvenance: "x" };
  expect((await post("/wc-workbench/memo", { submissionId: APEX, basisRevision: 2, ratingId: rated.body.ratingId, sections })).status).toBe(200);
  expect((await post("/wc-workbench/memo/approve", { submissionId: APEX, version: 1, ...UW, approvalId: "APR-MEMO-1" })).status).toBe(200);
  expect((await post("/wc-workbench/signoff", { submissionId: APEX, revision: 2, ratingId: rated.body.ratingId, ...UW, approvalId: "APR-SIGN-1" })).status).toBe(200);
  return { ratingId: rated.body.ratingId, revision: 2 };
}

describe("every registered tool reaches a route", () => {
  it("maps each tool's method and endpoint to a handler that answers JSON", async () => {
    for (const s of wcServerDefinitions("http://x")) {
      const mount = new URL(s.baseUrl).pathname.replace("/api/mock", "");
      for (const t of s.tools) {
        const r = await fetch(base + mount + t.endpoint, { method: t.method, headers: { "Content-Type": "application/json" }, ...(t.method === "POST" ? { body: "{}" } : {}) });
        expect(r.headers.get("content-type") || "", `${s.name} ${t.name}`).toContain("application/json");
      }
    }
  });
});

describe("AT01 intake", () => {
  it("Apex reconciles to 4,200,000 with every document citable", async () => {
    const { body } = await get(`/wc-workbench/submission?submissionId=${APEX}`);
    expect(body.mode).toBe("fixture");
    expect(body.exposure.acordStatedPayroll).toBe(4_200_000);
    expect(body.exposure.scheduledPayroll).toBe(4_200_000);
    expect(body.exposure.payrollReconciles).toBe(true);
    const docs = await get(`/wc-workbench/documents?submissionId=${APEX}`);
    expect(docs.body.documents.map((d: any) => d.type)).toEqual(expect.arrayContaining(["acord_130", "payroll_schedule", "loss_run", "experience_mod_worksheet", "supplemental_application", "subcontractor_roster_and_cois"]));
    const payroll = await get("/wc-workbench/document?documentId=DOC-4471-PAYROLL");
    expect(payroll.body.content.rows.find((r: any) => r.allocationId === "ALC-4471-01")).toMatchObject({ row: 4, state: "FL", classCode: "8810", payroll: 320000 });
  });

  it("Ridgeline's missing 250,000 blocks rating readiness instead of being invented", async () => {
    const { body } = await get("/wc-workbench/submission?submissionId=SUB-2026-4473");
    expect(body.exposure.scheduledPayroll).toBe(1_750_000);
    expect(body.exposure.payrollReconciles).toBe(false);
    expect(body.exposure.unscheduledAcordRows).toEqual([{ state: "NC", classCode: "5022", payroll: 250000 }]);
  });
});

describe("AT02 / AT03 class disposition", () => {
  it("accepting moves exactly 320,000: FL 8810 330,000, FL 5606 320,000, total unchanged", async () => {
    await post("/wc-workbench/findings", { submissionId: APEX, inputRevision: 1, findings: [classFinding] });
    const r = await post("/wc-workbench/disposition", { submissionId: APEX, expectedRevision: 1, action: "accept", findingIds: "FND-4471-CLS-01", ...UW });
    expect(r.body.revision).toBe(2);
    expect(r.body.payrollTotal).toBe(4_200_000);
    expect(await payrollBy("FL", "8810")).toBe(330_000);
    expect(await payrollBy("FL", "5606")).toBe(320_000);
    expect(r.body.classSubjectivity).toBe("resolved");
  });

  it("an override needs a reason, leaves the allocation alone, and keeps the mandatory rule unresolved", async () => {
    await post("/wc-workbench/findings", { submissionId: APEX, inputRevision: 1, findings: [classFinding] });
    expect((await post("/wc-workbench/disposition", { submissionId: APEX, expectedRevision: 1, action: "override", findingIds: "FND-4471-CLS-01", ...UW })).status).toBe(422);
    const r = await post("/wc-workbench/disposition", { submissionId: APEX, expectedRevision: 1, action: "override", findingIds: "FND-4471-CLS-01", rationale: "Broker states the PMs' site visits are walk-throughs.", ...UW });
    expect(r.status).toBe(200);
    expect(r.body.revision).toBe(1);
    expect(await payrollBy("FL", "8810")).toBe(650_000);
    expect(r.body.unresolvedClassRules.map((u: any) => u.ruleId)).toEqual(["CLS-8810-R2"]);
    expect((await post("/wc-workbench/authority-decision", { submissionId: APEX, revision: 1, outcome: "authorized" })).status).toBe(409);
  });

  it("refuses a stale write and a producer that tries to set its own finding to accepted", async () => {
    expect((await post("/wc-workbench/findings", { submissionId: APEX, inputRevision: 0, findings: [classFinding] })).status).toBe(409);
    const bad = await post("/wc-workbench/findings", { submissionId: APEX, inputRevision: 1, findings: [{ ...classFinding, status: "accepted" }] });
    expect(bad.status).toBe(422);
    expect(JSON.stringify(bad.body.problems)).toContain("cannot be set by a producer");
  });
});

describe("AT04 historical losses", () => {
  it("WC-8902 sits on the prior policy, open 380 days against a 245-day benchmark (~55.1% longer), with no reserve history", async () => {
    const c = await get("/wc-class-bureau/claim-updates?priorPolicyRef=POL-2025-3318-WC&claimRef=WC-8902");
    const claim = c.body.claims[0];
    expect(claim).toMatchObject({ claimRef: "WC-8902", priorPolicyRef: "POL-2025-3318-WC", incurred: 84000, paid: 32000, outstanding: 52000, attorneyRepresented: true, daysOpenAtValuation: 380 });
    expect(claim.reserveHistory).toBeNull();
    const bm = await get("/wc-class-bureau/duration-benchmark?cohort=construction:indemnity:lost_time");
    expect(bm.body.medianOpenDays).toBe(245);
    expect(Math.round((380 / 245 - 1) * 1000) / 10).toBe(55.1);
    expect((await get("/wc-class-bureau/duration-benchmark?cohort=retail:medical")).body.status).toBe("unavailable");
  });

  it("keeps the broker's earlier valuation of the same claim beside the loss run's", async () => {
    const acord = await get("/wc-workbench/document?documentId=DOC-4471-ACORD130");
    expect(acord.body.content.priorCarrierLossSummary).toEqual([expect.objectContaining({ claimRef: "WC-8902", incurred: 79500, valuationDate: "2026-06-30" })]);
  });
});

describe("AT05 / AT06 / AT07 rating", () => {
  it("blocks quote-ready rating on an unverified mod, disputes a wrong-period worksheet, and refuses a mod passed in", async () => {
    expect((await post("/insurity-wc-rating/rate-quote", { submissionId: APEX, revision: 1 })).status).toBe(422);
    const prelim = await post("/insurity-wc-rating/rate-quote", { submissionId: APEX, revision: 1, preliminary: true });
    expect(prelim.body.quotable).toBe(false);
    const ridge = await post("/wc-workbench/verify-mod", { submissionId: "SUB-2026-4473", ...UW });
    expect(ridge.status).toBe(422);
    expect(ridge.body.status).toBe("disputed");
    expect((await post("/insurity-wc-rating/rate-quote", { submissionId: APEX, revision: 1, forecastMod: 1.24 })).status).toBe(422);
  });

  it("prices the retained allocation at 165,657.96 and the accepted one at 186,225.48 at a 3.5% schedule debit", async () => {
    await post("/wc-workbench/verify-mod", { submissionId: APEX, ...UW });
    const retained = await post("/insurity-wc-rating/rate-quote", { submissionId: APEX, revision: 1, scheduleAdjustment: SCHED_35 });
    expect(retained.body).toMatchObject({ subjectPremium: 148200, modifiedPremium: 160056, totalEstimatedAnnualPremium: 165657.96, quotable: true, forecastUsed: false });
    expect(retained.body.currentMod.value).toBe(1.08);
    await post("/wc-workbench/findings", { submissionId: APEX, inputRevision: 1, findings: [classFinding] });
    await post("/wc-workbench/disposition", { submissionId: APEX, expectedRevision: 1, action: "accept", findingIds: "FND-4471-CLS-01", ...UW });
    expect((await post("/insurity-wc-rating/rate-quote", { submissionId: APEX, revision: 1, scheduleAdjustment: SCHED_35 })).status).toBe(409);
    const accepted = await post("/insurity-wc-rating/rate-quote", { submissionId: APEX, revision: 2, scheduleAdjustment: SCHED_35 });
    expect(accepted.body).toMatchObject({ subjectPremium: 166600, modifiedPremium: 179928, totalEstimatedAnnualPremium: 186225.48 });
  });

  it("rejects a schedule adjustment with no rationale, outside the plan, beyond authority, or relying on height or COIs", async () => {
    await post("/wc-workbench/verify-mod", { submissionId: APEX, ...UW });
    const cases = [
      { ...SCHED_35, rationale: "" },
      { ...SCHED_35, percent: 30 },
      { ...SCHED_35, percent: 12 },
      { ...SCHED_35, rationale: "Height exposure on four-story projects." },
      { ...SCHED_35, rationale: "Two subcontractor COIs are missing." },
      { ...SCHED_35, criteria: ["vibes"] },
    ];
    for (const scheduleAdjustment of cases) {
      expect((await post("/insurity-wc-rating/rate-quote", { submissionId: APEX, revision: 1, scheduleAdjustment })).status).toBe(422);
    }
  });
});

describe("AT08 forecast and authority inputs", () => {
  it("1.24 exceeds the threshold, exactly 1.15 does not, and an unavailable forecast says so", async () => {
    expect((await post("/insurity-wc-rating/forecast-mod", { submissionId: APEX })).body).toMatchObject({ value: 1.24, exceedsThreshold: true, status: "available" });
    expect((await post("/insurity-wc-rating/forecast-mod", { submissionId: "SUB-2026-4472" })).body).toMatchObject({ value: 1.15, exceedsThreshold: false });
    const none = await post("/insurity-wc-rating/forecast-mod", { submissionId: "SUB-2026-4473" });
    expect(none.body.status).toBe("unavailable");
    expect(none.body.consequence).toContain("never a pass");
  });
});

describe("AT09 memo versions", () => {
  it("a memo based on an older revision cannot be approved", async () => {
    const sections = { riskSummary: "x", operationsExposure: "x", classRationale: "x", historicalLosses: "x", ratingAssumptions: "x", unresolvedSubjectivities: "x", authorityReferralStatus: "x", evidenceProvenance: "x" };
    await post("/wc-workbench/memo", { submissionId: APEX, basisRevision: 1, sections });
    await post("/wc-workbench/findings", { submissionId: APEX, inputRevision: 1, findings: [classFinding] });
    await post("/wc-workbench/disposition", { submissionId: APEX, expectedRevision: 1, action: "accept", findingIds: "FND-4471-CLS-01", ...UW });
    expect((await post("/wc-workbench/memo/approve", { submissionId: APEX, version: 1, ...UW })).status).toBe(409);
  });
});

describe("AT10-AT13 write-back and bind", () => {
  it("quotes once per key, keeps bind blocked by open pre-bind subjectivities, and binds only when the PAS confirms", async () => {
    const { ratingId } = await apexToSignoff();
    const first = await post("/insurity-wc-pas/quote/upsert", { submissionId: APEX, revision: 2, ratingId, idempotencyKey: "quote-4471-r2" });
    expect(first.status).toBe(200);
    expect(first.body.premium).toBe(186225.48);
    const again = await post("/insurity-wc-pas/quote/upsert", { submissionId: APEX, revision: 2, ratingId, idempotencyKey: "quote-4471-r2" });
    expect(again.body).toMatchObject({ duplicate: true, operationId: first.body.operationId, externalQuoteRef: first.body.externalQuoteRef });
    expect((await post("/insurity-wc-pas/quote/upsert", { submissionId: APEX, revision: 2, ratingId: "RTG-OTHER", idempotencyKey: "quote-4471-r2" })).status).toBe(409);

    const ref = first.body.externalQuoteRef;
    const blocked = await post("/insurity-wc-pas/bind/request", { externalQuoteRef: ref, approvalRefs: "APR-BIND-1", requestedBy: "maria.lopez", idempotencyKey: "bind-4471" });
    expect(blocked.status).toBe(422);
    expect(blocked.body.gaps.join(" ")).toMatch(/SUBJ-COI.*SUBJ-FALL.*SUBJ-CLAIM/s);
    expect((await get(`/insurity-wc-pas/quote?externalQuoteRef=${ref}`)).body.status).toBe("quoted");

    const docs = await post("/wc-workbench/pre-bind-documents/request", { submissionId: APEX });
    const ids = docs.body.documentsSupplied.map((d: any) => d.documentId);
    expect(ids).toEqual(["DOC-4471-COI-UPD", "DOC-4471-FALLPLAN", "DOC-4471-CLAIMUPD"]);
    expect((await get(`/wc-workbench/subjectivities?submissionId=${APEX}`)).body.openPreBind).toEqual(["SUBJ-COI", "SUBJ-FALL", "SUBJ-CLAIM"]);
    expect((await post("/wc-workbench/subjectivity/resolve", { submissionId: APEX, subjectivityIds: "SUBJ-FALL", approvedWaiverRef: "W-1", ...UW })).status).toBe(422);
    expect((await post("/wc-workbench/subjectivity/resolve", { submissionId: APEX, subjectivityIds: "SUBJ-COI,SUBJ-FALL,SUBJ-CLAIM", evidenceRefs: ids.join(","), ...UW, approvalId: "APR-PREBIND-1" })).status).toBe(200);

    const bound = await post("/insurity-wc-pas/bind/request", { externalQuoteRef: ref, approvalRefs: "APR-BIND-1", requestedBy: "maria.lopez", idempotencyKey: "bind-4471" });
    expect(bound.body).toMatchObject({ status: "bound", policyNumber: "POL-2026-4471-WC" });
    expect(bound.body.binderRef).toMatch(/^BND-4471-/);
  });

  it("a timeout after the PAS committed reconciles without a duplicate quote", async () => {
    const { ratingId } = await apexToSignoff();
    const t = await post("/insurity-wc-pas/quote/upsert", { submissionId: APEX, revision: 2, ratingId, idempotencyKey: "quote-4471-t", fixtureFault: "timeout_after_commit" });
    expect(t.status).toBe(504);
    const status = await get(`/insurity-wc-pas/operation-status?operationId=${t.body.operationId}`);
    expect(status.body.operations[0].status).toBe("completed");
    const retry = await post("/insurity-wc-pas/quote/upsert", { submissionId: APEX, revision: 2, ratingId, idempotencyKey: "quote-4471-t", fixtureFault: "timeout_after_commit" });
    expect(retry.body.duplicate).toBe(true);
  });

  it("refuses a write-back with gaps named, and a quote before sign-off", async () => {
    const r = await post("/insurity-wc-pas/quote/upsert", { submissionId: APEX, revision: 1, ratingId: "RTG-NONE", idempotencyKey: "q-x" });
    expect(r.status).toBe(422);
    expect(r.body.gaps.join(" ")).toContain("No underwriter sign-off");
  });
});

describe("AT11 roles", () => {
  it("an agent role cannot decide, and a decision without an approval id is refused", async () => {
    await post("/wc-workbench/findings", { submissionId: APEX, inputRevision: 1, findings: [classFinding] });
    expect((await post("/wc-workbench/disposition", { submissionId: APEX, expectedRevision: 1, action: "accept", findingIds: "FND-4471-CLS-01", actorId: "a03", actorRole: "class_verification_agent", approvalId: "x" })).status).toBe(403);
    expect((await post("/wc-workbench/disposition", { submissionId: APEX, expectedRevision: 1, action: "accept", findingIds: "FND-4471-CLS-01", actorId: "maria.lopez", actorRole: "underwriter" })).status).toBe(422);
    expect((await post("/wc-workbench/referral", { submissionId: APEX, revision: 1, outcome: "approved", ...UW })).status).toBe(403);
  });
});

describe("AT14 reporting", () => {
  it("a draft preview is not queued, only a bound transaction enters the queue once, and commission reconciles", async () => {
    const { ratingId } = await apexToSignoff();
    const prev = await post("/wc-bordereau/preview", { submissionId: APEX });
    expect(prev.body.status).toBe("draft_preview");
    expect((await post("/wc-bordereau/submit", { submissionIds: APEX })).status).toBe(422);
    const q = await post("/insurity-wc-pas/quote/upsert", { submissionId: APEX, revision: 2, ratingId, idempotencyKey: "q-r" });
    const docs = await post("/wc-workbench/pre-bind-documents/request", { submissionId: APEX });
    await post("/wc-workbench/subjectivity/resolve", { submissionId: APEX, subjectivityIds: "SUBJ-COI,SUBJ-FALL,SUBJ-CLAIM", evidenceRefs: docs.body.documentsSupplied.map((d: any) => d.documentId).join(","), ...UW });
    await post("/insurity-wc-pas/bind/request", { externalQuoteRef: q.body.externalQuoteRef, approvalRefs: "APR-BIND-1", requestedBy: "maria.lopez", idempotencyKey: "b-r" });
    const sub = await post("/wc-bordereau/submit", { submissionIds: APEX });
    expect(sub.body.status).toBe("queued");
    expect(sub.body.totals).toEqual({ grossPremium: 186225.48, commission: 22347.06, netPremium: 163878.42 });
    expect((await post("/wc-bordereau/submit", { submissionIds: APEX })).status).toBe(422);
    const sent = await post("/wc-bordereau/transmit", { reportId: sub.body.reportId });
    expect(sent.body).toMatchObject({ status: "acknowledged" });
    expect(sent.body.history.map((h: any) => h.status)).toEqual(["queued", "sent", "acknowledged"]);
  });
});
