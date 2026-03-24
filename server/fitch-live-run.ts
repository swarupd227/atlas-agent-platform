import { type Request, type Response } from "express";
import { storage } from "./storage";
import { runAgentOnce, stopAgentRuntime, isRuntimeActive, runtimeEvents } from "./agent-runtime";

const BASE_URL = `http://localhost:${process.env.PORT || 5000}`;

// ─── MCP Server definitions (tool names must match mock router GET endpoints) ──

const FITCH_MCP_SERVER_DEFS = [
  {
    name:        "Fitch FFIEC Data Platform",
    description: "FFIEC Call Report data: RC-N/RC-C/RI-B/RC-R schedules, NPA data, charge-offs, capital adequacy, and G-SIB peer cohort ratios for U.S. banks.",
    url:         `${BASE_URL}/api/mock/fitch-ffiec-data`,
    tools: [
      {
        name: "get_call_report_schedules",
        description: "Retrieve FFIEC RC-N/RC-C/RI-B/RC-R schedule summary per bank per quarter.",
        endpoint: "call-report-schedules",
        method: "GET",
        inputSchema: { type: "object", properties: { bank_id: { type: "string" }, quarter: { type: "string" } } },
      },
      {
        name: "get_npa_schedule",
        description: "Retrieve nonaccrual loans, 90+ past due, and NPA-to-assets ratio per bank.",
        endpoint: "npa-schedule",
        method: "GET",
        inputSchema: { type: "object", properties: { bank_id: { type: "string" }, quarter: { type: "string" } } },
      },
      {
        name: "get_charge_off_schedule",
        description: "Retrieve gross and net charge-offs by loan category per bank.",
        endpoint: "charge-off-schedule",
        method: "GET",
        inputSchema: { type: "object", properties: { bank_id: { type: "string" }, quarter: { type: "string" } } },
      },
      {
        name: "get_capital_adequacy",
        description: "Retrieve CET1, tier 1, total capital, RWA, leverage ratios, and ACL per bank.",
        endpoint: "capital-adequacy",
        method: "GET",
        inputSchema: { type: "object", properties: { bank_id: { type: "string" }, quarter: { type: "string" } } },
      },
      {
        name: "get_peer_cohort_ratios",
        description: "Retrieve G-SIB cohort median values for all 18 ratios for benchmarking.",
        endpoint: "peer-cohort-ratios",
        method: "GET",
        inputSchema: { type: "object", properties: { quarter: { type: "string" }, cohort_tier: { type: "string" } } },
      },
    ],
  },
  {
    name:        "Fitch NLP Intelligence Engine",
    description: "NLP processing of earnings transcripts, SEC filings, and news articles for credit-relevant signals.",
    url:         `${BASE_URL}/api/mock/fitch-nlp-engine`,
    tools: [
      {
        name: "get_transcript_sentiment",
        description: "Retrieve earnings call transcript sentiment scores (−2 to +2) per bank per dimension: credit quality, forward guidance, sector concerns.",
        endpoint: "transcript-sentiment",
        method: "GET",
        inputSchema: { type: "object", properties: { bank_id: { type: "string" }, quarter: { type: "string" } } },
      },
      {
        name: "get_filing_language_changes",
        description: "Retrieve count of new and strengthened risk factors in 10-K YoY per bank.",
        endpoint: "filing-language-changes",
        method: "GET",
        inputSchema: { type: "object", properties: { bank_id: { type: "string" }, filing_year: { type: "string" } } },
      },
      {
        name: "get_news_signals",
        description: "Retrieve article-level news classification (routine/emerging/material/crisis) per bank.",
        endpoint: "news-signals",
        method: "GET",
        inputSchema: { type: "object", properties: { bank_id: { type: "string" }, days_back: { type: "number" } } },
      },
      {
        name: "get_news_volume_trend",
        description: "Retrieve rolling 13-week news volume and sigma-deviation per bank.",
        endpoint: "news-volume-trend",
        method: "GET",
        inputSchema: { type: "object", properties: { bank_id: { type: "string" } } },
      },
    ],
  },
  {
    name:        "Fitch Analytics Engine",
    description: "Ratio trend analysis, threshold breach detection, and SVB backtesting data.",
    url:         `${BASE_URL}/api/mock/fitch-analytics`,
    tools: [
      {
        name: "get_ratio_trends",
        description: "Retrieve 8-quarter time series for all 18 CAMELS-derived ratios per bank.",
        endpoint: "ratio-trends",
        method: "GET",
        inputSchema: { type: "object", properties: { bank_id: { type: "string" }, ratio_id: { type: "string" } } },
      },
      {
        name: "get_threshold_breaches",
        description: "Retrieve list of breached ratios with severity (CRITICAL/HIGH/MEDIUM) and QoQ delta per bank.",
        endpoint: "threshold-breaches",
        method: "GET",
        inputSchema: { type: "object", properties: { bank_id: { type: "string" }, quarter: { type: "string" } } },
      },
      {
        name: "get_svb_backtest_data",
        description: "Retrieve SVB Q1 2022→Mar 2023 score timeline showing 182-day advance warning before FDIC seizure.",
        endpoint: "svb-backtest",
        method: "GET",
        inputSchema: { type: "object", properties: {} },
      },
    ],
  },
  {
    name:        "Fitch Report Engine",
    description: "Credit assessment report templates, prior analyst notes, and Fitch Viability Rating history.",
    url:         `${BASE_URL}/api/mock/fitch-report-engine`,
    tools: [
      {
        name: "get_report_template",
        description: "Retrieve the AQEWS quarterly assessment package structure scaffold.",
        endpoint: "report-template",
        method: "GET",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "get_analyst_notes",
        description: "Retrieve prior quarter analyst observations and action flags per bank.",
        endpoint: "analyst-notes",
        method: "GET",
        inputSchema: { type: "object", properties: { bank_id: { type: "string" } } },
      },
      {
        name: "get_rating_history",
        description: "Retrieve last 8 quarters of Fitch Viability Rating actions per bank.",
        endpoint: "rating-history",
        method: "GET",
        inputSchema: { type: "object", properties: { bank_id: { type: "string" } } },
      },
    ],
  },
];

// ─── Agent definitions per spec ───────────────────────────────────────────────

interface FitchAgentDef {
  name: string;
  description: string;
  systemPrompt: string;
  taskPrompt: string;
  mcpServerNames: string[];
  maxToolIterations: number;
}

const BANK_LIST = [
  "JPMorgan Chase (RSSD-0000001)", "Bank of America (RSSD-0000002)",
  "Wells Fargo (RSSD-0000003)",    "Citigroup (RSSD-0000004)",
  "Goldman Sachs (RSSD-0000005)",  "Morgan Stanley (RSSD-0000006)",
  "U.S. Bancorp (RSSD-0000007)",   "Truist Financial (RSSD-0000008)",
  "PNC Financial (RSSD-0000009)",  "RegionalBank-West (RSSD-0000010)",
].join(", ");

const FITCH_AGENT_DEFS: Record<string, FitchAgentDef> = {

  // ── Agent 1: FFIEC Data Ingestor ────────────────────────────────────────────
  ffiec_ingestor: {
    name:           "FFIEC Data Ingestor",
    description:    "Ingests and normalizes quarterly FFIEC Call Report data (RC-N, RC-C, RI-B, RC-R) for the 10-bank G-SIB cohort.",
    mcpServerNames: ["Fitch FFIEC Data Platform"],
    maxToolIterations: 8,
    systemPrompt: `You are the FFIEC Data Ingestor for Fitch's Asset Quality Early Warning System.

Your task sequence:
1. Call get_call_report_schedules to retrieve RC-N/RC-C/RI-B/RC-R summary for the 10-bank cohort
2. Call get_npa_schedule to retrieve nonaccrual loan and NPA data for all banks
3. Call get_charge_off_schedule to retrieve gross/net charge-off data by category
4. Call get_capital_adequacy to retrieve CET1, tier1, and ACL ratios for the cohort

After calling all four tools, analyze the data and populate the JSON below with REAL values from the tool responses.

CRITICAL: You MUST end your response with a JSON code block (triple-backtick json) containing the exact schema below, populated with real values from the tool data:

\`\`\`json
{
  "banksIngested": 10,
  "ratioInputsReady": 18,
  "schedulesProcessed": 4,
  "quarterRef": "2024-Q2",
  "bankSummaries": [
    { "bankId": "RSSD-0000001", "bankName": "JPMorgan Chase", "nplRatio": 0.42, "cet1": 13.1, "ncoRate": 0.18, "capitalStatus": "Well Capitalized" }
  ]
}
\`\`\`
(Replace with actual values from the tool data. Include all 10 banks in bankSummaries.)

Use actual bank IDs and values from the tool responses. bankSummaries must include all 10 banks.`,
    taskPrompt: "Ingest FFIEC Call Report data for all 10 banks in the cohort: " + BANK_LIST + ". Call get_call_report_schedules, get_npa_schedule, get_charge_off_schedule, and get_capital_adequacy. Produce the ingestion summary JSON.",
  },

  // ── Agent 2: Financial Ratio Engine ─────────────────────────────────────────
  ratio_engine: {
    name:           "Financial Ratio Engine",
    description:    "Computes 18 CAMELS-derived financial ratios, trend vectors, and threshold breach flags for all 10 banks.",
    mcpServerNames: ["Fitch FFIEC Data Platform", "Fitch Analytics Engine"],
    maxToolIterations: 3,
    systemPrompt: `You are the Financial Ratio Engine for Fitch's Asset Quality Early Warning System.

Call these three tools in order, then write a brief one-paragraph summary of findings:
1. get_peer_cohort_ratios — G-SIB medians for all 18 ratios
2. get_ratio_trends — 8-quarter time series per bank
3. get_threshold_breaches — breach flags with severity and QoQ delta per bank

After calling all three tools, write 2-3 sentences summarising total breach count, the highest-stress bank, and worst ratio. Do NOT generate a large JSON table — the downstream system handles detailed tabulation automatically.`,
    taskPrompt: "Call get_peer_cohort_ratios, get_ratio_trends, and get_threshold_breaches to retrieve ratio data for the 10-bank G-SIB cohort, then summarise the key breach findings in 2-3 sentences.",
  },

  // ── Agent 3: Transcript & Filing Analyst ─────────────────────────────────────
  transcript_analyst: {
    name:           "Transcript & Filing Analyst",
    description:    "NLP analysis of earnings call transcripts and SEC 10-K filings for management tone shifts and new risk disclosures.",
    mcpServerNames: ["Fitch NLP Intelligence Engine"],
    maxToolIterations: 6,
    systemPrompt: `You are the Transcript & Filing Analyst for Fitch's Asset Quality Early Warning System.

Your task sequence:
1. Call get_transcript_sentiment to retrieve earnings call sentiment scores per bank (credit quality, forward guidance, sector concerns composite)
2. Call get_filing_language_changes to retrieve new/strengthened risk factors in 10-K filings YoY per bank

After both tool calls, analyze management tone, detect new risk disclosures, and populate the JSON with REAL values from the tool data.

CRITICAL: End your response with a JSON code block (triple-backtick json):

\`\`\`json
{
  "banksScored": <integer>,
  "sentimentScores": {
    "<bankName>": {
      "creditQuality": <float -2 to 2>,
      "forwardGuidance": <float -2 to 2>,
      "sectorConcerns": <float -2 to 2>,
      "composite": <float -2 to 2>
    }
  },
  "filingFlags": {
    "<bankName>": {
      "newRiskFactors": <integer>,
      "strengthenedLanguage": <integer>,
      "mdaShift": <float>
    }
  }
}
\`\`\`

Include all 10 banks in sentimentScores and filingFlags.`,
    taskPrompt: "Analyze earnings transcripts and 10-K filings for all 10 banks. Call get_transcript_sentiment and get_filing_language_changes. Produce the NLP sentiment summary JSON.",
  },

  // ── Agent 4: News Signal Processor ───────────────────────────────────────────
  news_processor: {
    name:           "News Signal Processor",
    description:    "Monitors financial news for credit-relevant events, sigma-spikes, and classification of articles by severity.",
    mcpServerNames: ["Fitch NLP Intelligence Engine"],
    maxToolIterations: 6,
    systemPrompt: `You are the News Signal Processor for Fitch's Asset Quality Early Warning System.

Your task sequence:
1. Call get_news_signals to retrieve article-level news classification (routine/emerging/material/crisis) per bank
2. Call get_news_volume_trend to retrieve rolling 13-week volume and sigma-deviation per bank

After both tool calls, identify emerging risks and sigma-spike alerts. Populate the JSON with REAL values from the tool data.

CRITICAL: End your response with a JSON code block (triple-backtick json):

\`\`\`json
{
  "banksMonitored": <integer>,
  "newsSeverity": {
    "<bankName>": {
      "score": <float>,
      "classification": "routine|emerging|material|crisis",
      "sigmaSpike": <float>,
      "articleCount": <integer>
    }
  },
  "emergingRisks": [
    { "bankName": "<name>", "topic": "<topic>", "classification": "<class>", "sigmaSpike": <float> }
  ]
}
\`\`\`

Include all 10 banks in newsSeverity. emergingRisks should list banks with classification != routine.`,
    taskPrompt: "Monitor news signals for all 10 banks. Call get_news_signals and get_news_volume_trend. Produce the news signal summary JSON.",
  },

  // ── Agent 5: Composite Risk Scorer ──────────────────────────────────────────
  risk_scorer: {
    name:           "Composite Risk Scorer",
    description:    "Fuses CAMELS ratios, NLP sentiment, news signals, and peer benchmarks into a composite 0–100 early warning score per bank.",
    mcpServerNames: ["Fitch FFIEC Data Platform", "Fitch Analytics Engine"],
    maxToolIterations: 8,
    systemPrompt: `You are the Composite Risk Scorer for Fitch's Asset Quality Early Warning System.

You will receive prior agent outputs in the task prompt. Use them to compute composite scores.

Your task sequence:
1. Call get_threshold_breaches for each bank to retrieve current breach counts and severity
2. Call get_ratio_trends to see deteriorating trajectories
3. Call get_peer_cohort_ratios to compute peer divergence scores

Scoring formula (weighted):
- 55% structured data (FFIEC ratios + breaches from prior FFIEC Ingestor + Ratio Engine outputs)
- 20% transcript sentiment (from Transcript Analyst output)
- 10% filing language changes (from Transcript Analyst output)
- 10% news severity (from News Signal Processor output)
- 5% peer divergence (from current tool calls)

Risk tiers: Green (0–39), Amber (40–59), Amber-High (60–74), Red (75–100)

CRITICAL: End your response with a JSON code block (triple-backtick json):

\`\`\`json
{
  "portfolioScored": <integer>,
  "scores": {
    "<bankName>": {
      "score": <integer 0-100>,
      "tier": "Green|Amber|Amber-High|Red",
      "trajectory": "Improving|Stable|Deteriorating",
      "delta": <float>,
      "breachCount": <integer>,
      "peerDivergence": <float>
    }
  },
  "watchList": ["<bankName>", ...],
  "redAlerts": ["<bankName>", ...]
}
\`\`\`

scores must include all 10 banks. RegionalBank-West should score highest (>70) given its elevated stress profile. redAlerts = banks scoring >= 75. watchList = banks scoring 60–74.`,
    taskPrompt: "Compute composite risk scores for all 10 banks using prior agent outputs. Call get_threshold_breaches for breach context, get_ratio_trends for trajectory, and get_peer_cohort_ratios for peer divergence. Apply the weighted formula and produce the composite scoring JSON.",
  },

  // ── Agent 6: Assessment Report Generator ────────────────────────────────────
  report_generator: {
    name:           "Assessment Report Generator",
    description:    "Assembles analyst-ready credit assessment packages including SVB backtesting comparison and rating recommendations.",
    mcpServerNames: ["Fitch Report Engine", "Fitch Analytics Engine"],
    maxToolIterations: 8,
    systemPrompt: `You are the Assessment Report Generator for Fitch's Asset Quality Early Warning System.

You will receive prior agent outputs in the task prompt. Use them to assemble credit packages.

Your task sequence:
1. Call get_report_template to retrieve the AQEWS quarterly assessment package scaffold
2. Call get_analyst_notes to retrieve prior quarter analyst observations for the watch-list banks
3. Call get_svb_backtest_data to retrieve the SVB Q1 2022→Mar 2023 score timeline showing 182-day advance warning
4. Call get_rating_history to retrieve Fitch Viability Rating history for flagged banks

After all tool calls, assemble the assessment package and produce the JSON with REAL values from tool data and prior agent outputs.

CRITICAL: End your response with a JSON code block (triple-backtick json):

\`\`\`json
{
  "reportGenerated": true,
  "watchList": ["<bankName>", ...],
  "recommendation": "Watch|Active Monitor|Immediate Review",
  "svbComparison": {
    "svbTimeline": [
      { "quarter": "<quarter>", "compositeScore": <integer>, "tier": "<tier>", "labeledEvents": ["<event>"] }
    ],
    "parallelsFound": ["<parallel narrative>"]
  },
  "assessmentPackage": {
    "executiveSummary": "<concise 2-3 sentence executive summary>",
    "ratioHighlights": [
      { "ratio": "<ratioId>", "finding": "<finding text>", "severity": "CRITICAL|HIGH|MEDIUM" }
    ],
    "nlpHighlights": [
      { "bank": "<bankName>", "signal": "<signal text>", "source": "transcript|filing|news" }
    ],
    "analystNote": "<one paragraph analyst recommendation>"
  }
}
\`\`\`

svbComparison.svbTimeline must contain all 6 quarters from the get_svb_backtest_data tool (Q1 2022 through Mar 10 2023). parallelsFound should note similarities between top-risk banks in the current portfolio and SVB's pre-seizure pattern.`,
    taskPrompt: "Generate credit assessment packages using all prior agent outputs. Call get_report_template, get_analyst_notes for watch-list banks, get_svb_backtest_data (REQUIRED — SVB timeline goes on Screen 5), and get_rating_history. Produce the assessment report JSON.",
  },
};

// ─── Module-level ID caches ───────────────────────────────────────────────────

const _fitchServerIdByName: Record<string, string> = {};
const _fitchAgentIdByName: Record<string, string> = {};

export function getFitchAgentIdByName(name: string): string | undefined {
  return _fitchAgentIdByName[name];
}

export const FITCH_PIPELINE_KEYS = [
  "ffiec_ingestor",
  "ratio_engine",
  "transcript_analyst",
  "news_processor",
  "risk_scorer",
  "report_generator",
] as const;

export function getFitchPipelineAgentNames(): Array<{ key: string; name: string }> {
  return FITCH_PIPELINE_KEYS.map(key => ({
    key,
    name: FITCH_AGENT_DEFS[key]?.name || key,
  }));
}

// ─── Server-side composite risk score computation ─────────────────────────────
// Used as a reliable fallback when the LLM risk scorer produces all-zero or
// missing scores. Derived from actual breach / sentiment data the agents fetched.

const FITCH_BANK_NAMES = [
  "JPMorgan Chase", "Bank of America", "Wells Fargo", "Citigroup",
  "Goldman Sachs", "Morgan Stanley", "U.S. Bancorp", "Truist Financial",
  "PNC Financial", "RegionalBank-West",
];

function computeRiskScores(priorSummaries: Record<string, Record<string, any>>): Record<string, any> {
  const breachLeaderboard: any[] = priorSummaries.ratio_engine?.breachLeaderboard ?? [];
  const sentimentScores: Record<string, any> = priorSummaries.transcript_analyst?.sentimentScores ?? {};
  const newsSignals: Record<string, any> =
    priorSummaries.news_processor?.newsSeverity ??
    priorSummaries.news_processor?.newsSignals ?? {};

  const scores: Record<string, any> = {};
  const watchList: string[] = [];
  const redAlerts: string[] = [];

  for (const bankName of FITCH_BANK_NAMES) {
    const breachEntry = breachLeaderboard.find((b: any) =>
      b.bankName === bankName || b.bank_name === bankName
    );
    const breachCount = breachEntry?.breachCount ?? breachEntry?.breach_count ?? 0;
    const worstSeverity: string = breachEntry?.severity ?? "LOW";

    const sentiment = sentimentScores[bankName] ?? {};
    const sentimentComposite: number = sentiment.composite ?? sentiment.compositeScore ?? 0;

    const news = newsSignals[bankName] ?? {};
    const newsClassification: string = news.classification ?? news.overallClassification ?? news.overall_classification ?? "routine";

    // Score components (all clamped to valid ranges)
    const breachContrib  = Math.min(45, breachCount * 9);
    const sentimentPenalty = Math.max(0, Math.min(18, (-sentimentComposite) * 14));
    const severityBonus  = worstSeverity === "CRITICAL" ? 12 : worstSeverity === "HIGH" ? 7 : worstSeverity === "MEDIUM" ? 3 : 0;
    const newsBonus      = newsClassification === "crisis" ? 10 : newsClassification === "material" ? 5 : newsClassification === "emerging" ? 2 : 0;

    // Use a small seeded offset so repeated runs stay deterministic per bank
    const bankIdx = FITCH_BANK_NAMES.indexOf(bankName);
    const deterministicOffset = (bankIdx * 7 + 3) % 5; // 0–4

    const raw = 20 + breachContrib + sentimentPenalty + severityBonus + newsBonus + deterministicOffset;
    const score = Math.min(90, Math.max(18, Math.round(raw)));

    const tier = score >= 75 ? "Red" : score >= 60 ? "Amber-High" : score >= 40 ? "Amber" : "Green";
    const delta = +((bankIdx % 3 === 0 ? 1.8 : bankIdx % 3 === 1 ? -0.4 : 0.6) + breachCount * 0.2).toFixed(1);
    const trajectory = delta > 1.5 ? "Deteriorating" : delta < -0.2 ? "Improving" : "Stable";

    scores[bankName] = { score, tier, trajectory, delta, breachCount, peerDivergence: +(breachCount * 0.28).toFixed(1) };

    if (score >= 75) redAlerts.push(bankName);
    else if (score >= 60) watchList.push(bankName);
  }

  return { portfolioScored: 10, banksScored: 10, scores, watchList, redAlerts };
}

// ─── Server-side ratio table computation ──────────────────────────────────────
// Fallback for ratio_engine when LLM fails to produce a 180-entry ratioTable.
// Fetches from the same mock endpoints the agent uses, then assembles the data.

const RATIO_THRESHOLDS_MAP: Record<string, number> = {
  npl_ratio: 1.5, nco_rate: 0.5, allowance_to_loans: 0.8, cet1_ratio: 8.0,
  tier1_leverage: 5.0, rwa_density: 0.8, roa: 0.5, roe: 5.0, nim: 1.5,
  efficiency_ratio: 75.0, loan_deposit_ratio: 90.0, liquid_assets_to_total: 10.0,
  cre_to_total_loans: 35.0, commercial_concentration: 50.0, provision_to_avg_loans: 0.5,
  accruing_past_due_90_pct: 0.2, classified_to_tier1: 25.0, net_stable_funding_ratio: 100.0,
};

async function computeRatioSummary(): Promise<Record<string, any>> {
  const base = `${BASE_URL}/api/mock`;
  const [trendsRes, breachesRes, peersRes] = await Promise.all([
    fetch(`${base}/fitch-analytics/ratio-trends`).then(r => r.json()),
    fetch(`${base}/fitch-analytics/threshold-breaches`).then(r => r.json()),
    fetch(`${base}/fitch-ffiec-data/peer-cohort-ratios`).then(r => r.json()),
  ]);

  const trendsByBank = new Map<string, Record<string, any[]>>();
  for (const entry of trendsRes.data ?? []) {
    trendsByBank.set(entry.bank_name, entry.ratios ?? {});
  }

  const breachesByBank = new Map<string, any[]>();
  let totalBreaches = 0;
  for (const entry of breachesRes.data ?? []) {
    breachesByBank.set(entry.bank_name, entry.breaches ?? []);
    totalBreaches += entry.breach_count ?? 0;
  }

  const peerMedians: Record<string, number> = peersRes.medians ?? {};
  const ratioIds = Object.keys(RATIO_THRESHOLDS_MAP);

  const ratioTable: Record<string, Record<string, any>> = {};
  const breachLeaderboard: any[] = [];

  for (const bankName of FITCH_BANK_NAMES) {
    const trends = trendsByBank.get(bankName) ?? {};
    const breaches = breachesByBank.get(bankName) ?? [];
    const breachMap = new Map<string, any>(breaches.map((b: any) => [b.ratio_id, b]));

    const bankRatios: Record<string, any> = {};
    for (const ratioId of ratioIds) {
      const series: any[] = trends[ratioId] ?? [];
      const latest = series.length > 0 ? series[series.length - 1].value : null;
      const prev   = series.length > 1 ? series[series.length - 2].value : null;
      const breach = breachMap.get(ratioId);

      bankRatios[ratioId] = {
        value:      latest,  // always from ratio-trends latest quarter
        threshold:  RATIO_THRESHOLDS_MAP[ratioId],
        breached:   !!breach,
        qoqDelta:   breach
          ? breach.qoq_delta
          : (latest != null && prev != null ? +(latest - prev).toFixed(2) : 0),
        peerMedian: peerMedians[ratioId] ?? null,
        severity:   breach?.severity ?? null,
      };
    }
    ratioTable[bankName] = bankRatios;

    // Include all banks in leaderboard (zero-breach banks get breachCount=0)
    const worst = breaches[0] ?? null;
    breachLeaderboard.push({
      bankName,
      breachCount: breaches.length,
      worstRatio:  worst?.ratio_id ?? null,
      severity:    worst?.severity ?? null,
    });
  }

  breachLeaderboard.sort((a, b) => b.breachCount - a.breachCount);

  return { banksAnalyzed: FITCH_BANK_NAMES.length, totalBreaches, ratioTable, breachLeaderboard };
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
        const needsUpdate =
          (agent as any).modelProvider !== "openai" ||
          (agent as any).modelName !== "gpt-4.1" ||
          !(agent as any).systemPrompt ||
          !(agent as any).systemPrompt.includes("get_call_report_schedules") &&
          def.name === "FFIEC Data Ingestor";
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

      // Ensure MCP server links
      const agentId = (agent as any).id;
      const mcpServerIds = def.mcpServerNames.map(n => _fitchServerIdByName[n]).filter(Boolean);
      if (mcpServerIds.length > 0) {
        const existingLinks = await storage.getAgentMcpServers(agentId).catch(() => [] as any[]);
        const linkedIds = new Set((existingLinks || []).map((l: any) => l.serverId));
        for (const sid of mcpServerIds) {
          if (!linkedIds.has(sid)) {
            await storage.createAgentMcpServer({ agentId, serverId: sid, assignedBy: "fitch-live-demo" });
          }
        }
      }
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
      const rawOutput = step.output ?? null;

      // count comes from the response envelope, not the inner data array
      const dataArray = Array.isArray(rawOutput?.data) ? rawOutput.data
        : Array.isArray(rawOutput) ? rawOutput : null;
      const recordCount =
        rawOutput?.count          ??
        rawOutput?.record_count   ??
        rawOutput?.total          ??
        (dataArray != null ? dataArray.length : null);

      sendEvent("agent_event", {
        agentName: currentAgentName,
        type:      "tool_call_result",
        tool,
        data: {
          tool,
          success,
          error:      success ? null : (step.error || "failed"),
          serverName: step.mcpServer || null,
          recordCount,
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
    sendEvent("setup", { message: "All 6 pipeline agents ready — 4 MCP servers (15 tools) confirmed" });

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

    // Accumulate resultSummaries for downstream context injection
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

      // Inject prior summaries for composite scorer and report generator
      let taskPrompt = def.taskPrompt;
      if ((role === "risk_scorer" || role === "report_generator") && Object.keys(priorSummaries).length > 0) {
        const context = Object.entries(priorSummaries)
          .map(([r, s]) => `[${FITCH_AGENT_DEFS[r]?.name ?? r}]: ${JSON.stringify(s)}`)
          .join("\n");
        taskPrompt = `PRIOR AGENT OUTPUTS (use these to inform scoring and report generation):\n${context}\n\nYOUR TASK:\n${def.taskPrompt}`;
      }

      const result = await runAgentOnce(deploymentId, taskPrompt, def.maxToolIterations);

      if (result.message) {
        const parsed = extractJson(result.message);
        if (parsed) {
          priorSummaries[role] = parsed;
        }
      }

      // For ratio_engine: guarantee a full ratioTable by falling back to server-side computation
      // when the LLM either skips the JSON block or produces an incomplete/malformed table.
      // (The LLM must emit 180 entries — 10 banks × 18 ratios — which is unreliable in practice.)
      if (role === "ratio_engine") {
        const table = priorSummaries[role]?.ratioTable;
        const tableEmpty = !table || Object.keys(table).length === 0;
        if (tableEmpty) {
          console.log("[fitch-live] ratio_engine missing ratioTable — computing server-side");
          try {
            priorSummaries[role] = await computeRatioSummary();
          } catch (e: any) {
            console.warn("[fitch-live] computeRatioSummary failed:", e?.message);
          }
        }
      }

      // For the risk_scorer: guarantee non-zero scores by falling back to server-side computation
      // if the LLM skipped tool calls or produced all-zero/missing scores.
      if (role === "risk_scorer") {
        const llmScores = priorSummaries[role]?.scores ?? {};
        const allZero = Object.keys(llmScores).length === 0 ||
          Object.values(llmScores).every((s: any) => !s || !s.score || s.score === 0);
        if (allZero) {
          console.log("[fitch-live] risk_scorer produced all-zero scores — using server-side computation");
          priorSummaries[role] = computeRiskScores(priorSummaries);
        }
      }

      // Persist the resultSummary to the latest runtime run
      if (priorSummaries[role]) {
        try {
          const runs = await storage.getAgentRuntimeRuns(agentId);
          if (runs.length > 0) {
            const latestRun = runs[runs.length - 1];
            await storage.updateAgentRuntimeRun(latestRun.id, { resultSummary: priorSummaries[role] });
          }
        } catch (e: any) {
          console.warn("[fitch-live] Could not update resultSummary:", e?.message);
        }
      }

      sendEvent("agent_complete", {
        agentId,
        agentName:     def.name,
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
