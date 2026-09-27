import { z } from "zod";
import { checkedAgo, healthWords, type ConnectorHealthState } from "@shared/connector-health-words";
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
 * Credentials are not here on purpose. A conversation is stored and searchable, so
 * a secret never passes through one; connection_requirements says which fields a
 * platform needs so that refusal ends somewhere useful.
 */

// The page says it the same way, from the same functions: a badge and a sentence
// that disagree about the same connector are worse than either alone.
const ago = checkedAgo;
const stateWords = (state: string, days: number | null, canProbe = true) => healthWords(state as ConnectorHealthState, days, canProbe);

export const connectorHealthTool: AstraTool<{ connector?: string }> = {
  name: "connector_health",
  description:
    "Whether connectors are reachable, and WHEN that was last actually checked. Nothing re-probes a connector on its own, so a connector's state is only as current as its last check -- this reports both, and says plainly when a connector has never been checked. Name one connector, or omit to get the whole organization's picture.",
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
          message: `${one.name}: ${stateWords(one.state, one.ageDays, one.canProbe)}`,
          connector: one.name,
          state: one.state,
          lastChecked: one.checkedAt,
          checkedDaysAgo: one.ageDays,
          ...(one.detail ? { lastDetail: one.detail } : {}),
          agentsBound: one.agentsBound,
          ...(one.agentsBound === 0 ? { note: "No agent is bound to it, so nothing in the platform calls it." } : {}),
          ...(one.mock ? { mockEndpoint: "This points at a mock endpoint on this host, not a real system." } : {}),
          ...(one.canProbe
            ? (one.stale || one.state === "never_checked"
                ? { verify: "verify_connector probes it now — that makes a real call to the system with the stored credentials." }
                : {})
            : { cannotBeVerified: "No health check path is configured for it, so neither the scheduled scan nor verify_connector can probe it. Whatever state it shows was written once and cannot be refreshed." }),
        },
        artifact: {
          kind: "text",
          title: `${one.name} — connector health`,
          props: { text: [`**${one.name}** — ${stateWords(one.state, one.ageDays)}`, "", `- ${one.agentsBound} ${one.agentsBound === 1 ? "agent is" : "agents are"} bound to it`, ...(one.mock ? ["- points at a mock endpoint on this host"] : []), ...(one.detail ? [`- last probe said: ${one.detail}`] : [])].join("\n") },
          fullViewHref: "/integrations",
        },
        proof: { context: { status: "measured", summary: one.checkedAt ? `probe of ${one.name} recorded ${ago(one.ageDays)}` : `${one.name} has never been probed` } },
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
        canBeProbedAtAll: `${r.canBeProbed} of ${r.total}`,
        basis: "Read from each connector's stored probe result and its timestamp. A connector reports the state of its last check, not of now, and nothing re-checks on its own.",
        ...(r.total - r.canBeProbed > 0
          ? { worthKnowing: `${r.total - r.canBeProbed} of ${r.total} have no health check path, so nothing can probe them — the state they show cannot be refreshed by the scan or by verify_connector. Only ${r.canBeProbed} can be checked at all.` }
          : r.staleOverAWeek > 0
            ? { worthKnowing: `${r.staleOverAWeek} connectors show a state older than a week. verify_connector re-probes one.` }
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
          ].join("\n"),
        },
        fullViewHref: "/integrations",
      },
      proof: { context: { status: "measured", summary: `${r.total} connectors read, with each one's last probe time` } },
    };
  },
};

export const verifyConnectorTool: AstraTool<{ connector: string }> = {
  name: "verify_connector",
  description:
    "Probe one connector NOW and record the result, so its health stops being a stale figure. This makes a real call to that system using the credentials held for it. Use it when a connector's last check is old, when an agent's tool call failed, or before relying on one.",
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
      return { refuse: `${c.name} has no health check path configured, so nothing can probe it — not this and not the scheduled scan. ${c.state === "never_checked" ? "It has never been checked." : `The state it shows was written ${checkedAgo(c.ageDays)} and cannot be refreshed.`} A health check path has to be set on the connector first.` };
    }
    return {
      summary: `Probe ${c.name} now`,
      details: [
        `It ${stateWords(c.state, c.ageDays)}.`,
        "This calls that system for real, with the credentials stored for it, and records what comes back.",
        c.mock ? "It points at a mock endpoint on this host, so the probe tests the mock, not a real system." : "Nothing else changes: no agent runs, and no data is written to that system.",
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
          message: `${r.connector.name} has no health check configured, so it cannot be probed`,
          connector: r.connector.name,
          recorded: false,
          note: "Its stored state is left exactly as it was rather than marked unhealthy — an unprobeable connector is not a failing one. A health path has to be set on the connector first.",
        },
      };
    }
    const moved = r.before.state !== (r.healthy ? "reachable" : "unreachable");
    return {
      payload: {
        message: `${r.connector.name} is ${r.healthy ? "reachable" : "not reachable"} as of now`,
        connector: r.connector.name,
        healthy: r.healthy,
        detail: r.detail,
        checkedAt: r.checkedAt,
        previously: `${stateWords(r.before.state, r.before.ageDays)}`,
        ...(moved ? { changed: `Its recorded state changed from ${r.before.state.replace(/_/g, " ")} to ${r.healthy ? "reachable" : "unreachable"}.` } : {}),
        ...(!r.healthy && r.before.agentsBound > 0 ? { affects: `${r.before.agentsBound} ${r.before.agentsBound === 1 ? "agent" : "agents"} bound to it` } : {}),
      },
      artifact: {
        kind: "text",
        title: `${r.connector.name} — probed just now`,
        props: { text: [`**${r.connector.name}** — ${r.healthy ? "reachable" : "not reachable"}`, "", `${r.detail}`, "", `Previously: ${stateWords(r.before.state, r.before.ageDays)}.`].join("\n") },
        fullViewHref: "/integrations",
      },
      proof: {
        context: { status: "measured", summary: `live probe of ${r.connector.name} at ${r.checkedAt.slice(11, 16)} UTC` },
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
