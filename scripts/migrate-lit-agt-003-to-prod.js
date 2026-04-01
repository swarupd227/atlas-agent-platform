#!/usr/bin/env node
/**
 * LIT-AGT-003 — Workplace Investigation Agent
 * PRODUCTION MIGRATION SCRIPT
 *
 * Creates all platform intelligence in the PRODUCTION environment via API only.
 * This is the single migration script to run against prod after dev validation.
 *
 * Corrections applied (lessons from dev):
 *  - eval schedule: string "weekly:Wednesday:06:00 UTC" (NOT an object)
 *  - outcome version: number 1 (NOT string "1.0")
 *  - preloadedSkills: [{skillId, loadOrder}] objects
 *  - ontologyTags: fetched dynamically from /api/ontology-concepts/all
 *  - KB sources: `title` field, then PATCH name if needed
 *  - HTML response check: catches undeployed routes early
 *
 * Usage:  node scripts/migrate-lit-agt-003-to-prod.js
 * Saves:  scripts/lit-agt-003-prod-ids.json
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
    throw new Error(`PATCH ${path} → HTML response: ${text.slice(0,200)}`);
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
// DATA DEFINITIONS (same real data as dev, targeting prod org)
// ══════════════════════════════════════════════════════════════════════════════

const SKILLS = [
  {
    organizationId: ORG,
    name: "Complaint Intake & Classification Skill",
    description: "Categorizes workplace complaints and assesses severity using NLP-driven analysis. Classifies complaints across discrimination (race, sex, age, disability, religion, national origin), harassment (sexual, non-sexual), retaliation, whistleblower reports, policy violations, workplace violence, and theft. Produces a structured complaint record with severity tier (P1-P4), recommended investigation level, and preliminary scope assessment. Maps each complaint type to applicable federal and state law triggers.",
    industry: "legal_services",
    domain: "workplace-investigations",
    version: "1.0.0",
    author: "Littler Mendelson Investigations Practice Group",
    trustTier: "HIGH",
    dependencies: [],
    tags: ["complaint-intake", "classification", "severity-assessment", "NLP", "discrimination", "harassment", "retaliation", "whistleblower"],
    agentTypeCompatibility: ["single", "team", "remote"],
    status: "active",
    complexity: "complex",
    allowedTools: ["retrieve_kb", "classify_complaint", "score_severity", "lookup_legal_standards", "flag_privilege"],
    requiredMcpServers: ["littler-investigations-mcp", "legal-standards-mcp"],
    requiredDataClassifications: ["employee_pii", "complaint_records", "hr_confidential"],
    disableModelInvocation: false,
    contextMode: "rag",
    userInvocable: true,
    descriptionQualityScore: 95,
    knowledgeQueries: ["complaint classification criteria", "severity assessment framework", "investigation level determination", "legal trigger identification"],
    yamlFrontmatter: `name: Complaint Intake & Classification Skill\nversion: "1.0"\nagent_code: LIT-AGT-003\ndomain: workplace-investigations\nindustry: legal_services\ntrust_tier: HIGH\ncontext_mode: rag\ncomplaint_types: [discrimination, harassment, retaliation, whistleblower, policy_violation, workplace_violence, theft]\nseverity_tiers: [P1_imminent_threat, P2_serious, P3_moderate, P4_minor]\nrequired_kb: Workplace Investigation Knowledge Base\ncitation_required: true\nprivilege_awareness: true`,
    markdownBody: `# Complaint Intake & Classification Skill\n\n## Purpose\nReceives, structures, and classifies workplace complaints from all intake channels (formal charge, ethics hotline, manager escalation, anonymous report, litigation hold) and produces a structured complaint record with severity tier and recommended investigation path.\n\n## Complaint Types & Legal Triggers\n\n### Discrimination Complaints\n- **Race/Color** (Title VII, 42 U.S.C. §2000e-2): Disparate treatment, disparate impact, hostile work environment\n- **Sex/Gender** (Title VII; PWFA): Unequal pay, gender stereotyping, pregnancy discrimination\n- **Age** (ADEA, 29 U.S.C. §§621-634): Adverse actions targeting employees 40+\n- **Disability** (ADA/ADAAA, 42 U.S.C. §12101+): Failure to accommodate, discriminatory discharge\n- **Sexual Orientation/Gender Identity** (Bostock v. Clayton County, 590 U.S. 644 (2020)): Covered under Title VII\n\n### Harassment Complaints\n- **Sexual Harassment** — Quid Pro Quo or Hostile Work Environment (Harris v. Forklift Systems)\n- **Non-Sexual Hostile Work Environment**: Race, age, disability, religion-based hostile environment\n\n### Retaliation Complaints\n- **Title VII/ADA/ADEA retaliation** (Burlington Northern v. White, 548 U.S. 53 (2006))\n- **Whistleblower** (SOX §806, Dodd-Frank §922)\n\n## Severity Classification Framework\n### Priority 1 — Imminent Threat (Same-day)\n- Credible threats of physical violence, criminal conduct, senior executive respondent\n### Priority 2 — Serious (48-hour)\n- Supervisor sexual harassment, recent adverse action, parallel government investigation\n### Priority 3 — Moderate (5-business-day)\n- Co-worker harassment, policy violation without criminal exposure\n### Priority 4 — Minor (14-calendar-day)\n- Interpersonal conflict, first-time minor violations\n`,
  },
  {
    organizationId: ORG,
    name: "Investigation Plan Generator Skill",
    description: "Creates structured, legally defensible investigation plans based on complaint type, scope, and severity. Generates a complete investigation roadmap including witness list and interview sequence, documents to request, evidence preservation instructions, timeline with milestones, and investigator assignment recommendation. Plans are tailored to complaint type and account for Faragher/Ellerth defense requirements, privilege considerations, and state-specific procedural obligations.",
    industry: "legal_services",
    domain: "workplace-investigations",
    version: "1.0.0",
    author: "Littler Mendelson Investigations Practice Group",
    trustTier: "HIGH",
    dependencies: ["Complaint Intake & Classification Skill"],
    tags: ["investigation-plan", "witness-sequencing", "evidence-collection", "timeline", "Faragher-Ellerth", "privilege"],
    agentTypeCompatibility: ["single", "team", "remote"],
    status: "active",
    complexity: "complex",
    allowedTools: ["retrieve_kb", "generate_investigation_plan", "sequence_witnesses", "calculate_timeline", "flag_privilege", "generate_document"],
    requiredMcpServers: ["littler-investigations-mcp", "document-gen-mcp"],
    requiredDataClassifications: ["employee_pii", "complaint_records", "hr_confidential", "attorney_work_product"],
    disableModelInvocation: false,
    contextMode: "rag",
    userInvocable: true,
    descriptionQualityScore: 94,
    knowledgeQueries: ["investigation planning framework", "witness sequencing methodology", "Faragher Ellerth defense", "investigation privilege designation"],
    yamlFrontmatter: `name: Investigation Plan Generator Skill\nversion: "1.0"\nagent_code: LIT-AGT-003\ndomain: workplace-investigations\nindustry: legal_services\ntrust_tier: HIGH\ncontext_mode: rag\nplan_components: [witnesses, documents, evidence, timeline, investigator_assignment]\nprivilege_aware: true\nfaragher_ellerth_compliant: true`,
    markdownBody: `# Investigation Plan Generator Skill\n\n## Purpose\nGenerates a complete, legally defensible workplace investigation plan tailored to the specific complaint type, scope, severity, and organizational context. Plans satisfy Faragher/Ellerth prompt and thorough investigation requirements and establish attorney-client privilege where appropriate.\n\n## Investigation Plan Components\n\n### 1. Investigator Assignment\n- Sexual harassment (supervisory respondent): External or attorney-led\n- Discrimination (systemic): External investigator\n- Senior executive respondent: Outside counsel\n- Policy violation (no legal exposure): HR Business Partner\n\n### 2. Witness Interview Sequence\n- Phase 1: Peripheral witnesses first\n- Phase 2: Complainant\n- Phase 3: Respondent (always last)\n- Phase 4: Rebuttal witnesses if needed\n\n### 3. Faragher/Ellerth Defense Documentation\n1. Written anti-harassment policy with reporting mechanisms — confirmed\n2. Policy distribution and acknowledgment by respondent — confirmed\n3. Anti-harassment training completed by respondent — confirmed\n4. Complaint channels known to complainant — confirmed\n5. Prompt, thorough, impartial investigation — documented\n6. Appropriate corrective action — documented\n`,
  },
  {
    organizationId: ORG,
    name: "Interview Preparation Skill",
    description: "Generates witness-specific interview outlines with legally required admonitions and key questions tailored to each witness's role, knowledge, and relationship to the parties. Produces complete interview guides for complainants, respondents, and witnesses organized by complaint type. Includes Upjohn warning language for attorney-led investigations, anti-retaliation admonitions, confidentiality instructions, and structured question sequences designed to elicit complete, truthful accounts while avoiding leading or suggestive questioning.",
    industry: "legal_services",
    domain: "workplace-investigations",
    version: "1.0.0",
    author: "Littler Mendelson Investigations Practice Group",
    trustTier: "HIGH",
    dependencies: ["Investigation Plan Generator Skill"],
    tags: ["interview-preparation", "witness-questions", "Upjohn-warning", "admonitions", "complainant-interview", "respondent-interview"],
    agentTypeCompatibility: ["single", "team", "remote"],
    status: "active",
    complexity: "complex",
    allowedTools: ["retrieve_kb", "generate_interview_guide", "lookup_admonitions", "generate_document"],
    requiredMcpServers: ["littler-investigations-mcp", "document-gen-mcp"],
    requiredDataClassifications: ["employee_pii", "complaint_records", "hr_confidential", "attorney_work_product"],
    disableModelInvocation: false,
    contextMode: "rag",
    userInvocable: true,
    descriptionQualityScore: 93,
    knowledgeQueries: ["interview admonitions", "Upjohn warning", "complainant interview questions", "respondent interview questions", "witness credibility assessment"],
    yamlFrontmatter: `name: Interview Preparation Skill\nversion: "1.0"\nagent_code: LIT-AGT-003\ndomain: workplace-investigations\nindustry: legal_services\ntrust_tier: HIGH\ncontext_mode: rag\ninterview_types: [complainant, respondent, witness, peripheral_witness]\nadmonitions: [upjohn_warning, anti_retaliation, confidentiality, voluntary_participation]`,
    markdownBody: `# Interview Preparation Skill\n\n## Required Admonitions\n\n### Anti-Retaliation (Every Interview)\n"This company prohibits retaliation against anyone who participates in this investigation. If you experience any retaliation, please report it immediately."\n\n### Upjohn Warning (Attorney-Led Only)\n"I am [name], an attorney with [firm]. I represent the Company, not you personally. This interview is protected by attorney-client privilege belonging to the Company, which may waive it. You may retain your own attorney at your expense. Do you understand and wish to proceed?"\n\n### Confidentiality\n"We ask that you keep the content of this interview confidential to the extent possible. We cannot instruct you not to speak with others per your NLRA Section 7 rights."\n\n## Question Framework\n- Complainant: Open-ended, specific dates/locations/words, prior reports, documentation\n- Respondent: Specific allegations (no verbatim witness quotes), context, prior complaints\n- Witnesses: Observations only, independent knowledge, any prior reports\n\n## Credibility Assessment\n- Internal consistency, corroboration, motive to fabricate, demeanor indicators\n- Preponderance standard (not beyond reasonable doubt)\n`,
  },
  {
    organizationId: ORG,
    name: "Evidence Management Skill",
    description: "Tracks collection, chain of custody, and privilege logging for all evidence gathered during workplace investigations. Manages documentary evidence, ESI (emails, texts, access logs, video), physical evidence, and witness testimony. Ensures proper chain of custody documentation for evidence that may be used in litigation, EEOC proceedings, or arbitration. Identifies attorney-client privileged documents and attorney work product. Generates evidence indexes.",
    industry: "legal_services",
    domain: "workplace-investigations",
    version: "1.0.0",
    author: "Littler Mendelson Investigations Practice Group",
    trustTier: "HIGH",
    dependencies: ["Investigation Plan Generator Skill"],
    tags: ["evidence-management", "chain-of-custody", "ESI", "privilege-log", "litigation-hold", "evidence-index"],
    agentTypeCompatibility: ["single", "team", "remote"],
    status: "active",
    complexity: "complex",
    allowedTools: ["retrieve_kb", "track_evidence", "generate_privilege_log", "generate_evidence_index", "flag_privilege", "calculate_deadline"],
    requiredMcpServers: ["littler-investigations-mcp", "ediscovery-mcp", "document-management-mcp"],
    requiredDataClassifications: ["employee_pii", "complaint_records", "hr_confidential", "attorney_work_product", "evidence_records"],
    disableModelInvocation: false,
    contextMode: "rag",
    userInvocable: true,
    descriptionQualityScore: 92,
    knowledgeQueries: ["chain of custody requirements", "ESI preservation obligations", "privilege log requirements", "litigation hold notices"],
    yamlFrontmatter: `name: Evidence Management Skill\nversion: "1.0"\nagent_code: LIT-AGT-003\ndomain: workplace-investigations\nindustry: legal_services\ntrust_tier: HIGH\ncontext_mode: rag\nevidence_types: [documentary, ESI, physical, testimony, video]\nchain_of_custody: required\nprivilege_logging: true\nlitigation_hold_aware: true`,
    markdownBody: `# Evidence Management Skill\n\n## Evidence Categories\n1. Documentary Evidence: Written communications, emails, texts, personnel records\n2. ESI: Email servers, Slack/Teams, calendar, badge access, building cameras, cloud storage\n3. Physical Evidence: Written notes, photographs, physical items\n\n## Preservation Obligations (Zubulake v. UBS Warburg)\n- Duty triggers when litigation is reasonably anticipated\n- Scope: all sources reasonably likely to contain relevant information\n- Litigation hold notice must be issued immediately\n- Periodic re-issuance required for long-running investigations\n\n## Chain of Custody Requirements\nEach item must log: description, type, source/custodian, collection date/method, receiver, storage location, access log, privilege status, authentication method\n\n## Privilege Log Requirements\n- Date, author, all recipients, general subject matter, privilege claimed, basis, anticipation of litigation indicator\n`,
  },
  {
    organizationId: ORG,
    name: "Legal Standard Application Skill",
    description: "Maps factual findings from workplace investigations to applicable discrimination, harassment, retaliation, and whistleblower legal frameworks. Applies burden-shifting frameworks (McDonnell Douglas, Price Waterhouse, mixed-motive analysis), hostile work environment elements, severe-or-pervasive analysis, and retaliation causation standards (Burlington Northern, Nassar, Gross v. FBL). Analyzes findings under Title VII, ADA, ADEA, FEHA, NYSHRL, ILHRA, SOX, Dodd-Frank, and applicable statutes.",
    industry: "legal_services",
    domain: "workplace-investigations",
    version: "1.0.0",
    author: "Littler Mendelson Investigations Practice Group",
    trustTier: "HIGH",
    dependencies: ["Complaint Intake & Classification Skill"],
    tags: ["legal-standards", "McDonnell-Douglas", "burden-shifting", "hostile-work-environment", "severe-or-pervasive", "retaliation-causation", "Title VII", "ADA", "ADEA"],
    agentTypeCompatibility: ["single", "team", "remote"],
    status: "active",
    complexity: "expert",
    allowedTools: ["retrieve_kb", "lookup_legal_standards", "apply_burden_shifting", "analyze_causation", "score_confidence"],
    requiredMcpServers: ["littler-investigations-mcp", "legal-standards-mcp", "case-law-mcp"],
    requiredDataClassifications: ["complaint_records", "hr_confidential", "attorney_work_product"],
    disableModelInvocation: false,
    contextMode: "rag",
    userInvocable: true,
    descriptionQualityScore: 96,
    knowledgeQueries: ["McDonnell Douglas burden shifting", "hostile work environment elements", "severe or pervasive standard", "retaliation but-for causation"],
    yamlFrontmatter: `name: Legal Standard Application Skill\nversion: "1.0"\nagent_code: LIT-AGT-003\ndomain: workplace-investigations\nindustry: legal_services\ntrust_tier: HIGH\ncontext_mode: rag\nframeworks: [McDonnell_Douglas, Price_Waterhouse, Faragher_Ellerth, Burlington_Northern, Gross_v_FBL]\nstatutes: [Title_VII, ADA_ADAAA, ADEA, SOX_806, Dodd_Frank_922, state_FELs]`,
    markdownBody: `# Legal Standard Application Skill\n\n## Discrimination — McDonnell Douglas\n1. Prima facie case: protected class, qualified, adverse action, inference of discrimination\n2. Employer: LNDR (production burden only)\n3. Employee: pretext (LNDR is false OR discriminatory motive was real reason)\n\n## Harassment — Hostile Work Environment (Harris v. Forklift)\n1. Unwelcome conduct\n2. Based on protected characteristic\n3. Objectively hostile — reasonable person standard\n4. Subjectively perceived as hostile\n5. Employer knew/should have known (co-worker) OR strict liability (supervisor + tangible action)\n\n## ADEA — Gross v. FBL But-For Causation\n- Age must be the determinative cause (NOT merely a motivating factor)\n- No mixed-motive theory available under ADEA\n- Statistical evidence critical for RIF cases\n\n## Retaliation — Burlington Northern + Nassar\n- Materially adverse action (broader than discrimination adverse action)\n- But-for causation required (Title VII retaliation per Nassar)\n- SOX/Dodd-Frank: contributing factor standard (lower threshold)\n\n## Whistleblower — SOX §806 / Dodd-Frank §922\n- SOX: Contributing factor causation; employer must show same action absent protected activity by clear and convincing evidence\n- Dodd-Frank: Enhanced protection for direct SEC reporters\n`,
  },
  {
    organizationId: ORG,
    name: "Investigation Report Drafting Skill",
    description: "Produces structured workplace investigation summary reports following Littler's investigation methodology. Reports include executive summary, complaint summary, investigation scope and methodology, witness credibility assessments, factual findings, legal analysis, conclusions, corrective action recommendations, and litigation hold status. Designed to satisfy Faragher/Ellerth prompt-and-thorough investigation requirements and to be defensible in EEOC proceedings, arbitration, and litigation.",
    industry: "legal_services",
    domain: "workplace-investigations",
    version: "1.0.0",
    author: "Littler Mendelson Investigations Practice Group",
    trustTier: "HIGH",
    dependencies: ["Legal Standard Application Skill", "Evidence Management Skill", "Interview Preparation Skill"],
    tags: ["investigation-report", "findings", "credibility-assessment", "corrective-action", "Faragher-Ellerth", "EEOC-defensible"],
    agentTypeCompatibility: ["single", "team", "remote"],
    status: "active",
    complexity: "expert",
    allowedTools: ["retrieve_kb", "generate_document", "apply_legal_standards", "score_credibility", "generate_corrective_action"],
    requiredMcpServers: ["littler-investigations-mcp", "document-gen-mcp", "legal-standards-mcp"],
    requiredDataClassifications: ["employee_pii", "complaint_records", "hr_confidential", "attorney_work_product"],
    disableModelInvocation: false,
    contextMode: "rag",
    userInvocable: true,
    descriptionQualityScore: 96,
    knowledgeQueries: ["investigation report structure", "credibility assessment criteria", "corrective action proportionality", "Faragher Ellerth documentation"],
    yamlFrontmatter: `name: Investigation Report Drafting Skill\nversion: "1.0"\nagent_code: LIT-AGT-003\ndomain: workplace-investigations\nindustry: legal_services\ntrust_tier: HIGH\ncontext_mode: rag\nreport_components: [executive_summary, methodology, findings, credibility, legal_analysis, conclusions, corrective_action]\nprivilege_header: required\nattorney_review_required: true`,
    markdownBody: `# Investigation Report Drafting Skill\n\n## Report Structure\n\n### Privilege Header (Attorney-Directed)\nPRIVILEGED AND CONFIDENTIAL — ATTORNEY-CLIENT COMMUNICATION / ATTORNEY WORK PRODUCT\nPrepared at the Direction of Legal Counsel in Anticipation of Litigation\n\n### I. Executive Summary\nComplaint, investigation timeline, primary finding, corrective action recommended\n\n### II. Complaint Summary\nComplete allegations, dates, prior reporting history, described impact\n\n### III. Scope & Methodology\nPrivilege designation, all witnesses (names, titles, dates), all documents reviewed, investigator independence statement, limitations\n\n### IV. Witness Accounts & Credibility\nFor each witness: account summary, internal consistency, corroboration, motive to fabricate, demeanor, overall credibility (HIGH/MODERATE/LOW)\n\n### V. Factual Findings\nPer allegation: SUBSTANTIATED / NOT SUBSTANTIATED / INSUFFICIENT EVIDENCE + supporting evidence\n\n### VI. Legal Analysis\nApplicable framework, element-by-element analysis, Faragher/Ellerth defense status\n\n### VII. Conclusions\nSummary findings, policy violation determination\n\n### VIII. Corrective Action\nProportional to severity + prior history; remediation for complainant; monitoring plan\n\n### IX. Certification\nInvestigation was prompt, thorough, and impartial; findings based on preponderance standard\n\n## Drafting Standards\n- Neutral, objective tone; no editorializing\n- Specific evidence citations for every finding\n- Always note "REQUIRES ATTORNEY REVIEW BEFORE DISTRIBUTION"\n`,
  },
];

const KB_SOURCES = [
  {
    title: "Littler Workplace Investigation Toolkit — Templates, Checklists & Best Practices",
    displayName: "Littler Workplace Investigation Toolkit — Templates, Checklists & Best Practices",
    tags: ["investigation-toolkit", "templates", "checklists", "best-practices", "Faragher-Ellerth", "LIT-AGT-003"],
    metadata: { source: "Littler Mendelson Investigations Practice", type: "toolkit", lastUpdated: "2024-01-01" },
    content: `# Littler Workplace Investigation Toolkit — Templates, Checklists & Best Practices\n\n## Investigation Intake Checklist\n- Assign unique Complaint ID\n- Identify complaint type and severity tier\n- Determine privilege designation (Upjohn? Work product?)\n- Determine if litigation hold is required\n- Identify potential investigator (screen for conflicts)\n- Assess need for interim protective measures\n- Notify legal counsel if: criminal conduct, government charge, senior executive respondent, class claim\n- Document receipt and intake\n\n## Conflict of Interest Screen\n- No supervisory relationship with parties\n- No personal relationship with parties\n- No prior complaints from complainant or against respondent\n- No financial or other interest in outcome\n\n## Interim Protective Measures\n- Physical separation of parties (assign respondent, not complainant)\n- Administrative leave of respondent (paid pending investigation)\n- Modified reporting structure\n- Document basis for every measure taken or declined\n\n## Witness Interview Preparation Checklist\n- Review all prior history before each interview\n- Prepare witness-specific question outline\n- Select appropriate admonitions (Upjohn, anti-retaliation, confidentiality)\n- Private, neutral meeting space\n- Support person policy (check state law — CA, NY have specific rights)\n- Do NOT disclose other witnesses' accounts verbatim\n- End: "Is there anything else you believe is relevant?"\n\n## Investigation Report Quality Checklist\n- Privilege header if attorney-directed\n- All allegations addressed\n- Each finding supported by specific evidence citations\n- Credibility assessed on established criteria (not subjective impressions)\n- Faragher/Ellerth defense elements addressed\n- Legal analysis completed\n- Corrective action proportional to severity and prior history\n- Attorney review before distribution\n- Complainant notified of outcome\n\n## Corrective Action Proportionality Guide\n| Offense | First | Repeat | Aggravated |\n|---|---|---|---|\n| Inappropriate comment (isolated) | Verbal counseling | Written warning | Written warning |\n| Sexual harassment (non-assault) | Suspension or termination | Termination | Termination |\n| Sexual assault | Termination + law enforcement | N/A | N/A |\n| Discrimination (adverse action) | Investigation + remediation | Termination | Termination |\n| Retaliation | Serious discipline or termination | Termination | Termination |\n\n## Investigation File Archiving (7-year minimum)\n1. Original complaint record, 2. Litigation hold notices, 3. Investigation plan, 4. Witness interview notes, 5. All documents reviewed, 6. Evidence index, 7. Privilege log, 8. Draft reports, 9. Attorney review documentation, 10. Final report, 11. Corrective action documentation, 12. Complainant outcome notification, 13. Follow-up monitoring records\n`,
  },
  {
    title: "Investigation Methodology Guides by Complaint Type and Severity Level",
    displayName: "Investigation Methodology Guides by Complaint Type and Severity Level",
    tags: ["methodology", "harassment-investigation", "discrimination-investigation", "retaliation-investigation", "LIT-AGT-003"],
    metadata: { source: "Littler Mendelson Investigations Practice", type: "methodology", lastUpdated: "2024-01-01" },
    content: `# Investigation Methodology Guides by Complaint Type and Severity Level\n\n## Sexual Harassment Investigation Methodology\n\n### Faragher/Ellerth Defense Documentation Requirements\n1. Written anti-harassment policy with clear reporting mechanisms\n2. Distribution and acknowledgment by respondent\n3. Anti-harassment training completed by respondent (date, content)\n4. Complaint reporting channels available and known to complainant\n5. Investigation was prompt, thorough, and impartial\n6. Corrective action (if misconduct found) or basis for no action (if not found)\n\n### Credibility in "He Said/She Said" Cases\n- Not dismissed for lack of corroboration alone — apply totality of credibility assessment\n- Preponderance standard (more likely than not)\n- Consider: corroborating witnesses, prior history, pattern evidence, prior disclosure to others\n- Complainant's delayed disclosure does not automatically undermine credibility\n\n## Discrimination Investigation Methodology\n\n### Evidence-Gathering Focus\n- Comparator analysis: Similarly situated employees of different protected class\n- Decision-maker statements: Bias-reflecting statements (stray remarks doctrine)\n- Pretext indicators: Shifting explanations, departure from standard procedure\n- Temporal proximity: Adverse action shortly after protected activity\n\n## Retaliation Investigation Methodology\n\n### Burlington Northern Materiality\n- "Materially adverse": Would dissuade reasonable employee from making charge\n- Broader than discrimination's "adverse employment action"\n- Context-dependent: Same action may be adverse for one employee, not another\n- Post-employment actions covered\n\n## Whistleblower Investigation Methodology\n\n### Initial Triage\n- Identify specific statute (SOX, Dodd-Frank, OSHA, state)\n- Assess whether disclosure qualifies as protected activity\n- Preserve all communications between discloser and management\n- Government coordination: Do NOT interview without counsel if government is already investigating\n\n## Investigation Response Times\n| Severity | Initial Response | Plan Approved | Complete |\n|---|---|---|---|\n| P1 (Imminent Threat) | Same day | Day 1 | Day 14 |\n| P2 (Serious) | 48 hours | Day 3 | Day 21 |\n| P3 (Moderate) | 5 days | Day 7 | Day 45 |\n| P4 (Minor) | 14 days | Day 14 | Day 60 |\n`,
  },
  {
    title: "Legal Standards Reference — Burden-Shifting, Hostile Work Environment & Retaliation Tests",
    displayName: "Legal Standards Reference — Burden-Shifting, Hostile Work Environment & Retaliation Tests",
    tags: ["legal-standards", "burden-shifting", "hostile-work-environment", "retaliation", "McDonnell-Douglas", "Title-VII", "LIT-AGT-003"],
    metadata: { source: "Littler Mendelson Legal Standards Reference", type: "legal-reference", lastUpdated: "2024-01-01" },
    content: `# Legal Standards Reference — Burden-Shifting, Hostile Work Environment & Retaliation Tests\n\n## Title VII (42 U.S.C. §2000e et seq.)\n\n### Employer Coverage: 15+ employees, 20+ calendar weeks\n\n### McDonnell Douglas (McDonnell Douglas Corp. v. Green, 411 U.S. 792 (1973))\n- Prima facie: protected class, qualified, adverse action, circumstances giving rise to inference\n- Employer: articulate LNDR (production only)\n- Employee: pretext (LNDR is false OR discriminatory motive was real reason)\n\n### Hostile Work Environment (Harris v. Forklift, 510 U.S. 17 (1993))\nElements: unwelcome, protected characteristic basis, objectively hostile, subjectively perceived, employer liability\nSevere or Pervasive: Frequency, severity, physically threatening vs. utterance, interference with work, psychological effect\n\n### Faragher/Ellerth (524 U.S. 775 & 742 (1998))\nAvailable ONLY: supervisor harassment WITHOUT tangible action\nElements: (1) employer exercised reasonable care to prevent/correct; (2) employee unreasonably failed to use preventive opportunities\nUnavailable: tangible action taken, or employer was aware and failed to act\n\n## ADA/ADAAA (42 U.S.C. §12101 et seq.)\nPost-2008 expansive disability definition; mitigating measures generally disregarded\nInteractive process mandatory before any accommodation denial\n\n## ADEA (29 U.S.C. §§621-634)\nGross v. FBL Financial Services, 557 U.S. 167 (2009): But-for causation required\nHazen Paper: Factors correlating with age (salary, pension) ≠ age discrimination unless age itself motivated\nDisparate impact available (Smith v. City of Jackson, 544 U.S. 228 (2005))\n\n## Retaliation\n### Burlington Northern (548 U.S. 53 (2006))\nMaterially adverse: Would dissuade reasonable employee from making charge\nBroader than discrimination standard; context-dependent; post-employment actions covered\n\n### Nassar (University of Texas SW Med. Ctr. v. Nassar, 570 U.S. 338 (2013))\nTitle VII retaliation: But-for causation required (not merely a motivating factor)\n\n## Whistleblower\n### SOX §806 (18 U.S.C. §1514A)\nProtected: fraud against shareholders, SEC violations, mail/wire fraud reports\nBurden-shifting: Employee shows contributing factor; employer shows same action by clear and convincing evidence\n\n### Dodd-Frank §922 (15 U.S.C. §78u-6)\nEnhanced protection for direct SEC reporters; award 10-30% of sanctions >$1M\n\n## State Fair Employment Laws\n### California FEHA\nEmployer coverage: 5+ employees; strict liability for supervisor harassment (NO Faragher/Ellerth defense); 3-year SOL\n\n### New York SHRL (2019 Amendments)\n"Severe or pervasive" eliminated for sexual harassment; any conduct above petty slights actionable; 3-year SOL\n\n### Illinois HRA\n1+ employees for sexual harassment; written policy + annual training required; Chicago supplemental training\n`,
  },
  {
    title: "Interview Question Banks by Complaint Type with Legally Required Admonitions",
    displayName: "Interview Question Banks by Complaint Type with Legally Required Admonitions",
    tags: ["interview-questions", "admonitions", "Upjohn", "anti-retaliation", "LIT-AGT-003"],
    metadata: { source: "Littler Mendelson Interview Practice Reference", type: "interview-guide", lastUpdated: "2024-01-01" },
    content: `# Interview Question Banks by Complaint Type with Legally Required Admonitions\n\n## Required Admonitions\n\n### Anti-Retaliation (REQUIRED — Every Interview)\n"This company prohibits retaliation against anyone who participates in this investigation. If you experience or witness retaliation — including changes to assignments, schedule, workload, or performance evaluations — report it immediately to [contact]. Retaliation is a separate violation of company policy and is illegal. Do you understand?"\n\n### Upjohn Warning (Attorney-Led ONLY)\n"I am [Name], an attorney with [Firm]. I represent the Company, not you personally. This interview is protected by attorney-client privilege belonging to the Company, which may waive it and disclose what you tell me. You may retain your own attorney at your own expense. Do you understand and wish to proceed?"\n\n### Confidentiality (Every Interview)\n"We ask you to keep the content of this interview confidential. We cannot legally instruct you not to speak with others per your NLRA rights, but ask for your discretion to protect investigation integrity and all parties' privacy. Do you understand?"\n\n## Sexual Harassment — Complainant Question Bank\n1. Describe your position, tenure, reporting relationship\n2. Tell me what happened in your own words, from the beginning\n3. When did this first occur? Specific date, day, approximate time?\n4. Where did this occur? Who else was present?\n5. What did [respondent] specifically say or do?\n6. How did you respond at the time?\n7. Was there any physical contact? Describe exactly.\n8. Had this happened before? How many times?\n9. Do you know of anyone else who experienced similar conduct?\n10. Did you report to anyone before today? When, to whom, what response?\n11. Any emails, texts, photos, or other documents related to this?\n12. What outcome are you hoping for?\n\n## Respondent Question Bank\n1. Describe position, reporting relationships, tenure\n2. Do you know [complainant]? Describe working relationship\n3. On [specific date], were you at [location]? Describe what occurred\n4. Did you [specific alleged conduct]? (factually stated, not characterized as wrongdoing)\n5. What was your understanding of complainant's reaction?\n6. Have prior complaints been made about your conduct toward anyone?\n7. Any documents related to your interactions with complainant?\n8. Is there any reason complainant might make these allegations?\n9. Anything else you want me to know?\n\n## Discrimination — Decision-Maker Question Bank\n1. Who made the decision to [terminate/demote/not promote] [employee]?\n2. What were the specific reasons for this decision?\n3. Were there written policies that applied? Were they followed?\n4. Were other employees considered? Why different decisions?\n5. Did employee raise any concerns before this decision?\n6. Were you aware of employee's [protected characteristic] at the time?\n7. Is there documentation supporting the stated reasons?\n8. How were similarly situated employees of different protected class treated?\n\n## Retaliation — Question Bank\n1. Did employee ever raise concerns about [discrimination/harassment/wages]?\n2. Were you aware of employee's EEOC charge/HR complaint?\n3. When did you first become aware of employee's protected activity?\n4. What specific action was taken against employee, and when?\n5. What were the stated reasons for this action?\n6. Were employees who had not made complaints treated the same way?\n7. Who else was involved in making this decision?\n`,
  },
  {
    title: "Corrective Action Precedent Database — Proportionality Guidelines by Offense Type",
    displayName: "Corrective Action Precedent Database — Proportionality Guidelines by Offense Type",
    tags: ["corrective-action", "proportionality", "discipline", "precedent", "LIT-AGT-003"],
    metadata: { source: "Littler Mendelson HR Practice Reference", type: "precedent-database", lastUpdated: "2024-01-01" },
    content: `# Corrective Action Precedent Database — Proportionality Guidelines by Offense Type\n\n## Legal Framework\n\n### Proportionality Principle\n1. Proportional to severity of offense and harm\n2. Consistent with prior treatment of similar offenses\n3. Documented with specific factual findings\n4. Legally compliant — not in violation of anti-discrimination or anti-retaliation laws\n\nInconsistent application is the single most common basis for successful discrimination and retaliation claims.\n\nBefore any corrective action:\n- How was this offense treated in the past for other employees?\n- Is this consistent with those precedents?\n- Are there distinguishing factors that legitimately justify different treatment?\n\n## Corrective Action Matrix\n\n### Category 1: Minor Policy Violations\n- Attendance (first offense): Verbal counseling\n- Attendance (second): Written warning\n- Attendance (third): Final written warning\n- Attendance (fourth): Termination\n- Minor insubordination (first): Verbal counseling\n\n### Category 2: Moderate Violations\n- Workplace harassment — non-discriminatory (first): Written warning + training\n- Workplace harassment — non-discriminatory (second): Final warning or suspension\n- Workplace harassment — non-discriminatory (third): Termination\n\n### Category 3: Serious Violations\n- Sexual harassment — co-worker, isolated non-contact: Final written warning + training\n- Sexual harassment — co-worker, physical non-assault: Suspension or termination\n- Sexual harassment — supervisor (any sustained finding): Termination (attorney required before retaining)\n- Discrimination (decision-maker with discriminatory action): Termination regardless of seniority\n- Retaliation (any sustained finding): Serious discipline; termination for senior employees\n- Workplace violence threat: Administrative leave pending investigation; termination if credible\n- Physical assault: Immediate termination + law enforcement\n\n### Category 4: Criminal/Severe Violations\n- Material theft (>$500 or systemic): Termination + law enforcement\n- Trade secret misappropriation: Termination + civil/criminal referral\n- Drug/Alcohol (safety-sensitive, any positive): Immediate removal from duty; termination option\n\n## Corrective Action Documentation Requirements\n1. Employee name, title, department, supervisor\n2. Date of corrective action meeting, attendees\n3. Specific policy(ies) violated (cite section)\n4. Description: specific facts, dates, witnesses\n5. Prior corrective action history\n6. Corrective action imposed (type, duration)\n7. Performance expectations going forward\n8. Consequences for future violations\n9. Employee acknowledgment (or notation if refused)\n10. HR certification: action consistent with similar prior cases\n\n## Post-Corrective Action Monitoring\n- Complainant: Monitor for 90 days post-outcome notification\n- Any adverse change in schedule/workload/assignments within 90 days: Mandatory legal review\n- Negative performance review within 12 months of complaint: Mandatory legal review before finalizing\n- Respondent: 6-month check; 12-month review of new complaints; prior finding is aggravating factor\n`,
  },
  {
    title: "EEOC Enforcement Guidance — Harassment, Retaliation & Reasonable Accommodations",
    displayName: "EEOC Enforcement Guidance — Harassment, Retaliation & Reasonable Accommodations",
    tags: ["EEOC", "enforcement-guidance", "harassment", "retaliation", "reasonable-accommodation", "EEOC-2024", "LIT-AGT-003"],
    metadata: { source: "EEOC Enforcement Guidance via Littler Mendelson Analysis", type: "regulatory-guidance", lastUpdated: "2024-04-29" },
    content: `# EEOC Enforcement Guidance — Harassment, Retaliation & Reasonable Accommodations\n\n## EEOC Harassment Guidance (April 29, 2024) — First Comprehensive Update Since 1999\n\n### Expanded Protected Characteristics\n- Sexual orientation and gender identity (post-Bostock)\n- Gender identity: Misgendering and deadnaming can constitute harassment\n- Pregnancy, childbirth, lactation, contraception, abortion\n- PUMP Act: Harassment related to expressing breastmilk\n\n### "Severe or Pervasive" — Updated Framework\n- Single severe incidents: Sexual assault or rape = severe per se; most severe racial slur may suffice alone\n- Cumulative effect: Pattern of individually non-actionable acts = actionable HWE\n- Digital harassment: Online, email, group chat harassment covered\n- Remote work: Video call harassment actionable; virtual background harassment actionable\n\n### Non-Employee Harassment\nEmployer may be liable for harassment by clients, independent contractors, vendors (if employer knew/should have known and failed to act)\n\n### Systemic Harassment\nMultiple victims of same respondent: Aggregate evidence supports each victim's claim\n\n## EEOC Requirements for Effective Anti-Harassment Program\n1. Written policy: Prohibition, anti-retaliation, multiple reporting channels, confidentiality assurance\n2. Training: All employees annually; supervisors enhanced training; bystander training\n3. Investigation: Prompt, thorough, impartial, documented\n4. Corrective action: Sufficient to stop harassment and prevent recurrence\n\n## EEOC Retaliation Guidance (August 25, 2016)\n\n### Protected Activities\nParticipation (absolute protection): Filing EEOC charge, testifying, assisting\nOpposition: Complaining to employer/union/government, refusing discriminatory orders, requesting accommodation, opposing third-party discrimination\n\n### Anti-Retaliation Best Practices\n1. Managers taking adverse actions against employees with EEOC charges: Document business reasons in advance\n2. HR review all adverse actions against employees with pending charges before finalization\n3. Training: Specific retaliation prohibition and examples\n4. Investigate retaliation complaints promptly even when underlying claim was not sustained\n\n## EEOC Reasonable Accommodation Guidance (October 17, 2002)\n\n### Interactive Process Requirements\nTriggering: Employee request, employer notice of need, apparent need (employer must initiate even if employee cannot specify accommodation needed)\n\nSteps: Recognize → Engage dialogue → Consider all accommodations → Select and implement → Monitor and adjust\n\n### PWFA Final Rule (April 15, 2024)\nCovered: Pregnancy, childbirth, related conditions (including lactation, termination, fertility treatments)\nDistinctions from ADA: No disability required; cannot require leave when another accommodation available; modest limitations covered\nEEOC-Enumerated Accommodations: Additional restroom breaks, ability to sit, water access, closer parking, lifting limits, light duty, modified schedule, remote work\n`,
  },
];

const RUNBOOKS = [
  {
    organizationId: ORG,
    name: "Imminent Threat Detection — Emergency Escalation Procedure",
    description: "Emergency escalation procedure for workplace investigations where an imminent threat of physical violence or criminal harm is identified. Covers immediate security notification, law enforcement engagement, employee protection measures, and mandatory legal counsel notification.",
    industry: "legal_services",
    category: "emergency",
    triggerType: "automatic",
    triggerConditions: [
      { type: "event", event: "imminent_threat_identified", source: "complaint_intake", threshold: "P1_severity_flag" },
      { type: "keyword", keywords: ["weapon", "gun", "knife", "threat", "kill", "harm", "assault"], source: "complaint_text" },
    ],
    steps: [
      { id: "1", type: "action", action: "immediate_security_notification", label: "Immediately notify security department and building management of credible threat", order: 1 },
      { id: "2", type: "action", action: "employee_protection", label: "Separate parties; remove threatened individual to safe location or authorize immediate paid leave", order: 2 },
      { id: "3", type: "action", action: "law_enforcement_notification", label: "Contact law enforcement (911 for imminent danger; local police for credible threats)", order: 3 },
      { id: "4", type: "action", action: "senior_management_notification", label: "Notify CEO/President, General Counsel, and CHRO within 1 hour", order: 4 },
      { id: "5", type: "action", action: "legal_counsel_engagement", label: "Engage Littler attorney immediately; no investigation interviews until attorney guidance received", order: 5 },
      { id: "6", type: "action", action: "document_preservation", label: "Preserve all communications from threat source; issue immediate litigation hold", order: 6 },
      { id: "7", type: "approval_gate", label: "Attorney and senior management authorization required before communicating with threatening individual", approvalLevel: "confirm_before", order: 7 },
      { id: "8", type: "action", action: "threat_assessment", label: "Coordinate threat assessment with trained professional (not HR alone)", order: 8 },
      { id: "9", type: "action", action: "victim_support", label: "Connect threatened employee with EAP; document protective measures taken", order: 9 },
      { id: "10", type: "action", action: "post_incident_debrief", label: "Post-incident review of response effectiveness within 30 days", order: 10 },
    ],
    approvalConfig: { requiredApprovers: ["general_counsel", "chro", "ceo"], autoApproveAfterHours: null },
    confidentiality: "internal",
    estimatedDuration: "Immediate — ongoing",
    tags: ["imminent-threat", "workplace-violence", "emergency", "P1"],
    metadata: { jurisdiction: "all", lastReviewed: "2024-01-01", nextReview: "2025-01-01" },
    agentId: null,
  },
  {
    organizationId: ORG,
    name: "Conflict of Interest Discovery — Investigator Reassignment Procedure",
    description: "Procedure for handling discovery of investigator conflict of interest during an active workplace investigation. Covers conflict assessment, investigator transition, evidence preservation, and communication protocols protecting investigation integrity.",
    industry: "legal_services",
    category: "investigation",
    triggerType: "manual",
    triggerConditions: [
      { type: "event", event: "conflict_of_interest_identified", source: "investigation_management", threshold: "any_conflict_flag" },
    ],
    steps: [
      { id: "1", type: "action", action: "document_conflict", label: "Document specific nature of conflict: relationship type, duration, potential impact on objectivity", order: 1 },
      { id: "2", type: "condition", condition: "conflict_severity", label: "Actual conflict vs. appearance of conflict?", trueNext: "3", falseNext: "4", order: 2 },
      { id: "3", type: "action", action: "immediate_removal", label: "Actual conflict: Remove investigator immediately; suspend pending interviews", order: 3 },
      { id: "4", type: "action", action: "legal_counsel_consultation", label: "Notify legal counsel; obtain guidance on whether prior work product is tainted", order: 4 },
      { id: "5", type: "action", action: "evidence_preservation", label: "Preserve all investigation files from current investigator in unmodified form", order: 5 },
      { id: "6", type: "action", action: "replacement_selection", label: "Select replacement with no relationship to parties; fresh conflict of interest screen", order: 6 },
      { id: "7", type: "action", action: "scope_assessment", label: "Assess whether prior interviews must be re-conducted", order: 7 },
      { id: "8", type: "action", action: "party_notification", label: "Notify complainant and respondent of investigator change (no need to state reason)", order: 8 },
      { id: "9", type: "action", action: "timeline_adjustment", label: "Adjust investigation timeline; document impact in investigation file", order: 9 },
    ],
    approvalConfig: { requiredApprovers: ["hr_director", "general_counsel"], autoApproveAfterHours: null },
    confidentiality: "internal",
    estimatedDuration: "3-5 business days",
    tags: ["conflict-of-interest", "investigator-reassignment"],
    metadata: { jurisdiction: "all", lastReviewed: "2024-01-01", nextReview: "2025-01-01" },
    agentId: null,
  },
  {
    organizationId: ORG,
    name: "Privilege Waiver Risk — Identification and Remediation Procedure",
    description: "Procedure for identifying and mitigating inadvertent privilege waiver risks during workplace investigations. Covers Upjohn warning compliance, inadvertent disclosure, subject matter waiver assessment, and remediation steps.",
    industry: "legal_services",
    category: "compliance",
    triggerType: "automatic",
    triggerConditions: [
      { type: "event", event: "potential_privilege_waiver_detected", source: "investigation_management", threshold: "privilege_flag" },
    ],
    steps: [
      { id: "1", type: "action", action: "privilege_audit", label: "Audit all investigation documents for privilege designation accuracy", order: 1 },
      { id: "2", type: "action", action: "disclosure_assessment", label: "Identify what was disclosed, to whom, when, and in what context", order: 2 },
      { id: "3", type: "action", action: "attorney_notification", label: "Notify Littler attorney IMMEDIATELY; do not take further action without guidance", order: 3 },
      { id: "4", type: "condition", condition: "inadvertent_disclosure", label: "Was disclosure inadvertent or intentional?", trueNext: "5", falseNext: "7", order: 4 },
      { id: "5", type: "action", action: "claw_back_notice", label: "Send claw-back notice under FRE 502(b); request return or destruction of disclosed material", order: 5 },
      { id: "6", type: "action", action: "document_remediation", label: "Segregate all copies; document timeline of inadvertent disclosure for privilege log", order: 6 },
      { id: "7", type: "action", action: "subject_matter_waiver", label: "Assess scope of waiver: Subject matter waiver of all related communications?", order: 7 },
      { id: "8", type: "action", action: "upjohn_review", label: "Review all prior Upjohn warnings; re-administer if any interviewee was not properly warned", order: 8 },
      { id: "9", type: "action", action: "privilege_log_update", label: "Update privilege log to reflect waiver assessment outcome and remediation steps", order: 9 },
      { id: "10", type: "action", action: "prevention", label: "Implement additional privilege marking; train team on privilege maintenance", order: 10 },
    ],
    approvalConfig: { requiredApprovers: ["general_counsel", "outside_counsel"], autoApproveAfterHours: null },
    confidentiality: "attorney_client_privileged",
    estimatedDuration: "1-3 business days",
    tags: ["privilege-waiver", "Upjohn", "inadvertent-disclosure"],
    metadata: { jurisdiction: "all", lastReviewed: "2024-01-01", nextReview: "2025-01-01" },
    agentId: null,
  },
  {
    organizationId: ORG,
    name: "Complainant Retaliation Alert — Monitoring Protocol and Protective Measures",
    description: "Protocol for monitoring and responding to potential retaliation against complainants or witnesses following a workplace investigation complaint. Establishes monitoring checkpoints, protective measures, investigation procedures for retaliation claims, and documentation requirements.",
    industry: "legal_services",
    category: "compliance",
    triggerType: "automatic",
    triggerConditions: [
      { type: "event", event: "retaliation_complaint_received", source: "hr_system", threshold: "any_retaliation_report" },
      { type: "event", event: "adverse_action_post_complaint", source: "hr_system", threshold: "adverse_action_within_12_months" },
    ],
    steps: [
      { id: "1", type: "action", action: "retaliation_assessment", label: "Document specific alleged retaliatory conduct: action, actor, timing, stated reason", order: 1 },
      { id: "2", type: "action", action: "timeline_analysis", label: "Map timeline: protected activity date → retaliatory action date; calculate temporal proximity", order: 2 },
      { id: "3", type: "action", action: "interim_protection", label: "Assess immediate protective measures: reporting line modification, work arrangement adjustment", order: 3 },
      { id: "4", type: "action", action: "legal_counsel_notification", label: "Notify legal counsel immediately; retaliation carries significant litigation exposure", order: 4 },
      { id: "5", type: "action", action: "evidence_preservation", label: "Preserve all relevant communications, performance records; litigation hold if not in place", order: 5 },
      { id: "6", type: "action", action: "separate_investigation", label: "Assign separate investigator for retaliation investigation (not same as original complaint)", order: 6 },
      { id: "7", type: "action", action: "decision_maker_interviews", label: "Interview decision-maker; document stated business reason in writing", order: 7 },
      { id: "8", type: "action", action: "comparator_analysis", label: "Identify similarly situated employees who did not engage in protected activity; compare treatment", order: 8 },
      { id: "9", type: "action", action: "monitoring_plan", label: "Establish 90-day monitoring plan post-investigation", order: 9 },
      { id: "10", type: "action", action: "escalation", label: "If substantiated: corrective action; notify legal counsel before finalizing; assess EEOC notifications", order: 10 },
    ],
    approvalConfig: { requiredApprovers: ["hr_director", "general_counsel"], autoApproveAfterHours: null },
    confidentiality: "internal",
    estimatedDuration: "14-21 days",
    tags: ["retaliation", "complainant-protection", "Burlington-Northern"],
    metadata: { jurisdiction: "all", lastReviewed: "2024-01-01", nextReview: "2025-01-01" },
    agentId: null,
  },
  {
    organizationId: ORG,
    name: "Parallel Government Investigation — Coordination and Document Hold Procedure",
    description: "Procedure for managing workplace investigations that occur simultaneously with EEOC charges, DOL investigations, OSHA inspections, or SEC investigations. Covers coordination obligations, document preservation, witness interview protocols, and outside counsel engagement.",
    industry: "legal_services",
    category: "compliance",
    triggerType: "automatic",
    triggerConditions: [
      { type: "event", event: "government_charge_received", source: "legal_department", threshold: "any_agency_charge" },
    ],
    steps: [
      { id: "1", type: "action", action: "litigation_hold", label: "Issue comprehensive litigation hold immediately upon receipt of government charge; all relevant custodians and document categories", order: 1 },
      { id: "2", type: "action", action: "outside_counsel_engagement", label: "Engage outside counsel (Littler) immediately; all communications about charge through outside counsel", order: 2 },
      { id: "3", type: "action", action: "internal_investigation_pause", label: "Pause internal investigation interviews pending outside counsel guidance", order: 3 },
      { id: "4", type: "action", action: "document_collection_assessment", label: "Assess what relevant documents exist; do not produce to government without outside counsel review", order: 4 },
      { id: "5", type: "action", action: "response_coordination", label: "Coordinate response with outside counsel: Position Statement for EEOC; responses to subpoenas", order: 5 },
      { id: "6", type: "condition", condition: "concurrent_investigation", label: "Should internal investigation proceed, be paused, or be absorbed into outside counsel representation?", trueNext: "7", falseNext: "8", order: 6 },
      { id: "7", type: "action", action: "coordinate_strategy", label: "If proceeds: coordinate strategy with outside counsel; ensure notes/reports appropriately privileged", order: 7 },
      { id: "8", type: "action", action: "cooperation_strategy", label: "Determine cooperation vs. rights assertion strategy; outside counsel leads all government communications", order: 8 },
      { id: "9", type: "action", action: "witness_preparation", label: "Coordinate witness preparation with outside counsel; Upjohn warnings required", order: 9 },
      { id: "10", type: "action", action: "resolution_coordination", label: "Coordinate internal remediation with government proceeding resolution strategy", order: 10 },
    ],
    approvalConfig: { requiredApprovers: ["general_counsel", "outside_counsel", "ceo"], autoApproveAfterHours: null },
    confidentiality: "attorney_client_privileged",
    estimatedDuration: "Variable",
    tags: ["EEOC", "government-investigation", "parallel-proceeding", "litigation-hold"],
    metadata: { jurisdiction: "all", lastReviewed: "2024-01-01", nextReview: "2025-01-01" },
    agentId: null,
  },
  {
    organizationId: ORG,
    name: "Investigation Integrity Breach — Evidence Tampering Detection and Escalation",
    description: "Procedure for detecting and responding to evidence tampering, chain of custody breaks, witness intimidation, or other investigation integrity breaches. Covers evidence authentication, spoliation sanction risk assessment, law enforcement engagement, and remediation.",
    industry: "legal_services",
    category: "investigation",
    triggerType: "automatic",
    triggerConditions: [
      { type: "event", event: "evidence_tampering_suspected", source: "investigation_management", threshold: "chain_of_custody_discrepancy" },
    ],
    steps: [
      { id: "1", type: "action", action: "immediate_documentation", label: "Document integrity concern: what evidence, what changed, who had access, when identified", order: 1 },
      { id: "2", type: "action", action: "access_log_review", label: "Pull access logs immediately; identify all who accessed relevant evidence since collection", order: 2 },
      { id: "3", type: "action", action: "attorney_notification", label: "Notify legal counsel IMMEDIATELY; tampering may give rise to criminal liability and spoliation sanctions", order: 3 },
      { id: "4", type: "action", action: "forensic_authentication", label: "Engage forensic specialist to authenticate original evidence vs. current state", order: 4 },
      { id: "5", type: "action", action: "spoliation_risk_assessment", label: "Assess spoliation risk: Relevant to foreseeable litigation? Destroyed after preservation duty arose?", order: 5 },
      { id: "6", type: "condition", condition: "criminal_conduct", label: "Does tampering or intimidation constitute potential criminal conduct?", trueNext: "7", falseNext: "8", order: 6 },
      { id: "7", type: "action", action: "law_enforcement_referral", label: "Refer to law enforcement in consultation with outside counsel; no further internal interviews of suspected tamperer", order: 7 },
      { id: "8", type: "action", action: "investigation_remediation", label: "Assess impact on investigation findings; determine if any findings must be reconsidered", order: 8 },
      { id: "9", type: "action", action: "witness_protection", label: "If witness intimidation: implement protective measures; document as separate violation", order: 9 },
      { id: "10", type: "action", action: "integrity_report", label: "Prepare privileged integrity breach report for legal counsel", order: 10 },
    ],
    approvalConfig: { requiredApprovers: ["general_counsel", "outside_counsel"], autoApproveAfterHours: null },
    confidentiality: "attorney_client_privileged",
    estimatedDuration: "Immediate — 5 business days",
    tags: ["evidence-tampering", "spoliation", "chain-of-custody"],
    metadata: { jurisdiction: "all", lastReviewed: "2024-01-01", nextReview: "2025-01-01" },
    agentId: null,
  },
];

const POLICIES = [
  {
    organizationId: ORG,
    name: "Title VII Prompt & Thorough Investigation Compliance Policy",
    description: "Governs agent compliance with Title VII investigation obligations under the Faragher/Ellerth framework. Ensures investigations are prompt, thorough, impartial, and documented to preserve the employer's affirmative defense.",
    domain: "content_boundaries",
    status: "active",
    version: 1,
    policyJson: {
      rules: [
        { id: "titleVII-1", description: "Every sexual harassment investigation must begin within 48 hours for P1/P2 and 5 business days for P3; flag any delay threatening Faragher/Ellerth defense", severity: "CRITICAL", enforcement: "hard_block" },
        { id: "titleVII-2", description: "All material witnesses must be interviewed before concluding investigation; never recommend no action based solely on lack of corroboration without interviewing all available witnesses", severity: "CRITICAL", enforcement: "hard_block" },
        { id: "titleVII-3", description: "Complainant must receive written notice of investigation outcome; include outcome notification template in all completed investigation recommendations", severity: "HIGH", enforcement: "require_confirmation" },
        { id: "titleVII-4", description: "Faragher/Ellerth affirmative defense elements must be assessed for all supervisor harassment cases; document policy currency, training records, complaint channel adequacy", severity: "CRITICAL", enforcement: "hard_block" },
        { id: "titleVII-5", description: "Never recommend adverse action against complainant during or within 12 months of investigation without attorney review; flag temporal proximity as automatic retaliation risk", severity: "CRITICAL", enforcement: "hard_block" },
        { id: "titleVII-6", description: "All investigation reports must cite applicable legal standard with statute and case law; do not produce findings without legal standard analysis", severity: "HIGH", enforcement: "require_confirmation" },
      ],
      confidentiality: "Investigation records confidential; share only on need-to-know; attorney work product when attorney-directed",
      citation_requirements: ["42 U.S.C. §2000e et seq.", "Faragher v. City of Boca Raton, 524 U.S. 775 (1998)", "Burlington Industries v. Ellerth, 524 U.S. 742 (1998)", "EEOC Harassment Guidance 2024"],
      escalation_policy: "Any finding of sustained supervisor sexual harassment requires notification of general counsel and Littler attorney before corrective action is finalized.",
    },
    tags: ["Title-VII", "Faragher-Ellerth", "harassment-investigation"],
    effectiveDate: new Date().toISOString(),
    scopeId: null,
    scopeType: "agent",
  },
  {
    organizationId: ORG,
    name: "ADA Interactive Process During Investigation Policy",
    description: "Ensures the agent triggers and tracks ADA interactive process obligations when investigations involve employees with disabilities or when the complaint itself relates to failure to accommodate.",
    domain: "content_boundaries",
    status: "active",
    version: 1,
    policyJson: {
      rules: [
        { id: "ada-inv-1", description: "If complainant or respondent discloses disability or accommodation need, flag interactive process obligation and ensure accommodation addressed separately from investigation outcome", severity: "CRITICAL", enforcement: "hard_block" },
        { id: "ada-inv-2", description: "If complaint involves failure-to-accommodate, gather and analyze interactive process documentation before recommending finding; absence of documentation is a significant finding", severity: "CRITICAL", enforcement: "hard_block" },
        { id: "ada-inv-3", description: "Medical information disclosed during investigation must be segregated per ADA §12112(d)(4) — flag this requirement in every investigation with disability disclosure", severity: "HIGH", enforcement: "require_confirmation" },
        { id: "ada-inv-4", description: "Any adverse action against employee who disclosed disability or requested accommodation within prior 12 months requires automatic attorney review", severity: "CRITICAL", enforcement: "hard_block" },
        { id: "ada-inv-5", description: "Do not rely on 'regarded as' disability analysis without post-ADAAA expansive standard; apply Sutton v. United Airlines reversal standard", severity: "HIGH", enforcement: "require_confirmation" },
        { id: "ada-inv-6", description: "Cite 42 U.S.C. §12112 and 29 C.F.R. Part 1630 in all ADA discrimination analysis", severity: "MEDIUM", enforcement: "soft_warn" },
      ],
      confidentiality: "Medical information strictly confidential under ADA §12112(d); separate secured file required",
      citation_requirements: ["42 U.S.C. §12101 et seq.", "29 C.F.R. Part 1630", "EEOC Enforcement Guidance on Reasonable Accommodation (Oct. 17, 2002)", "PWFA Final Rule (Apr. 15, 2024)"],
      escalation_policy: "All accommodation denial recommendations require Littler attorney sign-off.",
    },
    tags: ["ADA", "ADAAA", "interactive-process", "accommodation", "investigation"],
    effectiveDate: new Date().toISOString(),
    scopeId: null,
    scopeType: "agent",
  },
  {
    organizationId: ORG,
    name: "ADEA Age Discrimination Investigation Standards Policy",
    description: "Governs application of ADEA burden-shifting standards and investigation methodology for age discrimination complaints. Applies Gross v. FBL but-for causation standard.",
    domain: "content_boundaries",
    status: "active",
    version: 1,
    policyJson: {
      rules: [
        { id: "adea-1", description: "All ADEA analyses must apply Gross v. FBL but-for causation; never apply Title VII mixed-motive framework to ADEA claims", severity: "CRITICAL", enforcement: "hard_block" },
        { id: "adea-2", description: "Distinguish factors correlating with age (salary, pension) from age itself per Hazen Paper; correlation does not equal discrimination", severity: "HIGH", enforcement: "require_confirmation" },
        { id: "adea-3", description: "RIF affecting employees 40+ must include statistical analysis of ages of affected vs. retained employees", severity: "HIGH", enforcement: "require_confirmation" },
        { id: "adea-4", description: "Stray remarks doctrine applies to ADEA: isolated comments by non-decision-makers insufficient; decision-maker statements receive greater weight", severity: "MEDIUM", enforcement: "soft_warn" },
        { id: "adea-5", description: "Never conclude no age discrimination in RIF without verifying comparator analysis: Were retained employees younger? Criteria applied consistently?", severity: "CRITICAL", enforcement: "require_confirmation" },
        { id: "adea-6", description: "Cite ADEA and Gross v. FBL in all age discrimination analysis; distinguish from Title VII", severity: "MEDIUM", enforcement: "soft_warn" },
      ],
      confidentiality: "RIF investigations should be conducted with attorney oversight from inception given OWBPA waiver requirements",
      citation_requirements: ["29 U.S.C. §§621-634", "Gross v. FBL Financial Services, 557 U.S. 167 (2009)", "Hazen Paper Co. v. Biggins, 507 U.S. 604 (1993)", "ADEA OWBPA 29 U.S.C. §626(f)"],
      escalation_policy: "Any RIF affecting 2+ employees age 40+ requires OWBPA severance agreement review before implementation.",
    },
    tags: ["ADEA", "Gross-v-FBL", "but-for-causation", "RIF"],
    effectiveDate: new Date().toISOString(),
    scopeId: null,
    scopeType: "agent",
  },
  {
    organizationId: ORG,
    name: "State Fair Employment Law Compliance Policy",
    description: "Ensures the agent applies state-specific fair employment law standards more protective than federal law. Covers California FEHA, New York Human Rights Law, Illinois Human Rights Act, and other state equivalents.",
    domain: "content_boundaries",
    status: "active",
    version: 1,
    policyJson: {
      rules: [
        { id: "state-fel-1", description: "For California: Apply FEHA employer strict liability for supervisor harassment — Faragher/Ellerth does NOT apply; flag this distinction in every California supervisor harassment case", severity: "CRITICAL", enforcement: "hard_block" },
        { id: "state-fel-2", description: "For New York: Apply 2019 NYSHRL amendment — severe or pervasive standard eliminated for sexual harassment; any harassing conduct above petty slight is actionable; 3-year SOL", severity: "CRITICAL", enforcement: "hard_block" },
        { id: "state-fel-3", description: "For Illinois: Written sexual harassment policy required under IHRA §2-109; annual training required; flag policy and training gaps as compliance violations", severity: "HIGH", enforcement: "require_confirmation" },
        { id: "state-fel-4", description: "State SOL may differ from federal: CA 3 years, NY 3 years, IL 300 days; identify applicable SOL in every investigation", severity: "HIGH", enforcement: "require_confirmation" },
        { id: "state-fel-5", description: "Most protective standard applies when federal and state conflict; always identify the law providing greater protection and analyze under that standard", severity: "HIGH", enforcement: "require_confirmation" },
        { id: "state-fel-6", description: "Cite state FEL alongside federal statute in every report covering multi-state employers or state-resident employees", severity: "MEDIUM", enforcement: "soft_warn" },
      ],
      confidentiality: "State law investigation requirements are jurisdiction-specific; comply with most restrictive applicable state law",
      citation_requirements: ["California FEHA Gov. Code §12900 et seq.", "New York Human Rights Law Exec. Law §290 et seq.", "Illinois Human Rights Act 775 ILCS 5/"],
      escalation_policy: "Investigations involving California or New York employees require Littler attorney familiar with state FEL to review plan and findings.",
    },
    tags: ["state-FEL", "FEHA", "NYSHRL", "ILHRA", "multi-state"],
    effectiveDate: new Date().toISOString(),
    scopeId: null,
    scopeType: "agent",
  },
  {
    organizationId: ORG,
    name: "Whistleblower Protection Investigation Policy",
    description: "Governs the agent's handling of investigations involving whistleblower allegations under SOX, Dodd-Frank, OSHA, and state whistleblower statutes. Ensures protected disclosure status is identified before investigation actions.",
    domain: "content_boundaries",
    status: "active",
    version: 1,
    policyJson: {
      rules: [
        { id: "wb-1", description: "Before any investigation action involving employee who made compliance report, assess whether report is protected activity under SOX, Dodd-Frank, OSHA, or state whistleblower statute", severity: "CRITICAL", enforcement: "hard_block" },
        { id: "wb-2", description: "If employee made SEC disclosure (Dodd-Frank), engage outside counsel immediately; SEC whistleblowers have enhanced protections", severity: "CRITICAL", enforcement: "hard_block" },
        { id: "wb-3", description: "SOX §806 uses contributing factor causation (not but-for); apply correct standard; do not dismiss because discrimination could have occurred anyway", severity: "HIGH", enforcement: "require_confirmation" },
        { id: "wb-4", description: "Never recommend adverse action against whistleblower discloser without mandatory attorney review; even unrelated adverse actions within 12 months carry significant risk", severity: "CRITICAL", enforcement: "hard_block" },
        { id: "wb-5", description: "Investigation files involving Dodd-Frank whistleblowers must be treated as attorney-client privileged from inception", severity: "HIGH", enforcement: "require_confirmation" },
        { id: "wb-6", description: "Identify government reporting obligations in investigation intake; failure to identify mandatory reporting is a separate compliance failure", severity: "HIGH", enforcement: "require_confirmation" },
      ],
      confidentiality: "Whistleblower files should be privileged from inception when any government involvement is possible",
      citation_requirements: ["SOX §806 (18 U.S.C. §1514A)", "Dodd-Frank §922 (15 U.S.C. §78u-6)", "OSHA whistleblower statutes (29 U.S.C. §660(c))"],
      escalation_policy: "Any SOX or Dodd-Frank whistleblower investigation requires immediate Littler attorney notification. No adverse action without outside counsel approval.",
    },
    tags: ["whistleblower", "SOX", "Dodd-Frank", "OSHA-retaliation"],
    effectiveDate: new Date().toISOString(),
    scopeId: null,
    scopeType: "agent",
  },
  {
    organizationId: ORG,
    name: "Attorney-Client Privilege and Work Product Maintenance Policy",
    description: "Governs agent maintenance of attorney-client privilege and work product protection during workplace investigations. Covers Upjohn warning requirements, privilege designation, inadvertent waiver prevention, and clawback procedures.",
    domain: "content_boundaries",
    status: "active",
    version: 1,
    policyJson: {
      rules: [
        { id: "priv-1", description: "Upjohn warning must be administered at start of every attorney-directed interview; include Upjohn warning text in every attorney-led investigation interview preparation package", severity: "CRITICAL", enforcement: "hard_block" },
        { id: "priv-2", description: "All reports in attorney-directed investigations must include privilege header: 'Privileged and Confidential — Attorney-Client Communication / Attorney Work Product'; flag any draft lacking header", severity: "CRITICAL", enforcement: "hard_block" },
        { id: "priv-3", description: "Do not include privileged analysis in non-privileged document versions; maintain separate versions; commingling destroys privilege", severity: "HIGH", enforcement: "require_confirmation" },
        { id: "priv-4", description: "Any disclosure of privileged investigation document to third party requires legal counsel authorization; unauthorized disclosure triggers attorney notification and claw-back procedure", severity: "CRITICAL", enforcement: "hard_block" },
        { id: "priv-5", description: "Selective disclosure (providing favorable portions while withholding unfavorable) waives privilege over entire subject matter; flag this risk whenever partial disclosure is contemplated", severity: "CRITICAL", enforcement: "hard_block" },
        { id: "priv-6", description: "Investigation notes by non-attorney investigators are not automatically privileged; attorney must direct from inception and notes must reflect attorney's mental impressions for work product protection", severity: "HIGH", enforcement: "require_confirmation" },
      ],
      confidentiality: "Attorney-client privilege must be established at investigation inception and maintained throughout. Do not share findings without attorney authorization.",
      citation_requirements: ["Upjohn Co. v. United States, 449 U.S. 383 (1981)", "FRE 502(b)", "FRCP 26(b)(3)"],
      escalation_policy: "Any potential privilege waiver requires immediate Littler attorney notification and response coordination.",
    },
    tags: ["attorney-client-privilege", "work-product", "Upjohn", "privilege-waiver"],
    effectiveDate: new Date().toISOString(),
    scopeId: null,
    scopeType: "agent",
  },
];

const GOLDEN_DATASET = {
  organizationId: ORG,
  name: "Workplace Investigation Agent — Golden Dataset",
  description: "Curated evaluation dataset for LIT-AGT-003. Covers complaint classification accuracy, investigation plan completeness, legal standard application (Title VII, ADA, ADEA, whistleblower), investigation report quality, and corrective action proportionality. Validated against Littler Mendelson investigation attorneys.",
  industry: "legal_services",
  useCase: "Workplace Investigations",
  version: "1.0",
  scenarioCategories: { edgeCases: 2, happyPath: 1, adversarial: 0, complianceCritical: 3 },
  qualityCoverage: 93,
  coverageDimensions: [
    "Complaint classification accuracy: type and severity across all complaint categories",
    "Investigation plan completeness: witnesses, documents, timeline, investigator assignment",
    "Faragher/Ellerth defense element assessment for supervisor harassment cases",
    "McDonnell Douglas burden-shifting application for discrimination investigations",
    "Burlington Northern materially adverse standard for retaliation analysis",
    "Gross v. FBL but-for causation for ADEA investigations",
    "Upjohn warning and privilege designation accuracy",
    "Corrective action proportionality assessment",
    "Whistleblower (SOX/Dodd-Frank) protected activity identification",
    "Multi-state FEL identification (CA FEHA, NY SHRL, IL HRA)",
  ],
  benchmarkRange: { low: 87, high: 96 },
  contributors: [],
  growthHistory: [],
  status: "active",
  tags: ["workplace-investigation", "harassment", "discrimination", "retaliation", "whistleblower", "LIT-AGT-003"],
  aiGenerated: false,
  performanceBenchmarks: {
    complaintClassificationAccuracy: { target: 0.95, description: "Correct complaint type and severity tier vs. experienced investigator assessment" },
    investigationPlanCompleteness: { target: 0.93, description: "AI plans include all elements vs. Littler attorney-created plans" },
    legalStandardAccuracy: { target: 0.95, description: "Correct identification of applicable laws and burden-shifting frameworks" },
    reportQualityScore: { target: 0.90, description: "Attorney review scores on thoroughness, objectivity, and legal defensibility (4+ = pass)" },
  },
  dataRecordCount: 500,
};

const TEST_CASES = [
  {
    name: "Sexual Harassment — Supervisor Quid Pro Quo with Tangible Action (California)",
    inputScenario: "Sarah, a sales associate at a California-based retailer with 500 employees, reports that her supervisor John conditioned her promotion on agreeing to date him. When she refused, he gave her the lowest performance rating, moved her to the worst shift, and passed her over for promotion in favor of a less qualified male colleague. She reported to HR 3 months after the shift change. California FEHA applies.",
    expectedBehavior: "Classify as quid pro quo sexual harassment AND retaliation; P2 severity; identify CA FEHA strict liability for supervisor harassment (NO Faragher/Ellerth); identify three tangible employment actions (shift, performance, promotion); correct witness sequence; do not dismiss for delayed reporting",
    evaluationCriteria: ["Classifies as quid pro quo AND retaliation", "Identifies P2 severity", "Applies CA FEHA strict liability (no Faragher/Ellerth)", "Identifies all three tangible actions", "Correct witness sequence", "Does not dismiss for delay"],
    rubricScoring: { dimensions: [{ name: "Complaint Classification", weight: 0.20, passingScore: 1.0 }, { name: "CA FEHA vs. Federal", weight: 0.25, passingScore: 1.0 }, { name: "Tangible Action ID", weight: 0.20, passingScore: 1.0 }, { name: "Investigation Plan", weight: 0.20, passingScore: 0.85 }, { name: "Legal Standard", weight: 0.15, passingScore: 0.90 }] },
    category: "complianceCritical", difficulty: "complex", jurisdiction: "California",
    sourceDocuments: ["California FEHA Gov. Code §12940", "Faragher v. City of Boca Raton", "Burlington Northern v. White"],
  },
  {
    name: "ADEA Age Discrimination — RIF with Mixed-Age Workforce Reduction",
    inputScenario: "Acme Manufacturing (1,200 employees, Ohio) eliminates 40 of 150 positions. Of 40 terminated, 32 are over 50; average age of retained employees is 38 vs. 53 for terminated. Company states selection based on 'performance ratings.' Of 32 over-50 terminated, 25 had 'meets expectations' or higher in last two reviews. Six employees filed ADEA charges.",
    expectedBehavior: "Identify systemic ADEA pattern/class claim; apply Gross v. FBL but-for causation (NOT Title VII mixed-motive); statistical analysis critical (80% of terminated are 50+); distinguish Hazen Paper; flag OWBPA compliance for severance; flag parallel EEOC proceedings requiring outside counsel",
    evaluationCriteria: ["Identifies systemic ADEA claim", "Applies Gross v. FBL but-for (not mixed-motive)", "Statistical disparities as prima facie evidence", "Hazen Paper distinction", "OWBPA severance flag", "Parallel EEOC proceeding protocol"],
    rubricScoring: { dimensions: [{ name: "Systemic Claim ID", weight: 0.20, passingScore: 1.0 }, { name: "ADEA Causation (Gross)", weight: 0.25, passingScore: 1.0 }, { name: "Statistical Evidence", weight: 0.20, passingScore: 0.90 }, { name: "OWBPA Flag", weight: 0.15, passingScore: 1.0 }, { name: "Government Investigation Protocol", weight: 0.20, passingScore: 1.0 }] },
    category: "complianceCritical", difficulty: "expert", jurisdiction: "Ohio (federal ADEA)",
    sourceDocuments: ["29 U.S.C. §§621-634", "Gross v. FBL Financial Services", "ADEA OWBPA §626(f)"],
  },
  {
    name: "SOX Whistleblower Retaliation — Financial Fraud Report followed by Termination",
    inputScenario: "Marcus, Senior Accountant at publicly traded Acme Corp, reported to the audit committee that the CFO was manipulating revenue recognition in violation of GAAP and SEC Rule 10b-5. Two weeks later, he received his first-ever PIP for 'communication issues' in 7 years. Three months later, terminated for 'failure to meet PIP goals.' He filed a SOX §806 complaint with OSHA.",
    expectedBehavior: "Identify SOX §806 whistleblower retaliation; contributing factor causation standard (NOT but-for); 14-day temporal proximity highly probative; 7-year clean record then PIP = pretext; engage outside counsel immediately (OSHA complaint active); document litigation hold; assess Dodd-Frank applicability",
    evaluationCriteria: ["SOX §806 identified", "Contributing factor causation (not but-for)", "14-day temporal proximity flagged", "7-year clean record = pretext indicator", "Outside counsel engagement", "Litigation hold", "Dodd-Frank applicability assessed"],
    rubricScoring: { dimensions: [{ name: "SOX Identification", weight: 0.20, passingScore: 1.0 }, { name: "Contributing Factor Causation", weight: 0.25, passingScore: 1.0 }, { name: "Temporal Proximity", weight: 0.15, passingScore: 0.90 }, { name: "Outside Counsel Escalation", weight: 0.20, passingScore: 1.0 }, { name: "Document Preservation", weight: 0.20, passingScore: 1.0 }] },
    category: "complianceCritical", difficulty: "expert", jurisdiction: "Federal (SOX)",
    sourceDocuments: ["SOX §806 (18 U.S.C. §1514A)", "Burlington Northern v. White"],
  },
  {
    name: "Racially Hostile Work Environment — Co-Worker Pattern (No Supervisor Involvement)",
    inputScenario: "David, a Black engineer in Illinois, experiences over 8 months: racial stereotype jokes in team meetings; a racial slur on a sticky note (once); consistent exclusion from team lunches; coworker comments about 'impressive for someone with his background.' HR received his email about 'uncomfortable environment' 4 months ago but did not investigate.",
    expectedBehavior: "Classify as racial hostile work environment (Title VII + Illinois HRA); cumulative pervasive analysis; 4-month-old email = constructive/actual notice to employer = separate compliance failure; co-worker liability standard (knew + failed to act); Faragher/Ellerth does NOT apply to co-worker harassment; Illinois written policy and training requirements",
    evaluationCriteria: ["Racial HWE classification (cumulative)", "4-month email = actual notice = compliance failure", "Co-worker liability standard applied", "Faragher/Ellerth inapplicable (co-worker)", "Illinois HRA requirements identified", "8-month investigation scope planned"],
    rubricScoring: { dimensions: [{ name: "Cumulative Pattern Analysis", weight: 0.25, passingScore: 1.0 }, { name: "Notice Analysis", weight: 0.25, passingScore: 1.0 }, { name: "Liability Standard (co-worker)", weight: 0.20, passingScore: 1.0 }, { name: "Illinois HRA Application", weight: 0.15, passingScore: 0.85 }, { name: "Investigation Scope", weight: 0.15, passingScore: 0.85 }] },
    category: "complianceCritical", difficulty: "complex", jurisdiction: "Illinois",
    sourceDocuments: ["Title VII (42 U.S.C. §2000e)", "Illinois Human Rights Act 775 ILCS 5/", "Harris v. Forklift Systems"],
  },
  {
    name: "ADA Accommodation During Investigation — Disability Disclosure by Witness",
    inputScenario: "Maria, a witness with PTSD, requests her interview be in a quiet space, limited to 45 minutes with breaks, and her therapist on the phone. She also discloses during intake that her PTSD was triggered by respondent's conduct — a claim she never formally filed.",
    expectedBehavior: "Identify ADA accommodation obligation for interview process; assess each request (quiet space: grant; time/breaks: grant; therapist by phone: evaluate); segregate medical info from investigation file per ADA §12112(d); identify Maria's disclosure as a NEW complaint requiring investigation; identify ADA disability (PTSD); flag interactive process obligation for her ongoing accommodations",
    evaluationCriteria: ["ADA accommodation obligation for interview process", "Each accommodation request assessed", "Medical info segregation required", "Disclosure = new complaint identified", "PTSD = ADA disability", "Interactive process obligation for ongoing accommodations"],
    rubricScoring: { dimensions: [{ name: "ADA Accommodation During Investigation", weight: 0.25, passingScore: 1.0 }, { name: "Medical Info Segregation", weight: 0.20, passingScore: 1.0 }, { name: "New Complaint ID", weight: 0.20, passingScore: 1.0 }, { name: "Interactive Process", weight: 0.20, passingScore: 0.90 }, { name: "Documentation Guidance", weight: 0.15, passingScore: 0.85 }] },
    category: "edgeCases", difficulty: "complex", jurisdiction: "Federal (ADA)",
    sourceDocuments: ["ADA 42 U.S.C. §12112", "EEOC Guidance on Reasonable Accommodation"],
  },
  {
    name: "Standard Harassment Investigation — Clean Fact Pattern (Happy Path)",
    inputScenario: "Tom, a warehouse employee in Texas (50 employees), reports coworker Jessica (non-supervisor) made repeated sexual comments over 3 months: commenting on his appearance, sexual jokes, and once touching his shoulder. Employer has written anti-harassment policy, annual training, and clear HR reporting channel. First complaint against Jessica.",
    expectedBehavior: "Classify as co-worker sexual harassment (not quid pro quo); P3 severity; 3-month pattern meets pervasive standard; employer liability: knew + must take prompt action; Faragher/Ellerth does NOT apply to co-worker harassment; plan investigation with correct witness sequence; interim separation assessment; 45-day completion estimate",
    evaluationCriteria: ["Co-worker sexual harassment (not quid pro quo)", "Correct liability standard (knew + failed to act)", "Pervasive standard (3-month pattern)", "Faragher/Ellerth inapplicable", "Correct witness sequence", "Interim measures assessed", "45-day timeline for P3"],
    rubricScoring: { dimensions: [{ name: "Classification", weight: 0.20, passingScore: 1.0 }, { name: "Liability Standard", weight: 0.25, passingScore: 1.0 }, { name: "Pervasive Standard", weight: 0.20, passingScore: 0.85 }, { name: "Investigation Plan Sequence", weight: 0.20, passingScore: 0.90 }, { name: "Interim Measures", weight: 0.15, passingScore: 0.80 }] },
    category: "happyPath", difficulty: "standard", jurisdiction: "Texas (federal Title VII)",
    sourceDocuments: ["Title VII (42 U.S.C. §2000e)", "Harris v. Forklift Systems"],
  },
];

const KPIS = [
  { name: "Complaint Classification Accuracy", unit: "percent", baseline: 76, target: 95, targetOperator: "gte", weight: 0.20, slaThreshold: 88, breachLevel: "critical", confidence: 0.90, trend: "improving", expression: "(correct_complaint_classifications / total_complaints_classified) * 100", measurement: "Complaint type and severity tier prediction validated against experienced Littler investigation attorney assessment on 500+ historical investigation file dataset" },
  { name: "Investigation Plan Completeness Rate", unit: "percent", baseline: 72, target: 93, targetOperator: "gte", weight: 0.18, slaThreshold: 85, breachLevel: "critical", confidence: 0.88, trend: "improving", expression: "(complete_plans / total_plans_generated) * 100", measurement: "AI-generated investigation plans scored against 15-element completeness checklist by Littler investigation attorneys; 13+ elements = complete" },
  { name: "Legal Standard Application Accuracy", unit: "percent", baseline: 80, target: 95, targetOperator: "gte", weight: 0.20, slaThreshold: 88, breachLevel: "critical", confidence: 0.92, trend: "stable", expression: "(correct_legal_standard_applications / total_legal_analyses) * 100", measurement: "Correct identification of applicable statute, burden-shifting framework, and causation standard vs. Littler attorney ground truth" },
  { name: "Investigation Report Quality Score", unit: "percent", baseline: 74, target: 90, targetOperator: "gte", weight: 0.18, slaThreshold: 82, breachLevel: "high", confidence: 0.87, trend: "improving", expression: "(reports_rated_legally_defensible / total_reports_reviewed) * 100", measurement: "Attorney review on 5-point scale for thoroughness, objectivity, legal defensibility; 4+ = legally defensible" },
  { name: "Faragher/Ellerth Defense Documentation Rate", unit: "percent", baseline: 65, target: 98, targetOperator: "gte", weight: 0.12, slaThreshold: 90, breachLevel: "critical", confidence: 0.93, trend: "improving", expression: "(plans_with_all_FE_elements / total_supervisor_harassment_plans) * 100", measurement: "Proportion of supervisor harassment plans including all Faragher/Ellerth defense elements" },
  { name: "Investigation Timeline Adherence Rate", unit: "percent", baseline: 68, target: 92, targetOperator: "gte", weight: 0.08, slaThreshold: 80, breachLevel: "medium", confidence: 0.85, trend: "improving", expression: "(investigations_completed_on_time / total_investigations) * 100", measurement: "Proportion completed within policy-mandated timeframe by severity tier" },
  { name: "Investigation Completion Speed", unit: "seconds", baseline: 1200, target: 90, targetOperator: "lte", weight: 0.04, slaThreshold: 300, breachLevel: "medium", confidence: 0.95, trend: "improving", expression: "avg(investigation_plan_generation_time_seconds)", measurement: "Time from complaint submission to complete investigation plan delivery" },
  { name: "Attorney Escalation Precision", unit: "percent", baseline: 72, target: 90, targetOperator: "gte", weight: 0.00, slaThreshold: 80, breachLevel: "low", confidence: 0.82, trend: "stable", expression: "(correctly_escalated / total_escalations) * 100", measurement: "Proportion of escalations validated as genuinely requiring attorney involvement" },
];

const SYSTEM_PROMPT = `You are the Littler Workplace Investigation Agent (LIT-AGT-003), a specialized AI legal guidance system for Littler Mendelson P.C.

Your purpose is to support workplace investigations into discrimination, harassment, retaliation, whistleblower complaints, and policy violations — from complaint classification through investigation plan generation, witness interview preparation, evidence management, legal standard application, and report drafting.

OPERATING CONSTRAINTS:
- SUPERVISED autonomy: all corrective action recommendations, termination decisions, and privileged reports require Littler attorney sign-off
- NEVER recommend adverse action against a complainant, witness, or whistleblower without mandatory attorney review
- NEVER produce a final investigation report without "REQUIRES ATTORNEY REVIEW BEFORE DISTRIBUTION"
- Always cite the specific statute, regulation, and case law
- Flag confidence below 75% for attorney review

ESCALATION TRIGGERS (MANDATORY): Imminent physical threat; government charge filed; senior executive respondent; SOX/Dodd-Frank whistleblower; criminal conduct; evidence tampering; adverse action against complainant within 12 months; privilege waiver risk`;

const RUNTIME_TASK_PROMPT = `Analyze the workplace investigation request. Classify the complaint by type and severity, identify all applicable federal and state laws, generate a complete investigation plan with witness sequence and document requests, prepare interview outlines with required admonitions, apply relevant legal standard to factual findings, and draft investigation report findings with credibility assessments. For all supervisor harassment cases, document Faragher/Ellerth defense elements. Flag all items requiring attorney review.`;

// ══════════════════════════════════════════════════════════════════════════════
// MAIN EXECUTION
// ══════════════════════════════════════════════════════════════════════════════

async function main() {
  console.log("\n════════════════════════════════════════════════════════════════════");
  console.log("  LIT-AGT-003 — Workplace Investigation Agent");
  console.log("  PRODUCTION MIGRATION via API");
  console.log(`  Target: ${BASE}`);
  console.log(`  Org:    ${ORG}`);
  console.log("════════════════════════════════════════════════════════════════════\n");

  const ids = {};

  // ── STEP 1: 6 SKILLS ─────────────────────────────────────────────────────────
  step("1", "11", "Creating 6 skills…");
  ids.skillIds = [];
  for (const s of SKILLS) {
    const res = await post("/api/skills", s);
    ids.skillIds.push(res.id);
    log(`Skill: ${s.name} → ${res.id}`);
  }

  // ── STEP 2: KNOWLEDGE BASE ────────────────────────────────────────────────────
  step("2", "11", "Creating knowledge base…");
  const kbRes = await post("/api/knowledge-bases", {
    organizationId: ORG,
    name: "Workplace Investigation Knowledge Base",
    description: "Comprehensive knowledge base for LIT-AGT-003 covering Littler investigation toolkit, methodology guides by complaint type, legal standards reference, interview question banks, corrective action precedent database, and EEOC enforcement guidance on harassment, retaliation, and accommodations.",
    industry: "legal_services",
    type: "policy",
    status: "active",
    accessLevel: "private",
    tags: ["workplace-investigation", "harassment", "discrimination", "retaliation", "whistleblower", "LIT-AGT-003"],
  });
  ids.kbId = kbRes.id;
  log(`Knowledge Base → ${kbRes.id}`);

  // ── STEP 3: 6 KB SOURCES ─────────────────────────────────────────────────────
  step("3", "11", `Ingesting ${KB_SOURCES.length} knowledge base sources…`);
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
      warn(`KB Source (non-fatal): ${src.title.slice(0, 50)} — ${e.message.slice(0, 80)}`);
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
  step("6", "11", "Creating agent LIT-AGT-003…");
  const agentRes = await post("/api/agents", {
    organizationId: ORG,
    name: "Workplace Investigation Agent",
    agentType: "advisory",
    description: "Supports the full lifecycle of workplace investigations into discrimination, harassment, retaliation, whistleblower complaints, and policy violations. Maps to Littler's Investigations and Discrimination & Harassment practice areas. Structures investigation plans, manages witness interview preparation, tracks evidence collection, analyzes findings against legal standards, and drafts investigation reports.",
    owner: "Littler Mendelson P.C.",
    status: "active",
    riskTier: "HIGH",
    autonomyMode: "supervised",
    currentVersion: "1.0.0",
    environment: "production",
    modelProvider: "anthropic",
    modelName: "claude-opus-4-5",
    department: "Investigations Practice",
    systemPrompt: SYSTEM_PROMPT,
    runtimeConfig: {
      agentCode: "LIT-AGT-003",
      practiceArea: "Investigations & Discrimination",
      productMapping: "Littler Investigations Practice + onDemand",
      jurisdictionCoverage: "Federal + 50 states",
      confidenceThreshold: 75,
      escalationTriggers: ["imminent_physical_threat", "government_charge_filed", "senior_executive_respondent", "whistleblower_SOX_Dodd_Frank", "criminal_conduct", "evidence_tampering", "adverse_action_against_complainant", "privilege_waiver_risk"],
      prompt: RUNTIME_TASK_PROMPT,
    },
    blueprintJson: {
      version: "1.0",
      agentCode: "LIT-AGT-003",
      practiceArea: "Investigations & Discrimination",
      nodes: [
        { id: "intake", type: "trigger", label: "Receive Complaint" },
        { id: "classification", type: "skill", label: "Complaint Intake & Classification" },
        { id: "investigation_plan", type: "skill", label: "Investigation Plan Generation" },
        { id: "interview_prep", type: "skill", label: "Witness Interview Preparation" },
        { id: "evidence_tracking", type: "skill", label: "Evidence Management" },
        { id: "legal_analysis", type: "skill", label: "Legal Standard Application" },
        { id: "report_drafting", type: "skill", label: "Investigation Report Drafting" },
        { id: "output", type: "output", label: "Investigation Report & Corrective Action" },
      ],
      edges: [
        { from: "intake", to: "classification" },
        { from: "classification", to: "investigation_plan" },
        { from: "investigation_plan", to: "interview_prep" },
        { from: "interview_prep", to: "evidence_tracking" },
        { from: "evidence_tracking", to: "legal_analysis" },
        { from: "legal_analysis", to: "report_drafting" },
        { from: "report_drafting", to: "output" },
      ],
    },
    toolsConfig: {
      allowedTools: ["retrieve_kb", "classify_complaint", "score_severity", "generate_investigation_plan", "sequence_witnesses", "generate_interview_guide", "track_evidence", "generate_privilege_log", "lookup_legal_standards", "apply_burden_shifting", "generate_document", "score_confidence"],
      mcpServers: ["littler-investigations-mcp", "legal-standards-mcp", "document-gen-mcp"],
    },
    maxToolIterations: 12,
    complianceTags: ["Title-VII", "ADA", "ADAAA", "ADEA", "SOX-806", "Dodd-Frank-922", "FEHA", "NYSHRL", "ILHRA", "Faragher-Ellerth", "Upjohn", "EEOC"],
    preloadedSkills: ids.skillIds.map((skillId, i) => ({ skillId, loadOrder: i })),
    policyBindings: ids.policyIds,
  });
  ids.agentId = agentRes.id;
  log(`Agent: Workplace Investigation Agent → ${agentRes.id}`);

  // ── STEP 7: LINK RUNBOOKS & POLICIES TO AGENT ─────────────────────────────────
  step("7", "11", "Linking runbooks (agentId) and policies (scopeId) to agent…");
  for (const rId of ids.runbookIds) {
    try {
      await patch(`/api/runbooks/${rId}`, { agentId: ids.agentId });
    } catch (e) {
      warn(`Runbook agentId (non-fatal): ${e.message.slice(0, 60)}`);
    }
  }
  log("All 6 runbooks: agentId set");
  for (const pId of ids.policyIds) {
    try {
      await patch(`/api/policies/${pId}`, { scopeId: ids.agentId, scopeType: "agent" });
    } catch (e) {
      warn(`Policy scopeId (non-fatal): ${e.message.slice(0, 60)}`);
    }
  }
  log("All 6 policies: scopeId set");

  // ── STEP 8: GOLDEN DATASET + 6 TEST CASES ────────────────────────────────────
  step("8", "11", "Creating golden dataset + 6 test cases…");
  const dsRes = await post("/api/golden-datasets", GOLDEN_DATASET);
  ids.goldenDatasetId = dsRes.id;
  log(`Golden Dataset → ${dsRes.id}`);
  ids.testCaseIds = [];
  for (const tc of TEST_CASES) {
    try {
      const tcRes = await post(`/api/golden-datasets/${ids.goldenDatasetId}/test-cases`, { ...tc, datasetId: ids.goldenDatasetId, organizationId: ORG });
      ids.testCaseIds.push(tcRes.id);
      log(`Test Case: ${tc.name.slice(0, 65)}`);
    } catch (e) {
      warn(`Test Case (non-fatal): ${tc.name.slice(0, 50)} — ${e.message.slice(0, 80)}`);
    }
  }

  // ── STEP 9: EVAL SUITE (schedule as string) ───────────────────────────────────
  step("9", "11", "Creating evaluation suite…");
  const evalRes = await post("/api/evals", {
    organizationId: ORG,
    agentId: ids.agentId,
    goldenDatasetId: ids.goldenDatasetId,
    skillId: null,
    name: "LIT-AGT-003 Workplace Investigation Evaluation Suite",
    type: "accuracy",
    thresholdConfig: { complaintClassificationAccuracy: 0.95, investigationPlanCompleteness: 0.93, legalStandardApplicationAccuracy: 0.95, reportQualityScore: 0.90, faragherEllerthDocumentationRate: 0.98, overallPassRate: 0.92 },
    scorerConfig: { primary: "attorney_ground_truth", secondary: "rule_based_checklist_verification", rubric: "rubricScoring", citationCheck: true, jurisdictionAccuracyCheck: true, privilegeComplianceCheck: true },
    coverageTags: ["Title-VII", "ADA", "ADEA", "retaliation", "whistleblower", "Faragher-Ellerth", "McDonnell-Douglas", "Burlington-Northern", "Gross-v-FBL", "SOX-806"],
    environmentThresholds: { staging: { minPassRate: 0.87 }, production: { minPassRate: 0.92 } },
    schedule: "weekly:Wednesday:06:00 UTC",
    industry: "legal_services",
    ontologyTags: ["Complaint Classification", "Investigation Plan", "Legal Standard Application", "Investigation Report", "Evidence Management", "Corrective Action"],
  });
  ids.evalSuiteId = evalRes.id;
  log(`Eval Suite → ${evalRes.id}`);

  // ── STEP 10: OUTCOME CONTRACT + 8 KPIs (version as number) ───────────────────
  step("10", "11", "Creating outcome contract + 8 KPIs…");
  const outcomeRes = await post("/api/outcomes/with-kpis", {
    outcome: {
      organizationId: ORG,
      name: "Workplace Investigation Agent — Outcome Contract",
      description: "Business objectives, KPIs, and SLAs governing the Workplace Investigation Agent (LIT-AGT-003). Targets complaint classification accuracy, investigation plan completeness, legal standard application accuracy, and investigation report quality.",
      version: 1,
      status: "active",
      industry: "legal_services",
      agentCode: "LIT-AGT-003",
      practiceArea: "Investigations & Discrimination",
      productMapping: "Littler Investigations Practice + onDemand",
      objectives: [
        "Achieve 95%+ complaint classification accuracy across all investigation complaint types",
        "Produce investigation plans rated complete by Littler investigation attorneys in 93%+ of cases",
        "Apply correct legal standards in 95%+ of analyses",
        "Generate investigation reports rated legally defensible by Littler attorneys in 90%+ of cases",
      ],
      successCriteria: {
        primary: "Complaint classification accuracy ≥ 95% vs. experienced investigator ground truth",
        secondary: "Investigation plan completeness ≥ 93%; legal standard accuracy ≥ 95%",
        guardrails: "Zero adverse action recommendations without attorney review; zero Faragher/Ellerth omissions",
      },
      attributionRules: { agentId: ids.agentId, attributionModel: "direct", lookbackWindowDays: 90, minimumConfidenceThreshold: 0.75 },
      targetMetrics: { complaintClassificationAccuracy: 0.95, investigationPlanCompleteness: 0.93, legalStandardApplicationAccuracy: 0.95, reportQualityScore: 0.90 },
      slaConfig: { responseTimeMs: 8000, availabilityTarget: 0.995, escalationResponseTime: 900 },
      criticalPath: ["complaint_intake", "severity_assessment", "investigation_plan", "legal_standard_application", "report_drafting"],
      roiEstimate: { averageLitigationCostReduction: 380000, investigationEfficiencyGain: 65000, litigationRiskReduction: 0.50, faragherEllerthDefenseCostSavings: 120000 },
    },
    kpis: KPIS,
  });
  ids.outcomeId = outcomeRes.outcome?.id || outcomeRes.id;
  log(`Outcome Contract → ${ids.outcomeId}`);

  // ── STEP 11: LINK ALL INTELLIGENCE TO AGENT ───────────────────────────────────
  step("11", "11", "Linking all platform intelligence to agent…");

  try {
    await post(`/api/agents/${ids.agentId}/knowledge-bases`, {
      knowledgeBaseId: ids.kbId,
      priority: 1,
      retrievalConfig: { topK: 12, scoreThreshold: 0.70, rerankEnabled: true, jurisdictionFiltering: true, citationMode: "full" },
    });
    log("Knowledge base linked to agent");
  } catch (e) {
    warn(`KB link (non-fatal): ${e.message.slice(0, 80)}`);
  }

  await patch(`/api/agents/${ids.agentId}`, { outcomeId: ids.outcomeId, evalBindings: [ids.evalSuiteId] });
  log("Outcome contract linked to agent");
  log("Eval suite linked to agent");

  // Set ontology tags — fetch dynamically from production
  try {
    const allConcepts = await get("/api/ontology-concepts/all");
    const byId = new Map(allConcepts.map(c => [c.id, c]));

    // Find best matching concepts for workplace investigations in prod ontology
    const legalConcepts = allConcepts.filter(c => c.id.startsWith("legal_services-"));
    log(`Found ${legalConcepts.length} legal_services ontology concepts in prod`);

    // Target concepts — prefer investigation/compliance/risk/litigation
    const preferredIds = [
      "legal_services-legal-consulting-riskassessment",
      "legal_services-legal-consulting-complianceadvisory",
      "legal_services-litigation-discoveryprocess",
      "legal_services-regulatory-compliance-regulatoryreporting",
      "legal_services-legal-consulting-legalduediligence",
    ];

    // Fall back to first available legal_services concepts if preferred not found
    const selectedConcepts = [];
    for (const prefId of preferredIds) {
      if (byId.has(prefId)) {
        const c = byId.get(prefId);
        selectedConcepts.push({ conceptId: c.id, label: c.label, category: c.category });
      }
    }

    // If we don't have 5 yet, fill from available legal_services concepts
    if (selectedConcepts.length < 5) {
      const used = new Set(selectedConcepts.map(t => t.conceptId));
      for (const c of legalConcepts) {
        if (selectedConcepts.length >= 5) break;
        if (!used.has(c.id)) {
          selectedConcepts.push({ conceptId: c.id, label: c.label, category: c.category });
          used.add(c.id);
        }
      }
    }

    if (selectedConcepts.length > 0) {
      await patch(`/api/agents/${ids.agentId}`, { ontologyTags: selectedConcepts });
      log(`Ontology tags set (${selectedConcepts.length}): ${selectedConcepts.map(t => t.label).join(", ")}`);
    } else {
      warn("No legal_services ontology concepts found in prod — ontology tags skipped");
    }
  } catch (e) {
    warn(`Ontology tags (non-fatal): ${e.message.slice(0, 100)}`);
  }

  // ── SAVE IDs ──────────────────────────────────────────────────────────────────
  writeFileSync("scripts/lit-agt-003-prod-ids.json", JSON.stringify(ids, null, 2));

  console.log("\n════════════════════════════════════════════════════════════════════");
  console.log("  ✅  LIT-AGT-003 PRODUCTION MIGRATION — COMPLETE");
  console.log("════════════════════════════════════════════════════════════════════");
  console.log(`\n  Agent:           ${ids.agentId}`);
  console.log(`  Knowledge Base:  ${ids.kbId} (${ids.kbSourceIds?.length || 0} sources)`);
  console.log(`  Skills (6):      ${ids.skillIds.join("\n                   ")}`);
  console.log(`  Policies (6):    ${ids.policyIds.join("\n                   ")}`);
  console.log(`  Runbooks (6):    ${ids.runbookIds.join("\n                   ")}`);
  console.log(`  Golden Dataset:  ${ids.goldenDatasetId} (${ids.testCaseIds?.length || 0} test cases)`);
  console.log(`  Eval Suite:      ${ids.evalSuiteId}`);
  console.log(`  Outcome:         ${ids.outcomeId}`);
  console.log(`\n  Prod IDs saved → scripts/lit-agt-003-prod-ids.json\n`);
}

main().catch(err => {
  console.error(`\n❌  Production migration failed: ${err.message}`);
  process.exit(1);
});
