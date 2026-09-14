/**
 * KPI current values carry where they came from (kpi_definitions.value_source),
 * and estimates are never saved as if they were measured. Static checks on the
 * writers, since each lives inside a route or a DB-bound helper.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8");

describe("KPI value provenance", () => {
  it("adds the provenance columns additively at startup", () => {
    const db = read("server", "db.ts");
    expect(db).toContain("ALTER TABLE kpi_definitions ADD COLUMN IF NOT EXISTS value_source TEXT");
    expect(db).toContain("ALTER TABLE kpi_definitions ADD COLUMN IF NOT EXISTS value_updated_at TIMESTAMP");
  });

  it("the run-derived recompute records agent_runs as the source", () => {
    const helpers = read("server", "routes", "helpers.ts");
    const writes = helpers.match(/storage\.updateKpi\([^)]*\)/g) ?? [];
    expect(writes.length).toBeGreaterThan(0);
    for (const w of writes) expect(w, w).toContain('valueSource: "agent_runs"');
  });

  it("the KPI contributions route returns estimates without saving them", () => {
    const route = read("server", "routes", "shadow-canary.ts");
    expect(route).not.toMatch(/storage\.updateKpi\(/);
    expect(route).toContain("estimated: kpi.currentValue == null");
  });

  it("a value set through the KPI routes is marked manual and the source can't be claimed by a request", () => {
    const outcomes = read("server", "routes", "outcomes.ts");
    const patch = outcomes.slice(outcomes.indexOf('router.patch("/api/kpis/:id"'));
    expect(patch.slice(0, 800)).toContain('data.valueSource = "manual"');
    expect(patch.slice(0, 800)).toContain("delete data.valueSource");
    const post = outcomes.slice(outcomes.indexOf('router.post("/api/kpis"'));
    expect(post.slice(0, 600)).toContain("delete data.valueSource");
  });
});
