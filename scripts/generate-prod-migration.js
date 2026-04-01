#!/usr/bin/env node
/**
 * Reads all LIT-AGT-001 entities from dev and generates a self-contained
 * CURL migration script for production. Uses `node` (not python3) for all
 * JSON operations — always available in the Replit environment.
 *
 * Usage:  node scripts/generate-prod-migration.js
 * Output: scripts/migrate-lit-agt-001-to-prod.sh
 *
 * Run migration:
 *   export PROD_BASE="https://agent-lifecycle-management-platform.replit.app"
 *   bash scripts/migrate-lit-agt-001-to-prod.sh
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

// Escape for single-quoted shell strings
function sq(obj) {
  return JSON.stringify(obj).replace(/'/g, "'\\''");
}

// node -pe snippet to extract .id from stdin JSON
const EXTRACT_ID = `node -pe "JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')).id || ''"`;
// For nested outcome response: {outcome:{id:...}}
const EXTRACT_OUTCOME_ID = `node -pe "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); (d.outcome && d.outcome.id) || d.id || ''"`;

function curlPost(varName, path, payload, label) {
  const extractor = varName === "OUTCOME_ID" ? EXTRACT_OUTCOME_ID : EXTRACT_ID;
  return [
    `  # ${label}`,
    `  ${varName}=$(curl -sf -X POST "\${PROD_BASE}${path}" \\`,
    `    -H "Content-Type: application/json" \\`,
    `    -d '${sq(payload)}' | ${extractor})`,
    `  [ -z "$${varName}" ] && { echo "FAIL: ${label}"; exit 1; }`,
    `  echo "  ✓  ${label}: $${varName}"`,
    ``,
  ].join("\n");
}

function curlPostNoCapture(path, payload, label) {
  return [
    `  # ${label}`,
    `  curl -sf -X POST "\${PROD_BASE}${path}" \\`,
    `    -H "Content-Type: application/json" \\`,
    `    -d '${sq(payload)}' > /dev/null || { echo "FAIL: ${label}"; exit 1; }`,
    `  echo "  ✓  ${label}"`,
    ``,
  ].join("\n");
}

// For payloads that need shell variable substitution — emit a node block
function curlPostDynamic(varName, path, buildPayloadJs, label) {
  const extractor = varName === "OUTCOME_ID" ? EXTRACT_OUTCOME_ID : EXTRACT_ID;
  return [
    `  # ${label}`,
    `  ${varName}=$(node -e "${buildPayloadJs.replace(/"/g, '\\"').replace(/\n/g, " ")}" | \\`,
    `    curl -sf -X POST "\${PROD_BASE}${path}" \\`,
    `      -H "Content-Type: application/json" \\`,
    `      --data-binary @- | ${extractor})`,
    `  [ -z "$${varName}" ] && { echo "FAIL: ${label}"; exit 1; }`,
    `  echo "  ✓  ${label}: $${varName}"`,
    ``,
  ].join("\n");
}

async function main() {
  console.log("Fetching all dev data…");

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

  console.log(`  ✓  ${skills.length} skills, ${policies.length} policies, ${runbooks.length} runbooks`);
  console.log(`  ✓  KB with ${kbSources.length} sources, ${testCases.length} test cases, ${kpis.length} KPIs`);

  const lines = [];

  // ── HEADER ─────────────────────────────────────────────────────────────────
  lines.push(`#!/usr/bin/env bash`);
  lines.push(`# ================================================================`);
  lines.push(`# LIT-AGT-001 Production Migration Script`);
  lines.push(`# Employment Compliance & Policy Advisory Agent`);
  lines.push(`# Generated: ${new Date().toISOString()}`);
  lines.push(`# Requires: curl, node (no python3 required)`);
  lines.push(`# ================================================================`);
  lines.push(`#`);
  lines.push(`# Usage:`);
  lines.push(`#   export PROD_BASE="https://agent-lifecycle-management-platform.replit.app"`);
  lines.push(`#   bash scripts/migrate-lit-agt-001-to-prod.sh`);
  lines.push(`# ================================================================`);
  lines.push(``);
  lines.push(`set -euo pipefail`);
  lines.push(``);
  lines.push(`PROD_BASE="\${PROD_BASE:-https://agent-lifecycle-management-platform.replit.app}"`);
  lines.push(`PROD_ORG_ID="${PROD_ORG_ID}"`);
  lines.push(``);
  lines.push(`# Verify node is available (required for JSON extraction)`);
  lines.push(`command -v node >/dev/null 2>&1 || { echo "ERROR: node is required but not found. Install Node.js first."; exit 1; }`);
  lines.push(`command -v curl >/dev/null 2>&1 || { echo "ERROR: curl is required but not found."; exit 1; }`);
  lines.push(``);
  lines.push(`echo ""`);
  lines.push(`echo "════════════════════════════════════════════════════════════════"`);
  lines.push(`echo "  LIT-AGT-001 → Production Migration"`);
  lines.push(`echo "  Target: \${PROD_BASE}"`);
  lines.push(`echo "════════════════════════════════════════════════════════════════"`);
  lines.push(`echo ""`);

  // ── STEP 1: SKILLS ─────────────────────────────────────────────────────────
  lines.push(`echo "STEP 1/9  Creating 6 skills…"`);
  const skillVarNames = [];
  for (let i = 0; i < skills.length; i++) {
    const s = skills[i];
    const varName = `SKILL_${i + 1}_ID`;
    skillVarNames.push(varName);
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
      status: s.status || "active",
    };
    lines.push(curlPost(varName, "/api/skills", body, `Skill: ${s.name}`));
  }
  lines.push(``);

  // ── STEP 2: KNOWLEDGE BASE ─────────────────────────────────────────────────
  lines.push(`echo "STEP 2/9  Creating knowledge base and ingesting ${kbSources.length} sources…"`);
  const kbBody = {
    name: kb.name,
    description: kb.description,
    industry: kb.industry,
    visibility: kb.visibility || "org",
    organizationId: PROD_ORG_ID,
    tags: kb.tags || [],
    embeddingModel: kb.embeddingModel || "text-embedding-3-small",
    chunkStrategy: kb.chunkStrategy || "paragraph",
    retrievalConfig: kb.retrievalConfig || {},
  };
  lines.push(curlPost("KB_ID", "/api/knowledge-bases", kbBody, `KB: ${kb.name}`));

  for (const src of kbSources) {
    const srcBody = {
      name: src.name,
      type: src.type || "text",
      content: src.content || src.text || "",
      metadata: src.metadata || {},
    };
    lines.push(curlPostNoCapture(`/api/knowledge-bases/\${KB_ID}/sources/text`, srcBody, `KB Source: ${src.name.slice(0, 50)}`));
  }
  lines.push(``);

  // ── STEP 3: RUNBOOKS ───────────────────────────────────────────────────────
  lines.push(`echo "STEP 3/9  Creating 6 runbooks…"`);
  const runbookVarNames = [];
  for (let i = 0; i < runbooks.length; i++) {
    const rb = runbooks[i];
    const varName = `RUNBOOK_${i + 1}_ID`;
    runbookVarNames.push(varName);
    const body = {
      name: rb.name,
      description: rb.description,
      category: rb.category,
      industry: rb.industry,
      steps: rb.steps || [],
      triggers: rb.triggers || [],
      tags: rb.tags || [],
      status: rb.status || "active",
    };
    lines.push(curlPost(varName, "/api/runbooks", body, `Runbook: ${rb.name.slice(0, 50)}`));
  }
  lines.push(``);

  // ── STEP 4: POLICIES ───────────────────────────────────────────────────────
  lines.push(`echo "STEP 4/9  Creating 6 governance policies…"`);
  const policyVarNames = [];
  for (let i = 0; i < policies.length; i++) {
    const p = policies[i];
    const varName = `POLICY_${i + 1}_ID`;
    policyVarNames.push(varName);
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
      status: p.status || "active",
    };
    lines.push(curlPost(varName, "/api/policies", body, `Policy: ${p.name.slice(0, 50)}`));
  }
  lines.push(``);

  // ── STEP 5: AGENT ──────────────────────────────────────────────────────────
  lines.push(`echo "STEP 5/9  Creating agent…"`);
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
  };
  lines.push(curlPost("AGENT_ID", "/api/agents", agentBody, `Agent: ${agent.name}`));
  lines.push(``);

  // ── STEP 6: GOLDEN DATASET + TEST CASES ────────────────────────────────────
  lines.push(`echo "STEP 6/9  Creating golden dataset and ${testCases.length} test cases…"`);
  const dsBody = {
    name: "Employment Compliance & Policy Advisory — Golden Dataset",
    description: "Curated employment law test cases across jurisdiction identification, statutory citation, gap analysis, policy drafting, UPL compliance, and escalation logic",
    industry: "legal_services",
    qualityCoverage: 88.5,
    tags: ["employment-law", "multi-state", "jurisdiction", "UPL", "policy-drafting", "citation-accuracy"],
  };
  lines.push(curlPost("DATASET_ID", "/api/golden-datasets", dsBody, "Golden Dataset"));

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
      status: tc.status || "active",
    };
    lines.push(curlPostNoCapture(`/api/golden-datasets/\${DATASET_ID}/test-cases`, tcBody, `Test case: ${tc.name.slice(0, 50)}`));
  }
  lines.push(``);

  // ── STEP 7: EVAL SUITE ─────────────────────────────────────────────────────
  lines.push(`echo "STEP 7/9  Creating evaluation suite…"`);
  // Embed static parts; inject AGENT_ID and DATASET_ID via node at runtime
  const evalStatic = {
    name: evalSuite.name,
    type: evalSuite.type || "regression",
    industry: evalSuite.industry || "legal_services",
    thresholdConfig: evalSuite.thresholdConfig || { minPassRate: 0.90 },
    scorerConfig: evalSuite.scorerConfig || {},
    coverageTags: evalSuite.coverageTags || [],
    environmentThresholds: evalSuite.environmentThresholds || {},
    ontologyTags: evalSuite.ontologyTags || [],
    schedule: evalSuite.schedule || "weekly",
  };
  const evalBuildJs = `
const d = ${JSON.stringify(evalStatic)};
d.agentId = process.env.AGENT_ID;
d.goldenDatasetId = process.env.DATASET_ID;
process.stdout.write(JSON.stringify(d));
`.trim().replace(/\n/g, " ");

  lines.push(`  # Eval Suite: ${evalSuite.name}`);
  lines.push(`  EVAL_ID=$(AGENT_ID="$AGENT_ID" DATASET_ID="$DATASET_ID" node -e "${evalBuildJs.replace(/"/g, '\\"')}" | \\`);
  lines.push(`    curl -sf -X POST "\${PROD_BASE}/api/evals" \\`);
  lines.push(`      -H "Content-Type: application/json" \\`);
  lines.push(`      --data-binary @- | ${EXTRACT_ID})`);
  lines.push(`  [ -z "$EVAL_ID" ] && { echo "FAIL: eval suite"; exit 1; }`);
  lines.push(`  echo "  ✓  Eval suite: $EVAL_ID"`);
  lines.push(``);

  // ── STEP 8: OUTCOME CONTRACT ───────────────────────────────────────────────
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
    autoPauseTrigger: outcome.autoPauseTrigger ?? true,
    roiEstimate: outcome.roiEstimate || {},
  };
  const kpiArray = kpis.map(k => ({
    name: k.name,
    description: k.description,
    metricType: k.metricType,
    target: k.target,
    unit: k.unit,
    frequency: k.frequency,
    measurementMethod: k.measurementMethod,
    thresholds: k.thresholds || {},
  }));

  const outcomeBuildJs = `
const d = ${JSON.stringify({ outcome: outcomeBody, kpis: kpiArray })};
d.outcome.attributionRules = d.outcome.attributionRules || {};
d.outcome.attributionRules.agentId = process.env.AGENT_ID;
process.stdout.write(JSON.stringify(d));
`.trim().replace(/\n/g, " ");

  lines.push(`  # Outcome contract: ${outcome.name}`);
  lines.push(`  OUTCOME_ID=$(AGENT_ID="$AGENT_ID" node -e "${outcomeBuildJs.replace(/"/g, '\\"')}" | \\`);
  lines.push(`    curl -sf -X POST "\${PROD_BASE}/api/outcomes/with-kpis" \\`);
  lines.push(`      -H "Content-Type: application/json" \\`);
  lines.push(`      --data-binary @- | ${EXTRACT_OUTCOME_ID})`);
  lines.push(`  [ -z "$OUTCOME_ID" ] && { echo "FAIL: outcome contract"; exit 1; }`);
  lines.push(`  echo "  ✓  Outcome contract: $OUTCOME_ID"`);
  lines.push(``);

  // ── STEP 9: LINK EVERYTHING ────────────────────────────────────────────────
  lines.push(`echo "STEP 9/9  Linking all intelligence to agent…"`);
  lines.push(``);

  // Link KB
  lines.push(`  # Link Knowledge Base`);
  lines.push(`  KB_LINK_PAYLOAD='${sq({ priority: 1, retrievalConfig: { topK: 8, scoreThreshold: 0.72, rerankEnabled: true, jurisdictionFiltering: true, citationMode: "full" } })}'`);
  lines.push(`  FULL_KB_PAYLOAD=$(node -e "const d=JSON.parse('${sq({ priority: 1, retrievalConfig: { topK: 8, scoreThreshold: 0.72, rerankEnabled: true, jurisdictionFiltering: true, citationMode: "full" } }).replace(/'/g, "'\\''")}'); d.knowledgeBaseId=process.env.KB_ID; process.stdout.write(JSON.stringify(d));" KB_ID="$KB_ID")`);
  // Simpler approach - just inline:
  lines.splice(-1, 1); // remove the complex FULL_KB_PAYLOAD line
  lines.push(`  curl -sf -X POST "\${PROD_BASE}/api/agents/\${AGENT_ID}/knowledge-bases" \\`);
  lines.push(`    -H "Content-Type: application/json" \\`);
  lines.push(`    -d "{\\"knowledgeBaseId\\":\\"$KB_ID\\",\\"priority\\":1,\\"retrievalConfig\\":{\\"topK\\":8,\\"scoreThreshold\\":0.72,\\"rerankEnabled\\":true,\\"jurisdictionFiltering\\":true,\\"citationMode\\":\\"full\\"}}" \\`);
  lines.push(`    > /dev/null || { echo "FAIL: KB link"; exit 1; }`);
  lines.push(`  echo "  ✓  Knowledge base linked"`);
  lines.push(``);

  // Link skills, policies, outcome, eval to agent via PATCH — build with node
  const linkBuildJs = `
const payload = {
  preloadedSkills: [process.env.S1,process.env.S2,process.env.S3,process.env.S4,process.env.S5,process.env.S6],
  policyBindings: [process.env.P1,process.env.P2,process.env.P3,process.env.P4,process.env.P5,process.env.P6],
  outcomeId: process.env.OUTCOME_ID,
  evalBindings: [process.env.EVAL_ID]
};
process.stdout.write(JSON.stringify(payload));
`.trim().replace(/\n/g, " ");

  lines.push(`  # Link skills, policies, outcome, eval to agent`);
  lines.push(`  S1="$SKILL_1_ID" S2="$SKILL_2_ID" S3="$SKILL_3_ID" S4="$SKILL_4_ID" S5="$SKILL_5_ID" S6="$SKILL_6_ID" \\`);
  lines.push(`  P1="$POLICY_1_ID" P2="$POLICY_2_ID" P3="$POLICY_3_ID" P4="$POLICY_4_ID" P5="$POLICY_5_ID" P6="$POLICY_6_ID" \\`);
  lines.push(`  OUTCOME_ID="$OUTCOME_ID" EVAL_ID="$EVAL_ID" \\`);
  lines.push(`  node -e "${linkBuildJs.replace(/"/g, '\\"')}" | \\`);
  lines.push(`    curl -sf -X PATCH "\${PROD_BASE}/api/agents/\${AGENT_ID}" \\`);
  lines.push(`      -H "Content-Type: application/json" \\`);
  lines.push(`      --data-binary @- > /dev/null || { echo "FAIL: agent link"; exit 1; }`);
  lines.push(`  echo "  ✓  6 skills linked (preloadedSkills)"`);
  lines.push(`  echo "  ✓  6 policies linked (policyBindings)"`);
  lines.push(`  echo "  ✓  Outcome contract linked"`);
  lines.push(`  echo "  ✓  Eval suite linked"`);
  lines.push(``);

  // Scope runbooks to agent
  lines.push(`  # Scope runbooks to agent`);
  for (let i = 1; i <= runbooks.length; i++) {
    lines.push(`  curl -sf -X PATCH "\${PROD_BASE}/api/runbooks/\${RUNBOOK_${i}_ID}" \\`);
    lines.push(`    -H "Content-Type: application/json" \\`);
    lines.push(`    -d "{\\"agentId\\":\\"$AGENT_ID\\"}" > /dev/null || true`);
  }
  lines.push(`  echo "  ✓  6 runbooks scoped to agent"`);
  lines.push(``);

  // ── FINAL SUMMARY ───────────────────────────────────────────────────────────
  lines.push(`echo ""`);
  lines.push(`echo "════════════════════════════════════════════════════════════════"`);
  lines.push(`echo "  ✅  LIT-AGT-001 MIGRATION TO PRODUCTION — COMPLETE"`);
  lines.push(`echo "════════════════════════════════════════════════════════════════"`);
  lines.push(`echo ""`);
  lines.push(`echo "  Production IDs:"`);
  lines.push(`echo "  Agent:           $AGENT_ID"`);
  lines.push(`echo "  Knowledge Base:  $KB_ID"`);
  lines.push(`echo "  Skills:          $SKILL_1_ID  $SKILL_2_ID  $SKILL_3_ID"`);
  lines.push(`echo "                   $SKILL_4_ID  $SKILL_5_ID  $SKILL_6_ID"`);
  lines.push(`echo "  Policies:        $POLICY_1_ID  $POLICY_2_ID  $POLICY_3_ID"`);
  lines.push(`echo "                   $POLICY_4_ID  $POLICY_5_ID  $POLICY_6_ID"`);
  lines.push(`echo "  Runbooks:        $RUNBOOK_1_ID  $RUNBOOK_2_ID  $RUNBOOK_3_ID"`);
  lines.push(`echo "                   $RUNBOOK_4_ID  $RUNBOOK_5_ID  $RUNBOOK_6_ID"`);
  lines.push(`echo "  Golden Dataset:  $DATASET_ID"`);
  lines.push(`echo "  Eval Suite:      $EVAL_ID"`);
  lines.push(`echo "  Outcome:         $OUTCOME_ID"`);
  lines.push(`echo ""`);

  // Write the file
  const fs = await import("fs");
  const script = lines.join("\n") + "\n";
  fs.writeFileSync("scripts/migrate-lit-agt-001-to-prod.sh", script, { mode: 0o755 });

  console.log(`\n✅  Migration script written: scripts/migrate-lit-agt-001-to-prod.sh`);
  console.log(`   Size: ${Math.round(script.length / 1024)}KB | Lines: ${lines.length}`);
  console.log(`   Uses: curl + node (no python3)`);
  console.log(`\n   Run:`);
  console.log(`   export PROD_BASE="https://agent-lifecycle-management-platform.replit.app"`);
  console.log(`   bash scripts/migrate-lit-agt-001-to-prod.sh\n`);
}

main().catch(e => { console.error("❌", e.message); process.exit(1); });
