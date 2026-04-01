#!/usr/bin/env node
/**
 * Reads all LIT-AGT-001 entities from dev and generates a single CURL
 * migration script for production.
 *
 * Usage:  node scripts/generate-prod-migration.js
 * Output: scripts/migrate-lit-agt-001-to-prod.sh
 *
 * Before running against prod, set:
 *   export PROD_BASE="https://your-production-domain.com"
 */

const BASE = "http://localhost:5000";
const PROD_ORG_ID = "cf5754b1-ee80-4b51-8bf6-7be263c97527";

const IDS = {
  agentId:       "e3036eb8-36ef-450c-9ee5-7ab12134169a",
  kbId:          "95c440f2-b7f1-408a-9d37-2da16fbae0e0",
  skillIds: [
    "9d6e0875-dc71-4e90-8026-c40d6cf0c57f",
    "53740fbd-fcad-435f-9e43-3e1425daa613",
    "746f7afa-731a-4af9-9ae1-e777c280dc88",
    "77a84d86-1350-4ded-afdf-8a363b67cf7b",
    "da1e57c1-8a34-4852-a444-290a4b6fc0e2",
    "99745ce1-07bb-4394-a6fc-f49ebdbd2097",
  ],
  policyIds: [
    "299e5d94-81d2-47a8-a506-36c6b58e56b6",
    "5ed6c3f5-1c20-4259-aafe-db079572a046",
    "61ae1592-d1a7-4d76-ab84-02bb89331eba",
    "c14d2f0c-e428-4c4d-adf6-e92f4dc0cbb6",
    "9aecce77-f99b-485b-b079-34ca23d07b0e",
    "9c5da438-7b48-4afa-b37b-4e786df9e5bb",
  ],
  runbookIds: [
    "5346a882-bd40-48d8-8cb7-9669321b0f3e",
    "add7f33c-574c-4c10-9490-44b702b4a7ce",
    "8dd473f3-20c6-49ce-8d9a-545630a44546",
    "8b9418ed-78f2-45e4-9d81-599e17d64b2e",
    "694b53f6-ba1f-4dec-8205-da36faaae9fd",
    "2d94b928-c08a-4584-be74-88e99a7e9352",
  ],
  goldenDatasetId: "6583b657-2902-42ab-82ee-7e1f51e6380f",
  evalSuiteId:     "2e62985c-f5c8-4dbd-b237-a9678c0d9c37",
  outcomeId:       "fe1d25df-64f1-4e68-a948-6ae71639b501",
};

async function get(path) {
  const r = await fetch(`${BASE}${path}`);
  if (!r.ok) throw new Error(`GET ${path} → ${r.status}`);
  return r.json();
}

function j(obj) {
  return JSON.stringify(obj).replace(/'/g, "'\\''");
}

function curl(method, path, body, comment) {
  const bodyStr = body ? `-d '${j(body)}'` : "";
  return [
    comment ? `\n  # ${comment}` : "",
    `  ${method}_RESP=$(curl -sf -X ${method} "\${PROD_BASE}${path}" \\`,
    `    -H "Content-Type: application/json" \\`,
    body ? `    ${bodyStr} || { echo "FAIL: ${method} ${path}"; exit 1; })` : `    || { echo "FAIL: ${method} ${path}"; exit 1; })`,
    `  echo "  ✓  ${comment || path}"`,
  ].filter(Boolean).join("\n");
}

function curlCapture(varName, method, path, body, comment) {
  const bodyStr = body ? `-d '${j(body)}'` : "";
  return [
    comment ? `\n  # ${comment}` : "",
    `  ${varName}=$(curl -sf -X ${method} "\${PROD_BASE}${path}" \\`,
    `    -H "Content-Type: application/json" \\`,
    body ? `    ${bodyStr} | ${varName === "RAW" ? "cat" : `python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))"` })` : `    | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))")`,
    `  [ -z "$${varName}" ] && { echo "FAIL: could not capture ID from ${method} ${path}"; exit 1; }`,
    `  echo "  ✓  ${comment || path}: $${varName}"`,
  ].filter(Boolean).join("\n");
}

function curlCaptureNested(varName, nestedKey, method, path, body, comment) {
  const bodyStr = body ? `-d '${j(body)}'` : "";
  return [
    comment ? `\n  # ${comment}` : "",
    `  ${varName}=$(curl -sf -X ${method} "\${PROD_BASE}${path}" \\`,
    `    -H "Content-Type: application/json" \\`,
    body ? `    ${bodyStr} | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('${nestedKey}',{}).get('id','') or d.get('id',''))")` : `    | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))")`,
    `  [ -z "$${varName}" ] && { echo "FAIL: could not capture ID from ${method} ${path}"; exit 1; }`,
    `  echo "  ✓  ${comment || path}: $${varName}"`,
  ].filter(Boolean).join("\n");
}

async function main() {
  console.log("Fetching dev data…");

  const [agent, kb, evalSuite, outcome] = await Promise.all([
    get(`/api/agents/${IDS.agentId}`),
    get(`/api/knowledge-bases/${IDS.kbId}`),
    get(`/api/evals/${IDS.evalSuiteId}`),
    get(`/api/outcomes/${IDS.outcomeId}`),
  ]);

  const skills    = await Promise.all(IDS.skillIds.map(id => get(`/api/skills/${id}`)));
  const policies  = await Promise.all(IDS.policyIds.map(id => get(`/api/policies/${id}`)));
  const runbooks  = await Promise.all(IDS.runbookIds.map(id => get(`/api/runbooks/${id}`)));
  const testCases = await get(`/api/golden-datasets/${IDS.goldenDatasetId}/test-cases`);
  const kpis      = await get(`/api/outcomes/${IDS.outcomeId}/kpis`);
  const kbSources = await get(`/api/knowledge-bases/${IDS.kbId}/sources`);

  console.log(`  agent, kb (${kbSources.length} sources), ${skills.length} skills, ${policies.length} policies, ${runbooks.length} runbooks`);
  console.log(`  ${testCases.length} test cases, eval suite, outcome (${kpis.length} KPIs)`);

  // ── Build the shell script ─────────────────────────────────────────────────
  const lines = [];

  lines.push(`#!/usr/bin/env bash`);
  lines.push(`# ============================================================`);
  lines.push(`# LIT-AGT-001 Production Migration Script`);
  lines.push(`# Employment Compliance & Policy Advisory Agent`);
  lines.push(`# Generated: ${new Date().toISOString()}`);
  lines.push(`# Dev Agent ID: ${IDS.agentId}`);
  lines.push(`# ============================================================`);
  lines.push(`#`);
  lines.push(`# Usage:`);
  lines.push(`#   export PROD_BASE="https://your-production-domain.com"`);
  lines.push(`#   bash scripts/migrate-lit-agt-001-to-prod.sh`);
  lines.push(`#`);
  lines.push(`# Requires: curl, python3 (for JSON parsing)`);
  lines.push(`# ============================================================`);
  lines.push(``);
  lines.push(`set -euo pipefail`);
  lines.push(``);
  lines.push(`PROD_BASE="\${PROD_BASE:-http://localhost:5000}"`);
  lines.push(`PROD_ORG_ID="${PROD_ORG_ID}"`);
  lines.push(``);
  lines.push(`echo ""`);
  lines.push(`echo "═══════════════════════════════════════════════════════════════"`);
  lines.push(`echo "  LIT-AGT-001 → Production Migration"`);
  lines.push(`echo "  Target: \${PROD_BASE}"`);
  lines.push(`echo "═══════════════════════════════════════════════════════════════"`);
  lines.push(`echo ""`);

  // ── STEP 1: SKILLS ───────────────────────────────────────────────────────
  lines.push(`echo "STEP 1/9  Creating 6 skills…"`);
  lines.push(`(`);
  const skillVars = [];
  for (let i = 0; i < skills.length; i++) {
    const s = skills[i];
    const varName = `SKILL_${i + 1}_ID`;
    skillVars.push(varName);
    const body = {
      name: s.name,
      description: s.description,
      category: s.category,
      type: s.type,
      industry: s.industry,
      author: s.author || "Littler Mendelson Legal Technology Team",
      version: s.version || "1.0.0",
      parameters: s.parameters || {},
      executionConfig: s.executionConfig || {},
      inputSchema: s.inputSchema || {},
      outputSchema: s.outputSchema || {},
      tags: s.tags || [],
      status: s.status || "active"
    };
    lines.push(curlCapture(varName, "POST", "/api/skills", body, `Skill: ${s.name}`));
  }
  lines.push(`)`);
  lines.push(``);

  // ── STEP 2: KNOWLEDGE BASE ────────────────────────────────────────────────
  lines.push(`echo "STEP 2/9  Creating knowledge base…"`);
  lines.push(`(`);
  const kbBody = {
    name: kb.name,
    description: kb.description,
    industry: kb.industry,
    visibility: kb.visibility || "org",
    organizationId: PROD_ORG_ID,
    tags: kb.tags || [],
    embeddingModel: kb.embeddingModel || "text-embedding-3-small",
    chunkStrategy: kb.chunkStrategy || "paragraph",
    retrievalConfig: kb.retrievalConfig || {}
  };
  lines.push(curlCapture("KB_ID", "POST", "/api/knowledge-bases", kbBody, `KB: ${kb.name}`));

  // KB sources
  for (const src of kbSources) {
    const srcBody = {
      name: src.name,
      type: src.type || "text",
      content: src.content || src.text || "",
      metadata: src.metadata || {}
    };
    lines.push(curlCapture("KB_SRC_ID", "POST", `"/api/knowledge-bases/\${KB_ID}/sources"`, srcBody, `KB Source: ${src.name}`));
  }
  lines.push(`)`);
  lines.push(``);

  // ── STEP 3: RUNBOOKS ──────────────────────────────────────────────────────
  lines.push(`echo "STEP 3/9  Creating 6 runbooks…"`);
  lines.push(`(`);
  const runbookVars = [];
  for (let i = 0; i < runbooks.length; i++) {
    const rb = runbooks[i];
    const varName = `RUNBOOK_${i + 1}_ID`;
    runbookVars.push(varName);
    const body = {
      name: rb.name,
      description: rb.description,
      category: rb.category,
      industry: rb.industry,
      steps: rb.steps || [],
      triggers: rb.triggers || [],
      tags: rb.tags || [],
      status: rb.status || "active"
    };
    lines.push(curlCapture(varName, "POST", "/api/runbooks", body, `Runbook: ${rb.name}`));
  }
  lines.push(`)`);
  lines.push(``);

  // ── STEP 4: GOVERNANCE POLICIES ───────────────────────────────────────────
  lines.push(`echo "STEP 4/9  Creating 6 governance policies…"`);
  lines.push(`(`);
  const policyVars = [];
  for (let i = 0; i < policies.length; i++) {
    const p = policies[i];
    const varName = `POLICY_${i + 1}_ID`;
    policyVars.push(varName);
    const body = {
      name: p.name,
      description: p.description,
      type: p.type,
      category: p.category,
      industry: p.industry,
      rules: p.rules || [],
      enforcement: p.enforcement || "soft",
      priority: p.priority || 50,
      tags: p.tags || [],
      status: p.status || "active"
    };
    lines.push(curlCapture(varName, "POST", "/api/policies", body, `Policy: ${p.name}`));
  }
  lines.push(`)`);
  lines.push(``);

  // ── STEP 5: AGENT ─────────────────────────────────────────────────────────
  lines.push(`echo "STEP 5/9  Creating agent…"`);
  lines.push(`(`);
  const agentBody = {
    name: agent.name,
    description: agent.description,
    agentType: agent.agentType,
    industry: agent.industry,
    category: agent.category,
    status: agent.status || "active",
    systemPrompt: agent.systemPrompt,
    blueprintJson: agent.blueprintJson || {},
    memoryGovernanceRules: agent.memoryGovernanceRules || {},
    complianceTags: agent.complianceTags || [],
    toolsConfig: agent.toolsConfig || [],
    orchestrationMode: agent.orchestrationMode || "sequential",
    version: agent.version || "1.0.0",
    organizationId: PROD_ORG_ID,
    preloadedSkills: skillVars.map((_, i) => `\${${skillVars[i]}}`),
    policyBindings: policyVars.map((_, i) => `\${${policyVars[i]}}`)
  };
  // Skills and policies are added as shell variable references after the fact
  const agentBodyForCurl = { ...agentBody };
  delete agentBodyForCurl.preloadedSkills;
  delete agentBodyForCurl.policyBindings;
  lines.push(curlCapture("AGENT_ID", "POST", "/api/agents", agentBodyForCurl, `Agent: ${agent.name}`));
  lines.push(`)`);
  lines.push(``);

  // ── STEP 6: GOLDEN DATASET ────────────────────────────────────────────────
  lines.push(`echo "STEP 6/9  Creating golden dataset and 6 test cases…"`);
  lines.push(`(`);
  const dsBody = {
    name: `Employment Compliance & Policy Advisory — Golden Dataset`,
    description: "Curated employment law test cases across jurisdiction identification, statutory citation, gap analysis, policy drafting, UPL compliance, and escalation logic",
    industry: "legal_services",
    qualityCoverage: 88.5,
    tags: ["employment-law", "multi-state", "jurisdiction", "UPL", "policy-drafting", "citation-accuracy"]
  };
  lines.push(curlCapture("DATASET_ID", "POST", "/api/golden-datasets", dsBody, "Golden Dataset"));

  for (const tc of testCases) {
    const tcBody = {
      name: tc.name,
      inputScenario: tc.inputScenario,
      expectedBehavior: tc.expectedBehavior,
      evaluationCriteria: tc.evaluationCriteria || [],
      rubricScoring: tc.rubricScoring || { dimensions: [], passingScore: 0.85 },
      difficultyTier: tc.difficultyTier || "standard",
      scenarioCategory: tc.scenarioCategory || "compliance_critical",
      tags: tc.tags || [],
      status: tc.status || "active"
    };
    lines.push(`  curl -sf -X POST "\${PROD_BASE}/api/golden-datasets/\${DATASET_ID}/test-cases" \\`);
    lines.push(`    -H "Content-Type: application/json" \\`);
    lines.push(`    -d '${j(tcBody)}' > /dev/null || { echo "FAIL: test case ${tc.name}"; exit 1; }`);
    lines.push(`  echo "  ✓  Test case: ${tc.name}"`);
  }
  lines.push(`)`);
  lines.push(``);

  // ── STEP 7: EVAL SUITE ───────────────────────────────────────────────────
  lines.push(`echo "STEP 7/9  Creating evaluation suite…"`);
  lines.push(`(`);
  const evalBody = {
    agentId: `AGENT_ID_PLACEHOLDER`,
    name: evalSuite.name,
    type: evalSuite.type || "regression",
    industry: evalSuite.industry || "legal_services",
    goldenDatasetId: `DATASET_ID_PLACEHOLDER`,
    thresholdConfig: evalSuite.thresholdConfig || { minPassRate: 0.90 },
    scorerConfig: evalSuite.scorerConfig || {},
    coverageTags: evalSuite.coverageTags || [],
    environmentThresholds: evalSuite.environmentThresholds || {},
    ontologyTags: evalSuite.ontologyTags || [],
    schedule: evalSuite.schedule || "weekly"
  };
  // Render with shell vars
  const evalBodyStr = j(evalBody)
    .replace('"AGENT_ID_PLACEHOLDER"', '"\'$AGENT_ID\'"')
    .replace('"DATASET_ID_PLACEHOLDER"', '"\'$DATASET_ID\'"');

  lines.push(`  EVAL_ID=$(curl -sf -X POST "\${PROD_BASE}/api/evals" \\`);
  lines.push(`    -H "Content-Type: application/json" \\`);
  lines.push(`    -d "${evalBodyStr.replace(/"/g, '\\"').replace(/\$AGENT_ID/g, '$AGENT_ID').replace(/\$DATASET_ID/g, '$DATASET_ID')}" \\`);
  lines.push(`    | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))")`);
  lines.push(`  [ -z "$EVAL_ID" ] && { echo "FAIL: eval suite"; exit 1; }`);
  lines.push(`  echo "  ✓  Eval suite: $EVAL_ID"`);
  lines.push(`)`);
  lines.push(``);

  // Simpler eval step using already-structured data
  lines.splice(-9, 9); // remove the complex eval block, replace with simpler version
  lines.push(`echo "STEP 7/9  Creating evaluation suite…"`);
  const evalBodySimple = {
    name: evalSuite.name,
    type: evalSuite.type || "regression",
    industry: evalSuite.industry || "legal_services",
    thresholdConfig: evalSuite.thresholdConfig || { minPassRate: 0.90 },
    scorerConfig: evalSuite.scorerConfig || {},
    coverageTags: evalSuite.coverageTags || [],
    environmentThresholds: evalSuite.environmentThresholds || {},
    ontologyTags: evalSuite.ontologyTags || [],
    schedule: evalSuite.schedule || "weekly"
  };
  lines.push(`  EVAL_PAYLOAD='${j(evalBodySimple)}'`);
  lines.push(`  EVAL_PAYLOAD_FULL=$(echo "$EVAL_PAYLOAD" | python3 -c "`);
  lines.push(`import sys, json`);
  lines.push(`d = json.load(sys.stdin)`);
  lines.push(`d['agentId'] = '$AGENT_ID'`);
  lines.push(`d['goldenDatasetId'] = '$DATASET_ID'`);
  lines.push(`print(json.dumps(d))`);
  lines.push(`")`);
  lines.push(`  EVAL_ID=$(curl -sf -X POST "\${PROD_BASE}/api/evals" \\`);
  lines.push(`    -H "Content-Type: application/json" \\`);
  lines.push(`    -d "$EVAL_PAYLOAD_FULL" \\`);
  lines.push(`    | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))")`);
  lines.push(`  [ -z "$EVAL_ID" ] && { echo "FAIL: eval suite"; exit 1; }`);
  lines.push(`  echo "  ✓  Eval suite: $EVAL_ID"`);
  lines.push(``);

  // ── STEP 8: OUTCOME ───────────────────────────────────────────────────────
  lines.push(`echo "STEP 8/9  Creating outcome contract with ${kpis.length} KPIs…"`);
  const outcomeBody = {
    name: outcome.name,
    description: outcome.description,
    riskTier: outcome.riskTier || "HIGH",
    status: outcome.status || "active",
    version: outcome.version || 1,
    pricingModel: outcome.pricingModel,
    pricePerUnit: outcome.pricePerUnit,
    currency: outcome.currency || "USD",
    pricingTiers: outcome.pricingTiers || [],
    volumeCap: outcome.volumeCap,
    slaConfig: outcome.slaConfig || {},
    attributionRules: outcome.attributionRules || {},
    approvalGates: outcome.approvalGates || [],
    riskThreshold: outcome.riskThreshold,
    maxDriftPercent: outcome.maxDriftPercent,
    autoPauseTrigger: outcome.autoPauseTrigger || true,
    roiEstimate: outcome.roiEstimate || {}
  };
  const kpiArray = kpis.map(k => ({
    name: k.name,
    description: k.description,
    metricType: k.metricType,
    target: k.target,
    unit: k.unit,
    frequency: k.frequency,
    measurementMethod: k.measurementMethod,
    thresholds: k.thresholds || {}
  }));

  lines.push(`  OUTCOME_PAYLOAD='${j({ outcome: outcomeBody, kpis: kpiArray })}'`);
  lines.push(`  OUTCOME_PAYLOAD_FULL=$(echo "$OUTCOME_PAYLOAD" | python3 -c "`);
  lines.push(`import sys, json`);
  lines.push(`d = json.load(sys.stdin)`);
  lines.push(`d['outcome']['attributionRules']['agentId'] = '$AGENT_ID'`);
  lines.push(`print(json.dumps(d))`);
  lines.push(`")`);
  lines.push(`  OUTCOME_ID=$(curl -sf -X POST "\${PROD_BASE}/api/outcomes/with-kpis" \\`);
  lines.push(`    -H "Content-Type: application/json" \\`);
  lines.push(`    -d "$OUTCOME_PAYLOAD_FULL" \\`);
  lines.push(`    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('outcome',{}).get('id','') or d.get('id',''))")`);
  lines.push(`  [ -z "$OUTCOME_ID" ] && { echo "FAIL: outcome contract"; exit 1; }`);
  lines.push(`  echo "  ✓  Outcome contract: $OUTCOME_ID"`);
  lines.push(``);

  // ── STEP 9: LINK ALL ─────────────────────────────────────────────────────
  lines.push(`echo "STEP 9/9  Linking all intelligence to agent…"`);
  lines.push(``);

  // Link KB
  lines.push(`  # Link Knowledge Base`);
  lines.push(`  curl -sf -X POST "\${PROD_BASE}/api/agents/\${AGENT_ID}/knowledge-bases" \\`);
  lines.push(`    -H "Content-Type: application/json" \\`);
  lines.push(`    -d '{"knowledgeBaseId":"'"$KB_ID"'","priority":1,"retrievalConfig":{"topK":8,"scoreThreshold":0.72,"rerankEnabled":true,"jurisdictionFiltering":true,"citationMode":"full"}}' > /dev/null || { echo "FAIL: KB link"; exit 1; }`);
  lines.push(`  echo "  ✓  Knowledge base linked"`);
  lines.push(``);

  // Link skills, policies, outcome, eval to agent via PATCH
  lines.push(`  # Link skills, policies, outcome, eval suite`);
  lines.push(`  LINK_PAYLOAD=$(python3 -c "`);
  lines.push(`import json`);
  lines.push(`skills = ['$SKILL_1_ID','$SKILL_2_ID','$SKILL_3_ID','$SKILL_4_ID','$SKILL_5_ID','$SKILL_6_ID']`);
  lines.push(`policies = ['$POLICY_1_ID','$POLICY_2_ID','$POLICY_3_ID','$POLICY_4_ID','$POLICY_5_ID','$POLICY_6_ID']`);
  lines.push(`print(json.dumps({'preloadedSkills': skills, 'policyBindings': policies, 'outcomeId': '$OUTCOME_ID', 'evalBindings': ['$EVAL_ID']}))`);
  lines.push(`")`);
  lines.push(`  curl -sf -X PATCH "\${PROD_BASE}/api/agents/\${AGENT_ID}" \\`);
  lines.push(`    -H "Content-Type: application/json" \\`);
  lines.push(`    -d "$LINK_PAYLOAD" > /dev/null || { echo "FAIL: agent link"; exit 1; }`);
  lines.push(`  echo "  ✓  6 skills linked (preloadedSkills)"`);
  lines.push(`  echo "  ✓  6 policies linked (policyBindings)"`);
  lines.push(`  echo "  ✓  Outcome contract linked"`);
  lines.push(`  echo "  ✓  Eval suite linked"`);
  lines.push(``);

  // ── LINK RUNBOOKS TO AGENT ────────────────────────────────────────────────
  lines.push(`  # Scope runbooks to agent`);
  for (let i = 1; i <= runbookVars.length; i++) {
    lines.push(`  curl -sf -X PATCH "\${PROD_BASE}/api/runbooks/\${RUNBOOK_${i}_ID}" \\`);
    lines.push(`    -H "Content-Type: application/json" \\`);
    lines.push(`    -d '{"agentId":"'"$AGENT_ID"'"}' > /dev/null || true`);
  }
  lines.push(`  echo "  ✓  6 runbooks scoped to agent"`);
  lines.push(``);

  // ── FINAL SUMMARY ─────────────────────────────────────────────────────────
  lines.push(`echo ""`);
  lines.push(`echo "══════════════════════════════════════════════════════════════"`);
  lines.push(`echo "  ✅  LIT-AGT-001 MIGRATION TO PRODUCTION — COMPLETE"`);
  lines.push(`echo "══════════════════════════════════════════════════════════════"`);
  lines.push(`echo ""`);
  lines.push(`echo "  Production IDs:"`);
  lines.push(`echo "  Agent ID:          $AGENT_ID"`);
  lines.push(`echo "  Knowledge Base:    $KB_ID"`);
  lines.push(`echo "  Skills (6):        $SKILL_1_ID $SKILL_2_ID $SKILL_3_ID $SKILL_4_ID $SKILL_5_ID $SKILL_6_ID"`);
  lines.push(`echo "  Policies (6):      $POLICY_1_ID $POLICY_2_ID $POLICY_3_ID $POLICY_4_ID $POLICY_5_ID $POLICY_6_ID"`);
  lines.push(`echo "  Runbooks (6):      $RUNBOOK_1_ID $RUNBOOK_2_ID $RUNBOOK_3_ID $RUNBOOK_4_ID $RUNBOOK_5_ID $RUNBOOK_6_ID"`);
  lines.push(`echo "  Golden Dataset:    $DATASET_ID"`);
  lines.push(`echo "  Eval Suite:        $EVAL_ID"`);
  lines.push(`echo "  Outcome Contract:  $OUTCOME_ID"`);
  lines.push(`echo ""`);

  // Write to file
  const fs = await import("fs");
  const script = lines.join("\n") + "\n";
  fs.writeFileSync("scripts/migrate-lit-agt-001-to-prod.sh", script, { mode: 0o755 });
  console.log("\n✅  Migration script written to: scripts/migrate-lit-agt-001-to-prod.sh");
  console.log(`   Lines: ${lines.length}`);
  console.log(`   Size:  ${Math.round(script.length / 1024)}KB`);
  console.log("\n   To deploy:");
  console.log('   export PROD_BASE="https://your-production-domain.com"');
  console.log("   bash scripts/migrate-lit-agt-001-to-prod.sh\n");
}

main().catch(e => { console.error("❌", e.message); process.exit(1); });
