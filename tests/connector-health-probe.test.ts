/**
 * Connector health probes.
 *
 * A connector stayed "verified" and reachable while every call to it failed:
 * the Figma design service was up, but the Figma sign-in its jobs need had
 * expired, and nobody knew until a run failed. A connector can now declare a
 * health check path; the platform probes it, raises a critical alert for every
 * agent that uses it when it turns unhealthy, and closes those alerts when it
 * recovers.
 */
import { describe, it, expect, vi } from "vitest";
import {
  CONNECTOR_ALERT_REMINDER_MS,
  healthCheckUrl,
  isValidHealthCheckPath,
  probeConnector,
  scanConnectorHealth,
  summarizeHealthBody,
  type HealthScanDeps,
  type OpenAlert,
  type ProbeTarget,
} from "../server/connector-health-probe";

const FIGMA_DOWN = JSON.stringify({ status: "auth_required", message: "The Figma connection needs to be re-authorized by an administrator." });

describe("health check path", () => {
  it("accepts plain absolute paths and refuses URLs, traversal and whitespace", () => {
    expect(isValidHealthCheckPath("/health/figma")).toBe(true);
    for (const bad of ["health", "//evil.example/x", "/a/../b", "https://x/y", "/a b", "/", "", null, 42]) {
      expect(isValidHealthCheckPath(bad)).toBe(false);
    }
  });

  it("joins onto the connector's own base URL", () => {
    expect(healthCheckUrl("http://20.219.5.223:8080/", "/health/figma")).toBe("http://20.219.5.223:8080/health/figma");
  });
});

describe("probeConnector", () => {
  const target: ProbeTarget = { id: "s1", name: "Figma Design Generator", url: "http://svc:8080", healthCheckPath: "/health/figma", healthStatus: "healthy" };

  it("keeps the service's own reason when it reports unhealthy", async () => {
    const fetchImpl = vi.fn(async () => new Response(FIGMA_DOWN, { status: 503 }));
    const r = await probeConnector(target, { "X-API-Key": "k" }, fetchImpl as any);
    expect(r).toEqual({ healthy: false, detail: "The Figma connection needs to be re-authorized by an administrator." });
    expect(fetchImpl).toHaveBeenCalledWith("http://svc:8080/health/figma", expect.objectContaining({ headers: { "X-API-Key": "k" } }));
  });

  it("is healthy on 2xx and unhealthy when unreachable", async () => {
    expect((await probeConnector(target, {}, (async () => new Response('{"status":"ok"}', { status: 200 })) as any)).healthy).toBe(true);
    const down = await probeConnector(target, {}, (async () => { throw new Error("ECONNREFUSED"); }) as any);
    expect(down).toMatchObject({ healthy: false });
    expect(down.detail).toContain("Unreachable");
  });

  it("summarises non-JSON bodies by status", () => {
    expect(summarizeHealthBody(502, "<html>Bad gateway</html>")).toBe("HTTP 502");
  });
});

function harness(opts: { previous: string; healthy: boolean; alerts?: OpenAlert[] }) {
  const target: ProbeTarget = { id: "s1", name: "Figma Design Generator", url: "http://svc", healthCheckPath: "/health/figma", healthStatus: opts.previous };
  const created: string[] = [];
  const acknowledged: string[] = [];
  const audits: string[] = [];
  const deps: HealthScanDeps = {
    listTargets: async () => [target],
    probe: async () => ({ healthy: opts.healthy, detail: opts.healthy ? "ok" : "The Figma connection needs to be re-authorized by an administrator." }),
    saveHealth: vi.fn(async () => {}),
    linkedAgents: async () => [
      { id: "a1", name: "Figma Board Mapping Agent", orgId: "org" },
      { id: "a2", name: "Board QA Agent", orgId: "org" },
    ],
    alertsFor: async () => opts.alerts ?? [],
    createAlert: async (agent, _t, message) => { created.push(`${agent.id}: ${message}`); },
    acknowledgeAlerts: async (ids) => { acknowledged.push(...ids); },
    audit: async (action) => { audits.push(action); },
  };
  return { deps, created, acknowledged, audits };
}

describe("scanConnectorHealth", () => {
  const NOW = new Date("2026-09-15T10:00:00Z");

  it("alerts every agent that uses a connector the moment it turns unhealthy, with the service's reason", async () => {
    const h = harness({ previous: "healthy", healthy: false });
    const result = await scanConnectorHealth(h.deps, NOW);
    expect(result).toMatchObject({ checked: 1, unhealthy: 1, alerted: 2 });
    expect(h.created).toHaveLength(2);
    expect(h.created[0]).toContain('Connector "Figma Design Generator" is failing its health check: The Figma connection needs to be re-authorized');
    expect(h.audits).toEqual(["connector.health_failed"]);
  });

  it("does not repeat the alert on every scan while it stays unhealthy", async () => {
    const open = [{ id: "al1", agentId: "a1", triggeredAt: NOW, acknowledgedAt: null }, { id: "al2", agentId: "a2", triggeredAt: NOW, acknowledgedAt: null }];
    const h = harness({ previous: "unhealthy", healthy: false, alerts: open });
    expect((await scanConnectorHealth(h.deps, NOW)).alerted).toBe(0);
    expect(h.audits).toEqual([]);
  });

  it("reminds again a day after the alerts were dismissed if it is still unhealthy", async () => {
    const old = new Date(NOW.getTime() - CONNECTOR_ALERT_REMINDER_MS - 1000);
    const dismissed = [{ id: "al1", agentId: "a1", triggeredAt: old, acknowledgedAt: old }];
    const h = harness({ previous: "unhealthy", healthy: false, alerts: dismissed });
    await scanConnectorHealth(h.deps, NOW);
    expect(h.created.map((c) => c.split(":")[0])).toEqual(["a1", "a2"]);
  });

  it("closes the open alerts and records the recovery when it is healthy again", async () => {
    const open = [{ id: "al1", agentId: "a1", triggeredAt: NOW, acknowledgedAt: null }];
    const h = harness({ previous: "unhealthy", healthy: true, alerts: open });
    const result = await scanConnectorHealth(h.deps, NOW);
    expect(result).toMatchObject({ healthy: 1, recovered: 1 });
    expect(h.acknowledged).toEqual(["al1"]);
    expect(h.audits).toEqual(["connector.health_recovered"]);
    expect(h.created).toEqual([]);
  });

  it("keeps scanning other connectors when one fails to scan", async () => {
    const h = harness({ previous: "healthy", healthy: true });
    const second: ProbeTarget = { id: "s2", name: "Other", url: "http://o", healthCheckPath: "/health", healthStatus: "healthy" };
    h.deps.listTargets = async () => [{ id: "s1", name: "Broken", url: "http://b", healthCheckPath: "/health", healthStatus: "healthy" }, second];
    let first = true;
    h.deps.probe = async () => { if (first) { first = false; throw new Error("boom"); } return { healthy: true, detail: "ok" }; };
    expect(await scanConnectorHealth(h.deps, NOW)).toMatchObject({ checked: 2, healthy: 1, errors: 1 });
  });
});
