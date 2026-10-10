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
import { evalSuitesFor, liveDeploymentsFor, planTeamRemoval, type TeamRemovalPlan } from "./team-removal";

export interface RemovalPlan {
  id: string;
  name: string;
  /** What is deleted with it, in plain words. */
  goes: string[];
  /** What survives, and what happens to it. */
  stays: string[];
  /** Said last, when the thing is more than it looks. */
  warning: string | null;
  /** When this agent leads a team: what deleting the whole team would take. */
  team?: TeamRemovalPlan | null;
}

export class RemovalPlanError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Names, capped. An outcome with three teams on it listed fifteen agents in
 * one sentence -- with names repeating, because separate teams name their
 * workers alike -- which reads as noise rather than as information. The count
 * stays exact; only the naming is cut short.
 */
export const NAMES_SHOWN = 5;
export function namedList(names: string[]): string {
  if (names.length <= NAMES_SHOWN) return names.join(", ");
  const rest = names.length - NAMES_SHOWN;
  return `${names.slice(0, NAMES_SHOWN).join(", ")} and ${rest} more`;
}

/** An outcome, its KPIs and their measurements; its agents and approvals are detached. */
export async function planOutcomeRemoval(orgId: string | undefined, outcomeId: string): Promise<RemovalPlan> {
  const outcome = await storage.getOutcome(outcomeId, orgId);
  if (!outcome) throw new RemovalPlanError("No outcome with that id in this organization.", 404);

  const kpis = await storage.getKpisByOutcome(outcomeId);
  const readings = await storage.getKpiReadingsByOutcome(outcomeId);
  const agents = (await storage.getAgents(orgId)).filter((a) => a.outcomeId === outcomeId);

  const goes: string[] = [];
  if (kpis.length) goes.push(`${plural(kpis.length, "KPI")}: ${namedList(kpis.map((k) => k.name))}`);
  if (readings.length) goes.push(`${plural(readings.length, "recorded measurement")} of those KPIs`);
  goes.push("its events, invoices and billing disputes");

  const stays: string[] = [];
  if (agents.length) stays.push(`${plural(agents.length, "agent")} stay, no longer bound to an outcome: ${namedList(agents.map((a) => a.name))}`);
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
  // Said before the delete, because afterwards nobody can act on it: a deployment
  // row cannot be reached once its agent is gone, so "it is still deployed" has to
  // be answered here rather than discovered in a deployment list months later.
  const live = await liveDeploymentsFor(orgId, [agent.id]);
  if (live.length) {
    goes.push(`${plural(live.length, "deployment")} (${namedList(live.map((d) => `${d.environment}, now ${d.status}`))}) — retired, not deleted, so the record that it ran stays`);
  }
  // An eval suite names only its agent, so it cannot outlive it usefully: left
  // behind it can never be found, re-run or removed again, which is how 832 of
  // them accumulated on Azure. Said here with what goes with them, because the
  // measurements are the part worth hesitating over.
  const evalSuites = await evalSuitesFor([agent.id]);
  if (evalSuites.length) {
    const runs = evalSuites.reduce((n, s) => n + (s.lastRunAt ? 1 : 0), 0);
    goes.push(
      `${plural(evalSuites.length, "eval suite")}, with its test cases and recorded runs: ${namedList(evalSuites.map((s) => s.name))}${runs ? ` — ${runs} of them ${runs === 1 ? "has" : "have"} been run, and those recorded results go too` : " — none of them has ever been run"}`,
    );
  }
  if (kbLinks.length) goes.push(`${plural(kbLinks.length, "knowledge base link")} (the knowledge bases themselves stay)`);
  if (mcpLinks.length) goes.push(`${plural(mcpLinks.length, "connector link")} (the connectors themselves stay)`);
  goes.push("its API keys, channels and triggers");

  const stays: string[] = ["its past runs stay in the run history"];
  if (memberships.length) {
    const teams = (await Promise.all(memberships.map((m) => storage.getAgent(m.teamAgentId, orgId)))).filter(Boolean);
    if (teams.length) stays.push(`the ${plural(teams.length, "team")} it worked in: ${namedList(teams.map((t) => t!.name))}`);
  }

  // A team's workers are agents in their own right: deleting the orchestrator
  // does not delete them. Rather than only warn about that, the plan carries
  // what deleting the whole team would take, so the dialog can offer it.
  const team = members.length ? await planTeamRemoval(orgId, agent.id) : null;
  const warning = team
    ? `This agent leads a team of ${plural(members.length, "worker")}. Deleting the agent alone leaves them with no team to run them.`
    : null;

  return { id: agent.id, name: agent.name, goes, stays, warning, team };
}
