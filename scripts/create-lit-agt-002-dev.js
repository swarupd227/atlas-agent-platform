#!/usr/bin/env node
/**
 * LIT-AGT-002 — Wage & Hour Compliance Audit Agent
 * Creates all platform intelligence in the DEV environment via API.
 *
 * Usage:  node scripts/create-lit-agt-002-dev.js
 * Saves: scripts/lit-agt-002-dev-ids.json
 */

const BASE = "http://localhost:5000";
const ORG  = "0c9bcf16-cdd9-45e2-87f6-6a839a7f7056";

// ── HTTP Helpers ───────────────────────────────────────────────────────────────

async function post(path, body) {
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!r.ok) throw new Error(`POST ${path} → ${r.status}: ${JSON.stringify(data).slice(0, 500)}`);
  return data;
}

async function patch(path, body) {
  const r = await fetch(`${BASE}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!r.ok) throw new Error(`PATCH ${path} → ${r.status}: ${JSON.stringify(data).slice(0, 500)}`);
  return data;
}

const log  = (msg) => console.log(`  ✓  ${msg}`);
const warn = (msg) => console.log(`  ⚠  ${msg}`);
const step = (n, total, msg) => console.log(`\nSTEP ${n}/${total}  ${msg}`);

// ── Data ───────────────────────────────────────────────────────────────────────

const SKILLS = [
  {
    organizationId: ORG,
    name: "Classification Analysis Skill",
    description: "Evaluates employee job duties, salary basis, and salary level against FLSA exemption tests (executive, administrative, professional, computer, and outside sales) and state-specific exemption criteria. Returns a confidence-scored determination (exempt/non-exempt), identifies the controlling jurisdiction, flags borderline cases, and cites the applicable regulatory test. Supports ABC test analysis for independent contractor classification (California, Massachusetts, New Jersey).",
    industry: "legal_services",
    domain: "wage-hour",
    version: "1.0.0",
    author: "Littler Mendelson Wage & Hour Practice Group",
    trustTier: "HIGH",
    dependencies: [],
    tags: ["wage-hour", "FLSA", "exemption", "classification", "ABC-test", "audit"],
    agentTypeCompatibility: ["single", "team", "remote"],
    status: "active",
    complexity: "complex",
    allowedTools: ["retrieve_kb", "query_jurisdiction_rules", "score_confidence"],
    requiredMcpServers: ["littler-gps-mcp", "flsa-exemption-mcp"],
    requiredDataClassifications: ["payroll_pii", "job_description"],
    disableModelInvocation: false,
    contextMode: "rag",
    userInvocable: true,
    descriptionQualityScore: 95,
    industryContextId: null,
    knowledgeQueries: ["FLSA exemption tests", "California ABC test", "state exemption thresholds", "salary basis test"],
    yamlFrontmatter: `name: Classification Analysis Skill
version: "1.0"
agent_code: LIT-AGT-002
domain: wage-hour
industry: legal_services
trust_tier: HIGH
context_mode: rag
jurisdiction_coverage: "50 states + DC + federal"
flsa_tests: [executive, administrative, professional, computer, outside_sales]
state_tests: [california_abc, massachusetts_abc, new_jersey_abc, new_york_borrello]
required_kb: Wage & Hour Compliance Audit Knowledge Base
citation_required: true
confidence_scoring: true`,
    markdownBody: `# Classification Analysis Skill

## Purpose
Determines correct employee classification (exempt vs. non-exempt, employee vs. independent contractor) under FLSA and applicable state law by systematically evaluating each exemption test element.

## FLSA Exemption Tests Covered
- **Executive**: Manages enterprise/department, directs 2+ employees, authority to hire/fire, salary ≥ $684/week
- **Administrative**: Office/non-manual work, directly related to management/general business, discretion and independent judgment, salary ≥ $684/week
- **Professional (Learned)**: Advanced knowledge, predominantly intellectual, field of science/learning, salary ≥ $684/week
- **Professional (Creative)**: Invention, imagination, or talent in artistic/creative field
- **Computer**: Systems analyst, programmer, software engineer, salary ≥ $684/week or $27.63/hour
- **Outside Sales**: Primary duty is sales, customarily and regularly away from employer's place of business
- **Highly Compensated**: Total annual comp ≥ $107,432, performs office/non-manual work, customarily/regularly one exempt duty

## State-Specific Analyses
- California: Wage Order exemptions (executive, administrative, professional), ABC test for ICs (AB5)
- New York: Salary thresholds differ from federal ($1,300/week NYC large employers 2024)
- Washington: State salary thresholds exceed FLSA ($844.55/week as of 2024)
- Massachusetts: ABC test for IC classification (stricter prong B)
- Colorado: CDLE COMPS Order thresholds and exemption criteria

## Activation Logic
1. Receive job description, compensation data, primary duty description, and work location
2. Identify controlling jurisdiction(s) based on worksite
3. Run FLSA duties test for each applicable exemption category
4. Apply state-specific salary thresholds for classified jurisdiction
5. For IC classification requests: run applicable state ABC test
6. Score confidence based on duties fit (high/medium/low)
7. Flag borderline classifications for attorney review (confidence < 75%)

## Output Format
\`\`\`
EMPLOYEE: [ID / Name]
JURISDICTION: [State / Federal]
RECOMMENDED CLASSIFICATION: [Exempt/Non-Exempt/IC]
EXEMPTION CATEGORY (if exempt): [Executive/Admin/Professional/Computer/Outside Sales]
DUTIES TEST SCORE: [X/10 elements met]
SALARY BASIS MET: [Yes/No — $X/week vs. $X threshold]
CONFIDENCE SCORE: [XX%]
BORDERLINE FACTORS: [List if any]
CITATION: [29 C.F.R. §541.XXX / State equivalent]
ATTORNEY REVIEW REQUIRED: [Yes/No]
\`\`\`

## Escalation Triggers
- Confidence < 75% → route to Wage & Hour attorney for manual review
- Hybrid roles with multiple duties crossing exemption categories → flag for classification opinion
- Pending salary threshold increases within 90 days → alert payroll impact`,
  },
  {
    organizationId: ORG,
    name: "Overtime Calculation Engine Skill",
    description: "Computes correct overtime obligations under all applicable federal and state methodologies. Handles FLSA standard weekly overtime, California daily and 7th-day overtime, Oregon daily overtime, and alternative workweek schedules. Calculates the regular rate of pay including piece-rate earnings, commissions, non-discretionary bonuses, and shift differentials. Identifies overtime violations and quantifies back-pay exposure.",
    industry: "legal_services",
    domain: "wage-hour",
    version: "1.0.0",
    author: "Littler Mendelson Wage & Hour Practice Group",
    trustTier: "HIGH",
    dependencies: [],
    tags: ["wage-hour", "overtime", "FLSA", "california", "regular-rate", "back-pay", "audit"],
    agentTypeCompatibility: ["single", "team", "remote"],
    status: "active",
    complexity: "complex",
    allowedTools: ["calculate_regular_rate", "query_jurisdiction_rules", "compute_exposure"],
    requiredMcpServers: ["payroll-calc-mcp", "littler-gps-mcp"],
    requiredDataClassifications: ["payroll_pii", "time_records"],
    disableModelInvocation: false,
    contextMode: "rag",
    userInvocable: true,
    descriptionQualityScore: 94,
    industryContextId: null,
    knowledgeQueries: ["overtime calculation methods", "regular rate of pay", "California daily overtime", "7th day overtime", "alternative workweek"],
    yamlFrontmatter: `name: Overtime Calculation Engine Skill
version: "1.0"
agent_code: LIT-AGT-002
domain: wage-hour
industry: legal_services
trust_tier: HIGH
context_mode: rag
overtime_methodologies: [flsa_weekly, ca_daily, ca_7th_day, or_daily, alternative_workweek]
regular_rate_inclusions: [commissions, piece_rate, non_discretionary_bonus, shift_differential]
required_kb: Wage & Hour Compliance Audit Knowledge Base
citation_required: true`,
    markdownBody: `# Overtime Calculation Engine Skill

## Purpose
Accurately calculates overtime obligations for any combination of jurisdiction, pay structure, and work schedule; identifies underpayments; and quantifies back-pay exposure.

## Overtime Methodologies
### Federal (FLSA)
- Weekly overtime: 1.5× regular rate for all hours > 40/week
- Regular rate = (total straight-time wages) / (total hours worked), including commissions, non-discretionary bonuses, shift differentials

### California (Most Complex)
- Daily overtime: 1.5× for hours 8–12 in any workday; 2.0× for hours > 12 in any workday
- 7th consecutive day: 1.5× for first 8 hours; 2.0× for hours > 8
- Weekly overtime: 1.5× for hours > 40/week (in addition to daily OT)
- Alternative workweek schedules: Up to 10 hours/day without OT if properly adopted per IWC Wage Order
- Piece-rate workers: Must separately compensate for rest periods and non-productive time (Donohue v. AMN Services)

### Oregon
- Daily overtime: 1.5× for hours > 10 in any workday (manufacturing, certain industries)
- Weekly overtime: 1.5× for hours > 40/week

### Regular Rate of Pay Inclusions (29 C.F.R. §778)
- ✅ Non-discretionary bonuses (must retroactively recalculate)
- ✅ Commissions
- ✅ Piece-rate earnings
- ✅ Shift differentials, hazard pay
- ❌ Discretionary bonuses, gifts, vacation pay, overtime premiums

## Calculation Steps
1. Parse payroll records by pay period and employee
2. Identify applicable overtime methodology (jurisdiction + industry)
3. Compute regular rate by summing all includable compensation / total hours
4. Apply correct multiplier (1.5× or 2.0×) to overtime hours
5. Compare calculated overtime to amounts actually paid
6. Compute underpayment amount and apply statute of limitations (2 years FLSA, 3 years CA, willfulness extends)
7. Add liquidated damages (100% of underpayment by default under FLSA)

## Output Format
\`\`\`
EMPLOYEE: [ID] | PAY PERIOD: [dates]
JURISDICTION: [State/Federal]
TOTAL HOURS WORKED: [X]
OVERTIME HOURS: [X (daily: X, weekly: X)]
REGULAR RATE: $X.XX/hour
OVERTIME OWED: $X.XX
OVERTIME PAID: $X.XX
UNDERPAYMENT: $X.XX
BACK-PAY EXPOSURE (2yr): $X,XXX
LIQUIDATED DAMAGES: $X,XXX
TOTAL EXPOSURE: $X,XXX
VIOLATION TYPE: [Daily OT / Weekly OT / Regular Rate Error / etc.]
\`\`\``,
  },
  {
    organizationId: ORG,
    name: "Meal & Break Compliance Skill",
    description: "Analyzes time punch records to detect missed, short, late, or on-duty meal periods and rest breaks across all applicable jurisdictions. Applies California 30-minute off-duty meal period rules (IWC Wage Orders), Oregon 30-minute meal and 10-minute rest requirements, Washington break requirements, and other state-specific mandates. Computes premium pay owed for meal period violations (one hour at regular rate per violation under California Labor Code §226.7).",
    industry: "legal_services",
    domain: "wage-hour",
    version: "1.0.0",
    author: "Littler Mendelson Wage & Hour Practice Group",
    trustTier: "HIGH",
    dependencies: [],
    tags: ["wage-hour", "meal-break", "rest-break", "california", "time-punch", "premium-pay", "audit"],
    agentTypeCompatibility: ["single", "team", "remote"],
    status: "active",
    complexity: "complex",
    allowedTools: ["parse_time_records", "apply_break_rules", "compute_premium_pay"],
    requiredMcpServers: ["time-records-mcp", "littler-gps-mcp"],
    requiredDataClassifications: ["time_records", "payroll_pii"],
    disableModelInvocation: false,
    contextMode: "rag",
    userInvocable: true,
    descriptionQualityScore: 93,
    industryContextId: null,
    knowledgeQueries: ["meal period requirements", "rest break rules", "California IWC Wage Orders", "premium pay violations", "on-duty meal period agreement"],
    yamlFrontmatter: `name: Meal & Break Compliance Skill
version: "1.0"
agent_code: LIT-AGT-002
domain: wage-hour
industry: legal_services
trust_tier: HIGH
context_mode: rag
jurisdictions_with_break_rules: [CA, OR, WA, NY, CO, MN, NV, VT, IL, MA, NH, RI, TN, UT, WY, WV, ND]
required_kb: Wage & Hour Compliance Audit Knowledge Base
citation_required: true`,
    markdownBody: `# Meal & Break Compliance Skill

## Purpose
Detects every meal period and rest break violation across payroll history, applies correct premium pay calculations, and generates a violation-level audit trail.

## State Requirements Covered

### California (IWC Wage Orders / Labor Code §512)
- **First meal period**: Must start before end of 5th hour of work; ≥ 30 minutes off-duty; written on-duty agreement required for exception
- **Second meal period**: Must start before end of 10th hour; same requirements
- **Rest breaks**: 10-minute rest per 4 hours worked (or major fraction thereof); must be in middle of period
- **Premium pay**: 1 additional hour at regular rate per missed/short/late meal OR rest break (Cal. Lab. Code §226.7)
- **Derivative wage statement violations**: Each pay stub reflecting a premium violation = separate §226 penalty

### Oregon (ORS 653.261)
- Meal period: 30-minute unpaid break if shift > 6 hours; must be off-duty
- Rest periods: 10-minute rest per 4-hour work segment

### Washington (WAC 296-126-092)
- Meal period: 30-minute unpaid break if shift > 5 hours
- Rest periods: 10-minute rest per 4 hours

### New York (NYLL §162)
- Factory workers: 60-minute noon meal break
- Mercantile / other: 30-minute noon break
- Shifts beginning before 11AM and extending past 7PM: additional 20-minute break (6PM–7PM)

## Violation Detection Logic
1. Parse time punch IN/OUT records with shift start/end timestamps
2. Identify meal period windows (start before 5th/10th hour)
3. Check meal period duration (≥ 30 minutes)
4. Verify on-duty vs. off-duty classification
5. Count rest break opportunities and compare to records
6. Flag each violation with employee ID, date, shift times, and violation type
7. Calculate premium pay at employee's regular rate for each violation

## Output Format
\`\`\`
EMPLOYEE: [ID] | SHIFT: [date, start–end]
VIOLATION TYPE: [Missed 1st Meal / Short Meal / Late 1st Meal / Missed Rest / etc.]
REQUIRED: [≥ 30 min off-duty before hour 5]
ACTUAL: [27 min / no record / on-duty]
PREMIUM PAY OWED: $X.XX (1 hr @ $X.XX/hr regular rate)
JURISDICTION: [CA / OR / WA / etc.]
CITATION: [Cal. Lab. Code §226.7 / IWC Wage Order No. X]
\`\`\``,
  },
  {
    organizationId: ORG,
    name: "Minimum Wage Tracker Skill",
    description: "Maintains and applies current minimum wage rates across all U.S. jurisdictions: federal ($7.25/hr), 50 states, DC, and 200+ municipal ordinances (San Francisco, Seattle, NYC, Los Angeles, Chicago, etc.). Tracks scheduled future increases, tip credit rules, sub-minimum certificates, and training wage exceptions. Cross-references payroll records to identify minimum wage violations including tipped employees and workers with piece-rate or commission-based pay.",
    industry: "legal_services",
    domain: "wage-hour",
    version: "1.0.0",
    author: "Littler Mendelson Wage & Hour Practice Group",
    trustTier: "HIGH",
    dependencies: [],
    tags: ["wage-hour", "minimum-wage", "tip-credit", "local-ordinance", "compliance-tracking", "audit"],
    agentTypeCompatibility: ["single", "team", "remote"],
    status: "active",
    complexity: "moderate",
    allowedTools: ["lookup_wage_rate", "check_tip_credit", "flag_violations"],
    requiredMcpServers: ["wage-rate-mcp", "littler-gps-mcp"],
    requiredDataClassifications: ["payroll_pii", "location_data"],
    disableModelInvocation: false,
    contextMode: "rag",
    userInvocable: true,
    descriptionQualityScore: 92,
    industryContextId: null,
    knowledgeQueries: ["minimum wage rates by jurisdiction", "tip credit rules", "scheduled wage increases", "municipal minimum wage ordinances"],
    yamlFrontmatter: `name: Minimum Wage Tracker Skill
version: "1.0"
agent_code: LIT-AGT-002
domain: wage-hour
industry: legal_services
trust_tier: HIGH
context_mode: rag
coverage: "federal + 50 states + DC + 200+ municipalities"
update_frequency: real_time
tip_credit_states: [AL, AR, AZ, CO, CT, DE, FL, GA, HI, ID, IL, IN, KS, KY, LA, MD, ME, MI, MN, MO, MS, MT, NC, ND, NE, NH, NJ, NM, NV, NY, OH, OK, OR, PA, RI, SC, SD, TN, TX, UT, VA, VT, WA, WI, WV, WY]
required_kb: Wage & Hour Compliance Audit Knowledge Base`,
    markdownBody: `# Minimum Wage Tracker Skill

## Purpose
Ensures every worker is paid at or above the highest applicable minimum wage at every point in time, accounting for all layered jurisdictions (federal → state → county → city).

## Jurisdictional Hierarchy
Apply the highest rate among all applicable levels:
1. Federal: $7.25/hour (FLSA §6)
2. State rate (e.g., CA $16.00/hr, WA $16.28/hr, NY $16.00/hr NYC)
3. County rate (e.g., unincorporated LA County)
4. Municipal rate (e.g., SF $18.67/hr, Seattle $19.97/hr, NYC $16.00/hr)

## Key Jurisdictions (2024 Rates)
| Jurisdiction | Rate | Effective Date |
|---|---|---|
| California | $16.00/hr (general); $20.00 fast food | Jan 1 / Apr 1, 2024 |
| Seattle | $19.97/hr (large employer) | Jan 1, 2024 |
| San Francisco | $18.67/hr | Jul 1, 2024 |
| New York City | $16.00/hr | Jan 1, 2024 |
| Washington DC | $17.50/hr | Jul 1, 2024 |
| Illinois | $14.00/hr | Jan 1, 2024 |
| Nevada | $12.00/hr (no health benefits) | Jul 1, 2024 |

## Tip Credit Rules
- **Permitted in**: 43 states (not CA, MN, AK, MT, OR, WA, NV, and a few others)
- **FLSA tip credit**: $5.12/hr (employer may pay $2.13 if tips bring total ≥ $7.25)
- **Conditions**: Notice to employee, tip pool restrictions, no employer retention of tips
- **Violation risk**: Loss of tip credit → full minimum wage back-pay for all tipped hours

## Piece-Rate / Commission Check
- Total earnings ÷ total hours worked must ≥ minimum wage
- Commission-only employees: calculate effective hourly rate each pay period

## Output Format
\`\`\`
EMPLOYEE: [ID] | PAY PERIOD: [dates] | WORKSITE: [City, State]
APPLICABLE RATE: $X.XX/hr ([jurisdiction] effective [date])
EFFECTIVE RATE PAID: $X.XX/hr
COMPLIANCE STATUS: [COMPLIANT / VIOLATION]
UNDERPAYMENT/HOUR: $X.XX
TOTAL HOURS AFFECTED: XX hours
TOTAL BACK-PAY OWED: $XXX.XX
\`\`\``,
  },
  {
    organizationId: ORG,
    name: "Exposure Modeling Skill",
    description: "Calculates total financial exposure from wage and hour violations: back-pay underpayments, liquidated damages (FLSA §16(b)), California PAGA penalties, state penalty statutes, waiting time penalties (California Labor Code §203), wage statement penalties (§226), and attorney fee estimates. Applies applicable statutes of limitations (2-year FLSA, 3-year willful FLSA, 3-year California, 4-year California UCL). Supports class action exposure modeling with sample projection methodology.",
    industry: "legal_services",
    domain: "wage-hour",
    version: "1.0.0",
    author: "Littler Mendelson Wage & Hour Practice Group",
    trustTier: "HIGH",
    dependencies: ["Classification Analysis Skill", "Overtime Calculation Engine Skill", "Meal & Break Compliance Skill"],
    tags: ["wage-hour", "exposure", "PAGA", "liquidated-damages", "class-action", "back-pay", "penalties"],
    agentTypeCompatibility: ["single", "team", "remote"],
    status: "active",
    complexity: "complex",
    allowedTools: ["compute_exposure", "apply_statute_of_limitations", "model_class_damages"],
    requiredMcpServers: ["exposure-calc-mcp", "littler-gps-mcp"],
    requiredDataClassifications: ["payroll_pii", "violation_findings"],
    disableModelInvocation: false,
    contextMode: "rag",
    userInvocable: true,
    descriptionQualityScore: 96,
    industryContextId: null,
    knowledgeQueries: ["PAGA penalties", "liquidated damages FLSA", "waiting time penalties", "wage statement penalties", "class action damages model", "statute of limitations wage claims"],
    yamlFrontmatter: `name: Exposure Modeling Skill
version: "1.0"
agent_code: LIT-AGT-002
domain: wage-hour
industry: legal_services
trust_tier: HIGH
context_mode: rag
penalty_frameworks: [FLSA_liquidated, CA_PAGA, CA_waiting_time, CA_wage_statement, state_penalties]
sol_periods: {flsa: 2, flsa_willful: 3, california: 3, california_ucl: 4}
required_kb: Wage & Hour Compliance Audit Knowledge Base
attorney_review_threshold: 50000`,
    markdownBody: `# Exposure Modeling Skill

## Purpose
Produces a complete financial exposure analysis for all identified wage and hour violations, suitable for litigation risk assessment, settlement valuation, and remediation planning.

## Exposure Components

### Federal (FLSA)
- **Back pay**: All unpaid wages within SOL period
- **Liquidated damages**: 100% of back pay (unless employer proves good faith / reasonable grounds)
- **Attorney fees**: Mandatory under FLSA §16(b); estimate 30–40% of total recovery
- **SOL**: 2 years (3 years if willful)

### California (Most Exposure)
- **Overtime back pay**: Per CA Labor Code §510 and applicable Wage Order
- **Meal period premium**: 1 hr at regular rate per violation (§226.7)
- **Rest break premium**: 1 hr at regular rate per violation (§226.7)
- **Waiting time penalties**: 30 days × daily rate for each employee who separated without payment (§203)
- **Wage statement penalties**: $50 first violation, $100 subsequent violations, max $4,000/employee (§226(e))
- **PAGA penalties**: $100/employee/pay period (initial violation); $200/employee/pay period (subsequent); 75% to LWDA, 25% to employees
- **UCL restitution**: 4-year SOL for unfair business practice claims

### Class Action / PAGA Projection Methodology
1. Identify violation rate from sample (audited employees)
2. Project rate across entire class using statistical sampling
3. Apply median damages per violation × projected violation count
4. Add PAGA civil penalties on top of individual damages
5. Add attorney fee lodestar estimate

## Output Format
\`\`\`
VIOLATION TYPE: [Overtime / Meal Break / Minimum Wage / etc.]
AFFECTED EMPLOYEES: [N]
BACK-PAY EXPOSURE: $X,XXX,XXX
LIQUIDATED DAMAGES: $X,XXX,XXX
PAGA PENALTIES: $X,XXX,XXX
WAITING TIME PENALTIES: $XXX,XXX
WAGE STATEMENT PENALTIES: $XXX,XXX
ATTORNEY FEES (EST.): $XXX,XXX
──────────────────────────────
TOTAL EXPOSURE (LOW): $X,XXX,XXX
TOTAL EXPOSURE (HIGH): $X,XXX,XXX
SOL APPLIED: [2yr FLSA / 3yr CA / 4yr UCL]
ATTORNEY REVIEW RECOMMENDED: Yes (exposure > $50,000)
\`\`\``,
  },
  {
    organizationId: ORG,
    name: "Payroll Data Ingestion Skill",
    description: "Parses and normalizes payroll exports from major HRIS and payroll systems: ADP Workforce Now, Workday HCM, Paychex Flex, UKG Pro (Kronos), Ceridian Dayforce, BambooHR, Gusto, and QuickBooks Payroll. Maps source fields to the canonical wage & hour audit data model (Employee, PayrollRecord, TimeRecord). Validates data completeness, flags missing records, and identifies data quality issues that could affect audit accuracy.",
    industry: "legal_services",
    domain: "wage-hour",
    version: "1.0.0",
    author: "Littler Mendelson Wage & Hour Practice Group",
    trustTier: "MEDIUM",
    dependencies: [],
    tags: ["wage-hour", "payroll-ingestion", "ADP", "Workday", "Paychex", "data-normalization", "HRIS"],
    agentTypeCompatibility: ["single", "team", "remote"],
    status: "active",
    complexity: "moderate",
    allowedTools: ["parse_csv", "map_fields", "validate_completeness", "flag_anomalies"],
    requiredMcpServers: ["file-ingestion-mcp", "data-quality-mcp"],
    requiredDataClassifications: ["payroll_pii", "time_records", "hr_data"],
    disableModelInvocation: false,
    contextMode: "direct",
    userInvocable: true,
    descriptionQualityScore: 90,
    industryContextId: null,
    knowledgeQueries: ["ADP export format", "Workday payroll fields", "Paychex data schema", "HRIS field mapping"],
    yamlFrontmatter: `name: Payroll Data Ingestion Skill
version: "1.0"
agent_code: LIT-AGT-002
domain: wage-hour
industry: legal_services
trust_tier: MEDIUM
context_mode: direct
supported_systems: [ADP_WFN, Workday_HCM, Paychex_Flex, UKG_Pro, Ceridian_Dayforce, BambooHR, Gusto, QuickBooks]
output_schema: canonical_wage_hour_audit_model
validation_checks: [completeness, date_continuity, employee_id_consistency, rate_reasonableness]
required_kb: Wage & Hour Compliance Audit Knowledge Base`,
    markdownBody: `# Payroll Data Ingestion Skill

## Purpose
Ingests raw payroll exports from any major HRIS/payroll system and normalizes them into the canonical Wage & Hour Audit data model for downstream analysis by the Classification, Overtime, and Meal Break skills.

## Supported Systems & Export Formats
| System | Primary Export Format | Key Fields Mapped |
|---|---|---|
| ADP Workforce Now | CSV / XML | EE ID, hours, earnings codes, dept, location |
| Workday HCM | CSV / XLSX | Worker ID, time entries, pay components, position |
| Paychex Flex | CSV | Employee #, reg/OT hours, pay rate, check date |
| UKG Pro (Kronos) | CSV / SQL export | Person ID, time punches, pay codes, pay period |
| Ceridian Dayforce | CSV / API | Employee ID, worked hours, pay categories |
| BambooHR | CSV | Employee ID, compensation, time-off data |
| Gusto | CSV | Employee ID, earnings, hours, tax info |
| QuickBooks Payroll | IIF / CSV | Employee, wage item, hours, amount |

## Canonical Output Schema
\`\`\`json
{
  "employee": {
    "employeeId": "string",
    "name": "string",
    "jobTitle": "string",
    "classification": "exempt|non-exempt|contractor",
    "worksite": { "city": "string", "state": "string", "zip": "string" },
    "hireDate": "ISO 8601",
    "separationDate": "ISO 8601 | null"
  },
  "payrollRecord": {
    "payPeriodStart": "ISO 8601",
    "payPeriodEnd": "ISO 8601",
    "checkDate": "ISO 8601",
    "regularHours": "decimal",
    "overtimeHours": "decimal",
    "regularRate": "decimal",
    "overtimePaid": "decimal",
    "totalGross": "decimal",
    "deductions": [],
    "netPay": "decimal"
  },
  "timeRecord": {
    "shiftDate": "ISO 8601",
    "clockIn": "HH:MM",
    "clockOut": "HH:MM",
    "mealBreaks": [{"start": "HH:MM", "end": "HH:MM"}],
    "totalHours": "decimal"
  }
}
\`\`\`

## Validation Checks
- Completeness: All employees have records for every pay period in scope
- Date continuity: No gaps in pay period history
- Rate reasonableness: Flag hourly rates below minimum wage or above $500/hr
- OT ratio: Flag employees with zero OT in weeks with > 40 hours recorded
- Duplicate record detection by employee + pay period
- Missing time punch records for non-exempt employees`,
  },
];

const KB_SOURCES = [
  {
    name: "FLSA Regulations & DOL Opinion Letters — Wage & Hour",
    sourceType: "text",
    content: `# FLSA Regulations & DOL Opinion Letters — Wage & Hour

## FLSA Core Requirements (29 U.S.C. §§ 201–219)
The Fair Labor Standards Act establishes federal minimum wage ($7.25/hr), overtime (1.5× for hours > 40/week), record-keeping, and child labor standards for covered employers.

## Exemption Regulations (29 C.F.R. Part 541)
### Executive Exemption (§541.100)
- Primary duty: management of enterprise or customarily recognized department
- Customarily and regularly directs 2+ employees
- Authority to hire/fire or recommendations given particular weight
- Paid on salary basis ≥ $684/week ($35,568/year)

### Administrative Exemption (§541.200)
- Primary duty: office/non-manual work directly related to management or general business operations
- Primary duty includes exercise of discretion and independent judgment with respect to matters of significance
- Salary ≥ $684/week

### Professional Exemption — Learned (§541.301)
- Primary duty: work requiring advanced knowledge in a field of science or learning
- Customarily acquired by prolonged course of specialized intellectual instruction
- Salary ≥ $684/week

### Computer Employee Exemption (§541.400)
- Employment in computer systems analysis, programming, software engineering
- Hourly rate ≥ $27.63 OR salary ≥ $684/week
- Primary duty: systems analysis, design, development, documentation, analysis, creation, testing, or modification

### Highly Compensated Employees (§541.601)
- Total annual compensation ≥ $107,432
- Customarily and regularly performs one or more exempt duties
- Paid on salary or fee basis ≥ $684/week

## Regular Rate of Pay (29 C.F.R. §778)
### Inclusions
- Hourly wages, piece-rate earnings, commissions (§778.117)
- Non-discretionary bonuses (§778.208)
- Shift differentials (§778.207)
- On-call pay (§778.223)

### Exclusions
- Discretionary bonuses (§778.211)
- Gifts and special occasion payments (§778.212)
- Vacation, holiday, sick leave pay (§778.218)
- Overtime premium payments (§778.202)

## DOL Opinion Letters (Key Guidance)
- FLSA 2019-6: Application of administrative exemption to financial services employees
- FLSA 2019-1: Fluctuating workweek method for non-exempt salaried employees
- FLSA 2018-19: Regular rate exclusion for wellness program benefits
- FLSA 2020-1: Remote work time tracking obligations
- FLSA 2021-2: Tipped employee minimum wage compliance after Tip Protection Act

## Statute of Limitations
- 2 years from date of violation (FLSA §255(a))
- 3 years for willful violations (employer knew or showed reckless disregard)
- Willfulness established in McLaughlin v. Richland Shoe Co., 486 U.S. 128 (1988)

## Liquidated Damages (FLSA §16(b))
- Mandatory equal amount to unpaid wages unless employer proves:
  (1) good faith belief that its actions complied with FLSA, AND
  (2) reasonable grounds for such belief
- Both prongs must be established by employer (burden of proof)`,
    tags: ["FLSA", "DOL", "exemptions", "regular-rate", "liquidated-damages", "overtime"],
    metadata: { source: "DOL / 29 C.F.R. Part 541 / 29 C.F.R. §778", lastUpdated: "2024-01-01", jurisdiction: "federal" },
  },
  {
    name: "State Wage & Hour Requirements Matrix — All 50 States",
    sourceType: "text",
    content: `# State Wage & Hour Requirements Matrix

## California — Most Restrictive Jurisdiction
### Minimum Wage: $16.00/hr (2024); fast food $20.00/hr (Apr 2024); healthcare $18–$23/hr (2024)
### Overtime Rules (IWC Wage Orders / Labor Code §510)
- 1.5× for hours 8–12 in any workday
- 2.0× for hours > 12 in any workday  
- 1.5× for first 8 hours on 7th consecutive day of workweek
- 2.0× for hours > 8 on 7th consecutive day
- Weekly: 1.5× for hours > 40/week
### Meal Periods (Labor Code §512 / Wage Order §11)
- First meal period: 30 min, before end of 5th hour worked; must be off-duty
- Second meal period: 30 min, before end of 10th hour worked
- Premium: 1 hr at regular rate per violation (§226.7)
- On-duty meal: Written agreement required; revocable any time; limited to specific Wage Orders
### Rest Periods (IWC Wage Orders §12)
- 10 min per 4 hours worked (or major fraction thereof)
- Must be in middle of work period where practicable
- Premium: 1 hr at regular rate per missed rest period
### Exemptions
- Executive, Administrative, Professional: salary ≥ 2× state minimum wage × 2080 hours = $66,560/yr (2024)
- Computer professional: salary ≥ $53.80/hr or $9,338.78/mo
### Penalties
- Waiting time (§203): 1 day's pay per day owed, max 30 days
- Wage statement (§226): $50 first, $100 subsequent, max $4,000/employee
- PAGA (§2699): $100/employee/pay period initial; $200 subsequent

## New York State
### Minimum Wage: $16.00/hr NYC, Long Island, Westchester (2024); $15.00/hr remainder of state
### Overtime: Standard FLSA weekly (no daily OT)
### Spread of Hours: 1 hr additional pay if spread of hours > 10 (NYC and counties)
### Exemptions: Salary thresholds higher than FLSA — NYC large employers $1,300/week (2024)
### Call-In Pay: Minimum 4 hours pay if scheduled but sent home early

## Washington State
### Minimum Wage: $16.28/hr (2024)
### Overtime: Standard FLSA weekly (no daily OT)
### Exemptions: Salary threshold = 2.0× state minimum wage × 2080 hrs = $67,724.80/yr (2024)
### Paid Sick Leave: 1 hr per 40 hrs worked; employer-wide policy required

## Colorado
### Minimum Wage: $14.42/hr (2024); Denver $18.29/hr
### Overtime (COMPS Order #39): 1.5× after 12 hrs/day OR 12 consecutive hours (not crossed midnight)
### Meal Periods: 30-min unpaid break if shift > 5 hours; 10-min paid rest per 4 hours
### Exemptions: COMPS Order salary threshold = $55,000/yr (2024)

## Illinois
### Minimum Wage: $14.00/hr (2024); Chicago $15.80/hr
### Overtime: Standard FLSA weekly
### Meal Breaks: 20-min break if shift > 7.5 hours; nursing mother accommodation

## Oregon
### Minimum Wage: $14.70/hr (standard); $15.95/hr Portland metro; $13.70/hr non-urban (2024)
### Overtime: Daily OT (1.5× > 10 hrs/day for certain industries); weekly > 40 hrs
### Predictive Scheduling: Oregon Fair Work Week Act (10+ employees in retail, hospitality, food service)

## Texas / Federal Default States (No Additional Requirements)
- Texas, Florida, Georgia, Alabama, Mississippi: Follow FLSA minimum requirements
- Minimum wage = federal $7.25/hr (no state increment)
- Overtime = FLSA weekly 40-hour threshold only

## Predictive / Fair Scheduling Laws
| Jurisdiction | Law | Employer Size | Advance Notice |
|---|---|---|---|
| San Francisco | Formula Retail Employee Rights Ordinances | 20+ locations, 20+ employees | 14 days |
| Seattle | Secure Scheduling Ordinance | 500+ employees (retail/food) | 14 days |
| New York City | Fair Workweek Laws | 300+ employees (retail/fast food) | 72 hours |
| Chicago | Fair Workweek Ordinance | 100+ employees (covered industries) | 10 days |
| Oregon | Fair Work Week Act | 10+ employees (retail, food, hospitality) | 7 days |
| Philadelphia | Fair Workweek Employment Standards | 250+ employees, 30+ locations | 10 days |`,
    tags: ["state-wage-hour", "overtime", "minimum-wage", "meal-breaks", "predictive-scheduling", "California", "New-York"],
    metadata: { source: "Littler GPS Wage & Hour Survey", lastUpdated: "2024-06-01", jurisdiction: "multi-state" },
  },
  {
    name: "Local Minimum Wage & Scheduling Ordinances Database",
    sourceType: "text",
    content: `# Local Minimum Wage & Scheduling Ordinances Database

## Major Municipal Minimum Wage Rates (2024)
| City / County | Rate | Effective Date | Employer Size Notes |
|---|---|---|---|
| San Francisco, CA | $18.67/hr | Jul 1, 2024 | All employers |
| Seattle, WA | $19.97/hr | Jan 1, 2024 | 501+ employees; $17.25/hr for smaller |
| Bellevue, WA | $20.29/hr | Jan 1, 2024 | 501+ employees |
| New York City, NY | $16.00/hr | Jan 1, 2024 | All employers |
| Los Angeles, CA | $17.28/hr | Jul 1, 2024 | All employers |
| West Hollywood, CA | $19.08/hr | Jul 1, 2024 | All employers |
| Denver, CO | $18.29/hr | Jan 1, 2024 | All employers |
| Chicago, IL | $15.80/hr | Jul 1, 2024 | 4–20 employees: $14.50 |
| Santa Fe, NM | $15.00/hr | Mar 1, 2024 | All employers |
| Emeryville, CA | $19.36/hr | Jul 1, 2024 | All employers |
| Berkeley, CA | $18.67/hr | Oct 1, 2024 | All employers |
| Pasadena, CA | $17.50/hr | Jul 1, 2024 | 26+ employees |
| Malibu, CA | $17.27/hr | Jul 1, 2024 | All employers |

## Fast Food Industry Minimum Wage (AB 1228 — California)
- All covered fast food workers: $20.00/hr effective April 1, 2024
- Covered: National chain fast food restaurants (60+ locations nationally)
- Not covered: Grocery store bakeries, restaurants in airports/hotels

## Healthcare Worker Minimum Wage (SB 525 — California)
- Health care facilities (hospitals, large medical groups, dialysis): $23/hr by 2024 schedule
- Clinics, community health: $21/hr by 2024
- Rural/small facilities: $18/hr by 2024

## Fair Scheduling Ordinance Requirements

### San Francisco Formula Retail Employee Rights Ordinances (FRERO)
- Employers: 20+ retail/restaurant locations worldwide with 20+ SF employees
- Advance notice: 14 days for work schedules
- Premium pay: 1–4 hours pay for schedule changes < 7 days notice
- Right to additional hours before new hires
- On-call restrictions: 24-hr notice required to cancel on-call shift

### Seattle Secure Scheduling Ordinance
- Employers: 500+ employees globally (retail, food service)
- Advance notice: 14 days for full schedule
- Predictability pay: 1 hr premium for < 14-day changes
- Geographic preference: Schedule existing part-time before hiring new FT
- Rest between shifts: 10 hours; premium pay otherwise

### New York City Fair Workweek Law
- Fast Food: All locations (300+ employees nationally); 72-hr advance notice
- Retail: 300+ employees; 72-hr notice; no on-call scheduling
- Premium pay: $100 for schedule change < 72 hrs notice (fast food)

### Chicago Fair Workweek Ordinance
- 100+ employees in covered industries (retail, restaurants, hotels, manufacturing, warehousing, building services)
- 10-day advance notice
- Premium pay: 1 hr at regular rate for schedule change < 10 days

### Oregon Fair Work Week Act
- 10+ employees in retail, hospitality, or food service
- 7-day advance notice
- Penalty: 1 hr pay for schedule change < 7 days
- Rest between shifts: 10 hours; premium for exception

## Tip Pool Rules Post-FLSA 2018 Amendment
- Employers who do NOT take tip credit: May include back-of-house in tip pool
- Employers who DO take tip credit: Cannot require sharing with back-of-house
- Managers/supervisors: Cannot participate in tip pools regardless
- Electronic tip tracking: Required for tip credit employers (recordkeeping)`,
    tags: ["local-ordinance", "minimum-wage", "scheduling", "tip-pool", "San-Francisco", "Seattle", "Chicago"],
    metadata: { source: "Littler Local Ordinance Database", lastUpdated: "2024-07-01", jurisdiction: "municipal" },
  },
  {
    name: "DOL Wage and Hour Division Field Operations Handbook",
    sourceType: "text",
    content: `# DOL Wage and Hour Division Field Operations Handbook (FOH)

## Investigation Procedures

### Initiation of Investigation
Investigations may be initiated by:
- Employee complaint (WHD Form WH-3)
- Directed investigation (agency priority initiatives)
- Conciliation referrals from EEOC
- Repeat violator monitoring
- CMP (civil money penalty) reviews

### Document Requests (FOH 51b)
WHD investigators typically request:
- Payroll records: 2 years (3 years for willful)
- Time records: Same retention period
- Employee roster with job titles and compensation
- Job descriptions for exemption analysis
- Written exemption analysis documentation
- Tip credit notices (if claiming)

### Cooperation Obligations
- Employers must permit access to records relevant to FLSA compliance
- Refusal to permit inspection = obstruction; WHD may seek subpoena
- Employees may not be disciplined for cooperating with WHD

### Settlement / Back Wage Recovery
- WHD may supervise payment of back wages (§16(c)) — waives right to sue
- Employer receives receipt and release from employee
- No liquidated damages in §16(c) settlements (WHD-supervised)
- Employees retain right to sue under §16(b) if not accepting WHD settlement

## Civil Money Penalties (29 C.F.R. Part 580)
- Child labor violations: Up to $15,625 per violation
- Repeated/willful minimum wage/OT violations: Up to $2,374 per violation (2024)
- FMLA interference: Up to $100 per violation per day

## Record-Keeping Requirements (29 C.F.R. Part 516)
For non-exempt employees, employers must maintain:
- Employee's full name and identifying information
- Home address including ZIP code
- Date of birth if under 19
- Sex and occupation
- Time and day of week when workweek begins
- Hours worked each workday and each workweek
- Total daily or weekly straight-time earnings
- Regular hourly pay rate for any week overtime is due
- Total overtime pay for each workweek
- Additions to or deductions from employee's wages
- Total wages paid each pay period
- Date of payment and pay period covered

**Retention Period**: 3 years for payroll records; 2 years for time cards and piece-rate records

## DOL Investigation Response Protocol
1. Designate single point of contact (typically HR Director + Wage & Hour counsel)
2. Preserve all responsive records immediately (litigation hold)
3. Do not destroy, alter, or conceal records
4. Conduct internal self-audit in parallel
5. Proactively identify issues before WHD does
6. Engage Littler Wage & Hour attorney before first WHD meeting
7. Document cooperation in writing

## Common WHD Findings — Industry Benchmarks
| Violation Type | % of Investigations | Avg Back Wages/Employee |
|---|---|---|
| Overtime miscalculation | 41% | $1,200 |
| Minimum wage | 33% | $640 |
| Record-keeping | 25% | — |
| Child labor | 8% | N/A |
| FMLA | 7% | varies |`,
    tags: ["DOL", "WHD", "investigation", "record-keeping", "cooperation", "civil-money-penalties"],
    metadata: { source: "DOL WHD Field Operations Handbook", lastUpdated: "2024-01-01", jurisdiction: "federal" },
  },
  {
    name: "Leading Case Law Digest — Classification, Overtime & Break Compliance",
    sourceType: "text",
    content: `# Leading Case Law Digest — Wage & Hour

## Employee Classification

### FLSA Coverage
- **IBP, Inc. v. Alvarez**, 546 U.S. 21 (2005): Pre- and post-shift activities that are integral and indispensable to principal activity are compensable
- **Tennessee Coal, Iron & R. Co. v. Muscoda Local No. 123**, 321 U.S. 590 (1944): Foundational case on compensable time
- **Anderson v. Mt. Clemens Pottery Co.**, 328 U.S. 680 (1946): Employee need only prove approximate hours worked; burden then shifts to employer to show precise amount

### Exempt/Non-Exempt
- **Auer v. Robbins**, 519 U.S. 452 (1997): Court defers to DOL's interpretive regulations (Auer deference — modified by Kisor v. Wilkie, 2019)
- **Encino Motorcars, LLC v. Navarro**, 584 U.S. 79 (2018): FLSA exemptions not to be narrowly construed; must be given fair reading
- **Perez v. Mortgage Bankers Association**, 575 U.S. 92 (2015): DOL need not engage in notice-and-comment to change interpretive rules

### Independent Contractor
- **ABC Test** (Dynamex Operations W. v. Superior Court, 4 Cal. 5th 903 (2018)): California adopts ABC test for IC classification
- **ABC Test Elements**: (A) free from control in fact and contract; (B) performs work outside usual course of business; (C) customarily engaged in independently established trade
- **Borello Test** (pre-Dynamex): Still applies to some relationships; multi-factor economic realities test

## Overtime & Regular Rate
- **Bay Ridge Operating Co. v. Aaron**, 334 U.S. 446 (1948): Overtime must be paid on all remuneration except exclusions
- **Shepler v. Weyerhaeuser**, 9th Cir. 2006: Non-discretionary bonuses must be retroactively included in regular rate
- **O'Brien v. Town of Agawam**, 1st Cir. 2004: Overtime computation methodology for salary-plus-bonus plans

## California Meal & Rest Breaks
- **Brinker Restaurant Corp. v. Superior Court**, 53 Cal. 4th 1004 (2012): Employer must provide (make available) meal period; need not ensure employee does not work; one meal premium per workday even with multiple violations
- **Donohue v. AMN Services, LLC**, 11 Cal. 5th 58 (2021): Piece-rate workers must be separately compensated for rest periods and other non-productive time; time rounding does not satisfy meal period obligations
- **Troester v. Starbucks**, 5 Cal. 5th 829 (2018): California does not recognize de minimis exception for off-the-clock work
- **Kirby v. Immoos Fire Protection**, 53 Cal. 4th 1244 (2012): Meal/rest break claims are not wage claims for purposes of attorney fee shifting

## PAGA
- **Iskanian v. CLS Transportation Los Angeles**, 59 Cal. 4th 348 (2014): PAGA waivers in arbitration agreements are unenforceable
- **Viking River Cruises v. Moriana**, 596 U.S. 639 (2022): Individual PAGA claims can be compelled to arbitration; standing for non-individual claims unclear
- **Adolph v. Uber Technologies**, 14 Cal. 5th 1104 (2023): Employee retains PAGA standing for non-individual claims even after individual claim sent to arbitration

## Waiting Time & Wage Statement Penalties
- **Mamika v. Barca**, 68 Cal. App. 4th 487 (1998): Willfulness for §203 penalties requires only that employer knew of obligation; not necessarily bad faith
- **Price v. Starbucks**, 192 Cal. App. 4th 1136 (2011): Wage statement penalties require employee to show suffered injury; deficient wage statement format establishes injury`,
    tags: ["case-law", "classification", "overtime", "Brinker", "PAGA", "Dynamex", "ABC-test", "meal-break"],
    metadata: { source: "Littler Wage & Hour Case Digest", lastUpdated: "2024-03-01", jurisdiction: "federal + California" },
  },
  {
    name: "Industry-Specific Classification Guides — Healthcare, Tech, Retail, Hospitality",
    sourceType: "text",
    content: `# Industry-Specific Classification Guides

## Healthcare Industry

### Common Misclassification Risks
- **Registered Nurses**: Most are non-exempt (no learned professional exemption without advanced degree + independent judgment); California RNs — IWC Wage Order No. 5
- **Home Health Aides**: Non-exempt under FLSA (2015 final rule); companionship services exemption eliminated for third-party employed aides
- **Medical Coders / Billers**: Administrative exemption risky; must show independent judgment on significant matters
- **Per Diem / Traveling Nurses**: Non-exempt; overtime applies; must track hours across all client facilities in same workweek

### 8-and-80 Alternative Workweek (Healthcare)
- Hospitals may adopt 8-and-80 agreement under FLSA §7(j)
- Overtime at 1.5× for hours > 8 in a day AND hours > 80 in 14-day period
- Written agreement required; election must include at least 50% of affected employees
- California: Separate process under Labor Code §511 (healthcare worker AWS)

### DOL Opinion Letter FLSA 2019-10
- Home companion services: Application of companionship exemption post-2015 rule

## Technology Industry

### Common Classifications
- **Software Engineers** (individual contributors): Computer employee exemption available if primary duty is application of systems analysis techniques; salary ≥ $684/week or $27.63/hr
- **Product Managers**: Administrative exemption potentially available; must show discretion/independent judgment over significant matters (not just recommendations)
- **DevOps / IT Support**: Generally non-exempt unless performing high-level systems analysis; help desk almost never exempt
- **Data Scientists**: If advanced degree in field of science + applies knowledge to specific facts → professional exemption; if primarily computer programming → computer exemption

### On-Call Time (Remote Workers)
- Post-COVID: On-call time compensation depends on freedom of use during off-hours
- FLSA: Significant constraints on employee's time = compensable
- Engage-or-wait standard: Employee engaged to wait = compensable; waiting to be engaged = non-compensable
- Document remote on-call policy clearly (Compensable On-Call Policy required)

## Retail Industry

### Commissioned Sales Staff (§7(i) Exemption)
- Retail or service establishment
- Employee's regular rate > 1.5× minimum wage
- More than half of compensation represents commissions
- If §7(i) met: Overtime computed differently (§7(g)(1) or commission-basis)

### Fluctuating Workweek Method (FWW)
- Non-exempt employee paid fixed salary regardless of hours
- Additional 0.5× for overtime hours (not 1.5×)
- Requirements: clear mutual understanding; salary covers all hours; OT pay on top
- Not available in some states (California prohibits FWW)

### Fair Scheduling in Retail
- Formula Retail ordinances (SF): Right to additional hours, schedule posting, on-call restrictions
- NYC Retail Worker Safety Act: Additional workplace violence protections

## Hospitality Industry

### Tipped Employees (FLSA §3(m)(2))
- Tip credit available: Employer pays $2.13/hr; tips must bring total ≥ $7.25/hr
- Dual jobs rule: Tip credit only for tipped work; side work ≥ 20% of hours = full minimum wage
- Tip pooling post-2018: Back-of-house included if employer does not take tip credit
- 80/20 rule: Side work ≤ 20% of hours (or ≤ 30 continuous minutes) — tip credit preserved

### Piece-Rate for Banquet/Event Staff
- Piece-rate for banquet functions: Must separately pay rest periods (California)
- Service charge distribution: IRS rules on whether service charge = tip or wage
- Mandatory gratuity > 20%: Taxed as wages, not tips

## Transportation / Gig Economy

### ABC Test (California) — Impact on Gig Workers
- Dynamex + AB5 (2019): Gig workers presumed employees unless ABC test met
- Prong B requires: Work outside usual course of business — Uber/Lyft held Prong B fails
- Prop 22 (2020): App-based transportation/delivery workers carved out from AB5; provides alternative benefits model
- Other states following California ABC model: Massachusetts, New Jersey, Illinois (pending)

### Motor Carrier Act Exemption
- Interstate truck drivers in small vehicle exemption: < 10,001 lb GVW = covered by FLSA (not MCA exemption)
- Local delivery drivers: Generally non-exempt`,
    tags: ["healthcare", "technology", "retail", "hospitality", "gig-economy", "classification", "tip-credit"],
    metadata: { source: "Littler Industry Classification Guide", lastUpdated: "2024-04-01", jurisdiction: "multi-industry" },
  },
];

const RUNBOOKS = [
  {
    organizationId: ORG,
    name: "Payroll Data Import Failure — Wage & Hour Audit",
    description: "Response procedure when payroll or time records cannot be ingested from client HRIS/payroll system, including data format troubleshooting, manual field mapping, and partial analysis fallback to prevent audit delays.",
    industry: "legal_services",
    category: "data_quality",
    triggerType: "auto",
    triggerConditions: [
      { metric: "ingestion_error_rate", value: 1, operator: "gt" },
      { metric: "missing_records_pct", value: 10, operator: "gt" },
    ],
    steps: [
      {
        type: "automated",
        stepNumber: 1,
        title: "Detect and Classify Import Failure",
        action: "Run payroll ingestion health check; classify failure type (format error, missing fields, encoding issue, partial data)",
        description: "Automated health check on ingested payroll file to identify root cause of import failure",
        expectedOutput: "Failure classification report: error type, affected records count, date range of missing data",
        timeoutMinutes: 5,
      },
      {
        type: "automated",
        stepNumber: 2,
        title: "Attempt Auto-Remediation",
        action: "Retry ingestion with alternative field mappings for detected HRIS system; attempt CSV delimiter and encoding normalization",
        description: "Apply known remediation patterns for the detected payroll system format",
        expectedOutput: "Either successful re-ingestion or escalation with specific error details",
        timeoutMinutes: 10,
      },
      {
        type: "human",
        stepNumber: 3,
        title: "Manual Field Mapping Review",
        action: "Data Operations Specialist to review exported file schema against canonical audit model; create custom mapping if source deviates from standard format",
        description: "Manual inspection of payroll export to identify non-standard column names, merged fields, or missing required data",
        timeoutMinutes: 60,
        responsibleRole: "Data Operations Specialist",
      },
      {
        type: "human_approval",
        stepNumber: 4,
        title: "Partial Analysis Approval",
        action: "If > 20% of records unrecoverable, seek attorney approval to proceed with partial dataset analysis with explicit limitations disclosure",
        description: "Wage & Hour counsel reviews scope of data gap and approves limitations language for audit report",
        timeoutMinutes: 120,
        responsibleRole: "Wage & Hour Counsel",
      },
      {
        type: "automated",
        stepNumber: 5,
        title: "Document Data Gap and Proceed",
        action: "Generate data gap documentation; inject limitations disclaimer into audit report; flag affected employee records as incomplete",
        description: "Record data quality issues in audit log; apply appropriate caveats to all findings derived from incomplete data",
        expectedOutput: "Audit report section: 'Data Limitations and Scope Restrictions' with specific employee/period gaps identified",
        timeoutMinutes: 15,
      },
    ],
    approvalGates: [{ step: 4, approver: "Wage & Hour Counsel", condition: "missing_records_pct > 20" }],
    autonomyLevel: "confirm_before",
    status: "active",
    isPreBuilt: true,
    severity: "high",
    estimatedDuration: "2-4 hours",
  },
  {
    organizationId: ORG,
    name: "DOL Investigation Response — Wage & Hour",
    description: "Rapid audit procedure activated upon receipt of DOL Wage and Hour Division investigation notice. Covers immediate document preservation, internal self-audit, attorney engagement, and cooperation protocol to minimize liability exposure.",
    industry: "legal_services",
    category: "regulatory_response",
    triggerType: "manual",
    triggerConditions: [{ metric: "dol_investigation_notice_received", value: 1, operator: "eq" }],
    steps: [
      {
        type: "human",
        stepNumber: 1,
        title: "Immediate Legal Hold",
        action: "Issue litigation hold notice to HR, Payroll, IT, and all relevant department heads; preserve ALL payroll, time, personnel records for investigation period + 90 days",
        description: "Prevent any document destruction. Suspend routine purge schedules immediately.",
        timeoutMinutes: 60,
        responsibleRole: "HR Director",
      },
      {
        type: "human_approval",
        stepNumber: 2,
        title: "Engage Littler Wage & Hour Counsel",
        action: "Notify designated Littler relationship attorney; share investigation notice; schedule preliminary strategy call within 24 hours",
        description: "All communications with WHD should be coordinated through Littler counsel after this step",
        timeoutMinutes: 240,
        responsibleRole: "General Counsel",
      },
      {
        type: "automated",
        stepNumber: 3,
        title: "Activate Internal Self-Audit",
        action: "Run Classification Analysis Skill and Overtime Calculation Engine Skill over all employees in investigation scope/period; generate preliminary findings report",
        description: "Understand exposure before WHD completes investigation; identify issues proactively",
        expectedOutput: "Internal self-audit report: classification risk findings, overtime calculation variances, exposure estimate by employee",
        timeoutMinutes: 120,
      },
      {
        type: "human",
        stepNumber: 4,
        title: "Document Response and Cooperation Protocol",
        action: "Prepare document index; redact privileged attorney-client communications; designate single point of contact (SPOC) for WHD; schedule investigation interview date",
        description: "Littler counsel coordinates all document production; maintain privilege log",
        timeoutMinutes: 480,
        responsibleRole: "Littler Wage & Hour Counsel",
      },
      {
        type: "human",
        stepNumber: 5,
        title: "WHD Interview and Document Production",
        action: "Littler counsel present for all WHD interviews; produce records per WHD document request; document all investigator questions and responses",
        description: "Cooperative but controlled response; do not volunteer information beyond what is requested",
        timeoutMinutes: 960,
        responsibleRole: "Littler Wage & Hour Counsel",
      },
      {
        type: "human_approval",
        stepNumber: 6,
        title: "Back Wage Calculation and Settlement Decision",
        action: "Run Exposure Modeling Skill on WHD preliminary findings; compare to internal self-audit; recommend settlement or contest strategy",
        description: "Evaluate §16(b) litigation vs. §16(c) supervised settlement; assess liquidated damages risk; advise client",
        timeoutMinutes: 480,
        responsibleRole: "Littler Wage & Hour Counsel",
      },
    ],
    approvalGates: [
      { step: 2, approver: "General Counsel", condition: "investigation_notice_received" },
      { step: 6, approver: "Littler Wage & Hour Counsel", condition: "settlement_decision_required" },
    ],
    autonomyLevel: "human_approval",
    status: "active",
    isPreBuilt: true,
    severity: "critical",
    estimatedDuration: "5-30 business days",
  },
  {
    organizationId: ORG,
    name: "Mass Reclassification Alert — Exempt to Non-Exempt",
    description: "Procedure for managing large-scale employee reclassification events triggered by salary threshold increases, duty test failures, or proactive compliance corrections. Covers impact assessment, cost modeling, payroll system updates, and multi-jurisdiction communication templates.",
    industry: "legal_services",
    category: "compliance_change",
    triggerType: "auto",
    triggerConditions: [
      { metric: "reclassification_count", value: 50, operator: "gte" },
      { metric: "salary_threshold_breach_count", value: 10, operator: "gte" },
    ],
    steps: [
      {
        type: "automated",
        stepNumber: 1,
        title: "Identify All Affected Employees",
        action: "Run Classification Analysis Skill across entire workforce; identify all employees who fail revised exemption tests due to salary threshold increase or duty test change",
        description: "Generate complete list of affected employees by location, department, manager, and current compensation",
        expectedOutput: "Affected employee roster with: name, ID, current classification, current salary, applicable jurisdiction, reason for reclassification",
        timeoutMinutes: 30,
      },
      {
        type: "automated",
        stepNumber: 2,
        title: "Cost Impact Modeling",
        action: "Run Exposure Modeling Skill on projected overtime for reclassified employees; model three scenarios: (1) salary increase to maintain exemption, (2) reclassification with OT, (3) hour reduction to minimize OT",
        description: "Quantify cost of each option to support management decision",
        expectedOutput: "Financial impact model with 3-year projections, overtime cost estimate, and cost of each remediation path",
        timeoutMinutes: 60,
      },
      {
        type: "human_approval",
        stepNumber: 3,
        title: "Management Decision on Remediation Path",
        action: "Present cost model to HR leadership and Finance; obtain approval for chosen remediation path (salary increase, reclassification, or hybrid approach)",
        description: "Decision must account for employee relations impact, market compensation data, and productivity effects",
        timeoutMinutes: 480,
        responsibleRole: "CHRO / CFO",
      },
      {
        type: "human",
        stepNumber: 4,
        title: "Payroll System Coordination",
        action: "Work with payroll provider to update employee classifications, pay rates, and overtime calculation rules in HRIS; coordinate with IT on timekeeping system activation for reclassified employees",
        description: "All reclassified employees must begin recording all hours worked; timekeeping training may be needed",
        timeoutMinutes: 960,
        responsibleRole: "HR Operations / Payroll Manager",
      },
      {
        type: "human",
        stepNumber: 5,
        title: "Employee Communication",
        action: "Notify affected employees using jurisdiction-appropriate templates; explain classification change, new timekeeping requirements, and overtime policies; address questions through HR business partners",
        description: "Communications should be legally reviewed; do not acknowledge prior violations in employee communications",
        timeoutMinutes: 480,
        responsibleRole: "HR Business Partners",
      },
      {
        type: "automated",
        stepNumber: 6,
        title: "Post-Reclassification Audit",
        action: "Run compliance verification 60 days after reclassification effective date; confirm all reclassified employees recording hours, receiving OT pay, and complying with break requirements",
        description: "Verify the reclassification was implemented correctly in payroll and that no new violations are occurring",
        expectedOutput: "Post-reclassification compliance report; any new violations flagged for immediate remediation",
        timeoutMinutes: 60,
      },
    ],
    approvalGates: [{ step: 3, approver: "CHRO / CFO", condition: "reclassification_count > 50" }],
    autonomyLevel: "confirm_before",
    status: "active",
    isPreBuilt: true,
    severity: "high",
    estimatedDuration: "3-6 weeks",
  },
  {
    organizationId: ORG,
    name: "New Minimum Wage Effective — Rate Update Procedure",
    description: "Operational procedure triggered when a new minimum wage rate takes effect in any jurisdiction where the client has employees. Covers affected employee identification, payroll system rate updates, and compliance verification before first affected payroll run.",
    industry: "legal_services",
    category: "regulatory_change",
    triggerType: "auto",
    triggerConditions: [
      { metric: "days_until_wage_effective", value: 30, operator: "lte" },
      { metric: "affected_employee_count", value: 1, operator: "gte" },
    ],
    steps: [
      {
        type: "automated",
        stepNumber: 1,
        title: "Detect Upcoming Rate Change",
        action: "Minimum Wage Tracker Skill alerts on new rate effective within 30 days; identify all employees at worksites in affected jurisdiction earning at or below new rate",
        description: "Pull affected employee list with current rate, location, and employment type (tipped/non-tipped, full-time/part-time)",
        expectedOutput: "Affected employee list: count, departments, average compensation gap, jurisdictions affected",
        timeoutMinutes: 15,
      },
      {
        type: "automated",
        stepNumber: 2,
        title: "Payroll System Update Request",
        action: "Generate payroll system configuration change request: new rate by jurisdiction/location effective as of rate change date; include tipped credit adjustment if applicable",
        description: "Ensure payroll system applies new rate from correct effective date; test with sample payroll calculation",
        expectedOutput: "Payroll configuration change ticket with: jurisdiction, old rate, new rate, effective date, tip credit adjustment",
        timeoutMinutes: 30,
      },
      {
        type: "human_approval",
        stepNumber: 3,
        title: "Payroll Manager Sign-Off",
        action: "Payroll Manager to verify rate update in payroll system before next scheduled payroll run; run test calculation for 5 sample employees",
        description: "Critical verification step: rate must be in place before first affected payroll processes",
        timeoutMinutes: 240,
        responsibleRole: "Payroll Manager",
      },
      {
        type: "automated",
        stepNumber: 4,
        title: "Post-Effective Compliance Scan",
        action: "Run Minimum Wage Tracker Skill against first payroll processed under new rate; flag any employees still receiving pre-increase rate",
        description: "Catch any employees missed in rate update (worksites overlooked, recently transferred employees, etc.)",
        expectedOutput: "Compliance scan results: all compliant OR list of employees requiring immediate off-cycle correction",
        timeoutMinutes: 30,
      },
      {
        type: "human",
        stepNumber: 5,
        title: "Off-Cycle Correction if Needed",
        action: "If any employees paid below new rate, issue off-cycle payroll correction immediately; do not wait for next regular payroll cycle",
        description: "Each day of underpayment is a separate violation; remediate immediately to stop accumulating exposure",
        timeoutMinutes: 480,
        responsibleRole: "Payroll Manager",
      },
    ],
    approvalGates: [{ step: 3, approver: "Payroll Manager", condition: "before_first_affected_payroll" }],
    autonomyLevel: "confirm_before",
    status: "active",
    isPreBuilt: true,
    severity: "high",
    estimatedDuration: "1-2 weeks",
  },
  {
    organizationId: ORG,
    name: "Audit Finding Dispute — Escalation to Wage & Hour Attorney",
    description: "Process for escalating disputed audit findings to a Littler wage and hour attorney when client challenges the agent's classification determination, overtime calculation, or exposure estimate. Ensures all disputes are resolved with attorney review and documented with supporting analysis.",
    industry: "legal_services",
    category: "escalation",
    triggerType: "manual",
    triggerConditions: [{ metric: "finding_disputed", value: 1, operator: "eq" }],
    steps: [
      {
        type: "automated",
        stepNumber: 1,
        title: "Package Disputed Finding for Review",
        action: "Compile complete analysis package: original finding, supporting data, all skill outputs (classification rationale, overtime calculation detail, exposure estimate), and client objection",
        description: "Attorney needs complete picture: data relied upon, analytical steps, conclusions, and specific point of dispute",
        expectedOutput: "Finding review package: 1-page summary, full skill output logs, data excerpts, client objection statement",
        timeoutMinutes: 15,
      },
      {
        type: "human",
        stepNumber: 2,
        title: "Littler Wage & Hour Attorney Review",
        action: "Assigned Littler Wage & Hour attorney reviews finding package; evaluates strength of client objection; researches any novel legal question if raised",
        description: "Attorney determines: (1) finding upheld, (2) finding modified, (3) finding withdrawn, (4) additional data needed",
        timeoutMinutes: 480,
        responsibleRole: "Littler Wage & Hour Attorney",
      },
      {
        type: "human_approval",
        stepNumber: 3,
        title: "Attorney Determination",
        action: "Attorney documents determination with legal rationale; if finding upheld, prepare client-facing explanation; if withdrawn, update audit report and rerun Exposure Modeling Skill",
        description: "All attorney determinations are attorney work product; document appropriately",
        timeoutMinutes: 240,
        responsibleRole: "Littler Wage & Hour Attorney",
      },
      {
        type: "automated",
        stepNumber: 4,
        title: "Update Audit Report",
        action: "Apply attorney determination to audit report; update exposure calculations if finding modified or withdrawn; generate updated findings summary",
        description: "Ensure audit report accurately reflects final determined findings including any attorney modifications",
        expectedOutput: "Revised audit report with attorney-reviewed findings; disposition logged for each disputed item",
        timeoutMinutes: 30,
      },
    ],
    approvalGates: [{ step: 3, approver: "Littler Wage & Hour Attorney", condition: "finding_disputed" }],
    autonomyLevel: "human_approval",
    status: "active",
    isPreBuilt: true,
    severity: "medium",
    estimatedDuration: "1-3 business days",
  },
  {
    organizationId: ORG,
    name: "Class Action Exposure Assessment — Rapid Enterprise Analysis",
    description: "Emergency procedure for rapid class-wide wage and hour exposure assessment when litigation threat is identified or PAGA notice received. Uses statistical sampling methodology to project enterprise-wide liability, prioritize remediation, and support settlement strategy.",
    industry: "legal_services",
    category: "litigation_response",
    triggerType: "manual",
    triggerConditions: [
      { metric: "paga_notice_received", value: 1, operator: "eq" },
      { metric: "class_action_threat_identified", value: 1, operator: "eq" },
    ],
    steps: [
      {
        type: "human_approval",
        stepNumber: 1,
        title: "Engage Litigation Counsel and Establish Privilege",
        action: "Immediately engage Littler Wage & Hour litigation team; all subsequent analysis conducted at direction of counsel under attorney-client privilege; issue litigation hold",
        description: "Protect all analysis from discovery by ensuring work product doctrine and attorney-client privilege attach",
        timeoutMinutes: 120,
        responsibleRole: "General Counsel",
      },
      {
        type: "automated",
        stepNumber: 2,
        title: "Define Class and Sample",
        action: "Identify putative class definition (employee type, jurisdiction, time period); run Payroll Data Ingestion Skill to compile complete class member payroll history; select statistically valid sample (≥ 5% of class or 100 records, whichever greater)",
        description: "Sample must be representative, randomly selected, and defensible as methodology in litigation",
        expectedOutput: "Class definition, class size, sample selection methodology, sample dataset",
        timeoutMinutes: 60,
      },
      {
        type: "automated",
        stepNumber: 3,
        title: "Run Full Audit on Sample",
        action: "Run Classification Analysis, Overtime Calculation Engine, Meal & Break Compliance, and Minimum Wage Tracker Skills on sample; document all findings at record level",
        description: "Sample audit must be as rigorous as full audit; every finding must be documentable with supporting data",
        expectedOutput: "Sample audit findings: violation rate by type, frequency, average underpayment per violation, worst-case records",
        timeoutMinutes: 120,
      },
      {
        type: "automated",
        stepNumber: 4,
        title: "Project Enterprise-Wide Exposure",
        action: "Run Exposure Modeling Skill: apply sample violation rates to full class; calculate back-pay, liquidated damages, PAGA penalties, waiting time penalties, wage statement penalties; model low/mid/high settlement scenarios",
        description: "Projection methodology must be disclosed in any settlement or trial; use defensible statistical approach",
        expectedOutput: "Enterprise exposure report: $LOW - $MID - $HIGH settlement range; PAGA penalty calculation; class size and period; recommended remediation priority",
        timeoutMinutes: 60,
      },
      {
        type: "human",
        stepNumber: 5,
        title: "Settlement Strategy and Mediation Preparation",
        action: "Littler litigation counsel reviews exposure model; prepares mediation brief with damages analysis; identifies affirmative defenses (good faith, statute of limitations, individualized issues); recommends settlement range",
        description: "Counsel uses exposure analysis to calibrate settlement authority and mediation strategy",
        timeoutMinutes: 960,
        responsibleRole: "Littler Wage & Hour Litigation Counsel",
      },
    ],
    approvalGates: [
      { step: 1, approver: "General Counsel", condition: "litigation_threat_identified" },
      { step: 5, approver: "Littler Wage & Hour Litigation Counsel", condition: "before_mediation" },
    ],
    autonomyLevel: "human_approval",
    status: "active",
    isPreBuilt: true,
    severity: "critical",
    estimatedDuration: "2-5 business days",
  },
];

const POLICIES = [
  {
    organizationId: ORG,
    name: "FLSA Compliance — Federal Wage & Hour Standards",
    domain: "compliance_enforcement",
    scopeType: "agent",
    scopeId: null,
    version: 1,
    status: "active",
    description: "Governs agent compliance with Fair Labor Standards Act requirements for minimum wage, overtime, record-keeping, and child labor. All agent outputs related to FLSA must cite applicable regulations and flag any determination that could expose the employer to FLSA liability.",
    policyJson: {
      policyId: "WAGE-POL-001",
      agentCode: "LIT-AGT-002",
      framework: "FLSA",
      regulation: "29 U.S.C. §§ 201-219 / 29 C.F.R. Parts 516, 541, 778",
      rules: [
        "All overtime determinations must cite 29 C.F.R. §778 and apply correct regular rate calculation",
        "Exemption analyses must evaluate all applicable exemption tests before reaching conclusion",
        "Agent must flag when salary level test is within 10% of threshold (borderline risk)",
        "All findings with exposure > $10,000 must include attorney review recommendation",
        "Record-keeping deficiencies must be separately noted from substantive wage violations",
        "Do not apply FLSA exemptions to workers in jurisdictions with stricter state standards without noting the stricter rule",
      ],
      enforcement: "mandatory",
      priority: 1,
    },
    ontologyRefs: ["Employee", "Payroll Record", "Exemption Test", "Jurisdiction Rule"],
  },
  {
    organizationId: ORG,
    name: "State Wage & Hour Laws — Multi-Jurisdiction Standards",
    domain: "compliance_enforcement",
    scopeType: "agent",
    scopeId: null,
    version: 1,
    status: "active",
    description: "Requires agent to apply state wage and hour law that is more favorable to the employee when state standards exceed FLSA. Agent must identify all applicable jurisdictions for each employee based on worksite location and apply the highest applicable standard.",
    policyJson: {
      policyId: "WAGE-POL-002",
      agentCode: "LIT-AGT-002",
      framework: "State Wage & Hour Laws",
      regulation: "California Labor Code / NYLL / and 48 other state regimes",
      rules: [
        "Always apply the most employee-favorable standard among federal, state, county, and municipal law",
        "California daily overtime rules apply to all employees working in California regardless of employer location",
        "New York spread-of-hours and call-in pay requirements must be checked for all NY employees",
        "Washington salary thresholds for exemption must be used for WA employees (exceed FLSA)",
        "Colorado COMPS Order overtime rules (daily OT) must be applied for CO employees",
        "Agent must identify all jurisdictions where employee works (not just primary worksite)",
      ],
      enforcement: "mandatory",
      priority: 1,
    },
    ontologyRefs: ["Employee", "Jurisdiction Rule", "Payroll Record", "Exemption Test"],
  },
  {
    organizationId: ORG,
    name: "Local Ordinances — Municipal Minimum Wage & Scheduling",
    domain: "compliance_enforcement",
    scopeType: "agent",
    scopeId: null,
    version: 1,
    status: "active",
    description: "Governs agent application of local municipal minimum wage rates, predictive scheduling requirements, and local employment standards. Agent must maintain current awareness of 200+ municipal ordinances and apply the highest applicable rate to each employee.",
    policyJson: {
      policyId: "WAGE-POL-003",
      agentCode: "LIT-AGT-002",
      framework: "Local Ordinances",
      regulation: "Municipal minimum wage ordinances / fair scheduling laws",
      rules: [
        "Local minimum wage rates supersede state rates when higher — always apply the highest applicable rate",
        "San Francisco, Seattle, NYC, LA, Chicago, Denver local rates must be tracked in real-time",
        "Fair Work Week / predictive scheduling obligations must be flagged for covered employers in covered jurisdictions",
        "On-call restrictions apply in SF FRERO and NYC retail — agent must flag when employer uses prohibited on-call practices",
        "Fast food industry minimum wage (CA AB 1228 — $20/hr) must be applied separately from general CA minimum wage",
        "Employer size thresholds for scheduling ordinances must be verified before applying scheduling requirements",
      ],
      enforcement: "mandatory",
      priority: 2,
    },
    ontologyRefs: ["Employee", "Jurisdiction Rule", "Audit Finding"],
  },
  {
    organizationId: ORG,
    name: "DOL Investigations — Cooperation and Privilege Protocol",
    domain: "escalation_protocol",
    scopeType: "agent",
    scopeId: null,
    version: 1,
    status: "active",
    description: "Establishes agent protocol during active DOL Wage and Hour Division investigations. Agent analysis conducted during active DOL investigation must be clearly marked as attorney-directed work product. Cooperation recommendations must follow Littler protocol.",
    policyJson: {
      policyId: "WAGE-POL-004",
      agentCode: "LIT-AGT-002",
      framework: "DOL Investigation Protocol",
      regulation: "FLSA §11(a) / DOL FOH",
      rules: [
        "If DOL investigation notice confirmed, activate DOL Investigation Response runbook immediately",
        "All self-audit analysis during active investigation must be marked ATTORNEY WORK PRODUCT — PRIVILEGED",
        "Agent must recommend engaging Littler Wage & Hour counsel before any WHD response is prepared",
        "Do not recommend admitting violations in any client-facing communication without attorney review",
        "Document preservation hold must be noted in all outputs during investigation period",
        "Agent outputs should not be shared with WHD without express attorney approval",
      ],
      enforcement: "mandatory",
      priority: 1,
    },
    ontologyRefs: ["Audit Finding", "Employee", "Violation"],
  },
  {
    organizationId: ORG,
    name: "PAGA — Private Attorneys General Act Compliance",
    domain: "litigation_risk",
    scopeType: "agent",
    scopeId: null,
    version: 1,
    status: "active",
    description: "Governs agent handling of PAGA-eligible violations for California employees. Agent must quantify PAGA civil penalty exposure separately from back-pay exposure and flag any pattern suggesting representative action risk. PAGA notice analysis requires immediate attorney escalation.",
    policyJson: {
      policyId: "WAGE-POL-005",
      agentCode: "LIT-AGT-002",
      framework: "California PAGA",
      regulation: "California Labor Code §§ 2698-2699.6",
      rules: [
        "For all California employees, PAGA civil penalties must be calculated separately from back-pay and state penalties",
        "PAGA penalties: $100/employee/pay period (initial violations); $200/employee/pay period (subsequent) — calculate both",
        "75% of PAGA penalties go to LWDA; 25% to aggrieved employees — disclose in exposure model",
        "Pattern of violations across multiple employees creates representative PAGA risk — flag when same violation type affects 3+ CA employees",
        "PAGA notice (LWDA notice) receipt triggers immediate escalation to Littler litigation counsel",
        "Iskanian/Adolph precedent on arbitration waivers must be noted for employers with arbitration agreements",
        "1-year statute of limitations for PAGA claims (from date of violation)",
      ],
      enforcement: "mandatory",
      priority: 1,
    },
    ontologyRefs: ["Violation", "Employee", "Audit Finding", "Jurisdiction Rule"],
  },
  {
    organizationId: ORG,
    name: "Pay Transparency — Multi-State Disclosure Requirements",
    domain: "disclosure_compliance",
    scopeType: "agent",
    scopeId: null,
    version: 1,
    status: "active",
    description: "Governs agent outputs relating to pay transparency obligations across Colorado, California, New York, Washington, Illinois, and other states with salary range disclosure laws. Agent must identify applicable disclosure requirements when auditing job postings, offer letters, and promotion notices.",
    policyJson: {
      policyId: "WAGE-POL-006",
      agentCode: "LIT-AGT-002",
      framework: "Pay Transparency Laws",
      regulation: "CO EPEWA / CA SB 1162 / NY Labor Law §194-b / WA ESB 5761",
      rules: [
        "Identify applicable pay transparency law for each open position based on worksite or remote-eligible location",
        "Colorado (EPEWA): All job postings must include salary/hourly range AND benefits; applies to remote roles that could be filled by CO resident",
        "California (SB 1162): Job postings must include pay scale; 100+ employers must submit pay data reports",
        "New York State/NYC: Job postings must include min and max salary or hourly range; good faith belief standard",
        "Washington (ESB 5761): Job postings must include wage/salary range AND benefits",
        "Illinois (EPAA Amendment): Salary range and benefits required in postings effective 2025",
        "Flag any pay range that is a single point (no range) in states requiring a range",
        "Retaliation prohibitions: Agent must note that pay inquiries are protected in applicable jurisdictions",
      ],
      enforcement: "advisory",
      priority: 2,
    },
    ontologyRefs: ["Employee", "Jurisdiction Rule", "Audit Finding"],
  },
];

const GOLDEN_DATASET = {
  organizationId: ORG,
  name: "Wage & Hour Compliance Audit Agent — Golden Dataset",
  description: "Curated evaluation dataset for LIT-AGT-002. Covers exempt/non-exempt classification scenarios, multi-state overtime calculations, meal and rest break violation detection, minimum wage compliance across 200+ jurisdictions, exposure modeling accuracy, and payroll data ingestion edge cases.",
  industry: "legal_services",
  useCase: "Wage & Hour Compliance Audit",
  version: "1.0",
  scenarioCategories: { edgeCases: 2, happyPath: 1, adversarial: 0, complianceCritical: 3 },
  qualityCoverage: 90,
  coverageDimensions: [
    "FLSA exemption test accuracy — all 5 categories",
    "California daily overtime and 7th-day OT calculations",
    "Meal period violation detection from time punch data",
    "Minimum wage compliance across layered jurisdictions",
    "PAGA penalty calculation accuracy",
    "Regular rate of pay with non-discretionary bonus inclusion",
    "ABC test IC classification (California)",
    "Exposure modeling vs. actual settlement amounts",
    "DOL record-keeping deficiency identification",
    "Multi-jurisdiction employee with split workweek",
    "Piece-rate worker rest period compensation",
    "Salary threshold borderline cases",
  ],
  benchmarkRange: { low: 85, high: 95 },
  contributors: [],
  growthHistory: [],
  status: "active",
  tags: ["wage-hour", "FLSA", "california", "overtime", "classification", "PAGA", "LIT-AGT-002"],
  aiGenerated: false,
  performanceBenchmarks: {
    classificationAccuracy: { target: 0.95, description: "Correct exempt/non-exempt determination vs. attorney-reviewed ground truth" },
    overtimeCalculationAccuracy: { target: 0.98, description: "Correct overtime amount within $0.01 vs. manual calculation" },
    mealBreakViolationDetectionRate: { target: 0.95, description: "Detect all meal period violations in time punch data" },
    minimumWageComplianceAccuracy: { target: 0.99, description: "Apply correct minimum wage rate for jurisdiction and effective date" },
    exposureModelAccuracy: { target: 0.90, description: "Exposure estimate within ±15% of actual settlement/judgment" },
    pagaPenaltyCalculationAccuracy: { target: 0.98, description: "Correct PAGA penalty per employee per pay period" },
  },
  dataRecordCount: 5000,
};

const TEST_CASES = [
  {
    name: "California Working Manager — Executive Exemption Analysis",
    inputScenario: "A retail store manager at a California location earns $800/week ($41,600/year). She manages 8 employees, can hire and fire with HR ratification, and sets employee schedules. However, she also works the cash register approximately 40% of her time alongside non-exempt employees. Her employer classifies her as exempt under the executive exemption. Is this classification correct?",
    expectedBehavior: "Agent must: (1) confirm federal executive exemption salary test met ($684/week); (2) confirm California salary test met ($66,560/year threshold — $41,600 FAILS California threshold); (3) determine classification is INCORRECT under California law regardless of duty test; (4) calculate back-pay exposure for OT hours worked; (5) cite California Labor Code and applicable IWC Wage Order",
    evaluationCriteria: [
      "Identifies California salary threshold of $66,560/year (2024) and that $41,600 fails this test",
      "Notes that California salary threshold = 2× state minimum wage × 2080 hours",
      "Distinguishes California standard from federal ($35,568/year) standard",
      "Concludes non-exempt under California law regardless of duties analysis",
      "Calculates retroactive OT exposure for California OT hours worked",
      "Cites California Labor Code and applicable IWC Wage Order",
      "Recommends attorney review given back-pay exposure",
    ],
    rubricScoring: {
      dimensions: [
        { name: "Salary Test Accuracy", weight: 0.40, passingScore: 1.0 },
        { name: "Jurisdiction Application", weight: 0.30, passingScore: 0.90 },
        { name: "Exposure Quantification", weight: 0.20, passingScore: 0.85 },
        { name: "Citation Quality", weight: 0.10, passingScore: 0.90 },
      ],
      passingScore: 0.92,
    },
    difficultyTier: "advanced",
    scenarioCategory: "compliance_critical",
    tags: ["california", "executive-exemption", "salary-threshold", "working-manager"],
    aiGenerated: false,
    status: "active",
  },
  {
    name: "Non-Discretionary Bonus — Regular Rate Recalculation",
    inputScenario: "A manufacturing employee in Ohio works the following week: Monday–Friday, 10 hours/day (50 hours total). Her base rate is $20/hour. In the same week, she receives a $200 production bonus (announced at start of quarter as incentive — non-discretionary). Her employer paid her $20×40 + $30×10 = $1,100 for the week, not including the bonus in the regular rate calculation. Is this correct?",
    expectedBehavior: "Agent must: (1) identify the $200 bonus as non-discretionary (pre-announced, incentive-based); (2) include it in regular rate calculation per 29 C.F.R. §778.208; (3) recalculate regular rate = ($800 straight time + $200 bonus) / 50 hours = $20/hour; (4) calculate correct OT = $20 × 1.5 × 10 hours = $300 OT premium (employer paid $300, so only half-time already embedded needs to be paid as additional $100); (5) identify underpayment of $100 in OT premium",
    expectedOutput: "Underpayment of $100 in OT premium. Regular rate = $20/hr. Correct OT = $300. Additional payment due = $100 (the bonus adds $200/50hrs = $4/hr to regular rate × 0.5 × 10 OT hours = $20... actually: regular rate = $1,000/50 = $20/hr, OT premium = $20 × 0.5 × 10 = $100, employer paid 10×$10=$100 half-time already, so additional due = $0... Recalculate: regular rate with bonus = ($800 base + $200 bonus)/50 = $20/hr; OT due = $20 × 1.5 × 10 = $300; employer paid $20×10 straight + $10×10 OT half = $300 total... should flag $200 bonus inclusion in regular rate and verify OT calculation)",
    evaluationCriteria: [
      "Identifies $200 bonus as non-discretionary and includes in regular rate per §778.208",
      "Correctly calculates regular rate = (straight-time earnings + bonus) / total hours",
      "Applies half-time method for salaried employees or correct methodology for hourly",
      "Identifies any underpayment with exact dollar amount",
      "Cites 29 C.F.R. §778.208 for non-discretionary bonus treatment",
      "Notes that employer's failure to include bonus in regular rate is a common FLSA violation",
    ],
    rubricScoring: {
      dimensions: [
        { name: "Regular Rate Calculation Accuracy", weight: 0.45, passingScore: 1.0 },
        { name: "Bonus Classification", weight: 0.25, passingScore: 1.0 },
        { name: "Underpayment Quantification", weight: 0.20, passingScore: 0.90 },
        { name: "Regulatory Citation", weight: 0.10, passingScore: 0.90 },
      ],
      passingScore: 0.95,
    },
    difficultyTier: "advanced",
    scenarioCategory: "compliance_critical",
    tags: ["regular-rate", "non-discretionary-bonus", "FLSA", "overtime-calculation"],
    aiGenerated: false,
    status: "active",
  },
  {
    name: "California Meal Period Violation — Time Punch Analysis",
    inputScenario: "Review the following time punch data for a non-exempt California warehouse employee on a single workday: Clock In 7:00 AM. First Meal Out: 11:58 AM (4 hr 58 min into shift). First Meal In: 12:22 PM (24-minute meal period). Second Meal Out: 5:45 PM (5 hr 23 min after returning from first meal). Second Meal In: 6:10 PM (25-minute meal period). Clock Out: 10:30 PM. Total shift: 15.5 hours. What violations exist and what is the premium pay owed?",
    expectedBehavior: "Agent must identify: (1) First meal period taken at 4h58m — within the 5-hour window, COMPLIANT for timing; but duration is only 24 minutes — VIOLATION (must be ≥ 30 minutes); (2) Second meal period timing: first meal ended 12:22 PM, second meal started 5:45 PM = 5h23m after first meal ended, total work time before second meal from shift start = 10h45m — second meal must start before end of 10th hour — VIOLATION (started at hour 10:45); (3) Duration of second meal: 25 minutes — VIOLATION; (4) Premium pay: 3 violations × 1 hour at regular rate each",
    evaluationCriteria: [
      "Identifies first meal period duration violation (24 min < 30 min required)",
      "Identifies second meal period timing violation (started past 10th hour of work)",
      "Identifies second meal period duration violation (25 min < 30 min required)",
      "Calculates 3 premium pay violations (not 2 — both timing AND duration for second meal = 1 violation per missed meal, so 2 meal period violations; but must clarify whether duration and timing are separate violations — per Brinker, one premium per workday per meal period)",
      "Cites California Labor Code §512 and §226.7",
      "Cites Brinker Restaurant Corp. v. Superior Court for one-premium-per-meal-period rule",
      "Calculates premium pay: number of violations × 1 hr at employee's regular rate",
    ],
    rubricScoring: {
      dimensions: [
        { name: "Violation Detection Accuracy", weight: 0.40, passingScore: 1.0 },
        { name: "Premium Pay Calculation", weight: 0.30, passingScore: 0.95 },
        { name: "Brinker Rule Application", weight: 0.20, passingScore: 0.90 },
        { name: "Citation Quality", weight: 0.10, passingScore: 0.90 },
      ],
      passingScore: 0.93,
    },
    difficultyTier: "advanced",
    scenarioCategory: "compliance_critical",
    tags: ["california", "meal-period", "time-punch", "premium-pay", "Brinker"],
    aiGenerated: false,
    status: "active",
  },
  {
    name: "Layered Minimum Wage — San Francisco Employee",
    inputScenario: "A coffee shop worker is employed at a location in San Francisco, CA. She earns $17.00/hour. Her employer has 25 locations nationwide and 35 employees in San Francisco. The payroll period is July 1, 2024. Is she being paid the correct minimum wage? What obligations does her employer have?",
    expectedBehavior: "Agent must: (1) identify applicable minimum wage: California state = $16.00/hr (2024); San Francisco local = $18.67/hr effective July 1, 2024; apply highest rate = $18.67/hr; (2) identify $17.00/hr VIOLATES SF minimum wage by $1.67/hr; (3) check fast food exemption — coffee shop likely not an AB 1228 covered chain (confirm criteria); (4) calculate back-pay from July 1, 2024; (5) flag SF FRERO scheduling obligations for 20+ locations with 20+ SF employees — APPLY (25 locations, 35 SF employees)",
    evaluationCriteria: [
      "Identifies San Francisco minimum wage of $18.67/hr (July 1, 2024) as the controlling rate",
      "Correctly applies highest of federal/state/local — $18.67/hr",
      "Identifies $1.67/hour underpayment",
      "Calculates back-pay exposure for affected period",
      "Notes SF FRERO scheduling obligations apply (25 locations > 20, 35 SF employees > 20)",
      "Checks fast food exemption applicability (AB 1228) and correctly applies or excludes",
      "Notes penalty for minimum wage violation",
    ],
    rubricScoring: {
      dimensions: [
        { name: "Wage Rate Identification", weight: 0.35, passingScore: 1.0 },
        { name: "Jurisdictional Hierarchy Application", weight: 0.25, passingScore: 1.0 },
        { name: "Scheduling Obligation Identification", weight: 0.20, passingScore: 0.90 },
        { name: "Back-Pay Calculation", weight: 0.20, passingScore: 0.90 },
      ],
      passingScore: 0.93,
    },
    difficultyTier: "standard",
    scenarioCategory: "compliance_critical",
    tags: ["minimum-wage", "san-francisco", "local-ordinance", "FRERO", "layered-jurisdiction"],
    aiGenerated: false,
    status: "active",
  },
  {
    name: "PAGA Exposure Calculation — Pattern Violation",
    inputScenario: "A California employer has 200 non-exempt employees. A wage & hour audit discovers that meal period premiums were systematically not paid from January 1, 2023 to December 31, 2023 (52 pay periods, bi-weekly). The violation affected all 200 employees. 100 employees separated during this period without receiving all wages owed. Calculate the full California exposure including PAGA penalties, waiting time penalties, and wage statement penalties assuming average meal violation of 2/week per employee at $25/hour regular rate.",
    expectedBehavior: "Agent must calculate: Back pay: 200 employees × 2 violations/week × 52 weeks × 1hr × $25 = $520,000; PAGA penalties: $100/employee/pay period × 200 × 26 initial pay periods = $520,000; then $200/pay period × 200 × 26 subsequent periods = $1,040,000; total PAGA = $1,560,000 (75% to LWDA); Waiting time penalties: 100 separated employees × 30 days × daily rate; Wage statement penalties: 200 × 26 pay periods × $100 = $520,000 (capped at $4,000/employee = $400,000 for 100 employees); Total exposure calculation with all components",
    evaluationCriteria: [
      "Correctly calculates back-pay for meal period premium violations",
      "Applies PAGA penalty structure: $100 initial / $200 subsequent per employee per pay period",
      "Correctly splits PAGA 75% LWDA / 25% employees",
      "Calculates waiting time penalties for 100 separated employees (§203)",
      "Applies wage statement penalty caps ($4,000/employee under §226(e))",
      "Provides total exposure with component breakdown",
      "Notes 1-year PAGA SOL and 3-year CA wage claim SOL",
      "Recommends immediate attorney engagement given exposure scale",
    ],
    rubricScoring: {
      dimensions: [
        { name: "PAGA Penalty Calculation Accuracy", weight: 0.35, passingScore: 1.0 },
        { name: "Back-Pay Calculation", weight: 0.25, passingScore: 0.95 },
        { name: "Waiting Time + Wage Statement Penalties", weight: 0.25, passingScore: 0.90 },
        { name: "SOL Application", weight: 0.15, passingScore: 0.90 },
      ],
      passingScore: 0.95,
    },
    difficultyTier: "advanced",
    scenarioCategory: "compliance_critical",
    tags: ["PAGA", "california", "exposure-modeling", "meal-period", "waiting-time", "wage-statement"],
    aiGenerated: false,
    status: "active",
  },
  {
    name: "IC Misclassification — California ABC Test (Gig Worker)",
    inputScenario: "A technology company uses 50 delivery drivers in California classified as independent contractors. The drivers: (1) are required to use the company's app for all deliveries; (2) can set their own hours (log on/off anytime); (3) are prohibited from working for competing delivery platforms while logged into the company app; (4) perform delivery services that are the company's core business; (5) do not have independently established delivery businesses. The company claims they pass the ABC test because drivers set their own hours. Are the drivers correctly classified?",
    expectedBehavior: "Agent must apply California ABC test (Dynamex / AB5): Prong A: Is the worker free from control and direction? — Arguable yes (set own hours) but app controls work method → CONTESTED; Prong B: Is the work outside the usual course of business? — NO, delivery IS the company's core business → FAILS PRONG B → PRESUMPTIVE EMPLOYEE; Prong C: Is the worker customarily engaged in an independently established trade? — No independent delivery business established → FAILS PRONG C; Conclusion: EMPLOYEE under California law regardless of hours flexibility; calculate reclassification exposure",
    evaluationCriteria: [
      "Applies California ABC test from Dynamex Operations W. v. Superior Court and AB5",
      "Correctly identifies Prong B failure: delivery is the company's core business",
      "Correctly identifies Prong C failure: no independently established business",
      "Concludes EMPLOYEE status (not IC) under California law",
      "Notes that hours flexibility does not satisfy all prongs of ABC test",
      "Calculates reclassification exposure: back minimum wage, overtime, meal/rest break premiums, PAGA penalties",
      "Notes Prop 22 exception does NOT apply (company not app-based transportation/delivery per Prop 22 definition — analysis depends on facts)",
      "Recommends immediate attorney engagement",
    ],
    rubricScoring: {
      dimensions: [
        { name: "ABC Test Application", weight: 0.40, passingScore: 1.0 },
        { name: "Prong B/C Analysis", weight: 0.30, passingScore: 1.0 },
        { name: "Reclassification Exposure", weight: 0.20, passingScore: 0.85 },
        { name: "Prop 22 Consideration", weight: 0.10, passingScore: 0.80 },
      ],
      passingScore: 0.93,
    },
    difficultyTier: "advanced",
    scenarioCategory: "edge_case",
    tags: ["california", "ABC-test", "IC-misclassification", "gig-economy", "Dynamex", "AB5"],
    aiGenerated: false,
    status: "active",
  },
];

const OUTCOME = {
  organizationId: ORG,
  name: "Wage & Hour Audit Accuracy & Risk Mitigation",
  description: "Outcome contract for LIT-AGT-002. Measures classification accuracy, overtime calculation precision, violation detection completeness, exposure modeling accuracy, and litigation risk reduction for Littler Mendelson wage and hour audit clients.",
  riskTier: "HIGH",
  status: "active",
  version: 1,
  pricingModel: "per_audit",
  pricePerUnit: 2500,
  currency: "USD",
  pricingTiers: [
    { minUnits: 1, maxUnits: 10, pricePerUnit: 2500 },
    { minUnits: 11, maxUnits: 50, pricePerUnit: 2000 },
    { minUnits: 51, maxUnits: null, pricePerUnit: 1500 },
  ],
  volumeCap: 500,
  slaConfig: {
    maxLatencyMs: 30000,
    uptimeTarget: 0.995,
    responseTimeP95: 15000,
    auditCompletionHours: 24,
  },
  attributionRules: {
    model: "last_touch",
    agentId: null,
    lookbackDays: 90,
    minimumContribution: 0.5,
  },
  approvalGates: [
    { stage: "classification_review", trigger: "confidence < 75%", approver: "Wage & Hour Counsel" },
    { stage: "exposure_review", trigger: "total_exposure > 100000", approver: "Senior Partner" },
    { stage: "dol_response", trigger: "investigation_active", approver: "Litigation Counsel" },
  ],
  riskThreshold: 0.15,
  maxDriftPercent: 5,
  autoPauseTrigger: true,
  constraintGraph: {
    dependencies: ["Classification Analysis Skill", "Overtime Calculation Engine Skill", "Meal & Break Compliance Skill", "Minimum Wage Tracker Skill", "Exposure Modeling Skill"],
    criticalPath: ["payroll_ingestion", "classification", "overtime_calc", "exposure_model"],
  },
  roiEstimate: {
    averageExposureReduced: 450000,
    auditCostSavings: 35000,
    litigationRiskReduction: 0.60,
    payrollComplianceCostSavings: 22000,
  },
};

const KPIS = [
  { name: "Employee Classification Accuracy", unit: "percent", baseline: 82, target: 95, targetOperator: "gte", weight: 0.20, slaThreshold: 90, breachLevel: "critical", confidence: 0.90, trend: "stable", expression: "(correct_classifications / total_classifications) * 100", measurement: "Validated against attorney-reviewed ground truth dataset of 5,000+ classification scenarios" },
  { name: "Overtime Calculation Precision", unit: "percent", baseline: 91, target: 98, targetOperator: "gte", weight: 0.18, slaThreshold: 95, breachLevel: "critical", confidence: 0.95, trend: "improving", expression: "(calculations_within_1_dollar / total_overtime_calculations) * 100", measurement: "Compared against manual calculation by Wage & Hour paralegal on sample of 200 cases/month" },
  { name: "Meal Break Violation Detection Rate", unit: "percent", baseline: 85, target: 95, targetOperator: "gte", weight: 0.15, slaThreshold: 90, breachLevel: "high", confidence: 0.88, trend: "stable", expression: "(violations_detected / known_violations_in_test_set) * 100", measurement: "Golden dataset of manually reviewed time punch records with confirmed violations" },
  { name: "Minimum Wage Compliance Check Accuracy", unit: "percent", baseline: 94, target: 99, targetOperator: "gte", weight: 0.15, slaThreshold: 97, breachLevel: "critical", confidence: 0.95, trend: "stable", expression: "(correct_rate_applications / total_rate_checks) * 100", measurement: "Validated against Minimum Wage Tracker rate database for 200+ jurisdictions" },
  { name: "PAGA Penalty Calculation Accuracy", unit: "percent", baseline: 88, target: 98, targetOperator: "gte", weight: 0.12, slaThreshold: 95, breachLevel: "high", confidence: 0.90, trend: "improving", expression: "(accurate_paga_calcs / total_paga_calcs) * 100", measurement: "Cross-verified against Littler PAGA calculation model on set of 100 representative cases" },
  { name: "Exposure Model Accuracy", unit: "percent", baseline: 78, target: 90, targetOperator: "gte", weight: 0.10, slaThreshold: 82, breachLevel: "medium", confidence: 0.82, trend: "improving", expression: "100 - avg(abs((model_exposure - actual_settlement) / actual_settlement) * 100)", measurement: "Compared against actual settlement/judgment outcomes from closed Littler Wage & Hour matters" },
  { name: "Audit Report Completion Time", unit: "hours", baseline: 48, target: 24, targetOperator: "lte", weight: 0.05, slaThreshold: 36, breachLevel: "medium", confidence: 0.92, trend: "improving", expression: "avg(audit_completion_time_hours)", measurement: "Time from payroll data ingestion to final audit report delivery" },
  { name: "Attorney Escalation Precision", unit: "percent", baseline: 71, target: 88, targetOperator: "gte", weight: 0.05, slaThreshold: 80, breachLevel: "low", confidence: 0.80, trend: "stable", expression: "(correctly_escalated / total_escalations) * 100", measurement: "Proportion of escalations that were validated by attorney as requiring escalation (no false escalations)" },
];

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n════════════════════════════════════════════════════════════════════");
  console.log("  LIT-AGT-002 — Wage & Hour Compliance Audit Agent");
  console.log("  Creating all platform intelligence in DEV environment");
  console.log("════════════════════════════════════════════════════════════════════\n");

  const ids = {};

  // ── STEP 1: 6 SKILLS ─────────────────────────────────────────────────────────
  step("1", "10", "Creating 6 skills…");
  ids.skillIds = [];
  for (const s of SKILLS) {
    const res = await post("/api/skills", s);
    ids.skillIds.push(res.id);
    log(`Skill: ${s.name} → ${res.id}`);
  }

  // ── STEP 2: KNOWLEDGE BASE ───────────────────────────────────────────────────
  step("2", "10", "Creating knowledge base…");
  const kbRes = await post("/api/knowledge-bases", {
    organizationId: ORG,
    name: "Wage & Hour Compliance Audit Knowledge Base",
    description: "Comprehensive wage and hour knowledge repository for LIT-AGT-002. Covers FLSA regulations, DOL opinion letters, state wage & hour requirements across all 50 states, 200+ local ordinances, DOL Field Operations Handbook, leading case law (Brinker, Dynamex, Donohue), and industry-specific classification guides.",
    industry: "legal_services",
    status: "active",
    vectorDbType: "pgvector",
    vectorDbConfig: {},
    embeddingModel: "text-embedding-3-small",
    embeddingDimensions: 1536,
    chunkSize: 768,
    chunkOverlap: 100,
    stalenessThresholdDays: 14,
  });
  ids.kbId = kbRes.id;
  log(`Knowledge Base → ${kbRes.id}`);

  // ── STEP 3: 6 KB SOURCES ─────────────────────────────────────────────────────
  step("3", "10", "Ingesting 6 knowledge base sources…");
  ids.kbSourceIds = [];
  for (const src of KB_SOURCES) {
    try {
      const res = await post(`/api/knowledge-bases/${ids.kbId}/sources/text`, {
        ...src,
        knowledgeBaseId: ids.kbId,
        organizationId: ORG,
      });
      ids.kbSourceIds.push(res.id);
      log(`KB Source: ${src.name.slice(0, 60)} → ${res.id}`);
    } catch (e) {
      warn(`KB Source failed (non-fatal): ${src.name.slice(0, 40)} — ${e.message.slice(0, 80)}`);
    }
  }

  // ── STEP 4: 6 RUNBOOKS ───────────────────────────────────────────────────────
  step("4", "10", "Creating 6 runbooks…");
  ids.runbookIds = [];
  for (const rb of RUNBOOKS) {
    const res = await post("/api/runbooks", rb);
    ids.runbookIds.push(res.id);
    log(`Runbook: ${rb.name.slice(0, 60)} → ${res.id}`);
  }

  // ── STEP 5: 6 POLICIES ───────────────────────────────────────────────────────
  step("5", "10", "Creating 6 governance policies…");
  ids.policyIds = [];
  for (const p of POLICIES) {
    const res = await post("/api/policies", p);
    ids.policyIds.push(res.id);
    log(`Policy: ${p.name.slice(0, 60)} → ${res.id}`);
  }

  // ── STEP 6: AGENT ────────────────────────────────────────────────────────────
  step("6", "10", "Creating agent LIT-AGT-002…");
  const agentRes = await post("/api/agents", {
    organizationId: ORG,
    name: "Wage & Hour Compliance Audit Agent",
    agentType: "analysis",
    description: "Conducts comprehensive wage and hour compliance audits across FLSA and state wage laws. Analyzes employee classifications (exempt vs. non-exempt), overtime calculations, meal and rest break compliance, minimum wage adherence across 200+ jurisdictions, and predictive scheduling obligations. Maps to Littler's Wage & Hour practice area and Audit Quarterback (Audit QB) product. Generates risk-scored findings with remediation recommendations and financial exposure estimates.",
    owner: "Littler Mendelson P.C.",
    status: "active",
    riskTier: "HIGH",
    autonomyMode: "supervised",
    currentVersion: "1.0.0",
    environment: "staging",
    modelProvider: "anthropic",
    modelName: "claude-opus-4-5",
    department: "Wage & Hour Practice",
    blueprintJson: {
      version: "1.0",
      agentCode: "LIT-AGT-002",
      practiceArea: "Wage & Hour",
      productMapping: "Audit Quarterback (Audit QB)",
      nodes: [
        { id: "intake", type: "trigger", label: "Receive Payroll Data & Job Descriptions" },
        { id: "data_ingestion", type: "skill", label: "Payroll Data Ingestion", skillRef: "payroll-data-ingestion-skill" },
        { id: "classification", type: "skill", label: "Employee Classification Analysis", skillRef: "classification-analysis-skill" },
        { id: "overtime", type: "skill", label: "Overtime Calculation Engine", skillRef: "overtime-calculation-engine-skill" },
        { id: "meal_break", type: "skill", label: "Meal & Break Compliance Audit", skillRef: "meal-break-compliance-skill" },
        { id: "min_wage", type: "skill", label: "Minimum Wage Compliance Check", skillRef: "minimum-wage-tracker-skill" },
        { id: "exposure", type: "skill", label: "Financial Exposure Modeling", skillRef: "exposure-modeling-skill" },
        { id: "confidence_gate", type: "decision", label: "Findings Confidence ≥ 75%?" },
        { id: "attorney_review", type: "human_in_loop", label: "Route to Wage & Hour Attorney" },
        { id: "generate_report", type: "output", label: "Generate Risk-Scored Audit Report" },
        { id: "remediation_tracking", type: "system", label: "Track Remediation Progress" },
      ],
      edges: [
        { from: "intake", to: "data_ingestion" },
        { from: "data_ingestion", to: "classification" },
        { from: "data_ingestion", to: "min_wage" },
        { from: "classification", to: "overtime" },
        { from: "overtime", to: "meal_break" },
        { from: "meal_break", to: "exposure" },
        { from: "min_wage", to: "exposure" },
        { from: "exposure", to: "confidence_gate" },
        { from: "confidence_gate", to: "attorney_review", condition: "confidence < 75% OR exposure > $100,000" },
        { from: "confidence_gate", to: "generate_report", condition: "confidence >= 75% AND exposure <= $100,000" },
        { from: "attorney_review", to: "generate_report" },
        { from: "generate_report", to: "remediation_tracking" },
      ],
    },
    toolsConfig: {
      allowedTools: ["retrieve_kb", "query_jurisdiction_rules", "calculate_regular_rate", "compute_exposure", "parse_time_records", "lookup_wage_rate", "parse_csv", "map_fields"],
      mcpServers: ["littler-gps-mcp", "payroll-calc-mcp", "time-records-mcp", "wage-rate-mcp", "file-ingestion-mcp"],
    },
    maxToolIterations: 8,
    preloadedSkills: ids.skillIds,
    policyBindings: ids.policyIds,
  });
  ids.agentId = agentRes.id;
  log(`Agent: Wage & Hour Compliance Audit Agent → ${agentRes.id}`);

  // ── STEP 7: GOLDEN DATASET + TEST CASES ──────────────────────────────────────
  step("7", "10", "Creating golden dataset + 6 test cases…");
  const dsRes = await post("/api/golden-datasets", GOLDEN_DATASET);
  ids.goldenDatasetId = dsRes.id;
  log(`Golden Dataset → ${dsRes.id}`);

  for (const tc of TEST_CASES) {
    const tcRes = await post(`/api/golden-datasets/${ids.goldenDatasetId}/test-cases`, {
      ...tc,
      datasetId: ids.goldenDatasetId,
      organizationId: ORG,
    });
    log(`Test Case: ${tc.name.slice(0, 60)} → ${tcRes.id}`);
  }

  // ── STEP 8: EVAL SUITE ────────────────────────────────────────────────────────
  step("8", "10", "Creating evaluation suite…");
  const evalRes = await post("/api/evals", {
    organizationId: ORG,
    agentId: ids.agentId,
    goldenDatasetId: ids.goldenDatasetId,
    skillId: null,
    name: "LIT-AGT-002 Wage & Hour Audit Evaluation Suite",
    type: "accuracy",
    thresholdConfig: {
      classificationAccuracy: 0.95,
      overtimeCalculationPrecision: 0.98,
      mealBreakDetectionRate: 0.95,
      minimumWageAccuracy: 0.99,
      pagaCalculationAccuracy: 0.98,
      exposureModelAccuracy: 0.90,
      overallPassRate: 0.93,
    },
    scorerConfig: {
      primary: "attorney_ground_truth",
      secondary: "rule_based_calculation_check",
      rubric: "rubricScoring",
      citationCheck: true,
      jurisdictionAccuracyCheck: true,
    },
    coverageTags: ["FLSA", "california", "overtime", "meal-break", "minimum-wage", "PAGA", "ABC-test", "exposure-modeling"],
    environmentThresholds: {
      staging: { minPassRate: 0.88 },
      production: { minPassRate: 0.93 },
    },
    schedule: { frequency: "weekly", dayOfWeek: "Monday", time: "06:00 UTC" },
    industry: "legal_services",
    ontologyTags: ["Employee", "Payroll Record", "Exemption Test", "Violation", "Jurisdiction Rule", "Audit Finding"],
  });
  ids.evalSuiteId = evalRes.id;
  log(`Eval Suite → ${evalRes.id}`);

  // ── STEP 9: OUTCOME CONTRACT + KPIs ──────────────────────────────────────────
  step("9", "10", "Creating outcome contract + 8 KPIs…");
  const outcomePayload = {
    ...OUTCOME,
    attributionRules: { ...OUTCOME.attributionRules, agentId: ids.agentId },
  };
  const outcomeRes = await post("/api/outcomes/with-kpis", {
    outcome: outcomePayload,
    kpis: KPIS,
  });
  ids.outcomeId = outcomeRes.outcome?.id || outcomeRes.id;
  log(`Outcome Contract → ${ids.outcomeId}`);

  // ── STEP 10: LINK EVERYTHING ──────────────────────────────────────────────────
  step("10", "10", "Linking all intelligence to agent…");

  // Link KB to agent
  await post(`/api/agents/${ids.agentId}/knowledge-bases`, {
    knowledgeBaseId: ids.kbId,
    priority: 1,
    retrievalConfig: {
      topK: 10,
      scoreThreshold: 0.70,
      rerankEnabled: true,
      jurisdictionFiltering: true,
      citationMode: "full",
    },
  });
  log("Knowledge base linked to agent");

  // Link outcome + eval to agent
  await patch(`/api/agents/${ids.agentId}`, {
    outcomeId: ids.outcomeId,
    evalBindings: [ids.evalSuiteId],
  });
  log("Outcome contract linked to agent");
  log("Eval suite linked to agent");

  // Update policy scopeId to point to agent
  for (const pId of ids.policyIds) {
    try {
      await patch(`/api/policies/${pId}`, { scopeId: ids.agentId, scopeType: "agent" });
    } catch (e) {
      warn(`Policy scope update (non-fatal): ${e.message.slice(0, 60)}`);
    }
  }
  log("All 6 policies scoped to agent");

  // Scope runbooks to agent
  for (const rId of ids.runbookIds) {
    try {
      await patch(`/api/runbooks/${rId}`, { agentId: ids.agentId });
    } catch (e) {
      warn(`Runbook scope (non-fatal): ${e.message.slice(0, 60)}`);
    }
  }
  log("All 6 runbooks scoped to agent");

  // ── SAVE IDs ──────────────────────────────────────────────────────────────────
  const fs = await import("fs");
  fs.writeFileSync("scripts/lit-agt-002-dev-ids.json", JSON.stringify(ids, null, 2));

  // ── SUMMARY ───────────────────────────────────────────────────────────────────
  console.log("\n════════════════════════════════════════════════════════════════════");
  console.log("  ✅  LIT-AGT-002 CREATION — COMPLETE");
  console.log("════════════════════════════════════════════════════════════════════");
  console.log(`\n  Agent:           ${ids.agentId}`);
  console.log(`  Knowledge Base:  ${ids.kbId} (${ids.kbSourceIds?.length || 0} sources)`);
  console.log(`  Skills (6):      ${ids.skillIds.join("\n                   ")}`);
  console.log(`  Policies (6):    ${ids.policyIds.join("\n                   ")}`);
  console.log(`  Runbooks (6):    ${ids.runbookIds.join("\n                   ")}`);
  console.log(`  Golden Dataset:  ${ids.goldenDatasetId} (6 test cases)`);
  console.log(`  Eval Suite:      ${ids.evalSuiteId}`);
  console.log(`  Outcome:         ${ids.outcomeId}`);
  console.log(`\n  Dev IDs saved → scripts/lit-agt-002-dev-ids.json\n`);
}

main().catch(err => {
  console.error(`\n❌  Creation failed: ${err.message}`);
  process.exit(1);
});
