/**
 * Pre-provisioning check for the VitalEdge / Equipment Dealer vertical.
 *
 * Two classes of silent failure this catches:
 *   1. Agent-to-ontology binding is by concept LABEL, so a typo produces an
 *      agent with no ontology grounding rather than an error.
 *   2. The process-flow compiler does not enforce business invariants, so a
 *      flow can compile with an unreachable node or a condition-less decision.
 *
 *   npx tsx scripts/validate-vitaledge.ts
 */
import { validateJourneyBindings, journeyInventory, VITALEDGE_JOURNEYS } from "../server/vitaledge-journeys";
import { VITALEDGE_ONTOLOGY_CONCEPTS, VITALEDGE_POLICY_DEFS, VITALEDGE_KB_DEFS } from "../server/vitaledge-ontology";
import { validateProcessFlows, VITALEDGE_PROCESS_FLOWS } from "../server/vitaledge-process-flows";
import { auditToolCoverage } from "../server/integrations/vitaledge-dealer/mcp-server";

const inv = journeyInventory();
console.log("VitalEdge / Equipment Dealer vertical inventory");
console.log("──────────────────────────────────────────────");
for (const [k, v] of Object.entries(inv)) console.log(`  ${k.padEnd(18)} ${v}`);
console.log(`  ${"knowledgeBases".padEnd(18)} ${VITALEDGE_KB_DEFS.length}`);
console.log(`  ${"policies".padEnd(18)} ${VITALEDGE_POLICY_DEFS.length}`);

console.log("\nPer-journey:");
for (const j of VITALEDGE_JOURNEYS) {
  const tools = j.mcpServers.reduce((n, s) => n + s.tools.length, 0);
  console.log(`  ${j.id}  ${j.name}`);
  console.log(`        ${j.subVertical}`);
  console.log(`        ${j.agents.length} agents · ${j.skills.length} skills · ${tools} tools · ${j.evalCases.length} eval cases`);
}

console.log("\nProcess flows:");
for (const [id, f] of Object.entries(VITALEDGE_PROCESS_FLOWS)) {
  const gates = f.nodes.filter((n) => n.type === "expert_approval").length;
  const decisions = f.nodes.filter((n) => n.type === "make_decision").length;
  console.log(`  ${id}  ${f.nodes.length} nodes · ${f.edges.length} edges · ${decisions} decisions · ${gates} human approval gates`);
}

// A concept no agent binds to is not an error — it may be reachable through
// relationships in the knowledge graph — but it is worth seeing.
const bound = new Set(VITALEDGE_JOURNEYS.flatMap((j) => j.agents.flatMap((a) => a.ontologyTags)));
const unbound = VITALEDGE_ONTOLOGY_CONCEPTS.filter((c) => !bound.has(c.label)).map((c) => c.label);
if (unbound.length) {
  console.log(`\nConcepts not directly bound by an agent (${unbound.length}):`);
  console.log("  " + unbound.join(", "));
}

let failed = false;

const bindings = validateJourneyBindings();
if (!bindings.ok) {
  failed = true;
  console.log(`\nBINDING VALIDATION FAILED — ${bindings.errors.length} error(s):`);
  for (const e of bindings.errors) console.log("  - " + e);
} else {
  console.log("\nPASS — all journey bindings valid.");
}

const audit = auditToolCoverage();
console.log("\nConnector tool coverage:");
console.log(`  ${audit.declared} declared by journeys · ${audit.implemented} implemented · ${audit.orphanHandlers.length} orphan handler(s)`);
if (!audit.ok) {
  failed = true;
  console.log("\nTOOL COVERAGE FAILED:");
  if (audit.missingHandlers.length) console.log("  no implementation: " + audit.missingHandlers.join(", "));
  if (audit.missingSchemas.length) console.log("  no input schema:   " + audit.missingSchemas.join(", "));
  if (audit.orphanHandlers.length) console.log("  orphan handlers:   " + audit.orphanHandlers.join(", "));
} else {
  console.log("PASS — every declared tool is implemented and schema'd.");
}

const flows = validateProcessFlows();
if (!flows.ok) {
  failed = true;
  console.log(`\nFLOW VALIDATION FAILED — ${flows.errors.length} error(s):`);
  for (const e of flows.errors) console.log("  - " + e);
} else {
  console.log("PASS — all process flows valid.");
}

process.exit(failed ? 1 : 0);
