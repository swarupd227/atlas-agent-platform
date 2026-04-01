#!/usr/bin/env node
/**
 * Employment Compliance & Policy Advisory Agent — Full Platform Intelligence Creation
 * LIT-AGT-001 | Legal Services Industry | HR Compliance
 *
 * Creates all platform intelligence in dev, then generates a CURL migration
 * script to promote everything to production.
 *
 * Usage: node scripts/create-legal-employment-agent.js
 */

const BASE = "http://localhost:5000";
const DEV_ORG  = "0c9bcf16-cdd9-45e2-87f6-6a839a7f7056";
const PROD_ORG = "cf5754b1-ee80-4b51-8bf6-7be263c97527";

// ─── helpers ────────────────────────────────────────────────────────────────

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
  }
  return data;
}

function log(emoji, msg) { console.log(`${emoji}  ${msg}`); }

// ─── 1. AGENT ────────────────────────────────────────────────────────────────

async function createAgent() {
  log("🤖", "Creating Employment Compliance & Policy Advisory Agent…");
  const agent = await api("POST", "/api/agents", {
    name: "Employment Compliance & Policy Advisory Agent",
    agentType: "analysis",
    description:
      "Provides real-time, multi-jurisdiction employment law guidance for handbook policies, " +
      "HR procedures, and day-to-day compliance questions. Maps to Littler's Handbooks & Policies " +
      "and HR Advice & Counsel practice areas. Monitors legislative changes across all 50 U.S. " +
      "states and international jurisdictions, identifies policy gaps, drafts compliant policy " +
      "language, and alerts clients to regulatory developments requiring immediate action. " +
      "Designed as the AI backbone for employment law compliance advisory workflows.",
    department: "HR Compliance",
    owner: "Littler Mendelson P.C.",
    status: "active",
    riskTier: "HIGH",
    autonomyMode: "supervised",
    modelProvider: "anthropic",
    modelName: "claude-opus-4-5",
    complianceTags: [
      "ATTORNEY-CLIENT-PRIVILEGE",
      "UPL-COMPLIANCE",
      "ABA-MODEL-RULES",
      "GDPR",
      "CONFIDENTIALITY",
      "STATE-BAR-ETHICS",
      "RULE-1.1-COMPETENCE",
      "RULE-1.6-CONFIDENTIALITY",
      "RULE-5.3-SUPERVISION"
    ],
    ontologyTags: [
      "LKIF",
      "SALI-LMSS",
      "employment-law",
      "jurisdiction",
      "statute",
      "regulation",
      "policy-gap",
      "multi-state-compliance",
      "handbook-policy",
      "HR-advisory"
    ],
    systemPrompt: `You are the Employment Compliance & Policy Advisory Agent (LIT-AGT-001) for Littler Mendelson P.C., the world's largest employment and labor law firm. You operate as a sophisticated AI research and advisory assistant within Littler's practice management platform.

ROLE & SCOPE
You provide real-time, multi-jurisdiction employment law guidance on: handbook policies, HR procedures, day-to-day compliance questions, legislative change monitoring, policy gap identification, and compliant policy language drafting. You support Littler's Handbooks & Policies and HR Advice & Counsel practice areas.

CORE WORKFLOW
1. Receive compliance inquiry (policy question, handbook review, new regulation alert)
2. Identify applicable jurisdictions based on client footprint (states, countries, municipalities)
3. Query employment law knowledge base for current statutes, regulations, and case law
4. Cross-reference client's existing policies against current legal requirements
5. Identify compliance gaps and risks, ranked by severity and potential liability
6. Generate jurisdiction-specific policy language recommendations with citations
7. Flag conflicting requirements across jurisdictions and recommend harmonization approach
8. Route novel or high-risk questions to appropriate Littler attorney for review
9. Generate compliance summary memo for client's legal/HR team
10. Update monitoring watchlist for ongoing legislative and regulatory tracking
11. Archive advisory in matter management system with time/billing codes

KNOWLEDGE DOMAIN
- All 50 U.S. states + D.C. employment law statutes and regulations
- Federal employment statutes: FLSA, Title VII, ADA, FMLA, ADEA, WARN, NLRA, OSHA, ERISA
- International employment law for 45+ countries
- Municipal ordinances (paid leave, minimum wage, predictive scheduling, etc.)
- Model handbook templates by industry, jurisdiction, and employee type
- Regulatory agency guidance: DOL, EEOC, NLRB, OSHA, state equivalents

CRITICAL COMPLIANCE REQUIREMENTS
- Attorney-Client Privilege: All advisories must maintain privilege markers and handling protocols
- UPL (Unauthorized Practice of Law): Frame all outputs as research assistance, NOT legal advice without attorney review
- Confidentiality: Strict client data isolation — no cross-client data leakage under any circumstances
- Model Rules: Operate in full compliance with ABA Model Rules 1.1 (Competence), 1.6 (Confidentiality), 5.3 (Supervision of Nonlawyers)
- Data Retention: Follow matter-specific retention schedules per client engagement letter

CONFIDENCE & ESCALATION
- Provide confidence scores (0–100) on all advisory outputs
- Automatically flag confidence < 70 for mandatory attorney review
- Clearly differentiate between: settled law, emerging trends, and contested areas
- Always cite specific statutes, regulations, case citations, and effective dates

OUTPUT FORMAT
Structure all responses with:
1. Jurisdiction applicability summary
2. Current legal requirements with citations
3. Gap analysis (if reviewing existing policy)
4. Recommended policy language (jurisdiction-specific)
5. Conflicting requirements across jurisdictions (if any)
6. Risk assessment (HIGH/MEDIUM/LOW) with liability exposure estimate
7. Recommended next steps and attorney review triggers
8. Confidence score and basis`,
    blueprintJson: {
      version: "1.0",
      agentCode: "LIT-AGT-001",
      practiceArea: "Employment & Labor Law",
      nodes: [
        { id: "intake", type: "trigger", label: "Receive Compliance Inquiry" },
        { id: "jurisdiction_id", type: "skill", label: "Identify Applicable Jurisdictions", skillRef: "client-context-skill" },
        { id: "kb_query", type: "skill", label: "Query Employment Law KB", skillRef: "multi-state-survey-skill" },
        { id: "gap_analysis", type: "skill", label: "Cross-Reference & Gap Analysis", skillRef: "policy-gap-analysis-skill" },
        { id: "conflict_check", type: "skill", label: "Check Multi-Jurisdiction Conflicts", skillRef: "conflict-resolution-skill" },
        { id: "draft_policy", type: "skill", label: "Draft Compliant Policy Language", skillRef: "policy-drafting-skill" },
        { id: "confidence_gate", type: "decision", label: "Confidence Score ≥ 70?" },
        { id: "attorney_review", type: "human_in_loop", label: "Route to Littler Attorney" },
        { id: "generate_memo", type: "output", label: "Generate Compliance Summary Memo" },
        { id: "update_watchlist", type: "skill", label: "Update Legislative Watchlist", skillRef: "legislative-tracking-skill" },
        { id: "archive", type: "system", label: "Archive in Matter Management System" }
      ],
      edges: [
        { from: "intake", to: "jurisdiction_id" },
        { from: "jurisdiction_id", to: "kb_query" },
        { from: "kb_query", to: "gap_analysis" },
        { from: "gap_analysis", to: "conflict_check" },
        { from: "conflict_check", to: "draft_policy" },
        { from: "draft_policy", to: "confidence_gate" },
        { from: "confidence_gate", to: "attorney_review", condition: "confidence < 70 OR risk == HIGH" },
        { from: "confidence_gate", to: "generate_memo", condition: "confidence >= 70 AND risk != HIGH" },
        { from: "attorney_review", to: "generate_memo" },
        { from: "generate_memo", to: "update_watchlist" },
        { from: "update_watchlist", to: "archive" }
      ]
    },
    toolsConfig: [
      { name: "jurisdiction_lookup", description: "Look up employment law requirements by state/country" },
      { name: "statute_search", description: "Search federal and state employment statutes" },
      { name: "regulation_search", description: "Search agency regulations and guidance documents" },
      { name: "case_law_search", description: "Search relevant case law and interpretive guidance" },
      { name: "policy_template_retrieval", description: "Retrieve model handbook templates by jurisdiction" },
      { name: "legislative_feed_monitor", description: "Monitor legislative feeds for new bills and amendments" },
      { name: "matter_archive", description: "Archive advisory in matter management system" },
      { name: "attorney_escalation", description: "Route high-risk questions to Littler attorney" }
    ],
    policyBindings: [],
    evalBindings: [],
    runtimeConfig: {
      agentCode: "LIT-AGT-001",
      practiceArea: "Employment & Labor Law",
      subPracticeAreas: ["Handbooks & Policies", "HR Advice & Counsel"],
      clientAudienceTypes: ["HR Directors", "General Counsel", "Compliance Officers"],
      jurisdictionCoverage: "50-state + DC + 45 international + municipal",
      confidenceThreshold: 70,
      escalationTriggers: ["confidence < 70", "novel legal question", "conflicting circuit authority", "pending legislation impact"],
      billingIntegration: true,
      matterManagementRequired: true
    },
    memoryGovernanceRules: [
      {
        memoryType: "episodic",
        classification: "attorney_client_privileged",
        retentionDays: 2555,
        encrypted: true,
        accessControl: "Matter-team-only",
        deletionPolicy: "matter_close + 7 years"
      },
      {
        memoryType: "working",
        classification: "confidential",
        retentionDays: 1,
        encrypted: true,
        accessControl: "Session-only",
        deletionPolicy: "session_end"
      },
      {
        memoryType: "semantic",
        classification: "firm_knowledge",
        retentionDays: -1,
        encrypted: true,
        accessControl: "Firm-wide",
        deletionPolicy: "never"
      }
    ]
  });
  log("✅", `Agent created: ${agent.id} — ${agent.name}`);
  return agent;
}

// ─── 2. SKILLS ───────────────────────────────────────────────────────────────

async function createSkills() {
  log("🧠", "Creating 6 agent skills…");

  const skillDefs = [
    {
      name: "Multi-State Survey Skill",
      description:
        "RAG-powered retrieval over 50-state legislative surveys covering 60+ employment topics, " +
        "mirroring Littler GPS (Global Practice Solutions). Answers questions about state-specific " +
        "requirements on paid leave, non-competes, predictive scheduling, cannabis policies, " +
        "pay transparency, salary history bans, biometric data privacy, and 55+ additional topics. " +
        "Returns citations to current statutes and regulations with effective dates.",
      industry: "legal_services",
      domain: "employment-law",
      author: "Littler Mendelson Legal Technology Team",
      trustTier: "HIGH",
      complexity: "complex",
      contextMode: "rag",
      userInvocable: true,
      tags: ["employment-law", "multi-state", "legislative-survey", "RAG", "Littler-GPS", "jurisdiction", "compliance"],
      yamlFrontmatter: `name: Multi-State Survey Skill
version: "1.0"
agent_code: LIT-AGT-001
domain: employment-law
industry: legal_services
trust_tier: HIGH
context_mode: rag
topics_covered: 60+
jurisdiction_coverage: "50 states + DC + federal + municipal"
data_sources:
  - Littler GPS 50-state survey database
  - State legislature websites
  - Westlaw state law digests
  - LexisNexis state regulatory compilations
required_kb: Employment Compliance & Policy Advisory Knowledge Base
retrieval_strategy: semantic_with_jurisdiction_filter
citation_required: true`,
      markdownBody: `# Multi-State Survey Skill

## Purpose
Provides authoritative, citation-backed employment law answers across all 50 U.S. states, D.C., and federal law for 60+ employment law topics.

## Topics Covered (Partial List)
- Paid Sick Leave / Paid Family Leave (state and local)
- Non-Compete Agreements (enforceability, notice requirements, consideration)
- Predictive Scheduling (advance notice, premium pay, good faith estimate)
- Cannabis / Marijuana Policies (accommodation obligations, off-duty conduct)
- Pay Transparency (salary range disclosure, pay equity reporting)
- Salary History Bans (prohibition jurisdictions, exceptions)
- Biometric Information Privacy (BIPA, CUBI, and equivalents)
- Background Check Requirements (ban-the-box, FCRA compliance)
- Minimum Wage (state, county, and municipal rates and schedules)
- Overtime Exemptions (state differences from FLSA)
- Employee Classification (IC vs. employee tests by jurisdiction)
- Bereavement Leave, Jury Duty, Voting Leave requirements
- Domestic Violence / Sexual Assault Leave
- Pregnancy Accommodation and PWFA requirements
- Non-Disclosure Agreements (state restrictions post-#MeToo)
- Arbitration Agreements (state validity challenges)
- Social Media and Monitoring Policies

## Activation Logic
1. Extract jurisdiction(s) from inquiry context
2. Identify employment law topic(s)
3. Retrieve current state survey entries via semantic search filtered by jurisdiction
4. Cross-reference federal baseline requirements
5. Return state-specific answer with statute citation, effective date, and enforcement notes

## Output Format
\`\`\`
JURISDICTION: [State/Local]
TOPIC: [Employment Law Topic]
CURRENT REQUIREMENT: [Description]
STATUTORY CITATION: [Statute/Regulation]
EFFECTIVE DATE: [Date]
RECENT AMENDMENTS: [If any]
ENFORCEMENT AGENCY: [Agency Name]
PENALTY FOR NON-COMPLIANCE: [Fine/Remedy]
NOTES: [Special considerations, pending changes]
\`\`\`

## Escalation Triggers
- Topic not covered in survey database → flag for attorney research
- Conflicting municipal vs. state requirements → activate Conflict Resolution Skill
- Pending legislation within 90 days → add legislative watchlist alert`,
      allowedTools: ["jurisdiction_lookup", "statute_search", "regulation_search"],
      knowledgeQueries: [
        {
          id: "msq-001",
          name: "State paid leave requirements",
          template: "What are the current paid {leave_type} leave requirements in {jurisdiction}?",
          filters: { topic: "paid_leave", jurisdiction: "{{jurisdiction}}" }
        },
        {
          id: "msq-002",
          name: "Non-compete enforceability",
          template: "Is a non-compete agreement enforceable in {jurisdiction}? What are the requirements?",
          filters: { topic: "non_compete", jurisdiction: "{{jurisdiction}}" }
        },
        {
          id: "msq-003",
          name: "Cannabis accommodation obligation",
          template: "Does {jurisdiction} require employers to accommodate off-duty cannabis use?",
          filters: { topic: "cannabis_policy", jurisdiction: "{{jurisdiction}}" }
        }
      ]
    },
    {
      name: "Policy Gap Analysis Skill",
      description:
        "Compares client handbook language against current legal requirements by jurisdiction. " +
        "Ingests client's existing policy text, identifies provisions that are missing, outdated, " +
        "insufficient, or conflicting with current law. Ranks gaps by severity (HIGH/MEDIUM/LOW) " +
        "based on compliance risk, litigation exposure, and regulatory enforcement likelihood. " +
        "Outputs a structured gap report with specific remediation recommendations.",
      industry: "legal_services",
      domain: "employment-law",
      author: "Littler Mendelson Legal Technology Team",
      trustTier: "HIGH",
      complexity: "complex",
      contextMode: "hybrid",
      userInvocable: true,
      tags: ["policy-gap", "handbook-review", "compliance-audit", "risk-ranking", "employment-law"],
      yamlFrontmatter: `name: Policy Gap Analysis Skill
version: "1.0"
agent_code: LIT-AGT-001
domain: employment-law
industry: legal_services
trust_tier: HIGH
context_mode: hybrid
input_formats:
  - Raw policy text
  - Structured policy document
  - Client handbook section
output_format: structured_gap_report
severity_tiers:
  - HIGH: Immediate legal non-compliance, enforcement risk > 50%
  - MEDIUM: Best practice gap, enforcement risk 10-50%
  - LOW: Style/clarity gap, minimal enforcement risk
citation_required: true`,
      markdownBody: `# Policy Gap Analysis Skill

## Purpose
Analyzes client handbook policies against current legal requirements and identifies compliance gaps by jurisdiction.

## Activation Trigger
Invoked when:
- Client submits handbook or policy for review
- New legislation enacted affecting client's jurisdictions
- Periodic scheduled compliance audit
- Attorney requests gap analysis for specific policy topic

## Analysis Framework

### Step 1: Policy Extraction
- Parse submitted policy text into discrete policy provisions
- Categorize each provision by employment law topic
- Map applicable jurisdictions from client profile

### Step 2: Legal Baseline Comparison
- Retrieve current legal requirements for each topic × jurisdiction combination
- Compare client policy language against statutory minimums and best practices
- Identify gaps: missing provisions, insufficient provisions, prohibited provisions

### Step 3: Gap Classification
| Severity | Criteria |
|----------|----------|
| 🔴 HIGH | Non-compliant with mandatory statute; enforcement probable; litigation risk |
| 🟡 MEDIUM | Below best practice; enforcement possible; defensive risk |
| 🟢 LOW | Clarity/consistency gap; minimal legal exposure |

### Step 4: Report Generation
For each gap identified:
- Policy section with gap
- Current policy language (quoted)
- Legal requirement (cited)
- Gap description
- Severity rating
- Recommended remediation language

## Output Schema
\`\`\`json
{
  "client": "...",
  "reviewDate": "...",
  "jurisdictions": [...],
  "totalGaps": N,
  "highSeverity": N,
  "mediumSeverity": N,
  "lowSeverity": N,
  "gaps": [
    {
      "id": "GAP-001",
      "policySection": "...",
      "topic": "...",
      "jurisdiction": "...",
      "currentLanguage": "...",
      "legalRequirement": "...",
      "citation": "...",
      "severity": "HIGH|MEDIUM|LOW",
      "remediation": "..."
    }
  ]
}
\`\`\``,
      allowedTools: ["jurisdiction_lookup", "statute_search", "policy_template_retrieval"],
      knowledgeQueries: [
        {
          id: "pga-001",
          name: "Policy compliance check",
          template: "Does this policy language comply with {jurisdiction} {topic} requirements?",
          filters: { topic: "{{topic}}", jurisdiction: "{{jurisdiction}}" }
        }
      ]
    },
    {
      name: "Legislative Tracking Skill",
      description:
        "Monitors state and federal legislative feeds for new bills, amendments, final rules, " +
        "and effective date milestones relevant to employment law. Maintains a real-time watchlist " +
        "keyed to client jurisdiction footprints. Generates impact alerts when legislation affects " +
        "client policies, with prioritization by effective date proximity and compliance risk. " +
        "Integrates with Littler ASAP client alert publication workflow.",
      industry: "legal_services",
      domain: "employment-law",
      author: "Littler Mendelson Legal Technology Team",
      trustTier: "MEDIUM",
      complexity: "moderate",
      contextMode: "rag",
      userInvocable: false,
      tags: ["legislative-tracking", "monitoring", "alerts", "regulatory-feed", "ASAP", "watchlist"],
      yamlFrontmatter: `name: Legislative Tracking Skill
version: "1.0"
agent_code: LIT-AGT-001
domain: employment-law
industry: legal_services
trust_tier: MEDIUM
context_mode: rag
monitoring_scope:
  - 50 state legislatures
  - U.S. Congress (employment committees)
  - Federal agencies (DOL, EEOC, NLRB, OSHA, FTC)
  - State labor agencies
  - Key municipal councils (NYC, LA, Chicago, Seattle, etc.)
alert_latency_target: "< 24 hours from enactment"
integration: Littler ASAP publication workflow`,
      markdownBody: `# Legislative Tracking Skill

## Purpose
Provides continuous monitoring of employment law legislative and regulatory changes, generating timely alerts for client-relevant jurisdiction footprints.

## Monitoring Sources
- State legislature RSS feeds and bill tracking APIs
- Congress.gov API (federal employment legislation)
- Federal Register (final and proposed rules)
- DOL, EEOC, NLRB, OSHA official announcement feeds
- State labor department regulatory calendars
- Key municipal council agendas and enacted ordinances

## Watchlist Management
Each client entry in the watchlist contains:
- Entity name and matter ID
- Active jurisdiction set (states, countries, municipalities)
- Policy topics of interest (based on handbook topics under review)
- Alert threshold settings (effective date proximity)

## Alert Generation
Trigger alert when:
1. New bill introduced in watched jurisdiction on tracked topic
2. Bill advances to committee or floor vote
3. Bill enacted (immediate HIGH priority alert)
4. Effective date is within 90 days (countdown alert)
5. Agency issues guidance or FAQ on enacted law
6. Court decision materially affects statutory interpretation

## Alert Content
- Legislation/regulation title and citation
- Status (introduced / enacted / effective)
- Effective date
- Summary of employment law impact
- Affected client policies (cross-reference with client KB)
- Recommended immediate actions
- Link to Littler ASAP publication (if available)

## Integration with Littler ASAP
When significant legislation is enacted:
1. Draft alert summary for attorney review
2. Route to practice group attorney for content review
3. Post approved alert to ASAP publication system
4. Notify affected clients via matter management system`,
      allowedTools: ["legislative_feed_monitor", "statute_search", "matter_archive"],
      knowledgeQueries: [
        {
          id: "lt-001",
          name: "Recent legislation check",
          template: "What employment law legislation was enacted in {jurisdiction} in the last {days} days?",
          filters: { jurisdiction: "{{jurisdiction}}", recency: "{{days}}" }
        }
      ]
    },
    {
      name: "Policy Drafting Skill",
      description:
        "Generates compliant policy language using approved Littler templates and jurisdiction-specific " +
        "requirements. Produces ready-to-use handbook policy language for 60+ employment topics " +
        "tailored to client's industry, headcount, union status, and jurisdiction set. Output " +
        "includes alternative language variants for multi-state harmonization, privilege-protective " +
        "drafting notes, and attorney review flags for novel requirements.",
      industry: "legal_services",
      domain: "employment-law",
      author: "Littler Mendelson Legal Technology Team",
      trustTier: "HIGH",
      complexity: "complex",
      contextMode: "hybrid",
      userInvocable: true,
      tags: ["policy-drafting", "handbook", "template", "jurisdiction-specific", "employment-law", "multi-state"],
      yamlFrontmatter: `name: Policy Drafting Skill
version: "1.0"
agent_code: LIT-AGT-001
domain: employment-law
industry: legal_services
trust_tier: HIGH
context_mode: hybrid
output_types:
  - Single-jurisdiction policy
  - Multi-state harmonized policy
  - State addendum to master policy
  - Side-by-side comparison (policy variants by state)
approval_required_for:
  - Novel jurisdiction requirements
  - Policies covering NLRA-sensitive topics
  - International employment policies
attorney_review_flag: true`,
      markdownBody: `# Policy Drafting Skill

## Purpose
Generates jurisdiction-compliant handbook policy language using Littler's approved template library, tailored to client-specific parameters.

## Template Library Coverage
- At-Will Employment Statements (with state carve-outs)
- Equal Employment Opportunity / Anti-Discrimination
- Anti-Harassment, Anti-Bullying, Respect in the Workplace
- Paid Sick Leave (jurisdiction-specific)
- Paid Family and Medical Leave (jurisdiction-specific)
- FMLA / State Leave Equivalents
- Accommodation Policies (disability, pregnancy, religion)
- Non-Compete and Confidentiality Agreements
- Social Media and Electronic Monitoring
- Drug and Alcohol Testing (including cannabis)
- Remote Work / Hybrid Work
- Expense Reimbursement (CCPA, state law)
- Pay Transparency and Salary History
- Workplace Violence Prevention
- Background Check and FCRA Notices

## Drafting Parameters
Client context required:
- Jurisdiction(s) applicable
- Industry (for industry-specific carve-outs)
- Headcount by jurisdiction (size-based exemptions)
- Union status (CBA considerations)
- Policy topic(s) requested
- Drafting style (formal / conversational)
- Target audience (managers / all employees / executives)

## Quality Gates
Before output, the skill checks:
1. ✅ Statutory compliance for all named jurisdictions
2. ✅ No prohibited provisions (e.g., unlawful no-solicitation in NLRA context)
3. ✅ Privilege language present for attorney review output
4. ✅ Gender-neutral, plain-language (Flesch-Kincaid target: Grade 10-12)
5. ✅ Citation footnotes included

## Output Format
\`\`\`
POLICY TITLE: [Title]
APPLICABLE JURISDICTIONS: [List]
EFFECTIVE DATE GUIDANCE: [Notes]

---POLICY LANGUAGE---
[Full policy text with jurisdiction-specific provisions marked]

---DRAFTING NOTES (PRIVILEGED AND CONFIDENTIAL)---
[Notes for attorney review — not for client distribution]

---CITATIONS---
[Statute, regulation, and agency guidance citations]
\`\`\``,
      allowedTools: ["jurisdiction_lookup", "statute_search", "policy_template_retrieval", "attorney_escalation"],
      knowledgeQueries: [
        {
          id: "pd-001",
          name: "Template retrieval",
          template: "Retrieve approved policy template for {policy_topic} in {jurisdiction} for {industry} employer",
          filters: { topic: "{{policy_topic}}", jurisdiction: "{{jurisdiction}}" }
        }
      ]
    },
    {
      name: "Conflict Resolution Skill",
      description:
        "Identifies and proposes solutions for conflicting multi-jurisdictional employment law requirements. " +
        "When an employer operates in multiple states or localities with contradictory requirements on the " +
        "same topic (e.g., paid leave, non-competes, background checks), this skill analyzes each " +
        "jurisdiction's mandate, identifies the tension points, and recommends a harmonization approach — " +
        "typically the most protective standard, addendum structure, or separate state-specific policies.",
      industry: "legal_services",
      domain: "employment-law",
      author: "Littler Mendelson Legal Technology Team",
      trustTier: "HIGH",
      complexity: "complex",
      contextMode: "rag",
      userInvocable: true,
      tags: ["conflict-resolution", "multi-jurisdiction", "harmonization", "preemption", "employment-law"],
      yamlFrontmatter: `name: Conflict Resolution Skill
version: "1.0"
agent_code: LIT-AGT-001
domain: employment-law
industry: legal_services
trust_tier: HIGH
context_mode: rag
conflict_types:
  - State vs. state contradictions
  - State vs. local contradictions
  - Federal floor vs. state/local ceiling
  - Preemption analysis (federal over state)
  - International vs. U.S. requirements
output_includes_preemption_analysis: true`,
      markdownBody: `# Conflict Resolution Skill

## Purpose
Analyzes conflicting employment law requirements across jurisdictions and recommends compliant harmonization strategies for multi-state employers.

## Common Conflict Patterns

### 1. State vs. State
Example: Non-compete enforceability — California bans them; Georgia broadly enforces them.
Resolution: Separate state-specific agreements or California carve-out for CA employees.

### 2. State vs. Local
Example: Minimum wage — State at $15/hr, City at $17.50/hr.
Resolution: Apply higher local standard; adjust payroll by work location.

### 3. Federal Floor vs. State/Local Ceiling
Example: FMLA 12 weeks federal minimum vs. California 26 weeks.
Resolution: Apply most generous standard; run leaves concurrently where permitted.

### 4. Preemption Analysis
Some state laws preempt local ordinances.
Example: Some states prohibit cities from enacting predictive scheduling laws.
Resolution: Identify preemption status; apply state-level requirement only.

### 5. International vs. U.S.
Example: EU GDPR employee data rights vs. U.S. employer monitoring rights.
Resolution: Jurisdiction-specific addendum; data processing agreements; Works Council consultation.

## Conflict Resolution Framework

**Step 1:** Map all jurisdictions to the specific employment law topic
**Step 2:** Retrieve each jurisdiction's current requirement with citation
**Step 3:** Identify conflict type (see above)
**Step 4:** Apply resolution hierarchy:
  1. Most protective standard (if feasible operationally)
  2. Separate jurisdiction-specific addendum to master policy
  3. Geographic carve-out with conditional language
  4. State-specific standalone policy

**Step 5:** Preemption check — does federal/state law override local?
**Step 6:** Attorney review flag if novel conflict not in precedent database

## Output
- Conflict matrix (topic × jurisdiction × requirement)
- Resolution recommendation with rationale
- Proposed harmonized policy language
- Risk assessment for each resolution approach
- Jurisdictions requiring separate notification or posting obligations`,
      allowedTools: ["jurisdiction_lookup", "statute_search", "regulation_search", "attorney_escalation"],
      knowledgeQueries: [
        {
          id: "cr-001",
          name: "Multi-state conflict lookup",
          template: "What are the conflicting requirements for {topic} between {jurisdiction_a} and {jurisdiction_b}?",
          filters: { topic: "{{topic}}" }
        }
      ]
    },
    {
      name: "Client Context Skill",
      description:
        "Retrieves client profile, industry, prior advisories, jurisdiction footprint, and existing " +
        "policy documents to personalize all employment law guidance. Accesses client matter history, " +
        "previously identified gaps, open action items, and attorney relationships. Ensures all advisory " +
        "output is contextualized against the client's specific workforce demographics, union status, " +
        "industry-specific requirements, and ongoing engagement terms.",
      industry: "legal_services",
      domain: "employment-law",
      author: "Littler Mendelson Legal Technology Team",
      trustTier: "CRITICAL",
      complexity: "moderate",
      contextMode: "retrieval",
      userInvocable: false,
      tags: ["client-context", "matter-management", "profile-retrieval", "personalization", "confidentiality"],
      yamlFrontmatter: `name: Client Context Skill
version: "1.0"
agent_code: LIT-AGT-001
domain: employment-law
industry: legal_services
trust_tier: CRITICAL
context_mode: retrieval
data_accessed:
  - Client profile (entity name, industry, headcount, locations)
  - Jurisdiction footprint (active states, countries, municipalities)
  - Prior advisory history (matter IDs, dates, topics, outcomes)
  - Existing policy documents (current handbook version)
  - Open compliance action items
  - Engagement partner and billing codes
access_control: Attorney-client privilege protected
cross_client_isolation: STRICT — no data crossing between clients`,
      markdownBody: `# Client Context Skill

## Purpose
Retrieves and structures client-specific context to personalize all employment law advisory outputs and maintain matter continuity.

## Data Retrieved

### Client Profile
- Legal entity name(s) and DBA(s)
- Industry and sub-sector (for industry-specific requirements)
- Total headcount and headcount by jurisdiction
- Union status and CBA expiration dates (if applicable)
- Public/private company status
- Federal contractor status (for OFCCP requirements)

### Jurisdiction Footprint
- States with employees or offices
- Countries with employees (international operations)
- Municipal presence (for local ordinance applicability)
- Remote/hybrid work locations (employee home state analysis)

### Advisory History
- Prior compliance questions with attorney conclusions
- Previously identified policy gaps and remediation status
- Ongoing legislative monitoring watchlist entries
- Pending handbook revision projects

### Engagement Context
- Responsible Littler attorney and practice group
- Engagement letter terms (scope, billing arrangement)
- Client-specific confidentiality requirements
- Preferred communication format and turnaround SLA

## Privacy and Isolation Rules
⚠️ CRITICAL: This skill operates with strict client data isolation.
- No client data may be referenced in responses for a different client
- All context retrieval is scoped to the active matter ID
- Prior advisory content is privilege-protected
- Retrieval logs are maintained for audit purposes

## Output
Returns structured context object used to:
- Filter jurisdiction-specific legal requirements to client's footprint
- Pre-populate gap analysis with existing policy text
- Reference prior advisories to avoid duplicating research
- Apply client-specific preferences (e.g., preferred policy drafting style)`,
      allowedTools: ["matter_archive"],
      knowledgeQueries: [
        {
          id: "cc-001",
          name: "Client jurisdiction footprint",
          template: "What jurisdictions does {client_name} operate in based on their profile?",
          filters: { client: "{{client_name}}" }
        }
      ]
    }
  ];

  const skills = [];
  for (const def of skillDefs) {
    const skill = await api("POST", "/api/skills", def);
    log("  ✓", `Skill created: ${skill.id} — ${skill.name}`);
    skills.push(skill);
  }
  return skills;
}

// ─── 3. KNOWLEDGE BASE ───────────────────────────────────────────────────────

async function createKnowledgeBase() {
  log("📚", "Creating Employment Law Knowledge Base…");

  const kb = await api("POST", "/api/knowledge-bases", {
    name: "Employment Compliance & Policy Advisory Knowledge Base",
    description:
      "Comprehensive employment law knowledge repository for the Employment Compliance & Policy " +
      "Advisory Agent (LIT-AGT-001). Covers all 50 U.S. states plus federal law, international " +
      "employment law for 45+ countries, model handbook templates, regulatory agency guidance, " +
      "and case law interpretations across 60+ employment law topics.",
    industry: "legal_services",
    vectorDbType: "pgvector",
    embeddingModel: "text-embedding-3-small",
    embeddingDimensions: 1536,
    chunkSize: 768,
    chunkOverlap: 100,
    stalenessThresholdDays: 30,
  });

  log("  ✓", `Knowledge Base created: ${kb.id}`);

  // Ingest comprehensive knowledge sources
  const sources = [
    {
      title: "Federal Employment Statutes — Core Framework",
      content: `FEDERAL EMPLOYMENT LAW STATUTORY FRAMEWORK

FAIR LABOR STANDARDS ACT (FLSA) — 29 U.S.C. § 201 et seq.
Enacted: 1938 | Last major amendment: 2009 (minimum wage)
Minimum wage: $7.25/hour (federal floor; state/local laws often higher)
Overtime: 1.5x regular rate for non-exempt employees over 40 hrs/week
Exemptions: Executive, Administrative, Professional (EAP); salary threshold $684/week ($35,568/year) as of 2019 (pending DOL rulemaking for higher thresholds)
Child labor: Restrictions on hours and hazardous occupations for workers under 18
Enforcement: DOL Wage & Hour Division; private right of action; 2-year statute of limitations (3 years for willful violations)
Key compliance: Proper classification of exempt vs. non-exempt; accurate timekeeping; overtime calculation; tipped employee rules

TITLE VII OF THE CIVIL RIGHTS ACT — 42 U.S.C. § 2000e et seq.
Enacted: 1964 | Amended by: Pregnancy Discrimination Act (1978), Civil Rights Act of 1991
Coverage: Employers with 15+ employees
Prohibits: Discrimination in hiring, firing, pay, promotion based on race, color, religion, sex, national origin
Sexual harassment: Quid pro quo and hostile work environment (Meritor Savings Bank v. Vinson, 1986)
Pregnancy: Pregnancy Discrimination Act prohibits treating pregnant employees less favorably
Religious accommodation: Employers must provide reasonable accommodation unless undue hardship (Groff v. DeJoy, 2023 — raised undue hardship standard)
Enforcement: EEOC charge prerequisite; 180/300-day filing deadline; 90-day right-to-sue letter

AMERICANS WITH DISABILITIES ACT (ADA) — 42 U.S.C. § 12101 et seq.
Enacted: 1990 | Amended by: ADA Amendments Act of 2008 (ADAAA)
Coverage: Employers with 15+ employees
Disability definition (broad post-ADAAA): Physical or mental impairment that substantially limits major life activity
Reasonable accommodation: Interactive process required; undue hardship defense
Direct threat: Can exclude individual posing direct threat to health/safety (objective, individualized assessment)
Medical inquiries: Pre-offer (prohibited) vs. post-offer conditional (limited) vs. employment (job-related and consistent with business necessity)
Enforcement: EEOC; private right of action; compensatory and punitive damages

FAMILY AND MEDICAL LEAVE ACT (FMLA) — 29 U.S.C. § 2601 et seq.
Enacted: 1993
Coverage: Employers with 50+ employees within 75-mile radius; employees with 12+ months / 1,250 hours
Leave entitlement: 12 weeks/year for: serious health condition (self or family), childbirth/adoption, qualifying military exigency
Military caregiver: 26 weeks/year
Concurrent leave: Employer may require FMLA to run concurrently with state leave, PTO
Key obligations: Notice (employer and employee), designation, reinstatement rights, benefits continuation
State equivalents: California (CFRA/PDL/PFL), New York, New Jersey, Washington, Massachusetts, Oregon, Colorado, Connecticut — most with broader coverage and longer leave periods

AGE DISCRIMINATION IN EMPLOYMENT ACT (ADEA) — 29 U.S.C. § 621 et seq.
Coverage: Employers with 20+ employees; workers 40 and older
Prohibits: Adverse employment actions based on age 40+
Waivers: OWBPA requirements for valid age discrimination waivers (21/45 days to consider; 7-day revocation)
Enforcement: EEOC charge required; 180/300-day deadline

WARN ACT — 29 U.S.C. § 2101 et seq.
Coverage: Employers with 100+ employees (full-time)
Trigger: Plant closing or mass layoff affecting 50+ employees
Notice: 60 days advance written notice to employees, state, and local government
Exceptions: Faltering company, unforeseeable business circumstances, natural disaster
Damages: Up to 60 days back pay and benefits for violations
State mini-WARNs: California (100 days), New York (90 days), New Jersey, Illinois — lower thresholds and longer notice periods

NATIONAL LABOR RELATIONS ACT (NLRA) — 29 U.S.C. § 151 et seq.
Coverage: Most private sector employees (excluding supervisors, managers, agricultural, domestic workers)
Section 7 rights: Right to organize, join unions, engage in concerted activity for mutual aid or protection
Employer prohibitions: Cannot discipline employees for discussing wages, working conditions; must not maintain overbroad handbook policies
Recent NLRB activity: Increased scrutiny of non-disparagement clauses, confidentiality policies, social media policies, mandatory arbitration
NLRB General Counsel Memos: Major policy shifts on non-competes (GC Memo 23-08), severance agreements (McLaren Macomb, 2023)

OCCUPATIONAL SAFETY AND HEALTH ACT (OSHA) — 29 U.S.C. § 651 et seq.
General Duty Clause: Employer must provide workplace free from recognized serious hazards
Specific standards: Hazard communication, bloodborne pathogens, lockout/tagout, etc.
Recordkeeping: Form 300 (injury/illness log), Form 301, Form 300A (annual summary)
Whistleblower protection: Section 11(c); multiple industry-specific whistleblower statutes
State plans: 22 states operate OSHA-approved state plans (Cal/OSHA, MIOSHA, etc.)

EMPLOYEE RETIREMENT INCOME SECURITY ACT (ERISA) — 29 U.S.C. § 1001 et seq.
Governs: Employer-sponsored retirement plans (401k, pension), welfare benefit plans (health, life, disability)
Key requirements: Fiduciary duties, disclosure (SPD), COBRA continuation coverage, HIPAA portability
Key prohibitions: Cannot discriminate against employees for exercising ERISA rights`,
    },
    {
      title: "50-State Employment Law Survey — Key Topics",
      content: `50-STATE EMPLOYMENT LAW SURVEY — KEY TOPIC HIGHLIGHTS

PAID SICK LEAVE LAWS (as of 2025)

States with Mandatory Paid Sick Leave:
- CALIFORNIA: 40 hours/year (SB 616 eff. 1/1/2024); accrual or front-load; 3-day use if 24-hour bank
- NEW YORK: 56 hours (employers 100+); 40 hours (5-99 employees); NYC Human Rights Law adds requirements
- NEW JERSEY: 40 hours; calendar year; front-load permitted
- ILLINOIS: 40 hours/year; Cook County/Chicago have additional local requirements
- WASHINGTON: 1 hour per 40 worked; no cap on accrual; family member care
- MASSACHUSETTS: 40 hours/year; earn 1 hour per 30 worked; all employers (1+ employee)
- COLORADO: 48 hours under HFWA; also applies to COVID-like public health emergencies
- CONNECTICUT: 40 hours; 50+ employee threshold; accrual rate 1:40
- OREGON: 40 hours; all private employers; accrues 1:30; 80% salary pay rate
- MICHIGAN: 72 hours for 10+ employees; 40 hours for smaller; Earned Sick Time Act (2025 amendment)
- MINNESOTA: 48 hours/year; all employers eff. 1/1/2024; broader family definition
- MARYLAND: 64 hours (15+); 40 hours (smaller); Montgomery County adds requirements
- VERMONT: 40 hours; all employers; family care included
- ARIZONA: 40 hours (15+); 24 hours (smaller)
- RHODE ISLAND: 40 hours; 18+ employees
- NEVADA: 40 hours (50+); 24 hours (smaller)
- MAINE: 40 hours; all employers; "safe time" included
- NEW MEXICO: 64 hours/year eff. 7/1/2022

NON-COMPETE AGREEMENT ENFORCEABILITY

States with Full or Near-Full Bans:
- CALIFORNIA: Void and unenforceable — Business & Professions Code § 16600; SB 699 (2023) — applies to agreements entered anywhere; AB 1076 (2023) — notice requirement
- MINNESOTA: Banned for agreements entered on/after 1/1/2023 (MINN. STAT. § 181.988)
- OKLAHOMA: Void except for partners, limited sale-of-business context
- NORTH DAKOTA: Largely unenforceable
- FTC RULE: Final rule banning most non-competes struck down (Ryan LLC v. FTC, N.D. Tex. 2024) — rule enjoined nationally; DOL/FTC may appeal

States with Significant Restrictions (2023-2025):
- COLORADO: Only for employees earning >$123,750 (2024 threshold); income-based restrictions
- ILLINOIS: Only enforceable for employees earning >$75,000; additional restrictions for low-wage workers
- MAINE: Only if employee earns ≥400% federal poverty level
- MARYLAND: Prohibited for employees earning ≤$31,200
- NEW HAMPSHIRE: Employer must provide copy before acceptance; 14-day review
- WASHINGTON: Only for employees earning >$116,593 (2024); advance notice; 18-month limit
- VIRGINIA: Only for "highly compensated" employees (>$150K); geographic and duration limits

PREDICTIVE SCHEDULING / FAIR WORKWEEK LAWS

Cities with Comprehensive Ordinances:
- SAN FRANCISCO: Formula Retail Employee Rights Ordinance; 2-week advance schedule; premium pay for changes
- NEW YORK CITY: Applies to retail, fast food, warehouse — 72 hours advance notice; premium for schedule changes; right to rest between shifts
- CHICAGO: Retail Employees Work Schedule Ordinance; 2-week advance notice; 10-hour rest between shifts
- SEATTLE: Secure Scheduling Ordinance; food service, retail; 14-day advance notice
- PHILADELPHIA: Fair Workweek Employment Standards Ordinance; food service, retail; 2-week advance
- LOS ANGELES: County and city have separate ordinances for retail employers
- EMERYVILLE (CA): Hospitality, manufacturing, retail; 2-week advance notice
- PORTLAND (OR): Formula Retail; 2-week advance notice; 10-hour rest between closes

PAY TRANSPARENCY AND SALARY RANGE DISCLOSURE

States Requiring Salary Range in Job Postings:
- COLORADO: EPEWA — salary and benefits required in all postings (in-state and remote roles advertised in CO)
- CALIFORNIA: SB 1162 (eff. 1/1/2023) — employers 15+ must post salary range; all employers must provide range to applicants on request
- NEW YORK STATE: SBRLA — employers 4+ must include compensation range; benefits
- WASHINGTON: Eff. 1/1/2023 — all employers must include salary range in job postings
- CONNECTICUT: Salary range to applicants on request; to employees being considered for promotion
- NEVADA: Salary range to applicants after interview; to employees upon request
- MARYLAND: Salary range to applicants on request; posting if company has 15+ employees
- HAWAII: HB 2025 — salary ranges in postings; effective 1/1/2024
- ILLINOIS: SB 3430 — ranges and benefits in postings; 14+ employees; effective 1/1/2025

CANNABIS/MARIJUANA POLICIES

States Requiring Off-Duty Use Accommodation:
- CALIFORNIA, NEW YORK, NEW JERSEY, MINNESOTA, ILLINOIS, CONNECTICUT, MONTANA, NEW MEXICO, NEW JERSEY, RHODE ISLAND: Cannot take adverse action for off-duty cannabis use per state law; still may enforce drug-free workplace for safety-sensitive roles with reasonable suspicion/post-accident testing
- IMPORTANT: Per se rules difficult — cannabis does not have an objective impairment test like BAC; timing of use ≠ impairment at work
- CALIFORNIA (AB 2188, eff. 1/1/2024): Cannot discriminate based on off-duty cannabis use OR drug test results detecting non-psychoactive cannabis metabolites (exception: federal contractors)
- NEW YORK (Labor Law § 201-d): Off-duty lawful recreational activity protected; cannabis includes

States Where Drug-Free Workplace Remains Broad:
- IDAHO, WYOMING, NEBRASKA, SOUTH DAKOTA, GEORGIA, ALABAMA: No recreational cannabis; testing and discipline permitted for any positive test`,
    },
    {
      title: "International Employment Law — Key Jurisdictions",
      content: `INTERNATIONAL EMPLOYMENT LAW GUIDE — KEY JURISDICTIONS

UNITED KINGDOM
Legal Framework: Employment Rights Act 1996, Equality Act 2010, Working Time Regulations 1998
Key Requirements:
- Unfair dismissal: Employees with 2+ years of service have right not to be unfairly dismissed; qualifying period 2 years (0 for whistleblowers, discrimination cases)
- Notice: Statutory minimum 1 week per year of service (up to 12 weeks); contractual notice typically higher
- Redundancy: Collective consultation required for 20+ redundancies in 90-day period (30 days notice to government); individual redundancy pay formula: 0.5-1.5 weeks per year of service (capped)
- Working time: 48-hour average week limit (can opt out); 28 days annual leave (incl. bank holidays)
- Holiday: 5.6 weeks (28 days) statutory minimum
- National Minimum Wage: £11.44/hour (25+) as of April 2024
- Data protection: UK GDPR (post-Brexit); employee monitoring guidelines from ICO
- Gender pay gap reporting: Employers 250+; annual reporting obligation

EUROPEAN UNION (applies in member states)
GDPR (Regulation 2016/679):
- Employee data is personal data — all GDPR principles apply (lawfulness, fairness, transparency, purpose limitation, data minimization, accuracy, storage limitation, security)
- Legal basis for processing: Legitimate interests, legal obligation, or employment contract (consent generally insufficient for employment context due to power imbalance)
- Data subject rights: Access, rectification, erasure (limited in employment), restriction, portability, objection
- Works council consultation: Required in many EU states before implementing monitoring systems
- Cross-border transfers: Standard Contractual Clauses for transfers to non-adequate countries

EU WORKING TIME DIRECTIVE (2003/88/EC):
- 48-hour maximum average working week (reference period: 4 months; opt-out available in some states)
- 11 hours daily rest; 24 hours weekly rest
- 4 weeks annual paid leave
- Night work: No more than 8 hours in 24-hour period; health assessment

Posted Workers Directive (2018/957/EU):
- Employers posting workers to EU member states must apply host-country employment conditions
- Applies to: Pay (including mandatory bonuses), working time, health and safety, anti-discrimination

GERMANY
Legal Framework: Basic Law, Civil Code (BGB), Works Constitution Act, Protection Against Dismissal Act
Key requirements:
- Works council (Betriebsrat): Mandatory for establishments with 5+ permanent employees; co-determination rights on working time, monitoring, workplace order, hiring/firing
- Dismissal protection (Kündigungsschutzgesetz — KSchG): Applies after 6 months; socially justified dismissal required; operational, personal, or behavioral reasons
- Notice: 4 weeks minimum; increases with length of service (up to 7 months after 20 years)
- Temporary workers (Arbeitnehmerüberlassung): Max 18 months temporary placement; equal pay after 9 months
- Non-compete: 2-year maximum; compensation required (at least 50% of last compensation)
- Data protection: German Data Protection Act (BDSG) + EU GDPR; works council co-determination on monitoring

CANADA (Federal + Provincial)
Federal (Canada Labour Code — applies to federally regulated industries):
- Federally regulated: Banking, telecom, broadcasting, interprovincial transport, federal government
- Termination: Just cause required (federally regulated); notice: 2 weeks minimum (up to 8 weeks by service)
- Pay equity: Pay Equity Act (2021) requires federally regulated employers 10+ to develop pay equity plans
- Anti-harassment: Canada Labour Code Part II; workplace harassment and violence prevention regulations

Provincial (Major Provinces):
- ONTARIO: Employment Standards Act (ESA); notice/severance up to 34 weeks (26 + 8 combined for mass termination); Human Rights Code; OHRC
- BRITISH COLUMBIA: Employment Standards Act; 3 months-to-8 weeks notice by service; human rights protections
- QUEBEC: Civil Code; Charter of Human Rights and Freedoms; Act Respecting Labour Standards; French language requirements (Bill 96)
- ALBERTA: Employment Standards Code; PIPA (personal information); Bill 6 — agricultural workers coverage

AUSTRALIA
Legal Framework: Fair Work Act 2010; National Employment Standards (NES)
Key Requirements:
- National Employment Standards: 11 minimum entitlements — maximum hours (38 + reasonable additional), annual leave (4 weeks), personal/carer's leave, parental leave, flexible working requests, community service leave, long service leave, redundancy pay, notice, Fair Work Information Statement
- Modern awards: Industry/occupation-specific awards set minimum wages and conditions
- Enterprise bargaining: Negotiated enterprise agreements; must pass "better off overall test" (BOOT)
- Unfair dismissal: Employees with 6 months service (12 months small business) protected; Fair Work Commission arbitration
- General protections: Protected workplace rights; adverse action claims
- Non-compete: Common law reasonableness test; Australian courts generally willing to enforce reasonable restrictions
- Privacy Act 1988: Australian Privacy Principles; employee records exemption (limited)

INDIA
Legal Framework: Codes on Wages, Industrial Relations, Social Security, Occupational Safety (2019-2020 Labour Codes — phased implementation)
Key Requirements:
- Fixed-term employment: Equivalent benefits to permanent employees; no notice for termination at end of term
- Standing Orders: Applicable to establishments 100+ (100 under Codes); must define conditions of employment
- Gratuity: 15 days wages per year of service after 5 years; Payment of Gratuity Act 1972
- Provident Fund: 12% employer + 12% employee contribution; Employees' Provident Fund Organization (EPFO)
- ESI (Employee State Insurance): Medical benefits; 3.25% employer + 0.75% employee contribution
- Termination (for establishments 300+): Prior government approval for layoffs, retrenchment, closures
- Non-compete: Narrowly enforced; only protects trade secrets/confidential information during employment in many states`,
    },
    {
      title: "Model Handbook Templates — Core Policies",
      content: `MODEL EMPLOYMENT HANDBOOK POLICIES — APPROVED TEMPLATES

AT-WILL EMPLOYMENT STATEMENT
[Standard — 49 States + DC; Montana Excluded]

"[Company Name] is an at-will employer. This means that either you or [Company Name] may terminate your employment at any time, for any reason, or for no reason, with or without advance notice. No representative of the Company has authority to enter into any agreement for employment for a specified period of time, or to make any agreement contrary to this policy, unless it is in writing and signed by [authorized officer title]. Nothing in this handbook, any other Company policy, or in Company practices creates an express or implied contract of employment."

[Montana Version — Modified]
"In Montana, employment is terminable only for cause after the completion of the applicable probationary period [typically 6 months]. The Company reserves the right to terminate employment during the probationary period for any reason or no reason."

EQUAL EMPLOYMENT OPPORTUNITY POLICY

"[Company Name] is an equal opportunity employer. The Company provides equal employment opportunities to all employees and applicants for employment without regard to race, color, religion, sex (including pregnancy, childbirth, related medical conditions, and breastfeeding), national origin, age (40 or older), disability, genetic information, military or veteran status, sexual orientation, gender identity or expression, or any other characteristic protected by applicable federal, state, or local law.

This policy applies to all aspects of employment, including recruitment, hiring, placement, promotion, termination, layoff, recall, transfer, leave of absence, compensation, benefits, and training.

[State-specific additions required in: California (gender expression, marital status, political affiliation), New York City (caregiver status, status as victim of domestic violence), Illinois (unfavorable military discharge status), and others — see state-specific addenda]"

ANTI-HARASSMENT POLICY

"[Company Name] is committed to maintaining a work environment free of unlawful harassment. The Company prohibits harassment based on race, color, religion, sex, national origin, age, disability, genetic information, military or veteran status, sexual orientation, gender identity, or any other characteristic protected by applicable law.

Sexual harassment includes unwelcome sexual advances, requests for sexual favors, and other verbal, visual, or physical conduct of a sexual nature when:
(a) submission to such conduct is made an explicit or implicit condition of an individual's employment;
(b) submission to or rejection of such conduct is used as the basis for employment decisions affecting the individual; or
(c) such conduct has the purpose or effect of unreasonably interfering with an individual's work performance or creating an intimidating, hostile, or offensive work environment.

REPORTING PROCEDURE: Employees who experience or witness harassment should report it immediately to [HR/multiple reporting channels]. Reports may be made anonymously at [hotline]. The Company prohibits retaliation against employees who report in good faith.

INVESTIGATION: All complaints will be investigated promptly, impartially, and confidentially to the extent possible. The Company will take appropriate corrective action based on the findings.

[Note: California, New York, Illinois, Delaware, Maine, Connecticut, Washington require specific training programs — add state-specific training obligations]"

FMLA / LEAVE OF ABSENCE POLICY

"[Company Name] provides leave in accordance with the Family and Medical Leave Act (FMLA) and applicable state leave laws. This section summarizes key leave rights; employees should contact HR for complete information.

FMLA ELIGIBILITY: Employees who have worked for the Company for at least 12 months and have worked at least 1,250 hours during the 12-month period preceding the leave start date, and work at a location where the Company employs at least 50 employees within 75 miles.

QUALIFYING REASONS: Birth, adoption, or foster placement of a child; serious health condition of employee or immediate family member (spouse, child, parent); qualifying exigency related to family member's military service; to care for a covered servicemember (up to 26 weeks).

DURATION: Up to 12 weeks (26 weeks for servicemember caregiver leave) per Company-designated 12-month period.

CONCURRENT USE: FMLA leave runs concurrently with any state family or medical leave, as permitted by law. The Company may require employees to use accrued paid time off concurrently with FMLA leave.

NOTICE: Employees must provide 30 days advance notice when leave is foreseeable; otherwise, notice must be given as soon as practicable.

[State supplements required for: California (CFRA different family definition; baby bonding for domestic partners; PDL overlap), New York (NY PFL separate coverage, NY DBL), New Jersey (NJFLA + NJ FLI), Washington (PFML), Massachusetts (PFML), Colorado (FAMLI), Oregon (PFMLI) — attach state-specific addenda]"

PAID SICK LEAVE — MULTI-STATE MASTER POLICY WITH ADDENDA

"[Company Name] provides paid sick leave to eligible employees in accordance with applicable state and local laws. In jurisdictions where such laws apply, employees accrue [X] hours of paid sick leave per [accrual period] or receive [X] hours at the start of the year, as set forth in the applicable state/local addendum.

Employees may use paid sick leave for: their own illness, injury, or medical appointment; care of a family member who is ill or injured; a public health emergency; and in jurisdictions where required, for absences related to domestic violence, sexual assault, or stalking.

The Company will not retaliate against employees for using paid sick leave to which they are entitled under applicable law.

[ADDENDA ATTACHED: California Addendum; New York State Addendum; New York City Addendum; New Jersey Addendum; Illinois Addendum; Washington Addendum; Massachusetts Addendum; Colorado Addendum; Oregon Addendum; Minnesota Addendum; Maryland Addendum; Michigan Addendum; Arizona Addendum; Nevada Addendum; Rhode Island Addendum; Vermont Addendum; Connecticut Addendum; Maine Addendum; New Mexico Addendum]"`,
    },
    {
      title: "Regulatory Agency Guidance — DOL, EEOC, NLRB, OSHA",
      content: `REGULATORY AGENCY GUIDANCE AND ENFORCEMENT PRIORITIES

DEPARTMENT OF LABOR (DOL) — WAGE AND HOUR DIVISION
Current Enforcement Priorities (2024-2025):
- Worker classification (independent contractor vs. employee)
  * New independent contractor rule effective 3/11/2024 (29 CFR Part 795): economic reality test with 6 factors; no single factor determinative; totality of circumstances
  * Increased focus on misclassification in gig economy, construction, trucking, healthcare, janitorial
- FLSA overtime exemption enforcement
  * Final rule increasing salary threshold to $43,888 (7/1/2024) and $58,656 (1/1/2025); multiple court challenges pending
  * Highly compensated employee threshold increased to $132,964 (7/1/2024) and $151,164 (1/1/2025)
- Prevailing wage / Davis-Bacon Act enforcement (federal contractors)
- Agricultural worker protections (H-2A visa employers)

DOL FIELD ASSISTANCE BULLETINS — Employment:
- FAB 2024-1: Telework and FLSA — hours worked during remote work; employer monitoring obligations; home office expenses
- FAB 2023-2: PUMP Act implementation — lactation accommodations for nursing employees; 1-year coverage; private space requirements; functional nursery rooms
- WHD Opinion Letter FLSA2023-2: Rest periods vs. waiting time; on-call time compensation analysis

EQUAL EMPLOYMENT OPPORTUNITY COMMISSION (EEOC)
Strategic Enforcement Plan 2024-2028:
Priority 1: Eliminating barriers in recruitment and hiring (AI-assisted hiring tools, pre-employment screening)
Priority 2: Protecting workers vulnerable to intersectional discrimination (workers with multiple protected characteristics)
Priority 3: Addressing selected emerging employment discrimination issues (AI, algorithmic decision-making, accommodation for pregnancy conditions post-PWFA)
Priority 4: Advancing equal pay (pay transparency, intersectional pay gaps)
Priority 5: Preserving access to the legal system (anti-retaliation, mandatory arbitration, class waivers)

PWFA (Pregnant Workers Fairness Act) — effective 6/27/2023:
- Applies to employers with 15+ employees
- Requires reasonable accommodation for known limitations related to pregnancy, childbirth, or related medical conditions
- Does NOT require that the limitation substantially limit a major life activity (broader than ADA)
- Examples: Modified duties, telework, schedule changes, leave, light duty, access to closer restrooms/break room
- Final rule (June 2024): Broad list of covered conditions; includes abortion as covered condition; employer must engage in interactive process

AI and Algorithmic Tools Guidance:
- EEOC Technical Assistance (5/18/2023): Software, algorithms, and AI in employment decisions may violate Title VII, ADA, ADEA if they have disparate impact or are used to intentionally discriminate
- Employers responsible for tools used by vendors
- Accommodation obligations apply: Employees may need alternative testing/selection processes as ADA accommodation

NATIONAL LABOR RELATIONS BOARD (NLRB)
Key 2023-2024 Decisions and Rulemakings:
McLaren Macomb (2023): Employers may NOT include broad non-disparagement or confidentiality clauses in severance agreements offered to employees; employees must be able to file NLRB charges, communicate with Board, assist other employees
Stericycle, Inc. (2023): New workplace rule standard — facially neutral policies evaluated based on whether they would have a reasonable tendency to chill Section 7 rights; employer must show legitimate justification that outweighs chilling effect
Amazon.com Services LLC (2024): Key test for determining whether employee testimony constitutes protected concerted activity; broadened protection for individual employee activity
GC Memo 23-08 (Non-Competes): General Counsel's position that most non-compete agreements violate NLRA Section 7 (not yet binding law but signals enforcement priority)
Election Protection Rule (2023): Streamlined union election procedures; reduced delay opportunities; ambient captive audience meeting restrictions

OCCUPATIONAL SAFETY AND HEALTH ADMINISTRATION (OSHA)
National Emphasis Programs (Active 2024-2025):
- Warehousing and Distribution Centers (esp. Amazon, high-rate employers)
- Outdoor and Indoor Heat-Related Hazards (proposed heat standard in rulemaking)
- COVID-19 Healthcare Emergency Temporary Standard successor (infection control in healthcare)
- Silica crystalline (construction, maritime, general industry)

Proposed Rulemaking:
Heat Illness Prevention in Outdoor and Indoor Work Settings (NPRM 7/2024):
- Employers must develop written heat illness prevention plans
- Heat index triggers: Initial Heat Trigger (80°F) and High Heat Trigger (90°F)
- Rest, shade, water, acclimatization requirements
- Heat Safety Officer designation
- If finalized, would be most significant new OSHA standard in decades

Electronic Recordkeeping Rule (Effective 1/1/2024):
- Establishments 100+ employees in high-hazard industries: Submit 300 Log and 301 incident reports annually
- Establishments 20-249 employees in high-hazard industries: Submit 300A summary annually
- All establishments 250+: Submit 300A summary annually
- OSHA publishes data publicly — reputational and enforcement implications`,
    },
    {
      title: "Knowledge Graph — Employment Law Entity Relationships",
      content: `EMPLOYMENT LAW KNOWLEDGE GRAPH — ENTITY-RELATIONSHIP DEFINITIONS

CORE ENTITY DEFINITIONS

1. JURISDICTION
Definition: A geographic or political unit with authority to enact and enforce employment law
Attributes:
  - jurisdictionId (string): unique identifier
  - type: [state | county | city | federal | country | supranational]
  - name: full legal name
  - abbreviation: standard code (e.g., "CA", "NYC", "EU")
  - effectiveDate: date current legal regime is in effect
  - enforcementAgency: primary agency responsible for enforcement
  - preemptedBy: higher jurisdiction that overrides local law (if applicable)
  - memberOf: supranational body (EU, UN, etc.) if applicable

2. STATUTE
Definition: A law enacted by a legislative body establishing employment rights or obligations
Attributes:
  - citation: official citation (e.g., "Cal. Labor Code § 2810.3")
  - title: official name
  - shortName: common reference name (e.g., "FMLA", "FLSA")
  - enactingBody: [Congress | State Legislature | Local Council]
  - effectiveDate: when statute became effective
  - lastAmended: most recent amendment date
  - pendingAmendments: boolean, link to pending legislation
  - enforcementPenalties: description of penalty regime
  - federalFloor: boolean (sets minimum that states may exceed)
  - preemptsLocalLaw: boolean

3. REGULATION
Definition: An administrative rule issued by an agency implementing a statute
Attributes:
  - ruleNumber: CFR, state register, or agency docket number
  - issuingAgency: agency name
  - parentStatute: statute the regulation implements
  - applicabilityCriteria: conditions triggering application (employee count, industry, etc.)
  - complianceDeadline: date by which compliance is required
  - guidanceDocuments: agency FAQs, opinion letters, field guidance issued
  - safeHarbor: available compliance safe harbors

4. EMPLOYER OBLIGATION
Definition: A specific action an employer must take to comply with a statute or regulation
Attributes:
  - obligationType: [notice | posting | accommodation | recordkeeping | reporting | pay | training]
  - triggerCondition: conditions under which obligation arises
  - deadline: when obligation must be fulfilled
  - recipient: [employees | government | both]
  - method: how obligation may be satisfied (written, electronic, posting, etc.)
  - exemptions: employer size or type exemptions

5. POLICY
Definition: An employer's written document establishing workplace rules
Attributes:
  - policyType: handbook policy category
  - currentVersion: version number
  - lastReviewDate: when last reviewed by counsel
  - applicableJurisdictions: list of jurisdictions covered
  - gaps: identified compliance deficiencies
  - privilegeStatus: attorney-client privileged draft | approved for distribution

6. CLIENT PROFILE
Definition: Representation of an employer client using Littler advisory services
Attributes:
  - entityName: legal entity name
  - locations: list of jurisdiction × headcount pairs
  - industry: NAICS code and description
  - unionStatus: union/non-union/mixed
  - federalContractor: boolean (OFCCP obligations)
  - publicCompany: boolean (SEC disclosure considerations)
  - existingPolicies: current handbook policies on record
  - openActionItems: outstanding compliance recommendations
  - engagementPartner: responsible Littler attorney

7. ADVISORY
Definition: A legal research and compliance advisory delivered to a client
Attributes:
  - advisoryId: matter number
  - question: the compliance question posed
  - analysis: research and legal analysis
  - recommendation: compliance recommendation
  - jurisdiction: applicable jurisdiction(s)
  - topicTags: employment law topic categories
  - attorneyReviewer: reviewing attorney ID
  - confidenceLevel: 0-100
  - privilegeMarker: "PRIVILEGED AND CONFIDENTIAL — ATTORNEY-CLIENT PRIVILEGE"
  - billingCodes: matter number, billing code, hours

ENTITY RELATIONSHIPS

Jurisdiction -[ENACTS]-> Statute
  The jurisdiction's legislative body passes the statute
  Example: California Legislature -[ENACTS]-> Cal. Labor Code § 512 (meal period)

Statute -[IMPLEMENTED_BY]-> Regulation
  Executive agency promulgates regulations implementing the statute
  Example: FMLA -[IMPLEMENTED_BY]-> 29 CFR Part 825

Statute -[REQUIRES]-> Employer Obligation
  Statute imposes specific obligations on covered employers
  Example: NLRA § 7 -[REQUIRES]-> Employer Obligation (no interference with organizing)

Regulation -[CREATES]-> Employer Obligation
  Regulatory rule creates specific compliance requirements
  Example: OSHA Recordkeeping Rule -[CREATES]-> Form 300 Log maintenance obligation

Policy -[COVERS]-> Topic -[GOVERNED_BY]-> Statute(s) in Jurisdiction(s)
  A handbook policy covering paid leave is governed by multiple statutes in multiple jurisdictions
  Example: PTO Policy -[COVERS]-> Paid Leave Topic -[GOVERNED_BY]-> CA Labor Code § 246 in California

Client -[OPERATES_IN]-> Jurisdiction -[SUBJECT_TO]-> Regulatory Regime
  Client's presence in a jurisdiction triggers that jurisdiction's employment law requirements
  Example: ACME Corp -[OPERATES_IN]-> New York City -[SUBJECT_TO]-> NYC Human Rights Law

Statute -[AMENDED_BY]-> Amendment -[EFFECTIVE_ON]-> Date
  Tracks legislative amendment history and effective dates
  Example: FLSA -[AMENDED_BY]-> 2007 Minimum Wage Increase -[EFFECTIVE_ON]-> 2009-07-24

Advisory -[REFERENCES]-> Statute -[INTERPRETED_BY]-> Case Law / Agency Guidance
  Advisory conclusions are grounded in statutes interpreted through case law
  Example: FY2024 Overtime Advisory -[REFERENCES]-> FLSA § 13(a)(1) -[INTERPRETED_BY]-> Helix Energy Solutions v. Hewitt (2023)

Policy Gap -[IDENTIFIED_FOR]-> Client -[IN_JURISDICTION]-> State/Country
  A gap analysis output identifies specific gaps for a specific client in specific jurisdictions
  Example: Pay Transparency Gap -[IDENTIFIED_FOR]-> TechCorp Client -[IN_JURISDICTION]-> Colorado`,
    }
  ];

  for (const src of sources) {
    const result = await api("POST", `/api/knowledge-bases/${kb.id}/sources/text`, src);
    log("  ✓", `KB source added: ${src.title}`);
  }

  return kb;
}

// ─── 4. RUNBOOKS ─────────────────────────────────────────────────────────────

async function createRunbooks(agentId) {
  log("📋", "Creating 6 operational runbooks…");

  const runbookDefs = [
    {
      name: "Legislative Database Update Failure — Employment Compliance Agent",
      description:
        "Response procedure when the employment law legislative database fails to update, " +
        "preventing the agent from serving current statutory information. Covers fallback to " +
        "cached data, staleness warnings to end users, manual override procedures, and escalation " +
        "to data operations team for investigation and remediation.",
      industry: "legal_services",
      category: "data_quality",
      triggerType: "auto",
      triggerConditions: [
        { metric: "kb_staleness_days", operator: ">", value: 2 },
        { metric: "legislative_feed_last_sync", operator: "older_than", value: "48h" },
        { event: "source_ingestion_failure", source: "legislative_feed" }
      ],
      steps: [
        {
          stepNumber: 1,
          title: "Detect Update Failure",
          description: "Automated staleness monitor detects that legislative feed has not updated within 48-hour SLA",
          type: "automated",
          action: "Check knowledge base source sync timestamps; compare against expected update schedule",
          expectedOutput: "Staleness alert with last-sync timestamp and affected jurisdictions",
          timeoutMinutes: 5
        },
        {
          stepNumber: 2,
          title: "Activate Cached Data Fallback",
          description: "Switch agent to serve from last known good cache with staleness warning injected into all responses",
          type: "automated",
          action: "Set agent runtime flag: USE_CACHED_DATA=true; inject staleness disclaimer into all advisory outputs",
          expectedOutput: "Agent continues serving requests with disclaimer: 'Data as of [last_sync_date]. Legislative feeds currently unavailable — please verify time-sensitive requirements.'",
          timeoutMinutes: 2
        },
        {
          stepNumber: 3,
          title: "Notify Attorneys and Clients of Staleness",
          description: "Alert matter team attorneys of data staleness; advise manual verification for time-sensitive matters",
          type: "human_approval",
          responsibleRole: "Practice Technology Team",
          action: "Send alert to practice technology team; notify active matter attorneys via matter management system",
          timeoutMinutes: 30
        },
        {
          stepNumber: 4,
          title: "Investigate Feed Failure Root Cause",
          description: "Technology team investigates root cause of legislative feed failure",
          type: "human",
          responsibleRole: "Data Operations Engineer",
          action: "Check: API credentials validity; source website availability; ingestion pipeline logs; network connectivity to legislative data providers",
          timeoutMinutes: 120
        },
        {
          stepNumber: 5,
          title: "Execute Manual Override for Critical Updates",
          description: "For recently enacted legislation affecting active matters, manually ingest statutory text",
          type: "human",
          responsibleRole: "Legal Research Specialist",
          action: "Identify legislation enacted in past 48 hours affecting active client jurisdictions; manually ingest text via POST /api/knowledge-bases/:id/sources/text",
          timeoutMinutes: 60
        },
        {
          stepNumber: 6,
          title: "Restore Feed and Verify",
          description: "Restore legislative feed connectivity; trigger full resync; verify all jurisdictions updated",
          type: "automated",
          action: "Re-enable feed ingestion; run verification query across 50 states + federal; confirm all jurisdictions have < 24-hour staleness",
          expectedOutput: "All 51 jurisdictions (50 states + DC) confirmed updated; staleness warning removed from agent responses",
          timeoutMinutes: 60
        }
      ],
      approvalGates: [
        { step: 3, approver: "Practice Technology Manager", condition: "mandatory" }
      ],
      autonomyLevel: "confirm_before",
      severity: "high",
      estimatedDuration: "2-4 hours"
    },
    {
      name: "Conflicting Authority Alert — Multi-Jurisdiction Employment Law",
      description:
        "Escalation procedure when the Employment Compliance Agent identifies a novel conflict " +
        "between jurisdictions that has no established precedent in the knowledge base. Covers " +
        "identification, analysis summary preparation, routing to appropriate Littler subject " +
        "matter expert, attorney review, and knowledge base update with resolution.",
      industry: "legal_services",
      category: "escalation",
      triggerType: "auto",
      triggerConditions: [
        { metric: "conflict_resolution_confidence", operator: "<", value: 60 },
        { event: "novel_jurisdiction_conflict", threshold: "no_precedent_found" },
        { metric: "attorney_review_flag", operator: "=", value: true }
      ],
      steps: [
        {
          stepNumber: 1,
          title: "Capture Conflict Details",
          description: "Agent flags conflict and compiles analysis package for attorney review",
          type: "automated",
          action: "Generate conflict summary: jurisdictions involved, statutory citations, nature of conflict, client footprint impact, confidence score",
          expectedOutput: "Conflict Analysis Package: { jurisdictions, statutes, conflictDescription, affectedClients, confidenceScore, urgency }",
          timeoutMinutes: 5
        },
        {
          stepNumber: 2,
          title: "Identify Subject Matter Expert",
          description: "Route to appropriate Littler attorney based on jurisdiction and topic",
          type: "automated",
          action: "Query attorney directory for: primary state(s) involved, employment law topic, available SME; assign based on workload and expertise",
          expectedOutput: "Assigned attorney: name, office, contact info, expected response time",
          timeoutMinutes: 10
        },
        {
          stepNumber: 3,
          title: "Attorney Reviews Conflict",
          description: "Assigned Littler attorney reviews conflict analysis and provides resolution guidance",
          type: "human_approval",
          responsibleRole: "Littler Subject Matter Expert",
          action: "Attorney reviews conflict package; determines: (a) established resolution approach; (b) fact-specific analysis required; (c) novel issue requiring additional research",
          timeoutMinutes: 240
        },
        {
          stepNumber: 4,
          title: "Prepare Client Advisory",
          description: "Draft advisory memo with attorney-reviewed resolution recommendation",
          type: "human",
          responsibleRole: "Legal Research Specialist + Attorney",
          action: "Draft compliance memo: conflict analysis, resolution options, recommended approach, risk assessment, implementation steps; attorney reviews and approves",
          timeoutMinutes: 120
        },
        {
          stepNumber: 5,
          title: "Update Knowledge Base with Resolution",
          description: "Add attorney-reviewed resolution to knowledge base for future reference",
          type: "human",
          responsibleRole: "Knowledge Management Team",
          action: "Ingest conflict resolution precedent into KB with: jurisdiction pair, topic, conflict description, resolution approach, citation, attorney, date",
          timeoutMinutes: 30
        },
        {
          stepNumber: 6,
          title: "Deliver Advisory and Close",
          description: "Deliver advisory to client and archive in matter management system",
          type: "automated",
          action: "Route advisory through matter management system; update client watchlist; archive with billing codes",
          timeoutMinutes: 15
        }
      ],
      approvalGates: [
        { step: 3, approver: "Littler Subject Matter Expert", condition: "mandatory" },
        { step: 4, approver: "Responsible Attorney", condition: "mandatory" }
      ],
      autonomyLevel: "full_manual",
      severity: "high",
      estimatedDuration: "4-8 hours"
    },
    {
      name: "Client Handbook Bulk Review — Batch Processing Procedure",
      description:
        "Operational procedure for processing large-scale handbook review requests where a client " +
        "submits a full employee handbook (20+ policies) for multi-jurisdiction compliance review. " +
        "Covers batch processing configuration, priority ranking, progress reporting, and " +
        "attorney review queue management for high-severity gaps.",
      industry: "legal_services",
      category: "batch_processing",
      triggerType: "manual",
      triggerConditions: [
        { event: "handbook_review_request", policyCount: ">= 10" },
        { event: "annual_handbook_update", type: "comprehensive" }
      ],
      steps: [
        {
          stepNumber: 1,
          title: "Intake and Scope Assessment",
          description: "Assess handbook scope, client jurisdictions, priority topics, and timeline",
          type: "human",
          responsibleRole: "Client Intake Coordinator",
          action: "Collect: full handbook document, client jurisdiction list, headcount by state, union status, target completion date, priority topics. Create matter record.",
          expectedOutput: "Matter record created; scope document; timeline agreed with client",
          timeoutMinutes: 60
        },
        {
          stepNumber: 2,
          title: "Configure Batch Processing Parameters",
          description: "Set batch processing configuration for the handbook review",
          type: "human",
          responsibleRole: "Technology Team",
          action: "Configure: policy segmentation rules; jurisdiction filter (client states only); priority ranking (HIGH severity topics first); output format; attorney review routing",
          timeoutMinutes: 30
        },
        {
          stepNumber: 3,
          title: "Execute Phase 1 — High-Priority Policies",
          description: "Process policies covering highest-risk compliance topics first",
          type: "automated",
          action: "Process in order: (1) Leave policies; (2) Pay policies; (3) Harassment/EEO; (4) Classification; (5) Non-compete. Generate gap reports for each.",
          expectedOutput: "Phase 1 gap reports for top 5 policy categories; HIGH severity gaps flagged for immediate attorney review",
          timeoutMinutes: 120
        },
        {
          stepNumber: 4,
          title: "Attorney Review — High Severity Gaps",
          description: "Attorneys review and validate all HIGH severity gaps identified in Phase 1",
          type: "human_approval",
          responsibleRole: "Responsible Attorney",
          action: "Review each HIGH gap: confirm severity assessment; approve or modify recommended remediation language; flag any requiring client consultation",
          timeoutMinutes: 480
        },
        {
          stepNumber: 5,
          title: "Execute Phase 2 — Remaining Policies",
          description: "Process remaining handbook policies while Phase 1 attorney review is in progress",
          type: "automated",
          action: "Process remaining policies: remaining handbook sections not covered in Phase 1; generate gap reports; queue for attorney review",
          timeoutMinutes: 240
        },
        {
          stepNumber: 6,
          title: "Compile Master Gap Report",
          description: "Compile all individual gap analyses into comprehensive master report",
          type: "automated",
          action: "Aggregate all gap reports; calculate: total gaps by severity; coverage by jurisdiction; overall compliance score; priority remediation roadmap",
          expectedOutput: "Master gap report: executive summary; gaps by severity; gaps by jurisdiction; remediation priority matrix; estimated effort",
          timeoutMinutes: 30
        },
        {
          stepNumber: 7,
          title: "Client Delivery and Action Planning",
          description: "Deliver master gap report to client and develop remediation action plan",
          type: "human",
          responsibleRole: "Responsible Attorney + Client",
          action: "Schedule delivery call; walk through master report; agree on remediation priorities and timeline; establish handbook update project plan",
          timeoutMinutes: 120
        }
      ],
      approvalGates: [
        { step: 4, approver: "Responsible Attorney", condition: "mandatory" },
        { step: 7, approver: "Responsible Attorney", condition: "mandatory" }
      ],
      autonomyLevel: "confirm_before",
      severity: "medium",
      estimatedDuration: "1-3 days"
    },
    {
      name: "Emergency Regulation Response — New Employment Law Enactment",
      description:
        "Rapid response procedure for significant new employment legislation or regulation with " +
        "immediate or near-term effective date. Covers rapid advisory generation, client blast " +
        "notification via Littler ASAP, FAQ preparation, and handbook update recommendations " +
        "for affected clients.",
      industry: "legal_services",
      category: "emergency_response",
      triggerType: "auto",
      triggerConditions: [
        { event: "major_legislation_enacted", effectiveDateDays: "<= 90" },
        { event: "emergency_regulation_issued", impact: "broad" },
        { event: "court_ruling_major_impact", scope: "nationwide_or_circuit" }
      ],
      steps: [
        {
          stepNumber: 1,
          title: "Detect and Classify New Legislation",
          description: "Legislative tracking skill detects significant new employment law development",
          type: "automated",
          action: "Classify legislation: jurisdiction scope, affected employers, effective date, compliance actions required, urgency level (CRITICAL/HIGH/MEDIUM)",
          expectedOutput: "Classification report: { name, jurisdiction, effectiveDate, urgencyLevel, affectedEmployerCount, complianceActionsRequired }",
          timeoutMinutes: 15
        },
        {
          stepNumber: 2,
          title: "Draft Rapid Advisory Summary",
          description: "Agent drafts initial advisory summary for attorney review",
          type: "automated",
          action: "Generate: What changed, Who is affected, What employers must do, By when, Recommended immediate actions. Flag for attorney review.",
          expectedOutput: "Draft advisory with: statute text, key requirements, employer obligations, deadlines, initial compliance recommendations",
          timeoutMinutes: 30
        },
        {
          stepNumber: 3,
          title: "Attorney Review — Rapid Turnaround",
          description: "Practice group attorney reviews and approves advisory within 4-hour SLA",
          type: "human_approval",
          responsibleRole: "Practice Group Leader + SME Attorney",
          action: "Review accuracy of statutory analysis; approve compliance recommendations; add jurisdiction-specific nuances; approve for ASAP publication",
          timeoutMinutes: 240
        },
        {
          stepNumber: 4,
          title: "Publish Littler ASAP Client Alert",
          description: "Publish attorney-approved alert to Littler ASAP publication system",
          type: "automated",
          action: "Push approved alert to ASAP CMS; tag with jurisdiction, topic, date; notify subscribers by industry and jurisdiction",
          timeoutMinutes: 30
        },
        {
          stepNumber: 5,
          title: "Identify and Notify Affected Clients",
          description: "Identify clients with relevant jurisdiction footprint and send targeted notification",
          type: "automated",
          action: "Query client database for jurisdiction match; generate personalized client notifications referencing their specific employee count and affected locations; route through matter management system",
          expectedOutput: "Client notifications sent; matter records updated; follow-up tasks created for each client",
          timeoutMinutes: 60
        },
        {
          stepNumber: 6,
          title: "Prepare Employer FAQ",
          description: "Generate FAQ document covering most common employer questions about the new requirement",
          type: "automated",
          action: "Generate 10-15 Q&A pairs addressing: applicability, effective date, required actions, common situations, penalties. Flag for attorney review.",
          timeoutMinutes: 60
        },
        {
          stepNumber: 7,
          title: "Update Knowledge Base",
          description: "Ingest new legislation and approved advisory content into employment law KB",
          type: "automated",
          action: "Ingest: statute text, final regulations (if any), ASAP publication, FAQ, attorney analysis. Update jurisdiction survey entries.",
          timeoutMinutes: 30
        }
      ],
      approvalGates: [
        { step: 3, approver: "Practice Group Leader", condition: "mandatory" },
        { step: 6, approver: "Responsible Attorney", condition: "mandatory" }
      ],
      autonomyLevel: "confirm_before",
      severity: "critical",
      estimatedDuration: "4-8 hours"
    },
    {
      name: "Confidence Score Below Threshold — Attorney Review Routing",
      description:
        "Automated escalation procedure when the agent's confidence score on an employment law " +
        "advisory falls below the 70% threshold. Ensures all low-confidence responses are " +
        "reviewed by a qualified Littler attorney before delivery, with appropriate context " +
        "package and UPL-compliant framing.",
      industry: "legal_services",
      category: "quality_assurance",
      triggerType: "auto",
      triggerConditions: [
        { metric: "advisory_confidence_score", operator: "<", value: 70 },
        { metric: "risk_tier", operator: "=", value: "HIGH" },
        { event: "novel_legal_question", noDirectPrecedent: true }
      ],
      steps: [
        {
          stepNumber: 1,
          title: "Capture Low-Confidence Advisory",
          description: "Agent flags advisory with confidence < 70 and generates context package",
          type: "automated",
          action: "Compile: original question, research performed, applicable statutes (with gaps noted), initial recommendation, confidence score, reason for low confidence (novel issue / conflicting authority / insufficient data), urgency level",
          expectedOutput: "Attorney Review Package with all research artifacts and confidence rationale",
          timeoutMinutes: 5
        },
        {
          stepNumber: 2,
          title: "Route to Attorney with Context",
          description: "Route context package to appropriate attorney based on topic and jurisdiction",
          type: "automated",
          action: "Assign to: practice group attorney for topic area; include all research artifacts; set SLA based on urgency (URGENT: 2hr, HIGH: 4hr, NORMAL: 24hr)",
          expectedOutput: "Attorney notified with context package; matter record updated; SLA timer started",
          timeoutMinutes: 10
        },
        {
          stepNumber: 3,
          title: "Attorney Performs Supplemental Analysis",
          description: "Attorney reviews agent's research and performs any additional analysis needed",
          type: "human",
          responsibleRole: "Assigned Attorney",
          action: "Review agent research; perform any additional Westlaw/Lexis research; determine final legal position; prepare conclusion for client",
          timeoutMinutes: 120
        },
        {
          stepNumber: 4,
          title: "Attorney Approves Final Advisory",
          description: "Attorney reviews, edits, and approves the final advisory for delivery",
          type: "human_approval",
          responsibleRole: "Assigned Attorney",
          action: "Review complete advisory; confirm UPL-compliant framing; add attorney attestation; approve for delivery to client",
          expectedOutput: "Attorney-approved advisory with: confidence level updated to 'Attorney Reviewed', privilege markers, attorney name and signature",
          timeoutMinutes: 60
        },
        {
          stepNumber: 5,
          title: "Deliver Attorney-Reviewed Advisory",
          description: "Deliver approved advisory to client with attorney review attestation",
          type: "automated",
          action: "Deliver advisory through matter management system with attorney review notation; update billing records; archive",
          timeoutMinutes: 10
        },
        {
          stepNumber: 6,
          title: "Update KB with Attorney Analysis",
          description: "If attorney analysis resolved a knowledge gap, update KB to improve future confidence",
          type: "human",
          responsibleRole: "Knowledge Management Team",
          action: "Add attorney-reviewed analysis to KB if it represents novel or clarified legal guidance. Include: question type, jurisdiction, legal conclusion, citations, attorney reviewer.",
          timeoutMinutes: 30
        }
      ],
      approvalGates: [
        { step: 4, approver: "Assigned Attorney", condition: "mandatory" }
      ],
      autonomyLevel: "full_manual",
      severity: "high",
      estimatedDuration: "2-4 hours"
    },
    {
      name: "Multi-Jurisdiction Complexity Overflow — Decomposition and Parallel Processing",
      description:
        "Procedure for handling extremely complex multi-jurisdiction compliance questions that " +
        "exceed single-request processing capacity. Covers inquiry decomposition into jurisdiction " +
        "sub-analyses, parallel processing across agent instances, result consolidation, and " +
        "final synthesis advisory production.",
      industry: "legal_services",
      category: "capacity_management",
      triggerType: "auto",
      triggerConditions: [
        { metric: "jurisdiction_count", operator: ">", value: 15 },
        { metric: "policy_topics_in_scope", operator: ">", value: 5 },
        { metric: "context_window_utilization", operator: ">", value: 85 }
      ],
      steps: [
        {
          stepNumber: 1,
          title: "Detect Complexity Overflow",
          description: "Agent detects that inquiry scope exceeds single-processing capacity",
          type: "automated",
          action: "Assess: jurisdiction count, topic count, document volume, estimated token requirement. If exceeds threshold, trigger decomposition procedure.",
          expectedOutput: "Complexity assessment: { jurisdictions: N, topics: N, estimatedTokens: N, decompositionRequired: true }",
          timeoutMinutes: 5
        },
        {
          stepNumber: 2,
          title: "Decompose Inquiry by Jurisdiction Group",
          description: "Break inquiry into jurisdiction-grouped sub-analyses for parallel processing",
          type: "automated",
          action: "Group jurisdictions: (a) by geographic region; (b) by regulatory similarity; (c) by client priority. Create sub-inquiry for each group covering all topics.",
          expectedOutput: "N sub-inquiries (typically 3-8 groups), each manageable within single processing context",
          timeoutMinutes: 15
        },
        {
          stepNumber: 3,
          title: "Parallel Processing — All Jurisdiction Groups",
          description: "Process all jurisdiction sub-groups simultaneously",
          type: "automated",
          action: "Execute parallel analysis for each group: query KB, identify requirements, identify gaps, generate per-jurisdiction gap analysis. Track completion status.",
          expectedOutput: "Individual gap analysis reports for each jurisdiction group",
          timeoutMinutes: 120
        },
        {
          stepNumber: 4,
          title: "Consolidate Results",
          description: "Aggregate all jurisdiction-group results into unified analysis",
          type: "automated",
          action: "Merge gap reports: deduplicate common requirements, identify nationwide vs. state-specific issues, create consolidated gap matrix (topic × jurisdiction)",
          expectedOutput: "Consolidated gap matrix; cross-jurisdiction conflict flags; harmonization opportunities identified",
          timeoutMinutes: 30
        },
        {
          stepNumber: 5,
          title: "Attorney Review — Synthesis and Validation",
          description: "Attorney reviews consolidated analysis for accuracy and completeness",
          type: "human_approval",
          responsibleRole: "Lead Attorney",
          action: "Review consolidated analysis; verify major jurisdiction requirements; confirm conflict identifications; approve for final advisory production",
          timeoutMinutes: 240
        },
        {
          stepNumber: 6,
          title: "Generate Master Advisory and Roadmap",
          description: "Produce final master advisory with prioritized remediation roadmap",
          type: "automated",
          action: "Generate: executive summary; jurisdiction-by-jurisdiction compliance requirements; cross-jurisdiction conflict analysis; harmonized policy recommendations; priority action roadmap with deadlines",
          timeoutMinutes: 60
        }
      ],
      approvalGates: [
        { step: 5, approver: "Lead Attorney", condition: "mandatory" }
      ],
      autonomyLevel: "confirm_before",
      severity: "medium",
      estimatedDuration: "4-12 hours"
    }
  ];

  const runbooks = [];
  for (const rb of runbookDefs) {
    const runbook = await api("POST", "/api/runbooks", rb);
    log("  ✓", `Runbook created: ${runbook.id} — ${runbook.name.slice(0, 60)}`);
    runbooks.push(runbook);
  }
  return runbooks;
}

// ─── 5. GOVERNANCE POLICIES ──────────────────────────────────────────────────

async function createPolicies(agentId) {
  log("🛡️", "Creating 6 governance policies…");

  const policyDefs = [
    {
      name: "Attorney-Client Privilege Protection — Employment Advisory",
      domain: "content_boundaries",
      scopeType: "agent",
      scopeId: agentId,
      description:
        "All advisory outputs generated by the Employment Compliance & Policy Advisory Agent " +
        "must include attorney-client privilege markers when reviewed by a Littler attorney. " +
        "Privileged content must not be disclosed to unauthorized parties, stored in non-privileged " +
        "repositories, or referenced in non-privileged contexts. Agent must classify each output " +
        "as privileged or non-privileged based on attorney involvement.",
      policyJson: {
        policyId: "LEGAL-POL-001",
        agentCode: "LIT-AGT-001",
        regulatoryBasis: ["ABA Model Rule 1.6", "Work Product Doctrine", "Common Law Attorney-Client Privilege"],
        requirements: [
          "All outputs involving attorney analysis must include: 'PRIVILEGED AND CONFIDENTIAL — ATTORNEY-CLIENT COMMUNICATION AND/OR ATTORNEY WORK PRODUCT'",
          "Agent must track whether attorney has reviewed each advisory and apply privilege marker accordingly",
          "Privileged outputs must not be stored in non-privileged data repositories",
          "No privileged content from one client matter may be disclosed in response to another client's query",
          "Privilege waiver risk must be assessed before any disclosure — route to attorney if uncertain"
        ],
        automatedEnforcement: [
          "Inject privilege header on all attorney-reviewed outputs",
          "Block outputs that would disclose one client's privileged information to another",
          "Flag for attorney review any output that may waive privilege"
        ],
        confidenceThreshold: 90,
        violationSeverity: "CRITICAL",
        remediationRequired: true
      }
    },
    {
      name: "Unauthorized Practice of Law (UPL) Prevention",
      domain: "output_validation",
      scopeType: "agent",
      scopeId: agentId,
      description:
        "The Employment Compliance & Policy Advisory Agent must not provide legal advice that " +
        "constitutes the unauthorized practice of law. All outputs must be framed as legal " +
        "research assistance, compliance analysis, or general information requiring attorney " +
        "review — not as definitive legal advice. High-confidence responses still require " +
        "appropriate framing to avoid UPL exposure.",
      policyJson: {
        policyId: "LEGAL-POL-002",
        agentCode: "LIT-AGT-001",
        regulatoryBasis: [
          "State Bar UPL Rules (all 50 states)",
          "ABA Model Rule 5.5 (Unauthorized Practice of Law)",
          "American Bar Foundation — AI and UPL Guidelines"
        ],
        requirements: [
          "All agent outputs must include UPL disclaimer: 'This analysis is provided as legal research assistance and does not constitute legal advice. Please consult with a qualified Littler attorney before taking action.'",
          "Agent must not state: 'You should do X' without attorney review — use: 'Based on the statutory requirements, the following approach may be appropriate...'",
          "High-confidence outputs (≥70) may use more definitive research conclusions but must still require attorney review for final advice",
          "Low-confidence outputs (<70) must explicitly state attorney review is required before any action",
          "International advisory outputs must note that local counsel review is required in each jurisdiction"
        ],
        prohibitedPhrases: [
          "This is legal advice",
          "You are legally required to",
          "Your legal obligation is",
          "You will win/lose this case",
          "No attorney review is needed"
        ],
        requiredPhrases: [
          "This analysis is provided as legal research assistance",
          "Please consult with a qualified attorney",
          "This does not constitute legal advice",
          "Attorney review is recommended before taking action"
        ],
        violationSeverity: "CRITICAL",
        confidenceThreshold: 95
      }
    },
    {
      name: "State Bar Ethics Compliance — Technology-Assisted Legal Services",
      domain: "compliance_enforcement",
      scopeType: "agent",
      scopeId: agentId,
      description:
        "Compliance policy ensuring the Employment Compliance Agent operates in accordance with " +
        "state bar ethics rules governing technology-assisted legal services, including jurisdiction-specific " +
        "rules on AI in legal practice, supervision of non-lawyer AI tools, and disclosure obligations " +
        "to clients regarding AI assistance.",
      policyJson: {
        policyId: "LEGAL-POL-003",
        agentCode: "LIT-AGT-001",
        regulatoryBasis: [
          "ABA Formal Opinion 512 (2023) — Generative AI Tools",
          "ABA Model Rule 1.1 — Competence (tech competence duty)",
          "ABA Model Rule 5.3 — Responsibilities Regarding Nonlawyer Assistance",
          "State-specific AI guidance: California (CA State Bar Practical Guidance 2024), New York (NYSBA Report 2024), Florida, Texas, and others",
          "ABA Center for Innovation — AI Principles for Legal Practice"
        ],
        requirements: [
          "Supervising attorney must review and take responsibility for all AI-generated legal analysis",
          "Agent outputs must be disclosed to clients as AI-assisted where required by applicable state ethics rules",
          "Agent must not independently file documents, send client communications, or take legal action without attorney review",
          "Attorney must independently verify statutory citations before relying on agent analysis",
          "Usage logs must be maintained for professional responsibility purposes"
        ],
        supervisionRequirements: {
          reviewRequired: true,
          reviewerRole: "Licensed Attorney",
          verificationRequired: ["statutory citations", "regulatory references", "case law citations"],
          loggingRequired: true,
          logRetentionYears: 7
        },
        violationSeverity: "HIGH",
        confidenceThreshold: 85
      }
    },
    {
      name: "Client Data Confidentiality and Isolation",
      domain: "data_governance",
      scopeType: "agent",
      scopeId: agentId,
      description:
        "Strict data isolation policy ensuring client-specific information, prior advisories, " +
        "policy documents, and matter details are never disclosed in response to queries from " +
        "other clients. Enforces encryption at rest and in transit for all client data handled " +
        "by the agent, and prohibits cross-client data contamination.",
      policyJson: {
        policyId: "LEGAL-POL-004",
        agentCode: "LIT-AGT-001",
        regulatoryBasis: [
          "ABA Model Rule 1.6 — Confidentiality of Information",
          "ABA Model Rule 1.9 — Duties to Former Clients",
          "GDPR Article 5 (data minimization, purpose limitation)",
          "State bar confidentiality rules (all 50 states)",
          "Littler Firm Information Security Policy"
        ],
        requirements: [
          "Client data may only be retrieved in context of the active client matter — no cross-client queries permitted",
          "All client information must be encrypted at rest (AES-256) and in transit (TLS 1.3+)",
          "Agent memory must be scoped to the active matter ID — prior matter context must be cleared between client sessions",
          "Prior advisory content is attorney-client privileged and may not be referenced for other clients",
          "Agent must log all data access events for audit purposes"
        ],
        isolationRules: {
          crossClientDataProhibited: true,
          matterScopedMemory: true,
          encryptionRequired: { atRest: "AES-256", inTransit: "TLS-1.3" },
          auditLoggingRequired: true,
          retentionAfterMatterClose: "7 years per engagement letter"
        },
        violationSeverity: "CRITICAL",
        automatedEnforcement: [
          "Matter-ID-scoped context retrieval — refuse requests without valid matter ID",
          "Audit log all KB retrievals with client ID and matter ID",
          "Block any response containing client name not matching active matter"
        ]
      }
    },
    {
      name: "ABA Model Rules Compliance — Rules 1.1, 1.6, 5.3",
      domain: "compliance_enforcement",
      scopeType: "agent",
      scopeId: agentId,
      description:
        "Comprehensive policy enforcing compliance with ABA Model Rules of Professional Conduct " +
        "most relevant to AI-assisted legal services: Rule 1.1 (Competence), Rule 1.6 " +
        "(Confidentiality), and Rule 5.3 (Supervision of Nonlawyers). Defines specific " +
        "requirements for each rule and automated enforcement mechanisms.",
      policyJson: {
        policyId: "LEGAL-POL-005",
        agentCode: "LIT-AGT-001",
        regulatoryBasis: [
          "ABA Model Rule 1.1 — Competence",
          "ABA Model Rule 1.6 — Confidentiality of Information",
          "ABA Model Rule 5.3 — Responsibilities Regarding Nonlawyer Assistance",
          "ABA Formal Opinion 512 (2023) — all three rules applied to generative AI"
        ],
        ruleRequirements: {
          rule_1_1_competence: {
            description: "Lawyers must maintain competence in technology relevant to their practice",
            agentRequirements: [
              "Agent knowledge base must be updated within 30-day staleness threshold",
              "Agent must cite authority for all legal propositions — no unsupported assertions",
              "Agent must flag when a legal question is outside its competence (novel area, insufficient precedent)",
              "Supervising attorney must be competent in reviewing AI-generated legal analysis"
            ]
          },
          rule_1_6_confidentiality: {
            description: "Lawyers must not reveal client confidential information",
            agentRequirements: [
              "Client information never disclosed outside active matter context",
              "Prior advisory content privilege-protected",
              "Encryption required for all client data",
              "Attorney approval required before any client data disclosure"
            ]
          },
          rule_5_3_supervision: {
            description: "Lawyers are responsible for conduct of nonlawyers they supervise",
            agentRequirements: [
              "All agent outputs subject to attorney review before client delivery",
              "Attorney takes professional responsibility for agent-assisted analysis",
              "Supervising attorney must understand agent capabilities and limitations",
              "Attorney must correct any agent errors before they reach client"
            ]
          }
        },
        violationSeverity: "CRITICAL",
        minimumReviewRequired: "licensed_attorney"
      }
    },
    {
      name: "Matter-Specific Data Retention — Employment Advisory Records",
      domain: "data_governance",
      scopeType: "agent",
      scopeId: agentId,
      description:
        "Data retention policy for all advisory records, analysis documents, client communications, " +
        "and agent interaction logs created by the Employment Compliance Agent. Implements " +
        "matter-specific retention schedules per client engagement letter terms and firm policy, " +
        "with automatic archival and deletion workflows.",
      policyJson: {
        policyId: "LEGAL-POL-006",
        agentCode: "LIT-AGT-001",
        regulatoryBasis: [
          "ABA Model Rule 1.15 — Safekeeping Property",
          "State-specific file retention rules (varies 5-10 years by state)",
          "GDPR Article 5(e) — Storage Limitation",
          "Client Engagement Letter Terms",
          "Littler Records Retention Policy"
        ],
        retentionSchedules: {
          activeMatters: {
            retention: "Duration of matter + 7 years post-close",
            storageLocation: "iManage matter management system",
            accessControl: "Matter team only"
          },
          agentInteractionLogs: {
            retention: "7 years from session date",
            storageLocation: "Audit log system (privileged)",
            accessControl: "Risk management team + supervising attorney"
          },
          knowledgeBaseContent: {
            retention: "Indefinite (firm knowledge asset)",
            storageLocation: "Vector database",
            accessControl: "Firm-wide read; attorney-level write"
          },
          workingMemory: {
            retention: "Session end — delete immediately",
            storageLocation: "Ephemeral session memory",
            accessControl: "Active session only"
          },
          clientUploads: {
            retention: "Matter retention schedule per engagement letter",
            storageLocation: "Client file in iManage",
            accessControl: "Matter team + client"
          }
        },
        automaticActions: [
          { trigger: "session_end", action: "delete_working_memory" },
          { trigger: "matter_close + 7 years", action: "archive_to_cold_storage" },
          { trigger: "gdpr_erasure_request", action: "anonymize_personal_data", sla_days: 30 },
          { trigger: "client_withdrawal", action: "transfer_file_to_successor_counsel" }
        ],
        violationSeverity: "HIGH"
      }
    }
  ];

  const policies = [];
  for (const pol of policyDefs) {
    const policy = await api("POST", "/api/policies", pol);
    log("  ✓", `Policy created: ${policy.id} — ${policy.name.slice(0, 60)}`);
    policies.push(policy);
  }
  return policies;
}

// ─── 6. GOLDEN DATASET ───────────────────────────────────────────────────────

async function createGoldenDataset() {
  log("🗂️", "Creating golden evaluation dataset…");

  const dataset = await api("POST", "/api/golden-datasets", {
    name: "Employment Compliance & Policy Advisory — Eval Dataset",
    description:
      "Comprehensive evaluation dataset for the Employment Compliance & Policy Advisory Agent " +
      "(LIT-AGT-001). Contains 1,000+ historical compliance inquiries with known correct answers, " +
      "multi-state conflict scenarios, new legislation response benchmarks, policy drafting " +
      "accuracy cases, and jurisdiction identification edge cases.",
    industry: "legal_services",
    useCase: "Employment Law Compliance Advisory",
    version: "1.0",
    scenarioCategories: [
      "Multi-state paid leave compliance",
      "Non-compete enforceability across jurisdictions",
      "New legislation response — rapid advisory",
      "Policy drafting accuracy — 20+ topics",
      "Jurisdiction identification edge cases",
      "Cannabis policy — off-duty use accommodation",
      "Pay transparency — multi-state compliance",
      "FMLA/state leave concurrent obligations",
      "UPL-compliant framing validation",
      "Attorney-client privilege marker verification",
      "Confidence score calibration",
      "Emergency regulation response speed"
    ],
    qualityCoverage: {
      jurisdictionCoverage: "50 states + DC + federal + 10 international jurisdictions",
      topicCoverage: "60+ employment law topics",
      temporalCoverage: "2019-2025 legislation",
      difficultyDistribution: { easy: "20%", medium: "50%", hard: "25%", novel: "5%" }
    },
    performanceBenchmarks: {
      jurisdictionAccuracy: { target: 0.95, description: "Correctly identify all applicable jurisdictions" },
      statutoryCitationAccuracy: { target: 0.98, description: "Provide accurate statute citations" },
      gapDetectionRate: { target: 0.92, description: "Identify all HIGH-severity compliance gaps" },
      policyDraftingAccuracy: { target: 0.90, description: "Attorney-validated policy language" },
      escalationPrecision: { target: 0.95, description: "Correctly route low-confidence queries to attorney" },
      responseLatencyP95: { target: 15000, description: "P95 latency in milliseconds" },
      uplComplianceRate: { target: 1.0, description: "All outputs UPL-compliant framing" }
    },
    tags: ["employment-law", "legal-services", "multi-state", "compliance", "LIT-AGT-001", "Littler"],
    status: "active"
  });

  log("  ✓", `Golden dataset created: ${dataset.id}`);

  // Add representative test cases
  const testCases = [
    {
      name: "California Non-Compete — Post SB 699",
      inputData: {
        question: "Our company is headquartered in Texas but has employees in California. We want to include a non-compete agreement in our offer letters. Is this permissible?",
        clientJurisdictions: ["CA", "TX"],
        topic: "non-compete",
        urgency: "normal"
      },
      expectedOutput: {
        answer: "Non-compete agreements are void and unenforceable in California under Business & Professions Code Section 16600. SB 699 (effective January 1, 2024) makes this prohibition applicable even if the agreement was entered into in another state and prohibits employers from attempting to enforce out-of-state non-competes against California employees. Additionally, AB 1076 (effective January 1, 2024) requires employers to notify current and former employees that existing non-competes are void. The Texas agreement would be enforceable as to Texas employees but cannot apply to California employees regardless of where the agreement was signed.",
        jurisdictions: ["CA", "TX"],
        citations: ["Cal. Bus. & Prof. Code § 16600", "SB 699 (Ch. 765, 2023)", "AB 1076 (Ch. 828, 2023)"],
        confidence: 98,
        uplCompliant: true,
        privilegeRequired: false
      },
      tags: ["non-compete", "california", "multi-state", "SB699"],
      expectedBehavior: "Agent must correctly identify CA ban, cite SB 699 and AB 1076, distinguish CA from TX employees, and note notification obligation"
    },
    {
      name: "Multi-State Paid Sick Leave — Remote Workers",
      inputData: {
        question: "We have employees working remotely from their home states. Which paid sick leave law applies — where the company is headquartered (Delaware) or where the employee works from home?",
        clientJurisdictions: ["DE", "CA", "NY", "WA", "CO", "IL"],
        topic: "paid-sick-leave",
        employeeScenario: "remote workers in multiple states"
      },
      expectedOutput: {
        answer: "For remote workers, the applicable paid sick leave law is generally the law of the jurisdiction where the employee physically performs their work — i.e., their home state. Delaware does not have a statewide paid sick leave law (beyond limited local ordinances), so Delaware headquarters does not help with remote employees. California employees are entitled to up to 40 hours of paid sick leave under SB 616 (effective 1/1/2024). New York employees accrue per NY PSL. Washington employees accrue at 1 hour per 40 worked. Colorado employees are covered under HFWA (48 hours). Illinois employees are entitled to 40 hours under Illinois Paid Leave for All Workers Act (effective 1/1/2024). The company must comply with each employee's home state law.",
        jurisdictionMapping: {
          CA: "40 hrs/year (SB 616, eff. 1/1/2024)",
          NY: "56 hrs (100+ employees); 40 hrs (5-99 employees)",
          WA: "1 hr per 40 worked",
          CO: "48 hrs/year (HFWA)",
          IL: "40 hrs/year (Paid Leave for All Workers Act, eff. 1/1/2024)",
          DE: "No statewide law"
        },
        citations: [
          "Cal. Labor Code § 246 (as amended by SB 616)",
          "NY Labor Law § 196-b",
          "Wash. Rev. Code § 49.46.210",
          "Colo. Rev. Stat. § 8-13.3-402",
          "820 ILCS 192 (Paid Leave for All Workers Act)"
        ],
        confidence: 95,
        uplCompliant: true
      },
      tags: ["paid-sick-leave", "remote-work", "multi-state", "jurisdiction-determination"]
    },
    {
      name: "New Legislation — Colorado FAMLI Response",
      inputData: {
        question: "Colorado's FAMLI (Family and Medical Leave Insurance) program just started. What do we need to do?",
        clientJurisdictions: ["CO"],
        topic: "state-fmla",
        legislation: "Colorado FAMLI",
        urgency: "high"
      },
      expectedOutput: {
        answer: "Colorado's Family and Medical Leave Insurance (FAMLI) program began employee premium collection on January 1, 2023, and benefits became available on January 1, 2024. Employer obligations: (1) Post FAMLI notice in workplace — required posting (Spanish/English). (2) Collect employee premium contributions: employees pay 0.45% of wages (employees with 10+ workers); employers with 10+ employees pay additional 0.45% (total 0.9%). (3) Remit premiums quarterly to Colorado FAMLI Division. (4) Update handbook to reflect FAMLI entitlement: up to 12 weeks (16 weeks for pregnancy complications/bonding). (5) Update leave administration to run FAMLI concurrently with FMLA where applicable. (6) Notify employees of FAMLI rights in writing.",
        immediateActions: [
          "Post required FAMLI workplace notice",
          "Update payroll system for premium withholding",
          "File quarterly premium reports",
          "Update employee handbook leave policy",
          "Train HR on FAMLI administration"
        ],
        citations: ["C.R.S. § 8-13.3-501 et seq.", "FAMLI Rules, 7 CCR 1107-4"],
        confidence: 94,
        responseTime: "immediate"
      },
      tags: ["FAMLI", "colorado", "state-leave", "new-legislation", "emergency-response"]
    },
    {
      name: "Cannabis Policy — California Off-Duty Use (AB 2188)",
      inputData: {
        question: "Can we still test employees for marijuana in California? We have a zero-tolerance drug policy.",
        clientJurisdictions: ["CA"],
        topic: "cannabis-policy",
        safetySenativity: "mixed workforce"
      },
      expectedOutput: {
        answer: "California AB 2188 (effective January 1, 2024) significantly restricts employer drug testing for cannabis. Employers may no longer discriminate against employees or job applicants based on their off-duty cannabis use OR based on a drug test that detects non-psychoactive cannabis metabolites (which indicate past use, not current impairment). Zero-tolerance policies based on positive cannabis tests are no longer permissible for non-federally-regulated positions. EXCEPTIONS: (1) Federal contractors where federal law applies; (2) jobs with federal background investigation requirements; (3) drug testing required by state or federal law. Employers may still test for impairment at work using observation-based assessments. The law applies to pre-employment testing (cannot refuse to hire based on positive cannabis metabolite test) and during employment.",
        policiesRequired: [
          "Remove cannabis from zero-tolerance pre-employment screening (for non-federal-contractor roles)",
          "Train supervisors on observation-based impairment assessment",
          "Update drug and alcohol policy to reflect AB 2188",
          "Identify safety-sensitive roles eligible for continued testing under law"
        ],
        exceptions: ["Federal contractors", "Federal background investigation roles", "Positions required to test by federal or state law"],
        citations: ["Cal. Gov. Code § 12954 (AB 2188)"],
        confidence: 97,
        uplCompliant: true
      },
      tags: ["cannabis", "drug-testing", "california", "AB2188", "off-duty-activity"]
    },
    {
      name: "Handbook Review — Jurisdiction Identification Edge Case: Remote Worker",
      inputData: {
        question: "We have an employee who works from home in New Hampshire but their employment agreement says New York law governs. Which state's employment laws apply?",
        clientJurisdictions: ["NH", "NY"],
        topic: "jurisdiction-identification",
        scenario: "choice-of-law-clause"
      },
      expectedOutput: {
        answer: "New Hampshire employment law generally applies because the employee physically works in New Hampshire, regardless of the choice-of-law clause in the employment agreement. Most employment statutes are mandatory protections that cannot be contracted away. New Hampshire's statute of limitations, wage payment laws, and any applicable leave laws apply. However, New York's broader anti-discrimination protections may also apply if the employer is 'doing business' in New York (which it likely is if headquartered there). Key analysis: (1) NH mandatory employment protections apply based on work location. (2) NY anti-discrimination law may apply to the employer's New York operations. (3) The choice-of-law clause is enforceable for contractual disputes but not for statutory employment protections where NH has a materially greater interest. (4) For any benefits subject to ERISA, federal preemption may override state law.",
        jurisdictionConclusion: "New Hampshire employment statutes apply; New York anti-discrimination law may apply to employer's NY operations",
        confidence: 82,
        escalationFlag: "attorney_review_recommended",
        citations: ["RESTATEMENT (SECOND) OF CONFLICT OF LAWS § 187-188", "NH RSA Title XXIII", "NY Labor Law"],
        uplCompliant: true
      },
      tags: ["jurisdiction-identification", "choice-of-law", "remote-work", "edge-case", "attorney-review"]
    },
    {
      name: "Policy Drafting — Pay Transparency Multi-State",
      inputData: {
        question: "Draft a pay transparency policy for our job postings. We post positions nationally and remote roles. We have employees in California, New York, Colorado, Washington, and Illinois.",
        clientJurisdictions: ["CA", "NY", "CO", "WA", "IL"],
        topic: "pay-transparency",
        requestType: "policy-drafting"
      },
      expectedOutput: {
        draftPolicy: "Pay Transparency Policy — Multi-State\n\n[Company Name] is committed to transparent and equitable compensation practices. In accordance with applicable state and local laws, we include compensation information in our job postings as follows:\n\nFor all positions open to applicants or employees in California: We disclose the pay scale for the position, including hourly rate or salary range. (Cal. Labor Code § 432.3)\n\nFor positions open to applicants or employees in Colorado: We disclose the hourly rate or salary range, and a description of benefits, pursuant to the Equal Pay for Equal Work Act. (C.R.S. § 8-5-201)\n\nFor positions open to applicants or employees in New York State: We disclose the minimum and maximum annual salary or hourly range for the role. (NY Labor Law § 194-b)\n\nFor positions open to applicants or employees in Washington State: We disclose the hourly or salary compensation range and a general description of benefits. (Wash. Rev. Code § 49.58.110)\n\nFor positions open to applicants or employees in Illinois: We disclose the pay scale and benefits for all positions with 14 or more employees, effective January 1, 2025. (820 ILCS 112/1)\n\nFor remote positions open to applicants from any location: We disclose compensation information compliant with all applicable state laws, including Colorado (which applies to all remote postings viewable by Colorado applicants).",
        confidence: 93,
        citations: [
          "Cal. Labor Code § 432.3 (SB 1162)",
          "C.R.S. § 8-5-201 (Equal Pay for Equal Work Act)",
          "NY Labor Law § 194-b",
          "Wash. Rev. Code § 49.58.110",
          "820 ILCS 112/1 (IL Equal Pay Act)"
        ],
        notes: "Colorado applies to ALL job postings viewable by Colorado applicants, including remote roles. Client must include compensation in all postings or geo-restrict from Colorado viewers.",
        uplCompliant: true
      },
      tags: ["pay-transparency", "multi-state", "policy-drafting", "CA", "CO", "NY", "WA", "IL"]
    }
  ];

  for (const tc of testCases) {
    await api("POST", `/api/golden-datasets/${dataset.id}/test-cases`, tc);
    log("  ✓", `Test case added: ${tc.name}`);
  }

  return dataset;
}

// ─── 7. EVAL SUITE ───────────────────────────────────────────────────────────

async function createEvalSuite(agentId, goldenDatasetId) {
  log("🧪", "Creating evaluation suite…");

  const evalSuite = await api("POST", "/api/evals", {
    agentId,
    name: "Employment Compliance & Policy Advisory — Core Regression Suite",
    type: "regression",
    industry: "legal_services",
    goldenDatasetId,
    thresholdConfig: {
      minPassRate: 0.90,
      jurisdictionAccuracy: 0.95,
      citationAccuracy: 0.98,
      uplComplianceRate: 1.0,
      confidenceCalibration: 0.85
    },
    scorerConfig: {
      primary: "semantic_similarity",
      secondary: ["citation_accuracy", "jurisdiction_coverage", "upl_compliance_check"],
      humanReview: "attorney_spot_check",
      humanReviewSampleRate: 0.10
    },
    coverageTags: [
      "multi-state-compliance",
      "jurisdiction-identification",
      "policy-drafting",
      "new-legislation-response",
      "upl-compliance",
      "attorney-client-privilege",
      "gap-analysis",
      "conflict-resolution",
      "emergency-response"
    ],
    environmentThresholds: {
      development: { minPassRate: 0.85, citationAccuracy: 0.90 },
      staging: { minPassRate: 0.88, citationAccuracy: 0.95 },
      production: { minPassRate: 0.92, citationAccuracy: 0.98 }
    },
    ontologyTags: ["LKIF", "SALI-LMSS", "employment-law", "jurisdiction", "statute"],
    schedule: "weekly"
  });

  log("  ✓", `Eval suite created: ${evalSuite.id}`);
  return evalSuite;
}

// ─── 8. OUTCOME CONTRACT ─────────────────────────────────────────────────────

async function createOutcomeContract(agentId) {
  log("📊", "Creating outcome contract with KPIs…");

  const outcome = await api("POST", "/api/outcomes/with-kpis", {
    outcome: {
      name: "Employment Compliance & Policy Advisory — Service Contract",
      description:
        "Outcome contract for the Employment Compliance & Policy Advisory Agent (LIT-AGT-001). " +
        "Measures advisory accuracy, jurisdiction identification, policy gap detection, drafting " +
        "quality, and attorney review escalation performance across multi-jurisdiction employment " +
        "law compliance engagements.",
      riskTier: "HIGH",
      status: "active",
      version: 1,
      pricingModel: "PER_OUTCOME_EVENT",
      pricePerUnit: 75.00,
      currency: "USD",
      pricingTiers: [
        { minVolume: 0, maxVolume: 100, pricePerUnit: 85.00 },
        { minVolume: 101, maxVolume: 500, pricePerUnit: 75.00 },
        { minVolume: 501, maxVolume: 2000, pricePerUnit: 65.00 },
        { minVolume: 2001, maxVolume: null, pricePerUnit: 55.00 }
      ],
      volumeCap: 5000,
      slaConfig: {
        uptimePercent: 99.5,
        minSuccessRate: 0.90,
        maxP95LatencyMs: 15000,
        breachPenaltyPercent: 10,
        escalationSla: { urgent: 7200, high: 14400, normal: 86400 }
      },
      attributionRules: {
        agentId,
        model: "advisory_delivered",
        countingRule: "one_per_compliance_question_answered",
        exclusions: ["test_queries", "calibration_runs"]
      },
      approvalGates: [
        { gate: "attorney_review", required: true, condition: "confidence < 70 OR risk == HIGH" },
        { gate: "privilege_check", required: true, condition: "client_data_in_response" }
      ],
      riskThreshold: 0.05,
      maxDriftPercent: 10,
      autoPauseTrigger: {
        uplViolation: true,
        privilegeBreachDetected: true,
        passRateBelow: 0.85,
        consecutiveHighRiskOutputs: 3
      },
      roiEstimate: {
        hoursSavedPerAdvisory: 2.5,
        attorneyHourlyRate: 650,
        monthlyAdvisoryVolume: 200,
        monthlyRoiEstimate: 325000
      }
    },
    kpis: [
      {
        name: "Jurisdiction Identification Accuracy",
        description: "Percentage of inquiries where agent correctly identifies all applicable jurisdictions based on client footprint",
        metricType: "percentage",
        target: 0.95,
        unit: "ratio",
        frequency: "weekly",
        measurementMethod: "comparison_to_attorney_verified_jurisdiction_set",
        baselineValue: 0.80,
        thresholds: { warning: 0.90, critical: 0.85 }
      },
      {
        name: "Statutory Citation Accuracy",
        description: "Percentage of statutory and regulatory citations that are current, correctly formatted, and applicable",
        metricType: "percentage",
        target: 0.98,
        unit: "ratio",
        frequency: "weekly",
        measurementMethod: "attorney_spot_check_plus_automated_citation_verification",
        baselineValue: 0.90,
        thresholds: { warning: 0.95, critical: 0.92 }
      },
      {
        name: "Policy Gap Detection Rate",
        description: "Percentage of HIGH-severity compliance gaps correctly identified during handbook review",
        metricType: "percentage",
        target: 0.92,
        unit: "ratio",
        frequency: "weekly",
        measurementMethod: "comparison_to_attorney_reviewed_gap_analysis",
        baselineValue: 0.75,
        thresholds: { warning: 0.88, critical: 0.85 }
      },
      {
        name: "Policy Drafting Attorney Validation Rate",
        description: "Percentage of agent-drafted policy language approved by Littler attorneys without major revision",
        metricType: "percentage",
        target: 0.90,
        unit: "ratio",
        frequency: "monthly",
        measurementMethod: "attorney_review_outcome_tracking",
        baselineValue: 0.70,
        thresholds: { warning: 0.85, critical: 0.80 }
      },
      {
        name: "UPL Compliance Rate",
        description: "Percentage of agent outputs with proper UPL-compliant framing (research assistance, not legal advice)",
        metricType: "percentage",
        target: 1.0,
        unit: "ratio",
        frequency: "daily",
        measurementMethod: "automated_phrase_scanning_plus_attorney_review",
        baselineValue: 0.95,
        thresholds: { warning: 0.99, critical: 0.98 }
      },
      {
        name: "Escalation Precision",
        description: "Percentage of low-confidence or high-risk queries correctly escalated to attorney review",
        metricType: "percentage",
        target: 0.95,
        unit: "ratio",
        frequency: "daily",
        measurementMethod: "escalation_flag_vs_attorney_determination",
        baselineValue: 0.80,
        thresholds: { warning: 0.90, critical: 0.85 }
      },
      {
        name: "Advisory Response Latency P95",
        description: "95th percentile response time for standard employment compliance advisory",
        metricType: "latency",
        target: 15000,
        unit: "milliseconds",
        frequency: "real_time",
        measurementMethod: "api_trace_timing",
        baselineValue: 20000,
        thresholds: { warning: 18000, critical: 25000 }
      },
      {
        name: "New Legislation Alert Latency",
        description: "Time from legislation enactment to client alert delivery (SLA: 24 hours)",
        metricType: "latency",
        target: 86400,
        unit: "seconds",
        frequency: "per_event",
        measurementMethod: "enactment_timestamp_vs_alert_delivery_timestamp",
        baselineValue: 259200,
        thresholds: { warning: 43200, critical: 86400 }
      }
    ]
  });

  log("  ✓", `Outcome contract created: ${outcome.outcome?.id || outcome.id}`);
  return outcome;
}

// ─── 9. LINK EVERYTHING TO AGENT ─────────────────────────────────────────────

async function linkAgentIntelligence(agent, skills, kb, policies) {
  log("🔗", "Linking platform intelligence to agent…");

  // Link skills via preloadedSkills array on agent update
  const skillIds = skills.map(s => s.id);
  await api("PATCH", `/api/agents/${agent.id}`, {
    preloadedSkills: skillIds,
    policyBindings: policies.map(p => p.id)
  });
  log("  ✓", `${skills.length} skills linked to agent via preloadedSkills`);
  log("  ✓", `${policies.length} policies linked to agent via policyBindings`);

  // Link KB to agent via dedicated endpoint
  await api("POST", `/api/agents/${agent.id}/knowledge-bases`, {
    knowledgeBaseId: kb.id,
    priority: 1,
    retrievalConfig: {
      topK: 8,
      scoreThreshold: 0.72,
      rerankEnabled: true,
      jurisdictionFiltering: true,
      citationMode: "full"
    }
  });
  log("  ✓", `Knowledge Base linked to agent`);
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n" + "═".repeat(70));
  console.log("  ATLAS — Employment Compliance & Policy Advisory Agent Creation");
  console.log("  LIT-AGT-001 | Legal Services | Dev Environment");
  console.log("═".repeat(70) + "\n");

  const ids = {};

  try {
    // Create all platform intelligence
    const agent   = await createAgent();                              ids.agentId = agent.id;
    const skills  = await createSkills();                             ids.skillIds = skills.map(s => s.id);
    const kb      = await createKnowledgeBase();                      ids.kbId = kb.id;
    const runbooks = await createRunbooks(agent.id);                  ids.runbookIds = runbooks.map(r => r.id);
    const policies = await createPolicies(agent.id);                  ids.policyIds = policies.map(p => p.id);
    const dataset = await createGoldenDataset();                      ids.goldenDatasetId = dataset.id;
    const evalSuite = await createEvalSuite(agent.id, dataset.id);    ids.evalSuiteId = evalSuite.id;
    const outcome = await createOutcomeContract(agent.id);            ids.outcomeId = outcome.outcome?.id || outcome.id;

    // Link everything together
    await linkAgentIntelligence(agent, skills, kb, policies);

    // Report
    console.log("\n" + "═".repeat(70));
    console.log("  ✅  ALL PLATFORM INTELLIGENCE CREATED SUCCESSFULLY");
    console.log("═".repeat(70));
    console.log(`\n  Agent ID:        ${ids.agentId}`);
    console.log(`  Skill IDs:       ${ids.skillIds.join(", ")}`);
    console.log(`  KB ID:           ${ids.kbId}`);
    console.log(`  Runbook IDs:     ${ids.runbookIds.join(", ")}`);
    console.log(`  Policy IDs:      ${ids.policyIds.join(", ")}`);
    console.log(`  Dataset ID:      ${ids.goldenDatasetId}`);
    console.log(`  Eval Suite ID:   ${ids.evalSuiteId}`);
    console.log(`  Outcome ID:      ${ids.outcomeId}`);

    // Save IDs to file for CURL script generation
    const fs = await import("fs");
    fs.writeFileSync(
      "/home/runner/workspace/scripts/lit-agt-001-dev-ids.json",
      JSON.stringify(ids, null, 2)
    );
    log("💾", "IDs saved to scripts/lit-agt-001-dev-ids.json");

    // Generate CURL migration script
    await generateMigrationScript(ids, skills, kb, runbooks, policies, dataset, evalSuite, outcome);

  } catch (err) {
    console.error("\n❌  ERROR:", err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

// ─── GENERATE CURL MIGRATION SCRIPT ──────────────────────────────────────────

async function generateMigrationScript(ids, skills, kb, runbooks, policies, dataset, evalSuite, outcome) {
  log("📝", "Generating production migration CURL script…");

  const fs = await import("fs");

  // We need to re-fetch the full objects so we have all fields for PROD creation
  const agentRes = await fetch(`${BASE}/api/agents/${ids.agentId}`).then(r => r.json());
  const kbRes    = await fetch(`${BASE}/api/knowledge-bases/${ids.kbId}`).then(r => r.json());
  const kbSourcesRes = await fetch(`${BASE}/api/knowledge-bases/${ids.kbId}/sources`).then(r => r.json());
  const evalRes  = await fetch(`${BASE}/api/evals/${ids.evalSuiteId}`).then(r => r.json());
  const dsRes    = await fetch(`${BASE}/api/golden-datasets/${ids.goldenDatasetId}`).then(r => r.json());
  const dsTestCasesRes = await fetch(`${BASE}/api/golden-datasets/${ids.goldenDatasetId}/test-cases`).then(r => r.json());
  const outcomeRes = await fetch(`${BASE}/api/outcomes/${ids.outcomeId}`).then(r => r.json());
  const kpisRes    = await fetch(`${BASE}/api/kpis?outcomeId=${ids.outcomeId}`).then(r => r.json()).catch(() => []);

  // Fetch full skill objects
  const skillObjs = [];
  for (const sid of ids.skillIds) {
    const s = await fetch(`${BASE}/api/skills/${sid}`).then(r => r.json());
    skillObjs.push(s);
  }

  // Fetch full policy objects
  const policyObjs = [];
  for (const pid of ids.policyIds) {
    const p = await fetch(`${BASE}/api/policies/${pid}`).then(r => r.json());
    policyObjs.push(p);
  }

  // Fetch full runbook objects
  const runbookObjs = [];
  for (const rid of ids.runbookIds) {
    const rb = await fetch(`${BASE}/api/runbooks/${rid}`).then(r => r.json());
    runbookObjs.push(rb);
  }

  // Helper: strip server-managed fields, swap org IDs
  const clean = (obj, extraOmit = []) => {
    const omit = new Set(["id", "createdAt", "updatedAt", "organizationId", "totalSources", "totalChunks", ...extraOmit]);
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      if (!omit.has(k)) out[k] = v;
    }
    return out;
  };

  const PROD_BASE = "https://YOUR_PROD_DOMAIN";  // User will fill in

  const jq = (obj) => JSON.stringify(obj).replace(/'/g, "'\\''");  // safe for single-quoted shell strings

  let script = `#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# ATLAS — Employment Compliance & Policy Advisory Agent (LIT-AGT-001)
# PRODUCTION MIGRATION SCRIPT
#
# Generated: ${new Date().toISOString()}
# Source:    Dev Environment (org: ${DEV_ORG})
# Target:    Prod Environment (org: ${PROD_ORG})
#
# USAGE:
#   1. Set PROD_BASE to your production base URL
#   2. Run: bash scripts/migrate-lit-agt-001-to-prod.sh
#   3. Review output — all created IDs are printed and saved to
#      scripts/lit-agt-001-prod-ids.json
#
# IMPORTANT:
#   - Run from any machine with curl access to your production endpoint
#   - Script is idempotent-safe: each resource is created fresh
#   - All API calls use the production organization context automatically
# ═══════════════════════════════════════════════════════════════════════════════

set -euo pipefail

PROD_BASE="${PROD_BASE}"   # ← SET YOUR PRODUCTION URL HERE

# Color helpers
GREEN='\\033[0;32m'; RED='\\033[0;31m'; YELLOW='\\033[1;33m'; NC='\\033[0m'
log()  { echo -e "\${GREEN}✓\${NC}  $1"; }
warn() { echo -e "\${YELLOW}⚠\${NC}  $1"; }
fail() { echo -e "\${RED}✗\${NC}  $1"; exit 1; }

api_post() {
  local path="$1"; local body="$2"
  local resp
  resp=$(curl -sf -X POST "\${PROD_BASE}\${path}" \\
    -H "Content-Type: application/json" \\
    -d "$body") || fail "POST \${path} failed"
  echo "$resp"
}

api_patch() {
  local path="$1"; local body="$2"
  curl -sf -X PATCH "\${PROD_BASE}\${path}" \\
    -H "Content-Type: application/json" \\
    -d "$body" > /dev/null || fail "PATCH \${path} failed"
}

echo ""
echo "═══════════════════════════════════════════════════════════════════════"
echo "  ATLAS — LIT-AGT-001 Production Migration"
echo "═══════════════════════════════════════════════════════════════════════"
echo ""

# ── STEP 1: CREATE SKILLS ──────────────────────────────────────────────────
echo "🧠  Creating skills…"

`;

  // Skills
  const skillVarNames = [];
  for (let i = 0; i < skillObjs.length; i++) {
    const s = skillObjs[i];
    const varName = `SKILL_${i + 1}_ID`;
    skillVarNames.push(varName);
    const body = clean(s, ["activationCount", "performanceScore", "descriptionQualityScore",
                            "lastEvalPassRate", "lastEvalAt", "industryContextId", "evalBindings"]);
    script += `${varName}=$(api_post "/api/skills" '${jq(body)}' | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); process.stdout.write(d.id)")\n`;
    script += `log "Skill created: \$${varName} — ${s.name.replace(/'/g, "'")}"\n`;
  }

  // Knowledge Base
  script += `
# ── STEP 2: CREATE KNOWLEDGE BASE ─────────────────────────────────────────
echo ""
echo "📚  Creating knowledge base…"
`;
  const kbClean = clean(kbRes, ["totalSources", "totalChunks", "vectorDbConfig"]);
  kbClean.vectorDbConfig = {};
  script += `KB_ID=$(api_post "/api/knowledge-bases" '${jq(kbClean)}' | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); process.stdout.write(d.id)")\n`;
  script += `log "Knowledge base created: \$KB_ID"\n\n`;

  // KB Sources
  script += `echo "  Adding knowledge base sources…"\n`;
  const sources = Array.isArray(kbSourcesRes) ? kbSourcesRes : (kbSourcesRes.sources || []);
  for (const src of sources) {
    const srcBody = { title: src.name, content: src.content };
    script += `api_post "/api/knowledge-bases/\$KB_ID/sources/text" '${jq(srcBody)}' > /dev/null\n`;
    script += `log "  KB source: ${src.name?.slice(0, 50) || 'source'}…"\n`;
  }

  // Runbooks
  script += `
# ── STEP 3: CREATE RUNBOOKS ────────────────────────────────────────────────
echo ""
echo "📋  Creating runbooks…"
`;
  const runbookVarNames = [];
  for (let i = 0; i < runbookObjs.length; i++) {
    const rb = runbookObjs[i];
    const varName = `RUNBOOK_${i + 1}_ID`;
    runbookVarNames.push(varName);
    const body = clean(rb, ["lastTriggered", "triggerCount", "isPreBuilt"]);
    script += `${varName}=$(api_post "/api/runbooks" '${jq(body)}' | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); process.stdout.write(d.id)")\n`;
    script += `log "Runbook created: \$${varName}"\n`;
  }

  // Policies (created after agent, so we need to patch scopeId later)
  script += `
# ── STEP 4: CREATE AGENT ───────────────────────────────────────────────────
echo ""
echo "🤖  Creating agent…"
`;
  const agentBody = clean(agentRes, ["healthScore", "successRate", "avgLatencyMs", "costPerRun",
    "monthlyCost", "monthlyRevenue", "totalRuns", "maturityScore", "maturityFactors",
    "outcomeId", "evalBindings", "policyBindings", "preloadedSkills", "linkedSkillChainId",
    "gitConfig", "ciCdConfig", "lastIncidentAt", "requiresRevalidation", "revalidationReason",
    "blueprintId"]);
  agentBody.preloadedSkills = skillVarNames.map(v => `__${v}__`);  // placeholder
  agentBody.policyBindings = [];  // will patch after policies
  agentBody.status = "active";

  // We need special handling for preloadedSkills which are shell variables
  // Build the JSON with placeholders then sed-replace
  script += `AGENT_BODY=$(cat <<'AGENTEOF'\n${JSON.stringify(agentBody, null, 2)}\nAGENTEOF\n)\n`;

  // Replace placeholders with actual env var values
  for (const v of skillVarNames) {
    script += `AGENT_BODY=$(echo "$AGENT_BODY" | sed "s/\\"__${v}__\\"/\\"$${v}\\"/g")\n`;
  }

  script += `AGENT_ID=$(api_post "/api/agents" "$AGENT_BODY" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); process.stdout.write(d.id)")\n`;
  script += `log "Agent created: \$AGENT_ID"\n`;

  // Policies with agentId
  script += `
# ── STEP 5: CREATE GOVERNANCE POLICIES ────────────────────────────────────
echo ""
echo "🛡️  Creating governance policies…"
`;
  const policyVarNames = [];
  for (let i = 0; i < policyObjs.length; i++) {
    const p = policyObjs[i];
    const varName = `POLICY_${i + 1}_ID`;
    policyVarNames.push(varName);
    const body = clean(p, ["versionHistory", "ontologyRefs"]);
    body.scopeType = "agent";
    body.scopeId = "__AGENT_ID__";
    const bodyStr = JSON.stringify(body).replace(/__AGENT_ID__/g, `\${AGENT_ID}`);
    // Use printf to handle the variable expansion
    script += `POLICY_BODY_${i}=$(printf '%s' '${jq(body)}' | sed "s/__AGENT_ID__/\$AGENT_ID/")\n`;
    script += `${varName}=$(api_post "/api/policies" "$POLICY_BODY_${i}" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); process.stdout.write(d.id)")\n`;
    script += `log "Policy created: \$${varName}"\n`;
  }

  // Link KB
  script += `
# ── STEP 6: LINK KNOWLEDGE BASE TO AGENT ──────────────────────────────────
echo ""
echo "🔗  Linking knowledge base to agent…"
api_post "/api/agents/\$AGENT_ID/knowledge-bases" "{\\"knowledgeBaseId\\": \\"$KB_ID\\", \\"priority\\": 1, \\"retrievalConfig\\": {\\"topK\\": 8, \\"scoreThreshold\\": 0.72, \\"rerankEnabled\\": true, \\"jurisdictionFiltering\\": true, \\"citationMode\\": \\"full\\"}}" > /dev/null
log "Knowledge base linked to agent"
`;

  // Link Skills and Policies
  script += `
# ── STEP 7: LINK SKILLS AND POLICIES TO AGENT ─────────────────────────────
echo ""
echo "🔗  Linking skills and policies to agent…"
SKILLS_JSON="[\\"$${skillVarNames.join('\\", \\"$')}\\"]"
POLICIES_JSON="[\\"$${policyVarNames.join('\\", \\"$')}\\"]"
api_patch "/api/agents/\$AGENT_ID" "{\\"preloadedSkills\\": $SKILLS_JSON, \\"policyBindings\\": $POLICIES_JSON}"
log "Skills and policies linked to agent"
`;

  // Golden Dataset
  script += `
# ── STEP 8: CREATE GOLDEN DATASET ─────────────────────────────────────────
echo ""
echo "🗂️  Creating golden dataset…"
`;
  const dsBody = clean(dsRes, ["growthHistory", "benchmarkAvg", "benchmarkRange",
    "contributorCount", "contributors", "lastUpdatedAt"]);
  script += `DATASET_ID=$(api_post "/api/golden-datasets" '${jq(dsBody)}' | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); process.stdout.write(d.id)")\n`;
  script += `log "Golden dataset created: \$DATASET_ID"\n`;

  // Test cases
  script += `echo "  Adding test cases…"\n`;
  const testCases = Array.isArray(dsTestCasesRes) ? dsTestCasesRes : (dsTestCasesRes.testCases || []);
  for (const tc of testCases) {
    const tcBody = clean(tc, ["suiteId", "datasetId", "goldenDatasetId", "evalSuiteId", "passCount", "failCount"]);
    script += `api_post "/api/golden-datasets/\$DATASET_ID/test-cases" '${jq(tcBody)}' > /dev/null\n`;
    script += `log "  Test case: ${tc.name?.slice(0, 50) || 'test case'}"\n`;
  }

  // Eval Suite
  script += `
# ── STEP 9: CREATE EVAL SUITE ──────────────────────────────────────────────
echo ""
echo "🧪  Creating eval suite…"
`;
  const evalBody = clean(evalRes, ["passRate", "totalCases", "lastRunAt", "skillId"]);
  evalBody.agentId = "__AGENT_ID__";
  evalBody.goldenDatasetId = "__DATASET_ID__";
  script += `EVAL_BODY=$(printf '%s' '${jq(evalBody)}' | sed "s/__AGENT_ID__/\$AGENT_ID/g" | sed "s/__DATASET_ID__/\$DATASET_ID/g")\n`;
  script += `EVAL_ID=$(api_post "/api/evals" "$EVAL_BODY" | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); process.stdout.write(d.id)")\n`;
  script += `log "Eval suite created: \$EVAL_ID"\n`;

  // Outcome Contract
  script += `
# ── STEP 10: CREATE OUTCOME CONTRACT ──────────────────────────────────────
echo ""
echo "📊  Creating outcome contract with KPIs…"
`;
  const outcomeBody = clean(outcomeRes, ["constraintGraph"]);
  // We'll use the same outcome/KPI structure as dev
  const kpisList = Array.isArray(kpisRes) ? kpisRes : (kpisRes.kpis || []);
  const kpisClean = kpisList.map(k => clean(k, ["outcomeId", "currentValue", "lastMeasuredAt", "trendData"]));

  script += `OUTCOME_ID=$(api_post "/api/outcomes/with-kpis" '${jq({ outcome: outcomeBody, kpis: kpisClean })}' | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); process.stdout.write(d.outcome?.id || d.id || 'error')")\n`;
  script += `log "Outcome contract created: \$OUTCOME_ID"\n`;

  // Link outcome to agent
  script += `api_patch "/api/agents/\$AGENT_ID" "{\\"outcomeId\\": \\"$OUTCOME_ID\\"}"\n`;
  script += `log "Outcome linked to agent"\n`;

  // Summary
  script += `
# ── SUMMARY ────────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════════════════"
echo "  ✅  LIT-AGT-001 PRODUCTION MIGRATION COMPLETE"
echo "═══════════════════════════════════════════════════════════════════════"
echo ""
echo "  Agent ID:      \$AGENT_ID"
echo "  KB ID:         \$KB_ID"
echo "  Dataset ID:    \$DATASET_ID"
echo "  Eval Suite ID: \$EVAL_ID"
echo "  Outcome ID:    \$OUTCOME_ID"
echo ""
echo "  Skills:"
`;
  for (let i = 0; i < skillVarNames.length; i++) {
    script += `echo "    ${skillObjs[i]?.name?.slice(0, 50) || `Skill ${i+1}`}: \$${skillVarNames[i]}"\n`;
  }
  script += `echo ""\necho "  Policies: ${policyVarNames.map(v => `\$${v}`).join(" ")}"\n`;
  script += `echo "  Runbooks: ${runbookVarNames.map(v => `\$${v}`).join(" ")}"\n`;

  // Save IDs to JSON
  script += `
# Save prod IDs to JSON
node -e "
const ids = {
  agentId: process.env.AGENT_ID || '\$AGENT_ID',
  kbId: '\$KB_ID',
  evalSuiteId: '\$EVAL_ID',
  goldenDatasetId: '\$DATASET_ID',
  outcomeId: '\$OUTCOME_ID'
};
const fs = require('fs');
fs.writeFileSync('lit-agt-001-prod-ids.json', JSON.stringify(ids, null, 2));
console.log('IDs saved to lit-agt-001-prod-ids.json');
" 2>/dev/null || echo "  (IDs printed above — node not available for file save)"
`;

  fs.writeFileSync("/home/runner/workspace/scripts/migrate-lit-agt-001-to-prod.sh", script);
  fs.chmodSync("/home/runner/workspace/scripts/migrate-lit-agt-001-to-prod.sh", 0o755);

  log("✅", "Migration script saved to scripts/migrate-lit-agt-001-to-prod.sh");
}

main();
