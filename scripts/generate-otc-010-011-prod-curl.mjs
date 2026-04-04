/**
 * generate-otc-010-011-prod-curl.js
 * Fetches OTC-AGT-010 and OTC-AGT-011 components from the dev environment,
 * then generates a self-contained bash script to recreate them on prod.
 *
 * Usage:
 *   node scripts/generate-otc-010-011-prod-curl.js \
 *     <DEV_BASE_URL> <PROD_BASE_URL> [PROD_ORG_ID] [PROD_API_TOKEN]
 *
 * Example:
 *   node scripts/generate-otc-010-011-prod-curl.js \
 *     http://localhost:5000 \
 *     https://agent-lifecycle-management-platform.replit.app \
 *     cf5754b1-ee80-4b51-8bf6-7be263c97527
 *
 * Output: scripts/otc-010-011-prod-migration.sh
 */

const DEV_URL      = process.argv[2] || "http://localhost:5000";
const PROD_URL     = process.argv[3] || "https://agent-lifecycle-management-platform.replit.app";
const PROD_ORG_ID  = process.argv[4] || "cf5754b1-ee80-4b51-8bf6-7be263c97527";
const PROD_TOKEN   = process.argv[5] || "";

const DEV_ORG_ID   = "0c9bcf16-cdd9-45e2-87f6-6a839a7f7056";
const RETURNS_AGT  = "d9a2e568-7a29-4376-a7fd-3580a2c012b0";
const CONTRACT_AGT = "ffcce490-9c78-4130-a128-ded11a1b2d19";

const fs = await import("fs");

// ── Dev API helpers ──────────────────────────────────────────────────────────
async function devGet(path) {
  const res = await fetch(`${DEV_URL}${path}`, {
    headers: { "x-organization-id": DEV_ORG_ID },
  });
  if (!res.ok) throw new Error(`DEV GET ${path} → ${res.status}`);
  return res.json();
}

// ── Bash script helpers ──────────────────────────────────────────────────────
const AUTH = PROD_TOKEN ? `-H "Authorization: ${PROD_TOKEN}"` : `-H "x-organization-id: ${PROD_ORG_ID}"`;

function curlPost(path, bodyExpr) {
  return `curl -fsS -X POST "${PROD_URL}${path}" \\
  -H "Content-Type: application/json" \\
  ${AUTH} \\
  -d "${bodyExpr}"`;
}

function esc(obj) {
  // Produce a jq-safe JSON string for embedding in bash heredoc/single-line
  return JSON.stringify(JSON.stringify(obj));
}

function bashVar(varName, curlCmd, field = ".id") {
  return `${varName}=$(${curlCmd} | jq -r '${field}')
echo "  ${varName}: $${varName}"`;
}

// ── Fetch dev data ───────────────────────────────────────────────────────────
console.log("Fetching OTC-AGT-010 and OTC-AGT-011 data from dev...");

const [returnsAgent, contractAgent] = await Promise.all([
  devGet(`/api/agents/${RETURNS_AGT}`),
  devGet(`/api/agents/${CONTRACT_AGT}`),
]);

// Fetch all runbooks then filter client-side (API doesn't filter by agentId)
const allRunbooksRaw = await devGet("/api/runbooks?limit=500");
const allRunbooks = Array.isArray(allRunbooksRaw) ? allRunbooksRaw : allRunbooksRaw.runbooks || [];
const returnsRunbooksArr  = allRunbooks.filter(r => r.agentId === RETURNS_AGT);
const contractRunbooksArr = allRunbooks.filter(r => r.agentId === CONTRACT_AGT);

// Fetch policies by scopeId (agentId) — filter client-side
const allPolicies = await devGet("/api/policies?limit=500");
const returnsPolicies  = (Array.isArray(allPolicies) ? allPolicies : allPolicies.policies || [])
  .filter(p => p.scopeId === RETURNS_AGT);
const contractPolicies = (Array.isArray(allPolicies) ? allPolicies : allPolicies.policies || [])
  .filter(p => p.scopeId === CONTRACT_AGT);

// Fetch golden test cases
const ids = JSON.parse(fs.readFileSync("./scripts/otc-agt-010-011-dev-ids.json", "utf8"));
const [returnsDataset, returnsTestCases, contractDataset, contractTestCases] = await Promise.all([
  devGet(`/api/golden-datasets/${ids.returnsAgent.evalDatasetId}`),
  devGet(`/api/golden-datasets/${ids.returnsAgent.evalDatasetId}/test-cases`),
  devGet(`/api/golden-datasets/${ids.contractAgent.evalDatasetId}`),
  devGet(`/api/golden-datasets/${ids.contractAgent.evalDatasetId}/test-cases`),
]);

// Fetch eval suites
const allEvals = await devGet("/api/evals?limit=200");
const returnsSuite  = (Array.isArray(allEvals) ? allEvals : allEvals.evals || [])
  .find(e => e.id === ids.returnsAgent.evalSuiteId);
const contractSuite = (Array.isArray(allEvals) ? allEvals : allEvals.evals || [])
  .find(e => e.id === ids.contractAgent.evalSuiteId);

console.log(`  OTC-AGT-010: ${returnsAgent.name}`);
console.log(`    Skills: ${returnsAgent.preloadedSkills?.length || 0}`);
console.log(`    Runbooks: ${returnsRunbooksArr.length}`);
console.log(`    Policies: ${returnsPolicies.length}`);
const rTestCasesArr = Array.isArray(returnsTestCases) ? returnsTestCases : returnsTestCases?.testCases || [];
const cTestCasesArr = Array.isArray(contractTestCases) ? contractTestCases : contractTestCases?.testCases || [];
console.log(`    Test cases: ${rTestCasesArr.length}`);
console.log(`  OTC-AGT-011: ${contractAgent.name}`);
console.log(`    Skills: ${contractAgent.preloadedSkills?.length || 0}`);
console.log(`    Runbooks: ${contractRunbooksArr.length}`);
console.log(`    Policies: ${contractPolicies.length}`);
console.log(`    Test cases: ${cTestCasesArr.length}`);

// Aliases for cleaner code below
const rRunbooks   = returnsRunbooksArr;
const cRunbooks   = contractRunbooksArr;
const rTestCases  = rTestCasesArr;
const cTestCases  = cTestCasesArr;

// ── Skill payloads from agent's preloadedSkills (fetch each skill) ───────────
console.log("\nFetching individual skill definitions...");
// preloadedSkills is [{skillId, loadOrder}] — extract the IDs
const rSkillIds = (returnsAgent.preloadedSkills || []).map(s => s.skillId || s);
const cSkillIds = (contractAgent.preloadedSkills || []).map(s => s.skillId || s);
const skillIds  = [...rSkillIds, ...cSkillIds];
const skills    = await Promise.all(skillIds.map(id => devGet(`/api/skills/${id}`)));
const returnsSkills  = skills.slice(0, (returnsAgent.preloadedSkills || []).length);
const contractSkills = skills.slice((returnsAgent.preloadedSkills || []).length);
console.log(`  Fetched ${skills.length} skills`);

// ── Build bash script ────────────────────────────────────────────────────────
console.log("\nGenerating prod migration bash script...");

function skillPayload(s) {
  return {
    name: s.name,
    description: s.description,
    industry: s.industry || "enterprise",
    domain: s.domain || "Order-to-Cash",
    version: s.version || "1.0.0",
    author: s.author || "ATLAS Platform Team",
    trustTier: s.trustTier || "platform-provided",
    complexity: s.complexity || "intermediate",
    status: "active",
    tags: s.tags || [],
    agentTypeCompatibility: s.agentTypeCompatibility || ["single", "team"],
    markdownBody: s.markdownBody || s.content || "",
    allowedTools: s.allowedTools || [],
    contextMode: s.contextMode || "inline",
    userInvocable: s.userInvocable || false,
  };
}

function runbookPayload(r, agentIdVar) {
  return {
    name: r.name,
    description: r.description || "",
    trigger: r.trigger || "manual",
    triggerConditions: r.triggerConditions || [],
    steps: r.steps || [],
    expectedOutcome: r.expectedOutcome || "",
    rollbackProcedure: r.rollbackProcedure || null,
    escalationMatrix: r.escalationMatrix || {},
    tags: r.tags || [],
    status: r.status || "active",
    version: r.version || "1.0",
    industry: r.industry || "enterprise",
    domain: r.domain || "Order-to-Cash",
    _agentIdVar: agentIdVar,
  };
}

function policyPayload(p, agentIdVar) {
  return {
    name: p.name,
    description: p.description || "",
    policyType: p.policyType || "operational",
    severity: p.severity || "high",
    enforcementMode: p.enforcementMode || "block",
    conditions: p.conditions || [],
    actions: p.actions || [],
    exceptions: p.exceptions || [],
    regulatoryBasis: p.regulatoryBasis || [],
    tags: p.tags || [],
    status: p.status || "active",
    industry: p.industry || "enterprise",
    domain: p.domain || "Order-to-Cash",
    version: p.version || "1.0",
    _agentIdVar: agentIdVar,
  };
}

// ── Construct the bash file ──────────────────────────────────────────────────
const lines = [];
lines.push(`#!/usr/bin/env bash`);
lines.push(`# ============================================================`);
lines.push(`# OTC-AGT-010 & OTC-AGT-011 Production Migration Script`);
lines.push(`# Generated: ${new Date().toISOString()}`);
lines.push(`# Target:    ${PROD_URL}`);
lines.push(`# Org:       ${PROD_ORG_ID}`);
lines.push(`# ============================================================`);
lines.push(`set -euo pipefail`);
lines.push(`command -v jq >/dev/null 2>&1 || { echo "ERROR: jq is required"; exit 1; }`);
lines.push(`echo ""`);
lines.push(`echo "OTC-AGT-010 & OTC-AGT-011 Production Migration"`);
lines.push(`echo "Target: ${PROD_URL}"`);
lines.push(`echo ""`);
lines.push(``);

function addSection(title) {
  lines.push(`echo ""`);
  lines.push(`echo "== ${title} =="`);
}

// ── Phase 1: OTC-AGT-010 Skills ──────────────────────────────────────────────
addSection("Phase 1: Creating OTC-AGT-010 Returns & Refund Processing Skills");
returnsSkills.forEach((s, i) => {
  const varName = `RETURNS_SKILL_${i + 1}_ID`;
  lines.push(`echo "  Creating skill: ${s.name}"`);
  const payload = skillPayload(s);
  lines.push(bashVar(varName,
    curlPost("/api/skills", `$(echo ${esc(payload)} | jq -c .)`)));
});
lines.push(``);

// ── Phase 2: OTC-AGT-011 Skills ──────────────────────────────────────────────
addSection("Phase 2: Creating OTC-AGT-011 Contract & Pricing Compliance Skills");
contractSkills.forEach((s, i) => {
  const varName = `CONTRACT_SKILL_${i + 1}_ID`;
  lines.push(`echo "  Creating skill: ${s.name}"`);
  const payload = skillPayload(s);
  lines.push(bashVar(varName,
    curlPost("/api/skills", `$(echo ${esc(payload)} | jq -c .)`)));
});
lines.push(``);

// ── Phase 3a: OTC-AGT-010 Agent ──────────────────────────────────────────────
addSection("Phase 3a: Creating OTC-AGT-010 Returns & Refund Processing Agent");
{
  const rSkillVars = returnsSkills.map((_, i) => `$RETURNS_SKILL_${i + 1}_ID`).join('","');
  const agentBase = {
    name: returnsAgent.name,
    agentCode: "OTC-AGT-010",
    description: returnsAgent.description,
    systemPrompt: returnsAgent.systemPrompt,
    department: returnsAgent.department || "Finance",
    riskTier: returnsAgent.riskTier || "HIGH",
    autonomyMode: returnsAgent.autonomyMode || "supervised",
    modelProvider: returnsAgent.modelProvider || "anthropic",
    modelName: returnsAgent.modelName || "claude-opus-4-5",
    status: "active",
    runtimeConfig: returnsAgent.runtimeConfig || {},
  };
  // Build bash command with dynamic skill IDs
  lines.push(`echo "  Creating agent: ${agentBase.name}"`);
  lines.push(`RETURNS_AGENT_PAYLOAD=$(echo ${esc(agentBase)} | jq -c \\`);
  lines.push(`  --arg s1 "$RETURNS_SKILL_1_ID" --arg s2 "$RETURNS_SKILL_2_ID" \\`);
  lines.push(`  --arg s3 "$RETURNS_SKILL_3_ID" --arg s4 "$RETURNS_SKILL_4_ID" \\`);
  lines.push(`  --arg s5 "$RETURNS_SKILL_5_ID" --arg s6 "$RETURNS_SKILL_6_ID" \\`);
  lines.push(`  '. + {preloadedSkills: [$s1,$s2,$s3,$s4,$s5,$s6]}')`);
  lines.push(bashVar("RETURNS_AGENT_ID",
    curlPost("/api/agents", `$RETURNS_AGENT_PAYLOAD`)));
}
lines.push(``);

// ── Phase 3b: OTC-AGT-011 Agent ──────────────────────────────────────────────
addSection("Phase 3b: Creating OTC-AGT-011 Contract & Pricing Compliance Agent");
{
  const agentBase = {
    name: contractAgent.name,
    agentCode: "OTC-AGT-011",
    description: contractAgent.description,
    systemPrompt: contractAgent.systemPrompt,
    department: contractAgent.department || "Finance",
    riskTier: contractAgent.riskTier || "HIGH",
    autonomyMode: contractAgent.autonomyMode || "supervised",
    modelProvider: contractAgent.modelProvider || "anthropic",
    modelName: contractAgent.modelName || "claude-opus-4-5",
    status: "active",
    runtimeConfig: contractAgent.runtimeConfig || {},
  };
  lines.push(`echo "  Creating agent: ${agentBase.name}"`);
  lines.push(`CONTRACT_AGENT_PAYLOAD=$(echo ${esc(agentBase)} | jq -c \\`);
  lines.push(`  --arg s1 "$CONTRACT_SKILL_1_ID" --arg s2 "$CONTRACT_SKILL_2_ID" \\`);
  lines.push(`  --arg s3 "$CONTRACT_SKILL_3_ID" --arg s4 "$CONTRACT_SKILL_4_ID" \\`);
  lines.push(`  --arg s5 "$CONTRACT_SKILL_5_ID" --arg s6 "$CONTRACT_SKILL_6_ID" \\`);
  lines.push(`  '. + {preloadedSkills: [$s1,$s2,$s3,$s4,$s5,$s6]}')`);
  lines.push(bashVar("CONTRACT_AGENT_ID",
    curlPost("/api/agents", `$CONTRACT_AGENT_PAYLOAD`)));
}
lines.push(``);

// ── Phase 4a: OTC-AGT-010 Runbooks ───────────────────────────────────────────
addSection("Phase 4a: Creating OTC-AGT-010 Returns Runbooks");
rRunbooks.forEach((r, i) => {
  const varName = `RETURNS_RUNBOOK_${i + 1}_ID`;
  lines.push(`echo "  Creating runbook: ${r.name}"`);
  const payload = {
    name: r.name,
    description: r.description || "",
    trigger: r.trigger || "manual",
    triggerConditions: r.triggerConditions || [],
    steps: r.steps || [],
    expectedOutcome: r.expectedOutcome || "",
    rollbackProcedure: r.rollbackProcedure || null,
    escalationMatrix: r.escalationMatrix || {},
    tags: r.tags || [],
    status: r.status || "active",
    version: r.version || "1.0",
    industry: r.industry || "enterprise",
    domain: r.domain || "Order-to-Cash",
  };
  lines.push(`RETURNS_RB_${i + 1}_PAYLOAD=$(echo ${esc(payload)} | jq -c \\`);
  lines.push(`  --arg aid "$RETURNS_AGENT_ID" '. + {agentId: $aid}')`);
  lines.push(bashVar(varName, curlPost("/api/runbooks", `$RETURNS_RB_${i + 1}_PAYLOAD`)));
});
lines.push(``);

// ── Phase 4b: OTC-AGT-011 Runbooks ───────────────────────────────────────────
addSection("Phase 4b: Creating OTC-AGT-011 Contract & Pricing Compliance Runbooks");
cRunbooks.forEach((r, i) => {
  const varName = `CONTRACT_RUNBOOK_${i + 1}_ID`;
  lines.push(`echo "  Creating runbook: ${r.name}"`);
  const payload = {
    name: r.name,
    description: r.description || "",
    trigger: r.trigger || "manual",
    triggerConditions: r.triggerConditions || [],
    steps: r.steps || [],
    expectedOutcome: r.expectedOutcome || "",
    rollbackProcedure: r.rollbackProcedure || null,
    escalationMatrix: r.escalationMatrix || {},
    tags: r.tags || [],
    status: r.status || "active",
    version: r.version || "1.0",
    industry: r.industry || "enterprise",
    domain: r.domain || "Order-to-Cash",
  };
  lines.push(`CONTRACT_RB_${i + 1}_PAYLOAD=$(echo ${esc(payload)} | jq -c \\`);
  lines.push(`  --arg aid "$CONTRACT_AGENT_ID" '. + {agentId: $aid}')`);
  lines.push(bashVar(varName, curlPost("/api/runbooks", `$CONTRACT_RB_${i + 1}_PAYLOAD`)));
});
lines.push(``);

// ── Phase 5a: OTC-AGT-010 Policies ───────────────────────────────────────────
addSection("Phase 5a: Creating OTC-AGT-010 Returns Policies");
returnsPolicies.forEach((p, i) => {
  const varName = `RETURNS_POLICY_${i + 1}_ID`;
  lines.push(`echo "  Creating policy: ${p.name}"`);
  const payload = {
    name: p.name,
    description: p.description || "",
    policyType: p.policyType || "operational",
    severity: p.severity || "high",
    enforcementMode: p.enforcementMode || "block",
    conditions: p.conditions || [],
    actions: p.actions || [],
    exceptions: p.exceptions || [],
    regulatoryBasis: p.regulatoryBasis || [],
    tags: p.tags || [],
    status: p.status || "active",
    industry: p.industry || "enterprise",
    domain: p.domain || "Order-to-Cash",
    version: p.version || "1.0",
  };
  lines.push(`RETURNS_POL_${i + 1}_PAYLOAD=$(echo ${esc(payload)} | jq -c \\`);
  lines.push(`  --arg aid "$RETURNS_AGENT_ID" '. + {scopeId: $aid, scopeType: "agent"}')`);
  lines.push(bashVar(varName, curlPost("/api/policies", `$RETURNS_POL_${i + 1}_PAYLOAD`)));
});
lines.push(``);

// ── Phase 5b: OTC-AGT-011 Policies ───────────────────────────────────────────
addSection("Phase 5b: Creating OTC-AGT-011 Contract & Pricing Compliance Policies");
contractPolicies.forEach((p, i) => {
  const varName = `CONTRACT_POLICY_${i + 1}_ID`;
  lines.push(`echo "  Creating policy: ${p.name}"`);
  const payload = {
    name: p.name,
    description: p.description || "",
    policyType: p.policyType || "operational",
    severity: p.severity || "high",
    enforcementMode: p.enforcementMode || "block",
    conditions: p.conditions || [],
    actions: p.actions || [],
    exceptions: p.exceptions || [],
    regulatoryBasis: p.regulatoryBasis || [],
    tags: p.tags || [],
    status: p.status || "active",
    industry: p.industry || "enterprise",
    domain: p.domain || "Order-to-Cash",
    version: p.version || "1.0",
  };
  lines.push(`CONTRACT_POL_${i + 1}_PAYLOAD=$(echo ${esc(payload)} | jq -c \\`);
  lines.push(`  --arg aid "$CONTRACT_AGENT_ID" '. + {scopeId: $aid, scopeType: "agent"}')`);
  lines.push(bashVar(varName, curlPost("/api/policies", `$CONTRACT_POL_${i + 1}_PAYLOAD`)));
});
lines.push(``);

// ── Phase 6a: OTC-AGT-010 Eval Dataset + Suite ───────────────────────────────
addSection("Phase 6a: Creating OTC-AGT-010 Eval Dataset & Suite");
{
  const dsPayload = {
    name: returnsDataset.name,
    description: returnsDataset.description || "",
    industry: returnsDataset.industry || "enterprise",
    useCase: returnsDataset.useCase || "",
    version: returnsDataset.version || "1.0",
    status: "active",
    tags: returnsDataset.tags || [],
    scenarioCategories: returnsDataset.scenarioCategories || {},
    coverageDimensions: returnsDataset.coverageDimensions || [],
    qualityCoverage: returnsDataset.qualityCoverage || 0,
    performanceBenchmarks: returnsDataset.performanceBenchmarks || [],
  };
  lines.push(`echo "  Creating OTC-AGT-010 eval dataset..."`);
  lines.push(bashVar("RETURNS_DATASET_ID",
    curlPost("/api/golden-datasets", `$(echo ${esc(dsPayload)} | jq -c .)`)));

  rTestCases.forEach((tc, i) => {
    const tcPayload = {
      name: tc.name,
      inputScenario: tc.inputScenario,
      expectedBehavior: tc.expectedBehavior,
      evaluationCriteria: tc.evaluationCriteria || [],
      difficultyTier: tc.difficultyTier || "routine",
      scenarioCategory: tc.scenarioCategory || "happy_path",
      tags: tc.tags || [],
      status: tc.status || "active",
    };
    lines.push(`echo "  Adding test case ${i + 1}: ${tc.name.substring(0, 50)}..."`);
    lines.push(`curl -fsS -X POST "${PROD_URL}/api/golden-datasets/$RETURNS_DATASET_ID/test-cases" \\
  -H "Content-Type: application/json" \\
  ${AUTH} \\
  -d "$(echo ${esc(tcPayload)} | jq -c .)" > /dev/null`);
  });

  const suitePayload = {
    name: returnsSuite?.name || "OTC-AGT-010 Returns & Refund Processing Core Regression Suite",
    type: returnsSuite?.type || "regression",
    industry: returnsSuite?.industry || "enterprise",
    totalCases: rTestCases.length,
    passRate: 0,
    thresholdConfig: returnsSuite?.thresholdConfig || { minPassRate: 0.95 },
    coverageTags: returnsSuite?.coverageTags || [],
    ontologyTags: returnsSuite?.ontologyTags || [],
  };
  lines.push(`echo "  Creating OTC-AGT-010 eval suite..."`);
  lines.push(`RETURNS_SUITE_PAYLOAD=$(echo ${esc(suitePayload)} | jq -c \\`);
  lines.push(`  --arg aid "$RETURNS_AGENT_ID" --arg did "$RETURNS_DATASET_ID" \\`);
  lines.push(`  '. + {agentId: $aid, goldenDatasetId: $did}')`);
  lines.push(bashVar("RETURNS_SUITE_ID", curlPost("/api/evals", `$RETURNS_SUITE_PAYLOAD`)));
}
lines.push(``);

// ── Phase 6b: OTC-AGT-011 Eval Dataset + Suite ───────────────────────────────
addSection("Phase 6b: Creating OTC-AGT-011 Eval Dataset & Suite");
{
  const dsPayload = {
    name: contractDataset.name,
    description: contractDataset.description || "",
    industry: contractDataset.industry || "enterprise",
    useCase: contractDataset.useCase || "",
    version: contractDataset.version || "1.0",
    status: "active",
    tags: contractDataset.tags || [],
    scenarioCategories: contractDataset.scenarioCategories || {},
    coverageDimensions: contractDataset.coverageDimensions || [],
    qualityCoverage: contractDataset.qualityCoverage || 0,
    performanceBenchmarks: contractDataset.performanceBenchmarks || [],
  };
  lines.push(`echo "  Creating OTC-AGT-011 eval dataset..."`);
  lines.push(bashVar("CONTRACT_DATASET_ID",
    curlPost("/api/golden-datasets", `$(echo ${esc(dsPayload)} | jq -c .)`)));

  cTestCases.forEach((tc, i) => {
    const tcPayload = {
      name: tc.name,
      inputScenario: tc.inputScenario,
      expectedBehavior: tc.expectedBehavior,
      evaluationCriteria: tc.evaluationCriteria || [],
      difficultyTier: tc.difficultyTier || "routine",
      scenarioCategory: tc.scenarioCategory || "happy_path",
      tags: tc.tags || [],
      status: tc.status || "active",
    };
    lines.push(`echo "  Adding test case ${i + 1}: ${tc.name.substring(0, 50)}..."`);
    lines.push(`curl -fsS -X POST "${PROD_URL}/api/golden-datasets/$CONTRACT_DATASET_ID/test-cases" \\
  -H "Content-Type: application/json" \\
  ${AUTH} \\
  -d "$(echo ${esc(tcPayload)} | jq -c .)" > /dev/null`);
  });

  const suitePayload = {
    name: contractSuite?.name || "OTC-AGT-011 Contract & Pricing Compliance Core Regression Suite",
    type: contractSuite?.type || "regression",
    industry: contractSuite?.industry || "enterprise",
    totalCases: cTestCases.length,
    passRate: 0,
    thresholdConfig: contractSuite?.thresholdConfig || { minPassRate: 0.97 },
    coverageTags: contractSuite?.coverageTags || [],
    ontologyTags: contractSuite?.ontologyTags || [],
  };
  lines.push(`echo "  Creating OTC-AGT-011 eval suite..."`);
  lines.push(`CONTRACT_SUITE_PAYLOAD=$(echo ${esc(suitePayload)} | jq -c \\`);
  lines.push(`  --arg aid "$CONTRACT_AGENT_ID" --arg did "$CONTRACT_DATASET_ID" \\`);
  lines.push(`  '. + {agentId: $aid, goldenDatasetId: $did}')`);
  lines.push(bashVar("CONTRACT_SUITE_ID", curlPost("/api/evals", `$CONTRACT_SUITE_PAYLOAD`)));
}
lines.push(``);

// ── Summary ───────────────────────────────────────────────────────────────────
lines.push(`echo ""`);
lines.push(`echo "============================================================"`);
lines.push(`echo "MIGRATION COMPLETE"`);
lines.push(`echo "  OTC-AGT-010 Returns & Refund Processing: $RETURNS_AGENT_ID"`);
lines.push(`echo "  OTC-AGT-011 Contract & Pricing Compliance: $CONTRACT_AGENT_ID"`);
lines.push(`echo "  OTC-AGT-010 Eval Suite: $RETURNS_SUITE_ID"`);
lines.push(`echo "  OTC-AGT-011 Eval Suite: $CONTRACT_SUITE_ID"`);
lines.push(`echo "============================================================"`);

const scriptContent = lines.join("\n") + "\n";
const outputPath = "scripts/otc-010-011-prod-migration.sh";
fs.writeFileSync(outputPath, scriptContent);
fs.chmodSync(outputPath, 0o755);

console.log(`\nScript generated: ${outputPath}`);
console.log(`Lines: ${lines.length}`);
console.log(`\nTo run against prod:`);
console.log(`  bash ${outputPath}`);
