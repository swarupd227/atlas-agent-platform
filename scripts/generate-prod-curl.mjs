/**
 * generate-prod-curl.mjs
 * Generates a self-contained bash script (prod-migration.sh) that recreates
 * both OTC agents and all associated platform intelligence on a production target
 * via authenticated REST API calls.
 *
 * Usage:
 *   node scripts/generate-prod-curl.mjs <PROD_BASE_URL> [API_TOKEN]
 *
 * The generated script captures every created ID and uses them in subsequent calls
 * (e.g. skills → agents, agents → runbooks/policies/evals).
 *
 * Example:
 *   node scripts/generate-prod-curl.mjs https://atlas.example.com Bearer_abc123
 */

const PROD_URL = process.argv[2] || "https://YOUR_PROD_URL_HERE";
const TOKEN    = process.argv[3] || "";

const AUTH_HEADER = TOKEN ? `-H "Authorization: ${TOKEN}"` : "";

function curl(method, path, bodyVar) {
  const body = bodyVar ? `-d "$${bodyVar}"` : "";
  return `curl -fsS -X ${method} "${PROD_URL}${path}" \\
  -H "Content-Type: application/json" ${AUTH_HEADER} \\
  ${body}`.replace(/\s+\\s+/g, " \\\n  ").trim();
}

function jsonVar(name, obj) {
  return `${name}='${JSON.stringify(obj).replace(/'/g, "'\\''")}'`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Build skill payloads
// ─────────────────────────────────────────────────────────────────────────────

const disputeSkills = [
  {
    name: "Dispute Classification Skill",
    description: "NLP-based classification of billing and order disputes from customer communications, deduction codes, and payment remittances. Identifies dispute type and assigns priority and routing destination based on classification rules and historical patterns.",
    industry: "enterprise", domain: "Order-to-Cash", version: "1.0.0",
    author: "ATLAS Platform Team", trustTier: "platform-provided", complexity: "intermediate", status: "active",
    tags: ["dispute", "classification", "NLP", "order-to-cash", "deduction"],
    agentTypeCompatibility: ["single", "team"],
    markdownBody: "# Dispute Classification Skill\n\nClassifies incoming disputes into standard categories using NLP analysis of customer communications, deduction codes, and remittance data.\n\n## Categories: Pricing Error, Quantity Discrepancy, Quality Issue, Duplicate Invoice, Unauthorized Deduction, Early Pay Discount\n\n## Output: { classification, confidence, priority, routing, deductionCode, reasoning }",
    allowedTools: ["search_dispute_records", "query_deduction_code_library", "fetch_customer_communication"],
    contextMode: "inline", userInvocable: false,
  },
  {
    name: "Root Cause Analysis Skill",
    description: "Automated cross-referencing of order, fulfillment, and billing records to identify the root cause of a dispute.",
    industry: "enterprise", domain: "Order-to-Cash", version: "1.0.0",
    author: "ATLAS Platform Team", trustTier: "platform-provided", complexity: "advanced", status: "active",
    tags: ["root-cause", "analysis", "dispute", "ERP"],
    agentTypeCompatibility: ["single", "team"],
    markdownBody: "# Root Cause Analysis Skill\n\nInvestigates dispute root causes by cross-referencing OMS, WMS, and billing systems.\n\n## Root Cause Categories: Price master mismatch, Short shipment, Duplicate billing run, Contract not loaded, Unauthorized deduction\n\n## Output: { rootCause, evidenceItems, systemOfOrigin, recurrenceRisk, recommendedFix, affectedInvoices }",
    allowedTools: ["query_order_records", "query_fulfillment_records", "query_invoice_records", "query_contract_terms"],
    contextMode: "inline", userInvocable: false,
  },
  {
    name: "Evidence Gathering Skill",
    description: "Retrieves and assembles relevant documentation from ERP, WMS, contract management, and CRM to support dispute investigation.",
    industry: "enterprise", domain: "Order-to-Cash", version: "1.0.0",
    author: "ATLAS Platform Team", trustTier: "platform-provided", complexity: "intermediate", status: "active",
    tags: ["evidence", "document-retrieval", "dispute", "POD"],
    agentTypeCompatibility: ["single", "team"],
    markdownBody: "# Evidence Gathering Skill\n\nRetrieves PO, invoice, POD, packing slip, BOL, contract, customer communications, and inspection reports to support dispute investigation.\n\n## Output: { evidenceBundle: { documents, missingDocuments, completenessScore } }",
    allowedTools: ["fetch_purchase_order", "fetch_invoice", "fetch_proof_of_delivery", "fetch_contract_terms"],
    contextMode: "inline", userInvocable: false,
  },
  {
    name: "Resolution Recommendation Skill",
    description: "Proposes optimal dispute resolutions based on evidence, company policy, and customer tier. Generates credit memos, rebills, or rejections with approval routing.",
    industry: "enterprise", domain: "Order-to-Cash", version: "1.0.0",
    author: "ATLAS Platform Team", trustTier: "platform-provided", complexity: "advanced", status: "active",
    tags: ["resolution", "credit-memo", "dispute", "recommendation"],
    agentTypeCompatibility: ["single", "team"],
    markdownBody: "# Resolution Recommendation Skill\n\nGenerates evidence-based resolutions with approval routing based on value and policy.\n\n## Resolution Types: Full Credit, Partial Credit, Rebill, Write-off, Reject, Goodwill Credit\n\n## Approval Thresholds: ≤$500 auto; >$5K supervisor; >$25K director; >$50K VP\n\n## Output: { recommendation, amount, currency, approvalRequired, approvalLevel, rationale, draftDocument }",
    allowedTools: ["query_resolution_policy", "query_customer_tier", "generate_credit_memo_draft"],
    contextMode: "inline", userInvocable: false,
  },
  {
    name: "Customer Communication Skill",
    description: "Generates professional dispute acknowledgment, status, and resolution communications within SLA windows.",
    industry: "enterprise", domain: "Order-to-Cash", version: "1.0.0",
    author: "ATLAS Platform Team", trustTier: "platform-provided", complexity: "basic", status: "active",
    tags: ["communication", "customer", "dispute", "SLA"],
    agentTypeCompatibility: ["single", "team"],
    markdownBody: "# Customer Communication Skill\n\nGenerates timely dispute communications: acknowledgment (24h SLA), investigation updates, resolution notices, rejection notices with evidence, and escalation notices.\n\n## Output: { communicationType, recipient, subject, body, attachments, slaDeadline }",
    allowedTools: ["fetch_customer_contact", "fetch_communication_templates", "send_email"],
    contextMode: "inline", userInvocable: false,
  },
  {
    name: "Prevention Analytics Skill",
    description: "Identifies systemic dispute patterns and generates prevention recommendations targeting high-frequency dispute drivers.",
    industry: "enterprise", domain: "Order-to-Cash", version: "1.0.0",
    author: "ATLAS Platform Team", trustTier: "platform-provided", complexity: "advanced", status: "active",
    tags: ["analytics", "prevention", "dispute-pattern"],
    agentTypeCompatibility: ["single", "team"],
    markdownBody: "# Prevention Analytics Skill\n\nAnalyzes aggregate dispute patterns to identify systemic failures and generate prevention recommendations.\n\n## Analysis: Dispute rate trends, root cause concentration, customer/SKU clustering, anomaly detection\n\n## Output: { analysisWindow, topPatterns, systemicIssueAlerts, preventionROI }",
    allowedTools: ["query_dispute_history", "query_dispute_analytics", "generate_prevention_report"],
    contextMode: "inline", userInvocable: false,
  },
];

const cashAppSkills = [
  {
    name: "Remittance Parsing Skill",
    description: "OCR and NLP extraction of payment remittance data from EDI 820, PDF, email, and check stubs. Handles multi-format inputs with confidence scoring.",
    industry: "enterprise", domain: "Order-to-Cash", version: "1.0.0",
    author: "ATLAS Platform Team", trustTier: "platform-provided", complexity: "advanced", status: "active",
    tags: ["remittance", "parsing", "EDI", "OCR", "NLP", "cash-application"],
    agentTypeCompatibility: ["single", "team"],
    markdownBody: "# Remittance Parsing Skill\n\nExtracts structured remittance data from EDI 820 (99%+), BAI2/SWIFT (97-99%), PDF (85-95%), email (75-90%), check stubs (70-85%).\n\n## Output: { payerId, paymentRef, paymentDate, totalAmount, lineItems, parserConfidence, unresolvableItems }",
    allowedTools: ["parse_edi_820", "run_ocr_extraction", "extract_nlp_remittance"],
    contextMode: "inline", userInvocable: false,
  },
  {
    name: "Intelligent Matching Skill",
    description: "Multi-factor invoice matching engine achieving ≥90% auto-match rate. Handles partial, consolidated, cross-currency, and deduction scenarios.",
    industry: "enterprise", domain: "Order-to-Cash", version: "1.0.0",
    author: "ATLAS Platform Team", trustTier: "platform-provided", complexity: "advanced", status: "active",
    tags: ["matching", "cash-application", "invoice", "AR"],
    agentTypeCompatibility: ["single", "team"],
    markdownBody: "# Intelligent Matching Skill\n\nMulti-factor match: invoice reference (40%), amount (25%), customer ID (20%), date proximity (10%), history (5%).\n\n## Match Types: Exact ≥0.95 auto, High 0.80-0.94 auto+notify, Suggested 0.60-0.79 confirm, Low <0.60 manual\n\n## Tolerances: ≤$1 write-off; $1-5 small balance; >$5 partial payment",
    allowedTools: ["query_open_invoices", "apply_payment_to_invoice", "query_fx_rates"],
    contextMode: "inline", userInvocable: false,
  },
  {
    name: "Deduction Coding Skill",
    description: "Classifies payment deductions against the deduction code library. Validates legitimacy and routes invalid deductions to dispute workflow.",
    industry: "enterprise", domain: "Order-to-Cash", version: "1.0.0",
    author: "ATLAS Platform Team", trustTier: "platform-provided", complexity: "intermediate", status: "active",
    tags: ["deduction", "coding", "trade-promotion", "cash-application"],
    agentTypeCompatibility: ["single", "team"],
    markdownBody: "# Deduction Coding Skill\n\nValidates trade promotions (vs. promotion schedule), early pay discounts (vs. payment terms), freight/shortage (vs. POD and contract), and co-op advertising (vs. agreement).\n\n## Output: { deductionCode, validity, validAmount, invalidAmount, offsetAccount, disputeCreated }",
    allowedTools: ["query_deduction_code_library", "query_trade_promotion_schedule", "create_dispute_record"],
    contextMode: "inline", userInvocable: false,
  },
  {
    name: "Bank Reconciliation Skill",
    description: "Automated bank statement to AR cash receipt matching with SOX-compliant reconciliation reporting.",
    industry: "enterprise", domain: "Order-to-Cash", version: "1.0.0",
    author: "ATLAS Platform Team", trustTier: "platform-provided", complexity: "advanced", status: "active",
    tags: ["bank-reconciliation", "SOX", "audit", "order-to-cash"],
    agentTypeCompatibility: ["single", "team"],
    markdownBody: "# Bank Reconciliation Skill\n\nMatches bank statement (BAI2/MT940) to ERP cash receipts. Categorizes: timing differences, unrecorded items, duplicates, amount variances.\n\n## SOX: Complete within 2 business days; variances >$100 documented; controller approval required\n\n## Output: { bankEndingBalance, erpCashBalance, variance, reconciledStatus, timingDifferences, exceptions }",
    allowedTools: ["fetch_bank_statement", "query_erp_cash_receipts", "post_journal_entry"],
    contextMode: "inline", userInvocable: false,
  },
  {
    name: "Exception Prioritization Skill",
    description: "Ranks unmatched payment queue using amount, customer tier, aging, period-end proximity, and deduction risk scoring.",
    industry: "enterprise", domain: "Order-to-Cash", version: "1.0.0",
    author: "ATLAS Platform Team", trustTier: "platform-provided", complexity: "intermediate", status: "active",
    tags: ["exception", "prioritization", "cash-application", "queue-management"],
    agentTypeCompatibility: ["single", "team"],
    markdownBody: "# Exception Prioritization Skill\n\nScoring: Amount (35%), Customer Tier (25%), Days Unmatched (20%), Period-End Proximity (15%), Deduction Risk (5%).\n\n## Escalation: Score ≥85 to supervisor; >$500K to treasury manager\n\n## Output: { prioritizedQueue: [{ paymentRef, amount, priorityScore, urgency, suggestedMatches, recommendedAction }] }",
    allowedTools: ["query_unmatched_payments", "query_customer_tier", "notify_supervisor"],
    contextMode: "inline", userInvocable: false,
  },
  {
    name: "Cash Position Reporting Skill",
    description: "Generates real-time and forecasted cash position reports for treasury and FP&A.",
    industry: "enterprise", domain: "Order-to-Cash", version: "1.0.0",
    author: "ATLAS Platform Team", trustTier: "platform-provided", complexity: "intermediate", status: "active",
    tags: ["cash-position", "reporting", "treasury", "forecasting"],
    agentTypeCompatibility: ["single", "team"],
    markdownBody: "# Cash Position Reporting Skill\n\nReports: Daily Cash Position (7 AM), AR Balance Confirmation (EOD), Weekly Cash Forecast (Monday), Period-End Close Report, Intraday Liquidity Snapshot.\n\n## 7-day forecast with 90% confidence interval based on open AR, historical patterns, and payment commitments\n\n## Output: { reportType, asOf, bankBalance, postedCashToday, unappliedCash, openAR, forecast7Day, agingBuckets }",
    allowedTools: ["fetch_bank_balance", "query_erp_ar_balance", "query_payment_forecasts"],
    contextMode: "inline", userInvocable: false,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Build agent system prompts (abbreviated for curl script — full prompts in mjs)
// ─────────────────────────────────────────────────────────────────────────────

const disputeSystemPrompt = `You are the Dispute Resolution Agent (OTC-AGT-008) for the Order-to-Cash platform. Manage the full lifecycle of billing and order disputes from intake through resolution and prevention analytics.

Workflow: Receive & Register → Classify → Gather Evidence → Root Cause Analysis → Resolution Recommendation → Approval Gate (if > threshold) → Execute Resolution → Communicate → Update Records → Prevention Feed.

Auto-approve thresholds: ≤$500 credit memos. Supervisor > $5K. Director > $25K. VP > $50K. Write-offs always require manager minimum.

Compliance: SOX audit trail, FCBA B2C timelines (30-day acknowledge, 90-day resolve), revenue recognition, 7-year retention.

Escalation: >$50K immediate VP notification; >30 days open → manager; >60 days → director; >90 days → VP and Legal.`;

const cashSystemPrompt = `You are the Cash Application & Reconciliation Agent (OTC-AGT-009) for the Order-to-Cash platform. Automate the complete cash application cycle achieving ≥90% auto-match rate.

Workflow: Ingest → Parse Remittance → Intelligent Matching → Deduction Coding → Apply Cash → Exception Queue → Bank Reconciliation → Reporting → Period Close.

Match thresholds: ≥0.95 auto-apply; 0.80-0.94 auto+notify; 0.60-0.79 confirm; <0.60 manual review.

SOX: Complete reconciliations within 2 business days; controller approval required; 7-year retention. Daily cash position report by 7 AM. AR balance confirmation by 6 PM daily.`;

// ─────────────────────────────────────────────────────────────────────────────
// Generate the bash script
// ─────────────────────────────────────────────────────────────────────────────

function generateScript() {
  const lines = [];

  lines.push(`#!/usr/bin/env bash`);
  lines.push(`# ============================================================`);
  lines.push(`# OTC Agent Production Migration Script`);
  lines.push(`# Generated: ${new Date().toISOString()}`);
  lines.push(`# Target:    ${PROD_URL}`);
  lines.push(`# ============================================================`);
  lines.push(`set -euo pipefail`);
  lines.push(``);
  lines.push(`PROD="${PROD_URL}"`);
  lines.push(`HDR='-H "Content-Type: application/json"'`);
  lines.push(TOKEN ? `AUTH='-H "Authorization: ${TOKEN}"'` : `# AUTH='-H "Authorization: <token>"'  # Uncomment and set token if required`);
  lines.push(``);
  lines.push(`echo "=== OTC Agent Production Migration ==="`);
  lines.push(`echo "Target: $PROD"`);
  lines.push(``);

  // ─── Phase 1: Dispute Resolution Skills ──────────────────────────────────
  lines.push(`echo ""`);
  lines.push(`echo "[Phase 1] Creating OTC-AGT-008 Dispute Resolution Skills..."`);
  lines.push(``);

  for (let i = 0; i < disputeSkills.length; i++) {
    const sk = disputeSkills[i];
    const varName = `DISPUTE_SKILL_BODY_${i}`;
    const idVar = `DISPUTE_SKILL_ID_${i}`;
    lines.push(`${varName}='${JSON.stringify(sk).replace(/'/g, "'\\''")}'`);
    lines.push(`${idVar}=$(curl -fsS -X POST "$PROD/api/skills" -H "Content-Type: application/json" ${TOKEN ? `-H "Authorization: ${TOKEN}"` : ""} -d "$${varName}" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")`);
    lines.push(`echo "  Skill ${i + 1}/${disputeSkills.length}: ${sk.name} -> $${idVar}"`);
    lines.push(``);
  }

  lines.push(`DISPUTE_SKILL_IDS="[$DISPUTE_SKILL_ID_0,$DISPUTE_SKILL_ID_1,$DISPUTE_SKILL_ID_2,$DISPUTE_SKILL_ID_3,$DISPUTE_SKILL_ID_4,$DISPUTE_SKILL_ID_5]"`);
  lines.push(``);

  // ─── Phase 2: Cash Application Skills ───────────────────────────────────
  lines.push(`echo "[Phase 2] Creating OTC-AGT-009 Cash Application Skills..."`);
  lines.push(``);

  for (let i = 0; i < cashAppSkills.length; i++) {
    const sk = cashAppSkills[i];
    const varName = `CASH_SKILL_BODY_${i}`;
    const idVar = `CASH_SKILL_ID_${i}`;
    lines.push(`${varName}='${JSON.stringify(sk).replace(/'/g, "'\\''")}'`);
    lines.push(`${idVar}=$(curl -fsS -X POST "$PROD/api/skills" -H "Content-Type: application/json" ${TOKEN ? `-H "Authorization: ${TOKEN}"` : ""} -d "$${varName}" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")`);
    lines.push(`echo "  Skill ${i + 1}/${cashAppSkills.length}: ${sk.name} -> $${idVar}"`);
    lines.push(``);
  }

  lines.push(`CASH_SKILL_IDS="[$CASH_SKILL_ID_0,$CASH_SKILL_ID_1,$CASH_SKILL_ID_2,$CASH_SKILL_ID_3,$CASH_SKILL_ID_4,$CASH_SKILL_ID_5]"`);
  lines.push(``);

  // ─── Phase 3a: Dispute Resolution Agent ─────────────────────────────────
  lines.push(`echo "[Phase 3a] Creating OTC-AGT-008 Dispute Resolution Agent..."`);
  lines.push(``);

  // Build the preloadedSkills JSON dynamically in bash
  lines.push(`DISPUTE_PRELOADED_SKILLS='[{"skillId":"'$DISPUTE_SKILL_ID_0'","loadOrder":0},{"skillId":"'$DISPUTE_SKILL_ID_1'","loadOrder":1},{"skillId":"'$DISPUTE_SKILL_ID_2'","loadOrder":2},{"skillId":"'$DISPUTE_SKILL_ID_3'","loadOrder":3},{"skillId":"'$DISPUTE_SKILL_ID_4'","loadOrder":4},{"skillId":"'$DISPUTE_SKILL_ID_5'","loadOrder":5}]'`);

  const disputeAgentBase = {
    name: "Dispute Resolution Agent",
    agentType: "single",
    description: "Manages the full lifecycle of billing and order disputes from intake through resolution. Classifies disputes, performs automated root cause analysis, proposes resolutions, coordinates across departments, and ensures timely closure.",
    owner: "Order-to-Cash — Accounts Receivable",
    department: "Finance",
    status: "active",
    environment: "production",
    riskTier: "HIGH",
    autonomyMode: "supervised",
    modelProvider: "anthropic",
    modelName: "claude-opus-4-5",
    currentVersion: "1.0.0",
    systemPrompt: disputeSystemPrompt,
    complianceTags: ["SOX", "FCBA", "REVENUE_RECOGNITION", "DATA_RETENTION"],
    toolAccessClass: "standard",
    maxToolIterations: 10,
    healthScore: 98,
    successRate: 0.96,
    avgLatencyMs: 8500,
    runtimeConfig: { agentId: "OTC-AGT-008", domain: "Order-to-Cash", subdomain: "Dispute-Management" },
  };
  lines.push(`DISPUTE_AGENT_BASE='${JSON.stringify(disputeAgentBase).replace(/'/g, "'\\''")}'`);
  lines.push(`DISPUTE_AGENT_BODY=$(echo "$DISPUTE_AGENT_BASE" | python3 -c "import sys,json; d=json.load(sys.stdin); d['preloadedSkills']=[{'skillId':s,'loadOrder':i} for i,s in enumerate('''$DISPUTE_SKILL_ID_0 $DISPUTE_SKILL_ID_1 $DISPUTE_SKILL_ID_2 $DISPUTE_SKILL_ID_3 $DISPUTE_SKILL_ID_4 $DISPUTE_SKILL_ID_5'''.split())]; print(json.dumps(d))")`);
  lines.push(`DISPUTE_AGENT_ID=$(curl -fsS -X POST "$PROD/api/agents" -H "Content-Type: application/json" ${TOKEN ? `-H "Authorization: ${TOKEN}"` : ""} -d "$DISPUTE_AGENT_BODY" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")`);
  lines.push(`echo "  Dispute Resolution Agent -> $DISPUTE_AGENT_ID"`);
  lines.push(``);

  // ─── Phase 3b: Cash Application Agent ───────────────────────────────────
  lines.push(`echo "[Phase 3b] Creating OTC-AGT-009 Cash Application Agent..."`);
  lines.push(``);

  const cashAgentBase = {
    name: "Cash Application & Reconciliation Agent",
    agentType: "single",
    description: "Automates the matching of incoming payments to open invoices using remittance data, bank statements, and intelligent matching algorithms. Handles partial payments, consolidated payments, and deductions. Reconciles bank accounts and ensures accurate AR balances.",
    owner: "Order-to-Cash — Cash Management",
    department: "Finance",
    status: "active",
    environment: "production",
    riskTier: "HIGH",
    autonomyMode: "supervised",
    modelProvider: "anthropic",
    modelName: "claude-opus-4-5",
    currentVersion: "1.0.0",
    systemPrompt: cashSystemPrompt,
    complianceTags: ["SOX", "BANKING_REGULATIONS", "REVENUE_RECOGNITION", "ANTI_FRAUD", "DATA_RETENTION"],
    toolAccessClass: "standard",
    maxToolIterations: 12,
    healthScore: 97,
    successRate: 0.94,
    avgLatencyMs: 6200,
    runtimeConfig: { agentId: "OTC-AGT-009", domain: "Order-to-Cash", subdomain: "Cash-Application" },
  };
  lines.push(`CASH_AGENT_BASE='${JSON.stringify(cashAgentBase).replace(/'/g, "'\\''")}'`);
  lines.push(`CASH_AGENT_BODY=$(echo "$CASH_AGENT_BASE" | python3 -c "import sys,json; d=json.load(sys.stdin); d['preloadedSkills']=[{'skillId':s,'loadOrder':i} for i,s in enumerate('''$CASH_SKILL_ID_0 $CASH_SKILL_ID_1 $CASH_SKILL_ID_2 $CASH_SKILL_ID_3 $CASH_SKILL_ID_4 $CASH_SKILL_ID_5'''.split())]; print(json.dumps(d))")`);
  lines.push(`CASH_AGENT_ID=$(curl -fsS -X POST "$PROD/api/agents" -H "Content-Type: application/json" ${TOKEN ? `-H "Authorization: ${TOKEN}"` : ""} -d "$CASH_AGENT_BODY" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")`);
  lines.push(`echo "  Cash Application Agent -> $CASH_AGENT_ID"`);
  lines.push(``);

  // ─── Phase 4: Runbooks (abbreviated payload helpers) ────────────────────
  lines.push(`echo "[Phase 4] Creating Runbooks..."`);
  lines.push(``);

  const disputeRunbooks = [
    { name: "Dispute Volume Spike Response", description: "Triage procedure for unexpected surge in dispute volume.", category: "incident_response", severity: "high", autonomyLevel: "confirm_before" },
    { name: "High-Value Dispute Escalation", description: "Procedure for managing disputes exceeding $50,000.", category: "escalation", severity: "critical", autonomyLevel: "confirm_before" },
    { name: "Duplicate Dispute Detection and Merge", description: "Identification and merging of duplicate dispute submissions for the same claim.", category: "operational", severity: "low", autonomyLevel: "autonomous" },
    { name: "Aging Dispute Alert and Escalation", description: "Escalation path for disputes approaching or exceeding SLA thresholds.", category: "escalation", severity: "medium", autonomyLevel: "confirm_before" },
    { name: "Systematic Error Pattern Investigation", description: "Root cause investigation when 5+ disputes share the same root cause in 30 days.", category: "incident_response", severity: "high", autonomyLevel: "confirm_before" },
    { name: "Customer Relationship at Risk Protocol", description: "Priority handling for high-value customer disputes where relationship is at risk.", category: "escalation", severity: "high", autonomyLevel: "confirm_before" },
  ];

  for (const rb of disputeRunbooks) {
    const body = { ...rb, industry: "enterprise", triggerType: "threshold", status: "active", estimatedDuration: "1-4 hours" };
    lines.push(`curl -fsS -X POST "$PROD/api/runbooks" -H "Content-Type: application/json" ${TOKEN ? `-H "Authorization: ${TOKEN}"` : ""} \\`);
    lines.push(`  -d "$(echo '${JSON.stringify(body).replace(/'/g, "'\\''")}' | python3 -c \"import sys,json; d=json.load(sys.stdin); d['agentId']='$DISPUTE_AGENT_ID'; print(json.dumps(d))\")" \\`);
    lines.push(`  > /dev/null && echo "  Runbook: ${rb.name}"`);
    lines.push(``);
  }

  const cashRunbooks = [
    { name: "Bank Feed Failure Recovery", description: "Maintaining cash application when automated bank feed fails.", category: "incident_response", severity: "high", autonomyLevel: "confirm_before" },
    { name: "Mass Payment File Error Handling", description: "Validation and partial processing for large payment files with errors.", category: "incident_response", severity: "critical", autonomyLevel: "confirm_before" },
    { name: "Unapplied Cash Aging Escalation", description: "Escalation thresholds and investigation for aging unapplied cash.", category: "escalation", severity: "medium", autonomyLevel: "autonomous" },
    { name: "Bank Reconciliation Imbalance Investigation", description: "Investigation checklist for bank reconciliation variances.", category: "incident_response", severity: "high", autonomyLevel: "confirm_before" },
    { name: "Period-End Close Cash Application", description: "Prioritization and cutoff procedures during period-end close.", category: "operational", severity: "critical", autonomyLevel: "confirm_before" },
    { name: "Remittance Format Change Handling", description: "Procedure when a customer changes their remittance format.", category: "operational", severity: "medium", autonomyLevel: "confirm_before" },
  ];

  for (const rb of cashRunbooks) {
    const body = { ...rb, industry: "enterprise", triggerType: "automated", status: "active", estimatedDuration: "1-4 hours" };
    lines.push(`curl -fsS -X POST "$PROD/api/runbooks" -H "Content-Type: application/json" ${TOKEN ? `-H "Authorization: ${TOKEN}"` : ""} \\`);
    lines.push(`  -d "$(echo '${JSON.stringify(body).replace(/'/g, "'\\''")}' | python3 -c \"import sys,json; d=json.load(sys.stdin); d['agentId']='$CASH_AGENT_ID'; print(json.dumps(d))\")" \\`);
    lines.push(`  > /dev/null && echo "  Runbook: ${rb.name}"`);
    lines.push(``);
  }

  // ─── Phase 5: Policies ───────────────────────────────────────────────────
  lines.push(`echo "[Phase 5] Creating Compliance Policies..."`);
  lines.push(``);

  const disputePolicies = [
    { name: "Dispute Resolution SOX Audit Trail", domain: "audit_compliance", version: 1, status: "active", description: "Requires complete and immutable audit trail for all dispute resolutions per SOX Section 404.", policyJson: { type: "HARD", enforcement: "block", auditFrequency: "continuous" } },
    { name: "Dispute Auto-Approval Threshold Control", domain: "financial_controls", version: 1, status: "active", description: "Enforces dollar-amount thresholds for automated vs. human-approved dispute resolutions.", policyJson: { type: "HARD", enforcement: "block", violationAction: "escalate_for_approval" } },
    { name: "Fair Credit Billing Act Compliance", domain: "regulatory_compliance", version: 1, status: "active", description: "Ensures FCBA compliance for B2C dispute acknowledgment and resolution timelines.", policyJson: { type: "HARD", applicability: "B2C_disputes", enforcement: "alert_and_block", slaMonitoring: "daily" } },
    { name: "Dispute Segregation of Duties", domain: "internal_controls", version: 1, status: "active", description: "Enforces segregation between dispute investigation and resolution.", policyJson: { type: "HARD", enforcement: "block", controlType: "preventive" } },
    { name: "Revenue Recognition Impact Policy", domain: "revenue_recognition", version: 1, status: "active", description: "Ensures credit memos are processed in the correct accounting period.", policyJson: { type: "SOFT", enforcement: "alert", reviewFrequency: "monthly" } },
    { name: "Dispute Data Retention and Privacy", domain: "data_governance", version: 1, status: "active", description: "Governs retention of dispute documentation per regulatory and legal hold requirements.", policyJson: { type: "SOFT", enforcement: "alert", retentionYears: 7 } },
  ];

  for (const p of disputePolicies) {
    const body = { ...p, scopeType: "agent" };
    lines.push(`curl -fsS -X POST "$PROD/api/policies" -H "Content-Type: application/json" ${TOKEN ? `-H "Authorization: ${TOKEN}"` : ""} \\`);
    lines.push(`  -d "$(echo '${JSON.stringify(body).replace(/'/g, "'\\''")}' | python3 -c \"import sys,json; d=json.load(sys.stdin); d['scopeId']='$DISPUTE_AGENT_ID'; print(json.dumps(d))\")" \\`);
    lines.push(`  > /dev/null && echo "  Policy: ${p.name}"`);
    lines.push(``);
  }

  const cashPolicies = [
    { name: "Cash Application SOX Controls", domain: "audit_compliance", version: 1, status: "active", description: "Enforces SOX controls over cash receipt processing including segregation of duties and reconciliation.", policyJson: { type: "HARD", enforcement: "block", controlType: "preventive", auditFrequency: "continuous" } },
    { name: "Duplicate Payment Detection", domain: "anti_fraud", version: 1, status: "active", description: "Prevents duplicate cash application by detecting same payment reference in 30-day lookback.", policyJson: { type: "HARD", enforcement: "block", lookbackDays: 30 } },
    { name: "Suspicious Payment Source Policy", domain: "banking_compliance", version: 1, status: "active", description: "KYC controls for incoming payments from unexpected or new sources.", policyJson: { type: "HARD", enforcement: "block_and_alert", complianceReviewRequired: true } },
    { name: "Cash Posting Period Cutoff", domain: "revenue_recognition", version: 1, status: "active", description: "Enforces proper accounting period cutoff for cash postings.", policyJson: { type: "HARD", enforcement: "block", cutoffEnforcement: "strict" } },
    { name: "Unapplied Cash Escalation Thresholds", domain: "financial_controls", version: 1, status: "active", description: "Defines escalation requirements for aging unapplied cash balances.", policyJson: { type: "SOFT", enforcement: "alert", writeOffAuthority: "controller" } },
    { name: "Remittance Data Privacy and Handling", domain: "data_governance", version: 1, status: "active", description: "Governs secure handling of remittance data including bank account information.", policyJson: { type: "HARD", enforcement: "block", dataClassification: "CONFIDENTIAL", retentionYears: 7 } },
  ];

  for (const p of cashPolicies) {
    const body = { ...p, scopeType: "agent" };
    lines.push(`curl -fsS -X POST "$PROD/api/policies" -H "Content-Type: application/json" ${TOKEN ? `-H "Authorization: ${TOKEN}"` : ""} \\`);
    lines.push(`  -d "$(echo '${JSON.stringify(body).replace(/'/g, "'\\''")}' | python3 -c \"import sys,json; d=json.load(sys.stdin); d['scopeId']='$CASH_AGENT_ID'; print(json.dumps(d))\")" \\`);
    lines.push(`  > /dev/null && echo "  Policy: ${p.name}"`);
    lines.push(``);
  }

  // ─── Phase 6: Golden Datasets + Test Cases + Eval Suites ─────────────────
  lines.push(`echo "[Phase 6] Creating Eval Datasets and Suites..."`);
  lines.push(``);

  const disputeDataset = {
    name: "OTC-AGT-008 Dispute Resolution Evaluation Dataset",
    description: "Evaluation dataset covering classification accuracy, root cause analysis, resolution appropriateness, communication quality, and SLA compliance across all dispute types and customer tiers.",
    industry: "enterprise", useCase: "Dispute Classification and Resolution",
    version: "1.0", status: "active", qualityCoverage: 0.92,
    tags: ["dispute-resolution", "order-to-cash", "credit-memo", "classification"],
    scenarioCategories: { "Pricing Error": 20, "Quantity Discrepancy": 15, "Quality Dispute": 15, "Duplicate Invoice": 10, "Unauthorized Deduction": 20, "High-Value Dispute": 10, "Aging Dispute SLA": 10 },
    benchmarkAvg: 0.93, benchmarkRange: { low: 0.85, high: 0.98 },
    performanceBenchmarks: { classificationAccuracy: 0.95, rootCauseAccuracy: 0.88, resolutionAppropriateness: 0.92, cycleTimeTarget: 10 },
    aiGenerated: false, contributorCount: 1, contributors: ["Order-to-Cash Team"],
  };
  lines.push(`DISPUTE_DATASET_ID=$(curl -fsS -X POST "$PROD/api/golden-datasets" -H "Content-Type: application/json" ${TOKEN ? `-H "Authorization: ${TOKEN}"` : ""} \\`);
  lines.push(`  -d '${JSON.stringify(disputeDataset).replace(/'/g, "'\\''")}' | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")`);
  lines.push(`echo "  Dispute dataset -> $DISPUTE_DATASET_ID"`);
  lines.push(``);

  // Test cases for dispute dataset
  const disputeTCs = [
    { name: "Pricing Error — Standard Customer — Full Credit", inputScenario: "Customer ABC Corp disputes invoice INV-2024-1201 ($8,500). PO specifies $85/unit × 100 = $8,500. Invoice shows $95/unit = $9,500. Customer deducted $1,000.", expectedBehavior: "Classify as pricing_error, confidence ≥0.95. Root cause: price master mismatch. Recommend full credit $1,000. Auto-approve (≤$5K). Issue credit memo within 1 business day.", difficultyTier: "routine", scenarioCategory: "happy_path", tags: ["pricing_error", "full_credit"], status: "active", aiGenerated: false },
    { name: "Unauthorized Deduction — Strategic Customer — Reject", inputScenario: "Strategic customer takes $12,000 deduction 'PROMO-X99' on $75,000 invoice. Code not in approved promotion schedule.", expectedBehavior: "Classify unauthorized_deduction, CRITICAL priority, route to Sales. Reject with evidence. Activate Customer Relationship at Risk runbook. Notify VP and account exec.", difficultyTier: "challenging", scenarioCategory: "edge_cases", tags: ["unauthorized_deduction", "strategic_customer"], status: "active", aiGenerated: false },
    { name: "Duplicate Invoice — Auto-Approved Credit", inputScenario: "Globex Ltd disputes INV-2024-2244 ($3,200) — same order billed twice (INV-2024-2244 and INV-2024-2251 both reference ORD-55123).", expectedBehavior: "Classify duplicate_invoice confidence ≥0.99. Credit INV-2024-2251 ($3,200). Auto-approve. Void duplicate. File IT ticket.", difficultyTier: "routine", scenarioCategory: "happy_path", tags: ["duplicate_invoice", "auto_resolution"], status: "active", aiGenerated: false },
    { name: "Quality Dispute — Partial Credit", inputScenario: "TechBuild Corp disputes INV-2024-3301 ($22,000) — 40 of 200 units arrived damaged. Photos provided. FedEx freight delivery Oct 20.", expectedBehavior: "Classify quality_dispute. Route to Quality. Gather POD, carrier report, photos. Partial credit 40 × $110 = $4,400. Supervisor notification required.", difficultyTier: "challenging", scenarioCategory: "edge_cases", tags: ["quality_dispute", "partial_credit"], status: "active", aiGenerated: false },
    { name: "Aging Dispute SLA Breach at Day 28", inputScenario: "Dispute DIS-2024-0445 ($15,000) open 28 days. Resolution proposed Day 10 awaiting director approval — no response in 18 days.", expectedBehavior: "SLA breach in 2 days. Activate Aging runbook. Escalate approval to Director immediately. Send interim update to customer. Escalate to VP in 24h if no response.", difficultyTier: "challenging", scenarioCategory: "compliance_critical", tags: ["aging_dispute", "sla_breach"], status: "active", aiGenerated: false },
    { name: "Systematic Pattern — 8 Same Root Cause Disputes", inputScenario: "8 disputes in 30 days all pricing_error — incorrect distributor price tier. Total $45K. All invoices from Oct 7-11.", expectedBehavior: "Confirm systemic pattern. Activate Systematic Error runbook. Notify IT/ops. Impact assessment all Oct 7-11 distributor invoices. Batch credit processing. Proactive customer outreach.", difficultyTier: "expert", scenarioCategory: "adversarial", tags: ["systematic_error", "mass_resolution"], status: "active", aiGenerated: false },
  ];

  for (const tc of disputeTCs) {
    lines.push(`curl -fsS -X POST "$PROD/api/golden-datasets/$DISPUTE_DATASET_ID/test-cases" -H "Content-Type: application/json" ${TOKEN ? `-H "Authorization: ${TOKEN}"` : ""} \\`);
    lines.push(`  -d '${JSON.stringify(tc).replace(/'/g, "'\\''")}' > /dev/null && echo "  Test case: ${tc.name}"`);
    lines.push(``);
  }

  lines.push(`curl -fsS -X POST "$PROD/api/evals" -H "Content-Type: application/json" ${TOKEN ? `-H "Authorization: ${TOKEN}"` : ""} \\`);
  lines.push(`  -d "$(python3 -c \"import json; print(json.dumps({'agentId':'$DISPUTE_AGENT_ID','goldenDatasetId':'$DISPUTE_DATASET_ID','name':'OTC-AGT-008 Dispute Resolution Core Regression Suite','type':'regression','industry':'enterprise','totalCases':6,'passRate':0,'thresholdConfig':{'minPassRate':0.92,'classificationAccuracy':0.95},'coverageTags':['dispute_classification','root_cause_analysis','resolution_recommendation','sla_compliance'],'ontologyTags':['dispute','credit-memo','order-to-cash']}))\")" \\`);
  lines.push(`  > /dev/null && echo "  Eval suite: OTC-AGT-008 Dispute Resolution Core Regression Suite"`);
  lines.push(``);

  // Cash Application dataset and test cases
  const cashDataset = {
    name: "OTC-AGT-009 Cash Application & Reconciliation Evaluation Dataset",
    description: "Evaluation covering remittance parsing accuracy, invoice matching rates, deduction classification, bank reconciliation completeness, and exception prioritization.",
    industry: "enterprise", useCase: "Cash Application and Bank Reconciliation",
    version: "1.0", status: "active", qualityCoverage: 0.93,
    tags: ["cash-application", "order-to-cash", "remittance", "bank-reconciliation"],
    scenarioCategories: { "Exact Match": 20, "Consolidated Payment": 15, "Partial Payment": 15, "Deduction Classification": 20, "Bank Reconciliation": 15, "Exception Handling": 15 },
    benchmarkAvg: 0.92, benchmarkRange: { low: 0.85, high: 0.99 },
    performanceBenchmarks: { autoMatchRate: 0.90, remittanceParsingAccuracy: 0.92, deductionClassificationAccuracy: 0.90, reconciliationCompleteness: 0.98 },
    aiGenerated: false, contributorCount: 1, contributors: ["Order-to-Cash Team"],
  };

  lines.push(`CASH_DATASET_ID=$(curl -fsS -X POST "$PROD/api/golden-datasets" -H "Content-Type: application/json" ${TOKEN ? `-H "Authorization: ${TOKEN}"` : ""} \\`);
  lines.push(`  -d '${JSON.stringify(cashDataset).replace(/'/g, "'\\''")}' | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")`);
  lines.push(`echo "  Cash Application dataset -> $CASH_DATASET_ID"`);
  lines.push(``);

  const cashTCs = [
    { name: "EDI 820 — Consolidated Payment 12 Invoices", inputScenario: "Payment $145,230 from Wholesale Partners via EDI 820 with 12 invoice references totaling $145,230. All 12 invoices open in AR.", expectedBehavior: "Parse EDI 820 ≥98% confidence. Match all 12 invoices exactly. Auto-apply full payment. Zero exceptions.", difficultyTier: "routine", scenarioCategory: "happy_path", tags: ["EDI_820", "consolidated_payment", "auto_apply"], status: "active", aiGenerated: false },
    { name: "PDF — Partial Payment with Valid Trade Promo Deduction", inputScenario: "Payment $48,500 from FoodMart. PDF: Invoice $50,000, deduction $1,500 coded PROMO-FALL-2024. Code in approved schedule for FoodMart Q4.", expectedBehavior: "Parse PDF ≥85% confidence. Match to invoice. Validate PROMO-FALL-2024 as valid. Apply $48,500, offset $1,500 to Trade Promo Accrual. Auto-apply.", difficultyTier: "challenging", scenarioCategory: "edge_cases", tags: ["PDF_parsing", "trade_deduction"], status: "active", aiGenerated: false },
    { name: "Invalid Deduction — Route to Dispute Agent", inputScenario: "Payment $95,200 from BuildRight for $100,000 invoice. Deduction $4,800 coded SHORTAGE-OCT. POD shows full delivery confirmed.", expectedBehavior: "Apply $95,200 to invoice. Mark SHORTAGE-OCT invalid (POD confirms full delivery). Leave $4,800 open. Create dispute record and route to OTC-AGT-008.", difficultyTier: "challenging", scenarioCategory: "edge_cases", tags: ["invalid_deduction", "dispute_creation"], status: "active", aiGenerated: false },
    { name: "Bank Reconciliation — Deposit in Transit and Bank Fee", inputScenario: "Bank balance $2,850,000. ERP $3,100,000. One $250K ERP deposit not on bank statement. Bank shows $500 service charge not in ERP.", expectedBehavior: "Identify $250K deposit in transit (timing, no error). Identify $500 bank fee unrecorded. Post $500 journal entry. Reconciliation exception until fee posted.", difficultyTier: "challenging", scenarioCategory: "compliance_critical", tags: ["bank_reconciliation", "SOX"], status: "active", aiGenerated: false },
    { name: "Exception Queue Prioritization", inputScenario: "Queue: $250K strategic customer (1 day), $12K standard customer period-end tomorrow (8 days), $500 standard (15 days), $85K preferred with deduction risk (3 days).", expectedBehavior: "Priority: (1) $250K strategic Critical, (2) $85K preferred Critical, (3) $12K period-end High, (4) $500 Low. Supervisor notification for top 2.", difficultyTier: "challenging", scenarioCategory: "edge_cases", tags: ["exception_prioritization", "queue_management"], status: "active", aiGenerated: false },
    { name: "Cross-Currency EUR Wire — FX Variance Above Threshold", inputScenario: "EUR 42,000 wire from EuroTech GmbH. Invoice USD 45,150 at contract rate 1.0750. Payment date rate 1.0820.", expectedBehavior: "Convert to $45,444 at payment date rate. Variance $294 (0.65%) exceeds 0.5% threshold. Flag for review — FX movement not underpayment. Queue for 1-click confirm with FX journal entry.", difficultyTier: "expert", scenarioCategory: "adversarial", tags: ["cross_currency", "FX_variance"], status: "active", aiGenerated: false },
  ];

  for (const tc of cashTCs) {
    lines.push(`curl -fsS -X POST "$PROD/api/golden-datasets/$CASH_DATASET_ID/test-cases" -H "Content-Type: application/json" ${TOKEN ? `-H "Authorization: ${TOKEN}"` : ""} \\`);
    lines.push(`  -d '${JSON.stringify(tc).replace(/'/g, "'\\''")}' > /dev/null && echo "  Test case: ${tc.name}"`);
    lines.push(``);
  }

  lines.push(`curl -fsS -X POST "$PROD/api/evals" -H "Content-Type: application/json" ${TOKEN ? `-H "Authorization: ${TOKEN}"` : ""} \\`);
  lines.push(`  -d "$(python3 -c \"import json; print(json.dumps({'agentId':'$CASH_AGENT_ID','goldenDatasetId':'$CASH_DATASET_ID','name':'OTC-AGT-009 Cash Application Core Regression Suite','type':'regression','industry':'enterprise','totalCases':6,'passRate':0,'thresholdConfig':{'minPassRate':0.90,'autoMatchRateTarget':0.90},'coverageTags':['remittance_parsing','invoice_matching','deduction_coding','bank_reconciliation'],'ontologyTags':['cash-application','remittance','order-to-cash']}))\")" \\`);
  lines.push(`  > /dev/null && echo "  Eval suite: OTC-AGT-009 Cash Application Core Regression Suite"`);
  lines.push(``);

  // ─── Final summary ──────────────────────────────────────────────────────
  lines.push(`echo ""`);
  lines.push(`echo "=== Production Migration Complete ==="`);
  lines.push(`echo "OTC-AGT-008 Dispute Resolution Agent:       $DISPUTE_AGENT_ID"`);
  lines.push(`echo "OTC-AGT-009 Cash Application Agent:         $CASH_AGENT_ID"`);
  lines.push(`echo "OTC-AGT-008 Eval Dataset:                   $DISPUTE_DATASET_ID"`);
  lines.push(`echo "OTC-AGT-009 Eval Dataset:                   $CASH_DATASET_ID"`);

  return lines.join("\n");
}

// Write the script
const { writeFileSync } = await import("fs");
const script = generateScript();
const outFile = "./scripts/prod-migration.sh";
writeFileSync(outFile, script, "utf8");

// Make it executable
const { execSync } = await import("child_process");
execSync(`chmod +x ${outFile}`);

console.log(`✓ Production migration script generated: ${outFile}`);
console.log(`  Lines: ${script.split("\n").length}`);
console.log(`\nUsage:`);
console.log(`  ${outFile} [PROD_URL] [AUTH_TOKEN]`);
console.log(`\nOr run directly:`);
console.log(`  node scripts/generate-prod-curl.mjs https://atlas.prod.example.com "Bearer <token>"`);
console.log(`  bash scripts/prod-migration.sh`);
