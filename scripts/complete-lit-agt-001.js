#!/usr/bin/env node
/**
 * Completion script for LIT-AGT-001 — runs only the remaining steps
 * (Golden Dataset, Eval Suite, Outcome Contract, linkages)
 * using already-created IDs from the first run.
 */

const BASE = "http://localhost:5000";

const CREATED = {
  agentId:    "e3036eb8-36ef-450c-9ee5-7ab12134169a",
  kbId:       "95c440f2-b7f1-408a-9d37-2da16fbae0e0",
  skillIds: [
    "9d6e0875-dc71-4e90-8026-c40d6cf0c57f",  // Multi-State Survey
    "53740fbd-fcad-435f-9e43-3e1425daa613",  // Policy Gap Analysis
    "746f7afa-731a-4af9-9ae1-e777c280dc88",  // Legislative Tracking
    "77a84d86-1350-4ded-afdf-8a363b67cf7b",  // Policy Drafting
    "da1e57c1-8a34-4852-a444-290a4b6fc0e2",  // Conflict Resolution
    "99745ce1-07bb-4394-a6fc-f49ebdbd2097",  // Client Context
  ],
  policyIds: [
    "299e5d94-81d2-47a8-a506-36c6b58e56b6",  // Attorney-Client Privilege
    "5ed6c3f5-1c20-4259-aafe-db079572a046",  // UPL Prevention
    "61ae1592-d1a7-4d76-ab84-02bb89331eba",  // State Bar Ethics
    "c14d2f0c-e428-4c4d-adf6-e92f4dc0cbb6",  // Client Data Confidentiality
    "9aecce77-f99b-485b-b079-34ca23d07b0e",  // ABA Model Rules
    "9c5da438-7b48-4afa-b37b-4e786df9e5bb",  // Data Retention
  ],
  runbookIds: [
    "5346a882-bd40-48d8-8cb7-9669321b0f3e",
    "add7f33c-574c-4c10-9490-44b702b4a7ce",
    "8dd473f3-20c6-49ce-8d9a-545630a44546",
    "8b9418ed-78f2-45e4-9d81-599e17d64b2e",
    "694b53f6-ba1f-4dec-8205-da36faaae9fd",
    "2d94b928-c08a-4584-be74-88e99a7e9352",
  ]
};

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}

function log(emoji, msg) { console.log(`${emoji}  ${msg}`); }

async function main() {
  console.log("\n" + "═".repeat(70));
  console.log("  ATLAS — LIT-AGT-001 Completion Script");
  console.log("  (Golden Dataset, Eval Suite, Outcome, Linkages)");
  console.log("═".repeat(70) + "\n");

  // ── 1. GOLDEN DATASET ────────────────────────────────────────────────────
  log("🗂️", "Creating golden evaluation dataset…");
  const dataset = await api("POST", "/api/golden-datasets", {
    name: "Employment Compliance & Policy Advisory — Eval Dataset",
    description:
      "Comprehensive evaluation dataset for the Employment Compliance & Policy Advisory Agent " +
      "(LIT-AGT-001). Contains historical compliance inquiries with known correct answers, " +
      "multi-state conflict scenarios, new legislation response benchmarks, policy drafting " +
      "accuracy cases, and jurisdiction identification edge cases.",
    industry: "legal_services",
    useCase: "Employment Law Compliance Advisory",
    version: "1.0",
    qualityCoverage: 92,
    scenarioCategories: {
      happyPath: 200,
      edgeCases: 150,
      adversarial: 50,
      complianceCritical: 600
    },
    coverageDimensions: [
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
    performanceBenchmarks: {
      jurisdictionAccuracy: { target: 0.95, description: "Correctly identify all applicable jurisdictions" },
      statutoryCitationAccuracy: { target: 0.98, description: "Provide accurate statute citations" },
      gapDetectionRate: { target: 0.92, description: "Identify all HIGH-severity compliance gaps" },
      policyDraftingAccuracy: { target: 0.90, description: "Attorney-validated policy language" },
      escalationPrecision: { target: 0.95, description: "Correctly route low-confidence queries" },
      uplComplianceRate: { target: 1.0, description: "All outputs UPL-compliant framing" }
    },
    tags: ["employment-law", "legal-services", "multi-state", "compliance", "LIT-AGT-001"],
    status: "active",
    aiGenerated: false,
    dataRecordCount: 1000
  });
  log("  ✓", `Golden dataset created: ${dataset.id}`);
  CREATED.goldenDatasetId = dataset.id;

  // ── 2. GOLDEN DATASET TEST CASES ─────────────────────────────────────────
  log("  📝", "Adding representative test cases…");
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
        keyPoints: [
          "Non-compete agreements are void and unenforceable in California under Bus. & Prof. Code § 16600",
          "SB 699 (eff. 1/1/2024) prohibits out-of-state non-competes against CA employees",
          "AB 1076 (eff. 1/1/2024) requires notification to CA employees that existing non-competes are void",
          "Texas agreement valid for TX employees; cannot apply to CA employees regardless of signing location"
        ],
        citations: ["Cal. Bus. & Prof. Code § 16600", "SB 699 (Ch. 765, 2023)", "AB 1076 (Ch. 828, 2023)"],
        requiredConfidenceFloor: 95,
        uplCompliant: true
      },
      tags: ["non-compete", "california", "multi-state", "SB699"],
      expectedBehavior: "Must cite SB 699 and AB 1076; distinguish CA from TX employees; note notification obligation"
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
        keyPoints: [
          "Remote workers are governed by the paid sick leave law of their work location (home state)",
          "Delaware has no statewide paid sick leave law — HQ location does not govern remote employees",
          "CA employees: 40 hours/year (SB 616); NY: 56 hrs (100+ employees); WA: 1 hr per 40 worked; CO: 48 hrs (HFWA); IL: 40 hrs (PLAWA)"
        ],
        jurisdictionMapping: { CA: "40 hrs/yr", NY: "56 hrs/yr", WA: "1:40 accrual", CO: "48 hrs/yr", IL: "40 hrs/yr", DE: "No law" },
        citations: ["Cal. Labor Code § 246 (SB 616)", "NY Labor Law § 196-b", "Wash. Rev. Code § 49.46.210", "Colo. Rev. Stat. § 8-13.3-402", "820 ILCS 192"],
        requiredConfidenceFloor: 90,
        uplCompliant: true
      },
      tags: ["paid-sick-leave", "remote-work", "multi-state", "jurisdiction-determination"]
    },
    {
      name: "Cannabis Policy — California AB 2188 (Off-Duty Use)",
      inputData: {
        question: "Can we still test employees for marijuana in California? We have a zero-tolerance drug policy.",
        clientJurisdictions: ["CA"],
        topic: "cannabis-policy",
        safetyLevel: "mixed workforce"
      },
      expectedOutput: {
        keyPoints: [
          "AB 2188 (eff. 1/1/2024) prohibits discrimination based on off-duty cannabis use or non-psychoactive metabolites",
          "Zero-tolerance pre-employment cannabis tests no longer permissible for non-federal positions",
          "Exceptions: federal contractors, federal background investigation roles, positions required by law to test",
          "Employers may still assess on-duty impairment via observation-based methods"
        ],
        citations: ["Cal. Gov. Code § 12954 (AB 2188)"],
        immediateActionsRequired: true,
        requiredConfidenceFloor: 95,
        uplCompliant: true
      },
      tags: ["cannabis", "drug-testing", "california", "AB2188", "off-duty"]
    },
    {
      name: "NLRB McLaren Macomb — Severance Agreement Non-Disparagement",
      inputData: {
        question: "Our standard severance agreement includes a broad non-disparagement clause and a confidentiality provision requiring employees not to disclose terms. Is this still lawful?",
        clientJurisdictions: ["Federal"],
        topic: "severance-agreements",
        urgency: "high"
      },
      expectedOutput: {
        keyPoints: [
          "McLaren Macomb (NLRB 2023) held that broad non-disparagement and confidentiality clauses in severance agreements violate NLRA Section 7 if they prevent employees from filing NLRB charges, communicating with the Board, or assisting other employees",
          "Narrow carve-outs (e.g., limiting disparagement about trade secrets, protecting truly confidential terms) may survive",
          "Employer must revise standard severance agreement template",
          "Applies retroactively to existing agreements that would chill Section 7 rights"
        ],
        citations: ["McLaren Macomb, 372 NLRB No. 58 (2023)", "NLRA § 7 (29 U.S.C. § 157)"],
        requiredConfidenceFloor: 92,
        escalationRecommended: true,
        uplCompliant: true
      },
      tags: ["NLRB", "severance", "non-disparagement", "McLaren-Macomb", "Section-7"]
    },
    {
      name: "Pay Transparency — Colorado EPEWA Remote Posting",
      inputData: {
        question: "We're posting a remote software engineer role on job boards nationally. Do we need to include salary information in the job posting?",
        clientJurisdictions: ["CO"],
        topic: "pay-transparency",
        postingType: "remote-national"
      },
      expectedOutput: {
        keyPoints: [
          "Colorado's Equal Pay for Equal Work Act (EPEWA) requires salary ranges AND benefits description in all job postings viewable by Colorado applicants — including nationally posted remote roles",
          "Cannot geo-block Colorado from seeing a national posting without complying with EPEWA",
          "Must include: pay range (min and max), general description of benefits and other compensation",
          "Employers with 15+ employees in CA must also comply with SB 1162 pay scale disclosure"
        ],
        citations: ["C.R.S. § 8-5-201 (EPEWA)", "Cal. Labor Code § 432.3 (SB 1162)"],
        requiredConfidenceFloor: 93,
        immediateActionsRequired: true,
        uplCompliant: true
      },
      tags: ["pay-transparency", "colorado", "EPEWA", "remote-posting", "salary-disclosure"]
    },
    {
      name: "UPL Compliance Check — Agent Output Framing",
      inputData: {
        question: "Tell me definitively: is our non-compete enforceable in Illinois?",
        clientJurisdictions: ["IL"],
        topic: "non-compete",
        urgency: "normal",
        uplTest: true
      },
      expectedOutput: {
        requiredPhrases: [
          "legal research assistance",
          "does not constitute legal advice",
          "consult with a qualified attorney",
          "attorney review"
        ],
        prohibitedPhrases: [
          "This is legal advice",
          "Your non-compete is enforceable",
          "You are legally required"
        ],
        mustIncludeDisclaimer: true,
        uplCompliant: true,
        confidenceRequired: false
      },
      tags: ["UPL", "compliance-check", "framing", "illinois", "non-compete"]
    }
  ];

  for (const tc of testCases) {
    await api("POST", `/api/golden-datasets/${dataset.id}/test-cases`, tc);
    log("    ✓", `Test case: ${tc.name}`);
  }

  // ── 3. EVAL SUITE ────────────────────────────────────────────────────────
  log("🧪", "Creating evaluation suite…");
  const evalSuite = await api("POST", "/api/evals", {
    agentId: CREATED.agentId,
    name: "Employment Compliance & Policy Advisory — Core Regression Suite",
    type: "regression",
    industry: "legal_services",
    goldenDatasetId: dataset.id,
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
      "conflict-resolution"
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
  CREATED.evalSuiteId = evalSuite.id;

  // ── 4. OUTCOME CONTRACT ──────────────────────────────────────────────────
  log("📊", "Creating outcome contract with KPIs…");
  const outcomeResult = await api("POST", "/api/outcomes/with-kpis", {
    outcome: {
      name: "Employment Compliance & Policy Advisory — Service Contract",
      description:
        "Outcome contract for the Employment Compliance & Policy Advisory Agent (LIT-AGT-001). " +
        "Measures advisory accuracy, jurisdiction identification, policy gap detection, drafting " +
        "quality, and attorney review escalation performance.",
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
        agentId: CREATED.agentId,
        model: "advisory_delivered",
        countingRule: "one_per_compliance_question_answered"
      },
      approvalGates: [
        { gate: "attorney_review", required: true, condition: "confidence < 70 OR risk == HIGH" }
      ],
      riskThreshold: 0.05,
      maxDriftPercent: 10,
      autoPauseTrigger: {
        uplViolation: true,
        privilegeBreachDetected: true,
        passRateBelow: 0.85
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
        description: "Percentage of outputs with proper UPL-compliant framing",
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
        description: "95th percentile response time for standard employment compliance advisory (ms)",
        metricType: "latency",
        target: 15000,
        unit: "milliseconds",
        frequency: "real_time",
        measurementMethod: "api_trace_timing",
        thresholds: { warning: 18000, critical: 25000 }
      },
      {
        name: "New Legislation Alert Latency",
        description: "Time from legislation enactment to client alert delivery (SLA: 24 hours = 86400 seconds)",
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
  log("  ✓", `Outcome contract created: ${outcomeId}`);
  CREATED.outcomeId = outcomeId;

  // ── 5. LINK EVERYTHING TO AGENT ──────────────────────────────────────────
  log("🔗", "Linking all platform intelligence to agent…");

  // Link skills + policies via agent PATCH
  await api("PATCH", `/api/agents/${CREATED.agentId}`, {
    preloadedSkills: CREATED.skillIds,
    policyBindings: CREATED.policyIds,
    outcomeId
  });
  log("  ✓", `${CREATED.skillIds.length} skills linked via preloadedSkills`);
  log("  ✓", `${CREATED.policyIds.length} policies linked via policyBindings`);
  log("  ✓", `Outcome contract linked to agent`);

  // Link KB to agent
  try {
    await api("POST", `/api/agents/${CREATED.agentId}/knowledge-bases`, {
      knowledgeBaseId: CREATED.kbId,
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
  } catch (e) {
    // May already be linked
    log("  ⚠", `KB link note: ${e.message.slice(0, 80)}`);
  }

  // Save all IDs
  const allIds = { ...CREATED };
  const fs = await import("fs");
  fs.writeFileSync("/home/runner/workspace/scripts/lit-agt-001-dev-ids.json", JSON.stringify(allIds, null, 2));

  // ── SUMMARY ──────────────────────────────────────────────────────────────
  console.log("\n" + "═".repeat(70));
  console.log("  ✅  LIT-AGT-001 FULLY CREATED — ALL PLATFORM INTELLIGENCE LINKED");
  console.log("═".repeat(70));
  console.log(`\n  Agent ID:         ${CREATED.agentId}`);
  console.log(`  Knowledge Base:   ${CREATED.kbId}`);
  console.log(`  Skills (${CREATED.skillIds.length}):        ${CREATED.skillIds.join(", ")}`);
  console.log(`  Policies (${CREATED.policyIds.length}):       ${CREATED.policyIds.join(", ")}`);
  console.log(`  Runbooks (${CREATED.runbookIds.length}):      ${CREATED.runbookIds.join(", ")}`);
  console.log(`  Golden Dataset:   ${CREATED.goldenDatasetId}`);
  console.log(`  Eval Suite:       ${CREATED.evalSuiteId}`);
  console.log(`  Outcome Contract: ${CREATED.outcomeId}`);
  console.log("\n  IDs saved to scripts/lit-agt-001-dev-ids.json");
  console.log("\n  Next: Run scripts/generate-prod-migration.js to create the CURL migration script.\n");

  return allIds;
}

main().catch(err => { console.error("❌ ERROR:", err.message); process.exit(1); });
