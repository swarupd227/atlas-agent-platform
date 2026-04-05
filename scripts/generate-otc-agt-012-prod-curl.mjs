#!/usr/bin/env node
/**
 * Generator: Reads OTC-AGT-012 dev data from the dev API and
 * produces a self-contained bash CURL script to recreate everything in PROD.
 *
 * Usage:
 *   node scripts/generate-otc-agt-012-prod-curl.mjs > scripts/migrate-otc-agt-012-to-prod.sh
 *   chmod +x scripts/migrate-otc-agt-012-to-prod.sh
 *   ./scripts/migrate-otc-agt-012-to-prod.sh
 */

import { readFileSync, existsSync } from "fs";

const DEV_BASE  = "http://localhost:5000";
const PROD_BASE = "https://agent-lifecycle-management-platform.replit.app";
const PROD_ORG  = "cf5754b1-ee80-4b51-8bf6-7be263c97527";

const devIds = JSON.parse(readFileSync("scripts/otc-agt-012-dev-ids.json", "utf8"));

// ── helpers ──────────────────────────────────────────────────────────────────
async function get(path) {
  const r = await fetch(`${DEV_BASE}${path}`);
  if (!r.ok) throw new Error(`GET ${path} → ${r.status}`);
  return r.json();
}

function b64(obj) {
  return Buffer.from(JSON.stringify(obj)).toString("base64");
}

function curlPost(url, orgId, payloadBase64, varName, desc) {
  return `
echo "  ${desc}"
${varName}=$(curl -fsS -X POST '${url}' \\
  -H 'Content-Type: application/json' \\
  -H 'x-organization-id: ${orgId}' \\
  -d "$(echo '${payloadBase64}' | base64 -d)" | jq -r '.id')
echo "  ${varName}: \$${varName}"`;
}

function curlPostNoId(url, orgId, payloadBase64, desc) {
  return `
echo "  ${desc}"
curl -fsS -X POST "${url}" \\
  -H 'Content-Type: application/json' \\
  -H 'x-organization-id: ${orgId}' \\
  -d "$(echo '${payloadBase64}' | base64 -d)" > /dev/null`;
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  const lines = [];

  lines.push(`#!/usr/bin/env bash`);
  lines.push(`# =============================================================`);
  lines.push(`# OTC-AGT-012 — Customer Communication & Notification Agent`);
  lines.push(`# PRODUCTION MIGRATION SCRIPT`);
  lines.push(`# Generated: ${new Date().toISOString()}`);
  lines.push(`# Dev Agent: ${devIds.agentId}`);
  lines.push(`# Target: ${PROD_BASE}`);
  lines.push(`# Org: ${PROD_ORG}`);
  lines.push(`# All JSON payloads are base64-encoded to prevent bash`);
  lines.push(`# interpretation of special characters.`);
  lines.push(`# =============================================================`);
  lines.push(`set -euo pipefail`);
  lines.push(`command -v jq >/dev/null 2>&1 || { echo "ERROR: jq is required. Install with: brew install jq"; exit 1; }`);
  lines.push(`command -v base64 >/dev/null 2>&1 || { echo "ERROR: base64 is required"; exit 1; }`);
  lines.push(`echo ""`);
  lines.push(`echo "OTC-AGT-012  Customer Communication & Notification Agent"`);
  lines.push(`echo "Production Migration — Target: ${PROD_BASE}"`);
  lines.push(`echo ""`);

  // ── PHASE 1: Skills ────────────────────────────────────────────────────────
  lines.push(`\necho ""`);
  lines.push(`echo "== Phase 1: Creating 6 Skills =="`);

  const prodSkillVars = [];
  for (let i = 0; i < devIds.skillIds.length; i++) {
    const devSkillMeta = devIds.skillIds[i];
    const devSkill = await get(`/api/skills/${devSkillMeta.id}`);
    const { id, createdAt, updatedAt, organizationId, activationCount, performanceScore,
            descriptionQualityScore, lastEvalPassRate, lastEvalAt, industryContextId, aiEnrichment, yamlFrontmatter, ...skillData } = devSkill;
    const payload = { ...skillData, organizationId: PROD_ORG };
    const varName = `SKILL_${i + 1}_ID`;
    prodSkillVars.push({ varName, name: devSkill.name, loadOrder: devSkillMeta.loadOrder });
    lines.push(curlPost(`${PROD_BASE}/api/skills`, PROD_ORG, b64(payload), varName, `Skill ${i + 1}/${devIds.skillIds.length}: ${devSkill.name}`));
  }

  // ── PHASE 2: Knowledge Base ────────────────────────────────────────────────
  lines.push(`\necho ""`);
  lines.push(`echo "== Phase 2: Creating Knowledge Base =="`);

  const devKB = await get(`/api/knowledge-bases/${devIds.knowledgeBaseId}`);
  const { id: kbId, createdAt: kbCA, updatedAt: kbUA, organizationId: kbOrg,
          totalSources, totalChunks, status: kbStatus, ...kbData } = devKB;
  const kbPayload = { ...kbData, organizationId: PROD_ORG };
  lines.push(curlPost(`${PROD_BASE}/api/knowledge-bases`, PROD_ORG, b64(kbPayload), "KB_ID", `Knowledge Base: ${devKB.name}`));

  // ── PHASE 3: KB Sources ────────────────────────────────────────────────────
  // Source content is extracted from the dev creation script (the list API
  // does not expose content; the database stores them correctly).
  lines.push(`\necho ""`);
  lines.push(`echo "== Phase 3: Adding 6 Knowledge Base Sources =="`);

  const devScript = readFileSync("scripts/create-otc-agt-012-dev.js", "utf8");
  const srcMatch = devScript.match(/const sources = \[([\s\S]+?)\];\n\n  for/);
  if (!srcMatch) throw new Error("Could not extract sources from creation script");
  // Safely evaluate the sources array
  const srcList = eval(`(function() { return [ ${srcMatch[1]} ]; })()`);

  for (let i = 0; i < srcList.length; i++) {
    const src = srcList[i];
    const srcPayload = {
      sourceType: "text",
      name: src.name,
      description: src.description || "",
      content: src.content || "",
    };
    lines.push(curlPostNoId(`${PROD_BASE}/api/knowledge-bases/\${KB_ID}/sources/text`, PROD_ORG,
      b64(srcPayload), `KB Source ${i + 1}/${srcList.length}: ${src.name.substring(0, 55)}`));
  }

  // ── PHASE 4: Policies (without scopeId — will bind after agent creation) ──
  lines.push(`\necho ""`);
  lines.push(`echo "== Phase 4: Creating Policies (scope bound after agent creation) =="`);

  const prodPolicyVars = [];
  for (let i = 0; i < devIds.policyIds.length; i++) {
    const devPolMeta = devIds.policyIds[i];
    const devPol = await get(`/api/policies/${devPolMeta.id}`);
    const { id, createdAt, scopeId, organizationId, versionHistory, ...polData } = devPol;
    const polPayload = { ...polData, organizationId: PROD_ORG };
    const varName = `POLICY_${i + 1}_ID`;
    prodPolicyVars.push(varName);
    lines.push(curlPost(`${PROD_BASE}/api/policies`, PROD_ORG, b64(polPayload), varName, `Policy ${i + 1}/${devIds.policyIds.length}: ${devPol.name}`));
  }

  // ── PHASE 5: Agent ─────────────────────────────────────────────────────────
  lines.push(`\necho ""`);
  lines.push(`echo "== Phase 5: Creating Agent OTC-AGT-012 =="`);

  const devAgent = await get(`/api/agents/${devIds.agentId}`);
  const {
    id: aId, createdAt: aCA, updatedAt: aUA, organizationId: aOrg,
    outcomeId, evalBindings, ontologyTags, knowledgeBases, agentKnowledgeBases,
    preloadedSkills: devPreloadedSkills, policyBindings: devPolicyBindings,
    maturityScore, maturityFactors, blueprintId, linkedSkillChainId,
    activationCount: aAC, performanceScore: aPS, ...agentData
  } = devAgent;

  // Build preloadedSkills with prod skill var references — we do this as a jq expression
  const preloadedSkillsJson = prodSkillVars.map(s =>
    `{"skillId":"${s.varName}_PLACEHOLDER","loadOrder":${s.loadOrder}}`
  ).join(",");

  // We'll build the agent payload without preloadedSkills first, then patch it after
  const agentPayload = {
    ...agentData,
    organizationId: PROD_ORG,
    preloadedSkills: [], // will be set via PATCH below after skills are confirmed
  };

  lines.push(curlPost(`${PROD_BASE}/api/agents`, PROD_ORG, b64(agentPayload), "AGENT_ID", "Creating agent OTC-AGT-012"));

  // ── PHASE 6: Link KB to Agent ──────────────────────────────────────────────
  lines.push(`\necho ""`);
  lines.push(`echo "== Phase 6: Linking Knowledge Base to Agent =="`);
  lines.push(`echo "  Linking KB to agent..."`);
  lines.push(`echo '{}' | jq --arg kbId "$KB_ID" '{"knowledgeBaseId":$kbId}' | \\`);
  lines.push(`  curl -fsS -X POST "${PROD_BASE}/api/agents/\${AGENT_ID}/knowledge-bases" \\`);
  lines.push(`  -H 'Content-Type: application/json' \\`);
  lines.push(`  -H 'x-organization-id: ${PROD_ORG}' \\`);
  lines.push(`  -d @- > /dev/null`);
  lines.push(`echo "  KB linked to agent"`);

  // ── PHASE 7: Patch Policies — update scopeId to prod agent ─────────────────
  lines.push(`\necho ""`);
  lines.push(`echo "== Phase 7: Binding Policies to Agent =="`);

  for (let i = 0; i < prodPolicyVars.length; i++) {
    const varName = prodPolicyVars[i];
    lines.push(`echo "  Binding policy ${i + 1}/${prodPolicyVars.length}..."`);
    lines.push(`echo '{}' | jq --arg agentId "$AGENT_ID" '{"scopeId":$agentId,"scopeType":"agent"}' | \\`);
    lines.push(`  curl -fsS -X PATCH "${PROD_BASE}/api/policies/\${${varName}}" \\`);
    lines.push(`  -H 'Content-Type: application/json' \\`);
    lines.push(`  -H 'x-organization-id: ${PROD_ORG}' \\`);
    lines.push(`  -d @- > /dev/null`);
    lines.push(`echo "  Policy ${i + 1} bound to agent"`);
  }

  // ── PHASE 8: Patch Agent — add preloadedSkills ─────────────────────────────
  lines.push(`\necho ""`);
  lines.push(`echo "== Phase 8: Setting preloadedSkills on Agent =="`);
  lines.push(`echo "  Setting preloadedSkills..."`);

  // Build jq expression to construct the preloadedSkills array from env vars
  const jqArgs = prodSkillVars.map(s => `--arg ${s.varName.toLowerCase()} "$${s.varName}"`).join(" \\\n    ");
  const jqSkillsExpr = "[" + prodSkillVars.map(s =>
    `{"skillId":$${s.varName.toLowerCase()},"loadOrder":${s.loadOrder}}`
  ).join(",") + "]";

  lines.push(`echo '{"preloadedSkills":[]}' | \\`);
  lines.push(`  jq ${jqArgs} \\\n    '.preloadedSkills = ${jqSkillsExpr}' | \\`);
  lines.push(`  curl -fsS -X PATCH "${PROD_BASE}/api/agents/\${AGENT_ID}" \\`);
  lines.push(`  -H 'Content-Type: application/json' \\`);
  lines.push(`  -H 'x-organization-id: ${PROD_ORG}' \\`);
  lines.push(`  -d @- > /dev/null`);
  lines.push(`echo "  preloadedSkills set"`);

  // ── PHASE 9: Golden Dataset ────────────────────────────────────────────────
  lines.push(`\necho ""`);
  lines.push(`echo "== Phase 9: Creating Golden Dataset =="`);

  const devGDS = await get(`/api/golden-datasets/${devIds.goldenDatasetId}`);
  const { id: gdsId, createdAt: gCA, lastUpdatedAt, testCaseCount, benchmarkAvg,
          benchmarkRange, contributorCount, contributors, growthHistory, aiGenerated, ...gdsData } = devGDS;
  const gdsPayload = { ...gdsData, organizationId: PROD_ORG };
  lines.push(curlPost(`${PROD_BASE}/api/golden-datasets`, PROD_ORG, b64(gdsPayload), "GDS_ID", `Golden Dataset: ${devGDS.name}`));

  // ── PHASE 10: Test Cases ───────────────────────────────────────────────────
  lines.push(`\necho ""`);
  lines.push(`echo "== Phase 10: Adding Test Cases to Golden Dataset =="`);

  const devTCs = await get(`/api/golden-datasets/${devIds.goldenDatasetId}/test-cases`);
  const tcList = Array.isArray(devTCs) ? devTCs : (devTCs.testCases || devTCs.cases || []);

  for (let i = 0; i < tcList.length; i++) {
    const tc = tcList[i];
    const { id: tcId, datasetId, createdAt: tcCA, aiGenerated: tcAI, status: tcStatus, ...tcData } = tc;
    const tcPayload = { ...tcData };
    lines.push(curlPostNoId(`${PROD_BASE}/api/golden-datasets/\${GDS_ID}/test-cases`, PROD_ORG,
      b64(tcPayload), `Test Case ${i + 1}/${tcList.length}: ${(tc.name || "").substring(0, 50)}`));
  }

  // ── PHASE 11: Eval Suite ───────────────────────────────────────────────────
  lines.push(`\necho ""`);
  lines.push(`echo "== Phase 11: Creating Eval Suite =="`);

  const devEval = await get(`/api/evals/${devIds.evalSuiteId}`);
  const { id: eId, agentId: devAgentId, lastRunAt, passRate, totalCases, ...evalData } = devEval;
  // Build eval payload with fixed fields; agentId and goldenDatasetId injected via jq
  const evalBase = { ...evalData };
  delete evalBase.goldenDatasetId;

  lines.push(`echo "  Creating eval suite..."`);
  lines.push(`EVAL_ID=$(echo '${b64(evalBase)}' | base64 -d | \\`);
  lines.push(`  jq --arg agentId "$AGENT_ID" --arg gdsId "$GDS_ID" \\`);
  lines.push(`     '. + {"agentId": $agentId, "goldenDatasetId": $gdsId}' | \\`);
  lines.push(`  curl -fsS -X POST '${PROD_BASE}/api/evals' \\`);
  lines.push(`  -H 'Content-Type: application/json' \\`);
  lines.push(`  -H 'x-organization-id: ${PROD_ORG}' \\`);
  lines.push(`  -d @- | jq -r '.id')`);
  lines.push(`echo "  EVAL_ID: $EVAL_ID"`);

  // ── Summary ────────────────────────────────────────────────────────────────
  lines.push(`\necho ""`);
  lines.push(`echo "═══════════════════════════════════════════════════════════════"`);
  lines.push(`echo "  MIGRATION COMPLETE — OTC-AGT-012"`);
  lines.push(`echo "═══════════════════════════════════════════════════════════════"`);
  lines.push(`echo "  Agent ID     : \${AGENT_ID}"`);
  lines.push(`echo "  KB ID        : \${KB_ID}"`);
  lines.push(`echo "  GDS ID       : \${GDS_ID}"`);
  lines.push(`echo "  Eval Suite   : \${EVAL_ID}"`);
  lines.push(`echo ""`);
  lines.push(`echo "  View at: ${PROD_BASE}/agents/\${AGENT_ID}"`);
  lines.push(`echo ""`);

  // Save prod IDs
  lines.push(`\n# Save prod IDs to JSON for reference`);
  lines.push(`cat > scripts/otc-agt-012-prod-ids.json << JSONEOF`);
  lines.push(`{`);
  lines.push(`  "agentId": "$AGENT_ID",`);
  lines.push(`  "agentName": "Customer Communication & Notification Agent",`);
  lines.push(`  "agentCode": "OTC-AGT-012",`);
  lines.push(`  "knowledgeBaseId": "$KB_ID",`);
  lines.push(`  "goldenDatasetId": "$GDS_ID",`);
  lines.push(`  "evalSuiteId": "$EVAL_ID",`);
  lines.push(`  "policyIds": [${prodPolicyVars.map(v => `"$${v}"`).join(", ")}],`);
  lines.push(`  "skillIds": [${prodSkillVars.map(s => `"$${s.varName}"`).join(", ")}],`);
  lines.push(`  "migratedAt": "${new Date().toISOString()}",`);
  lines.push(`  "environment": "prod",`);
  lines.push(`  "orgId": "${PROD_ORG}"`);
  lines.push(`}`);
  lines.push(`JSONEOF`);
  lines.push(`echo "  Prod IDs saved to: scripts/otc-agt-012-prod-ids.json"`);

  console.log(lines.join("\n"));
}

main().catch(e => { console.error("Generator failed:", e.message); process.exit(1); });
