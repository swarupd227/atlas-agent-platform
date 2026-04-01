/**
 * prod-gap-fix.js
 * One-shot script to close all identified production gaps for AGT-001 and AGT-002.
 *
 * Fixes applied:
 *  1. AGT-001: set agentId on all 6 prod runbooks
 *  2. AGT-001: set scopeId on all 6 prod policies
 *  3. AGT-002: set systemPrompt on agent
 *  4. AGT-001 + AGT-002: set runtimeConfig.prompt (task context layer)
 *  5. AGT-001 KB sources: rename 6 "Manual Entry" sources to proper titles
 *  6. AGT-002 KB sources: rename 6 "Manual Entry" sources to proper titles
 *  7. Ontology: generate concepts via AI for Legal Services industry
 *
 * Run: node scripts/prod-gap-fix.js
 */

import { readFileSync } from "fs";

const BASE = process.env.PROD_BASE || "https://agent-lifecycle-management-platform.replit.app";

const AGT001 = JSON.parse(readFileSync("scripts/lit-agt-001-prod-ids.json", "utf8"));
const AGT002 = JSON.parse(readFileSync("scripts/lit-agt-002-prod-ids.json", "utf8"));

// ── Helpers ────────────────────────────────────────────────────────────────

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  if (typeof json === "string" && json.startsWith("<!DOCTYPE")) {
    throw new Error(`${method} ${path} → route not found on server (HTML response) — route may not be deployed yet`);
  }
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

function log(msg) { console.log(`[fix] ${msg}`); }
function ok(msg)  { console.log(`  ✓ ${msg}`); }
function err(msg) { console.error(`  ✗ ${msg}`); }

// ── Agent system prompts ───────────────────────────────────────────────────

const AGT001_SYSTEM_PROMPT = `You are the Littler Employment Compliance & Policy Advisory Agent (LIT-AGT-001), a specialized AI assistant for Littler Mendelson P.C., the world's largest employment and labor law firm.

Your primary purpose is to provide accurate, jurisdiction-specific legal guidance on employment compliance and policy matters to HR professionals, General Counsel, and Compliance Officers at Littler's client organizations.

CORE CAPABILITIES:
- Multi-jurisdiction employment law analysis covering all 50 U.S. states, D.C., 45+ international jurisdictions, and municipal ordinances
- Employee handbook drafting, review, and compliance gap analysis
- Policy template generation with jurisdiction-specific customizations
- Real-time tracking of legislative changes and regulatory updates (DOL, EEOC, NLRB, OSHA)
- Multi-state conflict resolution when employer policies must cover employees in multiple states
- FMLA, ADA, Title VII, ADEA, and state equivalent compliance guidance
- Non-compete enforceability analysis by state
- Cannabis accommodation obligation assessment
- Pay transparency law compliance across jurisdictions

OPERATING CONSTRAINTS:
- You operate under Littler's supervised autonomy model: flag any matter with a confidence score below 70% or involving litigation risk for attorney escalation
- You do not provide legal advice to individuals in personal legal disputes; route such inquiries appropriately
- All output must cite the specific statute, regulation, or case law supporting each position
- Maintain strict attorney-client privilege considerations; do not share client-specific information across matters
- When jurisdictions conflict, present all applicable rules and recommend attorney consultation for final determination

PRACTICE AREA ALIGNMENT:
You map to Littler's Employment & Labor Counseling practice and support the following Littler products:
- Littler GPS (Geographic Pay Scale compliance tool)
- Littler onDemand (self-service HR legal guidance platform)
- Littler Insight (legislative tracking and employer alerts)

ESCALATION TRIGGERS:
- Class action exposure risk detected
- NLRB unfair labor practice implications
- DOL investigation or audit context
- Criminal liability elements present
- Matters involving collective bargaining agreements
- Any matter where confidence < 70% after KB retrieval

RESPONSE FORMAT:
Structure all substantive legal guidance as:
1. Summary conclusion (2-3 sentences)
2. Applicable law(s) with citations
3. Jurisdiction-specific variations
4. Recommended action steps
5. Risk flags and escalation notes (if any)`;

const AGT002_SYSTEM_PROMPT = `You are the Littler Wage & Hour Compliance Audit Agent (LIT-AGT-002), a specialized AI analytical agent for Littler Mendelson P.C., mapped to the Audit Quarterback (Audit QB) product.

Your primary purpose is to conduct comprehensive, systematic wage and hour compliance audits for employer clients, analyzing payroll data, job descriptions, and timekeeping records to identify violations of FLSA and 200+ state and local wage and hour laws.

CORE ANALYTICAL CAPABILITIES:
- Employee classification analysis (exempt vs. non-exempt under FLSA white-collar exemptions: executive, administrative, professional, outside sales, computer employee)
- Independent contractor vs. employee misclassification assessment using ABC test, economic reality test, and state-specific tests
- Regular rate of pay calculation for overtime purposes (including non-discretionary bonuses, shift differentials, piece rates)
- Overtime calculation: daily overtime (CA, NV), weekly overtime (FLSA), 7th-day overtime (CA), fluctuating workweek
- Meal period compliance: California (30-min mandatory), New York, and state-specific rules
- Rest break compliance: 10-minute paid breaks per 4-hour period (CA), other state requirements
- Minimum wage compliance across 200+ city/county/state jurisdictions with rate look-up
- Predictive scheduling law compliance (San Francisco, Chicago, NYC, Seattle, etc.)
- Financial exposure modeling: back pay calculations, liquidated damages (2x), civil penalties, PAGA exposure (CA)

AUDIT WORKFLOW:
1. Ingest payroll data, time records, and job description inputs via structured file parsing
2. Run classification analysis across each employee population segment
3. Calculate overtime and regular rate obligations, flagging violations
4. Check meal/break compliance by jurisdiction
5. Verify minimum wage compliance for each work location
6. Model financial exposure with statistical confidence intervals
7. Generate risk-scored findings report with remediation priorities

AUTONOMY & ESCALATION:
- You operate in supervised mode: all findings require attorney review before client delivery
- Auto-escalate to Wage & Hour attorney when: confidence < 75% on any finding, financial exposure > $100,000, willful violation indicators present, PAGA/collective action risk detected
- Never present findings directly to clients without attorney sign-off

RESPONSE FORMAT:
Structure audit findings as:
1. Executive Summary: total exposure estimate, critical violations count, high/medium/low risk breakdown
2. Classification Findings: employee-by-employee or role-by-role analysis
3. Overtime & Regular Rate Findings: specific violations with back pay estimates
4. Meal & Break Findings: by jurisdiction
5. Minimum Wage Findings: by work location
6. Total Financial Exposure Model: with confidence intervals
7. Remediation Priority Matrix: immediate, 30-day, 90-day action items
8. Attorney Review Flags: items requiring escalation`;

// ── AGT-001 runtime task prompt ────────────────────────────────────────────

const AGT001_TASK_PROMPT = `Analyze the employment law or HR policy question provided. Identify all applicable jurisdictions based on the employer's and employees' locations. Retrieve relevant statutes, regulations, and case law from the knowledge base. Provide a structured legal guidance response including citations, jurisdiction-specific variations, recommended action steps, and any escalation flags. If the matter involves multi-state complexity, surface all conflicting rules and recommend attorney consultation for final determination.`;

const AGT002_TASK_PROMPT = `Conduct a wage and hour compliance audit on the provided payroll data, job descriptions, and time records. Systematically analyze each employee population for classification accuracy, overtime calculation correctness, meal and break compliance, and minimum wage adherence across all applicable jurisdictions. Model financial exposure for any identified violations, generate a risk-scored findings report, and flag all items requiring Wage & Hour attorney review before client delivery.`;

// ── KB source name maps ────────────────────────────────────────────────────

// Maps source index (0-based, in creation order) to correct name
// AGT-001: titles used when calling /sources/text
const AGT001_KB_NAMES = [
  "Federal Employment Statutes — Core Framework",
  "50-State Employment Law Survey — Key Topics",
  "International Employment Law — Key Jurisdictions",
  "Model Handbook Templates — Core Policies",
  "Regulatory Agency Guidance — DOL, EEOC, NLRB, OSHA",
  "Knowledge Graph — Employment Law Entity Relationships",
];

// AGT-002: names defined in KB_SOURCES array (passed as `name`, but route uses `title`)
const AGT002_KB_NAMES = [
  "FLSA Regulations & DOL Opinion Letters — Wage & Hour",
  "State Wage & Hour Requirements Matrix — All 50 States",
  "Local Minimum Wage & Scheduling Ordinances Database",
  "DOL Wage and Hour Division Field Operations Handbook",
  "Leading Case Law Digest — Classification, Overtime & Break Compliance",
  "Industry-Specific Classification Guides — Healthcare, Tech, Retail, Hospitality",
];

// ── Main ───────────────────────────────────────────────────────────────────

async function run() {
  let totalFixes = 0;
  let totalErrors = 0;

  // ── 1. AGT-001 runbooks: set agentId ──────────────────────────────────
  log("FIX 1: AGT-001 runbooks — setting agentId…");
  for (const rbId of AGT001.runbookIds) {
    try {
      await api("PATCH", `/api/runbooks/${rbId}`, { agentId: AGT001.agentId });
      ok(`Runbook ${rbId} → agentId set`);
      totalFixes++;
    } catch (e) {
      err(`Runbook ${rbId}: ${e.message}`);
      totalErrors++;
    }
  }

  // ── 2. AGT-001 policies: set scopeId ──────────────────────────────────
  log("FIX 2: AGT-001 policies — setting scopeId…");
  for (const polId of AGT001.policyIds) {
    try {
      await api("PATCH", `/api/policies/${polId}`, {
        scopeId: AGT001.agentId,
        scopeType: "agent",
      });
      ok(`Policy ${polId} → scopeId set`);
      totalFixes++;
    } catch (e) {
      err(`Policy ${polId}: ${e.message}`);
      totalErrors++;
    }
  }

  // ── 3. AGT-002 policies: set scopeId (verify / set if missing) ─────────
  log("FIX 3: AGT-002 policies — verifying/setting scopeId…");
  for (const polId of AGT002.policyIds) {
    try {
      await api("PATCH", `/api/policies/${polId}`, {
        scopeId: AGT002.agentId,
        scopeType: "agent",
      });
      ok(`Policy ${polId} → scopeId set`);
      totalFixes++;
    } catch (e) {
      err(`Policy ${polId}: ${e.message}`);
      totalErrors++;
    }
  }

  // ── 4. Both agents: fix preloadedSkills format → [{skillId, loadOrder}] ──
  log("FIX 4a: Both agents — fixing preloadedSkills format to {skillId, loadOrder} objects…");
  const toBindings = (ids) => ids.map((skillId, i) => ({ skillId, loadOrder: i }));

  try {
    await api("PATCH", `/api/agents/${AGT001.agentId}`, {
      preloadedSkills: toBindings(AGT001.skillIds),
    });
    ok(`AGT-001 preloadedSkills → ${AGT001.skillIds.length} bindings set`);
    totalFixes++;
  } catch (e) {
    err(`AGT-001 preloadedSkills: ${e.message}`);
    totalErrors++;
  }

  try {
    await api("PATCH", `/api/agents/${AGT002.agentId}`, {
      preloadedSkills: toBindings(AGT002.skillIds),
    });
    ok(`AGT-002 preloadedSkills → ${AGT002.skillIds.length} bindings set`);
    totalFixes++;
  } catch (e) {
    err(`AGT-002 preloadedSkills: ${e.message}`);
    totalErrors++;
  }

  // ── 5. AGT-002 agent: set systemPrompt ────────────────────────────────
  log("FIX 5 (was 4): AGT-002 agent — setting systemPrompt…");
  try {
    await api("PATCH", `/api/agents/${AGT002.agentId}`, {
      systemPrompt: AGT002_SYSTEM_PROMPT,
    });
    ok(`AGT-002 systemPrompt set (${AGT002_SYSTEM_PROMPT.length} chars)`);
    totalFixes++;
  } catch (e) {
    err(`AGT-002 systemPrompt: ${e.message}`);
    totalErrors++;
  }

  // ── 5. Both agents: set runtimeConfig.prompt (task context) ───────────
  log("FIX 5: Both agents — setting runtimeConfig.prompt (task context)…");

  // AGT-001: get current runtimeConfig first to preserve existing fields
  try {
    const agt001 = await api("GET", `/api/agents/${AGT001.agentId}`);
    const existingRc = agt001.runtimeConfig || {};
    await api("PATCH", `/api/agents/${AGT001.agentId}`, {
      runtimeConfig: { ...existingRc, prompt: AGT001_TASK_PROMPT },
    });
    ok(`AGT-001 runtimeConfig.prompt set`);
    totalFixes++;
  } catch (e) {
    err(`AGT-001 runtimeConfig.prompt: ${e.message}`);
    totalErrors++;
  }

  // AGT-002: get current runtimeConfig first to preserve existing fields
  try {
    const agt002 = await api("GET", `/api/agents/${AGT002.agentId}`);
    const existingRc = agt002.runtimeConfig || {};
    await api("PATCH", `/api/agents/${AGT002.agentId}`, {
      runtimeConfig: { ...existingRc, prompt: AGT002_TASK_PROMPT },
    });
    ok(`AGT-002 runtimeConfig.prompt set`);
    totalFixes++;
  } catch (e) {
    err(`AGT-002 runtimeConfig.prompt: ${e.message}`);
    totalErrors++;
  }

  // ── 6. AGT-001 KB sources: rename from "Manual Entry" ─────────────────
  log("FIX 6: AGT-001 KB sources — renaming to proper titles…");
  try {
    const sources001 = await api("GET", `/api/knowledge-bases/${AGT001.kbId}/sources`);
    const sortedSources = [...sources001].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    for (let i = 0; i < Math.min(sortedSources.length, AGT001_KB_NAMES.length); i++) {
      const src = sortedSources[i];
      const newName = AGT001_KB_NAMES[i];
      try {
        await api("PATCH", `/api/knowledge-bases/${AGT001.kbId}/sources/${src.id}`, {
          name: newName,
        });
        ok(`Source[${i}] "${src.name}" → "${newName}"`);
        totalFixes++;
      } catch (e) {
        err(`Source[${i}] ${src.id}: ${e.message}`);
        totalErrors++;
      }
    }
  } catch (e) {
    err(`AGT-001 KB sources list: ${e.message}`);
    totalErrors++;
  }

  // ── 7. AGT-002 KB sources: rename from "Manual Entry" ─────────────────
  log("FIX 7: AGT-002 KB sources — renaming to proper titles…");
  try {
    const sources002 = await api("GET", `/api/knowledge-bases/${AGT002.kbId}/sources`);
    const sortedSources = [...sources002].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    for (let i = 0; i < Math.min(sortedSources.length, AGT002_KB_NAMES.length); i++) {
      const src = sortedSources[i];
      const newName = AGT002_KB_NAMES[i];
      try {
        await api("PATCH", `/api/knowledge-bases/${AGT002.kbId}/sources/${src.id}`, {
          name: newName,
        });
        ok(`Source[${i}] "${src.name}" → "${newName}"`);
        totalFixes++;
      } catch (e) {
        err(`Source[${i}] ${src.id}: ${e.message}`);
        totalErrors++;
      }
    }
  } catch (e) {
    err(`AGT-002 KB sources list: ${e.message}`);
    totalErrors++;
  }

  // ── 8. Ontology: generate for Legal Services industry ─────────────────
  log("FIX 8: Ontology — generating concepts for Legal Services industry…");
  try {
    const ontResult = await api("POST", "/api/ai/generate-ontology", {
      industryId: "legal_services",
      industryName: "Legal Services (Employment Law & Wage/Hour Compliance)",
    });
    const count = Array.isArray(ontResult) ? ontResult.length : ontResult?.concepts?.length ?? "?";
    ok(`Ontology generated: ${count} concept(s)`);
    totalFixes++;
  } catch (e) {
    if (e.message.includes("409") || e.message.toLowerCase().includes("already exists") || e.message.toLowerCase().includes("conflict")) {
      ok(`Ontology already exists for this industry (409 — skipped)`);
      totalFixes++;
    } else {
      err(`Ontology generation: ${e.message}`);
      totalErrors++;
    }
  }

  // ── 9. Both agents: set ontologyTags as {conceptId,label,category} objects ──
  log("FIX 9: Both agents — setting ontologyTags from legal_services concepts…");
  try {
    const allConcepts = await api("GET", "/api/ontology-concepts/all");
    const byId = new Map(allConcepts.map(c => [c.id, c]));
    const tag = (id) => {
      const c = byId.get(id);
      if (!c) throw new Error("Concept not found: "+id);
      return { conceptId: c.id, label: c.label, category: c.category };
    };

    const agt001Tags = [
      tag("legal_services-advisory-services-legal-opinion"),
      tag("legal_services-transactional-services-regulatory-compliance"),
      tag("legal_services-advisory-services-compliance-auditing"),
      tag("legal_services-advisory-services-risk-assessment"),
      tag("legal_services-legal-technology-process-knowledge-management"),
      tag("legal_services-legal-technology-process-document-automation"),
      tag("legal_services-litigation-services-legal-research"),
    ];

    const agt002Tags = [
      tag("legal_services-advisory-services-compliance-auditing"),
      tag("legal_services-advisory-services-risk-assessment"),
      tag("legal_services-transactional-services-regulatory-compliance"),
      tag("legal_services-litigation-services-legal-research"),
      tag("legal_services-advisory-services-legal-opinion"),
    ];

    await api("PATCH", `/api/agents/${AGT001.agentId}`, { ontologyTags: agt001Tags });
    ok(`AGT-001 ontologyTags → ${agt001Tags.length} concepts`);
    totalFixes++;

    await api("PATCH", `/api/agents/${AGT002.agentId}`, { ontologyTags: agt002Tags });
    ok(`AGT-002 ontologyTags → ${agt002Tags.length} concepts`);
    totalFixes++;
  } catch (e) {
    err(`ontologyTags: ${e.message}`);
    totalErrors++;
  }

  // ── Summary ────────────────────────────────────────────────────────────
  console.log("\n──────────────────────────────────────────");
  console.log(`PROD GAP FIX COMPLETE`);
  console.log(`  Fixes applied : ${totalFixes}`);
  console.log(`  Errors        : ${totalErrors}`);
  if (totalErrors > 0) {
    console.log("\nReview errors above and re-run if needed.");
    process.exit(1);
  } else {
    console.log("\nAll gaps closed successfully. ✓");
  }
}

run().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
