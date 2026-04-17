/**
 * Migration script: Advantive ONE AI-First T1 Support Intelligence → Production
 *
 * Provisions SUP-001, SUP-002, SUP-003, SUP-004 agents and all supporting
 * platform entities (KBs, MCP servers, skills, policies, blueprints, eval suite)
 * in the production environment.
 *
 * Usage:
 *   npx tsx scripts/migrate-advantive-support-to-prod.ts
 *
 * Idempotent: safe to run multiple times.
 */

import { ensureAdvSupportAgents } from "../server/advantive-support-live-run";

async function main() {
  console.log("=== Advantive ONE T1 Support Intelligence — Production Migration ===\n");
  console.log("Provisioning 4 agents: SUP-001 · SUP-002 · SUP-003 · SUP-004");
  console.log("  · 4 Knowledge Bases");
  console.log("  · 4 MCP Servers + 20 tools");
  console.log("  · 12 Skills");
  console.log("  · 3 Governance Policies");
  console.log("  · 16 Ontology Concepts");
  console.log("  · 4 Blueprints");
  console.log("  · 1 Eval Suite (10 test cases)\n");

  try {
    await ensureAdvSupportAgents();
    console.log("\n✔ Migration complete — all entities provisioned successfully.");
    console.log("\nAgent Registry entries:");
    console.log("  SUP-001 · Triage & Intent Classifier       [anthropic/claude-sonnet-4-5]");
    console.log("  SUP-002 · Knowledge Resolution Agent       [anthropic/claude-sonnet-4-5]");
    console.log("  SUP-003 · Diagnostic Reasoning Agent       [anthropic/claude-opus-4-5]");
    console.log("  SUP-004 · T1→T2 Escalation Packager        [anthropic/claude-sonnet-4-5]");
    console.log("\nSSE Demo Endpoint: GET /demo-api/advantive-support/live-run");
    console.log("Demo Route:        /demo/advantive-support");
    process.exit(0);
  } catch (err: unknown) {
    console.error("\n✗ Migration failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main();
