/**
 * Seed <-> eval consistency gate for the Summit Equipment Group dataset.
 *
 *   npx tsx scripts/validate-pack-dataset.ts
 *
 * Run this after editing either the seed or any eval case. It is the only
 * thing standing between "our evals test the agent" and "our evals agree with
 * whatever we happened to seed".
 */
import { validateSeedConsistency } from "../packs/equipment-dealer/dataset/consistency";
import { seedInventory } from "../packs/equipment-dealer/dataset/seed";

const inv = seedInventory();
const total = Object.values(inv).reduce((a, b) => a + b, 0);

console.log("Summit Equipment Group — seed dataset");
console.log("─────────────────────────────────────");
for (const [k, v] of Object.entries(inv)) console.log(`  ${k.padEnd(22)} ${String(v).padStart(5)}`);
console.log(`  ${"TOTAL ROWS".padEnd(22)} ${String(total).padStart(5)}`);

const r = validateSeedConsistency();
console.log(`\n${r.checks} consistency checks run.`);
if (!r.ok) {
  console.log(`\nFAILED — ${r.errors.length} inconsistenc${r.errors.length === 1 ? "y" : "ies"}:`);
  for (const e of r.errors) console.log("  - " + e);
  process.exit(1);
}
console.log("PASS — seed data satisfies every eval-case assertion.");
