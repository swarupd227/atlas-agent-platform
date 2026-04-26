#!/usr/bin/env node
/**
 * OTC-AGT-008 — Dispute Resolution Agent
 * Demo 5 — Dispute Resolution Intelligence (NovaTech Industries)
 *
 * Provisions ALL Platform Intelligence components via Platform APIs (no direct DB writes):
 *   1  Skills (6)
 *   2  Knowledge Base
 *   3  KB Sources (5)
 *   4  Runbooks (5)
 *   5  Policies (5)
 *   6  Agent (looked up by name — created at server startup)
 *   7  Link Runbooks + Policies
 *   8  Link KB to Agent
 *   9  Golden Dataset + Test Cases (6)
 *  10  Eval Suite
 *  11  Outcome + KPIs (5)
 *  12  Link Outcome to Agent
 *  13  Ontology Tags
 *
 * Saves IDs to: scripts/otc-dispute-dev-ids.json
 * Usage: node scripts/create-otc-agt-008-dev.mjs
 */

import { writeFileSync } from "fs";

const BASE       = "http://localhost:5000";
const TOTAL      = 13;
const AGENT_CODE = "OTC-AGT-008";
const AGENT_NAME = "Dispute Resolution Agent";

// ── HTTP helpers ───────────────────────────────────────────────────────────────

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
const step = (n, label) => console.log(`\nSTEP ${n}/${TOTAL}  ${label}…`);

// ── STEP 1: SKILLS ─────────────────────────────────────────────────────────────

const SKILLS = [
  {
    name: "Dispute Pattern Detection & Anomaly Analysis",
    description: "Identifies anomalous dispute patterns: statistical outlier detection for dispute frequency and value spikes vs customer historical baseline, timeline clustering to pinpoint root-cause events (contract changes, ERP updates, price list activations), category concentration analysis to isolate systemic vs one-off disputes, and customer tier risk scoring. Handles single-customer and cross-portfolio pattern detection.",
    industry: "manufacturing",
    domain: "dispute_management",
    author: "NovaTech AR & Data Science Team",
    tags: ["dispute_patterns", "anomaly_detection", "root_cause", "statistical_analysis"],
    complexity: "advanced",
    status: "active",
  },
  {
    name: "Contract vs Invoice Rate Reconciliation",
    description: "Reconciles contracted pricing schedules against invoiced amounts at line-item level: extracts unit prices from MSA contract price lists, compares against ERP invoice line items, calculates variance amounts and percentages, classifies variance type (price list error, discount not applied, surcharge misapplied), and generates reconciliation reports with credit requirements per invoice.",
    industry: "manufacturing",
    domain: "dispute_management",
    author: "NovaTech AR & Data Science Team",
    tags: ["contract_reconciliation", "pricing_variance", "invoice_audit", "credit_calculation"],
    complexity: "advanced",
    status: "active",
  },
  {
    name: "Bulk Resolution Orchestration",
    description: "Orchestrates multi-customer bulk dispute resolution: generates credit memo batch for all affected invoices, coordinates ERP price list correction change request, sequences proactive customer outreach before dispute escalation, tracks resolution execution against SLA timelines, and produces resolution summary report with prevention recommendation.",
    industry: "manufacturing",
    domain: "dispute_management",
    author: "NovaTech AR & Data Science Team",
    tags: ["bulk_resolution", "credit_memo", "erp_correction", "customer_outreach"],
    complexity: "advanced",
    status: "active",
  },
  {
    name: "Contract Pricing Schedule Verification",
    description: "Verifies ERP price lists against active customer contract pricing schedules: pulls MSA contract rates by SKU and effective date, compares against active ERP price list, flags discrepancies, identifies affected invoice population, and produces compliance gap report. Covers Category A–D pricing tiers and customer-specific pricing overlays.",
    industry: "manufacturing",
    domain: "contract_compliance",
    author: "NovaTech Contract Management Team",
    tags: ["contract_pricing", "erp_price_list", "compliance_verification", "sku_pricing"],
    complexity: "intermediate",
    status: "active",
  },
  {
    name: "Systemic Exposure Quantification",
    description: "Quantifies enterprise-wide exposure from contract pricing errors: scans all invoices issued after root-cause event date, identifies all customers on affected price lists, calculates per-customer and total overcharge amounts, ages exposure by invoice date, and produces executive exposure summary with customer impact ranking.",
    industry: "manufacturing",
    domain: "contract_compliance",
    author: "NovaTech Contract Management Team",
    tags: ["systemic_exposure", "portfolio_scan", "overcharge_calculation", "risk_quantification"],
    complexity: "advanced",
    status: "active",
  },
  {
    name: "Credit Memo Batch Processing",
    description: "Executes batch credit memo issuance across multiple customers and invoices: validates credit authority for batch total, generates individual credit memos with correct GL account coding, applies credits to customer AR accounts, triggers notification workflow, and produces batch summary with credit IDs and customer impact statements.",
    industry: "manufacturing",
    domain: "accounts_receivable",
    author: "NovaTech Billing & Collections Team",
    tags: ["credit_memo", "batch_processing", "ar_credit", "bulk_posting"],
    complexity: "intermediate",
    status: "active",
  },
];

// ── KB SOURCES ─────────────────────────────────────────────────────────────────

const KB_SOURCES = [
  {
    title: "NovaTech Dispute Resolution Policy — Systemic & Individual Workflows",
    content: `NovaTech's Order-to-Cash dispute resolution policy distinguishes systemic disputes from individual billing errors. Systemic disputes are defined as: (a) 3+ disputes from the same customer sharing an identical root cause within a 90-day window, or (b) 2+ customers exhibiting correlated dispute patterns linked to the same ERP or contract configuration event. Upon systemic classification, individual dispute resolution is halted and a systemic investigation workflow initiated. Resolution authority levels: Auto-credit ≤$5K/invoice without approval; Manager e-approval required for batch $50K–$150K; VP Finance sign-off for batch >$100K. CFO notification required for any systemic issue. All 4 affected customers must be notified within 48 hours of root cause confirmation, regardless of dispute filing status.`,
    tags: ["dispute_policy", "systemic_resolution", "authority_matrix", "escalation"],
  },
  {
    title: "MSA Contract Pricing — NovaTech Category C Industrial Controls Rate Structure",
    content: `NovaTech Master Service Agreements for industrial controls customers (Category C) include customer-specific pricing overlays that supersede the standard ERP price list. Contract MSA-2025-1104 (Apex Industries, effective Feb 12, 2026) introduced price list PL-2025-C-APEX for 5 Category C SKUs (IC-7200, IC-7250, IC-8100, IC-8150, IC-9000), replacing the legacy list PL-2024-C. The contracted rates represent a negotiated 4.7% reduction from the 2024 standard list. Contract MSA-2025-1187 (Meridian Manufacturing, effective Feb 01, 2026), MSA-2025-1201 (Cascade Dynamics, effective Feb 19, 2026), and MSA-2025-1219 (Stonebridge Industries, effective Mar 01, 2026) carry similar Category C pricing reductions. ERP system must activate the customer-specific price list on the contract effective date; failure to do so causes systematic overcharging on all invoices until corrected.`,
    tags: ["msa_contract", "category_c", "price_list", "PL-2025-C-APEX", "overcharge"],
  },
  {
    title: "ERP Price List Management — Activation, Change Control, and Validation Procedures",
    content: `NovaTech's SAP S/4HANA ERP system manages customer-specific price lists through the PL (Price List) module. Price lists are activated per-customer-contract and must be linked to the MSA effective date in the contract master data. Change requests for price list modifications require: (1) formal CR number (CR-YYYY-PL-NNNN), (2) before/after documentation with all affected SKUs and current vs new prices, (3) open order impact assessment (existing orders referencing old price list must be re-priced or amended before activation), (4) Contract Management approval within 4 business hours, (5) 48-hour staging period before production deployment. IT Change Advisory Board review is mandatory for changes affecting more than 5 customers. All ERP price list changes are logged in the SOX audit trail.`,
    tags: ["erp", "price_list", "change_control", "SAP", "SOX"],
  },
  {
    title: "Legal Hold Procedures — Invoice Credits and Payment Adjustments",
    content: `Any invoice subject to an active legal hold (identified by REF-LEGAL-YYYY-NNN reference) is excluded from automated credit processing, write-offs, and payment adjustments. Legal hold status must be checked via the legal hold register before any credit memo is generated for a disputed invoice. Invoices on legal hold are routed to the Legal team for clearance; a written legal clearance document with case reference number is required before posting any credit to the AR sub-ledger. The legal hold does not affect credit processing for other invoices from the same customer or batch — only the specific invoices under hold are excluded. Typical legal clearance SLA: 15 business days from hold initiation.`,
    tags: ["legal_hold", "credit_memo", "compliance", "REF-LEGAL", "exclusion"],
  },
  {
    title: "Customer Notification SLA — Proactive Billing Error Outreach Protocol",
    content: `NovaTech's customer notification policy for billing errors and dispute resolution: Tier 1 customers (annual revenue >$5M) must receive a VP-signed notification within 24 hours of systemic issue confirmation. All affected customers (including those who have not filed disputes) must receive proactive outreach before they discover the error independently. The proactive outreach message must include: (a) acknowledgment of the pricing error, (b) statement of credit amount to be issued, (c) corrective action plan (ERP correction CR reference), (d) prevention measures being implemented. Failure to notify Meridian Manufacturing, Cascade Dynamics, and Stonebridge Industries proactively would represent a material breach of the customer notification SLA and could escalate to dispute filings. Proactive outreach transforms a billing error into a trust-building moment.`,
    tags: ["customer_notification", "proactive_outreach", "SLA", "Tier 1", "trust"],
  },
];

// ── RUNBOOKS ───────────────────────────────────────────────────────────────────

const RUNBOOKS = [
  {
    name: "Systemic Pricing Dispute Investigation — Standard Run",
    description: "Standard workflow for investigating a customer dispute cluster that may indicate a systemic pricing error: retrieve dispute queue, run pattern analysis, classify root cause, cross-reference contract rates, and produce initial findings report.",
    industry: "manufacturing",
    category: "incident_response",
    triggerType: "event",
    autonomyLevel: "autonomous",
    status: "active",
    severity: "high",
    steps: [
      { order: 1, name: "Retrieve dispute queue", tool: "get_customer_dispute_queue" },
      { order: 2, name: "Run pattern analysis", tool: "analyze_dispute_patterns" },
      { order: 3, name: "Classify root cause", tool: "classify_dispute_root_cause" },
      { order: 4, name: "Pull contract pricing schedule", tool: "pull_contract_pricing_schedule" },
      { order: 5, name: "Scan invoices for overcharge", tool: "scan_invoices_for_overcharge" },
    ],
  },
  {
    name: "Bulk Credit Resolution Execution",
    description: "Executes bulk credit memo issuance across all affected customers once root cause is confirmed and systemic exposure is calculated: validate authority, check legal holds, issue credits, correct ERP, notify customers.",
    industry: "manufacturing",
    category: "remediation",
    triggerType: "event",
    autonomyLevel: "confirm_before",
    status: "active",
    severity: "critical",
    steps: [
      { order: 1, name: "Calculate systemic exposure", tool: "calculate_systemic_exposure" },
      { order: 2, name: "Check legal hold status on all disputed invoices", tool: "check_legal_hold_status" },
      { order: 3, name: "Route to approval if batch >$100K", action: "escalation" },
      { order: 4, name: "Generate bulk credit memos", tool: "recommend_bulk_resolution" },
      { order: 5, name: "Submit ERP correction request", tool: "generate_erp_correction_request" },
      { order: 6, name: "Send proactive customer notifications", tool: "send_customer_notifications" },
    ],
  },
  {
    name: "Legal Hold Invoice Escalation",
    description: "Exception workflow for disputed invoices under active legal hold — routes affected invoices to Legal for clearance before credit issuance, while allowing the rest of the batch to proceed.",
    industry: "manufacturing",
    category: "incident_response",
    triggerType: "event",
    autonomyLevel: "confirm_before",
    status: "active",
    severity: "high",
    steps: [
      { order: 1, name: "Identify held invoices from check_legal_hold_status", action: "analysis" },
      { order: 2, name: "Exclude held invoices from bulk credit batch", action: "exclusion" },
      { order: 3, name: "Create Legal clearance request with hold reference", action: "escalate" },
      { order: 4, name: "Notify AR Manager and Legal within 1 hour", action: "notify" },
      { order: 5, name: "Re-run credit batch for remaining eligible invoices", action: "execute" },
    ],
  },
  {
    name: "ERP Price List Correction Validation",
    description: "Validates and executes ERP price list correction after systemic overcharge is confirmed: generates change request, assesses open order impact, submits for approval, and monitors staging deployment.",
    industry: "manufacturing",
    category: "remediation",
    triggerType: "event",
    autonomyLevel: "confirm_before",
    status: "active",
    severity: "high",
    steps: [
      { order: 1, name: "Validate active ERP price list vs contract", tool: "validate_erp_price_list" },
      { order: 2, name: "Generate ERP correction change request CR-2026-PL-0047", tool: "generate_erp_correction_request" },
      { order: 3, name: "Assess open order impact", action: "impact_assessment" },
      { order: 4, name: "Submit CR for Contract Management and IT-CAB approval", action: "submit" },
      { order: 5, name: "Monitor 48-hour staging period; rollback if validation fails", action: "monitor" },
    ],
  },
  {
    name: "Post-Resolution Prevention Control Setup",
    description: "Implements prevention controls after systemic dispute resolution: activates contract pricing validation rule for new contracts, schedules recurring price list audits.",
    industry: "manufacturing",
    category: "remediation",
    triggerType: "event",
    autonomyLevel: "autonomous",
    status: "active",
    severity: "medium",
    steps: [
      { order: 1, name: "Activate contract pricing validation rule for new MSA onboarding", action: "configure" },
      { order: 2, name: "Schedule monthly ERP price list vs contract rate reconciliation", action: "schedule" },
      { order: 3, name: "Configure 1% variance alert for first 10 invoices after new contract", action: "configure" },
      { order: 4, name: "Document lessons-learned in systemic risk playbook", action: "document" },
    ],
  },
];

// ── POLICIES ───────────────────────────────────────────────────────────────────

const POLICIES = [
  {
    name: "Dispute Resolution Authority Matrix",
    description: "Defines automated dispute resolution authority: agents may auto-approve credits ≤$5K per invoice without human review; batch credits $5K–$50K per invoice require manager e-approval; above $50K per invoice requires VP Finance sign-off within 24 hours. Total batch credits >$100K require CFO notification. Systemic issues affecting >3 customers require executive briefing before resolution execution.",
    domain: "dispute_governance",
    status: "active",
    policyJson: {
      enforcement: "hard",
      rules: [
        { id: "P1", name: "Auto-Credit Authority",            description: "Agent may autonomously issue credit memos ≤$5K per invoice and ≤$50K per batch without human approval" },
        { id: "P2", name: "Manager Approval Gate",            description: "Credit batch totalling $50K–$150K requires AR manager e-approval within 4 business hours before execution" },
        { id: "P3", name: "Executive Notification Protocol",  description: "Any systemic billing error affecting ≥3 customers requires VP Finance notification and CFO briefing before bulk credits are issued" },
      ],
    },
  },
  {
    name: "Systemic Dispute Escalation Protocol",
    description: "Governs classification of systemic disputes: when 3+ disputes from the same customer share an identical root cause, or when 2+ customers exhibit correlated dispute patterns, the agent must classify as a systemic issue, halt individual resolution, and initiate systemic investigation workflow.",
    domain: "dispute_governance",
    status: "active",
    policyJson: {
      enforcement: "hard",
      rules: [
        { id: "P1", name: "Systemic Classification Trigger",   description: "3+ same-cause disputes from single customer OR 2+ correlated customers triggers systemic workflow — individual resolution halted" },
        { id: "P2", name: "Proactive Outreach Mandate",        description: "All affected customers must be notified within 48 hours of confirmation, even if no dispute has been filed" },
        { id: "P3", name: "Root Cause Documentation Standard", description: "Systemic resolution requires documented root cause, corrective action plan, and prevention control before credits are issued" },
      ],
    },
  },
  {
    name: "Legal Hold Compliance",
    description: "Prohibits automated credit issuance or payment adjustment for any invoice subject to an active legal hold. Agents must check legal hold status before issuing any credit related to disputed invoices. Legal hold overrides all other dispute resolution authority.",
    domain: "legal_compliance",
    status: "active",
    policyJson: {
      enforcement: "hard",
      rules: [
        { id: "P1", name: "Legal Hold Check Required",       description: "Agent must call check_legal_hold_status before issuing any credit memo for disputed invoices — no exceptions" },
        { id: "P2", name: "Credit Suspension on Legal Hold", description: "Any invoice under legal hold REF-LEGAL-* must be excluded from batch credit processing and routed to Legal for clearance" },
        { id: "P3", name: "Legal Clearance Documentation",   description: "Credit memo for previously held invoice requires written legal clearance with case reference before posting" },
      ],
    },
  },
  {
    name: "ERP Price List Change Control",
    description: "Governs ERP price list updates: all price list changes require a formal change request with before/after documentation, open order impact assessment, approval from Contract Management, and 48-hour staging period.",
    domain: "financial_controls",
    status: "active",
    policyJson: {
      enforcement: "hard",
      rules: [
        { id: "P1", name: "Change Request Mandatory",       description: "No ERP price list may be modified without a formal CR with Contract Management approval — direct ERP edits are prohibited" },
        { id: "P2", name: "Open Order Impact Assessment",   description: "CR must include assessment of all open sales orders referencing the current price list" },
        { id: "P3", name: "Staging Period",                 description: "Approved price list changes enter 48-hour staging for validation before going live" },
      ],
    },
  },
  {
    name: "Customer Notification SLA",
    description: "Sets SLA for customer communications related to billing disputes and corrections: Tier 1 customers receive VP-signed notification within 24 hours; all affected customers receive resolution confirmation within 2 business days; proactive outreach to unaffected customers precedes resolution by at least 1 business day.",
    domain: "customer_experience",
    status: "active",
    policyJson: {
      enforcement: "soft",
      rules: [
        { id: "P1", name: "Tier 1 24-Hour SLA",           description: "Apex Industries (Tier 1, $12M/year) must receive direct notification from AR VP within 24 hours of systemic issue confirmation" },
        { id: "P2", name: "Resolution Confirmation",       description: "All 4 affected customers receive credit memo package and correction confirmation within 2 business days of credit issuance" },
        { id: "P3", name: "Proactive Outreach First",      description: "Meridian, Cascade, and Stonebridge must be notified before they discover the error independently" },
      ],
    },
  },
];

// ── TEST CASES ─────────────────────────────────────────────────────────────────

const TEST_CASES = [
  {
    name: "Standard Systemic Pricing Dispute — Full Resolution",
    inputScenario: "Apex Industries files 12 disputes totalling $380K in 45 days. OTC-AGT-008 detects a 400% spike above baseline, identifies all disputes as Category C pricing discrepancies after Feb 12, 2026, traces root cause to MSA-2025-1104 / PL-2024-C mismatch. OTC-AGT-011 finds 3 more affected customers (Meridian, Cascade, Stonebridge). OTC-AGT-006 issues $165K in bulk credits and submits ERP CR-2026-PL-0047.",
    expectedBehavior: "Agent correctly identifies systemic root cause within S1 screen, confirms 4.7% overcharge on all Category C SKUs, identifies all 4 affected customers and $165.3K total exposure, issues 122 credit memos, submits CR-2026-PL-0047, sends proactive notification to 3 customers who haven't filed disputes, recommends prevention rule. All 3 screens populate with correct data.",
    difficultyTier: "routine",
    scenarioCategory: "happy_path",
    tags: ["systemic", "pricing-error", "MSA", "4-customers", "bulk-credits"],
  },
  {
    name: "Exception: Legal Hold on Invoice CRN-2026-AX-0005",
    inputScenario: "Same dispute pattern as standard scenario. During legal hold check, invoice CRN-2026-AX-0005 returns hold status REF-LEGAL-2026-047. Credit of $24,900 for this invoice must be excluded from the bulk batch and routed to Legal clearance.",
    expectedBehavior: "Agent correctly identifies 1 invoice under legal hold REF-LEGAL-2026-047, excludes it from the bulk credit batch, issues 122 credits totalling $140,400 (not $165,300), creates Legal clearance request, continues with full ERP correction and customer notifications. S2 screen shows 'Held' status for Apex with 11/12 invoices credited. Prevention rule still recommended.",
    difficultyTier: "complex",
    scenarioCategory: "edge_cases",
    tags: ["legal-hold", "REF-LEGAL-2026-047", "exclusion", "partial-batch", "exception"],
  },
  {
    name: "Exception: ERP Validation Failure — 8 Open Orders Block Price Switch",
    inputScenario: "Standard dispute resolution proceeds correctly up to ERP correction step. When CR-2026-PL-0047 is submitted, ERP system rejects the price list switch because 8 open orders currently reference PL-2024-C. Rollback procedure initiated. Price list correction must wait for manual re-pricing.",
    expectedBehavior: "Agent correctly reports ERP validation failure, identifies 8 blocking open orders, triggers manual resolution workflow (3 business days), posts all 122 credits successfully (ERP failure does not block credit issuance), flags open order re-pricing requirement in S2 and S3 screens. S3 shows ERP workflow with blocked step 1.",
    difficultyTier: "complex",
    scenarioCategory: "adversarial",
    tags: ["ERP-validation-fail", "open-orders", "manual-resolution", "exception", "CR-blocked"],
  },
  {
    name: "Root Cause Confirmation — Contract Rate vs ERP Rate",
    inputScenario: "OTC-AGT-011 pulls pricing schedule for MSA-2025-1104. It must confirm that PL-2025-C-APEX contracted rate for IC-7200 is $112.75 while the active ERP list PL-2024-C charges $118.05 — a 4.70% variance. Same pattern must be verified across all 5 Category C SKUs.",
    expectedBehavior: "Contract vs Invoice rate reconciliation confirms 4.70% variance on all 5 SKUs (IC-7200, IC-7250, IC-8100, IC-8150, IC-9000). Root cause verdict: PL-2024-C active instead of PL-2025-C-APEX. Overcharge confirmed across all 34 Apex invoices since Feb 12, 2026. Same conclusion reached for Meridian (31 invoices), Cascade (26), Stonebridge (32).",
    difficultyTier: "routine",
    scenarioCategory: "happy_path",
    tags: ["root-cause", "contract-verification", "SKU-pricing", "rate-comparison"],
  },
  {
    name: "Proactive Outreach — Clean Customer Portfolio",
    inputScenario: "After identifying Meridian Manufacturing, Cascade Dynamics, and Stonebridge Industries as overcharged but without filed disputes, OTC-AGT-006 must send proactive notifications before the credit memos are issued.",
    expectedBehavior: "Agent sends proactive notifications to all 3 non-disputing customers within the 48-hour SLA window. Notifications include overcharge acknowledgment, credit amounts ($54K, $38K, $35K respectively), ERP CR reference, and prevention measure. Notifications sent before credit memo posting to match trust-building protocol. S3 screen shows 'Proactive' badge for all 3 customers.",
    difficultyTier: "routine",
    scenarioCategory: "happy_path",
    tags: ["proactive-outreach", "notifications", "SLA", "trust", "Meridian", "Cascade", "Stonebridge"],
  },
  {
    name: "Dispute Pattern Anomaly Detection — Baseline Comparison",
    inputScenario: "Apex Industries historical baseline: 3 disputes/month, avg $15K/dispute. March 2026 actuals: 12 disputes in 45 days, avg $31.7K/dispute. OTC-AGT-008 must correctly compute the anomaly score and classify as systemic.",
    expectedBehavior: "Agent computes 400% spike in dispute frequency (12 vs 3/month baseline), 110% spike in average dispute value ($31.7K vs $15K), 100% category concentration (all Category C), 100% timeline concentration (all post-Feb 12, 2026). Anomaly severity score: CRITICAL. Systemic classification triggered. Pattern evidence displayed in S1 screen dispute pattern chart.",
    difficultyTier: "routine",
    scenarioCategory: "happy_path",
    tags: ["anomaly-detection", "baseline", "statistical-analysis", "pattern", "S1-screen"],
  },
];

// ── MAIN ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n" + "═".repeat(64));
  console.log(`  ${AGENT_CODE} — ${AGENT_NAME}`);
  console.log("  Demo 5 — Dispute Resolution Intelligence");
  console.log(`  Client: NovaTech Industries`);
  console.log(`  Target: ${BASE}`);
  console.log("  Mode: Platform API Provisioning (no direct DB writes)");
  console.log("═".repeat(64) + "\n");

  const ids = { agentCode: AGENT_CODE, agentName: AGENT_NAME };

  // ── STEP 1: SKILLS ─────────────────────────────────────────────────────────
  step(1, `Creating ${SKILLS.length} skills`);
  ids.skillIds = [];
  for (const skill of SKILLS) {
    const s = await post("/api/skills", skill);
    ids.skillIds.push(s.id);
    log(`Skill → ${skill.name} [${s.id}]`);
  }

  // ── STEP 2: KNOWLEDGE BASE ─────────────────────────────────────────────────
  step(2, "Creating knowledge base");
  const kb = await post("/api/knowledge-bases", {
    name: "Dispute Resolution Policy & Procedures",
    description: "Knowledge base for OTC-AGT-008 Dispute Resolution Agent. Contains NovaTech dispute resolution policies, MSA contract pricing structures, ERP change control procedures, legal hold protocols, and customer notification SLA requirements.",
    retrievalConfig: { topK: 10, scoreThreshold: 0.65, rerankEnabled: true, citationMode: "full" },
  });
  ids.kbId = kb.id;
  log(`Knowledge Base → ${kb.id}`);

  // ── STEP 3: KB SOURCES ─────────────────────────────────────────────────────
  step(3, `Adding ${KB_SOURCES.length} knowledge base sources`);
  ids.kbSourceIds = [];
  for (const src of KB_SOURCES) {
    try {
      const s = await post(`/api/knowledge-bases/${ids.kbId}/sources/text`, src);
      ids.kbSourceIds.push(s.id);
      log(`KB Source → ${src.title}`);
    } catch (e) {
      warn(`KB Source (non-fatal): ${src.title} — ${e.message.slice(0, 80)}`);
    }
  }

  // ── STEP 4: RUNBOOKS ───────────────────────────────────────────────────────
  step(4, `Creating ${RUNBOOKS.length} runbooks`);
  ids.runbookIds = [];
  for (const rb of RUNBOOKS) {
    const r = await post("/api/runbooks", { ...rb, agentId: null });
    ids.runbookIds.push(r.id);
    log(`Runbook → ${rb.name} [${r.id}]`);
  }

  // ── STEP 5: POLICIES ──────────────────────────────────────────────────────
  step(5, `Creating ${POLICIES.length} governance policies`);
  ids.policyIds = [];
  for (const pol of POLICIES) {
    const p = await post("/api/policies", pol);
    ids.policyIds.push(p.id);
    log(`Policy → ${pol.name} [${p.id}]`);
  }

  // ── STEP 6: AGENT (looked up by name — created at server startup) ──────────
  step(6, `Looking up ${AGENT_NAME} created at server startup`);
  const agentList = await get("/api/agents");
  const agents    = Array.isArray(agentList) ? agentList : (agentList.agents || []);
  const agent     = agents.find(a => a.name === AGENT_NAME);

  if (!agent) {
    throw new Error(`Agent '${AGENT_NAME}' not found — ensure server started successfully and otcDisputeLiveRunHandler has been called at least once to trigger lazy initialization`);
  }
  ids.agentId = agent.id;
  log(`Agent: ${AGENT_NAME} → ${agent.id}`);

  // ── STEP 7: LINK RUNBOOKS & POLICIES ─────────────────────────────────────
  step(7, "Linking runbooks and policies to agent");
  for (const rId of ids.runbookIds) {
    try {
      await patch(`/api/runbooks/${rId}`, { agentId: ids.agentId });
    } catch (e) {
      warn(`Runbook link (non-fatal): ${e.message.slice(0, 60)}`);
    }
  }
  log(`${ids.runbookIds.length} runbooks linked`);

  for (const pId of ids.policyIds) {
    try {
      await patch(`/api/policies/${pId}`, { scopeId: ids.agentId, scopeType: "agent" });
    } catch (e) {
      warn(`Policy link (non-fatal): ${e.message.slice(0, 60)}`);
    }
  }
  log(`${ids.policyIds.length} policies scoped`);

  // ── STEP 8: LINK KB TO AGENT ───────────────────────────────────────────────
  step(8, "Linking knowledge base to agent");
  try {
    await post(`/api/agents/${ids.agentId}/knowledge-bases`, {
      knowledgeBaseId: ids.kbId,
      priority: 1,
      retrievalConfig: { topK: 10, scoreThreshold: 0.65, rerankEnabled: true, citationMode: "full" },
    });
    log("Knowledge base linked (topK=10, rerank=true)");
  } catch (e) {
    warn(`KB link (non-fatal): ${e.message.slice(0, 80)}`);
  }

  // ── STEP 9: GOLDEN DATASET + TEST CASES ──────────────────────────────────
  step(9, `Creating golden dataset + ${TEST_CASES.length} test cases`);
  const ds = await post("/api/golden-datasets", {
    name: "OTC-AGT-008 Dispute Resolution Test Suite",
    description: "Golden dataset for OTC-AGT-008. Covers happy path (systemic pricing dispute full resolution), legal hold exception, ERP validation failure exception, root cause confirmation, proactive outreach, and anomaly detection accuracy.",
    industry: "manufacturing",
    useCase: "dispute_resolution",
    tags: ["dispute-resolution", "systemic-pricing", "NovaTech", "OTC-Demo-5", "bulk-credits"],
    status: "active",
  });
  ids.goldenDatasetId = ds.id;
  log(`Golden Dataset → ${ds.id}`);

  ids.testCaseIds = [];
  for (const tc of TEST_CASES) {
    try {
      const t = await post(`/api/golden-datasets/${ids.goldenDatasetId}/test-cases`, {
        ...tc,
        datasetId: ids.goldenDatasetId,
      });
      ids.testCaseIds.push(t.id);
      log(`Test Case → ${tc.name}`);
    } catch (e) {
      warn(`Test Case (non-fatal): ${tc.name} — ${e.message.slice(0, 80)}`);
    }
  }

  // ── STEP 10: EVAL SUITE ───────────────────────────────────────────────────
  step(10, "Creating eval suite");
  const evalSuite = await post("/api/evals", {
    name: "OTC Dispute Resolution Regression Suite",
    agentId: ids.agentId,
    goldenDatasetId: ids.goldenDatasetId,
    type: "regression",
    industry: "manufacturing",
    thresholdConfig: {
      rootCauseAccuracy:    0.99,
      exposureQuantification: 0.98,
      creditIssuanceAccuracy: 1.00,
      legalHoldCompliance:    1.00,
    },
    schedule: "weekly",
  });
  ids.evalSuiteId = evalSuite.id;
  log(`Eval Suite → ${evalSuite.id}`);

  // ── STEP 11: OUTCOME + KPIs ───────────────────────────────────────────────
  step(11, "Creating outcome contract + KPIs");
  const outcome = await post("/api/outcomes/with-kpis", {
    outcome: {
      name: "OTC-AGT-008 Dispute Resolution Outcome",
      description: "Outcome contract for OTC-AGT-008. Measures the agent's effectiveness at detecting systemic pricing disputes, quantifying exposure, and orchestrating bulk resolution across all affected customers within SLA.",
      agentId: ids.agentId,
      attributionRules: {
        agentId: ids.agentId,
        attributionModel: "direct",
        measurementWindow: "monthly",
      },
    },
    kpis: [
      {
        name: "Systemic Detection Rate",
        description: "Percentage of systemic pricing disputes correctly identified as systemic vs one-off (avoiding individual resolution of what is actually a portfolio-wide issue). Target: 100%",
        metric: "systemic_detection_rate",
        target: 100,
        unit: "percent",
        direction: "maximize",
      },
      {
        name: "Root Cause Identification Accuracy",
        description: "Percentage of dispute investigations where the root cause is correctly identified and confirmed (pricing error, contract mismatch, ERP activation failure). Target: >99%",
        metric: "root_cause_accuracy",
        target: 99,
        unit: "percent",
        direction: "maximize",
      },
      {
        name: "Portfolio Exposure Quantification",
        description: "Accuracy of total systemic exposure calculation vs actual overcharge (within 2% variance). Measures whether the agent correctly identifies all affected customers and invoices. Target: >98%",
        metric: "exposure_quantification_accuracy",
        target: 98,
        unit: "percent",
        direction: "maximize",
      },
      {
        name: "Resolution Time — Systemic to Credits Issued",
        description: "Time from systemic classification to all eligible credit memos issued, in hours. Includes approval routing for batches >$100K. Target: <4 hours",
        metric: "resolution_time_hours",
        target: 4,
        unit: "hours",
        direction: "minimize",
      },
      {
        name: "Proactive Customer Notification Rate",
        description: "Percentage of affected customers without active disputes who receive proactive outreach before independently discovering the billing error. Target: 100%",
        metric: "proactive_notification_rate",
        target: 100,
        unit: "percent",
        direction: "maximize",
      },
    ],
  });
  ids.outcomeId = outcome.outcome?.id || outcome.id;
  log(`Outcome Contract → ${ids.outcomeId} (5 KPIs)`);

  // ── STEP 12: LINK OUTCOME TO AGENT ────────────────────────────────────────
  step(12, "Linking outcome and eval to agent");
  try {
    await patch(`/api/agents/${ids.agentId}`, { outcomeId: ids.outcomeId });
    log("Outcome linked to agent");
  } catch (e) {
    warn(`Outcome link (non-fatal): ${e.message.slice(0, 60)}`);
  }

  // ── STEP 13: ONTOLOGY TAGS ────────────────────────────────────────────────
  step(13, "Setting ontology tags");
  try {
    const allConcepts = await get("/api/ontology-concepts/all");
    const keywords = ["dispute", "credit", "invoice", "contract", "pricing", "billing", "customer", "resolution"];
    const tags = [];
    const used = new Set();

    for (const c of allConcepts) {
      if (tags.length >= 8) break;
      if (used.has(c.id)) continue;
      const searchStr = `${c.name || ""} ${c.label || ""} ${c.description || ""}`.toLowerCase();
      if (keywords.some(kw => searchStr.includes(kw))) {
        tags.push({ conceptId: c.id, label: c.label || c.name, category: c.category });
        used.add(c.id);
      }
    }

    if (tags.length < 5) {
      for (const c of allConcepts) {
        if (tags.length >= 6) break;
        if (used.has(c.id)) continue;
        tags.push({ conceptId: c.id, label: c.label || c.name, category: c.category });
        used.add(c.id);
      }
    }

    if (tags.length > 0) {
      await patch(`/api/agents/${ids.agentId}`, { ontologyTags: tags });
      log(`Ontology tags (${tags.length}): ${tags.map(t => t.label).join(", ")}`);
    } else {
      warn("No ontology concepts found — skipping");
    }
  } catch (e) {
    warn(`Ontology tags (non-fatal): ${e.message.slice(0, 100)}`);
  }

  // ── SAVE IDS ──────────────────────────────────────────────────────────────
  const output = {
    createdAt:   new Date().toISOString(),
    environment: "dev",
    agentCode:   AGENT_CODE,
    agentName:   AGENT_NAME,
    ...ids,
  };

  writeFileSync("scripts/otc-dispute-dev-ids.json", JSON.stringify(output, null, 2));

  console.log("\n" + "═".repeat(64));
  console.log(`  ✅  ${AGENT_CODE} PROVISIONING COMPLETE`);
  console.log("═".repeat(64));
  console.log(`\n  Agent ID:       ${ids.agentId}`);
  console.log(`  KB ID:          ${ids.kbId}  (${ids.kbSourceIds?.length || 0} sources)`);
  console.log(`  Skills:         ${ids.skillIds?.length || 0} created`);
  console.log(`  Runbooks:       ${ids.runbookIds?.length || 0} created`);
  console.log(`  Policies:       ${ids.policyIds?.length || 0} created`);
  console.log(`  Dataset:        ${ids.goldenDatasetId}  (${ids.testCaseIds?.length || 0} test cases)`);
  console.log(`  Eval Suite:     ${ids.evalSuiteId}`);
  console.log(`  Outcome:        ${ids.outcomeId}`);
  console.log(`\n  Dev IDs saved → scripts/otc-dispute-dev-ids.json`);
  console.log("\n  Prerequisites:");
  console.log("    • Trigger lazy init by loading /demo/otc-dispute and clicking Run Demo once");
  console.log("    • This ensures OTC-AGT-008, OTC-AGT-011, OTC-AGT-006 are in the DB");
  console.log("\n  Next steps:");
  console.log("    1. Test: http://localhost:5000/demo/otc-dispute → all 3 scenarios");
  console.log("    2. Verify agent at /agents/" + ids.agentId);
  console.log("    3. Migrate to prod: node scripts/migrate-otc-dispute-to-prod.mjs\n");
}

main().catch(err => {
  console.error(`\n❌  Provisioning failed: ${err.message}`);
  process.exit(1);
});
