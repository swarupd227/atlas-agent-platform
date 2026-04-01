#!/usr/bin/env node
/**
 * LIT-AGT-001 → Production Migration
 * Employment Compliance & Policy Advisory Agent
 *
 * Usage:
 *   export PROD_BASE="https://agent-lifecycle-management-platform.replit.app"
 *   node scripts/migrate-lit-agt-001-to-prod.js
 *
 * Requires: node v18+ (fetch built-in). No other tools needed.
 */

const PROD_BASE = process.env.PROD_BASE || "https://agent-lifecycle-management-platform.replit.app";
const PROD_ORG_ID = "cf5754b1-ee80-4b51-8bf6-7be263c97527";
const DEV_BASE = "http://localhost:5000";

const DEV_IDS = {
  agentId:       "e3036eb8-36ef-450c-9ee5-7ab12134169a",
  kbId:          "95c440f2-b7f1-408a-9d37-2da16fbae0e0",
  skillIds:      ["9d6e0875-dc71-4e90-8026-c40d6cf0c57f","53740fbd-fcad-435f-9e43-3e1425daa613","746f7afa-731a-4af9-9ae1-e777c280dc88","77a84d86-1350-4ded-afdf-8a363b67cf7b","da1e57c1-8a34-4852-a444-290a4b6fc0e2","99745ce1-07bb-4394-a6fc-f49ebdbd2097"],
  policyIds:     ["299e5d94-81d2-47a8-a506-36c6b58e56b6","5ed6c3f5-1c20-4259-aafe-db079572a046","61ae1592-d1a7-4d76-ab84-02bb89331eba","c14d2f0c-e428-4c4d-adf6-e92f4dc0cbb6","9aecce77-f99b-485b-b079-34ca23d07b0e","9c5da438-7b48-4afa-b37b-4e786df9e5bb"],
  runbookIds:    ["5346a882-bd40-48d8-8cb7-9669321b0f3e","add7f33c-574c-4c10-9490-44b702b4a7ce","8dd473f3-20c6-49ce-8d9a-545630a44546","8b9418ed-78f2-45e4-9d81-599e17d64b2e","694b53f6-ba1f-4dec-8205-da36faaae9fd","2d94b928-c08a-4584-be74-88e99a7e9352"],
  goldenDatasetId: "6583b657-2902-42ab-82ee-7e1f51e6380f",
  evalSuiteId:     "2e62985c-f5c8-4dbd-b237-a9678c0d9c37",
  outcomeId:       "fe1d25df-64f1-4e68-a948-6ae71639b501",
};

// ── Helpers ────────────────────────────────────────────────────────────────────

async function devGet(path) {
  const r = await fetch(`${DEV_BASE}${path}`);
  if (!r.ok) throw new Error(`DEV GET ${path} → ${r.status}`);
  return r.json();
}

async function prodPost(path, body) {
  const r = await fetch(`${PROD_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!r.ok) throw new Error(`POST ${path} → ${r.status}: ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}

async function prodPatch(path, body) {
  const r = await fetch(`${PROD_BASE}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`PATCH ${path} → ${r.status}: ${text.slice(0, 200)}`);
  }
  return r.json();
}

const log  = (msg) => console.log(`  ✓  ${msg}`);
const warn = (msg) => console.log(`  ⚠  ${msg}`);
const step = (n, msg) => console.log(`\nSTEP ${n}/9  ${msg}`);

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n════════════════════════════════════════════════════════════════");
  console.log("  LIT-AGT-001 → Production Migration");
  console.log(`  Target: ${PROD_BASE}`);
  console.log("════════════════════════════════════════════════════════════════\n");

  // Fetch all dev data first
  console.log("Fetching source data from dev…");
  const [agent, kb, evalSuite, outcome] = await Promise.all([
    devGet(`/api/agents/${DEV_IDS.agentId}`),
    devGet(`/api/knowledge-bases/${DEV_IDS.kbId}`),
    devGet(`/api/evals/${DEV_IDS.evalSuiteId}`),
    devGet(`/api/outcomes/${DEV_IDS.outcomeId}`),
  ]);
  const [skills, policies, runbooks, testCases, kpis, kbSources] = await Promise.all([
    Promise.all(DEV_IDS.skillIds.map(id => devGet(`/api/skills/${id}`))),
    Promise.all(DEV_IDS.policyIds.map(id => devGet(`/api/policies/${id}`))),
    Promise.all(DEV_IDS.runbookIds.map(id => devGet(`/api/runbooks/${id}`))),
    devGet(`/api/golden-datasets/${DEV_IDS.goldenDatasetId}/test-cases`),
    devGet(`/api/outcomes/${DEV_IDS.outcomeId}/kpis`),
    devGet(`/api/knowledge-bases/${DEV_IDS.kbId}/sources`),
  ]);
  console.log(`  ✓  ${skills.length} skills, ${policies.length} policies, ${runbooks.length} runbooks`);
  console.log(`  ✓  KB (${kbSources.length} sources), ${testCases.length} test cases, ${kpis.length} KPIs`);

  const prodIds = {};

  // ── STEP 1: SKILLS ──────────────────────────────────────────────────────────
  step("1", "Creating 6 skills…");
  prodIds.skillIds = [];
  for (const s of skills) {
    const res = await prodPost("/api/skills", {
      name: s.name, description: s.description, category: s.category,
      type: s.type, industry: s.industry,
      author: s.author || "Littler Mendelson Legal Technology Team",
      version: s.version || "1.0.0",
      parameters: s.parameters || {}, executionConfig: s.executionConfig || {},
      inputSchema: s.inputSchema || {}, outputSchema: s.outputSchema || {},
      tags: s.tags || [], status: s.status || "active",
    });
    prodIds.skillIds.push(res.id);
    log(`Skill: ${s.name} → ${res.id}`);
  }

  // ── STEP 2: KNOWLEDGE BASE ──────────────────────────────────────────────────
  step("2", `Creating knowledge base + ${kbSources.length} sources…`);
  const kbRes = await prodPost("/api/knowledge-bases", {
    name: kb.name, description: kb.description, industry: kb.industry,
    visibility: kb.visibility || "org", organizationId: PROD_ORG_ID,
    tags: kb.tags || [], embeddingModel: kb.embeddingModel || "text-embedding-3-small",
    chunkStrategy: kb.chunkStrategy || "paragraph", retrievalConfig: kb.retrievalConfig || {},
  });
  prodIds.kbId = kbRes.id;
  log(`Knowledge Base: ${kb.name} → ${kbRes.id}`);

  for (const src of kbSources) {
    try {
      await prodPost(`/api/knowledge-bases/${prodIds.kbId}/sources/text`, {
        name: src.name, type: src.type || "text",
        content: src.content || src.text || "", metadata: src.metadata || {},
      });
      log(`KB Source: ${src.name.slice(0, 55)}`);
    } catch (e) {
      warn(`KB Source failed (non-fatal): ${src.name.slice(0, 40)} — ${e.message.slice(0, 80)}`);
    }
  }

  // ── STEP 3: RUNBOOKS ────────────────────────────────────────────────────────
  step("3", "Creating 6 runbooks…");
  prodIds.runbookIds = [];
  for (const rb of runbooks) {
    const res = await prodPost("/api/runbooks", {
      name: rb.name, description: rb.description, category: rb.category,
      industry: rb.industry, steps: rb.steps || [], triggers: rb.triggers || [],
      tags: rb.tags || [], status: rb.status || "active",
    });
    prodIds.runbookIds.push(res.id);
    log(`Runbook: ${rb.name.slice(0, 55)} → ${res.id}`);
  }

  // ── STEP 4: GOVERNANCE POLICIES ─────────────────────────────────────────────
  step("4", "Creating 6 governance policies…");
  prodIds.policyIds = [];
  for (const p of policies) {
    const res = await prodPost("/api/policies", {
      name: p.name, description: p.description, type: p.type, category: p.category,
      industry: p.industry, rules: p.rules || [], enforcement: p.enforcement || "soft",
      priority: p.priority || 50, tags: p.tags || [], status: p.status || "active",
    });
    prodIds.policyIds.push(res.id);
    log(`Policy: ${p.name.slice(0, 55)} → ${res.id}`);
  }

  // ── STEP 5: AGENT ───────────────────────────────────────────────────────────
  step("5", "Creating agent…");
  const agentRes = await prodPost("/api/agents", {
    name: agent.name, description: agent.description, agentType: agent.agentType,
    industry: agent.industry, category: agent.category, status: agent.status || "active",
    systemPrompt: agent.systemPrompt, blueprintJson: agent.blueprintJson || {},
    memoryGovernanceRules: agent.memoryGovernanceRules || {},
    complianceTags: agent.complianceTags || [], toolsConfig: agent.toolsConfig || [],
    orchestrationMode: agent.orchestrationMode || "sequential",
    version: agent.version || "1.0.0", organizationId: PROD_ORG_ID,
  });
  prodIds.agentId = agentRes.id;
  log(`Agent: ${agent.name} → ${agentRes.id}`);

  // ── STEP 6: GOLDEN DATASET + TEST CASES ─────────────────────────────────────
  step("6", `Creating golden dataset + ${testCases.length} test cases…`);
  const dsRes = await prodPost("/api/golden-datasets", {
    name: "Employment Compliance & Policy Advisory — Golden Dataset",
    description: "Curated employment law test cases across jurisdiction identification, statutory citation, gap analysis, policy drafting, UPL compliance, and escalation logic",
    industry: "legal_services", qualityCoverage: 88.5,
    tags: ["employment-law","multi-state","jurisdiction","UPL","policy-drafting","citation-accuracy"],
  });
  prodIds.goldenDatasetId = dsRes.id;
  log(`Golden Dataset → ${dsRes.id}`);

  for (const tc of testCases) {
    await prodPost(`/api/golden-datasets/${prodIds.goldenDatasetId}/test-cases`, {
      name: tc.name, inputScenario: tc.inputScenario, expectedBehavior: tc.expectedBehavior,
      evaluationCriteria: tc.evaluationCriteria || [],
      rubricScoring: tc.rubricScoring || { dimensions: [], passingScore: 0.85 },
      difficultyTier: tc.difficultyTier || "standard",
      scenarioCategory: tc.scenarioCategory || "compliance_critical",
      tags: tc.tags || [], status: tc.status || "active",
    });
    log(`Test case: ${tc.name.slice(0, 55)}`);
  }

  // ── STEP 7: EVAL SUITE ──────────────────────────────────────────────────────
  step("7", "Creating evaluation suite…");
  const evalRes = await prodPost("/api/evals", {
    agentId: prodIds.agentId,
    goldenDatasetId: prodIds.goldenDatasetId,
    name: evalSuite.name, type: evalSuite.type || "regression",
    industry: evalSuite.industry || "legal_services",
    thresholdConfig: evalSuite.thresholdConfig || { minPassRate: 0.90 },
    scorerConfig: evalSuite.scorerConfig || {},
    coverageTags: evalSuite.coverageTags || [],
    environmentThresholds: evalSuite.environmentThresholds || {},
    ontologyTags: evalSuite.ontologyTags || [],
    schedule: evalSuite.schedule || "weekly",
  });
  prodIds.evalSuiteId = evalRes.id;
  log(`Eval Suite → ${evalRes.id}`);

  // ── STEP 8: OUTCOME CONTRACT ─────────────────────────────────────────────────
  step("8", `Creating outcome contract + ${kpis.length} KPIs…`);
  const outcomePayload = {
    outcome: {
      name: outcome.name, description: outcome.description,
      riskTier: outcome.riskTier || "HIGH", status: outcome.status || "active",
      version: outcome.version || 1, pricingModel: outcome.pricingModel,
      pricePerUnit: outcome.pricePerUnit, currency: outcome.currency || "USD",
      pricingTiers: outcome.pricingTiers || [], volumeCap: outcome.volumeCap,
      slaConfig: outcome.slaConfig || {},
      attributionRules: { ...outcome.attributionRules, agentId: prodIds.agentId },
      approvalGates: outcome.approvalGates || [],
      riskThreshold: outcome.riskThreshold, maxDriftPercent: outcome.maxDriftPercent,
      autoPauseTrigger: outcome.autoPauseTrigger ?? true, roiEstimate: outcome.roiEstimate || {},
    },
    kpis: kpis.map(k => ({
      name: k.name, description: k.description, metricType: k.metricType,
      target: k.target, unit: k.unit, frequency: k.frequency,
      measurementMethod: k.measurementMethod, thresholds: k.thresholds || {},
    })),
  };
  const outcomeRes = await prodPost("/api/outcomes/with-kpis", outcomePayload);
  prodIds.outcomeId = (outcomeRes.outcome?.id || outcomeRes.id);
  log(`Outcome Contract → ${prodIds.outcomeId}`);

  // ── STEP 9: LINK ALL ────────────────────────────────────────────────────────
  step("9", "Linking all intelligence to agent…");

  // Link KB
  await prodPost(`/api/agents/${prodIds.agentId}/knowledge-bases`, {
    knowledgeBaseId: prodIds.kbId, priority: 1,
    retrievalConfig: { topK: 8, scoreThreshold: 0.72, rerankEnabled: true, jurisdictionFiltering: true, citationMode: "full" },
  });
  log("Knowledge base linked");

  // Link skills, policies, outcome, eval suite to agent
  await prodPatch(`/api/agents/${prodIds.agentId}`, {
    preloadedSkills: prodIds.skillIds,
    policyBindings:  prodIds.policyIds,
    outcomeId:       prodIds.outcomeId,
    evalBindings:    [prodIds.evalSuiteId],
  });
  log("6 skills linked (preloadedSkills)");
  log("6 policies linked (policyBindings)");
  log("Outcome contract linked");
  log("Eval suite linked");

  // Scope runbooks to agent
  for (const id of prodIds.runbookIds) {
    try {
      await prodPatch(`/api/runbooks/${id}`, { agentId: prodIds.agentId });
    } catch (e) {
      warn(`Runbook scope (non-fatal): ${e.message.slice(0, 60)}`);
    }
  }
  log("6 runbooks scoped to agent");

  // ── SAVE PROD IDS ───────────────────────────────────────────────────────────
  const fs = await import("fs");
  const outPath = "scripts/lit-agt-001-prod-ids.json";
  fs.writeFileSync(outPath, JSON.stringify(prodIds, null, 2));

  // ── FINAL SUMMARY ────────────────────────────────────────────────────────────
  console.log("\n════════════════════════════════════════════════════════════════");
  console.log("  ✅  LIT-AGT-001 MIGRATION TO PRODUCTION — COMPLETE");
  console.log("════════════════════════════════════════════════════════════════");
  console.log(`\n  Agent:           ${prodIds.agentId}`);
  console.log(`  Knowledge Base:  ${prodIds.kbId}`);
  console.log(`  Skills (6):      ${prodIds.skillIds.join("\n                   ")}`);
  console.log(`  Policies (6):    ${prodIds.policyIds.join("\n                   ")}`);
  console.log(`  Runbooks (6):    ${prodIds.runbookIds.join("\n                   ")}`);
  console.log(`  Golden Dataset:  ${prodIds.goldenDatasetId}`);
  console.log(`  Eval Suite:      ${prodIds.evalSuiteId}`);
  console.log(`  Outcome:         ${prodIds.outcomeId}`);
  console.log(`\n  Prod IDs saved → ${outPath}\n`);
}

main().catch(err => {
  console.error(`\n❌  Migration failed: ${err.message}`);
  process.exit(1);
});
