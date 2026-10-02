import { describe, it, expect } from "vitest";
import { renderGovernanceBlock } from "../server/routes/helpers";

type Entry = Parameters<typeof renderGovernanceBlock>[0][number];

const entry = (over: Partial<Entry> = {}): Entry => ({
  policyId: "p1",
  name: "Binder Close: Reconciliation and Submission Controls",
  domain: "financial_compliance",
  enforcement: "hard",
  hard: true,
  description: "Controls for the binder period close.",
  directives: [],
  specificity: 0,
  ...over,
} as Entry);

const rules = (n: number) =>
  Array.from({ length: n }, (_, i) => `Rule ${i + 1}: a directive the author wrote and expects the agent to receive.`);

const bullets = (block: string) => block.split("\n").filter((l) => l.startsWith("  - ")).length;

describe("renderGovernanceBlock", () => {
  it("renders every directive when they fit the budget", () => {
    // The bug this replaces: a fixed slice(0, 4) dropped rules 5 and 6 of a
    // six-rule policy even with budget to spare.
    const block = renderGovernanceBlock([entry({ directives: rules(6) })], 600);
    expect(bullets(block)).toBe(6);
    for (const r of rules(6)) expect(block).toContain(r);
    expect(block).not.toContain("more not shown");
  });

  it("renders more than four directives — the old fixed cap is gone", () => {
    const block = renderGovernanceBlock([entry({ directives: rules(5) })], 600);
    expect(bullets(block)).toBeGreaterThan(4);
  });

  it("says how many directives it left out instead of truncating silently", () => {
    const block = renderGovernanceBlock([entry({ directives: rules(12) })], 120);
    expect(block).toMatch(/\(\+\d+ more not shown\)/);
    // The admission must match what was actually dropped.
    const shown = bullets(block) - 1; // the note is itself a bullet
    const stated = Number(/\(\+(\d+) more/.exec(block)![1]);
    expect(shown + stated).toBe(12);
  });

  it("never truncates silently, at any budget that renders the policy at all", () => {
    // The first version of this fix appended the note only when it happened to
    // fit, so the admission vanished at exactly the tight budgets where most
    // was being cut. Sweep the budgets and assert the invariant directly.
    for (let budget = 30; budget <= 400; budget += 5) {
      const block = renderGovernanceBlock([entry({ directives: rules(9) })], budget);
      if (block === "") continue;                       // policy skipped entirely: fine
      const note = /\(\+(\d+) more not shown\)/.exec(block);
      const shown = bullets(block) - (note ? 1 : 0);
      expect(shown + (note ? Number(note[1]) : 0)).toBe(9);
    }
  });

  it("skips a policy whose first directive does not fit, rather than naming it with no rules", () => {
    // A name with no directives reads as "comply with something" and was the
    // original reason directives are rendered at all.
    const block = renderGovernanceBlock([entry({ directives: rules(3) })], 20);
    expect(block).toBe("");
  });

  it("falls back to the description when a policy has no directives", () => {
    const block = renderGovernanceBlock([entry({ description: "Only a description." })], 600);
    expect(block).toContain("Only a description.");
  });

  it("gives the budget to the first entry, so bound-before-org ordering still decides", () => {
    const bound = entry({ policyId: "bound", name: "Bound Policy", directives: rules(6), specificity: 0 });
    const orgWide = entry({ policyId: "org", name: "Org Wide Policy", directives: rules(6), specificity: 3 });
    const block = renderGovernanceBlock([bound, orgWide], 200);
    expect(block).toContain("Bound Policy");
    const boundAt = block.indexOf("Bound Policy");
    const orgAt = block.indexOf("Org Wide Policy");
    if (orgAt !== -1) expect(boundAt).toBeLessThan(orgAt);
  });

  it("never exceeds the budget it was given", () => {
    const many = [entry({ policyId: "a", directives: rules(8) }), entry({ policyId: "b", name: "Second", directives: rules(8) })];
    for (const budget of [60, 120, 300, 600]) {
      const block = renderGovernanceBlock(many, budget);
      expect(Math.ceil(block.length / 4)).toBeLessThanOrEqual(budget);
    }
  });

  it("returns nothing for no entries", () => {
    expect(renderGovernanceBlock([], 600)).toBe("");
  });
});
