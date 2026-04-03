import { Router, type Request } from "express";
import { db } from "../db";
import { runTraces, agents, agentAlerts } from "@shared/schema";
import { eq, gte, and, isNull, desc, sql } from "drizzle-orm";
import { getOrgId } from "../auth";

const router = Router();

function percentile(sortedArr: number[], p: number): number {
  if (sortedArr.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sortedArr.length) - 1;
  return sortedArr[Math.max(0, Math.min(idx, sortedArr.length - 1))];
}

function normalizeRate(raw: number | null | undefined, fallback: number): number {
  if (raw == null) return fallback;
  return raw <= 1 ? Math.round(raw * 10000) / 100 : raw;
}

interface AgentMetrics {
  agentId: string;
  agentName: string;
  department: string;
  riskTier: string;
  organizationId: string | null;
  successRate: number;
  errorRate: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  costPerRun: number;
  totalRuns: number;
  healthScore: number;
}

async function computeAgentMetrics(windowDays: number, orgId?: string): Promise<AgentMetrics[]> {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  const agentQuery = db.select({
    id: agents.id,
    name: agents.name,
    department: agents.department,
    riskTier: agents.riskTier,
    healthScore: agents.healthScore,
    successRate: agents.successRate,
    costPerRun: agents.costPerRun,
    organizationId: agents.organizationId,
  }).from(agents).where(eq(agents.status, "active"));

  const allAgents = await agentQuery;
  const scopedAgents = orgId
    ? allAgents.filter(a => !a.organizationId || a.organizationId === orgId)
    : allAgents;

  const scopedAgentIds = new Set(scopedAgents.map(a => a.id));

  const tracesQuery = db.select({
    agentId: runTraces.agentId,
    status: runTraces.status,
    latencyMs: runTraces.latencyMs,
    costUsd: runTraces.costUsd,
    organizationId: runTraces.organizationId,
  }).from(runTraces).where(gte(runTraces.startedAt, since));

  const allTraces = await tracesQuery;
  const traces = allTraces.filter(t =>
    scopedAgentIds.has(t.agentId) &&
    (!orgId || !t.organizationId || t.organizationId === orgId)
  );

  const byAgent = new Map<string, { latencies: number[]; costs: number[]; total: number; errors: number }>();
  for (const t of traces) {
    if (!byAgent.has(t.agentId)) {
      byAgent.set(t.agentId, { latencies: [], costs: [], total: 0, errors: 0 });
    }
    const entry = byAgent.get(t.agentId)!;
    entry.total++;
    if (t.status === "failed" || t.status === "error") entry.errors++;
    if (t.latencyMs != null && t.latencyMs > 0) entry.latencies.push(t.latencyMs);
    if (t.costUsd != null && t.costUsd > 0) entry.costs.push(t.costUsd);
  }

  return scopedAgents.map((agent) => {
    const data = byAgent.get(agent.id);
    const sortedLatencies = data ? [...data.latencies].sort((a, b) => a - b) : [];
    const avgCost = data && data.costs.length > 0
      ? data.costs.reduce((a, b) => a + b, 0) / data.costs.length
      : (agent.costPerRun ?? 0);
    const totalRuns = data?.total ?? 0;
    const errors = data?.errors ?? 0;

    let successRate: number;
    if (totalRuns > 0) {
      successRate = Math.round(((totalRuns - errors) / totalRuns) * 10000) / 100;
    } else {
      successRate = normalizeRate(agent.successRate, 100);
    }
    const errorRate = totalRuns > 0
      ? Math.round((errors / totalRuns) * 10000) / 100
      : Math.max(0, 100 - successRate);

    return {
      agentId: agent.id,
      agentName: agent.name,
      department: agent.department ?? "General",
      riskTier: agent.riskTier ?? "MEDIUM",
      organizationId: agent.organizationId ?? null,
      successRate,
      errorRate,
      p50LatencyMs: percentile(sortedLatencies, 50),
      p95LatencyMs: percentile(sortedLatencies, 95),
      p99LatencyMs: percentile(sortedLatencies, 99),
      costPerRun: Math.round(avgCost * 1000000) / 1000000,
      totalRuns,
      healthScore: normalizeRate(agent.healthScore, successRate),
    };
  });
}

router.get("/api/prometheus/metrics", async (req: Request, res) => {
  try {
    const orgId = getOrgId(req);
    const metrics = await computeAgentMetrics(7, orgId);

    const lines: string[] = [];

    const defineMetric = (name: string, help: string, type: "gauge" | "counter") => {
      lines.push(`# HELP ${name} ${help}`);
      lines.push(`# TYPE ${name} ${type}`);
    };

    const emitAgentLines = (metricName: string, getValue: (m: AgentMetrics) => number) => {
      for (const m of metrics) {
        const labels = `agent_id="${m.agentId}",agent_name="${m.agentName.replace(/"/g, '\\"')}",department="${m.department.replace(/"/g, '\\"')}",risk_tier="${m.riskTier}"`;
        lines.push(`${metricName}{${labels}} ${getValue(m)}`);
      }
    };

    defineMetric("atlas_agent_success_rate", "Agent success rate over last 7 days (percentage 0-100)", "gauge");
    emitAgentLines("atlas_agent_success_rate", m => m.successRate);

    defineMetric("atlas_agent_error_rate", "Agent error rate over last 7 days (percentage 0-100)", "gauge");
    emitAgentLines("atlas_agent_error_rate", m => m.errorRate);

    defineMetric("atlas_agent_latency_p50_ms", "Agent p50 latency in milliseconds (last 7 days)", "gauge");
    emitAgentLines("atlas_agent_latency_p50_ms", m => m.p50LatencyMs);

    defineMetric("atlas_agent_latency_p95_ms", "Agent p95 latency in milliseconds (last 7 days)", "gauge");
    emitAgentLines("atlas_agent_latency_p95_ms", m => m.p95LatencyMs);

    defineMetric("atlas_agent_latency_p99_ms", "Agent p99 latency in milliseconds (last 7 days)", "gauge");
    emitAgentLines("atlas_agent_latency_p99_ms", m => m.p99LatencyMs);

    defineMetric("atlas_agent_cost_per_run_usd", "Agent average cost per run in USD (last 7 days)", "gauge");
    emitAgentLines("atlas_agent_cost_per_run_usd", m => m.costPerRun);

    defineMetric("atlas_agent_total_runs", "Total agent runs in last 7 days (rolling window)", "gauge");
    emitAgentLines("atlas_agent_total_runs", m => m.totalRuns);

    defineMetric("atlas_agent_health_score", "Agent health score (0-100)", "gauge");
    emitAgentLines("atlas_agent_health_score", m => m.healthScore);

    const fleetTotalRuns = metrics.reduce((a, m) => a + m.totalRuns, 0);
    const fleetAvgSuccessRate = metrics.length > 0
      ? Math.round((metrics.reduce((a, m) => a + m.successRate, 0) / metrics.length) * 100) / 100
      : 0;

    defineMetric("atlas_fleet_total_runs", "Total runs across all agents in last 7 days (rolling window)", "gauge");
    lines.push(`atlas_fleet_total_runs ${fleetTotalRuns}`);

    defineMetric("atlas_fleet_avg_success_rate", "Fleet-wide average success rate (0-100)", "gauge");
    lines.push(`atlas_fleet_avg_success_rate ${fleetAvgSuccessRate}`);

    res.set("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
    res.send(lines.join("\n") + "\n");
  } catch (err: any) {
    console.error("[observability] Prometheus metrics error:", err.message);
    res.status(500).send("# Error computing metrics\n");
  }
});

router.get("/api/observability/fleet", async (req: Request, res) => {
  try {
    const orgId = getOrgId(req);
    const [metrics7d, metrics30d] = await Promise.all([
      computeAgentMetrics(7, orgId),
      computeAgentMetrics(30, orgId),
    ]);

    const metricsMap30d = new Map(metrics30d.map(m => [m.agentId, m]));

    const agentRows = metrics7d.map(m => {
      const m30 = metricsMap30d.get(m.agentId);
      return {
        agentId: m.agentId,
        agentName: m.agentName,
        department: m.department,
        riskTier: m.riskTier,
        successRate7d: m.successRate,
        errorRate7d: m.errorRate,
        p50LatencyMs7d: m.p50LatencyMs,
        p95LatencyMs7d: m.p95LatencyMs,
        p99LatencyMs7d: m.p99LatencyMs,
        costPerRun7d: m.costPerRun,
        totalRuns7d: m.totalRuns,
        healthScore: m.healthScore,
        successRate30d: m30?.successRate ?? m.successRate,
        errorRate30d: m30?.errorRate ?? m.errorRate,
        p95LatencyMs30d: m30?.p95LatencyMs ?? m.p95LatencyMs,
        costPerRun30d: m30?.costPerRun ?? m.costPerRun,
        totalRuns30d: m30?.totalRuns ?? 0,
      };
    });

    const topOffenders = agentRows
      .filter(a => a.successRate7d < 80 || a.p95LatencyMs7d > 30000)
      .sort((a, b) => a.successRate7d - b.successRate7d)
      .slice(0, 10);

    const fleet7d = {
      avgSuccessRate: metrics7d.length > 0
        ? Math.round((metrics7d.reduce((a, m) => a + m.successRate, 0) / metrics7d.length) * 100) / 100
        : 0,
      avgP95LatencyMs: metrics7d.length > 0
        ? Math.round(metrics7d.reduce((a, m) => a + m.p95LatencyMs, 0) / metrics7d.length)
        : 0,
      totalCostUsd: Math.round(metrics7d.reduce((a, m) => a + m.costPerRun * m.totalRuns, 0) * 100) / 100,
      totalRuns: metrics7d.reduce((a, m) => a + m.totalRuns, 0),
      avgErrorRate: metrics7d.length > 0
        ? Math.round((metrics7d.reduce((a, m) => a + m.errorRate, 0) / metrics7d.length) * 100) / 100
        : 0,
      agentCount: metrics7d.length,
    };

    const fleet30d = {
      avgSuccessRate: metrics30d.length > 0
        ? Math.round((metrics30d.reduce((a, m) => a + m.successRate, 0) / metrics30d.length) * 100) / 100
        : 0,
      avgP95LatencyMs: metrics30d.length > 0
        ? Math.round(metrics30d.reduce((a, m) => a + m.p95LatencyMs, 0) / metrics30d.length)
        : 0,
      totalCostUsd: Math.round(metrics30d.reduce((a, m) => a + m.costPerRun * m.totalRuns, 0) * 100) / 100,
      totalRuns: metrics30d.reduce((a, m) => a + m.totalRuns, 0),
      avgErrorRate: metrics30d.length > 0
        ? Math.round((metrics30d.reduce((a, m) => a + m.errorRate, 0) / metrics30d.length) * 100) / 100
        : 0,
      agentCount: metrics30d.length,
    };

    res.json({ agents: agentRows, fleet7d, fleet30d, topOffenders });
  } catch (err: any) {
    console.error("[observability] Fleet metrics error:", err.message);
    res.status(500).json({ error: "Failed to compute fleet metrics" });
  }
});

router.get("/api/observability/alerts", async (req: Request, res) => {
  try {
    const orgId = getOrgId(req);
    const rows = await db.select().from(agentAlerts)
      .where(orgId ? eq(agentAlerts.orgId, orgId) : undefined)
      .orderBy(desc(agentAlerts.triggeredAt))
      .limit(200);
    res.json(rows);
  } catch (err: any) {
    console.error("[observability] Alerts fetch error:", err.message);
    res.status(500).json({ error: "Failed to fetch alerts" });
  }
});

router.post("/api/observability/alerts/:id/acknowledge", async (req: Request, res) => {
  try {
    const { id } = req.params;
    const orgId = getOrgId(req);

    const whereClause = orgId
      ? and(eq(agentAlerts.id, id), eq(agentAlerts.orgId, orgId))
      : eq(agentAlerts.id, id);

    const result = await db.update(agentAlerts)
      .set({ acknowledgedAt: new Date() })
      .where(whereClause)
      .returning({ id: agentAlerts.id });

    if (result.length === 0) {
      return res.status(404).json({ error: "Alert not found or access denied" });
    }
    res.json({ success: true });
  } catch (err: any) {
    console.error("[observability] Alert acknowledge error:", err.message);
    res.status(500).json({ error: "Failed to acknowledge alert" });
  }
});

async function ingestOtlpBody(body: { resourceSpans?: any[] }, orgId: string | undefined): Promise<number> {
  let accepted = 0;
  for (const resourceSpan of (body.resourceSpans ?? [])) {
    const resourceAttrs: Record<string, string> = {};
    for (const attr of (resourceSpan.resource?.attributes ?? [])) {
      resourceAttrs[attr.key] = attr.value?.stringValue ?? String(attr.value?.intValue ?? attr.value?.boolValue ?? "");
    }
    const agentId = resourceAttrs["atlas.agent.id"] ?? resourceAttrs["service.name"] ?? "unknown";

    for (const scopeSpan of (resourceSpan.scopeSpans ?? [])) {
      for (const span of (scopeSpan.spans ?? [])) {
        const startNs = BigInt(span.startTimeUnixNano ?? 0);
        const endNs = BigInt(span.endTimeUnixNano ?? 0);
        const latencyMs = startNs > 0n && endNs > startNs
          ? Number((endNs - startNs) / 1_000_000n)
          : 0;
        const status = span.status?.code === 2 ? "failed" : "completed";

        const spanAttrs: Record<string, string> = {};
        for (const attr of (span.attributes ?? [])) {
          spanAttrs[attr.key] = attr.value?.stringValue ?? String(attr.value?.intValue ?? attr.value?.boolValue ?? "");
        }

        const traceId: string | null = span.traceId ?? null;
        const spanId: string | null = span.spanId ?? null;

        const rowId = traceId && spanId
          ? `${traceId}:${spanId}`
          : traceId ?? spanId ?? undefined;

        await db.insert(runTraces).values({
          id: rowId,
          agentId,
          organizationId: orgId ?? undefined,
          versionId: spanId,
          environment: "otlp",
          status,
          latencyMs,
          costUsd: parseFloat(spanAttrs["atlas.cost_usd"] ?? "0") || 0,
          inputSummary: `OTLP span: ${span.name ?? "unknown"}`,
          outputSummary: span.status?.message ?? null,
          toolCalls: span.attributes ? { traceId, spanId, attributes: span.attributes } : null,
        }).onConflictDoNothing();
        accepted++;
      }
    }
  }
  return accepted;
}

router.post("/api/observability/export/otlp", async (req: Request, res) => {
  try {
    const orgId = getOrgId(req);
    const body = req.body as { resourceSpans?: any[] };
    if (!body?.resourceSpans || !Array.isArray(body.resourceSpans)) {
      return res.status(400).json({ error: "Invalid OTLP payload: missing resourceSpans array" });
    }
    const accepted = await ingestOtlpBody(body, orgId);
    res.json({ accepted });
  } catch (err: any) {
    console.error("[observability] OTLP ingest error:", err.message);
    res.status(500).json({ error: "Failed to ingest OTLP traces" });
  }
});

export const otlpIngestRouter = Router();

otlpIngestRouter.post("/ingest/otlp", async (req: Request, res) => {
  try {
    const ingestToken = process.env.ATLAS_INGEST_TOKEN;
    if (!ingestToken) {
      return res.status(503).json({ error: "OTLP ingest is not configured. Set ATLAS_INGEST_TOKEN to enable." });
    }

    const authHeader = String(req.headers["authorization"] ?? "");
    const provided = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (provided !== ingestToken) {
      return res.status(401).json({ error: "Unauthorized: invalid or missing ingest token" });
    }

    const orgHeader = req.headers["x-organization-id"];
    const orgId = typeof orgHeader === "string" && orgHeader ? orgHeader : undefined;

    const body = req.body as { resourceSpans?: any[] };
    if (!body?.resourceSpans || !Array.isArray(body.resourceSpans)) {
      return res.status(400).json({ error: "Invalid OTLP payload: missing resourceSpans array" });
    }
    const accepted = await ingestOtlpBody(body, orgId);
    res.json({ accepted });
  } catch (err: any) {
    console.error("[observability] External OTLP ingest error:", err.message);
    res.status(500).json({ error: "Failed to ingest OTLP traces" });
  }
});

export default router;

export async function runAlertCheck() {
  try {
    const [metrics7d, metrics30d] = await Promise.all([
      computeAgentMetrics(7),
      computeAgentMetrics(30),
    ]);
    const map30d = new Map(metrics30d.map(m => [m.agentId, m]));

    let created = 0;
    for (const m of metrics7d) {
      if (m.totalRuns < 5) continue;
      const baseline = map30d.get(m.agentId);
      if (!baseline || baseline.totalRuns < 10) continue;

      const delta = baseline.successRate - m.successRate;
      if (delta <= 10) continue;

      const openAlerts = await db.select().from(agentAlerts).where(
        and(
          eq(agentAlerts.agentId, m.agentId),
          eq(agentAlerts.alertType, "success_rate_drop"),
          isNull(agentAlerts.acknowledgedAt),
        )
      );

      const severity = delta > 20 ? "critical" : delta > 15 ? "high" : "warning";
      const message = `Success rate dropped ${delta.toFixed(1)}pp below 30-day baseline (current: ${m.successRate.toFixed(1)}%, baseline: ${baseline.successRate.toFixed(1)}%)`;

      if (openAlerts.length > 0) {
        await db.update(agentAlerts)
          .set({
            severity,
            message,
            currentValue: m.successRate,
            baselineValue: baseline.successRate,
            triggeredAt: new Date(),
          })
          .where(eq(agentAlerts.id, openAlerts[0].id));
      } else {
        await db.insert(agentAlerts).values({
          agentId: m.agentId,
          agentName: m.agentName,
          orgId: m.organizationId ?? null,
          alertType: "success_rate_drop",
          severity,
          message,
          currentValue: m.successRate,
          baselineValue: baseline.successRate,
        });
        created++;
      }
    }

    if (created > 0) {
      console.log(`[observability] Alert check: created ${created} new alert(s)`);
    }
  } catch (err: any) {
    console.error("[observability] Alert check error:", err.message);
  }
}
