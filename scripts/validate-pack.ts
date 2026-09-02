/**
 * Pre-provisioning check for the VitalEdge / Equipment Dealer vertical.
 *
 * Two classes of silent failure this catches:
 *   1. Agent-to-ontology binding is by concept LABEL, so a typo produces an
 *      agent with no ontology grounding rather than an error.
 *   2. The process-flow compiler does not enforce business invariants, so a
 *      flow can compile with an unreachable node or a condition-less decision.
 *
 *   npx tsx scripts/validate-pack.ts
 */
import { validateJourneyBindings, journeyInventory, DEALER_JOURNEYS } from "../packs/equipment-dealer/journeys";
import { DEALER_ONTOLOGY_CONCEPTS, DEALER_POLICY_DEFS, DEALER_KB_DEFS } from "../packs/equipment-dealer/ontology";
import { validateProcessFlows, DEALER_PROCESS_FLOWS } from "../packs/equipment-dealer/process-flows";
import { auditToolCoverage, providesTool } from "../server/integrations/dealer-operations/mcp-server";
import { validateIndustryPacks, INDUSTRY_PACKS } from "../shared/industry-packs";

const inv = journeyInventory();
console.log("VitalEdge / Equipment Dealer vertical inventory");
console.log("──────────────────────────────────────────────");
for (const [k, v] of Object.entries(inv)) console.log(`  ${k.padEnd(18)} ${v}`);
console.log(`  ${"knowledgeBases".padEnd(18)} ${DEALER_KB_DEFS.length}`);
console.log(`  ${"policies".padEnd(18)} ${DEALER_POLICY_DEFS.length}`);

console.log("\nPer-journey:");
for (const j of DEALER_JOURNEYS) {
  const tools = j.mcpServers.reduce((n, s) => n + s.tools.length, 0);
  console.log(`  ${j.id}  ${j.name}`);
  console.log(`        ${j.subVertical}`);
  console.log(`        ${j.agents.length} agents · ${j.skills.length} skills · ${tools} tools · ${j.evalCases.length} eval cases`);
}

console.log("\nProcess flows:");
for (const [id, f] of Object.entries(DEALER_PROCESS_FLOWS)) {
  const gates = f.nodes.filter((n) => n.type === "expert_approval").length;
  const decisions = f.nodes.filter((n) => n.type === "make_decision").length;
  console.log(`  ${id}  ${f.nodes.length} nodes · ${f.edges.length} edges · ${decisions} decisions · ${gates} human approval gates`);
}

// A concept no agent binds to is not an error — it may be reachable through
// relationships in the knowledge graph — but it is worth seeing.
const bound = new Set(DEALER_JOURNEYS.flatMap((j) => j.agents.flatMap((a) => a.ontologyTags)));
const unbound = DEALER_ONTOLOGY_CONCEPTS.filter((c) => !bound.has(c.label)).map((c) => c.label);
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

// Two directions, deliberately separate.
// 1. The connector is internally consistent — its own concern, no pack involved.
const audit = auditToolCoverage();
console.log("\nDealer Operations connector (platform):");
console.log(`  ${audit.declared} tools declared · ${audit.implemented} implemented · ${audit.orphanHandlers.length} orphan handler(s)`);
if (!audit.ok) {
  failed = true;
  console.log("  CONNECTOR INCONSISTENT:");
  if (audit.missingHandlers.length) console.log("    no implementation: " + audit.missingHandlers.join(", "));
  if (audit.orphanHandlers.length) console.log("    orphan handlers:   " + audit.orphanHandlers.join(", "));
} else {
  console.log("  PASS — declared contract matches implementations.");
}

// 2. Every tool THIS PACK references is provided by the connector. The pack
//    depends on the platform; the platform never depends on the pack.
const referenced = new Set<string>();
for (const j of DEALER_JOURNEYS) for (const s of j.mcpServers) for (const t of s.tools) referenced.add(t.name);
const unprovided = Array.from(referenced).filter((n) => !providesTool(n));
console.log(`\nPack → connector: ${referenced.size} tools referenced by journeys`);
if (unprovided.length) {
  failed = true;
  console.log("  PACK REFERENCES TOOLS THE CONNECTOR DOES NOT PROVIDE:");
  console.log("    " + unprovided.join(", "));
} else {
  console.log("  PASS — every referenced tool exists in the connector.");
}

// 3. Industry packs are internally consistent. An eval framework whose id
//    disagrees with its pack binds to nothing at runtime, silently.
const packs = validateIndustryPacks();
console.log(`\nIndustry packs: ${INDUSTRY_PACKS.length} registered (${INDUSTRY_PACKS.map((p) => p.id).join(", ")})`);
if (!packs.ok) {
  failed = true;
  console.log("  INDUSTRY PACK VALIDATION FAILED:");
  for (const e of packs.errors) console.log("    - " + e);
} else {
  console.log("  PASS — industry packs internally consistent.");
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
