/**
 * The Connectors pack.
 *
 * The audit that produced it, read off the live platform on 2026-09-27: 113 of
 * 131 connectors reported "healthy" while 129 of them had not been probed for
 * over a week and 18 had never been probed at all. The page showed a green badge
 * for a measurement from three weeks earlier, and Cowork could only say whether a
 * connector was connected — find_connectors and attach_connector were the whole
 * vocabulary.
 *
 * What this file pins is the honesty of the answers rather than their existence:
 * - health is always stated WITH the age of its measurement, and a connector
 *   nothing has probed says so rather than falling through to a colour;
 * - verifying is a real call to someone's system, so it confirms first and says
 *   whose credentials it uses;
 * - a connector with no health path is reported as unprobeable, NOT as unhealthy;
 * - a credential never enters a conversation, and the refusal still ends
 *   somewhere useful.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { runTurn, resolveAction, type EngineDeps } from "../server/astra/engine";
import { ToolRegistry } from "../server/astra/registry";
import { MemoryThreadStore } from "../server/astra/memory-store";
import { scriptedComplete, result, call } from "../server/astra/scripted-brain";
import { finishTurnTool } from "../server/astra/tools/finish-turn";
import { loadToolsTool } from "../server/astra/tools/load-tools";
import { CONNECTOR_TOOLS } from "../server/astra/tools/connectors";
import { PACKS } from "../server/astra/packs";
import { hasPermission, type RoleId } from "../server/permissions";
import type { AstraContext } from "../server/astra/types";

const ORG = "org-a";
const as = (role: RoleId): AstraContext => ({ orgId: ORG, userId: "u1", role, industryId: "insurance" });
const read = (...p: string[]) => readFileSync(join(__dirname, "..", ...p), "utf8").replace(/\r\n/g, "\n");

const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString();

/** The live shape: reachable at its last probe, which was 32 days ago. */
const serviceNow = {
  id: "srv-snow",
  name: "ServiceNow",
  state: "reachable" as const,
  checkedAt: daysAgo(32),
  ageDays: 32,
  stale: true,
  detail: "OK",
  mock: false,
  canProbe: true,
  checkKind: "vendor_connection_test" as const,
  checkWhy: "it can make a real call to the system it connects to",
  measuredBy: "vendor_connection_test" as const,
  protocolMounted: true,
  riskTier: "MEDIUM",
  transport: "streamable-http",
  agentsBound: 4,
};

interface Options {
  connectors?: any[];
  verify?: any;
  tools?: any;
  usage?: any;
  requirements?: any;
}

function setup(steps: Parameters<typeof scriptedComplete>[0], opts: Options = {}) {
  const store = new MemoryThreadStore();
  const threadId = store.createThread(ORG);
  const connectors = opts.connectors ?? [serviceNow];
  const services = {
    connectorHealth: vi.fn(async (_org: string, ref?: string) => ({
      connectors: ref ? connectors.filter((c) => c.name.toLowerCase().includes(ref.toLowerCase())) : connectors,
      total: 131,
      neverChecked: 18,
      staleOverAWeek: 129,
      checkedWithinAWeek: 2,
      unreachable: 0,
      mock: 85,
      usedByNobody: 115,
      canBeProbed: 118,
      unknownProvenance: 112,
      protocolMountMissing: 14,
      byCheckKind: { vendor_connection_test: 6, mcp_tools_list: 2, mock_endpoint: 109, health_path: 1, none: 13 },
    })),
    verifyConnector: vi.fn(async () => opts.verify ?? {
      connector: { id: "srv-snow", name: "ServiceNow" },
      before: serviceNow,
      healthy: true,
      detail: "OK",
      checkedAt: new Date().toISOString(),
      probeWasPossible: true,
    }),
    findTool: vi.fn(async () => opts.tools ?? {
      query: "raise a ticket",
      searched: 792,
      matches: [{ tool: "snow_create_incident", description: "Create an incident record", connector: "ServiceNow", connectorId: "srv-snow", installed: true, health: "reachable", checkedAgo: 32 }],
    }),
    connectorUsage: vi.fn(async () => opts.usage ?? {
      connector: serviceNow,
      agents: [{ id: "a1", name: "CMDB Hygiene Sweep" }, { id: "a2", name: "Change Risk Reviewer" }],
      tools: ["snow_create_incident", "snow_add_work_note"],
    }),
    connectionRequirements: vi.fn(async () => opts.requirements ?? {
      platform: { id: "slack", name: "Slack", authMethod: "oauth2" },
      connected: false,
      fields: [
        { key: "botToken", label: "Bot User OAuth Token", required: true, secret: true },
        { key: "signingSecret", label: "Signing Secret", required: true, secret: true },
      ],
      where: "/integrations — the platform's Connect form writes them straight to the vault",
      docsUrl: "https://api.slack.com/docs",
    }),
    getUserDisplayName: vi.fn(async () => "admin"),
  };
  const deps: EngineDeps = {
    store,
    registry: new ToolRegistry([finishTurnTool, loadToolsTool, ...CONNECTOR_TOOLS], hasPermission),
    complete: scriptedComplete(steps),
    can: hasPermission,
    audit: vi.fn(async () => {}),
    services,
    model: "test",
  };
  return { store, threadId, deps, services, onEvent: () => {} };
}

const load = () => ({ toolCalls: [{ name: "load_tools", arguments: { pack: "connectors" } }] });
const use = (name: string, args: Record<string, unknown> = {}) => ({ toolCalls: [{ name, arguments: args }] });
const done = (text: string) => result(text, [call("finish_turn", { suggestions: [] })]);
const lastTool = (messages: any[]) => JSON.parse(messages.filter((m) => m.role === "tool").at(-1).content);
const pending = async (t: ReturnType<typeof setup>) => (await t.store.loadThread(t.threadId, ORG))!.pendingAction!;

afterEach(() => vi.clearAllMocks());

describe("the pack", () => {
  it("is offered, and its tools arrive only once it is loaded", async () => {
    expect(PACKS.map((p) => p.id)).toContain("connectors");
    const registry = setup([]).deps.registry;
    const core = registry.canonicalDefinitions("admin").map((d) => d.name);
    expect(core).not.toContain("connector_health");
    const loaded = registry.canonicalDefinitions("admin", ["connectors"]).map((d) => d.name);
    expect(loaded).toContain("connector_health");
    expect(loaded).toContain("verify_connector");
    expect(loaded).toContain("find_tool");
    expect(loaded).toContain("connector_usage");
    expect(loaded).toContain("connection_requirements");
  });

  it("says in its description that finding and attaching need no pack, since those are core", () => {
    const pack = PACKS.find((p) => p.id === "connectors")!;
    expect(pack.description).toContain("needs no pack");
  });
});

describe("whether a connector is working", () => {
  it("answers with the age of the measurement, never as if it were current", async () => {
    const t = setup([
      load(),
      use("connector_health", { connector: "ServiceNow" }),
      (m) => {
        const p = lastTool(m).result;
        expect(p.message).toContain("reachable when last probed");
        expect(p.message).toContain("32 days ago");
        expect(p.checkedDaysAgo).toBe(32);
        // The escape from a stale answer is offered with what it costs.
        expect(p.verify).toContain("real call to that system");
        return done("Checked 32 days ago.");
      },
    ]);
    await runTurn(t.deps, as("admin"), t.threadId, "Is ServiceNow working?", t.onEvent);
  });

  it("says a connector nothing has probed is unknown, rather than giving it a state", async () => {
    const never = { ...serviceNow, name: "Figma Design Generator", state: "never_checked" as const, checkedAt: null, ageDays: null, stale: false, detail: null, canProbe: true };
    const t = setup([
      load(),
      use("connector_health", { connector: "Figma" }),
      (m) => {
        const p = lastTool(m).result;
        expect(p.message).toContain("never checked");
        expect(p.message).toContain("state is unknown");
        expect(p.checkedDaysAgo).toBeNull();
        return done("Never checked.");
      },
    ], { connectors: [never] });
    await runTurn(t.deps, as("admin"), t.threadId, "Is the Figma connector healthy?", t.onEvent);
  });

  it("gives the fleet the counts that matter, with the basis of the figure", async () => {
    const t = setup([
      load(),
      use("connector_health"),
      (m) => {
        const p = lastTool(m).result;
        expect(p).toMatchObject({ total: 131, checkedWithinAWeek: 2, staleOverAWeek: 129, neverChecked: 18, usedByNoAgent: 115, mockEndpoints: 85 });
        expect(p.basis).toContain("state of its last check, not of now");
        // On the day the page shipped only ONE of 132 could be checked, because
        // the only check the platform had needed a bespoke health path. Now each
        // connector takes the strongest check its kind allows, and the answer says
        // how many of each — so the fleet figure can be read rather than trusted.
        expect(p.canBeCheckedAtAll).toBe("118 of 131");
        expect(p.checksAvailable).toMatchObject({ mcp_tools_list: 2, vendor_connection_test: 6 });
        // The state 112 connectors carry names no check that produced it, and that
        // is a stronger statement than "stale".
        expect(p.statesOfUnknownProvenance).toBe(112);
        expect(p.worthKnowing).toContain("names no check that produced it");
        expect(p.noProtocolEndpoint).toBe(14);
        return done("2 of 131 checked this week.");
      },
    ]);
    await runTurn(t.deps, as("admin"), t.threadId, "How healthy are our connectors?", t.onEvent);
  });

  it("flags a mock endpoint, which looked identical to a real system", async () => {
    const t = setup([
      load(),
      use("connector_health", { connector: "Mock CMDB" }),
      (m) => { expect(lastTool(m).result.mockEndpoint).toContain("not a real system"); return done("It's a mock."); },
    ], { connectors: [{ ...serviceNow, name: "Mock CMDB", mock: true }] });
    await runTurn(t.deps, as("admin"), t.threadId, "Is Mock CMDB up?", t.onEvent);
  });
});

describe("a connector nothing can check", () => {
  // What is left once every kind of check exists: a mock whose endpoints all
  // change something, an integration that is no longer part of the build, a row
  // with no endpoint at all. The reason is specific, so it can be acted on.
  const uncheckable = {
    ...serviceNow,
    name: "BB Market Intelligence",
    canProbe: false,
    checkKind: "none" as const,
    checkWhy: "it is a mock this process serves, and none of its endpoints is a read-only one, so nothing can be called without changing something",
    measuredBy: null,
  };

  it("says what is missing, rather than calling it never checked", async () => {
    const t = setup([
      load(),
      use("connector_health", { connector: "BB Market" }),
      (m) => {
        const p = lastTool(m).result;
        expect(p.message).toContain("cannot be re-checked");
        expect(p.cannotBeChecked).toContain("none of its endpoints is a read-only one");
        expect(p.verify).toBeUndefined();
        return done("It can't be checked.");
      },
    ], { connectors: [uncheckable] });
    await runTurn(t.deps, as("admin"), t.threadId, "Is BB Market Intelligence healthy?", t.onEvent);
  });

  it("refuses to check it up front instead of confirming something that cannot work", async () => {
    const t = setup([load(), use("verify_connector", { connector: "BB Market" }), (m) => {
      expect(lastTool(m).error).toContain("without changing something");
      return done("Can't check it.");
    }], { connectors: [uncheckable] });
    expect(await runTurn(t.deps, as("admin"), t.threadId, "Verify BB Market Intelligence", t.onEvent)).toBe("idle");
    expect(t.services.verifyConnector).not.toHaveBeenCalled();
  });
});

describe("a connector no agent can call at all", () => {
  // The invariant from the Figma work: without createMcpProtocolRouter a
  // connector's REST routes answer while every agent's protocol call 404s, and
  // no health check of any kind catches it. Only 2 of 16 enterprise connectors
  // mounted one when this was written, so it is reported alongside health rather
  // than folded into it.
  it("reports the missing protocol endpoint next to a green health answer", async () => {
    const t = setup([
      load(),
      use("connector_health", { connector: "ServiceNow" }),
      (m) => {
        const p = lastTool(m).result;
        expect(p.state).toBe("reachable");
        expect(p.protocolGap).toContain("no agent can call it over the protocol");
        return done("Reachable, but agents cannot call it over MCP.");
      },
    ], { connectors: [{ ...serviceNow, protocolMounted: false }] });
    await runTurn(t.deps, as("admin"), t.threadId, "Is ServiceNow working?", t.onEvent);
  });
});

describe("checking one now", () => {
  it("confirms first, saying which check it will make, what that proves, and with whose credentials", async () => {
    const t = setup([load(), use("verify_connector", { connector: "ServiceNow" }), done("Checked.")]);
    expect(await runTurn(t.deps, as("admin"), t.threadId, "Check ServiceNow now", t.onEvent)).toBe("awaiting_confirmation");
    const action = await pending(t);
    expect(action.summary).toBe("Check ServiceNow now");
    const details = action.details!.join(" ");
    expect(details).toContain("32 days ago");
    expect(details).toContain("credentials stored for it");
    // A confirm card that does not say which check it makes invites reading a
    // mock endpoint answering as the vendor's system being up.
    expect(details).toContain("make a real call to that system with the credentials stored for it");
    expect(details).toContain("and no more");
    expect(details).toContain("4 agents are bound");
    expect(t.services.verifyConnector).not.toHaveBeenCalled();

    await resolveAction(t.deps, as("admin"), t.threadId, action.id, "confirm", t.onEvent);
    expect(t.services.verifyConnector).toHaveBeenCalledTimes(1);
  });

  it("reports a check that could not run as exactly that, not as failing", async () => {
    const t = setup([
      load(),
      use("verify_connector", { connector: "ServiceNow" }),
      done("Nothing could check it."),
    ], {
      // The live case: testConnectionHealth has no branch for this integration, so
      // it answers not_verifiable. Recorded as unhealthy that reads as an outage.
      verify: {
        connector: { id: "srv-snow", name: "ServiceNow" },
        before: serviceNow,
        healthy: false,
        detail: "Cannot be verified: this integration has no credential test that doesn't change something",
        checkedAt: new Date().toISOString(),
        probeWasPossible: false,
        checkKind: "vendor_connection_test",
      },
    });
    await runTurn(t.deps, as("admin"), t.threadId, "Verify ServiceNow", t.onEvent);
    const action = await pending(t);
    await resolveAction(t.deps, as("admin"), t.threadId, action.id, "confirm", t.onEvent);
    // The answer lands on the thread, not in resolveAction's return.
    const thread = await t.store.loadThread(t.threadId, ORG);
    const said = JSON.stringify(thread);
    expect(said).toContain("Nothing checked ServiceNow");
    expect(said).toContain("not a failing one");
  });

  it("says which check ran and what it proves, so 'verified' cannot be read as more than it is", async () => {
    const t = setup([
      load(),
      use("verify_connector", { connector: "Mock CMDB" }),
      done("The mock answered."),
    ], {
      connectors: [{ ...serviceNow, name: "Mock CMDB", mock: true, checkKind: "mock_endpoint", checkWhy: "it is a mock this process serves, with a read-only endpoint that can be called safely" }],
      verify: {
        connector: { id: "srv-snow", name: "Mock CMDB" },
        before: serviceNow,
        healthy: true,
        detail: "Its /watchlists endpoint answered (HTTP 200), so the mock is mounted and serving",
        checkedAt: new Date().toISOString(),
        probeWasPossible: true,
        checkKind: "mock_endpoint",
      },
    });
    await runTurn(t.deps, as("admin"), t.threadId, "Verify Mock CMDB", t.onEvent);
    const action = await pending(t);
    expect(action.details!.join(" ")).toContain("call one of its read-only endpoints");
    await resolveAction(t.deps, as("admin"), t.threadId, action.id, "confirm", t.onEvent);
    const said = JSON.stringify(await t.store.loadThread(t.threadId, ORG));
    expect(said).toContain("mock_endpoint");
    expect(said).toContain("the backend this platform serves is still mounted");
  });

  it("is not offered to a role that cannot manage connectors, while reading health is", () => {
    const registry = setup([]).deps.registry;
    const names = (role: RoleId) => registry.canonicalDefinitions(role, ["connectors"]).map((d) => d.name);
    expect(names("admin")).toContain("verify_connector");
    expect(names("outcome_owner")).toContain("connector_health");
    expect(names("outcome_owner")).not.toContain("verify_connector");
  });
});

describe("finding one by what it does", () => {
  it("searches what the tools do and says how many were searched", async () => {
    const t = setup([
      load(),
      use("find_tool", { does: "raise a ticket" }),
      (m) => {
        const p = lastTool(m).result;
        expect(p.message).toContain("of 792 catalogued tools");
        expect(p.matches[0]).toMatchObject({ tool: "snow_create_incident", connector: "ServiceNow" });
        // A match carries the connector's health, so nobody attaches a dead one.
        expect(p.matches[0].connectorHealth).toContain("32 days ago");
        return done("ServiceNow can.");
      },
    ]);
    await runTurn(t.deps, as("admin"), t.threadId, "Which connector can raise a ticket?", t.onEvent);
  });

  it("says what it did NOT search when nothing matches, rather than 'the platform cannot'", async () => {
    const t = setup([
      load(),
      use("find_tool", { does: "post to Mastodon" }),
      (m) => {
        const p = lastTool(m).result;
        expect(p.note).toContain("connectors already installed");
        expect(p.note).toContain("find_connectors searches the marketplace");
        return done("Nothing installed does that.");
      },
    ], { tools: { query: "post to Mastodon", searched: 792, matches: [] } });
    await runTurn(t.deps, as("admin"), t.threadId, "Can we post to Mastodon?", t.onEvent);
  });
});

describe("who uses one", () => {
  it("names the agents bound to it", async () => {
    const t = setup([
      load(),
      use("connector_usage", { connector: "ServiceNow" }),
      (m) => {
        const p = lastTool(m).result;
        expect(p.message).toContain("2 agents use ServiceNow");
        expect(p.agents).toEqual(["CMDB Hygiene Sweep", "Change Risk Reviewer"]);
        return done("Two agents.");
      },
    ]);
    await runTurn(t.deps, as("admin"), t.threadId, "Who uses ServiceNow?", t.onEvent);
  });

  it("says plainly when nothing uses it, which is true of most of them", async () => {
    const t = setup([
      load(),
      use("connector_usage", { connector: "BB Market Intelligence" }),
      (m) => {
        const p = lastTool(m).result;
        expect(p.message).toContain("Nothing uses");
        expect(p.note).toContain("nothing in the platform calls it");
        return done("Nobody.");
      },
    ], {
      usage: { connector: { ...serviceNow, name: "BB Market Intelligence", agentsBound: 0 }, agents: [], tools: [], note: "No agent is bound to this connector, so nothing in the platform calls it." },
    });
    await runTurn(t.deps, as("admin"), t.threadId, "Does anything use BB Market Intelligence?", t.onEvent);
  });
});

describe("connecting a platform", () => {
  it("names the fields and refuses the secret, without leaving the person stuck", async () => {
    const t = setup([
      load(),
      use("connection_requirements", { platform: "slack" }),
      (m) => {
        const p = lastTool(m).result;
        expect(p.connected).toBe(false);
        expect(p.fields).toEqual(["Bot User OAuth Token — secret", "Signing Secret — secret"]);
        expect(p.doNotPasteHere).toContain("stored and searchable");
        expect(p.where).toContain("straight to the vault");
        return done("Two secrets, entered on the page.");
      },
    ]);
    await runTurn(t.deps, as("admin"), t.threadId, "Connect Slack for me", t.onEvent);
  });

  it("takes no credential in its input at all, so a pasted secret has nowhere to go", () => {
    const tool = CONNECTOR_TOOLS.find((x) => x.name === "connection_requirements")!;
    const shape = (tool.input as any)._def.shape();
    expect(Object.keys(shape)).toEqual(["platform"]);
    // And no tool in the pack accepts anything that could carry one.
    for (const t of CONNECTOR_TOOLS) {
      const keys = Object.keys((t.input as any)._def.shape());
      expect(keys.some((k) => /token|secret|password|credential|key$/i.test(k))).toBe(false);
    }
  });

  it("says it in the tool description too, where the model reads it", () => {
    const tool = CONNECTOR_TOOLS.find((x) => x.name === "connection_requirements")!;
    expect(tool.description).toContain("NEVER accepted in a conversation");
  });
});

describe("one source for health", () => {
  it("checks through the scan's own deps, so a conversation and the scheduled scan cannot disagree", () => {
    const actions = read("server", "connector-actions.ts");
    expect(actions).toContain('import { connectorHealthDeps, vendorConnectionTest } from "./connector-health-scan"');
    // The same chooseProbe the schedule uses picks the check, so a person and the
    // scan can never make different checks and call them the same thing.
    expect(actions).toContain("const { method } = chooseProbe(target)");
    expect(actions).toContain("connectorHealthDeps.probe(target, method)");
    expect(actions).toContain("connectorHealthDeps.saveHealth(server.id, result.healthy, result.detail, at, result.method)");
    // And records it, since a verification is a real call to someone's system.
    expect(actions).toContain('connectorHealthDeps.audit("connector.health_verified"');
  });

  it("keeps one tenant's credential test off a row every tenant reads", () => {
    const actions = read("server", "connector-actions.ts");
    expect(actions).toContain("const sharedRow = !!server.integrationId && !server.organizationId");
    expect(actions).toMatch(/if \(!\(sharedRow && result\.method === "vendor_connection_test"\)\)/);
  });

  it("reads an enterprise connector's real measurement from the connection, which is where its tests are written", () => {
    const actions = read("server", "connector-actions.ts");
    // POST /api/integrations/:id/test has always written last_tested_at on the
    // connection, while the column this page read had nothing writing it for those
    // connectors at all -- which is why Salesforce showed "never checked" on a page
    // while /integrations showed a test from that morning.
    expect(actions).toContain("function measurementFor(");
    expect(actions).toContain("connection.lastTestResult === \"ok\"");
    expect(actions).toContain("storage.listIntegrationConnections(orgId)");
  });
});
