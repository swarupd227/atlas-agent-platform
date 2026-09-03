/**
 * Dealer Operations — a real enterprise connector for equipment dealerships.
 *
 * Registered alongside Salesforce, SAP and the SQL connectors in
 * server/integrations/register.ts — deliberately NOT in server/mock-mcp/.
 * Every tool executes real SQL against the dealer's operational database; the
 * action tools really mutate the ledger and really refuse when a governance
 * gate fails.
 *
 * Client-independent by construction: this connector knows nothing about any
 * particular customer, demo, or journey pack. Its tool contract lives in
 * catalog.ts and is its own. Journey packs reference these tools by name;
 * nothing here imports a pack.
 *
 * Mounted at /api/integrations/dealer-operations
 */
import { Router, type Request, type Response } from "express";
import { RealMcpBase, type McpToolResult, type RealMcpToolDef } from "../../real-mcp-base";
import { getOrgId, getDefaultOrgId } from "../../auth";
import { createMcpProtocolRouter } from "../../real-mcp-transport";
import { mcpToolCallRateLimiter } from "../../rate-limits";
import { DealerClient, type DealerCredentials } from "./client";
import { TOOL_CATALOG, TOOL_NAMES } from "./catalog";
import { err } from "./tools-cash";
import * as cash from "./tools-cash";
import * as coll from "./tools-collections";
import * as warr from "./tools-warranty";
import * as rent from "./tools-rental";
import * as wg from "./tools-wholegoods";

type Handler = (c: DealerClient, args: Record<string, unknown>) => Promise<McpToolResult>;

/** name → implementation. Must cover every tool declared in catalog.ts. */
const HANDLERS: Record<string, Handler> = {
  // Receivables
  get_payment_batch: cash.get_payment_batch,
  get_remittance_document: cash.get_remittance_document,
  extract_remittance_intent: cash.extract_remittance_intent,
  resolve_payer_to_account: cash.resolve_payer_to_account,
  get_open_ar: cash.get_open_ar,
  get_contract_terms: cash.get_contract_terms,
  propose_allocation: cash.propose_allocation,
  classify_shortfall: cash.classify_shortfall,
  check_posting_period: cash.check_posting_period,
  post_allocation: cash.post_allocation,
  route_to_research_queue: cash.route_to_research_queue,
  get_ar_impact: cash.get_ar_impact,

  // Collections & credit risk
  get_aged_portfolio: coll.get_aged_portfolio,
  get_dispute_registry: coll.get_dispute_registry,
  get_payment_behaviour: coll.get_payment_behaviour,
  get_account_relationship: coll.get_account_relationship,
  get_invoice_detail: coll.get_invoice_detail,
  draft_outreach: coll.draft_outreach,
  prepare_payment_plan: coll.prepare_payment_plan,
  prepare_credit_memo: coll.prepare_credit_memo,
  evaluate_credit_hold: coll.evaluate_credit_hold,
  apply_credit_hold: coll.apply_credit_hold,
  escalate_to_credit_manager: coll.escalate_to_credit_manager,

  // Service & warranty
  get_completed_work_orders: warr.get_completed_work_orders,
  resolve_asset: warr.resolve_asset,
  get_oem_program_terms: warr.get_oem_program_terms,
  get_asset_service_history: warr.get_asset_service_history,
  get_labour_standard: warr.get_labour_standard,
  assemble_claim: warr.assemble_claim,
  run_compliance_gate: warr.run_compliance_gate,
  submit_claim: warr.submit_claim,
  route_to_goodwill_review: warr.route_to_goodwill_review,
  get_claim_status: warr.get_claim_status,
  analyze_denial: warr.analyze_denial,
  post_warranty_receivable: warr.post_warranty_receivable,

  // Rental
  get_billing_cycle_queue: rent.get_billing_cycle_queue,
  get_rental_contract_terms: rent.get_rental_contract_terms,
  get_telematics_utilisation: rent.get_telematics_utilisation,
  get_off_rent_request: rent.get_off_rent_request,
  get_condition_report: rent.get_condition_report,
  calculate_cycle_invoice: rent.calculate_cycle_invoice,
  reconcile_billed_vs_actual: rent.reconcile_billed_vs_actual,
  verify_off_rent_date: rent.verify_off_rent_date,
  prepare_billing_adjustment: rent.prepare_billing_adjustment,
  flag_asc842_review: rent.flag_asc842_review,
  release_invoice: rent.release_invoice,

  // Whole-goods deal desk
  get_pending_deals: wg.get_pending_deals,
  get_true_landed_cost: wg.get_true_landed_cost,
  get_trade_in_assessment: wg.get_trade_in_assessment,
  get_auction_comparables: wg.get_auction_comparables,
  get_customer_lifetime_value: wg.get_customer_lifetime_value,
  identify_eligible_programs: wg.identify_eligible_programs,
  check_program_stacking: wg.check_program_stacking,
  calculate_true_margin: wg.calculate_true_margin,
  determine_approval_authority: wg.determine_approval_authority,
  prepare_deal_summary: wg.prepare_deal_summary,
  flag_multi_obligation_split: wg.flag_multi_obligation_split,
};

/**
 * Self-consistency check: the declared contract and the implementations must
 * agree. A journey pack's own validator separately checks that the tools IT
 * references exist here — that direction of the check belongs to the pack, not
 * to the platform.
 */
export function auditToolCoverage(): {
  ok: boolean; declared: number; implemented: number;
  missingHandlers: string[]; orphanHandlers: string[];
} {
  const declared = new Set(TOOL_NAMES);
  const missingHandlers = TOOL_NAMES.filter((n) => !HANDLERS[n]);
  const orphanHandlers = Object.keys(HANDLERS).filter((n) => !declared.has(n));
  return {
    ok: missingHandlers.length === 0 && orphanHandlers.length === 0,
    declared: declared.size,
    implemented: Object.keys(HANDLERS).length,
    missingHandlers,
    orphanHandlers,
  };
}

/** True when `name` is a tool this connector provides. Used by pack validators. */
export function providesTool(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(HANDLERS, name);
}

export class DealerOperationsMcpServer extends RealMcpBase {
  readonly integrationId = "dealer-operations";
  readonly tools: RealMcpToolDef[] = TOOL_CATALOG;

  async handleTool(
    toolName: string,
    args: Record<string, unknown>,
    credentials: Record<string, string>,
    _orgId: string
  ): Promise<McpToolResult> {
    const handler = HANDLERS[toolName];
    if (!handler) return err(`Unknown Dealer Operations tool: ${toolName}`);
    if (!credentials?.host || !credentials?.database) {
      return err("Dealer Operations is not connected. Configure the connection (host, database, user, password) under Integrations.");
    }
    const client = new DealerClient(credentials as unknown as DealerCredentials);
    try {
      return await handler(client, args ?? {});
    } catch (e: any) {
      return err(`${toolName} failed: ${e?.message ?? String(e)}`);
    } finally {
      await client.close().catch(() => {});
    }
  }
}

export const dealerOperationsMcpServer = new DealerOperationsMcpServer();

export function createDealerOperationsRouter(): Router {
  const router = Router();

  // NOT "/health": the platform mounts a generic /api/integrations/:id/health
  // ahead of this router, so a /health here is shadowed and never reached.
  // That generic route reports connection status and call metrics, which is
  // what the Integrations UI reads for every connector. This endpoint answers
  // a different question — does the declared tool contract match what is
  // actually implemented — so it gets its own path rather than fighting for
  // that one.
  router.get("/contract", (_req: Request, res: Response) => {
    const audit = auditToolCoverage();
    res.json({
      status: audit.ok ? "ok" : "degraded",
      integration: "dealer-operations",
      tools: dealerOperationsMcpServer.tools.length,
      audit,
    });
  });

  router.get("/tools", (_req: Request, res: Response) => {
    res.json({ tools: dealerOperationsMcpServer.tools });
  });

  router.post("/tools/:toolName", async (req: Request, res: Response) => {
    const orgId = String(getOrgId(req) ?? getDefaultOrgId() ?? "");
    const args = (req.body?.args ?? req.body) as Record<string, unknown>;
    const result = await dealerOperationsMcpServer.callTool(String(req.params.toolName), args, orgId);
    res.json(result);
  });

  router.post("/connection-test", async (req: Request, res: Response) => {
    const orgId = String(getOrgId(req) ?? getDefaultOrgId() ?? "");
    const credentials = await dealerOperationsMcpServer.getCredentials(orgId);
    if (!credentials?.host) {
      return res.json({ connected: false, error: "No credentials configured. Provide host, database, user and password." });
    }
    const client = new DealerClient(credentials as unknown as DealerCredentials);
    try {
      const rows = await client.q(
        `SELECT (SELECT COUNT(*) FROM dealer.invoices)     AS invoices,
                (SELECT COUNT(*) FROM dealer.fleet_assets) AS fleet_assets,
                (SELECT COUNT(*) FROM dealer.payments)     AS payments`
      );
      res.json({ connected: true, integration: "dealer-operations", schema: client.schema, row_counts: rows[0] });
    } catch (e: any) {
      res.json({ connected: false, error: e?.message ?? "Connection test failed" });
    } finally {
      await client.close().catch(() => {});
    }
  });

  // The real MCP protocol endpoint, /api/integrations/dealer-operations/mcp.
  // This is how AGENTS reach these tools — the routes above are for operators
  // and scripts holding a session cookie. Without it an agent's tool call POSTs
  // to a path that has no MCP endpoint and is not covered by
  // MCP_BEARER_PATH_RE (server/auth.ts), so it is rejected with
  // "Authentication required": the MCP handshake never completes, the server
  // stays status "registered" / health "unknown", and every tool call fails.
  // Same mount as every other enterprise connector (see integrations/sql).
  router.use(mcpToolCallRateLimiter, createMcpProtocolRouter(dealerOperationsMcpServer, "dealer-operations"));

  return router;
}
