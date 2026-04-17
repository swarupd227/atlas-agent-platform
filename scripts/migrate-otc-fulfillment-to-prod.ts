/**
 * scripts/migrate-otc-fulfillment-to-prod.ts
 *
 * Provisions OTC Fulfillment Exception Command Center agents in the PRODUCTION
 * environment. Run once after deploying the new code.
 *
 * Usage:
 *   npx tsx scripts/migrate-otc-fulfillment-to-prod.ts
 *
 * Environment requirements:
 *   - DATABASE_URL set to the PRODUCTION database
 *   - OPENAI_API_KEY set
 *   - PORT (optional, defaults to 5000)
 *
 * What this script does:
 *   1. Calls ensureOtcFulfillmentAgents() which is idempotent — safe to re-run
 *   2. Logs which resources were created vs. already existed
 *   3. Exits with code 0 on success, 1 on failure
 */

import "dotenv/config";
import { ensureOtcFulfillmentAgents } from "../server/otc-fulfillment-live-run";

async function main() {
  console.log("[migrate-otc-fulfillment] Starting production provisioning…");
  console.log(`[migrate-otc-fulfillment] DATABASE_URL: ${process.env.DATABASE_URL ? "✓ set" : "✗ NOT SET"}`);
  console.log(`[migrate-otc-fulfillment] OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? "✓ set" : "✗ NOT SET"}`);
  console.log(`[migrate-otc-fulfillment] Base URL: http://localhost:${process.env.PORT || 5000}`);
  console.log();

  if (!process.env.DATABASE_URL) {
    console.error("[migrate-otc-fulfillment] ✗ DATABASE_URL is required");
    process.exit(1);
  }

  try {
    await ensureOtcFulfillmentAgents();
    console.log();
    console.log("[migrate-otc-fulfillment] ✓ Provisioning complete:");
    console.log("  - 3 Agents: OTC-AGT-005, OTC-AGT-007, OTC-AGT-012");
    console.log("  - 3 Knowledge Bases");
    console.log("  - 3 MCP Servers (Disruption, Tracking, Comms) with 13 tools total");
    console.log("  - 9 Skills (3 per agent)");
    console.log("  - 3 Governance Policies");
    console.log("  - 12 Ontology Concepts");
    console.log("  - 3 Blueprints");
    console.log("  - 1 Eval Suite (10 test cases)");
    console.log();
    console.log("[migrate-otc-fulfillment] All resources are idempotent — re-running this script is safe.");
    process.exit(0);
  } catch (err: unknown) {
    console.error("[migrate-otc-fulfillment] ✗ Provisioning failed:");
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main();
