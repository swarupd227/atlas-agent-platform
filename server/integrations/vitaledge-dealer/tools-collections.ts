/**
 * VE-J2 — Collections, Disputes & Credit Risk tools.
 *
 * The judgement journey. Two rules are enforced in code rather than left to
 * the model's discretion, because both are cases where the arithmetically
 * obvious action is commercially wrong:
 *
 *   - Disputed balances are subtracted from hold exposure before any hold is
 *     evaluated. `evaluate_credit_hold` cannot be made to skip this.
 *   - Strategic and OEM-affiliated accounts always require a human approver.
 *     `apply_credit_hold` rejects the call without one.
 */
import type { McpToolResult } from "../../real-mcp-base";
import { DealerClient, AUTHORITY, approvalLevelFor, money, daysBetween, todayIso, newId } from "./client";
import { ok, err } from "./tools-cash";

const A = (v: unknown) => (typeof v === "string" ? v : String(v ?? ""));
const N = (v: unknown) => (typeof v === "number" ? v : parseFloat(String(v ?? "0")) || 0);

/** Approved outreach templates. Free-form customer text is not permitted. */
const OUTREACH_TEMPLATES: Record<string, { id: string; tone: string; body: string }> = {
  reminder_30: { id: "approved_30day_reminder", tone: "friendly", body: "A friendly reminder that invoice(s) {INVOICES} totalling {AMOUNT} became due on {DUE_DATE}. If payment is already in transit, please disregard. We're happy to send copies of any documentation you need." },
  firm_60: { id: "approved_60day_standard", tone: "firm", body: "Our records show invoice(s) {INVOICES} totalling {AMOUNT} are now 60 days past due. Please arrange payment or contact us to discuss a schedule. We'd like to resolve this before it affects your account standing." },
  final_90: { id: "approved_90day_final", tone: "formal", body: "Invoice(s) {INVOICES} totalling {AMOUNT} remain unpaid at 90+ days. Please contact our credit department within 10 business days to arrange settlement or a payment plan." },
  dispute_ack: { id: "approved_dispute_resolution", tone: "collaborative", body: "Thank you for raising the query on invoice {INVOICES}. We've reviewed it against your contract terms and our finding is set out below. {FINDING}" },
};

const PROHIBITED = [
  { pattern: /repossess|repossession|seize the|recover the (machine|equipment|unit)/i, label: "repossession threat (requires legal review)" },
  { pattern: /legal action|sue|litigation|attorney|solicitor|court/i, label: "legal threat (requires legal review)" },
  { pattern: /late fee|penalty (fee|charge)|interest charge/i, label: "fee assertion (must exist in the contract)" },
  { pattern: /credit (bureau|agency|report)|blacklist/i, label: "credit-reporting threat" },
];

// ── Portfolio & exposure ─────────────────────────────────────────────────────

export async function get_aged_portfolio(c: DealerClient, args: Record<string, unknown>) {
  const minDays = args.min_days_past_due === undefined ? 1 : N(args.min_days_past_due);
  const rows = await c.q(
    `SELECT a.account_id, a.legal_name, a.account_tier, a.credit_limit_usd, a.credit_status,
            a.seasonal_pattern, a.annual_parts_service_spend_usd,
            COALESCE(SUM(i.balance_usd),0) AS open_balance,
            COALESCE(SUM(i.balance_usd) FILTER (WHERE CURRENT_DATE - i.due_date BETWEEN 1 AND 30),0)  AS bucket_30,
            COALESCE(SUM(i.balance_usd) FILTER (WHERE CURRENT_DATE - i.due_date BETWEEN 31 AND 60),0) AS bucket_60,
            COALESCE(SUM(i.balance_usd) FILTER (WHERE CURRENT_DATE - i.due_date BETWEEN 61 AND 90),0) AS bucket_90,
            COALESCE(SUM(i.balance_usd) FILTER (WHERE CURRENT_DATE - i.due_date > 90),0)              AS bucket_90_plus,
            COUNT(i.invoice_id) AS open_invoices,
            MAX(CURRENT_DATE - i.due_date) AS max_days_past_due,
            COUNT(DISTINCT i.branch_id) AS branches
       FROM summit.customer_accounts a
       JOIN summit.invoices i ON i.account_id = a.account_id AND i.status IN ('open','partially_paid')
      GROUP BY a.account_id
     HAVING MAX(CURRENT_DATE - i.due_date) >= $1
      ORDER BY 8 DESC`,
    [minDays]
  );

  // Attach dispute exclusions here so no caller can rank on raw balance alone.
  const disputes = await c.q(
    `SELECT account_id, COALESCE(SUM(disputed_amount_usd),0) AS disputed
       FROM summit.disputes WHERE status = 'open' GROUP BY account_id`
  );
  const dmap = new Map(disputes.map((d) => [A(d.account_id), money(N(d.disputed))]));

  const accounts = rows.map((r) => {
    const open = money(N(r.open_balance));
    const disputed = dmap.get(A(r.account_id)) ?? 0;
    return {
      ...r,
      open_balance_usd: open,
      disputed_open_usd: disputed,
      recoverable_exposure_usd: money(open - disputed),
      requires_human_for_hold: A(r.account_tier) !== "standard",
    };
  }).sort((a, b) => b.recoverable_exposure_usd - a.recoverable_exposure_usd);

  return ok({
    account_count: accounts.length,
    total_open_usd: money(accounts.reduce((s, a) => s + a.open_balance_usd, 0)),
    total_disputed_usd: money(accounts.reduce((s, a) => s + a.disputed_open_usd, 0)),
    total_recoverable_usd: money(accounts.reduce((s, a) => s + a.recoverable_exposure_usd, 0)),
    ranked_by: "recoverable_exposure_usd",
    note: "Ranking is by RECOVERABLE exposure, net of open disputes — not by raw balance. An account whose balance is mostly an unresolved dispute is a service problem, not a credit problem.",
    accounts,
  });
}

export async function get_dispute_registry(c: DealerClient, args: Record<string, unknown>) {
  const account = A(args.account_id);
  const rows = await c.q(
    `SELECT d.dispute_id, d.account_id, d.invoice_id, d.reason_code, d.disputed_amount_usd,
            d.raised_on, d.status, d.contract_clause, d.notes,
            CURRENT_DATE - d.raised_on AS days_open
       FROM summit.disputes d
      WHERE ($1 = '' OR d.account_id = $1)
      ORDER BY d.disputed_amount_usd DESC`,
    [account]
  );
  const open = rows.filter((r) => A(r.status) === "open");
  return ok({
    dispute_count: rows.length,
    open_count: open.length,
    open_disputed_usd: money(open.reduce((s, r) => s + N(r.disputed_amount_usd), 0)),
    note: "Open disputed amounts must be excluded from any exposure figure used to justify a credit hold.",
    disputes: rows,
  });
}

export async function get_payment_behaviour(c: DealerClient, args: Record<string, unknown>) {
  const account = A(args.account_id);
  if (!account) return err("account_id is required");
  const acct = await c.one(
    `SELECT account_id, legal_name, seasonal_pattern, payment_terms, primary_division, onboarded_on
       FROM summit.customer_accounts WHERE account_id = $1`, [account]
  );
  if (!acct) return err(`Unknown account ${account}`);

  const [agg] = await c.q(
    `SELECT COUNT(*) AS open_invoices,
            COALESCE(AVG(CURRENT_DATE - due_date),0) AS avg_days_past_due,
            COALESCE(MAX(CURRENT_DATE - due_date),0) AS max_days_past_due
       FROM summit.invoices WHERE account_id = $1 AND status IN ('open','partially_paid')`,
    [account]
  );
  const [paid] = await c.q(
    `SELECT COUNT(*) AS closed_invoices FROM summit.invoices WHERE account_id = $1 AND status = 'closed_paid'`,
    [account]
  );

  const seasonal = A(acct.seasonal_pattern);
  const month = new Date().getUTCMonth() + 1;
  const inSeasonalPeak = seasonal === "harvest_settlement_september" && (month === 7 || month === 8 || month === 9);

  return ok({
    account_id: account,
    legal_name: acct.legal_name,
    primary_division: acct.primary_division,
    payment_terms: acct.payment_terms,
    open_invoices: N(agg.open_invoices),
    closed_invoices: N(paid.closed_invoices),
    avg_days_past_due: Math.round(N(agg.avg_days_past_due)),
    max_days_past_due: N(agg.max_days_past_due),
    seasonal_pattern: seasonal || null,
    currently_in_seasonal_peak: inSeasonalPeak,
    assessment: inSeasonalPeak
      ? "This account's lateness is consistent with its documented seasonal cycle. Balances peak before harvest settlement and clear afterwards. Treat as EXPECTED, not deteriorating."
      : N(agg.max_days_past_due) > 90
        ? "Ageing beyond 90 days with no seasonal explanation on file. Consistent with genuine deterioration."
        : "Within normal range for this account.",
  });
}

/** Quantifies what a credit hold would actually cost in downstream revenue. */
export async function get_account_relationship(c: DealerClient, args: Record<string, unknown>) {
  const account = A(args.account_id);
  if (!account) return err("account_id is required");
  const acct = await c.one(
    `SELECT account_id, legal_name, account_tier, annual_parts_service_spend_usd, credit_limit_usd, credit_status
       FROM summit.customer_accounts WHERE account_id = $1`, [account]
  );
  if (!acct) return err(`Unknown account ${account}`);

  const [units] = await c.q(`SELECT COUNT(*) AS owned FROM summit.fleet_assets WHERE owner_account_id = $1`, [account]);
  const [rentals] = await c.q(
    `SELECT COUNT(*) AS active, COALESCE(SUM(rate_usd),0) AS monthly_rental
       FROM summit.rental_contracts WHERE account_id = $1 AND status = 'on_rent'`, [account]
  );
  const [wos] = await c.q(
    `SELECT COUNT(*) AS open_work_orders FROM summit.work_orders WHERE account_id = $1 AND status <> 'closed'`, [account]
  );

  const annualSpend = money(N(acct.annual_parts_service_spend_usd));
  const monthlyRental = money(N(rentals.monthly_rental));
  const tier = A(acct.account_tier);

  return ok({
    account_id: account,
    legal_name: acct.legal_name,
    account_tier: tier,
    units_owned: N(units.owned),
    active_rental_contracts: N(rentals.active),
    monthly_rental_revenue_usd: monthlyRental,
    open_work_orders: N(wos.open_work_orders),
    annual_parts_service_spend_usd: annualSpend,
    // The number that belongs next to any proposed hold.
    estimated_hold_cost_90d_usd: money(annualSpend / 4 + monthlyRental * 3),
    requires_human_approval_for_hold: tier !== "standard",
    note: tier !== "standard"
      ? `This is a ${tier} account. A credit hold ALWAYS requires human approval here regardless of exposure.`
      : "Standard tier. A hold still requires documented ageing evidence and dispute exclusion.",
  });
}

export async function get_invoice_detail(c: DealerClient, args: Record<string, unknown>) {
  const invoiceId = A(args.invoice_id);
  if (!invoiceId) return err("invoice_id is required");
  const inv = await c.one(
    `SELECT i.*, a.legal_name, a.payment_terms, a.settlement_discount_pct, a.settlement_discount_days,
            a.freight_absorption_threshold_usd
       FROM summit.invoices i JOIN summit.customer_accounts a ON a.account_id = i.account_id
      WHERE i.invoice_id = $1`, [invoiceId]
  );
  if (!inv) return err(`Unknown invoice ${invoiceId}`);
  const lines = await c.q(
    `SELECT line_type, description, amount_usd, unit_id FROM summit.invoice_lines WHERE invoice_id = $1`, [invoiceId]
  );
  const disputes = await c.q(
    `SELECT dispute_id, reason_code, disputed_amount_usd, raised_on, status, contract_clause, notes
       FROM summit.disputes WHERE invoice_id = $1`, [invoiceId]
  );
  return ok({ invoice: inv, lines, disputes, line_count: lines.length });
}

// ── Actions ──────────────────────────────────────────────────────────────────

export async function draft_outreach(c: DealerClient, args: Record<string, unknown>) {
  const account = A(args.account_id);
  const requested = A(args.custom_text);
  const tier = A(args.ageing_tier) || "reminder_30";

  // Free-form customer-facing text is refused outright.
  if (requested) {
    const hits = PROHIBITED.filter((p) => p.pattern.test(requested)).map((p) => p.label);
    return err(
      "Free-form collections text is not permitted; outreach must come from the approved template library." +
      (hits.length ? ` The supplied text additionally contains: ${hits.join("; ")}. These require legal review or contractual basis and cannot be sent.` : "") +
      " Choose an ageing_tier (reminder_30 | firm_60 | final_90 | dispute_ack), or escalate if no template fits."
    );
  }

  const tpl = OUTREACH_TEMPLATES[tier];
  if (!tpl) return err(`Unknown ageing_tier "${tier}". Available: ${Object.keys(OUTREACH_TEMPLATES).join(", ")}.`);

  const invoices = await c.q(
    `SELECT invoice_id, balance_usd, due_date FROM summit.invoices
      WHERE account_id = $1 AND status IN ('open','partially_paid') ORDER BY due_date`, [account]
  );
  const disputed = await c.q(
    `SELECT invoice_id FROM summit.disputes WHERE account_id = $1 AND status = 'open'`, [account]
  );
  const disputedIds = new Set(disputed.map((d) => A(d.invoice_id)));
  // Never chase a balance the customer has already formally disputed.
  const chaseable = invoices.filter((i) => !disputedIds.has(A(i.invoice_id)));
  const total = money(chaseable.reduce((s, i) => s + N(i.balance_usd), 0));

  const body = tpl.body
    .replace("{INVOICES}", chaseable.map((i) => A(i.invoice_id)).join(", ") || "(none)")
    .replace("{AMOUNT}", `$${total.toLocaleString("en-US", { minimumFractionDigits: 2 })}`)
    .replace("{DUE_DATE}", A(chaseable[0]?.due_date) || "—")
    .replace("{FINDING}", A(args.finding) || "");

  return ok({
    account_id: account, template_id: tpl.id, tone: tpl.tone,
    invoices_referenced: chaseable.length,
    invoices_excluded_as_disputed: invoices.length - chaseable.length,
    amount_usd: total, draft_text: body,
    note: "Drafted from an approved template. Disputed invoices are excluded from the chase automatically.",
  });
}

export async function prepare_payment_plan(c: DealerClient, args: Record<string, unknown>) {
  const account = A(args.account_id);
  const instalments = Math.max(2, Math.min(12, Math.round(N(args.instalments) || 3)));
  const [agg] = await c.q(
    `SELECT COALESCE(SUM(i.balance_usd),0) AS open_balance FROM summit.invoices i
      WHERE i.account_id = $1 AND i.status IN ('open','partially_paid')`, [account]
  );
  const disputes = await c.q(
    `SELECT COALESCE(SUM(disputed_amount_usd),0) AS disputed FROM summit.disputes
      WHERE account_id = $1 AND status = 'open'`, [account]
  );
  const gross = money(N(agg.open_balance));
  const disputed = money(N(disputes[0]?.disputed));
  const planValue = money(gross - disputed);
  const per = money(planValue / instalments);

  const acct = await c.one(`SELECT account_tier FROM summit.customer_accounts WHERE account_id = $1`, [account]);
  const level = approvalLevelFor(planValue);

  return ok({
    account_id: account, plan_value_usd: planValue,
    excluded_disputed_usd: disputed,
    instalments, instalment_usd: per,
    schedule: Array.from({ length: instalments }, (_, i) => ({
      sequence: i + 1, amount_usd: i === instalments - 1 ? money(planValue - per * (instalments - 1)) : per,
      due_in_days: (i + 1) * 30,
    })),
    required_approval_level: level,
    requires_human_approval: level !== "agent_auto" || A(acct?.account_tier) !== "standard",
    note: "Disputed balances are excluded from the plan value — a payment plan must not quietly convert a dispute into an admitted debt.",
  });
}

export async function prepare_credit_memo(c: DealerClient, args: Record<string, unknown>) {
  const account = A(args.account_id);
  const amount = money(N(args.amount_usd));
  const reason = A(args.reason);
  const clause = A(args.contract_clause);
  const calculation = A(args.calculation);
  const proposedBy = A(args.agent_id) || "VE-AGT-202";

  if (!account || !amount) return err("account_id and amount_usd are required");
  if (!reason) return err("reason is required");

  const level = approvalLevelFor(amount);
  // Evidence is mandatory above the agent ceiling — an unevidenced memo will
  // not survive an audit, so it is refused at assembly time, not at approval.
  if (level !== "agent_auto" && (!clause || !calculation)) {
    return err(
      `A credit memo of $${amount.toFixed(2)} requires ${level} approval, and every memo above the agent ceiling ` +
      "must carry both a contract_clause and a shown calculation. Supply both, or reduce the scope of the memo."
    );
  }

  const memoId = newId("CM");
  await c.q(
    `INSERT INTO summit.credit_memos
       (memo_id, account_id, invoice_id, dispute_id, amount_usd, reason, contract_clause,
        calculation, required_approval_level, status, proposed_by_agent)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [memoId, account, A(args.invoice_id) || null, A(args.dispute_id) || null, amount, reason,
     clause || null, calculation || null, level,
     level === "agent_auto" ? "prepared" : "pending_approval", proposedBy]
  );

  return ok({
    memo_id: memoId, account_id: account, amount_usd: amount, reason,
    contract_clause: clause || null, calculation: calculation || null,
    required_approval_level: level,
    self_approvable: level === "agent_auto",
    status: level === "agent_auto" ? "prepared" : "pending_approval",
    routed_to: level === "agent_auto" ? null : level,
    note: level === "agent_auto"
      ? `Within the $${AUTHORITY.agentCreditMemoCeilingUsd} agent ceiling. Prepared; still requires a separate issue step.`
      : `Above the $${AUTHORITY.agentCreditMemoCeilingUsd} agent ceiling. Routed to ${level}. The clarity of the case does not grant authority — this memo cannot be self-approved.`,
  });
}

/**
 * Computes hold-eligible exposure with disputes excluded, and states the
 * relationship cost alongside it. The exclusion is unconditional: there is no
 * argument the caller can supply that skips it.
 */
export async function evaluate_credit_hold(c: DealerClient, args: Record<string, unknown>) {
  const account = A(args.account_id);
  if (!account) return err("account_id is required");

  const acct = await c.one(
    `SELECT account_id, legal_name, account_tier, credit_limit_usd, annual_parts_service_spend_usd, seasonal_pattern
       FROM summit.customer_accounts WHERE account_id = $1`, [account]
  );
  if (!acct) return err(`Unknown account ${account}`);

  const [agg] = await c.q(
    `SELECT COALESCE(SUM(balance_usd),0) AS gross,
            COALESCE(SUM(balance_usd) FILTER (WHERE CURRENT_DATE - due_date > 90),0) AS past_90,
            COALESCE(MAX(CURRENT_DATE - due_date),0) AS max_days,
            COUNT(*) AS invoices
       FROM summit.invoices WHERE account_id = $1 AND status IN ('open','partially_paid')`,
    [account]
  );
  const [dsp] = await c.q(
    `SELECT COALESCE(SUM(disputed_amount_usd),0) AS disputed, COUNT(*) AS dispute_count
       FROM summit.disputes WHERE account_id = $1 AND status = 'open'`, [account]
  );

  const gross = money(N(agg.gross));
  const disputed = money(N(dsp.disputed));
  const eligible = money(gross - disputed);
  const tier = A(acct.account_tier);

  const relRes = await get_account_relationship(c, { account_id: account });
  const rel = JSON.parse(relRes.content[0].text);
  const holdCost = money(N(rel.estimated_hold_cost_90d_usd));

  const behRes = await get_payment_behaviour(c, { account_id: account });
  const beh = JSON.parse(behRes.content[0].text);

  const reasons: string[] = [];
  let recommended = true;
  if (eligible < 25_000) { recommended = false; reasons.push(`Recoverable exposure of $${eligible.toFixed(2)} is below the materiality threshold for a hold.`); }
  if (beh.currently_in_seasonal_peak) { recommended = false; reasons.push("Ageing is consistent with this account's documented seasonal cycle, not deterioration."); }
  if (disputed > eligible) { recommended = false; reasons.push(`Most of the balance ($${disputed.toFixed(2)}) is under open dispute. This is a service-failure problem, not a credit problem.`); }
  if (holdCost > eligible) { recommended = false; reasons.push(`Estimated 90-day relationship cost ($${holdCost.toFixed(2)}) exceeds recoverable exposure ($${eligible.toFixed(2)}).`); }
  if (N(agg.max_days) < 60) { recommended = false; reasons.push("No balance is beyond 60 days; ageing evidence is insufficient to support a hold."); }

  return ok({
    account_id: account, legal_name: acct.legal_name, account_tier: tier,
    gross_balance_usd: gross,
    disputed_excluded_usd: disputed,
    open_dispute_count: N(dsp.dispute_count),
    hold_eligible_exposure_usd: eligible,
    past_90_usd: money(N(agg.past_90)),
    max_days_past_due: N(agg.max_days),
    ageing_evidence_sufficient: N(agg.max_days) >= 60,
    seasonal_explanation: beh.currently_in_seasonal_peak ? beh.assessment : null,
    estimated_relationship_cost_90d_usd: holdCost,
    recommended,
    reasons_against: reasons,
    requires_human_approval: tier !== "standard" || recommended === false,
    required_approver: tier !== "standard" ? "credit_manager (mandatory for non-standard tier)" : "credit_manager",
    note: tier !== "standard"
      ? `${tier} account — a hold here ALWAYS requires human approval regardless of exposure or arithmetic.`
      : "Disputed balances have been excluded from hold-eligible exposure. That exclusion is unconditional.",
  });
}

export async function apply_credit_hold(c: DealerClient, args: Record<string, unknown>) {
  const account = A(args.account_id);
  const justification = A(args.justification);
  const approver = A(args.approver);
  const proposedBy = A(args.agent_id) || "VE-AGT-202";
  if (!account) return err("account_id is required");
  if (!justification) return err("justification is required — a hold without documented ageing evidence cannot be applied");

  const evalRes = await evaluate_credit_hold(c, { account_id: account });
  const ev = JSON.parse(evalRes.content[0].text);
  if (ev.error) return evalRes;

  // Hard gate: non-standard tiers always need a named human.
  if (ev.account_tier !== "standard" && !approver) {
    return err(
      `${ev.legal_name} is a ${ev.account_tier} account. A credit hold requires a named human approver regardless of exposure ` +
      `($${ev.hold_eligible_exposure_usd} recoverable, estimated relationship cost $${ev.estimated_relationship_cost_90d_usd}). ` +
      "Escalate to the credit manager; do not apply autonomously."
    );
  }
  if (!ev.ageing_evidence_sufficient) {
    return err(`Ageing evidence is insufficient (max ${ev.max_days_past_due} days past due). Escalate to the credit manager rather than applying a hold.`);
  }
  if (ev.disputed_excluded_usd > ev.hold_eligible_exposure_usd && !approver) {
    return err(
      `Most of this balance ($${ev.disputed_excluded_usd}) is under open dispute; recoverable exposure is only ` +
      `$${ev.hold_eligible_exposure_usd}. Applying a hold on the gross balance is prohibited. Resolve the dispute or escalate.`
    );
  }

  const holdId = newId("HOLD");
  await c.tx(async (client) => {
    await client.query(
      `INSERT INTO ${c.schema}.credit_holds
         (hold_id, account_id, justification, hold_eligible_exposure_usd, disputed_excluded_usd,
          relationship_cost_usd, requires_human_approval, approved_by, status, proposed_by_agent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'applied',$9)`,
      [holdId, account, justification, ev.hold_eligible_exposure_usd, ev.disputed_excluded_usd,
       ev.estimated_relationship_cost_90d_usd, ev.requires_human_approval, approver || null, proposedBy]
    );
    await client.query(`UPDATE ${c.schema}.customer_accounts SET credit_status = 'hold' WHERE account_id = $1`, [account]);
  });

  return ok({
    applied: true, hold_id: holdId, account_id: account,
    scope: "account-wide across all branches",
    hold_eligible_exposure_usd: ev.hold_eligible_exposure_usd,
    disputed_excluded_usd: ev.disputed_excluded_usd,
    approved_by: approver, justification,
  });
}

export async function escalate_to_credit_manager(c: DealerClient, args: Record<string, unknown>) {
  const account = A(args.account_id);
  const decision = A(args.decision_requested);
  if (!account || !decision) return err("account_id and decision_requested are required");
  const evalRes = await evaluate_credit_hold(c, { account_id: account });
  const ev = JSON.parse(evalRes.content[0].text);
  return ok({
    escalated: true,
    account_id: account,
    decision_requested: decision,
    exposure_analysis: {
      gross_balance_usd: ev.gross_balance_usd,
      disputed_excluded_usd: ev.disputed_excluded_usd,
      hold_eligible_exposure_usd: ev.hold_eligible_exposure_usd,
      max_days_past_due: ev.max_days_past_due,
    },
    relationship_context: {
      account_tier: ev.account_tier,
      estimated_relationship_cost_90d_usd: ev.estimated_relationship_cost_90d_usd,
      seasonal_explanation: ev.seasonal_explanation,
    },
    agent_recommendation: ev.recommended ? "hold_warranted_on_arithmetic" : "hold_not_recommended",
    reasons_against: ev.reasons_against,
    routed_to: "credit_manager",
  });
}
