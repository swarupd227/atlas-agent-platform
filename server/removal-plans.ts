/**
 * What deleting something would take, counted, before anyone confirms.
 *
 * The delete routes know how to clean up (storage.deleteOutcome and
 * deleteAgent between them clear a dozen tables); nothing told the person
 * first. So a page asking "delete this?" could only say "this can't be
 * undone", which is true and useless -- it doesn't say that the outcome's
 * three KPIs and their measurements go with it, or that an agent's mandate
 * and its team memberships do.
 *
 * Counted from the same tables the delete clears, so the list can't drift
 * from what happens. Anything detached rather than deleted is listed as
 * staying, because that is the part people are afraid of.
 */
import { storage } from "./storage";

export interface RemovalPlan {
  id: string;
  name: string;
  /** What is deleted with it, in plain words. */
  goes: string[];
  /** What survives, and what happens to it. */
  stays: string[];
  /** Said last, when the thing is more than it looks. */
  warning: string | null;
}

export class RemovalPlanError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** An outcome, its KPIs and their measurements; its agents and approvals are detached. */
export async function planOutcomeRemoval(orgId: string | undefined, outcomeId: string): Promise<RemovalPlan> {
  const outcome = await storage.getOutcome(outcomeId, orgId);
  if (!outcome) throw new RemovalPlanError("No outcome with that id in this organization.", 404);

  const kpis = await storage.getKpisByOutcome(outcomeId);
  const readings = await storage.getKpiReadingsByOutcome(outcomeId);
  const agents = (await storage.getAgents(orgId)).filter((a) => a.outcomeId === outcomeId);

  const goes: string[] = [];
  if (kpis.length) goes.push(`${plural(kpis.length, "KPI")}: ${kpis.map((k) => k.name).join(", ")}`);
  if (readings.length) goes.push(`${plural(readings.length, "recorded measurement")} of those KPIs`);
  goes.push("its events, invoices and billing disputes");

  const stays: string[] = [];
  if (agents.length) stays.push(`${plural(agents.length, "agent")} stay, no longer bound to an outcome: ${agents.map((a) => a.name).join(", ")}`);
  stays.push("its approvals stay in the audit trail, detached from it");

  return {
    id: outcome.id,
    name: outcome.name,
    goes,
    stays,
    warning: readings.length ? "The measurements recorded against it are deleted; only the audit trail keeps that they were taken." : null,
  };
}

/** An agent, everything attached to it, and — when it leads a team — what that means. */
export async function planAgentRemoval(orgId: string | undefined, agentId: string): Promise<RemovalPlan> {
  const agent = await storage.getAgent(agentId, orgId);
  if (!agent) throw new RemovalPlanError("No agent with that id in this organization.", 404);

  const [members, memberships, kbLinks, mcpLinks] = await Promise.all([
    storage.getAgentTeamMembers(agent.id),
    storage.getAgentTeamsByMember(agent.id),
    storage.getAgentKnowledgeBases(agent.id),
    storage.getAgentMcpServers(agent.id),
  ]);

  const goes: string[] = ["its mandate, task classes and warrants"];
  if (kbLinks.length) goes.push(`${plural(kbLinks.length, "knowledge base link")} (the knowledge bases themselves stay)`);
  if (mcpLinks.length) goes.push(`${plural(mcpLinks.length, "connector link")} (the connectors themselves stay)`);
  goes.push("its API keys, channels and triggers");

  const stays: string[] = ["its past runs stay in the run history"];
  if (memberships.length) {
    const teams = (await Promise.all(memberships.map((m) => storage.getAgent(m.teamAgentId, orgId)))).filter(Boolean);
    if (teams.length) stays.push(`the ${plural(teams.length, "team")} it worked in: ${teams.map((t) => t!.name).join(", ")}`);
  }

  // A team's workers are agents in their own right: deleting the orchestrator
  // does not delete them, and saying so is the difference between removing a
  // team and stranding one.
  const warning = members.length
    ? `This agent leads a team of ${plural(members.length, "worker")}. Deleting it removes the orchestrator only — the workers stay, with no team to run them.`
    : null;

  return { id: agent.id, name: agent.name, goes, stays, warning };
}
