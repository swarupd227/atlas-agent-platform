import { Router, type Request, type Response } from "express";
import { createHash } from "crypto";

/**
 * Simulated third-party business-data provider -- the D&B stand-in behind the
 * Shared Account Data Propagation journey's enrichment steps.
 *
 * Separate from the account system and the policy register because that is what
 * it is: data someone else owns, which has an age and a price. Three steps of
 * that journey describe reading and caching it and none could, so the journey
 * "retrieved cached integration data" with no cache and "recorded a fetch date"
 * for a fetch that never happened.
 *
 * Feature 6's acceptance criterion is the whole design: "data is available at
 * the account level so I do not incur additional costs getting it at policy and
 * location level." A service that silently returns fresh data on every call
 * cannot demonstrate that, because nothing is ever saved and nothing is ever
 * charged. So here a cache hit costs nothing and says so, a refresh costs real
 * money and has to be justified, a refresh inside the window is REFUSED, and
 * asking for enrichment per policy or per location is refused with the
 * account-level answer instead.
 *
 * Keyed on the SAME account ids the account administration mock and the policy
 * register seed, so the three cannot contradict each other.
 *
 * Vendor-neutral and deterministic. State lives in memory and resets on
 * restart, like its neighbours.
 */

const router = Router();
const now = () => new Date().toISOString();
const chargeId = (seed: string) => `ENR-${createHash("sha256").update(seed + Math.random()).digest("hex").slice(0, 10).toUpperCase()}`;

/** What the provider knows about a business. */
interface Profile {
  duns: string;
  legalName: string;
  sicCode: string;
  sicDescription: string;
  yearsInBusiness: number;
  employeeCount: number;
  revenueBand: string;
  creditScoreBand: string;
  riskIndicators: string[];
}

interface CachedEnrichment {
  accountId: string;
  profile: Profile;
  /** Which provider answered, so a figure can be attributed. */
  source: string;
  retrievedAt: string;
  /** Who caused the fetch, and why. Null for the seeded baseline. */
  fetchedBy: string | null;
  fetchReason: string | null;
}

interface Charge {
  chargeId: string;
  accountId: string;
  amount: number;
  at: string;
  actor: string;
  reason: string;
  /** Account level always. Recorded so the ledger can prove the feature. */
  scope: "account";
  forced: boolean;
}

/**
 * The refresh policy this service ENFORCES, not decoration. A refresh inside
 * the window is refused unless the caller forces it and says why, because the
 * cost of enrichment is the thing Feature 6 is about.
 */
const REFRESH_POLICY = {
  windowDays: 90,
  costPerRefresh: 42.5,
  currency: "USD",
  scope: "account" as const,
  rule: "Enrichment is held once per account. A refresh inside the window is refused unless forced with a reason, and enrichment is never sold per policy or per location.",
  staleAfterDays: 90,
};

const SOURCE_NAME = "Mercantile Business Data (simulated)";

/**
 * What the provider would return TODAY. Distinct from what is cached, so a
 * refresh has something to find -- and so a SECOND refresh finds nothing, which
 * is how "refreshed" stops being confused with "changed".
 */
const SOURCE_PROFILES: Record<string, Profile> = {
  "ACCT-100417": {
    duns: "07-412-9930", legalName: "Summit Logistics Group LLC", sicCode: "4213", sicDescription: "Trucking, except local",
    yearsInBusiness: 18, employeeCount: 142, revenueBand: "USD 25M-50M", creditScoreBand: "Low risk (71-100)",
    riskIndicators: ["Coastal exposure at one site"],
  },
  "ACCT-100733": {
    duns: "09-118-4471", legalName: "Northbank Cold Storage LLC", sicCode: "4222", sicDescription: "Refrigerated warehousing and storage",
    yearsInBusiness: 11, employeeCount: 64, revenueBand: "USD 10M-25M", creditScoreBand: "Moderate risk (41-70)",
    riskIndicators: ["Refrigeration-dependent operations", "Open property claim in last 12 months"],
  },
  "ACCT-101004": {
    duns: "05-770-2218", legalName: "Cascade Facilities Maintenance Inc", sicCode: "7349", sicDescription: "Building cleaning and maintenance services",
    yearsInBusiness: 7, employeeCount: 38, revenueBand: "USD 5M-10M", creditScoreBand: "Low risk (71-100)",
    riskIndicators: [],
  },
  "ACCT-101233": {
    duns: "08-331-6604", legalName: "Granite Ridge Aggregates LLC", sicCode: "1442", sicDescription: "Construction sand and gravel",
    yearsInBusiness: 23, employeeCount: 95, revenueBand: "USD 10M-25M", creditScoreBand: "High risk (1-40)",
    riskIndicators: ["Payment delinquency over 90 days", "Heavy equipment operations"],
  },
};

/**
 * The cache as it stands at start. `ageDays` rather than a fixed date so the
 * fixture stays coherent however long this runs -- a date literal would drift
 * into staleness and quietly change what the tests mean.
 *
 * ACCT-101233 is absent on purpose: an account nobody has ever enriched. That
 * is a different fact from one enriched long ago, and the refresh decision
 * hangs on the difference.
 */
const SEED_CACHE: Array<{ accountId: string; ageDays: number; profile: Profile }> = [
  {
    accountId: "ACCT-100417", ageDays: 12,
    // Fresh, and identical to source except the headcount: a refresh here
    // would cost 42.50 to learn almost nothing, which is why it is refused.
    profile: { ...SOURCE_PROFILES["ACCT-100417"], employeeCount: 138 },
  },
  {
    accountId: "ACCT-100733", ageDays: 412,
    // Stale, and materially wrong: the open claim is not in the cached record,
    // so a credit or appetite decision resting on it would be resting on 2025.
    profile: {
      ...SOURCE_PROFILES["ACCT-100733"], employeeCount: 51, revenueBand: "USD 5M-10M",
      creditScoreBand: "Low risk (71-100)", riskIndicators: ["Refrigeration-dependent operations"],
    },
  },
  { accountId: "ACCT-101004", ageDays: 45, profile: { ...SOURCE_PROFILES["ACCT-101004"] } },
];

let cache: CachedEnrichment[] = [];
let ledger: Charge[] = [];
/** Cache hits that cost nothing, so "I avoided a charge" is a counted number. */
let reuseCount: Record<string, number> = {};

const load = () => {
  const t = Date.now();
  cache = SEED_CACHE.map((s) => ({
    accountId: s.accountId,
    profile: structuredClone(s.profile),
    source: SOURCE_NAME,
    retrievedAt: new Date(t - s.ageDays * 86_400_000).toISOString(),
    fetchedBy: null,
    fetchReason: null,
  }));
  ledger = [];
  reuseCount = {};
};
load();

const money = (n: number) => Math.round(n * 100) / 100;
const ageDaysOf = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
const find = (accountId: string) => cache.find((c) => c.accountId === accountId);

/** Fields that differ between two profiles, with both values. */
const diffProfiles = (before: Profile, after: Profile) => {
  const changes: Array<{ field: string; was: unknown; now: unknown }> = [];
  for (const key of Object.keys(after) as Array<keyof Profile>) {
    const a = JSON.stringify(before[key]);
    const b = JSON.stringify(after[key]);
    if (a !== b) changes.push({ field: key, was: before[key], now: after[key] });
  }
  return changes;
};

/**
 * GET /enrichment -- the cache read.
 *
 * Refuses a policy- or location-scoped request. That is not pedantry: Feature 6
 * exists because enrichment bought per policy and per location is bought many
 * times over, and an agent that asks per policy should be told the rule rather
 * than quietly charged for it.
 */
router.get("/enrichment", (req: Request, res: Response) => {
  const accountId = String(req.query.accountId || "").trim();
  const policyNumber = String(req.query.policyNumber || "").trim();
  const locationId = String(req.query.locationId || "").trim();
  const scope = String(req.query.scope || "").trim().toLowerCase();

  if (policyNumber || locationId || (scope && scope !== "account")) {
    res.status(400).json({
      error: "Enrichment is held at account level only.",
      refused: { policyNumber: policyNumber || undefined, locationId: locationId || undefined, scope: scope || undefined },
      rule: REFRESH_POLICY.rule,
      guidance: "Request it once for the account and apply it to every policy and location underneath. Asking per policy is how the same data gets paid for many times over.",
      retrievedAt: now(),
    });
    return;
  }
  if (!accountId) { res.status(400).json({ error: "accountId is required." }); return; }

  const hit = find(accountId);
  if (!hit) {
    // Never fetched is NOT stale. A caller that cannot tell them apart will
    // either refresh an account it has no baseline for and call it an update,
    // or report "no enrichment" as a finding about the business.
    res.json({
      accountId, enrichment: null, neverFetched: true, stale: null, ageDays: null,
      cacheHit: false, costIncurred: 0,
      available: Boolean(SOURCE_PROFILES[accountId]),
      guidance: "No enrichment has ever been fetched for this account. That is not the same as stale data, and it is not a finding about the business: there is no baseline to compare against. Refresh to establish one.",
      refreshPolicy: REFRESH_POLICY,
      retrievedAt: now(),
    });
    return;
  }

  const ageDays = ageDaysOf(hit.retrievedAt);
  reuseCount[accountId] = (reuseCount[accountId] ?? 0) + 1;
  res.json({
    accountId,
    enrichment: { profile: hit.profile, source: hit.source, retrievedAt: hit.retrievedAt, fetchedBy: hit.fetchedBy, fetchReason: hit.fetchReason },
    neverFetched: false,
    ageDays,
    stale: ageDays > REFRESH_POLICY.staleAfterDays,
    cacheHit: true,
    /** A read of the cache is free, and the ledger below proves nothing was charged. */
    costIncurred: 0,
    reusedThisSession: reuseCount[accountId],
    refreshPolicy: REFRESH_POLICY,
    guidance: ageDays > REFRESH_POLICY.staleAfterDays
      ? `This record is ${ageDays} days old, past the ${REFRESH_POLICY.staleAfterDays}-day window. Quote it as of ${hit.retrievedAt.slice(0, 10)} or refresh it; do not present it as current.`
      : `This record is ${ageDays} days old and within the ${REFRESH_POLICY.staleAfterDays}-day window. Reuse it for every policy and location on the account rather than refetching.`,
    retrievedAt: now(),
  });
});

/** GET /refresh-policy -- the configurable trigger Feature 6 asks for. */
router.get("/refresh-policy", (_req: Request, res: Response) => {
  res.json({
    ...REFRESH_POLICY,
    guidance: "A refresh inside the window is refused unless forced with a reason. Force it when something about the risk changed, not to be sure.",
    retrievedAt: now(),
  });
});

/**
 * POST /enrichment/refresh -- buy a new record.
 *
 * Charges real money, so it demands a reason and an actor, refuses inside the
 * window unless forced, and reports what actually CHANGED rather than only
 * that it ran.
 */
router.post("/enrichment/refresh", (req: Request, res: Response) => {
  const accountId = String(req.body?.accountId || "").trim();
  const reason = String(req.body?.reason || "").trim();
  const actor = String(req.body?.actor || "").trim();
  const force = req.body?.force === true;

  if (!accountId) { res.status(400).json({ error: "accountId is required." }); return; }
  if (!reason) {
    res.status(400).json({ error: "reason is required: a refresh is a charge against the account, so the reason is part of the record." });
    return;
  }
  const source = SOURCE_PROFILES[accountId];
  if (!source) {
    res.status(404).json({ error: `The provider holds no record for ${accountId}.`, refreshed: false, costIncurred: 0, retrievedAt: now() });
    return;
  }

  const existing = find(accountId);
  const ageDays = existing ? ageDaysOf(existing.retrievedAt) : null;

  // Inside the window and not forced: refuse, and say what the refusal saved.
  if (existing && ageDays !== null && ageDays <= REFRESH_POLICY.windowDays && !force) {
    const daysRemaining = REFRESH_POLICY.windowDays - ageDays;
    res.json({
      refreshed: false,
      reason: "within_refresh_window",
      accountId,
      ageDays,
      daysUntilRefreshDue: daysRemaining,
      costIncurred: 0,
      costAvoided: REFRESH_POLICY.costPerRefresh,
      cached: { profile: existing.profile, source: existing.source, retrievedAt: existing.retrievedAt },
      rule: REFRESH_POLICY.rule,
      guidance: `The held record is ${ageDays} days old and due in ${daysRemaining} days, so ${REFRESH_POLICY.currency} ${REFRESH_POLICY.costPerRefresh} was not spent. Pass force with a reason only if something about the risk changed.`,
      retrievedAt: now(),
    });
    return;
  }
  if (force && !actor) {
    res.status(400).json({ error: "actor is required when forcing a refresh inside the window: someone owns the charge." });
    return;
  }

  const before = existing ? structuredClone(existing.profile) : null;
  const at = now();
  const fresh: CachedEnrichment = {
    accountId, profile: structuredClone(source), source: SOURCE_NAME, retrievedAt: at,
    fetchedBy: actor || "unattributed", fetchReason: reason,
  };
  if (existing) Object.assign(existing, fresh);
  else cache.push(fresh);

  const charge: Charge = {
    chargeId: chargeId(accountId), accountId, amount: REFRESH_POLICY.costPerRefresh, at,
    actor: actor || "unattributed", reason, scope: "account", forced: force,
  };
  ledger.push(charge);

  const changes = before ? diffProfiles(before, fresh.profile) : [];
  res.json({
    refreshed: true,
    accountId,
    /** A first fetch and an update are different events. */
    establishedBaseline: before === null,
    previousAgeDays: ageDays,
    forced: force,
    charge,
    costIncurred: charge.amount,
    enrichment: { profile: fresh.profile, source: fresh.source, retrievedAt: fresh.retrievedAt, fetchedBy: fresh.fetchedBy, fetchReason: fresh.fetchReason },
    changes,
    changeCount: changes.length,
    guidance: before === null
      ? "Baseline established. There was nothing held before, so nothing changed -- this is a first fetch, not an update."
      : changes.length === 0
        ? `Refreshed at a cost of ${REFRESH_POLICY.currency} ${charge.amount} and nothing changed. "Refreshed" is not "changed": report the fetch date, not a new finding.`
        : `${changes.length} field(s) changed. Any decision resting on the previous record should be revisited, not just re-stated.`,
    retrievedAt: at,
  });
});

/**
 * GET /cost-ledger -- what enrichment has actually cost this account.
 *
 * This is the evidence for Feature 6: one charge at account level, with reuses
 * counted beside it. A journey claiming it avoided per-policy costs can be
 * checked here rather than believed.
 */
router.get("/cost-ledger", (req: Request, res: Response) => {
  const accountId = String(req.query.accountId || "").trim();
  if (!accountId) { res.status(400).json({ error: "accountId is required." }); return; }
  const entries = ledger.filter((c) => c.accountId === accountId);
  const reuses = reuseCount[accountId] ?? 0;
  res.json({
    accountId,
    entries,
    totalEntries: entries.length,
    totalCost: money(entries.reduce((s, c) => s + c.amount, 0)),
    currency: REFRESH_POLICY.currency,
    cacheReuses: reuses,
    costAvoidedByReuse: money(reuses * REFRESH_POLICY.costPerRefresh),
    forcedRefreshes: entries.filter((c) => c.forced).length,
    guidance: "Every charge names who caused it and why. A refresh with no entry here never happened, whatever a narrative says; and enrichment is only ever charged once per account, never per policy or location.",
    retrievedAt: now(),
  });
});

router.post("/reset", (_req: Request, res: Response) => {
  load();
  res.json({ reset: true, cached: cache.length, charges: ledger.length, at: now() });
});

export default router;
