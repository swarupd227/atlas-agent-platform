/**
 * The Governance page reads enforcement the way the runtime does, so the
 * header can't claim a policy blocks calls when it only monitors them
 * (resolvePolicyBundle in server/routes/helpers.ts: enforcement comes from the
 * policy's own field, defaulting to monitor -- never from an individual rule).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { enforcementOf, toolsTouched, boundAgents } from "../client/src/pages/governance-overview";

const policy = (policyJson: any, over: any = {}) => ({ id: "pol-1", name: "Tool limits", policyJson, ...over }) as any;

describe("enforcementOf", () => {
  it("blocks only when the policy's own enforcement says so", () => {
    for (const e of ["hard", "strict", "block"]) expect(enforcementOf(policy({ enforcement: e }))).toBe("blocks");
    expect(enforcementOf(policy({ enforcement_mode: "hard" }))).toBe("blocks");
    expect(enforcementOf(policy({ enforcement: "monitor" }))).toBe("monitors");
    expect(enforcementOf(policy({}))).toBe("monitors");
    expect(enforcementOf(policy(null))).toBe("monitors");
  });

  it("does not read enforcement off individual rules", () => {
    // A rule saying "block" inside a monitoring policy changes nothing at dispatch.
    expect(enforcementOf(policy({ rules: [{ action: "block" }, { enforcement: "hard" }] }))).toBe("monitors");
  });
});

describe("toolsTouched", () => {
  it("reports the tools a policy names", () => {
    expect(toolsTouched(policy({ blockedTools: ["send_email"], toolAllowlist: ["search"] }))).toEqual({ blocked: ["send_email"], allowlist: ["search"] });
    expect(toolsTouched(policy({}))).toEqual({ blocked: [], allowlist: [] });
  });
});

describe("boundAgents", () => {
  const p = policy({}, { id: "pol-1", name: "Tool limits" });
  it("matches a binding by id, by name, or a bare name, in either shape", () => {
    const agents = [
      { id: "a1", name: "By id", policyBindings: [{ policyId: "pol-1" }] },
      { id: "a2", name: "By name", policyBindings: [{ policyName: "Tool limits" }] },
      { id: "a3", name: "Bare string", policyBindings: ["Tool limits"] },
      { id: "a4", name: "Wrapped", policyBindings: { policies: [{ policyId: "pol-1" }] } },
      { id: "a5", name: "Other policy", policyBindings: [{ policyId: "pol-2" }] },
      { id: "a6", name: "None", policyBindings: null },
      { id: "a7", name: "Empty object", policyBindings: {} },
    ] as any[];
    expect(boundAgents(agents, p).map((a) => a.id)).toEqual(["a1", "a2", "a3", "a4"]);
  });
});

describe("page wiring", () => {
  const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");
  it("has no tabs and keeps the classic page reachable", () => {
    const src = read("client", "src", "pages", "governance-overview.tsx");
    expect(src).not.toContain("TabsTrigger");
    expect(src).toContain('href="/governance/classic"');
    const app = read("client", "src", "App.tsx");
    expect(app).toContain('const Governance = lazy(() => import("@/pages/governance-overview"));');
    expect(app).toContain('<Route path="/governance/classic" component={GovernanceClassic} />');
  });

  it("shows no compliance score, since the platform's are not measured", () => {
    const src = read("client", "src", "pages", "governance-overview.tsx");
    expect(src).not.toMatch(/complianceScore|overallScore|readinessScore/);
  });
});
