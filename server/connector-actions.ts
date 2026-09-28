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
import { connectorHealthDeps, vendorConnectionTest } from "./connector-health-scan";
import { chooseProbe, isLoopbackMockUrl, type ProbeMethod, type ProbeTarget } from "./connector-health-probe";
import { isMcpProtocolMounted } from "./real-mcp-transport";
import { isPathHandled, pathnameOf } from "./app-mounts";

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
  /**
   * False when NO check exists for it at all, so nothing — neither the scheduled
   * scan nor a person — can establish its state. On 2026-09-27 that was 131 of 132
   * connectors, because the only check the platform had needed a bespoke
   * `healthCheckPath`. Each connector now takes the strongest check its kind
   * allows, so this is true for nearly all of them, and `checkWhy` says what is
   * missing for the rest.
   */
  canProbe: boolean;
  /** The check that would run now, and in one clause what it would do. */
  checkKind: ProbeMethod;
  checkWhy: string;
  /**
   * Which check produced the state on record. Null where a state exists but its
   * provenance doesn't — the 112 rows written in one sweep on 26 August. A
   * measurement whose method is unknown is not evidence, and says so.
   */
  measuredBy: ProbeMethod | null;
  /**
   * For an in-process enterprise connector: whether its MCP protocol endpoint is
   * mounted. False means no agent can call it over the protocol at all, however
   * green everything else looks. Null where the question doesn't apply.
   */
  protocolMounted: boolean | null;
  riskTier: string | null;
  transport: string | null;
  agentsBound: number;
}

const isMock = (url: unknown) => /localhost|127\.0\.0\.1|\/api\/mock\//.test(String(url ?? ""));

const KNOWN_KINDS: ProbeMethod[] = ["health_path", "mcp_tools_list", "vendor_connection_test", "mock_endpoint", "mount_check"];
const asKind = (v: unknown): ProbeMethod | null => (KNOWN_KINDS.includes(v as ProbeMethod) ? (v as ProbeMethod) : null);

/**
 * What a connector's row needs for `chooseProbe` to pick a check, from the point
 * of view of ONE organization: an enterprise connector is checkable by whoever
 * has connected it, and a shared catalog row is connected per tenant.
 */
function targetFor(server: any, connected: boolean, readOnlyEndpoint: string | null, inThisBuild?: boolean): ProbeTarget {
  return {
    inThisBuild,
    id: server.id,
    name: server.name,
    url: server.url ?? null,
    healthCheckPath: server.healthCheckPath ?? null,
    healthStatus: server.healthStatus ?? null,
    lastHealthCheck: server.lastHealthCheck ?? null,
    transportType: server.transportType ?? null,
    integrationId: server.integrationId ?? null,
    organizationId: server.organizationId ?? null,
    connectionId: server.connectionId ?? null,
    hasConnection: connected,
    protocolMounted: server.integrationId ? isMcpProtocolMounted(server.integrationId) : null,
    readOnlyEndpoint,
    mountedHere: isLoopbackMockUrl(server.url) ? isPathHandled(pathnameOf(server.url) ?? "") : null,
  };
}

/**
 * The newest measurement anyone holds for this connector, and what took it.
 *
 * An enterprise connector's real measurement lives on the ORGANIZATION'S
 * connection, not on the shared row: `POST /api/integrations/:id/test` has always
 * written `integration_connections.last_tested_at`, while the column the
 * connectors page reads (`mcp_servers.health_status`) had nothing writing it for
 * those connectors at all. Reading both, newest first, is what makes the two
 * surfaces agree.
 */
function measurementFor(server: any, connection: { lastTestedAt?: Date | null; lastTestResult?: string | null; lastError?: string | null } | null) {
  const candidates: Array<{ at: Date; healthy: boolean; detail: string | null; by: ProbeMethod | null }> = [];
  if (server.lastHealthCheck && String(server.healthStatus ?? "unknown") !== "unknown") {
    candidates.push({
      at: new Date(server.lastHealthCheck),
      healthy: String(server.healthStatus) === "healthy",
      detail: server.healthDetail ?? null,
      by: asKind(server.healthCheckKind),
    });
  }
  if (connection?.lastTestedAt && connection.lastTestResult) {
    candidates.push({
      at: new Date(connection.lastTestedAt),
      healthy: connection.lastTestResult === "ok",
      detail: connection.lastError ?? null,
      by: "vendor_connection_test",
    });
  }
  return candidates.sort((a, b) => b.at.getTime() - a.at.getTime())[0] ?? null;
}

function viewOf(
  server: any,
  agentsBound: number,
  opts: {
    connection?: { lastTestedAt?: Date | null; lastTestResult?: string | null; lastError?: string | null } | null;
    readOnlyEndpoint?: string | null;
    /** Whether its integration still resolves to a connector this build ships. */
    inThisBuild?: boolean;
  } = {},
): ConnectorHealthView {
  const connection = opts.connection ?? null;
  const measured = measurementFor(server, connection);
  const ageDays = measured ? Math.floor((Date.now() - measured.at.getTime()) / DAY) : null;
  const { method, why } = chooseProbe(targetFor(server, !!connection, opts.readOnlyEndpoint ?? null, opts.inThisBuild));
  return {
    id: server.id,
    name: server.name,
    state: !measured ? "never_checked" : measured.healthy ? "reachable" : "unreachable",
    checkedAt: measured ? measured.at.toISOString() : null,
    ageDays,
    stale: ageDays != null && ageDays >= 7,
    detail: measured?.detail ?? null,
    mock: isMock(server.url),
    canProbe: method !== "none",
    checkKind: method,
    checkWhy: why,
    measuredBy: measured?.by ?? null,
    // Only a connector this build ships is expected to mount one, so anything else
    // gets null rather than a gap it was never supposed to fill.
    protocolMounted: server.integrationId && opts.inThisBuild ? isMcpProtocolMounted(server.integrationId) : null,
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
  /** How many can be checked at all. The rest can never leave the state they hold. */
  canBeProbed: number;
  /** States on record whose provenance is unknown: they name no check that produced them. */
  unknownProvenance: number;
  /** Enterprise connectors with no MCP protocol endpoint mounted: unreachable to any agent over the protocol. */
  protocolMountMissing: number;
  /** How many connectors each kind of check covers. */
  byCheckKind: Record<string, number>;
}> {
  const servers = (await storage.getMcpServers(orgId)) as any[];
  const wanted = ref ? matchOne(servers, ref) : servers;

  // The org's own connections: an enterprise connector's real measurement lives
  // there, and whether it is connected is what decides if it can be checked.
  const connections = orgId ? await storage.listIntegrationConnections(orgId).catch(() => []) : [];
  const connByType = new Map<string, any>();
  for (const c of connections as any[]) {
    if (!c.credentialBlob || c.status === "disconnected") continue;
    const existing = connByType.get(c.integrationId);
    const newer = !existing || (c.lastTestedAt && (!existing.lastTestedAt || new Date(c.lastTestedAt) > new Date(existing.lastTestedAt)));
    if (!existing || c.isDefault || newer) connByType.set(c.integrationId, c);
  }

  const allTools = (await storage.getAllMcpServerTools(orgId).catch(() => [])) as any[];
  const endpointByServer = readOnlyEndpoints(allTools);
  const { getEnterpriseServerById } = await import("./integrations/register");

  const views: ConnectorHealthView[] = [];
  for (const s of wanted) {
    const linked = await connectorHealthDeps.linkedAgents(s.id).catch(() => []);
    views.push(viewOf(s, linked.length, {
      connection: s.integrationId ? connByType.get(s.integrationId) ?? null : null,
      readOnlyEndpoint: endpointByServer.get(s.id) ?? null,
      inThisBuild: s.integrationId ? !!getEnterpriseServerById(s.integrationId) : undefined,
    }));
  }
  const byCheckKind: Record<string, number> = {};
  for (const v of views) byCheckKind[v.checkKind] = (byCheckKind[v.checkKind] ?? 0) + 1;
  return {
    connectors: views,
    total: servers.length,
    neverChecked: views.filter((v) => v.state === "never_checked").length,
    staleOverAWeek: views.filter((v) => v.stale).length,
    checkedWithinAWeek: views.filter((v) => v.ageDays != null && v.ageDays < 7).length,
    unreachable: views.filter((v) => v.state === "unreachable").length,
    mock: views.filter((v) => v.mock).length,
    usedByNobody: views.filter((v) => v.agentsBound === 0).length,
    canBeProbed: views.filter((v) => v.canProbe).length,
    unknownProvenance: views.filter((v) => v.state !== "never_checked" && v.measuredBy == null).length,
    protocolMountMissing: views.filter((v) => v.protocolMounted === false).length,
    byCheckKind,
  };
}

/** The GET-with-no-arguments endpoint of each connector that has one, keyed by connector id. */
function readOnlyEndpoints(tools: any[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const t of tools) {
    if (out.has(t.serverId)) continue;
    const ann = (t.annotations ?? {}) as Record<string, unknown>;
    if (String(ann.method ?? "").toUpperCase() !== "GET" || typeof ann.endpoint !== "string") continue;
    const required = ((t.inputSchema ?? {}) as Record<string, unknown>).required;
    if (Array.isArray(required) && required.length > 0) continue;
    out.set(t.serverId, ann.endpoint);
  }
  return out;
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
 * Check one connector NOW and record the result.
 *
 * The only write here, and — depending on the connector — a real call to
 * someone's system with their credentials, which is why the tool that calls it
 * confirms first and says which check it will make. Runs the same check the
 * schedule would, through the same code, so a verification from a conversation
 * and the scheduled scan cannot disagree about what healthy means.
 *
 * An enterprise connector is verified against the CALLER'S connection, and the
 * outcome is written to that connection; the shared catalog row is left alone,
 * because one tenant's credential test is not another tenant's health.
 */
export async function verifyConnectorNow(orgId: string | undefined, ref: string, actorLabel: string): Promise<{
  connector: { id: string; name: string };
  before: ConnectorHealthView;
  healthy: boolean;
  detail: string;
  checkedAt: string;
  probeWasPossible: boolean;
  /** Which check ran, so "verified" cannot be read as more than what was done. */
  checkKind: ProbeMethod;
}> {
  const servers = (await storage.getMcpServers(orgId)) as any[];
  const matches = matchOne(servers, ref);
  if (matches.length > 1) throw new ConnectorActionError(`"${ref}" matches ${matches.length} connectors: ${matches.map((m) => m.name).join(", ")}. Name one.`);
  const server = matches[0];
  const connection = server.integrationId && orgId
    ? await storage.getIntegrationConnection(orgId, server.integrationId).catch(() => null)
    : null;
  const connected = !!connection?.credentialBlob && connection.status !== "disconnected";
  const endpoint = readOnlyEndpoints((await storage.getAllMcpServerTools(orgId).catch(() => [])) as any[]).get(server.id) ?? null;
  const { getEnterpriseServerById } = await import("./integrations/register");
  const inThisBuild = server.integrationId ? !!getEnterpriseServerById(server.integrationId) : undefined;
  const before = viewOf(server, (await connectorHealthDeps.linkedAgents(server.id).catch(() => [])).length, {
    connection: connected ? connection : null,
    readOnlyEndpoint: endpoint,
    inThisBuild,
  });

  const target = targetFor(server, connected, endpoint, inThisBuild);
  const { method } = chooseProbe(target);
  const result = method === "vendor_connection_test" && server.integrationId && orgId
    ? await vendorConnectionTest(server.integrationId, orgId, connection?.id ?? null)
    : await connectorHealthDeps.probe(target, method);
  const at = new Date();
  // Nothing was measured: recorded nowhere, rather than saved as unhealthy, which
  // would read as "the system is down" when the truth is "no check exists".
  if (result.probed) {
    // A shared catalog row carries one health column for every tenant, so a
    // per-tenant credential test stays on that tenant's connection (written by
    // vendorConnectionTest) and never on the row.
    const sharedRow = !!server.integrationId && !server.organizationId;
    if (!(sharedRow && result.method === "vendor_connection_test")) {
      await connectorHealthDeps.saveHealth(server.id, result.healthy, result.detail, at, result.method);
    }
    await connectorHealthDeps.audit("connector.health_verified", target as any, {
      detail: result.detail,
      healthy: result.healthy,
      check: result.method,
      by: actorLabel,
    });
  }
  return {
    connector: { id: server.id, name: server.name },
    before,
    healthy: result.healthy,
    detail: result.detail,
    checkedAt: at.toISOString(),
    probeWasPossible: result.probed,
    checkKind: result.method,
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
  const allTools = (await storage.getAllMcpServerTools(orgId).catch(() => [])) as any[];
  const tools = allTools.filter((t) => t.serverId === server.id);
  const connection = server.integrationId && orgId
    ? await storage.getIntegrationConnection(orgId, server.integrationId).catch(() => null)
    : null;
  return {
    connector: viewOf(server, agents.length, {
      connection: connection?.credentialBlob && connection.status !== "disconnected" ? connection : null,
      readOnlyEndpoint: readOnlyEndpoints(allTools).get(server.id) ?? null,
    }),
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
