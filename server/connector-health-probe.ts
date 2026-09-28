/**
 * Health probes for connectors whose service can say whether it is really working.
 *
 * A connector can be registered, verified and reachable while every call to it
 * fails for a reason only the service knows. Live: the Figma design service on
 * a VM stayed up, but the Figma sign-in its jobs depend on had expired, and
 * every board job failed. Nobody knew until a run failed.
 *
 * Any connector can carry a `healthCheckPath` (e.g. "/health/figma"). A worker
 * job probes it every few minutes with the connector's own credentials. A 2xx
 * response means healthy; anything else is unhealthy, and the service's own
 * message is kept. When a connector turns unhealthy, every active agent that
 * uses it gets a critical alert, which surfaces in My Actions. When it recovers,
 * those alerts are closed. Both transitions are audited.
 *
 * That was the whole mechanism, and the audit of 2026-09-27 showed what it came
 * to: 131 of 132 connectors had no `healthCheckPath`, so the scan probed exactly
 * one of them, and 112 displayed a state written in a single ten-minute sweep on
 * 26 August that nothing could refresh. A health column nothing writes is worse
 * than an empty one.
 *
 * The cause was one check for a fleet that is three different things, so there
 * is now one check per kind, chosen by `chooseProbe` below and named in every
 * answer:
 *   - a service with its own health endpoint  -> ask it (unchanged)
 *   - a real MCP server                      -> a protocol handshake and tools/list
 *   - an in-process enterprise connector      -> the vendor test its Connect form runs
 *   - a mock served by this process           -> one of its own read-only endpoints
 * and where none of those is possible, `none` carries the reason, so "nothing
 * checked this" can never be mistaken for "this is fine". Which check ran is
 * part of the result: a tools/list handshake and a credential test prove
 * different things, and a reader has to be able to tell them apart.
 */

export const CONNECTOR_HEALTH_SCAN_INTERVAL_MS = 5 * 60 * 1000;
export const CONNECTOR_HEALTH_TIMEOUT_MS = 15 * 1000;
/** An unhealthy connector whose alerts were all dismissed is raised again after this long. */
export const CONNECTOR_ALERT_REMINDER_MS = 24 * 60 * 60 * 1000;
export const CONNECTOR_ALERT_TYPE = "connector_unhealthy";

/** What kind of check can be made against a connector, and therefore what a green answer means. */
export type ProbeMethod =
  /** The service's own health endpoint (`healthCheckPath`) answered. */
  | "health_path"
  /** A real MCP handshake and `tools/list` against a remote server: the whole call path. */
  | "mcp_tools_list"
  /** The vendor call the Connect form makes, with the customer's stored credentials. */
  | "vendor_connection_test"
  /** A read-only endpoint of a mock this process serves itself. */
  | "mock_endpoint"
  /** Nothing can be checked. `why` says what is missing; no state is written. */
  | "none";

export interface ProbeTarget {
  id: string;
  name: string;
  url: string | null;
  healthCheckPath: string | null;
  healthStatus: string | null;
  lastHealthCheck?: Date | string | null;
  transportType?: string | null;
  integrationId?: string | null;
  /** Owning tenant. Null means a shared platform catalog row (see listProbeTargets). */
  organizationId?: string | null;
  /** The specific connection this row was written for, when it was written by a Connect. */
  connectionId?: string | null;
  /** True when `integrationId` still resolves to a connector this build ships. */
  inThisBuild?: boolean;
  /** True when credentials are on file for it (any organization, for the scan; the caller's, for a read). */
  hasConnection?: boolean;
  /** Whether its MCP protocol endpoint is mounted. Null where the question doesn't apply. */
  protocolMounted?: boolean | null;
  /** A GET endpoint of a mock that takes no required arguments, if it has one. */
  readOnlyEndpoint?: string | null;
}

export interface ProbeResult {
  healthy: boolean;
  detail: string;
  /** Which check produced this. */
  method: ProbeMethod;
  /**
   * False when nothing ran. Callers must not record a state for an unprobed
   * connector: writing "unhealthy" because no check exists is how a
   * configuration gap comes to read as an outage.
   */
  probed: boolean;
}

const LOOPBACK_HOST = /^(localhost|127\.0\.0\.1|\[::1\]|::1)$/i;

function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/** A mock backend this process serves itself, callable only over the loopback interface. */
export function isLoopbackMockUrl(url: string | null | undefined): boolean {
  const host = hostOf(url);
  return !!host && LOOPBACK_HOST.test(host) && /\/api\/mock\//.test(String(url));
}

/** A connector that really is somewhere else and really speaks MCP over HTTP. */
export function isRemoteMcpUrl(url: string | null | undefined, transportType: string | null | undefined): boolean {
  const host = hostOf(url);
  if (!host || LOOPBACK_HOST.test(host)) return false;
  if (!/^https?:$/i.test(new URL(String(url)).protocol)) return false;
  return transportType === "streamable-http" || transportType === "sse";
}

/**
 * The strongest check available for one connector, and — when there is none —
 * what is missing. Pure: every fact it needs is on the target, so the choice
 * can be tested without a database, a network or a clock.
 */
export function chooseProbe(target: ProbeTarget): { method: ProbeMethod; why: string } {
  if (target.url && isValidHealthCheckPath(target.healthCheckPath)) {
    return { method: "health_path", why: "the service publishes a health endpoint of its own" };
  }
  if (target.integrationId) {
    if (target.inThisBuild === false) {
      return { method: "none", why: `its integration "${target.integrationId}" is not part of this build, so there is nothing left to call` };
    }
    if (!target.hasConnection) {
      return { method: "none", why: "nothing is connected to it yet, so there are no credentials to test with" };
    }
    return { method: "vendor_connection_test", why: "it can make a real call to the system it connects to" };
  }
  if (isRemoteMcpUrl(target.url, target.transportType)) {
    return { method: "mcp_tools_list", why: "it speaks MCP, so a handshake and tools/list exercise the whole call path" };
  }
  if (isLoopbackMockUrl(target.url)) {
    return target.readOnlyEndpoint
      ? { method: "mock_endpoint", why: "it is a mock this process serves, with a read-only endpoint that can be called safely" }
      : { method: "none", why: "it is a mock this process serves, and none of its endpoints is a read-only one, so nothing can be called without changing something" };
  }
  if (!target.url) return { method: "none", why: "no endpoint is recorded for it" };
  return { method: "none", why: `nothing here can call a ${target.transportType ?? "connector with no transport"} at that address` };
}

/**
 * How often each check may run on the schedule.
 *
 * Not one interval, because the checks cost different things: asking a service's
 * own health endpoint is free, while a vendor connection test spends the
 * customer's API quota. A person asking for a connector to be verified now is
 * never metered by this.
 */
export const PROBE_CADENCE_MS: Record<ProbeMethod, number> = {
  health_path: 5 * 60 * 1000,
  mcp_tools_list: 15 * 60 * 1000,
  vendor_connection_test: 60 * 60 * 1000,
  mock_endpoint: 60 * 60 * 1000,
  none: Number.POSITIVE_INFINITY,
};

export function isDueForProbe(method: ProbeMethod, lastHealthCheck: Date | string | null | undefined, now: Date = new Date()): boolean {
  const cadence = PROBE_CADENCE_MS[method];
  if (!Number.isFinite(cadence)) return false;
  if (!lastHealthCheck) return true;
  const last = new Date(lastHealthCheck).getTime();
  if (!Number.isFinite(last)) return true;
  return now.getTime() - last >= cadence;
}

/** A health path is a plain absolute path on the connector's own host: never a URL, never a traversal. */
export function isValidHealthCheckPath(path: unknown): path is string {
  return (
    typeof path === "string" &&
    path.length > 1 &&
    path.length <= 200 &&
    path.startsWith("/") &&
    !path.startsWith("//") &&
    !/\s|\\|\.\.|:\/\//.test(path)
  );
}

export function healthCheckUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${path}`;
}

/** The service's own words, kept short: a JSON `message`/`detail`/`error`, else the HTTP status. */
export function summarizeHealthBody(status: number, body: string): string {
  let text = "";
  try {
    const json = JSON.parse(body);
    const candidate = json?.message ?? json?.detail ?? json?.error ?? json?.status;
    if (typeof candidate === "string") text = candidate;
  } catch {
    // not JSON
  }
  const base = text || `HTTP ${status}`;
  return base.replace(/\s+/g, " ").trim().slice(0, 300);
}

export async function probeConnector(
  target: ProbeTarget,
  headers: Record<string, string>,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = CONNECTOR_HEALTH_TIMEOUT_MS,
): Promise<ProbeResult> {
  if (!target.url || !isValidHealthCheckPath(target.healthCheckPath)) {
    return { healthy: false, detail: "No valid health check configured", method: "health_path", probed: false };
  }
  try {
    const res = await fetchImpl(healthCheckUrl(target.url, target.healthCheckPath), {
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = await res.text().catch(() => "");
    return {
      healthy: res.ok,
      detail: res.ok ? summarizeHealthBody(res.status, body) || "OK" : summarizeHealthBody(res.status, body),
      method: "health_path",
      probed: true,
    };
  } catch (err: any) {
    return { healthy: false, detail: `Unreachable: ${String(err?.message ?? err).slice(0, 200)}`, method: "health_path", probed: true };
  }
}

/**
 * Call one read-only endpoint of a mock this process serves.
 *
 * The failure this catches is a real one: a mock's row outlives the code that
 * served it, so the connector is listed, bound to agents, and 404s on every
 * call. A 404 is therefore the interesting answer, not an error to swallow. Any
 * other answer — including a 400 for an empty request — means the route is
 * mounted and its handler ran, which is all this check claims.
 */
export async function probeMockEndpoint(
  target: ProbeTarget,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = CONNECTOR_HEALTH_TIMEOUT_MS,
): Promise<ProbeResult> {
  if (!target.url || !target.readOnlyEndpoint) {
    return { healthy: false, detail: "No read-only endpoint to call", method: "mock_endpoint", probed: false };
  }
  const url = `${target.url.replace(/\/+$/, "")}${target.readOnlyEndpoint.startsWith("/") ? "" : "/"}${target.readOnlyEndpoint}`;
  try {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (res.status === 404) {
      return {
        healthy: false,
        detail: `Nothing is mounted at ${target.readOnlyEndpoint} any more: this connector is listed but no longer served`,
        method: "mock_endpoint",
        probed: true,
      };
    }
    if (res.status >= 500) {
      const body = await res.text().catch(() => "");
      return { healthy: false, detail: summarizeHealthBody(res.status, body), method: "mock_endpoint", probed: true };
    }
    return {
      healthy: true,
      detail: `Its ${target.readOnlyEndpoint} endpoint answered (HTTP ${res.status}), so the mock is mounted and serving`,
      method: "mock_endpoint",
      probed: true,
    };
  } catch (err: any) {
    return { healthy: false, detail: `Unreachable: ${String(err?.message ?? err).slice(0, 200)}`, method: "mock_endpoint", probed: true };
  }
}

/**
 * What a completed `tools/list` handshake means, including the drift it exposes.
 *
 * The tool count is worth comparing with what the platform catalogued at install
 * time: an agent picks its tools from the catalogue, so a server that has since
 * dropped or renamed one will fail at call time with nothing anywhere saying why.
 */
export function toolsListResult(toolCount: number, catalogued: number | null): ProbeResult {
  const drift =
    catalogued != null && catalogued !== toolCount
      ? `; it offers ${toolCount} ${toolCount === 1 ? "tool" : "tools"} but ${catalogued} ${catalogued === 1 ? "is" : "are"} catalogued here, so the two disagree`
      : "";
  return {
    healthy: true,
    detail: `Answered a tools/list handshake with ${toolCount} ${toolCount === 1 ? "tool" : "tools"}${drift}`,
    method: "mcp_tools_list",
    probed: true,
  };
}

export function toolsListFailure(err: unknown): ProbeResult {
  return {
    healthy: false,
    detail: `tools/list failed: ${String((err as any)?.message ?? err).slice(0, 200)}`,
    method: "mcp_tools_list",
    probed: true,
  };
}

/**
 * Read a vendor connection test as a health answer.
 *
 * `not_verifiable` is the case that matters: the test ran, found no way to check
 * this integration's credentials without calling a tool that changes something,
 * and said `ok: true` so the Connect form would still save. Taken as health that
 * would be a green badge for a check that never happened, so it comes back
 * unprobed instead.
 */
export function connectionTestResult(result: { ok: boolean; status?: string; error?: string; friendlyError?: string; latencyMs?: number }): ProbeResult {
  if (result.status === "not_verifiable") {
    return {
      healthy: false,
      detail: result.error
        ? `Cannot be verified: ${result.error}`
        : "Cannot be verified: this integration has no credential test that doesn't change something",
      method: "vendor_connection_test",
      probed: false,
    };
  }
  const latency = typeof result.latencyMs === "number" ? ` in ${result.latencyMs}ms` : "";
  return {
    healthy: result.ok,
    detail: result.ok
      ? `Its own system answered a credential test${latency}`
      : `Credential test failed: ${(result.friendlyError ?? result.error ?? "no reason given").slice(0, 200)}`,
    method: "vendor_connection_test",
    probed: true,
  };
}

export function nothingToProbe(why: string): ProbeResult {
  return { healthy: false, detail: why, method: "none", probed: false };
}

export interface LinkedAgent {
  id: string;
  name: string;
  orgId: string | null;
}

export interface OpenAlert {
  id: string;
  agentId: string;
  triggeredAt: Date | null;
  acknowledgedAt: Date | null;
}

export interface HealthScanDeps {
  listTargets(): Promise<ProbeTarget[]>;
  probe(target: ProbeTarget, method: ProbeMethod): Promise<ProbeResult>;
  saveHealth(targetId: string, healthy: boolean, detail: string, at: Date, method: ProbeMethod): Promise<void>;
  linkedAgents(targetId: string): Promise<LinkedAgent[]>;
  /** This connector's connector_unhealthy alerts for these agents, newest first (acknowledged ones included). */
  alertsFor(target: ProbeTarget, agentIds: string[]): Promise<OpenAlert[]>;
  createAlert(agent: LinkedAgent, target: ProbeTarget, message: string): Promise<void>;
  acknowledgeAlerts(alertIds: string[], at: Date): Promise<void>;
  audit(action: string, target: ProbeTarget, details: Record<string, unknown>): Promise<void>;
}

export function unhealthyAlertMessage(target: Pick<ProbeTarget, "name">, detail: string): string {
  return `Connector "${target.name}" is failing its health check: ${detail}`;
}

export async function scanConnectorHealth(deps: HealthScanDeps, now: Date = new Date()) {
  const targets = await deps.listTargets();
  let healthy = 0, unhealthy = 0, alerted = 0, recovered = 0, errors = 0;
  /** Checked recently enough by this method's own cadence. */
  let skipped = 0;
  /** No check exists for it. Counted, never written: an unmeasured connector keeps no state. */
  let notCheckable = 0;
  const byMethod: Record<string, number> = {};

  for (const target of targets) {
    try {
      const { method } = chooseProbe(target);
      if (method === "none") {
        notCheckable++;
        byMethod.none = (byMethod.none ?? 0) + 1;
        continue;
      }
      if (!isDueForProbe(method, target.lastHealthCheck, now)) {
        skipped++;
        continue;
      }
      const result = await deps.probe(target, method);
      byMethod[result.method] = (byMethod[result.method] ?? 0) + 1;
      // Nothing ran, so nothing is recorded: writing "unhealthy" here is how a
      // gap in what can be checked comes to read as an outage, and writing
      // "healthy" is worse.
      if (!result.probed) {
        notCheckable++;
        continue;
      }
      await deps.saveHealth(target.id, result.healthy, result.detail, now, result.method);
      const wasUnhealthy = target.healthStatus === "unhealthy";
      const agents = await deps.linkedAgents(target.id);
      const alerts = agents.length > 0 ? await deps.alertsFor(target, agents.map((a) => a.id)) : [];

      if (result.healthy) {
        healthy++;
        const open = alerts.filter((a) => !a.acknowledgedAt).map((a) => a.id);
        if (open.length > 0) await deps.acknowledgeAlerts(open, now);
        if (wasUnhealthy) {
          recovered++;
          await deps.audit("connector.health_recovered", target, { detail: result.detail, closedAlerts: open.length });
        }
        continue;
      }

      unhealthy++;
      if (!wasUnhealthy) {
        await deps.audit("connector.health_failed", target, { detail: result.detail, affectedAgents: agents.length });
      }
      const message = unhealthyAlertMessage(target, result.detail);
      for (const agent of agents) {
        const mine = alerts.filter((a) => a.agentId === agent.id);
        const open = mine.some((a) => !a.acknowledgedAt);
        const newest = mine[0]?.triggeredAt ? new Date(mine[0].triggeredAt).getTime() : 0;
        const remind = !open && now.getTime() - newest >= CONNECTOR_ALERT_REMINDER_MS;
        if ((!wasUnhealthy && !open) || remind) {
          await deps.createAlert(agent, target, message);
          alerted++;
        }
      }
    } catch (err: any) {
      errors++;
      console.error(`[connector-health] ${target.name}: scan failed:`, err?.message);
    }
  }
  return {
    /** Connectors looked at, which is not the same as connectors measured. */
    seen: targets.length,
    checked: healthy + unhealthy,
    healthy,
    unhealthy,
    alerted,
    recovered,
    errors,
    skipped,
    notCheckable,
    byMethod,
  };
}
