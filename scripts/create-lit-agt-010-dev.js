#!/usr/bin/env node
/**
 * LIT-AGT-010 — Leave & Accommodation Management Agent
 * Creates ALL platform intelligence in the DEV environment via API only.
 *
 * Lessons applied from previous agents:
 *  - preloadedSkills: stored as [{skillId, loadOrder}] objects (NOT plain UUID strings)
 *  - KB sources: created with `title` field (not `name`) then PATCH-renamed
 *  - Policy PATCH: uses /api/policies/:id (not /api/governance/policies/:id)
 *  - ontologyTags: stored as [{conceptId, label, category}] objects
 *  - runbooks/policies: agentId/scopeId set immediately after agent creation via PATCH
 *  - All via API only — no direct DB access
 *
 * Usage:  node scripts/create-lit-agt-010-dev.js
 * Saves:  scripts/lit-agt-010-dev-ids.json
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
    yamlFrontmatter: `name: Multi-Law Leave Eligibility Skill
version: "1.0"
agent_code: LIT-AGT-010
domain: leave-accommodation
industry: legal_services
trust_tier: HIGH
context_mode: rag
jurisdiction_coverage: "50 states + DC + 500+ municipalities"
federal_laws: [FMLA, ADA, PWFA, USERRA, PUMP_Act]
state_pfl_programs: [CA_PFL, NY_PFL, WA_PFML, NJ_FLI, CO_FAMLI, MA_PFML, CT_PFML, OR_PFML, RI_TDI, DC_PFML, MD_FAMLI, DE_PFML, MN_PFML, IL_PLSAA]
required_kb: Leave & Accommodation Management Knowledge Base
citation_required: true
confidence_scoring: true`,
    markdownBody: `# Multi-Law Leave Eligibility Skill

## Purpose
Evaluates an employee's eligibility for all applicable leave entitlements simultaneously based on their work location, employer size, reason for leave, and tenure/hours worked. Produces a complete leave entitlement matrix.

## Federal Leave Laws Covered
### FMLA (29 C.F.R. Part 825)
- **Employer coverage**: 50+ employees within 75 miles for 20+ workweeks
- **Employee eligibility**: 12 months tenure + 1,250 hours in prior 12 months + 50-employee worksite/75-mile radius
- **Entitlement**: 12 weeks unpaid (26 weeks for military caregiver)
- **Qualifying reasons**: Serious health condition (employee or family), birth/adoption/foster placement, qualifying military exigency
- **Job protection**: Restoration to same or equivalent position
- **COBRA continuation**: Health insurance maintained during leave

### ADA / ADAAA Accommodation Leave
- **Employer coverage**: 15+ employees
- **Disability definition**: Physical or mental impairment that substantially limits a major life activity
- **Leave as accommodation**: Required unless undue hardship
- **No fixed duration**: Case-by-case determination
- **Interactive process**: Mandatory engagement to identify reasonable accommodations

### Pregnancy Workers Fairness Act (PWFA) — Effective June 27, 2023
- **Employer coverage**: 15+ employees
- **Coverage**: Limitation or condition related to, affected by, or arising out of pregnancy, childbirth, or related medical condition
- **Entitlement**: Reasonable accommodation including temporary suspension of essential functions
- **Known limitations**: Applies even if not a "disability" under ADA

## State Paid Family Leave Programs
### California PFL (UI Code §3300+)
- Duration: 8 weeks (2023+)
- Benefit: 60-70% of wages, up to SDI cap
- Waiting period: None (eliminated 2020)
- Qualifying reasons: Bonding (within 1 year), serious illness of family member
- Concurrent with FMLA/CFRA: Mandatory for bonding, employer's choice for family care

### New York PFL (NY WCL Article 9-A)
- Duration: 12 weeks
- Benefit: 67% of NY state average weekly wage (2024: max $1,151.16/week)
- Employee eligibility: 26 consecutive weeks (full-time) or 175 days (part-time)
- Qualifying reasons: Bonding, family care, qualifying military exigency

### Washington PFML (RCW 50A)
- Duration: 12 weeks family or medical; 16 weeks combination; 18 weeks pregnancy complication
- Benefit: 90% of wages up to 50% SAWW; 50% for wages above
- Employer coverage: 1+ employees
- Qualifying reasons: Bonding, family care, employee serious health condition, military

### New Jersey FLI + TDI
- FLI: 12 weeks family leave at 85% wages (max $1,055/week 2024)
- TDI: 26 weeks disability at 85% wages
- Concurrent considerations: FLI and FMLA do NOT run concurrently for family leave

### Colorado FAMLI
- Duration: 12 weeks (16 for pregnancy complications)
- Benefit: 90% up to 50% SAWW; 50% above
- Effective: January 1, 2024 (benefits)

### Massachusetts PFML
- Medical leave: 20 weeks; Family leave: 12 weeks; Combined: 26 weeks
- Benefit: 80% wages up to 50% SAWW + 50% above, max $1,149.90/week (2024)

## Activation Logic
1. Identify all employee work locations (for multi-state employees)
2. Confirm employer size/coverage under each applicable law
3. Calculate employee eligibility criteria (tenure, hours, worksite)
4. Determine qualifying reason (maps to applicable leave types)
5. Apply each law's eligibility test; record result (eligible/ineligible/conditional)
6. Identify concurrent running obligations and stacking order
7. Output prioritized entitlement matrix with durations, benefits, job protection
8. Flag cases where concurrent running is mandatory vs. employer-discretionary

## Output Format
\`\`\`
EMPLOYEE LEAVE ELIGIBILITY MATRIX
Employee ID / Work Location(s): [ID] / [State(s)]
Leave Reason: [reason]
Employer Size: [X employees within 75 miles / total]

LAW               ELIGIBLE  DURATION    PAID/UNPAID  JOB-PROTECTED  CONCURRENT W/ FMLA
FMLA              [Y/N]     12 weeks    Unpaid       Yes            N/A
CFRA (CA)         [Y/N]     12 weeks    Unpaid       Yes            Separate (post-FMLA)
CA PFL            [Y/N]     8 weeks     60-70%       No             Runs with CFRA
NY PFL            [Y/N]     12 weeks    67%          Yes            Runs with FMLA
...
\`\`\`

## Escalation Triggers
- Overlapping entitlements with conflicting running rules
- Employer coverage disputes (49-employee borderline)
- Eligibility disputes requiring HR records verification
- Military caregiver leave (26-week entitlement)
- Any leave reason with potential ADA overlap
`,
  },
  {
    organizationId: ORG,
    name: "Concurrent Leave Tracker Skill",
    description: "Manages the simultaneous running of multiple leave entitlements under different laws. Tracks mandatory concurrent running (e.g., FMLA + CFRA run separately post-2021 Baby Blues Amendment), employer-discretionary concurrent running designations, leave stacking implications, and real-time balance deductions across all applicable entitlements. Produces accurate leave balance statements and identifies exhaustion dates for each entitlement.",
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
    yamlFrontmatter: `name: Concurrent Leave Tracker Skill
version: "1.0"
agent_code: LIT-AGT-010
domain: leave-accommodation
industry: legal_services
trust_tier: HIGH
context_mode: rag
tracking_granularity: [daily, intermittent_hours, intermittent_days]
concurrent_rules: [mandatory_concurrent, discretionary_concurrent, sequential, separate_entitlement]`,
    markdownBody: `# Concurrent Leave Tracker Skill

## Purpose
Accurately tracks simultaneous leave usage across multiple overlapping entitlements, applying the correct concurrent running rules for each combination of laws and ensuring real-time balance accuracy.

## Concurrent Running Rules

### Mandatory Concurrent Running
- FMLA + most state FMLA equivalents: Run concurrently (employer must designate)
- FMLA + CA SDI (for employee's own condition): Concurrent
- FMLA + state PFL (employer bonding leave designation): Employer may require
- Exception — CFRA Post-Baby Blues (2021): FMLA and CFRA for baby bonding now run SEPARATELY
  - Employee may take 12 weeks FMLA + additional 12 weeks CFRA = 24 weeks total for bonding

### Employer-Discretionary Concurrent Running
- FMLA + accrued PTO/vacation: Employer may require substitution (29 C.F.R. §825.207)
- Short-term disability + FMLA: Employer may require concurrent running
- Employers must state policy in advance; cannot retroactively change

### Sequential Leave (Separate Entitlements)
- Post-FMLA exhaustion: ADA accommodation leave begins
- Post-FMLA: Some state leave laws provide additional entitlement
- Military leave + FMLA: USERRA leave and FMLA entitlement are separate

## Balance Tracking Calculations

### FMLA 12-Month Period Options
1. **Calendar year**: Simple but allows double-stacking at year-end
2. **Fixed 12-month year**: Set fiscal/anniversary year
3. **12-month forward rolling**: 12 weeks from first day of current leave
4. **Rolling backward year** (most employer-protective): 12 weeks minus leave taken in prior 52 weeks

### Intermittent Leave Conversions
- Hours to weeks: Total hours ÷ normal weekly hours
- Partial days: Must track to nearest hour (29 C.F.R. §825.205)
- Part-time employees: FMLA entitlement = proportional weeks × normal weekly hours

## Output Format
\`\`\`
CONCURRENT LEAVE BALANCE STATEMENT
Employee: [ID] | As of: [Date]
12-Month Method: [Calendar/Fixed/Rolling Forward/Rolling Backward]

ENTITLEMENT          TOTAL    USED     REMAINING  EXPIRES     STATUS
FMLA (Federal)       480 hrs  96 hrs   384 hrs    [Date]      Active
CFRA (CA)            480 hrs  0 hrs    480 hrs    [Date]      Not Started
CA PDL (Pregnancy)   [Weeks]  [Used]   [Remain]   [Date]      [Status]
NY PFL               480 hrs  0 hrs    480 hrs    [Date]      Not Applicable
SDI (CA)             [Days]   [Used]   [Remain]   [Date]      Running
Accrued PTO          [Hours]  [Used]   [Remain]   N/A         Substituted

CONCURRENT RUNNING: FMLA running concurrent with CA SDI
SEPARATE ENTITLEMENTS: CFRA for bonding runs AFTER FMLA exhaustion (Baby Blues)
PROJECTED EXHAUSTION: FMLA exhausted [Date]; CFRA available [Date]
\`\`\`
`,
  },
  {
    organizationId: ORG,
    name: "Interactive Process Skill",
    description: "Guides the ADA/PWFA interactive accommodation process from initial request through final determination. Identifies all potential reasonable accommodations for a given disability and job function, assesses undue hardship factors, documents the process with legally sufficient records, and generates required correspondence. Covers the full spectrum from simple accommodations to complex restructuring scenarios.",
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
    knowledgeQueries: ["ADA reasonable accommodation", "undue hardship analysis", "interactive process requirements", "PWFA accommodations", "accommodation ideas by job function"],
    yamlFrontmatter: `name: Interactive Process Skill
version: "1.0"
agent_code: LIT-AGT-010
domain: leave-accommodation
industry: legal_services
trust_tier: HIGH
context_mode: rag
laws_covered: [ADA, ADAAA, PWFA, state_FEHAs]
state_coverage: "50 states + DC (state FEHA equivalents)"
undue_hardship_factors: [cost, financial_resources, type_of_operation, impact_on_operations]`,
    markdownBody: `# Interactive Process Skill

## Purpose
Guides employers through the legally mandated ADA interactive accommodation process, from initial disability disclosure through final accommodation determination, ensuring good-faith engagement and legally sufficient documentation.

## Legal Framework

### ADA Interactive Process Requirements
- No bright-line duty to initiate, but best practice triggers: employee requests accommodation, employee's disability is obvious, employer has notice of difficulty due to disability
- Both parties must engage in good faith (US Airways v. Barnett; EEOC Enforcement Guidance)
- Employer cannot refuse all accommodations without exploring alternatives
- Process is ongoing — employer must re-engage when circumstances change

### PWFA Interactive Process (42 U.S.C. §2000gg-1)
- Applies to pregnancy, childbirth, or related medical conditions (even if not ADA "disability")
- Employer must provide accommodation unless undue hardship
- May not require employee to take leave if another accommodation is possible
- Includes: frequent breaks, modified work schedule, light duty, PPE modifications, remote work

### State FEHA Interactive Process (California Gov't Code §12940(n))
- Affirmative duty to engage in interactive process when employer knows/has reason to know of disability
- Failure to engage is an independent cause of action (even if accommodation ultimately granted)
- Applies to 5+ employees (broader than federal ADA)

## Accommodation Identification Framework

### Category 1: Schedule/Time Modifications
- Intermittent leave or reduced work schedule
- Modified start/end times, shift changes
- Longer or more frequent breaks
- Part-time work on temporary or permanent basis

### Category 2: Physical Workspace Modifications
- Ergonomic furniture, equipment, or tools
- Accessibility modifications (ramps, door handles, parking)
- Move workstation closer to restroom/elevator
- Private workspace for medical needs

### Category 3: Job Duty Modifications
- Temporary suspension of marginal functions
- Reassignment of specific tasks to other employees
- Light duty (if available and employer-maintained program)
- Job restructuring (only marginal functions, not essential)

### Category 4: Technology/Equipment
- Assistive technology, screen readers, voice recognition
- Modified computer hardware or software
- Telephone/communication equipment modifications

### Category 5: Remote Work
- Full or partial remote work arrangement
- Qualification standard: Can essential functions be performed remotely?
- Post-COVID: More difficult to establish undue hardship for remote-capable roles

### Category 6: Leave
- Additional leave beyond FMLA/state entitlements
- Unpaid leave as last resort (Nunes v. Wal-Mart, 164 F.3d 1243)
- Definite return date required; indefinite leave typically not required

## Undue Hardship Analysis (42 U.S.C. §12111(10))
Factors assessed:
1. **Nature and cost** of accommodation
2. **Overall financial resources** of the facility/employer
3. **Type of operation**: structure, workforce composition
4. **Impact on operations**: effect on other employees, customer service
5. **Industry norms**: whether accommodation is commonly provided in the industry

## Output Format
\`\`\`
INTERACTIVE PROCESS ANALYSIS
Employee: [ID] | Disability/Limitation: [description] | Job Title: [title]
Essential Functions: [list from job description]
Marginal Functions: [list]

ACCOMMODATIONS EXPLORED:
1. [Accommodation] — Feasible? [Y/N/Conditional] — Hardship Risk: [Low/Med/High]
2. ...
RECOMMENDED ACCOMMODATION: [Selected option with rationale]
UNDUE HARDSHIP: [None identified / Hardship factors: ...]
REQUIRED DOCUMENTATION: [Checklist]
NEXT STEPS: [Action items with responsible party and timeline]
\`\`\`
`,
  },
  {
    organizationId: ORG,
    name: "Leave Notice Generator Skill",
    description: "Produces all legally required notices and correspondence for leave administration across FMLA, state leave laws, and ADA accommodations. Generates FMLA designation notices, WH-380 series medical certification requests, state-specific rights notices, ADA correspondence, and denial letters. Ensures all notices include the required content and are issued within statutory deadlines.",
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
    yamlFrontmatter: `name: Leave Notice Generator Skill
version: "1.0"
agent_code: LIT-AGT-010
domain: leave-accommodation
industry: legal_services
trust_tier: HIGH
context_mode: rag
notice_types: [FMLA_eligibility, FMLA_designation, WH-380-E, WH-380-F, state_rights, ADA_correspondence, denial_letters]
deadline_tracking: true
required_content_validation: true`,
    markdownBody: `# Leave Notice Generator Skill

## Purpose
Generates all legally required notices with correct content, within statutory deadlines, for every applicable leave law governing a specific leave request.

## FMLA Notice Requirements (29 C.F.R. §825.300)

### Notice of Eligibility and Rights (WH-381)
- **Trigger**: Within 5 business days of learning of need for FMLA-qualifying leave
- **Required content**: Eligibility determination, reasons if ineligible, employee's rights and responsibilities
- **Medical certification deadline**: 15 calendar days to return (must specify in notice)

### Designation Notice (WH-382)
- **Trigger**: Within 5 business days of having sufficient information to designate
- **Required content**: Whether leave is designated FMLA-protected, amount counted against entitlement, fitness-for-duty requirements at return
- **Retroactive designation**: Permitted if no prejudice to employee (Ragsdale v. Wolverine World Wide)

### Medical Certification Request (WH-380-E / WH-380-F)
- **WH-380-E**: Employee's own serious health condition
- **WH-380-F**: Family member's serious health condition
- **Return deadline**: 15 calendar days (unless not practicable due to circumstances beyond employee's control)
- **Second opinion**: Employer may require at its expense (different HCP, may not use regularly contracted)
- **Third opinion (binding)**: Jointly selected provider; employer pays

## State Notice Requirements by Jurisdiction

### California
- CFRA: Same 5-day designation deadline as FMLA
- CA SDI: Notice to employee of SDI benefit rights
- PDL (Pregnancy Disability Leave): Employer notice of PDL rights on learning of pregnancy
- CPSL (CA Paid Sick Leave): Employer notice with hire documents and annually

### New York
- NY PFL: Written notice of PFL rights to all employees on hire and each January
- Employee must provide 30-day advance notice when foreseeable, or ASAP
- NY Paid Sick Leave: Notice of rights at hire

### Washington
- WA PFML: Written notice at hire, upon learning of need for leave
- 30-day advance notice when foreseeable; ASAP when not

## ADA/PWFA Correspondence
### Acknowledgment of Request
- Within 5 business days of written request
- Confirms receipt, describes interactive process steps

### Request for Medical Documentation
- May request only information needed to verify disability and functional limitations
- Must explain what information is needed and why
- Standard forms preferred (avoid requesting full medical records)

### Final Accommodation Decision Letter
- Grant letter: describes accommodation, implementation timeline, any trial period
- Denial letter: must explain why requested accommodation creates undue hardship AND all alternative accommodations considered and rejected with reasons
- Never use "undue hardship" label without attorney review

## Output
All notices generated as structured documents with:
- Employee name, ID, dates
- Statutory citations
- Required notice content (validated against checklist)
- Deadline compliance confirmation
- Signature blocks
`,
  },
  {
    organizationId: ORG,
    name: "Certification Management Skill",
    description: "Tracks medical certifications supporting leave requests throughout their lifecycle: initial certification, second/third opinions, recertification timelines, insufficient certification cure periods, and fitness-for-duty certifications at return. Manages certification expiration, required content verification, and healthcare provider communication templates. Ensures employer rights are exercised appropriately without interfering with protected leave.",
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
    knowledgeQueries: ["FMLA medical certification requirements", "certification recertification rules", "second opinion rights", "fitness-for-duty certification"],
    yamlFrontmatter: `name: Certification Management Skill
version: "1.0"
agent_code: LIT-AGT-010
domain: leave-accommodation
industry: legal_services
trust_tier: HIGH
context_mode: rag
certification_types: [initial_FMLA, second_opinion, third_opinion, recertification, fitness_for_duty, ADA_medical_inquiry]
deadline_tracking: true`,
    markdownBody: `# Certification Management Skill

## Purpose
Manages the complete lifecycle of medical certifications supporting leave requests, tracking deadlines, sufficiency determinations, and recertification obligations while protecting both employer rights and employee leave protections.

## Initial Certification (29 C.F.R. §825.305-310)

### Request Requirements
- May request only when leave has FMLA-qualifying reason
- Must provide employee 15 calendar days to return completed certification
- Must state consequences of failure to return timely
- May NOT contact healthcare provider directly (HIPAA; only HR or leave administrator may contact)

### Certification Sufficiency Checklist
Required content on WH-380-E:
- [ ] Date condition commenced
- [ ] Probable duration
- [ ] Is condition a serious health condition? (hospitalization, continuing treatment, etc.)
- [ ] For intermittent: frequency and duration of episodes
- [ ] For own serious health condition: unable to perform essential job functions?
- [ ] HCP signature, title, and contact information

### Cure Period for Incomplete Certifications
- Must notify employee in writing of deficiencies within 5 business days
- Employee has 7 calendar days to cure (unless not practicable)
- If not cured: employer may deny FMLA designation

## Second Opinion (29 C.F.R. §825.307)
- Employer may require at employer's expense
- Employer designates HCP (cannot be regularly used by employer/carrier)
- If first and second opinions conflict: employer may require third (binding)
- Third opinion: jointly selected; employer pays; binding on both parties
- May not delay leave pending second opinion

## Recertification (29 C.F.R. §825.308)
### When Employer May Request
- No more often than every 30 days and only in connection with an absence
- Exception: duration of incapacity <30 days stated on certification
- Can always request if employee requests extension
- Can always request if circumstances change significantly
- Can request annually even for permanent/long-term conditions

### Changed Circumstances Triggering Recertification
- Significant change in duration or frequency of absences
- Pattern of absence on Fridays/Mondays or before/after holidays
- Receipt of information casting doubt on stated reason for absence

## Fitness-for-Duty Certification (29 C.F.R. §825.312)
- Employer may require before returning from continuous leave
- Must state requirement in Designation Notice
- Must provide list of essential job functions for HCP to address if requested
- May require addressing ability to perform essential functions
- Cannot delay return while awaiting FRD certification if employee presents it

## ADA Medical Inquiries (29 C.F.R. §1630.14)
- Initial: May ask applicants for post-offer medical exam (non-disability specific)
- During employment: Must be job-related and consistent with business necessity
- Prohibited: Asking about nature/severity of disability
- Permitted: Asking about functional limitations affecting job performance
`,
  },
  {
    organizationId: ORG,
    name: "Leave Analytics Skill",
    description: "Analyzes leave usage patterns across a workforce to identify compliance risks, potential abuse indicators, accommodation trends, and proactive management opportunities. Distinguishes between patterns that may indicate abuse and those protected by leave laws, generates workforce-level compliance trend reports, and identifies systemic leave management issues before they become litigation exposure.",
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
    yamlFrontmatter: `name: Leave Analytics Skill
version: "1.0"
agent_code: LIT-AGT-010
domain: leave-accommodation
industry: legal_services
trust_tier: HIGH
context_mode: rag
analytics_scope: [individual_patterns, department_trends, workforce_aggregate, jurisdiction_compliance]
protection_boundary: "Must distinguish protected leave usage from potential abuse without chilling protected activity"`,
    markdownBody: `# Leave Analytics Skill

## Purpose
Provides data-driven insights into leave usage patterns while carefully distinguishing between protected leave exercise and potential abuse, and identifying systemic compliance gaps before they generate litigation exposure.

## IMPORTANT Legal Constraint
**Protected Activity Warning**: Discipline or interference based on leave usage patterns may violate FMLA §2615 (interference) or constitute retaliation. This skill identifies patterns for attorney review only — employer action requires attorney consultation.

## Leave Pattern Analytics

### Individual-Level Analysis
**Usage Patterns Warranting Review (NOT automatic abuse indicators)**:
- Intermittent absences consistently adjacent to weekends or holidays
- Pattern of absences on days with mandatory overtime or undesirable shifts
- Certification states "as needed" frequency significantly exceeded
- Multiple short absences outside certified frequency/duration
- Leave usage increases around performance evaluations or discipline

**Critical Distinction**: Adjacent-weekend absences are NOT abuse if the employee's serious health condition produces episodic symptoms. Medical recertification is the appropriate employer response.

### Department/Location Level
- Leave rate vs. industry benchmark by department
- Manager-specific leave patterns (high leave in specific manager's team)
- Accommodation request rates by job function
- Time-to-resolution for interactive process by HR partner
- Notice compliance rates (advance vs. unforeseeable absences)

### Workforce Aggregate
- Total FMLA utilization rate vs. entitlement
- State PFL usage by program
- Accommodation grant vs. denial rate (denial rate >30% warrants review)
- Open accommodation requests >90 days (interactive process staleness risk)
- Leave exhaustion without accommodation follow-up (ADA risk indicator)

## Compliance Risk Indicators

### High-Risk Flags (Immediate Legal Review)
- FMLA interfering discipline (performance review during leave)
- Designation delays >5 business days from notice of leave
- Denial of leave without medical certification deficiency notice
- Terminated employee who was on or recently returned from FMLA
- ADA interactive process with no documentation
- Accommodation request unanswered >30 days

### Medium-Risk Flags (30-Day Review)
- Employees at FMLA exhaustion without ADA follow-up assessment
- State PFL non-concurrent designation without written policy
- Recertification requested <30 days after prior (unless permitted exception)
- Fitness-for-duty requirement not stated in Designation Notice

## Reporting Output
\`\`\`
LEAVE ANALYTICS REPORT
Period: [Date Range] | Scope: [Individual / Department / Workforce]
Total Employees: [N] | Total Leave Events: [N]

UTILIZATION SUMMARY:
- FMLA Usage Rate: [X]% of eligible employees used FMLA
- Average FMLA Duration: [X] weeks
- Intermittent vs. Continuous: [X]% intermittent
- PFL Usage: [breakdown by program]

COMPLIANCE FLAGS:
- HIGH RISK (Immediate Review): [N] items
- MEDIUM RISK (30-Day Review): [N] items
- MONITORING: [N] patterns

PATTERNS IDENTIFIED: [list with protected-activity caveat]
RECOMMENDED ACTIONS: [attorney-reviewed recommendations only]
\`\`\`
`,
  },
];

// ── KB SOURCES (6) — Note: use `title` field (not `name`) for /sources/text ──

const KB_SOURCES = [
  {
    title: "FMLA Regulations, DOL Opinion Letters & WHD Guidance",
    displayName: "FMLA Regulations, DOL Opinion Letters & WHD Guidance",
    content: `# FMLA Regulations, DOL Opinion Letters & Wage and Hour Division Guidance

## Core FMLA Statute (29 U.S.C. §§ 2601–2654)

### Employer Coverage (§2611(4))
- Private sector: 50+ employees within 75 miles for 20 or more workweeks in current or preceding calendar year
- All public agencies regardless of size
- Elementary/secondary schools regardless of size
- Integrated employer doctrine: related entities counted together (DOL FMLA regulations Subpart L)

### Employee Eligibility (§2611(2) / 29 C.F.R. §825.110)
Three conjunctive requirements:
1. Employed by covered employer for at least 12 months (need not be consecutive — §825.110(b))
2. Worked at least 1,250 hours in 12-month period preceding leave
3. Employed at worksite where employer has 50+ employees within 75-mile radius

### Leave Entitlement (§2612)
- 12 workweeks per 12-month period for:
  - Birth and care of newborn child (within 12 months of birth)
  - Adoption or foster placement (within 12 months of placement)
  - Care for spouse, child, or parent with serious health condition
  - Employee's own serious health condition making them unable to perform essential job functions
  - Qualifying exigency related to covered military member's active duty or call to active duty
- 26 workweeks in a single 12-month period:
  - Military caregiver leave for servicemember or veteran with serious injury or illness

### Serious Health Condition (29 C.F.R. §825.113-115)
Six categories:
1. Inpatient care: overnight stay in hospital, hospice, or residential medical care facility
2. Continuing treatment: incapacity of more than 3 consecutive calendar days + 2+ treatments by HCP within 30 days, OR 1 treatment + regimen of continuing treatment under HCP supervision
3. Pregnancy/prenatal care
4. Chronic serious health condition: periodic visits (at least twice per year) + episodic incapacity
5. Permanent/long-term incapacity under continuing HCP supervision
6. Multiple treatments for non-chronic condition that would likely result in incapacity >3 days

## FMLA Regulations — Key Provisions (29 C.F.R. Part 825)

### Designation Obligations (§825.300-301)
- Upon learning of need for FMLA leave: provide Notice of Eligibility within 5 business days
- Upon having sufficient information to designate: provide Designation Notice within 5 business days
- Retroactive designation permitted if no prejudice to employee (Ragsdale v. Wolverine World Wide, 535 U.S. 81 (2002))
- Employer must designate even if employee does not want leave designated

### Substitution of Paid Leave (§825.207)
- Employer may require, or employee may elect, substitution of accrued paid leave
- Employer must inform employee of substitution requirement before leave begins
- Cannot retroactively change substitution policy

### Maintenance of Group Health Benefits (§825.209)
- Employer must maintain same group health coverage under same terms and conditions
- Employee responsible for normal premium contributions
- Employer may recover premiums if employee fails to return from leave (except circumstances beyond control)

## Key DOL Opinion Letters

### FMLA 2020-1 (January 8, 2020): Telework as FMLA Leave
- Remote work performing reduced job duties is NOT FMLA leave
- FMLA leave is leave from work, not reduced-duty work
- Employee may use FMLA leave on a day they cannot telework due to serious health condition

### FMLA 2019-2 (March 14, 2019): Fluctuating Workweek and FMLA
- Hours equivalent method for FMLA entitlement with varying schedules
- Use workweek hours at time of leave for calculating entitlement

### FMLA 2019-1 (March 14, 2019): Employer Communication During Leave
- Permissible: Status updates on work matters that are purely informational
- Impermissible: Requiring employee to perform work while on leave
- Context-dependent analysis required

### FMLA 2018-2 (August 28, 2018): Voluntary Overtime and 1,250-Hour Test
- Employer may not count voluntary overtime employee declined toward 1,250-hour eligibility test
- Only count hours actually worked

## Retaliation and Interference Standards
- §2615(a)(1): Unlawful to interfere with, restrain, or deny exercise of any right
- §2615(a)(2): Unlawful to discharge or discriminate for opposing any practice made unlawful
- Interference: No requirement to show bad intent (Bachelder v. America West Airlines, 259 F.3d 1112)
- Retaliation: Requires adverse action + causal connection (close temporal proximity sufficient)

## Statute of Limitations
- 2 years for non-willful violations
- 3 years for willful violations
`,
    tags: ["FMLA", "DOL", "leave-regulations", "federal", "certification", "designation", "interference"],
    metadata: { source: "29 U.S.C. §§ 2601–2654 / 29 C.F.R. Part 825 / DOL WHD Opinion Letters", lastUpdated: "2024-01-01", jurisdiction: "federal" },
  },
  {
    title: "ADA Regulations, EEOC Guidance on Reasonable Accommodation & Undue Hardship",
    displayName: "ADA Regulations, EEOC Guidance on Reasonable Accommodation & Undue Hardship",
    content: `# ADA Regulations, EEOC Guidance on Reasonable Accommodation & Undue Hardship Analysis

## Americans with Disabilities Act (42 U.S.C. §§ 12101–12213)
### As Amended by the ADA Amendments Act of 2008 (ADAAA)

### Covered Entities (§12111(2))
- Employer: 15+ employees for each working day in each of 20 or more calendar weeks
- Employment agencies, labor organizations, joint labor-management committees
- State and local governments (Title II, no employee threshold)

### Disability Definition (§12102 / 29 C.F.R. §1630.2(g)) — Broadly Construed Under ADAAA
Three prongs:
1. **Actual disability**: Physical or mental impairment that substantially limits a major life activity
2. **Record of disability**: History of such impairment
3. **Regarded as disabled**: Perceived as having impairment (even if no actual limitation)
   - Exception: Impairment lasting <6 months AND not a serious health condition not covered under "regarded as"

### Major Life Activities (§12102(2))
Includes (non-exhaustive):
- Caring for oneself, performing manual tasks, seeing, hearing, eating, sleeping, walking, standing, lifting, bending, speaking, breathing, learning, reading, concentrating, thinking, communicating, working
- Operation of major bodily functions: immune system, cell growth, digestive, bowel, bladder, neurological, brain, respiratory, circulatory, endocrine, reproductive functions

### "Substantially Limits" Standard Post-ADAAA (29 C.F.R. §1630.2(j))
- Substantially limits compared to general population; not demanding standard
- Must consider: nature, severity, duration, long-term impact
- Episodic or in remission: disability if it would substantially limit when active
- Mitigating measures (except corrective lenses) are NOT considered in determination

## Reasonable Accommodation (§12112(b)(5) / 29 C.F.R. §1630.9)

### Definition (§12111(9))
Modifications or adjustments:
- To application process
- To work environment or manner/circumstances under which job performed
- To enable employee with disability to enjoy equal benefits and privileges

### Common Accommodations
- Modified work schedules, part-time work
- Leave of absence (even beyond FMLA entitlement)
- Reassignment to vacant position (if employee qualified; no bumping)
- Modified equipment or devices
- Adjusted or modified policies
- Remote work / telework
- Restructuring (marginal functions only — essential functions cannot be eliminated)

### Essential vs. Marginal Functions (29 C.F.R. §1630.2(n))
Essential function indicators:
- Position exists specifically to perform that function
- Limited number of employees available to perform function
- Function is highly specialized
- Written job description prepared before recruiting (§1630.2(n)(3))
- Time spent performing function
- Consequences of not performing function

### Undue Hardship (§12111(10) / 29 C.F.R. §1630.2(p))
"Significant difficulty or expense" — factors:
1. Nature and cost of accommodation needed
2. Overall financial resources of facility; number of persons employed
3. Overall financial resources of covered entity; type, number, location of facilities
4. Type of operation: composition, structure, functions of workforce; geographic separateness; administrative/fiscal relationship between facilities
5. Impact on operations of the facility

## EEOC Enforcement Guidance Key Points

### Enforcement Guidance on Reasonable Accommodation and Undue Hardship (Oct. 2002)
- Interactive process is required; not merely suggested
- Employer's failure to engage may independently violate ADA
- Medical information: employer may require sufficient to verify disability and explain need for accommodation
- If obvious disability (e.g., uses wheelchair), employer cannot require medical documentation for related accommodation

### EEOC Guidance on Leave as Reasonable Accommodation (May 2016)
- Fixed-duration leave policies may violate ADA if inflexibly applied
- "100% healed" or "no restrictions" return-to-work policies are unlawful
- Maximum leave policy applies only after considering whether additional leave is reasonable accommodation
- Employee does not need to use magic words "reasonable accommodation" or "ADA"

### PWFA (Pregnant Workers Fairness Act — 42 U.S.C. §2000gg)
Effective June 27, 2023:
- Covered employers: 15+ employees
- Covered conditions: Any limitation due to pregnancy, childbirth, or related medical conditions
- Key difference from ADA: Must accommodate even if limitation does not rise to disability level
- Specific accommodations enumerated: frequent breaks, sitting, drinking water, closer parking, light duty, modified food/beverage policies, additional restroom time, PPE modification, predictable break schedule
- Employer cannot require employee take leave if another accommodation is reasonable
- Effective upon EEOC final rule publication (April 15, 2024)

## Interactive Process Documentation Checklist
1. Written acknowledgment of accommodation request with date
2. Request for medical documentation (if not obvious; specify what information needed)
3. Record of each meeting/communication with dates and attendees
4. List of accommodations discussed and feasibility assessment
5. Final decision with reasons (if denial, all alternatives considered)
6. Implementation plan with timeline
7. Follow-up check-in schedule
`,
    tags: ["ADA", "ADAAA", "EEOC", "reasonable-accommodation", "undue-hardship", "interactive-process", "PWFA", "disability"],
    metadata: { source: "42 U.S.C. §§ 12101–12213 / 29 C.F.R. Part 1630 / EEOC Guidance", lastUpdated: "2024-04-15", jurisdiction: "federal" },
  },
  {
    title: "State-by-State Leave Law Matrix — Eligibility, Duration, Benefits & Notice Requirements",
    displayName: "State-by-State Leave Law Matrix — Eligibility, Duration, Benefits & Notice Requirements",
    content: `# State-by-State Leave Law Matrix
## Comprehensive Multi-Jurisdiction Leave Compliance Reference

### How to Use This Matrix
This matrix covers the primary leave laws in each state that supplement or expand upon federal FMLA rights. For each state, the agent should check: (1) state FMLA equivalent, (2) paid family leave program, (3) paid sick leave requirements, and (4) pregnancy/disability leave.

---

## CALIFORNIA — Most Comprehensive Leave Framework

### California Family Rights Act (CFRA) — Gov't Code §12945.2
- Employer: 5+ employees (expanded 2021)
- Eligibility: 12 months + 1,250 hours (same as FMLA but no 75-mile rule)
- Entitlement: 12 workweeks per year
- Qualifying reasons: Same as FMLA PLUS care of grandparent, grandchild, sibling, domestic partner
- KEY: Baby bonding — FMLA and CFRA run SEPARATELY since 2021 Baby Blues Amendment (24 weeks total possible for bonding)
- Coverage: Spouses, children, parents, grandparents, grandchildren, siblings, domestic partners

### California Paid Family Leave (UI Code §3301+)
- Duration: 8 weeks (2023)
- Benefit: 60-70% of wages, SDI cap ($1,620/week 2024 max)
- Waiting period: None (eliminated July 2020)
- Qualifying: Bond with new child within 12 months; care for seriously ill family member; military assist

### Pregnancy Disability Leave (PDL) — Gov't Code §12945
- Employer: 5+ employees
- Entitlement: Up to 4 months (17.3 weeks) for disability due to pregnancy, childbirth, related condition
- Runs concurrent with FMLA (if employer covered by both)
- Runs BEFORE CFRA bonding leave (PDL → CFRA = up to 7 months total for birth/pregnancy)

### California Paid Sick Leave (Lab. Code §246)
- Accrual: 1 hour per 30 hours worked (or 40/80 hours front-loaded — 2024 expansion)
- Usage: On or after 90-day employment; any reason employee or family member needs (very broad)
- Notice: Reasonable advance notice if foreseeable; ASAP if not

---

## NEW YORK

### New York Family Leave Benefits Law (N.Y. WCL Art. 9-A)
- Employer: 1+ employees (all employers)
- Employee eligibility: 26 consecutive weeks (regular) or 175 days (variable schedule)
- Entitlement: 12 weeks
- Benefit: 67% of NY SAWW (2024: $1,151.16/week max)
- Qualifying: Bond with child within 12 months; care for seriously ill family member; qualifying military exigency
- Notice: 30 days advance when foreseeable; ASAP when not; written request required

### New York State Human Rights Law (NYSHRL) — Disability/Accommodation
- Employer: 4+ employees
- Definition of disability: Broader than ADA — "physical, mental or medical impairment" limiting activities
- Reasonable accommodation required (including leave)
- Pregnancy: Separate reasonable accommodation obligation under NYSHRL §296(3)(a)

### New York Paid Sick Leave (Lab. Law §196-b)
- 5+ employees: 56 hours paid; 1-4 employees (net income >$1M): 40 hours paid; <5 employees (<$1M): 40 hours unpaid
- Accrual: 1 hour per 30 hours; or front-load

---

## WASHINGTON STATE

### Washington PFML (RCW 50A)
- Employer: 1+ employees
- Eligibility: 820+ hours in qualifying period
- Duration: 12 weeks family; 12 weeks medical; combination 16 weeks; 18 weeks pregnancy complications
- Benefit: 90% up to 50% SAWW + 50% above 50% SAWW; max 90% SAWW ($1,542/week 2024)
- Notice: 30 days when foreseeable; ASAP when not

### Washington Sick Leave (RCW 49.46.210)
- Accrual: 1 hour per 40 hours worked
- Eligible at 90-day anniversary
- Usage: Employee or family member illness, preventive care, domestic violence needs

---

## NEW JERSEY

### New Jersey Family Leave Act (NJFLA) (N.J.S.A. 34:11B-1+)
- Employer: 30+ employees within 75 miles
- Eligibility: 12 months + 1,000 hours
- Entitlement: 12 weeks in 24-month period (or 24 weeks intermittent in 24 months)
- Qualifying: Bond with child within 12 months; care for family member with serious illness
- Does NOT cover own serious health condition (use NJ TDI)
- Note: NJ FLI and FMLA do NOT run concurrently for family care leave

### New Jersey FLI + TDI
- FLI: 12 weeks family, 85% wages (max $1,055/week 2024)
- TDI: 26 weeks disability, 85% wages; for employee's own disability

### New Jersey Earned Sick Leave (N.J.S.A. 34:11D-1+)
- Accrual: 1 hour per 30 hours; max 40 hours/year
- Usage: Employee or family member illness; public health emergency; domestic violence

---

## COLORADO

### Colorado FAMLI (C.R.S. §8-13.3-501+)
- Employer: 1+ employees
- Effective: January 1, 2024 (benefits); January 1, 2023 (contributions)
- Duration: 12 weeks; 16 weeks pregnancy complications
- Benefit: 90% up to 50% SAWW + 50% of wages above 50% SAWW
- Qualifying: Own serious health condition; care for family; bond with child within 12 months; qualifying military exigency; safe leave

### Colorado HFWA — Healthy Families and Workplaces Act
- Sick leave: 1 hour per 30 hours; max 48 hours
- Usage: Employee or family illness; domestic abuse/sexual assault

---

## MASSACHUSETTS

### Massachusetts PFML (M.G.L. c. 175M)
- Medical leave: 20 weeks; Family leave: 12 weeks; Combined: 26 weeks
- Benefit: 80% of wages up to 50% state SAWW + 50% above; max $1,149.90/week (2024)
- Notice: 30 days advance (or as soon as practicable for unexpected)

### Massachusetts Earned Sick Time (M.G.L. c. 149 §148C)
- 11+ employees: paid sick time; <11: unpaid
- Accrual: 1 hour per 30 hours; max 40 hours/year

---

## OREGON

### Oregon Paid Leave (ORS Chapter 657B)
- Effective September 3, 2023
- Employer: 1+ employees
- Duration: 12 weeks; 14 weeks pregnancy complications; 2 additional weeks = 14 total family leave
- Benefit: 60-100% of wages based on income; max $1,523.63/week (2024)
- Note: Oregon Family Leave Act (OFLA) AMENDED effective July 1, 2024 — Oregon Paid Leave supersedes for most purposes; OFLA retained for bereavement, sick child care, pregnancy, domestic violence

### Oregon Paid Sick Leave (ORS 653.606)
- Employer: 10+ employees (1 hour per 30 hours; 40 hours max)
- <10 employees: unpaid; <6 employees total: unpaid

---

## ADDITIONAL STATE PFL PROGRAMS SUMMARY

| State | Program | Duration | Benefit | Effective |
|-------|---------|---------|---------|-----------|
| CT | CT Paid Leave | 12 weeks | 95% wages up to 60× min wage | Jan 2022 |
| DC | DC PFML | 12 weeks family / 12 medical / 2 prenatal | 90% wages up to 150% AWW | Oct 2020 |
| MD | MD FAMLI | 12 weeks; 24 weeks pregnancy | 90% wages up to 65% AWW | Jan 2026 |
| MN | MN PFML | 12 weeks family; 12 medical; 20 combo | 66-90% wages; max $1,372/week | Jan 2026 |
| IL | IL PLSAA | Up to 40 hours/year unpaid (small family); no state PFL | N/A | Jan 2023 |

---

## MANDATORY PAID SICK LEAVE — STATES WITH REQUIREMENTS
AZ, CA, CO, CT, IL, MA, MD, MI, MN, NJ, NM, NV, NY, OR, RI, VA, VT, WA, DC — plus numerous municipalities

### Key Municipal Sick Leave Ordinances
- Chicago: 1 hr/35 hrs; max 40 hours paid/yr; carryover up to 40 hours
- New York City: 56 hours paid (5+ employees); 40 hours unpaid (<5)
- Seattle: 1 hr/30 hrs; tiers based on employer size (1-49: 40 hrs; 50-249: 56 hrs; 250+: 72 hrs)
- San Francisco: 1 hr/30 hrs; no annual cap; carryover up to 72 hours (72+ employees)
- Philadelphia: 1 hr/40 hrs; max 40 hours/year
`,
    tags: ["state-leave", "CFRA", "PFL", "sick-leave", "multi-jurisdiction", "NY-PFL", "WA-PFML", "CO-FAMLI", "MA-PFML"],
    metadata: { source: "50-State Legislative Research / State Agency Regulations", lastUpdated: "2024-04-01", jurisdiction: "multi-state" },
  },
  {
    title: "Local Sick Leave Ordinance Database — Municipal Compliance Specifications",
    displayName: "Local Sick Leave Ordinance Database — Municipal Compliance Specifications",
    content: `# Local Sick Leave Ordinance Database
## Municipal and County-Level Compliance Specifications

### Overview
As of 2024, 15+ states and over 80 cities/counties have mandatory paid sick leave ordinances. This database covers the most frequently applicable jurisdictions with employer compliance specifications.

---

## CALIFORNIA LOCAL ORDINANCES

### Los Angeles City (LAMC §187.04)
- Employer size: 26+ employees
- Accrual: 1 hour per 30 hours; cap 48 hours/year (carryover: 72 hours)
- Additional: Employers with 25 employees or fewer: 1 hr/30 hrs; cap 32 hours/year
- Usage reasons: Employee or family illness; preventive care; domestic violence/sexual assault/stalking

### San Francisco (SFPC Article 12W)
- All employers regardless of size
- Accrual: 1 hr/30 hrs; no annual accrual cap
- Carryover: 72 hours (72+ employees); 40 hours (1-71 employees)
- Usage: Employee or family illness; preventive care; domestic violence; closure due to public health emergency
- Notice: Reasonable advance notice; employer may require documentation for 3+ consecutive days only

### San Diego (SDMC §39.0101+)
- Employer size: 26+ employees (small: 6-25 employees effective 2017)
- Accrual: 1 hour per 30 hours; max 80 hours (large employers); 40 hours (small)

### Oakland (OMC Chapter 5.92)
- All employers with employees who work in Oakland
- Accrual: 1 hr/30 hrs
- Medium (26-99): 72 hours/year; Large (100+): 72 hours/year; Small (<26): 40 hours/year

### Santa Monica (SMMC §4.62)
- All employees working in Santa Monica
- Accrual: 1 hr/30 hrs; 72 hours large employer; 40 hours small employer (<26)

---

## NEW YORK LOCAL ORDINANCES

### New York City (NYC Admin. Code §20-912+)
- 5+ employees: 56 hours paid sick; domestic workers: 40 hours paid regardless of size
- Chronically ill employees: covered; mental health conditions covered
- Safe leave (domestic violence, sexual assault): part of same leave allotment
- Documentation: May require for 3+ consecutive days; cannot require diagnosis
- Employer's year can be calendar year, fiscal year, or 12 months from hire

### Westchester County, NY
- 5+ employees: 40 hours paid; <5: 40 hours unpaid
- Equivalent to NYS PSL (county adopted state standard)

---

## ILLINOIS LOCAL ORDINANCES

### Chicago (MCC §1-24)
- All employees working in Chicago (regardless of employer location)
- Accrual: 1 hour per 35 hours worked; max 40 hours paid sick + 40 hours unpaid family
- Carryover: 50% of unused hours (max 20 hours) to next year
- Domestic violence/sexual assault: Covered as "safe leave"
- Effective 2017; AMENDED 2023 (Chicago ESSTA) — increased carryover; added safe leave

### Cook County, IL (except municipalities that have opted out)
- 1 hr/40 hrs; max 40 hours/year; carryover 50% (max 20 hours)
- Note: Many suburbs within Cook County have opted out; always verify municipality

---

## WASHINGTON LOCAL ORDINANCES

### Seattle (SMC 14.16)
- Employer tiers based on size:
  - Tier 1 (1-49 FTEs): 40 hours paid/year
  - Tier 2 (50-249 FTEs): 56 hours paid/year
  - Tier 3 (250+ FTEs): 72 hours paid/year
- Carryover: All unused hours carry over (no cap)
- Usage: Employee or family illness; preventive care; domestic violence; public health emergency closure
- Paid Parental Leave: Seattle also has mandatory paid parental leave for large employers

### Tacoma (TMC 18.10)
- All employers with 1+ employee working in Tacoma
- Accrual: 1 hr/40 hrs; max 24 hours/year
- Carryover: 24 hours max

---

## TEXAS LOCAL ORDINANCES
### Dallas, Austin, San Antonio — City Ordinances (Currently Enjoined)
- Multiple Texas cities passed sick leave ordinances; currently challenged and enjoined pending litigation
- Texas Supreme Court has not definitively ruled; enforcement suspended
- Check current status before advising Texas municipal employers

---

## NEW JERSEY LOCAL ORDINANCES

### Newark, NJ
- All employees working in Newark
- 1 hr/30 hrs; max 40 hours/year (10+ employees: paid; <10: unpaid)
- Effective 2014 (preceded state law)

### Jersey City, NJ
- Employer: 10+ employees worldwide; 1 hr/30 hrs; 40 hours/year
- Domestic violence leave included

---

## COMPLIANCE CHECKLIST FOR MULTI-LOCATION EMPLOYERS
For employers with employees in multiple jurisdictions:
1. Identify all cities/counties where employees perform work
2. Check for local ordinance (even if state law applies — local may be more generous)
3. Apply the most protective standard at each worksite
4. Document which law governs each employee's leave
5. Provide required notices by jurisdiction (some require notice at hire, annually, on posting)
6. Track separately by location if local law differs from state law

## Key Interaction Rules
- Where state and local law both apply: most employee-protective standard controls
- Where FMLA and local sick leave overlap: different laws; coordinate usage
- Municipal ordinances may have different definitions of "family member" than state/federal
`,
    tags: ["local-sick-leave", "municipal-ordinances", "NYC", "San Francisco", "Chicago", "Seattle", "multi-jurisdiction", "ordinance-database"],
    metadata: { source: "Municipal Codes / Local Agency Regulations", lastUpdated: "2024-04-01", jurisdiction: "local-municipal" },
  },
  {
    title: "Accommodation Ideas Library — By Disability Type and Job Function",
    displayName: "Accommodation Ideas Library — By Disability Type and Job Function",
    content: `# Accommodation Ideas Library
## Organized by Disability/Condition Type and Job Function

### Reference Sources
- JAN (Job Accommodation Network): askjan.org — primary source for accommodation ideas
- EEOC Enforcement Guidance on Reasonable Accommodation (Oct. 2002)
- EEOC Guidance on Mental Health Conditions and ADA (Dec. 2016)

---

## BY DISABILITY/CONDITION TYPE

### Musculoskeletal Conditions (Back, Neck, Joint Disorders)
**Common functional limitations**: Prolonged sitting, prolonged standing, lifting, bending, reaching
**Accommodation ideas**:
- Ergonomic chair with lumbar support and adjustable height/armrests
- Sit-stand workstation (height-adjustable desk)
- Footrest, anti-fatigue mat for standing workers
- Parking space closer to workplace entrance
- Modified lifting restrictions (with coworker assistance for heavy items)
- Reduced or modified hours on high-impact days
- Ergonomic keyboard, mouse, monitor arm
- Modified seating arrangement (avoid low chairs, chairs without armrests)
- Temporary or permanent reassignment of tasks requiring prohibited physical activities

### Mental Health Conditions (Depression, Anxiety, PTSD, Bipolar)
**Common functional limitations**: Concentration, stress tolerance, attendance, social interaction, handling criticism
**Accommodation ideas**:
- Modified work schedule (later start time, flexible hours for therapy appointments)
- Reduced workload or modified deadlines during flare-ups
- Private workspace or noise-canceling headphones
- Written instructions rather than verbal (for concentration/memory issues)
- Regular check-ins with supervisor (structured feedback)
- Work-from-home or telework on high-symptom days
- Modified supervision (less frequent monitoring)
- Permission to take additional breaks as needed
- Clear communication of expectations in writing
- Modified attendance policy for FMLA-protected absences
- Employee Assistance Program (EAP) referral (voluntary)

### Neurological Conditions (ADHD, Autism Spectrum, Traumatic Brain Injury)
**Common functional limitations**: Concentration, organization, time management, sensory processing, social interaction
**Accommodation ideas**:
- Reduced distractions: private office or designated quiet workspace
- Written task lists with prioritization
- Electronic reminders and organizational tools (project management software)
- Modified work schedule (consistent, structured hours)
- Extended deadline for complex tasks
- Reduced workload size with refocusing on priority items
- Telework to control environment
- Social stories or written workplace etiquette guidance
- Designated support person for clarifying instructions

### Vision Impairments
**Accommodation ideas**:
- Screen magnification software (ZoomText, MAGic)
- Screen reader (JAWS, NVDA, VoiceOver)
- Large monitor, adjustable font sizes
- Braille materials (business cards, documents)
- Modified lighting (reduce glare; increase ambient light)
- Document conversion services (to accessible formats)
- Accessible software and web interfaces

### Hearing Impairments
**Accommodation ideas**:
- Sign language interpreters for meetings
- CART (Communication Access Realtime Translation)
- Video relay services for phone communication
- Captioning for video meetings and training
- Written communication preference (email, messaging)
- Visual or vibrating alerting systems
- TTY/TDD equipment
- Assistive listening devices

### Chronic Conditions (Diabetes, Lupus, Crohn's Disease, Fibromyalgia, Cancer)
**Common functional limitations**: Fatigue, unpredictable absences, medication side effects, dietary/physical needs
**Accommodation ideas**:
- Flexible work schedule for medical appointments and treatment
- Telework on high-symptom days
- Rest breaks as needed (beyond standard schedule)
- Access to refrigerator for medication/food storage
- Modified duty (avoiding physically demanding tasks during treatment)
- Leave of absence for treatment periods
- Reduced travel requirements
- Parking accommodation (accessible, close)

### Pregnancy and Related Conditions (PWFA Specific)
**Specific PWFA Accommodations (per EEOC Final Rule, April 2024)**:
- Frequent breaks
- Ability to sit (even for roles that require standing)
- Drinking water (even in no-beverage workplace)
- Closer parking
- Light duty (if available and consistent with employer program)
- Modified food/drink policies (for nausea, gestational diabetes, etc.)
- Additional restroom time
- Modified schedule (for prenatal appointments)
- Remote work (if role permits)
- Predictable break schedule
- Excusal from strenuous activities or tasks with exposure to fetal risk
- Temporary suspension of essential functions (unprecedented under PWFA — time-limited)

---

## BY JOB FUNCTION

### Office/Administrative Staff
- Ergonomic workstation; sit-stand desk
- Voice-recognition software
- Modified schedule for therapy/medical appointments
- Private workspace; noise reduction
- Telework on difficult symptom days

### Healthcare Workers (Hospital, Clinic)
- Modified patient care assignments (avoid immunocompromised patients — for immune-suppressed employee)
- Transfer from direct patient care to administrative role (temporary)
- Modified lifting restrictions (patient handling)
- Adjusted shift timing (for circadian rhythm disorders)
- Modified PPE (for latex allergies, respiratory conditions)
- Leave accommodations (intermittent FMLA for episodic conditions)

### Retail/Warehouse/Manufacturing (Physical Labor)
- Ergonomic tools (anti-vibration gloves, lift assists)
- Modified lifting restrictions (buddy system for heavy items)
- Sit-stand stool for cashiers, assembly line workers
- Anti-fatigue matting
- Modified schedule to avoid most physically demanding periods
- Reassignment to less physically demanding role (if available)
- Extended or additional rest breaks

### Transportation/Driving
- Vehicle modifications (hand controls, swivel seats, wide mirrors)
- Modified routes (avoid highways for anxiety, medical conditions)
- Companion driver for certain conditions
- Note: "Regarded as" disabled drivers — DOT medical standards may preempt ADA in some cases

### Management/Executive Roles
- All mental health accommodations above
- Executive coach/counselor support (not required but often effective)
- Modified scope of supervisory responsibilities (temporary)
- Reduced travel schedule
- Flexible meeting schedule

---

## ACCOMMODATION FEASIBILITY MATRIX

| Accommodation | Cost | Disruption | Frequency | Common Hardship Defense |
|---------------|------|-----------|-----------|------------------------|
| Ergonomic equipment | Low ($100-500) | None | Always | Almost never |
| Telework | None-Low | Low | Often | Rarely (post-COVID) |
| Modified schedule | None | Low-Med | Often | Sometimes |
| Additional breaks | None | Low | Common | Rarely |
| Reassignment | None-Low | Med | Sometimes | Sometimes |
| Physical modification | Med-High | Med | Sometimes | Occasionally |
| Interpreter services | High | High | Less common | Sometimes |
| Indefinite leave | Variable | High | Rare | Often (if truly indefinite) |
`,
    tags: ["accommodations", "disability", "ADA", "PWFA", "JAN", "ergonomic", "mental-health", "interactive-process"],
    metadata: { source: "JAN (Job Accommodation Network) / EEOC Enforcement Guidance", lastUpdated: "2024-04-15", jurisdiction: "federal" },
  },
  {
    title: "Leave Notice Templates — By Jurisdiction and Leave Type",
    displayName: "Leave Notice Templates — By Jurisdiction and Leave Type",
    content: `# Leave Notice Templates
## Required Notice Content by Jurisdiction and Leave Type

### Important Usage Note
All template notices below are framework templates only. They identify required content elements and structure. Each notice must be customized with specific employee information, dates, and jurisdiction-specific content. Legal review recommended before issuing denial notices or non-standard designations.

---

## FMLA NOTICE TEMPLATES

### Template 1: Notice of Eligibility and Rights (WH-381 Framework)
\`\`\`
[Date]
[Employee Name]
[Employee Address or HR Portal Communication]

RE: Your Leave Request — Notice of FMLA Eligibility and Rights

Dear [Employee Name]:

We are writing to notify you regarding your request for leave beginning [date] for [general reason — do not specify medical details].

ELIGIBILITY DETERMINATION:
☐ You ARE eligible for FMLA leave because:
   ✓ You have been employed for 12 months
   ✓ You worked 1,250 hours in the last 12 months
   ✓ You work at a site with 50+ employees within 75 miles

☐ You are NOT currently eligible because:
   ☐ You have not worked for the employer for 12 months
   ☐ You have not worked 1,250 hours in the 12 months preceding leave
   ☐ There are fewer than 50 employees within 75 miles of your worksite

YOUR RIGHTS:
If eligible and leave is FMLA-qualifying, you are entitled to:
- Up to 12 weeks of job-protected, unpaid leave
- Continued group health insurance under the same terms
- Restoration to the same or equivalent position upon return

YOUR RESPONSIBILITIES:
- Medical certification is required. Please return the enclosed [WH-380-E/WH-380-F] to HR by [Date — 15 calendar days from today]
- Notice of foreseeable leave: 30 days advance notice required when possible
- You must substitute accrued paid leave [per company policy]

Contact HR at [number/email] with questions.

[HR Representative]
[Title] | [Date]
\`\`\`

### Template 2: Designation Notice (WH-382 Framework)
\`\`\`
[Date]
[Employee Name]

RE: FMLA Leave Designation

Dear [Employee Name]:

Based on the information provided regarding your leave beginning [date]:

☐ Your leave IS designated as FMLA-protected.
   - Amount approved: [# weeks/days/hours] per [calendar year/rolling period]
   - Leave taken will count against your 12-week (or 26-week military caregiver) entitlement

☐ Your leave is NOT designated as FMLA-protected because:
   ☐ The condition does not constitute a serious health condition under FMLA
   ☐ You are not eligible for FMLA
   ☐ The certification is incomplete (see attached deficiency notice)

LEAVE DETAILS:
- Approved duration: [Continuous / Intermittent: [frequency] per [week/month]]
- Substitution of paid leave: [Required per company policy / Not required]
- Fitness-for-duty certification: ☐ Required upon return ☐ Not required
   [If required: Must address your ability to perform essential job functions as described on attached list]

Your FMLA balance as of [Date]: [X weeks] used; [Y weeks] remaining

[HR Representative] | [Date]
\`\`\`

---

## CALIFORNIA NOTICE TEMPLATES

### Template 3: CFRA Designation Notice (Baby Blues / Post-2021)
\`\`\`
RE: CFRA Leave Designation and Baby Blues Amendment Notice

[Employee Name],

Your FMLA leave for baby bonding beginning [Date] is being designated concurrently with your federal FMLA entitlement.

IMPORTANT — BABY BLUES AMENDMENT (Effective Jan. 1, 2021):
Under the amended California Family Rights Act (SB 1383), FMLA and CFRA for baby bonding now run SEPARATELY.

- FMLA baby bonding: [X weeks] available under federal law
- CFRA baby bonding: [X weeks] available as a SEPARATE entitlement under California law

This means you may be entitled to up to 24 total weeks of baby bonding leave (12 weeks FMLA + 12 weeks CFRA) if both leaves are used for baby bonding.

Your current elections:
☐ I am requesting to use FMLA and CFRA simultaneously (reduces total to 12 weeks)
☐ I am requesting to use FMLA first, then CFRA (maximum 24 weeks)

Please complete your election and return to HR within 5 business days.

[HR Representative] | [Date]
\`\`\`

### Template 4: California PDL + CFRA + PFL Sequence Notice
\`\`\`
RE: Pregnancy Disability Leave, CFRA, and Paid Family Leave Notice

Dear [Employee Name]:

You may have leave rights under multiple California programs. Here is your complete entitlement summary:

1. PREGNANCY DISABILITY LEAVE (PDL):
   - Available: Up to 4 months (17.3 weeks) for disability due to pregnancy, childbirth, or related medical condition
   - Start date: When disability begins (may begin prior to birth)
   - Benefit: Unpaid (CA SDI may provide wage replacement — apply with EDD)

2. CALIFORNIA FAMILY RIGHTS ACT (CFRA) — Baby Bonding:
   - Available: 12 weeks after PDL exhaustion (for baby bonding)
   - Start: Upon conclusion of PDL
   - Benefit: Unpaid (CA PFL may provide wage replacement — apply with EDD)

3. CALIFORNIA PAID FAMILY LEAVE (PFL):
   - Duration: 8 weeks
   - May run CONCURRENT with CFRA if employer requires/employee elects
   - Apply through EDD (edd.ca.gov/en/disability/paid_family_leave)

IMPORTANT: CA SDI and CA PFL are administered by the EDD, not the employer. Please apply directly.

[HR Representative] | [Date]
\`\`\`

---

## ADA/PWFA NOTICE TEMPLATES

### Template 5: Interactive Process Initiation Letter
\`\`\`
[Date]
[Employee Name]

RE: Request for Reasonable Accommodation — Interactive Process

Dear [Employee Name]:

We have received your request for a reasonable accommodation dated [Date] regarding [general description of limitation — not diagnosis].

As required under the Americans with Disabilities Act (ADA) and the Pregnancy Workers Fairness Act (PWFA) [if applicable], we would like to initiate an interactive process discussion to explore potential accommodations that would allow you to perform your job effectively.

INTERACTIVE PROCESS MEETING:
Date: [Proposed Date]
Time: [Time]
Location/Format: [In-person / Video call]
Participants: [HR Representative] and [Manager if appropriate]

To assist in this process, we ask that you:
☐ Complete the attached medical information request form and submit to HR by [Date]
☐ Provide your healthcare provider's completed form by [Date]
☐ Prepare a description of your functional limitations and how they affect your work

The information you provide will be kept confidential and in a separate medical file, accessible only to those with a need to know.

Please contact [HR contact] by [Date] to confirm the meeting.

[HR Representative] | [Date]
\`\`\`

### Template 6: Accommodation Decision — Grant
\`\`\`
[Date]
[Employee Name]

RE: Reasonable Accommodation Decision

Dear [Employee Name]:

Following our interactive process discussion on [Date], we are pleased to confirm the following approved accommodation:

APPROVED ACCOMMODATION:
[Description of accommodation]

IMPLEMENTATION:
- Effective date: [Date]
- Duration: [Permanent / Temporary through {Date} / Subject to review on {Date}]
- Implementation steps: [How accommodation will be put in place]

This accommodation is based on the specific limitations discussed during our interactive process. If your limitations change or the accommodation is not effective, please contact HR to schedule a follow-up interactive process discussion.

[HR Representative] | [Date]
\`\`\`

### Template 7: Accommodation Denial Letter (REQUIRES ATTORNEY REVIEW)
\`\`\`
[Date — DRAFT ONLY — ATTORNEY REVIEW REQUIRED BEFORE SENDING]
[Employee Name]

RE: Reasonable Accommodation Request

Dear [Employee Name]:

Thank you for participating in our interactive process discussions regarding your accommodation request. This letter summarizes our determination.

REQUESTED ACCOMMODATION: [What employee requested]

ALTERNATIVES EXPLORED DURING INTERACTIVE PROCESS:
1. [Alternative 1] — [Why not feasible or why employee declined]
2. [Alternative 2] — [Why not feasible or why employee declined]
3. [Alternative 3] — [Why not feasible or why employee declined]

DETERMINATION:
After engaging in the interactive process and considering [# alternatives], we have been unable to identify a reasonable accommodation that would allow you to perform the essential functions of your position without [undue hardship / creating a direct threat / eliminating essential functions].

[Specific basis for determination — must be specific, not boilerplate]

[If any alternative offered]: We can offer the following alternative: [alternative]

If you wish to discuss other potential accommodations or have additional information to provide, please contact [HR contact] within [X business days].

[HR Representative] | [Date]

*** ATTORNEY REVIEW REQUIRED BEFORE SENDING ***
\`\`\`

---

## NOTICE DEADLINE QUICK REFERENCE

| Notice Type | Triggering Event | Deadline |
|-------------|-----------------|---------|
| FMLA Eligibility (WH-381) | Employer learns of FMLA-qualifying need | 5 business days |
| FMLA Designation (WH-382) | Sufficient information to designate | 5 business days |
| Medical cert deficiency cure | Receipt of incomplete certification | 7 calendar days to cure |
| CA CFRA Baby Blues election | Employee eligible for both | 5 business days |
| NY PFL rights notice | New hire | With hire documents |
| ADA acknowledgment | Receipt of accommodation request | 5 business days (best practice) |
| ADA final decision | After interactive process complete | No statutory deadline; promptness required |
`,
    tags: ["leave-notices", "FMLA-templates", "WH-381", "WH-382", "ADA-letters", "CFRA", "accommodation-decisions"],
    metadata: { source: "DOL WH Forms / EEOC Guidance / State Agency Forms", lastUpdated: "2024-04-01", jurisdiction: "federal-and-state" },
  },
];

// ── RUNBOOKS (6) ──────────────────────────────────────────────────────────────

const RUNBOOKS = [
  {
    organizationId: ORG,
    name: "New State Leave Law Effective — Implementation Procedure",
    description: "Procedure for when a new state or local leave law becomes effective that affects Littler client employers. Covers impact assessment, system configuration, policy updates, manager training, and required notice updates.",
    industry: "legal_services",
    category: "compliance",
    triggerType: "automatic",
    triggerConditions: [
      { type: "event", event: "new_leave_law_effective", source: "legislative_tracker", threshold: "effective_date_within_60_days" },
    ],
    steps: [
      { id: "1", type: "action", action: "identify_affected_employers", label: "Identify all client employers operating in affected jurisdiction", order: 1 },
      { id: "2", type: "action", action: "assess_impact", label: "Assess impact on existing leave policies and programs for each affected employer", order: 2 },
      { id: "3", type: "condition", condition: "new_law_more_restrictive", label: "Is new law more restrictive than existing policy?", trueNext: "4", falseNext: "6", order: 3 },
      { id: "4", type: "action", action: "draft_policy_amendments", label: "Draft required policy amendments and handbook updates for affected employers", order: 4 },
      { id: "5", type: "action", action: "update_notice_templates", label: "Update jurisdiction-specific notice templates and required postings", order: 5 },
      { id: "6", type: "approval_gate", label: "Attorney review of policy amendments and client communications", approvalLevel: "confirm_before", order: 6 },
      { id: "7", type: "action", action: "configure_system_parameters", label: "Update leave management system: accrual rates, caps, carryover rules, eligibility thresholds", order: 7 },
      { id: "8", type: "action", action: "manager_training_notification", label: "Prepare and distribute manager training bulletin with effective date, key requirements, and employer obligations", order: 8 },
      { id: "9", type: "action", action: "client_alert", label: "Issue Littler Insight client alert summarizing new law and recommended actions", order: 9 },
      { id: "10", type: "action", action: "monitor_enforcement", label: "Monitor agency enforcement guidance and update KB within 30 days of any agency guidance", order: 10 },
    ],
    approvalConfig: { requiredApprovers: ["leave_practice_attorney"], autoApproveAfterHours: null },
    confidentiality: "internal",
    estimatedDuration: "5-7 business days",
    tags: ["leave-law", "compliance", "policy-update", "new-law", "manager-training"],
    metadata: { jurisdiction: "varies", lastReviewed: "2024-01-01", nextReview: "2025-01-01" },
    agentId: null,
  },
  {
    organizationId: ORG,
    name: "Leave Fraud Investigation — Protected Leave Rights Safeguards",
    description: "Procedure for investigating suspected leave fraud or abuse while ensuring all protected leave rights are preserved. Balances employer's legitimate interest in preventing abuse with FMLA interference and retaliation prohibitions.",
    industry: "legal_services",
    category: "investigation",
    triggerType: "manual",
    triggerConditions: [
      { type: "threshold", metric: "leave_pattern_abuse_score", threshold: "high", source: "leave_analytics_skill" },
      { type: "event", event: "supervisor_fraud_report", source: "hr_system", threshold: "any_report" },
    ],
    steps: [
      { id: "1", type: "action", action: "document_triggering_information", label: "Document specific, objective facts that triggered investigation concern (avoid subjective characterizations)", order: 1 },
      { id: "2", type: "approval_gate", label: "Attorney consultation REQUIRED before any investigation action — confirm protected leave status and available investigation tools", approvalLevel: "confirm_before", order: 2 },
      { id: "3", type: "condition", condition: "leave_is_fmla_designated", label: "Is the leave in question FMLA-designated?", trueNext: "4", falseNext: "7", order: 3 },
      { id: "4", type: "action", action: "review_certification_sufficiency", label: "Review medical certification for completeness; if pattern inconsistent with certification, request recertification (not sooner than 30 days)", order: 4 },
      { id: "5", type: "action", action: "assess_permissible_investigation", label: "Assess permissible investigation tools: surveillance in public places permitted; workplace surveillance permitted; private medical appointments NOT subject to surveillance", order: 5 },
      { id: "6", type: "action", action: "contact_healthcare_provider_limits", label: "If authentication/clarification needed: HR or leave administrator may contact HCP only to authenticate or clarify certification (cannot seek additional info) — not supervisor or management", order: 6 },
      { id: "7", type: "action", action: "document_investigation_findings", label: "Document all investigation activities, findings, and evidence in writing with dates", order: 7 },
      { id: "8", type: "approval_gate", label: "Attorney review of investigation findings before any corrective action", approvalLevel: "confirm_before", order: 8 },
      { id: "9", type: "action", action: "determine_appropriate_action", label: "Based on attorney guidance: corrective action for non-protected activities/dishonesty only — never for use of protected leave itself", order: 9 },
      { id: "10", type: "action", action: "maintain_confidential_records", label: "Maintain all investigation records in secure, confidential file; retain per litigation hold schedule", order: 10 },
    ],
    approvalConfig: { requiredApprovers: ["leave_practice_attorney", "employment_counsel"], autoApproveAfterHours: null },
    confidentiality: "privileged",
    estimatedDuration: "2-4 weeks",
    tags: ["leave-fraud", "investigation", "FMLA-interference", "protected-leave", "attorney-required"],
    metadata: { jurisdiction: "federal", lastReviewed: "2024-01-01", nextReview: "2025-01-01" },
    agentId: null,
  },
  {
    organizationId: ORG,
    name: "Mass Leave Event — Emergency Protocol (Pandemic, Natural Disaster)",
    description: "Emergency protocol for managing mass leave requests during pandemic, natural disaster, or other widespread workforce disruption. Covers emergency leave designation, tracking, and return-to-work planning across affected employee populations.",
    industry: "legal_services",
    category: "emergency",
    triggerType: "automatic",
    triggerConditions: [
      { type: "threshold", metric: "concurrent_leave_requests", threshold: "exceeds_10_percent_workforce", source: "hr_system" },
      { type: "event", event: "public_health_emergency_declared", source: "external_news_feed", threshold: "any_declaration" },
    ],
    steps: [
      { id: "1", type: "action", action: "activate_emergency_leave_team", label: "Activate dedicated leave management team; assign leave administrator to each business unit", order: 1 },
      { id: "2", type: "action", action: "assess_applicable_laws", label: "Assess all applicable emergency leave laws: FFCRA equivalents, state COVID-equivalent programs, emergency sick leave ordinances", order: 2 },
      { id: "3", type: "action", action: "implement_emergency_tracking", label: "Implement mass leave tracking system: reason codes, entitlement buckets, return-to-work dates", order: 3 },
      { id: "4", type: "action", action: "modified_notice_procedures", label: "Implement modified FMLA notice procedures: reduce advance notice requirement; accept electronic certifications", order: 4 },
      { id: "5", type: "action", action: "coordinate_state_programs", label: "Coordinate state emergency paid sick leave, PFL, and unemployment insurance eligibility for affected employees", order: 5 },
      { id: "6", type: "action", action: "employer_communication", label: "Issue employer-wide communication: available leave rights, how to request, return-to-work protocols, benefit continuation", order: 6 },
      { id: "7", type: "action", action: "return_to_work_planning", label: "Develop return-to-work plan: fitness-for-duty protocols, staggered return, accommodation requests for vulnerable employees", order: 7 },
      { id: "8", type: "action", action: "monitor_and_report", label: "Daily tracking report: total leaves, by leave type, by department, projected workforce capacity by date", order: 8 },
    ],
    approvalConfig: { requiredApprovers: ["senior_hr_leadership", "employment_counsel"], autoApproveAfterHours: 4 },
    confidentiality: "internal",
    estimatedDuration: "Ongoing during event",
    tags: ["mass-leave", "emergency", "pandemic", "natural-disaster", "return-to-work"],
    metadata: { jurisdiction: "varies", lastReviewed: "2024-01-01", nextReview: "2025-01-01" },
    agentId: null,
  },
  {
    organizationId: ORG,
    name: "ADA Litigation Hold — Accommodation Documentation Preservation",
    description: "Procedure for preserving all accommodation-related documentation when ADA/PWFA litigation is threatened or filed. Ensures interactive process records, medical certifications, and decision rationale are preserved and protected under attorney-client privilege.",
    industry: "legal_services",
    category: "litigation",
    triggerType: "manual",
    triggerConditions: [
      { type: "event", event: "eeoc_charge_filed", source: "legal_tracker", threshold: "any_ada_charge" },
      { type: "event", event: "demand_letter_received", source: "legal_tracker", threshold: "ada_related" },
      { type: "event", event: "litigation_hold_notice", source: "legal_counsel", threshold: "ada_related" },
    ],
    steps: [
      { id: "1", type: "action", action: "identify_custodians", label: "Identify all document custodians: HR, direct manager, skip-level manager, IT, legal, EAP (if involved)", order: 1 },
      { id: "2", type: "action", action: "issue_litigation_hold_notice", label: "Issue written litigation hold notice to all custodians; document delivery dates and acknowledgments", order: 2 },
      { id: "3", type: "action", action: "preserve_hr_records", label: "Preserve all accommodation records: request forms, medical documentation, interactive process notes, correspondence, decision letters", order: 3 },
      { id: "4", type: "action", action: "preserve_electronic_records", label: "Suspend auto-deletion of relevant email, HRIS records, calendar entries, instant messages related to employee", order: 4 },
      { id: "5", type: "action", action: "attorney_privilege_assessment", label: "Attorney reviews all documents for privilege; segregate privileged communications before any disclosure", order: 5 },
      { id: "6", type: "action", action: "audit_interactive_process", label: "Attorney conducts privileged audit of interactive process completeness: meetings documented? All alternatives explored? Decision rationale documented?", order: 6 },
      { id: "7", type: "action", action: "witness_identification", label: "Identify potential witnesses; prepare witness instructions regarding litigation hold and preservation obligations", order: 7 },
      { id: "8", type: "action", action: "eeoc_position_statement", label: "If EEOC charge: prepare position statement within response deadline (typically 30 days; extensions available)", order: 8 },
    ],
    approvalConfig: { requiredApprovers: ["employment_counsel", "litigation_attorney"], autoApproveAfterHours: null },
    confidentiality: "privileged",
    estimatedDuration: "Immediate; ongoing through litigation",
    tags: ["ADA", "litigation-hold", "accommodation", "EEOC", "document-preservation", "privilege"],
    metadata: { jurisdiction: "federal", lastReviewed: "2024-01-01", nextReview: "2025-01-01" },
    agentId: null,
  },
  {
    organizationId: ORG,
    name: "Third-Party Leave Administrator Integration — Data Sync & Discrepancy Resolution",
    description: "Procedure for managing leave administration when a third-party leave administrator (TPA) is involved. Covers initial data synchronization, eligibility discrepancy resolution, and ongoing coordination protocols between TPA and employer.",
    industry: "legal_services",
    category: "integration",
    triggerType: "automatic",
    triggerConditions: [
      { type: "event", event: "tpa_integration_established", source: "hr_system", threshold: "new_tpa_relationship" },
      { type: "event", event: "eligibility_discrepancy_detected", source: "tpa_feed", threshold: "discrepancy_rate_above_2_percent" },
    ],
    steps: [
      { id: "1", type: "action", action: "establish_data_fields", label: "Define canonical data fields for leave records: employee ID, hire date, hours, work location, leave type, certification status, balance", order: 1 },
      { id: "2", type: "action", action: "configure_sync_schedule", label: "Configure real-time vs. batch sync schedule; define authoritative source for each data field (HRIS vs. TPA)", order: 2 },
      { id: "3", type: "action", action: "establish_discrepancy_protocol", label: "Establish discrepancy resolution protocol: define acceptable variance, escalation path, resolution timeline", order: 3 },
      { id: "4", type: "action", action: "test_eligibility_sync", label: "Test eligibility sync with sample employee population (10%); validate tenure, hours, worksite coverage calculations", order: 4 },
      { id: "5", type: "condition", condition: "eligibility_discrepancy_detected", label: "Has TPA flagged eligibility discrepancy?", trueNext: "6", falseNext: "8", order: 5 },
      { id: "6", type: "action", action: "investigate_discrepancy", label: "Identify root cause: data entry error / different hours calculation methodology / worksite count / service date discrepancy", order: 6 },
      { id: "7", type: "action", action: "resolve_discrepancy", label: "Resolve with correction to authoritative source; document resolution and prevent recurrence", order: 7 },
      { id: "8", type: "action", action: "monitor_ongoing", label: "Monthly reconciliation report: TPA approvals vs. employer eligibility records; flag divergence >1%", order: 8 },
    ],
    approvalConfig: { requiredApprovers: ["leave_admin_manager", "hris_admin"], autoApproveAfterHours: 24 },
    confidentiality: "internal",
    estimatedDuration: "2-4 weeks for initial setup; ongoing monitoring",
    tags: ["TPA", "leave-administration", "data-sync", "eligibility", "integration", "discrepancy"],
    metadata: { jurisdiction: "varies", lastReviewed: "2024-01-01", nextReview: "2025-01-01" },
    agentId: null,
  },
  {
    organizationId: ORG,
    name: "DOL FMLA Complaint Investigation — Response Protocol",
    description: "Procedure for responding to a Department of Labor Wage and Hour Division (DOL WHD) complaint or investigation related to FMLA compliance. Covers file audit, attorney engagement, document production, and response preparation.",
    industry: "legal_services",
    category: "regulatory-response",
    triggerType: "manual",
    triggerConditions: [
      { type: "event", event: "dol_complaint_received", source: "legal_tracker", threshold: "any_fmla_complaint" },
      { type: "event", event: "dol_investigation_notice", source: "legal_tracker", threshold: "any_whd_notice" },
    ],
    steps: [
      { id: "1", type: "action", action: "attorney_engagement", label: "Immediately engage employment/FMLA attorney; all communications through counsel from this point forward", order: 1 },
      { id: "2", type: "action", action: "preserve_records", label: "Implement litigation hold: preserve all FMLA records for complainant and similarly situated employees (3-year retention minimum)", order: 2 },
      { id: "3", type: "action", action: "fmla_file_audit", label: "Attorney-directed privileged audit of FMLA administration: eligibility determinations, notice timeliness, certification process, designation decisions, return-to-work handling", order: 3 },
      { id: "4", type: "action", action: "identify_systemic_issues", label: "Assess whether complaint reflects isolated incident or systemic compliance failure; determine scope of potential exposure", order: 4 },
      { id: "5", type: "action", action: "prepare_document_production", label: "Prepare document production per DOL request: FMLA policy, employee notices, certifications, designation notices, relevant communications", order: 5 },
      { id: "6", type: "action", action: "interview_witnesses", label: "Attorney interviews HR personnel and managers involved in leave administration (protect under attorney-client privilege)", order: 6 },
      { id: "7", type: "action", action: "calculate_exposure", label: "Calculate potential exposure: back wages, liquidated damages (2×), reinstatement obligations, civil money penalties", order: 7 },
      { id: "8", type: "action", action: "prepare_response", label: "Prepare and submit response to DOL through attorney; include remediation steps taken to demonstrate good faith", order: 8 },
      { id: "9", type: "action", action: "remediation_plan", label: "Implement remediation plan for any confirmed violations; document corrective actions for DOL cooperation credit", order: 9 },
    ],
    approvalConfig: { requiredApprovers: ["senior_employment_counsel", "hr_leadership"], autoApproveAfterHours: null },
    confidentiality: "privileged",
    estimatedDuration: "4-12 weeks depending on scope",
    tags: ["DOL", "FMLA-investigation", "WHD", "regulatory-response", "attorney-required", "compliance-audit"],
    metadata: { jurisdiction: "federal", lastReviewed: "2024-01-01", nextReview: "2025-01-01" },
    agentId: null,
  },
];

// ── POLICIES (6) ─────────────────────────────────────────────────────────────

const POLICIES = [
  {
    organizationId: ORG,
    name: "FMLA Compliance & Administration Policy",
    description: "Governs agent compliance with FMLA procedural requirements: notice deadlines, eligibility determinations, certification management, designation decisions, and anti-interference/retaliation safeguards.",
    domain: "content_boundaries",
    status: "active",
    version: 1,
    policyJson: {
      rules: [
        { id: "fmla-1", description: "Issue FMLA eligibility notice within 5 business days of learning of qualifying need; flag and escalate any delay", severity: "CRITICAL", enforcement: "hard_block" },
        { id: "fmla-2", description: "Issue FMLA designation notice within 5 business days of receiving sufficient designation information", severity: "CRITICAL", enforcement: "hard_block" },
        { id: "fmla-3", description: "Never advise employer to rescind FMLA designation of qualifying leave without attorney review", severity: "CRITICAL", enforcement: "hard_block" },
        { id: "fmla-4", description: "Require medical certification only for FMLA-qualifying reasons; never require diagnosis disclosure", severity: "HIGH", enforcement: "require_confirmation" },
        { id: "fmla-5", description: "Always present both interference and retaliation risk analysis when employer considers action against employee on or returning from FMLA", severity: "CRITICAL", enforcement: "require_confirmation" },
        { id: "fmla-6", description: "Cite 29 C.F.R. Part 825 for all FMLA procedural guidance", severity: "MEDIUM", enforcement: "soft_warn" },
      ],
      confidentiality: "This agent handles sensitive medical certification information. All medical information must be kept separate from general HR files.",
      citation_requirements: ["29 U.S.C. §§ 2601-2654", "29 C.F.R. Part 825", "DOL WHD Opinion Letters"],
      escalation_policy: "Any FMLA-designated employee who receives adverse action within 12 months of leave must be escalated to Littler attorney immediately.",
    },
    tags: ["FMLA", "leave-compliance", "notice", "designation", "interference"],
    effectiveDate: new Date().toISOString(),
    scopeId: null,
    scopeType: "agent",
  },
  {
    organizationId: ORG,
    name: "ADA Reasonable Accommodation Compliance Policy",
    description: "Ensures agent guidance on ADA accommodations follows legally required interactive process, avoids undue hardship claims without analysis, and prevents discriminatory accommodation denials. Covers ADAAA expansive disability definition.",
    domain: "content_boundaries",
    status: "active",
    version: 1,
    policyJson: {
      rules: [
        { id: "ada-1", description: "Never recommend denying an accommodation request without first exhausting interactive process and consulting attorney", severity: "CRITICAL", enforcement: "hard_block" },
        { id: "ada-2", description: "Apply post-ADAAA expansive disability definition; do not require that impairment substantially limits work specifically", severity: "CRITICAL", enforcement: "hard_block" },
        { id: "ada-3", description: "Mandatory disclaimer on all accommodation denial guidance: 'Denial letters require attorney review before sending'", severity: "CRITICAL", enforcement: "hard_block" },
        { id: "ada-4", description: "Do not recommend elimination of essential job functions as accommodation; only marginal functions may be restructured", severity: "HIGH", enforcement: "require_confirmation" },
        { id: "ada-5", description: "Include ADA leave as accommodation analysis whenever FMLA leave exhaustion is approached", severity: "HIGH", enforcement: "require_confirmation" },
        { id: "ada-6", description: "Distinguish between leave as accommodation (no definite return) and leave as last resort (after all other accommodations explored)", severity: "MEDIUM", enforcement: "soft_warn" },
      ],
      confidentiality: "Medical information supporting accommodation requests is strictly confidential under ADA §12112(d). Separate medical files required.",
      citation_requirements: ["42 U.S.C. §§ 12101-12213", "29 C.F.R. Part 1630", "EEOC Enforcement Guidance October 2002"],
      escalation_policy: "All accommodation denial recommendations require Littler attorney sign-off. Leave-as-accommodation analysis at FMLA exhaustion is mandatory.",
    },
    tags: ["ADA", "accommodation", "interactive-process", "disability", "undue-hardship"],
    effectiveDate: new Date().toISOString(),
    scopeId: null,
    scopeType: "agent",
  },
  {
    organizationId: ORG,
    name: "Pregnancy Workers Fairness Act (PWFA) Compliance Policy",
    description: "Governs agent compliance with PWFA requirements effective June 27, 2023. Ensures pregnancy-related accommodation obligations are applied broadly regardless of whether condition meets ADA disability standard.",
    domain: "content_boundaries",
    status: "active",
    version: 1,
    policyJson: {
      rules: [
        { id: "pwfa-1", description: "Apply PWFA to all employers with 15+ employees for any limitation related to pregnancy, childbirth, or related medical condition — even if not ADA disability", severity: "CRITICAL", enforcement: "hard_block" },
        { id: "pwfa-2", description: "Do not advise requiring employee to take leave when another reasonable accommodation is available under PWFA", severity: "CRITICAL", enforcement: "hard_block" },
        { id: "pwfa-3", description: "Include EEOC-enumerated PWFA accommodations in all pregnancy accommodation analyses (per April 2024 Final Rule)", severity: "HIGH", enforcement: "require_confirmation" },
        { id: "pwfa-4", description: "PWFA covers 'related medical conditions' broadly — hyperemesis gravidarum, gestational diabetes, postpartum conditions, lactation — flag any pregnancy-adjacent condition for PWFA analysis", severity: "HIGH", enforcement: "require_confirmation" },
        { id: "pwfa-5", description: "Effective date for PWFA: June 27, 2023; apply to all accommodation requests arising after this date for covered employers", severity: "MEDIUM", enforcement: "soft_warn" },
      ],
      citation_requirements: ["42 U.S.C. §§ 2000gg - 2000gg-6", "EEOC Final Rule on PWFA (April 15, 2024)", "29 C.F.R. Part 1636"],
      escalation_policy: "Any PWFA accommodation denial requires attorney review. Post-PWFA pregnancy accommodation framework significantly expanded from prior ADA/PDA standard.",
    },
    tags: ["PWFA", "pregnancy", "accommodation", "EEOC", "2023"],
    effectiveDate: new Date().toISOString(),
    scopeId: null,
    scopeType: "agent",
  },
  {
    organizationId: ORG,
    name: "State Paid Family Leave Compliance Policy",
    description: "Ensures agent guidance on state PFL programs (CA PFL, NY PFL, WA PFML, NJ FLI, CO FAMLI, MA PFML, CT PFML, OR PFML, and others) is accurate, current, and identifies concurrent running obligations and benefit coordination rules.",
    domain: "content_boundaries",
    status: "active",
    version: 1,
    policyJson: {
      rules: [
        { id: "spfl-1", description: "Always check for state-specific PFL program in employee's work state before any leave eligibility determination; 14+ state programs active as of 2024", severity: "CRITICAL", enforcement: "hard_block" },
        { id: "spfl-2", description: "Apply Baby Blues concurrent-running exception: FMLA and CFRA run SEPARATELY for baby bonding in California (since Jan 1, 2021 — SB 1383)", severity: "CRITICAL", enforcement: "hard_block" },
        { id: "spfl-3", description: "Note that NJ FLI and FMLA do NOT run concurrently for family care leave — different triggers than federal FMLA", severity: "HIGH", enforcement: "require_confirmation" },
        { id: "spfl-4", description: "State PFL benefit rates, caps, and durations change annually — cite current year rates and flag if data may be outdated", severity: "HIGH", enforcement: "require_confirmation" },
        { id: "spfl-5", description: "State PFL programs are administered by state agencies (EDD, NYDOL, etc.) — employer role is limited to coordination; employees apply directly", severity: "MEDIUM", enforcement: "soft_warn" },
        { id: "spfl-6", description: "Flag when multiple state PFL programs may apply (multi-state employees, employees who recently moved)", severity: "MEDIUM", enforcement: "soft_warn" },
      ],
      citation_requirements: ["CA UI Code §3300+", "NY WCL Art. 9-A", "RCW 50A", "N.J.S.A. 43:21-27", "C.R.S. §8-13.3-501+", "M.G.L. c. 175M"],
      escalation_policy: "Multi-state employee PFL coordination (employee working in multiple PFL states) requires attorney review of concurrent benefit obligations.",
    },
    tags: ["PFL", "state-leave", "CFRA", "NY-PFL", "WA-PFML", "baby-bonding", "benefit-coordination"],
    effectiveDate: new Date().toISOString(),
    scopeId: null,
    scopeType: "agent",
  },
  {
    organizationId: ORG,
    name: "State & Local Mandatory Sick Leave Policy",
    description: "Governs agent compliance with the patchwork of 15+ state and 80+ municipal mandatory paid sick leave laws. Ensures the most protective standard is applied for each employee worksite location.",
    domain: "content_boundaries",
    status: "active",
    version: 1,
    policyJson: {
      rules: [
        { id: "msl-1", description: "Apply the most protective sick leave standard (state vs. local vs. employer policy) for each employee's work location", severity: "CRITICAL", enforcement: "hard_block" },
        { id: "msl-2", description: "Check for local ordinance in addition to state law for any California, Illinois, New York, and Washington employee — municipal ordinances may exceed state requirements", severity: "HIGH", enforcement: "require_confirmation" },
        { id: "msl-3", description: "Include domestic violence/sexual assault safe leave as covered usage reason in all jurisdictions that mandate it (CA, NY, IL, NJ, WA, and others)", severity: "HIGH", enforcement: "require_confirmation" },
        { id: "msl-4", description: "Note Texas municipal sick leave ordinances (Dallas, Austin, San Antonio) are currently enjoined — advise employer to check current enforcement status", severity: "MEDIUM", enforcement: "soft_warn" },
        { id: "msl-5", description: "Advise employers that sick leave records must be maintained for minimum 3 years (most jurisdictions) and provided to employee on request", severity: "MEDIUM", enforcement: "soft_warn" },
      ],
      citation_requirements: ["State sick leave statutes", "Municipal codes", "Agency enforcement guidance by jurisdiction"],
      escalation_policy: "Employer operating in 5+ PSL jurisdictions should have dedicated PSL compliance review with Littler attorney annually.",
    },
    tags: ["sick-leave", "PSL", "municipal", "local-ordinance", "multi-jurisdiction"],
    effectiveDate: new Date().toISOString(),
    scopeId: null,
    scopeType: "agent",
  },
  {
    organizationId: ORG,
    name: "USERRA Military Leave Compliance Policy",
    description: "Ensures agent guidance on military leave under USERRA and related state military leave laws is accurate. Covers reemployment rights, benefit continuation, and the interaction of military leave with FMLA and state leave laws.",
    domain: "content_boundaries",
    status: "active",
    version: 1,
    policyJson: {
      rules: [
        { id: "userra-1", description: "USERRA applies to all employers regardless of size — no minimum employee threshold", severity: "CRITICAL", enforcement: "hard_block" },
        { id: "userra-2", description: "Reemployment rights: employee entitled to reemployment in escalator position (same position with seniority, benefits accrued as if continuously employed)", severity: "CRITICAL", enforcement: "hard_block" },
        { id: "userra-3", description: "USERRA leave and FMLA entitlements are SEPARATE and independent — military leave does not reduce FMLA entitlement unless otherwise specified", severity: "HIGH", enforcement: "require_confirmation" },
        { id: "userra-4", description: "Health insurance continuation: employee may elect to continue coverage at own cost for up to 24 months during military service", severity: "HIGH", enforcement: "require_confirmation" },
        { id: "userra-5", description: "State military leave laws may provide additional rights — check state law for employees in National Guard or state active duty", severity: "MEDIUM", enforcement: "soft_warn" },
        { id: "userra-6", description: "Anti-discrimination: no discrimination in initial employment, reemployment, retention, promotion, or any benefit of employment based on uniformed service", severity: "HIGH", enforcement: "require_confirmation" },
      ],
      citation_requirements: ["38 U.S.C. §§ 4301-4335", "20 C.F.R. Part 1002", "State military leave statutes"],
      escalation_policy: "Failure to reemploy returning servicemember requires immediate attorney review. USERRA has no statute of limitations for willful violations.",
    },
    tags: ["USERRA", "military-leave", "reemployment", "veteran", "national-guard"],
    effectiveDate: new Date().toISOString(),
    scopeId: null,
    scopeType: "agent",
  },
];

// ── GOLDEN DATASET ────────────────────────────────────────────────────────────

const GOLDEN_DATASET = {
  organizationId: ORG,
  name: "Leave & Accommodation Management Agent — Golden Dataset",
  description: "Curated evaluation dataset for LIT-AGT-010. Covers multi-state leave eligibility determinations, concurrent leave stacking scenarios, ADA/PWFA interactive process analyses, leave notice requirement identification, intermittent leave balance calculations, and complex leave overlap edge cases.",
  industry: "legal_services",
  useCase: "Leave & Accommodation Management",
  version: "1.0",
  scenarioCategories: { edgeCases: 2, happyPath: 1, adversarial: 0, complianceCritical: 3 },
  qualityCoverage: 92,
  coverageDimensions: [
    "Multi-jurisdiction FMLA eligibility (50-state matrix)",
    "California CFRA Baby Blues amendment (FMLA + CFRA separation)",
    "State PFL benefit rate accuracy and concurrent running rules",
    "ADA interactive process completeness and documentation",
    "PWFA accommodation identification (post-April 2024 EEOC rule)",
    "Intermittent FMLA balance calculation (rolling backward method)",
    "Leave notice content and deadline compliance by jurisdiction",
    "Concurrent leave stacking: FMLA + state FMLA + PFL + SDI",
    "Military leave (USERRA) + FMLA coordination",
    "ADA leave post-FMLA exhaustion trigger",
  ],
  benchmarkRange: { low: 88, high: 97 },
  contributors: [],
  growthHistory: [],
  status: "active",
  tags: ["leave-management", "FMLA", "ADA", "PWFA", "CFRA", "PFL", "accommodation", "LIT-AGT-010"],
  aiGenerated: false,
  performanceBenchmarks: {
    leaveEligibilityAccuracy: { target: 0.95, description: "Correct eligibility determination under all applicable laws vs. Littler attorney-reviewed ground truth" },
    concurrentLeaveAccuracy: { target: 0.97, description: "Correct concurrent running determination and balance calculations vs. manual calculation" },
    noticeRequirementAccuracy: { target: 0.95, description: "Identifies all required notices by jurisdiction and leave type" },
    accommodationAppropriateness: { target: 0.90, description: "Recommended accommodations rated appropriate by Littler leave practice attorneys" },
    interactiveProcessCompleteness: { target: 0.93, description: "Interactive process guidance includes all legally required elements" },
  },
  dataRecordCount: 3500,
};

const TEST_CASES = [
  {
    name: "California Birth — FMLA + CFRA + PDL + PFL Stacking Analysis",
    inputScenario: "Maria is a California-based employee who has been employed for 2 years and works 40 hours/week. She is pregnant and has been disabled by pregnancy complications for 6 weeks prior to her due date. Her employer has 75 employees in California. She gave birth 2 weeks ago and wishes to bond with her newborn. Determine her complete leave entitlement, the correct sequence and stacking of all applicable leaves, and any state benefits she may claim.",
    expectedBehavior: "Agent must: (1) determine FMLA eligibility (yes — 12 months, 1,250+ hours, 50+ employees within 75 miles); (2) apply CA PDL for pregnancy disability (up to 4 months before/during/after delivery, runs concurrent with FMLA — reduces FMLA to 6 weeks remaining); (3) apply CA CFRA Baby Blues Amendment — CFRA baby bonding runs SEPARATELY from FMLA (12 additional weeks); (4) CA PFL for bonding (8 weeks benefit, may run concurrent with CFRA if employer requires); (5) identify CA SDI for pregnancy disability period; (6) correct total: up to 24+ weeks job-protected leave possible (PDL 4 months + CFRA 12 weeks separately)",
    evaluationCriteria: [
      "Correctly applies FMLA/PDL concurrent running during pregnancy disability period",
      "Identifies Baby Blues Amendment: CFRA baby bonding is SEPARATE from FMLA (not concurrent)",
      "Correctly sequences PDL → FMLA (concurrent) → CFRA baby bonding (separate = additional 12 weeks)",
      "Identifies CA PFL as wage replacement during CFRA (employer may require concurrent running)",
      "Identifies CA SDI as wage replacement during PDL and non-CA-PFL disability periods",
      "Calculates total potential leave: PDL (17.3 wks) + CFRA bonding (12 wks) = ~29 weeks job-protected",
      "Advises employee to apply for EDD benefits (SDI/PFL) directly — employer coordinates, does not pay",
    ],
    rubricScoring: {
      dimensions: [
        { name: "PDL/FMLA Concurrent Application", weight: 0.25, passingScore: 1.0 },
        { name: "Baby Blues CFRA Separation", weight: 0.30, passingScore: 1.0 },
        { name: "State Benefit Identification", weight: 0.20, passingScore: 0.8 },
        { name: "Total Entitlement Calculation", weight: 0.15, passingScore: 0.9 },
        { name: "Sequencing Accuracy", weight: 0.10, passingScore: 0.9 },
      ],
    },
    category: "complianceCritical",
    difficulty: "complex",
    jurisdiction: "California",
    sourceDocuments: ["CFRA §12945.2", "CA PDL Gov't Code §12945", "SB 1383 Baby Blues (2021)", "CA PFL UI Code §3300+"],
  },
  {
    name: "ADA Post-FMLA Leave Exhaustion — Interactive Process Trigger",
    inputScenario: "James is a manufacturing plant supervisor in Ohio (employer has 200 employees) who has used all 12 weeks of FMLA leave for his own serious health condition (degenerative disc disease). His doctor has released him to return but with permanent restrictions: no lifting over 20 lbs, no standing for more than 2 hours continuously. His job description requires lifting up to 50 lbs and standing for 6-8 hours per shift. His employer is considering terminating him because he cannot perform his job. Is termination appropriate?",
    expectedBehavior: "Agent must: (1) identify that FMLA exhaustion triggers mandatory ADA interactive process analysis; (2) analyze whether degenerative disc disease is an ADA disability (yes — substantially limits major life activities of lifting, standing); (3) identify need to assess whether lifting and standing are essential functions (job description indicates yes, but must verify); (4) identify potential accommodations: ergonomic support, modified shifts, sit-stand workstation, reassignment to office position, light duty if available; (5) advise that termination without completing ADA interactive process is UNLAWFUL; (6) flag that 'no restrictions' return-to-work policy is unlawful under ADA",
    evaluationCriteria: [
      "Correctly identifies FMLA exhaustion as trigger for ADA interactive process",
      "Applies ADAAA expansive disability standard to degenerative disc disease",
      "Distinguishes essential functions (require verification against actual duties, not just job description)",
      "Identifies at least 4 potential reasonable accommodations to explore",
      "Explicitly states termination without interactive process violates ADA §12112(b)(5)",
      "Identifies 'no restrictions' return-to-work policy as independently unlawful",
      "Recommends attorney consultation before any adverse action",
    ],
    rubricScoring: {
      dimensions: [
        { name: "FMLA/ADA Transition Recognition", weight: 0.30, passingScore: 1.0 },
        { name: "Disability Determination Accuracy", weight: 0.20, passingScore: 0.9 },
        { name: "Accommodation Identification", weight: 0.25, passingScore: 0.8 },
        { name: "Legal Risk Assessment", weight: 0.15, passingScore: 1.0 },
        { name: "Actionable Guidance", weight: 0.10, passingScore: 0.9 },
      ],
    },
    category: "complianceCritical",
    difficulty: "complex",
    jurisdiction: "Ohio (Federal ADA)",
    sourceDocuments: ["42 U.S.C. §§ 12101-12213", "29 C.F.R. Part 1630", "EEOC Leave as Accommodation Guidance 2016"],
  },
  {
    name: "Intermittent FMLA Balance — Rolling Backward Year Method",
    inputScenario: "An employer uses the rolling backward 12-month calculation method for FMLA. Employee Sarah works 40 hours/week. Her FMLA for intermittent migraine leave was approved starting March 1, 2023. Her leave usage: March 2023: 16 hours; April: 8 hours; May: 24 hours; June: 16 hours; July: 0; Aug: 24 hours; Sept: 8 hours; Oct: 16 hours; Nov: 24 hours; Dec: 8 hours; Jan 2024: 24 hours; Feb 2024: 16 hours. On March 5, 2024, she requests 8 hours of intermittent FMLA leave. How much FMLA does she have available on March 5, 2024?",
    expectedBehavior: "Agent must: (1) confirm rolling backward method means look at prior 52 weeks from March 5, 2024 — i.e., March 5, 2023 to March 4, 2024; (2) identify leave in that window: March 2023 (16 hrs, partial: only March 5-31 = ~13.3 hrs), April: 8 hrs, May: 24 hrs, June: 16 hrs, July: 0, Aug: 24 hrs, Sept: 8 hrs, Oct: 16 hrs, Nov: 24 hrs, Dec: 8 hrs, Jan 2024: 24 hrs, Feb 2024: 16 hrs; (3) calculate total used in window; (4) FMLA entitlement = 480 hrs (12 weeks × 40 hrs/wk); (5) determine available balance; (6) confirm whether 8-hour request can be approved",
    evaluationCriteria: [
      "Correctly explains rolling backward method: 52 weeks back from the requested leave date",
      "Accurately identifies which hours in the prior 52-week period count",
      "Correctly handles partial month at the beginning of the period",
      "Correctly calculates 12-week entitlement as hours based on normal weekly schedule",
      "Arrives at correct remaining balance (approximately 303-309 hours depending on day calculation)",
      "Confirms 8-hour request can be approved",
      "Notes employer must provide FMLA designation notice within 5 business days",
    ],
    rubricScoring: {
      dimensions: [
        { name: "Rolling Period Calculation", weight: 0.30, passingScore: 1.0 },
        { name: "Hours-to-Weeks Conversion", weight: 0.20, passingScore: 1.0 },
        { name: "Balance Accuracy", weight: 0.35, passingScore: 0.95 },
        { name: "Approval Determination", weight: 0.15, passingScore: 1.0 },
      ],
    },
    category: "complianceCritical",
    difficulty: "medium",
    jurisdiction: "Federal (FMLA)",
    sourceDocuments: ["29 C.F.R. §825.200(b)(4)", "29 C.F.R. §825.205"],
  },
  {
    name: "PWFA Pregnancy Accommodation — Post-April 2024 EEOC Rule",
    inputScenario: "Lisa is a warehouse order picker in a facility with 50 employees in Texas. She is 6 months pregnant and provides her employer a note from her OB/GYN stating she should avoid lifting more than 25 lbs, take a restroom break every 2 hours, and should not stand for more than 4 consecutive hours. Her employer says: (1) the job requires lifting 50 lbs routinely so it's an essential function she cannot perform, (2) they do not have a light duty program, and (3) they are telling her to go on unpaid leave. Is the employer's response compliant with the PWFA?",
    expectedBehavior: "Agent must: (1) identify PWFA applies (15+ employees, pregnancy-related limitations); (2) identify the PWFA's key departure from ADA: employer CANNOT require leave if another accommodation is possible; (3) identify EEOC-enumerated PWFA accommodations that apply: restroom breaks (must be provided per EEOC rule), standing limitation (may require seating or schedule modification), lifting restriction (must explore — even without formal light duty program); (4) employer cannot defend on 'no light duty program' ground — PWFA does not require existing program; (5) advise PWFA violation: directing pregnant employee to take leave when accommodations are available; (6) identify specific EEOC final rule (April 15, 2024) provisions",
    evaluationCriteria: [
      "Applies PWFA correctly (15+ employees; effective June 2023)",
      "Identifies core PWFA rule: cannot require leave if another accommodation exists",
      "Identifies EEOC-enumerated accommodations: restroom breaks, sitting, lifting modification",
      "Refutes 'no light duty program' defense — PWFA does not require existing program",
      "Identifies employer's response as PWFA violation",
      "Cites EEOC Final Rule on PWFA (April 15, 2024) and 29 C.F.R. Part 1636",
      "Recommends employer immediately re-engage in interactive process",
    ],
    rubricScoring: {
      dimensions: [
        { name: "PWFA Coverage Identification", weight: 0.20, passingScore: 1.0 },
        { name: "Leave Prohibition Accuracy", weight: 0.30, passingScore: 1.0 },
        { name: "EEOC Enumerated Accommodations", weight: 0.25, passingScore: 0.9 },
        { name: "Violation Analysis", weight: 0.15, passingScore: 1.0 },
        { name: "Remediation Guidance", weight: 0.10, passingScore: 0.8 },
      ],
    },
    category: "complianceCritical",
    difficulty: "complex",
    jurisdiction: "Texas (Federal PWFA)",
    sourceDocuments: ["42 U.S.C. §§ 2000gg-2000gg-6", "EEOC Final Rule April 15, 2024", "29 C.F.R. Part 1636"],
  },
  {
    name: "Multi-State Employee Leave — New York + New Jersey Intersection",
    inputScenario: "David is a software engineer who lives in New Jersey and works remotely but is technically employed at a New York office (payroll processed in NY). His employer has 60 employees. He needs 12 weeks of leave to bond with his newborn child. Assess his complete leave entitlements under federal law, New York PFL, and New Jersey FLI, and explain any concurrent running rules.",
    expectedBehavior: "Agent must: (1) FMLA eligibility: check 50+ employees within 75-mile radius of his worksite — remote worker worksite is home office or established worksite per employer policy; (2) NY PFL: 12 weeks at 67% SAWW (eligible as NY payroll employee — NY PFL contributions made); (3) NJ FLI: 12 weeks at 85% wages — NJ FLI and FMLA do NOT run concurrently for family leave; (4) cannot 'double dip' on state benefits simultaneously; (5) coordination: FMLA may run with NY PFL; NJ FLI may extend bonding after FMLA/NY PFL or run concurrently with FMLA depending on jurisdictional assignment; (6) determine controlling jurisdiction for leave purposes",
    evaluationCriteria: [
      "Identifies complexity of multi-state remote worker leave analysis",
      "Correctly states NJ FLI and federal FMLA do NOT run concurrently for family care",
      "Identifies NY PFL rights (NY payroll employee)",
      "Identifies NJ FLI rights (NJ resident)",
      "Advises on determination of controlling jurisdiction for leave purposes",
      "Notes potential for sequential entitlements (not just concurrent)",
      "Escalates for attorney review given multi-state complexity",
    ],
    rubricScoring: {
      dimensions: [
        { name: "Multi-State Complexity Recognition", weight: 0.20, passingScore: 0.9 },
        { name: "NJ FLI/FMLA Non-Concurrent Rule", weight: 0.30, passingScore: 1.0 },
        { name: "State PFL Identification", weight: 0.25, passingScore: 0.9 },
        { name: "Escalation Appropriateness", weight: 0.15, passingScore: 1.0 },
        { name: "Practical Guidance", weight: 0.10, passingScore: 0.8 },
      ],
    },
    category: "edgeCase",
    difficulty: "complex",
    jurisdiction: "New York / New Jersey (Multi-State)",
    sourceDocuments: ["NY WCL Art. 9-A", "N.J.S.A. 34:11B-1+", "29 C.F.R. §825.111"],
  },
  {
    name: "FMLA Notice Compliance — Happy Path",
    inputScenario: "An employee in Texas (employer has 100 employees, all at same worksite) calls in on Monday morning saying she cannot come to work because her child has been hospitalized. The HR manager asks: 'Do I need to give her any paperwork today? What is the process for this leave?' Provide the complete FMLA notice compliance workflow from first notice through designation.",
    expectedBehavior: "Agent must provide: (1) confirm this is likely FMLA-qualifying (child's serious health condition — hospitalization satisfies §825.114); (2) employer's duty: provide Notice of Eligibility and Rights (WH-381) within 5 business days of today (or sooner if leave is foreseeable — here it is not); (3) check employee eligibility: 12 months + 1,250 hours + 50+ employees at worksite; (4) provide medical certification form WH-380-F (family member's serious health condition); (5) give employee 15 calendar days to return certification; (6) designation: within 5 business days of receiving sufficient information; (7) advise on substitution of paid leave during FMLA",
    evaluationCriteria: [
      "Correctly identifies hospitalized child as qualifying serious health condition",
      "States 5-business-day deadline for Notice of Eligibility",
      "Identifies correct form: WH-380-F (family member, not employee)",
      "States 15-calendar-day deadline for employee to return certification",
      "States 5-business-day deadline for Designation Notice",
      "Addresses paid leave substitution obligation",
      "Advises on documentation to retain",
    ],
    rubricScoring: {
      dimensions: [
        { name: "Qualifying Event Recognition", weight: 0.20, passingScore: 1.0 },
        { name: "Notice Deadline Accuracy", weight: 0.30, passingScore: 1.0 },
        { name: "Correct Form Identification", weight: 0.20, passingScore: 1.0 },
        { name: "Process Completeness", weight: 0.20, passingScore: 0.9 },
        { name: "Paid Leave Guidance", weight: 0.10, passingScore: 0.8 },
      ],
    },
    category: "happyPath",
    difficulty: "basic",
    jurisdiction: "Texas (Federal FMLA)",
    sourceDocuments: ["29 C.F.R. §825.300", "29 C.F.R. §825.305-307", "WH-381", "WH-380-F"],
  },
];

// ── OUTCOME CONTRACT ─────────────────────────────────────────────────────────

const OUTCOME = {
  organizationId: ORG,
  name: "Leave & Accommodation Management Agent — Outcome Contract",
  description: "Business objectives, KPIs, and SLAs governing the Leave & Accommodation Management Agent (LIT-AGT-010). Targets multi-jurisdiction leave eligibility accuracy, interactive process guidance quality, notice compliance, and litigation risk reduction for Littler clients.",
  version: "1.0",
  status: "active",
  industry: "legal_services",
  agentCode: "LIT-AGT-010",
  practiceArea: "Leave & Accommodation",
  productMapping: "Littler onDemand + GPS",
  objectives: [
    "Achieve 95%+ accuracy in leave eligibility determinations across all 50 states and 500+ municipalities",
    "Guide employers through legally compliant ADA/PWFA interactive processes with complete documentation",
    "Reduce leave-related litigation exposure through proactive compliance identification",
    "Ensure 100% compliance with FMLA notice deadlines and content requirements",
    "Identify concurrent leave stacking opportunities and obligations for maximum employee entitlement",
  ],
  successCriteria: {
    primary: "Leave eligibility determination accuracy ≥ 95% vs. attorney-reviewed ground truth",
    secondary: "Interactive process guidance completeness ≥ 93%; FMLA notice accuracy ≥ 95%",
    guardrails: "Zero instances of recommending leave denial without attorney consultation; zero unsupported accommodation denials",
  },
  attributionRules: {
    agentId: null,
    attributionModel: "direct",
    lookbackWindowDays: 90,
    minimumConfidenceThreshold: 0.75,
  },
  targetMetrics: {
    leaveEligibilityAccuracy: 0.95,
    accommodationGuidelineAdherence: 0.93,
    noticeComplianceAccuracy: 0.95,
    litigationRiskReductionRate: 0.55,
    timeToLeaveEligibilityDetermination: 2,
  },
  slaConfig: {
    responseTimeMs: 8000,
    availabilityTarget: 0.995,
    escalationResponseTime: 900,
  },
  criticalPath: ["multi_law_eligibility", "concurrent_tracking", "interactive_process", "notice_generation"],
  roiEstimate: {
    averageLitigationCostReduction: 280000,
    leaveAdminEfficiencyGain: 45000,
    litigationRiskReduction: 0.55,
    complianceAuditCostSavings: 18000,
  },
};

const KPIS = [
  {
    name: "Leave Eligibility Determination Accuracy",
    unit: "percent",
    baseline: 78,
    target: 95,
    targetOperator: "gte",
    weight: 0.22,
    slaThreshold: 90,
    breachLevel: "critical",
    confidence: 0.90,
    trend: "improving",
    expression: "(correct_eligibility_determinations / total_determinations) * 100",
    measurement: "Validated against attorney-reviewed ground truth dataset covering all 50 states + 100+ municipalities, 3,500+ scenarios",
  },
  {
    name: "Concurrent Leave Calculation Accuracy",
    unit: "percent",
    baseline: 82,
    target: 97,
    targetOperator: "gte",
    weight: 0.18,
    slaThreshold: 92,
    breachLevel: "critical",
    confidence: 0.93,
    trend: "stable",
    expression: "(correct_concurrent_calculations / total_concurrent_calculations) * 100",
    measurement: "Compared against manual calculation by Littler leave attorneys on representative sample of 300 multi-law scenarios per quarter",
  },
  {
    name: "FMLA Notice Compliance Accuracy",
    unit: "percent",
    baseline: 88,
    target: 98,
    targetOperator: "gte",
    weight: 0.15,
    slaThreshold: 94,
    breachLevel: "critical",
    confidence: 0.92,
    trend: "stable",
    expression: "(compliant_notice_determinations / total_notice_determinations) * 100",
    measurement: "Validated against 29 C.F.R. §825.300 notice requirements checklist applied to generated notice guidance",
  },
  {
    name: "Interactive Process Guidance Completeness",
    unit: "percent",
    baseline: 75,
    target: 93,
    targetOperator: "gte",
    weight: 0.15,
    slaThreshold: 86,
    breachLevel: "high",
    confidence: 0.88,
    trend: "improving",
    expression: "(guidance_with_all_required_elements / total_interactive_process_responses) * 100",
    measurement: "Reviewed against 12-element interactive process completeness checklist by Littler ADA practice attorneys",
  },
  {
    name: "Accommodation Appropriateness Rate",
    unit: "percent",
    baseline: 80,
    target: 92,
    targetOperator: "gte",
    weight: 0.12,
    slaThreshold: 85,
    breachLevel: "high",
    confidence: 0.85,
    trend: "improving",
    expression: "(appropriate_accommodations_identified / total_accommodation_analyses) * 100",
    measurement: "Attorney rating of accommodation recommendations on 5-point scale; 4+ rated as 'appropriate'; benchmarked against JAN database",
  },
  {
    name: "Litigation Risk Reduction Rate",
    unit: "percent",
    baseline: 45,
    target: 55,
    targetOperator: "gte",
    weight: 0.10,
    slaThreshold: 48,
    breachLevel: "medium",
    confidence: 0.75,
    trend: "improving",
    expression: "((baseline_litigation_rate - post_agent_litigation_rate) / baseline_litigation_rate) * 100",
    measurement: "Year-over-year comparison of leave-related litigation filings per 1,000 employees at clients using agent vs. control group",
  },
  {
    name: "Leave Eligibility Determination Speed",
    unit: "seconds",
    baseline: 900,
    target: 60,
    targetOperator: "lte",
    weight: 0.05,
    slaThreshold: 180,
    breachLevel: "medium",
    confidence: 0.95,
    trend: "improving",
    expression: "avg(determination_response_time_seconds)",
    measurement: "Time from submission of employee facts to delivery of complete leave eligibility matrix",
  },
  {
    name: "Attorney Escalation Precision",
    unit: "percent",
    baseline: 70,
    target: 88,
    targetOperator: "gte",
    weight: 0.03,
    slaThreshold: 78,
    breachLevel: "low",
    confidence: 0.80,
    trend: "stable",
    expression: "(correctly_escalated / total_escalations) * 100",
    measurement: "Proportion of escalations validated by Littler leave practice attorney as requiring attorney review (no false escalations)",
  },
];

// ── SYSTEM PROMPT ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are the Littler Leave & Accommodation Management Agent (LIT-AGT-010), a specialized AI legal guidance system for Littler Mendelson P.C., the world's largest employment and labor law firm.

Your primary purpose is to navigate the complex intersection of federal, state, and local leave laws and disability accommodation obligations on behalf of Littler's employer clients, including HR Directors, Benefits Managers, Compliance Officers, and General Counsel.

CORE LEGAL EXPERTISE:
- Family and Medical Leave Act (FMLA): 29 U.S.C. §§ 2601-2654 / 29 C.F.R. Part 825
  - Eligibility, qualifying reasons, certification, designation, concurrent running, notice deadlines
  - Military caregiver leave (26 weeks), qualifying exigency leave
  - Anti-interference (§2615) and retaliation analysis
- Americans with Disabilities Act / ADAAA: 42 U.S.C. §§ 12101-12213 / 29 C.F.R. Part 1630
  - Expansive disability definition post-ADAAA; interactive process requirements
  - Reasonable accommodation identification; undue hardship analysis
  - Leave as accommodation after FMLA exhaustion
- Pregnancy Workers Fairness Act (PWFA): Effective June 27, 2023; EEOC Final Rule April 15, 2024
  - Broader than ADA; covers limitations related to pregnancy even if not a disability
  - EEOC-enumerated accommodations; prohibition on requiring leave when another accommodation available
- State Paid Family Leave Programs: CA PFL, NY PFL, WA PFML, NJ FLI, CO FAMLI, MA PFML, CT PFML, OR PFML, and 6+ additional state programs
  - Benefit rates, eligibility, concurrent running rules, state agency administration
  - California Baby Blues Amendment (2021): FMLA and CFRA run SEPARATELY for baby bonding
  - New Jersey: FLI and FMLA do NOT run concurrently for family care
- State FMLA Equivalents: California CFRA, New Jersey NJFLA, Oregon OFLA, and 20+ state laws
- Mandatory Paid Sick Leave: 15+ state laws and 80+ municipal ordinances; most protective standard applies
- USERRA: Military leave, reemployment rights (escalator principle), benefit continuation

OPERATING CONSTRAINTS:
- You operate in SUPERVISED autonomy mode: all accommodation denial recommendations, corrective actions against employees on or recently returned from leave, and litigation decisions require Littler attorney sign-off
- NEVER recommend termination or adverse action against an employee using or recently returning from protected leave without attorney consultation
- NEVER draft a final accommodation denial letter — always mark as draft requiring attorney review
- Always cite the specific statute, regulation, or case law supporting each position
- Flag confidence below 75% for attorney review
- Maintain strict medical information confidentiality: medical certification and disability-related information must be kept in separate confidential file

CURRENT YEAR: 2024 — state PFL rates, sick leave caps, and exemption thresholds change annually. Always note when data may require current-year verification.

RESPONSE FRAMEWORK:
Structure all leave/accommodation guidance as:
1. Applicable Laws & Coverage Analysis (employer coverage, employee eligibility)
2. Leave Entitlement Matrix (all applicable laws, durations, benefits, concurrent running)
3. Process Requirements (notices, certification, interactive process steps)
4. Risk Flags (interference/retaliation exposure, notice deadline violations, litigation risk)
5. Required Actions (with deadlines and responsible party)
6. Attorney Escalation Items (if any)

ESCALATION TRIGGERS (MANDATORY):
- FMLA interference: adverse action against employee who used, is using, or recently returned from FMLA
- ADA accommodation denial without completing interactive process
- Employee at FMLA exhaustion without ADA assessment
- Any termination of employee who disclosed disability or requested accommodation
- Leave fraud investigation (before any investigative action)
- EEOC charge or DOL investigation notice`;

const RUNTIME_TASK_PROMPT = `Analyze the leave or accommodation request provided. Identify all applicable federal, state, and local laws based on the employee's work location, employer size, and reason for leave or accommodation need. Determine eligibility under each applicable law, calculate entitlement durations and benefit rates, identify all concurrent running obligations, assess any required notices or certifications, and provide a complete, jurisdiction-specific action plan. For accommodation requests, guide the interactive process with appropriate documentation. Flag all items requiring attorney review.`;

// ══════════════════════════════════════════════════════════════════════════════
// MAIN EXECUTION
// ══════════════════════════════════════════════════════════════════════════════

async function main() {
  console.log("\n════════════════════════════════════════════════════════════════════");
  console.log("  LIT-AGT-010 — Leave & Accommodation Management Agent");
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
    name: "Leave & Accommodation Management Knowledge Base",
    description: "Comprehensive knowledge base for LIT-AGT-010 covering FMLA regulations, ADA/PWFA accommodation guidance, 50-state leave law matrix, local sick leave ordinances, accommodation ideas library, and notice templates. Supports the Leave & Accommodation practice area.",
    industry: "legal_services",
    type: "policy",
    status: "active",
    accessLevel: "private",
    tags: ["FMLA", "ADA", "PWFA", "leave-management", "accommodation", "state-leave", "sick-leave", "LIT-AGT-010"],
  });
  ids.kbId = kbRes.id;
  log(`Knowledge Base → ${kbRes.id}`);

  // ── STEP 3: 6 KB SOURCES ─────────────────────────────────────────────────────
  // Use `title` field (not `name`) — the /sources/text endpoint reads `title`
  // THEN immediately PATCH with the correct display name
  step("3", "11", `Ingesting ${KB_SOURCES.length} knowledge base sources…`);
  ids.kbSourceIds = [];
  for (const src of KB_SOURCES) {
    try {
      const res = await post(`/api/knowledge-bases/${ids.kbId}/sources/text`, {
        title: src.title,   // endpoint reads `title` → stores as `name`
        content: src.content,
        tags: src.tags,
        metadata: src.metadata,
      });
      ids.kbSourceIds.push(res.id);
      // Verify name was stored correctly; PATCH if needed
      if (res.name !== src.displayName) {
        await patch(`/api/knowledge-bases/${ids.kbId}/sources/${res.id}`, { name: src.displayName });
      }
      log(`KB Source: ${src.displayName.slice(0, 65)}`);
    } catch (e) {
      warn(`KB Source (non-fatal): ${src.title.slice(0, 40)} — ${e.message.slice(0, 80)}`);
    }
  }

  // ── STEP 4: 6 RUNBOOKS ───────────────────────────────────────────────────────
  // Created with agentId: null initially; linked after agent creation
  step("4", "11", "Creating 6 runbooks…");
  ids.runbookIds = [];
  for (const rb of RUNBOOKS) {
    const res = await post("/api/runbooks", rb);
    ids.runbookIds.push(res.id);
    log(`Runbook: ${rb.name.slice(0, 65)} → ${res.id}`);
  }

  // ── STEP 5: 6 GOVERNANCE POLICIES ────────────────────────────────────────────
  // Created with scopeId: null initially; linked after agent creation
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
    description: "Navigates the complex intersection of federal, state, and local leave laws and disability accommodation obligations. Maps to Littler's Leave and Accommodation practice area. The agent determines leave eligibility, manages the interactive accommodation process, tracks concurrent leave running, and ensures compliance with FMLA, ADA, PWFA, state paid family leave, and local sick leave ordinances — one of the most complex compliance areas for multi-state employers.",
    owner: "Littler Mendelson P.C.",
    status: "active",
    riskTier: "HIGH",
    autonomyMode: "supervised",
    currentVersion: "1.0.0",
    environment: "staging",
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
      prompt: RUNTIME_TASK_PROMPT,
    },
    blueprintJson: {
      version: "1.0",
      agentCode: "LIT-AGT-010",
      practiceArea: "Leave & Accommodation",
      productMapping: "Littler onDemand + GPS",
      nodes: [
        { id: "intake", type: "trigger", label: "Receive Leave or Accommodation Request" },
        { id: "law_determination", type: "skill", label: "Multi-Law Leave Eligibility Analysis", skillRef: "multi-law-leave-eligibility-skill" },
        { id: "concurrent_tracking", type: "skill", label: "Concurrent Leave Tracking", skillRef: "concurrent-leave-tracker-skill" },
        { id: "accommodation_check", type: "decision", label: "Accommodation Request?" },
        { id: "interactive_process", type: "skill", label: "Interactive Process Guidance", skillRef: "interactive-process-skill" },
        { id: "notice_generation", type: "skill", label: "Notice Generation", skillRef: "leave-notice-generator-skill" },
        { id: "certification_tracking", type: "skill", label: "Certification Management", skillRef: "certification-management-skill" },
        { id: "confidence_gate", type: "decision", label: "Confidence ≥ 75%?" },
        { id: "attorney_review", type: "human_in_loop", label: "Route to Leave & Accommodation Attorney" },
        { id: "analytics", type: "skill", label: "Leave Analytics & Pattern Detection", skillRef: "leave-analytics-skill" },
        { id: "output", type: "output", label: "Deliver Leave/Accommodation Analysis" },
      ],
      edges: [
        { from: "intake", to: "law_determination" },
        { from: "law_determination", to: "concurrent_tracking" },
        { from: "concurrent_tracking", to: "accommodation_check" },
        { from: "accommodation_check", to: "interactive_process", condition: "is_accommodation_request" },
        { from: "accommodation_check", to: "notice_generation", condition: "is_leave_request" },
        { from: "interactive_process", to: "certification_tracking" },
        { from: "notice_generation", to: "certification_tracking" },
        { from: "certification_tracking", to: "confidence_gate" },
        { from: "confidence_gate", to: "attorney_review", condition: "confidence < 75% OR high_risk_flag" },
        { from: "confidence_gate", to: "analytics", condition: "confidence >= 75% AND no_high_risk" },
        { from: "attorney_review", to: "analytics" },
        { from: "analytics", to: "output" },
      ],
    },
    toolsConfig: {
      allowedTools: ["retrieve_kb", "query_jurisdiction_rules", "calculate_leave_balance", "lookup_leave_laws", "generate_document", "score_confidence", "calculate_deadline", "query_analytics"],
      mcpServers: ["littler-gps-mcp", "leave-law-mcp", "hris-integration-mcp", "calendar-mcp", "document-gen-mcp"],
    },
    maxToolIterations: 10,
    complianceTags: ["FMLA", "ADA", "ADAAA", "PWFA", "CFRA", "state-PFL", "local-sick-leave", "USERRA", "EEOC"],
    // preloadedSkills set as [{skillId, loadOrder}] objects — correct format
    preloadedSkills: ids.skillIds.map((skillId, i) => ({ skillId, loadOrder: i })),
    policyBindings: ids.policyIds,
  });
  ids.agentId = agentRes.id;
  log(`Agent: Leave & Accommodation Management Agent → ${agentRes.id}`);

  // ── STEP 7: LINK RUNBOOKS & POLICIES TO AGENT ─────────────────────────────────
  // Set agentId on all runbooks + scopeId on all policies IMMEDIATELY after agent creation
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
      log(`Test Case: ${tc.name.slice(0, 65)}`);
    } catch (e) {
      warn(`Test Case (non-fatal): ${tc.name.slice(0, 40)} — ${e.message.slice(0, 80)}`);
    }
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
    scorerConfig: {
      primary: "attorney_ground_truth",
      secondary: "rule_based_checklist_verification",
      rubric: "rubricScoring",
      citationCheck: true,
      jurisdictionAccuracyCheck: true,
    },
    coverageTags: ["FMLA", "ADA", "PWFA", "CFRA", "state-PFL", "concurrent-leave", "interactive-process", "notice-compliance", "accommodation"],
    environmentThresholds: {
      staging: { minPassRate: 0.88 },
      production: { minPassRate: 0.95 },
    },
    schedule: { frequency: "weekly", dayOfWeek: "Tuesday", time: "06:00 UTC" },
    industry: "legal_services",
    ontologyTags: ["Leave Request", "Leave Entitlement", "Accommodation", "Interactive Process", "Medical Certification", "Leave Balance"],
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

  // Link KB to agent via memoryRagConfig
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

  // Set ontology tags — {conceptId, label, category} format (legal_services concepts)
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
      mkTag("legal_services-transactional-services-regulatory-compliance"),
      mkTag("legal_services-advisory-services-risk-assessment"),
      mkTag("legal_services-advisory-services-legal-opinion"),
      mkTag("legal_services-litigation-services-legal-research"),
      mkTag("legal_services-legal-technology-process-knowledge-management"),
    ];
    await patch(`/api/agents/${ids.agentId}`, { ontologyTags });
    log(`Ontology tags set: ${ontologyTags.map(t => t.label).join(", ")}`);
  } catch (e) {
    warn(`Ontology tags (non-fatal): ${e.message.slice(0, 80)}`);
  }

  // ── SAVE IDs ──────────────────────────────────────────────────────────────────
  writeFileSync("scripts/lit-agt-010-dev-ids.json", JSON.stringify(ids, null, 2));

  // ── SUMMARY ───────────────────────────────────────────────────────────────────
  console.log("\n════════════════════════════════════════════════════════════════════");
  console.log("  ✅  LIT-AGT-010 CREATION — COMPLETE");
  console.log("════════════════════════════════════════════════════════════════════");
  console.log(`\n  Agent:           ${ids.agentId}`);
  console.log(`  Knowledge Base:  ${ids.kbId} (${ids.kbSourceIds?.length || 0} sources)`);
  console.log(`  Skills (6):      ${ids.skillIds.join("\n                   ")}`);
  console.log(`  Policies (6):    ${ids.policyIds.join("\n                   ")}`);
  console.log(`  Runbooks (6):    ${ids.runbookIds.join("\n                   ")}`);
  console.log(`  Golden Dataset:  ${ids.goldenDatasetId} (${ids.testCaseIds?.length || 0} test cases)`);
  console.log(`  Eval Suite:      ${ids.evalSuiteId}`);
  console.log(`  Outcome:         ${ids.outcomeId}`);
  console.log(`\n  Dev IDs saved → scripts/lit-agt-010-dev-ids.json\n`);
}

main().catch(err => {
  console.error(`\n❌  Creation failed: ${err.message}`);
  process.exit(1);
});
