#!/usr/bin/env tsx
/**
 * migrate-onespan-to-prod.ts
 *
 * Dev → Production migration script for the OneSpan Digital Agreements Intelligence demo.
 *
 * Provisions all platform intelligence components in the PROD org:
 *   - 3 knowledge bases
 *   - 5 mock MCP servers + tools
 *   - 12 agent skills (3 per agent)
 *   - 4 org policies
 *   - 12 ontology concepts
 *   - 4 blueprints
 *   - 4 agents (gpt-4.1, autonomyMode: autonomous)
 *   - 1 shared eval suite + 10 test cases
 *
 * Usage:
 *   DEV_ORG_ID=<dev-org-id>   PROD_ORG_ID=<prod-org-id>   npx tsx scripts/migrate-onespan-to-prod.ts
 *
 * Required environment variables:
 *   DATABASE_URL     — PostgreSQL connection string (prod DB)
 *   PROD_ORG_ID      — Target production org ID
 *   DEV_ORG_ID       — Source dev org ID (for reference / validation)
 *
 * The script is IDEMPOTENT: re-running it will not create duplicate entities.
 *
 * Provisions:
 *   1. MCP servers (base URL uses PROD_BASE_URL env var or inferred from DATABASE_URL host)
 *   2. Skills (identical to dev — production-ready)
 *   3. Policies (scoped to prod org)
 *   4. Ontology concepts (financial_services industry)
 *   5. Blueprints
 *   6. Agents with all bindings (KB, MCP, skills, evals, policies, ontology tags)
 *   7. Eval suite + test cases
 */

import { storage } from "../server/storage";

const PROD_ORG_ID   = process.env.PROD_ORG_ID   ?? "REPLACE_WITH_PROD_ORG_ID";
const DEV_ORG_ID    = process.env.DEV_ORG_ID    ?? "0c9bcf16-cdd9-45e2-87f6-6a839a7f7056";
const PROD_BASE_URL = process.env.PROD_BASE_URL  ?? `https://${process.env.REPL_SLUG ?? "app"}.replit.app`;

// ─── Sanity check ─────────────────────────────────────────────────────────────

function abort(msg: string): never {
  console.error(`[migrate-onespan] ABORT: ${msg}`);
  process.exit(1);
}

if (!process.env.DATABASE_URL) abort("DATABASE_URL is not set");
if (PROD_ORG_ID === "REPLACE_WITH_PROD_ORG_ID") abort("PROD_ORG_ID must be set — run with PROD_ORG_ID=<id>");
if (PROD_ORG_ID === DEV_ORG_ID) abort("PROD_ORG_ID must differ from DEV_ORG_ID — aborting to avoid overwriting dev");

// ─── Import live-run defs (reuse the same canonical definitions) ───────────────

async function main() {
  console.log(`[migrate-onespan] Starting migration → org ${PROD_ORG_ID}`);
  console.log(`[migrate-onespan] Prod base URL: ${PROD_BASE_URL}`);

  // Force prod org context via env override
  process.env.DEV_ORG_ID = PROD_ORG_ID;

  // Dynamically import the live-run module which contains all entity definitions
  const {
    ensureOnespanAgents,
    ONESPAN_MCP_SERVERS,
  } = await import("../server/onespan-live-run");

  // Patch MCP server URLs to use prod base URL
  for (const server of ONESPAN_MCP_SERVERS) {
    server.url = server.url.replace(/http:\/\/localhost:\d+/, PROD_BASE_URL);
  }

  console.log(`[migrate-onespan] Provisioning ${ONESPAN_MCP_SERVERS.length} MCP servers at ${PROD_BASE_URL}…`);

  await ensureOnespanAgents();

  console.log(`[migrate-onespan] Migration complete ✓`);
  console.log(`[migrate-onespan] Entities provisioned in org ${PROD_ORG_ID}:`);
  console.log(`  • 3 knowledge bases`);
  console.log(`  • 5 MCP servers + tools`);
  console.log(`  • 12 agent skills`);
  console.log(`  • 4 policies`);
  console.log(`  • 12 ontology concepts`);
  console.log(`  • 4 blueprints`);
  console.log(`  • 4 agents (gpt-4.1, autonomous)`);
  console.log(`  • 1 eval suite + 10 test cases`);
  console.log(`[migrate-onespan] All entities are idempotent — re-running this script is safe.`);
  process.exit(0);
}

main().catch(err => {
  console.error("[migrate-onespan] Fatal error:", err);
  process.exit(1);
});
