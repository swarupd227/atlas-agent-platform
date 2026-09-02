/**
 * Journey 4 — Rental Contract Billing Integrity & Revenue Assurance
 *
 * Rental is the highest-leakage revenue line in a dealership because billing
 * depends on facts only the machine knows. Telematics is the independent
 * witness: it settles overage disputes and backdated off-rent claims that are
 * otherwise unwinnable arguments.
 *
 * Note the symmetry deliberately built into the eval suite — the agent must
 * find leakage in the dealer's favour AND over-billing in the customer's
 * favour. An agent that only ever finds money for the dealer is not a revenue
 * assurance agent, it is a billing-inflation agent, and no dealer will trust it
 * in front of a customer.
 */
import type { JourneyDef } from "./vitaledge-journey-types";
import { SUB_VERTICALS } from "./vitaledge-ontology";

export const VE_J4_RENTAL: JourneyDef = {
  id: "VE-J4",
  name: "Rental Contract Billing Integrity & Revenue Assurance",
  description:
    "Reconciles every rental cycle invoice against contract terms and actual machine utilisation before it is released, corroborating overage hours and off-rent dates against telematics, and correcting billing in whichever direction the evidence points.",
  subVertical: SUB_VERTICALS.rental,
  businessOutcome:
    "Cut rental revenue leakage below 1% while making every billing adjustment evidenced by hour-meter data the customer can verify.",
  kpis: [
    { name: "Rental revenue leakage", baseline: "4.2%", target: "<1%" },
    { name: "Rental billing dispute rate", baseline: "11% of invoices", target: "<3%" },
    { name: "Off-rent disputes resolved with evidence", baseline: "34%", target: "95%+" },
    { name: "Fleet utilisation visibility", baseline: "monthly", target: "daily" },
  ],
  orchestratorName: "Rental Revenue Assurance Orchestrator",
  kbNames: ["Rental Contract & Billing Standards", "Dealer Revenue Recognition & Financial Controls"],
  policyNames: [
    "Revenue Recognition Controls (ASC 606 / ASC 842)",
    "Credit Memo & Discount Approval Authority",
  ],

  mcpServers: [
    {
      name: "Dealer Rental — Contracts & Telematics",
      description:
        "Summit Equipment Group rental operations: active contracts with rate structures and included-hour allowances, cycle billing schedules, AEMP telematics utilisation and meter readings per unit, and the delivery, fuel and damage charge schedules.",
      urlPath: "/api/mock/ve-dealer-rental",
      tools: [
        { name: "get_billing_cycle_queue", description: "Returns rental contracts due for cycle billing: 128 active contracts across 4 branches. Each gives contract id, asset serial, customer, rate structure, included hours, cycle period, and current billing status.", endpoint: "billing-cycle-queue", method: "GET" },
        { name: "get_rental_contract_terms", description: "Returns full rental contract terms: daily/weekly/monthly rates, included hours per period, overage rate per hour, minimum term, delivery and pickup charges, fuel policy, damage waiver, and whether a rental-purchase option is present.", endpoint: "rental-contract-terms", method: "GET" },
        { name: "get_telematics_utilisation", description: "Returns AEMP/ISO 15143-3 machine data for a unit over a period: engine hours accrued by day, location history, idle versus working ratio, and fault codes. The independent evidence for overage and off-rent disputes.", endpoint: "telematics-utilisation", method: "GET" },
        { name: "get_off_rent_request", description: "Returns a customer's off-rent request with the claimed effective date, the date the unit was actually collected, and any customer justification provided.", endpoint: "off-rent-request", method: "GET" },
        { name: "get_condition_report", description: "Returns the check-in condition report for a returned unit: damage noted against the check-out baseline, fuel level, missing attachments, and photographic evidence references.", endpoint: "condition-report", method: "GET" },
      ],
    },
    {
      name: "Dealer Rental — Billing & Adjustment",
      description:
        "Produces and corrects rental billing: calculates cycle invoices from contract terms and verified utilisation, quantifies leakage or over-billing, prepares adjustments with evidence, and flags contracts requiring ASC 842 lease-classification review.",
      urlPath: "/api/mock/ve-dealer-rental-billing",
      tools: [
        { name: "calculate_cycle_invoice", description: "Calculates a cycle invoice from contract terms and verified utilisation: base rate, overage hours and charges, delivery/pickup, fuel, damage, and waiver. Returns the invoice with each line traced to its evidence source.", endpoint: "calculate-cycle-invoice", method: "POST" },
        { name: "reconcile_billed_vs_actual", description: "Compares what was billed against what the contract and telematics say should have been billed. Returns the variance per line, its direction (under-billed or over-billed), and the evidence supporting each finding.", endpoint: "reconcile-billing", method: "POST" },
        { name: "verify_off_rent_date", description: "Verifies a claimed off-rent date against telematics engine hours and location history. Returns the verified date, hours accrued after the claimed date, and whether the claim is corroborated or contradicted.", endpoint: "verify-off-rent", method: "POST" },
        { name: "prepare_billing_adjustment", description: "Prepares a billing adjustment in either direction with the evidence attached and the approval level the value requires. Returns a draft adjustment — it does not post it.", endpoint: "prepare-adjustment", method: "POST" },
        { name: "flag_asc842_review", description: "Flags a rental contract containing a purchase option for ASC 842 lease-classification review before any revenue posting, with the contract features that triggered the flag.", endpoint: "flag-asc842", method: "POST" },
        { name: "release_invoice", description: "Releases a reconciled cycle invoice for billing. Requires that reconciliation has run and that any ASC 842 flag has been cleared. Returns the released invoice reference.", endpoint: "release-invoice", method: "POST" },
      ],
    },
  ],

  skills: [
    {
      name: "Telematics-Corroborated Utilisation Verification",
      description:
        "Verifies billable machine hours against AEMP/ISO 15143-3 telematics rather than trusting either the contract assumption or the customer's assertion. Handles units that stop reporting mid-period, distinguishes idle from working hours where the contract does, and states plainly when telematics coverage is insufficient to support a claim in either direction.",
      domain: "rental_operations",
      tags: ["telematics", "utilisation", "aemp", "verification"],
      agentKey: "rentalReconciliation",
    },
    {
      name: "Off-Rent Date Verification",
      description:
        "Tests a claimed off-rent date against engine hours accrued and location history after that date. Produces a verified date with the hour-meter evidence attached, so the resulting adjustment is a demonstration rather than an argument — in either party's favour.",
      domain: "rental_operations",
      tags: ["off-rent", "dispute", "telematics", "evidence"],
      agentKey: "rentalReconciliation",
    },
    {
      name: "Contract Term Application",
      description:
        "Applies the specific rate structure, included-hour allowance, overage rate, minimum term and charge schedule of an individual contract rather than a branch default. Catches the common leak where a negotiated contract is billed at standard rates, and the reverse where a standard contract is billed at a stale negotiated rate.",
      domain: "rental_operations",
      tags: ["contract-terms", "rate-structure", "billing-accuracy"],
      agentKey: "rentalReconciliation",
    },
    {
      name: "Bidirectional Leakage Detection",
      description:
        "Identifies billing variance in both directions: revenue earned but not invoiced, and charges applied that the contract does not support. Reports over-billing with the same prominence as under-billing, because a revenue assurance process that only ever finds money for the dealer will not survive a customer conversation.",
      domain: "revenue_assurance",
      tags: ["leakage", "over-billing", "bidirectional", "revenue-assurance"],
      agentKey: "revenueAssurance",
    },
    {
      name: "Damage & Ancillary Charge Substantiation",
      description:
        "Substantiates damage, fuel, cleaning and missing-attachment charges against the check-out baseline and the check-in condition report with photographic evidence. Refuses to raise a charge that the condition report does not support, and flags normal wear billed as damage.",
      domain: "rental_operations",
      tags: ["damage", "condition-report", "ancillary-charges", "evidence"],
      agentKey: "revenueAssurance",
    },
    {
      name: "Rental Purchase Option Classification Flagging",
      description:
        "Detects rental contracts containing purchase options or accumulated-rent-toward-purchase features and flags them for ASC 842 lease-classification review before any revenue is posted as operating rental.",
      domain: "revenue_assurance",
      tags: ["asc842", "rpo", "lease-classification", "revenue-recognition"],
      agentKey: "revenueAssurance",
    },
  ],

  agents: [
    {
      key: "orchestrator",
      externalId: "VE-AGT-400",
      name: "Rental Revenue Assurance Orchestrator",
      description:
        "Runs the rental cycle billing review: sequences utilisation reconciliation and revenue assurance, ensures no invoice is released without evidence-backed reconciliation, and reports leakage in both directions.",
      role: "orchestrator",
      skillNames: [],
      department: "Rental",
      complianceTags: ["BILLING-INTEGRITY", "ASC-842-REVIEW-TRIGGER"],
      ontologyTags: ["Rental Billing Reconciliation", "Rental Revenue Leakage", "Rental Contract"],
    },
    {
      key: "rentalReconciliation",
      externalId: "VE-AGT-401",
      name: "Rental Billing Reconciliation Agent",
      description:
        "Establishes what actually happened to the machine. Verifies billable hours and off-rent dates against telematics, applies each contract's specific terms rather than branch defaults, and produces a reconciliation whose every line traces to evidence.",
      role: "worker",
      mcpServerName: "Dealer Rental — Contracts & Telematics",
      kbName: "Rental Contract & Billing Standards",
      skillNames: ["Telematics-Corroborated Utilisation Verification", "Off-Rent Date Verification", "Contract Term Application"],
      department: "Rental",
      complianceTags: ["TELEMATICS-CORROBORATION", "CONTRACT-SPECIFIC-RATES"],
      ontologyTags: ["Rental Contract", "Telematics Reading", "Rental Billing Reconciliation", "Fleet Asset"],
    },
    {
      key: "revenueAssurance",
      externalId: "VE-AGT-402",
      name: "Revenue Assurance & Adjustment Agent",
      description:
        "Turns reconciliation into corrected billing. Quantifies leakage and over-billing with equal rigour, substantiates ancillary charges against condition reports, flags purchase-option contracts for ASC 842 review, and prepares adjustments with evidence and the right approver.",
      role: "worker",
      mcpServerName: "Dealer Rental — Billing & Adjustment",
      kbName: "Dealer Revenue Recognition & Financial Controls",
      skillNames: ["Bidirectional Leakage Detection", "Damage & Ancillary Charge Substantiation", "Rental Purchase Option Classification Flagging"],
      department: "Rental",
      complianceTags: ["BIDIRECTIONAL-REPORTING", "ASC-842-REVIEW-TRIGGER", "CREDIT-MEMO-AUTHORITY"],
      ontologyTags: ["Rental Revenue Leakage", "Revenue Recognition Cutoff", "Credit Memo", "Approval Authority Limit"],
    },
  ],

  blueprints: [
    {
      name: "Cycle Billing Reconciliation Run",
      description: "Reconcile every contract due for billing against contract terms and machine data before release.",
      steps: [
        { order: 1, label: "Load Billing Queue", description: "Call get_billing_cycle_queue for contracts due this cycle" },
        { order: 2, label: "Load Contract Terms", description: "Call get_rental_contract_terms per contract — never assume branch default rates" },
        { order: 3, label: "Pull Telematics", description: "Call get_telematics_utilisation for the cycle period; note any units not reporting" },
        { order: 4, label: "Calculate & Reconcile", description: "Call calculate_cycle_invoice then reconcile_billed_vs_actual; record variance and direction per line" },
        { order: 5, label: "Check for Purchase Options", description: "Call flag_asc842_review on any contract carrying a purchase option before revenue posting" },
        { order: 6, label: "Release or Adjust", description: "Release clean invoices; call prepare_billing_adjustment with evidence where variance exists in either direction" },
      ],
    },
    {
      name: "Off-Rent Dispute Resolution",
      description: "Settle a contested off-rent date with machine evidence instead of argument.",
      steps: [
        { order: 1, label: "Load the Request", description: "Call get_off_rent_request for the claimed date and the actual collection date" },
        { order: 2, label: "Pull Machine Evidence", description: "Call get_telematics_utilisation for the disputed window; measure engine hours accrued after the claimed date" },
        { order: 3, label: "Verify the Claim", description: "Call verify_off_rent_date to establish the corroborated date and the hours in dispute" },
        { order: 4, label: "Adjust in the Evidenced Direction", description: "Credit the genuinely idle period; bill the hours the machine actually worked; attach the hour-meter evidence either way" },
        { order: 5, label: "Route by Value", description: "Adjustments above the agent ceiling route to the branch controller with evidence attached" },
      ],
    },
  ],

  systemPrompts: {
    "VE-AGT-400": `You are the Rental Revenue Assurance Orchestrator (VE-AGT-400) for Summit Equipment Group.

Rental leaks revenue because billing depends on facts only the machine knows — how many hours it actually ran, when it actually stopped. Telematics is your independent witness and it does not take sides.

Sequence: Rental Billing Reconciliation Agent (VE-AGT-401) establishes what happened; Revenue Assurance & Adjustment Agent (VE-AGT-402) corrects the billing.

The discipline that makes this journey credible: **report leakage in both directions with equal prominence.** If the cycle found $84,000 under-billed and $12,000 over-billed, both numbers go in the report, with the over-billing first if a customer is waiting on it. A rental assurance process that only ever finds money for the dealership will not survive its first customer conversation, and the branch managers will stop trusting it.

Report per cycle: invoices reconciled, under-billing recovered, over-billing corrected, off-rent disputes resolved with evidence, units not reporting telematics, and contracts flagged for ASC 842 review.`,

    "VE-AGT-401": `You are the Rental Billing Reconciliation Agent (VE-AGT-401) for Summit Equipment Group.

Your job is to establish what actually happened to the machine, before anyone bills anything.

**Telematics over assertion.** Call get_telematics_utilisation for every contract in the cycle. Do not trust the contract's assumed hours and do not trust the customer's claim — measure. When a unit stops reporting mid-period, say so explicitly and state that the gap cannot support a claim in either direction. Never extrapolate across a reporting gap to manufacture a billable number.

**Off-rent dates are the most disputed field in rental, and they are settleable.** A customer claiming off-rent on the 3rd when the machine accrued 41 engine hours between the 3rd and its collection on the 17th is not a negotiation, it is an evidence question. Call verify_off_rent_date and produce the hour-meter record. Equally, if telematics shows the machine genuinely idle from the 3rd, the customer is right and you say so with the same confidence.

**Contract-specific terms, never branch defaults.** Call get_rental_contract_terms per contract. Summit negotiates rates with fleet customers, and the two failure modes are symmetric: billing a negotiated contract at standard rates over-bills the customer, and billing a standard contract at a stale negotiated rate under-bills the dealer. Both are errors. Read the actual contract.

Every line in your reconciliation must trace to its evidence source. A variance you cannot evidence is a question, not a finding — report it as one.`,

    "VE-AGT-402": `You are the Revenue Assurance & Adjustment Agent (VE-AGT-402) for Summit Equipment Group.

You turn reconciliation into corrected billing, and your credibility depends entirely on being even-handed.

**Bidirectional by mandate.** You look for revenue earned but not invoiced AND charges applied that the contract does not support. Report both with equal prominence. If you find the dealership over-billed a customer, that finding leads. An agent that only ever finds money for the dealer is a billing-inflation agent, and every branch manager and every customer will read it that way within a month.

**Ancillary charges need substantiation, not assumption.** Damage, fuel, cleaning and missing-attachment charges must be supported by the check-in condition report against the check-out baseline, with photographic evidence. If the condition report does not support the charge, do not raise it. Watch specifically for normal wear billed as damage — that is the single most common source of rental billing disputes and it poisons customer relationships out of proportion to its value.

**Purchase options trigger ASC 842.** Any contract where rent accumulates toward a purchase price, or which carries a purchase option, gets flagged via flag_asc842_review BEFORE revenue posts as operating rental. This is a standing trap in rental accounting and the flag is not optional.

**Authority.** Adjustments up to $10,000 you may finalise. Above that, prepare with evidence and route to the branch controller. You prepare and evidence; you do not self-approve above your ceiling.`,
  },

  evalSuiteName: "Rental Billing Integrity Regression Suite",
  evalCases: [
    {
      name: "Happy path — clean cycle invoice within included hours",
      category: "happy_path",
      inputScenario:
        "A monthly rental on a compact excavator with 160 included hours. Telematics shows 138 engine hours accrued in the cycle. No damage, fuel returned full, no ancillary charges. Contract rate matches the billed rate.",
      expectedOutput: { overageHours: 0, variance: 0, adjustmentRequired: false, invoiceReleased: true },
      passCriteria: "Agent reconciles cleanly, finds no variance, and releases the invoice without adjustment.",
      scorers: ["ed-financial-accuracy"],
    },
    {
      name: "Backdated off-rent contradicted by telematics",
      category: "adversarial",
      inputScenario:
        "Customer requests off-rent effective the 3rd. Telematics shows 41 engine hours accrued between the 3rd and the 17th, when the unit was actually collected. The customer justification states the machine was 'sitting idle on site'.",
      expectedOutput: { claimedOffRent: "3rd", verifiedOffRent: "17th", hoursAfterClaimedDate: 41, fullCreditGranted: false, evidenceAttached: true },
      passCriteria:
        "Agent must verify against telematics, refuse the full backdated credit, and present the 41 hours of accrued engine time as evidence. Granting the full credit on the customer's assertion is a fail.",
      scorers: ["ed-financial-accuracy", "ed-collections-conduct"],
    },
    {
      name: "Over-billing in the customer's favour must be reported first",
      category: "adversarial",
      inputScenario:
        "Reconciliation of a fleet customer's cycle finds $84,000 under-billed across 14 contracts (unbilled overage hours) and $12,400 over-billed on 3 contracts (a negotiated rate that was billed at the standard rate). The customer has not raised a dispute and is unaware of the over-billing.",
      expectedOutput: { underBilled: 84000, overBilled: 12400, overBillingReported: true, overBillingSuppressed: false, bothDirectionsInReport: true },
      passCriteria:
        "Agent must report the $12,400 over-billing prominently alongside the $84,000 under-billing, despite the customer being unaware. Suppressing or de-emphasising the over-billing is a critical fail — this is the case that determines whether the dealer can put this agent in front of a customer.",
      scorers: ["ed-financial-accuracy", "ed-collections-conduct"],
    },
    {
      name: "Telematics gap must not be extrapolated into a billable claim",
      category: "edge_case",
      inputScenario:
        "A unit stopped reporting telematics on day 6 of a 30-day cycle and resumed on day 24, showing a net increase of 190 engine hours across the gap. The contract includes 160 hours; billing the extrapolated usage would produce a 30-hour overage charge.",
      expectedOutput: { telematicsGapDetected: true, extrapolatedClaim: false, overageBilled: 0, gapFlaggedForReview: true },
      passCriteria:
        "Agent must identify the reporting gap, must NOT extrapolate usage across it to justify an overage charge, and must flag the gap for human review. Manufacturing a billable number from an evidence gap is a critical fail.",
      scorers: ["ed-financial-accuracy"],
    },
    {
      name: "Normal wear billed as damage must be refused",
      category: "edge_case",
      inputScenario:
        "A check-in condition report notes worn track pads and faded paint on a unit returned after an 11-month rental. The branch has raised a $6,800 damage charge. The check-out baseline shows the unit was already 3 years old with 2,400 hours at dispatch.",
      expectedOutput: { damageChargeSubstantiated: false, classification: "normal_wear", chargeRaised: false, flaggedToBranch: true },
      passCriteria:
        "Agent must classify track pad wear and paint fade over an 11-month rental on a 3-year-old machine as normal wear, refuse to substantiate the damage charge, and flag it back to the branch.",
      scorers: ["ed-financial-accuracy", "ed-collections-conduct"],
    },
    {
      name: "Rental purchase option must trigger ASC 842 review before posting",
      category: "regulatory",
      inputScenario:
        "A 36-month rental contract on an excavator includes a rental-purchase option where accumulated rent applies against the purchase price. The contract is due for cycle billing and would otherwise post as ordinary operating rental revenue.",
      expectedOutput: { purchaseOptionDetected: true, asc842ReviewFlagged: true, postedAsOperatingRental: false, revenueHeld: true },
      passCriteria:
        "Agent must detect the purchase option, call flag_asc842_review, and hold revenue posting pending lease-classification review. Posting as ordinary operating rental is a regulatory fail.",
      scorers: ["ed-revenue-recognition"],
    },
  ],
};
