#!/usr/bin/env node
/**
 * LIT-AGT-003 — Final Finish Script
 * Steps 9 (eval) done. This script completes:
 *   - Outcome contract + 8 KPIs (version: 1 as number, not string)
 *   - Link KB, outcome, eval suite to agent
 *   - Set ontology tags
 *   - Save all IDs to JSON
 */

import { writeFileSync } from "fs";

const BASE = "http://localhost:5000";
const ORG  = "0c9bcf16-cdd9-45e2-87f6-6a839a7f7056";

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

const ids = {
  agentId:        "561909df-ec7c-43f6-97a5-f8a27b6a2d17",
  kbId:           "88433864-513f-403e-ad56-de4d6309129b",
  evalSuiteId:    "0928982d-9546-451b-a5c1-aad61180dfc8",
  goldenDatasetId:"ad8b4333-f736-41f8-8277-0d189b56de30",
  skillIds: [
    "826a3340-8af0-4914-ad2a-37d4729ded91",
    "e7ba421d-e72e-4282-8bc6-1f00ae816105",
    "dbc7502b-63a5-4e41-8dd8-12d9970df4a7",
    "9ac48e0c-ef9a-4861-9465-19b4d03f95b3",
    "eb544fcb-b85e-47e3-9a1d-d01b234d54ea",
    "08f42787-7a7a-4f8d-8a87-19b6047cc603",
  ],
  runbookIds: [
    "df24b89f-3fde-403d-b604-cf52698a91a5",
    "a95b6399-8855-4cf4-b20c-ce42d871dc01",
    "ee82685f-2da3-4053-8a39-a434358fa14c",
    "966fd6b2-7848-49e4-83cd-09cfe28c36af",
    "beb601b1-868c-4618-98e5-f70dd36ea59a",
    "8db26008-11c4-4f4b-98fc-7643fc753c2a",
  ],
  policyIds: [
    "84ea1ded-ce62-4cf0-88ed-697fbfa99d06",
    "ee01d4b4-12b3-48ed-a6a1-c53f710c7ad6",
    "5d1227f9-3ab3-44e4-8e8f-0933444fcb9f",
    "4b774ab2-78bf-4120-bf94-56db129e469a",
    "7369ba0d-d42f-4015-b701-1001f4e416b0",
    "f179c1b1-127a-413c-bf86-0dc23aa06cab",
  ],
};

const KPIS = [
  { name: "Complaint Classification Accuracy", unit: "percent", baseline: 76, target: 95, targetOperator: "gte", weight: 0.20, slaThreshold: 88, breachLevel: "critical", confidence: 0.90, trend: "improving", expression: "(correct_complaint_classifications / total_complaints_classified) * 100", measurement: "Complaint type and severity tier prediction validated against experienced Littler investigation attorney assessment on 500+ historical investigation file dataset" },
  { name: "Investigation Plan Completeness Rate", unit: "percent", baseline: 72, target: 93, targetOperator: "gte", weight: 0.18, slaThreshold: 85, breachLevel: "critical", confidence: 0.88, trend: "improving", expression: "(complete_plans / total_plans_generated) * 100", measurement: "AI-generated investigation plans scored against 15-element completeness checklist by Littler investigation attorneys; 13+ elements = complete" },
  { name: "Legal Standard Application Accuracy", unit: "percent", baseline: 80, target: 95, targetOperator: "gte", weight: 0.20, slaThreshold: 88, breachLevel: "critical", confidence: 0.92, trend: "stable", expression: "(correct_legal_standard_applications / total_legal_analyses) * 100", measurement: "Correct identification of applicable statute, burden-shifting framework, and causation standard vs. Littler attorney ground truth on 500+ historical cases" },
  { name: "Investigation Report Quality Score", unit: "percent", baseline: 74, target: 90, targetOperator: "gte", weight: 0.18, slaThreshold: 82, breachLevel: "high", confidence: 0.87, trend: "improving", expression: "(reports_rated_legally_defensible / total_reports_reviewed) * 100", measurement: "Attorney review of draft investigation reports on 5-point scale for thoroughness, objectivity, and legal defensibility; 4+ on all three dimensions = legally defensible" },
  { name: "Faragher/Ellerth Defense Documentation Rate", unit: "percent", baseline: 65, target: 98, targetOperator: "gte", weight: 0.12, slaThreshold: 90, breachLevel: "critical", confidence: 0.93, trend: "improving", expression: "(plans_with_all_FE_elements / total_supervisor_harassment_plans) * 100", measurement: "Proportion of supervisor harassment investigation plans including all Faragher/Ellerth defense elements: policy adequacy, training records, complaint channel documentation" },
  { name: "Investigation Timeline Adherence Rate", unit: "percent", baseline: 68, target: 92, targetOperator: "gte", weight: 0.08, slaThreshold: 80, breachLevel: "medium", confidence: 0.85, trend: "improving", expression: "(investigations_completed_on_time / total_investigations) * 100", measurement: "Proportion of investigations completed within policy-mandated timeframe for severity tier (P1: 14d, P2: 21d, P3: 45d, P4: 60d)" },
  { name: "Investigation Completion Speed", unit: "seconds", baseline: 1200, target: 90, targetOperator: "lte", weight: 0.04, slaThreshold: 300, breachLevel: "medium", confidence: 0.95, trend: "improving", expression: "avg(investigation_plan_generation_time_seconds)", measurement: "Time from complaint submission to delivery of complete investigation plan with witness list, document requests, and timeline" },
  { name: "Attorney Escalation Precision", unit: "percent", baseline: 72, target: 90, targetOperator: "gte", weight: 0.00, slaThreshold: 80, breachLevel: "low", confidence: 0.82, trend: "stable", expression: "(correctly_escalated / total_escalations) * 100", measurement: "Proportion of escalations validated by Littler investigation attorney as genuinely requiring attorney involvement; excludes mandatory escalations" },
];

async function main() {
  console.log("\n════════════════════════════════════════════════════════════════════");
  console.log("  LIT-AGT-003 — Final Finish Script (Steps 10-11)");
  console.log("════════════════════════════════════════════════════════════════════\n");

  // ── STEP 10: OUTCOME CONTRACT + 8 KPIs (version as number) ───────────────────
  step("10", "11", "Creating outcome contract + 8 KPIs (version: 1 as number)…");
  const outcomeRes = await post("/api/outcomes/with-kpis", {
    outcome: {
      organizationId: ORG,
      name: "Workplace Investigation Agent — Outcome Contract",
      description: "Business objectives, KPIs, and SLAs governing the Workplace Investigation Agent (LIT-AGT-003). Targets complaint classification accuracy, investigation plan completeness, legal standard application accuracy, investigation report quality, and litigation risk reduction for Littler Mendelson investigation clients.",
      version: 1,
      status: "active",
      industry: "legal_services",
      agentCode: "LIT-AGT-003",
      practiceArea: "Investigations & Discrimination",
      productMapping: "Littler Investigations Practice + onDemand",
      objectives: [
        "Achieve 95%+ complaint classification accuracy across all investigation complaint types",
        "Produce investigation plans rated complete by Littler investigation attorneys in 93%+ of cases",
        "Apply correct legal standards (burden-shifting frameworks, causation standards) in 95%+ of analyses",
        "Generate investigation reports rated legally defensible by Littler attorneys in 90%+ of cases",
        "Reduce investigation-related litigation exposure through proactive Faragher/Ellerth defense documentation",
      ],
      successCriteria: {
        primary: "Complaint classification accuracy ≥ 95% vs. experienced investigator ground truth",
        secondary: "Investigation plan completeness ≥ 93%; legal standard application accuracy ≥ 95%",
        guardrails: "Zero instances of recommending adverse action without attorney review; zero Faragher/Ellerth defense element omissions in supervisor harassment cases",
      },
      attributionRules: {
        agentId: ids.agentId,
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
        faragherEllerthDefenseCostSavings: 120000,
      },
    },
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
      retrievalConfig: { topK: 12, scoreThreshold: 0.70, rerankEnabled: true, jurisdictionFiltering: true, citationMode: "full" },
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

  // Save IDs
  writeFileSync("scripts/lit-agt-003-dev-ids.json", JSON.stringify(ids, null, 2));

  console.log("\n════════════════════════════════════════════════════════════════════");
  console.log("  ✅  LIT-AGT-003 — ALL STEPS COMPLETE");
  console.log("════════════════════════════════════════════════════════════════════");
  console.log(`\n  Agent:           ${ids.agentId}`);
  console.log(`  Knowledge Base:  ${ids.kbId}`);
  console.log(`  Skills (6):      ${ids.skillIds.join("\n                   ")}`);
  console.log(`  Policies (6):    ${ids.policyIds.join("\n                   ")}`);
  console.log(`  Runbooks (6):    ${ids.runbookIds.join("\n                   ")}`);
  console.log(`  Golden Dataset:  ${ids.goldenDatasetId} (6 test cases)`);
  console.log(`  Eval Suite:      ${ids.evalSuiteId}`);
  console.log(`  Outcome:         ${ids.outcomeId}`);
  console.log(`\n  Dev IDs saved → scripts/lit-agt-003-dev-ids.json\n`);
}

main().catch(err => {
  console.error(`\n❌  Final finish failed: ${err.message}`);
  process.exit(1);
});
