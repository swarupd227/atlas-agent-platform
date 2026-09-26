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
    createAuditEvent: vi.fn(async (e: any) => { audits.push(e); return e; }),
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
