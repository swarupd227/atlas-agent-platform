/**
 * Cross-checks the keys the provisioner sends against the columns that
 * actually exist in shared/schema.ts.
 *
 *   npx tsx scripts/audit-payload-keys.ts
 *
 * Why this exists: createInsertSchema strips unknown keys silently, so a
 * misnamed field is not an error — it is a value that quietly never arrives.
 * That produced four separate live failures (`type` instead of `agentType`,
 * `externalId`, `mcpServerIds` and `knowledgeBaseIds` on agents), each of
 * which only surfaced against the deployed app. This turns that whole class
 * of bug into a local check.
 */
import fs from "fs";
import path from "path";

const SCHEMA = fs.readFileSync(path.resolve("shared/schema.ts"), "utf8");

/** Column names declared for a given `export const <name> = pgTable(...)`. */
function columnsOf(tableConst: string): string[] | null {
  const start = SCHEMA.indexOf(`export const ${tableConst} = pgTable(`);
  if (start < 0) return null;
  // Balance parentheses from the pgTable( call to its close.
  let depth = 0, i = SCHEMA.indexOf("(", start);
  const open = i;
  for (; i < SCHEMA.length; i++) {
    if (SCHEMA[i] === "(") depth++;
    else if (SCHEMA[i] === ")") { depth--; if (depth === 0) break; }
  }
  const body = SCHEMA.slice(open, i);
  const cols = new Set<string>();
  // `  someName: text("some_name")` — the TS property name is what a payload
  // must use, since createInsertSchema keys on the property, not the column.
  for (const m of body.matchAll(/^\s{2}([a-zA-Z][a-zA-Z0-9_]*)\s*:\s*(?:varchar|text|integer|boolean|jsonb|timestamp|real|numeric|serial|date|doublePrecision)\s*\(/gm)) {
    cols.add(m[1]);
  }
  return [...cols];
}

/** What the provisioner POSTs, per endpoint. Keep in sync with provision-pack.ts. */
const PAYLOADS: Array<{ label: string; table: string; keys: string[] }> = [
  {
    label: "POST /api/agents", table: "agents",
    keys: ["name", "description", "agentType", "status", "department", "systemPrompt",
           "complianceTags", "preloadedSkills", "isCuratedJourney", "journeyIndustryId",
           "journeySubVertical", "riskTier", "autonomyMode", "maxToolIterations"],
  },
  {
    label: "POST /api/skills", table: "skills",
    keys: ["name", "description", "industry", "domain", "version", "author", "trustTier",
           "tags", "status", "complexity", "allowedTools", "requiredMcpServers"],
  },
  {
    label: "POST /api/knowledge-bases", table: "knowledgeBases",
    keys: ["name", "description", "industry", "status"],
  },
  // No entry for /api/mcp-servers: the provisioner only READS it now, to find
  // the Dealer Operations connector that register.ts creates on boot.
  {
    label: "POST /api/ontology/concepts/bulk", table: "ontologyConcepts",
    keys: ["id", "industryId", "subVerticals", "ontologyName", "label", "category",
           "description", "properties", "relationships", "tags", "synonyms",
           "industryRelevance", "source"],
  },
];

let problems = 0;
console.log("Payload key audit — provisioner keys vs real columns");
console.log("────────────────────────────────────────────────────");

for (const p of PAYLOADS) {
  const cols = columnsOf(p.table);
  if (!cols) {
    console.log(`\n  ${p.label}\n    ✗ table const "${p.table}" not found in shared/schema.ts`);
    problems++;
    continue;
  }
  const missing = p.keys.filter((k) => !cols.includes(k));
  if (missing.length) {
    problems += missing.length;
    console.log(`\n  ${p.label}  (${p.table})`);
    for (const k of missing) console.log(`    ✗ "${k}" is not a column — it will be stripped silently`);
  } else {
    console.log(`\n  ${p.label}  (${p.table})\n    ✓ all ${p.keys.length} keys map to real columns`);
  }
}

console.log("");
if (problems) {
  console.log(`FAILED — ${problems} key(s) would be silently dropped.`);
  process.exit(1);
}
console.log("PASS — every payload key maps to a real column.");
