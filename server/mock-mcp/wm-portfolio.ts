import { Router, type Response } from "express";
import {
  AS_OF, CASH_NEEDS, FIXTURE_NOTICE, HOUSEHOLDS, MODE, RECONCILIATION, RESTRICTED_LIST, TENANT_ID, TRANSACTIONS,
  accountById, accountValue, accountsOf, daysBetween, householdById, modelById, money, now, security, MODELS, SECURITIES,
  type Account,
} from "./wm-seed";
import { humanActor, list, logWm, nextWmId, resetWmState, wm, type Order } from "./wm-state";

/**
 * Simulated portfolio management and trading system (fixture mode) for
 * Harborview Wealth Partners: households, accounts, lots, transactions,
 * models, restrictions, cash needs, and the order book.
 *
 * Rules it enforces rather than trusts:
 *  - Pre-trade checks are the system's own: restricted list and insider
 *    windows, ESG exclusions, cash sufficiency, single-stock concentration and
 *    a HOUSEHOLD-WIDE wash-sale scan (IRAs and spouse accounts included; an IRA
 *    repurchase makes the matched loss permanently disallowed).
 *  - Orders that fail a check are never staged. Orders in a non-discretionary
 *    account are staged as awaiting the client's recorded approval.
 *  - Releasing orders needs a portfolio manager and an approval id; a
 *    non-discretionary order also needs the client's recorded approval.
 */
const router = Router();
const envelope = (extra: Record<string, unknown>) => ({ mode: MODE, tenantId: TENANT_ID, ...extra, fixtureNotice: FIXTURE_NOTICE, retrievedAt: now() });
const fail = (res: Response, status: number, error: string, extra: Record<string, unknown> = {}) => res.status(status).json(envelope({ error, ...extra }));

function householdOr404(id: unknown, res: Response) {
  const h = householdById(id);
  if (!h) { fail(res, 404, `No household "${String(id ?? "")}".`, { households: HOUSEHOLDS.map((x) => x.householdId) }); return null; }
  return h;
}
function accountOr404(id: unknown, res: Response) {
  const a = accountById(id);
  if (!a) { fail(res, 404, `No account "${String(id ?? "")}".`); return null; }
  return a;
}

const positionsOf = (a: Account) => a.lots.map((l) => {
  const s = security(l.symbol)!;
  const mv = money(l.quantity * s.price);
  return { lotId: l.lotId, symbol: l.symbol, name: s.name, assetClass: s.assetClass, quantity: l.quantity, price: s.price, marketValue: mv, costBasis: l.costBasis, unrealizedGainLoss: money(mv - l.costBasis), acquiredDate: l.acquiredDate, holdingPeriod: daysBetween(l.acquiredDate, AS_OF) > 365 ? "long_term" : "short_term", source: `${a.accountId}:${l.lotId}` };
});

// ── Reads ────────────────────────────────────────────────────────────────────

router.get("/household", (req, res) => {
  const h = householdOr404(req.query.householdId, res); if (!h) return;
  const accts = accountsOf(h.householdId);
  res.json(envelope({ household: h, accounts: accts.map((a) => ({ accountId: a.accountId, registration: a.registration, taxStatus: a.taxStatus, discretion: a.discretion, modelId: a.modelId, inIps: a.inIps, value: accountValue(a) })), householdValue: money(accts.reduce((s, a) => s + accountValue(a), 0)), model: modelById(h.modelId), asOf: AS_OF }));
});

router.get("/accounts", (req, res) => {
  const h = householdOr404(req.query.householdId, res); if (!h) return;
  res.json(envelope({ householdId: h.householdId, accounts: accountsOf(h.householdId).map((a) => ({ accountId: a.accountId, registration: a.registration, owners: a.owners, taxStatus: a.taxStatus, discretion: a.discretion, modelId: a.modelId, inIps: a.inIps, custodian: a.custodian, status: a.status, restrictions: a.restrictions, cash: a.cash, value: accountValue(a) })) }));
});

router.get("/positions", (req, res) => {
  const ids = list(req.query.accountIds ?? req.query.accountId);
  const h = req.query.householdId ? householdById(req.query.householdId) : null;
  const accts = h ? accountsOf(h.householdId) : ids.map((i) => accountById(i)).filter((a): a is Account => !!a);
  if (!accts.length) return fail(res, 422, "Give householdId or accountIds.");
  res.json(envelope({ asOf: AS_OF, accounts: accts.map((a) => ({ accountId: a.accountId, cash: a.cash, value: accountValue(a), lots: positionsOf(a) })) }));
});

router.get("/transactions", (req, res) => {
  const h = householdOr404(req.query.householdId, res); if (!h) return;
  const from = String(req.query.fromDate ?? "2026-01-01"), to = String(req.query.toDate ?? AS_OF);
  const ids = new Set(accountsOf(h.householdId).map((a) => a.accountId));
  res.json(envelope({ householdId: h.householdId, fromDate: from, toDate: to, transactions: TRANSACTIONS.filter((t) => ids.has(t.accountId) && t.date >= from && t.date <= to), note: "Every account of the household, IRAs included: automatic investments and dividend reinvestment are purchases for the wash-sale rule." }));
});

router.get("/model", (req, res) => {
  const m = modelById(req.query.modelId);
  if (!m) return fail(res, 404, `No model "${String(req.query.modelId ?? "")}".`, { models: MODELS.map((x) => x.modelId) });
  res.json(envelope({ model: m, securityMaster: SECURITIES.map((s) => ({ symbol: s.symbol, name: s.name, assetClass: s.assetClass, price: s.price, substantiallyIdenticalGroup: s.identicalGroup })) }));
});

router.get("/restricted-list", (req, res) => {
  const h = req.query.householdId ? householdById(req.query.householdId) : null;
  res.json(envelope({ entries: RESTRICTED_LIST.filter((r) => !h || r.householdId === h.householdId), asOf: AS_OF }));
});

router.get("/cash-needs", (req, res) => {
  const h = householdOr404(req.query.householdId, res); if (!h) return;
  const ids = new Set(accountsOf(h.householdId).map((a) => a.accountId));
  res.json(envelope({ householdId: h.householdId, cashNeeds: CASH_NEEDS.filter((c) => ids.has(c.accountId)) }));
});

router.get("/reconciliation", (req, res) => {
  const h = householdOr404(req.query.householdId, res); if (!h) return;
  const ids = new Set(accountsOf(h.householdId).map((a) => a.accountId));
  const rows = RECONCILIATION.filter((r) => ids.has(r.accountId));
  res.json(envelope({ householdId: h.householdId, accounts: rows, openBreaks: rows.reduce((s, r) => s + r.openBreaks, 0) }));
});

// ── Pre-trade checks (the system's own) ──────────────────────────────────────

interface ProposedOrder { accountId: string; symbol: string; side: "buy" | "sell"; quantity: number; lotId?: string }
interface Finding { rule: string; result: "block" | "requires_client_approval" | "warn"; detail: string; evidence: string[]; disallowedLoss?: number; permanent?: boolean }

export function runPretradeChecks(raw: unknown[], tradeDate = AS_OF) {
  const orders = raw.map((o: any) => ({ accountId: String(o?.accountId ?? "").trim().toUpperCase(), symbol: String(o?.symbol ?? "").trim().toUpperCase(), side: o?.side === "buy" ? "buy" : "sell", quantity: Number(o?.quantity), lotId: o?.lotId ? String(o.lotId).trim().toUpperCase() : undefined })) as ProposedOrder[];
  const results = orders.map((o) => ({ order: o, findings: [] as Finding[] }));
  // cash sufficiency per account across the batch
  const cashLeft = new Map<string, number>();
  for (const r of results) {
    const a = accountById(r.order.accountId), s = security(r.order.symbol);
    if (!a || !s || !(r.order.quantity > 0)) { r.findings.push({ rule: "PT-ORDER", result: "block", detail: "Unknown account or security, or a non-positive quantity.", evidence: [] }); continue; }
    if (!cashLeft.has(a.accountId)) cashLeft.set(a.accountId, a.cash + results.filter((x) => x.order.accountId === a.accountId && x.order.side === "sell").reduce((t, x) => t + x.order.quantity * (security(x.order.symbol)?.price ?? 0), 0));
    const h = householdById(a.householdId)!;
    for (const rl of RESTRICTED_LIST) {
      const applies = rl.symbol === s.symbol && (rl.appliesTo.includes(a.accountId) || a.owners.some((o) => rl.appliesTo.includes(o))) && tradeDate >= rl.windowStart && tradeDate <= rl.windowEnd;
      if (applies) r.findings.push({ rule: rl.reason === "insider_blackout" ? "PT-RESTRICT-BLACKOUT" : "PT-RESTRICT", result: "block", detail: `${s.symbol} is restricted for this account (${rl.detail}) from ${rl.windowStart} to ${rl.windowEnd}.`, evidence: [rl.entryId] });
    }
    if (r.order.side === "buy" && a.restrictions.some((x) => x.symbols.includes(s.symbol))) r.findings.push({ rule: "PT-ESG", result: "block", detail: `${s.symbol} is excluded by the client's restriction on ${a.accountId}.`, evidence: [`${a.accountId}:restrictions`] });
    if (a.discretion === "non_discretionary") r.findings.push({ rule: "PT-DISCRETION", result: "requires_client_approval", detail: `${a.accountId} is non-discretionary: the client must approve this trade.`, evidence: [`${a.accountId}:discretion`] });
    if (r.order.side === "buy") {
      const cost = r.order.quantity * s.price, left = cashLeft.get(a.accountId)!;
      if (cost > left + 0.005) r.findings.push({ rule: "PT-CASH", result: "block", detail: `Buy costs ${money(cost)}; ${a.accountId} has ${money(left)} available after this batch's sales.`, evidence: [`${a.accountId}:cash`] });
      else cashLeft.set(a.accountId, left - cost);
      if (s.assetClass === "single_stock") {
        const hhValue = accountsOf(h.householdId).reduce((t, x) => t + accountValue(x), 0);
        const held = accountsOf(h.householdId).flatMap((x) => x.lots).filter((l) => l.symbol === s.symbol).reduce((t, l) => t + l.quantity * s.price, 0);
        const pct = (held + cost) / hhValue * 100;
        if (pct > h.ips.singleStockCapPct) r.findings.push({ rule: "PT-CONC", result: "block", detail: `${s.symbol} would be ${money(pct)}% of the household against the ${h.ips.singleStockCapPct}% cap.`, evidence: [`${h.householdId}:ips.singleStockCapPct`] });
      }
    }
    if (r.order.side === "sell") {
      const lots = r.order.lotId ? a.lots.filter((l) => l.lotId === r.order.lotId) : a.lots.filter((l) => l.symbol === s.symbol);
      if (!lots.length || lots.some((l) => l.symbol !== s.symbol)) { r.findings.push({ rule: "PT-LOT", result: "block", detail: `No ${s.symbol} lot ${r.order.lotId ?? ""} in ${a.accountId}.`, evidence: [] }); continue; }
      const held = lots.reduce((t, l) => t + l.quantity, 0);
      if (r.order.quantity > held) { r.findings.push({ rule: "PT-LOT", result: "block", detail: `Sells ${r.order.quantity} but the lot(s) hold ${held}.`, evidence: lots.map((l) => `${a.accountId}:${l.lotId}`) }); continue; }
      const basisPerShare = lots.reduce((t, l) => t + l.costBasis, 0) / held;
      const loss = money((basisPerShare - s.price) * r.order.quantity);
      if (loss > 0) {
        // Household-wide wash-sale scan: purchases of a substantially identical security 30 days either side.
        const hhAccounts = accountsOf(h.householdId);
        const ids = new Set(hhAccounts.map((x) => x.accountId));
        const purchases = [
          ...TRANSACTIONS.filter((t) => ids.has(t.accountId) && ["buy", "auto_invest", "dividend_reinvest"].includes(t.type) && security(t.symbol)?.identicalGroup === s.identicalGroup && Math.abs(daysBetween(t.date, tradeDate)) <= 30).map((t) => ({ accountId: t.accountId, date: t.date, quantity: t.quantity, ref: t.txnId })),
          ...results.filter((x) => x !== r && x.order.side === "buy" && ids.has(x.order.accountId) && security(x.order.symbol)?.identicalGroup === s.identicalGroup).map((x) => ({ accountId: x.order.accountId, date: tradeDate, quantity: x.order.quantity, ref: `proposed buy ${x.order.accountId} ${x.order.symbol}` })),
        ];
        if (purchases.length) {
          const matched = Math.min(r.order.quantity, purchases.reduce((t, p) => t + p.quantity, 0));
          const permanent = purchases.some((p) => accountById(p.accountId)!.taxStatus !== "taxable");
          r.findings.push({ rule: "PT-WASH", result: "block", detail: `Wash sale: ${purchases.map((p) => `${p.quantity} sh bought in ${p.accountId} on ${p.date} (${daysBetween(p.date, tradeDate)} days before)`).join("; ")} -- substantially identical to ${s.symbol} (${s.identicalGroup}). The loss on ${matched} of ${r.order.quantity} shares (${money(loss * matched / r.order.quantity)}) would be disallowed${permanent ? ", PERMANENTLY, because the repurchase is in an IRA" : ""}. Firm rule: no harvest that triggers a wash sale.`, evidence: purchases.map((p) => p.ref), disallowedLoss: money(loss * matched / r.order.quantity), permanent });
        }
      }
    }
  }
  return results.map((r, i) => {
    const block = r.findings.some((f) => f.result === "block");
    return { index: i, order: r.order, result: block ? "block" : r.findings.some((f) => f.result === "requires_client_approval") ? "requires_client_approval" : "pass", findings: r.findings };
  });
}

router.post("/pretrade-checks", (req, res) => {
  const orders = Array.isArray(req.body?.orders) ? req.body.orders : [];
  if (!orders.length) return fail(res, 422, "orders is required: [{accountId, symbol, side, quantity, lotId?}].");
  const results = runPretradeChecks(orders, String(req.body?.tradeDate ?? AS_OF));
  res.json(envelope({ tradeDate: String(req.body?.tradeDate ?? AS_OF), results, blocked: results.filter((r) => r.result === "block").length, requiresClientApproval: results.filter((r) => r.result === "requires_client_approval").length }));
});

// ── Orders ───────────────────────────────────────────────────────────────────

router.post("/orders/stage", (req, res) => {
  const orders = Array.isArray(req.body?.orders) ? req.body.orders : [];
  if (!orders.length) return fail(res, 422, "orders is required.");
  const checks = runPretradeChecks(orders);
  const staged: Order[] = [], refused: unknown[] = [];
  for (const c of checks) {
    if (c.result === "block") { refused.push({ order: c.order, findings: c.findings }); continue; }
    const o: Order = { orderId: nextWmId("ORD"), proposalId: req.body?.proposalId ? String(req.body.proposalId) : null, accountId: c.order.accountId, symbol: c.order.symbol, side: c.order.side, quantity: c.order.quantity, lotId: c.order.lotId ?? null, status: "staged", stagedAt: now(), checks: c.findings };
    wm().orders.set(o.orderId, o);
    staged.push(o);
  }
  logWm(String(req.body?.stagedBy ?? "agent"), "orders_staged", `${staged.length} staged, ${refused.length} refused`);
  res.status(staged.length ? 200 : 422).json(envelope({ staged: staged.map((o) => ({ orderId: o.orderId, accountId: o.accountId, symbol: o.symbol, side: o.side, quantity: o.quantity, needsClientApproval: accountById(o.accountId)!.discretion === "non_discretionary" })), refused, note: "Staged orders are not executed: a portfolio manager releases them, and a non-discretionary order also needs the client's recorded approval." }));
});

router.post("/orders/client-approval", (req, res) => {
  const who = humanActor(req.body ?? {}, ["advisor", "client_service_associate"]); if (!who.ok) return fail(res, who.status, who.error);
  const a = accountOr404(req.body?.accountId, res); if (!a) return;
  const ids = list(req.body?.orderIds);
  const orders = ids.map((i) => wm().orders.get(i)).filter((o): o is Order => !!o && o.accountId === a.accountId && o.status === "staged");
  if (!orders.length) return fail(res, 422, `No staged orders ${ids.join(", ")} on ${a.accountId}.`);
  for (const o of orders) o.status = "approved_by_client";
  wm().clientApprovals.push({ accountId: a.accountId, orderIds: orders.map((o) => o.orderId), by: who.actorId, approvalId: who.approvalId, at: now() });
  logWm(who.actorId, "client_trade_approval", `${a.accountId}: ${orders.map((o) => o.orderId).join(", ")}`);
  res.json(envelope({ accountId: a.accountId, approved: orders.map((o) => o.orderId), note: "Recorded the client's approval of these specific trades." }));
});

router.post("/orders/submit", (req, res) => {
  const who = humanActor(req.body ?? {}, ["portfolio_manager"]); if (!who.ok) return fail(res, who.status, who.error);
  const ids = list(req.body?.orderIds);
  const all = ids.length ? ids.map((i) => wm().orders.get(i)).filter((o): o is Order => !!o) : [...wm().orders.values()].filter((o) => o.status === "staged" || o.status === "approved_by_client");
  const released: unknown[] = [], held: unknown[] = [];
  for (const o of all) {
    const a = accountById(o.accountId)!;
    if (o.status === "submitted" || o.status === "filled") continue;
    if (a.discretion === "non_discretionary" && o.status !== "approved_by_client") { held.push({ orderId: o.orderId, reason: `${a.accountId} is non-discretionary and the client has not approved this trade.` }); continue; }
    const s = security(o.symbol)!;
    let realized = 0;
    if (o.side === "sell") {
      const lots = o.lotId ? a.lots.filter((l) => l.lotId === o.lotId) : a.lots.filter((l) => l.symbol === o.symbol);
      const shares = lots.reduce((t, l) => t + l.quantity, 0);
      realized = money((s.price - lots.reduce((t, l) => t + l.costBasis, 0) / shares) * o.quantity);
    }
    o.status = "filled"; o.fillPrice = s.price; o.realizedGainLoss = realized;
    released.push({ orderId: o.orderId, accountId: o.accountId, symbol: o.symbol, side: o.side, quantity: o.quantity, fillPrice: s.price, realizedGainLoss: realized });
  }
  logWm(who.actorId, "orders_released", `${released.length} filled, ${held.length} held`);
  res.json(envelope({ released, held, allocation: "Block orders allocated pro rata at the average fill price.", releasedBy: who.actorId, approvalId: who.approvalId }));
});

router.get("/orders", (req, res) => {
  const h = req.query.householdId ? householdById(req.query.householdId) : null;
  const ids = h ? new Set(accountsOf(h.householdId).map((a) => a.accountId)) : null;
  res.json(envelope({ orders: [...wm().orders.values()].filter((o) => !ids || ids.has(o.accountId)) }));
});

router.get("/realized-gains", (req, res) => {
  const h = householdOr404(req.query.householdId, res); if (!h) return;
  const ids = new Set(accountsOf(h.householdId).map((a) => a.accountId));
  const filled = [...wm().orders.values()].filter((o) => ids.has(o.accountId) && o.status === "filled" && o.side === "sell");
  const taxable = filled.filter((o) => accountById(o.accountId)!.taxStatus === "taxable");
  const net = money(taxable.reduce((t, o) => t + (o.realizedGainLoss ?? 0), 0));
  res.json(envelope({ householdId: h.householdId, taxableRealizedGainLoss: net, annualTaxBudget: h.ips.annualTaxBudget, withinBudget: net <= h.ips.annualTaxBudget, orders: filled }));
});

router.get("/activity", (_req, res) => res.json(envelope({ activity: wm().activity })));
router.post("/reset", (_req, res) => { resetWmState(); res.json({ reset: true, scope: "all six Harborview Wealth Partners fixture systems", resetAt: now(), mode: MODE }); });

export default router;
