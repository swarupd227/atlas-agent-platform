/**
 * VE-J4 — Rental Contract Billing Integrity tools.
 *
 * Telematics is the independent witness and it does not take sides:
 * `reconcile_billed_vs_actual` reports under-billing and over-billing with the
 * same rigour, and `verify_off_rent_date` will just as readily confirm the
 * customer's claim as contradict it.
 *
 * The one thing it will not do is invent a number. A reporting gap is reported
 * as a gap; `calculate_cycle_invoice` refuses to extrapolate usage across it.
 */
import { DealerClient, AUTHORITY, money, daysBetween, todayIso, newId } from "./client";
import { ok, err } from "./tools-cash";

const A = (v: unknown) => (typeof v === "string" ? v : String(v ?? ""));
const N = (v: unknown) => (typeof v === "number" ? v : parseFloat(String(v ?? "0")) || 0);

/** Reported engine hours between two dates, plus any gap in the window. */
async function utilisation(c: DealerClient, unitId: string, from: string, to: string) {
  const rows = await c.q(
    `SELECT reading_date, engine_hours, idle_hours, reported
       FROM summit.telematics_readings
      WHERE unit_id = $1 AND reading_date BETWEEN $2 AND $3
      ORDER BY reading_date`,
    [unitId, from, to]
  );
  const reported = rows.filter((r) => r.reported);
  const gaps = rows.filter((r) => !r.reported);
  const hours = reported.length < 2
    ? 0
    : money(N(reported[reported.length - 1].engine_hours) - N(reported[0].engine_hours));
  return {
    rows, reported_days: reported.length, gap_days: gaps.length,
    gap_dates: gaps.map((g) => A(g.reading_date)),
    engine_hours_accrued: hours,
    first_reading: reported[0] ?? null,
    last_reading: reported[reported.length - 1] ?? null,
    coverage_complete: gaps.length === 0 && reported.length > 1,
  };
}

// ── Contracts & telematics ───────────────────────────────────────────────────

export async function get_billing_cycle_queue(c: DealerClient, args: Record<string, unknown>) {
  const branch = A(args.branch_id);
  const rows = await c.q(
    `SELECT r.contract_id, r.unit_id, r.account_id, r.branch_id, r.start_date,
            r.claimed_off_rent_date, r.actual_collected_date, r.rate_period, r.rate_usd,
            r.included_hours, r.overage_rate_per_hour_usd, r.is_negotiated_rate,
            r.has_purchase_option, r.status,
            a.legal_name, f.manufacturer, f.model, f.machine_class
       FROM summit.rental_contracts r
       JOIN summit.customer_accounts a ON a.account_id = r.account_id
       JOIN summit.fleet_assets f ON f.unit_id = r.unit_id
      WHERE r.status IN ('on_rent','off_rent','disputed') AND ($1 = '' OR r.branch_id = $1)
      ORDER BY r.start_date`,
    [branch]
  );
  return ok({
    contract_count: rows.length,
    with_purchase_option: rows.filter((r) => r.has_purchase_option).length,
    negotiated_rate_contracts: rows.filter((r) => r.is_negotiated_rate).length,
    disputed: rows.filter((r) => A(r.status) === "disputed").length,
    note: "Contracts carrying a purchase option must be flagged for ASC 842 review before any revenue posts.",
    contracts: rows,
  });
}

export async function get_rental_contract_terms(c: DealerClient, args: Record<string, unknown>) {
  const id = A(args.contract_id);
  if (!id) return err("contract_id is required");
  const row = await c.one(
    `SELECT r.*, f.manufacturer, f.model, f.machine_class, a.legal_name
       FROM summit.rental_contracts r
       JOIN summit.fleet_assets f ON f.unit_id = r.unit_id
       JOIN summit.customer_accounts a ON a.account_id = r.account_id
      WHERE r.contract_id = $1`,
    [id]
  );
  if (!row) return err(`Unknown rental contract ${id}`);
  return ok({
    ...row,
    note: row.is_negotiated_rate
      ? "This contract carries a NEGOTIATED rate. Billing it at the branch standard rate over-bills the customer."
      : "Standard rate contract. Billing it at a stale negotiated rate under-bills the dealer.",
  });
}

export async function get_telematics_utilisation(c: DealerClient, args: Record<string, unknown>) {
  const unitId = A(args.unit_id);
  const from = A(args.from_date);
  const to = A(args.to_date) || todayIso();
  if (!unitId || !from) return err("unit_id and from_date are required");
  const u = await utilisation(c, unitId, from, to);
  return ok({
    unit_id: unitId, from_date: from, to_date: to,
    engine_hours_accrued: u.engine_hours_accrued,
    reported_days: u.reported_days, gap_days: u.gap_days, gap_dates: u.gap_dates,
    coverage_complete: u.coverage_complete,
    first_reading: u.first_reading, last_reading: u.last_reading,
    note: u.gap_days > 0
      ? `This unit stopped reporting for ${u.gap_days} day(s). A reporting gap cannot support a billing claim in EITHER direction — do not extrapolate usage across it.`
      : "Telematics coverage is complete for this window.",
  });
}

export async function get_off_rent_request(c: DealerClient, args: Record<string, unknown>) {
  const id = A(args.contract_id);
  if (!id) return err("contract_id is required");
  const row = await c.one(
    `SELECT contract_id, unit_id, account_id, claimed_off_rent_date, actual_collected_date, status
       FROM summit.rental_contracts WHERE contract_id = $1`, [id]
  );
  if (!row) return err(`Unknown rental contract ${id}`);
  if (!row.claimed_off_rent_date) return ok({ contract_id: id, off_rent_requested: false });
  return ok({
    contract_id: id, off_rent_requested: true,
    claimed_off_rent_date: row.claimed_off_rent_date,
    actual_collected_date: row.actual_collected_date,
    days_between_claim_and_collection: row.actual_collected_date
      ? daysBetween(A(row.claimed_off_rent_date), A(row.actual_collected_date)) : null,
    status: row.status,
  });
}

export async function get_condition_report(c: DealerClient, args: Record<string, unknown>) {
  const contractId = A(args.contract_id);
  if (!contractId) return err("contract_id is required");
  const rows = await c.q(
    `SELECT * FROM summit.condition_reports WHERE contract_id = $1 ORDER BY report_date`, [contractId]
  );
  const out = rows.find((r) => A(r.report_type) === "check_out");
  const inn = rows.find((r) => A(r.report_type) === "check_in");
  const rental = await c.one(`SELECT start_date, actual_collected_date FROM summit.rental_contracts WHERE contract_id = $1`, [contractId]);
  const months = rental?.actual_collected_date
    ? money(daysBetween(A(rental.start_date), A(rental.actual_collected_date)) / 30.44) : null;
  const hoursUsed = out && inn ? N(inn.meter_hours) - N(out.meter_hours) : null;
  return ok({
    contract_id: contractId, check_out: out ?? null, check_in: inn ?? null,
    rental_duration_months: months,
    meter_hours_at_dispatch: out ? N(out.meter_hours) : null,
    hours_used_during_rental: hoursUsed,
    damage_claimed_usd: inn ? money(N(inn.damage_claimed_usd)) : 0,
    note: "Charge damage only where the check-in report shows deterioration beyond the check-out baseline. Wear proportionate to the machine's age and hours used is normal wear, not chargeable damage.",
  });
}

// ── Billing & adjustment ─────────────────────────────────────────────────────

export async function calculate_cycle_invoice(c: DealerClient, args: Record<string, unknown>) {
  const contractId = A(args.contract_id);
  if (!contractId) return err("contract_id is required");
  const rc = await c.one(`SELECT * FROM summit.rental_contracts WHERE contract_id = $1`, [contractId]);
  if (!rc) return err(`Unknown rental contract ${contractId}`);

  const from = A(args.from_date) || A(rc.start_date);
  const to = A(args.to_date) || A(rc.actual_collected_date) || todayIso();
  const u = await utilisation(c, A(rc.unit_id), from, to);

  const lines: Array<{ line_type: string; description: string; amount_usd: number; evidence: string }> = [];
  lines.push({ line_type: "rental", description: `${rc.rate_period} rate (contract ${contractId})`, amount_usd: money(N(rc.rate_usd)), evidence: `contract rate, negotiated=${rc.is_negotiated_rate}` });

  let overageBillable = true;
  let overageHours = 0;
  if (!u.coverage_complete) {
    // Refuse to manufacture a billable number out of an evidence gap.
    overageBillable = false;
  } else {
    overageHours = money(Math.max(0, u.engine_hours_accrued - N(rc.included_hours)));
    if (overageHours > 0) {
      lines.push({
        line_type: "rental", description: `Overage: ${overageHours}h beyond ${rc.included_hours} included`,
        amount_usd: money(overageHours * N(rc.overage_rate_per_hour_usd)),
        evidence: `telematics ${u.first_reading?.reading_date} → ${u.last_reading?.reading_date}`,
      });
    }
  }
  if (N(rc.delivery_charge_usd) > 0) lines.push({ line_type: "delivery", description: "Delivery", amount_usd: money(N(rc.delivery_charge_usd)), evidence: "contract terms" });

  return ok({
    contract_id: contractId, period: { from, to },
    included_hours: N(rc.included_hours),
    telematics_hours_accrued: u.coverage_complete ? u.engine_hours_accrued : null,
    telematics_gap_days: u.gap_days,
    overage_hours: overageBillable ? overageHours : null,
    overage_billable: overageBillable,
    lines,
    total_usd: money(lines.reduce((s, l) => s + l.amount_usd, 0)),
    requires_human_review: !overageBillable,
    note: overageBillable
      ? "Every line traces to contract terms or telematics evidence."
      : `Telematics reported no data for ${u.gap_days} day(s) in this period. Overage has NOT been billed — extrapolating usage across a reporting gap to justify a charge is prohibited. Flagged for human review.`,
  });
}

export async function reconcile_billed_vs_actual(c: DealerClient, args: Record<string, unknown>) {
  const contractId = A(args.contract_id);
  const billed = args.billed_amount_usd === undefined ? null : money(N(args.billed_amount_usd));
  if (!contractId) return err("contract_id is required");

  const calcRes = await calculate_cycle_invoice(c, { contract_id: contractId, from_date: args.from_date, to_date: args.to_date });
  const calc = JSON.parse(calcRes.content[0].text);
  if (calc.error) return calcRes;

  const rc = await c.one(`SELECT * FROM summit.rental_contracts WHERE contract_id = $1`, [contractId]);
  const shouldBe = money(N(calc.total_usd));
  const findings: Array<{ direction: string; amount_usd: number; reason: string; evidence: string }> = [];

  if (billed !== null) {
    const delta = money(shouldBe - billed);
    if (Math.abs(delta) > 0.005) {
      findings.push({
        direction: delta > 0 ? "under_billed" : "over_billed",
        amount_usd: money(Math.abs(delta)),
        reason: delta > 0 ? "Billed less than contract terms and verified utilisation support" : "Billed more than contract terms and verified utilisation support",
        evidence: `calculated ${shouldBe} vs billed ${billed}`,
      });
    }
  }

  // Negotiated-rate contracts billed at branch standard over-bill the customer.
  if (rc?.is_negotiated_rate && args.billed_rate_usd !== undefined) {
    const billedRate = money(N(args.billed_rate_usd));
    const contractRate = money(N(rc.rate_usd));
    if (billedRate > contractRate) {
      findings.push({
        direction: "over_billed",
        amount_usd: money(billedRate - contractRate),
        reason: "Negotiated contract rate was billed at the branch standard rate",
        evidence: `contract rate ${contractRate} vs billed rate ${billedRate}`,
      });
    }
  }

  const under = money(findings.filter((f) => f.direction === "under_billed").reduce((s, f) => s + f.amount_usd, 0));
  const over = money(findings.filter((f) => f.direction === "over_billed").reduce((s, f) => s + f.amount_usd, 0));

  return ok({
    contract_id: contractId,
    calculated_total_usd: shouldBe, billed_total_usd: billed,
    under_billed_usd: under, over_billed_usd: over,
    findings,
    telematics_gap_days: calc.telematics_gap_days,
    note: over > 0
      ? "OVER-BILLING FOUND. Report this with at least the same prominence as any under-billing — a revenue assurance process that only ever finds money for the dealer will not survive a customer conversation."
      : under > 0 ? "Under-billing found. Adjustment must carry its telematics evidence."
      : "No variance. Invoice may be released.",
  });
}

export async function verify_off_rent_date(c: DealerClient, args: Record<string, unknown>) {
  const contractId = A(args.contract_id);
  if (!contractId) return err("contract_id is required");
  const rc = await c.one(`SELECT * FROM summit.rental_contracts WHERE contract_id = $1`, [contractId]);
  if (!rc) return err(`Unknown rental contract ${contractId}`);
  if (!rc.claimed_off_rent_date) return ok({ contract_id: contractId, off_rent_claimed: false });

  const claimed = A(rc.claimed_off_rent_date);
  const collected = A(rc.actual_collected_date) || todayIso();
  const u = await utilisation(c, A(rc.unit_id), claimed, collected);
  const corroborated = u.engine_hours_accrued < 1.0;

  return ok({
    contract_id: contractId,
    claimed_off_rent_date: claimed,
    actual_collected_date: rc.actual_collected_date,
    engine_hours_after_claimed_date: u.engine_hours_accrued,
    telematics_coverage_complete: u.coverage_complete,
    claim_corroborated: corroborated,
    verified_off_rent_date: corroborated ? claimed : collected,
    billable_days_after_claim: corroborated ? 0 : daysBetween(claimed, collected),
    evidence: {
      first_reading: u.first_reading, last_reading: u.last_reading, reported_days: u.reported_days,
    },
    note: corroborated
      ? "The machine genuinely accrued no meaningful hours after the claimed date. The customer is correct — credit the idle period."
      : `The machine accrued ${u.engine_hours_accrued} engine hours between the claimed off-rent date and collection. Credit only the genuinely idle period and present this hour-meter evidence with the adjustment.`,
  });
}

export async function prepare_billing_adjustment(c: DealerClient, args: Record<string, unknown>) {
  const contractId = A(args.contract_id);
  const amount = money(N(args.amount_usd));
  const direction = A(args.direction);
  const evidence = A(args.evidence);
  if (!contractId || !amount) return err("contract_id and amount_usd are required");
  if (!["credit_customer", "bill_customer"].includes(direction)) {
    return err('direction must be "credit_customer" or "bill_customer"');
  }
  if (!evidence) return err("evidence is required — every rental adjustment must cite the contract term or telematics reading that supports it");

  const needsApproval = amount > AUTHORITY.agentAdjustmentCeilingUsd;
  return ok({
    adjustment_id: newId("ADJ"),
    contract_id: contractId, direction, amount_usd: amount, evidence,
    required_approval_level: needsApproval ? "branch_controller" : "agent_auto",
    requires_human_approval: needsApproval,
    status: needsApproval ? "pending_approval" : "prepared",
    note: needsApproval
      ? `Above the $${AUTHORITY.agentAdjustmentCeilingUsd} agent ceiling — routed to the branch controller. This applies in BOTH directions; an adjustment in the dealer's favour is not exempt.`
      : "Within the agent ceiling. Prepared with evidence attached.",
  });
}

export async function flag_asc842_review(c: DealerClient, args: Record<string, unknown>) {
  const contractId = A(args.contract_id);
  if (!contractId) return err("contract_id is required");
  const rc = await c.one(
    `SELECT contract_id, has_purchase_option, purchase_option_terms, rate_period, rate_usd, start_date
       FROM summit.rental_contracts WHERE contract_id = $1`, [contractId]
  );
  if (!rc) return err(`Unknown rental contract ${contractId}`);
  if (!rc.has_purchase_option) {
    return ok({ contract_id: contractId, review_required: false, note: "No purchase option present. Ordinary operating rental treatment applies." });
  }
  return ok({
    contract_id: contractId, review_required: true,
    triggering_features: ["rental_purchase_option"],
    purchase_option_terms: rc.purchase_option_terms,
    routed_to: "financial_controller",
    revenue_posting: "HELD",
    note: "This contract carries a purchase option, so it must be assessed for lease classification under ASC 842 BEFORE any revenue posts as operating rental. Revenue recognition is held pending that review.",
  });
}

export async function release_invoice(c: DealerClient, args: Record<string, unknown>) {
  const contractId = A(args.contract_id);
  if (!contractId) return err("contract_id is required");
  const rc = await c.one(`SELECT * FROM summit.rental_contracts WHERE contract_id = $1`, [contractId]);
  if (!rc) return err(`Unknown rental contract ${contractId}`);

  // Gate 1 — ASC 842 must be cleared first.
  if (rc.has_purchase_option && !args.asc842_cleared_by) {
    return err(
      `Contract ${contractId} carries a purchase option and has not been cleared through ASC 842 lease-classification review. ` +
      "Revenue may not be released as operating rental until a financial controller has classified it."
    );
  }
  // Gate 2 — reconciliation must have run.
  const calcRes = await calculate_cycle_invoice(c, { contract_id: contractId });
  const calc = JSON.parse(calcRes.content[0].text);
  if (calc.requires_human_review && !args.gap_reviewed_by) {
    return err(
      `Contract ${contractId} has ${calc.telematics_gap_days} day(s) of missing telematics in the billing period. ` +
      "A human must decide on the unreported period before the invoice is released."
    );
  }

  const invoiceId = newId("INV");
  await c.q(
    `INSERT INTO summit.invoices
       (invoice_id, account_id, branch_id, revenue_line, invoice_date, due_date,
        original_amount_usd, balance_usd, status, obligation_satisfied_on, source_document)
     VALUES ($1,$2,$3,'rental',CURRENT_DATE,CURRENT_DATE + 30,$4,$4,'open',CURRENT_DATE,$5)`,
    [invoiceId, rc.account_id, rc.branch_id, money(N(calc.total_usd)), `Rental cycle billing ${contractId}`]
  );
  return ok({
    released: true, invoice_id: invoiceId, contract_id: contractId,
    amount_usd: money(N(calc.total_usd)), lines: calc.lines,
    note: "Released with every line traced to its evidence source.",
  });
}
