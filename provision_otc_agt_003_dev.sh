#!/usr/bin/env bash
# =============================================================================
# ATLAS — Customer Credit & Risk Assessment Agent (OTC-AGT-003) — Dev Provisioning
# Generated: 2026-03-30
#
# SINGLE COMMAND TO RUN (from Replit workspace):
#   bash provision_otc_agt_003_dev.sh
#
# REQUIREMENTS: curl, jq
#
# Resources created:
#   6 Skills          (Credit Bureau Integration, Payment Pattern Analysis,
#                      Financial Statement Parser, Risk Scoring Model,
#                      News & Signal Monitoring, Credit Decision Explanation)
#   1 Knowledge Base  (Customer Credit & Risk Assessment KB)
#   6 Policies        (ECOA, FCRA, Basel III/IFRS 9, GDPR/CCPA Credit Data,
#                      SOX Credit Controls, OFAC/AML Credit Screening)
#   1 Agent           (OTC-AGT-003, 18 tools, 11-node blueprint)
#   1 KB Link         (Agent → Knowledge Base)
#   1 Golden Dataset  (historical credit decisions benchmark)
#   6 Runbooks        (Bureau API Down, Mass Credit Breach, False Credit Hold,
#                      Customer Dispute, Periodic Review Backlog, Credit Model Drift)
#   1 Eval Suite      (Regression suite bound to agent)
# =============================================================================

set -euo pipefail

BASE_URL="http://localhost:5000"

echo ""
echo "=================================================="
echo " ATLAS — OTC-AGT-003 Customer Credit & Risk Assessment Agent"
echo " Target: $BASE_URL  (dev / staging)"
echo "=================================================="
echo ""

if ! command -v jq &> /dev/null; then
  echo "ERROR: jq is required."
  echo "  macOS:  brew install jq"
  echo "  Linux:  sudo apt-get install jq"
  exit 1
fi

# Helper: POST to endpoint, print label to stderr, return ID on stdout
post_api() {
  local label="$1" endpoint="$2" payload_file="$3"
  local response id
  response=$(curl -s -X POST "${BASE_URL}${endpoint}" \
    -H "Content-Type: application/json" \
    -d @"${payload_file}")
  id=$(echo "$response" | jq -r '.id // empty')
  if [ -z "$id" ] || [ "$id" = "null" ]; then
    echo "  ✗ FAILED: $label" >&2
    echo "    Response: $response" >&2
    exit 1
  fi
  echo "  ✓ $label → $id" >&2
  echo "$id"
}

WORK=$(mktemp -d)
trap "rm -rf $WORK" EXIT

# =============================================================================
# STEP 1: Create 6 Skills
# =============================================================================
echo "STEP 1: Creating 6 Skills..." >&2

cat > "$WORK/s1.json" <<'ENDJSON'
{
  "name": "Credit Bureau Integration",
  "description": "Fetches commercial credit reports from D&B (Dun & Bradstreet), Experian Business, and Equifax Business. Retrieves PAYDEX scores, Intelliscore Plus, business credit scores, payment experiences, public records (liens, judgments, bankruptcies), and trade references. Normalizes disparate bureau data into a unified credit profile for composite scoring. Handles bureau API failover and report caching with staleness tracking.",
  "industry": "enterprise",
  "domain": "Credit-Risk-Management",
  "version": "1.0.0",
  "author": "ATLAS Platform Team",
  "trustTier": "platform-provided",
  "complexity": "advanced",
  "dependencies": ["dnb-direct-api", "experian-business-api", "equifax-business-api", "credit-cache-service"],
  "tags": ["credit-risk", "credit-bureau", "dnb", "experian", "equifax", "paydex", "commercial-credit", "order-to-cash", "otc-agt-003"],
  "agentTypeCompatibility": ["single", "team"],
  "allowedTools": [
    "bureau.dnb_pull_report",
    "bureau.experian_pull_report",
    "bureau.equifax_pull_report",
    "bureau.get_cached_report",
    "bureau.normalize_profile"
  ],
  "markdownBody": "# Credit Bureau Integration Skill\n\n## Purpose\nFetches and normalizes commercial credit bureau data from D&B, Experian Business, and Equifax Business into a unified credit profile used by the Risk Scoring Model Skill for composite scoring.\n\n## Bureau Data Sources\n\n### D&B Direct (Dun & Bradstreet)\n- DUNS Number lookup and verification\n- PAYDEX Score (1-100): measures payment promptness based on trade experiences\n- Delinquency Predictor Score: probability of severe delinquency in next 12 months\n- Failure Score: probability of business failure in next 12 months\n- Trade experiences: number of experiences, high credit, current balance, days beyond terms (DBT)\n- Public records: liens, judgments, bankruptcies (Chapter 7/11), UCC filings\n- D&B Rating: financial strength indicator (5A to HH) and composite credit appraisal (1-4)\n\n### Experian Business (Intelliscore Plus)\n- Intelliscore Plus (1-100): predicts likelihood of serious delinquency\n- Financial Stability Risk Rating (1-5): business failure risk\n- Payment trend data: 12-month rolling payment history\n- Days Beyond Terms (DBT): average days past due across tradelines\n- Collections, liens, judgments, and bankruptcy filings\n- Industry comparison percentile ranking\n\n### Equifax Business\n- Business Credit Risk Score (101-992): payment delinquency predictor\n- Business Failure Score (1000-1610): bankruptcy/failure risk\n- Payment Index: 12-month average days to pay relative to terms\n- Trade payment details: number of accounts, high credit, current balance, past-due amounts\n- Public filing records and derogatory indicators\n\n## Normalization Process\n1. Pull from all three bureaus in parallel (with individual timeout handling)\n2. Map bureau-specific scores to normalized bands: Excellent (80-100), Good (60-79), Fair (40-59), Poor (20-39), Critical (0-19)\n3. Compute DBT weighted average across bureaus using trade experience volume as weight\n4. Merge public records de-duplicating cross-bureau duplicates\n5. Flag report staleness: D&B < 90 days, Experian < 60 days, Equifax < 60 days\n6. Return unified profile for scoring\n\n## Fallback Behavior\n- If primary bureau unavailable: attempt secondary bureaus; mark missing bureau in profile\n- If all bureaus down: return cached report with staleness flag; trigger manual review queue (see Runbook: Credit Bureau API Down)\n- Never block credit decision entirely on bureau unavailability alone — apply conservative credit tier\n\n## Outputs\n- bureauProfile: { dnb: {...}, experian: {...}, equifax: {...}, normalizedBands: {...} }\n- compositeDBT: number (weighted average days beyond terms)\n- publicRecords: array of { type, date, amount, jurisdiction, status }\n- reportStaleness: { dnbAgeDays, experianAgeDays, equifaxAgeDays }\n- lowestBureauScore: number (most conservative signal)\n- dataCompleteness: percentage of bureaus successfully retrieved\n\n## Compliance Notes\n- FCRA: Access only for permissible purpose (credit underwriting for B2B transactions)\n- Data retained per FCRA record retention requirements; not shared outside credit underwriting workflow\n- Bureau credentials stored in secrets manager; never logged",
  "status": "active"
}
ENDJSON
S1=$(post_api "Credit Bureau Integration Skill" "/api/skills" "$WORK/s1.json")

cat > "$WORK/s2.json" <<'ENDJSON'
{
  "name": "Payment Pattern Analysis",
  "description": "Analyzes the customer's internal accounts receivable payment history to identify behavioral patterns, trend direction, and anomalies. Calculates Days Sales Outstanding (DSO), on-time payment percentage, dispute rate, deduction frequency, payment velocity trends, and early-pay behavior. Detects deteriorating payment patterns before they appear in external bureau data, enabling proactive credit risk management.",
  "industry": "enterprise",
  "domain": "Credit-Risk-Management",
  "version": "1.0.0",
  "author": "ATLAS Platform Team",
  "trustTier": "platform-provided",
  "complexity": "intermediate",
  "dependencies": ["accounts-receivable-api", "erp-payment-history", "invoice-service", "ar-aging-service"],
  "tags": ["credit-risk", "payment-history", "dso", "aging", "accounts-receivable", "payment-behavior", "order-to-cash", "otc-agt-003"],
  "agentTypeCompatibility": ["single", "team"],
  "allowedTools": [
    "ar.get_payment_history",
    "ar.get_aging_buckets",
    "ar.calculate_dso",
    "ar.get_dispute_history",
    "ar.get_deduction_history"
  ],
  "markdownBody": "# Payment Pattern Analysis Skill\n\n## Purpose\nAnalyzes internal AR payment history to detect behavioral payment patterns and trend directions that form a leading indicator of credit risk, often detecting deterioration weeks before external bureau updates.\n\n## Metrics Calculated\n\n### Days Sales Outstanding (DSO)\n- Rolling 12-month DSO: average days from invoice date to payment receipt\n- Best Possible DSO: DSO assuming all invoices paid on terms (measures mix effect)\n- DSO Trend: 3-month vs. 12-month DSO delta (positive = worsening)\n- DSO by invoice size bucket (micro <$1K, small $1K-$25K, mid $25K-$250K, large >$250K)\n\n### Aging Analysis\n- Current aging snapshot: 0-30, 31-60, 61-90, 91-120, 120+ days buckets (% of total AR)\n- 6-month aging trend: tracking bucket migration over time\n- High-balance past-due: identify invoices >$10,000 that are 60+ days overdue\n- Chronic late payers: invoices consistently 10-30 days past terms (habitual slow pays)\n\n### On-Time Payment Rate\n- % of invoices paid within agreed terms (Net 30, Net 60, etc.) over rolling 12 months\n- Trend: 3-month on-time rate vs. 12-month on-time rate\n- Best-month and worst-month performance within period\n\n### Dispute and Deduction Behavior\n- Dispute rate: number of disputed invoices as % of total invoices\n- Deduction frequency: unauthorized deductions as % of total payment volume\n- Average dispute resolution days: time from dispute raised to resolution\n- Dispute patterns: systemic (same issue repeated) vs. isolated\n\n### Payment Velocity\n- Payment acceleration/deceleration: is customer paying faster or slower than 6 months ago?\n- Lump-sum payment behavior: large catch-up payments may signal cash flow stress\n- Pre-payment activity: early payment is a positive signal\n\n## Risk Signal Classification\n- GREEN: DSO improving or stable, on-time rate >90%, dispute rate <2%, no 90+ day balances\n- AMBER: DSO worsening >5 days in 3 months, on-time rate 75-90%, dispute rate 2-5%\n- RED: DSO worsening >15 days, on-time rate <75%, active 90+ day balances, dispute rate >5%\n- CRITICAL: Any invoice 120+ days, high-balance ($25K+) 90+ day exposure, escalating deductions\n\n## Outputs\n- dso: { current, bestPossible, trend12m, trend3m }\n- agingSnapshot: { current_pct, days30_pct, days60_pct, days90_pct, days120plus_pct }\n- onTimeRate: { rolling12m, rolling3m, trend }\n- disputeRate: { rolling12m, type: 'systemic' | 'isolated' }\n- paymentSignal: 'GREEN' | 'AMBER' | 'RED' | 'CRITICAL'\n- paymentTrendDirection: 'improving' | 'stable' | 'deteriorating' | 'rapidly_deteriorating'",
  "status": "active"
}
ENDJSON
S2=$(post_api "Payment Pattern Analysis Skill" "/api/skills" "$WORK/s2.json")

cat > "$WORK/s3.json" <<'ENDJSON'
{
  "name": "Financial Statement Parser",
  "description": "Extracts and normalizes key financial ratios and credit-relevant metrics from uploaded financial statements, public SEC filings (10-K, 10-Q), bank reference letters, and audited balance sheets. Computes liquidity ratios, leverage ratios, profitability metrics, and cash flow indicators used as inputs to the composite risk scoring model. Supports structured data extraction from PDF, Excel, and XBRL formats.",
  "industry": "enterprise",
  "domain": "Credit-Risk-Management",
  "version": "1.0.0",
  "author": "ATLAS Platform Team",
  "trustTier": "platform-provided",
  "complexity": "advanced",
  "dependencies": ["sec-edgar-api", "document-parser-service", "financial-ratio-engine", "xbrl-parser"],
  "tags": ["credit-risk", "financial-statements", "sec-filings", "financial-ratios", "balance-sheet", "cash-flow", "order-to-cash", "otc-agt-003"],
  "agentTypeCompatibility": ["single", "team"],
  "allowedTools": [
    "financials.parse_document",
    "financials.pull_sec_filing",
    "financials.extract_ratios",
    "financials.compute_z_score",
    "financials.get_industry_benchmarks"
  ],
  "markdownBody": "# Financial Statement Parser Skill\n\n## Purpose\nExtracts credit-relevant financial metrics from formal financial statements and public filings to supplement bureau data and internal payment history with a fundamental financial health picture.\n\n## Data Sources Supported\n- Uploaded PDFs: audited balance sheet, income statement, cash flow statement (last 2 fiscal years)\n- SEC EDGAR: 10-K (annual) and 10-Q (quarterly) for public companies via CIK or ticker\n- Bank reference letters: extracts average balances and line of credit utilization\n- XBRL structured data: machine-readable financial data from SEC filings\n\n## Key Ratios Extracted and Computed\n\n### Liquidity Ratios\n- Current Ratio = Current Assets / Current Liabilities (target: >1.5 for Tier 1 credit)\n- Quick Ratio = (Cash + AR) / Current Liabilities (target: >1.0)\n- Cash Ratio = Cash & Equivalents / Current Liabilities\n\n### Leverage / Solvency Ratios\n- Debt-to-Equity = Total Debt / Shareholders' Equity (target: <2.0 for investment grade)\n- Debt-to-EBITDA = Total Debt / EBITDA (target: <3.5x; >5x = elevated risk)\n- Interest Coverage = EBIT / Interest Expense (target: >3.0x)\n- Net Debt Position: Total Debt minus Cash and Equivalents\n\n### Profitability Metrics\n- Gross Margin: Gross Profit / Revenue (trend direction matters more than absolute value)\n- EBITDA Margin: EBITDA / Revenue\n- Net Profit Margin: Net Income / Revenue\n- Return on Assets (ROA): Net Income / Total Assets\n- Revenue Growth Rate: YoY and QoQ\n\n### Cash Flow Indicators\n- Operating Cash Flow to Debt: OCF / Total Debt (target: >0.20)\n- Free Cash Flow: OCF minus CapEx (negative FCF for 2+ consecutive years = risk flag)\n- Cash Conversion Cycle: DIO + DSO − DPO\n\n## Altman Z-Score Computation\n- Public companies: Z-Score = 1.2(WC/TA) + 1.4(RE/TA) + 3.3(EBIT/TA) + 0.6(MVE/TL) + 1.0(S/TA)\n- Private companies: Z'-Score variant using book value of equity\n- Zones: Safe (>2.99), Grey (1.81-2.99), Distress (<1.81)\n\n## Industry Benchmarking\n- Compare all ratios against SIC code industry peer medians\n- Flag metrics where company is bottom quartile vs. industry peers\n\n## Outputs\n- liquidityRatios: { currentRatio, quickRatio, cashRatio }\n- leverageRatios: { debtToEquity, debtToEBITDA, interestCoverage }\n- profitabilityMetrics: { grossMargin, ebitdaMargin, netMargin, revenueGrowthYoY }\n- cashFlowIndicators: { ocfToDebt, freeCashFlow, cashConversionCycle }\n- altmanZScore: { score, zone, components }\n- industryPercentileRanking: { overall, byRatio }\n- dataSource: 'uploaded' | 'sec_edgar' | 'bank_reference'\n- fiscalPeriodsCovered: string[]",
  "status": "active"
}
ENDJSON
S3=$(post_api "Financial Statement Parser Skill" "/api/skills" "$WORK/s3.json")

cat > "$WORK/s4.json" <<'ENDJSON'
{
  "name": "Risk Scoring Model",
  "description": "Calculates a composite credit risk score from 1-100 using configurable weighted inputs: internal payment pattern signal, external bureau scores, financial statement ratios, news sentiment signal, and industry risk factor. Determines the recommended credit tier (Low, Medium, High, Watch List, Credit Hold), recommended credit limit, and appropriate payment terms. Supports scenario modeling for limit changes and stress testing.",
  "industry": "enterprise",
  "domain": "Credit-Risk-Management",
  "version": "1.0.0",
  "author": "ATLAS Platform Team",
  "trustTier": "platform-provided",
  "complexity": "advanced",
  "dependencies": ["scoring-engine-service", "credit-policy-rules", "limit-calculation-service", "exposure-calculator"],
  "tags": ["credit-risk", "risk-scoring", "credit-model", "composite-score", "credit-limit", "payment-terms", "order-to-cash", "otc-agt-003"],
  "agentTypeCompatibility": ["single", "team"],
  "allowedTools": [
    "scoring.calculate_composite",
    "scoring.get_weight_config",
    "scoring.determine_credit_tier",
    "scoring.calculate_recommended_limit",
    "scoring.run_stress_scenario"
  ],
  "markdownBody": "# Risk Scoring Model Skill\n\n## Purpose\nAggregates all available credit signals into a single composite risk score, maps it to a credit tier, and calculates the recommended credit limit and payment terms for the customer account.\n\n## Scoring Inputs and Default Weights\n\n| Input Signal | Default Weight | Source Skill |\n|---|---|---|\n| Internal Payment Pattern | 35% | Payment Pattern Analysis Skill |\n| External Bureau Score (avg) | 30% | Credit Bureau Integration Skill |\n| Financial Statement Ratios | 20% | Financial Statement Parser Skill |\n| News & Market Sentiment | 10% | News & Signal Monitoring Skill |\n| Industry Risk Factor | 5% | Static industry risk table |\n\nWeights are configurable per customer segment (new customer, established customer, strategic account) and industry vertical. Configuration stored in credit policy rules engine.\n\n## Composite Score Calculation\n1. Normalize each input to 0-100 scale using predefined normalization functions\n2. Apply industry risk adjustment factor (e.g., construction +5% risk, SaaS -3% risk)\n3. Apply recency weighting: last 3 months weighted 2x vs. months 4-12\n4. Compute weighted sum: Σ(normalized_signal × weight)\n5. Apply override flags: any CRITICAL payment signal caps score at 30; any active bankruptcy caps at 5\n6. Return composite score with component breakdown\n\n## Credit Tier Mapping\n| Score Range | Risk Tier | Description |\n|---|---|---|\n| 80-100 | Low Risk | Strong creditworthiness; extend maximum terms |\n| 60-79 | Medium Risk | Good standing with some caution signals |\n| 40-59 | High Risk | Significant risk signals; reduced limits, shorter terms |\n| 20-39 | Watch List | Actively monitored; requires senior approval for increases |\n| 0-19 | Credit Hold | Immediate hold; prepayment or LOC required |\n\n## Recommended Credit Limit Calculation\n- Base limit: derived from customer's annual revenue with seller (last 12 months AR volume)\n- Risk tier multiplier: Low=2.0x, Medium=1.5x, High=1.0x, Watch=0.5x, Hold=0.0x\n- Cap: maximum single-customer exposure limit per credit policy (default: 5% of seller AR portfolio)\n- Floor: minimum meaningful limit for operational continuity ($5,000)\n- Existing approved limit: if current limit > recommended, flag for downward review with rationale\n\n## Payment Terms Mapping\n| Risk Tier | Recommended Terms |\n|---|---|\n| Low Risk | Net 60 (or as contracted) |\n| Medium Risk | Net 30 |\n| High Risk | Net 15 or CIA (Cash in Advance) for new orders |\n| Watch List | CIA or irrevocable LOC required |\n| Credit Hold | 100% prepayment or bank guarantee |\n\n## Stress Scenario Testing\n- Scenario: customer revenue drops 30% → recalculate score and limit impact\n- Scenario: bureau score drops 20 points → new tier and limit implications\n- Scenario: 60-day payment delay on all current AR → exposure and credit headroom impact\n\n## Outputs\n- compositeScore: number (0-100)\n- scoreComponents: { paymentPattern, bureauScore, financialRatios, newsSentiment, industryFactor }\n- creditTier: 'low' | 'medium' | 'high' | 'watch_list' | 'credit_hold'\n- recommendedCreditLimit: number (USD)\n- recommendedPaymentTerms: string\n- currentExposure: { openOrdersValue, openARValue, totalExposure, utilizationPct }\n- limitHeadroom: number (USD)\n- nextReviewDate: string (ISO date based on tier: Low=annual, Medium=semi-annual, High=quarterly, Watch=monthly)\n- overrideFlags: string[] (conditions that capped or overrode the score)",
  "status": "active"
}
ENDJSON
S4=$(post_api "Risk Scoring Model Skill" "/api/skills" "$WORK/s4.json")

cat > "$WORK/s5.json" <<'ENDJSON'
{
  "name": "News & Signal Monitoring",
  "description": "Scans financial news, press releases, regulatory filings, and social signals for early-warning distress indicators about customer organizations. Detects signals including mass layoffs, executive departures, credit rating downgrades, M&A activity, litigation filings, supply chain disruptions, and social media distress signals. Uses NLP to score sentiment and extract structured risk events, providing a real-time market intelligence layer for credit risk decisions.",
  "industry": "enterprise",
  "domain": "Credit-Risk-Management",
  "version": "1.0.0",
  "author": "ATLAS Platform Team",
  "trustTier": "platform-provided",
  "complexity": "advanced",
  "dependencies": ["news-api", "court-records-api", "sec-edgar-api", "linkedin-signal-api", "rating-agency-feeds"],
  "tags": ["credit-risk", "news-monitoring", "sentiment-analysis", "early-warning", "distress-signals", "nlp", "order-to-cash", "otc-agt-003"],
  "agentTypeCompatibility": ["single", "team"],
  "allowedTools": [
    "news.search_company",
    "news.get_rating_changes",
    "news.scan_court_filings",
    "news.get_sec_filings",
    "news.calculate_sentiment_score"
  ],
  "markdownBody": "# News & Signal Monitoring Skill\n\n## Purpose\nProvides a real-time external market intelligence layer to detect customer financial distress signals that precede credit deterioration, enabling proactive risk management before bureau data or payment behavior reflects the problem.\n\n## Signal Categories and Sources\n\n### High-Severity Signals (immediate credit review trigger)\n- Mass layoff announcements (>10% of workforce, or absolute >500 employees)\n- Bankruptcy filing (Chapter 7, 11, or 15) or administration\n- Credit rating downgrade to sub-investment grade (BB+ or lower) by S&P/Moody's/Fitch\n- Active WARN Act notices (US Worker Adjustment and Retraining Notification)\n- Regulatory shutdown orders or license revocations\n- SEC enforcement actions, DOJ/FTC antitrust investigation announced\n- Bank line of credit frozen or revolving credit facility drawn down >80%\n\n### Medium-Severity Signals (accelerate periodic review)\n- C-suite executive departures: CFO, CEO, or Treasurer leaving unexpectedly\n- Auditor change or qualified audit opinion (going concern)\n- Credit rating placed on negative watch/outlook\n- Major customer loss announcement (>20% of revenue)\n- Supply chain disruption press releases referencing financial strain\n- Litigation filed >$5M against the company\n- Missed earnings guidance by >15% (public companies)\n\n### Low-Severity Signals (log and monitor)\n- General negative news sentiment trend (3+ consecutive negative articles)\n- Social media executive commentary on financial challenges\n- Industry peer distress signals (sector-wide stress increases individual risk)\n- Facility closures or operational restructuring announcements\n\n## Data Sources\n- News APIs: Reuters, Bloomberg, Associated Press, Google News (via aggregator)\n- SEC EDGAR: 8-K filings (material events), 10-K/10-Q amendments\n- PACER/Court records: bankruptcy filings, judgment entries\n- Rating agency feeds: S&P, Moody's, Fitch rating action bulletins\n- LinkedIn public signals: executive departure announcements, layoff posts\n- WARN Act database: US Department of Labor notice filings\n\n## NLP Sentiment Scoring\n- Sentiment score: -100 (very negative) to +100 (very positive) on 30-day rolling basis\n- Entity-specific sentiment: isolate company-specific mentions from industry noise\n- Signal weighting: high-authority sources (Reuters, Bloomberg) weighted 3x vs. blogs\n- Trend detection: 3-day, 7-day, and 30-day sentiment trajectories\n\n## Outputs\n- sentimentScore: number (-100 to +100)\n- sentimentTrend: 'improving' | 'stable' | 'deteriorating' | 'rapidly_deteriorating'\n- highSeverityEvents: array of { eventType, date, headline, source, severity }\n- mediumSeverityEvents: array of { eventType, date, headline, source }\n- ratingActions: array of { agency, fromRating, toRating, date, outlook }\n- recommendedAction: 'none' | 'schedule_review' | 'immediate_review' | 'escalate_to_credit_committee'\n- monitoringWindowDays: number (next scan interval based on signal level)",
  "status": "active"
}
ENDJSON
S5=$(post_api "News & Signal Monitoring Skill" "/api/skills" "$WORK/s5.json")

cat > "$WORK/s6.json" <<'ENDJSON'
{
  "name": "Credit Decision Explanation",
  "description": "Generates clear, human-readable rationale for credit decisions including credit tier assignments, limit recommendations, payment term changes, and credit holds. Produces explanations for internal credit managers, sales teams, and customer-facing adverse action notices compliant with ECOA and FCRA requirements. Summarizes the key signals driving the decision with supporting evidence and recommended next steps.",
  "industry": "enterprise",
  "domain": "Credit-Risk-Management",
  "version": "1.0.0",
  "author": "ATLAS Platform Team",
  "trustTier": "platform-provided",
  "complexity": "intermediate",
  "dependencies": ["llm-generation-service", "credit-policy-rules", "adverse-action-template-service"],
  "tags": ["credit-risk", "explainability", "adverse-action", "ecoa", "fcra", "credit-decision", "order-to-cash", "otc-agt-003"],
  "agentTypeCompatibility": ["single", "team"],
  "allowedTools": [
    "explain.generate_credit_rationale",
    "explain.generate_adverse_action_notice",
    "explain.generate_sales_notification",
    "explain.generate_review_summary",
    "explain.get_decision_template"
  ],
  "markdownBody": "# Credit Decision Explanation Skill\n\n## Purpose\nTranslates the quantitative credit decision (composite score, tier, limit, terms) into clear, audience-appropriate narrative explanations — ensuring transparency, regulatory compliance, and actionable communication for all stakeholders.\n\n## Explanation Types Generated\n\n### 1. Credit Manager Summary (Internal)\n- Full decision narrative: what signals drove the score, which factors were most influential\n- Score component breakdown with plain-language interpretation\n- Comparison to previous credit review: what changed and why\n- Risk factors requiring monitoring\n- Recommended credit limit with derivation logic\n- Proposed payment terms with rationale\n- Suggested next review date and trigger conditions\n\n### 2. Sales Team Notification\n- Customer credit status (approved / conditional / on hold) in business-friendly language\n- Available credit headroom: how much additional order value can be accepted today\n- Payment terms applicable to new orders\n- Any conditions required before orders can proceed (prepayment, LOC, etc.)\n- Expected timeline for next credit review\n- Key account context: what the credit team needs to maintain this credit tier\n- Do NOT include: raw scores, internal model details, bureau data specifics\n\n### 3. Customer-Facing Adverse Action Notice (ECOA/FCRA Compliant)\n- Required when credit is denied, limited, or offered on less favorable terms than requested\n- Must include: specific reasons for adverse action (up to 4 principal reasons from ECOA codes)\n- FCRA disclosure: name and contact of credit reporting agency used, right to dispute\n- Statement of right to request copy of credit report within 60 days\n- Anti-discrimination statement: decision not based on race, color, religion, sex, national origin, etc.\n- Contact information for credit department to appeal the decision\n- Must be delivered within 30 days of adverse action (ECOA requirement)\n\n### 4. Credit Committee Review Package\n- Executive summary: customer name, decision, and key rationale in 3 sentences\n- Full supporting evidence: all signals and their interpretation\n- Comparison to credit policy thresholds with pass/fail assessment\n- Risk scenario analysis: what happens if conditions deteriorate further\n- Recommended motion: approve / conditionally approve / deny with specific conditions\n\n## ECOA Adverse Action Reason Codes (sample mapping)\n- Code 1: Delinquent past or present credit obligations with others\n- Code 2: Garnishment or attachment\n- Code 3: Foreclosure or repossession\n- Code 8: Delinquency on accounts with us\n- Code 14: No credit file\n- Code 22: Amount of payments made on delinquent accounts\n\n## Outputs\n- creditManagerSummary: string (markdown formatted)\n- salesNotification: string (plain language)\n- adverseActionNotice: string | null (generated only when adverse action applies)\n- creditCommitteePackage: string (markdown with sections)\n- primaryDecisionDrivers: string[] (top 3 factors that most influenced the decision)\n- recommendedNextSteps: string[] (ordered action items for credit manager)",
  "status": "active"
}
ENDJSON
S6=$(post_api "Credit Decision Explanation Skill" "/api/skills" "$WORK/s6.json")

echo "" >&2

# =============================================================================
# STEP 2: Create Knowledge Base
# =============================================================================
echo "STEP 2: Creating Knowledge Base..." >&2

cat > "$WORK/kb.json" <<'ENDJSON'
{
  "name": "Customer Credit & Risk Assessment Knowledge Base",
  "description": "Primary RAG knowledge base for the Customer Credit & Risk Assessment Agent (OTC-AGT-003). Contains credit policy documentation and scoring model configuration, historical credit decision records with payment outcomes (for model calibration), customer risk tier definitions and tier migration rules, credit bureau data interpretation guides (D&B PAYDEX, Experian Intelliscore, Equifax scoring), industry-specific credit risk profiles and SIC code risk tables, financial ratio benchmarks by industry vertical, regulatory compliance reference materials (ECOA, FCRA, Basel III, IFRS 9), adverse action notice templates and ECOA reason code library, credit committee procedures and approval authority matrix, and operational runbooks for credit process exceptions.",
  "industry": "enterprise",
  "status": "active",
  "vectorDbType": "pgvector",
  "vectorDbConfig": {"schema": "public", "table": "kb_chunks_otc_credit_risk", "indexType": "ivfflat", "indexLists": 100},
  "embeddingModel": "text-embedding-3-small",
  "embeddingDimensions": 1536,
  "chunkSize": 512,
  "chunkOverlap": 64
}
ENDJSON
KB=$(post_api "Customer Credit & Risk Assessment Knowledge Base" "/api/knowledge-bases" "$WORK/kb.json")

echo "" >&2

# =============================================================================
# STEP 3: Create 6 Compliance Policies
# =============================================================================
echo "STEP 3: Creating 6 Compliance Policies..." >&2

cat > "$WORK/p1.json" <<'ENDJSON'
{
  "name": "Equal Credit Opportunity Act (ECOA) — Non-Discriminatory Credit",
  "domain": "fair_lending",
  "scopeType": "agent",
  "status": "active",
  "description": "ECOA (15 U.S.C. § 1691) requires that all credit decisions be based solely on creditworthiness factors and prohibits discrimination based on race, color, religion, national origin, sex, marital status, age, or receipt of public assistance. All credit determinations by this agent must use only permissible financial factors and generate ECOA-compliant adverse action notices when credit is denied or limited.",
  "policyJson": {
    "regulation": "Equal Credit Opportunity Act (15 U.S.C. § 1691) / Regulation B (12 CFR Part 1002)",
    "requirements": [
      "Credit decisions must be based solely on creditworthiness factors: payment history, credit score, financial ratios, exposure, industry risk",
      "Prohibited factors: race, color, religion, national origin, sex, marital status, age, receipt of public assistance, exercising rights under consumer protection laws",
      "When credit is denied, limited, or offered on less favorable terms: generate ECOA-compliant adverse action notice within 30 days",
      "Adverse action notice must include: up to 4 specific reason codes from ECOA/Regulation B approved list",
      "Adverse action notice must include: FCRA disclosure with bureau name and address, right to dispute within 60 days",
      "Retain all credit decision records for 25 months after action (or 12 months for businesses)",
      "Credit scoring model must be empirically derived, statistically sound, and validated for non-discriminatory impact periodically",
      "No proxy variables for prohibited characteristics may be used in model inputs (e.g., zip code as racial proxy)"
    ],
    "enforcement": "hard_block",
    "violationAction": "block_credit_decision_and_alert_compliance_and_legal"
  },
  "ontologyRefs": [
    {"entity": "Credit Score", "attribute": "composite_score"},
    {"entity": "Risk Tier", "attribute": "low"},
    {"entity": "Credit Limit", "attribute": "recommended"}
  ]
}
ENDJSON
P1=$(post_api "Equal Credit Opportunity Act (ECOA)" "/api/policies" "$WORK/p1.json")

cat > "$WORK/p2.json" <<'ENDJSON'
{
  "name": "Fair Credit Reporting Act (FCRA) — Credit Bureau Data Use",
  "domain": "credit_reporting",
  "scopeType": "agent",
  "status": "active",
  "description": "FCRA (15 U.S.C. § 1681) governs the permissible use of credit bureau reports, requires proper disclosure to subjects, mandates procedures for handling disputed information, and restricts re-use of credit reports. This agent must access bureau data only for permissible credit underwriting purposes and generate FCRA-compliant disclosures whenever bureau data influences an adverse credit decision.",
  "policyJson": {
    "regulation": "Fair Credit Reporting Act (15 U.S.C. § 1681) / FCRA as amended by FACTA",
    "requirements": [
      "Access credit bureau reports only for permissible purpose: credit underwriting, account review, or collection (§1681b)",
      "When bureau data contributes to adverse action: include in adverse action notice the bureau name, address, and phone number",
      "Include FCRA consumer rights statement: right to free copy of report within 60 days, right to dispute inaccuracies",
      "Do not share bureau report data outside the credit underwriting workflow — no sharing with sales, marketing, or third parties",
      "Dispute handling: if customer disputes bureau data accuracy, place credit decision on hold pending bureau investigation result",
      "Re-use restriction: bureau reports obtained for credit underwriting may not be used for marketing or other purposes",
      "Retain permissible purpose documentation for each bureau inquiry; log requestor, purpose, date, bureau used",
      "Credit reporting to bureaus: if seller reports payment data back to bureaus, must report accurate data; investigate and correct errors within 30 days"
    ],
    "enforcement": "hard_block",
    "violationAction": "block_bureau_access_and_alert_compliance"
  },
  "ontologyRefs": [
    {"entity": "Credit Score", "attribute": "external_score"},
    {"entity": "Payment History", "attribute": "dispute_rate"}
  ]
}
ENDJSON
P2=$(post_api "Fair Credit Reporting Act (FCRA)" "/api/policies" "$WORK/p2.json")

cat > "$WORK/p3.json" <<'ENDJSON'
{
  "name": "Basel III / IFRS 9 — Expected Credit Loss Provisioning",
  "domain": "credit_risk_management",
  "scopeType": "agent",
  "status": "active",
  "description": "Basel III capital adequacy framework and IFRS 9 financial instruments standard require forward-looking expected credit loss (ECL) provisioning based on probability of default (PD), loss given default (LGD), and exposure at default (EAD). The credit risk scoring model must produce outputs compatible with ECL calculation inputs, and the agent's credit tier assignments must map to standard credit quality classifications used in financial reporting.",
  "policyJson": {
    "regulation": "Basel III (BCBS 189) / IFRS 9 Financial Instruments (IASB 2014)",
    "requirements": [
      "Credit tier assignments must map to Basel PD bands: Low <1%, Medium 1-5%, High 5-20%, Watch 20-40%, Credit Hold >40% PD",
      "Risk scoring model must produce: Probability of Default (PD), Loss Given Default (LGD), Exposure at Default (EAD) as outputs for finance integration",
      "Stage classification for IFRS 9: Stage 1 (performing, <30 days past due), Stage 2 (significant credit deterioration), Stage 3 (credit-impaired)",
      "Forward-looking information: model must incorporate forward-looking macroeconomic scenarios in PD estimates (IFRS 9 §5.5.17)",
      "Significant increase in credit risk (SICR): flag accounts moving from Stage 1 to Stage 2 based on defined thresholds (credit score drop >20 pts, tier downgrade, 30 DPD)",
      "ECL output fields required for finance: 12-month ECL (Stage 1), lifetime ECL (Stage 2/3), provision amount, coverage ratio",
      "Credit limit recommendations must consider portfolio concentration limits and single-name exposure caps per Basel large exposure rules",
      "Quarterly model validation: back-test PD estimates against realized defaults; report to Risk Committee"
    ],
    "enforcement": "soft_block_with_justification",
    "violationAction": "flag_for_finance_and_risk_committee_review"
  },
  "ontologyRefs": [
    {"entity": "Credit Score", "attribute": "composite_score"},
    {"entity": "Exposure", "attribute": "total_exposure"},
    {"entity": "Risk Tier", "attribute": "watch_list"}
  ]
}
ENDJSON
P3=$(post_api "Basel III / IFRS 9 ECL Provisioning" "/api/policies" "$WORK/p3.json")

cat > "$WORK/p4.json" <<'ENDJSON'
{
  "name": "GDPR / CCPA — Credit Data Privacy",
  "domain": "data_privacy",
  "scopeType": "agent",
  "status": "active",
  "description": "GDPR (EU) 2016/679 and California Consumer Privacy Act (CCPA) / CPRA impose obligations on the processing of personal and financial data used in credit risk assessments. The agent must process customer financial data under a valid legal basis, honor data subject rights including explanation of automated decisions, and apply data minimization and purpose limitation principles to bureau and financial data.",
  "policyJson": {
    "regulation": "GDPR (EU) 2016/679 / CCPA (Cal. Civ. Code §1798.100) / CPRA",
    "requirements": [
      "Legal basis for processing: B2B credit assessments use 'legitimate interests' (GDPR Art. 6(1)(f)) for existing customers; pre-contractual necessity (Art. 6(1)(b)) for new customers",
      "Data minimization: retrieve only the financial data fields required for the specific credit decision; do not pull full bureau reports when a score-only query suffices",
      "Purpose limitation: financial data accessed for credit underwriting may not be used for marketing, profiling, or other purposes",
      "Automated decision-making (GDPR Art. 22): credit decisions with significant effect on business relations must offer human review option on request",
      "Right to explanation: when an automated credit decision is made, customer can request explanation of the principal factors — provide via Credit Decision Explanation Skill output",
      "Data retention: credit decision records retained per minimum legal requirements (25 months ECOA, 5 years FCRA investigations) then deleted or anonymized",
      "CCPA: California business customers have right to know what financial data is collected and shared with bureaus; honor opt-out of data sale",
      "Cross-border data: EU customer financial data must not be processed on servers outside EU/EEA without adequate transfer safeguards (SCCs or adequacy decision)"
    ],
    "enforcement": "soft_block_with_justification",
    "violationAction": "flag_for_privacy_review_and_block_data_export"
  },
  "ontologyRefs": [
    {"entity": "Credit Score", "attribute": "external_score"},
    {"entity": "Financial Signal", "attribute": "revenue_trend"}
  ]
}
ENDJSON
P4=$(post_api "GDPR / CCPA Credit Data Privacy" "/api/policies" "$WORK/p4.json")

cat > "$WORK/p5.json" <<'ENDJSON'
{
  "name": "SOX Internal Controls — Credit Decision Audit Trail",
  "domain": "internal_controls",
  "scopeType": "agent",
  "status": "active",
  "description": "Sarbanes-Oxley Act (SOX) Sections 302 and 404 require that internal controls over financial reporting be documented, tested, and operating effectively. Credit decisions impact accounts receivable valuation and bad debt provisioning — both material to financial reporting. Every credit decision made by this agent must be fully auditable with immutable logs capturing the decision, inputs, model version, and authority level.",
  "policyJson": {
    "regulation": "Sarbanes-Oxley Act (SOX) §§302 and 404 / PCAOB AS 2201",
    "requirements": [
      "Every credit decision (new limit, limit change, tier change, credit hold, release) must be logged with: timestamp, decision, composite score, all input signals, model version, and acting entity (agent ID or human approver)",
      "Credit decisions above materiality threshold ($500K limit or >$100K limit change) require human approval — agent may recommend but not finalize unilaterally",
      "Segregation of duties: agent that assesses credit risk may not also approve the credit limit increase — approval must route to credit manager or credit committee",
      "Audit log must be immutable: credit decision logs cannot be modified or deleted after creation; use append-only audit table",
      "Model version tracking: every credit score computation must record the scoring model version used to enable retrospective audit",
      "Quarterly SOX testing: credit decision logs must be producible for auditor review; sample of 25 decisions per quarter must be validated by Credit Manager",
      "Exception documentation: any credit decision that deviates from model recommendation must include documented justification with approver name and rationale",
      "Financial close: credit decision logs feed into AR aging and bad debt reserve calculations used in financial close process"
    ],
    "enforcement": "hard_block",
    "violationAction": "block_high_value_credit_decisions_without_human_approval_and_alert_finance_controller"
  },
  "ontologyRefs": [
    {"entity": "Credit Limit", "attribute": "approved"},
    {"entity": "Exposure", "attribute": "total_exposure"},
    {"entity": "Risk Tier", "attribute": "credit_hold"}
  ]
}
ENDJSON
P5=$(post_api "SOX Internal Controls — Credit Audit Trail" "/api/policies" "$WORK/p5.json")

cat > "$WORK/p6.json" <<'ENDJSON'
{
  "name": "OFAC / AML — Sanctions Screening for Credit Customers",
  "domain": "sanctions_compliance",
  "scopeType": "agent",
  "status": "active",
  "description": "Before extending or modifying credit to any customer, the agent must screen the customer and its beneficial owners against OFAC SDN and consolidated sanctions lists, and apply AML red-flag indicators to identify money laundering risk in credit relationships. Credit must not be extended to sanctioned entities under any circumstances, and structuring of credit arrangements to evade AML thresholds is prohibited.",
  "policyJson": {
    "regulation": "OFAC (31 CFR Chapter V) / Bank Secrecy Act (31 U.S.C. §§5311-5336) / FinCEN CDD Rule",
    "requirements": [
      "Screen customer legal name and all known aliases against current OFAC SDN list before any credit extension or modification",
      "Screen beneficial owners (≥25% ownership) of corporate credit customers against OFAC SDN — OFAC 50% rule applies",
      "Screen against OFAC comprehensive country sanctions programs: Cuba, Iran, North Korea, Syria, Crimea, Russia (specific sectors)",
      "Fuzzy matching: flag any ≥85% name similarity score for manual compliance review before credit is granted",
      "AML red flags in credit context: unusual request for large credit limit with limited business history, structuring credit requests to stay below reporting thresholds, rapid credit drawdown followed by large payments, third-party payers on credit account",
      "Politically Exposed Persons (PEP): apply enhanced due diligence for PEP individuals in ownership or control of customer — document basis for credit extension",
      "Suspicious activity: any credit-related transaction with AML red flags must be documented and reported to BSA Officer for SAR assessment",
      "Hard block on any confirmed OFAC SDN match — no override permitted without OFAC license and Legal + Compliance Officer authorization"
    ],
    "enforcement": "hard_block",
    "violationAction": "block_credit_extension_and_alert_compliance_legal_and_bsa_officer"
  },
  "ontologyRefs": [
    {"entity": "Credit Limit", "attribute": "approved"},
    {"entity": "Financial Signal", "attribute": "news_sentiment"}
  ]
}
ENDJSON
P6=$(post_api "OFAC / AML Sanctions Screening — Credit" "/api/policies" "$WORK/p6.json")

echo "" >&2

# =============================================================================
# STEP 4: Create Agent (base fields)
# =============================================================================
echo "STEP 4: Creating Customer Credit & Risk Assessment Agent (OTC-AGT-003)..." >&2

cat > "$WORK/agent.json" <<'ENDJSON'
{
  "name": "Customer Credit & Risk Assessment Agent",
  "agentType": "single",
  "description": "OTC-AGT-003 | Risk Management | Continuously evaluates customer creditworthiness using internal payment history, external credit bureau data, and real-time financial signals. Dynamically adjusts credit limits, recommends payment terms, and flags high-risk accounts for human review. Triggered by new customer onboarding, periodic review schedules, or order-triggered credit checks from OTC-AGT-002. Proactively identifies deteriorating credit conditions before they impact order flow.",
  "owner": "Order-to-Cash Platform Team",
  "status": "active",
  "riskTier": "HIGH",
  "autonomyMode": "assisted",
  "environment": "staging",
  "modelProvider": "anthropic",
  "modelName": "claude-opus-4-5",
  "department": "Credit & Risk Management",
  "toolAccessClass": "standard",
  "complianceTags": ["ECOA", "FCRA", "BaselIII", "IFRS9", "GDPR", "CCPA", "SOX", "OFAC", "AML", "BSA"],
  "ontologyTags": {
    "process": "Order-to-Cash",
    "stage": "Credit & Risk Management",
    "agentCode": "OTC-AGT-003",
    "category": "Risk Management",
    "domain": "Credit-Risk-Management",
    "upstreamAgent": "OTC-AGT-002",
    "downstreamAgent": "OTC-AGT-002"
  },
  "systemPrompt": "You are the Customer Credit & Risk Assessment Agent (OTC-AGT-003) for the Order-to-Cash platform. Your role is to continuously evaluate customer creditworthiness, dynamically manage credit limits, and proactively identify deteriorating credit conditions before they disrupt order flow.\n\n## Your Core Mission\nProtect the organization's accounts receivable portfolio by:\n1. Conducting thorough, data-driven credit assessments at every trigger point\n2. Integrating internal payment behavior with external bureau data and financial signals\n3. Calculating composite risk scores using a transparent, auditable weighted model\n4. Recommending credit limits and payment terms proportional to each customer's risk profile\n5. Detecting early warning signals before credit deterioration reaches the bureau data\n6. Flagging high-risk accounts for human credit manager review with clear rationale\n7. Updating credit records in ERP/CRM and notifying sales and order management\n8. Scheduling proactive review cycles based on risk tier\n\n## Trigger Conditions That Activate You\n- New customer onboarding: initial credit assessment before first order is accepted\n- Periodic review schedule: Low risk=annual, Medium=semi-annual, High=quarterly, Watch=monthly\n- Order-triggered check from OTC-AGT-002: when an order would exceed current credit limit or current limit is stale (>30 days without review)\n- Event-triggered review: news signal, bureau score change, payment behavior deterioration, or internal audit flag\n\n## Credit Decision Principles\n- Always use the most recent available data from all three signal sources: internal payment behavior, external bureau, financial statements\n- When data is incomplete: be conservative — apply the more restrictive credit tier\n- Human review is required for: credit holds, limit reductions >25%, any limit >$500K\n- Every decision must generate a full audit trail and human-readable explanation\n- Adverse action notices (ECOA/FCRA compliant) must be generated for any credit denial or reduction\n\n## Compliance Requirements\n- ECOA: base all decisions solely on creditworthiness factors — never on prohibited characteristics\n- FCRA: bureau data used only for credit underwriting; generate compliant adverse action notices\n- SOX: all credit decisions are immutably logged; decisions above materiality threshold require human approval\n- OFAC/AML: screen every customer and beneficial owner before extending or modifying credit\n- Basel III/IFRS 9: provide PD, LGD, EAD outputs for finance ECL provisioning\n- GDPR/CCPA: data minimization, purpose limitation, right to explanation on automated decisions",
  "toolsConfig": {
    "tools": [
      {"id": "bureau.dnb_pull_report",          "name": "D&B Credit Report",              "description": "Pull Dun & Bradstreet commercial credit report including PAYDEX, Failure Score, Delinquency Predictor, trade experiences, and public records",             "rateLimit": 100, "timeout": 20000},
      {"id": "bureau.experian_pull_report",      "name": "Experian Business Report",       "description": "Pull Experian Business credit report including Intelliscore Plus, Financial Stability Risk Rating, payment trend, and DBT",                              "rateLimit": 100, "timeout": 20000},
      {"id": "bureau.equifax_pull_report",       "name": "Equifax Business Report",        "description": "Pull Equifax Business credit report including Business Credit Risk Score, Business Failure Score, Payment Index, and trade details",                   "rateLimit": 100, "timeout": 20000},
      {"id": "bureau.get_cached_report",         "name": "Cached Bureau Report",           "description": "Retrieve last cached bureau report with staleness metadata when live pull is unavailable",                                                             "rateLimit": 200, "timeout": 5000},
      {"id": "ar.get_payment_history",           "name": "AR Payment History",             "description": "Retrieve complete payment history for customer from accounts receivable system including all invoice payment records",                                   "rateLimit": 200, "timeout": 10000},
      {"id": "ar.calculate_dso",                 "name": "DSO Calculator",                 "description": "Calculate rolling DSO, Best Possible DSO, and DSO trend for customer over specified period",                                                           "rateLimit": 200, "timeout": 8000},
      {"id": "ar.get_aging_buckets",             "name": "AR Aging Analysis",              "description": "Retrieve AR aging bucket breakdown (current, 30, 60, 90, 120+ days) for customer with trend over 6 months",                                           "rateLimit": 200, "timeout": 8000},
      {"id": "ar.get_dispute_history",           "name": "Dispute & Deduction History",    "description": "Retrieve invoice dispute and unauthorized deduction history including frequency, amounts, and resolution times",                                        "rateLimit": 200, "timeout": 8000},
      {"id": "financials.pull_sec_filing",       "name": "SEC Filing Retrieval",           "description": "Pull 10-K or 10-Q from SEC EDGAR for public companies using CIK or ticker symbol",                                                                    "rateLimit": 50,  "timeout": 30000},
      {"id": "financials.extract_ratios",        "name": "Financial Ratio Extractor",      "description": "Extract and compute financial ratios from uploaded financial statements or SEC filing data",                                                            "rateLimit": 100, "timeout": 20000},
      {"id": "financials.compute_z_score",       "name": "Altman Z-Score Calculator",      "description": "Compute Altman Z-Score for public or private companies from balance sheet and income statement inputs",                                                "rateLimit": 100, "timeout": 10000},
      {"id": "scoring.calculate_composite",      "name": "Composite Risk Score",           "description": "Calculate weighted composite credit score from all input signals with configurable weights per customer segment",                                       "rateLimit": 200, "timeout": 10000},
      {"id": "scoring.determine_credit_tier",    "name": "Credit Tier Assignment",         "description": "Map composite score to credit tier: Low / Medium / High / Watch List / Credit Hold",                                                                   "rateLimit": 200, "timeout": 5000},
      {"id": "scoring.calculate_recommended_limit","name": "Credit Limit Calculator",      "description": "Calculate recommended credit limit based on tier multiplier, AR volume, portfolio caps, and exposure policy",                                          "rateLimit": 200, "timeout": 8000},
      {"id": "news.search_company",              "name": "Company News Search",            "description": "Search financial news and press releases for early warning distress signals about the customer organization",                                           "rateLimit": 100, "timeout": 15000},
      {"id": "news.get_rating_changes",          "name": "Rating Agency Actions",          "description": "Retrieve credit rating actions and outlook changes from S&P, Moody's, and Fitch for the customer",                                                    "rateLimit": 100, "timeout": 10000},
      {"id": "explain.generate_credit_rationale","name": "Credit Decision Explanation",    "description": "Generate human-readable credit decision rationale for credit manager, sales team, and ECOA/FCRA-compliant adverse action notices",                    "rateLimit": 100, "timeout": 20000},
      {"id": "crm.update_credit_record",         "name": "ERP/CRM Credit Record Update",  "description": "Update the customer credit record in ERP/CRM with new tier, limit, terms, review date, and decision audit entry",                                     "rateLimit": 100, "timeout": 15000}
    ]
  },
  "rollbackPlan": {
    "version": "1.0.0",
    "procedure": "Revert credit limit to prior approved value in ERP/CRM, notify credit manager and sales of rollback, flag order management to apply previous credit terms, document rollback reason in credit audit log",
    "runbook": "See Production Runbooks — False Credit Hold (expedited release procedure)"
  }
}
ENDJSON
AGENT=$(post_api "Customer Credit & Risk Assessment Agent (OTC-AGT-003)" "/api/agents" "$WORK/agent.json")

echo "" >&2

# =============================================================================
# STEP 5: PATCH agent with all dynamic IDs
# =============================================================================
echo "STEP 5: Wiring skills, policies, KB config, and blueprint to agent..." >&2

jq -n \
  --arg kb "$KB" \
  --arg s1 "$S1" --arg s2 "$S2" --arg s3 "$S3" \
  --arg s4 "$S4" --arg s5 "$S5" --arg s6 "$S6" \
  --arg p1 "$P1" --arg p2 "$P2" --arg p3 "$P3" \
  --arg p4 "$P4" --arg p5 "$P5" --arg p6 "$P6" \
  '{
    preloadedSkills: [
      {skillId: $s1, loadOrder: 1},
      {skillId: $s2, loadOrder: 2},
      {skillId: $s3, loadOrder: 3},
      {skillId: $s4, loadOrder: 4},
      {skillId: $s5, loadOrder: 5},
      {skillId: $s6, loadOrder: 6}
    ],
    policyBindings: {
      policies: [
        {policyId: $p1, enforcement: "active"},
        {policyId: $p2, enforcement: "active"},
        {policyId: $p3, enforcement: "active"},
        {policyId: $p4, enforcement: "active"},
        {policyId: $p5, enforcement: "active"},
        {policyId: $p6, enforcement: "active"}
      ]
    },
    memoryRagConfig: {
      primaryKnowledgeBase: $kb,
      embeddingModel: "text-embedding-3-small",
      topK: 8,
      scoreThreshold: 0.72,
      chunkStrategy: "fixed_with_overlap",
      sources: [{type: "knowledge_base", id: $kb, description: "Credit policy docs, historical decision records, bureau interpretation guides, industry risk tables, financial ratio benchmarks, ECOA/FCRA/Basel regulatory references, adverse action templates, credit committee procedures, operational runbooks"}]
    },
    runtimeConfig: {
      prompt: "Conduct a complete credit risk assessment for the specified customer account.\n\n## What You Do On Each Invocation\n\nYou are triggered by one of three conditions: new customer onboarding, periodic review schedule, or an order-triggered credit check from OTC-AGT-002. Your job is to gather all available credit signals, calculate a composite risk score, determine the appropriate credit tier and limit, and communicate the decision to all stakeholders with full audit trail.\n\n## Step-by-Step Execution\n\n**Step 1 — Retrieve Internal Payment History**\nUse the Payment Pattern Analysis Skill to:\n- Calculate rolling 12-month DSO and 3-month DSO trend\n- Retrieve AR aging bucket breakdown and identify any 60+ day balances\n- Compute on-time payment rate and dispute/deduction frequency\n- Determine payment signal: GREEN / AMBER / RED / CRITICAL\n\n**Step 2 — Pull External Bureau Data**\nUse the Credit Bureau Integration Skill to:\n- Pull reports from D&B, Experian Business, and Equifax Business in parallel\n- Extract PAYDEX, Intelliscore Plus, Business Credit Risk Score\n- Retrieve Days Beyond Terms (DBT) and public records from all bureaus\n- Normalize into unified credit profile\n- Handle bureau unavailability per fallback procedure\n\n**Step 3 — Analyze Financial Statements**\nIf financial statements are available (public company via SEC EDGAR, or uploaded):\n- Use the Financial Statement Parser Skill to extract key ratios\n- Calculate Altman Z-Score and industry percentile ranking\n- Identify deteriorating trends in liquidity, leverage, or profitability\nIf statements are unavailable: note data gap; weight bureau and internal signals more heavily\n\n**Step 4 — Scan News and Market Signals**\nUse the News & Signal Monitoring Skill to:\n- Search for high-severity distress signals: layoffs, bankruptcy filings, rating downgrades\n- Check for rating agency actions in the past 90 days\n- Compute 30-day sentiment score and trend\n- Determine if any signals require immediate review escalation\n\n**Step 5 — Calculate Composite Risk Score**\nUse the Risk Scoring Model Skill to:\n- Aggregate all signals with configured weights\n- Apply tier caps for CRITICAL payment signals or active public records\n- Produce composite score (0-100), credit tier, recommended limit, and payment terms\n- Calculate exposure: open orders + open AR + proposed limit headroom\n- Compare recommended limit against current approved limit\n\n**Step 6 — Compare Against Current Exposure**\n- Retrieve current open orders value and open AR balance\n- Calculate total exposure and utilization percentage\n- Identify if customer is approaching or exceeding credit limit\n- Flag accounts where exposure exceeds 90% of approved limit\n\n**Step 7 — Apply SOX and OFAC Compliance Checks**\n- Screen customer and beneficial owners against OFAC SDN list\n- Verify decision falls within agent authority (limits >$500K require human approval)\n- Prepare audit log entry with all inputs, score components, model version, and decision\n\n**Step 8 — Flag High-Risk Accounts for Human Review**\nRoute to Credit Manager for human review if:\n- Credit tier is Watch List or Credit Hold\n- Recommended limit differs from current limit by >25%\n- Any high-severity news signal detected\n- Customer is requesting a limit increase while on Watch List\n- New customer with no internal payment history and bureau score <40\n- OFAC match or AML red flag detected (immediate escalation to Compliance)\n\n**Step 9 — Update Credit Record in ERP/CRM**\n- Update customer credit record with: new tier, recommended limit, payment terms, review date\n- Attach decision audit entry with all supporting signals and model outputs\n- Set next review schedule based on tier: Low=12mo, Medium=6mo, High=3mo, Watch=1mo\n\n**Step 10 — Notify Sales and Order Management**\n- Generate sales notification via Credit Decision Explanation Skill: available credit, applicable terms, any conditions\n- Notify OTC-AGT-002 (Order Validation Agent) of updated credit limit and terms for pending orders\n- If credit hold: immediate notification to sales manager and order management with hold reason\n\n**Step 11 — Generate Adverse Action Notice (if applicable)**\n- If credit is denied, limited, or offered on less favorable terms than customer requested:\n- Use Credit Decision Explanation Skill to generate ECOA-compliant adverse action notice\n- Include up to 4 ECOA reason codes and FCRA bureau disclosure\n- Route notice for delivery within 30 days of decision",
      scheduleIntervalMinutes: 0,
      maxToolIterations: 25,
      timeoutMs: 180000,
      latencyTargetMs: 60000,
      retryPolicy: {"maxRetries": 3, "backoffMs": 3000},
      humanInLoopEvents: ["credit_hold", "watch_list_assignment", "limit_reduction_over_25pct", "high_value_limit_over_500k", "ofac_match", "aml_red_flag", "high_severity_news_signal"],
      auditLevel: "full"
    },
    blueprintJson: {
      nodes: [
        {id: "trigger_and_context",    type: "input_capture",  label: "Trigger & Customer Context",          description: "Accept trigger event: new_customer_onboarding | periodic_review | order_triggered_check. Load customer profile from ERP/CRM"},
        {id: "payment_history",        type: "skill_invoke",   label: "Payment Pattern Analysis",            skillId: $s2, description: "Calculate DSO, aging buckets, on-time rate, dispute rate, and payment trend signal (GREEN/AMBER/RED/CRITICAL)"},
        {id: "bureau_pull",            type: "skill_invoke",   label: "Credit Bureau Data Pull",             skillId: $s1, description: "Pull D&B, Experian Business, Equifax Business reports in parallel; normalize into unified credit profile with DBT and public records"},
        {id: "financial_analysis",     type: "skill_invoke",   label: "Financial Statement Analysis",        skillId: $s3, description: "Extract financial ratios and compute Altman Z-Score from SEC EDGAR or uploaded statements; skip if unavailable with data-gap flag"},
        {id: "news_monitoring",        type: "skill_invoke",   label: "News & Market Signal Scan",           skillId: $s5, description: "Scan for high-severity distress signals: layoffs, bankruptcy, rating downgrades, litigation; compute 30-day sentiment score"},
        {id: "composite_scoring",      type: "skill_invoke",   label: "Composite Risk Score Calculation",    skillId: $s4, description: "Calculate weighted composite score (0-100), assign credit tier, compute recommended credit limit and payment terms, run IFRS 9 ECL outputs"},
        {id: "exposure_comparison",    type: "llm_generate",   label: "Exposure vs. Limit Comparison",       description: "Compare total exposure (open orders + open AR) against current and recommended credit limit; flag accounts at >90% utilization"},
        {id: "compliance_screening",   type: "tool_call",      label: "OFAC / AML Compliance Screen",        tool: "bureau.normalize_profile", description: "Screen customer and beneficial owners against OFAC SDN list; apply AML red-flag checks; prepare SOX audit log entry"},
        {id: "human_review_gate",      type: "human_in_loop",  label: "Credit Manager Review",               description: "Route to Credit Manager for human decision when tier is Watch/Hold, limit change >25%, limit >$500K, high-severity news, OFAC/AML flag", condition: "creditTier IN [watch_list, credit_hold] OR limitChangePct > 0.25 OR recommendedLimit > 500000 OR highSeverityEvent OR ofacFlag"},
        {id: "update_credit_record",   type: "tool_call",      label: "Update ERP/CRM Credit Record",        tool: "crm.update_credit_record", description: "Write new tier, limit, payment terms, next review date, and full decision audit entry to ERP/CRM customer credit record"},
        {id: "explain_and_notify",     type: "skill_invoke",   label: "Credit Decision Explanation & Notify", skillId: $s6, description: "Generate credit manager summary, sales notification, and ECOA adverse action notice (if applicable); notify OTC-AGT-002 of updated terms"}
      ],
      edges: [
        {from: "trigger_and_context",  to: "payment_history"},
        {from: "payment_history",      to: "bureau_pull"},
        {from: "bureau_pull",          to: "financial_analysis"},
        {from: "financial_analysis",   to: "news_monitoring"},
        {from: "news_monitoring",      to: "composite_scoring"},
        {from: "composite_scoring",    to: "exposure_comparison"},
        {from: "exposure_comparison",  to: "compliance_screening"},
        {from: "compliance_screening", to: "human_review_gate"},
        {from: "human_review_gate",    to: "update_credit_record", condition: "decision_confirmed"},
        {from: "update_credit_record", to: "explain_and_notify"}
      ]
    }
  }' > "$WORK/agent_patch.json"

PATCH_RESP=$(curl -s -X PATCH "${BASE_URL}/api/agents/${AGENT}" \
  -H "Content-Type: application/json" \
  -d @"$WORK/agent_patch.json")
PATCH_ID=$(echo "$PATCH_RESP" | jq -r '.id // empty')
if [ -z "$PATCH_ID" ]; then
  echo "  ✗ FAILED: Agent PATCH" >&2
  echo "    Response: $PATCH_RESP" >&2
  exit 1
fi
echo "  ✓ Agent wired with 6 skills, 6 policies, KB, and 11-node blueprint" >&2

echo "" >&2

# =============================================================================
# STEP 6: Link Knowledge Base to Agent
# =============================================================================
echo "STEP 6: Linking Knowledge Base to Agent..." >&2

jq -n --arg kb "$KB" \
  '{knowledgeBaseId: $kb, priority: 1, retrievalConfig: {topK: 8, scoreThreshold: 0.72, hybridSearch: true, reranker: "cross-encoder"}}' \
  > "$WORK/kb_link.json"

KB_LINK=$(curl -s -X POST "${BASE_URL}/api/agents/${AGENT}/knowledge-bases" \
  -H "Content-Type: application/json" \
  -d @"$WORK/kb_link.json")
KB_LINK_ID=$(echo "$KB_LINK" | jq -r '.id // empty')
if [ -z "$KB_LINK_ID" ]; then
  echo "  ✗ FAILED: KB link" >&2
  echo "    Response: $KB_LINK" >&2
  exit 1
fi
echo "  ✓ Knowledge Base linked → $KB_LINK_ID" >&2

echo "" >&2

# =============================================================================
# STEP 7: Create Evaluation Golden Dataset
# =============================================================================
echo "STEP 7: Creating Evaluation Golden Dataset..." >&2

cat > "$WORK/dataset.json" <<'ENDJSON'
{
  "name": "Customer Credit & Risk Assessment Agent Evaluation Dataset",
  "description": "Evaluation benchmark for OTC-AGT-003. Contains historical credit decisions with known payment outcomes (default / non-default) across all risk tiers. Covers: happy-path standard reviews for each credit tier (Low, Medium, High, Watch, Hold); edge cases including rapid-growth companies with limited history, seasonal businesses with lumpy DSO, and conglomerate subsidiaries with parent guarantees; false positive analysis — accounts incorrectly flagged as high risk that paid fully on time; false negative analysis — accounts that appeared low risk but subsequently defaulted; stress test scenarios simulating economic downturn impact on portfolio; bureau data gap scenarios (one or more bureaus unavailable); news signal impact cases (layoff announcement, rating downgrade, litigation filing) and their subsequent payment outcomes. Benchmark: agent credit decisions must match expert credit analyst determinations 90%+ of the time across all tiers.",
  "industry": "enterprise",
  "useCase": "credit_risk_assessment",
  "version": "1.0.0",
  "testCaseCount": 800,
  "scenarioCategories": {
    "happyPathByTier": 200,
    "edgeCasesGrowthSeasonal": 100,
    "falsePositiveAnalysis": 100,
    "falseNegativeAnalysis": 100,
    "stressTestScenarios": 100,
    "bureauDataGap": 80,
    "newsSignalImpact": 120
  },
  "qualityCoverage": 0.93,
  "coverageDimensions": [
    {"dimension": "Credit Tier Accuracy", "description": "Agent assigns correct credit tier (Low/Medium/High/Watch/Hold) vs. expert credit analyst determination", "targetPassRate": 0.90},
    {"dimension": "Credit Limit Recommendation Accuracy", "description": "Agent recommended limit within ±20% of expert-determined appropriate limit for the customer profile", "targetPassRate": 0.88},
    {"dimension": "High-Risk Detection Rate", "description": "Agent correctly identifies Watch List and Credit Hold accounts vs. expert classification", "targetPassRate": 0.93},
    {"dimension": "False Credit Hold Rate", "description": "Rate of accounts incorrectly placed on credit hold when expert determines credit should be approved", "targetPassRate": 0.97},
    {"dimension": "Default Prediction Accuracy", "description": "Accounts scored as Credit Hold subsequently defaulted within 12 months vs. accounts scored as Low risk that did not default", "targetPassRate": 0.87},
    {"dimension": "ECOA Adverse Action Compliance", "description": "All adverse action notices contain required ECOA reason codes and FCRA bureau disclosures", "targetPassRate": 1.0},
    {"dimension": "OFAC Screening Coverage", "description": "100% of customers screened against OFAC SDN before credit extension; zero missed matches", "targetPassRate": 1.0},
    {"dimension": "SOX Audit Log Completeness", "description": "Every credit decision has a complete audit log entry with all required fields", "targetPassRate": 1.0},
    {"dimension": "Assessment Latency SLA (60s)", "description": "Full 11-step credit assessment completes within 60-second target latency for standard reviews", "targetPassRate": 0.92},
    {"dimension": "Expert Analyst Agreement Rate", "description": "Overall decision (tier + terms) matches expert credit analyst determination 90%+ of time", "targetPassRate": 0.90}
  ],
  "benchmarkAvg": 0.937,
  "benchmarkRange": {"low": 0.87, "high": 1.0},
  "contributorCount": 5,
  "contributors": [
    {"role": "Senior Credit Manager", "contribution": "200 tier classification validations and limit approval benchmarks"},
    {"role": "Credit Risk Analyst", "contribution": "200 edge case and stress scenario annotations with actual payment outcomes"},
    {"role": "Compliance Officer", "contribution": "120 ECOA adverse action and OFAC screening compliance validations"},
    {"role": "CFO / Finance Controller", "contribution": "80 Basel III / IFRS 9 ECL output validations for finance reporting alignment"},
    {"role": "AR Collections Manager", "contribution": "200 false positive/negative analysis with post-decision payment outcome tracking"}
  ],
  "performanceBenchmarks": [
    {"metric": "assessment_latency_p95", "target": 60000, "unit": "ms", "description": "95th percentile full credit assessment time under 60 seconds"},
    {"metric": "credit_tier_accuracy", "target": 0.90, "unit": "ratio", "description": "Credit tier assignment matches expert credit analyst determination 90% of time"},
    {"metric": "default_prediction_precision", "target": 0.87, "unit": "ratio", "description": "Credit Hold predictions that subsequently defaulted (precision)"},
    {"metric": "false_credit_hold_rate", "target": 0.03, "unit": "ratio", "description": "Maximum 3% false credit hold rate — accounts incorrectly placed on hold"},
    {"metric": "ecoa_compliance_rate", "target": 1.0, "unit": "ratio", "description": "Zero tolerance: 100% of adverse actions include compliant ECOA notice"},
    {"metric": "ofac_match_detection", "target": 1.0, "unit": "ratio", "description": "Zero tolerance: 100% detection of OFAC SDN matches before credit extension"},
    {"metric": "expert_agreement_rate", "target": 0.90, "unit": "ratio", "description": "Overall decision matches expert analyst determination 90%+ of cases"}
  ],
  "dataRecordCount": 800,
  "tags": ["credit-risk", "credit-assessment", "order-to-cash", "credit-bureau", "payment-history", "financial-ratios", "ecoa", "fcra", "ofac", "sox", "otc-agt-003"],
  "aiGenerated": false,
  "status": "active"
}
ENDJSON
DS=$(post_api "Customer Credit & Risk Assessment Evaluation Dataset" "/api/golden-datasets" "$WORK/dataset.json")

echo "" >&2

# =============================================================================
# STEP 8: Create 6 Operational Runbooks
# =============================================================================
echo "STEP 8: Creating 6 Operational Runbooks..." >&2

cat > "$WORK/rb1.json" <<'ENDJSON'
{
  "name": "Credit Bureau API Down",
  "description": "Fallback and recovery procedure when one or more credit bureau APIs (D&B, Experian, Equifax) are unavailable during a credit assessment. Ensures credit decisions are not permanently blocked while maintaining credit risk controls through cached data, conservative scoring adjustments, and manual review queue activation.",
  "industry": "enterprise",
  "category": "incident_response",
  "triggerType": "automated",
  "triggerConditions": ["bureau_api_timeout", "bureau_api_5xx_error", "bureau_connection_refused", "bureau_rate_limit_exceeded"],
  "steps": [
    {"id": "s1", "label": "Detect bureau outage",                    "type": "detection",    "description": "Alert when any bureau API returns 5xx or times out after 3 attempts within 60 seconds; log which bureau(s) affected and time of failure"},
    {"id": "s2", "label": "Attempt secondary bureau fallback",        "type": "action",       "description": "If D&B down: attempt Experian and Equifax; if Experian down: attempt D&B and Equifax; continue assessment with available bureaus; mark missing bureau in profile"},
    {"id": "s3", "label": "Activate cached report fallback",          "type": "action",       "description": "If all bureaus down: load last cached bureau reports; apply staleness flag; apply 15-point conservative downward adjustment to bureau signal score component"},
    {"id": "s4", "label": "Activate manual review queue",             "type": "action",       "description": "Route all new credit assessments triggered during bureau outage to manual credit manager review queue; include staleness flag and available internal payment data"},
    {"id": "s5", "label": "Notify credit manager and bureau contact", "type": "notification", "description": "Alert credit manager of bureau outage status; contact bureau technical support for ETA; log incident in system for SOX audit purposes"},
    {"id": "s6", "label": "Resume automated assessments",             "type": "action",       "description": "When bureau APIs restored: re-run queued assessments automatically; do not auto-apply cached-data decisions to high-risk or Watch/Hold tier accounts — require fresh bureau pull"}
  ],
  "autonomyLevel": "human_in_loop",
  "status": "active",
  "isPreBuilt": false,
  "severity": "high",
  "estimatedDuration": "1-4 hours"
}
ENDJSON
RB1=$(post_api "Runbook: Credit Bureau API Down" "/api/runbooks" "$WORK/rb1.json")

cat > "$WORK/rb2.json" <<'ENDJSON'
{
  "name": "Mass Credit Limit Breach",
  "description": "Bulk processing procedure for handling portfolio-wide credit limit breaches during macro-economic stress events (e.g., recession, industry downturn, supply chain crisis). Provides a structured approach to triage, prioritize, and process large volumes of accounts simultaneously breaching credit thresholds without overwhelming the credit review queue.",
  "industry": "enterprise",
  "category": "incident_response",
  "triggerType": "manual",
  "triggerConditions": ["portfolio_breach_rate_exceeds_10pct", "economic_stress_event_declared", "credit_committee_emergency_session"],
  "steps": [
    {"id": "s1", "label": "Declare mass breach event",               "type": "detection",    "description": "CFO or Credit Manager declares mass breach event when >10% of customer portfolio simultaneously exceeds credit limits; activate emergency credit review protocol"},
    {"id": "s2", "label": "Pause automated limit enforcement",       "type": "action",       "description": "Temporarily suspend automatic order holds for limit breaches; apply manual override flag to all accounts; set grace period (default: 72 hours) for review completion"},
    {"id": "s3", "label": "Prioritize accounts for review",          "type": "action",       "description": "Sort all breaching accounts by exposure value descending; tier 1: accounts with exposure >$250K; tier 2: $50K-$250K; tier 3: <$50K; process tier 1 within 24 hours"},
    {"id": "s4", "label": "Bulk credit reassessment",                "type": "action",       "description": "Run batch credit assessments using current bureau data for all breaching accounts; use stress-scenario scoring with industry downturn factor applied; generate summary report"},
    {"id": "s5", "label": "Credit committee emergency review",       "type": "approval",     "description": "Present batch reassessment results to Credit Committee; obtain bulk approval for tier adjustments; document all decisions with committee member names and rationale"},
    {"id": "s6", "label": "Apply portfolio-level decisions",         "type": "action",       "description": "Apply approved tier and limit changes in bulk to ERP/CRM; generate adverse action notices for accounts receiving limit reductions; notify sales for all affected accounts"},
    {"id": "s7", "label": "Resume normal enforcement",               "type": "action",       "description": "After all accounts processed: remove grace period flag; restore normal automated enforcement; schedule accelerated review cycle (30 days) for all affected accounts"}
  ],
  "autonomyLevel": "human_in_loop",
  "status": "active",
  "isPreBuilt": false,
  "severity": "critical",
  "estimatedDuration": "24-72 hours"
}
ENDJSON
RB2=$(post_api "Runbook: Mass Credit Limit Breach" "/api/runbooks" "$WORK/rb2.json")

cat > "$WORK/rb3.json" <<'ENDJSON'
{
  "name": "False Credit Hold",
  "description": "Expedited release procedure for customers incorrectly placed on credit hold due to data errors, model errors, or bureau data inaccuracies. Provides a structured override workflow with appropriate authority levels to release holds quickly while maintaining audit integrity and preventing unauthorized credit extensions.",
  "industry": "enterprise",
  "category": "incident_response",
  "triggerType": "manual",
  "triggerConditions": ["customer_disputes_credit_hold", "sales_escalates_hold_release_request", "credit_manager_identifies_model_error"],
  "steps": [
    {"id": "s1", "label": "Receive hold release request",            "type": "detection",    "description": "Sales or customer escalates credit hold release request to Credit Manager; document: customer name, hold reason, order value impacted, urgency tier"},
    {"id": "s2", "label": "Verify hold basis",                       "type": "action",       "description": "Credit Manager reviews: is the hold based on accurate data? Check bureau data freshness, payment history accuracy, and model inputs; identify if any input was erroneous"},
    {"id": "s3", "label": "Categorize false hold type",              "type": "action",       "description": "Classify: data error (wrong customer matched), bureau error (inaccurate report), model error (scoring anomaly), timing error (payment posted late but account is current)"},
    {"id": "s4", "label": "Apply authority-level override",          "type": "approval",     "description": "Override authority based on exposure: <$50K = Credit Manager approval; $50K-$250K = Credit Director; >$250K = VP Finance + Credit Director; log all approvers with timestamp"},
    {"id": "s5", "label": "Release hold with corrected data",        "type": "action",       "description": "Correct erroneous input data in source system; re-run credit assessment with corrected data; release hold only if corrected assessment supports release; update ERP/CRM credit record"},
    {"id": "s6", "label": "Expedite pending orders",                 "type": "action",       "description": "Notify OTC-AGT-002 of hold release with updated credit terms; expedite processing of orders that were blocked during hold period; confirm with sales account manager"},
    {"id": "s7", "label": "Document and prevent recurrence",         "type": "documentation","description": "Document root cause of false hold in incident log; if systematic error: escalate to credit model team for correction; update model validation tests to catch similar cases"}
  ],
  "autonomyLevel": "human_in_loop",
  "status": "active",
  "isPreBuilt": false,
  "severity": "medium",
  "estimatedDuration": "2-8 hours"
}
ENDJSON
RB3=$(post_api "Runbook: False Credit Hold" "/api/runbooks" "$WORK/rb3.json")

cat > "$WORK/rb4.json" <<'ENDJSON'
{
  "name": "Customer Dispute of Credit Decision",
  "description": "Escalation and resolution procedure when a customer formally disputes their credit tier assignment, credit limit, or payment terms. Covers the complete dispute workflow from initial receipt through investigation, resolution, ECOA-compliant response, and bureau dispute filing if required.",
  "industry": "enterprise",
  "category": "customer_escalation",
  "triggerType": "manual",
  "triggerConditions": ["customer_formally_disputes_credit_decision", "customer_challenges_adverse_action_notice", "customer_requests_credit_decision_review"],
  "steps": [
    {"id": "s1", "label": "Receive and log dispute",                 "type": "detection",    "description": "Customer submits written dispute of credit decision; log: customer name, decision disputed, date of original decision, customer's stated basis for dispute, supporting documents provided"},
    {"id": "s2", "label": "Acknowledge within 30 days",              "type": "notification", "description": "Send written acknowledgment of dispute within 30 days of receipt (ECOA requirement); confirm investigation is underway; provide expected resolution timeline (no more than 90 days)"},
    {"id": "s3", "label": "Gather supporting documentation",         "type": "action",       "description": "Request from customer: most recent 2-year financial statements, bank reference letters, evidence of dispute with bureau data. Pull fresh bureau reports for comparison"},
    {"id": "s4", "label": "Conduct independent review",              "type": "approval",     "description": "Assign to Credit Manager not involved in original decision; re-run full credit assessment with all available data including customer-provided documents; document findings independently"},
    {"id": "s5", "label": "File bureau dispute if applicable",       "type": "action",       "description": "If customer provides evidence of bureau data inaccuracy: file formal dispute with D&B, Experian, or Equifax per FCRA dispute process; request bureau investigation within 30 days; place credit decision on hold pending investigation"},
    {"id": "s6", "label": "Issue resolution letter",                 "type": "notification", "description": "Provide written resolution to customer: uphold decision (with updated ECOA reasons) or revise decision; if revised: update ERP/CRM and notify order management; if upheld: explain recourse options"},
    {"id": "s7", "label": "Update credit record",                    "type": "action",       "description": "Update ERP/CRM with dispute log, investigation findings, resolution, and any revised credit terms; attach all documentation for SOX audit trail; schedule accelerated follow-up review in 90 days"}
  ],
  "autonomyLevel": "human_in_loop",
  "status": "active",
  "isPreBuilt": false,
  "severity": "medium",
  "estimatedDuration": "3-30 days"
}
ENDJSON
RB4=$(post_api "Runbook: Customer Dispute of Credit Decision" "/api/runbooks" "$WORK/rb4.json")

cat > "$WORK/rb5.json" <<'ENDJSON'
{
  "name": "Periodic Review Backlog",
  "description": "Triage and prioritization procedure for managing accumulated periodic credit review backlogs. Applies when the review queue exceeds normal throughput capacity due to volume spikes, staffing gaps, or system delays. Ensures highest-risk and highest-exposure accounts are reviewed first while maintaining audit trail integrity.",
  "industry": "enterprise",
  "category": "operations",
  "triggerType": "manual",
  "triggerConditions": ["review_queue_exceeds_50_accounts", "average_review_age_exceeds_target_schedule", "credit_manager_requests_triage_mode"],
  "steps": [
    {"id": "s1", "label": "Assess backlog size and age",             "type": "detection",    "description": "Query review queue: count overdue reviews, calculate average days past target schedule, identify accounts most overdue and highest exposure"},
    {"id": "s2", "label": "Apply triage prioritization",             "type": "action",       "description": "Sort queue by priority score: (1) Watch List + Watch List accounts overdue >30 days: P1; (2) High Risk + exposure >$100K: P2; (3) Medium Risk overdue >60 days: P3; (4) All others: P4"},
    {"id": "s3", "label": "Authorize automated pre-assessment",      "type": "approval",     "description": "Credit Manager authorizes agent to run automated preliminary assessments for P3/P4 accounts using current data; flag results for human spot-check rather than full review"},
    {"id": "s4", "label": "Escalate P1 accounts immediately",        "type": "action",       "description": "Route all P1 (Watch List overdue) accounts to Credit Manager queue as urgent; notify sales for each account that a review is pending; apply temporary order caution flag"},
    {"id": "s5", "label": "Run batch assessment for P2-P4",          "type": "action",       "description": "Execute batch credit assessments for P2, P3, P4 accounts; group results by recommended action: no change, tier upgrade, tier downgrade, limit change; present summary to Credit Manager for bulk approval"},
    {"id": "s6", "label": "Process bulk approvals",                  "type": "approval",     "description": "Credit Manager reviews batch summary; approves no-change accounts in bulk; individually reviews tier changes and limit adjustments; documents bulk approval in audit log"},
    {"id": "s7", "label": "Reset review schedules",                  "type": "action",       "description": "After backlog cleared: reset all review schedules based on current tier; investigate root cause of backlog; adjust staffing or automation thresholds to prevent recurrence"}
  ],
  "autonomyLevel": "human_in_loop",
  "status": "active",
  "isPreBuilt": false,
  "severity": "medium",
  "estimatedDuration": "1-5 days"
}
ENDJSON
RB5=$(post_api "Runbook: Periodic Review Backlog" "/api/runbooks" "$WORK/rb5.json")

cat > "$WORK/rb6.json" <<'ENDJSON'
{
  "name": "Credit Model Drift",
  "description": "Monitoring procedure and response protocol for detected credit scoring model drift — when the model's predictive accuracy degrades relative to actual payment outcomes. Covers drift detection methods, severity thresholds, escalation path to Credit Risk Committee, emergency recalibration triggers, and model retraining governance process.",
  "industry": "enterprise",
  "category": "model_governance",
  "triggerType": "automated",
  "triggerConditions": ["monthly_backtest_accuracy_below_85pct", "false_negative_rate_exceeds_15pct", "gini_coefficient_drops_more_than_10pts", "credit_committee_requests_model_review"],
  "steps": [
    {"id": "s1", "label": "Detect model drift signal",               "type": "detection",    "description": "Monthly back-test: compare credit tier predictions from 12 months ago against actual payment outcomes; compute Gini coefficient, Kolmogorov-Smirnov statistic, and false negative rate; alert if any threshold breached"},
    {"id": "s2", "label": "Assess drift severity",                   "type": "action",       "description": "Minor drift (accuracy 87-90%): log and monitor; increase monitoring frequency. Moderate drift (82-87%): trigger partial recalibration of weights. Severe drift (<82%): escalate to Credit Risk Committee immediately; consider emergency model freeze"},
    {"id": "s3", "label": "Notify Credit Risk Committee",            "type": "notification", "description": "For moderate/severe drift: notify CFO, Credit Director, and Risk Manager; present: drift analysis report, impacted accounts analysis, recommended corrective action, and proposed recalibration timeline"},
    {"id": "s4", "label": "Emergency weight recalibration",          "type": "action",       "description": "For moderate drift: recalibrate scoring weights using last 24 months of data with stronger weighting to recent 6 months; run parallel validation on hold-out set; compare performance to current model before activating"},
    {"id": "s5", "label": "Full model retraining (severe drift)",    "type": "action",       "description": "For severe drift: initiate full model retraining on 36-month historical dataset; include updated macro-economic variables; run challenger vs. champion test for 60 days before replacing production model; document per ECOA/statistical model standards"},
    {"id": "s6", "label": "Portfolio impact assessment",             "type": "action",       "description": "Identify accounts most likely misclassified due to model drift; prioritize manual review for accounts where model confidence was low and direction of potential error is higher risk (false negatives — accounts under-assigned risk)"},
    {"id": "s7", "label": "Deploy recalibrated model with audit",    "type": "action",       "description": "Deploy recalibrated or retrained model with version increment; log new model version, validation metrics, approval signatures in model governance log; run first-week shadow mode comparing old vs. new decisions before fully switching"}
  ],
  "autonomyLevel": "human_in_loop",
  "status": "active",
  "isPreBuilt": false,
  "severity": "high",
  "estimatedDuration": "1-30 days"
}
ENDJSON
RB6=$(post_api "Runbook: Credit Model Drift" "/api/runbooks" "$WORK/rb6.json")

echo "" >&2

# =============================================================================
# STEP 9: Create Eval Suite and Set evalBindings on Agent
# =============================================================================
echo "STEP 9: Creating Eval Suite and wiring evalBindings to agent..." >&2

jq -n --arg agent "$AGENT" --arg ds "$DS" '{
  "agentId": $agent,
  "name": "OTC-AGT-003 Customer Credit & Risk Assessment Regression Suite",
  "type": "regression",
  "industry": "enterprise",
  "goldenDatasetId": $ds,
  "schedule": "on_deploy",
  "thresholdConfig": {
    "minPassRate": 0.90,
    "criticalDimensions": ["ecoa_compliance_rate", "ofac_match_detection", "sox_audit_log_completeness"],
    "criticalMinPassRate": 1.0
  },
  "scorerConfig": {
    "primaryScorer": "llm_judge",
    "fallbackScorer": "exact_match",
    "expertAgreementThreshold": 0.90
  },
  "coverageTags": ["credit-bureau", "payment-history", "financial-ratios", "risk-scoring", "news-monitoring", "ecoa", "fcra", "ofac", "sox", "basel-iii", "ifrs-9", "credit-decision-explanation"],
  "environmentThresholds": {
    "production": {"minPassRate": 0.92},
    "staging": {"minPassRate": 0.88}
  }
}' > "$WORK/eval_suite.json"

EVAL_SUITE=$(post_api "OTC-AGT-003 Eval Suite" "/api/evals" "$WORK/eval_suite.json")

EVAL_PATCH=$(curl -s -X PATCH "${BASE_URL}/api/agents/${AGENT}" \
  -H "Content-Type: application/json" \
  -d "{\"evalBindings\": {\"suites\": [{\"suiteId\": \"${EVAL_SUITE}\", \"schedule\": \"on_deploy\", \"environment\": \"staging\"}]}}")
EVAL_PATCH_ID=$(echo "$EVAL_PATCH" | jq -r '.id // empty')
if [ -z "$EVAL_PATCH_ID" ]; then
  echo "  ✗ FAILED: evalBindings PATCH" >&2
  echo "    Response: $EVAL_PATCH" >&2
  exit 1
fi
echo "  ✓ evalBindings wired → suite $EVAL_SUITE" >&2

echo "" >&2

# =============================================================================
# SUMMARY
# =============================================================================
echo "==================================================" >&2
echo " DEV PROVISIONING COMPLETE" >&2
echo "==================================================" >&2
echo "" >&2
echo "Resource Summary (Dev):" >&2
echo "  Agent (OTC-AGT-003):                $AGENT" >&2
echo "  Knowledge Base:                      $KB" >&2
echo "  Golden Evaluation Dataset:           $DS" >&2
echo "" >&2
echo "Skills (6):" >&2
echo "  Credit Bureau Integration:           $S1" >&2
echo "  Payment Pattern Analysis:            $S2" >&2
echo "  Financial Statement Parser:          $S3" >&2
echo "  Risk Scoring Model:                  $S4" >&2
echo "  News & Signal Monitoring:            $S5" >&2
echo "  Credit Decision Explanation:         $S6" >&2
echo "" >&2
echo "Policies (6):" >&2
echo "  ECOA Non-Discriminatory Credit:      $P1" >&2
echo "  FCRA Credit Bureau Data Use:         $P2" >&2
echo "  Basel III / IFRS 9 ECL:              $P3" >&2
echo "  GDPR / CCPA Credit Data Privacy:     $P4" >&2
echo "  SOX Credit Decision Audit Trail:     $P5" >&2
echo "  OFAC / AML Sanctions Screening:      $P6" >&2
echo "" >&2
echo "Runbooks (6):" >&2
echo "  Credit Bureau API Down:              $RB1" >&2
echo "  Mass Credit Limit Breach:            $RB2" >&2
echo "  False Credit Hold:                   $RB3" >&2
echo "  Customer Dispute of Credit Decision: $RB4" >&2
echo "  Periodic Review Backlog:             $RB5" >&2
echo "  Credit Model Drift:                  $RB6" >&2
echo "" >&2
echo "Evaluation:" >&2
echo "  Eval Suite (OTC-AGT-003 regression): $EVAL_SUITE" >&2
echo "  Golden Dataset:                      $DS" >&2
echo "" >&2
echo "All resources created at: $BASE_URL" >&2
echo "==================================================" >&2

# Export IDs for use by migration script
echo "OTC_AGT_003_AGENT=$AGENT"
echo "OTC_AGT_003_KB=$KB"
echo "OTC_AGT_003_DS=$DS"
echo "OTC_AGT_003_S1=$S1"
echo "OTC_AGT_003_S2=$S2"
echo "OTC_AGT_003_S3=$S3"
echo "OTC_AGT_003_S4=$S4"
echo "OTC_AGT_003_S5=$S5"
echo "OTC_AGT_003_S6=$S6"
echo "OTC_AGT_003_P1=$P1"
echo "OTC_AGT_003_P2=$P2"
echo "OTC_AGT_003_P3=$P3"
echo "OTC_AGT_003_P4=$P4"
echo "OTC_AGT_003_P5=$P5"
echo "OTC_AGT_003_P6=$P6"
echo "OTC_AGT_003_RB1=$RB1"
echo "OTC_AGT_003_RB2=$RB2"
echo "OTC_AGT_003_RB3=$RB3"
echo "OTC_AGT_003_RB4=$RB4"
echo "OTC_AGT_003_RB5=$RB5"
echo "OTC_AGT_003_RB6=$RB6"
echo "OTC_AGT_003_EVAL_SUITE=$EVAL_SUITE"
