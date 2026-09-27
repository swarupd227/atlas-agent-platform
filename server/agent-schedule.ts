/**
 * Putting an automation on a schedule, and seeing what makes it fire.
 *
 * There are two scheduling mechanisms in this platform and they are not
 * equivalent, which is the whole reason this module exists rather than a thin
 * wrapper:
 *
 * - A SCHEDULE TRIGGER (`agent_triggers` with triggerType "schedule" and
 *   config.cron) is a real 5-field cron, evaluated by
 *   server/schedule-trigger-poller.ts. It enqueues an `agent_run` job, and that
 *   job already routes a team with a blueprint through the DAG engine -- so a
 *   scheduled team run is an ordinary team run, in the run history, with its
 *   approval gates intact. It has a same-minute guard, an overlap guard (it will
 *   not fire while the previous run is queued or processing) and a staleness
 *   ceiling. This is what "every morning at seven" means, and it is what these
 *   functions create.
 * - The CONTINUOUS RUNTIME (`runtimeConfig.scheduleIntervalMinutes`, started by
 *   startAgentRuntime) is an interval, not a clock. It is older, it is what
 *   Deploy & Run uses, and nothing here sets it. It is reported when present,
 *   because an agent can have both and a person deserves to know.
 *
 * Two facts about cron here that a card has to state, because getting either
 * wrong makes the schedule wrong: the expression is evaluated in UTC, and the
 * agent needs an active deployment or every fire fails with "Agent has no active
 * deployment".
 */
import { storage } from "./storage";
import { cronMatches, isValidCronExpression } from "./schedule-trigger-poller";
import type { AgentTrigger } from "@shared/schema";

export class ScheduleError extends Error {}

export const SCHEDULE_TRIGGER_TYPE = "schedule";
const FINISHED_DEPLOYMENT = new Set(["rolled_back", "promoted", "superseded", "retired", "failed"]);

/** A cron expression in the words a person would use, or the expression itself when it is unusual. */
export function describeCron(cron: string): string {
  const fields = cron.trim().split(/\s+/);
  if (fields.length !== 5) return cron;
  const [minute, hour, dom, month, dow] = fields;
  const at = (h: string, m: string) => `${h.padStart(2, "0")}:${m.padStart(2, "0")} UTC`;
  const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  const everyN = minute.match(/^\*\/(\d+)$/);
  if (everyN && hour === "*" && dom === "*" && month === "*" && dow === "*") {
    return `every ${everyN[1]} minutes`;
  }
  if (minute === "*" && hour === "*" && dom === "*" && month === "*" && dow === "*") return "every minute";
  if (/^\d+$/.test(minute) && hour === "*" && dom === "*" && month === "*" && dow === "*") {
    return `every hour at ${minute.padStart(2, "0")} past`;
  }
  const everyNHours = hour.match(/^\*\/(\d+)$/);
  if (/^\d+$/.test(minute) && everyNHours && dom === "*" && month === "*" && dow === "*") {
    return `every ${everyNHours[1]} hours, at ${minute.padStart(2, "0")} past`;
  }
  if (/^\d+$/.test(minute) && /^\d+$/.test(hour) && dom === "*" && month === "*") {
    if (dow === "*") return `every day at ${at(hour, minute)}`;
    if (/^\d$/.test(dow)) return `every ${DAYS[Number(dow)]} at ${at(hour, minute)}`;
    if (dow === "1-5") return `every weekday at ${at(hour, minute)}`;
  }
  if (/^\d+$/.test(minute) && /^\d+$/.test(hour) && /^\d+$/.test(dom) && month === "*" && dow === "*") {
    return `on day ${dom} of each month at ${at(hour, minute)}`;
  }
  return `on the cron schedule ${cron} (UTC)`;
}

/** When it would next fire, scanning forward a minute at a time. Null if not within a week. */
export function nextFire(cron: string, from: Date = new Date()): Date | null {
  if (!isValidCronExpression(cron)) return null;
  const start = new Date(Math.floor(from.getTime() / 60000) * 60000 + 60000);
  for (let i = 0; i < 60 * 24 * 8; i++) {
    const at = new Date(start.getTime() + i * 60000);
    if (cronMatches(cron, at)) return at;
  }
  return null;
}

export interface SchedulePlan {
  agent: { id: string; name: string; agentType: string | null; status: string | null };
  /** The schedule trigger on this agent, if it has one. */
  trigger: { id: string; cron: string; enabled: boolean; lastFiredAt: string | null; fireCount: number } | null;
  deployments: Array<{ id: string; environment: string; status: string }>;
  /** Why a fire would fail, in the words the platform itself uses, before anyone relies on it. */
  blockers: string[];
  /** The other mechanism, when it is also set: an interval, not a clock. */
  continuousIntervalMinutes: number | null;
  runsAsTeamRun: boolean;
  otherTriggers: Array<{ type: string; enabled: boolean }>;
}

async function agentInOrg(orgId: string | undefined, agentId: string) {
  const agent = await storage.getAgent(agentId, orgId);
  if (!agent) throw new ScheduleError("No agent with that id in this organization.");
  return agent;
}

const cronOf = (t: AgentTrigger) => String(((t.config || {}) as Record<string, any>).cron ?? "");

export async function planSchedule(orgId: string | undefined, agentId: string): Promise<SchedulePlan> {
  const agent = await agentInOrg(orgId, agentId);
  const triggers = await storage.getAgentTriggers(agentId).catch(() => []);
  const schedule = (triggers as AgentTrigger[]).find((t) => t.triggerType === SCHEDULE_TRIGGER_TYPE);

  const all = await storage.getDeployments(orgId).catch(() => []);
  const deployments = (all as any[])
    .filter((d) => d.agentId === agentId && !FINISHED_DEPLOYMENT.has(String(d.status)))
    .map((d) => ({ id: d.id, environment: String(d.environment), status: String(d.status) }));

  const rt = (agent.runtimeConfig as Record<string, any>) || {};
  const blockers: string[] = [];
  // processAgentRun throws exactly this when a fire lands with no deployment.
  if (deployments.length === 0) {
    blockers.push("It has no active deployment, so every fire would fail with \"Agent has no active deployment\". Deploy it first.");
  }
  const isTeam = agent.agentType === "team" && !!(agent as any).blueprintId;
  if (!isTeam && !(typeof rt.prompt === "string" && rt.prompt.trim())) {
    blockers.push("It has no task instructions, so a fire has nothing to run. Set them with update_agent_instructions.");
  }

  return {
    agent: { id: agent.id, name: agent.name, agentType: agent.agentType ?? null, status: agent.status ?? null },
    trigger: schedule
      ? {
          id: schedule.id,
          cron: cronOf(schedule),
          enabled: schedule.enabled !== false,
          lastFiredAt: schedule.lastFiredAt ? new Date(schedule.lastFiredAt).toISOString() : null,
          fireCount: schedule.fireCount ?? 0,
        }
      : null,
    deployments,
    blockers,
    continuousIntervalMinutes: typeof rt.scheduleIntervalMinutes === "number" && rt.scheduleIntervalMinutes > 0 ? rt.scheduleIntervalMinutes : null,
    runsAsTeamRun: isTeam,
    otherTriggers: (triggers as AgentTrigger[])
      .filter((t) => t.triggerType !== SCHEDULE_TRIGGER_TYPE)
      .map((t) => ({ type: t.triggerType, enabled: t.enabled !== false })),
  };
}

/** Every schedule trigger in the organization, with the agent it fires. */
export async function schedules(orgId: string | undefined) {
  const [agents, triggers] = await Promise.all([
    storage.getAgents(orgId),
    storage.getAgentTriggersByType(SCHEDULE_TRIGGER_TYPE).catch(() => []),
  ]);
  const byId = new Map(agents.map((a) => [a.id, a]));
  return (triggers as AgentTrigger[])
    .filter((t) => byId.has(t.agentId))
    .map((t) => {
      const agent = byId.get(t.agentId)!;
      const cron = cronOf(t);
      return {
        agentId: agent.id,
        agent: agent.name,
        agentType: agent.agentType ?? null,
        status: agent.status ?? null,
        cron,
        enabled: t.enabled !== false,
        lastFiredAt: t.lastFiredAt ? new Date(t.lastFiredAt).toISOString() : null,
        fireCount: t.fireCount ?? 0,
        nextFireAt: t.enabled === false ? null : nextFire(cron)?.toISOString() ?? null,
      };
    });
}

async function record(orgId: string | undefined, agent: { id: string; name: string }, actorLabel: string, actorId: string | null | undefined, action: string, summary: string, details: Record<string, unknown>) {
  await storage.createAuditEvent({
    actorType: "user",
    actorId: actorId ?? actorLabel,
    action,
    objectType: "agent_trigger",
    objectId: agent.id,
    organizationId: orgId,
    details: JSON.stringify({ summary, agentName: agent.name, ...details, via: "Astra Cowork" }),
  }).catch(() => {});
}

/** Create or replace the agent's schedule trigger. */
export async function setScheduleAs(
  orgId: string | undefined,
  agentId: string,
  cron: string,
  actor: { actorLabel: string; actorId?: string | null },
) {
  const expression = cron.trim();
  if (!isValidCronExpression(expression)) {
    throw new ScheduleError(`"${expression}" isn't a 5-field cron expression (minute hour day-of-month month day-of-week), for example "0 7 * * *" for 07:00 UTC daily.`);
  }
  const plan = await planSchedule(orgId, agentId);
  if (plan.trigger?.cron === expression && plan.trigger.enabled) {
    throw new ScheduleError(`"${plan.agent.name}" already runs ${describeCron(expression)}.`);
  }

  const config = { cron: expression };
  const trigger = plan.trigger
    ? await storage.updateAgentTrigger(plan.trigger.id, { config, enabled: true } as any)
    : await storage.createAgentTrigger({ agentId, triggerType: SCHEDULE_TRIGGER_TYPE, config, enabled: true } as any);
  if (!trigger) throw new ScheduleError("That schedule could not be saved.");

  await record(orgId, plan.agent, actor.actorLabel, actor.actorId, "trigger_created", `${actor.actorLabel} set "${plan.agent.name}" to run ${describeCron(expression)}`, {
    cron: expression,
    previousCron: plan.trigger?.cron ?? null,
    triggerId: trigger.id,
  });
  return {
    agent: plan.agent,
    cron: expression,
    replaced: !!plan.trigger,
    nextFireAt: nextFire(expression)?.toISOString() ?? null,
    blockers: plan.blockers,
  };
}

/** Remove the agent's schedule trigger, so it only runs when asked. */
export async function clearScheduleAs(orgId: string | undefined, agentId: string, actor: { actorLabel: string; actorId?: string | null }) {
  const plan = await planSchedule(orgId, agentId);
  if (!plan.trigger) {
    throw new ScheduleError(`"${plan.agent.name}" has no schedule, so there is nothing to clear.${plan.continuousIntervalMinutes ? ` It does run every ${plan.continuousIntervalMinutes} minutes on the older continuous runtime -- stop_automation stops that.` : ""}`);
  }
  const deleted = await storage.deleteAgentTrigger(plan.trigger.id);
  if (!deleted) throw new ScheduleError("That schedule could not be removed.");
  await record(orgId, plan.agent, actor.actorLabel, actor.actorId, "trigger_deleted", `${actor.actorLabel} took "${plan.agent.name}" off its schedule`, {
    wasCron: plan.trigger.cron,
    firedTimes: plan.trigger.fireCount,
    triggerId: plan.trigger.id,
  });
  return { agent: plan.agent, wasCron: plan.trigger.cron, firedTimes: plan.trigger.fireCount, continuousIntervalMinutes: plan.continuousIntervalMinutes };
}
