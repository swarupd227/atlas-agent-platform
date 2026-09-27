/**
 * Making an automation run when something changes in a connected system.
 *
 * The mechanism is an `mcp_resource_change` trigger, polled by
 * server/connector-poller.ts on the worker's minute scan. Four facts about it
 * decide whether anything built on top is honest, because each one is something
 * a person would otherwise assume wrongly:
 *
 * - It POLLS. Jira and Salesforce push nothing, so the poller re-runs a query
 *   with a "changed since last poll" bound. The floor is a minute and the
 *   default is five, so "when a submission lands" means "within the poll
 *   interval of it landing".
 * - Only Jira and Salesforce are pollable (connector-poll-query.ts's
 *   SUPPORTED_INTEGRATIONS). Anything else is refused rather than accepted and
 *   left silently dead.
 * - The FIRST poll never fires. It establishes the cursor, so the records that
 *   already exist are not mistaken for changes. A watch therefore reacts to what
 *   changes from now on, never to the backlog.
 * - The run is told THAT something changed, not WHAT. The job payload carries
 *   the record count and the trigger id and no input, so the agent runs its
 *   usual task instructions and has to query the system itself to find the new
 *   records. An automation whose instructions don't say to go and look will fire
 *   and do nothing useful.
 */
import { storage } from "./storage";
import { DEFAULT_POLL_INTERVAL_MS, MIN_POLL_INTERVAL_MS, isPollableIntegration, resolveIntegrationIdForMcpServer } from "./connector-poller";
import type { AgentTrigger } from "@shared/schema";

export class WatchError extends Error {}

export const WATCH_TRIGGER_TYPE = "mcp_resource_change";
export const MIN_POLL_MINUTES = MIN_POLL_INTERVAL_MS / 60_000;
export const DEFAULT_POLL_MINUTES = DEFAULT_POLL_INTERVAL_MS / 60_000;
/** What each connector's query language is, for the card and the refusals. */
export const QUERY_LANGUAGE: Record<string, string> = { jira: "JQL", salesforce: "SOQL" };

const FINISHED_DEPLOYMENT = new Set(["rolled_back", "promoted", "superseded", "retired", "failed"]);

export interface WatchPlan {
  agent: { id: string; name: string; agentType: string | null };
  connector: { id: string; name: string; integrationId: string | null; connected: boolean | null };
  pollable: boolean;
  queryLanguage: string | null;
  /** The watch already on this agent for this connector, if any. */
  existing: { id: string; query: string; everyMinutes: number; enabled: boolean; lastFiredAt: string | null; fireCount: number; hasCursor: boolean } | null;
  deployments: Array<{ id: string; environment: string; status: string }>;
  blockers: string[];
  /** Whether its task instructions mention looking the records up, since the fire won't hand them over. */
  taskMentionsLookup: boolean;
  taskInstructions: string;
}

const configOf = (t: AgentTrigger) => (t.config || {}) as Record<string, any>;
const minutesOf = (t: AgentTrigger) => Math.max(Math.round((Number(configOf(t).pollIntervalMs) || DEFAULT_POLL_INTERVAL_MS) / 60_000), MIN_POLL_MINUTES);

/** One of the organization's connectors, by id or name. */
export async function resolveConnector(orgId: string | undefined, ref: string) {
  const servers = await storage.getMcpServers(orgId);
  const byId = servers.find((s) => s.id === ref);
  const needle = ref.trim().toLowerCase();
  const exact = servers.filter((s) => s.name.toLowerCase() === needle);
  const partial = exact.length ? exact : servers.filter((s) => s.name.toLowerCase().includes(needle));
  const found = byId ?? (partial.length === 1 ? partial[0] : undefined);
  if (!found) {
    if (partial.length > 1) throw new WatchError(`Several connectors match "${ref}": ${partial.slice(0, 6).map((s) => s.name).join("; ")}. Say which one.`);
    throw new WatchError(`No connector named "${ref}" in this organization.`);
  }
  return found;
}

export async function planWatch(orgId: string | undefined, agentId: string, connectorRef: string): Promise<WatchPlan> {
  const agent = await storage.getAgent(agentId, orgId);
  if (!agent) throw new WatchError("No agent with that id in this organization.");
  const connector = await resolveConnector(orgId, connectorRef);
  const integrationId = await resolveIntegrationIdForMcpServer(connector.id).catch(() => null);
  const pollable = isPollableIntegration(integrationId);

  // Whether the connector is actually connected is not a column on the server
  // row: it is the status of the org's integration connection, resolved the way
  // Astra's own connector list resolves it (pinned connectionId first, else any
  // connected connection for that integration).
  // listIntegrationConnections is org-scoped and requires one; an agent was
  // already resolved against orgId above, so by here it is known.
  const connections = await storage.listIntegrationConnections(orgId ?? (agent.organizationId as string)).catch(() => []);
  const connection = (connector as any).connectionId
    ? (connections as any[]).find((c) => c.id === (connector as any).connectionId)
    : (connections as any[]).find((c) => c.integrationId === (connector as any).integrationId && c.status === "connected");
  const connected = (connector as any).integrationId ? connection?.status === "connected" : null;

  const triggers = (await storage.getAgentTriggers(agentId).catch(() => [])) as AgentTrigger[];
  const existingTrigger = triggers.find((t) => t.triggerType === WATCH_TRIGGER_TYPE && configOf(t).mcpServerId === connector.id);

  const all = await storage.getDeployments(orgId).catch(() => []);
  const deployments = (all as any[])
    .filter((d) => d.agentId === agentId && !FINISHED_DEPLOYMENT.has(String(d.status)))
    .map((d) => ({ id: d.id, environment: String(d.environment), status: String(d.status) }));

  const rt = (agent.runtimeConfig as Record<string, any>) || {};
  const task = typeof rt.prompt === "string" ? rt.prompt : agent.description ?? "";

  const blockers: string[] = [];
  if (!pollable) {
    blockers.push(`Polling isn't supported for ${integrationId ? `'${integrationId}'` : "this connector"} yet — only Jira and Salesforce are. A watch on it would never fire.`);
  }
  if (connected === false) {
    blockers.push(`"${connector.name}" isn't connected for this organization, so every poll would fail until it is.`);
  }
  if (deployments.length === 0) {
    blockers.push("It has no active deployment, so a fire would fail with \"Agent has no active deployment\". Deploy it first.");
  }

  return {
    agent: { id: agent.id, name: agent.name, agentType: agent.agentType ?? null },
    connector: { id: connector.id, name: connector.name, integrationId, connected },
    pollable,
    queryLanguage: integrationId ? QUERY_LANGUAGE[integrationId] ?? null : null,
    existing: existingTrigger
      ? {
          id: existingTrigger.id,
          query: String(configOf(existingTrigger).query ?? ""),
          everyMinutes: minutesOf(existingTrigger),
          enabled: existingTrigger.enabled !== false,
          lastFiredAt: existingTrigger.lastFiredAt ? new Date(existingTrigger.lastFiredAt).toISOString() : null,
          fireCount: existingTrigger.fireCount ?? 0,
          hasCursor: !!configOf(existingTrigger).lastPolledAt,
        }
      : null,
    deployments,
    blockers,
    // The fire hands over no records, so an automation that never looks them up
    // will run and find nothing. Checked as a hint, not a rule.
    taskMentionsLookup: /\b(query|search|fetch|retrieve|look ?up|read|list|pull)\b/i.test(task),
    taskInstructions: task,
  };
}

/** Every connector watch in the organization, with the agent it fires. */
export async function watches(orgId: string | undefined) {
  const [agents, triggers] = await Promise.all([
    storage.getAgents(orgId),
    storage.getAgentTriggersByType(WATCH_TRIGGER_TYPE).catch(() => []),
  ]);
  const byId = new Map(agents.map((a) => [a.id, a]));
  const rows = [];
  for (const t of triggers as AgentTrigger[]) {
    const agent = byId.get(t.agentId);
    if (!agent) continue;
    const config = configOf(t);
    const connector = config.mcpServerId ? await storage.getMcpServer(config.mcpServerId).catch(() => undefined) : undefined;
    rows.push({
      agentId: agent.id,
      agent: agent.name,
      connector: connector?.name ?? config.mcpServerId ?? "unknown",
      query: String(config.query ?? ""),
      everyMinutes: minutesOf(t),
      enabled: t.enabled !== false,
      // Until the first poll sets a cursor, nothing can fire.
      watching: !!config.lastPolledAt,
      firedTimes: t.fireCount ?? 0,
      lastFiredAt: t.lastFiredAt ? new Date(t.lastFiredAt).toISOString() : null,
    });
  }
  return rows;
}

async function record(orgId: string | undefined, agent: { id: string; name: string }, actor: { actorLabel: string; actorId?: string | null }, action: string, summary: string, details: Record<string, unknown>) {
  await storage.createAuditEvent({
    actorType: "user",
    actorId: actor.actorId ?? actor.actorLabel,
    action,
    objectType: "agent_trigger",
    objectId: agent.id,
    organizationId: orgId,
    details: JSON.stringify({ summary, agentName: agent.name, ...details, via: "Astra Cowork" }),
  }).catch(() => {});
}

/**
 * Watch a connector for changes. The same validation the trigger route applies
 * is applied here -- a Salesforce query has to be a real SOQL SELECT, and the
 * poll interval has a floor -- so a watch that could never work is refused
 * rather than stored.
 */
export async function setWatchAs(
  orgId: string | undefined,
  agentId: string,
  connectorRef: string,
  query: string,
  everyMinutes: number | undefined,
  actor: { actorLabel: string; actorId?: string | null },
) {
  const plan = await planWatch(orgId, agentId, connectorRef);
  if (!plan.pollable) throw new WatchError(plan.blockers[0]);
  const text = query.trim();
  if (!text) throw new WatchError(`Say what to watch for, as ${plan.queryLanguage ?? "a query"}.`);
  if (plan.connector.integrationId === "salesforce" && !/\bFROM\b/i.test(text)) {
    throw new WatchError("A Salesforce watch needs a full SOQL SELECT with a FROM clause, for example \"SELECT Id, Name FROM Opportunity WHERE StageName = 'Proposal'\".");
  }
  const minutes = Math.max(everyMinutes ?? DEFAULT_POLL_MINUTES, MIN_POLL_MINUTES);
  const config = { mcpServerId: plan.connector.id, query: text, pollIntervalMs: minutes * 60_000 };

  const trigger = plan.existing
    ? await storage.updateAgentTrigger(plan.existing.id, { config: { ...config, lastPolledAt: undefined }, enabled: true } as any)
    : await storage.createAgentTrigger({ agentId, triggerType: WATCH_TRIGGER_TYPE, config, enabled: true } as any);
  if (!trigger) throw new WatchError("That watch could not be saved.");

  await record(orgId, plan.agent, actor, "trigger_created", `${actor.actorLabel} set "${plan.agent.name}" to run when ${plan.connector.name} changes`, {
    connector: plan.connector.name,
    integrationId: plan.connector.integrationId,
    query: text,
    everyMinutes: minutes,
    replaced: !!plan.existing,
    triggerId: trigger.id,
  });
  return { agent: plan.agent, connector: plan.connector, query: text, everyMinutes: minutes, replaced: !!plan.existing, blockers: plan.blockers, queryLanguage: plan.queryLanguage };
}

/** Stop watching. */
export async function clearWatchAs(orgId: string | undefined, agentId: string, connectorRef: string, actor: { actorLabel: string; actorId?: string | null }) {
  const plan = await planWatch(orgId, agentId, connectorRef);
  if (!plan.existing) throw new WatchError(`"${plan.agent.name}" isn't watching "${plan.connector.name}".`);
  const deleted = await storage.deleteAgentTrigger(plan.existing.id);
  if (!deleted) throw new WatchError("That watch could not be removed.");
  await record(orgId, plan.agent, actor, "trigger_deleted", `${actor.actorLabel} stopped "${plan.agent.name}" watching ${plan.connector.name}`, {
    connector: plan.connector.name,
    wasQuery: plan.existing.query,
    firedTimes: plan.existing.fireCount,
    triggerId: plan.existing.id,
  });
  return { agent: plan.agent, connector: plan.connector, wasQuery: plan.existing.query, firedTimes: plan.existing.fireCount };
}
