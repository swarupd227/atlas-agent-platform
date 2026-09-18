/**
 * Changing which policies apply where, shared by the governance routes and the
 * Astra Workspace: installing an industry policy pack, and binding a policy to
 * an agent or an outcome. Every change is audited in the organization.
 */
import { storage } from "./storage";
import { packPolicyPacks } from "@shared/industry-packs";
import type { Policy } from "@shared/schema";

export type Enforcement = "monitor" | "hard";

/** The industry policy packs the server knows, optionally for one industry. */
export function policyPackCatalog(industryId?: string | null) {
  return packPolicyPacks
    .filter((p) => !industryId || p.industry === industryId)
    .map((p) => ({ id: p.id, name: p.name, description: p.description, industry: p.industry, framework: p.framework, riskLevel: p.riskLevel, policies: p.policies.map((x) => ({ name: x.name, domain: x.domain, description: x.description })) }));
}

/** Create a pack's policies in the organization, skipping names that already exist (same rule as bulk-create). */
export async function installPolicyPack(input: { orgId: string; packId: string; actor: string; actorId: string; via: string }) {
  const pack = packPolicyPacks.find((p) => p.id === input.packId);
  if (!pack) throw new Error(`No policy pack "${input.packId}".`);
  const existing = new Set((await storage.getPolicies(input.orgId)).map((p) => p.name));
  const created: Policy[] = [];
  const skipped: string[] = [];
  for (const p of pack.policies) {
    if (existing.has(p.name)) {
      skipped.push(p.name);
      continue;
    }
    const policy = await storage.createPolicy({
      organizationId: input.orgId,
      name: p.name,
      domain: p.domain,
      description: p.description,
      policyJson: p.policyJson as Record<string, unknown>,
      scopeType: "org",
      status: "active",
    });
    existing.add(policy.name);
    created.push(policy);
  }
  await storage.createAuditEvent({
    organizationId: input.orgId,
    actorType: "user",
    actorId: input.actorId,
    action: "policy_pack_installed",
    objectType: "policy_pack",
    objectId: pack.id,
    details: `Policy pack "${pack.name}" installed by ${input.actor} (via ${input.via}): ${created.length} created, ${skipped.length} already present`,
  });
  return { pack: { id: pack.id, name: pack.name, framework: pack.framework }, created: created.map((p) => ({ id: p.id, name: p.name, domain: p.domain })), skipped };
}

/**
 * Bind a policy to one agent through agent.policyBindings (what the agent
 * wizard writes and resolvePolicyBundle reads). Re-binding updates the
 * enforcement.
 */
export async function bindPolicyToAgent(input: { orgId: string; policyId: string; agentId: string; enforcement: Enforcement; actor: string; actorId: string; via: string }) {
  const [policy, agent] = await Promise.all([storage.getPolicy(input.policyId, input.orgId), storage.getAgent(input.agentId, input.orgId)]);
  if (!policy) throw new Error("No policy with that id in this organization.");
  if (!agent || agent.organizationId !== input.orgId) throw new Error("No agent with that id in this organization.");
  const current = Array.isArray(agent.policyBindings) ? (agent.policyBindings as Array<{ policyId?: string; enforcement?: string }>) : [];
  const rebinding = current.some((b) => b.policyId === policy.id);
  const next = rebinding
    ? current.map((b) => (b.policyId === policy.id ? { ...b, enforcement: input.enforcement } : b))
    : [...current, { policyId: policy.id, enforcement: input.enforcement }];
  await storage.updateAgent(agent.id, { policyBindings: next } as any);
  await storage.createAuditEvent({
    organizationId: input.orgId,
    actorType: "user",
    actorId: input.actorId,
    action: "policy_bound",
    objectType: "agent",
    objectId: agent.id,
    details: `Policy "${policy.name}" ${rebinding ? "re-bound" : "bound"} to agent ${agent.name} with ${input.enforcement} enforcement by ${input.actor} (via ${input.via})`,
  });
  return { policy: { id: policy.id, name: policy.name }, agent: { id: agent.id, name: agent.name }, enforcement: input.enforcement, rebinding };
}

/**
 * Bind a policy to an outcome. An outcome-scoped policy is re-pointed; a
 * policy scoped elsewhere is cloned with outcome scope so its original
 * binding stays (moved from POST /api/policies/:id/bind-outcome).
 */
export async function bindPolicyToOutcome(input: { orgId: string | undefined; policy: Policy; outcomeId: string; actor: string; actorId: string }) {
  const { policy, outcomeId } = input;
  if (policy.scopeType === "outcome") {
    const updated = await storage.updatePolicy(policy.id, { scopeId: outcomeId }, input.orgId);
    await storage.createAuditEvent({
      organizationId: input.orgId,
      actorType: "user", actorId: input.actorId, action: "policy_bound",
      objectType: "policy", objectId: policy.id,
      details: `Policy "${policy.name}" re-bound to outcome ${outcomeId} by ${input.actor}`,
    });
    return { policy: updated ?? policy, cloned: false };
  }
  const clone = await storage.createPolicy({
    name: `${policy.name} (Outcome: ${outcomeId})`,
    description: policy.description,
    domain: policy.domain,
    status: policy.status,
    policyJson: policy.policyJson,
    scopeType: "outcome",
    scopeId: outcomeId,
    organizationId: policy.organizationId ?? undefined,
    version: 1,
  } as any);
  await storage.createAuditEvent({
    organizationId: input.orgId,
    actorType: "user", actorId: input.actorId, action: "policy_bound",
    objectType: "policy", objectId: clone.id,
    details: `Policy "${policy.name}" cloned to outcome ${outcomeId} by ${input.actor} (original scope "${policy.scopeType}:${policy.scopeId}" preserved)`,
  });
  return { policy: clone, cloned: true };
}
