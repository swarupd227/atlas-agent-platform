/**
 * Changing which policies an agent is held to after it was created.
 *
 * An agent's chosen policies are its policyBindings (resolvePolicyBundle in
 * server/routes/helpers.ts reads them on every run, so a change takes effect
 * on the next run, deployed or not). Changes split by direction:
 *
 *   add, or a stricter enforcement   applied at once, and audited per policy
 *   remove, or a weaker enforcement  needs a reason and an approval routed to
 *                                    compliance_security (or admin), and is
 *                                    applied only when that approval is approved
 *                                    by someone other than the requester
 *
 * Organization, outcome and environment policies reach an agent through their
 * own scope, not a binding, so they are changed on the policy (Governance), not
 * here. PATCH /api/agents/:id refuses a policyBindings edit that removes or
 * weakens anything (refusalForBindingPatch), so this is the only way to do it.
 */
import { storage } from "./storage";
import type { Approval } from "@shared/schema";

export const POLICY_CHANGE_APPROVAL_TYPE = "policy_binding_change";
export const POLICY_CHANGE_REVIEWER_ROLE = "compliance_security";

export interface PolicyBinding {
  policyId?: string;
  policyName?: string;
  enforcement?: string;
  [key: string]: unknown;
}

export interface PolicyChangeRequest {
  policyId: string;
  action: "add" | "remove" | "set_enforcement";
  enforcement?: string;
}

export type ChangeKind = "add" | "stricter" | "remove" | "weaker" | "unchanged";

export interface ClassifiedChange {
  policyId: string;
  policyName: string;
  kind: ChangeKind;
  from: string | null;
  to: string | null;
}

export class PolicyChangeError extends Error {
  constructor(message: string, readonly code: "not_found" | "invalid" | "reason_required") {
    super(message);
    this.name = "PolicyChangeError";
  }
}

/** Advisory < soft/monitor < hard/strict/block. An unknown or missing value counts as soft, the binding default. */
export function enforcementRank(e: string | null | undefined): number {
  switch ((e ?? "").toLowerCase()) {
    case "advisory": return 0;
    case "hard": case "strict": case "block": return 2;
    default: return 1;
  }
}

const ENFORCEMENTS = new Set(["advisory", "soft", "monitor", "hard", "strict", "block"]);

/** The binding for a policy, matched by id or, as the demo seeds bind, by name. */
export function findBinding(bindings: PolicyBinding[], policy: { id: string; name: string }): PolicyBinding | undefined {
  return bindings.find((b) => b.policyId === policy.id || (!b.policyId && b.policyName === policy.name));
}

export function classifyChange(bindings: PolicyBinding[], change: PolicyChangeRequest, policy: { id: string; name: string }): ClassifiedChange {
  const current = findBinding(bindings, policy);
  const from = current ? (current.enforcement ?? "soft") : null;
  const base = { policyId: policy.id, policyName: policy.name, from };
  if (change.action === "remove") {
    return current ? { ...base, kind: "remove", to: null } : { ...base, kind: "unchanged", to: null };
  }
  const to = change.enforcement ?? from ?? "soft";
  if (!current) return { ...base, kind: "add", to };
  const delta = enforcementRank(to) - enforcementRank(from);
  return { ...base, kind: delta > 0 ? "stricter" : delta < 0 ? "weaker" : "unchanged", to };
}

/** Applies classified changes to a binding list (removals drop the binding; the rest set enforcement). */
export function applyToBindings(bindings: PolicyBinding[], changes: ClassifiedChange[], policies: Map<string, { id: string; name: string; domain?: string | null; description?: string | null }>): PolicyBinding[] {
  let next = [...bindings];
  for (const c of changes) {
    const policy = policies.get(c.policyId) ?? { id: c.policyId, name: c.policyName };
    const matches = (b: PolicyBinding) => b.policyId === policy.id || (!b.policyId && b.policyName === policy.name);
    if (c.kind === "remove") {
      next = next.filter((b) => !matches(b));
    } else if (c.kind === "add") {
      if (!next.some(matches)) {
        next.push({ policyId: policy.id, policyName: policy.name, enforcement: c.to ?? "soft", domain: policy.domain ?? undefined, description: policy.description ?? undefined });
      }
    } else if (c.kind === "stricter" || c.kind === "weaker") {
      next = next.map((b) => (matches(b) ? { ...b, policyId: policy.id, policyName: policy.name, enforcement: c.to ?? b.enforcement } : b));
    }
  }
  return next;
}

const describe = (c: ClassifiedChange) => {
  switch (c.kind) {
    case "add": return `added "${c.policyName}" (${c.to})`;
    case "remove": return `removed "${c.policyName}" (was ${c.from})`;
    case "stricter": return `tightened "${c.policyName}" from ${c.from} to ${c.to}`;
    case "weaker": return `loosened "${c.policyName}" from ${c.from} to ${c.to}`;
    default: return `left "${c.policyName}" unchanged`;
  }
};

/** The refusal for a whole-list edit (PATCH /api/agents/:id) that removes or weakens a binding, or null. */
export function refusalForBindingPatch(current: PolicyBinding[], proposed: PolicyBinding[]): string | null {
  const looser: string[] = [];
  for (const b of current) {
    const label = b.policyName ?? b.policyId;
    const next = proposed.find((p) => (b.policyId && p.policyId === b.policyId) || (!b.policyId && p.policyName === b.policyName));
    if (!next) looser.push(`removes "${label}"`);
    else if (enforcementRank(next.enforcement ?? "soft") < enforcementRank(b.enforcement ?? "soft")) looser.push(`loosens "${label}"`);
  }
  return looser.length
    ? `This edit ${looser.join(" and ")}. Removing or loosening a policy needs a reason and an approval: use POST /api/agents/:id/policy-changes (the agent's Rules tab, "Edit policies").`
    : null;
}

export interface PolicyChangeActor {
  /** As shown on the approval and in the audit log. */
  label: string;
  userId?: string | null;
}

/**
 * Makes the requested changes: tighter ones now, looser ones as one approval.
 * Throws PolicyChangeError for an unknown agent or policy, or a looser change without a reason.
 */
export async function requestPolicyChanges(input: {
  orgId: string | undefined;
  agentId: string;
  changes: PolicyChangeRequest[];
  reason?: string;
  actor: PolicyChangeActor;
}) {
  const agent = await storage.getAgent(input.agentId, input.orgId);
  if (!agent) throw new PolicyChangeError("Agent not found.", "not_found");
  if (!Array.isArray(input.changes) || input.changes.length === 0) throw new PolicyChangeError("No changes given.", "invalid");

  const library = await storage.getPolicies(input.orgId);
  const byId = new Map(library.map((p) => [p.id, p]));
  const bindings = (Array.isArray(agent.policyBindings) ? agent.policyBindings : []) as PolicyBinding[];

  const classified: ClassifiedChange[] = [];
  for (const change of input.changes) {
    const policy = byId.get(change.policyId);
    if (!policy) throw new PolicyChangeError(`No policy ${change.policyId} in this organization.`, "not_found");
    if (change.action !== "add" && change.action !== "remove" && change.action !== "set_enforcement") throw new PolicyChangeError(`Unknown action "${change.action}".`, "invalid");
    if (change.enforcement !== undefined && !ENFORCEMENTS.has(change.enforcement)) throw new PolicyChangeError(`Unknown enforcement "${change.enforcement}".`, "invalid");
    if (change.action === "add" && policy.status !== "active" && !findBinding(bindings, policy)) {
      throw new PolicyChangeError(`"${policy.name}" is not active, so it can't be added.`, "invalid");
    }
    classified.push(classifyChange(bindings, change, policy));
  }

  const now = classified.filter((c) => c.kind === "add" || c.kind === "stricter");
  const later = classified.filter((c) => c.kind === "remove" || c.kind === "weaker");
  const reason = (input.reason ?? "").trim();
  if (later.length > 0 && !reason) {
    throw new PolicyChangeError("Removing or loosening a policy needs a reason.", "reason_required");
  }

  if (now.length > 0) {
    await storage.updateAgent(agent.id, { policyBindings: applyToBindings(bindings, now, byId) } as any, input.orgId);
    for (const c of now) {
      await storage.createAuditEvent({
        organizationId: input.orgId,
        actorType: "user",
        actorId: input.actor.userId ?? input.actor.label,
        action: c.kind === "add" ? "policy_binding_added" : "policy_binding_tightened",
        objectType: "agent",
        objectId: agent.id,
        details: `${input.actor.label} ${describe(c)} on agent ${agent.name}${reason ? `: ${reason}` : ""}`,
      });
    }
  }

  let approval: Approval | null = null;
  if (later.length > 0) {
    approval = await storage.createApproval({
      organizationId: input.orgId,
      type: POLICY_CHANGE_APPROVAL_TYPE,
      objectType: "agent",
      objectId: agent.id,
      objectName: `Policy change for ${agent.name}`,
      agentId: agent.id,
      status: "pending",
      requestedBy: input.actor.label,
      requiredReviewerRole: POLICY_CHANGE_REVIEWER_ROLE,
      riskScore: 6,
      description: `${input.actor.label} asks to ${later.map(describe).join("; ")}. Reason: ${reason}`,
      evidenceJson: {
        changes: later,
        reason,
        requesterLabel: input.actor.label,
        requesterUserId: input.actor.userId ?? null,
      },
    });
    await storage.createAuditEvent({
      organizationId: input.orgId,
      actorType: "user",
      actorId: input.actor.userId ?? input.actor.label,
      action: "policy_binding_change_requested",
      objectType: "agent",
      objectId: agent.id,
      details: `${input.actor.label} asked to ${later.map(describe).join("; ")} on agent ${agent.name} (approval ${approval.id}): ${reason}`,
    });
  }

  return {
    applied: now,
    pending: approval ? { approvalId: approval.id, changes: later } : null,
    unchanged: classified.filter((c) => c.kind === "unchanged"),
  };
}

/**
 * Refuses a policy change approval decided by the person who asked for it:
 * loosening an agent's governance takes two people. Null when allowed.
 */
export function selfApprovalRefusal(approval: Pick<Approval, "type" | "evidenceJson">, decider: PolicyChangeActor): string | null {
  if (approval.type !== POLICY_CHANGE_APPROVAL_TYPE) return null;
  const ev = (approval.evidenceJson ?? {}) as { requesterLabel?: string; requesterUserId?: string | null };
  const sameUser = !!ev.requesterUserId && !!decider.userId && ev.requesterUserId === decider.userId;
  const sameLabel = !!ev.requesterLabel && ev.requesterLabel === decider.label;
  return sameUser || sameLabel ? "You asked for this policy change, so someone else has to decide it." : null;
}

/** What deciding a policy change approval does: approved applies the looser changes; rejected changes nothing. */
export async function applyPolicyChangeDecision(approval: Approval, status: string | undefined, decidedBy: string, orgId: string | undefined): Promise<void> {
  if (approval.type !== POLICY_CHANGE_APPROVAL_TYPE || !approval.objectId || status !== "approved") return;
  const agent = await storage.getAgent(approval.objectId, orgId);
  if (!agent) return;
  const ev = (approval.evidenceJson ?? {}) as { changes?: ClassifiedChange[]; reason?: string };
  const changes = (ev.changes ?? []).filter((c) => c.kind === "remove" || c.kind === "weaker");
  if (changes.length === 0) return;
  const library = await storage.getPolicies(orgId);
  const bindings = (Array.isArray(agent.policyBindings) ? agent.policyBindings : []) as PolicyBinding[];
  await storage.updateAgent(agent.id, { policyBindings: applyToBindings(bindings, changes, new Map(library.map((p) => [p.id, p]))) } as any, orgId);
  for (const c of changes) {
    await storage.createAuditEvent({
      organizationId: orgId,
      actorType: "user",
      actorId: decidedBy,
      action: c.kind === "remove" ? "policy_binding_removed" : "policy_binding_loosened",
      objectType: "agent",
      objectId: agent.id,
      details: `${describe(c)} on agent ${agent.name}, approved by ${decidedBy} (approval ${approval.id})${ev.reason ? `: ${ev.reason}` : ""}`,
    });
  }
}
