#!/usr/bin/env node
/**
 * LIT-AGT-010 — Final steps: outcome contract + linking
 */

import { writeFileSync } from "fs";

const BASE = "http://localhost:5000";
const ORG  = "0c9bcf16-cdd9-45e2-87f6-6a839a7f7056";

const ids = {
  agentId:         "d3c58d3a-3ec5-4827-ae88-bf3e18a1c666",
  kbId:            "63320ded-56e0-474c-8fb1-841ca88d4beb",
  evalSuiteId:     "611fd5a8-8359-4bfe-a15c-c9f7fed92633",
  goldenDatasetId: "57268152-30d4-41e0-9448-10011b6d7934",
  skillIds: [
    "fbf79ed2-9df9-4b78-b716-05aaa0bb839c",
    "e9100731-535b-49d3-942c-25c138a5e339",
    "8970e861-4751-49ae-9e6a-ba9a1f1c73cf",
    "5b1e54f1-8a58-4046-aed9-f3c152eac91c",
    "b54798cd-3678-4751-b28c-e81d6dac978e",
    "f03f2fff-6848-485f-9dfe-242b2812d381",
  ],
  runbookIds: [
    "1e4057d4-d6a1-4ae9-badb-0aacb72a97eb",
    "56697a89-2da5-43df-b8d7-68b5b7bc8c5d",
    "56253126-0a23-45d3-bf77-42a80e735f1b",
    "9a149328-cdcd-4da9-82f9-e74e642f41d6",
    "93a197d1-0066-4e6d-8096-aa9d55049d52",
    "c033f85c-7b67-4ed9-bac5-ac40496f3246",
  ],
  policyIds: [
    "f16bfabe-b5c1-4716-99a6-318040ca2324",
    "f22f72a4-04ae-4c2e-9eca-c6d05bd8d30a",
    "10bdf145-31c5-4335-80b5-6f79f1a4d249",
    "dd0f79df-d03c-4fb3-869d-aabc1268604e",
    "e57f538e-2dfb-45a0-bf26-1d4550185c14",
    "8cf313bb-3379-4618-ac83-7a6410f03785",
  ],
};

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

const KPIS = [
  { name: "Leave Eligibility Determination Accuracy", unit: "percent", baseline: 78, target: 95, targetOperator: "gte", weight: 0.22, slaThreshold: 90, breachLevel: "critical", confidence: 0.90, trend: "improving", expression: "(correct_eligibility_determinations / total_determinations) * 100", measurement: "Validated against attorney-reviewed ground truth dataset covering all 50 states + 100+ municipalities" },
  { name: "Concurrent Leave Calculation Accuracy", unit: "percent", baseline: 82, target: 97, targetOperator: "gte", weight: 0.18, slaThreshold: 92, breachLevel: "critical", confidence: 0.93, trend: "stable", expression: "(correct_concurrent_calculations / total_concurrent_calculations) * 100", measurement: "Compared against manual calculation by Littler leave attorneys on 300 multi-law scenarios per quarter" },
  { name: "FMLA Notice Compliance Accuracy", unit: "percent", baseline: 88, target: 98, targetOperator: "gte", weight: 0.15, slaThreshold: 94, breachLevel: "critical", confidence: 0.92, trend: "stable", expression: "(compliant_notice_determinations / total_notice_determinations) * 100", measurement: "Validated against 29 C.F.R. §825.300 notice requirements checklist" },
  { name: "Interactive Process Guidance Completeness", unit: "percent", baseline: 75, target: 93, targetOperator: "gte", weight: 0.15, slaThreshold: 86, breachLevel: "high", confidence: 0.88, trend: "improving", expression: "(guidance_with_all_required_elements / total_interactive_process_responses) * 100", measurement: "Reviewed against 12-element interactive process completeness checklist by Littler ADA practice attorneys" },
  { name: "Accommodation Appropriateness Rate", unit: "percent", baseline: 80, target: 92, targetOperator: "gte", weight: 0.12, slaThreshold: 85, breachLevel: "high", confidence: 0.85, trend: "improving", expression: "(appropriate_accommodations_identified / total_accommodation_analyses) * 100", measurement: "Attorney rating on 5-point scale; 4+ rated as appropriate; benchmarked against JAN database" },
  { name: "Litigation Risk Reduction Rate", unit: "percent", baseline: 45, target: 55, targetOperator: "gte", weight: 0.10, slaThreshold: 48, breachLevel: "medium", confidence: 0.75, trend: "improving", expression: "((baseline_litigation_rate - post_agent_litigation_rate) / baseline_litigation_rate) * 100", measurement: "Year-over-year comparison of leave-related litigation filings per 1,000 employees" },
  { name: "Leave Eligibility Determination Speed", unit: "seconds", baseline: 900, target: 60, targetOperator: "lte", weight: 0.05, slaThreshold: 180, breachLevel: "medium", confidence: 0.95, trend: "improving", expression: "avg(determination_response_time_seconds)", measurement: "Time from employee facts submission to complete leave eligibility matrix delivery" },
  { name: "Attorney Escalation Precision", unit: "percent", baseline: 70, target: 88, targetOperator: "gte", weight: 0.03, slaThreshold: 78, breachLevel: "low", confidence: 0.80, trend: "stable", expression: "(correctly_escalated / total_escalations) * 100", measurement: "Proportion of escalations validated by Littler leave practice attorney as requiring attorney review" },
];

async function main() {
  console.log("\n════════════════════════════════════════════════════════════════════");
  console.log("  LIT-AGT-010 — Final Steps: Outcome Contract + Complete Linking");
  console.log("════════════════════════════════════════════════════════════════════\n");

  // ── STEP 10: OUTCOME CONTRACT + 8 KPIs ───────────────────────────────────────
  console.log("\nSTEP 10  Creating outcome contract + 8 KPIs…");
  const outcomeRes = await post("/api/outcomes/with-kpis", {
    outcome: {
      organizationId: ORG,
      name: "Leave & Accommodation Management Agent — Outcome Contract",
      description: "Business objectives, KPIs, and SLAs governing the Leave & Accommodation Management Agent (LIT-AGT-010). Targets multi-jurisdiction leave eligibility accuracy, interactive process guidance quality, notice compliance, and litigation risk reduction for Littler clients.",
      version: 1,
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
      ],
      successCriteria: {
        primary: "Leave eligibility determination accuracy ≥ 95% vs. attorney-reviewed ground truth",
        secondary: "Interactive process guidance completeness ≥ 93%; FMLA notice accuracy ≥ 95%",
        guardrails: "Zero instances of recommending leave denial without attorney consultation",
      },
      attributionRules: {
        agentId: ids.agentId,
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
      roiEstimate: {
        averageLitigationCostReduction: 280000,
        leaveAdminEfficiencyGain: 45000,
        litigationRiskReduction: 0.55,
        complianceAuditCostSavings: 18000,
      },
    },
    kpis: KPIS,
  });
  ids.outcomeId = outcomeRes.outcome?.id || outcomeRes.id;
  log(`Outcome Contract → ${ids.outcomeId}`);

  // ── STEP 11: LINK ALL INTELLIGENCE TO AGENT ───────────────────────────────────
  console.log("\nSTEP 11  Linking all platform intelligence to agent…");

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

  // Set ontology tags — {conceptId, label, category} format
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
    log(`Ontology tags: ${ontologyTags.map(t => t.label).join(", ")}`);
  } catch (e) {
    warn(`Ontology tags (non-fatal): ${e.message.slice(0, 80)}`);
  }

  // ── SAVE IDs ──────────────────────────────────────────────────────────────────
  writeFileSync("scripts/lit-agt-010-dev-ids.json", JSON.stringify(ids, null, 2));

  // ── SUMMARY ───────────────────────────────────────────────────────────────────
  console.log("\n════════════════════════════════════════════════════════════════════");
  console.log("  ✅  LIT-AGT-010 — ALL STEPS COMPLETE");
  console.log("════════════════════════════════════════════════════════════════════");
  console.log(`\n  Agent:           ${ids.agentId}`);
  console.log(`  Knowledge Base:  ${ids.kbId}`);
  console.log(`  Skills (6):      ${ids.skillIds.length} skills`);
  console.log(`  Policies (6):    ${ids.policyIds.length} policies`);
  console.log(`  Runbooks (6):    ${ids.runbookIds.length} runbooks`);
  console.log(`  Golden Dataset:  ${ids.goldenDatasetId}`);
  console.log(`  Eval Suite:      ${ids.evalSuiteId}`);
  console.log(`  Outcome:         ${ids.outcomeId}`);
  console.log(`\n  All IDs saved → scripts/lit-agt-010-dev-ids.json\n`);
}

main().catch(err => {
  console.error(`\n❌  Failed: ${err.message}`);
  process.exit(1);
});
