/**
 * Deploy & Operate pack: production needs deploy_prod, gates that block are
 * explained rather than failed, rollout changes wait for a pending approval,
 * and deployments are always created pending without bypass flags.
 */
import { describe, it, expect, vi } from "vitest";

const calls = vi.hoisted(() => ({ create: [] as any[], promote: [] as any[] }));

vi.mock("../server/deployment-actions", () => ({
  checkDeploymentFreeze: vi.fn(async () => ({ frozen: false })),
  createDeploymentAction: vi.fn(async (ctx: any, body: any) => { calls.create.push({ ctx, body }); return { status: 201, body: { id: "dep-new", ...body, approval: null } }; }),
  promoteDeploymentAction: vi.fn(async (ctx: any, id: string, body: any) => { calls.promote.push({ ctx, id, body }); return { status: 201, body: { id: "dep-2" } }; }),
  changeRoutingAction: vi.fn(),
  rollbackDeploymentAction: vi.fn(),
}));

vi.mock("../server/storage", () => ({
  storage: {
    getAgent: vi.fn(async (id: string, orgId: string) => (id === "ag-1" && orgId === "org-a" ? { id, name: "Invoice Agent", organizationId: "org-a", currentVersion: "2.1.0" } : undefined)),
    getDeployment: vi.fn(async (id: string, orgId: string) => (id === "dep-1" && orgId === "org-a" ? { id, organizationId: "org-a" } : undefined)),
  },
}));

import { deployServices } from "../server/astra/deploy-services";
import { runTurn, resolveAction } from "../server/astra/engine";
import { ToolRegistry } from "../server/astra/registry";
import { MemoryThreadStore } from "../server/astra/memory-store";
import { scriptedComplete, result, call } from "../server/astra/scripted-brain";
import { finishTurnTool } from "../server/astra/tools/finish-turn";
import { loadToolsTool } from "../server/astra/tools/load-tools";
import { DEPLOY_TOOLS } from "../server/astra/tools/deploy";
import { hasPermission, type RoleId } from "../server/permissions";

const ROLES: RoleId[] = ["admin", "outcome_owner", "agent_engineer", "ops_sre", "compliance_security", "expert_validator", "finance", "domain_expert"];
const stagingOnlyRole = ROLES.find((r) => hasPermission(r, "deploy_staging_pilot") && !hasPermission(r, "deploy_prod"));

describe("deploy services", () => {
  it("always create deployments pending, with the agent's version and no bypass flags", async () => {
    await deployServices.deployAgentAs("org-a", "ag-1", "pilot", "canary");
    expect(calls.create[0]).toEqual({ ctx: { orgId: "org-a" }, body: { agentId: "ag-1", agentName: "Invoice Agent", environment: "pilot", status: "pending", version: "2.1.0", rolloutStrategy: "canary" } });
    await deployServices.promoteDeploymentAs("org-a", "dep-1");
    expect(calls.promote[0]).toEqual({ ctx: { orgId: "org-a" }, id: "dep-1", body: {} });
    await expect(deployServices.promoteDeploymentAs("org-a", "dep-other")).rejects.toThrow("No deployment");
    await expect(deployServices.deployAgentAs("org-b", "ag-1", "staging", undefined)).rejects.toThrow("No agent");
  });
});

function setup(steps: Parameters<typeof scriptedComplete>[0], over: Record<string, any> = {}) {
  const store = new MemoryThreadStore();
  const threadId = store.createThread("org-a");
  const view = { id: "dep-1", agentId: "ag-1", agentName: "Invoice Agent", environment: "pilot", status: "active", canaryPercent: 0, shadowEnabled: false, nextEnvironment: "prod", pendingApproval: null };
  const services = {
    listAgents: vi.fn(async () => [{ id: "ag-1", name: "Invoice Agent", organizationId: "org-a" }]),
    getAgent: vi.fn(async () => ({ id: "ag-1", riskTier: "MEDIUM" })),
    getDeploymentView: vi.fn(async (_o: string, id: string) => (id === "dep-1" || id === "dep-2" ? { ...view, id } : null)),
    listDeployments: vi.fn(async () => [view]),
    deploymentFreeze: vi.fn(async () => ({ frozen: false })),
    promoteDeploymentAs: vi.fn(async () => ({ status: 409, body: { blocked: true, reason: "policy_gate", message: "Promotion to prod blocked: 1 policy check(s) failed", failingChecks: [{ check: "unresolved_hard_violations", reason: "3 unresolved hard violations", severity: "error" }] } })),
    deployAgentAs: vi.fn(),
    changeRolloutAs: vi.fn(),
    getUserDisplayName: vi.fn(async () => "admin"),
    ...over,
  };
  const deps: any = { store, registry: new ToolRegistry([finishTurnTool, loadToolsTool, ...DEPLOY_TOOLS], hasPermission), complete: scriptedComplete(steps), can: hasPermission, audit: vi.fn(async () => {}), services, model: "test" };
  return { store, threadId, deps, services };
}
const load = { toolCalls: [{ name: "load_tools", arguments: { pack: "deploy" } }] };
const done = (t: string) => result(t, [call("finish_turn", { suggestions: [] })]);
const lastTool = (m: any[]) => JSON.parse(m.filter((x) => x.role === "tool").at(-1).content);

describe("deploy tools", () => {
  it("refuses production to a role without deploy_prod", async () => {
    // Every built-in role with deploy_staging_pilot also has deploy_prod today, so use a permission set without it.
    const t = setup([load, { toolCalls: [{ name: "deploy_agent", arguments: { agent: "Invoice Agent", environment: "prod" } }] }, (m) => {
      expect(lastTool(m).error).toContain("needs deploy_prod");
      return done("Can't.");
    }]);
    const withoutProd = (role: RoleId, p: any) => p !== "deploy_prod" && hasPermission(role, p);
    t.deps.can = withoutProd;
    t.deps.registry = new ToolRegistry([finishTurnTool, loadToolsTool, ...DEPLOY_TOOLS], withoutProd);
    await runTurn(t.deps, { orgId: "org-a", userId: "u1", role: "ops_sre" }, t.threadId, "Ship it to production", () => {});
    expect(t.services.deployAgentAs).not.toHaveBeenCalled();
    expect(stagingOnlyRole === undefined || !hasPermission(stagingOnlyRole, "deploy_prod")).toBe(true);
  });

  it("explains a blocked promotion with the gate's reasons instead of failing", async () => {
    const t = setup([load, { toolCalls: [{ name: "promote_deployment", arguments: { deployment: "Invoice Agent" } }] }, (m) => {
      expect(lastTool(m).result).toMatchObject({ ok: false, blocked: true, reason: "policy_gate", failingChecks: [expect.objectContaining({ check: "unresolved_hard_violations" })] });
      return done("Blocked by the policy gate.");
    }]);
    expect(await runTurn(t.deps, { orgId: "org-a", userId: "u1", role: "admin" }, t.threadId, "Promote Invoice Agent", () => {})).toBe("awaiting_confirmation");
    const action = (await t.store.loadThread(t.threadId, "org-a"))!.pendingAction!;
    expect(action.summary).toBe("Promote Invoice Agent pilot → prod");
    expect(action.details!.join(" ")).toContain("If one blocks, nothing changes");
    await resolveAction(t.deps, { orgId: "org-a", userId: "u1", role: "admin" }, t.threadId, action.id, "confirm", () => {});
    expect(t.services.promoteDeploymentAs).toHaveBeenCalledWith("org-a", "dep-1");
  });

  it("won't change the rollout of a deployment still waiting on its approval", async () => {
    const t = setup([load, { toolCalls: [{ name: "change_rollout", arguments: { deployment: "dep-1", action: "canary_start", percent: 10 } }] }, (m) => {
      expect(lastTool(m).error).toContain("decide that first");
      return done("Waiting on approval.");
    }], {
      getDeploymentView: vi.fn(async () => ({ id: "dep-1", agentId: "ag-1", agentName: "Invoice Agent", environment: "pilot", status: "pending", canaryPercent: 0, shadowEnabled: false, nextEnvironment: "prod", pendingApproval: { id: "apr-9", type: "deployment_review" } })),
    });
    await runTurn(t.deps, { orgId: "org-a", userId: "u1", role: "admin" }, t.threadId, "Start the canary", () => {});
    expect(t.services.changeRolloutAs).not.toHaveBeenCalled();
  });
});
