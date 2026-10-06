/**
 * Reading a measurement that was never taken.
 *
 * agents.health_score and agents.success_rate are nullable on purpose. The
 * Monitor read them as `agent.successRate || 0`, which turns "nobody measured
 * this" into a measured zero — and zero is scored, so the row rendered 0.0% in
 * red, identical to an agent that fails every run. One card rendered the string
 * "null%" verbatim.
 *
 * Measured on Azure 2026-10-06: of 1,096 agents, 975 are null for BOTH fields.
 * healthScore has zero genuine zeroes; successRate has six. So 89% of the fleet
 * looked catastrophically broken and the six real failures were invisible.
 *
 * Found by sweeping for the shape after the same bug was fixed three times on
 * the Dashboard. The discriminator: a `.default(0)` column cannot tell "never
 * set" from "measured zero" — and a reader's `?? 0` destroys the distinction a
 * nullable column preserved.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { measuredRate, measuredScore, TONE_CLASS, NOT_MEASURED } from "../client/src/lib/measured";

const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");

describe("an absent measurement", () => {
  it("is never shown as a number", () => {
    expect(measuredRate(null, { ok: 95, warn: 85 })).toMatchObject({ text: NOT_MEASURED, measured: false });
    expect(measuredScore(undefined, { ok: 80, warn: 60 })).toMatchObject({ text: NOT_MEASURED, measured: false });
    expect(measuredRate(null, { ok: 95, warn: 85 }).text).not.toMatch(/0/);
  });

  it("is never red: red is a claim, and we have nothing to claim", () => {
    expect(measuredRate(null, { ok: 95, warn: 85 }).tone).toBe("unmeasured");
    expect(TONE_CLASS.unmeasured).not.toMatch(/red/);
    expect(TONE_CLASS.unmeasured).toMatch(/muted/);
  });
});

describe("a real measurement still reads as one", () => {
  it("keeps a genuine zero red, so the six agents that really fail stay visible", () => {
    const zero = measuredRate(0, { ok: 95, warn: 85 });
    expect(zero).toMatchObject({ text: "0.0%", tone: "bad", measured: true });
    expect(TONE_CLASS[zero.tone]).toMatch(/red/);
  });

  it("scores the bands as before", () => {
    expect(measuredRate(0.97, { ok: 95, warn: 85 })).toMatchObject({ text: "97.0%", tone: "ok" });
    expect(measuredRate(0.9, { ok: 95, warn: 85 }).tone).toBe("warn");
    expect(measuredScore(85, { ok: 80, warn: 60 })).toMatchObject({ text: "85%", tone: "ok" });
    expect(measuredScore(0, { ok: 80, warn: 60 })).toMatchObject({ text: "0%", tone: "bad" });
  });
});

describe("the Monitor reads them through it", () => {
  const page = read("client", "src", "pages", "monitor.tsx");

  it("has no coalescing left on either field", () => {
    // `|| 0` on these two is the defect itself.
    expect(page).not.toMatch(/successRate \|\| 0/);
    expect(page).not.toMatch(/healthScore \|\| 0/);
  });

  it("no longer renders a raw health score that can be null", () => {
    // One card printed "null%" because it interpolated the field directly.
    expect(page).not.toContain("{agent.healthScore}%");
  });

  it("draws no progress bar for a value nobody recorded", () => {
    // An empty bar and a 0% bar look identical.
    expect(page).toContain("agent.successRate != null && <Progress");
    expect(page).toContain("agent.healthScore != null && <Progress");
  });
});
