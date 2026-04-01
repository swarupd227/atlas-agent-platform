#!/usr/bin/env node
/**
 * Final completion for LIT-AGT-001 — test cases, eval, outcome, linkages.
 * Dataset already created: 6583b657-2902-42ab-82ee-7e1f51e6380f
 */

const BASE = "http://localhost:5000";
const AGENT_ID     = "e3036eb8-36ef-450c-9ee5-7ab12134169a";
const KB_ID        = "95c440f2-b7f1-408a-9d37-2da16fbae0e0";
const DATASET_ID   = "6583b657-2902-42ab-82ee-7e1f51e6380f";
const SKILL_IDS = [
  "9d6e0875-dc71-4e90-8026-c40d6cf0c57f",
  "53740fbd-fcad-435f-9e43-3e1425daa613",
  "746f7afa-731a-4af9-9ae1-e777c280dc88",
  "77a84d86-1350-4ded-afdf-8a363b67cf7b",
  "da1e57c1-8a34-4852-a444-290a4b6fc0e2",
  "99745ce1-07bb-4394-a6fc-f49ebdbd2097",
];
const POLICY_IDS = [
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
function log(e, m) { console.log(`${e}  ${m}`); }

async function main() {
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  LIT-AGT-001 — Final Completion (Test Cases + Linkages)");
  console.log("═══════════════════════════════════════════════════════════\n");

  // ── 1. TEST CASES ────────────────────────────────────────────────────────
  log("📝", "Adding evaluation test cases to golden dataset…");

  const testCases = [
    {
      name: "California Non-Compete — SB 699 Post-2024",
      inputScenario: "Company is HQ'd in Texas but has employees working in California. Can we include non-compete agreements in California offer letters?",
      expectedBehavior: "Must correctly identify that non-competes are void in California per Bus. & Prof. Code § 16600 and SB 699 (eff. 1/1/2024), cite AB 1076 notification requirement, distinguish CA from TX employees, and include UPL-compliant framing requiring attorney review",
      evaluationCriteria: [
        "Cites Cal. Bus. & Prof. Code § 16600",
        "References SB 699 and its retroactive effect on out-of-state agreements",
        "References AB 1076 notification obligation",
        "Distinguishes California from Texas employees",
        "Includes UPL disclaimer",
        "Recommends attorney review"
      ],
      rubricScoring: {
        dimensions: [
          { name: "Statutory Accuracy", weight: 0.35, passingScore: 0.90 },
          { name: "Jurisdiction Coverage", weight: 0.25, passingScore: 0.90 },
          { name: "UPL Compliance", weight: 0.25, passingScore: 1.00 },
          { name: "Practical Guidance", weight: 0.15, passingScore: 0.80 }
        ],
        passingScore: 0.88
      },
      difficultyTier: "standard",
      scenarioCategory: "compliance_critical",
      tags: ["non-compete", "california", "SB699", "AB1076", "multi-state"]
    },
    {
      name: "Remote Worker Paid Sick Leave — Which State Law Applies",
      inputScenario: "We're headquartered in Delaware with no state paid sick leave law, but have remote employees in California, New York, Washington, Colorado, and Illinois. Which paid sick leave law applies to each remote employee?",
      expectedBehavior: "Must correctly identify that the work-location state's law governs remote workers. Must provide specific accrual rates for each jurisdiction: CA (40 hrs, SB 616), NY (56/40 hrs by size), WA (1:40 accrual), CO (48 hrs HFWA), IL (40 hrs PLAWA). Must note Delaware has no statewide law.",
      evaluationCriteria: [
        "States that work-location law governs",
        "Correctly identifies CA as 40 hours under SB 616",
        "Correctly identifies WA accrual rate",
        "Correctly identifies CO as 48 hours under HFWA",
        "Notes Delaware has no paid sick leave law",
        "Provides appropriate citations"
      ],
      rubricScoring: {
        dimensions: [
          { name: "Jurisdiction Determination Rule", weight: 0.30, passingScore: 1.00 },
          { name: "State-by-State Accuracy", weight: 0.45, passingScore: 0.85 },
          { name: "Citation Quality", weight: 0.25, passingScore: 0.90 }
        ],
        passingScore: 0.90
      },
      difficultyTier: "standard",
      scenarioCategory: "compliance_critical",
      tags: ["paid-sick-leave", "remote-work", "multi-state", "jurisdiction-determination"]
    },
    {
      name: "Cannabis Testing Policy — California AB 2188",
      inputScenario: "Can we maintain a zero-tolerance drug policy and test employees for marijuana in California after AB 2188?",
      expectedBehavior: "Must identify that AB 2188 (eff. 1/1/2024) prohibits discrimination based on off-duty cannabis use or non-psychoactive metabolite tests for most CA employers. Must identify exceptions (federal contractors, federal background investigation roles). Must note observation-based impairment testing remains permissible. Must cite Cal. Gov. Code § 12954.",
      evaluationCriteria: [
        "Identifies AB 2188 prohibition on non-psychoactive metabolite testing",
        "Correctly identifies federal contractor exception",
        "Notes permissibility of observation-based impairment assessment",
        "Recommends policy update",
        "Cites Cal. Gov. Code § 12954"
      ],
      rubricScoring: {
        dimensions: [
          { name: "Legal Accuracy", weight: 0.40, passingScore: 0.90 },
          { name: "Exception Identification", weight: 0.30, passingScore: 0.85 },
          { name: "Actionable Guidance", weight: 0.30, passingScore: 0.80 }
        ],
        passingScore: 0.85
      },
      difficultyTier: "standard",
      scenarioCategory: "compliance_critical",
      tags: ["cannabis", "california", "AB2188", "drug-testing", "off-duty"]
    },
    {
      name: "NLRB McLaren Macomb — Severance Agreement Compliance",
      inputScenario: "Our standard severance agreement has a broad non-disparagement clause prohibiting employees from making negative statements about the company, and a confidentiality provision requiring them not to disclose agreement terms. Is this still lawful after the McLaren Macomb decision?",
      expectedBehavior: "Must cite McLaren Macomb (372 NLRB No. 58, 2023), explain that broad non-disparagement and confidentiality clauses that chill NLRA Section 7 rights are unlawful, advise revision of the template, and note that narrow carve-outs for trade secrets may survive. Should recommend attorney review given potential retroactive effect.",
      evaluationCriteria: [
        "Cites McLaren Macomb (372 NLRB No. 58, 2023)",
        "Correctly explains Section 7 right protection",
        "Advises revision of severance template",
        "Notes narrow carve-outs may survive",
        "Recommends attorney review",
        "UPL compliant framing"
      ],
      rubricScoring: {
        dimensions: [
          { name: "Case Law Accuracy", weight: 0.35, passingScore: 0.90 },
          { name: "Practical Guidance", weight: 0.35, passingScore: 0.85 },
          { name: "UPL Compliance", weight: 0.30, passingScore: 1.00 }
        ],
        passingScore: 0.87
      },
      difficultyTier: "advanced",
      scenarioCategory: "compliance_critical",
      tags: ["NLRB", "severance", "McLaren-Macomb", "non-disparagement", "Section-7"]
    },
    {
      name: "Colorado Pay Transparency — Remote Role National Posting",
      inputScenario: "We're posting a remote software engineer position on LinkedIn nationally. Do we need to include salary information given Colorado's EPEWA?",
      expectedBehavior: "Must correctly identify that Colorado's EPEWA requires salary range AND benefits description in all job postings viewable by Colorado applicants, including national remote role postings. Must explain the company cannot simply geo-block Colorado. Must cite C.R.S. § 8-5-201.",
      evaluationCriteria: [
        "Correctly identifies Colorado EPEWA applies to remote national postings",
        "Explains salary range AND benefits must be included",
        "Notes geo-blocking is not a viable workaround",
        "Cites C.R.S. § 8-5-201",
        "Recommends policy update"
      ],
      rubricScoring: {
        dimensions: [
          { name: "Statutory Accuracy", weight: 0.40, passingScore: 0.90 },
          { name: "Remote Posting Analysis", weight: 0.35, passingScore: 0.90 },
          { name: "Practical Guidance", weight: 0.25, passingScore: 0.80 }
        ],
        passingScore: 0.88
      },
      difficultyTier: "standard",
      scenarioCategory: "compliance_critical",
      tags: ["pay-transparency", "colorado", "EPEWA", "remote-posting"]
    },
    {
      name: "UPL Framing Validation — Definitive Legal Advice Request",
      inputScenario: "Tell me definitively: is our non-compete agreement enforceable in Illinois? Yes or no?",
      expectedBehavior: "Agent must refuse to give a definitive 'yes or no' legal conclusion without attorney review. Must include UPL-compliant framing stating this is legal research assistance, not legal advice, and recommend attorney consultation. Must still provide substantive Illinois non-compete law analysis (salary thresholds, enforceability criteria) while maintaining proper framing.",
      evaluationCriteria: [
        "Does NOT say 'This is legal advice'",
        "Includes 'legal research assistance' or equivalent disclaimer",
        "Includes recommendation to consult a qualified attorney",
        "Does NOT give unqualified yes/no legal conclusion",
        "Still provides substantive IL non-compete law analysis",
        "References IL salary threshold for non-compete enforceability"
      ],
      rubricScoring: {
        dimensions: [
          { name: "UPL Compliance (hard gate)", weight: 0.50, passingScore: 1.00 },
          { name: "Substantive Content Quality", weight: 0.30, passingScore: 0.80 },
          { name: "Attorney Referral", weight: 0.20, passingScore: 1.00 }
        ],
        passingScore: 0.90
      },
      difficultyTier: "advanced",
      scenarioCategory: "compliance_critical",
      tags: ["UPL", "illinois", "non-compete", "framing", "compliance-gate"]
    }
  ];

  for (const tc of testCases) {
    await api("POST", `/api/golden-datasets/${DATASET_ID}/test-cases`, tc);
    log("  ✓", `Test case: ${tc.name}`);
  }

  // ── 2. EVAL SUITE ─────────────────────────────────────────────────────────
  log("🧪", "Creating evaluation suite…");
  const evalSuite = await api("POST", "/api/evals", {
    agentId: AGENT_ID,
    name: "Employment Compliance & Policy Advisory — Core Regression Suite",
    type: "regression",
    industry: "legal_services",
    goldenDatasetId: DATASET_ID,
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
      "multi-state-compliance", "jurisdiction-identification", "policy-drafting",
      "new-legislation-response", "upl-compliance", "attorney-client-privilege",
      "gap-analysis", "conflict-resolution", "emergency-response"
    ],
    environmentThresholds: {
      development: { minPassRate: 0.85, citationAccuracy: 0.90 },
      staging: { minPassRate: 0.88, citationAccuracy: 0.95 },
      production: { minPassRate: 0.92, citationAccuracy: 0.98 }
    },
    ontologyTags: ["LKIF", "SALI-LMSS", "employment-law", "jurisdiction", "statute"],
    schedule: "weekly"
  });
  log("  ✓", `Eval suite: ${evalSuite.id}`);

  // ── 3. OUTCOME CONTRACT ───────────────────────────────────────────────────
  log("📊", "Creating outcome contract with 8 KPIs…");
  const outcomeResult = await api("POST", "/api/outcomes/with-kpis", {
    outcome: {
      name: "Employment Compliance & Policy Advisory — Service Contract",
      description:
        "Outcome contract for the Employment Compliance & Policy Advisory Agent (LIT-AGT-001). " +
        "Tracks advisory accuracy, jurisdiction identification, policy gap detection, drafting " +
        "quality, UPL compliance, and attorney escalation performance across multi-jurisdiction " +
        "employment law engagements.",
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
        description: "95th percentile response time for standard employment compliance advisory",
        metricType: "latency",
        target: 15000,
        unit: "milliseconds",
        frequency: "real_time",
        measurementMethod: "api_trace_timing",
        thresholds: { warning: 18000, critical: 25000 }
      },
      {
        name: "New Legislation Alert Latency",
        description: "Time from legislation enactment to client alert delivery (target: < 24 hours)",
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
  log("  ✓", `Outcome contract: ${outcomeId}`);

  // ── 4. LINK EVERYTHING ───────────────────────────────────────────────────
  log("🔗", "Linking all platform intelligence to agent…");

  await api("PATCH", `/api/agents/${AGENT_ID}`, {
    preloadedSkills: SKILL_IDS,
    policyBindings: POLICY_IDS,
    outcomeId,
    evalBindings: [evalSuite.id]
  });
  log("  ✓", `Skills, policies, outcome, eval suite linked to agent`);

  // Link KB
  try {
    await api("POST", `/api/agents/${AGENT_ID}/knowledge-bases`, {
      knowledgeBaseId: KB_ID,
      priority: 1,
      retrievalConfig: {
        topK: 8,
        scoreThreshold: 0.72,
        rerankEnabled: true,
        jurisdictionFiltering: true,
        citationMode: "full"
      }
    });
    log("  ✓", `Knowledge base linked to agent`);
  } catch (e) {
    log("  ⚠", `KB link (may already exist): ${e.message.slice(0, 80)}`);
  }

  // ── 5. SAVE ALL IDs ───────────────────────────────────────────────────────
  const allIds = {
    agentId: AGENT_ID,
    kbId: KB_ID,
    skillIds: SKILL_IDS,
    policyIds: POLICY_IDS,
    runbookIds: RUNBOOK_IDS,
    goldenDatasetId: DATASET_ID,
    evalSuiteId: evalSuite.id,
    outcomeId
  };

  const fs = await import("fs");
  fs.writeFileSync("/home/runner/workspace/scripts/lit-agt-001-dev-ids.json", JSON.stringify(allIds, null, 2));

  // ── 6. SUMMARY ────────────────────────────────────────────────────────────
  console.log("\n" + "═".repeat(70));
  console.log("  ✅  LIT-AGT-001 FULLY CREATED — ALL PLATFORM INTELLIGENCE LINKED");
  console.log("═".repeat(70));
  console.log(`\n  Agent ID:          ${AGENT_ID}`);
  console.log(`  Knowledge Base:    ${KB_ID} (6 sources)`);
  console.log(`  Skills (6):        ${SKILL_IDS.join("\n                     ")}`);
  console.log(`  Policies (6):      ${POLICY_IDS.join("\n                     ")}`);
  console.log(`  Runbooks (6):      ${RUNBOOK_IDS.join("\n                     ")}`);
  console.log(`  Golden Dataset:    ${DATASET_ID} (6 test cases)`);
  console.log(`  Eval Suite:        ${evalSuite.id}`);
  console.log(`  Outcome Contract:  ${outcomeId} (8 KPIs)`);
  console.log("\n  IDs saved to: scripts/lit-agt-001-dev-ids.json");
  console.log("  Run: node scripts/generate-prod-migration.js to create CURL migration script\n");

  return allIds;
}

main().catch(err => { console.error("❌ ERROR:", err.message); process.exit(1); });
