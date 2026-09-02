/**
 * VitalEdge Dealer Operations — a real enterprise connector.
 *
 * Registered alongside Salesforce, SAP and the SQL connectors in
 * server/integrations/register.ts — deliberately NOT in server/mock-mcp/.
 * Every tool executes real SQL against the `summit` schema; the action tools
 * really mutate the ledger and really refuse when a governance gate fails.
 *
 * The tool LIST is derived from the journey definitions rather than restated
 * here, so a tool the journeys advertise but nobody implemented is a startup
 * error instead of a runtime surprise in front of an audience.
 *
 * Mounted at /api/integrations/vitaledge-dealer
 */
import { Router, type Request, type Response } from "express";
import { RealMcpBase, type McpToolResult, type RealMcpToolDef } from "../../real-mcp-base";
import { getOrgId, getDefaultOrgId } from "../../auth";
import { DealerClient, type DealerCredentials } from "./client";
import { VITALEDGE_JOURNEYS } from "../../vitaledge-journeys";
import { ok, err } from "./tools-cash";
import * as cash from "./tools-cash";
import * as coll from "./tools-collections";
import * as warr from "./tools-warranty";
import * as rent from "./tools-rental";
import * as wg from "./tools-wholegoods";

type Handler = (c: DealerClient, args: Record<string, unknown>) => Promise<McpToolResult>;

/** name → implementation. Must cover every tool the journeys declare. */
const HANDLERS: Record<string, Handler> = {
  // VE-J1 — Invoice-to-Cash
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

  // VE-J2 — Collections & Credit Risk
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

  // VE-J3 — Warranty
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

  // VE-J4 — Rental
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

  // VE-J5 — Whole-goods
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

const S = (props: Record<string, string>, required: string[] = []) => ({
  type: "object",
  properties: Object.fromEntries(Object.entries(props).map(([k, d]) => [k, { type: k.endsWith("_usd") || k.endsWith("_hours") || k === "confidence" || k === "instalments" || k === "min_days_past_due" ? "number" : k === "allocation" || k === "candidates" || k === "invoice_ids" ? "array" : k === "programs_captured" ? "boolean" : "string", description: d }])),
  ...(required.length ? { required } : {}),
});

/** Input schemas, keyed by tool name. */
const SCHEMAS: Record<string, Record<string, unknown>> = {
  get_payment_batch: S({ received_on: "ISO date; omit for all unapplied payments" }),
  get_remittance_document: S({ payment_id: "Payment id" }, ["payment_id"]),
  extract_remittance_intent: S({ payment_id: "Payment id", text: "Optional override text; omitted means extract from the stored document" }, ["payment_id"]),
  resolve_payer_to_account: S({ payer_string: "Payer name exactly as it appears on the payment" }, ["payer_string"]),
  get_open_ar: S({ account_id: "Master customer account id" }, ["account_id"]),
  get_contract_terms: S({ account_id: "Master customer account id" }, ["account_id"]),
  propose_allocation: S({ payment_id: "Payment id", account_id: "Resolved master account id" }, ["payment_id", "account_id"]),
  classify_shortfall: S({ invoice_id: "Invoice id", paid_amount_usd: "Amount actually paid against this invoice" }, ["invoice_id", "paid_amount_usd"]),
  check_posting_period: S({ invoice_ids: "Invoice ids to check", invoice_id: "Single invoice id" }),
  post_allocation: S({ payment_id: "Payment id", allocation: "[{invoice_id, amount_usd}]", confidence: "Allocation confidence 0-1", source_document: "Linked source document reference (required)", approver: "Human approver id when below the auto-post floor", agent_id: "Calling agent external id" }, ["payment_id", "allocation", "confidence", "source_document"]),
  route_to_research_queue: S({ payment_id: "Payment id", reason_code: "Why confidence fell short", ambiguity: "Plain statement of what could not be determined", candidates: "Ranked candidate allocations", confidence: "Confidence achieved", residual_usd: "Unallocated residual", agent_id: "Calling agent external id" }, ["payment_id", "ambiguity"]),
  get_ar_impact: S({}),

  get_aged_portfolio: S({ min_days_past_due: "Minimum days past due (default 1)" }),
  get_dispute_registry: S({ account_id: "Account id; omit for all accounts" }),
  get_payment_behaviour: S({ account_id: "Account id" }, ["account_id"]),
  get_account_relationship: S({ account_id: "Account id" }, ["account_id"]),
  get_invoice_detail: S({ invoice_id: "Invoice id" }, ["invoice_id"]),
  draft_outreach: S({ account_id: "Account id", ageing_tier: "reminder_30 | firm_60 | final_90 | dispute_ack", finding: "Dispute finding text for dispute_ack", custom_text: "Free-form text (will be refused)" }, ["account_id"]),
  prepare_payment_plan: S({ account_id: "Account id", instalments: "Number of instalments (2-12)" }, ["account_id"]),
  prepare_credit_memo: S({ account_id: "Account id", amount_usd: "Credit amount", reason: "Why the credit is warranted", contract_clause: "Clause or policy relied on", calculation: "Shown arithmetic", invoice_id: "Invoice id", dispute_id: "Dispute id", agent_id: "Calling agent external id" }, ["account_id", "amount_usd", "reason"]),
  evaluate_credit_hold: S({ account_id: "Account id" }, ["account_id"]),
  apply_credit_hold: S({ account_id: "Account id", justification: "Documented ageing evidence", approver: "Named human approver (mandatory for non-standard tiers)", agent_id: "Calling agent external id" }, ["account_id", "justification"]),
  escalate_to_credit_manager: S({ account_id: "Account id", decision_requested: "The specific decision being asked for" }, ["account_id", "decision_requested"]),

  get_completed_work_orders: S({ branch_id: "Branch filter; omit for all" }),
  resolve_asset: S({ serial_number: "Serial or PIN", manufacturer: "Corroborating make", model: "Corroborating model", meter_hours: "Corroborating meter reading" }, ["serial_number"]),
  get_oem_program_terms: S({ program_code: "Program code; omit for all programs" }),
  get_asset_service_history: S({ unit_id: "Fleet asset id" }, ["unit_id"]),
  get_labour_standard: S({ manufacturer: "Make", model: "Model", repair_code: "Repair operation code" }, ["manufacturer", "model", "repair_code"]),
  assemble_claim: S({ work_order_id: "Work order id" }, ["work_order_id"]),
  run_compliance_gate: S({ claim_id: "Claim id" }, ["claim_id"]),
  submit_claim: S({ claim_id: "Claim id" }, ["claim_id"]),
  route_to_goodwill_review: S({ claim_id: "Claim id", reason: "Failing condition" }, ["claim_id"]),
  get_claim_status: S({ claim_id: "Claim id; omit for all submitted claims" }),
  analyze_denial: S({ claim_id: "Claim id" }, ["claim_id"]),
  post_warranty_receivable: S({ claim_id: "Claim id", agent_id: "Calling agent external id" }, ["claim_id"]),

  get_billing_cycle_queue: S({ branch_id: "Branch filter; omit for all" }),
  get_rental_contract_terms: S({ contract_id: "Rental contract id" }, ["contract_id"]),
  get_telematics_utilisation: S({ unit_id: "Fleet asset id", from_date: "ISO date", to_date: "ISO date (default today)" }, ["unit_id", "from_date"]),
  get_off_rent_request: S({ contract_id: "Rental contract id" }, ["contract_id"]),
  get_condition_report: S({ contract_id: "Rental contract id" }, ["contract_id"]),
  calculate_cycle_invoice: S({ contract_id: "Rental contract id", from_date: "Period start", to_date: "Period end" }, ["contract_id"]),
  reconcile_billed_vs_actual: S({ contract_id: "Rental contract id", billed_amount_usd: "What was actually billed", billed_rate_usd: "Rate actually applied", from_date: "Period start", to_date: "Period end" }, ["contract_id"]),
  verify_off_rent_date: S({ contract_id: "Rental contract id" }, ["contract_id"]),
  prepare_billing_adjustment: S({ contract_id: "Rental contract id", amount_usd: "Adjustment value", direction: "credit_customer | bill_customer", evidence: "Contract term or telematics reading relied on" }, ["contract_id", "amount_usd", "direction", "evidence"]),
  flag_asc842_review: S({ contract_id: "Rental contract id" }, ["contract_id"]),
  release_invoice: S({ contract_id: "Rental contract id", asc842_cleared_by: "Controller who cleared classification", gap_reviewed_by: "Human who decided the telematics gap" }, ["contract_id"]),

  get_pending_deals: S({ branch_id: "Branch filter; omit for all" }),
  get_true_landed_cost: S({ unit_id: "Fleet asset id", deal_id: "Deal id (resolves the unit)" }),
  get_trade_in_assessment: S({ deal_id: "Deal id" }, ["deal_id"]),
  get_auction_comparables: S({ manufacturer: "Make", model: "Model" }, ["manufacturer", "model"]),
  get_customer_lifetime_value: S({ account_id: "Account id" }, ["account_id"]),
  identify_eligible_programs: S({ deal_id: "Deal id" }, ["deal_id"]),
  check_program_stacking: S({ deal_id: "Deal id" }, ["deal_id"]),
  calculate_true_margin: S({ deal_id: "Deal id", programs_captured: "Must be true — capture before judging margin", captured_program_value_usd: "Capturable program value from check_program_stacking" }, ["deal_id"]),
  determine_approval_authority: S({ deal_id: "Deal id" }, ["deal_id"]),
  prepare_deal_summary: S({ deal_id: "Deal id" }, ["deal_id"]),
  flag_multi_obligation_split: S({ deal_id: "Deal id" }, ["deal_id"]),
};

/** Tool defs derived from the journey definitions — the single source of truth. */
function buildToolDefs(): RealMcpToolDef[] {
  const seen = new Set<string>();
  const defs: RealMcpToolDef[] = [];
  for (const j of VITALEDGE_JOURNEYS) {
    for (const server of j.mcpServers) {
      for (const t of server.tools) {
        if (seen.has(t.name)) continue;
        seen.add(t.name);
        defs.push({
          name: t.name,
          description: t.description,
          inputSchema: SCHEMAS[t.name] ?? { type: "object", properties: {} },
        });
      }
    }
  }
  return defs;
}

/** Declared-vs-implemented drift check. Called at registration and by the validator. */
export function auditToolCoverage(): { ok: boolean; declared: number; implemented: number; missingHandlers: string[]; missingSchemas: string[]; orphanHandlers: string[] } {
  const declared = new Set<string>();
  for (const j of VITALEDGE_JOURNEYS) for (const s of j.mcpServers) for (const t of s.tools) declared.add(t.name);
  const missingHandlers = Array.from(declared).filter((n) => !HANDLERS[n]);
  const missingSchemas = Array.from(declared).filter((n) => !SCHEMAS[n]);
  const orphanHandlers = Object.keys(HANDLERS).filter((n) => !declared.has(n));
  return {
    ok: missingHandlers.length === 0 && missingSchemas.length === 0 && orphanHandlers.length === 0,
    declared: declared.size, implemented: Object.keys(HANDLERS).length,
    missingHandlers, missingSchemas, orphanHandlers,
  };
}

export class VitalEdgeDealerMcpServer extends RealMcpBase {
  readonly integrationId = "vitaledge-dealer";
  readonly tools: RealMcpToolDef[] = buildToolDefs();

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

export const vitalEdgeDealerMcpServer = new VitalEdgeDealerMcpServer();

export function createVitalEdgeDealerRouter(): Router {
  const router = Router();

  router.get("/health", (_req: Request, res: Response) => {
    const audit = auditToolCoverage();
    res.json({ status: audit.ok ? "ok" : "degraded", integration: "vitaledge-dealer", tools: vitalEdgeDealerMcpServer.tools.length, audit });
  });

  router.get("/tools", (_req: Request, res: Response) => {
    res.json({ tools: vitalEdgeDealerMcpServer.tools });
  });

  router.post("/tools/:toolName", async (req: Request, res: Response) => {
    const orgId = String(getOrgId(req) ?? getDefaultOrgId() ?? "");
    const args = (req.body?.args ?? req.body) as Record<string, unknown>;
    const result = await vitalEdgeDealerMcpServer.callTool(String(req.params.toolName), args, orgId);
    res.json(result);
  });

  router.post("/connection-test", async (req: Request, res: Response) => {
    const orgId = String(getOrgId(req) ?? getDefaultOrgId() ?? "");
    const credentials = await vitalEdgeDealerMcpServer.getCredentials(orgId);
    if (!credentials?.host) {
      return res.json({ connected: false, error: "No credentials configured. Provide host, database, user and password." });
    }
    const client = new DealerClient(credentials as unknown as DealerCredentials);
    try {
      const rows = await client.q(
        `SELECT (SELECT COUNT(*) FROM summit.invoices)   AS invoices,
                (SELECT COUNT(*) FROM summit.fleet_assets) AS fleet_assets,
                (SELECT COUNT(*) FROM summit.payments)   AS payments`
      );
      res.json({ connected: true, integration: "vitaledge-dealer", schema: client.schema, row_counts: rows[0] });
    } catch (e: any) {
      res.json({ connected: false, error: e?.message ?? "Connection test failed" });
    } finally {
      await client.close().catch(() => {});
    }
  });

  return router;
}
