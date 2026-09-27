/**
 * Running an automation when a connected system changes.
 *
 * The other half of the scheduling gap: "run it when a submission lands" was
 * something the platform could do -- an mcp_resource_change trigger, polled by
 * connector-poller.ts on the worker's minute scan -- and Cowork had no way to
 * ask for it.
 *
 * Three properties of that mechanism are what this file pins, because each is
 * the opposite of what a person assumes and each would otherwise produce a watch
 * that looks configured and does nothing useful:
 *
 * - only Jira and Salesforce can be polled, so anything else is REFUSED rather
 *   than stored;
 * - the first poll establishes a cursor instead of firing, so a watch never
 *   reacts to records that already exist;
 * - a fire carries the record COUNT and no records, so the automation has to
 *   query the system itself -- and if its instructions never mention looking
 *   anything up, the card says so.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { runTurn, resolveAction, type EngineDeps } from "../server/astra/engine";
import { ToolRegistry } from "../server/astra/registry";
import { MemoryThreadStore } from "../server/astra/memory-store";
import { scriptedComplete, result, call } from "../server/astra/scripted-brain";
import { finishTurnTool } from "../server/astra/tools/finish-turn";
import { WATCH_TOOLS } from "../server/astra/tools/watch";
import { DEFAULT_POLL_MINUTES, MIN_POLL_MINUTES, QUERY_LANGUAGE } from "../server/agent-watch";
import { isPollableIntegration, MIN_POLL_INTERVAL_MS } from "../server/connector-poll-query";
import { hasPermission, type RoleId } from "../server/permissions";
import type { AstraContext } from "../server/astra/types";

const ORG = "org-a";
const as = (role: RoleId): AstraContext => ({ orgId: ORG, userId: "u1", role, industryId: "insurance" });
const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");
const JQL = "project = SUB AND status = Open";

interface Options {
  integrationId?: string | null;
  pollable?: boolean;
  connected?: boolean | null;
  existing?: { id: string; query: string; everyMinutes: number; enabled: boolean; lastFiredAt: string | null; fireCount: number; hasCursor: boolean } | null;
  deployments?: Array<{ id: string; environment: string; status: string }>;
  blockers?: string[];
  taskMentionsLookup?: boolean;
  watches?: any[];
  resolveError?: string;
}

function setup(steps: Parameters<typeof scriptedComplete>[0], opts: Options = {}) {
  const store = new MemoryThreadStore();
  const threadId = store.createThread(ORG);
  const applied: any[] = [];
  const integrationId = opts.integrationId === undefined ? "jira" : opts.integrationId;
  const pollable = opts.pollable ?? isPollableIntegration(integrationId);
  const services = {
    listAgents: vi.fn(async () => [{ id: "team-1", name: "E&S Binding Team", organizationId: ORG }]),
    listWatches: vi.fn(async () => opts.watches ?? [
      { agentId: "team-1", agent: "E&S Binding Team", connector: "Jira Cloud", query: JQL, everyMinutes: 5, enabled: true, watching: true, firedTimes: 4, lastFiredAt: "2026-09-27T09:00:00.000Z" },
    ]),
    planWatch: vi.fn(async (_org: string, agentId: string) => {
      if (opts.resolveError) throw new Error(opts.resolveError);
      return {
        agent: { id: agentId, name: "E&S Binding Team", agentType: "team" },
        connector: { id: "mcp-1", name: integrationId === "salesforce" ? "Salesforce CRM" : "Jira Cloud", integrationId, connected: opts.connected ?? true },
        pollable,
        queryLanguage: integrationId ? QUERY_LANGUAGE[integrationId] ?? null : null,
        existing: opts.existing === undefined ? null : opts.existing,
        deployments: opts.deployments ?? [{ id: "d1", environment: "prod", status: "deployed" }],
        blockers: opts.blockers ?? [],
        taskMentionsLookup: opts.taskMentionsLookup ?? true,
        taskInstructions: "Read the submission and bind it.",
      };
    }),
    setWatchAs: vi.fn(async (_org: string, agentId: string, connector: string, query: string, everyMinutes: number | undefined, actor: string) => {
      applied.push({ act: "watch", agentId, connector, query, everyMinutes, actor });
      return {
        agent: { id: agentId, name: "E&S Binding Team" },
        connector: { id: "mcp-1", name: "Jira Cloud", integrationId, connected: true },
        query,
        everyMinutes: Math.max(everyMinutes ?? DEFAULT_POLL_MINUTES, MIN_POLL_MINUTES),
        replaced: !!opts.existing,
        blockers: opts.blockers ?? [],
        queryLanguage: "JQL",
      };
    }),
    clearWatchAs: vi.fn(async (_org: string, agentId: string, connector: string, actor: string) => {
      applied.push({ act: "stop", agentId, connector, actor });
      return { agent: { id: agentId, name: "E&S Binding Team" }, connector: { id: "mcp-1", name: "Jira Cloud" }, wasQuery: opts.existing?.query ?? JQL, firedTimes: opts.existing?.fireCount ?? 4 };
    }),
    getUserDisplayName: vi.fn(async () => "admin"),
  };
  const deps: EngineDeps = {
    store,
    registry: new ToolRegistry([finishTurnTool, ...WATCH_TOOLS], hasPermission),
    complete: scriptedComplete(steps),
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

beforeEach(() => vi.clearAllMocks());

describe("what the mechanism actually is", () => {
  it("only polls the two systems the poller supports", () => {
    expect(isPollableIntegration("jira")).toBe(true);
    expect(isPollableIntegration("salesforce")).toBe(true);
    expect(isPollableIntegration("servicenow")).toBe(false);
    expect(isPollableIntegration(null)).toBe(false);
    // The floor the poller enforces is the floor the tool offers.
    expect(MIN_POLL_MINUTES).toBe(MIN_POLL_INTERVAL_MS / 60_000);
  });

  it("names each system's query language, because the query is written in it", () => {
    expect(QUERY_LANGUAGE.jira).toBe("JQL");
    expect(QUERY_LANGUAGE.salesforce).toBe("SOQL");
  });
});

describe("setting a watch", () => {
  it("says it polls, that the first poll only sets a baseline, and that records aren't handed over", async () => {
    const t = setup([use("watch_connector", { agent: "E&S Binding Team", connector: "Jira Cloud", query: JQL }), reply("Watching.")]);
    expect(await runTurn(t.deps, as("admin"), t.threadId, "Run the binding team when a submission lands in Jira", t.onEvent)).toBe("awaiting_confirmation");
    const action = await pending(t);
    expect(action.summary).toBe("Run E&S Binding Team when Jira Cloud changes");
    const details = action.details!.join(" ");
    expect(details).toContain(`Watches: ${JQL} (JQL)`);
    expect(details).toContain("pushes nothing");
    expect(details).toContain("The first poll only records where to count from");
    const handover = action.warnings!.find((w) => w.title === "The run is told how many records changed, not which ones")!;
    expect(handover.detail).toContain("query Jira Cloud itself");

    await resolveAction(t.deps, as("admin"), t.threadId, action.id, "confirm", t.onEvent);
    expect(t.applied).toEqual([{ act: "watch", agentId: "team-1", connector: "Jira Cloud", query: JQL, everyMinutes: undefined, actor: "admin" }]);
  });

  it("warns when the automation's instructions never mention looking anything up", async () => {
    const t = setup([use("watch_connector", { agent: "E&S Binding Team", connector: "Jira Cloud", query: JQL }), reply("Watching.")], { taskMentionsLookup: false });
    await runTurn(t.deps, as("admin"), t.threadId, "Watch Jira", t.onEvent);
    const handover = (await pending(t)).warnings!.find((w) => w.title.startsWith("The run is told"))!;
    expect(handover.detail).toContain("may fire and find nothing");
    expect(handover.detail).toContain("get_agent_instructions");
  });

  it("refuses a connector the poller cannot poll, rather than storing a watch that never fires", async () => {
    const t = setup([
      use("watch_connector", { agent: "E&S Binding Team", connector: "ServiceNow", query: "state=1" }),
      (m) => { expect(lastTool(m).error).toContain("only Jira and Salesforce"); return reply("Not supported."); },
    ], { integrationId: "servicenow", pollable: false, blockers: ["Polling isn't supported for 'servicenow' yet — only Jira and Salesforce are. A watch on it would never fire."] });
    expect(await runTurn(t.deps, as("admin"), t.threadId, "Watch ServiceNow", t.onEvent)).toBe("idle");
    expect(t.services.setWatchAs).not.toHaveBeenCalled();
  });

  it("insists on a real SOQL SELECT for Salesforce", async () => {
    const t = setup([
      use("watch_connector", { agent: "E&S Binding Team", connector: "Salesforce CRM", query: "StageName = 'Proposal'" }),
      (m) => { expect(lastTool(m).error).toContain("full SOQL SELECT with a FROM clause"); return reply("Needs a SELECT."); },
    ], { integrationId: "salesforce" });
    await runTurn(t.deps, as("admin"), t.threadId, "Watch Salesforce", t.onEvent);
    expect(t.services.setWatchAs).not.toHaveBeenCalled();
  });

  it("passes a full SOQL SELECT through", async () => {
    const soql = "SELECT Id, Name FROM Opportunity WHERE StageName = 'Proposal'";
    const t = setup([use("watch_connector", { agent: "E&S Binding Team", connector: "Salesforce CRM", query: soql }), reply("Watching.")], { integrationId: "salesforce" });
    await runTurn(t.deps, as("admin"), t.threadId, "Watch Salesforce", t.onEvent);
    await resolveAction(t.deps, as("admin"), t.threadId, (await pending(t)).id, "confirm", t.onEvent);
    expect(t.applied[0].query).toBe(soql);
  });

  it("says a fire would fail when the connector isn't connected or nothing is deployed", async () => {
    const t = setup([use("watch_connector", { agent: "E&S Binding Team", connector: "Jira Cloud", query: JQL }), reply("Watching.")], {
      connected: false,
      deployments: [],
      blockers: ['"Jira Cloud" isn\'t connected for this organization, so every poll would fail until it is.', 'It has no active deployment, so a fire would fail with "Agent has no active deployment". Deploy it first.'],
    });
    await runTurn(t.deps, as("admin"), t.threadId, "Watch Jira", t.onEvent);
    const failures = (await pending(t)).warnings!.filter((w) => w.title === "A fire would fail as things stand");
    expect(failures).toHaveLength(2);
    expect(failures.map((w) => w.detail).join(" ")).toContain("isn't connected");
  });

  it("names what it replaces, and that counting starts again", async () => {
    const t = setup([use("watch_connector", { agent: "E&S Binding Team", connector: "Jira Cloud", query: "project = SUB AND status = Closed" }), reply("Changed.")], {
      existing: { id: "trg-1", query: JQL, everyMinutes: 5, enabled: true, lastFiredAt: null, fireCount: 9, hasCursor: true },
    });
    await runTurn(t.deps, as("admin"), t.threadId, "Change what it watches", t.onEvent);
    const warning = (await pending(t)).warnings!.find((w) => w.title === "This replaces its current watch on that connector")!;
    expect(warning.detail).toContain("fired 9 times");
    expect(warning.detail).toContain("Counting starts again");
  });

  it("puts the cost of frequent polling in front of the person setting it", async () => {
    const t = setup([use("watch_connector", { agent: "E&S Binding Team", connector: "Jira Cloud", query: JQL, everyMinutes: 1 }), reply("Watching.")]);
    await runTurn(t.deps, as("admin"), t.threadId, "Poll every minute", t.onEvent);
    const warning = (await pending(t)).warnings!.find((w) => w.title.includes("1440 queries a day"))!;
    expect(warning.detail).toContain("skipped while the previous run");
  });

  it("refuses the watch it already has", async () => {
    const t = setup([use("watch_connector", { agent: "E&S Binding Team", connector: "Jira Cloud", query: JQL }), (m) => { expect(lastTool(m).error).toContain("already watches"); return reply("Already set."); }], {
      existing: { id: "trg-1", query: JQL, everyMinutes: DEFAULT_POLL_MINUTES, enabled: true, lastFiredAt: null, fireCount: 2, hasCursor: true },
    });
    await runTurn(t.deps, as("admin"), t.threadId, "Watch Jira", t.onEvent);
  });

  it("refuses a connector that isn't this organization's", async () => {
    const t = setup([use("watch_connector", { agent: "E&S Binding Team", connector: "Someone Else's Jira", query: JQL }), (m) => { expect(lastTool(m).error).toContain("No connector named"); return reply("Not here."); }], {
      resolveError: 'No connector named "Someone Else\'s Jira" in this organization.',
    });
    await runTurn(t.deps, as("admin"), t.threadId, "Watch it", t.onEvent);
  });
});

describe("listing and stopping", () => {
  it("lists what watches what, and flags a watch that hasn't polled yet", async () => {
    const t = setup([
      use("list_watches"),
      (m) => {
        const rows = lastTool(m).result.watches;
        expect(rows[0]).toMatchObject({ agent: "E&S Binding Team", watches: "Jira Cloud", polls: "every 5 minutes", firedTimes: 4 });
        expect(rows[1].note).toContain("cannot fire until it does");
        expect(lastTool(m).result.basis).toContain("not what they are");
        return reply("Two watches.");
      },
    ], {
      watches: [
        { agentId: "team-1", agent: "E&S Binding Team", connector: "Jira Cloud", query: JQL, everyMinutes: 5, enabled: true, watching: true, firedTimes: 4, lastFiredAt: "2026-09-27T09:00:00.000Z" },
        { agentId: "team-2", agent: "Claims Triage", connector: "Salesforce CRM", query: "SELECT Id FROM Case", everyMinutes: 60, enabled: true, watching: false, firedTimes: 0, lastFiredAt: null },
      ],
    });
    await runTurn(t.deps, as("admin"), t.threadId, "What's watching what?", t.onEvent);
  });

  it("says nothing is watching rather than returning an empty list", async () => {
    const t = setup([use("list_watches"), (m) => { expect(lastTool(m).result.message).toBe("Nothing is watching a connected system"); return reply("Nothing."); }], { watches: [] });
    await runTurn(t.deps, as("admin"), t.threadId, "Anything watching?", t.onEvent);
  });

  it("stopping says what it was watching and what keeps going", async () => {
    const t = setup([use("stop_watching", { agent: "E&S Binding Team", connector: "Jira Cloud" }), reply("Stopped.")], {
      existing: { id: "trg-1", query: JQL, everyMinutes: 5, enabled: true, lastFiredAt: "2026-09-27T09:00:00.000Z", fireCount: 9 , hasCursor: true },
    });
    await runTurn(t.deps, as("admin"), t.threadId, "Stop watching Jira", t.onEvent);
    const action = await pending(t);
    expect(action.details!.join(" ")).toContain("fired 9 times, last at 2026-09-27 09:00 UTC");
    expect(action.details!.join(" ")).toContain("A run already in flight keeps going");
    await resolveAction(t.deps, as("admin"), t.threadId, action.id, "confirm", t.onEvent);
    expect(t.applied).toEqual([{ act: "stop", agentId: "team-1", connector: "Jira Cloud", actor: "admin" }]);
  });

  it("refuses to stop a watch that isn't there", async () => {
    const t = setup([use("stop_watching", { agent: "E&S Binding Team", connector: "Jira Cloud" }), (m) => { expect(lastTool(m).error).toContain("isn't watching"); return reply("Not watching."); }], { existing: null });
    await runTurn(t.deps, as("admin"), t.threadId, "Stop watching", t.onEvent);
  });

  it("is offered by role the way the schedule tools are", () => {
    const registry = setup([]).deps.registry;
    const names = (role: RoleId) => registry.canonicalDefinitions(role).map((d) => d.name);
    expect(names("admin")).toEqual(expect.arrayContaining(["list_watches", "watch_connector", "stop_watching"]));
    expect(names("outcome_owner")).toContain("list_watches");
    expect(names("outcome_owner")).not.toContain("watch_connector");
  });
});

describe("what the platform does underneath", () => {
  it("writes the trigger the poller reads, with the poll interval in its config", () => {
    const watch = read("server", "agent-watch.ts");
    expect(watch).toContain('export const WATCH_TRIGGER_TYPE = "mcp_resource_change"');
    expect(watch).toContain("const config = { mcpServerId: plan.connector.id, query: text, pollIntervalMs: minutes * 60_000 };");
  });

  it("clears the cursor when the query changes, so the new query starts from now", () => {
    // Keeping the old cursor would make the first poll of a new query report
    // every record changed since the previous query's last poll.
    const watch = read("server", "agent-watch.ts");
    expect(watch).toContain("lastPolledAt: undefined");
  });

  it("checks the agent and the connector belong to the caller", () => {
    const watch = read("server", "agent-watch.ts");
    expect(watch).toContain("const agent = await storage.getAgent(agentId, orgId);");
    expect(watch).toContain("const servers = await storage.getMcpServers(orgId);");
  });

  it("tells the model the three things a person assumes the other way", () => {
    const prompt = read("server", "astra", "prompt.ts");
    expect(prompt).toContain("only Jira and Salesforce can be polled");
    expect(prompt).toContain("never reacts to the backlog");
    expect(prompt).toContain("how many records changed, not which ones");
  });
});
