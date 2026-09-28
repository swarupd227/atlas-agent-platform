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
  PROBE_CADENCE_MS,
  chooseProbe,
  connectionTestResult,
  healthCheckUrl,
  isDueForProbe,
  isValidHealthCheckPath,
  probeConnector,
  probeMockEndpoint,
  scanConnectorHealth,
  summarizeHealthBody,
  toolsListResult,
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
    expect(r).toEqual({ healthy: false, detail: "The Figma connection needs to be re-authorized by an administrator.", method: "health_path", probed: true });
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
    probe: async () => ({ healthy: opts.healthy, detail: opts.healthy ? "ok" : "The Figma connection needs to be re-authorized by an administrator.", method: "health_path" as const, probed: true }),
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
    h.deps.probe = async () => { if (first) { first = false; throw new Error("boom"); } return { healthy: true, detail: "ok", method: "health_path", probed: true }; };
    expect(await scanConnectorHealth(h.deps, NOW)).toMatchObject({ seen: 2, checked: 1, healthy: 1, errors: 1 });
  });

  it("records nothing for a connector nothing can check, and does not call it a failure", async () => {
    const h = harness({ previous: "healthy", healthy: true });
    // A connector with no health path, no integration and no MCP transport: the
    // shape 97 of the live fleet had. The old scan never saw it at all.
    h.deps.listTargets = async () => [{ id: "s9", name: "Stale mock row", url: "http://localhost:5000/api/mock/gone", healthCheckPath: null, healthStatus: "healthy", transportType: "streamable-http", readOnlyEndpoint: null }];
    const probe = vi.fn();
    h.deps.probe = probe as any;
    const result = await scanConnectorHealth(h.deps, NOW);
    expect(result).toMatchObject({ seen: 1, checked: 0, notCheckable: 1, healthy: 0, unhealthy: 0 });
    expect(probe).not.toHaveBeenCalled();
    expect(h.deps.saveHealth).not.toHaveBeenCalled();
  });

  it("leaves the recorded state alone when the check itself could not run", async () => {
    // testConnectionHealth answers ok:true / not_verifiable for an integration it
    // has no test for. Taken as health that is a green badge for nothing.
    const h = harness({ previous: "unhealthy", healthy: true });
    h.deps.listTargets = async () => [{ id: "s1", name: "Workday", url: "https://x/api/integrations/workday", healthCheckPath: null, healthStatus: "unhealthy", integrationId: "workday", inThisBuild: true, hasConnection: true, organizationId: "org" }];
    h.deps.probe = async () => connectionTestResult({ ok: true, status: "not_verifiable" });
    const result = await scanConnectorHealth(h.deps, NOW);
    expect(result).toMatchObject({ checked: 0, notCheckable: 1 });
    expect(h.deps.saveHealth).not.toHaveBeenCalled();
    expect(h.created).toEqual([]);
  });

  it("does not re-run a check that is not due yet, and says which check each connector got", async () => {
    const h = harness({ previous: "healthy", healthy: true });
    const justChecked = new Date(NOW.getTime() - 60_000);
    h.deps.listTargets = async () => [
      { id: "s1", name: "Figma", url: "http://svc", healthCheckPath: "/health/figma", healthStatus: "healthy", lastHealthCheck: justChecked },
      { id: "s2", name: "Remote MCP", url: "https://mcp.example.com/mcp", healthCheckPath: null, healthStatus: "unknown", transportType: "streamable-http" },
    ];
    h.deps.probe = async (_t, method) => ({ healthy: true, detail: "ok", method, probed: true });
    const result = await scanConnectorHealth(h.deps, NOW);
    // health_path is metered at 5 minutes, so the Figma probe from a minute ago stands.
    expect(result).toMatchObject({ seen: 2, checked: 1, skipped: 1, byMethod: { mcp_tools_list: 1 } });
  });
});

describe("which check a connector can take", () => {
  const base: ProbeTarget = { id: "c", name: "c", url: null, healthCheckPath: null, healthStatus: null };

  it("prefers the service's own health endpoint when it has one", () => {
    expect(chooseProbe({ ...base, url: "http://svc", healthCheckPath: "/health/figma" }).method).toBe("health_path");
  });

  it("asks a real MCP server for its tools, which is the path an agent's call takes", () => {
    expect(chooseProbe({ ...base, url: "https://mcp.example.com/mcp", transportType: "streamable-http" }).method).toBe("mcp_tools_list");
    expect(chooseProbe({ ...base, url: "https://mcp.example.com/mcp", transportType: "sse" }).method).toBe("mcp_tools_list");
    // Not a protocol transport: nothing here knows how to call it.
    expect(chooseProbe({ ...base, url: "https://x.example.com", transportType: "stdio" }).method).toBe("none");
  });

  it("tests an enterprise connector against the system it connects to, once something is connected", () => {
    const sf = { ...base, url: "https://app/api/integrations/salesforce", integrationId: "salesforce", inThisBuild: true };
    expect(chooseProbe({ ...sf, hasConnection: true }).method).toBe("vendor_connection_test");
    const unconnected = chooseProbe({ ...sf, hasConnection: false });
    expect(unconnected.method).toBe("none");
    expect(unconnected.why).toContain("no credentials to test with");
    const gone = chooseProbe({ ...sf, hasConnection: true, inThisBuild: false });
    expect(gone.why).toContain("not part of this build");
  });

  it("calls a read-only endpoint of a mock this process serves, and refuses to call one that changes something", () => {
    const mock = { ...base, url: "http://localhost:5000/api/mock/watchlist-screening", transportType: "streamable-http" };
    expect(chooseProbe({ ...mock, readOnlyEndpoint: "/watchlists" }).method).toBe("mock_endpoint");
    const noSafeCall = chooseProbe(mock);
    expect(noSafeCall.method).toBe("none");
    expect(noSafeCall.why).toContain("without changing something");
  });

  it("says what is missing rather than defaulting to a state", () => {
    expect(chooseProbe(base).why).toBe("no endpoint is recorded for it");
  });

  it("meters the expensive checks harder than the free ones, and never schedules a check that does not exist", () => {
    expect(PROBE_CADENCE_MS.vendor_connection_test).toBeGreaterThan(PROBE_CADENCE_MS.health_path);
    expect(isDueForProbe("none", null)).toBe(false);
    expect(isDueForProbe("health_path", null)).toBe(true);
    const now = new Date("2026-09-28T12:00:00Z");
    expect(isDueForProbe("vendor_connection_test", new Date(now.getTime() - 30 * 60_000), now)).toBe(false);
    expect(isDueForProbe("vendor_connection_test", new Date(now.getTime() - 61 * 60_000), now)).toBe(true);
  });
});

describe("what each check reports", () => {
  it("names the tool count, and the drift from what the platform has catalogued", async () => {
    expect(toolsListResult(12, 12).detail).toBe("Answered a tools/list handshake with 12 tools");
    const drifted = toolsListResult(11, 12);
    expect(drifted.healthy).toBe(true);
    expect(drifted.detail).toContain("offers 11 tools but 12 are catalogued here, so the two disagree");
  });

  it("reads a mock's 404 as the row outliving its code, and any other answer as mounted", async () => {
    const target: ProbeTarget = { id: "m", name: "m", url: "http://localhost:5000/api/mock/x", healthCheckPath: null, healthStatus: null, readOnlyEndpoint: "/watchlists" };
    const gone = await probeMockEndpoint(target, (async () => new Response("", { status: 404 })) as any);
    expect(gone).toMatchObject({ healthy: false, probed: true });
    expect(gone.detail).toContain("no longer served");
    // A 400 for an empty request still proves the route is mounted and ran.
    const mounted = await probeMockEndpoint(target, (async () => new Response("", { status: 400 })) as any);
    expect(mounted.healthy).toBe(true);
    expect(mounted.detail).toContain("mounted and serving");
    expect((await probeMockEndpoint(target, (async () => new Response("", { status: 500 })) as any)).healthy).toBe(false);
  });

  it("does not turn a credential test that could not run into a measurement", () => {
    expect(connectionTestResult({ ok: true, status: "not_verifiable" })).toMatchObject({ probed: false, healthy: false });
    expect(connectionTestResult({ ok: true, latencyMs: 120 })).toMatchObject({ probed: true, healthy: true, detail: "Its own system answered a credential test in 120ms" });
    expect(connectionTestResult({ ok: false, friendlyError: "The password was rejected." }).detail).toContain("The password was rejected.");
  });
});
