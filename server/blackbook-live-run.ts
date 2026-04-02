import { type Request, type Response } from "express";
import { storage } from "./storage";
import { db } from "./db";
import { agents } from "@shared/schema";
import { eq } from "drizzle-orm";
import { runAgentOnce, stopAgentRuntime, isRuntimeActive, runtimeEvents } from "./agent-runtime";

const BASE_URL = `http://localhost:${process.env.PORT || 5000}`;

// ─── BB Agent IDs (same UUIDs as PROD for deep-link continuity) ───────────────

export const BB_AGENT_IDS = {
  dataQualitySentinel: "33c3f55f-5fce-4ea9-b475-9f50a18c325f",
  marketShiftDetector:  "3125a957-7d5d-4a84-bdea-aeaf33f12d62",
  competitiveMonitor:   "d3156fb0-07cc-4d1a-a376-bbfb4822df6b",
  narrativeGenerator:   "ede1ac5a-ad1b-48de-9054-c164b1cff991",
} as const;

// ─── MCP Server definitions ───────────────────────────────────────────────────

const BB_MCP_SERVERS = [
  {
    name: "BB Auction Data Feed",
    description: "Black Book daily auction transaction ingest, outlier detection, fraud pattern analysis, and quality reporting. Processes 140K+ daily transactions from Manheim, Adesa, Independent, and Dealer-Direct sources.",
    url: `${BASE_URL}/api/mock/bb-auction-data`,
    tools: [
      { name: "ingest_auction_batch", description: "Ingest today's auction transaction batch from all sources. Returns total count, source breakdown, and transaction sample.", endpoint: "ingest-batch", method: "GET", inputSchema: { type: "object", properties: { date: { type: "string" } } } },
      { name: "run_outlier_detection", description: "Run 3-sigma price deviation, geographic arbitrage, and odometer rollback heuristic tests across all transactions.", endpoint: "outlier-detection", method: "GET", inputSchema: { type: "object", properties: { date: { type: "string" } } } },
      { name: "detect_fraud_patterns", description: "Scan for multi-auction duplicate VIN patterns, title-washing indicators, and cross-state fraud signals.", endpoint: "fraud-patterns", method: "GET", inputSchema: { type: "object", properties: { date: { type: "string" } } } },
      { name: "quarantine_transactions", description: "Quarantine flagged transactions from the pricing model. Returns quarantine summary with counts by anomaly type.", endpoint: "quarantine", method: "POST", inputSchema: { type: "object", properties: { transactionIds: { type: "array", items: { type: "string" } } } } },
      { name: "generate_quality_report", description: "Generate the daily auction data quality report with executive summary and performance metrics.", endpoint: "quality-report", method: "GET", inputSchema: { type: "object", properties: {} } },
    ],
  },
  {
    name: "BB Market Intelligence",
    description: "Black Book market shift signals: rolling segment price trends, auction volume data, news signals, fuel price data, OEM incentive tracking, and competitive valuation data vs KBB and NADA.",
    url: `${BASE_URL}/api/mock/bb-market-data`,
    tools: [
      { name: "get_segment_price_trends", description: "Retrieve 6-week rolling average wholesale prices by segment. Flags deviations beyond 2-sigma from historical norm.", endpoint: "segment-price-trends", method: "GET", inputSchema: { type: "object", properties: { segment: { type: "string" } } } },
      { name: "get_auction_volume_trends", description: "Retrieve weekly auction volume trends by segment and source. Identifies fleet dumping and supply shock patterns.", endpoint: "auction-volume-trends", method: "GET", inputSchema: { type: "object", properties: {} } },
      { name: "scan_news_signals", description: "Scan auto/fleet news articles for segment-level sentiment and OEM incentive signals.", endpoint: "news-signals", method: "GET", inputSchema: { type: "object", properties: { days_back: { type: "number" } } } },
      { name: "generate_shift_alerts", description: "Generate market shift alerts for segments with statistically significant price movements.", endpoint: "shift-alerts", method: "GET", inputSchema: { type: "object", properties: {} } },
      { name: "get_blackbook_values", description: "Retrieve Black Book current wholesale and trade-in values for a given segment.", endpoint: "blackbook-values", method: "GET", inputSchema: { type: "object", properties: { segment: { type: "string" } } } },
      { name: "get_competitor_values", description: "Retrieve KBB and NADA comparison values for the same vehicle segment.", endpoint: "competitor-values", method: "GET", inputSchema: { type: "object", properties: { segment: { type: "string" } } } },
      { name: "compute_divergence_analysis", description: "Compute divergence metrics between Black Book, KBB, and NADA across all segments.", endpoint: "divergence-analysis", method: "GET", inputSchema: { type: "object", properties: {} } },
      { name: "generate_competitive_brief", description: "Generate executive competitive intelligence brief for Black Book vs KBB and NADA.", endpoint: "competitive-brief", method: "GET", inputSchema: { type: "object", properties: {} } },
    ],
  },
  {
    name: "BB Report Engine",
    description: "Black Book weekly report generation: pipeline summaries, market summary drafting, segment analysis, and final report assembly for the Wholesale Insights publication.",
    url: `${BASE_URL}/api/mock/bb-report-engine`,
    tools: [
      { name: "get_pipeline_summaries", description: "Retrieve summary outputs from BB-AGT-001, BB-AGT-002, and BB-AGT-003 for report inputs.", endpoint: "pipeline-summaries", method: "GET", inputSchema: { type: "object", properties: {} } },
      { name: "draft_market_summary", description: "Auto-generate the Market Summary section using this week's aggregate wholesale data.", endpoint: "draft-market-summary", method: "GET", inputSchema: { type: "object", properties: {} } },
      { name: "draft_segment_analysis", description: "Auto-generate per-segment analysis sections with data-driven narrative for all 12 segments.", endpoint: "draft-segment-analysis", method: "GET", inputSchema: { type: "object", properties: {} } },
      { name: "finalize_report_draft", description: "Assemble final report draft with all sections, flag analyst review items, and produce publication metrics.", endpoint: "finalize-report", method: "GET", inputSchema: { type: "object", properties: {} } },
    ],
  },
];

// ─── Agent definitions ────────────────────────────────────────────────────────

interface BBAgentDef {
  name: string;
  description: string;
  systemPrompt: string;
  taskPrompt: string;
  mcpServerNames: string[];
  maxToolIterations: number;
}

const BB_AGENT_DEFS: Record<keyof typeof BB_AGENT_IDS, BBAgentDef> = {
  dataQualitySentinel: {
    name:        "Auction Data Quality Sentinel",
    description: "Detects anomalies, outliers, and fraud patterns in 140K+ daily auction transactions before they corrupt the Black Book valuation model.",
    mcpServerNames: ["BB Auction Data Feed"],
    maxToolIterations: 8,
    systemPrompt: `You are the Auction Data Quality Sentinel (BB-AGT-001) for Black Book vehicle valuations. Your mission is to protect the integrity of the Black Book valuation model by detecting and quarantining bad data before it corrupts pricing.

You process 140,000+ daily auction transactions from Manheim, Adesa, Independent, and Dealer-Direct feeds.

Task for today's run:
1. Call ingest_auction_batch to load today's full transaction batch and understand volume/composition
2. Call run_outlier_detection to identify price outliers, geographic inconsistencies, and odometer anomalies
3. Call detect_fraud_patterns to scan for suspected fraud (multi-auction VIN duplicates, title-washing)
4. Call quarantine_transactions to exclude all flagged transactions from the pricing model
5. Call generate_quality_report to produce the daily quality summary

After completing all tool calls, analyze the results and produce a comprehensive summary of what you found.

IMPORTANT: End your final response with ONLY this JSON block:
\`\`\`json
{
  "totalTransactions": 142183,
  "quarantined": 23,
  "anomalyDetectionRate": 97.2,
  "falsePositiveRate": 7.8,
  "fraudPatternsFound": 1,
  "modelIntegrityStatus": "INTACT",
  "topAnomalyVIN": "1HGCV1F34PA028451",
  "processingTimeSec": 247
}
\`\`\`
Adjust values based on what the tools return. Keep numbers internally consistent.`,
    taskPrompt: "Run today's auction data quality scan. Call ingest_auction_batch, run_outlier_detection, detect_fraud_patterns, quarantine_transactions, and generate_quality_report. Produce the quality summary JSON.",
  },

  marketShiftDetector: {
    name:        "Market Shift Detector",
    description: "Detects segment-level market shifts 2-4 weeks before they surface in standard weekly reports by fusing auction volume, OEM incentive, fuel price, and news signals.",
    mcpServerNames: ["BB Market Intelligence"],
    maxToolIterations: 8,
    systemPrompt: `You are the Market Shift Detector (BB-AGT-002) for Black Book. Your mission is to detect where the vehicle market is going 2-4 weeks before it surfaces in standard weekly reports.

You analyze all vehicle segments by fusing structured auction data with unstructured news and economic signals.

Task for today's run:
1. Call get_segment_price_trends to identify segments with abnormal price velocity
2. Call get_auction_volume_trends to detect supply shocks and fleet liquidation patterns
3. Call scan_news_signals to gather OEM incentive signals and industry news sentiment
4. Call generate_shift_alerts to produce actionable alerts for high-confidence shifts

After completing tool calls, synthesize the signals into a coherent market shift picture.

IMPORTANT: End your final response with ONLY this JSON block:
\`\`\`json
{
  "activeAmberAlerts": 1,
  "topAlert": {
    "segment": "Full-Size Pickup",
    "severity": "AMBER",
    "confidence": 0.87,
    "weeklyDeclineRate": -1.8,
    "historicalNorm": -0.4,
    "leadTimeWeeks": 2.5,
    "signalsFused": 4
  },
  "cleanSegments": 10,
  "monitoredSegments": 12
}
\`\`\`
Adjust based on tool results. Confidence should reflect the number and quality of signals fused.`,
    taskPrompt: "Run today's market shift detection scan. Call get_segment_price_trends, get_auction_volume_trends, scan_news_signals, and generate_shift_alerts. Produce the market shift alert JSON.",
  },

  competitiveMonitor: {
    name:        "Competitive Intelligence Monitor",
    description: "Tracks Black Book valuation divergence vs KBB and NADA to identify competitive advantages and threats.",
    mcpServerNames: ["BB Market Intelligence"],
    maxToolIterations: 8,
    systemPrompt: `You are the Competitive Intelligence Monitor (BB-AGT-003) for Black Book. Your mission is to protect and grow Black Book's market position by tracking competitor valuation divergence.

Competitors monitored (licensed data): KBB (trade-in values), NADA Guides (clean/rough trade), JD Power (auction-derived).

Task for today's run:
1. Call get_blackbook_values for key segments to establish BB's current position
2. Call get_competitor_values to retrieve KBB and NADA values for the same vehicles
3. Call compute_divergence_analysis to quantify divergence across all segments
4. Call generate_competitive_brief to produce the strategic competitive intelligence summary

After completing all tool calls, synthesize the competitive picture.

IMPORTANT: End your final response with ONLY this JSON block:
\`\`\`json
{
  "overallCompetitivePosition": "STRONG",
  "dataFreshnessLeadVsNADA": 30,
  "dataFreshnessLeadVsKBB": 7,
  "fullSizePickupAdvantage": "BB 4.7% below NADA — will be validated in 2-3 weeks",
  "divergenceScore": 4.2,
  "clientOpportunities": 3
}
\`\`\`
Adjust values to reflect what the tools return.`,
    taskPrompt: "Run today's competitive intelligence scan. Call get_blackbook_values, get_competitor_values, compute_divergence_analysis, and generate_competitive_brief. Produce the competitive positioning JSON.",
  },

  narrativeGenerator: {
    name:        "Narrative Insight Generator",
    description: "Synthesizes outputs from BB-AGT-001/002/003 into the weekly Wholesale Insights and Residual Values reports for 15,000+ industry subscribers.",
    mcpServerNames: ["BB Report Engine"],
    maxToolIterations: 8,
    systemPrompt: `You are the Narrative Insight Generator (BB-AGT-004) for Black Book. You synthesize the week's findings from all three upstream BB agents into the Wholesale Insights report published to 15,000+ industry subscribers.

Your output transforms 8-12 hours of analyst writing into a 3-minute draft generation, while maintaining Black Book's high editorial standard.

Task for today's run:
1. Call get_pipeline_summaries to load outputs from BB-AGT-001, 002, and 003
2. Call draft_market_summary to auto-generate the opening Market Summary section
3. Call draft_segment_analysis to auto-generate per-segment analysis for all 12 segments
4. Call finalize_report_draft to assemble the complete draft with analyst review flags

After completing tool calls, report on what you produced.

IMPORTANT: End your final response with ONLY this JSON block:
\`\`\`json
{
  "reportTitle": "Black Book Weekly Wholesale Insights",
  "totalWordCount": 1047,
  "autoGeneratedPct": 85.7,
  "generationTimeSec": 187,
  "analystTimeSavedHours": 8.5,
  "sectionsAutoComplete": 3,
  "sectionsNeedingReview": 2,
  "reportStatus": "DRAFT — Ready for analyst review",
  "subscribers": 15000
}
\`\`\`
Adjust values based on what the report engine tools return.`,
    taskPrompt: "Generate the weekly Wholesale Insights report draft. Call get_pipeline_summaries, draft_market_summary, draft_segment_analysis, and finalize_report_draft. Produce the report metrics JSON.",
  },
};

// ─── Module-level server ID cache ─────────────────────────────────────────────

const _bbServerIdByName: Record<string, string> = {};

export function getBBActualServerIds(serverNames: string[]): string[] {
  return serverNames.map(n => _bbServerIdByName[n] || "");
}

// ─── Ensure BB Agents exist in local DB ──────────────────────────────────────

export async function ensureBBAgents(): Promise<void> {
  try {
    const allServers = await storage.getMcpServers().catch(() => [] as any[]);

    for (const serverDef of BB_MCP_SERVERS) {
      let server = allServers.find((s: any) => s.name === serverDef.name);

      if (!server) {
        server = await storage.createMcpServer({
          name:          serverDef.name,
          description:   serverDef.description,
          transportType: "streamable-http",
          url:           serverDef.url,
          status:        "registered",
          riskTier:      "MEDIUM",
          allowlisted:   true,
          addedBy:       "bb-live-demo",
          capabilities:  { tools: true, resources: false, prompts: false, sampling: false },
          serverInfo:    { vendor: "Black Book / Hearst", version: "1.0.0" },
        });
      } else if (server.url !== serverDef.url) {
        await storage.updateMcpServer(server.id, { url: serverDef.url });
      }

      _bbServerIdByName[serverDef.name] = server.id;

      const existingTools = await storage.getMcpServerTools(server.id).catch(() => [] as any[]);
      const existingNames = new Set((existingTools || []).map((t: any) => t.name));

      for (const tool of serverDef.tools) {
        if (existingNames.has(tool.name)) continue;
        await storage.createMcpServerTool({
          serverId:           server.id,
          name:               tool.name,
          description:        tool.description,
          inputSchema:        tool.inputSchema,
          annotations:        { endpoint: tool.endpoint, method: tool.method },
          enabled:            true,
          riskClassification: "low",
        });
      }
    }

    for (const [role, agentId] of Object.entries(BB_AGENT_IDS) as [keyof typeof BB_AGENT_IDS, string][]) {
      const def = BB_AGENT_DEFS[role];
      const existing = await storage.getAgent(agentId).catch(() => null);

      if (!existing) {
        await db.insert(agents).values({
          id:                agentId,
          name:              def.name,
          description:       def.description,
          systemPrompt:      def.systemPrompt,
          runtimeConfig:     { prompt: def.taskPrompt, scheduleIntervalMinutes: 0 },
          agentType:         "operational",
          status:            "active",
          environment:       "production",
          modelProvider:     "anthropic",
          modelName:         "claude-opus-4-5",
          riskTier:          "MEDIUM",
          autonomyMode:      "autonomous",
          currentVersion:    "1.0.0",
          maxToolIterations: def.maxToolIterations,
          toolAccessClass:   "standard",
          department:        "Vehicle Valuation",
          owner:             "Black Book Data Science Team",
          healthScore:       97,
          successRate:       0.97,
          maturityFactors:   {},
        } as any).onConflictDoNothing();
      } else {
        const needsUpdate = !(existing as any).systemPrompt;
        if (needsUpdate) {
          await db.update(agents)
            .set({
              systemPrompt:      def.systemPrompt,
              runtimeConfig:     { prompt: def.taskPrompt, scheduleIntervalMinutes: 0 },
              maxToolIterations: def.maxToolIterations,
            } as any)
            .where(eq(agents.id, agentId));
        }
      }
    }

    console.log("[bb-live] BB agents and MCP servers ensured successfully");
  } catch (err: any) {
    console.error("[bb-live] ensureBBAgents error:", err?.message);
  }
}

// ─── Deployment helper ─────────────────────────────────────────────────────────

async function ensureBBAgentDeployment(
  agentId: string,
  agentName: string,
  mcpServerIds: string[],
): Promise<string> {
  const deps = await storage.getDeploymentsByAgentId(agentId);
  let deployment = deps[0];

  if (!deployment) {
    deployment = await storage.createDeployment({
      agentId,
      agentName,
      environment:      "production",
      status:           "pending",
      version:          "1.0.0",
      rolloutStrategy:  "canary",
      canaryPercent:    100,
      pipelineComplete: true,
      deployedAt:       new Date(),
    });
  } else if (deployment.status === "deployed") {
    await storage.updateDeployment(deployment.id, { status: "pending" });
  }

  const existingLinks = await storage.getAgentMcpServers(agentId);
  const targetSet = new Set(mcpServerIds.filter(Boolean));

  for (const link of existingLinks) {
    if (!targetSet.has(link.serverId)) await storage.deleteAgentMcpServer(link.id);
  }

  const linkedIds = new Set((await storage.getAgentMcpServers(agentId)).map((l: any) => l.serverId));
  for (const serverId of mcpServerIds) {
    if (serverId && !linkedIds.has(serverId)) {
      await storage.createAgentMcpServer({ agentId, serverId });
    }
  }

  return deployment.id;
}

// ─── SSE live run handler ─────────────────────────────────────────────────────

function extractJson(text: string): Record<string, any> | null {
  const blockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (blockMatch) { try { return JSON.parse(blockMatch[1]); } catch {} }
  const objectMatch = text.match(/\{[\s\S]*\}/);
  if (objectMatch) { try { return JSON.parse(objectMatch[0]); } catch {} }
  return null;
}

function sse(res: Response, event: string, data: object) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  if ((res as any).flush) (res as any).flush();
}

export async function bbLiveRunHandler(req: Request, res: Response): Promise<void> {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  let clientDisconnected = false;
  req.on("close", () => { clientDisconnected = true; });

  sse(res, "run_start", { message: "Black Book pipeline initializing — 4 agents queued" });

  try {
    await ensureBBAgents();
    sse(res, "setup", { message: "BB agents and MCP servers verified" });

    const pipeline: { role: keyof typeof BB_AGENT_IDS; label: string }[] = [
      { role: "dataQualitySentinel", label: "Auction Data Quality Sentinel" },
      { role: "marketShiftDetector",  label: "Market Shift Detector" },
      { role: "competitiveMonitor",   label: "Competitive Intelligence Monitor" },
      { role: "narrativeGenerator",   label: "Narrative Insight Generator" },
    ];

    const resultSummaries: Record<string, any> = {};

    for (const { role, label } of pipeline) {
      if (clientDisconnected) break;

      const agentId = BB_AGENT_IDS[role];
      const def = BB_AGENT_DEFS[role];

      const mcpServerIds = def.mcpServerNames
        .map(n => _bbServerIdByName[n])
        .filter(Boolean);

      const deploymentId = await ensureBBAgentDeployment(agentId, def.name, mcpServerIds);

      sse(res, "agent_start", { agentId, agentName: label, role, deploymentId });

      await stopAgentRuntime(deploymentId);
      await new Promise(r => setTimeout(r, 300));

      const toolEventHandler = (ev: any) => {
        if (ev.agentId !== agentId && ev.deploymentId !== deploymentId) return;
        if (ev.type === "tool_call_result") {
          sse(res, "agent_event", {
            type:      "tool_call_result",
            agentId,
            agentName: label,
            success:   ev.success,
            data: {
              tool:        ev.toolName,
              recordCount: ev.recordCount,
              error:       ev.error,
            },
          });
        } else if (ev.type === "llm_response") {
          sse(res, "agent_event", {
            type:      "llm_response",
            agentId,
            agentName: label,
            data:      { message: "Agent reasoning…" },
          });
        }
      };

      runtimeEvents.on("agent_execution", toolEventHandler);

      let runSuccess = false;
      let resultText = "";

      try {
        await db.update(agents)
          .set({ runtimeConfig: { prompt: def.taskPrompt, scheduleIntervalMinutes: 0 } } as any)
          .where(eq(agents.id, agentId));

        const result = await runAgentOnce(deploymentId, def.taskPrompt);
        runSuccess = result.success;
        resultText = result.message || "";
      } catch (err: any) {
        runSuccess = false;
        resultText = err?.message || "Agent run failed";
      } finally {
        runtimeEvents.off("agent_execution", toolEventHandler);
      }

      const parsed = extractJson(resultText);
      if (parsed) resultSummaries[role] = parsed;

      await storage.updateDeployment(deploymentId, {
        status: runSuccess ? "deployed" : "failed",
        deployedAt: new Date(),
        resultSummary: parsed || { rawOutput: resultText.slice(0, 500) },
      }).catch(() => {});

      sse(res, "agent_complete", { agentId, agentName: label, role, success: runSuccess, resultSummary: parsed });

      if (!clientDisconnected) await new Promise(r => setTimeout(r, 500));
    }

    sse(res, "run_complete", {
      message: "All 4 BB agents completed — traces available in Runs & Traces",
      summaries: resultSummaries,
    });
  } catch (err: any) {
    sse(res, "error", { message: err?.message || "Pipeline error" });
  } finally {
    res.end();
  }
}

// ─── Agent runs list for pipeline header ─────────────────────────────────────

export async function getBBAgentRuns(_req: Request, res: Response): Promise<void> {
  try {
    const agentRoles: { key: keyof typeof BB_AGENT_IDS; label: string; step: number }[] = [
      { key: "dataQualitySentinel", label: "Auction Data Quality Sentinel", step: 1 },
      { key: "marketShiftDetector",  label: "Market Shift Detector",          step: 2 },
      { key: "competitiveMonitor",   label: "Competitive Intelligence Monitor", step: 3 },
      { key: "narrativeGenerator",   label: "Narrative Insight Generator",     step: 4 },
    ];

    const runs = await Promise.all(agentRoles.map(async ({ key, label, step }) => {
      const agentId = BB_AGENT_IDS[key];
      const deps = await storage.getDeploymentsByAgentId(agentId).catch(() => [] as any[]);
      const dep = deps[0];
      return {
        key,
        agentId,
        agentName: label,
        step,
        agentStatus: "active",
        runStatus:   dep?.status || "idle",
        triggerType: "scheduled",
        completedAt: dep?.deployedAt || null,
        resultSummary: dep?.resultSummary || null,
      };
    }));

    res.json({ agentRuns: runs });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
}

// ─── Aggregated dashboard data endpoints ─────────────────────────────────────

export async function getBBOutcomeData(_req: Request, res: Response): Promise<void> {
  res.json({
    outcome: {
      id: "54e4d59e-4bff-4db5-825e-7f0c21c8408f",
      name: "Black Book Valuation Integrity & Market Intelligence",
      description: "End-to-end outcome tracking for Black Book's core value proposition: pricing accuracy, market intelligence speed, and report automation.",
      status: "on-track",
      costToServeMonthly: 4200,
      agentCount: 4,
    },
    kpis: [
      { id: "kpi-001", name: "Anomaly Detection Rate", value: 97.2, target: 95, unit: "%", status: "green", trend: "up", description: "% of true anomalies detected before valuation model update" },
      { id: "kpi-002", name: "False Positive Rate", value: 7.8, target: 10, unit: "%", status: "green", trend: "stable", description: "% of quarantined transactions later found to be valid", lowerIsBetter: true },
      { id: "kpi-003", name: "Market Shift Lead Time", value: 2.8, target: 2, unit: "weeks avg", status: "green", trend: "up", description: "Average weeks of advance notice vs standard weekly report surfacing" },
      { id: "kpi-004", name: "Report Automation", value: 85, target: 80, unit: "%", status: "green", trend: "up", description: "% of weekly report content auto-generated by BB-AGT-004" },
    ],
    confidenceHistory: [
      { week: "Jan W1", score: 71 }, { week: "Jan W3", score: 74 }, { week: "Feb W1", score: 77 },
      { week: "Feb W3", score: 80 }, { week: "Mar W1", score: 84 }, { week: "Mar W3", score: 88 },
      { week: "Apr W1", score: 91 },
    ],
  });
}

export async function getBBSelfHealingStatus(_req: Request, res: Response): Promise<void> {
  res.json({
    healingEvent: {
      id: "HLG-2026-0091",
      triggeredAt: new Date(Date.now() - 14 * 60 * 1000).toISOString(),
      resolvedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      totalResolutionMinutes: 4,
      source: "Manheim Southeast",
      issueType: "API authentication failure",
      rootCause: "OAuth token expired — 401 response from Manheim Southeast API",
      impact: "8,200 daily transactions from this source missing for 4 minutes",
      affectedSegments: ["Full-Size Pickup", "Mid-Size SUV", "Compact Car"],
      affectedRegion: "Southeast",
    },
    stages: [
      { stage: "Detect", status: "complete", timestamp: new Date(Date.now() - 14 * 60 * 1000).toISOString(), detail: "Data feed heartbeat missed — 0 transactions received from Manheim SE for 3 minutes", durationSec: 47 },
      { stage: "Diagnose", status: "complete", timestamp: new Date(Date.now() - 13 * 60 * 1000).toISOString(), detail: "API authentication token expired (confirmed by 401 response). Root cause: 24-hour token TTL not refreshed by cron job.", durationSec: 68 },
      { stage: "Remediate", status: "complete", timestamp: new Date(Date.now() - 12 * 60 * 1000).toISOString(), detail: "Auto-rotated to backup authentication credential. Manheim SE API responding normally. Feed resumed.", durationSec: 23 },
      { stage: "Backfill", status: "complete", timestamp: new Date(Date.now() - 11 * 60 * 1000).toISOString(), detail: "Backfill request queued for 8,200 missed transactions. SE regional valuations flagged with reduced confidence weighting pending full backfill.", durationSec: 82 },
      { stage: "Validate", status: "complete", timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString(), detail: "Feed health score restored to 99.2%. Valuation model confidence weight restored to full after backfill validation.", durationSec: 30 },
    ],
    withoutAlmp: {
      estimatedOutageMinutes: 247,
      affectedValuations: 31000,
      detectionMethod: "Manual — analyst would have noticed missing SE data during weekly review",
    },
  });
}
