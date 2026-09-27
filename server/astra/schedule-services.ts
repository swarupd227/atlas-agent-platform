/**
 * Astra services for scheduling an automation.
 *
 * The acts are server/agent-schedule.ts. What matters here is which mechanism
 * they use: a schedule TRIGGER with a 5-field cron expression, fired by
 * server/schedule-trigger-poller.ts, which enqueues the same agent_run job every
 * other trigger uses -- and that job already routes a team with a blueprint
 * through the DAG engine, so a scheduled team run is an ordinary team run. The
 * continuous runtime's scheduleIntervalMinutes is a different, older mechanism;
 * it is reported when an agent has one, and never set from here.
 */
import { clearScheduleAs, planSchedule, schedules, setScheduleAs } from "../agent-schedule";

async function listSchedules(orgId: string) {
  return schedules(orgId);
}

async function planScheduleFor(orgId: string, agentId: string) {
  return planSchedule(orgId, agentId);
}

async function setSchedule(orgId: string, agentId: string, cron: string, actorLabel: string) {
  return setScheduleAs(orgId, agentId, cron, { actorLabel });
}

async function clearSchedule(orgId: string, agentId: string, actorLabel: string) {
  return clearScheduleAs(orgId, agentId, { actorLabel });
}

export const scheduleServices = {
  listSchedules,
  planSchedule: planScheduleFor,
  setScheduleAs: setSchedule,
  clearScheduleAs: clearSchedule,
};
