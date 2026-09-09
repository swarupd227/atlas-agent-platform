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

// A genuinely wedged tool call (e.g. an MCP transport that never resolves --
// see mcp-client.ts's MCP_CALL_TOOL_TIMEOUT_MS note) can leave a job stuck in
// "processing" forever, since nothing else in the system currently times a
// run out. Without a ceiling here, the overlap guard below would treat that
// one hung job as a permanent lock on its trigger -- confirmed live: a job
// stuck since 2026-09-08 blocked every later fire of its trigger, silently,
// with the trigger's fireCount/lastFiredAt never advancing again. 30 minutes
// is generous over every real run observed this project (typically 2-4 min)
// while still being well short of "this is obviously never coming back."
const MAX_ACTIVE_JOB_AGE_MS = 30 * 60 * 1000;

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

  // Overlap guard: don't fire again while this trigger's previous run is
  // still queued/processing. Confirmed live -- a cron interval shorter than
  // the agent's actual run duration let two runs execute concurrently
  // against the same non-isolated Playwright MCP browser session, which
  // corrupted each other's page state and permanently hung one of the runs.
  const activeJob = await storage.getActiveJobForTrigger(trigger.id);
  if (activeJob) {
    const startedAt = activeJob.startedAt ?? activeJob.createdAt;
    const ageMs = startedAt ? now.getTime() - new Date(startedAt).getTime() : 0;
    if (ageMs < MAX_ACTIVE_JOB_AGE_MS) {
      return { triggerId: trigger.id, fired: false, skipped: `previous run (job ${activeJob.id}) still ${activeJob.status}` };
    }
    // Older than any real run should take -- treat as abandoned rather than
    // let it lock this trigger out forever.
    await storage.updateJob(activeJob.id, {
      status: "failed",
      error: `Marked failed by schedule-trigger-poller: still "${activeJob.status}" after ${Math.round(ageMs / 60000)} minutes, exceeding the ${MAX_ACTIVE_JOB_AGE_MS / 60000}-minute staleness ceiling.`,
      completedAt: now,
    });
    await storage.createAuditEvent({
      actorType: "system",
      action: "stale_job_marked_failed",
      objectType: "agent_trigger",
      objectId: trigger.id,
      details: `Job ${activeJob.id} was still "${activeJob.status}" after ${Math.round(ageMs / 60000)} min -- marked failed so trigger ${trigger.id} isn't permanently locked out.`,
    });
    console.warn(`[schedule-trigger] Trigger ${trigger.id}: abandoned job ${activeJob.id} (${Math.round(ageMs / 60000)}m old) marked failed, proceeding to fire`);
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
