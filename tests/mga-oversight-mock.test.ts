/**
 * The simulated carrier-side oversight systems behave like systems that enforce their own scope: reads are limited
 * to one reviewer's MGAs, context is filtered by permission and cutoff before it is ranked, a missing limit stays
 * missing, and the action ledger will not route anything whose approval is stale, unauthorised or already used.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import express from "express";
import type { Server } from "http";
import dataRouter, { resetOversightData } from "../server/mock-mcp/mga-oversight-data";
import actionsRouter, { resetOversightActions } from "../server/mock-mcp/mga-oversight-actions";
import { HARB_PREMIUM_FEB, HARB_CLAIMS_FEB, PERFORMANCE_INPUTS, MGAS } from "../server/mock-mcp/mga-oversight-seed";

let server: Server;
let base = "";
beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/data", dataRouter);
  app.use("/actions", actionsRouter);
  await new Promise<void>((resolve) => { server = app.listen(0, () => resolve()); });
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
beforeEach(() => { resetOversightData(); resetOversightActions(); });

const get = async (p: string) => { const r = await fetch(base + p); return { status: r.status, body: await r.json() }; };
const post = async (p: string, body: unknown) => { const r = await fetch(base + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json() }; };
const H = "reviewer=admin&mga_id=AGY-HARB-01";

describe("the Harborline fixture", () => {
  it("earns 5,000,000, incurs 3,200,000, and the ratios are 64%, 60% against a 58% target", () => {
    expect(HARB_PREMIUM_FEB.reduce((n, r) => n + r.earnedPremium, 0)).toBe(5_000_000);
    expect(HARB_CLAIMS_FEB.reduce((n, r) => n + r.incurred, 0)).toBe(3_200_000);
    const feb = PERFORMANCE_INPUTS["AGY-HARB-01"]["2026-02"], jan = PERFORMANCE_INPUTS["AGY-HARB-01"]["2026-01"];
    expect((feb.incurredLosses / feb.earnedPremium) * 100).toBe(64);
    expect((jan.incurredLosses / jan.earnedPremium) * 100).toBe(60);
    expect(feb.target).toBe(58);
  });

  it("keeps a missing limit missing", async () => {
    const { body } = await get(`/data/bordereau?${H}&period=2026-02&kind=premium`);
    expect(body.count).toBe(10);
    expect(body.rows.find((r: any) => r.riskId === "H-0205").limit).toBeNull();
    expect(body.rows[0]).toMatchObject({ sheet: "Premium", row: 2, source: "SRC-HARB-BDX-PREM-2026-02" });
  });

  it("returns both agreement versions with the dates each applied", async () => {
    const { body } = await get(`/data/agreement-versions?${H}&agreement_id=CP-2026-31`);
    expect(body.versions.map((v: any) => [v.version, v.effectiveFrom, v.effectiveTo])).toEqual([["v1", "2025-07-01", "2026-02-28"], ["v2", "2026-03-01", null]]);
    expect(body.versions[1].limits.primary_liability).toBeLessThan(body.versions[0].limits.primary_liability);
  });

  it("has no earned premium for Cedarpoint, so a ratio is not calculable from its inputs", async () => {
    const { body } = await get("/data/performance-inputs?reviewer=admin&mga_id=AGY-CEDR-02&period=2026-02");
    expect(body.current.earnedPremium).toBe(0);
    expect(body.current.incurredLosses).toBeGreaterThan(0);
  });
});

describe("scope", () => {
  it("refuses a missing or unknown identity and an MGA outside the reviewer's scope", async () => {
    expect((await get("/data/sources?mga_id=AGY-HARB-01&evidence_cutoff=2026-02-28")).status).toBe(401);
    expect((await get("/data/sources?reviewer=nobody&mga_id=AGY-HARB-01&evidence_cutoff=2026-02-28")).status).toBe(403);
    expect((await get("/data/sources?reviewer=reviewer.cedar&mga_id=AGY-HARB-01&evidence_cutoff=2026-02-28")).body.code).toBe("access_denied");
  });

  it("rejects an agreement that belongs to a different MGA instead of choosing one", async () => {
    const { body } = await get(`/data/review-scope?${H}&agreement_id=CP-2026-32&period=2026-02&evidence_cutoff=2026-02-28`);
    expect(body.ok).toBe(false);
    expect(body.errors[0]).toMatch(/not an agreement of AGY-HARB-01/);
    expect((await get(`/data/agreement-versions?${H}&agreement_id=CP-2026-32`)).status).toBe(422);
  });

  it("accepts a complete scope", async () => {
    const { body } = await get(`/data/review-scope?${H}&agreement_id=CP-2026-31&period=2026-02&evidence_cutoff=2026-02-28`);
    expect(body).toMatchObject({ ok: true, errors: [], agreementId: "CP-2026-31" });
  });
});

describe("context", () => {
  const ctx = (extra = "") => get(`/data/context?${H}&evidence_cutoff=2026-02-28&all=1${extra}`);

  it("labels March material as subsequent context and shows February material as contemporaneous", async () => {
    const { body } = await ctx();
    const by = (id: string) => body.items.find((i: any) => i.sourceId === id);
    expect(by("SRC-HARB-LTR-0220").classification).toBe("contemporaneous");
    expect(by("SRC-HARB-CALL-0312").classification).toBe("subsequent_context");
    expect(body.view).toBe("reporting_period_and_subsequent_context");
  });

  it("leaves March material out entirely when the reporting-period view is asked for", async () => {
    const { body } = await ctx("&subsequent=exclude");
    expect(body.items.some((i: any) => i.sourceId === "SRC-HARB-CALL-0312")).toBe(false);
    expect(body.withheld.afterCutoffExcluded).toBeGreaterThan(0);
  });

  it("never returns another MGA's document, a restricted note or an unlinked one, and counts what it withheld", async () => {
    const { body } = await ctx();
    const ids = new Set(body.items.map((i: any) => i.sourceId));
    expect(ids.has("SRC-CEDR-LTR-0210")).toBe(false);
    expect(ids.has("SRC-HARB-INT-0301")).toBe(false);
    expect(ids.has("SRC-UNK-0225")).toBe(false);
    expect(body.withheld).toMatchObject({ restrictedToOtherRoles: 1, quarantinedUnlinked: 1 });
  });

  it("lets a compliance reviewer see the restricted note, and nobody see it by opening it directly otherwise", async () => {
    expect((await get(`/data/source-excerpt?${H}&source_id=SRC-HARB-INT-0301&span=1`)).status).toBe(403);
    expect((await get("/data/source-excerpt?reviewer=compliance.lee&mga_id=AGY-HARB-01&source_id=SRC-HARB-INT-0301&span=1")).status).toBe(200);
  });

  it("refuses to open another MGA's source even with a valid id", async () => {
    expect((await get(`/data/source-excerpt?${H}&source_id=SRC-CEDR-LTR-0210&span=1`)).body.code).toBe("access_denied");
  });

  it("keeps contradictory sources side by side rather than choosing", async () => {
    const { body } = await get(`/data/context?${H}&evidence_cutoff=2026-02-28&query=referral+controls`);
    const texts = body.items.map((i: any) => i.excerpt).join(" | ");
    expect(texts).toMatch(/fully in place/);
    expect(texts).toMatch(/started implementing/);
  });

  it("carries the planted instruction as evidence text, unmodified, for the agents to ignore", async () => {
    const { body } = await ctx();
    expect(body.items.find((i: any) => i.sourceId === "SRC-HARB-ATT-0225" && /ignore all previous/i.test(i.excerpt))).toBeTruthy();
  });

  it("says plainly when nothing is accessible", async () => {
    const { body } = await get("/data/context?reviewer=reviewer.cedar&mga_id=AGY-CEDR-02&evidence_cutoff=2026-01-01&subsequent=exclude&query=zebra");
    expect(body).toMatchObject({ status: "no_accessible_context", count: 0 });
  });

  it("stops retrieval after a revocation", async () => {
    await post("/data/admin/revoke", { source_id: "SRC-HARB-LTR-0220" });
    const { body } = await ctx();
    expect(body.items.some((i: any) => i.sourceId === "SRC-HARB-LTR-0220")).toBe(false);
    expect((await get(`/data/source-excerpt?${H}&source_id=SRC-HARB-LTR-0220&span=1`)).status).toBe(403);
  });

  it("reports an outage as an outage, naming the last good snapshot, not as empty evidence", async () => {
    await ctx();
    await post("/data/admin/outage", { on: true });
    const r = await ctx();
    expect(r.status).toBe(503);
    expect(r.body).toMatchObject({ code: "source_unavailable" });
    expect(r.body.lastSuccessfulSnapshotAt).toBeTruthy();
  });
});

describe("the action ledger", () => {
  const draft = (over: Record<string, unknown> = {}) => post("/actions/action-draft", {
    reviewer: "admin", mga_id: "AGY-HARB-01", review_id: "RUN-1", action_type: "request_missing_evidence", owner: "analyst.kim", due_at: "2026-03-31",
    recipient: "t.okafor@harborline.example", evidence_refs: ["SRC-HARB-LTR-0220#2", "SRC-HARB-CALL-0312#1"], subject: "Implementation evidence for referral controls",
    body: "Please provide the implementation evidence for the referral workflow controls by 31 March.", ...over,
  });
  const approve = (a: any, over: Record<string, unknown> = {}) => post("/actions/approval", { action_id: a.actionId, version: a.currentVersion, content_hash: a.currentHash, approval_id: "APR-1", decided_by: "admin", decision: "approved", ...over });

  it("opens version 1 pending approval, and the same content is not a new version", async () => {
    const a = (await draft()).body;
    expect(a).toMatchObject({ saved: true, currentVersion: 1, status: "pending_approval" });
    const again = (await draft({ action_id: a.actionId })).body;
    expect(again).toMatchObject({ saved: false, unchanged: true, currentVersion: 1 });
  });

  it("refuses an action type, a recipient or an unevidenced action it does not allow", async () => {
    expect((await draft({ action_type: "change_authority" })).body.code).toBe("validation_failed");
    expect((await draft({ recipient: "someone@else.example" })).body.error).toMatch(/not the contact on file/);
    expect((await draft({ evidence_refs: [] })).status).toBe(422);
    expect((await draft({ reviewer: "reviewer.cedar" })).status).toBe(403);
  });

  it("cannot route without an approval, and an unauthorised approver does not count", async () => {
    const a = (await draft()).body;
    const noApproval = await post("/actions/route", { action_id: a.actionId, version: 1, idempotency_key: "k1" });
    expect(noApproval).toMatchObject({ status: 409, body: { code: "approval_invalid" } });
    const analyst = await approve(a, { decided_by: "analyst.kim" });
    expect(analyst).toMatchObject({ status: 403, body: { code: "approval_invalid" } });
    expect((await post("/actions/route", { action_id: a.actionId, version: 1, idempotency_key: "k1" })).status).toBe(409);
  });

  it("voids an approval when the action is edited, and routes nothing on the stale version", async () => {
    const a = (await draft()).body;
    await approve(a);
    const edited = (await draft({ action_id: a.actionId, body: "Please also send the training records." })).body;
    expect(edited).toMatchObject({ currentVersion: 2, supersededApprovals: 1, status: "pending_approval" });
    const stale = await post("/actions/route", { action_id: a.actionId, version: 1, idempotency_key: "k1" });
    expect(stale.body.code).toBe("approval_invalid");
    const staleApproval = await approve(a, { approval_id: "APR-2" });
    expect(staleApproval.body.code).toBe("approval_invalid");
  });

  it("routes an approved version once: a repeat returns the receipt, a second key is refused", async () => {
    const a = (await draft()).body;
    await approve(a);
    const first = await post("/actions/route", { action_id: a.actionId, version: 1, idempotency_key: "k1" });
    expect(first.body).toMatchObject({ routed: true, duplicate: false });
    const repeat = await post("/actions/route", { action_id: a.actionId, version: 1, idempotency_key: "k1" });
    expect(repeat.body).toMatchObject({ routed: true, duplicate: true });
    expect(repeat.body.receipt.receiptId).toBe(first.body.receipt.receiptId);
    expect((await post("/actions/route", { action_id: a.actionId, version: 1, idempotency_key: "k2" })).status).toBe(409);
    expect((await get("/actions/outbox")).body.count).toBe(1);
  });

  it("reconciles a call that timed out after writing: at most one external effect", async () => {
    const a = (await draft()).body;
    await approve(a);
    const t = await post("/actions/route", { action_id: a.actionId, version: 1, idempotency_key: "k1", simulate_timeout: true });
    expect(t.status).toBe(504);
    const retry = await post("/actions/route", { action_id: a.actionId, version: 1, idempotency_key: "k1" });
    expect(retry.body).toMatchObject({ routed: true, duplicate: true });
    expect((await get("/actions/outbox")).body.count).toBe(1);
  });

  it("will not edit a routed action, and will not close one on a reply alone", async () => {
    const a = (await draft()).body;
    await approve(a);
    await post("/actions/route", { action_id: a.actionId, version: 1, idempotency_key: "k1" });
    expect((await draft({ action_id: a.actionId, body: "A different message." })).status).toBe(409);
    await post("/actions/simulate-response", { action_id: a.actionId, text: "Evidence attached." });
    expect((await get("/actions/pending-responses?reviewer=admin")).body.count).toBe(1);
    const bare = await post("/actions/close", { action_id: a.actionId, closed_by: "admin", disposition: "evidence_validated", reason: "" });
    expect(bare.status).toBe(422);
    const closed = await post("/actions/close", { action_id: a.actionId, closed_by: "admin", disposition: "evidence_validated", reason: "Pack reviewed against condition 1." });
    expect(closed.body).toMatchObject({ closed: true, status: "closed" });
  });

  it("writes every call, refusals included, to an append-only audit with rising sequence numbers", async () => {
    const a = (await draft()).body;
    await post("/actions/route", { action_id: a.actionId, version: 1, idempotency_key: "k1" });
    await approve(a);
    const { body } = await get("/actions/audit");
    expect(body.events.map((e: any) => e.seq)).toEqual([1, 2, 3]);
    expect(body.events.map((e: any) => e.outcome)).toEqual(["ok", "refused", "ok"]);
  });

  it("offers no way to change authority, sanction an MGA or send a real message", async () => {
    for (const p of ["/actions/change-authority", "/actions/sanction", "/actions/send-email"]) {
      const r = await fetch(base + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      expect(r.status).toBe(404);
    }
    expect(MGAS.length).toBe(2);
  });
});
