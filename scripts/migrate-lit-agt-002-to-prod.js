#!/usr/bin/env node
/**
 * LIT-AGT-002 — Wage & Hour Compliance Audit Agent
 * Production Migration Script
 *
 * Usage:
 *   PROD_BASE="https://agent-lifecycle-management-platform.replit.app" \
 *   node scripts/migrate-lit-agt-002-to-prod.js
 *
 * Requires: Node.js v18+ (native fetch). No other dependencies.
 *
 * Design principles (learned from LIT-AGT-001 failures):
 * - Fetch every dev object and pass ALL its fields to prod via forProd()
 * - Never hand-pick fields — missing required fields cause 400 errors
 * - Only strip server-generated fields (id, createdAt, counters)
 * - Replace only organizationId and cross-entity references (agentId, scopeId, etc.)
 * - schedule field on evals is a string — "weekly" not an object
 */

import { readFileSync, writeFileSync } from "fs";

const PROD_BASE = process.env.PROD_BASE || "https://agent-lifecycle-management-platform.replit.app";
const PROD_ORG  = "cf5754b1-ee80-4b51-8bf6-7be263c97527";
const DEV_BASE  = "http://localhost:5000";

const DEV = JSON.parse(readFileSync("scripts/lit-agt-002-dev-ids.json", "utf8"));

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
  if (!r.ok) throw new Error(`POST ${path} → ${r.status}: ${JSON.stringify(data).slice(0, 500)}`);
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
  if (!r.ok) throw new Error(`PATCH ${path} → ${r.status}: ${JSON.stringify(data).slice(0, 500)}`);
  return data;
}

/**
 * Strip server-generated / read-only fields; replace org; apply overrides.
 * Passes EVERYTHING else from the dev object — no hand-picking fields.
 */
const SERVER_FIELDS = new Set([
  "id", "createdAt", "updatedAt", "lastEvalAt", "lastEvalPassRate",
  "activationCount", "performanceScore", "totalRuns", "monthlyCost",
  "monthlyRevenue", "triggerCount", "benchmarkAvg", "testCaseCount",
  "contributorCount", "lastUpdatedAt",
]);

function forProd(obj, overrides = {}) {
  const cleaned = Object.fromEntries(
    Object.entries(obj).filter(([k]) => !SERVER_FIELDS.has(k))
  );
  return { ...cleaned, organizationId: PROD_ORG, ...overrides };
}

const log  = (msg) => console.log(`  ✓  ${msg}`);
const warn = (msg) => console.log(`  ⚠  ${msg}`);
const step = (n, msg) => console.log(`\nSTEP ${n}/10  ${msg}`);

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n════════════════════════════════════════════════════════════════════");
  console.log("  LIT-AGT-002 → Production Migration");
  console.log("  Wage & Hour Compliance Audit Agent");
  console.log(`  Target: ${PROD_BASE}`);
  console.log("════════════════════════════════════════════════════════════════════\n");

  // ── Fetch ALL dev data upfront in parallel ─────────────────────────────────
  console.log("Fetching source data from dev…");
  const [agent, kb, evalSuite, outcome, goldenDataset] = await Promise.all([
    devGet(`/api/agents/${DEV.agentId}`),
    devGet(`/api/knowledge-bases/${DEV.kbId}`),
    devGet(`/api/evals/${DEV.evalSuiteId}`),
    devGet(`/api/outcomes/${DEV.outcomeId}`),
    devGet(`/api/golden-datasets/${DEV.goldenDatasetId}`),
  ]);

  const [skills, policies, runbooks, testCases, kpis, kbSources] = await Promise.all([
    Promise.all(DEV.skillIds.map(id => devGet(`/api/skills/${id}`))),
    Promise.all(DEV.policyIds.map(id => devGet(`/api/policies/${id}`))),
    Promise.all(DEV.runbookIds.map(id => devGet(`/api/runbooks/${id}`))),
    devGet(`/api/golden-datasets/${DEV.goldenDatasetId}/test-cases`),
    devGet(`/api/outcomes/${DEV.outcomeId}/kpis`),
    devGet(`/api/knowledge-bases/${DEV.kbId}/sources`),
  ]);

  console.log(`  ✓  ${skills.length} skills, ${policies.length} policies, ${runbooks.length} runbooks`);
  console.log(`  ✓  KB (${kbSources.length} sources), ${testCases.length} test cases, ${kpis.length} KPIs`);

  const prod = {};

  // ── STEP 1: SKILLS ─────────────────────────────────────────────────────────
  step("1", "Creating 6 skills…");
  prod.skillIds = [];
  for (const s of skills) {
    const res = await prodPost("/api/skills", forProd(s));
    prod.skillIds.push(res.id);
    log(`Skill: ${s.name} → ${res.id}`);
  }

  // ── STEP 2: KNOWLEDGE BASE ─────────────────────────────────────────────────
  step("2", `Creating knowledge base + ${kbSources.length} sources…`);
  const kbRes = await prodPost("/api/knowledge-bases", forProd(kb));
  prod.kbId = kbRes.id;
  log(`Knowledge Base → ${kbRes.id}`);

  for (const src of kbSources) {
    try {
      await prodPost(`/api/knowledge-bases/${prod.kbId}/sources/text`,
        forProd(src, { knowledgeBaseId: prod.kbId }));
      log(`KB Source: ${src.name.slice(0, 58)}`);
    } catch (e) {
      warn(`KB Source (non-fatal): ${src.name.slice(0, 40)} — ${e.message.slice(0, 80)}`);
    }
  }

  // ── STEP 3: RUNBOOKS ───────────────────────────────────────────────────────
  step("3", "Creating 6 runbooks…");
  prod.runbookIds = [];
  for (const rb of runbooks) {
    const res = await prodPost("/api/runbooks", forProd(rb, { agentId: null }));
    prod.runbookIds.push(res.id);
    log(`Runbook: ${rb.name.slice(0, 58)} → ${res.id}`);
  }

  // ── STEP 4: GOVERNANCE POLICIES ───────────────────────────────────────────
  step("4", "Creating 6 governance policies…");
  prod.policyIds = [];
  for (const p of policies) {
    const res = await prodPost("/api/policies", forProd(p, { scopeId: null }));
    prod.policyIds.push(res.id);
    log(`Policy: ${p.name.slice(0, 58)} → ${res.id}`);
  }

  // ── STEP 5: AGENT ─────────────────────────────────────────────────────────
  step("5", "Creating agent LIT-AGT-002…");
  const agentRes = await prodPost("/api/agents", forProd(agent, {
    outcomeId:       null,
    preloadedSkills: prod.skillIds,
    policyBindings:  prod.policyIds,
    evalBindings:    [],
  }));
  prod.agentId = agentRes.id;
  log(`Agent: ${agent.name} → ${agentRes.id}`);

  // ── STEP 6: GOLDEN DATASET ─────────────────────────────────────────────────
  step("6", `Creating golden dataset + ${testCases.length} test cases…`);
  const dsRes = await prodPost("/api/golden-datasets", forProd(goldenDataset));
  prod.goldenDatasetId = dsRes.id;
  log(`Golden Dataset → ${dsRes.id}`);

  for (const tc of testCases) {
    const { id, datasetId, createdAt, ...tcRest } = tc;
    await prodPost(`/api/golden-datasets/${prod.goldenDatasetId}/test-cases`, {
      ...tcRest,
      datasetId: prod.goldenDatasetId,
      organizationId: PROD_ORG,
    });
    log(`Test Case: ${tc.name.slice(0, 58)}`);
  }

  // ── STEP 7: EVAL SUITE ─────────────────────────────────────────────────────
  step("7", "Creating evaluation suite…");
  const evalRes = await prodPost("/api/evals", forProd(evalSuite, {
    agentId:         prod.agentId,
    goldenDatasetId: prod.goldenDatasetId,
    skillId:         null,
  }));
  prod.evalSuiteId = evalRes.id;
  log(`Eval Suite → ${evalRes.id}`);

  // ── STEP 8: OUTCOME CONTRACT + KPIs ───────────────────────────────────────
  step("8", `Creating outcome contract + ${kpis.length} KPIs…`);
  const outcomeRes = await prodPost("/api/outcomes/with-kpis", {
    outcome: forProd(outcome, {
      attributionRules: { ...outcome.attributionRules, agentId: prod.agentId },
    }),
    kpis: kpis.map(k => {
      const { id, outcomeId, createdAt, ...rest } = k;
      return rest;
    }),
  });
  prod.outcomeId = outcomeRes.outcome?.id || outcomeRes.id;
  log(`Outcome Contract → ${prod.outcomeId}`);

  // ── STEP 9: LINK KB TO AGENT ───────────────────────────────────────────────
  step("9", "Linking knowledge base to agent…");
  await prodPost(`/api/agents/${prod.agentId}/knowledge-bases`, {
    knowledgeBaseId: prod.kbId,
    priority: 1,
    retrievalConfig: {
      topK: 10,
      scoreThreshold: 0.70,
      rerankEnabled: true,
      jurisdictionFiltering: true,
      citationMode: "full",
    },
  });
  log("Knowledge base linked");

  // ── STEP 10: COMPLETE ALL LINKAGES ─────────────────────────────────────────
  step("10", "Completing all cross-entity linkages…");

  await prodPatch(`/api/agents/${prod.agentId}`, {
    outcomeId:    prod.outcomeId,
    evalBindings: [prod.evalSuiteId],
  });
  log("Outcome contract linked to agent");
  log("Eval suite linked to agent");

  for (const pId of prod.policyIds) {
    try {
      await prodPatch(`/api/policies/${pId}`, { scopeId: prod.agentId, scopeType: "agent" });
    } catch (e) {
      warn(`Policy scopeId (non-fatal): ${e.message.slice(0, 80)}`);
    }
  }
  log("6 policies scoped to prod agent");

  for (const rId of prod.runbookIds) {
    try {
      await prodPatch(`/api/runbooks/${rId}`, { agentId: prod.agentId });
    } catch (e) {
      warn(`Runbook agentId (non-fatal): ${e.message.slice(0, 80)}`);
    }
  }
  log("6 runbooks scoped to prod agent");

  // ── SAVE PROD IDS ──────────────────────────────────────────────────────────
  writeFileSync("scripts/lit-agt-002-prod-ids.json", JSON.stringify(prod, null, 2));

  // ── SUMMARY ───────────────────────────────────────────────────────────────
  console.log("\n════════════════════════════════════════════════════════════════════");
  console.log("  ✅  LIT-AGT-002 MIGRATION TO PRODUCTION — COMPLETE");
  console.log("════════════════════════════════════════════════════════════════════");
  console.log(`\n  Agent:           ${prod.agentId}`);
  console.log(`  Knowledge Base:  ${prod.kbId}`);
  console.log(`  Skills (6):      ${prod.skillIds.join("\n                   ")}`);
  console.log(`  Policies (6):    ${prod.policyIds.join("\n                   ")}`);
  console.log(`  Runbooks (6):    ${prod.runbookIds.join("\n                   ")}`);
  console.log(`  Golden Dataset:  ${prod.goldenDatasetId}`);
  console.log(`  Eval Suite:      ${prod.evalSuiteId}`);
  console.log(`  Outcome:         ${prod.outcomeId}`);
  console.log(`\n  Prod IDs saved → scripts/lit-agt-002-prod-ids.json\n`);
}

main().catch(err => {
  console.error(`\n❌  Migration failed: ${err.message}`);
  process.exit(1);
});
