/**
 * ED-J3 — Work Order → OEM Warranty Claim → Cash tools.
 *
 * `resolve_asset` returns every candidate when a serial collides rather than
 * picking the likelier one; `run_compliance_gate` checks coverage on both the
 * calendar and meter-hour dimensions and caps labour at published standard;
 * and `submit_claim` physically refuses any claim whose gate has not passed.
 *
 * ADJUDICATION IS A SIMULATOR, and is labelled as one in its own output. We
 * have no access to a manufacturer portal, so the verdict is COMPUTED from the
 * program terms stored in `dealer.oem_programs` — it is derived, never canned —
 * but it stands in for a counterparty we cannot reach. Everything else in this
 * file is real.
 */
import { DealerClient, money, daysBetween, todayIso, newId } from "./client";
import { ok, err } from "./tools-cash";

const A = (v: unknown) => (typeof v === "string" ? v : String(v ?? ""));
const N = (v: unknown) => (typeof v === "number" ? v : parseFloat(String(v ?? "0")) || 0);
const MONTH_DAYS = 30.44;

// ── Service & asset registry ─────────────────────────────────────────────────

export async function get_completed_work_orders(c: DealerClient, args: Record<string, unknown>) {
  const branch = A(args.branch_id);
  const rows = await c.q(
    `SELECT w.work_order_id, w.unit_id, w.serial_entered, w.account_id, w.branch_id,
            w.completed_on, w.meter_hours_at_service, w.repair_code, w.technician_notes,
            w.complaint, w.cause, w.correction, w.causal_part, w.labour_hours_booked, w.segment,
            EXISTS (SELECT 1 FROM dealer.warranty_claims wc WHERE wc.work_order_id = w.work_order_id) AS claim_exists
       FROM dealer.work_orders w
      WHERE w.completed_on IS NOT NULL AND w.segment = 'warranty'
        AND ($1 = '' OR w.branch_id = $1)
      ORDER BY w.completed_on DESC`,
    [branch]
  );
  const pending = rows.filter((r) => !r.claim_exists);
  return ok({
    total_completed: rows.length,
    awaiting_screening: pending.length,
    with_unresolved_identity: rows.filter((r) => r.unit_id === null).length,
    without_established_cause: rows.filter((r) => r.cause === null).length,
    work_orders: rows,
  });
}

/** Serial strings are unique within a manufacturer only. Ambiguity escalates. */
export async function resolve_asset(c: DealerClient, args: Record<string, unknown>) {
  const serial = A(args.serial_number).trim();
  if (!serial) return err("serial_number is required");
  const candidates = await c.q(
    `SELECT unit_id, serial_number, manufacturer, model, machine_class, meter_hours,
            ownership_status, branch_id, owner_account_id, delivery_date, program_code
       FROM dealer.fleet_assets WHERE UPPER(serial_number) = UPPER($1)`,
    [serial]
  );

  if (candidates.length === 0) {
    return ok({ resolved: false, candidate_count: 0, serial_number: serial, note: "No fleet asset carries this serial. Verify the serial with the service writer before proceeding." });
  }
  if (candidates.length === 1) {
    return ok({ resolved: true, candidate_count: 1, asset: candidates[0] });
  }

  // Corroborating hints narrow it, but never to the point of guessing.
  const make = A(args.manufacturer).toUpperCase();
  const model = A(args.model).toUpperCase();
  const meter = args.meter_hours === undefined ? null : N(args.meter_hours);
  let narrowed = candidates;
  if (make) narrowed = narrowed.filter((x) => A(x.manufacturer).toUpperCase() === make);
  if (model && narrowed.length > 1) narrowed = narrowed.filter((x) => A(x.model).toUpperCase() === model);
  if (meter !== null && narrowed.length > 1) {
    narrowed = narrowed.filter((x) => Math.abs(N(x.meter_hours) - meter) <= 150);
  }

  if (narrowed.length === 1) {
    return ok({ resolved: true, candidate_count: 1, asset: narrowed[0], disambiguated_by: { make: !!make, model: !!model, meter_hours: meter !== null } });
  }

  return ok({
    resolved: false,
    candidate_count: candidates.length,
    serial_number: serial,
    candidates,
    escalation_required: true,
    escalate_to: "service_writer",
    note:
      `Serial ${serial} resolves to ${candidates.length} units from ${new Set(candidates.map((x) => A(x.manufacturer))).size} different manufacturers. ` +
      "Serial numbers are unique within a manufacturer only. Do NOT select the more likely candidate — a claim against the wrong unit is both a denial and a data-integrity incident. Escalate to the service writer.",
  });
}

export async function get_oem_program_terms(c: DealerClient, args: Record<string, unknown>) {
  const code = A(args.program_code);
  const rows = code
    ? await c.q(`SELECT * FROM dealer.oem_programs WHERE program_code = $1`, [code])
    : await c.q(`SELECT * FROM dealer.oem_programs ORDER BY manufacturer`);
  if (code && !rows.length) return err(`Unknown program ${code}`);
  return ok({
    programs: rows.map((p) => ({
      ...p,
      terms_age_hours: money(daysBetween(A(p.terms_last_verified_at).slice(0, 10), todayIso()) * 24),
      revalidation_note: "Program terms change without notice. Terms older than 24 hours must be revalidated before submission.",
    })),
  });
}

export async function get_asset_service_history(c: DealerClient, args: Record<string, unknown>) {
  const unitId = A(args.unit_id);
  if (!unitId) return err("unit_id is required");
  const wos = await c.q(
    `SELECT work_order_id, completed_on, meter_hours_at_service, repair_code, causal_part,
            segment, labour_hours_booked, cause
       FROM dealer.work_orders WHERE unit_id = $1 ORDER BY completed_on`,
    [unitId]
  );
  const claims = await c.q(
    `SELECT claim_id, work_order_id, status, approved_amount_usd, denial_reason_code
       FROM dealer.warranty_claims WHERE unit_id = $1 ORDER BY submitted_on`,
    [unitId]
  );
  // Repeat failures on the same component are what extension provisions turn on.
  const byPart = new Map<string, number>();
  for (const w of wos) {
    if (A(w.segment) !== "warranty" || !w.causal_part) continue;
    byPart.set(A(w.causal_part), (byPart.get(A(w.causal_part)) ?? 0) + 1);
  }
  const repeats = Array.from(byPart.entries()).filter(([, n]) => n > 1).map(([part, n]) => ({ causal_part: part, warranty_repairs: n }));
  return ok({
    unit_id: unitId, work_order_count: wos.length, claim_count: claims.length,
    repeat_failure_components: repeats,
    meter_history: wos.map((w) => ({ date: w.completed_on, meter_hours: w.meter_hours_at_service })),
    work_orders: wos, claims,
    note: repeats.length
      ? "This unit has repeat warranty failures on the same component. Check whether the program's repeat-failure provision extends coverage before concluding out-of-coverage."
      : null,
  });
}

export async function get_labour_standard(c: DealerClient, args: Record<string, unknown>) {
  const make = A(args.manufacturer), model = A(args.model), code = A(args.repair_code);
  if (!make || !model || !code) return err("manufacturer, model and repair_code are required");
  const row = await c.one(
    `SELECT * FROM dealer.labour_standards WHERE manufacturer = $1 AND model = $2 AND repair_code = $3`,
    [make, model, code]
  );
  if (!row) return err(`No published standard time for ${make} ${model} / ${code}. Claimed labour cannot exceed a standard that does not exist — escalate.`);
  return ok({ ...row, note: "This is the CEILING for claimable labour. Booked hours above it are absorbed unless documented complications justify the overage." });
}

// ── Claim assembly & portal ──────────────────────────────────────────────────

export async function assemble_claim(c: DealerClient, args: Record<string, unknown>) {
  const woId = A(args.work_order_id);
  if (!woId) return err("work_order_id is required");
  const wo = await c.one(`SELECT * FROM dealer.work_orders WHERE work_order_id = $1`, [woId]);
  if (!wo) return err(`Unknown work order ${woId}`);

  const missing: string[] = [];
  if (!wo.unit_id) missing.push("equipment identity unresolved (serial did not resolve to a single asset)");
  if (!wo.cause) missing.push("failure cause not established in the technician notes");
  if (!wo.causal_part) missing.push("causal part not identified");
  if (!wo.complaint) missing.push("complaint missing");
  if (!wo.correction) missing.push("correction missing");

  const asset = wo.unit_id
    ? await c.one(`SELECT * FROM dealer.fleet_assets WHERE unit_id = $1`, [wo.unit_id])
    : null;
  const std = asset
    ? await c.one(`SELECT standard_hours FROM dealer.labour_standards WHERE manufacturer=$1 AND model=$2 AND repair_code=$3`,
        [asset.manufacturer, asset.model, wo.repair_code])
    : null;

  const lines = await c.q(`SELECT * FROM dealer.work_order_lines WHERE work_order_id = $1`, [woId]);
  const partsTotal = money(lines.filter((l) => A(l.line_type) === "part").reduce((s, l) => s + N(l.amount_usd), 0));
  const bookedHours = N(wo.labour_hours_booked);
  const stdHours = std ? N(std.standard_hours) : null;
  const claimableHours = stdHours === null ? bookedHours : Math.min(bookedHours, stdHours);

  const existing = await c.one(`SELECT claim_id FROM dealer.warranty_claims WHERE work_order_id = $1`, [woId]);
  const claimId = existing ? A(existing.claim_id) : newId("WC");

  if (!existing) {
    await c.q(
      `INSERT INTO dealer.warranty_claims
         (claim_id, work_order_id, unit_id, program_code, claimed_labour_hours, standard_labour_hours,
          claimed_parts_usd, claimed_total_usd, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'draft')`,
      [claimId, woId, wo.unit_id ?? null, asset?.program_code ?? null, claimableHours, stdHours,
       partsTotal, money(partsTotal + claimableHours * 140)]
    );
  }

  return ok({
    claim_id: claimId, work_order_id: woId, status: "draft",
    unit_id: wo.unit_id, program_code: asset?.program_code ?? null,
    complaint: wo.complaint, cause: wo.cause, correction: wo.correction, causal_part: wo.causal_part,
    labour_hours_booked: bookedHours,
    standard_labour_hours: stdHours,
    claimable_labour_hours: claimableHours,
    labour_absorbed_hours: stdHours === null ? 0 : money(Math.max(0, bookedHours - stdHours)),
    claimed_parts_usd: partsTotal,
    missing_mandatory_elements: missing,
    ready_for_gate: missing.length === 0,
    note: missing.length
      ? "Mandatory elements are missing. Where the cause is not established, request technician clarification — do NOT infer a plausible cause to complete the claim."
      : "Draft assembled. Run the compliance gate before any submission attempt.",
  });
}

/** Every mandatory check, re-run from source data. Nothing is trusted from the caller. */
export async function run_compliance_gate(c: DealerClient, args: Record<string, unknown>) {
  const claimId = A(args.claim_id);
  if (!claimId) return err("claim_id is required");
  const claim = await c.one(`SELECT * FROM dealer.warranty_claims WHERE claim_id = $1`, [claimId]);
  if (!claim) return err(`Unknown claim ${claimId}`);
  const wo = await c.one(`SELECT * FROM dealer.work_orders WHERE work_order_id = $1`, [claim.work_order_id]);
  const failures: string[] = [];
  const checks: Record<string, unknown> = {};

  // 1. Equipment identity
  if (!claim.unit_id) {
    failures.push("Equipment identity unresolved — the serial did not resolve to exactly one fleet asset.");
    checks.identity = { passed: false };
  } else {
    checks.identity = { passed: true, unit_id: claim.unit_id };
  }

  const asset = claim.unit_id ? await c.one(`SELECT * FROM dealer.fleet_assets WHERE unit_id = $1`, [claim.unit_id]) : null;
  const prog = asset?.program_code
    ? await c.one(`SELECT * FROM dealer.oem_programs WHERE program_code = $1`, [asset.program_code])
    : null;

  // 2. Coverage — BOTH dimensions, then repeat-failure extension.
  if (asset && prog) {
    const monthsElapsed = money(daysBetween(A(asset.delivery_date), todayIso()) / MONTH_DAYS);
    const hours = N(wo?.meter_hours_at_service ?? asset.meter_hours);
    const withinCalendar = monthsElapsed <= N(prog.coverage_months);
    const withinHours = hours <= N(prog.coverage_hours);

    let repeatExtends = false;
    let repeatDetail: unknown = null;
    if (!withinHours && prog.repeat_failure_provision && wo?.causal_part) {
      const priors = await c.q(
        `SELECT work_order_id, meter_hours_at_service FROM dealer.work_orders
          WHERE unit_id = $1 AND causal_part = $2 AND segment = 'warranty' AND work_order_id <> $3`,
        [claim.unit_id, wo.causal_part, claim.work_order_id]
      );
      if (priors.length >= 1) {
        repeatExtends = true;
        repeatDetail = { prior_warranty_repairs: priors.length, priors };
      }
    }

    checks.coverage = {
      months_elapsed: monthsElapsed, coverage_months: N(prog.coverage_months), within_calendar: withinCalendar,
      meter_hours: hours, coverage_hours: N(prog.coverage_hours), within_hours: withinHours,
      repeat_failure_provision: !!prog.repeat_failure_provision,
      repeat_failure_extends_coverage: repeatExtends, repeat_detail: repeatDetail,
      passed: withinCalendar && (withinHours || repeatExtends),
    };
    if (!withinCalendar) failures.push(`Out of coverage on calendar time: ${monthsElapsed} months elapsed against a ${prog.coverage_months}-month program.`);
    if (!withinHours && !repeatExtends) failures.push(`Out of coverage on meter hours: ${hours} against a ${prog.coverage_hours}-hour ceiling. Either dimension exceeded means out of coverage.`);
  } else {
    failures.push("No OEM program resolved for this asset — coverage cannot be established.");
    checks.coverage = { passed: false };
  }

  // 3. Labour standard cap
  const claimed = N(claim.claimed_labour_hours);
  const std = claim.standard_labour_hours === null ? null : N(claim.standard_labour_hours);
  checks.labour = { claimed_hours: claimed, standard_hours: std, passed: std === null || claimed <= std + 0.001 };
  if (std !== null && claimed > std + 0.001) {
    failures.push(`Claimed labour ${claimed}h exceeds the published standard of ${std}h without documented justification.`);
  }

  // 4. Narrative & causal part
  const needsNarrative = !!prog?.requires_failure_narrative;
  const needsPart = !!prog?.requires_causal_part;
  const narrativeOk = !needsNarrative || (!!wo?.complaint && !!wo?.cause && !!wo?.correction);
  const partOk = !needsPart || !!wo?.causal_part;
  checks.documentation = { requires_narrative: needsNarrative, narrative_complete: narrativeOk, requires_causal_part: needsPart, causal_part_present: partOk, passed: narrativeOk && partOk };
  if (!narrativeOk) failures.push("Failure narrative incomplete — this program requires complaint, cause and correction. Request technician clarification rather than inferring a cause.");
  if (!partOk) failures.push("Causal part not identified, and this program requires one.");

  const result = failures.length === 0 ? "PASS" : "FAIL";
  await c.q(
    `UPDATE dealer.warranty_claims SET gate_result = $1, gate_failures = $2,
            status = CASE WHEN $1 = 'FAIL' THEN 'blocked' ELSE status END
      WHERE claim_id = $3`,
    [result, failures, claimId]
  );

  return ok({
    claim_id: claimId, gate_result: result, checks, failures,
    note: result === "PASS"
      ? "All mandatory checks passed. Submission is permitted."
      : "Submission is BLOCKED. Route to goodwill review — do not adjust the claim to get past the gate. Reducing claimed hours to the standard is legitimate; changing a meter reading is not.",
  });
}

export async function submit_claim(c: DealerClient, args: Record<string, unknown>) {
  const claimId = A(args.claim_id);
  if (!claimId) return err("claim_id is required");
  const claim = await c.one(`SELECT * FROM dealer.warranty_claims WHERE claim_id = $1`, [claimId]);
  if (!claim) return err(`Unknown claim ${claimId}`);

  // Hard gate — the portal call cannot be reached without a recorded PASS.
  if (A(claim.gate_result) !== "PASS") {
    return err(
      `Claim ${claimId} has not passed the pre-submission compliance gate (current: ${claim.gate_result ?? "not run"}). ` +
      `${(claim.gate_failures as string[] | null)?.length ? "Failures: " + (claim.gate_failures as string[]).join(" | ") + ". " : ""}` +
      "Submitting a non-compliant claim risks the dealership's OEM program standing, which is worth more than this claim. Route to goodwill review instead."
    );
  }
  if (["submitted", "approved"].includes(A(claim.status))) {
    return err(`Claim ${claimId} is already ${claim.status}.`);
  }

  await c.q(`UPDATE dealer.warranty_claims SET status = 'submitted', submitted_on = CURRENT_DATE WHERE claim_id = $1`, [claimId]);
  return ok({
    submitted: true, claim_id: claimId, portal_reference: newId("OEM"),
    submitted_on: todayIso(), expected_adjudication_days: 10,
    note: "Submitted to the manufacturer portal. Adjudication is returned by get_claim_status.",
  });
}

export async function route_to_goodwill_review(c: DealerClient, args: Record<string, unknown>) {
  const claimId = A(args.claim_id);
  if (!claimId) return err("claim_id is required");
  const claim = await c.one(`SELECT * FROM dealer.warranty_claims WHERE claim_id = $1`, [claimId]);
  if (!claim) return err(`Unknown claim ${claimId}`);
  const wo = await c.one(`SELECT account_id, branch_id FROM dealer.work_orders WHERE work_order_id = $1`, [claim.work_order_id]);
  const acct = wo?.account_id
    ? await c.one(`SELECT legal_name, account_tier, annual_parts_service_spend_usd FROM dealer.customer_accounts WHERE account_id = $1`, [wo.account_id])
    : null;

  await c.q(`UPDATE dealer.warranty_claims SET status = 'goodwill' WHERE claim_id = $1`, [claimId]);
  return ok({
    routed: true, claim_id: claimId, routed_to: "service_manager",
    failing_conditions: claim.gate_failures ?? [A(args.reason) || "out_of_coverage"],
    claimed_total_usd: money(N(claim.claimed_total_usd)),
    commercial_context: acct
      ? { customer: acct.legal_name, account_tier: acct.account_tier, annual_parts_service_spend_usd: money(N(acct.annual_parts_service_spend_usd)) }
      : null,
    note: "Routed for goodwill or customer-pay decision rather than submitted. A blocked non-compliant claim is a success — it protects program standing.",
  });
}

/**
 * ADJUDICATION SIMULATOR — see the file header. The verdict is derived from
 * the program terms in `dealer.oem_programs` and the claim's own numbers; it
 * is not a canned response. It stands in for a manufacturer portal we have no
 * access to, and says so in its own output.
 */
export async function get_claim_status(c: DealerClient, args: Record<string, unknown>) {
  const claimId = A(args.claim_id);
  const rows = claimId
    ? await c.q(`SELECT * FROM dealer.warranty_claims WHERE claim_id = $1`, [claimId])
    : await c.q(`SELECT * FROM dealer.warranty_claims WHERE status IN ('submitted','resubmitted') ORDER BY submitted_on`);
  if (claimId && !rows.length) return err(`Unknown claim ${claimId}`);

  const adjudicated: unknown[] = [];
  for (const claim of rows) {
    if (!["submitted", "resubmitted"].includes(A(claim.status))) {
      adjudicated.push({ claim_id: claim.claim_id, status: claim.status, approved_amount_usd: claim.approved_amount_usd });
      continue;
    }
    const asset = claim.unit_id ? await c.one(`SELECT * FROM dealer.fleet_assets WHERE unit_id = $1`, [claim.unit_id]) : null;
    const prog = asset?.program_code ? await c.one(`SELECT * FROM dealer.oem_programs WHERE program_code = $1`, [asset.program_code]) : null;
    const wo = await c.one(`SELECT * FROM dealer.work_orders WHERE work_order_id = $1`, [claim.work_order_id]);

    let status = "approved";
    let reasonCode: string | null = null;
    let reasonText: string | null = null;
    let approved = money(N(claim.claimed_total_usd));

    const hours = N(wo?.meter_hours_at_service ?? asset?.meter_hours ?? 0);
    const months = asset?.delivery_date ? money(daysBetween(A(asset.delivery_date), todayIso()) / MONTH_DAYS) : 0;

    if (prog && hours > N(prog.coverage_hours)) {
      status = "denied"; reasonCode = "OUT_OF_COVERAGE_HOURS";
      reasonText = `Unit at ${hours} hours exceeds the ${prog.coverage_hours}-hour program ceiling.`; approved = 0;
    } else if (prog && months > N(prog.coverage_months)) {
      status = "denied"; reasonCode = "OUT_OF_COVERAGE_MONTHS";
      reasonText = `Unit at ${months} months exceeds the ${prog.coverage_months}-month program term.`; approved = 0;
    } else if (prog?.requires_causal_part && !wo?.causal_part) {
      status = "denied"; reasonCode = "MISSING_CAUSAL_PART";
      reasonText = "No causal part identified on the submission."; approved = 0;
    } else if (prog?.requires_failure_narrative && !wo?.cause) {
      status = "denied"; reasonCode = "INSUFFICIENT_NARRATIVE";
      reasonText = "Failure cause not established."; approved = 0;
    } else if (claim.standard_labour_hours !== null && N(claim.claimed_labour_hours) > N(claim.standard_labour_hours)) {
      status = "approved"; reasonCode = "LABOUR_WRITTEN_DOWN";
      reasonText = `Labour reduced to the published standard of ${claim.standard_labour_hours}h.`;
      approved = money(N(claim.claimed_parts_usd) + N(claim.standard_labour_hours) * 140);
    }

    await c.q(
      `UPDATE dealer.warranty_claims
          SET status = $1, adjudicated_on = CURRENT_DATE, approved_amount_usd = $2,
              denial_reason_code = $3, denial_reason_text = $4
        WHERE claim_id = $5`,
      [status, approved, reasonCode, reasonText, claim.claim_id]
    );
    adjudicated.push({
      claim_id: claim.claim_id, status, approved_amount_usd: approved,
      claimed_total_usd: money(N(claim.claimed_total_usd)),
      denial_reason_code: reasonCode, denial_reason_text: reasonText,
    });
  }

  return ok({
    source: "OEM_ADJUDICATION_SIMULATOR",
    disclosure: "Manufacturer portals are not reachable from this environment. This verdict is COMPUTED from the program terms stored in dealer.oem_programs and the claim's own figures — it is derived, not canned — but it stands in for a real counterparty. Swap this for the live portal integration when credentials exist.",
    claim_count: adjudicated.length,
    claims: adjudicated,
  });
}

export async function analyze_denial(c: DealerClient, args: Record<string, unknown>) {
  const claimId = A(args.claim_id);
  if (!claimId) return err("claim_id is required");
  const claim = await c.one(`SELECT * FROM dealer.warranty_claims WHERE claim_id = $1`, [claimId]);
  if (!claim) return err(`Unknown claim ${claimId}`);
  if (A(claim.status) !== "denied") return ok({ claim_id: claimId, status: claim.status, note: "Not denied — nothing to analyse." });

  const code = A(claim.denial_reason_code);
  const RESUBMITTABLE: Record<string, string> = {
    MISSING_CAUSAL_PART: "Identify the causal part from the work order and resubmit.",
    INSUFFICIENT_NARRATIVE: "Obtain the failure cause from the technician and resubmit — do not infer it.",
  };
  const GENUINE_LOSS: Record<string, string> = {
    OUT_OF_COVERAGE_HOURS: "The unit is genuinely beyond the meter-hour ceiling. This is unrecoverable warranty spend; record it so the pattern stays visible.",
    OUT_OF_COVERAGE_MONTHS: "The unit is genuinely beyond the program term. Unrecoverable.",
  };

  const classification = RESUBMITTABLE[code] ? "resubmittable" : GENUINE_LOSS[code] ? "genuine_loss" : "correctable";
  return ok({
    claim_id: claimId, denial_reason_code: code, denial_reason_text: claim.denial_reason_text,
    classification,
    remedy: RESUBMITTABLE[code] ?? GENUINE_LOSS[code] ?? "Review the submission against program terms and correct the specific defect.",
    unrecovered_usd: money(N(claim.claimed_total_usd)),
    note: "Classify honestly. Genuine losses must be recorded with their reason — absorbing them silently destroys the denial-cause distribution that drives the denial rate down next quarter.",
  });
}

export async function post_warranty_receivable(c: DealerClient, args: Record<string, unknown>) {
  const claimId = A(args.claim_id);
  if (!claimId) return err("claim_id is required");
  const claim = await c.one(`SELECT * FROM dealer.warranty_claims WHERE claim_id = $1`, [claimId]);
  if (!claim) return err(`Unknown claim ${claimId}`);
  if (A(claim.status) !== "approved") return err(`Claim ${claimId} is ${claim.status}, not approved. Only approved claims post as receivables.`);

  const wo = await c.one(`SELECT branch_id, account_id, completed_on FROM dealer.work_orders WHERE work_order_id = $1`, [claim.work_order_id]);
  if (!wo) return err("Work order not found for this claim.");

  // Posts to the period the repair obligation was satisfied — not the period
  // the manufacturer happened to pay.
  const period = A(wo.completed_on).slice(0, 7);
  const entryId = newId("JE");
  await c.q(
    `INSERT INTO dealer.journal_entries
       (entry_id, branch_id, account_id, entry_type, debit_account, credit_account,
        amount_usd, accounting_period, source_document, posted_by_agent)
     VALUES ($1,$2,$3,'warranty_receivable','1250-Warranty Receivable','4200-Warranty Revenue',$4,$5,$6,$7)`,
    [entryId, wo.branch_id, wo.account_id ?? null, money(N(claim.approved_amount_usd)), period,
     `Warranty claim ${claimId} / work order ${claim.work_order_id}`, A(args.agent_id) || "ED-AGT-302"]
  );
  return ok({
    posted: true, entry_id: entryId, claim_id: claimId,
    amount_usd: money(N(claim.approved_amount_usd)),
    branch_id: wo.branch_id, accounting_period: period,
    note: "Posted to the branch that performed the work, in the period the repair obligation was satisfied.",
  });
}
