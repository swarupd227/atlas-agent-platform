/**
 * server/policy-actions.ts: installing a policy pack and binding policies,
 * in the organization, audited.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { packPolicyPacks } from "../shared/industry-packs";

const db = vi.hoisted(() => ({ policies: [] as any[], agents: new Map<string, any>(), audit: [] as any[], nextId: 1 }));

vi.mock("../server/storage", () => ({
  storage: {
    getPolicies: vi.fn(async (orgId: string) => db.policies.filter((p) => p.organizationId === orgId)),
    getPolicy: vi.fn(async (id: string, orgId: string) => db.policies.find((p) => p.id === id && p.organizationId === orgId)),
    createPolicy: vi.fn(async (p: any) => { const row = { id: `pol-${db.nextId++}`, version: 1, ...p }; db.policies.push(row); return row; }),
    updatePolicy: vi.fn(async (id: string, data: any) => { const p = db.policies.find((x) => x.id === id); Object.assign(p, data); return p; }),
    getAgent: vi.fn(async (id: string, orgId: string) => { const a = db.agents.get(id); return a && a.organizationId === orgId ? { ...a } : undefined; }),
    updateAgent: vi.fn(async (id: string, data: any) => { db.agents.set(id, { ...db.agents.get(id), ...data }); return {}; }),
    createAuditEvent: vi.fn(async (e: any) => { db.audit.push(e); return e; }),
  },
}));

import { bindPolicyToAgent, bindPolicyToOutcome, installPolicyPack, policyPackCatalog } from "../server/policy-actions";

const actor = { actor: "admin", actorId: "user-1", via: "test" };
const pack = packPolicyPacks[0];

beforeEach(() => {
  db.policies.length = 0;
  db.audit.length = 0;
  db.agents.clear();
  db.agents.set("ag-1", { id: "ag-1", name: "Invoice Agent", organizationId: "org-a", policyBindings: null });
  db.agents.set("ag-x", { id: "ag-x", name: "Other", organizationId: "org-b" });
});

describe("installPolicyPack", () => {
  it("creates the pack's policies in the organization, skipping names already there, audited", async () => {
    db.policies.push({ id: "pol-existing", organizationId: "org-a", name: pack.policies[0].name });
    const r = await installPolicyPack({ ...actor, orgId: "org-a", packId: pack.id });
    expect(r.created).toHaveLength(pack.policies.length - 1);
    expect(r.skipped).toEqual([pack.policies[0].name]);
    expect(db.policies.filter((p) => p.id !== "pol-existing").every((p) => p.organizationId === "org-a" && p.scopeType === "org" && p.status === "active")).toBe(true);
    expect(db.audit).toEqual([expect.objectContaining({ organizationId: "org-a", action: "policy_pack_installed", objectId: pack.id })]);
  });

  it("lists packs for an industry", () => {
    expect(policyPackCatalog(pack.industry).every((p) => p.industry === pack.industry)).toBe(true);
    expect(policyPackCatalog("aerospace")).toEqual([]);
  });
});

describe("bindPolicyToAgent", () => {
  it("adds a binding with its enforcement, then re-binding changes the enforcement", async () => {
    db.policies.push({ id: "pol-1", organizationId: "org-a", name: "No wire transfers" });
    await bindPolicyToAgent({ ...actor, orgId: "org-a", policyId: "pol-1", agentId: "ag-1", enforcement: "monitor" });
    expect(db.agents.get("ag-1").policyBindings).toEqual([{ policyId: "pol-1", enforcement: "monitor" }]);
    const r = await bindPolicyToAgent({ ...actor, orgId: "org-a", policyId: "pol-1", agentId: "ag-1", enforcement: "hard" });
    expect(r.rebinding).toBe(true);
    expect(db.agents.get("ag-1").policyBindings).toEqual([{ policyId: "pol-1", enforcement: "hard" }]);
    expect(db.audit.map((e) => e.organizationId)).toEqual(["org-a", "org-a"]);
  });

  it("refuses another organization's agent or policy", async () => {
    db.policies.push({ id: "pol-1", organizationId: "org-a", name: "p" }, { id: "pol-b", organizationId: "org-b", name: "q" });
    await expect(bindPolicyToAgent({ ...actor, orgId: "org-a", policyId: "pol-1", agentId: "ag-x", enforcement: "hard" })).rejects.toThrow("No agent");
    await expect(bindPolicyToAgent({ ...actor, orgId: "org-a", policyId: "pol-b", agentId: "ag-1", enforcement: "hard" })).rejects.toThrow("No policy");
  });
});

describe("bindPolicyToOutcome", () => {
  it("re-points an outcome policy, and clones one scoped elsewhere; the audit event carries the organization", async () => {
    const outcomePolicy = { id: "pol-o", organizationId: "org-a", name: "Outcome rule", scopeType: "outcome", scopeId: "out-old" };
    const orgPolicy = { id: "pol-g", organizationId: "org-a", name: "Global rule", scopeType: "org", scopeId: null, policyJson: {}, domain: "data_handling", status: "active" };
    db.policies.push(outcomePolicy, orgPolicy);
    expect((await bindPolicyToOutcome({ orgId: "org-a", policy: outcomePolicy as any, outcomeId: "out-1", actor: "admin", actorId: "u1" })).cloned).toBe(false);
    expect(outcomePolicy.scopeId).toBe("out-1");
    const r = await bindPolicyToOutcome({ orgId: "org-a", policy: orgPolicy as any, outcomeId: "out-1", actor: "admin", actorId: "u1" });
    expect(r).toMatchObject({ cloned: true, policy: { scopeType: "outcome", scopeId: "out-1", name: "Global rule (Outcome: out-1)" } });
    expect(db.audit.every((e) => e.organizationId === "org-a")).toBe(true);
  });
});
