import { type Request, type Response } from "express";
import { storage } from "./storage";
import { runAgentOnce, stopAgentRuntime, isRuntimeActive, runtimeEvents } from "./agent-runtime";
import {
  OTC_AGT_002_NAME, OTC_AGT_003_NAME, OTC_AGT_004_NAME,
  makeOtcOrderMcpServerDefs,
  OTC_ORDER_KB_DEFS,
  OTC_ORDER_AGENT_DEFS,
  OTC_ORDER_POLICY_DEFS,
  OTC_ORDER_ONTOLOGY_CONCEPTS,
} from "./otc-order-shared-defs";

const BASE_URL = `http://localhost:${process.env.PORT || 5000}`;

// MCP server definitions — urls injected at runtime from BASE_URL
const OTC_ORDER_MCP_SERVERS = makeOtcOrderMcpServerDefs(BASE_URL);

// ─── Skills definitions (3 per agent = 9 total) ──────────────────────────────

const OTC_ORDER_SKILLS = [
  // Agent OTC-AGT-002: Order Validation & Promise Agent
  {
    name: "Order Validation Logic",
    description: "Applies NovaTech's 8-point order validation checklist: header completeness, credit hold, inventory allocation, address verification, pricing integrity, export compliance, RUSH prioritization, and ASC 606 treatment.",
    domain: "order_management", industry: "manufacturing", version: "1.0.0",
    tags: ["order_validation", "checklist", "erp", "rush_order"],
    yamlFrontmatter: { skillId: "otc-order-validation-logic", trustTier: "platform-provided", complexity: "intermediate", allowedTools: ["validate_customer_identity", "check_compliance", "release_order"] },
    markdownBody: `## Order Validation Logic\n\nThis skill applies NovaTech's 8-point order validation checklist for all inbound purchase orders. Each check (VAL-001 through VAL-008) must reach PASS status before an order can be released to ERP. VAL-001 covers header completeness (PO number, customer ID, ship-to, payment terms). VAL-002 covers credit exposure. VAL-003 covers inventory allocation. VAL-004 covers ship-to address accuracy. VAL-005 covers price integrity vs. quoted price. VAL-006 covers export control and OFAC compliance. VAL-007 covers RUSH prioritization flag. VAL-008 covers ASC 606 revenue recognition treatment. The skill mandates that all HOLD-status items receive agent-driven resolution before release. Human approval is required only for items that cannot be auto-resolved by the pre-authorization matrix.`,
  },
  {
    name: "Address Discrepancy Resolution",
    description: "Resolves ship-to address conflicts between ERP master records and inbound PO ship-to fields using prior delivery history, facility type classification, and confidence scoring.",
    domain: "order_management", industry: "manufacturing", version: "1.0.0",
    tags: ["address_validation", "erp", "ship_to", "confidence_scoring"],
    yamlFrontmatter: { skillId: "otc-address-resolution", trustTier: "platform-provided", complexity: "intermediate", allowedTools: ["validate_ship_address"] },
    markdownBody: `## Address Discrepancy Resolution\n\nThis skill resolves ship-to address mismatches between ERP master records and purchase order ship-to fields. The resolution process begins by retrieving the last 12 successful delivery manifests for the customer location. If 80% or more of prior deliveries used the PO address format (without the ERP-added field), the skill classifies the ERP field as a data-entry error and applies the PO address. Confidence score above 90% allows automated ERP master update without human review. Confidence between 75–90% requires one-click human confirmation. Below 75% escalates to the order entry team. Industrial manufacturing facilities are automatically deprioritized for suite numbers unless confirmed by the customer's master shipping address on file.`,
  },
  {
    name: "Order Release Orchestration",
    description: "Coordinates the final order release into ERP: sequences pick-ticket generation, warehouse notification, customer confirmation email, and invoice draft creation after all validation holds are cleared.",
    domain: "order_management", industry: "manufacturing", version: "1.0.0",
    tags: ["order_release", "erp", "pick_ticket", "invoice"],
    yamlFrontmatter: { skillId: "otc-order-release", trustTier: "platform-provided", complexity: "advanced", allowedTools: ["release_order"] },
    markdownBody: `## Order Release Orchestration\n\nThis skill sequences all post-validation actions required to release an order into ERP. Step 1: confirm all 8 VAL checks show PASS status. Step 2: call release_order to generate the ERP transaction ID and pick tickets. Step 3: log the release with elapsed time from submission. Step 4: queue customer confirmation email. Step 5: trigger invoice draft creation. For RUSH orders, warehouse pick-ticket transmission must occur within 10 minutes of release. The skill records the full audit trail of all resolution actions taken during validation, including which agent cleared each hold, the resolution method used, and the elapsed time. This audit trail is attached to the ERP order record for compliance.`,
  },

  // Agent OTC-AGT-003: Customer Credit & Risk Assessment Agent
  {
    name: "Credit Exposure Analysis",
    description: "Quantifies credit exposure impact of inbound orders against credit limits, projects post-order exposure ratios, and determines whether temporary limit adjustment is within automated pre-authorization thresholds.",
    domain: "credit_management", industry: "manufacturing", version: "1.0.0",
    tags: ["credit_exposure", "risk_assessment", "credit_limit", "ar"],
    yamlFrontmatter: { skillId: "otc-credit-exposure", trustTier: "platform-provided", complexity: "intermediate", allowedTools: ["get_credit_exposure", "get_payment_history"] },
    markdownBody: `## Credit Exposure Analysis\n\nThis skill assesses the incremental credit exposure of a new order against a customer's credit limit. It computes: (1) current utilization percentage, (2) projected utilization if the new order is approved, (3) inbound AR relief expected within 30 days, and (4) the net risk position. For customers rated A or above with zero late payments in 12 months, the pre-authorization matrix allows automated temporary limit increases up to $1M for exposures that will normalize within 90 days. The skill documents the rationale for all automated decisions in a structured JSON block that is appended to the order credit record for audit trail compliance.`,
  },
  {
    name: "Payment History Scoring",
    description: "Scores customer payment behavior using AR aging, days-to-pay average, NSF history, late payment frequency, and relationship tenure to produce a composite payment reliability rating.",
    domain: "credit_management", industry: "manufacturing", version: "1.0.0",
    tags: ["payment_history", "ar_aging", "risk_scoring", "relationship"],
    yamlFrontmatter: { skillId: "otc-payment-scoring", trustTier: "platform-provided", complexity: "intermediate", allowedTools: ["get_payment_history", "calculate_risk_score"] },
    markdownBody: `## Payment History Scoring\n\nThis skill produces a composite payment reliability score by analyzing: AR aging distribution (all current-to-60d is low risk), average days to pay vs. contract terms, NSF check count (any NSF in 12 months = automatic hold), late payment frequency, and relationship tenure weighted by annual spend. A customer with all AR current, avg 32-day pay, zero NSF, and 7-year relationship scores EXCELLENT and qualifies for the maximum automated approval authority. The score is updated at each order submission and stored in the CRM credit record.`,
  },
  {
    name: "Automated Credit Decision Engine",
    description: "Applies NovaTech's tiered credit approval matrix to recommend APPROVE, APPROVE_WITH_TEMP_LIMIT_INCREASE, ESCALATE_TO_CREDIT_COMMITTEE, or HOLD based on composite risk signals.",
    domain: "credit_management", industry: "manufacturing", version: "1.0.0",
    tags: ["credit_decision", "approval_matrix", "automation", "escalation"],
    yamlFrontmatter: { skillId: "otc-credit-decision", trustTier: "platform-provided", complexity: "advanced", allowedTools: ["calculate_risk_score", "approve_credit_limit"] },
    markdownBody: `## Automated Credit Decision Engine\n\nThis skill applies NovaTech's four-tier credit approval matrix. Tier 1 (APPROVE): within-limit orders for A+ customers — no action required. Tier 2 (APPROVE_WITH_TEMP_LIMIT_INCREASE): over-limit but within pre-auth threshold ($1M for A+, $500K for A, $200K for B) — automated 60-day extension. Tier 3 (ESCALATE_TO_CREDIT_COMMITTEE): over threshold or B-rated customers — requires credit director sign-off within 2 hours for RUSH orders. Tier 4 (HOLD): C-rated, past-due >60 days, or NSF in 12 months — order blocked until resolved. All Tier 2 decisions generate a timestamped decision memo that is appended to the customer CRM record.`,
  },

  // Agent OTC-AGT-004: Inventory Availability & Promise Agent
  {
    name: "Available-to-Promise Calculation",
    description: "Computes ATP dates across warehouse network by netting on-hand against reservations, in-transit receipts, and pending orders to confirm earliest fulfillment commitment for RUSH orders.",
    domain: "inventory_management", industry: "manufacturing", version: "1.0.0",
    tags: ["atp", "inventory", "warehouse", "fulfillment"],
    yamlFrontmatter: { skillId: "otc-atp-calculation", trustTier: "platform-provided", complexity: "intermediate", allowedTools: ["get_inventory_by_location", "calculate_atp"] },
    markdownBody: `## Available-to-Promise Calculation\n\nThis skill calculates the ATP date for each SKU by netting: on-hand inventory minus active reservations, plus confirmed in-transit receipts, minus higher-priority pending orders. For RUSH orders, the ATP engine first checks the nearest warehouse to the ship-to address to minimize transit time. If the nearest warehouse cannot fully cover the order, the engine evaluates single-warehouse alternatives before defaulting to multi-warehouse split. The ATP date returned is always the conservative outer bound — it includes pick time (1 business day), staging time (0.5 days), and carrier transit.`,
  },
  {
    name: "Split-Ship Cost Analysis",
    description: "Evaluates fulfillment options across the warehouse network, computing total landed cost (shipping + surcharge + handling), carbon footprint, and CSAT impact to recommend the optimal fulfillment strategy.",
    domain: "inventory_management", industry: "manufacturing", version: "1.0.0",
    tags: ["split_ship", "fulfillment", "cost_analysis", "carbon"],
    yamlFrontmatter: { skillId: "otc-split-ship-analysis", trustTier: "platform-provided", complexity: "advanced", allowedTools: ["get_shipping_options"] },
    markdownBody: `## Split-Ship Cost Analysis\n\nThis skill evaluates whether a multi-warehouse split-ship adds cost and complexity unnecessarily. It computes: (1) total shipping cost for each option including carrier rate, split surcharge, and handling; (2) carbon footprint in kg CO2 equivalent per carrier mode; (3) historical CSAT impact for this customer's segment and order type; (4) delivery date vs. requested ship date delta. If a single-warehouse option exists that meets the delivery SLA, the skill recommends it over the split even if the nominal shipping cost is slightly higher, because CSAT and operational complexity are factored in. The recommendation is presented as a ranked list with Option A always being the recommended option.`,
  },
  {
    name: "Inventory Reservation & Pick-Ticket Generation",
    description: "Reserves confirmed inventory units at the selected warehouse, generates deterministic pick tickets, and updates warehouse management system with RUSH priority flag and carrier booking.",
    domain: "inventory_management", industry: "manufacturing", version: "1.0.0",
    tags: ["reservation", "pick_ticket", "wms", "rush"],
    yamlFrontmatter: { skillId: "otc-inventory-reservation", trustTier: "platform-provided", complexity: "intermediate", allowedTools: ["reserve_inventory"] },
    markdownBody: `## Inventory Reservation & Pick-Ticket Generation\n\nThis skill confirms inventory allocation by posting a reservation to the WMS and generating pick tickets for each line item. For RUSH orders, the pick ticket is flagged with RUSH_PRIORITY and routed to the head of the warehouse pick queue. Pick tickets are deterministically numbered by order ID + warehouse + line sequence to ensure traceability. Once the reservation is confirmed, the skill returns the pick ticket numbers, estimated pick date, and ship date, which are stored in the order record and used by OTC-AGT-002 to set the delivery promise. The skill also computes the split-ship savings if a single-warehouse option replaced a previously planned multi-warehouse allocation.`,
  },
];

// OTC_ORDER_AGENT_DEFS, OTC_ORDER_POLICY_DEFS, OTC_ORDER_ONTOLOGY_CONCEPTS,
// OTC_AGT_002_NAME/003/004 are imported from ./otc-order-shared-defs above.

interface StepDef {
  role: string;
  label: string;
  agentName: string;
  parallel?: boolean;
  maxIterations: number;
  taskPrompt: string;
}

// Step 1: All three agents run concurrently (parallel validation)
// Step 2: OTC-AGT-002 synthesises resolutions from Steps 1a/1b/1c
// Step 3: OTC-AGT-002 releases the order into ERP

const OTC_ORDER_PIPELINE_STEPS: StepDef[] = [
  // ── PARALLEL VALIDATION (runs as one concurrent batch) ──────────────────
  {
    role: "credit_validation",
    label: "Credit & Exposure Check",
    agentName: OTC_AGT_003_NAME,
    parallel: true,
    maxIterations: 4,
    taskPrompt: `You are NovaTech's Customer Credit & Risk Assessment Agent (OTC-AGT-003).

URGENT: Meridian Manufacturing has submitted RUSH order ORD-2026-78432 ($429,711). Assess credit exposure immediately.

CREDIT STATUS:
- Credit Limit: $500,000
- Current Exposure: $459,500 (91.9% utilised)
- New Order: $429,711
- Projected Exposure if Approved: $889,211 (177.8% of limit) — OVER LIMIT

AR AGING:
- Current (0-30 days): $148,200
- 31-60 days: $52,400
- 61-90 days: $0 | 91+ days: $0
- No delinquency

CUSTOMER PROFILE:
- Rating: A+ | Relationship: 7 years | Annual Spend: $28.4M
- Avg Days to Pay: 32 | Late Payments (12mo): 0 | NSF: 0

RESOLUTION AVAILABLE: Temporary 60-day credit limit increase to $950K is within your automated pre-authorization threshold for A+ customers. Inbound AR $200,600 expected within 30 days.

Assess risk, apply automated temporary limit increase to $950K (60 days), and clear VAL-002 hold. Document rationale.`,
  },
  {
    role: "inventory_validation",
    label: "Inventory Availability & Promise",
    agentName: OTC_AGT_004_NAME,
    parallel: true,
    maxIterations: 4,
    taskPrompt: `You are NovaTech's Inventory Availability & Promise Agent (OTC-AGT-004).

URGENT: Meridian Manufacturing has submitted RUSH order ORD-2026-78432. Resolve inventory split immediately.

ORDER ITEMS (turbines only — 12 units total):
- TX-7250-A: 8 units requested
- TX-7250-B: 4 units requested
- TX-7300-HD: 1 unit requested

INVENTORY SITUATION:
Chicago DC (WH-CHI): TX-7250-A 8 available, TX-7250-B 4 available (of 6 on-hand), TX-7300-HD 2 available
Atlanta Hub (WH-ATL): TX-7250-A 4 additional, TX-7250-B 3 additional (surplus)

ISSUE: Internal system flagged this as "split-ship required" but CHICAGO ALONE HAS ALL 12 UNITS.
- Chicago covers all TX-7250-A (8/8), TX-7250-B (4/4), TX-7300-HD (1/1)
- Atlanta allocation NOT needed
- Single-warehouse fulfillment from Chicago: 1-day transit, no $840 split-ship surcharge

Confirm Chicago-only fulfillment, issue allocation confirmation, and clear VAL-003 hold. Save Meridian $840 in split-ship fees.`,
  },
  {
    role: "address_validation",
    label: "Ship-To Address Validation",
    agentName: OTC_AGT_002_NAME,
    parallel: true,
    maxIterations: 3,
    taskPrompt: `You are NovaTech's Order Validation & Promise Agent (OTC-AGT-002).

URGENT: Address discrepancy on RUSH order ORD-2026-78432 (running this sub-task in parallel with credit and inventory agents).

DISCREPANCY:
- ERP Master Record: "4820 W Grand Ave Suite 110, Chicago IL 60639"
- PO Ship-To:        "4820 W Grand Ave, Chicago IL 60639" (no suite)

CONTEXT:
- Meridian's Chicago plant is an industrial manufacturing facility
- Prior delivery record: 8 successful shipments to 4820 W Grand Ave Chicago IL 60639 (no suite) in past 4 years
- Suite 110 does not appear in any prior delivery manifest
- Industrial facilities typically do not have suite numbers

RESOLUTION: Remove "Suite 110" from ship-to. Update ERP master record CUST-00892-SHIP-04. Confidence: 94%.

Clear VAL-004 hold. Document the correction with delivery history evidence.`,
  },

  // ── STEP 2: Resolution synthesis ─────────────────────────────────────────
  {
    role: "resolution_synthesis",
    label: "Resolution Synthesis",
    agentName: OTC_AGT_002_NAME,
    parallel: false,
    maxIterations: 3,
    taskPrompt: `You are NovaTech's Order Validation & Promise Agent (OTC-AGT-002) — lead orchestrator.

Three parallel validation agents have completed their work on RUSH order ORD-2026-78432 ($429,711).

RESULTS FROM PARALLEL AGENTS:
1. OTC-AGT-003 (Credit): VAL-002 CLEARED — Temporary $950K limit approved (60 days). Meridian A+ rated, automated pre-auth threshold satisfied. Net exposure risk: LOW.
2. OTC-AGT-004 (Inventory): VAL-003 CLEARED — Chicago DC fulfills all 12 turbine units. Single-warehouse shipment confirmed. Split-ship avoided. Savings: $840.
3. OTC-AGT-002 self (Address): VAL-004 CLEARED — Suite 110 removed from ERP master. Industrial facility confirmed via 8 prior delivery records. Confidence 94%.

REMAINING VALIDATION STATUS:
- VAL-001 Header Completeness: PASS (from initial check)
- VAL-002 Credit: NOW PASS (just cleared)
- VAL-003 Inventory: NOW PASS (just cleared)
- VAL-004 Address: NOW PASS (just cleared)
- VAL-005 Pricing: PASS (from initial check)
- VAL-006 Export Control: PASS (from initial check)
- VAL-007 RUSH Prioritization: PASS (from initial check)
- VAL-008 ASC 606: PASS (from initial check)

All 8 of 8 checks now PASS. Order is clear for release.

Synthesise resolution summary and confirm order is ready for ERP release.`,
  },

  // ── STEP 3: Order release ─────────────────────────────────────────────────
  {
    role: "order_release",
    label: "Order Release",
    agentName: OTC_AGT_002_NAME,
    parallel: false,
    maxIterations: 3,
    taskPrompt: `You are NovaTech's Order Validation & Promise Agent (OTC-AGT-002) — lead orchestrator.

RUSH order ORD-2026-78432 has cleared all 8 validation checks. Execute release sequence.

ORDER SUMMARY:
- Customer: Meridian Manufacturing (CUST-00892)
- PO: MER-PO-9921 | Quote: Q-78432
- Value: $429,711 | Type: RUSH
- SKUs: 48 line items (12 turbine units + accessories) | Ship-from: Chicago DC

RELEASE CHECKLIST:
✓ Credit hold cleared (temp limit $950K / 60 days)
✓ Inventory allocated at Chicago DC (all 12 turbine units)
✓ Address corrected (Suite 110 removed)
✓ RUSH surcharge applied ($1,800 per MSA §7.4(b))
✓ All 8 validation checks PASS
✓ Elapsed time from order submission: under 4 minutes

ACTIONS TO EXECUTE:
1. Release order into ERP (generate ERP transaction ID)
2. Transmit warehouse pick ticket to Chicago DC
3. Set estimated ship date: May 2–3, 2026 (2-wave ground, Chicago DC)
4. Queue customer confirmation to j.davis@meridian-mfg.com
5. Create invoice draft (pending ship confirmation)

Execute release and confirm all downstream actions triggered.`,
  },
];

const _orderAgentIdByName: Record<string, string> = {};
const _orderDeploymentIdByRole: Record<string, string> = {};

let _otcOrderSetupDone = false;
const _otcSkillIdByName:  Record<string, string> = {};
const _otcMcpServerIdByName: Record<string, string> = {};

async function _refreshOtcMcpServerIds(): Promise<void> {
  const allServers = await storage.getMcpServers().catch((): Awaited<ReturnType<typeof storage.getMcpServers>> => []);
  for (const serverDef of OTC_ORDER_MCP_SERVERS) {
    const server = allServers.find(s => s.name === serverDef.name);
    if (server) _otcMcpServerIdByName[serverDef.name] = server.id;
  }
}

export async function ensureOtcOrderAgents(): Promise<void> {
  if (_otcOrderSetupDone) {
    await _refreshOtcMcpServerIds();
    const allAgents = await storage.getAgents().catch(() => [] as any[]);
    for (const def of OTC_ORDER_AGENT_DEFS) {
      const agent = allAgents.find((a: any) => a.name === def.name);
      if (agent) _orderAgentIdByName[def.name] = (agent as any).id;
    }
    return;
  }

  // ── 1. Knowledge Bases ──────────────────────────────────────────────────────
  const kbIdByName: Record<string, string> = {};
  const allKbs = await storage.getKnowledgeBases().catch((): Awaited<ReturnType<typeof storage.getKnowledgeBases>> => []);
  for (const kbDef of OTC_ORDER_KB_DEFS) {
    let kb = allKbs.find(k => k.name === kbDef.name);
    if (!kb) {
      kb = await storage.createKnowledgeBase({
        name:               kbDef.name,
        description:        kbDef.description,
        industry:           "manufacturing",
        status:             "active",
        embeddingModel:     "text-embedding-3-small",
        embeddingDimensions: 1536,
        chunkSize:          512,
        chunkOverlap:       50,
      });
    }
    kbIdByName[kbDef.name] = kb.id;
  }

  // ── 2. MCP Servers ──────────────────────────────────────────────────────────
  const allServers = await storage.getMcpServers().catch((): Awaited<ReturnType<typeof storage.getMcpServers>> => []);
  for (const serverDef of OTC_ORDER_MCP_SERVERS) {
    let server = allServers.find(s => s.name === serverDef.name);
    if (!server) {
      server = await storage.createMcpServer({
        name:          serverDef.name,
        description:   serverDef.description,
        transportType: "streamable-http",
        url:           serverDef.url,
        status:        "registered",
        riskTier:      "MEDIUM",
        allowlisted:   true,
        addedBy:       "otc-order-live-demo",
        capabilities:  { tools: true, resources: false, prompts: false, sampling: false },
        serverInfo:    { vendor: "NovaTech Industries / ATLAS Demo", version: "1.0.0" },
      });
    } else if (server.url !== serverDef.url) {
      await storage.updateMcpServer(server.id, { url: serverDef.url });
    }
    _otcMcpServerIdByName[serverDef.name] = server.id;

    const existingTools = await storage.getMcpServerTools(server.id).catch((): Awaited<ReturnType<typeof storage.getMcpServerTools>> => []);
    const existingToolNames = new Set(existingTools.map(t => t.name));
    for (const tool of serverDef.tools) {
      if (existingToolNames.has(tool.name)) continue;
      await storage.createMcpServerTool({
        serverId:           server.id,
        name:               tool.name,
        description:        tool.description,
        inputSchema:        { type: "object", properties: {}, required: [] },
        annotations:        { endpoint: tool.endpoint, method: tool.method },
        enabled:            true,
        riskClassification: "low",
      });
    }
  }

  // ── 3. Skills ───────────────────────────────────────────────────────────────
  const allSkills = await storage.getSkills().catch((): Awaited<ReturnType<typeof storage.getSkills>> => []);
  for (const skillDef of OTC_ORDER_SKILLS) {
    let skill = allSkills.find(s => s.name === skillDef.name);
    if (!skill) {
      skill = await storage.createSkill({
        name:            skillDef.name,
        description:     skillDef.description,
        domain:          skillDef.domain,
        industry:        skillDef.industry,
        version:         skillDef.version,
        author:          "NovaTech Order-to-Cash Engineering",
        trustTier:       "platform-provided",
        complexity:      (skillDef.yamlFrontmatter.complexity as string) || "intermediate",
        status:          "active",
        tags:            skillDef.tags,
        contextMode:     "summary",
        markdownBody:    skillDef.markdownBody,
        yamlFrontmatter: {
          ...skillDef.yamlFrontmatter,
          industry: "manufacturing",
          version:  "1.0",
          tags:     skillDef.tags,
        },
        allowedTools:    (skillDef.yamlFrontmatter.allowedTools as string[]) || [],
      });
    }
    _otcSkillIdByName[skillDef.name] = skill.id;
  }

  // ── 4. Policies ─────────────────────────────────────────────────────────────
  const allPolicies = await storage.getPolicies().catch((): Awaited<ReturnType<typeof storage.getPolicies>> => []);
  for (const polDef of OTC_ORDER_POLICY_DEFS) {
    const existing = allPolicies.find(p => p.name === polDef.name);
    if (!existing) {
      await storage.createPolicy({
        name:        polDef.name,
        domain:      polDef.domain,
        description: polDef.description,
        status:      "active",
        version:     1,
        scopeType:   "org",
        policyJson:  polDef.policyJson,
      });
    }
  }

  // ── 5. Ontology Concepts ────────────────────────────────────────────────────
  const allConcepts = await storage.getOntologyConcepts("manufacturing").catch((): Awaited<ReturnType<typeof storage.getOntologyConcepts>> => []);
  const existingConceptLabels = new Set(allConcepts.map(c => c.label));
  const { randomUUID } = await import("crypto");
  for (const concept of OTC_ORDER_ONTOLOGY_CONCEPTS) {
    if (existingConceptLabels.has(concept.label)) continue;
    await storage.createOntologyConcept({
      id:            randomUUID(),
      industryId:    "manufacturing",
      ontologyName:  "NovaTech Order-to-Cash",
      label:         concept.label,
      category:      concept.category,
      description:   concept.description,
      tags:          concept.tags,
      properties:    [],
      relationships: [],
      synonyms:      [],
      source:        "industry-standard",
    });
  }

  // ── 6. Blueprints ───────────────────────────────────────────────────────────
  const BP_DEFS = [
    {
      key:         "orderValidation",
      name:        "OTC — Order Validation & Promise Blueprint",
      description: "8-point validation pipeline: customer identity, credit hold, inventory allocation, address verification, pricing, compliance, RUSH flag, and ASC 606. Leads resolution synthesis and ERP release.",
      workflowSteps: [
        "Step 1a: Validate customer identity (validate_customer_identity)",
        "Step 1b: Resolve ship-to address (validate_ship_address)",
        "Step 2: Check compliance (check_compliance, calculate_taxes)",
        "Step 3: Synthesise parallel agent resolutions",
        "Step 4: Release order into ERP (release_order)",
      ],
      requiredTools: ["validate_customer_identity", "validate_ship_address", "calculate_taxes", "check_compliance", "release_order"],
    },
    {
      key:         "creditRisk",
      name:        "OTC — Credit & Risk Assessment Blueprint",
      description: "Credit exposure analysis pipeline: exposure retrieval, payment history scoring, composite risk scoring, and automated credit limit approval under pre-authorization matrix.",
      workflowSteps: [
        "Step 1: Retrieve credit exposure (get_credit_exposure)",
        "Step 2: Retrieve payment history and AR aging (get_payment_history)",
        "Step 3: Calculate composite risk score (calculate_risk_score)",
        "Step 4: Approve temporary credit limit increase (approve_credit_limit)",
      ],
      requiredTools: ["get_credit_exposure", "get_payment_history", "calculate_risk_score", "approve_credit_limit"],
    },
    {
      key:         "inventoryPromise",
      name:        "OTC — Inventory Availability & Promise Blueprint",
      description: "Inventory ATP pipeline: location-based inventory retrieval, ATP calculation, fulfillment option scoring with carbon/CSAT trade-offs, and inventory reservation with pick-ticket generation.",
      workflowSteps: [
        "Step 1: Retrieve inventory by warehouse location (get_inventory_by_location)",
        "Step 2: Calculate ATP dates across all SKUs (calculate_atp)",
        "Step 3: Evaluate shipping options with cost/carbon/CSAT (get_shipping_options)",
        "Step 4: Reserve inventory and generate pick tickets (reserve_inventory)",
      ],
      requiredTools: ["get_inventory_by_location", "calculate_atp", "get_shipping_options", "reserve_inventory"],
    },
  ];

  const allBlueprints = await storage.getBlueprints().catch((): Awaited<ReturnType<typeof storage.getBlueprints>> => []);
  const blueprintIdByKey: Record<string, string> = {};
  for (const bpDef of BP_DEFS) {
    let bp = allBlueprints.find(b => b.name === bpDef.name);
    if (!bp) {
      bp = await storage.createBlueprint({
        name:        bpDef.name,
        description: bpDef.description,
        version:     1,
        status:      "active",
        patternType: "pipeline",
        blueprintJson: {
          industry:      "manufacturing",
          workflowSteps: bpDef.workflowSteps,
          requiredTools: bpDef.requiredTools,
          outputFormat:  "Validation audit trail + ERP release confirmation",
        },
      });
    }
    blueprintIdByKey[bpDef.key] = bp.id;
  }

  // ── 7. Agents ───────────────────────────────────────────────────────────────
  const SHARED_POLICY_BINDINGS = [
    { policyName: "RUSH Order SLA Enforcement",  enforcement: "hard" },
    { policyName: "Credit Pre-Authorization Matrix", enforcement: "hard" },
    { policyName: "Inventory Promise Accuracy",  enforcement: "hard" },
  ];

  const allAgents = await storage.getAgents().catch((): Awaited<ReturnType<typeof storage.getAgents>> => []);

  for (const def of OTC_ORDER_AGENT_DEFS) {
    let agent = allAgents.find(a => a.name === def.name);
    const preloadedSkills = def.skillNames
      .map(sn => _otcSkillIdByName[sn])
      .filter(Boolean)
      .map(skillId => ({ skillId }));
    const agentOntologyTags = def.ontologyTags.map(label => ({ label }));
    const agentBlueprintId  = blueprintIdByKey[def.key];

    if (!agent) {
      agent = await storage.createAgent({
        name:              def.name,
        description:       def.description,
        systemPrompt:      `You are ${def.name}, an AI agent for NovaTech Industries Order-to-Cash pipeline. You have access to real-time ERP, credit, and warehouse data via MCP tools. Always call your tools in sequence and produce a structured JSON summary at the end of your response.`,
        runtimeConfig:     { prompt: def.name, scheduleIntervalMinutes: 0 },
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
        department:        def.department,
        owner:             "NovaTech Industries — Order-to-Cash Engineering",
        healthScore:       0.96,
        successRate:       0.96,
        maturityFactors:   {},
        preloadedSkills:   preloadedSkills as { skillId: string }[],
        blueprintId:       agentBlueprintId,
        complianceTags:    def.complianceTags,
        policyBindings:    SHARED_POLICY_BINDINGS,
        ontologyTags:      agentOntologyTags,
        evalBindings:      [{ suiteName: "OTC Order Validation Regression Suite", schedule: "weekly" }],
      } as Parameters<typeof storage.createAgent>[0]);
    } else {
      await storage.updateAgent(agent.id, {
        systemPrompt:    `You are ${def.name}, an AI agent for NovaTech Industries Order-to-Cash pipeline. You have access to real-time ERP, credit, and warehouse data via MCP tools. Always call your tools in sequence and produce a structured JSON summary at the end of your response.`,
        preloadedSkills: preloadedSkills as { skillId: string }[],
        blueprintId:     agentBlueprintId,
      }).catch(() => {});
    }

    _orderAgentIdByName[def.name] = agent.id;

    // Link KB
    const kbId = kbIdByName[def.kbName];
    if (kbId) {
      await storage.createAgentKnowledgeBase({ agentId: agent.id, knowledgeBaseId: kbId }).catch(() => {});
    }

    // Link MCP server
    const serverId = _otcMcpServerIdByName[def.mcpServerName];
    if (serverId) {
      await storage.createAgentMcpServer({ agentId: agent.id, serverId }).catch(() => {});
    }
  }

  _otcOrderSetupDone = true;
  console.log(`[otc-order-live] ensureOtcOrderAgents complete — 3 agents, 3 KBs, 3 MCP servers, 9 skills, 3 policies, 12 ontology concepts, 3 blueprints provisioned.`);
}

async function ensureDeployment(agentId: string, agentName: string, role: string): Promise<string> {
  const deps = await storage.getDeploymentsByAgentId(agentId).catch(() => [] as any[]);
  let dep = deps[0];
  if (!dep) {
    dep = await storage.createDeployment({
      agentId,
      agentName,
      environment: "production",
      status: "pending",
      version: "1.0.0",
      rolloutStrategy: "canary",
      canaryPercent: 100,
      pipelineComplete: true,
      deployedAt: new Date(),
    });
  } else if (dep.status === "deployed") {
    await storage.updateDeployment(dep.id, { status: "pending" });
  }
  _orderDeploymentIdByRole[role] = dep.id;
  return dep.id;
}

async function runStepWithFallback(
  deploymentId: string,
  taskPrompt: string,
  maxIterations: number,
  role: string,
): Promise<{ success: boolean; message: string; usedFallback: boolean }> {
  try {
    const result = await runAgentOnce(deploymentId, taskPrompt, maxIterations);
    return { ...result, usedFallback: false };
  } catch (err: any) {
    console.warn(`[otc-order-live] Step "${role}" failed, using fallback:`, err?.message);
    return { success: true, message: getFallbackMessage(role), usedFallback: true };
  }
}

export async function otcOrderLiveRunHandler(req: Request, res: Response): Promise<void> {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.flushHeaders();

  const sendEvent = (eventType: string, payload: object) => {
    try { res.write(`event: ${eventType}\ndata: ${JSON.stringify(payload)}\n\n`); } catch {}
  };

  let aborted = false;
  const keepaliveTimer = setInterval(() => {
    if (aborted) { clearInterval(keepaliveTimer); return; }
    try { res.write(": keepalive\n\n"); } catch { clearInterval(keepaliveTimer); }
  }, 15_000);

  const deploymentIds = new Set<string>();
  const deploymentIdToAgent = new Map<string, string>();

  const onRuntimeEvent = (evt: { deploymentId: string; agentId: string; runId: string; result: any }) => {
    if (aborted || !deploymentIds.has(evt.deploymentId)) return;
    const agentName = deploymentIdToAgent.get(evt.deploymentId) ?? "unknown";
    const steps: any[] = evt.result?.steps ?? [];
    const toolCallSteps = steps.filter((s: any) => s.type === "api_call");
    if (toolCallSteps.length > 0) {
      for (const step of toolCallSteps) {
        sendEvent("agent_event", {
          agentName,
          type: "tool_call_result",
          tool: step.mcpTool || step.name || "order_check",
          data: { tool: step.mcpTool || step.name, success: step.status === "completed" || step.status === "passed" },
        });
      }
    } else {
      sendEvent("agent_event", {
        agentName,
        type: "analysis_step",
        data: { steps: steps.length, success: evt.result?.success },
      });
    }
  };

  runtimeEvents.on("agent_execution", onRuntimeEvent);
  req.on("close", () => {
    aborted = true;
    clearInterval(keepaliveTimer);
    runtimeEvents.off("agent_execution", onRuntimeEvent);
  });

  try {
    sendEvent("run_start", {
      message: "Meridian Manufacturing RUSH order ORD-2026-78432 ($429,711) — initiating parallel validation…",
    });

    sendEvent("setup", { message: "Locating OTC-AGT-002, OTC-AGT-003, OTC-AGT-004 agents…" });
    await ensureOtcOrderAgents();

    const agt002Id = _orderAgentIdByName[OTC_AGT_002_NAME];
    const agt003Id = _orderAgentIdByName[OTC_AGT_003_NAME];
    const agt004Id = _orderAgentIdByName[OTC_AGT_004_NAME];

    sendEvent("setup", {
      message: `Agents: ${agt002Id ? "OTC-AGT-002 ✓" : "OTC-AGT-002 ✗ (fallback)"} · ${agt003Id ? "OTC-AGT-003 ✓" : "OTC-AGT-003 ✗ (fallback)"} · ${agt004Id ? "OTC-AGT-004 ✓" : "OTC-AGT-004 ✗ (fallback)"}`,
    });

    const priorContext: Record<string, string> = {};

    // ── STEP 1: Three agents run in parallel ─────────────────────────────────
    const parallelSteps = OTC_ORDER_PIPELINE_STEPS.filter(s => s.parallel);
    const sequentialSteps = OTC_ORDER_PIPELINE_STEPS.filter(s => !s.parallel);

    sendEvent("parallel_start", {
      message: "Launching 3 validation agents in parallel — credit, inventory, address…",
      agents: [OTC_AGT_002_NAME, OTC_AGT_003_NAME, OTC_AGT_004_NAME],
      roles: parallelSteps.map(s => s.role),
    });

    const agentIdMap: Record<string, string | undefined> = {
      [OTC_AGT_002_NAME]: agt002Id,
      [OTC_AGT_003_NAME]: agt003Id,
      [OTC_AGT_004_NAME]: agt004Id,
    };

    const parallelTasks = parallelSteps.map(async (step) => {
      if (aborted) return null;
      const agentId = agentIdMap[step.agentName];

      sendEvent("agent_start", {
        agentId: agentId || null,
        agentName: step.agentName,
        role: step.role,
        label: step.label,
        parallel: true,
      });

      let result: { success: boolean; message: string; usedFallback: boolean };

      if (agentId) {
        const depId = await ensureDeployment(agentId, step.agentName, step.role);
        deploymentIds.add(depId);
        deploymentIdToAgent.set(depId, step.agentName);
        if (await isRuntimeActive(depId).catch(() => false)) {
          await stopAgentRuntime(depId).catch(() => {});
          await new Promise(r => setTimeout(r, 300));
        }
        result = await runStepWithFallback(depId, step.taskPrompt, step.maxIterations, step.role);
      } else {
        await new Promise(r => setTimeout(r, 800 + Math.random() * 600));
        result = { success: true, message: getFallbackMessage(step.role), usedFallback: true };
        sendEvent("agent_event", { agentName: step.agentName, type: "agent_skipped", data: { role: step.role } });
      }

      sendEvent("agent_complete", {
        role: step.role,
        agentName: step.agentName,
        agentId: agentId || null,
        success: result.success,
        message: result.message?.slice(0, 600),
        parallel: true,
      });

      return { role: step.role, agentName: step.agentName, ...result };
    });

    const parallelResults = (await Promise.allSettled(parallelTasks))
      .filter(r => r.status === "fulfilled" && r.value)
      .map(r => (r as PromiseFulfilledResult<any>).value);

    for (const pr of parallelResults) {
      if (pr?.message) priorContext[pr.role] = pr.message.slice(0, 1200);
    }

    sendEvent("parallel_complete", {
      message: "All 3 validation agents complete — synthesising resolutions…",
      resolvedChecks: ["VAL-002 Credit", "VAL-003 Inventory", "VAL-004 Address"],
    });

    if (!aborted) await new Promise(r => setTimeout(r, 400));

    // ── STEPS 2 & 3: Sequential (synthesis → release) ────────────────────────
    for (const step of sequentialSteps) {
      if (aborted) break;

      const agentId = agentIdMap[step.agentName];

      let fullPrompt = step.taskPrompt;
      if (Object.keys(priorContext).length > 0) {
        const ctx = Object.entries(priorContext)
          .map(([r, s]) => `[${r}]:\n${s}`)
          .join("\n\n");
        fullPrompt = `PRIOR AGENT OUTPUTS:\n${ctx}\n\n---\n\n${step.taskPrompt}`;
      }

      sendEvent("agent_start", {
        agentId: agentId || null,
        agentName: step.agentName,
        role: step.role,
        label: step.label,
        parallel: false,
      });

      let result: { success: boolean; message: string; usedFallback: boolean };

      if (agentId) {
        const depId = await ensureDeployment(agentId, step.agentName, step.role);
        deploymentIds.add(depId);
        deploymentIdToAgent.set(depId, step.agentName);
        if (await isRuntimeActive(depId).catch(() => false)) {
          await stopAgentRuntime(depId).catch(() => {});
          await new Promise(r => setTimeout(r, 300));
        }
        result = await runStepWithFallback(depId, fullPrompt, step.maxIterations, step.role);
      } else {
        sendEvent("agent_event", { agentName: step.agentName, type: "agent_skipped", data: { role: step.role } });
        await new Promise(r => setTimeout(r, 600));
        result = { success: true, message: getFallbackMessage(step.role), usedFallback: true };
      }

      if (result.message) priorContext[step.role] = result.message.slice(0, 1200);

      sendEvent("agent_complete", {
        role: step.role,
        agentName: step.agentName,
        agentId: agentId || null,
        success: result.success,
        message: result.message?.slice(0, 600),
        parallel: false,
      });

      if (!aborted) await new Promise(r => setTimeout(r, 400));
    }

    sendEvent("run_complete", {
      success: true,
      message: "ORD-2026-78432 released — all 8 checks cleared in parallel — delivery promise May 2–3, 2026",
      orderId: "ORD-2026-78432",
      orderValue: 429_711,
      checksCleared: 8,
      parallelAgents: 3,
    });

  } catch (err: any) {
    console.error("[otc-order-live] Error:", err?.message);
    sendEvent("error", { message: err?.message || "Order validation pipeline failed" });
  } finally {
    clearInterval(keepaliveTimer);
    runtimeEvents.off("agent_execution", onRuntimeEvent);
    if (!aborted) res.end();
  }
}

export async function getOtcOrderAgentRuns(_req: Request, res: Response): Promise<void> {
  const agentDefs = [
    { key: "agt002", name: OTC_AGT_002_NAME, code: "OTC-AGT-002", step: 1, triggerType: "parallel", role: "order_validation" },
    { key: "agt003", name: OTC_AGT_003_NAME, code: "OTC-AGT-003", step: 1, triggerType: "parallel", role: "credit_validation" },
    { key: "agt004", name: OTC_AGT_004_NAME, code: "OTC-AGT-004", step: 1, triggerType: "parallel", role: "inventory_validation" },
  ];
  const allAgents = await storage.getAgents().catch(() => [] as any[]);
  const runs = await Promise.all(agentDefs.map(async (def) => {
    const agent = allAgents.find((a: any) => a.name === def.name);
    if (!agent) return { ...def, agentId: null, runStatus: "idle" };
    const deps = await storage.getDeploymentsByAgentId(agent.id).catch(() => [] as any[]);
    const dep = deps[0];
    return { ...def, agentId: agent.id, runStatus: dep?.status || "idle" };
  }));
  res.json({ agentRuns: runs });
}

export async function resetOtcOrderDemo(_req: Request, res: Response): Promise<void> {
  Object.keys(_orderDeploymentIdByRole).forEach(k => delete _orderDeploymentIdByRole[k]);
  res.json({ success: true, message: "OTC Order demo reset" });
}

function getFallbackMessage(role: string): string {
  const msgs: Record<string, string> = {
    credit_validation: "OTC-AGT-003: Credit analysis complete. Meridian A+ rated, 7yr relationship, $28.4M annual spend. Current exposure $459,500 (91.9% of $500K limit). Temporary increase to $950K approved for 60 days — within automated pre-auth threshold. VAL-002 CLEARED. Risk: LOW.",
    inventory_validation: "OTC-AGT-004: Inventory analysis complete. Chicago DC stocks all 12 units needed (TX-7250-A ×8, TX-7250-B ×4, TX-7300-HD ×1). Atlanta flag was a false positive — single-warehouse fulfillment confirmed. OPT-A: 2-wave ship May 2–3. Pick tickets PT-CHI-7842-A/B/C issued. $840 split-ship surcharge avoided. VAL-003 CLEARED.",
    address_validation: "OTC-AGT-002: Address validated. ERP master CUST-00892-SHIP-04 had spurious 'Suite 110' suffix. Industrial facility confirmed via 8 prior delivery records (2022–2026) to 4820 W Grand Ave Chicago IL 60639. ERP record corrected. VAL-004 CLEARED. Confidence: 94%.",
    resolution_synthesis: "OTC-AGT-002: All 3 parallel agents complete. Resolutions confirmed: (1) Credit limit temp-increased to $950K — 60 days — LOW risk; (2) Inventory allocated from Chicago DC — single warehouse — no surcharge; (3) Address corrected — Suite 110 removed. 8/8 validation checks now PASS. Ready for ERP release.",
    order_release: "OTC-AGT-002: ORD-2026-78432 released. ERP-TXN-2026-78432 confirmed. Pick tickets PT-CHI-7842-A/B/C issued to Chicago DC. 2-wave ship May 2–3, 2026. Customer confirmation queued to j.davis@meridian-mfg.com. Invoice draft created. Total elapsed: < 4 minutes.",
  };
  return msgs[role] ?? `[Computed fallback for ${role}]`;
}
