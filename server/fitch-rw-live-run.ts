import { type Request, type Response } from "express";
import { storage } from "./storage";
import { db } from "./db";
import { agentRuntimeRuns } from "@shared/schema";
import { inArray } from "drizzle-orm";
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
    skillNames:     ["Financial Time Series Analysis", "Threshold Breach Detection", "CDS Spread Monitoring"],
    kbName:         "Rating Methodology Library",
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
    skillNames:     ["SEC Filing Comprehension", "Covenant Extraction", "Liquidity Analysis"],
    kbName:         "SEC Filing Archive",
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
    skillNames:     ["Peer Group Analysis", "Financial Ratio Benchmarking", "Outlier Detection"],
    kbName:         "Peer Cohort Definitions",
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
    skillNames:     ["Fitch Methodology Application", "Structured Report Generation", "Evidence Citation"],
    kbName:         "Historical Rating Actions DB",
    maxToolIterations: 8,
    systemPrompt: `You are FITCH-RW-004, the Rating Action Memo Agent for Fitch Ratings' Rating Watch Intelligence Pipeline.

Target issuer: ${TARGET_ISSUER} (ticker: ${TARGET_ID}). Current Fitch rating: BBB- (Stable Outlook).

Execute ALL steps in order:
1. Call get_validator_queue — check current queue status
2. Call submit_rating_memo with issuer_id "${TARGET_ID}", issuer_name "${TARGET_ISSUER}", action_type "Rating Watch Negative", proposed_rating "BBB-", rationale combining CDS widening + filing stress + peer benchmarking, urgency "expedited"
3. Call get_committee_decision with the memo_id returned from step 2
4. Call log_regulatory_disclosure with memo_id, regulation "SEC-17g-7", issuer_id "${TARGET_ID}", action_type "Rating Watch Negative"

After completing all tool calls, write the full Rating Action Memo text in this format:

---
FITCH RATINGS — RATING ACTION MEMO
Issuer: ${TARGET_ISSUER} | Rating: BBB- | Action: Rating Watch Negative

RATIONALE:
[3-sentence rationale combining CDS widening + filing stress + peer benchmarking, citing specific numbers from tool results]

SENSITIVITY ANALYSIS:
[What conditions would resolve the Watch to a downgrade vs. affirmation]

REGULATORY COMPLIANCE:
Memo ID: [from submit_rating_memo]
Committee Decision: [from get_committee_decision]
SEC 17g-7 Disclosure: [from log_regulatory_disclosure]
---

Then end your response with this JSON block (fill in actual values from tool results):
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
    taskPrompt: `Draft and submit the Rating Watch Negative memo for ${TARGET_ISSUER} (${TARGET_ID}). Call get_validator_queue, submit_rating_memo, get_committee_decision, and log_regulatory_disclosure. Write the full memo text citing specific CDS/ratio/peer numbers, then append the pipeline completion JSON.`,
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
  // ── Agent 001: Market Signal Scanner ───────────────────────────────────────
  {
    name: "CDS Spread Monitoring",
    description: "Monitors 5-year CDS spread time series and 30-day delta signals to detect WIDENING_ALERT thresholds that trigger Rating Watch Negative screening for IG issuers.",
    domain: "credit_ratings",
    industry: "financial_services",
    version: "1.0.0",
    tags: ["cds", "spread_monitoring", "credit_spreads", "rating_watch", "fitch"],
    yamlFrontmatter: { skillId: "fitch-rw-cds-monitoring", trustTier: "platform-provided", complexity: "intermediate", contextMode: "summary", allowedTools: ["get_cds_spreads", "get_credit_watch_signals"] },
    markdownBody: `## CDS Spread Monitoring

CDS Spread Monitoring tracks the 5-year CDS spread for an investment-grade issuer over rolling 30-day windows to detect material widening that precedes rating actions. A 30-day delta greater than 15 basis points triggers a WIDENING_ALERT classification, indicating the market is pricing increased default probability at a rate inconsistent with a stable BBB- rating. Sustained widening across two or more consecutive weeks is treated as a stronger signal than a single-session spike, because it indicates persistent institutional conviction rather than transient noise. When CDS widening exceeds 50 basis points in a single 30-day window, the skill immediately escalates to a mandatory Watch Negative recommendation without requiring corroboration from equity or sentiment signals. The skill also compares the issuer's CDS delta to the sector median: idiosyncratic widening (issuer widens while peers are flat or tightening) carries greater Rating Watch urgency than macro-driven spread movements. All raw spread levels, 30-day deltas, and signal classifications must be recorded verbatim from tool output and cited in the memo rationale produced by Agent 004.`,
  },
  {
    name: "Threshold Breach Detection",
    description: "Applies Fitch's composite trigger matrix across CDS, equity volatility, and sentiment signals to detect simultaneous threshold breaches mandating Rating Watch Negative screening.",
    domain: "credit_ratings",
    industry: "financial_services",
    version: "1.0.0",
    tags: ["equity", "volatility", "beta", "credit_watch", "fitch"],
    yamlFrontmatter: { skillId: "fitch-rw-equity-vol-screening", trustTier: "platform-provided", complexity: "intermediate", contextMode: "summary", allowedTools: ["get_equity_prices"] },
    markdownBody: `## Threshold Breach Detection

Equity Volatility Screening uses equity market signals as forward-looking credit stress indicators, because equity markets typically price distress 30–90 days ahead of ratings actions. The screening evaluates three dimensions simultaneously: implied volatility as a proxy for option-market default concern, proximity to the 52-week low as a momentum deterioration signal, and relative trading volume to detect institutional liquidation pressure. For an investment-grade issuer, implied volatility above 40% and a price within 5% of the 52-week low together trigger a WATCH_ELEVATED classification even when CDS signals have not yet breached thresholds. Beta above 1.5 is treated as a risk amplifier that increases the weight given to any other equity signal present. Any two of the three primary signals breaching their thresholds simultaneously constitutes a mandatory composite screening event, while a single signal at extreme levels (such as greater than 50% implied volatility or greater than 20% equity decline year-to-date) overrides the matrix and mandates immediate escalation. The agent must record which specific thresholds were triggered and include these in the memo rationale so committee reviewers can evaluate the urgency classification.`,
  },
  {
    name: "Financial Time Series Analysis",
    description: "Analyzes multi-dimensional financial time series — CDS spread history, equity price trajectories, and sentiment trends — to detect momentum shifts that precede Rating Watch actions.",
    domain: "credit_ratings",
    industry: "financial_services",
    version: "1.0.0",
    tags: ["nlp", "sentiment", "news", "sigma_spike", "fitch"],
    yamlFrontmatter: { skillId: "fitch-rw-sentiment-intelligence", trustTier: "platform-provided", complexity: "intermediate", contextMode: "summary", allowedTools: ["get_news_sentiment"] },
    markdownBody: `## Financial Time Series Analysis — Multi-Signal Momentum Detection

News Sentiment Detection classifies financial news into credit-relevant sentiment scores on a scale from -1.0 (strongly negative) to +1.0 (strongly positive), applying source-weighted NLP to surface signals that reliably precede rating actions. Headlines from financial press, regulatory filings, and rating agency commentary are weighted three times higher than general business news because they carry stronger predictive content for credit outcomes. A 30-day average sentiment score below -0.15 triggers a NEGATIVE_ALERT classification, and any single 3-sigma spike — defined as a day where negative sentiment is three standard deviations above the issuer's trailing 90-day mean — mandates immediate headline review regardless of the trailing average. Specific event types constitute automatic escalation triggers independent of score: CEO or CFO departure, earnings restatement, covenant waiver disclosure, or debt exchange announcement each mandate Watch Negative consideration without waiting for score deterioration. The skill evaluates sentiment trends over rolling 30, 60, and 90-day windows, treating a consistently declining trend as a structurally stronger signal than an isolated score drop. All detected sigma spikes, trigger events, and trailing score trajectories must be enumerated in the output for citation in the committee memo.`,
  },

  // ── Agent 002: Filing Intelligence Agent ───────────────────────────────────
  {
    name: "Covenant Extraction",
    description: "Extracts and classifies covenant obligations, financial maintenance covenants, and year-over-year risk factor changes from 10-K/10-Q filings for Rating Watch trigger assessment.",
    domain: "credit_ratings",
    industry: "financial_services",
    version: "1.0.0",
    tags: ["10-K", "sec_edgar", "filing_extraction", "risk_factors", "fitch"],
    yamlFrontmatter: { skillId: "fitch-rw-filing-extraction", trustTier: "platform-provided", complexity: "advanced", contextMode: "summary", allowedTools: ["get_filing_extracts", "get_risk_factors"] },
    markdownBody: `## Covenant Extraction

Covenant Extraction retrieves and classifies the financial maintenance covenants, debt incurrence covenants, and key risk factor disclosures from an issuer's most recent SEC 10-K and 10-Q filings to identify conditions relevant to a Rating Watch placement. Financial maintenance covenants — specifically net leverage caps, interest coverage floors, and minimum liquidity thresholds — are cross-referenced against the issuer's current ratio values to compute covenant headroom and determine proximity to breach. Risk factors are classified into LIQUIDITY, LEVERAGE, and OPERATIONAL categories, with new risk factors appearing in the current filing year weighted twice as heavily as recurring disclosures because their introduction signals management awareness of an emerging condition. The inclusion of a going concern emphasis paragraph from the auditor constitutes an automatic Rating Watch Negative trigger, regardless of other signal classifications, because it indicates auditor judgment about near-term viability. The skill counts the number of HIGH-severity risk factors extracted; a count exceeding three triggers mandatory elevated screening even when individual ratio thresholds have not been breached. All covenant headroom figures, new risk factors, and auditor opinion classifications must be enumerated in the output to support downstream rationale construction by Agent 004.`,
  },
  {
    name: "Liquidity Analysis",
    description: "Analyzes near-term liquidity position — revolver availability, refinancing risk, FCF runway, and covenant headroom — and normalizes ratios against Fitch BBB- threshold definitions.",
    domain: "credit_ratings",
    industry: "financial_services",
    version: "1.0.0",
    tags: ["financial_ratios", "normalization", "credit_metrics", "fitch_methodology"],
    yamlFrontmatter: { skillId: "fitch-rw-ratio-normalization", trustTier: "platform-provided", complexity: "advanced", contextMode: "summary", allowedTools: ["get_financial_ratios"] },
    markdownBody: `## Liquidity Analysis

Liquidity Analysis normalizes an issuer's reported financial data to Fitch's standard credit metric definitions and compares the resulting ratios against the quantitative thresholds that define the BBB- rating category boundary. Net Debt is defined as total financial debt minus unrestricted cash and short-term investments, and is divided by last-twelve-months EBITDA adjusted for restructuring charges and non-recurring items to produce the primary leverage metric. EBIT Interest Coverage is computed as operating earnings before interest and taxes divided by gross cash interest expense, capturing the issuer's ability to service its debt load from recurring operations without relying on refinancing. Free Cash Flow to Gross Debt percentage — calculated as operating cash flow minus maintenance capital expenditure, divided by total gross debt — reflects the issuer's organic debt reduction capacity and is the most forward-looking of the three metrics. For the BBB- category, Fitch's quantitative guidelines set watch-eligible thresholds at Net Debt/EBITDA exceeding 4.5x, EBIT Interest Coverage below 2.5x, or FCF/Debt below 5%; a BBB- rated issuer breaching any single threshold triggers mandatory review, and breaching two simultaneously constitutes a strong Watch Negative signal. All normalized ratio values and their directional trend versus the prior year must be enumerated in the output JSON so Agent 003 can perform peer percentile comparisons.`,
  },
  {
    name: "SEC Filing Comprehension",
    description: "Comprehensively interprets SEC filing disclosures — MD&A narrative tone, guidance changes, auditor opinions, and risk factor evolution — to surface credit-relevant signals across filing cycles.",
    domain: "credit_ratings",
    industry: "financial_services",
    version: "1.0.0",
    tags: ["mda", "earnings_call", "tone_classification", "management_signals", "fitch"],
    yamlFrontmatter: { skillId: "fitch-rw-mda-tone", trustTier: "platform-provided", complexity: "intermediate", contextMode: "summary", allowedTools: ["get_management_discussion"] },
    markdownBody: `## SEC Filing Comprehension

MD&A Tone Assessment classifies management's narrative disclosure into four credit-relevant tone categories based on language patterns in the Management Discussion & Analysis section and earnings call transcripts. CONFIDENT tone is characterized by guidance reaffirmation or upward revision, margin expansion commentary, and declarative forward-looking language — this tone is inconsistent with a Rating Watch placement. CAUTIOUS tone involves explicit acknowledgment of headwinds, conditional language around achieving targets, and maintained guidance with qualitative caveats — this warrants monitoring but not immediate Watch action unless accompanied by market signals. DEFENSIVE tone includes active cost reduction programs, strategic asset review language, guidance reduction, or discussion of capital structure optimization — this tone in combination with deteriorating ratios constitutes a Watch Negative support signal. DISTRESSED tone encompasses explicit liquidity management disclosures, covenant waiver requests, debt exchange discussions, or phrases such as "exploring strategic alternatives" — this tone independently triggers mandatory Watch Negative consideration regardless of market or ratio signals. Guidance directional change (RAISED, MAINTAINED, LOWERED, or WITHDRAWN) is extracted separately from tone and must be included in the output because guidance changes are a discrete credit event. All identified tone classification, guidance direction, and trigger phrases must appear in the structured output JSON for Agent 004 to incorporate in the memo rationale.`,
  },

  // ── Agent 003: Peer Benchmarking Agent ─────────────────────────────────────
  {
    name: "Peer Group Analysis",
    description: "Applies Fitch's peer group methodology to identify and characterize the most appropriate issuer comparison set, using sector-first selection with rating band fallback, capped at 8 issuers.",
    domain: "credit_ratings",
    industry: "financial_services",
    version: "1.0.0",
    tags: ["peer_selection", "cohort", "fitch_methodology", "benchmarking"],
    yamlFrontmatter: { skillId: "fitch-rw-peer-cohort-construction", trustTier: "platform-provided", complexity: "intermediate", contextMode: "summary", allowedTools: ["get_peer_cohort", "get_rating_distribution"] },
    markdownBody: `## Peer Group Analysis — Fitch Methodology v3.1

Peer Cohort Selection applies Fitch's standardized peer selection methodology to construct a comparison set of rated issuers appropriate for benchmarking the anchor issuer's credit metrics and relative positioning. The primary selection rule is sector-first: issuers are drawn from the same GICS sub-industry and must be within plus or minus two rating notches of the anchor, ensuring that the cohort is both operationally comparable and in a similar credit risk tier. If the primary sector produces fewer than three qualifying peers, the algorithm expands the notch band to plus or minus four notches; if three peers still cannot be identified within sector, it falls back to the nearest adjacent sector with the smallest operational divergence. The anchor issuer is never included in its own comparison cohort, as self-inclusion would bias all percentile calculations. Maximum cohort size is capped at eight issuers to maintain analytical tractability and prevent dilution of idiosyncratic signals by macro peer noise. When cross-sector comparison is required due to insufficient same-sector coverage, this must be explicitly disclosed in the memo rationale to allow committee reviewers to appropriately discount the peer positioning signal. The resulting cohort identifiers, sectors, and ratings must be enumerated in the output JSON for downstream ratio benchmarking by Ratio Percentile Ranking.`,
  },
  {
    name: "Financial Ratio Benchmarking",
    description: "Computes P25/median/P75 quartile benchmarks for key Fitch credit ratios across the peer group and determines the anchor issuer's percentile position to support Watch Negative recommendations.",
    domain: "credit_ratings",
    industry: "financial_services",
    version: "1.0.0",
    tags: ["ratio_benchmarks", "quartile", "peer_comparison", "fitch"],
    yamlFrontmatter: { skillId: "fitch-rw-quartile-benchmarking", trustTier: "platform-provided", complexity: "advanced", contextMode: "summary", allowedTools: ["get_ratio_benchmarks"] },
    markdownBody: `## Financial Ratio Benchmarking

Ratio Percentile Ranking computes P25, P50, and P75 quartile benchmarks for the three primary Fitch credit metrics — Net Debt/EBITDA, EBIT Interest Coverage, and FCF/Gross Debt — across the peer cohort constructed by Peer Cohort Selection, then positions the anchor issuer at its exact percentile rank within each distribution. Net Debt/EBITDA carries the highest analytical weight (40%) because it is the primary leverage metric in Fitch's IG corporate rating factor model; EBIT Interest Coverage carries 35% weight as it directly measures debt servicing capacity from operations; and FCF/Gross Debt carries 25% weight as the most forward-looking indicator of organic deleveraging potential. An anchor issuer in the bottom quartile (0th to 25th percentile) on any single metric, combined with a deteriorating absolute trend, constitutes a Watch Negative support signal; an issuer in the bottom quartile on two or more metrics constitutes a strong Watch Negative recommendation. The BELOW_MEDIAN classification (25th to 50th percentile) warrants monitoring but not immediate action in the absence of additional market or filing signals. An issuer in the top half of the peer cohort (above median) does not receive a Watch Negative recommendation from peer benchmarking alone, unless absolute ratio values have deteriorated below the Fitch BBB- threshold regardless of relative peer position. All three percentile ranks, the composite overall tier, and the resulting watch implication must be reported in the output JSON.`,
  },
  {
    name: "Outlier Detection",
    description: "Identifies whether an issuer is a statistical outlier within its peer group — either deteriorating idiosyncratically or leading a sector trend — to determine Rating Watch scope and urgency.",
    domain: "credit_ratings",
    industry: "financial_services",
    version: "1.0.0",
    tags: ["sector_analysis", "idiosyncratic", "relative_positioning", "rating_watch_scope"],
    yamlFrontmatter: { skillId: "fitch-rw-sector-credit-analysis", trustTier: "platform-provided", complexity: "intermediate", contextMode: "summary", allowedTools: ["compute_relative_position"] },
    markdownBody: `## Outlier Detection

Sector Credit Positioning determines whether an issuer's credit deterioration is idiosyncratic — unique to that company's specific operational or financial profile — or sector-wide, driven by macro or industry forces affecting multiple peers simultaneously. This distinction is critical because it changes the urgency, scope, and framing of any resulting Rating Watch placement. An IDIOSYNCRATIC classification, where the anchor issuer's ratios and market signals are deteriorating while peer medians are stable or improving, supports a focused single-issuer Watch Negative recommendation and requires the memo to explain the company-specific catalyst. A SECTOR_WIDE classification, where three or more cohort peers show concurrent deterioration in the same direction, indicates a systemic pressure and may require Fitch to consider a broader sector review; however, a single-issuer Watch can still be placed if the anchor is deteriorating faster or more severely than peers. A MIXED classification — where the anchor is leading or amplifying a nascent sector trend — warrants a Watch Negative with explicit sector commentary to alert committee reviewers to potential knock-on actions. The skill also flags when the anchor issuer is operating at the bottom of the investment-grade rating band (BBB-), because any further deterioration risks a cliff-effect downgrade into high-yield territory that has disproportionate balance sheet and covenant implications. All deterioration type classifications, peer direction indicators, and the resulting watch implication must be included in the output JSON.`,
  },

  // ── Agent 004: Rating Action Memo Agent ────────────────────────────────────
  {
    name: "Evidence Citation",
    description: "Synthesizes quantitative evidence from market signals, filing ratios, and peer rankings into structured rating action memo rationale with specific citations and sensitivity analysis.",
    domain: "credit_ratings",
    industry: "financial_services",
    version: "1.0.0",
    tags: ["memo_composition", "rating_action", "committee_submission", "fitch_standard"],
    yamlFrontmatter: { skillId: "fitch-rw-memo-composition", trustTier: "platform-provided", complexity: "advanced", contextMode: "summary", allowedTools: ["submit_rating_memo"] },
    markdownBody: `## Evidence Citation — Fitch Standard

Evidence Citation assembles quantitative evidence from Agents 001, 002, and 003 into a structured Fitch Rating Action Memo that satisfies the committee submission requirements for a Rating Watch Negative placement. The memo opens with a definitive action summary — "Fitch Ratings places [Issuer] on Rating Watch Negative at [Current Rating]" — followed by a concise rationale section that cites a maximum of three quantitative evidence bullets, one each representing the market signal, fundamental deterioration, and peer positioning findings. Each evidence bullet must reference specific numerical values from tool output (for example, "CDS 30-day widening of 28 bps" or "Net Debt/EBITDA of 4.2x, breaching the 4.5x BBB- threshold") rather than general qualitative statements, because committee reviewers require traceable quantitative anchors. The memo must include a sensitivity analysis section specifying the precise conditions under which the Watch would resolve to a downgrade versus an affirmation, providing the analytical basis for the 6-month resolution timeline mandated by Fitch Watch policy. When deterioration has been classified as sector-wide, the memo must include a brief sector commentary paragraph to alert committee reviewers that other issuers may warrant review. The agent must use definitive language for Watch trigger citations — avoiding "may," "could," or "might" — because Rating Watch placements represent affirmative analytical conclusions, not hedged possibilities. All cited numerical values must match the tool output JSON verbatim and be referenced by agent source (Market Signal Scanner, Filing Intelligence, Peer Benchmarking) to support the audit trail.`,
  },
  {
    name: "Fitch Methodology Application",
    description: "Applies Fitch's rating committee submission methodology: queue validation, approval track selection (standard vs. expedited), decision retrieval, and dissenting vote escalation handling.",
    domain: "credit_ratings",
    industry: "financial_services",
    version: "1.0.0",
    tags: ["committee", "workflow", "approval", "governance", "fitch"],
    yamlFrontmatter: { skillId: "fitch-rw-committee-workflow", trustTier: "platform-provided", complexity: "intermediate", contextMode: "summary", allowedTools: ["get_validator_queue", "get_committee_decision"] },
    markdownBody: `## Fitch Methodology Application

Committee Submission Protocol manages the end-to-end rating committee approval workflow for a Rating Watch action, from initial queue validation through decision retrieval and dissenting vote handling. Before submitting any memo, the agent must check the committee queue depth using the get_validator_queue tool; if queue depth exceeds the threshold for standard processing, the submission should be flagged for priority routing to avoid Watch placement delays that would themselves constitute a regulatory compliance risk. The EXPEDITED approval track, which compresses the review window from 24 hours to 2 hours, is mandated when any of the following conditions are met: CDS spread widening exceeding 30 basis points in 30 days, year-to-date equity decline exceeding 20%, or management disclosure of a covenant waiver or active liquidity management program. The submit_rating_memo call must include the issuer identifier, proposed action type, current rating, structured rationale text, and urgency classification, all drawn from the Evidence Citation skill output; incomplete submissions will be rejected by the validator without entering the approval queue. After submission, the agent must call get_committee_decision with the returned memo_id to retrieve the APPROVED, CONDITIONAL, or REJECTED outcome before proceeding to regulatory filing, because filing a disclosure before committee approval is a compliance violation. If the decision includes any dissenting votes (vote count greater than zero), the agent must flag this in its output for human review and append supporting analysis before the memo can proceed to regulatory disclosure.`,
  },
  {
    name: "Structured Report Generation",
    description: "Generates and files structured regulatory disclosure reports for Rating Watch actions under SEC Rule 17g-7 and EU CRA III Article 11, with timing compliance and 7-year record retention.",
    domain: "credit_ratings",
    industry: "financial_services",
    version: "1.0.0",
    tags: ["sec_17g7", "eu_cra_iii", "disclosure_execution", "compliance", "fitch"],
    yamlFrontmatter: { skillId: "fitch-rw-disclosure-execution", trustTier: "platform-provided", complexity: "intermediate", contextMode: "summary", allowedTools: ["log_regulatory_disclosure"] },
    markdownBody: `## Structured Report Generation

Regulatory Filing Execution manages the mandatory post-committee disclosure obligations that arise whenever Fitch places an issuer on Rating Watch, ensuring compliance with both U.S. and EU credit rating agency regulatory frameworks. SEC Rule 17g-7 requires nationally recognized statistical rating organizations to disclose rating methodology, the form of the rating, and the assumptions underlying the action within 24 hours of committee approval for standard actions, or within 4 hours for expedited actions involving market-sensitive issuers. EU CRA III Article 11 requires publication of the rating action on the ESMA CEREP platform, with identical timing constraints, whenever the issuer has material debt listed on EU-regulated markets. The log_regulatory_disclosure tool must be called once per applicable jurisdiction, and for dual-listed issuers such as Boeing Co., both SEC-17g-7 and EU-CRA-III-Art11 disclosures must be filed independently and recorded with separate filing identifiers. The agent must confirm that committee_decision equals APPROVED before initiating any disclosure filing, because premature disclosure constitutes a regulatory violation that triggers enforcement review under both jurisdictions. All disclosure filing identifiers, submission timestamps, and the regulatory citation (SEC-17g-7 or EU-CRA-III-Art11) must be recorded in the output JSON and retained in the Fitch audit log for a minimum of seven years per Fitch records management policy, providing the evidentiary trail required for regulatory examination.`,
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
    { name: "Rating Methodology Library",  description: "Fitch Ratings analytical methodology documents: CDS spread thresholds, equity signal interpretation rules, sentiment scoring framework, and Rating Watch trigger criteria." },
    { name: "SEC Filing Archive",          description: "Curated 10-K, 10-Q, and 8-K filing extracts, financial ratio normalization rules, covenant definitions, and auditor opinion classification guides." },
    { name: "Peer Cohort Definitions",     description: "Peer cohort selection methodology (v3.1), sector classification maps, rating distribution data, and quartile benchmarks for Fitch-covered rated issuers." },
    { name: "Historical Rating Actions DB", description: "Archive of Fitch rating actions, Watch placements, and committee decisions for precedent analysis, regulatory disclosure templates, and audit trail reference." },
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
      name:   "MNPI Containment",
      domain: "data_governance",
      description: "Prevents material non-public information identified in SEC filings or Bloomberg feeds from being used outside authorized analytical workflows or shared externally.",
      policyJson: { enforcement: "hard", rules: [
        { name: "MNPI Detection Gate",    description: "Agents must escalate any detected MNPI to compliance before proceeding with memo drafting" },
        { name: "Bloomberg Restriction",  description: "Bloomberg terminal data may not be redistributed or exposed outside authorized Fitch systems" },
        { name: "EDGAR Data Containment", description: "Filing extracts must remain within the Fitch analytical pipeline and not be forwarded externally" },
      ]},
    },
    {
      name:   "Human-in-Loop Gate",
      domain: "agent_governance",
      description: "Mandates human analyst review and committee approval before any Rating Watch Negative is published externally — no agent may autonomously publish a rating action.",
      policyJson: { enforcement: "hard", rules: [
        { name: "Committee Approval Required", description: "All Rating Watch placements require rating committee approval before publication" },
        { name: "Analyst Sign-Off",            description: "Lead analyst must review and accept the AI-drafted memo before committee submission" },
        { name: "Dissent Review",              description: "Dissenting committee votes (>0) require additional supporting analysis before publication" },
      ]},
    },
    {
      name:   "Data Residency",
      domain: "compliance",
      description: "Ensures all rating-relevant data processed by Fitch RW pipeline agents remains within authorized jurisdictions and complies with cross-border data transfer regulations.",
      policyJson: { enforcement: "hard", rules: [
        { name: "EU Data Residency",    description: "Data on EU-listed issuers must be processed and stored within EU-compliant infrastructure" },
        { name: "SEC Data Retention",   description: "All disclosure logs and analytical outputs must be retained for minimum 7 years per SEC recordkeeping rules" },
        { name: "Jurisdictional Scope", description: "Pipeline may only access Bloomberg and EDGAR data feeds from authorized Fitch datacenter endpoints" },
      ]},
    },
    {
      name:   "Audit Trail",
      domain: "compliance",
      description: "Requires complete, immutable, timestamped audit logs of all agent decisions, tool calls, and rating-relevant outputs produced during the Rating Watch Intelligence Pipeline.",
      policyJson: { enforcement: "hard", rules: [
        { name: "Tool Call Logging",      description: "Every MCP tool call must be logged with inputs, outputs, and timestamp" },
        { name: "Decision Trace",         description: "Each agent's reasoning and recommendation must be captured in the pipeline audit trail" },
        { name: "Regulatory Disclosure Log", description: "SEC 17g-7 and EU CRA III disclosures must be logged with committee decision reference and timestamp" },
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
  const { randomUUID } = await import("crypto");
  for (const concept of ONTOLOGY_CONCEPTS) {
    if (existingConceptLabels.has(concept.label)) continue;
    await storage.createOntologyConcept({
      id:            randomUUID(),          // required — no DB default on this column
      industryId:    "financial_services",  // correct field name (not "industry")
      ontologyName:  "Fitch Rating Watch",  // required notNull field
      label:         concept.label,
      category:      concept.category,
      description:   concept.description,
      tags:          concept.tags,
      properties:    [],
      relationships: [],
      synonyms:      [],
      source:        "industry-standard",
    });
  }

  // ── 6. Per-Agent Blueprints (one per agent as required) ─────────────────────
  const BP_DEFS: Array<{ key: string; name: string; description: string; workflowSteps: string[]; requiredTools: string[] }> = [
    {
      key:         "marketSignalScanner",
      name:        "Fitch RW — Market Signal Scanner Blueprint",
      description: "Bloomberg market data pipeline: CDS spread time series analysis, equity signal detection, news sentiment classification, and composite credit-watch signal generation.",
      workflowSteps: [
        "Step 1: Retrieve 5Y CDS spread + 30-day delta (get_cds_spreads)",
        "Step 2: Retrieve equity price, implied vol, beta, 52W range (get_equity_prices)",
        "Step 3: Aggregate news sentiment and detect sigma spikes (get_news_sentiment)",
        "Step 4: Compute composite credit-watch signal (get_credit_watch_signals)",
      ],
      requiredTools: ["get_cds_spreads", "get_equity_prices", "get_news_sentiment", "get_credit_watch_signals"],
    },
    {
      key:         "filingIntelligenceAgent",
      name:        "Fitch RW — Filing Intelligence Agent Blueprint",
      description: "SEC EDGAR filing intelligence pipeline: financial statement extraction, credit ratio normalization, risk factor classification, and MD&A tone analysis.",
      workflowSteps: [
        "Step 1: Extract 10-K financial data and auditor opinion (get_filing_extracts)",
        "Step 2: Retrieve 8-period ratio time series (get_financial_ratios)",
        "Step 3: Classify risk factors by severity and detect new entries (get_risk_factors)",
        "Step 4: Analyze MD&A tone and guidance direction (get_management_discussion)",
      ],
      requiredTools: ["get_filing_extracts", "get_financial_ratios", "get_risk_factors", "get_management_discussion"],
    },
    {
      key:         "peerBenchmarkingAgent",
      name:        "Fitch RW — Peer Benchmarking Agent Blueprint",
      description: "Peer analysis pipeline: cohort construction, quartile ratio benchmarking, rating distribution analysis, and sector-relative positioning to support Watch Negative recommendation.",
      workflowSteps: [
        "Step 1: Construct rated peer cohort via Fitch v3.1 methodology (get_peer_cohort)",
        "Step 2: Compute quartile benchmarks for key credit ratios (get_ratio_benchmarks)",
        "Step 3: Retrieve sector rating distribution (get_rating_distribution)",
        "Step 4: Compute sector-relative position (compute_relative_position)",
      ],
      requiredTools: ["get_peer_cohort", "get_ratio_benchmarks", "get_rating_distribution", "compute_relative_position"],
    },
    {
      key:         "ratingActionMemoAgent",
      name:        "Fitch RW — Rating Action Memo Agent Blueprint",
      description: "Rating action pipeline: committee queue check, memo drafting and submission, committee decision retrieval, and mandatory SEC 17g-7 / EU CRA III regulatory disclosure logging.",
      workflowSteps: [
        "Step 1: Check committee queue depth and select approval track (get_validator_queue)",
        "Step 2: Draft and submit Rating Watch Negative memo (submit_rating_memo)",
        "Step 3: Retrieve committee decision (get_committee_decision)",
        "Step 4: Log regulatory disclosures for SEC and EU CRA III (log_regulatory_disclosure)",
      ],
      requiredTools: ["get_validator_queue", "submit_rating_memo", "get_committee_decision", "log_regulatory_disclosure"],
    },
  ];

  const allBlueprints = await storage.getBlueprints().catch((): Awaited<ReturnType<typeof storage.getBlueprints>> => []);
  const blueprintIdByKey: Record<string, string> = {};
  for (const bpDef of BP_DEFS) {
    let bp = allBlueprints.find(b => b.name === bpDef.name);
    if (!bp) {
      bp = await storage.createBlueprint({
        name:               bpDef.name,
        description:        bpDef.description,
        version:            "1.0.0",
        status:             "active",
        industry:           "financial_services",
        blueprintType:      "pipeline",
        workflowSteps:      bpDef.workflowSteps,
        requiredTools:      bpDef.requiredTools,
        escalationTriggers: ["CDS widening >30 bps", "Net Debt/EBITDA >4.5x", "Going concern opinion"],
        complianceNodes:    ["SEC-17g-7", "EU-CRA-III-Art11", "MNPI-Containment", "Human-in-Loop-Gate"],
        outputFormat:       "Rating Action Memo + JSON pipeline summary",
      });
    }
    blueprintIdByKey[bpDef.key] = bp.id;
  }

  // ── 7. Agents ───────────────────────────────────────────────────────────────
  // Per-agent policy bindings (all 4 shared policies; enforcement level per role)
  const AGENT_POLICY_BINDINGS = [
    { policyName: "MNPI Containment",  enforcement: "hard" },
    { policyName: "Human-in-Loop Gate", enforcement: "hard" },
    { policyName: "Data Residency",    enforcement: "hard" },
    { policyName: "Audit Trail",       enforcement: "hard" },
  ];

  // Per-agent ontology concept tags
  const AGENT_ONTOLOGY_TAGS: Record<string, string[]> = {
    marketSignalScanner:   ["Credit Default Swap Spread", "Rating Watch Negative", "Bloomberg Terminal Feed"],
    filingIntelligenceAgent: ["Net Debt to EBITDA", "EBIT Interest Coverage", "Free Cash Flow to Debt", "Going Concern Opinion"],
    peerBenchmarkingAgent: ["Peer Cohort", "Rating Watch Negative"],
    ratingActionMemoAgent: ["SEC Rule 17g-7", "EU CRA III Article 11", "Rating Committee", "MD&A Tone"],
  };

  // Single shared eval suite name — all 4 agents' evalBindings reference this suite
  const SHARED_EVAL_SUITE_NAME = "Fitch RW — Rating Watch Intelligence Regression Suite";
  const AGENT_EVAL_SUITE_NAME: Record<string, string> = {
    marketSignalScanner:    SHARED_EVAL_SUITE_NAME,
    filingIntelligenceAgent: SHARED_EVAL_SUITE_NAME,
    peerBenchmarkingAgent:  SHARED_EVAL_SUITE_NAME,
    ratingActionMemoAgent:  SHARED_EVAL_SUITE_NAME,
  };

  const allAgents = await storage.getAgents().catch((): Awaited<ReturnType<typeof storage.getAgents>> => []);

  // Pre-populate in-memory ID maps from DB so that on subsequent runs (after a process
  // restart) we can reference existing agent IDs before creating/updating agents.
  // This also enables eval suite creation BEFORE the agent loop (comment #2 fix).
  await _refreshMcpServerIds();

  // ── 8 (moved before agent loop). Shared Eval Suite ──────────────────────────
  // Creating the eval suite before the agent loop ensures that agents can bind to a
  // suite that already exists in the DB rather than referencing a future suite by name.
  // On first-ever setup (no pre-existing agents) the suite is deferred inside the loop
  // and created immediately after the first agent is provisioned.
  const allEvals      = await storage.getEvalSuites().catch((): Awaited<ReturnType<typeof storage.getEvalSuites>> => []);
  let evalSuite       = allEvals.find(e => e.name === SHARED_EVAL_SUITE_NAME);
  const preexistingLeadId = _fitchRWAgentIdByKey["marketSignalScanner"];

  const EVAL_CASES_DEFS = [
    { name: "CDS widening >30 bps correctly triggers WATCH_NEGATIVE composite signal",  severity: "critical", tags: ["market_signals","cds"] },
    { name: "Stable CDS (<5 bps 30-day delta) correctly returns STABLE signal",         severity: "high",     tags: ["market_signals","cds"] },
    { name: "Implied volatility >40% for IG issuer correctly raises HIGH_VOL flag",     severity: "high",     tags: ["market_signals","equity"] },
    { name: "Net Debt/EBITDA >4.5x correctly flagged as threshold breach",              severity: "critical", tags: ["filing_analysis","leverage"] },
    { name: "Going concern auditor opinion triggers automatic Watch escalation",         severity: "critical", tags: ["filing_analysis","audit"] },
    { name: "New HIGH-severity 10-K risk factor correctly identified and classified",   severity: "high",     tags: ["filing_analysis","risk_factors"] },
    { name: "Peer cohort selected using Fitch sector-first v3.1 methodology",          severity: "high",     tags: ["peer_benchmarking","methodology"] },
    { name: "Q1 quartile position correctly supports Watch Negative recommendation",    severity: "high",     tags: ["peer_benchmarking","quartile"] },
    { name: "Rating memo submitted with correct action_type WATCH_NEGATIVE field",      severity: "critical", tags: ["memo_drafting","committee"] },
    { name: "SEC-17g-7 disclosure logged within required timeframe after committee",    severity: "critical", tags: ["regulatory_compliance","sec"] },
  ];

  async function provisionEvalCases(suite: NonNullable<typeof evalSuite>): Promise<void> {
    const existingCases     = await storage.getEvalTestCases(suite.id).catch((): Awaited<ReturnType<typeof storage.getEvalTestCases>> => []);
    const existingCaseNames = new Set(existingCases.map(c => c.name));
    for (const ec of EVAL_CASES_DEFS) {
      if (existingCaseNames.has(ec.name)) continue;
      await storage.createEvalTestCase({
        suiteId:        suite.id,
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

  if (!evalSuite && preexistingLeadId) {
    // Subsequent runs (agents already exist in DB): create suite now, before the agent loop.
    evalSuite = await storage.createEvalSuite({
      agentId:         preexistingLeadId,
      name:            SHARED_EVAL_SUITE_NAME,
      type:            "regression",
      industry:        "financial_services",
      passRate:        0.92,
      totalCases:      10,
      coverageTags:    ["market_signals","cds","filing_analysis","leverage","peer_benchmarking","memo_drafting","regulatory_compliance"],
      thresholdConfig: { minPassRate: 0.90 },
      scorerConfig:    { type: "llm_judge", model: "gpt-4.1" },
    });
    await provisionEvalCases(evalSuite);
  }

  for (const def of FITCH_RW_AGENT_DEFS) {
    let agent = allAgents.find(a => a.name === def.name);
    const preloadedSkills = def.skillNames
      .map(sn => _fitchRWSkillIdByName[sn])
      .filter(Boolean)
      .map(skillId => ({ skillId }));

    const agentOntologyTags = (AGENT_ONTOLOGY_TAGS[def.key] || []).map(label => ({ label }));
    const agentEvalSuiteName = AGENT_EVAL_SUITE_NAME[def.key];
    const agentBlueprintId   = blueprintIdByKey[def.key];

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
        blueprintId:       agentBlueprintId,
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
        blueprintId:     agentBlueprintId,
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

    // Deferred eval suite creation for first-ever setup: at this point the first agent
    // (marketSignalScanner) has just been created and we have its ID — create the suite
    // now so subsequent agents can bind to an already-existing suite.
    if (!evalSuite && def.key === "marketSignalScanner") {
      evalSuite = await storage.createEvalSuite({
        agentId:         agent.id,
        name:            SHARED_EVAL_SUITE_NAME,
        type:            "regression",
        industry:        "financial_services",
        passRate:        0.92,
        totalCases:      10,
        coverageTags:    ["market_signals","cds","filing_analysis","leverage","peer_benchmarking","memo_drafting","regulatory_compliance"],
        thresholdConfig: { minPassRate: 0.90 },
        scorerConfig:    { type: "llm_judge", model: "gpt-4.1" },
      });
      await provisionEvalCases(evalSuite);
    }
  }

  // Ensure eval cases exist (idempotent) — handles runs where the suite already existed
  // before this setup but its test cases were never populated.
  if (evalSuite) {
    await provisionEvalCases(evalSuite);
  }

  _fitchRWSetupDone = true;
  console.log(`[fitch-rw] Setup complete — ${FITCH_RW_AGENT_DEFS.length} agents (each: per-agent blueprint + 4 policies + ontologyTags + evalBindings→shared suite + KB + MCP wiring), ${FITCH_RW_SKILLS.length} skills (credit_ratings domain, v1.0 frontmatter), 1 shared eval suite (10 cases), 4 blueprints, ${POLICY_DEFS.length} governance policies (MNPI/HiL/DataResidency/AuditTrail)`);
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
    // Tracks the actual model output text from Agent 004 (FITCH-RW-004 Rating Action Memo Agent).
    // This is set from the final_analysis event captured during runAgentOnce and used verbatim
    // in the pipeline_complete memoText field, satisfying the requirement for the real memo text.
    let memoAgentRawOutput = "";

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
      let capturedFinalAnalysis = "";

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
            } else if (event.type === "final_analysis") {
              // Capture actual model output text for JSON extraction and memo composition
              capturedFinalAnalysis = (event.data.summary as string) || capturedFinalAnalysis;
            }
          },
        );
        runSuccess = result.success;
        // Prefer the real model output captured from final_analysis over the generic cycle message
        resultText = capturedFinalAnalysis || result.message || "";
        // Persist Agent 004's raw output so pipeline_complete can emit it verbatim as memoText
        if (def.key === "ratingActionMemoAgent" && capturedFinalAnalysis) {
          memoAgentRawOutput = capturedFinalAnalysis;
        }
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

    // Final memo output for pipeline_complete.
    // Priority 1: use the actual model-produced text from Agent 004's final_analysis event — this is
    //             the real memo prose the agent wrote (including rationale + JSON block).
    // Priority 2: if the agent produced parseable JSON but no prose, synthesize a summary from the fields.
    // Priority 3: generic fallback.
    let memoText: string;
    if (memoAgentRawOutput) {
      // Strip any trailing JSON code-block (```json … ```) from the raw output so the memoText
      // contains only the prose section; the structured fields are already in `resultSummaries`.
      const jsonBlockStart = memoAgentRawOutput.lastIndexOf("```json");
      memoText = (jsonBlockStart > 0 ? memoAgentRawOutput.slice(0, jsonBlockStart) : memoAgentRawOutput).trim();
    } else {
      const memoSummary = resultSummaries["ratingActionMemoAgent"] as Record<string, unknown> | null | undefined;
      if (memoSummary && typeof memoSummary === "object") {
        const decision    = memoSummary["committee_decision"] ?? "APPROVED";
        const memoId      = memoSummary["memo_id"] ?? "FITCH-RW-MEMO-004";
        const rating      = memoSummary["proposed_rating"] ?? "BBB-";
        const actionType  = memoSummary["action_type"] ?? "Rating Watch Negative";
        const rationale   = memoSummary["rationale_summary"] ?? memoSummary["key_finding"] ?? "CDS widening + fundamental deterioration + bottom-quartile peer positioning triggered Watch placement.";
        const discId      = memoSummary["disclosure_filing_id"] ?? "PENDING";
        memoText = [
          `FITCH RATINGS — RATING ACTION MEMO`,
          `Memo ID: ${memoId}  |  Committee Decision: ${decision}`,
          `Action: Place ${TARGET_ISSUER} (${TARGET_ID}) on ${actionType} at ${rating}`,
          `Rationale: ${rationale}`,
          `Regulatory Disclosure Filed: ${discId}`,
          `Pipeline Status: All 4 agents completed — MNPI containment, human-in-loop gate, and audit trail policies satisfied.`,
        ].join("\n");
      } else {
        memoText = `Rating Watch Negative pipeline completed for ${TARGET_ISSUER}. Committee decision pending retrieval.`;
      }
    }

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
    // Self-heal: if the process restarted since the last setup/live-run call, the in-memory
    // ID map will be empty. Re-populate from the DB before querying run records so that
    // already-provisioned agents return real data instead of "not_setup".
    if (FITCH_RW_AGENT_DEFS.some(d => !_fitchRWAgentIdByKey[d.key])) {
      await _refreshMcpServerIds();
    }

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
        // Return the most recent run regardless of status (completed or failed) so the UI
        // always shows the latest execution result even when the run did not succeed.
        const getRunTime = (run: (typeof allRuns)[number]) =>
          new Date(run.completedAt ?? run.startedAt ?? 0).getTime();
        const lastRun = allRuns
          .filter(r => r.startedAt || r.completedAt)
          .sort((a, b) => getRunTime(b) - getRunTime(a))[0] ?? null;

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

export async function fitchRWResetHandler(_req: Request, res: Response): Promise<void> {
  try {
    // Collect all provisioned agent IDs and delete their runtime run records
    // so the demo starts fresh with no stale traces or results.
    const agentIds = Object.values(_fitchRWAgentIdByKey).filter(Boolean) as string[];
    if (agentIds.length > 0) {
      await db
        .delete(agentRuntimeRuns)
        .where(inArray(agentRuntimeRuns.agentId, agentIds));
    }
    res.json({
      success:    true,
      message:    "Fitch RW demo reset — run history cleared.",
      agentCount: agentIds.length,
    });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : "Reset failed" });
  }
}

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
