import type { AstraToolContext } from "../types";

/**
 * Find one of the organization's agents, policies or outcomes by id or name
 * (a leading @ is ignored): exact id, then exact name, then a unique partial
 * name. More than one match refuses and lists them.
 */
function pick<T extends { id: string; name: string }>(rows: T[], ref: string, noun: string): { item: T } | { refuse: string } {
  const byId = rows.find((r) => r.id === ref);
  if (byId) return { item: byId };
  const needle = ref.trim().replace(/^@/, "").toLowerCase();
  const exact = rows.filter((r) => r.name.toLowerCase() === needle);
  if (exact.length === 1) return { item: exact[0] };
  const matches = exact.length > 1 ? exact : rows.filter((r) => r.name.toLowerCase().includes(needle));
  if (matches.length === 1) return { item: matches[0] };
  if (matches.length === 0) return { refuse: `No ${noun} named "${ref}" in this organization.` };
  return { refuse: `Several ${noun}s match "${ref}": ${matches.slice(0, 6).map((r) => `${r.name} (${r.id})`).join("; ")}. Say which one.` };
}

export async function resolveAgentRef(ctx: AstraToolContext, ref: string) {
  const agents: Array<{ id: string; name: string; organizationId?: string | null }> = await ctx.services.listAgents(ctx.orgId);
  return pick(agents.filter((a) => a.organizationId === ctx.orgId), ref, "agent");
}

export async function resolvePolicyRef(ctx: AstraToolContext, ref: string) {
  const policies: Array<{ id: string; name: string }> = await ctx.services.listPolicies(ctx.orgId);
  return pick(policies, ref, "policy");
}

export async function resolveOutcomeRef(ctx: AstraToolContext, ref: string) {
  const outcomes: Array<{ id: string; name: string }> = await ctx.services.listOutcomeNames(ctx.orgId);
  return pick(outcomes, ref, "outcome");
}
