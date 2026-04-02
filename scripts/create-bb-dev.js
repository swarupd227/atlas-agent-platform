#!/usr/bin/env node
/**
 * Hearst Black Book — Vehicle Valuation Agents
 * BB-AGT-001  Auction Data Quality Sentinel
 * BB-AGT-002  Market Shift Detector
 * BB-AGT-003  Competitive Intelligence Monitor
 * BB-AGT-004  Narrative Insight Generator
 *
 * DEV ENVIRONMENT — SINGLE COMPREHENSIVE CREATION SCRIPT
 *
 * Per agent: 6 Skills, 1 KB + 6 Sources, 6 Runbooks, 5-6 Policies,
 *            Agent, Runbook/Policy/KB links, 6 Test Cases, Eval Suite,
 *            Outcome + KPIs, Ontology Tags
 *
 * Linkage sequence (per agent):
 *   1  Skills   → POST /api/skills
 *   2  KB       → POST /api/knowledge-bases
 *   3  Sources  → POST /api/knowledge-bases/:id/sources/text
 *   4  Runbooks → POST /api/runbooks
 *   5  Policies → POST /api/policies
 *   6  Agent    → POST /api/agents  (preloadedSkills at creation)
 *   7  Runbook link  → PATCH /api/runbooks/:id  { agentId }
 *   8  Policy link   → PATCH /api/policies/:id  { scopeId, scopeType:"agent" }
 *   9  KB link       → POST /api/agents/:id/knowledge-bases
 *  10  Dataset + TCs → POST /api/golden-datasets  + /test-cases
 *  11  Eval Suite    → POST /api/evals
 *  12  Outcome       → POST /api/outcomes/with-kpis
 *  13  Agent update  → PATCH /api/agents/:id  { outcomeId, evalBindings, ontologyTags }
 *
 * Usage:   node scripts/create-bb-dev.js
 * Saves:   scripts/bb-dev-ids.json
 */

import { writeFileSync } from "fs";

const BASE = "http://localhost:5000";
const ORG  = "0c9bcf16-cdd9-45e2-87f6-6a839a7f7056";

// ── HTTP Helpers ──────────────────────────────────────────────────────────────

async function post(path, body) {
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  if (text.startsWith("<!DOCTYPE") || text.startsWith("<html")) {
    throw new Error(`POST ${path} → HTML (route missing?): ${text.slice(0, 200)}`);
  }
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!r.ok) throw new Error(`POST ${path} → ${r.status}: ${JSON.stringify(data).slice(0, 600)}`);
  return data;
}

async function patch(path, body) {
  const r = await fetch(`${BASE}${path}`, {
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

async function get(path) {
  const r = await fetch(`${BASE}${path}`, { headers: { "Content-Type": "application/json" } });
  const text = await r.text();
  if (text.startsWith("<!DOCTYPE") || text.startsWith("<html")) {
    throw new Error(`GET ${path} → HTML`);
  }
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!r.ok) throw new Error(`GET ${path} → ${r.status}: ${JSON.stringify(data).slice(0, 600)}`);
  return data;
}

const log  = (msg) => console.log(`  ✓  ${msg}`);
const warn = (msg) => console.log(`  ⚠  ${msg}`);
const step = (n, t, label) => console.log(`\nSTEP ${n}/${t}  ${label}...`);

// Safe backtick helpers — never put raw backticks inside template literals
const BT  = "\x60";
const TBT = "\x60\x60\x60";

// ══════════════════════════════════════════════════════════════════════════════
//  BB-AGT-001 — AUCTION DATA QUALITY SENTINEL
// ══════════════════════════════════════════════════════════════════════════════

const BB001_SKILLS = [
  {
    organizationId: ORG,
    name: "Statistical Anomaly Detection Skill",
    description: "Applies Z-score, IQR, Mahalanobis distance, and DBSCAN clustering for multi-dimensional outlier detection on incoming auction transactions. For each VIN transaction, computes Z-score against segment mean, detects IQR outliers, and applies Mahalanobis distance for correlated variables (price, mileage, condition). Flags transactions exceeding 3-sigma deviation. Produces per-transaction anomaly scores with statistical test details for analyst review.",
    industry: "automotive",
    domain: "data-quality-integrity",
    version: "1.0.0",
    author: "Black Book Data Team",
    trustTier: "HIGH",
    dependencies: [],
    tags: ["anomaly-detection", "statistical-testing", "z-score", "IQR", "mahalanobis", "DBSCAN", "BB-AGT-001"],
    status: "active",
    complexity: "complex",
    allowedTools: ["retrieve_kb", "compute_z_score", "compute_iqr_bounds", "compute_mahalanobis", "run_dbscan_clustering", "query_segment_statistics", "flag_anomaly", "log_statistical_result"],
    requiredMcpServers: ["blackbook-valuation-mcp", "auction-transaction-mcp"],
    requiredDataClassifications: ["auction_transaction_data", "vehicle_valuation_data", "segment_statistics"],
    disableModelInvocation: false,
    contextMode: "rag",
    userInvocable: false,
    descriptionQualityScore: 92,
    knowledgeQueries: ["Z-score threshold calibration by segment", "IQR outlier bounds by vehicle category", "Mahalanobis distance computation for price-mileage-condition", "DBSCAN epsilon and min-samples tuning for auction data", "Segment mean and standard deviation baselines"],
    yamlFrontmatter: "name: Statistical Anomaly Detection Skill\nversion: \"1.0\"\nagent_code: BB-AGT-001\ndomain: data-quality-integrity\nindustry: automotive\ntrust_tier: HIGH\ncontext_mode: rag\ndetection_methods: [z_score, IQR, mahalanobis, DBSCAN]\nthreshold_sigma: 3\nfalse_positive_target: 0.10",
    markdownBody: "# Statistical Anomaly Detection Skill\n\n## Purpose\nDetects price and condition anomalies in incoming auction transactions using a multi-method statistical approach before they can contaminate the Black Book valuation model.\n\n## Detection Methods\n\n### Z-Score Analysis\n- Computes segment-level mean and standard deviation from rolling 4-week transaction window\n- Flags any transaction where |Z| > 3.0 as a price outlier\n- Applies separate Z-score calculations for wholesale and retail price components\n\n### IQR Outlier Detection\n- Calculates Q1, Q3, and IQR per segment\n- Lower fence: Q1 - 1.5 * IQR; Upper fence: Q3 + 1.5 * IQR\n- Extreme outlier threshold: Q1 - 3.0 * IQR / Q3 + 3.0 * IQR\n\n### Mahalanobis Distance\n- Considers correlated variables: sale price, mileage, condition grade, age\n- Threshold: chi-squared 99th percentile for dimensionality\n- Detects multivariate outliers missed by univariate methods\n\n### DBSCAN Clustering\n- Groups transactions by region and segment\n- Noise points (not in any cluster) flagged as volume anomalies or isolated outliers\n- Epsilon tuned per segment based on historical density\n\n## Output Format\nEach flagged transaction returns: anomaly type, test method, deviation magnitude, segment statistics, and recommended action (quarantine | analyst review | pass).",
  },
  {
    organizationId: ORG,
    name: "VIN Fraud Pattern Recognition Skill",
    description: "Identifies title-washing, odometer rollback, and data fabrication patterns by analyzing VIN transaction histories across auction networks. Detects same-VIN transactions appearing 3 or more times within a 30-day rolling window as a title-washing signal. Cross-references mileage sequences for non-monotonic odometer readings indicating rollback. Matches transaction chains against NICB known fraud pattern signatures. Produces fraud classification with confidence score and full VIN history evidence package.",
    industry: "automotive",
    domain: "data-quality-integrity",
    version: "1.0.0",
    author: "Black Book Data Team",
    trustTier: "HIGH",
    dependencies: [],
    tags: ["fraud-detection", "VIN-analysis", "title-washing", "odometer-fraud", "NICB", "BB-AGT-001"],
    status: "active",
    complexity: "complex",
    allowedTools: ["retrieve_kb", "query_vin_transaction_history", "check_odometer_sequence", "match_nicb_patterns", "compute_fraud_confidence_score", "quarantine_transaction", "generate_fraud_evidence_package"],
    requiredMcpServers: ["blackbook-valuation-mcp", "auction-transaction-mcp", "vin-history-mcp"],
    requiredDataClassifications: ["auction_transaction_data", "vin_history_data", "fraud_pattern_data"],
    disableModelInvocation: false,
    contextMode: "rag",
    userInvocable: false,
    descriptionQualityScore: 93,
    knowledgeQueries: ["NICB title-washing VIN patterns", "Odometer rollback indicators by vehicle age", "Multi-auction VIN transaction frequency thresholds", "Known fraud rings and auction house correlations", "State DMV reporting obligations for suspected title fraud"],
    yamlFrontmatter: "name: VIN Fraud Pattern Recognition Skill\nversion: \"1.0\"\nagent_code: BB-AGT-001\ndomain: data-quality-integrity\nindustry: automotive\ntrust_tier: HIGH\ncontext_mode: rag\nfraud_types: [title_washing, odometer_rollback, data_fabrication]\nwindow_days: 30\ntitle_wash_threshold: 3",
    markdownBody: "# VIN Fraud Pattern Recognition Skill\n\n## Purpose\nProtects Black Book valuation integrity by identifying fraudulent auction transactions before they enter the pricing model.\n\n## Fraud Pattern Detection\n\n### Title Washing\n- Queries full VIN transaction history across all connected auction sources\n- Flags VINs appearing in 3+ distinct transactions within any 30-day rolling window\n- Checks for rapid state-to-state transfers that indicate title clearing attempts\n- Cross-references seller/buyer identity patterns for linked-entity fraud rings\n\n### Odometer Fraud\n- Extracts mileage sequence from VIN history sorted by transaction date\n- Flags any non-monotonic sequence (mileage decrease between transactions)\n- Applies tolerance for measurement error (+/- 50 miles)\n- Compares recorded mileage against model-year and condition-implied expected range\n\n### NICB Pattern Matching\n- Loads current NICB fraud indicator library from knowledge base\n- Applies pattern matching against known title-washing signatures and VIN cloning indicators\n- Checks auction house and region combinations against known fraud corridors\n\n## Output\nFraud classification (confirmed | suspected | clear), confidence score (0-1.0), full VIN transaction chain, deviation from expected pattern, and recommended action.",
  },
  {
    organizationId: ORG,
    name: "Geographic Price Normalization Skill",
    description: "Adjusts expected auction prices for regional market factors before flagging geographic inconsistencies. Applies documented regional adjustments for climate (rust belt discount, desert premium), demand density (metro vs rural), and transport cost corridors. A vehicle priced 25% lower in one region requires normalization before comparing against another region's price. Prevents false-positive geographic inconsistency flags caused by legitimate regional market differences.",
    industry: "automotive",
    domain: "data-quality-integrity",
    version: "1.0.0",
    author: "Black Book Data Team",
    trustTier: "MEDIUM",
    dependencies: [],
    tags: ["geographic-normalization", "regional-pricing", "market-adjustment", "BB-AGT-001"],
    status: "active",
    complexity: "moderate",
    allowedTools: ["retrieve_kb", "lookup_regional_adjustment_factor", "apply_climate_discount", "apply_demand_density_factor", "apply_transport_cost_adjustment", "compute_normalized_price", "flag_geographic_inconsistency"],
    requiredMcpServers: ["blackbook-valuation-mcp", "regional-market-mcp"],
    requiredDataClassifications: ["auction_transaction_data", "regional_market_data"],
    disableModelInvocation: false,
    contextMode: "rag",
    userInvocable: false,
    descriptionQualityScore: 88,
    knowledgeQueries: ["Regional price adjustment factors by state and metro area", "Climate-based vehicle condition discounts (rust belt, desert, coastal)", "Transport cost corridors for dealer-to-dealer movement", "Demand density indices by zip code and region", "Historical geographic price differential baselines by segment"],
    yamlFrontmatter: "name: Geographic Price Normalization Skill\nversion: \"1.0\"\nagent_code: BB-AGT-001\ndomain: data-quality-integrity\nindustry: automotive\ntrust_tier: MEDIUM\ncontext_mode: rag\ngeo_inconsistency_threshold_pct: 25\nadjustment_factors: [climate, demand_density, transport_cost]",
    markdownBody: "# Geographic Price Normalization Skill\n\n## Purpose\nEliminates false-positive geographic inconsistency flags by accounting for legitimate regional market differences before comparing prices across regions.\n\n## Normalization Factors\n\n### Climate Adjustment\n- Rust Belt states (OH, MI, PA, NY, WI): apply corrosion discount (3-8% by vehicle age)\n- Desert states (AZ, NV, NM): apply heat/UV premium or discount by vehicle type\n- Coastal salt exposure (FL, coastal CA): apply corrosion adjustment\n\n### Demand Density\n- Metropolitan areas (>500K population): demand premium index applied\n- Rural markets: liquidity discount applied\n- Index values maintained in regional market factor database in knowledge base\n\n### Transport Cost\n- Door-to-door transport cost corridors loaded from KB\n- Adjustment = transport cost / vehicle value percentage\n- Applied bidirectionally based on movement direction\n\n## Inconsistency Detection\nAfter normalization, flags any remaining price difference >25% between comparable VIN/segment/condition transactions across regions as a genuine geographic inconsistency requiring analyst review.",
  },
  {
    organizationId: ORG,
    name: "Volume Anomaly Detection Skill",
    description: "Monitors segment-level transaction volumes against rolling 4-week baselines and seasonal patterns to detect feed outages or genuine market disruptions. Flags when a segment's daily volume deviates more than 2 sigma from the expected range. Distinguishes between data feed issues (sudden zero or near-zero volume), genuine market slowdowns (gradual decline with supporting market signals), and seasonal patterns (expected holiday or tax-refund volume shifts).",
    industry: "automotive",
    domain: "data-quality-integrity",
    version: "1.0.0",
    author: "Black Book Data Team",
    trustTier: "MEDIUM",
    dependencies: [],
    tags: ["volume-anomaly", "feed-health", "segment-monitoring", "BB-AGT-001"],
    status: "active",
    complexity: "moderate",
    allowedTools: ["retrieve_kb", "query_segment_daily_volume", "compute_rolling_volume_average", "compute_seasonal_baseline", "flag_volume_anomaly", "classify_volume_cause", "alert_data_team"],
    requiredMcpServers: ["auction-transaction-mcp", "blackbook-valuation-mcp"],
    requiredDataClassifications: ["auction_transaction_data", "segment_statistics"],
    disableModelInvocation: false,
    contextMode: "rag",
    userInvocable: false,
    descriptionQualityScore: 87,
    knowledgeQueries: ["Segment volume baselines and seasonal adjustment factors", "Rolling 4-week average computation by segment", "Historical feed outage signatures by auction source", "Holiday and tax-refund seasonal volume patterns", "2-sigma volume deviation thresholds by segment"],
    yamlFrontmatter: "name: Volume Anomaly Detection Skill\nversion: \"1.0\"\nagent_code: BB-AGT-001\ndomain: data-quality-integrity\nindustry: automotive\ntrust_tier: MEDIUM\ncontext_mode: rag\nrolling_window_weeks: 4\ndeviation_threshold_sigma: 2",
    markdownBody: "# Volume Anomaly Detection Skill\n\n## Purpose\nMonitors auction transaction volumes by segment to detect data feed disruptions and genuine market events before they silently degrade valuation accuracy.\n\n## Volume Baseline Computation\n- Rolling 4-week daily volume average computed per segment and auction source\n- Seasonal decomposition applied using STL method\n- Expected volume range: mean +/- 2 sigma\n\n## Anomaly Classification\n\n| Pattern | Classification | Action |\n|---|---|---|\n| Volume = 0 from single source | Feed outage (data issue) | Alert data team; flag affected valuations |\n| Volume drops across all sources | Market slowdown | Cross-reference market shift signals |\n| Volume spike >2 sigma | Market event or data duplication | Check for duplicate feed ingestion |\n| Gradual decline over 3+ days | Trend shift | Route to Market Shift Detector |\n\n## Seasonal Adjustment\nLoads segment-specific seasonal patterns from knowledge base. Holiday weeks, tax refund season (Feb-Apr), and end-of-model-year (Aug-Oct) patterns applied before anomaly comparison.",
  },
  {
    organizationId: ORG,
    name: "Data Feed Health Monitoring Skill",
    description: "Tracks auction source feed latency, completeness, and format consistency for Manheim, Adesa, independent auction, and dealer-direct feeds. Detects degradation before it impacts valuations. Monitors last-received timestamp, expected vs actual daily record counts, schema compliance, and duplicate rates per source. Raises alerts within 15 minutes of feed outage detection. Maintains health scores per source that influence the confidence weighting of valuation inputs.",
    industry: "automotive",
    domain: "data-quality-integrity",
    version: "1.0.0",
    author: "Black Book Data Team",
    trustTier: "HIGH",
    dependencies: [],
    tags: ["feed-monitoring", "data-quality", "auction-source", "latency", "BB-AGT-001"],
    status: "active",
    complexity: "moderate",
    allowedTools: ["retrieve_kb", "check_feed_last_received", "count_feed_records", "validate_feed_schema", "compute_duplicate_rate", "update_source_health_score", "trigger_feed_alert", "activate_backup_enrichment"],
    requiredMcpServers: ["auction-transaction-mcp", "feed-monitor-mcp"],
    requiredDataClassifications: ["auction_transaction_data", "feed_metadata"],
    disableModelInvocation: false,
    contextMode: "rag",
    userInvocable: false,
    descriptionQualityScore: 90,
    knowledgeQueries: ["Auction source expected daily volumes by source ID", "Feed schema specifications for Manheim, Adesa, independent", "Acceptable latency thresholds per feed type", "Historical feed outage patterns and recovery times", "Backup data enrichment activation procedures"],
    yamlFrontmatter: "name: Data Feed Health Monitoring Skill\nversion: \"1.0\"\nagent_code: BB-AGT-001\ndomain: data-quality-integrity\nindustry: automotive\ntrust_tier: HIGH\ncontext_mode: rag\noutage_detection_minutes: 15\nsources: [Manheim, Adesa, independent_auction, dealer_direct]",
    markdownBody: "# Data Feed Health Monitoring Skill\n\n## Purpose\nEnsures continuous, high-quality data ingestion from all auction sources by monitoring feed health and triggering recovery procedures before valuation accuracy is compromised.\n\n## Health Metrics Per Source\n| Metric | Target | Alert Threshold |\n|---|---|---|\n| Last received | < 1 hour ago | > 15 minutes without data |\n| Record completeness | > 98% of expected | < 90% |\n| Schema compliance | 100% | < 99.5% |\n| Duplicate rate | < 0.5% | > 2% |\n| Health score | > 0.95 | < 0.80 |\n\n## Feed Sources Monitored\n- Manheim: API (primary), EDI backup; 60K+ daily transactions\n- Adesa: API (primary), FTP backup; 40K+ daily transactions\n- Independent auctions: FTP/EDI; variable volume\n- Dealer direct: REST API; supplemental data\n\n## Alert Escalation\n1. 15-minute gap: immediate alert to data team Slack channel\n2. 30-minute gap: activate backup enrichment protocol\n3. 2-hour gap: flag all affected valuations with reduced confidence; escalate to lead analyst",
  },
  {
    organizationId: ORG,
    name: "Anomaly Evidence Assembly Skill",
    description: "Compiles comprehensive evidence packages for each flagged anomaly. For every anomalous transaction, assembles: the original transaction details, comparable clean transactions, statistical test results with parameters, VIN history summary, source feed health context, and recommended disposition. Formats evidence packages for both analyst review queue and the Resolution Ledger audit trail. Every claim in the evidence package is traceable to a specific source transaction ID or statistical computation.",
    industry: "automotive",
    domain: "data-quality-integrity",
    version: "1.0.0",
    author: "Black Book Data Team",
    trustTier: "HIGH",
    dependencies: [],
    tags: ["evidence-assembly", "audit-trail", "analyst-review", "resolution-ledger", "BB-AGT-001"],
    status: "active",
    complexity: "moderate",
    allowedTools: ["retrieve_kb", "fetch_comparable_transactions", "assemble_statistical_evidence", "fetch_vin_history_summary", "format_analyst_review_package", "log_to_resolution_ledger", "route_to_review_queue"],
    requiredMcpServers: ["auction-transaction-mcp", "blackbook-valuation-mcp", "resolution-ledger-mcp"],
    requiredDataClassifications: ["auction_transaction_data", "anomaly_data", "analyst_review_data"],
    disableModelInvocation: false,
    contextMode: "rag",
    userInvocable: false,
    descriptionQualityScore: 89,
    knowledgeQueries: ["Evidence package format requirements for analyst review", "Resolution Ledger schema and logging requirements", "Comparable transaction selection criteria by anomaly type", "SOC 2 audit trail requirements for data quality decisions"],
    yamlFrontmatter: "name: Anomaly Evidence Assembly Skill\nversion: \"1.0\"\nagent_code: BB-AGT-001\ndomain: data-quality-integrity\nindustry: automotive\ntrust_tier: HIGH\ncontext_mode: rag\nevidence_components: [transaction_details, comparables, statistical_tests, vin_history, feed_context, disposition]",
    markdownBody: "# Anomaly Evidence Assembly Skill\n\n## Purpose\nEnsures every flagged anomaly is accompanied by complete, traceable evidence that enables rapid analyst disposition and satisfies SOC 2 audit trail requirements.\n\n## Evidence Package Components\n\n### Transaction Details\n- Full transaction record: txId, VIN, auction house, date, price, region, seller/buyer type, condition\n- Feed ingestion metadata: source, receive timestamp, processing latency\n\n### Comparable Transactions\n- 5-10 most comparable clean transactions from same segment, region, and 30-day window\n- Each comparable includes txId, price, and condition for direct reference\n\n### Statistical Test Results\n- Z-score value and segment mean/std used\n- IQR bounds and transaction value\n- Mahalanobis distance and threshold\n- Deviation magnitude as percentage from expected range\n\n### VIN History Summary\n- Count of transactions in rolling 30-day window\n- Odometer sequence with rollback flags\n- Auction source sequence\n\n## Resolution Ledger Entry\nAll evidence packages logged to Resolution Ledger with: anomaly ID, type, severity, txIds affected, statistical basis, analyst assigned, disposition, and resolution timestamp.",
  },
];

const BB001_KB = {
  organizationId: ORG,
  name: "Black Book Auction Data Quality Knowledge Base",
  description: "Comprehensive reference for the Auction Data Quality Sentinel Agent covering statistical anomaly detection methodologies, VIN fraud patterns, regional market factors, auction source specifications, historical anomaly case library, and compliance requirements for data quality decisions.",
  industry: "automotive",
  domain: "data-quality-integrity",
  retrievalConfig: { topK: 10, scoreThreshold: 0.65, rerankEnabled: true, citationMode: "full" },
  embeddingConfig: { model: "text-embedding-3-small", chunkSize: 512, chunkOverlap: 64 },
};

const BB001_KB_SOURCES = [
  {
    title: "Black Book Valuation Database Overview",
    content: "Black Book maintains real-time wholesale and retail vehicle valuations for all vehicle segments including Compact Car, Mid-Size SUV, Full-Size Pickup, Luxury, EV, and specialty segments. Valuations are updated daily from 140,000+ auction transactions sourced from Manheim, Adesa, independent auction networks, and dealer-direct channels.\n\nValuation Components:\n- Wholesale Value: Price at which dealers can acquire vehicles at auction\n- Retail Value: Expected consumer purchase price\n- Residual Value: Projected future value for lease/finance calculations\n- Confidence Level: 0.0-1.0 score based on transaction volume and recency\n\nAdjustment Factors Applied:\n- Regional market factors: climate, demand density, transport corridors\n- Condition grade: Excellent, Good, Fair, Poor with specific deductions\n- Mileage adjustment: per-mile value table by segment and age\n- Color adjustment: common vs non-standard color differential\n- Options adjustment: feature-by-feature value add tables\n\nData Quality Requirements:\n- Minimum 10 comparable transactions to publish a valuation\n- Maximum 72-hour staleness before confidence degrades below 0.7\n- Anomaly-free transaction rate: target >98% of ingested volume\n- Regional coverage: all 50 states with metro-level granularity where volume supports",
  },
  {
    title: "Auction Source Feed Specifications",
    content: "Manheim Auction Network:\n- Connection: REST API with OAuth 2.0; webhook notifications for real-time events\n- Volume: approximately 60,000-70,000 daily transactions across 100+ physical and digital lanes\n- Data fields: VIN, sale date/time, final bid price, buy fee, sell fee, run number, lane, condition report grade (Manheim Condition Report 1-5), mileage, auction location code, buyer/seller type\n- Quality SLA: 99.9% uptime; data delivered within 5 minutes of gavel drop\n- Schema version: Manheim Market Report API v3.2\n\nAdesa Auction Network:\n- Connection: REST API with API key; 30-minute polling fallback\n- Volume: approximately 40,000-50,000 daily transactions\n- Data fields: VIN, auction date, hammer price, buyer premium, vehicle condition (ADESA scale 1-6), mileage, region code, seller category\n- Quality SLA: 99.5% uptime; data delivered within 15 minutes\n- Schema version: ADESA Data Exchange v2.1\n\nIndependent Auction Networks:\n- Connection: FTP/SFTP for batch files; EDI 214 for some partners\n- Volume: 20,000-30,000 daily transactions combined\n- File formats: CSV and fixed-width; schema documented per partner\n- Quality considerations: Higher duplicate rate (2-5%); format inconsistency more common\n\nDealer Direct Feeds:\n- Connection: REST API push or pull\n- Volume: 5,000-10,000 daily supplemental transactions\n- Use: supplemental enrichment; not primary valuation driver\n- Quality flag: dealer-direct data weighted 0.5x vs auction data in valuation model",
  },
  {
    title: "Statistical Anomaly Detection Methodology",
    content: "Threshold Derivation:\nAll statistical thresholds are calibrated quarterly using the prior 12 months of labeled data. The target false positive rate of <=10% and recall of >=95% are the primary calibration objectives.\n\nZ-Score Computation:\n- Segment population: all transactions in rolling 4-week window for same make-model group and region\n- Minimum population: 30 transactions required; below 30 uses broader segment population\n- Threshold: |Z| > 3.0 for price outlier flag; |Z| > 2.5 for soft alert requiring additional confirmation\n- Adjustment: separate thresholds maintained for high-volatility segments (EV, luxury) vs stable segments\n\nIQR Bounds:\n- Q1 and Q3 calculated from rolling 4-week population\n- Standard outlier fence: 1.5x IQR from Q1/Q3\n- Extreme outlier fence: 3.0x IQR from Q1/Q3 (used for auto-quarantine threshold)\n- Refreshed daily as new transactions enter the rolling window\n\nMahalanobis Distance:\n- Variables: normalized sale price, mileage percentile for age, condition score, days since last major transaction\n- Covariance matrix updated weekly from clean (non-flagged) transaction population\n- Chi-squared threshold: 99th percentile for 4 degrees of freedom (chi2 = 13.28)\n\nCalibration History:\n- Q1 2025: EV segment thresholds widened due to rapid market shift; false positive rate reduced from 18% to 9%\n- Q3 2024: Pickup segment thresholds tightened after tariff announcement created genuine outliers initially misclassified\n- False positive tracking: maintained by anomaly type, segment, and region for continuous calibration",
  },
  {
    title: "NICB Fraud Indicator Reference",
    content: "National Insurance Crime Bureau (NICB) Fraud Indicators for Auction Transactions:\n\nTitle Washing Patterns:\n- Definition: Moving a salvage or lemon-law vehicle through multiple states to clear the title designation\n- Indicators: Same VIN appearing in 3+ auction transactions within 30 days, especially across state lines\n- State sequences of concern: States with less stringent title branding requirements used as intermediaries\n- VIN cloning: Fraudulent replacement of VIN plate; detected by cross-referencing vehicle description (trim, color, options) against decoded VIN specifications\n\nOdometer Rollback:\n- Definition: Mechanical or electronic alteration of odometer to show lower mileage\n- Detection: Non-monotonic mileage sequence across transaction history; mileage inconsistent with vehicle age and condition\n- Tolerance: +/- 50 miles for measurement variation; flagged when decrease exceeds 200 miles\n- High-risk segments: older domestic vehicles, fleet vehicles, high-mileage commercial vehicles\n\nData Fabrication:\n- Fabricated auction records: transactions created to establish artificial price history\n- Indicators: seller/buyer identity that cannot be verified; auction house codes that do not exist; implausible condition reports\n- Cross-validation: transaction must be verifiable against auction house records\n\nReporting Obligations:\n- Confirmed title fraud: may require reporting to state DMV under state-specific mandatory reporting statutes\n- Insurance fraud: NICB online reporting portal for confirmed fraud patterns\n- Black Book policy: confirmed fraud patterns quarantined and shared with data integrity team within 1 business day",
  },
  {
    title: "Regional Market Factor Database",
    content: "Geographic Price Adjustment Framework:\n\nClimate-Based Adjustments:\n- Rust Belt (OH, MI, PA, NY, WI, MN, ND, SD): Corrosion discount by age: 1-2yr: 0%, 3-5yr: -2%, 6-8yr: -4%, 9+yr: -6% for vehicles without documented undercoating treatment\n- Desert Southwest (AZ, NV, NM, UT): Generally lower corrosion risk; AC system component wear premium +1-2% for SUVs and trucks\n- Pacific Coast (CA, OR, WA): Moderate climate premium +1-3% for most segments; exception for coastal salt exposure areas\n- Southeast (FL, coastal GA, SC): Salt air corrosion discount similar to Rust Belt on older vehicles\n\nDemand Density Factors:\n- Tier 1 Metro (NYC, LA, Chicago, Houston, Phoenix, Philadelphia): Index 1.03-1.06 premium\n- Tier 2 Metro (Dallas, San Jose, Austin, Jacksonville, Columbus): Index 1.01-1.03 premium\n- Suburban: Index 1.00 (baseline)\n- Rural: Index 0.95-0.98 discount (lower liquidity)\n\nTransport Cost Corridors:\n- Northeast to Southeast: $350-500 per unit door-to-door\n- Midwest to Southeast: $250-400 per unit\n- West Coast to Midwest: $700-1000 per unit\n- Cross-country (coast to coast): $900-1400 per unit\n- Transport cost as percentage of value: typically 2-5% for standard segments; higher percentage for lower-value vehicles\n\nApplication Rule: Geographic inconsistency flag suppressed when price difference is fully explained by the combination of climate adjustment + demand density differential + transport corridor cost.",
  },
  {
    title: "Historical Anomaly Case Library and Resolution Outcomes",
    content: "Anomaly Case Studies (Representative Sample):\n\nCase BB-2024-0234: EV Price Collapse (False Alarm)\n- Date: March 2024\n- Segment: Mid-Size EV\n- Pattern: 40% of EV transactions flagged as price outliers over 3-day period\n- Root cause: Genuine market event; rapid EV depreciation driven by Tesla price cut announcement\n- Resolution: Thresholds temporarily widened; market shift confirmed by BB-AGT-002; EV model updated\n- Lesson: Coordinate with Market Shift Detector before mass quarantine of single-segment anomalies\n\nCase BB-2024-0089: Title Washing Ring\n- Date: January 2024\n- Segment: Full-Size Pickup\n- Pattern: 12 VINs transacted 4-6 times each within 30-day windows; seller identities linked\n- Root cause: Confirmed title washing ring using Ohio and Indiana auction channels\n- Resolution: All 12 VINs quarantined; fraud investigation package generated; NICB and state DMV notified\n- Outcome: 89 transactions removed from valuation model; 3 affected weekly valuations reissued\n\nCase BB-2024-0156: Manheim Feed Schema Change (Feed Issue)\n- Date: February 2024\n- Pattern: Manheim condition report field returning null for 4 hours; 8,200 transactions with missing condition\n- Root cause: Manheim API schema update; condition field renamed without notification\n- Resolution: Feed health monitoring detected within 12 minutes; backup enrichment activated; Manheim contacted\n- Lesson: Schema validation must flag null required fields within 15 minutes\n\nFalse Positive Analysis (Q1 2025):\n- Total anomalies flagged: 4,200\n- Confirmed true anomalies: 3,820 (90.9%)\n- False positives: 380 (9.1%) - within 10% target\n- Top FP cause: Regional adjustment not applied before geographic comparison (18% of FPs)\n- Corrective action: Geographic normalization skill invoked before any cross-region comparison",
  },
];

const BB001_RUNBOOKS = [
  {
    organizationId: ORG,
    name: "BB-001-RB-01: Mass Anomaly Spike Response",
    trigger: "Flagged anomalies exceed 2x daily average volume within any 4-hour window",
    steps: [
      "Immediately compute current anomaly rate vs rolling 30-day daily average",
      "Check if spike is segment-specific (likely genuine market event) or cross-segment (likely feed or model issue)",
      "Cross-reference with Market Shift Detector (BB-AGT-002) for concurrent market alert signals",
      "If segment-specific with market signal: switch to high-sensitivity mode; do NOT auto-quarantine; route to analyst review",
      "If cross-segment or no market signal: suspect data feed issue; activate feed health audit immediately",
      "Auto-escalate to lead analyst via Slack alert with spike metrics, affected segments, and current quarantine count",
      "If confirmed market event: adjust anomaly thresholds temporarily (+0.5 sigma) with 24-hour auto-revert",
      "If confirmed data issue: halt ingestion from affected source; activate backup enrichment",
      "Generate hourly status updates to data integrity team until spike resolves",
      "Document resolution in Resolution Ledger with root cause classification"
    ],
    escalationPath: "Data Integrity Analyst → Lead Analyst → VP Analytics (if >10,000 transactions affected or >4 hours unresolved)",
    outputFormat: "Spike analysis report with segment breakdown, root cause determination, threshold adjustments made, and recovery timeline",
    complianceTags: ["SOC2-TypeII", "BB-Data-Integrity-Policy"],
    retryPolicy: { maxRetries: 0, manualEscalation: true },
    timeoutSec: 14400,
    tags: ["mass-anomaly", "escalation", "BB-AGT-001"],
  },
  {
    organizationId: ORG,
    name: "BB-001-RB-02: Auction Feed Outage Recovery",
    trigger: "Any auction data source fails to deliver expected data for 15+ consecutive minutes",
    steps: [
      "Detect missing data: compare last-received timestamp against expected schedule per source",
      "Classify outage: single source vs multi-source; planned maintenance vs unplanned",
      "Immediately flag all valuations dependent on affected source with 'reduced confidence' indicator",
      "Activate backup data enrichment for affected regions: use secondary sources, cached data with staleness warnings",
      "Contact affected auction house technical support with outage ticket (automated if API available)",
      "Monitor feed recovery: check every 5 minutes for data resumption",
      "On recovery: ingest backfill data in chronological order; re-run anomaly detection on backfilled batch",
      "Reconcile transaction counts: confirm all expected transactions received in backfill",
      "Remove 'reduced confidence' flags from valuations after successful backfill and validation",
      "Generate outage report: duration, transactions affected, valuations impacted, recovery actions taken"
    ],
    escalationPath: "Automated alert to data team → Lead Analyst if >2 hours → VP Analytics + Client Services if published valuations are affected",
    outputFormat: "Feed outage report with timeline, affected transaction count, backup enrichment activation log, recovery verification",
    complianceTags: ["SOC2-TypeII", "FCRA-Accuracy", "BB-Data-Integrity-Policy"],
    retryPolicy: { maxRetries: 3, intervalSec: 300 },
    timeoutSec: 7200,
    tags: ["feed-outage", "backup-enrichment", "BB-AGT-001"],
  },
  {
    organizationId: ORG,
    name: "BB-001-RB-03: Confirmed Fraud Pattern Escalation",
    trigger: "VIN Fraud Pattern Recognition Skill returns confidence >= 0.85 for suspected fraud classification",
    steps: [
      "Immediately quarantine all related transactions from the pricing model pipeline",
      "Freeze all VINs in the fraud pattern from further auction ingestion pending investigation",
      "Generate full fraud investigation package: VIN history chain, transaction sequence, auction sources, seller/buyer identities, statistical basis",
      "Notify Black Book data integrity team via priority Slack alert with package summary",
      "Check mandatory reporting obligations: evaluate state DMV reporting requirements for title fraud; evaluate NICB reporting threshold",
      "If NICB reporting threshold met: submit fraud report to NICB portal (automated with human review of submission)",
      "Log all quarantine actions in Resolution Ledger with transaction IDs, fraud classification, and confidence score",
      "Monitor for related transactions: check if linked entities (same seller, same auction lane, same buyer) have other suspicious patterns",
      "Initiate 30-day monitoring period for all VINs associated with the fraud ring",
      "Generate weekly status report on quarantined VINs until investigation is complete and closed"
    ],
    escalationPath: "Data Integrity Analyst → Legal/Compliance (if regulatory reporting required) → VP Analytics",
    outputFormat: "Fraud investigation package with full VIN history, transaction chain, confidence scores, and regulatory reporting checklist",
    complianceTags: ["SOC2-TypeII", "State-Title-Fraud-Statutes", "NICB-Reporting", "BB-Data-Integrity-Policy"],
    retryPolicy: { maxRetries: 0, manualEscalation: true },
    timeoutSec: 3600,
    tags: ["fraud-escalation", "quarantine", "BB-AGT-001"],
  },
  {
    organizationId: ORG,
    name: "BB-001-RB-04: False Positive Spike Recalibration",
    trigger: "Analyst dismissal rate for flagged anomalies exceeds 30% over any 5-day rolling window",
    steps: [
      "Pull all analyst-dismissed anomalies from the past 5 days from Resolution Ledger",
      "Classify dismissed anomalies by type: price outlier, geographic inconsistency, volume anomaly, fraud false positive",
      "Identify the most common root cause of dismissals: threshold too tight, missing normalization, seasonal pattern, genuine market shift",
      "For each root cause: calculate optimal threshold adjustment that would have prevented the false positive",
      "Draft recalibration proposal: specific threshold changes with projected impact on recall and false positive rate",
      "Submit recalibration proposal to lead analyst for review and approval (Confirm Before required)",
      "On approval: implement threshold adjustments; document changes in Statistical Methodology documentation",
      "Run backtesting: apply new thresholds to last 30 days of data and compare outcomes",
      "Monitor false positive rate for 7 days post-recalibration to confirm improvement",
      "Update calibration history in knowledge base with recalibration date, changes made, and outcome"
    ],
    escalationPath: "Lead Analyst (approval required) → VP Analytics (if major methodology change proposed)",
    outputFormat: "Recalibration analysis report with dismissed anomaly breakdown, proposed threshold changes, backtesting results, and approval request",
    complianceTags: ["SOC2-TypeII", "FCRA-Accuracy"],
    retryPolicy: { maxRetries: 0, manualEscalation: true },
    timeoutSec: 86400,
    tags: ["recalibration", "false-positive", "BB-AGT-001"],
  },
  {
    organizationId: ORG,
    name: "BB-001-RB-05: Quarantine Review Backlog Management",
    trigger: "Quarantined transactions pending analyst review exceed 500 items",
    steps: [
      "Compute current quarantine backlog count by anomaly type and severity",
      "Prioritize backlog: transactions that affect published valuations ranked first; high-confidence fraud ranked second; price outliers ranked third",
      "Generate prioritized review queue for each active analyst with estimated review time",
      "Flag any quarantined transaction that has been pending >48 hours as SLA breach",
      "Escalate SLA breaches to lead analyst with count, affected valuations, and analyst assignment",
      "For backlog >1000: auto-request additional analyst capacity from lead analyst",
      "Apply batch dismissal for anomalies where analyst-confirmed-similar-pattern exists in last 7 days (with analyst pre-approval)",
      "Generate daily backlog dashboard: count by type, age distribution, SLA compliance rate, estimated clearance time",
      "Re-evaluate auto-quarantine thresholds: if backlog growing consistently, consider raising threshold to reduce quarantine rate"
    ],
    escalationPath: "Lead Analyst → VP Analytics (if SLA breach count >100 or >1000 total backlog)",
    outputFormat: "Backlog management report with prioritized queue, SLA breach count, batch dismissal candidates, and capacity recommendation",
    complianceTags: ["SOC2-TypeII", "BB-Data-Integrity-Policy"],
    retryPolicy: { maxRetries: 0, manualEscalation: true },
    timeoutSec: 43200,
    tags: ["backlog-management", "SLA", "BB-AGT-001"],
  },
  {
    organizationId: ORG,
    name: "BB-001-RB-06: Model Drift Detection and Recalibration",
    trigger: "KL divergence of anomaly distribution from 30-day baseline exceeds 0.1",
    steps: [
      "Compute KL divergence between current 7-day anomaly type distribution and 30-day rolling baseline",
      "Identify which anomaly types are over- or under-represented relative to baseline",
      "Cross-reference with market conditions: check if drift correlates with known market events (tariffs, recalls, fuel prices)",
      "If drift correlated with market event: document as expected drift; adjust baseline window to exclude event period",
      "If drift not correlated with market event: suspect model drift or data quality change; initiate full parameter review",
      "Review all statistical parameters: segment means, standard deviations, IQR bounds, Mahalanobis covariance matrices",
      "Recalibrate all parameters using clean data from the past 90 days",
      "Submit recalibration for lead analyst approval before deployment",
      "After approval and deployment: monitor KL divergence daily for 14 days to confirm drift resolved",
      "Update statistical methodology documentation with new parameter values and calibration date"
    ],
    escalationPath: "Lead Analyst (parameter review required) → VP Analytics (if systematic drift suggests fundamental model issue)",
    outputFormat: "Drift analysis report with KL divergence values by anomaly type, root cause determination, parameter update proposal, and impact assessment",
    complianceTags: ["SOC2-TypeII", "FCRA-Accuracy", "BB-Data-Integrity-Policy"],
    retryPolicy: { maxRetries: 0, manualEscalation: true },
    timeoutSec: 86400,
    tags: ["model-drift", "recalibration", "BB-AGT-001"],
  },
];

const BB001_POLICIES = [
  {
    organizationId: ORG,
    name: "BB-P1 Valuation Integrity — No Direct Valuation Modification",
    description: "No agent may directly modify a published Black Book valuation. Agents flag anomalies, quarantine transactions, and recommend adjustments only. All valuation changes require explicit analyst approval. This policy applies to all BB-AGT-001 outputs and must be enforced at every output step.",
    domain: "data_handling",
    status: "active",
    policyType: "safety",
    policyJson: {
      enforcement: "block",
      rule: "Agent output must never include a direct valuation update command or API call to modify published valuation records. Agent may only produce: anomaly flags, quarantine commands (for fraud), analyst review recommendations, and statistical evidence packages.",
      allowedOutputTypes: ["anomaly_flag", "quarantine_command", "analyst_review_recommendation", "evidence_package", "daily_report"],
      blockedOutputTypes: ["valuation_update", "valuation_publish", "valuation_delete"],
      requiresAnalystApproval: ["quarantine_release", "threshold_adjustment", "parameter_recalibration"],
    },
    scopeType: "agent",
    agentCode: "BB-AGT-001",
    complianceTags: ["BB-P1", "FCRA", "SOC2-TypeII"],
  },
  {
    organizationId: ORG,
    name: "FCRA Data Accuracy Requirements for Valuation Data",
    description: "Vehicle valuation data used in lending decisions must meet Fair Credit Reporting Act accuracy standards. The Auction Data Quality Sentinel must maintain documented anomaly detection processes and audit trails to support FCRA compliance. Valuation data flagged as anomalous must not be used in lending-relevant outputs until cleared by analyst review.",
    domain: "compliance",
    status: "active",
    policyType: "compliance",
    policyJson: {
      enforcement: "block",
      rule: "Quarantined or unresolved anomalous transactions must not contribute to valuations that will be used in FCRA-regulated lending decisions. Evidence packages for all anomaly dispositions must be retained for minimum 7 years.",
      retentionRequirementYears: 7,
      lendingUsageBlock: true,
      auditTrailRequired: true,
    },
    scopeType: "agent",
    agentCode: "BB-AGT-001",
    complianceTags: ["FCRA", "SOC2-TypeII"],
  },
  {
    organizationId: ORG,
    name: "SOC 2 Type II Audit Trail — Data Quality Decisions",
    description: "All data quality decisions made by BB-AGT-001 must be logged in the Resolution Ledger with sufficient detail to reconstruct the decision for SOC 2 Type II audit purposes. Log entries must include: decision timestamp, agent version, transaction IDs, statistical test inputs and outputs, anomaly classification, and analyst disposition where applicable.",
    domain: "audit",
    status: "active",
    policyType: "audit",
    policyJson: {
      enforcement: "block",
      rule: "Every anomaly flag, quarantine action, and resolution must produce a complete Resolution Ledger entry before the action is considered complete. Incomplete audit entries cause the action to be treated as pending and flagged for manual review.",
      requiredLogFields: ["decision_timestamp", "agent_version", "transaction_ids", "test_inputs", "test_outputs", "anomaly_classification", "severity", "recommended_action", "analyst_disposition"],
      storageRetentionYears: 7,
      accessRestriction: "data_integrity_team_only",
    },
    scopeType: "agent",
    agentCode: "BB-AGT-001",
    complianceTags: ["SOC2-TypeII"],
  },
  {
    organizationId: ORG,
    name: "Auction Data Licensing — Aggregation-Only Output",
    description: "Raw auction transaction data received from Manheim, Adesa, and other licensed sources must not be redistributed in raw form. All outputs must be aggregated, normalized, or transformed. This applies to anomaly evidence packages which may contain individual transaction details: these packages are for internal Black Book use only and must never be shared externally without legal review.",
    domain: "data_handling",
    status: "active",
    policyType: "data_governance",
    policyJson: {
      enforcement: "warn",
      rule: "Agent outputs containing individual transaction records (txId, specific auction prices) are classified as Internal Confidential. These outputs must only be routed to internal analyst review queues and the Resolution Ledger. External distribution requires explicit legal approval.",
      classificationRequired: "internal_confidential",
      allowedRecipients: ["internal_analyst_queue", "resolution_ledger", "data_integrity_team"],
      externalDistributionApproval: "legal_required",
    },
    scopeType: "agent",
    agentCode: "BB-AGT-001",
    complianceTags: ["Auction-Data-Licensing", "SOC2-TypeII"],
  },
  {
    organizationId: ORG,
    name: "State Title Fraud Mandatory Reporting",
    description: "Confirmed title fraud patterns detected by BB-AGT-001 may trigger mandatory reporting obligations to state DMVs and NICB under applicable state statutes. The agent must flag all confirmed fraud for compliance review before any external reporting occurs. Legal review is required before submission of any regulatory report.",
    domain: "compliance",
    status: "active",
    policyType: "compliance",
    policyJson: {
      enforcement: "require_approval",
      rule: "Any fraud investigation package classified as 'confirmed fraud' must be routed through compliance review before external reporting. Automated NICB submission requires human review of the submission content. DMV reporting requires legal team sign-off.",
      approvalRequired: ["nicb_submission", "dmv_reporting"],
      approvers: ["compliance_team", "legal_team"],
      reportingDeadlineDays: 1,
    },
    scopeType: "agent",
    agentCode: "BB-AGT-001",
    complianceTags: ["State-Title-Fraud-Statutes", "NICB-Reporting"],
  },
];

const BB001_AGENT = {
  organizationId: ORG,
  name: "Auction Data Quality Sentinel",
  description: "Continuously monitors 140,000+ daily auction transactions from Manheim, Adesa, independent auctions, and dealer-direct feeds for statistical anomalies, data quality issues, and suspected fraud patterns. Applies Z-score, IQR, Mahalanobis, and DBSCAN statistical tests at the individual VIN level. Detects price outliers (>3 sigma), geographic pricing inconsistencies, suspicious VIN patterns (title-washing, odometer fraud), and volume anomalies. Auto-quarantines confirmed fraud (Full Autonomy); routes all other anomalies to analyst review with full evidence packages. First line of defense for Black Book valuation accuracy.",
  department: "Data Quality & Integrity",
  agentCode: "BB-AGT-001",
  autonomyMode: "autonomous",
  riskTier: "HIGH",
  industry: "automotive",
  status: "active",
  healthScore: 95,
  requiresHumanApproval: false,
  taskInstructions: "You are the Auction Data Quality Sentinel for Black Book vehicle valuations. Your primary mission is protecting the integrity of the Black Book valuation model by detecting and quarantining bad data before it corrupts pricing.\n\nFor each auction transaction batch:\n1. Ingest the transaction feed and decode each VIN\n2. Enrich with current Black Book valuation and segment statistics\n3. Apply statistical anomaly detection (Z-score, IQR, Mahalanobis, DBSCAN)\n4. Apply geographic normalization before any cross-region comparison\n5. Check VIN fraud patterns: title-washing, odometer rollback\n6. Check volume anomalies by segment and source\n7. For confirmed fraud (confidence >= 0.85): IMMEDIATELY quarantine all related transactions\n8. For price/geographic outliers: generate evidence package and route to analyst review queue\n9. Log ALL decisions in the Resolution Ledger with full statistical basis\n10. Generate daily data quality report\n\nCritical rules:\n- NEVER directly modify a published valuation (BB-P1 policy)\n- Always apply geographic normalization BEFORE flagging cross-region inconsistencies\n- Quarantine fraud immediately without waiting for analyst review\n- Every action must produce a Resolution Ledger entry before the next action",
  toolsConfig: {
    allowedTools: [
      "retrieve_kb", "ingest_auction_feed", "decode_vin", "enrich_vehicle_history",
      "fetch_blackbook_valuation", "compute_z_score", "compute_iqr_bounds", "compute_mahalanobis",
      "run_dbscan_clustering", "query_segment_statistics", "check_odometer_sequence",
      "match_nicb_patterns", "compute_fraud_confidence_score", "quarantine_transaction",
      "lookup_regional_adjustment_factor", "apply_climate_discount", "apply_demand_density_factor",
      "query_segment_daily_volume", "compute_rolling_volume_average", "check_feed_last_received",
      "validate_feed_schema", "update_source_health_score", "trigger_feed_alert",
      "fetch_comparable_transactions", "assemble_statistical_evidence", "fetch_vin_history_summary",
      "format_analyst_review_package", "log_to_resolution_ledger", "route_to_review_queue",
      "generate_daily_quality_report",
    ],
    mcpServers: [
      "blackbook-valuation-mcp", "auction-transaction-mcp", "vin-history-mcp",
      "regional-market-mcp", "feed-monitor-mcp", "resolution-ledger-mcp",
    ],
  },
  complianceTags: ["FCRA", "GLB", "SOC2-TypeII", "State-Title-Fraud-Statutes", "BB-P1", "NICB-Reporting", "Auction-Data-Licensing"],
  maxToolIterations: 20,
  outputSchema: {
    type: "structured_report",
    fields: ["transactions_processed", "anomalies_flagged", "quarantined_count", "analyst_review_count", "daily_quality_report", "resolution_ledger_entries"],
  },
};

const BB001_GOLDEN_DATASET = {
  organizationId: ORG,
  name: "BB-AGT-001 Auction Data Quality Sentinel Evaluation Dataset",
  description: "Labeled evaluation dataset for the Auction Data Quality Sentinel including confirmed fraud patterns, genuine market anomalies, data feed issues, and clean transactions. Covers all detection categories with benchmarks for recall >=95%, false positive rate <=10%, and processing latency <500ms.",
  industry: "automotive",
  domain: "data-quality-integrity",
  version: "1.0",
  useCase: "Auction Data Quality & Fraud Detection",
  agentCode: "BB-AGT-001",
  tags: ["auction-data", "anomaly-detection", "fraud-detection", "BB-AGT-001"],
};

const BB001_TEST_CASES = [
  {
    name: "Price Outlier Detection — 4.2 Sigma Deviation",
    description: "A 2021 F-150 XLT sells for $18,200 when segment mean is $31,400 with std $3,100. Z-score = -4.26. Agent should flag as price outlier and route to analyst review with full evidence package.",
    input: { txId: "MHM-2025-99871", vin: "1FTFW1ET3MFC12345", auctionHouse: "Manheim", salePrice: 18200, region: "Midwest", segmentMean: 31400, segmentStd: 3100, mileage: 67000, condition: "Good" },
    expectedOutput: { anomalyType: "priceOutlier", severity: "HIGH", zScore: -4.26, action: "analyst_review", evidencePackageGenerated: true, resolutionLedgerLogged: true },
    metrics: { detectionAccuracy: "anomaly_type_correct", evidenceComplete: "all_required_fields_present", auditTrailComplete: "resolution_ledger_entry_present" },
    tags: ["price-outlier", "Z-score", "BB-AGT-001"],
  },
  {
    name: "Title Washing Detection — 4 Transactions in 25 Days",
    description: "VIN appears in 4 auction transactions within 25 days across Manheim Ohio, Adesa Indiana, Manheim Tennessee, and a dealer-direct feed. Mileage is inconsistent. Agent should classify as suspected fraud and auto-quarantine all 4 transactions.",
    input: { vin: "1HGCR2F3XFA102938", transactions: [{ date: "2025-01-02", source: "Manheim-OH", price: 14200, mileage: 72000 }, { date: "2025-01-11", source: "Adesa-IN", price: 13800, mileage: 71400 }, { date: "2025-01-19", source: "Manheim-TN", price: 15100, mileage: 69800 }, { date: "2025-01-27", source: "dealer-direct", price: 16400, mileage: 68100 }] },
    expectedOutput: { anomalyType: "suspectedFraud", subType: "titleWashing", confidence: 0.91, action: "auto_quarantine", quarantinedTxCount: 4, fraudPackageGenerated: true },
    metrics: { fraudDetected: "classification_is_suspected_fraud", quarantineExecuted: "all_4_transactions_quarantined", confidenceThresholdMet: "confidence_gte_0.85" },
    tags: ["title-washing", "fraud-detection", "auto-quarantine", "BB-AGT-001"],
  },
  {
    name: "Geographic Inconsistency — After Normalization Remains Flagged",
    description: "Same trim 2022 Camry SE sells for $19,800 in rural Georgia and $27,500 in Manhattan. After applying demand density (Metro +5%) and transport cost ($600), normalized difference remains 32%. Should be flagged as geographic inconsistency.",
    input: { vin1: "4T1B11HK0JU588721", salePrice1: 19800, region1: "rural_GA", vin2: "4T1B11HK0JU588743", salePrice2: 27500, region2: "NYC_metro", segment: "compact_car", condition: "Good", transportCost: 600, demandDensityAdjustment: 0.05 },
    expectedOutput: { anomalyType: "geoInconsistency", normalizedDifferencePercent: 32, geographicFlag: true, action: "analyst_review", normalizationApplied: true },
    metrics: { normalizationApplied: "adjustment_factors_used_before_comparison", flagCorrect: "normalized_difference_above_25pct_threshold", analystRouted: "evidence_package_sent_to_queue" },
    tags: ["geographic-inconsistency", "normalization", "BB-AGT-001"],
  },
  {
    name: "Volume Anomaly — Feed Outage vs Market Slowdown Distinction",
    description: "Full-Size Pickup segment volume drops from 2,800 daily transactions to 12 over 2 hours. Single source (Manheim) shows zero; other sources normal. Agent should classify as data feed issue, not market slowdown, and activate backup enrichment.",
    input: { segment: "full_size_pickup", dailyBaseline: 2800, currentVolume: 12, affectedSource: "Manheim", otherSourcesNormal: true, marketShiftSignal: false, timeWindowHours: 2 },
    expectedOutput: { anomalyType: "volumeAnomaly", classification: "feedIssue", affectedSource: "Manheim", action: "activate_backup_enrichment", feedAlertTriggered: true, valuationConfidenceReduced: true },
    metrics: { correctClassification: "classified_as_feed_issue_not_market_slowdown", backupActivated: "backup_enrichment_activated", alertTriggered: "feed_alert_sent_within_15_min" },
    tags: ["volume-anomaly", "feed-outage", "backup-enrichment", "BB-AGT-001"],
  },
  {
    name: "False Alarm — Genuine Market Shift Correctly Cleared",
    description: "EV Mid-Size segment shows 35% of transactions as price outliers following Tesla price cut announcement. Market Shift Detector (BB-AGT-002) has concurrent AMBER alert for EV segment. Agent should NOT quarantine; should route to analyst with market context.",
    input: { segment: "mid_size_ev", outlierRate: 0.35, marketShiftDetectorAlert: { severity: "AMBER", cause: "Tesla price cut announcement", affectedSegments: ["mid_size_ev", "compact_ev"] }, transactionCount: 840 },
    expectedOutput: { action: "analyst_review_with_market_context", quarantineCount: 0, marketContextAttached: true, thresholdAdjustmentProposed: true },
    metrics: { noSpuriousQuarantine: "quarantine_count_is_zero", marketContextIncluded: "market_shift_alert_referenced_in_evidence", correctDisposition: "routed_to_analyst_not_auto_quarantined" },
    tags: ["false-alarm", "market-shift", "EV-segment", "BB-AGT-001"],
  },
  {
    name: "Daily Data Quality Report Generation",
    description: "After processing a full day's 142,000 transactions, agent should generate complete daily report with all required metrics.",
    input: { date: "2025-04-01", transactionsIngested: 142000, anomaliesFlagged: 412, quarantined: 23, analystReviewQueue: 389, feedOutages: 1, feedOutageDuration: 22 },
    expectedOutput: { reportGenerated: true, metricsPresent: ["transactions_processed", "anomaly_rate", "quarantine_rate", "false_positive_rate_7d", "feed_health_scores", "analyst_queue_depth", "resolution_rate"], complianceStatus: "SOC2_audit_trail_complete" },
    metrics: { reportComplete: "all_required_metrics_present", auditTrail: "resolution_ledger_entries_match_flagged_count", timeliness: "report_generated_within_30_min_of_day_end" },
    tags: ["daily-report", "metrics", "BB-AGT-001"],
  },
];

const BB001_EVAL = {
  organizationId: ORG,
  name: "BB-AGT-001 Auction Data Quality Sentinel Evaluation Suite",
  type: "accuracy",
  thresholdConfig: {
    anomalyDetectionRecall: 0.95,
    falsePositiveRate: 0.10,
    fraudDetectionConfidence: 0.85,
    processingLatencyMs: 500,
    auditTrailCompleteness: 1.0,
    overallPassRate: 0.90,
  },
  scorerConfig: {
    primary: "anomaly_classification_accuracy",
    secondary: "audit_trail_completeness_check",
    rubric: "rubricScoring",
    fraudQuarantineCheck: true,
    normalizationValidation: true,
    evidencePackageCompleteness: true,
  },
  coverageTags: ["price-outlier", "title-washing", "odometer-fraud", "volume-anomaly", "feed-health", "geographic-inconsistency", "false-alarm-handling", "daily-reporting"],
  schedule: "weekly:Tuesday:06:00 UTC",
  industry: "automotive",
};

const BB001_OUTCOME = {
  outcome: {
    organizationId: ORG,
    name: "Auction Data Quality Sentinel — Outcome Contract",
    description: "Business objectives and KPIs governing BB-AGT-001. Targets anomaly detection recall >=95%, false positive rate <=10%, <500ms processing latency per transaction, 100% audit trail completeness, and >98% clean transaction throughput to the Black Book valuation model.",
    version: 1,
    status: "active",
    riskTier: "HIGH",
    pricingModel: "PER_OUTCOME_EVENT",
    pricePerUnit: 0,
    approvalGates: ["lead_analyst_review", "data_integrity_sign_off"],
    riskThreshold: 0.95,
    maxDriftPercent: 5,
    slaConfig: {
      processingLatencyMs: 500,
      feedOutageDetectionMin: 15,
      quarantineResponseSec: 60,
      dailyReportDeliveryHour: 22,
    },
  },
  kpis: [
    { name: "Anomaly Detection Recall", target: 95, unit: "%", measurement: "Percentage of true anomalies correctly identified vs labeled ground truth dataset", baseline: 88, slaThreshold: 90, weight: 1.5 },
    { name: "False Positive Rate", target: 10, unit: "%", measurement: "Percentage of flagged transactions dismissed by analysts as false positives, rolling 30-day", baseline: 18, slaThreshold: 15, weight: 1.5 },
    { name: "Processing Latency per Transaction", target: 500, unit: "ms", measurement: "End-to-end processing time from transaction ingest to anomaly decision, p95", baseline: 800, slaThreshold: 600, weight: 1.0 },
    { name: "Feed Outage Detection Time", target: 15, unit: "minutes", measurement: "Time from feed interruption to alert generation", baseline: 45, slaThreshold: 20, weight: 1.0 },
    { name: "Audit Trail Completeness", target: 100, unit: "%", measurement: "Percentage of anomaly decisions with complete Resolution Ledger entries", baseline: 91, slaThreshold: 98, weight: 1.2 },
    { name: "Quarantine Release Accuracy", target: 98, unit: "%", measurement: "Percentage of quarantined transactions where analyst disposition agrees with agent recommendation", baseline: 85, slaThreshold: 95, weight: 1.0 },
  ],
};

// ══════════════════════════════════════════════════════════════════════════════
//  BB-AGT-002 — MARKET SHIFT DETECTOR
// ══════════════════════════════════════════════════════════════════════════════

const BB002_SKILLS = [
  {
    organizationId: ORG,
    name: "Change-Point Detection Skill",
    description: "Applies CUSUM (Cumulative Sum Control Chart) and PELT (Pruned Exact Linear Time) algorithms to time-series valuation data to identify statistically significant trend breaks in vehicle segment depreciation and appreciation rates. Computes rolling 3-week, 6-week, and 12-week moving averages for each metric. Calculates lead time estimate: how many weeks before the shift would appear in standard weekly Black Book reports based on detection date vs historical reporting lag.",
    industry: "automotive",
    domain: "market-intelligence",
    version: "1.0.0",
    author: "Black Book Analytics Team",
    trustTier: "HIGH",
    dependencies: [],
    tags: ["change-point-detection", "CUSUM", "PELT", "time-series", "trend-detection", "BB-AGT-002"],
    status: "active",
    complexity: "complex",
    allowedTools: ["retrieve_kb", "fetch_segment_time_series", "compute_moving_averages", "apply_cusum", "apply_pelt", "estimate_lead_time", "classify_trend_break", "generate_market_alert"],
    requiredMcpServers: ["blackbook-valuation-mcp", "market-data-mcp"],
    requiredDataClassifications: ["valuation_time_series", "market_segment_data"],
    disableModelInvocation: false,
    contextMode: "rag",
    userInvocable: false,
    descriptionQualityScore: 93,
    knowledgeQueries: ["CUSUM parameter calibration for vehicle valuation data", "PELT algorithm minimum segment length for weekly valuation data", "Historical market shift onset dates and detection lag analysis", "Rolling average window selection criteria by segment volatility", "Lead time estimation methodology vs Black Book weekly report publication"],
    yamlFrontmatter: "name: Change-Point Detection Skill\nversion: \"1.0\"\nagent_code: BB-AGT-002\ndomain: market-intelligence\nindustry: automotive\ntrust_tier: HIGH\ncontext_mode: rag\nalgorithms: [CUSUM, PELT]\nmoving_avg_windows: [3w, 6w, 12w]\nlead_time_target_weeks: 2",
    markdownBody: "# Change-Point Detection Skill\n\n## Purpose\nDetects when vehicle segment depreciation or appreciation trends have fundamentally shifted — 2-4 weeks before the change appears in standard Black Book weekly reports.\n\n## Algorithm Details\n\n### CUSUM (Cumulative Sum)\n- Monitors cumulative deviation from expected trend\n- Two-sided CUSUM for detecting both acceleration and deceleration\n- Decision interval h calibrated per segment volatility: stable segments h=5, volatile segments (EV, luxury) h=3\n- Reference value k set at 0.5 sigma of segment standard deviation\n\n### PELT (Pruned Exact Linear Time)\n- Identifies optimal change-point locations minimizing a penalized cost function\n- Penalty: log(n) * sigma^2 (BIC-like)\n- Minimum segment length: 5 trading days to avoid spurious break detection\n- Applied after 3-week moving average smoothing to reduce noise\n\n## Moving Average Framework\n- 3-week MA: early signal detection (high sensitivity)\n- 6-week MA: confirmation signal (medium sensitivity)\n- 12-week MA: trend establishment confirmation (low sensitivity)\n- Alert requires: CUSUM signal + PELT breakpoint within 3-week MA window\n\n## Lead Time Calculation\nCompares detection date against historical reporting lag database. If a 2023 event type was first reported 3 weeks after onset, current detection is credited with 3-week lead time.",
  },
  {
    organizationId: ORG,
    name: "Signal Fusion Skill",
    description: "Combines structured market data (auction prices, retail listings, days-on-lot, inventory levels) with unstructured intelligence (OEM announcements, recall news, tariff changes, fuel prices, FRED economic indicators) using a weighted evidence scoring model to produce composite market shift assessments. Assigns directional impact, magnitude estimate, and confidence level to each signal source. Resolves conflicting signals by increasing confidence threshold before alerting.",
    industry: "automotive",
    domain: "market-intelligence",
    version: "1.0.0",
    author: "Black Book Analytics Team",
    trustTier: "HIGH",
    dependencies: [],
    tags: ["signal-fusion", "evidence-scoring", "structured-unstructured", "market-intelligence", "BB-AGT-002"],
    status: "active",
    complexity: "complex",
    allowedTools: ["retrieve_kb", "fetch_structured_market_signals", "ingest_unstructured_signals", "classify_signal_impact", "compute_evidence_weights", "fuse_signals", "compute_composite_confidence", "resolve_conflicting_signals"],
    requiredMcpServers: ["blackbook-valuation-mcp", "market-data-mcp", "news-feed-mcp", "economic-data-mcp"],
    requiredDataClassifications: ["valuation_time_series", "market_segment_data", "external_signal_data"],
    disableModelInvocation: false,
    contextMode: "rag",
    userInvocable: false,
    descriptionQualityScore: 92,
    knowledgeQueries: ["Signal weighting model by source type and historical accuracy", "OEM incentive announcement impact coefficients by segment", "Recall announcement valuation impact by recall severity and affected count", "Tariff impact modeling for affected vehicle categories", "Conflicting signal resolution protocols"],
    yamlFrontmatter: "name: Signal Fusion Skill\nversion: \"1.0\"\nagent_code: BB-AGT-002\ndomain: market-intelligence\nindustry: automotive\ntrust_tier: HIGH\ncontext_mode: rag\nsignal_types: [auction_prices, retail_listings, days_on_lot, OEM_announcements, NHTSA_recalls, trade_policy, fuel_prices, FRED_indicators]\nconflict_resolution: increase_confidence_threshold",
    markdownBody: "# Signal Fusion Skill\n\n## Purpose\nProvides a unified, confidence-weighted market assessment by combining structured auction data with unstructured external intelligence.\n\n## Signal Source Weights (Base Values)\n| Signal Type | Base Weight | Historical Accuracy |\n|---|---|---|\n| Auction price trend | 1.00 | Primary signal |\n| Retail listing price | 0.80 | Strong leading indicator |\n| Days on lot | 0.75 | Demand proxy |\n| OEM incentive change | 0.90 | Direct price driver |\n| NHTSA recall | 0.70 | Segment-specific impact |\n| Tariff/trade policy | 0.85 | Structural price shift |\n| Fuel price change | 0.60 | Segment-differential impact |\n| FRED economic indicators | 0.55 | Macro context |\n\n## Fusion Process\n1. Normalize each signal to directional score (-1.0 to +1.0)\n2. Apply source weight and recency decay\n3. Compute weighted sum across all active signals\n4. If weighted sum >= 0.6: AMBER alert; if >= 0.8: RED alert\n5. If structured and unstructured signals conflict (opposite direction): increase threshold to 0.75/0.90\n\n## Confidence Score Computation\nConfidence = (signal_agreement_rate * 0.6) + (source_count_factor * 0.2) + (historical_accuracy_factor * 0.2)",
  },
  {
    organizationId: ORG,
    name: "OEM Incentive Parser Skill",
    description: "Monitors manufacturer incentive bulletins and press releases for cash rebates, APR reductions, lease subsidies, and employee pricing programs. Classifies each incentive by affected vehicle segments, directional price impact (negative for residual values), magnitude estimate, duration, and effective date. Compares against historical incentive programs to calibrate magnitude. Flags unexpected major incentive changes for immediate segment impact assessment bypassing the daily cycle.",
    industry: "automotive",
    domain: "market-intelligence",
    version: "1.0.0",
    author: "Black Book Analytics Team",
    trustTier: "MEDIUM",
    dependencies: [],
    tags: ["OEM-incentives", "incentive-parsing", "manufacturer-programs", "BB-AGT-002"],
    status: "active",
    complexity: "moderate",
    allowedTools: ["retrieve_kb", "monitor_oem_newsfeeds", "parse_incentive_announcement", "classify_incentive_type", "estimate_incentive_impact", "compare_historical_incentives", "flag_unexpected_incentive"],
    requiredMcpServers: ["news-feed-mcp", "market-data-mcp"],
    requiredDataClassifications: ["external_signal_data", "market_segment_data"],
    disableModelInvocation: false,
    contextMode: "rag",
    userInvocable: false,
    descriptionQualityScore: 88,
    knowledgeQueries: ["OEM incentive history by manufacturer and segment", "Incentive type impact coefficients: cash rebate vs APR vs lease subsidy", "Historical incentive announcement to market impact timing", "Major OEM incentive change thresholds for immediate assessment bypass"],
    yamlFrontmatter: "name: OEM Incentive Parser Skill\nversion: \"1.0\"\nagent_code: BB-AGT-002\ndomain: market-intelligence\nindustry: automotive\ntrust_tier: MEDIUM\ncontext_mode: rag\noem_sources: [GM, Ford, Stellantis, Toyota, Honda, Hyundai-Kia, BMW, Mercedes, Tesla]\nincentive_types: [cash_rebate, APR_reduction, lease_subsidy, employee_pricing]",
    markdownBody: "# OEM Incentive Parser Skill\n\n## Purpose\nProvides early detection of manufacturer incentive program changes that are primary drivers of wholesale valuation movements.\n\n## Incentive Impact Framework\n\n### Cash Rebates\n- Direct wholesale impact: typically 40-60% of consumer-facing rebate amount flows to wholesale\n- Residual value impact: immediate; magnitude proportional to rebate size and expected duration\n- Example: $3,000 cash rebate → estimated $1,400-1,800 wholesale value reduction\n\n### APR Reductions\n- Indirect wholesale impact via improved consumer demand\n- Impact timeline: 2-4 weeks to appear in transaction data\n- Higher impact for segments with high finance penetration (trucks, full-size SUVs)\n\n### Lease Subsidies\n- Residual value impact: enhanced residual reduces lease payment; may temporarily inflate segment residuals\n- Monitor for subsequent flood of off-lease returns when program ends\n\n## Unexpected Incentive Detection\nAny incentive change classified as 'major' (>$1,500 effective consumer value) triggers immediate bypass of daily cycle and runs segment impact assessment within 30 minutes of detection.",
  },
  {
    organizationId: ORG,
    name: "Economic Signal Integration Skill",
    description: "Ingests FRED (Federal Reserve Economic Data) API data including consumer confidence index, auto loan rates, unemployment rate, and GDP growth. Correlates each economic series with historical vehicle segment valuation movements using documented lag relationships. Consumer confidence leads auction volume by 4-6 weeks; auto loan rates affect transaction volume within 2-3 weeks. Provides macroeconomic context for interpreting other market signals.",
    industry: "automotive",
    domain: "market-intelligence",
    version: "1.0.0",
    author: "Black Book Analytics Team",
    trustTier: "MEDIUM",
    dependencies: [],
    tags: ["economic-signals", "FRED-API", "consumer-confidence", "auto-loan-rates", "BB-AGT-002"],
    status: "active",
    complexity: "moderate",
    allowedTools: ["retrieve_kb", "fetch_fred_series", "compute_lag_correlation", "normalize_economic_indicator", "classify_economic_direction", "apply_lag_adjustment"],
    requiredMcpServers: ["economic-data-mcp", "market-data-mcp"],
    requiredDataClassifications: ["external_signal_data", "economic_data"],
    disableModelInvocation: false,
    contextMode: "rag",
    userInvocable: false,
    descriptionQualityScore: 87,
    knowledgeQueries: ["FRED series codes and refresh schedules for automotive indicators", "Consumer confidence to auction volume lag coefficients by segment", "Auto loan rate to transaction volume impact by rate range", "Historical correlation matrix: economic indicators vs segment valuations", "FRED API outage fallback procedures and cached data freshness standards"],
    yamlFrontmatter: "name: Economic Signal Integration Skill\nversion: \"1.0\"\nagent_code: BB-AGT-002\ndomain: market-intelligence\nindustry: automotive\ntrust_tier: MEDIUM\ncontext_mode: rag\nfred_series: [UMCSENT, TERMCBCCALLNS, UNRATE, GDP]\nlag_weeks: {consumer_confidence: 5, auto_loan_rate: 2, unemployment: 4}",
    markdownBody: "# Economic Signal Integration Skill\n\n## FRED Data Series\n| Series | Code | Refresh | Lag to Auction Volume |\n|---|---|---|---|\n| Consumer Sentiment | UMCSENT | Monthly | 4-6 weeks |\n| Auto Loan Rate | TERMCBCCALLNS | Quarterly | 2-3 weeks |\n| Unemployment Rate | UNRATE | Monthly | 4-6 weeks |\n| Real GDP Growth | GDP | Quarterly | 6-12 weeks |\n\n## Correlation Coefficients (Historical)\n- Consumer Sentiment vs auction volume: r = 0.62 (lag = 5 weeks)\n- Auto loan rate vs transaction volume: r = -0.71 (lag = 2 weeks)\n- Unemployment vs entry-level segment demand: r = -0.58 (lag = 4 weeks)\n\n## Fallback on API Outage\nWhen FRED API unavailable: use last cached values with staleness flag. If cache >30 days old, exclude economic signals from fusion model and note in alert narrative.",
  },
  {
    organizationId: ORG,
    name: "Fuel Price Impact Modeler Skill",
    description: "Calculates differential impact of fuel price changes on vehicle segment valuations using historical price elasticity coefficients. Fuel price increases negatively impact large trucks and full-size SUVs (high elasticity: -0.18 per $0.10/gallon increase) while accelerating EV and hybrid demand (positive elasticity). Applies differential impact model across all segments to adjust expected valuations and inform signal fusion weighting.",
    industry: "automotive",
    domain: "market-intelligence",
    version: "1.0.0",
    author: "Black Book Analytics Team",
    trustTier: "MEDIUM",
    dependencies: [],
    tags: ["fuel-price", "price-elasticity", "EV-impact", "segment-impact", "BB-AGT-002"],
    status: "active",
    complexity: "moderate",
    allowedTools: ["retrieve_kb", "fetch_fuel_price_data", "apply_elasticity_coefficients", "compute_segment_impact", "generate_fuel_adjusted_forecast"],
    requiredMcpServers: ["economic-data-mcp", "market-data-mcp"],
    requiredDataClassifications: ["external_signal_data", "market_segment_data"],
    disableModelInvocation: false,
    contextMode: "rag",
    userInvocable: false,
    descriptionQualityScore: 86,
    knowledgeQueries: ["Fuel price elasticity coefficients by vehicle segment", "EIA fuel price data sources and refresh schedules", "Historical fuel price to segment valuation impact timing", "Threshold for meaningful fuel price change (trigger for impact assessment)", "EV segment response to fuel price changes: magnitude and timing"],
    yamlFrontmatter: "name: Fuel Price Impact Modeler Skill\nversion: \"1.0\"\nagent_code: BB-AGT-002\ndomain: market-intelligence\nindustry: automotive\ntrust_tier: MEDIUM\ncontext_mode: rag\ndata_source: EIA\nelasticity_high: [full_size_truck, full_size_SUV]\nelasticity_negative: [BEV, PHEV, HEV]",
    markdownBody: "# Fuel Price Impact Modeler Skill\n\n## Elasticity Coefficients (per $0.10/gallon change)\n| Segment | Elasticity | Direction | Lag Weeks |\n|---|---|---|---|\n| Full-Size Pickup | -0.18 | Negative per increase | 3-4 |\n| Full-Size SUV | -0.15 | Negative per increase | 3-4 |\n| Mid-Size SUV | -0.08 | Negative per increase | 4-5 |\n| Compact Car | -0.04 | Slight negative per increase | 5-6 |\n| HEV/PHEV | +0.06 | Positive per increase | 3-4 |\n| BEV | +0.12 | Positive per increase | 2-3 |\n| Luxury | -0.05 | Low sensitivity | 6-8 |\n\n## Trigger Threshold\nFuel price change >$0.15/gallon over 2-week period triggers segment impact assessment cycle.",
  },
  {
    organizationId: ORG,
    name: "Lead Time Estimation Skill",
    description: "Calculates how many weeks ahead of standard Black Book weekly report publication a detected market shift would surface. Uses historical database of confirmed market shifts: their actual onset dates, Black Book detection dates (in standard process), and first appearance in published weekly reports. Compares current detection date against this historical lag database to produce lead time estimate with confidence interval.",
    industry: "automotive",
    domain: "market-intelligence",
    version: "1.0.0",
    author: "Black Book Analytics Team",
    trustTier: "MEDIUM",
    dependencies: [],
    tags: ["lead-time", "early-detection", "competitive-advantage", "BB-AGT-002"],
    status: "active",
    complexity: "moderate",
    allowedTools: ["retrieve_kb", "lookup_historical_shift_timing", "compute_current_detection_date", "estimate_standard_detection_lag", "compute_lead_time", "generate_lead_time_report"],
    requiredMcpServers: ["blackbook-valuation-mcp", "market-data-mcp"],
    requiredDataClassifications: ["valuation_time_series", "market_segment_data"],
    disableModelInvocation: false,
    contextMode: "rag",
    userInvocable: false,
    descriptionQualityScore: 85,
    knowledgeQueries: ["Historical market shift timing database: onset vs BB weekly report appearance", "Standard weekly report publication lag by shift type", "Lead time target: minimum 2 weeks", "Historical lead time accuracy: actual vs predicted by alert type"],
    yamlFrontmatter: "name: Lead Time Estimation Skill\nversion: \"1.0\"\nagent_code: BB-AGT-002\ndomain: market-intelligence\nindustry: automotive\ntrust_tier: MEDIUM\ncontext_mode: rag\nlead_time_target_weeks: 2\nhistorical_shifts_database: BB_Wholesale_Insights_Archive_5yr",
    markdownBody: "# Lead Time Estimation Skill\n\n## Historical Lag Database\nFed from 5+ years of Black Book Wholesale Insights archives. For each documented market shift:\n- Actual shift onset date (retrospectively identified)\n- Date shift appeared in published weekly report\n- Median standard detection lag: 2.8 weeks\n- Range: 1-6 weeks depending on shift type and magnitude\n\n## Lead Time Computation\nLead time = (Estimated standard detection date) - (Current detection date)\nEstimated standard detection date = current onset date + median lag for this shift type\n\n## Lead Time Confidence Levels\n- High confidence: Lead time backed by >=5 comparable historical events, lead time >=3 weeks\n- Medium confidence: Lead time backed by 2-4 comparable events, lead time 1-3 weeks\n- Low confidence: Novel shift type or lead time <1 week",
  },
];

const BB002_KB = {
  organizationId: ORG,
  name: "Black Book Market Intelligence Knowledge Base",
  description: "Comprehensive reference for the Market Shift Detector Agent covering historical valuation time series, OEM incentive history, FRED economic data integration, NHTSA recall impacts, seasonal adjustment models, and the Black Book Wholesale Insights archive for lead time validation.",
  industry: "automotive",
  domain: "market-intelligence",
  retrievalConfig: { topK: 10, scoreThreshold: 0.65, rerankEnabled: true, citationMode: "full" },
  embeddingConfig: { model: "text-embedding-3-small", chunkSize: 512, chunkOverlap: 64 },
};

const BB002_KB_SOURCES = [
  {
    title: "Black Book Historical Valuation Time Series",
    content: "Black Book maintains 10+ years of daily wholesale and retail vehicle valuations organized by segment, region, and condition. This database is the primary input for change-point detection and market shift analysis.\n\nData Structure:\n- Segment level: Compact Car, Mid-Size Car, Full-Size Car, Compact SUV, Mid-Size SUV, Full-Size SUV, Full-Size Pickup, Luxury Car, Luxury SUV, Electric Vehicle (BEV), Plug-In Hybrid (PHEV), Hybrid (HEV), Minivan, Commercial Van\n- Time granularity: Daily observations; weekly published reports; monthly summaries\n- Value types: Average wholesale (auction basis), retail price, residual value projection, confidence level\n- Regional breakdown: National, 8 BLS regions, state-level where volume supports\n\nKey Metrics Tracked:\n- Average wholesale price by segment: daily closing value based on transaction-weighted average\n- Transaction volume: number of auction sales contributing to daily valuation\n- Days on lot: average retail lot days for segment (leading demand indicator)\n- Bid-to-sale ratio: auction bids received per vehicle sold (demand pressure indicator)\n- Retail listing price: average asking price on dealer lots\n\nArchival Notes:\n- 2008-2012 financial crisis data: significant structural breaks; treated as separate baseline for extreme event modeling\n- 2020-2021 COVID data: supply shock period; isolated for pandemic scenario modeling only\n- 2022-2023 normalization: post-COVID depreciation acceleration; fully incorporated into current baselines",
  },
  {
    title: "OEM Incentive History Database",
    content: "Historical database of manufacturer incentive programs covering 2015 to present. Used for calibrating OEM Incentive Parser Skill impact coefficients and comparing current announcements against historical precedent.\n\nDatabase Fields per Incentive Program:\n- Manufacturer, model(s), regions, effective dates, expiration dates\n- Incentive type: cash rebate, APR subsidy, lease support (residual enhancement + money factor), employee pricing, conquest incentive\n- Consumer-facing value ($), estimated wholesale impact ($), segment(s) affected\n- Observed auction price response: timing (weeks to impact), magnitude (%)\n- Competitive response: did competitors match or increase their own incentives?\n\nHighly Impactful Historical Programs:\n- 2019 Ram Truck incentive escalation: $6,000+ consumer incentives on 1500; wholesale dropped $2,800 over 6 weeks\n- 2022 GM employee pricing program: accelerated pre-shortage-era inventory liquidation; 8% wholesale decline in 4 weeks\n- 2023 Tesla price cuts: EV segment-wide cascade; 15-20% wholesale decline over 6 months\n- 2024 Toyota incentive pullback: inventory discipline strategy; wholesale held stable vs competitors losing 3-5%\n\nCalibration Rule: When a new incentive is announced, compare to the 5 most similar historical programs (same manufacturer, same type, similar value range) and use median historical impact as base estimate with +/- 30% confidence interval.",
  },
  {
    title: "FRED Economic Data Integration Guide",
    content: "Federal Reserve Economic Data (FRED) Integration for Black Book Market Intelligence:\n\nPrimary Series Used:\n- UMCSENT (University of Michigan Consumer Sentiment): monthly; release date = last Friday of month\n- TERMCBCCALLNS (Commercial Bank Consumer Lending Rate for Auto): quarterly\n- UNRATE (Unemployment Rate): monthly; release = 1st Friday of following month\n- GDP (Real Gross Domestic Product): quarterly; advance estimate = 4 weeks after quarter end\n- DCOILWTICO (WTI Crude Oil Price): daily via EIA; used for fuel price modeling\n- MORTGAGE30US (30-year Fixed Mortgage Rate): weekly; proxy for consumer credit conditions\n\nHistorical Correlations (Automotive-Specific):\n- Consumer Sentiment to new vehicle sales: r = 0.71, lag = 4-6 weeks\n- Consumer Sentiment to used vehicle auction volume: r = 0.54, lag = 5-7 weeks\n- Auto loan rate to used vehicle transaction count: r = -0.67, lag = 2-4 weeks\n- Unemployment rate to entry-level segment wholesale: r = -0.61, lag = 4-8 weeks\n\nAPI Access:\n- Base URL: https://fred.stlouisfed.org/graph/fredgraph.csv\n- Authentication: FRED API key (stored in secrets manager)\n- Rate limit: 120 requests per minute\n- Fallback: cached CSV files updated via scheduled job; maximum acceptable staleness = 30 days",
  },
  {
    title: "NHTSA Recall Database and Valuation Impact",
    content: "National Highway Traffic Safety Administration (NHTSA) Recall Data Integration:\n\nData Source: NHTSA Recalls API (api.nhtsa.gov/recalls/recallsByVehicle)\n- Fields: campaignNumber, reportDate, component, summary, affectedManufacturer, modelYearStart, modelYearEnd, potentialUnits\n- Refresh: Real-time API; Black Book polls every 4 hours for new announcements\n\nHistorical Recall Valuation Impact Analysis:\n- Takata airbag recall (2015-2019): -3 to -8% wholesale for affected Toyota, Honda, BMW models; persisted 12+ months\n- GM ignition switch recall (2014): -5% initial drop for affected models; recovered partially over 18 months after settlements\n- Ford F-150 tailgate latch recall (2017): minimal impact (<1%); component recall with available fix\n- Stellantis multiple safety recalls (2022-2024): cumulative -4% for Chrysler minivan segment\n\nImpact Classification by Recall Type:\n| Recall Type | Impact Estimate | Duration |\n|---|---|---|\n| Safety-critical (airbag, steering) | -3 to -10% | 6-18 months |\n| Powertrain | -2 to -6% | 3-9 months |\n| Non-safety component | -0.5 to -2% | 1-3 months |\n| Software/OTA-fixable | Minimal to 0% | 1-4 weeks |\n\nSegment Sensitivity: Luxury segment shows higher recall sensitivity (-50% more impact) due to brand reputation component.",
  },
  {
    title: "Seasonal Adjustment Models for Vehicle Valuations",
    content: "Seasonal patterns in vehicle valuations are predictable and must be applied before change-point detection to avoid false positives.\n\nDocumented Seasonal Patterns:\n\nTax Refund Season (February - April):\n- Entry-level segment wholesale lift: +3 to +7% above trend\n- Compact car and small crossover outperform by 4-6%\n- Average tax refund: $2,800; significant portion flows to vehicle purchases\n\nEnd of Model Year (August - October):\n- Current model year inventory liquidation: -4 to -8% wholesale\n- New model year vehicles arrive; prior year discounted\n- Pickup trucks: most pronounced effect (-6 to -10%) due to large dealer inventory positions\n\nHoliday Season (November - December):\n- Retail transaction volume increases; auction volume decreases\n- Wholesale softness: -1 to -3% as dealers focus on retail rather than auction purchasing\n- Luxury and SUV segments perform relatively better\n\nSpring Convertible/Truck Season (March - May):\n- Convertible and sports car segment lift: +4 to +8%\n- Pickup truck demand uptick: +2 to +4%\n\nApplication: All seasonal adjustments applied using STL (Seasonal and Trend decomposition using Loess) decomposition before feeding adjusted series to change-point detection algorithms.",
  },
  {
    title: "Black Book Wholesale Insights Archive — Lead Time Validation Database",
    content: "52 weeks per year of published Black Book Wholesale Insights and Residual Values Insights reports spanning 5+ years. Used as ground truth for lead time validation.\n\nArchive Structure:\n- Publication date, report week ending, all segment wholesale values, notable events, analyst commentary\n- Each published segment value represents the first official public disclosure of that valuation level\n\nLead Time Validation Methodology:\n1. For each confirmed market shift event: identify actual onset date from transaction data (retrospective)\n2. Find first weekly report where the shift appeared at full magnitude\n3. Calculate standard detection lag = (first report date) - (onset date)\n4. Compare BB-AGT-002 detection date against onset date to compute lead time claimed\n5. Validate: lead time claimed should equal standard lag minus (detection date - onset date)\n\nHistorical Performance Summary (30 validated events):\n- Average lead time achieved: 2.4 weeks\n- Minimum lead time: 0.5 weeks (rapid onset events)\n- Maximum lead time: 5.2 weeks (gradual structural shifts)\n- Events where lead time >= 2 weeks target: 22/30 (73%)\n- False alarm rate (AMBER alerts that did not materialize): 4/20 (20%) - target <= 15%\n\nImprovement Area: EV segment lead time is lower (1.6 weeks average) due to higher volatility; EV-specific CUSUM parameter tuning in progress.",
  },
];

const BB002_RUNBOOKS = [
  {
    organizationId: ORG,
    name: "BB-002-RB-01: Conflicting Signal Resolution",
    trigger: "Structured market data (auction prices) and unstructured signals (OEM announcements, news) show opposing directional signals for the same segment",
    steps: [
      "Identify the specific signals in conflict: document each signal's direction, magnitude, and source reliability score",
      "Check if the conflict is temporal: structured data may lag behind unstructured signals by 1-3 weeks",
      "Apply confidence score adjustment: when conflicting, raise AMBER alert threshold from 0.6 to 0.75; raise RED threshold from 0.8 to 0.90",
      "Fetch additional corroborating signals: retail listing prices, days-on-lot, dealer inventory levels for the contested segment",
      "If additional signals break the tie: proceed with majority-direction assessment at adjusted threshold",
      "If signals remain split after additional data: generate 'Conflicting Evidence' alert (not AMBER or RED) routed directly to senior analyst",
      "Document all conflicting signals with source attribution in the alert narrative (BB-P2 requirement)",
      "Archive conflict details for signal weighting model recalibration review"
    ],
    escalationPath: "Auto+Notify to lead analyst for Conflicting Evidence classification → Senior Analyst for unresolved conflicts lasting >3 days",
    outputFormat: "Conflicting signal report with evidence matrix showing each signal, direction, weight, and resolution decision",
    complianceTags: ["BB-P2-Source-Attribution", "SOC2-TypeII"],
    retryPolicy: { maxRetries: 0, manualEscalation: false },
    timeoutSec: 43200,
    tags: ["conflicting-signals", "evidence-resolution", "BB-AGT-002"],
  },
  {
    organizationId: ORG,
    name: "BB-002-RB-02: Black Swan Event Response",
    trigger: "Detection of unprecedented event type (pandemic, major natural disaster, sudden policy shock) not in historical event library",
    steps: [
      "Classify event as Black Swan: no comparable historical event exists in the 10-year database",
      "Immediately disable normal change-point thresholds for all affected segments",
      "Switch to high-sensitivity monitoring mode: reduce CUSUM decision interval h by 50%; generate alerts at 0.4 composite score",
      "Shift to hourly segment reporting instead of daily cycle",
      "Convene emergency analyst team session with event briefing and initial market impact assessment",
      "Establish a new event-specific baseline using only post-event data (do not mix pre-event data in rolling averages)",
      "Document Black Swan characteristics: scope, onset speed, affected segments, directional signals observed",
      "Add event to historical library for future calibration after impact fully materializes",
      "Resume normal thresholds only after analyst team confirms market has stabilized (new baseline established)"
    ],
    escalationPath: "Immediate VP Analytics notification → C-Suite briefing if customer-facing impacts expected → Client Services team for customer communication",
    outputFormat: "Black Swan event brief: classification, affected segments, initial impact estimate, monitoring mode activated, hourly update cadence",
    complianceTags: ["BB-P2-Source-Attribution", "SOC2-TypeII"],
    retryPolicy: { maxRetries: 0, manualEscalation: true },
    timeoutSec: 3600,
    tags: ["black-swan", "emergency-response", "BB-AGT-002"],
  },
  {
    organizationId: ORG,
    name: "BB-002-RB-03: FRED API Outage Fallback",
    trigger: "FRED API returns error or times out for >15 consecutive minutes",
    steps: [
      "Verify outage: attempt 3 retry calls at 5-minute intervals before declaring outage",
      "Check FRED status page for planned maintenance notification",
      "Activate cached economic data: load most recent successful FRED data pull",
      "Assess cache staleness: if cached data <7 days old, proceed with staleness warning flag; if >30 days old, exclude economic signals from fusion entirely",
      "Apply staleness warning to all market alerts generated during outage period",
      "Exclude FRED-dependent signal types (consumer sentiment, auto loan rates) from signal fusion confidence calculation",
      "Monitor FRED API restoration: check every 10 minutes",
      "On restoration: fetch latest data; check if any economic series changed significantly during outage period",
      "If significant change detected during outage: re-run fusion for all alerts generated during outage period",
      "Log outage duration, cache staleness used, and alerts affected in audit trail"
    ],
    escalationPath: "Auto-notify data team (monitoring) → Lead Analyst if outage >4 hours with active market shift assessment pending",
    outputFormat: "FRED outage log: duration, cache staleness, signals excluded, alerts affected, restoration confirmation",
    complianceTags: ["SOC2-TypeII", "BB-P2-Source-Attribution"],
    retryPolicy: { maxRetries: 3, intervalSec: 300 },
    timeoutSec: 86400,
    tags: ["FRED-outage", "economic-data", "fallback", "BB-AGT-002"],
  },
  {
    organizationId: ORG,
    name: "BB-002-RB-04: OEM Incentive Surprise — Immediate Assessment",
    trigger: "OEM incentive change classified as 'major' (>$1,500 effective consumer value change) detected in OEM communications",
    steps: [
      "Immediately classify incentive: type, effective consumer value, affected segments, expected duration",
      "Bypass daily analysis cycle: begin immediate segment impact assessment",
      "Load historical comparable incentive programs from knowledge base: find 5 most similar programs",
      "Compute impact estimate: magnitude and timing based on historical comparables",
      "Check competitor incentive calendar: are competitors likely to respond? Historical response rate by competitor",
      "Generate immediate market impact assessment: affected segments, direction, magnitude estimate, confidence level",
      "Route as RED alert to Confirm Before if magnitude estimate >5% wholesale impact; AMBER if 2-5%; monitor if <2%",
      "Notify Narrative Insight Generator (BB-AGT-004) to include in next weekly report",
      "Monitor auction transaction prices in affected segments for confirmation over next 7 days",
      "Archive incentive details and actual observed market response for historical database update"
    ],
    escalationPath: "Auto+Notify for AMBER → Confirm Before required for RED → VP Analytics if major OEM (top 5 by volume) with >5% impact estimate",
    outputFormat: "Incentive impact assessment: incentive details, comparable history, segment impact estimate, competitive response probability, alert classification",
    complianceTags: ["BB-P2-Source-Attribution", "SOC2-TypeII", "Market-Manipulation-Prevention"],
    retryPolicy: { maxRetries: 0, manualEscalation: false },
    timeoutSec: 1800,
    tags: ["OEM-incentive", "immediate-assessment", "BB-AGT-002"],
  },
  {
    organizationId: ORG,
    name: "BB-002-RB-05: Seasonal Adjustment Drift Response",
    trigger: "Detected shift shows correlation coefficient >0.80 with seasonal pattern in historical database",
    steps: [
      "Identify seasonal pattern match: which segment, which seasonal event (tax refund, model year, holiday)",
      "Apply seasonal decomposition (STL method) to the time series before re-evaluating the alert",
      "Compute deseasonalized trend: does the shift persist after seasonal component removed?",
      "If shift disappears after deseasonalization: reclassify as seasonal pattern, not market shift; cancel or downgrade alert",
      "If shift persists after deseasonalization: confirm as genuine market shift above seasonal baseline; maintain alert",
      "Document seasonal adjustment applied in alert narrative with STL decomposition parameters",
      "For persisting shifts: include seasonal adjustment context in Narrative Insight Generator handoff"
    ],
    escalationPath: "Auto-resolve (seasonal reclassification) or standard alert routing (shift confirmed)",
    outputFormat: "Seasonal adjustment report: correlation with seasonal pattern, STL decomposition output, revised alert classification",
    complianceTags: ["BB-P2-Source-Attribution"],
    retryPolicy: { maxRetries: 1, intervalSec: 3600 },
    timeoutSec: 7200,
    tags: ["seasonal-adjustment", "false-positive-prevention", "BB-AGT-002"],
  },
  {
    organizationId: ORG,
    name: "BB-002-RB-06: Alert Fatigue Management",
    trigger: "Analysts are not acting on >50% of AMBER alerts over any 10-day rolling window",
    steps: [
      "Pull analyst action rate on AMBER alerts for the past 30 days from Resolution Ledger",
      "Classify unacted alerts: which segments, which signal types, which time periods",
      "Identify patterns in ignored alerts: are all from same segment, time of day, or signal type?",
      "Compute optimal threshold adjustment: find threshold that would have eliminated >80% of unacted alerts while retaining >90% of acted alerts",
      "Review signal weighting: are any signal types consistently producing alerts analysts dismiss?",
      "Draft recalibration proposal: threshold changes and signal weight adjustments with projected impact",
      "Submit proposal for lead analyst review and approval",
      "After approval: implement changes; monitor action rate for 14 days post-change",
      "Report outcome: did action rate improve to >60%? Were any genuine shifts missed?"
    ],
    escalationPath: "Lead Analyst (approval required for threshold changes) → VP Analytics if structural signal weighting change proposed",
    outputFormat: "Alert fatigue analysis: action rate by alert type, segment, signal source; recalibration proposal; approval request",
    complianceTags: ["SOC2-TypeII"],
    retryPolicy: { maxRetries: 0, manualEscalation: true },
    timeoutSec: 86400,
    tags: ["alert-fatigue", "recalibration", "BB-AGT-002"],
  },
];

const BB002_POLICIES = [
  {
    organizationId: ORG,
    name: "Market Manipulation Prevention Policy",
    description: "BB-AGT-002 outputs must never be used to front-run or manipulate vehicle pricing markets. Early market intelligence is handled as confidential market-sensitive information subject to Hearst information barrier policies. Distribution restricted to internal Black Book teams and authorized clients.",
    domain: "compliance",
    status: "active",
    policyType: "compliance",
    policyJson: {
      enforcement: "block",
      rule: "Market shift alerts may only be distributed to: (1) internal Black Book analytics and editorial teams, (2) authorized subscriber clients through standard distribution channels after analyst review. Alerts must never be shared with trading desks, hedge funds, or any party that could use the information to front-run wholesale vehicle markets.",
      allowedRecipients: ["blackbook_internal", "authorized_subscribers", "narrative_generator_agent"],
      blockedRecipients: ["trading_desks", "unauthenticated_external"],
      insiderInformationHandling: "hearst_information_barrier_policies",
    },
    scopeType: "agent",
    agentCode: "BB-AGT-002",
    complianceTags: ["Market-Manipulation-Prevention", "Hearst-Information-Barriers"],
  },
  {
    organizationId: ORG,
    name: "BB-P2 Source Attribution — Every Alert Must Cite Sources",
    description: "Every market shift alert generated by BB-AGT-002 must cite the specific data points supporting the claim. Required citations: auction transaction counts with date range, economic data series codes and values, OEM announcement source and date, any external signal referenced. Alerts without complete source attribution must be blocked from distribution.",
    domain: "audit",
    status: "active",
    policyType: "audit",
    policyJson: {
      enforcement: "block",
      rule: "No market shift alert may be routed for distribution unless it contains: (1) at least one structured data citation with transaction count and date range, (2) confidence score >= 0.60 for AMBER or >= 0.80 for RED, (3) all external signals cited with source, date, and reference URL or document ID. Incomplete alerts are held in draft state.",
      requiredCitationFields: ["data_source", "date_range", "transaction_count_or_record_id", "confidence_score"],
      minimumConfidenceAmber: 0.60,
      minimumConfidenceRed: 0.80,
    },
    scopeType: "agent",
    agentCode: "BB-AGT-002",
    complianceTags: ["BB-P2", "SOC2-TypeII"],
  },
  {
    organizationId: ORG,
    name: "Competitive Data Handling — Divergence Analysis Only",
    description: "Competitor pricing data accessed by BB-AGT-002 for comparison and divergence analysis purposes must never be reproduced or redistributed. Outputs must show only the divergence metric and Black Book's own values, not competitor values in absolute terms.",
    domain: "data_handling",
    status: "active",
    policyType: "data_governance",
    policyJson: {
      enforcement: "block",
      rule: "Any output containing competitor valuation data must: (1) use only divergence metrics (percentage difference, direction), never absolute competitor values, (2) not include competitor data in any customer-facing output, (3) restrict to internal competitive analysis use only.",
      allowedOutputFormat: ["divergence_percentage", "directional_indicator", "bb_own_value"],
      blockedOutputFormat: ["competitor_absolute_value", "competitor_value_in_customer_output"],
    },
    scopeType: "agent",
    agentCode: "BB-AGT-002",
    complianceTags: ["BB-P3", "Competitive-Data-Licensing", "Antitrust"],
  },
  {
    organizationId: ORG,
    name: "Data Licensing Compliance — External Data Sources",
    description: "External data sources used by BB-AGT-002 (FRED, NHTSA, OEM newsfeeds, EIA) must be accessed within their respective license terms. FRED data may be used for internal analysis but requires attribution in published outputs. NHTSA data is public domain. OEM data must not be reproduced verbatim.",
    domain: "data_handling",
    status: "active",
    policyType: "data_governance",
    policyJson: {
      enforcement: "warn",
      rule: "All external data sources must be accessed via approved API connections or licensed feeds. Source attribution required in all outputs per BB-P2. FRED data: cite source as 'Federal Reserve Bank of St. Louis, FRED' in all published outputs. NHTSA: cite as 'NHTSA Recall Database'. OEM announcements: paraphrase only; no verbatim reproduction.",
      dataSourceAttributionRequired: true,
      licenseReviewPeriodDays: 365,
    },
    scopeType: "agent",
    agentCode: "BB-AGT-002",
    complianceTags: ["Data-Licensing", "BB-P2"],
  },
];

const BB002_AGENT = {
  organizationId: ORG,
  name: "Market Shift Detector",
  description: "Analyzes daily valuation movements across all vehicle segments to detect accelerating depreciation or appreciation trends 2-4 weeks before they surface in standard weekly reports. Fuses structured data (auction prices, retail listings, days-on-lot, inventory) with unstructured signals (OEM incentives, NHTSA recalls, tariffs, fuel prices, FRED economic indicators) using change-point detection (CUSUM/PELT) and weighted evidence scoring. Routes AMBER alerts (emerging trends) to Auto+Notify and RED alerts (confirmed shifts) to Confirm Before workflow for Narrative Insight Generator inclusion.",
  department: "Market Intelligence",
  agentCode: "BB-AGT-002",
  autonomyMode: "assisted",
  riskTier: "MEDIUM",
  industry: "automotive",
  status: "active",
  healthScore: 95,
  requiresHumanApproval: false,
  taskInstructions: "You are the Market Shift Detector for Black Book vehicle valuations. Your mission is to detect where the market is going before competitors see it — providing 2-4 weeks of early market intelligence.\n\nDaily cycle:\n1. Compute segment-level metrics: avg wholesale, volume, days-on-lot, bid-to-sale ratio\n2. Calculate rolling 3w, 6w, 12w moving averages for each metric and segment\n3. Apply CUSUM and PELT change-point detection to identify trend breaks\n4. Apply seasonal decomposition before flagging any seasonal correlations\n5. Ingest unstructured signals: OEM newsfeeds, NHTSA, EIA fuel prices, FRED economic data\n6. Classify each signal: affected segments, directional impact, magnitude, confidence\n7. Fuse structured and unstructured signals using weighted evidence model\n8. Calculate lead time estimate vs standard weekly report detection\n9. Route: AMBER (composite score 0.6-0.8) → Auto+Notify to analyst; RED (>0.8) → Confirm Before\n10. Feed confirmed shifts to BB-AGT-004 Narrative Insight Generator\n\nCritical rules:\n- NEVER use market intelligence to front-run pricing markets\n- ALWAYS cite specific data sources for every claim (BB-P2)\n- Apply seasonal decomposition before triggering alerts on seasonal patterns\n- When signals conflict, raise confidence threshold rather than picking a side",
  toolsConfig: {
    allowedTools: [
      "retrieve_kb", "fetch_segment_time_series", "compute_moving_averages", "apply_cusum", "apply_pelt",
      "estimate_lead_time", "classify_trend_break", "fetch_structured_market_signals",
      "ingest_unstructured_signals", "classify_signal_impact", "compute_evidence_weights",
      "fuse_signals", "compute_composite_confidence", "resolve_conflicting_signals",
      "monitor_oem_newsfeeds", "parse_incentive_announcement", "estimate_incentive_impact",
      "fetch_fred_series", "compute_lag_correlation", "fetch_fuel_price_data",
      "apply_elasticity_coefficients", "generate_market_alert", "route_amber_alert", "route_red_alert",
      "notify_narrative_generator", "archive_alert_with_validation_data",
    ],
    mcpServers: [
      "blackbook-valuation-mcp", "market-data-mcp", "news-feed-mcp",
      "economic-data-mcp", "nhtsa-mcp",
    ],
  },
  complianceTags: ["Market-Manipulation-Prevention", "BB-P2", "BB-P3", "SOC2-TypeII", "Data-Licensing", "Hearst-Information-Barriers"],
  maxToolIterations: 18,
  outputSchema: {
    type: "market_alert",
    fields: ["alert_id", "segments_affected", "alert_type", "severity", "signal_sources", "confidence_score", "lead_time_weeks", "narrative", "detected_date"],
  },
};

const BB002_GOLDEN_DATASET = {
  organizationId: ORG,
  name: "BB-AGT-002 Market Shift Detector Evaluation Dataset",
  description: "Labeled evaluation dataset with 30 known market shift events, 20 false alarm scenarios, and 50 signal fusion cases. Ground truth from Black Book analyst team assessments and Wholesale Insights archive validation.",
  industry: "automotive",
  domain: "market-intelligence",
  version: "1.0",
  useCase: "Market Shift Detection & Intelligence",
  agentCode: "BB-AGT-002",
  tags: ["market-shift", "change-point-detection", "signal-fusion", "BB-AGT-002"],
};

const BB002_TEST_CASES = [
  {
    name: "EV Depreciation Shift Detection — 3-Week Lead Time",
    description: "EV segment wholesale prices begin declining: 6 consecutive daily drops averaging -0.8% per day. CUSUM signals trigger on day 5. Tesla incentive announcement (not yet in auction data). Agent should generate AMBER alert with 3-week lead time estimate.",
    input: { segment: "battery_electric_vehicle", priceSeriesDailyChangePct: [-0.7, -0.9, -0.8, -0.8, -1.1, -0.6], cusumSignal: true, peltBreakpointDay: 4, teslaIncentiveSignal: { type: "cash_rebate", value: 2000, announcement: "Tesla Q2 Incentive Program" }, fredData: { consumerSentiment: 72.1, trend: "declining" } },
    expectedOutput: { alertSeverity: "AMBER", alertType: "depreciation", segment: "battery_electric_vehicle", leadTimeWeeks: 3, confidenceScore: 0.68, citationsIncluded: true },
    metrics: { alertGenerated: "AMBER_alert_produced", leadTimeAchieved: "lead_time_gte_2_weeks", citationsPresent: "all_signals_cited" },
    tags: ["EV-depreciation", "lead-time", "AMBER-alert", "BB-AGT-002"],
  },
  {
    name: "Full-Size Pickup RED Alert — Tariff-Driven Appreciation",
    description: "After tariff announcement on imported steel, full-size pickup demand spikes. Structured data shows +4.2% 3-week trend. Trade policy signal classified as HIGH impact. Signal fusion score = 0.87 (RED threshold). Agent should generate RED alert requiring Confirm Before.",
    input: { segment: "full_size_pickup", threeWeekTrendPct: 4.2, structuredScore: 0.82, tariffSignal: { direction: "appreciation", magnitude: "HIGH", affectedSegments: ["full_size_pickup"], confidence: 0.91 }, signalFusionScore: 0.87 },
    expectedOutput: { alertSeverity: "RED", alertType: "appreciation", segment: "full_size_pickup", workflowRouting: "confirm_before", analystApprovalRequired: true, confidenceScore: 0.87 },
    metrics: { correctClassification: "RED_alert_generated", workflowCorrect: "routed_to_confirm_before", thresholdMet: "confidence_above_0.80" },
    tags: ["RED-alert", "tariff-impact", "pickup-truck", "BB-AGT-002"],
  },
  {
    name: "Seasonal False Positive — Tax Refund Season Correctly Identified",
    description: "Compact car segment shows +5% appreciation in February. CUSUM signals. Historical seasonal database shows February tax refund uplift of 4-7% for compact cars. After STL decomposition, deseasonalized trend shows only +0.8% — no genuine shift. Agent should cancel alert.",
    input: { segment: "compact_car", month: "February", rawTrendPct: 5.0, seasonalBaseline: 5.5, deseasonalizedTrendPct: 0.8, seasonalCorrelation: 0.88 },
    expectedOutput: { alertGenerated: false, classification: "seasonal_pattern", deseasonalizationApplied: true, noAlertRouted: true },
    metrics: { correctlyCanceled: "no_alert_generated", deseasonalizationApplied: "STL_decomposition_used", falsePositivePrevented: "seasonal_pattern_correctly_identified" },
    tags: ["seasonal-adjustment", "false-positive", "STL-decomposition", "BB-AGT-002"],
  },
  {
    name: "Conflicting Signal Resolution — Structured Down, OEM Up",
    description: "Luxury SUV structured auction data shows -2.1% 3-week trend (depreciation). BMW simultaneously announces $5,000 lease enhancement program (appreciation signal). Signals conflict. Agent should raise confidence threshold and generate Conflicting Evidence report.",
    input: { segment: "luxury_suv", structuredTrendPct: -2.1, structuredDirection: "depreciation", oemSignal: { manufacturer: "BMW", incentiveType: "lease_subsidy", value: 5000, direction: "appreciation" }, baseSignalFusionScore: 0.58 },
    expectedOutput: { conflictDetected: true, adjustedAmberThreshold: 0.75, alertType: "conflicting_evidence", routedToSeniorAnalyst: true, alertSeverity: "AMBER" },
    metrics: { conflictDetected: "conflicting_evidence_classified", thresholdAdjusted: "threshold_raised_to_0.75", analystNotified: "senior_analyst_routed" },
    tags: ["conflicting-signals", "luxury-SUV", "signal-fusion", "BB-AGT-002"],
  },
  {
    name: "FRED API Outage Fallback",
    description: "FRED API returns 503 errors for 45 minutes. Consumer sentiment data unavailable. Agent should fall back to cached data (cache 12 days old), apply staleness warning, and exclude FRED signals from confidence calculation.",
    input: { fredApiStatus: "unavailable", outageMinutes: 45, cacheAgeDays: 12, cachedConsumerSentiment: 70.4 },
    expectedOutput: { cacheActivated: true, stalenessWarningApplied: true, fredSignalsExcluded: false, cacheAgeWithinLimit: true, alertsGeneratedWithWarning: true },
    metrics: { cacheUsed: "cached_data_activated", warningApplied: "staleness_flag_on_all_alerts", correctExclusion: "cache_under_30_days_so_signals_included_with_warning" },
    tags: ["FRED-outage", "cache-fallback", "data-availability", "BB-AGT-002"],
  },
  {
    name: "OEM Surprise Incentive — Immediate Bypass",
    description: "GM announces $4,500 consumer rebate on Silverado, effective immediately. This qualifies as major incentive (>$1,500). Agent should bypass daily cycle, run immediate impact assessment, and generate AMBER alert within 30 minutes.",
    input: { oem: "GM", model: "Silverado", incentiveType: "cash_rebate", consumerValue: 4500, isMajorIncentive: true, effectiveDate: "immediate" },
    expectedOutput: { dailyCycleBypass: true, immediateAssessmentTriggered: true, alertSeverity: "AMBER", assessmentCompletedWithinMinutes: 30, historicalComparablesUsed: 5 },
    metrics: { bypassTriggered: "daily_cycle_bypassed", timeliness: "assessment_within_30_min", historicalComparables: "5_comparable_programs_referenced" },
    tags: ["OEM-incentive", "immediate-assessment", "cycle-bypass", "BB-AGT-002"],
  },
];

const BB002_EVAL = {
  organizationId: ORG,
  name: "BB-AGT-002 Market Shift Detector Evaluation Suite",
  type: "accuracy",
  thresholdConfig: {
    marketShiftLeadTimeWeeks: 2,
    falseAlarmRate: 0.15,
    signalFusionAccuracy: 0.85,
    sourceAttributionCompleteness: 1.0,
    overallPassRate: 0.88,
  },
  scorerConfig: {
    primary: "shift_detection_lead_time_accuracy",
    secondary: "signal_attribution_completeness",
    rubric: "rubricScoring",
    seasonalAdjustmentCheck: true,
    conflictResolutionCheck: true,
    falseAlarmValidation: true,
  },
  coverageTags: ["change-point-detection", "signal-fusion", "OEM-incentive", "FRED-economic", "fuel-price", "seasonal-adjustment", "conflict-resolution", "alert-routing"],
  schedule: "weekly:Wednesday:06:00 UTC",
  industry: "automotive",
};

const BB002_OUTCOME = {
  outcome: {
    organizationId: ORG,
    name: "Market Shift Detector — Outcome Contract",
    description: "Business objectives and KPIs governing BB-AGT-002. Targets market shift detection lead time >=2 weeks, false alarm rate <=15%, signal fusion accuracy >=85%, and full source attribution compliance on all distributed alerts.",
    version: 1,
    status: "active",
    riskTier: "MEDIUM",
    pricingModel: "PER_OUTCOME_EVENT",
    pricePerUnit: 0,
    approvalGates: ["lead_analyst_review"],
    riskThreshold: 0.80,
    maxDriftPercent: 10,
    slaConfig: {
      alertGenerationLatencyMin: 60,
      majorIncentiveResponseMin: 30,
      blackSwanResponseMin: 15,
    },
  },
  kpis: [
    { name: "Market Shift Detection Lead Time", target: 2, unit: "weeks", measurement: "Average weeks ahead of Black Book standard weekly report for confirmed shift events, validated against Wholesale Insights archive", baseline: 0, slaThreshold: 1.5, weight: 1.5 },
    { name: "False Alarm Rate", target: 15, unit: "%", measurement: "Percentage of AMBER/RED alerts that do not materialize into confirmed market shifts within 6-week follow-up window", baseline: 22, slaThreshold: 20, weight: 1.3 },
    { name: "Signal Fusion Accuracy", target: 85, unit: "%", measurement: "Percentage of signal fusion assessments rated correct by senior analyst team on retrospective labeled cases", baseline: 70, slaThreshold: 78, weight: 1.2 },
    { name: "Source Attribution Completeness", target: 100, unit: "%", measurement: "Percentage of distributed alerts with complete source citations per BB-P2 policy requirements", baseline: 82, slaThreshold: 95, weight: 1.0 },
    { name: "Analyst Alert Action Rate", target: 60, unit: "%", measurement: "Percentage of AMBER alerts on which analysts take documented action within 48 hours", baseline: 45, slaThreshold: 50, weight: 1.0 },
  ],
};

// ══════════════════════════════════════════════════════════════════════════════
//  BB-AGT-003 — COMPETITIVE INTELLIGENCE MONITOR
// ══════════════════════════════════════════════════════════════════════════════

const BB003_SKILLS = [
  {
    organizationId: ORG,
    name: "Competitor Value Normalization Skill",
    description: "Adjusts competitor valuations (KBB, NADA Guides, Manheim Market Report) to a comparable basis accounting for methodology differences. KBB trade-in values normalized to wholesale basis using documented spread factors. NADA clean trade and rough trade grades aligned to Black Book condition scale. Regional adjustments applied to ensure geographic comparability. Produces normalized competitor values suitable for divergence analysis.",
    industry: "automotive",
    domain: "competitive-intelligence",
    version: "1.0.0",
    author: "Black Book Analytics Team",
    trustTier: "HIGH",
    dependencies: [],
    tags: ["competitor-normalization", "KBB", "NADA", "Manheim", "methodology-alignment", "BB-AGT-003"],
    status: "active",
    complexity: "complex",
    allowedTools: ["retrieve_kb", "fetch_competitor_valuations", "apply_kbb_normalization", "apply_nada_grade_alignment", "apply_manheim_basis_adjustment", "apply_regional_adjustment", "compute_normalized_value"],
    requiredMcpServers: ["competitor-data-mcp", "blackbook-valuation-mcp"],
    requiredDataClassifications: ["competitor_valuation_data", "market_segment_data"],
    disableModelInvocation: false,
    contextMode: "rag",
    userInvocable: false,
    descriptionQualityScore: 91,
    knowledgeQueries: ["KBB trade-in to wholesale spread factors by segment and condition", "NADA clean trade to rough trade grade alignment with Black Book condition scale", "Manheim Market Report basis adjustments for wholesale comparison", "Regional comparability adjustment methodology"],
    yamlFrontmatter: "name: Competitor Value Normalization Skill\nversion: \"1.0\"\nagent_code: BB-AGT-003\ndomain: competitive-intelligence\nindustry: automotive\ntrust_tier: HIGH\ncontext_mode: rag\ncompetitors: [KBB, NADA, Manheim_MMR]\nnormalization_target: BB_wholesale_basis",
    markdownBody: "# Competitor Value Normalization Skill\n\n## Normalization Framework\n\n### KBB Trade-In to Wholesale\n- KBB trade-in values represent dealer acquisition price estimate from consumer perspective\n- BB wholesale represents auction transaction-based wholesale\n- KBB-to-wholesale spread: typically 3-8% premium for KBB (consumers expect more than auction price)\n- Spread varies by segment: pickup trucks 5-8%; sedans 3-5%; luxury 4-6%\n- Adjustment: KBB_normalized = KBB_trade_in * (1 - spread_factor)\n\n### NADA Grade Alignment\n- NADA Clean Trade ≈ BB Good condition\n- NADA Rough Trade ≈ BB Fair condition\n- NADA Average ≈ BB between Good and Fair\n- Adjustment: apply condition delta from BB's internal condition differential table\n\n### Manheim MMR Basis\n- Manheim Market Report (MMR): actual auction transaction basis; most directly comparable\n- Minor adjustment: MMR uses Manheim condition report scale; align to BB condition\n- Geographic basis: MMR may use different regional weights; normalize to national basis\n\n## Accuracy Target\nNormalized competitor values within +/-2% of true comparable basis (validated quarterly against analyst manual assessments).",
  },
  {
    organizationId: ORG,
    name: "Divergence Pattern Classification Skill",
    description: "Classifies divergence between Black Book values and normalized competitor values as: (a) BB Leading — Black Book moved first and competitors have not yet caught up, indicating early detection advantage; (b) BB Lagging — competitors moved first, indicating BB may have missed a signal; (c) Systematic Disagreement — persistent divergence suggesting methodology difference rather than timing. Uses rolling 12-week divergence history to distinguish timing effects from systematic differences.",
    industry: "automotive",
    domain: "competitive-intelligence",
    version: "1.0.0",
    author: "Black Book Analytics Team",
    trustTier: "HIGH",
    dependencies: [],
    tags: ["divergence-classification", "leading-lagging", "competitive-analysis", "BB-AGT-003"],
    status: "active",
    complexity: "complex",
    allowedTools: ["retrieve_kb", "compute_divergence_metrics", "classify_divergence_pattern", "analyze_divergence_history", "compute_correlation_timing", "flag_systematic_disagreement"],
    requiredMcpServers: ["competitor-data-mcp", "blackbook-valuation-mcp"],
    requiredDataClassifications: ["competitor_valuation_data", "market_segment_data"],
    disableModelInvocation: false,
    contextMode: "rag",
    userInvocable: false,
    descriptionQualityScore: 90,
    knowledgeQueries: ["Historical leading/lagging classification accuracy by segment", "Systematic disagreement identification: duration and magnitude thresholds", "Timing analysis methodology for divergence classification", "12-month divergence history by segment and competitor"],
    yamlFrontmatter: "name: Divergence Pattern Classification Skill\nversion: \"1.0\"\nagent_code: BB-AGT-003\ndomain: competitive-intelligence\nindustry: automotive\ntrust_tier: HIGH\ncontext_mode: rag\nclassifications: [BB_leading, BB_lagging, systematic_disagreement]\nhistory_window_weeks: 12\nlagging_flag_threshold_pct: 3",
    markdownBody: "# Divergence Pattern Classification Skill\n\n## Classification Logic\n\n### BB Leading\n- Criteria: BB value moved in final direction >= 2 weeks before competitor(s)\n- Evidence: BB divergence widening first, followed by competitor convergence\n- Confidence: higher if >=2 competitors moved to align with BB after BB moved\n\n### BB Lagging\n- Criteria: One or more competitors moved >= 2 weeks before BB in same direction\n- Trigger for deep investigation: which signals are competitors seeing that BB is not?\n- Cross-reference with Market Shift Detector for missed signal identification\n\n### Systematic Disagreement\n- Criteria: Persistent divergence (>4 weeks) that does not converge in either direction\n- Indicates methodology difference rather than timing\n- Triggers methodology review: are different data sources, condition grades, or regional weights causing the gap?\n\n## Divergence Magnitude Thresholds\n- >5% absolute divergence from all competitors: immediate methodology review flag\n- >10% absolute divergence: escalation to VP Analytics\n- 2-5%: routine weekly monitoring and classification",
  },
  {
    organizationId: ORG,
    name: "Root Cause Investigation Skill",
    description: "When BB Lagging is detected, initiates deep investigation to identify which signals competitors are acting on that Black Book missed. Cross-references with Market Shift Detector (BB-AGT-002) alerts for the affected segment and time period. Checks auction data completeness, OEM intelligence feeds, and regional data coverage gaps. Produces root cause hypothesis with recommended data or methodology improvements.",
    industry: "automotive",
    domain: "competitive-intelligence",
    version: "1.0.0",
    author: "Black Book Analytics Team",
    trustTier: "HIGH",
    dependencies: [],
    tags: ["root-cause-investigation", "lagging-detection", "signal-gap", "BB-AGT-003"],
    status: "active",
    complexity: "complex",
    allowedTools: ["retrieve_kb", "fetch_market_shift_alerts_for_segment", "check_auction_data_completeness", "analyze_signal_coverage_gap", "generate_root_cause_hypothesis", "recommend_data_improvements"],
    requiredMcpServers: ["blackbook-valuation-mcp", "competitor-data-mcp", "market-data-mcp"],
    requiredDataClassifications: ["competitor_valuation_data", "market_segment_data", "valuation_time_series"],
    disableModelInvocation: false,
    contextMode: "rag",
    userInvocable: false,
    descriptionQualityScore: 89,
    knowledgeQueries: ["Historical root cause analysis for BB lagging events: data gaps vs methodology gaps", "Auction data completeness by source and segment", "Competitor data advantage sources: proprietary datasets, dealer partnerships", "Market Shift Detector alert cross-reference methodology"],
    yamlFrontmatter: "name: Root Cause Investigation Skill\nversion: \"1.0\"\nagent_code: BB-AGT-003\ndomain: competitive-intelligence\nindustry: automotive\ntrust_tier: HIGH\ncontext_mode: rag\nlagging_investigation_trigger: BB_lagging_classification\ncross_reference_agent: BB-AGT-002",
    markdownBody: "# Root Cause Investigation Skill\n\n## Investigation Protocol\n\n### Step 1: Market Shift Detector Cross-Reference\nQuery BB-AGT-002 for any alerts generated for the lagging segment during the period when competitor moved but BB did not. If alert exists but was not incorporated into BB valuation, investigate the alert-to-valuation pipeline.\n\n### Step 2: Data Completeness Check\nFor the lagging segment and period:\n- Were all expected auction sources active and delivering data?\n- Was transaction volume sufficient for statistical confidence?\n- Were any regional feeds missing?\n\n### Step 3: Signal Coverage Gap Analysis\nIf competitor moved on a signal BB did not capture:\n- Which signal type? OEM announcement, regional data, proprietary dealer network data?\n- Does BB have access to this signal source? If not, document as data acquisition recommendation.\n\n### Root Cause Categories\n| Category | Description | Recommendation |\n|---|---|---|\n| Data gap | Missing feed or source | Add data source |\n| Signal gap | Signal not monitored | Add to intelligence feeds |\n| Lag in processing | Signal received but too slow | Optimize pipeline |\n| Methodology | Different weighting approach | Review valuation methodology |",
  },
  {
    organizationId: ORG,
    name: "Competitive Report Generation Skill",
    description: "Produces weekly formatted competitive positioning reports with segment comparison tables, divergence trend charts, leading/lagging classification summaries, and strategic recommendations. Each report covers all major segments against all three competitors (KBB, NADA, Manheim). Highlights segments where BB leads (competitive advantage evidence) and segments where BB lags (risk areas). Formatted for executive and sales team distribution.",
    industry: "automotive",
    domain: "competitive-intelligence",
    version: "1.0.0",
    author: "Black Book Analytics Team",
    trustTier: "MEDIUM",
    dependencies: [],
    tags: ["report-generation", "competitive-positioning", "weekly-report", "BB-AGT-003"],
    status: "active",
    complexity: "moderate",
    allowedTools: ["retrieve_kb", "aggregate_weekly_divergence_data", "format_segment_comparison_table", "generate_divergence_trend_summary", "classify_competitive_position", "produce_strategic_highlights", "format_report_template"],
    requiredMcpServers: ["competitor-data-mcp", "blackbook-valuation-mcp"],
    requiredDataClassifications: ["competitor_valuation_data", "market_segment_data"],
    disableModelInvocation: false,
    contextMode: "rag",
    userInvocable: false,
    descriptionQualityScore: 87,
    knowledgeQueries: ["Black Book competitive report template and format standards", "Historical competitive positioning trends for longitudinal comparison", "Report classification requirements: Black Book Confidential", "Distribution list and access controls for competitive reports"],
    yamlFrontmatter: "name: Competitive Report Generation Skill\nversion: \"1.0\"\nagent_code: BB-AGT-003\ndomain: competitive-intelligence\nindustry: automotive\ntrust_tier: MEDIUM\ncontext_mode: rag\nreport_frequency: weekly\ncompetitors_covered: [KBB, NADA, Manheim_MMR]\nclassification: BB_Confidential",
    markdownBody: "# Competitive Report Generation Skill\n\n## Report Structure\n\n### Executive Summary (1 page)\n- Overall competitive positioning: leading/lagging segment count\n- Week's biggest divergence movements\n- Strategic highlight: strongest competitive advantage evidence\n- Risk alert: any segment where BB is systematically lagging\n\n### Segment Comparison Tables\nFor each segment:\n- BB value vs KBB normalized vs NADA normalized vs MMR (current week)\n- Week-over-week divergence change\n- 4-week divergence trend: widening, narrowing, stable\n- Classification: Leading | Lagging | Aligned | Systematic Disagreement\n\n### Competitive Advantage Evidence\nList of segments where BB has been leading for >=4 consecutive weeks:\n- Useful for sales team in client retention and prospect conversations\n\n### Risk Area Summary\nSegments where BB has been lagging >=2 consecutive weeks:\n- Root cause hypothesis from investigation skill\n- Recommended action\n\n## Confidentiality\nReports classified Black Book Confidential. Distribution: internal analytics team and senior leadership only. Not for sharing with other Hearst units with competitor relationships.",
  },
  {
    organizationId: ORG,
    name: "Competitor Product Intelligence Skill",
    description: "Monitors competitor product announcements, data partnerships, and capability launches for strategic impact on Black Book market position. Tracks KBB, NADA, and Manheim product pages, press releases, and industry publications. Classifies each announcement by: threat level to BB capabilities, affected product lines, estimated timeline to market impact, and recommended Black Book response.",
    industry: "automotive",
    domain: "competitive-intelligence",
    version: "1.0.0",
    author: "Black Book Analytics Team",
    trustTier: "MEDIUM",
    dependencies: [],
    tags: ["product-intelligence", "competitor-monitoring", "strategic-threat", "BB-AGT-003"],
    status: "active",
    complexity: "moderate",
    allowedTools: ["retrieve_kb", "monitor_competitor_announcements", "classify_announcement_threat", "estimate_market_impact_timeline", "generate_strategic_response_recommendation", "archive_competitor_intelligence"],
    requiredMcpServers: ["news-feed-mcp", "competitor-data-mcp"],
    requiredDataClassifications: ["competitor_product_data"],
    disableModelInvocation: false,
    contextMode: "rag",
    userInvocable: false,
    descriptionQualityScore: 85,
    knowledgeQueries: ["Competitor product capability matrix: KBB, NADA, Manheim current offerings", "Historical competitor announcement to market impact timeline by announcement type", "Black Book product strengths and vulnerability areas", "Industry analyst reports on vehicle valuation market landscape"],
    yamlFrontmatter: "name: Competitor Product Intelligence Skill\nversion: \"1.0\"\nagent_code: BB-AGT-003\ndomain: competitive-intelligence\nindustry: automotive\ntrust_tier: MEDIUM\ncontext_mode: rag\ncompetitors_monitored: [KBB, NADA, Manheim, JD_Power, TrueCar]\nthreat_levels: [HIGH, MEDIUM, LOW, Monitor]",
    markdownBody: "# Competitor Product Intelligence Skill\n\n## Monitoring Sources\n- Competitor press releases and newsrooms (daily)\n- Automotive industry publications: Automotive News, Digital Dealer, NADA publications\n- LinkedIn for executive announcements and team changes\n- Patent filings for technology capability signals\n- Job postings as proxy for development priorities\n\n## Threat Classification\n| Threat Level | Criteria | Response Timeline |\n|---|---|---|\n| HIGH | Direct capability match threatening BB core product; major data partnership | 2-week strategic response brief |\n| MEDIUM | Adjacent capability or data source acquisition | 30-day monitoring and assessment |\n| LOW | Early-stage capability in non-core area | Quarterly review inclusion |\n| Monitor | Market presence news without capability change | Archived for context |\n\n## Strategic Recommendation Template\nFor each HIGH threat: (1) BB capability comparison, (2) customer switching risk estimate, (3) defensive response options (capability enhancement, partnership, pricing adjustment).",
  },
  {
    organizationId: ORG,
    name: "Longitudinal Advantage Tracking Skill",
    description: "Maintains rolling 12-month analysis of Black Book lead/lag position across all segments and all competitors. Tracks competitive advantage score: count of segments where BB leads minus count where BB lags, weighted by segment revenue contribution. Provides trend view of competitive position over time and feeds into quarterly business strategy reviews.",
    industry: "automotive",
    domain: "competitive-intelligence",
    version: "1.0.0",
    author: "Black Book Analytics Team",
    trustTier: "LOW",
    dependencies: [],
    tags: ["longitudinal-tracking", "competitive-advantage-score", "12-month-trend", "BB-AGT-003"],
    status: "active",
    complexity: "moderate",
    allowedTools: ["retrieve_kb", "aggregate_historical_classifications", "compute_advantage_score", "weight_by_segment_revenue", "generate_12_month_trend_report", "flag_sustained_lagging"],
    requiredMcpServers: ["blackbook-valuation-mcp", "competitor-data-mcp"],
    requiredDataClassifications: ["competitor_valuation_data", "market_segment_data"],
    disableModelInvocation: false,
    contextMode: "rag",
    userInvocable: false,
    descriptionQualityScore: 84,
    knowledgeQueries: ["Historical leading/lagging classifications by segment: 12-month archive", "Segment revenue contribution weights for competitive advantage scoring", "Quarterly trend analysis methodology for executive reporting", "Sustained lagging threshold: when to escalate to VP Analytics"],
    yamlFrontmatter: "name: Longitudinal Advantage Tracking Skill\nversion: \"1.0\"\nagent_code: BB-AGT-003\ndomain: competitive-intelligence\nindustry: automotive\ntrust_tier: LOW\ncontext_mode: rag\ntracking_window_months: 12\nadvantage_score_metric: revenue_weighted_lead_minus_lag",
    markdownBody: "# Longitudinal Advantage Tracking Skill\n\n## Competitive Advantage Score\nScore = Sum(segments where BB Leading * segment_revenue_weight) - Sum(segments where BB Lagging * segment_revenue_weight)\n\nScale: +5 to -5 (higher = stronger competitive position)\nTarget: Score >= +2.0 sustained over trailing 12 months\n\n## Quarterly Report Components\n- 12-month competitive advantage score trend chart\n- Segment-by-segment lead/lag scorecard: current quarter vs 4 quarters ago\n- Segments with sustained advantage (>=8 months leading): highlight as competitive moat\n- Segments with deteriorating position (>=3 months lagging): flag for strategic review\n- Year-over-year competitive position comparison\n\n## Escalation Rules\n- Score drops below 0 for 2 consecutive weeks: auto-escalate to VP Analytics\n- Lagging in 3+ high-revenue segments simultaneously: immediate strategic review trigger",
  },
];

const BB003_KB = {
  organizationId: ORG,
  name: "Black Book Competitive Intelligence Knowledge Base",
  description: "Reference for the Competitive Intelligence Monitor covering competitor valuation methodology documentation, historical divergence data, competitor product announcements archive, Black Book methodology documentation, market share data, and industry analyst reports.",
  industry: "automotive",
  domain: "competitive-intelligence",
  retrievalConfig: { topK: 8, scoreThreshold: 0.65, rerankEnabled: true, citationMode: "full" },
  embeddingConfig: { model: "text-embedding-3-small", chunkSize: 512, chunkOverlap: 64 },
};

const BB003_KB_SOURCES = [
  {
    title: "Competitor Valuation Methodology Documentation",
    content: "Documented methodologies for KBB, NADA Guides, and Manheim Market Report for comparative normalization:\n\nKelley Blue Book (KBB) — Owned by Cox Automotive:\n- Trade-in value basis: amount a dealer would reasonably pay a consumer for the vehicle\n- Condition scale: Poor, Fair, Good, Very Good, Excellent (5 levels)\n- Data sources: Cox Automotive dealer transaction data, auction data, consumer sales\n- Update frequency: Weekly with daily micro-adjustments\n- Key methodology difference from BB: KBB heavily weights dealer-to-consumer transaction data; BB weights auction-to-dealer wholesale\n- Spread vs BB wholesale: KBB trade-in typically 4-7% above BB wholesale (consumer-to-dealer friction included)\n\nNADA Guides — Owned by J.D. Power:\n- Values: Clean Trade-In, Average Trade-In, Rough Trade-In, Clean Retail, Average Retail\n- Clean Trade: dealer willing to resell without reconditioning; closest to BB Good condition wholesale\n- Rough Trade: significant mechanical or cosmetic issues; closest to BB Fair condition\n- Data sources: NADA dealer network data, auction data, manufacturer wholesale price data\n- Update frequency: Monthly with weekly adjustments\n- Key difference: NADA historically slower to update than BB; advantages BB in leading scenarios\n\nManheim Market Report (MMR) — Owned by Cox Automotive:\n- Basis: Actual wholesale auction transactions at Manheim auction facilities\n- Most directly comparable to BB wholesale; same transaction basis\n- Condition: Manheim Condition Report (MCR) scale 1.0-5.0\n- Update frequency: Real-time (updated with each gavel drop at Manheim)\n- Key difference: Manheim-only data (excludes Adesa, independent); BB broader data set\n- Geographic bias: Strong in markets with high Manheim auction presence",
  },
  {
    title: "Historical Divergence Data — 3 Years",
    content: "Historical Black Book vs Competitor Divergence Database (2022-2025):\n\nKey Divergence Events (Validated with Leading/Lagging Classification):\n\n2024 Q1 — Full-Size Pickup (BB Leading):\n- BB began declining 3 weeks before KBB and NADA\n- MMR followed BB within 1 week (auction-basis alignment)\n- Root cause: BB detected post-incentive demand normalization via superior auction data coverage\n- Outcome: BB vindicated; KBB and NADA caught up to BB levels\n- Competitive advantage value: clients with BB data had 3-week advantage for remarketing decisions\n\n2023 Q3 — Mid-Size EV (BB Lagging):\n- KBB and MMR declined 2 weeks before BB detected EV depreciation acceleration\n- Root cause investigation: BB auction data had lower EV transaction volume; consumer-to-dealer EV transactions captured by KBB first\n- Corrective action: Added supplemental EV dealer-direct data feed; improved EV detection sensitivity in BB-AGT-002\n\n2023 Q1 — Compact Car (Systematic Disagreement):\n- BB consistently 3-5% below KBB trade-in across all compact segments for 6+ months\n- Root cause: Methodological: KBB weights consumer price expectation; BB weights auction clearing price\n- Resolution: Not a lagging issue; documented as expected methodology spread\n- Action: Added methodology explanation to client-facing materials\n\nLong-Term Statistics (36 months):\n- Events classified: 144 (12 per month across 12 segments)\n- BB Leading: 67 (47%)\n- BB Lagging: 31 (22%)\n- Aligned: 35 (24%)\n- Systematic Disagreement: 11 (7%)\n- Leading/Lagging ratio: 2.2x — BB leads more often than it lags",
  },
  {
    title: "Black Book Methodology Documentation",
    content: "Internal Black Book Valuation Methodology (Confidential — Internal Reference Only):\n\nData Inputs (Priority Weighted):\n1. Manheim auction transactions: weight 1.00 (highest volume, real-time)\n2. Adesa auction transactions: weight 0.95 (second largest, real-time)\n3. Independent auction networks: weight 0.80 (volume varies; quality screened by BB-AGT-001)\n4. Dealer-direct transactions: weight 0.50 (supplemental; not primary)\n5. Retail listing prices: weight 0.20 (leading indicator; not transaction-confirmed)\n\nValuation Computation:\n- Weighted average of transaction prices within rolling 4-week window\n- Volume threshold: minimum 30 transactions for full confidence; below 30 transitions to broader segment pool\n- Condition normalization: all transactions normalized to 'Good' condition equivalent\n- Mileage normalization: all transactions normalized to segment-typical mileage using per-mile adjustment table\n- Outlier exclusion: post BB-AGT-001 anomaly filtering; quarantined transactions excluded\n\nUpdate Cadence:\n- Daily wholesale updates: midnight processing of previous day's transactions\n- Weekly Wholesale Insights publication: Friday; includes trend commentary\n- Real-time API: sub-15-minute availability for API subscribers\n\nCompetitive Positioning:\n- BB's primary advantage: broadest auction data coverage (Manheim + Adesa + independents)\n- BB's primary vulnerability: lower weight on consumer-side signals vs KBB\n- Ongoing: expanding dealer-direct data partnerships to close consumer-side gap",
  },
  {
    title: "Competitor Product and Partnership Announcements Archive",
    content: "Historical archive of competitor product announcements and strategic partnerships affecting the vehicle valuation market:\n\n2024 Announcements:\n- Jan 2024: Cox Automotive (KBB/MMR) announced AI-powered instant offer integration with dealer management systems — extends real-time pricing reach\n- Mar 2024: NADA Guides partnership with digital retailing platform for embedded valuation in F&I process\n- Jul 2024: Manheim launched MMR Pro with enhanced API access and real-time webhooks — direct competitive pressure on BB API product\n- Oct 2024: JD Power (NADA parent) acquired an EV battery health assessment startup — potential residual value differentiation for EV segment\n\n2023 Announcements:\n- Feb 2023: Cox Automotive expanded Manheim Express dealer-to-dealer marketplace — bypasses traditional auction; potential future data gap\n- Jun 2023: KBB launched Instant Cash Offer expansion to 12 new markets — consumer-facing competitive awareness tool\n- Sep 2023: TrueCar launched dealer acquisition pricing tool — emerging competitor in wholesale-adjacent space\n\nStrategic Implications for Black Book:\n- Cox Automotive (KBB + MMR + Manheim) integrated ecosystem creates bundled value proposition; BB's independence is a differentiator for clients concerned about Cox conflicts\n- EV battery health data acquisition by NADA/JD Power: potential competitive threat in EV residual value accuracy by 2025-2026\n- Digital retailing integrations: BB needs embedded API presence in same platforms to maintain data coverage",
  },
  {
    title: "Market Share and Customer Intelligence",
    content: "Black Book Market Position and Customer Intelligence (Internal Reference):\n\nMarket Segments Served:\n- Financial institutions (banks, credit unions, captive finance): largest revenue segment; primary users of residual values and wholesale valuations for loan underwriting and portfolio monitoring\n- Dealers (franchise and independent): use BB for appraisals, inventory acquisition, pricing decisions\n- Insurance companies: total loss valuation; salvage vehicle pricing\n- Remarketing companies: wholesale pricing for fleet, rental, and commercial vehicle disposition\n- OEM captive finance: residual value setting for lease programs\n\nCompetitive Win/Loss Data (Illustrative Patterns):\n- Financial institutions: BB wins on accuracy track record and SOC 2 compliance documentation; loses on KBB brand recognition with retail-oriented clients\n- Dealer groups: BB competitive vs MMR on breadth (Adesa + independents); loses on real-time speed to MMR for active buyers\n- Insurance: BB strong in total loss; NADA sometimes preferred for state-specific guideline compliance\n\nClient Retention Drivers:\n- Accuracy consistency over time (validated by BB-AGT-003 longitudinal tracking)\n- API reliability and uptime\n- Compliance documentation (SOC 2, FCRA support)\n- Analyst accessibility for disputed valuations",
  },
  {
    title: "Industry Analyst Reports and Market Landscape",
    content: "Vehicle Valuation Market Landscape (Synthesized from Public Industry Research):\n\nMarket Size and Growth:\n- Vehicle valuation data market estimated at $800M-$1.2B annually across all data products\n- Growing at 8-12% annually driven by digitization of vehicle transactions and embedded finance expansion\n- EV segment creating new valuation complexity; companies with battery health and residual value expertise gaining share\n\nKey Market Dynamics:\n- Data breadth vs speed tradeoff: clients prioritize differently (fleet managers want speed; lenders want accuracy)\n- API economy: embedded valuation in dealer management systems, digital retailing, and F&I software becoming table stakes\n- Regulatory pressure: FCRA compliance documentation increasingly requested by financial institution clients\n- EV differentiation: battery degradation-adjusted residual values becoming a major differentiator for EV-heavy portfolios\n\nCompetitive Moat Analysis:\n- Black Book advantages: Independence from Cox ecosystem (no conflict), breadth of data sources, SOC 2 compliance rigor, Hearst editorial credibility\n- Black Book vulnerabilities: Lower consumer brand recognition vs KBB, Cox integrated bundling for high-volume dealers\n- Industry direction: AI-driven dynamic pricing and real-time API integrations expected to commoditize basic valuations; differentiation shifting to accuracy, compliance, and specialist segments (EV, commercial, fleet)",
  },
];

const BB003_RUNBOOKS = [
  {
    organizationId: ORG,
    name: "BB-003-RB-01: Competitor Methodology Change Response",
    trigger: "Competitor publicly announces methodology change OR divergence pattern shows sudden structural shift inconsistent with market data",
    steps: [
      "Document the methodology change: source, effective date, specific changes announced",
      "Reassess all current normalization factors for the affected competitor",
      "Compute new normalization baseline: run 4-week parallel comparison using old and new methodology",
      "Recalibrate normalization model with updated spread factors",
      "Flag all divergence metrics from the previous 4 weeks as 'pre-methodology-change' in historical database",
      "Re-run divergence classification for affected period with updated normalization",
      "Notify lead analyst of normalization update and impact on historical trend continuity",
      "Update competitor methodology documentation in knowledge base",
      "Monitor for 4 weeks to confirm normalization accuracy post-change"
    ],
    escalationPath: "Lead Analyst notification → VP Analytics if methodology change significantly impacts divergence classifications",
    outputFormat: "Methodology change analysis report: change description, normalization adjustment, affected divergence metrics, recalibration outcome",
    complianceTags: ["BB-P3", "SOC2-TypeII"],
    retryPolicy: { maxRetries: 0, manualEscalation: false },
    timeoutSec: 86400,
    tags: ["methodology-change", "normalization-update", "BB-AGT-003"],
  },
  {
    organizationId: ORG,
    name: "BB-003-RB-02: Systematic Lagging Escalation",
    trigger: "BB detected as lagging in 3 or more vehicle segments simultaneously for 2+ consecutive weeks",
    steps: [
      "Compile lagging evidence: all affected segments, lag duration, magnitude of divergence, classification confidence",
      "Run root cause investigation for each lagging segment: data gap, signal gap, methodology, or lag in processing?",
      "Identify if a common root cause explains all lagging segments (systemic issue) or each has independent cause",
      "If systemic: suspect a shared data source issue or algorithm change; immediate escalation required",
      "Prepare VP Analytics briefing: segments affected, divergence magnitudes, root cause hypotheses, recommended corrective actions",
      "If data source issue: coordinate with BB-AGT-001 data team for immediate data quality audit",
      "If signal gap: submit data acquisition recommendation for missing signal source",
      "Track resolution: monitor lagging segments weekly until BB returns to aligned or leading classification",
      "Document outcome in competitive intelligence archive with root cause and corrective action taken"
    ],
    escalationPath: "VP Analytics briefing required within 24 hours → CEO briefing if lagging in >5 high-revenue segments",
    outputFormat: "Systematic lagging briefing: affected segments, root cause analysis, divergence magnitudes, corrective action plan and timeline",
    complianceTags: ["SOC2-TypeII"],
    retryPolicy: { maxRetries: 0, manualEscalation: true },
    timeoutSec: 86400,
    tags: ["systematic-lagging", "escalation", "root-cause", "BB-AGT-003"],
  },
  {
    organizationId: ORG,
    name: "BB-003-RB-03: Competitor Data Source Disruption",
    trigger: "Licensed competitor data feed (KBB, NADA, or MMR) becomes unavailable or returns clearly erroneous data",
    steps: [
      "Detect disruption: data absence for >24 hours OR values deviating >15% without market explanation",
      "Classify disruption type: feed outage vs data quality degradation vs potential methodology shift",
      "For outage: switch to public-source approximation where available; clearly flag affected metrics as 'estimated'",
      "Apply reduced confidence flag to all divergence metrics computed with approximated data",
      "Contact licensed data provider to report issue and request ETA for restoration",
      "Exclude affected competitor from that week's competitive report if data unavailable for >48 hours",
      "On restoration: validate restored data against expected range before re-including in analysis",
      "If validation fails: request historical data backfill from provider",
      "Document disruption, estimated metrics used, and restoration details in audit log"
    ],
    escalationPath: "Auto-notify lead analyst → Procurement if provider SLA breach → VP Analytics if >1 week outage",
    outputFormat: "Data disruption log: provider, disruption type, duration, estimated metrics used, restoration validation result",
    complianceTags: ["BB-P3", "SOC2-TypeII", "Data-Licensing"],
    retryPolicy: { maxRetries: 2, intervalSec: 7200 },
    timeoutSec: 259200,
    tags: ["data-disruption", "competitor-feed", "BB-AGT-003"],
  },
  {
    organizationId: ORG,
    name: "BB-003-RB-04: New Competitor Entry Response",
    trigger: "New participant in vehicle valuation market launches publicly with comparable product capability",
    steps: [
      "Assess new entrant: product scope, data sources claimed, target customer segments, pricing model",
      "Classify threat level using Competitor Product Intelligence Skill",
      "If threat level HIGH: initiate full capability comparison vs BB product; brief VP Analytics within 1 week",
      "Add new competitor to monitoring framework within 2 weeks of public launch",
      "Establish normalization baseline: collect initial valuation samples and compare to BB values",
      "Document initial divergence baseline for longitudinal tracking starting point",
      "Integrate into weekly competitive report; add as new column if significant market entrant",
      "Brief sales team on competitor positioning for competitive conversation readiness"
    ],
    escalationPath: "VP Analytics brief (HIGH threat) → Sales team brief for competitive readiness",
    outputFormat: "New entrant assessment: product scope, threat level, initial divergence baseline, competitive impact estimate",
    complianceTags: ["SOC2-TypeII"],
    retryPolicy: { maxRetries: 0, manualEscalation: false },
    timeoutSec: 1209600,
    tags: ["new-competitor", "market-entry", "BB-AGT-003"],
  },
  {
    organizationId: ORG,
    name: "BB-003-RB-05: Divergence Exceeds 10% Methodology Review",
    trigger: "Any segment diverges more than 10% from ALL major competitors for 2+ consecutive weeks",
    steps: [
      "Document the divergence: segment, magnitude, all competitor comparison values, duration",
      "First check: is BB data quality issue the cause? Cross-reference with BB-AGT-001 for data quality flags",
      "Run competitor normalization validation: re-verify normalization factors are correctly applied",
      "If normalization confirms correct: trigger methodology review for the affected segment",
      "Engage lead valuation analyst for manual valuation review of the affected segment",
      "Compare BB methodology inputs to competitor inputs: data sources, weightings, condition alignment",
      "Generate methodology discrepancy report: where the gap originates",
      "If BB is correct: document competitive advantage evidence with supporting data",
      "If BB needs adjustment: develop correction proposal for lead analyst approval"
    ],
    escalationPath: "Lead Analyst manual review required → VP Analytics if BB methodology adjustment proposed",
    outputFormat: "10% divergence review report: methodology comparison, normalization validation, root cause, recommendation",
    complianceTags: ["SOC2-TypeII", "BB-P3"],
    retryPolicy: { maxRetries: 0, manualEscalation: true },
    timeoutSec: 172800,
    tags: ["methodology-review", "large-divergence", "BB-AGT-003"],
  },
  {
    organizationId: ORG,
    name: "BB-003-RB-06: Quarterly Calibration Cycle",
    trigger: "Quarterly calendar trigger (every 90 days) OR analyst request",
    steps: [
      "Recalculate normalization factors for each competitor using last 90 days of parallel valuation data",
      "Update KBB-to-wholesale spread factors by segment using fresh paired comparisons",
      "Recalibrate NADA condition grade alignment with current BB condition differential table",
      "Revalidate Manheim MMR regional basis adjustment",
      "Recalculate divergence baselines: what constitutes 'normal' divergence for each competitor and segment?",
      "Recalibrate systematic disagreement thresholds: update to reflect current methodology gap",
      "Update historical divergence database with recalibrated classifications for trailing 90 days",
      "Generate calibration report: changes made, validation accuracy improvement, new baseline summary",
      "Submit calibration report for lead analyst review and sign-off"
    ],
    escalationPath: "Lead Analyst sign-off required → VP Analytics if significant baseline recalibration proposed",
    outputFormat: "Quarterly calibration report: updated normalization factors per competitor, new divergence baselines, validation accuracy",
    complianceTags: ["SOC2-TypeII"],
    retryPolicy: { maxRetries: 0, manualEscalation: true },
    timeoutSec: 259200,
    tags: ["quarterly-calibration", "normalization-update", "BB-AGT-003"],
  },
];

const BB003_POLICIES = [
  {
    organizationId: ORG,
    name: "Competitive Data Handling — No Reproduction of Competitor Values",
    description: "Competitor pricing data (KBB, NADA, Manheim MMR) accessed under license agreements is for divergence analysis only. Competitor absolute values must never appear in outputs, reports, or API responses. Only BB's own values and divergence percentages are permitted in outputs.",
    domain: "data_handling",
    status: "active",
    policyType: "data_governance",
    policyJson: {
      enforcement: "block",
      rule: "All agent outputs must use divergence metrics only (percentage difference, directional indicator). Absolute competitor values may appear in internal working memory during computation but must not be included in any persisted output, report, or API response. Violation causes immediate output rejection.",
      allowedOutputMetrics: ["divergence_pct", "divergence_direction", "classification", "bb_own_value"],
      blockedOutputContent: ["competitor_absolute_value"],
      internalWorkingMemoryException: true,
    },
    scopeType: "agent",
    agentCode: "BB-AGT-003",
    complianceTags: ["BB-P3", "Competitive-Data-Licensing", "Antitrust"],
  },
  {
    organizationId: ORG,
    name: "Report Confidentiality — Black Book Confidential Classification",
    description: "All competitive positioning reports generated by BB-AGT-003 are classified Black Book Confidential. Distribution is restricted to internal Black Book analytics team and senior leadership. Reports must not be shared with other Hearst business units that have relationships with competitors.",
    domain: "data_handling",
    status: "active",
    policyType: "data_governance",
    policyJson: {
      enforcement: "block",
      rule: "Competitive reports must be marked 'Black Book Confidential' and routed only to: internal analytics team, senior leadership (VP Analytics, CEO). Automated distribution to any external channel or other Hearst business units is blocked. Human approval required for any exception.",
      reportClassification: "BB_Confidential",
      allowedDistribution: ["internal_analytics_team", "senior_leadership"],
      blockedDistribution: ["external_channels", "other_hearst_units"],
      exceptionApproval: "VP_Analytics",
    },
    scopeType: "agent",
    agentCode: "BB-AGT-003",
    complianceTags: ["Hearst-Information-Barriers", "SOC2-TypeII"],
  },
  {
    organizationId: ORG,
    name: "Antitrust Compliance — No Price Coordination",
    description: "Competitive intelligence generated by BB-AGT-003 must never be used to coordinate pricing with competitors. BB's own valuation decisions are made solely on data and methodology. Competitive divergence data informs gap analysis and product improvement — not pricing alignment.",
    domain: "compliance",
    status: "active",
    policyType: "compliance",
    policyJson: {
      enforcement: "warn",
      rule: "Competitive intelligence outputs may only be used for: (1) gap analysis comparing BB methodology to competitors, (2) product improvement identification, (3) sales team competitive positioning. Outputs may not be used to align BB valuations to competitor levels for coordination purposes. Annual compliance training required for all users of competitive intelligence.",
      permittedUses: ["methodology_gap_analysis", "product_improvement", "sales_competitive_positioning"],
      prohibitedUses: ["price_coordination", "valuation_alignment_to_competitor"],
      complianceTrainingRequired: true,
    },
    scopeType: "agent",
    agentCode: "BB-AGT-003",
    complianceTags: ["FTC-Antitrust", "SOC2-TypeII"],
  },
  {
    organizationId: ORG,
    name: "Data Licensing Compliance — Competitor Data Access Controls",
    description: "Competitor valuation data is accessed only through licensed channels per each provider's data licensing agreement. Unauthorized scraping of competitor websites or aggregators is prohibited. License renewal and compliance review required annually.",
    domain: "data_handling",
    status: "active",
    policyType: "data_governance",
    policyJson: {
      enforcement: "block",
      rule: "Competitor data must only be accessed via: (1) documented licensed API connections listed in the approved data source registry, (2) manually obtained and licensed data files where API is unavailable. Direct web scraping, unauthorized API access, or third-party aggregated data from unlicensed sources is blocked.",
      approvedSources: ["kbb_licensed_api", "nada_licensed_feed", "manheim_mmr_licensed_api"],
      blockedSources: ["web_scraping", "unlicensed_aggregator"],
      licenseRenewalFrequencyMonths: 12,
    },
    scopeType: "agent",
    agentCode: "BB-AGT-003",
    complianceTags: ["BB-P3", "Data-Licensing"],
  },
];

const BB003_AGENT = {
  organizationId: ORG,
  name: "Competitive Intelligence Monitor",
  description: "Tracks competitor vehicle valuation sources (KBB, NADA Guides, Manheim Market Report) for systematic divergence from Black Book values. Normalizes competitor values to comparable basis, classifies divergence patterns as BB Leading, BB Lagging, or Systematic Disagreement, and investigates root causes when lagging. Produces weekly competitive positioning reports. Monitors competitor product announcements for strategic threats. Maintains rolling 12-month competitive advantage score.",
  department: "Competitive Analysis",
  agentCode: "BB-AGT-003",
  autonomyMode: "supervised",
  riskTier: "MEDIUM",
  industry: "automotive",
  status: "active",
  healthScore: 95,
  requiresHumanApproval: true,
  taskInstructions: "You are the Competitive Intelligence Monitor for Black Book vehicle valuations. Your mission is to protect and grow Black Book's market position as the most trusted vehicle valuation source.\n\nWeekly cycle:\n1. Ingest competitor valuation data from licensed sources: KBB trade-in, NADA clean/rough trade, Manheim MMR\n2. Normalize all competitor values to comparable BB wholesale basis\n3. Calculate divergence metrics: absolute dollar, percent, directional, trend (widening/narrowing)\n4. Classify each segment: BB Leading, BB Lagging, Aligned, or Systematic Disagreement\n5. For any Lagging pattern: initiate root cause investigation\n6. For Leading patterns: document as competitive advantage evidence\n7. Flag any segment >5% divergence from ALL competitors for methodology review\n8. Monitor competitor product announcements and partnership news\n9. Generate weekly competitive positioning report (classified: Black Book Confidential)\n10. Update longitudinal advantage tracking scores\n\nCritical rules:\n- NEVER reproduce competitor absolute values in any output (BB-P3)\n- All competitive reports classified Black Book Confidential\n- Root cause investigation mandatory for any Lagging classification\n- Competitor data from licensed sources ONLY — no scraping",
  toolsConfig: {
    allowedTools: [
      "retrieve_kb", "fetch_competitor_valuations", "apply_kbb_normalization", "apply_nada_grade_alignment",
      "apply_manheim_basis_adjustment", "apply_regional_adjustment", "compute_normalized_value",
      "compute_divergence_metrics", "classify_divergence_pattern", "analyze_divergence_history",
      "flag_systematic_disagreement", "fetch_market_shift_alerts_for_segment", "check_auction_data_completeness",
      "analyze_signal_coverage_gap", "generate_root_cause_hypothesis", "aggregate_weekly_divergence_data",
      "format_segment_comparison_table", "generate_divergence_trend_summary", "produce_strategic_highlights",
      "monitor_competitor_announcements", "classify_announcement_threat", "aggregate_historical_classifications",
      "compute_advantage_score", "weight_by_segment_revenue", "generate_12_month_trend_report",
    ],
    mcpServers: [
      "competitor-data-mcp", "blackbook-valuation-mcp", "market-data-mcp", "news-feed-mcp",
    ],
  },
  complianceTags: ["BB-P3", "Antitrust-FTC", "Data-Licensing", "SOC2-TypeII", "Hearst-Information-Barriers"],
  maxToolIterations: 15,
  outputSchema: {
    type: "competitive_report",
    fields: ["week_ending", "competitive_advantage_score", "segment_classifications", "lagging_root_causes", "leading_evidence", "product_intelligence_alerts"],
  },
};

const BB003_GOLDEN_DATASET = {
  organizationId: ORG,
  name: "BB-AGT-003 Competitive Intelligence Monitor Evaluation Dataset",
  description: "Labeled dataset with 12 months of competitor valuation data with validated leading/lagging classifications, normalization accuracy tests, and report quality assessments.",
  industry: "automotive",
  domain: "competitive-intelligence",
  version: "1.0",
  useCase: "Competitive Intelligence Monitoring",
  agentCode: "BB-AGT-003",
  tags: ["competitive-intelligence", "divergence-analysis", "normalization", "BB-AGT-003"],
};

const BB003_TEST_CASES = [
  {
    name: "KBB Normalization Accuracy — Compact Sedan",
    description: "KBB trade-in value for 2022 Honda Accord is $18,400. Known spread factor for compact sedan is 5.2%. Normalized value should be within +/-2% of BB's own wholesale value of $17,100.",
    input: { competitor: "KBB", vehicleSegment: "compact_sedan", competitorValue: 18400, spreadFactor: 0.052, bbWholesaleValue: 17100 },
    expectedOutput: { normalizedValue: 17443, divergenceFromBB_pct: 2.0, withinAccuracyThreshold: true, outputContainsCompetitorAbsolute: false },
    metrics: { normalizationAccuracy: "normalized_value_within_2pct_of_BB", policyCompliance: "no_competitor_absolute_in_output" },
    tags: ["normalization", "KBB", "compact-sedan", "BB-AGT-003"],
  },
  {
    name: "BB Leading Classification — Pickup Truck",
    description: "BB wholesale for Full-Size Pickup drops 4.2% over 3 weeks. KBB trade-in and NADA show only -1.8% over the same period. Pattern indicates BB is detecting depreciation 2+ weeks ahead of competitors.",
    input: { segment: "full_size_pickup", bbTrendPct3w: -4.2, kbbNormalizedTrendPct3w: -1.8, nadaNormalizedTrendPct3w: -1.9, mmrTrendPct3w: -3.8, durationWeeks: 3 },
    expectedOutput: { classification: "BB_leading", evidenceDocumented: true, competitiveAdvantageHighlighted: true, competitorAbsoluteValuesInOutput: false },
    metrics: { correctClassification: "BB_leading_detected", advantageDocumented: "competitive_advantage_evidence_generated", policyCompliance: "no_competitor_absolute_values" },
    tags: ["BB-leading", "pickup-truck", "competitive-advantage", "BB-AGT-003"],
  },
  {
    name: "BB Lagging Detection with Root Cause Investigation",
    description: "NADA and KBB begin appreciating Mid-Size SUV values 3 weeks before BB detects the same trend. BB is lagging. Root cause investigation should check Market Shift Detector alerts and data completeness.",
    input: { segment: "mid_size_suv", bbTrendPct: 0.5, nadaTrendPct: 3.1, kbbTrendPct: 2.8, lagWeeks: 3, marketShiftDetectorAlert: null, dataCompletenessIssue: false },
    expectedOutput: { classification: "BB_lagging", rootCauseInvestigationTriggered: true, rootCauseHypothesis: "signal_gap", escalationRequired: false },
    metrics: { correctClassification: "BB_lagging_classified", investigationTriggered: "root_cause_investigation_initiated", hypothesisGenerated: "root_cause_documented" },
    tags: ["BB-lagging", "root-cause", "mid-size-SUV", "BB-AGT-003"],
  },
  {
    name: "10% Divergence Methodology Review Trigger",
    description: "Compact EV segment shows BB 12% below all competitors for 3 consecutive weeks. Should trigger mandatory methodology review escalation.",
    input: { segment: "compact_ev", bbValue: 22400, kbbNormalized: 25200, nadaNormalized: 24900, mmr: 24800, divergencePct: 12, durationWeeks: 3 },
    expectedOutput: { methodologyReviewTriggered: true, escalationToLeadAnalyst: true, outputContainsCompetitorAbsolute: false, divergenceMagnitudeFlagged: true },
    metrics: { reviewTriggered: "10pct_threshold_triggers_review", analystEscalated: "lead_analyst_notified", policyCompliance: "no_absolute_values_in_output" },
    tags: ["10pct-divergence", "methodology-review", "EV-segment", "BB-AGT-003"],
  },
  {
    name: "Systematic Disagreement Identification",
    description: "Luxury sedan shows BB consistently 4% below KBB normalized value for 8 consecutive weeks with no convergence. Market data shows no active market shift. Should classify as systematic disagreement.",
    input: { segment: "luxury_sedan", bbVsKbbDivergencePct: -4.0, durationWeeks: 8, marketShiftAlert: null, competitorConvergenceDetected: false },
    expectedOutput: { classification: "systematic_disagreement", methodologyReviewFlag: true, noAlertGenerated: true, historicalBaselineUpdated: true },
    metrics: { correctClassification: "systematic_disagreement_not_lagging", noSpuriousAlert: "no_lagging_alert_raised", documentedCorrectly: "methodology_gap_documented" },
    tags: ["systematic-disagreement", "luxury-sedan", "methodology-gap", "BB-AGT-003"],
  },
  {
    name: "Weekly Report Generation — Compliance and Format Check",
    description: "Generate weekly competitive positioning report for 12 segments. Report must contain only divergence metrics (no competitor absolute values), be classified Confidential, and include competitive advantage evidence for leading segments.",
    input: { weekEnding: "2025-04-06", segmentsCount: 12, leadingCount: 6, laggingCount: 2, alignedCount: 3, disagreementCount: 1 },
    expectedOutput: { reportGenerated: true, reportClassification: "BB_Confidential", containsCompetitorAbsolutes: false, competitiveAdvantageSection: true, riskAreaSection: true },
    metrics: { formatCorrect: "all_required_sections_present", policyCompliance: "no_competitor_absolutes_in_report", classification: "report_marked_BB_Confidential" },
    tags: ["weekly-report", "report-format", "compliance", "BB-AGT-003"],
  },
];

const BB003_EVAL = {
  organizationId: ORG,
  name: "BB-AGT-003 Competitive Intelligence Monitor Evaluation Suite",
  type: "accuracy",
  thresholdConfig: {
    normalizationAccuracyPct: 2,
    classificationAccuracy: 0.85,
    reportQualityScore: 4.0,
    policyComplianceRate: 1.0,
    overallPassRate: 0.87,
  },
  scorerConfig: {
    primary: "divergence_classification_accuracy",
    secondary: "policy_compliance_check",
    rubric: "rubricScoring",
    normalizationValidation: true,
    reportQualityCheck: true,
    competitorAbsoluteDetection: true,
  },
  coverageTags: ["normalization", "divergence-classification", "BB-leading", "BB-lagging", "systematic-disagreement", "root-cause-investigation", "10pct-threshold", "report-generation", "policy-compliance"],
  schedule: "weekly:Thursday:06:00 UTC",
  industry: "automotive",
};

const BB003_OUTCOME = {
  outcome: {
    organizationId: ORG,
    name: "Competitive Intelligence Monitor — Outcome Contract",
    description: "Business objectives and KPIs governing BB-AGT-003. Targets normalization accuracy within 2%, classification accuracy >=85%, 100% policy compliance (no competitor absolutes in output), analyst satisfaction >=4.0/5.0 on generated reports, and leading/lagging ratio >=2.0 over trailing 12 months.",
    version: 1,
    status: "active",
    riskTier: "MEDIUM",
    pricingModel: "PER_OUTCOME_EVENT",
    pricePerUnit: 0,
    approvalGates: ["lead_analyst_review"],
    riskThreshold: 0.85,
    maxDriftPercent: 10,
    slaConfig: {
      weeklyReportDeliveryDay: "Monday",
      laggingEscalationSec: 86400,
      methodologyReviewTriggerHours: 48,
    },
  },
  kpis: [
    { name: "Normalization Accuracy", target: 2, unit: "%", measurement: "Maximum deviation of normalized competitor values from analyst-validated true comparable basis, measured quarterly", baseline: 5, slaThreshold: 3, weight: 1.3 },
    { name: "Divergence Classification Accuracy", target: 85, unit: "%", measurement: "Percentage of leading/lagging/disagreement classifications confirmed correct by analyst team on retrospective validation set", baseline: 70, slaThreshold: 78, weight: 1.5 },
    { name: "Report Quality Score", target: 4.0, unit: "score/5", measurement: "Analyst satisfaction score on auto-generated weekly competitive reports (1-5 scale)", baseline: 3.2, slaThreshold: 3.5, weight: 1.2 },
    { name: "Policy Compliance Rate", target: 100, unit: "%", measurement: "Percentage of outputs containing zero competitor absolute values (automated scan)", baseline: 88, slaThreshold: 98, weight: 1.5 },
    { name: "Competitive Advantage Score", target: 2.0, unit: "index", measurement: "Revenue-weighted lead segments minus lag segments, 12-month trailing average", baseline: 0.8, slaThreshold: 1.0, weight: 1.0 },
  ],
};

// ══════════════════════════════════════════════════════════════════════════════
//  BB-AGT-004 — NARRATIVE INSIGHT GENERATOR
// ══════════════════════════════════════════════════════════════════════════════

const BB004_SKILLS = [
  {
    organizationId: ORG,
    name: "Market Narrative Generation Skill",
    description: "Produces clear, data-backed market commentary in the Black Book editorial voice from segment data and market shift alerts. Transforms structured metrics (price movements, volume changes, days-on-lot trends) into concise, readable narratives suitable for Black Book Wholesale Insights and Residual Values Insights reports. Maintains objectivity — no promotional language, no OEM favoritism. Every factual claim paired with a source citation.",
    industry: "automotive",
    domain: "content-reporting",
    version: "1.0.0",
    author: "Black Book Editorial Team",
    trustTier: "HIGH",
    dependencies: [],
    tags: ["narrative-generation", "editorial-voice", "market-commentary", "BB-AGT-004"],
    status: "active",
    complexity: "complex",
    allowedTools: ["retrieve_kb", "fetch_segment_weekly_data", "fetch_market_shift_alerts", "compose_segment_narrative", "apply_editorial_style_guide", "attach_citations", "highlight_analyst_judgment_sections"],
    requiredMcpServers: ["blackbook-valuation-mcp", "market-data-mcp"],
    requiredDataClassifications: ["valuation_time_series", "market_segment_data", "report_content"],
    disableModelInvocation: false,
    contextMode: "rag",
    userInvocable: false,
    descriptionQualityScore: 94,
    knowledgeQueries: ["Black Book editorial style guide: tone, terminology, brand voice", "Citation format requirements for auction data, economic indicators, OEM announcements", "Prohibited language: promotional terms, OEM favoritism patterns", "Sections requiring analyst judgment highlighting: confidence levels, wide-range predictions"],
    yamlFrontmatter: "name: Market Narrative Generation Skill\nversion: \"1.0\"\nagent_code: BB-AGT-004\ndomain: content-reporting\nindustry: automotive\ntrust_tier: HIGH\ncontext_mode: rag\nauthor_voice: Black_Book_Editorial\ncitation_required: every_factual_claim\nanalyst_judgment_highlight: wide_confidence_predictions",
    markdownBody: "# Market Narrative Generation Skill\n\n## Editorial Voice Standards\n\n### Tone\n- Authoritative but accessible: reader is a finance or remarketing professional, not a data scientist\n- Factual precision: use specific numbers, percentages, and comparisons\n- Forward-looking but calibrated: acknowledge uncertainty explicitly\n- No superlatives without data: 'largest decline in 5 years' requires citation\n\n### Prohibited Language\n- No promotional or brand-favoring language (e.g., 'impressive performance by [OEM]')\n- No speculation without qualifier ('could,' 'may,' 'uncertainty remains')\n- No competitor naming in customer-facing sections (internal competitive analysis only)\n\n## Narrative Structure per Segment\n1. Price movement headline: 'Wholesale values for [segment] [verb] [X]% [timeframe]'\n2. Primary driver: 'The [X]% movement reflects [primary cause] supported by [evidence]'\n3. Volume and demand context: 'Transaction volume [changed] [X]% [context]'\n4. Forward outlook: 'Looking ahead, [evidence-based projection with confidence qualifier]'\n5. Risk flag if applicable: 'Analysts note [risk] as a potential headwind'\n\n## Citation Format\n[Auction: N transactions, [date range], [sources]] | [Economic: FRED [series], [date]] | [OEM: [manufacturer] announcement, [date]]",
  },
  {
    organizationId: ORG,
    name: "Segment Ranking Skill",
    description: "Identifies the most newsworthy vehicle segments and stories for each weekly report based on change magnitude, customer impact, and novelty. Ranks segments using a weighted newsworthiness score: price movement magnitude (40%), customer revenue impact (30%), novelty vs recent trend (20%), lead time of market shift (10%). Determines report ordering and story prominence.",
    industry: "automotive",
    domain: "content-reporting",
    version: "1.0.0",
    author: "Black Book Editorial Team",
    trustTier: "MEDIUM",
    dependencies: [],
    tags: ["segment-ranking", "newsworthiness", "editorial-priority", "BB-AGT-004"],
    status: "active",
    complexity: "moderate",
    allowedTools: ["retrieve_kb", "compute_price_movement_magnitude", "assess_customer_revenue_impact", "compute_novelty_score", "rank_segments_by_newsworthiness", "determine_report_order"],
    requiredMcpServers: ["blackbook-valuation-mcp", "market-data-mcp"],
    requiredDataClassifications: ["valuation_time_series", "market_segment_data"],
    disableModelInvocation: false,
    contextMode: "rag",
    userInvocable: false,
    descriptionQualityScore: 86,
    knowledgeQueries: ["Historical newsworthiness rankings and analyst feedback", "Customer revenue impact by segment (subscription revenue weighting)", "Novelty scoring: how to compare current movement to recent history", "Report structure: which sections receive which ranking tier segments"],
    yamlFrontmatter: "name: Segment Ranking Skill\nversion: \"1.0\"\nagent_code: BB-AGT-004\ndomain: content-reporting\nindustry: automotive\ntrust_tier: MEDIUM\ncontext_mode: rag\nnewsworthiness_weights: {price_magnitude: 0.40, customer_impact: 0.30, novelty: 0.20, lead_time: 0.10}",
    markdownBody: "# Segment Ranking Skill\n\n## Newsworthiness Score Computation\nScore = (price_movement_pct * 0.40) + (customer_impact_percentile * 0.30) + (novelty_score * 0.20) + (lead_time_weeks * 0.10)\n\n## Scoring Components\n\n### Price Movement Magnitude\n- >5% weekly move: score 1.0\n- 3-5% move: score 0.7\n- 1-3% move: score 0.4\n- <1% move: score 0.1\n\n### Customer Revenue Impact\n- Based on segment's share of BB subscriber revenue\n- Full-Size Pickup and Mid-Size SUV: highest revenue impact\n- Luxury and EV: high-value segments with strong subscriber interest\n\n### Novelty Score\n- Same direction as last 3 weeks: score 0.2 (expected)\n- Reversal of prior trend: score 0.8 (high novelty)\n- First movement in segment for 3+ weeks: score 1.0 (high novelty)\n\n## Report Placement\n- Score >= 0.8: Featured in Market Summary section; full segment detail article\n- Score 0.5-0.8: Included in segment detail section\n- Score < 0.5: Brief data table mention only",
  },
  {
    organizationId: ORG,
    name: "Visualization Generation Skill",
    description: "Creates standardized charts in Black Book brand format: segment trend lines (13-week), heat maps (segment vs week price change), waterfall decompositions (YoY value change by driver), and comparison tables. Validates data-visualization alignment: every data point in a chart must match the corresponding value in the narrative. Zero tolerance for data-visualization mismatches per BB editorial standards.",
    industry: "automotive",
    domain: "content-reporting",
    version: "1.0.0",
    author: "Black Book Editorial Team",
    trustTier: "HIGH",
    dependencies: [],
    tags: ["visualization", "charts", "brand-format", "data-visualization", "BB-AGT-004"],
    status: "active",
    complexity: "moderate",
    allowedTools: ["retrieve_kb", "generate_trend_line_chart", "generate_heat_map", "generate_waterfall_chart", "generate_comparison_table", "validate_data_visualization_alignment", "apply_bb_brand_formatting"],
    requiredMcpServers: ["blackbook-valuation-mcp", "market-data-mcp", "visualization-mcp"],
    requiredDataClassifications: ["valuation_time_series", "market_segment_data"],
    disableModelInvocation: false,
    contextMode: "rag",
    userInvocable: false,
    descriptionQualityScore: 88,
    knowledgeQueries: ["Black Book visualization standards: chart types, color palettes, axis formatting", "Brand color palette: primary BB blue, secondary colors, font specifications", "13-week trend line data requirements and formatting", "Waterfall chart driver categories for YoY valuation decomposition", "Fallback to data tables when chart generation fails"],
    yamlFrontmatter: "name: Visualization Generation Skill\nversion: \"1.0\"\nagent_code: BB-AGT-004\ndomain: content-reporting\nindustry: automotive\ntrust_tier: HIGH\ncontext_mode: rag\nchart_types: [trend_line, heat_map, waterfall, comparison_table]\ndata_viz_mismatch_tolerance: 0",
    markdownBody: "# Visualization Generation Skill\n\n## Chart Types\n\n### Segment Trend Lines (13-week)\n- X-axis: Week ending dates, 13 weeks\n- Y-axis: Average wholesale price ($)\n- Lines: Up to 4 segments on same chart for comparison\n- Brand formatting: BB blue primary, accent colors for comparison segments\n- Fallback: If chart generation fails, produce structured data table with same data\n\n### Weekly Heat Map\n- Rows: Vehicle segments (all 12-14)\n- Columns: Past 8 weeks\n- Cell color: Green (appreciation) to Red (depreciation), magnitude = intensity\n- Enables rapid visual identification of trend patterns\n\n### Waterfall Chart (YoY Decomposition)\n- Decomposes YoY wholesale value change into components: mileage, condition mix, segment shift, market trend, seasonal\n- Shows cumulative bars from prior year value to current value\n\n## Data-Visualization Validation\nBefore any chart is included in a report:\n1. Extract all data points from chart source data\n2. Cross-reference with corresponding narrative claims\n3. If mismatch found: regenerate chart with correct data; never publish with mismatch\n4. If chart generation fails completely: replace with formatted data table",
  },
  {
    organizationId: ORG,
    name: "Source Citation Assembly Skill",
    description: "Attaches verifiable citations to every factual claim in the report. For auction data claims: cites transaction count, date range, and auction sources. For economic indicator claims: cites FRED series code, value, and date. For OEM announcements: cites manufacturer, announcement type, and date. Validates that all citations are internally consistent and traceable to source data. Produces a citation index for the full report.",
    industry: "automotive",
    domain: "content-reporting",
    version: "1.0.0",
    author: "Black Book Editorial Team",
    trustTier: "HIGH",
    dependencies: [],
    tags: ["citations", "source-attribution", "BB-P2", "fact-checking", "BB-AGT-004"],
    status: "active",
    complexity: "moderate",
    allowedTools: ["retrieve_kb", "extract_factual_claims", "match_claim_to_source", "format_citation", "validate_citation_consistency", "generate_citation_index"],
    requiredMcpServers: ["blackbook-valuation-mcp", "market-data-mcp", "economic-data-mcp"],
    requiredDataClassifications: ["valuation_time_series", "market_segment_data", "report_content"],
    disableModelInvocation: false,
    contextMode: "rag",
    userInvocable: false,
    descriptionQualityScore: 91,
    knowledgeQueries: ["BB-P2 source attribution policy requirements", "Citation format by claim type: auction, economic, OEM, recall", "Common factual claim patterns in BB reports requiring citation", "Citation validation: how to verify claim matches source value"],
    yamlFrontmatter: "name: Source Citation Assembly Skill\nversion: \"1.0\"\nagent_code: BB-AGT-004\ndomain: content-reporting\nindustry: automotive\ntrust_tier: HIGH\ncontext_mode: rag\ncitation_coverage_target: 100pct_of_factual_claims\ncitation_validation: mandatory",
    markdownBody: "# Source Citation Assembly Skill\n\n## Citation Type Formats\n\n### Auction Data Citation\nFormat: [N transactions; [segment]; [date range]; Sources: [Manheim|Adesa|Independent]]\nExample: [14,234 transactions; Full-Size Pickup; March 24 - March 31, 2025; Sources: Manheim, Adesa]\n\n### Economic Indicator Citation\nFormat: [FRED: [Series_Code], [value], [date]]\nExample: [FRED: UMCSENT, 72.1, March 2025]\n\n### OEM Announcement Citation\nFormat: [OEM Announcement: [Manufacturer]; [incentive type]; [effective date]]\nExample: [OEM Announcement: GM; $3,000 cash rebate on Silverado 1500; effective March 1, 2025]\n\n### NHTSA Recall Citation\nFormat: [NHTSA Recall: [Campaign Number]; [affected models]; [recall date]]\n\n## Validation Process\n1. Extract all quantitative claims from narrative draft\n2. For each claim: locate corresponding source data record\n3. Verify: claim value matches source within rounding tolerance\n4. If mismatch: flag for regeneration; do not approve for publication\n5. Generate citation index: map from claim location to source record ID",
  },
  {
    organizationId: ORG,
    name: "Analyst Collaboration Skill",
    description: "Highlights sections requiring human analyst judgment (wide-confidence predictions, subjective commentary) in yellow. Tracks analyst edits by section and type (accept, modify, reject with reasoning). Learns from edit patterns over time to improve future draft quality. Manages review workflow: routes draft to assigned analyst with tracked-changes capability; handles revision cycles; produces final clean version for publication.",
    industry: "automotive",
    domain: "content-reporting",
    version: "1.0.0",
    author: "Black Book Editorial Team",
    trustTier: "HIGH",
    dependencies: [],
    tags: ["analyst-collaboration", "tracked-changes", "review-workflow", "edit-learning", "BB-AGT-004"],
    status: "active",
    complexity: "complex",
    allowedTools: ["retrieve_kb", "identify_judgment_required_sections", "highlight_for_analyst_review", "route_to_analyst", "track_analyst_edits", "classify_edit_type", "learn_from_edit_patterns", "generate_clean_final_version"],
    requiredMcpServers: ["blackbook-valuation-mcp"],
    requiredDataClassifications: ["report_content", "analyst_edit_data"],
    disableModelInvocation: false,
    contextMode: "rag",
    userInvocable: false,
    descriptionQualityScore: 90,
    knowledgeQueries: ["Criteria for analyst judgment highlighting: wide confidence intervals, subjective claims", "Analyst edit history: common modification patterns by section type", "Review workflow SLA: T-4h and T-2h deadline reminder triggers", "Clean final version generation: how to apply accepted edits and produce publication-ready draft"],
    yamlFrontmatter: "name: Analyst Collaboration Skill\nversion: \"1.0\"\nagent_code: BB-AGT-004\ndomain: content-reporting\nindustry: automotive\ntrust_tier: HIGH\ncontext_mode: rag\nauthor_voice: Black_Book_Editorial\njudgment_highlight_color: yellow\nanalyst_approval_required: true",
    markdownBody: "# Analyst Collaboration Skill\n\n## Judgment Highlighting Criteria\nHighlight in yellow when:\n- Prediction confidence interval spans >5 percentage points (e.g., 'values may move -2% to -8%')\n- Subjective editorial assessment without direct data backing\n- Claims that require insider knowledge of market conditions the agent may not have captured\n- Forward-looking statements beyond 4-week horizon\n- Any section where a missed signal from Market Shift Detector could make the claim incorrect\n\n## Edit Classification\n| Edit Type | Description | Learning Action |\n|---|---|---|\n| Accept | Analyst keeps draft unchanged | Positive signal; increase confidence for similar future claims |\n| Minor Modify | Analyst adjusts wording or adds nuance | Note pattern; improve phrasing in similar future sections |\n| Major Modify | Analyst substantially rewrites | Review source data adequacy; adjust narrative generation approach |\n| Reject | Analyst discards entire section | Flag as critical feedback; investigate root cause |\n\n## Review Timeline\n- Draft delivery: Monday morning by 09:00 ET\n- T-4 hours before publication deadline: reminder to analyst if not reviewed\n- T-2 hours before deadline: escalation reminder + VP Analytics copy\n- Emergency publication option: CEO override with explicit approval",
  },
  {
    organizationId: ORG,
    name: "Template Formatting Skill",
    description: "Formats reports in Black Book standard template structure with proper header, section sequencing, branding elements, and mandatory disclaimers. Applies FCRA compliance disclaimers when content could influence lending decisions. Formats for all distribution channels: PDF, email newsletter HTML, customer portal display, and API delivery. Produces channel-specific format variations from a single source document.",
    industry: "automotive",
    domain: "content-reporting",
    version: "1.0.0",
    author: "Black Book Editorial Team",
    trustTier: "MEDIUM",
    dependencies: [],
    tags: ["template-formatting", "report-structure", "FCRA-disclaimer", "multi-channel", "BB-AGT-004"],
    status: "active",
    complexity: "moderate",
    allowedTools: ["retrieve_kb", "apply_report_template", "insert_header_footer", "apply_branding_elements", "add_fcra_disclaimer", "format_for_pdf", "format_for_email_html", "format_for_portal", "format_for_api_delivery"],
    requiredMcpServers: ["blackbook-valuation-mcp"],
    requiredDataClassifications: ["report_content"],
    disableModelInvocation: false,
    contextMode: "rag",
    userInvocable: false,
    descriptionQualityScore: 85,
    knowledgeQueries: ["Black Book standard report template structure and section ordering", "FCRA disclaimer text and trigger conditions", "PDF formatting specifications for Wholesale Insights report", "Email newsletter HTML template specifications", "Customer portal display formatting requirements", "API delivery JSON structure for report content"],
    yamlFrontmatter: "name: Template Formatting Skill\nversion: \"1.0\"\nagent_code: BB-AGT-004\ndomain: content-reporting\nindustry: automotive\ntrust_tier: MEDIUM\ncontext_mode: rag\noutput_channels: [PDF, email_html, customer_portal, API_JSON]\nfcra_disclaimer: mandatory_when_lending_relevant",
    markdownBody: "# Template Formatting Skill\n\n## Report Template Structure\n\n### Wholesale Insights Report Sections (in order)\n1. Report Header: Week ending date, publication number, Black Book logo, confidentiality classification\n2. Executive Summary (1 page max): Top 3 market stories, overall market direction\n3. Market Summary: Broad market direction narrative with top movers table\n4. Segment Detail Articles: Ordered by newsworthiness score; each includes narrative + chart\n5. EV Market Update: Battery Adjusted Value section; charging infrastructure; incentive impacts\n6. Economic & Policy Outlook: FRED indicator summary; trade policy; seasonal outlook\n7. Data Tables Appendix: All segment values in tabular format\n8. Disclaimers: Standard Black Book data license; FCRA disclaimer if lending-relevant; copyright notice\n\n## FCRA Disclaimer Trigger\nInclude when report content: (1) references vehicle values used in auto loan underwriting, (2) discusses residual values for lease applications, (3) mentions total loss valuations for insurance claims.\n\nFCRA Disclaimer Text: 'This report contains market data that may be used in consumer credit decisions. Black Book maintains data quality procedures in compliance with the Fair Credit Reporting Act. For disputes or accuracy concerns, contact Black Book Compliance.'\n\n## Channel-Specific Requirements\n- PDF: Full template with all visual elements; embedded fonts; printer-ready margins\n- Email HTML: Responsive design; no embedded fonts; text-only fallback for alt-text\n- API JSON: Structured fields per API schema; no HTML; citations in structured array",
  },
];

const BB004_KB = {
  organizationId: ORG,
  name: "Black Book Narrative and Reporting Knowledge Base",
  description: "Reference for the Narrative Insight Generator covering Black Book editorial style guide, 52+ weeks of published Wholesale Insights reports, segment taxonomy, visualization standards, customer distribution specifications, and analyst feedback history.",
  industry: "automotive",
  domain: "content-reporting",
  retrievalConfig: { topK: 10, scoreThreshold: 0.65, rerankEnabled: true, citationMode: "full" },
  embeddingConfig: { model: "text-embedding-3-small", chunkSize: 512, chunkOverlap: 64 },
};

const BB004_KB_SOURCES = [
  {
    title: "Black Book Editorial Style Guide",
    content: "Black Book Editorial Standards for Wholesale Insights and Residual Values Insights Publications:\n\nVoice and Tone:\n- Authoritative: Write as if you are a senior market analyst explaining the week's data to a fellow professional\n- Data-led: Lead every section with the number; context follows\n- Calibrated: Confidence levels must match data certainty; use qualifiers ('may,' 'suggests,' 'indicates') for projections\n- Concise: Market summaries target 100-150 words; segment detail articles target 200-300 words\n\nTerminology Standards:\n- 'Wholesale value' not 'auction price' or 'dealer cost' (wholesale is the correct technical term)\n- 'Transaction volume' not 'sales volume' (sales implies retail)\n- 'Depreciation' for decline; 'appreciation' for increase (not 'drop' or 'surge')\n- 'Segment' not 'category' or 'class'\n- EV: Use 'battery electric vehicle (BEV)' on first reference; 'BEV' thereafter\n- Battery Adjusted Value (BAV): Black Book proprietary EV valuation metric; always use full term on first reference\n\nProhibited Language:\n- No OEM-specific promotional language ('impressive performance,' 'outstanding results')\n- No unqualified predictions ('values will fall' → 'values are expected to face pressure given...')\n- No jargon not defined in the segment taxonomy document\n- No reference to specific dealers, auction houses, or third-party brands in customer-facing content\n\nCitation Requirements:\n- Every quantitative claim must have a citation in the format documented in the Source Citation Assembly Skill\n- Projections must cite the model or signals used as basis\n- Regulatory references must cite the specific regulation and section",
  },
  {
    title: "Published Wholesale Insights Archive — Sample Report Structure",
    content: "Wholesale Insights Weekly Report — Representative Structure and Content Standards:\n\nSample Header:\nBlack Book Wholesale Insights | Week Ending [Date] | Issue #[N] | CONFIDENTIAL — Subscriber Use Only\n\nSample Executive Summary (verbatim style example):\n'This week's wholesale market reflected continued softening in full-size pickup truck segment values, with average wholesale prices declining 2.3% week-over-week, the fourth consecutive weekly decline. The decline was driven by normalization following the end of the Q4 incentive cycle and seasonally reduced commercial demand. In contrast, compact crossover values showed modest appreciation of 0.8%, supported by sustained consumer demand and lean dealer inventory. EV segment values remained stable overall, though BEV wholesale values showed early signs of stabilization following five weeks of accelerated depreciation. [Total: 96 words]'\n\nSample Segment Detail Article (Full-Size Pickup):\n'Full-size pickup truck wholesale values declined 2.3% this week to an average of $38,420, the fourth consecutive weekly decline totaling 7.8% from the January peak. The decline reflects seasonal demand normalization following elevated Q4 commercial purchasing and the end of manufacturer incentive programs that had supported values through December. Transaction volume remained healthy at 14,234 units across Manheim and Adesa [citation: 14,234 transactions; Full-Size Pickup; March 24-31, 2025], suggesting the decline reflects pricing normalization rather than demand deterioration. Looking ahead, any tariff-related supply disruption could provide support; however, base-case outlook anticipates continued modest depreciation of 1-2% per week through mid-April barring new developments. Analysts note elevated inventory at commercial dealer groups as a potential headwind. [212 words]'\n\nReport Sections and Target Word Counts:\n- Executive Summary: 100-150 words\n- Market Summary article: 200-250 words\n- Per-segment detail article: 150-250 words (12-14 segments)\n- EV Market Update: 200-300 words\n- Economic and Policy Outlook: 150-200 words\n- Total report body: approximately 2,500-3,500 words",
  },
  {
    title: "Vehicle Segment Taxonomy and Naming Conventions",
    content: "Official Black Book Vehicle Segment Taxonomy (Use Exactly as Specified):\n\nPassenger Car Segments:\n- Compact Car (formerly 'Subcompact' and 'Compact' merged in 2022)\n- Mid-Size Car\n- Full-Size Car\n- Sports/Performance Car\n\nLight Truck / SUV Segments:\n- Compact Crossover SUV\n- Mid-Size SUV (2-row)\n- Mid-Size SUV (3-row)\n- Full-Size SUV\n- Full-Size Pickup Truck (includes half-ton, three-quarter ton, one-ton where noted)\n- Mid-Size Pickup Truck\n- Minivan\n- Commercial Van\n\nAlternative Powertrain Segments (separate tracking):\n- Battery Electric Vehicle (BEV) — all segments combined with sub-segment breakouts\n- Plug-In Hybrid Electric Vehicle (PHEV)\n- Hybrid Electric Vehicle (HEV) — excludes PHEV\n\nSpecialty:\n- Luxury Car (MSRP > $50K; includes sedan and coupe)\n- Luxury SUV (MSRP > $50K; crossover and full-size)\n\nNaming Rules:\n- Always use the full taxonomy name on first reference in a section\n- After first reference, short form is acceptable: 'Full-Size Pickup' not 'pickup' or 'truck'\n- Never create new segment names or combine segments without editorial director approval\n- EV breakdown: 'BEV segment' is acceptable short form after first reference",
  },
  {
    title: "Visualization Standards and Black Book Brand Guide",
    content: "Black Book Data Visualization Standards for Wholesale Insights Reports:\n\nColor Palette:\n- Primary BB Blue: #002B5E (RGB: 0, 43, 94) — used for headers, primary chart lines, call-out boxes\n- Secondary Blue: #005B99 (RGB: 0, 91, 153) — used for secondary data series\n- Accent Gold: #C8952B (RGB: 200, 149, 43) — used for highlights and special callouts\n- Positive Green: #2E7D32 (RGB: 46, 125, 50) — used for appreciation trend indicators\n- Negative Red: #C62828 (RGB: 198, 40, 40) — used for depreciation trend indicators\n- Neutral Gray: #757575 (RGB: 117, 117, 117) — used for reference lines and secondary data\n\nChart Formatting Standards:\n- Font: Source Sans Pro (primary); fallback: Arial\n- Title font size: 11pt bold\n- Axis label font size: 9pt regular\n- Data label font size: 8pt regular\n- Minimum resolution for PDF: 300 DPI\n\nTrend Line Charts (13-week):\n- X-axis: Weekly dates, format 'MMM DD' (e.g., 'Mar 31')\n- Y-axis: Dollar values, formatted as '$XX,XXX'\n- Grid lines: Light gray, 0.5pt\n- Data points: Filled circles, 4pt diameter\n- Missing data: Dashed line; include note 'Data unavailable for [date]'\n\nHeat Map:\n- Rows: Segment names (bold, left-aligned)\n- Columns: 8 weeks, week-ending dates\n- Color scale: -5% or below = #C62828; 0% = white; +5% or above = #2E7D32\n- Cell values: Percentage change with one decimal\n\nData Table Format (appendix):\n- Columns: Segment | Current Week Avg | Prior Week Avg | W/W Change $ | W/W Change % | 4-Week Avg | 13-Week Avg\n- Sorted by: Segment taxonomy order\n- Grand total row: Not applicable (averages not meaningful across segments)",
  },
  {
    title: "Customer Distribution Lists and Channel Specifications",
    content: "Black Book Wholesale Insights Distribution Channels and Specifications:\n\nDistribution Channel Types:\n1. Email Newsletter (primary distribution)\n   - Format: HTML email, responsive design, Black Book template\n   - Delivery: Friday by 12:00 PM ET\n   - Subscriber list: ~15,000 financial institution, dealer, and insurance subscribers\n   - Opt-out compliance: CAN-SPAM compliant unsubscribe in every email\n\n2. Customer Portal (self-service access)\n   - Format: HTML display with embedded charts\n   - Update schedule: Concurrent with email delivery\n   - Access control: Subscriber login required; track access for engagement analytics\n   - PDF download: Available for all portal subscribers\n\n3. API Delivery (premium subscribers)\n   - Format: JSON payload per documented API schema\n   - Delivery: Webhook push + GET endpoint\n   - Data fields: reportId, weekEnding, segments array with all metrics, citations array, narrativeBySection\n   - Authentication: OAuth 2.0 with subscriber-specific credentials\n   - SLA: Available within 30 minutes of analyst approval\n\n4. PDF Report (archival and premium)\n   - Format: Full PDF with all visual elements\n   - Used for: internal distribution, regulatory archive, premium subscriber packages\n\nPremium Client Customization:\n- Certain premium subscribers receive segment-specific deep-dive reports\n- Customization scope: additional segment analysis, custom comparisons; standard editorial voice maintained\n- Analyst review required for all customized content",
  },
  {
    title: "Analyst Feedback History and Edit Pattern Analysis",
    content: "Black Book Analyst Edit Pattern Analysis for Narrative Insight Generator Training:\n\nEdit Rate Summary (52-week trailing):\n- Overall section acceptance rate (no edit): 67%\n- Minor modification rate: 24%\n- Major modification rate: 7%\n- Section rejection rate: 2%\n- Target: acceptance rate >= 85% with minor or no edits (combined 91%)\n\nCommon Minor Modification Patterns:\n- Forward-looking statements: Analysts frequently soften language from 'expected to' to 'likely to face pressure from' — update narrative templates to use softer qualifiers as default\n- EV section specificity: Analysts add specific battery pack size or range references when discussing BEV depreciation — include EV technical specifications in generation context\n- Citation precision: Analysts sometimes add transaction date ranges that agent omitted — always specify date range in auction citations\n\nCommon Major Modification Patterns:\n- Segment narrative too similar to prior week: When week-over-week change is <0.5%, agents sometimes produce nearly identical narratives; analysts rewrite for novelty — flag low-change segments for manual attention\n- Missed market context: Agent occasionally misses a key external event that analysts add in their edit — improve cross-reference with Market Shift Detector outputs\n\nRejection Root Causes (top 2):\n- Contradictory statements between sections (7 cases): Market Summary says depreciation while segment article says appreciation — add cross-section consistency check before routing to analyst\n- Factual inaccuracy (3 cases): Citation mismatch with source data — citation validation must be mandatory before routing\n\nQuality Improvement Actions Taken:\n- Added consistency check skill to cross-reference Market Summary with segment articles\n- Made citation validation mandatory gate before analyst routing\n- Widened EV context retrieval to include battery technology references",
  },
];

const BB004_RUNBOOKS = [
  {
    organizationId: ORG,
    name: "BB-004-RB-01: Analyst Rejects Entire Report Section",
    trigger: "Analyst selects 'Reject' disposition for any full report section",
    steps: [
      "Capture rejection reason from analyst (mandatory field in review interface)",
      "Classify rejection cause: data quality (wrong data), narrative quality (poor writing), factual inaccuracy (citation mismatch), or subjective disagreement (matters of editorial judgment)",
      "If data quality: cross-reference source data; identify where incorrect data entered the narrative pipeline; regenerate section with corrected data",
      "If narrative quality: analyze vs editorial style guide; identify deviation from BB voice standards; regenerate applying stricter editorial guidelines",
      "If factual inaccuracy: run citation validation audit on all sections (not just rejected); hold other sections pending validation completion",
      "If subjective: flag for editorial director review; this type of rejection feeds into narrative model calibration",
      "Regenerate rejected section; route back to same analyst with change log showing what was modified",
      "If second rejection of same section: escalate to editorial director for manual redraft",
      "Log rejection reason and resolution in analyst feedback database for training"
    ],
    escalationPath: "Editorial Director review if second rejection → VP Analytics if factual inaccuracy affects published sections",
    outputFormat: "Rejection analysis: cause classification, correction applied, regenerated section, change log",
    complianceTags: ["BB-P2-Source-Attribution", "BB-P1-Valuation-Integrity", "FCRA"],
    retryPolicy: { maxRetries: 2, intervalSec: 1800 },
    timeoutSec: 14400,
    tags: ["section-rejection", "quality-control", "BB-AGT-004"],
  },
  {
    organizationId: ORG,
    name: "BB-004-RB-02: Publication Deadline Pressure Management",
    trigger: "Report not approved by T-4 hours before publication deadline OR analyst requests expedited review",
    steps: [
      "Check current report status: sections remaining for review, analyst availability, outstanding revisions",
      "Send T-4 hour reminder to assigned analyst: specific sections needing review, deadline time, escalation path",
      "If T-2 hours and still not approved: send second reminder and copy VP Analytics",
      "Assess if any sections are already approved: can approved sections be published while outstanding sections are resolved?",
      "If analyst unavailable: escalate to backup analyst designated for weekly report coverage",
      "If no analyst available and publication critical: route to editorial director for emergency review",
      "Document emergency review circumstances in audit log",
      "For customer-specific premium reports: same deadline management applies; notify account manager if deadline at risk"
    ],
    escalationPath: "VP Analytics at T-2 hours → Editorial Director for emergency publication authorization",
    outputFormat: "Deadline status report: review completion status, escalation actions taken, publication timeline",
    complianceTags: ["SOC2-TypeII"],
    retryPolicy: { maxRetries: 0, manualEscalation: true },
    timeoutSec: 14400,
    tags: ["deadline-management", "publication-workflow", "BB-AGT-004"],
  },
  {
    organizationId: ORG,
    name: "BB-004-RB-03: Contradictory Data Detection and Reconciliation",
    trigger: "Pre-publication cross-section consistency check detects contradictory claims across report sections",
    steps: [
      "Identify the specific contradiction: section A says [X], section B says [Y] about same segment or metric",
      "Determine which section's claim is correct: cross-reference both against source data in resolution ledger",
      "Identify the root cause: data timing mismatch (different data vintage), calculation error, or narrative ambiguity",
      "Correct the incorrect section: regenerate with accurate data; update citation to match",
      "Re-run consistency check on corrected report before routing to analyst",
      "If same data produces contradictory conclusions (e.g., same price movement, different interpretations): flag for analyst to resolve the interpretation conflict",
      "Document contradiction and resolution in audit log",
      "Analyze if this contradiction pattern is recurrent: if so, add check to narrative generation pipeline"
    ],
    escalationPath: "Auto-resolve (data correction) or analyst judgment (interpretation conflict) → Editorial Director if resolution affects published sections",
    outputFormat: "Contradiction report: sections in conflict, root cause, correction applied, consistency re-check result",
    complianceTags: ["BB-P2-Source-Attribution", "SOC2-TypeII"],
    retryPolicy: { maxRetries: 2, intervalSec: 900 },
    timeoutSec: 7200,
    tags: ["contradiction-detection", "data-consistency", "BB-AGT-004"],
  },
  {
    organizationId: ORG,
    name: "BB-004-RB-04: Visualization Generation Failure",
    trigger: "Chart generation service returns error or produces chart with data-visualization mismatch",
    steps: [
      "Detect failure: chart generation service error OR data point in chart does not match narrative claim",
      "Classify failure type: service outage, data format error, data-visualization mismatch",
      "For service outage: fallback immediately to formatted data table using same source data",
      "For data format error: attempt regeneration with corrected data format once; fallback to table on second failure",
      "For data-visualization mismatch: do not publish the mismatched chart; investigate source of discrepancy",
      "Substitute data table for failed chart with note: 'Visualization temporarily unavailable; data table included'",
      "Never publish without presenting the underlying data in some form (chart OR table)",
      "Notify visualization service team of failure with error details",
      "If service recovered before publication: attempt regeneration; replace table with chart if successful"
    ],
    escalationPath: "Visualization service team notification → Editorial Director if all charts fail for a report",
    outputFormat: "Visualization failure log: chart type, failure cause, fallback applied, service notification sent",
    complianceTags: ["SOC2-TypeII"],
    retryPolicy: { maxRetries: 1, intervalSec: 300 },
    timeoutSec: 3600,
    tags: ["chart-generation", "fallback-table", "BB-AGT-004"],
  },
  {
    organizationId: ORG,
    name: "BB-004-RB-05: Customer-Specific Report Request",
    trigger: "Premium subscriber requests customized segment analysis or additional report detail",
    steps: [
      "Receive request from account management team: subscriber name, requested customization, delivery deadline",
      "Assess customization scope: additional segment depth vs new segment not in standard report vs custom comparison",
      "If within standard capability (additional depth for a covered segment): generate supplemental section",
      "If new segment or comparison not in standard report: assess data availability; if available, generate; if not, notify account manager",
      "Apply same editorial standards and citation requirements as standard report",
      "Route supplemental content to assigned analyst for review (same Confirm Before requirement applies)",
      "Deliver approved content via account manager to subscriber; log delivery in distribution system",
      "Document customization for capability tracking: what customizations are most frequently requested?"
    ],
    escalationPath: "Account Manager coordinates delivery → Editorial Director if customization outside standard capability",
    outputFormat: "Custom report supplement with same formatting, citation, and editorial standards as standard report",
    complianceTags: ["BB-P2-Source-Attribution", "FCRA", "SOC2-TypeII"],
    retryPolicy: { maxRetries: 0, manualEscalation: false },
    timeoutSec: 86400,
    tags: ["custom-report", "premium-subscriber", "BB-AGT-004"],
  },
  {
    organizationId: ORG,
    name: "BB-004-RB-06: FCRA Compliance Check for Lending-Relevant Content",
    trigger: "Report content includes vehicle values used in loan underwriting, lease residuals, or insurance total loss calculations",
    steps: [
      "Detect FCRA trigger: scan report content for: auto loan valuation references, residual value content for lease programs, total loss valuation references",
      "If trigger detected: add mandatory FCRA disclaimer to report before analyst review routing",
      "Verify all valuation data used in lending-relevant sections passed through BB-AGT-001 quality screening",
      "Confirm citation includes accuracy statement: values are derived from [N] transactions with anomaly screening applied",
      "If any valuation in the section has outstanding quality flags (not yet cleared by BB-AGT-001): quarantine that section; replace with placeholder pending data clearance",
      "Document FCRA compliance check in audit log with trigger conditions, disclaimer applied, and data quality confirmation"
    ],
    escalationPath: "Compliance team if novel FCRA applicability question → Legal if content reaches threshold for regulatory reporting",
    outputFormat: "FCRA compliance record: trigger conditions, disclaimer applied, data quality confirmation, audit entry",
    complianceTags: ["FCRA", "SOC2-TypeII", "BB-P2-Source-Attribution"],
    retryPolicy: { maxRetries: 0, manualEscalation: false },
    timeoutSec: 3600,
    tags: ["FCRA-compliance", "lending-relevant", "disclaimer", "BB-AGT-004"],
  },
];

const BB004_POLICIES = [
  {
    organizationId: ORG,
    name: "Confirm Before Autonomy — Analyst Approval Required Before Publication",
    description: "BB-AGT-004 operates under Confirm Before autonomy. No report or content section may be published to any external channel without explicit analyst approval. This policy cannot be elevated to Auto autonomy. Analyst approval is non-negotiable regardless of deadline pressure.",
    domain: "tool_permissions",
    status: "active",
    policyType: "safety",
    policyJson: {
      enforcement: "block",
      rule: "Agent may draft reports, route for review, and apply approved edits. Agent may NEVER trigger publication to email, portal, API, or PDF delivery without confirmed analyst approval status = approved. Emergency CEO override requires VP Analytics co-authorization and is logged as an exception.",
      allowedActions: ["draft_report", "route_for_review", "apply_approved_edits", "generate_final_version"],
      blockedActions: ["publish_to_email", "publish_to_portal", "deliver_via_api", "generate_pdf_for_distribution"],
      requiresApproval: ["analyst_approval"],
      emergencyOverride: { requiresCoAuth: ["VP_Analytics"], auditLog: "mandatory" },
    },
    scopeType: "agent",
    agentCode: "BB-AGT-004",
    complianceTags: ["BB-Confirm-Before", "SOC2-TypeII"],
  },
  {
    organizationId: ORG,
    name: "BB-P2 Source Attribution — 100% Citation Coverage in Published Reports",
    description: "Every factual claim in published Black Book reports must be backed by a verifiable source citation. Reports with missing citations must be held in draft state until citations are complete. Citation validation is a mandatory gate before analyst review routing.",
    domain: "audit",
    status: "active",
    policyType: "audit",
    policyJson: {
      enforcement: "block",
      rule: "Before routing any report section for analyst review: (1) citation validation must complete with 100% coverage of factual claims, (2) all citations must be internally consistent with source data, (3) any claim with unresolvable citation must be removed or flagged as unverified. Reports with incomplete citations are held in draft.",
      citationCoverageRequired: 1.0,
      validationGate: "mandatory_before_analyst_routing",
      unverifiableClaimAction: "remove_or_flag",
    },
    scopeType: "agent",
    agentCode: "BB-AGT-004",
    complianceTags: ["BB-P2", "SOC2-TypeII"],
  },
  {
    organizationId: ORG,
    name: "FCRA Accuracy and Disclaimer Requirements",
    description: "When BB-AGT-004 generates content that references vehicle valuations used in consumer credit decisions, FCRA-compliant disclaimers must be automatically applied and the data quality certification for that content must be confirmed before publication.",
    domain: "compliance",
    status: "active",
    policyType: "compliance",
    policyJson: {
      enforcement: "block",
      rule: "Any report section referencing valuation data used in auto loan underwriting, lease residuals, or insurance total loss must: (1) include the mandatory FCRA disclaimer, (2) confirm all referenced valuations passed BB-AGT-001 quality screening with no outstanding anomaly flags. Publication blocked if either condition unmet.",
      fcraDisclaimerRequired: true,
      dataQualityCertificationRequired: true,
      auditRetentionYears: 7,
    },
    scopeType: "agent",
    agentCode: "BB-AGT-004",
    complianceTags: ["FCRA", "SOC2-TypeII"],
  },
  {
    organizationId: ORG,
    name: "Editorial Objectivity — No Promotional Language or OEM Favoritism",
    description: "All Black Book report content must maintain strict editorial objectivity. Promotional language favoring any OEM, dealer group, or market participant is prohibited. Content must be backed by data and framed as market observation, not recommendation.",
    domain: "data_handling",
    status: "active",
    policyType: "safety",
    policyJson: {
      enforcement: "warn",
      rule: "Before routing for analyst review: scan all narrative content for: (1) superlative language without citation, (2) OEM-specific promotional phrases, (3) market recommendations disguised as observations. Flag any violation for regeneration. Report must be framed as market data observation, not investment, purchasing, or pricing advice.",
      prohibitedPatterns: ["promotional_superlatives", "OEM_favoritism", "unqualified_market_recommendation"],
      flagForRegeneration: true,
    },
    scopeType: "agent",
    agentCode: "BB-AGT-004",
    complianceTags: ["BB-P1", "BB-P2", "Editorial-Standards"],
  },
  {
    organizationId: ORG,
    name: "Copyright and IP Protection — Generated Content is Black Book IP",
    description: "All content generated by BB-AGT-004 for Black Book publications is Black Book intellectual property. Distribution is restricted to authorized subscribers. Content must not be redistributed by subscribers beyond the licensed use defined in their subscription agreement.",
    domain: "data_handling",
    status: "active",
    policyType: "data_governance",
    policyJson: {
      enforcement: "warn",
      rule: "All generated report content must include copyright notice: Copyright [Year] Black Book, a Hearst Company. All rights reserved. Subscriber distribution rights are limited to internal use within the subscribing organization. Reproduction, redistribution, or resale of content requires written permission from Black Book.",
      copyrightNoticeRequired: true,
      distributionScope: "authorized_subscribers_internal_use_only",
      redistributionApproval: "written_permission_required",
    },
    scopeType: "agent",
    agentCode: "BB-AGT-004",
    complianceTags: ["Copyright-IP", "SOC2-TypeII"],
  },
];

const BB004_AGENT = {
  organizationId: ORG,
  name: "Narrative Insight Generator",
  description: "Synthesizes outputs from BB-AGT-001 (Data Quality), BB-AGT-002 (Market Shifts), and BB-AGT-003 (Competitive Intelligence) into Black Book weekly Wholesale Insights and Residual Values Insights reports. Generates data-backed market commentary per vehicle segment with citations, transforms 8-12 analyst writing hours into 3-minute draft generation. Operates under Confirm Before autonomy — analyst must review and approve before any publication. Every factual claim backed by verifiable source citations per BB-P2 policy.",
  department: "Content & Reporting",
  agentCode: "BB-AGT-004",
  autonomyMode: "assisted",
  riskTier: "MEDIUM",
  industry: "automotive",
  status: "active",
  healthScore: 95,
  requiresHumanApproval: true,
  taskInstructions: "You are the Narrative Insight Generator for Black Book vehicle valuation publications. Your output is the weekly Wholesale Insights and Residual Values Insights reports distributed to 15,000+ industry subscribers.\n\nWeekly report generation cycle:\n1. Aggregate weekly data from all upstream agents: BB-AGT-001 (quality flags and cleaned data), BB-AGT-002 (market shift alerts), BB-AGT-003 (competitive intelligence)\n2. Rank segments by newsworthiness score\n3. Generate Market Summary section: overall direction, top movers, key drivers\n4. Generate per-segment analysis for all segments: price trend, volume, outlook, risk flags\n5. Generate EV Market Update section with Battery Adjusted Value trends\n6. Generate Economic and Policy Outlook section\n7. Generate all supporting visualizations; validate data-visualization alignment\n8. Attach source citations to every factual claim (100% coverage required)\n9. Highlight sections needing analyst judgment in yellow\n10. Run cross-section consistency check (no contradictions)\n11. Run FCRA trigger scan; apply disclaimer if needed\n12. Apply Black Book standard template formatting\n13. Route to analyst for review with tracked changes\n14. Upon analyst approval: format for all distribution channels (PDF, email, portal, API)\n\nAbsolute rules:\n- NEVER publish without explicit analyst approval (Confirm Before — no exceptions)\n- NEVER include uncited factual claims in any routed draft\n- NEVER include data-visualization mismatches in any report\n- ALWAYS run consistency check before analyst routing\n- ALWAYS run FCRA scan before analyst routing",
  toolsConfig: {
    allowedTools: [
      "retrieve_kb", "fetch_segment_weekly_data", "fetch_market_shift_alerts", "fetch_competitive_intelligence",
      "compose_segment_narrative", "apply_editorial_style_guide", "attach_citations",
      "highlight_analyst_judgment_sections", "compute_price_movement_magnitude", "assess_customer_revenue_impact",
      "compute_novelty_score", "rank_segments_by_newsworthiness", "generate_trend_line_chart",
      "generate_heat_map", "generate_waterfall_chart", "generate_comparison_table",
      "validate_data_visualization_alignment", "apply_bb_brand_formatting", "extract_factual_claims",
      "match_claim_to_source", "format_citation", "validate_citation_consistency", "generate_citation_index",
      "identify_judgment_required_sections", "route_to_analyst", "track_analyst_edits",
      "classify_edit_type", "generate_clean_final_version", "apply_report_template",
      "add_fcra_disclaimer", "format_for_pdf", "format_for_email_html", "format_for_portal",
      "format_for_api_delivery", "check_cross_section_consistency",
    ],
    mcpServers: [
      "blackbook-valuation-mcp", "market-data-mcp", "economic-data-mcp", "visualization-mcp",
    ],
  },
  complianceTags: ["BB-P1", "BB-P2", "FCRA", "SOC2-TypeII", "Copyright-IP", "Editorial-Standards", "CAN-SPAM"],
  maxToolIterations: 25,
  outputSchema: {
    type: "weekly_report",
    fields: ["reportId", "weekEnding", "status", "sections", "citations", "visualizations", "analystEdits", "publicationChannels"],
  },
};

const BB004_GOLDEN_DATASET = {
  organizationId: ORG,
  name: "BB-AGT-004 Narrative Insight Generator Evaluation Dataset",
  description: "52 weeks of published Wholesale Insights reports with tracked analyst edits for training data. Tests content quality, citation accuracy, visualization alignment, FCRA compliance, and editorial voice conformance.",
  industry: "automotive",
  domain: "content-reporting",
  version: "1.0",
  useCase: "Narrative Report Generation",
  agentCode: "BB-AGT-004",
  tags: ["narrative-generation", "report-quality", "citation-accuracy", "editorial-voice", "BB-AGT-004"],
};

const BB004_TEST_CASES = [
  {
    name: "Segment Narrative Generation — Full-Size Pickup with Citation",
    description: "Generate segment narrative for Full-Size Pickup: wholesale down 2.3%, 14,234 transactions, seasonal demand normalization driver. Narrative must be in BB voice, 150-250 words, with complete auction data citation.",
    input: { segment: "full_size_pickup", weeklyChangePct: -2.3, transactions: 14234, dateRange: "March 24-31 2025", sources: ["Manheim", "Adesa"], primaryDriver: "seasonal demand normalization", priorWeekChangePct: -1.9, outlook: "continued modest depreciation 1-2pct/week through mid-April" },
    expectedOutput: { narrativeWordCount: { min: 150, max: 250 }, citationPresent: true, citationMatchesSourceData: true, bbVoiceConformant: true, promotionalLanguage: false },
    metrics: { wordCount: "narrative_150_to_250_words", citationPresent: "auction_citation_included", voiceConformance: "no_prohibited_language_detected" },
    tags: ["narrative-generation", "pickup-truck", "citation", "BB-AGT-004"],
  },
  {
    name: "Citation Validation — Blocks Report with Uncited Claim",
    description: "Report draft contains a claim 'transaction volume increased 15%' without any citation. Citation validation gate must block routing to analyst until citation is resolved.",
    input: { reportSectionDraft: "Full-Size Pickup transaction volume increased 15% this week, indicating strong demand.", uncitedClaims: 1, citationValidationResult: "fail" },
    expectedOutput: { reportRouted: false, blockReason: "uncited_factual_claim", sectionHeld: true, analystNotNotified: true },
    metrics: { blockExecuted: "report_not_routed_to_analyst", holdApplied: "section_in_draft_state" },
    tags: ["citation-validation", "quality-gate", "BB-AGT-004"],
  },
  {
    name: "Publication Block — No Analyst Approval",
    description: "Attempt to trigger publication workflow for approved draft. Analyst status = 'pending_review' (not approved). Publication must be blocked.",
    input: { reportId: "WI-2025-015", analystApprovalStatus: "pending_review", publicationChannels: ["email", "portal", "api"] },
    expectedOutput: { publicationTriggered: false, blockReason: "analyst_approval_required", channelsNotified: false, statusRemains: "pending_review" },
    metrics: { publicationBlocked: "no_channel_delivery_triggered", policyEnforced: "confirm_before_policy_applied" },
    tags: ["publication-block", "confirm-before", "analyst-approval", "BB-AGT-004"],
  },
  {
    name: "Data-Visualization Mismatch Detection",
    description: "Chart shows Full-Size Pickup average wholesale at $38,420. Narrative states $38,840. System must detect mismatch and block chart publication, regenerating from source data.",
    input: { chartDataPoint: { segment: "full_size_pickup", value: 38420 }, narrativeClaim: { segment: "full_size_pickup", value: 38840 }, sourceDataValue: 38420 },
    expectedOutput: { mismatchDetected: true, chartPublicationBlocked: true, narrativeCorrectedTo: 38420, regenerationTriggered: true },
    metrics: { mismatchDetected: "data_viz_mismatch_caught", correctionApplied: "narrative_updated_to_match_source", zeroMismatchTolerance: "no_mismatches_in_published_output" },
    tags: ["visualization-mismatch", "data-accuracy", "BB-AGT-004"],
  },
  {
    name: "FCRA Compliance Trigger and Disclaimer Application",
    description: "Report section references vehicle wholesale values used by auto lenders for loan underwriting. FCRA scan should detect trigger and apply mandatory disclaimer before routing to analyst.",
    input: { sectionContent: "These wholesale values are commonly referenced by auto lenders when assessing loan-to-value ratios for vehicle-secured loans.", fcraKeywords: ["auto lenders", "loan-to-value", "vehicle-secured loans"], dataQualityCleared: true },
    expectedOutput: { fcraTriggered: true, disclaimerApplied: true, disclaimerText_contains: "Fair Credit Reporting Act", sectionHeldUntilDisclaimer: true },
    metrics: { fcraDetected: "FCRA_trigger_identified", disclaimerApplied: "mandatory_disclaimer_inserted", routingConditional: "only_routed_after_disclaimer_applied" },
    tags: ["FCRA-compliance", "disclaimer", "lending-content", "BB-AGT-004"],
  },
  {
    name: "Cross-Section Consistency Check — Contradiction Detection",
    description: "Market Summary says 'EV segment appreciated this week.' EV segment detail article says 'BEV wholesale values declined 1.8%.' Cross-section check must detect contradiction and hold report.",
    input: { marketSummaryText: "EV segment appreciated this week driven by policy support", evDetailText: "Battery electric vehicle wholesale values declined 1.8% this week to $34,200", sourceEVData: { weeklyChangePct: -1.8 } },
    expectedOutput: { contradictionDetected: true, reportHeld: true, contradictingSections: ["market_summary", "ev_detail"], rootCause: "market_summary_incorrect", correctionRequired: "market_summary" },
    metrics: { contradictionCaught: "inconsistency_detected_before_analyst_routing", reportHeld: "draft_not_routed_with_contradiction", rootCaused: "incorrect_section_identified" },
    tags: ["consistency-check", "contradiction-detection", "EV-segment", "BB-AGT-004"],
  },
];

const BB004_EVAL = {
  organizationId: ORG,
  name: "BB-AGT-004 Narrative Insight Generator Evaluation Suite",
  type: "accuracy",
  thresholdConfig: {
    analystAcceptanceRate: 0.85,
    citationAccuracyRate: 1.0,
    visualizationAccuracyRate: 1.0,
    fcraComplianceRate: 1.0,
    publicationBlockRate: 1.0,
    overallPassRate: 0.88,
  },
  scorerConfig: {
    primary: "content_quality_analyst_acceptance",
    secondary: "citation_and_compliance_audit",
    rubric: "rubricScoring",
    citationValidationCheck: true,
    fcraComplianceCheck: true,
    vizAlignmentCheck: true,
    publicationGateCheck: true,
    editorialVoiceCheck: true,
  },
  coverageTags: ["narrative-generation", "citation-validation", "publication-gate", "data-viz-alignment", "FCRA-compliance", "cross-section-consistency", "analyst-collaboration", "deadline-management"],
  schedule: "weekly:Friday:06:00 UTC",
  industry: "automotive",
};

const BB004_OUTCOME = {
  outcome: {
    organizationId: ORG,
    name: "Narrative Insight Generator — Outcome Contract",
    description: "Business objectives and KPIs governing BB-AGT-004. Targets analyst acceptance rate >=85% with minor or no edits, 100% citation accuracy, zero data-visualization mismatches, 85% time savings (from 8-12 hours to 1-2 hours analyst review time), and 100% Confirm Before compliance.",
    version: 1,
    status: "active",
    riskTier: "MEDIUM",
    pricingModel: "PER_OUTCOME_EVENT",
    pricePerUnit: 0,
    approvalGates: ["analyst_approval_required", "editorial_director_sign_off"],
    riskThreshold: 0.85,
    maxDriftPercent: 10,
    slaConfig: {
      draftDeliveryHour: "Monday 09:00 ET",
      analystReviewWindowHours: 48,
      publicationDeadlineDay: "Friday 12:00 ET",
    },
  },
  kpis: [
    { name: "Analyst Acceptance Rate", target: 85, unit: "%", measurement: "Percentage of report sections accepted by analysts with no edit or only minor edits, rolling 4-week", baseline: 67, slaThreshold: 75, weight: 1.5 },
    { name: "Citation Accuracy Rate", target: 100, unit: "%", measurement: "Percentage of published reports with 100% factual claims correctly cited and validated against source data", baseline: 89, slaThreshold: 98, weight: 1.5 },
    { name: "Visualization Accuracy Rate", target: 100, unit: "%", measurement: "Percentage of published reports with zero data-visualization mismatches (automated and analyst validation)", baseline: 95, slaThreshold: 99, weight: 1.3 },
    { name: "Analyst Time Savings", target: 85, unit: "%", measurement: "Percentage reduction in analyst time from drafting to final approval: target 1-2 hours vs 8-12 hours baseline", baseline: 0, slaThreshold: 70, weight: 1.2 },
    { name: "Publication Deadline Compliance", target: 100, unit: "%", measurement: "Percentage of weekly reports published by Friday 12:00 PM ET deadline", baseline: 94, slaThreshold: 97, weight: 1.0 },
  ],
};

// ══════════════════════════════════════════════════════════════════════════════
//  MAIN — CREATE ALL 4 AGENTS
// ══════════════════════════════════════════════════════════════════════════════

async function createAgent(agentData, skillIds, policyIds) {
  const agentPayload = {
    ...agentData,
    preloadedSkills: skillIds.map((skillId, i) => ({ skillId, loadOrder: i })),
    policyBindings: policyIds,
  };
  return post("/api/agents", agentPayload);
}

async function main() {
  console.log("\n══════════════════════════════════════════════════════════════");
  console.log("  Hearst Black Book — 4-Agent Creation Script");
  console.log("  BB-AGT-001 / BB-AGT-002 / BB-AGT-003 / BB-AGT-004");
  console.log("══════════════════════════════════════════════════════════════\n");

  const ids = {
    bb001: { skillIds: [], kbId: null, runbookIds: [], policyIds: [], agentId: null, goldenDatasetId: null, testCaseIds: [], evalSuiteId: null, outcomeId: null },
    bb002: { skillIds: [], kbId: null, runbookIds: [], policyIds: [], agentId: null, goldenDatasetId: null, testCaseIds: [], evalSuiteId: null, outcomeId: null },
    bb003: { skillIds: [], kbId: null, runbookIds: [], policyIds: [], agentId: null, goldenDatasetId: null, testCaseIds: [], evalSuiteId: null, outcomeId: null },
    bb004: { skillIds: [], kbId: null, runbookIds: [], policyIds: [], agentId: null, goldenDatasetId: null, testCaseIds: [], evalSuiteId: null, outcomeId: null },
  };

  // ──────────────────────────────────────────────────────────────────────────
  // BB-AGT-001 CREATION
  // ──────────────────────────────────────────────────────────────────────────
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  BB-AGT-001: Auction Data Quality Sentinel");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  step("1.1", "13", "BB-AGT-001 — Creating 6 skills");
  for (const skill of BB001_SKILLS) {
    try {
      const res = await post("/api/skills", skill);
      ids.bb001.skillIds.push(res.id);
      log(`Skill: ${skill.name} → ${res.id}`);
    } catch (e) { warn(`Skill FAILED: ${skill.name} — ${e.message.slice(0, 80)}`); }
  }

  step("1.2", "13", "BB-AGT-001 — Creating knowledge base");
  const kb001 = await post("/api/knowledge-bases", BB001_KB);
  ids.bb001.kbId = kb001.id;
  log(`KB: ${kb001.name} → ${kb001.id}`);

  step("1.3", "13", "BB-AGT-001 — Creating 6 KB sources");
  for (const src of BB001_KB_SOURCES) {
    try {
      const res = await post(`/api/knowledge-bases/${ids.bb001.kbId}/sources/text`, { title: src.title, content: src.content });
      log(`KB Source: ${src.title.slice(0, 60)}`);
      try { await patch(`/api/knowledge-bases/${ids.bb001.kbId}/sources/${res.id}`, { name: src.title }); } catch (_) {}
    } catch (e) { warn(`KB Source FAILED: ${src.title.slice(0, 50)} — ${e.message.slice(0, 80)}`); }
  }

  step("1.4", "13", "BB-AGT-001 — Creating 6 runbooks");
  for (const rb of BB001_RUNBOOKS) {
    try {
      const res = await post("/api/runbooks", { ...rb, organizationId: ORG });
      ids.bb001.runbookIds.push(res.id);
      log(`Runbook: ${rb.name.slice(0, 60)} → ${res.id}`);
    } catch (e) { warn(`Runbook FAILED: ${rb.name.slice(0, 50)} — ${e.message.slice(0, 80)}`); }
  }

  step("1.5", "13", "BB-AGT-001 — Creating 5 governance policies");
  for (const pol of BB001_POLICIES) {
    try {
      const res = await post("/api/policies", { ...pol, organizationId: ORG });
      ids.bb001.policyIds.push(res.id);
      log(`Policy: ${pol.name.slice(0, 60)} → ${res.id}`);
    } catch (e) { warn(`Policy FAILED: ${pol.name.slice(0, 50)} — ${e.message.slice(0, 80)}`); }
  }

  step("1.6", "13", "BB-AGT-001 — Creating agent");
  const agent001 = await createAgent(BB001_AGENT, ids.bb001.skillIds, ids.bb001.policyIds);
  ids.bb001.agentId = agent001.id;
  log(`Agent: ${agent001.name} → ${agent001.id}`);

  step("1.7", "13", "BB-AGT-001 — Linking runbooks and policies to agent");
  for (const rId of ids.bb001.runbookIds) {
    try { await patch(`/api/runbooks/${rId}`, { agentId: ids.bb001.agentId }); } catch (e) { warn(`Runbook link: ${e.message.slice(0, 60)}`); }
  }
  log("6 runbooks linked to BB-AGT-001");
  for (const pId of ids.bb001.policyIds) {
    try { await patch(`/api/policies/${pId}`, { scopeId: ids.bb001.agentId, scopeType: "agent" }); } catch (e) { warn(`Policy link: ${e.message.slice(0, 60)}`); }
  }
  log("5 policies scoped to BB-AGT-001");

  step("1.8", "13", "BB-AGT-001 — Linking knowledge base to agent");
  try {
    await post(`/api/agents/${ids.bb001.agentId}/knowledge-bases`, { knowledgeBaseId: ids.bb001.kbId, priority: 1, retrievalConfig: { topK: 10, scoreThreshold: 0.65, rerankEnabled: true, citationMode: "full" } });
    log("Knowledge base linked to BB-AGT-001");
  } catch (e) { warn(`KB link: ${e.message.slice(0, 80)}`); }

  step("1.9", "13", "BB-AGT-001 — Golden dataset + 6 test cases");
  const ds001 = await post("/api/golden-datasets", BB001_GOLDEN_DATASET);
  ids.bb001.goldenDatasetId = ds001.id;
  log(`Golden Dataset → ${ds001.id}`);
  for (const tc of BB001_TEST_CASES) {
    try {
      const res = await post(`/api/golden-datasets/${ids.bb001.goldenDatasetId}/test-cases`, {
        datasetId: ids.bb001.goldenDatasetId, name: tc.name,
        inputScenario: `${tc.description}\n\nInput: ${JSON.stringify(tc.input, null, 2)}`,
        expectedBehavior: `Expected output: ${JSON.stringify(tc.expectedOutput, null, 2)}`,
        evaluationCriteria: Object.entries(tc.metrics || {}).map(([k, v]) => ({ criterion: k, target: v })),
        rubricScoring: { dimensions: Object.keys(tc.metrics || {}), passingScore: 0.9 },
        difficultyTier: "complex", scenarioCategory: "happy_path", tags: tc.tags || [], status: "active",
      });
      ids.bb001.testCaseIds.push(res.id);
      log(`Test Case: ${tc.name.slice(0, 65)}`);
    } catch (e) { warn(`Test Case: ${tc.name.slice(0, 50)} — ${e.message.slice(0, 80)}`); }
  }

  step("1.10", "13", "BB-AGT-001 — Eval suite");
  const eval001 = await post("/api/evals", { ...BB001_EVAL, organizationId: ORG, agentId: ids.bb001.agentId, goldenDatasetId: ids.bb001.goldenDatasetId, skillId: null });
  ids.bb001.evalSuiteId = eval001.id;
  log(`Eval Suite → ${eval001.id}`);

  step("1.11", "13", "BB-AGT-001 — Outcome contract + 6 KPIs");
  const out001 = await post("/api/outcomes/with-kpis", BB001_OUTCOME);
  ids.bb001.outcomeId = out001.outcome.id;
  log(`Outcome → ${out001.outcome.id} (${out001.kpis?.length || 0} KPIs)`);

  step("1.12", "13", "BB-AGT-001 — Linking outcome and eval to agent");
  try {
    await patch(`/api/agents/${ids.bb001.agentId}`, { outcomeId: ids.bb001.outcomeId, evalBindings: [{ evalSuiteId: ids.bb001.evalSuiteId, schedule: BB001_EVAL.schedule }] });
    log("Outcome and eval linked to BB-AGT-001");
  } catch (e) { warn(`Agent link: ${e.message.slice(0, 80)}`); }

  step("1.13", "13", "BB-AGT-001 — Fetching and tagging ontology concepts");
  try {
    const allConcepts = await get("/api/ontology-concepts/all");
    const keywords = ["auction", "data quality", "anomaly", "fraud", "vehicle", "VIN", "valuation", "transaction"];
    const tags = allConcepts
      .filter((c) => keywords.some((kw) => (c.name || "").toLowerCase().includes(kw) || (c.description || "").toLowerCase().includes(kw)))
      .slice(0, 8).map((c) => c.name);
    if (tags.length > 0) {
      await patch(`/api/agents/${ids.bb001.agentId}`, { ontologyTags: tags });
      log(`Ontology tags: ${tags.join(", ")}`);
    } else { warn("No matching ontology concepts found"); }
  } catch (e) { warn(`Ontology tags: ${e.message.slice(0, 80)}`); }

  console.log("\n  ✅  BB-AGT-001 COMPLETE");

  // ──────────────────────────────────────────────────────────────────────────
  // BB-AGT-002 CREATION
  // ──────────────────────────────────────────────────────────────────────────
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  BB-AGT-002: Market Shift Detector");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  step("2.1", "13", "BB-AGT-002 — Creating 6 skills");
  for (const skill of BB002_SKILLS) {
    try {
      const res = await post("/api/skills", skill);
      ids.bb002.skillIds.push(res.id);
      log(`Skill: ${skill.name} → ${res.id}`);
    } catch (e) { warn(`Skill FAILED: ${skill.name} — ${e.message.slice(0, 80)}`); }
  }

  step("2.2", "13", "BB-AGT-002 — Creating knowledge base");
  const kb002 = await post("/api/knowledge-bases", BB002_KB);
  ids.bb002.kbId = kb002.id;
  log(`KB: ${kb002.name} → ${kb002.id}`);

  step("2.3", "13", "BB-AGT-002 — Creating 6 KB sources");
  for (const src of BB002_KB_SOURCES) {
    try {
      const res = await post(`/api/knowledge-bases/${ids.bb002.kbId}/sources/text`, { title: src.title, content: src.content });
      log(`KB Source: ${src.title.slice(0, 60)}`);
      try { await patch(`/api/knowledge-bases/${ids.bb002.kbId}/sources/${res.id}`, { name: src.title }); } catch (_) {}
    } catch (e) { warn(`KB Source FAILED: ${src.title.slice(0, 50)} — ${e.message.slice(0, 80)}`); }
  }

  step("2.4", "13", "BB-AGT-002 — Creating 6 runbooks");
  for (const rb of BB002_RUNBOOKS) {
    try {
      const res = await post("/api/runbooks", { ...rb, organizationId: ORG });
      ids.bb002.runbookIds.push(res.id);
      log(`Runbook: ${rb.name.slice(0, 60)} → ${res.id}`);
    } catch (e) { warn(`Runbook FAILED: ${rb.name.slice(0, 50)} — ${e.message.slice(0, 80)}`); }
  }

  step("2.5", "13", "BB-AGT-002 — Creating 4 governance policies");
  for (const pol of BB002_POLICIES) {
    try {
      const res = await post("/api/policies", { ...pol, organizationId: ORG });
      ids.bb002.policyIds.push(res.id);
      log(`Policy: ${pol.name.slice(0, 60)} → ${res.id}`);
    } catch (e) { warn(`Policy FAILED: ${pol.name.slice(0, 50)} — ${e.message.slice(0, 80)}`); }
  }

  step("2.6", "13", "BB-AGT-002 — Creating agent");
  const agent002 = await createAgent(BB002_AGENT, ids.bb002.skillIds, ids.bb002.policyIds);
  ids.bb002.agentId = agent002.id;
  log(`Agent: ${agent002.name} → ${agent002.id}`);

  step("2.7", "13", "BB-AGT-002 — Linking runbooks and policies");
  for (const rId of ids.bb002.runbookIds) {
    try { await patch(`/api/runbooks/${rId}`, { agentId: ids.bb002.agentId }); } catch (e) { warn(`Runbook link: ${e.message.slice(0, 60)}`); }
  }
  log("6 runbooks linked to BB-AGT-002");
  for (const pId of ids.bb002.policyIds) {
    try { await patch(`/api/policies/${pId}`, { scopeId: ids.bb002.agentId, scopeType: "agent" }); } catch (e) { warn(`Policy link: ${e.message.slice(0, 60)}`); }
  }
  log("4 policies scoped to BB-AGT-002");

  step("2.8", "13", "BB-AGT-002 — Linking knowledge base");
  try {
    await post(`/api/agents/${ids.bb002.agentId}/knowledge-bases`, { knowledgeBaseId: ids.bb002.kbId, priority: 1, retrievalConfig: { topK: 10, scoreThreshold: 0.65, rerankEnabled: true, citationMode: "full" } });
    log("Knowledge base linked to BB-AGT-002");
  } catch (e) { warn(`KB link: ${e.message.slice(0, 80)}`); }

  step("2.9", "13", "BB-AGT-002 — Golden dataset + 6 test cases");
  const ds002 = await post("/api/golden-datasets", BB002_GOLDEN_DATASET);
  ids.bb002.goldenDatasetId = ds002.id;
  log(`Golden Dataset → ${ds002.id}`);
  for (const tc of BB002_TEST_CASES) {
    try {
      const res = await post(`/api/golden-datasets/${ids.bb002.goldenDatasetId}/test-cases`, {
        datasetId: ids.bb002.goldenDatasetId, name: tc.name,
        inputScenario: `${tc.description}\n\nInput: ${JSON.stringify(tc.input, null, 2)}`,
        expectedBehavior: `Expected output: ${JSON.stringify(tc.expectedOutput, null, 2)}`,
        evaluationCriteria: Object.entries(tc.metrics || {}).map(([k, v]) => ({ criterion: k, target: v })),
        rubricScoring: { dimensions: Object.keys(tc.metrics || {}), passingScore: 0.9 },
        difficultyTier: "complex", scenarioCategory: "happy_path", tags: tc.tags || [], status: "active",
      });
      ids.bb002.testCaseIds.push(res.id);
      log(`Test Case: ${tc.name.slice(0, 65)}`);
    } catch (e) { warn(`Test Case: ${tc.name.slice(0, 50)} — ${e.message.slice(0, 80)}`); }
  }

  step("2.10", "13", "BB-AGT-002 — Eval suite");
  const eval002 = await post("/api/evals", { ...BB002_EVAL, organizationId: ORG, agentId: ids.bb002.agentId, goldenDatasetId: ids.bb002.goldenDatasetId, skillId: null });
  ids.bb002.evalSuiteId = eval002.id;
  log(`Eval Suite → ${eval002.id}`);

  step("2.11", "13", "BB-AGT-002 — Outcome contract + 5 KPIs");
  const out002 = await post("/api/outcomes/with-kpis", BB002_OUTCOME);
  ids.bb002.outcomeId = out002.outcome.id;
  log(`Outcome → ${out002.outcome.id} (${out002.kpis?.length || 0} KPIs)`);

  step("2.12", "13", "BB-AGT-002 — Linking outcome and eval");
  try {
    await patch(`/api/agents/${ids.bb002.agentId}`, { outcomeId: ids.bb002.outcomeId, evalBindings: [{ evalSuiteId: ids.bb002.evalSuiteId, schedule: BB002_EVAL.schedule }] });
    log("Outcome and eval linked to BB-AGT-002");
  } catch (e) { warn(`Agent link: ${e.message.slice(0, 80)}`); }

  step("2.13", "13", "BB-AGT-002 — Ontology tags");
  try {
    const allConcepts = await get("/api/ontology-concepts/all");
    const keywords = ["market", "trend", "signal", "shift", "depreciation", "appreciation", "segment", "economic"];
    const tags = allConcepts
      .filter((c) => keywords.some((kw) => (c.name || "").toLowerCase().includes(kw) || (c.description || "").toLowerCase().includes(kw)))
      .slice(0, 8).map((c) => c.name);
    if (tags.length > 0) {
      await patch(`/api/agents/${ids.bb002.agentId}`, { ontologyTags: tags });
      log(`Ontology tags: ${tags.join(", ")}`);
    } else { warn("No matching ontology concepts found"); }
  } catch (e) { warn(`Ontology tags: ${e.message.slice(0, 80)}`); }

  console.log("\n  ✅  BB-AGT-002 COMPLETE");

  // ──────────────────────────────────────────────────────────────────────────
  // BB-AGT-003 CREATION
  // ──────────────────────────────────────────────────────────────────────────
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  BB-AGT-003: Competitive Intelligence Monitor");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  step("3.1", "13", "BB-AGT-003 — Creating 6 skills");
  for (const skill of BB003_SKILLS) {
    try {
      const res = await post("/api/skills", skill);
      ids.bb003.skillIds.push(res.id);
      log(`Skill: ${skill.name} → ${res.id}`);
    } catch (e) { warn(`Skill FAILED: ${skill.name} — ${e.message.slice(0, 80)}`); }
  }

  step("3.2", "13", "BB-AGT-003 — Creating knowledge base");
  const kb003 = await post("/api/knowledge-bases", BB003_KB);
  ids.bb003.kbId = kb003.id;
  log(`KB: ${kb003.name} → ${kb003.id}`);

  step("3.3", "13", "BB-AGT-003 — Creating 6 KB sources");
  for (const src of BB003_KB_SOURCES) {
    try {
      const res = await post(`/api/knowledge-bases/${ids.bb003.kbId}/sources/text`, { title: src.title, content: src.content });
      log(`KB Source: ${src.title.slice(0, 60)}`);
      try { await patch(`/api/knowledge-bases/${ids.bb003.kbId}/sources/${res.id}`, { name: src.title }); } catch (_) {}
    } catch (e) { warn(`KB Source FAILED: ${src.title.slice(0, 50)} — ${e.message.slice(0, 80)}`); }
  }

  step("3.4", "13", "BB-AGT-003 — Creating 6 runbooks");
  for (const rb of BB003_RUNBOOKS) {
    try {
      const res = await post("/api/runbooks", { ...rb, organizationId: ORG });
      ids.bb003.runbookIds.push(res.id);
      log(`Runbook: ${rb.name.slice(0, 60)} → ${res.id}`);
    } catch (e) { warn(`Runbook FAILED: ${rb.name.slice(0, 50)} — ${e.message.slice(0, 80)}`); }
  }

  step("3.5", "13", "BB-AGT-003 — Creating 4 governance policies");
  for (const pol of BB003_POLICIES) {
    try {
      const res = await post("/api/policies", { ...pol, organizationId: ORG });
      ids.bb003.policyIds.push(res.id);
      log(`Policy: ${pol.name.slice(0, 60)} → ${res.id}`);
    } catch (e) { warn(`Policy FAILED: ${pol.name.slice(0, 50)} — ${e.message.slice(0, 80)}`); }
  }

  step("3.6", "13", "BB-AGT-003 — Creating agent");
  const agent003 = await createAgent(BB003_AGENT, ids.bb003.skillIds, ids.bb003.policyIds);
  ids.bb003.agentId = agent003.id;
  log(`Agent: ${agent003.name} → ${agent003.id}`);

  step("3.7", "13", "BB-AGT-003 — Linking runbooks and policies");
  for (const rId of ids.bb003.runbookIds) {
    try { await patch(`/api/runbooks/${rId}`, { agentId: ids.bb003.agentId }); } catch (e) { warn(`Runbook link: ${e.message.slice(0, 60)}`); }
  }
  log("6 runbooks linked to BB-AGT-003");
  for (const pId of ids.bb003.policyIds) {
    try { await patch(`/api/policies/${pId}`, { scopeId: ids.bb003.agentId, scopeType: "agent" }); } catch (e) { warn(`Policy link: ${e.message.slice(0, 60)}`); }
  }
  log("4 policies scoped to BB-AGT-003");

  step("3.8", "13", "BB-AGT-003 — Linking knowledge base");
  try {
    await post(`/api/agents/${ids.bb003.agentId}/knowledge-bases`, { knowledgeBaseId: ids.bb003.kbId, priority: 1, retrievalConfig: { topK: 8, scoreThreshold: 0.65, rerankEnabled: true, citationMode: "full" } });
    log("Knowledge base linked to BB-AGT-003");
  } catch (e) { warn(`KB link: ${e.message.slice(0, 80)}`); }

  step("3.9", "13", "BB-AGT-003 — Golden dataset + 6 test cases");
  const ds003 = await post("/api/golden-datasets", BB003_GOLDEN_DATASET);
  ids.bb003.goldenDatasetId = ds003.id;
  log(`Golden Dataset → ${ds003.id}`);
  for (const tc of BB003_TEST_CASES) {
    try {
      const res = await post(`/api/golden-datasets/${ids.bb003.goldenDatasetId}/test-cases`, {
        datasetId: ids.bb003.goldenDatasetId, name: tc.name,
        inputScenario: `${tc.description}\n\nInput: ${JSON.stringify(tc.input, null, 2)}`,
        expectedBehavior: `Expected output: ${JSON.stringify(tc.expectedOutput, null, 2)}`,
        evaluationCriteria: Object.entries(tc.metrics || {}).map(([k, v]) => ({ criterion: k, target: v })),
        rubricScoring: { dimensions: Object.keys(tc.metrics || {}), passingScore: 0.9 },
        difficultyTier: "complex", scenarioCategory: "happy_path", tags: tc.tags || [], status: "active",
      });
      ids.bb003.testCaseIds.push(res.id);
      log(`Test Case: ${tc.name.slice(0, 65)}`);
    } catch (e) { warn(`Test Case: ${tc.name.slice(0, 50)} — ${e.message.slice(0, 80)}`); }
  }

  step("3.10", "13", "BB-AGT-003 — Eval suite");
  const eval003 = await post("/api/evals", { ...BB003_EVAL, organizationId: ORG, agentId: ids.bb003.agentId, goldenDatasetId: ids.bb003.goldenDatasetId, skillId: null });
  ids.bb003.evalSuiteId = eval003.id;
  log(`Eval Suite → ${eval003.id}`);

  step("3.11", "13", "BB-AGT-003 — Outcome contract + 5 KPIs");
  const out003 = await post("/api/outcomes/with-kpis", BB003_OUTCOME);
  ids.bb003.outcomeId = out003.outcome.id;
  log(`Outcome → ${out003.outcome.id} (${out003.kpis?.length || 0} KPIs)`);

  step("3.12", "13", "BB-AGT-003 — Linking outcome and eval");
  try {
    await patch(`/api/agents/${ids.bb003.agentId}`, { outcomeId: ids.bb003.outcomeId, evalBindings: [{ evalSuiteId: ids.bb003.evalSuiteId, schedule: BB003_EVAL.schedule }] });
    log("Outcome and eval linked to BB-AGT-003");
  } catch (e) { warn(`Agent link: ${e.message.slice(0, 80)}`); }

  step("3.13", "13", "BB-AGT-003 — Ontology tags");
  try {
    const allConcepts = await get("/api/ontology-concepts/all");
    const keywords = ["competitive", "divergence", "valuation", "market", "analysis", "normalization"];
    const tags = allConcepts
      .filter((c) => keywords.some((kw) => (c.name || "").toLowerCase().includes(kw) || (c.description || "").toLowerCase().includes(kw)))
      .slice(0, 8).map((c) => c.name);
    if (tags.length > 0) {
      await patch(`/api/agents/${ids.bb003.agentId}`, { ontologyTags: tags });
      log(`Ontology tags: ${tags.join(", ")}`);
    } else { warn("No matching ontology concepts found"); }
  } catch (e) { warn(`Ontology tags: ${e.message.slice(0, 80)}`); }

  console.log("\n  ✅  BB-AGT-003 COMPLETE");

  // ──────────────────────────────────────────────────────────────────────────
  // BB-AGT-004 CREATION
  // ──────────────────────────────────────────────────────────────────────────
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  BB-AGT-004: Narrative Insight Generator");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  step("4.1", "13", "BB-AGT-004 — Creating 6 skills");
  for (const skill of BB004_SKILLS) {
    try {
      const res = await post("/api/skills", skill);
      ids.bb004.skillIds.push(res.id);
      log(`Skill: ${skill.name} → ${res.id}`);
    } catch (e) { warn(`Skill FAILED: ${skill.name} — ${e.message.slice(0, 80)}`); }
  }

  step("4.2", "13", "BB-AGT-004 — Creating knowledge base");
  const kb004 = await post("/api/knowledge-bases", BB004_KB);
  ids.bb004.kbId = kb004.id;
  log(`KB: ${kb004.name} → ${kb004.id}`);

  step("4.3", "13", "BB-AGT-004 — Creating 6 KB sources");
  for (const src of BB004_KB_SOURCES) {
    try {
      const res = await post(`/api/knowledge-bases/${ids.bb004.kbId}/sources/text`, { title: src.title, content: src.content });
      log(`KB Source: ${src.title.slice(0, 60)}`);
      try { await patch(`/api/knowledge-bases/${ids.bb004.kbId}/sources/${res.id}`, { name: src.title }); } catch (_) {}
    } catch (e) { warn(`KB Source FAILED: ${src.title.slice(0, 50)} — ${e.message.slice(0, 80)}`); }
  }

  step("4.4", "13", "BB-AGT-004 — Creating 6 runbooks");
  for (const rb of BB004_RUNBOOKS) {
    try {
      const res = await post("/api/runbooks", { ...rb, organizationId: ORG });
      ids.bb004.runbookIds.push(res.id);
      log(`Runbook: ${rb.name.slice(0, 60)} → ${res.id}`);
    } catch (e) { warn(`Runbook FAILED: ${rb.name.slice(0, 50)} — ${e.message.slice(0, 80)}`); }
  }

  step("4.5", "13", "BB-AGT-004 — Creating 5 governance policies");
  for (const pol of BB004_POLICIES) {
    try {
      const res = await post("/api/policies", { ...pol, organizationId: ORG });
      ids.bb004.policyIds.push(res.id);
      log(`Policy: ${pol.name.slice(0, 60)} → ${res.id}`);
    } catch (e) { warn(`Policy FAILED: ${pol.name.slice(0, 50)} — ${e.message.slice(0, 80)}`); }
  }

  step("4.6", "13", "BB-AGT-004 — Creating agent");
  const agent004 = await createAgent(BB004_AGENT, ids.bb004.skillIds, ids.bb004.policyIds);
  ids.bb004.agentId = agent004.id;
  log(`Agent: ${agent004.name} → ${agent004.id}`);

  step("4.7", "13", "BB-AGT-004 — Linking runbooks and policies");
  for (const rId of ids.bb004.runbookIds) {
    try { await patch(`/api/runbooks/${rId}`, { agentId: ids.bb004.agentId }); } catch (e) { warn(`Runbook link: ${e.message.slice(0, 60)}`); }
  }
  log("6 runbooks linked to BB-AGT-004");
  for (const pId of ids.bb004.policyIds) {
    try { await patch(`/api/policies/${pId}`, { scopeId: ids.bb004.agentId, scopeType: "agent" }); } catch (e) { warn(`Policy link: ${e.message.slice(0, 60)}`); }
  }
  log("5 policies scoped to BB-AGT-004");

  step("4.8", "13", "BB-AGT-004 — Linking knowledge base");
  try {
    await post(`/api/agents/${ids.bb004.agentId}/knowledge-bases`, { knowledgeBaseId: ids.bb004.kbId, priority: 1, retrievalConfig: { topK: 10, scoreThreshold: 0.65, rerankEnabled: true, citationMode: "full" } });
    log("Knowledge base linked to BB-AGT-004");
  } catch (e) { warn(`KB link: ${e.message.slice(0, 80)}`); }

  step("4.9", "13", "BB-AGT-004 — Golden dataset + 6 test cases");
  const ds004 = await post("/api/golden-datasets", BB004_GOLDEN_DATASET);
  ids.bb004.goldenDatasetId = ds004.id;
  log(`Golden Dataset → ${ds004.id}`);
  for (const tc of BB004_TEST_CASES) {
    try {
      const res = await post(`/api/golden-datasets/${ids.bb004.goldenDatasetId}/test-cases`, {
        datasetId: ids.bb004.goldenDatasetId, name: tc.name,
        inputScenario: `${tc.description}\n\nInput: ${JSON.stringify(tc.input, null, 2)}`,
        expectedBehavior: `Expected output: ${JSON.stringify(tc.expectedOutput, null, 2)}`,
        evaluationCriteria: Object.entries(tc.metrics || {}).map(([k, v]) => ({ criterion: k, target: v })),
        rubricScoring: { dimensions: Object.keys(tc.metrics || {}), passingScore: 0.9 },
        difficultyTier: "complex", scenarioCategory: "happy_path", tags: tc.tags || [], status: "active",
      });
      ids.bb004.testCaseIds.push(res.id);
      log(`Test Case: ${tc.name.slice(0, 65)}`);
    } catch (e) { warn(`Test Case: ${tc.name.slice(0, 50)} — ${e.message.slice(0, 80)}`); }
  }

  step("4.10", "13", "BB-AGT-004 — Eval suite");
  const eval004 = await post("/api/evals", { ...BB004_EVAL, organizationId: ORG, agentId: ids.bb004.agentId, goldenDatasetId: ids.bb004.goldenDatasetId, skillId: null });
  ids.bb004.evalSuiteId = eval004.id;
  log(`Eval Suite → ${eval004.id}`);

  step("4.11", "13", "BB-AGT-004 — Outcome contract + 5 KPIs");
  const out004 = await post("/api/outcomes/with-kpis", BB004_OUTCOME);
  ids.bb004.outcomeId = out004.outcome.id;
  log(`Outcome → ${out004.outcome.id} (${out004.kpis?.length || 0} KPIs)`);

  step("4.12", "13", "BB-AGT-004 — Linking outcome and eval");
  try {
    await patch(`/api/agents/${ids.bb004.agentId}`, { outcomeId: ids.bb004.outcomeId, evalBindings: [{ evalSuiteId: ids.bb004.evalSuiteId, schedule: BB004_EVAL.schedule }] });
    log("Outcome and eval linked to BB-AGT-004");
  } catch (e) { warn(`Agent link: ${e.message.slice(0, 80)}`); }

  step("4.13", "13", "BB-AGT-004 — Ontology tags");
  try {
    const allConcepts = await get("/api/ontology-concepts/all");
    const keywords = ["narrative", "report", "insight", "content", "publication", "editorial", "market"];
    const tags = allConcepts
      .filter((c) => keywords.some((kw) => (c.name || "").toLowerCase().includes(kw) || (c.description || "").toLowerCase().includes(kw)))
      .slice(0, 8).map((c) => c.name);
    if (tags.length > 0) {
      await patch(`/api/agents/${ids.bb004.agentId}`, { ontologyTags: tags });
      log(`Ontology tags: ${tags.join(", ")}`);
    } else { warn("No matching ontology concepts found"); }
  } catch (e) { warn(`Ontology tags: ${e.message.slice(0, 80)}`); }

  console.log("\n  ✅  BB-AGT-004 COMPLETE");

  // ──────────────────────────────────────────────────────────────────────────
  // SAVE IDs
  // ──────────────────────────────────────────────────────────────────────────
  const output = {
    createdAt: new Date().toISOString(),
    environment: "dev",
    orgId: ORG,
    agents: {
      "BB-AGT-001": {
        agentId: ids.bb001.agentId,
        agentName: "Auction Data Quality Sentinel",
        kbId: ids.bb001.kbId,
        skillIds: ids.bb001.skillIds,
        runbookIds: ids.bb001.runbookIds,
        policyIds: ids.bb001.policyIds,
        goldenDatasetId: ids.bb001.goldenDatasetId,
        testCaseIds: ids.bb001.testCaseIds,
        evalSuiteId: ids.bb001.evalSuiteId,
        outcomeId: ids.bb001.outcomeId,
      },
      "BB-AGT-002": {
        agentId: ids.bb002.agentId,
        agentName: "Market Shift Detector",
        kbId: ids.bb002.kbId,
        skillIds: ids.bb002.skillIds,
        runbookIds: ids.bb002.runbookIds,
        policyIds: ids.bb002.policyIds,
        goldenDatasetId: ids.bb002.goldenDatasetId,
        testCaseIds: ids.bb002.testCaseIds,
        evalSuiteId: ids.bb002.evalSuiteId,
        outcomeId: ids.bb002.outcomeId,
      },
      "BB-AGT-003": {
        agentId: ids.bb003.agentId,
        agentName: "Competitive Intelligence Monitor",
        kbId: ids.bb003.kbId,
        skillIds: ids.bb003.skillIds,
        runbookIds: ids.bb003.runbookIds,
        policyIds: ids.bb003.policyIds,
        goldenDatasetId: ids.bb003.goldenDatasetId,
        testCaseIds: ids.bb003.testCaseIds,
        evalSuiteId: ids.bb003.evalSuiteId,
        outcomeId: ids.bb003.outcomeId,
      },
      "BB-AGT-004": {
        agentId: ids.bb004.agentId,
        agentName: "Narrative Insight Generator",
        kbId: ids.bb004.kbId,
        skillIds: ids.bb004.skillIds,
        runbookIds: ids.bb004.runbookIds,
        policyIds: ids.bb004.policyIds,
        goldenDatasetId: ids.bb004.goldenDatasetId,
        testCaseIds: ids.bb004.testCaseIds,
        evalSuiteId: ids.bb004.evalSuiteId,
        outcomeId: ids.bb004.outcomeId,
      },
    },
  };

  writeFileSync("scripts/bb-dev-ids.json", JSON.stringify(output, null, 2));

  console.log("\n══════════════════════════════════════════════════════════════");
  console.log("  ALL 4 AGENTS COMPLETE");
  console.log(`  BB-AGT-001 Agent: ${ids.bb001.agentId}`);
  console.log(`  BB-AGT-002 Agent: ${ids.bb002.agentId}`);
  console.log(`  BB-AGT-003 Agent: ${ids.bb003.agentId}`);
  console.log(`  BB-AGT-004 Agent: ${ids.bb004.agentId}`);
  console.log("  IDs saved to: scripts/bb-dev-ids.json");
  console.log("══════════════════════════════════════════════════════════════\n");
}

main().catch((err) => {
  console.error("\n  FATAL ERROR:", err.message);
  process.exit(1);
});
