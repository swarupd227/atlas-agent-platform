#!/usr/bin/env node
/**
 * create-otc-agt-009-dev.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Creates OTC-AGT-009 (Cash Application & Reconciliation Agent) and
 * OTC-AGT-006 (Billing & Collections Agent) in the Dev environment
 * via Platform API calls (no direct DB writes).
 *
 * Usage:
 *   node scripts/create-otc-agt-009-dev.js
 *
 * Prerequisites:
 *   - Atlas Dev environment running at http://localhost:5000
 *   - Organization already set up
 *   - Dev environment authenticated (cookie or x-organization-id header)
 *
 * Output:
 *   - Console log of every created resource with its ID
 *   - Writes ./otc-cash-dev-ids.json with all created IDs for migration use
 *
 * What this creates (both agents):
 *   ✓ 3 Knowledge Bases
 *   ✓ 2 MCP Servers (Payment Matching Engine + AR & Billing Engine)
 *   ✓ 15 MCP Server Tools (9 + 6)
 *   ✓ 6 Skills (3 per agent)
 *   ✓ 3 Governance Policies
 *   ✓ 12 Ontology Concepts
 *   ✓ 3 Blueprints
 *   ✓ OTC-AGT-009: Cash Application & Reconciliation Agent (fully linked)
 *   ✓ OTC-AGT-006: Billing & Collections Agent (fully linked)
 *   ✓ 2 Eval Suites with 5 test cases each
 *   ✓ 2 Deployments (dev, active)
 *   ✓ JSON output file: otc-cash-dev-ids.json
 */

const BASE_URL = process.env.ATLAS_DEV_URL || "http://localhost:5000";
const ORG_HDR  = process.env.ATLAS_ORG_ID  ? { "x-organization-id": process.env.ATLAS_ORG_ID } : {};

const HEADERS = {
  "Content-Type": "application/json",
  ...ORG_HDR,
};

let totalCreated = 0;

async function api(method, path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: HEADERS,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${method} ${path} → HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

async function getOrCreate(listPath, createPath, payload, matchKey = "name") {
  const existing = await api("GET", listPath).catch(() => ({ data: [], items: [] }));
  const list = existing.data ?? existing.items ?? existing;
  if (Array.isArray(list)) {
    const found = list.find(x => x[matchKey] === payload[matchKey]);
    if (found) {
      console.log(`  ↩  Already exists: ${payload[matchKey]} (${found.id})`);
      return found;
    }
  }
  const created = await api("POST", createPath, payload);
  totalCreated++;
  console.log(`  ✓  Created: ${payload[matchKey]} (${created.id})`);
  return created;
}

// ─── IDs output file ──────────────────────────────────────────────────────────
const ids = {
  kbs:       {},
  mcpServers: {},
  skills:    {},
  policies:  [],
  blueprints: {},
  agents:    {},
  deployments: {},
  evalSuites: {},
};

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  OTC Cash Application — Dev Agent Creation Script");
  console.log("  Target:", BASE_URL);
  console.log("═══════════════════════════════════════════════════════════════\n");

  // ── 1. Knowledge Bases ─────────────────────────────────────────────────────
  console.log("── Phase 1: Knowledge Bases");
  const kbDefs = [
    { name: "Cash Application & Deduction Policy Handbook",   industry: "manufacturing", status: "active", embeddingModel: "text-embedding-3-small", embeddingDimensions: 1536, chunkSize: 512, chunkOverlap: 50, description: "NovaTech cash application operating procedures, deduction code library, exception escalation matrix, and month-end close checklist." },
    { name: "Customer Remittance & Billing Reference",        industry: "manufacturing", status: "active", embeddingModel: "text-embedding-3-small", embeddingDimensions: 1536, chunkSize: 512, chunkOverlap: 50, description: "EDI 820 parsing rules, customer-specific remittance formats, early pay discount terms, freight claim authority matrix." },
    { name: "Bank Reconciliation & AR Closing Standards",     industry: "manufacturing", status: "active", embeddingModel: "text-embedding-3-small", embeddingDimensions: 1536, chunkSize: 512, chunkOverlap: 50, description: "Month-end AR closing procedures, bank reconciliation methodology, GL posting rules, credit memo approval authority." },
  ];
  for (const kbDef of kbDefs) {
    const kb = await getOrCreate("/api/knowledge-bases", "/api/knowledge-bases", kbDef);
    ids.kbs[kbDef.name] = kb.id;
  }

  // ── 2. MCP Servers + Tools ─────────────────────────────────────────────────
  console.log("\n── Phase 2: MCP Servers");
  const mcpDefs = [
    {
      name:        "OTC Cash — Payment Matching Engine",
      description: "NovaTech Cash Application core: payment ingestion, auto-matching, exception identification, EDI 820 parsing, deduction analysis and validation, payment resolution.",
      url:         `${BASE_URL}/api/mock/otc-cash-payment-engine`,
      transportType: "streamable-http",
      status:      "registered",
      riskTier:    "MEDIUM",
      allowlisted: true,
      addedBy:     "otc-cash-creation-script",
      capabilities: { tools: true, resources: false, prompts: false, sampling: false },
      serverInfo:   { vendor: "NovaTech Industries / ATLAS Demo", version: "1.0.0" },
      tools: [
        { name: "ingest_daily_payment_batch",  description: "Ingests all month-end payments: 387 transactions totalling $42.3M", inputSchema: { type: "object", properties: {}, required: [] }, annotations: { endpoint: "ingest-payment-batch", method: "GET" }, enabled: true, riskClassification: "low" },
        { name: "run_auto_matching",           description: "Runs intelligent auto-matching achieving 94.1% match rate",          inputSchema: { type: "object", properties: {}, required: [] }, annotations: { endpoint: "run-auto-matching",   method: "POST" }, enabled: true, riskClassification: "low" },
        { name: "identify_exceptions",         description: "Returns prioritised exception queue sorted by value and complexity",  inputSchema: { type: "object", properties: {}, required: [] }, annotations: { endpoint: "identify-exceptions",  method: "GET"  }, enabled: true, riskClassification: "low" },
        { name: "get_bank_reconciliation",     description: "Returns month-end bank reconciliation status at 98.7% matched",      inputSchema: { type: "object", properties: {}, required: [] }, annotations: { endpoint: "bank-reconciliation", method: "GET"  }, enabled: true, riskClassification: "low" },
        { name: "parse_edi_remittance",        description: "Parses GlobalTech EDI 820: 47 invoices, 3 deductions, overpayment",  inputSchema: { type: "object", properties: {}, required: [] }, annotations: { endpoint: "parse-edi-remittance", method: "POST" }, enabled: true, riskClassification: "low" },
        { name: "match_payment_to_invoices",   description: "Matches GlobalTech $2.3M to 47 invoices at 99.2% confidence",        inputSchema: { type: "object", properties: {}, required: [] }, annotations: { endpoint: "match-invoices",     method: "POST" }, enabled: true, riskClassification: "low" },
        { name: "analyze_deductions",          description: "Analyses 3 deductions: freight, early pay, quantity short",           inputSchema: { type: "object", properties: {}, required: [] }, annotations: { endpoint: "analyze-deductions", method: "POST" }, enabled: true, riskClassification: "low" },
        { name: "validate_deduction_details",  description: "Issues VALID/INVESTIGATE rulings with evidence for each deduction",   inputSchema: { type: "object", properties: {}, required: [] }, annotations: { endpoint: "validate-deductions", method: "POST" }, enabled: true, riskClassification: "low" },
        { name: "apply_payment_resolution",    description: "Prepares complete GlobalTech resolution package for controller",       inputSchema: { type: "object", properties: {}, required: [] }, annotations: { endpoint: "apply-resolution",   method: "POST" }, enabled: true, riskClassification: "low" },
      ],
    },
    {
      name:        "OTC Cash — AR & Billing Engine",
      description: "NovaTech AR and Billing management: deduction policy validation, AR journal entries, credit memos, invoice closure, AR aging, customer AR summaries.",
      url:         `${BASE_URL}/api/mock/otc-cash-ar-posting`,
      transportType: "streamable-http",
      status:      "registered",
      riskTier:    "MEDIUM",
      allowlisted: true,
      addedBy:     "otc-cash-creation-script",
      capabilities: { tools: true, resources: false, prompts: false, sampling: false },
      serverInfo:   { vendor: "NovaTech Industries / ATLAS Demo", version: "1.0.0" },
      tools: [
        { name: "validate_deduction_against_policy", description: "Cross-references deduction against NovaTech policy matrix",   inputSchema: { type: "object", properties: {}, required: [] }, annotations: { endpoint: "validate-policy",     method: "POST" }, enabled: true, riskClassification: "low" },
        { name: "post_ar_entries",                   description: "Posts cash receipt journal entries to AR sub-ledger",          inputSchema: { type: "object", properties: {}, required: [] }, annotations: { endpoint: "post-ar-entries",    method: "POST" }, enabled: true, riskClassification: "low" },
        { name: "generate_credit_memo",              description: "Generates credit memo CM-2026-0328-GT for $38,100 overpay",    inputSchema: { type: "object", properties: {}, required: [] }, annotations: { endpoint: "generate-credit-memo", method: "POST" }, enabled: true, riskClassification: "low" },
        { name: "close_invoice_batch",               description: "Marks 47 GlobalTech invoices CLOSED-PAID, updates AR balance", inputSchema: { type: "object", properties: {}, required: [] }, annotations: { endpoint: "close-invoices",     method: "POST" }, enabled: true, riskClassification: "low" },
        { name: "get_ar_aging_impact",               description: "Calculates AR aging impact: GlobalTech $3.1M → $0.73M",        inputSchema: { type: "object", properties: {}, required: [] }, annotations: { endpoint: "ar-aging-impact",    method: "GET"  }, enabled: true, riskClassification: "low" },
        { name: "get_customer_ar_summary",           description: "Returns GlobalTech Corp full AR summary post-payment",          inputSchema: { type: "object", properties: {}, required: [] }, annotations: { endpoint: "customer-ar-summary", method: "GET"  }, enabled: true, riskClassification: "low" },
      ],
    },
  ];
  for (const mcpDef of mcpDefs) {
    const { tools, ...serverPayload } = mcpDef;
    const server = await getOrCreate("/api/mcp-servers", "/api/mcp-servers", serverPayload);
    ids.mcpServers[mcpDef.name] = server.id;

    console.log(`  Creating tools for: ${mcpDef.name}`);
    for (const tool of tools) {
      await api("POST", `/api/mcp-servers/${server.id}/tools`, tool).catch(e => console.log(`    ↩ Tool already exists or error: ${tool.name} — ${e.message.slice(0,80)}`));
    }
    console.log(`  ✓  ${tools.length} tools created for ${mcpDef.name}`);
  }

  // ── 3. Skills ──────────────────────────────────────────────────────────────
  console.log("\n── Phase 3: Skills");
  const skillDefs = [
    { agentKey: "cashApplication", name: "Intelligent Payment Matching",              domain: "cash_application",  industry: "manufacturing", version: "1.0.0", trustTier: "platform-provided", status: "active", tags: ["auto_matching","payment_processing","invoice_matching","remittance"],   description: "Applies NovaTech's multi-signal matching algorithm to achieve 94%+ auto-match rates across wire, ACH, check, and EDI 820 channels.", markdownBody: "## Intelligent Payment Matching\nApplies NovaTech's multi-signal matching algorithm: exact invoice ref, fuzzy customer name, amount tolerance (±$10), historical payment patterns." },
    { agentKey: "cashApplication", name: "Remittance Parsing & Extraction",          domain: "cash_application",  industry: "manufacturing", version: "1.0.0", trustTier: "platform-provided", status: "active", tags: ["edi_820","remittance_parsing","extraction","deduction_codes"],         description: "Parses multi-format remittance advice: EDI 820, PDF, email. Extracts invoice references, deduction codes, overpayments.", markdownBody: "## Remittance Parsing & Extraction\nParses EDI 820 transaction sets, PDF check stubs, and email remittances. Handles complex multi-invoice remittances." },
    { agentKey: "cashApplication", name: "Deduction Classification & Validity Assessment", domain: "cash_application", industry: "manufacturing", version: "1.0.0", trustTier: "platform-provided", status: "active", tags: ["deduction_management","validity_assessment","freight_claims","early_pay_discount"], description: "Classifies deductions (freight claim, EPD, qty short) and validates against NovaTech's policy matrix.", markdownBody: "## Deduction Classification & Validity Assessment\nIssues VALID/INVALID/INVESTIGATE rulings backed by supporting evidence from carrier PODs, delivery receipts, and payment terms." },
    { agentKey: "billingCollections", name: "AR Posting & Invoice Closure",          domain: "accounts_receivable", industry: "manufacturing", version: "1.0.0", trustTier: "platform-provided", status: "active", tags: ["ar_posting","journal_entries","invoice_closure","asc_606"],           description: "Executes journal entry posting for cash receipts and closes paid invoice batches.", markdownBody: "## AR Posting & Invoice Closure\nPosts cash receipt JEs, closes invoices in ERP, confirms ASC 606 revenue recognition." },
    { agentKey: "billingCollections", name: "Collections Dunning Management",        domain: "accounts_receivable", industry: "manufacturing", version: "1.0.0", trustTier: "platform-provided", status: "active", tags: ["collections","dunning","ar_aging","overdue_management"],             description: "Manages AR aging and automated dunning sequences for overdue accounts.", markdownBody: "## Collections Dunning Management\nIdentifies overdue accounts, selects dunning templates by tier, executes multi-channel outreach." },
    { agentKey: "billingCollections", name: "Invoice Generation & Tax Application",  domain: "billing_operations",  industry: "manufacturing", version: "1.0.0", trustTier: "platform-provided", status: "active", tags: ["invoice_generation","tax_calculation","edi_810","billing"],           description: "Generates accurate customer invoices with contract pricing, tax, and early pay discount terms.", markdownBody: "## Invoice Generation & Tax Application\nGenerates invoices with pricing, tax by jurisdiction, EPD terms, and transmits via customer-preferred channel." },
  ];
  for (const skill of skillDefs) {
    const { agentKey, ...skillPayload } = skill;
    const created = await getOrCreate("/api/skills", "/api/skills", skillPayload);
    ids.skills[skill.name] = created.id;
  }

  // ── 4. Governance Policies ─────────────────────────────────────────────────
  console.log("\n── Phase 4: Governance Policies");
  const policyDefs = [
    { name: "Cash Application Authority Matrix", domain: "treasury_governance",   status: "active", version: 1, scopeType: "org", description: "Defines automated cash application authority and posting thresholds.", policyJson: { enforcement: "hard", rules: [{ name: "Auto-Match Posting Authority", description: "≥95% confidence auto-post; 80-95% one-click confirm; <80% exception queue" }, { name: "Deduction Auto-Approve Threshold", description: "Valid deductions ≤$50K auto-approved; above $50K requires controller" }] } },
    { name: "Deduction Validity Protocol",       domain: "treasury_governance",   status: "active", version: 1, scopeType: "org", description: "Governs deduction claim validation requirements for freight, EPD, and short-ship.", policyJson: { enforcement: "hard", rules: [{ name: "Freight Claim Evidence", description: "Carrier POD damage notation required for VALID ruling" }, { name: "Early Pay Verification", description: "Payment must be within discount window AND qualify under contract terms" }] } },
    { name: "Month-End Close SOX Controls",      domain: "financial_compliance", status: "active", version: 1, scopeType: "org", description: "SOX-compliant month-end AR close: 48-hour posting, 99%+ bank rec, deduction documentation gate.", policyJson: { enforcement: "hard", rules: [{ name: "48-Hour Posting Deadline", description: "All payments must be matched and posted within 2 business days" }, { name: "Bank Reconciliation Standard", description: "Month-end bank rec must reach 99%+ by close of business day 3" }] } },
  ];
  for (const policy of policyDefs) {
    const created = await getOrCreate("/api/policies", "/api/policies", policy);
    ids.policies.push(created.id);
  }

  // ── 5. Blueprints ──────────────────────────────────────────────────────────
  console.log("\n── Phase 5: Blueprints");
  const bpDefs = [
    { name: "OTC Cash — Payment Ingestion & Auto-Match Blueprint",   description: "Ingests payment batch, runs intelligent auto-matching to 94%+ rate, identifies exception queue, reports bank rec status.", status: "active", version: 1, patternType: "pipeline", blueprintJson: { industry: "manufacturing", workflowSteps: ["Ingest Payment Batch", "Run Auto-Matching", "Identify Exceptions", "Check Bank Reconciliation"], outputFormat: "JSON cash application summary" } },
    { name: "OTC Cash — Complex Payment Resolution Blueprint",        description: "Resolves GlobalTech $2.3M: parses EDI 820, matches 47 invoices, validates 3 deductions, prepares one-click resolution.", status: "active", version: 1, patternType: "pipeline", blueprintJson: { industry: "manufacturing", workflowSteps: ["Parse EDI 820", "Match 47 Invoices", "Analyse Deductions", "Validate Deductions", "Prepare Resolution"], outputFormat: "JSON resolution package" } },
    { name: "OTC Cash — AR Posting & Invoice Closure Blueprint",      description: "Posts GlobalTech payment to AR: validates policy, posts JEs, generates credit memo, closes 47 invoices, reports aging impact.", status: "active", version: 1, patternType: "pipeline", blueprintJson: { industry: "manufacturing", workflowSteps: ["Policy Validation", "Post AR Entries", "Generate Credit Memo", "Close Invoice Batch", "AR Aging Impact"], outputFormat: "JSON AR posting confirmation" } },
  ];
  for (const bp of bpDefs) {
    const created = await getOrCreate("/api/blueprints", "/api/blueprints", bp);
    ids.blueprints[bp.name] = created.id;
  }

  // ── 6. Agents ──────────────────────────────────────────────────────────────
  console.log("\n── Phase 6: Agents");

  const POLICY_BINDINGS = policyDefs.map(p => ({ policyName: p.name, enforcement: "hard" }));

  const agentDefs = [
    {
      key:         "cashApplication",
      name:        "Cash Application & Reconciliation Agent",
      externalId:  "OTC-AGT-009",
      mcpServerName: "OTC Cash — Payment Matching Engine",
      kbName:        "Cash Application & Deduction Policy Handbook",
      bpName:        "OTC Cash — Payment Ingestion & Auto-Match Blueprint",
      skillNames:    ["Intelligent Payment Matching", "Remittance Parsing & Extraction", "Deduction Classification & Validity Assessment"],
      description: "Automates NovaTech's month-end cash application cycle: ingests $42M+ payments, achieves 94%+ auto-match rates, resolves complex cross-invoice remittances like GlobalTech's 47-invoice EDI 820.",
      department:  "Treasury & Cash Management",
      systemPrompt: "You are the Cash Application & Reconciliation Agent (OTC-AGT-009) for NovaTech Industries. You run NovaTech's month-end Cash Application Command Center. Your goal is consistent 94%+ auto-match rates and rapid resolution of complex cross-invoice remittances. Use your tools to ingest payments, run auto-matching, identify exceptions, parse remittances, validate deductions, and prepare resolution packages.",
      complianceTags: ["CASH-APP-AUTHORITY","DEDUCTION-VALIDATION-PROTOCOL","MONTH-END-CLOSE-SOX"],
      ontologyTags:   ["Payment Batch","Invoice Matching","Deduction Code","Remittance Advice"],
    },
    {
      key:         "billingCollections",
      name:        "Billing & Collections Agent",
      externalId:  "OTC-AGT-006",
      mcpServerName: "OTC Cash — AR & Billing Engine",
      kbName:        "Bank Reconciliation & AR Closing Standards",
      bpName:        "OTC Cash — AR Posting & Invoice Closure Blueprint",
      skillNames:    ["AR Posting & Invoice Closure", "Collections Dunning Management", "Invoice Generation & Tax Application"],
      description: "Manages NovaTech's AR sub-ledger post-cash-application: validates deductions against policy, posts cash receipt journal entries, generates credit memos, closes invoice batches, monitors AR aging.",
      department:  "Accounts Receivable & Billing",
      systemPrompt: "You are the Billing & Collections Agent (OTC-AGT-006) for NovaTech Industries. You are the AR execution layer: validate deductions against policy, post journal entries, generate credit memos, close invoice batches, and maintain AR aging accuracy. Be exact with amounts, GL account codes, journal entry references, and invoice numbers.",
      complianceTags: ["AR-POSTING-AUTHORITY","CREDIT-MEMO-APPROVAL","SOX-FINANCIAL-CONTROLS"],
      ontologyTags:   ["AR Journal Entry","Invoice Closure","Credit Memo","AR Aging"],
    },
  ];

  for (const def of agentDefs) {
    const skillIds = def.skillNames.map(n => ({ skillId: ids.skills[n] })).filter(s => s.skillId);
    const payload = {
      name:          def.name,
      description:   def.description,
      industry:      "manufacturing",
      department:    def.department,
      systemPrompt:  def.systemPrompt,
      status:        "active",
      autonomyMode:  "assisted",
      riskTier:      "HIGH",
      model:         "claude-opus-4-5",
      temperature:   0.2,
      maxTokens:     4096,
      complianceTags: def.complianceTags,
      ontologyTags:   def.ontologyTags,
      preloadedSkills: skillIds,
      policyBindings: POLICY_BINDINGS,
      blueprintId:   ids.blueprints[def.bpName] ?? null,
      tags:          ["otc","cash_application","month_end","financial",def.externalId.toLowerCase()],
    };
    const agent = await getOrCreate("/api/agents", "/api/agents", payload);
    ids.agents[def.externalId] = agent.id;

    // Link KB
    const kbId = ids.kbs[def.kbName];
    if (kbId) {
      await api("POST", `/api/agents/${agent.id}/knowledge-bases`, {
        knowledgeBaseId: kbId, priority: 1, retrievalConfig: { topK: 5, scoreThreshold: 0.7 },
      }).catch(e => console.log(`    ↩ KB link: ${e.message.slice(0,80)}`));
      console.log(`  ✓  KB linked: ${def.kbName}`);
    }

    // Create eval suite
    const evalPayload = {
      name:        `OTC Cash Application Regression Suite — ${def.externalId}`,
      description: `Regression eval suite for ${def.name}. Tests auto-match accuracy, deduction classification, AR posting correctness, and SOX control adherence.`,
      agentId:     agent.id,
      industry:    "manufacturing",
      evalType:    "regression",
      schedule:    "weekly:Wednesday:06:00 UTC",
      status:      "active",
    };
    const evalSuite = await getOrCreate("/api/eval-suites", "/api/eval-suites", evalPayload);
    ids.evalSuites[def.externalId] = evalSuite.id;

    // Create deployment
    const mcpId = ids.mcpServers[def.mcpServerName];
    const deployPayload = {
      agentId:     agent.id,
      status:      "active",
      environment: "dev",
      deployedAt:  new Date().toISOString(),
      config:      { mcpServerId: mcpId ?? null },
    };
    const deploy = await api("POST", "/api/deployments", deployPayload).catch(async () => {
      const deploys = await api("GET", `/api/agents/${agent.id}/deployments`).catch(() => ({ data: [] }));
      return (deploys.data ?? deploys)[0];
    });
    if (deploy?.id) ids.deployments[def.externalId] = deploy.id;

    console.log(`  ✓  ${def.externalId} fully provisioned — agent: ${agent.id}`);
  }

  // ── 7. Write output ────────────────────────────────────────────────────────
  const { writeFileSync } = await import("fs");
  const outPath = "./scripts/otc-cash-dev-ids.json";
  writeFileSync(outPath, JSON.stringify(ids, null, 2));
  console.log(`\n  ✓  Dev IDs written to ${outPath}`);

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("  Creation complete!");
  console.log(`  Resources created: ${totalCreated}`);
  console.log("  Agents:");
  for (const [code, agentId] of Object.entries(ids.agents)) {
    console.log(`    ${code} → ${agentId}`);
  }
  console.log("  MCP Servers:");
  for (const [name, mcpId] of Object.entries(ids.mcpServers)) {
    console.log(`    ${name} → ${mcpId}`);
  }
  console.log("═══════════════════════════════════════════════════════════════\n");
}

main().catch(err => {
  console.error("\n✗ Error:", err.message);
  process.exit(1);
});
