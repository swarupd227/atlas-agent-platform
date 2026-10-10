/**
 * Deleting a team from the Agents page.
 *
 * `deleteAgent` deletes one agent, so deleting a team's orchestrator left
 * every worker behind — agents with no team to run them, indistinguishable in
 * the registry from ones somebody meant to build. The Journey Library already
 * solved this; the rule now lives in one place so both surfaces answer the
 * same way, including that a worker another team uses is not this team's to
 * delete.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { teamButtonLabel } from "../client/src/components/remove-dialog";

const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");
const routes = read("server", "routes", "agents.ts");
const dialog = read("client", "src", "components", "remove-dialog.tsx");
const agentPage = read("client", "src", "pages", "agent-overview.tsx");
const journeyActions = read("server", "journey-actions.ts");

const ORG = "org-a";
const agents = new Map<string, any>();
const teams: Array<{ id: string; teamAgentId: string; memberAgentId: string }> = [];
const audits: any[] = [];
const deleted: string[] = [];
const flowUpdates: Array<{ id: string; patch: any }> = [];
let deployments: any[] = [];
let evalSuites: any[] = [];

vi.mock("../server/storage", () => ({
  storage: {
    getAgent: vi.fn(async (id: string, orgId?: string) => {
      const a = agents.get(id);
      return a && (!orgId || a.organizationId === orgId) ? a : undefined;
    }),
    getAgentTeamMembers: vi.fn(async (teamAgentId: string) => teams.filter((t) => t.teamAgentId === teamAgentId)),
    getAgentTeamsByMember: vi.fn(async (memberAgentId: string) => teams.filter((t) => t.memberAgentId === memberAgentId)),
    summarizeDagExecutionRunsByTeamAgent: vi.fn(async () => ({ total: 2, completed: 2, failed: 0, latest: null })),
    getProcessFlows: vi.fn(async () => [{ id: "flow-1", name: "Claims intake", teamAgentId: "team-1" }]),
    // The real one clears agent_teams rows in both directions; mirrored here so
    // the test proves this code doesn't need to repeat that.
    deleteAgent: vi.fn(async (id: string) => {
      deleted.push(id);
      agents.delete(id);
      for (let i = teams.length - 1; i >= 0; i--) if (teams[i].teamAgentId === id || teams[i].memberAgentId === id) teams.splice(i, 1);
      return true;
    }),
    updateProcessFlow: vi.fn(async (id: string, patch: any) => { flowUpdates.push({ id, patch }); return { id, ...patch }; }),
    // A deployment row outlives the agent it names, and nothing can reach it
    // afterwards -- there is no delete route for one.
    getDeployments: vi.fn(async (orgId?: string) => deployments.filter((d) => !orgId || d.organizationId === orgId)),
    updateDeployment: vi.fn(async (id: string, patch: any) => {
      const row = deployments.find((d) => d.id === id);
      if (row) Object.assign(row, patch);
      return row;
    }),
    createAuditEvent: vi.fn(async (e: any) => { audits.push(e); return e; }),
    // An eval suite names only its agent, so it is reachable exactly once:
    // while that agent still exists.
    getEvalsByAgent: vi.fn(async (agentId: string) => evalSuites.filter((s) => s.agentId === agentId)),
    // Stricter than the read on purpose -- a suite this caller's org does not
    // own is not deletable by it, even when it is visible to it.
    deleteEvalSuite: vi.fn(async (id: string, orgId?: string) => {
      const i = evalSuites.findIndex((s) => s.id === id && (!orgId || s.organizationId === orgId));
      if (i < 0) return undefined;
      const [s] = evalSuites.splice(i, 1);
      return { id: s.id, name: s.name, testCases: s.testCases ?? 0, runs: s.runs ?? 0, caseResults: s.caseResults ?? 0 };
    }),
  },
}));

const { deleteTeam, planTeamRemoval, TeamRemovalError } = await import("../server/team-removal");

const actor = { orgId: ORG, actorId: "user-1", actorLabel: "admin", via: "Agents page" };

beforeEach(() => {
  agents.clear();
  teams.length = 0;
  audits.length = 0;
  deleted.length = 0;
  flowUpdates.length = 0;
  evalSuites = [
    { id: "es-team", organizationId: ORG, agentId: "team-1", name: "Claims intake team - Auto-Generated Suite", totalCases: 8, lastRunAt: new Date("2026-09-01"), testCases: 8, runs: 3, caseResults: 24 },
    { id: "es-worker", organizationId: ORG, agentId: "w-1", name: "Intake worker - Baseline Suite", totalCases: 4, lastRunAt: null, testCases: 4, runs: 0, caseResults: 0 },
    { id: "es-shared", organizationId: ORG, agentId: "w-2", name: "Shared assessor - Baseline Suite", totalCases: 2, lastRunAt: null, testCases: 2, runs: 0, caseResults: 0 },
    { id: "es-other-org", organizationId: "org-b", agentId: "team-1", name: "Another tenant's suite on the same agent", totalCases: 1, lastRunAt: null, testCases: 1, runs: 0, caseResults: 0 },
  ];
  deployments = [
    { id: "dep-team-live", organizationId: ORG, agentId: "team-1", agentName: "Claims intake team", environment: "pilot", status: "active" },
    { id: "dep-team-old", organizationId: ORG, agentId: "team-1", agentName: "Claims intake team", environment: "staging", status: "promoted" },
    { id: "dep-worker", organizationId: ORG, agentId: "w-1", agentName: "Intake worker", environment: "staging", status: "pending" },
    { id: "dep-shared", organizationId: ORG, agentId: "w-2", agentName: "Shared assessor", environment: "staging", status: "active" },
    { id: "dep-other-org", organizationId: "org-b", agentId: "team-1", agentName: "Claims intake team", environment: "prod", status: "active" },
  ];
  const add = (id: string, name: string, over: any = {}) => agents.set(id, { id, name, organizationId: ORG, isCuratedJourney: false, ...over });
  add("team-1", "Claims intake team");
  add("team-2", "Another team");
  add("w-1", "Intake worker");
  add("w-2", "Shared assessor");
  add("solo", "A lone agent");
  teams.push({ id: "m1", teamAgentId: "team-1", memberAgentId: "w-1" });
  teams.push({ id: "m2", teamAgentId: "team-1", memberAgentId: "w-2" });
  teams.push({ id: "m3", teamAgentId: "team-2", memberAgentId: "w-2" });
});

describe("what deleting a team would take", () => {
  it("is the orchestrator and the workers only it uses", async () => {
    const plan = await planTeamRemoval(ORG, "team-1");
    expect(plan.deletes).toEqual(["Claims intake team", "Intake worker"]);
    expect(plan.keeps).toEqual(["Shared assessor (also used by Another team)"]);
    expect(plan.runCount).toBe(2);
    expect(plan.processFlowName).toBe("Claims intake");
  });

  it("says whether the team is also in the Journey Library", async () => {
    expect((await planTeamRemoval(ORG, "team-1")).inLibrary).toBe(false);
    agents.get("team-1").isCuratedJourney = true;
    expect((await planTeamRemoval(ORG, "team-1")).inLibrary).toBe(true);
  });

  it("is an empty team for an agent that leads nobody", async () => {
    const plan = await planTeamRemoval(ORG, "solo");
    expect(plan.deletes).toEqual(["A lone agent"]);
    expect(plan.workers).toEqual([]);
  });

  it("won't reach into another organization", async () => {
    await expect(planTeamRemoval("org-b", "team-1")).rejects.toBeInstanceOf(TeamRemovalError);
  });
});

/**
 * A deployment row names an agent and outlives it. Nothing here or in the agent
 * delete route used to touch them, and there is no delete route for one, so a
 * removed team left its deployments behind still saying "active" or "pending" for
 * an agent that no longer exists -- 402 such rows measured on Azure 2026-09-27,
 * mostly from long-deleted test agents.
 */
describe("the deployments of a team being deleted", () => {
  it("are listed in the plan before anything happens, so the dialog can say so", async () => {
    const plan = await planTeamRemoval(ORG, "team-1");
    expect(plan.liveDeployments.map((d) => d.id).sort()).toEqual(["dep-team-live", "dep-worker"]);
  });

  it("leaves out one that is already over, because there is nothing to retire", async () => {
    const plan = await planTeamRemoval(ORG, "team-1");
    expect(plan.liveDeployments.map((d) => d.id)).not.toContain("dep-team-old");
  });

  it("leaves out a shared worker's, because that worker keeps running for its other team", async () => {
    const plan = await planTeamRemoval(ORG, "team-1");
    expect(plan.liveDeployments.map((d) => d.id)).not.toContain("dep-shared");
  });

  it("leaves another organization's alone", async () => {
    const plan = await planTeamRemoval(ORG, "team-1");
    expect(plan.liveDeployments.map((d) => d.id)).not.toContain("dep-other-org");
  });

  it("are retired when the team goes, not deleted, so the record that it ran stays", async () => {
    const result = await deleteTeam(actor, "team-1");
    expect(deployments.find((d) => d.id === "dep-team-live").status).toBe("retired");
    expect(deployments.find((d) => d.id === "dep-worker").status).toBe("retired");
    // Still there, and still naming the agent.
    expect(deployments.find((d) => d.id === "dep-team-live").agentName).toBe("Claims intake team");
    expect(result.deploymentsRetired.map((d) => d.id).sort()).toEqual(["dep-team-live", "dep-worker"]);
  });

  it("spares the shared worker's and the other organization's when it happens", async () => {
    await deleteTeam(actor, "team-1");
    expect(deployments.find((d) => d.id === "dep-shared").status).toBe("active");
    expect(deployments.find((d) => d.id === "dep-other-org").status).toBe("active");
  });

  it("says what it retired on the audit event, since the rows are all that is left afterwards", async () => {
    await deleteTeam(actor, "team-1");
    const details = JSON.parse(audits.at(-1).details);
    expect(details.deploymentsRetired).toEqual([
      "Claims intake team pilot (was active)",
      "Intake worker staging (was pending)",
    ]);
  });

  it("closes them while the agents still exist, or they could never be matched again", () => {
    // Order matters: getDeployments is by organization, but the agent ids are what
    // identify the rows, and after deleteAgent there is nothing to match.
    const source = read("server", "team-removal.ts");
    const retireAt = source.indexOf("retireDeploymentsFor(actor.orgId");
    const deleteAt = source.indexOf("await storage.deleteAgent(worker.id");
    expect(retireAt).toBeGreaterThan(0);
    expect(retireAt).toBeLessThan(deleteAt);
  });
});

/**
 * Eval suites, added 2026-10-09 for the same gap the deployments had: nothing
 * cleaned them up, so an agent's suite outlived it. Measured on Azure that day:
 * 832 suites naming agents that no longer exist, 831 distinct dead agents, and
 * 0 of the 832 carrying a golden dataset or a skill — so a stranded suite can
 * never be re-attributed, re-run, or removed. Deleted with the agent rather
 * than retired, because a retired suite that no reader filters out is a row
 * that looks handled and is not.
 */
describe("the eval suites of the agents going", () => {
  it("go with them, carrying their test cases, runs and results", async () => {
    const result = await deleteTeam(actor, "team-1");
    expect(result.evalSuitesDeleted.map((s) => s.id).sort()).toEqual(["es-team", "es-worker"]);
    expect(evalSuites.map((s) => s.id).sort()).toEqual(["es-other-org", "es-shared"]);
    // The counts are what the audit event reports; a suite reported deleted
    // with no numbers would read as "nothing was lost".
    const team = result.evalSuitesDeleted.find((s) => s.id === "es-team")!;
    expect(team).toMatchObject({ testCases: 8, runs: 3, caseResults: 24 });
  });

  it("spares a shared worker's, because that worker still exists to own it", async () => {
    await deleteTeam(actor, "team-1");
    expect(evalSuites.some((s) => s.id === "es-shared")).toBe(true);
  });

  it("spares another organization's suite on the same agent", async () => {
    // Visible to this tenant is not deletable by it: the suite row carries its
    // own organization, and the delete has to match it, not merely see it.
    await deleteTeam(actor, "team-1");
    expect(evalSuites.some((s) => s.id === "es-other-org")).toBe(true);
  });

  it("reports a suite it could not claim as left behind, not as deleted", async () => {
    const result = await deleteTeam(actor, "team-1");
    const details = JSON.parse(audits[0].details);
    expect(details.evalSuitesDeleted).toEqual([
      "Claims intake team - Auto-Generated Suite (8 cases, 3 runs, 24 results)",
      "Intake worker - Baseline Suite (4 cases, 0 runs, 0 results)",
    ]);
    // es-other-org is on a going agent but is not ours to delete, so it has to
    // appear here rather than silently nowhere.
    expect(details.evalSuitesLeft).toEqual(["Another tenant's suite on the same agent"]);
    expect(result.evalSuitesDeleted).toHaveLength(2);
  });

  it("deletes them while the agents still exist, or they could never be found again", () => {
    const source = read("server", "team-removal.ts");
    const deleteSuitesAt = source.indexOf("deleteEvalSuitesFor(actor.orgId");
    const deleteAgentAt = source.indexOf("await storage.deleteAgent(worker.id");
    expect(deleteSuitesAt).toBeGreaterThan(0);
    expect(deleteSuitesAt).toBeLessThan(deleteAgentAt);
  });

  it("never fails the agent delete when a suite cannot be removed", async () => {
    const { storage } = await import("../server/storage");
    (storage.deleteEvalSuite as any).mockImplementationOnce(async () => { throw new Error("db down"); });
    const result = await deleteTeam(actor, "team-1");
    // The agent still goes; only that one suite is reported undeleted.
    expect(deleted.sort()).toEqual(["team-1", "w-1"]);
    expect(result.evalSuitesDeleted.map((s) => s.id)).not.toContain("es-team");
  });
});

describe("deleting it", () => {
  it("takes the orchestrator and its own workers, and spares the shared one", async () => {
    const result = await deleteTeam(actor, "team-1");
    expect(deleted.sort()).toEqual(["team-1", "w-1"]);
    expect(agents.get("w-2")).toBeTruthy();
    expect(result.kept).toEqual(["Shared assessor (also used by Another team)"]);
  });

  it("leaves the other team's membership row alone", async () => {
    await deleteTeam(actor, "team-1");
    expect(teams.map((t) => t.id)).toEqual(["m3"]);
  });

  it("records one audit event naming where it was done and what was kept", async () => {
    await deleteTeam(actor, "team-1");
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ action: "team_deleted", actorId: "user-1", objectId: "team-1" });
    const details = JSON.parse(audits[0].details);
    expect(details).toMatchObject({ via: "Agents page", runsKept: 2, processFlowKept: "Claims intake", processFlowUnlinked: true, fromLibrary: false });
    expect(details.kept).toEqual(["Shared assessor (also used by Another team)"]);
  });
});

describe("the Agents page", () => {
  it("offers deleting the team as a second, clearly bigger action", () => {
    expect(teamButtonLabel({ deletes: ["a", "b", "c"] })).toBe("Delete the team (3 agents)");
    expect(dialog).toContain('data-testid="button-delete-team"');
    expect(dialog).toContain("Or delete the whole team");
    // Deleting the agent alone stays available, and reads as the lesser act.
    expect(dialog).toContain("`Delete ${noun} only`");
  });

  it("names every agent that would go, and why a worker stays", () => {
    expect(dialog).toContain('data-testid="list-team-deletes"');
    expect(dialog).toContain("another team uses it, so it stays");
  });

  it("has the route behind the permission that edits a team", () => {
    expect(routes).toContain('router.delete("/api/agents/:id/team", checkPermission("create_modify_blueprints")');
    expect(routes).toContain('via: "Agents page"');
    expect(agentPage).toContain('teamDeleteUrl={`/api/agents/${agent.id}/team`}');
  });
});

describe("the Journey Library", () => {
  it("deletes through the same function, so both surfaces answer alike", () => {
    expect(journeyActions).toContain('from "./team-removal"');
    expect(journeyActions).toContain("return deleteTeam(actor, teamAgentId);");
    // Unlisting has no equivalent elsewhere, so it stays in the journey module.
    expect(journeyActions).toContain('action: "journey_unlisted"');
  });
});

describe("the process flow it was built from", () => {
  it("stays, but stops pointing at an agent that no longer exists", async () => {
    // Cowork can now build a team from a library flow, which links the two. The
    // Studio reads that link to offer "sync to automation", so leaving it behind
    // after the team is gone offers a sync to nothing.
    await deleteTeam(actor, "team-1");
    expect(flowUpdates).toEqual([{ id: "flow-1", patch: { teamAgentId: null } }]);
    // The flow itself is never deleted: a process can outlive the team that ran it.
    expect(deleted).not.toContain("flow-1");
  });
});
