#!/usr/bin/env node
/**
 * LIT-AGT-004 — Litigation Case Management Agent
 * DEV ENVIRONMENT — SINGLE COMPREHENSIVE CREATION SCRIPT
 *
 * Creates ALL platform intelligence in ONE script in the correct order.
 * All corrections from prior agents applied:
 *  ✅ eval schedule → string "weekly:Wednesday:06:00 UTC" (NOT object)
 *  ✅ outcome version → number 1 (NOT string "1.0")
 *  ✅ preloadedSkills → [{skillId, loadOrder}] (NOT bare IDs)
 *  ✅ ontologyTags → fetched dynamically from /api/ontology-concepts/all
 *  ✅ KB sources → POST /sources/text with `title` field
 *  ✅ Runbook agentId → PATCH /api/runbooks/:id {agentId}
 *  ✅ Policy scopeId → PATCH /api/policies/:id {scopeId, scopeType:"agent"}
 *  ✅ KB link → POST /api/agents/:id/knowledge-bases
 *  ✅ Eval + Outcome → PATCH /api/agents/:id {outcomeId, evalBindings:[...]}
 *  ✅ HTML response guard on every API call
 *
 * Usage:  node scripts/create-lit-agt-004-dev.js
 * Saves:  scripts/lit-agt-004-dev-ids.json
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
const step = (n, t, msg) => console.log(`\nSTEP ${n}/${t}  ${msg}…`);

// ══════════════════════════════════════════════════════════════════════════════
//  DATA — 6 SKILLS  (Section 5.4)
// ══════════════════════════════════════════════════════════════════════════════

const SKILLS = [
  {
    organizationId: ORG,
    name: "Charge Analysis Skill",
    description: "Performs NLP-based extraction and structural analysis of EEOC charges, DFEH/CRD complaints, state agency charges, and federal lawsuit complaints. Identifies claims by statute (Title VII, ADA, ADEA, FLSA, §1981, ERISA), extracts named parties, summarizes factual allegations chronologically, determines relief sought (backpay, front pay, compensatory/punitive damages, reinstatement, injunctive relief), and flags jurisdictional issues. Produces a structured matter intake record with claim elements mapped to legal standards for downstream case assessment.",
    industry: "legal_services",
    domain: "litigation-case-management",
    version: "1.0.0",
    author: "Littler Mendelson Litigation Practice Group",
    trustTier: "HIGH",
    dependencies: [],
    tags: ["charge-analysis", "NLP", "EEOC", "complaint-extraction", "claim-mapping", "jurisdiction", "LIT-AGT-004"],
    agentTypeCompatibility: ["single", "team", "remote"],
    status: "active",
    complexity: "complex",
    allowedTools: ["retrieve_kb", "extract_claims", "identify_statutes", "map_legal_elements", "flag_jurisdiction_issues", "generate_intake_record"],
    requiredMcpServers: ["littler-litigation-mcp", "legal-standards-mcp", "court-records-mcp"],
    requiredDataClassifications: ["matter_records", "client_confidential", "attorney_work_product"],
    disableModelInvocation: false,
    contextMode: "rag",
    userInvocable: true,
    descriptionQualityScore: 94,
    knowledgeQueries: ["EEOC charge elements", "employment discrimination statutes", "complaint intake framework", "claim type classification"],
    yamlFrontmatter: `name: Charge Analysis Skill\nversion: "1.0"\nagent_code: LIT-AGT-004\ndomain: litigation-case-management\nindustry: legal_services\ntrust_tier: HIGH\ncontext_mode: rag\nclaim_types: [discrimination, harassment, retaliation, wrongful_termination, wage_hour, ERISA]\nstatutes: [Title_VII, ADA, ADAAA, ADEA, FLSA, Section_1981, ERISA, state_FELs]\noutput: structured_matter_record\ncitation_required: true`,
    markdownBody: `# Charge Analysis Skill\n\n## Purpose\nAutomates intake analysis of employment law charges and complaints, extracting structured data for matter opening, conflict check, and initial case assessment. Eliminates manual data entry and ensures consistent claim identification across all matter types.\n\n## Input Sources\n- EEOC Charge of Discrimination (EEOC Form 5)\n- State agency charges (DFEH/CRD, NYSDHR, IDHR, MCAD, etc.)\n- Federal district court complaints (PACER)\n- State court complaints\n- Demand letters with threatened charges\n\n## Extraction Framework\n\n### Claim Classification Matrix\n| Claim Type | Primary Statute | Federal Agency | Typical Relief |\n|---|---|---|---|\n| Race Discrimination | Title VII §703 | EEOC | Backpay, reinstatement, compensatory up to $300K |\n| Sex Discrimination | Title VII §703 | EEOC | Same + PWFA PUMP Act |\n| Age Discrimination | ADEA §4 | EEOC | Backpay, liquidated damages (willful) |\n| Disability Discrimination | ADA/ADAAA §102 | EEOC | + Reasonable accommodation |\n| Retaliation | Title VII §704, ADA §503, ADEA §4(d) | EEOC | Burlington Northern standard |\n| FLSA Wage/Hour | FLSA §7-8 | DOL/private | Backpay + liquidated = 2x (3x willful) |\n| Section 1981 | 42 U.S.C. §1981 | Private only | Unlimited compensatory/punitive |\n\n### Structured Output Fields\n1. Matter type (EEOC charge / state charge / lawsuit / demand letter)\n2. Filing date and agency/court\n3. Charging party / plaintiff name, title, protected class(es)\n4. Respondent / defendant entities\n5. Claims (statute, claim type, elements alleged)\n6. Factual allegations (chronological timeline)\n7. Alleged adverse actions (with dates)\n8. Relief sought (itemized)\n9. Jurisdiction (federal / state / multiple)\n10. Statute of limitations analysis\n11. Jurisdictional issues flagged\n12. Recommended response deadline\n\n## Statute of Limitations Reference\n- Title VII / ADA / ADEA: 180 days (no state agency) / 300 days (state agency) to file EEOC charge; 90 days from right-to-sue to file lawsuit\n- FLSA: 2 years (3 years willful)\n- Section 1981: 4 years (federal statute of limitations)\n- State FELs: CA 3 years (FEHA); NY 3 years (NYSHRL); IL 300 days to IDHR\n`,
  },
  {
    organizationId: ORG,
    name: "Deadline Calculator Skill",
    description: "Computes all procedural deadlines for employment litigation matters across federal and state jurisdictions. Calculates EEOC response deadlines, position statement due dates, right-to-sue letter expiration, lawsuit filing deadlines, answer due dates, initial disclosure deadlines, discovery cutoffs, expert designation dates, dispositive motion deadlines, pretrial conference dates, and trial dates. Accounts for court-specific local rules, standing orders, holiday schedules, and applicable extensions. Outputs a prioritized deadline calendar with responsible attorney assignments and alert thresholds.",
    industry: "legal_services",
    domain: "litigation-case-management",
    version: "1.0.0",
    author: "Littler Mendelson Litigation Practice Group",
    trustTier: "CRITICAL",
    dependencies: ["Charge Analysis Skill"],
    tags: ["deadline-calculation", "calendar", "FRCP", "local-rules", "discovery-cutoffs", "response-deadlines", "LIT-AGT-004"],
    agentTypeCompatibility: ["single", "team", "remote"],
    status: "active",
    complexity: "complex",
    allowedTools: ["retrieve_kb", "calculate_deadline", "lookup_local_rules", "check_court_calendar", "generate_deadline_calendar", "set_alerts"],
    requiredMcpServers: ["littler-litigation-mcp", "court-calendar-mcp", "local-rules-mcp"],
    requiredDataClassifications: ["matter_records", "court_records"],
    disableModelInvocation: false,
    contextMode: "rag",
    userInvocable: true,
    descriptionQualityScore: 96,
    knowledgeQueries: ["EEOC response deadlines", "FRCP discovery deadlines", "answer due dates", "local rules deadline modifications", "holiday calendar adjustments"],
    yamlFrontmatter: `name: Deadline Calculator Skill\nversion: "1.0"\nagent_code: LIT-AGT-004\ndomain: litigation-case-management\nindustry: legal_services\ntrust_tier: CRITICAL\ncontext_mode: rag\ndeadline_types: [eeoc_response, position_statement, right_to_sue, answer, initial_disclosures, discovery_cutoff, expert_designation, dispositive_motions, pretrial, trial]\nalert_thresholds: [30_days, 14_days, 7_days, 3_days, 1_day]\ncalendar_aware: true\nlocal_rules_aware: true`,
    markdownBody: `# Deadline Calculator Skill\n\n## Critical Deadline Types\n\n### EEOC Charge Phase\n| Deadline | Trigger | Duration | Notes |\n|---|---|---|---|\n| Position Statement | EEOC charge date | 30 days (standard) | Extendable to 60 days |\n| EEOC Investigation Response | EEOC request | Per request | Usually 30 days |\n| Right-to-Sue Letter | Complainant request / 180 days | Issues on request | Starts 90-day clock |\n| Lawsuit Filing | Right-to-sue received | 90 days | Jurisdictional; cannot be extended |\n\n### Federal Litigation Phase (FRCP)\n| Deadline | Trigger | Duration | Rule |\n|---|---|---|---|\n| Answer | Complaint served | 21 days (individual) / 60 days (US gov) | FRCP 12(a) |\n| 12(b) Motion | Complaint served | 21 days | FRCP 12(a) |\n| Rule 26(a)(1) Initial Disclosures | Scheduling conference | 14 days after | FRCP 26(a)(1) |\n| Expert Disclosure (plaintiff) | Per scheduling order | Usually 90-120 days before trial | FRCP 26(a)(2) |\n| Expert Disclosure (defendant) | After plaintiff expert | 30 days after plaintiff | FRCP 26(a)(2)(D) |\n| Discovery Cutoff | Per scheduling order | Varies by district | Local rules |\n| Dispositive Motion | Per scheduling order | Usually 30 days after discovery | Local rules |\n| Pretrial Conference | Per court order | 30-60 days before trial | Local rules |\n\n### Alert Threshold Logic\n- 30 days: Yellow alert — assign responsible attorney, prepare response\n- 14 days: Orange alert — work product due, supervisor review\n- 7 days: Red alert — escalate to partner, client notification\n- 3 days: Critical alert — emergency escalation, partner sign-off required\n- 1 day: Emergency — runbook activation, court contact if extension needed\n\n## Jurisdiction-Specific Rules\n- SDNY/EDNY: Local Civil Rule 37.2 — mandatory meet-and-confer before discovery motions\n- N.D. Cal.: Standing Order for Civil Cases — ESI protocols mandatory\n- C.D. Cal.: Standing Order — specific joint report requirements\n- N.D. Ill.: LR 37.2 — discovery dispute procedure\n- S.D. Tex.: Requires Joint Discovery/Case Management Plan\n\n## Holiday Calendar\nFederal holidays: New Year's Day, MLK Jr. Day, Presidents' Day, Memorial Day, Juneteenth, Independence Day, Labor Day, Columbus Day, Veterans Day, Thanksgiving, Christmas\nFRCP 6(a): Excludes weekends and legal holidays from short deadlines (≤11 days)\n`,
  },
  {
    organizationId: ORG,
    name: "Case Assessment Skill",
    description: "Evaluates the viability of employment discrimination, harassment, retaliation, and wrongful termination claims and defenses to produce a comprehensive case strength assessment. Analyzes factual allegations against the applicable legal standard, maps available defenses, identifies documentary evidence gaps, assesses witnesses credibility and availability, evaluates venue and judge assignment, reviews comparable cases for outcome prediction, and recommends early resolution strategy. Produces a structured assessment memo with confidence-weighted outcome predictions and settlement range recommendations.",
    industry: "legal_services",
    domain: "litigation-case-management",
    version: "1.0.0",
    author: "Littler Mendelson Litigation Practice Group",
    trustTier: "HIGH",
    dependencies: ["Charge Analysis Skill"],
    tags: ["case-assessment", "claim-viability", "defense-strategy", "outcome-prediction", "settlement-range", "risk-scoring", "LIT-AGT-004"],
    agentTypeCompatibility: ["single", "team", "remote"],
    status: "active",
    complexity: "expert",
    allowedTools: ["retrieve_kb", "score_claim_viability", "analyze_defenses", "lookup_judge_analytics", "predict_outcome", "generate_settlement_range", "generate_assessment_memo"],
    requiredMcpServers: ["littler-litigation-mcp", "legal-standards-mcp", "casesmart-analytics-mcp"],
    requiredDataClassifications: ["matter_records", "client_confidential", "attorney_work_product"],
    disableModelInvocation: false,
    contextMode: "rag",
    userInvocable: true,
    descriptionQualityScore: 95,
    knowledgeQueries: ["claim viability assessment framework", "employment litigation defense strategies", "outcome prediction methodology", "settlement valuation methodology", "judge analytics"],
    yamlFrontmatter: `name: Case Assessment Skill\nversion: "1.0"\nagent_code: LIT-AGT-004\ndomain: litigation-case-management\nindustry: legal_services\ntrust_tier: HIGH\ncontext_mode: rag\nassessment_components: [claim_viability, defense_strength, evidence_analysis, witness_assessment, venue_analysis, outcome_prediction, settlement_range]\nconfidence_threshold: 0.75\nattorney_review_required: true`,
    markdownBody: `# Case Assessment Skill\n\n## Assessment Framework\n\n### Claim Viability Scoring (0-100)\n- **Factual Support** (30 pts): Strength of underlying facts supporting each element\n- **Legal Framework** (25 pts): Quality of applicable legal standard and burden of proof\n- **Evidence Quality** (25 pts): Available documentary/testimonial evidence\n- **Witness Strength** (20 pts): Complainant/plaintiff credibility and witness corroboration\n\n**Score Thresholds:**\n- 80-100: Strong claim — high settlement/judgment risk\n- 60-79: Moderate claim — meaningful exposure\n- 40-59: Weak claim — viable but significant defenses\n- <40: Marginal claim — good dismissal or early summary judgment prospects\n\n### Defense Analysis Matrix\n| Defense Type | Applicable Claims | Key Evidence Needed |\n|---|---|---|\n| LNDR (Legitimate, Non-Discriminatory Reason) | All discrimination | Documented business reason predating adverse action |\n| Faragher/Ellerth | Supervisor harassment without tangible action | Policy, training, complaint channels, failure to use |\n| Same-Actor Inference | Discrimination | Same person hired and fired within short timeframe |\n| Stray Remarks | All | Decision-maker vs. non-decision-maker; temporal proximity |\n| ADEA: Same-Age Replacement | Age discrimination | Replacement employee's age close to plaintiff's |\n| After-Acquired Evidence | Any | Misconduct discovered after termination; limits backpay |\n| Business Necessity / BFOQ | Disparate impact / limited discrimination | Validated job-related criteria |\n\n### Outcome Prediction Model\n- Inputs: claim viability score, defense strength, judge assignment, jurisdiction, comparables\n- Outputs: P(dismissal), P(summary judgment), P(plaintiff verdict), P(settlement), expected value range\n- Confidence interval displayed with every prediction\n- Model validated against 30,000+ CaseSmart historical matters\n\n### Settlement Range Methodology\n- Base: median comparable case settlement by claim type, jurisdiction, circuit\n- Adjustments: claim strength (+/-), attorney fees exposure (+/-), publicity risk (+/-), client risk tolerance (+/-), insurance coverage structure (+/-)\n- Output: low / mid / high / walk-away range\n- Includes attorney fee component (Title VII §706(k), FLSA §16(b))\n`,
  },
  {
    organizationId: ORG,
    name: "Budget Management Skill",
    description: "Tracks litigation spend against matter budgets and alternative fee arrangements (AFAs), forecasts phase-by-phase costs, flags variances, and provides data-driven budget renegotiation analysis. Manages hourly billing, fixed fee, blended rate, success fee, and hybrid arrangements. Monitors actual spend by phase (investigation, discovery, motions, trial) and timekeeper against budgeted amounts. Identifies cost drivers, benchmarks against CaseSmart portfolio data, and generates variance reports for client and insurance carrier review.",
    industry: "legal_services",
    domain: "litigation-case-management",
    version: "1.0.0",
    author: "Littler Mendelson Litigation Practice Group",
    trustTier: "HIGH",
    dependencies: [],
    tags: ["budget-management", "AFA", "litigation-cost", "spend-tracking", "variance-analysis", "cost-forecasting", "LIT-AGT-004"],
    agentTypeCompatibility: ["single", "team", "remote"],
    status: "active",
    complexity: "complex",
    allowedTools: ["retrieve_kb", "track_spend", "forecast_cost", "calculate_variance", "benchmark_cost", "generate_budget_report", "flag_overrun"],
    requiredMcpServers: ["littler-litigation-mcp", "billing-system-mcp", "casesmart-analytics-mcp"],
    requiredDataClassifications: ["billing_records", "matter_records", "client_confidential"],
    disableModelInvocation: false,
    contextMode: "rag",
    userInvocable: true,
    descriptionQualityScore: 92,
    knowledgeQueries: ["litigation budget benchmarks by phase", "AFA arrangement types", "cost variance analysis", "insurance carrier reporting requirements", "discovery cost management"],
    yamlFrontmatter: `name: Budget Management Skill\nversion: "1.0"\nagent_code: LIT-AGT-004\ndomain: litigation-case-management\nindustry: legal_services\ntrust_tier: HIGH\ncontext_mode: rag\nfee_arrangements: [hourly, fixed_fee, blended_rate, success_fee, hybrid_AFA, PPEN]\nphases: [intake, investigation, pleadings, discovery, motions, trial, appeal]\nvariance_thresholds: [10_pct_warn, 20_pct_escalate, 30_pct_critical]\ncarrier_reporting: true`,
    markdownBody: `# Budget Management Skill\n\n## Fee Arrangement Types\n\n### Hourly Billing\n- Track by timekeeper, rate tier, and phase\n- Monthly billing with carrier pre-approval for deviations\n- Rate schedules: partner / senior associate / associate / paralegal\n\n### Alternative Fee Arrangements (AFAs)\n- **Fixed Fee per Phase**: Set amounts for investigation, discovery, motions\n- **Fixed Fee per Matter**: Single fee for entire matter (common for charge defense)\n- **Blended Rate**: Single hourly rate regardless of timekeeper\n- **Success Fee**: Base fee plus bonus tied to outcome (dismissal, favorable resolution)\n- **Portfolio Pricing**: Per-matter rate based on annual volume commitment\n- **Capped Fee**: Hourly billing with not-to-exceed cap\n\n## Budget Phase Tracking\n| Phase | Typical % of Budget | Key Cost Drivers |\n|---|---|---|\n| Intake & Investigation | 5-10% | Attorney time, document collection |\n| Pleadings | 3-8% | Answer, counterclaims, 12(b) motions |\n| Written Discovery | 15-25% | Interrogatories, document review, privilege log |\n| Depositions | 20-35% | Court reporter, travel, preparation time |\n| Expert Witnesses | 5-15% | Expert fees, report preparation, deposition |\n| Dispositive Motions | 10-20% | Brief drafting, oral argument |\n| Trial | 20-40% | If not settled |\n| Appeal | Variable | If adverse outcome |\n\n## Variance Thresholds & Actions\n- **0-10%**: Monitor; note reason; no action required\n- **10-20%**: Yellow flag; client notification; scope review\n- **20-30%**: Orange flag; partner review; client meeting; scope adjustment or AFA renegotiation\n- **>30%**: Red flag; immediate runbook activation; client escalation; potential malpractice review\n\n## Insurance Carrier Reporting\n- Pre-authorization required: depositions, expert retention, motions\n- Monthly status report: spend vs. budget, phase completion, next phase estimate\n- Reserve setting: carrier controls reserve; attorney provides updated exposure estimate\n- Settlement authority: carrier approves all amounts within policy\n`,
  },
  {
    organizationId: ORG,
    name: "Comparables Analysis Skill",
    description: "Identifies and analyzes comparable employment litigation cases from the Littler CaseSmart database and public sources to support settlement valuation, outcome prediction, and litigation strategy. Matches matters by claim type, statute, jurisdiction (federal circuit, district, state), industry, employer size, fact pattern similarity, and resolution type. Produces a structured comparables report with settlement ranges, verdict amounts, dismissal rates, and cycle times for matters with analogous characteristics.",
    industry: "legal_services",
    domain: "litigation-case-management",
    version: "1.0.0",
    author: "Littler Mendelson Litigation Practice Group",
    trustTier: "HIGH",
    dependencies: ["Charge Analysis Skill", "Case Assessment Skill"],
    tags: ["comparables-analysis", "settlement-valuation", "outcome-prediction", "case-matching", "CaseSmart", "verdict-data", "LIT-AGT-004"],
    agentTypeCompatibility: ["single", "team", "remote"],
    status: "active",
    complexity: "complex",
    allowedTools: ["retrieve_kb", "query_casesmart", "match_comparables", "calculate_settlement_range", "analyze_verdict_data", "generate_comparables_report"],
    requiredMcpServers: ["littler-litigation-mcp", "casesmart-analytics-mcp", "verdict-database-mcp"],
    requiredDataClassifications: ["matter_records", "client_confidential", "attorney_work_product"],
    disableModelInvocation: false,
    contextMode: "rag",
    userInvocable: true,
    descriptionQualityScore: 93,
    knowledgeQueries: ["comparable case methodology", "settlement valuation by claim type", "verdict database analysis", "case outcome prediction factors"],
    yamlFrontmatter: `name: Comparables Analysis Skill\nversion: "1.0"\nagent_code: LIT-AGT-004\ndomain: litigation-case-management\nindustry: legal_services\ntrust_tier: HIGH\ncontext_mode: rag\nmatching_dimensions: [claim_type, statute, jurisdiction_circuit, jurisdiction_district, industry, employer_size, fact_pattern, resolution_type]\ndata_sources: [casesmart_30k_matters, public_verdict_reporters, EEOC_resolution_data]\noutput: structured_comparables_report\nminimum_comparables: 5`,
    markdownBody: `# Comparables Analysis Skill\n\n## Matching Methodology\n\n### Primary Match Dimensions (Required)\n1. **Claim Type** — Must match exactly (e.g., sex discrimination ≠ race discrimination)\n2. **Statute** — Title VII vs. §1981 vs. ADA vs. ADEA (different damages caps and remedies)\n3. **Federal Circuit** — 1st-11th; different legal standards across circuits\n4. **Resolution Type** — Settlement / dismissal / plaintiff verdict / defense verdict\n\n### Secondary Match Dimensions (Weighted)\n5. **District Court** — Same district preferred; circuit-wide acceptable\n6. **Industry** — Manufacturing, healthcare, retail, finance (industry affects fact patterns)\n7. **Employer Size** — <50, 50-200, 200-500, 500-2000, 2000+ (affects damages caps)\n8. **Fact Pattern Score** — Supervisor harassment vs. co-worker; discriminatory termination vs. failure to promote\n9. **Attorney Fee Multiplier** — Prevailing party fee awards where available\n\n## Settlement Range Outputs\n- **Floor**: 15th percentile of comparable settlements\n- **Median**: 50th percentile\n- **Mean**: Weighted average (excluding outliers >3 SD)\n- **Authority Recommendation**: Recommended settlement authority range\n- **Walk-Away**: Amount below which trial is preferable\n\n## CaseSmart Database Coverage (30,000+ matters)\n| Claim Type | Available Comparables | Median Settlement Range |\n|---|---|---|\n| Sexual Harassment (supervisor) | 3,200+ | $45K-$85K (per Littler CaseSmart) |\n| Race Discrimination (termination) | 4,100+ | $35K-$70K |\n| Age Discrimination (RIF) | 2,800+ | $55K-$120K (ADEA liquidated damages exposure) |\n| ADA Failure to Accommodate | 2,100+ | $30K-$65K |\n| FLSA Collective Action | 1,800+ | Highly variable; $500K-$5M+ |\n| Retaliation (Title VII) | 5,400+ | $40K-$90K |\n\n## Public Data Sources\n- Westlaw/LexisNexis verdict reporters\n- BNA/Bloomberg Law settlement databases\n- PACER EEOC litigation statistics\n- EEOC enforcement statistics (annual)\n- Jury Verdict Research (Wolters Kluwer)\n\n## Confidence Scoring\n- ≥10 close comparables: HIGH confidence (±15%)\n- 5-9 comparables: MEDIUM confidence (±25%)\n- <5 comparables: LOW confidence (±40%) — flag for attorney review\n`,
  },
  {
    organizationId: ORG,
    name: "Dashboard Analytics Skill",
    description: "Generates matter-level and portfolio-level performance analytics for employment litigation matters. Produces metrics on case volume by claim type, jurisdiction, industry, and outcome; cost-per-matter benchmarks; cycle time analysis by phase and matter type; settlement rate and average resolution amount; dispositive motion success rates; and year-over-year trend analysis. Supports client portfolio reporting, insurance carrier status reports, and internal performance reviews. Integrates with CaseSmart billing and matter management data.",
    industry: "legal_services",
    domain: "litigation-case-management",
    version: "1.0.0",
    author: "Littler Mendelson Litigation Practice Group",
    trustTier: "MEDIUM",
    dependencies: ["Budget Management Skill", "Comparables Analysis Skill"],
    tags: ["dashboard-analytics", "portfolio-metrics", "litigation-KPIs", "trend-analysis", "cost-per-matter", "CaseSmart", "LIT-AGT-004"],
    agentTypeCompatibility: ["single", "team", "remote"],
    status: "active",
    complexity: "complex",
    allowedTools: ["retrieve_kb", "query_casesmart", "aggregate_metrics", "generate_trend_analysis", "generate_dashboard_report", "export_data"],
    requiredMcpServers: ["littler-litigation-mcp", "casesmart-analytics-mcp", "reporting-mcp"],
    requiredDataClassifications: ["matter_records", "billing_records", "aggregate_analytics"],
    disableModelInvocation: false,
    contextMode: "rag",
    userInvocable: true,
    descriptionQualityScore: 91,
    knowledgeQueries: ["litigation portfolio metrics", "cost per charge benchmarks", "settlement rate analysis", "cycle time benchmarks", "dispositive motion success rates"],
    yamlFrontmatter: `name: Dashboard Analytics Skill\nversion: "1.0"\nagent_code: LIT-AGT-004\ndomain: litigation-case-management\nindustry: legal_services\ntrust_tier: MEDIUM\ncontext_mode: rag\nmetric_dimensions: [volume, cost, cycle_time, outcome, settlement_rate, verdict_rate, dispositive_success]\nreport_types: [matter_level, portfolio_level, client_report, carrier_report, trend_analysis]\ndata_sources: [casesmart, billing_system, matter_management]\nrefresh_frequency: weekly`,
    markdownBody: `# Dashboard Analytics Skill\n\n## Matter-Level Metrics\n- **Open/Closed Status** with phase tracking\n- **Spend to Date** vs. budget (hourly / AFA)\n- **Deadline Compliance** — all deadlines met vs. extensions requested\n- **Claim Type and Statute** — for portfolio comparison\n- **Assigned Team** and rate tier\n- **Resolution Type** — if closed: settlement amount, dismissal type, verdict\n- **Cycle Time** — intake to resolution in calendar days\n\n## Portfolio-Level Metrics\n| Metric | Description | Benchmark Source |\n|---|---|---|\n| Cost per Charge | Total spend / number of charges | CaseSmart median: $8K-$15K |\n| Cost per Lawsuit | Total spend / lawsuits | CaseSmart median: $35K-$75K |\n| Dismissal Rate | Pre-trial disposals / total closed | CaseSmart: ~65% |\n| Settlement Rate | Settlements / total closed | CaseSmart: ~30% |\n| Plaintiff Verdict Rate | Adverse verdicts / trial | National: 40-45% of trials |\n| Avg. Settlement Amount | By claim type and jurisdiction | CaseSmart by category |\n| Average Cycle Time | Days intake to close | Charge: 18 months; Lawsuit: 30 months |\n| Summary Judgment Win Rate | SJ granted / SJ filed | National: ~35-45% |\n\n## Trend Analysis\n- Year-over-year volume by claim type (identify emerging trends)\n- Jurisdiction hotspots (districts with rising employment litigation)\n- Recurring claimants or plaintiff attorneys\n- Industry-specific claim type concentrations\n- Seasonal patterns (Q4 terminations correlate with Q1-Q2 charges)\n\n## Client Reporting Formats\n- **Executive Summary**: Volume, spend, trend arrows, open matters\n- **Detailed Status Table**: Each open matter with phase, spend, next deadline\n- **Closed Matter Summary**: Resolution type, amount, cycle time, cost\n- **Benchmark Comparison**: Client metrics vs. CaseSmart industry benchmarks\n\n## Insurance Carrier Report\n- Open matter reserve adequacy\n- Spend vs. reserve by matter\n- Upcoming high-cost events (trials, expert depositions)\n- New matters opened this period\n`,
  },
];

// ══════════════════════════════════════════════════════════════════════════════
//  DATA — 6 KB SOURCES  (Section 5.8)
// ══════════════════════════════════════════════════════════════════════════════

const KB_SOURCES = [
  {
    title: "Littler CaseSmart Matter Database — Historical Outcomes, Cost Benchmarks & Performance Metrics",
    tags: ["CaseSmart", "historical-matters", "benchmarks", "outcomes", "cost-metrics", "LIT-AGT-004"],
    metadata: { source: "Littler Mendelson CaseSmart Platform", type: "matter-database", coverage: "30000+_matters", lastUpdated: "2024-01-01" },
    content: `# Littler CaseSmart Matter Database — Historical Outcomes, Cost Benchmarks & Performance Metrics\n\n## Database Overview\n- 30,000+ historical employment litigation matters from Littler's nationwide practice\n- Coverage: EEOC charges, state agency charges, single-plaintiff federal lawsuits, state court lawsuits\n- Time period: 2000-present\n- Industries: Manufacturing (18%), Healthcare (15%), Financial Services (12%), Retail (10%), Technology (9%), Other (36%)\n\n## Outcome Distribution (all matter types)\n| Resolution Type | Percentage | Notes |\n|---|---|---|\n| EEOC No-Cause / Dismissal | 38% | Charge withdrawn or administrative closure |\n| Settlement (pre-lawsuit) | 22% | EEOC conciliation or direct settlement |\n| Lawsuit Voluntary Dismissal | 12% | Fed. R. Civ. P. 41(a) |\n| Summary Judgment (Defense) | 11% | Pre-trial adjudication |\n| Settlement (during lawsuit) | 12% | Most common lawsuit resolution |\n| Defense Verdict at Trial | 3% | |\n| Plaintiff Verdict at Trial | 2% | |\n\n## Cost Benchmarks by Matter Type\n| Matter Type | Avg. Total Cost | Median | 75th Percentile |\n|---|---|---|---|\n| EEOC Charge (no-lawsuit) | $9,200 | $7,800 | $14,500 |\n| Lawsuit — Settled Pre-Discovery | $28,500 | $22,000 | $38,000 |\n| Lawsuit — Settled During Discovery | $58,000 | $51,000 | $78,000 |\n| Lawsuit — Settled Post-MSJ | $85,000 | $75,000 | $110,000 |\n| Lawsuit — Trial (Defense Win) | $145,000 | $128,000 | $185,000 |\n| Lawsuit — Trial (Plaintiff Win) | $200,000+ | $175,000 | $280,000 |\n\n## Cost Benchmarks by Litigation Phase\n| Phase | % of Total Budget | Key Cost Driver |\n|---|---|---|\n| Intake & Charge Response | 5-8% | Position statement prep |\n| Pleadings | 3-6% | Answer, motions to dismiss |\n| Written Discovery | 18-22% | Document review, privilege log |\n| Depositions | 25-35% | Court reporter, prep time |\n| Expert Witnesses | 8-15% | Retained expert fees + deposition |\n| Dispositive Motions | 12-18% | Brief drafting |\n| Trial Preparation | 15-25% | If case reaches trial |\n\n## Settlement Ranges by Claim Type (CaseSmart Medians)\n| Claim Type | Floor (25th %ile) | Median | Ceiling (75th %ile) |\n|---|---|---|---|\n| Race Discrimination (termination) | $18,000 | $42,000 | $87,000 |\n| Sex Discrimination (termination) | $20,000 | $48,000 | $95,000 |\n| Sexual Harassment (supervisor) | $25,000 | $65,000 | $135,000 |\n| Age Discrimination (ADEA, termination) | $30,000 | $78,000 | $165,000 |\n| ADA (failure to accommodate) | $15,000 | $38,000 | $80,000 |\n| Retaliation (Title VII) | $22,000 | $55,000 | $115,000 |\n| FLSA (single plaintiff) | $8,000 | $22,000 | $55,000 |\n| FLSA (collective action, <25 plaintiffs) | $85,000 | $220,000 | $650,000 |\n\n## Cycle Time Benchmarks\n| Matter Stage | Avg. Duration |\n|---|---|---|\n| EEOC Charge to Right-to-Sue | 14-18 months |\n| Charge to Dismissal (no lawsuit) | 8-14 months |\n| Lawsuit filing to close (settled pre-discovery) | 4-8 months |\n| Lawsuit filing to close (settled mid-discovery) | 12-20 months |\n| Lawsuit to trial | 24-42 months |\n\n## Dispositive Motion Statistics\n- Summary judgment granted (full): 28% of motions filed\n- Summary judgment granted (partial): 18% of motions filed\n- Summary judgment denied: 54% of motions filed\n- 12(b)(6) motion granted: 22% of motions filed\n- Best circuits for summary judgment: 5th Cir. (45%), 6th Cir. (41%), 11th Cir. (39%)\n- Worst circuits for summary judgment: 9th Cir. (25%), 1st Cir. (27%)\n`,
  },
  {
    title: "EEOC Charge Response Templates — Position Statements by Claim Type and Jurisdiction",
    tags: ["EEOC", "position-statement", "charge-response", "templates", "jurisdiction", "LIT-AGT-004"],
    metadata: { source: "Littler Mendelson EEOC Practice Group", type: "response-templates", lastUpdated: "2024-01-01" },
    content: `# EEOC Charge Response Templates — Position Statements by Claim Type and Jurisdiction\n\n## EEOC Position Statement Requirements (EEOC 2016 Enforcement Guidance)\n\n### Format Requirements\n1. Organized, easy-to-read, with headings\n2. No personal information about non-charging parties (use titles/roles if not relevant to charge)\n3. Confidential business information: request confidentiality designation\n4. Supporting documents: attach and index\n5. Submitted within 30 days (extendable once to 60 days)\n\n### Required Components (All Position Statements)\n1. **Respondent Overview**: Company name, size, location, industry, structure\n2. **Charging Party's Employment History**: Dates, positions, performance history\n3. **Response to Each Allegation**: Address every allegation factually (do not ignore any)\n4. **Legitimate, Non-Discriminatory Reason**: For all adverse actions (document-backed)\n5. **Supporting Documents Index**: List all exhibits\n\n## Template Structure by Claim Type\n\n### Race / Color Discrimination (Title VII §703)\n**Section I: Respondent Overview**\n[Company name] is a [industry] company with [N] employees in [state]. Respondent is an equal opportunity employer...\n\n**Section II: Charging Party's Employment History**\nChargingParty was employed by Respondent from [date] to [date] as [title] in [department]...\nPerformance history: [annual review dates, ratings, documented PIPs, commendations]\n\n**Section III: Response to Discrimination Allegation**\nChargingParty was [terminated/demoted/not promoted] on [date] for the following legitimate, non-discriminatory reason(s): [specific documented business reason]. This decision was made by [title] based on [documented criteria]. Respondent did not treat ChargingParty differently from similarly situated employees outside the protected class...\n\n**Section IV: Comparator Analysis**\nEmployees in [ChargingParty's role] who [engaged in similar conduct] and are not of the same protected class were treated as follows: [comparator analysis, if favorable]...\n\n**Exhibits**: A: Job description; B: Performance reviews; C: Termination documentation; D: Policy; E: Comparator data (if favorable)\n\n### Sexual Harassment (Title VII §703(a)(1))\n**Section I-II**: Same as above\n\n**Section III: Response to Harassment Allegation**\nRespondent denies that ChargingParty was subjected to a hostile work environment...\n\n**Section IV: Anti-Harassment Policy and Reporting Channels**\nRespondent has a written anti-harassment policy (Exhibit A) that: (a) prohibits harassment; (b) provides multiple reporting channels; (c) prohibits retaliation; (d) has been distributed to all employees...\n\n**Section V: Respondent's Investigation**\nUpon receipt of ChargingParty's complaint on [date], Respondent promptly investigated. The investigation was conducted by [neutral investigator, title], who interviewed [N] witnesses and reviewed [documents]. Investigation conclusion: [findings]. Corrective action: [if applicable]...\n\n**Faragher/Ellerth Defense**: Respondent exercised reasonable care to prevent and promptly correct harassing behavior. ChargingParty unreasonably failed to take advantage of corrective opportunities provided by Respondent...\n\n### Age Discrimination (ADEA §4)\n**Additional Section**: Respondent's Workforce Demographics\n[Age distribution of workforce; ages of employees retained in same role; age of replacement if applicable; OWBPA analysis if RIF involved]\n\n**Section**: Gross v. FBL Analysis\nRespondent's adverse action was not motivated by ChargingParty's age. The decision would have been made regardless of age. [Evidence that age was not the but-for cause]...\n\n## Jurisdiction-Specific Requirements\n- **California DFEH/CRD**: 150-day timeline; additional state law responses for FEHA; PDLL must be addressed separately\n- **New York SDHR**: 60-day timeline; 2019 NYSHRL amendments require response to expanded harassment standard\n- **Illinois IDHR**: 300-day filing deadline; IHRA policy and training compliance must be documented\n- **Federal EEOC**: 30-day initial response; mediation offer evaluation mandatory\n\n## Common Position Statement Mistakes (Avoid)\n1. Failing to address every allegation (gives impression of conceding unaddressed claims)\n2. Providing employee discipline records for ALL employees (overly broad, PII concerns)\n3. Stating conclusions without evidence (EEOC will probe unsupported assertions)\n4. Hostile or argumentative tone (signals litigation risk to EEOC)\n5. Inconsistent factual statements with investigation record\n`,
  },
  {
    title: "Dispositive Motion Brief Bank — Summary Judgment and Motion to Dismiss Precedents",
    tags: ["summary-judgment", "motion-to-dismiss", "FRCP-12b6", "FRCP-56", "dispositive-motions", "brief-bank", "LIT-AGT-004"],
    metadata: { source: "Littler Mendelson Brief Bank", type: "brief-precedents", lastUpdated: "2024-01-01" },
    content: `# Dispositive Motion Brief Bank — Summary Judgment and Motion to Dismiss Precedents\n\n## Summary Judgment Standard (FRCP 56)\n\n### Legal Standard\n"The court shall grant summary judgment if the movant shows that there is no genuine dispute as to any material fact and the movant is entitled to judgment as a matter of law." Fed. R. Civ. P. 56(a).\n\nKey citation: Celotex Corp. v. Catrett, 477 U.S. 317, 322 (1986) — party seeking summary judgment bears initial burden of demonstrating absence of genuine dispute.\n\nOnce met: Non-movant must present specific facts showing genuine issue for trial. Anderson v. Liberty Lobby, Inc., 477 U.S. 242, 248 (1986).\n\nCourt views facts in light most favorable to non-movant. Matsushita Elec. Indus. Co. v. Zenith Radio Corp., 475 U.S. 574, 587 (1986).\n\n## Best Summary Judgment Arguments by Claim Type\n\n### Race/Sex/National Origin Discrimination (Title VII)\n1. **No Adverse Action**: Plaintiff's complained-of treatment does not constitute a materially adverse employment action. See, e.g., Harlston v. McDonnell Douglas Corp. (no adverse action for lateral transfer without pay reduction).\n2. **Plaintiff Cannot Establish Prima Facie Case**: Plaintiff cannot show (a) membership in protected class, (b) qualification, (c) adverse action, (d) circumstances giving rise to inference.\n3. **Legitimate Non-Discriminatory Reason**: Employer has articulated clear, specific, documented LNDR.\n4. **No Pretext**: Plaintiff cannot demonstrate that LNDR is false or discriminatory animus was real reason. St. Mary's Honor Ctr. v. Hicks, 509 U.S. 502 (1993).\n5. **Same-Actor Inference**: Same individual who hired plaintiff terminated plaintiff, negating discriminatory animus. Proud v. Stone (8th Cir. 1990).\n6. **No Causal Connection**: No temporal proximity or other nexus between protected characteristic and adverse action.\n\n### Age Discrimination (ADEA)\n1. **Gross v. FBL But-For Standard**: Plaintiff must show age was the but-for cause of adverse action — not merely a motivating factor. Gross v. FBL Fin. Servs., 557 U.S. 167 (2009).\n2. **Hazen Paper Distinction**: Employer action based on factor correlated with age (salary, pension, seniority) ≠ age discrimination. Hazen Paper Co. v. Biggins, 507 U.S. 604 (1993).\n3. **ADEA: No Mixed-Motive**: Mixed-motive analysis not available under ADEA. Gross, 557 U.S. at 175.\n4. **RIF ADEA Defense**: Reduction-in-force was based on objective, non-discriminatory criteria; statistical evidence does not support age-based targeting.\n\n### Sexual Harassment (Title VII)\n1. **Conduct Not Severe or Pervasive**: Alleged conduct does not meet the "severe or pervasive" standard under Harris v. Forklift Systems, 510 U.S. 17 (1993).\n2. **Faragher/Ellerth Affirmative Defense** (supervisor harassment, no tangible action): (a) Employer exercised reasonable care to prevent and correct harassing behavior (policy, training, reporting channels); (b) Plaintiff unreasonably failed to use preventive opportunities. Faragher v. City of Boca Raton, 524 U.S. 775 (1998); Burlington Indus. v. Ellerth, 524 U.S. 742 (1998).\n3. **No Employer Liability** (co-worker): Employer did not know and should not have known of harassment.\n\n### Retaliation (Title VII)\n1. **No Protected Activity**: Plaintiff's complaint was not a protected activity under §704(a) (must have objectively reasonable belief of unlawful employment practice).\n2. **No Materially Adverse Action**: Alleged retaliatory action would not dissuade reasonable employee from complaining. Burlington N. & Santa Fe Ry. v. White, 548 U.S. 53 (2006).\n3. **No But-For Causation**: Temporal proximity alone insufficient; Univ. of Tex. Sw. Med. Ctr. v. Nassar, 570 U.S. 338 (2013) (but-for causation required for Title VII retaliation).\n4. **Same Decision Regardless**: Employer would have taken same action regardless of protected activity.\n\n## Motion to Dismiss Standard (FRCP 12(b)(6))\n\n### Legal Standard\n- Ashcroft v. Iqbal, 556 U.S. 662 (2009) + Bell Atl. Corp. v. Twombly, 550 U.S. 544 (2007): plausibility standard\n- Two-step: (1) identify legal conclusions not assumed true; (2) are factual allegations sufficient to state plausible claim?\n- Plausible: more than possible; court draws on experience and common sense\n\n### Employment Discrimination 12(b)(6) — Key Points\n- Swierkiewicz v. Sorema, 534 U.S. 506 (2002): McDonnell Douglas is evidentiary standard, not pleading standard\n- Post-Iqbal: Must plead sufficient facts to make discrimination "plausible"\n- Most 12(b)(6) motions in discrimination cases fail; FRCP 12(b)(6) is not the usual vehicle\n- Best candidates: Failure to exhaust EEOC charge (jurisdictional), time-barred allegations, sovereign immunity, release and settlement defense\n\n## Winning Brief Structure (Littler Standard)\n1. Introduction: 1 paragraph — why defendant wins as matter of law\n2. Background Facts: Neutral, favorable to defendant, document-cited\n3. Standard of Review: Correct legal standard with key citations\n4. Argument: Per-claim analysis; strongest argument first\n5. Conclusion: Short, specific request for relief\n`,
  },
  {
    title: "Settlement Valuation Database — Ranges by Claim Type, Jurisdiction, Industry & Case Facts",
    tags: ["settlement-valuation", "damages", "claim-type", "jurisdiction", "settlement-range", "LIT-AGT-004"],
    metadata: { source: "Littler Mendelson CaseSmart + Verdict Research", type: "settlement-database", lastUpdated: "2024-01-01" },
    content: `# Settlement Valuation Database — Ranges by Claim Type, Jurisdiction, Industry & Case Facts\n\n## Damages Framework by Statute\n\n### Title VII / ADA / ADAAA / PWFA\n**Capped Compensatory + Punitive Damages:**\n| Employer Size | Cap |\n|---|---|\n| 15-100 employees | $50,000 |\n| 101-200 employees | $100,000 |\n| 201-500 employees | $200,000 |\n| 500+ employees | $300,000 |\n\nAdditional available: Backpay (2 years from charge; unlimited from lawsuit), Front pay (equitable, unlimited), Reinstatement, Attorney's fees\n\n### ADEA\n- Backpay: Unlimited\n- Liquidated Damages: Equal to backpay (if willful violation) — effectively doubles award\n- No compensatory or punitive damages\n- Attorney's fees available\n\n### Section 1981 (Race / Ethnicity Only)\n- No damages cap — unlimited compensatory AND punitive\n- Attorney's fees available\n- 4-year statute of limitations\n- Applies to all private parties (no employer size threshold)\n\n### FLSA\n- Backpay: Full unpaid wages\n- Liquidated Damages: Equal to backpay (unless employer shows good faith — rare)\n- Effectively doubles backpay amount\n- Attorney's fees mandatory if plaintiff prevails\n- 2 years (3 years if willful)\n\n## Settlement Ranges by Claim Type and Jurisdiction\n\n### Race Discrimination — Termination\n| Circuit | Floor | Median | Ceiling |\n|---|---|---|---|\n| 9th Circuit (CA) | $35,000 | $75,000 | $180,000 |\n| 2nd Circuit (NY) | $30,000 | $68,000 | $165,000 |\n| 7th Circuit (IL) | $22,000 | $50,000 | $120,000 |\n| 5th Circuit (TX) | $15,000 | $38,000 | $90,000 |\n| 11th Circuit (FL/GA/AL) | $18,000 | $42,000 | $95,000 |\n\n*Section 1981 claims increase ceiling by 40-80% (no damages cap)*\n\n### Sexual Harassment — Supervisor\n| Severity | Floor | Median | Ceiling |\n|---|---|---|---|\n| Verbal only (isolated) | $8,000 | $22,000 | $55,000 |\n| Verbal (pattern) | $20,000 | $48,000 | $110,000 |\n| Physical (non-assault) | $35,000 | $85,000 | $200,000 |\n| Physical assault | $75,000 | $180,000 | $500,000+ |\n| QP quid pro quo (tangible action) | $50,000 | $120,000 | $350,000 |\n\n### Age Discrimination (ADEA) — RIF\n| Employee Age | Floor | Median | Ceiling |\n|---|---|---|---|\n| 40-50 years | $20,000 | $55,000 | $130,000 |\n| 51-60 years | $30,000 | $85,000 | $200,000 |\n| 60+ years | $45,000 | $115,000 | $280,000 |\n| Senior executive | $100,000 | $275,000 | $750,000+ |\n*ADEA liquidated damages (willful) doubles all figures above*\n\n## Adjustment Factors\n\n### Upward Adjustments\n- Particularly egregious facts (+20-50%)\n- Sympathy witness (+10-30%)\n- Hostile/unfavorable judge assignment (+15-25%)\n- Plaintiff's attorney: known aggressive litigator (+10-20%)\n- Strong documentary evidence (emails, text) (+20-40%)\n- Recurring/pattern problem at employer (+15-30%)\n- Media/reputational risk (+25-50%)\n\n### Downward Adjustments\n- Weak plaintiff credibility (-15-30%)\n- After-acquired evidence (discovery of misconduct) (-20-40%)\n- Plaintiff's failure to mitigate (-10-25%)\n- Favorable judge assignment (-10-20%)\n- Strong summary judgment prospect (-20-40%)\n- Plaintiff's own documented performance issues (-15-30%)\n- Short tenure (<6 months) with minimal backpay (-10-25%)\n\n## Attorney Fee Component\n- Title VII §706(k): Prevailing plaintiff entitled to fees; rare "objectively frivolous" standard for defense fees\n- FLSA §16(b): Mandatory fee award for plaintiff\n- Average plaintiff attorney fees in employment discrimination: $75K-$250K (contested cases)\n- Fee multipliers: Lodestar method; 2x-3x multiplier possible in complex cases\n- Fees often equal or exceed damages in small-dollar discrimination cases (settlement driver)\n\n## CaseSmart Settlement Authority Benchmarks\n- Authority requests within range: approved in 48 hours\n- Authority requests 25% above range: partner approval required\n- Authority requests 50% above range: senior partner + client executive approval\n- Trial authority: General Counsel must approve all trial decisions\n`,
  },
  {
    title: "Litigation Cost Benchmarks — Average Spend by Phase, Claim Type, and Complexity Level",
    tags: ["cost-benchmarks", "litigation-budget", "phase-costs", "AFA-pricing", "budget-management", "LIT-AGT-004"],
    metadata: { source: "Littler Mendelson CaseSmart Benchmarking Database", type: "cost-benchmarks", lastUpdated: "2024-01-01" },
    content: `# Litigation Cost Benchmarks — Average Spend by Phase, Claim Type, and Complexity Level\n\n## Matter Complexity Tiers\n\n### Tier 1 — Standard (EEOC Charge / Simple Lawsuit)\n- Single plaintiff, single claim\n- No class allegations\n- Routine discovery (< 5 depositions)\n- Clear LNDR defense\n- **Total cost benchmark**: $15,000-$45,000\n\n### Tier 2 — Moderate Complexity\n- Multiple claims, single plaintiff\n- Competing versions of facts\n- 5-15 depositions\n- Expert witnesses likely\n- **Total cost benchmark**: $50,000-$120,000\n\n### Tier 3 — High Complexity\n- Systemic claims or pattern evidence\n- 15+ depositions\n- Multiple experts\n- Class or collective action potential\n- **Total cost benchmark**: $150,000-$400,000+\n\n## Phase-by-Phase Cost Benchmarks (Tier 1 / Tier 2 / Tier 3)\n\n### Intake & Matter Opening\n- Conflict check, charge analysis, initial assessment memo\n- T1: $1,800-$3,500 | T2: $3,000-$6,000 | T3: $5,000-$10,000\n\n### EEOC Response / Pleadings\n- Position statement OR answer to complaint (not both for early matters)\n- T1: $3,500-$7,000 | T2: $6,000-$12,000 | T3: $10,000-$20,000\n\n### Written Discovery\n- Interrogatories, document requests, document review, privilege log\n- T1: $5,000-$12,000 | T2: $12,000-$35,000 | T3: $35,000-$100,000+\n\n### Depositions\n- Includes preparation, travel, court reporter, review of transcript\n- Per deposition: $3,500-$8,500 (partner) / $2,000-$4,500 (associate)\n- T1 (avg. 3 deps): $10,000-$22,000 | T2 (avg. 8 deps): $25,000-$60,000 | T3 (avg. 18 deps): $60,000-$150,000\n\n### Expert Witnesses\n- Economic damages expert: $15,000-$45,000 (report + deposition)\n- Vocational rehabilitation expert: $8,000-$20,000\n- Industry practice expert: $15,000-$35,000\n- T1: Often none | T2: $15,000-$45,000 | T3: $45,000-$120,000\n\n### Dispositive Motions\n- Summary judgment brief (opening + reply)\n- T1: $12,000-$22,000 | T2: $20,000-$45,000 | T3: $40,000-$85,000\n\n### Trial Preparation & Trial\n- Trial preparation: 2-4x anticipated trial days in attorney hours\n- Per day of trial: $8,000-$18,000 (lead counsel team)\n- T1: $35,000-$65,000 | T2: $75,000-$150,000 | T3: $150,000-$350,000+\n\n## AFA Pricing Models\n\n### Fixed Fee per Matter (EEOC Charge Only)\n- Simple charge (single claim): $6,500-$9,500\n- Complex charge (multiple claims, harassment): $9,500-$14,500\n- High-risk charge (executive respondent, media risk): $14,500-$22,000\n\n### Fixed Fee per Phase (Lawsuit)\n- Phase 1 (Pleadings): $8,000-$15,000\n- Phase 2 (Discovery): $35,000-$80,000 (based on complexity estimate)\n- Phase 3 (Motions): $18,000-$45,000\n- Phase 4 (Trial): Hourly (too variable for fixed fee)\n\n### Portfolio Pricing (Annual Volume)\n- 50-100 charges/year: 12-18% discount on standard rates\n- 100-250 charges/year: 18-25% discount + dedicated team\n- 250+ charges/year: Custom arrangement; dedicated unit pricing\n\n## Insurance Carrier Budget Guidelines\n- Initial reserve: Set within 30 days of assignment\n- Reserve adequacy review: At each phase transition\n- Pre-authorization threshold: Typically 10-20% of reserve\n- Deposition pre-authorization: Required by most carriers (24-48 hour turnaround)\n- Expert retention: Pre-authorization always required\n- Trial budget: Separate carrier approval; reserve increase mandatory\n`,
  },
  {
    title: "Court-Specific Local Rules and Standing Order Reference Database",
    tags: ["local-rules", "standing-orders", "FRCP", "e-filing", "court-procedures", "jurisdiction", "LIT-AGT-004"],
    metadata: { source: "Littler Mendelson Court Rules Reference Database", type: "court-rules", lastUpdated: "2024-01-01" },
    content: `# Court-Specific Local Rules and Standing Order Reference Database\n\n## Federal Court General Requirements (FRCP)\n\n### Pleadings\n- FRCP 8(a): Short and plain statement of the claim; demand for relief\n- FRCP 12(a): 21-day answer deadline (individual); 60 days (United States)\n- FRCP 10: Numbered paragraphs, separate counts for separate claims\n- FRCP 11: Attorney certification of non-frivolous filings\n\n### Discovery (FRCP 26-37)\n- FRCP 26(a)(1): Initial disclosures within 14 days of Rule 26(f) conference\n- FRCP 26(a)(2): Expert disclosures per scheduling order (plaintiff first; defendant 30 days after)\n- FRCP 33: 25 interrogatory limit per party (including subparts) without leave\n- FRCP 34: 30-day response to document requests\n- FRCP 36: 30-day response to requests for admission\n- FRCP 30(a)(2): 10 deposition limit per side without leave\n- FRCP 30(d)(1): 7-hour deposition limit per day\n- FRCP 37(e): Sanctions for ESI spoliation (curative measures or adverse inference if prejudice; dismissal/default if intent to deprive)\n\n### Case Management\n- FRCP 16: Scheduling conferences and orders; modification requires good cause\n- FRCP 26(f): Parties must confer at least 21 days before scheduling conference\n- FRCP 56: Summary judgment — 21-day response time (or per local rules)\n\n## High-Volume Employment Litigation Districts\n\n### S.D.N.Y. (Manhattan)\n- Individual Practices: All judges have individual practices — CHECK before filing\n- Page limits: Most judges: 25 pages for principal briefs, 10 pages for reply\n- Pre-motion conference: Required by most SDNY judges before motion to dismiss\n- E-filing: ECF mandatory; same-day filing of courtesy copy required for many judges\n- Discovery: Local Rule 37.2 — mandatory meet-and-confer before discovery motion\n\n### N.D. Cal. (San Francisco / San Jose / Oakland)\n- Standing orders: Comprehensive; ESI protocol required in all cases\n- Page limits: 25 pages (opposition); 15 pages (reply); strict\n- Discovery motions: Joint letter format (5 pages max) before motion filed\n- Class actions: CAND requires early case management conference for class cases\n- E-filing: ECF mandatory; proposed orders required in Word format\n\n### C.D. Cal. (Los Angeles)\n- Form interrogatories: California Form Interrogatories widely used in employment cases\n- Civil L.R. 7: 28-day response to motions (not 21 days per FRCP)\n- Standing orders: Required joint report per G Order in scheduling\n- ADR: Mandatory ADR program; select ADR procedure within 30 days of scheduling conference\n\n### N.D. Ill. (Chicago)\n- LR 37.2: Meet-and-confer required; certification required with discovery motions\n- Page limits: 15 pages (opening), 10 pages (response), 5 pages (reply) — shorter than most\n- Standing orders: Varies by judge — check individual standing orders\n- Jury instructions: Use 7th Circuit pattern instructions\n\n### S.D. Tex. (Houston)\n- Scheduling order: Court enters detailed scheduling order at outset\n- Discovery: Court-imposed limits on interrogatories, depositions, document requests\n- Pre-trial: Detailed pre-trial order required with exhibit and witness lists\n- E-filing: ECF mandatory; check judge's page/format requirements\n\n### N.D. Ga. (Atlanta)\n- LR 7.1: 5-day requirement for certificate of compliance with page limits\n- Discovery: Letter to magistrate before discovery motion\n- Employment cases: Often assigned to magistrates for discovery\n- Standing orders: Check per judge — many have comprehensive pre-trial orders\n\n## E-Filing Requirements (Universal)\n- All federal district courts: ECF mandatory for attorneys\n- Format: PDF (text-searchable, not scanned image), unless otherwise ordered\n- File size: Typically 10 MB per document; split large exhibits\n- Proposed orders: Word format (.docx) emailed to judge's chambers\n- Signature: s/[Attorney Name] format for electronic signatures\n- Sealing: Motion to seal required; do NOT file sensitive documents without court approval\n\n## State Court Key Differences (Employment Cases)\n\n### California (Superior Court)\n- FEHA claims: CRD exhaustion required before filing lawsuit; 1-year from right-to-sue\n- PAGA claims: No class certification required; representative action standing\n- E-filing: Mandatory in most California counties for civil cases\n- Discovery: No mandatory initial disclosures (unlike federal); more liberal scope\n\n### New York (Supreme Court)\n- NYSHRL claims: 3-year statute of limitations; can file without agency exhaustion\n- IAS system: Assigned to single judge for lifetime of case\n- E-filing: NYSCEF mandatory in most commercial/civil cases\n- Discovery: CPLR 3101 — broad discovery; different objection standards\n\n### Illinois (Circuit Court)\n- IHRA claims: Right-to-sue after IDHR investigation or opt-out after 365 days\n- Cook County: Mandatory e-filing through Odyssey system\n- Discovery: Illinois Supreme Court Rules govern; significant differences from FRCP\n`,
  },
];

// ══════════════════════════════════════════════════════════════════════════════
//  DATA — 6 RUNBOOKS  (Section 5.6)
// ══════════════════════════════════════════════════════════════════════════════

const RUNBOOKS = [
  {
    organizationId: ORG,
    name: "Missed Deadline Alert — Emergency Motion and Malpractice Notification Procedure",
    description: "Emergency response procedure for missed or imminent litigation deadlines. Covers emergency motion practice, court notification, malpractice carrier reporting, client notification, root cause analysis, and corrective measures. Applies to all matter types (EEOC, lawsuit) and all deadline types.",
    industry: "legal_services",
    category: "emergency",
    triggerType: "automatic",
    triggerConditions: [
      { type: "event", event: "deadline_missed", source: "deadline_management_system", threshold: "any_missed_deadline" },
      { type: "event", event: "deadline_imminent_24hrs", source: "deadline_management_system", threshold: "critical_deadline_24hr" },
    ],
    steps: [
      { id: "1", type: "action", action: "immediate_escalation", label: "Immediately notify responsible attorney and supervising partner via phone (not email only)", order: 1 },
      { id: "2", type: "condition", condition: "deadline_type", label: "Is deadline jurisdictional (cannot be extended: 90-day right-to-sue, SOL)?", trueNext: "3", falseNext: "5", order: 2 },
      { id: "3", type: "action", action: "jurisdictional_assessment", label: "Jurisdictional deadline: assess equitable tolling grounds; consult malpractice counsel immediately", order: 3 },
      { id: "4", type: "action", action: "malpractice_notification", label: "Report to firm's professional liability insurer within required timeframe; preserve all communications", order: 4 },
      { id: "5", type: "action", action: "emergency_motion", label: "Non-jurisdictional: prepare emergency motion for extension; contact opposing counsel for consent", order: 5 },
      { id: "6", type: "action", action: "court_contact", label: "Contact court clerk or judge's chambers if emergency motion needed same day; follow standing orders", order: 6 },
      { id: "7", type: "action", action: "client_notification", label: "Notify client of deadline issue and corrective steps taken; document all communications", order: 7 },
      { id: "8", type: "approval_gate", label: "Partner and General Counsel must approve client notification language before sending", approvalLevel: "confirm_before", order: 8 },
      { id: "9", type: "action", action: "root_cause_analysis", label: "Conduct root cause analysis: calendar failure, attorney error, system failure; document findings", order: 9 },
      { id: "10", type: "action", action: "corrective_action", label: "Implement corrective action: calendar redundancy check, docketing audit, process improvement", order: 10 },
    ],
    approvalConfig: { requiredApprovers: ["supervising_partner", "general_counsel", "risk_management"], autoApproveAfterHours: null },
    confidentiality: "attorney_client_privileged",
    estimatedDuration: "Immediate — 24 hours",
    tags: ["missed-deadline", "emergency", "malpractice", "court-motion", "LIT-AGT-004"],
    metadata: { jurisdiction: "all", lastReviewed: "2024-01-01", nextReview: "2025-01-01" },
    agentId: null,
  },
  {
    organizationId: ORG,
    name: "Client Budget Overrun — Variance Analysis and Alternative Fee Renegotiation",
    description: "Procedure for identifying, escalating, and resolving litigation budget overruns. Covers variance analysis by phase, scope-of-work adjustment evaluation, alternative fee renegotiation with client, and insurance carrier reserve adjustment.",
    industry: "legal_services",
    category: "operations",
    triggerType: "automatic",
    triggerConditions: [
      { type: "threshold", metric: "budget_variance_percentage", operator: "gte", value: 20, source: "billing_system" },
      { type: "event", event: "budget_overrun_projected", source: "budget_management_skill", threshold: "variance_20pct" },
    ],
    steps: [
      { id: "1", type: "action", action: "variance_analysis", label: "Pull phase-by-phase spend breakdown; identify primary cost drivers vs. budget assumptions", order: 1 },
      { id: "2", type: "action", action: "scope_review", label: "Assess whether scope changed since budget set (new claims, new parties, expanded discovery)", order: 2 },
      { id: "3", type: "condition", condition: "scope_change", label: "Was cost increase driven by unforeseeable scope change vs. inefficiency?", trueNext: "4", falseNext: "6", order: 3 },
      { id: "4", type: "action", action: "change_order_documentation", label: "Document scope change with timeline; prepare change order narrative for client", order: 4 },
      { id: "5", type: "action", action: "supplemental_budget", label: "Prepare supplemental budget for new scope with phase breakdown and assumptions", order: 5 },
      { id: "6", type: "action", action: "efficiency_review", label: "Review timekeeper billing; identify inefficiencies; write off non-value-added time if appropriate", order: 6 },
      { id: "7", type: "action", action: "client_communication", label: "Schedule call with client to discuss variance; provide variance report with explanation and options", order: 7 },
      { id: "8", type: "action", action: "afa_renegotiation", label: "If AFA: present renegotiation options (scope reduction, phase repricing, hybrid arrangement)", order: 8 },
      { id: "9", type: "action", action: "carrier_notification", label: "Notify insurance carrier of reserve inadequacy; provide updated exposure and cost estimate", order: 9 },
      { id: "10", type: "action", action: "budget_reset", label: "Agree and document revised budget in matter management system; set new variance alerts", order: 10 },
    ],
    approvalConfig: { requiredApprovers: ["billing_partner", "client_contact"], autoApproveAfterHours: null },
    confidentiality: "client_confidential",
    estimatedDuration: "5-10 business days",
    tags: ["budget-overrun", "AFA", "variance-analysis", "client-communication", "LIT-AGT-004"],
    metadata: { jurisdiction: "all", lastReviewed: "2024-01-01", nextReview: "2025-01-01" },
    agentId: null,
  },
  {
    organizationId: ORG,
    name: "Mass Filing Event — Coordinated Defense Strategy and Resource Surge Plan",
    description: "Procedure for managing a mass filing event — simultaneous receipt of 10+ EEOC charges or lawsuits arising from common facts, policy, or alleged system-wide practice. Covers coordinated defense strategy, common answer templates, resource allocation surge, and class/collective action prevention.",
    industry: "legal_services",
    category: "operations",
    triggerType: "automatic",
    triggerConditions: [
      { type: "threshold", metric: "new_charges_same_employer_30_days", operator: "gte", value: 10, source: "matter_management" },
      { type: "event", event: "coordinated_mass_filing_detected", source: "charge_analysis_skill", threshold: "10_or_more_related_charges" },
    ],
    steps: [
      { id: "1", type: "action", action: "common_thread_analysis", label: "Identify common claims, factual threads, plaintiff attorney coordination, and alleged policy at issue", order: 1 },
      { id: "2", type: "action", action: "class_action_assessment", label: "Assess class/collective action risk: Rule 23 (discrimination) vs. FLSA §216(b) (wage/hour); conditional certification timing", order: 2 },
      { id: "3", type: "action", action: "senior_partner_escalation", label: "Escalate to senior litigation partner and client senior management immediately", order: 3 },
      { id: "4", type: "action", action: "coordinated_defense_team", label: "Assemble coordinated defense team: lead partner, dedicated associates, consistent briefing materials", order: 4 },
      { id: "5", type: "action", action: "common_answer_template", label: "Draft common answer template with customization points for each individual charge", order: 5 },
      { id: "6", type: "action", action: "document_preservation", label: "Issue comprehensive litigation hold covering all matters; single hold covering all related matters", order: 6 },
      { id: "7", type: "action", action: "eeoc_strategy", label: "Develop EEOC coordination strategy: individual responses or systemic defense? Request EEOC systemic investigation discussion?", order: 7 },
      { id: "8", type: "action", action: "resource_surge_plan", label: "Resource plan: additional attorneys, contract reviewers for document review; temporary staffing", order: 8 },
      { id: "9", type: "action", action: "insurance_notification", label: "Notify all relevant insurance carriers of mass filing; reserve adequacy review for each policy", order: 9 },
      { id: "10", type: "action", action: "client_strategy_meeting", label: "Conduct comprehensive client strategy meeting: defense philosophy, settlement approach, litigation budget", order: 10 },
    ],
    approvalConfig: { requiredApprovers: ["senior_litigation_partner", "client_general_counsel", "insurance_carrier_lead"], autoApproveAfterHours: null },
    confidentiality: "attorney_client_privileged",
    estimatedDuration: "14-30 days (ongoing)",
    tags: ["mass-filing", "class-action-prevention", "coordinated-defense", "resource-surge", "LIT-AGT-004"],
    metadata: { jurisdiction: "all", lastReviewed: "2024-01-01", nextReview: "2025-01-01" },
    agentId: null,
  },
  {
    organizationId: ORG,
    name: "Opposing Counsel Discovery Dispute — Meet-and-Confer and Motion Protocol",
    description: "Procedure for handling discovery disputes with opposing counsel, including meet-and-confer compliance, motion to compel or protective order preparation, ESI dispute resolution, and magistrate judge referral procedures.",
    industry: "legal_services",
    category: "litigation",
    triggerType: "manual",
    triggerConditions: [
      { type: "event", event: "discovery_dispute_identified", source: "matter_management", threshold: "any_discovery_dispute" },
    ],
    steps: [
      { id: "1", type: "action", action: "dispute_classification", label: "Classify dispute: deficient responses, privilege claims, ESI scope, deposition conduct, protective order", order: 1 },
      { id: "2", type: "action", action: "meet_and_confer_scheduling", label: "Send meet-and-confer letter within 3 business days; schedule conference per local rules (LR 37.2, etc.)", order: 2 },
      { id: "3", type: "action", action: "meet_and_confer_conduct", label: "Conduct meet-and-confer: document all discussions in detailed notes; seek narrow resolution", order: 3 },
      { id: "4", type: "condition", condition: "resolution", label: "Was dispute resolved at meet-and-confer?", trueNext: "5", falseNext: "6", order: 4 },
      { id: "5", type: "action", action: "resolution_confirmation", label: "Confirm resolution in writing to opposing counsel within 24 hours; update deadline calendar", order: 5 },
      { id: "6", type: "action", action: "court_procedure_check", label: "Check local rules and judge's standing order for discovery dispute procedure (letter vs. motion vs. informal conference)", order: 6 },
      { id: "7", type: "action", action: "motion_preparation", label: "Prepare motion to compel or motion for protective order per court requirements; include certification of meet-and-confer", order: 7 },
      { id: "8", type: "action", action: "magistrate_referral", label: "If referred to magistrate: comply with magistrate's specific procedures; expedited briefing is common", order: 8 },
      { id: "9", type: "action", action: "client_update", label: "Update client on discovery dispute status, cost projection for motion practice, and likely outcome", order: 9 },
      { id: "10", type: "action", action: "frcp37_sanctions", label: "If seeking sanctions: FRCP 37 requires prior motion to compel + order + violation; document carefully", order: 10 },
    ],
    approvalConfig: { requiredApprovers: ["lead_litigation_attorney", "billing_partner"], autoApproveAfterHours: 48 },
    confidentiality: "attorney_client_privileged",
    estimatedDuration: "5-21 days",
    tags: ["discovery-dispute", "meet-and-confer", "motion-to-compel", "protective-order", "ESI", "LIT-AGT-004"],
    metadata: { jurisdiction: "all", lastReviewed: "2024-01-01", nextReview: "2025-01-01" },
    agentId: null,
  },
  {
    organizationId: ORG,
    name: "Settlement Authority Expiration — Client Re-Engagement and Updated Assessment",
    description: "Procedure for handling expiration of settlement authority during active negotiations. Covers assessment update, client re-engagement, updated demand/offer analysis, and negotiation strategy adjustment.",
    industry: "legal_services",
    category: "litigation",
    triggerType: "automatic",
    triggerConditions: [
      { type: "event", event: "settlement_authority_expired", source: "matter_management", threshold: "authority_expiry_date_reached" },
      { type: "threshold", metric: "days_since_authority_granted", operator: "gte", value: 60, source: "matter_management" },
    ],
    steps: [
      { id: "1", type: "action", action: "case_status_review", label: "Pull current matter status: pending deadline, recent developments, plaintiff's negotiating posture", order: 1 },
      { id: "2", type: "action", action: "updated_assessment", label: "Run updated Case Assessment Skill: any new facts, ruling, or discovery that materially changes risk profile?", order: 2 },
      { id: "3", type: "action", action: "comparables_refresh", label: "Refresh comparables analysis: any new verdict data or settlement data from similar cases?", order: 3 },
      { id: "4", type: "action", action: "negotiation_summary", label: "Prepare settlement negotiation summary: demand/offer history, gaps remaining, plaintiff's stated positions", order: 4 },
      { id: "5", type: "action", action: "authority_recommendation", label: "Prepare attorney recommendation: maintain authority, increase authority, decrease authority, or walk to trial", order: 5 },
      { id: "6", type: "action", action: "carrier_engagement", label: "If insurance involved: carrier must approve new authority; prepare carrier briefing with updated reserve analysis", order: 6 },
      { id: "7", type: "action", action: "client_meeting", label: "Schedule client meeting (call or in person) to review updated assessment and obtain new authority", order: 7 },
      { id: "8", type: "action", action: "negotiation_strategy", label: "Develop updated negotiation strategy: timing, mediator use, bracket approach, structure options", order: 8 },
      { id: "9", type: "action", action: "documentation", label: "Document new authority level, expiration date, conditions, and carrier approval in matter file", order: 9 },
    ],
    approvalConfig: { requiredApprovers: ["lead_attorney", "client_general_counsel", "insurance_carrier_if_applicable"], autoApproveAfterHours: null },
    confidentiality: "attorney_client_privileged",
    estimatedDuration: "3-7 business days",
    tags: ["settlement-authority", "negotiation", "case-assessment", "client-engagement", "LIT-AGT-004"],
    metadata: { jurisdiction: "all", lastReviewed: "2024-01-01", nextReview: "2025-01-01" },
    agentId: null,
  },
  {
    organizationId: ORG,
    name: "Matter Staffing Change — Transition Checklist and Knowledge Transfer Protocol",
    description: "Procedure for managing attorney staffing changes on active litigation matters. Covers knowledge transfer, deadline calendar verification, client notification, opposing counsel notification where required, and competence continuity.",
    industry: "legal_services",
    category: "operations",
    triggerType: "manual",
    triggerConditions: [
      { type: "event", event: "attorney_departure_or_reassignment", source: "hr_matter_management", threshold: "any_staffing_change" },
    ],
    steps: [
      { id: "1", type: "action", action: "matter_audit", label: "Audit all open matters for departing attorney: open deadlines, pending tasks, court appearances, client commitments", order: 1 },
      { id: "2", type: "action", action: "deadline_verification", label: "Pull full deadline calendar for each matter; verify accuracy; no deadline should lack assigned attorney", order: 2 },
      { id: "3", type: "action", action: "transition_memo", label: "Departing attorney drafts transition memo per matter: status, strategy, key documents, open issues, client history", order: 3 },
      { id: "4", type: "action", action: "successor_briefing", label: "Successor attorney reviews transition memo and all key documents before client contact", order: 4 },
      { id: "5", type: "action", action: "client_notification", label: "Notify client of staffing change; introduction of successor; commitment to continuity", order: 5 },
      { id: "6", type: "condition", condition: "court_appearance_pending", label: "Is there an upcoming court appearance that requires substitution of counsel notice?", trueNext: "7", falseNext: "8", order: 6 },
      { id: "7", type: "action", action: "substitution_of_counsel", label: "File substitution of counsel notice per local rules; some courts require court approval", order: 7 },
      { id: "8", type: "action", action: "opposing_counsel_notification", label: "Notify opposing counsel of new lead attorney; update ECF contact information", order: 8 },
      { id: "9", type: "action", action: "billing_transition", label: "Update billing records: rates, timekeeper codes, billing guidelines; notify billing department", order: 9 },
      { id: "10", type: "action", action: "competence_verification", label: "Supervising partner confirms successor has competence and bandwidth for matter demands", order: 10 },
    ],
    approvalConfig: { requiredApprovers: ["supervising_partner", "client_contact_if_required"], autoApproveAfterHours: null },
    confidentiality: "internal",
    estimatedDuration: "5-14 days",
    tags: ["staffing-change", "knowledge-transfer", "transition", "substitution-of-counsel", "LIT-AGT-004"],
    metadata: { jurisdiction: "all", lastReviewed: "2024-01-01", nextReview: "2025-01-01" },
    agentId: null,
  },
];

// ══════════════════════════════════════════════════════════════════════════════
//  DATA — 6 GOVERNANCE POLICIES  (Section 5.7)
// ══════════════════════════════════════════════════════════════════════════════

const POLICIES = [
  {
    organizationId: ORG,
    name: "Federal Rules of Civil Procedure Compliance Policy",
    description: "Governs agent adherence to FRCP requirements for pleadings, discovery, motions, and trial. Ensures all litigation actions comply with applicable federal procedural rules and court-imposed deadlines.",
    domain: "content_boundaries",
    status: "active",
    version: 1,
    policyJson: {
      rules: [
        { id: "frcp-1", description: "All generated deadlines must cite specific FRCP rule and local rule basis; never generate a deadline without identifying the authorizing rule", severity: "CRITICAL", enforcement: "hard_block" },
        { id: "frcp-2", description: "Never recommend more than 25 interrogatories without flagging that leave of court is required under FRCP 33; note all discovery limits by type", severity: "HIGH", enforcement: "require_confirmation" },
        { id: "frcp-3", description: "All initial disclosure recommendations must comply with FRCP 26(a)(1); flag if scheduling conference has not yet occurred", severity: "HIGH", enforcement: "require_confirmation" },
        { id: "frcp-4", description: "FRCP 11 certification: never recommend filing any document without noting that attorney must certify good-faith basis for all factual and legal contentions", severity: "CRITICAL", enforcement: "hard_block" },
        { id: "frcp-5", description: "ESI preservation: flag FRCP 37(e) spoliation risk for any matter where potential evidence was not preserved after litigation was reasonably anticipated", severity: "CRITICAL", enforcement: "hard_block" },
        { id: "frcp-6", description: "Summary judgment analysis must apply Celotex/Anderson/Matsushita trilogy and circuit-specific standards; do not apply wrong circuit's summary judgment standard", severity: "HIGH", enforcement: "require_confirmation" },
      ],
      confidentiality: "Work product designation applies to all litigation strategy recommendations",
      citation_requirements: ["Fed. R. Civ. P.", "Local Rules (applicable district)", "Applicable circuit court authority"],
      escalation_policy: "Any FRCP violation risk requiring immediate court action requires supervising partner notification before any response.",
    },
    tags: ["FRCP", "civil-procedure", "discovery", "pleadings", "litigation-compliance"],
    effectiveDate: new Date().toISOString(),
    scopeId: null,
    scopeType: "agent",
  },
  {
    organizationId: ORG,
    name: "Local Court Rules and Standing Orders Compliance Policy",
    description: "Ensures the agent identifies and applies court-specific local rules, individual judge standing orders, and electronic filing requirements for every jurisdiction before generating procedural recommendations.",
    domain: "content_boundaries",
    status: "active",
    version: 1,
    policyJson: {
      rules: [
        { id: "local-1", description: "Before generating any procedural deadline or recommendation, identify the specific court and verify against stored local rules database; flag if court not in database", severity: "CRITICAL", enforcement: "hard_block" },
        { id: "local-2", description: "Individual judge standing orders take precedence over general local rules; always recommend checking individual judge's standing order before filing", severity: "CRITICAL", enforcement: "hard_block" },
        { id: "local-3", description: "Page limits and format requirements vary by court and judge; never generate a brief template without noting applicable page limit and format rule", severity: "HIGH", enforcement: "require_confirmation" },
        { id: "local-4", description: "E-filing requirements are mandatory in all federal courts; flag correct ECF procedure and PDF format requirements", severity: "HIGH", enforcement: "require_confirmation" },
        { id: "local-5", description: "Discovery motion procedure varies by district (letter, joint statement, full motion); flag correct procedure before recommending motion to compel", severity: "HIGH", enforcement: "require_confirmation" },
        { id: "local-6", description: "If court not in database, flag unknown local rules as HIGH risk; recommend manual verification before proceeding", severity: "HIGH", enforcement: "require_confirmation" },
      ],
      confidentiality: "Procedural advice is attorney work product",
      citation_requirements: ["Applicable District Court Local Rules", "Individual Judge Standing Orders", "Court's ECF User Manual"],
      escalation_policy: "Any unfamiliar court requires experienced local counsel review before filing.",
    },
    tags: ["local-rules", "standing-orders", "e-filing", "court-procedure"],
    effectiveDate: new Date().toISOString(),
    scopeId: null,
    scopeType: "agent",
  },
  {
    organizationId: ORG,
    name: "State Bar Ethics and Professional Responsibility Policy",
    description: "Governs agent compliance with Model Rules of Professional Conduct and applicable state bar ethics rules. Covers competent representation, communication obligations, conflict of interest management, candor to the tribunal, and supervisory responsibilities.",
    domain: "content_boundaries",
    status: "active",
    version: 1,
    policyJson: {
      rules: [
        { id: "ethics-1", description: "Conflict of interest: flag any matter where parties, claims, or counsel may create conflict under MRPC 1.7, 1.8, or 1.9; never proceed without conflict check", severity: "CRITICAL", enforcement: "hard_block" },
        { id: "ethics-2", description: "Candor to tribunal (MRPC 3.3): never recommend omitting controlling adverse authority from brief; always flag adverse authority that must be disclosed", severity: "CRITICAL", enforcement: "hard_block" },
        { id: "ethics-3", description: "Client communication (MRPC 1.4): all significant developments must be flagged for client notification; never recommend withholding material information from client", severity: "HIGH", enforcement: "require_confirmation" },
        { id: "ethics-4", description: "Competence (MRPC 1.1): flag when recommended strategy is in an area where supervising attorney should verify competence (e.g., ERISA, class actions, bankruptcy intersection)", severity: "HIGH", enforcement: "require_confirmation" },
        { id: "ethics-5", description: "Fee arrangements (MRPC 1.5): all AFA recommendations must comply with applicable state bar rules; contingency fees in litigation must follow state-specific requirements", severity: "HIGH", enforcement: "require_confirmation" },
        { id: "ethics-6", description: "Supervision (MRPC 5.1/5.3): all agent outputs require attorney review before any client-facing or court-filing action; agent cannot independently act on behalf of client", severity: "CRITICAL", enforcement: "hard_block" },
      ],
      confidentiality: "All matter information is attorney-client privileged; no disclosure without client consent",
      citation_requirements: ["Model Rules of Professional Conduct (ABA)", "Applicable state bar rules", "State ethics opinions"],
      escalation_policy: "Potential ethics violations require immediate escalation to firm's General Counsel and Risk Management.",
    },
    tags: ["ethics", "MRPC", "professional-responsibility", "conflict-of-interest", "candor"],
    effectiveDate: new Date().toISOString(),
    scopeId: null,
    scopeType: "agent",
  },
  {
    organizationId: ORG,
    name: "Client Reporting and Communication Requirements Policy",
    description: "Governs timely and accurate client reporting on matter status, budget, and significant developments. Covers insurance carrier reporting obligations, corporate legal department update requirements, and litigation hold procedures.",
    domain: "content_boundaries",
    status: "active",
    version: 1,
    policyJson: {
      rules: [
        { id: "client-rpt-1", description: "Significant developments must be flagged for immediate client notification: adverse rulings, trial dates, settlement demands, class certification motions, government involvement", severity: "CRITICAL", enforcement: "hard_block" },
        { id: "client-rpt-2", description: "Budget variance ≥20%: immediate client notification required; never allow budget to exceed 30% variance without client written acknowledgment", severity: "CRITICAL", enforcement: "hard_block" },
        { id: "client-rpt-3", description: "Insurance carrier reporting: pre-authorization required for depositions, expert retention, and motions; flag upcoming events requiring carrier approval ≥14 days before", severity: "HIGH", enforcement: "require_confirmation" },
        { id: "client-rpt-4", description: "Monthly status reports: all active matters must have a status report generated monthly; flag matters with no update in 45+ days as stale", severity: "MEDIUM", enforcement: "soft_warn" },
        { id: "client-rpt-5", description: "Litigation hold: flag requirement to issue/update litigation hold whenever new claim is received or new custodians identified; document hold compliance", severity: "CRITICAL", enforcement: "hard_block" },
        { id: "client-rpt-6", description: "Settlement authority: all settlement recommendations must include client authority analysis; never imply authority exists without confirming with client", severity: "CRITICAL", enforcement: "hard_block" },
      ],
      confidentiality: "Client reports are attorney-client privileged; carrier reports must be marked accordingly",
      citation_requirements: ["Engagement letter terms", "Insurance policy reporting requirements", "Applicable MRPC communication rules"],
      escalation_policy: "Failure to report significant development within required timeframe requires immediate risk management notification.",
    },
    tags: ["client-reporting", "insurance-carrier", "litigation-hold", "status-reports"],
    effectiveDate: new Date().toISOString(),
    scopeId: null,
    scopeType: "agent",
  },
  {
    organizationId: ORG,
    name: "Fee Arrangement Compliance and Billing Ethics Policy",
    description: "Governs ethical compliance with fee arrangements, billing practices, and cost management in employment litigation. Applies MRPC 1.5 standards to hourly, AFA, and contingency arrangements. Ensures transparency and accuracy in all billing representations.",
    domain: "content_boundaries",
    status: "active",
    version: 1,
    policyJson: {
      rules: [
        { id: "billing-1", description: "Never recommend billing practices that inflate hours or double-bill; flag any timekeeper billing pattern that exceeds reasonable time for task category", severity: "CRITICAL", enforcement: "hard_block" },
        { id: "billing-2", description: "AFA compliance: monitor actual scope against AFA assumptions; any scope expansion must trigger modification analysis before additional billing", severity: "HIGH", enforcement: "require_confirmation" },
        { id: "billing-3", description: "Attorney fee awards: when generating settlement analysis, calculate plaintiff's likely attorney fee claim under §706(k) or FLSA §16(b); include as settlement driver", severity: "HIGH", enforcement: "require_confirmation" },
        { id: "billing-4", description: "Contingency fee compliance: state bar rules vary on contingency fees in employment cases; California, New York, and other states have specific requirements; flag for review", severity: "HIGH", enforcement: "require_confirmation" },
        { id: "billing-5", description: "Billing guideline compliance: large institutional clients have specific billing guidelines (ABA, ACCA); flag any recommended action that may violate client billing guidelines", severity: "MEDIUM", enforcement: "soft_warn" },
        { id: "billing-6", description: "Write-offs: recommend appropriate write-offs for duplicative, excessive, or administrative time before bill submission; quality control before billing", severity: "MEDIUM", enforcement: "soft_warn" },
      ],
      confidentiality: "Billing records are attorney-client privileged and subject to attorney-client fee dispute arbitration",
      citation_requirements: ["MRPC 1.5", "ABA Formal Opinion 93-379 (billing practices)", "Applicable state bar opinions on billing"],
      escalation_policy: "Billing disputes or ethics complaints related to fees require immediate risk management and ethics counsel notification.",
    },
    tags: ["billing-ethics", "AFA", "fee-arrangements", "MRPC-1.5", "cost-management"],
    effectiveDate: new Date().toISOString(),
    scopeId: null,
    scopeType: "agent",
  },
  {
    organizationId: ORG,
    name: "E-Filing Requirements and Court-Specific Electronic Procedures Policy",
    description: "Ensures all filing recommendations comply with court-specific electronic filing requirements, format standards, sealing procedures, and proposed order submission requirements. Mandatory in all federal courts.",
    domain: "content_boundaries",
    status: "active",
    version: 1,
    policyJson: {
      rules: [
        { id: "efiling-1", description: "All federal court filings are ECF mandatory; flag any matter where attorney's ECF credentials are not verified before first filing", severity: "CRITICAL", enforcement: "hard_block" },
        { id: "efiling-2", description: "Confidential/sealed documents: never recommend ECF filing of sensitive documents (PII, trade secrets, medical records) without motion to seal and court approval first", severity: "CRITICAL", enforcement: "hard_block" },
        { id: "efiling-3", description: "PDF format: all ECF-filed documents must be text-searchable PDF (not scanned); flag any document that may not be text-searchable", severity: "HIGH", enforcement: "require_confirmation" },
        { id: "efiling-4", description: "Proposed orders: most courts require Word (.docx) format of proposed orders emailed to chambers; flag this requirement when recommending motion practice", severity: "HIGH", enforcement: "require_confirmation" },
        { id: "efiling-5", description: "Exhibits: large exhibits must be split per court's file size limits (typically 10 MB); flag exhibit filing strategy before generating document plan", severity: "MEDIUM", enforcement: "soft_warn" },
        { id: "efiling-6", description: "Signature pages: s/[Attorney Name] format for electronic signatures; verify bar membership and ECF registration in filing district before recommending signature", severity: "HIGH", enforcement: "require_confirmation" },
      ],
      confidentiality: "Court filings are public record unless sealed; sealing requires court order",
      citation_requirements: ["Applicable District Court ECF Administrative Procedures", "Local Rules on Electronic Filing", "Individual Judge Standing Orders"],
      escalation_policy: "Any ECF technical failure on a deadline day requires immediate escalation and court contact within the filing day.",
    },
    tags: ["e-filing", "ECF", "court-procedures", "PDF-format", "sealing"],
    effectiveDate: new Date().toISOString(),
    scopeId: null,
    scopeType: "agent",
  },
];

// ══════════════════════════════════════════════════════════════════════════════
//  DATA — GOLDEN DATASET + 6 TEST CASES  (Section 5.5)
// ══════════════════════════════════════════════════════════════════════════════

const GOLDEN_DATASET = {
  organizationId: ORG,
  name: "Litigation Case Management Agent — Golden Dataset",
  description: "Curated evaluation dataset for LIT-AGT-004. Covers charge analysis accuracy, deadline calculation, case strength assessment, budget management, comparables-based settlement valuation, and mass filing scenarios. Validated against Littler CaseSmart historical matter data and senior litigation partner review.",
  industry: "legal_services",
  useCase: "Litigation Case Management",
  version: "1.0",
  scenarioCategories: { edgeCases: 1, happyPath: 1, adversarial: 1, complianceCritical: 3 },
  qualityCoverage: 94,
  coverageDimensions: [
    "EEOC charge analysis: claim extraction, statute identification, relief mapping",
    "Deadline calculation accuracy: FRCP + local rules + holiday adjustments",
    "Case assessment: claim viability scoring, defense strength analysis, outcome prediction",
    "Budget tracking: phase-by-phase spend vs. budget, variance flagging",
    "Settlement valuation: comparables-based range with adjustment factors",
    "Mass filing: coordinated defense, class action risk assessment",
    "Discovery dispute: meet-and-confer compliance, motion strategy",
    "After-acquired evidence doctrine application",
    "ADEA-specific: Gross v. FBL but-for causation + OWBPA compliance",
    "Section 1981 unlimited damages assessment in race discrimination cases",
  ],
  benchmarkRange: { low: 88, high: 96 },
  contributors: [],
  growthHistory: [],
  status: "active",
  tags: ["litigation", "EEOC", "case-management", "deadline-calculation", "settlement-valuation", "LIT-AGT-004"],
  aiGenerated: false,
  performanceBenchmarks: {
    chargeAnalysisAccuracy: { target: 0.97, description: "Claim type, statute, and relief extraction vs. experienced litigation paralegal ground truth" },
    deadlineCalculationAccuracy: { target: 0.995, description: "Computed deadlines vs. actual court-imposed deadlines; zero tolerance for missed EEOC/jurisdictional deadlines" },
    caseAssessmentReliability: { target: 0.85, description: "Early strength ratings correlated with actual outcome — settlement vs. dismissal vs. trial" },
    settlementValuationAccuracy: { target: 0.80, description: "Predicted settlement range accuracy: actual settlement within predicted range in 80%+ of matters" },
    budgetForecastAccuracy: { target: 0.85, description: "Phase-by-phase cost projections within 20% of actual spend in 85%+ of matters" },
  },
  dataRecordCount: 10000,
};

const TEST_CASES = [
  {
    name: "EEOC Sexual Harassment Charge — Multi-Claim Extraction and Deadline Analysis (S.D.N.Y.)",
    inputScenario: "Acme Corp (2,200 employees, New York) receives an EEOC charge from Maria Rodriguez. The charge, filed February 14, 2024 with the EEOC New York District Office, alleges: (1) sexual harassment by her supervisor over 18 months; (2) constructive discharge after she complained; (3) equal pay violation compared to male counterparts. The EEOC issues a notice of charge on February 20, 2024. Acme is self-insured with a $500K employment practices liability reserve.",
    expectedBehavior: "Extract all 3 claims (sexual harassment Title VII, retaliation/constructive discharge Title VII §704, EPA equal pay); identify correct statutes; calculate position statement due date (March 21, 2024 — 30 days from notice); flag that EPA claims can be filed directly without EEOC exhaustion; identify NY SDHR concurrent jurisdiction; flag constructive discharge requires showing conditions were objectively intolerable; recommend interim protective measures for supervisor",
    evaluationCriteria: [
      "All 3 claim types correctly identified with correct statutes",
      "Position statement deadline: March 21, 2024 (30 days from Feb 20)",
      "EPA direct filing noted (no EEOC exhaustion required)",
      "NY SDHR concurrent jurisdiction identified",
      "Constructive discharge elements flagged",
      "S.D.N.Y. local rules referenced for any lawsuit deadlines",
      "Insurance carrier notification flagged",
    ],
    rubricScoring: { dimensions: [{ name: "Claim Extraction", weight: 0.25, passingScore: 1.0 }, { name: "Deadline Calculation", weight: 0.30, passingScore: 1.0 }, { name: "Jurisdiction Analysis", weight: 0.20, passingScore: 0.90 }, { name: "Legal Standard Flags", weight: 0.15, passingScore: 0.85 }, { name: "Intake Documentation", weight: 0.10, passingScore: 0.85 }] },
    category: "complianceCritical",
    difficulty: "complex",
    jurisdiction: "S.D.N.Y. / EEOC New York District",
    sourceDocuments: ["Title VII 42 U.S.C. §2000e", "Equal Pay Act 29 U.S.C. §206(d)", "FRCP", "S.D.N.Y. Local Civil Rules"],
  },
  {
    name: "Single-Plaintiff ADEA Lawsuit — Case Assessment with OWBPA and Liquidated Damages",
    inputScenario: "Robert Chen (age 58) sues Midwest Manufacturing (800 employees, N.D. Ill.) for age discrimination and retaliation under the ADEA. He was terminated on January 5, 2024 in a stated 'restructuring' that eliminated his Director of Operations role. He alleges: (1) age was the but-for cause; (2) he was replaced by a 34-year-old; (3) his ADEA charge was filed April 1, 2024; (4) he signed a severance agreement with an OWBPA waiver but claims he was not given 45 days to consider it; (5) he is seeking backpay, liquidated damages (willful violation claim), and attorney's fees.",
    expectedBehavior: "Apply Gross v. FBL but-for causation standard (no mixed-motive); flag OWBPA waiver defect (45-day consideration period mandatory — potentially invalid waiver); assess liquidated damages risk (willful = 2x backpay; 58-year-old Director salary likely $150K+ = $300K+ liquidated damages exposure); calculate statute of limitations (300 days from termination in IL = EEOC filing deadline); assess case strength noting 34-year-old replacement as strong prima facie evidence; identify N.D. Ill. local rules",
    evaluationCriteria: [
      "Gross v. FBL but-for causation applied (not mixed-motive)",
      "OWBPA 45-day consideration period defect identified",
      "Invalid waiver consequences analyzed (waiver unenforceable)",
      "Liquidated damages risk quantified (willful = 2x backpay)",
      "300-day IL EEOC filing deadline correctly applied",
      "34-year-old replacement = strong prima facie evidence noted",
      "N.D. Ill. local rules referenced",
    ],
    rubricScoring: { dimensions: [{ name: "ADEA Causation Standard", weight: 0.25, passingScore: 1.0 }, { name: "OWBPA Analysis", weight: 0.25, passingScore: 1.0 }, { name: "Damages Calculation", weight: 0.20, passingScore: 0.90 }, { name: "Case Strength Assessment", weight: 0.20, passingScore: 0.85 }, { name: "Deadline Analysis", weight: 0.10, passingScore: 1.0 }] },
    category: "complianceCritical",
    difficulty: "expert",
    jurisdiction: "N.D. Ill. (Federal ADEA)",
    sourceDocuments: ["ADEA 29 U.S.C. §§621-634", "OWBPA §626(f)", "Gross v. FBL Financial Services, 557 U.S. 167 (2009)"],
  },
  {
    name: "Race Discrimination Lawsuit — Section 1981 Unlimited Damages Assessment",
    inputScenario: "James Williams, Black senior software engineer (7 years tenure), sues TechCorp (10,000 employees, N.D. Cal.) for race discrimination under Title VII AND 42 U.S.C. §1981 after being passed over for Director role five times in 18 months. Each time, a white or Asian colleague with fewer years of experience was selected. He has compelling email evidence of a hiring manager using racially coded language ('culture fit' concerns despite Williams' highest performance ratings in department). He seeks compensatory damages, unlimited punitive damages (§1981 claim), and attorney's fees.",
    expectedBehavior: "Flag §1981 unlimited damages (no Title VII $300K cap) as primary exposure; assess punitive damages risk based on supervisor email (egregious conduct); calculate comparative case value: $500K-$2M+ realistic range given email evidence and repeated promotion denials; 9th Circuit standards (less favorable to defendant than 5th/6th); N.D. Cal. local rules; 4-year §1981 SOL (longer than Title VII 300-day EEOC exhaustion); assess Lilly Ledbetter application to recurring discriminatory decisions",
    evaluationCriteria: [
      "§1981 unlimited punitive damages risk quantified",
      "Title VII $300K cap vs. §1981 unlimited cap distinction",
      "9th Circuit less-favorable-to-defendant SJ standard noted",
      "Racially coded email identified as significant evidence",
      "4-year §1981 SOL vs. 300-day Title VII SOL distinguished",
      "Settlement range: $500K-$2M realistic (not generic range)",
      "N.D. Cal. ESI and local rules referenced",
    ],
    rubricScoring: { dimensions: [{ name: "Damages Framework (§1981 vs. Title VII)", weight: 0.30, passingScore: 1.0 }, { name: "Evidence Assessment", weight: 0.25, passingScore: 0.90 }, { name: "Settlement Valuation", weight: 0.20, passingScore: 0.85 }, { name: "Jurisdiction Analysis", weight: 0.15, passingScore: 0.85 }, { name: "SOL Analysis", weight: 0.10, passingScore: 1.0 }] },
    category: "complianceCritical",
    difficulty: "expert",
    jurisdiction: "N.D. Cal. (9th Circuit)",
    sourceDocuments: ["42 U.S.C. §1981", "Title VII 42 U.S.C. §2000e", "Kolstad v. American Dental Ass'n (punitive damages standard)"],
  },
  {
    name: "Mass Filing Event — 47 Coordinated EEOC Charges (FLSA Collective Action Risk)",
    inputScenario: "RetailChain Inc. (15,000 employees nationally) receives 47 EEOC charges over 30 days from workers in 12 stores across California and Texas, all represented by the same plaintiff firm. All charges allege (1) sex discrimination in manager promotion decisions; (2) wage violations (off-the-clock work, missed meal breaks under California law). The plaintiff firm sends a demand letter threatening a nationwide Title VII class action AND a California/Texas FLSA collective action. The charges span multiple EEOC district offices.",
    expectedBehavior: "Identify mass filing event trigger; distinguish Rule 23 class (Title VII) vs. FLSA §216(b) collective action (different certification standards); California state law wage claims require separate PAGA analysis; coordinated defense strategy with lead partner; common position statement approach with per-store customization; nationwide litigation hold; resource surge plan with dedicated team; identify which EEOC district offices and coordinate responses; FLSA 2-year (3-year willful) SOL vs. Title VII 300-day EEOC deadline timing",
    evaluationCriteria: [
      "Mass filing event correctly triggered",
      "Rule 23 class vs. FLSA §216(b) collective correctly distinguished",
      "California PAGA identified as separate threat",
      "Coordinated defense strategy recommended",
      "Multi-district EEOC coordination strategy",
      "Nationwide litigation hold recommended",
      "Resource surge plan outlined",
      "FLSA SOL vs. Title VII EEOC deadline timing distinguished",
    ],
    rubricScoring: { dimensions: [{ name: "Mass Filing Protocol", weight: 0.20, passingScore: 1.0 }, { name: "Class vs. Collective Distinction", weight: 0.25, passingScore: 1.0 }, { name: "PAGA/State Law Analysis", weight: 0.20, passingScore: 0.90 }, { name: "Resource and Strategy Plan", weight: 0.20, passingScore: 0.85 }, { name: "Document Preservation", weight: 0.15, passingScore: 1.0 }] },
    category: "adversarial",
    difficulty: "expert",
    jurisdiction: "Multiple (CA, TX, Federal)",
    sourceDocuments: ["Title VII 42 U.S.C. §2000e", "FLSA §216(b)", "FRCP 23", "California FEHA", "California PAGA"],
  },
  {
    name: "Discovery Dispute — ESI Privilege Logging and Scope Dispute (C.D. Cal.)",
    inputScenario: "In Rodriguez v. FinanceCo (C.D. Cal.), plaintiff's counsel moves to compel production of 2,400 documents withheld on attorney-client privilege and work product grounds. FinanceCo's privilege log lists general categories without individual document descriptions. Plaintiff argues the log is deficient under FRCP 26(b)(5) and seeks in camera review. The magistrate judge issues a standing order requiring all privilege log disputes to be raised via 5-page joint statement before any motion is heard.",
    expectedBehavior: "Identify C.D. Cal. magistrate judge's joint statement procedure as required first step; assess privilege log adequacy under FRCP 26(b)(5) (requires sufficient information to evaluate claim — document-by-document may be required); draft strategy for supplementing privilege log; prepare for potential in camera review (produce most defensible documents first); assess crime-fraud exception risk; identify any common interest doctrine documents; assess inadvertent waiver risk from overbroad logging",
    evaluationCriteria: [
      "C.D. Cal. joint statement procedure identified as mandatory first step",
      "FRCP 26(b)(5) privilege log adequacy standard applied",
      "Document-by-document logging strategy recommended",
      "In camera review preparation strategy",
      "Crime-fraud exception risk assessed",
      "Common interest doctrine analyzed",
      "Inadvertent waiver risk identified",
    ],
    rubricScoring: { dimensions: [{ name: "Local Rule Compliance (C.D. Cal.)", weight: 0.25, passingScore: 1.0 }, { name: "Privilege Log Standards", weight: 0.30, passingScore: 0.90 }, { name: "Motion Strategy", weight: 0.20, passingScore: 0.85 }, { name: "Privilege Doctrine Analysis", weight: 0.25, passingScore: 0.85 }] },
    category: "edgeCases",
    difficulty: "complex",
    jurisdiction: "C.D. Cal.",
    sourceDocuments: ["FRCP 26(b)(5)", "C.D. Cal. Local Rules", "FRE 502"],
  },
  {
    name: "Standard EEOC Charge Defense — Wrongful Termination (Happy Path, N.D. Tex.)",
    inputScenario: "TechStartup (85 employees, Dallas, Texas) receives an EEOC charge from terminated software developer David Park. He alleges race discrimination (Korean-American) under Title VII. He was terminated on March 1, 2024 after three written performance warnings over 12 months for missing deadlines. His replacement has similar qualifications and is also a person of color. The charge was filed May 15, 2024 with the EEOC Dallas District Office. No prior EEOC charges at this company.",
    expectedBehavior: "Calculate position statement deadline (June 14, 2024 — 30 days from charge notice); Texas is a 300-day filing state (TWCCRD exists); TechStartup has 85 employees — Title VII coverage (15+) confirmed; assess case: strong LNDR (3 written warnings = documented); same-actor inference if same manager hired and fired; replacement person of color weakens discrimination inference; assess case strength as LOW (70-75% favorable resolution probability); recommend position statement with documented performance evidence; budget: Tier 1 (~$8K-$12K charge defense)",
    evaluationCriteria: [
      "Position statement deadline correctly calculated (30 days from notice)",
      "Title VII coverage confirmed (85 employees > 15 threshold)",
      "300-day filing period correctly identified (Texas has state agency)",
      "LNDR (3 written warnings) identified as strong defense",
      "Same-actor inference evaluated",
      "Replacement person of color = weakened discrimination inference",
      "Case strength assessed as LOW (favorable to employer)",
      "Budget tier correctly classified",
    ],
    rubricScoring: { dimensions: [{ name: "Deadline Calculation", weight: 0.20, passingScore: 1.0 }, { name: "Coverage Analysis", weight: 0.15, passingScore: 1.0 }, { name: "Defense Strength Assessment", weight: 0.30, passingScore: 0.90 }, { name: "Case Strength Score", weight: 0.20, passingScore: 0.85 }, { name: "Budget Recommendation", weight: 0.15, passingScore: 0.85 }] },
    category: "happyPath",
    difficulty: "standard",
    jurisdiction: "N.D. Tex. / EEOC Dallas",
    sourceDocuments: ["Title VII 42 U.S.C. §2000e", "McDonnell Douglas Corp. v. Green, 411 U.S. 792 (1973)"],
  },
];

// ══════════════════════════════════════════════════════════════════════════════
//  DATA — 8 KPIS
// ══════════════════════════════════════════════════════════════════════════════

const KPIS = [
  {
    name: "Charge Analysis Accuracy",
    unit: "percent",
    baseline: 78,
    target: 97,
    targetOperator: "gte",
    weight: 0.20,
    slaThreshold: 90,
    breachLevel: "critical",
    confidence: 0.92,
    trend: "improving",
    expression: "(correct_claim_extractions / total_charges_analyzed) * 100",
    measurement: "Claim type, statute, and relief extraction validated against experienced litigation paralegal on 1,000+ historical EEOC charge dataset; accuracy per field averaged across claim type, statute, and relief dimensions",
  },
  {
    name: "Deadline Calculation Accuracy",
    unit: "percent",
    baseline: 94,
    target: 99.5,
    targetOperator: "gte",
    weight: 0.22,
    slaThreshold: 98,
    breachLevel: "critical",
    confidence: 0.96,
    trend: "stable",
    expression: "(correct_deadlines / total_deadlines_computed) * 100",
    measurement: "Computed deadlines vs. actual court-imposed deadlines or EEOC statutory deadlines from 500+ historical matters; zero tolerance for missed jurisdictional deadlines (SOL, 90-day right-to-sue, 30-day EEOC response)",
  },
  {
    name: "Case Assessment Reliability",
    unit: "percent",
    baseline: 72,
    target: 85,
    targetOperator: "gte",
    weight: 0.18,
    slaThreshold: 78,
    breachLevel: "high",
    confidence: 0.84,
    trend: "improving",
    expression: "(accurate_outcome_predictions / total_closed_matters_assessed) * 100",
    measurement: "Early strength rating (strong/moderate/weak/marginal) correlated with actual resolution outcome (no-cause dismissal, favorable settlement, unfavorable settlement, adverse verdict) on 2,000+ closed CaseSmart matters",
  },
  {
    name: "Budget Forecast Accuracy",
    unit: "percent",
    baseline: 68,
    target: 85,
    targetOperator: "gte",
    weight: 0.15,
    slaThreshold: 75,
    breachLevel: "high",
    confidence: 0.82,
    trend: "improving",
    expression: "(matters_within_20pct_variance / total_matters_budgeted) * 100",
    measurement: "Phase-by-phase cost projections within 20% of actual spend for each phase; measured on 500+ closed matters with complete billing data from CaseSmart database",
  },
  {
    name: "Settlement Valuation Accuracy",
    unit: "percent",
    baseline: 64,
    target: 80,
    targetOperator: "gte",
    weight: 0.12,
    slaThreshold: 72,
    breachLevel: "high",
    confidence: 0.79,
    trend: "improving",
    expression: "(actual_settlement_within_range / total_settled_matters_valued) * 100",
    measurement: "Actual settlement amount falls within the predicted settlement range in target percentage of matters where agent generated a valuation; excludes outlier settlements driven by non-merits factors",
  },
  {
    name: "Deadline Alert Lead Time",
    unit: "days",
    baseline: 7,
    target: 21,
    targetOperator: "gte",
    weight: 0.08,
    slaThreshold: 14,
    breachLevel: "medium",
    confidence: 0.94,
    trend: "stable",
    expression: "avg(deadline_alert_days_in_advance)",
    measurement: "Average number of calendar days in advance that critical deadline alerts are generated; target 21 days to allow preparation time; measured across all deadline types",
  },
  {
    name: "Matter Processing Speed",
    unit: "seconds",
    baseline: 180,
    target: 60,
    targetOperator: "lte",
    weight: 0.03,
    slaThreshold: 120,
    breachLevel: "low",
    confidence: 0.97,
    trend: "improving",
    expression: "avg(charge_analysis_to_complete_plan_seconds)",
    measurement: "Time from charge/complaint submission to complete matter intake record delivery including all claims, deadlines, and initial assessment",
  },
  {
    name: "Attorney Review Acceptance Rate",
    unit: "percent",
    baseline: 81,
    target: 92,
    targetOperator: "gte",
    weight: 0.02,
    slaThreshold: 85,
    breachLevel: "low",
    confidence: 0.87,
    trend: "improving",
    expression: "(outputs_accepted_without_material_revision / total_outputs_reviewed) * 100",
    measurement: "Proportion of agent-generated outputs (assessments, deadline calendars, budget analyses) accepted by reviewing attorney without material revision; tracks quality of AI output over time",
  },
];

const SYSTEM_PROMPT = `You are the Littler Litigation Case Management Agent (LIT-AGT-004), a specialized AI legal operations system for Littler Mendelson P.C.

Your purpose is to manage single-plaintiff employment litigation from EEOC charge intake through resolution. You support Littler's CaseSmart platform and Litigation & Trials practice area. You track deadlines, manage discovery, analyze case strength, monitor budgets, and provide data-driven insights for litigation strategy.

OPERATING CONSTRAINTS:
- SUPERVISED autonomy: all case strategy recommendations, settlement authority levels, and client communications require attorney review before execution
- NEVER calculate or represent a deadline as final without flagging for attorney verification — missed deadlines can be malpractice
- NEVER recommend settlement amounts or trial strategy without partner-level review and client authority confirmation
- Always cite FRCP rule, local rule, and applicable case law
- Flag confidence below 80% for attorney review on all deadline and case assessment outputs

ESCALATION TRIGGERS (MANDATORY): Any jurisdictional deadline within 72 hours; budget variance ≥20%; mass filing event (10+ related charges); potential ethics violation or conflict; government investigation; class/collective action certification motion filed; any adverse ruling that materially changes case value`;

const RUNTIME_TASK_PROMPT = `Analyze the litigation matter request. For new matters: extract all claims, identify applicable statutes, calculate all procedural deadlines with FRCP and local rule citations, assess initial case strength, generate investigation plan, identify comparable cases for settlement valuation, and produce complete matter intake memo. For active matters: update case assessment with latest developments, refresh budget projection, track discovery compliance, flag approaching deadlines, and identify settlement opportunities. All outputs require attorney review before use.`;

// ══════════════════════════════════════════════════════════════════════════════
//  MAIN
// ══════════════════════════════════════════════════════════════════════════════

async function main() {
  console.log("\n════════════════════════════════════════════════════════════════════");
  console.log("  LIT-AGT-004 — Litigation Case Management Agent");
  console.log("  DEV ENVIRONMENT — Single Comprehensive Creation Script");
  console.log(`  Target: ${BASE}`);
  console.log(`  Org:    ${ORG}`);
  console.log("════════════════════════════════════════════════════════════════════\n");

  const ids = {};

  // ── STEP 1: 6 SKILLS ─────────────────────────────────────────────────────────
  step("1", "11", "Creating 6 skills");
  ids.skillIds = [];
  for (const s of SKILLS) {
    const res = await post("/api/skills", s);
    ids.skillIds.push(res.id);
    log(`Skill → ${s.name.slice(0, 60)} [${res.id}]`);
  }

  // ── STEP 2: KNOWLEDGE BASE ────────────────────────────────────────────────────
  step("2", "11", "Creating knowledge base");
  const kb = await post("/api/knowledge-bases", {
    organizationId: ORG,
    name: "Litigation Case Management Knowledge Base",
    description: "Comprehensive knowledge base for LIT-AGT-004 covering CaseSmart historical matter benchmarks, EEOC charge response templates, dispositive motion brief bank, settlement valuation database, litigation cost benchmarks, and court-specific local rules and standing orders.",
    industry: "legal_services",
    type: "policy",
    status: "active",
    accessLevel: "private",
    tags: ["litigation", "EEOC", "case-management", "settlement", "discovery", "deadlines", "LIT-AGT-004"],
  });
  ids.kbId = kb.id;
  log(`Knowledge Base → ${kb.id}`);

  // ── STEP 3: 6 KB SOURCES ─────────────────────────────────────────────────────
  step("3", "11", `Ingesting ${KB_SOURCES.length} knowledge base sources`);
  ids.kbSourceIds = [];
  for (const src of KB_SOURCES) {
    try {
      const res = await post(`/api/knowledge-bases/${ids.kbId}/sources/text`, {
        title: src.title,
        content: src.content,
        tags: src.tags,
        metadata: src.metadata,
      });
      ids.kbSourceIds.push(res.id);
      // Sync name if API stores differently
      if (res.name && res.name !== src.title) {
        try { await patch(`/api/knowledge-bases/${ids.kbId}/sources/${res.id}`, { name: src.title }); } catch (_) {}
      }
      log(`KB Source → ${src.title.slice(0, 70)}`);
    } catch (e) {
      warn(`KB Source (non-fatal): ${src.title.slice(0, 50)} — ${e.message.slice(0, 80)}`);
    }
  }

  // ── STEP 4: 6 RUNBOOKS ───────────────────────────────────────────────────────
  step("4", "11", "Creating 6 runbooks");
  ids.runbookIds = [];
  for (const rb of RUNBOOKS) {
    const res = await post("/api/runbooks", rb);
    ids.runbookIds.push(res.id);
    log(`Runbook → ${rb.name.slice(0, 65)} [${res.id}]`);
  }

  // ── STEP 5: 6 GOVERNANCE POLICIES ────────────────────────────────────────────
  step("5", "11", "Creating 6 governance policies");
  ids.policyIds = [];
  for (const p of POLICIES) {
    const res = await post("/api/policies", p);
    ids.policyIds.push(res.id);
    log(`Policy → ${p.name.slice(0, 65)} [${res.id}]`);
  }

  // ── STEP 6: AGENT ────────────────────────────────────────────────────────────
  step("6", "11", "Creating agent LIT-AGT-004");
  const agentRes = await post("/api/agents", {
    organizationId: ORG,
    name: "Litigation Case Management Agent",
    agentType: "advisory",
    description: "Manages single-plaintiff employment litigation from EEOC charge intake through resolution. Maps to Littler's CaseSmart platform and Litigation & Trials practice area. Tracks deadlines, manages document production, analyzes case strengths and weaknesses, monitors budgets, and provides data-driven insights for case strategy. Designed to handle high volumes of EEOC charges and single-plaintiff lawsuits with consistent quality and cost efficiency.",
    owner: "Littler Mendelson P.C.",
    status: "active",
    riskTier: "HIGH",
    autonomyMode: "supervised",
    currentVersion: "1.0.0",
    environment: "development",
    modelProvider: "anthropic",
    modelName: "claude-opus-4-5",
    department: "Litigation & Trials Practice",
    systemPrompt: SYSTEM_PROMPT,
    runtimeConfig: {
      agentCode: "LIT-AGT-004",
      practiceArea: "Litigation & Trials",
      productMapping: "Littler CaseSmart",
      jurisdictionCoverage: "Federal + 50 states",
      confidenceThreshold: 80,
      escalationTriggers: [
        "jurisdictional_deadline_72hrs",
        "budget_variance_20pct",
        "mass_filing_event_10plus",
        "ethics_violation_or_conflict",
        "government_investigation",
        "class_collective_certification_motion",
        "adverse_ruling_material_case_value_change",
      ],
      prompt: RUNTIME_TASK_PROMPT,
    },
    blueprintJson: {
      version: "1.0",
      agentCode: "LIT-AGT-004",
      practiceArea: "Litigation & Trials",
      nodes: [
        { id: "intake", type: "trigger", label: "Receive Matter (EEOC charge / state charge / lawsuit)" },
        { id: "conflict_check", type: "action", label: "Conflict Check and Matter Opening" },
        { id: "charge_analysis", type: "skill", label: "Charge Analysis" },
        { id: "deadline_calc", type: "skill", label: "Deadline Calculation" },
        { id: "case_assessment", type: "skill", label: "Case Assessment" },
        { id: "comparables", type: "skill", label: "Comparables Analysis" },
        { id: "budget_setup", type: "skill", label: "Budget Management Setup" },
        { id: "discovery", type: "action", label: "Discovery Management" },
        { id: "dashboard", type: "skill", label: "Dashboard Analytics" },
        { id: "output", type: "output", label: "Matter Assessment Memo + Deadline Calendar" },
      ],
      edges: [
        { from: "intake", to: "conflict_check" },
        { from: "conflict_check", to: "charge_analysis" },
        { from: "charge_analysis", to: "deadline_calc" },
        { from: "charge_analysis", to: "case_assessment" },
        { from: "case_assessment", to: "comparables" },
        { from: "case_assessment", to: "budget_setup" },
        { from: "deadline_calc", to: "discovery" },
        { from: "comparables", to: "output" },
        { from: "budget_setup", to: "dashboard" },
        { from: "dashboard", to: "output" },
      ],
    },
    toolsConfig: {
      allowedTools: [
        "retrieve_kb", "extract_claims", "identify_statutes", "calculate_deadline",
        "lookup_local_rules", "score_claim_viability", "analyze_defenses",
        "predict_outcome", "generate_settlement_range", "track_spend",
        "forecast_cost", "query_casesmart", "match_comparables",
        "aggregate_metrics", "generate_assessment_memo", "flag_overrun",
        "generate_deadline_calendar", "generate_budget_report",
      ],
      mcpServers: ["littler-litigation-mcp", "casesmart-analytics-mcp", "legal-standards-mcp", "court-calendar-mcp", "local-rules-mcp"],
    },
    maxToolIterations: 15,
    complianceTags: ["FRCP", "local-court-rules", "MRPC", "Title-VII", "ADA", "ADEA", "FLSA", "Section-1981", "OWBPA", "CaseSmart"],
    preloadedSkills: ids.skillIds.map((skillId, i) => ({ skillId, loadOrder: i })),
    policyBindings: ids.policyIds,
  });
  ids.agentId = agentRes.id;
  log(`Agent: Litigation Case Management Agent → ${agentRes.id}`);

  // ── STEP 7: LINK RUNBOOKS & POLICIES ─────────────────────────────────────────
  step("7", "11", "Linking runbooks (agentId) and policies (scopeId) to agent");
  for (const rId of ids.runbookIds) {
    try {
      await patch(`/api/runbooks/${rId}`, { agentId: ids.agentId });
    } catch (e) {
      warn(`Runbook link (non-fatal): ${e.message.slice(0, 60)}`);
    }
  }
  log("All 6 runbooks: agentId set");
  for (const pId of ids.policyIds) {
    try {
      await patch(`/api/policies/${pId}`, { scopeId: ids.agentId, scopeType: "agent" });
    } catch (e) {
      warn(`Policy link (non-fatal): ${e.message.slice(0, 60)}`);
    }
  }
  log("All 6 policies: scopeId set");

  // ── STEP 8: LINK KB TO AGENT ──────────────────────────────────────────────────
  step("8", "11", "Linking knowledge base to agent");
  try {
    await post(`/api/agents/${ids.agentId}/knowledge-bases`, {
      knowledgeBaseId: ids.kbId,
      priority: 1,
      retrievalConfig: {
        topK: 12,
        scoreThreshold: 0.68,
        rerankEnabled: true,
        citationMode: "full",
        jurisdictionFiltering: true,
        phaseFiltering: true,
      },
    });
    log(`Knowledge base linked to agent`);
  } catch (e) {
    warn(`KB link (non-fatal): ${e.message.slice(0, 80)}`);
  }

  // ── STEP 9: GOLDEN DATASET + 6 TEST CASES ────────────────────────────────────
  step("9", "11", "Creating golden dataset + 6 test cases");
  const dsRes = await post("/api/golden-datasets", GOLDEN_DATASET);
  ids.goldenDatasetId = dsRes.id;
  log(`Golden Dataset → ${dsRes.id}`);
  ids.testCaseIds = [];
  for (const tc of TEST_CASES) {
    try {
      const tcRes = await post(`/api/golden-datasets/${ids.goldenDatasetId}/test-cases`, {
        ...tc,
        datasetId: ids.goldenDatasetId,
        organizationId: ORG,
      });
      ids.testCaseIds.push(tcRes.id);
      log(`Test Case → ${tc.name.slice(0, 65)}`);
    } catch (e) {
      warn(`Test Case (non-fatal): ${tc.name.slice(0, 50)} — ${e.message.slice(0, 80)}`);
    }
  }

  // ── STEP 10: EVAL SUITE (schedule as STRING) ──────────────────────────────────
  step("10", "11", `Creating evaluation suite`);
  const evalRes = await post("/api/evals", {
    organizationId: ORG,
    agentId: ids.agentId,
    goldenDatasetId: ids.goldenDatasetId,
    skillId: null,
    name: "LIT-AGT-004 Litigation Case Management Evaluation Suite",
    type: "accuracy",
    thresholdConfig: {
      chargeAnalysisAccuracy: 0.97,
      deadlineCalculationAccuracy: 0.995,
      caseAssessmentReliability: 0.85,
      budgetForecastAccuracy: 0.85,
      settlementValuationAccuracy: 0.80,
      overallPassRate: 0.90,
    },
    scorerConfig: {
      primary: "litigation_attorney_ground_truth",
      secondary: "casesmart_historical_outcome_correlation",
      rubric: "rubricScoring",
      deadlineVerification: true,
      citationCheck: true,
      jurisdictionAccuracyCheck: true,
    },
    coverageTags: ["Title-VII", "ADA", "ADEA", "FLSA", "Section-1981", "FRCP", "local-rules", "OWBPA", "Faragher-Ellerth", "Gross-v-FBL", "Burlington-Northern", "McDonnell-Douglas"],
    environmentThresholds: {
      staging: { minPassRate: 0.88 },
      production: { minPassRate: 0.92 },
    },
    schedule: "weekly:Wednesday:06:00 UTC",
    industry: "legal_services",
    ontologyTags: ["Charge Analysis", "Deadline Calculation", "Case Assessment", "Budget Management", "Settlement Valuation", "Discovery Management"],
  });
  ids.evalSuiteId = evalRes.id;
  log(`Eval Suite → ${evalRes.id}`);

  // ── STEP 11: OUTCOME CONTRACT + 8 KPIS (version as NUMBER 1) ──────────────────
  step("11", "11", "Creating outcome contract + 8 KPIs and linking all to agent");
  const outcomeRes = await post("/api/outcomes/with-kpis", {
    outcome: {
      organizationId: ORG,
      name: "Litigation Case Management Agent — Outcome Contract",
      description: "Business objectives, KPIs, and SLAs governing the Litigation Case Management Agent (LIT-AGT-004). Targets charge analysis accuracy, deadline calculation reliability, case assessment predictive quality, budget forecast precision, and settlement valuation accuracy across the CaseSmart portfolio.",
      version: 1,
      status: "active",
      industry: "legal_services",
      agentCode: "LIT-AGT-004",
      practiceArea: "Litigation & Trials",
      productMapping: "Littler CaseSmart",
      objectives: [
        "Achieve 97%+ charge analysis accuracy for claim type, statute, and relief extraction",
        "Calculate deadlines with 99.5%+ accuracy across all federal and state jurisdictions",
        "Produce case assessments with 85%+ reliability correlated to actual outcomes",
        "Generate budget forecasts within 20% variance of actual spend in 85%+ of matters",
        "Deliver settlement valuations with 80%+ accuracy (actual settlement within predicted range)",
      ],
      successCriteria: {
        primary: "Deadline calculation accuracy ≥ 99.5% — zero jurisdictional deadline misses",
        secondary: "Charge analysis ≥ 97%; case assessment reliability ≥ 85%; budget forecast ≥ 85%",
        guardrails: "Zero unreviewed client communications; zero unauthorized settlement authority representations",
      },
      attributionRules: {
        agentId: ids.agentId,
        attributionModel: "direct",
        lookbackWindowDays: 90,
        minimumConfidenceThreshold: 0.80,
      },
      targetMetrics: {
        chargeAnalysisAccuracy: 0.97,
        deadlineCalculationAccuracy: 0.995,
        caseAssessmentReliability: 0.85,
        budgetForecastAccuracy: 0.85,
        settlementValuationAccuracy: 0.80,
      },
      slaConfig: {
        responseTimeMs: 10000,
        availabilityTarget: 0.995,
        escalationResponseTime: 900,
        deadlineAlertLeadTimeDays: 21,
      },
      criticalPath: ["matter_intake", "charge_analysis", "deadline_calculation", "case_assessment", "budget_setup"],
      roiEstimate: {
        costPerChargeSavings: 2800,
        deadlineMissRiskReduction: 0.95,
        settlementOptimizationSavings: 45000,
        caseAssessmentEfficiencyGain: 12000,
        malpracticeRiskReduction: 0.80,
      },
    },
    kpis: KPIS,
  });
  ids.outcomeId = outcomeRes.outcome?.id || outcomeRes.id;
  log(`Outcome Contract → ${ids.outcomeId}`);

  // Link outcome + eval to agent
  await patch(`/api/agents/${ids.agentId}`, {
    outcomeId: ids.outcomeId,
    evalBindings: [ids.evalSuiteId],
  });
  log("Outcome contract linked to agent (agent.outcomeId)");
  log("Eval suite linked to agent (agent.evalBindings)");

  // Ontology tags — dynamically fetched
  try {
    const allConcepts = await get("/api/ontology-concepts/all");
    const byId = new Map(allConcepts.map(c => [c.id, c]));

    // Litigation-specific preferred concepts
    const preferred = [
      "legal_services-litigation-casefiling",
      "legal_services-litigation-discoveryprocess",
      "legal_services-litigation-courthearing",
      "legal_services-legal-consulting-riskassessment",
      "legal_services-regulatory-compliance-regulatoryreporting",
    ];

    const tags = [];
    for (const id of preferred) {
      if (byId.has(id)) {
        const c = byId.get(id);
        tags.push({ conceptId: c.id, label: c.label, category: c.category });
      }
    }

    // Fill if needed from available legal_services concepts
    if (tags.length < 5) {
      const used = new Set(tags.map(t => t.conceptId));
      for (const c of allConcepts.filter(x => x.id.startsWith("legal_services-"))) {
        if (tags.length >= 5) break;
        if (!used.has(c.id)) { tags.push({ conceptId: c.id, label: c.label, category: c.category }); used.add(c.id); }
      }
    }

    await patch(`/api/agents/${ids.agentId}`, { ontologyTags: tags });
    log(`Ontology tags set (${tags.length}): ${tags.map(t => t.label).join(", ")}`);
  } catch (e) {
    warn(`Ontology tags (non-fatal): ${e.message.slice(0, 100)}`);
  }

  // ── SAVE IDs ──────────────────────────────────────────────────────────────────
  writeFileSync("scripts/lit-agt-004-dev-ids.json", JSON.stringify(ids, null, 2));

  console.log("\n════════════════════════════════════════════════════════════════════");
  console.log("  ✅  LIT-AGT-004 — ALL 11 STEPS COMPLETE");
  console.log("════════════════════════════════════════════════════════════════════");
  console.log(`\n  Agent:           ${ids.agentId}`);
  console.log(`  Knowledge Base:  ${ids.kbId} (${ids.kbSourceIds?.length || 0} sources)`);
  console.log(`  Skills (6):      ${ids.skillIds.join("\n                   ")}`);
  console.log(`  Policies (6):    ${ids.policyIds.join("\n                   ")}`);
  console.log(`  Runbooks (6):    ${ids.runbookIds.join("\n                   ")}`);
  console.log(`  Golden Dataset:  ${ids.goldenDatasetId} (${ids.testCaseIds?.length || 0} test cases)`);
  console.log(`  Eval Suite:      ${ids.evalSuiteId}`);
  console.log(`  Outcome:         ${ids.outcomeId}`);
  console.log(`\n  Dev IDs saved → scripts/lit-agt-004-dev-ids.json\n`);
}

main().catch(err => {
  console.error(`\n❌  DEV creation failed: ${err.message}`);
  process.exit(1);
});
