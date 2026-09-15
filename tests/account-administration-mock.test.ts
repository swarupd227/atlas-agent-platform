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

  it("a legal block cannot be recorded as cleared", async () => {
    const created = await post("/accounts", { legalName: "Test Sanctioned Party Ltd", address: "1 Test St, Nowhere", producerCode: "HCB-014" });
    const id = created.body.account.accountId;
    await post("/clearance", { accountId: id, status: "blocked", legalBlock: true, reason: "OFAC SDN match" });
    const res = await post("/clearance", { accountId: id, status: "cleared" });
    expect(res.body.recorded).toBe(false);
  });
});
