#!/usr/bin/env node
/**
 * migrate-self-healing-to-prod.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Migrates all 6 Self-Healing Demo agents and Platform Intelligence components
 * from Dev to Production via REST API (no DB access required).
 *
 * Also generates a standalone bash cURL script for auditing / manual replay.
 *
 * Usage:
 *   node scripts/migrate-self-healing-to-prod.mjs <PROD_URL> [AUTH_TOKEN]
 *
 * Examples:
 *   node scripts/migrate-self-healing-to-prod.mjs https://agent-lifecycle-management-platform.replit.app
 *   node scripts/migrate-self-healing-to-prod.mjs https://agent-lifecycle-management-platform.replit.app "Bearer abc123"
 *
 * Output:
 *   scripts/self-healing-prod-ids.json    — All created Prod IDs
 *   scripts/self-healing-prod-curl.sh     — Standalone cURL script for replay
 */

import fs from "fs";

const PROD_URL = process.argv[2];
const AUTH_TOKEN = process.argv[3] || "";

if (!PROD_URL) {
  console.error("Usage: node scripts/migrate-self-healing-to-prod.mjs <PROD_URL> [AUTH_TOKEN]");
  console.error("Example: node scripts/migrate-self-healing-to-prod.mjs https://agent-lifecycle-management-platform.replit.app");
  process.exit(1);
}

// ─── Load Dev Manifest ────────────────────────────────────────────────────────

const DEV_MANIFEST_PATH = "scripts/self-healing-dev-ids.json";
if (!fs.existsSync(DEV_MANIFEST_PATH)) {
  console.error(`\n✗ Dev manifest not found at ${DEV_MANIFEST_PATH}`);
  console.error("  Run first: node scripts/create-self-healing-demos.mjs");
  process.exit(1);
}

const devManifest = JSON.parse(fs.readFileSync(DEV_MANIFEST_PATH, "utf8"));
console.log(`\n✓ Loaded dev manifest with ${Object.keys(devManifest).length} agents`);

// ─── API Helpers ──────────────────────────────────────────────────────────────

async function prodApi(method, path, body) {
  const headers = { "Content-Type": "application/json" };
  if (AUTH_TOKEN) headers["Authorization"] = AUTH_TOKEN;

  const res = await fetch(`${PROD_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { _raw: text }; }
  if (!res.ok) {
    console.error(`  ✗ ${method} ${path} → ${res.status}:`, JSON.stringify(json).substring(0, 300));
    throw new Error(`Prod API error ${res.status} on ${method} ${path}`);
  }
  return json;
}

// ─── Read Full Agent Data from Dev ───────────────────────────────────────────

async function fetchDevData(devBaseUrl) {
  const devApi = async (path) => {
    const res = await fetch(`${devBaseUrl}${path}`);
    return res.json();
  };

  console.log("\nFetching full agent data from Dev...");
  const allData = {};

  for (const [agentCode, ids] of Object.entries(devManifest)) {
    console.log(`  Fetching ${agentCode} (agent: ${ids.agentId})...`);
    const agent = await devApi(`/api/agents/${ids.agentId}`);

    // Fetch skills
    const skills = [];
    for (const skillId of ids.skillIds) {
      skills.push(await devApi(`/api/skills/${skillId}`));
    }

    // Fetch runbooks
    const runbooks = [];
    for (const rbId of ids.runbookIds) {
      try { runbooks.push(await devApi(`/api/runbooks/${rbId}`)); } catch { /* skip */ }
    }

    // Fetch policies
    const policies = [];
    for (const pId of ids.policyIds) {
      try { policies.push(await devApi(`/api/policies/${pId}`)); } catch { /* skip */ }
    }

    // Fetch healing pipeline
    const pipeline = await devApi(`/api/healing-pipelines/${ids.healingPipelineId}`);

    allData[agentCode] = { agent, skills, runbooks, policies, pipeline, devIds: ids };
  }

  return allData;
}

// ─── Migrate One Agent to Prod ────────────────────────────────────────────────

async function migrateAgent(agentCode, data) {
  console.log(`\n[Migrating ${agentCode}] ${data.agent.name}`);
  const result = {};

  // 1. Create Skills
  console.log("  Creating skills...");
  const prodSkillIds = [];
  for (const skill of data.skills) {
    const payload = {
      name: skill.name,
      description: skill.description,
      industry: skill.industry,
      domain: skill.domain,
      version: skill.version,
      author: skill.author,
      trustTier: skill.trustTier,
      complexity: skill.complexity,
      status: skill.status,
      tags: skill.tags,
      agentTypeCompatibility: skill.agentTypeCompatibility,
      markdownBody: skill.markdownBody,
      allowedTools: skill.allowedTools,
      contextMode: skill.contextMode,
      userInvocable: skill.userInvocable,
    };
    const created = await prodApi("POST", "/api/skills", payload);
    prodSkillIds.push(created.id);
    console.log(`    ✓ Skill: ${skill.name} → ${created.id}`);
  }
  result.skillIds = prodSkillIds;

  // 2. Create Runbooks
  console.log("  Creating runbooks...");
  const prodRunbookIds = [];
  for (const rb of data.runbooks) {
    const payload = {
      name: rb.name,
      description: rb.description,
      category: rb.category,
      severity: rb.severity,
      autonomyLevel: rb.autonomyLevel,
      industry: rb.industry,
      estimatedDurationMinutes: rb.estimatedDurationMinutes,
      steps: rb.steps || [],
    };
    const created = await prodApi("POST", "/api/runbooks", payload);
    prodRunbookIds.push(created.id);
    console.log(`    ✓ Runbook: ${rb.name} → ${created.id}`);
  }
  result.runbookIds = prodRunbookIds;

  // 3. Create Policies
  console.log("  Creating policies...");
  const prodPolicyIds = [];
  for (const pol of data.policies) {
    const payload = {
      name: pol.name,
      description: pol.description,
      policyType: pol.policyType,
      framework: pol.framework,
      jurisdiction: pol.jurisdiction,
      status: pol.status,
      industry: pol.industry,
      effectiveDate: pol.effectiveDate,
      rules: pol.rules || [],
    };
    const created = await prodApi("POST", "/api/policies", payload);
    prodPolicyIds.push(created.id);
    console.log(`    ✓ Policy: ${pol.name} → ${created.id}`);
  }
  result.policyIds = prodPolicyIds;

  // 4. Create Agent
  console.log("  Creating agent...");
  const agentPayload = {
    name: data.agent.name,
    agentType: data.agent.agentType,
    description: data.agent.description,
    owner: data.agent.owner,
    department: data.agent.department,
    status: data.agent.status,
    environment: data.agent.environment,
    riskTier: data.agent.riskTier,
    autonomyMode: data.agent.autonomyMode,
    modelProvider: data.agent.modelProvider,
    modelName: data.agent.modelName,
    currentVersion: data.agent.currentVersion,
    complianceTags: data.agent.complianceTags,
    toolAccessClass: data.agent.toolAccessClass,
    maxToolIterations: data.agent.maxToolIterations,
    healthScore: data.agent.healthScore,
    successRate: data.agent.successRate,
    avgLatencyMs: data.agent.avgLatencyMs,
    ontologyTags: data.agent.ontologyTags,
    runtimeConfig: data.agent.runtimeConfig,
    preloadedSkills: prodSkillIds.map((skillId, i) => ({ skillId, loadOrder: i })),
  };
  const prodAgent = await prodApi("POST", "/api/agents", agentPayload);
  result.agentId = prodAgent.id;
  console.log(`    ✓ Agent created → ${prodAgent.id}`);

  // 5. Patch Agent with policy bindings
  console.log("  Patching agent with policy bindings...");
  await prodApi("PATCH", `/api/agents/${prodAgent.id}`, {
    policyBindings: prodPolicyIds.map((policyId, i) => ({
      policyId,
      policyName: data.policies[i]?.name || "Policy",
      enforcement: "mandatory",
    })),
  });
  console.log("    ✓ Policy bindings applied");

  // 6. Create Healing Pipeline
  console.log("  Creating healing pipeline...");
  const p = data.pipeline;
  const pipelinePayload = {
    title: p.title,
    agentId: prodAgent.id,
    agentName: p.agentName,
    industry: p.industry,
    severity: p.severity,
    stage: p.stage,
    issueType: p.issueType,
    issueDescription: p.issueDescription,
    detectedAt: new Date().toISOString(),
    triggerSource: p.triggerSource,
    priority: p.priority,
    diagnosisDetails: p.diagnosisDetails,
    hypothesis: p.hypothesis,
    businessImpact: p.businessImpact,
    remediation: p.remediation,
    industryGuardrails: p.industryGuardrails,
    experimentConfig: p.experimentConfig || {},
    experimentResults: p.experimentResults || {},
    resolution: p.resolution,
    status: p.status,
  };
  const prodPipeline = await prodApi("POST", "/api/healing-pipelines", pipelinePayload);
  result.healingPipelineId = prodPipeline.id;
  console.log(`    ✓ Healing pipeline → ${prodPipeline.id}`);

  return result;
}

// ─── Generate cURL Script ─────────────────────────────────────────────────────

function generateCurlScript(allData) {
  const lines = [];
  const auth = AUTH_TOKEN ? `-H "Authorization: ${AUTH_TOKEN}"` : `# Add: -H "Authorization: <token>"`;

  lines.push(`#!/usr/bin/env bash`);
  lines.push(`# ============================================================`);
  lines.push(`# ATLAS Self-Healing Demo — Production Migration cURL Script`);
  lines.push(`# Generated: ${new Date().toISOString()}`);
  lines.push(`# Target:    ${PROD_URL}`);
  lines.push(`# Agents:    6 (Healthcare, Financial, Manufacturing, Retail, Energy, Insurance)`);
  lines.push(`# ============================================================`);
  lines.push(`set -euo pipefail`);
  lines.push(``);
  lines.push(`PROD="${PROD_URL}"`);
  lines.push(`HDR='-H "Content-Type: application/json"'`);
  lines.push(AUTH_TOKEN ? `TOKEN='-H "Authorization: ${AUTH_TOKEN}"'` : `# TOKEN='-H "Authorization: <your-token>"'`);
  lines.push(``);
  lines.push(`echo "================================================"`);
  lines.push(`echo " ATLAS Self-Healing Demo — Prod Migration"`);
  lines.push(`echo " Target: $PROD"`);
  lines.push(`echo "================================================"`);
  lines.push(``);

  for (const [agentCode, data] of Object.entries(allData)) {
    const CODE = agentCode.replace(/-/g, "_");
    lines.push(`# ─── ${agentCode}: ${data.agent.name} ───`);
    lines.push(`echo ""`);
    lines.push(`echo "[${agentCode}] ${data.agent.name}"`);
    lines.push(``);

    // Skills
    lines.push(`echo "  Creating skills..."`);
    for (let i = 0; i < data.skills.length; i++) {
      const sk = data.skills[i];
      const varName = `${CODE}_SKILL_BODY_${i}`;
      const idVar = `${CODE}_SKILL_ID_${i}`;
      const payload = {
        name: sk.name, description: sk.description, industry: sk.industry, domain: sk.domain,
        version: sk.version, author: sk.author, trustTier: sk.trustTier, complexity: sk.complexity,
        status: sk.status, tags: sk.tags, agentTypeCompatibility: sk.agentTypeCompatibility,
        markdownBody: sk.markdownBody, allowedTools: sk.allowedTools, contextMode: sk.contextMode, userInvocable: sk.userInvocable,
      };
      lines.push(`${varName}='${JSON.stringify(payload).replace(/'/g, "'\\''")}'`);
      lines.push(`${idVar}=$(curl -fsS -X POST "$PROD/api/skills" -H "Content-Type: application/json" ${AUTH_TOKEN ? `-H "Authorization: ${AUTH_TOKEN}"` : ""} -d "$${varName}" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")`);
      lines.push(`echo "    Skill: ${sk.name} -> $${idVar}"`);
    }
    lines.push(``);

    // Runbooks
    lines.push(`echo "  Creating runbooks..."`);
    for (const rb of data.runbooks) {
      const payload = {
        name: rb.name, description: rb.description, category: rb.category, severity: rb.severity,
        autonomyLevel: rb.autonomyLevel, industry: rb.industry, estimatedDurationMinutes: rb.estimatedDurationMinutes, steps: rb.steps || [],
      };
      lines.push(`curl -fsS -X POST "$PROD/api/runbooks" -H "Content-Type: application/json" ${AUTH_TOKEN ? `-H "Authorization: ${AUTH_TOKEN}"` : ""} -d '${JSON.stringify(payload).replace(/'/g, "'\\''")}' > /dev/null`);
      lines.push(`echo "    Runbook: ${rb.name}"`);
    }
    lines.push(``);

    // Policies
    lines.push(`echo "  Creating policies..."`);
    const policyIdVars = [];
    for (let i = 0; i < data.policies.length; i++) {
      const pol = data.policies[i];
      const idVar = `${CODE}_POLICY_ID_${i}`;
      policyIdVars.push(idVar);
      const payload = {
        name: pol.name, description: pol.description, policyType: pol.policyType, framework: pol.framework,
        jurisdiction: pol.jurisdiction, status: pol.status, industry: pol.industry, effectiveDate: pol.effectiveDate, rules: pol.rules || [],
      };
      lines.push(`${idVar}=$(curl -fsS -X POST "$PROD/api/policies" -H "Content-Type: application/json" ${AUTH_TOKEN ? `-H "Authorization: ${AUTH_TOKEN}"` : ""} -d '${JSON.stringify(payload).replace(/'/g, "'\\''")}' | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")`);
      lines.push(`echo "    Policy: ${pol.name} -> $${idVar}"`);
    }
    lines.push(``);

    // Agent (with skill IDs dynamically assembled in bash)
    const skillIdList = Array.from({ length: data.skills.length }, (_, i) => `"$${CODE}_SKILL_ID_${i}"`).join(", ");
    const agentPayloadStatic = {
      name: data.agent.name, agentType: data.agent.agentType, description: data.agent.description,
      owner: data.agent.owner, department: data.agent.department, status: data.agent.status,
      environment: data.agent.environment, riskTier: data.agent.riskTier, autonomyMode: data.agent.autonomyMode,
      modelProvider: data.agent.modelProvider, modelName: data.agent.modelName, currentVersion: data.agent.currentVersion,
      complianceTags: data.agent.complianceTags, toolAccessClass: data.agent.toolAccessClass,
      maxToolIterations: data.agent.maxToolIterations, healthScore: data.agent.healthScore,
      successRate: data.agent.successRate, avgLatencyMs: data.agent.avgLatencyMs,
      ontologyTags: data.agent.ontologyTags, runtimeConfig: data.agent.runtimeConfig,
    };
    const skillVarRefs = Array.from({ length: data.skills.length }, (_, i) => `$${CODE}_SKILL_ID_${i}`).join(" ");
    lines.push(`echo "  Creating agent..."`);
    lines.push(`${CODE}_AGENT_BASE='${JSON.stringify(agentPayloadStatic).replace(/'/g, "'\\''")}' `);
    lines.push(`${CODE}_AGENT_BODY=$(echo "$${CODE}_AGENT_BASE" | python3 -c "import sys,json; d=json.load(sys.stdin); d['preloadedSkills']=[{'skillId':s,'loadOrder':i} for i,s in enumerate('''${skillVarRefs}'''.split())]; print(json.dumps(d))")`);
    lines.push(`${CODE}_AGENT_ID=$(curl -fsS -X POST "$PROD/api/agents" -H "Content-Type: application/json" ${AUTH_TOKEN ? `-H "Authorization: ${AUTH_TOKEN}"` : ""} -d "$${CODE}_AGENT_BODY" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")`);
    lines.push(`echo "    Agent -> $${CODE}_AGENT_ID"`);
    lines.push(``);

    // Patch with policy bindings
    const policyBindings = data.policies.map((pol, i) => `{"policyId":"${`$${CODE}_POLICY_ID_${i}`}","policyName":"${pol.name}","enforcement":"mandatory"}`).join(",");
    lines.push(`${CODE}_PATCH='{"policyBindings":[${data.policies.map((pol, i) => `{"policyId":"$(echo $${CODE}_POLICY_ID_${i})","policyName":"${pol.name}","enforcement":"mandatory"}`).join(",")}]}'`);
    lines.push(`${CODE}_POLICY_BINDINGS=$(python3 -c "import json; bindings=[{'policyId': p, 'policyName': n, 'enforcement': 'mandatory'} for p, n in zip('''${policyIdVars.map(v => `$${v}`).join(" ")}'''.split(), ${JSON.stringify(data.policies.map(p => p.name))})] ; print(json.dumps({'policyBindings': bindings}))")`);
    lines.push(`curl -fsS -X PATCH "$PROD/api/agents/$${CODE}_AGENT_ID" -H "Content-Type: application/json" ${AUTH_TOKEN ? `-H "Authorization: ${AUTH_TOKEN}"` : ""} -d "$${CODE}_POLICY_BINDINGS" > /dev/null`);
    lines.push(`echo "    Policy bindings applied"`);
    lines.push(``);

    // Healing Pipeline
    const p = data.pipeline;
    const pipelinePayload = {
      title: p.title, agentName: p.agentName, industry: p.industry, severity: p.severity,
      stage: p.stage, issueType: p.issueType, issueDescription: p.issueDescription,
      triggerSource: p.triggerSource, priority: p.priority, diagnosisDetails: p.diagnosisDetails,
      hypothesis: p.hypothesis, businessImpact: p.businessImpact, remediation: p.remediation,
      industryGuardrails: p.industryGuardrails, experimentConfig: {}, experimentResults: {},
      resolution: p.resolution, status: p.status,
    };
    lines.push(`echo "  Creating healing pipeline..."`);
    lines.push(`${CODE}_PIPELINE_BASE='${JSON.stringify(pipelinePayload).replace(/'/g, "'\\''")}' `);
    lines.push(`${CODE}_PIPELINE_BODY=$(echo "$${CODE}_PIPELINE_BASE" | python3 -c "import sys,json; d=json.load(sys.stdin); d['agentId']='$${CODE}_AGENT_ID'; d['detectedAt']='$(date -u +%Y-%m-%dT%H:%M:%SZ)'; print(json.dumps(d))")`);
    lines.push(`${CODE}_PIPELINE_ID=$(curl -fsS -X POST "$PROD/api/healing-pipelines" -H "Content-Type: application/json" ${AUTH_TOKEN ? `-H "Authorization: ${AUTH_TOKEN}"` : ""} -d "$${CODE}_PIPELINE_BODY" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")`);
    lines.push(`echo "    Healing pipeline -> $${CODE}_PIPELINE_ID"`);
    lines.push(``);

    lines.push(`echo "  ✓ ${agentCode} complete: Agent $${CODE}_AGENT_ID, Pipeline $${CODE}_PIPELINE_ID"`);
    lines.push(``);
  }

  // Summary
  lines.push(`echo ""`);
  lines.push(`echo "================================================"`);
  lines.push(`echo " ATLAS Self-Healing Demo — Migration Complete"`);
  lines.push(`echo "================================================"`);
  lines.push(`echo ""`);
  lines.push(`echo "Agent IDs in Prod:"`);
  for (const [agentCode] of Object.entries(allData)) {
    const CODE = agentCode.replace(/-/g, "_");
    lines.push(`echo "  ${agentCode}: $${CODE}_AGENT_ID"`);
  }
  lines.push(`echo ""`);
  lines.push(`echo "All 6 Self-Healing demo agents migrated to production."`);

  return lines.join("\n");
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║   ATLAS Self-Healing Demo — Prod Migration                  ║");
  console.log("╠══════════════════════════════════════════════════════════════╣");
  console.log(`║  Target: ${PROD_URL.substring(0, 52).padEnd(52)}║`);
  console.log(`║  Auth:   ${(AUTH_TOKEN ? "Token provided" : "No auth token").padEnd(52)}║`);
  console.log("╚══════════════════════════════════════════════════════════════╝");

  const DEV_BASE_URL = "http://localhost:5000";

  // Fetch all dev data
  const allData = await fetchDevData(DEV_BASE_URL);

  // Generate cURL script (before migration — uses dev data)
  console.log("\nGenerating cURL migration script...");
  const curlScript = generateCurlScript(allData);
  const curlPath = "scripts/self-healing-prod-curl.sh";
  fs.writeFileSync(curlPath, curlScript);
  fs.chmodSync(curlPath, 0o755);
  console.log(`✓ cURL script saved: ${curlPath}`);

  // Migrate each agent
  const prodManifest = { migratedAt: new Date().toISOString(), targetUrl: PROD_URL, agents: {} };

  for (const [agentCode, data] of Object.entries(allData)) {
    try {
      const prodIds = await migrateAgent(agentCode, data);
      prodManifest.agents[agentCode] = {
        agentId: prodIds.agentId,
        agentName: data.agent.name,
        skillIds: prodIds.skillIds,
        runbookIds: prodIds.runbookIds,
        policyIds: prodIds.policyIds,
        healingPipelineId: prodIds.healingPipelineId,
      };
      console.log(`  ✓ ${agentCode} migrated: ${prodIds.agentId}`);
    } catch (e) {
      console.error(`  ✗ ${agentCode} migration failed:`, e.message);
      prodManifest.agents[agentCode] = { error: e.message };
    }
  }

  // Save prod manifest
  const prodManifestPath = "scripts/self-healing-prod-ids.json";
  fs.writeFileSync(prodManifestPath, JSON.stringify(prodManifest, null, 2));

  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║  MIGRATION COMPLETE                                         ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log(`\nProd manifest: ${prodManifestPath}`);
  console.log(`cURL script:   ${curlPath}`);
  console.log("\nProduction Agent IDs:");
  for (const [code, data] of Object.entries(prodManifest.agents)) {
    if (data.error) {
      console.log(`  ✗ ${code}: FAILED — ${data.error}`);
    } else {
      console.log(`  ✓ ${code}: ${data.agentId}`);
    }
  }
}

main().catch(e => { console.error("\nFatal migration error:", e); process.exit(1); });
