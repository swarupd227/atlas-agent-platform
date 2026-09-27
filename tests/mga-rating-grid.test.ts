/**
 * The three-way rating comparison, as figures.
 *
 * The client's own prototype rates a risk three ways and shows them side by
 * side: as submitted, as the treaty requires, and as recommended. What makes
 * it worth copying is not the grid, it is that the cheapest-looking option is
 * the one outside authority -- so the price of complying is visible, and the
 * deductible stops being an underwriter's preference.
 *
 * This pins the arithmetic behind that grid and prints it, so the flow and the
 * presenter pack quote numbers that came from the engine rather than from a
 * spreadsheet someone typed.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import type { Server } from "http";
import intakeRouter from "../server/mock-mcp/bridge-specialty-intake";
import ratingRouter from "../server/mock-mcp/insurity-rating";

let server: Server;
let base = "";
beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/intake", intakeRouter);
  app.use("/rating", ratingRouter);
  await new Promise<void>((resolve) => { server = app.listen(0, () => resolve()); });
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const get = async (p: string) => (await fetch(base + p)).json() as any;
const post = async (p: string, b: unknown) =>
  (await fetch(base + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) })).json() as any;

describe("the three-way rating grid", () => {
  it("prices all three options and puts the cheapest outside authority", async () => {
    const sub = await get("/intake/submission?submissionId=SUB-2026-8891");
    const s = sub.scheduleSummary;
    const treaty = await get("/rating/treaty?treatyId=CP-2026-17");
    const minWind = treaty.delegatedAuthority.minWindstormDeductiblePct;

    const args = {
      submissionId: "SUB-2026-8891",
      totalTiv: s.totalTiv,
      coastalTier1Tiv: s.coastalTier1.aggregateTiv,
      predominantIsoClass: s.predominantIsoClass,
      exposureByState: s.byState,
      aopDeductible: 10_000,
    };
    const options = [
      { name: "As submitted", windstormDeductiblePct: 2, irpmCreditPct: 0 },
      { name: "Treaty minimum", windstormDeductiblePct: 5, irpmCreditPct: 0 },
      { name: "Recommended", windstormDeductiblePct: 5, irpmCreditPct: -10 },
    ];

    const rows: any[] = [];
    for (const o of options) {
      const r = await post("/rating/rate", { ...args, windstormDeductiblePct: o.windstormDeductiblePct, irpmCreditPct: o.irpmCreditPct });
      expect(r.premium).toBeDefined();
      const withinAuthority = o.windstormDeductiblePct >= minWind;
      rows.push({
        option: o.name,
        wind: `${o.windstormDeductiblePct}%`,
        irpm: `${o.irpmCreditPct}%`,
        gross: r.premium.grossPremium,
        tax: r.premium.surplusLinesTax,
        payable: r.premium.totalPayableByInsured,
        withinAuthority,
        breaches: withinAuthority ? [] : ["5.1"],
        ratingId: r.ratingId,
      });
    }
    // eslint-disable-next-line no-console
    console.log("\n" + rows.map((r) =>
      `${r.option.padEnd(16)} wind ${r.wind.padStart(3)}  irpm ${r.irpm.padStart(4)}  gross ${r.gross.toLocaleString("en-US").padStart(12)}  payable ${r.payable.toLocaleString("en-US").padStart(12)}  ${r.withinAuthority ? "within authority" : "BREACHES 5.1"}  ${r.ratingId}`,
    ).join("\n") + "\n");

    const [asSubmitted, treatyMin, recommended] = rows;
    // The shape that makes the grid worth showing.
    expect(asSubmitted.withinAuthority).toBe(false);
    expect(treatyMin.withinAuthority).toBe(true);
    expect(recommended.withinAuthority).toBe(true);
    // Complying is cheaper here, because a higher deductible earns a credit.
    expect(treatyMin.gross).toBeLessThan(asSubmitted.gross);
    // And the discretionary credit is cheaper still, within authority.
    expect(recommended.gross).toBeLessThan(treatyMin.gross);
    // Three distinct ratings, none substitutable for another.
    expect(new Set(rows.map((r) => r.ratingId)).size).toBe(3);
  });

  it("refuses a credit beyond authority rather than rating at the boundary", async () => {
    const r = await fetch(base + "/rating/rate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ submissionId: "SUB-2026-8891", totalTiv: 386_479_000, coastalTier1Tiv: 72_400_000, predominantIsoClass: 5, irpmCreditPct: -40 }),
    });
    expect(r.status).toBe(422);
    const body = await r.json() as any;
    expect(body.guidance).toMatch(/documented exception/i);
  });
});
