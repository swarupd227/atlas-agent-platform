/**
 * The close's four periods, and the defects each one is FOR.
 *
 * A reconciliation demo is only worth anything if its disagreements are exact
 * and deliberate. These pin the seeded book so a figure quoted in a presenter
 * pack is still true next month, and so a defect cannot quietly stop being
 * seeded while the scenario that depends on it still claims to catch it.
 */
import { describe, it, expect } from "vitest";
import {
  PERIODS, PERIOD_ORDER, BINDER_TERMS, CLOSE_TOLERANCES, risksFor, gwpFor, coastalTier1For, isPeriod,
  openingCoastalTier1, TREATY_YEAR_OPENING_COASTAL_TIER1,
} from "../server/mock-mcp/mga-close-seed";

describe("the seeded book", () => {
  it("is deterministic: the same period twice is the same book", () => {
    const a = risksFor("2026-03");
    const b = risksFor("2026-03");
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("gives each period the size its scenario needs", () => {
    expect(risksFor("2026-01")).toHaveLength(42);
    expect(risksFor("2026-02")).toHaveLength(51);
    expect(risksFor("2026-03")).toHaveLength(47);
    expect(risksFor("2026-04")).toHaveLength(63);
  });

  it("keeps January clean, because it is the happy path", () => {
    const rows = risksFor("2026-01");
    expect(rows.filter((r) => r.defect)).toHaveLength(0);
    expect(rows.every((r) => r.isoConstructionClass !== null)).toBe(true);
    // A cancellation returns premium; everything else is positive.
    for (const r of rows) {
      if (r.transactionType === "cancellation") expect(r.grossPremium).toBeLessThan(0);
      else expect(r.grossPremium).toBeGreaterThan(0);
    }
    // No building value is ever negative in a clean period.
    expect(rows.every((r) => r.buildingValue > 0)).toBe(true);
  });

  it("seeds February with exactly the defects the site itself ships and never catches", () => {
    const rows = risksFor("2026-02");
    const negatives = rows.filter((r) => r.buildingValue < 0);
    const missingClass = rows.filter((r) => r.isoConstructionClass === null);
    expect(negatives).toHaveLength(6);
    expect(missingClass).toHaveLength(4);
    // The exact values, so the scenario's numbers are quotable.
    expect(negatives.map((r) => r.buildingValue).sort((a, b) => a - b))
      .toEqual([-46_414, -44_771, -41_075, -39_431, -37_789, -35_735].sort((a, b) => a - b));
    // Ten row defects here; the claims file adds two orphans, making 12 of 51.
    expect(negatives.length + missingClass.length).toBe(10);
    expect(((10 + 2) / 51) * 100).toBeCloseTo(23.5, 1);
  });

  it("seeds March with two authority breaches, one of them already referred", () => {
    const rows = risksFor("2026-03");
    const overLimit = rows.filter((r) => r.largestLocationTiv > BINDER_TERMS.singleRiskLimit);
    const underDeductible = rows.filter((r) => r.coastalTier1Tiv > 0 && r.windstormDeductiblePct < BINDER_TERMS.minWindstormDeductiblePct);
    expect(overLimit).toHaveLength(1);
    expect(underDeductible).toHaveLength(1);
    // A near-miss, not an absurdity: 25.43M against a 25M cap.
    expect(overLimit[0].largestLocationTiv).toBe(25_430_000);
    // The second breach has a prior referral, so compliance must rule it
    // ratified rather than notifiable -- that is the point of the scenario.
    expect(PERIODS["2026-03"].breaches?.find((b) => b.kind === "wind_deductible")?.priorReferral).toBe("REF-2026-0214");
  });

  it("makes March's premium break a real figure, above both tolerances", () => {
    const brk = PERIODS["2026-03"].billingBreak!;
    const gwp = gwpFor("2026-03");
    expect(brk.amount).toBe(8_430);
    expect(brk.misbookedToBinder).not.toBe(BINDER_TERMS.binderId);
    // Above the absolute tolerance AND the percentage one, so Decision B has
    // to fire for a reason, not by a rounding accident.
    expect(brk.amount).toBeGreaterThan(CLOSE_TOLERANCES.premiumVarianceAbsolute);
    expect((brk.amount / gwp) * 100).toBeGreaterThan(CLOSE_TOLERANCES.premiumVariancePctOfGwp);
  });

  it("takes April past the capacity warning without breaching the cap", () => {
    const opening = openingCoastalTier1("2026-04");
    const written = coastalTier1For("2026-04");
    const closing = opening + written;
    const utilisation = (closing / BINDER_TERMS.coastalTier1TreatyYearCap) * 100;
    expect(utilisation).toBeGreaterThan(BINDER_TERMS.capacityWarningPct);
    // Over the warning line is a decision; over the cap would be a breach, and
    // this scenario is about the former.
    expect(closing).toBeLessThan(BINDER_TERMS.coastalTier1TreatyYearCap);
  });

  it("carries the deal journey's authority, so the two demos are one story", () => {
    expect(BINDER_TERMS.singleRiskLimit).toBe(25_000_000);
    expect(BINDER_TERMS.minWindstormDeductiblePct).toBe(5);
    expect(BINDER_TERMS.binderId).toBe("CP-2026-17");
  });

  it("rejects a period it does not hold", () => {
    expect(isPeriod("2026-01")).toBe(true);
    expect(isPeriod("2026-13")).toBe(false);
    expect(isPeriod(null)).toBe(false);
  });
});

/**
 * The treaty year has to chain. An opening that does not equal the sum of what
 * came before is not a roll-forward, and the capacity decision reads it.
 */
describe("the treaty-year roll-forward", () => {
  it("chains: each opening is everything written before it", () => {
    expect(openingCoastalTier1("2026-01")).toBe(TREATY_YEAR_OPENING_COASTAL_TIER1);
    expect(openingCoastalTier1("2026-02")).toBe(openingCoastalTier1("2026-01") + coastalTier1For("2026-01"));
    expect(openingCoastalTier1("2026-03")).toBe(openingCoastalTier1("2026-02") + coastalTier1For("2026-02"));
    expect(openingCoastalTier1("2026-04")).toBe(openingCoastalTier1("2026-03") + coastalTier1For("2026-03"));
  });

  it("writes exactly what each period is designed to write", () => {
    for (const p of ["2026-01", "2026-02", "2026-03", "2026-04"] as const) {
      expect(coastalTier1For(p)).toBe(PERIODS[p].coastalTier1Written);
    }
  });

  it("lands April at the utilisation the capacity scenario is about", () => {
    const closing = openingCoastalTier1("2026-04") + coastalTier1For("2026-04");
    expect(closing).toBe(241_000_000);
    expect((closing / BINDER_TERMS.coastalTier1TreatyYearCap) * 100).toBeCloseTo(96.4, 1);
  });

  it("never lets a risk's coastal exposure exceed its own total insured value", () => {
    for (const p of ["2026-01", "2026-02", "2026-03", "2026-04"] as const) {
      for (const r of risksFor(p)) expect(r.coastalTier1Tiv).toBeLessThanOrEqual(Math.max(r.totalInsuredValue, 0));
    }
  });
});

// The register's calendar used to stop at April, so asked for the treaty
// position at 2026-11 -- the period E&S submissions bind into -- it answered
// "Unknown reporting period", which reads as a broken connector rather than as
// a calendar that ends early.
describe("the binder's reporting calendar", () => {
  it("covers the whole treaty year, not just the periods the close demonstrates", () => {
    expect(PERIOD_ORDER).toHaveLength(12);
    expect(PERIOD_ORDER[0]).toBe("2026-01");
    expect(PERIOD_ORDER[11]).toBe("2026-12");
    for (const p of PERIOD_ORDER) expect(isPeriod(p)).toBe(true);
  });

  it("answers for the period an E&S submission binds into", () => {
    expect(isPeriod("2026-11")).toBe(true);
    expect(PERIODS["2026-11"].label).toBe("November 2026");
  });

  it("leaves the four close periods exactly as they were", () => {
    expect(PERIODS["2026-01"].coastalTier1Written).toBe(43_400_000);
    expect(PERIODS["2026-02"].coastalTier1Written).toBe(14_200_000);
    expect(PERIODS["2026-03"].coastalTier1Written).toBe(15_600_000);
    expect(PERIODS["2026-04"].coastalTier1Written).toBe(19_800_000);
    expect(risksFor("2026-03")).toHaveLength(47);
  });

  // The added periods write nothing, so the position later in the year is
  // April's position. That is the honest answer -- and the one an underwriter
  // needs: 9m of coastal headroom left, against a submission wanting to bind
  // 72.4m of it.
  it("carries April's position forward through the open periods", () => {
    const april = openingCoastalTier1("2026-04") + coastalTier1For("2026-04");
    for (const p of ["2026-05", "2026-09", "2026-11", "2026-12"] as const) {
      expect(coastalTier1For(p)).toBe(0);
      expect(openingCoastalTier1(p) + coastalTier1For(p)).toBe(april);
    }
    expect(BINDER_TERMS.coastalTier1TreatyYearCap - april).toBe(9_000_000);
  });

  it("writes no risks in a period nothing was written in", () => {
    for (const p of ["2026-05", "2026-11"] as const) expect(risksFor(p)).toHaveLength(0);
  });
});
