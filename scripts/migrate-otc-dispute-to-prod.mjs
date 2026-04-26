#!/usr/bin/env node
/**
 * OTC Dispute Resolution Intelligence — Production Migration Script
 * Demo 5 — NovaTech Industries
 *
 * Reads DEV IDs from:  scripts/otc-dispute-dev-ids.json
 * Saves PROD IDs to:   scripts/otc-dispute-prod-ids.json
 *
 * Migrates all 13 component types:
 *   1  Skills (6)         → POST /api/skills
 *   2  KB                 → POST /api/knowledge-bases
 *   3  KB Sources (5)     → POST /api/knowledge-bases/:id/sources/text
 *   4  Runbooks (5)       → POST /api/runbooks
 *   5  Policies (5)       → POST /api/policies
 *   6  Agent              → POST /api/agents (preloadedSkills at creation)
 *   7  Link Runbooks      → PATCH /api/runbooks/:id  { agentId }
 *      Link Policies      → PATCH /api/policies/:id  { scopeId, scopeType }
 *   8  Link KB            → POST /api/agents/:id/knowledge-bases
 *   9  Golden Dataset     → POST /api/golden-datasets
 *      Test Cases (6)     → POST /api/golden-datasets/:id/test-cases
 *  10  Eval Suite         → POST /api/evals
 *  11  Outcome + KPIs     → POST /api/outcomes/with-kpis
 *  12  Agent update       → PATCH /api/agents/:id  { outcomeId }
 *  13  Ontology tags      → PATCH /api/agents/:id  { ontologyTags }
 *
 * Usage:
 *   1. Run create-otc-agt-008-dev.mjs first to generate otc-dispute-dev-ids.json
 *   2. node scripts/migrate-otc-dispute-to-prod.mjs
 */

import { readFileSync, writeFileSync } from "fs";

const PROD_BASE = "https://agent-lifecycle-management-platform.replit.app";
const PROD_ORG  = "cf5754b1-ee80-4b51-8bf6-7be263c97527";
const DEV_BASE  = "http://localhost:5000";
const TOTAL     = 13;

// ── HTTP Helpers ───────────────────────────────────────────────────────────────

async function post(base, path, body) {
  const r = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  if (text.startsWith("<!DOCTYPE") || text.startsWith("<html")) {
    throw new Error(`POST ${path} → HTML (route missing?): ${text.slice(0, 200)}`);
  }
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!r.ok) throw new Error(`POST ${path} → ${r.status}: ${JSON.stringify(data).slice(0, 600)}`);
  return data;
}

async function patch(base, path, body) {
  const r = await fetch(`${base}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  if (text.startsWith("<!DOCTYPE") || text.startsWith("<html")) {
    throw new Error(`PATCH ${path} → HTML: ${text.slice(0, 200)}`);
  }
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!r.ok) throw new Error(`PATCH ${path} → ${r.status}: ${JSON.stringify(data).slice(0, 600)}`);
  return data;
}

async function get(base, path) {
  const r = await fetch(`${base}${path}`, { headers: { "Content-Type": "application/json" } });
  const text = await r.text();
  if (text.startsWith("<!DOCTYPE") || text.startsWith("<html")) {
    throw new Error(`GET ${path} → HTML`);
  }
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!r.ok) throw new Error(`GET ${path} → ${r.status}: ${JSON.stringify(data).slice(0, 600)}`);
  return data;
}

const log  = (msg) => console.log(`  ✓  ${msg}`);
const warn = (msg) => console.log(`  ⚠  ${msg}`);
const step = (n, label) => console.log(`\nSTEP ${n}/${TOTAL}  ${label}…`);

// ── Dev data fetchers ──────────────────────────────────────────────────────────

const getDevSkill   = (id) => get(DEV_BASE, `/api/skills/${id}`);
const getDevKB      = (id) => get(DEV_BASE, `/api/knowledge-bases/${id}`);
const getDevRunbook = (id) => get(DEV_BASE, `/api/runbooks/${id}`);
const getDevPolicy  = (id) => get(DEV_BASE, `/api/policies/${id}`);
const getDevAgent   = (id) => get(DEV_BASE, `/api/agents/${id}`);
const getDevEval    = (id) => get(DEV_BASE, `/api/evals/${id}`);
const getDevDataset = (id) => get(DEV_BASE, `/api/golden-datasets/${id}`);
const getDevOutcome = (id) => get(DEV_BASE, `/api/outcomes/${id}`);

async function getDevKBSources(kbId) {
  const res = await get(DEV_BASE, `/api/knowledge-bases/${kbId}/sources`);
  return Array.isArray(res) ? res : (res.sources || []);
}

async function getDevTestCases(datasetId) {
  const res = await get(DEV_BASE, `/api/golden-datasets/${datasetId}/test-cases`);
  return Array.isArray(res) ? res : (res.testCases || res.cases || []);
}

// ── MAIN ──────────────────────────────────────────────────────────────────────

async function main() {
  // Load dev IDs
  let devIds;
  try {
    devIds = JSON.parse(readFileSync("scripts/otc-dispute-dev-ids.json", "utf8"));
  } catch {
    throw new Error("scripts/otc-dispute-dev-ids.json not found — run create-otc-agt-008-dev.mjs first");
  }

  console.log("\n" + "═".repeat(64));
  console.log(`  OTC-AGT-008 — Dispute Resolution Agent`);
  console.log("  Demo 5 — Dispute Resolution Intelligence (NovaTech)");
  console.log(`  DEV  → ${DEV_BASE}`);
  console.log(`  PROD → ${PROD_BASE}`);
  console.log("═".repeat(64) + "\n");

  const prodIds = {
    migratedAt:  new Date().toISOString(),
    environment: "prod",
    agentCode:   devIds.agentCode,
    agentName:   devIds.agentName,
  };

  // ── STEP 1: SKILLS ─────────────────────────────────────────────────────────
  step(1, `Migrating ${devIds.skillIds.length} skills`);
  prodIds.skillIds = [];
  for (const devId of devIds.skillIds) {
    const devSkill = await getDevSkill(devId);
    const prod = await post(PROD_BASE, "/api/skills", {
      name:        devSkill.name,
      description: devSkill.description,
      industry:    devSkill.industry,
      domain:      devSkill.domain,
      author:      devSkill.author,
      tags:        devSkill.tags,
      complexity:  devSkill.complexity,
      status:      devSkill.status,
    });
    prodIds.skillIds.push(prod.id);
    log(`${devSkill.name} → ${prod.id}`);
  }

  // ── STEP 2: KNOWLEDGE BASE ─────────────────────────────────────────────────
  step(2, "Migrating knowledge base");
  const devKB = await getDevKB(devIds.kbId);
  const prodKB = await post(PROD_BASE, "/api/knowledge-bases", {
    name:            devKB.name,
    description:     devKB.description,
    retrievalConfig: devKB.retrievalConfig,
  });
  prodIds.kbId = prodKB.id;
  log(`${devKB.name} → ${prodKB.id}`);

  // ── STEP 3: KB SOURCES ─────────────────────────────────────────────────────
  step(3, "Migrating KB sources");
  const devSources = await getDevKBSources(devIds.kbId);
  prodIds.kbSourceIds = [];
  for (const src of devSources) {
    try {
      const prod = await post(PROD_BASE, `/api/knowledge-bases/${prodIds.kbId}/sources/text`, {
        title:   src.title,
        content: src.content,
        tags:    src.tags,
      });
      prodIds.kbSourceIds.push(prod.id);
      log(`KB Source → ${src.title}`);
    } catch (e) {
      warn(`KB Source (non-fatal): ${src.title} — ${e.message.slice(0, 80)}`);
    }
  }

  // ── STEP 4: RUNBOOKS ───────────────────────────────────────────────────────
  step(4, `Migrating ${devIds.runbookIds.length} runbooks`);
  prodIds.runbookIds = [];
  for (const devId of devIds.runbookIds) {
    const devRb = await getDevRunbook(devId);
    const prod = await post(PROD_BASE, "/api/runbooks", {
      name:          devRb.name,
      description:   devRb.description,
      industry:      devRb.industry,
      category:      devRb.category,
      triggerType:   devRb.triggerType,
      autonomyLevel: devRb.autonomyLevel,
      status:        devRb.status,
      severity:      devRb.severity,
      steps:         devRb.steps,
      agentId:       null,
    });
    prodIds.runbookIds.push(prod.id);
    log(`${devRb.name} → ${prod.id}`);
  }

  // ── STEP 5: POLICIES ──────────────────────────────────────────────────────
  step(5, `Migrating ${devIds.policyIds.length} policies`);
  prodIds.policyIds = [];
  for (const devId of devIds.policyIds) {
    const devPol = await getDevPolicy(devId);
    const prod = await post(PROD_BASE, "/api/policies", {
      name:        devPol.name,
      description: devPol.description,
      domain:      devPol.domain,
      status:      devPol.status,
      policyJson:  devPol.policyJson,
    });
    prodIds.policyIds.push(prod.id);
    log(`${devPol.name} → ${prod.id}`);
  }

  // ── STEP 6: AGENT ─────────────────────────────────────────────────────────
  step(6, `Creating ${devIds.agentName} on prod`);
  const devAgent = await getDevAgent(devIds.agentId);
  const prodAgent = await post(PROD_BASE, "/api/agents", {
    name:             devAgent.name,
    description:      devAgent.description,
    agentType:        devAgent.agentType || "operational",
    status:           "active",
    organizationId:   PROD_ORG,
    department:       devAgent.department,
    systemPrompt:     devAgent.systemPrompt,
    taskPrompt:       devAgent.taskPrompt,
    complianceTags:   devAgent.complianceTags,
    preloadedSkills:  prodIds.skillIds.map((id, i) => ({
      skillId:  id,
      agentId:  null,
      priority: i + 1,
    })),
  });
  prodIds.agentId = prodAgent.id;
  log(`${devAgent.name} → ${prodAgent.id}`);

  // ── STEP 7: LINK RUNBOOKS & POLICIES ─────────────────────────────────────
  step(7, "Linking runbooks and policies to prod agent");
  for (const rId of prodIds.runbookIds) {
    try {
      await patch(PROD_BASE, `/api/runbooks/${rId}`, { agentId: prodIds.agentId });
    } catch (e) {
      warn(`Runbook link (non-fatal): ${e.message.slice(0, 60)}`);
    }
  }
  log(`${prodIds.runbookIds.length} runbooks linked`);

  for (const pId of prodIds.policyIds) {
    try {
      await patch(PROD_BASE, `/api/policies/${pId}`, { scopeId: prodIds.agentId, scopeType: "agent" });
    } catch (e) {
      warn(`Policy link (non-fatal): ${e.message.slice(0, 60)}`);
    }
  }
  log(`${prodIds.policyIds.length} policies scoped`);

  // ── STEP 8: LINK KB ───────────────────────────────────────────────────────
  step(8, "Linking knowledge base to prod agent");
  try {
    await post(PROD_BASE, `/api/agents/${prodIds.agentId}/knowledge-bases`, {
      knowledgeBaseId: prodIds.kbId,
      priority: 1,
      retrievalConfig: { topK: 10, scoreThreshold: 0.65, rerankEnabled: true, citationMode: "full" },
    });
    log("KB linked to prod agent");
  } catch (e) {
    warn(`KB link (non-fatal): ${e.message.slice(0, 80)}`);
  }

  // ── STEP 9: GOLDEN DATASET + TEST CASES ──────────────────────────────────
  step(9, "Migrating golden dataset and test cases");
  const devDataset = await getDevDataset(devIds.goldenDatasetId);
  const prodDataset = await post(PROD_BASE, "/api/golden-datasets", {
    name:        devDataset.name,
    description: devDataset.description,
    industry:    devDataset.industry,
    useCase:     devDataset.useCase,
    tags:        devDataset.tags,
    status:      devDataset.status,
  });
  prodIds.goldenDatasetId = prodDataset.id;
  log(`Golden Dataset → ${prodDataset.id}`);

  const devTestCases = await getDevTestCases(devIds.goldenDatasetId);
  prodIds.testCaseIds = [];
  for (const tc of devTestCases) {
    try {
      const prod = await post(PROD_BASE, `/api/golden-datasets/${prodIds.goldenDatasetId}/test-cases`, {
        name:              tc.name,
        inputScenario:     tc.inputScenario,
        expectedBehavior:  tc.expectedBehavior,
        difficultyTier:    tc.difficultyTier,
        scenarioCategory:  tc.scenarioCategory,
        tags:              tc.tags,
        datasetId:         prodIds.goldenDatasetId,
      });
      prodIds.testCaseIds.push(prod.id);
      log(`Test Case → ${tc.name}`);
    } catch (e) {
      warn(`Test Case (non-fatal): ${tc.name} — ${e.message.slice(0, 80)}`);
    }
  }

  // ── STEP 10: EVAL SUITE ───────────────────────────────────────────────────
  step(10, "Creating eval suite on prod");
  const devEval = await getDevEval(devIds.evalSuiteId);
  const prodEval = await post(PROD_BASE, "/api/evals", {
    name:              devEval.name,
    agentId:           prodIds.agentId,
    goldenDatasetId:   prodIds.goldenDatasetId,
    type:              devEval.type || "regression",
    industry:          devEval.industry,
    thresholdConfig:   devEval.thresholdConfig,
    schedule:          devEval.schedule,
  });
  prodIds.evalSuiteId = prodEval.id;
  log(`Eval Suite → ${prodEval.id}`);

  // ── STEP 11: OUTCOME + KPIs ───────────────────────────────────────────────
  step(11, "Migrating outcome contract + KPIs");
  const devOutcome = await getDevOutcome(devIds.outcomeId);
  const prodOutcomeRes = await post(PROD_BASE, "/api/outcomes/with-kpis", {
    outcome: {
      name:        devOutcome.name,
      description: devOutcome.description,
      agentId:     prodIds.agentId,
      attributionRules: devOutcome.attributionRules || {
        agentId:            prodIds.agentId,
        attributionModel:   "direct",
        measurementWindow:  "monthly",
      },
    },
    kpis: (devOutcome.kpis || []).map(k => ({
      name:        k.name,
      description: k.description,
      metric:      k.metric,
      target:      k.target,
      unit:        k.unit,
      direction:   k.direction,
    })),
  });
  prodIds.outcomeId = prodOutcomeRes.outcome?.id || prodOutcomeRes.id;
  log(`Outcome Contract → ${prodIds.outcomeId}`);

  // ── STEP 12: LINK OUTCOME TO AGENT ────────────────────────────────────────
  step(12, "Linking outcome and eval to prod agent");
  try {
    await patch(PROD_BASE, `/api/agents/${prodIds.agentId}`, { outcomeId: prodIds.outcomeId });
    log("Outcome linked");
  } catch (e) {
    warn(`Outcome link (non-fatal): ${e.message.slice(0, 60)}`);
  }

  // ── STEP 13: ONTOLOGY TAGS ────────────────────────────────────────────────
  step(13, "Setting ontology tags on prod agent");
  try {
    const allConcepts = await get(PROD_BASE, "/api/ontology-concepts/all");
    const keywords = ["dispute", "credit", "invoice", "contract", "pricing", "billing", "customer", "resolution"];
    const tags = [];
    const used = new Set();

    for (const c of allConcepts) {
      if (tags.length >= 8) break;
      if (used.has(c.id)) continue;
      const searchStr = `${c.name || ""} ${c.label || ""} ${c.description || ""}`.toLowerCase();
      if (keywords.some(kw => searchStr.includes(kw))) {
        tags.push({ conceptId: c.id, label: c.label || c.name, category: c.category });
        used.add(c.id);
      }
    }

    if (tags.length < 5) {
      for (const c of allConcepts) {
        if (tags.length >= 6) break;
        if (used.has(c.id)) continue;
        tags.push({ conceptId: c.id, label: c.label || c.name, category: c.category });
        used.add(c.id);
      }
    }

    if (tags.length > 0) {
      await patch(PROD_BASE, `/api/agents/${prodIds.agentId}`, { ontologyTags: tags });
      log(`Ontology tags (${tags.length}): ${tags.map(t => t.label).join(", ")}`);
    } else {
      warn("No ontology concepts found on prod — skipping");
    }
  } catch (e) {
    warn(`Ontology tags (non-fatal): ${e.message.slice(0, 100)}`);
  }

  // ── SAVE PROD IDs ─────────────────────────────────────────────────────────
  writeFileSync("scripts/otc-dispute-prod-ids.json", JSON.stringify(prodIds, null, 2));

  console.log("\n" + "═".repeat(64));
  console.log(`  ✅  OTC-AGT-008 PRODUCTION MIGRATION COMPLETE`);
  console.log("═".repeat(64));
  console.log(`\n  Prod Agent ID:  ${prodIds.agentId}`);
  console.log(`  Prod KB ID:     ${prodIds.kbId}  (${prodIds.kbSourceIds?.length || 0} sources)`);
  console.log(`  Skills:         ${prodIds.skillIds?.length || 0} migrated`);
  console.log(`  Runbooks:       ${prodIds.runbookIds?.length || 0} migrated`);
  console.log(`  Policies:       ${prodIds.policyIds?.length || 0} migrated`);
  console.log(`  Dataset:        ${prodIds.goldenDatasetId}  (${prodIds.testCaseIds?.length || 0} test cases)`);
  console.log(`  Eval Suite:     ${prodIds.evalSuiteId}`);
  console.log(`  Outcome:        ${prodIds.outcomeId}`);
  console.log(`\n  Prod IDs saved → scripts/otc-dispute-prod-ids.json`);
  console.log(`\n  Verify at: ${PROD_BASE}/agents/${prodIds.agentId}\n`);
}

main().catch(err => {
  console.error(`\n❌  Migration failed: ${err.message}`);
  process.exit(1);
});
