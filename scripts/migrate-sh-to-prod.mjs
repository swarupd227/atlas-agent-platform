/**
 * migrate-sh-to-prod.mjs
 *
 * Production migration for all 6 Self-Healing Demo Agents + full Platform Intelligence.
 * Reads from sh-migration-snapshot.json (captured from dev DB) and recreates
 * everything in the target environment via REST API.
 *
 * Migrates per agent (in order):
 *   1. Skills            (preloaded, AI tool adapters)
 *   2. Runbooks          (industry-specific response playbooks)
 *   3. Agent             (core record + systemPrompt + runtimeConfig + blueprintJson)
 *   4. Policies          (compliance guardrails, scoped to prod agent ID)
 *   5. policyBindings    (patch agent with bound policy IDs)
 *   6. Golden Dataset    (evaluation ground-truth test cases)
 *   7. Eval Suite        (regression suite linked to prod agent + dataset)
 *   8. Healing Pipeline  (sample incident showing autonomous remediation)
 *
 * Idempotent: skips creation if an entity with the same name already exists in prod.
 *
 * Usage:
 *   node scripts/migrate-sh-to-prod.mjs [PROD_URL]
 *   Default PROD_URL: https://agent-lifecycle-management-platform.replit.app
 *
 * Output:
 *   scripts/sh-prod-id-map.json  — dev→prod ID mapping for all migrated entities
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROD_URL = (process.argv[2] || "https://agent-lifecycle-management-platform.replit.app").replace(/\/$/, "");
const SNAPSHOT_PATH = path.join(__dirname, "sh-migration-snapshot.json");
const ID_MAP_PATH = path.join(__dirname, "sh-prod-id-map.json");

// ─── API helper ───────────────────────────────────────────────────────────────

async function api(method, endpoint, body, { silent = false } = {}) {
  const url = `${PROD_URL}${endpoint}`;
  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { _raw: text.slice(0, 200) }; }
    if (!res.ok) {
      if (!silent) console.error(`  ✗ ${method} ${endpoint} → ${res.status}:`, JSON.stringify(json).slice(0, 250));
      return null;
    }
    return json;
  } catch (err) {
    if (!silent) console.error(`  ✗ ${method} ${endpoint} network error:`, err.message);
    return null;
  }
}

// ─── Idempotent helpers ────────────────────────────────────────────────────────

async function findOrCreate(label, listEndpoint, createEndpoint, nameField, name, createBody) {
  // Check if already exists
  const existing = await api("GET", `${listEndpoint}?limit=500`, null, { silent: true });
  const list = Array.isArray(existing) ? existing : (existing?.data || existing?.items || []);
  const found = list.find(x => x[nameField] === name || x.name === name);
  if (found) {
    console.log(`   ↳ ${label} "${name}": already exists (${found.id.slice(0,8)})`);
    return found;
  }
  const created = await api("POST", createEndpoint, createBody);
  if (created?.id) {
    console.log(`   ✓ ${label} created: "${name}" (${created.id.slice(0,8)})`);
  } else {
    console.log(`   ✗ ${label} FAILED: "${name}"`);
  }
  return created;
}

async function findExistingAgent(name) {
  const all = await api("GET", `/api/agents?limit=300`, null, { silent: true });
  const list = Array.isArray(all) ? all : [];
  return list.find(a => a.name === name) || null;
}

async function findExistingSkill(name) {
  const all = await api("GET", `/api/skills?limit=500`, null, { silent: true });
  const list = Array.isArray(all) ? all : [];
  return list.find(s => s.name === name) || null;
}

async function findExistingRunbook(name) {
  const all = await api("GET", `/api/runbooks?limit=500`, null, { silent: true });
  const list = Array.isArray(all) ? all : [];
  return list.find(r => r.name === name) || null;
}

async function findExistingDataset(name) {
  const all = await api("GET", `/api/golden-datasets?limit=200`, null, { silent: true });
  const list = Array.isArray(all) ? all : [];
  return list.find(d => d.name === name) || null;
}

// ─── Main migration ────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${"═".repeat(65)}`);
  console.log(`  Self-Healing Agent Platform Intelligence Migration`);
  console.log(`  Target: ${PROD_URL}`);
  console.log(`${"═".repeat(65)}\n`);

  if (!fs.existsSync(SNAPSHOT_PATH)) {
    console.error(`✗ Snapshot not found at: ${SNAPSHOT_PATH}`);
    console.error(`  Run the audit first: node scripts/patch-sh-agents.mjs`);
    process.exit(1);
  }

  const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, "utf8"));

  // Load existing ID map if re-running
  const idMap = fs.existsSync(ID_MAP_PATH) ? JSON.parse(fs.readFileSync(ID_MAP_PATH, "utf8")) : {};

  // Verify prod connectivity
  console.log("🔗 Verifying production connectivity...");
  const health = await api("GET", "/api/agents?limit=1");
  if (!health) {
    console.error("✗ Cannot reach production. Check URL and network.");
    process.exit(1);
  }
  console.log("✓ Production reachable.\n");

  const agentOrder = [
    "Clinical Data Integrity Monitor",
    "Fraud Detection Model Recovery Agent",
    "Factory Floor Anomaly Recovery Agent",
    "Order Fulfillment Recovery Agent",
    "Grid Operations Stability Agent",
    "Claims Workflow Recovery Agent",
  ];

  const results = { migrated: [], skipped: [], failed: [] };

  for (const agentName of agentOrder) {
    const data = snapshot[agentName];
    if (!data) { console.warn(`⚠  No snapshot for "${agentName}" — skipping`); continue; }

    console.log(`\n${"─".repeat(65)}`);
    console.log(`  [${agentOrder.indexOf(agentName) + 1}/6] ${agentName}`);
    console.log(`${"─".repeat(65)}`);

    const agentKey = agentName.replace(/\s+/g, "_");
    if (!idMap[agentKey]) idMap[agentKey] = {};

    // ── Step 1: Skills ─────────────────────────────────────────────────────────
    console.log("\n  [1/8] Skills");
    const prodSkillIds = [];
    for (const skill of data.skills) {
      let prodSkill = await findExistingSkill(skill.name);
      if (!prodSkill) {
        prodSkill = await api("POST", "/api/skills", {
          name: skill.name,
          description: skill.description,
          industry: skill.industry,
          domain: skill.domain,
          version: skill.version || "1.0.0",
          author: skill.author || "ATLAS Platform Team",
          trustTier: skill.trustTier || "platform-provided",
          complexity: skill.complexity || "advanced",
          status: skill.status || "active",
          tags: skill.tags || [],
          agentTypeCompatibility: skill.agentTypeCompatibility || ["single", "team"],
          markdownBody: skill.markdownBody || `# ${skill.name}\n\n${skill.description}`,
          allowedTools: skill.allowedTools || [],
          contextMode: skill.contextMode || "inline",
          userInvocable: skill.userInvocable || false,
        });
        if (prodSkill?.id) {
          console.log(`   ✓ Skill created: "${skill.name}" (${prodSkill.id.slice(0,8)})`);
        } else {
          console.log(`   ✗ Skill FAILED: "${skill.name}"`);
        }
      } else {
        console.log(`   ↳ Skill "${skill.name}": already exists (${prodSkill.id.slice(0,8)})`);
      }
      if (prodSkill?.id) {
        idMap[agentKey].skills = idMap[agentKey].skills || {};
        idMap[agentKey].skills[skill.id] = prodSkill.id;
        prodSkillIds.push(prodSkill.id);
      }
    }

    // ── Step 2: Runbooks ───────────────────────────────────────────────────────
    console.log("\n  [2/8] Runbooks");
    const prodRunbookIds = {};
    for (const rb of data.runbooks) {
      let prodRb = await findExistingRunbook(rb.name);
      if (!prodRb) {
        prodRb = await api("POST", "/api/runbooks", {
          name: rb.name,
          description: rb.description,
          category: rb.category || "incident_response",
          severity: rb.severity || "high",
          autonomyLevel: rb.autonomyLevel || "confirm_before",
          industry: rb.industry,
          estimatedDurationMinutes: rb.estimatedDurationMinutes || 30,
          steps: rb.steps || [],
        });
        if (prodRb?.id) console.log(`   ✓ Runbook created: "${rb.name}" (${prodRb.id.slice(0,8)})`);
        else console.log(`   ✗ Runbook FAILED: "${rb.name}"`);
      } else {
        console.log(`   ↳ Runbook "${rb.name}": already exists (${prodRb.id.slice(0,8)})`);
      }
      if (prodRb?.id) {
        idMap[agentKey].runbooks = idMap[agentKey].runbooks || {};
        idMap[agentKey].runbooks[rb.id] = prodRb.id;
        prodRunbookIds[rb.name] = prodRb.id;
      }
    }

    // ── Step 3: Agent ──────────────────────────────────────────────────────────
    console.log("\n  [3/8] Agent");
    let prodAgent = await findExistingAgent(agentName);
    if (!prodAgent) {
      prodAgent = await api("POST", "/api/agents", {
        name: data.agent.name,
        agentType: data.agent.agentType,
        description: data.agent.description,
        owner: data.agent.owner,
        department: data.agent.department,
        status: data.agent.status,
        riskTier: data.agent.riskTier,
        autonomyMode: data.agent.autonomyMode,
        modelProvider: data.agent.modelProvider,
        modelName: data.agent.modelName,
        currentVersion: data.agent.currentVersion,
        environment: data.agent.environment,
        complianceTags: data.agent.complianceTags,
        ontologyTags: data.agent.ontologyTags,
        toolAccessClass: data.agent.toolAccessClass,
        maxToolIterations: data.agent.maxToolIterations,
        healthScore: data.agent.healthScore,
        successRate: data.agent.successRate,
        avgLatencyMs: data.agent.avgLatencyMs,
        systemPrompt: data.agent.systemPrompt,
        runtimeConfig: data.agent.runtimeConfig,
        preloadedSkills: prodSkillIds.map((sid, i) => ({ skillId: sid, loadOrder: i })),
      });
      if (prodAgent?.id) console.log(`   ✓ Agent created: "${agentName}" (${prodAgent.id.slice(0,8)})`);
      else { console.log(`   ✗ Agent FAILED: "${agentName}"`); results.failed.push(agentName); continue; }
    } else {
      // Update systemPrompt, runtimeConfig, ontologyTags on existing agent
      await api("PATCH", `/api/agents/${prodAgent.id}`, {
        systemPrompt: data.agent.systemPrompt,
        runtimeConfig: data.agent.runtimeConfig,
        ontologyTags: data.agent.ontologyTags,
        complianceTags: data.agent.complianceTags,
        healthScore: data.agent.healthScore,
        successRate: data.agent.successRate,
        avgLatencyMs: data.agent.avgLatencyMs,
        preloadedSkills: prodSkillIds.map((sid, i) => ({ skillId: sid, loadOrder: i })),
      });
      console.log(`   ↳ Agent "${agentName}": already exists (${prodAgent.id.slice(0,8)}) — fields refreshed`);
    }

    idMap[agentKey].agentId = prodAgent.id;

    // ── Step 4: Policies ───────────────────────────────────────────────────────
    console.log("\n  [4/8] Policies");
    const prodPolicyBindings = [];

    // Check existing policyBindings on prod agent
    const currentProdAgent = await api("GET", `/api/agents/${prodAgent.id}`, null, { silent: true });
    const existingBindings = Array.isArray(currentProdAgent?.policyBindings) ? currentProdAgent.policyBindings : [];
    const existingPolicyNames = new Set(existingBindings.map(b => b.policyName));

    // Keep existing bindings
    prodPolicyBindings.push(...existingBindings);

    for (const policy of data.policies) {
      if (existingPolicyNames.has(policy.name)) {
        console.log(`   ↳ Policy "${policy.name}": already bound — skipping`);
        continue;
      }
      const prodPolicy = await api("POST", "/api/policies", {
        name: policy.name,
        domain: policy.domain,
        scopeType: "agent",
        scopeId: prodAgent.id,
        version: policy.version || 1,
        status: policy.status || "active",
        description: policy.description,
        policyJson: policy.policyJson,
      });
      if (prodPolicy?.id) {
        console.log(`   ✓ Policy created: "${policy.name}" (${prodPolicy.id.slice(0,8)})`);
        idMap[agentKey].policies = idMap[agentKey].policies || {};
        idMap[agentKey].policies[policy.id] = prodPolicy.id;
        prodPolicyBindings.push({
          policyId: prodPolicy.id,
          policyName: prodPolicy.name,
          enforcement: policy.enforcement || "mandatory",
        });
      } else {
        console.log(`   ✗ Policy FAILED: "${policy.name}"`);
      }
    }

    // ── Step 5: Patch agent with policyBindings + blueprintJson ────────────────
    console.log("\n  [5/8] Binding policies + blueprintJson");
    const patchResult = await api("PATCH", `/api/agents/${prodAgent.id}`, {
      policyBindings: prodPolicyBindings,
      blueprintJson: data.agent.blueprintJson,
    });
    if (patchResult) console.log(`   ✓ policyBindings (${prodPolicyBindings.length}) + blueprintJson applied`);
    else console.log(`   ✗ Agent patch FAILED`);

    // ── Step 6: Golden Dataset + Test Cases ────────────────────────────────────
    console.log("\n  [6/8] Golden Dataset & Test Cases");
    let prodDatasetId = null;
    for (const evalSpec of data.evalSuites) {
      if (!evalSpec.goldenDataset) continue;
      let prodDataset = await findExistingDataset(evalSpec.goldenDataset.name);
      if (!prodDataset) {
        prodDataset = await api("POST", "/api/golden-datasets", {
          name: evalSpec.goldenDataset.name,
          description: evalSpec.goldenDataset.description,
          industry: evalSpec.goldenDataset.industry,
          useCase: evalSpec.goldenDataset.useCase,
          version: evalSpec.goldenDataset.version || "1.0",
          status: evalSpec.goldenDataset.status || "active",
          tags: evalSpec.goldenDataset.tags || [],
          scenarioCategories: evalSpec.goldenDataset.scenarioCategories || {},
          coverageDimensions: evalSpec.goldenDataset.coverageDimensions || [],
        });
        if (prodDataset?.id) {
          console.log(`   ✓ Golden dataset: "${evalSpec.goldenDataset.name}" (${prodDataset.id.slice(0,8)})`);
          // Create test cases
          let tcCount = 0;
          for (const tc of (evalSpec.testCases || [])) {
            const created = await api("POST", `/api/golden-datasets/${prodDataset.id}/test-cases`, {
              name: tc.name,
              inputScenario: tc.inputScenario,
              expectedBehavior: tc.expectedBehavior,
              goldenOutput: tc.goldenOutput,
              tags: tc.tags || [],
              difficulty: tc.difficulty || "routine",
              weight: tc.weight || 1,
              status: tc.status || "active",
              origin: tc.origin || "manual",
            });
            if (created?.id) tcCount++;
          }
          console.log(`   ✓ Test cases created: ${tcCount}/${(evalSpec.testCases||[]).length}`);
          idMap[agentKey].goldenDatasetId = prodDataset.id;
          prodDatasetId = prodDataset.id;
        } else {
          console.log(`   ✗ Golden dataset FAILED`);
        }
      } else {
        console.log(`   ↳ Golden dataset "${evalSpec.goldenDataset.name}": already exists (${prodDataset.id.slice(0,8)})`);
        idMap[agentKey].goldenDatasetId = prodDataset.id;
        prodDatasetId = prodDataset.id;
      }
      break; // One dataset per agent
    }

    // ── Step 7: Eval Suite ─────────────────────────────────────────────────────
    console.log("\n  [7/8] Eval Suite");
    for (const evalSpec of data.evalSuites) {
      const existingEvals = await api("GET", `/api/evals?agentId=${prodAgent.id}`, null, { silent: true });
      const existingEvList = Array.isArray(existingEvals) ? existingEvals : [];
      const alreadyExists = existingEvList.find(e => e.name === evalSpec.name);
      if (alreadyExists) {
        console.log(`   ↳ Eval suite "${evalSpec.name}": already exists (${alreadyExists.id.slice(0,8)})`);
        continue;
      }
      const prodEval = await api("POST", "/api/evals", {
        agentId: prodAgent.id,
        name: evalSpec.name,
        type: evalSpec.type || "regression",
        goldenDatasetId: prodDatasetId || undefined,
        industry: evalSpec.industry,
        totalCases: evalSpec.totalCases || 5,
        passRate: 0,
        thresholdConfig: evalSpec.thresholdConfig || { minPassRate: 0.90 },
        coverageTags: evalSpec.coverageTags || [],
        ontologyTags: evalSpec.ontologyTags || [],
      });
      if (prodEval?.id) {
        console.log(`   ✓ Eval suite created: "${evalSpec.name}" (${prodEval.id.slice(0,8)})`);
        idMap[agentKey].evalSuiteId = prodEval.id;
      } else {
        console.log(`   ✗ Eval suite FAILED: "${evalSpec.name}"`);
      }
    }

    // ── Step 8: Healing Pipeline ───────────────────────────────────────────────
    console.log("\n  [8/8] Healing Pipeline");
    if (data.pipeline) {
      // Check if pipeline already exists
      const existingPipelines = await api("GET", `/api/healing-pipelines?agentId=${prodAgent.id}&limit=5`, null, { silent: true });
      const existingPList = Array.isArray(existingPipelines) ? existingPipelines : [];
      const pipelineExists = existingPList.find(p => p.title === data.pipeline.title);
      if (pipelineExists) {
        console.log(`   ↳ Pipeline "${data.pipeline.title}": already exists (${pipelineExists.id.slice(0,8)})`);
      } else {
        // Normalize diagnosisDetails (rename atlasSkillsInvoked → skillsInvoked)
        const dd = { ...(data.pipeline.diagnosisDetails || {}) };
        if (dd.atlasSkillsInvoked) {
          dd.skillsInvoked = dd.atlasSkillsInvoked.map(s => ({
            skillName: s.skillName,
            description: s.description || `Atlas skill invoked during self-healing pipeline execution.`,
            finding: s.finding,
            duration: s.duration,
          }));
          delete dd.atlasSkillsInvoked;
        }
        const prodPipeline = await api("POST", "/api/healing-pipelines", {
          title: data.pipeline.title,
          agentId: prodAgent.id,
          agentName: data.pipeline.agentName,
          industry: data.pipeline.industry,
          severity: data.pipeline.severity,
          stage: data.pipeline.stage,
          issueType: data.pipeline.issueType,
          issueDescription: data.pipeline.issueDescription,
          triggerSource: data.pipeline.triggerSource,
          priority: data.pipeline.priority,
          diagnosisDetails: dd,
          hypothesis: data.pipeline.hypothesis,
          businessImpact: data.pipeline.businessImpact,
          remediation: data.pipeline.remediation,
          industryGuardrails: data.pipeline.industryGuardrails,
          resolution: data.pipeline.resolution,
          experimentConfig: {},
          experimentResults: {},
          status: data.pipeline.status || "active",
        });
        if (prodPipeline?.id) {
          console.log(`   ✓ Pipeline created: "${data.pipeline.title}" (${prodPipeline.id.slice(0,8)})`);
          idMap[agentKey].pipelineId = prodPipeline.id;
        } else {
          console.log(`   ✗ Pipeline FAILED: "${data.pipeline.title}"`);
        }
      }
    } else {
      console.log(`   ↳ No pipeline in snapshot — skipping`);
    }

    results.migrated.push(agentName);
    console.log(`\n  ✅ ${agentName} — migration complete`);
  }

  // ── Save ID map ──────────────────────────────────────────────────────────────
  fs.writeFileSync(ID_MAP_PATH, JSON.stringify(idMap, null, 2));

  // ── Summary ──────────────────────────────────────────────────────────────────
  console.log(`\n${"═".repeat(65)}`);
  console.log(`  Migration Complete`);
  console.log(`${"═".repeat(65)}`);
  console.log(`  ✅ Migrated:  ${results.migrated.length} agents`);
  if (results.skipped.length) console.log(`  ⏭  Skipped:   ${results.skipped.join(", ")}`);
  if (results.failed.length)  console.log(`  ✗  Failed:    ${results.failed.join(", ")}`);
  console.log(`\n  ID map saved to: scripts/sh-prod-id-map.json`);
  console.log(`  Target:          ${PROD_URL}`);
  console.log(`${"═".repeat(65)}\n`);
}

main().catch(err => {
  console.error("\nFatal error:", err.message);
  process.exit(1);
});
