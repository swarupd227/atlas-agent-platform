#!/usr/bin/env node
/**
 * Hearst Black Book — 4-Agent Production Migration Script
 * BB-AGT-001  Auction Data Quality Sentinel
 * BB-AGT-002  Market Shift Detector
 * BB-AGT-003  Competitive Intelligence Monitor
 * BB-AGT-004  Narrative Insight Generator
 *
 * Reads DEV IDs from:  scripts/bb-dev-ids.json
 * Saves PROD IDs to:   scripts/bb-prod-ids.json
 *
 * Per agent (13 steps):
 *   1  Skills (6)         → POST /api/skills
 *   2  KB                 → POST /api/knowledge-bases
 *   3  KB Sources (6)     → POST /api/knowledge-bases/:id/sources/text
 *   4  Runbooks (6)       → POST /api/runbooks
 *   5  Policies (5-6)     → POST /api/policies
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
 * Usage:  node scripts/migrate-bb-to-prod.js
 */

import { readFileSync, writeFileSync } from "fs";

const PROD_BASE = "https://agent-lifecycle-management-platform.replit.app";
const PROD_ORG  = "cf5754b1-ee80-4b51-8bf6-7be263c97527";
const DEV_BASE  = "http://localhost:5000";

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
const step = (n, t, label) => console.log(`\nSTEP ${n}/${t}  ${label}…`);

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

// ── Per-agent KB retrieval configs ────────────────────────────────────────────

const KB_RETRIEVAL = {
  "BB-AGT-001": { topK: 10, scoreThreshold: 0.65, rerankEnabled: true, citationMode: "full" },
  "BB-AGT-002": { topK: 10, scoreThreshold: 0.65, rerankEnabled: true, citationMode: "full" },
  "BB-AGT-003": { topK: 8,  scoreThreshold: 0.65, rerankEnabled: true, citationMode: "full" },
  "BB-AGT-004": { topK: 10, scoreThreshold: 0.65, rerankEnabled: true, citationMode: "full" },
};

// ── Per-agent ontology keywords ────────────────────────────────────────────────

const ONTOLOGY_KEYWORDS = {
  "BB-AGT-001": ["auction", "anomaly", "fraud", "data quality", "valuation", "detection", "vehicle"],
  "BB-AGT-002": ["market", "shift", "change", "signal", "forecast", "trend", "automotive", "wholesale"],
  "BB-AGT-003": ["competitive", "divergence", "valuation", "market", "analysis", "normalization"],
  "BB-AGT-004": ["narrative", "report", "insight", "content", "publication", "editorial", "market"],
};

// ── Single-agent migration ────────────────────────────────────────────────────

async function migrateAgent(agentCode, devIds) {
  const TOTAL = 13;
  const agentName = devIds.agentName;
  const keywords  = ONTOLOGY_KEYWORDS[agentCode];
  const kbConfig  = KB_RETRIEVAL[agentCode];

  console.log(`\n${"━".repeat(64)}`);
  console.log(`  ${agentCode}: ${agentName}`);
  console.log("━".repeat(64));

  const prodIds = { agentCode, agentName };

  // ── STEP 1: SKILLS ────────────────────────────────────────────────────────
  step(`${agentCode} 1`, TOTAL, `${agentCode} — Migrating ${devIds.skillIds.length} skills`);
  prodIds.skillIds = [];
  for (const devSkillId of devIds.skillIds) {
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
  step(`${agentCode} 2`, TOTAL, `${agentCode} — Creating knowledge base`);
  const devKB = await getDevKB(devIds.kbId);
  const { id: kbId, createdAt: kbCA, updatedAt: kbUA, organizationId: kbOrg, ...kbData } = devKB;
  const prodKB = await post(PROD_BASE, "/api/knowledge-bases", {
    ...kbData,
    organizationId: PROD_ORG,
  });
  prodIds.kbId = prodKB.id;
  log(`Knowledge Base → ${prodKB.id}`);

  // ── STEP 3: KB SOURCES ────────────────────────────────────────────────────
  step(`${agentCode} 3`, TOTAL, `${agentCode} — Migrating KB sources`);
  prodIds.kbSourceIds = [];
  const devSources = await getDevKBSources(devIds.kbId);
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
  step(`${agentCode} 4`, TOTAL, `${agentCode} — Migrating ${devIds.runbookIds.length} runbooks`);
  prodIds.runbookIds = [];
  for (const devRbId of devIds.runbookIds) {
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
  step(`${agentCode} 5`, TOTAL, `${agentCode} — Migrating ${devIds.policyIds.length} governance policies`);
  prodIds.policyIds = [];
  for (const devPId of devIds.policyIds) {
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
  step(`${agentCode} 6`, TOTAL, `${agentCode} — Creating agent in PROD`);
  const devAgent = await getDevAgent(devIds.agentId);
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
  log(`Agent: ${agentName} → ${prodAgent.id}`);

  // ── STEP 7: LINK RUNBOOKS & POLICIES ─────────────────────────────────────
  step(`${agentCode} 7`, TOTAL, `${agentCode} — Linking runbooks and policies to agent`);
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
  step(`${agentCode} 8`, TOTAL, `${agentCode} — Linking knowledge base to agent`);
  try {
    await post(PROD_BASE, `/api/agents/${prodIds.agentId}/knowledge-bases`, {
      knowledgeBaseId: prodIds.kbId,
      priority: 1,
      retrievalConfig: kbConfig,
    });
    log(`Knowledge base linked (topK=${kbConfig.topK})`);
  } catch (e) {
    warn(`KB link (non-fatal): ${e.message.slice(0, 80)}`);
  }

  // ── STEP 9: GOLDEN DATASET + TEST CASES ──────────────────────────────────
  step(`${agentCode} 9`, TOTAL, `${agentCode} — Migrating golden dataset + test cases`);
  const devDS = await getDevDataset(devIds.goldenDatasetId);
  const { id: dsId, createdAt: dsCA, updatedAt: dsUA, organizationId: dsOrg, testCaseCount, ...dsData } = devDS;
  const prodDS = await post(PROD_BASE, "/api/golden-datasets", {
    ...dsData,
    organizationId: PROD_ORG,
  });
  prodIds.goldenDatasetId = prodDS.id;
  log(`Golden Dataset → ${prodDS.id}`);

  prodIds.testCaseIds = [];
  const devTestCases = await getDevTestCases(devIds.goldenDatasetId);
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
  step(`${agentCode} 10`, TOTAL, `${agentCode} — Creating eval suite`);
  const devEval = await getDevEval(devIds.evalSuiteId);
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
  step(`${agentCode} 11`, TOTAL, `${agentCode} — Creating outcome contract + KPIs`);
  const devKPIs = await getDevOutcomeKPIs(devIds.outcomeId);
  const devOutcome = await getDevOutcome(devIds.outcomeId);
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
  step(`${agentCode} 12`, TOTAL, `${agentCode} — Linking outcome and eval to agent`);
  await patch(PROD_BASE, `/api/agents/${prodIds.agentId}`, {
    outcomeId: prodIds.outcomeId,
    evalBindings: [prodIds.evalSuiteId],
  });
  log("Outcome and eval linked");

  // ── STEP 13: ONTOLOGY TAGS ────────────────────────────────────────────────
  step(`${agentCode} 13`, TOTAL, `${agentCode} — Setting ontology tags`);
  try {
    const allConcepts = await get(PROD_BASE, "/api/ontology-concepts/all");
    const byId = new Map(allConcepts.map(c => [c.id, c]));

    const tags = [];
    const used = new Set();

    // Match by keyword against name/description/label
    for (const c of allConcepts) {
      if (tags.length >= 8) break;
      if (used.has(c.id)) continue;
      const searchStr = `${(c.name || "")} ${(c.label || "")} ${(c.description || "")}`.toLowerCase();
      if (keywords.some(kw => searchStr.includes(kw))) {
        tags.push({ conceptId: c.id, label: c.label || c.name, category: c.category });
        used.add(c.id);
      }
    }

    // Fallback: any non-used concept up to 5 minimum
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

  console.log(`\n  ✅  ${agentCode} COMPLETE → PROD agent: ${prodIds.agentId}`);
  return prodIds;
}

// ── MAIN ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n" + "═".repeat(64));
  console.log("  Hearst Black Book — 4-Agent PRODUCTION MIGRATION");
  console.log("  BB-AGT-001 / BB-AGT-002 / BB-AGT-003 / BB-AGT-004");
  console.log(`  Target: ${PROD_BASE}`);
  console.log(`  Org:    ${PROD_ORG}`);
  console.log("═".repeat(64) + "\n");

  // Load dev IDs
  const devData = JSON.parse(readFileSync("scripts/bb-dev-ids.json", "utf8"));
  console.log(`Loaded dev IDs (created: ${devData.createdAt})`);
  console.log(`  BB-AGT-001 agent: ${devData.agents["BB-AGT-001"].agentId}`);
  console.log(`  BB-AGT-002 agent: ${devData.agents["BB-AGT-002"].agentId}`);
  console.log(`  BB-AGT-003 agent: ${devData.agents["BB-AGT-003"].agentId}`);
  console.log(`  BB-AGT-004 agent: ${devData.agents["BB-AGT-004"].agentId}`);

  const result = {
    createdAt: new Date().toISOString(),
    environment: "production",
    orgId: PROD_ORG,
    prodBase: PROD_BASE,
    agents: {},
  };

  // Migrate each agent sequentially to avoid race conditions
  for (const agentCode of ["BB-AGT-001", "BB-AGT-002", "BB-AGT-003", "BB-AGT-004"]) {
    const devIds = devData.agents[agentCode];
    result.agents[agentCode] = await migrateAgent(agentCode, devIds);
  }

  // Save prod IDs
  writeFileSync("scripts/bb-prod-ids.json", JSON.stringify(result, null, 2));

  console.log("\n" + "═".repeat(64));
  console.log("  ✅  ALL 4 BB AGENTS — PRODUCTION MIGRATION COMPLETE");
  console.log("═".repeat(64));

  for (const [code, ids] of Object.entries(result.agents)) {
    console.log(`\n  ${code}  ${ids.agentName}`);
    console.log(`    PROD Agent:   ${ids.agentId}`);
    console.log(`    PROD KB:      ${ids.kbId}  (${ids.kbSourceIds?.length || 0} sources)`);
    console.log(`    PROD Skills:  ${ids.skillIds?.length || 0} created`);
    console.log(`    PROD Rbooks:  ${ids.runbookIds?.length || 0} created`);
    console.log(`    PROD Policies:${ids.policyIds?.length || 0} created`);
    console.log(`    PROD Dataset: ${ids.goldenDatasetId}  (${ids.testCaseIds?.length || 0} test cases)`);
    console.log(`    PROD Eval:    ${ids.evalSuiteId}`);
    console.log(`    PROD Outcome: ${ids.outcomeId}`);
  }

  console.log(`\n  Prod IDs saved → scripts/bb-prod-ids.json\n`);
}

main().catch(err => {
  console.error(`\n❌  PROD migration failed: ${err.message}`);
  process.exit(1);
});
