/**
 * Dealer Operations — the connector's own tool contract.
 *
 * This is deliberately self-contained. An earlier version derived the tool list
 * from a demo journey pack, which meant platform code could not compile without
 * demo content and tool descriptions quoted one tenant's invoice numbers.
 *
 * Descriptions here describe CAPABILITY, never a particular dataset: they must
 * read correctly for any equipment dealership this connector is pointed at.
 * Journey packs reference these tools by name; nothing here references a pack.
 */
import type { RealMcpToolDef } from "../../real-mcp-base";

type Field = { type: "string" | "number" | "boolean" | "array" | "object"; description: string };

function schema(props: Record<string, Field>, required: string[] = []): Record<string, unknown> {
  return { type: "object", properties: props, ...(required.length ? { required } : {}) };
}
const str = (description: string): Field => ({ type: "string", description });
const num = (description: string): Field => ({ type: "number", description });
const bool = (description: string): Field => ({ type: "boolean", description });
const arr = (description: string): Field => ({ type: "array", description });

const AGENT_ID = str("Calling agent's external id, recorded on the audit trail");

export const TOOL_CATALOG: RealMcpToolDef[] = [
  // ── Receivables: intake and understanding ─────────────────────────────────
  {
    name: "get_payment_batch",
    description:
      "List customer receipts awaiting application, across every channel (ACH, cheque, lockbox, card, wire). Returns per-payment channel, amount, the payer string exactly as it appears on the payment, receiving branch, and whether any remittance advice accompanied it, plus channel totals and a count of payments arriving with no advice at all.",
    inputSchema: schema({ received_on: str("ISO date to filter on; omit for all unapplied and in-research payments") }),
  },
  {
    name: "get_remittance_document",
    description:
      "Retrieve the remittance advice for a payment in the form the customer actually sent it — scanned PDF, email body, or none. PDFs are parsed at call time and returned as extracted text. Reports explicitly when no advice exists, which means allocation must be inferred rather than read.",
    inputSchema: schema({ payment_id: str("Payment identifier") }, ["payment_id"]),
  },
  {
    name: "extract_remittance_intent",
    description:
      "Parse invoice references and per-invoice amounts out of remittance text and score how much of the payment those lines actually account for. Returns a completeness score and the unaccounted residual so a partial parse is never mistaken for a complete one. Also flags deduction language such as freight, short-pay or discount claims.",
    inputSchema: schema({
      payment_id: str("Payment identifier"),
      text: str("Optional override text; when omitted the stored document is parsed"),
    }, ["payment_id"]),
  },
  {
    name: "resolve_payer_to_account",
    description:
      "Resolve the payer string on a payment to a master customer account. Handles the cases that dominate dealer receivables: trading names that differ from the legal entity, parents paying for subsidiaries, third-party lenders paying on a customer's behalf, and names truncated by the banking channel. Returns multiple candidates rather than guessing when the match is ambiguous.",
    inputSchema: schema({ payer_string: str("Payer name exactly as it appears on the payment") }, ["payer_string"]),
  },
  {
    name: "get_open_ar",
    description:
      "Return a customer's open receivables across every branch and revenue line (parts, service, rental, whole-goods), with balance, due date, originating branch, and whether each invoice is under active dispute. Includes a per-branch breakdown, since one customer's balance routinely spans several branch ledgers.",
    inputSchema: schema({ account_id: str("Master customer account identifier") }, ["account_id"]),
  },
  {
    name: "get_contract_terms",
    description:
      "Return an account's commercial terms: payment terms, settlement discount percentage and window, freight absorption threshold, credit limit, account tier and current credit status. These are the terms against which a payment shortfall is judged a legitimate discount or an unstated dispute.",
    inputSchema: schema({ account_id: str("Master customer account identifier") }, ["account_id"]),
  },

  // ── Receivables: matching and posting ─────────────────────────────────────
  {
    name: "propose_allocation",
    description:
      "Propose how a payment should be applied across a customer's open invoices, using remittance intent where supplied and amount/reference matching where not. Returns per-invoice amounts, the split by originating branch, an honest confidence score, the unallocated residual, and a posting recommendation. Records which actor produced the proposal. This tool proposes only and holds no posting authority.",
    inputSchema: schema({
      payment_id: str("Payment identifier"),
      account_id: str("Resolved master account identifier"),
      agent_id: str("Proposing actor's id, carried through so posting can enforce segregation of duties"),
    }, ["payment_id", "account_id", "agent_id"]),
  },
  {
    name: "classify_shortfall",
    description:
      "Classify why a payment fell short of an invoice by comparing the variance against the invoice's own lines and the account's contract terms. Distinguishes a contractual settlement discount from an unstated dispute — a variance matching a freight or fee line exactly is treated as a dispute, with the governing clause cited, not as a discount.",
    inputSchema: schema({
      invoice_id: str("Invoice identifier"),
      paid_amount_usd: num("Amount actually paid against this invoice"),
    }, ["invoice_id", "paid_amount_usd"]),
  },
  {
    name: "check_posting_period",
    description:
      "Confirm the target accounting period is open and that applying the payment would not recognise revenue across a period boundary. Compares each invoice's obligation-satisfied date against the current period and reports any ASC 606 cutoff concern for accounting review.",
    inputSchema: schema({
      invoice_ids: arr("Invoice identifiers to check"),
      invoice_id: str("Single invoice identifier, as an alternative to invoice_ids"),
    }),
  },
  {
    name: "post_allocation",
    description:
      "Post an approved allocation to the branch ledgers, splitting each line to its originating branch and attaching the source document to every journal entry. Enforces segregation of duties (the actor that proposed an allocation may not post it), the auto-post confidence floor, the source-document requirement, and the residual write-off ceiling — refusing, with the reason, when any gate is not satisfied.",
    inputSchema: schema({
      payment_id: str("Payment identifier"),
      allocation: arr("Array of { invoice_id, amount_usd }"),
      confidence: num("Allocation confidence between 0 and 1"),
      source_document: str("Reference to the document justifying the posting (required)"),
      proposed_by_agent: str("Actor that produced the allocation, from propose_allocation (required)"),
      agent_id: str("Posting actor's id (required, and must differ from proposed_by_agent)"),
      approver: str("Human approver id, required when confidence is below the auto-post floor"),
    }, ["payment_id", "allocation", "confidence", "source_document", "proposed_by_agent", "agent_id"]),
  },
  {
    name: "route_to_research_queue",
    description:
      "Route a payment that cannot be confidently allocated to human research, carrying the parsed remittance, ranked candidate allocations with the reason each fell short, and a plain statement of what could not be determined — so the researcher's first action is a decision rather than a lookup.",
    inputSchema: schema({
      payment_id: str("Payment identifier"),
      ambiguity: str("Plain statement of what could not be determined (required)"),
      reason_code: str("Short code for why confidence fell short"),
      candidates: arr("Ranked candidate allocations"),
      confidence: num("Confidence actually achieved"),
      residual_usd: num("Unallocated residual"),
      agent_id: AGENT_ID,
    }, ["payment_id", "ambiguity"]),
  },
  {
    name: "get_ar_impact",
    description:
      "Report the receivables impact of the current cycle: open AR, overdue invoice count, postings and value applied today, unapplied cash sitting in research, and the touchless application rate. The touchless rate counts only payments posted above the confidence floor; anything routed to research is excluded rather than counted as a success.",
    inputSchema: schema({}),
  },

  // ── Collections: portfolio and exposure ───────────────────────────────────
  {
    name: "get_aged_portfolio",
    description:
      "Return the aged receivables portfolio ranked by RECOVERABLE exposure rather than raw balance — open disputes are subtracted before ranking. Gives ageing buckets, branch spread, account tier, seasonal pattern where one is on file, and flags accounts whose tier requires human approval before any credit hold.",
    inputSchema: schema({ min_days_past_due: num("Minimum days past due to include (default 1)") }),
  },
  {
    name: "get_dispute_registry",
    description:
      "Return open and historical disputes for an account or across the portfolio, with the disputed invoice, amount, reason code, age, current status and the contract clause the dispute turns on. Disputed amounts must be excluded from any exposure figure used to justify a credit hold.",
    inputSchema: schema({ account_id: str("Account identifier; omit for the whole portfolio") }),
  },
  {
    name: "get_payment_behaviour",
    description:
      "Assess an account's payment behaviour against its own history rather than a flat ageing threshold — surfacing documented seasonal cycles so predictable agricultural or construction cash-flow patterns are not mistaken for credit deterioration.",
    inputSchema: schema({ account_id: str("Account identifier") }, ["account_id"]),
  },
  {
    name: "get_account_relationship",
    description:
      "Quantify what a credit hold on this account would actually cost: units owned, active rental contracts and their monthly value, open work orders that would stall, and annual parts and service spend at risk. Returns an estimated 90-day relationship cost to sit alongside the balance being recovered.",
    inputSchema: schema({ account_id: str("Account identifier") }, ["account_id"]),
  },
  {
    name: "get_invoice_detail",
    description:
      "Return full line-level detail for an invoice — parts, labour, freight, fees, rental and other charges — together with the account's governing terms and any disputes raised against it. This is the evidence a dispute root-cause classification rests on.",
    inputSchema: schema({ invoice_id: str("Invoice identifier") }, ["invoice_id"]),
  },

  // ── Collections: actions ──────────────────────────────────────────────────
  {
    name: "draft_outreach",
    description:
      "Draft customer collections outreach from the approved template library for a given ageing tier, automatically excluding invoices under active dispute from the chase. Refuses free-form customer-facing text, and refuses language asserting fees not in the contract or threatening repossession or legal action without review.",
    inputSchema: schema({
      account_id: str("Account identifier"),
      ageing_tier: str("reminder_30 | firm_60 | final_90 | dispute_ack"),
      finding: str("Dispute finding text, used by the dispute_ack template"),
      custom_text: str("Free-form text — supplying this is refused by design"),
    }, ["account_id"]),
  },
  {
    name: "prepare_payment_plan",
    description:
      "Prepare an instalment plan proposal for an overdue account, excluding disputed balances from the plan value so a dispute is not quietly converted into an admitted debt. Returns the schedule and the approval level the value and account tier require.",
    inputSchema: schema({
      account_id: str("Account identifier"),
      instalments: num("Number of instalments, between 2 and 12"),
    }, ["account_id"]),
  },
  {
    name: "prepare_credit_memo",
    description:
      "Assemble a credit memo with its supporting evidence and route it to the approval level its value requires under the delegation-of-authority matrix. Memos above the agent ceiling must carry both a contract clause and a shown calculation, and are never self-approved regardless of how clear the case is.",
    inputSchema: schema({
      account_id: str("Account identifier"),
      amount_usd: num("Credit amount"),
      reason: str("Why the credit is warranted"),
      contract_clause: str("Contract clause or policy relied on"),
      calculation: str("The arithmetic, shown"),
      invoice_id: str("Invoice the credit applies to"),
      dispute_id: str("Dispute the credit resolves"),
      agent_id: AGENT_ID,
    }, ["account_id", "amount_usd", "reason"]),
  },
  {
    name: "evaluate_credit_hold",
    description:
      "Evaluate whether a credit hold is warranted. Computes hold-eligible exposure with open disputes unconditionally excluded, checks whether ageing evidence is sufficient, weighs the estimated relationship cost against the recoverable amount, and states which approver is required. The dispute exclusion cannot be bypassed by any argument the caller supplies.",
    inputSchema: schema({ account_id: str("Account identifier") }, ["account_id"]),
  },
  {
    name: "apply_credit_hold",
    description:
      "Apply an approved credit hold account-wide across every branch. Requires documented ageing justification, and requires a named human approver for strategic or manufacturer-affiliated accounts regardless of exposure. Refuses when the balance is predominantly disputed.",
    inputSchema: schema({
      account_id: str("Account identifier"),
      justification: str("Documented ageing evidence supporting the hold"),
      approver: str("Named human approver; mandatory for non-standard account tiers"),
      agent_id: AGENT_ID,
    }, ["account_id", "justification"]),
  },
  {
    name: "escalate_to_credit_manager",
    description:
      "Escalate an account to the credit manager with the exposure analysis, relationship context and the specific decision being requested already assembled, including the agent's own recommendation and any reasons against acting.",
    inputSchema: schema({
      account_id: str("Account identifier"),
      decision_requested: str("The specific decision being asked for"),
    }, ["account_id", "decision_requested"]),
  },

  // ── Service and warranty ──────────────────────────────────────────────────
  {
    name: "get_completed_work_orders",
    description:
      "List completed warranty-segment work orders awaiting screening, with technician narrative, labour booked, repair code, meter reading at service, and flags for orders whose equipment identity is unresolved or whose failure cause was never established.",
    inputSchema: schema({ branch_id: str("Branch filter; omit for all branches") }),
  },
  {
    name: "resolve_asset",
    description:
      "Resolve a serial number or PIN to a single fleet asset. Serial strings are unique within a manufacturer but not across manufacturers, so this returns every candidate when one collides, narrowing only on corroborating make, model and meter plausibility, and escalating rather than selecting the more likely unit.",
    inputSchema: schema({
      serial_number: str("Serial number or PIN"),
      manufacturer: str("Corroborating manufacturer"),
      model: str("Corroborating model"),
      meter_hours: num("Corroborating meter reading"),
    }, ["serial_number"]),
  },
  {
    name: "get_oem_program_terms",
    description:
      "Return live manufacturer warranty program terms: coverage in both calendar months and meter hours, causal part and failure narrative requirements, repeat-failure provisions, and goodwill thresholds. Reports how old the cached terms are, since programs change without notice.",
    inputSchema: schema({ program_code: str("Program code; omit for all programs") }),
  },
  {
    name: "get_asset_service_history",
    description:
      "Return an asset's service and claim history with its meter progression, and identify components that have failed repeatedly under warranty — the condition that extension provisions turn on when standard coverage appears exhausted.",
    inputSchema: schema({ unit_id: str("Fleet asset identifier") }, ["unit_id"]),
  },
  {
    name: "get_labour_standard",
    description:
      "Return the manufacturer's published standard repair time for an operation on a given model. This is the ceiling for claimable labour; hours booked above it are absorbed unless documented complications justify the overage.",
    inputSchema: schema({
      manufacturer: str("Manufacturer"),
      model: str("Model"),
      repair_code: str("Repair operation code"),
    }, ["manufacturer", "model", "repair_code"]),
  },
  {
    name: "assemble_claim",
    description:
      "Build a draft warranty claim from a completed work order, capping claimable labour at the published standard and listing any mandatory element that is missing. Where the technician's notes do not establish a failure cause, that is reported as missing rather than inferred.",
    inputSchema: schema({ work_order_id: str("Work order identifier") }, ["work_order_id"]),
  },
  {
    name: "run_compliance_gate",
    description:
      "Run every mandatory pre-submission check against source data rather than trusting the caller: equipment identity resolved, coverage on both calendar and meter-hour dimensions including repeat-failure extensions, labour within the published standard, and causal part and narrative present. Records the verdict so submission can be gated on it.",
    inputSchema: schema({ claim_id: str("Claim identifier as returned by assemble_claim (e.g. WC-...). Not a work order id.") }, ["claim_id"]),
  },
  {
    name: "submit_claim",
    description:
      "Submit a warranty claim to the manufacturer portal. Refuses any claim that has not recorded a passing compliance gate — protecting the dealership's program standing, which outweighs the value of any individual claim. Run run_compliance_gate on the claim first; without a recorded PASS this always refuses.",
    inputSchema: schema({ claim_id: str("Claim identifier as returned by assemble_claim (e.g. WC-...). Not a work order id.") }, ["claim_id"]),
  },
  {
    name: "route_to_goodwill_review",
    description:
      "Route a repair that failed the compliance gate to internal goodwill or customer-pay review instead of submitting it, carrying the specific failing condition and the commercial context of the customer involved.",
    inputSchema: schema({
      claim_id: str("Claim identifier"),
      reason: str("Failing condition, when not already recorded by the gate"),
    }, ["claim_id"]),
  },
  {
    name: "get_claim_status",
    description:
      "Return adjudication outcomes for submitted claims: approved amounts, denials with manufacturer reason codes, and partial approvals with labour written down to standard.",
    inputSchema: schema({ claim_id: str("Claim identifier; omit for all submitted claims") }),
  },
  {
    name: "analyze_denial",
    description:
      "Classify a manufacturer denial as resubmittable with further evidence, correctable, or a genuine unrecoverable loss, and state the remedy. Genuine losses are recorded with their reason so the denial-cause distribution stays visible rather than being absorbed silently.",
    inputSchema: schema({ claim_id: str("Claim identifier") }, ["claim_id"]),
  },
  {
    name: "post_warranty_receivable",
    description:
      "Post an approved warranty claim as a receivable to the branch that performed the work, in the period the repair obligation was satisfied rather than the period the manufacturer happened to pay.",
    inputSchema: schema({ claim_id: str("Claim identifier"), agent_id: AGENT_ID }, ["claim_id"]),
  },

  // ── Rental ────────────────────────────────────────────────────────────────
  {
    name: "get_billing_cycle_queue",
    description:
      "List rental contracts due for cycle billing with their rate structure, included hours, negotiated-rate flag and purchase-option flag, plus the machine and customer each is attached to. Contracts carrying a purchase option must be routed for lease-classification review before revenue posts.",
    inputSchema: schema({ branch_id: str("Branch filter; omit for all branches") }),
  },
  {
    name: "get_rental_contract_terms",
    description:
      "Return the full terms of a single rental contract: rate and period, included hours, overage rate, delivery and pickup charges, fuel policy, damage waiver, purchase option, and whether the rate is negotiated rather than branch standard. Billing a negotiated contract at standard rates over-bills the customer; the reverse under-bills the dealer.",
    inputSchema: schema({ contract_id: str("Rental contract identifier") }, ["contract_id"]),
  },
  {
    name: "get_telematics_utilisation",
    description:
      "Return machine-reported utilisation for a unit over a period: engine hours accrued, idle ratio, location history, and any days the unit stopped reporting. A reporting gap is stated explicitly, because it cannot support a billing claim in either direction.",
    inputSchema: schema({
      unit_id: str("Fleet asset identifier"),
      from_date: str("Period start, ISO date"),
      to_date: str("Period end, ISO date; defaults to today"),
    }, ["unit_id", "from_date"]),
  },
  {
    name: "get_off_rent_request",
    description:
      "Return a customer's off-rent request for a contract: the date claimed, the date the unit was actually collected, and the gap between them — the most frequently disputed field in rental billing.",
    inputSchema: schema({ contract_id: str("Rental contract identifier") }, ["contract_id"]),
  },
  {
    name: "get_condition_report",
    description:
      "Return the check-out baseline and check-in condition reports for a rental, with meter readings, fuel level, findings, photographic evidence references and any damage claimed. Wear proportionate to the machine's age and the hours it ran is normal wear, not chargeable damage.",
    inputSchema: schema({ contract_id: str("Rental contract identifier") }, ["contract_id"]),
  },
  {
    name: "calculate_cycle_invoice",
    description:
      "Calculate a rental cycle invoice from the contract's own terms and verified machine utilisation, with every line traced to its evidence source. Where telematics did not report for part of the period, overage is not billed and the gap is flagged for human review rather than extrapolated into a charge.",
    inputSchema: schema({
      contract_id: str("Rental contract identifier"),
      from_date: str("Period start"),
      to_date: str("Period end"),
    }, ["contract_id"]),
  },
  {
    name: "reconcile_billed_vs_actual",
    description:
      "Compare what was billed against what contract terms and verified utilisation support, reporting variance in BOTH directions. Over-billing in the customer's favour is surfaced with at least the same prominence as under-billing.",
    inputSchema: schema({
      contract_id: str("Rental contract identifier"),
      billed_amount_usd: num("Amount actually billed"),
      billed_rate_usd: num("Rate actually applied"),
      from_date: str("Period start"),
      to_date: str("Period end"),
    }, ["contract_id"]),
  },
  {
    name: "verify_off_rent_date",
    description:
      "Test a claimed off-rent date against machine data, measuring engine hours accrued between the claimed date and actual collection. Returns the corroborated date with the hour-meter evidence attached — confirming the customer's claim as readily as contradicting it.",
    inputSchema: schema({ contract_id: str("Rental contract identifier") }, ["contract_id"]),
  },
  {
    name: "prepare_billing_adjustment",
    description:
      "Prepare a rental billing adjustment in either direction with its supporting evidence, and route it for approval when it exceeds the agent ceiling. The threshold applies equally to adjustments in the dealer's favour.",
    inputSchema: schema({
      contract_id: str("Rental contract identifier"),
      amount_usd: num("Adjustment value"),
      direction: str("credit_customer | bill_customer"),
      evidence: str("Contract term or telematics reading relied on"),
    }, ["contract_id", "amount_usd", "direction", "evidence"]),
  },
  {
    name: "flag_asc842_review",
    description:
      "Flag a rental contract carrying a purchase option, or accumulating rent toward a purchase price, for ASC 842 lease-classification review, holding revenue recognition until an accounting owner has classified it.",
    inputSchema: schema({ contract_id: str("Rental contract identifier") }, ["contract_id"]),
  },
  {
    name: "release_invoice",
    description:
      "Release a reconciled rental cycle invoice for billing. Refuses release while a purchase-option contract is unclassified, or while a telematics reporting gap in the billing period is unreviewed by a human.",
    inputSchema: schema({
      contract_id: str("Rental contract identifier"),
      asc842_cleared_by: str("Controller who cleared lease classification"),
      gap_reviewed_by: str("Human who decided on the telematics gap"),
    }, ["contract_id"]),
  },

  // ── Whole-goods deal desk ─────────────────────────────────────────────────
  {
    name: "get_pending_deals",
    description:
      "List whole-goods deals awaiting desk review with unit configuration, proposed price and discount, the salesperson's authority level, customer tier, and whether a trade-in is involved.",
    inputSchema: schema({ branch_id: str("Branch filter; omit for all branches") }),
  },
  {
    name: "get_true_landed_cost",
    description:
      "Return the real cost of a unit rather than the manufacturer invoice figure: invoice cost plus inbound freight, pre-delivery inspection and prep, and floor plan interest accrued while the unit aged in inventory. Surfaces carrying cost explicitly on aged units, where it quietly consumes the margin.",
    inputSchema: schema({
      unit_id: str("Fleet asset identifier"),
      deal_id: str("Deal identifier, as an alternative to unit_id"),
    }),
  },
  {
    name: "get_trade_in_assessment",
    description:
      "Return the condition assessment for any trade-in attached to a deal: meter hours, condition grade, deferred maintenance identified, and reconditioning cost estimate.",
    inputSchema: schema({ deal_id: str("Deal identifier") }, ["deal_id"]),
  },
  {
    name: "get_auction_comparables",
    description:
      "Return recent auction results for comparable units by make and model, with sale prices, dates and condition grades, plus the range and average. This is the defensible basis for a trade valuation; any allowance above the range is a discount and must be named as one.",
    inputSchema: schema({ manufacturer: str("Manufacturer"), model: str("Model") }, ["manufacturer", "model"]),
  },
  {
    name: "get_customer_lifetime_value",
    description:
      "Return the aftermarket context behind a deal: units owned, active rentals, annual parts and service spend and a five-year projection. Lifetime value explains a thin margin; it never grants authority to exceed a discount threshold.",
    inputSchema: schema({ account_id: str("Account identifier") }, ["account_id"]),
  },
  {
    name: "identify_eligible_programs",
    description:
      "Identify every manufacturer program a deal qualifies for — retail rebates, volume and fleet programs, floor plan credits, demo allowances, trade assistance and seasonal promotions — each with its eligibility conditions, value and claim deadline. Gross value assumes all programs stack, which they may not.",
    inputSchema: schema({ deal_id: str("Deal identifier") }, ["deal_id"]),
  },
  {
    name: "check_program_stacking",
    description:
      "Determine the optimal LEGAL combination of manufacturer programs for a deal, honouring mutual-exclusion rules, and name each excluded program and why. Claiming mutually exclusive programs triggers a chargeback worth more than the programs themselves.",
    inputSchema: schema({ deal_id: str("Deal identifier") }, ["deal_id"]),
  },
  {
    name: "calculate_true_margin",
    description:
      "Calculate true deal margin after landed cost, trade over-allowance, reconditioning and captured program value, reporting margin both before and after capture. Refuses to run until programs have been captured, so a healthy deal is never rejected on a pre-capture figure.",
    inputSchema: schema({
      deal_id: str("Deal identifier"),
      programs_captured: bool("Must be true — capture programs before judging margin"),
      captured_program_value_usd: num("Capturable program value from check_program_stacking"),
    }, ["deal_id"]),
  },
  {
    name: "determine_approval_authority",
    description:
      "Determine the approval level a deal requires from its EFFECTIVE discount — the headline discount plus any trade over-allowance measured against comparable market value. Structuring a deal to keep the headline under a threshold by inflating the trade does not avoid the authority requirement.",
    inputSchema: schema({ deal_id: str("Deal identifier") }, ["deal_id"]),
  },
  {
    name: "prepare_deal_summary",
    description:
      "Assemble the deal desk summary for the salesperson and approver: true margin before and after program capture, excluded programs, landed cost, the trade valuation basis, the effective discount, the approval level required, and any flagged risks including programs nearing their claim deadline. Advisory output — it neither issues a quote nor approves a discount.",
    inputSchema: schema({ deal_id: str("Deal identifier") }, ["deal_id"]),
  },
  {
    name: "flag_multi_obligation_split",
    description:
      "Flag a deal that bundles equipment with delivery, prep, extended coverage or training for ASC 606 performance-obligation allocation before invoicing, so the whole consideration is not recognised on delivery of the machine.",
    inputSchema: schema({ deal_id: str("Deal identifier") }, ["deal_id"]),
  },
];

export const TOOL_NAMES: string[] = TOOL_CATALOG.map((t) => t.name);
