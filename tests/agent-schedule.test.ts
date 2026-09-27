/**
 * Putting an automation on a schedule.
 *
 * The fourth gap an outside-in look found. My first pass at it was built on the
 * wrong mechanism: I read `runtimeConfig.scheduleIntervalMinutes` (the continuous
 * runtime's interval) and concluded the platform had no clock schedule. It does
 * -- server/schedule-trigger-poller.ts evaluates a real 5-field cron on
 * `agent_triggers` rows, with a same-minute guard, an overlap guard and a
 * staleness ceiling -- so these tools create that, and the cards say the times in
 * UTC because that is how the poller reads them.
 *
 * Two things this file pins hardest:
 * - a cron is read in UTC, so "7am" on a card without UTC is a wrong schedule
 *   waiting to happen;
 * - an agent can ALSO have the older interval, and a card that hides that lets
 *   an automation fire twice with nobody knowing why.
 *
 * It also covers the separate bug the research turned up: the interval path's
 * scheduled cycle ran a TEAM through executeTeamPipeline, a different executor
 * from the one run_team uses, which writes no dag_execution_runs row -- so those
 * runs were invisible to the run history, list_runs and cancel_run. The cron
 * path's agent_run job already routed teams correctly; the interval path did not.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { runTurn, resolveAction, type EngineDeps } from "../server/astra/engine";
import { ToolRegistry } from "../server/astra/registry";
import { MemoryThreadStore } from "../server/astra/memory-store";
import { scriptedComplete, result, call } from "../server/astra/scripted-brain";
import { finishTurnTool } from "../server/astra/tools/finish-turn";
import { SCHEDULE_TOOLS } from "../server/astra/tools/schedule";
import { describeCron, nextFire } from "../server/agent-schedule";
import { cronMatches, isValidCronExpression } from "../server/schedule-trigger-poller";
import { hasPermission, type RoleId } from "../server/permissions";
import type { AstraContext } from "../server/astra/types";

const ORG = "org-a";
const as = (role: RoleId): AstraContext => ({ orgId: ORG, userId: "u1", role, industryId: "insurance" });
const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");

interface Options {
  trigger?: { id: string; cron: string; enabled: boolean; lastFiredAt: string | null; fireCount: number } | null;
  deployments?: Array<{ id: string; environment: string; status: string }>;
  blockers?: string[];
  continuousIntervalMinutes?: number | null;
  runsAsTeamRun?: boolean;
  otherTriggers?: Array<{ type: string; enabled: boolean }>;
  schedules?: any[];
}

function setup(steps: Parameters<typeof scriptedComplete>[0], opts: Options = {}) {
  const store = new MemoryThreadStore();
  const threadId = store.createThread(ORG);
  const applied: any[] = [];
  const services = {
    listAgents: vi.fn(async () => [{ id: "team-1", name: "E&S Binding Team", organizationId: ORG }]),
    listSchedules: vi.fn(async () => opts.schedules ?? [
      { agentId: "team-1", agent: "E&S Binding Team", agentType: "team", status: "active", cron: "0 7 * * 1-5", enabled: true, lastFiredAt: "2026-09-26T07:00:00.000Z", fireCount: 12, nextFireAt: "2026-09-28T07:00:00.000Z" },
    ]),
    planSchedule: vi.fn(async (_org: string, agentId: string) => ({
      agent: { id: agentId, name: "E&S Binding Team", agentType: "team", status: "active" },
      trigger: opts.trigger === undefined ? null : opts.trigger,
      deployments: opts.deployments ?? [{ id: "d1", environment: "prod", status: "deployed" }],
      blockers: opts.blockers ?? [],
      continuousIntervalMinutes: opts.continuousIntervalMinutes ?? null,
      runsAsTeamRun: opts.runsAsTeamRun ?? true,
      otherTriggers: opts.otherTriggers ?? [],
    })),
    setScheduleAs: vi.fn(async (_org: string, agentId: string, cron: string, actor: string) => {
      applied.push({ act: "set", agentId, cron, actor });
      return {
        agent: { id: agentId, name: "E&S Binding Team" },
        cron,
        replaced: !!opts.trigger,
        nextFireAt: nextFire(cron, new Date("2026-09-27T12:00:00.000Z"))?.toISOString() ?? null,
        blockers: opts.blockers ?? [],
      };
    }),
    clearScheduleAs: vi.fn(async (_org: string, agentId: string, actor: string) => {
      applied.push({ act: "clear", agentId, actor });
      return { agent: { id: agentId, name: "E&S Binding Team" }, wasCron: opts.trigger?.cron ?? "0 7 * * *", firedTimes: opts.trigger?.fireCount ?? 3, continuousIntervalMinutes: opts.continuousIntervalMinutes ?? null };
    }),
    getUserDisplayName: vi.fn(async () => "admin"),
  };
  const complete = scriptedComplete(steps);
  const deps: EngineDeps = {
    store,
    registry: new ToolRegistry([finishTurnTool, ...SCHEDULE_TOOLS], hasPermission),
    complete,
    can: hasPermission,
    audit: vi.fn(async () => {}),
    services,
    model: "test",
  };
  return { store, threadId, deps, services, applied, onEvent: () => {} };
}

const use = (name: string, args: Record<string, unknown> = {}) => ({ toolCalls: [{ name, arguments: args }] });
const reply = (text: string) => result(text, [call("finish_turn", { suggestions: [] })]);
const lastTool = (messages: any[]) => JSON.parse(messages.filter((m) => m.role === "tool").at(-1).content);
const pending = async (t: ReturnType<typeof setup>) => (await t.store.loadThread(t.threadId, ORG))!.pendingAction!;
const DAILY_7 = "0 7 * * *";

beforeEach(() => vi.clearAllMocks());

describe("reading a cron the way a person would say it", () => {
  it("says the time, and says it in UTC", () => {
    expect(describeCron(DAILY_7)).toBe("every day at 07:00 UTC");
    expect(describeCron("30 6 * * 1-5")).toBe("every weekday at 06:30 UTC");
    expect(describeCron("0 9 * * 1")).toBe("every Monday at 09:00 UTC");
    expect(describeCron("*/30 * * * *")).toBe("every 30 minutes");
    expect(describeCron("15 */4 * * *")).toBe("every 4 hours, at 15 past");
    expect(describeCron("0 3 1 * *")).toBe("on day 1 of each month at 03:00 UTC");
  });

  it("falls back to the expression rather than paraphrasing something unusual", () => {
    expect(describeCron("0 7 * 3 2")).toContain("on the cron schedule 0 7 * 3 2 (UTC)");
  });

  it("works out the next fire from the same matcher the poller uses", () => {
    const from = new Date("2026-09-27T12:00:00.000Z");
    expect(nextFire(DAILY_7, from)!.toISOString()).toBe("2026-09-28T07:00:00.000Z");
    // Monday 2026-09-28 is the next weekday morning after Sunday noon.
    expect(nextFire("0 7 * * 1-5", from)!.toISOString()).toBe("2026-09-28T07:00:00.000Z");
    expect(nextFire("not a cron", from)).toBeNull();
    expect(cronMatches(DAILY_7, new Date("2026-09-28T07:00:00.000Z"))).toBe(true);
    expect(isValidCronExpression("0 7 * * *")).toBe(true);
  });
});

describe("setting one", () => {
  it("shows the cron, its plain reading, the UTC caveat and the next fire", async () => {
    const t = setup([use("set_schedule", { agent: "E&S Binding Team", cron: DAILY_7 }), reply("Scheduled.")]);
    expect(await runTurn(t.deps, as("admin"), t.threadId, "Run the binding team every morning at 7", t.onEvent)).toBe("awaiting_confirmation");
    const action = await pending(t);
    expect(action.summary).toBe("Run E&S Binding Team every day at 07:00 UTC");
    const details = action.details!.join(" ");
    expect(details).toContain("Cron: 0 7 * * *");
    expect(details).toContain("evaluated in UTC");
    expect(details).toContain("Next fire would be");
    expect(details).toContain("skipped while the previous run is still going");

    await resolveAction(t.deps, as("admin"), t.threadId, action.id, "confirm", t.onEvent);
    expect(t.applied).toEqual([{ act: "set", agentId: "team-1", cron: DAILY_7, actor: "admin" }]);
  });

  it("refuses something that isn't a cron expression instead of guessing at it", async () => {
    const t = setup([use("set_schedule", { agent: "E&S Binding Team", cron: "every morning" }), (m) => { expect(lastTool(m).error).toContain("isn't a 5-field cron expression"); return reply("Give me a cron."); }]);
    expect(await runTurn(t.deps, as("admin"), t.threadId, "Schedule it", t.onEvent)).toBe("idle");
    expect(t.services.setScheduleAs).not.toHaveBeenCalled();
  });

  it("says a fire would fail when it isn't deployed, without pretending it is set up", async () => {
    const t = setup([use("set_schedule", { agent: "E&S Binding Team", cron: DAILY_7 }), reply("Scheduled.")], {
      deployments: [],
      blockers: ['It has no active deployment, so every fire would fail with "Agent has no active deployment". Deploy it first.'],
    });
    await runTurn(t.deps, as("admin"), t.threadId, "Schedule it daily", t.onEvent);
    const warning = (await pending(t)).warnings!.find((w) => w.title === "A fire would fail as things stand")!;
    expect(warning.detail).toContain("no active deployment");
  });

  it("surfaces the OTHER scheduling mechanism, so it can't fire twice unexplained", async () => {
    const t = setup([use("set_schedule", { agent: "E&S Binding Team", cron: DAILY_7 }), reply("Scheduled.")], { continuousIntervalMinutes: 60 });
    await runTurn(t.deps, as("admin"), t.threadId, "Schedule it daily", t.onEvent);
    const warning = (await pending(t)).warnings!.find((w) => w.title.includes("older continuous runtime"))!;
    expect(warning.detail).toContain("fire on both");
    expect(warning.detail).toContain("stop_automation");
  });

  it("says each fire is an ordinary team run, which is what makes it visible and cancellable", async () => {
    const t = setup([use("set_schedule", { agent: "E&S Binding Team", cron: DAILY_7 }), reply("Scheduled.")]);
    await runTurn(t.deps, as("admin"), t.threadId, "Schedule it", t.onEvent);
    const warning = (await pending(t)).warnings!.find((w) => w.title === "Each fire is an ordinary team run")!;
    expect(warning.detail).toContain("list_runs");
    expect(warning.detail).toContain("cancel_run");
  });

  it("puts the cost of a frequent cron in front of the person setting it", async () => {
    const t = setup([use("set_schedule", { agent: "E&S Binding Team", cron: "*/15 * * * *" }), reply("Scheduled.")]);
    await runTurn(t.deps, as("admin"), t.threadId, "Every 15 minutes", t.onEvent);
    expect((await pending(t)).warnings!.map((w) => w.title)).toContain("That is 96 runs a day");
  });

  it("names the schedule it replaces", async () => {
    const t = setup([use("set_schedule", { agent: "E&S Binding Team", cron: "0 6 * * *" }), reply("Changed.")], {
      trigger: { id: "trg-1", cron: DAILY_7, enabled: true, lastFiredAt: null, fireCount: 4 },
    });
    await runTurn(t.deps, as("admin"), t.threadId, "Make it 6 instead", t.onEvent);
    expect((await pending(t)).summary).toBe("Change E&S Binding Team from every day at 07:00 UTC to every day at 06:00 UTC");
  });

  it("refuses the schedule it already has", async () => {
    const t = setup([use("set_schedule", { agent: "E&S Binding Team", cron: DAILY_7 }), (m) => { expect(lastTool(m).error).toContain("already runs every day at 07:00 UTC"); return reply("Already set."); }], {
      trigger: { id: "trg-1", cron: DAILY_7, enabled: true, lastFiredAt: null, fireCount: 4 },
    });
    await runTurn(t.deps, as("admin"), t.threadId, "Schedule it at 7", t.onEvent);
  });
});

describe("listing and clearing", () => {
  it("lists the schedule in words, with when it last fired and when it fires next", async () => {
    const t = setup([
      use("list_schedules"),
      (m) => {
        const row = lastTool(m).result.scheduled[0];
        expect(row).toMatchObject({ agent: "E&S Binding Team", runs: "every weekday at 06:30 UTC".replace("06:30", "07:00"), cron: "0 7 * * 1-5", firedTimes: 12 });
        expect(row.nextFire).toBe("2026-09-28 07:00 UTC");
        expect(lastTool(m).result.basis).toContain("UTC");
        return reply("One schedule.");
      },
    ]);
    await runTurn(t.deps, as("admin"), t.threadId, "What runs on a schedule?", t.onEvent);
  });

  it("says nothing is scheduled rather than returning an empty list", async () => {
    const t = setup([use("list_schedules"), (m) => { expect(lastTool(m).result.note).toContain("only when someone asks"); return reply("Nothing."); }], { schedules: [] });
    await runTurn(t.deps, as("admin"), t.threadId, "Anything scheduled?", t.onEvent);
  });

  it("clearing says how often it fired, and what still makes it run", async () => {
    const t = setup([use("clear_schedule", { agent: "E&S Binding Team" }), reply("Cleared.")], {
      trigger: { id: "trg-1", cron: DAILY_7, enabled: true, lastFiredAt: "2026-09-26T07:00:00.000Z", fireCount: 9 },
      continuousIntervalMinutes: 60,
      otherTriggers: [{ type: "mcp_resource_change", enabled: true }],
    });
    await runTurn(t.deps, as("admin"), t.threadId, "Take it off the schedule", t.onEvent);
    const action = await pending(t);
    expect(action.details!.join(" ")).toContain("fired 9 times, last at 2026-09-26 07:00 UTC");
    const titles = action.warnings!.map((w) => w.title);
    expect(titles).toContain("It would still run every 60 minutes");
    expect(titles).toContain("1 other trigger stays");

    await resolveAction(t.deps, as("admin"), t.threadId, action.id, "confirm", t.onEvent);
    expect(t.applied).toEqual([{ act: "clear", agentId: "team-1", actor: "admin" }]);
  });

  it("refuses to clear what has no schedule, and points at the other mechanism when that is what is running it", async () => {
    const t = setup([use("clear_schedule", { agent: "E&S Binding Team" }), (m) => { expect(lastTool(m).error).toContain("older continuous runtime"); return reply("Nothing scheduled."); }], {
      trigger: null,
      continuousIntervalMinutes: 30,
    });
    await runTurn(t.deps, as("admin"), t.threadId, "Unschedule it", t.onEvent);
  });
});

describe("the mechanism underneath", () => {
  it("creates a schedule trigger, not the continuous runtime's interval", () => {
    const schedule = read("server", "agent-schedule.ts");
    expect(schedule).toContain('export const SCHEDULE_TRIGGER_TYPE = "schedule"');
    expect(schedule).toContain("storage.createAgentTrigger({ agentId, triggerType: SCHEDULE_TRIGGER_TYPE, config, enabled: true }");
    // It reports the other mechanism but never sets it.
    expect(schedule).toContain("continuousIntervalMinutes");
    expect(schedule).not.toContain("scheduleIntervalMinutes: ");
  });

  it("checks the agent belongs to the caller before reading or writing its triggers", () => {
    const schedule = read("server", "agent-schedule.ts");
    expect(schedule).toContain("const agent = await storage.getAgent(agentId, orgId);");
    // The trigger routes themselves are not org-scoped, so this module is what scopes it.
    expect(schedule).toContain("async function agentInOrg(");
  });

  it("fixes the interval path's team runs, which went through another executor entirely", () => {
    const worker = read("server", "worker.ts");
    const handler = worker.slice(worker.indexOf("async function processAgentScheduledRun"), worker.indexOf("const AUDIT_CHAIN_CHECK_INTERVAL_MS"));
    expect(handler).toContain('scheduledAgent.agentType === "team" && blueprintId');
    expect(handler).toContain("startTeamAgentDagRun(scheduledAgent.id, blueprintId, request)");
    expect(handler).toContain("await executeScheduledAgentCycle(deploymentId);");
    // And does not double up a run that is still going.
    expect(handler).toContain('r.status === "running" || r.status === "waiting_approval"');
  });

  it("tells the model to translate into cron and to say the UTC time back", () => {
    const prompt = read("server", "astra", "prompt.ts");
    expect(prompt).toContain("5-field cron expression evaluated in UTC");
    expect(prompt).toContain("7am where they are is usually not 7am UTC");
  });
});
