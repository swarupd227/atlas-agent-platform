import { z } from "zod";
import { resolveAgentRef } from "./refs";
import { DEFAULT_POLL_MINUTES, MIN_POLL_MINUTES } from "../../agent-watch";
import type { AstraTool, ConfirmPreview, ConfirmWarning } from "../types";

/**
 * Making an automation run when something changes in a connected system.
 *
 * The other half of gap 4: "run it when a submission lands" was a thing the
 * platform could do -- an mcp_resource_change trigger, polled by
 * connector-poller.ts -- and Cowork had no way to ask for it.
 *
 * Three things every card here says, because each is something a person
 * reasonably assumes and the mechanism does not do:
 * - it polls rather than being pushed, so "when it lands" means within the poll
 *   interval;
 * - the first poll only establishes where to count from, so it reacts to what
 *   changes from now on and never to the backlog;
 * - the run is told THAT records changed and how many, not WHAT they are -- the
 *   automation has to query the system itself.
 */

interface Plan {
  agent: { id: string; name: string; agentType: string | null };
  connector: { id: string; name: string; integrationId: string | null; connected: boolean | null };
  pollable: boolean;
  queryLanguage: string | null;
  existing: { id: string; query: string; everyMinutes: number; enabled: boolean; lastFiredAt: string | null; fireCount: number; hasCursor: boolean } | null;
  deployments: Array<{ id: string; environment: string; status: string }>;
  blockers: string[];
  taskMentionsLookup: boolean;
  taskInstructions: string;
}

const when = (iso: string | null) => (iso ? `${iso.slice(0, 16).replace("T", " ")} UTC` : null);
const every = (m: number) => (m === 1 ? "every minute" : m % 60 === 0 ? `every ${m / 60} ${m === 60 ? "hour" : "hours"}` : `every ${m} minutes`);

export const listWatchesTool: AstraTool<{}> = {
  name: "list_watches",
  description:
    "Which automations run when a connected system changes: the connector each one watches, the query it polls with, how often, and how many times it has fired. Polling is supported for Jira and Salesforce.",
  input: z.object({}),
  permission: "view_agents",
  confirm: false,
  run: async (ctx) => {
    const rows: Array<{ agentId: string; agent: string; connector: string; query: string; everyMinutes: number; enabled: boolean; watching: boolean; firedTimes: number; lastFiredAt: string | null }> =
      await ctx.services.listWatches(ctx.orgId);
    return {
      payload: {
        message: rows.length === 0 ? "Nothing is watching a connected system" : `${rows.length} ${rows.length === 1 ? "automation watches" : "automations watch"} a connected system`,
        total: rows.length,
        watches: rows.map((r) => ({
          agent: r.agent,
          agentId: r.agentId,
          watches: r.connector,
          query: r.query,
          polls: every(r.everyMinutes),
          ...(r.enabled ? {} : { paused: true }),
          // Until the first poll sets a cursor there is nothing to compare against.
          ...(r.watching ? {} : { note: "Hasn't polled yet, so it has nothing to compare against and cannot fire until it does." }),
          firedTimes: r.firedTimes,
          lastFired: when(r.lastFiredAt),
        })),
        ...(rows.length ? { basis: "Each watch re-runs its query with a changed-since bound; a fire tells the automation how many records changed, not what they are." } : {}),
      },
      proof: { context: { status: "measured", summary: `${rows.length} connector ${rows.length === 1 ? "watch" : "watches"} on this organization's agents` } },
    };
  },
};

type WatchInput = { agent: string; connector: string; query: string; everyMinutes?: number };

export const watchConnectorTool: AstraTool<WatchInput> = {
  name: "watch_connector",
  description:
    "Make an agent or team run when records change in a connected system: give the connector and a query in its own language (JQL for Jira, a full SOQL SELECT for Salesforce). Only Jira and Salesforce can be polled — say so plainly for anything else rather than setting a watch that can never fire. The run is told how many records changed, not what they are, so the automation's instructions must tell it to query the system itself. The user confirms first.",
  input: z.object({
    agent: z.string().min(1).describe("The agent or team's name or id."),
    connector: z.string().min(1).describe("The connector's name or id, from find_connectors."),
    query: z.string().min(3).max(2000).describe("What counts as a change: JQL for Jira (e.g. project = SUB AND status = Open), a full SOQL SELECT with FROM for Salesforce."),
    everyMinutes: z.number().int().min(MIN_POLL_MINUTES).max(1440).optional().describe(`How often to poll, in minutes (min ${MIN_POLL_MINUTES}, default ${DEFAULT_POLL_MINUTES}).`),
  }),
  permission: "deploy_staging_pilot",
  confirm: true,
  preview: async (ctx, input): Promise<ConfirmPreview> => {
    const found = await resolveAgentRef(ctx, input.agent);
    if ("refuse" in found) return found;
    let plan: Plan;
    try {
      plan = await ctx.services.planWatch(ctx.orgId, found.item.id, input.connector);
    } catch (e) {
      return { refuse: (e as Error).message };
    }
    // A watch on an unpollable connector would sit there looking configured and
    // never fire, which is worse than being told no.
    if (!plan.pollable) return { refuse: plan.blockers[0] };
    if (plan.connector.integrationId === "salesforce" && !/\bFROM\b/i.test(input.query)) {
      return { refuse: "A Salesforce watch needs a full SOQL SELECT with a FROM clause, for example \"SELECT Id, Name FROM Opportunity WHERE StageName = 'Proposal'\"." };
    }
    const minutes = Math.max(input.everyMinutes ?? DEFAULT_POLL_MINUTES, MIN_POLL_MINUTES);
    if (plan.existing && plan.existing.query === input.query.trim() && plan.existing.everyMinutes === minutes && plan.existing.enabled) {
      return { refuse: `"${plan.agent.name}" already watches "${plan.connector.name}" with that query, ${every(minutes)}.` };
    }

    const warnings: ConfirmWarning[] = [];
    for (const blocker of plan.blockers) {
      warnings.push({ title: "A fire would fail as things stand", detail: blocker });
    }
    warnings.push({
      title: "The run is told how many records changed, not which ones",
      detail: `It runs on its usual task instructions and has to query ${plan.connector.name} itself to find them.${plan.taskMentionsLookup ? "" : " Its current instructions don't mention querying or searching, so it may fire and find nothing — worth checking them with get_agent_instructions."}`,
    });
    if (plan.existing) {
      warnings.push({
        title: "This replaces its current watch on that connector",
        detail: `Was: ${plan.existing.query || "(no query)"}, ${every(plan.existing.everyMinutes)}, fired ${plan.existing.fireCount} ${plan.existing.fireCount === 1 ? "time" : "times"}. Counting starts again from the next poll.`,
      });
    }
    if (minutes <= 5) {
      warnings.push({
        title: `Polling ${every(minutes)} is ${Math.floor((60 / minutes) * 24)} queries a day against ${plan.connector.name}`,
        detail: "Each poll is a real query on that system, and each fire is a real run. A fire is skipped while the previous run of this trigger is still going.",
      });
    }

    return {
      summary: `Run ${plan.agent.name} when ${plan.connector.name} changes`,
      details: [
        `Watches: ${input.query.trim()} (${plan.queryLanguage ?? "query"}).`,
        `Polls ${every(minutes)} — ${plan.connector.name} pushes nothing, so "when it changes" means within that interval.`,
        "The first poll only records where to count from: it reacts to what changes after that, never to what is already there.",
        "Stop it any time with stop_watching. Nothing is deployed and nothing runs now.",
      ],
      warnings,
      frozen: { agent: plan.agent.id, connector: plan.connector.id, query: input.query.trim(), everyMinutes: minutes },
    };
  },
  run: async (ctx, input) => {
    const found = await resolveAgentRef(ctx, input.agent);
    if ("refuse" in found) throw new Error(found.refuse);
    const actor = (await ctx.services.getUserDisplayName?.(ctx.userId)) ?? ctx.role;
    const r = await ctx.services.setWatchAs(ctx.orgId, found.item.id, input.connector, input.query, input.everyMinutes, actor);
    return {
      payload: {
        watching: true,
        agent: r.agent.name,
        connector: r.connector.name,
        query: r.query,
        polls: every(r.everyMinutes),
        ...(r.replaced ? { replacedPreviousWatch: true } : {}),
        ...(r.blockers.length ? { fireWouldFail: r.blockers } : {}),
        next: r.blockers.length
          ? "The watch is saved, but a fire would fail as things stand. Fix what it says and it will run on the next change."
          : "Its first poll records where to count from; it fires on changes after that. list_watches shows how often it has fired.",
      },
      proof: {
        compliance: { status: "measured", summary: `Recorded as a trigger change on ${r.agent.name}` },
        context: { status: "not_measured", reason: "Nothing has fired yet: the first poll only establishes the cursor" },
      },
    };
  },
};

export const stopWatchingTool: AstraTool<{ agent: string; connector: string }> = {
  name: "stop_watching",
  description: "Stop an agent or team running when a connected system changes: the watch is removed and it only runs when asked or on its schedule. The user confirms first.",
  input: z.object({
    agent: z.string().min(1).describe("The agent or team's name or id."),
    connector: z.string().min(1).describe("The connector it watches."),
  }),
  permission: "deploy_staging_pilot",
  confirm: true,
  preview: async (ctx, input): Promise<ConfirmPreview> => {
    const found = await resolveAgentRef(ctx, input.agent);
    if ("refuse" in found) return found;
    let plan: Plan;
    try {
      plan = await ctx.services.planWatch(ctx.orgId, found.item.id, input.connector);
    } catch (e) {
      return { refuse: (e as Error).message };
    }
    if (!plan.existing) return { refuse: `"${plan.agent.name}" isn't watching "${plan.connector.name}".` };
    return {
      summary: `Stop ${plan.agent.name} watching ${plan.connector.name}`,
      details: [
        `It was watching: ${plan.existing.query || "(no query)"}, polling ${every(plan.existing.everyMinutes)}.`,
        `It fired ${plan.existing.fireCount} ${plan.existing.fireCount === 1 ? "time" : "times"}${plan.existing.lastFiredAt ? `, last at ${when(plan.existing.lastFiredAt)}` : ""}.`,
        "A run already in flight keeps going; cancel_run ends that. Anything it already did stays.",
      ],
      warnings: [],
      frozen: { agent: plan.agent.id, connector: plan.connector.id, trigger: plan.existing.id },
    };
  },
  run: async (ctx, input) => {
    const found = await resolveAgentRef(ctx, input.agent);
    if ("refuse" in found) throw new Error(found.refuse);
    const actor = (await ctx.services.getUserDisplayName?.(ctx.userId)) ?? ctx.role;
    const r = await ctx.services.clearWatchAs(ctx.orgId, found.item.id, input.connector, actor);
    return {
      payload: {
        stopped: true,
        agent: r.agent.name,
        connector: r.connector.name,
        wasWatching: r.wasQuery,
        firedTimes: r.firedTimes,
        next: "It no longer reacts to that system. Its schedule, if it has one, is untouched.",
      },
      proof: { compliance: { status: "measured", summary: `Recorded as a trigger change on ${r.agent.name}` } },
    };
  },
};

export const WATCH_TOOLS: AstraTool[] = [listWatchesTool, watchConnectorTool, stopWatchingTool] as AstraTool[];
