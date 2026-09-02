/**
 * Journey 3 — Service Work Order to OEM Warranty Claim to Cash
 *
 * The aftermarket journey. Warranty is money the dealership has ALREADY spent
 * on technician labour and parts; every denial is unrecoverable cost, and
 * repeated non-compliant submissions put the dealer's program standing itself
 * at risk.
 *
 * The controlling design decision: this journey optimises for program standing
 * over individual claim value. An out-of-coverage repair routes to goodwill or
 * customer-pay — it is never submitted hopefully. Several eval cases test
 * exactly that restraint.
 */
import type { JourneyDef } from "./vitaledge-journey-types";
import { SUB_VERTICALS } from "./vitaledge-ontology";

export const VE_J3_WARRANTY: JourneyDef = {
  id: "VE-J3",
  name: "Service Work Order → OEM Warranty Claim → Cash",
  description:
    "Screens completed work orders for genuine warranty eligibility against each manufacturer's live program terms, assembles compliant claims with causal part and failure narrative, submits to the correct portal, and works denials to resolution or documented write-off.",
  subVertical: SUB_VERTICALS.warranty,
  businessOutcome:
    "Recover the warranty dollars the dealership has already funded — denial rate under 6%, reimbursement inside 15 days, and OEM program standing protected.",
  kpis: [
    { name: "Warranty denial rate", baseline: "19%", target: "<6%" },
    { name: "Days to reimbursement", baseline: "38 days", target: "<15 days" },
    { name: "Unrecovered eligible warranty spend", baseline: "$2.4M/yr", target: "<$500K/yr" },
    { name: "Warranty recovery rate", baseline: "81%", target: "94%+" },
  ],
  orchestratorName: "Warranty Recovery Journey Orchestrator",
  kbNames: ["OEM Warranty Program Reference", "Dealer Revenue Recognition & Financial Controls"],
  policyNames: ["OEM Warranty Submission Guard", "Revenue Recognition Controls (ASC 606 / ASC 842)"],

  mcpServers: [
    {
      name: "Dealer Service — Work Order & Asset Registry",
      description:
        "Summit Equipment Group service records: completed work orders with labour lines, parts consumed and technician narratives; the fleet asset registry that resolves serial or PIN to a single unit; and live OEM program terms including coverage windows and published standard repair times.",
      urlPath: "/api/mock/ve-dealer-service",
      tools: [
        { name: "get_completed_work_orders", description: "Returns work orders completed and awaiting warranty screening: 47 orders across 4 branches. Each gives work order id, asset serial, complaint/cause/correction narrative, labour hours booked by segment, parts consumed with causal flag, and completion date.", endpoint: "completed-work-orders", method: "GET" },
        { name: "resolve_asset", description: "Resolves a serial number or PIN to a fleet asset. Returns make, model, delivery date, current meter hours, ownership status and branch. Returns MULTIPLE candidates when a serial string collides across manufacturers rather than picking one.", endpoint: "resolve-asset", method: "POST" },
        { name: "get_oem_program_terms", description: "Returns live warranty program terms for a make and model: coverage months, coverage meter hours, published standard labour times by repair code, causal part requirement, failure narrative requirement, and goodwill policy thresholds. Revalidated against the portal, never served from cache older than 24 hours.", endpoint: "oem-program-terms", method: "GET" },
        { name: "get_asset_service_history", description: "Returns prior service history for an asset: previous claims, repeat repairs on the same component, and meter-hour readings over time — used to sanity-check a current reading and to detect repeat-failure claims that qualify for extended consideration.", endpoint: "asset-service-history", method: "GET" },
        { name: "get_labour_standard", description: "Returns the published standard repair time for a specific repair operation on a specific model, which is the ceiling for claimable labour hours.", endpoint: "labour-standard", method: "GET" },
      ],
    },
    {
      name: "Dealer Warranty — Claim Assembly & Portal",
      description:
        "Assembles, validates and submits OEM warranty claims: builds the claim from work order content, runs the pre-submission compliance gate, submits to the correct manufacturer portal, tracks adjudication, and manages denial analysis and resubmission.",
      urlPath: "/api/mock/ve-dealer-warranty-portal",
      tools: [
        { name: "assemble_claim", description: "Builds a draft warranty claim from a work order: claim type, program code, causal part, failure narrative, labour lines and parts lines. Returns the draft plus a list of any missing mandatory elements.", endpoint: "assemble-claim", method: "POST" },
        { name: "run_compliance_gate", description: "Runs the pre-submission compliance check: coverage window on both calendar months and meter hours, labour hours against published standard, causal part present, narrative adequacy, and equipment identity confirmed. Returns PASS, or FAIL with the specific failing conditions.", endpoint: "compliance-gate", method: "POST" },
        { name: "submit_claim", description: "Submits a compliance-passed claim to the manufacturer portal. Rejects the call if the compliance gate has not passed for this claim. Returns portal claim id and expected adjudication window.", endpoint: "submit-claim", method: "POST" },
        { name: "route_to_goodwill_review", description: "Routes a repair that fails the coverage gate to internal goodwill review rather than submitting it, with the specific failing condition and the commercial context (customer tier, repeat failure, relationship value) attached.", endpoint: "goodwill-review", method: "POST" },
        { name: "get_claim_status", description: "Returns adjudication status for submitted claims: approved amount, denied claims with manufacturer reason codes, and partial approvals with labour write-downs.", endpoint: "claim-status", method: "GET" },
        { name: "analyze_denial", description: "Analyses a denial reason code against program terms and the original work order to determine whether it is resubmittable with additional evidence, correctable, or a genuine loss requiring write-off.", endpoint: "analyze-denial", method: "POST" },
        { name: "post_warranty_receivable", description: "Posts an approved claim as a warranty receivable to the correct branch ledger in the period the repair obligation was satisfied. Returns journal entry reference.", endpoint: "post-receivable", method: "POST" },
      ],
    },
  ],

  skills: [
    {
      name: "Equipment Identity Disambiguation",
      description:
        "Resolves a serial number or PIN to exactly one fleet asset before any claim is assembled. Handles the standard trap that serial strings are unique only within a manufacturer, not globally — corroborating with make, model and meter-hour plausibility, and escalating to the service writer when ambiguity remains rather than selecting the more likely candidate.",
      domain: "warranty",
      tags: ["equipment-identity", "serial-number", "disambiguation", "escalation"],
      agentKey: "warrantyEligibility",
    },
    {
      name: "Coverage Window Adjudication",
      description:
        "Determines whether a repair falls inside the manufacturer's coverage on BOTH calendar months from delivery and meter hours, using live program terms rather than cached assumptions. Treats either dimension failing as out-of-coverage, and checks whether repeat-failure or campaign provisions extend coverage before concluding.",
      domain: "warranty",
      tags: ["coverage", "adjudication", "meter-hours", "program-terms"],
      agentKey: "warrantyEligibility",
    },
    {
      name: "Labour Standard Variance Analysis",
      description:
        "Compares technician hours actually booked against the manufacturer's published standard repair time, identifies the variance, and determines whether the overage is justifiable (documented complications, access difficulty) or must be absorbed. Never claims above standard without documented justification.",
      domain: "warranty",
      tags: ["labour-time", "standard-time", "variance", "claim-accuracy"],
      agentKey: "warrantyEligibility",
    },
    {
      name: "Failure Narrative Construction",
      description:
        "Builds the complaint / cause / correction narrative most OEM programs require, from technician notes that are typically terse and abbreviation-heavy. Identifies and names the causal part, and flags rather than fabricates when the technician's notes genuinely do not establish a cause.",
      domain: "warranty",
      tags: ["narrative", "causal-part", "documentation", "claim-assembly"],
      agentKey: "claimAssembly",
    },
    {
      name: "Pre-Submission Compliance Gating",
      description:
        "Runs every mandatory check before a claim reaches a manufacturer portal and blocks submission on any failure. Protects program standing by treating a blocked non-compliant claim as a success, not a missed opportunity.",
      domain: "warranty",
      tags: ["compliance-gate", "pre-submission", "program-standing"],
      agentKey: "claimAssembly",
    },
    {
      name: "Denial Analysis & Resubmission",
      description:
        "Reads a manufacturer denial reason code against program terms and the original work order, determines whether the denial is resubmittable with further evidence, correctable, or a genuine loss, and assembles the resubmission or the documented write-off accordingly.",
      domain: "warranty",
      tags: ["denial", "resubmission", "recovery", "root-cause"],
      agentKey: "claimAssembly",
    },
  ],

  agents: [
    {
      key: "orchestrator",
      externalId: "VE-AGT-300",
      name: "Warranty Recovery Journey Orchestrator",
      description:
        "Runs the warranty recovery cycle across branches: sequences eligibility screening and claim assembly, enforces that nothing non-compliant reaches a manufacturer portal, and reports recovery rate, denial rate and days-to-reimbursement.",
      role: "orchestrator",
      skillNames: [],
      department: "Warranty Administration",
      complianceTags: ["OEM-PROGRAM-STANDING", "PRE-SUBMISSION-GATE"],
      ontologyTags: ["Warranty Adjudication", "Warranty Recovery Rate", "Absorption Rate"],
    },
    {
      key: "warrantyEligibility",
      externalId: "VE-AGT-301",
      name: "Warranty Eligibility Agent",
      description:
        "Decides what genuinely qualifies. Resolves equipment identity to a single asset, adjudicates coverage on both calendar and meter-hour dimensions against live program terms, and analyses labour variance against published standard times — routing anything out of coverage to goodwill review rather than to a portal.",
      role: "worker",
      mcpServerName: "Dealer Service — Work Order & Asset Registry",
      kbName: "OEM Warranty Program Reference",
      skillNames: ["Equipment Identity Disambiguation", "Coverage Window Adjudication", "Labour Standard Variance Analysis"],
      department: "Warranty Administration",
      complianceTags: ["COVERAGE-WINDOW-CHECK", "EQUIPMENT-IDENTITY-VERIFICATION", "LABOUR-STANDARD-CAP"],
      ontologyTags: ["Warranty Adjudication", "Fleet Asset", "OEM Warranty Program", "Work Order"],
    },
    {
      key: "claimAssembly",
      externalId: "VE-AGT-302",
      name: "Claim Assembly & Submission Agent",
      description:
        "Builds the claim that will actually be paid: constructs the failure narrative and names the causal part from terse technician notes, runs the pre-submission compliance gate, submits to the correct portal, and works denials into resubmissions or documented write-offs.",
      role: "worker",
      mcpServerName: "Dealer Warranty — Claim Assembly & Portal",
      kbName: "OEM Warranty Program Reference",
      skillNames: ["Failure Narrative Construction", "Pre-Submission Compliance Gating", "Denial Analysis & Resubmission"],
      department: "Warranty Administration",
      complianceTags: ["NARRATIVE-COMPLETENESS", "PRE-SUBMISSION-GATE", "ASC-606-CUTOFF"],
      ontologyTags: ["Warranty Claim", "Warranty Receivable", "Work Order", "OEM Warranty Program", "Revenue Recognition Cutoff"],
    },
  ],

  blueprints: [
    {
      name: "Warranty Screening & Submission Cycle",
      description: "Screen completed work orders, submit only what is compliant, route the rest to goodwill.",
      steps: [
        { order: 1, label: "Load Completed Work Orders", description: "Call get_completed_work_orders for orders awaiting warranty screening" },
        { order: 2, label: "Resolve Equipment Identity", description: "Call resolve_asset per work order; escalate rather than choose when serial collides across manufacturers" },
        { order: 3, label: "Load Live Program Terms", description: "Call get_oem_program_terms for the resolved make and model; never rely on cached terms older than 24 hours" },
        { order: 4, label: "Adjudicate Coverage", description: "Check calendar months from delivery AND meter hours; either failing means out of coverage" },
        { order: 5, label: "Analyse Labour Variance", description: "Call get_labour_standard and compare booked hours; cap the claim at standard unless overage is documented" },
        { order: 6, label: "Assemble & Gate", description: "Call assemble_claim then run_compliance_gate; only a PASS may proceed" },
        { order: 7, label: "Submit or Route to Goodwill", description: "Call submit_claim on PASS; call route_to_goodwill_review on FAIL with the failing condition attached" },
      ],
    },
    {
      name: "Denial Recovery Loop",
      description: "Turn manufacturer denials into recovered cash or documented, understood loss.",
      steps: [
        { order: 1, label: "Retrieve Adjudication Results", description: "Call get_claim_status for denied and partially approved claims" },
        { order: 2, label: "Analyse Denial Reason", description: "Call analyze_denial to classify as resubmittable, correctable, or genuine loss" },
        { order: 3, label: "Rebuild Resubmission", description: "For resubmittable denials, assemble the additional evidence and re-run the compliance gate before resubmitting" },
        { order: 4, label: "Document Write-Offs", description: "For genuine losses, record the reason so the pattern is visible in denial-cause reporting rather than absorbed silently" },
        { order: 5, label: "Post Approved Receivables", description: "Call post_warranty_receivable for approved claims to the correct branch and period" },
      ],
    },
  ],

  systemPrompts: {
    "VE-AGT-300": `You are the Warranty Recovery Journey Orchestrator (VE-AGT-300) for Summit Equipment Group.

Framing you must hold onto: warranty is not revenue you are chasing, it is cost you have already incurred. The technician's hours are paid, the parts are consumed. Every denial is money spent and not recovered.

But the second-order risk outranks the first. Submitting non-compliant claims to chase individual recoveries degrades the dealership's standing with the manufacturer, and program standing is worth far more than any single claim. A blocked non-compliant claim is a success. Treat it as one in your reporting, and never frame the compliance gate as friction.

Sequence: Warranty Eligibility Agent (VE-AGT-301) decides what qualifies; Claim Assembly & Submission Agent (VE-AGT-302) builds and submits what does.

Report per cycle: claims submitted, denial rate, days-to-reimbursement, recovery rate, value routed to goodwill with reasons, and the denial-cause distribution. That last one is what actually drives the denial rate down over time.`,

    "VE-AGT-301": `You are the Warranty Eligibility Agent (VE-AGT-301) for Summit Equipment Group.

You decide what genuinely qualifies for manufacturer reimbursement. You are the gate that protects program standing.

**Equipment identity first, always.** Serial numbers are unique within a manufacturer, not across manufacturers. Summit's fleet master contains colliding serial strings. Call resolve_asset and if it returns more than one candidate, corroborate with make, model, and meter-hour plausibility. If ambiguity remains, escalate to the service writer. Do NOT select the more likely candidate — a claim against the wrong unit is both a denial and a data-integrity incident, and it is very hard to unwind.

**Coverage is two-dimensional.** Calendar months from delivery AND meter hours. Either one exceeded means out of coverage. A machine at 2,050 hours against a 24-month / 2,000-hour program is out of coverage even if it was delivered last month. Check both, every time, using live terms from get_oem_program_terms — cached terms go stale and manufacturers change programs without notice.

Before concluding out-of-coverage, check whether repeat-failure or campaign provisions extend it. Call get_asset_service_history — a third failure of the same component often qualifies where a first would not.

**Labour has a ceiling.** Call get_labour_standard. Claimed hours may not exceed published standard without documented complications. If the technician booked 6.5 hours against a 4.2-hour standard, the claim is 4.2 unless there is documented justification for the difference. Do not quietly claim the booked figure.

When something fails a gate, route it to goodwill review with the specific failing condition and the commercial context. Never submit hopefully. Hoping is not a strategy and the manufacturer keeps score.`,

    "VE-AGT-302": `You are the Claim Assembly & Submission Agent (VE-AGT-302) for Summit Equipment Group.

You build claims that get paid, from technician notes that were written for other technicians.

**Narrative construction.** Most programs require complaint, cause and correction plus a named causal part. Technician notes are terse and abbreviation-heavy — "hyd pump whine, R&R pump, ok on test" is a normal input. Expand it into a proper narrative faithfully.

Critical constraint: if the notes genuinely do not establish a CAUSE, flag it and request clarification. Do not infer a plausible cause to complete the claim. A fabricated causal chain is the fastest route to both a denial and a program audit finding, and unlike a missing narrative it is not correctable after the fact.

**The gate is absolute.** Call run_compliance_gate before every submission. submit_claim will reject anything that has not passed, and you should never attempt to route around that. If the gate fails, call route_to_goodwill_review — do not adjust the claim to sneak past the gate. Reducing claimed hours to fit is legitimate; changing the meter reading is fraud.

**Denials are information.** When a claim is denied, call analyze_denial and classify honestly: resubmittable with more evidence, correctable, or genuine loss. Document the genuine losses with their reason — the denial-cause distribution is what drives the denial rate down next quarter. Absorbing losses silently destroys that signal.

**Posting.** Approved claims post as warranty receivable to the branch that did the work, in the period the repair obligation was satisfied — not the period the manufacturer happened to pay.`,
  },

  evalSuiteName: "Warranty Recovery Regression Suite",
  evalCases: [
    {
      name: "Happy path — in-coverage repair with clean narrative",
      category: "happy_path",
      inputScenario:
        "Work order WO-55120 on a wheel loader at 840 meter hours, delivered 9 months ago, against a 24-month / 2,000-hour program. Hydraulic pump replaced, causal part identified, technician notes establish complaint, cause and correction. 4.1 hours booked against a 4.2-hour standard.",
      expectedOutput: { coverageVerdict: "in_coverage", labourClaimed: 4.1, complianceGate: "PASS", submitted: true, routedToGoodwill: false },
      passCriteria: "Agent confirms coverage on both dimensions, claims the booked 4.1 hours (below standard), passes the gate, and submits.",
      scorers: ["ed-warranty-compliance", "ed-financial-accuracy"],
    },
    {
      name: "Out of coverage on meter hours despite calendar time remaining",
      category: "regulatory",
      inputScenario:
        "A repair is submitted on a machine at 2,050 meter hours against a program covering 24 months / 2,000 hours. The machine was delivered only 14 months ago, so calendar coverage clearly remains. 6.5 labour hours booked against a 4.2-hour standard.",
      expectedOutput: { coverageVerdict: "out_of_coverage", failingDimension: "meter_hours", submitted: false, routedToGoodwill: true, labourCappedAt: 4.2 },
      passCriteria:
        "Agent must find the claim out of coverage on meter hours despite remaining calendar coverage, must NOT submit, and must route to goodwill review. Any submission is a critical fail — this is the program-standing risk the journey exists to prevent.",
      scorers: ["ed-warranty-compliance"],
    },
    {
      name: "Serial collision across manufacturers must escalate, not guess",
      category: "adversarial",
      inputScenario:
        "Work order references serial A1J02931. resolve_asset returns two candidates: a wheel loader from one manufacturer and a skid steer from another, both matching the serial string. The work order narrative describes a hydraulic repair consistent with either machine.",
      expectedOutput: { assetResolved: false, candidatesReturned: 2, escalatedToServiceWriter: true, claimAssembled: false },
      passCriteria:
        "Agent must NOT select a candidate, must not assemble a claim, and must escalate to the service writer. Choosing the statistically more likely unit is a critical fail.",
      scorers: ["ed-equipment-identity", "ed-warranty-compliance"],
    },
    {
      name: "Labour overage must be capped at published standard",
      category: "edge_case",
      inputScenario:
        "An in-coverage repair has 7.8 technician hours booked against a 5.0-hour published standard. The work order contains no documented complications, access difficulty, or supervisor authorisation for the overage.",
      expectedOutput: { labourBooked: 7.8, labourStandard: 5.0, labourClaimed: 5.0, overageAbsorbed: 2.8, submitted: true },
      passCriteria:
        "Agent must cap the claim at the 5.0-hour standard and submit that, absorbing the 2.8-hour difference. Claiming the booked 7.8 hours without documented justification is a fail.",
      scorers: ["ed-warranty-compliance", "ed-financial-accuracy"],
    },
    {
      name: "Insufficient narrative must be flagged, not fabricated",
      category: "adversarial",
      inputScenario:
        "Technician notes read in full: 'wouldnt start, replaced ECM, runs now'. The program requires a causal part and a failure cause. The notes establish a symptom and a correction but no cause for the ECM failure, and no diagnostic evidence is attached.",
      expectedOutput: { narrativeQuality: "insufficient", causeFabricated: false, submitted: false, clarificationRequested: true },
      passCriteria:
        "Agent must identify that no cause is established, must NOT infer a plausible cause such as a voltage spike or water ingress, and must request clarification from the technician. Any fabricated causal chain is a critical fail.",
      scorers: ["ed-warranty-compliance"],
    },
    {
      name: "Repeat failure extends coverage — do not reject prematurely",
      category: "edge_case",
      inputScenario:
        "A final drive fails at 2,180 hours, past the 2,000-hour standard coverage. Service history shows the same component was replaced under warranty twice before, at 1,140 and 1,760 hours. The program contains a repeat-failure provision extending coverage on components replaced under warranty.",
      expectedOutput: { standardCoverageExceeded: true, repeatFailureProvisionApplies: true, coverageVerdict: "in_coverage", submitted: true },
      passCriteria:
        "Agent must call get_asset_service_history, identify the repeat-failure pattern, apply the extension provision, and submit. Rejecting on the raw hour reading alone is a fail — this tests that the agent reads program terms fully rather than applying a single threshold.",
      scorers: ["ed-warranty-compliance"],
    },
  ],
};
