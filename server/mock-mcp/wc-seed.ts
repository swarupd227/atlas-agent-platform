/**
 * One Workers' Compensation submission book, five systems.
 *
 * The WC underwriting journey reads the submission repository, the class and
 * bureau services, the rating engine, the policy administration system and the
 * bordereau queue. Each of them has to agree with the others to the cent --
 * the payroll on the ACORD 130 is the payroll the rating engine prices and the
 * bordereau reports -- so they are all generated from this one file, with every
 * disagreement deliberate.
 *
 * EVERYTHING HERE IS A FIXTURE. Rates, class rule wording, the mod worksheet,
 * the forecast and the benchmark are illustrative values chosen so the
 * acceptance tests in the design specification are exact. None of it is NCCI
 * or bureau content, a filed rate, or a calibrated model, and every response
 * built from it says so (`mode: "fixture"`).
 */

export const MODE = "fixture" as const;
export const TENANT_ID = "tenant-astra-mga-demo";
export const FIXTURE_NOTICE =
  "Fixture mode: illustrative data for design validation. Not bureau, NCCI or filed-rate content; never use it as production underwriting data.";

export const now = () => new Date().toISOString();

/** Decimal money: integer cents, half-up, so 165,657.96 is 165,657.96 and not a float approximation of it. */
export const cents = (n: number) => Math.round((n + Number.EPSILON) * 100);
export const money = (n: number) => cents(n) / 100;

export type StateCode = "FL" | "GA" | "NC";

export interface EmployeeGroup {
  groupId: string;
  state: StateCode;
  description: string;
  headcount: number;
  duties: string;
  /** Where the duty description is evidenced. */
  dutiesSource: string;
}

export interface PayrollAllocation {
  allocationId: string;
  state: StateCode;
  classCode: string;
  groupId: string;
  payroll: number;
  /** Row in the payroll schedule the figure was read from. */
  sourceRow: number;
}

export interface Claim {
  claimRef: string;
  priorPolicyRef: string;
  injuryDate: string;
  reportedDate: string;
  status: "open" | "closed";
  claimType: "indemnity" | "medical_only";
  incurred: number;
  paid: number;
  outstanding: number;
  expenseBasis: string;
  attorneyRepresented: boolean;
  notes: string;
  /** Loss-run row this claim was read from. */
  sourceRow: number;
}

export interface LossRunDocument {
  documentId: string;
  priorPolicyRef: string;
  policyPeriod: string;
  carrier: string;
  valuationDate: string;
  claims: Claim[];
}

export interface Subcontractor {
  subcontractorId: string;
  name: string;
  trade: string;
  certificate: null | {
    certificateId: string;
    namedInsured: string;
    carrier: string;
    policyNumber: string;
    effectiveDate: string;
    expirationDate: string;
    wcStatutory: boolean;
  };
}

export interface ModWorksheet {
  worksheetId: string;
  entityName: string;
  fein: string;
  ratingEffectiveDate: string;
  expirationDate: string;
  modValue: number;
  issuedBy: string;
  documentId: string;
}

export interface SubmissionSeed {
  submissionId: string;
  insuredId: string;
  legalName: string;
  fein: string;
  brokerId: string;
  brokerName: string;
  jurisdictions: StateCode[];
  proposedEffectiveDate: string;
  proposedPolicyId: string;
  priorPolicyRefs: string[];
  receivedAt: string;
  /** Total payroll the ACORD 130 states. The schedule must reconcile to it. */
  acordStatedPayroll: number;
  /** Class rows the ACORD lists that the payroll schedule does not carry (a reconciliation gap). */
  acordUnscheduledRows?: Array<{ state: StateCode; classCode: string; payroll: number }>;
  /** The broker's own prior-loss summary on the ACORD, valued earlier than the loss runs. */
  brokerLossSummary?: Array<{ claimRef: string; incurred: number; valuationDate: string; locator: string }>;
  employeeGroups: EmployeeGroup[];
  allocations: PayrollAllocation[];
  lossRuns: LossRunDocument[];
  modWorksheet: ModWorksheet | null;
  forecast: { status: "available"; value: number; interval: [number, number] } | { status: "unavailable"; reason: string };
  subcontractors: Subcontractor[];
  hazards: Array<{ hazardId: string; observation: string; source: string; locator: string }>;
  operationsEvidence: Array<{
    source: "osha_establishment_search" | "state_contractor_licensing" | "news_and_web";
    status: "found" | "none_found" | "unavailable";
    observations: Array<{ summary: string; url: string; retrievedAt: string; entityMatch: string }>;
    reason?: string;
  }>;
}

// ── Illustrative rate table ───────────────────────────────────────────────────
// Rate per $100 of payroll, by state and class. Chosen so the specification's
// fixture holds exactly: the reported allocation prices at a $148,200 base, and
// moving $320,000 from FL 8810 to FL 5606 adds exactly $18,400 (5.95 - 0.20 =
// 5.75 per $100 x 3,200). These are not filed rates.
export const RATE_TABLE_VERSION = "WC-RATES-FIXTURE-2026.4";
export const RATES: Record<string, number> = {
  "FL:8810": 0.20,
  "FL:5606": 5.95,
  "FL:5403": 6.10,
  "FL:5190": 3.40,
  "GA:5221": 4.30,
  "GA:8810": 0.20,
  "GA:5403": 4.10,
  "NC:5403": 4.70,
  "NC:5606": 1.98,
  "NC:8810": 0.19,
  "GA:5022": 4.85,
  "NC:5022": 4.40,
};

export const CLASS_TITLES: Record<string, string> = {
  "8810": "Clerical Office Employees NOC",
  "5606": "Contractor — Project Manager, Construction Executive, Construction Manager or Construction Superintendent",
  "5403": "Carpentry NOC",
  "5221": "Concrete or Cement Work — Floors, Driveways, Yards or Sidewalks",
  "5190": "Electrical Wiring — Within Buildings",
  "5022": "Masonry NOC",
};

/** Commission the program pays the MGA on WC premium. Net premium = gross - commission. */
export const PROGRAM = {
  carrierCode: "CARRIER-B",
  carrierName: "Carrier B Casualty Company (fixture)",
  programId: "PRG-WC-SE-2026",
  programName: "Southeast Contractors Workers' Compensation",
  commissionPct: 12,
  bordereauTemplateVersion: "CARRIER-B-WC-BDX-v1.2",
  currency: "USD",
} as const;

/**
 * The carrier's authority configuration. The authority gateway (G50) evaluates
 * these as data; nothing here is an NCCI requirement. The forecast threshold is
 * strictly greater-than: exactly 1.15 does not trigger it.
 */
export const AUTHORITY = {
  configVersion: "CARRIER-B-WC-AUTH-2026.2",
  forecastModReferralThreshold: 1.15,
  forecastModReferralRule: "AUTH-FCST-01: forecast mod strictly greater than 1.15 requires carrier referral (demo carrier policy, advisory forecast only).",
  missingForecastRule: "AUTH-FCST-02: when no validated forecast is available, a manual authority review is required -- a missing forecast is never a pass.",
  underwriterPremiumAuthority: 250_000,
  premiumAuthorityRule: "AUTH-PREM-01: an underwriter may quote up to $250,000 annual premium without referral.",
  scheduleAuthority: { underwriterMaxAbsPct: 10, referralMaxAbsPct: 25 },
  waiverRights: {
    "SUBJ-COI": "carrier_referral_only",
    "SUBJ-FALL": "not_waivable",
    "SUBJ-CLAIM": "carrier_referral_only",
    "SUBJ-MOD": "not_waivable",
    "SUBJ-CLASS": "not_waivable",
  } as Record<string, string>,
} as const;

/** Schedule-rating plan: criteria a debit or credit can be justified by, and the plan range. */
export const SCHEDULE_PLAN = {
  planVersion: "CARRIER-B-WC-SCHED-2026.1",
  effectiveFrom: "2026-01-01",
  minPct: -25,
  maxPct: 25,
  criteria: {
    safety_organization: "Formal safety program, written and enforced, with a designated safety coordinator.",
    management_cooperation: "Management's cooperation with the carrier's loss-control recommendations.",
    employee_selection_training: "Hiring standards, training and supervision of employees.",
    premises_equipment: "Condition and maintenance of premises, tools and equipment.",
    medical_facilities: "Availability of first aid and medical facilities.",
    classification_peculiarities: "Risk characteristics that differ from the typical risk in the governing class and are NOT already reflected in the class rate.",
  } as Record<string, string>,
  /**
   * Reasons the plan refuses because they double-count something priced
   * elsewhere, or are not rating characteristics at all. Height exposure is in
   * the construction class rates; missing COIs are a coverage/subjectivity
   * matter handled before bind, not a premium debit.
   */
  disallowedReasons: [
    { pattern: "height", why: "Work-at-height exposure is already reflected in the construction class rates; debiting it again double-counts." },
    { pattern: "coi", why: "Missing or expired subcontractor certificates are a pre-bind subjectivity, not a schedule-rating characteristic." },
    { pattern: "certificate", why: "Missing or expired subcontractor certificates are a pre-bind subjectivity, not a schedule-rating characteristic." },
    { pattern: "forecast", why: "The forecast mod is advisory and feeds authority, never pricing." },
  ],
  rationaleRequired: true,
} as const;

/** Model registry entry for the advisory forecast. */
export const FORECAST_MODEL = {
  modelId: "wc-mod-forecast",
  modelVersion: "fixture-0.3",
  validationStatus: "fixture — not a validated actuarial model",
  horizon: "next anniversary rating (12 months after the proposed effective date)",
  assumptions: [
    "Open indemnity claims develop to the fixture's adverse-development scenario.",
    "Payroll stays within 5% of the submitted exposure.",
    "No change in the split point or ballast values.",
  ],
} as const;

/** Descriptive claim-duration benchmark. Not a survival model. */
export const DURATION_BENCHMARKS: Record<string, { medianOpenDays: number; cohort: string; basis: string; benchmarkVersion: string }> = {
  "construction:indemnity:lost_time": {
    medianOpenDays: 245,
    cohort: "Construction trades, lost-time indemnity claims, Southeast, accident years 2021-2024",
    basis: "Illustrative descriptive median for design validation (fixture). Not a survival model and not a measured industry statistic.",
    benchmarkVersion: "DUR-BENCH-FIXTURE-2026.1",
  },
};

// ── Submission 1: the specification's core scenario ──────────────────────────

const APEX: SubmissionSeed = {
  submissionId: "SUB-2026-4471",
  insuredId: "ACCT-204471",
  legalName: "Apex Commercial Builders LLC",
  fein: "59-4471208",
  brokerId: "BRK-BRIDGE-SE",
  brokerName: "Bridge Specialty — Southeast",
  jurisdictions: ["FL", "GA", "NC"],
  proposedEffectiveDate: "2026-12-01",
  proposedPolicyId: "POL-2026-4471-WC",
  priorPolicyRefs: ["POL-2025-3318-WC", "POL-2024-2207-WC", "POL-2023-1185-WC", "POL-2022-0964-WC"],
  receivedAt: "2026-10-14T15:20:00.000Z",
  acordStatedPayroll: 4_200_000,
  // Valued four months before the loss run: the same claim at two valuations.
  // The loss review must keep both, not pick one.
  brokerLossSummary: [{ claimRef: "WC-8902", incurred: 79_500, valuationDate: "2026-06-30", locator: "p.3, Prior Carrier Information" }],
  employeeGroups: [
    { groupId: "GRP-FL-PM", state: "FL", description: "Florida project managers", headcount: 4, duties: "Approximately 60% of time on active construction sites supervising subcontractors and inspecting work in progress; the remainder in the office on scheduling, estimating and owner meetings. No manual labor.", dutiesSource: "DOC-4471-SUPP p.2, Q7" },
    { groupId: "GRP-FL-OFF", state: "FL", description: "Florida office and administration", headcount: 6, duties: "Accounting, payroll, estimating support and reception. Confined to the Tampa office.", dutiesSource: "DOC-4471-SUPP p.2, Q6" },
    { groupId: "GRP-FL-CARP", state: "FL", description: "Florida carpentry crews", headcount: 18, duties: "Framing, formwork and finish carpentry on commercial projects up to four stories.", dutiesSource: "DOC-4471-SUPP p.3, Q9" },
    { groupId: "GRP-GA-CONC", state: "GA", description: "Georgia concrete crews", headcount: 15, duties: "Slab, sidewalk and driveway concrete placement and finishing.", dutiesSource: "DOC-4471-SUPP p.3, Q10" },
    { groupId: "GRP-GA-OFF", state: "GA", description: "Georgia office", headcount: 5, duties: "Clerical and dispatch, Atlanta office only.", dutiesSource: "DOC-4471-SUPP p.2, Q6" },
    { groupId: "GRP-NC-CARP", state: "NC", description: "North Carolina carpentry crews", headcount: 20, duties: "Framing and finish carpentry, commercial interiors.", dutiesSource: "DOC-4471-SUPP p.3, Q9" },
    { groupId: "GRP-NC-SUPT", state: "NC", description: "North Carolina superintendents", headcount: 5, duties: "Full-time job-site superintendents; no manual labor.", dutiesSource: "DOC-4471-SUPP p.2, Q8" },
  ],
  // Reported allocation. FL 8810 carries 650,000: 320,000 of it is the four
  // project managers, 330,000 the office. The 5606 candidate is NOT reported --
  // it is what the class review proposes.
  allocations: [
    { allocationId: "ALC-4471-01", state: "FL", classCode: "8810", groupId: "GRP-FL-PM", payroll: 320_000, sourceRow: 4 },
    { allocationId: "ALC-4471-02", state: "FL", classCode: "8810", groupId: "GRP-FL-OFF", payroll: 330_000, sourceRow: 5 },
    { allocationId: "ALC-4471-03", state: "FL", classCode: "5403", groupId: "GRP-FL-CARP", payroll: 900_000, sourceRow: 6 },
    { allocationId: "ALC-4471-04", state: "GA", classCode: "5221", groupId: "GRP-GA-CONC", payroll: 800_000, sourceRow: 7 },
    { allocationId: "ALC-4471-05", state: "GA", classCode: "8810", groupId: "GRP-GA-OFF", payroll: 350_000, sourceRow: 8 },
    { allocationId: "ALC-4471-06", state: "NC", classCode: "5403", groupId: "GRP-NC-CARP", payroll: 1_000_000, sourceRow: 9 },
    { allocationId: "ALC-4471-07", state: "NC", classCode: "5606", groupId: "GRP-NC-SUPT", payroll: 500_000, sourceRow: 10 },
  ],
  lossRuns: [
    {
      documentId: "DOC-4471-LR-2025", priorPolicyRef: "POL-2025-3318-WC", policyPeriod: "2025-12-01 to 2026-12-01", carrier: "Prior Carrier: Granite Mutual (fixture)", valuationDate: "2026-10-15",
      claims: [
        { claimRef: "WC-8902", priorPolicyRef: "POL-2025-3318-WC", injuryDate: "2025-09-26", reportedDate: "2025-09-30", status: "open", claimType: "indemnity", incurred: 84_000, paid: 32_000, outstanding: 52_000, expenseBasis: "incurred = paid + case reserve (loss only, ALAE excluded)", attorneyRepresented: true, notes: "Fall from second-floor deck edge, lumbar injury. Surgery pending authorization.", sourceRow: 3 },
        { claimRef: "WC-9014", priorPolicyRef: "POL-2025-3318-WC", injuryDate: "2026-03-11", reportedDate: "2026-03-11", status: "closed", claimType: "medical_only", incurred: 2_350, paid: 2_350, outstanding: 0, expenseBasis: "incurred = paid + case reserve (loss only, ALAE excluded)", attorneyRepresented: false, notes: "Laceration, hand. Returned same day.", sourceRow: 4 },
      ],
    },
    {
      documentId: "DOC-4471-LR-2024", priorPolicyRef: "POL-2024-2207-WC", policyPeriod: "2024-12-01 to 2025-12-01", carrier: "Prior Carrier: Granite Mutual (fixture)", valuationDate: "2026-10-15",
      claims: [
        { claimRef: "WC-7741", priorPolicyRef: "POL-2024-2207-WC", injuryDate: "2025-02-17", reportedDate: "2025-02-18", status: "closed", claimType: "indemnity", incurred: 18_600, paid: 18_600, outstanding: 0, expenseBasis: "incurred = paid + case reserve (loss only, ALAE excluded)", attorneyRepresented: false, notes: "Shoulder strain lifting formwork. Closed 2025-07-02.", sourceRow: 3 },
        { claimRef: "WC-7802", priorPolicyRef: "POL-2024-2207-WC", injuryDate: "2025-05-06", reportedDate: "2025-05-06", status: "closed", claimType: "medical_only", incurred: 1_420, paid: 1_420, outstanding: 0, expenseBasis: "incurred = paid + case reserve (loss only, ALAE excluded)", attorneyRepresented: false, notes: "Foreign body, eye.", sourceRow: 4 },
      ],
    },
    {
      documentId: "DOC-4471-LR-2023", priorPolicyRef: "POL-2023-1185-WC", policyPeriod: "2023-12-01 to 2024-12-01", carrier: "Prior Carrier: Granite Mutual (fixture)", valuationDate: "2026-10-15",
      claims: [
        { claimRef: "WC-6650", priorPolicyRef: "POL-2023-1185-WC", injuryDate: "2024-04-22", reportedDate: "2024-04-23", status: "closed", claimType: "medical_only", incurred: 3_100, paid: 3_100, outstanding: 0, expenseBasis: "incurred = paid + case reserve (loss only, ALAE excluded)", attorneyRepresented: false, notes: "Contusion, knee.", sourceRow: 3 },
      ],
    },
    {
      documentId: "DOC-4471-LR-2022", priorPolicyRef: "POL-2022-0964-WC", policyPeriod: "2022-12-01 to 2023-12-01", carrier: "Prior Carrier: Granite Mutual (fixture)", valuationDate: "2026-10-15",
      claims: [],
    },
  ],
  modWorksheet: { worksheetId: "MOD-4471-2026", entityName: "Apex Commercial Builders LLC", fein: "59-4471208", ratingEffectiveDate: "2026-12-01", expirationDate: "2027-12-01", modValue: 1.08, issuedBy: "Illustrative rating bureau worksheet (fixture)", documentId: "DOC-4471-MOD" },
  forecast: { status: "available", value: 1.24, interval: [1.14, 1.33] },
  subcontractors: [
    { subcontractorId: "SC-01", name: "Sunline Framing LLC", trade: "framing", certificate: { certificateId: "COI-SUN-2025", namedInsured: "Sunline Framing LLC", carrier: "Atlantic Casualty (fixture)", policyNumber: "WC-SUN-551", effectiveDate: "2025-09-01", expirationDate: "2026-08-31", wcStatutory: true } },
    { subcontractorId: "SC-02", name: "Delta Drywall Inc", trade: "drywall", certificate: null },
    { subcontractorId: "SC-03", name: "Gulf Coast Concrete LLC", trade: "concrete pumping", certificate: { certificateId: "COI-GCC-2026", namedInsured: "Gulf Coast Concrete Inc", carrier: "Peachtree Mutual (fixture)", policyNumber: "WC-GCC-118", effectiveDate: "2026-02-01", expirationDate: "2027-02-01", wcStatutory: true } },
    { subcontractorId: "SC-04", name: "Piedmont Electric Co", trade: "electrical", certificate: { certificateId: "COI-PIE-2026", namedInsured: "Piedmont Electric Co", carrier: "Carolina Employers (fixture)", policyNumber: "WC-PIE-902", effectiveDate: "2026-06-01", expirationDate: "2027-06-01", wcStatutory: true } },
    { subcontractorId: "SC-05", name: "Coastal Roofing Group", trade: "roofing", certificate: { certificateId: "COI-CRG-2026", namedInsured: "Coastal Roofing Group", carrier: "Atlantic Casualty (fixture)", policyNumber: "WC-CRG-337", effectiveDate: "2026-04-15", expirationDate: "2027-04-15", wcStatutory: false } },
    { subcontractorId: "SC-06", name: "Blue Ridge Plumbing LLC", trade: "plumbing", certificate: { certificateId: "COI-BRP-2026", namedInsured: "Blue Ridge Plumbing LLC", carrier: "Carolina Employers (fixture)", policyNumber: "WC-BRP-440", effectiveDate: "2026-01-01", expirationDate: "2027-01-01", wcStatutory: true } },
  ],
  hazards: [
    { hazardId: "HZ-01", observation: "Commercial projects up to four stories; carpentry crews work at leading edges.", source: "DOC-4471-SUPP", locator: "p.3, Q9" },
    { hazardId: "HZ-02", observation: "Written fall protection plan referenced in the safety section but not attached to the submission.", source: "DOC-4471-SUPP", locator: "p.4, Q14" },
    { hazardId: "HZ-03", observation: "Concrete pumping and mobile crane lifts are subcontracted (Gulf Coast Concrete).", source: "DOC-4471-SUPP", locator: "p.3, Q11" },
  ],
  operationsEvidence: [
    { source: "osha_establishment_search", status: "found", observations: [{ summary: "Inspection 1678204, Jacksonville FL site, 2025-03-12: one serious citation under 29 CFR 1926.501(b)(1) (unprotected sides and edges), penalty $4,200, abatement certified 2025-04-02.", url: "https://www.osha.gov/ords/imis/establishment.inspection_detail?id=1678204 (fixture record)", retrievedAt: "2026-10-15T09:00:00.000Z", entityMatch: "name and FEIN-derived establishment match (fixture)" }] },
    { source: "state_contractor_licensing", status: "found", observations: [{ summary: "Florida certified general contractor licence CGC-1531207 active through 2027-08-31; no disciplinary actions.", url: "https://www.myfloridalicense.com (fixture record)", retrievedAt: "2026-10-15T09:01:00.000Z", entityMatch: "exact legal-name match" }] },
    { source: "news_and_web", status: "unavailable", observations: [], reason: "The approved news source did not respond within the connector timeout. Treat as unknown, not as no adverse news." },
  ],
};

// ── Submission 2: forecast exactly at the threshold ─────────────────────────

const HARBOR_POINT: SubmissionSeed = {
  submissionId: "SUB-2026-4472",
  insuredId: "ACCT-204472",
  legalName: "Harbor Point Electrical Inc",
  fein: "59-4472316",
  brokerId: "BRK-BRIDGE-SE",
  brokerName: "Bridge Specialty — Southeast",
  jurisdictions: ["FL"],
  proposedEffectiveDate: "2026-12-15",
  proposedPolicyId: "POL-2026-4472-WC",
  priorPolicyRefs: ["POL-2025-3402-WC", "POL-2024-2290-WC", "POL-2023-1240-WC"],
  receivedAt: "2026-10-15T13:05:00.000Z",
  acordStatedPayroll: 1_100_000,
  employeeGroups: [
    { groupId: "GRP-FL-ELEC", state: "FL", description: "Electricians", headcount: 14, duties: "Interior commercial wiring, panel installation.", dutiesSource: "DOC-4472-SUPP p.2, Q7" },
    { groupId: "GRP-FL-OFF", state: "FL", description: "Office", headcount: 3, duties: "Office only.", dutiesSource: "DOC-4472-SUPP p.2, Q6" },
  ],
  allocations: [
    { allocationId: "ALC-4472-01", state: "FL", classCode: "5190", groupId: "GRP-FL-ELEC", payroll: 950_000, sourceRow: 4 },
    { allocationId: "ALC-4472-02", state: "FL", classCode: "8810", groupId: "GRP-FL-OFF", payroll: 150_000, sourceRow: 5 },
  ],
  lossRuns: [
    { documentId: "DOC-4472-LR-2025", priorPolicyRef: "POL-2025-3402-WC", policyPeriod: "2025-12-15 to 2026-12-15", carrier: "Prior Carrier: Granite Mutual (fixture)", valuationDate: "2026-10-15", claims: [
      { claimRef: "WC-9120", priorPolicyRef: "POL-2025-3402-WC", injuryDate: "2026-05-02", reportedDate: "2026-05-02", status: "closed", claimType: "medical_only", incurred: 980, paid: 980, outstanding: 0, expenseBasis: "incurred = paid + case reserve (loss only, ALAE excluded)", attorneyRepresented: false, notes: "Minor burn.", sourceRow: 3 },
    ] },
    { documentId: "DOC-4472-LR-2024", priorPolicyRef: "POL-2024-2290-WC", policyPeriod: "2024-12-15 to 2025-12-15", carrier: "Prior Carrier: Granite Mutual (fixture)", valuationDate: "2026-10-15", claims: [] },
    { documentId: "DOC-4472-LR-2023", priorPolicyRef: "POL-2023-1240-WC", policyPeriod: "2023-12-15 to 2024-12-15", carrier: "Prior Carrier: Granite Mutual (fixture)", valuationDate: "2026-10-15", claims: [] },
  ],
  modWorksheet: { worksheetId: "MOD-4472-2026", entityName: "Harbor Point Electrical Inc", fein: "59-4472316", ratingEffectiveDate: "2026-12-15", expirationDate: "2027-12-15", modValue: 1.02, issuedBy: "Illustrative rating bureau worksheet (fixture)", documentId: "DOC-4472-MOD" },
  forecast: { status: "available", value: 1.15, interval: [1.08, 1.21] },
  subcontractors: [
    { subcontractorId: "SC-11", name: "Tampa Bay Lifts LLC", trade: "aerial lift rental with operator", certificate: { certificateId: "COI-TBL-2026", namedInsured: "Tampa Bay Lifts LLC", carrier: "Atlantic Casualty (fixture)", policyNumber: "WC-TBL-210", effectiveDate: "2026-03-01", expirationDate: "2027-03-01", wcStatutory: true } },
  ],
  hazards: [{ hazardId: "HZ-11", observation: "Energized-work procedures documented; lockout/tagout program attached.", source: "DOC-4472-SUPP", locator: "p.3, Q12" }],
  operationsEvidence: [
    { source: "osha_establishment_search", status: "none_found", observations: [] },
    { source: "state_contractor_licensing", status: "found", observations: [{ summary: "Florida certified electrical contractor licence EC-13008841 active; no disciplinary actions.", url: "https://www.myfloridalicense.com (fixture record)", retrievedAt: "2026-10-15T09:02:00.000Z", entityMatch: "exact legal-name match" }] },
    { source: "news_and_web", status: "none_found", observations: [] },
  ],
};

// ── Submission 3: incomplete payroll and a mod worksheet for the wrong period ──

const RIDGELINE: SubmissionSeed = {
  submissionId: "SUB-2026-4473",
  insuredId: "ACCT-204473",
  legalName: "Ridgeline Masonry Co",
  fein: "58-4473027",
  brokerId: "BRK-BRIDGE-SE",
  brokerName: "Bridge Specialty — Southeast",
  jurisdictions: ["GA", "NC"],
  proposedEffectiveDate: "2027-01-01",
  proposedPolicyId: "POL-2027-4473-WC",
  priorPolicyRefs: ["POL-2026-1902-WC"],
  receivedAt: "2026-10-16T10:40:00.000Z",
  // The ACORD says 2,000,000; the schedule's rows add to 1,750,000. The
  // missing 250,000 is NC payroll nobody allocated -- it must block rating
  // readiness, never be invented to make the totals agree.
  acordStatedPayroll: 2_000_000,
  acordUnscheduledRows: [{ state: "NC", classCode: "5022", payroll: 250_000 }],
  employeeGroups: [
    { groupId: "GRP-GA-MAS", state: "GA", description: "Masonry crews", headcount: 22, duties: "Block and brick masonry, commercial.", dutiesSource: "DOC-4473-SUPP p.2, Q7" },
    { groupId: "GRP-GA-OFF", state: "GA", description: "Office", headcount: 4, duties: "Office only.", dutiesSource: "DOC-4473-SUPP p.2, Q6" },
    { groupId: "GRP-NC-MAS", state: "NC", description: "North Carolina masonry crew", headcount: 6, duties: "Block masonry.", dutiesSource: "DOC-4473-SUPP p.2, Q7" },
  ],
  allocations: [
    { allocationId: "ALC-4473-01", state: "GA", classCode: "5022", groupId: "GRP-GA-MAS", payroll: 1_500_000, sourceRow: 4 },
    { allocationId: "ALC-4473-02", state: "GA", classCode: "8810", groupId: "GRP-GA-OFF", payroll: 250_000, sourceRow: 5 },
  ],
  lossRuns: [
    { documentId: "DOC-4473-LR-2026", priorPolicyRef: "POL-2026-1902-WC", policyPeriod: "2026-01-01 to 2027-01-01", carrier: "Prior Carrier: Granite Mutual (fixture)", valuationDate: "2026-10-15", claims: [] },
  ],
  // Worksheet for the PRIOR rating period: valid document, wrong period.
  modWorksheet: { worksheetId: "MOD-4473-2025", entityName: "Ridgeline Masonry Co", fein: "58-4473027", ratingEffectiveDate: "2026-01-01", expirationDate: "2027-01-01", modValue: 0.97, issuedBy: "Illustrative rating bureau worksheet (fixture)", documentId: "DOC-4473-MOD" },
  forecast: { status: "unavailable", reason: "Fewer than three years of eligible loss experience; the model does not produce a forecast for this risk." },
  subcontractors: [],
  hazards: [{ hazardId: "HZ-21", observation: "Scaffold erection is performed by own crews.", source: "DOC-4473-SUPP", locator: "p.3, Q11" }],
  operationsEvidence: [
    { source: "osha_establishment_search", status: "unavailable", observations: [], reason: "Source unavailable at retrieval time. Treat as unknown." },
    { source: "state_contractor_licensing", status: "found", observations: [{ summary: "Georgia licence active.", url: "https://sos.ga.gov (fixture record)", retrievedAt: "2026-10-16T10:45:00.000Z", entityMatch: "exact legal-name match" }] },
    { source: "news_and_web", status: "none_found", observations: [] },
  ],
};

export const SUBMISSIONS: Record<string, SubmissionSeed> = {
  [APEX.submissionId]: APEX,
  [HARBOR_POINT.submissionId]: HARBOR_POINT,
  [RIDGELINE.submissionId]: RIDGELINE,
};

export const getSubmission = (id: unknown): SubmissionSeed | undefined =>
  typeof id === "string" ? SUBMISSIONS[id.trim()] : undefined;

export const findSubmissionByInsured = (ref: unknown): SubmissionSeed | undefined => {
  const r = String(ref ?? "").trim().toLowerCase();
  if (!r) return undefined;
  return Object.values(SUBMISSIONS).find((s) =>
    s.insuredId.toLowerCase() === r || s.legalName.toLowerCase() === r || s.fein === r || s.submissionId.toLowerCase() === r);
};

/**
 * The candidate reclassification the class review is expected to surface for
 * Apex: the four FL project managers from 8810 to 5606. Accepting it moves
 * exactly 320,000 and leaves the total untouched.
 */
export const CLASS_CANDIDATE = {
  submissionId: "SUB-2026-4471",
  findingId: "FND-4471-CLS-01",
  fromAllocationId: "ALC-4471-01",
  state: "FL" as StateCode,
  fromClass: "8810",
  toClass: "5606",
  groupId: "GRP-FL-PM",
  payroll: 320_000,
};

/**
 * Illustrative classification rule excerpts. Paraphrased for design validation
 * -- NOT licensed manual text. `nonOverridable` marks a rule a free-text
 * override cannot set aside: it has to be resolved, or referred.
 */
export const CLASS_RULES: Record<string, Array<{
  ruleId: string; classCode: string; jurisdiction: StateCode | "ALL"; effectiveFrom: string;
  title: string; excerpt: string; prerequisites: string[]; nonOverridable: boolean;
}>> = {
  "8810": [
    { ruleId: "CLS-8810-R1", classCode: "8810", jurisdiction: "ALL", effectiveFrom: "2026-01-01", title: "Clerical office employees — scope", excerpt: "Applies to employees whose duties are confined to clerical work in an office that is physically separated from the operational hazards of the business.", prerequisites: ["Duties confined to the office", "Office physically separated from operations"], nonOverridable: false },
    { ruleId: "CLS-8810-R2", classCode: "8810", jurisdiction: "ALL", effectiveFrom: "2026-01-01", title: "Standard exception — exposure to operations", excerpt: "An employee who is regularly exposed to the operational hazards of the business, including regular visits to job sites, does not qualify for the clerical standard exception for that exposure. The payroll must be assigned to the classification describing the exposure, or the question referred.", prerequisites: ["No regular job-site exposure"], nonOverridable: true },
  ],
  "5606": [
    { ruleId: "CLS-5606-R1", classCode: "5606", jurisdiction: "ALL", effectiveFrom: "2026-01-01", title: "Construction executive or superintendent — scope", excerpt: "Applies to project managers, construction executives and superintendents of a contractor who supervise construction at job sites and perform no direct manual labor.", prerequisites: ["Supervises construction operations at job sites", "Performs no direct manual labor"], nonOverridable: false },
    { ruleId: "CLS-5606-R2", classCode: "5606", jurisdiction: "ALL", effectiveFrom: "2026-01-01", title: "Payroll records", excerpt: "The employer must maintain payroll records that separately identify the employees assigned to this classification.", prerequisites: ["Separate payroll records for the employees"], nonOverridable: false },
  ],
  "5403": [
    { ruleId: "CLS-5403-R1", classCode: "5403", jurisdiction: "ALL", effectiveFrom: "2026-01-01", title: "Carpentry NOC", excerpt: "Applies to carpentry not otherwise classified, including framing and finish work.", prerequisites: ["Carpentry operations"], nonOverridable: false },
  ],
  "5221": [
    { ruleId: "CLS-5221-R1", classCode: "5221", jurisdiction: "ALL", effectiveFrom: "2026-01-01", title: "Concrete flatwork", excerpt: "Applies to concrete or cement work on floors, driveways, yards or sidewalks.", prerequisites: ["Concrete flatwork"], nonOverridable: false },
  ],
  "5022": [
    { ruleId: "CLS-5022-R1", classCode: "5022", jurisdiction: "ALL", effectiveFrom: "2026-01-01", title: "Masonry NOC", excerpt: "Applies to stone, brick and block masonry not otherwise classified.", prerequisites: ["Masonry operations"], nonOverridable: false },
  ],
  "5190": [
    { ruleId: "CLS-5190-R1", classCode: "5190", jurisdiction: "ALL", effectiveFrom: "2026-01-01", title: "Electrical wiring within buildings", excerpt: "Applies to electrical wiring within buildings, including installation of panels and fixtures.", prerequisites: ["Electrical wiring within buildings"], nonOverridable: false },
  ],
};
export const CLASS_RULE_VERSION = "WC-CLASS-RULES-FIXTURE-2026.1 (illustrative paraphrase, not licensed manual text)";

/** Days between two ISO dates, counted in UTC calendar days. */
export function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.UTC(+fromIso.slice(0, 4), +fromIso.slice(5, 7) - 1, +fromIso.slice(8, 10));
  const b = Date.UTC(+toIso.slice(0, 4), +toIso.slice(5, 7) - 1, +toIso.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

/** Total payroll in the payroll schedule's rows (not the ACORD's stated figure). */
export const scheduledPayroll = (s: SubmissionSeed) => s.allocations.reduce((n, a) => n + a.payroll, 0);

/**
 * Subjectivities raised for every submission at intake. Apex carries all five
 * from the specification; the others carry the ones their facts warrant.
 */
export function initialSubjectivities(s: SubmissionSeed) {
  const list = [
    { id: "SUBJ-MOD", requirement: "Verify the current experience mod worksheet for the insured and the proposed effective period.", ownerRole: "underwriter", dueStage: "pre_quote" },
    { id: "SUBJ-CLASS", requirement: "Confirm class duties and record a disposition for every class finding.", ownerRole: "underwriter", dueStage: "pre_quote" },
  ];
  if (s.subcontractors.length) list.push({ id: "SUBJ-COI", requirement: "Obtain and review current certificates of insurance for every subcontractor on the roster.", ownerRole: "broker_supplies_underwriting_reviews", dueStage: "pre_bind" });
  if (s.hazards.some((h) => /fall protection/i.test(h.observation))) list.push({ id: "SUBJ-FALL", requirement: "Risk control review of the written fall protection plan.", ownerRole: "risk_control", dueStage: "pre_bind" });
  const openIndemnity = s.lossRuns.flatMap((l) => l.claims).filter((c) => c.status === "open" && c.claimType === "indemnity");
  if (openIndemnity.length) list.push({ id: "SUBJ-CLAIM", requirement: `Obtain an updated status for open claim${openIndemnity.length > 1 ? "s" : ""} ${openIndemnity.map((c) => c.claimRef).join(", ")} from the prior carrier.`, ownerRole: "broker_supplies_underwriting_reviews", dueStage: "pre_bind" });
  return list;
}
