#!/usr/bin/env node
/**
 * BB-AGT-005 — Odometer Fraud Detection Agent
 * Extension 1 Production Migration Script
 *
 * Reads DEV IDs from:  scripts/bb-ext1-dev-ids.json
 * Saves PROD IDs to:   scripts/bb-ext1-prod-ids.json
 *
 * Follows the same 13-step pattern as migrate-bb-to-prod.js:
 *   1  Skills (6)         → POST /api/skills
 *   2  KB                 → POST /api/knowledge-bases
 *   3  KB Sources (6)     → POST /api/knowledge-bases/:id/sources/text
 *   4  Runbooks (6)       → POST /api/runbooks
 *   5  Policies (5)       → POST /api/policies
 *   6  Agent              → POST /api/agents  (preloadedSkills at creation)
 *   7  Link Runbooks      → PATCH /api/runbooks/:id  { agentId }
 *      Link Policies      → PATCH /api/policies/:id  { scopeId, scopeType }
 *   8  Link KB            → POST /api/agents/:id/knowledge-bases
 *   9  Golden Dataset     → POST /api/golden-datasets
 *      Test Cases (6)     → POST /api/golden-datasets/:id/test-cases
 *  10  Eval Suite         → POST /api/evals
 *  11  Outcome + KPIs     → POST /api/outcomes/with-kpis
 *  12  Agent update       → PATCH /api/agents/:id  { outcomeId, evalBindings }
 *  13  Ontology tags      → PATCH /api/agents/:id  { ontologyTags }
 *
 * Usage: node scripts/migrate-bb-ext1-to-prod.js
 * Prerequisites: Run scripts/bb-ext1-provision-dev.mjs first to generate bb-ext1-dev-ids.json
 */

import { readFileSync, writeFileSync } from "fs";

const PROD_BASE = "https://agent-lifecycle-management-platform.replit.app";
const PROD_ORG  = "cf5754b1-ee80-4b51-8bf6-7be263c97527";
const DEV_BASE  = "http://localhost:5000";
const TOTAL     = 13;

// ── HTTP Helpers ──────────────────────────────────────────────────────────────

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

// ── Dev data fetchers ─────────────────────────────────────────────────────────

const getDevSkill    = (id) => get(DEV_BASE, `/api/skills/${id}`);
const getDevKB       = (id) => get(DEV_BASE, `/api/knowledge-bases/${id}`);
const getDevRunbook  = (id) => get(DEV_BASE, `/api/runbooks/${id}`);
const getDevPolicy   = (id) => get(DEV_BASE, `/api/policies/${id}`);
const getDevAgent    = (id) => get(DEV_BASE, `/api/agents/${id}`);
const getDevEval     = (id) => get(DEV_BASE, `/api/evals/${id}`);
const getDevDataset  = (id) => get(DEV_BASE, `/api/golden-datasets/${id}`);
const getDevOutcome  = (id) => get(DEV_BASE, `/api/outcomes/${id}`);

async function getDevKBSources(kbId) {
  const res = await get(DEV_BASE, `/api/knowledge-bases/${kbId}/sources`);
  return Array.isArray(res) ? res : (res.sources || []);
}

async function getDevTestCases(dsId) {
  const res = await get(DEV_BASE, `/api/golden-datasets/${dsId}/test-cases`);
  return Array.isArray(res) ? res : (res.testCases || res.cases || []);
}

async function getDevOutcomeKPIs(outcomeId) {
  try {
    const res = await get(DEV_BASE, `/api/outcomes/${outcomeId}/kpis`);
    return Array.isArray(res) ? res : (res.kpis || []);
  } catch (e) {
    warn(`Could not fetch dev KPIs for ${outcomeId}: ${e.message.slice(0, 60)}`);
    return [];
  }
}

// ── Main migration ────────────────────────────────────────────────────────────

async function main() {
  console.log("\n" + "═".repeat(64));
  console.log("  BB-AGT-005 — Odometer Fraud Detection Agent");
  console.log("  Extension 1 — PRODUCTION MIGRATION");
  console.log(`  Target: ${PROD_BASE}`);
  console.log(`  Org:    ${PROD_ORG}`);
  console.log("═".repeat(64) + "\n");

  const devData = JSON.parse(readFileSync("scripts/bb-ext1-dev-ids.json", "utf8"));
  console.log(`Loaded dev IDs (created: ${devData.createdAt})`);
  console.log(`  Agent ID (dev): ${devData.agentId}`);
  console.log(`  Skills:         ${devData.skillIds?.length || 0}`);
  console.log(`  Runbooks:       ${devData.runbookIds?.length || 0}`);
  console.log(`  Policies:       ${devData.policyIds?.length || 0}`);

  const prodIds = {
    agentCode: devData.agentCode,
    agentName: devData.agentName,
  };

  // ── STEP 1: SKILLS ────────────────────────────────────────────────────────
  step(1, `Migrating ${devData.skillIds.length} skills`);
  prodIds.skillIds = [];
  for (const devSkillId of devData.skillIds) {
    const devSkill = await getDevSkill(devSkillId);
    const { id, createdAt, updatedAt, ...skillData } = devSkill;
    const prodSkill = await post(PROD_BASE, "/api/skills", {
      ...skillData,
      organizationId: PROD_ORG,
    });
    prodIds.skillIds.push(prodSkill.id);
    log(`Skill → ${devSkill.name.slice(0, 60)} [${prodSkill.id}]`);
  }

  // ── STEP 2: KNOWLEDGE BASE ────────────────────────────────────────────────
  step(2, "Creating knowledge base");
  const devKB = await getDevKB(devData.kbId);
  const { id: kbId, createdAt: kbCA, updatedAt: kbUA, organizationId: kbOrg, ...kbData } = devKB;
  const prodKB = await post(PROD_BASE, "/api/knowledge-bases", {
    ...kbData,
    organizationId: PROD_ORG,
  });
  prodIds.kbId = prodKB.id;
  log(`Knowledge Base → ${prodKB.id}`);

  // ── STEP 3: KB SOURCES ────────────────────────────────────────────────────
  step(3, "Migrating KB sources");
  prodIds.kbSourceIds = [];
  const devSources = await getDevKBSources(devData.kbId);
  for (const src of devSources) {
    try {
      const prodSrc = await post(PROD_BASE, `/api/knowledge-bases/${prodIds.kbId}/sources/text`, {
        title: src.title || src.name,
        content: src.content,
        tags: src.tags,
        metadata: src.metadata,
      });
      prodIds.kbSourceIds.push(prodSrc.id);
      log(`KB Source → ${(src.title || src.name || "").slice(0, 65)}`);
    } catch (e) {
      warn(`KB Source (non-fatal): ${(src.title || "").slice(0, 40)} — ${e.message.slice(0, 80)}`);
    }
  }

  // ── STEP 4: RUNBOOKS ─────────────────────────────────────────────────────
  step(4, `Migrating ${devData.runbookIds.length} runbooks`);
  prodIds.runbookIds = [];
  for (const devRbId of devData.runbookIds) {
    const devRb = await getDevRunbook(devRbId);
    const { id, createdAt, updatedAt, agentId, organizationId, ...rbData } = devRb;
    const prodRb = await post(PROD_BASE, "/api/runbooks", {
      ...rbData,
      organizationId: PROD_ORG,
      agentId: null,
    });
    prodIds.runbookIds.push(prodRb.id);
    log(`Runbook → ${devRb.name.slice(0, 60)} [${prodRb.id}]`);
  }

  // ── STEP 5: POLICIES ─────────────────────────────────────────────────────
  step(5, `Migrating ${devData.policyIds.length} governance policies`);
  prodIds.policyIds = [];
  for (const devPId of devData.policyIds) {
    const devPol = await getDevPolicy(devPId);
    const { id, createdAt, updatedAt, scopeId, scopeType, organizationId, ...polData } = devPol;
    const prodPol = await post(PROD_BASE, "/api/policies", {
      ...polData,
      organizationId: PROD_ORG,
    });
    prodIds.policyIds.push(prodPol.id);
    log(`Policy → ${devPol.name.slice(0, 60)} [${prodPol.id}]`);
  }

  // ── STEP 6: AGENT ─────────────────────────────────────────────────────────
  step(6, "Creating agent in PROD");
  const devAgent = await getDevAgent(devData.agentId);
  const {
    id: aId, createdAt: aCA, updatedAt: aUA,
    organizationId: aOrg, outcomeId, evalBindings,
    ontologyTags, knowledgeBases, agentKnowledgeBases,
    preloadedSkills: devPreloadedSkills,
    policyBindings: devPolicyBindings,
    ...agentData
  } = devAgent;

  const prodAgent = await post(PROD_BASE, "/api/agents", {
    ...agentData,
    organizationId: PROD_ORG,
    environment: "production",
    preloadedSkills: prodIds.skillIds.map((skillId, i) => ({ skillId, loadOrder: i })),
    policyBindings: prodIds.policyIds,
  });
  prodIds.agentId = prodAgent.id;
  log(`Agent: ${devData.agentName} → ${prodAgent.id}`);

  // ── STEP 7: LINK RUNBOOKS & POLICIES ─────────────────────────────────────
  step(7, "Linking runbooks and policies to agent");
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

  // ── STEP 8: LINK KB TO AGENT ──────────────────────────────────────────────
  step(8, "Linking knowledge base to agent");
  try {
    await post(PROD_BASE, `/api/agents/${prodIds.agentId}/knowledge-bases`, {
      knowledgeBaseId: prodIds.kbId,
      priority: 1,
      retrievalConfig: { topK: 10, scoreThreshold: 0.65, rerankEnabled: true, citationMode: "full" },
    });
    log("Knowledge base linked (topK=10, rerank=true)");
  } catch (e) {
    warn(`KB link (non-fatal): ${e.message.slice(0, 80)}`);
  }

  // ── STEP 9: GOLDEN DATASET + TEST CASES ──────────────────────────────────
  step(9, "Migrating golden dataset + test cases");
  const devDS = await getDevDataset(devData.goldenDatasetId);
  const { id: dsId, createdAt: dsCA, updatedAt: dsUA, organizationId: dsOrg, testCaseCount, ...dsData } = devDS;
  const prodDS = await post(PROD_BASE, "/api/golden-datasets", {
    ...dsData,
    organizationId: PROD_ORG,
  });
  prodIds.goldenDatasetId = prodDS.id;
  log(`Golden Dataset → ${prodDS.id}`);

  prodIds.testCaseIds = [];
  const devTestCases = await getDevTestCases(devData.goldenDatasetId);
  for (const tc of devTestCases) {
    try {
      const { id: tcId, createdAt: tcCA, updatedAt: tcUA, datasetId, organizationId: tcOrg, ...tcData } = tc;
      const prodTC = await post(PROD_BASE, `/api/golden-datasets/${prodIds.goldenDatasetId}/test-cases`, {
        ...tcData,
        datasetId: prodIds.goldenDatasetId,
      });
      prodIds.testCaseIds.push(prodTC.id);
      log(`Test Case → ${tc.name.slice(0, 65)}`);
    } catch (e) {
      warn(`Test Case (non-fatal): ${tc.name?.slice(0, 40)} — ${e.message.slice(0, 80)}`);
    }
  }

  // ── STEP 10: EVAL SUITE ───────────────────────────────────────────────────
  step(10, "Creating eval suite");
  const devEval = await getDevEval(devData.evalSuiteId);
  const { id: evId, createdAt: evCA, updatedAt: evUA, organizationId: evOrg, agentId: evAgent, goldenDatasetId: evDS, ...evalData } = devEval;
  const prodEval = await post(PROD_BASE, "/api/evals", {
    ...evalData,
    organizationId: PROD_ORG,
    agentId: prodIds.agentId,
    goldenDatasetId: prodIds.goldenDatasetId,
  });
  prodIds.evalSuiteId = prodEval.id;
  log(`Eval Suite → ${prodEval.id}`);

  // ── STEP 11: OUTCOME + KPIs ───────────────────────────────────────────────
  step(11, "Creating outcome contract + KPIs");
  const devKPIs = await getDevOutcomeKPIs(devData.outcomeId);
  const devOutcome = await getDevOutcome(devData.outcomeId);
  const { id: ocId, createdAt: ocCA, updatedAt: ocUA, organizationId: ocOrg, ...outcomeData } = devOutcome;

  const prodKPIs = devKPIs.map(kpi => {
    const { id, createdAt, updatedAt, outcomeId: kpiOC, organizationId: kpiOrg, ...kpiData } = kpi;
    return kpiData;
  });

  const prodOutcome = await post(PROD_BASE, "/api/outcomes/with-kpis", {
    outcome: {
      ...outcomeData,
      organizationId: PROD_ORG,
      attributionRules: {
        ...(outcomeData.attributionRules || {}),
        agentId: prodIds.agentId,
      },
    },
    kpis: prodKPIs,
  });
  prodIds.outcomeId = prodOutcome.outcome?.id || prodOutcome.id;
  log(`Outcome Contract → ${prodIds.outcomeId} (${prodKPIs.length} KPIs)`);

  // ── STEP 12: LINK OUTCOME + EVAL TO AGENT ─────────────────────────────────
  step(12, "Linking outcome and eval to agent");
  await patch(PROD_BASE, `/api/agents/${prodIds.agentId}`, {
    outcomeId: prodIds.outcomeId,
    evalBindings: [prodIds.evalSuiteId],
  });
  log("Outcome and eval linked");

  // ── STEP 13: ONTOLOGY TAGS ────────────────────────────────────────────────
  step(13, "Setting ontology tags");
  try {
    const allConcepts = await get(PROD_BASE, "/api/ontology-concepts/all");
    const keywords = ["odometer", "fraud", "vehicle", "detection", "auction", "valuation", "compliance", "rollback"];
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
      warn("No ontology concepts found — skipping");
    }
  } catch (e) {
    warn(`Ontology tags (non-fatal): ${e.message.slice(0, 100)}`);
  }

  // ── SAVE PROD IDS ─────────────────────────────────────────────────────────
  const output = {
    createdAt: new Date().toISOString(),
    environment: "production",
    orgId: PROD_ORG,
    prodBase: PROD_BASE,
    ...prodIds,
  };

  writeFileSync("scripts/bb-ext1-prod-ids.json", JSON.stringify(output, null, 2));

  console.log("\n" + "═".repeat(64));
  console.log("  ✅  BB-AGT-005 — PRODUCTION MIGRATION COMPLETE");
  console.log("═".repeat(64));
  console.log(`\n  PROD Agent ID:   ${prodIds.agentId}`);
  console.log(`  PROD KB:         ${prodIds.kbId}  (${prodIds.kbSourceIds?.length || 0} sources)`);
  console.log(`  PROD Skills:     ${prodIds.skillIds?.length || 0} created`);
  console.log(`  PROD Runbooks:   ${prodIds.runbookIds?.length || 0} created`);
  console.log(`  PROD Policies:   ${prodIds.policyIds?.length || 0} created`);
  console.log(`  PROD Dataset:    ${prodIds.goldenDatasetId}  (${prodIds.testCaseIds?.length || 0} test cases)`);
  console.log(`  PROD Eval:       ${prodIds.evalSuiteId}`);
  console.log(`  PROD Outcome:    ${prodIds.outcomeId}`);
  console.log(`\n  Prod IDs saved → scripts/bb-ext1-prod-ids.json\n`);
}

main().catch(err => {
  console.error(`\n❌  PROD migration failed: ${err.message}`);
  process.exit(1);
});
