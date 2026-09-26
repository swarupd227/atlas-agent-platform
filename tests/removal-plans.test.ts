/**
 * Deleting an outcome or an agent, with what that takes said first.
 *
 * The modernized pages shipped without delete at all — it stayed on the
 * /classic pages, so the default Outcomes and Agent pages could create but not
 * remove. Putting it back meant answering the question the old confirm didn't:
 * what exactly goes.
 *
 * The counts come from the same tables the delete clears, so the list can't
 * drift from what happens, and anything detached rather than deleted is listed
 * as staying.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { removeTitle } from "../client/src/components/remove-dialog";
import { NAMES_SHOWN, namedList } from "../server/removal-plans";

const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");
const dialog = read("client", "src", "components", "remove-dialog.tsx");
const outcomesPage = read("client", "src", "pages", "outcomes-home.tsx");
const agentPage = read("client", "src", "pages", "agent-overview.tsx");
const outcomeRoutes = read("server", "routes", "outcomes.ts");
const agentRoutes = read("server", "routes", "agents.ts");

const ORG = "org-a";
const state = {
  outcomes: [] as any[],
  agents: [] as any[],
  kpis: [] as any[],
  readings: [] as any[],
  teams: [] as any[],
  kbLinks: [] as any[],
  mcpLinks: [] as any[],
};

vi.mock("../server/storage", () => ({
  storage: {
    getOutcome: vi.fn(async (id: string, orgId?: string) => state.outcomes.find((o) => o.id === id && (!orgId || o.organizationId === orgId))),
    getAgent: vi.fn(async (id: string, orgId?: string) => state.agents.find((a) => a.id === id && (!orgId || a.organizationId === orgId))),
    getAgents: vi.fn(async (orgId?: string) => state.agents.filter((a) => !orgId || a.organizationId === orgId)),
    getKpisByOutcome: vi.fn(async (outcomeId: string) => state.kpis.filter((k) => k.outcomeId === outcomeId)),
    getKpiReadingsByOutcome: vi.fn(async (outcomeId: string) => state.readings.filter((r) => r.outcomeId === outcomeId)),
    getAgentTeamMembers: vi.fn(async (teamAgentId: string) => state.teams.filter((t) => t.teamAgentId === teamAgentId)),
    getAgentTeamsByMember: vi.fn(async (memberAgentId: string) => state.teams.filter((t) => t.memberAgentId === memberAgentId)),
    getAgentKnowledgeBases: vi.fn(async (agentId: string) => state.kbLinks.filter((l) => l.agentId === agentId)),
    getAgentMcpServers: vi.fn(async (agentId: string) => state.mcpLinks.filter((l) => l.agentId === agentId)),
    // An agent's plan carries what deleting its whole team would take.
    summarizeDagExecutionRunsByTeamAgent: vi.fn(async () => ({ total: 0, completed: 0, failed: 0, latest: null })),
    getProcessFlows: vi.fn(async () => []),
  },
}));

const { planAgentRemoval, planOutcomeRemoval, RemovalPlanError } = await import("../server/removal-plans");

beforeEach(() => {
  state.outcomes = [{ id: "out-1", name: "Cut rental idle time", organizationId: ORG }];
  state.agents = [
    { id: "a-1", name: "Fleet orchestrator", organizationId: ORG },
    { id: "a-2", name: "Idle scanner", organizationId: ORG, outcomeId: "out-1" },
    { id: "a-3", name: "Branch reporter", organizationId: ORG, outcomeId: "out-1" },
  ];
  state.kpis = [{ id: "k-1", outcomeId: "out-1", name: "Fleet utilization" }];
  state.readings = [{ id: "r-1", outcomeId: "out-1", kpiId: "k-1", value: 62.5 }];
  state.teams = [{ id: "m-1", teamAgentId: "a-1", memberAgentId: "a-2" }];
  state.kbLinks = [{ id: "kb-1", agentId: "a-1" }];
  state.mcpLinks = [];
});

describe("deleting an outcome", () => {
  it("names its KPIs and counts the measurements that go with them", async () => {
    const plan = await planOutcomeRemoval(ORG, "out-1");
    expect(plan.goes).toContain("1 KPI: Fleet utilization");
    expect(plan.goes).toContain("1 recorded measurement of those KPIs");
    expect(plan.warning).toContain("only the audit trail keeps that they were taken");
  });

  it("says the agents survive it, by name, because that is the worry", async () => {
    const plan = await planOutcomeRemoval(ORG, "out-1");
    expect(plan.stays[0]).toBe("2 agents stay, no longer bound to an outcome: Idle scanner, Branch reporter");
  });

  it("says nothing about measurements when none were taken", async () => {
    state.readings = [];
    const plan = await planOutcomeRemoval(ORG, "out-1");
    expect(plan.goes.some((line) => line.includes("measurement"))).toBe(false);
    expect(plan.warning).toBeNull();
  });

  it("won't plan for another organization's outcome", async () => {
    await expect(planOutcomeRemoval("org-b", "out-1")).rejects.toBeInstanceOf(RemovalPlanError);
  });
});

describe("deleting an agent", () => {
  it("warns that deleting the agent alone strands its workers, and offers the team instead", async () => {
    const plan = await planAgentRemoval(ORG, "a-1");
    expect(plan.warning).toContain("leads a team of 1 worker");
    expect(plan.warning).toContain("leaves them with no team to run them");
    // The plan carries the team's own list, so the dialog can offer deleting it.
    expect(plan.team?.deletes).toEqual(["Fleet orchestrator", "Idle scanner"]);
  });

  it("carries no team for an agent that leads nobody", async () => {
    expect((await planAgentRemoval(ORG, "a-3")).team).toBeNull();
  });

  it("separates the links it deletes from the things they point at", async () => {
    const plan = await planAgentRemoval(ORG, "a-1");
    expect(plan.goes).toContain("1 knowledge base link (the knowledge bases themselves stay)");
    expect(plan.goes).toContain("its mandate, task classes and warrants");
    expect(plan.stays).toContain("its past runs stay in the run history");
  });

  it("tells a worker which teams it worked in", async () => {
    const plan = await planAgentRemoval(ORG, "a-2");
    expect(plan.warning).toBeNull();
    expect(plan.stays).toContain("the 1 team it worked in: Fleet orchestrator");
  });
});

describe("naming what is affected", () => {
  it("names a few and counts the rest, rather than printing a wall of names", () => {
    // Live, one outcome carried three teams: fifteen agents in one sentence,
    // with names repeating because separate teams name their workers alike.
    const many = ["A", "B", "C", "D", "E", "F", "G"];
    expect(namedList(many)).toBe("A, B, C, D, E and 2 more");
    expect(namedList(["A", "B"])).toBe("A, B");
    expect(namedList(many.slice(0, NAMES_SHOWN))).toBe("A, B, C, D, E");
  });

  it("keeps the count exact even when the names are cut short", async () => {
    state.agents = [
      { id: "a-1", name: "Fleet orchestrator", organizationId: ORG },
      ...Array.from({ length: 8 }, (_, i) => ({ id: `w-${i}`, name: `Worker ${i}`, organizationId: ORG, outcomeId: "out-1" })),
    ];
    const plan = await planOutcomeRemoval(ORG, "out-1");
    expect(plan.stays[0]).toContain("8 agents stay");
    expect(plan.stays[0]).toContain("and 3 more");
  });
});

describe("the dialog", () => {
  it("names what is being deleted", () => {
    expect(removeTitle("outcome", "Cut rental idle time")).toBe('Delete outcome "Cut rental idle time"?');
  });

  it("won't let anyone confirm a list they haven't seen", () => {
    expect(dialog).toContain("disabled={remove.isPending || !plan.data}");
  });

  it("shows what goes, what stays and the warning, then says it can't be undone", () => {
    expect(dialog).toContain('data-testid="list-removal-goes"');
    expect(dialog).toContain('data-testid="list-removal-stays"');
    expect(dialog).toContain('data-testid="text-removal-warning"');
    expect(dialog).toContain("This can't be undone.");
  });
});

describe("the pages that lost delete in the redesign", () => {
  it("the outcomes page has it back, beside Open", () => {
    expect(outcomesPage).toContain('import { RemoveDialog } from "@/components/remove-dialog";');
    expect(outcomesPage).toContain('noun="outcome"');
    expect(outcomesPage).toContain('planUrl={`/api/outcomes/${outcome.id}/removal`}');
  });

  it("the agent page has it back, and leaves the page afterwards", () => {
    expect(agentPage).toContain('noun="agent"');
    expect(agentPage).toContain('onDeleted={() => navigate("/agents")}');
  });

  it("both plans are served from routes of their own", () => {
    expect(outcomeRoutes).toContain('router.get("/api/outcomes/:id/removal"');
    expect(agentRoutes).toContain('router.get("/api/agents/:id/removal"');
    // Reading what a delete would take changes nothing, so it is not a write.
    expect(outcomeRoutes).toContain('router.delete("/api/outcomes/:id", checkPermission("create_modify_outcomes")');
    expect(agentRoutes).toContain('router.delete("/api/agents/:id", checkPermission("create_modify_blueprints")');
  });
});
