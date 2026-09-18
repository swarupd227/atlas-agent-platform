/**
 * getWorkspaceAgents (server/workspace-run.ts): which agents the Workspace and
 * Astra offer. A team's internal workers are hidden, found with one query for
 * all teams rather than one per team.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const agents = [
  { id: "team-1", name: "Rental Team", agentType: "team", blueprintId: "bp-1", status: "active", riskTier: "LOW" },
  { id: "team-2", name: "Billing Team", agentType: "team", blueprintId: "bp-2", status: "active", riskTier: "LOW" },
  { id: "w-1", name: "Rental Worker", agentType: "single", status: "active", riskTier: "LOW" },
  { id: "w-2", name: "Billing Worker", agentType: "single", status: "active", riskTier: "LOW" },
  { id: "solo", name: "Standalone Agent", agentType: "single", status: "active", riskTier: "LOW", workspaceAudience: ["finance"] },
  { id: "draft", name: "Draft Agent", agentType: "single", status: "draft", riskTier: "LOW" },
];

const storage = vi.hoisted(() => ({
  getAgents: vi.fn(),
  getTeamBlueprintNodeRefs: vi.fn(),
  getTeamBlueprintNodes: vi.fn(),
  getSkillsByIds: vi.fn(async () => []),
}));

vi.mock("../server/storage", () => ({ storage }));

beforeEach(() => {
  vi.clearAllMocks();
  storage.getAgents.mockResolvedValue(agents);
  storage.getTeamBlueprintNodeRefs.mockResolvedValue([
    { blueprintId: "bp-1", refAgentId: "team-1" }, // the orchestrator node points at the team itself
    { blueprintId: "bp-1", refAgentId: "w-1" },
    { blueprintId: "bp-2", refAgentId: "w-2" },
    { blueprintId: "bp-2", refAgentId: null },
  ]);
});

describe("getWorkspaceAgents", () => {
  it("hides teams' internal workers, looking them up in one query", async () => {
    const { getWorkspaceAgents } = await import("../server/workspace-run");
    const names = (await getWorkspaceAgents("org-a", "admin")).map((a) => a.name);
    expect(names).toEqual(["Rental Team", "Billing Team", "Standalone Agent"]);
    expect(storage.getTeamBlueprintNodeRefs).toHaveBeenCalledTimes(1);
    expect(storage.getTeamBlueprintNodeRefs).toHaveBeenCalledWith(["bp-1", "bp-2"]);
    expect(storage.getTeamBlueprintNodes).not.toHaveBeenCalled();
  });

  it("uses agents the caller already loaded, and still applies the audience", async () => {
    const { getWorkspaceAgents } = await import("../server/workspace-run");
    const names = (await getWorkspaceAgents("org-a", "outcome_owner", agents as any)).map((a) => a.name);
    expect(names).toEqual(["Rental Team", "Billing Team"]);
    expect(storage.getAgents).not.toHaveBeenCalled();
  });
});
