import { type Request, type Response } from "express";
import { storage } from "./storage";
import { db } from "./db";
import { agents } from "@shared/schema";
import { eq } from "drizzle-orm";
import { runAgentOnce, stopAgentRuntime, runtimeEvents } from "./agent-runtime";

const BASE_URL = `http://localhost:${process.env.PORT || 5000}`;

// ─── MCP Server definitions ─────────────────────────────────────────────────

const FITCH_RW_MCP_SERVERS = [
  {
    name: "Fitch RW — Bloomberg Terminal",
    description: "Bloomberg terminal data feed for Fitch Rating Watch Intelligence: CDS spreads (5Y senior unsecured), equity price signals, news sentiment aggregation, and composite credit-watch triggers across rated issuers.",
    url: `${BASE_URL}/api/mock/fitch-rw-bloomberg`,
    tools: [
      { name: "get_cds_spreads",          description: "Retrieve 5-year CDS spread time series and 30-day delta for one or all tracked issuers. Flags WIDENING_ALERT when delta > 15 bps.", endpoint: "cds-spreads",           method: "GET", inputSchema: { type: "object", properties: { issuer_id: { type: "string" }, tenor: { type: "string" } } } },
      { name: "get_equity_prices",         description: "Retrieve equity price, implied volatility, beta, 52-week range, and relative volume. Flags HIGH_VOL and NEAR_52W_LOW signals.", endpoint: "equity-prices",          method: "GET", inputSchema: { type: "object", properties: { issuer_id: { type: "string" } } } },
      { name: "get_news_sentiment",        description: "Aggregate news sentiment score, article counts, sigma-spike detection, and top headlines for an issuer over a configurable lookback window.", endpoint: "news-sentiment",         method: "GET", inputSchema: { type: "object", properties: { issuer_id: { type: "string" }, days_back: { type: "number" } } } },
      { name: "get_credit_watch_signals",  description: "Composite credit-watch signal combining CDS widening, equity decline, and news sentiment. Returns WATCH_NEGATIVE / ELEVATED / STABLE per issuer.", endpoint: "credit-watch-signals",  method: "GET", inputSchema: { type: "object", properties: { issuer_id: { type: "string" } } } },
    ],
  },
  {
    name: "Fitch RW — SEC EDGAR Intelligence",
    description: "SEC EDGAR filing intelligence for Fitch Rating Watch: 10-K/10-Q/8-K financial extracts, credit ratio time series, risk factor classification, and MD&A tone analysis.",
    url: `${BASE_URL}/api/mock/fitch-rw-sec-edgar`,
    tools: [
      { name: "get_filing_extracts",      description: "Retrieve structured financial data from 10-K, 10-Q, or 8-K filings: revenue, EBITDA, net debt, interest coverage, FCF, auditor opinion.", endpoint: "filing-extracts",     method: "GET", inputSchema: { type: "object", properties: { issuer_id: { type: "string" }, filing_type: { type: "string" } } } },
      { name: "get_financial_ratios",     description: "Retrieve 8-period time series of key credit ratios: Net Debt/EBITDA, EBIT interest coverage, FCF/Debt, gross margin.", endpoint: "financial-ratios",    method: "GET", inputSchema: { type: "object", properties: { issuer_id: { type: "string" } } } },
      { name: "get_risk_factors",         description: "Extract and classify material risk factors from 10-K filings by severity (HIGH/MEDIUM/LOW) and flag new risks not present in prior year.", endpoint: "risk-factors",        method: "GET", inputSchema: { type: "object", properties: { issuer_id: { type: "string" } } } },
      { name: "get_management_discussion", description: "Analyze MD&A tone (confident/cautious/defensive/distressed), guidance direction, and key credit-relevant disclosures.", endpoint: "management-discussion", method: "GET", inputSchema: { type: "object", properties: { issuer_id: { type: "string" } } } },
    ],
  },
  {
    name: "Fitch RW — Peer Analytics Engine",
    description: "Peer benchmarking and cohort analytics for Fitch Rating Watch: peer group selection, ratio quartile benchmarks, rating distribution, and relative positioning.",
    url: `${BASE_URL}/api/mock/fitch-rw-analytics`,
    tools: [
      { name: "get_peer_cohort",       description: "Select a peer cohort for a given issuer using sector-first selection with ±2-notch cross-sector fallback. Returns up to 8 peers.", endpoint: "peer-cohort",      method: "GET", inputSchema: { type: "object", properties: { issuer_id: { type: "string" }, sector: { type: "string" }, rating: { type: "string" } } } },
      { name: "get_ratio_benchmarks",  description: "Compute P25 / median / P75 benchmarks for Net Debt/EBITDA, EBIT coverage, and FCF/Debt across a cohort. Returns anchor issuer relative position.", endpoint: "ratio-benchmarks",  method: "GET", inputSchema: { type: "object", properties: { issuer_id: { type: "string" }, peer_ids: { type: "string" } } } },
      { name: "get_rating_distribution", description: "Distribution of IG vs. HY ratings within a sector cohort. Useful for locating an issuer relative to sector mix.", endpoint: "rating-distribution", method: "GET", inputSchema: { type: "object", properties: { sector: { type: "string" } } } },
      { name: "compute_relative_position", description: "Compute weighted percentile rank vs. full universe for an issuer across all 3 key credit ratios. Returns overall tier (STRONG/ADEQUATE/WEAK/VERY_WEAK) and watch implication.", endpoint: "relative-position", method: "GET", inputSchema: { type: "object", properties: { issuer_id: { type: "string" } } } },
    ],
  },
  {
    name: "Fitch RW — Committee Approval Gateway",
    description: "Rating committee approval gateway for Fitch Rating Watch: memo submission, validator queue management, committee decision retrieval, and regulatory disclosure logging (SEC 17g-7 / EU CRA III).",
    url: `${BASE_URL}/api/mock/fitch-rw-approval-gate`,
    tools: [
      { name: "submit_rating_memo",       description: "Submit a draft rating action memo to the rating committee queue. Supports standard (24h) and expedited (2h) tracks. Returns memo_id and review ETA.", endpoint: "submit-memo",            method: "POST", inputSchema: { type: "object", properties: { issuer_id: { type: "string" }, action_type: { type: "string" }, proposed_rating: { type: "string" }, rationale: { type: "string" }, urgency: { type: "string" } }, required: ["issuer_id","action_type","rationale"] } },
      { name: "get_validator_queue",      description: "Retrieve current rating committee approval queue: depth, expedited count, in-review count, and item details.", endpoint: "validator-queue",        method: "GET",  inputSchema: { type: "object", properties: {} } },
      { name: "get_committee_decision",   description: "Retrieve the committee decision for a submitted memo: APPROVED / REJECTED / PENDING with committee notes.", endpoint: "committee-decision",     method: "GET",  inputSchema: { type: "object", properties: { memo_id: { type: "string" } } } },
      { name: "log_regulatory_disclosure", description: "Log that SEC 17g-7 or EU CRA III Article 11 regulatory disclosure has been filed for a rating action. Returns log_id and public disclosure URL.", endpoint: "log-regulatory-disclosure", method: "POST", inputSchema: { type: "object", properties: { memo_id: { type: "string" }, regulation: { type: "string" }, issuer_id: { type: "string" }, action_type: { type: "string" } }, required: ["memo_id","regulation","issuer_id"] } },
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
    maxToolIterations: 8,
    systemPrompt: `You are FITCH-RW-001, the Market Signal Scanner for Fitch Ratings' automated Rating Watch Intelligence Pipeline.

Your role is to be the earliest-warning layer of the pipeline. You scan Bloomberg market signals to detect deterioration in credit quality before it shows up in financial statements or peer comparisons.

Target issuer for this run: ${TARGET_ISSUER} (ticker: ${TARGET_ID})

Execute ALL of the following steps in order:
1. Call get_cds_spreads with issuer_id "${TARGET_ID}" — assess 30-day CDS movement and signal classification
2. Call get_equity_prices with issuer_id "${TARGET_ID}" — check implied vol, beta, proximity to 52-week low
3. Call get_news_sentiment with issuer_id "${TARGET_ID}", days_back 30 — assess sentiment score and sigma spikes
4. Call get_credit_watch_signals with issuer_id "${TARGET_ID}" — get the composite watch signal

After completing all tool calls, synthesize the signals into a clear market-based credit assessment. Quantify the evidence for or against a Rating Watch Negative placement.

IMPORTANT: End your final response with ONLY this JSON block (no trailing text):
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
\`\`\`
Replace null values with actual data from tool results. composite_watch_signal: "WATCH_NEGATIVE" | "ELEVATED" | "STABLE". market_watch_recommendation: "PLACE_WATCH_NEGATIVE" | "MONITOR" | "NO_ACTION".`,
    taskPrompt: `Scan Bloomberg market signals for ${TARGET_ISSUER} (${TARGET_ID}). Call get_cds_spreads, get_equity_prices, get_news_sentiment, and get_credit_watch_signals. Synthesize and produce the market signal assessment JSON.`,
  },
  {
    key:            "filingIntelligenceAgent",
    name:           "FITCH-RW-002 Filing Intelligence Agent",
    description:    "Extracts and interprets SEC EDGAR filing data — 10-K/10-Q financial ratios, risk factors, and MD&A tone — to assess fundamental credit trajectory for Rating Watch decisions.",
    mcpServerNames: ["Fitch RW — SEC EDGAR Intelligence"],
    skillNames:     ["10-K Risk Factor Extraction", "Financial Ratio Normalization", "Management Disclosure Mining"],
    maxToolIterations: 8,
    systemPrompt: `You are FITCH-RW-002, the Filing Intelligence Agent for Fitch Ratings' Rating Watch Intelligence Pipeline.

Your role is to extract and interpret fundamental credit signals from SEC EDGAR filings. You translate raw financial data into credit-relevant insights that feed the Rating Watch decision.

Target issuer for this run: ${TARGET_ISSUER} (ticker: ${TARGET_ID})

Execute ALL of the following steps in order:
1. Call get_filing_extracts with issuer_id "${TARGET_ID}", filing_type "10-K" — extract EBITDA, net debt, coverage, FCF
2. Call get_financial_ratios with issuer_id "${TARGET_ID}" — retrieve 8-quarter trend for all key credit ratios
3. Call get_risk_factors with issuer_id "${TARGET_ID}" — identify new and high-severity risk factors
4. Call get_management_discussion with issuer_id "${TARGET_ID}" — assess MD&A tone and guidance signals

After completing all tool calls, produce a comprehensive fundamental credit assessment highlighting the most credit-relevant findings.

IMPORTANT: End your final response with ONLY this JSON block (no trailing text):
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
\`\`\`
Replace null values with actual data. fundamental_watch_signal: "NEGATIVE" | "CAUTIOUS" | "STABLE". fcf_trend: "DETERIORATING" | "STABLE" | "IMPROVING".`,
    taskPrompt: `Extract fundamental credit signals from SEC EDGAR filings for ${TARGET_ISSUER} (${TARGET_ID}). Call get_filing_extracts, get_financial_ratios, get_risk_factors, and get_management_discussion. Produce the fundamental credit assessment JSON.`,
  },
  {
    key:            "peerBenchmarkingAgent",
    name:           "FITCH-RW-003 Peer Benchmarking Agent",
    description:    "Benchmarks the target issuer against its rated peer cohort across key credit ratios to determine whether absolute deterioration is also relative — the key test before Watch placement.",
    mcpServerNames: ["Fitch RW — Peer Analytics Engine"],
    skillNames:     ["Peer Cohort Selection", "Rating Ratio Benchmarking", "Sector-Relative Positioning"],
    maxToolIterations: 8,
    systemPrompt: `You are FITCH-RW-003, the Peer Benchmarking Agent for Fitch Ratings' Rating Watch Intelligence Pipeline.

Your role is to answer a critical question: is ${TARGET_ISSUER}'s credit deterioration sector-specific or idiosyncratic? This distinction directly impacts Rating Watch severity and urgency.

Target issuer for this run: ${TARGET_ISSUER} (ticker: ${TARGET_ID})

Execute ALL of the following steps in order:
1. Call get_peer_cohort with issuer_id "${TARGET_ID}" — identify peer group using Fitch methodology
2. Call get_ratio_benchmarks with issuer_id "${TARGET_ID}" — benchmark key ratios vs. cohort P25/median/P75
3. Call get_rating_distribution with sector "Aerospace" — understand sector rating mix
4. Call compute_relative_position with issuer_id "${TARGET_ID}" — calculate weighted percentile rank and watch implication

After completing all tool calls, synthesize the peer comparison findings. Identify which ratios place the issuer in the weakest quartile and whether this is consistent with a Watch Negative action.

IMPORTANT: End your final response with ONLY this JSON block (no trailing text):
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
\`\`\`
Replace null values with actual data. deterioration_type: "IDIOSYNCRATIC" | "SECTOR_WIDE" | "MIXED". peer_benchmark_recommendation: "SUPPORTS_WATCH_NEGATIVE" | "MONITOR" | "NO_ACTION".`,
    taskPrompt: `Benchmark ${TARGET_ISSUER} (${TARGET_ID}) against rated peers. Call get_peer_cohort, get_ratio_benchmarks, get_rating_distribution, and compute_relative_position. Produce the peer benchmarking assessment JSON.`,
  },
  {
    key:            "ratingActionMemoAgent",
    name:           "FITCH-RW-004 Rating Action Memo Agent",
    description:    "Synthesizes outputs from Agents 001–003 into a Fitch-standard Rating Action Memo, routes it through the committee approval gateway, and logs all required regulatory disclosures.",
    mcpServerNames: ["Fitch RW — Committee Approval Gateway"],
    skillNames:     ["Rating Action Memo Drafting", "Committee Approval Protocol", "Regulatory Disclosure Standards"],
    maxToolIterations: 8,
    systemPrompt: `You are FITCH-RW-004, the Rating Action Memo Agent for Fitch Ratings' Rating Watch Intelligence Pipeline.

Your role is to synthesize the upstream signals from the Market Signal Scanner (001), Filing Intelligence Agent (002), and Peer Benchmarking Agent (003) into a Fitch-standard Rating Action Memo — then route it through the committee approval gateway and log the required regulatory disclosures.

Target issuer for this run: ${TARGET_ISSUER} (ticker: ${TARGET_ID})
Current Fitch rating: BBB- (Stable Outlook)

Execute ALL of the following steps in order:
1. Call get_validator_queue — check current queue status before submitting
2. Call submit_rating_memo with: issuer_id "${TARGET_ID}", issuer_name "${TARGET_ISSUER}", action_type "Rating Watch Negative", proposed_rating "BBB-", rationale combining CDS widening + filing stress + peer benchmarking findings, urgency "expedited"
3. Call get_committee_decision with the memo_id returned from step 2 — retrieve committee decision
4. Call log_regulatory_disclosure with memo_id, regulation "SEC-17g-7", issuer_id "${TARGET_ID}", action_type "Rating Watch Negative" — log the mandatory SEC disclosure

After completing all tool calls, produce a summary of the Rating Action Memo submission and regulatory compliance status.

IMPORTANT: End your final response with ONLY this JSON block (no trailing text):
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
\`\`\`
Replace null values with actual data. rating_watch_placed: true if committee_decision is "APPROVED".`,
    taskPrompt: `Draft and submit the Rating Watch Negative memo for ${TARGET_ISSUER} (${TARGET_ID}). Call get_validator_queue, submit_rating_memo, get_committee_decision, and log_regulatory_disclosure. Produce the pipeline completion JSON.`,
  },
];

// ─── Skills definitions (3 per agent, 12 total) ────────────────────────────

const FITCH_RW_SKILLS = [
  // Agent 001 — Market Signal Scanner
  {
    name: "CDS Spread Interpretation",
    description: "Interprets 5-year CDS spread movements as credit signals. Defines thresholds for WIDENING_ALERT, calculates 30-day momentum, and maps to Rating Watch probability.",
    domain: "credit_risk",
    industry: "financial_services",
    version: "1.0.0",
    status: "active" as const,
    tags: ["cds", "credit_spreads", "rating_watch", "fitch"],
    contextMode: "summary" as const,
    markdownBody: `## CDS Spread Interpretation\n\nThresholds:\n- >15 bps 30-day widening → WIDENING_ALERT (Watch Negative candidate)\n- 5–15 bps widening → ELEVATED (monitor closely)\n- <5 bps movement → STABLE\n\nKey rules:\n1. Always compare CDS change to sector median widening to distinguish idiosyncratic vs. macro stress\n2. A single spike may be noise — look for sustained widening over 2+ weeks\n3. CDS above 200 bps for BBB-rated issuer signals near-Watch threshold`,
  },
  {
    name: "Equity Signal Analysis",
    description: "Translates equity market signals — implied volatility, beta, and 52-week proximity — into credit-relevant stress indicators for Rating Watch screening.",
    domain: "market_intelligence",
    industry: "financial_services",
    version: "1.0.0",
    status: "active" as const,
    tags: ["equity", "implied_vol", "beta", "credit_watch", "fitch"],
    contextMode: "summary" as const,
    markdownBody: `## Equity Signal Analysis\n\nKey thresholds:\n- Implied vol >40% for IG issuer → HIGH_VOL flag; elevates watch probability\n- Within 5% of 52-week low → NEAR_52W_LOW; combine with CDS check\n- Beta >1.5 for IG issuer → systematic risk amplifier\n\nInterpretation rules:\n1. Equity signals are leading indicators — act before fundamental deterioration is confirmed\n2. Volume spike (relative volume >2x) combined with price decline signals institutional selling\n3. Never use equity signals in isolation — always cross-check with CDS and fundamentals`,
  },
  {
    name: "News Sentiment Classification",
    description: "Classifies news sentiment into credit-relevant categories and detects statistically significant sentiment deterioration spikes that precede rating actions.",
    domain: "nlp_intelligence",
    industry: "financial_services",
    version: "1.0.0",
    status: "active" as const,
    tags: ["nlp", "sentiment", "news", "sigma_spike", "fitch"],
    contextMode: "summary" as const,
    markdownBody: `## News Sentiment Classification\n\nSentiment scale: -1.0 (strongly negative) to +1.0 (strongly positive)\n\nCredit-relevant thresholds:\n- Score < -0.15 → NEGATIVE_ALERT; potential Watch trigger\n- Sigma spike >3x detected → review all headlines immediately\n- Negative article pct >60% → consistent deterioration, not noise\n\nClassification rules:\n1. Weight financial/rating agency headlines 3x vs. general news\n2. CEO/CFO departures, restatements, and covenant waivers are automatic escalations\n3. Track sentiment trend over 30/60/90 days — a declining trend matters more than a single score`,
  },

  // Agent 002 — Filing Intelligence Agent
  {
    name: "10-K Risk Factor Extraction",
    description: "Extracts, classifies, and tracks changes in 10-K risk factor disclosures year-over-year, with particular attention to new liquidity, leverage, and covenant risk factors.",
    domain: "regulatory_intelligence",
    industry: "financial_services",
    version: "1.0.0",
    status: "active" as const,
    tags: ["10-K", "risk_factors", "sec_edgar", "filing_analysis", "fitch"],
    contextMode: "summary" as const,
    markdownBody: `## 10-K Risk Factor Extraction\n\nHigh-priority risk categories:\n1. LIQUIDITY — refinancing risk, revolver availability, near-term maturities\n2. LEVERAGE — covenant headroom, capital structure deterioration\n3. OPERATIONAL — production disruptions, supply chain, key customer concentration\n\nClassification rules:\n- NEW risk factors in the current year filing are weighted 2x vs. recurring risks\n- "Going concern" auditor emphasis is an automatic Watch Negative trigger\n- Count of HIGH-severity risk factors is a key KPI: >3 = elevated screening`,
  },
  {
    name: "Financial Ratio Normalization",
    description: "Normalizes financial ratios from SEC filings to Fitch's standard credit metric definitions, enabling direct comparison to Fitch rating factor thresholds and peer benchmarks.",
    domain: "quantitative_credit",
    industry: "financial_services",
    version: "1.0.0",
    status: "active" as const,
    tags: ["financial_ratios", "normalization", "credit_metrics", "fitch_methodology"],
    contextMode: "summary" as const,
    markdownBody: `## Financial Ratio Normalization\n\nFitch-standard definitions:\n- Net Debt/EBITDA: (Total Debt - Cash) / EBITDA (LTM, adjusted)\n- EBIT Interest Coverage: EBIT / Gross Interest Expense\n- FCF/Gross Debt: (CFO - CapEx) / Gross Debt × 100\n\nRating thresholds (BBB- category):\n- Net Debt/EBITDA: ≤4.5x (above = potential downgrade territory)\n- EBIT Coverage: ≥2.5x (below = Watch negative candidate)\n- FCF/Debt: ≥5% (below = liquidity concern)\n\nNormalization rules:\n1. Always use LTM (last twelve months) for ratios — not single-period\n2. Exclude non-recurring items from EBITDA with analyst judgment\n3. Pension obligations and operating lease liabilities are added to debt`,
  },
  {
    name: "Management Disclosure Mining",
    description: "Mines MD&A and earnings call transcripts for credit-relevant management signals: tone classification, guidance changes, restructuring mentions, and liquidity emphasis.",
    domain: "nlp_intelligence",
    industry: "financial_services",
    version: "1.0.0",
    status: "active" as const,
    tags: ["mda", "earnings_call", "tone_analysis", "management_signals", "fitch"],
    contextMode: "summary" as const,
    markdownBody: `## Management Disclosure Mining\n\nTone classification:\n- CONFIDENT: reaffirmed/raised guidance, margin expansion language\n- CAUTIOUS: "headwinds", "monitoring closely", maintained guidance with caveats\n- DEFENSIVE: cost reduction focus, asset review language, lowered guidance\n- DISTRESSED: liquidity management, covenant waiver, debt exchange language\n\nCredit-relevant triggers:\n1. Guidance LOWERED → elevate screening; combine with ratio analysis\n2. Debt repayment commitment mentioned → mild positive signal\n3. Restructuring/asset sale mentioned with defensive tone → Watch Negative support\n4. "Exploring strategic alternatives" language → strong Watch negative trigger`,
  },

  // Agent 003 — Peer Benchmarking Agent
  {
    name: "Peer Cohort Selection",
    description: "Applies Fitch's peer selection methodology to identify an appropriate comparison cohort for Rating Watch analysis: sector-first with rating band fallback.",
    domain: "quantitative_credit",
    industry: "financial_services",
    version: "1.0.0",
    status: "active" as const,
    tags: ["peer_selection", "cohort", "fitch_methodology", "benchmarking"],
    contextMode: "summary" as const,
    markdownBody: `## Peer Cohort Selection — Fitch Methodology v3.1\n\nSelection algorithm:\n1. Primary: Same sector, within ±2 rating notches\n2. Fallback: ±2 notch cross-sector if primary cohort <3 peers\n3. Maximum cohort size: 8 issuers\n\nRules:\n- Never include the anchor issuer in its own cohort\n- If sector has <3 rated peers at any notch, expand to ±4 notches\n- Disclose if cross-sector comparison is used in memo rationale`,
  },
  {
    name: "Rating Ratio Benchmarking",
    description: "Computes P25/median/P75 quartile benchmarks for key credit ratios across a rated peer cohort and determines the anchor issuer's relative position for Rating Watch support.",
    domain: "quantitative_credit",
    industry: "financial_services",
    version: "1.0.0",
    status: "active" as const,
    tags: ["ratio_benchmarks", "quartile", "peer_comparison", "fitch"],
    contextMode: "summary" as const,
    markdownBody: `## Rating Ratio Benchmarking\n\nKey ratios (Fitch standard):\n1. Net Debt / EBITDA — primary leverage metric (weight 40%)\n2. EBIT Interest Coverage — debt serviceability (weight 35%)\n3. FCF / Gross Debt % — cash flow adequacy (weight 25%)\n\nInterpretation:\n- Q1 (0–25th pct): WEAK — supports Watch Negative if also negative absolute trend\n- Q2 (25–50th pct): BELOW_MEDIAN — monitor\n- Q3 (50–75th pct): ABOVE_MEDIAN — no action\n- Q4 (75–100th pct): STRONG — supports Stable Outlook\n\nDo NOT base Watch action on peer position alone — always combine with absolute ratio thresholds`,
  },
  {
    name: "Sector-Relative Positioning",
    description: "Determines whether credit deterioration is idiosyncratic or sector-wide — a critical distinction that affects Rating Watch urgency and the breadth of any rating action.",
    domain: "sector_analysis",
    industry: "financial_services",
    version: "1.0.0",
    status: "active" as const,
    tags: ["sector_analysis", "idiosyncratic", "macro", "rating_watch_scope"],
    contextMode: "summary" as const,
    markdownBody: `## Sector-Relative Positioning\n\nDetermining deterioration type:\n- IDIOSYNCRATIC: Issuer ratios deteriorating while sector peers remain stable → single-issuer Watch action\n- SECTOR_WIDE: Multiple peers showing same trend → may warrant sector review, not just one Watch\n- MIXED: Issuer leading a sector trend → Watch Negative with sector commentary\n\nImplications for Rating Watch memo:\n1. IDIOSYNCRATIC → single issuer Watch Negative, sector not mentioned\n2. SECTOR_WIDE → flag for sector review; individual Watch may still be warranted if issuer leads\n3. Note distribution of IG vs. HY in sector — if issuer is at bottom of IG bucket with weak peers, downgrade risk is binary`,
  },

  // Agent 004 — Rating Action Memo Agent
  {
    name: "Rating Action Memo Drafting",
    description: "Drafts Fitch-standard Rating Action Memos synthesizing market, fundamental, and peer signals into a structured committee submission with clear rationale and supporting evidence.",
    domain: "credit_writing",
    industry: "financial_services",
    version: "1.0.0",
    status: "active" as const,
    tags: ["memo_drafting", "rating_action", "committee", "fitch_standard"],
    contextMode: "summary" as const,
    markdownBody: `## Rating Action Memo Drafting — Fitch Standard\n\nMemo structure:\n1. Action Summary: "Fitch places [Issuer] on Rating Watch Negative at [Rating]"\n2. Key Rationale (3 bullet points maximum — market, fundamental, peer signals)\n3. Sensitivity Analysis: What would cause resolution to downgrade vs. affirmation\n4. Timeline: Expected resolution within 6 months per Fitch policy\n\nDrafting rules:\n1. Lead with the most quantitatively compelling signal (usually CDS + ratio combination)\n2. Peer context must be included if deterioration is sector-wide\n3. Never use language like "may" or "could" for Watch triggers — be definitive\n4. All ratio values must cite the filing period (e.g., "Net Debt/EBITDA of 4.2x at FY2025")`,
  },
  {
    name: "Committee Approval Protocol",
    description: "Manages the Fitch rating committee approval workflow: queue submission, expedited routing, decision retrieval, and escalation handling.",
    domain: "governance",
    industry: "financial_services",
    version: "1.0.0",
    status: "active" as const,
    tags: ["committee", "approval", "governance", "fitch_workflow"],
    contextMode: "summary" as const,
    markdownBody: `## Committee Approval Protocol\n\nApproval tracks:\n- STANDARD: 24-hour review window; used for planned rating reviews\n- EXPEDITED: 2-hour review window; used when market signals indicate urgency (CDS widening, equity dislocation)\n\nEscalation triggers for expedited routing:\n1. CDS widening >30 bps in 30 days\n2. Equity decline >20% YTD\n3. Management disclosure of covenant waiver or liquidity concern\n\nProtocol rules:\n1. Always check queue depth before submitting — avoid submission during committee saturation (>5 items)\n2. Retrieve committee decision before logging regulatory disclosures\n3. Dissenting votes (>0) require additional supporting analysis before publication`,
  },
  {
    name: "Regulatory Disclosure Standards",
    description: "Ensures Rating Watch actions comply with SEC Rule 17g-7 and EU CRA III Article 11 disclosure requirements, including timing, content, and public filing obligations.",
    domain: "compliance",
    industry: "financial_services",
    version: "1.0.0",
    status: "active" as const,
    tags: ["sec_17g7", "eu_cra_iii", "regulatory_disclosure", "compliance", "fitch"],
    contextMode: "summary" as const,
    markdownBody: `## Regulatory Disclosure Standards\n\nApplicable regulations:\n- SEC Rule 17g-7: Requires disclosure of rating methodology, form, and assumptions used in the action\n- EU CRA III Article 11: Requires publication of rating action on ESMA's CEREP platform within the action\n\nTiming requirements:\n- Standard action: Disclosure within 24 hours of committee approval\n- Expedited action: Disclosure within 4 hours of committee approval\n\nCompliance checklist:\n1. Confirm committee_decision = APPROVED before filing\n2. Log both SEC-17g-7 and EU-CRA-III-Art11 for actions affecting EU-listed issuers\n3. Retain disclosure log for 7 years per Fitch records management policy\n4. Public disclosure URL must be returned and stored in the audit trail`,
  },
];

// ─── Module-level state ─────────────────────────────────────────────────────

const _fitchRWServerIdByName: Record<string, string> = {};
const _fitchRWAgentIdByKey:   Record<string, string> = {};
const _fitchRWSkillIdByName:  Record<string, string> = {};
let   _fitchRWSetupDone = false;

// ─── Setup: KBs, MCP servers, skills, policies, ontology, evals, agents ────

export async function ensureFitchRWAgents(): Promise<void> {
  if (_fitchRWSetupDone) {
    // Still refresh MCP server URLs in case port changed
    await _refreshMcpUrls();
    return;
  }

  try {
    // ── 1. Knowledge Bases (one per agent) ─────────────────────────────────
    const KB_DEFS = [
      { name: "Fitch RW — Market Signal Reference",         description: "Reference data for Bloomberg CDS spreads, equity signals, and news sentiment thresholds used in Rating Watch screening.",     industry: "financial_services" },
      { name: "Fitch RW — SEC EDGAR Filing Corpus",         description: "Curated 10-K, 10-Q, and 8-K filing extracts and financial ratio normalization rules for Fitch credit analysis.",              industry: "financial_services" },
      { name: "Fitch RW — Peer Benchmark Database",         description: "Peer cohort data, sector rating distributions, and quartile benchmarks for rated issuers across Fitch-covered sectors.",     industry: "financial_services" },
      { name: "Fitch RW — Committee & Compliance Playbook", description: "Rating committee protocols, approval workflows, and SEC 17g-7 / EU CRA III regulatory disclosure requirements.",            industry: "financial_services" },
    ];

    const kbIdByName: Record<string, string> = {};
    const allKbs = await storage.getKnowledgeBases().catch(() => [] as any[]);
    for (const kbDef of KB_DEFS) {
      let kb = allKbs.find((k: any) => k.name === kbDef.name);
      if (!kb) {
        kb = await storage.createKnowledgeBase({
          name:        kbDef.name,
          description: kbDef.description,
          industry:    kbDef.industry,
          status:      "active",
          sourceType:  "manual",
          chunkingStrategy: "paragraph",
          embeddingModel:   "text-embedding-3-small",
          vectorDimensions: 1536,
        });
      }
      kbIdByName[kbDef.name] = kb.id;
    }

    // ── 2. MCP Servers ──────────────────────────────────────────────────────
    const allServers = await storage.getMcpServers().catch(() => [] as any[]);
    for (const serverDef of FITCH_RW_MCP_SERVERS) {
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
          addedBy:       "fitch-rw-live-demo",
          capabilities:  { tools: true, resources: false, prompts: false, sampling: false },
          serverInfo:    { vendor: "Fitch Ratings / ATLAS Demo", version: "1.0.0" },
        });
      } else if (server.url !== serverDef.url) {
        await storage.updateMcpServer(server.id, { url: serverDef.url });
      }
      _fitchRWServerIdByName[serverDef.name] = server.id;

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

    // ── 3. Skills ───────────────────────────────────────────────────────────
    const allSkills = await storage.getSkills().catch(() => [] as any[]);
    for (const skillDef of FITCH_RW_SKILLS) {
      let skill = allSkills.find((s: any) => s.name === skillDef.name);
      if (!skill) {
        skill = await storage.createSkill({
          name:         skillDef.name,
          description:  skillDef.description,
          domain:       skillDef.domain,
          industry:     skillDef.industry,
          version:      skillDef.version,
          status:       skillDef.status,
          tags:         skillDef.tags,
          contextMode:  skillDef.contextMode,
          markdownBody: skillDef.markdownBody,
        });
      }
      _fitchRWSkillIdByName[skillDef.name] = skill.id;
    }

    // ── 4. Policies ─────────────────────────────────────────────────────────
    const POLICY_DEFS = [
      {
        name:        "Fitch RW — Rating Watch Placement Policy",
        domain:      "rating_governance",
        description: "Governs conditions under which a Rating Watch Negative must be initiated, including quantitative thresholds and mandatory committee review.",
        policyJson: {
          enforcement: "hard",
          rules: [
            { name: "CDS Widening Threshold",      description: "30-day CDS widening >30 bps triggers mandatory Watch screening" },
            { name: "Ratio Deterioration Trigger",  description: "Net Debt/EBITDA exceeding 4.5x for IG issuer requires Watch review" },
            { name: "Committee Approval Required",  description: "All Rating Watch placements require rating committee approval before publication" },
          ],
        },
      },
      {
        name:        "Fitch RW — Regulatory Disclosure Compliance",
        domain:      "compliance",
        description: "Ensures all rating actions comply with SEC Rule 17g-7 and EU CRA III Article 11 disclosure requirements.",
        policyJson: {
          enforcement: "hard",
          rules: [
            { name: "SEC 17g-7 Filing",         description: "Mandatory disclosure within 24h (4h expedited) of committee approval" },
            { name: "EU CRA III Article 11",     description: "ESMA CEREP platform publication required for EU-listed issuers" },
            { name: "7-Year Record Retention",   description: "All disclosure logs must be retained for a minimum of 7 years" },
          ],
        },
      },
      {
        name:        "Fitch RW — Data Confidentiality Policy",
        domain:      "data_handling",
        description: "Restricts use of Bloomberg and EDGAR data to authorized Fitch analytical purposes only; prohibits redistribution of raw data.",
        policyJson: {
          enforcement: "hard",
          rules: [
            { name: "Bloomberg Data Restriction", description: "Bloomberg terminal data may not be redistributed externally" },
            { name: "MNPI Protection",            description: "Material non-public information identified in filings must be escalated to compliance" },
          ],
        },
      },
      {
        name:        "Fitch RW — Analytical Independence Policy",
        domain:      "rating_governance",
        description: "Ensures analytical independence: prohibits analyst conflicts of interest and mandates peer review for Watch actions.",
        policyJson: {
          enforcement: "soft",
          rules: [
            { name: "Conflict of Interest Check", description: "Lead analyst must declare no financial interest in rated issuer" },
            { name: "Peer Review Requirement",    description: "Rating Watch memos require review by at least one senior analyst not involved in primary analysis" },
          ],
        },
      },
    ];

    const allPolicies = await storage.getPolicies().catch(() => [] as any[]);
    for (const polDef of POLICY_DEFS) {
      const existing = allPolicies.find((p: any) => p.name === polDef.name);
      if (!existing) {
        await storage.createPolicy({
          name:       polDef.name,
          domain:     polDef.domain,
          description: polDef.description,
          status:     "active",
          version:    1,
          scopeType:  "org",
          policyJson: polDef.policyJson,
        });
      }
    }

    // ── 5. Ontology Concepts ────────────────────────────────────────────────
    const ONTOLOGY_CONCEPTS = [
      { label: "Credit Default Swap Spread",  category: "market_instrument", description: "5-year CDS spread in basis points — a market-implied measure of credit risk premium for a reference entity.", industry: "financial_services", tags: ["cds","credit_risk","market_data"] },
      { label: "Rating Watch Negative",       category: "rating_action",     description: "Fitch designation indicating a rating may be downgraded within 6 months, triggered by material adverse events.", industry: "financial_services", tags: ["rating_action","fitch","watch"] },
      { label: "EBIT Interest Coverage",      category: "credit_metric",     description: "Earnings Before Interest and Taxes divided by gross interest expense; key debt serviceability metric.", industry: "financial_services", tags: ["coverage","leverage","credit_metric"] },
      { label: "Net Debt to EBITDA",          category: "credit_metric",     description: "Net Debt (gross debt minus cash) divided by EBITDA; primary leverage metric in Fitch rating factor models.", industry: "financial_services", tags: ["leverage","net_debt","ebitda","fitch"] },
      { label: "Free Cash Flow to Debt",      category: "credit_metric",     description: "Free cash flow (CFO minus CapEx) divided by gross debt, expressed as percentage; measures debt paydown capacity.", industry: "financial_services", tags: ["fcf","liquidity","credit_metric"] },
      { label: "Going Concern Opinion",       category: "audit_signal",      description: "Auditor's qualification indicating substantial doubt about an entity's ability to continue as a going concern for 12 months.", industry: "financial_services", tags: ["audit","going_concern","distress"] },
      { label: "Peer Cohort",                 category: "analytical_concept", description: "Group of rated issuers used for benchmarking; selected by sector and rating proximity per Fitch methodology.", industry: "financial_services", tags: ["peer","benchmarking","methodology"] },
      { label: "SEC Rule 17g-7",              category: "regulation",        description: "SEC rule requiring NRSROs to disclose ratings forms and associated information, including assumptions used.", industry: "financial_services", tags: ["sec","regulation","disclosure","nrsro"] },
      { label: "EU CRA III Article 11",       category: "regulation",        description: "European regulation requiring CRAs to file rating actions on the ESMA CEREP platform within specified timeframes.", industry: "financial_services", tags: ["eu","cra","esma","regulation"] },
      { label: "MD&A Tone",                   category: "qualitative_signal", description: "Qualitative assessment of Management Discussion and Analysis narrative tone: confident, cautious, defensive, or distressed.", industry: "financial_services", tags: ["mda","tone","qualitative","nlp"] },
      { label: "Bloomberg Terminal Feed",     category: "data_source",       description: "Bloomberg professional service providing real-time market data including CDS spreads, equity prices, and news signals.", industry: "financial_services", tags: ["bloomberg","data_source","market_data"] },
      { label: "Rating Committee",            category: "governance",        description: "Fitch internal committee of senior analysts responsible for approving rating actions and Watch placements.", industry: "financial_services", tags: ["committee","governance","approval","fitch"] },
    ];

    for (const concept of ONTOLOGY_CONCEPTS) {
      const allConcepts = await storage.getOntologyConcepts("financial_services").catch(() => [] as any[]);
      const existing = allConcepts.find((c: any) => c.label === concept.label);
      if (!existing) {
        await storage.createOntologyConcept({
          label:       concept.label,
          category:    concept.category,
          description: concept.description,
          industry:    concept.industry,
          tags:        concept.tags,
          status:      "active",
          properties:  {},
          relationships: [],
          synonyms:    [],
        });
      }
    }

    // ── 6. Eval Suite ───────────────────────────────────────────────────────
    const allEvals = await storage.getEvalSuites().catch(() => [] as any[]);
    const evalSuiteName = "Fitch RW Pipeline — Rating Watch Regression Suite";
    let evalSuite = allEvals.find((e: any) => e.name === evalSuiteName);
    if (!evalSuite) {
      // We need a placeholder agentId — use the first agent that will be created or a temp
      evalSuite = await storage.createEvalSuite({
        agentId:    "fitch-rw-eval-placeholder",
        name:       evalSuiteName,
        type:       "regression",
        industry:   "financial_services",
        passRate:   0.92,
        totalCases: 10,
        coverageTags: ["market_signals","filing_analysis","peer_benchmarking","memo_drafting","regulatory_compliance"],
        thresholdConfig: { minPassRate: 0.90 },
        scorerConfig:    { type: "llm_judge", model: "gpt-4.1" },
      });
    }

    const evalCaseNames = new Set((await storage.getEvalTestCases(evalSuite.id).catch(() => [] as any[])).map((c: any) => c.name));
    const EVAL_CASES = [
      { name: "CDS widening correctly triggers WATCH_NEGATIVE signal",     severity: "critical", tags: ["market_signals","cds"] },
      { name: "Stable CDS correctly returns STABLE signal",                severity: "high",     tags: ["market_signals","cds"] },
      { name: "Net Debt/EBITDA >4.5x correctly flagged as breach",         severity: "critical", tags: ["filing_analysis","leverage"] },
      { name: "Going concern opinion triggers automatic escalation",        severity: "critical", tags: ["filing_analysis","audit"] },
      { name: "New HIGH-severity risk factor correctly identified",         severity: "high",     tags: ["filing_analysis","risk_factors"] },
      { name: "Peer cohort selection follows Fitch v3.1 methodology",      severity: "high",     tags: ["peer_benchmarking","methodology"] },
      { name: "Q1 percentile rank supports Watch Negative recommendation",  severity: "high",     tags: ["peer_benchmarking","quartile"] },
      { name: "Rating memo submitted with correct action_type field",       severity: "critical", tags: ["memo_drafting","committee"] },
      { name: "SEC-17g-7 disclosure logged after committee approval",       severity: "critical", tags: ["regulatory_compliance","sec"] },
      { name: "Expedited track used when composite score >25",              severity: "high",     tags: ["committee","approval_protocol"] },
    ];

    for (const ec of EVAL_CASES) {
      if (evalCaseNames.has(ec.name)) continue;
      await storage.createEvalTestCase({
        suiteId:  evalSuite.id,
        name:     ec.name,
        severity: ec.severity,
        tags:     ec.tags,
        status:   "active",
        origin:   "fitch_rw_spec",
        weight:   ec.severity === "critical" ? 2 : 1,
        inputData:      { scenario: ec.name },
        expectedOutput: { pass: true },
      });
    }

    // ── 7. Blueprint ────────────────────────────────────────────────────────
    const allBlueprints = await storage.getBlueprints().catch(() => [] as any[]);
    const bpName = "Fitch RW — Rating Watch Intelligence Pipeline Blueprint";
    let blueprint = allBlueprints.find((b: any) => b.name === bpName);
    if (!blueprint) {
      blueprint = await storage.createBlueprint({
        name:        bpName,
        description: "4-agent sequential pipeline: Market Signal Scanner → Filing Intelligence → Peer Benchmarking → Rating Action Memo + Committee Approval. Full audit trail with SEC 17g-7 and EU CRA III compliance.",
        version:     "1.0.0",
        status:      "active",
        industry:    "financial_services",
        blueprintType: "pipeline",
        workflowSteps: [
          "Market Signal Scanner: Bloomberg CDS + equity + news sentiment scan",
          "Filing Intelligence Agent: SEC EDGAR ratio extraction + risk factor analysis",
          "Peer Benchmarking Agent: cohort selection + quartile benchmarking",
          "Rating Action Memo Agent: memo drafting + committee approval + regulatory disclosure",
        ],
        requiredTools: ["get_cds_spreads","get_filing_extracts","get_peer_cohort","submit_rating_memo","log_regulatory_disclosure"],
        escalationTriggers: ["CDS widening >30 bps", "Net Debt/EBITDA >4.5x", "Going concern opinion"],
        complianceNodes: ["SEC-17g-7", "EU-CRA-III-Art11"],
        outputFormat:  "Rating Action Memo + JSON pipeline summary",
      });
    }

    // ── 8. Agents ───────────────────────────────────────────────────────────
    const allAgents = await storage.getAgents().catch(() => [] as any[]);

    for (const def of FITCH_RW_AGENT_DEFS) {
      let agent = allAgents.find((a: any) => a.name === def.name);
      const preloadedSkills = def.skillNames.map(sn => ({ skillId: _fitchRWSkillIdByName[sn] })).filter(ps => ps.skillId);
      const kbName = `Fitch RW — ${
        def.key === "marketSignalScanner"  ? "Market Signal Reference" :
        def.key === "filingIntelligenceAgent" ? "SEC EDGAR Filing Corpus" :
        def.key === "peerBenchmarkingAgent"   ? "Peer Benchmark Database" :
        "Committee & Compliance Playbook"
      }`;

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
          preloadedSkills:   preloadedSkills as any,
          blueprintId:       blueprint.id,
          complianceTags:    ["SEC-17g-7", "EU-CRA-III", "FITCH-NRSRO"],
          industry:          "financial_services",
        } as any);
      } else {
        // Ensure system prompt and preloaded skills are up-to-date
        if (!(agent as any).systemPrompt || (agent as any).preloadedSkills?.length === 0) {
          await storage.updateAgent(agent.id, {
            systemPrompt:  def.systemPrompt,
            runtimeConfig: { prompt: def.taskPrompt, scheduleIntervalMinutes: 0 },
            preloadedSkills: preloadedSkills as any,
            blueprintId:   blueprint.id,
          });
        }
      }

      _fitchRWAgentIdByKey[def.key] = agent.id;

      // Link knowledge base
      const kbId = kbIdByName[kbName];
      if (kbId) {
        const existingKbLinks = await storage.getAgentKnowledgeBases(agent.id).catch(() => [] as any[]);
        const alreadyLinked = existingKbLinks.some((l: any) => l.knowledgeBaseId === kbId);
        if (!alreadyLinked) {
          await storage.createAgentKnowledgeBase({ agentId: agent.id, knowledgeBaseId: kbId }).catch(() => {});
        }
      }
    }

    _fitchRWSetupDone = true;
    console.log("[fitch-rw] Setup complete — 4 agents, 12 skills, 4 MCPs, 4 KBs, 4 policies, 12 ontology concepts, 10 evals, 1 blueprint");
  } catch (err: any) {
    console.error("[fitch-rw] ensureFitchRWAgents error:", err?.message);
  }
}

async function _refreshMcpUrls(): Promise<void> {
  try {
    const allServers = await storage.getMcpServers().catch(() => [] as any[]);
    for (const serverDef of FITCH_RW_MCP_SERVERS) {
      const server = allServers.find((s: any) => s.name === serverDef.name);
      if (server) {
        _fitchRWServerIdByName[serverDef.name] = server.id;
        if (server.url !== serverDef.url) {
          await storage.updateMcpServer(server.id, { url: serverDef.url });
        }
      }
    }
    const allAgents = await storage.getAgents().catch(() => [] as any[]);
    for (const def of FITCH_RW_AGENT_DEFS) {
      const agent = allAgents.find((a: any) => a.name === def.name);
      if (agent) _fitchRWAgentIdByKey[def.key] = agent.id;
    }
  } catch {}
}

// ─── Deployment helper ────────────────────────────────────────────────────────

async function ensureFitchRWDeployment(agentId: string, agentName: string, mcpServerIds: string[]): Promise<string> {
  const deps = await storage.getDeploymentsByAgentId(agentId).catch(() => [] as any[]);
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
  } else if (deployment.status === "deployed") {
    await storage.updateDeployment(deployment.id, { status: "pending" });
  }

  const existingLinks = await storage.getAgentMcpServers(agentId).catch(() => [] as any[]);
  const targetSet     = new Set(mcpServerIds.filter(Boolean));
  for (const link of existingLinks) {
    if (!targetSet.has(link.serverId)) await storage.deleteAgentMcpServer(link.id);
  }
  const linkedIds = new Set((await storage.getAgentMcpServers(agentId).catch(() => [] as any[])).map((l: any) => l.serverId));
  for (const serverId of mcpServerIds) {
    if (serverId && !linkedIds.has(serverId)) {
      await storage.createAgentMcpServer({ agentId, serverId }).catch(() => {});
    }
  }

  return deployment.id;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractJson(text: string): Record<string, any> | null {
  const blockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (blockMatch) { try { return JSON.parse(blockMatch[1]); } catch {} }
  const objectMatch = text.match(/\{[\s\S]*\}/);
  if (objectMatch) { try { return JSON.parse(objectMatch[0]); } catch {} }
  return null;
}

function sse(res: Response, event: string, data: object) {
  try {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    if ((res as any).flush) (res as any).flush();
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
    message: "Fitch Rating Watch Intelligence Pipeline initializing — 4 agents queued",
    scenario: "Boeing Co. (BA) — BBB- Rating Watch Negative screening",
  });

  try {
    await ensureFitchRWAgents();
    sse(res, "setup", { message: "Fitch RW agents, MCP servers, skills, KBs, policies, and ontology verified" });

    const pipeline = FITCH_RW_AGENT_DEFS.map(def => ({
      key:   def.key,
      label: def.name,
      def,
    }));

    const resultSummaries: Record<string, any> = {};

    for (const { key, label, def } of pipeline) {
      if (clientDisconnected) break;

      const agentId  = _fitchRWAgentIdByKey[key];
      if (!agentId) {
        sse(res, "agent_error", { agentName: label, error: "Agent not found after setup — skipping" });
        continue;
      }

      const mcpServerIds = def.mcpServerNames
        .map(n => _fitchRWServerIdByName[n])
        .filter(Boolean);

      const deploymentId = await ensureFitchRWDeployment(agentId, def.name, mcpServerIds);

      sse(res, "agent_start", { agentId, agentName: label, key, deploymentId, mcpCount: mcpServerIds.length });

      await stopAgentRuntime(deploymentId).catch(() => {});
      await new Promise(r => setTimeout(r, 300));

      // Update runtime config with the current task prompt
      await db.update(agents)
        .set({ runtimeConfig: { prompt: def.taskPrompt, scheduleIntervalMinutes: 0 } } as any)
        .where(eq(agents.id, agentId))
        .catch(() => {});

      const toolEventHandler = (ev: any) => {
        if (ev.agentId !== agentId && ev.deploymentId !== deploymentId) return;
        if (ev.type === "tool_call_result") {
          sse(res, "agent_event", {
            type:      "tool_call_result",
            agentId,
            agentName: label,
            success:   ev.success,
            data: { tool: ev.toolName, recordCount: ev.recordCount, error: ev.error },
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
      if (parsed) resultSummaries[key] = parsed;

      await storage.updateDeployment(deploymentId, {
        status:        runSuccess ? "deployed" : "failed",
        deployedAt:    new Date(),
        resultSummary: parsed || { rawOutput: resultText.slice(0, 500) },
      }).catch(() => {});

      sse(res, "agent_complete", {
        agentId,
        agentName: label,
        key,
        success:       runSuccess,
        resultSummary: parsed,
      });

      if (!clientDisconnected) await new Promise(r => setTimeout(r, 500));
    }

    sse(res, "run_complete", {
      message:  "All 4 Fitch RW agents completed — Rating Watch pipeline run finished",
      scenario: `${TARGET_ISSUER} Rating Watch Negative screening`,
      summaries: resultSummaries,
      pipelineStatus: "COMPLETE",
    });
  } catch (err: any) {
    sse(res, "error", { message: err?.message || "Pipeline error" });
  } finally {
    res.end();
  }
}

// ─── Agent runs list ──────────────────────────────────────────────────────────

export async function getFitchRWAgentRuns(_req: Request, res: Response): Promise<void> {
  try {
    const roles: { key: string; label: string; step: number }[] = [
      { key: "marketSignalScanner",    label: "FITCH-RW-001 Market Signal Scanner",    step: 1 },
      { key: "filingIntelligenceAgent", label: "FITCH-RW-002 Filing Intelligence Agent", step: 2 },
      { key: "peerBenchmarkingAgent",  label: "FITCH-RW-003 Peer Benchmarking Agent",  step: 3 },
      { key: "ratingActionMemoAgent",  label: "FITCH-RW-004 Rating Action Memo Agent", step: 4 },
    ];

    const runs = await Promise.all(roles.map(async ({ key, label, step }) => {
      const agentId = _fitchRWAgentIdByKey[key];
      const deps = agentId ? await storage.getDeploymentsByAgentId(agentId).catch(() => [] as any[]) : [];
      const dep  = deps[0];
      return {
        key,
        agentId:       agentId || null,
        agentName:     label,
        step,
        agentStatus:   "active",
        runStatus:     dep?.status || "idle",
        triggerType:   "event_driven",
        completedAt:   dep?.deployedAt || null,
        resultSummary: dep?.resultSummary || null,
      };
    }));

    res.json({ agentRuns: runs, scenario: `${TARGET_ISSUER} Rating Watch Negative Pipeline` });
  } catch (err: any) {
    res.status(500).json({ error: err?.message });
  }
}

// ─── Setup endpoint handler ───────────────────────────────────────────────────

export async function fitchRWSetupHandler(_req: Request, res: Response): Promise<void> {
  try {
    _fitchRWSetupDone = false; // Force re-run
    await ensureFitchRWAgents();
    res.json({
      success:     true,
      message:     "Fitch RW agents, MCP servers, skills, KBs, policies, ontology, evals, and blueprint provisioned.",
      agentCount:  FITCH_RW_AGENT_DEFS.length,
      skillCount:  FITCH_RW_SKILLS.length,
      mcpCount:    FITCH_RW_MCP_SERVERS.length,
      agents: FITCH_RW_AGENT_DEFS.map(d => ({
        key:   d.key,
        name:  d.name,
        id:    _fitchRWAgentIdByKey[d.key] || null,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
}
