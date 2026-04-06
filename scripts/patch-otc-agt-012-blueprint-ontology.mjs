#!/usr/bin/env node
/**
 * patch-otc-agt-012-blueprint-ontology.mjs
 *
 * Adds Blueprint and Ontology mapping to OTC-AGT-012 (Customer Communication
 * & Notification Agent) in prod, which were missing after migration.
 *
 * Steps:
 *  1. Create a Workflow Blueprint with the correct execution graph
 *  2. Compile the blueprint (validates schema)
 *  3. Sign the blueprint (status: signed)
 *  4. PATCH the prod agent with blueprintId + ontologyTags
 *
 * Ontology conceptId numbering continues from the existing OTC agents:
 *   otc-001…006  → Dispute agent
 *   otc-007…012  → Cash agent
 *   otc-013…018  → Customer Communication & Notification agent (this file)
 */

import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const PROD_BASE   = "https://agent-lifecycle-management-platform.replit.app";
const PROD_ORG_ID = "cf5754b1-ee80-4b51-8bf6-7be263c97527";
const AGENT_ID    = "19feb92a-aeb0-47d9-841b-b0277eb99070";    // OTC-AGT-012 prod

const headers = {
  "Content-Type": "application/json",
  "x-organization-id": PROD_ORG_ID,
};

async function post(path, body) {
  const res = await fetch(`${PROD_BASE}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { _raw: text }; }
  if (!res.ok) throw new Error(`POST ${path} → ${res.status}: ${text.slice(0, 300)}`);
  return data;
}

async function patch(path, body) {
  const res = await fetch(`${PROD_BASE}${path}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { _raw: text }; }
  if (!res.ok) throw new Error(`PATCH ${path} → ${res.status}: ${text.slice(0, 300)}`);
  return data;
}

async function get(path) {
  const res = await fetch(`${PROD_BASE}${path}`, { headers });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return res.json();
}

// ─── Blueprint graph ─────────────────────────────────────────────────────────
// OTC-AGT-012 is a supervised, event-driven single agent.
// Flow: Event Classifier → Eligibility Evaluation (LLM) → Router →
//       Channel Selection (Tool) → Template Rendering (Tool) →
//       Delivery Dispatch (Tool) → Human Review (compliance / HIGH-risk)
const BLUEPRINT_JSON = {
  nodes: [
    {
      id: "otc012_n1_classifier",
      type: "classifier",
      label: "O2C Event Classifier",
      description: "Classifies the incoming O2C lifecycle event (order.confirmed, shipment.dispatched, invoice.issued, etc.) and extracts structured context.",
    },
    {
      id: "otc012_n2_eligibility",
      type: "llm_call",
      label: "Notification Eligibility Evaluation",
      description: "Evaluates customer opt-in status, deduplication window, frequency cap, and quiet-hours rules to determine whether a notification should be sent.",
    },
    {
      id: "otc012_n3_router",
      type: "router",
      label: "Eligibility Router",
      description: "Routes eligible events to channel selection. Ineligible events are logged and suppressed.",
    },
    {
      id: "otc012_n4_channel",
      type: "tool_call",
      label: "Channel Orchestration",
      description: "Selects the optimal delivery channel (email / SMS / push / portal / EDI) based on customer preference, urgency, and channel availability.",
    },
    {
      id: "otc012_n5_template",
      type: "tool_call",
      label: "Template Rendering",
      description: "Personalises and renders the notification message using the appropriate template for the event type, customer segment, and selected channel.",
    },
    {
      id: "otc012_n6_dispatch",
      type: "tool_call",
      label: "Notification Dispatch & Fallback",
      description: "Dispatches the rendered notification via the selected channel. On failure, applies the configured fallback channel chain and logs delivery outcome.",
    },
    {
      id: "otc012_n7_human_review",
      type: "human_review",
      label: "Compliance Human Review",
      description: "Escalates notifications flagged by compliance policies (GDPR erasure conflicts, TCPA violations, regulatory content review) to a human supervisor before delivery.",
    },
  ],
  edges: [
    { from: "otc012_n1_classifier",   to: "otc012_n2_eligibility"  },
    { from: "otc012_n2_eligibility",  to: "otc012_n3_router"       },
    { from: "otc012_n3_router",       to: "otc012_n4_channel"      },
    { from: "otc012_n4_channel",      to: "otc012_n5_template"     },
    { from: "otc012_n5_template",     to: "otc012_n6_dispatch"     },
    { from: "otc012_n6_dispatch",     to: "otc012_n7_human_review" },
  ],
};

// ─── Ontology tags ────────────────────────────────────────────────────────────
// Continue OTC conceptId sequence: otc-001…012 already taken.
const ONTOLOGY_TAGS = [
  {
    label:     "Customer Communication Orchestration",
    category:  "Customer Experience",
    conceptId: "otc-013",
  },
  {
    label:     "Multi-Channel Notification Delivery",
    category:  "Operations",
    conceptId: "otc-014",
  },
  {
    label:     "CAN-SPAM / GDPR / CASL Email Compliance",
    category:  "Compliance",
    conceptId: "otc-015",
  },
  {
    label:     "TCPA SMS Consent & Quiet Hours Enforcement",
    category:  "Compliance",
    conceptId: "otc-016",
  },
  {
    label:     "Customer Communication Preference Management",
    category:  "Customer Experience",
    conceptId: "otc-017",
  },
  {
    label:     "Communication Analytics & Engagement Optimization",
    category:  "Analytics",
    conceptId: "otc-018",
  },
];

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log(" OTC-AGT-012 Blueprint + Ontology Patch");
  console.log("═══════════════════════════════════════════════════════════\n");

  // ── Phase 1: Verify prod agent exists ──────────────────────────────────────
  console.log("Phase 1 — Verifying prod agent...");
  const agent = await get(`/api/agents/${AGENT_ID}`);
  console.log(`  ✔ Agent: ${agent.name} (${agent.id})`);
  console.log(`  blueprintId:  ${agent.blueprintId ?? "null"}`);
  console.log(`  ontologyTags: ${agent.ontologyTags == null ? "null" : JSON.stringify(agent.ontologyTags).slice(0, 80) + "…"}`);
  console.log();

  // ── Phase 2: Create blueprint ──────────────────────────────────────────────
  console.log("Phase 2 — Creating Workflow Blueprint...");
  const blueprint = await post("/api/blueprints", {
    name:         "Customer Communication & Notification Agent — O2C Workflow",
    description:  "Execution blueprint for OTC-AGT-012: event classification → eligibility evaluation → channel selection → template rendering → notification dispatch → compliance human review. Covers all O2C notification lifecycle events (order.confirmed through dispute.resolved) across email, SMS, push, portal, and EDI channels.",
    agentId:      AGENT_ID,
    blueprintJson: BLUEPRINT_JSON,
    patternType:  "workflow",
    tags:         ["otc-agt-012", "order-to-cash", "customer-communication", "notification", "multi-channel", "supervised"],
  });
  console.log(`  ✔ Blueprint created: ${blueprint.id}`);
  console.log(`  name:   ${blueprint.name}`);
  console.log(`  status: ${blueprint.status}`);
  console.log();

  // ── Phase 3: Compile blueprint ─────────────────────────────────────────────
  console.log("Phase 3 — Compiling blueprint...");
  const compiled = await post(`/api/blueprints/${blueprint.id}/compile`, {});
  if (compiled.validationResults?.errors?.length > 0) {
    console.error("  ✘ Compile errors:", JSON.stringify(compiled.validationResults.errors, null, 2));
    process.exit(1);
  }
  console.log(`  ✔ Compiled — passed: ${compiled.validationResults?.passed}`);
  if (compiled.validationResults?.warnings?.length > 0) {
    console.warn(`  ⚠ Warnings: ${compiled.validationResults.warnings.map(w => w.message).join(", ")}`);
  }
  console.log();

  // ── Phase 4: Sign blueprint ────────────────────────────────────────────────
  console.log("Phase 4 — Signing blueprint...");
  const signed = await post(`/api/blueprints/${blueprint.id}/sign`, {
    signedBy: "ATLAS-Migration-V1",
    notes:    "Signed during OTC-AGT-012 post-migration Blueprint + Ontology compliance patch.",
  });
  console.log(`  ✔ Blueprint signed — status: ${signed.status ?? "n/a"}, version: ${signed.version ?? "n/a"}`);
  console.log();

  // ── Phase 5: PATCH agent with blueprintId + ontologyTags ──────────────────
  console.log("Phase 5 — Patching prod agent with blueprintId + ontologyTags...");
  const patched = await patch(`/api/agents/${AGENT_ID}`, {
    blueprintId:  blueprint.id,
    blueprintJson: BLUEPRINT_JSON,
    ontologyTags: ONTOLOGY_TAGS,
  });
  console.log(`  ✔ Agent patched`);
  console.log(`  blueprintId:  ${patched.blueprintId}`);
  console.log(`  ontologyTags: ${JSON.stringify(patched.ontologyTags)}`);
  console.log();

  // ── Phase 6: Verify final state ────────────────────────────────────────────
  console.log("Phase 6 — Verifying final agent state...");
  const final = await get(`/api/agents/${AGENT_ID}`);
  const ok = final.blueprintId === blueprint.id &&
             Array.isArray(final.ontologyTags) &&
             final.ontologyTags.length === ONTOLOGY_TAGS.length;
  if (!ok) {
    console.error("  ✘ Verification failed:");
    console.error(`  blueprintId expected: ${blueprint.id}, got: ${final.blueprintId}`);
    console.error(`  ontologyTags length expected: ${ONTOLOGY_TAGS.length}, got: ${Array.isArray(final.ontologyTags) ? final.ontologyTags.length : "null"}`);
    process.exit(1);
  }
  console.log(`  ✔ blueprintId:  ${final.blueprintId}`);
  console.log(`  ✔ ontologyTags: ${final.ontologyTags.length} tags`);
  final.ontologyTags.forEach(t => console.log(`       • [${t.conceptId}] ${t.label} (${t.category})`));
  console.log();

  // ── Save results ───────────────────────────────────────────────────────────
  const result = {
    agentId:     AGENT_ID,
    agentName:   "Customer Communication & Notification Agent",
    agentCode:   "OTC-AGT-012",
    blueprintId: blueprint.id,
    blueprintName: blueprint.name,
    ontologyTags: ONTOLOGY_TAGS,
    patchedAt:   new Date().toISOString(),
    environment: "prod",
    orgId:       PROD_ORG_ID,
  };
  const outPath = join(__dirname, "otc-agt-012-blueprint-patch.json");
  writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.log(`Results saved → ${outPath}`);
  console.log();
  console.log("═══════════════════════════════════════════════════════════");
  console.log(" OTC-AGT-012 Blueprint + Ontology mapping COMPLETE ✔");
  console.log("═══════════════════════════════════════════════════════════");
}

main().catch(err => {
  console.error("\n✘ FATAL:", err.message);
  process.exit(1);
});
