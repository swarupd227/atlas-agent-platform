/**
 * Delegated authority is written per line of business.
 *
 * This exists because of a real run. A cross-sell journey asked
 * get_treaty_terms with no arguments while assessing whether Commercial Auto
 * could be quoted, got the Commercial Property treaty back, and the
 * downstream decision resolved "quotable" and wrote a quote to the account --
 * even though the assessment step had said in words that the authority check
 * could not be completed. The tool answered a question it had not been asked.
 *
 * So the contract under test is narrow and behavioural:
 *   - asking for a line returns THAT line's treaty, or refuses with the lines
 *     actually covered. It never substitutes another line's authority.
 *   - asking for nothing still works, for callers that only want the property
 *     treaty, but says out loud which line it governs.
 *   - the response distinguishes limits decidable from an account record from
 *     limits that need a submission, because conflating them is what turns
 *     "cannot be checked yet" into "passed".
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import type { Server } from "http";
import ratingRouter from "../server/mock-mcp/insurity-rating";

let server: Server;
let base = "";
beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/rating", ratingRouter);
  await new Promise<void>((resolve) => { server = app.listen(0, () => resolve()); });
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const get = async (p: string) => {
  const r = await fetch(base + p);
  return { status: r.status, body: (await r.json()) as any };
};

describe("get_treaty_terms is per line of business", () => {
  it("returns the auto treaty for Commercial Auto, not the property one", async () => {
    const r = await get("/rating/treaty?lineOfBusiness=Commercial%20Auto");
    expect(r.status).toBe(200);
    expect(r.body.treatyId).toBe("CA-2026-08");
    expect(r.body.lineOfBusiness).toBe("Commercial Auto (E&S)");
    expect(r.body.lineOfBusinessRequested).toBe("Commercial Auto");
    // The clause text has to be the auto clauses, or a referral would quote
    // property limits at a transportation underwriter.
    expect(Object.keys(r.body.clauses)).toContain("3.5");
    expect(r.body.clauses["3.5"]).toMatch(/power units/i);
    expect(r.body.delegatedAuthority.maxPowerUnits).toBe(150);
  });

  it("returns the property treaty for Commercial Property", async () => {
    const r = await get("/rating/treaty?lineOfBusiness=Commercial%20Property");
    expect(r.status).toBe(200);
    expect(r.body.treatyId).toBe("CP-2026-17");
    expect(r.body.delegatedAuthority.singleRiskLimit).toBe(25_000_000);
  });

  it("matches a line whether or not the caller writes the (E&S) suffix", async () => {
    const bare = await get("/rating/treaty?lineOfBusiness=Commercial%20Auto");
    const suffixed = await get("/rating/treaty?lineOfBusiness=Commercial%20Auto%20(E%26S)");
    const cased = await get("/rating/treaty?lineOfBusiness=commercial%20auto");
    expect([bare.status, suffixed.status, cased.status]).toEqual([200, 200, 200]);
    expect(new Set([bare.body.treatyId, suffixed.body.treatyId, cased.body.treatyId])).toEqual(new Set(["CA-2026-08"]));
  });

  it("refuses a line it holds no authority for, and names the lines it covers", async () => {
    const r = await get("/rating/treaty?lineOfBusiness=Workers%20Compensation");
    expect(r.status).toBe(404);
    expect(r.body.error).toMatch(/no delegated authority/i);
    expect(r.body.coveredLines).toEqual(
      expect.arrayContaining(["Commercial Property (E&S)", "Commercial Auto (E&S)"]),
    );
    // The refusal must not hand back a treaty, or the caller can read the
    // 404 body as authority anyway.
    expect(r.body.treatyId).toBeUndefined();
    expect(r.body.delegatedAuthority).toBeUndefined();
    expect(r.body.clauses).toBeUndefined();
    expect(r.body.guidance).toMatch(/not a pass/i);
  });

  it("refuses a treaty id and a line that disagree rather than picking one", async () => {
    const r = await get("/rating/treaty?treatyId=CP-2026-17&lineOfBusiness=Commercial%20Auto");
    expect(r.status).toBe(400);
    expect(r.body.treatyGoverningThatLine).toBe("CA-2026-08");
    expect(r.body.delegatedAuthority).toBeUndefined();
  });

  it("accepts a treaty id and a line that agree", async () => {
    const r = await get("/rating/treaty?treatyId=CA-2026-08&lineOfBusiness=Commercial%20Auto");
    expect(r.status).toBe(200);
    expect(r.body.treatyId).toBe("CA-2026-08");
  });

  it("still answers with no arguments, but says which line that treaty governs", async () => {
    const r = await get("/rating/treaty");
    expect(r.status).toBe(200);
    expect(r.body.treatyId).toBe("CP-2026-17");
    expect(r.body.lineOfBusinessRequested).toBeNull();
    // This warning is the whole point: the silent default is what let a quote
    // be placed against the wrong line's authority.
    expect(r.body.warning).toMatch(/Commercial Property \(E&S\) only/);
    expect(r.body.warning).toMatch(/not authority for any other line/i);
    expect(r.body.coveredLines).toContain("Commercial Auto (E&S)");
    expect(r.body.guidance).toMatch(/per line of business/i);
  });

  it("does not warn when a treaty was asked for by id", async () => {
    const r = await get("/rating/treaty?treatyId=CP-2026-17");
    expect(r.status).toBe(200);
    expect(r.body.warning).toBeUndefined();
  });

  it("still 404s an unknown treaty id", async () => {
    const r = await get("/rating/treaty?treatyId=XX-1999-01");
    expect(r.status).toBe(404);
    expect(r.body.availableTreaties).toEqual(expect.arrayContaining(["CP-2026-17", "CA-2026-08"]));
  });

  it("separates limits decidable from an account from limits needing a submission", async () => {
    const auto = await get("/rating/treaty?lineOfBusiness=Commercial%20Auto");
    const scope = auto.body.authorityScope;
    expect(scope.checkableFromAccountRecord).toEqual(expect.arrayContaining(["permittedStates", "operationExclusions"]));
    // Fleet size and radius are not knowable from an account record, so they
    // must be listed as outstanding rather than silently treated as met.
    expect(scope.requiresSubmission).toEqual(expect.arrayContaining(["maxPowerUnits", "maxRadiusOfOperationMiles", "combinedSingleLimit"]));
    expect(scope.requiresSubmission).not.toContain("permittedStates");
    // And the split must be per treaty, not a fixed list: property has no
    // fleet limit to defer.
    const prop = await get("/rating/treaty?lineOfBusiness=Commercial%20Property");
    expect(prop.body.authorityScope.requiresSubmission).toEqual(expect.arrayContaining(["singleRiskLimit", "coastalTier1AggregateLimit"]));
    expect(prop.body.authorityScope.requiresSubmission).not.toContain("maxPowerUnits");
  });

  it("covers the two seeded account states for the auto line", async () => {
    // ACCT-100417 Summit Logistics is garaged in Oakland CA and ACCT-101233
    // Granite Ridge in Reno NV. Both states must be inside the auto treaty or
    // the cross-sell journey's scope check is untestable.
    const r = await get("/rating/treaty?lineOfBusiness=Commercial%20Auto");
    expect(r.body.delegatedAuthority.permittedStates).toEqual(expect.arrayContaining(["CA", "NV"]));
    expect(r.body.operationExclusions).toEqual(expect.arrayContaining(["Hazardous materials long-haul"]));
  });
});
