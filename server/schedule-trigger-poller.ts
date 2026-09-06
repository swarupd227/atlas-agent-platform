/**
 * Firing engine for "schedule" agent triggers. Evaluates each enabled
 * schedule trigger's cron expression (config.cron, standard 5-field
 * "minute hour day-of-month month day-of-week") against the current time
 * and enqueues an agent_run job when it matches. Mirrors connector-poller.ts's
 * mcp_resource_change firing shape: same createJob/createAuditEvent pattern,
 * same lastFiredAt/fireCount bookkeeping on the trigger row.
 */
import { storage } from "./storage";
import type { AgentTrigger } from "@shared/schema";

function matchesField(field: string, value: number, min: number, max: number): boolean {
  if (field === "*") return true;
  return field.split(",").some(part => {
    const stepMatch = part.match(/^(\*|\d+(?:-\d+)?)\/(\d+)$/);
    if (stepMatch) {
      const [, rangePart, stepStr] = stepMatch;
      const step = Number(stepStr);
      if (step <= 0) return false;
      const [rangeStart, rangeEnd] = rangePart === "*" ? [min, max] : rangePart.split("-").map(Number);
      if (value < rangeStart || value > (rangeEnd ?? rangeStart)) return false;
      return (value - rangeStart) % step === 0;
    }
    const rangeMatch = part.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
      const start = Number(rangeMatch[1]);
      const end = Number(rangeMatch[2]);
      return value >= start && value <= end;
    }
    const num = Number(part);
    return Number.isFinite(num) && num === value;
  });
}

/** Standard 5-field cron: minute(0-59) hour(0-23) day-of-month(1-31) month(1-12) day-of-week(0-6, 0=Sunday). */
export function cronMatches(cronExpr: string, date: Date): boolean {
  const fields = cronExpr.trim().split(/\s+/);
  if (fields.length !== 5) return false;
  const [minute, hour, dayOfMonth, month, dayOfWeek] = fields;
  return (
    matchesField(minute, date.getUTCMinutes(), 0, 59) &&
    matchesField(hour, date.getUTCHours(), 0, 23) &&
    matchesField(dayOfMonth, date.getUTCDate(), 1, 31) &&
    matchesField(month, date.getUTCMonth() + 1, 1, 12) &&
    matchesField(dayOfWeek, date.getUTCDay(), 0, 6)
  );
}

export function isValidCronExpression(cronExpr: string): boolean {
  const fields = cronExpr.trim().split(/\s+/);
  if (fields.length !== 5) return false;
  const fieldPattern = /^(\*|\d+(-\d+)?)(\/\d+)?(,(\*|\d+(-\d+)?)(\/\d+)?)*$/;
  return fields.every(f => fieldPattern.test(f));
}

function sameMinute(a: Date, b: Date): boolean {
  return Math.floor(a.getTime() / 60000) === Math.floor(b.getTime() / 60000);
}

export async function fireOneScheduleTrigger(trigger: AgentTrigger, now: Date): Promise<{ triggerId: string; fired: boolean; skipped?: string }> {
  const config = (trigger.config || {}) as Record<string, any>;
  const cron = config.cron as string | undefined;
  if (!cron) return { triggerId: trigger.id, fired: false, skipped: "missing config.cron" };
  if (!isValidCronExpression(cron)) return { triggerId: trigger.id, fired: false, skipped: `invalid cron expression: ${cron}` };

  // A minute-resolution cron can match every tick within that minute if the
  // scan interval is shorter than a minute -- guard against re-firing twice
  // for the same matched minute.
  if (trigger.lastFiredAt && sameMinute(new Date(trigger.lastFiredAt), now)) {
    return { triggerId: trigger.id, fired: false, skipped: "already fired this minute" };
  }

  if (!cronMatches(cron, now)) {
    return { triggerId: trigger.id, fired: false };
  }

  await storage.updateAgentTrigger(trigger.id, {
    lastFiredAt: now,
    fireCount: (trigger.fireCount || 0) + 1,
  });
  const input = typeof config.input === "string" && config.input.trim() ? config.input : undefined;
  const job = await storage.createJob({
    type: "agent_run",
    agentId: trigger.agentId,
    status: "queued",
    payload: { triggeredBy: "schedule", triggerId: trigger.id, cron, input },
  });
  await storage.createAuditEvent({
    actorType: "system",
    action: "schedule_trigger_fired",
    objectType: "agent_trigger",
    objectId: trigger.id,
    details: `Schedule trigger (${cron}) fired, job ${job.id} enqueued for agent ${trigger.agentId}`,
  });
  console.log(`[schedule-trigger] Trigger ${trigger.id} (${cron}) fired, job ${job.id}`);
  return { triggerId: trigger.id, fired: true };
}

export async function pollDueScheduleTriggers(): Promise<{ checked: number; fired: number; errors: number }> {
  const triggers = await storage.getAgentTriggersByType("schedule");
  const now = new Date();
  let checked = 0, fired = 0, errors = 0;

  for (const trigger of triggers) {
    if (!trigger.enabled) continue;
    checked++;
    try {
      const outcome = await fireOneScheduleTrigger(trigger, now);
      if (outcome.fired) fired++;
    } catch (err: any) {
      errors++;
      console.error(`[schedule-trigger] Unexpected error firing trigger ${trigger.id}:`, err.message);
    }
  }

  return { checked, fired, errors };
}
