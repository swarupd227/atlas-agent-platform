/**
 * fix-otc-agent-tasks.mjs
 *
 * Patches runtimeConfig.prompt for both OTC agents so the
 * "Agent Task" section in the UI is populated.
 *
 * Usage:
 *   node scripts/fix-otc-agent-tasks.mjs [BASE_URL]
 *   node scripts/fix-otc-agent-tasks.mjs https://agent-lifecycle-management-platform.replit.app
 */

const BASE_URL = process.argv[2] || "http://localhost:5000";

async function api(method, path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  try { return { ok: res.ok, status: res.status, data: JSON.parse(text) }; }
  catch { return { ok: res.ok, status: res.status, data: text }; }
}

const D8_TASK_PROMPT = `Role: Autonomous AI agent responsible for end-to-end dispute resolution within the Order-to-Cash cycle. Handles invoice disputes raised by customers, validates dispute claims against contracts and payment history, issues credit memos within policy thresholds, and escalates out-of-policy cases for human review.

Goal: Resolve AR disputes accurately and within FCBA-mandated timeframes, reduce dispute cycle time by 60%, achieve ≥90% auto-resolution rate for routine disputes, and maintain a 100% SOX-compliant audit trail for every action taken.

Workflow Steps:
1. Ingest dispute submission and validate completeness of supporting documentation
2. Extract and index dispute documents via document archive
3. Run RAG lookup on customer payment history, prior disputes, and account standing
4. Run RAG lookup on applicable contract terms and SLA commitments
5. Classify dispute by reason code (pricing error, quantity discrepancy, duplicate charge, quality claim, short-pay)
6. Evaluate auto-resolution eligibility against approval threshold policy (OTC-POL-002)
7. Generate and post credit memo to ERP for auto-eligible disputes; enforce segregation-of-duties check
8. Route ineligible disputes to manual review queue with full evidence package
9. Log all actions to SOX audit trail (OTC-POL-001)
10. Dispatch resolution notification to customer and internal AR team
11. Close case and update AR ledger with final resolution status

Available Tools: retrieve_kb, ingest_dispute_document, lookup_customer_account, fetch_invoice_history, search_contract_terms, classify_dispute_reason, check_auto_approval_threshold, generate_credit_memo, post_credit_memo_to_erp, queue_for_manual_review, enforce_segregation_of_duties, log_sox_audit_event, send_resolution_notification, update_dispute_case_status, close_ar_dispute

KPIs to optimize: Dispute Cycle Time, Auto-Resolution Rate, Credit Memo Accuracy, FCBA Compliance Rate, SOX Audit Completeness

Expected Impact: 60% reduction in average dispute resolution time (target: <5 business days), ≥90% straight-through processing for routine disputes, 100% SOX audit trail coverage, and $0 FCBA penalty exposure.

Compliance: FCBA (Fair Credit Billing Act), SOX Section 302/404, Revenue Recognition (ASC 606), GDPR Article 17 for customer data handling

Constraints: Credit memos above $10,000 require dual human approval. No retroactive GL adjustments beyond 90 days without CFO sign-off. All dispute decisions must be logged with reasoning for audit.

Error Handling: On ERP write failure, roll back credit memo and re-queue for retry (max 3 attempts). On SOX audit log failure, halt all downstream actions and alert AR Manager immediately. Escalate to human reviewer if confidence score < 0.80 on dispute classification.

Schedule: Event-driven — triggers on new dispute submission; daily batch reconciliation at 06:00 UTC`;

const D9_TASK_PROMPT = `Role: Autonomous AI agent responsible for high-volume cash application and AR reconciliation within the Order-to-Cash cycle. Processes remittance advice, matches inbound bank payments to open invoices, auto-posts matched cash to the GL, escalates exceptions for manual resolution, and produces daily reconciliation reports.

Goal: Achieve ≥95% straight-through cash application rate, eliminate unapplied cash backlog within 48 hours, maintain 100% GL accuracy on every posting, and produce SOX-compliant audit trails for all cash movements in accordance with period-end cutoff policies.

Workflow Steps:
1. Ingest remittance advice files (EDI 820, PDF, email) and parse payment details
2. Fetch bank statement and lockbox data for the processing period
3. Run payment-to-invoice matching engine using invoice number, amount, and customer identifiers
4. Detect and flag duplicate payments against prior posting history
5. Route matched payments to automated cash application; route exceptions and short-pays to exception queue
6. Post GL journal entries for all applied cash with correct period, cost center, and revenue account coding
7. Validate all postings against period cutoff — block postings to closed periods
8. Log all actions to SOX audit trail with full payment lineage
9. Generate daily reconciliation report: applied cash, unapplied cash, exception count, match rate
10. Update AR ledger to close fully paid invoices and flag partial payments
11. Send unapplied cash alert to AR team for any items unresolved after 24 hours

Available Tools: retrieve_kb, fetch_bank_statement, fetch_lockbox_data, parse_remittance_advice, match_payment_to_invoice, detect_duplicate_payment, detect_payment_exceptions, apply_cash_auto, queue_exception_for_review, post_gl_journal_entry, validate_period_cutoff, log_sox_audit_event, generate_reconciliation_report, update_ar_ledger, send_unapplied_cash_alert, flag_suspicious_payment_source

KPIs to optimize: Straight-Through Processing Rate, Unapplied Cash Balance, GL Posting Accuracy, Duplicate Payment Detection Rate, Exception Resolution Time

Expected Impact: ≥95% automated cash application rate (vs. industry benchmark 70%), unapplied cash balance reduced to <0.5% of monthly receipts, 100% GL posting accuracy, duplicate payments detected within same processing cycle, daily reconciliation report delivered by 08:00 UTC.

Compliance: SOX Section 302/404 (cash controls), Revenue Recognition (ASC 606 period cutoff), Bank Secrecy Act (suspicious payment flagging), GDPR Article 17 for remittance data retention

Constraints: GL postings to closed periods are hard-blocked. Payments flagged as suspicious must be escalated to Treasury before application. Duplicate payments must be held pending customer confirmation. No single agent action can exceed $500,000 without Treasury co-approval.

Error Handling: On GL posting failure, rollback and re-queue with error code (max 3 retries). On bank API timeout, mark batch as pending and retry next cycle. Flag any exception unresolved after 48 hours to AR Manager with full evidence package.

Schedule: Runs on remittance file arrival (event-driven); nightly batch at 05:00 UTC for prior-day bank statement reconciliation; period-end sweep on last business day of each month`;

async function patchAgentTask(agentId, label, prompt) {
  console.log(`\n📝 Patching ${label} (${agentId})...`);
  // First fetch current runtimeConfig to merge (not overwrite)
  const { data: agent } = await api("GET", `/api/agents/${agentId}`);
  const existingRc = (agent?.runtimeConfig || {});
  const merged = { ...existingRc, prompt };
  const result = await api("PATCH", `/api/agents/${agentId}`, { runtimeConfig: merged });
  if (!result.ok) {
    console.error(`  ❌ FAILED (${result.status}):`, JSON.stringify(result.data).substring(0, 300));
    return false;
  }
  const rc = result.data?.runtimeConfig || {};
  console.log(`  ✅ runtimeConfig.prompt: ${rc.prompt ? rc.prompt.length + " chars" : "MISSING"}`);
  console.log(`  ✅ Prompt preview: ${rc.prompt?.substring(0, 100)}...`);
  return !!rc.prompt;
}

async function main() {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`OTC Agent Task (runtimeConfig.prompt) Fix — ${BASE_URL}`);
  console.log(`${"=".repeat(60)}`);

  const { data: agents } = await api("GET", "/api/agents");
  const d8 = agents.find(a => a.name === "Dispute Resolution Agent" && a.department === "Finance");
  const d9 = agents.find(a => a.name === "Cash Application & Reconciliation Agent" && a.department === "Finance");
  if (!d8 || !d9) {
    console.error("❌ Could not find OTC agents by name.");
    process.exit(1);
  }

  const ok8 = await patchAgentTask(d8.id, "OTC-AGT-008 Dispute Resolution Agent", D8_TASK_PROMPT);
  const ok9 = await patchAgentTask(d9.id, "OTC-AGT-009 Cash Application & Reconciliation Agent", D9_TASK_PROMPT);

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Results: OTC-AGT-008: ${ok8 ? "✅ SUCCESS" : "❌ FAILED"} | OTC-AGT-009: ${ok9 ? "✅ SUCCESS" : "❌ FAILED"}`);
  console.log(`${"=".repeat(60)}\n`);
  process.exit(ok8 && ok9 ? 0 : 1);
}

main().catch(e => { console.error("Fatal:", e.message); process.exit(1); });
