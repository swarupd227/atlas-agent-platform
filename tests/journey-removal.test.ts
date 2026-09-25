/**
 * Removing a journey.
 *
 * There was no way to: the Journey Library could list, open, clone and run,
 * and nothing else, so a journey built by mistake stayed forever. A journey is
 * a team whose orchestrator carries isCuratedJourney, so removing it is two
 * acts — unlist it, or delete the team — and deleting must not take a worker
 * another team also uses.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { deletesLine, keepsLines } from "../client/src/pages/journey-removal";

const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");
const routes = read("server", "routes", "journeys.ts");
const page = read("client", "src", "pages", "journeys.tsx");
const dialog = read("client", "src", "pages", "journey-removal.tsx");

const ORG = "org-a";
const agents = new Map<string, any>();
const teams: Array<{ id: string; teamAgentId: string; memberAgentId: string }> = [];
const audits: any[] = [];
const deleted: string[] = [];
const updates: Array<[string, any]> = [];

vi.mock("../server/storage", () => ({
  storage: {
    getAgent: vi.fn(async (id: string, orgId?: string) => {
      const a = agents.get(id);
      return a && (!orgId || a.organizationId === orgId) ? a : undefined;
    }),
    getAgentTeamMembers: vi.fn(async (teamAgentId: string) => teams.filter((t) => t.teamAgentId === teamAgentId)),
    getAgentTeamsByMember: vi.fn(async (memberAgentId: string) => teams.filter((t) => t.memberAgentId === memberAgentId)),
    summarizeDagExecutionRunsByTeamAgent: vi.fn(async () => ({ total: 4, completed: 3, failed: 1, latest: null })),
    getProcessFlows: vi.fn(async () => [{ id: "flow-1", name: "Claims intake", teamAgentId: "team-1" }]),
    deleteAgent: vi.fn(async (id: string) => { deleted.push(id); agents.delete(id); return true; }),
    deleteAgentTeamMember: vi.fn(async (id: string) => { const i = teams.findIndex((t) => t.id === id); if (i >= 0) teams.splice(i, 1); return true; }),
    updateAgent: vi.fn(async (id: string, patch: any) => { updates.push([id, patch]); Object.assign(agents.get(id) ?? {}, patch); return agents.get(id); }),
    createAuditEvent: vi.fn(async (e: any) => { audits.push(e); return e; }),
  },
}));

const { deleteJourney, planJourneyRemoval, unlistJourney, JourneyActionError } = await import("../server/journey-actions");

const actor = { orgId: ORG, actorId: "user-1", actorLabel: "admin", via: "Journey Library" };

beforeEach(() => {
  agents.clear();
  teams.length = 0;
  audits.length = 0;
  deleted.length = 0;
  updates.length = 0;
  const add = (id: string, name: string, over: any = {}) => agents.set(id, { id, name, organizationId: ORG, isCuratedJourney: false, ...over });
  add("team-1", "Claims intake journey", { isCuratedJourney: true });
  add("team-2", "Another team", { isCuratedJourney: true });
  add("w-1", "Intake worker");
  add("w-2", "Shared assessor");
  teams.push({ id: "m1", teamAgentId: "team-1", memberAgentId: "w-1" });
  teams.push({ id: "m2", teamAgentId: "team-1", memberAgentId: "w-2" });
  // The assessor serves another team too.
  teams.push({ id: "m3", teamAgentId: "team-2", memberAgentId: "w-2" });
});

describe("what removal would take", () => {
  it("names what goes and what stays, and why it stays", async () => {
    const plan = await planJourneyRemoval(ORG, "team-1");
    expect(plan.deletes).toEqual(["Claims intake journey", "Intake worker"]);
    expect(plan.keeps).toEqual(["Shared assessor (also used by Another team)"]);
    expect(plan.runCount).toBe(4);
    expect(plan.processFlowName).toBe("Claims intake");
  });

  it("refuses a team that isn't in the library, and one from another organization", async () => {
    agents.set("plain", { id: "plain", name: "Just a team", organizationId: ORG, isCuratedJourney: false });
    await expect(planJourneyRemoval(ORG, "plain")).rejects.toThrow("isn't in the Journey Library");
    await expect(planJourneyRemoval("org-b", "team-1")).rejects.toThrow("No journey with that id in this organization.");
    await expect(planJourneyRemoval(ORG, "team-1")).resolves.toBeTruthy();
  });
});

describe("taking it out of the library", () => {
  it("keeps the team, and says so in the audit trail", async () => {
    await unlistJourney(actor, "team-1");
    expect(updates).toEqual([["team-1", { isCuratedJourney: false }]]);
    expect(deleted).toEqual([]);
    expect(audits[0]).toMatchObject({ action: "journey_unlisted", actorId: "user-1", objectId: "team-1" });
    expect(JSON.parse(audits[0].details).effect).toContain("the team still exists");
  });
});

describe("deleting the team", () => {
  it("deletes the orchestrator and only the workers this journey uses", async () => {
    const result = await deleteJourney(actor, "team-1");
    expect(deleted).toContain("w-1");
    expect(deleted).toContain("team-1");
    // The shared assessor belongs to another team as well; it is not this journey's to delete.
    expect(deleted).not.toContain("w-2");
    expect(result.kept).toEqual(["Shared assessor (also used by Another team)"]);
    expect(agents.get("w-2")).toBeTruthy();
  });

  it("clears this team's membership rows without touching the other team's", async () => {
    await deleteJourney(actor, "team-1");
    expect(teams.map((t) => t.id)).toEqual(["m3"]);
  });

  it("keeps the runs, and says how many it kept", async () => {
    const result = await deleteJourney(actor, "team-1");
    expect(result.runCount).toBe(4);
    const details = JSON.parse(audits[0].details);
    expect(details).toMatchObject({ runsKept: 4, processFlowKept: "Claims intake" });
    expect(audits[0].action).toBe("journey_deleted");
    expect(details.deleted).toContain("Claims intake journey");
  });

  it("won't delete a team from another organization", async () => {
    await expect(deleteJourney({ ...actor, orgId: "org-b" }, "team-1")).rejects.toBeInstanceOf(JourneyActionError);
    expect(deleted).toEqual([]);
  });
});

describe("what the dialog says", () => {
  it("counts what goes, in words", () => {
    expect(deletesLine({ deletes: ["One"] })).toBe("1 agent is deleted:");
    expect(deletesLine({ deletes: ["One", "Two"] })).toBe("2 agents are deleted:");
  });

  it("lists what survives, and says nothing when nothing does", () => {
    expect(keepsLines({ keeps: ["Shared assessor (also used by Another team)"], runCount: 4, processFlowName: "Claims intake" })).toEqual([
      "Shared assessor (also used by Another team) — another team uses it, so it stays",
      "4 past runs stay in the run history",
      'the process flow "Claims intake" stays',
    ]);
    expect(keepsLines({ keeps: [], runCount: 1, processFlowName: null })).toEqual(["1 past run stays in the run history"]);
    expect(keepsLines({ keeps: [], runCount: 0, processFlowName: null })).toEqual([]);
  });

  it("offers both acts, and says deleting can't be undone", () => {
    expect(dialog).toContain("Take it out of the library");
    expect(dialog).toContain("Delete the team");
    expect(dialog).toContain("This can't be undone.");
    // Deleting is the destructive one and looks it.
    expect(dialog).toContain('data-testid="button-delete-journey"');
    expect(dialog).toContain("bg-destructive");
  });

  it("is on the journey panel, beside Clone", () => {
    expect(page).toContain('import { RemoveJourney } from "./journey-removal";');
    expect(page).toContain("<RemoveJourney journeyId={j.teamAgentId} journeyName={j.name} />");
  });
});

describe("the routes", () => {
  it("guard both writes with the permission that edits a team", () => {
    expect(routes).toContain('router.post("/api/journeys/:id/unlist", checkPermission("create_modify_blueprints")');
    expect(routes).toContain('router.delete("/api/journeys/:id", checkPermission("create_modify_blueprints")');
    expect(routes).toContain('router.get("/api/journeys/:id/removal"');
  });
});
