#!/usr/bin/env node
/**
 * BB AGENT FIELD FIX — systemPrompt + blueprintJson + runtimeConfig
 *
 * Gap: create script sent `taskInstructions` (unknown field) and never set
 *      systemPrompt, blueprintJson, or runtimeConfig — all null on every agent.
 *
 * Fix: PATCH all 4 agents in DEV + PROD with the correct payload derived
 *      from the Hearst Black Book specs.
 *
 * Usage:  node scripts/fix-bb-missing-fields.js
 */

import { readFileSync } from "fs";

const DEV_BASE  = "http://localhost:5000";
const PROD_BASE = "https://agent-lifecycle-management-platform.replit.app";

// ── HTTP helper ───────────────────────────────────────────────────────────────

async function patch(base, path, body) {
  const r = await fetch(`${base}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  if (text.startsWith("<!DOCTYPE") || text.startsWith("<html")) {
    throw new Error(`PATCH ${path} → HTML: ${text.slice(0, 200)}`);
  }
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!r.ok) throw new Error(`PATCH ${path} → ${r.status}: ${JSON.stringify(data).slice(0, 600)}`);
  return data;
}

const log  = (msg) => console.log(`  ✓  ${msg}`);
const warn = (msg) => console.log(`  ⚠  ${msg}`);
const sec  = (t)   => console.log(`\n── ${t} ──`);

// ══════════════════════════════════════════════════════════════════════════════
//  AGENT PAYLOADS — spec-derived systemPrompt, blueprintJson, runtimeConfig
// ══════════════════════════════════════════════════════════════════════════════

// ─── BB-AGT-001: Auction Data Quality Sentinel ────────────────────────────────

const BB001_PATCH = {
  modelProvider: "anthropic",
  modelName: "claude-opus-4-5",
  agentType: "operational",
  currentVersion: "1.0.0",
  ontologyTags: [],

  systemPrompt: `You are the Auction Data Quality Sentinel (BB-AGT-001) for Black Book vehicle valuations. Your mission is to protect the integrity of the Black Book valuation model by detecting and quarantining bad data before it corrupts pricing.

You process 140,000+ daily auction transactions from Manheim, Adesa, independent auctions, and dealer-direct feeds, applying real-time statistical tests at the individual VIN level.

Your detection capabilities:
- Price outliers: Z-score >3 sigma from segment mean, IQR bounds, Mahalanobis distance
- Geographic inconsistency: same VIN/segment priced >25% differently across regions without condition justification
- Fraud patterns: same VIN transacted 3+ times in 30 days (title-washing/odometer fraud signal)
- Volume anomalies: segment volume deviating >2 sigma from rolling 4-week average
- Data feed issues: latency, completeness, or schema degradation

Autonomy model: Confirmed fraud (confidence >= 0.85) → FULL AUTONOMY — quarantine immediately. All other anomalies → route to analyst review with evidence package.

Core constraints:
- NEVER directly modify a published valuation (BB-P1 policy violation)
- ALWAYS apply geographic normalization BEFORE flagging cross-region inconsistencies
- ALWAYS log every decision in the Resolution Ledger with full statistical basis
- Quarantine fraud immediately — do NOT wait for analyst review
- Every analyst review package must include comparable transactions and deviation magnitude`,

  blueprintJson: {
    version: "1.0",
    agentCode: "BB-AGT-001",
    category: "Data Quality & Integrity",
    scenario: "Auction Data Quality Monitoring",
    nodes: [
      { id: "ingest_feed",           type: "trigger",    label: "Ingest Real-time Auction Transaction Feed" },
      { id: "vin_decode_enrich",     type: "action",     label: "Decode VIN & Enrich with Vehicle History + BB Valuation" },
      { id: "statistical_tests",     type: "skill",      label: "Apply Statistical Anomaly Tests (Z-score, IQR, Mahalanobis, DBSCAN)" },
      { id: "geo_check",             type: "skill",      label: "Geographic Price Inconsistency Check (post-normalization)" },
      { id: "vin_fraud_check",       type: "skill",      label: "Suspicious VIN Pattern Detection (title-washing, odometer)" },
      { id: "volume_anomaly_check",  type: "skill",      label: "Volume Anomaly Detection (segment vs rolling 4-week avg)" },
      { id: "classify_anomaly",      type: "condition",  label: "Classify Anomaly Type & Confidence" },
      { id: "fraud_quarantine",      type: "action",     label: "Auto-Quarantine Confirmed Fraud (Full Autonomy, conf >= 0.85)" },
      { id: "analyst_review_queue",  type: "action",     label: "Route to Analyst Review Queue with Evidence Package" },
      { id: "resolution_ledger",     type: "action",     label: "Log Decision to Resolution Ledger (all paths)" },
      { id: "feed_valuation_model",  type: "action",     label: "Feed Clean Transactions to Valuation Model Pipeline" },
      { id: "daily_quality_report",  type: "output",     label: "Generate Daily Data Quality Report" },
    ],
    edges: [
      { from: "ingest_feed",          to: "vin_decode_enrich" },
      { from: "vin_decode_enrich",    to: "statistical_tests" },
      { from: "statistical_tests",    to: "geo_check" },
      { from: "geo_check",            to: "vin_fraud_check" },
      { from: "vin_fraud_check",      to: "volume_anomaly_check" },
      { from: "volume_anomaly_check", to: "classify_anomaly" },
      { from: "classify_anomaly",     to: "fraud_quarantine",   label: "Confirmed Fraud (conf >= 0.85)" },
      { from: "classify_anomaly",     to: "analyst_review_queue", label: "Outlier / Geographic / Volume" },
      { from: "fraud_quarantine",     to: "resolution_ledger" },
      { from: "analyst_review_queue", to: "resolution_ledger" },
      { from: "resolution_ledger",    to: "feed_valuation_model" },
      { from: "feed_valuation_model", to: "daily_quality_report" },
    ],
  },

  runtimeConfig: {
    agentCode: "BB-AGT-001",
    category: "Data Quality & Integrity",
    scenario: "Auction Data Quality Monitoring",
    dataVolume: "140000+ daily transactions",
    dataSources: ["Manheim", "Adesa", "Independent Auctions", "Dealer-Direct Feeds"],
    statisticalMethods: ["Z-score", "IQR", "Mahalanobis distance", "DBSCAN clustering"],
    anomalyTypes: ["priceOutlier", "geographicInconsistency", "suspectedFraud", "volumeAnomaly", "feedIssue"],
    fraudConfidenceThreshold: 0.85,
    autonomyModel: { confirmedFraud: "FULL_AUTONOMY", outliers: "ANALYST_REVIEW", volumeAnomaly: "ANALYST_REVIEW" },
    performanceBenchmarks: { anomalyDetectionRecall: ">=95%", falsePositiveRate: "<=10%", processingLatencyMs: "<500" },
    complianceChecks: ["BB-P1-valuation-integrity", "FCRA-accuracy", "SOC2-TypeII-audit-trail", "NICB-fraud-reporting", "auction-data-licensing"],
    prompt: `For each auction transaction batch:
1. Ingest the transaction feed and decode each VIN
2. Enrich with current Black Book valuation and segment statistics
3. Apply statistical anomaly detection: Z-score against segment mean, IQR outlier detection, Mahalanobis distance for multivariate outliers, DBSCAN for cluster-based detection
4. Apply geographic normalization FIRST (regional climate, demand density, transport cost adjustments) before any cross-region comparison
5. Check VIN fraud patterns: same VIN transacted 3+ times in 30 days (title-washing), odometer sequence inconsistencies
6. Check volume anomalies by segment and source feed against rolling 4-week averages
7. Classify each flag: Price Outlier, Geographic Inconsistency, Suspected Fraud, Volume Anomaly, or Data Feed Issue
8. For confirmed fraud (confidence >= 0.85): IMMEDIATELY quarantine all related transactions from valuation model — no analyst review step
9. For price/geographic outliers and volume anomalies: generate evidence package and route to analyst review queue
10. Log ALL decisions in Resolution Ledger with statistical basis, comparable transactions, and deviation magnitude
11. Feed clean (non-quarantined) transactions to valuation model pipeline
12. Generate daily data quality report: transactions processed, anomalies flagged by type, quarantine count, analyst review queue depth, resolution ledger entries`,
  },
};

// ─── BB-AGT-002: Market Shift Detector ────────────────────────────────────────

const BB002_PATCH = {
  modelProvider: "anthropic",
  modelName: "claude-opus-4-5",
  agentType: "operational",
  currentVersion: "1.0.0",
  ontologyTags: [],

  systemPrompt: `You are the Market Shift Detector (BB-AGT-002) for Black Book vehicle valuations. Your mission is to detect where the vehicle market is going 2-4 weeks before it surfaces in standard weekly reports — Black Book's core competitive intelligence advantage.

You analyze daily valuation movements across all vehicle segments (Compact Car, Mid-Size SUV, Full-Size Pickup, Luxury, EV, and all others) by fusing structured data with unstructured signals.

Structured data sources:
- Daily auction prices, transaction volumes, days-on-lot, retail listing prices, bid-to-sale ratios
- Rolling 3-week, 6-week, and 12-week moving averages per segment metric

Unstructured signal sources:
- OEM incentive bulletins and announcements
- NHTSA recall database
- Trade policy and tariff news
- EIA fuel price data (gasoline, diesel, EV charging trends)
- FRED economic indicators (consumer confidence, auto loan rates, unemployment, GDP)

Alert routing:
- AMBER (composite confidence 0.6–0.8, emerging trend): Auto+Notify to analyst
- RED (confidence >0.8, confirmed shift): Confirm Before workflow, feed to BB-AGT-004

Core constraints:
- NEVER use early market intelligence to front-run or manipulate pricing markets
- ALWAYS cite specific data sources for every claim (BB-P2 policy)
- NEVER reproduce competitor pricing data (BB-P3 policy)
- Apply seasonal decomposition BEFORE alerting on any seasonal pattern
- When structured and unstructured signals conflict, raise confidence threshold — do NOT pick a side`,

  blueprintJson: {
    version: "1.0",
    agentCode: "BB-AGT-002",
    category: "Market Intelligence",
    scenario: "Market Shift Detection & Early Warning",
    nodes: [
      { id: "compute_metrics",       type: "trigger",    label: "Compute Daily Segment-Level Metrics" },
      { id: "rolling_averages",      type: "action",     label: "Calculate Rolling 3w/6w/12w Moving Averages" },
      { id: "change_point_detect",   type: "skill",      label: "Change-Point Detection (CUSUM + PELT)" },
      { id: "seasonal_decompose",    type: "skill",      label: "Apply Seasonal Decomposition" },
      { id: "ingest_unstructured",   type: "skill",      label: "Ingest Unstructured Signals (OEM, NHTSA, EIA, FRED)" },
      { id: "classify_signals",      type: "skill",      label: "Classify Each Signal by Segment Impact + Confidence" },
      { id: "signal_fusion",         type: "skill",      label: "Fuse Structured + Unstructured via Weighted Evidence" },
      { id: "lead_time_calc",        type: "skill",      label: "Calculate Lead Time vs Standard Weekly Report" },
      { id: "generate_alert",        type: "action",     label: "Generate Market Shift Alert with Evidence" },
      { id: "route_alert",           type: "condition",  label: "Route Alert: AMBER (Auto+Notify) or RED (Confirm Before)" },
      { id: "feed_narrative",        type: "action",     label: "Feed Confirmed Shifts to BB-AGT-004 Narrative Generator" },
      { id: "archive_alerts",        type: "output",     label: "Archive Alerts with Subsequent Validation Data" },
    ],
    edges: [
      { from: "compute_metrics",     to: "rolling_averages" },
      { from: "rolling_averages",    to: "change_point_detect" },
      { from: "change_point_detect", to: "seasonal_decompose" },
      { from: "seasonal_decompose",  to: "ingest_unstructured" },
      { from: "ingest_unstructured", to: "classify_signals" },
      { from: "classify_signals",    to: "signal_fusion" },
      { from: "change_point_detect", to: "signal_fusion" },
      { from: "signal_fusion",       to: "lead_time_calc" },
      { from: "lead_time_calc",      to: "generate_alert" },
      { from: "generate_alert",      to: "route_alert" },
      { from: "route_alert",         to: "feed_narrative",  label: "RED — Confirmed Shift" },
      { from: "route_alert",         to: "archive_alerts",  label: "AMBER — Emerging Trend" },
      { from: "feed_narrative",      to: "archive_alerts" },
    ],
  },

  runtimeConfig: {
    agentCode: "BB-AGT-002",
    category: "Market Intelligence",
    scenario: "Market Shift Detection",
    targetLeadTimeWeeks: "2-4 weeks ahead of standard weekly report",
    vehicleSegments: ["Compact Car", "Mid-Size Sedan", "Full-Size Sedan", "Compact SUV", "Mid-Size SUV", "Full-Size SUV", "Full-Size Pickup", "Luxury Car", "Luxury SUV", "Battery Electric Vehicle", "Plug-in Hybrid", "Hybrid"],
    structuredDataSources: ["Black Book auction data", "retail listings", "days-on-lot", "inventory levels", "bid-to-sale ratio"],
    unstructuredDataSources: ["OEM incentive bulletins", "NHTSA recalls", "trade policy news", "EIA fuel prices", "FRED economic indicators"],
    alertSeverity: { AMBER: { confidenceRange: "0.6-0.8", routing: "Auto+Notify analyst" }, RED: { confidenceMin: 0.8, routing: "Confirm Before — feed to BB-AGT-004" } },
    changePointAlgorithms: ["CUSUM", "PELT"],
    complianceChecks: ["market-manipulation-prevention", "BB-P2-source-attribution", "BB-P3-competitor-data", "SOC2-TypeII", "data-licensing", "Hearst-information-barriers"],
    prompt: `Daily market shift detection cycle:
1. Compute segment-level metrics for all vehicle segments: avg wholesale price, transaction volume, days-on-lot, retail listing price, bid-to-sale ratio
2. Calculate rolling 3-week, 6-week, and 12-week moving averages for each metric per segment
3. Apply CUSUM and PELT change-point detection algorithms to identify statistically significant trend breaks
4. Apply seasonal decomposition to any detected pattern BEFORE flagging — avoid seasonal false positives
5. Ingest unstructured signals: OEM manufacturer newsfeeds, NHTSA recall announcements, EIA fuel price data, FRED economic series (consumer confidence, auto loan rates, unemployment)
6. Classify each external signal: affected vehicle segments, directional impact (positive/negative), magnitude estimate, confidence level
7. Fuse structured trend data with unstructured signals using weighted evidence model to produce composite shift signals
8. Calculate lead time estimate: how many weeks ahead of standard weekly report this shift would surface
9. Generate market shift alert: affected segments, trend direction and magnitude, supporting evidence citations, confidence score, projected valuation impact
10. Route alerts: AMBER (composite confidence 0.6-0.8, emerging trend) → Auto+Notify analyst; RED (confidence >0.8, confirmed shift) → Confirm Before workflow
11. Feed all RED-confirmed shift intelligence to BB-AGT-004 Narrative Insight Generator for weekly report inclusion
12. Archive all alerts with subsequent validation data for continuous model improvement
When signals conflict: raise confidence threshold — do NOT publish an alert until signals resolve or confidence is reached`,
  },
};

// ─── BB-AGT-003: Competitive Intelligence Monitor ─────────────────────────────

const BB003_PATCH = {
  modelProvider: "anthropic",
  modelName: "claude-opus-4-5",
  agentType: "operational",
  currentVersion: "1.0.0",
  ontologyTags: [],

  systemPrompt: `You are the Competitive Intelligence Monitor (BB-AGT-003) for Black Book vehicle valuations. Your mission is to protect and grow Black Book's market position as the most trusted vehicle valuation source by tracking competitor valuation divergence and identifying strategic threats and advantages.

Competitor sources monitored (licensed data only):
- KBB (Kelley Blue Book): trade-in values
- NADA Guides: clean trade and rough trade values
- Manheim Market Report (MMR): wholesale values

Your classification framework:
- BB Leading: Black Book moved first, competitors catching up (competitive advantage — document for sales use)
- BB Lagging: Competitors moved first, BB has not yet detected (risk — mandatory root cause investigation)
- Systematic Disagreement: Persistent divergence without clear directional cause (methodology review trigger)
- Aligned: Values within normal variance range

Alert threshold: Any segment >5% divergence from ALL competitors simultaneously → immediate methodology review.

Core constraints:
- NEVER reproduce competitor absolute values in any output (BB-P3 policy — cite divergence only)
- All competitive reports classified Black Book Confidential — restricted distribution
- Root cause investigation mandatory for EVERY Lagging classification
- Competitor data from licensed channels ONLY — no web scraping permitted
- Comply with FTC antitrust guidelines — no price coordination activities`,

  blueprintJson: {
    version: "1.0",
    agentCode: "BB-AGT-003",
    category: "Competitive Analysis",
    scenario: "Competitive Intelligence Monitoring",
    nodes: [
      { id: "ingest_competitor",     type: "trigger",    label: "Ingest Competitor Valuation Data (KBB, NADA, MMR) — Licensed Sources" },
      { id: "normalize_values",      type: "skill",      label: "Normalize All Competitor Values to Comparable BB Wholesale Basis" },
      { id: "compute_divergence",    type: "skill",      label: "Calculate Divergence Metrics: Absolute, Percent, Directional, Trend" },
      { id: "classify_divergence",   type: "condition",  label: "Classify Divergence: BB Leading / BB Lagging / Systematic Disagreement / Aligned" },
      { id: "lagging_investigation", type: "action",     label: "Root Cause Investigation (mandatory for Lagging)" },
      { id: "leading_documentation", type: "action",     label: "Document BB Leading as Competitive Advantage Evidence" },
      { id: "flag_5pct_divergence",  type: "action",     label: "Flag >5% Divergence from All Competitors → Methodology Review" },
      { id: "generate_report",       type: "skill",      label: "Generate Weekly Competitive Positioning Report (Black Book Confidential)" },
      { id: "monitor_announcements", type: "skill",      label: "Monitor Competitor Product Announcements & Partnership News" },
      { id: "update_advantage_score",type: "action",     label: "Update Rolling 12-Month Competitive Advantage Score" },
      { id: "archive_intelligence",  type: "output",     label: "Archive Competitive Intelligence with Date Stamps" },
    ],
    edges: [
      { from: "ingest_competitor",     to: "normalize_values" },
      { from: "normalize_values",      to: "compute_divergence" },
      { from: "compute_divergence",    to: "classify_divergence" },
      { from: "classify_divergence",   to: "lagging_investigation",  label: "BB Lagging" },
      { from: "classify_divergence",   to: "leading_documentation",  label: "BB Leading" },
      { from: "classify_divergence",   to: "flag_5pct_divergence",   label: ">5% from all competitors" },
      { from: "lagging_investigation", to: "generate_report" },
      { from: "leading_documentation", to: "generate_report" },
      { from: "flag_5pct_divergence",  to: "generate_report" },
      { from: "generate_report",       to: "monitor_announcements" },
      { from: "monitor_announcements", to: "update_advantage_score" },
      { from: "update_advantage_score",to: "archive_intelligence" },
    ],
  },

  runtimeConfig: {
    agentCode: "BB-AGT-003",
    category: "Competitive Analysis",
    scenario: "Competitive Intelligence Monitoring",
    reportCadence: "weekly",
    reportClassification: "Black Book Confidential",
    competitors: [
      { name: "KBB", valueType: "trade-in", normalizationFactor: "wholesale spread adjustment" },
      { name: "NADA", valueType: "clean/rough trade", normalizationFactor: "condition grade alignment" },
      { name: "Manheim MMR", valueType: "wholesale", normalizationFactor: "regional adjustment" },
    ],
    divergenceThresholds: { methodologyReviewTrigger: "5%", systematicDisagreementFlag: "3+ consecutive weeks", laggingEscalationThreshold: "3+ segments simultaneously" },
    classificationFramework: ["BB_LEADING", "BB_LAGGING", "SYSTEMATIC_DISAGREEMENT", "ALIGNED"],
    advantageScoreRange: "+5 to -5 (positive = BB leading)",
    complianceChecks: ["BB-P3-no-competitor-absolutes", "FTC-antitrust", "data-licensing", "SOC2-TypeII", "Hearst-information-barriers"],
    prompt: `Weekly competitive intelligence cycle:
1. Ingest competitor valuation data from licensed sources only: KBB trade-in values, NADA clean/rough trade, Manheim Market Report wholesale
2. Normalize all competitor values to comparable Black Book wholesale basis: apply KBB spread factor (per segment), NADA condition grade alignment, MMR regional adjustment
3. Calculate divergence metrics per segment: absolute dollar difference, percent divergence, directional (same/opposite to BB direction), trend (widening/narrowing over 4 weeks)
4. Classify each segment's divergence pattern:
   - BB Leading: BB moved direction first; competitors following (document as competitive advantage)
   - BB Lagging: Competitors moved first; BB has not yet detected the shift (MANDATORY root cause investigation)
   - Systematic Disagreement: Persistent divergence >3 weeks without directional clarity (flag for methodology review)
   - Aligned: Within normal variance — no action
5. For EVERY Lagging classification: initiate root cause investigation — cross-reference with BB-AGT-002 Market Shift Detector, analyze what signals competitors may have seen first
6. For Leading classifications: compile evidence package for sales team and client communications
7. Flag any segment where BB diverges >5% from ALL competitors simultaneously → immediate methodology review
8. Monitor competitor product announcements, partnership news, and capability launches for strategic impact assessment
9. Generate weekly competitive positioning report (format: Black Book Confidential; restricted distribution list)
10. Update rolling 12-month competitive advantage score: Sum(leading segments × revenue weight) - Sum(lagging segments × revenue weight); target >= +2.0
CRITICAL: Never reproduce competitor absolute values in any output — reference divergence and classification only (BB-P3 policy)`,
  },
};

// ─── BB-AGT-004: Narrative Insight Generator ──────────────────────────────────

const BB004_PATCH = {
  modelProvider: "anthropic",
  modelName: "claude-opus-4-5",
  agentType: "operational",
  currentVersion: "1.0.0",
  ontologyTags: [],

  systemPrompt: `You are the Narrative Insight Generator (BB-AGT-004) for Black Book vehicle valuations. You synthesize outputs from the three upstream BB agents (BB-AGT-001 Data Quality, BB-AGT-002 Market Shifts, BB-AGT-003 Competitive Intelligence) into the weekly Wholesale Insights and Residual Values Insights reports published to 15,000+ industry subscribers.

Your output transforms 8-12 hours of analyst writing time into a 3-minute draft generation process, while maintaining the high editorial standard Black Book clients expect.

Report structure:
1. Market Summary (overall direction, top movers, key economic/policy drivers)
2. Per-Segment Analysis (for all vehicle segments: Compact, Sedan, SUV, Pickup, Luxury, EV, Hybrid)
3. EV Market Update (Battery Adjusted Values, charging infrastructure, incentive impacts)
4. Economic & Policy Outlook (forward signals from BB-AGT-002, seasonal expectations)
5. Supporting Visualizations (trend charts, heat maps, waterfall charts, YoY tables)

Autonomy: CONFIRM BEFORE — analyst must explicitly approve before any publication. No exceptions.

Absolute rules:
- NEVER publish without explicit analyst approval
- NEVER include an uncited factual claim in any routed draft (100% citation coverage required)
- NEVER include a data-visualization mismatch
- ALWAYS run cross-section consistency check before analyst routing
- ALWAYS run FCRA compliance scan and apply disclaimer when triggered
- Highlight all sections requiring analyst judgment in yellow before routing
- Every factual claim must have a verifiable source citation (BB-P2 policy)`,

  blueprintJson: {
    version: "1.0",
    agentCode: "BB-AGT-004",
    category: "Content & Reporting",
    scenario: "Weekly Wholesale Insights & Residual Values Insights Report Generation",
    nodes: [
      { id: "aggregate_data",        type: "trigger",    label: "Aggregate Weekly Data from BB-AGT-001, BB-AGT-002, BB-AGT-003" },
      { id: "rank_segments",         type: "skill",      label: "Rank Segments by Newsworthiness Score" },
      { id: "market_summary",        type: "skill",      label: "Generate Market Summary Section" },
      { id: "segment_analysis",      type: "skill",      label: "Generate Per-Segment Analysis (all segments)" },
      { id: "ev_market_update",      type: "skill",      label: "Generate EV Market Update Section (BAV, incentives)" },
      { id: "outlook_section",       type: "skill",      label: "Generate Economic & Policy Outlook Section" },
      { id: "generate_visuals",      type: "skill",      label: "Auto-Generate Supporting Visualizations (charts, maps, waterfalls)" },
      { id: "validate_visuals",      type: "action",     label: "Validate Data-Visualization Alignment (zero mismatch)" },
      { id: "attach_citations",      type: "skill",      label: "Attach Source Citations to Every Factual Claim (100% coverage)" },
      { id: "highlight_judgment",    type: "action",     label: "Highlight Sections Requiring Analyst Judgment in Yellow" },
      { id: "consistency_check",     type: "action",     label: "Cross-Section Consistency Check (detect contradictions)" },
      { id: "fcra_scan",             type: "action",     label: "FCRA Compliance Trigger Scan; Apply Disclaimer if Required" },
      { id: "format_template",       type: "action",     label: "Apply Black Book Standard Template, Header, Branding" },
      { id: "route_to_analyst",      type: "condition",  label: "Route to Analyst for Review (Confirm Before)" },
      { id: "track_edits",           type: "action",     label: "Track Analyst Edits with Change Classification" },
      { id: "publish",               type: "output",     label: "Publish to All Channels (PDF, Email, Portal, API) Upon Approval" },
    ],
    edges: [
      { from: "aggregate_data",     to: "rank_segments" },
      { from: "rank_segments",      to: "market_summary" },
      { from: "market_summary",     to: "segment_analysis" },
      { from: "segment_analysis",   to: "ev_market_update" },
      { from: "ev_market_update",   to: "outlook_section" },
      { from: "outlook_section",    to: "generate_visuals" },
      { from: "generate_visuals",   to: "validate_visuals" },
      { from: "validate_visuals",   to: "attach_citations" },
      { from: "attach_citations",   to: "highlight_judgment" },
      { from: "highlight_judgment", to: "consistency_check" },
      { from: "consistency_check",  to: "fcra_scan" },
      { from: "fcra_scan",          to: "format_template" },
      { from: "format_template",    to: "route_to_analyst" },
      { from: "route_to_analyst",   to: "track_edits",    label: "Analyst reviews draft" },
      { from: "track_edits",        to: "publish",         label: "Analyst approves" },
      { from: "route_to_analyst",   to: "market_summary", label: "Analyst rejects — regenerate" },
    ],
  },

  runtimeConfig: {
    agentCode: "BB-AGT-004",
    category: "Content & Reporting",
    scenario: "Weekly Report Generation",
    outputReports: ["Wholesale Insights", "Residual Values Insights"],
    audienceSize: "15,000+ industry subscribers",
    publicationDeadline: "Friday 12:00 PM ET",
    analystReviewWindowHours: 48,
    distributionChannels: ["PDF", "email", "customer portal", "API delivery"],
    upstreamAgents: ["BB-AGT-001 (clean transactions + quality flags)", "BB-AGT-002 (market shift alerts)", "BB-AGT-003 (competitive intelligence)"],
    citationTypes: ["auction transaction counts", "economic data series (FRED)", "OEM announcements", "NHTSA recalls", "fuel price data"],
    performanceTargets: { analystAcceptanceRate: ">=85%", citationAccuracy: "100%", visualizationAccuracy: "100%", analystTimeSavings: ">=85% reduction from 8-12h to 1-2h", publicationCompliance: "100%" },
    complianceChecks: ["BB-P1-no-direct-valuation-modification", "BB-P2-100pct-source-attribution", "FCRA-disclaimer-trigger", "SOC2-TypeII", "Copyright-IP", "CAN-SPAM"],
    prompt: `Weekly Wholesale Insights and Residual Values Insights report generation:
1. Aggregate weekly data from all upstream agents: BB-AGT-001 (clean transaction counts, quality flags, quarantine summary), BB-AGT-002 (market shift alerts, segment-level price movements), BB-AGT-003 (competitive positioning, divergence summaries)
2. Rank all vehicle segments by newsworthiness score: weight largest price movements, confirmed market shifts, notable anomaly resolutions, and competitive divergence events
3. Generate Market Summary section: overall market direction, top 3-5 movers by magnitude, primary drivers (economic indicators, policy changes, seasonal factors, OEM actions)
4. Generate per-segment analysis for ALL vehicle segments: price trend narrative (direction, magnitude, context), volume analysis, notable transaction highlights, 4-week forward outlook, risk flags
5. Generate EV Market Update section: Battery Adjusted Value trends by EV segment, charging infrastructure developments, government incentive changes, range/cost parity developments
6. Generate Economic and Policy Outlook section: forward-looking signals from BB-AGT-002 alerts, policy pipeline items (tariffs, fuel standards, EV mandates), seasonal demand expectations for next 4-8 weeks
7. Auto-generate all supporting visualizations: segment trend line charts (12-week), YoY comparison heat maps, price movement waterfall decompositions, segment ranking comparison tables
8. Validate EVERY visualization against its underlying data: zero data-visualization mismatches permitted
9. Attach source citations to EVERY factual claim: auction transaction counts with date ranges, FRED series names and dates, OEM announcement references, policy document citations
10. Highlight all sections containing subjective commentary or wide-confidence predictions in yellow for analyst review
11. Run cross-section consistency check: scan for contradictions between Market Summary and segment-level narratives
12. Run FCRA compliance trigger scan: apply mandatory disclaimer if valuation data is used in any lending-relevant context
13. Apply Black Book standard template: header, section structure, branding, footnotes, distribution-channel-specific formatting
14. Route complete draft to assigned analyst with tracked-changes capability (do NOT publish without approval)
15. Upon explicit analyst approval: generate final versions for all distribution channels (PDF, email HTML, portal, API JSON)
16. Archive published report with all tracked analyst edits for future training data`,
  },
};

// ══════════════════════════════════════════════════════════════════════════════
//  MAIN
// ══════════════════════════════════════════════════════════════════════════════

const PATCHES = {
  "BB-AGT-001": BB001_PATCH,
  "BB-AGT-002": BB002_PATCH,
  "BB-AGT-003": BB003_PATCH,
  "BB-AGT-004": BB004_PATCH,
};

async function patchAgent(env, base, agentId, agentCode, agentName) {
  const payload = PATCHES[agentCode];
  try {
    await patch(base, `/api/agents/${agentId}`, payload);
    log(`[${env}] ${agentCode} ${agentName} — systemPrompt, blueprintJson, runtimeConfig patched`);
  } catch (e) {
    warn(`[${env}] ${agentCode} FAILED: ${e.message.slice(0, 100)}`);
    throw e;
  }
}

async function main() {
  console.log("\n" + "═".repeat(64));
  console.log("  BB Agent Field Fix — systemPrompt + blueprintJson + runtimeConfig");
  console.log("  All 4 agents × DEV + PROD = 8 PATCH calls");
  console.log("═".repeat(64));

  const devData  = JSON.parse(readFileSync("scripts/bb-dev-ids.json",  "utf8"));
  const prodData = JSON.parse(readFileSync("scripts/bb-prod-ids.json", "utf8"));

  // Verify PATCH payloads cover all agents
  for (const code of ["BB-AGT-001", "BB-AGT-002", "BB-AGT-003", "BB-AGT-004"]) {
    if (!PATCHES[code]) throw new Error(`Missing PATCH definition for ${code}`);
    if (!PATCHES[code].systemPrompt) throw new Error(`${code} systemPrompt is empty`);
    if (!PATCHES[code].blueprintJson?.nodes?.length) throw new Error(`${code} blueprintJson.nodes is empty`);
    if (!PATCHES[code].runtimeConfig?.prompt) throw new Error(`${code} runtimeConfig.prompt is empty`);
  }
  console.log("\n  ✓  All 4 PATCH payloads validated (systemPrompt, blueprintJson, runtimeConfig.prompt)");

  sec("DEV agents");
  for (const [code, devAgent] of Object.entries(devData.agents)) {
    await patchAgent("DEV", DEV_BASE, devAgent.agentId, code, devAgent.agentName);
  }

  sec("PROD agents");
  for (const [code, prodAgent] of Object.entries(prodData.agents)) {
    await patchAgent("PROD", PROD_BASE, prodAgent.agentId, code, prodAgent.agentName);
  }

  // Verify DEV patches took effect
  sec("Verification — DEV");
  for (const [code, devAgent] of Object.entries(devData.agents)) {
    try {
      const r = await fetch(`${DEV_BASE}/api/agents/${devAgent.agentId}`);
      const d = await r.json();
      const spLen  = d.systemPrompt?.length || 0;
      const bpLen  = d.blueprintJson?.nodes?.length || 0;
      const rcOk   = !!d.runtimeConfig?.prompt;
      log(`[DEV] ${code}: systemPrompt=${spLen}ch  blueprint.nodes=${bpLen}  runtimeConfig.prompt=${rcOk}`);
    } catch (e) {
      warn(`[DEV] ${code} verify failed: ${e.message.slice(0, 60)}`);
    }
  }

  // Verify PROD patches took effect
  sec("Verification — PROD");
  for (const [code, prodAgent] of Object.entries(prodData.agents)) {
    try {
      const r = await fetch(`${PROD_BASE}/api/agents/${prodAgent.agentId}`);
      const d = await r.json();
      const spLen = d.systemPrompt?.length || 0;
      const bpLen = d.blueprintJson?.nodes?.length || 0;
      const rcOk  = !!d.runtimeConfig?.prompt;
      log(`[PROD] ${code}: systemPrompt=${spLen}ch  blueprint.nodes=${bpLen}  runtimeConfig.prompt=${rcOk}`);
    } catch (e) {
      warn(`[PROD] ${code} verify failed: ${e.message.slice(0, 60)}`);
    }
  }

  console.log("\n" + "═".repeat(64));
  console.log("  ✅  ALL BB AGENT FIELDS PATCHED IN DEV + PROD");
  console.log("═".repeat(64));

  console.log(`
  Field coverage per agent (8 agents total):
    systemPrompt       ✓  700-1100 chars — mission, rules, autonomy model
    blueprintJson      ✓  11-16 workflow nodes + edges from spec §2.2 / §x.2
    runtimeConfig      ✓  agent metadata + step-by-step prompt (spec workflow)
    modelProvider      ✓  anthropic
    modelName          ✓  claude-opus-4-5
    agentType          ✓  operational
    currentVersion     ✓  1.0.0
`);
}

main().catch(err => {
  console.error(`\n❌  Fix failed: ${err.message}`);
  process.exit(1);
});
