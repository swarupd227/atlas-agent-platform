#!/usr/bin/env node
/**
 * LIT-AGT-010 — Leave & Accommodation Management Agent
 * PRODUCTION MIGRATION SCRIPT
 *
 * Creates all platform intelligence in the PRODUCTION environment via API only.
 * This is the single migration script to run against prod after dev validation.
 *
 * Usage:  node scripts/create-lit-agt-010-prod.js
 * Saves:  scripts/lit-agt-010-prod-ids.json
 *
 * Production URL: https://agent-lifecycle-management-platform.replit.app
 * Production Org: cf5754b1-ee80-4b51-8bf6-7be263c97527
 */

import { writeFileSync } from "fs";

const BASE = "https://agent-lifecycle-management-platform.replit.app";
const ORG  = "cf5754b1-ee80-4b51-8bf6-7be263c97527";

// ── HTTP Helpers ──────────────────────────────────────────────────────────────

async function post(path, body) {
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  if (text.startsWith("<!DOCTYPE") || text.startsWith("<html")) {
    throw new Error(`POST ${path} → HTML response (route not deployed?): ${text.slice(0,200)}`);
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
    throw new Error(`PATCH ${path} → HTML response (route not deployed?): ${text.slice(0,200)}`);
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
    throw new Error(`GET ${path} → HTML response`);
  }
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!r.ok) throw new Error(`GET ${path} → ${r.status}: ${JSON.stringify(data).slice(0, 600)}`);
  return data;
}

const log  = (msg) => console.log(`  ✓  ${msg}`);
const warn = (msg) => console.log(`  ⚠  ${msg}`);
const step = (n, total, msg) => console.log(`\nSTEP ${n}/${total}  ${msg}`);

// ══════════════════════════════════════════════════════════════════════════════
// DATA DEFINITIONS
// (Same content as dev — same real data, targeting prod org)
// ══════════════════════════════════════════════════════════════════════════════

const SKILLS = [
  {
    organizationId: ORG,
    name: "Multi-Law Leave Eligibility Skill",
    description: "Determines leave eligibility under all applicable federal, state, and local leave laws simultaneously for a given employee. Evaluates FMLA (federal), state FMLA equivalents, state paid family leave (CA PFL, NY PFL, WA PFML, NJ FLI, CO FAMLI, MA PFML, CT PFML, OR PFML, 5+ others), and local sick leave ordinances. Produces a jurisdiction-prioritized eligibility matrix with entitlement durations, benefit rates, job-protection status, and notice obligations per law.",
    industry: "legal_services",
    domain: "leave-accommodation",
    version: "1.0.0",
    author: "Littler Mendelson Leave & Accommodation Practice Group",
    trustTier: "HIGH",
    dependencies: [],
    tags: ["FMLA", "ADA", "leave-eligibility", "state-leave", "PFL", "sick-leave", "multi-jurisdiction"],
    agentTypeCompatibility: ["single", "team", "remote"],
    status: "active",
    complexity: "complex",
    allowedTools: ["retrieve_kb", "query_jurisdiction_rules", "score_confidence", "lookup_leave_laws"],
    requiredMcpServers: ["littler-gps-mcp", "leave-law-mcp"],
    requiredDataClassifications: ["employee_pii", "medical_certification", "hr_records"],
    disableModelInvocation: false,
    contextMode: "rag",
    userInvocable: true,
    descriptionQualityScore: 95,
    knowledgeQueries: ["FMLA eligibility criteria", "state paid family leave programs", "local sick leave laws", "leave entitlement duration"],
    yamlFrontmatter: `name: Multi-Law Leave Eligibility Skill\nversion: "1.0"\nagent_code: LIT-AGT-010\ndomain: leave-accommodation\nindustry: legal_services\ntrust_tier: HIGH\ncontext_mode: rag\njurisdiction_coverage: "50 states + DC + 500+ municipalities"\nfederal_laws: [FMLA, ADA, PWFA, USERRA, PUMP_Act]\nstate_pfl_programs: [CA_PFL, NY_PFL, WA_PFML, NJ_FLI, CO_FAMLI, MA_PFML, CT_PFML, OR_PFML, RI_TDI, DC_PFML, MD_FAMLI, DE_PFML, MN_PFML, IL_PLSAA]\nrequired_kb: Leave & Accommodation Management Knowledge Base\ncitation_required: true\nconfidence_scoring: true`,
    markdownBody: `# Multi-Law Leave Eligibility Skill\n\n## Purpose\nEvaluates an employee's eligibility for all applicable leave entitlements simultaneously based on their work location, employer size, reason for leave, and tenure/hours worked.\n\n## Federal Leave Laws Covered\n- FMLA: 50+ employees within 75 miles; 12 months tenure; 1,250 hours; 12-week entitlement\n- ADA/ADAAA: 15+ employees; leave as accommodation after FMLA exhaustion\n- PWFA (Effective June 27, 2023): pregnancy-related accommodations including leave\n- USERRA: military leave for all employers; escalator reemployment rights\n\n## State PFL Programs\n- CA PFL: 8 weeks at 60-70% wages; no waiting period; bonding + family care\n- NY PFL: 12 weeks at 67% SAWW; all employers; bonding + family care + military exigency\n- WA PFML: 12 weeks medical/family; 16 weeks combined; 18 weeks pregnancy complications\n- NJ FLI + TDI: 12 weeks FLI at 85% wages; NJ FLI and FMLA do NOT run concurrently for family care\n- CO FAMLI: 12 weeks (16 for pregnancy) at 90% up to 50% SAWW\n- MA PFML: 12-20 weeks at 80% wages\n- CT, OR, DC, MD, MN, DE PFML: see knowledge base for current rates\n\n## Key Concurrent Running Rules\n- FMLA + CFRA for baby bonding: SEPARATE since CA Baby Blues Amendment (Jan 1, 2021 — SB 1383)\n- NJ FLI + FMLA: Do NOT run concurrently for family care leave\n- FMLA + most state equivalents: Mandatory concurrent running\n- FMLA + accrued PTO: Employer may require substitution\n\n## Output\nJurisdiction-prioritized leave eligibility matrix with: entitlement duration, benefit rate (if any), job protection, concurrent running rule, notice obligations.`,
  },
  {
    organizationId: ORG,
    name: "Concurrent Leave Tracker Skill",
    description: "Manages the simultaneous running of multiple leave entitlements under different laws. Tracks mandatory concurrent running, employer-discretionary concurrent running designations, leave stacking implications, and real-time balance deductions across all applicable entitlements. Produces accurate leave balance statements and identifies exhaustion dates for each entitlement.",
    industry: "legal_services",
    domain: "leave-accommodation",
    version: "1.0.0",
    author: "Littler Mendelson Leave & Accommodation Practice Group",
    trustTier: "HIGH",
    dependencies: ["Multi-Law Leave Eligibility Skill"],
    tags: ["concurrent-leave", "FMLA", "leave-stacking", "balance-tracking", "intermittent-leave"],
    agentTypeCompatibility: ["single", "team", "remote"],
    status: "active",
    complexity: "complex",
    allowedTools: ["retrieve_kb", "query_jurisdiction_rules", "calculate_leave_balance", "lookup_leave_laws"],
    requiredMcpServers: ["littler-gps-mcp", "leave-law-mcp", "hris-integration-mcp"],
    requiredDataClassifications: ["employee_pii", "hr_records", "leave_records"],
    disableModelInvocation: false,
    contextMode: "rag",
    userInvocable: true,
    descriptionQualityScore: 93,
    knowledgeQueries: ["concurrent leave running rules", "FMLA CFRA concurrent designation", "leave stacking rules", "intermittent leave tracking"],
    yamlFrontmatter: `name: Concurrent Leave Tracker Skill\nversion: "1.0"\nagent_code: LIT-AGT-010\ndomain: leave-accommodation\nindustry: legal_services\ntrust_tier: HIGH\ncontext_mode: rag\ntracking_granularity: [daily, intermittent_hours, intermittent_days]\nconcurrent_rules: [mandatory_concurrent, discretionary_concurrent, sequential, separate_entitlement]`,
    markdownBody: `# Concurrent Leave Tracker Skill\n\n## Purpose\nTracks simultaneous leave usage across multiple overlapping entitlements, applying correct concurrent running rules and maintaining real-time balance accuracy.\n\n## Concurrent Running Rules\n- Mandatory concurrent: FMLA + most state FMLA equivalents run together\n- California Baby Blues exception: FMLA and CFRA for baby bonding run SEPARATELY (24 weeks total possible)\n- NJ exception: FLI and FMLA do NOT run concurrently for family care\n- Discretionary: Employer may require FMLA to run with accrued PTO, short-term disability\n- Sequential: ADA accommodation leave begins when FMLA exhausted\n\n## Balance Tracking\n- 12-month period options: calendar year, fixed year, rolling forward, rolling backward\n- Rolling backward = most employer-protective: 12 weeks minus leave in prior 52 weeks\n- Intermittent tracking: hours to nearest hour; partial days tracked (29 C.F.R. §825.205)\n- Part-time employees: proportional entitlement based on normal weekly hours\n\n## Output\nLeave balance statement per entitlement with total available, used, remaining, expiration, and concurrent running designation.`,
  },
  {
    organizationId: ORG,
    name: "Interactive Process Skill",
    description: "Guides the ADA/PWFA interactive accommodation process from initial request through final determination. Identifies all potential reasonable accommodations for a given disability and job function, assesses undue hardship factors, documents the process with legally sufficient records, and generates required correspondence.",
    industry: "legal_services",
    domain: "leave-accommodation",
    version: "1.0.0",
    author: "Littler Mendelson Leave & Accommodation Practice Group",
    trustTier: "HIGH",
    dependencies: [],
    tags: ["ADA", "interactive-process", "reasonable-accommodation", "undue-hardship", "PWFA", "disability"],
    agentTypeCompatibility: ["single", "team", "remote"],
    status: "active",
    complexity: "complex",
    allowedTools: ["retrieve_kb", "query_jurisdiction_rules", "score_confidence", "generate_document"],
    requiredMcpServers: ["littler-gps-mcp", "accommodation-library-mcp"],
    requiredDataClassifications: ["employee_pii", "medical_certification", "hr_records"],
    disableModelInvocation: false,
    contextMode: "rag",
    userInvocable: true,
    descriptionQualityScore: 94,
    knowledgeQueries: ["ADA reasonable accommodation", "undue hardship analysis", "interactive process requirements", "PWFA accommodations"],
    yamlFrontmatter: `name: Interactive Process Skill\nversion: "1.0"\nagent_code: LIT-AGT-010\ndomain: leave-accommodation\nindustry: legal_services\ntrust_tier: HIGH\ncontext_mode: rag\nlaws_covered: [ADA, ADAAA, PWFA, state_FEHAs]\nstate_coverage: "50 states + DC (state FEHA equivalents)"\nundue_hardship_factors: [cost, financial_resources, type_of_operation, impact_on_operations]`,
    markdownBody: `# Interactive Process Skill\n\n## Purpose\nGuides legally mandated ADA/PWFA interactive accommodation process from initial disclosure through final determination with complete documentation.\n\n## Legal Framework\n- ADA: Both parties must engage in good faith; failure to engage is independently actionable (CA FEHA)\n- PWFA: Affirmative duty to accommodate pregnancy-related limitations; cannot require leave if another accommodation exists\n- CA FEHA: Affirmative duty to engage; 5+ employee coverage (broader than ADA)\n\n## Accommodation Categories\n1. Schedule/time modifications (intermittent leave, reduced hours, flexible start times)\n2. Physical workspace modifications (ergonomic equipment, closer parking, accessible workstation)\n3. Job duty modifications (marginal function reassignment; NO essential function elimination)\n4. Technology/equipment (assistive tech, screen readers, communication devices)\n5. Remote work (increasingly difficult to claim hardship post-COVID)\n6. Leave (last resort; must have definite return date; indefinite leave typically not required)\n\n## PWFA-Specific Enumerated Accommodations (per EEOC Final Rule, April 2024)\nRestroom breaks, sitting, drinking water, closer parking, light duty, modified PPE, modified food/beverage policies, predictable break schedules, modified work schedule, remote work, temporary suspension of essential functions (time-limited)\n\n## Undue Hardship Factors (42 U.S.C. §12111(10))\nNature and cost, financial resources, type of operation, workforce composition, impact on operations`,
  },
  {
    organizationId: ORG,
    name: "Leave Notice Generator Skill",
    description: "Produces all legally required notices and correspondence for leave administration across FMLA, state leave laws, and ADA accommodations. Generates FMLA designation notices, WH-380 series medical certification requests, state-specific rights notices, ADA correspondence, and denial letters with required content validation and deadline tracking.",
    industry: "legal_services",
    domain: "leave-accommodation",
    version: "1.0.0",
    author: "Littler Mendelson Leave & Accommodation Practice Group",
    trustTier: "HIGH",
    dependencies: ["Multi-Law Leave Eligibility Skill"],
    tags: ["FMLA", "leave-notices", "WH-380", "ADA-correspondence", "designation-notice", "rights-notice"],
    agentTypeCompatibility: ["single", "team", "remote"],
    status: "active",
    complexity: "medium",
    allowedTools: ["retrieve_kb", "generate_document", "lookup_leave_laws", "query_jurisdiction_rules"],
    requiredMcpServers: ["littler-gps-mcp", "document-gen-mcp"],
    requiredDataClassifications: ["employee_pii", "hr_records"],
    disableModelInvocation: false,
    contextMode: "rag",
    userInvocable: true,
    descriptionQualityScore: 92,
    knowledgeQueries: ["FMLA notice requirements", "FMLA designation notice", "state leave notice requirements", "ADA accommodation response letters"],
    yamlFrontmatter: `name: Leave Notice Generator Skill\nversion: "1.0"\nagent_code: LIT-AGT-010\ndomain: leave-accommodation\nindustry: legal_services\ntrust_tier: HIGH\ncontext_mode: rag\nnotice_types: [FMLA_eligibility, FMLA_designation, WH-380-E, WH-380-F, state_rights, ADA_correspondence, denial_letters]\ndeadline_tracking: true\nrequired_content_validation: true`,
    markdownBody: `# Leave Notice Generator Skill\n\n## Purpose\nGenerates all legally required notices with correct content within statutory deadlines for every applicable leave law.\n\n## FMLA Notice Deadlines (29 C.F.R. §825.300)\n- Notice of Eligibility (WH-381): Within 5 business days of learning of FMLA need\n- Medical certification request: Specify 15-calendar-day return deadline in notice\n- Designation Notice (WH-382): Within 5 business days of sufficient designation information\n- Cure period for incomplete certification: Employee has 7 calendar days after written notice of deficiencies\n\n## State Notice Requirements\n- CA CFRA Baby Blues: Inform employee of separate FMLA/CFRA entitlements for baby bonding\n- CA PDL + CFRA sequence: Explain PDL → CFRA → PFL sequence and benefit coordination\n- NY PFL: Written rights notice at hire and each January; 30-day advance notice requirement\n- WA PFML: Written notice at hire and upon learning of leave need\n\n## ADA/PWFA Correspondence\n- Acknowledgment letter: Within 5 business days of request (best practice)\n- Medical documentation request: Only information needed to verify disability and limitations\n- Final decision letter: All alternatives explored and rejected with reasons\n- MANDATORY: All denial letters require attorney review before sending\n\n## Notice Deadline Quick Reference\n| FMLA Eligibility | 5 business days from employer learning of need |\n| FMLA Designation | 5 business days from sufficient information |\n| Cert deficiency cure | 7 calendar days for employee to cure |\n| ADA acknowledgment | 5 business days (best practice) |`,
  },
  {
    organizationId: ORG,
    name: "Certification Management Skill",
    description: "Tracks medical certifications supporting leave requests throughout their lifecycle: initial certification, second/third opinions, recertification timelines, insufficient certification cure periods, and fitness-for-duty certifications at return. Manages certification expiration, required content verification, and healthcare provider communication templates.",
    industry: "legal_services",
    domain: "leave-accommodation",
    version: "1.0.0",
    author: "Littler Mendelson Leave & Accommodation Practice Group",
    trustTier: "HIGH",
    dependencies: [],
    tags: ["medical-certification", "FMLA", "WH-380", "recertification", "fitness-for-duty", "second-opinion"],
    agentTypeCompatibility: ["single", "team", "remote"],
    status: "active",
    complexity: "medium",
    allowedTools: ["retrieve_kb", "query_jurisdiction_rules", "calculate_deadline", "generate_document"],
    requiredMcpServers: ["littler-gps-mcp", "calendar-mcp"],
    requiredDataClassifications: ["employee_pii", "medical_certification", "hr_records"],
    disableModelInvocation: false,
    contextMode: "rag",
    userInvocable: true,
    descriptionQualityScore: 91,
    knowledgeQueries: ["FMLA medical certification requirements", "recertification rules", "second opinion rights", "fitness-for-duty certification"],
    yamlFrontmatter: `name: Certification Management Skill\nversion: "1.0"\nagent_code: LIT-AGT-010\ndomain: leave-accommodation\nindustry: legal_services\ntrust_tier: HIGH\ncontext_mode: rag\ncertification_types: [initial_FMLA, second_opinion, third_opinion, recertification, fitness_for_duty, ADA_medical_inquiry]\ndeadline_tracking: true`,
    markdownBody: `# Certification Management Skill\n\n## Purpose\nManages complete lifecycle of medical certifications, tracking deadlines, sufficiency determinations, and recertification obligations.\n\n## Initial Certification\n- Employee has 15 calendar days to return completed WH-380-E or WH-380-F\n- Employer may NOT contact HCP directly (HIPAA); only HR/leave administrator contact permitted\n- Cure period: Employer must notify of deficiencies within 5 business days; employee has 7 calendar days to cure\n\n## Second Opinion (29 C.F.R. §825.307)\n- Employer may require at employer's expense\n- Employer designates HCP (cannot be regularly contracted HCP)\n- Conflicting opinions: third binding opinion (jointly selected; employer pays)\n- May NOT delay leave pending second opinion\n\n## Recertification (29 C.F.R. §825.308)\n- No more often than every 30 days AND in connection with an absence\n- Exception: incapacity <30 days stated on cert; significant change in frequency/duration; changed circumstances\n- May request annually for permanent/long-term conditions\n\n## Fitness-for-Duty (29 C.F.R. §825.312)\n- Must state requirement in Designation Notice\n- May require HCP address ability to perform essential functions (with advance notice)\n- Cannot delay return while awaiting FFD if employee presents cert`,
  },
  {
    organizationId: ORG,
    name: "Leave Analytics Skill",
    description: "Analyzes leave usage patterns across a workforce to identify compliance risks, potential abuse indicators, accommodation trends, and proactive management opportunities. Distinguishes between patterns that may indicate abuse and those protected by leave laws. CRITICAL WARNING: Patterns are for attorney review only — no direct employer action based on leave usage patterns.",
    industry: "legal_services",
    domain: "leave-accommodation",
    version: "1.0.0",
    author: "Littler Mendelson Leave & Accommodation Practice Group",
    trustTier: "HIGH",
    dependencies: ["Concurrent Leave Tracker Skill"],
    tags: ["leave-analytics", "abuse-indicators", "compliance-trends", "FMLA", "workforce-analytics", "accommodation-patterns"],
    agentTypeCompatibility: ["single", "team", "remote"],
    status: "active",
    complexity: "complex",
    allowedTools: ["retrieve_kb", "query_analytics", "calculate_trends", "generate_report", "score_confidence"],
    requiredMcpServers: ["littler-gps-mcp", "hris-integration-mcp", "analytics-mcp"],
    requiredDataClassifications: ["employee_pii", "hr_records", "leave_records", "aggregated_analytics"],
    disableModelInvocation: false,
    contextMode: "rag",
    userInvocable: true,
    descriptionQualityScore: 90,
    knowledgeQueries: ["FMLA abuse indicators", "leave pattern analysis", "accommodation trend analysis", "leave management compliance"],
    yamlFrontmatter: `name: Leave Analytics Skill\nversion: "1.0"\nagent_code: LIT-AGT-010\ndomain: leave-accommodation\nindustry: legal_services\ntrust_tier: HIGH\ncontext_mode: rag\nanalytics_scope: [individual_patterns, department_trends, workforce_aggregate, jurisdiction_compliance]\nprotection_boundary: "Must distinguish protected leave usage from potential abuse without chilling protected activity"`,
    markdownBody: `# Leave Analytics Skill\n\n## CRITICAL LEGAL CONSTRAINT\nPatterns identified are for attorney review only. Discipline or interference based on leave usage patterns may violate FMLA §2615 (interference) or constitute retaliation. NEVER recommend adverse action based on leave patterns without attorney consultation.\n\n## Individual-Level Analytics\nPatterns warranting review (NOT automatic abuse indicators):\n- Intermittent absences consistently adjacent to weekends/holidays\n- Absence frequency significantly exceeding certified frequency\n- Multiple short absences outside certified frequency/duration\n\nKey distinction: Adjacent-weekend absences are NOT abuse if serious health condition produces episodic symptoms. Appropriate response: medical recertification.\n\n## Compliance Risk Flags\nHigh-Risk (Immediate Legal Review):\n- FMLA interfering discipline (performance review during leave)\n- Designation delays >5 business days\n- Denial without medical certification deficiency notice\n- Termination of employee on or recently returned from FMLA\n- ADA interactive process with no documentation\n\nMedium-Risk (30-Day Review):\n- Employees at FMLA exhaustion without ADA follow-up\n- State PFL non-concurrent designation without written policy\n- Open accommodation requests >30 days unanswered\n\n## Accommodation Tracking\n- Accommodation request rates by job function\n- Time-to-resolution by HR partner (staleness indicator)\n- Denial rate >30% warrants attorney review of interactive process quality`,
  },
];

const KB_SOURCES = [
  {
    title: "FMLA Regulations, DOL Opinion Letters & WHD Guidance",
    displayName: "FMLA Regulations, DOL Opinion Letters & WHD Guidance",
    content: `# FMLA Regulations, DOL Opinion Letters & Wage and Hour Division Guidance\n\n## Core FMLA Statute (29 U.S.C. §§ 2601–2654)\n\n### Employer Coverage (§2611(4))\n- Private sector: 50+ employees within 75 miles for 20+ workweeks in current or preceding calendar year\n- All public agencies and elementary/secondary schools regardless of size\n\n### Employee Eligibility (§2611(2) / 29 C.F.R. §825.110)\n1. Employed for at least 12 months (need not be consecutive)\n2. Worked at least 1,250 hours in 12-month period preceding leave\n3. Employed at worksite with 50+ employees within 75-mile radius\n\n### Leave Entitlement\n- 12 workweeks per 12-month period: serious health condition (employee/family), birth/adoption, qualifying military exigency\n- 26 workweeks: military caregiver leave for servicemember/veteran\n\n### Serious Health Condition (29 C.F.R. §825.113-115)\nSix categories: inpatient care; continuing treatment (3+ days incapacity + 2 treatments within 30 days); pregnancy/prenatal; chronic condition (2+ visits/year); permanent/long-term; multiple treatments\n\n## Key Notice Regulations (29 C.F.R. §825.300)\n- Eligibility notice: Within 5 business days of learning of FMLA-qualifying need\n- Designation notice: Within 5 business days of sufficient designation information\n- Medical certification: Provide 15 calendar days to return; specify deadline in notice\n- Cure period: Employee has 7 calendar days after written deficiency notice\n\n## Interference & Retaliation (§2615)\n- Interference: No showing of bad intent required (Bachelder v. America West)\n- Retaliation: Adverse action + causal connection\n- SOL: 2 years (3 years willful)\n\n## Key DOL Opinion Letters\n- FMLA 2020-1: Remote work performing reduced duties is NOT FMLA leave\n- FMLA 2019-2: Hours equivalent method for FMLA with varying schedules\n- FMLA 2018-2: Employer cannot count declined voluntary overtime toward 1,250-hour test`,
    tags: ["FMLA", "DOL", "leave-regulations", "federal", "certification", "designation", "interference"],
    metadata: { source: "29 U.S.C. §§ 2601–2654 / 29 C.F.R. Part 825 / DOL WHD Opinion Letters", lastUpdated: "2024-01-01", jurisdiction: "federal" },
  },
  {
    title: "ADA Regulations, EEOC Guidance on Reasonable Accommodation & Undue Hardship",
    displayName: "ADA Regulations, EEOC Guidance on Reasonable Accommodation & Undue Hardship",
    content: `# ADA / ADAAA / PWFA — Reasonable Accommodation & Undue Hardship\n\n## ADA as Amended (42 U.S.C. §§ 12101–12213)\n- Coverage: 15+ employees for 20+ weeks\n- Disability: Physical/mental impairment substantially limiting major life activity (broadly construed post-ADAAA)\n- "Substantially limits": Not demanding standard; episodic/remission conditions covered when active; mitigating measures excluded\n\n## Reasonable Accommodation (§12112(b)(5))\nModifications to application process, work environment, or manner of performing job:\n- Schedule modifications (part-time, modified hours, leave of absence)\n- Physical workspace modifications (ergonomic equipment, accessibility)\n- Reassignment to vacant position (if qualified; no bumping)\n- Remote work (post-COVID: harder to establish hardship)\n- Job restructuring (marginal functions only — essential functions cannot be eliminated)\n\n## Undue Hardship (§12111(10) / 29 C.F.R. §1630.2(p))\nFactors: nature and cost; financial resources; type of operation; workforce composition; impact on facility\n\n## EEOC Enforcement Guidance (October 2002)\n- Interactive process required (not merely suggested); failure to engage is independently actionable\n- Medical information: only sufficient to verify disability and explain need for accommodation\n- "100% healed" return-to-work policies are independently unlawful\n- No magic words required ("reasonable accommodation" or "ADA" not required by employee)\n\n## Pregnancy Workers Fairness Act (PWFA) — 42 U.S.C. §2000gg; EEOC Final Rule April 15, 2024\n- Coverage: 15+ employees; effective June 27, 2023\n- Covers any limitation from pregnancy, childbirth, or related conditions (broader than ADA)\n- Cannot require leave if another accommodation is available\n- EEOC-enumerated accommodations: restroom breaks, sitting, drinking water, closer parking, light duty, modified PPE, modified food/beverage policies, predictable breaks, modified schedule, remote work, temporary suspension of essential functions (time-limited)`,
    tags: ["ADA", "ADAAA", "EEOC", "reasonable-accommodation", "undue-hardship", "interactive-process", "PWFA", "disability"],
    metadata: { source: "42 U.S.C. §§ 12101–12213 / 29 C.F.R. Part 1630 / EEOC Guidance", lastUpdated: "2024-04-15", jurisdiction: "federal" },
  },
  {
    title: "State-by-State Leave Law Matrix — Eligibility, Duration, Benefits & Notice Requirements",
    displayName: "State-by-State Leave Law Matrix — Eligibility, Duration, Benefits & Notice Requirements",
    content: `# State-by-State Leave Law Matrix\n\n## CALIFORNIA — Most Comprehensive Leave Framework\n\n### CFRA (Gov't Code §12945.2)\n- Employer: 5+ employees; Employee: 12 months + 1,250 hours; Entitlement: 12 weeks\n- Qualifying: Same as FMLA PLUS grandparent, grandchild, sibling, domestic partner\n- KEY: Baby Blues Amendment (2021/SB 1383): FMLA and CFRA for baby bonding run SEPARATELY = up to 24 total weeks for bonding\n\n### CA PDL (Gov't Code §12945)\n- Employer: 5+ employees; Entitlement: Up to 4 months (17.3 weeks) for pregnancy disability\n- Sequence: PDL concurrent with FMLA → CFRA bonding begins after PDL = up to ~7 months total\n\n### CA PFL (UI Code §3301+)\n- Duration: 8 weeks (2023); Benefit: 60-70% wages, SDI cap; No waiting period\n- Qualifying: Bonding within 12 months; care for seriously ill family member\n\n### CA Paid Sick Leave (Lab. Code §246)\n- 1 hr per 30 hrs worked; 40/80 hours front-loaded option (2024 expansion)\n\n## NEW YORK\n- NY PFL: 12 weeks at 67% SAWW ($1,151.16/week max 2024); all employers; bonding + family care + military\n- Employee eligibility: 26 consecutive weeks or 175 days (part-time)\n- NYSHRL disability accommodation: 4+ employees (broader than ADA)\n- NYC PSL: 56 hours paid (5+ employees); 40 hours unpaid (<5)\n\n## WASHINGTON STATE\n- WA PFML (RCW 50A): 12 weeks family/medical; 16 weeks combined; 18 weeks pregnancy complications\n- Benefit: 90% wages up to 50% SAWW + 50% above; $1,542/week max (2024)\n- Eligibility: 820+ hours in qualifying period; 1+ employees\n\n## NEW JERSEY\n- NJ FLI: 12 weeks at 85% wages ($1,055/week max 2024); bonding + family care\n- CRITICAL: NJ FLI and FMLA do NOT run concurrently for family care\n- NJ TDI: 26 weeks for employee's own disability at 85% wages\n- NJFLA: 30+ employees; 12 months + 1,000 hours; 12 weeks in 24-month period\n\n## COLORADO\n- CO FAMLI: 12 weeks (16 pregnancy complications); 90% wages up to 50% SAWW; effective Jan 2024\n- CO Healthy Families and Workplaces Act: 1 hr/30 hrs; max 48 hours sick leave\n\n## MASSACHUSETTS\n- MA PFML: Medical 20 weeks; Family 12 weeks; Combined 26 weeks; max $1,149.90/week (2024)\n\n## OREGON\n- OR Paid Leave (ORS 657B): Effective Sept 2023; 12 weeks; 14 weeks pregnancy; benefit 60-100% wages\n\n## STATE PFL SUMMARY TABLE\n| State | Duration | Max Benefit (2024) | Effective |\n|-------|---------|-------------------|----------|\n| CA PFL | 8 weeks | SDI cap ~$1,620/wk | 2004 |\n| NY PFL | 12 weeks | $1,151.16/wk | 2018 |\n| WA PFML | 12-18 weeks | ~$1,542/wk | 2020 |\n| NJ FLI | 12 weeks | $1,055/wk | 2009 |\n| CO FAMLI | 12-16 weeks | ~$1,100/wk | 2024 |\n| MA PFML | 12-20 weeks | $1,149.90/wk | 2021 |\n| CT PFL | 12 weeks | ~$1,400/wk | 2022 |\n| OR PFL | 12-14 weeks | ~$1,523/wk | 2023 |\n| DC PFML | 12 weeks | ~90% SAWW | 2020 |\n\n## MANDATORY PAID SICK LEAVE\nStates with PSL: AZ, CA, CO, CT, IL, MA, MD, MI, MN, NJ, NM, NV, NY, OR, RI, VA, VT, WA, DC + 80+ municipalities`,
    tags: ["state-leave", "CFRA", "PFL", "sick-leave", "multi-jurisdiction", "NY-PFL", "WA-PFML", "CO-FAMLI"],
    metadata: { source: "50-State Legislative Research / State Agency Regulations", lastUpdated: "2024-04-01", jurisdiction: "multi-state" },
  },
  {
    title: "Local Sick Leave Ordinance Database — Municipal Compliance Specifications",
    displayName: "Local Sick Leave Ordinance Database — Municipal Compliance Specifications",
    content: `# Local Sick Leave Ordinance Database\n\n## CALIFORNIA LOCAL ORDINANCES\n\n### Los Angeles (LAMC §187.04)\n- 26+ employees: 1 hr/30 hrs; cap 48 hours/year; carryover 72 hours\n- 25 or fewer employees: 1 hr/30 hrs; cap 32 hours/year\n\n### San Francisco (SFPC Article 12W)\n- All employers; 1 hr/30 hrs; no annual accrual cap\n- Carryover: 72 hours (72+ employees); 40 hours (<72 employees)\n- May require documentation only for 3+ consecutive days\n\n### Oakland (OMC Chapter 5.92)\n- 1 hr/30 hrs; Large (100+): 72 hours/year; Medium (26-99): 72 hours; Small (<26): 40 hours\n\n## NEW YORK\n\n### New York City (NYC Admin. Code §20-912+)\n- 5+ employees: 56 hours paid; domestic workers: 40 hours paid regardless of size\n- Safe leave (domestic violence, sexual assault): same allotment\n- Documentation: may require for 3+ consecutive days only; cannot require diagnosis\n\n## ILLINOIS\n\n### Chicago (MCC §1-24, amended 2023 — Chicago ESSTA)\n- 1 hr/35 hrs; max 40 hours paid sick; 40 hours unpaid family\n- Carryover: 50% unused hours (max 20 hours)\n- Domestic violence/sexual assault covered as safe leave\n\n### Cook County\n- 1 hr/40 hrs; max 40 hours/year; carryover 50% (max 20 hours)\n- Note: Many Cook County suburbs have opted out — verify municipality\n\n## WASHINGTON\n\n### Seattle (SMC 14.16)\n- Tier 1 (1-49 FTEs): 40 hours/year; Tier 2 (50-249): 56 hours; Tier 3 (250+): 72 hours\n- All unused hours carry over (no cap)\n\n## TEXAS — ENJOINED\n- Dallas, Austin, San Antonio ordinances currently enjoined; verify enforcement status before advising\n\n## COMPLIANCE RULES FOR MULTI-LOCATION EMPLOYERS\n1. Identify all cities/counties where employees work\n2. Apply most protective standard (state vs. local)\n3. Track separately where local law differs from state\n4. Provide required notices by jurisdiction (some require notice at hire)\n5. Many ordinances include domestic violence/safe leave as covered usage`,
    tags: ["local-sick-leave", "municipal-ordinances", "NYC", "San Francisco", "Chicago", "Seattle"],
    metadata: { source: "Municipal Codes / Local Agency Regulations", lastUpdated: "2024-04-01", jurisdiction: "local-municipal" },
  },
  {
    title: "Accommodation Ideas Library — By Disability Type and Job Function",
    displayName: "Accommodation Ideas Library — By Disability Type and Job Function",
    content: `# Accommodation Ideas Library\n## Source: JAN (Job Accommodation Network) / EEOC Enforcement Guidance\n\n## BY DISABILITY/CONDITION TYPE\n\n### Musculoskeletal (Back, Neck, Joint)\nFunctional limitations: prolonged sitting/standing, lifting, bending\nAccommodations: ergonomic chair with lumbar support, sit-stand workstation, anti-fatigue mat, closer parking, modified lifting restrictions, reduced hours during flare-ups, ergonomic keyboard/mouse\n\n### Mental Health (Depression, Anxiety, PTSD, Bipolar)\nFunctional limitations: concentration, stress tolerance, attendance, social interaction\nAccommodations: modified work schedule (flexible hours, later start), reduced workload during flare-ups, private workspace/noise-canceling headphones, written instructions, regular structured feedback, telework on high-symptom days, modified supervision, additional breaks\n\n### Neurological (ADHD, Autism Spectrum, TBI)\nFunctional limitations: concentration, organization, time management, sensory processing\nAccommodations: quiet workspace, written task lists, electronic reminders, modified schedule, extended deadlines, telework, designated support person\n\n### Chronic Conditions (Diabetes, Lupus, Crohn's, Fibromyalgia, Cancer)\nFunctional limitations: fatigue, unpredictable absences, medication side effects\nAccommodations: flexible schedule for appointments/treatment, telework, additional breaks, medication storage, modified duty during treatment, reduced travel\n\n### Pregnancy (PWFA-Specific per EEOC Final Rule, April 2024)\nAccommodations: frequent restroom breaks, ability to sit, drinking water, closer parking, light duty, modified food/beverage policies, additional restroom time, modified schedule, remote work, modified PPE, predictable break schedule, temporary suspension of essential functions (time-limited)\n\n### Vision Impairments\nAccommodations: screen magnification (ZoomText), screen reader (JAWS, NVDA), large monitor, Braille materials, modified lighting, document conversion, accessible interfaces\n\n### Hearing Impairments\nAccommodations: sign language interpreters, CART, video relay services, captioning, written communication preference, visual alerting systems\n\n## BY JOB FUNCTION\n\n### Office/Administrative\nErgonomic workstation, voice-recognition software, modified schedule, private workspace, telework\n\n### Healthcare Workers\nModified patient care assignments, transfer to administrative role (temporary), modified lifting, adjusted shift timing, modified PPE\n\n### Retail/Warehouse/Physical Labor\nErgonomic tools, modified lifting (buddy system), sit-stand stool, anti-fatigue matting, modified schedule, reassignment to less physical role\n\n### Management/Executive\nAll mental health accommodations above, reduced travel, flexible meeting schedule\n\n## ACCOMMODATION FEASIBILITY QUICK REFERENCE\n| Accommodation | Typical Cost | Common Hardship Defense |\n|--------------|-------------|------------------------|\n| Ergonomic equipment | Low ($100-500) | Almost never |\n| Telework | None-Low | Rarely (post-COVID) |\n| Modified schedule | None | Sometimes |\n| Additional breaks | None | Rarely |\n| Reassignment | None-Low | Sometimes |\n| Indefinite leave | High | Often (if truly indefinite) |`,
    tags: ["accommodations", "disability", "ADA", "PWFA", "JAN", "ergonomic", "mental-health"],
    metadata: { source: "JAN (Job Accommodation Network) / EEOC Enforcement Guidance", lastUpdated: "2024-04-15", jurisdiction: "federal" },
  },
  {
    title: "Leave Notice Templates — By Jurisdiction and Leave Type",
    displayName: "Leave Notice Templates — By Jurisdiction and Leave Type",
    content: `# Leave Notice Templates\n## Required Content Frameworks by Jurisdiction and Leave Type\n\n## FMLA NOTICE TEMPLATES (Framework Content Only — Must Customize)\n\n### Template 1: Notice of Eligibility and Rights (WH-381 Framework)\nRequired content: eligibility determination (yes/no with reasons), rights during FMLA leave, responsibilities (notice, certification, substitution), medical certification deadline (15 calendar days), certification form enclosed (WH-380-E or WH-380-F)\n\n### Template 2: Designation Notice (WH-382 Framework)\nRequired content: whether leave is FMLA-designated, amount counting against entitlement, concurrent running status, fitness-for-duty requirement (if any, with essential functions list), remaining FMLA balance\n\n### Template 3: Medical Certification Deficiency Cure Notice\nRequired: specific deficiencies identified, 7-calendar-day cure deadline, consequences of failure to cure (FMLA denial), HR contact information\n\n## CALIFORNIA NOTICE TEMPLATES\n\n### Template 4: CFRA Baby Blues Notice\nRequired content: Inform employee that FMLA and CFRA baby bonding run SEPARATELY since Jan 1, 2021 (SB 1383); employee may elect simultaneous (12 total) or sequential (24 total) designation; election form with deadline\n\n### Template 5: PDL + CFRA + PFL Sequence Notice\nRequired content: PDL duration (up to 4 months), concurrent FMLA during PDL, CFRA baby bonding begins after PDL (separate 12-week entitlement), CA PFL wage replacement (apply directly with EDD), CA SDI during disability period (apply directly with EDD)\n\n## ADA/PWFA CORRESPONDENCE TEMPLATES\n\n### Template 6: Interactive Process Initiation Letter\nRequired content: acknowledgment of accommodation request with date, interactive process meeting invitation (date, time, participants), request for medical information (specify what needed and why), confidentiality assurance, contact information\n\n### Template 7: Accommodation Grant Letter\nRequired content: description of approved accommodation, effective date and duration, implementation steps, trial period (if any), follow-up review schedule\n\n### Template 8: Accommodation Denial Letter (DRAFT ONLY — ATTORNEY REVIEW REQUIRED)\nRequired content: all alternatives explored and reason rejected, specific undue hardship basis (not boilerplate), any alternative offered, request for additional employee information if any, contact for follow-up\nWARNING: Never send accommodation denial without attorney review\n\n## NOTICE DEADLINE QUICK REFERENCE\n| Notice | Trigger | Deadline |\n|--------|---------|----------|\n| FMLA Eligibility (WH-381) | Learn of FMLA need | 5 business days |\n| FMLA Designation (WH-382) | Sufficient info to designate | 5 business days |\n| Cert deficiency cure | Receipt of incomplete cert | 7 calendar days |\n| CA CFRA Baby Blues election | Employee eligible for both | 5 business days |\n| NY PFL rights notice | New hire | With hire documents |\n| ADA acknowledgment | Accommodation request | 5 business days (best practice) |`,
    tags: ["leave-notices", "FMLA-templates", "WH-381", "WH-382", "ADA-letters", "CFRA"],
    metadata: { source: "DOL WH Forms / EEOC Guidance / State Agency Forms", lastUpdated: "2024-04-01", jurisdiction: "federal-and-state" },
  },
];

const RUNBOOKS = [
  {
    organizationId: ORG, name: "New State Leave Law Effective — Implementation Procedure",
    description: "Procedure for when a new state or local leave law becomes effective. Covers impact assessment, system configuration, policy updates, manager training, and required notice updates for affected employer clients.",
    industry: "legal_services", category: "compliance", triggerType: "automatic",
    triggerConditions: [{ type: "event", event: "new_leave_law_effective", source: "legislative_tracker", threshold: "effective_date_within_60_days" }],
    steps: [
      { id: "1", type: "action", action: "identify_affected_employers", label: "Identify all client employers operating in affected jurisdiction", order: 1 },
      { id: "2", type: "action", action: "assess_impact", label: "Assess impact on existing leave policies and programs", order: 2 },
      { id: "3", type: "condition", condition: "new_law_more_restrictive", label: "Is new law more restrictive than existing policy?", trueNext: "4", falseNext: "6", order: 3 },
      { id: "4", type: "action", action: "draft_policy_amendments", label: "Draft required policy amendments and handbook updates", order: 4 },
      { id: "5", type: "action", action: "update_notice_templates", label: "Update jurisdiction-specific notice templates and required postings", order: 5 },
      { id: "6", type: "approval_gate", label: "Attorney review of policy amendments and client communications", approvalLevel: "confirm_before", order: 6 },
      { id: "7", type: "action", action: "configure_system_parameters", label: "Update leave management system: accrual rates, caps, carryover rules, eligibility thresholds", order: 7 },
      { id: "8", type: "action", action: "manager_training", label: "Distribute manager training bulletin with effective date and key requirements", order: 8 },
      { id: "9", type: "action", action: "client_alert", label: "Issue Littler Insight client alert summarizing new law and recommended actions", order: 9 },
    ],
    approvalConfig: { requiredApprovers: ["leave_practice_attorney"], autoApproveAfterHours: null },
    confidentiality: "internal", estimatedDuration: "5-7 business days",
    tags: ["leave-law", "compliance", "policy-update", "new-law"],
    metadata: { jurisdiction: "varies", lastReviewed: "2024-01-01" }, agentId: null,
  },
  {
    organizationId: ORG, name: "Leave Fraud Investigation — Protected Leave Rights Safeguards",
    description: "Investigation procedure for suspected leave fraud/abuse. CRITICAL: All investigative actions require attorney consultation first. Balances employer's legitimate interest with FMLA interference and retaliation prohibitions.",
    industry: "legal_services", category: "investigation", triggerType: "manual",
    triggerConditions: [{ type: "threshold", metric: "leave_pattern_abuse_score", threshold: "high", source: "leave_analytics_skill" }],
    steps: [
      { id: "1", type: "action", action: "document_triggering_facts", label: "Document specific, objective facts triggering concern (avoid subjective characterizations)", order: 1 },
      { id: "2", type: "approval_gate", label: "MANDATORY attorney consultation before any investigation action — confirm protected leave status and permissible tools", approvalLevel: "confirm_before", order: 2 },
      { id: "3", type: "condition", condition: "leave_is_fmla_designated", label: "Is leave FMLA-designated?", trueNext: "4", falseNext: "7", order: 3 },
      { id: "4", type: "action", action: "review_certification", label: "Review certification; if pattern inconsistent, request recertification (not sooner than 30 days)", order: 4 },
      { id: "5", type: "action", action: "assess_permissible_surveillance", label: "Assess permissible investigation tools: public surveillance permitted; private medical appointments NOT subject to surveillance", order: 5 },
      { id: "6", type: "action", action: "hcp_authentication_only", label: "If needed: HR/leave administrator may contact HCP to authenticate or clarify cert ONLY (not supervisor; not seek additional info)", order: 6 },
      { id: "7", type: "action", action: "document_findings", label: "Document all investigation activities and findings in writing with dates", order: 7 },
      { id: "8", type: "approval_gate", label: "Attorney review of findings before any corrective action", approvalLevel: "confirm_before", order: 8 },
    ],
    approvalConfig: { requiredApprovers: ["leave_practice_attorney", "employment_counsel"], autoApproveAfterHours: null },
    confidentiality: "privileged", estimatedDuration: "2-4 weeks",
    tags: ["leave-fraud", "investigation", "FMLA-interference", "attorney-required"],
    metadata: { jurisdiction: "federal", lastReviewed: "2024-01-01" }, agentId: null,
  },
  {
    organizationId: ORG, name: "Mass Leave Event — Emergency Protocol (Pandemic, Natural Disaster)",
    description: "Emergency protocol for managing mass concurrent leave requests during pandemic, natural disaster, or widespread workforce disruption. Covers emergency designation, tracking, and return-to-work planning.",
    industry: "legal_services", category: "emergency", triggerType: "automatic",
    triggerConditions: [{ type: "threshold", metric: "concurrent_leave_requests", threshold: "exceeds_10_percent_workforce", source: "hr_system" }],
    steps: [
      { id: "1", type: "action", action: "activate_leave_team", label: "Activate dedicated leave management team; assign administrator to each business unit", order: 1 },
      { id: "2", type: "action", action: "assess_emergency_laws", label: "Assess applicable emergency leave laws: FFCRA equivalents, state emergency programs, emergency sick leave ordinances", order: 2 },
      { id: "3", type: "action", action: "implement_tracking", label: "Implement mass leave tracking: reason codes, entitlement buckets, return-to-work dates", order: 3 },
      { id: "4", type: "action", action: "modified_notice_procedures", label: "Implement modified FMLA notice procedures; accept electronic certifications; reduce advance notice requirement", order: 4 },
      { id: "5", type: "action", action: "coordinate_state_programs", label: "Coordinate state emergency paid sick leave, PFL, and UI eligibility for affected employees", order: 5 },
      { id: "6", type: "action", action: "employer_communication", label: "Issue workforce communication: available leave rights, how to request, return-to-work protocols, benefit continuation", order: 6 },
      { id: "7", type: "action", action: "return_to_work_plan", label: "Develop return-to-work plan: fitness-for-duty protocols, staggered return, accommodation requests for vulnerable employees", order: 7 },
    ],
    approvalConfig: { requiredApprovers: ["senior_hr_leadership", "employment_counsel"], autoApproveAfterHours: 4 },
    confidentiality: "internal", estimatedDuration: "Ongoing during event",
    tags: ["mass-leave", "emergency", "pandemic", "return-to-work"],
    metadata: { jurisdiction: "varies", lastReviewed: "2024-01-01" }, agentId: null,
  },
  {
    organizationId: ORG, name: "ADA Litigation Hold — Accommodation Documentation Preservation",
    description: "Procedure for preserving all accommodation-related documentation when ADA/PWFA litigation is threatened or filed. Ensures interactive process records, certifications, and decision rationale are preserved under attorney-client privilege.",
    industry: "legal_services", category: "litigation", triggerType: "manual",
    triggerConditions: [{ type: "event", event: "eeoc_charge_filed", source: "legal_tracker", threshold: "any_ada_charge" }],
    steps: [
      { id: "1", type: "action", action: "identify_custodians", label: "Identify all document custodians: HR, direct manager, skip-level, IT, legal, EAP (if involved)", order: 1 },
      { id: "2", type: "action", action: "issue_hold_notice", label: "Issue written litigation hold notice to all custodians; document delivery dates and acknowledgments", order: 2 },
      { id: "3", type: "action", action: "preserve_hr_records", label: "Preserve all accommodation records: request forms, medical documentation, interactive process notes, correspondence, decision letters", order: 3 },
      { id: "4", type: "action", action: "suspend_auto_deletion", label: "Suspend auto-deletion of relevant email, HRIS records, calendar entries, instant messages related to employee", order: 4 },
      { id: "5", type: "action", action: "privilege_assessment", label: "Attorney reviews all documents for privilege; segregate privileged communications before any disclosure", order: 5 },
      { id: "6", type: "action", action: "audit_interactive_process", label: "Attorney conducts privileged audit of interactive process completeness", order: 6 },
      { id: "7", type: "action", action: "eeoc_position_statement", label: "If EEOC charge: prepare position statement within response deadline (typically 30 days; extensions available)", order: 7 },
    ],
    approvalConfig: { requiredApprovers: ["employment_counsel", "litigation_attorney"], autoApproveAfterHours: null },
    confidentiality: "privileged", estimatedDuration: "Immediate; ongoing through litigation",
    tags: ["ADA", "litigation-hold", "EEOC", "document-preservation"],
    metadata: { jurisdiction: "federal", lastReviewed: "2024-01-01" }, agentId: null,
  },
  {
    organizationId: ORG, name: "Third-Party Leave Administrator Integration — Data Sync & Discrepancy Resolution",
    description: "Procedure for managing leave administration with a third-party leave administrator (TPA). Covers data synchronization, eligibility discrepancy resolution, and ongoing coordination protocols.",
    industry: "legal_services", category: "integration", triggerType: "automatic",
    triggerConditions: [{ type: "event", event: "eligibility_discrepancy_detected", source: "tpa_feed", threshold: "discrepancy_rate_above_2_percent" }],
    steps: [
      { id: "1", type: "action", action: "establish_data_fields", label: "Define canonical data fields: employee ID, hire date, hours, work location, leave type, certification status, balance", order: 1 },
      { id: "2", type: "action", action: "configure_sync", label: "Configure real-time vs. batch sync; define authoritative source for each data field (HRIS vs. TPA)", order: 2 },
      { id: "3", type: "action", action: "test_eligibility_sync", label: "Test eligibility sync with 10% sample population; validate tenure, hours, worksite coverage calculations", order: 3 },
      { id: "4", type: "condition", condition: "discrepancy_detected", label: "Eligibility discrepancy detected?", trueNext: "5", falseNext: "7", order: 4 },
      { id: "5", type: "action", action: "investigate_discrepancy", label: "Identify root cause: data entry error / different hours methodology / worksite count / service date discrepancy", order: 5 },
      { id: "6", type: "action", action: "resolve_discrepancy", label: "Resolve with correction to authoritative source; document resolution and prevent recurrence", order: 6 },
      { id: "7", type: "action", action: "monthly_reconciliation", label: "Monthly reconciliation report: TPA approvals vs. employer eligibility records; flag divergence >1%", order: 7 },
    ],
    approvalConfig: { requiredApprovers: ["leave_admin_manager", "hris_admin"], autoApproveAfterHours: 24 },
    confidentiality: "internal", estimatedDuration: "2-4 weeks initial; ongoing monitoring",
    tags: ["TPA", "leave-administration", "data-sync", "eligibility"],
    metadata: { jurisdiction: "varies", lastReviewed: "2024-01-01" }, agentId: null,
  },
  {
    organizationId: ORG, name: "DOL FMLA Complaint Investigation — Response Protocol",
    description: "Procedure for responding to a Department of Labor Wage and Hour Division (DOL WHD) FMLA complaint or investigation. Covers file audit, attorney engagement, document production, and response preparation.",
    industry: "legal_services", category: "regulatory-response", triggerType: "manual",
    triggerConditions: [{ type: "event", event: "dol_complaint_received", source: "legal_tracker", threshold: "any_fmla_complaint" }],
    steps: [
      { id: "1", type: "action", action: "attorney_engagement", label: "Immediately engage employment/FMLA attorney; all communications through counsel from this point", order: 1 },
      { id: "2", type: "action", action: "preserve_records", label: "Implement litigation hold: preserve all FMLA records for complainant and similarly situated employees (3-year minimum)", order: 2 },
      { id: "3", type: "action", action: "fmla_file_audit", label: "Attorney-directed privileged audit: eligibility determinations, notice timeliness, certification process, designation decisions, return-to-work handling", order: 3 },
      { id: "4", type: "action", action: "identify_systemic_issues", label: "Assess whether isolated incident or systemic compliance failure; determine scope of exposure", order: 4 },
      { id: "5", type: "action", action: "document_production", label: "Prepare document production: FMLA policy, employee notices, certifications, designation notices, relevant communications", order: 5 },
      { id: "6", type: "action", action: "calculate_exposure", label: "Calculate potential exposure: back wages, liquidated damages (2×), reinstatement obligations, civil money penalties", order: 6 },
      { id: "7", type: "action", action: "prepare_response", label: "Prepare and submit response through attorney; include remediation steps to demonstrate good faith", order: 7 },
      { id: "8", type: "action", action: "remediation_plan", label: "Implement remediation plan for confirmed violations; document corrective actions for DOL cooperation credit", order: 8 },
    ],
    approvalConfig: { requiredApprovers: ["senior_employment_counsel", "hr_leadership"], autoApproveAfterHours: null },
    confidentiality: "privileged", estimatedDuration: "4-12 weeks depending on scope",
    tags: ["DOL", "FMLA-investigation", "WHD", "regulatory-response", "attorney-required"],
    metadata: { jurisdiction: "federal", lastReviewed: "2024-01-01" }, agentId: null,
  },
];

const POLICIES = [
  {
    organizationId: ORG, name: "FMLA Compliance & Administration Policy",
    description: "Governs agent compliance with FMLA procedural requirements: notice deadlines, eligibility determinations, certification management, designation decisions, and anti-interference/retaliation safeguards.",
    domain: "content_boundaries", status: "active", version: 1,
    policyJson: {
      rules: [
        { id: "fmla-1", description: "Issue FMLA eligibility notice within 5 business days of learning of qualifying need", severity: "CRITICAL", enforcement: "hard_block" },
        { id: "fmla-2", description: "Issue FMLA designation notice within 5 business days of receiving sufficient designation information", severity: "CRITICAL", enforcement: "hard_block" },
        { id: "fmla-3", description: "Never advise employer to rescind FMLA designation of qualifying leave without attorney review", severity: "CRITICAL", enforcement: "hard_block" },
        { id: "fmla-4", description: "Require medical certification only for FMLA-qualifying reasons; never require diagnosis disclosure", severity: "HIGH", enforcement: "require_confirmation" },
        { id: "fmla-5", description: "Always present interference and retaliation risk analysis when employer considers action against employee on or returning from FMLA", severity: "CRITICAL", enforcement: "require_confirmation" },
      ],
      citation_requirements: ["29 U.S.C. §§ 2601-2654", "29 C.F.R. Part 825"],
      escalation_policy: "Any FMLA-designated employee who receives adverse action within 12 months requires immediate attorney escalation.",
    },
    tags: ["FMLA", "leave-compliance", "notice", "designation", "interference"],
    effectiveDate: new Date().toISOString(), scopeId: null, scopeType: "agent",
  },
  {
    organizationId: ORG, name: "ADA Reasonable Accommodation Compliance Policy",
    description: "Ensures agent guidance on ADA accommodations follows legally required interactive process, prevents undue hardship claims without analysis, and prevents discriminatory accommodation denials.",
    domain: "content_boundaries", status: "active", version: 1,
    policyJson: {
      rules: [
        { id: "ada-1", description: "Never recommend denying an accommodation request without exhausting interactive process and consulting attorney", severity: "CRITICAL", enforcement: "hard_block" },
        { id: "ada-2", description: "Apply post-ADAAA expansive disability definition; do not require substantial limitation of 'work' specifically", severity: "CRITICAL", enforcement: "hard_block" },
        { id: "ada-3", description: "Mandatory disclaimer on all accommodation denial guidance: attorney review required before sending", severity: "CRITICAL", enforcement: "hard_block" },
        { id: "ada-4", description: "Do not recommend elimination of essential job functions; only marginal functions may be restructured", severity: "HIGH", enforcement: "require_confirmation" },
        { id: "ada-5", description: "Include ADA leave as accommodation analysis whenever FMLA exhaustion is approached", severity: "HIGH", enforcement: "require_confirmation" },
      ],
      citation_requirements: ["42 U.S.C. §§ 12101-12213", "29 C.F.R. Part 1630", "EEOC Enforcement Guidance October 2002"],
      escalation_policy: "All accommodation denial recommendations require Littler attorney sign-off.",
    },
    tags: ["ADA", "accommodation", "interactive-process", "disability", "undue-hardship"],
    effectiveDate: new Date().toISOString(), scopeId: null, scopeType: "agent",
  },
  {
    organizationId: ORG, name: "Pregnancy Workers Fairness Act (PWFA) Compliance Policy",
    description: "Governs agent compliance with PWFA requirements effective June 27, 2023 and EEOC Final Rule April 15, 2024.",
    domain: "content_boundaries", status: "active", version: 1,
    policyJson: {
      rules: [
        { id: "pwfa-1", description: "Apply PWFA to all employers with 15+ employees for any limitation related to pregnancy, childbirth, or related medical condition — even if not ADA disability", severity: "CRITICAL", enforcement: "hard_block" },
        { id: "pwfa-2", description: "Do not advise requiring employee to take leave when another reasonable accommodation is available under PWFA", severity: "CRITICAL", enforcement: "hard_block" },
        { id: "pwfa-3", description: "Include EEOC-enumerated PWFA accommodations in all pregnancy accommodation analyses (per April 2024 Final Rule)", severity: "HIGH", enforcement: "require_confirmation" },
        { id: "pwfa-4", description: "Apply PWFA to related conditions broadly: hyperemesis, gestational diabetes, postpartum, lactation", severity: "HIGH", enforcement: "require_confirmation" },
      ],
      citation_requirements: ["42 U.S.C. §§ 2000gg - 2000gg-6", "EEOC Final Rule on PWFA (April 15, 2024)", "29 C.F.R. Part 1636"],
      escalation_policy: "Any PWFA accommodation denial requires attorney review.",
    },
    tags: ["PWFA", "pregnancy", "accommodation", "EEOC", "2023"],
    effectiveDate: new Date().toISOString(), scopeId: null, scopeType: "agent",
  },
  {
    organizationId: ORG, name: "State Paid Family Leave Compliance Policy",
    description: "Ensures agent guidance on state PFL programs is accurate, current, and correctly identifies concurrent running obligations and benefit coordination rules.",
    domain: "content_boundaries", status: "active", version: 1,
    policyJson: {
      rules: [
        { id: "spfl-1", description: "Always check for state-specific PFL program in employee's work state before any leave eligibility determination", severity: "CRITICAL", enforcement: "hard_block" },
        { id: "spfl-2", description: "Apply Baby Blues concurrent-running exception: FMLA and CFRA run SEPARATELY for baby bonding in California since Jan 1, 2021 (SB 1383)", severity: "CRITICAL", enforcement: "hard_block" },
        { id: "spfl-3", description: "Note NJ FLI and FMLA do NOT run concurrently for family care leave", severity: "HIGH", enforcement: "require_confirmation" },
        { id: "spfl-4", description: "State PFL benefit rates change annually — cite current year rates and flag if data may be outdated", severity: "HIGH", enforcement: "require_confirmation" },
      ],
      citation_requirements: ["CA UI Code §3300+", "NY WCL Art. 9-A", "RCW 50A", "N.J.S.A. 43:21-27", "C.R.S. §8-13.3-501+"],
      escalation_policy: "Multi-state employee PFL coordination requires attorney review.",
    },
    tags: ["PFL", "state-leave", "CFRA", "NY-PFL", "WA-PFML", "baby-bonding"],
    effectiveDate: new Date().toISOString(), scopeId: null, scopeType: "agent",
  },
  {
    organizationId: ORG, name: "State & Local Mandatory Sick Leave Policy",
    description: "Governs agent compliance with the patchwork of 15+ state and 80+ municipal mandatory paid sick leave laws. Ensures the most protective standard is applied for each employee worksite.",
    domain: "content_boundaries", status: "active", version: 1,
    policyJson: {
      rules: [
        { id: "msl-1", description: "Apply most protective sick leave standard (state vs. local vs. employer policy) for each employee's work location", severity: "CRITICAL", enforcement: "hard_block" },
        { id: "msl-2", description: "Check for local ordinance in addition to state law for CA, IL, NY, WA employees — municipal ordinances may exceed state requirements", severity: "HIGH", enforcement: "require_confirmation" },
        { id: "msl-3", description: "Include domestic violence/sexual assault safe leave as covered usage reason in all applicable jurisdictions", severity: "HIGH", enforcement: "require_confirmation" },
        { id: "msl-4", description: "Note Texas municipal sick leave ordinances are currently enjoined — advise employer to check current enforcement status", severity: "MEDIUM", enforcement: "soft_warn" },
      ],
      citation_requirements: ["State sick leave statutes", "Municipal codes", "Agency enforcement guidance by jurisdiction"],
      escalation_policy: "Employer operating in 5+ PSL jurisdictions should have dedicated annual compliance review.",
    },
    tags: ["sick-leave", "PSL", "municipal", "local-ordinance", "multi-jurisdiction"],
    effectiveDate: new Date().toISOString(), scopeId: null, scopeType: "agent",
  },
  {
    organizationId: ORG, name: "USERRA Military Leave Compliance Policy",
    description: "Ensures agent guidance on military leave under USERRA is accurate. Covers reemployment rights, benefit continuation, and interaction of military leave with FMLA and state leave laws.",
    domain: "content_boundaries", status: "active", version: 1,
    policyJson: {
      rules: [
        { id: "userra-1", description: "USERRA applies to ALL employers regardless of size — no minimum employee threshold", severity: "CRITICAL", enforcement: "hard_block" },
        { id: "userra-2", description: "Reemployment rights: employee entitled to escalator position (same position with seniority and benefits accrued as if continuously employed)", severity: "CRITICAL", enforcement: "hard_block" },
        { id: "userra-3", description: "USERRA leave and FMLA entitlements are SEPARATE and independent — military leave does not reduce FMLA entitlement", severity: "HIGH", enforcement: "require_confirmation" },
        { id: "userra-4", description: "Health insurance continuation: employee may elect to continue coverage at own cost for up to 24 months during service", severity: "HIGH", enforcement: "require_confirmation" },
        { id: "userra-5", description: "USERRA has no statute of limitations for willful violations", severity: "HIGH", enforcement: "require_confirmation" },
      ],
      citation_requirements: ["38 U.S.C. §§ 4301-4335", "20 C.F.R. Part 1002"],
      escalation_policy: "Failure to reemploy returning servicemember requires immediate attorney review.",
    },
    tags: ["USERRA", "military-leave", "reemployment", "veteran"],
    effectiveDate: new Date().toISOString(), scopeId: null, scopeType: "agent",
  },
];

const GOLDEN_DATASET = {
  organizationId: ORG,
  name: "Leave & Accommodation Management Agent — Golden Dataset",
  description: "Curated evaluation dataset for LIT-AGT-010. Covers multi-state leave eligibility, concurrent leave stacking, ADA/PWFA interactive process, leave notice requirements, intermittent leave balance calculations, and complex overlap edge cases.",
  industry: "legal_services",
  useCase: "Leave & Accommodation Management",
  version: "1.0",
  scenarioCategories: { edgeCases: 2, happyPath: 1, adversarial: 0, complianceCritical: 3 },
  qualityCoverage: 92,
  coverageDimensions: [
    "Multi-jurisdiction FMLA eligibility (50-state matrix)",
    "California CFRA Baby Blues amendment (FMLA + CFRA separation)",
    "ADA interactive process completeness",
    "PWFA accommodation identification (post-April 2024 EEOC rule)",
    "Intermittent FMLA balance calculation (rolling backward method)",
    "Multi-state employee leave intersection (NY + NJ)",
    "FMLA notice content and deadline compliance",
  ],
  benchmarkRange: { low: 88, high: 97 },
  contributors: [], growthHistory: [],
  status: "active",
  tags: ["leave-management", "FMLA", "ADA", "PWFA", "CFRA", "PFL", "accommodation", "LIT-AGT-010"],
  aiGenerated: false,
  performanceBenchmarks: {
    leaveEligibilityAccuracy: { target: 0.95, description: "Correct eligibility determination vs. attorney-reviewed ground truth" },
    concurrentLeaveAccuracy: { target: 0.97, description: "Correct concurrent running determination and balance calculations" },
    noticeRequirementAccuracy: { target: 0.95, description: "Identifies all required notices by jurisdiction and leave type" },
  },
  dataRecordCount: 3500,
};

const TEST_CASES = [
  {
    name: "California Birth — FMLA + CFRA + PDL + PFL Stacking Analysis",
    inputScenario: "Maria is a California-based employee (employer 75 employees, all in CA) with 2 years tenure and 40 hrs/week. She was disabled by pregnancy complications for 6 weeks before delivery. She gave birth 2 weeks ago and wishes to bond with her newborn. Determine her complete leave entitlement including all applicable leaves and state benefits.",
    expectedBehavior: "Apply FMLA/PDL concurrent running during pregnancy disability; identify Baby Blues Amendment — CFRA baby bonding runs SEPARATELY from FMLA (total potentially 24 weeks bonding); identify CA PDL up to 4 months pre/post delivery; identify CA PFL as wage replacement during CFRA; identify CA SDI during disability period.",
    evaluationCriteria: [
      "Correctly applies FMLA/PDL concurrent during pregnancy disability",
      "Identifies Baby Blues Amendment: CFRA baby bonding is SEPARATE from FMLA",
      "Sequences: PDL → FMLA concurrent → CFRA bonding (separate 12 additional weeks)",
      "Identifies CA PFL as wage replacement during CFRA bonding",
      "Identifies CA SDI for disability period (EDD application)",
      "Calculates total potential leave: PDL (17.3 wks) + CFRA bonding (12 wks) = ~29 weeks job-protected",
    ],
    rubricScoring: { dimensions: [{ name: "PDL/FMLA Concurrent Application", weight: 0.25, passingScore: 1.0 }, { name: "Baby Blues CFRA Separation", weight: 0.30, passingScore: 1.0 }, { name: "State Benefit Identification", weight: 0.20, passingScore: 0.8 }, { name: "Total Entitlement Calculation", weight: 0.15, passingScore: 0.9 }, { name: "Sequencing Accuracy", weight: 0.10, passingScore: 0.9 }] },
    category: "complianceCritical", difficulty: "complex", jurisdiction: "California",
    sourceDocuments: ["CFRA §12945.2", "CA PDL Gov't Code §12945", "SB 1383 Baby Blues (2021)"],
  },
  {
    name: "ADA Post-FMLA Leave Exhaustion — Interactive Process Trigger",
    inputScenario: "James (Ohio, employer 200 employees) has used all 12 weeks FMLA for degenerative disc disease. His doctor cleared him with permanent restrictions: no lifting >20 lbs, no standing >2 hours continuously. Job requires lifting 50 lbs and standing 6-8 hrs/shift. Employer considering termination. Is termination appropriate?",
    expectedBehavior: "Identify FMLA exhaustion triggers mandatory ADA interactive process; degenerative disc disease is ADA disability; identify potential accommodations (ergonomic support, modified shifts, sit-stand workstation, reassignment, light duty); termination without interactive process violates ADA §12112(b)(5); 'no restrictions' return-to-work policy is independently unlawful.",
    evaluationCriteria: ["Identifies FMLA exhaustion as ADA interactive process trigger", "Applies ADAAA expansive disability standard", "Identifies at least 4 potential accommodations", "States termination without interactive process violates ADA", "Identifies 'no restrictions' return-to-work policy as unlawful", "Recommends attorney consultation before adverse action"],
    rubricScoring: { dimensions: [{ name: "FMLA/ADA Transition", weight: 0.30, passingScore: 1.0 }, { name: "Disability Determination", weight: 0.20, passingScore: 0.9 }, { name: "Accommodation Identification", weight: 0.25, passingScore: 0.8 }, { name: "Legal Risk Assessment", weight: 0.15, passingScore: 1.0 }, { name: "Actionable Guidance", weight: 0.10, passingScore: 0.9 }] },
    category: "complianceCritical", difficulty: "complex", jurisdiction: "Ohio (Federal ADA)",
    sourceDocuments: ["42 U.S.C. §§ 12101-12213", "EEOC Leave as Accommodation Guidance 2016"],
  },
  {
    name: "Intermittent FMLA Balance — Rolling Backward Year Method",
    inputScenario: "Employer uses rolling backward 12-month FMLA. Employee Sarah, 40 hrs/week, approved for intermittent migraine leave starting March 1, 2023. Usage (hours): Mar '23: 16; Apr: 8; May: 24; Jun: 16; Jul: 0; Aug: 24; Sep: 8; Oct: 16; Nov: 24; Dec: 8; Jan '24: 24; Feb '24: 16. On March 5, 2024, she requests 8 hours. How much FMLA available?",
    expectedBehavior: "Rolling backward: look at 52 weeks prior to March 5, 2024 (March 5, 2023 to March 4, 2024). Total entitlement: 480 hours (12 × 40). Calculate total used in prior 52-week window. Determine remaining balance. Confirm 8-hour request approved.",
    evaluationCriteria: ["Correctly explains rolling backward = 52 weeks prior to requested date", "Accurately identifies hours in prior 52-week window (handles partial March 2023)", "Correctly calculates 12-week entitlement as 480 hours", "Arrives at ~303-309 hours remaining", "Confirms 8-hour request approved", "Notes 5-day designation notice obligation"],
    rubricScoring: { dimensions: [{ name: "Rolling Period Calculation", weight: 0.30, passingScore: 1.0 }, { name: "Hours-to-Weeks Conversion", weight: 0.20, passingScore: 1.0 }, { name: "Balance Accuracy", weight: 0.35, passingScore: 0.95 }, { name: "Approval Determination", weight: 0.15, passingScore: 1.0 }] },
    category: "complianceCritical", difficulty: "medium", jurisdiction: "Federal (FMLA)",
    sourceDocuments: ["29 C.F.R. §825.200(b)(4)", "29 C.F.R. §825.205"],
  },
  {
    name: "PWFA Pregnancy Accommodation — Post-April 2024 EEOC Rule",
    inputScenario: "Lisa is a warehouse order picker (Texas, 50 employees). 6 months pregnant. OB/GYN note: avoid lifting >25 lbs, restroom break every 2 hours, no standing >4 consecutive hours. Employer says: lifting 50 lbs is essential function she can't perform; no light duty program; directing her to take unpaid leave. Is this PWFA compliant?",
    expectedBehavior: "PWFA applies (15+ employees, pregnancy limitation). Core PWFA rule: employer CANNOT require leave if another accommodation available. EEOC-enumerated accommodations apply: restroom breaks (mandatory), standing limitation (seating or modified schedule), lifting restriction (explore even without formal light duty program). 'No light duty program' is not a defense under PWFA. Employer response is a PWFA violation.",
    evaluationCriteria: ["Applies PWFA correctly (15+ employees; effective June 2023)", "Identifies core PWFA rule: cannot require leave if another accommodation exists", "Identifies EEOC-enumerated accommodations for this situation", "Refutes 'no light duty program' defense", "Identifies employer's response as PWFA violation", "Cites EEOC Final Rule April 15, 2024"],
    rubricScoring: { dimensions: [{ name: "PWFA Coverage", weight: 0.20, passingScore: 1.0 }, { name: "Leave Prohibition", weight: 0.30, passingScore: 1.0 }, { name: "EEOC Enumerated Accommodations", weight: 0.25, passingScore: 0.9 }, { name: "Violation Analysis", weight: 0.15, passingScore: 1.0 }, { name: "Remediation", weight: 0.10, passingScore: 0.8 }] },
    category: "complianceCritical", difficulty: "complex", jurisdiction: "Texas (Federal PWFA)",
    sourceDocuments: ["42 U.S.C. §§ 2000gg-2000gg-6", "EEOC Final Rule April 15, 2024"],
  },
  {
    name: "Multi-State Employee Leave — New York + New Jersey Intersection",
    inputScenario: "David is a software engineer living in New Jersey, employed at a New York office (NY payroll). Employer has 60 employees. He needs 12 weeks leave to bond with his newborn. Assess complete leave entitlements under federal, NY PFL, and NJ FLI, and explain concurrent running rules.",
    expectedBehavior: "FMLA eligibility: remote worker worksite per employer policy. NY PFL: 12 weeks at 67% SAWW (NY payroll employee). NJ FLI: 12 weeks at 85% wages. CRITICAL: NJ FLI and FMLA do NOT run concurrently for family care. Cannot double-dip on state benefits simultaneously. Controlling jurisdiction analysis for leave purposes. Escalate due to multi-state complexity.",
    evaluationCriteria: ["Identifies multi-state complexity", "Correctly states NJ FLI and FMLA do NOT run concurrently for family care", "Identifies NY PFL rights", "Identifies NJ FLI rights", "Advises on controlling jurisdiction determination", "Notes potential for sequential entitlements", "Escalates for attorney review"],
    rubricScoring: { dimensions: [{ name: "Multi-State Recognition", weight: 0.20, passingScore: 0.9 }, { name: "NJ FLI/FMLA Non-Concurrent Rule", weight: 0.30, passingScore: 1.0 }, { name: "State PFL Identification", weight: 0.25, passingScore: 0.9 }, { name: "Escalation", weight: 0.15, passingScore: 1.0 }, { name: "Practical Guidance", weight: 0.10, passingScore: 0.8 }] },
    category: "edgeCase", difficulty: "complex", jurisdiction: "New York / New Jersey",
    sourceDocuments: ["NY WCL Art. 9-A", "N.J.S.A. 34:11B-1+", "29 C.F.R. §825.111"],
  },
  {
    name: "FMLA Notice Compliance — Happy Path",
    inputScenario: "Employee in Texas (employer 100 employees, same worksite) calls HR Monday morning saying her child was hospitalized and she cannot come in. HR asks: 'Do I need to give her any paperwork today? What is the complete FMLA notice compliance process?'",
    expectedBehavior: "FMLA qualifying event (child's serious health condition — hospitalization satisfies §825.114). Eligibility check: 12 months + 1,250 hours + 50+ employees within 75 miles. WH-381 within 5 business days. Provide WH-380-F (family member serious health condition — NOT WH-380-E). Employee has 15 calendar days to return certification. WH-382 designation within 5 business days of sufficient information. Address paid leave substitution.",
    evaluationCriteria: ["Identifies hospitalized child as qualifying serious health condition", "States 5-business-day deadline for WH-381", "Identifies WH-380-F (family member) not WH-380-E", "States 15-calendar-day certification return deadline", "States 5-business-day designation notice deadline", "Addresses paid leave substitution"],
    rubricScoring: { dimensions: [{ name: "Qualifying Event Recognition", weight: 0.20, passingScore: 1.0 }, { name: "Notice Deadline Accuracy", weight: 0.30, passingScore: 1.0 }, { name: "Correct Form Identification", weight: 0.20, passingScore: 1.0 }, { name: "Process Completeness", weight: 0.20, passingScore: 0.9 }, { name: "Paid Leave Guidance", weight: 0.10, passingScore: 0.8 }] },
    category: "happyPath", difficulty: "basic", jurisdiction: "Texas (Federal FMLA)",
    sourceDocuments: ["29 C.F.R. §825.300", "WH-381", "WH-380-F"],
  },
];

const KPIS = [
  { name: "Leave Eligibility Determination Accuracy", unit: "percent", baseline: 78, target: 95, targetOperator: "gte", weight: 0.22, slaThreshold: 90, breachLevel: "critical", confidence: 0.90, trend: "improving", expression: "(correct_eligibility_determinations / total_determinations) * 100", measurement: "Validated against attorney-reviewed ground truth dataset covering all 50 states + 100+ municipalities" },
  { name: "Concurrent Leave Calculation Accuracy", unit: "percent", baseline: 82, target: 97, targetOperator: "gte", weight: 0.18, slaThreshold: 92, breachLevel: "critical", confidence: 0.93, trend: "stable", expression: "(correct_concurrent_calculations / total_concurrent_calculations) * 100", measurement: "Compared against manual calculation by Littler leave attorneys on 300 multi-law scenarios per quarter" },
  { name: "FMLA Notice Compliance Accuracy", unit: "percent", baseline: 88, target: 98, targetOperator: "gte", weight: 0.15, slaThreshold: 94, breachLevel: "critical", confidence: 0.92, trend: "stable", expression: "(compliant_notice_determinations / total_notice_determinations) * 100", measurement: "Validated against 29 C.F.R. §825.300 notice requirements checklist" },
  { name: "Interactive Process Guidance Completeness", unit: "percent", baseline: 75, target: 93, targetOperator: "gte", weight: 0.15, slaThreshold: 86, breachLevel: "high", confidence: 0.88, trend: "improving", expression: "(guidance_with_all_required_elements / total_interactive_process_responses) * 100", measurement: "12-element interactive process completeness checklist reviewed by Littler ADA attorneys" },
  { name: "Accommodation Appropriateness Rate", unit: "percent", baseline: 80, target: 92, targetOperator: "gte", weight: 0.12, slaThreshold: 85, breachLevel: "high", confidence: 0.85, trend: "improving", expression: "(appropriate_accommodations_identified / total_accommodation_analyses) * 100", measurement: "Attorney rating on 5-point scale; 4+ = appropriate; benchmarked against JAN database" },
  { name: "Litigation Risk Reduction Rate", unit: "percent", baseline: 45, target: 55, targetOperator: "gte", weight: 0.10, slaThreshold: 48, breachLevel: "medium", confidence: 0.75, trend: "improving", expression: "((baseline_litigation_rate - post_agent_litigation_rate) / baseline_litigation_rate) * 100", measurement: "YoY comparison of leave-related litigation filings per 1,000 employees at agent clients vs. control" },
  { name: "Leave Eligibility Determination Speed", unit: "seconds", baseline: 900, target: 60, targetOperator: "lte", weight: 0.05, slaThreshold: 180, breachLevel: "medium", confidence: 0.95, trend: "improving", expression: "avg(determination_response_time_seconds)", measurement: "Time from employee facts submission to complete leave eligibility matrix delivery" },
  { name: "Attorney Escalation Precision", unit: "percent", baseline: 70, target: 88, targetOperator: "gte", weight: 0.03, slaThreshold: 78, breachLevel: "low", confidence: 0.80, trend: "stable", expression: "(correctly_escalated / total_escalations) * 100", measurement: "Proportion of escalations validated by Littler leave attorney as requiring attorney review" },
];

const SYSTEM_PROMPT = `You are the Littler Leave & Accommodation Management Agent (LIT-AGT-010), a specialized AI legal guidance system for Littler Mendelson P.C., the world's largest employment and labor law firm.

Your primary purpose is to navigate the complex intersection of federal, state, and local leave laws and disability accommodation obligations on behalf of Littler's employer clients.

CORE LEGAL EXPERTISE:
- FMLA: 29 U.S.C. §§ 2601-2654 / 29 C.F.R. Part 825 — eligibility, certification, designation, concurrent running, notice deadlines, anti-interference
- ADA/ADAAA: 42 U.S.C. §§ 12101-12213 / 29 C.F.R. Part 1630 — expansive disability definition, interactive process, reasonable accommodation, undue hardship, leave post-FMLA exhaustion
- PWFA: Effective June 27, 2023; EEOC Final Rule April 15, 2024 — pregnancy-related accommodations broader than ADA; CANNOT require leave when another accommodation is available
- State PFL Programs: CA PFL (8 weeks), NY PFL (12 weeks), WA PFML, NJ FLI, CO FAMLI, MA PFML, CT PFML, OR PFML, and 6+ more
- California Baby Blues Amendment (SB 1383, 2021): FMLA and CFRA run SEPARATELY for baby bonding = up to 24 total weeks
- NJ Exception: FLI and FMLA do NOT run concurrently for family care leave
- State FMLA Equivalents: CFRA, NJFLA, OFLA, and 20+ state laws
- Mandatory PSL: 15+ state laws and 80+ municipal ordinances; most protective standard applies
- USERRA: Military leave for ALL employers; escalator reemployment rights

CRITICAL OPERATING CONSTRAINTS:
- SUPERVISED autonomy mode: accommodation denial recommendations, adverse action against leave-protected employees, and litigation decisions require Littler attorney sign-off
- NEVER recommend termination or adverse action against employee on or recently returned from protected leave without attorney consultation
- NEVER finalize an accommodation denial letter — always mark as draft requiring attorney review
- Always cite specific statute/regulation/case law
- Flag confidence < 75% for attorney review
- Medical certification and disability information: strictly confidential; separate file required

MANDATORY ESCALATION TRIGGERS:
1. FMLA interference: adverse action against employee using or recently returned from FMLA
2. ADA accommodation denial without completing interactive process
3. Employee at FMLA exhaustion without ADA assessment
4. Termination of employee who disclosed disability or requested accommodation
5. Leave fraud investigation request (attorney consultation FIRST)
6. EEOC charge or DOL investigation notice

RESPONSE STRUCTURE:
1. Applicable Laws & Coverage Analysis
2. Leave Entitlement Matrix (all applicable laws, durations, benefits, concurrent running)
3. Process Requirements (notices, certification, interactive process steps)
4. Risk Flags (interference/retaliation exposure, deadline violations, litigation risk)
5. Required Actions (with deadlines and responsible party)
6. Attorney Escalation Items`;

const RUNTIME_PROMPT = `Analyze the leave or accommodation request. Identify all applicable federal, state, and local laws based on the employee's work location, employer size, and reason for leave or accommodation. Determine eligibility under each applicable law, calculate entitlement durations and benefit rates, identify all concurrent running obligations, assess required notices or certifications, and provide a complete jurisdiction-specific action plan. For accommodation requests, guide the interactive process with appropriate documentation. Flag all items requiring attorney review.`;

// ══════════════════════════════════════════════════════════════════════════════
// MAIN EXECUTION
// ══════════════════════════════════════════════════════════════════════════════

async function main() {
  console.log("\n════════════════════════════════════════════════════════════════════");
  console.log("  LIT-AGT-010 — Leave & Accommodation Management Agent");
  console.log("  PRODUCTION MIGRATION — Creating all platform intelligence in PROD");
  console.log(`  Target: ${BASE}`);
  console.log(`  Org:    ${ORG}`);
  console.log("════════════════════════════════════════════════════════════════════\n");

  // Validate prod connection
  const testRes = await get("/api/skills");
  if (!Array.isArray(testRes)) throw new Error(`Cannot reach prod API — unexpected response`);
  console.log(`  ✓  Prod API reachable (${testRes.length} existing skills in org)\n`);

  const ids = {};

  // ── STEP 1: 6 SKILLS ─────────────────────────────────────────────────────────
  step("1", "11", "Creating 6 skills…");
  ids.skillIds = [];
  for (const s of SKILLS) {
    const res = await post("/api/skills", s);
    ids.skillIds.push(res.id);
    log(`${s.name} → ${res.id}`);
  }

  // ── STEP 2: KNOWLEDGE BASE ────────────────────────────────────────────────────
  step("2", "11", "Creating knowledge base…");
  const kbRes = await post("/api/knowledge-bases", {
    organizationId: ORG,
    name: "Leave & Accommodation Management Knowledge Base",
    description: "Comprehensive knowledge base for LIT-AGT-010 covering FMLA regulations, ADA/PWFA accommodation guidance, 50-state leave law matrix, local sick leave ordinances, accommodation ideas library, and notice templates.",
    industry: "legal_services",
    type: "policy",
    status: "active",
    accessLevel: "private",
    tags: ["FMLA", "ADA", "PWFA", "leave-management", "accommodation", "state-leave", "sick-leave", "LIT-AGT-010"],
  });
  ids.kbId = kbRes.id;
  log(`Knowledge Base → ${kbRes.id}`);

  // ── STEP 3: 6 KB SOURCES ─────────────────────────────────────────────────────
  step("3", "11", "Ingesting 6 knowledge base sources…");
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
      if (res.name !== src.displayName) {
        await patch(`/api/knowledge-bases/${ids.kbId}/sources/${res.id}`, { name: src.displayName });
      }
      log(`KB Source: ${src.displayName.slice(0, 65)}`);
    } catch (e) {
      warn(`KB Source (non-fatal): ${src.title.slice(0, 40)} — ${e.message.slice(0, 80)}`);
    }
  }

  // ── STEP 4: 6 RUNBOOKS ───────────────────────────────────────────────────────
  step("4", "11", "Creating 6 runbooks…");
  ids.runbookIds = [];
  for (const rb of RUNBOOKS) {
    const res = await post("/api/runbooks", rb);
    ids.runbookIds.push(res.id);
    log(`Runbook: ${rb.name.slice(0, 65)} → ${res.id}`);
  }

  // ── STEP 5: 6 GOVERNANCE POLICIES ────────────────────────────────────────────
  step("5", "11", "Creating 6 governance policies…");
  ids.policyIds = [];
  for (const p of POLICIES) {
    const res = await post("/api/policies", p);
    ids.policyIds.push(res.id);
    log(`Policy: ${p.name.slice(0, 65)} → ${res.id}`);
  }

  // ── STEP 6: AGENT ────────────────────────────────────────────────────────────
  step("6", "11", "Creating agent LIT-AGT-010…");
  const agentRes = await post("/api/agents", {
    organizationId: ORG,
    name: "Leave & Accommodation Management Agent",
    agentType: "advisory",
    description: "Navigates the complex intersection of federal, state, and local leave laws and disability accommodation obligations. Maps to Littler's Leave and Accommodation practice area. Determines leave eligibility, manages the interactive accommodation process, tracks concurrent leave running, and ensures compliance with FMLA, ADA, PWFA, state paid family leave, and local sick leave ordinances.",
    owner: "Littler Mendelson P.C.",
    status: "active",
    riskTier: "HIGH",
    autonomyMode: "supervised",
    currentVersion: "1.0.0",
    environment: "production",
    modelProvider: "anthropic",
    modelName: "claude-opus-4-5",
    department: "Leave & Accommodation Practice",
    systemPrompt: SYSTEM_PROMPT,
    runtimeConfig: {
      agentCode: "LIT-AGT-010",
      practiceArea: "Leave & Accommodation",
      productMapping: "Littler onDemand + GPS",
      jurisdictionCoverage: "50-state + DC + 500+ municipalities",
      confidenceThreshold: 75,
      escalationTriggers: [
        "FMLA_interference_risk",
        "ADA_accommodation_denial_without_interactive_process",
        "employee_at_FMLA_exhaustion_without_ADA_assessment",
        "termination_following_disability_disclosure",
        "leave_fraud_investigation_request",
        "EEOC_charge_or_DOL_investigation",
      ],
      prompt: RUNTIME_PROMPT,
    },
    complianceTags: ["FMLA", "ADA", "ADAAA", "PWFA", "CFRA", "state-PFL", "local-sick-leave", "USERRA", "EEOC"],
    // preloadedSkills: [{skillId, loadOrder}] — CORRECT format
    preloadedSkills: ids.skillIds.map((skillId, i) => ({ skillId, loadOrder: i })),
    policyBindings: ids.policyIds,
  });
  ids.agentId = agentRes.id;
  log(`Agent: Leave & Accommodation Management Agent → ${agentRes.id}`);

  // ── STEP 7: LINK RUNBOOKS & POLICIES TO AGENT ─────────────────────────────────
  step("7", "11", "Linking runbooks (agentId) and policies (scopeId) to agent…");
  for (const rId of ids.runbookIds) {
    try {
      await patch(`/api/runbooks/${rId}`, { agentId: ids.agentId });
    } catch (e) { warn(`Runbook agentId: ${e.message.slice(0, 60)}`); }
  }
  log("All 6 runbooks: agentId set");
  for (const pId of ids.policyIds) {
    try {
      await patch(`/api/policies/${pId}`, { scopeId: ids.agentId, scopeType: "agent" });
    } catch (e) { warn(`Policy scopeId: ${e.message.slice(0, 60)}`); }
  }
  log("All 6 policies: scopeId set");

  // ── STEP 8: GOLDEN DATASET + 6 TEST CASES ────────────────────────────────────
  step("8", "11", "Creating golden dataset + 6 test cases…");
  const dsRes = await post("/api/golden-datasets", { ...GOLDEN_DATASET, organizationId: ORG });
  ids.goldenDatasetId = dsRes.id;
  log(`Golden Dataset → ${dsRes.id}`);
  ids.testCaseIds = [];
  for (const tc of TEST_CASES) {
    try {
      const tcRes = await post(`/api/golden-datasets/${ids.goldenDatasetId}/test-cases`, {
        ...tc, datasetId: ids.goldenDatasetId, organizationId: ORG,
      });
      ids.testCaseIds.push(tcRes.id);
      log(`Test Case: ${tc.name.slice(0, 65)}`);
    } catch (e) { warn(`Test Case: ${tc.name.slice(0, 40)} — ${e.message.slice(0, 80)}`); }
  }

  // ── STEP 9: EVAL SUITE ────────────────────────────────────────────────────────
  step("9", "11", "Creating evaluation suite…");
  const evalRes = await post("/api/evals", {
    organizationId: ORG,
    agentId: ids.agentId,
    goldenDatasetId: ids.goldenDatasetId,
    skillId: null,
    name: "LIT-AGT-010 Leave & Accommodation Evaluation Suite",
    type: "accuracy",
    thresholdConfig: {
      leaveEligibilityAccuracy: 0.95,
      concurrentLeaveAccuracy: 0.97,
      noticeComplianceAccuracy: 0.98,
      interactiveProcessCompleteness: 0.93,
      accommodationAppropriatenessRate: 0.92,
      overallPassRate: 0.95,
    },
    scorerConfig: { primary: "attorney_ground_truth", secondary: "rule_based_checklist_verification", citationCheck: true },
    coverageTags: ["FMLA", "ADA", "PWFA", "CFRA", "state-PFL", "concurrent-leave", "interactive-process", "accommodation"],
    environmentThresholds: { staging: { minPassRate: 0.88 }, production: { minPassRate: 0.95 } },
    schedule: "weekly:Tuesday:06:00 UTC",
    industry: "legal_services",
    ontologyTags: ["Leave Request", "Leave Entitlement", "Accommodation", "Interactive Process", "Medical Certification", "Leave Balance"],
  });
  ids.evalSuiteId = evalRes.id;
  log(`Eval Suite → ${evalRes.id}`);

  // ── STEP 10: OUTCOME CONTRACT + 8 KPIs ───────────────────────────────────────
  step("10", "11", "Creating outcome contract + 8 KPIs…");
  const outcomeRes = await post("/api/outcomes/with-kpis", {
    outcome: {
      organizationId: ORG,
      name: "Leave & Accommodation Management Agent — Outcome Contract",
      description: "Business objectives, KPIs, and SLAs governing LIT-AGT-010. Targets multi-jurisdiction leave eligibility accuracy, interactive process guidance quality, notice compliance, and litigation risk reduction.",
      version: 1,
      status: "active",
      industry: "legal_services",
      agentCode: "LIT-AGT-010",
      practiceArea: "Leave & Accommodation",
      productMapping: "Littler onDemand + GPS",
      objectives: [
        "95%+ accuracy in leave eligibility determinations across all 50 states and 500+ municipalities",
        "Legally compliant ADA/PWFA interactive processes with complete documentation",
        "Reduce leave-related litigation exposure through proactive compliance identification",
        "100% compliance with FMLA notice deadlines and content requirements",
      ],
      successCriteria: {
        primary: "Leave eligibility determination accuracy ≥ 95% vs. attorney-reviewed ground truth",
        secondary: "Interactive process completeness ≥ 93%; FMLA notice accuracy ≥ 95%",
        guardrails: "Zero accommodation denials without attorney consultation",
      },
      attributionRules: {
        agentId: ids.agentId,
        attributionModel: "direct",
        lookbackWindowDays: 90,
        minimumConfidenceThreshold: 0.75,
      },
      targetMetrics: { leaveEligibilityAccuracy: 0.95, accommodationGuidelineAdherence: 0.93, noticeComplianceAccuracy: 0.95 },
      slaConfig: { responseTimeMs: 8000, availabilityTarget: 0.995, escalationResponseTime: 900 },
      roiEstimate: { averageLitigationCostReduction: 280000, leaveAdminEfficiencyGain: 45000, litigationRiskReduction: 0.55 },
    },
    kpis: KPIS,
  });
  ids.outcomeId = outcomeRes.outcome?.id || outcomeRes.id;
  log(`Outcome Contract → ${ids.outcomeId}`);

  // ── STEP 11: LINK ALL INTELLIGENCE TO AGENT ───────────────────────────────────
  step("11", "11", "Linking all platform intelligence to agent…");

  try {
    await post(`/api/agents/${ids.agentId}/knowledge-bases`, {
      knowledgeBaseId: ids.kbId, priority: 1,
      retrievalConfig: { topK: 12, scoreThreshold: 0.70, rerankEnabled: true, jurisdictionFiltering: true, citationMode: "full" },
    });
    log("Knowledge base linked to agent");
  } catch (e) { warn(`KB link: ${e.message.slice(0, 80)}`); }

  await patch(`/api/agents/${ids.agentId}`, {
    outcomeId: ids.outcomeId,
    evalBindings: [ids.evalSuiteId],
  });
  log("Outcome contract + eval suite linked to agent");

  // Set ontology tags using prod concept IDs
  try {
    const allConcepts = await get("/api/ontology-concepts/all");
    const legal = allConcepts.filter(c => c.id?.startsWith("legal_services"));
    if (legal.length > 0) {
      // Pick best-fit concepts for Leave & Accommodation from available prod concepts
      const preferred = [
        "legal_services-legal-consulting-complianceadvisory",
        "legal_services-legal-consulting-riskassessment",
        "legal_services-regulatory-compliance-regulatoryreporting",
        "legal_services-legal-consulting-legalduediligence",
        "legal_services-litigation-discoveryprocess",
      ];
      const byId = new Map(allConcepts.map(c => [c.id, c]));
      const ontologyTags = preferred
        .map(id => byId.get(id))
        .filter(Boolean)
        .map(c => ({ conceptId: c.id, label: c.label, category: c.category }));
      if (ontologyTags.length > 0) {
        await patch(`/api/agents/${ids.agentId}`, { ontologyTags });
        log(`Ontology tags set (${ontologyTags.length}): ${ontologyTags.map(t=>t.label).join(", ")}`);
      } else {
        warn("No matching ontology concepts found — skipping tags");
      }
    } else {
      warn("No legal_services ontology concepts found in this environment");
    }
  } catch (e) { warn(`Ontology tags (non-fatal): ${e.message.slice(0, 80)}`); }

  // ── SAVE IDs ──────────────────────────────────────────────────────────────────
  writeFileSync("scripts/lit-agt-010-prod-ids.json", JSON.stringify(ids, null, 2));

  // ── SUMMARY ───────────────────────────────────────────────────────────────────
  console.log("\n════════════════════════════════════════════════════════════════════");
  console.log("  ✅  LIT-AGT-010 PRODUCTION MIGRATION — COMPLETE");
  console.log("════════════════════════════════════════════════════════════════════");
  console.log(`\n  Agent:           ${ids.agentId}`);
  console.log(`  Knowledge Base:  ${ids.kbId} (${ids.kbSourceIds?.length || 0} sources)`);
  console.log(`  Skills (6):      ${ids.skillIds.join("\n                   ")}`);
  console.log(`  Policies (6):    ${ids.policyIds.join("\n                   ")}`);
  console.log(`  Runbooks (6):    ${ids.runbookIds.join("\n                   ")}`);
  console.log(`  Golden Dataset:  ${ids.goldenDatasetId} (${ids.testCaseIds?.length || 0} test cases)`);
  console.log(`  Eval Suite:      ${ids.evalSuiteId}`);
  console.log(`  Outcome:         ${ids.outcomeId}`);
  console.log(`\n  Prod IDs saved → scripts/lit-agt-010-prod-ids.json\n`);
}

main().catch(err => {
  console.error(`\n❌  Production migration failed: ${err.message}`);
  process.exit(1);
});
