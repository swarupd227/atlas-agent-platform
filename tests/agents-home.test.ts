/**
 * The agents registry, rebuilt: agents, teams and remote agents as views of
 * one list. Every figure is counted from runs. The agents table's
 * healthScore, successRate, totalRuns, monthlyRevenue and monthlyCost are
 * seed values no runtime path updates (one agent claims 18,432 runs), and the
 * old page's "eval coverage" (bindings × 25), safety ring and ROI were built
 * on them.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { activityLine, registryCounts, registryOrder, viewOf, type ActivityMap } from "../client/src/pages/agents-home";

const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");
const agent = (over: Record<string, any> = {}) => ({ id: "a1", name: "Invoice Agent", status: "deployed", agentType: "single", ...over }) as any;

describe("the views", () => {
  it("sorts each agent into agents, teams or remote", () => {
    expect(viewOf(agent())).toBe("agents");
    expect(viewOf(agent({ agentType: "team" }))).toBe("teams");
    expect(viewOf(agent({ agentType: "a2a" }))).toBe("remote");
    expect(viewOf({ agentType: null } as any)).toBe("agents");
  });
});

describe("what an agent has done", () => {
  it("says what was counted, or that there were no runs", () => {
    expect(activityLine({ runs: 12, failed: 2, lastRunAt: null, connectors: 0 })).toBe("12 runs, 2 failed in the last 30 days");
    expect(activityLine({ runs: 1, failed: 0, lastRunAt: null, connectors: 0 })).toBe("1 run in the last 30 days");
    expect(activityLine(undefined)).toBe("No runs in the last 30 days");
  });

  it("counts live agents, ones that ran and ones that failed", () => {
    const activity: ActivityMap = { a1: { runs: 5, failed: 1, lastRunAt: null, connectors: 2 }, a2: { runs: 0, failed: 0, lastRunAt: null, connectors: 0 } };
    const list = [agent({ id: "a1" }), agent({ id: "a2", status: "draft" }), agent({ id: "a3", status: "active" })];
    expect(registryCounts(list, activity)).toEqual({ total: 3, live: 2, ran: 1, failing: 1 });
  });

  it("puts live agents first, then the ones that actually run", () => {
    const activity: ActivityMap = { busy: { runs: 9, failed: 0, lastRunAt: null, connectors: 0 }, quiet: { runs: 0, failed: 0, lastRunAt: null, connectors: 0 } };
    const list = [agent({ id: "draft", name: "Z", status: "draft" }), agent({ id: "quiet", name: "B" }), agent({ id: "busy", name: "C" })];
    expect(list.sort((a, b) => registryOrder(a, b, activity)).map((a) => a.id)).toEqual(["busy", "quiet", "draft"]);
  });
});

describe("the page", () => {
  const page = read("client", "src", "pages", "agents-home.tsx");

  it("shows nothing built on the seeded columns", () => {
    const code = page.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/healthScore|successRate|monthlyRevenue|monthlyCost|safetyScore|getEvalCoverage/);
  });

  it("says where its figures come from", () => {
    expect(page).toContain("Counted from this agent's runs.");
  });

  it("keeps the full agent page as the way to configure one", () => {
    expect(page).toContain('href={`/agents/${agent.id}`}');
    expect(page).toContain("?selected=");
  });
});

describe("the routes", () => {
  const app = read("client", "src", "App.tsx");

  it("agents, teams and remote all open the registry; the old pages stay as classic", () => {
    expect(app).toContain('<Route path="/agents" component={AgentsHome} />');
    expect(app).toContain('<Route path="/agents/teams" component={AgentsHome} />');
    expect(app).toContain('<Route path="/agents/remote" component={AgentsHome} />');
    expect(app).toContain('<Route path="/agents/classic" component={Agents} />');
    expect(app).toContain('<Route path="/agents/teams/classic" component={AgentTeams} />');
  });

  it("one agent opens its own page, which the registry links to", () => {
    expect(app).toContain('<Route path="/agents/:id" component={AgentOverview} />');
    expect(app.indexOf('path="/agents/teams"')).toBeLessThan(app.indexOf('path="/agents/:id"'));
  });
});

describe("the counted endpoint", () => {
  const route = read("server", "routes", "agents.ts");

  it("counts runs, failures and the last run per agent, in one grouped query", () => {
    const at = route.indexOf('router.get("/api/agents/activity"');
    expect(at).toBeGreaterThan(-1);
    const body = route.slice(at, at + 2000);
    expect(body).toContain("groupBy(runTraces.agentId)");
    expect(body).toContain("count(*) filter (where ${runTraces.status} <> 'completed')::int");
    expect(body).toContain("max(${runTraces.startedAt})");
  });

  it("is registered before /api/agents/:id, which would swallow it", () => {
    expect(route.indexOf('router.get("/api/agents/activity"')).toBeLessThan(route.indexOf('router.get("/api/agents/:id"'));
  });
});
