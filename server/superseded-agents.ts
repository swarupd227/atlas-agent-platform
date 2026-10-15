/**
 * What becomes of an agent a flow sync has superseded.
 *
 * A sync that rebuilds a step deletes the step's blueprint node, takes its agent
 * out of the team and drafts a fresh one. The old agent stayed exactly as it
 * was: status active, listed on the Agents page, counted in the fleet, with the
 * card saying "Superseded -- retire manually when ready". Nobody did. Measured
 * on 2026-10-12: one journey rebuilt three times in a day had left eleven such
 * agents behind, each a worker the sync itself had drafted and replaced.
 *
 * So the sync now retires the agents it orphaned, under the same rule the team
 * delete applies to workers: only an agent no OTHER team uses, and only one
 * with no deployment still live. Anything else is kept and the reason is said.
 * Retiring is a status, not a delete -- the agent, its runs and its traces stay
 * readable, which is why this is safe to do without asking.
 */
import { storage } from "./storage";
import { liveDeploymentsFor } from "./team-removal";

export interface SupersededAgentOutcome {
  label: string;
  agentId: string;
  agentName: string;
  /** True when this sync retired it. */
  retired: boolean;
  /** Why it was left as it is, when it was. */
  keptBecause?: string;
}

export async function retireSupersededAgents(
  orgId: string | undefined,
  teamAgentId: string,
  superseded: Array<{ label: string; agentId: string }>,
  via: string,
): Promise<SupersededAgentOutcome[]> {
  const out: SupersededAgentOutcome[] = [];
  for (const s of superseded) {
    const agent = await storage.getAgent(s.agentId, orgId).catch(() => undefined);
    if (!agent) {
      out.push({ ...s, agentName: s.label, retired: false, keptBecause: "no longer exists" });
      continue;
    }
    const base = { label: s.label, agentId: s.agentId, agentName: agent.name };
    if (agent.status === "retired") {
      out.push({ ...base, retired: false, keptBecause: "already retired" });
      continue;
    }

    // A worker another team still runs is that team's, not this sync's to retire.
    let otherTeams: string[] = [];
    try {
      const memberships = await storage.getAgentTeamsByMember(s.agentId);
      const otherIds = memberships.map((m) => m.teamAgentId).filter((id) => id !== teamAgentId);
      const teams = await Promise.all(otherIds.map((id) => storage.getAgent(id, orgId).catch(() => undefined)));
      otherTeams = teams.filter((t): t is NonNullable<typeof t> => !!t).map((t) => t.name);
    } catch { otherTeams = []; }
    if (otherTeams.length) {
      out.push({ ...base, retired: false, keptBecause: `still used by ${otherTeams.join(", ")}` });
      continue;
    }

    let live: Array<{ environment: string; status: string }> = [];
    try { live = await liveDeploymentsFor(orgId, [s.agentId]); } catch { live = []; }
    if (live.length) {
      out.push({ ...base, retired: false, keptBecause: `has a live deployment (${live.map((d) => `${d.environment}: ${d.status}`).join(", ")})` });
      continue;
    }

    try {
      await storage.updateAgent(s.agentId, { status: "retired" } as any);
      await storage.createAuditEvent({
        actorType: "system",
        actorId: "process_flow_sync",
        action: "agent_retired",
        objectType: "agent",
        objectId: s.agentId,
        organizationId: orgId,
        details: JSON.stringify({ reason: "superseded by a flow sync", step: s.label, teamAgentId, previousStatus: agent.status, via }),
      } as any);
      out.push({ ...base, retired: true });
    } catch (err: any) {
      // The sync itself has succeeded by now; a failed retirement is reported, not thrown.
      out.push({ ...base, retired: false, keptBecause: `could not be retired: ${err?.message ?? err}` });
    }
  }
  return out;
}
