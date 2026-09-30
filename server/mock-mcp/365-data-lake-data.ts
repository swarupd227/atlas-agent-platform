/**
 * Seed data behind the mock "365 Retail" AWS data lake — the one connector the
 * design doc (365 Retail Agentic Workflows: Astra Agents Design, 2026-09-30)
 * calls out as genuinely new: "External MCP server (built in this program) —
 * Read Gold views through named, parameterised queries — Carries ADM,
 * Cantaloupe, telemetry and legacy ERP data that agents must not query
 * directly." Every other connector in this program (Salesforce, HubSpot,
 * Jira, Teams, and the new NetSuite/Zendesk connectors) is real; this one
 * stands in for the systems no demo can actually reach — the ADM/Cantaloupe
 * product platforms, the legacy ERP, and 365's own AWS data lake.
 *
 * Generated deterministically so every run sees the same estate. Two customer
 * bases (365 Retail Markets and the acquired Cantaloupe) are seeded with
 * DELIBERATE overlaps: the same operator often exists in both, under a
 * different name, id and owner -- this IS the problem UC02 (Master Customer
 * Identity) exists to solve, so it must not be pre-solved here. A handful of
 * reconciliation breaks, missing tax IDs and stale renewal dates are planted
 * on purpose for UC01/UC05/UC09 to find.
 *
 * Shapes are Gold-view-shaped (already joined/cleaned per source), not raw
 * source-system exports -- the data lake's own ingestion is out of scope; only
 * its READ surface (what UC01-UC09's agents actually call) is modelled.
 */

export type SourceSystem = "365_salesforce" | "cantaloupe_salesforce" | "netsuite" | "legacy_erp" | "hubspot";

export interface SilverCustomerRecord {
  recordId: string;
  source: SourceSystem;
  legalName: string;
  dba: string | null;
  taxId: string | null;
  billingAddress: string;
  billingState: string;
  ownerEmail: string;
  phone: string | null;
  parentRecordId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CandidatePair {
  pairId: string;
  recordIdA: string;
  recordIdB: string;
  score: number; // 0-1 weighted similarity
  matchedOn: string[]; // evidence ladder items that agreed
  band: "high" | "middle" | "low";
}

export interface CrosswalkEntry {
  masterKey: string;
  recordId: string;
  source: SourceSystem;
  rule: string; // e.g. "exact_tax_id", "steward_decision", "new_key"
  decider: string; // "system" or a steward's name
  decidedAt: string;
  reason: string;
}

export type Solution = "ADM" | "Kiosk" | "365Pay" | "Dining" | "Seed" | "Cantaloupe Micro Market" | "Cantaloupe Vending";

export interface Opportunity {
  id: string;
  masterKey: string | null;
  accountName: string;
  rep: string;
  region: "West" | "East" | "Central" | "South";
  solution: Solution;
  stage: "Prospecting" | "Proposal" | "Negotiation" | "Closed Won" | "Closed Lost";
  forecastCategory: "commit" | "best_case" | "pipeline" | "omitted";
  amount: number;
  closeDate: string;
  lastActivityDate: string;
}

export interface OrderRecord {
  id: string;
  masterKey: string | null;
  accountName: string;
  solution: Solution;
  amount: number;
  bookedDate: string;
  hasInvoice: boolean;
}

export interface InvoiceRecord {
  id: string;
  orderId: string | null;
  masterKey: string | null;
  accountName: string;
  amount: number;
  billedDate: string;
  status: "paid" | "open" | "overdue";
}

export interface SalesTarget {
  period: string; // "2026-Q4"
  rep: string;
  region: string;
  solution: Solution;
  amount: number;
}

const REPS = ["D. Alvarez", "K. Chen", "M. Okafor", "S. Petrov", "J. Whitfield", "R. Iyer"];
const REGIONS: Opportunity["region"][] = ["West", "East", "Central", "South"];
const SOLUTIONS: Solution[] = ["ADM", "Kiosk", "365Pay", "Dining", "Seed"];

/** ~40 operators, deliberately overlapping between 365 and Cantaloupe records
 *  under different names -- the UC02 matching problem, planted by hand so
 *  each pair is a genuine, explainable case rather than random noise. */
const OPERATOR_PAIRS: Array<{
  a: string; aState: string; aTax: string | null;
  b: string | null; bState: string | null; bTax: string | null; // null b = 365-only, no Cantaloupe overlap
}> = [
  { a: "Meridian Foodservice Group LLC", aState: "TX", aTax: "74-1234567", b: "Meridian Food Service Group", bState: "TX", bTax: "74-1234567" },
  { a: "Coastal Break Room Solutions Inc", aState: "CA", aTax: "94-2233445", b: "Coastal Breakroom Solutions", bState: "CA", bTax: null },
  { a: "Summit Unattended Retail Co", aState: "CO", aTax: "84-9988776", b: "Summit Unattended Retail", bState: "CO", bTax: "84-9988776" },
  { a: "Harbor Point Vending & Dining", aState: "MA", aTax: "04-5566778", b: "Harbor Pt Vending", bState: "MA", bTax: null },
  { a: "Prairie Micro Market Partners", aState: "IL", aTax: "36-1122334", b: "Prairie Micromarket Partners LLC", bState: "IL", bTax: "36-1122334" },
  { a: "Bluegrass Snack & Beverage LLC", aState: "KY", aTax: "61-3344556", b: null, bState: null, bTax: null },
  { a: "Redwood Office Refreshments", aState: "CA", aTax: "68-7788990", b: "Redwood Office Refreshment Co", bState: "CA", bTax: null },
  { a: "Lakeside Corporate Dining Group", aState: "MN", aTax: "41-2345678", b: null, bState: null, bTax: null },
  { a: "Desert Sun Vending Enterprises", aState: "AZ", aTax: "86-4455667", b: "Desert Sun Vending", bState: "AZ", bTax: "86-4455667" },
  { a: "Riverbend Hospitality Supply", aState: "OH", aTax: "31-5566779", b: null, bState: null, bTax: null },
  { a: "Golden Gate Kiosk Services LLC", aState: "CA", aTax: "94-6677889", b: "Golden Gate Kiosk Svcs", bState: "CA", bTax: null },
  { a: "Appalachian Break Room Co", aState: "WV", aTax: "55-7788001", b: null, bState: null, bTax: null },
  { a: "Emerald City Micro Markets", aState: "WA", aTax: "91-8899002", b: "Emerald City Micromarket", bState: "WA", bTax: "91-8899002" },
  { a: "Cascadia Workplace Dining", aState: "OR", aTax: "93-9900113", b: null, bState: null, bTax: null },
  { a: "Motor City Vending Alliance", aState: "MI", aTax: "38-0011224", b: "Motor City Vending", bState: "MI", bTax: null },
  { a: "Bayou Country Foodservice", aState: "LA", aTax: "72-1122335", b: null, bState: null, bTax: null },
  { a: "Great Lakes Snack Solutions LLC", aState: "WI", aTax: "39-2233446", b: "Great Lakes Snack Solutions", bState: "WI", bTax: "39-2233446" },
  { a: "Piedmont Corporate Refreshments", aState: "NC", aTax: "56-3344557", b: null, bState: null, bTax: null },
  { a: "Sonoran Break Room Partners", aState: "AZ", aTax: "86-4455668", b: "Sonoran Breakroom Ptrs", bState: "AZ", bTax: null },
  { a: "Hudson Valley Micro Market Co", aState: "NY", aTax: "13-5566780", b: "Hudson Valley Micromarket", bState: "NY", bTax: "13-5566780" },
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
function dateOffset(days: number): string {
  const d = new Date("2026-09-15T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const SILVER_CUSTOMERS: SilverCustomerRecord[] = OPERATOR_PAIRS.flatMap((p, i) => {
  const idA = `SFA-${String(1000 + i)}`;
  const recs: SilverCustomerRecord[] = [
    {
      recordId: idA,
      source: "365_salesforce",
      legalName: p.a,
      dba: null,
      taxId: p.aTax,
      billingAddress: `${100 + i} ${p.aState === "CA" ? "Pacific" : "Main"} St, Suite ${100 + (i % 9)}`,
      billingState: p.aState,
      ownerEmail: `${REPS[i % REPS.length].split(" ")[1].toLowerCase()}.${REPS[i % REPS.length].charAt(0).toLowerCase()}@365retail.example`,
      phone: `+1-555-01${String(10 + i).padStart(2, "0")}`,
      parentRecordId: null,
      createdAt: dateOffset(-365 - i * 3),
      updatedAt: dateOffset(-(i % 30)),
    },
  ];
  if (p.b) {
    recs.push({
      recordId: `CNT-${String(2000 + i)}`,
      source: "cantaloupe_salesforce",
      legalName: p.b,
      dba: i % 4 === 0 ? p.a.split(" ").slice(0, 2).join(" ") : null,
      taxId: p.bTax,
      billingAddress: `${100 + i} ${p.aState === "CA" ? "Pacific" : "Main"} St, Suite ${100 + (i % 9)}`,
      billingState: p.bState ?? p.aState,
      ownerEmail: `${REPS[(i + 2) % REPS.length].split(" ")[1].toLowerCase()}.${REPS[(i + 2) % REPS.length].charAt(0).toLowerCase()}@cantaloupe.example`,
      phone: p.bTax ? `+1-555-01${String(10 + i).padStart(2, "0")}` : null, // shared phone only when tax also matches -- a real evidence signal
      parentRecordId: null,
      createdAt: dateOffset(-200 - i * 2),
      updatedAt: dateOffset(-(i % 20)),
    });
  }
  return recs;
});

/** Precomputed candidate pairs -- the UC02 blocking+scoring step's OUTPUT,
 *  seeded directly since re-deriving similarity at request time isn't the
 *  point of the mock. High band (>=0.85) auto-matches, low band (<0.35) gets a
 *  new key, the middle band is what Match Reviewer actually has to reason
 *  about. */
export const CANDIDATE_PAIRS: CandidatePair[] = (() => {
  const pairs: CandidatePair[] = [];
  let n = 0;
  for (const p of OPERATOR_PAIRS) {
    if (!p.b) continue;
    const idA = SILVER_CUSTOMERS.find((r) => r.legalName === p.a)!.recordId;
    const idB = SILVER_CUSTOMERS.find((r) => r.legalName === p.b)!.recordId;
    const taxMatches = !!p.aTax && p.aTax === p.bTax;
    const evidence: string[] = ["billing_address"];
    let score = 0.55;
    if (taxMatches) { evidence.unshift("tax_id"); score = 0.97; }
    else {
      // Name-similarity-only pairs land in the middle band -- exactly the ones
      // that need a person, per the design's "false merge is worse than a
      // missed match" evaluation stance.
      score = 0.55 + (hash(p.a) % 20) / 100; // 0.55-0.74
      evidence.push("legal_name_similarity");
    }
    pairs.push({
      pairId: `PAIR-${String(n++).padStart(3, "0")}`,
      recordIdA: idA,
      recordIdB: idB,
      score: Math.round(score * 100) / 100,
      matchedOn: evidence,
      band: score >= 0.85 ? "high" : score >= 0.35 ? "middle" : "low",
    });
  }
  return pairs;
})();

/** Mutable crosswalk store -- starts empty; UC02's Publish Key step and the
 *  365-data-lake router's write_crosswalk tool are the only way rows appear.
 *  Kept here (not in the router) so both the router and any future admin
 *  reset tool share one source of truth. */
export const CROSSWALK: CrosswalkEntry[] = [];

// ── UC01 Sales Cockpit seed data ────────────────────────────────────────────

export const SALES_TARGETS: SalesTarget[] = REGIONS.flatMap((region) =>
  SOLUTIONS.map((solution) => ({
    period: "2026-Q4",
    rep: REPS[(hash(region + solution) % REPS.length)],
    region,
    solution,
    amount: 150_000 + (hash(region + solution) % 12) * 25_000,
  })),
);

export const OPPORTUNITIES: Opportunity[] = SILVER_CUSTOMERS.filter((c) => c.source === "365_salesforce").map((c, i) => {
  const solution = SOLUTIONS[i % SOLUTIONS.length];
  const region = REGIONS[i % REGIONS.length];
  const stage: Opportunity["stage"] = i % 5 === 0 ? "Closed Won" : i % 5 === 1 ? "Negotiation" : i % 5 === 2 ? "Proposal" : i % 5 === 3 ? "Closed Lost" : "Prospecting";
  return {
    id: `OPP-${String(3000 + i)}`,
    masterKey: null, // resolved at read time via the crosswalk, like every other view
    accountName: c.legalName,
    rep: REPS[i % REPS.length],
    region,
    solution,
    forecastCategory: stage === "Closed Won" ? "commit" : i % 3 === 0 ? "best_case" : "pipeline",
    stage,
    amount: 40_000 + (hash(c.recordId) % 20) * 8_000,
    // A handful of deliberately stale close dates for Pipeline Hygiene to flag.
    closeDate: i % 6 === 0 ? dateOffset(-45) : dateOffset(20 + (i % 10) * 5),
    lastActivityDate: i % 6 === 0 ? dateOffset(-40) : dateOffset(-(i % 14)),
  };
});

export const ORDERS: OrderRecord[] = OPPORTUNITIES.filter((o) => o.stage === "Closed Won").map((o, i) => ({
  id: `ORD-${String(4000 + i)}`,
  masterKey: o.masterKey,
  accountName: o.accountName,
  solution: o.solution,
  amount: o.amount,
  bookedDate: o.closeDate,
  // Every 4th booked order has NO matching invoice yet -- the reconciliation
  // break Reconciliation Explainer exists to explain.
  hasInvoice: i % 4 !== 0,
}));

export const INVOICES: InvoiceRecord[] = ORDERS.filter((o) => o.hasInvoice).map((o, i) => ({
  id: `INV-${String(5000 + i)}`,
  orderId: o.id,
  masterKey: o.masterKey,
  accountName: o.accountName,
  amount: i % 7 === 0 ? Math.round(o.amount * 0.9) : o.amount, // occasional amount mismatch, another break type
  billedDate: dateOffset(new Date(o.bookedDate).getUTCDate() % 5 + 1),
  status: i % 9 === 0 ? "overdue" : "paid",
}));
