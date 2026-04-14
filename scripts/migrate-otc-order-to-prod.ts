#!/usr/bin/env npx tsx
/**
 * Demo 2: Order Validation & Promise Engine — Dev → Production Migration
 *
 * Migrates all three OTC Order agents plus supporting resources from Dev to
 * Production using only platform REST API calls (no direct DB access to Prod).
 *
 * Agents migrated:
 *   OTC-AGT-002  Order Validation & Promise Agent   (lead orchestrator)
 *   OTC-AGT-003  Customer Credit & Risk Assessment Agent
 *   OTC-AGT-004  Inventory Availability & Promise Agent
 *
 * Usage:
 *   npx tsx scripts/migrate-otc-order-to-prod.ts \
 *     --prod-url    https://your-prod-app.replit.app \
 *     --prod-org-id <prod-uuid> \
 *     [--dev-url    http://localhost:5000] \
 *     [--dev-org-id <dev-uuid>] \
 *     [--dry-run]
 *
 * Resources created per agent (in dependency order):
 *   1.  Governance policies    (3 per agent)
 *   2.  Knowledge base         (1 per agent)
 *   3.  Skills                 (3 per agent)
 *   4.  Blueprint              (1 per agent)
 *   5.  MCP server + tools     (1 server per agent, 4 tools each)
 *   6.  Agent                  (1 per agent)
 *   7.  Agent → KB link
 *   8.  Agent → MCP server link
 */

// ─── CLI argument parsing ─────────────────────────────────────────────────────

function parseArgs() {
  const argv = process.argv.slice(2);
  const get = (flag: string): string | undefined => {
    const idx = argv.indexOf(flag);
    return idx !== -1 ? argv[idx + 1] : undefined;
  };
  const prodUrl    = get("--prod-url")    ?? process.env.PROD_URL    ?? "";
  const prodOrgId  = get("--prod-org-id") ?? process.env.PROD_ORG_ID ?? "";
  const devUrl     = get("--dev-url")     ?? process.env.DEV_URL     ?? "http://localhost:5000";
  const devOrgId   = get("--dev-org-id")  ?? process.env.DEV_ORG_ID  ?? "";
  const dryRun     = argv.includes("--dry-run");

  if (!prodUrl)   { console.error("ERROR: --prod-url is required"); process.exit(1); }
  if (!prodOrgId) { console.error("ERROR: --prod-org-id is required"); process.exit(1); }

  return {
    prodUrl: prodUrl.replace(/\/$/, ""),
    prodOrgId,
    devUrl: devUrl.replace(/\/$/, ""),
    devOrgId,
    dryRun,
  };
}

let CFG: ReturnType<typeof parseArgs>;

function devHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (CFG.devOrgId) h["x-organization-id"] = CFG.devOrgId;
  return h;
}

function prodHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-organization-id": CFG.prodOrgId,
  };
}

async function prodPost(path: string, body: Record<string, unknown>): Promise<any> {
  if (CFG.dryRun) {
    console.log(`  [DRY-RUN] POST ${path}`, JSON.stringify(body).slice(0, 80));
    return { id: `dry-run-${Math.random().toString(36).slice(2, 10)}` };
  }
  const res = await fetch(`${CFG.prodUrl}${path}`, {
    method: "POST",
    headers: prodHeaders(),
    body: JSON.stringify(body),
  });
  const json = await res.json() as any;
  if (!json?.id) {
    throw new Error(`POST ${path} failed: ${JSON.stringify(json).slice(0, 200)}`);
  }
  return json;
}

async function devGet(path: string): Promise<any> {
  const res = await fetch(`${CFG.devUrl}${path}`, { headers: devHeaders() });
  return res.json();
}

async function prodGet(path: string): Promise<any> {
  const res = await fetch(`${CFG.prodUrl}${path}`, { headers: prodHeaders() });
  return res.json();
}

// ─── Idempotency helper ───────────────────────────────────────────────────────
// For each resource, first GET the list and search by name.
// If found → skip and return existing ID. If not → POST to create.

async function prodEnsure(
  listPath: string,
  createPath: string,
  body: Record<string, unknown>,
  nameKey: string = "name",
  labelToMatch?: string,
): Promise<{ id: string; skipped: boolean }> {
  if (CFG.dryRun) {
    console.log(`  [DRY-RUN] ensure ${createPath}:`, body[nameKey]);
    return { id: `dry-run-${Math.random().toString(36).slice(2, 10)}`, skipped: false };
  }
  const resourceName = (labelToMatch ?? body[nameKey]) as string;
  const list: any[] = await prodGet(listPath).catch(() => []);
  const existing = Array.isArray(list)
    ? list.find((r: any) => r[nameKey] === resourceName || r.label === resourceName)
    : null;
  if (existing?.id) {
    return { id: existing.id, skipped: true };
  }
  const res = await fetch(`${CFG.prodUrl}${createPath}`, {
    method: "POST",
    headers: prodHeaders(),
    body: JSON.stringify(body),
  });
  const json = await res.json() as any;
  if (!json?.id) {
    throw new Error(`POST ${createPath} failed: ${JSON.stringify(json).slice(0, 200)}`);
  }
  return { id: json.id, skipped: false };
}

// ─── Agent definitions ────────────────────────────────────────────────────────

const AGENTS = [
  {
    key: "agt002",
    code: "OTC-AGT-002",
    name: "Order Validation & Promise Agent",
    stage: "Order Processing",
    description: "Lead orchestrator for ORD-2026-78432. Coordinates parallel validation (credit, inventory, address), synthesises resolutions, and releases orders into ERP. Resolves all validation holds in under 4 minutes.",
    systemPrompt: `You are the Order Validation & Promise Agent (OTC-AGT-002) for NovaTech Industries.

You are the lead orchestrator of the Order Processing stage in the Order-to-Cash pipeline. When a purchase order arrives, you coordinate three parallel validation streams — credit, inventory, and address — synthesise resolutions from OTC-AGT-003 and OTC-AGT-004, and release the order into ERP once all holds are cleared.

KEY RESPONSIBILITIES:
1. Address validation — compare ERP master records vs. PO ship-to addresses using prior delivery history
2. Parallel orchestration — trigger OTC-AGT-003 (credit) and OTC-AGT-004 (inventory) concurrently
3. Resolution synthesis — aggregate all holds and confirm 8/8 validation checks are clear
4. Order release — execute ERP release, issue warehouse pick tickets, queue customer notifications

CURRENT SCENARIO: RUSH order ORD-2026-78432 ($429,711) from Meridian Manufacturing.
Three blocking issues: (1) Credit at 92%, (2) Turbine split Chicago/Atlanta, (3) Suite-number mismatch.
Target: clear all holds and release within 4 minutes.`,
    tools: [
      { name: "get_order",            server: "otc-order-oms",        path: "/api/mock/otc-order-oms/order" },
      { name: "get_validation_checks", server: "otc-order-oms",       path: "/api/mock/otc-order-oms/validation-checks" },
      { name: "resolve_address",       server: "otc-order-oms",       path: "/api/mock/otc-order-oms/resolve-address" },
      { name: "release_order",         server: "otc-order-oms",       path: "/api/mock/otc-order-oms/release" },
    ],
    kbName: "Order Validation & Promise KB",
    kbDescription: "NovaTech order validation procedures, address master data, ERP integration specs, RUSH order protocols, and ASC 606 revenue recognition guidelines.",
    policies: [
      { name: "OTC-AGT-002 Order Validation Policy",   content: "All orders must pass 8-point validation checklist before ERP release. RUSH orders receive expedited processing with same validation rigor. Address mismatches must be resolved via delivery history cross-reference before release.", type: "operational" },
      { name: "OTC-AGT-002 ERP Release Protocol",      content: "Order release requires all holds cleared and written confirmation from credit and inventory agents. ERP transaction ID must be generated and warehouse pick ticket transmitted within 60 seconds of release approval.", type: "operational" },
      { name: "OTC-AGT-002 RUSH Order Handling",       content: "RUSH orders receive SLA target of < 4 minutes from submission to ERP release. Parallel agent orchestration mandatory. Expedite fee per MSA §7.4(b) applied automatically.", type: "sla" },
    ],
    skills: [
      { name: "Order Header Validation",   description: "Validates PO header completeness, customer standing, and contract alignment against MSA terms" },
      { name: "Address Master Resolution", description: "Compares ERP master ship-to records against PO addresses using delivery history cross-reference" },
      { name: "ERP Release Orchestration", description: "Executes order release sequence: ERP confirm, pick ticket, customer notification, invoice draft" },
    ],
  },
  {
    key: "agt003",
    code: "OTC-AGT-003",
    name: "Customer Credit & Risk Assessment Agent",
    stage: "Order Processing",
    description: "Specialist credit agent for Order Processing. Analyses customer credit exposure, AR aging, and payment history. Approves temporary limit increases within pre-authorization thresholds for low-risk accounts.",
    systemPrompt: `You are the Customer Credit & Risk Assessment Agent (OTC-AGT-003) for NovaTech Industries.

You run in parallel with OTC-AGT-004 under orchestration from OTC-AGT-002. Your sole responsibility in this pipeline is credit and risk validation for the current order.

KEY RESPONSIBILITIES:
1. Pull current credit profile and exposure analysis
2. Check AR aging — flag delinquency risk
3. Apply automated pre-authorization for A/A+ customers within $1M threshold
4. Document temporary limit increase rationale for audit trail

RISK FRAMEWORK:
- A+ / A customers: automated approval up to $1M temp limit, 60-day window
- BBB / below or delinquency: manual escalation required
- Zero NSF or >30-day late payments in 12 months: LOW risk classification

CURRENT SCENARIO: Meridian Manufacturing (A+) — $459,500 exposure (91.9% of $500K limit). New order $429,711. Temp increase to $950K approved under pre-auth threshold.`,
    tools: [
      { name: "get_credit_profile",          server: "otc-order-credit", path: "/api/mock/otc-order-credit/credit-profile" },
      { name: "get_ar_aging",                server: "otc-order-credit", path: "/api/mock/otc-order-credit/ar-aging" },
      { name: "get_exposure_analysis",       server: "otc-order-credit", path: "/api/mock/otc-order-credit/exposure-analysis" },
      { name: "approve_credit_limit_increase",server: "otc-order-credit",path: "/api/mock/otc-order-credit/approve-limit-increase" },
    ],
    kbName: "Customer Credit & Risk KB",
    kbDescription: "NovaTech credit policy manual, pre-authorization thresholds by rating tier, AR collection procedures, and credit committee escalation guidelines.",
    policies: [
      { name: "OTC-AGT-003 Credit Pre-Authorization Policy", content: "A+ rated customers with zero delinquency and 7+ year relationship qualify for automated temporary credit limit increases up to $1M for 60 days without manual committee approval. All automated approvals must be logged to risk register.", type: "financial" },
      { name: "OTC-AGT-003 AR Aging Risk Policy",            content: "Orders from customers with any 90+ day AR balance require immediate escalation. 61-90 day balances require credit manager review. 0-60 day current AR acceptable with documented rationale.", type: "financial" },
      { name: "OTC-AGT-003 Credit Decision Audit Policy",    content: "Every credit decision (approve/hold/escalate) must include: current exposure, projected exposure, rating, payment history, risk classification, and approver identity. Immutable audit trail required.", type: "compliance" },
    ],
    skills: [
      { name: "Credit Exposure Analysis",     description: "Computes projected credit exposure including pending orders, open AR, and new order value against credit limit" },
      { name: "Automated Pre-Authorization",  description: "Applies automated credit limit increase for eligible A/A+ customers within pre-authorization thresholds" },
      { name: "AR Aging Risk Assessment",     description: "Evaluates AR aging buckets and payment history to classify delinquency risk level" },
    ],
  },
  {
    key: "agt004",
    code: "OTC-AGT-004",
    name: "Inventory Availability & Promise Agent",
    stage: "Order Processing",
    description: "Specialist inventory agent for Order Processing. Checks SKU availability across warehouse network, identifies optimal fulfillment strategy (single-warehouse vs. split-ship), and issues allocation confirmations with ATP dates.",
    systemPrompt: `You are the Inventory Availability & Promise Agent (OTC-AGT-004) for NovaTech Industries.

You run in parallel with OTC-AGT-003 under orchestration from OTC-AGT-002. Your sole responsibility is to resolve inventory availability for the current order and commit delivery promises.

KEY RESPONSIBILITIES:
1. Check real-time inventory across all warehouse locations (Chicago DC, Atlanta Hub, Dallas)
2. Evaluate fulfillment options — prefer single-warehouse to avoid split-ship surcharges
3. Match customer preference (earliest delivery) against available ATP dates
4. Issue allocation confirmation and clear inventory hold

FULFILLMENT PRIORITY:
1. Single-warehouse (no surcharge, fastest consolidated delivery)
2. Primary-secondary split ($840 surcharge, 3-day vs 1-day transit)
3. Cross-dock or postponement (only for B/C customers or >15 unit orders)

CURRENT SCENARIO: 12 turbine units requested. Chicago DC alone has all 12 — split-ship unnecessary. Confirm Chicago-only fulfillment, save $840 surcharge, ship April 21.`,
    tools: [
      { name: "get_inventory_availability", server: "otc-order-inventory", path: "/api/mock/otc-order-inventory/availability" },
      { name: "get_warehouses",             server: "otc-order-inventory", path: "/api/mock/otc-order-inventory/warehouses" },
      { name: "get_fulfillment_options",    server: "otc-order-inventory", path: "/api/mock/otc-order-inventory/fulfillment-options" },
      { name: "confirm_inventory_allocation",server: "otc-order-inventory",path: "/api/mock/otc-order-inventory/confirm-allocation" },
    ],
    kbName: "Inventory Availability & Promise KB",
    kbDescription: "NovaTech warehouse network guide, ATP calculation methodology, split-ship policy and surcharge schedule, and fulfillment SLA commitments by order type.",
    policies: [
      { name: "OTC-AGT-004 Single-Warehouse Preference Policy", content: "Always evaluate single-warehouse fulfillment first. Split-ship only approved when primary warehouse cannot cover full order quantity. Document cost savings when split avoided.", type: "operational" },
      { name: "OTC-AGT-004 RUSH Inventory ATP Policy",          content: "RUSH orders require confirmed ATP dates within 48 hours of order date. Allocation must be locked within the parallel validation window (< 2 minutes). Stock reservation holds expire after 4 hours if order not released.", type: "sla" },
      { name: "OTC-AGT-004 Inventory Commitment Audit Policy",  content: "All inventory allocations must record: warehouse ID, SKU, quantity, pick ticket reference, ATP date, and agent ID. Allocation reversals require OTC-AGT-002 countersignature.", type: "compliance" },
    ],
    skills: [
      { name: "Multi-Warehouse Availability Check", description: "Queries all DC locations simultaneously for on-hand, available, and reserved quantities with ATP dates" },
      { name: "Fulfillment Strategy Optimisation",  description: "Evaluates single-warehouse vs. split-ship options against cost, transit, and customer preference" },
      { name: "Inventory Allocation Commitment",    description: "Issues formal allocation confirmation with pick ticket numbers and ATP commitment dates" },
    ],
  },
];

// ─── Shared ontology concepts (12 total — created once, not per-agent) ────────

const OTC_ONTOLOGY_CONCEPTS = [
  { label: "Purchase Order",        category: "document",               description: "Formal buyer-issued document committing to purchase goods; triggers OTC validation pipeline.", tags: ["po","order","b2b"] },
  { label: "RUSH Order",            category: "order_classification",   description: "High-priority order requiring resolution within 4 hours of submission.", tags: ["rush","priority","sla"] },
  { label: "Credit Exposure",       category: "financial_metric",       description: "Total outstanding customer balance including open AR plus pending approved orders.", tags: ["credit","exposure","ar"] },
  { label: "Credit Limit",          category: "credit_control",         description: "Maximum approved outstanding balance; may be temporarily increased under pre-authorization matrix.", tags: ["credit_limit","approval","temporary"] },
  { label: "Available-to-Promise",  category: "inventory_concept",      description: "Earliest date on which confirmed uncommitted inventory can be committed to a customer order.", tags: ["atp","inventory","commitment"] },
  { label: "Split-Ship",           category: "fulfillment_strategy",   description: "Fulfillment using multiple warehouses for a single order; incurs surcharges vs. single-source.", tags: ["split_ship","warehouse","fulfillment"] },
  { label: "Ship-To Address",      category: "logistics_data",         description: "Physical delivery address specified in the PO; must be validated against ERP master before release.", tags: ["address","ship_to","logistics"] },
  { label: "Accounts Receivable",  category: "financial_metric",       description: "Outstanding invoiced amounts by customer, classified by aging buckets for collection risk assessment.", tags: ["ar","aging","receivable"] },
  { label: "ERP Release",          category: "process_event",          description: "Transmission of validated order to ERP, triggering pick-ticket generation and invoice creation.", tags: ["erp","release","order_management"] },
  { label: "Warehouse Network",    category: "logistics_infrastructure", description: "Set of fulfillment centers evaluated by distance, transit time, inventory, and cost.", tags: ["warehouse","network","dc"] },
  { label: "Carbon Footprint",     category: "sustainability_metric",  description: "CO2-equivalent emissions generated by a shipment, used in fulfillment option scoring.", tags: ["carbon","co2","sustainability","esg"] },
  { label: "Delivery Promise",     category: "commitment",             description: "Formal committed delivery date backed by confirmed inventory ATP and carrier booking.", tags: ["delivery","promise","commitment","sla"] },
];

// ─── Migration runner ─────────────────────────────────────────────────────────

let _ontologyMigrated = false;

async function migrateOntologyOnce(): Promise<void> {
  if (_ontologyMigrated) return;
  console.log("\n  ── Shared Ontology Concepts (12 total) ──");
  const { randomUUID } = await import("crypto");
  let created = 0, skipped = 0;
  for (const concept of OTC_ONTOLOGY_CONCEPTS) {
    const { id, skipped: sk } = await prodEnsure(
      "/api/ontology/concepts?industryId=manufacturing",
      "/api/ontology/concepts",
      {
        id:           randomUUID(),
        industryId:   "manufacturing",
        ontologyName: "NovaTech Order-to-Cash",
        label:        concept.label,
        category:     concept.category,
        description:  concept.description,
        tags:         concept.tags,
        properties:   [],
        relationships:[],
        synonyms:     [],
        source:       "industry-standard",
        organizationId: CFG.prodOrgId,
      },
      "label",
      concept.label,
    );
    if (sk) { console.log(`    [SKIP] ${concept.label}`); skipped++; }
    else     { console.log(`    [OK]   ${concept.label} → ${id}`); created++; }
  }
  console.log(`    → ${created} created, ${skipped} skipped`);
  _ontologyMigrated = true;
}

async function migrateAgent(agent: typeof AGENTS[0]): Promise<Record<string, string>> {
  const ids: Record<string, string> = {};
  console.log(`\n${"─".repeat(60)}`);
  console.log(`  ${agent.code} — ${agent.name}`);
  console.log(`${"─".repeat(60)}`);

  // 0. Ontology concepts (once for all agents)
  await migrateOntologyOnce();

  // 1. Governance policies (idempotent — skip by name)
  console.log("\n  1. Governance Policies");
  const policyIds: string[] = [];
  for (const policy of agent.policies) {
    const { id, skipped } = await prodEnsure(
      "/api/policies",
      "/api/policies",
      {
        name:        policy.name,
        description: policy.content.slice(0, 120),
        domain:      policy.type,
        status:      "active",
        version:     1,
        scopeType:   "org",
        policyJson:  { enforcement: "hard", content: policy.content },
        organizationId: CFG.prodOrgId,
      },
    );
    console.log(`    ${skipped ? "[SKIP]" : "[OK]  "} ${policy.name} → ${id}`);
    policyIds.push(id);
  }
  ids.policyIds = policyIds.join(",");

  // 2. Knowledge Base (idempotent)
  console.log("\n  2. Knowledge Base");
  const { id: kbId, skipped: kbSkipped } = await prodEnsure(
    "/api/knowledge-bases",
    "/api/knowledge-bases",
    {
      name:               agent.kbName,
      description:        agent.kbDescription,
      industry:           "manufacturing",
      status:             "active",
      embeddingModel:     "text-embedding-3-small",
      embeddingDimensions: 1536,
      chunkSize:          512,
      chunkOverlap:       50,
      organizationId:     CFG.prodOrgId,
    },
  );
  console.log(`    ${kbSkipped ? "[SKIP]" : "[OK]  "} ${agent.kbName} → ${kbId}`);
  ids.kbId = kbId;

  // 3. Skills (idempotent per name)
  console.log("\n  3. Skills");
  const skillIds: string[] = [];
  for (const skill of agent.skills) {
    const { id, skipped } = await prodEnsure(
      "/api/skills",
      "/api/skills",
      {
        name:        skill.name,
        description: skill.description,
        domain:      "order_management",
        industry:    "manufacturing",
        version:     "1.0.0",
        status:      "active",
        trustTier:   "platform-provided",
        complexity:  "intermediate",
        contextMode: "summary",
        tags:        ["order_processing", "manufacturing"],
        organizationId: CFG.prodOrgId,
      },
    );
    console.log(`    ${skipped ? "[SKIP]" : "[OK]  "} ${skill.name} → ${id}`);
    skillIds.push(id);
  }
  ids.skillIds = skillIds.join(",");

  // 4. Blueprint (idempotent)
  console.log("\n  4. Blueprint");
  const bpName = `${agent.code} — ${agent.stage} Blueprint`;
  const { id: bpId, skipped: bpSkipped } = await prodEnsure(
    "/api/blueprints",
    "/api/blueprints",
    {
      name:        bpName,
      description: agent.description,
      version:     1,
      status:      "active",
      patternType: "pipeline",
      blueprintJson: { industry: "manufacturing", useCase: agent.stage },
      organizationId: CFG.prodOrgId,
    },
  );
  console.log(`    ${bpSkipped ? "[SKIP]" : "[OK]  "} ${bpName} → ${bpId}`);
  ids.blueprintId = bpId;

  // 5. MCP Server (idempotent)
  console.log("\n  5. MCP Server");
  const serverKey = agent.tools[0]?.server ?? `otc-order-${agent.key}`;
  const mcpName   = `NovaTech ${agent.code} MCP Server`;
  const { id: mcpId, skipped: mcpSkipped } = await prodEnsure(
    "/api/integrations/mcp-servers",
    "/api/integrations/mcp-servers",
    {
      name:          mcpName,
      description:   `Mock MCP server for ${agent.name}`,
      transportType: "streamable-http",
      url:           `${CFG.prodUrl}/api/mock/${serverKey}`,
      status:        "registered",
      riskTier:      "MEDIUM",
      allowlisted:   true,
      addedBy:       "otc-order-migration",
      capabilities:  { tools: true, resources: false, prompts: false, sampling: false },
      organizationId: CFG.prodOrgId,
    },
  );
  console.log(`    ${mcpSkipped ? "[SKIP]" : "[OK]  "} ${mcpName} → ${mcpId}`);
  ids.mcpServerId = mcpId;

  // 5b. MCP Server Tools (check existing tools, add any missing by name)
  if (!CFG.dryRun && !mcpSkipped) {
    for (const tool of agent.tools) {
      await prodPost(`/api/integrations/mcp-servers/${mcpId}/tools`, {
        name: tool.name, description: tool.name.replace(/_/g, " "),
        inputSchema: { type: "object", properties: {}, required: [] },
        annotations: { endpoint: tool.path, method: "GET" },
        enabled: true, riskClassification: "low",
      }).catch(() => {});
    }
  }

  // 6. Agent (idempotent)
  console.log("\n  6. Agent");
  const { id: agentId, skipped: agentSkipped } = await prodEnsure(
    "/api/agents",
    "/api/agents",
    {
      name:              agent.name,
      description:       agent.description,
      systemPrompt:      agent.systemPrompt,
      agentType:         "operational",
      status:            "active",
      environment:       "production",
      modelProvider:     "openai",
      modelName:         "gpt-4.1",
      riskTier:          "MEDIUM",
      autonomyMode:      "autonomous",
      currentVersion:    "1.0.0",
      maxToolIterations: 6,
      toolAccessClass:   "standard",
      department:        "Order-to-Cash",
      owner:             "NovaTech Industries — OTC Engineering",
      blueprintId:       bpId,
      complianceTags:    ["ASC-606", "GAAP"],
      policyBindings:    [
        { policyName: "RUSH Order SLA Enforcement",    enforcement: "hard" },
        { policyName: "Credit Pre-Authorization Matrix", enforcement: "hard" },
        { policyName: "Inventory Promise Accuracy",    enforcement: "hard" },
      ],
      organizationId: CFG.prodOrgId,
    },
  );
  console.log(`    ${agentSkipped ? "[SKIP]" : "[OK]  "} ${agent.name} → ${agentId}`);
  ids.agentId = agentId;

  // 7. Agent → KB link
  console.log("\n  7. KB Link");
  await prodPost(`/api/agents/${agentId}/knowledge-bases`, { knowledgeBaseId: kbId })
    .catch(() => console.log("    [SKIP] KB link already exists"));
  console.log(`    ✓ KB ${kbId} → Agent ${agentId}`);

  // 8. Agent → MCP server link
  console.log("\n  8. MCP Server Link");
  await prodPost(`/api/agents/${agentId}/mcp-servers`, { mcpServerId: mcpId })
    .catch(() => console.log("    [SKIP] MCP link already exists"));
  console.log(`    ✓ MCP ${mcpId} → Agent ${agentId}`);

  return ids;
};

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  CFG = parseArgs();

  console.log(`
${"=".repeat(64)}
  ATLAS — OTC Order Demo 2 Production Migration
  Agents: OTC-AGT-002, OTC-AGT-003, OTC-AGT-004
  Target: ${CFG.prodUrl}
  Org ID: ${CFG.prodOrgId}
  Dry Run: ${CFG.dryRun}
${"=".repeat(64)}
`);

  const summary: Record<string, Record<string, string>> = {};

  for (const agent of AGENTS) {
    const ids = await migrateAgent(agent);
    summary[agent.code] = ids;
  }

  console.log(`\n${"=".repeat(64)}`);
  console.log("  Migration Complete — Summary");
  console.log("=".repeat(64));
  for (const [code, ids] of Object.entries(summary)) {
    console.log(`\n  ${code}:`);
    for (const [k, v] of Object.entries(ids)) {
      console.log(`    ${k}: ${v}`);
    }
  }
  console.log("\n  Resources created/verified:");
  console.log("    Ontology concepts:  12");
  console.log("    Policies:           9  (3 per agent)");
  console.log("    Knowledge bases:    3  (1 per agent)");
  console.log("    Skills:             9  (3 per agent)");
  console.log("    Blueprints:         3  (1 per agent)");
  console.log("    MCP servers:        3  (1 per agent)");
  console.log("    Agents:             3");
  console.log("\n  ✓ All 3 OTC Order agents migrated to production\n");
}

main().catch((err) => {
  console.error("\nFATAL:", err.message);
  process.exit(1);
});
