#!/usr/bin/env node
/**
 * LIT-AGT-003 — Workplace Investigation Agent
 * Creates ALL platform intelligence in the DEV environment via API only.
 *
 * Lessons applied from previous agents (LIT-AGT-001, -002, -010):
 *  - preloadedSkills: stored as [{skillId, loadOrder}] objects (NOT plain UUID strings)
 *  - KB sources: created with `title` field (not `name`) then PATCH-renamed if needed
 *  - Policy PATCH: uses /api/policies/:id (not /api/governance/policies/:id)
 *  - ontologyTags: stored as [{conceptId, label, category}] objects
 *  - runbooks/policies: agentId/scopeId set immediately after agent creation via PATCH
 *  - All via API only — no direct DB access
 *  - eval schedule: object { frequency, dayOfWeek, time }
 *  - outcome version: string "1.0" (not number)
 *  - Ontology concepts: fetched dynamically via /api/ontology-concepts/all
 *
 * Usage:  node scripts/create-lit-agt-003-dev.js
 * Saves:  scripts/lit-agt-003-dev-ids.json
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
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!r.ok) throw new Error(`PATCH ${path} → ${r.status}: ${JSON.stringify(data).slice(0, 600)}`);
  return data;
}

async function get(path) {
  const r = await fetch(`${BASE}${path}`, { headers: { "Content-Type": "application/json" } });
  const text = await r.text();
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
// ══════════════════════════════════════════════════════════════════════════════

// ── SKILLS (6) ───────────────────────────────────────────────────────────────
// Per spec §4.4

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
    yamlFrontmatter: `name: Complaint Intake & Classification Skill
version: "1.0"
agent_code: LIT-AGT-003
domain: workplace-investigations
industry: legal_services
trust_tier: HIGH
context_mode: rag
complaint_types: [discrimination, harassment, retaliation, whistleblower, policy_violation, workplace_violence, theft]
severity_tiers: [P1_imminent_threat, P2_serious, P3_moderate, P4_minor]
required_kb: Workplace Investigation Knowledge Base
citation_required: true
privilege_awareness: true`,
    markdownBody: `# Complaint Intake & Classification Skill

## Purpose
Receives, structures, and classifies workplace complaints from all intake channels (formal charge, ethics hotline, manager escalation, anonymous report, litigation hold) and produces a structured complaint record with severity tier and recommended investigation path.

## Complaint Types & Legal Triggers

### Discrimination Complaints
- **Race/Color** (Title VII, 42 U.S.C. §2000e-2; state FELs): Disparate treatment, disparate impact, hostile work environment
- **Sex/Gender** (Title VII; PWFA; state laws): Unequal pay, gender stereotyping, pregnancy discrimination
- **Age** (ADEA, 29 U.S.C. §§621-634; state laws): Adverse actions targeting employees 40+
- **Disability** (ADA/ADAAA, 42 U.S.C. §12101+; state laws): Failure to accommodate, discriminatory discharge
- **Religion** (Title VII): Failure to accommodate sincerely held religious belief
- **National Origin** (Title VII; IRCA): Disparate treatment, harassment, accent discrimination
- **Sexual Orientation/Gender Identity** (Bostock v. Clayton County, 590 U.S. 644 (2020)): Covered under Title VII sex discrimination

### Harassment Complaints
- **Sexual Harassment** — Quid Pro Quo or Hostile Work Environment (Harris v. Forklift Systems, 510 U.S. 17 (1993))
  - Quid pro quo: Supervisory conditioning employment benefit on sexual favor
  - Hostile work environment: Conduct severe or pervasive enough to alter conditions of employment
  - Faragher/Ellerth affirmative defense applicability analysis
- **Non-Sexual Hostile Work Environment**: Race, age, disability, religion-based hostile environment
- **Supervisor vs. Co-worker**: Different liability standards; employer strict liability for supervisor tangible action

### Retaliation Complaints
- **Title VII/ADA/ADEA retaliation** (Burlington Northern v. White, 548 U.S. 53 (2006)): Materially adverse action against protected activity
- **FLSA retaliation**: Complaints about wage/hour violations
- **OSHA retaliation**: Safety complaints
- **Whistleblower** (SOX §806, Dodd-Frank §922, state statutes): Protected disclosure of securities violations, fraud, or regulatory violations

### Policy Violation Complaints
- Code of conduct violations, confidentiality breaches, conflicts of interest, theft, fraud, workplace violence

## Severity Classification Framework

### Priority 1 — Imminent Threat (Same-day response)
- Credible threats of physical violence
- Ongoing criminal conduct (theft in progress, assault)
- Senior executive involved as respondent
- Potential OSHA recordable incident

### Priority 2 — Serious (48-hour response)
- Sexual harassment with supervisory respondent
- Discrimination claim with adverse action in last 30 days
- Whistleblower complaint with potential SOX/Dodd-Frank coverage
- Multiple complainants or systemic pattern
- Parallel government investigation (EEOC charge filed)

### Priority 3 — Moderate (5-business-day response)
- Co-worker harassment without supervisory nexus
- Policy violation with no criminal exposure
- Single-incident discrimination claim without recent adverse action

### Priority 4 — Minor (14-calendar-day response)
- Interpersonal conflict without legal merit indicators
- First-time minor policy violations
- Anonymous complaints lacking specific factual basis

## Complaint Intake Output Format
\`\`\`
COMPLAINT INTAKE RECORD
Complaint ID: [auto-generated]
Intake Date: [date]
Intake Channel: [formal_charge | hotline | manager_escalation | direct_report | anonymous]
Complainant: [name/anonymous]
Respondent: [name/title]
Complaint Type: [primary_type] | [secondary_type if applicable]
Legal Triggers: [applicable statutes]
Severity Tier: [P1/P2/P3/P4]
Recommended Investigator Level: [HR | Senior HR | External | Attorney-led]
Privilege Designation: [Upjohn-protected | Non-privileged]
Recommended Response Timeline: [same-day | 48hr | 5-day | 14-day]
Preliminary Scope: [description]
Immediate Actions Required: [list]
\`\`\`

## Escalation Triggers
- Respondent is senior management (VP+) → attorney-led investigation
- Criminal conduct indicator → security and legal counsel notification
- Government charge filed → outside counsel coordination
- Multiple complainants alleging systemic pattern → systemic investigation protocol
`,
  },
  {
    organizationId: ORG,
    name: "Investigation Plan Generator Skill",
    description: "Creates structured, legally defensible investigation plans based on complaint type, scope, and severity. Generates a complete investigation roadmap including witness list and interview sequence, documents to request, evidence preservation instructions, timeline with milestones, and investigator assignment recommendation. Plans are tailored to complaint type (sexual harassment, discrimination, retaliation, etc.) and account for Faragher/Ellerth defense requirements, privilege considerations, and state-specific procedural obligations.",
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
    yamlFrontmatter: `name: Investigation Plan Generator Skill
version: "1.0"
agent_code: LIT-AGT-003
domain: workplace-investigations
industry: legal_services
trust_tier: HIGH
context_mode: rag
plan_components: [witnesses, documents, evidence, timeline, investigator_assignment]
privilege_aware: true
faragher_ellerth_compliant: true`,
    markdownBody: `# Investigation Plan Generator Skill

## Purpose
Generates a complete, legally defensible workplace investigation plan tailored to the specific complaint type, scope, severity, and organizational context. Plans satisfy Faragher/Ellerth prompt and thorough investigation requirements and establish attorney-client privilege where appropriate.

## Investigation Plan Components

### 1. Investigator Assignment Recommendation
| Complaint Type | Recommended Investigator |
|---|---|
| Sexual harassment (supervisory respondent) | External investigator or attorney-led |
| Discrimination (systemic pattern) | External investigator |
| Senior executive respondent | Outside counsel |
| Policy violation (no legal exposure) | HR Business Partner |
| Anonymous complaint (unverifiable) | HR with attorney oversight |
| Government charge filed | Outside counsel + internal HR |

**Conflict of Interest Screen**: Investigator may not have supervisory relationship with respondent, prior complaints against respondent, or personal relationship with either party.

### 2. Witness Interview Sequence
**Phase 1 — Peripheral Witnesses First**
- Witnesses to specific incidents named in complaint
- Coworkers who observed relevant behavior
- Do NOT start with complainant or respondent

**Phase 2 — Complainant**
- Conducted after peripheral witness accounts obtained
- Provides context for evaluating complainant credibility

**Phase 3 — Respondent**
- Always the last witness interviewed (after full picture developed)
- Presented with specific allegations; opportunity to respond
- Never reveal other witness statements verbatim

**Phase 4 — Rebuttal Witnesses (if needed)**
- Any witnesses identified during interviews not previously known
- Factual discrepancies requiring clarification

### 3. Document Collection Plan
- ESI preservation notice: Email, Slack, Teams, text messages (personal devices if work-related)
- Personnel files: Both complainant and respondent
- Prior complaint history: All complaints against respondent, all prior complaints by complainant
- Performance records: Recent reviews, PIPs, disciplinary records
- Attendance records: For timeline verification
- Building access logs, badge records, camera footage (if relevant)
- Calendar/meeting records for alibi or incident reconstruction
- Written communications between parties

### 4. Timeline Construction
| Milestone | Standard Timeline | P1/P2 Accelerated |
|---|---|---|
| Complaint intake complete | Day 0 | Day 0 |
| Privilege designation | Day 1 | Day 0 |
| ESI preservation notice | Day 2 | Day 1 |
| Investigation plan approved | Day 3 | Day 1 |
| Peripheral witness interviews | Days 4-7 | Days 2-3 |
| Complainant interview | Day 8 | Day 4 |
| Respondent interview | Day 10 | Day 5 |
| Evidence analysis complete | Day 14 | Day 7 |
| Report draft | Day 18 | Day 10 |
| Attorney review | Day 20 | Day 12 |
| Final report | Day 21 | Day 14 |

### 5. Investigation Plan Output Format
\`\`\`
WORKPLACE INVESTIGATION PLAN
Investigation ID: [ID]
Complaint ID: [reference]
Investigation Type: [complaint_type]
Privilege Designation: [Upjohn-protected | Attorney Work Product | Non-privileged]
Assigned Investigator: [name/role]
Estimated Completion: [date]

WITNESS LIST (in interview sequence):
1. [name] | [role] | [interview date] | [topics]
...

DOCUMENT REQUESTS:
- [document type] | [custodian] | [method] | [deadline]
...

EVIDENCE PRESERVATION:
- [system/source] | [date range] | [custodian notified]
...

KEY MILESTONES:
[milestone] | [date] | [responsible party]
...
\`\`\`

## Escalation Triggers
- Complainant identifies additional unreported victims → expand scope
- Document destruction risk identified → immediate litigation hold
- Criminal conduct discovered during planning → law enforcement referral protocol
`,
  },
  {
    organizationId: ORG,
    name: "Interview Preparation Skill",
    description: "Generates witness-specific interview outlines with legally required admonitions and key questions tailored to each witness's role, knowledge, and relationship to the parties. Produces complete interview guides for complainants, respondents, and witnesses organized by complaint type. Includes Upjohn warning language for attorney-led investigations, anti-retaliation admonitions, confidentiality instructions, and structured question sequences designed to elicit complete, truthful accounts while avoiding leading or suggestive questioning that could undermine credibility.",
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
    yamlFrontmatter: `name: Interview Preparation Skill
version: "1.0"
agent_code: LIT-AGT-003
domain: workplace-investigations
industry: legal_services
trust_tier: HIGH
context_mode: rag
interview_types: [complainant, respondent, witness, peripheral_witness]
admonitions: [upjohn_warning, anti_retaliation, confidentiality, voluntary_participation]`,
    markdownBody: `# Interview Preparation Skill

## Purpose
Produces complete, legally sound interview preparation packages for each witness in a workplace investigation, tailored to their role, the complaint type, and the investigation's privilege designation.

## Standard Admonitions (Required in Every Interview)

### 1. Anti-Retaliation Admonition
"This company prohibits retaliation against anyone who participates in this investigation. If you experience or witness any retaliation as a result of your participation, please report it immediately to HR or [designated contact]. Retaliation is a separate violation of company policy and may also violate federal and state law."

### 2. Confidentiality Instruction
"We ask that you keep the content of this interview confidential to the extent possible. However, we cannot instruct you not to speak with others, as that could interfere with your rights. [NOTE: NLRA Section 7 considerations — blanket confidentiality orders are impermissible; case-by-case assessment required]."

### 3. Voluntary Participation Notice
"This interview is conducted as part of a workplace investigation. Your participation is requested; [if attorney-led: this interview is protected by attorney-client privilege on behalf of the company]. You may have a support person present if you wish [check applicable state law and union agreement]."

### 4. Upjohn Warning (Attorney-Led Investigations Only)
"I am [name], an attorney with [firm]. I represent the Company, not you personally. This interview is protected by attorney-client privilege; however, the privilege belongs to the Company, not to you. The Company may choose to waive the privilege and disclose the contents of this interview. You may retain your own attorney at your own expense if you choose. Do you understand this, and are you willing to proceed?"

## Interview Question Framework by Witness Type

### Complainant Interview Guide
**Opening Questions — Context Setting**
1. Please describe your current position, how long you have worked here, and your reporting relationship.
2. Do you understand the purpose of this interview and why you are here today?

**Core Incident Questions**
3. Please tell me in your own words what happened, starting from the beginning.
4. When did the [incident/conduct] first occur? Can you give me specific dates?
5. Where did this occur — what location, and who else was present?
6. What exactly did [respondent] say or do? Please be as specific as possible.
7. How did you respond at the time?
8. How did this conduct affect you (work performance, physical, emotional)?

**History and Pattern Questions**
9. Has this conduct occurred before? If so, when and how many times?
10. Are you aware of this conduct happening to anyone else?
11. Did you report this to anyone before today? If so, to whom, when, and what was the response?
12. Do you have any documents, emails, texts, or other evidence related to this?

**Remedies and Desired Outcome**
13. What outcome are you seeking from this investigation?
14. Is there anything else I should know that is relevant?

### Respondent Interview Guide
**Opening Questions**
1. Please describe your current position, reporting relationships, and tenure.
2. You have been asked to meet with us as part of a workplace investigation. Do you understand that your participation is important?

**Response to Specific Allegations** (Never reveal other witnesses' statements verbatim)
3. Are you familiar with [complainant's name]? Please describe your working relationship.
4. On [specific date], were you [in location/involved in meeting/etc.]?
5. Can you describe what occurred during that interaction?
6. Did you [specific alleged conduct]? Please explain your recollection.
7. What was your understanding of [complainant's] reaction at the time?

**Context and Pattern**
8. Have there been prior complaints or concerns raised about your conduct by anyone?
9. Do you have any documentation that relates to your interactions with [complainant]?
10. Is there anything you believe is important context for understanding these allegations?

**Retaliation Admonition (Enhanced for Respondent)**
"Do you understand that any action you take that could be perceived as retaliation against the complainant or any witness — including changes to assignments, scheduling, communication, or reference for others — could result in separate disciplinary action up to and including termination?"

### Peripheral/Eyewitness Interview Guide
1. Do you know [complainant] and [respondent]? Describe your working relationships.
2. Were you present on [date/occasion referenced in complaint]? Please describe what you observed.
3. Have you ever witnessed [type of conduct alleged] between these individuals or involving [respondent]?
4. Have you heard other employees discuss this? Describe.
5. Have you made or received any prior complaints about similar conduct?
6. Is there anything else relevant to this matter that you believe I should know?

## Credibility Assessment Framework
Assess each witness using:
- **Internal consistency**: Does the account remain consistent throughout the interview?
- **Corroboration**: Does physical/documentary evidence support the account?
- **Plausibility**: Is the account consistent with normal human behavior and workplace dynamics?
- **Motive to fabricate**: Does the witness have any reason to make false allegations or denials?
- **Demeanor indicators**: Spontaneity, detail level, affect consistency (note only observable behaviors, not speculation)
- **Corroborating witnesses**: Do other witnesses corroborate or contradict key facts?
`,
  },
  {
    organizationId: ORG,
    name: "Evidence Management Skill",
    description: "Tracks collection, chain of custody, and privilege logging for all evidence gathered during workplace investigations. Manages documentary evidence (emails, texts, HR records), electronic records (ESI, access logs, video), physical evidence, and witness testimony. Ensures proper chain of custody documentation for evidence that may be used in subsequent litigation, EEOC proceedings, or arbitration. Identifies and logs attorney-client privileged documents and attorney work product. Generates evidence indexes for investigation files.",
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
    knowledgeQueries: ["chain of custody requirements", "ESI preservation obligations", "privilege log requirements", "litigation hold notices", "evidence collection standards"],
    yamlFrontmatter: `name: Evidence Management Skill
version: "1.0"
agent_code: LIT-AGT-003
domain: workplace-investigations
industry: legal_services
trust_tier: HIGH
context_mode: rag
evidence_types: [documentary, ESI, physical, testimony, video]
chain_of_custody: required
privilege_logging: true
litigation_hold_aware: true`,
    markdownBody: `# Evidence Management Skill

## Purpose
Establishes and maintains a comprehensive evidence tracking and chain-of-custody system for workplace investigation files, ensuring all evidence is properly collected, logged, preserved, and available for potential litigation or government proceedings.

## Evidence Categories

### 1. Documentary Evidence
- Written communications (letters, memos, formal notices)
- Email correspondence (company email systems, personal email if work-related)
- Text messages (company devices, personal devices if work-related)
- Chat/messaging (Slack, Teams, WhatsApp, Signal)
- Personnel records (performance reviews, disciplinary records, attendance)
- Prior complaint records (complaints against respondent, prior complaints by complainant)
- Payroll records, scheduling records
- Company policies and handbooks

### 2. Electronically Stored Information (ESI)
**Preservation Obligations (Zubulake v. UBS Warburg, 220 F.R.D. 212 (S.D.N.Y. 2003))**
- Preservation duty triggers when litigation is reasonably anticipated
- Scope: all sources reasonably likely to contain relevant information
- Litigation hold notice must be issued immediately upon preservation trigger
- Periodic re-issuance required for long-running investigations

**ESI Sources Checklist**
- Email servers (Exchange, Gmail): Sender/recipient/date/subject preservation
- Collaboration platforms (Slack, Teams): Channel messages, DMs, files
- Calendar systems: Meeting invitations, accepted/declined status, attendees
- Badge access systems: Swipe records by date/time/location
- Building security cameras: Preserve footage from relevant dates (note auto-delete timelines)
- Computer activity logs: Login/logout, file access, USB transfers
- Mobile device records: Company-issued devices
- Cloud storage: OneDrive, Google Drive, Dropbox files shared or accessed

### 3. Physical Evidence
- Written notes, logs, journals
- Physical items (if any)
- Photographs of workspace, equipment
- Preserved chain-of-custody documentation

## Chain of Custody Documentation Requirements

Each piece of evidence must be logged with:
\`\`\`
EVIDENCE LOG ENTRY
Evidence ID: [auto-generated]
Investigation ID: [reference]
Description: [specific description of item]
Type: [documentary | ESI | physical | testimony | video]
Source/Custodian: [name/system]
Collection Date: [date]
Collection Method: [who collected, how]
Received By: [investigator name]
Storage Location: [where stored/preserved]
Access Log: [everyone who accessed this evidence, date, purpose]
Privilege Status: [not_privileged | attorney_client | work_product | pending_review]
Authentication: [how item can be authenticated if needed in litigation]
\`\`\`

## Privilege Log Requirements

For any document claimed as privileged, log:
- Date of document
- Author and all recipients
- General subject matter (without revealing privileged content)
- Privilege claimed (attorney-client, work product, or both)
- Basis for privilege claim
- Whether document was created in anticipation of litigation

## Litigation Hold Notice Template Key Elements
1. Date and issuing authority
2. Description of matter triggering hold
3. Scope of records to be preserved (categories)
4. Date range of preservation
5. Prohibition on destruction, alteration, or deletion
6. Instructions for preservation (do not auto-delete, maintain backup)
7. Acknowledgment requirement
8. Point of contact for questions

## Evidence Index Format (Final Investigation File)
\`\`\`
INVESTIGATION EVIDENCE INDEX
Investigation ID: [ID]
Complaint: [description]
Investigator: [name]
Date Index Compiled: [date]

BATES/EXHIBIT NUMBERING:
[Exhibit #] | [Description] | [Date] | [Source] | [Privilege Status] | [Location]
INV-001 | Email from [respondent] to [complainant], 01/15/2024 | 2024-01-15 | Exchange server | Not privileged | Investigation file Tab A
...
\`\`\`
`,
  },
  {
    organizationId: ORG,
    name: "Legal Standard Application Skill",
    description: "Maps factual findings from workplace investigations to applicable discrimination, harassment, retaliation, and whistleblower legal frameworks. Applies burden-shifting frameworks (McDonnell Douglas, Price Waterhouse, mixed-motive analysis), hostile work environment elements, severe-or-pervasive analysis, and retaliation causation standards. Analyzes findings under Title VII, ADA, ADEA, FEHA, New York Human Rights Law, NYSHRL, ILHRA, SOX, Dodd-Frank, and other applicable statutes. Produces a legal analysis section for the investigation report.",
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
    knowledgeQueries: ["McDonnell Douglas burden shifting", "hostile work environment elements", "severe or pervasive standard", "retaliation but-for causation", "Title VII harassment framework"],
    yamlFrontmatter: `name: Legal Standard Application Skill
version: "1.0"
agent_code: LIT-AGT-003
domain: workplace-investigations
industry: legal_services
trust_tier: HIGH
context_mode: rag
frameworks: [McDonnell_Douglas, Price_Waterhouse, Faragher_Ellerth, Burlington_Northern, Gross_v_FBL]
statutes: [Title_VII, ADA_ADAAA, ADEA, SOX_806, Dodd_Frank_922, state_FELs]
confidence_threshold: 0.75`,
    markdownBody: `# Legal Standard Application Skill

## Purpose
Applies applicable legal frameworks to the factual findings from workplace investigations, producing a defensible legal analysis that maps established facts to legal elements and assesses the strength of claims and defenses.

## Discrimination Analysis Frameworks

### McDonnell Douglas Burden-Shifting (Disparate Treatment)
McDonnell Douglas Corp. v. Green, 411 U.S. 792 (1973)

**Prima Facie Case (varies by circuit):**
1. Member of protected class
2. Qualified for the position
3. Suffered adverse employment action
4. Adverse action occurred under circumstances giving rise to inference of discrimination

**Burden Shifts to Employer:** Articulate legitimate, non-discriminatory reason (LNDR)

**Burden Returns to Employee:** Demonstrate pretext
- Pretext indicators: shifting explanations, temporal proximity, similarly situated employees treated differently, statistical evidence, statements by decision-makers

### Price Waterhouse (Mixed-Motive Analysis)
Price Waterhouse v. Hopkins, 490 U.S. 228 (1989); Desert Palace, Inc. v. Costa, 539 U.S. 90 (2003)
- Employee shows protected characteristic was a motivating factor
- Employer may limit remedy by proving same decision would have been made absent discrimination
- Post-Civil Rights Act 1991: Employer cannot avoid liability, only damages/remedies

### Gross v. FBL Financial Services (Age Discrimination — ADEA)
Gross v. FBL Financial Services, 557 U.S. 167 (2009)
- ADEA requires "but-for" causation (stricter than Title VII mixed-motive)
- Employee must prove age was the "but-for" cause, not merely a motivating factor
- Mixed-motive defense not available to employer under ADEA

## Harassment Analysis Framework

### Hostile Work Environment Elements
Harris v. Forklift Systems, 510 U.S. 17 (1993); Meritor Savings Bank v. Vinson, 477 U.S. 57 (1986)

**Required Elements:**
1. Employee belongs to protected class (or engaged in protected activity for retaliation HWE)
2. Employee was subject to unwelcome harassment
3. Harassment was based on protected characteristic
4. Harassment was severe or pervasive enough to alter conditions of employment
5. Employer knew or should have known and failed to take prompt corrective action (for co-worker harassment)

**Severe or Pervasive Analysis — Totality of Circumstances:**
- Frequency of discriminatory conduct
- Severity of conduct (physical assault is severe per se)
- Whether conduct was physically threatening or humiliating vs. offensive utterance
- Whether conduct unreasonably interfered with work performance
- Effect on complainant's psychological well-being (objective AND subjective)

### Quid Pro Quo Sexual Harassment
- Supervisor conditions employment benefit on sexual favor
- Or takes adverse action based on rejection of sexual advance
- Employer strictly liable (no affirmative defense available)

### Faragher/Ellerth Affirmative Defense
Faragher v. City of Boca Raton, 524 U.S. 775 (1998); Burlington Industries v. Ellerth, 524 U.S. 742 (1998)
**Elements of Affirmative Defense (for vicarious liability for supervisor harassment WITHOUT tangible action):**
1. Employer exercised reasonable care to prevent and correct harassment (anti-harassment policy, training, reporting mechanisms)
2. Complainant unreasonably failed to use preventive or corrective opportunities

**Defense Unavailable When:**
- Supervisor took tangible employment action (termination, demotion, pay cut, transfer)
- Employer was aware of harassment and failed to act

## Retaliation Analysis

### Burlington Northern Standard
Burlington Northern & Santa Fe Railway Co. v. White, 548 U.S. 53 (2006)
- "Materially adverse action": Action that would dissuade a reasonable employee from making a charge
- Broader than Title VII discrimination's "adverse employment action"
- Context matters: written warning might not be materially adverse; exclusion from meetings may be

### But-For Causation (University of Texas v. Nassar)
University of Texas Southwestern Medical Center v. Nassar, 570 U.S. 338 (2013)
- Title VII retaliation requires "but-for" causation
- Protected activity must be the determinative reason, not merely a motivating factor
- Temporal proximity alone insufficient after significant time passage

## Whistleblower Frameworks

### SOX Section 806 (18 U.S.C. §1514A)
- Protected activity: Reporting fraud against shareholders, SEC violations, mail/wire fraud
- Employer: All publicly traded companies and their contractors/subcontractors
- Burden-shifting: Employee establishes prima facie case; burden shifts to employer to show same decision would have been made for legitimate reason; employee may rebut with showing employer's reason is pretextual

### Dodd-Frank Section 922 (15 U.S.C. §78u-6)
- Enhanced protection for SEC whistleblowers who report directly to SEC
- Anti-retaliation even if underlying claim is ultimately unsubstantiated
- Award of 10-30% of SEC sanctions over $1 million

## Legal Analysis Output Format
\`\`\`
LEGAL STANDARD APPLICATION ANALYSIS
Investigation: [ID]
Applicable Legal Framework: [statute(s)]
Factual Findings Summary: [key findings]

ELEMENT-BY-ELEMENT ANALYSIS:
Element 1: [description] → Finding: [established/not established/disputed] → Supporting Evidence: [references]
...

OVERALL ASSESSMENT:
Likelihood of sustainable legal claim: [High/Moderate/Low]
Strongest factual basis: [description]
Weaknesses in claim: [description]
Applicable affirmative defenses: [description]
Confidence level: [X%] — [flag for attorney review if <75%]

ATTORNEY REVIEW REQUIRED: [Yes/No] — [Reason]
\`\`\`
`,
  },
  {
    organizationId: ORG,
    name: "Investigation Report Drafting Skill",
    description: "Produces structured workplace investigation summary reports following Littler's investigation methodology. Reports include executive summary, complaint summary, investigation scope and methodology, witness credibility assessments, factual findings, legal analysis, conclusions, corrective action recommendations, and litigation hold status. Designed to satisfy Faragher/Ellerth prompt-and-thorough investigation documentation requirements and to be defensible in EEOC proceedings, state agency investigations, arbitration, and litigation.",
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
    knowledgeQueries: ["investigation report structure", "credibility assessment criteria", "corrective action proportionality", "Faragher Ellerth documentation requirements"],
    yamlFrontmatter: `name: Investigation Report Drafting Skill
version: "1.0"
agent_code: LIT-AGT-003
domain: workplace-investigations
industry: legal_services
trust_tier: HIGH
context_mode: rag
report_components: [executive_summary, methodology, findings, credibility, legal_analysis, conclusions, corrective_action]
privilege_header: required
attorney_review_required: true`,
    markdownBody: `# Investigation Report Drafting Skill

## Purpose
Produces a complete, legally defensible workplace investigation report that documents the investigation's thoroughness, objectivity, and legal compliance. The report serves as the primary evidence of an effective harassment prevention program under Faragher/Ellerth and satisfies EEOC guidance on prompt and thorough investigations.

## Report Structure

### Privilege Header (Attorney-Directed Investigations)
\`PRIVILEGED AND CONFIDENTIAL
ATTORNEY-CLIENT COMMUNICATION / ATTORNEY WORK PRODUCT
Prepared at the Direction of Legal Counsel in Anticipation of Litigation
DO NOT DISCLOSE WITHOUT LEGAL COUNSEL REVIEW\`

### I. Executive Summary
- Complaint date, complainant, respondent (use titles only in non-privileged versions)
- Complaint type and primary allegation
- Investigation timeline (open to close)
- Primary finding: substantiated / not substantiated / insufficient evidence
- Corrective action recommended (if any)

### II. Complaint Summary
- Complete description of allegations as reported by complainant
- Date of first incident, date of most recent incident
- Prior reporting history (prior complaints to management, HR, hotline)
- Impact described by complainant (work performance, emotional, physical)

### III. Investigation Scope & Methodology
- Privilege designation and basis
- All witnesses interviewed (names, titles, interview dates)
- All documents reviewed (by category)
- All ESI sources examined
- Any evidence preservation notices issued
- Investigator qualifications and independence statement (conflict of interest screen)
- Limitations (unavailable witnesses, unpreserved evidence, conflicting accounts)

### IV. Witness Accounts & Credibility Assessments
For each witness:
\`\`\`
Witness: [Name] | [Title] | Interview Date: [date] | Duration: [X minutes]
Account Summary: [neutral summary of what witness said]
Credibility Assessment:
  - Internal consistency: [consistent/inconsistent — details]
  - Corroboration: [corroborated by/contradicted by — evidence references]
  - Motive to fabricate: [none identified/potential motive — description]
  - Demeanor: [notable observable behaviors only — no speculation]
  - Overall credibility: [HIGH/MODERATE/LOW/INSUFFICIENT BASIS]
\`\`\`

### V. Factual Findings
Organized by allegation:
\`\`\`
Allegation #1: [Description]
  Finding: [SUBSTANTIATED | NOT SUBSTANTIATED | INSUFFICIENT EVIDENCE]
  Supporting Evidence: [evidence references]
  Contrary Evidence: [evidence references]
  Credible Witnesses Supporting: [names]
  Credible Witnesses Contradicting: [names]
  Factual Basis for Finding: [explanation]
\`\`\`

### VI. Legal Analysis
- Applicable legal framework identified
- Element-by-element analysis
- Faragher/Ellerth defense status (policy, training, reporting mechanism adequacy)
- Affirmative defense availability assessment
- Overall legal risk assessment

### VII. Conclusions
- Summary findings for each allegation
- Policy violation determination (specific policy sections)
- Overall conclusion on complaint validity

### VIII. Corrective Action Recommendations
**Proportionality Framework:**
| Severity | Prior History | Recommended Action |
|---|---|---|
| Minor | No prior | Written warning, training |
| Moderate | No prior | Final written warning, EAP referral |
| Moderate | Prior history | Suspension, demotion |
| Serious | Any | Termination or demotion with close monitoring |
| Severe (sexual assault, criminal) | Any | Immediate termination, law enforcement referral |

**Required elements of corrective action section:**
1. Specific corrective action recommended
2. Proportionality analysis (severity + precedent)
3. Corrective action for organizational failings (if supervision failed)
4. Remediation for complainant (if sustained)
5. Monitoring plan

### IX. Investigation File Certification
"This investigation was conducted in a thorough, impartial, and prompt manner consistent with the Company's obligations under [applicable law]. All available evidence was considered. Findings are based on the preponderance of credible evidence standard."

[Investigator signature and date]
[Attorney review certification if applicable]

## Drafting Standards
- Neutral, objective tone throughout — no editorializing
- Specific evidence citations for every factual finding
- No speculation beyond reasonable inference from evidence
- Protect witness identity where possible in non-privileged versions
- Clearly distinguish facts from conclusions
- Always include attorney review notation before final distribution
`,
  },
];

// ── KB SOURCES (6) ───────────────────────────────────────────────────────────
// Per spec §4.8

const KB_SOURCES = [
  {
    title: "Littler Workplace Investigation Toolkit — Templates, Checklists & Best Practices",
    displayName: "Littler Workplace Investigation Toolkit — Templates, Checklists & Best Practices",
    tags: ["investigation-toolkit", "templates", "checklists", "best-practices", "Faragher-Ellerth", "LIT-AGT-003"],
    metadata: { source: "Littler Mendelson Investigations Practice", type: "toolkit", lastUpdated: "2024-01-01" },
    content: `# Littler Workplace Investigation Toolkit — Templates, Checklists & Best Practices

## Investigation Intake Checklist

### Immediate Actions (Within 24 Hours of Complaint Receipt)
- [ ] Assign unique Complaint ID
- [ ] Identify complaint type and severity tier
- [ ] Determine privilege designation (Upjohn? Work product?)
- [ ] Determine if litigation hold is required
- [ ] Identify potential investigator (screen for conflicts of interest)
- [ ] Assess need for interim protective measures (separation of parties, administrative leave)
- [ ] Notify legal counsel if: criminal conduct, government charge, senior executive respondent, potential class claim
- [ ] Document receipt and intake in investigation log

### Conflict of Interest Screen for Investigator
- [ ] Investigator has no supervisory relationship with complainant or respondent
- [ ] Investigator has no personal relationship with complainant or respondent
- [ ] Investigator has no prior complaints from complainant or against respondent
- [ ] Investigator has no financial or other interest in outcome
- [ ] If conflict exists: assign external investigator

### Interim Protective Measures Assessment
Consider immediately:
- Physical separation of complainant and respondent (different shifts, locations)
- Temporary reassignment of respondent (not complainant — avoid constructive discharge risk)
- Administrative leave of respondent (paid leave pending investigation)
- Remote work arrangements
- Modified reporting structure
- Document basis for any interim measure taken or declined

## Witness Interview Preparation Checklist
- [ ] Review complaint record and all prior history before each interview
- [ ] Prepare witness-specific question outline (tailored to knowledge and role)
- [ ] Select appropriate admonitions (Upjohn, anti-retaliation, confidentiality, voluntary)
- [ ] Arrange private, neutral meeting space
- [ ] Confirm support person policy (check state law — CA, NY have specific rights)
- [ ] Prepare to take contemporaneous notes; consider recording only if all-party consent obtained
- [ ] Do NOT disclose other witnesses' accounts verbatim
- [ ] End each interview: "Is there anything else you believe is relevant that I haven't asked?"

## Evidence Collection Checklist
- [ ] ESI preservation notice issued to IT and all relevant custodians
- [ ] All email accounts for parties searched (specified date ranges)
- [ ] All messaging platforms checked (Slack, Teams, text)
- [ ] Calendar records for incident dates reviewed
- [ ] Badge access and building security records requested
- [ ] Surveillance footage requested and preserved (note auto-delete schedules)
- [ ] Personnel files obtained for complainant and respondent
- [ ] Prior complaint records obtained for respondent and complainant
- [ ] Payroll records reviewed for adverse action correlation
- [ ] All evidence logged in evidence index with chain of custody

## Investigation Report Quality Checklist
- [ ] Privilege header included if attorney-directed
- [ ] All allegations addressed (no unaddressed claims)
- [ ] Each finding supported by specific evidence citations
- [ ] Credibility assessed for each witness on established criteria (not subjective impressions)
- [ ] Faragher/Ellerth defense elements addressed (policy adequacy, training, reporting channels)
- [ ] Legal analysis completed (applicable statute identified, elements analyzed)
- [ ] Corrective action recommendation proportional to severity and prior history
- [ ] Report reviewed by attorney before distribution
- [ ] Complainant notified of investigation outcome (as required by policy/law)
- [ ] Investigation file archived with all supporting documents

## Investigation File Archiving Requirements
Complete investigation file must contain:
1. Original complaint record
2. Litigation hold notices (if any)
3. Investigation plan
4. Witness interview notes (all witnesses)
5. All documents reviewed (or authenticated copies)
6. Evidence index with chain of custody
7. Privilege log (if applicable)
8. Draft report(s)
9. Attorney review documentation
10. Final investigation report
11. Corrective action documentation
12. Complainant outcome notification
13. Follow-up monitoring records

Retention: Investigation files — minimum 7 years (subject to applicable state requirements)

## Corrective Action Proportionality Guide
| Offense | First Offense | Repeat Offense | Aggravated |
|---|---|---|---|
| Inappropriate comment (isolated) | Verbal counseling + training | Written warning | Written warning |
| Inappropriate comment (pattern) | Written warning + training | Final warning/suspension | Termination |
| Unwanted touching (non-sexual) | Written warning | Suspension or termination | Termination |
| Sexual harassment (non-assault) | Suspension or termination | Termination | Termination |
| Sexual assault | Termination + law enforcement | N/A | N/A |
| Discrimination (adverse action) | Investigation + remediation | Termination | Termination |
| Retaliation | Serious discipline or termination | Termination | Termination |
| Whistleblower retaliation | Termination | N/A | N/A |
`,
  },
  {
    title: "Investigation Methodology Guides by Complaint Type and Severity Level",
    displayName: "Investigation Methodology Guides by Complaint Type and Severity Level",
    tags: ["methodology", "harassment-investigation", "discrimination-investigation", "retaliation-investigation", "whistleblower-investigation", "LIT-AGT-003"],
    metadata: { source: "Littler Mendelson Investigations Practice", type: "methodology", lastUpdated: "2024-01-01" },
    content: `# Investigation Methodology Guides by Complaint Type and Severity Level

## Sexual Harassment Investigation Methodology

### Scope Determination
- Identify ALL incidents alleged (do not limit to most recent)
- Identify ALL potential victims (prior complaints against same respondent)
- Determine supervisory vs. co-worker status (different liability standards)
- Assess whether tangible employment action was taken (affects Faragher/Ellerth availability)

### Key Methodological Standards
1. **Promptness**: Investigation must begin within 24-48 hours of receipt for P1/P2 complaints; no more than 5 business days for P3
2. **Impartiality**: Investigator must be genuinely neutral; document any potential bias screen
3. **Thoroughness**: All reasonably available evidence must be obtained; all relevant witnesses interviewed
4. **Documentation**: Contemporaneous notes mandatory; evidence log maintained
5. **Confidentiality**: Share only on need-to-know basis; NLRA Section 7 considerations for blanket restrictions

### Credibility Assessment Methodology for Sexual Harassment
- "He said/She said" cases are resolved by totality of credibility assessment — NOT dismissed because of lack of corroboration alone
- Apply preponderance standard (more likely than not), not beyond reasonable doubt
- Consider: corroborating witnesses, prior history, pattern evidence, victim's prior disclosure to others, physical evidence, behavioral changes documented by others
- Complainant's delayed disclosure does not automatically undermine credibility; trauma response may explain

### Faragher/Ellerth Defense Documentation Requirements
For defense to be available:
1. Document that employer maintained a written anti-harassment policy with clear reporting mechanisms
2. Document distribution and acknowledgment of policy by respondent
3. Document anti-harassment training completed by respondent (date, content)
4. Document complaint reporting channels available and known to complainant
5. Document that investigation was prompt, thorough, and impartial
6. Document corrective action (if misconduct found) or basis for no action (if not found)

## Discrimination Investigation Methodology (Non-Harassment)

### Evidence-Gathering Focus
- **Comparator analysis**: Identify similarly situated employees of different protected class; compare treatment
- **Decision-maker statements**: Any statements by decision-maker reflecting protected-class bias (stray remarks doctrine under Wards Cove)
- **Pretext indicators**: Shifting explanations, departure from standard procedure, post-hoc rationalization, inconsistent application of policies
- **Statistical evidence**: Disparate impact analysis if pattern claim
- **Temporal proximity**: Adverse action shortly after protected activity or disclosure

### Burden-Shifting Application
Document evidence relevant to each stage:
1. Prima facie case elements (complainant's burden)
2. LNDR articulated by employer (management's stated reason — get it in writing)
3. Pretext evidence (inconsistencies, comparators, prior statements)

## Retaliation Investigation Methodology

### Special Methodological Considerations
- Establish precise timeline: Protected activity date → Adverse action date
- Burlington Northern "materially adverse" standard is BROADER than discrimination adverse action
  - Must consider context: "reassignment to nightshift" may not affect VP but devastates single parent
  - Applies to post-employment actions (negative reference, COBRA obstruction)
- Causal connection evidence: Temporal proximity, intervening events, knowledge of protected activity

### Protected Activity Verification
Confirm complainant engaged in protected activity:
- Title VII: Opposition or participation
- FLSA: Complaint about wages, hours, overtime, tip pooling
- OSHA: Safety complaint, refusal to work in unsafe conditions
- SOX/Dodd-Frank: Disclosure to supervisor, government agency, or internal compliance
- ADA/ADAAA: Request for accommodation is protected activity; so is being perceived as disabled

## Whistleblower Investigation Methodology

### Initial Triage
- Identify specific statute potentially applicable (SOX, Dodd-Frank, state whistleblower law, OSHA)
- Assess whether disclosure qualifies as "protected activity" under applicable statute
- Preserve all communications between discloser and respondent/management
- Assess government reporting obligation (mandatory notification under some statutes)

### Government Coordination Protocol
If government agency is already investigating:
- Do NOT conduct interviews that duplicate government investigation without counsel
- Issue document hold immediately across all relevant custodians
- Notify outside counsel before any witness interviews
- Assess whether voluntary cooperation or assertion of rights is appropriate strategy

## Investigation Severity Response Times
| Severity | Initial Response | Plan Approved | Complete Investigation |
|---|---|---|---|
| P1 (Imminent Threat) | Same day | Day 1 | Day 14 |
| P2 (Serious) | Within 48 hours | Day 3 | Day 21 |
| P3 (Moderate) | Within 5 days | Day 7 | Day 45 |
| P4 (Minor) | Within 14 days | Day 14 | Day 60 |
`,
  },
  {
    title: "Legal Standards Reference — Burden-Shifting, Hostile Work Environment & Retaliation Tests",
    displayName: "Legal Standards Reference — Burden-Shifting, Hostile Work Environment & Retaliation Tests",
    tags: ["legal-standards", "burden-shifting", "hostile-work-environment", "retaliation", "McDonnell-Douglas", "Title-VII", "ADA", "ADEA", "LIT-AGT-003"],
    metadata: { source: "Littler Mendelson Legal Standards Reference", type: "legal-reference", lastUpdated: "2024-01-01" },
    content: `# Legal Standards Reference — Burden-Shifting, Hostile Work Environment & Retaliation Tests

## Title VII of the Civil Rights Act of 1964 (42 U.S.C. §2000e et seq.)

### Covered Employers
- 15 or more employees for each working day in each of 20 or more calendar weeks in current or preceding calendar year
- Includes federal contractors, state and local governments (§2000e-16 for federal agencies)

### Protected Classes
Race, color, religion, sex (including pregnancy, sexual orientation per Bostock), national origin

### Disparate Treatment — McDonnell Douglas Framework
McDonnell Douglas Corp. v. Green, 411 U.S. 792 (1973)

**Employee's Prima Facie Case (Discharge):**
1. Member of protected class
2. Qualified for the position  
3. Subject to adverse employment action
4. Replaced by similarly qualified person outside protected class OR treated less favorably than similarly situated employees outside class

**Employer's Burden:** Articulate legitimate, nondiscriminatory reason (LNDR) — production burden only, not persuasion

**Employee's Pretext Burden:** Show reason is pretext:
- Pretext for discrimination (showing LNDR is false OR that discriminatory motive was real reason)
- Reeves v. Sanderson Plumbing Products, 530 U.S. 133 (2000): Disproving LNDR may permit, but not compel, inference of discrimination

### Hostile Work Environment — Sexual Harassment
**Supreme Court Framework:**
1. Meritor Savings Bank v. Vinson, 477 U.S. 57 (1986): Sexual harassment is Title VII sex discrimination
2. Harris v. Forklift Systems, 510 U.S. 17 (1993): Objective and subjective severity standard; no tangible injury required

**Elements:**
1. Unwelcome conduct
2. Based on sex (or other protected characteristic)
3. Objectively hostile or abusive — reasonable person standard
4. Subjectively perceived as hostile by complainant
5. Employer knew or should have known (co-worker) OR strict liability for supervisory harassment with tangible action

**Severe or Pervasive Analysis:**
A single act may be sufficient if severe enough (e.g., rape, sexual assault)
Pattern of less severe conduct may be pervasive even if no single act is severe

### Faragher/Ellerth Employer Affirmative Defense
Applicable ONLY when:
- Supervisor harassment
- No tangible employment action taken

**Elements of Defense:**
1. Employer exercised reasonable care to prevent and promptly correct sexually harassing behavior
2. Employee unreasonably failed to take advantage of preventive or corrective opportunities

**Practical Implementation:**
- Written anti-harassment policy with reporting mechanism
- Training for all employees and supervisors
- Prompt, thorough investigation upon report
- Appropriate corrective action when harassment found

## Americans with Disabilities Act (42 U.S.C. §12101 et seq.) — Post-ADAAA

### Disability Definition (Post-2008 ADAAA Amendments)
"Physical or mental impairment that substantially limits one or more major life activities"
ADAAA expanded definition: Congress rejected pre-ADAAA narrow Supreme Court interpretations (Toyota Motor Mfg. v. Williams)

**Major life activities include:** Caring for oneself, performing manual tasks, seeing, hearing, eating, sleeping, walking, standing, sitting, reaching, lifting, bending, speaking, breathing, learning, reading, concentrating, thinking, communicating, interacting with others, working

**Major bodily functions included:** Immune system, cell growth, digestive, bowel, bladder, neurological, brain, respiratory, circulatory, cardiovascular, endocrine, hematological, lymphatic, musculoskeletal, neurological, reproductive, special sense organs

**Mitigating Measures:** Generally disregarded; disability assessed without considering medication, prosthetics, learned behavioral modifications (except eyeglasses)

### ADA Burden-Shifting
Direct threat defense: Employer may deny accommodation or employment if employee poses direct threat to health/safety of themselves or others that cannot be eliminated by reasonable accommodation (assessed based on objective medical evidence)

## Age Discrimination in Employment Act (29 U.S.C. §§621-634)

### Coverage
Employers with 20+ employees; employees age 40 and older

### Gross v. FBL Financial — But-For Causation Required
Gross v. FBL Financial Services, Inc., 557 U.S. 167 (2009)
- Employee must prove age was "but-for" cause of adverse action
- No mixed-motive theory available under ADEA
- Significantly harder to prove than Title VII discrimination (no motivating factor theory)

### ADEA Pretext Analysis — Hazen Paper Co. v. Biggins
Hazen Paper Co. v. Biggins, 507 U.S. 604 (1993)
- Decision based on factor correlating with age (e.g., pension vesting, salary) is NOT age discrimination unless motivated by the age factor itself
- Distinguishes factors that correlate with age from age itself

## Retaliation — Title VII, ADA, ADEA

### Burlington Northern Standard for Adverse Action
Burlington Northern & Santa Fe Railway Co. v. White, 548 U.S. 53 (2006)
- Materially adverse action: Would dissuade a reasonable employee from making a charge of discrimination
- Broader than discrimination's adverse employment action
- Context-dependent: Same action may be adverse for one employee, not for another
- Post-employment actions covered (negative reference, COBRA delay)

### Causation Standard for Retaliation
University of Texas Southwestern Medical Center v. Nassar, 570 U.S. 338 (2013)
- Title VII retaliation requires "but-for" causation
- Protected activity must be determinative reason, not merely contributing factor
- Temporal proximity: strong if very close; weakens with time passage and intervening events

### Protected Activity
**Opposition Clause:** Opposing unlawful employment practice (complaint to HR, supervisor, union, government agency, attorney; refusing to participate in discrimination; threatening to file charge)
**Participation Clause:** Filing a charge, testifying, assisting, participating in EEOC proceeding (absolute protection; good-faith belief not required for participation)

## State Fair Employment Law Key Standards

### California FEHA (Gov't Code §12900 et seq.)
- Employer coverage: 5+ employees
- Additional protected classes: marital status, sexual orientation, gender identity, military/veteran status, genetic information
- Strict liability for supervisor harassment regardless of tangible action (unlike federal Faragher/Ellerth)
- FEHA investigation requirement: employer must take all reasonable steps to prevent and promptly correct harassment
- No mixed-motive limitation on recovery under FEHA (Harris v. City of Santa Monica extended)

### New York Human Rights Law (Executive Law §290 et seq.)
- Employer coverage: 4+ employees (1+ employee for sexual harassment)
- 2019 amendments: Eliminated "severe or pervasive" standard for sexual harassment — any harassing conduct above petty slights standard is unlawful
- Extended statute of limitations: 3 years for sexual harassment claims (2022 amendment)

### Illinois Human Rights Act (775 ILCS 5/)
- Employer coverage: 1+ employees (sexual harassment)
- Written sexual harassment policy required by IHRA §2-109
- Annual sexual harassment training required for all employees (Chicago additionally requires supplemental training)

## Whistleblower Protection Standards

### SOX Section 806 (18 U.S.C. §1514A) — Sarbanes-Oxley
**Protected employees:** Employees of publicly traded companies and their contractors, subcontractors, and agents
**Protected activity:** Providing information about fraud against shareholders, SEC violations, mail fraud, wire fraud, bank fraud, securities fraud to: supervisor, government/law enforcement, or congressional committee
**Burden-Shifting (AIR21 Framework):**
1. Employee must show protected activity was contributing factor in unfavorable action
2. Burden shifts to employer to show by clear and convincing evidence same action would have been taken absent protected activity

### Dodd-Frank Section 922 (15 U.S.C. §78u-6)
**Protected activity:** Reporting potential violations of securities laws to the SEC
**Enhanced protection:** Applies even if employee hasn't first reported internally
**Anti-retaliation:** Cannot be discharged, demoted, suspended, harassed, or discriminated against
**Award:** 10-30% of sanctions exceeding $1 million collected by SEC
`,
  },
  {
    title: "Interview Question Banks by Complaint Type with Legally Required Admonitions",
    displayName: "Interview Question Banks by Complaint Type with Legally Required Admonitions",
    tags: ["interview-questions", "admonitions", "Upjohn", "anti-retaliation", "sexual-harassment-questions", "discrimination-questions", "retaliation-questions", "LIT-AGT-003"],
    metadata: { source: "Littler Mendelson Interview Practice Reference", type: "interview-guide", lastUpdated: "2024-01-01" },
    content: `# Interview Question Banks by Complaint Type with Legally Required Admonitions

## Legally Required and Recommended Admonitions

### Anti-Retaliation Admonition (REQUIRED — Every Interview)
"As part of this investigation, I want to make sure you know that this company has a strict policy against retaliation. Retaliation means taking any negative action against you — or against anyone else — because they participated in this investigation, reported a concern, or assisted in any way. If you experience or witness any form of retaliation, including changes to your job assignments, schedule, workload, performance evaluations, or treatment by coworkers or management, please report it immediately to [contact]. Retaliation is a serious violation of company policy and is also illegal under federal and state law. Do you understand?"

### Confidentiality Instruction (REQUIRED — Every Interview)
"We're asking you to keep the content of this interview as confidential as possible. This means not discussing the substance of what you tell me today with your coworkers or others at work. We cannot legally require you to stay silent — you have the right to speak with others, including consulting an attorney if you choose — but we ask for your discretion to protect the integrity of the investigation and the privacy of all involved. Do you understand?"

### Voluntary Participation Notice (REQUIRED — Employee Interviews)
"Your participation in this investigation is important, and we're asking for your cooperation. While your participation is expected as part of your employment obligations, I want you to know you are entitled to have a support person or witness present with you if you'd like. [Check applicable state law — California, New York, and some union agreements provide specific representation rights.] Do you have any questions before we begin?"

### Upjohn Warning (REQUIRED for Attorney-Led Investigations)
"Before we begin, I need to tell you something important. I am [Name], an attorney with [Law Firm]. I represent the Company in connection with this investigation — I do not represent you personally. Everything you tell me is protected by attorney-client privilege, but that privilege belongs to the Company, not to you. The Company may decide, at its sole discretion, to waive that privilege and disclose what you tell me — for example, to a government agency or in litigation. If you would like to have your own attorney present, you are free to arrange that at your own expense. Do you understand what I've just told you, and are you willing to proceed with the interview today?"

## Sexual Harassment — Full Question Bank

### Opening Context
1. "Please describe your current position, how long you have been in this role, and who you report to."
2. "Do you understand why I've asked to meet with you today?"
3. "Before we begin, do you have any questions about the investigation process?"

### Core Incident Questions (Complainant)
4. "Please tell me what happened, in your own words, starting from the beginning."
5. "When did this first occur? Can you give me the specific date, day, and approximate time?"
6. "Where were you when this happened?"
7. "Who else was present or nearby when this occurred?"
8. "What did [respondent] specifically say or do? Please be as specific as you can."
9. "How did you respond at the time? What did you say or do?"
10. "Was there any physical contact? Please describe exactly what occurred."
11. "How did you feel during this incident? How did it affect you at work and outside of work?"

### History and Pattern Questions
12. "Had anything like this happened before this incident? If so, when and how many times?"
13. "Is this conduct ongoing, or has it stopped?"
14. "Do you know of anyone else who has experienced similar conduct from [respondent]?"
15. "Have you talked to anyone about this — a coworker, family member, therapist, or anyone else? If so, what did you tell them and when?"
16. "Did you report this to anyone at the company before today? If so, who did you speak with, when, and what was the response?"
17. "Are there any emails, texts, voicemails, photos, or any other documents or records related to what happened?"

### Impact and Remedies
18. "Has this situation affected your ability to do your job? Please describe."
19. "Have you had any physical or emotional effects as a result of this?"
20. "What outcome are you hoping for from this investigation?"
21. "Is there anything else you believe is relevant that I haven't asked you about?"

## Respondent Interview — Sexual Harassment

### Opening
1. "Please describe your current position, your reporting relationship, and how long you have been with the company."
2. "I'm conducting an investigation into a workplace complaint. Your perspective is important. Do you understand that your participation is expected?"
3. "[Administer anti-retaliation and Upjohn admonitions as required]"

### Core Response Questions
4. "Are you familiar with [complainant's name]? Please describe your working relationship."
5. "Have you had any direct communications with [complainant] — in person, by email, phone, or text — in the past [X months]?"
6. "On [specific date referenced in complaint], were you [at location/in meeting]?"
7. "Can you describe what occurred during [that interaction / that meeting / that time period]?"
8. "Did you [specific alleged conduct — state factually without characterizing as wrongdoing]?"
9. "What was your understanding of [complainant's] reaction or response to your behavior?"
10. "Has [complainant] ever communicated to you, directly or indirectly, that any conduct of yours was unwelcome?"
11. "Have there been any prior complaints made about your conduct toward anyone in this workplace?"
12. "Is there any reason that [complainant] might make these allegations?"
13. "Are there any documents, emails, or communications that are relevant to this matter?"
14. "Is there anything else you want me to know?"

## Discrimination (Adverse Action) — Question Bank

### Establishing the Decision-Making Process
1. "Who made the decision to [terminate/demote/not promote] [employee]?"
2. "What were the specific reasons for this decision?"
3. "When was this decision made, and what events led up to it?"
4. "Were there written policies or procedures that applied to this situation? Were they followed?"
5. "Were other employees considered for the same [termination/promotion/transfer]? Who, and why were different decisions made?"
6. "Has [employee] raised any concerns, complaints, or made any requests prior to this decision?"
7. "Were you aware of [employee's] [race/sex/age/disability/religion] at the time of this decision?"
8. "Is there anyone who can corroborate the reasons for this decision?"
9. "Are there performance records, PIPs, or disciplinary records documenting the basis for this decision?"

## Retaliation — Question Bank

### Establishing Protected Activity
1. "Did [employee] ever raise concerns about [discrimination/harassment/safety/wages] with you or others?"
2. "Were you aware that [employee] had filed an EEOC charge / made a complaint / contacted HR?"
3. "When did you first become aware of [employee's] complaint or protected activity?"

### Establishing Adverse Action and Causation
4. "What specific action was taken against [employee] and when?"
5. "What were the stated reasons for this action?"
6. "Was this action taken for any reason related to [employee's] complaint or protected activity?"
7. "Were other employees who had not made complaints treated the same way under similar circumstances?"
8. "Who else was involved in making this decision?"

## Witness/Peripheral Witness — General Question Bank
1. "How long have you known [complainant] and [respondent]? How do you interact with each of them at work?"
2. "Were you present on [date] when [alleged incident occurred]? Please describe what you observed."
3. "Have you ever witnessed [respondent] behave toward [complainant] or others in a way that seemed inappropriate?"
4. "Have you heard [respondent] make any comments about [complainant's race/sex/age/disability]?"
5. "Has [complainant] ever said anything to you about [respondent's] conduct?"
6. "Have you made any complaints yourself, or are you aware of others who have?"
7. "Is there anything else you believe is relevant to this investigation?"
`,
  },
  {
    title: "Corrective Action Precedent Database — Proportionality Guidelines by Offense Type",
    displayName: "Corrective Action Precedent Database — Proportionality Guidelines by Offense Type",
    tags: ["corrective-action", "proportionality", "discipline", "precedent", "progressive-discipline", "LIT-AGT-003"],
    metadata: { source: "Littler Mendelson HR Practice Reference", type: "precedent-database", lastUpdated: "2024-01-01" },
    content: `# Corrective Action Precedent Database — Proportionality Guidelines by Offense Type

## Legal Framework for Corrective Action

### Proportionality Principle
Corrective action must be:
1. **Proportional** to the severity of the offense and harm caused
2. **Consistent** with prior treatment of similar offenses (similarly situated employees)
3. **Documented** with specific factual findings supporting the action
4. **Legally compliant** — not in violation of anti-discrimination or anti-retaliation laws

Inconsistent application is the single most common basis for successful discrimination and retaliation claims. Before recommending corrective action, always verify:
- How was this offense treated in the past for other employees?
- Is the proposed action consistent with those precedents?
- Are there any distinguishing factors that legitimately justify different treatment?

### Discrimination Risk in Corrective Action
- Disparate treatment: Same offense punished more severely for employees of one protected class
- Pretext: Corrective action taken to cover discriminatory motive (e.g., termination of employee who reported discrimination)
- Progressive discipline bypass: Skipping steps of progressive discipline for employees of certain demographics

## Corrective Action Matrix by Offense Category

### Category 1: Minor Policy Violations

**Attendance and Punctuality**
- First offense (unexcused absence/tardy): Verbal counseling, documented
- Second offense: Written warning
- Third offense: Final written warning with attendance improvement plan
- Fourth offense: Termination

**Minor Insubordination (Isolated, Non-Threatening)**
- First offense: Verbal counseling
- Second offense: Written warning
- Aggravated (in front of customers/team): Written warning for first offense

**Dress Code / Personal Appearance**
- First offense: Verbal counseling
- Second offense: Written warning and sent home to change

### Category 2: Moderate Policy Violations

**Workplace Harassment — Non-Discriminatory (Bullying, General Hostile Behavior)**
- First offense (isolated verbal): Written warning + mandatory anti-harassment training
- Second offense or pattern: Final written warning or suspension (1-5 days)
- Third offense: Termination

**Social Media Policy Violations**
- First offense (non-confidential, non-defamatory): Written warning
- Disclosure of confidential information: Final written warning + suspension
- Defamation of company or customers: Termination

**Time Theft (Minor — Unauthorized Clock Manipulation)**
- First offense (minor amount): Written warning + repayment
- Systematic or material amount: Termination

### Category 3: Serious Policy Violations

**Sexual Harassment — Co-Worker (No Supervisory Authority)**
- First offense, isolated non-contact (inappropriate comment): Final written warning + mandatory training
- First offense, pattern or persistent: Suspension (5-15 days) + mandatory training; termination if severe pattern
- Physical touching (non-assault): Suspension or termination depending on severity and consent signals
- Severe incident (exposure, assault): Termination + law enforcement referral

**Sexual Harassment — Supervisor**
- Any sustained finding: Termination (liability exposure makes lesser discipline risk)
- Exception: Attorney consultation required before any decision to retain supervisor with warning
- Quid pro quo with tangible action: Immediate termination

**Discrimination (Sustained Finding of Discriminatory Action)**
- Biased comment (isolated, non-decision-maker context): Written warning + training
- Decision-maker who made discriminatory employment decision: Termination (regardless of seniority)
- Pattern of biased comments: Final written warning or termination depending on severity
- Senior leadership discriminatory action: Termination; notify legal counsel

**Retaliation (Sustained Finding)**
- Any sustained finding of retaliation: Serious discipline — minimum final written warning; termination for senior employees or patterns
- Note: Retaliation finding requires immediate escalation to legal counsel before any corrective action finalized

**Workplace Violence / Threats**
- Threat of violence: Immediate administrative leave pending investigation; termination if threat credible
- Physical assault: Immediate termination; law enforcement referral
- Possession of weapon: Immediate termination; law enforcement referral
- Prior restraining order violation: Immediate termination; law enforcement referral

### Category 4: Criminal or Severe Violations

**Theft / Fraud**
- Minor theft (<$500, isolated): Final written warning, repayment, termination option
- Material theft (>$500 OR systemic): Termination; law enforcement referral
- Expense fraud: Termination; repayment demand
- Payroll fraud: Termination; law enforcement referral

**Drug and Alcohol Policy**
- First positive test (non-safety-sensitive position): Final written warning + EAP referral + last-chance agreement
- Second positive test: Termination
- Safety-sensitive position, any positive test: Immediate removal from safety-sensitive duty; termination option
- Working under influence (observed): Termination

**Breach of Confidentiality / Trade Secrets**
- Inadvertent minor disclosure: Written warning + enhanced training
- Intentional disclosure to competitor: Termination + legal action
- Misappropriation of trade secrets: Termination; civil/criminal referral

## Corrective Action Documentation Requirements

Every corrective action document must include:
1. Employee name, title, department, supervisor
2. Date of corrective action meeting and who was present
3. Specific policy(ies) violated (cite policy number/section)
4. Description of conduct: specific facts, dates, witnesses
5. Prior corrective action history (for progressive discipline)
6. Corrective action imposed (specific type and duration)
7. Performance expectations going forward (clear, measurable)
8. Consequences for future violations
9. Employee acknowledgment (or notation if refused to sign)
10. Investigator/HR certification that action is consistent with similar prior cases

## Post-Corrective Action Monitoring

### Retaliation Monitoring (REQUIRED for Substantiated Discrimination/Harassment Complaints)
- Following investigation outcome notification, monitor complainant's treatment for 90 days
- Any adverse change in schedule, workload, assignments, or interpersonal dynamics to be assessed
- If complainant or witness receives negative performance review within 12 months of complaint: mandatory legal review before finalizing

### Respondent Monitoring (After Warning)
- 6-month informal check-in with respondent's peers and direct reports
- 12-month formal review of any new complaints against respondent
- If new complaint within 12 months: Expedited investigation; prior finding is aggravating factor
`,
  },
  {
    title: "EEOC Enforcement Guidance — Harassment, Retaliation & Reasonable Accommodations",
    displayName: "EEOC Enforcement Guidance — Harassment, Retaliation & Reasonable Accommodations",
    tags: ["EEOC", "enforcement-guidance", "harassment", "retaliation", "reasonable-accommodation", "EEOC-guidance-2024", "LIT-AGT-003"],
    metadata: { source: "EEOC Enforcement Guidance via Littler Mendelson Analysis", type: "regulatory-guidance", lastUpdated: "2024-04-29" },
    content: `# EEOC Enforcement Guidance — Harassment, Retaliation & Reasonable Accommodations

## EEOC Enforcement Guidance on Harassment in the Workplace (April 29, 2024)
*First comprehensive harassment guidance update since 1999 — supersedes prior guidance*

### Key Updates — April 2024 Harassment Guidance

#### 1. Expanded Protected Characteristics
The 2024 guidance confirms Title VII protection for:
- **Sexual orientation**: Following Bostock v. Clayton County, 590 U.S. 644 (2020)
- **Gender identity**: Transgender employees; misgendering and deadnaming can constitute harassment
- **Pregnancy, childbirth, and related conditions**: Including lactation, contraception, abortion
- **PUMP Act coverage**: Harassment related to expressing breastmilk

#### 2. "Severe or Pervasive" — Updated Framework
The EEOC confirms the analysis must consider:
- **Single severe incidents**: Sexual assault or rape = severe; racial slur (especially most severe slurs) may alone suffice
- **Cumulative effect**: Each individual act may be non-actionable, but pattern creates actionable HWE
- **Digital and remote harassment**: Online harassment, email harassment, group chat harassment all covered
  - Harassment via personal social media accounts that infiltrates workplace covered
  - Remote work does not insulate employer from harassment occurring via video call, email, messaging

#### 3. Virtual/Remote Work Environment
- Video call harassment (unwanted sexual conduct during video call) is actionable
- Display of harassing imagery in virtual background visible to coworkers is actionable
- Employer may be liable even when harassing conduct occurs remotely

#### 4. Non-Employee Harassment
Employer may be liable for harassment by:
- Clients or customers (if employer knew or should have known and failed to act)
- Independent contractors working at employer's facility
- Vendors

#### 5. Systemic Harassment
- Multiple victims of same respondent: Aggregate evidence supports each victim's claim
- Prior complaints about respondent are highly relevant to employer's notice and constructive knowledge

### EEOC Requirements for Effective Anti-Harassment Program

**1. Written Policy**
Must include:
- Clear prohibition on harassment based on all protected characteristics
- Clear prohibition on retaliation
- Multiple reporting channels (not limited to direct supervisor)
- Assurance that complaints will be investigated
- Confidentiality assurance (to extent possible)
- Anti-retaliation assurance

**2. Anti-Harassment Training**
EEOC recommends:
- All employees: At minimum, annual training explaining policy, reporting channels, and protections
- Supervisors and managers: Enhanced training on recognition, response obligations, employer liability
- Senior leadership: Specific training on organizational culture obligations
- Bystander training: How to respond when witnessing harassment

**3. Investigation Requirements**
EEOC requires:
- Prompt: Investigation begins immediately, completed in reasonable timeframe
- Thorough: All relevant witnesses interviewed; all relevant documents reviewed
- Impartial: Investigator genuinely neutral; no conflict of interest
- Documented: Written record of all steps taken

**4. Corrective Action**
- If harassment found: Corrective action sufficient to stop harassment and prevent recurrence
- Action proportional to severity
- Discipline of harassers consistent with past practice

## EEOC Enforcement Guidance on Retaliation (August 25, 2016)

### Protected Activities Covered
**Participation:**
- Filing an EEOC charge
- Testifying, assisting, or participating in an EEOC investigation or proceeding
- Protects against retaliation even if underlying charge is unfounded (absolute protection)

**Opposition:**
- Complaining to employer, union, government, court, or media
- Refusing to follow an order the employee reasonably believes is discriminatory
- Requesting accommodation for disability or religion
- Opposing practices affecting third parties (e.g., objecting to discrimination against a coworker)
- Good faith belief of discrimination is sufficient; does not need to be technically correct

### Causation Analysis — EEOC Position
- Temporal proximity: Strong indicator of causation when adverse action follows protected activity closely
- EEOC recommends employers document legitimate reasons for adverse actions before learning of protected activity, when possible
- Intervening events may break causal chain but must be genuinely independent

### Anti-Retaliation Best Practices (EEOC Recommended)
1. Managers who take adverse actions against employees known to have filed EEOC charges should be required to document business reasons in advance
2. HR should review all adverse actions against employees with pending EEOC charges before finalization
3. Training should specifically address retaliation prohibition and examples
4. Investigate retaliation complaints promptly and seriously, even when underlying claim was not sustained

## EEOC Enforcement Guidance on Reasonable Accommodation (October 17, 2002)
*Still current; supplemented by PWFA Final Rule (April 2024)*

### Interactive Process Requirements

**Triggering the Interactive Process:**
- Employee request for accommodation (formal or informal)
- Employer notice of employee's need (even without explicit request)
- Employee need becomes apparent
- *Note: Employer must initiate even if employee cannot specifically identify needed accommodation*

**Process Steps:**
1. Recognize the request or need
2. Engage employee in interactive dialogue — discuss functional limitations and potential accommodations
3. Consider all possible accommodations (do not jump to undue hardship without analysis)
4. Select and implement effective accommodation
5. Monitor effectiveness and adjust as needed

**What Qualifies as "Reasonable" Accommodation:**
- Modification of work schedule, part-time work, modified break schedules
- Leave of absence (even beyond FMLA entitlement, as ADA accommodation)
- Physical modifications to workspace
- Assistive technology or equipment
- Reassignment to vacant position (last resort accommodation)
- Modifications to job duties (marginal functions only — not elimination of essential functions)

**Undue Hardship Analysis (High Bar):**
- Requires individualized assessment
- Significant difficulty or expense, considering:
  - Nature and net cost (after tax credits, insurance, grants)
  - Employer's overall financial resources
  - Nature of the operation (type, composition, structure)
  - Impact on facility
- CANNOT deny reasonable accommodation without completing undue hardship analysis
- Attorney consultation required before any accommodation denial

### PWFA Final Rule (April 15, 2024) — Supplements ADA

**Covered conditions:** Pregnancy, childbirth, related medical conditions (includes current pregnancy, past pregnancy, potential/intended pregnancy, lactation, termination of pregnancy, fertility treatments, use of contraception)

**Key distinctions from ADA:**
- No need for "disability" — limitation or condition affecting pregnancy sufficient
- Employer may not require employee to take leave when another accommodation is available
- "Modest, in-frequency" limitation covered even if not "disability"

**EEOC-Enumerated PWFA Accommodations:**
- Additional restroom breaks
- Ability to sit when work is typically done standing
- Access to drinking water
- Closer parking
- Limits on lifting, bending, carrying beyond certain thresholds
- Light duty
- Modified work schedule or hours
- Remote work (if feasible)
- Leave under FMLA, state laws, or as PWFA accommodation
`,
  },
];

// ── RUNBOOKS (6) ──────────────────────────────────────────────────────────────
// Per spec §4.6

const RUNBOOKS = [
  {
    organizationId: ORG,
    name: "Imminent Threat Detection — Emergency Escalation Procedure",
    description: "Emergency escalation procedure for workplace investigations where an imminent threat of physical violence or criminal harm is identified. Covers immediate security notification, law enforcement engagement, employee protection measures, and mandatory legal counsel notification. Applies when investigation intake reveals credible threats of physical violence, possession of weapons, or ongoing criminal conduct.",
    industry: "legal_services",
    category: "emergency",
    triggerType: "automatic",
    triggerConditions: [
      { type: "event", event: "imminent_threat_identified", source: "complaint_intake", threshold: "P1_severity_flag" },
      { type: "keyword", keywords: ["weapon", "gun", "knife", "threat", "kill", "harm", "assault", "attack"], source: "complaint_text" },
    ],
    steps: [
      { id: "1", type: "action", action: "immediate_security_notification", label: "Immediately notify security department and building management of credible threat; do not delay for investigation procedures", order: 1 },
      { id: "2", type: "action", action: "employee_protection", label: "Separate parties immediately; if threat is against specific individual, remove that person to safe location or authorize immediate leave with pay", order: 2 },
      { id: "3", type: "action", action: "law_enforcement_notification", label: "Contact law enforcement (911 for imminent danger; local police for credible threats); do not self-assess whether threat is 'serious enough'", order: 3 },
      { id: "4", type: "action", action: "senior_management_notification", label: "Notify CEO/President, General Counsel, and CHRO within 1 hour of threat identification", order: 4 },
      { id: "5", type: "action", action: "legal_counsel_engagement", label: "Engage Littler attorney immediately; do not conduct any investigation interviews until attorney guidance received", order: 5 },
      { id: "6", type: "action", action: "document_preservation", label: "Preserve all communications from threat source and all witnesses to threats; issue immediate litigation hold", order: 6 },
      { id: "7", type: "approval_gate", label: "Attorney and senior management authorization required before any communication with threatening individual", approvalLevel: "confirm_before", order: 7 },
      { id: "8", type: "action", action: "threat_assessment", label: "Coordinate threat assessment with trained threat assessment professional (not HR alone) if law enforcement has not taken custody", order: 8 },
      { id: "9", type: "action", action: "victim_support", label: "Connect threatened employee with EAP, document protective measures taken, and establish monitoring plan", order: 9 },
      { id: "10", type: "action", action: "post_incident_debrief", label: "Conduct post-incident review of response effectiveness and policy gaps within 30 days", order: 10 },
    ],
    approvalConfig: { requiredApprovers: ["general_counsel", "chro", "ceo"], autoApproveAfterHours: null },
    confidentiality: "internal",
    estimatedDuration: "Immediate — ongoing",
    tags: ["imminent-threat", "workplace-violence", "emergency", "law-enforcement", "P1"],
    metadata: { jurisdiction: "all", lastReviewed: "2024-01-01", nextReview: "2025-01-01" },
    agentId: null,
  },
  {
    organizationId: ORG,
    name: "Conflict of Interest Discovery — Investigator Reassignment Procedure",
    description: "Procedure for handling discovery of investigator conflict of interest during an active workplace investigation. Covers assessment of conflict type and severity, appropriate investigator transition, evidence preservation during transition, and communication protocols that protect investigation integrity.",
    industry: "legal_services",
    category: "investigation",
    triggerType: "manual",
    triggerConditions: [
      { type: "event", event: "conflict_of_interest_identified", source: "investigation_management", threshold: "any_conflict_flag" },
    ],
    steps: [
      { id: "1", type: "action", action: "document_conflict", label: "Document the specific nature of the conflict of interest identified: relationship type, duration, and potential impact on investigation objectivity", order: 1 },
      { id: "2", type: "condition", condition: "conflict_severity_assessment", label: "Assess conflict severity: Actual conflict (direct relationship/financial interest) vs. Appearance of conflict (indirect relationship)?", trueNext: "3", falseNext: "4", order: 2 },
      { id: "3", type: "action", action: "immediate_removal", label: "For actual conflict: Remove investigator immediately; suspend all pending interviews until replacement assigned", order: 3 },
      { id: "4", type: "action", action: "legal_counsel_consultation", label: "Notify legal counsel of conflict and remediation plan; obtain attorney guidance on whether prior work product is tainted", order: 4 },
      { id: "5", type: "action", action: "evidence_preservation", label: "Preserve all investigation files, notes, and work product from current investigator in unmodified form; chain of custody documentation required", order: 5 },
      { id: "6", type: "action", action: "replacement_investigator_selection", label: "Select replacement investigator with no relationship to parties; conduct fresh conflict of interest screen", order: 6 },
      { id: "7", type: "action", action: "scope_assessment", label: "Assess whether prior interviews must be re-conducted by replacement investigator; re-interview where objectivity concerns material", order: 7 },
      { id: "8", type: "action", action: "party_notification", label: "Notify complainant and respondent of investigator change (no need to state reason); confirm investigation continues without prejudice", order: 8 },
      { id: "9", type: "action", action: "timeline_adjustment", label: "Adjust investigation timeline to accommodate transition; document impact of transition on timeline in investigation file", order: 9 },
    ],
    approvalConfig: { requiredApprovers: ["hr_director", "general_counsel"], autoApproveAfterHours: null },
    confidentiality: "internal",
    estimatedDuration: "3-5 business days",
    tags: ["conflict-of-interest", "investigator-reassignment", "investigation-integrity"],
    metadata: { jurisdiction: "all", lastReviewed: "2024-01-01", nextReview: "2025-01-01" },
    agentId: null,
  },
  {
    organizationId: ORG,
    name: "Privilege Waiver Risk — Identification and Remediation Procedure",
    description: "Procedure for identifying and mitigating inadvertent privilege waiver risks during workplace investigations. Covers Upjohn warning compliance, inadvertent disclosure situations, subject matter waiver assessment, and remediation steps to preserve attorney-client privilege and work product protection.",
    industry: "legal_services",
    category: "compliance",
    triggerType: "automatic",
    triggerConditions: [
      { type: "event", event: "potential_privilege_waiver_detected", source: "investigation_management", threshold: "privilege_flag" },
      { type: "event", event: "privileged_document_disclosed", source: "document_management", threshold: "any_external_disclosure" },
    ],
    steps: [
      { id: "1", type: "action", action: "privilege_audit", label: "Immediately audit all investigation documents for privilege designation accuracy; identify any mislabeled documents", order: 1 },
      { id: "2", type: "action", action: "disclosure_assessment", label: "Identify what was disclosed, to whom, when, and in what context; determine if disclosure was intentional or inadvertent", order: 2 },
      { id: "3", type: "action", action: "attorney_notification", label: "Notify Littler attorney IMMEDIATELY upon identifying any potential privilege waiver; do not take further action without attorney guidance", order: 3 },
      { id: "4", type: "condition", condition: "inadvertent_disclosure", label: "Was the disclosure inadvertent (unintended) or intentional?", trueNext: "5", falseNext: "7", order: 4 },
      { id: "5", type: "action", action: "claw_back_notice", label: "Send claw-back notice to recipient immediately under FRE 502(b) or applicable state rule; request return or destruction of inadvertently disclosed material", order: 5 },
      { id: "6", type: "action", action: "document_remediation", label: "Segregate all copies of disclosed document; document timeline of inadvertent disclosure for privilege log", order: 6 },
      { id: "7", type: "action", action: "subject_matter_waiver_assessment", label: "Assess scope of any waiver: Was disclosure of the document enough to constitute subject matter waiver of all related communications?", order: 7 },
      { id: "8", type: "action", action: "interview_admonition_review", label: "Review all prior Upjohn warnings for completeness; re-administer Upjohn if any interviewee was not properly warned before making privileged statements", order: 8 },
      { id: "9", type: "action", action: "privilege_log_update", label: "Update privilege log to reflect waiver assessment outcome; document remediation steps taken", order: 9 },
      { id: "10", type: "action", action: "future_prevention", label: "Implement additional privilege marking procedures; train investigation team on privilege maintenance", order: 10 },
    ],
    approvalConfig: { requiredApprovers: ["general_counsel", "outside_counsel"], autoApproveAfterHours: null },
    confidentiality: "attorney_client_privileged",
    estimatedDuration: "1-3 business days for initial assessment",
    tags: ["privilege-waiver", "attorney-client-privilege", "work-product", "Upjohn", "inadvertent-disclosure"],
    metadata: { jurisdiction: "all", lastReviewed: "2024-01-01", nextReview: "2025-01-01" },
    agentId: null,
  },
  {
    organizationId: ORG,
    name: "Complainant Retaliation Alert — Monitoring Protocol and Protective Measures",
    description: "Protocol for monitoring and responding to potential retaliation against complainants or witnesses following a workplace investigation complaint. Establishes monitoring checkpoints, protective measures, investigation procedures for retaliation claims, and documentation requirements. Addresses both direct retaliation and subtle, constructive retaliation patterns.",
    industry: "legal_services",
    category: "compliance",
    triggerType: "automatic",
    triggerConditions: [
      { type: "event", event: "retaliation_complaint_received", source: "hr_system", threshold: "any_retaliation_report" },
      { type: "event", event: "adverse_action_post_complaint", source: "hr_system", threshold: "adverse_action_within_12_months" },
    ],
    steps: [
      { id: "1", type: "action", action: "retaliation_assessment", label: "Document the specific alleged retaliatory conduct: what action, who took it, when, and the complainant's understanding of why", order: 1 },
      { id: "2", type: "action", action: "timeline_analysis", label: "Map timeline: protected activity date → alleged retaliatory action date; calculate temporal proximity; identify any intervening events", order: 2 },
      { id: "3", type: "action", action: "interim_protection", label: "Assess immediate protective measures needed: reporting line modification, work arrangement adjustment, or other protective action pending investigation", order: 3 },
      { id: "4", type: "action", action: "legal_counsel_notification", label: "Notify legal counsel immediately; retaliation claims carry significant litigation exposure and must be handled with attorney oversight", order: 4 },
      { id: "5", type: "action", action: "evidence_preservation", label: "Preserve all communications, performance records, scheduling records, and other documents relevant to alleged retaliatory action; issue litigation hold if not already in place", order: 5 },
      { id: "6", type: "action", action: "separate_investigation", label: "Assign separate investigator for retaliation investigation (not same investigator as original complaint to avoid appearance of bias)", order: 6 },
      { id: "7", type: "action", action: "decision_maker_interviews", label: "Interview decision-maker who took alleged retaliatory action; document stated business reason for action in writing", order: 7 },
      { id: "8", type: "action", action: "comparator_analysis", label: "Identify similarly situated employees who did not engage in protected activity; compare treatment to assess pretext", order: 8 },
      { id: "9", type: "action", action: "monitoring_plan", label: "Establish 90-day monitoring plan post-investigation: document any adverse changes in complainant's work situation", order: 9 },
      { id: "10", type: "action", action: "escalation_if_substantiated", label: "If retaliation substantiated: corrective action against retaliating party; notify legal counsel before any action finalized; consider EEOC notification obligations", order: 10 },
    ],
    approvalConfig: { requiredApprovers: ["hr_director", "general_counsel"], autoApproveAfterHours: null },
    confidentiality: "internal",
    estimatedDuration: "14-21 days",
    tags: ["retaliation", "complainant-protection", "monitoring", "Burlington-Northern", "protective-measures"],
    metadata: { jurisdiction: "all", lastReviewed: "2024-01-01", nextReview: "2025-01-01" },
    agentId: null,
  },
  {
    organizationId: ORG,
    name: "Parallel Government Investigation — Coordination and Document Hold Procedure",
    description: "Procedure for managing workplace investigations that occur simultaneously with EEOC charges, DOL investigations, OSHA inspections, SEC investigations, or state agency proceedings. Covers coordination obligations, document preservation requirements, witness interview protocols during parallel proceedings, and outside counsel engagement.",
    industry: "legal_services",
    category: "compliance",
    triggerType: "automatic",
    triggerConditions: [
      { type: "event", event: "government_charge_received", source: "legal_department", threshold: "any_agency_charge" },
      { type: "event", event: "eeoc_charge_filed", source: "eeoc_portal", threshold: "charge_notification" },
    ],
    steps: [
      { id: "1", type: "action", action: "immediate_litigation_hold", label: "Issue comprehensive litigation hold immediately upon receipt of government charge or investigation notice; cover all custodians and all document categories reasonably related to charge", order: 1 },
      { id: "2", type: "action", action: "outside_counsel_engagement", label: "Engage outside counsel (Littler) to represent employer in government proceeding; all communications about charge to go through outside counsel", order: 2 },
      { id: "3", type: "action", action: "internal_investigation_pause", label: "Pause any internal investigation witness interviews pending outside counsel guidance; risk of witness statements being discoverable in government proceeding", order: 3 },
      { id: "4", type: "action", action: "document_collection_assessment", label: "Assess what documents relevant to the charge already exist; do not produce to government without outside counsel review", order: 4 },
      { id: "5", type: "action", action: "government_response_coordination", label: "Coordinate response to government agency with outside counsel: Position Statement preparation for EEOC charges; response to subpoenas or document requests", order: 5 },
      { id: "6", type: "condition", condition: "concurrent_internal_investigation_appropriate", label: "Outside counsel determines whether concurrent internal investigation should proceed, be paused, or be absorbed into outside counsel's representation?", trueNext: "7", falseNext: "8", order: 6 },
      { id: "7", type: "action", action: "coordinate_investigation_strategy", label: "If internal investigation proceeds: Coordinate investigative strategy with outside counsel; ensure investigation notes and reports are appropriately privileged; avoid creating harmful documents", order: 7 },
      { id: "8", type: "action", action: "government_cooperation_strategy", label: "Determine cooperation strategy: voluntary cooperation vs. assertion of rights; outside counsel to lead all government agency communications", order: 8 },
      { id: "9", type: "action", action: "witness_preparation", label: "Coordinate with outside counsel on any witness preparation for government proceedings; Upjohn warnings required before preparation sessions", order: 9 },
      { id: "10", type: "action", action: "resolution_coordination", label: "Coordinate internal remediation actions with government proceeding resolution strategy; internal corrective action may affect settlement posture", order: 10 },
    ],
    approvalConfig: { requiredApprovers: ["general_counsel", "outside_counsel", "ceo"], autoApproveAfterHours: null },
    confidentiality: "attorney_client_privileged",
    estimatedDuration: "Variable — weeks to months",
    tags: ["EEOC", "government-investigation", "parallel-proceeding", "litigation-hold", "outside-counsel"],
    metadata: { jurisdiction: "all", lastReviewed: "2024-01-01", nextReview: "2025-01-01" },
    agentId: null,
  },
  {
    organizationId: ORG,
    name: "Investigation Integrity Breach — Evidence Tampering Detection and Escalation",
    description: "Procedure for detecting and responding to evidence tampering, chain of custody breaks, witness intimidation, or other investigation integrity breaches. Covers evidence authentication, spoliations sanction risk assessment, law enforcement engagement, and remediation of compromised investigation records.",
    industry: "legal_services",
    category: "investigation",
    triggerType: "automatic",
    triggerConditions: [
      { type: "event", event: "evidence_tampering_suspected", source: "investigation_management", threshold: "chain_of_custody_discrepancy" },
      { type: "event", event: "witness_intimidation_reported", source: "investigation_management", threshold: "any_intimidation_report" },
    ],
    steps: [
      { id: "1", type: "action", action: "immediate_documentation", label: "Document the specific integrity concern: what evidence is at issue, what changed, who had access, when discrepancy was identified", order: 1 },
      { id: "2", type: "action", action: "access_log_review", label: "Pull access logs for compromised evidence immediately; identify all individuals who accessed relevant evidence or interview notes since collection", order: 2 },
      { id: "3", type: "action", action: "legal_counsel_notification", label: "Notify legal counsel IMMEDIATELY; evidence tampering may give rise to criminal liability (obstruction of justice) and spoliation sanctions in litigation", order: 3 },
      { id: "4", type: "action", action: "evidence_authentication", label: "Engage forensic specialist to authenticate original evidence vs. current state; document any alterations with forensic precision", order: 4 },
      { id: "5", type: "action", action: "spoliation_risk_assessment", label: "Assess spoliation risk: Was evidence potentially relevant to foreseeable litigation? Was it destroyed or altered after preservation duty arose?", order: 5 },
      { id: "6", type: "condition", condition: "criminal_conduct_suspected", label: "Does evidence tampering or witness intimidation constitute potential criminal conduct (obstruction, witness tampering)?", trueNext: "7", falseNext: "8", order: 6 },
      { id: "7", type: "action", action: "law_enforcement_referral", label: "Refer potential criminal conduct to law enforcement in consultation with outside counsel; do not conduct further internal interviews of suspected tamperer", order: 7 },
      { id: "8", type: "action", action: "investigation_remediation", label: "Assess impact of integrity breach on investigation findings; determine whether any findings must be reconsidered or withdrawn", order: 8 },
      { id: "9", type: "action", action: "witness_protection_measures", label: "If witness intimidation: implement immediate protective measures for threatened witness; document intimidation as separate violation warranting separate discipline", order: 9 },
      { id: "10", type: "action", action: "integrity_report", label: "Prepare integrity breach report for legal counsel documenting all findings, chain of custody documentation, and remediation steps; maintain as privileged", order: 10 },
    ],
    approvalConfig: { requiredApprovers: ["general_counsel", "outside_counsel"], autoApproveAfterHours: null },
    confidentiality: "attorney_client_privileged",
    estimatedDuration: "Immediate — 5 business days",
    tags: ["evidence-tampering", "investigation-integrity", "spoliation", "chain-of-custody", "witness-intimidation"],
    metadata: { jurisdiction: "all", lastReviewed: "2024-01-01", nextReview: "2025-01-01" },
    agentId: null,
  },
];

// ── POLICIES (6) ─────────────────────────────────────────────────────────────
// Per spec §4.7

const POLICIES = [
  {
    organizationId: ORG,
    name: "Title VII Prompt & Thorough Investigation Compliance Policy",
    description: "Governs agent compliance with Title VII investigation obligations under the Faragher/Ellerth framework. Ensures investigations are prompt, thorough, impartial, and documented to preserve the employer's affirmative defense. Applies to all sexual harassment and discrimination investigations.",
    domain: "content_boundaries",
    status: "active",
    version: 1,
    policyJson: {
      rules: [
        { id: "titleVII-1", description: "Every sexual harassment investigation must begin within 48 hours of complaint receipt for P1/P2 complaints and within 5 business days for P3; agent must flag and escalate any delay that threatens Faragher/Ellerth defense", severity: "CRITICAL", enforcement: "hard_block" },
        { id: "titleVII-2", description: "All material witnesses must be interviewed before concluding investigation is complete; agent must not recommend 'no action' based solely on lack of corroboration without interviewing all available witnesses", severity: "CRITICAL", enforcement: "hard_block" },
        { id: "titleVII-3", description: "Complainant must receive written notice of investigation outcome; agent must include outcome notification template in all completed investigation recommendations", severity: "HIGH", enforcement: "require_confirmation" },
        { id: "titleVII-4", description: "Faragher/Ellerth affirmative defense elements must be assessed for all supervisor harassment cases; agent must document anti-harassment policy currency, training records, and complaint channel adequacy", severity: "CRITICAL", enforcement: "hard_block" },
        { id: "titleVII-5", description: "Never recommend adverse action against complainant during or within 12 months of investigation without mandatory attorney review; flag temporal proximity to complaint as automatic retaliation risk", severity: "CRITICAL", enforcement: "hard_block" },
        { id: "titleVII-6", description: "All investigation reports must cite applicable legal standard with statute and case law citation; agent must not produce findings without legal standard analysis", severity: "HIGH", enforcement: "require_confirmation" },
      ],
      confidentiality: "All investigation records are confidential. Share only on need-to-know basis. Investigation notes and reports are attorney work product when investigation is attorney-directed.",
      citation_requirements: ["42 U.S.C. §2000e et seq.", "Faragher v. City of Boca Raton, 524 U.S. 775 (1998)", "Burlington Industries v. Ellerth, 524 U.S. 742 (1998)", "EEOC Harassment Guidance 2024"],
      escalation_policy: "Any finding of sustained supervisor sexual harassment requires immediate notification of general counsel and Littler attorney before corrective action is finalized.",
    },
    tags: ["Title-VII", "Faragher-Ellerth", "harassment-investigation", "prompt-thorough", "affirmative-defense"],
    effectiveDate: new Date().toISOString(),
    scopeId: null,
    scopeType: "agent",
  },
  {
    organizationId: ORG,
    name: "ADA Interactive Process During Investigation Policy",
    description: "Ensures the agent triggers and tracks ADA interactive process obligations when investigations involve employees with disabilities or when the complaint itself relates to a failure to accommodate. Covers investigation participant accommodation needs and disability-related investigation findings.",
    domain: "content_boundaries",
    status: "active",
    version: 1,
    policyJson: {
      rules: [
        { id: "ada-inv-1", description: "If complainant or respondent discloses disability or accommodation need during investigation process, agent must flag interactive process obligation and ensure accommodation is addressed separately from investigation outcome", severity: "CRITICAL", enforcement: "hard_block" },
        { id: "ada-inv-2", description: "If complaint involves failure-to-accommodate allegation, agent must gather and analyze interactive process documentation before recommending any finding; absence of interactive process documentation is itself a significant finding", severity: "CRITICAL", enforcement: "hard_block" },
        { id: "ada-inv-3", description: "Medical information disclosed during investigation must be segregated from investigation file and stored separately under ADA §12112(d)(4) — agent must flag this requirement in every investigation involving disability disclosure", severity: "HIGH", enforcement: "require_confirmation" },
        { id: "ada-inv-4", description: "Any adverse action recommendation against an employee who disclosed disability or requested accommodation within prior 12 months requires automatic attorney review before finalization", severity: "CRITICAL", enforcement: "hard_block" },
        { id: "ada-inv-5", description: "Agent must not rely on 'regarded as' disability analysis without applying post-ADAAA expansive standard; apply Sutton v. United Airlines reversal standard", severity: "HIGH", enforcement: "require_confirmation" },
        { id: "ada-inv-6", description: "Citation required: 42 U.S.C. §12112 for all ADA discrimination analysis; 29 C.F.R. Part 1630 for regulatory framework; EEOC October 2002 guidance for interactive process", severity: "MEDIUM", enforcement: "soft_warn" },
      ],
      confidentiality: "Medical information is strictly confidential under ADA §12112(d). Maintain in separate, secured file accessible only to HR personnel with need-to-know.",
      citation_requirements: ["42 U.S.C. §12101 et seq.", "29 C.F.R. Part 1630", "EEOC Enforcement Guidance on Reasonable Accommodation (Oct. 17, 2002)", "PWFA Final Rule (Apr. 15, 2024)"],
      escalation_policy: "All accommodation denial recommendations and findings involving failure-to-accommodate require Littler attorney sign-off before finalization.",
    },
    tags: ["ADA", "ADAAA", "interactive-process", "accommodation", "disability", "investigation"],
    effectiveDate: new Date().toISOString(),
    scopeId: null,
    scopeType: "agent",
  },
  {
    organizationId: ORG,
    name: "ADEA Age Discrimination Investigation Standards Policy",
    description: "Governs the agent's application of ADEA burden-shifting standards and investigation methodology for age discrimination complaints. Applies the Gross v. FBL 'but-for' causation standard and distinguishes permissible factors that correlate with age from direct age discrimination.",
    domain: "content_boundaries",
    status: "active",
    version: 1,
    policyJson: {
      rules: [
        { id: "adea-1", description: "All ADEA discrimination analyses must apply Gross v. FBL but-for causation standard, not Title VII motivating factor standard; agent must never apply mixed-motive framework to ADEA claims", severity: "CRITICAL", enforcement: "hard_block" },
        { id: "adea-2", description: "Agent must distinguish between factors that correlate with age (salary, pension vesting, seniority) and age itself per Hazen Paper; correlation does not equal discrimination unless age is the motivating factor", severity: "HIGH", enforcement: "require_confirmation" },
        { id: "adea-3", description: "Investigation of RIF (reduction in force) affecting employees 40+ must include statistical analysis of ages of affected vs. retained employees; agent must request this data before completing RIF discrimination investigation", severity: "HIGH", enforcement: "require_confirmation" },
        { id: "adea-4", description: "Stray remarks doctrine applies to ADEA: isolated age-related comments by non-decision-makers generally insufficient; decision-maker statements receive greater weight", severity: "MEDIUM", enforcement: "soft_warn" },
        { id: "adea-5", description: "Never recommend conclusion of no age discrimination finding in RIF without verifying comparator analysis: Were retained employees younger? Were selection criteria applied consistently?", severity: "CRITICAL", enforcement: "require_confirmation" },
        { id: "adea-6", description: "Cite ADEA statute and Gross v. FBL in all age discrimination analysis; distinguish ADEA standard from Title VII in any analysis covering both statutes", severity: "MEDIUM", enforcement: "soft_warn" },
      ],
      confidentiality: "Age discrimination investigations involving RIFs should be conducted with attorney oversight from inception given ADEA OWBPA waiver requirements for group terminations.",
      citation_requirements: ["29 U.S.C. §§621-634", "Gross v. FBL Financial Services, 557 U.S. 167 (2009)", "Hazen Paper Co. v. Biggins, 507 U.S. 604 (1993)", "ADEA OWBPA 29 U.S.C. §626(f)"],
      escalation_policy: "Any RIF affecting 2+ employees age 40+ requires OWBPA severance agreement review by Littler attorney before implementation. Age discrimination findings require legal counsel notification before corrective action.",
    },
    tags: ["ADEA", "age-discrimination", "Gross-v-FBL", "but-for-causation", "RIF", "OWBPA"],
    effectiveDate: new Date().toISOString(),
    scopeId: null,
    scopeType: "agent",
  },
  {
    organizationId: ORG,
    name: "State Fair Employment Law Compliance Policy",
    description: "Ensures the agent applies state-specific fair employment law standards that are more protective than federal law for workplace investigations. Covers California FEHA, New York Human Rights Law, Illinois Human Rights Act, and other state equivalents with enhanced protections.",
    domain: "content_boundaries",
    status: "active",
    version: 1,
    policyJson: {
      rules: [
        { id: "state-fel-1", description: "For California investigations: Apply FEHA employer strict liability for supervisor harassment regardless of tangible action — Faragher/Ellerth defense does NOT apply under California law; agent must flag this distinction in every California supervisor harassment case", severity: "CRITICAL", enforcement: "hard_block" },
        { id: "state-fel-2", description: "For New York investigations: Apply 2019 NYSHRL amendment — 'severe or pervasive' standard eliminated for sexual harassment; any harassing conduct above petty slight or trivial inconvenience is actionable; 3-year statute of limitations applies", severity: "CRITICAL", enforcement: "hard_block" },
        { id: "state-fel-3", description: "For Illinois investigations: Written sexual harassment policy required under IHRA §2-109; annual training required; Chicago supplemental training required; agent must flag policy and training gaps as compliance violations", severity: "HIGH", enforcement: "require_confirmation" },
        { id: "state-fel-4", description: "State law statute of limitations may differ from federal (Title VII 180/300 days): CA 3 years, NY 3 years, IL 300 days; agent must identify applicable SOL in every investigation to assess litigation timing risk", severity: "HIGH", enforcement: "require_confirmation" },
        { id: "state-fel-5", description: "Most protective standard applies when federal and state law conflict; agent must always identify the law providing greater protection to employee and analyze under that standard", severity: "HIGH", enforcement: "require_confirmation" },
        { id: "state-fel-6", description: "Cite state FEL alongside federal statute in every investigation report covering multi-state employers or state-resident employees; do not rely solely on federal law analysis", severity: "MEDIUM", enforcement: "soft_warn" },
      ],
      confidentiality: "State law investigation requirements are jurisdiction-specific. Ensure investigation procedures comply with the most restrictive applicable state law for multi-state investigations.",
      citation_requirements: ["California FEHA Gov. Code §12900 et seq.", "New York Human Rights Law Exec. Law §290 et seq.", "Illinois Human Rights Act 775 ILCS 5/", "New Jersey LAD N.J.S.A. 10:5-1 et seq."],
      escalation_policy: "Multi-state investigations involving California or New York employees require Littler attorney familiar with state FEL to review investigation plan and findings before final report.",
    },
    tags: ["state-FEL", "FEHA", "NYSHRL", "ILHRA", "multi-state", "strict-liability"],
    effectiveDate: new Date().toISOString(),
    scopeId: null,
    scopeType: "agent",
  },
  {
    organizationId: ORG,
    name: "Whistleblower Protection Investigation Policy",
    description: "Governs the agent's handling of workplace investigations involving whistleblower allegations under SOX, Dodd-Frank, OSHA, and state whistleblower statutes. Ensures protected disclosure status is identified before investigation actions, and that whistleblower retaliation risks are flagged and escalated appropriately.",
    domain: "content_boundaries",
    status: "active",
    version: 1,
    policyJson: {
      rules: [
        { id: "wb-1", description: "Before any investigation action involving an employee who has made an internal or external compliance report, agent must assess whether the report constitutes protected activity under SOX, Dodd-Frank, OSHA, or applicable state whistleblower statute", severity: "CRITICAL", enforcement: "hard_block" },
        { id: "wb-2", description: "If employee has made an SEC disclosure (Dodd-Frank), outside counsel must be engaged immediately; SEC whistleblowers have enhanced protections and SEC involvement makes investigation strategy a legal decision, not an HR decision", severity: "CRITICAL", enforcement: "hard_block" },
        { id: "wb-3", description: "SOX Section 806 uses contributing factor causation standard (not but-for); agent must apply correct causation standard and not dismiss retaliation claims because discrimination 'could have' occurred anyway", severity: "HIGH", enforcement: "require_confirmation" },
        { id: "wb-4", description: "Never recommend taking adverse action against an employee who has made a protected whistleblower disclosure without mandatory attorney review; even clearly unrelated adverse actions within 12 months of protected disclosure carry significant litigation risk", severity: "CRITICAL", enforcement: "hard_block" },
        { id: "wb-5", description: "Investigation files involving potential Dodd-Frank whistleblowers must be treated as attorney-client privileged from inception; all notes and reports to be marked as privileged and maintained by legal counsel", severity: "HIGH", enforcement: "require_confirmation" },
        { id: "wb-6", description: "Agent must identify government reporting obligations in investigation intake: Some statutes require or trigger government notification; failure to identify mandatory reporting obligations is a separate compliance failure", severity: "HIGH", enforcement: "require_confirmation" },
      ],
      confidentiality: "Whistleblower investigation files should be maintained as attorney-client privileged from inception when there is any possibility of SEC, DOJ, or other government involvement.",
      citation_requirements: ["SOX §806 (18 U.S.C. §1514A)", "Dodd-Frank §922 (15 U.S.C. §78u-6)", "OSHA whistleblower statutes (29 U.S.C. §660(c))", "Applicable state whistleblower protection statutes"],
      escalation_policy: "Any investigation involving a potential SOX or Dodd-Frank whistleblower requires immediate Littler attorney notification and SEC regulatory counsel engagement. Do not take any adverse employment action against potential SEC whistleblower without outside counsel approval.",
    },
    tags: ["whistleblower", "SOX", "Dodd-Frank", "OSHA-retaliation", "SEC", "protected-disclosure"],
    effectiveDate: new Date().toISOString(),
    scopeId: null,
    scopeType: "agent",
  },
  {
    organizationId: ORG,
    name: "Attorney-Client Privilege and Work Product Maintenance Policy",
    description: "Governs agent maintenance of attorney-client privilege and work product protection during workplace investigations. Covers Upjohn warning requirements, privilege designation standards, inadvertent waiver prevention, subject matter waiver risk management, and clawback procedures.",
    domain: "content_boundaries",
    status: "active",
    version: 1,
    policyJson: {
      rules: [
        { id: "priv-1", description: "Upjohn warning must be administered at the start of every attorney-directed investigation interview; agent must include Upjohn warning text in every interview preparation package for attorney-led investigations and flag if not confirmed administered", severity: "CRITICAL", enforcement: "hard_block" },
        { id: "priv-2", description: "All investigation reports in attorney-directed investigations must include privilege header: 'Privileged and Confidential — Attorney-Client Communication / Attorney Work Product'; agent must flag any report draft lacking privilege header", severity: "CRITICAL", enforcement: "hard_block" },
        { id: "priv-3", description: "Agent must not include privileged analysis in non-privileged document versions; separate privileged and non-privileged versions must be maintained; commingling destroys privilege for combined document", severity: "HIGH", enforcement: "require_confirmation" },
        { id: "priv-4", description: "Any disclosure of privileged investigation document to third party (including government agency) requires legal counsel authorization; unauthorized disclosure triggers immediate attorney notification and claw-back procedure", severity: "CRITICAL", enforcement: "hard_block" },
        { id: "priv-5", description: "Selective disclosure of investigation report (providing favorable portions to government while withholding unfavorable) waives privilege over entire subject matter; agent must flag this risk whenever partial disclosure is contemplated", severity: "CRITICAL", enforcement: "hard_block" },
        { id: "priv-6", description: "Investigation notes and witness summaries created by non-attorney investigators are not automatically attorney-client privileged; attorney must direct investigation from inception and notes must reflect attorney's mental impressions for work product protection", severity: "HIGH", enforcement: "require_confirmation" },
      ],
      confidentiality: "Attorney-client privilege is the cornerstone of legally defensible investigations. Privilege must be established at investigation inception and maintained throughout. Do not share investigation findings with anyone outside legal counsel without attorney authorization.",
      citation_requirements: ["Upjohn Co. v. United States, 449 U.S. 383 (1981)", "FRE 502(b) (inadvertent disclosure clawback)", "FRE 501 (privilege generally)", "FRCP 26(b)(3) (work product)"],
      escalation_policy: "Any potential privilege waiver, including inadvertent disclosure or government demand for privileged documents, requires immediate Littler attorney notification and response coordination.",
    },
    tags: ["attorney-client-privilege", "work-product", "Upjohn", "privilege-waiver", "claw-back", "confidentiality"],
    effectiveDate: new Date().toISOString(),
    scopeId: null,
    scopeType: "agent",
  },
];

// ── GOLDEN DATASET ────────────────────────────────────────────────────────────
// Per spec §4.5

const GOLDEN_DATASET = {
  organizationId: ORG,
  name: "Workplace Investigation Agent — Golden Dataset",
  description: "Curated evaluation dataset for LIT-AGT-003. Covers complaint classification accuracy, investigation plan completeness, witness interview preparation quality, legal standard application (Title VII, ADA, ADEA, whistleblower), investigation report quality, and corrective action proportionality. Validated against Littler Mendelson investigation attorneys.",
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
    "Burlington Northern 'materially adverse' standard for retaliation analysis",
    "Gross v. FBL but-for causation for ADEA investigations",
    "Upjohn warning and privilege designation accuracy",
    "Corrective action proportionality assessment against precedent database",
    "Whistleblower (SOX/Dodd-Frank) protected activity identification",
    "Multi-state FEL identification (CA FEHA, NY SHRL, IL HRA)",
    "Evidence chain-of-custody documentation completeness",
    "Investigation report quality: thoroughness, objectivity, legal defensibility",
  ],
  benchmarkRange: { low: 87, high: 96 },
  contributors: [],
  growthHistory: [],
  status: "active",
  tags: ["workplace-investigation", "harassment", "discrimination", "retaliation", "whistleblower", "LIT-AGT-003"],
  aiGenerated: false,
  performanceBenchmarks: {
    complaintClassificationAccuracy: { target: 0.95, description: "Correct complaint type and severity tier prediction vs. experienced investigator assessment" },
    investigationPlanCompleteness: { target: 0.93, description: "AI-generated investigation plans include all elements vs. Littler attorney-created plans" },
    legalStandardAccuracy: { target: 0.95, description: "Correct identification of applicable laws and burden-shifting frameworks" },
    reportQualityScore: { target: 0.90, description: "Attorney review scores on thoroughness, objectivity, and legal defensibility (5-point scale; 4+ = pass)" },
    timelineAdherence: { target: 0.92, description: "Investigation completion within policy-mandated timeframes by severity tier" },
  },
  dataRecordCount: 500,
};

const TEST_CASES = [
  {
    name: "Sexual Harassment — Supervisor Quid Pro Quo with Tangible Action (California)",
    inputScenario: "Sarah, a sales associate at a California-based retailer with 500 employees, reports that her supervisor John conditioned her promotion to senior sales associate on her agreeing to go on a date with him. When she refused, he gave her the lowest possible performance rating, moved her to the least desirable shift, and passed her over for promotion in favor of a less qualified male colleague. She reported to HR 3 months after the shift change. California FEHA applies. Classify the complaint, assess severity, generate investigation plan, and identify applicable legal standards.",
    expectedBehavior: "Agent must: (1) classify as sexual harassment (quid pro quo) and retaliation; P2 severity (supervisor, tangible action taken); (2) identify BOTH Title VII and California FEHA — note that CA FEHA provides STRICT LIABILITY for supervisor harassment (no Faragher/Ellerth defense available unlike federal); (3) identify tangible employment actions: shift change, negative performance rating, denial of promotion = strict liability; (4) assess Burlington Northern materially adverse standard for each retaliatory action; (5) generate investigation plan with correct witness sequencing (peripheral witnesses → Sarah → John last); (6) flag that 3-month delay in reporting does not bar complaint under FEHA; (7) identify that anti-harassment policy adequacy must be assessed for damages purposes even though not a defense to liability under FEHA",
    evaluationCriteria: [
      "Classifies as quid pro quo sexual harassment AND retaliation (both must be identified)",
      "Identifies P2 severity — supervisor respondent, tangible action taken",
      "Correctly applies CA FEHA strict liability for supervisor harassment (no Faragher/Ellerth)",
      "Identifies three separate tangible employment actions (shift, performance, promotion denial)",
      "Generates witness sequence: peripheral witnesses first, Sarah second, John last",
      "Does not dismiss complaint based on delay in reporting",
      "Flags: adverse action within 12 months of protected activity = retaliation risk",
    ],
    rubricScoring: {
      dimensions: [
        { name: "Complaint Classification Accuracy", weight: 0.20, passingScore: 1.0 },
        { name: "CA FEHA vs. Federal Distinction", weight: 0.25, passingScore: 1.0 },
        { name: "Tangible Action Identification", weight: 0.20, passingScore: 1.0 },
        { name: "Investigation Plan Completeness", weight: 0.20, passingScore: 0.85 },
        { name: "Legal Standard Accuracy", weight: 0.15, passingScore: 0.90 },
      ],
    },
    category: "complianceCritical",
    difficulty: "complex",
    jurisdiction: "California",
    sourceDocuments: ["California FEHA Gov. Code §12940", "Faragher v. City of Boca Raton", "Burlington Northern v. White"],
  },
  {
    name: "ADEA Age Discrimination — RIF with Mixed-Age Workforce Reduction",
    inputScenario: "Acme Manufacturing (1,200 employees, Ohio) conducts a reduction-in-force eliminating 40 of 150 positions in its manufacturing division. Of the 40 terminated employees, 32 are over age 50; the average age of retained employees is 38; the average age of terminated employees is 53. The company states the selection was based on 'performance ratings.' Of the 32 employees over 50 who were terminated, 25 had 'meets expectations' or higher performance ratings in their last two reviews. Six employees have filed ADEA charges with the EEOC. Classify the complaint, identify applicable standards, and outline investigation approach.",
    expectedBehavior: "Agent must: (1) identify this as potential systemic ADEA age discrimination — pattern/class claim; (2) apply Gross v. FBL but-for causation standard (NOT Title VII mixed-motive); (3) identify statistical analysis as critical: 80% of terminated employees over 50 despite comprising ~25% of workforce is highly probative; (4) distinguish Hazen Paper — if performance rating criteria itself was applied discriminatorily (or if criteria were changed to target older workers), that IS age discrimination even if salary/pension wasn't the stated reason; (5) identify OWBPA compliance obligation for any severance agreements; (6) flag parallel government proceeding (EEOC charges) — require outside counsel coordination; (7) flag that disparate impact theory is available under ADEA (Smith v. City of Jackson)",
    evaluationCriteria: [
      "Identifies systemic ADEA claim requiring statistical analysis",
      "Applies Gross v. FBL but-for causation (not Title VII motivating factor)",
      "Identifies statistical disparities as prima facie evidence (80% of terminated are 50+)",
      "Distinguishes Hazen Paper (factor correlating with age) — performance criteria may itself be pretext",
      "Flags OWBPA severance agreement compliance obligation for group terminations",
      "Flags parallel EEOC proceedings — outside counsel engagement required",
      "Identifies disparate impact theory availability under Smith v. City of Jackson",
    ],
    rubricScoring: {
      dimensions: [
        { name: "Systemic Claim Identification", weight: 0.20, passingScore: 1.0 },
        { name: "ADEA Causation Standard (Gross)", weight: 0.25, passingScore: 1.0 },
        { name: "Statistical Evidence Assessment", weight: 0.20, passingScore: 0.90 },
        { name: "OWBPA Compliance Flag", weight: 0.15, passingScore: 1.0 },
        { name: "Government Investigation Protocol", weight: 0.20, passingScore: 1.0 },
      ],
    },
    category: "complianceCritical",
    difficulty: "expert",
    jurisdiction: "Ohio (federal ADEA)",
    sourceDocuments: ["29 U.S.C. §§621-634", "Gross v. FBL Financial Services", "Smith v. City of Jackson, 544 U.S. 228 (2005)", "ADEA OWBPA §626(f)"],
  },
  {
    name: "SOX Whistleblower Retaliation — Financial Fraud Report followed by Termination",
    inputScenario: "Marcus is a Senior Accountant at Acme Corp (publicly traded, NYSE). He reported to the company's internal audit committee that he believed the CFO was manipulating revenue recognition to inflate quarterly earnings in violation of GAAP and SEC Rule 10b-5. Two weeks after his internal report, Marcus was placed on a performance improvement plan (PIP) for 'communication issues' — his first ever documented performance concern in 7 years. Three months later, he was terminated for 'failure to meet PIP goals.' He has filed a SOX §806 complaint with OSHA. Classify the complaint and identify applicable legal standards and investigation approach.",
    expectedBehavior: "Agent must: (1) identify SOX §806 whistleblower retaliation claim AND potential Dodd-Frank §922 claim (if he reported to SEC — must ask); (2) identify contributing factor causation standard under SOX (NOT but-for) — protected activity need only be a contributing factor; (3) flag 14-day temporal proximity between report and PIP as highly probative; (4) assess Burlington Northern materiality: PIP and termination are clearly materially adverse; (5) flag that 7-year clean record followed by first PIP immediately after protected disclosure is classic pretext indicator; (6) require outside counsel engagement IMMEDIATELY (OSHA complaint filed = government proceeding active); (7) require document litigation hold; (8) assess whether the underlying fraud allegation requires SEC disclosure or creates D&O liability",
    evaluationCriteria: [
      "Identifies SOX §806 whistleblower retaliation (not just discrimination claim)",
      "Correctly applies contributing factor causation (not but-for under SOX)",
      "Flags 14-day temporal proximity as highly probative contributing factor evidence",
      "Identifies 7-year clean record vs. sudden PIP as pretext indicator",
      "Requires outside counsel engagement due to active OSHA complaint",
      "Issues litigation hold and document preservation instruction",
      "Assesses whether Dodd-Frank applies (SEC reporting status must be determined)",
    ],
    rubricScoring: {
      dimensions: [
        { name: "SOX Whistleblower Identification", weight: 0.20, passingScore: 1.0 },
        { name: "Contributing Factor Causation", weight: 0.25, passingScore: 1.0 },
        { name: "Temporal Proximity Analysis", weight: 0.15, passingScore: 0.90 },
        { name: "Outside Counsel Escalation", weight: 0.20, passingScore: 1.0 },
        { name: "Document Preservation Response", weight: 0.20, passingScore: 1.0 },
      ],
    },
    category: "complianceCritical",
    difficulty: "expert",
    jurisdiction: "Federal (SOX/Dodd-Frank)",
    sourceDocuments: ["SOX §806 (18 U.S.C. §1514A)", "Dodd-Frank §922 (15 U.S.C. §78u-6)", "Burlington Northern & Santa Fe Railway Co. v. White"],
  },
  {
    name: "Racially Hostile Work Environment — Co-Worker Pattern (No Supervisor Involvement)",
    inputScenario: "David, a Black engineer at a 300-person technology company in Illinois, reports that over the past 8 months he has experienced: (1) coworkers repeatedly making jokes with racial stereotypes in team meetings; (2) a racial slur written on a sticky note left at his workspace (once); (3) coworkers consistently excluding him from informal team lunches and after-work social events; (4) a coworker repeatedly referring to his work as 'impressive for someone with his background.' HR received an email from David 4 months ago about the 'uncomfortable team environment' but did not initiate any investigation. Classify and plan the investigation.",
    expectedBehavior: "Agent must: (1) classify as racial hostile work environment under Title VII AND Illinois Human Rights Act; P2 severity (pattern + Illinois written policy obligation); (2) assess cumulative severity: no single incident may be severe enough alone, but the pattern over 8 months (repetitive jokes + slur + exclusion + stereotyping) likely meets pervasive standard under totality of circumstances analysis; (3) identify the 4-month-old email as constructive notice to employer — employer's failure to investigate at that point is a separate compliance failure; (4) note that under Illinois HRA, employer must have written sexual harassment policy (and more broadly anti-harassment policy); (5) apply co-worker harassment standard: employer knew/should have known (email = knew) and failed to take prompt corrective action; (6) Note: Faragher/Ellerth does NOT apply to co-worker harassment without supervisory involvement; (7) generate investigation plan covering all incidents, all meeting attendees, lunch group exclusion witnesses",
    evaluationCriteria: [
      "Classifies as racial hostile work environment (not individual incidents) — cumulative analysis",
      "Identifies 4-month-old email as constructive/actual notice to employer",
      "Notes employer's failure to investigate upon notice is separate compliance failure",
      "Applies co-worker harassment employer liability standard (knew/should have known + failed to act)",
      "Correctly notes Faragher/Ellerth does NOT apply to co-worker harassment",
      "Identifies Illinois HRA and anti-harassment policy requirements",
      "Plans investigation covering all 8 months of cumulative incidents",
    ],
    rubricScoring: {
      dimensions: [
        { name: "Cumulative Pattern Analysis", weight: 0.25, passingScore: 1.0 },
        { name: "Notice Analysis (4-month email)", weight: 0.25, passingScore: 1.0 },
        { name: "Correct Liability Standard (co-worker)", weight: 0.20, passingScore: 1.0 },
        { name: "Illinois HRA Application", weight: 0.15, passingScore: 0.85 },
        { name: "Investigation Plan Scope", weight: 0.15, passingScore: 0.85 },
      ],
    },
    category: "complianceCritical",
    difficulty: "complex",
    jurisdiction: "Illinois",
    sourceDocuments: ["Title VII (42 U.S.C. §2000e)", "Illinois Human Rights Act 775 ILCS 5/", "Harris v. Forklift Systems"],
  },
  {
    name: "Disability Discrimination — ADA Failure to Accommodate During Investigation",
    inputScenario: "Maria is an employee with documented PTSD who is being interviewed as a witness in a workplace investigation. She has requested that her interview be conducted in a quiet space (not an open conference room), limited to 45 minutes with breaks permitted, and that she be allowed to have her therapist on the phone during the interview. The investigator is uncertain which requests to grant and how to handle medical information disclosed during the interview. Additionally, Maria disclosed that her PTSD was triggered by conduct of the respondent — a potential ADA harassment claim she never formally filed. Advise on how to proceed.",
    expectedBehavior: "Agent must: (1) identify ADA reasonable accommodation obligation for interview process: quiet space and limited duration are clearly reasonable; therapist on phone — assess appropriateness (support person generally permitted; evaluate whether therapist role is appropriate); (2) flag: SEPARATE the accommodation request from the investigation file — medical information from accommodation request must be kept in separate, confidential ADA file; (3) identify Maria's disclosure of PTSD-related harassment as a NEW complaint requiring investigation — cannot be ignored because she didn't formally file; (4) assess whether Maria's PTSD constitutes an ADA disability (yes — substantially limits major life activities including emotional regulation, concentration, sleep); (5) flag employer's obligation to initiate interactive process for her workplace accommodations beyond the interview context; (6) provide guidance on documenting the interview process accommodations without exposing medical information in the investigation file",
    evaluationCriteria: [
      "Identifies ADA accommodation obligation for investigation interview process",
      "Assesses each accommodation request: quiet space (grant), time limit/breaks (grant), therapist by phone (assess separately)",
      "Flags mandatory separation of medical information from investigation file",
      "Identifies Maria's disclosure as a new complaint requiring independent investigation",
      "Identifies ADA disability (PTSD substantially limits major life activities)",
      "Flags interactive process obligation for Maria's ongoing workplace accommodations",
      "Provides guidance on documenting accommodations without exposing medical info",
    ],
    rubricScoring: {
      dimensions: [
        { name: "ADA Accommodation During Investigation", weight: 0.25, passingScore: 1.0 },
        { name: "Medical Information Segregation", weight: 0.20, passingScore: 1.0 },
        { name: "New Complaint Identification", weight: 0.20, passingScore: 1.0 },
        { name: "Interactive Process Obligation", weight: 0.20, passingScore: 0.90 },
        { name: "Documentation Guidance", weight: 0.15, passingScore: 0.85 },
      ],
    },
    category: "edgeCases",
    difficulty: "complex",
    jurisdiction: "Federal (ADA)",
    sourceDocuments: ["ADA 42 U.S.C. §12112", "EEOC Guidance on Reasonable Accommodation (Oct. 2002)", "29 C.F.R. Part 1630"],
  },
  {
    name: "Standard Harassment Investigation — Clean Fact Pattern (Happy Path)",
    inputScenario: "Tom, a warehouse supervisor (50 employees, Texas), reports to HR that his coworker (non-supervisor) Jessica has made repeated sexual comments to him in front of others over the past 3 months, including commenting on his appearance, making sexual jokes, and once touching his shoulder without consent in a way he found uncomfortable. He wants an investigation. The employer has a written anti-harassment policy distributed at hiring and annually thereafter, anti-harassment training conducted annually, and a clear HR reporting channel. This is the first complaint against Jessica. Plan the investigation and assess applicable legal standards.",
    expectedBehavior: "Agent must: (1) classify as sexual harassment — co-worker hostile work environment (not quid pro quo, no supervisory respondent); P3 severity (moderate — pattern of 3 months, no physical assault, first complaint); (2) apply Harris v. Forklift totality of circumstances — repetitive pattern over 3 months + unwanted touching likely meets 'pervasive' standard; (3) employer liability standard: knew or should have known (HR report = actual notice) AND must take prompt corrective action; (4) note: Faragher/Ellerth is a defense to SUPERVISOR harassment only — does not apply here; (5) note employer's policy and training are relevant to prompt corrective action showing but not to liability here (no tangible action by supervisor); (6) plan investigation with correct sequence; estimate completion within 45 days; (7) recommend interim measures: assess whether separation is needed given workplace setting",
    evaluationCriteria: [
      "Classifies as co-worker sexual harassment (not quid pro quo — no supervisor)",
      "Assesses pattern as meeting pervasive standard (3-month pattern)",
      "Applies correct employer liability standard: knew + failed to act promptly",
      "Correctly notes Faragher/Ellerth does not apply to co-worker harassment",
      "Plans investigation with peripheral witnesses → Tom → Jessica sequence",
      "Recommends interim separation assessment",
      "Estimates reasonable 45-day investigation timeline for P3 complaint",
    ],
    rubricScoring: {
      dimensions: [
        { name: "Classification Accuracy", weight: 0.20, passingScore: 1.0 },
        { name: "Liability Standard Accuracy", weight: 0.25, passingScore: 1.0 },
        { name: "Pervasive Standard Analysis", weight: 0.20, passingScore: 0.85 },
        { name: "Investigation Plan Sequence", weight: 0.20, passingScore: 0.90 },
        { name: "Interim Measures", weight: 0.15, passingScore: 0.80 },
      ],
    },
    category: "happyPath",
    difficulty: "standard",
    jurisdiction: "Texas (federal Title VII)",
    sourceDocuments: ["Title VII (42 U.S.C. §2000e)", "Harris v. Forklift Systems", "Burlington Industries v. Ellerth"],
  },
];

// ── OUTCOME CONTRACT + KPIs ───────────────────────────────────────────────────

const OUTCOME = {
  organizationId: ORG,
  name: "Workplace Investigation Agent — Outcome Contract",
  description: "Business objectives, KPIs, and SLAs governing the Workplace Investigation Agent (LIT-AGT-003). Targets complaint classification accuracy, investigation plan completeness, legal standard application accuracy, investigation report quality, and litigation risk reduction for Littler Mendelson investigation clients.",
  version: "1.0",
  status: "active",
  industry: "legal_services",
  agentCode: "LIT-AGT-003",
  practiceArea: "Investigations & Discrimination",
  productMapping: "Littler Investigations Practice + onDemand",
  objectives: [
    "Achieve 95%+ complaint classification accuracy across all investigation complaint types",
    "Produce investigation plans that are rated as complete by Littler investigation attorneys in 93%+ of cases",
    "Apply correct legal standards (burden-shifting frameworks, causation standards) in 95%+ of analyses",
    "Generate investigation reports rated as legally defensible by Littler attorneys in 90%+ of cases",
    "Reduce investigation-related litigation exposure through proactive compliance identification and Faragher/Ellerth defense documentation",
  ],
  successCriteria: {
    primary: "Complaint classification accuracy ≥ 95% vs. experienced investigator ground truth",
    secondary: "Investigation plan completeness ≥ 93%; legal standard application accuracy ≥ 95%",
    guardrails: "Zero instances of recommending adverse action without attorney review; zero Faragher/Ellerth defense element omissions in supervisor harassment cases",
  },
  attributionRules: {
    agentId: null,
    attributionModel: "direct",
    lookbackWindowDays: 90,
    minimumConfidenceThreshold: 0.75,
  },
  targetMetrics: {
    complaintClassificationAccuracy: 0.95,
    investigationPlanCompleteness: 0.93,
    legalStandardApplicationAccuracy: 0.95,
    reportQualityScore: 0.90,
    timelineAdherence: 0.92,
  },
  slaConfig: {
    responseTimeMs: 8000,
    availabilityTarget: 0.995,
    escalationResponseTime: 900,
  },
  criticalPath: ["complaint_intake", "severity_assessment", "investigation_plan", "legal_standard_application", "report_drafting"],
  roiEstimate: {
    averageLitigationCostReduction: 380000,
    investigationEfficiencyGain: 65000,
    litigationRiskReduction: 0.50,
    faragherEllerth_defenseCostSavings: 120000,
  },
};

const KPIS = [
  {
    name: "Complaint Classification Accuracy",
    unit: "percent",
    baseline: 76,
    target: 95,
    targetOperator: "gte",
    weight: 0.20,
    slaThreshold: 88,
    breachLevel: "critical",
    confidence: 0.90,
    trend: "improving",
    expression: "(correct_complaint_classifications / total_complaints_classified) * 100",
    measurement: "Complaint type and severity tier prediction validated against experienced Littler investigation attorney assessment on 500+ historical investigation file dataset",
  },
  {
    name: "Investigation Plan Completeness Rate",
    unit: "percent",
    baseline: 72,
    target: 93,
    targetOperator: "gte",
    weight: 0.18,
    slaThreshold: 85,
    breachLevel: "critical",
    confidence: 0.88,
    trend: "improving",
    expression: "(complete_plans / total_plans_generated) * 100",
    measurement: "AI-generated investigation plans scored against 15-element completeness checklist by Littler investigation attorneys; 13+ elements = complete",
  },
  {
    name: "Legal Standard Application Accuracy",
    unit: "percent",
    baseline: 80,
    target: 95,
    targetOperator: "gte",
    weight: 0.20,
    slaThreshold: 88,
    breachLevel: "critical",
    confidence: 0.92,
    trend: "stable",
    expression: "(correct_legal_standard_applications / total_legal_analyses) * 100",
    measurement: "Correct identification of applicable statute, burden-shifting framework, and causation standard vs. Littler attorney ground truth on golden dataset of 500+ historical cases",
  },
  {
    name: "Investigation Report Quality Score",
    unit: "percent",
    baseline: 74,
    target: 90,
    targetOperator: "gte",
    weight: 0.18,
    slaThreshold: 82,
    breachLevel: "high",
    confidence: 0.87,
    trend: "improving",
    expression: "(reports_rated_legally_defensible / total_reports_reviewed) * 100",
    measurement: "Attorney review of draft investigation reports on 5-point scale for thoroughness, objectivity, and legal defensibility; 4+ on all three dimensions = legally defensible",
  },
  {
    name: "Faragher/Ellerth Defense Documentation Rate",
    unit: "percent",
    baseline: 65,
    target: 98,
    targetOperator: "gte",
    weight: 0.12,
    slaThreshold: 90,
    breachLevel: "critical",
    confidence: 0.93,
    trend: "improving",
    expression: "(plans_with_all_FE_elements / total_supervisor_harassment_plans) * 100",
    measurement: "Proportion of supervisor harassment investigation plans that include all Faragher/Ellerth defense elements: policy adequacy assessment, training records, complaint channel documentation",
  },
  {
    name: "Investigation Timeline Adherence Rate",
    unit: "percent",
    baseline: 68,
    target: 92,
    targetOperator: "gte",
    weight: 0.08,
    slaThreshold: 80,
    breachLevel: "medium",
    confidence: 0.85,
    trend: "improving",
    expression: "(investigations_completed_on_time / total_investigations) * 100",
    measurement: "Proportion of investigations completed within policy-mandated timeframe for their severity tier (P1: 14 days, P2: 21 days, P3: 45 days, P4: 60 days)",
  },
  {
    name: "Investigation Completion Speed",
    unit: "seconds",
    baseline: 1200,
    target: 90,
    targetOperator: "lte",
    weight: 0.04,
    slaThreshold: 300,
    breachLevel: "medium",
    confidence: 0.95,
    trend: "improving",
    expression: "avg(investigation_plan_generation_time_seconds)",
    measurement: "Time from complaint submission to delivery of complete investigation plan with witness list, document requests, and timeline",
  },
  {
    name: "Attorney Escalation Precision",
    unit: "percent",
    baseline: 72,
    target: 90,
    targetOperator: "gte",
    weight: 0.00,
    slaThreshold: 80,
    breachLevel: "low",
    confidence: 0.82,
    trend: "stable",
    expression: "(correctly_escalated / total_escalations) * 100",
    measurement: "Proportion of escalations validated by Littler investigation attorney as genuinely requiring attorney involvement (no false escalations); excludes mandatory escalations which are always correct",
  },
];

// ── SYSTEM PROMPT ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are the Littler Workplace Investigation Agent (LIT-AGT-003), a specialized AI legal guidance system for Littler Mendelson P.C., the world's largest employment and labor law firm.

Your primary purpose is to support the full lifecycle of workplace investigations into discrimination, harassment, retaliation, whistleblower complaints, and policy violations — from initial complaint classification through investigation plan generation, witness interview preparation, evidence management, legal standard application, and final report drafting.

CORE LEGAL EXPERTISE:
- Title VII of the Civil Rights Act (42 U.S.C. §2000e et seq.): All protected classes; hostile work environment (Harris v. Forklift); Faragher/Ellerth employer affirmative defense; Bostock extension to sexual orientation/gender identity
- ADA / ADAAA (42 U.S.C. §12101 et seq.): Post-ADAAA expansive disability definition; interactive process during investigations; disability discrimination investigation standards
- ADEA (29 U.S.C. §§621-634): Gross v. FBL but-for causation standard (not mixed-motive); statistical analysis for RIFs; OWBPA compliance
- Retaliation (Burlington Northern, 548 U.S. 53): Materially adverse action standard; Nassar but-for causation for Title VII retaliation; temporal proximity analysis
- Whistleblower Protection: SOX §806 (contributing factor causation); Dodd-Frank §922 (SEC whistleblowers); OSHA anti-retaliation; state whistleblower statutes
- State Fair Employment Laws: California FEHA (strict liability, no Faragher/Ellerth defense, 3-year SOL); New York SHRL (2019 amendments — no severe/pervasive standard); Illinois HRA (policy and training requirements)
- Attorney-Client Privilege: Upjohn Co. v. United States, 449 U.S. 383 (1981); work product doctrine; privilege maintenance during investigations

INVESTIGATION METHODOLOGY:
- Structured complaint intake with severity classification (P1-P4)
- Neutral, impartial investigation planning with conflict-of-interest screening
- Faragher/Ellerth defense documentation for all supervisor harassment cases
- Correct witness sequencing (peripheral → complainant → respondent)
- Chain-of-custody evidence management with litigation hold protocols
- Upjohn warning administration for attorney-directed investigations
- Preponderance of evidence standard for findings (not beyond reasonable doubt)

OPERATING CONSTRAINTS:
- You operate in SUPERVISED autonomy mode: all final corrective action recommendations, termination decisions, government agency responses, and privileged investigation reports require Littler attorney sign-off
- NEVER recommend adverse action against a complainant, witness, or whistleblower without mandatory attorney review
- NEVER produce a final investigation report without noting "REQUIRES ATTORNEY REVIEW BEFORE DISTRIBUTION"
- Always cite the specific statute, regulation, and case law supporting each legal position
- Flag confidence below 75% for attorney review
- Distinguish federal vs. state law standards; always apply the most protective standard

RESPONSE FRAMEWORK:
Structure all investigation guidance as:
1. Complaint Classification (type, severity tier, legal triggers)
2. Applicable Law Analysis (federal + state statutes)
3. Investigation Plan (witnesses, documents, timeline, investigator assignment)
4. Legal Standard Application (burden-shifting framework, elements)
5. Risk Assessment (litigation exposure, Faragher/Ellerth defense status)
6. Required Actions (with deadlines and responsible party)
7. Attorney Escalation Items (mandatory and recommended)

ESCALATION TRIGGERS (MANDATORY):
- Imminent threat of physical violence
- Government charge filed (EEOC, DOL, SEC, OSHA)
- Senior executive as respondent
- Whistleblower (SOX/Dodd-Frank) retaliation claim
- Criminal conduct identified
- Evidence tampering or investigation integrity breach
- Adverse action against complainant within 12 months of complaint
- Privilege waiver risk identified`;

const RUNTIME_TASK_PROMPT = `Analyze the workplace investigation request provided. Classify the complaint by type and severity, identify all applicable federal and state laws, generate a complete investigation plan with witness sequence and document requests, prepare interview outlines with required admonitions, apply the relevant legal standard to the factual findings, and draft investigation report findings with credibility assessments. For all supervisor harassment cases, document Faragher/Ellerth defense elements. Flag all items requiring attorney review with specific reasoning.`;

// ══════════════════════════════════════════════════════════════════════════════
// MAIN EXECUTION
// ══════════════════════════════════════════════════════════════════════════════

async function main() {
  console.log("\n════════════════════════════════════════════════════════════════════");
  console.log("  LIT-AGT-003 — Workplace Investigation Agent");
  console.log("  Creating ALL platform intelligence in DEV environment via API");
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
    description: "Comprehensive knowledge base for LIT-AGT-003 covering Littler investigation toolkit, methodology guides by complaint type, legal standards reference (burden-shifting, hostile work environment, retaliation), interview question banks, corrective action precedent database, and EEOC enforcement guidance on harassment, retaliation, and accommodations.",
    industry: "legal_services",
    type: "policy",
    status: "active",
    accessLevel: "private",
    tags: ["workplace-investigation", "harassment", "discrimination", "retaliation", "whistleblower", "Title-VII", "ADA", "ADEA", "EEOC", "LIT-AGT-003"],
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
      log(`KB Source: ${src.displayName.slice(0, 70)}`);
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
    description: "Supports the full lifecycle of workplace investigations into discrimination, harassment, retaliation, whistleblower complaints, and policy violations. Maps to Littler's Investigations and Discrimination & Harassment practice areas. The agent structures investigation plans, manages witness interview preparation, tracks evidence collection, analyzes findings against legal standards (Title VII, ADA, ADEA, SOX, Dodd-Frank, state FELs), and drafts investigation reports. Ensures investigations are thorough, timely, well-documented, and legally defensible.",
    owner: "Littler Mendelson P.C.",
    status: "active",
    riskTier: "HIGH",
    autonomyMode: "supervised",
    currentVersion: "1.0.0",
    environment: "staging",
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
      escalationTriggers: [
        "imminent_physical_threat",
        "government_charge_filed",
        "senior_executive_respondent",
        "whistleblower_SOX_Dodd_Frank",
        "criminal_conduct_identified",
        "evidence_tampering",
        "adverse_action_against_complainant",
        "privilege_waiver_risk",
      ],
      prompt: RUNTIME_TASK_PROMPT,
    },
    blueprintJson: {
      version: "1.0",
      agentCode: "LIT-AGT-003",
      practiceArea: "Investigations & Discrimination",
      productMapping: "Littler Investigations Practice + onDemand",
      nodes: [
        { id: "intake", type: "trigger", label: "Receive Complaint (Charge, Hotline, Manager Escalation)" },
        { id: "classification", type: "skill", label: "Complaint Intake & Classification", skillRef: "complaint-intake-classification-skill" },
        { id: "severity_gate", type: "decision", label: "P1/P2 Emergency Protocol?" },
        { id: "emergency_runbook", type: "runbook", label: "Imminent Threat / Emergency Escalation" },
        { id: "investigation_plan", type: "skill", label: "Investigation Plan Generation", skillRef: "investigation-plan-generator-skill" },
        { id: "interview_prep", type: "skill", label: "Witness Interview Preparation", skillRef: "interview-preparation-skill" },
        { id: "evidence_tracking", type: "skill", label: "Evidence Management & Chain of Custody", skillRef: "evidence-management-skill" },
        { id: "legal_analysis", type: "skill", label: "Legal Standard Application", skillRef: "legal-standard-application-skill" },
        { id: "confidence_gate", type: "decision", label: "Confidence ≥ 75%?" },
        { id: "attorney_review", type: "human_in_loop", label: "Route to Littler Investigation Attorney" },
        { id: "report_drafting", type: "skill", label: "Investigation Report Drafting", skillRef: "investigation-report-drafting-skill" },
        { id: "output", type: "output", label: "Deliver Investigation Report & Corrective Action Recommendations" },
      ],
      edges: [
        { from: "intake", to: "classification" },
        { from: "classification", to: "severity_gate" },
        { from: "severity_gate", to: "emergency_runbook", condition: "P1_or_P2_emergency" },
        { from: "severity_gate", to: "investigation_plan", condition: "standard_investigation" },
        { from: "emergency_runbook", to: "investigation_plan", condition: "stabilized" },
        { from: "investigation_plan", to: "interview_prep" },
        { from: "interview_prep", to: "evidence_tracking" },
        { from: "evidence_tracking", to: "legal_analysis" },
        { from: "legal_analysis", to: "confidence_gate" },
        { from: "confidence_gate", to: "attorney_review", condition: "confidence < 75% OR high_risk_flag" },
        { from: "confidence_gate", to: "report_drafting", condition: "confidence >= 75% AND no_high_risk" },
        { from: "attorney_review", to: "report_drafting" },
        { from: "report_drafting", to: "output" },
      ],
    },
    toolsConfig: {
      allowedTools: ["retrieve_kb", "classify_complaint", "score_severity", "generate_investigation_plan", "sequence_witnesses", "generate_interview_guide", "track_evidence", "generate_privilege_log", "lookup_legal_standards", "apply_burden_shifting", "generate_document", "score_confidence", "calculate_deadline"],
      mcpServers: ["littler-investigations-mcp", "legal-standards-mcp", "case-law-mcp", "document-gen-mcp", "document-management-mcp"],
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
  const dsRes = await post("/api/golden-datasets", {
    ...GOLDEN_DATASET,
    organizationId: ORG,
  });
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
      log(`Test Case: ${tc.name.slice(0, 70)}`);
    } catch (e) {
      warn(`Test Case (non-fatal): ${tc.name.slice(0, 50)} — ${e.message.slice(0, 80)}`);
    }
  }

  // ── STEP 9: EVAL SUITE ────────────────────────────────────────────────────────
  step("9", "11", "Creating evaluation suite…");
  const evalRes = await post("/api/evals", {
    organizationId: ORG,
    agentId: ids.agentId,
    goldenDatasetId: ids.goldenDatasetId,
    skillId: null,
    name: "LIT-AGT-003 Workplace Investigation Evaluation Suite",
    type: "accuracy",
    thresholdConfig: {
      complaintClassificationAccuracy: 0.95,
      investigationPlanCompleteness: 0.93,
      legalStandardApplicationAccuracy: 0.95,
      reportQualityScore: 0.90,
      faragherEllerthDocumentationRate: 0.98,
      overallPassRate: 0.92,
    },
    scorerConfig: {
      primary: "attorney_ground_truth",
      secondary: "rule_based_checklist_verification",
      rubric: "rubricScoring",
      citationCheck: true,
      jurisdictionAccuracyCheck: true,
      privilegeComplianceCheck: true,
    },
    coverageTags: ["Title-VII", "ADA", "ADEA", "retaliation", "whistleblower", "Faragher-Ellerth", "McDonnell-Douglas", "Burlington-Northern", "Gross-v-FBL", "SOX-806", "Dodd-Frank", "state-FEL"],
    environmentThresholds: {
      staging: { minPassRate: 0.87 },
      production: { minPassRate: 0.92 },
    },
    schedule: { frequency: "weekly", dayOfWeek: "Wednesday", time: "06:00 UTC" },
    industry: "legal_services",
    ontologyTags: ["Complaint Classification", "Investigation Plan", "Legal Standard Application", "Investigation Report", "Evidence Management", "Corrective Action"],
  });
  ids.evalSuiteId = evalRes.id;
  log(`Eval Suite → ${evalRes.id}`);

  // ── STEP 10: OUTCOME CONTRACT + 8 KPIs ───────────────────────────────────────
  step("10", "11", "Creating outcome contract + 8 KPIs…");
  const outcomePayload = {
    ...OUTCOME,
    organizationId: ORG,
    attributionRules: { ...OUTCOME.attributionRules, agentId: ids.agentId },
  };
  const outcomeRes = await post("/api/outcomes/with-kpis", {
    outcome: outcomePayload,
    kpis: KPIS,
  });
  ids.outcomeId = outcomeRes.outcome?.id || outcomeRes.id;
  log(`Outcome Contract → ${ids.outcomeId}`);

  // ── STEP 11: LINK ALL INTELLIGENCE TO AGENT ───────────────────────────────────
  step("11", "11", "Linking all platform intelligence to agent…");

  // Link KB to agent
  try {
    await post(`/api/agents/${ids.agentId}/knowledge-bases`, {
      knowledgeBaseId: ids.kbId,
      priority: 1,
      retrievalConfig: {
        topK: 12,
        scoreThreshold: 0.70,
        rerankEnabled: true,
        jurisdictionFiltering: true,
        citationMode: "full",
      },
    });
    log("Knowledge base linked to agent");
  } catch (e) {
    warn(`KB link (non-fatal): ${e.message.slice(0, 80)}`);
  }

  // Link outcome + eval suite to agent
  await patch(`/api/agents/${ids.agentId}`, {
    outcomeId: ids.outcomeId,
    evalBindings: [ids.evalSuiteId],
  });
  log("Outcome contract linked to agent");
  log("Eval suite linked to agent");

  // Set ontology tags — fetch dynamically
  try {
    const allConcepts = await get("/api/ontology-concepts/all");
    const byId = new Map(allConcepts.map(c => [c.id, c]));
    const mkTag = (id) => {
      const c = byId.get(id);
      if (!c) throw new Error(`Concept not found: ${id}`);
      return { conceptId: c.id, label: c.label, category: c.category };
    };
    const ontologyTags = [
      mkTag("legal_services-advisory-services-compliance-auditing"),
      mkTag("legal_services-advisory-services-risk-assessment"),
      mkTag("legal_services-litigation-services-legal-research"),
      mkTag("legal_services-advisory-services-legal-opinion"),
      mkTag("legal_services-legal-technology-process-knowledge-management"),
    ];
    await patch(`/api/agents/${ids.agentId}`, { ontologyTags });
    log(`Ontology tags set: ${ontologyTags.map(t => t.label).join(", ")}`);
  } catch (e) {
    warn(`Ontology tags (non-fatal): ${e.message.slice(0, 80)}`);
  }

  // ── SAVE IDs ──────────────────────────────────────────────────────────────────
  writeFileSync("scripts/lit-agt-003-dev-ids.json", JSON.stringify(ids, null, 2));

  // ── SUMMARY ───────────────────────────────────────────────────────────────────
  console.log("\n════════════════════════════════════════════════════════════════════");
  console.log("  ✅  LIT-AGT-003 CREATION — COMPLETE");
  console.log("════════════════════════════════════════════════════════════════════");
  console.log(`\n  Agent:           ${ids.agentId}`);
  console.log(`  Knowledge Base:  ${ids.kbId} (${ids.kbSourceIds?.length || 0} sources)`);
  console.log(`  Skills (6):      ${ids.skillIds.join("\n                   ")}`);
  console.log(`  Policies (6):    ${ids.policyIds.join("\n                   ")}`);
  console.log(`  Runbooks (6):    ${ids.runbookIds.join("\n                   ")}`);
  console.log(`  Golden Dataset:  ${ids.goldenDatasetId} (${ids.testCaseIds?.length || 0} test cases)`);
  console.log(`  Eval Suite:      ${ids.evalSuiteId}`);
  console.log(`  Outcome:         ${ids.outcomeId}`);
  console.log(`\n  Dev IDs saved → scripts/lit-agt-003-dev-ids.json\n`);
}

main().catch(err => {
  console.error(`\n❌  Creation failed: ${err.message}`);
  process.exit(1);
});
