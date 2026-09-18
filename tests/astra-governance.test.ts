/**
 * Governance pack tools through the Astra loop, with fake services.
 */
import { describe, it, expect, vi } from "vitest";
import { runTurn, resolveAction, type EngineDeps } from "../server/astra/engine";
import { ToolRegistry } from "../server/astra/registry";
import { MemoryThreadStore } from "../server/astra/memory-store";
import { scriptedComplete, result, call } from "../server/astra/scripted-brain";
import { finishTurnTool } from "../server/astra/tools/finish-turn";
import { loadToolsTool } from "../server/astra/tools/load-tools";
import { GOVERNANCE_TOOLS } from "../server/astra/tools/governance";
import { hasPermission, type RoleId } from "../server/permissions";
import type { AstraContext } from "../server/astra/types";

const ORG = "org-a";
const as = (role: RoleId): AstraContext => ({ orgId: ORG, userId: "user-1", role, industryId: "equipment_dealer" });
const done = (text: string) => result(text, [call("finish_turn", { suggestions: [] })]);
const lastTool = (m: any[]) => JSON.parse(m.filter((x) => x.role === "tool").at(-1).content);
const load = { toolCalls: [{ name: "load_tools", arguments: { pack: "governance" } }] };

function setup(steps: Parameters<typeof scriptedComplete>[0], over: Record<string, any> = {}) {
  const store = new MemoryThreadStore();
  const threadId = store.createThread(ORG);
  const services = {
    listAgents: vi.fn(async () => [{ id: "ag-1", name: "Invoice Agent", organizationId: ORG }, { id: "ag-x", name: "Invoice Agent Copy", organizationId: "org-b" }]),
    listPolicies: vi.fn(async () => [{ id: "pol-1", name: "No wire transfers", domain: "tool_permissions", status: "active", scopeType: "org", policyJson: { enforcement: "hard" } }]),
    listOutcomeNames: vi.fn(async () => [{ id: "out-1", name: "Reduce DSO" }]),
    explainPolicies: vi.fn(async () => ({ agent: { id: "ag-1", name: "Invoice Agent" }, applied: [{ id: "pol-1", name: "No wire transfers", scope: "org", domain: "tool_permissions", enforcement: "hard" }], blockedTools: ["send_wire"], monitoredTools: [], toolAllowlist: [], guardrailCount: 2, redactionPatternCount: 0 })),
    governanceReadiness: vi.fn(async () => ({ agent: { id: "ag-1", name: "Invoice Agent" }, industryId: null, passed: true, checked: false, message: "The agent has no industry (and the organization has none set), so no requirements were checked.", requirements: [] })),
    verifyAuditChain: vi.fn(async () => ({ valid: true, signatureValid: true, verifiedEvents: 120, signedEvents: 100, unsignedEvents: 20 })),
    listPolicyPacks: vi.fn(async () => [{ id: "dealer-pack", name: "Dealer Financial Controls Pack", industry: "equipment_dealer", framework: "SOX", policies: [{ name: "No wire transfers" }, { name: "Credit memo limits" }] }]),
    installPolicyPackAs: vi.fn(async () => ({ pack: { id: "dealer-pack", name: "Dealer Financial Controls Pack", framework: "SOX" }, created: [{ id: "pol-2", name: "Credit memo limits" }], skipped: ["No wire transfers"] })),
    bindPolicyAs: vi.fn(async (_o: string, _a: string, _id: string, f: any) => ({ kind: "agent", policy: { id: f.policyId, name: "No wire transfers" }, agent: { id: f.agentId, name: "Invoice Agent" }, enforcement: f.enforcement, rebinding: false })),
    getUserDisplayName: vi.fn(async () => "admin"),
    ...over,
  };
  const deps: EngineDeps = { store, registry: new ToolRegistry([finishTurnTool, loadToolsTool, ...GOVERNANCE_TOOLS], hasPermission), complete: scriptedComplete(steps), can: hasPermission, audit: vi.fn(async () => {}), services, model: "test" };
  return { store, threadId, deps, services, on: () => {} };
}

describe("governance pack", () => {
  it("explains an agent's policies, resolving the agent by name within the organization only", async () => {
    const t = setup([load, { toolCalls: [{ name: "explain_policies", arguments: { agent: "@invoice agent" } }] }, (m) => {
      expect(lastTool(m).result).toMatchObject({ agent: { id: "ag-1" }, blockedTools: ["send_wire"], byScope: { org: 1 } });
      return done("One policy applies.");
    }]);
    await runTurn(t.deps, as("agent_engineer"), t.threadId, "Which policies apply to Invoice Agent?", t.on);
    expect(t.services.explainPolicies).toHaveBeenCalledWith(ORG, "ag-1");
  });

  it("says readiness wasn't checked rather than reporting a pass", async () => {
    const t = setup([load, { toolCalls: [{ name: "check_governance_readiness", arguments: { agent: "ag-1" } }] }, (m) => {
      const r = lastTool(m);
      expect(r.result).toMatchObject({ checked: false, passed: null });
      return done("Nothing checked.");
    }]);
    await runTurn(t.deps, as("agent_engineer"), t.threadId, "Is it ready?", t.on);
    const final = t.store.threadMessages(t.threadId).at(-1)!;
    expect(final.proof!.compliance).toMatchObject({ status: "not_measured" });
  });

  it("verifies the organization's chain, and only for roles that may export audit bundles", async () => {
    const t = setup([load, { toolCalls: [{ name: "verify_audit_chain", arguments: {} }] }, (m) => {
      expect(lastTool(m).result).toMatchObject({ intact: true, eventsChecked: 120 });
      return done("Intact.");
    }]);
    await runTurn(t.deps, as("admin"), t.threadId, "Verify the audit chain", t.on);
    expect(t.services.verifyAuditChain).toHaveBeenCalledWith(ORG);
    expect(new ToolRegistry(GOVERNANCE_TOOLS, hasPermission).forRole("agent_engineer").map((x) => x.name)).not.toContain("verify_audit_chain");
  });

  it("installing a pack shows what will be created and what's already there, then installs on Confirm", async () => {
    const t = setup([load, { toolCalls: [{ name: "install_policy_pack", arguments: { pack: "dealer financial" } }] }, (m) => {
      expect(lastTool(m).result).toMatchObject({ installed: true, created: [{ name: "Credit memo limits" }] });
      return done("Installed.");
    }]);
    expect(await runTurn(t.deps, as("admin"), t.threadId, "Install the dealer controls", t.on)).toBe("awaiting_confirmation");
    const action = (await t.store.loadThread(t.threadId, ORG))!.pendingAction!;
    expect(action.summary).toBe("Install policy pack: Dealer Financial Controls Pack");
    expect(action.details!.join(" ")).toContain("1 policy will be created");
    expect(action.details!.join(" ")).toContain("Already installed, left as they are: No wire transfers");
    await resolveAction(t.deps, as("admin"), t.threadId, action.id, "confirm", t.on);
    expect(t.services.installPolicyPackAs).toHaveBeenCalledWith(ORG, "dealer-pack", "admin", "user-1");
  });

  it("binding says what hard enforcement does and binds the frozen policy and agent", async () => {
    const t = setup([load, { toolCalls: [{ name: "bind_policy", arguments: { policy: "wire", agent: "Invoice Agent", enforcement: "hard" } }] }, done("Bound.")]);
    await runTurn(t.deps, as("admin"), t.threadId, "Enforce the wire rule on Invoice Agent", t.on);
    const action = (await t.store.loadThread(t.threadId, ORG))!.pendingAction!;
    expect(action.details![0]).toContain("tools this policy blocks are refused");
    await resolveAction(t.deps, as("admin"), t.threadId, action.id, "confirm", t.on);
    expect(t.services.bindPolicyAs).toHaveBeenCalledWith(ORG, "admin", "user-1", { policyId: "pol-1", agentId: "ag-1", enforcement: "hard" });
  });

  it("refuses to bind without exactly one target", async () => {
    const t = setup([load, { toolCalls: [{ name: "bind_policy", arguments: { policy: "wire" } }] }, (m) => {
      expect(lastTool(m).error).toContain("either an agent or an outcome");
      return done("Which one?");
    }]);
    await runTurn(t.deps, as("admin"), t.threadId, "Bind it", t.on);
    expect(t.services.bindPolicyAs).not.toHaveBeenCalled();
  });
});
