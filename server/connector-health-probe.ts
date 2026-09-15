/**
 * Health probes for connectors whose service can say whether it is really working.
 *
 * A connector can be registered, verified and reachable while every call to it
 * fails for a reason only the service knows. Live: the Figma design service on
 * a VM stayed up, but the Figma sign-in its jobs depend on had expired, and
 * every board job failed. Nobody knew until a run failed.
 *
 * Any connector can now carry a `healthCheckPath` (e.g. "/health/figma"). A
 * worker job probes it every few minutes with the connector's own credentials.
 * A 2xx response means healthy; anything else is unhealthy, and the service's
 * own message is kept. When a connector turns unhealthy, every active agent that
 * uses it gets a critical alert, which surfaces in My Actions. When it recovers,
 * those alerts are closed. Both transitions are audited.
 */

export const CONNECTOR_HEALTH_SCAN_INTERVAL_MS = 5 * 60 * 1000;
export const CONNECTOR_HEALTH_TIMEOUT_MS = 15 * 1000;
/** An unhealthy connector whose alerts were all dismissed is raised again after this long. */
export const CONNECTOR_ALERT_REMINDER_MS = 24 * 60 * 60 * 1000;
export const CONNECTOR_ALERT_TYPE = "connector_unhealthy";

export interface ProbeTarget {
  id: string;
  name: string;
  url: string | null;
  healthCheckPath: string | null;
  healthStatus: string | null;
}

export interface ProbeResult {
  healthy: boolean;
  detail: string;
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
    return { healthy: false, detail: "No valid health check configured" };
  }
  try {
    const res = await fetchImpl(healthCheckUrl(target.url, target.healthCheckPath), {
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = await res.text().catch(() => "");
    return { healthy: res.ok, detail: res.ok ? summarizeHealthBody(res.status, body) || "OK" : summarizeHealthBody(res.status, body) };
  } catch (err: any) {
    return { healthy: false, detail: `Unreachable: ${String(err?.message ?? err).slice(0, 200)}` };
  }
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
  probe(target: ProbeTarget): Promise<ProbeResult>;
  saveHealth(targetId: string, healthy: boolean, detail: string, at: Date): Promise<void>;
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

  for (const target of targets) {
    try {
      const result = await deps.probe(target);
      await deps.saveHealth(target.id, result.healthy, result.detail, now);
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
  return { checked: targets.length, healthy, unhealthy, alerted, recovered, errors };
}
