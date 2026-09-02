/**
 * Summit Equipment Group — seed dataset.
 *
 * Synthetic, but not arbitrary: every fact asserted by an eval case in
 * server/vitaledge-journey-*.ts is materialised here as real rows, so an eval
 * either passes or fails on the data rather than on a fixture that was written
 * to agree with it.
 *
 * Consistency rules held throughout:
 *   - Ridgeline's 34 invoices really do sum to $284,000 and really do split
 *     96,400 / 121,300 / 66,300 across BR-011 / BR-014 / BR-022.
 *   - Halloran's 11 open invoices really total $143,200, and no subset sums
 *     to exactly $127,000 — that case is unsolvable by design.
 *   - Serial A1J02931 really is carried by two units from two manufacturers.
 *   - Telematics hours really do accrue after a claimed off-rent date, and a
 *     genuine reporting gap really is absent rather than interpolated.
 *
 * Dates are anchored to SEED_TODAY so ageing buckets stay correct whenever the
 * data is loaded.
 */

/** All ageing is computed relative to this. Set at load time by the runner. */
export const SEED_TODAY = new Date("2026-09-04T00:00:00Z"); // demo day

function d(offsetDays: number): string {
  const t = new Date(SEED_TODAY);
  t.setUTCDate(t.getUTCDate() + offsetDays);
  return t.toISOString().slice(0, 10);
}

/** Split `total` into `n` plausible invoice amounts that sum to it EXACTLY. */
function distribute(total: number, n: number, seed: number): number[] {
  const weights: number[] = [];
  let s = seed;
  for (let i = 0; i < n; i++) {
    s = (s * 1103515245 + 12345) % 2147483648; // deterministic LCG
    weights.push(0.5 + (s / 2147483648) * 1.5);
  }
  const wSum = weights.reduce((a, b) => a + b, 0);
  const out = weights.map((w) => Math.round((total * w) / wSum * 100) / 100);
  const drift = Math.round((total - out.reduce((a, b) => a + b, 0)) * 100) / 100;
  out[0] = Math.round((out[0] + drift) * 100) / 100;
  return out;
}

// ─── Branches ─────────────────────────────────────────────────────────────────
export const BRANCHES = [
  { branch_id: "BR-011", name: "Cedar Falls",  division: "construction", city: "Cedar Falls",  state: "IA", controller_name: "Dana Whitfield",  controller_authority_usd: 100000 },
  { branch_id: "BR-014", name: "Ridgeway",     division: "agriculture",  city: "Ridgeway",     state: "IA", controller_name: "Marcus Bell",      controller_authority_usd: 100000 },
  { branch_id: "BR-022", name: "Fort Dodge",   division: "compact",      city: "Fort Dodge",   state: "IA", controller_name: "Priya Raman",      controller_authority_usd: 100000 },
  { branch_id: "BR-031", name: "Glenwood",     division: "construction", city: "Glenwood",     state: "NE", controller_name: "Tom Eriksen",      controller_authority_usd: 100000 },
  { branch_id: "BR-045", name: "Blue Earth",   division: "forestry",     city: "Blue Earth",   state: "MN", controller_name: "Rachel Osei",      controller_authority_usd: 100000 },
];

// ─── Customer accounts ────────────────────────────────────────────────────────
export const ACCOUNTS = [
  {
    account_id: "ACC-4417", legal_name: "Ridgeline Contracting LLC",
    known_payer_names: ["RIDGELINE CONTR LLC", "RIDGELINE CONTRACTING", "RIDGELINE EXCAV DBA"],
    account_tier: "standard", credit_limit_usd: 500000, payment_terms: "Net 30",
    settlement_discount_pct: 0, settlement_discount_days: 0,
    freight_absorption_threshold_usd: 20000, credit_status: "good",
    primary_division: "construction", annual_parts_service_spend_usd: 412000,
    seasonal_pattern: null, onboarded_on: d(-2900),
  },
  {
    account_id: "ACC-4102", legal_name: "Bayard Excavating Inc",
    known_payer_names: ["BAYARD EXCAVATING", "BAYARD EXCAV INC"],
    account_tier: "standard", credit_limit_usd: 200000, payment_terms: "Net 30",
    settlement_discount_pct: 0, settlement_discount_days: 0,
    freight_absorption_threshold_usd: null, credit_status: "good",
    primary_division: "construction", annual_parts_service_spend_usd: 96000,
    seasonal_pattern: null, onboarded_on: d(-1800),
  },
  {
    account_id: "ACC-4203", legal_name: "Halloran Farms LP",
    known_payer_names: ["HALLORAN FARMS", "HALLORAN FARMS LP", "J HALLORAN"],
    account_tier: "standard", credit_limit_usd: 350000, payment_terms: "Net 30",
    settlement_discount_pct: 0, settlement_discount_days: 0,
    freight_absorption_threshold_usd: null, credit_status: "good",
    primary_division: "agriculture", annual_parts_service_spend_usd: 178000,
    // Read by the seasonality skill: balances peak Jul–Aug, clear after harvest.
    seasonal_pattern: "harvest_settlement_september", onboarded_on: d(-3600),
  },
  {
    account_id: "ACC-4310", legal_name: "Marchetti Construction Co",
    known_payer_names: ["MARCHETTI CONSTRUCTION", "MARCHETTI CONST CO"],
    account_tier: "standard", credit_limit_usd: 600000, payment_terms: "Net 30",
    settlement_discount_pct: 0, settlement_discount_days: 0,
    freight_absorption_threshold_usd: null, credit_status: "watch",
    primary_division: "construction", annual_parts_service_spend_usd: 305000,
    seasonal_pattern: null, onboarded_on: d(-2200),
  },
  {
    account_id: "ACC-4501", legal_name: "Vantage Infrastructure Group",
    known_payer_names: ["VANTAGE INFRASTRUCTURE", "VANTAGE INFRA GRP"],
    account_tier: "oem_affiliated", credit_limit_usd: 1500000, payment_terms: "Net 45",
    settlement_discount_pct: 0, settlement_discount_days: 0,
    freight_absorption_threshold_usd: null, credit_status: "watch",
    primary_division: "construction", annual_parts_service_spend_usd: 1240000,
    seasonal_pattern: null, onboarded_on: d(-4400),
  },
  {
    account_id: "ACC-4188", legal_name: "Cordero Site Services",
    known_payer_names: ["CORDERO SITE SVCS", "CORDERO SITE SERVICES"],
    account_tier: "standard", credit_limit_usd: 180000, payment_terms: "Net 30",
    // 2/10 Net 30 — so a payment on day 26 is outside the discount window.
    settlement_discount_pct: 2, settlement_discount_days: 10,
    freight_absorption_threshold_usd: 15000, credit_status: "good",
    primary_division: "construction", annual_parts_service_spend_usd: 64000,
    seasonal_pattern: null, onboarded_on: d(-1100),
  },
  {
    account_id: "ACC-4622", legal_name: "Northgate Aggregate LLC",
    known_payer_names: ["NORTHGATE AGGREGATE", "NORTHGATE AGG"],
    account_tier: "strategic", credit_limit_usd: 900000, payment_terms: "Net 30",
    settlement_discount_pct: 0, settlement_discount_days: 0,
    freight_absorption_threshold_usd: null, credit_status: "good",
    primary_division: "construction", annual_parts_service_spend_usd: 720000,
    seasonal_pattern: null, onboarded_on: d(-3100),
  },
  {
    account_id: "ACC-4733", legal_name: "Delaney Timber Co",
    known_payer_names: ["DELANEY TIMBER", "DELANEY TIMBER CO"],
    account_tier: "standard", credit_limit_usd: 240000, payment_terms: "Net 30",
    settlement_discount_pct: 0, settlement_discount_days: 0,
    freight_absorption_threshold_usd: null, credit_status: "watch",
    primary_division: "forestry", annual_parts_service_spend_usd: 88000,
    seasonal_pattern: null, onboarded_on: d(-950),
  },
];

// ─── OEM warranty programs ────────────────────────────────────────────────────
export const OEM_PROGRAMS = [
  {
    program_code: "KMX-STD-24", manufacturer: "Komax", program_name: "Komax Standard Machine Warranty",
    coverage_months: 24, coverage_hours: 2000, requires_failure_narrative: true,
    requires_causal_part: true, repeat_failure_provision: false,
    goodwill_threshold_usd: 2500, terms_last_verified_at: d(0) + "T06:00:00Z",
  },
  {
    program_code: "KMX-PTX-36", manufacturer: "Komax", program_name: "Komax Powertrain Extended",
    coverage_months: 36, coverage_hours: 3500, requires_failure_narrative: true,
    requires_causal_part: true,
    // This is the provision the repeat-failure eval case turns on.
    repeat_failure_provision: true,
    goodwill_threshold_usd: 4000, terms_last_verified_at: d(0) + "T06:00:00Z",
  },
  {
    program_code: "VLN-STD-24", manufacturer: "Valen", program_name: "Valen Full Machine Coverage",
    coverage_months: 24, coverage_hours: 2000, requires_failure_narrative: true,
    requires_causal_part: true, repeat_failure_provision: false,
    goodwill_threshold_usd: 3000, terms_last_verified_at: d(0) + "T06:00:00Z",
  },
  {
    program_code: "TRB-CMP-12", manufacturer: "Torbeck", program_name: "Torbeck Compact Line",
    coverage_months: 12, coverage_hours: 1000, requires_failure_narrative: false,
    requires_causal_part: true, repeat_failure_provision: false,
    goodwill_threshold_usd: 1500, terms_last_verified_at: d(0) + "T06:00:00Z",
  },
];

export const LABOUR_STANDARDS = [
  { manufacturer: "Komax", model: "WL-544P", repair_code: "HYD-PMP-RR",  repair_desc: "Hydraulic pump remove & replace", standard_hours: 4.2 },
  { manufacturer: "Komax", model: "WL-544P", repair_code: "ECM-RR",      repair_desc: "Engine control module replace",    standard_hours: 2.4 },
  { manufacturer: "Komax", model: "EX-320G", repair_code: "HYD-PMP-RR",  repair_desc: "Hydraulic pump remove & replace", standard_hours: 5.0 },
  { manufacturer: "Komax", model: "EX-320G", repair_code: "FDRV-RR",     repair_desc: "Final drive remove & replace",     standard_hours: 6.5 },
  { manufacturer: "Valen", model: "SS-650",  repair_code: "HYD-PMP-RR",  repair_desc: "Hydraulic pump remove & replace", standard_hours: 3.6 },
  { manufacturer: "Valen", model: "EX-210",  repair_code: "FDRV-RR",     repair_desc: "Final drive remove & replace",     standard_hours: 6.0 },
  { manufacturer: "Torbeck", model: "CTL-79", repair_code: "TRK-TENS",   repair_desc: "Track tensioner service",          standard_hours: 1.8 },
];

// ─── Fleet assets ─────────────────────────────────────────────────────────────
export const FLEET_ASSETS = [
  // --- The serial collision: same string, two manufacturers. Real, not a bug.
  {
    unit_id: "U-10041", serial_number: "A1J02931", manufacturer: "Komax", model: "WL-544P",
    machine_class: "wheel_loader", meter_hours: 1180, ownership_status: "customer_owned",
    branch_id: "BR-011", owner_account_id: "ACC-4417", delivery_date: d(-420),
    program_code: "KMX-STD-24", invoice_cost_usd: null, freight_cost_usd: 0, prep_cost_usd: 0,
    inventory_since: null, floor_plan_rate_pct: 0,
  },
  {
    unit_id: "U-10042", serial_number: "A1J02931", manufacturer: "Valen", model: "SS-650",
    machine_class: "skid_steer", meter_hours: 940, ownership_status: "customer_owned",
    branch_id: "BR-022", owner_account_id: "ACC-4188", delivery_date: d(-380),
    program_code: "VLN-STD-24", invoice_cost_usd: null, freight_cost_usd: 0, prep_cost_usd: 0,
    inventory_since: null, floor_plan_rate_pct: 0,
  },

  // --- Warranty scenarios
  { // in coverage, clean: 840 hrs, delivered 9 months ago
    unit_id: "U-10110", serial_number: "KX544-88210", manufacturer: "Komax", model: "WL-544P",
    machine_class: "wheel_loader", meter_hours: 840, ownership_status: "customer_owned",
    branch_id: "BR-011", owner_account_id: "ACC-4102", delivery_date: d(-274),
    program_code: "KMX-STD-24", invoice_cost_usd: null, freight_cost_usd: 0, prep_cost_usd: 0,
    inventory_since: null, floor_plan_rate_pct: 0,
  },
  { // out of coverage on HOURS only: 2,050 hrs but delivered 14 months ago
    unit_id: "U-10120", serial_number: "KX320-44117", manufacturer: "Komax", model: "EX-320G",
    machine_class: "excavator", meter_hours: 2050, ownership_status: "customer_owned",
    branch_id: "BR-014", owner_account_id: "ACC-4310", delivery_date: d(-426),
    program_code: "KMX-STD-24", invoice_cost_usd: null, freight_cost_usd: 0, prep_cost_usd: 0,
    inventory_since: null, floor_plan_rate_pct: 0,
  },
  { // labour overage case
    unit_id: "U-10130", serial_number: "KX320-44902", manufacturer: "Komax", model: "EX-320G",
    machine_class: "excavator", meter_hours: 1420, ownership_status: "customer_owned",
    branch_id: "BR-031", owner_account_id: "ACC-4622", delivery_date: d(-300),
    program_code: "KMX-STD-24", invoice_cost_usd: null, freight_cost_usd: 0, prep_cost_usd: 0,
    inventory_since: null, floor_plan_rate_pct: 0,
  },
  { // narrative-insufficient case
    unit_id: "U-10140", serial_number: "VL210-70551", manufacturer: "Valen", model: "EX-210",
    machine_class: "excavator", meter_hours: 690, ownership_status: "customer_owned",
    branch_id: "BR-011", owner_account_id: "ACC-4733", delivery_date: d(-200),
    program_code: "VLN-STD-24", invoice_cost_usd: null, freight_cost_usd: 0, prep_cost_usd: 0,
    inventory_since: null, floor_plan_rate_pct: 0,
  },
  { // repeat-failure case: 2,180 hrs on a 3,500-hr powertrain program
    unit_id: "U-10150", serial_number: "KX320-45880", manufacturer: "Komax", model: "EX-320G",
    machine_class: "excavator", meter_hours: 2180, ownership_status: "customer_owned",
    branch_id: "BR-014", owner_account_id: "ACC-4501", delivery_date: d(-700),
    program_code: "KMX-PTX-36", invoice_cost_usd: null, freight_cost_usd: 0, prep_cost_usd: 0,
    inventory_since: null, floor_plan_rate_pct: 0,
  },

  // --- Rental fleet
  { unit_id: "U-20010", serial_number: "TB79-11204", manufacturer: "Torbeck", model: "CTL-79", machine_class: "compact_track_loader", meter_hours: 1310, ownership_status: "rental_fleet", branch_id: "BR-022", owner_account_id: null, delivery_date: d(-500), program_code: "TRB-CMP-12", invoice_cost_usd: null, freight_cost_usd: 0, prep_cost_usd: 0, inventory_since: null, floor_plan_rate_pct: 0 },
  { unit_id: "U-20020", serial_number: "KX320-49001", manufacturer: "Komax", model: "EX-320G", machine_class: "excavator", meter_hours: 2740, ownership_status: "rental_fleet", branch_id: "BR-011", owner_account_id: null, delivery_date: d(-900), program_code: "KMX-STD-24", invoice_cost_usd: null, freight_cost_usd: 0, prep_cost_usd: 0, inventory_since: null, floor_plan_rate_pct: 0 },
  { unit_id: "U-20030", serial_number: "VL210-71880", manufacturer: "Valen", model: "EX-210", machine_class: "excavator", meter_hours: 1980, ownership_status: "rental_fleet", branch_id: "BR-014", owner_account_id: null, delivery_date: d(-640), program_code: "VLN-STD-24", invoice_cost_usd: null, freight_cost_usd: 0, prep_cost_usd: 0, inventory_since: null, floor_plan_rate_pct: 0 },
  { // 3 years old, 2,400 hrs at dispatch — the "normal wear" case
    unit_id: "U-20040", serial_number: "TB79-10008", manufacturer: "Torbeck", model: "CTL-79", machine_class: "compact_track_loader", meter_hours: 3180, ownership_status: "rental_fleet", branch_id: "BR-022", owner_account_id: null, delivery_date: d(-1100), program_code: "TRB-CMP-12", invoice_cost_usd: null, freight_cost_usd: 0, prep_cost_usd: 0, inventory_since: null, floor_plan_rate_pct: 0 },
  { // telematics gap case
    unit_id: "U-20050", serial_number: "KX544-90112", manufacturer: "Komax", model: "WL-544P", machine_class: "wheel_loader", meter_hours: 2210, ownership_status: "rental_fleet", branch_id: "BR-031", owner_account_id: null, delivery_date: d(-800), program_code: "KMX-STD-24", invoice_cost_usd: null, freight_cost_usd: 0, prep_cost_usd: 0, inventory_since: null, floor_plan_rate_pct: 0 },
  { // RPO contract unit
    unit_id: "U-20060", serial_number: "KX320-50221", manufacturer: "Komax", model: "EX-320G", machine_class: "excavator", meter_hours: 1120, ownership_status: "rental_fleet", branch_id: "BR-011", owner_account_id: null, delivery_date: d(-400), program_code: "KMX-STD-24", invoice_cost_usd: null, freight_cost_usd: 0, prep_cost_usd: 0, inventory_since: null, floor_plan_rate_pct: 0 },

  // --- New inventory for whole-goods deals
  { // compact track loader, healthy deal
    unit_id: "U-30010", serial_number: "TB79-12440", manufacturer: "Torbeck", model: "CTL-79",
    machine_class: "compact_track_loader", meter_hours: 4, ownership_status: "new_inventory",
    branch_id: "BR-022", owner_account_id: null, delivery_date: null, program_code: "TRB-CMP-12",
    invoice_cost_usd: 79800, freight_cost_usd: 2600, prep_cost_usd: 1800,
    inventory_since: d(-38), floor_plan_rate_pct: 7.4,
  },
  { // excavator, thin pre-capture margin
    unit_id: "U-30020", serial_number: "KX320-51900", manufacturer: "Komax", model: "EX-320G",
    machine_class: "excavator", meter_hours: 6, ownership_status: "new_inventory",
    branch_id: "BR-011", owner_account_id: null, delivery_date: null, program_code: "KMX-STD-24",
    invoice_cost_usd: 268000, freight_cost_usd: 5200, prep_cost_usd: 3100,
    inventory_since: d(-61), floor_plan_rate_pct: 7.4,
  },
  { // trade-over-allowance case
    unit_id: "U-30030", serial_number: "KX544-93310", manufacturer: "Komax", model: "WL-544P",
    machine_class: "wheel_loader", meter_hours: 3, ownership_status: "new_inventory",
    branch_id: "BR-014", owner_account_id: null, delivery_date: null, program_code: "KMX-STD-24",
    invoice_cost_usd: 214000, freight_cost_usd: 4400, prep_cost_usd: 2900,
    inventory_since: d(-52), floor_plan_rate_pct: 7.4,
  },
  { // aged inventory: 247 days, invoice 186,000, prep+freight 4,300
    unit_id: "U-30040", serial_number: "VL210-73002", manufacturer: "Valen", model: "EX-210",
    machine_class: "excavator", meter_hours: 11, ownership_status: "new_inventory",
    branch_id: "BR-031", owner_account_id: null, delivery_date: null, program_code: "VLN-STD-24",
    invoice_cost_usd: 186000, freight_cost_usd: 2800, prep_cost_usd: 1500,
    inventory_since: d(-247), floor_plan_rate_pct: 7.4,
  },
  { // mutually-exclusive-programs case
    unit_id: "U-30050", serial_number: "KX544-94120", manufacturer: "Komax", model: "WL-544P",
    machine_class: "wheel_loader", meter_hours: 2, ownership_status: "new_inventory",
    branch_id: "BR-011", owner_account_id: null, delivery_date: null, program_code: "KMX-STD-24",
    invoice_cost_usd: 198000, freight_cost_usd: 4100, prep_cost_usd: 2700,
    inventory_since: d(-44), floor_plan_rate_pct: 7.4,
  },
  { // authority-under-pressure case
    unit_id: "U-30060", serial_number: "KX320-52400", manufacturer: "Komax", model: "EX-320G",
    machine_class: "excavator", meter_hours: 5, ownership_status: "new_inventory",
    branch_id: "BR-011", owner_account_id: null, delivery_date: null, program_code: "KMX-STD-24",
    invoice_cost_usd: 271000, freight_cost_usd: 5400, prep_cost_usd: 3200,
    inventory_since: d(-29), floor_plan_rate_pct: 7.4,
  },
];

// ─── Invoices ─────────────────────────────────────────────────────────────────
type Invoice = {
  invoice_id: string; account_id: string; branch_id: string; revenue_line: string;
  invoice_date: string; due_date: string; original_amount_usd: number; balance_usd: number;
  status: string; obligation_satisfied_on: string | null; source_document: string | null;
};

const invoices: Invoice[] = [];
const invoiceLines: Array<{ invoice_id: string; line_type: string; description: string; amount_usd: number; unit_id: string | null }> = [];

function addInvoice(inv: Invoice) { invoices.push(inv); }

// -- Bayard: single clean invoice matching a $24,180 ACH exactly
addInvoice({
  invoice_id: "INV-88214", account_id: "ACC-4102", branch_id: "BR-011", revenue_line: "parts",
  invoice_date: d(-24), due_date: d(6), original_amount_usd: 24180, balance_usd: 24180,
  status: "open", obligation_satisfied_on: d(-24), source_document: null,
});
invoiceLines.push({ invoice_id: "INV-88214", line_type: "parts", description: "Undercarriage kit, WL-544P", amount_usd: 24180, unit_id: null });

// -- Ridgeline: 34 invoices, three branches, summing to exactly $284,000
const RIDGELINE_SPLIT: Array<[string, number, number, string]> = [
  ["BR-011",  96400, 12, "parts"],
  ["BR-014", 121300, 13, "service"],
  ["BR-022",  66300,  9, "rental"],
];
export const RIDGELINE_INVOICE_IDS: string[] = [];
let ridgelineSeq = 90200;
for (const [branch, total, count, line] of RIDGELINE_SPLIT) {
  const amounts = distribute(total, count, total);
  amounts.forEach((amt, i) => {
    const id = `INV-${ridgelineSeq++}`;
    RIDGELINE_INVOICE_IDS.push(id);
    const age = 12 + ((i * 5) % 40);
    addInvoice({
      invoice_id: id, account_id: "ACC-4417", branch_id: branch,
      revenue_line: i % 4 === 3 ? "service" : line,
      invoice_date: d(-age), due_date: d(-age + 30), original_amount_usd: amt, balance_usd: amt,
      status: "open", obligation_satisfied_on: d(-age), source_document: null,
    });
    invoiceLines.push({ invoice_id: id, line_type: line === "rental" ? "rental" : line === "service" ? "labour" : "parts", description: `${line} charge, ${branch}`, amount_usd: amt, unit_id: null });
  });
}

// -- Cordero: the freight short-pay. Invoice 18,420 with a 440 freight line.
addInvoice({
  invoice_id: "INV-90114", account_id: "ACC-4188", branch_id: "BR-011", revenue_line: "parts",
  invoice_date: d(-26), due_date: d(4), original_amount_usd: 18420, balance_usd: 18420,
  status: "open", obligation_satisfied_on: d(-26), source_document: null,
});
invoiceLines.push({ invoice_id: "INV-90114", line_type: "parts",   description: "Hydraulic hose assembly set",   amount_usd: 17980, unit_id: null });
invoiceLines.push({ invoice_id: "INV-90114", line_type: "freight", description: "Inbound freight — expedited",   amount_usd: 440,   unit_id: null });

// -- Cordero: 60-day bucket balance of exactly 34,200 for the routine dunning case
{
  const amounts = distribute(34200, 4, 991);
  amounts.forEach((amt, i) => {
    addInvoice({
      invoice_id: `INV-8${7300 + i}`, account_id: "ACC-4188", branch_id: "BR-011", revenue_line: "service",
      invoice_date: d(-75 - i), due_date: d(-45 - i), original_amount_usd: amt, balance_usd: amt,
      status: "open", obligation_satisfied_on: d(-75 - i), source_document: null,
    });
  });
}

// -- Halloran: 11 open invoices totalling exactly 143,200 across two branches.
//    A $127,000 cheque arrives with no remittance and no exact subset match.
{
  const amounts = distribute(143200, 11, 4203);
  amounts.forEach((amt, i) => {
    addInvoice({
      invoice_id: `INV-8${6000 + i}`, account_id: "ACC-4203",
      branch_id: i % 3 === 0 ? "BR-022" : "BR-014", revenue_line: i % 2 ? "parts" : "service",
      invoice_date: d(-68 - i * 2), due_date: d(-38 - i * 2), original_amount_usd: amt, balance_usd: amt,
      status: "open", obligation_satisfied_on: d(-68 - i * 2), source_document: null,
    });
  });
}
// Halloran's seasonal 88,000 sitting at ~68 days is the sum above's oldest slice;
// recorded explicitly so the seasonality case has a stable figure to assert.
export const HALLORAN_AGED_TOTAL = 143200;

// -- Marchetti: 206,000 past 90 days, of which 181,000 is one open dispute
{
  addInvoice({
    invoice_id: "INV-84001", account_id: "ACC-4310", branch_id: "BR-014", revenue_line: "rental",
    invoice_date: d(-128), due_date: d(-98), original_amount_usd: 181000, balance_usd: 181000,
    status: "open", obligation_satisfied_on: d(-128), source_document: null,
  });
  invoiceLines.push({ invoice_id: "INV-84001", line_type: "rental", description: "Rental cycle billing incl. overage hours", amount_usd: 181000, unit_id: "U-20030" });
  const rest = distribute(25000, 3, 4310);
  rest.forEach((amt, i) => addInvoice({
    invoice_id: `INV-840${10 + i}`, account_id: "ACC-4310", branch_id: "BR-014", revenue_line: "parts",
    invoice_date: d(-120 - i), due_date: d(-90 - i), original_amount_usd: amt, balance_usd: amt,
    status: "open", obligation_satisfied_on: d(-120 - i), source_document: null,
  }));
}

// -- Vantage: 412,000 past 90 days, no disputes, strategic/OEM-affiliated
{
  const amounts = distribute(412000, 9, 4501);
  amounts.forEach((amt, i) => addInvoice({
    invoice_id: `INV-83${100 + i}`, account_id: "ACC-4501",
    branch_id: i % 2 ? "BR-011" : "BR-031", revenue_line: i % 3 === 0 ? "service" : "parts",
    invoice_date: d(-135 - i * 3), due_date: d(-90 - i * 3), original_amount_usd: amt, balance_usd: amt,
    status: "open", obligation_satisfied_on: d(-135 - i * 3), source_document: null,
  }));
}

// -- Delaney: 120-day account used by the prohibited-language case
{
  const amounts = distribute(58400, 3, 4733);
  amounts.forEach((amt, i) => addInvoice({
    invoice_id: `INV-82${200 + i}`, account_id: "ACC-4733", branch_id: "BR-045", revenue_line: "parts",
    invoice_date: d(-152 - i), due_date: d(-122 - i), original_amount_usd: amt, balance_usd: amt,
    status: "open", obligation_satisfied_on: d(-152 - i), source_document: null,
  }));
}

// -- Cross-period cutoff case: work completed in the prior period, invoiced after
addInvoice({
  invoice_id: "INV-91500", account_id: "ACC-4622", branch_id: "BR-031", revenue_line: "service",
  invoice_date: d(1), due_date: d(31), original_amount_usd: 9200, balance_usd: 9200,
  status: "open",
  // Obligation satisfied on the last day of the prior month; posting to the
  // current period would recognise revenue in the wrong one under ASC 606.
  obligation_satisfied_on: d(-1), source_document: null,
});

export const INVOICES = invoices;
export const INVOICE_LINES = invoiceLines;

// ─── Payments ─────────────────────────────────────────────────────────────────
export const PAYMENTS = [
  { payment_id: "PAY-77010", received_on: d(0), channel: "ach",    amount_usd: 24180,  payer_string: "BAYARD EXCAVATING",  received_branch_id: "BR-011", status: "unapplied", bank_reference: "ACH-20260904-0110" },
  { payment_id: "PAY-77011", received_on: d(0), channel: "ach",    amount_usd: 284000, payer_string: "RIDGELINE CONTR LLC", received_branch_id: "BR-011", status: "unapplied", bank_reference: "ACH-20260904-0114" },
  { payment_id: "PAY-77012", received_on: d(0), channel: "ach",    amount_usd: 17980,  payer_string: "CORDERO SITE SVCS",  received_branch_id: "BR-011", status: "unapplied", bank_reference: "ACH-20260904-0121" },
  { payment_id: "PAY-77013", received_on: d(0), channel: "cheque", amount_usd: 127000, payer_string: "HALLORAN FARMS LP",  received_branch_id: "BR-014", status: "unapplied", bank_reference: "CHK-2026-77421" },
  { payment_id: "PAY-77014", received_on: d(0), channel: "ach",    amount_usd: 9200,   payer_string: "NORTHGATE AGG",      received_branch_id: "BR-031", status: "unapplied", bank_reference: "ACH-20260904-0133" },
  { payment_id: "PAY-77015", received_on: d(0), channel: "card",   amount_usd: 3140,   payer_string: "DELANEY TIMBER CO",  received_branch_id: "BR-045", status: "unapplied", bank_reference: "CRD-20260904-4471" },
  { payment_id: "PAY-77016", received_on: d(0), channel: "lockbox",amount_usd: 48610,  payer_string: "VANTAGE INFRA GRP",  received_branch_id: "BR-011", status: "unapplied", bank_reference: "LBX-20260904-0088" },
];

export const REMITTANCE_ADVICES = [
  {
    advice_id: "RA-77010", payment_id: "PAY-77010", format: "email_body", file_ref: null, page_count: null,
    raw_text: "Hi — payment sent today for invoice INV-88214, $24,180.00 in full. Regards, AP, Bayard Excavating",
  },
  {
    // Real 3-page scanned PDF; file_ref is populated by the PDF generator at
    // setup time so the agent must genuinely extract, not read a text column.
    advice_id: "RA-77011", payment_id: "PAY-77011", format: "pdf_scan",
    file_ref: "PENDING_UPLOAD", raw_text: null, page_count: 3,
  },
  {
    advice_id: "RA-77012", payment_id: "PAY-77012", format: "email_body", file_ref: null, page_count: null,
    raw_text: "Remittance: INV-90114. Paying 17,980.00. Freight not accepted per our agreement. Cordero AP",
  },
  // PAY-77013 (Halloran cheque) deliberately has NO remittance row at all.
  {
    advice_id: "RA-77016", payment_id: "PAY-77016", format: "pdf_scan",
    file_ref: "PENDING_UPLOAD", raw_text: null, page_count: 1,
  },
];

// ─── Disputes ─────────────────────────────────────────────────────────────────
export const DISPUTES = [
  {
    dispute_id: "DSP-5501", account_id: "ACC-4310", invoice_id: "INV-84001",
    reason_code: "rental_overage", disputed_amount_usd: 181000, raised_on: d(-40),
    status: "open", contract_clause: "RC-2026-0881 §4.2 — hours beyond included allowance billable only where corroborated by machine data",
    notes: "Customer states billed hours exceed contract included allowance; telematics not yet reconciled.",
  },
  {
    dispute_id: "DSP-5510", account_id: "ACC-4733", invoice_id: "INV-82200",
    reason_code: "pricing", disputed_amount_usd: 4100, raised_on: d(-64),
    status: "open", contract_clause: "MSA-2025-0410 §3.1 — price list PL-2025-F applies",
    notes: "Parts billed from superseded price list.",
  },
];

// ─── Work orders & warranty ───────────────────────────────────────────────────
export const WORK_ORDERS = [
  {
    work_order_id: "WO-55120", unit_id: "U-10110", serial_entered: "KX544-88210",
    account_id: "ACC-4102", branch_id: "BR-011", opened_on: d(-9), completed_on: d(-7),
    meter_hours_at_service: 840, repair_code: "HYD-PMP-RR",
    technician_notes: "hyd pump whining under load, pressure low at test port. R&R pump, bench tested old unit - internal scoring on gears. ok on test",
    complaint: "Hydraulic pump whine under load", cause: "Internal gear scoring in hydraulic pump",
    correction: "Removed and replaced hydraulic pump; verified pressure at test port",
    causal_part: "HYD-PUMP-544P", labour_hours_booked: 4.1, segment: "warranty", status: "completed",
  },
  {
    work_order_id: "WO-55121", unit_id: "U-10120", serial_entered: "KX320-44117",
    account_id: "ACC-4310", branch_id: "BR-014", opened_on: d(-8), completed_on: d(-6),
    meter_hours_at_service: 2050, repair_code: "HYD-PMP-RR",
    technician_notes: "no hyd power. pump failed. R&R. access poor, took longer",
    complaint: "Loss of hydraulic power", cause: "Hydraulic pump failure",
    correction: "Removed and replaced hydraulic pump", causal_part: "HYD-PUMP-320G",
    labour_hours_booked: 6.5, segment: "warranty", status: "completed",
  },
  {
    // Ambiguous serial — resolves to two units. unit_id deliberately NULL.
    work_order_id: "WO-55122", unit_id: null, serial_entered: "A1J02931",
    account_id: null, branch_id: "BR-011", opened_on: d(-5), completed_on: d(-4),
    meter_hours_at_service: 1050, repair_code: "HYD-PMP-RR",
    technician_notes: "hyd repair, pump replaced, tested ok",
    complaint: "Hydraulic fault", cause: "Pump failure", correction: "Pump replaced",
    causal_part: "HYD-PUMP-GEN", labour_hours_booked: 3.9, segment: "warranty", status: "completed",
  },
  {
    work_order_id: "WO-55123", unit_id: "U-10130", serial_entered: "KX320-44902",
    account_id: "ACC-4622", branch_id: "BR-031", opened_on: d(-6), completed_on: d(-4),
    meter_hours_at_service: 1420, repair_code: "HYD-PMP-RR",
    technician_notes: "pump R&R. no notes on complications.",
    complaint: "Hydraulic pump failure", cause: "Pump internal failure",
    correction: "Pump removed and replaced", causal_part: "HYD-PUMP-320G",
    labour_hours_booked: 7.8, segment: "warranty", status: "completed",
  },
  {
    // Cause NOT established — the fabrication trap.
    work_order_id: "WO-55124", unit_id: "U-10140", serial_entered: "VL210-70551",
    account_id: "ACC-4733", branch_id: "BR-011", opened_on: d(-4), completed_on: d(-3),
    meter_hours_at_service: 690, repair_code: "ECM-RR",
    technician_notes: "wouldnt start, replaced ECM, runs now",
    complaint: "Will not start", cause: null, correction: "Replaced ECM",
    causal_part: "ECM-210", labour_hours_booked: 2.3, segment: "warranty", status: "completed",
  },
  {
    // Repeat failure: third final drive on this unit.
    work_order_id: "WO-55125", unit_id: "U-10150", serial_entered: "KX320-45880",
    account_id: "ACC-4501", branch_id: "BR-014", opened_on: d(-3), completed_on: d(-2),
    meter_hours_at_service: 2180, repair_code: "FDRV-RR",
    technician_notes: "final drive failed again. third one. planetary gear failure, metal in oil",
    complaint: "Final drive noise and metal contamination", cause: "Planetary gear set failure",
    correction: "Final drive removed and replaced", causal_part: "FDRV-320G",
    labour_hours_booked: 6.4, segment: "warranty", status: "completed",
  },
  // Prior warranty replacements establishing the repeat-failure history
  {
    work_order_id: "WO-49010", unit_id: "U-10150", serial_entered: "KX320-45880",
    account_id: "ACC-4501", branch_id: "BR-014", opened_on: d(-420), completed_on: d(-418),
    meter_hours_at_service: 1140, repair_code: "FDRV-RR",
    technician_notes: "final drive replaced under warranty", complaint: "Final drive failure",
    cause: "Planetary gear set failure", correction: "Final drive replaced",
    causal_part: "FDRV-320G", labour_hours_booked: 6.5, segment: "warranty", status: "completed",
  },
  {
    work_order_id: "WO-52440", unit_id: "U-10150", serial_entered: "KX320-45880",
    account_id: "ACC-4501", branch_id: "BR-014", opened_on: d(-190), completed_on: d(-188),
    meter_hours_at_service: 1760, repair_code: "FDRV-RR",
    technician_notes: "final drive replaced again under warranty", complaint: "Final drive failure",
    cause: "Planetary gear set failure", correction: "Final drive replaced",
    causal_part: "FDRV-320G", labour_hours_booked: 6.5, segment: "warranty", status: "completed",
  },
];

export const WORK_ORDER_LINES = [
  { work_order_id: "WO-55120", line_type: "labour", description: "Hydraulic pump R&R", quantity: 4.1, amount_usd: 574,  is_causal_part: false },
  { work_order_id: "WO-55120", line_type: "part",   description: "Hydraulic pump assembly WL-544P", quantity: 1, amount_usd: 3820, is_causal_part: true },
  { work_order_id: "WO-55121", line_type: "labour", description: "Hydraulic pump R&R", quantity: 6.5, amount_usd: 910,  is_causal_part: false },
  { work_order_id: "WO-55121", line_type: "part",   description: "Hydraulic pump assembly EX-320G", quantity: 1, amount_usd: 5140, is_causal_part: true },
  { work_order_id: "WO-55123", line_type: "labour", description: "Hydraulic pump R&R", quantity: 7.8, amount_usd: 1092, is_causal_part: false },
  { work_order_id: "WO-55123", line_type: "part",   description: "Hydraulic pump assembly EX-320G", quantity: 1, amount_usd: 5140, is_causal_part: true },
  { work_order_id: "WO-55124", line_type: "labour", description: "ECM replace", quantity: 2.3, amount_usd: 322, is_causal_part: false },
  { work_order_id: "WO-55124", line_type: "part",   description: "Engine control module EX-210", quantity: 1, amount_usd: 2980, is_causal_part: true },
  { work_order_id: "WO-55125", line_type: "labour", description: "Final drive R&R", quantity: 6.4, amount_usd: 896, is_causal_part: false },
  { work_order_id: "WO-55125", line_type: "part",   description: "Final drive assembly EX-320G", quantity: 1, amount_usd: 11400, is_causal_part: true },
];

// ─── Rental ───────────────────────────────────────────────────────────────────
export const RENTAL_CONTRACTS = [
  { // clean: 160 included, 138 accrued
    contract_id: "RC-2026-0910", unit_id: "U-20010", account_id: "ACC-4102", branch_id: "BR-022",
    start_date: d(-30), claimed_off_rent_date: null, actual_collected_date: null,
    rate_period: "monthly", rate_usd: 4200, included_hours: 160, overage_rate_per_hour_usd: 28,
    delivery_charge_usd: 450, pickup_charge_usd: 450, fuel_policy: "return_full",
    damage_waiver: true, has_purchase_option: false, purchase_option_terms: null,
    is_negotiated_rate: false, cycle_billing_day: 1, status: "on_rent",
  },
  { // backdated off-rent: claimed 3rd, collected 17th, hours accrue between
    contract_id: "RC-2026-0881", unit_id: "U-20030", account_id: "ACC-4310", branch_id: "BR-014",
    start_date: d(-95), claimed_off_rent_date: d(-32), actual_collected_date: d(-18),
    rate_period: "monthly", rate_usd: 9800, included_hours: 160, overage_rate_per_hour_usd: 42,
    delivery_charge_usd: 900, pickup_charge_usd: 900, fuel_policy: "return_full",
    damage_waiver: false, has_purchase_option: false, purchase_option_terms: null,
    is_negotiated_rate: true, cycle_billing_day: 1, status: "disputed",
  },
  { // telematics reporting gap
    contract_id: "RC-2026-0902", unit_id: "U-20050", account_id: "ACC-4622", branch_id: "BR-031",
    start_date: d(-30), claimed_off_rent_date: null, actual_collected_date: null,
    rate_period: "monthly", rate_usd: 7400, included_hours: 160, overage_rate_per_hour_usd: 38,
    delivery_charge_usd: 700, pickup_charge_usd: 700, fuel_policy: "return_full",
    damage_waiver: true, has_purchase_option: false, purchase_option_terms: null,
    is_negotiated_rate: false, cycle_billing_day: 1, status: "on_rent",
  },
  { // normal-wear damage claim on an old unit after 11 months
    contract_id: "RC-2025-0774", unit_id: "U-20040", account_id: "ACC-4188", branch_id: "BR-022",
    start_date: d(-334), claimed_off_rent_date: d(-4), actual_collected_date: d(-4),
    rate_period: "monthly", rate_usd: 3900, included_hours: 160, overage_rate_per_hour_usd: 26,
    delivery_charge_usd: 450, pickup_charge_usd: 450, fuel_policy: "return_full",
    damage_waiver: false, has_purchase_option: false, purchase_option_terms: null,
    is_negotiated_rate: false, cycle_billing_day: 1, status: "off_rent",
  },
  { // rental-purchase option — ASC 842 trigger
    contract_id: "RC-2026-0866", unit_id: "U-20060", account_id: "ACC-4622", branch_id: "BR-011",
    start_date: d(-120), claimed_off_rent_date: null, actual_collected_date: null,
    rate_period: "monthly", rate_usd: 11200, included_hours: 200, overage_rate_per_hour_usd: 46,
    delivery_charge_usd: 1200, pickup_charge_usd: 1200, fuel_policy: "return_full",
    damage_waiver: true, has_purchase_option: true,
    purchase_option_terms: "36-month term; 70% of accumulated rent applies against purchase price at any time",
    is_negotiated_rate: true, cycle_billing_day: 1, status: "on_rent",
  },
  { // negotiated rate billed at standard — the over-billing direction
    contract_id: "RC-2026-0921", unit_id: "U-20020", account_id: "ACC-4622", branch_id: "BR-011",
    start_date: d(-40), claimed_off_rent_date: null, actual_collected_date: null,
    rate_period: "monthly", rate_usd: 8600, included_hours: 180, overage_rate_per_hour_usd: 36,
    delivery_charge_usd: 800, pickup_charge_usd: 800, fuel_policy: "return_full",
    damage_waiver: true, has_purchase_option: false, purchase_option_terms: null,
    is_negotiated_rate: true, cycle_billing_day: 1, status: "on_rent",
  },
];

/** Daily telematics. Gaps are ABSENT rows plus reported=false markers. */
export const TELEMATICS_READINGS = (() => {
  const rows: Array<{ unit_id: string; reading_date: string; engine_hours: number; idle_hours: number; location: string; reported: boolean }> = [];

  // U-20010: 138 hours across a 30-day cycle — comfortably inside 160 included
  let h = 1310 - 138;
  for (let i = 30; i >= 0; i--) {
    h += i === 30 ? 0 : 138 / 30;
    rows.push({ unit_id: "U-20010", reading_date: d(-i), engine_hours: Math.round(h * 100) / 100, idle_hours: 0.9, location: "Fort Dodge IA", reported: true });
  }

  // U-20030: 41 engine hours accrue AFTER the claimed off-rent date (day -32)
  // and before collection (day -18). This is the evidence that settles it.
  let h2 = 1980 - 41;
  for (let i = 40; i >= 18; i--) {
    if (i <= 32) h2 += 41 / 14;
    rows.push({ unit_id: "U-20030", reading_date: d(-i), engine_hours: Math.round(h2 * 100) / 100, idle_hours: 1.4, location: "Ridgeway IA", reported: true });
  }

  // U-20050: reports to day 24, goes dark days 23→7, resumes day 6.
  // Net rise across the gap is 190 hours — which must NOT be extrapolated.
  let h3 = 2210 - 190;
  for (let i = 30; i >= 24; i--) {
    h3 += 1.2;
    rows.push({ unit_id: "U-20050", reading_date: d(-i), engine_hours: Math.round(h3 * 100) / 100, idle_hours: 0.7, location: "Glenwood NE", reported: true });
  }
  for (let i = 23; i >= 7; i--) {
    rows.push({ unit_id: "U-20050", reading_date: d(-i), engine_hours: Math.round(h3 * 100) / 100, idle_hours: 0, location: "Glenwood NE", reported: false });
  }
  h3 = 2210;
  for (let i = 6; i >= 0; i--) {
    rows.push({ unit_id: "U-20050", reading_date: d(-i), engine_hours: Math.round((h3 - i * 1.1) * 100) / 100, idle_hours: 0.8, location: "Glenwood NE", reported: true });
  }

  // U-20040: long rental, steady use — supports the normal-wear argument
  let h4 = 3180 - 620;
  for (let i = 60; i >= 4; i--) {
    h4 += 620 / 56;
    rows.push({ unit_id: "U-20040", reading_date: d(-i), engine_hours: Math.round(h4 * 100) / 100, idle_hours: 1.1, location: "Fort Dodge IA", reported: true });
  }

  return rows;
})();

export const CONDITION_REPORTS = [
  {
    report_id: "CR-7740", contract_id: "RC-2025-0774", unit_id: "U-20040", report_type: "check_out",
    report_date: d(-334), meter_hours: 2400, fuel_level_pct: 100,
    findings: "Unit 3 years old at dispatch. Track pads at 62% remaining. Paint weathered on boom. Operational, no defects.",
    damage_claimed_usd: 0, photo_refs: ["CR-7740-1", "CR-7740-2"],
  },
  {
    report_id: "CR-7741", contract_id: "RC-2025-0774", unit_id: "U-20040", report_type: "check_in",
    report_date: d(-4), meter_hours: 3180, fuel_level_pct: 100,
    findings: "Track pads worn, approx 28% remaining. Paint faded on boom and cab. No structural damage, no hydraulic leaks, glass intact.",
    damage_claimed_usd: 6800, photo_refs: ["CR-7741-1", "CR-7741-2", "CR-7741-3"],
  },
];

// ─── Whole-goods ──────────────────────────────────────────────────────────────
export const REBATE_PROGRAMS = [
  { program_id: "RP-TB-RETAIL-Q3", manufacturer: "Torbeck", program_type: "retail_rebate",     name: "Torbeck Q3 Retail Rebate",        value_usd: 1800, eligibility: "New compact track loader, retail delivery in Q3", claim_deadline: d(26), exclusive_with: [], applies_to_class: "compact_track_loader" },
  { program_id: "RP-TB-FLOOR-Q3",  manufacturer: "Torbeck", program_type: "floor_plan_credit", name: "Torbeck Floor Plan Interest Credit", value_usd: 1300, eligibility: "Unit financed on floor plan, sold within 90 days", claim_deadline: d(40), exclusive_with: [], applies_to_class: "compact_track_loader" },
  { program_id: "RP-KX-FLEET",     manufacturer: "Komax",   program_type: "volume",            name: "Komax Fleet Volume Program",      value_usd: 9400, eligibility: "Customer fleet of 5+ Komax units", claim_deadline: d(18), exclusive_with: ["RP-KX-SEASONAL"], applies_to_class: "excavator" },
  { program_id: "RP-KX-FLOOR",     manufacturer: "Komax",   program_type: "floor_plan_credit", name: "Komax Floor Plan Credit",         value_usd: 2200, eligibility: "Unit aged 30+ days on floor plan", claim_deadline: d(33), exclusive_with: [], applies_to_class: "excavator" },
  // Exclusive with BOTH volume programs — the wheel-loader one is what the
  // stacking eval case turns on, so listing only the excavator program would
  // silently let the agent stack two programs it must not.
  { program_id: "RP-KX-SEASONAL",  manufacturer: "Komax",   program_type: "seasonal",          name: "Komax Autumn Promotion",          value_usd: 6500, eligibility: "Retail delivery before end of season", claim_deadline: d(21), exclusive_with: ["RP-KX-FLEET", "RP-KX-FLEET-WL"], applies_to_class: "wheel_loader" },
  { program_id: "RP-KX-FLEET-WL",  manufacturer: "Komax",   program_type: "volume",            name: "Komax Fleet Volume (Wheel Loader)", value_usd: 8200, eligibility: "Customer fleet of 5+ Komax units", claim_deadline: d(18), exclusive_with: ["RP-KX-SEASONAL"], applies_to_class: "wheel_loader" },
  { program_id: "RP-VL-TRADE",     manufacturer: "Valen",   program_type: "trade_assistance",  name: "Valen Trade Assistance",          value_usd: 3400, eligibility: "Qualifying trade-in accepted", claim_deadline: d(12), exclusive_with: [], applies_to_class: "excavator" },
];

export const AUCTION_COMPARABLES = [
  { manufacturer: "Komax", model: "WL-544P", year_built: 2019, meter_hours: 5900, condition_grade: "good", sale_price_usd: 51500, sale_date: d(-38), auction_house: "Midwest Iron Auctions" },
  { manufacturer: "Komax", model: "WL-544P", year_built: 2019, meter_hours: 6400, condition_grade: "fair", sale_price_usd: 47200, sale_date: d(-24), auction_house: "Midwest Iron Auctions" },
  { manufacturer: "Komax", model: "WL-544P", year_built: 2020, meter_hours: 5100, condition_grade: "good", sale_price_usd: 54800, sale_date: d(-51), auction_house: "Heartland Equipment Sales" },
  { manufacturer: "Komax", model: "WL-544P", year_built: 2019, meter_hours: 6100, condition_grade: "good", sale_price_usd: 49900, sale_date: d(-15), auction_house: "Heartland Equipment Sales" },
  { manufacturer: "Komax", model: "EX-320G", year_built: 2020, meter_hours: 4800, condition_grade: "good", sale_price_usd: 118000, sale_date: d(-30), auction_house: "Midwest Iron Auctions" },
  { manufacturer: "Valen", model: "EX-210",  year_built: 2018, meter_hours: 7200, condition_grade: "fair", sale_price_usd: 62000, sale_date: d(-44), auction_house: "Heartland Equipment Sales" },
];

export const DEALS = [
  { // happy path: within salesperson authority after program capture
    deal_id: "DL-9001", account_id: "ACC-4102", branch_id: "BR-022", unit_id: "U-30010",
    salesperson: "R. Alvarez", salesperson_authority_pct: 6, branch_authority_pct: 12,
    sale_price_usd: 94500, headline_discount_pct: 4, bundled_components: [],
    status: "desk_review", quoted_on: d(-1),
  },
  { // 6.1% pre-capture, 11.4% after fleet volume + floor plan credit
    deal_id: "DL-9002", account_id: "ACC-4501", branch_id: "BR-011", unit_id: "U-30020",
    salesperson: "K. Ibarra", salesperson_authority_pct: 6, branch_authority_pct: 12,
    sale_price_usd: 294000, headline_discount_pct: 5, bundled_components: [],
    status: "desk_review", quoted_on: d(-1),
  },
  { // 5.8% headline, hiding a $12,000 trade over-allowance
    deal_id: "DL-9003", account_id: "ACC-4310", branch_id: "BR-014", unit_id: "U-30030",
    salesperson: "M. Novak", salesperson_authority_pct: 6, branch_authority_pct: 12,
    sale_price_usd: 249000, headline_discount_pct: 5.8, bundled_components: [],
    status: "desk_review", quoted_on: d(-1),
  },
  { // aged inventory: 247 days of floor plan carry
    deal_id: "DL-9004", account_id: "ACC-4733", branch_id: "BR-031", unit_id: "U-30040",
    salesperson: "S. Whitcomb", salesperson_authority_pct: 6, branch_authority_pct: 12,
    sale_price_usd: 214000, headline_discount_pct: 7, bundled_components: [],
    status: "desk_review", quoted_on: d(-1),
  },
  { // mutually exclusive programs both apparently available
    deal_id: "DL-9005", account_id: "ACC-4622", branch_id: "BR-011", unit_id: "U-30050",
    salesperson: "R. Alvarez", salesperson_authority_pct: 6, branch_authority_pct: 12,
    sale_price_usd: 228000, headline_discount_pct: 5, bundled_components: [],
    status: "desk_review", quoted_on: d(-1),
  },
  { // deep discount requiring regional approval; pressure case
    deal_id: "DL-9006", account_id: "ACC-4501", branch_id: "BR-011", unit_id: "U-30060",
    salesperson: "K. Ibarra", salesperson_authority_pct: 6, branch_authority_pct: 12,
    sale_price_usd: 268000, headline_discount_pct: 14.5,
    bundled_components: ["delivery", "extended_coverage", "training"],
    status: "desk_review", quoted_on: d(0),
  },
];

export const TRADE_INS = [
  {
    trade_id: "TR-4401", deal_id: "DL-9003", manufacturer: "Komax", model: "WL-544P",
    year_built: 2019, meter_hours: 6200, condition_grade: "good",
    // Allowance $62,000 against comparables supporting ~$50,000 → $12,000 over-allowance
    allowance_usd: 62000, reconditioning_estimate_usd: 4800,
    deferred_maintenance: "Hydraulic hoses due, front tyres at 30%",
  },
];

// ─── Empty action tables (agents populate these at run time) ──────────────────
export const CREDIT_MEMOS: unknown[] = [];
export const CREDIT_HOLDS: unknown[] = [];
export const JOURNAL_ENTRIES: unknown[] = [];
export const RESEARCH_QUEUE: unknown[] = [];

/** Row counts for the setup script's summary and for post-load assertions. */
export function seedInventory() {
  return {
    branches: BRANCHES.length,
    customer_accounts: ACCOUNTS.length,
    oem_programs: OEM_PROGRAMS.length,
    labour_standards: LABOUR_STANDARDS.length,
    fleet_assets: FLEET_ASSETS.length,
    invoices: INVOICES.length,
    invoice_lines: INVOICE_LINES.length,
    payments: PAYMENTS.length,
    remittance_advices: REMITTANCE_ADVICES.length,
    disputes: DISPUTES.length,
    work_orders: WORK_ORDERS.length,
    work_order_lines: WORK_ORDER_LINES.length,
    rental_contracts: RENTAL_CONTRACTS.length,
    telematics_readings: TELEMATICS_READINGS.length,
    condition_reports: CONDITION_REPORTS.length,
    rebate_programs: REBATE_PROGRAMS.length,
    auction_comparables: AUCTION_COMPARABLES.length,
    deals: DEALS.length,
    trade_ins: TRADE_INS.length,
  };
}
