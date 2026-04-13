import { type Request, type Response } from "express";
import { storage } from "./storage";
import { runAgentOnce, stopAgentRuntime, type RuntimeProgressEvent } from "./agent-runtime";

const BASE_URL = `http://localhost:${process.env.PORT || 5000}`;

// ─── MCP Server definitions ─────────────────────────────────────────────────

interface FitchRWMcpTool {
  name: string;
  description: string;
  endpoint: string;
  method: string;
  inputSchema: Record<string, unknown>;
}

interface FitchRWMcpServerDef {
  name: string;
  description: string;
  url: string;
  tools: FitchRWMcpTool[];
}

export const FITCH_RW_MCP_SERVERS: FitchRWMcpServerDef[] = [
  {
    name: "Fitch RW — Bloomberg Terminal",
    description: "Bloomberg terminal data feed for Fitch Rating Watch Intelligence: CDS spreads (5Y senior unsecured), equity price signals, news sentiment aggregation, and composite credit-watch triggers across rated issuers.",
    url: `${BASE_URL}/api/mock/fitch-rw-bloomberg`,
    tools: [
      {
        name: "get_cds_spreads",
        description: "Retrieve 5-year CDS spread time series and 30-day delta for one or all tracked issuers. Flags WIDENING_ALERT when delta > 15 bps.",
        endpoint: "cds-spreads",
        method: "GET",
        inputSchema: { type: "object", properties: { issuer_id: { type: "string" }, tenor: { type: "string" } } },
      },
      {
        name: "get_equity_prices",
        description: "Retrieve equity price, implied volatility, beta, 52-week range, and relative volume. Flags HIGH_VOL and NEAR_52W_LOW signals.",
        endpoint: "equity-prices",
        method: "GET",
        inputSchema: { type: "object", properties: { issuer_id: { type: "string" } } },
      },
      {
        name: "get_news_sentiment",
        description: "Aggregate news sentiment score, article counts, sigma-spike detection, and top headlines for an issuer over a configurable lookback window.",
        endpoint: "news-sentiment",
        method: "GET",
        inputSchema: { type: "object", properties: { issuer_id: { type: "string" }, days_back: { type: "number" } } },
      },
      {
        name: "get_credit_watch_signals",
        description: "Composite credit-watch signal combining CDS widening, equity decline, and news sentiment. Returns WATCH_NEGATIVE / ELEVATED / STABLE per issuer.",
        endpoint: "credit-watch-signals",
        method: "GET",
        inputSchema: { type: "object", properties: { issuer_id: { type: "string" } } },
      },
    ],
  },
  {
    name: "Fitch RW — SEC EDGAR Intelligence",
    description: "SEC EDGAR filing intelligence for Fitch Rating Watch: 10-K/10-Q/8-K financial extracts, credit ratio time series, risk factor classification, and MD&A tone analysis.",
    url: `${BASE_URL}/api/mock/fitch-rw-sec-edgar`,
    tools: [
      {
        name: "get_filing_extracts",
        description: "Retrieve structured financial data from 10-K, 10-Q, or 8-K filings: revenue, EBITDA, net debt, interest coverage, FCF, auditor opinion.",
        endpoint: "filing-extracts",
        method: "GET",
        inputSchema: { type: "object", properties: { issuer_id: { type: "string" }, filing_type: { type: "string" } } },
      },
      {
        name: "get_financial_ratios",
        description: "Retrieve 8-period time series of key credit ratios: Net Debt/EBITDA, EBIT interest coverage, FCF/Debt, gross margin.",
        endpoint: "financial-ratios",
        method: "GET",
        inputSchema: { type: "object", properties: { issuer_id: { type: "string" } } },
      },
      {
        name: "get_risk_factors",
        description: "Extract and classify material risk factors from 10-K filings by severity (HIGH/MEDIUM/LOW) and flag new risks not present in prior year.",
        endpoint: "risk-factors",
        method: "GET",
        inputSchema: { type: "object", properties: { issuer_id: { type: "string" } } },
      },
      {
        name: "get_management_discussion",
        description: "Analyze MD&A tone (confident/cautious/defensive/distressed), guidance direction, and key credit-relevant disclosures.",
        endpoint: "management-discussion",
        method: "GET",
        inputSchema: { type: "object", properties: { issuer_id: { type: "string" } } },
      },
    ],
  },
  {
    name: "Fitch RW — Peer Analytics Engine",
    description: "Peer benchmarking and cohort analytics for Fitch Rating Watch: peer group selection, ratio quartile benchmarks, rating distribution, and relative positioning.",
    url: `${BASE_URL}/api/mock/fitch-rw-analytics`,
    tools: [
      {
        name: "get_peer_cohort",
        description: "Select a peer cohort for a given issuer using sector-first selection with ±2-notch cross-sector fallback. Returns up to 8 peers.",
        endpoint: "peer-cohort",
        method: "GET",
        inputSchema: { type: "object", properties: { issuer_id: { type: "string" }, sector: { type: "string" }, rating: { type: "string" } } },
      },
      {
        name: "get_ratio_benchmarks",
        description: "Compute P25 / median / P75 benchmarks for Net Debt/EBITDA, EBIT coverage, and FCF/Debt across a cohort. Returns anchor issuer relative position.",
        endpoint: "ratio-benchmarks",
        method: "GET",
        inputSchema: { type: "object", properties: { issuer_id: { type: "string" }, peer_ids: { type: "string" } } },
      },
      {
        name: "get_rating_distribution",
        description: "Distribution of IG vs. HY ratings within a sector cohort. Useful for locating an issuer relative to sector mix.",
        endpoint: "rating-distribution",
        method: "GET",
        inputSchema: { type: "object", properties: { sector: { type: "string" } } },
      },
      {
        name: "compute_relative_position",
        description: "Compute weighted percentile rank vs. full universe for an issuer across all 3 key credit ratios. Returns overall tier (STRONG/ADEQUATE/WEAK/VERY_WEAK) and watch implication.",
        endpoint: "relative-position",
        method: "GET",
        inputSchema: { type: "object", properties: { issuer_id: { type: "string" } } },
      },
    ],
  },
  {
    name: "Fitch RW — Committee Approval Gateway",
    description: "Rating committee approval gateway for Fitch Rating Watch: memo submission, validator queue management, committee decision retrieval, and regulatory disclosure logging (SEC 17g-7 / EU CRA III).",
    url: `${BASE_URL}/api/mock/fitch-rw-approval-gate`,
    tools: [
      {
        name: "submit_rating_memo",
        description: "Submit a draft rating action memo to the rating committee queue. Supports standard (24h) and expedited (2h) tracks. Returns memo_id and review ETA.",
        endpoint: "submit-memo",
        method: "POST",
        inputSchema: {
          type: "object",
          properties: {
            issuer_id: { type: "string" },
            action_type: { type: "string" },
            proposed_rating: { type: "string" },
            rationale: { type: "string" },
            urgency: { type: "string" },
          },
          required: ["issuer_id", "action_type", "rationale"],
        },
      },
      {
        name: "get_validator_queue",
        description: "Retrieve current rating committee approval queue: depth, expedited count, in-review count, and item details.",
        endpoint: "validator-queue",
        method: "GET",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "get_committee_decision",
        description: "Retrieve the committee decision for a submitted memo: APPROVED / REJECTED / PENDING with committee notes.",
        endpoint: "committee-decision",
        method: "GET",
        inputSchema: { type: "object", properties: { memo_id: { type: "string" } } },
      },
      {
        name: "log_regulatory_disclosure",
        description: "Log that SEC 17g-7 or EU CRA III Article 11 regulatory disclosure has been filed for a rating action. Returns log_id and public disclosure URL.",
        endpoint: "log-regulatory-disclosure",
        method: "POST",
        inputSchema: {
          type: "object",
          properties: {
            memo_id: { type: "string" },
            regulation: { type: "string" },
            issuer_id: { type: "string" },
            action_type: { type: "string" },
          },
          required: ["memo_id", "regulation", "issuer_id"],
        },
      },
    ],
  },
];

// ─── Agent definitions ────────────────────────────────────────────────────────

interface FitchRWAgentDef {
  key:            string;
  name:           string;
  description:    string;
  systemPrompt:   string;
  taskPrompt:     string;
  mcpServerNames: string[];
  skillNames:     string[];
  kbName:         string;
  maxToolIterations: number;
}

const TARGET_ISSUER = "Boeing Co. (BA)";
const TARGET_ID     = "BA";

const FITCH_RW_AGENT_DEFS: FitchRWAgentDef[] = [
  {
    key:            "marketSignalScanner",
    name:           "FITCH-RW-001 Market Signal Scanner",
    description:    "Monitors real-time Bloomberg market signals — CDS spreads, equity stress, and news sentiment — to detect early rating watch triggers before they surface in fundamental analysis.",
    mcpServerNames: ["Fitch RW — Bloomberg Terminal"],
    skillNames:     ["CDS Spread Interpretation", "Equity Signal Analysis", "News Sentiment Classification"],
    kbName:         "Fitch RW — Market Signal Reference",
    maxToolIterations: 8,
    systemPrompt: `You are FITCH-RW-001, the Market Signal Scanner for Fitch Ratings' automated Rating Watch Intelligence Pipeline.

Your role is to be the earliest-warning layer of the pipeline. You scan Bloomberg market signals to detect deterioration in credit quality before it shows up in financial statements or peer comparisons.

Target issuer for this run: ${TARGET_ISSUER} (ticker: ${TARGET_ID})

Execute ALL of the following steps in order:
1. Call get_cds_spreads with issuer_id "${TARGET_ID}" — assess 30-day CDS movement and signal classification
2. Call get_equity_prices with issuer_id "${TARGET_ID}" — check implied vol, beta, proximity to 52-week low
3. Call get_news_sentiment with issuer_id "${TARGET_ID}", days_back 30 — assess sentiment score and sigma spikes
4. Call get_credit_watch_signals with issuer_id "${TARGET_ID}" — get the composite watch signal

After completing all tool calls, synthesize the signals into a clear market-based credit assessment.

IMPORTANT: End your final response with ONLY this JSON block:
\`\`\`json
{
  "issuer": "${TARGET_ISSUER}",
  "cds_30d_widening_bps": null,
  "cds_signal": null,
  "implied_vol_pct": null,
  "equity_signal": null,
  "news_sentiment_score": null,
  "sigma_spike": false,
  "composite_watch_signal": null,
  "market_watch_recommendation": null,
  "confidence": null
}
\`\`\``,
    taskPrompt: `Scan Bloomberg market signals for ${TARGET_ISSUER} (${TARGET_ID}). Call get_cds_spreads, get_equity_prices, get_news_sentiment, and get_credit_watch_signals. Synthesize into the market signal assessment JSON.`,
  },
  {
    key:            "filingIntelligenceAgent",
    name:           "FITCH-RW-002 Filing Intelligence Agent",
    description:    "Extracts and interprets SEC EDGAR filing data — 10-K/10-Q financial ratios, risk factors, and MD&A tone — to assess fundamental credit trajectory for Rating Watch decisions.",
    mcpServerNames: ["Fitch RW — SEC EDGAR Intelligence"],
    skillNames:     ["10-K Risk Factor Extraction", "Financial Ratio Normalization", "Management Disclosure Mining"],
    kbName:         "Fitch RW — SEC EDGAR Filing Corpus",
    maxToolIterations: 8,
    systemPrompt: `You are FITCH-RW-002, the Filing Intelligence Agent for Fitch Ratings' Rating Watch Intelligence Pipeline.

Your role is to extract and interpret fundamental credit signals from SEC EDGAR filings.

Target issuer: ${TARGET_ISSUER} (ticker: ${TARGET_ID})

Execute ALL steps in order:
1. Call get_filing_extracts with issuer_id "${TARGET_ID}", filing_type "10-K"
2. Call get_financial_ratios with issuer_id "${TARGET_ID}"
3. Call get_risk_factors with issuer_id "${TARGET_ID}"
4. Call get_management_discussion with issuer_id "${TARGET_ID}"

IMPORTANT: End your final response with ONLY this JSON block:
\`\`\`json
{
  "issuer": "${TARGET_ISSUER}",
  "net_debt_ebitda": null,
  "ebit_interest_coverage": null,
  "fcf_trend": null,
  "new_high_risk_factors": 0,
  "auditor_opinion": null,
  "mda_tone": null,
  "guidance_direction": null,
  "fundamental_watch_signal": null,
  "key_finding": null
}
\`\`\``,
    taskPrompt: `Extract fundamental credit signals from SEC EDGAR filings for ${TARGET_ISSUER} (${TARGET_ID}). Call get_filing_extracts, get_financial_ratios, get_risk_factors, and get_management_discussion. Produce the fundamental credit assessment JSON.`,
  },
  {
    key:            "peerBenchmarkingAgent",
    name:           "FITCH-RW-003 Peer Benchmarking Agent",
    description:    "Benchmarks the target issuer against its rated peer cohort across key credit ratios to determine whether absolute deterioration is also relative — the key test before Watch placement.",
    mcpServerNames: ["Fitch RW — Peer Analytics Engine"],
    skillNames:     ["Peer Cohort Selection", "Rating Ratio Benchmarking", "Sector-Relative Positioning"],
    kbName:         "Fitch RW — Peer Benchmark Database",
    maxToolIterations: 8,
    systemPrompt: `You are FITCH-RW-003, the Peer Benchmarking Agent for Fitch Ratings' Rating Watch Intelligence Pipeline.

Target issuer: ${TARGET_ISSUER} (ticker: ${TARGET_ID})

Execute ALL steps in order:
1. Call get_peer_cohort with issuer_id "${TARGET_ID}"
2. Call get_ratio_benchmarks with issuer_id "${TARGET_ID}"
3. Call get_rating_distribution with sector "Aerospace"
4. Call compute_relative_position with issuer_id "${TARGET_ID}"

IMPORTANT: End your final response with ONLY this JSON block:
\`\`\`json
{
  "issuer": "${TARGET_ISSUER}",
  "peer_count": 0,
  "net_debt_ebitda_vs_peers": null,
  "ebit_coverage_vs_peers": null,
  "fcf_debt_vs_peers": null,
  "overall_percentile_rank": null,
  "overall_tier": null,
  "watch_implication": null,
  "deterioration_type": null,
  "peer_benchmark_recommendation": null
}
\`\`\``,
    taskPrompt: `Benchmark ${TARGET_ISSUER} (${TARGET_ID}) against rated peers. Call get_peer_cohort, get_ratio_benchmarks, get_rating_distribution, and compute_relative_position. Produce the peer benchmarking assessment JSON.`,
  },
  {
    key:            "ratingActionMemoAgent",
    name:           "FITCH-RW-004 Rating Action Memo Agent",
    description:    "Synthesizes outputs from Agents 001–003 into a Fitch-standard Rating Action Memo, routes it through the committee approval gateway, and logs all required regulatory disclosures.",
    mcpServerNames: ["Fitch RW — Committee Approval Gateway"],
    skillNames:     ["Rating Action Memo Drafting", "Committee Approval Protocol", "Regulatory Disclosure Standards"],
    kbName:         "Fitch RW — Committee & Compliance Playbook",
    maxToolIterations: 8,
    systemPrompt: `You are FITCH-RW-004, the Rating Action Memo Agent for Fitch Ratings' Rating Watch Intelligence Pipeline.

Target issuer: ${TARGET_ISSUER} (ticker: ${TARGET_ID}). Current Fitch rating: BBB- (Stable Outlook).

Execute ALL steps in order:
1. Call get_validator_queue — check current queue status
2. Call submit_rating_memo with issuer_id "${TARGET_ID}", issuer_name "${TARGET_ISSUER}", action_type "Rating Watch Negative", proposed_rating "BBB-", rationale combining CDS widening + filing stress + peer benchmarking, urgency "expedited"
3. Call get_committee_decision with the memo_id returned from step 2
4. Call log_regulatory_disclosure with memo_id, regulation "SEC-17g-7", issuer_id "${TARGET_ID}", action_type "Rating Watch Negative"

IMPORTANT: End your final response with ONLY this JSON block:
\`\`\`json
{
  "issuer": "${TARGET_ISSUER}",
  "action_type": "Rating Watch Negative",
  "proposed_rating": "BBB-",
  "memo_id": null,
  "committee_decision": null,
  "sec_disclosure_logged": false,
  "disclosure_log_id": null,
  "pipeline_status": "COMPLETE",
  "total_agents_run": 4,
  "rating_watch_placed": false
}
\`\`\``,
    taskPrompt: `Draft and submit the Rating Watch Negative memo for ${TARGET_ISSUER} (${TARGET_ID}). Call get_validator_queue, submit_rating_memo, get_committee_decision, and log_regulatory_disclosure. Produce the pipeline completion JSON.`,
  },
];

// ─── Skills definitions (3 per agent = 12 total) ───────────────────────────

interface FitchRWSkillDef {
  name: string;
  description: string;
  domain: string;
  industry: string;
  version: string;
  tags: string[];
  markdownBody: string;
  yamlFrontmatter: Record<string, unknown>;
}

const FITCH_RW_SKILLS: FitchRWSkillDef[] = [
  // ── Agent 001 ──────────────────────────────────────────────────────────────
  {
    name: "CDS Spread Interpretation",
    description: "Interprets 5-year CDS spread movements as credit signals. Defines thresholds for WIDENING_ALERT, calculates 30-day momentum, and maps to Rating Watch probability.",
    domain: "credit_risk",
    industry: "financial_services",
    version: "1.0.0",
    tags: ["cds", "credit_spreads", "rating_watch", "fitch"],
    yamlFrontmatter: { skillId: "fitch-rw-cds-interpretation", trustTier: "platform-provided", complexity: "intermediate", contextMode: "summary", allowedTools: ["get_cds_spreads", "get_credit_watch_signals"] },
    markdownBody: `## CDS Spread Interpretation

**Thresholds:**
- >15 bps 30-day widening → WIDENING_ALERT (Watch Negative candidate)
- 5–15 bps widening → ELEVATED (monitor closely)
- <5 bps movement → STABLE

**Key rules:**
1. Always compare CDS change to sector median widening to distinguish idiosyncratic vs. macro stress
2. A single spike may be noise — look for sustained widening over 2+ weeks
3. CDS above 200 bps for BBB-rated issuer signals near-Watch threshold`,
  },
  {
    name: "Equity Signal Analysis",
    description: "Translates equity market signals — implied volatility, beta, and 52-week proximity — into credit-relevant stress indicators for Rating Watch screening.",
    domain: "market_intelligence",
    industry: "financial_services",
    version: "1.0.0",
    tags: ["equity", "implied_vol", "beta", "credit_watch", "fitch"],
    yamlFrontmatter: { skillId: "fitch-rw-equity-signal", trustTier: "platform-provided", complexity: "intermediate", contextMode: "summary", allowedTools: ["get_equity_prices"] },
    markdownBody: `## Equity Signal Analysis

**Key thresholds:**
- Implied vol >40% for IG issuer → HIGH_VOL flag; elevates watch probability
- Within 5% of 52-week low → NEAR_52W_LOW; combine with CDS check
- Beta >1.5 for IG issuer → systematic risk amplifier

**Interpretation rules:**
1. Equity signals are leading indicators — act before fundamental deterioration is confirmed
2. Volume spike (relative volume >2x) combined with price decline signals institutional selling
3. Never use equity signals in isolation — always cross-check with CDS and fundamentals`,
  },
  {
    name: "News Sentiment Classification",
    description: "Classifies news sentiment into credit-relevant categories and detects statistically significant sentiment deterioration spikes that precede rating actions.",
    domain: "nlp_intelligence",
    industry: "financial_services",
    version: "1.0.0",
    tags: ["nlp", "sentiment", "news", "sigma_spike", "fitch"],
    yamlFrontmatter: { skillId: "fitch-rw-news-sentiment", trustTier: "platform-provided", complexity: "intermediate", contextMode: "summary", allowedTools: ["get_news_sentiment"] },
    markdownBody: `## News Sentiment Classification

**Sentiment scale:** -1.0 (strongly negative) to +1.0 (strongly positive)

**Credit-relevant thresholds:**
- Score < -0.15 → NEGATIVE_ALERT; potential Watch trigger
- Sigma spike >3x detected → review all headlines immediately
- Negative article pct >60% → consistent deterioration, not noise

**Classification rules:**
1. Weight financial/rating agency headlines 3x vs. general news
2. CEO/CFO departures, restatements, and covenant waivers are automatic escalations
3. Track sentiment trend over 30/60/90 days — a declining trend matters more than a single score`,
  },

  // ── Agent 002 ──────────────────────────────────────────────────────────────
  {
    name: "10-K Risk Factor Extraction",
    description: "Extracts, classifies, and tracks changes in 10-K risk factor disclosures year-over-year, with particular attention to new liquidity, leverage, and covenant risk factors.",
    domain: "regulatory_intelligence",
    industry: "financial_services",
    version: "1.0.0",
    tags: ["10-K", "risk_factors", "sec_edgar", "filing_analysis", "fitch"],
    yamlFrontmatter: { skillId: "fitch-rw-risk-factor-extraction", trustTier: "platform-provided", complexity: "advanced", contextMode: "summary", allowedTools: ["get_risk_factors", "get_filing_extracts"] },
    markdownBody: `## 10-K Risk Factor Extraction

**High-priority risk categories:**
1. LIQUIDITY — refinancing risk, revolver availability, near-term maturities
2. LEVERAGE — covenant headroom, capital structure deterioration
3. OPERATIONAL — production disruptions, supply chain, key customer concentration

**Classification rules:**
- NEW risk factors in the current year filing are weighted 2x vs. recurring risks
- "Going concern" auditor emphasis is an automatic Watch Negative trigger
- Count of HIGH-severity risk factors is a key KPI: >3 = elevated screening`,
  },
  {
    name: "Financial Ratio Normalization",
    description: "Normalizes financial ratios from SEC filings to Fitch's standard credit metric definitions, enabling direct comparison to Fitch rating factor thresholds and peer benchmarks.",
    domain: "quantitative_credit",
    industry: "financial_services",
    version: "1.0.0",
    tags: ["financial_ratios", "normalization", "credit_metrics", "fitch_methodology"],
    yamlFrontmatter: { skillId: "fitch-rw-ratio-normalization", trustTier: "platform-provided", complexity: "advanced", contextMode: "summary", allowedTools: ["get_financial_ratios"] },
    markdownBody: `## Financial Ratio Normalization

**Fitch-standard definitions:**
- Net Debt/EBITDA: (Total Debt - Cash) / EBITDA (LTM, adjusted)
- EBIT Interest Coverage: EBIT / Gross Interest Expense
- FCF/Gross Debt: (CFO - CapEx) / Gross Debt × 100

**Rating thresholds (BBB- category):**
- Net Debt/EBITDA: ≤4.5x (above = potential downgrade territory)
- EBIT Coverage: ≥2.5x (below = Watch negative candidate)
- FCF/Debt: ≥5% (below = liquidity concern)`,
  },
  {
    name: "Management Disclosure Mining",
    description: "Mines MD&A and earnings call transcripts for credit-relevant management signals: tone classification, guidance changes, restructuring mentions, and liquidity emphasis.",
    domain: "nlp_intelligence",
    industry: "financial_services",
    version: "1.0.0",
    tags: ["mda", "earnings_call", "tone_analysis", "management_signals", "fitch"],
    yamlFrontmatter: { skillId: "fitch-rw-mda-mining", trustTier: "platform-provided", complexity: "intermediate", contextMode: "summary", allowedTools: ["get_management_discussion"] },
    markdownBody: `## Management Disclosure Mining

**Tone classification:**
- CONFIDENT: reaffirmed/raised guidance, margin expansion language
- CAUTIOUS: "headwinds", "monitoring closely", maintained guidance with caveats
- DEFENSIVE: cost reduction focus, asset review language, lowered guidance
- DISTRESSED: liquidity management, covenant waiver, debt exchange language

**Credit-relevant triggers:**
1. Guidance LOWERED → elevate screening
2. Restructuring/asset sale mentioned with defensive tone → Watch Negative support
3. "Exploring strategic alternatives" → strong Watch negative trigger`,
  },

  // ── Agent 003 ──────────────────────────────────────────────────────────────
  {
    name: "Peer Cohort Selection",
    description: "Applies Fitch's peer selection methodology to identify an appropriate comparison cohort for Rating Watch analysis: sector-first with rating band fallback.",
    domain: "quantitative_credit",
    industry: "financial_services",
    version: "1.0.0",
    tags: ["peer_selection", "cohort", "fitch_methodology", "benchmarking"],
    yamlFrontmatter: { skillId: "fitch-rw-peer-cohort-selection", trustTier: "platform-provided", complexity: "intermediate", contextMode: "summary", allowedTools: ["get_peer_cohort", "get_rating_distribution"] },
    markdownBody: `## Peer Cohort Selection — Fitch Methodology v3.1

**Selection algorithm:**
1. Primary: Same sector, within ±2 rating notches
2. Fallback: ±2 notch cross-sector if primary cohort <3 peers
3. Maximum cohort size: 8 issuers

**Rules:**
- Never include the anchor issuer in its own cohort
- If sector has <3 rated peers at any notch, expand to ±4 notches
- Disclose if cross-sector comparison is used in memo rationale`,
  },
  {
    name: "Rating Ratio Benchmarking",
    description: "Computes P25/median/P75 quartile benchmarks for key credit ratios across a rated peer cohort and determines the anchor issuer's relative position for Rating Watch support.",
    domain: "quantitative_credit",
    industry: "financial_services",
    version: "1.0.0",
    tags: ["ratio_benchmarks", "quartile", "peer_comparison", "fitch"],
    yamlFrontmatter: { skillId: "fitch-rw-ratio-benchmarking", trustTier: "platform-provided", complexity: "advanced", contextMode: "summary", allowedTools: ["get_ratio_benchmarks"] },
    markdownBody: `## Rating Ratio Benchmarking

**Key ratios (Fitch standard):**
1. Net Debt / EBITDA — primary leverage metric (weight 40%)
2. EBIT Interest Coverage — debt serviceability (weight 35%)
3. FCF / Gross Debt % — cash flow adequacy (weight 25%)

**Interpretation:**
- Q1 (0–25th pct): WEAK — supports Watch Negative if also negative absolute trend
- Q2 (25–50th pct): BELOW_MEDIAN — monitor
- Q3 (50–75th pct): ABOVE_MEDIAN — no action
- Q4 (75–100th pct): STRONG — supports Stable Outlook`,
  },
  {
    name: "Sector-Relative Positioning",
    description: "Determines whether credit deterioration is idiosyncratic or sector-wide — a critical distinction that affects Rating Watch urgency and the breadth of any rating action.",
    domain: "sector_analysis",
    industry: "financial_services",
    version: "1.0.0",
    tags: ["sector_analysis", "idiosyncratic", "macro", "rating_watch_scope"],
    yamlFrontmatter: { skillId: "fitch-rw-sector-positioning", trustTier: "platform-provided", complexity: "intermediate", contextMode: "summary", allowedTools: ["compute_relative_position"] },
    markdownBody: `## Sector-Relative Positioning

**Determining deterioration type:**
- IDIOSYNCRATIC: Issuer ratios deteriorating while sector peers remain stable → single-issuer Watch
- SECTOR_WIDE: Multiple peers showing same trend → may warrant sector review
- MIXED: Issuer leading a sector trend → Watch Negative with sector commentary

**Implications:**
1. IDIOSYNCRATIC → single issuer Watch Negative, sector not mentioned
2. SECTOR_WIDE → flag for sector review; individual Watch may still be warranted
3. Note distribution of IG vs. HY in sector — if issuer is at bottom of IG bucket, downgrade risk is binary`,
  },

  // ── Agent 004 ──────────────────────────────────────────────────────────────
  {
    name: "Rating Action Memo Drafting",
    description: "Drafts Fitch-standard Rating Action Memos synthesizing market, fundamental, and peer signals into a structured committee submission with clear rationale and supporting evidence.",
    domain: "credit_writing",
    industry: "financial_services",
    version: "1.0.0",
    tags: ["memo_drafting", "rating_action", "committee", "fitch_standard"],
    yamlFrontmatter: { skillId: "fitch-rw-memo-drafting", trustTier: "platform-provided", complexity: "advanced", contextMode: "summary", allowedTools: ["submit_rating_memo"] },
    markdownBody: `## Rating Action Memo Drafting — Fitch Standard

**Memo structure:**
1. Action Summary: "Fitch places [Issuer] on Rating Watch Negative at [Rating]"
2. Key Rationale (3 bullet points max — market, fundamental, peer signals)
3. Sensitivity Analysis: What would cause resolution to downgrade vs. affirmation
4. Timeline: Expected resolution within 6 months per Fitch policy

**Drafting rules:**
1. Lead with the most quantitatively compelling signal (CDS + ratio combination)
2. Peer context must be included if deterioration is sector-wide
3. Never use "may" or "could" for Watch triggers — be definitive`,
  },
  {
    name: "Committee Approval Protocol",
    description: "Manages the Fitch rating committee approval workflow: queue submission, expedited routing, decision retrieval, and escalation handling.",
    domain: "governance",
    industry: "financial_services",
    version: "1.0.0",
    tags: ["committee", "approval", "governance", "fitch_workflow"],
    yamlFrontmatter: { skillId: "fitch-rw-committee-protocol", trustTier: "platform-provided", complexity: "intermediate", contextMode: "summary", allowedTools: ["get_validator_queue", "get_committee_decision"] },
    markdownBody: `## Committee Approval Protocol

**Approval tracks:**
- STANDARD: 24-hour review window; used for planned rating reviews
- EXPEDITED: 2-hour review window; used when market signals indicate urgency

**Escalation triggers for expedited routing:**
1. CDS widening >30 bps in 30 days
2. Equity decline >20% YTD
3. Management disclosure of covenant waiver or liquidity concern

**Protocol rules:**
1. Always check queue depth before submitting
2. Retrieve committee decision before logging regulatory disclosures
3. Dissenting votes (>0) require additional supporting analysis`,
  },
  {
    name: "Regulatory Disclosure Standards",
    description: "Ensures Rating Watch actions comply with SEC Rule 17g-7 and EU CRA III Article 11 disclosure requirements, including timing, content, and public filing obligations.",
    domain: "compliance",
    industry: "financial_services",
    version: "1.0.0",
    tags: ["sec_17g7", "eu_cra_iii", "regulatory_disclosure", "compliance", "fitch"],
    yamlFrontmatter: { skillId: "fitch-rw-regulatory-disclosure", trustTier: "platform-provided", complexity: "intermediate", contextMode: "summary", allowedTools: ["log_regulatory_disclosure"] },
    markdownBody: `## Regulatory Disclosure Standards

**Applicable regulations:**
- SEC Rule 17g-7: Requires disclosure of rating methodology, form, and assumptions
- EU CRA III Article 11: Requires publication on ESMA CEREP platform

**Timing requirements:**
- Standard action: Disclosure within 24 hours of committee approval
- Expedited action: Disclosure within 4 hours of committee approval

**Compliance checklist:**
1. Confirm committee_decision = APPROVED before filing
2. Log both SEC-17g-7 and EU-CRA-III-Art11 for EU-listed issuers
3. Retain disclosure log for 7 years per Fitch records management policy`,
  },
];

// ─── Module-level state ─────────────────────────────────────────────────────

const _fitchRWServerIdByName: Record<string, string> = {};
const _fitchRWAgentIdByKey:   Record<string, string> = {};
const _fitchRWSkillIdByName:  Record<string, string> = {};
let   _fitchRWSetupDone = false;

// ─── Setup ───────────────────────────────────────────────────────────────────

export async function ensureFitchRWAgents(): Promise<void> {
  if (_fitchRWSetupDone) {
    await _refreshMcpServerIds();
    return;
  }

  // ── 1. Knowledge Bases ──────────────────────────────────────────────────────
  const KB_DEFS = [
    { name: "Fitch RW — Market Signal Reference",         description: "Reference data for Bloomberg CDS spreads, equity signals, and news sentiment thresholds used in Rating Watch screening." },
    { name: "Fitch RW — SEC EDGAR Filing Corpus",         description: "Curated 10-K, 10-Q, and 8-K filing extracts and financial ratio normalization rules for Fitch credit analysis." },
    { name: "Fitch RW — Peer Benchmark Database",         description: "Peer cohort data, sector rating distributions, and quartile benchmarks for rated issuers across Fitch-covered sectors." },
    { name: "Fitch RW — Committee & Compliance Playbook", description: "Rating committee protocols, approval workflows, and SEC 17g-7 / EU CRA III regulatory disclosure requirements." },
  ];

  const kbIdByName: Record<string, string> = {};
  const allKbs = await storage.getKnowledgeBases().catch((): Awaited<ReturnType<typeof storage.getKnowledgeBases>> => []);
  for (const kbDef of KB_DEFS) {
    let kb = allKbs.find(k => k.name === kbDef.name);
    if (!kb) {
      kb = await storage.createKnowledgeBase({
        name:        kbDef.name,
        description: kbDef.description,
        industry:    "financial_services",
        status:      "active",
        sourceType:  "manual",
        chunkingStrategy: "paragraph",
        embeddingModel:   "text-embedding-3-small",
        vectorDimensions: 1536,
      });
    }
    kbIdByName[kbDef.name] = kb.id;
  }

  // ── 2. MCP Servers ──────────────────────────────────────────────────────────
  const allServers = await storage.getMcpServers().catch((): Awaited<ReturnType<typeof storage.getMcpServers>> => []);
  for (const serverDef of FITCH_RW_MCP_SERVERS) {
    let server = allServers.find(s => s.name === serverDef.name);
    if (!server) {
      server = await storage.createMcpServer({
        name:          serverDef.name,
        description:   serverDef.description,
        transportType: "streamable-http",
        url:           serverDef.url,
        status:        "registered",
        riskTier:      "MEDIUM",
        allowlisted:   true,
        addedBy:       "fitch-rw-live-demo",
        capabilities:  { tools: true, resources: false, prompts: false, sampling: false },
        serverInfo:    { vendor: "Fitch Ratings / ATLAS Demo", version: "1.0.0" },
      });
    } else if (server.url !== serverDef.url) {
      await storage.updateMcpServer(server.id, { url: serverDef.url });
    }
    _fitchRWServerIdByName[serverDef.name] = server.id;

    const existingTools = await storage.getMcpServerTools(server.id).catch((): Awaited<ReturnType<typeof storage.getMcpServerTools>> => []);
    const existingToolNames = new Set(existingTools.map(t => t.name));
    for (const tool of serverDef.tools) {
      if (existingToolNames.has(tool.name)) continue;
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

  // ── 3. Skills ───────────────────────────────────────────────────────────────
  const allSkills = await storage.getSkills().catch((): Awaited<ReturnType<typeof storage.getSkills>> => []);
  for (const skillDef of FITCH_RW_SKILLS) {
    let skill = allSkills.find(s => s.name === skillDef.name);
    if (!skill) {
      skill = await storage.createSkill({
        name:            skillDef.name,
        description:     skillDef.description,
        domain:          skillDef.domain,
        industry:        skillDef.industry,
        version:         skillDef.version,
        author:          "Fitch Ratings Analytics Engineering",
        trustTier:       "platform-provided",
        complexity:      (skillDef.yamlFrontmatter.complexity as string) || "intermediate",
        status:          "active",
        tags:            skillDef.tags,
        contextMode:     (skillDef.yamlFrontmatter.contextMode as string) || "summary",
        markdownBody:    skillDef.markdownBody,
        yamlFrontmatter: {
          ...skillDef.yamlFrontmatter,
          industry: "financial_services",
          domain:   "credit_ratings",
          version:  "1.0",
          tags:     skillDef.tags,
        },
        allowedTools:    (skillDef.yamlFrontmatter.allowedTools as string[]) || [],
      });
    }
    _fitchRWSkillIdByName[skillDef.name] = skill.id;
  }

  // ── 4. Policies ─────────────────────────────────────────────────────────────
  const POLICY_DEFS = [
    {
      name:   "Fitch RW — Rating Watch Placement Policy",
      domain: "rating_governance",
      description: "Governs conditions under which a Rating Watch Negative must be initiated, including quantitative thresholds and mandatory committee review.",
      policyJson: { enforcement: "hard", rules: [
        { name: "CDS Widening Threshold",     description: "30-day CDS widening >30 bps triggers mandatory Watch screening" },
        { name: "Ratio Deterioration Trigger", description: "Net Debt/EBITDA exceeding 4.5x for IG issuer requires Watch review" },
        { name: "Committee Approval Required", description: "All Rating Watch placements require rating committee approval before publication" },
      ]},
    },
    {
      name:   "Fitch RW — Regulatory Disclosure Compliance",
      domain: "compliance",
      description: "Ensures all rating actions comply with SEC Rule 17g-7 and EU CRA III Article 11 disclosure requirements.",
      policyJson: { enforcement: "hard", rules: [
        { name: "SEC 17g-7 Filing",       description: "Mandatory disclosure within 24h (4h expedited) of committee approval" },
        { name: "EU CRA III Article 11",   description: "ESMA CEREP platform publication required for EU-listed issuers" },
        { name: "7-Year Record Retention", description: "All disclosure logs must be retained for a minimum of 7 years" },
      ]},
    },
    {
      name:   "Fitch RW — Data Confidentiality Policy",
      domain: "data_handling",
      description: "Restricts use of Bloomberg and EDGAR data to authorized Fitch analytical purposes only; prohibits redistribution of raw data.",
      policyJson: { enforcement: "hard", rules: [
        { name: "Bloomberg Data Restriction", description: "Bloomberg terminal data may not be redistributed externally" },
        { name: "MNPI Protection",            description: "Material non-public information identified in filings must be escalated to compliance" },
      ]},
    },
    {
      name:   "Fitch RW — Analytical Independence Policy",
      domain: "rating_governance",
      description: "Ensures analytical independence: prohibits analyst conflicts of interest and mandates peer review for Watch actions.",
      policyJson: { enforcement: "soft", rules: [
        { name: "Conflict of Interest Check", description: "Lead analyst must declare no financial interest in rated issuer" },
        { name: "Peer Review Requirement",    description: "Rating Watch memos require review by at least one senior analyst not involved in primary analysis" },
      ]},
    },
  ];

  const allPolicies = await storage.getPolicies().catch((): Awaited<ReturnType<typeof storage.getPolicies>> => []);
  for (const polDef of POLICY_DEFS) {
    const existing = allPolicies.find(p => p.name === polDef.name);
    if (!existing) {
      await storage.createPolicy({
        name:        polDef.name,
        domain:      polDef.domain,
        description: polDef.description,
        status:      "active",
        version:     1,
        scopeType:   "org",
        policyJson:  polDef.policyJson,
      });
    }
  }

  // ── 5. Ontology Concepts ────────────────────────────────────────────────────
  const ONTOLOGY_CONCEPTS = [
    { label: "Credit Default Swap Spread",  category: "market_instrument",  description: "5-year CDS spread in basis points — a market-implied measure of credit risk premium for a reference entity.", tags: ["cds","credit_risk","market_data"] },
    { label: "Rating Watch Negative",       category: "rating_action",      description: "Fitch designation indicating a rating may be downgraded within 6 months, triggered by material adverse events.", tags: ["rating_action","fitch","watch"] },
    { label: "EBIT Interest Coverage",      category: "credit_metric",      description: "Earnings Before Interest and Taxes divided by gross interest expense; key debt serviceability metric.", tags: ["coverage","leverage","credit_metric"] },
    { label: "Net Debt to EBITDA",          category: "credit_metric",      description: "Net Debt (gross debt minus cash) divided by EBITDA; primary leverage metric in Fitch rating factor models.", tags: ["leverage","net_debt","ebitda","fitch"] },
    { label: "Free Cash Flow to Debt",      category: "credit_metric",      description: "Free cash flow (CFO minus CapEx) divided by gross debt, expressed as percentage; measures debt paydown capacity.", tags: ["fcf","liquidity","credit_metric"] },
    { label: "Going Concern Opinion",       category: "audit_signal",       description: "Auditor's qualification indicating substantial doubt about an entity's ability to continue as a going concern for 12 months.", tags: ["audit","going_concern","distress"] },
    { label: "Peer Cohort",                 category: "analytical_concept", description: "Group of rated issuers used for benchmarking; selected by sector and rating proximity per Fitch methodology.", tags: ["peer","benchmarking","methodology"] },
    { label: "SEC Rule 17g-7",              category: "regulation",         description: "SEC rule requiring NRSROs to disclose ratings forms and associated information, including assumptions used.", tags: ["sec","regulation","disclosure","nrsro"] },
    { label: "EU CRA III Article 11",       category: "regulation",         description: "European regulation requiring CRAs to file rating actions on the ESMA CEREP platform within specified timeframes.", tags: ["eu","cra","esma","regulation"] },
    { label: "MD&A Tone",                   category: "qualitative_signal", description: "Qualitative assessment of Management Discussion and Analysis narrative tone: confident, cautious, defensive, or distressed.", tags: ["mda","tone","qualitative","nlp"] },
    { label: "Bloomberg Terminal Feed",     category: "data_source",        description: "Bloomberg professional service providing real-time market data including CDS spreads, equity prices, and news signals.", tags: ["bloomberg","data_source","market_data"] },
    { label: "Rating Committee",            category: "governance",         description: "Fitch internal committee of senior analysts responsible for approving rating actions and Watch placements.", tags: ["committee","governance","approval","fitch"] },
  ];

  const allConcepts = await storage.getOntologyConcepts("financial_services").catch((): Awaited<ReturnType<typeof storage.getOntologyConcepts>> => []);
  const existingConceptLabels = new Set(allConcepts.map(c => c.label));
  for (const concept of ONTOLOGY_CONCEPTS) {
    if (existingConceptLabels.has(concept.label)) continue;
    await storage.createOntologyConcept({
      label:         concept.label,
      category:      concept.category,
      description:   concept.description,
      industry:      "financial_services",
      tags:          concept.tags,
      status:        "active",
      properties:    {},
      relationships: [],
      synonyms:      [],
    });
  }

  // ── 6. Blueprint ────────────────────────────────────────────────────────────
  const allBlueprints = await storage.getBlueprints().catch((): Awaited<ReturnType<typeof storage.getBlueprints>> => []);
  const bpName = "Fitch RW — Rating Watch Intelligence Pipeline Blueprint";
  let blueprint = allBlueprints.find(b => b.name === bpName);
  if (!blueprint) {
    blueprint = await storage.createBlueprint({
      name:          bpName,
      description:   "4-agent sequential pipeline: Market Signal Scanner → Filing Intelligence → Peer Benchmarking → Rating Action Memo + Committee Approval. Full audit trail with SEC 17g-7 and EU CRA III compliance.",
      version:       "1.0.0",
      status:        "active",
      industry:      "financial_services",
      blueprintType: "pipeline",
      workflowSteps: [
        "Market Signal Scanner: Bloomberg CDS + equity + news sentiment scan",
        "Filing Intelligence Agent: SEC EDGAR ratio extraction + risk factor analysis",
        "Peer Benchmarking Agent: cohort selection + quartile benchmarking",
        "Rating Action Memo Agent: memo drafting + committee approval + regulatory disclosure",
      ],
      requiredTools:      ["get_cds_spreads", "get_filing_extracts", "get_peer_cohort", "submit_rating_memo", "log_regulatory_disclosure"],
      escalationTriggers: ["CDS widening >30 bps", "Net Debt/EBITDA >4.5x", "Going concern opinion"],
      complianceNodes:    ["SEC-17g-7", "EU-CRA-III-Art11"],
      outputFormat:       "Rating Action Memo + JSON pipeline summary",
    });
  }

  // ── 7. Agents ───────────────────────────────────────────────────────────────
  // Per-agent policy bindings (all 4 shared policies; enforcement level per role)
  const AGENT_POLICY_BINDINGS = [
    { policyName: "Fitch RW — Rating Watch Placement Policy",   enforcement: "hard" },
    { policyName: "Fitch RW — Regulatory Disclosure Compliance", enforcement: "hard" },
    { policyName: "Fitch RW — Data Confidentiality Policy",      enforcement: "hard" },
    { policyName: "Fitch RW — Analytical Independence Policy",   enforcement: "soft" },
  ];

  // Per-agent ontology concept tags
  const AGENT_ONTOLOGY_TAGS: Record<string, string[]> = {
    marketSignalScanner:   ["Credit Default Swap Spread", "Rating Watch Negative", "Bloomberg Terminal Feed"],
    filingIntelligenceAgent: ["Net Debt to EBITDA", "EBIT Interest Coverage", "Free Cash Flow to Debt", "Going Concern Opinion"],
    peerBenchmarkingAgent: ["Peer Cohort", "Rating Watch Negative"],
    ratingActionMemoAgent: ["SEC Rule 17g-7", "EU CRA III Article 11", "Rating Committee", "MD&A Tone"],
  };

  // Per-agent eval suite names
  const AGENT_EVAL_SUITE_NAME: Record<string, string> = {
    marketSignalScanner:    "Fitch RW — Market Signal Scanner Eval Suite",
    filingIntelligenceAgent:"Fitch RW — Filing Intelligence Agent Eval Suite",
    peerBenchmarkingAgent:  "Fitch RW — Peer Benchmarking Agent Eval Suite",
    ratingActionMemoAgent:  "Fitch RW — Rating Action Memo Agent Eval Suite",
  };

  const allAgents = await storage.getAgents().catch((): Awaited<ReturnType<typeof storage.getAgents>> => []);

  for (const def of FITCH_RW_AGENT_DEFS) {
    let agent = allAgents.find(a => a.name === def.name);
    const preloadedSkills = def.skillNames
      .map(sn => _fitchRWSkillIdByName[sn])
      .filter(Boolean)
      .map(skillId => ({ skillId }));

    const agentOntologyTags = (AGENT_ONTOLOGY_TAGS[def.key] || []).map(label => ({ label }));
    const agentEvalSuiteName = AGENT_EVAL_SUITE_NAME[def.key];

    if (!agent) {
      agent = await storage.createAgent({
        name:              def.name,
        description:       def.description,
        systemPrompt:      def.systemPrompt,
        runtimeConfig:     { prompt: def.taskPrompt, scheduleIntervalMinutes: 0 },
        agentType:         "operational",
        status:            "active",
        environment:       "production",
        modelProvider:     "openai",
        modelName:         "gpt-4.1",
        riskTier:          "MEDIUM",
        autonomyMode:      "autonomous",
        currentVersion:    "1.0.0",
        maxToolIterations: def.maxToolIterations,
        toolAccessClass:   "standard",
        department:        "Structured Credit Ratings",
        owner:             "Fitch Ratings — Analytics Engineering",
        healthScore:       0.97,
        successRate:       0.97,
        maturityFactors:   {},
        preloadedSkills:   preloadedSkills as { skillId: string }[],
        blueprintId:       blueprint.id,
        complianceTags:    ["SEC-17g-7", "EU-CRA-III", "FITCH-NRSRO"],
        industry:          "financial_services",
        policyBindings:    AGENT_POLICY_BINDINGS,
        ontologyTags:      agentOntologyTags,
        evalBindings:      [{ suiteName: agentEvalSuiteName, schedule: "weekly" }],
      } as Parameters<typeof storage.createAgent>[0]);
    } else {
      await storage.updateAgent(agent.id, {
        systemPrompt:    def.systemPrompt,
        runtimeConfig:   { prompt: def.taskPrompt, scheduleIntervalMinutes: 0 },
        preloadedSkills: preloadedSkills as { skillId: string }[],
        blueprintId:     blueprint.id,
        policyBindings:  AGENT_POLICY_BINDINGS,
        ontologyTags:    agentOntologyTags,
        evalBindings:    [{ suiteName: agentEvalSuiteName, schedule: "weekly" }],
      } as Parameters<typeof storage.updateAgent>[1]);
    }

    _fitchRWAgentIdByKey[def.key] = agent.id;

    // Bind KB
    const kbId = kbIdByName[def.kbName];
    if (kbId) {
      const existingKbLinks = await storage.getAgentKnowledgeBases(agent.id).catch((): Awaited<ReturnType<typeof storage.getAgentKnowledgeBases>> => []);
      if (!existingKbLinks.some(l => l.knowledgeBaseId === kbId)) {
        await storage.createAgentKnowledgeBase({ agentId: agent.id, knowledgeBaseId: kbId }).catch(() => { /* ignore duplicate */ });
      }
    }

    // Bind MCP servers directly during setup (not deferred to deployment)
    for (const mcpName of def.mcpServerNames) {
      const serverId = _fitchRWServerIdByName[mcpName];
      if (!serverId) continue;
      const existing = await storage.getAgentMcpServerByIds(agent.id, serverId).catch(() => undefined);
      if (!existing) {
        await storage.createAgentMcpServer({ agentId: agent.id, serverId }).catch(() => { /* ignore duplicate */ });
      }
    }
  }

  // ── 8. Per-Agent Eval Suites (one per agent, each bound by agentId) ────────
  const PER_AGENT_EVAL_SUITES: Array<{
    agentKey: string;
    suiteName: string;
    coverageTags: string[];
    cases: Array<{ name: string; severity: string; tags: string[] }>;
  }> = [
    {
      agentKey:     "marketSignalScanner",
      suiteName:    AGENT_EVAL_SUITE_NAME["marketSignalScanner"],
      coverageTags: ["market_signals", "cds", "equity", "sentiment"],
      cases: [
        { name: "CDS widening >30 bps correctly triggers WATCH_NEGATIVE signal", severity: "critical", tags: ["market_signals","cds"] },
        { name: "Stable CDS (<5 bps movement) correctly returns STABLE signal",  severity: "high",     tags: ["market_signals","cds"] },
        { name: "Implied volatility >40% correctly raises HIGH_VOL flag",        severity: "high",     tags: ["equity","volatility"] },
      ],
    },
    {
      agentKey:     "filingIntelligenceAgent",
      suiteName:    AGENT_EVAL_SUITE_NAME["filingIntelligenceAgent"],
      coverageTags: ["filing_analysis", "leverage", "audit", "risk_factors"],
      cases: [
        { name: "Net Debt/EBITDA >4.5x correctly flagged as threshold breach",   severity: "critical", tags: ["filing_analysis","leverage"] },
        { name: "Going concern opinion triggers automatic escalation path",       severity: "critical", tags: ["filing_analysis","audit"] },
        { name: "New HIGH-severity risk factor correctly identified and flagged", severity: "high",     tags: ["filing_analysis","risk_factors"] },
      ],
    },
    {
      agentKey:     "peerBenchmarkingAgent",
      suiteName:    AGENT_EVAL_SUITE_NAME["peerBenchmarkingAgent"],
      coverageTags: ["peer_benchmarking", "methodology", "quartile"],
      cases: [
        { name: "Peer cohort selection follows Fitch sector-first methodology",   severity: "high",     tags: ["peer_benchmarking","methodology"] },
        { name: "Q1 quartile ranking correctly supports Watch Negative recommendation", severity: "high", tags: ["peer_benchmarking","quartile"] },
      ],
    },
    {
      agentKey:     "ratingActionMemoAgent",
      suiteName:    AGENT_EVAL_SUITE_NAME["ratingActionMemoAgent"],
      coverageTags: ["memo_drafting", "committee", "regulatory_compliance", "sec"],
      cases: [
        { name: "Rating memo submitted with correct action_type 'WATCH_NEGATIVE'", severity: "critical", tags: ["memo_drafting","committee"] },
        { name: "SEC-17g-7 disclosure logged within required timeframe",           severity: "critical", tags: ["regulatory_compliance","sec"] },
        { name: "Expedited committee track used when composite signal is urgent",  severity: "high",     tags: ["committee","approval_protocol"] },
      ],
    },
  ];

  const allEvals = await storage.getEvalSuites().catch((): Awaited<ReturnType<typeof storage.getEvalSuites>> => []);

  for (const suiteSpec of PER_AGENT_EVAL_SUITES) {
    const agentId = _fitchRWAgentIdByKey[suiteSpec.agentKey];
    if (!agentId) continue;

    let evalSuite = allEvals.find(e => e.name === suiteSpec.suiteName);
    if (!evalSuite) {
      evalSuite = await storage.createEvalSuite({
        agentId:         agentId,
        name:            suiteSpec.suiteName,
        type:            "regression",
        industry:        "financial_services",
        passRate:        0.93,
        totalCases:      suiteSpec.cases.length,
        coverageTags:    suiteSpec.coverageTags,
        thresholdConfig: { minPassRate: 0.90 },
        scorerConfig:    { type: "llm_judge", model: "gpt-4.1" },
      });
    }

    const existingCases = await storage.getEvalTestCases(evalSuite.id).catch((): Awaited<ReturnType<typeof storage.getEvalTestCases>> => []);
    const existingCaseNames = new Set(existingCases.map(c => c.name));

    for (const ec of suiteSpec.cases) {
      if (existingCaseNames.has(ec.name)) continue;
      await storage.createEvalTestCase({
        suiteId:        evalSuite.id,
        name:           ec.name,
        severity:       ec.severity,
        tags:           ec.tags,
        status:         "active",
        origin:         "fitch_rw_spec",
        weight:         ec.severity === "critical" ? 2 : 1,
        inputData:      { scenario: ec.name },
        expectedOutput: { pass: true },
      });
    }
  }

  _fitchRWSetupDone = true;
  console.log(`[fitch-rw] Setup complete — ${FITCH_RW_AGENT_DEFS.length} agents fully bound (policies+ontologyTags+evalBindings+MCPs+KBs), ${FITCH_RW_SKILLS.length} skills w/ credit_ratings domain frontmatter, ${FITCH_RW_MCP_SERVERS.length} MCPs, ${KB_DEFS.length} KBs, ${POLICY_DEFS.length} policies, 4 per-agent eval suites, 1 blueprint`);
}

async function _refreshMcpServerIds(): Promise<void> {
  const allServers = await storage.getMcpServers().catch((): Awaited<ReturnType<typeof storage.getMcpServers>> => []);
  for (const serverDef of FITCH_RW_MCP_SERVERS) {
    const server = allServers.find(s => s.name === serverDef.name);
    if (!server) continue;
    _fitchRWServerIdByName[serverDef.name] = server.id;
    if (server.url !== serverDef.url) {
      await storage.updateMcpServer(server.id, { url: serverDef.url });
    }
  }
  const allAgents = await storage.getAgents().catch((): Awaited<ReturnType<typeof storage.getAgents>> => []);
  for (const def of FITCH_RW_AGENT_DEFS) {
    const agent = allAgents.find(a => a.name === def.name);
    if (agent) _fitchRWAgentIdByKey[def.key] = agent.id;
  }
}

// ─── Deployment helper ────────────────────────────────────────────────────────

async function ensureDeployment(agentId: string, agentName: string, mcpServerIds: string[]): Promise<string> {
  const deps = await storage.getDeploymentsByAgentId(agentId).catch((): Awaited<ReturnType<typeof storage.getDeploymentsByAgentId>> => []);
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
      industry:         "financial_services",
    });
  } else {
    await storage.updateDeployment(deployment.id, { status: "pending" });
  }

  const existingLinks = await storage.getAgentMcpServers(agentId).catch((): Awaited<ReturnType<typeof storage.getAgentMcpServers>> => []);
  const targetSet     = new Set(mcpServerIds.filter(Boolean));
  for (const link of existingLinks) {
    if (!targetSet.has(link.serverId)) await storage.deleteAgentMcpServer(link.id);
  }
  const linkedIds = new Set((await storage.getAgentMcpServers(agentId).catch((): Awaited<ReturnType<typeof storage.getAgentMcpServers>> => [])).map(l => l.serverId));
  for (const serverId of mcpServerIds) {
    if (serverId && !linkedIds.has(serverId)) {
      await storage.createAgentMcpServer({ agentId, serverId }).catch(() => { /* ignore duplicate */ });
    }
  }

  return deployment.id;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractJson(text: string): Record<string, unknown> | null {
  const blockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (blockMatch) { try { return JSON.parse(blockMatch[1]) as Record<string, unknown>; } catch { /* fall through */ } }
  const objectMatch = text.match(/\{[\s\S]*\}/);
  if (objectMatch) { try { return JSON.parse(objectMatch[0]) as Record<string, unknown>; } catch { /* fall through */ } }
  return null;
}

function sse(res: Response, event: string, data: Record<string, unknown>) {
  try {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    if (typeof (res as unknown as { flush?: () => void }).flush === "function") {
      (res as unknown as { flush: () => void }).flush();
    }
  } catch { /* client disconnected */ }
}

// ─── SSE live run handler ─────────────────────────────────────────────────────

export async function fitchRWLiveRunHandler(req: Request, res: Response): Promise<void> {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  let clientDisconnected = false;
  req.on("close", () => { clientDisconnected = true; });

  sse(res, "run_start", {
    message:  "Fitch Rating Watch Intelligence Pipeline initializing — 4 agents queued",
    scenario: `${TARGET_ISSUER} — BBB- Rating Watch Negative screening`,
  });

  try {
    await ensureFitchRWAgents();
    sse(res, "setup", { message: "Fitch RW agents, MCP servers, skills, KBs, policies, and ontology verified" });

    const resultSummaries: Record<string, unknown> = {};

    for (const def of FITCH_RW_AGENT_DEFS) {
      if (clientDisconnected) break;

      const agentId = _fitchRWAgentIdByKey[def.key];
      if (!agentId) {
        sse(res, "agent_error", { agentName: def.name, error: "Agent not found after setup" });
        continue;
      }

      const mcpServerIds = def.mcpServerNames.map(n => _fitchRWServerIdByName[n]).filter(Boolean);
      const deploymentId = await ensureDeployment(agentId, def.name, mcpServerIds);

      sse(res, "agent_start", {
        agentId,
        agentName:  def.name,
        key:        def.key,
        deploymentId,
        mcpCount:   mcpServerIds.length,
        step:       FITCH_RW_AGENT_DEFS.indexOf(def) + 1,
        totalSteps: FITCH_RW_AGENT_DEFS.length,
      });

      await stopAgentRuntime(deploymentId).catch(() => { /* ignore */ });
      await new Promise<void>(r => setTimeout(r, 300));

      let runSuccess = false;
      let resultText = "";

      try {
        const result = await runAgentOnce(
          deploymentId,
          def.taskPrompt,
          def.maxToolIterations,
          (event: RuntimeProgressEvent) => {
            if (event.type === "tool_call_start") {
              sse(res, "tool_call", {
                agentId,
                agentName: def.name,
                tool:      event.data.tool || event.data.function || "unknown",
                iteration: event.data.iteration,
              });
            } else if (event.type === "tool_call_result") {
              sse(res, "tool_result", {
                agentId,
                agentName:   def.name,
                tool:        event.data.tool || "unknown",
                success:     event.data.success !== false,
                recordCount: event.data.recordCount,
                error:       event.data.error,
                iteration:   event.data.iteration,
              });
            }
          },
        );
        runSuccess = result.success;
        resultText = result.message || "";
      } catch (err: unknown) {
        runSuccess = false;
        resultText = err instanceof Error ? err.message : "Agent run failed";
      }

      const parsed = extractJson(resultText);
      if (parsed) resultSummaries[def.key] = parsed;

      await storage.updateDeployment(deploymentId, {
        status:        runSuccess ? "deployed" : "failed",
        deployedAt:    new Date(),
        resultSummary: parsed ?? { rawOutput: resultText.slice(0, 500) },
      }).catch(() => { /* non-fatal */ });

      sse(res, "agent_complete", {
        agentId,
        agentName:     def.name,
        key:           def.key,
        success:       runSuccess,
        resultSummary: parsed,
      });

      if (!clientDisconnected) await new Promise<void>(r => setTimeout(r, 500));
    }

    // Final memo output from Agent 004
    const memoSummary = resultSummaries["ratingActionMemoAgent"];
    const memoText = memoSummary
      ? `Rating Watch Negative placed for ${TARGET_ISSUER}: ${JSON.stringify(memoSummary, null, 2)}`
      : `Rating Watch Negative pipeline completed for ${TARGET_ISSUER}.`;

    sse(res, "pipeline_complete", {
      message:        "All 4 Fitch RW agents completed — Rating Watch pipeline run finished",
      scenario:       `${TARGET_ISSUER} Rating Watch Negative screening`,
      summaries:      resultSummaries,
      memoText,
      pipelineStatus: "COMPLETE",
    });
  } catch (err: unknown) {
    sse(res, "error", { message: err instanceof Error ? err.message : "Pipeline error" });
  } finally {
    res.end();
  }
}

// ─── Agent runs list ──────────────────────────────────────────────────────────

export async function getFitchRWAgentRuns(_req: Request, res: Response): Promise<void> {
  try {
    type RunRecord = {
      key:           string;
      agentId:       string | null;
      agentName:     string;
      step:          number;
      agentStatus:   string;
      runId:         string | null;
      runStatus:     string;
      triggerType:   string | null;
      latencyMs:     number | null;
      startedAt:     Date | null;
      completedAt:   Date | null;
      resultSummary: unknown;
    };

    const runs: RunRecord[] = await Promise.all(
      FITCH_RW_AGENT_DEFS.map(async (def, idx) => {
        const agentId = _fitchRWAgentIdByKey[def.key] ?? null;
        if (!agentId) {
          return {
            key: def.key, agentId: null, agentName: def.name, step: idx + 1,
            agentStatus: "not_setup", runId: null, runStatus: "idle",
            triggerType: null, latencyMs: null, startedAt: null, completedAt: null, resultSummary: null,
          };
        }

        const allRuns = await storage.getAgentRuntimeRuns(agentId).catch((): Awaited<ReturnType<typeof storage.getAgentRuntimeRuns>> => []);
        const lastRun = allRuns
          .filter(r => r.status === "completed" && r.completedAt)
          .sort((a, b) => new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime())[0] ?? null;

        return {
          key:           def.key,
          agentId,
          agentName:     def.name,
          step:          idx + 1,
          agentStatus:   "active",
          runId:         lastRun?.id ?? null,
          runStatus:     lastRun?.status ?? "idle",
          triggerType:   lastRun?.triggerType ?? null,
          latencyMs:     lastRun?.latencyMs ?? null,
          startedAt:     lastRun?.startedAt ?? null,
          completedAt:   lastRun?.completedAt ?? null,
          resultSummary: lastRun?.resultSummary ?? null,
        };
      }),
    );

    res.json({ agentRuns: runs, scenario: `${TARGET_ISSUER} Rating Watch Negative Pipeline` });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
  }
}

// ─── Setup endpoint handler ───────────────────────────────────────────────────

export async function fitchRWSetupHandler(_req: Request, res: Response): Promise<void> {
  try {
    _fitchRWSetupDone = false;
    await ensureFitchRWAgents();
    res.json({
      success:     true,
      message:     "Fitch RW agents, MCP servers, skills, KBs, policies, ontology, evals, and blueprint provisioned.",
      agentCount:  FITCH_RW_AGENT_DEFS.length,
      skillCount:  FITCH_RW_SKILLS.length,
      mcpCount:    FITCH_RW_MCP_SERVERS.length,
      agents: FITCH_RW_AGENT_DEFS.map(d => ({
        key:  d.key,
        name: d.name,
        id:   _fitchRWAgentIdByKey[d.key] ?? null,
      })),
    });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : "Setup failed" });
  }
}
