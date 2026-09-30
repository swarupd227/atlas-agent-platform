/**
 * Mock "365 Retail" AWS data lake — the one connector the design doc calls
 * out as genuinely new (see 365-data-lake-data.ts for why). Exposes the
 * design's own idea of a Gold view: a small set of NAMED, PARAMETERISED
 * queries, not free-form SQL — the design is explicit that agents "must not
 * query directly" the systems this stands in for.
 *
 * Writes are narrow on purpose, mirroring the CMDB mock's stance: the only
 * write surface is the UC02 crosswalk (write_crosswalk), because that is the
 * only write the design actually grants this connector ("read and write to
 * the crosswalk tables only"). Every other view is read-only, in memory,
 * reset on restart.
 */
import { Router, type Request, type Response } from "express";
import {
  SILVER_CUSTOMERS, CANDIDATE_PAIRS, CROSSWALK,
  SALES_TARGETS, OPPORTUNITIES, ORDERS, INVOICES,
  type SilverCustomerRecord, type CrosswalkEntry,
} from "./365-data-lake-data";

const router = Router();
const now = () => new Date().toISOString();

const findCustomer = (recordId: string) => SILVER_CUSTOMERS.find((c) => c.recordId === recordId);
const masterKeyFor = (recordId: string): string | null => CROSSWALK.find((c) => c.recordId === recordId)?.masterKey ?? null;

/** UC02's crosswalk resolved onto every downstream view at read time, exactly
 *  as the design says every other use case joins on it -- never pre-baked
 *  into the seed data, since the crosswalk starts empty until UC02 runs. */
function withMasterKey<T extends { accountName: string; masterKey: string | null }>(rows: T[]): T[] {
  return rows.map((r) => {
    const rec = SILVER_CUSTOMERS.find((c) => c.legalName === r.accountName);
    return { ...r, masterKey: rec ? masterKeyFor(rec.recordId) : r.masterKey };
  });
}

/** The named views this data lake serves. Each is a function so it always
 *  reflects the live crosswalk. Add a view here (and to VIEW_DOCS below) when
 *  a later use case phase needs one -- this is the extension point. */
const VIEWS: Record<string, (params: Record<string, string>) => unknown[]> = {
  silver_customer_records: (p) => SILVER_CUSTOMERS.filter((c) => !p.source || c.source === p.source),

  candidate_pairs: (p) => CANDIDATE_PAIRS.filter((pair) => !p.band || pair.band === p.band),

  crosswalk: (p) => CROSSWALK.filter((c) => !p.master_key || c.masterKey === p.master_key),

  reconciliation_breaks: () => {
    const bookedNoInvoice = ORDERS.filter((o) => !o.hasInvoice).map((o) => ({
      breakId: `BRK-${o.id}`,
      type: "booked_no_invoice" as const,
      accountName: o.accountName,
      orderId: o.id,
      amount: o.amount,
      bookedDate: o.bookedDate,
    }));
    const amountMismatch = INVOICES.filter((inv) => {
      const order = ORDERS.find((o) => o.id === inv.orderId);
      return order && order.amount !== inv.amount;
    }).map((inv) => {
      const order = ORDERS.find((o) => o.id === inv.orderId)!;
      return {
        breakId: `BRK-${inv.id}`,
        type: "amount_mismatch" as const,
        accountName: inv.accountName,
        orderId: order.id,
        invoiceId: inv.id,
        orderAmount: order.amount,
        invoiceAmount: inv.amount,
      };
    });
    return withMasterKey([...bookedNoInvoice, ...amountMismatch] as any);
  },

  gap_to_target: (p) => {
    const region = p.region;
    const targets = SALES_TARGETS.filter((t) => t.period === (p.period ?? "2026-Q4") && (!region || t.region === region));
    return targets.map((t) => {
      const actual = OPPORTUNITIES.filter((o) => o.rep === t.rep && o.region === t.region && o.solution === t.solution && o.stage === "Closed Won")
        .reduce((sum, o) => sum + o.amount, 0);
      const pipeline = OPPORTUNITIES.filter((o) => o.rep === t.rep && o.region === t.region && o.solution === t.solution && o.stage !== "Closed Won" && o.stage !== "Closed Lost");
      return {
        rep: t.rep, region: t.region, solution: t.solution,
        target: t.amount, actual, gap: t.amount - actual,
        coverage: pipeline.reduce((s, o) => s + o.amount, 0),
        topActions: pipeline.slice(0, 5).map((o) => ({ opportunityId: o.id, accountName: o.accountName, amount: o.amount, stage: o.stage })),
      };
    });
  },

  forecast_snapshot: (p) => {
    const region = p.region;
    const byRegion = new Map<string, { commit: number; bestCase: number; pipeline: number }>();
    for (const o of OPPORTUNITIES) {
      if (region && o.region !== region) continue;
      const bucket = byRegion.get(o.region) ?? { commit: 0, bestCase: 0, pipeline: 0 };
      if (o.forecastCategory === "commit") bucket.commit += o.amount;
      else if (o.forecastCategory === "best_case") bucket.bestCase += o.amount;
      else if (o.forecastCategory === "pipeline") bucket.pipeline += o.amount;
      byRegion.set(o.region, bucket);
    }
    return [...byRegion.entries()].map(([r, v]) => ({ region: r, week: "2026-W38", ...v }));
  },

  published_view: () => withMasterKey(
    OPPORTUNITIES.filter((o) => o.stage === "Closed Won").map((o) => ({ accountName: o.accountName, masterKey: null, solution: o.solution, amount: o.amount, bookedDate: o.closeDate })) as any,
  ),

  pipeline_hygiene: () => OPPORTUNITIES.filter((o) => o.stage !== "Closed Won" && o.stage !== "Closed Lost").map((o) => {
    const daysSinceActivity = Math.round((Date.now() - new Date(o.lastActivityDate).getTime()) / 86_400_000);
    const flags: string[] = [];
    if (daysSinceActivity > 30) flags.push("stale_activity");
    if (new Date(o.closeDate) < new Date("2026-09-15")) flags.push("close_date_in_past");
    return { opportunityId: o.id, accountName: o.accountName, rep: o.rep, stage: o.stage, amount: o.amount, closeDate: o.closeDate, daysSinceActivity, flags };
  }).filter((r) => r.flags.length > 0),

  masked_match_view: (p) => {
    // UC09's view onto UC02: same evidence, tax id and phone masked, for
    // Duplicate and Anomaly Checker's exact-match comparisons — masking is
    // done here (not by the caller), matching the design's "restricted:
    // masked for every model call" posture.
    const pairs = p.record_id ? CANDIDATE_PAIRS.filter((pr) => pr.recordIdA === p.record_id || pr.recordIdB === p.record_id) : CANDIDATE_PAIRS;
    return pairs.map((pr) => ({
      pairId: pr.pairId,
      recordIdA: pr.recordIdA,
      recordIdB: pr.recordIdB,
      score: pr.score,
      matchedOn: pr.matchedOn,
      taxIdMatch: pr.matchedOn.includes("tax_id"),
      band: pr.band,
    }));
  },
};

const VIEW_DOCS: Record<string, string> = {
  silver_customer_records: "Raw-but-cleaned customer records per source system, before matching. Params: source (365_salesforce | cantaloupe_salesforce).",
  candidate_pairs: "UC02's blocked-and-scored candidate pairs awaiting a routing decision. Params: band (high | middle | low).",
  crosswalk: "The Master Customer Key crosswalk UC02 has published so far. Params: master_key.",
  reconciliation_breaks: "Salesforce closed-won bookings that don't reconcile against NetSuite orders/invoices (UC01). No params.",
  gap_to_target: "Target vs actual vs pipeline by rep/region/solution, with each rep's top open deals (UC01). Params: period (default 2026-Q4), region.",
  forecast_snapshot: "This week's forecast-category totals by region (UC01). Params: region.",
  published_view: "The week's published cockpit figures — closed-won bookings only (UC01 Cockpit Q&A / Executive Summary read this, nothing else). No params.",
  pipeline_hygiene: "Open opportunities flagged for a stale close date or stale activity (UC01 Pipeline Hygiene). No params.",
  masked_match_view: "UC02 candidate pairs with sensitive fields masked, for UC09's duplicate/anomaly checks. Params: record_id.",
};

// ── reads ────────────────────────────────────────────────────────────────────

router.get("/views", (_req: Request, res: Response) => {
  res.json({ views: Object.keys(VIEWS).map((name) => ({ name, description: VIEW_DOCS[name] })) });
});

router.get("/view", (req: Request, res: Response) => {
  const name = String(req.query.view || "");
  const fn = VIEWS[name];
  if (!fn) {
    res.status(400).json({ error: `View "${name}" is not readable here.`, available: Object.keys(VIEWS) });
    return;
  }
  const params: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.query)) {
    if (k === "view" || k === "limit") continue;
    params[k] = String(v);
  }
  const rows = fn(params);
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  res.json({ view: name, count: rows.length, returned: Math.min(rows.length, limit), rows: rows.slice(0, limit) });
});

router.get("/customer", (req: Request, res: Response) => {
  const recordId = String(req.query.record_id || "");
  const rec = findCustomer(recordId);
  if (!rec) {
    res.status(404).json({ error: `No Silver record matches "${recordId}".` });
    return;
  }
  res.json({ ...rec, masterKey: masterKeyFor(rec.recordId), retrievedAt: now() });
});

// ── writes: the crosswalk only ──────────────────────────────────────────────

router.post("/crosswalk/write", (req: Request, res: Response) => {
  const { recordId, masterKey, rule, decider, reason } = req.body ?? {};
  if (!recordId || !masterKey || !rule || !decider) {
    res.status(400).json({ error: "recordId, masterKey, rule and decider are required." });
    return;
  }
  const rec = findCustomer(String(recordId));
  if (!rec) {
    res.status(404).json({ error: `No Silver record matches "${recordId}". The crosswalk can only key records that exist.` });
    return;
  }
  const existing = CROSSWALK.find((c) => c.recordId === recordId);
  const entry: CrosswalkEntry = {
    masterKey: String(masterKey),
    recordId: String(recordId),
    source: rec.source,
    rule: String(rule),
    decider: String(decider),
    decidedAt: now(),
    reason: reason ? String(reason) : "",
  };
  if (existing) Object.assign(existing, entry);
  else CROSSWALK.push(entry);
  res.json({ written: true, entry });
});

router.post("/reset", (_req: Request, res: Response) => {
  CROSSWALK.length = 0;
  res.json({ reset: true, resetAt: now() });
});

export default router;
