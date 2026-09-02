/**
 * Process flows for the five VitalEdge / Equipment Dealer journeys.
 *
 * These are the governance artefact, not decoration: every branch that a policy
 * requires appears as an explicit decision node with conditional edges, and
 * every human gate the delegation-of-authority matrix demands appears as an
 * expert_approval node. If a policy says "route to the branch controller above
 * $10,000", that threshold is visible on an edge here — which is what lets a
 * compliance reviewer audit the design without reading a prompt.
 *
 * Each flow satisfies the invariants the flow compiler does not itself enforce:
 * exactly one trigger, at least one end, no orphan nodes, and every decision
 * node's outgoing edges carry conditions.
 */
import { PROCESS_FLOW_VERSION, type ProcessFlowGraph } from "../../shared/process-flow";

const X = (col: number) => col * 260;
const Y = (row: number) => row * 150;

// ─── J1 — Invoice-to-Cash ─────────────────────────────────────────────────────
export const J1_FLOW: ProcessFlowGraph = {
  version: PROCESS_FLOW_VERSION,
  name: "Invoice-to-Cash — Remittance Capture & Cash Application",
  nodes: [
    { id: "j1-trigger", type: "trigger", label: "Payment batch received", description: "Daily receipts land from ACH, cheque, lockbox and card channels", actor: "System", position: { x: X(0), y: Y(1) } },
    { id: "j1-fetch", type: "get_info", label: "Retrieve payments & remittance", description: "Pull the batch and any attached remittance advice in its native format", actor: "ED-AGT-101", estimatedMins: 2, position: { x: X(1), y: Y(1) } },
    { id: "j1-extract", type: "ai_reasoning", label: "Extract allocation intent", description: "Parse unstructured PDF or email remittance into invoice references and amounts; produce a completeness score", actor: "ED-AGT-101", estimatedMins: 3, position: { x: X(2), y: Y(1) } },
    { id: "j1-resolve", type: "ai_reasoning", label: "Resolve payer to master account", description: "Map the payer string across DBAs, subsidiaries and third-party payers to one customer account", actor: "ED-AGT-101", estimatedMins: 1, position: { x: X(3), y: Y(1) } },
    { id: "j1-propose", type: "ai_reasoning", label: "Propose branch-split allocation", description: "Match against open AR across all branches and propose per-invoice amounts with a confidence score", actor: "ED-AGT-101", estimatedMins: 3, position: { x: X(4), y: Y(1) } },
    { id: "j1-conf", type: "make_decision", label: "Confidence gate", description: "Apply the policy confidence floor to the proposed allocation", actor: "ED-AGT-102", position: { x: X(5), y: Y(1) } },
    { id: "j1-shortfall", type: "ai_reasoning", label: "Classify any shortfall", description: "Determine whether a payment variance is a contractual settlement discount or an unstated dispute", actor: "ED-AGT-102", estimatedMins: 2, position: { x: X(6), y: Y(0) } },
    { id: "j1-period", type: "make_decision", label: "Period & cutoff check", description: "Confirm the accounting period is open and no revenue crosses a period boundary", actor: "ED-AGT-102", position: { x: X(7), y: Y(0) } },
    { id: "j1-confirm", type: "expert_approval", label: "One-click confirmation", description: "AR clerk confirms a mid-confidence allocation (0.60-0.80)", actor: "AR Clerk", estimatedMins: 1, position: { x: X(6), y: Y(1) } },
    { id: "j1-research", type: "take_action", label: "Route to research queue", description: "Package the parsed remittance, ranked candidates and the specific ambiguity for a human researcher", actor: "ED-AGT-102", estimatedMins: 1, position: { x: X(6), y: Y(2) } },
    { id: "j1-accounting", type: "expert_approval", label: "Accounting review", description: "Controller resolves a cross-period posting rather than the agent forcing a period", actor: "Branch Controller", estimatedMins: 10, position: { x: X(8), y: Y(1) } },
    { id: "j1-post", type: "take_action", label: "Post to branch ledgers", description: "Debit cash, credit AR per invoice, split to each originating branch, with source document attached", actor: "ED-AGT-102", estimatedMins: 1, position: { x: X(8), y: Y(0) } },
    { id: "j1-notify", type: "send_notification", label: "Report batch impact", description: "Touchless rate, DSO movement, unapplied cash, and exception count to the finance team", actor: "ED-AGT-100", position: { x: X(9), y: Y(1) } },
    { id: "j1-end", type: "end", label: "Batch complete", description: "Cycle recorded with full audit trail", actor: "System", position: { x: X(10), y: Y(1) } },
  ],
  edges: [
    { id: "j1-e0", from: "j1-trigger", to: "j1-fetch" },
    { id: "j1-e1", from: "j1-fetch", to: "j1-extract" },
    { id: "j1-e2", from: "j1-extract", to: "j1-resolve" },
    { id: "j1-e3", from: "j1-resolve", to: "j1-propose" },
    { id: "j1-e4", from: "j1-propose", to: "j1-conf" },
    { id: "j1-e5", from: "j1-conf", to: "j1-shortfall", label: "Confidence ≥ 0.80", condition: "allocation.confidence >= 0.80" },
    { id: "j1-e6", from: "j1-conf", to: "j1-confirm", label: "0.60 – 0.80", condition: "allocation.confidence >= 0.60 && allocation.confidence < 0.80" },
    { id: "j1-e7", from: "j1-conf", to: "j1-research", label: "Below 0.60", condition: "allocation.confidence < 0.60" },
    { id: "j1-e8", from: "j1-confirm", to: "j1-shortfall", label: "Confirmed", condition: "approval.granted == true" },
    { id: "j1-e9", from: "j1-confirm", to: "j1-research", label: "Rejected", condition: "approval.granted == false" },
    { id: "j1-e10", from: "j1-shortfall", to: "j1-period" },
    { id: "j1-e11", from: "j1-period", to: "j1-post", label: "Period open, no cutoff issue", condition: "period.open == true && period.crossesBoundary == false" },
    { id: "j1-e12", from: "j1-period", to: "j1-accounting", label: "Cutoff concern", condition: "period.crossesBoundary == true || period.open == false" },
    { id: "j1-e13", from: "j1-accounting", to: "j1-post", label: "Resolved", condition: "approval.granted == true" },
    { id: "j1-e14", from: "j1-accounting", to: "j1-research", label: "Held", condition: "approval.granted == false" },
    { id: "j1-e15", from: "j1-post", to: "j1-notify" },
    { id: "j1-e16", from: "j1-research", to: "j1-notify" },
    { id: "j1-e17", from: "j1-notify", to: "j1-end" },
  ],
};

// ─── J2 — Collections, Disputes & Credit Risk ─────────────────────────────────
export const J2_FLOW: ProcessFlowGraph = {
  version: PROCESS_FLOW_VERSION,
  name: "Collections, Disputes & Credit Risk",
  nodes: [
    { id: "j2-trigger", type: "trigger", label: "Weekly collections cycle", description: "Scheduled review of the aged AR portfolio", actor: "System", position: { x: X(0), y: Y(1) } },
    { id: "j2-portfolio", type: "get_info", label: "Load aged portfolio", description: "Balances by ageing bucket, branch, and account tier across 342 accounts", actor: "ED-AGT-201", estimatedMins: 2, position: { x: X(1), y: Y(1) } },
    { id: "j2-disputes", type: "get_info", label: "Load dispute registry", description: "Open disputes per account — these are excluded from hold exposure before anything is ranked", actor: "ED-AGT-201", estimatedMins: 1, position: { x: X(2), y: Y(1) } },
    { id: "j2-behaviour", type: "ai_reasoning", label: "Assess payment behaviour", description: "Compare against the account's own 24-month pattern to separate seasonal lateness from genuine deterioration", actor: "ED-AGT-201", estimatedMins: 3, position: { x: X(3), y: Y(1) } },
    { id: "j2-exposure", type: "ai_reasoning", label: "Compute recoverable exposure", description: "Net of disputes and unapplied cash; quantify what a credit hold would cost in aftermarket revenue", actor: "ED-AGT-201", estimatedMins: 3, position: { x: X(4), y: Y(1) } },
    { id: "j2-route", type: "make_decision", label: "Select action", description: "Dun, payment plan, dispute resolution, credit hold, or escalate", actor: "ED-AGT-201", position: { x: X(5), y: Y(1) } },
    { id: "j2-dun", type: "take_action", label: "Draft approved-language outreach", description: "Draft from the approved template library for the ageing tier — never free-form", actor: "ED-AGT-202", estimatedMins: 2, position: { x: X(6), y: Y(0) } },
    { id: "j2-dispute", type: "ai_reasoning", label: "Classify dispute root cause", description: "Read invoice line detail against the governing contract and cite the clause", actor: "ED-AGT-202", estimatedMins: 4, position: { x: X(6), y: Y(1) } },
    { id: "j2-memo", type: "ai_reasoning", label: "Assemble credit memo", description: "Evidence, clause citation and calculation, with the approval level the value requires", actor: "ED-AGT-202", estimatedMins: 3, position: { x: X(7), y: Y(1) } },
    { id: "j2-authority", type: "make_decision", label: "Credit memo authority gate", description: "Apply the delegation-of-authority matrix to the memo value", actor: "ED-AGT-202", position: { x: X(8), y: Y(1) } },
    { id: "j2-controller", type: "expert_approval", label: "Branch controller approval", description: "Required for credit memos from $10,000 to $100,000", actor: "Branch Controller", estimatedMins: 15, position: { x: X(9), y: Y(1) } },
    { id: "j2-cfo", type: "expert_approval", label: "Regional CFO approval", description: "Required for credit memos above $100,000", actor: "Regional CFO", estimatedMins: 30, position: { x: X(9), y: Y(2) } },
    { id: "j2-holdcheck", type: "make_decision", label: "Credit hold guard", description: "Strategic and OEM-affiliated accounts always require human approval regardless of exposure", actor: "ED-AGT-201", position: { x: X(6), y: Y(3) } },
    { id: "j2-creditmgr", type: "expert_approval", label: "Credit manager approval", description: "Human decision on the hold, with relationship cost presented alongside recoverable exposure", actor: "Credit Manager", estimatedMins: 20, position: { x: X(7), y: Y(3) } },
    { id: "j2-applyhold", type: "take_action", label: "Apply credit hold", description: "Applied account-wide across all branches with justification reference recorded", actor: "ED-AGT-202", estimatedMins: 1, position: { x: X(8), y: Y(3) } },
    { id: "j2-issue", type: "take_action", label: "Issue credit memo", description: "Post the approved memo and notify the customer using approved language", actor: "ED-AGT-202", estimatedMins: 1, position: { x: X(10), y: Y(1) } },
    { id: "j2-notify", type: "send_notification", label: "Report cycle outcome", description: "Recoverable exposure, actions taken, relationship value at risk, and unresolved disagreements", actor: "ED-AGT-200", position: { x: X(11), y: Y(1) } },
    { id: "j2-end", type: "end", label: "Cycle complete", description: "Actions recorded with justification and approver attribution", actor: "System", position: { x: X(12), y: Y(1) } },
  ],
  edges: [
    { id: "j2-e0", from: "j2-trigger", to: "j2-portfolio" },
    { id: "j2-e1", from: "j2-portfolio", to: "j2-disputes" },
    { id: "j2-e2", from: "j2-disputes", to: "j2-behaviour" },
    { id: "j2-e3", from: "j2-behaviour", to: "j2-exposure" },
    { id: "j2-e4", from: "j2-exposure", to: "j2-route" },
    { id: "j2-e5", from: "j2-route", to: "j2-dun", label: "Routine delinquency", condition: "action == 'dun'" },
    { id: "j2-e6", from: "j2-route", to: "j2-dispute", label: "Dispute driving the balance", condition: "action == 'resolve_dispute'" },
    { id: "j2-e7", from: "j2-route", to: "j2-holdcheck", label: "Hold candidate", condition: "action == 'credit_hold'" },
    { id: "j2-e8", from: "j2-dispute", to: "j2-memo" },
    { id: "j2-e9", from: "j2-memo", to: "j2-authority" },
    { id: "j2-e10", from: "j2-authority", to: "j2-issue", label: "≤ $10,000", condition: "memo.amount <= 10000" },
    { id: "j2-e11", from: "j2-authority", to: "j2-controller", label: "$10k – $100k", condition: "memo.amount > 10000 && memo.amount <= 100000" },
    { id: "j2-e12", from: "j2-authority", to: "j2-cfo", label: "> $100,000", condition: "memo.amount > 100000" },
    { id: "j2-e13", from: "j2-controller", to: "j2-issue", label: "Approved", condition: "approval.granted == true" },
    { id: "j2-e14", from: "j2-cfo", to: "j2-issue", label: "Approved", condition: "approval.granted == true" },
    { id: "j2-e15", from: "j2-controller", to: "j2-notify", label: "Declined", condition: "approval.granted == false" },
    { id: "j2-e16", from: "j2-cfo", to: "j2-notify", label: "Declined", condition: "approval.granted == false" },
    { id: "j2-e17", from: "j2-holdcheck", to: "j2-creditmgr", label: "Strategic / OEM-affiliated", condition: "account.tier in ['strategic','oem_affiliated']" },
    { id: "j2-e18", from: "j2-holdcheck", to: "j2-creditmgr", label: "Standard tier", condition: "account.tier == 'standard'" },
    { id: "j2-e19", from: "j2-creditmgr", to: "j2-applyhold", label: "Hold approved", condition: "approval.granted == true" },
    { id: "j2-e20", from: "j2-creditmgr", to: "j2-dun", label: "Hold declined", condition: "approval.granted == false" },
    { id: "j2-e21", from: "j2-applyhold", to: "j2-notify" },
    { id: "j2-e22", from: "j2-dun", to: "j2-notify" },
    { id: "j2-e23", from: "j2-issue", to: "j2-notify" },
    { id: "j2-e24", from: "j2-notify", to: "j2-end" },
  ],
};

// ─── J3 — Warranty Recovery ───────────────────────────────────────────────────
export const J3_FLOW: ProcessFlowGraph = {
  version: PROCESS_FLOW_VERSION,
  name: "Service Work Order → OEM Warranty Claim → Cash",
  nodes: [
    { id: "j3-trigger", type: "trigger", label: "Work order completed", description: "A service job is closed and enters warranty screening", actor: "System", position: { x: X(0), y: Y(1) } },
    { id: "j3-wo", type: "get_info", label: "Load work order", description: "Labour lines, parts consumed, technician narrative and completion date", actor: "ED-AGT-301", estimatedMins: 1, position: { x: X(1), y: Y(1) } },
    { id: "j3-asset", type: "make_decision", label: "Resolve equipment identity", description: "Serial or PIN must resolve to exactly one fleet asset, corroborated by make and model", actor: "ED-AGT-301", position: { x: X(2), y: Y(1) } },
    { id: "j3-escalate", type: "expert_approval", label: "Service writer disambiguation", description: "Human resolves a serial that collides across manufacturers — the agent never guesses", actor: "Service Writer", estimatedMins: 10, position: { x: X(2), y: Y(3) } },
    { id: "j3-terms", type: "get_info", label: "Load live OEM program terms", description: "Coverage window, published labour standards and documentation requirements, revalidated not cached", actor: "ED-AGT-301", estimatedMins: 1, position: { x: X(3), y: Y(1) } },
    { id: "j3-coverage", type: "make_decision", label: "Coverage adjudication", description: "Check calendar months AND meter hours; check repeat-failure provisions before concluding out-of-coverage", actor: "ED-AGT-301", position: { x: X(4), y: Y(1) } },
    { id: "j3-goodwill", type: "expert_approval", label: "Goodwill review", description: "Out-of-coverage repair routed to a human for goodwill or customer-pay — never submitted hopefully", actor: "Service Manager", estimatedMins: 15, position: { x: X(5), y: Y(3) } },
    { id: "j3-labour", type: "ai_reasoning", label: "Cap labour at published standard", description: "Compare booked hours to standard time; absorb undocumented overage rather than claiming it", actor: "ED-AGT-301", estimatedMins: 2, position: { x: X(5), y: Y(1) } },
    { id: "j3-narrative", type: "ai_reasoning", label: "Construct failure narrative", description: "Build complaint, cause and correction with a named causal part from terse technician notes", actor: "ED-AGT-302", estimatedMins: 3, position: { x: X(6), y: Y(1) } },
    { id: "j3-narrcheck", type: "make_decision", label: "Cause established?", description: "If the notes do not establish a cause, request clarification — never infer one", actor: "ED-AGT-302", position: { x: X(7), y: Y(1) } },
    { id: "j3-clarify", type: "send_notification", label: "Request technician clarification", description: "Return to the technician for the missing cause rather than fabricating a causal chain", actor: "ED-AGT-302", position: { x: X(7), y: Y(3) } },
    { id: "j3-gate", type: "make_decision", label: "Pre-submission compliance gate", description: "Coverage, labour, causal part, narrative and identity all re-checked before any portal call", actor: "ED-AGT-302", position: { x: X(8), y: Y(1) } },
    { id: "j3-submit", type: "take_action", label: "Submit to OEM portal", description: "Submit the compliance-passed claim to the correct manufacturer portal", actor: "ED-AGT-302", estimatedMins: 2, position: { x: X(9), y: Y(0) } },
    { id: "j3-adjudicate", type: "get_info", label: "Retrieve adjudication result", description: "Approved, denied with reason code, or partially approved with labour write-down", actor: "ED-AGT-302", estimatedMins: 1, position: { x: X(10), y: Y(0) } },
    { id: "j3-denial", type: "make_decision", label: "Denial analysis", description: "Classify honestly as resubmittable, correctable, or genuine loss", actor: "ED-AGT-302", position: { x: X(11), y: Y(0) } },
    { id: "j3-post", type: "take_action", label: "Post warranty receivable", description: "Post to the branch that did the work, in the period the repair obligation was satisfied", actor: "ED-AGT-302", estimatedMins: 1, position: { x: X(12), y: Y(1) } },
    { id: "j3-writeoff", type: "take_action", label: "Record documented write-off", description: "Record the denial reason so the cause distribution stays visible rather than absorbed silently", actor: "ED-AGT-302", estimatedMins: 1, position: { x: X(12), y: Y(2) } },
    { id: "j3-notify", type: "send_notification", label: "Report recovery metrics", description: "Denial rate, days-to-reimbursement, recovery rate, goodwill value and denial-cause distribution", actor: "ED-AGT-300", position: { x: X(13), y: Y(1) } },
    { id: "j3-end", type: "end", label: "Claim cycle complete", description: "Outcome recorded with full evidence chain", actor: "System", position: { x: X(14), y: Y(1) } },
  ],
  edges: [
    { id: "j3-e0", from: "j3-trigger", to: "j3-wo" },
    { id: "j3-e1", from: "j3-wo", to: "j3-asset" },
    { id: "j3-e2", from: "j3-asset", to: "j3-terms", label: "Single asset resolved", condition: "asset.candidates == 1" },
    { id: "j3-e3", from: "j3-asset", to: "j3-escalate", label: "Ambiguous serial", condition: "asset.candidates != 1" },
    { id: "j3-e4", from: "j3-escalate", to: "j3-terms", label: "Resolved by human", condition: "approval.granted == true" },
    { id: "j3-e5", from: "j3-escalate", to: "j3-notify", label: "Cannot resolve", condition: "approval.granted == false" },
    { id: "j3-e6", from: "j3-terms", to: "j3-coverage" },
    { id: "j3-e7", from: "j3-coverage", to: "j3-labour", label: "In coverage", condition: "coverage.verdict == 'in_coverage'" },
    { id: "j3-e8", from: "j3-coverage", to: "j3-goodwill", label: "Out of coverage", condition: "coverage.verdict == 'out_of_coverage'" },
    { id: "j3-e9", from: "j3-goodwill", to: "j3-notify", label: "Goodwill or customer-pay", condition: "true" },
    { id: "j3-e10", from: "j3-labour", to: "j3-narrative" },
    { id: "j3-e11", from: "j3-narrative", to: "j3-narrcheck" },
    { id: "j3-e12", from: "j3-narrcheck", to: "j3-gate", label: "Cause established", condition: "narrative.causeEstablished == true" },
    { id: "j3-e13", from: "j3-narrcheck", to: "j3-clarify", label: "Cause missing", condition: "narrative.causeEstablished == false" },
    { id: "j3-e14", from: "j3-clarify", to: "j3-notify" },
    { id: "j3-e15", from: "j3-gate", to: "j3-submit", label: "PASS", condition: "gate.result == 'PASS'" },
    { id: "j3-e16", from: "j3-gate", to: "j3-goodwill", label: "FAIL", condition: "gate.result == 'FAIL'" },
    { id: "j3-e17", from: "j3-submit", to: "j3-adjudicate" },
    { id: "j3-e18", from: "j3-adjudicate", to: "j3-post", label: "Approved", condition: "claim.status == 'approved'" },
    { id: "j3-e19", from: "j3-adjudicate", to: "j3-denial", label: "Denied or partial", condition: "claim.status in ['denied','partial']" },
    { id: "j3-e20", from: "j3-denial", to: "j3-gate", label: "Resubmittable", condition: "denial.class == 'resubmittable'" },
    { id: "j3-e21", from: "j3-denial", to: "j3-writeoff", label: "Genuine loss", condition: "denial.class == 'genuine_loss'" },
    { id: "j3-e22", from: "j3-post", to: "j3-notify" },
    { id: "j3-e23", from: "j3-writeoff", to: "j3-notify" },
    { id: "j3-e24", from: "j3-notify", to: "j3-end" },
  ],
};

// ─── J4 — Rental Billing Integrity ────────────────────────────────────────────
export const J4_FLOW: ProcessFlowGraph = {
  version: PROCESS_FLOW_VERSION,
  name: "Rental Contract Billing Integrity & Revenue Assurance",
  nodes: [
    { id: "j4-trigger", type: "trigger", label: "Cycle billing due", description: "Rental contracts reach their billing cycle date", actor: "System", position: { x: X(0), y: Y(1) } },
    { id: "j4-contracts", type: "get_info", label: "Load contracts & terms", description: "Contract-specific rates, included hours and charge schedules — never branch defaults", actor: "ED-AGT-401", estimatedMins: 2, position: { x: X(1), y: Y(1) } },
    { id: "j4-telematics", type: "get_info", label: "Pull telematics utilisation", description: "AEMP / ISO 15143-3 engine hours, location history and reporting gaps for the cycle period", actor: "ED-AGT-401", estimatedMins: 2, position: { x: X(2), y: Y(1) } },
    { id: "j4-gapcheck", type: "make_decision", label: "Telematics coverage sufficient?", description: "A reporting gap cannot support a billing claim in either direction", actor: "ED-AGT-401", position: { x: X(3), y: Y(1) } },
    { id: "j4-gapflag", type: "expert_approval", label: "Human review of reporting gap", description: "Rental manager decides on a period the machine did not report — the agent never extrapolates", actor: "Rental Manager", estimatedMins: 10, position: { x: X(3), y: Y(3) } },
    { id: "j4-reconcile", type: "ai_reasoning", label: "Reconcile billed vs actual", description: "Compare against contract terms and verified utilisation; record variance and direction per line", actor: "ED-AGT-401", estimatedMins: 4, position: { x: X(4), y: Y(1) } },
    { id: "j4-asc842", type: "make_decision", label: "Purchase option present?", description: "Rental-purchase options trigger ASC 842 lease-classification review before any revenue posts", actor: "ED-AGT-402", position: { x: X(5), y: Y(1) } },
    { id: "j4-leasereview", type: "expert_approval", label: "ASC 842 classification review", description: "Accounting classifies the contract before revenue is recognised as operating rental", actor: "Financial Controller", estimatedMins: 25, position: { x: X(5), y: Y(3) } },
    { id: "j4-variance", type: "make_decision", label: "Variance direction", description: "Under-billed, over-billed, or clean — all three are reported, none suppressed", actor: "ED-AGT-402", position: { x: X(6), y: Y(1) } },
    { id: "j4-substantiate", type: "ai_reasoning", label: "Substantiate ancillary charges", description: "Damage, fuel and cleaning charges checked against the check-in condition report and baseline", actor: "ED-AGT-402", estimatedMins: 3, position: { x: X(7), y: Y(0) } },
    { id: "j4-adjust", type: "ai_reasoning", label: "Prepare billing adjustment", description: "Adjustment in the evidenced direction with hour-meter evidence attached", actor: "ED-AGT-402", estimatedMins: 2, position: { x: X(8), y: Y(1) } },
    { id: "j4-authority", type: "make_decision", label: "Adjustment authority gate", description: "Adjustments above the agent ceiling require the branch controller", actor: "ED-AGT-402", position: { x: X(9), y: Y(1) } },
    { id: "j4-controller", type: "expert_approval", label: "Branch controller approval", description: "Required for adjustments above $10,000 in either direction", actor: "Branch Controller", estimatedMins: 15, position: { x: X(10), y: Y(2) } },
    { id: "j4-release", type: "take_action", label: "Release cycle invoice", description: "Release the reconciled invoice with each line traced to its evidence source", actor: "ED-AGT-402", estimatedMins: 1, position: { x: X(11), y: Y(1) } },
    { id: "j4-notify", type: "send_notification", label: "Report both directions", description: "Under-billing recovered AND over-billing corrected, with over-billing reported first", actor: "ED-AGT-400", position: { x: X(12), y: Y(1) } },
    { id: "j4-end", type: "end", label: "Cycle complete", description: "Billing released with evidence chain intact", actor: "System", position: { x: X(13), y: Y(1) } },
  ],
  edges: [
    { id: "j4-e0", from: "j4-trigger", to: "j4-contracts" },
    { id: "j4-e1", from: "j4-contracts", to: "j4-telematics" },
    { id: "j4-e2", from: "j4-telematics", to: "j4-gapcheck" },
    { id: "j4-e3", from: "j4-gapcheck", to: "j4-reconcile", label: "Coverage complete", condition: "telematics.gaps == 0" },
    { id: "j4-e4", from: "j4-gapcheck", to: "j4-gapflag", label: "Reporting gap", condition: "telematics.gaps > 0" },
    { id: "j4-e5", from: "j4-gapflag", to: "j4-reconcile", label: "Human decision recorded", condition: "true" },
    { id: "j4-e6", from: "j4-reconcile", to: "j4-asc842" },
    { id: "j4-e7", from: "j4-asc842", to: "j4-variance", label: "No purchase option", condition: "contract.hasPurchaseOption == false" },
    { id: "j4-e8", from: "j4-asc842", to: "j4-leasereview", label: "Purchase option present", condition: "contract.hasPurchaseOption == true" },
    { id: "j4-e9", from: "j4-leasereview", to: "j4-variance", label: "Classified", condition: "approval.granted == true" },
    { id: "j4-e10", from: "j4-leasereview", to: "j4-notify", label: "Revenue held", condition: "approval.granted == false" },
    { id: "j4-e11", from: "j4-variance", to: "j4-substantiate", label: "Variance found", condition: "variance.amount != 0" },
    { id: "j4-e12", from: "j4-variance", to: "j4-release", label: "Clean", condition: "variance.amount == 0" },
    { id: "j4-e13", from: "j4-substantiate", to: "j4-adjust" },
    { id: "j4-e14", from: "j4-adjust", to: "j4-authority" },
    { id: "j4-e15", from: "j4-authority", to: "j4-release", label: "≤ $10,000", condition: "adjustment.amount <= 10000" },
    { id: "j4-e16", from: "j4-authority", to: "j4-controller", label: "> $10,000", condition: "adjustment.amount > 10000" },
    { id: "j4-e17", from: "j4-controller", to: "j4-release", label: "Approved", condition: "approval.granted == true" },
    { id: "j4-e18", from: "j4-controller", to: "j4-notify", label: "Declined", condition: "approval.granted == false" },
    { id: "j4-e19", from: "j4-release", to: "j4-notify" },
    { id: "j4-e20", from: "j4-notify", to: "j4-end" },
  ],
};

// ─── J5 — Whole-goods Deal Desk ───────────────────────────────────────────────
export const J5_FLOW: ProcessFlowGraph = {
  version: PROCESS_FLOW_VERSION,
  name: "Whole-goods Deal Desk — Quote to Invoice Margin Protection",
  nodes: [
    { id: "j5-trigger", type: "trigger", label: "Quote submitted to deal desk", description: "A salesperson submits a whole-goods quote for review before issuance", actor: "System", position: { x: X(0), y: Y(1) } },
    { id: "j5-deal", type: "get_info", label: "Load deal structure", description: "Unit configuration, proposed price, discount, trade-in and salesperson authority level", actor: "ED-AGT-501", estimatedMins: 1, position: { x: X(1), y: Y(1) } },
    { id: "j5-cost", type: "get_info", label: "Assemble true landed cost", description: "Invoice cost plus freight, prep, attachments and floor plan interest accrued in inventory", actor: "ED-AGT-501", estimatedMins: 2, position: { x: X(2), y: Y(1) } },
    { id: "j5-trade", type: "make_decision", label: "Trade-in present?", description: "Trade-ins require comparable-based valuation before margin can be assessed", actor: "ED-AGT-501", position: { x: X(3), y: Y(1) } },
    { id: "j5-comps", type: "ai_reasoning", label: "Value trade against auction comps", description: "Value against recent comparable sales adjusted for condition and reconditioning; name any over-allowance as discount", actor: "ED-AGT-501", estimatedMins: 4, position: { x: X(4), y: Y(0) } },
    { id: "j5-programs", type: "ai_reasoning", label: "Identify eligible programs", description: "Every rebate, volume program, floor plan credit and allowance the deal qualifies for, with claim deadlines", actor: "ED-AGT-502", estimatedMins: 3, position: { x: X(5), y: Y(1) } },
    { id: "j5-stacking", type: "ai_reasoning", label: "Apply stacking rules", description: "Determine the optimal LEGAL combination; name excluded programs and why", actor: "ED-AGT-502", estimatedMins: 2, position: { x: X(6), y: Y(1) } },
    { id: "j5-margin", type: "ai_reasoning", label: "Compute true margin after capture", description: "Margin assessed only after program capture, so good deals are not rejected on a pre-capture figure", actor: "ED-AGT-502", estimatedMins: 2, position: { x: X(7), y: Y(1) } },
    { id: "j5-obligation", type: "make_decision", label: "Bundled obligations?", description: "Deals bundling delivery, prep, extended coverage or training need ASC 606 splitting", actor: "ED-AGT-502", position: { x: X(8), y: Y(1) } },
    { id: "j5-split", type: "take_action", label: "Flag obligation split", description: "Flag for ASC 606 performance-obligation allocation before invoicing", actor: "ED-AGT-502", estimatedMins: 1, position: { x: X(8), y: Y(3) } },
    { id: "j5-authority", type: "make_decision", label: "Effective discount authority gate", description: "Headline discount PLUS trade over-allowance measured against the authority matrix", actor: "ED-AGT-502", position: { x: X(9), y: Y(1) } },
    { id: "j5-branch", type: "expert_approval", label: "Branch manager approval", description: "Required where effective discount exceeds salesperson authority", actor: "Branch Manager", estimatedMins: 20, position: { x: X(10), y: Y(2) } },
    { id: "j5-regional", type: "expert_approval", label: "Regional approval", description: "Required for the deepest discount tier — no retroactive approval, no quarter-end exception", actor: "Regional Sales Director", estimatedMins: 45, position: { x: X(10), y: Y(3) } },
    { id: "j5-summary", type: "take_action", label: "Issue deal desk summary", description: "True margin, program capture, valuation basis and flagged risks returned to the salesperson", actor: "ED-AGT-500", estimatedMins: 1, position: { x: X(11), y: Y(1) } },
    { id: "j5-notify", type: "send_notification", label: "Report desk outcome", description: "Margin improvement, program value captured, deals blocked pending authority, deadlines approaching", actor: "ED-AGT-500", position: { x: X(12), y: Y(1) } },
    { id: "j5-end", type: "end", label: "Review complete", description: "Deal cleared for quote issuance or held for authority", actor: "System", position: { x: X(13), y: Y(1) } },
  ],
  edges: [
    { id: "j5-e0", from: "j5-trigger", to: "j5-deal" },
    { id: "j5-e1", from: "j5-deal", to: "j5-cost" },
    { id: "j5-e2", from: "j5-cost", to: "j5-trade" },
    { id: "j5-e3", from: "j5-trade", to: "j5-comps", label: "Trade-in present", condition: "deal.hasTradeIn == true" },
    { id: "j5-e4", from: "j5-trade", to: "j5-programs", label: "No trade-in", condition: "deal.hasTradeIn == false" },
    { id: "j5-e5", from: "j5-comps", to: "j5-programs" },
    { id: "j5-e6", from: "j5-programs", to: "j5-stacking" },
    { id: "j5-e7", from: "j5-stacking", to: "j5-margin" },
    { id: "j5-e8", from: "j5-margin", to: "j5-obligation" },
    { id: "j5-e9", from: "j5-obligation", to: "j5-authority", label: "Single obligation", condition: "deal.bundledComponents == 0" },
    { id: "j5-e10", from: "j5-obligation", to: "j5-split", label: "Bundled", condition: "deal.bundledComponents > 0" },
    { id: "j5-e11", from: "j5-split", to: "j5-authority" },
    { id: "j5-e12", from: "j5-authority", to: "j5-summary", label: "Within salesperson authority", condition: "effectiveDiscountPct <= authority.salesperson" },
    { id: "j5-e13", from: "j5-authority", to: "j5-branch", label: "Above salesperson authority", condition: "effectiveDiscountPct > authority.salesperson && effectiveDiscountPct <= authority.branch" },
    { id: "j5-e14", from: "j5-authority", to: "j5-regional", label: "Above branch authority", condition: "effectiveDiscountPct > authority.branch" },
    { id: "j5-e15", from: "j5-branch", to: "j5-summary", label: "Approved", condition: "approval.granted == true" },
    { id: "j5-e16", from: "j5-regional", to: "j5-summary", label: "Approved", condition: "approval.granted == true" },
    { id: "j5-e17", from: "j5-branch", to: "j5-notify", label: "Declined", condition: "approval.granted == false" },
    { id: "j5-e18", from: "j5-regional", to: "j5-notify", label: "Declined", condition: "approval.granted == false" },
    { id: "j5-e19", from: "j5-summary", to: "j5-notify" },
    { id: "j5-e20", from: "j5-notify", to: "j5-end" },
  ],
};

export const DEALER_PROCESS_FLOWS: Record<string, ProcessFlowGraph> = {
  "ED-J1": J1_FLOW,
  "ED-J2": J2_FLOW,
  "ED-J3": J3_FLOW,
  "ED-J4": J4_FLOW,
  "ED-J5": J5_FLOW,
};

/**
 * Invariants the flow compiler does not itself enforce (see the platform's
 * known under-validation of business invariants): exactly one trigger, at
 * least one end, no orphan nodes, no dangling edge endpoints, and every
 * decision node branching on explicit conditions.
 */
export function validateProcessFlows(): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  for (const [id, flow] of Object.entries(DEALER_PROCESS_FLOWS)) {
    const ids = new Set(flow.nodes.map((n) => n.id));
    const triggers = flow.nodes.filter((n) => n.type === "trigger");
    const ends = flow.nodes.filter((n) => n.type === "end");

    if (triggers.length !== 1) errors.push(`${id}: expected exactly 1 trigger, found ${triggers.length}`);
    if (ends.length < 1) errors.push(`${id}: no end node`);

    for (const e of flow.edges) {
      if (!ids.has(e.from)) errors.push(`${id}: edge ${e.id} has unknown source "${e.from}"`);
      if (!ids.has(e.to)) errors.push(`${id}: edge ${e.id} has unknown target "${e.to}"`);
    }

    const incoming = new Set(flow.edges.map((e) => e.to));
    const outgoing = new Set(flow.edges.map((e) => e.from));
    for (const n of flow.nodes) {
      if (n.type !== "trigger" && !incoming.has(n.id)) errors.push(`${id}: node "${n.id}" (${n.label}) is unreachable — no incoming edge`);
      if (n.type !== "end" && !outgoing.has(n.id)) errors.push(`${id}: node "${n.id}" (${n.label}) is a dead end — no outgoing edge`);
    }

    for (const n of flow.nodes.filter((x) => x.type === "make_decision")) {
      const out = flow.edges.filter((e) => e.from === n.id);
      if (out.length < 2) errors.push(`${id}: decision "${n.id}" (${n.label}) has ${out.length} outgoing edge(s); a decision needs at least 2`);
      for (const e of out) {
        if (!e.condition) errors.push(`${id}: decision "${n.id}" edge ${e.id} has no condition`);
      }
    }
  }
  return { ok: errors.length === 0, errors };
}
