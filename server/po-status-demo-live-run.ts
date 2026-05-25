/**
 * Procurement PO Status Agent Demo
 * Cross-system: SAP (open POs) → SAP inventory check → SAP vendor lookup → Jira ticket creation
 *
 * Steps:
 *  1. sap_search_sales_orders  — Find open purchase orders overdue > 7 days
 *  2. sap_check_inventory      — Check stock levels for the ordered material
 *  3. sap_get_vendor           — Look up vendor master data and payment terms
 *  4. sap_get_purchase_order   — Full PO detail with line items
 *  5. jira_create_issue        — Create Jira escalation ticket for overdue PO
 */

import { getDefaultOrgId } from "./auth";

export interface PoDemoStep {
  id: number;
  title: string;
  tool: string;
  integration: string;
  status: "pending" | "running" | "complete" | "error";
  input?: Record<string, unknown>;
  output?: unknown;
  elapsedMs?: number;
  mode: "live" | "demo";
}

export interface PoDemoState {
  status: "idle" | "running" | "complete" | "error";
  startedAt: string | null;
  completedAt: string | null;
  steps: PoDemoStep[];
  summary: PoSummary | null;
  elapsedMs: number;
}

export interface PoSummary {
  poNumber: string;
  vendor: string;
  material: string;
  plant: string;
  stockOnHand: number;
  orderedQty: number;
  overdueDays: number;
  jiraTicket: string | null;
  jiraUrl: string | null;
  note: string;
}

let _state: PoDemoState = {
  status: "idle",
  startedAt: null,
  completedAt: null,
  steps: [],
  summary: null,
  elapsedMs: 0,
};

const DEMO_PO_NUMBER = "4500012847";
const DEMO_VENDOR_ID = "V-10042";
const DEMO_MATERIAL = "MAT-8821";
const DEMO_PLANT = "1000";
const DEMO_PROJECT = "PROC";

function resetState(): void {
  _state = {
    status: "idle",
    startedAt: null,
    completedAt: null,
    steps: [],
    summary: null,
    elapsedMs: 0,
  };
}

function initStep(id: number, title: string, tool: string, integration: string, input: Record<string, unknown>): PoDemoStep {
  return { id, title, tool, integration, status: "pending", input, mode: "demo" };
}

async function runPoDemo(orgId: string): Promise<void> {
  const start = Date.now();
  _state.status = "running";
  _state.startedAt = new Date().toISOString();

  const steps: PoDemoStep[] = [
    initStep(1, "Search SAP for open purchase orders overdue > 7 days", "sap_search_sales_orders", "sap", {
      status: "Open",
      date_to: new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10),
      top: 5,
    }),
    initStep(2, "Check inventory stock levels for ordered material", "sap_check_inventory", "sap", {
      material_id: DEMO_MATERIAL,
      plant: DEMO_PLANT,
    }),
    initStep(3, "Look up vendor master data and payment terms", "sap_get_vendor", "sap", {
      vendor_id: DEMO_VENDOR_ID,
    }),
    initStep(4, "Retrieve full PO detail with line items", "sap_get_purchase_order", "sap", {
      po_id: DEMO_PO_NUMBER,
    }),
    initStep(5, "Create Jira escalation ticket for overdue PO", "jira_create_issue", "jira", {
      project: DEMO_PROJECT,
      summary: `[OVERDUE PO] ${DEMO_PO_NUMBER} — Vendor ${DEMO_VENDOR_ID} — ${15} days past due`,
      issue_type: "Bug",
      priority: "High",
      description:
        `*Overdue Purchase Order Escalation*\n\n` +
        `PO Number: ${DEMO_PO_NUMBER}\n` +
        `Vendor: ${DEMO_VENDOR_ID}\n` +
        `Material: ${DEMO_MATERIAL} (Plant: ${DEMO_PLANT})\n` +
        `Days Overdue: 15\n\n` +
        `*Stock Status:* Current stock on hand is below reorder point. Immediate vendor follow-up required.\n\n` +
        `_Auto-escalated by Atlas PO Status Agent via SAP integration._`,
    }),
  ];
  _state.steps = steps;

  // ── Step 1: SAP search overdue POs ───────────────────────────────────────
  steps[0].status = "running";
  try {
    const { sapMcpServer } = await import("./integrations/sap/mcp-server");
    const t0 = Date.now();
    const result = await sapMcpServer.callTool("sap_search_sales_orders", steps[0].input!, orgId);
    steps[0].elapsedMs = Date.now() - t0;
    if (!result.isError) { steps[0].output = JSON.parse(result.content[0].text); steps[0].mode = "live"; }
    else steps[0].output = [
      { SalesOrder: DEMO_PO_NUMBER, SoldToParty: DEMO_VENDOR_ID, SalesOrderDate: "2026-05-10", TotalNetOrderAmount: 87400, SDProcessStatus: "Open", TransactionCurrency: "USD" },
      { SalesOrder: "4500012801", SoldToParty: "V-10039", SalesOrderDate: "2026-05-08", TotalNetOrderAmount: 23100, SDProcessStatus: "Open", TransactionCurrency: "USD" },
    ];
  } catch {
    steps[0].elapsedMs = 0;
    steps[0].output = [{ SalesOrder: DEMO_PO_NUMBER, SoldToParty: DEMO_VENDOR_ID, SalesOrderDate: "2026-05-10", TotalNetOrderAmount: 87400, SDProcessStatus: "Open" }];
  }
  steps[0].status = "complete";

  // ── Step 2: SAP inventory check ──────────────────────────────────────────
  steps[1].status = "running";
  let stockOnHand = 12;
  try {
    const { sapMcpServer } = await import("./integrations/sap/mcp-server");
    const t0 = Date.now();
    const result = await sapMcpServer.callTool("sap_check_inventory", steps[1].input!, orgId);
    steps[1].elapsedMs = Date.now() - t0;
    if (!result.isError) {
      steps[1].output = JSON.parse(result.content[0].text);
      steps[1].mode = "live";
      stockOnHand = (steps[1].output as any)?.[0]?.MatlStkQtyInMatlBaseUnit ?? stockOnHand;
    } else {
      steps[1].output = { Material: DEMO_MATERIAL, Plant: DEMO_PLANT, MatlStkQtyInMatlBaseUnit: stockOnHand, BaseUnit: "EA", reorderPoint: 50, status: "BELOW_REORDER" };
    }
  } catch {
    steps[1].elapsedMs = 0;
    steps[1].output = { Material: DEMO_MATERIAL, Plant: DEMO_PLANT, MatlStkQtyInMatlBaseUnit: stockOnHand, BaseUnit: "EA" };
  }
  steps[1].status = "complete";

  // ── Step 3: SAP vendor lookup ─────────────────────────────────────────────
  steps[2].status = "running";
  let vendorName = "Acme Industrial Supply Co.";
  try {
    const { sapMcpServer } = await import("./integrations/sap/mcp-server");
    const t0 = Date.now();
    const result = await sapMcpServer.callTool("sap_get_vendor", steps[2].input!, orgId);
    steps[2].elapsedMs = Date.now() - t0;
    if (!result.isError) {
      steps[2].output = JSON.parse(result.content[0].text);
      steps[2].mode = "live";
      vendorName = (steps[2].output as any)?.SupplierName ?? (steps[2].output as any)?.CardName ?? vendorName;
    } else {
      steps[2].output = { Supplier: DEMO_VENDOR_ID, SupplierName: vendorName, PaymentTerms: "NET30", Currency: "USD", Country: "US", IsBlocked: false, Email: "orders@acmeindustrial.com" };
    }
  } catch {
    steps[2].elapsedMs = 0;
    steps[2].output = { Supplier: DEMO_VENDOR_ID, SupplierName: vendorName };
  }
  steps[2].status = "complete";

  // ── Step 4: SAP full PO detail ────────────────────────────────────────────
  steps[3].status = "running";
  try {
    const { sapMcpServer } = await import("./integrations/sap/mcp-server");
    const t0 = Date.now();
    const result = await sapMcpServer.callTool("sap_get_purchase_order", steps[3].input!, orgId);
    steps[3].elapsedMs = Date.now() - t0;
    if (!result.isError) { steps[3].output = JSON.parse(result.content[0].text); steps[3].mode = "live"; }
    else steps[3].output = {
      PurchaseOrder: DEMO_PO_NUMBER,
      Supplier: DEMO_VENDOR_ID,
      CompanyCode: "1000",
      PurchaseOrderDate: "2026-05-10",
      TotalNetOrderAmount: 87400,
      DocumentCurrency: "USD",
      Items: [
        { PurchaseOrderItem: "10", Material: DEMO_MATERIAL, Plant: DEMO_PLANT, OrderQuantity: 500, OrderPriceUnit: "EA", NetPriceAmount: 87400, DeliveryDate: "2026-05-18" },
      ],
    };
  } catch {
    steps[3].elapsedMs = 0;
    steps[3].output = { PurchaseOrder: DEMO_PO_NUMBER, Supplier: DEMO_VENDOR_ID, TotalNetOrderAmount: 87400 };
  }
  steps[3].status = "complete";

  // ── Step 5: Jira ticket creation ──────────────────────────────────────────
  steps[4].status = "running";
  let jiraTicket: string | null = null;
  let jiraUrl: string | null = null;
  try {
    const { jiraMcpServer } = await import("./integrations/jira/mcp-server");
    const t0 = Date.now();
    const result = await jiraMcpServer.callTool("jira_create_issue", steps[4].input!, orgId);
    steps[4].elapsedMs = Date.now() - t0;
    if (!result.isError) {
      steps[4].output = JSON.parse(result.content[0].text);
      steps[4].mode = "live";
      jiraTicket = (steps[4].output as any)?.key ?? null;
      jiraUrl = (steps[4].output as any)?.url ?? null;
    } else {
      jiraTicket = `${DEMO_PROJECT}-4821`;
      jiraUrl = `https://acme.atlassian.net/browse/${jiraTicket}`;
      steps[4].output = { key: jiraTicket, url: jiraUrl, status: "Open", priority: "High", summary: steps[4].input!.summary };
    }
  } catch {
    steps[4].elapsedMs = 0;
    jiraTicket = `${DEMO_PROJECT}-4821`;
    jiraUrl = `https://acme.atlassian.net/browse/${jiraTicket}`;
    steps[4].output = { key: jiraTicket, url: jiraUrl };
  }
  steps[4].status = "complete";

  _state.summary = {
    poNumber: DEMO_PO_NUMBER,
    vendor: vendorName,
    material: DEMO_MATERIAL,
    plant: DEMO_PLANT,
    stockOnHand,
    orderedQty: 500,
    overdueDays: 15,
    jiraTicket,
    jiraUrl,
    note: "Cross-system: SAP open POs → inventory check → vendor master → Jira escalation ticket — no manual data gathering required",
  };

  _state.status = "complete";
  _state.completedAt = new Date().toISOString();
  _state.elapsedMs = Date.now() - start;
}

export function poTriggerHandler(req: any, res: any): void {
  if (_state.status === "running") {
    res.json({ message: "PO Status demo already running", status: "running" });
    return;
  }
  resetState();
  const orgId = (req as any).orgId ?? getDefaultOrgId();
  runPoDemo(orgId).catch(() => {
    _state.status = "error";
    _state.completedAt = new Date().toISOString();
  });
  res.json({ message: "PO Status Agent demo started", status: "running" });
}

export function poStatusHandler(_req: any, res: any): void {
  res.json(_state);
}

export function poResetHandler(_req: any, res: any): void {
  resetState();
  res.json({ message: "PO Status demo reset", status: "idle" });
}
