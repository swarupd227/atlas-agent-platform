/**
 * Which automation a saved process flow already became.
 *
 * Reported by a user who opened an existing flow and was still offered "Turn
 * into a live automation" -- for a flow that had been automated weeks earlier.
 * Pressing it does not relabel anything: the build makes a SECOND team from the
 * flow and re-points the flow at it, leaving the first team running and
 * orphaned.
 *
 * The cause was that the Studio answered the question itself, from the outcome
 * ("any team on this outcome that has a blueprint"), which is empty for a flow
 * opened from the library -- so the answer was always "not automated yet".
 * Astra's sync tool had always read the flow's own team_agent_id. This file
 * pins the one resolver both now use, and that the Studio asks it rather than
 * guessing again.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");

const ORG = "org-a";
const state = {
  flows: new Map<string, any>(),
  agents: new Map<string, any>(),
  /** Every (id, orgId) pair asked for, so a resolver that skips the org tenancy check fails here. */
  flowReads: [] as Array<{ id: string; orgId: string | undefined }>,
  agentReads: [] as Array<{ id: string; orgId: string | undefined }>,
};

vi.mock("../server/storage", () => ({
  storage: {
    getProcessFlow: vi.fn(async (id: string, orgId?: string) => {
      state.flowReads.push({ id, orgId });
      const flow = state.flows.get(id);
      // Tenancy: a flow of another organization is not found, as the real one does.
      return flow && (flow.organizationId ?? ORG) === orgId ? flow : undefined;
    }),
    getAgent: vi.fn(async (id: string, orgId?: string) => {
      state.agentReads.push({ id, orgId });
      return state.agents.get(id);
    }),
  },
}));

const STEPS = {
  nodes: [
    { id: "n1", type: "trigger", label: "Submission arrives" },
    { id: "n2", type: "ai_reasoning", label: "Assess the risk" },
  ],
  edges: [{ id: "e1", from: "n1", to: "n2" }],
};

function flow(over: Record<string, any> = {}) {
  return { id: "flow-1", name: "E&S intake", graph: { ...STEPS, name: "E&S intake" }, teamAgentId: null, organizationId: ORG, ...over };
}

beforeEach(() => {
  state.flows.clear();
  state.agents.clear();
  state.flowReads = [];
  state.agentReads = [];
});

describe("a flow finds the automation it became", () => {
  it("returns the team the build recorded on it", async () => {
    const { resolveFlowSyncTarget } = await import("../server/flow-sync-target");
    state.flows.set("flow-1", flow({ teamAgentId: "team-9" }));
    state.agents.set("team-9", { id: "team-9", name: "E&S Intake Journey", agentType: "team", blueprintId: "bp-3", outcomeId: null });

    const target = await resolveFlowSyncTarget(ORG, "flow-1");
    expect(target.ok).toBe(true);
    if (!target.ok) return;
    expect(target.teamAgent.id).toBe("team-9");
    expect(target.teamAgent.blueprintId).toBe("bp-3");
    // The graph comes back normalized, ready for the reconciliation.
    expect(target.graph.nodes.map(n => n.id)).toEqual(["n1", "n2"]);
    expect(target.flow.name).toBe("E&S intake");
  });

  it("finds it with no outcome anywhere in sight -- the case the Studio got wrong", async () => {
    const { resolveFlowSyncTarget } = await import("../server/flow-sync-target");
    // A library flow: no outcome on the flow, none on the team.
    state.flows.set("flow-1", flow({ teamAgentId: "team-9" }));
    state.agents.set("team-9", { id: "team-9", name: "Claims triage", agentType: "team", blueprintId: "bp-3", outcomeId: null });

    const target = await resolveFlowSyncTarget(ORG, "flow-1");
    expect(target.ok).toBe(true);
    if (!target.ok) return;
    expect(target.teamAgent.outcomeId ?? null).toBeNull();
  });

  it("says not_automated -- not 'no flow' -- when the flow has never been built from", async () => {
    const { resolveFlowSyncTarget } = await import("../server/flow-sync-target");
    state.flows.set("flow-1", flow({ teamAgentId: null }));

    const target = await resolveFlowSyncTarget(ORG, "flow-1");
    expect(target.ok).toBe(false);
    if (target.ok) return;
    expect(target.problem).toEqual({ code: "not_automated", flowName: "E&S intake" });
    // Nothing was looked up as an agent: there was no id to look up.
    expect(state.agentReads).toHaveLength(0);
  });

  it("distinguishes a deleted automation from one that never existed", async () => {
    const { resolveFlowSyncTarget } = await import("../server/flow-sync-target");
    state.flows.set("flow-1", flow({ teamAgentId: "team-gone" }));

    const target = await resolveFlowSyncTarget(ORG, "flow-1");
    expect(target.ok).toBe(false);
    if (target.ok) return;
    expect(target.problem).toEqual({ code: "team_missing", flowName: "E&S intake", teamAgentId: "team-gone" });
  });

  it("refuses an empty flow before it goes looking for a team", async () => {
    const { resolveFlowSyncTarget } = await import("../server/flow-sync-target");
    state.flows.set("flow-1", flow({ graph: { nodes: [], edges: [] }, teamAgentId: "team-9" }));

    const target = await resolveFlowSyncTarget(ORG, "flow-1");
    expect(target.ok).toBe(false);
    if (target.ok) return;
    expect(target.problem).toEqual({ code: "no_steps", flowName: "E&S intake" });
  });

  it("is scoped to the caller's organization, both reads", async () => {
    const { resolveFlowSyncTarget } = await import("../server/flow-sync-target");
    state.flows.set("flow-1", flow({ teamAgentId: "team-9", organizationId: "org-b" }));
    state.agents.set("team-9", { id: "team-9", name: "Someone else's", agentType: "team" });

    const target = await resolveFlowSyncTarget(ORG, "flow-1");
    expect(target.ok).toBe(false);
    if (target.ok) return;
    expect(target.problem.code).toBe("no_flow");
    expect(state.flowReads).toEqual([{ id: "flow-1", orgId: ORG }]);

    // And when it does resolve, the agent read carries the org too.
    state.flows.set("flow-2", flow({ id: "flow-2", teamAgentId: "team-9" }));
    await resolveFlowSyncTarget(ORG, "flow-2");
    expect(state.agentReads).toEqual([{ id: "team-9", orgId: ORG }]);
  });
});

describe("the Studio asks the flow instead of guessing from the outcome", () => {
  const page = read("client", "src", "pages", "process-flows.tsx");

  it("keeps the recorded team when a saved flow is loaded", () => {
    // Without this the library path has no id to resolve, which is the whole bug.
    expect(page).toContain("setRecordedTeamAgentId(rec.teamAgentId ?? null)");
  });

  it("looks the team up by id, with no outcome required", () => {
    expect(page).toContain('queryKey: ["/api/agents", knownTeamAgentId]');
    expect(page).toContain("enabled: !!knownTeamAgentId");
  });

  it("falls back to the whole agent list only when there is no recorded link", () => {
    // Pre-2026-09-24 flows carry no team_agent_id, so an outcome-attached flow
    // still needs the old heuristic -- but it is a fallback, and a far heavier read.
    const fallback = page.slice(page.indexOf('queryKey: ["/api/agents"],'));
    expect(fallback.slice(0, 200)).toContain("enabled: !!urlParams.outcomeId && !knownTeamAgentId");
  });

  it("offers to build only when nothing was built, and the three live-automation actions otherwise", () => {
    expect(page).toContain("nodeCount > 0 && !linkedTeamAgent");
    expect(page).toContain('data-testid="button-open-blueprint"');
    expect(page).toContain('data-testid="button-sync-to-automation"');
    expect(page).toContain('data-testid="button-rebuild-automation"');
  });

  it("puts a rebuild behind a confirm, and only a rebuild forces one", () => {
    const rebuild = page.slice(page.indexOf('data-testid="dialog-rebuild-confirm"'));
    expect(rebuild.slice(0, 2200)).toContain("syncMutation.mutate(true)");
    // The button itself opens the dialog rather than rebuilding on click.
    const button = page.slice(page.indexOf('data-testid="button-rebuild-automation"') - 400, page.indexOf('data-testid="button-rebuild-automation"'));
    expect(button).toContain("setRebuildConfirmOpen(true)");
  });

  it("syncs a library flow through the flow route, an outcome flow through the outcome route", () => {
    expect(page).toContain("`/api/process-flows/${savedFlowId}/sync-to-automation`");
    expect(page).toContain("`/api/outcomes/${urlParams.outcomeId}/process-flow/sync-to-automation`");
  });
});

describe("the flow-scoped sync route", () => {
  const routes = read("server", "routes", "outcomes.ts");

  it("exists, and resolves the target the same way Astra does", () => {
    expect(routes).toContain('router.post("/api/process-flows/:id/sync-to-automation"');
    expect(routes).toContain('resolveFlowSyncTarget(orgId, String(req.params.id))');
    expect(routes).toContain('checkPermission("create_modify_blueprints")');
  });

  it("answers a block, a needed choice and a summary identically in both lanes", () => {
    // Two routes wording the same three outcomes differently is how a Studio
    // starts reporting a successful sync that was actually blocked.
    expect(routes.match(/respondToFlowSync\(res, result/g) || []).toHaveLength(2);
  });
});
