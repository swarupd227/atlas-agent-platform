/**
 * fix-otc-agents-complete.mjs
 *
 * Comprehensive PATCH for OTC-AGT-008 and OTC-AGT-009 to fill every missing field:
 *   blueprintJson, toolsConfig, ontologyTags, policyBindings, evalBindings,
 *   memoryRagConfig, permissionsConfig, memoryGovernanceRules, maturityScore,
 *   costPerRun, rollbackPlan
 *
 * Usage:
 *   node scripts/fix-otc-agents-complete.mjs [BASE_URL]
 *   node scripts/fix-otc-agents-complete.mjs https://agent-lifecycle-management-platform.replit.app
 *
 * IDs are auto-resolved by querying the platform based on agent name + org.
 * For prod, supply the base URL as argument.
 */

const BASE_URL = process.argv[2] || "http://localhost:5000";

async function api(method, path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  try {
    return { ok: res.ok, status: res.status, data: JSON.parse(text) };
  } catch {
    return { ok: res.ok, status: res.status, data: text };
  }
}

async function resolveIds() {
  console.log(`\n🔍 Resolving agent, policy, and eval IDs from ${BASE_URL}...`);
  const { data: agents } = await api("GET", "/api/agents");
  const { data: policies } = await api("GET", "/api/policies");
  const { data: suites } = await api("GET", "/api/eval-suites");

  const d8 = agents.find(a => a.name === "Dispute Resolution Agent" && a.department === "Finance");
  const d9 = agents.find(a => a.name === "Cash Application & Reconciliation Agent" && a.department === "Finance");
  if (!d8 || !d9) throw new Error("Could not find OTC agents by name. Check the platform.");

  const d8Pols = (policies || []).filter(p => p.scopeId === d8.id).map(p => p.id);
  const d9Pols = (policies || []).filter(p => p.scopeId === d9.id).map(p => p.id);
  const d8Suites = (suites || []).filter(s => s.agentId === d8.id);
  const d9Suites = (suites || []).filter(s => s.agentId === d9.id);

  console.log(`✅ OTC-AGT-008 (Dispute): ${d8.id} | ${d8Pols.length} policies | ${d8Suites.length} eval suites`);
  console.log(`✅ OTC-AGT-009 (Cash):    ${d9.id} | ${d9Pols.length} policies | ${d9Suites.length} eval suites`);

  return { d8, d9, d8Pols, d9Pols, d8Suites, d9Suites };
}

// ─────────────────────────────────────────────────────────────────────────────
// OTC-AGT-008: Dispute Resolution Agent
// ─────────────────────────────────────────────────────────────────────────────
function buildDisputePayload(agentId, policyIds, evalSuites) {
  return {
    blueprintJson: {
      nodes: [
        { id: "dispute_intake",        type: "tool_call", label: "Dispute Intake & Triage" },
        { id: "document_extraction",   type: "tool_call", label: "Document Extraction & Indexing" },
        { id: "customer_history_rag",  type: "tool_call", label: "Customer History RAG Lookup" },
        { id: "contract_terms_rag",    type: "tool_call", label: "Contract & SLA Terms RAG" },
        { id: "classify_dispute",      type: "llm_plan",  label: "Dispute Classification Engine" },
        { id: "auto_resolution_check", type: "router",    label: "Auto-Resolution Eligibility Check" },
        { id: "credit_memo_gen",       type: "tool_call", label: "Credit Memo Generation" },
        { id: "manual_review_queue",   type: "tool_call", label: "Manual Review Escalation" },
        { id: "sox_policy_check",      type: "tool_call", label: "SOX Policy & Segregation Check" },
        { id: "sox_audit_log",         type: "tool_call", label: "SOX Audit Trail Logging" },
        { id: "resolution_notify",     type: "tool_call", label: "Resolution Notification Dispatch" },
        { id: "case_close_ar_update",  type: "tool_call", label: "Case Closure & AR Ledger Update" },
      ],
      edges: [
        { from: "dispute_intake",        to: "document_extraction" },
        { from: "document_extraction",   to: "customer_history_rag" },
        { from: "document_extraction",   to: "contract_terms_rag" },
        { from: "customer_history_rag",  to: "classify_dispute" },
        { from: "contract_terms_rag",    to: "classify_dispute" },
        { from: "classify_dispute",      to: "auto_resolution_check" },
        { from: "auto_resolution_check", to: "credit_memo_gen",     condition: "auto_eligible" },
        { from: "auto_resolution_check", to: "manual_review_queue", condition: "escalate" },
        { from: "credit_memo_gen",       to: "sox_policy_check" },
        { from: "manual_review_queue",   to: "sox_policy_check" },
        { from: "sox_policy_check",      to: "sox_audit_log" },
        { from: "sox_audit_log",         to: "resolution_notify" },
        { from: "resolution_notify",     to: "case_close_ar_update" },
      ],
    },
    toolsConfig: {
      mcpServers: [
        "erp-ar-mcp",
        "crm-mcp",
        "document-archive-mcp",
        "credit-memo-mcp",
        "collections-mcp",
        "sox-audit-mcp",
        "email-notification-mcp",
        "contract-kb-mcp",
      ],
      allowedTools: [
        "retrieve_kb",
        "ingest_dispute_document",
        "lookup_customer_account",
        "fetch_invoice_history",
        "search_contract_terms",
        "classify_dispute_reason",
        "check_auto_approval_threshold",
        "generate_credit_memo",
        "post_credit_memo_to_erp",
        "queue_for_manual_review",
        "enforce_segregation_of_duties",
        "log_sox_audit_event",
        "send_resolution_notification",
        "update_dispute_case_status",
        "close_ar_dispute",
      ],
      rateLimits: { erp_writes_per_min: 30, notifications_per_hour: 500 },
      timeoutMs: 30000,
    },
    ontologyTags: [
      { label: "Accounts Receivable Dispute Management", category: "Finance",    conceptId: "otc-001" },
      { label: "Credit Memo Processing",                 category: "Finance",    conceptId: "otc-002" },
      { label: "Invoice Reconciliation",                 category: "Finance",    conceptId: "otc-003" },
      { label: "Fair Credit Billing Act (FCBA)",         category: "Compliance", conceptId: "otc-004" },
      { label: "SOX Financial Controls",                 category: "Compliance", conceptId: "otc-005" },
      { label: "Dispute Root Cause Analytics",           category: "Analytics",  conceptId: "otc-006" },
    ],
    policyBindings: policyIds,
    evalBindings: [
      {
        evalSuiteId: evalSuites[0]?.id,
        schedule: "daily:06:00 UTC",
      },
      {
        evalSuiteId: evalSuites[1]?.id,
        schedule: "weekly:Monday:06:00 UTC",
      },
    ].filter(e => e.evalSuiteId),
    memoryRagConfig: {
      topK: 8,
      sources: [
        {
          type: "knowledge_base",
          description: "AR dispute KB: policy docs, FCBA guidelines, historical dispute decisions, credit memo templates, SOX audit requirements, customer contract terms, revenue recognition rules",
        },
      ],
      embeddingModel: "text-embedding-3-large",
      rerankEnabled: true,
    },
    permissionsConfig: {
      apiAccess: [
        "erp_ar_api",
        "crm_api",
        "credit_memo_api",
        "sox_audit_api",
        "document_archive_api",
        "email_notification_api",
        "contract_repository_api",
        "collections_system_api",
      ],
      dataAccess: [
        "accounts_receivable_ledger",
        "customer_master_data",
        "invoice_history",
        "contract_repository",
        "credit_memo_register",
        "sox_audit_log",
        "dispute_case_management",
        "revenue_recognition_schedule",
      ],
      writeScopes: ["credit_memo_register", "dispute_case_management", "ar_ledger_adjustments"],
      readOnlyScopes: ["customer_master_data", "contract_repository"],
    },
    memoryGovernanceRules: [
      {
        memoryType: "episodic",
        retentionDays: 2555,
        encrypted: true,
        classification: "financial_records",
        accessControl: "AR-team-only",
        deletionPolicy: "case_close + 7 years",
      },
      {
        memoryType: "working",
        retentionDays: 1,
        encrypted: true,
        classification: "confidential",
        accessControl: "Session-only",
        deletionPolicy: "session_end",
      },
      {
        memoryType: "semantic",
        retentionDays: 365,
        encrypted: true,
        classification: "internal",
        accessControl: "Finance-department",
        deletionPolicy: "annual_review",
      },
    ],
    rollbackPlan: {
      version: "1.0.0",
      runbook: "See Runbook RB-OTC-008-006: Production Incident Escalation",
      procedure: "Suspend auto-credit-memo issuance, route all disputes to manual review queue, notify AR Manager and Compliance Officer, restore prior agent version from git tag v1.0.0.",
    },
    maturityScore: 76,
    costPerRun: 0.092,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// OTC-AGT-009: Cash Application & Reconciliation Agent
// ─────────────────────────────────────────────────────────────────────────────
function buildCashPayload(agentId, policyIds, evalSuites) {
  return {
    blueprintJson: {
      nodes: [
        { id: "remittance_intake",    type: "tool_call", label: "Remittance Advice Intake & Parsing" },
        { id: "bank_stmt_fetch",      type: "tool_call", label: "Bank Statement & Lockbox Fetch" },
        { id: "payment_matching",     type: "tool_call", label: "Payment-to-Invoice Matching Engine" },
        { id: "exception_detection",  type: "router",    label: "Exception & Discrepancy Detection" },
        { id: "auto_apply_cash",      type: "tool_call", label: "Automated Cash Application" },
        { id: "exception_queue",      type: "tool_call", label: "Exception Queue & Manual Review" },
        { id: "duplicate_check",      type: "tool_call", label: "Duplicate Payment Detection" },
        { id: "gl_journal_posting",   type: "tool_call", label: "GL Journal Entry Posting" },
        { id: "period_cutoff_check",  type: "tool_call", label: "Period Cutoff Validation" },
        { id: "sox_audit_log",        type: "tool_call", label: "SOX Audit Trail Logging" },
        { id: "reconciliation_rpt",   type: "tool_call", label: "Reconciliation Report Generation" },
        { id: "ar_ledger_update",     type: "tool_call", label: "AR Ledger Update & Invoice Closure" },
      ],
      edges: [
        { from: "remittance_intake",   to: "payment_matching" },
        { from: "bank_stmt_fetch",     to: "payment_matching" },
        { from: "payment_matching",    to: "duplicate_check" },
        { from: "duplicate_check",     to: "exception_detection" },
        { from: "exception_detection", to: "auto_apply_cash",  condition: "matched" },
        { from: "exception_detection", to: "exception_queue",  condition: "exception" },
        { from: "auto_apply_cash",     to: "gl_journal_posting" },
        { from: "exception_queue",     to: "gl_journal_posting" },
        { from: "gl_journal_posting",  to: "period_cutoff_check" },
        { from: "period_cutoff_check", to: "sox_audit_log" },
        { from: "sox_audit_log",       to: "reconciliation_rpt" },
        { from: "reconciliation_rpt",  to: "ar_ledger_update" },
      ],
    },
    toolsConfig: {
      mcpServers: [
        "bank-lockbox-mcp",
        "erp-ar-mcp",
        "treasury-mcp",
        "remittance-parser-mcp",
        "gl-posting-mcp",
        "sox-audit-mcp",
        "reporting-mcp",
        "email-notification-mcp",
        "fraud-detection-mcp",
      ],
      allowedTools: [
        "retrieve_kb",
        "fetch_bank_statement",
        "fetch_lockbox_data",
        "parse_remittance_advice",
        "match_payment_to_invoice",
        "detect_duplicate_payment",
        "detect_payment_exceptions",
        "apply_cash_auto",
        "queue_exception_for_review",
        "post_gl_journal_entry",
        "validate_period_cutoff",
        "log_sox_audit_event",
        "generate_reconciliation_report",
        "update_ar_ledger",
        "send_unapplied_cash_alert",
        "flag_suspicious_payment_source",
      ],
      rateLimits: { gl_writes_per_min: 60, bank_api_calls_per_min: 20 },
      timeoutMs: 45000,
    },
    ontologyTags: [
      { label: "Cash Application & Remittance Processing", category: "Finance",    conceptId: "otc-007" },
      { label: "Bank Reconciliation",                      category: "Finance",    conceptId: "otc-008" },
      { label: "General Ledger Journal Posting",           category: "Finance",    conceptId: "otc-009" },
      { label: "SOX Internal Controls — Cash",             category: "Compliance", conceptId: "otc-010" },
      { label: "Unapplied Cash Management",                category: "Finance",    conceptId: "otc-011" },
      { label: "Revenue Recognition Controls",             category: "Compliance", conceptId: "otc-012" },
    ],
    policyBindings: policyIds,
    evalBindings: [
      {
        evalSuiteId: evalSuites[0]?.id,
        schedule: "daily:05:00 UTC",
      },
      {
        evalSuiteId: evalSuites[1]?.id,
        schedule: "weekly:Monday:05:00 UTC",
      },
    ].filter(e => e.evalSuiteId),
    memoryRagConfig: {
      topK: 10,
      sources: [
        {
          type: "knowledge_base",
          description: "Cash application KB: ERP posting rules, bank statement formats, remittance advice parsing guides, GL chart of accounts, SOX cash controls, revenue cutoff policies, period-end close procedures, unapplied cash SLAs, duplicate payment detection thresholds",
        },
      ],
      embeddingModel: "text-embedding-3-large",
      rerankEnabled: true,
    },
    permissionsConfig: {
      apiAccess: [
        "bank_lockbox_api",
        "treasury_management_api",
        "erp_gl_api",
        "erp_ar_api",
        "remittance_parser_api",
        "sox_audit_api",
        "fraud_detection_api",
        "email_notification_api",
      ],
      dataAccess: [
        "bank_statement_feed",
        "lockbox_payment_data",
        "remittance_advice_repository",
        "accounts_receivable_ledger",
        "gl_chart_of_accounts",
        "sox_audit_log",
        "unapplied_cash_register",
        "customer_payment_history",
      ],
      writeScopes: ["gl_journal_entries", "ar_ledger_postings", "unapplied_cash_register"],
      readOnlyScopes: ["bank_statement_feed", "customer_payment_history"],
    },
    memoryGovernanceRules: [
      {
        memoryType: "episodic",
        retentionDays: 2555,
        encrypted: true,
        classification: "financial_records",
        accessControl: "Finance-AR-team-only",
        deletionPolicy: "period_close + 7 years",
      },
      {
        memoryType: "working",
        retentionDays: 1,
        encrypted: true,
        classification: "confidential",
        accessControl: "Session-only",
        deletionPolicy: "session_end",
      },
      {
        memoryType: "semantic",
        retentionDays: 365,
        encrypted: true,
        classification: "internal",
        accessControl: "Finance-department",
        deletionPolicy: "annual_review",
      },
    ],
    rollbackPlan: {
      version: "1.0.0",
      runbook: "See Runbook RB-OTC-009-006: Production Incident Escalation",
      procedure: "Halt automated GL postings, suspend cash application, route all payments to manual hold queue, notify Treasury Manager and Compliance Officer, restore prior agent version from git tag v1.0.0.",
    },
    maturityScore: 74,
    costPerRun: 0.11,
  };
}

async function patchAgent(agentId, name, payload) {
  console.log(`\n📝 Patching ${name} (${agentId})...`);
  const result = await api("PATCH", `/api/agents/${agentId}`, payload);
  if (!result.ok) {
    console.error(`  ❌ FAILED (${result.status}):`, JSON.stringify(result.data).substring(0, 300));
    return false;
  }
  const a = result.data;
  console.log(`  ✅ blueprintJson nodes: ${a.blueprintJson?.nodes?.length ?? 0}`);
  console.log(`  ✅ toolsConfig mcpServers: ${a.toolsConfig?.mcpServers?.length ?? 0}`);
  console.log(`  ✅ ontologyTags: ${a.ontologyTags?.length ?? 0}`);
  console.log(`  ✅ policyBindings: ${a.policyBindings?.length ?? 0}`);
  console.log(`  ✅ evalBindings: ${a.evalBindings?.length ?? 0}`);
  console.log(`  ✅ memoryRagConfig: ${a.memoryRagConfig ? "set" : "null"}`);
  console.log(`  ✅ permissionsConfig: ${a.permissionsConfig ? "set" : "null"}`);
  console.log(`  ✅ memoryGovernanceRules: ${a.memoryGovernanceRules?.length ?? 0}`);
  console.log(`  ✅ maturityScore: ${a.maturityScore}`);
  console.log(`  ✅ costPerRun: ${a.costPerRun}`);
  console.log(`  ✅ rollbackPlan: ${a.rollbackPlan ? "set" : "null"}`);
  return true;
}

async function main() {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`OTC Agent Complete Fix — ${BASE_URL}`);
  console.log(`${"=".repeat(60)}`);

  const { d8, d9, d8Pols, d9Pols, d8Suites, d9Suites } = await resolveIds();

  const d8ok = await patchAgent(
    d8.id,
    "OTC-AGT-008 Dispute Resolution Agent",
    buildDisputePayload(d8.id, d8Pols, d8Suites)
  );

  const d9ok = await patchAgent(
    d9.id,
    "OTC-AGT-009 Cash Application & Reconciliation Agent",
    buildCashPayload(d9.id, d9Pols, d9Suites)
  );

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Results: OTC-AGT-008: ${d8ok ? "✅ SUCCESS" : "❌ FAILED"} | OTC-AGT-009: ${d9ok ? "✅ SUCCESS" : "❌ FAILED"}`);
  console.log(`${"=".repeat(60)}\n`);
  process.exit(d8ok && d9ok ? 0 : 1);
}

main().catch(e => { console.error("Fatal:", e.message); process.exit(1); });
