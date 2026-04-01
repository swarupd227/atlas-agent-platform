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

const PROD_BASE  = process.env.PROD_BASE || "https://agent-lifecycle-management-platform.replit.app";
const PROD_ORG   = "cf5754b1-ee80-4b51-8bf6-7be263c97527";
const DEV_BASE   = "http://localhost:5000";

const DEV_IDS = {
  agentId:         "e3036eb8-36ef-450c-9ee5-7ab12134169a",
  kbId:            "95c440f2-b7f1-408a-9d37-2da16fbae0e0",
  skillIds:        ["9d6e0875-dc71-4e90-8026-c40d6cf0c57f","53740fbd-fcad-435f-9e43-3e1425daa613","746f7afa-731a-4af9-9ae1-e777c280dc88","77a84d86-1350-4ded-afdf-8a363b67cf7b","da1e57c1-8a34-4852-a444-290a4b6fc0e2","99745ce1-07bb-4394-a6fc-f49ebdbd2097"],
  policyIds:       ["299e5d94-81d2-47a8-a506-36c6b58e56b6","5ed6c3f5-1c20-4259-aafe-db079572a046","61ae1592-d1a7-4d76-ab84-02bb89331eba","c14d2f0c-e428-4c4d-adf6-e92f4dc0cbb6","9aecce77-f99b-485b-b079-34ca23d07b0e","9c5da438-7b48-4afa-b37b-4e786df9e5bb"],
  runbookIds:      ["5346a882-bd40-48d8-8cb7-9669321b0f3e","add7f33c-574c-4c10-9490-44b702b4a7ce","8dd473f3-20c6-49ce-8d9a-545630a44546","8b9418ed-78f2-45e4-9d81-599e17d64b2e","694b53f6-ba1f-4dec-8205-da36faaae9fd","2d94b928-c08a-4584-be74-88e99a7e9352"],
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
  if (!r.ok) throw new Error(`POST ${path} → ${r.status}: ${JSON.stringify(data).slice(0, 400)}`);
  return data;
}

async function prodPatch(path, body) {
  const r = await fetch(`${PROD_BASE}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!r.ok) throw new Error(`PATCH ${path} → ${r.status}: ${JSON.stringify(data).slice(0, 400)}`);
  return data;
}

/**
 * Strip server-generated fields and replace org ID.
 * Pass extra overrides for any cross-entity references that need nulling/replacing.
 */
function forProd(obj, overrides = {}) {
  const { id, createdAt, updatedAt, lastEvalAt, lastEvalPassRate, activationCount,
          performanceScore, totalRuns, monthlyCost, monthlyRevenue, triggerCount,
          ...rest } = obj;
  return { ...rest, organizationId: PROD_ORG, ...overrides };
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

  // ── Fetch all dev data upfront ─────────────────────────────────────────────
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

  const prod = {};

  // ── STEP 1: SKILLS ──────────────────────────────────────────────────────────
  step("1", "Creating 6 skills…");
  prod.skillIds = [];
  for (const s of skills) {
    const res = await prodPost("/api/skills", forProd(s));
    prod.skillIds.push(res.id);
    log(`Skill: ${s.name} → ${res.id}`);
  }

  // ── STEP 2: KNOWLEDGE BASE ──────────────────────────────────────────────────
  step("2", `Creating knowledge base + ${kbSources.length} sources…`);
  const kbRes = await prodPost("/api/knowledge-bases", forProd(kb));
  prod.kbId = kbRes.id;
  log(`Knowledge Base → ${kbRes.id}`);

  for (const src of kbSources) {
    try {
      await prodPost(`/api/knowledge-bases/${prod.kbId}/sources/text`, forProd(src, { knowledgeBaseId: prod.kbId }));
      log(`KB Source: ${src.name.slice(0, 55)}`);
    } catch (e) {
      warn(`KB Source (non-fatal): ${src.name.slice(0, 40)} — ${e.message.slice(0, 80)}`);
    }
  }

  // ── STEP 3: RUNBOOKS ────────────────────────────────────────────────────────
  step("3", "Creating 6 runbooks…");
  prod.runbookIds = [];
  for (const rb of runbooks) {
    // Runbooks may have agentId pointing to dev agent — create without it, link later
    const res = await prodPost("/api/runbooks", forProd(rb, { agentId: null }));
    prod.runbookIds.push(res.id);
    log(`Runbook: ${rb.name.slice(0, 55)} → ${res.id}`);
  }

  // ── STEP 4: GOVERNANCE POLICIES ─────────────────────────────────────────────
  step("4", "Creating 6 governance policies…");
  prod.policyIds = [];
  for (const p of policies) {
    // scopeId points to dev agent — create without it, link to prod agent later
    const res = await prodPost("/api/policies", forProd(p, { scopeId: null }));
    prod.policyIds.push(res.id);
    log(`Policy: ${p.name.slice(0, 55)} → ${res.id}`);
  }

  // ── STEP 5: AGENT ───────────────────────────────────────────────────────────
  step("5", "Creating agent…");
  const agentRes = await prodPost("/api/agents", forProd(agent, {
    // Strip dev cross-references — will be linked in step 9
    outcomeId:      null,
    preloadedSkills: [],
    policyBindings:  [],
    evalBindings:    [],
  }));
  prod.agentId = agentRes.id;
  log(`Agent: ${agent.name} → ${agentRes.id}`);

  // ── STEP 6: GOLDEN DATASET + TEST CASES ─────────────────────────────────────
  step("6", `Creating golden dataset + ${testCases.length} test cases…`);
  const dsRes = await prodPost("/api/golden-datasets", forProd({
    name: "Employment Compliance & Policy Advisory — Golden Dataset",
    description: "Curated employment law test cases: jurisdiction ID, citations, gap analysis, policy drafting, UPL compliance, escalation logic",
    industry: "legal_services",
    qualityCoverage: 88.5,
    tags: ["employment-law","multi-state","jurisdiction","UPL","policy-drafting","citation-accuracy"],
  }));
  prod.goldenDatasetId = dsRes.id;
  log(`Golden Dataset → ${dsRes.id}`);

  for (const tc of testCases) {
    await prodPost(`/api/golden-datasets/${prod.goldenDatasetId}/test-cases`,
      forProd(tc, { datasetId: prod.goldenDatasetId }));
    log(`Test case: ${tc.name.slice(0, 55)}`);
  }

  // ── STEP 7: EVAL SUITE ──────────────────────────────────────────────────────
  step("7", "Creating evaluation suite…");
  const evalRes = await prodPost("/api/evals", forProd(evalSuite, {
    agentId:         prod.agentId,
    goldenDatasetId: prod.goldenDatasetId,
    skillId:         null,
  }));
  prod.evalSuiteId = evalRes.id;
  log(`Eval Suite → ${evalRes.id}`);

  // ── STEP 8: OUTCOME CONTRACT ─────────────────────────────────────────────────
  step("8", `Creating outcome contract + ${kpis.length} KPIs…`);
  const outcomeRes = await prodPost("/api/outcomes/with-kpis", {
    outcome: forProd(outcome, {
      attributionRules: { ...outcome.attributionRules, agentId: prod.agentId },
    }),
    kpis: kpis.map(k => {
      const { id, outcomeId, createdAt, ...kpi } = k;
      return kpi;
    }),
  });
  prod.outcomeId = outcomeRes.outcome?.id || outcomeRes.id;
  log(`Outcome Contract → ${prod.outcomeId}`);

  // ── STEP 9: LINK EVERYTHING ──────────────────────────────────────────────────
  step("9", "Linking all intelligence to agent…");

  // Link KB to agent
  await prodPost(`/api/agents/${prod.agentId}/knowledge-bases`, {
    knowledgeBaseId: prod.kbId,
    priority: 1,
    retrievalConfig: { topK: 8, scoreThreshold: 0.72, rerankEnabled: true, jurisdictionFiltering: true, citationMode: "full" },
  });
  log("Knowledge base linked");

  // Link skills, policies, outcome, eval suite to agent
  await prodPatch(`/api/agents/${prod.agentId}`, {
    preloadedSkills: prod.skillIds,
    policyBindings:  prod.policyIds,
    outcomeId:       prod.outcomeId,
    evalBindings:    [prod.evalSuiteId],
  });
  log("6 skills linked");
  log("6 policies linked");
  log("Outcome contract linked");
  log("Eval suite linked");

  // Update policies scopeId to point to prod agent
  for (const pId of prod.policyIds) {
    try {
      await prodPatch(`/api/policies/${pId}`, { scopeId: prod.agentId, scopeType: "agent" });
    } catch (e) {
      warn(`Policy scope update (non-fatal): ${e.message.slice(0, 60)}`);
    }
  }
  log("Policy scopeIds updated to prod agent");

  // Scope runbooks to prod agent
  for (const rId of prod.runbookIds) {
    try {
      await prodPatch(`/api/runbooks/${rId}`, { agentId: prod.agentId });
    } catch (e) {
      warn(`Runbook scope (non-fatal): ${e.message.slice(0, 60)}`);
    }
  }
  log("6 runbooks scoped to agent");

  // ── SAVE PROD IDS ────────────────────────────────────────────────────────────
  const fs = await import("fs");
  fs.writeFileSync("scripts/lit-agt-001-prod-ids.json", JSON.stringify(prod, null, 2));

  // ── SUMMARY ──────────────────────────────────────────────────────────────────
  console.log("\n════════════════════════════════════════════════════════════════");
  console.log("  ✅  LIT-AGT-001 MIGRATION TO PRODUCTION — COMPLETE");
  console.log("════════════════════════════════════════════════════════════════");
  console.log(`\n  Agent:           ${prod.agentId}`);
  console.log(`  Knowledge Base:  ${prod.kbId}`);
  console.log(`  Skills (6):      ${prod.skillIds.join("\n                   ")}`);
  console.log(`  Policies (6):    ${prod.policyIds.join("\n                   ")}`);
  console.log(`  Runbooks (6):    ${prod.runbookIds.join("\n                   ")}`);
  console.log(`  Golden Dataset:  ${prod.goldenDatasetId}`);
  console.log(`  Eval Suite:      ${prod.evalSuiteId}`);
  console.log(`  Outcome:         ${prod.outcomeId}`);
  console.log(`\n  Prod IDs saved → scripts/lit-agt-001-prod-ids.json\n`);
}

main().catch(err => {
  console.error(`\n❌  Migration failed: ${err.message}`);
  process.exit(1);
});
