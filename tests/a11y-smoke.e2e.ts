/**
 * Accessibility smoke — axe-core scan of the hub pages (UX audit F-4).
 *
 * Gate: zero CRITICAL-impact violations. Serious/moderate counts are logged
 * as the working baseline; ratchet them down over time by tightening the
 * assertion once each level reaches zero.
 */
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const PAGES: Array<[string, string]> = [
  ["agents", "/agents"],
  ["outcomes", "/outcomes"],
  ["monitor", "/monitor"],
];

for (const [name, path] of PAGES) {
  test(`a11y smoke: ${name} has no critical violations`, async ({ page }) => {
    test.setTimeout(120000);
    await page.addInitScript(() => {
      localStorage.setItem("almp-industry", "cross_industry");
      localStorage.setItem("almp-role", "admin");
    });
    await page.goto(path);
    await page.waitForTimeout(4000);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();

    const byImpact: Record<string, number> = {};
    for (const v of results.violations) {
      byImpact[v.impact ?? "unknown"] = (byImpact[v.impact ?? "unknown"] ?? 0) + v.nodes.length;
    }
    console.log(`${name}: ${JSON.stringify(byImpact)}`);

    const critical = results.violations.filter((v) => v.impact === "critical");
    for (const v of critical) {
      console.log(`  CRITICAL ${v.id}: ${v.help} (${v.nodes.length} nodes)`);
      for (const n of v.nodes.slice(0, 3)) {
        console.log(`    → ${n.target?.[0] ?? ""} :: ${String(n.html).slice(0, 500)}`);
      }
    }
    expect(critical.length, `critical a11y violations on ${name}`).toBe(0);
  });
}
