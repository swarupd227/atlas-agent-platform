#!/usr/bin/env node
/**
 * Final step: Create outcome contract + link everything to agent.
 * Eval suite already created: 2e62985c-f5c8-4dbd-b237-a9678c0d9c37
 */

const BASE        = "http://localhost:5000";
const AGENT_ID    = "e3036eb8-36ef-450c-9ee5-7ab12134169a";
const KB_ID       = "95c440f2-b7f1-408a-9d37-2da16fbae0e0";
const DATASET_ID  = "6583b657-2902-42ab-82ee-7e1f51e6380f";
const EVAL_ID     = "2e62985c-f5c8-4dbd-b237-a9678c0d9c37";
const SKILL_IDS   = [
  "9d6e0875-dc71-4e90-8026-c40d6cf0c57f",
  "53740fbd-fcad-435f-9e43-3e1425daa613",
  "746f7afa-731a-4af9-9ae1-e777c280dc88",
  "77a84d86-1350-4ded-afdf-8a363b67cf7b",
  "da1e57c1-8a34-4852-a444-290a4b6fc0e2",
  "99745ce1-07bb-4394-a6fc-f49ebdbd2097",
];
const POLICY_IDS  = [
  "299e5d94-81d2-47a8-a506-36c6b58e56b6",
  "5ed6c3f5-1c20-4259-aafe-db079572a046",
  "61ae1592-d1a7-4d76-ab84-02bb89331eba",
  "c14d2f0c-e428-4c4d-adf6-e92f4dc0cbb6",
  "9aecce77-f99b-485b-b079-34ca23d07b0e",
  "9c5da438-7b48-4afa-b37b-4e786df9e5bb",
];
const RUNBOOK_IDS = [
  "5346a882-bd40-48d8-8cb7-9669321b0f3e",
  "add7f33c-574c-4c10-9490-44b702b4a7ce",
  "8dd473f3-20c6-49ce-8d9a-545630a44546",
  "8b9418ed-78f2-45e4-9d81-599e17d64b2e",
  "694b53f6-ba1f-4dec-8205-da36faaae9fd",
  "2d94b928-c08a-4584-be74-88e99a7e9352",
];

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(data).slice(0, 400)}`);
  return data;
}
const log = (e, m) => console.log(`${e}  ${m}`);

async function main() {
  console.log("\n══════════════════════════════════════════════════════════");
  console.log("  LIT-AGT-001 — Outcome Contract + Final Linkages");
  console.log("══════════════════════════════════════════════════════════\n");

  // ── OUTCOME CONTRACT ──────────────────────────────────────────────────────
  log("📊", "Creating outcome contract with 8 KPIs…");
  const outcomeResult = await api("POST", "/api/outcomes/with-kpis", {
    outcome: {
      name: "Employment Compliance & Policy Advisory — Service Contract",
      description:
        "Outcome contract for the Employment Compliance & Policy Advisory Agent (LIT-AGT-001). " +
        "Tracks advisory accuracy, jurisdiction identification, policy gap detection, drafting " +
        "quality, UPL compliance, and attorney escalation performance.",
      riskTier: "HIGH",
      status: "active",
      version: 1,
      pricingModel: "PER_OUTCOME_EVENT",
      pricePerUnit: 75.00,
      currency: "USD",
      pricingTiers: [
        { minVolume: 0, maxVolume: 100, pricePerUnit: 85.00 },
        { minVolume: 101, maxVolume: 500, pricePerUnit: 75.00 },
        { minVolume: 501, maxVolume: 2000, pricePerUnit: 65.00 }
      ],
      volumeCap: 5000,
      slaConfig: {
        uptimePercent: 99.5,
        minSuccessRate: 0.90,
        maxP95LatencyMs: 15000,
        breachPenaltyPercent: 10
      },
      attributionRules: {
        agentId: AGENT_ID,
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
      autoPauseTrigger: true,
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
        description: "Percentage of inquiries where agent correctly identifies all applicable jurisdictions",
        metricType: "percentage",
        target: 0.95,
        unit: "ratio",
        frequency: "weekly",
        measurementMethod: "comparison_to_attorney_verified_jurisdiction_set",
        thresholds: { warning: 0.90, critical: 0.85 }
      },
      {
        name: "Statutory Citation Accuracy",
        description: "Percentage of citations that are current, correctly formatted, and applicable",
        metricType: "percentage",
        target: 0.98,
        unit: "ratio",
        frequency: "weekly",
        measurementMethod: "attorney_spot_check_plus_automated_citation_verification",
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
        thresholds: { warning: 0.88, critical: 0.85 }
      },
      {
        name: "Policy Drafting Attorney Validation Rate",
        description: "Percentage of agent-drafted policy language approved by attorneys without major revision",
        metricType: "percentage",
        target: 0.90,
        unit: "ratio",
        frequency: "monthly",
        measurementMethod: "attorney_review_outcome_tracking",
        thresholds: { warning: 0.85, critical: 0.80 }
      },
      {
        name: "UPL Compliance Rate",
        description: "Percentage of outputs with proper UPL-compliant framing (must be 100%)",
        metricType: "percentage",
        target: 1.0,
        unit: "ratio",
        frequency: "daily",
        measurementMethod: "automated_phrase_scanning_plus_attorney_review",
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
        thresholds: { warning: 0.90, critical: 0.85 }
      },
      {
        name: "Advisory Response Latency P95",
        description: "95th percentile response time for employment compliance advisory",
        metricType: "latency",
        target: 15000,
        unit: "milliseconds",
        frequency: "real_time",
        measurementMethod: "api_trace_timing",
        thresholds: { warning: 18000, critical: 25000 }
      },
      {
        name: "New Legislation Alert Latency",
        description: "Time from enactment to client alert delivery (target: < 24 hours = 86400 seconds)",
        metricType: "latency",
        target: 86400,
        unit: "seconds",
        frequency: "per_event",
        measurementMethod: "enactment_timestamp_vs_alert_delivery_timestamp",
        thresholds: { warning: 43200, critical: 86400 }
      }
    ]
  });
  const outcomeId = outcomeResult.outcome?.id || outcomeResult.id;
  log("  ✓", `Outcome: ${outcomeId}`);

  // ── LINK EVERYTHING ───────────────────────────────────────────────────────
  log("🔗", "Linking all intelligence to agent (skills, policies, outcome, eval)…");
  await api("PATCH", `/api/agents/${AGENT_ID}`, {
    preloadedSkills: SKILL_IDS,
    policyBindings: POLICY_IDS,
    outcomeId,
    evalBindings: [EVAL_ID]
  });
  log("  ✓", `6 skills linked`);
  log("  ✓", `6 policies linked`);
  log("  ✓", `Outcome contract linked`);
  log("  ✓", `Eval suite linked`);

  // Link KB
  try {
    await api("POST", `/api/agents/${AGENT_ID}/knowledge-bases`, {
      knowledgeBaseId: KB_ID,
      priority: 1,
      retrievalConfig: { topK: 8, scoreThreshold: 0.72, rerankEnabled: true, jurisdictionFiltering: true, citationMode: "full" }
    });
    log("  ✓", `Knowledge base linked`);
  } catch (e) {
    log("  ⚠", `KB link: ${e.message.slice(0, 80)}`);
  }

  // ── SAVE IDs ──────────────────────────────────────────────────────────────
  const allIds = {
    agentId: AGENT_ID,
    kbId: KB_ID,
    skillIds: SKILL_IDS,
    policyIds: POLICY_IDS,
    runbookIds: RUNBOOK_IDS,
    goldenDatasetId: DATASET_ID,
    evalSuiteId: EVAL_ID,
    outcomeId
  };
  const fs = await import("fs");
  fs.writeFileSync("scripts/lit-agt-001-dev-ids.json", JSON.stringify(allIds, null, 2));
  log("💾", "All IDs saved to scripts/lit-agt-001-dev-ids.json");

  // ── FINAL SUMMARY ─────────────────────────────────────────────────────────
  console.log("\n" + "═".repeat(70));
  console.log("  ✅  LIT-AGT-001 — COMPLETE");
  console.log("═".repeat(70));
  console.log(`  Agent:          ${AGENT_ID}`);
  console.log(`  Knowledge Base: ${KB_ID} (6 sources)`);
  console.log(`  Skills:         6 (preloaded)`);
  console.log(`  Policies:       6 (bound)`);
  console.log(`  Runbooks:       6`);
  console.log(`  Golden Dataset: ${DATASET_ID} (6 test cases)`);
  console.log(`  Eval Suite:     ${EVAL_ID} (weekly, regression)`);
  console.log(`  Outcome:        ${outcomeId} (8 KPIs)`);
  console.log("\n  Next step: node scripts/generate-prod-migration.js\n");

  return allIds;
}

main().catch(e => { console.error("❌", e.message); process.exit(1); });
