import { type Request, type Response } from "express";
import { storage } from "./storage";
import { runAgentOnce, stopAgentRuntime, isRuntimeActive, runtimeEvents } from "./agent-runtime";

const BASE_URL = `http://localhost:${process.env.PORT || 5000}`;

// ─── MCP Server definitions ────────────────────────────────────────────────────

const FITCH_MCP_SERVER_DEFS = [
  {
    name:        "Fitch FFIEC Data Platform",
    description: "FFIEC Call Report data ingestion: quarterly financial metrics, peer benchmarks, CRE concentration data, and loan tape analytics for U.S. banks.",
    url:         `${BASE_URL}/api/mock/fitch-ffiec-data`,
    tools: [
      { name: "get_call_report_data",  description: "Retrieve FFIEC Call Report metrics by bank and period — capital, asset quality, earnings, liquidity, sensitivity.", endpoint: "call-report-data",  method: "GET", inputSchema: { type: "object", properties: { bank_id: { type: "string" }, reporting_period: { type: "string" }, metric_category: { type: "string", enum: ["capital_adequacy","asset_quality","earnings","liquidity","sensitivity"] }, limit: { type: "number" } } } },
      { name: "get_peer_benchmark",    description: "Retrieve peer-group benchmark percentiles for any metric against community/regional bank cohort.", endpoint: "peer-benchmark",    method: "GET", inputSchema: { type: "object", properties: { bank_id: { type: "string" }, asset_size_tier: { type: "string" }, metric: { type: "string" } } } },
      { name: "get_cre_concentration", description: "Retrieve CRE loan portfolio segmentation — multifamily, office, retail, construction — with LTV and delinquency rates.", endpoint: "cre-concentration", method: "GET", inputSchema: { type: "object", properties: { bank_id: { type: "string" }, segment: { type: "string" } } } },
      { name: "get_loan_tape",         description: "Retrieve individual loan-level data: balance, rate type, LTV, DSCR, risk rating, past due status, and geography.", endpoint: "loan-tape",         method: "GET", inputSchema: { type: "object", properties: { bank_id: { type: "string" }, portfolio: { type: "string" }, min_balance: { type: "number" }, limit: { type: "number" } } } },
    ],
  },
  {
    name:        "Fitch NLP Intelligence Engine",
    description: "Natural language processing of earnings call transcripts, SEC filings, and news articles to extract credit-relevant signals and management tone.",
    url:         `${BASE_URL}/api/mock/fitch-nlp-engine`,
    tools: [
      { name: "get_earnings_transcripts", description: "Retrieve earnings call transcript analysis with sentiment scoring, risk phrase detection, and management tone classification.", endpoint: "earnings-call-transcripts", method: "GET", inputSchema: { type: "object", properties: { bank_id: { type: "string" }, quarter: { type: "string" }, sentiment_filter: { type: "string", enum: ["positive","neutral","negative"] } } } },
      { name: "get_sec_filings",          description: "Retrieve SEC 10-K/10-Q/8-K filing analysis with risk factor extraction, new language detection, and auditor flags.", endpoint: "sec-filings",              method: "GET", inputSchema: { type: "object", properties: { bank_id: { type: "string" }, filing_type: { type: "string", enum: ["10-K","10-Q","8-K"] }, flag_filter: { type: "string" } } } },
      { name: "get_news_sentiment",       description: "Retrieve real-time news sentiment analysis — article headlines, sentiment scores, impact level, and topic tags.", endpoint: "news-sentiment",         method: "GET", inputSchema: { type: "object", properties: { bank_id: { type: "string" }, days_back: { type: "number" }, min_relevance: { type: "number" } } } },
    ],
  },
  {
    name:        "Fitch Analytics Engine",
    description: "Composite risk scoring, SVB backtesting data, stress testing, and rating history for U.S. banks.",
    url:         `${BASE_URL}/api/mock/fitch-analytics`,
    tools: [
      { name: "get_early_warning_scores", description: "Retrieve composite CAMELS-derived early warning risk scores for one or all monitored institutions.", endpoint: "early-warning-scores", method: "GET", inputSchema: { type: "object", properties: { bank_id: { type: "string" }, threshold: { type: "number" }, sector_filter: { type: "string" } } } },
      { name: "get_svb_backtest_data",    description: "Retrieve SVB backtesting quarterly data showing how the early warning model would have flagged SVB before failure.", endpoint: "svb-backtest",         method: "GET", inputSchema: { type: "object", properties: {} } },
      { name: "get_stress_test",          description: "Retrieve stress test results under baseline, adverse, and severely adverse scenarios.", endpoint: "stress-test",          method: "GET", inputSchema: { type: "object", properties: { bank_id: { type: "string" }, scenario: { type: "string", enum: ["baseline","adverse","severely_adverse"] } } } },
      { name: "get_rating_history",       description: "Retrieve Fitch historical rating actions and rationale for a bank.", endpoint: "rating-history",        method: "GET", inputSchema: { type: "object", properties: { bank_id: { type: "string" } } } },
    ],
  },
  {
    name:        "Fitch Report Engine",
    description: "Credit assessment report generation: templates, historical reports, compliance checklists, and full package assembly.",
    url:         `${BASE_URL}/api/mock/fitch-report-engine`,
    tools: [
      { name: "get_report_templates",    description: "Retrieve available credit assessment report templates — full package, watch alert, peer comparison, stress test.", endpoint: "report-templates",    method: "GET", inputSchema: { type: "object", properties: { report_type: { type: "string" } } } },
      { name: "get_historical_reports",  description: "Retrieve past credit assessment reports for a bank — rating at publication, analyst, and status.", endpoint: "historical-reports",  method: "GET", inputSchema: { type: "object", properties: { bank_id: { type: "string" }, report_type: { type: "string" }, limit: { type: "number" } } } },
      { name: "generate_report_package", description: "Generate a full credit assessment package using composite scores, CAMELS data, and peer benchmarks.", endpoint: "generate-package",    method: "POST", inputSchema: { type: "object", properties: { bank_id: { type: "string" }, report_type: { type: "string" }, composite_score: { type: "number" }, trend: { type: "string" }, component_scores: { type: "object" } }, required: ["bank_id"] } },
      { name: "get_compliance_checklist", description: "Retrieve regulatory compliance checklist items with pass/fail status.", endpoint: "compliance-checklist", method: "GET", inputSchema: { type: "object", properties: { bank_id: { type: "string" }, checklist_type: { type: "string" } } } },
    ],
  },
];

// ─── Agent definitions ────────────────────────────────────────────────────────

interface FitchAgentDef {
  name: string;
  description: string;
  systemPrompt: string;
  taskPrompt: string;
  mcpServerNames: string[];
  maxToolIterations: number;
}

const FITCH_AGENT_DEFS: Record<string, FitchAgentDef> = {
  ffiec_ingestor: {
    name:        "FFIEC Data Ingestor",
    description: "Ingests and normalizes quarterly FFIEC Call Report data for all monitored U.S. banks, computing CAMELS sub-scores.",
    mcpServerNames: ["Fitch FFIEC Data Platform"],
    maxToolIterations: 8,
    systemPrompt: `You are the FFIEC Data Ingestor for Fitch's Asset Quality Early Warning System. Your role is to ingest and normalize quarterly regulatory data for the bank portfolio.

Your task sequence:
1. Call get_call_report_data with the target bank_id and metric_category="capital_adequacy" to retrieve capital ratios
2. Call get_call_report_data again with metric_category="asset_quality" for NPL ratios and classified assets
3. Call get_call_report_data with metric_category="liquidity" for funding structure
4. Call get_peer_benchmark to obtain peer comparisons for key metrics

After calling these tools, analyze the data and produce a comprehensive CAMELS sub-score summary.

IMPORTANT: End your final response with ONLY this JSON block:
\`\`\`json
{
  "banksIngested": 847,
  "quartersProcessed": 4,
  "totalDataPoints": 24800,
  "camelsScoringComplete": true,
  "avgCapitalRatio": 11.4,
  "avgNplRatio": 0.82,
  "watchListCount": 23,
  "dataQualityScore": 98.4,
  "ingestDurationSeconds": 142,
  "topWatchFlags": ["cre_concentration", "liquidity_pressure", "earnings_decline"],
  "portfolioBreakdown": {
    "low_risk": 512,
    "medium_risk": 298,
    "high_risk": 31,
    "critical": 6
  }
}
\`\`\`
Adjust numbers to be consistent with what the tool data shows. watchListCount should be realistic (< 5% of total).`,
    taskPrompt: "Run the FFIEC data ingestion cycle. Call get_call_report_data for capital_adequacy and asset_quality categories, then get_peer_benchmark for tier comparison. Produce the ingestion summary JSON.",
  },

  ratio_engine: {
    name:        "Financial Ratio Engine",
    description: "Computes derived financial ratios and trend vectors from raw Call Report data, flagging statistical anomalies.",
    mcpServerNames: ["Fitch FFIEC Data Platform", "Fitch Analytics Engine"],
    maxToolIterations: 8,
    systemPrompt: `You are the Financial Ratio Engine for Fitch's Asset Quality Early Warning System. You compute derived financial ratios, detect trend breaks, and flag anomalies across the monitored bank portfolio.

Your task sequence:
1. Call get_call_report_data with metric_category="earnings" for profitability metrics
2. Call get_call_report_data with metric_category="sensitivity" for interest rate risk data
3. Call get_cre_concentration to assess commercial real estate portfolio segmentation
4. Call get_early_warning_scores to see current portfolio risk distribution

Analyze the data, compute trend vectors (QoQ and YoY changes), and flag statistical outliers.

IMPORTANT: End your final response with ONLY this JSON block:
\`\`\`json
{
  "ratiosComputed": 18,
  "banksAnalyzed": 847,
  "anomaliesDetected": 14,
  "trendBreaks": 8,
  "avgNim": 3.12,
  "avgRoa": 0.98,
  "avgEfficiencyRatio": 64.2,
  "creConcentrationBreach": 31,
  "rateRiskFlags": 19,
  "keyTrends": {
    "nimCompression": -0.18,
    "nplDrift": 0.12,
    "provisioning": "increasing",
    "capitalAccretion": "stable"
  },
  "outliers": [
    { "bank_id": "RSSD-3511777", "metric": "liquidity_risk", "zscore": 4.2, "direction": "deteriorating" },
    { "bank_id": "RSSD-1029867", "metric": "cre_concentration", "zscore": 3.1, "direction": "deteriorating" }
  ]
}
\`\`\`
Make the outliers realistic — use the actual bank IDs from the data.`,
    taskPrompt: "Run the financial ratio computation cycle. Call get_call_report_data for earnings and sensitivity metrics, get_cre_concentration for portfolio segmentation, and get_early_warning_scores for baseline risk view. Produce the ratio engine JSON output.",
  },

  transcript_analyst: {
    name:        "Transcript & Filing Analyst",
    description: "Parses earnings call transcripts and SEC filings to detect management tone shifts, new risk disclosures, and regulatory flags.",
    mcpServerNames: ["Fitch NLP Intelligence Engine"],
    maxToolIterations: 8,
    systemPrompt: `You are the Transcript & Filing Analyst for Fitch's Asset Quality Early Warning System. You use NLP to extract credit-relevant signals from management communications and regulatory filings.

Your task sequence:
1. Call get_earnings_transcripts for the target bank to retrieve recent earnings call sentiment
2. Call get_sec_filings to check for new risk language, material weaknesses, and going concern flags
3. Call get_earnings_transcripts with a second bank for comparison

Analyze management tone, detect new risk disclosures, and flag any "hedging language" shifts.

IMPORTANT: End your final response with ONLY this JSON block:
\`\`\`json
{
  "transcriptsAnalyzed": 312,
  "filingsProcessed": 847,
  "avgSentimentScore": -0.12,
  "negativeShifts": 28,
  "materialWeaknessFlags": 3,
  "goingConcernFlags": 1,
  "newRiskLanguage": 41,
  "defensiveToneCount": 19,
  "topRiskPhrases": ["CRE concentration", "deposit outflows", "unrealized losses", "liquidity pressure"],
  "sentimentByCategory": {
    "capital": 0.08,
    "asset_quality": -0.31,
    "liquidity": -0.24,
    "management_outlook": -0.09
  }
}
\`\`\`
Numbers should be consistent with what the NLP tools return. Sentiment scores in range [-1, 1].`,
    taskPrompt: "Run the transcript and filing NLP analysis. Call get_earnings_transcripts for key banks and get_sec_filings to detect new risk disclosures. Produce the NLP analysis JSON summary.",
  },

  news_processor: {
    name:        "News Signal Processor",
    description: "Continuously monitors financial news for credit-relevant events, sentiment shifts, and regulatory developments.",
    mcpServerNames: ["Fitch NLP Intelligence Engine", "Fitch Analytics Engine"],
    maxToolIterations: 7,
    systemPrompt: `You are the News Signal Processor for Fitch's Asset Quality Early Warning System. You monitor real-time news and market signals to detect credit-relevant events before they appear in regulatory filings.

Your task sequence:
1. Call get_news_sentiment to retrieve recent news sentiment for the bank portfolio
2. Call get_rating_history to cross-reference news events with past rating actions
3. Call get_news_sentiment with days_back=7 for the most recent high-impact signals

Identify market intelligence that may lead the regulatory data by 1–3 quarters.

IMPORTANT: End your final response with ONLY this JSON block:
\`\`\`json
{
  "articlesScanned": 2840,
  "relevantArticles": 412,
  "avgMarketSentiment": -0.18,
  "negativeSignals": 89,
  "positiveSignals": 47,
  "highImpactEvents": 7,
  "regulatoryMentions": 31,
  "eventsByType": {
    "earnings": 142,
    "regulatory": 68,
    "market_event": 89,
    "credit_action": 23
  },
  "topNegativeBanks": ["RSSD-3511777", "RSSD-1029867", "RSSD-1462895"],
  "leadingIndicators": [
    { "signal": "Deposit outflow language increasing", "banks_affected": 8, "lead_time_quarters": 2 },
    { "signal": "CRE loss mention surge", "banks_affected": 12, "lead_time_quarters": 1 }
  ]
}
\`\`\`
Keep articlesScanned plausible (hundreds to low thousands). Use real bank IDs in topNegativeBanks.`,
    taskPrompt: "Run the news signal processing cycle. Call get_news_sentiment for portfolio-wide coverage and get_rating_history for context. Produce the news signal JSON summary.",
  },

  risk_scorer: {
    name:        "Composite Risk Scorer",
    description: "Fuses CAMELS sub-scores, NLP sentiment, and market signals into a composite early warning score for each bank.",
    mcpServerNames: ["Fitch Analytics Engine"],
    maxToolIterations: 8,
    systemPrompt: `You are the Composite Risk Scorer for Fitch's Asset Quality Early Warning System. You fuse all upstream signal streams into a composite CAMELS-enhanced risk score for each institution.

Your task sequence:
1. Call get_early_warning_scores with threshold=0 to retrieve all current scores
2. Call get_stress_test for the top-risk institution to validate under adverse conditions
3. Call get_svb_backtest_data to verify that the model's SVB signal would have triggered at appropriate time

Compute final composite scores, rank institutions by risk, and identify any requiring immediate escalation.

IMPORTANT: End your final response with ONLY this JSON block:
\`\`\`json
{
  "scoringComplete": true,
  "institutionsScored": 847,
  "criticalRisk": 6,
  "highRisk": 31,
  "mediumRisk": 298,
  "lowRisk": 512,
  "avgCompositeScore": 28.4,
  "svbBacktestValidated": true,
  "svbEarlyWarningQuarter": "2022-Q3",
  "svbDaysAdvanceWarning": 182,
  "topRiskInstitutions": [
    { "bank_id": "RSSD-3511777", "name": "Silicon Valley Bank", "score": 87.3, "trend": "deteriorating", "primary_driver": "liquidity_risk" },
    { "bank_id": "RSSD-1029867", "name": "Pacific Western Bank",  "score": 61.2, "trend": "deteriorating", "primary_driver": "asset_quality" },
    { "bank_id": "RSSD-1462895", "name": "Signature Bank",       "score": 54.8, "trend": "deteriorating", "primary_driver": "cre_concentration" }
  ],
  "modelAccuracy": { "precision": 0.91, "recall": 0.87, "auc_roc": 0.94, "backtestPeriod": "2018-2024" }
}
\`\`\`
Use actual bank IDs and names from the data. SVB score should be the highest (> 80) to dramatize the backtest finding.`,
    taskPrompt: "Run the composite risk scoring cycle. Call get_early_warning_scores for the full portfolio, get_stress_test for high-risk banks, and get_svb_backtest_data to validate the SVB signal. Produce the composite scoring JSON.",
  },

  report_generator: {
    name:        "Assessment Report Generator",
    description: "Assembles full credit assessment packages including CAMELS narrative, peer comparison tables, and rating recommendation.",
    mcpServerNames: ["Fitch Report Engine", "Fitch Analytics Engine"],
    maxToolIterations: 8,
    systemPrompt: `You are the Assessment Report Generator for Fitch's Asset Quality Early Warning System. You assemble full credit assessment packages for flagged institutions, ready for analyst review.

Your task sequence:
1. Call get_report_templates to retrieve the available assessment package formats
2. Call get_compliance_checklist for a flagged bank to assess regulatory compliance status
3. Call get_historical_reports for context on prior assessments
4. Call generate_report_package with the composite score and trend data to produce the full assessment

Produce well-structured credit assessment packages ready for senior analyst review.

IMPORTANT: End your final response with ONLY this JSON block:
\`\`\`json
{
  "packagesGenerated": 37,
  "watchAlerts": 6,
  "fullAssessments": 31,
  "avgTurnaroundHours": 2.4,
  "analystHoursSaved": 412,
  "ratingActions": {
    "upgraded": 3,
    "downgraded": 8,
    "watch_negative": 6,
    "affirmed": 20
  },
  "topPackage": {
    "bank_id": "RSSD-3511777",
    "bank_name": "Silicon Valley Bank",
    "rating": "BB",
    "action": "Rating Watch Negative",
    "outlook": "Negative",
    "analyst": "J. Peterson",
    "pages": 28
  },
  "totalPagesGenerated": 1014,
  "processingTimeSec": 84
}
\`\`\`
packagesGenerated should be < 50. ratingActions should sum to packagesGenerated. Keep numbers consistent.`,
    taskPrompt: "Run the report generation cycle. Call get_report_templates, get_compliance_checklist for a flagged bank, and generate_report_package with composite scores. Produce the report generation JSON summary.",
  },
};

// ─── Module-level ID cache ────────────────────────────────────────────────────

const _fitchServerIdByName: Record<string, string> = {};
const _fitchAgentIdByName: Record<string, string> = {};

export function getFitchAgentIdByName(name: string): string | undefined {
  return _fitchAgentIdByName[name];
}

// ─── Helper: extract JSON from LLM output ────────────────────────────────────

function extractJson(text: string): Record<string, any> | null {
  const blockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (blockMatch) {
    try { return JSON.parse(blockMatch[1]); } catch {}
  }
  const objectMatch = text.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    try { return JSON.parse(objectMatch[0]); } catch {}
  }
  return null;
}

// ─── Ensure Fitch Agents & MCP Servers ───────────────────────────────────────

export async function ensureFitchAgents(): Promise<void> {
  try {
    const allServers = await storage.getMcpServers().catch(() => [] as any[]);

    for (const serverDef of FITCH_MCP_SERVER_DEFS) {
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
          addedBy:       "fitch-live-demo",
          capabilities:  { tools: true, resources: false, prompts: false, sampling: false },
          serverInfo:    { vendor: "Fitch Ratings", version: "1.0.0" },
        });
      } else if (server.url !== serverDef.url) {
        await storage.updateMcpServer(server.id, { url: serverDef.url });
      }

      _fitchServerIdByName[serverDef.name] = server.id;

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
          requiresApproval:   false,
        });
      }
    }

    const allAgents = await storage.getAgents().catch(() => [] as any[]);

    for (const [, def] of Object.entries(FITCH_AGENT_DEFS)) {
      let agent = allAgents.find((a: any) => a.name === def.name);

      if (!agent) {
        agent = await storage.createAgent({
          name:              def.name,
          description:       def.description,
          systemPrompt:      def.systemPrompt,
          runtimeConfig:     { prompt: def.taskPrompt, scheduleIntervalMinutes: 0 },
          agentType:         "single",
          status:            "active",
          environment:       "production",
          modelProvider:     "openai",
          modelName:         "gpt-4.1",
          riskTier:          "MEDIUM",
          autonomyMode:      "autonomous",
          currentVersion:    "1.0.0",
          maxToolIterations: def.maxToolIterations,
          toolAccessClass:   "standard",
          department:        "Credit Analytics",
          owner:             "Fitch Ratings — Structured Finance",
          healthScore:       98,
          successRate:       0.97,
          maturityFactors:   {},
        } as any);
      } else {
        const needsUpdate = (agent as any).modelProvider !== "openai" || (agent as any).modelName !== "gpt-4.1" || !(agent as any).systemPrompt;
        if (needsUpdate) {
          await storage.updateAgent((agent as any).id, {
            modelProvider:     "openai",
            modelName:         "gpt-4.1",
            systemPrompt:      def.systemPrompt,
            runtimeConfig:     { prompt: def.taskPrompt, scheduleIntervalMinutes: 0 },
            maxToolIterations: def.maxToolIterations,
          } as any);
        }
      }

      _fitchAgentIdByName[def.name] = (agent as any).id;
    }

    console.log("[fitch-live] Agents and MCP servers ensured successfully");
  } catch (err: any) {
    console.error("[fitch-live] ensureFitchAgents error:", err?.message);
  }
}

// ─── Deployment helper ────────────────────────────────────────────────────────

async function ensureFitchDeployment(agentId: string, agentName: string, mcpServerIds: string[]): Promise<string> {
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
  const targetSet = new Set(mcpServerIds);

  for (const link of existingLinks) {
    if (!targetSet.has(link.serverId)) {
      await storage.deleteAgentMcpServer(link.id);
    }
  }

  const linkedIds = new Set(
    existingLinks.filter((l: any) => targetSet.has(l.serverId)).map((l: any) => l.serverId)
  );
  for (const sid of mcpServerIds) {
    if (!linkedIds.has(sid)) {
      await storage.createAgentMcpServer({ agentId, serverId: sid, assignedBy: "fitch-live-demo" });
    }
  }

  return deployment.id;
}

// ─── SSE Live Run Handler ─────────────────────────────────────────────────────

export async function fitchLiveRunHandler(req: Request, res: Response): Promise<void> {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.flushHeaders();

  const sendEvent = (eventType: string, payload: object) => {
    try { res.write(`event: ${eventType}\ndata: ${JSON.stringify(payload)}\n\n`); } catch {}
  };

  let aborted = false;
  const keepaliveTimer = setInterval(() => {
    if (aborted) { clearInterval(keepaliveTimer); return; }
    try { res.write(": keepalive\n\n"); } catch { clearInterval(keepaliveTimer); }
  }, 15_000);

  let currentAgentName = "unknown";
  const fitchDeploymentIds = new Set<string>();

  const onRuntimeEvent = (evt: { deploymentId: string; agentId: string; runId: string; result: any }) => {
    if (aborted) return;
    if (!fitchDeploymentIds.has(evt.deploymentId)) return;

    const steps: any[] = evt.result?.steps ?? [];
    const toolCallSteps = steps.filter((s: any) => s.type === "api_call");

    for (const step of toolCallSteps) {
      const tool = step.mcpTool || step.name || "unknown_tool";
      const success = step.status === "completed" || step.status === "passed";
      const responseData = step.output?.data ?? step.output ?? null;

      sendEvent("agent_event", {
        agentName: currentAgentName,
        type:      "tool_call_result",
        tool,
        data: {
          tool,
          success,
          error:       success ? null : (step.error || "failed"),
          serverName:  step.mcpServer || null,
          recordCount: responseData?.record_count ?? responseData?.count ?? null,
        },
        success,
      });
    }

    if (toolCallSteps.length === 0) {
      sendEvent("agent_event", {
        agentName: currentAgentName,
        type:      "final_analysis",
        data:      { steps: steps.length, success: evt.result?.success },
        success:   evt.result?.success,
      });
    }
  };

  runtimeEvents.on("agent_execution", onRuntimeEvent);
  req.on("close", () => {
    aborted = true;
    clearInterval(keepaliveTimer);
    runtimeEvents.off("agent_execution", onRuntimeEvent);
  });

  try {
    sendEvent("run_start", { message: "Starting Fitch Asset Quality Early Warning System pipeline..." });

    sendEvent("setup", { message: "Ensuring 6 pipeline agents and 4 MCP servers are registered..." });
    await ensureFitchAgents();
    sendEvent("setup", { message: "All 6 pipeline agents ready with 4 MCP servers (15 tools)" });

    const agentOrder = [
      "ffiec_ingestor",
      "ratio_engine",
      "transcript_analyst",
      "news_processor",
      "risk_scorer",
      "report_generator",
    ];

    const deploymentIds: Record<string, string> = {};

    for (const role of agentOrder) {
      const def = FITCH_AGENT_DEFS[role];
      const agentId = _fitchAgentIdByName[def.name];
      if (!agentId) continue;

      const mcpServerIds = def.mcpServerNames.map(n => _fitchServerIdByName[n]).filter(Boolean);
      const depId = await ensureFitchDeployment(agentId, def.name, mcpServerIds);
      deploymentIds[role] = depId;
      fitchDeploymentIds.add(depId);
    }

    sendEvent("setup", { message: "Deployments configured — executing assessment pipeline..." });

    // Accumulate resultSummaries from each agent for downstream context injection
    const priorSummaries: Record<string, Record<string, any>> = {};

    for (const role of agentOrder) {
      if (aborted) break;

      const def = FITCH_AGENT_DEFS[role];
      const agentId = _fitchAgentIdByName[def.name];
      if (!agentId) {
        sendEvent("agent_error", { role, message: `Agent not found for role ${role}` });
        continue;
      }

      currentAgentName = def.name;
      const deploymentId = deploymentIds[role];

      sendEvent("agent_start", { agentId, agentName: def.name, role, deploymentId });

      if (isRuntimeActive(deploymentId)) {
        stopAgentRuntime(deploymentId);
        await new Promise(r => setTimeout(r, 300));
      }

      // Build task prompt — inject prior summaries for composite scorer and report generator
      let taskPrompt = def.taskPrompt;
      if ((role === "risk_scorer" || role === "report_generator") && Object.keys(priorSummaries).length > 0) {
        const context = Object.entries(priorSummaries)
          .map(([r, s]) => `[${r}]: ${JSON.stringify(s)}`)
          .join("\n");
        taskPrompt = `PRIOR AGENT OUTPUTS:\n${context}\n\nYOUR TASK:\n${def.taskPrompt}`;
      }

      const result = await runAgentOnce(deploymentId, taskPrompt, def.maxToolIterations);

      if (result.message) {
        const parsed = extractJson(result.message);
        if (parsed) {
          // Store in prior summaries for downstream agents
          priorSummaries[role] = parsed;
          try {
            const runs = await storage.getAgentRuntimeRuns(agentId);
            if (runs.length > 0) {
              const latestRun = runs[runs.length - 1];
              await storage.updateAgentRuntimeRun(latestRun.id, { resultSummary: parsed });
            }
          } catch (e: any) {
            console.warn("[fitch-live] Could not update resultSummary:", e?.message);
          }
        }
      }

      sendEvent("agent_complete", {
        agentId,
        agentName: def.name,
        role,
        success:       result.success,
        message:       result.message?.slice(0, 400),
        resultSummary: priorSummaries[role] ?? null,
      });
    }

    sendEvent("run_complete", {
      success: true,
      message: "All 6 assessment pipeline agents completed — credit packages available in Runs & Traces",
    });
  } catch (err: any) {
    console.error("[fitch-live-run] Error:", err?.message);
    sendEvent("error", { message: err?.message || "Live pipeline run failed" });
  } finally {
    clearInterval(keepaliveTimer);
    runtimeEvents.off("agent_execution", onRuntimeEvent);
    if (!aborted) res.end();
  }
}
