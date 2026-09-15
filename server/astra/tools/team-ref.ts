import type { AstraToolContext } from "../types";

export interface TeamRef {
  id: string;
  name: string;
  status: string;
  riskTier: string | null;
  blueprintId: string | null;
}

/** Find one of the organization's teams by id or name (exact, then partial). */
export async function resolveTeam(ctx: AstraToolContext, ref: string): Promise<{ team: TeamRef } | { refuse: string }> {
  const teams: TeamRef[] = await ctx.services.listTeams(ctx.orgId);
  const byId = teams.find((t) => t.id === ref);
  if (byId) return { team: byId };
  const needle = ref.trim().toLowerCase();
  const exact = teams.filter((t) => t.name.toLowerCase() === needle);
  if (exact.length === 1) return { team: exact[0] };
  const partial = exact.length > 1 ? exact : teams.filter((t) => t.name.toLowerCase().includes(needle));
  if (partial.length === 1) return { team: partial[0] };
  if (partial.length === 0) return { refuse: `No team named "${ref}" in this organization.` };
  return { refuse: `Several teams match "${ref}": ${partial.slice(0, 6).map((t) => `${t.name} (${t.id})`).join("; ")}. Say which one.` };
}
