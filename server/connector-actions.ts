/**
 * What a person can ask about a connector, and the one thing they can do to it
 * from a conversation.
 *
 * The audit behind this (2026-09-27, read off the live platform): 113 of 131
 * connectors reported "healthy" while 129 of them had not been checked for over a
 * week, and 18 had never been checked at all. A green badge for a probe from three
 * weeks ago is the platform stating as fact something it measured once and never
 * again -- so every health answer here carries the age of its measurement, and a
 * connector nothing has probed says so rather than defaulting to a colour.
 *
 * The other findings this serves: 115 of the 131 are bound by no agent (so "who
 * uses it" is the question that separates a real connector from clutter), 85 point
 * at a mock endpoint on localhost and looked identical to real ones, and 792
 * catalogued tools were searchable only by name, never by what they do.
 *
 * Credentials are deliberately absent. Connecting a platform needs a secret, a
 * conversation is stored and searchable, and so the fields are described here and
 * entered on the page. `connectionRequirements` is what makes that refusal useful
 * instead of a dead end.
 */
import { storage } from "./storage";
import { connectorHealthDeps } from "./connector-health-scan";

export class ConnectorActionError extends Error {}

const DAY = 86_400_000;

export interface ConnectorHealthView {
  id: string;
  name: string;
  /** "reachable" / "unreachable" as of `checkedAt`; "never_checked" when nothing has probed it. */
  state: "reachable" | "unreachable" | "never_checked";
  checkedAt: string | null;
  /** Whole days since the probe, so a caller can say "32 days ago" rather than a colour. */
  ageDays: number | null;
  /** True when the age is over a week: the state is history, not news. */
  stale: boolean;
  detail: string | null;
  /** A localhost or /api/mock/ endpoint: demo scaffolding, not a real system. */
  mock: boolean;
  riskTier: string | null;
  transport: string | null;
  agentsBound: number;
}

const isMock = (url: unknown) => /localhost|127\.0\.0\.1|\/api\/mock\//.test(String(url ?? ""));

function viewOf(server: any, agentsBound: number): ConnectorHealthView {
  const checked = server.lastHealthCheck ? new Date(server.lastHealthCheck) : null;
  const ageDays = checked ? Math.floor((Date.now() - checked.getTime()) / DAY) : null;
  const status = String(server.healthStatus ?? "unknown");
  return {
    id: server.id,
    name: server.name,
    state: !checked || status === "unknown" ? "never_checked" : status === "healthy" ? "reachable" : "unreachable",
    checkedAt: checked ? checked.toISOString() : null,
    ageDays,
    stale: ageDays != null && ageDays >= 7,
    detail: server.healthDetail ?? null,
    mock: isMock(server.url),
    riskTier: server.riskTier ? String(server.riskTier).toUpperCase() : null,
    transport: server.transportType ?? null,
    agentsBound,
  };
}

/** Every connector this organization has, or one by name or id. */
export async function connectorHealth(orgId: string | undefined, ref?: string): Promise<{
  connectors: ConnectorHealthView[];
  total: number;
  neverChecked: number;
  staleOverAWeek: number;
  checkedWithinAWeek: number;
  unreachable: number;
  mock: number;
  usedByNobody: number;
}> {
  const servers = (await storage.getMcpServers(orgId)) as any[];
  const wanted = ref ? matchOne(servers, ref) : servers;
  const views: ConnectorHealthView[] = [];
  for (const s of wanted) {
    const linked = await connectorHealthDeps.linkedAgents(s.id).catch(() => []);
    views.push(viewOf(s, linked.length));
  }
  return {
    connectors: views,
    total: servers.length,
    neverChecked: views.filter((v) => v.state === "never_checked").length,
    staleOverAWeek: views.filter((v) => v.stale).length,
    checkedWithinAWeek: views.filter((v) => v.ageDays != null && v.ageDays < 7).length,
    unreachable: views.filter((v) => v.state === "unreachable").length,
    mock: views.filter((v) => v.mock).length,
    usedByNobody: views.filter((v) => v.agentsBound === 0).length,
  };
}

function matchOne(servers: any[], ref: string): any[] {
  const needle = ref.trim().toLowerCase();
  const exact = servers.filter((s) => s.id === ref || String(s.name).toLowerCase() === needle);
  if (exact.length > 0) return exact;
  const partial = servers.filter((s) => String(s.name).toLowerCase().includes(needle));
  if (partial.length === 0) throw new ConnectorActionError(`No connector matching "${ref}" in this organization.`);
  return partial.slice(0, 5);
}

/**
 * Probe one connector NOW and record the result.
 *
 * The only write here, and it is a real call to someone's system with their
 * credentials, which is why the tool that calls it confirms first. Reuses the
 * scan's own probe, save and audit so a verification from a conversation and the
 * scheduled scan cannot disagree about what healthy means.
 */
export async function verifyConnectorNow(orgId: string | undefined, ref: string, actorLabel: string): Promise<{
  connector: { id: string; name: string };
  before: ConnectorHealthView;
  healthy: boolean;
  detail: string;
  checkedAt: string;
  probeWasPossible: boolean;
}> {
  const servers = (await storage.getMcpServers(orgId)) as any[];
  const matches = matchOne(servers, ref);
  if (matches.length > 1) throw new ConnectorActionError(`"${ref}" matches ${matches.length} connectors: ${matches.map((m) => m.name).join(", ")}. Name one.`);
  const server = matches[0];
  const before = viewOf(server, (await connectorHealthDeps.linkedAgents(server.id).catch(() => [])).length);

  const target = { id: server.id, name: server.name, url: server.url, healthCheckPath: server.healthCheckPath, healthStatus: server.healthStatus };
  const result = await connectorHealthDeps.probe(target as any);
  const at = new Date();
  // A connector with no health path cannot be probed at all: recorded as such
  // rather than saved as unhealthy, which would read as "the system is down".
  const probeWasPossible = !/No valid health check configured/i.test(result.detail ?? "");
  if (probeWasPossible) {
    await connectorHealthDeps.saveHealth(server.id, result.healthy, result.detail, at);
    await connectorHealthDeps.audit("connector.health_verified", target as any, { detail: result.detail, healthy: result.healthy, by: actorLabel });
  }
  return {
    connector: { id: server.id, name: server.name },
    before,
    healthy: result.healthy,
    detail: result.detail,
    checkedAt: at.toISOString(),
    probeWasPossible,
  };
}

/** Which connector offers a tool that does this, searched over what the tools DO. */
export async function findTool(orgId: string | undefined, query: string, limit = 12): Promise<{
  query: string;
  searched: number;
  matches: Array<{ tool: string; description: string | null; connector: string; connectorId: string; installed: true; health: ConnectorHealthView["state"]; checkedAgo: number | null }>;
}> {
  const needle = query.trim().toLowerCase();
  if (!needle) throw new ConnectorActionError("Say what the tool should do.");
  const tools = (await storage.getAllMcpServerTools(orgId).catch(() => [])) as any[];
  const servers = (await storage.getMcpServers(orgId)) as any[];
  const byId = new Map(servers.map((s) => [s.id, s]));
  const words = needle.split(/\s+/).filter((w) => w.length > 2);
  const scored = tools
    .map((t) => {
      const haystack = `${t.name ?? ""} ${t.description ?? ""}`.toLowerCase();
      const hits = words.filter((w) => haystack.includes(w)).length;
      return { t, hits };
    })
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, limit);

  return {
    query,
    searched: tools.length,
    matches: scored.map(({ t }) => {
      const server = byId.get(t.serverId);
      const view = server ? viewOf(server, 0) : null;
      return {
        tool: t.name,
        description: t.description ?? null,
        connector: server?.name ?? "a connector that is no longer installed",
        connectorId: t.serverId,
        installed: true as const,
        health: view?.state ?? "never_checked",
        checkedAgo: view?.ageDays ?? null,
      };
    }),
  };
}

/** Who actually uses this connector, which is what separates one that matters from clutter. */
export async function connectorUsage(orgId: string | undefined, ref: string): Promise<{
  connector: ConnectorHealthView;
  agents: Array<{ id: string; name: string }>;
  tools: string[];
  note?: string;
}> {
  const servers = (await storage.getMcpServers(orgId)) as any[];
  const matches = matchOne(servers, ref);
  if (matches.length > 1) throw new ConnectorActionError(`"${ref}" matches ${matches.length} connectors: ${matches.map((m) => m.name).join(", ")}. Name one.`);
  const server = matches[0];
  const agents = (await connectorHealthDeps.linkedAgents(server.id).catch(() => [])) as any[];
  const tools = ((await storage.getAllMcpServerTools(orgId).catch(() => [])) as any[]).filter((t) => t.serverId === server.id);
  return {
    connector: viewOf(server, agents.length),
    agents: agents.map((a) => ({ id: a.id, name: a.name })),
    tools: tools.map((t) => String(t.name)),
    ...(agents.length === 0 ? { note: "No agent is bound to this connector, so nothing in the platform calls it." } : {}),
  };
}

/**
 * What connecting a platform needs -- the field names, never their values.
 *
 * This exists so refusing a credential in a conversation ends somewhere useful:
 * the person learns exactly what to have ready and where it goes.
 */
export async function connectionRequirements(orgId: string | undefined, platform: string): Promise<{
  platform: { id: string; name: string; authMethod: string | null };
  connected: boolean;
  fields: Array<{ key: string; label: string; required: boolean; secret: boolean }>;
  where: string;
  docsUrl: string | null;
}> {
  const { INTEGRATION_REGISTRY } = await import("./integrations/registry");
  const catalog = (INTEGRATION_REGISTRY ?? []) as any[];
  const needle = platform.trim().toLowerCase();
  const entry = catalog.find((i) => String(i.id).toLowerCase() === needle || String(i.name).toLowerCase() === needle)
    ?? catalog.find((i) => String(i.name).toLowerCase().includes(needle));
  if (!entry) throw new ConnectorActionError(`No platform called "${platform}" in the catalogue.`);
  const connections = orgId ? await storage.listIntegrationConnectionsByType(orgId, entry.id).catch(() => []) : [];
  return {
    platform: { id: entry.id, name: entry.name, authMethod: entry.authMethod ?? null },
    connected: connections.length > 0,
    fields: (entry.credentialFields ?? []).map((f: any) => ({
      key: String(f.key),
      label: String(f.label ?? f.key),
      required: f.required !== false,
      secret: String(f.type) === "password" || /secret|token|key/i.test(String(f.key)),
    })),
    where: `/integrations — the platform's Connect form writes them straight to the vault`,
    docsUrl: entry.docsUrl ?? null,
  };
}
