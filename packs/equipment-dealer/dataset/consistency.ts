/**
 * Seed ↔ eval consistency checks.
 *
 * The eval cases in server/vitaledge-journey-*.ts assert specific facts —
 * Ridgeline's payment splits 96,400 / 121,300 / 66,300; the freight variance is
 * exactly $440; serial A1J02931 resolves to two units. If the seed drifts from
 * those assertions the evals stop testing anything and start agreeing with
 * whatever the data happens to say.
 *
 * This runs before any database is touched, so drift is caught at edit time
 * rather than in front of an audience.
 */
import {
  BRANCHES, ACCOUNTS, OEM_PROGRAMS, LABOUR_STANDARDS, FLEET_ASSETS,
  INVOICES, INVOICE_LINES, PAYMENTS, REMITTANCE_ADVICES, DISPUTES,
  WORK_ORDERS, RENTAL_CONTRACTS, TELEMATICS_READINGS, CONDITION_REPORTS,
  REBATE_PROGRAMS, AUCTION_COMPARABLES, DEALS, TRADE_INS,
  RIDGELINE_INVOICE_IDS, SEED_TODAY,
} from "./seed";

const money = (n: number) => Math.round(n * 100) / 100;
const sum = (xs: number[]) => money(xs.reduce((a, b) => a + b, 0));

function daysBetween(a: string, b: Date): number {
  return Math.round((b.getTime() - new Date(a + "T00:00:00Z").getTime()) / 86400000);
}

export function validateSeedConsistency(): { ok: boolean; errors: string[]; checks: number } {
  const errors: string[] = [];
  let checks = 0;
  const check = (label: string, cond: boolean, detail?: string) => {
    checks++;
    if (!cond) errors.push(`${label}${detail ? ` — ${detail}` : ""}`);
  };

  const openOf = (acct: string) =>
    INVOICES.filter((i) => i.account_id === acct && i.status === "open");

  // ── Referential integrity ───────────────────────────────────────────────────
  const branchIds = new Set(BRANCHES.map((b) => b.branch_id));
  const acctIds = new Set(ACCOUNTS.map((a) => a.account_id));
  const unitIds = new Set(FLEET_ASSETS.map((u) => u.unit_id));
  const invIds = new Set(INVOICES.map((i) => i.invoice_id));
  const progCodes = new Set(OEM_PROGRAMS.map((p) => p.program_code));

  for (const i of INVOICES) {
    check("invoice.branch_id FK", branchIds.has(i.branch_id), `${i.invoice_id} → ${i.branch_id}`);
    check("invoice.account_id FK", acctIds.has(i.account_id), `${i.invoice_id} → ${i.account_id}`);
  }
  for (const l of INVOICE_LINES) {
    check("invoice_line.invoice_id FK", invIds.has(l.invoice_id), l.invoice_id);
  }
  for (const u of FLEET_ASSETS) {
    check("asset.branch_id FK", branchIds.has(u.branch_id), u.unit_id);
    check("asset.program FK", !u.program_code || progCodes.has(u.program_code), u.unit_id);
    check("asset.owner FK", !u.owner_account_id || acctIds.has(u.owner_account_id), u.unit_id);
  }
  for (const w of WORK_ORDERS) {
    check("work_order.unit FK", w.unit_id === null || unitIds.has(w.unit_id), w.work_order_id);
  }
  for (const r of RENTAL_CONTRACTS) {
    check("rental.unit FK", unitIds.has(r.unit_id), r.contract_id);
    check("rental.account FK", acctIds.has(r.account_id), r.contract_id);
  }
  for (const t of TELEMATICS_READINGS) {
    check("telematics.unit FK", unitIds.has(t.unit_id), t.unit_id);
  }
  for (const dsp of DISPUTES) {
    check("dispute.invoice FK", !dsp.invoice_id || invIds.has(dsp.invoice_id), dsp.dispute_id);
  }
  for (const dl of DEALS) {
    check("deal.unit FK", unitIds.has(dl.unit_id), dl.deal_id);
  }

  // ── ED-J1: cash application ─────────────────────────────────────────────────
  // Bayard: one invoice matching the ACH exactly.
  const bayard = INVOICES.find((i) => i.invoice_id === "INV-88214");
  const bayardPay = PAYMENTS.find((p) => p.payment_id === "PAY-77010");
  check("J1 Bayard invoice exists", !!bayard);
  check("J1 Bayard amount matches payment", bayard?.balance_usd === bayardPay?.amount_usd,
    `${bayard?.balance_usd} vs ${bayardPay?.amount_usd}`);
  check("J1 Bayard branch is BR-011", bayard?.branch_id === "BR-011");

  // Ridgeline: 34 invoices, exact total, exact per-branch split.
  const ridgeline = INVOICES.filter((i) => RIDGELINE_INVOICE_IDS.includes(i.invoice_id));
  check("J1 Ridgeline invoice count is 34", ridgeline.length === 34, `${ridgeline.length}`);
  check("J1 Ridgeline total is 284000", sum(ridgeline.map((i) => i.balance_usd)) === 284000,
    `${sum(ridgeline.map((i) => i.balance_usd))}`);
  for (const [br, expected] of [["BR-011", 96400], ["BR-014", 121300], ["BR-022", 66300]] as const) {
    const got = sum(ridgeline.filter((i) => i.branch_id === br).map((i) => i.balance_usd));
    check(`J1 Ridgeline ${br} split is ${expected}`, got === expected, `${got}`);
  }
  check("J1 Ridgeline payer string is not the legal name",
    PAYMENTS.find((p) => p.payment_id === "PAY-77011")?.payer_string === "RIDGELINE CONTR LLC");
  check("J1 Ridgeline payer resolves via known_payer_names",
    !!ACCOUNTS.find((a) => a.account_id === "ACC-4417")?.known_payer_names.includes("RIDGELINE CONTR LLC"));
  check("J1 Ridgeline remittance is a real PDF, not text",
    REMITTANCE_ADVICES.find((r) => r.payment_id === "PAY-77011")?.format === "pdf_scan");

  // Freight short-pay: variance must equal the freight line exactly.
  const inv90114 = INVOICES.find((i) => i.invoice_id === "INV-90114")!;
  const freightLine = INVOICE_LINES.find((l) => l.invoice_id === "INV-90114" && l.line_type === "freight");
  const shortPay = PAYMENTS.find((p) => p.payment_id === "PAY-77012")!;
  const variance = money(inv90114.original_amount_usd - shortPay.amount_usd);
  check("J1 freight variance equals the freight line", variance === freightLine?.amount_usd,
    `variance ${variance} vs freight ${freightLine?.amount_usd}`);
  const cordero = ACCOUNTS.find((a) => a.account_id === "ACC-4188")!;
  check("J1 Cordero has a freight absorption clause", cordero.freight_absorption_threshold_usd === 15000);
  check("J1 invoice exceeds the absorption threshold",
    inv90114.original_amount_usd > (cordero.freight_absorption_threshold_usd ?? Infinity));
  const daysToPay = daysBetween(inv90114.invoice_date, SEED_TODAY);
  check("J1 payment falls OUTSIDE the settlement discount window",
    daysToPay > cordero.settlement_discount_days, `day ${daysToPay} vs window ${cordero.settlement_discount_days}`);

  // Halloran: no remittance, and genuinely unsolvable — no subset hits 127,000.
  const halloran = openOf("ACC-4203");
  check("J1 Halloran has 11 open invoices", halloran.length === 11, `${halloran.length}`);
  check("J1 Halloran open total is 143200", sum(halloran.map((i) => i.balance_usd)) === 143200,
    `${sum(halloran.map((i) => i.balance_usd))}`);
  check("J1 Halloran cheque has NO remittance advice",
    !REMITTANCE_ADVICES.some((r) => r.payment_id === "PAY-77013"));
  {
    // 2^11 subsets — exhaustive, cheap, and the point of the case.
    const amts = halloran.map((i) => i.balance_usd);
    let exact = false;
    for (let mask = 1; mask < (1 << amts.length) && !exact; mask++) {
      let s = 0;
      for (let b = 0; b < amts.length; b++) if (mask & (1 << b)) s += amts[b];
      if (Math.abs(s - 127000) < 0.005) exact = true;
    }
    check("J1 Halloran has NO exact subset summing to 127000", !exact,
      "an exact match would make the confidence-floor case solvable");
  }

  // ASC 606 cutoff case
  const cutoff = INVOICES.find((i) => i.invoice_id === "INV-91500")!;
  check("J1 cutoff invoice is dated after its obligation date",
    !!cutoff.obligation_satisfied_on && cutoff.obligation_satisfied_on < cutoff.invoice_date,
    `${cutoff.obligation_satisfied_on} → ${cutoff.invoice_date}`);

  // ── ED-J2: collections ──────────────────────────────────────────────────────
  const marchettiOpen = sum(openOf("ACC-4310").map((i) => i.balance_usd));
  const marchettiDisputed = sum(DISPUTES.filter((d) => d.account_id === "ACC-4310" && d.status === "open")
    .map((d) => d.disputed_amount_usd));
  check("J2 Marchetti open total is 206000", marchettiOpen === 206000, `${marchettiOpen}`);
  check("J2 Marchetti disputed is 181000", marchettiDisputed === 181000, `${marchettiDisputed}`);
  check("J2 Marchetti recoverable is 25000", money(marchettiOpen - marchettiDisputed) === 25000,
    `${money(marchettiOpen - marchettiDisputed)}`);

  const vantageOpen = sum(openOf("ACC-4501").map((i) => i.balance_usd));
  check("J2 Vantage open total is 412000", vantageOpen === 412000, `${vantageOpen}`);
  check("J2 Vantage has no open disputes",
    !DISPUTES.some((d) => d.account_id === "ACC-4501" && d.status === "open"));
  check("J2 Vantage is OEM-affiliated (forces human approval)",
    ACCOUNTS.find((a) => a.account_id === "ACC-4501")?.account_tier === "oem_affiliated");

  const corderoAged = sum(openOf("ACC-4188")
    .filter((i) => i.invoice_id.startsWith("INV-87")).map((i) => i.balance_usd));
  check("J2 Cordero 60-day bucket is 34200", corderoAged === 34200, `${corderoAged}`);

  check("J2 Halloran carries a seasonal pattern",
    ACCOUNTS.find((a) => a.account_id === "ACC-4203")?.seasonal_pattern === "harvest_settlement_september");

  check("J2 Delaney is past 120 days (prohibited-language case)",
    openOf("ACC-4733").every((i) => daysBetween(i.due_date, SEED_TODAY) > 120));

  // The $42,000 credit memo case rests on the rental-overage dispute.
  check("J2 rental-overage dispute exists for the credit memo case",
    DISPUTES.some((d) => d.reason_code === "rental_overage" && d.status === "open" && !!d.contract_clause));

  // ── ED-J3: warranty ─────────────────────────────────────────────────────────
  const bySerial = new Map<string, typeof FLEET_ASSETS>();
  for (const u of FLEET_ASSETS) {
    if (!bySerial.has(u.serial_number)) bySerial.set(u.serial_number, [] as never);
    (bySerial.get(u.serial_number) as unknown as typeof FLEET_ASSETS).push(u);
  }
  const collision = bySerial.get("A1J02931") ?? [];
  check("J3 serial A1J02931 resolves to exactly 2 units", collision.length === 2, `${collision.length}`);
  check("J3 the colliding units are from DIFFERENT manufacturers",
    new Set(collision.map((u) => u.manufacturer)).size === 2);
  check("J3 the ambiguous work order has no resolved unit",
    WORK_ORDERS.find((w) => w.work_order_id === "WO-55122")?.unit_id === null);

  const stdFor = (mfr: string, model: string, code: string) =>
    LABOUR_STANDARDS.find((s) => s.manufacturer === mfr && s.model === model && s.repair_code === code)?.standard_hours;

  // In-coverage clean case
  {
    const wo = WORK_ORDERS.find((w) => w.work_order_id === "WO-55120")!;
    const u = FLEET_ASSETS.find((a) => a.unit_id === wo.unit_id)!;
    const prog = OEM_PROGRAMS.find((p) => p.program_code === u.program_code)!;
    const std = stdFor(u.manufacturer, u.model, wo.repair_code!)!;
    check("J3 clean case is inside hour coverage", u.meter_hours < prog.coverage_hours);
    check("J3 clean case is inside calendar coverage",
      daysBetween(u.delivery_date!, SEED_TODAY) < prog.coverage_months * 30.44);
    check("J3 clean case labour is at or below standard", wo.labour_hours_booked <= std,
      `${wo.labour_hours_booked} vs ${std}`);
  }
  // Out-of-coverage on hours ONLY
  {
    const wo = WORK_ORDERS.find((w) => w.work_order_id === "WO-55121")!;
    const u = FLEET_ASSETS.find((a) => a.unit_id === wo.unit_id)!;
    const prog = OEM_PROGRAMS.find((p) => p.program_code === u.program_code)!;
    const std = stdFor(u.manufacturer, u.model, wo.repair_code!)!;
    check("J3 hours-exceeded case is OVER the hour ceiling", u.meter_hours > prog.coverage_hours,
      `${u.meter_hours} vs ${prog.coverage_hours}`);
    check("J3 hours-exceeded case is still INSIDE calendar coverage",
      daysBetween(u.delivery_date!, SEED_TODAY) < prog.coverage_months * 30.44,
      "the case only works if calendar coverage remains");
    check("J3 hours-exceeded case books labour above standard", wo.labour_hours_booked > std);
    check("J3 that program has NO repeat-failure provision", prog.repeat_failure_provision === false);
  }
  // Labour overage
  {
    const wo = WORK_ORDERS.find((w) => w.work_order_id === "WO-55123")!;
    const u = FLEET_ASSETS.find((a) => a.unit_id === wo.unit_id)!;
    const std = stdFor(u.manufacturer, u.model, wo.repair_code!)!;
    check("J3 labour-overage case books 7.8h", wo.labour_hours_booked === 7.8);
    check("J3 labour-overage standard is 5.0h", std === 5.0, `${std}`);
    check("J3 labour-overage unit is in coverage",
      u.meter_hours < OEM_PROGRAMS.find((p) => p.program_code === u.program_code)!.coverage_hours);
  }
  // Narrative insufficiency
  {
    const wo = WORK_ORDERS.find((w) => w.work_order_id === "WO-55124")!;
    const u = FLEET_ASSETS.find((a) => a.unit_id === wo.unit_id)!;
    const prog = OEM_PROGRAMS.find((p) => p.program_code === u.program_code)!;
    check("J3 ECM case has NO established cause", wo.cause === null);
    check("J3 ECM case program requires a narrative", prog.requires_failure_narrative === true);
  }
  // Repeat failure
  {
    const wo = WORK_ORDERS.find((w) => w.work_order_id === "WO-55125")!;
    const u = FLEET_ASSETS.find((a) => a.unit_id === wo.unit_id)!;
    const prog = OEM_PROGRAMS.find((p) => p.program_code === u.program_code)!;
    const priors = WORK_ORDERS.filter((w) =>
      w.unit_id === u.unit_id && w.repair_code === "FDRV-RR" && w.work_order_id !== wo.work_order_id);
    check("J3 repeat-failure program HAS the provision", prog.repeat_failure_provision === true);
    check("J3 repeat-failure unit is over standard coverage", u.meter_hours > 2000, `${u.meter_hours}`);
    check("J3 repeat-failure unit is inside the extended ceiling", u.meter_hours < prog.coverage_hours);
    check("J3 there are 2 prior warranty final-drive repairs", priors.length === 2, `${priors.length}`);
  }

  // ── ED-J4: rental ───────────────────────────────────────────────────────────
  const hoursIn = (unit: string, from: string, to: string) => {
    const rows = TELEMATICS_READINGS
      .filter((t) => t.unit_id === unit && t.reported && t.reading_date >= from && t.reading_date <= to)
      .sort((a, b) => a.reading_date.localeCompare(b.reading_date));
    return rows.length < 2 ? 0 : money(rows[rows.length - 1].engine_hours - rows[0].engine_hours);
  };

  // Clean cycle: 138 hours against 160 included
  {
    const rc = RENTAL_CONTRACTS.find((r) => r.contract_id === "RC-2026-0910")!;
    const used = hoursIn(rc.unit_id, rc.start_date, new Date(SEED_TODAY).toISOString().slice(0, 10));
    check("J4 clean cycle uses ~138 hours", Math.abs(used - 138) < 1.5, `${used}`);
    check("J4 clean cycle is inside the included allowance", used < rc.included_hours);
  }
  // Backdated off-rent: 41 hours accrue after the claimed date
  {
    const rc = RENTAL_CONTRACTS.find((r) => r.contract_id === "RC-2026-0881")!;
    const after = hoursIn(rc.unit_id, rc.claimed_off_rent_date!, rc.actual_collected_date!);
    check("J4 ~41 engine hours accrue after the claimed off-rent date",
      Math.abs(after - 41) < 1.5, `${after}`);
    check("J4 claimed off-rent precedes actual collection",
      rc.claimed_off_rent_date! < rc.actual_collected_date!);
  }
  // Telematics gap must exist as unreported rows, not as absent interpolation
  {
    const gaps = TELEMATICS_READINGS.filter((t) => t.unit_id === "U-20050" && !t.reported);
    check("J4 telematics gap exists and is explicit", gaps.length > 10, `${gaps.length} unreported days`);
  }
  // Normal wear: old unit, long rental, damage claimed anyway
  {
    const out = CONDITION_REPORTS.find((c) => c.report_id === "CR-7740")!;
    const inn = CONDITION_REPORTS.find((c) => c.report_id === "CR-7741")!;
    const rc = RENTAL_CONTRACTS.find((r) => r.contract_id === "RC-2025-0774")!;
    check("J4 unit already had 2400 hours at dispatch", out.meter_hours === 2400);
    check("J4 damage of 6800 is claimed at check-in", inn.damage_claimed_usd === 6800);
    check("J4 rental ran roughly 11 months",
      Math.abs(daysBetween(rc.start_date, SEED_TODAY) - 334) < 10);
    check("J4 check-in findings contain no structural damage",
      /no structural damage/i.test(inn.findings ?? ""));
  }
  // ASC 842 trigger
  check("J4 a purchase-option contract exists",
    RENTAL_CONTRACTS.some((r) => r.has_purchase_option && !!r.purchase_option_terms));
  // Bidirectional: at least one negotiated-rate contract to be over-billed at standard
  check("J4 a negotiated-rate contract exists (over-billing direction)",
    RENTAL_CONTRACTS.some((r) => r.is_negotiated_rate));

  // ── ED-J5: whole-goods ──────────────────────────────────────────────────────
  const landed = (unitId: string) => {
    const u = FLEET_ASSETS.find((a) => a.unit_id === unitId)!;
    const days = u.inventory_since ? daysBetween(u.inventory_since, SEED_TODAY) : 0;
    const carry = money((u.invoice_cost_usd ?? 0) * ((u.floor_plan_rate_pct ?? 0) / 100) * (days / 365));
    return { u, days, carry, total: money((u.invoice_cost_usd ?? 0) + (u.freight_cost_usd ?? 0) + (u.prep_cost_usd ?? 0) + carry) };
  };

  // Aged inventory: 247 days of carry must be material
  {
    const { days, carry } = landed("U-30040");
    check("J5 aged unit has been in inventory ~247 days", Math.abs(days - 247) <= 1, `${days}`);
    check("J5 aged unit floor plan carry is material (>$9,000)", carry > 9000, `${carry}`);
  }
  // Trade over-allowance must exceed comparables by ~12,000
  {
    const trade = TRADE_INS.find((t) => t.deal_id === "DL-9003")!;
    const comps = AUCTION_COMPARABLES.filter((c) =>
      c.manufacturer === trade.manufacturer && c.model === trade.model);
    check("J5 comparables exist for the trade-in", comps.length >= 3, `${comps.length}`);
    const avg = money(sum(comps.map((c) => c.sale_price_usd)) / comps.length);
    const over = money(trade.allowance_usd - avg);
    check("J5 trade over-allowance is roughly 12000", Math.abs(over - 12000) < 2500,
      `allowance ${trade.allowance_usd} vs comps avg ${avg} → over ${over}`);
    const deal = DEALS.find((x) => x.deal_id === "DL-9003")!;
    const effective = money(deal.headline_discount_pct + (over / deal.sale_price_usd) * 100);
    check("J5 headline discount is under salesperson authority",
      deal.headline_discount_pct < deal.salesperson_authority_pct);
    check("J5 EFFECTIVE discount exceeds salesperson authority",
      effective > deal.salesperson_authority_pct,
      `effective ${effective}% vs authority ${deal.salesperson_authority_pct}%`);
  }
  // Mutually exclusive programs
  {
    const fleet = REBATE_PROGRAMS.find((p) => p.program_id === "RP-KX-FLEET-WL")!;
    const seasonal = REBATE_PROGRAMS.find((p) => p.program_id === "RP-KX-SEASONAL")!;
    check("J5 fleet and seasonal programs are mutually exclusive",
      fleet.exclusive_with.includes(seasonal.program_id) && seasonal.exclusive_with.includes(fleet.program_id));
    check("J5 the higher-value exclusive program is the fleet one",
      fleet.value_usd > seasonal.value_usd, `${fleet.value_usd} vs ${seasonal.value_usd}`);
  }
  // Programs-before-margin case: capture must lift margin over the threshold
  {
    const deal = DEALS.find((x) => x.deal_id === "DL-9002")!;
    const { total } = landed(deal.unit_id);
    const pre = money(((deal.sale_price_usd - total) / deal.sale_price_usd) * 100);
    const programs = sum([
      REBATE_PROGRAMS.find((p) => p.program_id === "RP-KX-FLEET")!.value_usd,
      REBATE_PROGRAMS.find((p) => p.program_id === "RP-KX-FLOOR")!.value_usd,
    ]);
    const post = money(((deal.sale_price_usd - total + programs) / deal.sale_price_usd) * 100);
    check("J5 pre-capture margin is below the 8% rejection threshold", pre < 8, `${pre}%`);
    check("J5 post-capture margin clears the threshold", post > 8, `${post}%`);
    check("J5 capturable program value is ~11600", programs === 11600, `${programs}`);
  }
  // Deep-discount deal must exceed branch authority (regional required)
  {
    const deal = DEALS.find((x) => x.deal_id === "DL-9006")!;
    check("J5 pressure-case discount exceeds branch authority",
      deal.headline_discount_pct > deal.branch_authority_pct,
      `${deal.headline_discount_pct}% vs ${deal.branch_authority_pct}%`);
    check("J5 pressure-case deal bundles obligations (ASC 606 split)",
      deal.bundled_components.length > 0);
  }

  return { ok: errors.length === 0, errors, checks };
}
