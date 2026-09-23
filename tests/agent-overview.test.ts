/**
 * One agent, five sections instead of twenty-three tabs: Overview, Runs &
 * tests, Setup, Rules, Releases. Each section loads its own data. The old
 * page's "policy readiness" score (100 minus arbitrary deductions, never
 * evaluating a policy), its hardcoded autonomy guardrail cards and the
 * model-generated "projected" figures on replacement proposals are not
 * carried over; it stays at /agents/:id/classic.
 *
 * The sections match what the data supports: across the ten busiest agents,
 * all ten have eval suites and knowledge bases, while channels, triggers,
 * API keys and mandates appear on at most one.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { SECTIONS, policiesByScope, policyEffect, runOutcome, runStats } from "../client/src/pages/agent-overview";

const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");
const page = read("client", "src", "pages", "agent-overview.tsx");

describe("the sections", () => {
  it("are the five agreed, in order", () => {
    expect(SECTIONS.map((s) => s.id)).toEqual(["overview", "runs", "setup", "rules", "releases"]);
  });

  it("each load their own data, not everything on mount", () => {
    // The queries live inside the section components, so opening a section fetches it.
    for (const key of ["/mcp-servers", "/knowledge-bases", "/api/policies/resolve/", "/api/deployments"]) {
      expect(page).toContain(key);
    }
    expect(page.indexOf("function Setup(")).toBeLessThan(page.indexOf('`/api/agents/${agent.id}/mcp-servers`'));
    expect(page.indexOf("function Rules(")).toBeLessThan(page.indexOf("`/api/policies/resolve/${agent.id}`"));
  });
});

describe("what a run says", () => {
  it("names the outcome the run recorded", () => {
    expect(runOutcome("completed")).toEqual({ label: "completed", tone: "ok" });
    expect(runOutcome("failed")).toEqual({ label: "failed", tone: "bad" });
    expect(runOutcome("running").tone).toBe("muted");
    expect(runOutcome(null).label).toBe("unknown");
  });

  it("counts from the runs on screen", () => {
    const traces = [
      { status: "completed", startedAt: "2026-09-20T10:00:00Z" },
      { status: "failed", startedAt: "2026-09-22T10:00:00Z" },
      { status: "running", startedAt: "2026-09-21T10:00:00Z" },
    ] as any[];
    expect(runStats(traces)).toEqual({ total: 3, failed: 1, lastRunAt: "2026-09-22T10:00:00.000Z" });
    expect(runStats([])).toEqual({ total: 0, failed: 0, lastRunAt: null });
  });
});

describe("what a policy does", () => {
  it("blocks only when its own enforcement says so", () => {
    expect(policyEffect({ policyJson: { enforcement: "hard" } } as any)).toBe("blocks");
    expect(policyEffect({ policyJson: { enforcement: "monitor" } } as any)).toBe("monitors");
    expect(policyEffect({ policyJson: null } as any)).toBe("monitors");
  });
});

describe("policies in force", () => {
  it("lists each policy once, with the scopes it arrives through", () => {
    const p = (id: string, name: string) => ({ id, name, policyJson: {} }) as any;
    const gate = p("g", "Human Reporter Gate");
    const resolved = {
      // The resolver returns a policy once per scope it applies through.
      effectivePolicies: [gate, gate, p("c", "Customer Privacy Policy"), gate],
      orgPolicies: [gate],
      outcomePolicies: [gate, p("c", "Customer Privacy Policy")],
      envPolicies: [gate],
    };
    const rows = policiesByScope(resolved as any);
    expect(rows.map((r) => r.policy.id)).toEqual(["g", "c"]);
    expect(rows[0].scopes).toEqual(["organization", "outcome", "environment"]);
    expect(rows[1].scopes).toEqual(["outcome"]);
  });

  it("copes with a resolver that sends nothing", () => {
    expect(policiesByScope(undefined)).toEqual([]);
    expect(policiesByScope({ effectivePolicies: [] } as any)).toEqual([]);
  });
});

describe("what isn't carried over", () => {
  it("no readiness score, no hardcoded guardrails, no projected figures", () => {
    const code = page.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/policy-readiness|readinessScore|projected|guardrail/i);
  });

  it("says plainly what the run figures are", () => {
    expect(page).toContain("The 50 most recent runs recorded for this agent.");
    expect(page).toContain("the runtime doesn't read exceptions yet");
  });
});

describe("the routes", () => {
  const app = read("client", "src", "App.tsx");

  it("the new page is the agent page; the old one is classic", () => {
    expect(app).toContain('<Route path="/agents/:id" component={AgentOverview} />');
    expect(app).toContain('<Route path="/agents/:id/classic" component={AgentDetail} />');
    expect(app.indexOf('path="/agents/:id/classic"')).toBeLessThan(app.indexOf('path="/agents/:id" component'));
  });

  it("keeps the playground and export where they were", () => {
    expect(app).toContain('<Route path="/agents/:id/playground" component={AgentPlayground} />');
    expect(app).toContain('<Route path="/agents/:id/export" component={AgentExport} />');
  });
});
