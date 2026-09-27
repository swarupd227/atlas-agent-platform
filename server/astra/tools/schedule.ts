import { z } from "zod";
import { resolveAgentRef } from "./refs";
import { describeCron, nextFire } from "../../agent-schedule";
import type { AstraTool, ConfirmPreview, ConfirmWarning } from "../types";

/**
 * Putting an automation on a schedule, from the conversation.
 *
 * The fourth gap an outside-in look found: "run this every morning at seven" was
 * something the platform could do and Cowork could not ask for. The mechanism is
 * a real cron trigger (server/schedule-trigger-poller.ts), so these tools take a
 * cron expression -- and because that expression is evaluated in UTC, every card
 * says the time in UTC rather than letting a person read "7" as their own
 * morning.
 *
 * The other mechanism, the continuous runtime's interval, is reported when an
 * agent has one but never set here: two ways to schedule the same agent is how
 * you get an automation that fires twice and nobody knows why.
 */

interface Plan {
  agent: { id: string; name: string; agentType: string | null; status: string | null };
  trigger: { id: string; cron: string; enabled: boolean; lastFiredAt: string | null; fireCount: number } | null;
  deployments: Array<{ id: string; environment: string; status: string }>;
  blockers: string[];
  continuousIntervalMinutes: number | null;
  runsAsTeamRun: boolean;
  otherTriggers: Array<{ type: string; enabled: boolean }>;
}

const when = (iso: string | null) => (iso ? `${iso.slice(0, 16).replace("T", " ")} UTC` : null);

export const listSchedulesTool: AstraTool<{}> = {
  name: "list_schedules",
  description:
    "Which agents and teams run on a schedule: the cron expression in plain words, when each last fired and when it fires next. Cron is evaluated in UTC.",
  input: z.object({}),
  permission: "view_agents",
  confirm: false,
  run: async (ctx) => {
    const rows: Array<{ agentId: string; agent: string; cron: string; enabled: boolean; lastFiredAt: string | null; fireCount: number; nextFireAt: string | null }> =
      await ctx.services.listSchedules(ctx.orgId);
    return {
      payload: {
        message: rows.length === 0 ? "Nothing runs on a schedule" : `${rows.length} ${rows.length === 1 ? "automation runs" : "automations run"} on a schedule`,
        total: rows.length,
        scheduled: rows.map((r) => ({
          agent: r.agent,
          agentId: r.agentId,
          runs: describeCron(r.cron),
          cron: r.cron,
          ...(r.enabled ? {} : { paused: true }),
          firedTimes: r.fireCount,
          lastFired: when(r.lastFiredAt),
          nextFire: when(r.nextFireAt),
        })),
        ...(rows.length === 0 ? { note: "Every automation here runs only when someone asks it to." } : { basis: "Cron is evaluated in UTC, and a fire is skipped while the previous run is still going." }),
      },
      proof: { context: { status: "measured", summary: `${rows.length} schedule ${rows.length === 1 ? "trigger" : "triggers"} on this organization's agents` } },
    };
  },
};

type SetInput = { agent: string; cron: string };

export const setScheduleTool: AstraTool<SetInput> = {
  name: "set_schedule",
  description:
    "Put an agent or team on a schedule, as a 5-field cron expression evaluated in UTC (\"0 7 * * *\" = 07:00 UTC daily, \"*/30 * * * *\" = every 30 minutes, \"0 7 * * 1-5\" = weekday mornings). Translate the user's words into cron yourself and say the UTC time back to them, because 7am local is not 7am UTC. Needs an active deployment or every fire fails. The user confirms first.",
  input: z.object({
    agent: z.string().min(1).describe("The agent or team's name or id."),
    cron: z.string().min(9).max(100).describe("Standard 5-field cron: minute hour day-of-month month day-of-week. UTC."),
  }),
  permission: "deploy_staging_pilot",
  confirm: true,
  preview: async (ctx, input): Promise<ConfirmPreview> => {
    const found = await resolveAgentRef(ctx, input.agent);
    if ("refuse" in found) return found;
    let plan: Plan;
    try {
      plan = await ctx.services.planSchedule(ctx.orgId, found.item.id);
    } catch (e) {
      return { refuse: (e as Error).message };
    }
    const cron = input.cron.trim();
    const next = nextFire(cron);
    if (!next) {
      return { refuse: `"${cron}" isn't a 5-field cron expression I can read (minute hour day-of-month month day-of-week), for example "0 7 * * *" for 07:00 UTC every day.` };
    }
    if (plan.trigger?.cron === cron && plan.trigger.enabled) {
      return { refuse: `"${plan.agent.name}" already runs ${describeCron(cron)}.` };
    }

    const warnings: ConfirmWarning[] = [];
    for (const blocker of plan.blockers) {
      warnings.push({ title: "A fire would fail as things stand", detail: blocker });
    }
    if (plan.continuousIntervalMinutes) {
      warnings.push({
        title: `It also runs every ${plan.continuousIntervalMinutes} minutes on the older continuous runtime`,
        detail: "That is a second, separate mechanism, so it would fire on both. stop_automation stops the continuous one.",
      });
    }
    if (plan.runsAsTeamRun) {
      warnings.push({
        title: "Each fire is an ordinary team run",
        detail: "It appears in the run history and list_runs, pauses at its approval gates the same way, and can be cancelled with cancel_run.",
      });
    }
    const perDay = (() => {
      const m = cron.match(/^\*\/(\d+) \* \* \* \*$/);
      return m ? Math.floor((60 / Number(m[1])) * 24) : null;
    })();
    if (perDay && perDay > 24) {
      warnings.push({
        title: `That is ${perDay} runs a day`,
        detail: "Each one costs model calls and does real work in connected systems. A fire is skipped while the previous run is still going, not queued.",
      });
    }

    return {
      summary: plan.trigger
        ? `Change ${plan.agent.name} from ${describeCron(plan.trigger.cron)} to ${describeCron(cron)}`
        : `Run ${plan.agent.name} ${describeCron(cron)}`,
      details: [
        `Cron: ${cron} — evaluated in UTC, so say the UTC time to anyone who reads this.`,
        `Next fire would be ${when(next.toISOString())}.`,
        `Applies while it is deployed${plan.deployments.length ? `: ${plan.deployments.map((d) => d.environment).join(", ")}` : ""}.`,
        "A fire is skipped while the previous run is still going. Take it off the schedule with clear_schedule.",
      ],
      warnings,
      frozen: { agent: plan.agent.id, cron },
    };
  },
  run: async (ctx, input) => {
    const found = await resolveAgentRef(ctx, input.agent);
    if ("refuse" in found) throw new Error(found.refuse);
    const actor = (await ctx.services.getUserDisplayName?.(ctx.userId)) ?? ctx.role;
    const r = await ctx.services.setScheduleAs(ctx.orgId, found.item.id, input.cron, actor);
    return {
      payload: {
        scheduled: true,
        agent: r.agent.name,
        runs: describeCron(r.cron),
        cron: r.cron,
        nextFire: when(r.nextFireAt),
        ...(r.replaced ? { replacedPreviousSchedule: true } : {}),
        // The schedule is saved either way; a fire that would fail is worth
        // repeating here rather than only on the card the user already clicked.
        ...(r.blockers.length ? { fireWouldFail: r.blockers } : {}),
        next: r.blockers.length
          ? "The schedule is saved, but a fire would fail as things stand. Fix what it says and it will run from the next match."
          : "It fires on that schedule from now on. list_runs shows each run once it starts.",
      },
      proof: {
        compliance: { status: "measured", summary: `Recorded as a trigger change on ${r.agent.name}` },
        context: r.blockers.length
          ? { status: "not_measured", reason: "A fire would fail as things stand, so nothing has run yet" }
          : { status: "measured", summary: `Next fire ${when(r.nextFireAt) ?? "not within a week"}` },
      },
    };
  },
};

export const clearScheduleTool: AstraTool<{ agent: string }> = {
  name: "clear_schedule",
  description: "Take an agent or team off its schedule: the schedule trigger is removed and it only runs when someone asks. The user confirms first.",
  input: z.object({ agent: z.string().min(1).describe("The agent or team's name or id.") }),
  permission: "deploy_staging_pilot",
  confirm: true,
  preview: async (ctx, input): Promise<ConfirmPreview> => {
    const found = await resolveAgentRef(ctx, input.agent);
    if ("refuse" in found) return found;
    let plan: Plan;
    try {
      plan = await ctx.services.planSchedule(ctx.orgId, found.item.id);
    } catch (e) {
      return { refuse: (e as Error).message };
    }
    if (!plan.trigger) {
      return {
        refuse: `"${plan.agent.name}" has no schedule: it only runs when asked.${plan.continuousIntervalMinutes ? ` It does run every ${plan.continuousIntervalMinutes} minutes on the older continuous runtime — stop_automation stops that.` : ""}`,
      };
    }
    const warnings: ConfirmWarning[] = [];
    if (plan.continuousIntervalMinutes) {
      warnings.push({
        title: `It would still run every ${plan.continuousIntervalMinutes} minutes`,
        detail: "That is the older continuous runtime, a separate mechanism from this schedule. stop_automation stops it.",
      });
    }
    if (plan.otherTriggers.length) {
      warnings.push({
        title: `${plan.otherTriggers.length} other ${plan.otherTriggers.length === 1 ? "trigger stays" : "triggers stay"}`,
        detail: `${plan.otherTriggers.map((t) => t.type.replace(/_/g, " ")).join(", ")}: this only removes the schedule.`,
      });
    }
    return {
      summary: `Take ${plan.agent.name} off its schedule (${describeCron(plan.trigger.cron)})`,
      details: [
        `It has fired ${plan.trigger.fireCount} ${plan.trigger.fireCount === 1 ? "time" : "times"}${plan.trigger.lastFiredAt ? `, last at ${when(plan.trigger.lastFiredAt)}` : ""}.`,
        "It stops firing on its own. A run already in flight keeps going; cancel_run ends that.",
        "Anyone can still run it by hand.",
      ],
      warnings,
      frozen: { agent: plan.agent.id, trigger: plan.trigger.id },
    };
  },
  run: async (ctx, input) => {
    const found = await resolveAgentRef(ctx, input.agent);
    if ("refuse" in found) throw new Error(found.refuse);
    const actor = (await ctx.services.getUserDisplayName?.(ctx.userId)) ?? ctx.role;
    const r = await ctx.services.clearScheduleAs(ctx.orgId, found.item.id, actor);
    return {
      payload: {
        cleared: true,
        agent: r.agent.name,
        was: describeCron(r.wasCron),
        firedTimes: r.firedTimes,
        ...(r.continuousIntervalMinutes ? { stillRunsEveryMinutes: r.continuousIntervalMinutes } : {}),
        next: r.continuousIntervalMinutes
          ? "It still runs on the older continuous runtime every " + r.continuousIntervalMinutes + " minutes. stop_automation stops that."
          : "It runs only when asked now.",
      },
      proof: { compliance: { status: "measured", summary: `Recorded as a trigger change on ${r.agent.name}` } },
    };
  },
};

export const SCHEDULE_TOOLS: AstraTool[] = [listSchedulesTool, setScheduleTool, clearScheduleTool] as AstraTool[];
