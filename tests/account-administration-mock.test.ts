/**
 * The simulated account administration system behaves like a system of record:
 * search returns evidence, duplicates are refused, an account another producer
 * is actively quoting stays invisible, and linking reports what blocks issuance.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import type { Server } from "http";
import router from "../server/mock-mcp/account-administration";

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

describe("account administration mock", () => {
  it("separates same-name clients by identifiers", async () => {
    const res = await get("/accounts?name=Summit%20Logistics&fein=94-2210987&producerCode=HCB-014");
    const oakland = res.results.find((r: any) => r.accountId === "ACCT-100417");
    const memphis = res.results.find((r: any) => r.accountId === "ACCT-100522");
    expect(oakland.matchedOn).toContain("fein");
    expect(memphis.conflictingIdentifiers).toContain("fein");
    expect(res.results[0].accountId).toBe("ACCT-100417");
  });

  it("hides an account another producer is actively quoting, without a trace", async () => {
    const other = await get("/accounts?name=Kestrel%20Foods&producerCode=HCB-014");
    expect(other.results).toEqual([]);
    expect(JSON.stringify(other)).not.toContain("ACCT-100858");
    const owner = await get("/accounts?name=Kestrel%20Foods&producerCode=PSG-330");
    expect(owner.results[0].accountId).toBe("ACCT-100858");
  });

  it("refuses to create a duplicate and names the existing account", async () => {
    const res = await post("/accounts", { legalName: "Brightwater Dairy Co", address: "88 Creamery Lane, Tulare CA", producerCode: "HCB-014" });
    expect(res.status).toBe(200);
    expect(res.body.created).toBe(false);
    expect(res.body.candidates[0].accountId).toBe("ACCT-100733");
  });

  it("creates a new account with a stable id, not screened", async () => {
    const res = await post("/accounts", { legalName: "Cascade Timber Products Inc", address: "2100 Mill Plain Blvd, Vancouver WA 98661", fein: "91-1834467", producerCode: "HCB-014" });
    expect(res.status).toBe(201);
    expect(res.body.account.accountId).toMatch(/^ACCT-\d{6}$/);
    expect(res.body.account.clearance.status).toBe("not_screened");
  });

  it("reports every reason issuance is blocked when linking a quote", async () => {
    const res = await post("/account-links", { accountId: "ACCT-101233", quoteNumber: "Q-TEST-1" });
    expect(res.body.issuanceAllowed).toBe(false);
    expect(res.body.blockingReasons.join(" ")).toContain("non-payment");
  });

  it("reset returns the book to the seeded accounts", async () => {
    await post("/accounts", { legalName: "Reset Probe Holdings", address: "5 Probe Rd, Testville", producerCode: "HCB-014" });
    expect((await get("/accounts?name=Reset%20Probe%20Holdings&producerCode=HCB-014")).results.length).toBe(1);
    const res = await post("/reset", {});
    expect(res.body.accounts).toBe(6);
    expect((await get("/accounts?name=Reset%20Probe%20Holdings&producerCode=HCB-014")).results).toEqual([]);
  });

  it("a legal block cannot be recorded as cleared", async () => {
    const created = await post("/accounts", { legalName: "Test Sanctioned Party Ltd", address: "1 Test St, Nowhere", producerCode: "HCB-014" });
    const id = created.body.account.accountId;
    await post("/clearance", { accountId: id, status: "blocked", legalBlock: true, reason: "OFAC SDN match" });
    const res = await post("/clearance", { accountId: id, status: "cleared" });
    expect(res.body.recorded).toBe(false);
  });
});

/**
 * Reading the relationship back. link_quote_to_account could write it, but
 * nothing could read it: "one account has multiple policies, and a policy
 * shows its account" had no system behind it, so an agent asked what an
 * account held could only re-state what it had just linked itself.
 */
describe("what an account holds", () => {
  it("lists what is linked, with who linked each and when", async () => {
    await post("/account-links", { accountId: "ACCT-101233", quoteNumber: "Q-LINK-1", lineOfBusiness: "Commercial Property", actor: "Dana Ruiz" });
    const res = await get("/account-links?accountId=ACCT-101233");
    const link = res.links.find((l: any) => l.policyNumber === "Q-LINK-1");
    expect(link).toBeTruthy();
    expect(link.linkedBy).toBe("Dana Ruiz");
    // Citable, not asserted: the audit row that created the link travels with it.
    expect(link.auditId).toBeTruthy();
    expect(link.linkedAt).toBeTruthy();
  });

  it("separates what is placed from what is merely quoted", async () => {
    const res = await get("/account-links?accountId=ACCT-101233");
    // A quoted link is not cover. Counting it as a line already held would
    // suppress a real cross-sell opportunity.
    expect(res.counts.quoted).toBeGreaterThan(0);
    // total also covers expired links, so it is a floor not an identity.
    expect(res.counts.total).toBeGreaterThanOrEqual(res.counts.quoted + res.counts.inForce);
    expect(res.counts.total).toBe(res.links.length);
    expect(res.linesOfBusiness).toContain("Commercial Property");
  });

  it("keeps an account invisible to a producer who may not see it", async () => {
    // Same confidentiality rule as reading the account: a producer who cannot
    // see the account must not learn its policy count either.
    // Kestrel Foods is the seeded account another producer is actively quoting;
    // an account with no active quote is visible by design, so using one would
    // have proved nothing.
    const hidden = await fetch(base + "/account-links?accountId=ACCT-100858&producerCode=NOT-THE-AOR");
    expect(hidden.status).toBe(404);
    const theirs = await fetch(base + "/account-links?accountId=ACCT-100858&producerCode=PSG-330");
    expect(theirs.status).toBe(200);
  });

  it("refuses to unlink an in-force policy, and says why", async () => {
    const seeded = await get("/account-links?accountId=ACCT-100417");
    const inForce = seeded.links.find((l: any) => l.status === "in_force");
    expect(inForce).toBeTruthy(); // the seed must contain one, or this proves nothing
    const res = await post("/account-links/unlink", { accountId: "ACCT-100417", quoteNumber: inForce.policyNumber, reason: "tidying", actor: "tester" });
    expect(res.body.unlinked).toBe(false);
    expect(res.body.reason).toBe("in_force");
    // A business refusal, not a transport error the caller might retry.
    expect(res.status).toBe(200);
    const after = await get("/account-links?accountId=ACCT-100417");
    expect(after.links.some((l: any) => l.policyNumber === inForce.policyNumber)).toBe(true);
  });

  it("unlinks a quote, records why, and leaves the rest alone", async () => {
    const before = (await get("/account-links?accountId=ACCT-101233")).counts.total;
    const res = await post("/account-links/unlink", { accountId: "ACCT-101233", quoteNumber: "Q-LINK-1", reason: "quote withdrawn by the broker", actor: "Dana Ruiz" });
    expect(res.body.unlinked).toBe(true);
    expect(res.body.remaining).toBe(before - 1);
    const after = await get("/account-links?accountId=ACCT-101233");
    expect(after.links.some((l: any) => l.policyNumber === "Q-LINK-1")).toBe(false);
  });

  it("will not unlink without a reason", async () => {
    await post("/account-links", { accountId: "ACCT-101233", quoteNumber: "Q-LINK-2", actor: "Dana Ruiz" });
    const res = await post("/account-links/unlink", { accountId: "ACCT-101233", quoteNumber: "Q-LINK-2" });
    expect(res.status).toBe(400);
    expect(String(res.body.error)).toContain("reason is required");
  });

  it("says plainly when the thing was never linked", async () => {
    const res = await post("/account-links/unlink", { accountId: "ACCT-101233", quoteNumber: "Q-NEVER", reason: "x" });
    expect(res.body.unlinked).toBe(false);
    expect(res.body.reason).toBe("not_linked");
  });
});
