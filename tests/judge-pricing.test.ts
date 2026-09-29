/**
 * Pricing for judges whose incumbent goes through server/claude.ts (Phase 2,
 * item 10). The golden examiner and the sandbox judge recorded tokens on their
 * audit rows with a cost of zero, because the token-reporting Claude helper
 * did not price them. It now prices from the provider's own table, by model,
 * so cost per judge reads from the audit's columns on every site.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { priceTokens, getPriceTable, PRICE_TABLE_VERSION } from "../server/llm-provider";

const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");

describe("priceTokens", () => {
  it("prices a model from whichever provider's table holds it", () => {
    // Opus 4.5: $0.005 per 1k in, $0.025 per 1k out.
    expect(priceTokens("claude-opus-4-5", 1349, 200)).toBeCloseTo(1.349 * 0.005 + 0.2 * 0.025, 9);
    expect(priceTokens("gpt-4.1", 1000, 1000)).toBeCloseTo(0.002 + 0.008, 9);
    expect(priceTokens("gemini-2.5-flash", 1000, 0)).toBeCloseTo(0.00015, 9);
  });

  it("falls back to the conservative rates for a model missing from the table, never zero", () => {
    const t = getPriceTable();
    expect(priceTokens("some-future-model", 1000, 1000)).toBeCloseTo(t.fallbackRates.costPer1kInput + t.fallbackRates.costPer1kOutput, 9);
    expect(priceTokens("some-future-model", 1, 0)).toBeGreaterThan(0);
  });

  it("the table carries the examiner's model and was re-versioned when it was added", () => {
    const anthropic = getPriceTable().providers.anthropic.models;
    expect(anthropic.find((m) => m.id === "claude-opus-4-5")).toMatchObject({ costPer1kInput: 0.005, costPer1kOutput: 0.025 });
    expect(PRICE_TABLE_VERSION >= "2026-09-29").toBe(true);
  });
});

describe("the judges that carry it", () => {
  it("the Claude helper prices what it reports, and both judges pass the price to the seam", () => {
    const claude = read("server", "claude.ts");
    expect(claude).toContain('import { priceTokens } from "./llm-provider";');
    expect(claude).toContain("costUsd: priceTokens(usedModel, inputTokens, outputTokens),");
    expect(claude).toContain("outputTokens: number; costUsd: number; latencyMs: number }>");
    expect(read("server", "routes", "golden-eval.ts")).toContain("return { answers, model: r.model, latencyMs: r.latencyMs, inputTokens: r.inputTokens, costUsd: r.costUsd };");
    const skills = read("server", "routes", "skills.ts");
    expect(skills).toContain("const judged = await callClaudeWithUsage({");
    expect(skills).toContain("incumbent: knownIncumbent({ activation: Boolean(judge.activationTriggered) }, judgeUsage),");
  });
});
