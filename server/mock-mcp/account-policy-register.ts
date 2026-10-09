import { Router, type Request, type Response } from "express";
import { createHash } from "crypto";

/**
 * Simulated policy-administration view of an account: the policies hanging off
 * it, the locations and TIV they share, what billing and claims say about it,
 * and the credits applied to it.
 *
 * Three journeys describe reading this and none could. Account Intelligence
 * narrated billing and claims it never fetched, Shared Account Data
 * Propagation "aggregated location schedules" with nothing to aggregate, and
 * Account Pricing applied credits to policies it could not name. The account
 * system next door owns the client; this owns what is written for them.
 *
 * Keyed on the SAME account and policy ids the account administration mock
 * seeds (ACCT-100417's CPP-2026-004417 and GL-2026-004418, and so on). A
 * register that invented its own ids would let each journey pass alone and
 * contradict the others the moment they ran together.
 *
 * Vendor-neutral and deterministic. State lives in memory and resets on
 * restart, like its neighbour.
 */

const router = Router();

interface Location {
  locationId: string;
  address: string;
  /** The policy whose schedule this location sits on. */
  policyNumber: string;
  buildingValue: number;
  contentsValue: number;
  /** Set when a policy-level override replaced the account-level figure. */
  override?: { field: string; was: number; reason: string; actor: string; at: string };
}

interface Policy {
  policyNumber: string;
  accountId: string;
  lineOfBusiness: string;
  status: "in_force" | "quoted" | "expired";
  effectiveDate: string;
  expiryDate: string;
  annualPremium: number;
  credits: Array<{ creditCode: string; percent: number; basis: string; actor: string; at: string; auditId: string }>;
}

interface Billing {
  accountId: string;
  balance: number;
  nextDueOn: string | null;
  pastDueDays: number;
  delinquent: boolean;
}

interface Claim {
  claimNumber: string;
  accountId: string;
  policyNumber: string;
  status: "open" | "closed";
  incurred: number;
  reportedOn: string;
  cause: string;
}

/** Credits the register will apply, and what each one requires. */
const CREDIT_CATALOGUE: Record<string, { percent: number; requires: string; description: string }> = {
  ACCT_MULTILINE: { percent: 7.5, requires: "two or more in-force lines on the account", description: "Multi-line account credit" },
  ACCT_LOSS_FREE: { percent: 5, requires: "no open claims and nothing incurred in the account's claim history", description: "Loss-free account credit" },
  ACCT_PAYMENT_HISTORY: { percent: 2.5, requires: "an account that is not delinquent", description: "Payment history credit" },
};

const now = () => new Date().toISOString();
const auditId = (seed: string) => `CRD-${createHash("sha256").update(seed + Math.random()).digest("hex").slice(0, 10).toUpperCase()}`;

const SEED_POLICIES: Policy[] = [
  { policyNumber: "CPP-2026-004417", accountId: "ACCT-100417", lineOfBusiness: "Commercial Property", status: "in_force", effectiveDate: "2026-06-15", expiryDate: "2027-06-15", annualPremium: 184_500, credits: [] },
  { policyNumber: "GL-2026-004418", accountId: "ACCT-100417", lineOfBusiness: "General Liability", status: "in_force", effectiveDate: "2026-06-15", expiryDate: "2027-06-15", annualPremium: 62_300, credits: [] },
  { policyNumber: "CA-2026-002290", accountId: "ACCT-100522", lineOfBusiness: "Commercial Auto", status: "in_force", effectiveDate: "2026-03-01", expiryDate: "2027-03-01", annualPremium: 48_900, credits: [] },
  { policyNumber: "CPP-2026-007331", accountId: "ACCT-100733", lineOfBusiness: "Commercial Property", status: "in_force", effectiveDate: "2026-08-01", expiryDate: "2027-08-01", annualPremium: 97_200, credits: [] },
  { policyNumber: "GL-2026-007332", accountId: "ACCT-100733", lineOfBusiness: "General Liability", status: "in_force", effectiveDate: "2026-08-01", expiryDate: "2027-08-01", annualPremium: 41_800, credits: [] },
  { policyNumber: "WC-2026-007333", accountId: "ACCT-100733", lineOfBusiness: "Workers Compensation", status: "in_force", effectiveDate: "2026-08-01", expiryDate: "2027-08-01", annualPremium: 76_400, credits: [] },
  { policyNumber: "Q-2026-118204", accountId: "ACCT-100858", lineOfBusiness: "Commercial Package", status: "quoted", effectiveDate: "2026-10-01", expiryDate: "2027-10-01", annualPremium: 112_000, credits: [] },
  { policyNumber: "GL-2026-010041", accountId: "ACCT-101004", lineOfBusiness: "General Liability", status: "in_force", effectiveDate: "2026-04-10", expiryDate: "2027-04-10", annualPremium: 29_750, credits: [] },
  { policyNumber: "GL-2024-012330", accountId: "ACCT-101233", lineOfBusiness: "General Liability", status: "expired", effectiveDate: "2024-02-01", expiryDate: "2025-02-01", annualPremium: 18_400, credits: [] },
];

const SEED_LOCATIONS: Location[] = [
  // Summit Logistics: the property and liability policies share a site, which
  // is the case Feature 7 is about -- one location, two policies, one TIV.
  { locationId: "LOC-4417-01", address: "400 Harbor Way, Oakland, CA 94607", policyNumber: "CPP-2026-004417", buildingValue: 8_400_000, contentsValue: 2_100_000 },
  { locationId: "LOC-4417-02", address: "1820 Embarcadero, Oakland, CA 94606", policyNumber: "CPP-2026-004417", buildingValue: 5_250_000, contentsValue: 1_400_000 },
  { locationId: "LOC-4418-01", address: "400 Harbor Way, Oakland, CA 94607", policyNumber: "GL-2026-004418", buildingValue: 8_400_000, contentsValue: 2_100_000 },
  { locationId: "LOC-7331-01", address: "18 Creamery Rd, Modesto, CA 95354", policyNumber: "CPP-2026-007331", buildingValue: 6_900_000, contentsValue: 3_300_000 },
  { locationId: "LOC-7331-02", address: "22 Creamery Rd, Modesto, CA 95354", policyNumber: "CPP-2026-007331", buildingValue: 2_150_000, contentsValue: 900_000 },
  { locationId: "LOC-10041-01", address: "900 Industrial Blvd, Fresno, CA 93725", policyNumber: "GL-2026-010041", buildingValue: 1_250_000, contentsValue: 300_000 },
];

const SEED_BILLING: Billing[] = [
  { accountId: "ACCT-100417", balance: 15_375, nextDueOn: "2026-11-01", pastDueDays: 0, delinquent: false },
  { accountId: "ACCT-100522", balance: 4_075, nextDueOn: "2026-11-15", pastDueDays: 0, delinquent: false },
  { accountId: "ACCT-100733", balance: 17_950, nextDueOn: "2026-11-01", pastDueDays: 0, delinquent: false },
  { accountId: "ACCT-100858", balance: 0, nextDueOn: null, pastDueDays: 0, delinquent: false },
  { accountId: "ACCT-101004", balance: 2_479, nextDueOn: "2026-10-20", pastDueDays: 0, delinquent: false },
  // Granite Ridge is the delinquent case: the account-administration mock
  // already blocks it for non-payment, and this is the figure behind that.
  { accountId: "ACCT-101233", balance: 9_200, nextDueOn: "2026-07-01", pastDueDays: 97, delinquent: true },
];

const SEED_CLAIMS: Claim[] = [
  { claimNumber: "CLM-2026-5521", accountId: "ACCT-100733", policyNumber: "WC-2026-007333", status: "closed", incurred: 18_400, reportedOn: "2026-08-22", cause: "Slip and fall" },
  { claimNumber: "CLM-2026-5604", accountId: "ACCT-100733", policyNumber: "CPP-2026-007331", status: "open", incurred: 240_000, reportedOn: "2026-09-14", cause: "Refrigeration failure" },
  { claimNumber: "CLM-2025-1180", accountId: "ACCT-101233", policyNumber: "GL-2024-012330", status: "closed", incurred: 62_500, reportedOn: "2025-01-09", cause: "Third-party property damage" },
];

let policies: Policy[] = [];
let locations: Location[] = [];
let billing: Billing[] = [];
let claims: Claim[] = [];
const load = () => {
  policies = SEED_POLICIES.map((p) => structuredClone(p));
  locations = SEED_LOCATIONS.map((l) => structuredClone(l));
  billing = SEED_BILLING.map((b) => structuredClone(b));
  claims = SEED_CLAIMS.map((c) => structuredClone(c));
};
load();

const forAccount = (accountId: string) => policies.filter((p) => p.accountId === accountId);
const money = (n: number) => Math.round(n * 100) / 100;

router.get("/policies", (req: Request, res: Response) => {
  const accountId = String(req.query.accountId || "").trim();
  if (!accountId) { res.status(400).json({ error: "accountId is required." }); return; }
  const list = forAccount(accountId);
  const inForce = list.filter((p) => p.status === "in_force");
  res.json({
    accountId,
    policies: list.map((p) => ({
      ...p,
      creditedPremium: money(p.annualPremium * (1 - p.credits.reduce((s, c) => s + c.percent, 0) / 100)),
    })),
    counts: { total: list.length, inForce: inForce.length, quoted: list.filter((p) => p.status === "quoted").length, expired: list.filter((p) => p.status === "expired").length },
    linesInForce: Array.from(new Set(inForce.map((p) => p.lineOfBusiness))).sort(),
    inForcePremium: money(inForce.reduce((s, p) => s + p.annualPremium, 0)),
    retrievedAt: now(),
    guidance: "Only in_force is cover. A quoted or expired policy is not a line the account holds, and counting it as one hides a gap.",
  });
});

router.get("/location-schedule", (req: Request, res: Response) => {
  const accountId = String(req.query.accountId || "").trim();
  if (!accountId) { res.status(400).json({ error: "accountId is required." }); return; }
  const nums = new Set(forAccount(accountId).map((p) => p.policyNumber));
  const rows = locations.filter((l) => nums.has(l.policyNumber));
  // The same site appearing on two policies is the whole point of Feature 7:
  // it must be ONE location to the account and consistent on both.
  const byAddress: Record<string, string[]> = {};
  for (const l of rows) (byAddress[l.address] ??= []).push(l.policyNumber);
  const shared = Object.entries(byAddress).filter(([, p]) => p.length > 1).map(([address, policyNumbers]) => ({ address, policyNumbers }));
  res.json({
    accountId,
    locations: rows,
    distinctAddresses: Object.keys(byAddress).length,
    sharedAcrossPolicies: shared,
    overrides: rows.filter((l) => l.override).map((l) => ({ locationId: l.locationId, ...l.override })),
    retrievedAt: now(),
    guidance: "A site on two policies is one location to the account. Where the values differ, a policy-level override says so explicitly -- an unexplained difference is an inconsistency, not an override.",
  });
});

router.get("/tiv-rollup", (req: Request, res: Response) => {
  const accountId = String(req.query.accountId || "").trim();
  if (!accountId) { res.status(400).json({ error: "accountId is required." }); return; }
  const nums = new Set(forAccount(accountId).map((p) => p.policyNumber));
  const rows = locations.filter((l) => nums.has(l.policyNumber));
  const byPolicy: Record<string, number> = {};
  for (const l of rows) byPolicy[l.policyNumber] = (byPolicy[l.policyNumber] ?? 0) + l.buildingValue + l.contentsValue;
  // Account TIV counts a shared site ONCE. Summing policy TIVs double-counts
  // every location two policies share, which is how an account looks larger
  // than the risk actually is.
  const seen = new Set<string>();
  let accountTiv = 0;
  for (const l of rows) {
    if (seen.has(l.address)) continue;
    seen.add(l.address);
    accountTiv += l.buildingValue + l.contentsValue;
  }
  const summed = Object.values(byPolicy).reduce((s, v) => s + v, 0);
  res.json({
    accountId,
    accountTiv: money(accountTiv),
    sumOfPolicyTiv: money(summed),
    doubleCounted: money(summed - accountTiv),
    perPolicy: Object.entries(byPolicy).map(([policyNumber, tiv]) => ({ policyNumber, tiv: money(tiv) })),
    locationCount: rows.length,
    distinctAddressCount: seen.size,
    overridesApplied: rows.filter((l) => l.override).length,
    retrievedAt: now(),
    guidance: "accountTiv counts each site once; sumOfPolicyTiv does not. Quote accountTiv for the account's exposure, and never add policy TIVs to get it.",
  });
});

router.post("/policy-overrides", (req: Request, res: Response) => {
  const b = (req.body || {}) as Record<string, any>;
  const locationId = String(b.locationId || "").trim();
  const field = String(b.field || "").trim();
  const reason = typeof b.reason === "string" ? b.reason.trim() : "";
  const value = Number(b.value);
  const loc = locations.find((l) => l.locationId === locationId);
  if (!loc) { res.status(404).json({ error: `No location "${locationId}" found.` }); return; }
  if (field !== "buildingValue" && field !== "contentsValue") {
    res.status(400).json({ error: `field must be buildingValue or contentsValue.` });
    return;
  }
  if (!Number.isFinite(value) || value < 0) { res.status(400).json({ error: "value must be a non-negative number." }); return; }
  if (!reason) {
    res.status(400).json({ error: "reason is required: an override is a deliberate departure from the account figure, not a correction that explains itself." });
    return;
  }
  const was = loc[field];
  loc[field] = value;
  loc.override = { field, was, reason, actor: String(b.actor || "unknown"), at: now() };
  res.json({ overridden: true, locationId, field, was, now: value, reason, guidance: "The account rollup now reports this location at the overridden value, and names the override." });
});

router.get("/billing-summary", (req: Request, res: Response) => {
  const accountId = String(req.query.accountId || "").trim();
  const row = billing.find((b) => b.accountId === accountId);
  if (!row) { res.status(404).json({ error: `No billing record for "${accountId}".` }); return; }
  res.json({ ...row, retrievedAt: now() });
});

router.get("/claims-summary", (req: Request, res: Response) => {
  const accountId = String(req.query.accountId || "").trim();
  if (!accountId) { res.status(400).json({ error: "accountId is required." }); return; }
  const rows = claims.filter((c) => c.accountId === accountId);
  const open = rows.filter((c) => c.status === "open");
  res.json({
    accountId,
    claims: rows,
    counts: { total: rows.length, open: open.length, closed: rows.length - open.length },
    totalIncurred: money(rows.reduce((s, c) => s + c.incurred, 0)),
    openIncurred: money(open.reduce((s, c) => s + c.incurred, 0)),
    largest: rows.length ? rows.reduce((a, c) => (c.incurred > a.incurred ? c : a)) : null,
    // An account with no claims RECORDED is not the same as one known to be
    // loss-free; say which this is rather than letting a reader assume.
    lossFree: rows.length === 0 ? null : rows.every((c) => c.incurred === 0),
    retrievedAt: now(),
    guidance: "No claims recorded is not the same as loss-free: lossFree is null when there is no history to judge.",
  });
});

router.get("/credits", (req: Request, res: Response) => {
  res.json({ catalogue: CREDIT_CATALOGUE, retrievedAt: now() });
});

router.post("/policy-credits", (req: Request, res: Response) => {
  const b = (req.body || {}) as Record<string, any>;
  const policyNumber = String(b.policyNumber || "").trim();
  const creditCode = String(b.creditCode || "").trim().toUpperCase();
  const basis = typeof b.basis === "string" ? b.basis.trim() : "";
  const policy = policies.find((p) => p.policyNumber === policyNumber);
  if (!policy) { res.status(404).json({ error: `No policy "${policyNumber}" found.` }); return; }
  const credit = CREDIT_CATALOGUE[creditCode];
  if (!credit) {
    res.status(400).json({ error: `Unknown credit "${creditCode}".`, available: Object.keys(CREDIT_CATALOGUE) });
    return;
  }
  if (!basis) {
    res.status(400).json({ error: "basis is required: a credit changes what the client pays, so the reason is part of the record." });
    return;
  }
  if (policy.status !== "in_force") {
    res.json({ applied: false, reason: "not_in_force", message: `"${policyNumber}" is ${policy.status}. A credit applies to cover, not to a quote or an expired term.` });
    return;
  }
  if (policy.credits.some((c) => c.creditCode === creditCode)) {
    res.json({ applied: false, reason: "already_applied", message: `${creditCode} is already on ${policyNumber}.` });
    return;
  }

  // Eligibility is checked HERE, against the account's own record, rather than
  // trusted from the caller. An agent asked to apply a loss-free credit to an
  // account with an open claim is exactly the case this must refuse.
  const accountPolicies = forAccount(policy.accountId);
  const accountClaims = claims.filter((c) => c.accountId === policy.accountId);
  const bill = billing.find((x) => x.accountId === policy.accountId);
  let eligible = true;
  let why = "";
  if (creditCode === "ACCT_MULTILINE") {
    const lines = new Set(accountPolicies.filter((p) => p.status === "in_force").map((p) => p.lineOfBusiness));
    eligible = lines.size >= 2;
    why = `${lines.size} in-force line(s) on the account`;
  } else if (creditCode === "ACCT_LOSS_FREE") {
    eligible = accountClaims.length > 0 && accountClaims.every((c) => c.incurred === 0);
    why = accountClaims.length === 0
      ? "no claim history on the account, so loss-free cannot be established"
      : `${accountClaims.filter((c) => c.incurred > 0).length} claim(s) with incurred loss`;
  } else if (creditCode === "ACCT_PAYMENT_HISTORY") {
    eligible = !!bill && !bill.delinquent;
    why = bill ? (bill.delinquent ? `${bill.pastDueDays} days past due` : "no delinquency") : "no billing record";
  }
  if (!eligible) {
    res.json({ applied: false, reason: "not_eligible", requirement: credit.requires, found: why, message: `${creditCode} requires ${credit.requires}; the account shows ${why}.` });
    return;
  }

  const entry = { creditCode, percent: credit.percent, basis, actor: String(b.actor || "unknown"), at: now(), auditId: auditId(policyNumber + creditCode) };
  policy.credits.push(entry);
  const total = policy.credits.reduce((s, c) => s + c.percent, 0);
  res.status(201).json({
    applied: true,
    policyNumber,
    credit: entry,
    totalCreditPercent: total,
    annualPremium: policy.annualPremium,
    creditedPremium: money(policy.annualPremium * (1 - total / 100)),
    eligibility: { requirement: credit.requires, found: why },
  });
});

router.get("/credit-audit", (req: Request, res: Response) => {
  const accountId = String(req.query.accountId || "").trim();
  if (!accountId) { res.status(400).json({ error: "accountId is required." }); return; }
  const rows = forAccount(accountId).flatMap((p) => p.credits.map((c) => ({ policyNumber: p.policyNumber, lineOfBusiness: p.lineOfBusiness, ...c })));
  res.json({
    accountId,
    entries: rows.sort((a, b2) => a.at.localeCompare(b2.at)),
    totalEntries: rows.length,
    retrievedAt: now(),
    guidance: "Every credit carries who applied it, when, and on what basis. A credit with no entry here was never applied, whatever a narrative says.",
  });
});

router.post("/reset", (_req: Request, res: Response) => {
  load();
  res.json({ reset: true, policies: policies.length, locations: locations.length, at: now() });
});

export default router;
