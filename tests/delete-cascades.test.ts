/**
 * What a delete takes with it.
 *
 * A sweep of the removal paths found three that left something behind:
 * deleting an outcome kept its KPIs' readings (kpi_readings was added after
 * that cleanup was written), deleting a skill kept its versions and left every
 * agent that preloaded it pointing at a skill that no longer exists, and
 * deleting a policy left its bindings on agents.
 *
 * A dangling reference is worse than a missing one here: the runtime drops an
 * unresolvable skill id silently, so an agent loses a skill without anything
 * saying so.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");
const storage = read("server", "storage.ts");
const bodyOf = (marker: string) => {
  const at = storage.indexOf(marker);
  const next = storage.indexOf("\n  async ", at + marker.length);
  return storage.slice(at, next > 0 ? next : undefined);
};

describe("deleting an outcome", () => {
  const body = bodyOf("async deleteOutcome(");

  it("takes the readings of the KPIs it deletes", () => {
    expect(body).toContain("await db.delete(kpiReadings).where(eq(kpiReadings.outcomeId, id));");
    // Readings first: they belong to the KPIs deleted on the next line.
    expect(body.indexOf("kpiReadings")).toBeLessThan(body.indexOf("kpiDefinitions"));
  });

  it("still detaches rather than deletes what is somebody else's", () => {
    // An agent outlives the outcome it served; it is detached, not deleted.
    expect(body).toContain("await db.update(agents).set({ outcomeId: null })");
    expect(body).toContain("await db.update(approvals).set({ outcomeId: null })");
  });
});

describe("deleting a skill", () => {
  const body = bodyOf("async deleteSkill(");

  it("takes its versions with it", () => {
    expect(body).toContain("await db.delete(skillVersions).where(eq(skillVersions.skillId, id));");
  });

  it("takes itself out of the agents that preloaded it", () => {
    expect(body).toContain("await this.detachSkillFromAgents(id, orgId);");
    const detach = bodyOf("async detachSkillFromAgents(");
    // preloadedSkills holds {skillId} objects, and plain ids in older rows.
    expect(detach).toContain('(typeof entry === "string" ? entry : entry?.skillId) !== skillId');
    expect(detach).toContain("await db.update(agents).set({ preloadedSkills: kept }");
    // An agent that never had it isn't rewritten.
    expect(detach).toContain("if (kept.length === raw.length) continue;");
  });
});

describe("deleting a policy", () => {
  const body = bodyOf("async deletePolicy(");

  it("takes its bindings off the agents", () => {
    expect(body).toContain("await this.detachPolicyFromAgents(id, owned.name, orgId);");
  });

  it("handles both shapes a binding is written in", () => {
    const detach = bodyOf("async detachPolicyFromAgents(");
    // An array of {policyId, name}, or {policies: ["<name>"]} — see normalizePolicyBindings.
    expect(detach).toContain("if (Array.isArray(raw))");
    expect(detach).toContain('Array.isArray((raw as any).policies)');
    expect(detach).toContain("policies: kept");
    // Matched by id or by name, because one shape carries only the name.
    expect(detach).toContain("=== policyName");
  });
});

describe("the interface", () => {
  it("declares the two detach methods, so a caller can use them without a delete", () => {
    expect(storage).toContain("detachSkillFromAgents(skillId: string, orgId?: string): Promise<string[]>;");
    expect(storage).toContain("detachPolicyFromAgents(policyId: string, policyName: string, orgId?: string): Promise<string[]>;");
  });

  it("scopes both to the caller's organization", () => {
    for (const marker of ["async detachSkillFromAgents(", "async detachPolicyFromAgents("]) {
      expect(bodyOf(marker), marker).toContain("await this.getAgents(orgId)");
    }
  });
});
