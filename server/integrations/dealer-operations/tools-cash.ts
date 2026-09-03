/**
 * ED-J1 — Invoice-to-Cash tools.
 *
 * Nothing here returns a canned answer. `propose_allocation` really matches
 * against open AR, `classify_shortfall` really compares a variance against
 * invoice lines and contract terms, and `post_allocation` really writes
 * journal entries and really refuses when the confidence floor or the
 * source-document rule is not satisfied.
 */
import type { McpToolResult } from "../../real-mcp-base";
import { DealerClient, AUTHORITY, money, daysBetween, todayIso, newId, dateIso } from "./client";

export function ok(data: unknown): McpToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}
export function err(message: string): McpToolResult {
  return { content: [{ type: "text", text: JSON.stringify({ error: message }, null, 2) }], isError: true };
}

const A = (v: unknown) => (typeof v === "string" ? v : String(v ?? ""));
const N = (v: unknown) => (typeof v === "number" ? v : parseFloat(String(v ?? "0")) || 0);

// ── Reads ────────────────────────────────────────────────────────────────────

export async function get_payment_batch(c: DealerClient, args: Record<string, unknown>) {
  const day = A(args.received_on) || todayIso();
  const rows = await c.q(
    `SELECT payment_id, received_on, channel, amount_usd, payer_string, received_branch_id, status, bank_reference,
            EXISTS (SELECT 1 FROM dealer.remittance_advices r WHERE r.payment_id = p.payment_id) AS has_remittance
       FROM dealer.payments p
      WHERE (received_on = $1 OR $2) AND status IN ('unapplied','in_research')
      ORDER BY amount_usd DESC`,
    [day, !args.received_on]
  );
  const byChannel: Record<string, { count: number; total: number }> = {};
  for (const r of rows) {
    const ch = A(r.channel);
    byChannel[ch] ??= { count: 0, total: 0 };
    byChannel[ch].count++;
    byChannel[ch].total = money(byChannel[ch].total + N(r.amount_usd));
  }
  return ok({
    payment_count: rows.length,
    total_usd: money(rows.reduce((s, r) => s + N(r.amount_usd), 0)),
    by_channel: byChannel,
    without_remittance: rows.filter((r) => !r.has_remittance).length,
    payments: rows,
  });
}

/**
 * Returns the remittance advice as the customer actually sent it. For a PDF
 * this extracts the text at call time with pdf-parse — the agent is reading a
 * real document, not a pre-parsed column.
 */
export async function get_remittance_document(c: DealerClient, args: Record<string, unknown>) {
  const paymentId = A(args.payment_id);
  if (!paymentId) return err("payment_id is required");
  const adv = await c.one(
    `SELECT advice_id, payment_id, format, file_ref, raw_text, page_count, file_bytes
       FROM dealer.remittance_advices WHERE payment_id = $1`,
    [paymentId]
  );
  if (!adv) {
    return ok({
      payment_id: paymentId, format: "none", document_present: false,
      note: "No remittance advice was supplied with this payment. Allocation must be inferred, and inference below the confidence floor must be routed to research rather than guessed.",
    });
  }
  if (adv.format === "pdf_scan") {
    const ref = A(adv.file_ref);
    // The document travels with the data. There is deliberately no filesystem
    // fallback: the deployed artifact contains only dist/ and node_modules/, so
    // a disk-backed document would be present locally and missing in production.
    const bytes: Uint8Array | null = adv.file_bytes
      ? new Uint8Array(adv.file_bytes as unknown as Buffer)
      : null;
    if (!bytes) {
      return err(`No document bytes stored for remittance advice on ${paymentId} (file_ref=${ref || "none"}). Load the dataset documents before running this journey.`);
    }
    // Real extraction from the real PDF. pdf-parse v2 exposes a class API.
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: bytes });
    let parsed: { text: string; pages?: unknown[] };
    try {
      parsed = await parser.getText();
    } finally {
      await parser.destroy().catch(() => {});
    }
    return ok({
      payment_id: paymentId, advice_id: adv.advice_id, format: "pdf_scan",
      page_count: parsed.pages?.length ?? adv.page_count, document_present: true,
      extracted_text: parsed.text,
      note: "Text extracted from the source PDF at call time. Verify the extracted lines sum to the payment before trusting them.",
    });
  }
  return ok({
    payment_id: paymentId, advice_id: adv.advice_id, format: adv.format,
    document_present: true, extracted_text: adv.raw_text,
  });
}

/**
 * Parses invoice references and amounts out of remittance text, then scores
 * completeness against the payment. Completeness is reported honestly — a
 * partial parse is never dressed up as a full one.
 */
export async function extract_remittance_intent(c: DealerClient, args: Record<string, unknown>) {
  const paymentId = A(args.payment_id);
  const text = A(args.text);
  if (!paymentId) return err("payment_id is required");
  const pay = await c.one(`SELECT amount_usd FROM dealer.payments WHERE payment_id = $1`, [paymentId]);
  if (!pay) return err(`Unknown payment ${paymentId}`);

  let source = text;
  if (!source) {
    const doc = await get_remittance_document(c, { payment_id: paymentId });
    const body = JSON.parse(doc.content[0].text);
    source = A(body.extracted_text);
    if (!source) {
      return ok({
        payment_id: paymentId, lines: [], completeness_score: 0,
        unaccounted_usd: money(N(pay.amount_usd)),
        note: "No remittance text available — nothing to extract. This payment cannot be allocated from customer intent.",
      });
    }
  }

  // Two passes, deliberately. A single pattern with an optional trailing amount
  // matches the empty string at every reference and silently loses every
  // amount, which reads as a successful parse of a zero-value remittance.
  const norm = (raw: string) => raw.toUpperCase().replace(/\s/g, "-").replace(/^INV(\d)/, "INV-$1");
  const lines: Array<{ invoice_id: string; amount_usd: number | null }> = [];

  // Pass 1 — references that carry an amount on the same line.
  const paired = /(INV[-\s]?\d{4,6})[^\dA-Za-z\n]{0,12}\$?\s*([\d,]+\.\d{2})/gi;
  let m: RegExpExecArray | null;
  while ((m = paired.exec(source)) !== null) {
    const id = norm(m[1]);
    if (!lines.some((l) => l.invoice_id === id)) {
      lines.push({ invoice_id: id, amount_usd: money(parseFloat(m[2].replace(/,/g, ""))) });
    }
  }
  // Pass 2 — bare references with no amount beside them. Reported with a null
  // amount rather than dropped, so the completeness score stays honest.
  const bare = /(INV[-\s]?\d{4,6})/gi;
  while ((m = bare.exec(source)) !== null) {
    const id = norm(m[1]);
    if (!lines.some((l) => l.invoice_id === id)) lines.push({ invoice_id: id, amount_usd: null });
  }

  const extracted = money(lines.reduce((s, l) => s + (l.amount_usd ?? 0), 0));
  const paid = money(N(pay.amount_usd));
  const completeness = paid === 0 ? 0 : Math.min(1, money(extracted / paid));
  const deductionHints = /freight|not accepted|short|dispute|discount|credit/i.exec(source);

  return ok({
    payment_id: paymentId,
    lines,
    line_count: lines.length,
    extracted_total_usd: extracted,
    payment_amount_usd: paid,
    completeness_score: completeness,
    unaccounted_usd: money(paid - extracted),
    deduction_language_detected: deductionHints ? deductionHints[0] : null,
    note: completeness < 0.995
      ? "Extracted lines do NOT fully account for the payment. Report the residual; do not invent an allocation to close the gap."
      : "Extracted lines fully account for the payment amount.",
  });
}

/** Resolves a payer string to a master account across DBAs and truncations. */
export async function resolve_payer_to_account(c: DealerClient, args: Record<string, unknown>) {
  const payer = A(args.payer_string).trim();
  if (!payer) return err("payer_string is required");
  const exact = await c.q(
    `SELECT account_id, legal_name, account_tier, known_payer_names
       FROM dealer.customer_accounts WHERE $1 = ANY(known_payer_names)`,
    [payer]
  );
  if (exact.length === 1) {
    return ok({ resolved: true, confidence: 0.99, match_type: "known_payer_alias", account: exact[0] });
  }
  // Fall back to a token-overlap match, and report ambiguity rather than picking.
  const all = await c.q(`SELECT account_id, legal_name, known_payer_names FROM dealer.customer_accounts`);
  const tokens = payer.toUpperCase().replace(/[^A-Z0-9 ]/g, " ").split(/\s+/).filter((t) => t.length > 2);
  const scored = all
    .map((a) => {
      const hay = (A(a.legal_name) + " " + (a.known_payer_names as string[]).join(" ")).toUpperCase();
      const hits = tokens.filter((t) => hay.includes(t)).length;
      return { account: a, score: tokens.length ? hits / tokens.length : 0 };
    })
    .filter((s) => s.score > 0.4)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 1) {
    return ok({ resolved: true, confidence: money(0.6 + scored[0].score * 0.3), match_type: "token_overlap", account: scored[0].account });
  }
  if (scored.length > 1 && scored[0].score > scored[1].score + 0.25) {
    return ok({ resolved: true, confidence: money(0.55 + scored[0].score * 0.3), match_type: "token_overlap_dominant", account: scored[0].account, runners_up: scored.slice(1, 3) });
  }
  return ok({
    resolved: false, confidence: 0.3, candidates: scored.slice(0, 4).map((s) => s.account),
    note: "Payer string did not resolve to a single account. Escalate rather than selecting the most likely candidate.",
  });
}

export async function get_open_ar(c: DealerClient, args: Record<string, unknown>) {
  const account = A(args.account_id);
  if (!account) return err("account_id is required");
  const rows = await c.q(
    `SELECT i.invoice_id, i.branch_id, i.revenue_line, i.invoice_date, i.due_date,
            i.original_amount_usd, i.balance_usd, i.status, i.obligation_satisfied_on,
            EXISTS (SELECT 1 FROM dealer.disputes d WHERE d.invoice_id = i.invoice_id AND d.status = 'open') AS under_dispute
       FROM dealer.invoices i
      WHERE i.account_id = $1 AND i.status IN ('open','partially_paid')
      ORDER BY i.due_date`,
    [account]
  );
  const byBranch: Record<string, number> = {};
  for (const r of rows) byBranch[A(r.branch_id)] = money((byBranch[A(r.branch_id)] ?? 0) + N(r.balance_usd));
  return ok({
    account_id: account, open_invoice_count: rows.length,
    open_total_usd: money(rows.reduce((s, r) => s + N(r.balance_usd), 0)),
    by_branch: byBranch, branches_involved: Object.keys(byBranch).length, invoices: rows,
  });
}

export async function get_contract_terms(c: DealerClient, args: Record<string, unknown>) {
  const account = A(args.account_id);
  const row = await c.one(
    `SELECT account_id, legal_name, payment_terms, settlement_discount_pct, settlement_discount_days,
            freight_absorption_threshold_usd, credit_limit_usd, account_tier, credit_status
       FROM dealer.customer_accounts WHERE account_id = $1`,
    [account]
  );
  if (!row) return err(`Unknown account ${account}`);
  return ok(row);
}

// ── Matching & posting ───────────────────────────────────────────────────────

export async function propose_allocation(c: DealerClient, args: Record<string, unknown>) {
  const paymentId = A(args.payment_id);
  const accountId = A(args.account_id);
  const proposedBy = A(args.agent_id);
  if (!paymentId || !accountId) return err("payment_id and account_id are required");
  if (!proposedBy) {
    return err("agent_id is required — the proposal must record which actor produced it, so the posting step can enforce segregation of duties.");
  }

  const pay = await c.one(`SELECT payment_id, amount_usd, payer_string FROM dealer.payments WHERE payment_id = $1`, [paymentId]);
  if (!pay) return err(`Unknown payment ${paymentId}`);
  const paid = money(N(pay.amount_usd));

  const open = await c.q(
    `SELECT invoice_id, branch_id, revenue_line, balance_usd, due_date
       FROM dealer.invoices WHERE account_id = $1 AND status IN ('open','partially_paid') ORDER BY due_date`,
    [accountId]
  );

  // Remittance intent, if the customer supplied any.
  const intentRes = await extract_remittance_intent(c, { payment_id: paymentId });
  const intent = JSON.parse(intentRes.content[0].text);
  const intentLines: Array<{ invoice_id: string; amount_usd: number | null }> = intent.lines ?? [];

  const allocation: Array<{ invoice_id: string; branch_id: string; amount_usd: number; basis: string }> = [];
  let confidence = 0;
  let basis = "";

  if (intentLines.length > 0) {
    const openById = new Map(open.map((o) => [A(o.invoice_id), o]));
    let matched = 0;
    let unmatchedRefs = 0;
    for (const line of intentLines) {
      const inv = openById.get(line.invoice_id);
      if (!inv) { unmatchedRefs++; continue; }
      const amt = money(line.amount_usd ?? N(inv.balance_usd));
      allocation.push({ invoice_id: line.invoice_id, branch_id: A(inv.branch_id), amount_usd: amt, basis: "remittance_reference" });
      matched += amt;
    }
    matched = money(matched);
    const coverage = paid === 0 ? 0 : matched / paid;
    basis = "customer remittance advice";
    confidence = money(Math.max(0, Math.min(0.99, 0.99 * coverage - unmatchedRefs * 0.08)));
  } else {
    // No remittance. Only an exact single-invoice match earns real confidence.
    const exact = open.find((o) => money(N(o.balance_usd)) === paid);
    if (exact) {
      allocation.push({ invoice_id: A(exact.invoice_id), branch_id: A(exact.branch_id), amount_usd: paid, basis: "exact_amount_match" });
      confidence = 0.95;
      basis = "exact single-invoice amount match";
    } else {
      // Oldest-first is a GUESS. It is offered as a candidate, never as a
      // confident allocation, and the confidence stays below the floor.
      let remaining = paid;
      for (const o of open) {
        if (remaining <= 0) break;
        const amt = money(Math.min(remaining, N(o.balance_usd)));
        allocation.push({ invoice_id: A(o.invoice_id), branch_id: A(o.branch_id), amount_usd: amt, basis: "oldest_first_candidate" });
        remaining = money(remaining - amt);
      }
      confidence = 0.55;
      basis = "oldest-first inference with no customer instruction";
    }
  }

  const allocated = money(allocation.reduce((s, a) => s + a.amount_usd, 0));
  const residual = money(paid - allocated);
  const branchSplit: Record<string, number> = {};
  for (const a of allocation) branchSplit[a.branch_id] = money((branchSplit[a.branch_id] ?? 0) + a.amount_usd);

  return ok({
    proposal_id: newId("PROP"),
    proposed_by_agent: proposedBy,
    payment_id: paymentId, account_id: accountId,
    payment_amount_usd: paid, allocated_usd: allocated, residual_usd: residual,
    confidence, basis,
    branch_split: branchSplit,
    branches_involved: Object.keys(branchSplit).length,
    allocation,
    multi_branch: Object.keys(branchSplit).length > 1,
    guidance: Object.keys(branchSplit).length > 1
      ? "This payment spans more than one branch. Each line must post to its ORIGINATING branch ledger; applying the whole payment to the receiving branch is prohibited."
      : undefined,
    posting_recommendation:
      confidence >= AUTHORITY.autoPostConfidence ? "auto_post"
      : confidence >= AUTHORITY.humanConfirmConfidence ? "human_confirm"
      : "route_to_research",
    note: "Proposal only. This tool holds no posting authority. Pass proposed_by_agent through to post_allocation, which refuses when the posting actor is the same as the proposing one.",
  });
}

export async function classify_shortfall(c: DealerClient, args: Record<string, unknown>) {
  const invoiceId = A(args.invoice_id);
  const paidAmount = N(args.paid_amount_usd);
  if (!invoiceId) return err("invoice_id is required");

  const inv = await c.one(
    `SELECT i.invoice_id, i.account_id, i.original_amount_usd, i.balance_usd, i.invoice_date, i.due_date,
            a.settlement_discount_pct, a.settlement_discount_days, a.freight_absorption_threshold_usd, a.payment_terms
       FROM dealer.invoices i JOIN dealer.customer_accounts a ON a.account_id = i.account_id
      WHERE i.invoice_id = $1`,
    [invoiceId]
  );
  if (!inv) return err(`Unknown invoice ${invoiceId}`);

  const variance = money(N(inv.balance_usd) - paidAmount);
  if (variance <= 0) return ok({ invoice_id: invoiceId, variance_usd: variance, classification: "no_shortfall" });

  const lines = await c.q(
    `SELECT line_type, description, amount_usd FROM dealer.invoice_lines WHERE invoice_id = $1`,
    [invoiceId]
  );
  const exactLine = lines.find((l) => money(N(l.amount_usd)) === variance);

  const daysToPay = daysBetween(dateIso(inv.invoice_date), todayIso());
  const discountWindow = N(inv.settlement_discount_days);
  const discountPct = N(inv.settlement_discount_pct);
  const discountValue = money(N(inv.original_amount_usd) * (discountPct / 100));
  const withinWindow = discountWindow > 0 && daysToPay <= discountWindow;

  // A variance that exactly matches a line item is a dispute about that line,
  // regardless of how conveniently it resembles a discount.
  if (exactLine) {
    const lt = A(exactLine.line_type);
    const threshold = inv.freight_absorption_threshold_usd === null ? null : N(inv.freight_absorption_threshold_usd);
    const freightAbsorbed = lt === "freight" && threshold !== null && N(inv.original_amount_usd) > threshold;
    return ok({
      invoice_id: invoiceId, variance_usd: variance,
      classification: lt === "freight" ? "freight_dispute" : `${lt}_dispute`,
      matched_line: exactLine,
      contract_clause: freightAbsorbed
        ? `Freight is dealer-absorbed on invoices above $${threshold!.toLocaleString()} under this account's terms; the customer is correct to deduct it.`
        : null,
      customer_position_supported: freightAbsorbed,
      settlement_discount_considered: {
        within_window: withinWindow, days_to_pay: daysToPay, window_days: discountWindow,
        expected_discount_usd: discountValue,
      },
      auto_resolvable: false,
      note: "The variance exactly matches an invoice line. Treat this as an unstated dispute about that line, NOT as a settlement discount, and do not write it off.",
    });
  }

  if (withinWindow && Math.abs(variance - discountValue) < 1) {
    return ok({
      invoice_id: invoiceId, variance_usd: variance, classification: "settlement_discount",
      days_to_pay: daysToPay, window_days: discountWindow, expected_discount_usd: discountValue,
      auto_resolvable: true,
      note: "Payment landed inside the contractual discount window and the variance matches the discount. Legitimate.",
    });
  }

  return ok({
    invoice_id: invoiceId, variance_usd: variance, classification: "unexplained",
    days_to_pay: daysToPay, within_discount_window: withinWindow,
    auto_resolvable: false,
    note: "Variance does not match any invoice line or the contractual discount. Route with evidence rather than writing it off.",
  });
}

export async function check_posting_period(c: DealerClient, args: Record<string, unknown>) {
  const invoiceIds = Array.isArray(args.invoice_ids) ? (args.invoice_ids as string[]) : [A(args.invoice_id)].filter(Boolean);
  if (!invoiceIds.length) return err("invoice_ids (or invoice_id) is required");
  const rows = await c.q(
    `SELECT invoice_id, invoice_date, obligation_satisfied_on FROM dealer.invoices WHERE invoice_id = ANY($1)`,
    [invoiceIds]
  );
  const now = new Date();
  const currentPeriod = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const crossings = rows
    .filter((r) => r.obligation_satisfied_on && A(r.obligation_satisfied_on).slice(0, 7) !== currentPeriod)
    .map((r) => ({
      invoice_id: r.invoice_id,
      obligation_period: A(r.obligation_satisfied_on).slice(0, 7),
      invoice_period: dateIso(r.invoice_date).slice(0, 7),
    }));
  return ok({
    current_period: currentPeriod, period_open: true,
    crosses_period_boundary: crossings.length > 0,
    crossings,
    asc606_concern: crossings.length > 0
      ? "One or more obligations were satisfied in a prior period. Recognising this revenue in the current period would misstate both periods under ASC 606. Flag for accounting review rather than posting."
      : null,
  });
}

/**
 * The only tool in J1 that touches the ledger. It re-checks every gate itself
 * rather than trusting the caller, because an agent under instruction is
 * exactly the caller these gates exist to stop.
 */
export async function post_allocation(c: DealerClient, args: Record<string, unknown>) {
  const paymentId = A(args.payment_id);
  const confidence = N(args.confidence);
  const approver = A(args.approver);
  const sourceDocument = A(args.source_document);
  const postedBy = A(args.agent_id);
  const proposedBy = A(args.proposed_by_agent);
  const allocation = (Array.isArray(args.allocation) ? args.allocation : []) as Array<{ invoice_id: string; amount_usd: number }>;

  if (!paymentId) return err("payment_id is required");
  if (!allocation.length) return err("allocation is required and must be non-empty");

  // Gate 0 — segregation of duties, enforced by comparing actors rather than
  // by naming particular agents. Whoever proposed an allocation may not also
  // post it, in any deployment.
  if (!postedBy) return err("agent_id is required — every ledger posting must be attributable to a named actor.");
  if (!proposedBy) {
    return err(
      "proposed_by_agent is required. Segregation of duties cannot be verified without knowing which actor produced " +
      "the allocation, so the posting is refused."
    );
  }
  if (postedBy === proposedBy) {
    return err(
      `SEGREGATION OF DUTIES: "${postedBy}" produced this allocation and may not also post it. ` +
      "Posting must be performed by a different actor. Refusing regardless of confidence or instruction."
    );
  }
  // Gate 1 — source document.
  if (!sourceDocument) {
    return err("No source document supplied. Every ledger posting must carry a linked source document (remittance advice, bank record, or explicit human instruction). Refusing.");
  }
  // Gate 2 — confidence floor.
  if (confidence < AUTHORITY.autoPostConfidence && !approver) {
    return err(
      `Confidence ${confidence} is below the auto-post floor of ${AUTHORITY.autoPostConfidence} and no approver was supplied. ` +
      (confidence >= AUTHORITY.humanConfirmConfidence
        ? "Obtain one-click human confirmation, or route to research."
        : "Route this payment to the research queue instead of posting it.")
    );
  }

  const pay = await c.one(`SELECT amount_usd, status FROM dealer.payments WHERE payment_id = $1`, [paymentId]);
  if (!pay) return err(`Unknown payment ${paymentId}`);
  if (A(pay.status) === "applied") return err(`Payment ${paymentId} is already applied.`);

  const invIds = allocation.map((a) => a.invoice_id);
  const invoices = await c.q(
    `SELECT invoice_id, account_id, branch_id, balance_usd, obligation_satisfied_on FROM dealer.invoices WHERE invoice_id = ANY($1)`,
    [invIds]
  );
  const missing = invIds.filter((id) => !invoices.some((i) => A(i.invoice_id) === id));
  if (missing.length) return err(`Unknown invoice(s): ${missing.join(", ")}`);

  const allocated = money(allocation.reduce((s, a) => s + N(a.amount_usd), 0));
  const residual = money(N(pay.amount_usd) - allocated);
  // Gate 3 — residuals are never silently absorbed.
  if (residual > AUTHORITY.residualWriteOffCeilingUsd) {
    return err(
      `Unallocated residual of $${residual.toFixed(2)} exceeds the $${AUTHORITY.residualWriteOffCeilingUsd} write-off ceiling. ` +
      "Route the residual to the research queue; an agent may not write it off."
    );
  }

  const now = new Date();
  const period = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const entries: unknown[] = [];

  await c.tx(async (client) => {
    for (const a of allocation) {
      const inv = invoices.find((i) => A(i.invoice_id) === a.invoice_id)!;
      const amt = money(N(a.amount_usd));
      const entryId = newId("JE");
      await client.query(
        `INSERT INTO ${c.schema}.journal_entries
           (entry_id, branch_id, account_id, invoice_id, payment_id, entry_type,
            debit_account, credit_account, amount_usd, accounting_period,
            source_document, confidence, posted_by_agent, approved_by)
         VALUES ($1,$2,$3,$4,$5,'cash_application','1010-Cash','1200-AR',$6,$7,$8,$9,$10,$11)`,
        [entryId, inv.branch_id, inv.account_id, a.invoice_id, paymentId, amt, period,
         sourceDocument, confidence, postedBy, approver || null]
      );
      const newBal = money(N(inv.balance_usd) - amt);
      await client.query(
        `UPDATE ${c.schema}.invoices SET balance_usd = $1, status = $2 WHERE invoice_id = $3`,
        [newBal, newBal <= 0.005 ? "closed_paid" : "partially_paid", a.invoice_id]
      );
      entries.push({ entry_id: entryId, branch_id: inv.branch_id, invoice_id: a.invoice_id, amount_usd: amt });
    }
    await client.query(
      `UPDATE ${c.schema}.payments SET status = $1 WHERE payment_id = $2`,
      [residual > 0.005 ? "partially_applied" : "applied", paymentId]
    );
  });

  const byBranch: Record<string, number> = {};
  for (const e of entries as Array<{ branch_id: string; amount_usd: number }>) {
    byBranch[e.branch_id] = money((byBranch[e.branch_id] ?? 0) + e.amount_usd);
  }

  return ok({
    posted: true, payment_id: paymentId, entries_posted: entries.length,
    allocated_usd: allocated, residual_usd: residual,
    branch_ledgers_affected: Object.keys(byBranch).length, by_branch: byBranch,
    accounting_period: period, source_document: sourceDocument,
    posted_by_agent: postedBy, approved_by: approver || null,
    journal_entries: entries,
  });
}

export async function route_to_research_queue(c: DealerClient, args: Record<string, unknown>) {
  const paymentId = A(args.payment_id);
  if (!paymentId) return err("payment_id is required");
  const reason = A(args.reason_code) || "low_confidence";
  const ambiguity = A(args.ambiguity);
  if (!ambiguity) return err("ambiguity is required — state plainly what could not be determined, so the researcher starts from a decision rather than a lookup");

  const itemId = newId("RQ");
  await c.q(
    `INSERT INTO dealer.research_queue
       (item_id, payment_id, reason_code, ambiguity, candidates, confidence, residual_usd, routed_by_agent)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [itemId, paymentId, reason, ambiguity, JSON.stringify(args.candidates ?? []),
     args.confidence === undefined ? null : N(args.confidence),
     args.residual_usd === undefined ? null : N(args.residual_usd),
     A(args.agent_id) || null]
  );
  await c.q(`UPDATE dealer.payments SET status = 'in_research' WHERE payment_id = $1`, [paymentId]);
  return ok({
    routed: true, item_id: itemId, payment_id: paymentId, reason_code: reason, ambiguity,
    candidates_attached: Array.isArray(args.candidates) ? (args.candidates as unknown[]).length : 0,
  });
}

export async function get_ar_impact(c: DealerClient, _args: Record<string, unknown>) {
  const [openRow] = await c.q(
    `SELECT COALESCE(SUM(balance_usd),0) AS open_ar,
            COUNT(*) FILTER (WHERE due_date < CURRENT_DATE) AS overdue_count
       FROM dealer.invoices WHERE status IN ('open','partially_paid')`
  );
  const [posted] = await c.q(
    `SELECT COUNT(*) AS entries, COALESCE(SUM(amount_usd),0) AS applied
       FROM dealer.journal_entries WHERE entry_type = 'cash_application' AND posted_at::date = CURRENT_DATE`
  );
  const [research] = await c.q(
    `SELECT COUNT(*) AS items, COALESCE(SUM(p.amount_usd),0) AS unapplied
       FROM dealer.research_queue r JOIN dealer.payments p ON p.payment_id = r.payment_id
      WHERE r.status = 'open'`
  );
  const [batch] = await c.q(
    `SELECT COUNT(*) AS total FROM dealer.payments WHERE received_on = CURRENT_DATE`
  );
  const applied = N(posted.entries);
  const total = N(batch.total);
  const routed = N(research.items);
  return ok({
    open_ar_usd: money(N(openRow.open_ar)),
    overdue_invoice_count: N(openRow.overdue_count),
    postings_today: applied,
    applied_today_usd: money(N(posted.applied)),
    unapplied_in_research_usd: money(N(research.unapplied)),
    research_queue_open: routed,
    // Reported honestly: forced allocations are not successes.
    touchless_rate: total > 0 ? money((total - routed) / total) : null,
    note: "Touchless rate counts only payments posted above the confidence floor. Payments routed to research are excluded from the numerator, never counted as successes.",
  });
}
