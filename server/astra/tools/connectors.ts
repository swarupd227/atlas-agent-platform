import { z } from "zod";
import { checkedAgo, checkOffer, checkProves, healthWords, type ConnectorCheckKind, type ConnectorHealthState } from "@shared/connector-health-words";
import type { AstraTool, ConfirmPreview } from "../types";

/** Loaded on demand: find_connectors and attach_connector stay core. */
const PACK = "connectors";

/**
 * Connectors, in a conversation: is it working, which one does the thing I need,
 * who uses it, and what would connecting one take.
 *
 * find_connectors and attach_connector already existed. What was missing is
 * everything a person actually asks after "is it connected?" -- and the platform's
 * answer to the first of those was dishonest by omission: 113 of 131 connectors
 * reported "healthy" while 129 had not been probed for over a week (measured
 * 2026-09-27). Every health answer here states the AGE of its measurement, and
 * never presents a three-week-old probe as the state now.
 *
 * It also states WHICH check produced it, because they are not equivalent: a
 * tools/list handshake exercises the path an agent's call takes, a credential test
 * proves the far system answered, a mock endpoint proves only that this process
 * still serves the mock -- and a state carried over from before the platform
 * recorded any of that proves nothing at all. See connector-health-probe.ts.
 *
 * Credentials are not here on purpose. A conversation is stored and searchable, so
 * a secret never passes through one; connection_requirements says which fields a
 * platform needs so that refusal ends somewhere useful.
 */

// The page says it the same way, from the same functions: a badge and a sentence
// that disagree about the same connector are worse than either alone.
const ago = checkedAgo;
const stateWords = (state: string, days: number | null, canProbe = true, opts: { measuredBy?: ConnectorCheckKind | null; why?: string } = {}) =>
  healthWords(state as ConnectorHealthState, days, canProbe, opts);
/** A connector as connectorHealth reports it, including which check applies to it. */
const words = (c: any) => stateWords(c.state, c.ageDays, c.canProbe, { measuredBy: c.measuredBy, why: c.checkWhy });

export const connectorHealthTool: AstraTool<{ connector?: string }> = {
  name: "connector_health",
  description:
    "Whether connectors are reachable, WHEN that was last actually checked, and WHICH check produced the answer -- an MCP tools/list handshake, the far system's own credential test, a health endpoint, or a mock endpoint on this host. Says plainly when a connector has never been checked, when nothing can check it, and when a state on record names no check that produced it. Name one connector, or omit to get the whole organization's picture.",
  input: z.object({
    connector: z.string().optional().describe("A connector's name or id. Omit for every connector."),
  }),
  pack: PACK,
  permission: "view_agents",
  confirm: false,
  run: async (ctx, input) => {
    const r = await ctx.services.connectorHealth(ctx.orgId, input.connector);
    const one = input.connector && r.connectors.length === 1 ? r.connectors[0] : null;

    if (one) {
      return {
        payload: {
          message: `${one.name}: ${words(one)}`,
          connector: one.name,
          state: one.state,
          lastChecked: one.checkedAt,
          checkedDaysAgo: one.ageDays,
          measuredBy: one.measuredBy ?? "a check this platform can no longer identify",
          ...(one.detail ? { lastDetail: one.detail } : {}),
          agentsBound: one.agentsBound,
          ...(one.agentsBound === 0 ? { note: "No agent is bound to it, so nothing in the platform calls it." } : {}),
          ...(one.mock ? { mockEndpoint: "This points at a mock endpoint on this host, not a real system." } : {}),
          ...(one.protocolMounted === false
            ? { protocolGap: "No MCP protocol endpoint is mounted for this connector, so no agent can call it over the protocol however healthy it looks — its REST routes answering says nothing about that." }
            : {}),
          ...(one.canProbe
            ? (one.stale || one.state === "never_checked" || one.measuredBy == null
                ? { verify: `verify_connector checks it now: it would ${checkOffer(one.checkKind)}.` }
                : {})
            : { cannotBeChecked: `Nothing can check it: ${one.checkWhy}. Whatever state it shows cannot be refreshed.` }),
        },
        artifact: {
          kind: "text",
          title: `${one.name} — connector health`,
          props: { text: [`**${one.name}** — ${words(one)}`, "", `- ${one.agentsBound} ${one.agentsBound === 1 ? "agent is" : "agents are"} bound to it`, ...(one.mock ? ["- points at a mock endpoint on this host"] : []), ...(one.protocolMounted === false ? ["- no MCP protocol endpoint is mounted, so no agent can call it over the protocol"] : []), ...(one.canProbe ? [`- a check now would ${checkOffer(one.checkKind)}`] : [`- nothing can check it: ${one.checkWhy}`]), ...(one.detail ? [`- last check said: ${one.detail}`] : [])].join("\n") },
          fullViewHref: "/connectors",
        },
        proof: { context: { status: "measured", summary: one.checkedAt ? `check of ${one.name} recorded ${ago(one.ageDays)}${one.measuredBy ? ` (${one.measuredBy})` : " by an unidentified check"}` : `${one.name} has never been checked` } },
      };
    }

    return {
      payload: {
        message: `${r.checkedWithinAWeek} of ${r.total} connectors were checked in the last week`,
        total: r.total,
        checkedWithinAWeek: r.checkedWithinAWeek,
        staleOverAWeek: r.staleOverAWeek,
        neverChecked: r.neverChecked,
        unreachableAtLastCheck: r.unreachable,
        usedByNoAgent: r.usedByNobody,
        mockEndpoints: r.mock,
        canBeCheckedAtAll: `${r.canBeProbed} of ${r.total}`,
        checksAvailable: r.byCheckKind,
        statesOfUnknownProvenance: r.unknownProvenance,
        ...(r.protocolMountMissing > 0 ? { noProtocolEndpoint: r.protocolMountMissing } : {}),
        basis: "Read from each connector's stored check result and its timestamp, and — for an enterprise connector — from this organization's own connection record, which is where its credential tests are written. A connector reports the state of its last check, not of now.",
        ...(r.unknownProvenance > 0
          ? { worthKnowing: `${r.unknownProvenance} of ${r.total} show a state that names no check that produced it, so what it proved is unknown. Each will be replaced by a real check on the next scan${r.protocolMountMissing > 0 ? `, and ${r.protocolMountMissing} enterprise connectors have no MCP protocol endpoint mounted, which no health check catches` : ""}.` }
          : r.total - r.canBeProbed > 0
            ? { worthKnowing: `${r.total - r.canBeProbed} of ${r.total} cannot be checked by anything; ask about one of them for the reason.` }
            : r.staleOverAWeek > 0
              ? { worthKnowing: `${r.staleOverAWeek} connectors show a state older than a week. verify_connector re-checks one.` }
              : {}),
      },
      artifact: {
        kind: "text",
        title: "Connector health",
        props: {
          text: [
            `**${r.total} connectors**`,
            "",
            `- ${r.checkedWithinAWeek} checked in the last week`,
            `- ${r.staleOverAWeek} last checked over a week ago`,
            `- ${r.neverChecked} never checked at all`,
            `- ${r.unreachable} failing at their last check`,
            `- ${r.usedByNobody} used by no agent`,
            `- ${r.mock} pointing at a mock endpoint`,
            `- ${r.canBeProbed} can be checked at all`,
            ...(r.unknownProvenance > 0 ? [`- ${r.unknownProvenance} show a state that names no check that produced it`] : []),
            ...(r.protocolMountMissing > 0 ? [`- ${r.protocolMountMissing} have no MCP protocol endpoint mounted`] : []),
          ].join("\n"),
        },
        fullViewHref: "/connectors",
      },
      proof: { context: { status: "measured", summary: `${r.total} connectors read, with each one's last check, what took it, and which check applies to it now` } },
    };
  },
};

export const verifyConnectorTool: AstraTool<{ connector: string }> = {
  name: "verify_connector",
  description:
    "Check one connector NOW and record the result, so its health stops being a stale figure. Makes the strongest check that connector allows -- an MCP handshake and tools/list for a real MCP server, the vendor's own credential test for an enterprise connector, a read-only endpoint for a mock this host serves -- which means a real call with the credentials held for it. Use it when a connector's last check is old, when an agent's tool call failed, or before relying on one.",
  input: z.object({ connector: z.string().min(1).describe("The connector's name or id.") }),
  pack: PACK,
  permission: "manage_mcp_servers",
  confirm: true,
  preview: async (ctx, input): Promise<ConfirmPreview> => {
    let health;
    try {
      health = await ctx.services.connectorHealth(ctx.orgId, input.connector);
    } catch (e) {
      return { refuse: (e as Error).message };
    }
    if (health.connectors.length === 0) return { refuse: `No connector matching "${input.connector}".` };
    if (health.connectors.length > 1) {
      return { refuse: `"${input.connector}" matches ${health.connectors.length} connectors: ${health.connectors.map((c: any) => c.name).join(", ")}. Name one.` };
    }
    const c = health.connectors[0];
    if (!c.canProbe) {
      return { refuse: `Nothing can check ${c.name}: ${c.checkWhy}. ${c.state === "never_checked" ? "It has never been checked." : `The state it shows was written ${checkedAgo(c.ageDays)} and cannot be refreshed.`}` };
    }
    return {
      summary: `Check ${c.name} now`,
      details: [
        `It ${words(c)}.`,
        `This would ${checkOffer(c.checkKind)}, and record what comes back — so a pass proves that ${checkProves(c.checkKind)}, and no more.`,
        c.mock ? "It points at a mock endpoint on this host, so this tests the mock, not a real system." : "Nothing else changes: no agent runs, and no data is written to that system.",
        ...(c.protocolMounted === false ? ["Separately: no MCP protocol endpoint is mounted for it, so no agent can call it over the protocol whatever this check says."] : []),
        ...(c.agentsBound > 0 ? [`${c.agentsBound} ${c.agentsBound === 1 ? "agent is" : "agents are"} bound to it and would be affected by it being down.`] : ["No agent is bound to it."]),
      ],
      frozen: { connector: c.id, name: c.name },
    };
  },
  run: async (ctx, input) => {
    const actor = (ctx as any).actorLabel ?? "Astra Cowork";
    const r = await ctx.services.verifyConnector(ctx.orgId, input.connector, actor);
    if (!r.probeWasPossible) {
      return {
        payload: {
          message: `Nothing checked ${r.connector.name}: ${r.detail}`,
          connector: r.connector.name,
          recorded: false,
          note: "Its stored state is left exactly as it was rather than marked unhealthy — a connector nothing can check is not a failing one.",
        },
      };
    }
    const moved = r.before.state !== (r.healthy ? "reachable" : "unreachable");
    return {
      payload: {
        message: `${r.connector.name} is ${r.healthy ? "reachable" : "not reachable"} as of now`,
        connector: r.connector.name,
        healthy: r.healthy,
        checkedBy: r.checkKind,
        proves: checkProves(r.checkKind),
        detail: r.detail,
        checkedAt: r.checkedAt,
        previously: `${words(r.before)}`,
        ...(moved ? { changed: `Its recorded state changed from ${r.before.state.replace(/_/g, " ")} to ${r.healthy ? "reachable" : "unreachable"}.` } : {}),
        ...(!r.healthy && r.before.agentsBound > 0 ? { affects: `${r.before.agentsBound} ${r.before.agentsBound === 1 ? "agent" : "agents"} bound to it` } : {}),
      },
      artifact: {
        kind: "text",
        title: `${r.connector.name} — checked just now`,
        props: { text: [`**${r.connector.name}** — ${r.healthy ? "reachable" : "not reachable"}`, "", `${r.detail}`, "", `That check proves ${checkProves(r.checkKind)}.`, "", `Previously: ${words(r.before)}.`].join("\n") },
        fullViewHref: "/connectors",
      },
      proof: {
        context: { status: "measured", summary: `live ${r.checkKind.replace(/_/g, " ")} check of ${r.connector.name} at ${r.checkedAt.slice(11, 16)} UTC` },
        compliance: { status: "measured", summary: "Recorded as connector.health_verified on the audit trail" },
      },
    };
  },
};

export const findToolTool: AstraTool<{ does: string }> = {
  name: "find_tool",
  description:
    "Which connector offers a tool that does something — searched over what the tools DO, not their names. Use it when someone asks for a capability (\"raise a ticket\", \"send an invoice\", \"look up a VIN\") rather than naming a connector, and before assuming the platform cannot do something.",
  input: z.object({ does: z.string().min(2).describe("What the tool should do, in the user's own words.") }),
  pack: PACK,
  permission: "view_agents",
  confirm: false,
  run: async (ctx, input) => {
    const r = await ctx.services.findTool(ctx.orgId, input.does);
    if (r.matches.length === 0) {
      return {
        payload: {
          message: `Nothing among the ${r.searched} catalogued tools matches "${input.does}"`,
          searched: r.searched,
          note: "The catalogue only holds tools of connectors already installed here. find_connectors searches the marketplace as well, and a connector that has never been opened lists no tools at all until it is.",
        },
      };
    }
    return {
      payload: {
        message: `${r.matches.length} of ${r.searched} catalogued tools match "${input.does}"`,
        matches: r.matches.map((m: any) => ({
          tool: m.tool,
          connector: m.connector,
          what: m.description && m.description.length > 160 ? `${m.description.slice(0, 157)}…` : m.description,
          connectorHealth: `${m.health === "never_checked" ? "never checked" : m.health} · ${ago(m.checkedAgo)}`,
        })),
        next: "attach_connector gives an agent the connector that carries the tool; connector_health says whether it is actually reachable.",
      },
      artifact: {
        kind: "text",
        title: `Tools that match "${input.does}"`,
        props: { text: r.matches.map((m: any) => `- \`${m.tool}\` — ${m.connector}${m.description ? `: ${String(m.description).slice(0, 90)}` : ""}`).join("\n") },
        fullViewHref: "/integrations/tool-catalog",
      },
      proof: { context: { status: "measured", summary: `${r.searched} catalogued tools searched` } },
    };
  },
};

export const connectorUsageTool: AstraTool<{ connector: string }> = {
  name: "connector_usage",
  description:
    "Which agents are bound to a connector and what it exposes. Answers \"is anything actually using this?\" — most connectors in an organization are used by nobody, and that is the difference between one that matters and clutter.",
  input: z.object({ connector: z.string().min(1).describe("The connector's name or id.") }),
  pack: PACK,
  permission: "view_agents",
  confirm: false,
  run: async (ctx, input) => {
    const r = await ctx.services.connectorUsage(ctx.orgId, input.connector);
    return {
      payload: {
        message: r.agents.length === 0 ? `Nothing uses ${r.connector.name}` : `${r.agents.length} ${r.agents.length === 1 ? "agent uses" : "agents use"} ${r.connector.name}`,
        connector: r.connector.name,
        health: `${stateWords(r.connector.state, r.connector.ageDays, r.connector.canProbe)}`,
        agents: r.agents.map((a: any) => a.name),
        tools: r.tools,
        ...(r.note ? { note: r.note } : {}),
        ...(r.connector.mock ? { mockEndpoint: "Points at a mock endpoint on this host, not a real system." } : {}),
      },
      artifact: {
        kind: "text",
        title: `${r.connector.name} — who uses it`,
        props: {
          text: [
            `**${r.connector.name}** — ${stateWords(r.connector.state, r.connector.ageDays)}`,
            "",
            r.agents.length ? r.agents.map((a: any) => `- ${a.name}`).join("\n") : "- no agent is bound to it",
            "",
            `${r.tools.length} ${r.tools.length === 1 ? "tool" : "tools"}${r.tools.length ? `: ${r.tools.slice(0, 8).join(", ")}${r.tools.length > 8 ? "…" : ""}` : ""}`,
          ].join("\n"),
        },
        fullViewHref: "/integrations",
      },
      proof: { context: { status: "measured", summary: `${r.agents.length} bindings and ${r.tools.length} tools read for ${r.connector.name}` } },
    };
  },
};

export const connectionRequirementsTool: AstraTool<{ platform: string }> = {
  name: "connection_requirements",
  description:
    "What connecting a platform needs: which credential fields, whether it is already connected, and where they are entered. Use it when someone asks to connect something — you can tell them exactly what to have ready, but a secret is NEVER accepted in a conversation and this tool never asks for one.",
  input: z.object({ platform: z.string().min(1).describe("The platform's name or id, e.g. slack or \"Microsoft Teams\".") }),
  pack: PACK,
  permission: "view_agents",
  confirm: false,
  run: async (ctx, input) => {
    const r = await ctx.services.connectionRequirements(ctx.orgId, input.platform);
    const secrets = r.fields.filter((f: any) => f.secret);
    return {
      payload: {
        message: r.connected ? `${r.platform.name} is already connected` : `${r.platform.name} needs ${r.fields.length} ${r.fields.length === 1 ? "field" : "fields"} to connect`,
        platform: r.platform.name,
        connected: r.connected,
        authMethod: r.platform.authMethod,
        fields: r.fields.map((f: any) => `${f.label}${f.required ? "" : " (optional)"}${f.secret ? " — secret" : ""}`),
        where: r.where,
        ...(r.docsUrl ? { docs: r.docsUrl } : {}),
        ...(secrets.length
          ? { doNotPasteHere: `${secrets.length === 1 ? "That value is a secret" : "Those values are secrets"} and must not be typed into this conversation: a thread is stored and searchable. Entered on the page, they go straight to the vault and are never shown again.` }
          : {}),
      },
      artifact: {
        kind: "text",
        title: `Connecting ${r.platform.name}`,
        props: {
          text: [
            `**${r.platform.name}** — ${r.connected ? "already connected" : "not connected"}`,
            "",
            ...r.fields.map((f: any) => `- ${f.label}${f.required ? "" : " (optional)"}${f.secret ? " · secret, entered on the page only" : ""}`),
            "",
            r.where,
          ].join("\n"),
        },
        fullViewHref: "/integrations",
      },
      proof: { context: { status: "measured", summary: `${r.platform.name}'s catalogue entry and this organization's connections` } },
    };
  },
};

export const CONNECTOR_TOOLS: AstraTool[] = [
  connectorHealthTool,
  verifyConnectorTool,
  findToolTool,
  connectorUsageTool,
  connectionRequirementsTool,
] as AstraTool[];
