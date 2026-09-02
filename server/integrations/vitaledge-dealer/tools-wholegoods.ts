/**
 * VE-J5 — Whole-goods Deal Desk tools.
 *
 * Two orderings are enforced in code because both are places where a
 * reasonable-sounding shortcut destroys the control:
 *
 *   - `calculate_true_margin` refuses to run until programs have been captured,
 *     so a healthy deal is never rejected on a pre-capture margin figure.
 *   - `determine_approval_authority` computes the EFFECTIVE discount, folding
 *     in trade over-allowance. Inflating a trade to keep the headline discount
 *     under a threshold is the standard way dealer authority matrices are
 *     circumvented, and it does not work here.
 */
import { DealerClient, money, daysBetween, todayIso, newId } from "./client";
import { ok, err } from "./tools-cash";

const A = (v: unknown) => (typeof v === "string" ? v : String(v ?? ""));
const N = (v: unknown) => (typeof v === "number" ? v : parseFloat(String(v ?? "0")) || 0);

async function landedCost(c: DealerClient, unitId: string) {
  const u = await c.one(`SELECT * FROM summit.fleet_assets WHERE unit_id = $1`, [unitId]);
  if (!u) return null;
  const days = u.inventory_since ? daysBetween(A(u.inventory_since), todayIso()) : 0;
  const invoice = money(N(u.invoice_cost_usd));
  const carry = money(invoice * (N(u.floor_plan_rate_pct) / 100) * (days / 365));
  return {
    unit: u, days_in_inventory: days,
    invoice_cost_usd: invoice,
    freight_cost_usd: money(N(u.freight_cost_usd)),
    prep_cost_usd: money(N(u.prep_cost_usd)),
    floor_plan_carry_usd: carry,
    total_landed_usd: money(invoice + N(u.freight_cost_usd) + N(u.prep_cost_usd) + carry),
  };
}

// ── Deal structure & costing ─────────────────────────────────────────────────

export async function get_pending_deals(c: DealerClient, args: Record<string, unknown>) {
  const branch = A(args.branch_id);
  const rows = await c.q(
    `SELECT d.*, a.legal_name, a.account_tier, f.manufacturer, f.model, f.machine_class,
            EXISTS (SELECT 1 FROM summit.trade_ins t WHERE t.deal_id = d.deal_id) AS has_trade_in
       FROM summit.deals d
       JOIN summit.customer_accounts a ON a.account_id = d.account_id
       JOIN summit.fleet_assets f ON f.unit_id = d.unit_id
      WHERE d.status IN ('quoted','desk_review','blocked_pending_authority')
        AND ($1 = '' OR d.branch_id = $1)
      ORDER BY d.quoted_on DESC`,
    [branch]
  );
  return ok({ deal_count: rows.length, with_trade_in: rows.filter((r) => r.has_trade_in).length, deals: rows });
}

export async function get_true_landed_cost(c: DealerClient, args: Record<string, unknown>) {
  const unitId = A(args.unit_id) || (await c.one(`SELECT unit_id FROM summit.deals WHERE deal_id = $1`, [A(args.deal_id)]))?.unit_id;
  if (!unitId) return err("unit_id or deal_id is required");
  const lc = await landedCost(c, A(unitId));
  if (!lc) return err(`Unknown unit ${unitId}`);
  return ok({
    unit_id: unitId,
    manufacturer: lc.unit.manufacturer, model: lc.unit.model,
    invoice_cost_usd: lc.invoice_cost_usd,
    freight_cost_usd: lc.freight_cost_usd,
    prep_cost_usd: lc.prep_cost_usd,
    days_in_inventory: lc.days_in_inventory,
    floor_plan_rate_pct: money(N(lc.unit.floor_plan_rate_pct)),
    floor_plan_carry_usd: lc.floor_plan_carry_usd,
    total_landed_cost_usd: lc.total_landed_usd,
    note: lc.days_in_inventory > 180
      ? `This unit has been in inventory ${lc.days_in_inventory} days and has accrued $${lc.floor_plan_carry_usd} of floor plan carry. Carrying cost has materially eroded the margin — and this is exactly the unit a salesperson is most eager to discount. Surface this explicitly.`
      : "Landed cost includes freight, prep and floor plan carry — the manufacturer invoice alone is not the cost.",
  });
}

export async function get_trade_in_assessment(c: DealerClient, args: Record<string, unknown>) {
  const dealId = A(args.deal_id);
  if (!dealId) return err("deal_id is required");
  const rows = await c.q(`SELECT * FROM summit.trade_ins WHERE deal_id = $1`, [dealId]);
  if (!rows.length) return ok({ deal_id: dealId, has_trade_in: false });
  return ok({ deal_id: dealId, has_trade_in: true, trade_ins: rows });
}

export async function get_auction_comparables(c: DealerClient, args: Record<string, unknown>) {
  const make = A(args.manufacturer), model = A(args.model);
  if (!make || !model) return err("manufacturer and model are required");
  const rows = await c.q(
    `SELECT * FROM summit.auction_comparables
      WHERE manufacturer = $1 AND model = $2 ORDER BY sale_date DESC`, [make, model]
  );
  if (!rows.length) return ok({ manufacturer: make, model, comparable_count: 0, note: "No comparables on file. A trade valuation without comparables is desk judgement and must be flagged as such." });
  const prices = rows.map((r) => N(r.sale_price_usd));
  const avg = money(prices.reduce((a, b) => a + b, 0) / prices.length);
  return ok({
    manufacturer: make, model, comparable_count: rows.length,
    average_sale_price_usd: avg,
    low_usd: money(Math.min(...prices)), high_usd: money(Math.max(...prices)),
    comparables: rows,
    note: "Value the trade against these, adjusted for condition grade and reconditioning cost. Any allowance above this range is a discount, and must be named as one.",
  });
}

export async function get_customer_lifetime_value(c: DealerClient, args: Record<string, unknown>) {
  const account = A(args.account_id);
  if (!account) return err("account_id is required");
  const a = await c.one(
    `SELECT account_id, legal_name, account_tier, annual_parts_service_spend_usd, credit_status
       FROM summit.customer_accounts WHERE account_id = $1`, [account]
  );
  if (!a) return err(`Unknown account ${account}`);
  const [units] = await c.q(`SELECT COUNT(*) AS owned FROM summit.fleet_assets WHERE owner_account_id = $1`, [account]);
  const [rentals] = await c.q(`SELECT COUNT(*) AS active FROM summit.rental_contracts WHERE account_id = $1 AND status = 'on_rent'`, [account]);
  return ok({
    account_id: account, legal_name: a.legal_name, account_tier: a.account_tier,
    units_owned: N(units.owned), active_rentals: N(rentals.active),
    annual_parts_service_spend_usd: money(N(a.annual_parts_service_spend_usd)),
    estimated_5yr_aftermarket_usd: money(N(a.annual_parts_service_spend_usd) * 5),
    note: "Lifetime value EXPLAINS a thin margin; it does not GRANT authority. Never use this figure to argue past a threshold the authority matrix does not permit.",
  });
}

// ── Programs & approval ──────────────────────────────────────────────────────

export async function identify_eligible_programs(c: DealerClient, args: Record<string, unknown>) {
  const dealId = A(args.deal_id);
  if (!dealId) return err("deal_id is required");
  const deal = await c.one(
    `SELECT d.*, f.manufacturer, f.machine_class, f.inventory_since
       FROM summit.deals d JOIN summit.fleet_assets f ON f.unit_id = d.unit_id
      WHERE d.deal_id = $1`, [dealId]
  );
  if (!deal) return err(`Unknown deal ${dealId}`);

  const rows = await c.q(
    `SELECT * FROM summit.rebate_programs
      WHERE manufacturer = $1 AND (applies_to_class IS NULL OR applies_to_class = $2)
      ORDER BY value_usd DESC`,
    [deal.manufacturer, deal.machine_class]
  );
  const today = todayIso();
  const eligible: Array<Record<string, unknown>> = rows.map((p) => ({
    ...p,
    days_to_deadline: daysBetween(today, A(p.claim_deadline)),
    expired: A(p.claim_deadline) < today,
  }));
  const live = eligible.filter((p) => !p.expired);
  return ok({
    deal_id: dealId, manufacturer: deal.manufacturer, machine_class: deal.machine_class,
    eligible_count: live.length,
    gross_program_value_usd: money(live.reduce((s, p) => s + N(p.value_usd), 0)),
    expiring_within_30_days: live.filter((p) => N(p.days_to_deadline) <= 30).length,
    programs: eligible,
    note: "Gross value assumes every program stacks, which they may not. Run check_program_stacking before treating this as capturable. A missed rebate is pure lost margin on a deal that already closed and cannot be recovered after the deadline.",
  });
}

export async function check_program_stacking(c: DealerClient, args: Record<string, unknown>) {
  const dealId = A(args.deal_id);
  if (!dealId) return err("deal_id is required");
  const elig = await identify_eligible_programs(c, { deal_id: dealId });
  const body = JSON.parse(elig.content[0].text);
  if (body.error) return elig;

  const live = (body.programs as Array<Record<string, unknown>>).filter((p) => !p.expired);
  // Greedy by value, honouring mutual exclusions — the optimal legal set.
  const sorted = [...live].sort((a, b) => N(b.value_usd) - N(a.value_usd));
  const chosen: Array<Record<string, unknown>> = [];
  const excluded: Array<{ program_id: string; reason: string }> = [];
  for (const p of sorted) {
    const clash = chosen.find((ch) =>
      ((ch.exclusive_with as string[]) ?? []).includes(A(p.program_id)) ||
      ((p.exclusive_with as string[]) ?? []).includes(A(ch.program_id))
    );
    if (clash) {
      excluded.push({
        program_id: A(p.program_id),
        reason: `Mutually exclusive with ${A(clash.program_id)} (${A(clash.name)}), which carries the higher value of $${N(clash.value_usd)}.`,
      });
    } else {
      chosen.push(p);
    }
  }
  return ok({
    deal_id: dealId,
    capturable_programs: chosen.map((p) => ({ program_id: p.program_id, name: p.name, value_usd: money(N(p.value_usd)), claim_deadline: p.claim_deadline })),
    capturable_value_usd: money(chosen.reduce((s, p) => s + N(p.value_usd), 0)),
    excluded_programs: excluded,
    note: excluded.length
      ? "Excluded programs are mutually exclusive under manufacturer rules. Claiming them together triggers a chargeback worth more than the programs, plus scrutiny of the dealer's other claims."
      : "All eligible programs stack legally.",
  });
}

export async function calculate_true_margin(c: DealerClient, args: Record<string, unknown>) {
  const dealId = A(args.deal_id);
  if (!dealId) return err("deal_id is required");
  // Enforced ordering: capture before judgement.
  if (args.programs_captured !== true && args.captured_program_value_usd === undefined) {
    return err(
      "Margin cannot be judged before manufacturer programs are captured. Run identify_eligible_programs and " +
      "check_program_stacking first, then pass captured_program_value_usd. Judging margin pre-capture kills healthy " +
      "deals and trains salespeople to route around the deal desk."
    );
  }

  const deal = await c.one(`SELECT * FROM summit.deals WHERE deal_id = $1`, [dealId]);
  if (!deal) return err(`Unknown deal ${dealId}`);
  const lc = await landedCost(c, A(deal.unit_id));
  if (!lc) return err("Unit not found for this deal");

  const trades = await c.q(`SELECT * FROM summit.trade_ins WHERE deal_id = $1`, [dealId]);
  let tradeOver = 0;
  const tradeDetail: unknown[] = [];
  for (const t of trades) {
    const comps = await c.q(
      `SELECT sale_price_usd FROM summit.auction_comparables WHERE manufacturer = $1 AND model = $2`,
      [t.manufacturer, t.model]
    );
    const avg = comps.length ? money(comps.reduce((s, x) => s + N(x.sale_price_usd), 0) / comps.length) : null;
    const over = avg === null ? 0 : money(Math.max(0, N(t.allowance_usd) - avg));
    tradeOver = money(tradeOver + over);
    tradeDetail.push({
      trade_id: t.trade_id, allowance_usd: money(N(t.allowance_usd)),
      comparable_average_usd: avg, over_allowance_usd: over,
      reconditioning_estimate_usd: money(N(t.reconditioning_estimate_usd)),
      note: over > 0 ? `$${over} of this allowance is above comparable market value. That is a discount wearing a different hat and must count toward the discount authority threshold.` : null,
    });
  }

  const captured = money(N(args.captured_program_value_usd));
  const price = money(N(deal.sale_price_usd));
  const reconditioning = money(trades.reduce((s, t) => s + N(t.reconditioning_estimate_usd), 0));
  const marginUsd = money(price - lc.total_landed_usd - tradeOver - reconditioning + captured);
  const marginPct = price === 0 ? 0 : money((marginUsd / price) * 100);
  const preCaptureUsd = money(marginUsd - captured);

  return ok({
    deal_id: dealId, sale_price_usd: price,
    landed_cost_usd: lc.total_landed_usd,
    floor_plan_carry_usd: lc.floor_plan_carry_usd,
    days_in_inventory: lc.days_in_inventory,
    trade_over_allowance_usd: tradeOver, trade_detail: tradeDetail,
    reconditioning_usd: reconditioning,
    captured_program_value_usd: captured,
    margin_before_capture_usd: preCaptureUsd,
    margin_before_capture_pct: price === 0 ? 0 : money((preCaptureUsd / price) * 100),
    true_margin_usd: marginUsd, true_margin_pct: marginPct,
    note: "Margin is stated AFTER program capture. Judging it before capture understates the deal.",
  });
}

export async function determine_approval_authority(c: DealerClient, args: Record<string, unknown>) {
  const dealId = A(args.deal_id);
  if (!dealId) return err("deal_id is required");
  const deal = await c.one(`SELECT * FROM summit.deals WHERE deal_id = $1`, [dealId]);
  if (!deal) return err(`Unknown deal ${dealId}`);

  const trades = await c.q(`SELECT * FROM summit.trade_ins WHERE deal_id = $1`, [dealId]);
  let tradeOver = 0;
  for (const t of trades) {
    const comps = await c.q(
      `SELECT sale_price_usd FROM summit.auction_comparables WHERE manufacturer = $1 AND model = $2`,
      [t.manufacturer, t.model]
    );
    if (comps.length) {
      const avg = comps.reduce((s, x) => s + N(x.sale_price_usd), 0) / comps.length;
      tradeOver = money(tradeOver + Math.max(0, N(t.allowance_usd) - avg));
    }
  }

  const price = money(N(deal.sale_price_usd));
  const headline = money(N(deal.headline_discount_pct));
  const tradePct = price === 0 ? 0 : money((tradeOver / price) * 100);
  const effective = money(headline + tradePct);

  const spAuth = money(N(deal.salesperson_authority_pct));
  const brAuth = money(N(deal.branch_authority_pct));
  const level = effective <= spAuth ? "salesperson" : effective <= brAuth ? "branch_manager" : "regional_sales_director";

  return ok({
    deal_id: dealId,
    headline_discount_pct: headline,
    trade_over_allowance_usd: tradeOver,
    trade_over_allowance_as_discount_pct: tradePct,
    effective_discount_pct: effective,
    salesperson_authority_pct: spAuth, branch_authority_pct: brAuth,
    required_approval_level: level,
    within_salesperson_authority: effective <= spAuth,
    quote_may_issue: level === "salesperson",
    note: tradeOver > 0
      ? `The headline discount of ${headline}% understates the real concession. A $${tradeOver} trade over-allowance adds ${tradePct}%, giving an EFFECTIVE discount of ${effective}%. Structuring a deal to keep the headline under a threshold by inflating the trade does not avoid the authority requirement.`
      : `Effective discount ${effective}% requires ${level} approval.`,
  });
}

export async function prepare_deal_summary(c: DealerClient, args: Record<string, unknown>) {
  const dealId = A(args.deal_id);
  if (!dealId) return err("deal_id is required");
  const stackRes = await check_program_stacking(c, { deal_id: dealId });
  const stack = JSON.parse(stackRes.content[0].text);
  if (stack.error) return stackRes;

  const marginRes = await calculate_true_margin(c, { deal_id: dealId, programs_captured: true, captured_program_value_usd: stack.capturable_value_usd });
  const margin = JSON.parse(marginRes.content[0].text);
  if (margin.error) return marginRes;

  const authRes = await determine_approval_authority(c, { deal_id: dealId });
  const auth = JSON.parse(authRes.content[0].text);

  const risks: string[] = [];
  if (margin.days_in_inventory > 180) risks.push(`Unit has been in inventory ${margin.days_in_inventory} days; $${margin.floor_plan_carry_usd} of floor plan carry has eroded the margin.`);
  if (margin.trade_over_allowance_usd > 0) risks.push(`Trade over-allowance of $${margin.trade_over_allowance_usd} is an undisclosed discount and counts toward authority.`);
  if (stack.excluded_programs.length) risks.push(`${stack.excluded_programs.length} program(s) excluded as mutually exclusive — claiming them would trigger a chargeback.`);
  if (!auth.quote_may_issue) risks.push(`Quote is BLOCKED pending ${auth.required_approval_level} approval.`);

  const expiring = (stack.capturable_programs as Array<Record<string, unknown>>).filter((p) => daysBetween(todayIso(), A(p.claim_deadline)) <= 30);
  if (expiring.length) risks.push(`${expiring.length} capturable program(s) expire within 30 days.`);

  return ok({
    deal_id: dealId,
    true_margin_usd: margin.true_margin_usd, true_margin_pct: margin.true_margin_pct,
    margin_before_capture_pct: margin.margin_before_capture_pct,
    captured_program_value_usd: stack.capturable_value_usd,
    excluded_programs: stack.excluded_programs,
    landed_cost_usd: margin.landed_cost_usd,
    trade_valuation_basis: margin.trade_detail,
    effective_discount_pct: auth.effective_discount_pct,
    required_approval_level: auth.required_approval_level,
    quote_may_issue: auth.quote_may_issue,
    flagged_risks: risks,
    advisory_only: true,
    note: "Advisory output for the salesperson and approver. This tool does not issue a quote and does not approve a discount.",
  });
}

export async function flag_multi_obligation_split(c: DealerClient, args: Record<string, unknown>) {
  const dealId = A(args.deal_id);
  if (!dealId) return err("deal_id is required");
  const deal = await c.one(`SELECT deal_id, bundled_components, sale_price_usd FROM summit.deals WHERE deal_id = $1`, [dealId]);
  if (!deal) return err(`Unknown deal ${dealId}`);
  const bundled = (deal.bundled_components as string[]) ?? [];
  if (!bundled.length) {
    return ok({ deal_id: dealId, split_required: false, note: "Single performance obligation. No ASC 606 allocation needed." });
  }
  return ok({
    deal_id: dealId, split_required: true,
    bundled_components: bundled,
    obligations: ["equipment", ...bundled],
    routed_to: "financial_controller",
    note: "This deal bundles equipment with other deliverables. Under ASC 606 the consideration must be allocated across separate performance obligations before invoicing — the whole amount cannot be recognised on delivery of the machine.",
  });
}
