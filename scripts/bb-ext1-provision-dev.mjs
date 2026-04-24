#!/usr/bin/env node
/**
 * BB-AGT-005 — Odometer Fraud Detection Agent
 * Extension 1 — Black Book Valuation Intelligence
 *
 * Provisions ALL Platform Intelligence components via Platform APIs (no direct DB writes):
 *   1  Skills (6)
 *   2  Knowledge Base
 *   3  KB Sources (6)
 *   4  Runbooks (6)
 *   5  Policies (5)
 *   6  Agent (via POST /api/agents)
 *   7  Link Runbooks + Policies
 *   8  Link KB to Agent
 *   9  Golden Dataset + Test Cases (6)
 *  10  Eval Suite
 *  11  Outcome + KPIs (5)
 *  12  Link Outcome + Eval to Agent
 *  13  Ontology Tags
 *
 * Saves IDs to: scripts/bb-ext1-dev-ids.json
 * Usage: node scripts/bb-ext1-provision-dev.mjs
 */

import { writeFileSync } from "fs";

const BASE = "http://localhost:5000";
const TOTAL = 13;
const AGENT_CODE = "BB-AGT-005";
const AGENT_NAME = "Odometer Fraud Detection Agent";

// ── HTTP helpers ──────────────────────────────────────────────────────────────

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

// ── STEP 1: SKILLS ────────────────────────────────────────────────────────────
// Schema: name, description, industry, domain, author required; tags, complexity, status optional

const SKILLS = [
  {
    name: "Odometer Rollback Detection",
    description: "Detects physically impossible mileage decreases between consecutive auction appearances of the same VIN. Uses statistical analysis of auction history to identify rollback patterns with >99% precision.",
    industry: "automotive",
    domain: "fraud_detection",
    author: "Black Book Data Science Team",
    tags: ["odometer", "rollback", "fraud", "mileage", "auction"],
    complexity: "advanced",
    status: "active",
  },
  {
    name: "VIN Auction History Reconstruction",
    description: "Reconstructs the complete auction history for a VIN across all sources (Manheim, Adesa, Independent, Dealer-Direct). Builds a chronological mileage timeline for cross-reference analysis.",
    industry: "automotive",
    domain: "data_enrichment",
    author: "Black Book Data Science Team",
    tags: ["VIN", "auction", "history", "mileage", "timeline"],
    complexity: "intermediate",
    status: "active",
  },
  {
    name: "CARFAX Service Record Cross-Reference",
    description: "Cross-references auction-declared mileage against CARFAX and dealer service records. Distinguishes confirmed rollbacks from indeterminate service record conflicts requiring manual escalation.",
    industry: "automotive",
    domain: "data_handling",
    author: "Black Book Data Science Team",
    tags: ["CARFAX", "service-records", "cross-reference", "verification"],
    complexity: "intermediate",
    status: "active",
  },
  {
    name: "Rollback Severity Classification",
    description: "Classifies detected rollbacks by severity tier: LOW (<1,000 miles), MEDIUM (1,000–3,000 miles), HIGH (3,000–5,000 miles), CRITICAL (>5,000 miles). Drives dealer alert and escalation workflows.",
    industry: "automotive",
    domain: "data_handling",
    author: "Black Book Data Science Team",
    tags: ["severity", "classification", "rollback", "escalation"],
    complexity: "basic",
    status: "active",
  },
  {
    name: "Odometer Fraud Financial Impact Calculation",
    description: "Calculates the per-VIN valuation overstatement caused by odometer rollback using the Black Book per-mile correction rate ($3.00/mile). Aggregates total financial risk across the daily batch.",
    industry: "automotive",
    domain: "data_handling",
    author: "Black Book Data Science Team",
    tags: ["financial-impact", "valuation", "overstatement", "per-mile"],
    complexity: "intermediate",
    status: "active",
  },
  {
    name: "Dealer Network Alert Generation",
    description: "Generates structured dealer network alerts for confirmed rollback cases at HIGH and CRITICAL severity. Includes VIN details, rollback evidence, and recommended enforcement actions for the NAAA dealer network.",
    industry: "automotive",
    domain: "data_handling",
    author: "Black Book Data Science Team",
    tags: ["dealer-alert", "NAAA", "enforcement", "compliance"],
    complexity: "intermediate",
    status: "active",
  },
];

// ── KB SOURCES ────────────────────────────────────────────────────────────────

const KB_SOURCES = [
  {
    title: "Odometer Fraud Legal Framework and NHTSA Regulations",
    content: `Odometer fraud is a federal crime under the Motor Vehicle Information and Cost Savings Act (49 U.S.C. § 32701 et seq.). The National Highway Traffic Safety Administration (NHTSA) requires all vehicle transfers to include a written odometer disclosure statement. Penalties include up to $10,000 per violation and criminal prosecution. The FBI estimates odometer fraud costs American consumers over $1 billion annually, affecting approximately 450,000 vehicles each year. Black Book's role as a valuation authority creates a legal and reputational obligation to detect and report rollback fraud when it enters auction data streams.`,
    tags: ["legal", "compliance", "odometer", "NHTSA", "federal-law"],
  },
  {
    title: "Odometer Rollback Detection Methodology — Auction Cross-Reference",
    content: `The primary detection method for odometer rollback fraud is cross-referencing declared mileage across all auction appearances of a VIN. A rollback is definitively indicated when a vehicle's declared odometer reading at auction T2 is lower than its reading at auction T1, where T2 > T1. Under normal operation, vehicles accumulate approximately 12,000–15,000 miles per year. Any decrease is physically impossible without deliberate odometer tampering. Statistical confidence thresholds: single-appearance rollbacks require CARFAX confirmation (confidence 0.88+); multi-appearance rollbacks with decreasing trend have confidence 0.96+; service-record-confirmed rollbacks have confidence 0.99.`,
    tags: ["methodology", "detection", "cross-reference", "auction", "mileage"],
  },
  {
    title: "Black Book Per-Mile Valuation Correction Protocol",
    content: `Black Book applies a per-mile correction rate of $3.00 per mile for valuation adjustments related to mileage discrepancies. For odometer rollback cases, the overstatement is calculated as: Overstatement = (AuctionMiles_recorded - TrueMiles) × $3.00. The true mileage is determined from the highest reliable odometer reading in the vehicle's history (typically the most recent CARFAX service record or prior auction record). Vehicles with confirmed rollbacks are quarantined from the pricing model until the true mileage is documented and the valuation is corrected.`,
    tags: ["valuation", "correction", "per-mile", "protocol", "financial-impact"],
  },
  {
    title: "CARFAX Integration for Odometer Verification",
    content: `Black Book maintains a licensed data feed from CARFAX for service record cross-reference. The CARFAX feed includes mileage recorded at every dealer service visit, state inspection, and reported accident. CARFAX data is considered authoritative for dealer-entered mileage but is not infallible — dealer entry errors account for approximately 3% of CARFAX mileage discrepancies. When CARFAX mileage conflicts with auction-declared mileage without a clear rollback direction, the case is classified as SERVICE_CONFLICT and escalated for manual review.`,
    tags: ["CARFAX", "service-records", "integration", "verification", "latency"],
  },
  {
    title: "Odometer Fraud Ring Patterns and Multi-VIN Indicators",
    content: `Organized odometer fraud often involves multiple VINs processed through the same dealer network. Pattern indicators include: (1) multiple VINs from the same dealer with rollbacks detected in the same week; (2) VINs appearing at the same auction sequence with consistent rollback amounts; (3) geographically clustered fraud where rollbacks concentrate in specific auction regions. When 3+ VINs from the same dealer show rollbacks in a 30-day window, escalate as potential organized fraud ring to Black Book Fraud Investigations with a 4-hour SLA.`,
    tags: ["fraud-ring", "patterns", "multi-VIN", "organized-fraud", "escalation"],
  },
  {
    title: "Dealer Alert and Enforcement Action Protocol",
    content: `Upon confirmed odometer rollback detection, BB-AGT-005 initiates the following dealer alert workflow: (1) HIGH severity: Dealer receives automated warning via NAAA network. 24-hour SLA for dealer response. Vehicle held from pricing model. (2) CRITICAL severity: Immediate NAAA alert + Black Book Fraud Investigations escalation. 4-hour SLA. Title history pull requested. Three-strike policy: dealers with 3+ confirmed rollbacks in 90 days are permanently blacklisted from Black Book-sourced auction data.`,
    tags: ["dealer-alert", "enforcement", "NAAA", "escalation", "blacklist"],
  },
];

// ── RUNBOOKS ──────────────────────────────────────────────────────────────────
// Schema: name, description, industry, category, triggerType, steps, autonomyLevel, status, severity

const RUNBOOKS = [
  {
    name: "Daily Odometer Fraud Scan — Standard Run",
    description: "Standard daily execution of the odometer fraud detection pipeline. Scans all auction transactions for the day, runs rollback detection, cross-references service records, calculates financial impact, and generates the daily fraud report. Trigger: automated daily at 06:00 ET after BB-AGT-001 completes.",
    industry: "automotive",
    category: "incident_response",
    triggerType: "scheduled",
    autonomyLevel: "autonomous",
    status: "active",
    severity: "medium",
    steps: [
      { order: 1, name: "Scan auction batch for rollbacks", tool: "scan_auction_batch_for_rollbacks" },
      { order: 2, name: "Fetch VIN mileage history for each flagged VIN", tool: "fetch_vin_mileage_history" },
      { order: 3, name: "Cross-reference service records", tool: "cross_reference_service_records" },
      { order: 4, name: "Calculate financial impact", tool: "calculate_rollback_financial_impact" },
      { order: 5, name: "Generate fraud report", tool: "generate_odometer_fraud_report" },
    ],
  },
  {
    name: "Critical Rollback Emergency Response",
    description: "Emergency response protocol for VINs with CRITICAL severity rollbacks (>5,000 miles). Triggers immediate escalation to Fraud Investigations, title history pull, and dealer compliance review. SLA: 4 hours from detection to dealer alert.",
    industry: "automotive",
    category: "incident_response",
    triggerType: "event",
    autonomyLevel: "confirm_before",
    status: "active",
    severity: "critical",
    steps: [
      { order: 1, name: "Quarantine VIN from pricing model", action: "automatic" },
      { order: 2, name: "Generate CRITICAL dealer alert via NAAA", tool: "generate_odometer_fraud_report" },
      { order: 3, name: "Create Fraud Investigations ticket", action: "escalate" },
      { order: 4, name: "Request title history pull", action: "external" },
    ],
  },
  {
    name: "Service Record Conflict Escalation",
    description: "Protocol for handling SERVICE_CONFLICT cases where CARFAX and auction mileage cannot be reconciled algorithmically. Routes to manual analyst review with full evidence package. SLA: 8 hours.",
    industry: "automotive",
    category: "incident_response",
    triggerType: "event",
    autonomyLevel: "confirm_before",
    status: "active",
    severity: "high",
    steps: [
      { order: 1, name: "Create manual review ticket", action: "create_ticket" },
      { order: 2, name: "Assemble evidence package", action: "gather_evidence" },
      { order: 3, name: "Hold vehicle from pricing model", action: "quarantine" },
      { order: 4, name: "Request DMV title history", action: "external" },
    ],
  },
  {
    name: "Fraud Ring Detection and Multi-VIN Escalation",
    description: "Activated when 3+ VINs from the same dealer or region show rollbacks within a 30-day window. Escalates to organized fraud ring investigation protocol including FBI referral if ring size exceeds 10 VINs.",
    industry: "automotive",
    category: "incident_response",
    triggerType: "event",
    autonomyLevel: "confirm_before",
    status: "active",
    severity: "critical",
    steps: [
      { order: 1, name: "Pull all dealer VINs for 90-day window", action: "data_pull" },
      { order: 2, name: "Run rollback analysis on full dealer VIN set", tool: "scan_auction_batch_for_rollbacks" },
      { order: 3, name: "Compute ring confidence score", action: "analysis" },
      { order: 4, name: "Escalate per ring size matrix", action: "escalate" },
    ],
  },
  {
    name: "Pricing Model Quarantine and Correction",
    description: "Manages the quarantine of fraudulent VINs from the Black Book pricing model and the subsequent correction once true mileage is documented. All actions logged in audit trail for NHTSA compliance.",
    industry: "automotive",
    category: "remediation",
    triggerType: "event",
    autonomyLevel: "autonomous",
    status: "active",
    severity: "medium",
    steps: [
      { order: 1, name: "Flag transaction as QUARANTINED_ODOMETER_FRAUD", action: "flag" },
      { order: 2, name: "Exclude from pricing model", action: "quarantine" },
      { order: 3, name: "Apply confidence weight 0", action: "update_weight" },
      { order: 4, name: "Notify pricing model team", action: "notify" },
    ],
  },
  {
    name: "Weekly Odometer Fraud Summary Report",
    description: "Aggregates all daily odometer fraud findings into the weekly summary report for the Black Book Data Quality team and executive stakeholders. Generated every Friday at 16:00 ET.",
    industry: "automotive",
    category: "reporting",
    triggerType: "scheduled",
    autonomyLevel: "autonomous",
    status: "active",
    severity: "low",
    steps: [
      { order: 1, name: "Aggregate daily fraud reports", action: "aggregate" },
      { order: 2, name: "Generate severity breakdown", action: "analyze" },
      { order: 3, name: "Compute financial totals", action: "calculate" },
      { order: 4, name: "Assemble and distribute report", action: "distribute" },
    ],
  },
];

// ── POLICIES ──────────────────────────────────────────────────────────────────
// Schema: name, domain, description, policyJson (domain defaults to "data_handling")

const POLICIES = [
  {
    name: "Odometer Fraud Zero-Tolerance Quarantine",
    description: "Confirmed odometer rollbacks must be immediately quarantined from the Black Book pricing model with no exception. No human override permitted for CRITICAL severity cases.",
    domain: "data_handling",
    status: "active",
    policyJson: {
      type: "enforcement",
      rules: [
        { id: "P1", condition: "rollback_confirmed", action: "immediate_quarantine", mandatory: true },
        { id: "P2", condition: "severity_critical", action: "block_human_override", mandatory: true },
        { id: "P3", condition: "service_conflict", action: "hold_pending_review", mandatory: true },
      ],
      enforcement: "strict",
    },
  },
  {
    name: "CARFAX Cross-Reference Mandatory",
    description: "All flagged VINs must have CARFAX cross-reference completed before confidence score is finalized. Algorithmically-detected rollbacks without CARFAX confirmation are limited to 0.88 maximum confidence.",
    domain: "data_handling",
    status: "active",
    policyJson: {
      type: "quality",
      rules: [
        { id: "P1", condition: "rollback_flagged", action: "require_carfax_check", mandatory: true },
        { id: "P2", condition: "no_carfax_data", action: "cap_confidence_at_0.88", mandatory: true },
      ],
      enforcement: "strict",
    },
  },
  {
    name: "Dealer Alert SLA Compliance",
    description: "Dealer alerts must be generated and sent within defined SLA windows based on rollback severity. HIGH severity: 24-hour SLA. CRITICAL severity: 4-hour SLA. Violation triggers automatic compliance escalation.",
    domain: "data_handling",
    status: "active",
    policyJson: {
      type: "sla",
      rules: [
        { id: "P1", condition: "severity_high",     action: "alert_within_24h",     mandatory: true },
        { id: "P2", condition: "severity_critical",  action: "alert_within_4h",      mandatory: true },
        { id: "P3", condition: "sla_breach",         action: "escalate_compliance",  mandatory: true },
      ],
      enforcement: "strict",
    },
  },
  {
    name: "Financial Impact Documentation Required",
    description: "All confirmed rollback cases must have financial impact calculated and documented before the daily fraud report is generated. Reports cannot be issued with missing financial data.",
    domain: "data_handling",
    status: "active",
    policyJson: {
      type: "documentation",
      rules: [
        { id: "P1", condition: "rollback_confirmed",    action: "require_financial_calculation", mandatory: true },
        { id: "P2", condition: "missing_financial_data", action: "block_report_generation",       mandatory: true },
      ],
      enforcement: "strict",
    },
  },
  {
    name: "Privacy and Data Minimization — Odometer Verification",
    description: "VIN and dealer data used for odometer fraud detection must not be retained beyond the 90-day fraud investigation window. Service record data from CARFAX is licensed for verification only, not retention.",
    domain: "privacy",
    status: "active",
    policyJson: {
      type: "privacy",
      rules: [
        { id: "P1", condition: "case_closed_no_fraud", action: "delete_after_90d",      mandatory: true },
        { id: "P2", condition: "carfax_data_usage",    action: "verification_only",     mandatory: true },
        { id: "P3", condition: "dealer_name_in_report", action: "anonymize_for_external", mandatory: true },
      ],
      enforcement: "strict",
    },
  },
];

// ── TEST CASES ────────────────────────────────────────────────────────────────
// Schema: name, inputScenario, expectedBehavior, difficultyTier, scenarioCategory, tags

const TEST_CASES = [
  {
    name: "Standard Rollback Detection — 3 VINs",
    inputScenario: "Agent scans daily batch of 142,183 auction transactions. Three VINs (1HGCV1F34PA028451, WBAJB9C55JB083501, 3TMCZ5AN1NM489012) have declared mileage lower than their prior auction appearances. Standard detection scenario with no ring indicators.",
    expectedBehavior: "Agent correctly identifies 3 rollback VINs, assigns severity tiers (MEDIUM/HIGH/CRITICAL), calculates financial impact of $29,118 combined overstatement, generates dealer alerts for HIGH/CRITICAL cases, and produces daily fraud report with all required sections.",
    difficultyTier: "routine",
    scenarioCategory: "happy_path",
    tags: ["standard", "rollback", "detection", "3-vins"],
  },
  {
    name: "CRITICAL Rollback — 4,790 Mile Reversal",
    inputScenario: "VIN 3TMCZ5AN1NM489012 (2022 Toyota Tacoma) appears at auction with 62,340 miles, 23 days after appearing at 67,130 miles. Represents a 4,790-mile odometer rollback in under a month. Dealer: Manheim Phoenix.",
    expectedBehavior: "Agent classifies as CRITICAL severity (>3,000 miles in <30 days), triggers 4-hour dealer escalation SLA, calculates $14,370 financial impact (4,790 × $3.00), quarantines VIN from pricing model immediately, and initiates NAAA alert.",
    difficultyTier: "complex",
    scenarioCategory: "adversarial",
    tags: ["CRITICAL", "rollback", "escalation", "Tacoma", "exception"],
  },
  {
    name: "Service Record Conflict — CARFAX vs Auction",
    inputScenario: "2022 BMW X5 (VIN 5UXCR6C09N9J12843) — CARFAX service record shows 71,400 miles on April 8. Auction declaration shows 65,200 miles on April 16 (8 days later). The direction of fraud cannot be determined algorithmically.",
    expectedBehavior: "Agent classifies as INDETERMINATE/SERVICE_CONFLICT, escalates to manual analyst review with 8-hour SLA, holds vehicle from pricing model, documents $18,600 financial exposure estimate in risk reserve, does NOT issue dealer alert (undetermined fraud).",
    difficultyTier: "complex",
    scenarioCategory: "edge_cases",
    tags: ["service-conflict", "CARFAX", "BMW", "escalation", "exception"],
  },
  {
    name: "Clean VIN — True Negative",
    inputScenario: "VIN CLEAN001 (2020 Honda Accord) has 4 auction appearances with monotonically increasing mileage: 22,000 → 25,000 → 28,000 → 31,000 miles. No rollbacks at any point in the history.",
    expectedBehavior: "Agent correctly identifies no rollback for this VIN. Status: CLEAN. No dealer alert generated. No quarantine triggered. False positive rate stays below 1% threshold. VIN included in the all-clear section of the daily report.",
    difficultyTier: "routine",
    scenarioCategory: "happy_path",
    tags: ["clean", "true-negative", "no-rollback", "Honda"],
  },
  {
    name: "Multi-VIN Fraud Ring Indicator",
    inputScenario: "Three VINs from the same dealer (Manheim Chicago) show confirmed rollbacks in the same 7-day window: VIN A (2,100-mile rollback), VIN B (1,800-mile rollback), VIN C (3,200-mile rollback). Pattern consistent with organized fraud ring.",
    expectedBehavior: "Agent flags potential organized fraud ring, escalates all 3 VINs + dealer to BB Fraud Investigations, requests all dealer VINs for 90-day enhanced review, generates NAAA dealer alert, initiates FBI financial crimes referral protocol documentation.",
    difficultyTier: "complex",
    scenarioCategory: "adversarial",
    tags: ["fraud-ring", "multi-VIN", "organized-fraud", "Manheim-Chicago", "exception"],
  },
  {
    name: "Report Generation Financial Accuracy",
    inputScenario: "3 confirmed rollbacks with individual overstatements of $6,360, $8,388, and $14,370. 1 service conflict case with $18,600 risk exposure. Agent generates daily fraud report at end of scan.",
    expectedBehavior: "Confirmed overstatement total: $29,118 (sum of 3 confirmed cases). Service conflict exposure: $18,600 (reported separately as unconfirmed). Combined risk in report: $47,718. Report includes breakdown by severity tier, dealer flags list, and model impact summary.",
    difficultyTier: "routine",
    scenarioCategory: "happy_path",
    tags: ["report", "financial", "accuracy", "totals"],
  },
];

// ── MAIN ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n" + "═".repeat(64));
  console.log(`  ${AGENT_CODE} — ${AGENT_NAME}`);
  console.log("  Extension 1 — Black Book Valuation Intelligence");
  console.log(`  Target: ${BASE}`);
  console.log("  Mode: Platform API Provisioning (no direct DB writes)");
  console.log("═".repeat(64) + "\n");

  const ids = { agentCode: AGENT_CODE, agentName: AGENT_NAME };

  // ── STEP 1: SKILLS ────────────────────────────────────────────────────────
  step(1, `Creating ${SKILLS.length} skills`);
  ids.skillIds = [];
  for (const skill of SKILLS) {
    const s = await post("/api/skills", skill);
    ids.skillIds.push(s.id);
    log(`Skill → ${skill.name} [${s.id}]`);
  }

  // ── STEP 2: KNOWLEDGE BASE ────────────────────────────────────────────────
  step(2, "Creating knowledge base");
  const kb = await post("/api/knowledge-bases", {
    name: "BB-AGT-005 Odometer Fraud Intelligence",
    description: "Knowledge base for the Odometer Fraud Detection Agent. Contains odometer fraud law, detection methodologies, CARFAX integration protocols, dealer alert procedures, and financial impact calculation frameworks.",
    retrievalConfig: { topK: 10, scoreThreshold: 0.65, rerankEnabled: true, citationMode: "full" },
  });
  ids.kbId = kb.id;
  log(`Knowledge Base → ${kb.id}`);

  // ── STEP 3: KB SOURCES ────────────────────────────────────────────────────
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

  // ── STEP 4: RUNBOOKS ─────────────────────────────────────────────────────
  step(4, `Creating ${RUNBOOKS.length} runbooks`);
  ids.runbookIds = [];
  for (const rb of RUNBOOKS) {
    const r = await post("/api/runbooks", { ...rb, agentId: null });
    ids.runbookIds.push(r.id);
    log(`Runbook → ${rb.name} [${r.id}]`);
  }

  // ── STEP 5: POLICIES ─────────────────────────────────────────────────────
  step(5, `Creating ${POLICIES.length} governance policies`);
  ids.policyIds = [];
  for (const pol of POLICIES) {
    const p = await post("/api/policies", pol);
    ids.policyIds.push(p.id);
    log(`Policy → ${pol.name} [${p.id}]`);
  }

  // ── STEP 6: AGENT (via Platform API — no direct DB write) ─────────────────
  step(6, "Looking up agent created at server startup");
  // BB-AGT-005 is auto-created at startup via ensureBBAgents(). Look it up by name.
  const agentList = await get("/api/agents");
  const agents = Array.isArray(agentList) ? agentList : (agentList.agents || []);
  const agent = agents.find(a => a.name === AGENT_NAME);

  if (!agent) {
    throw new Error(`Agent '${AGENT_NAME}' not found — ensure server started successfully`);
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

  // ── STEP 8: LINK KB TO AGENT ──────────────────────────────────────────────
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
  // Schema: name, description, industry, useCase required
  step(9, `Creating golden dataset + ${TEST_CASES.length} test cases`);
  const ds = await post("/api/golden-datasets", {
    name: "BB-AGT-005 Odometer Fraud Detection Test Suite",
    description: "Golden dataset for BB-AGT-005. Covers happy path (3 standard rollbacks), CRITICAL rollback exception, service record conflict exception, true-negative (clean VIN), fraud ring indicator, and report accuracy validation.",
    industry: "automotive",
    useCase: "odometer_fraud_detection",
    tags: ["odometer", "fraud-detection", "extension-1", "rollback", "CARFAX"],
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
  // Schema: agentId (required), name (required), goldenDatasetId, thresholdConfig, industry, schedule
  step(10, "Creating eval suite");
  const evalSuite = await post("/api/evals", {
    name: "BB-AGT-005 Odometer Fraud Detection Eval",
    agentId: ids.agentId,
    goldenDatasetId: ids.goldenDatasetId,
    type: "regression",
    industry: "automotive",
    thresholdConfig: { precision: 0.99, recall: 0.95, falsePositiveRate: 0.01 },
    schedule: "daily",
  });
  ids.evalSuiteId = evalSuite.id;
  log(`Eval Suite → ${evalSuite.id}`);

  // ── STEP 11: OUTCOME + KPIs ───────────────────────────────────────────────
  step(11, "Creating outcome contract + KPIs");
  const outcome = await post("/api/outcomes/with-kpis", {
    outcome: {
      name: "BB-AGT-005 Odometer Fraud Detection Outcome",
      description: "Outcome contract for the Odometer Fraud Detection Agent. Measures the agent's effectiveness in protecting Black Book valuation integrity from odometer rollback fraud.",
      agentId: ids.agentId,
      attributionRules: {
        agentId: ids.agentId,
        attributionModel: "direct",
        measurementWindow: "daily",
      },
    },
    kpis: [
      {
        name: "Rollback Detection Rate",
        description: "Percentage of confirmed odometer rollback VINs in the daily batch that BB-AGT-005 correctly identifies. Target: >99.5%",
        metric: "rollback_detection_rate",
        target: 99.5,
        unit: "percent",
        direction: "maximize",
      },
      {
        name: "Valuation Overstatement Prevented",
        description: "Percentage of confirmed fraud-inflated valuations quarantined from the Black Book pricing model per day. Target: 100%",
        metric: "valuation_overstatement_prevented_pct",
        target: 100,
        unit: "percent",
        direction: "maximize",
      },
      {
        name: "CRITICAL Escalation SLA Compliance",
        description: "Percentage of CRITICAL severity rollbacks for which dealer alerts are generated within the 4-hour SLA. Target: 100%",
        metric: "critical_sla_compliance",
        target: 100,
        unit: "percent",
        direction: "maximize",
      },
      {
        name: "False Positive Rate",
        description: "Percentage of clean VINs incorrectly flagged as rollback fraud by BB-AGT-005. Target: <1%",
        metric: "false_positive_rate",
        target: 1.0,
        unit: "percent",
        direction: "minimize",
      },
      {
        name: "Daily Scan Processing Time",
        description: "Time from scan initiation to report completion for 142K+ VINs. Target: <5 minutes (300 seconds)",
        metric: "scan_processing_time_seconds",
        target: 300,
        unit: "seconds",
        direction: "minimize",
      },
    ],
  });
  ids.outcomeId = outcome.outcome?.id || outcome.id;
  log(`Outcome Contract → ${ids.outcomeId} (5 KPIs)`);

  // ── STEP 12: LINK OUTCOME + EVAL TO AGENT ─────────────────────────────────
  step(12, "Linking outcome and eval to agent");
  try {
    await patch(`/api/agents/${ids.agentId}`, {
      outcomeId: ids.outcomeId,
    });
    log("Outcome linked to agent");
  } catch (e) {
    warn(`Outcome link (non-fatal): ${e.message.slice(0, 60)}`);
  }

  // ── STEP 13: ONTOLOGY TAGS ────────────────────────────────────────────────
  step(13, "Setting ontology tags");
  try {
    const allConcepts = await get("/api/ontology-concepts/all");
    const keywords = ["odometer", "fraud", "vehicle", "detection", "auction", "valuation", "compliance", "rollback"];
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
    createdAt: new Date().toISOString(),
    environment: "dev",
    agentCode: AGENT_CODE,
    agentName: AGENT_NAME,
    ...ids,
  };

  writeFileSync("scripts/bb-ext1-dev-ids.json", JSON.stringify(output, null, 2));

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
  console.log(`\n  Dev IDs saved → scripts/bb-ext1-dev-ids.json`);
  console.log("\n  Next steps:");
  console.log("    1. Test: http://localhost:5000/demo/blackbook → Odometer Fraud Detection scenario");
  console.log("    2. Verify agent at /agents/" + ids.agentId);
  console.log("    3. Migrate to prod: node scripts/migrate-bb-ext1-to-prod.js\n");
}

main().catch(err => {
  console.error(`\n❌  Provisioning failed: ${err.message}`);
  process.exit(1);
});
