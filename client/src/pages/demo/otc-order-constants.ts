import { useState, useCallback, useEffect } from "react";

// ─── Agent identifiers ──────────────────────────────────────────────────────
export const OTC_AGT_002_NAME = "Order Validation & Promise Agent";
export const OTC_AGT_003_NAME = "Customer Credit & Risk Assessment Agent";
export const OTC_AGT_004_NAME = "Inventory Availability & Promise Agent";

// ─── Order under validation ─────────────────────────────────────────────────
export const ORDER_CONTEXT = {
  orderId: "ORD-2026-78432",
  quoteRef: "Q-78432",
  poNumber: "MER-PO-9921",
  customer: "Meridian Manufacturing",
  customerId: "CUST-00892",
  orderDate: "April 14, 2026",
  requestedShipDate: "May 2, 2026",
  orderType: "RUSH" as const,
  value: 429_711,
  valueLabel: "$429,711",
  lineCount: 48,
  salesRep: "Sarah Chen",
  territory: "Midwest",
};

// ─── Three blocking issues ──────────────────────────────────────────────────
export const BLOCKING_ISSUES = [
  {
    id: "VAL-002",
    checkId: "VAL-002",
    category: "Credit",
    title: "Credit Exposure at 92% of Limit",
    severity: "HIGH" as const,
    agent: "OTC-AGT-003",
    agentName: OTC_AGT_003_NAME,
    detail: "Current exposure $459,500 = 91.9% of $500K limit. Order $429,711 would push to $889K (177.8%). Temporary limit increase required.",
    resolution: "Temporary $950K limit approved (60 days) — A+ rating, automated pre-auth",
    color: "text-red-400",
    bgColor: "bg-red-500/10",
    borderColor: "border-red-500/25",
  },
  {
    id: "VAL-003",
    checkId: "VAL-003",
    category: "Inventory",
    title: "Turbine Split Across 2 Warehouses",
    severity: "MEDIUM" as const,
    agent: "OTC-AGT-004",
    agentName: OTC_AGT_004_NAME,
    detail: "System flagged split-ship: Chicago DC (8 turbine units) + Atlanta Hub (4 turbine units). Chicago covers all 12 — consolidating May 2–3 ship avoids $840 surcharge.",
    resolution: "OPT-A confirmed — Chicago-only 2-wave ship May 2–3, $840 split-ship surcharge avoided",
    color: "text-amber-400",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/25",
  },
  {
    id: "VAL-004",
    checkId: "VAL-004",
    category: "Address",
    title: "Ship-To Suite Number Mismatch",
    severity: "LOW" as const,
    agent: "OTC-AGT-002",
    agentName: OTC_AGT_002_NAME,
    detail: "ERP has 'Suite 110' in master record. PO has no suite. Industrial facility — Suite 110 does not exist at this address.",
    resolution: "Suite 110 removed — confirmed via 8 prior delivery records (2022–2026)",
    color: "text-yellow-400",
    bgColor: "bg-yellow-500/10",
    borderColor: "border-yellow-500/25",
  },
];

// ─── All 8 validation checks ────────────────────────────────────────────────
export const VALIDATION_CHECKS = [
  { checkId: "VAL-001", name: "Order Header Completeness",     initialStatus: "PASS" as const, detail: "PO number, customer ID, order date — all present." },
  { checkId: "VAL-002", name: "Customer Credit Standing",       initialStatus: "HOLD" as const, detail: "Exposure 91.9% of limit. Credit agent resolving." },
  { checkId: "VAL-003", name: "Product Availability",           initialStatus: "HOLD" as const, detail: "Turbine inventory split. Inventory agent resolving." },
  { checkId: "VAL-004", name: "Ship-To Address",                initialStatus: "WARN" as const, detail: "Suite number discrepancy. Validation agent resolving." },
  { checkId: "VAL-005", name: "Pricing & Contract Alignment",   initialStatus: "PASS" as const, detail: "$429,711 matches Q-78432. MSA-2024-0892 in force." },
  { checkId: "VAL-006", name: "Export Control Screening",       initialStatus: "PASS" as const, detail: "No restricted party hits. EAR99 confirmed." },
  { checkId: "VAL-007", name: "RUSH Order Prioritization",      initialStatus: "PASS" as const, detail: "Expedite fee $1,800 applied. Warehouse notified." },
  { checkId: "VAL-008", name: "Revenue Recognition (ASC 606)",  initialStatus: "PASS" as const, detail: "Ship-and-bill treatment confirmed. Memo generated." },
];

// ─── Warehouse locations for inventory map ──────────────────────────────────
export const WAREHOUSES = [
  { id: "WH-CHI", name: "Chicago DC",    city: "Chicago",  state: "IL", txUnits:  8, atpDate: "May 2",   transit: "1 day",  recommended: true  },
  { id: "WH-ATL", name: "Atlanta Hub",   city: "Atlanta",  state: "GA", txUnits:  4, atpDate: "May 4",   transit: "3 days", recommended: false },
  { id: "WH-DAL", name: "Dallas Center", city: "Dallas",   state: "TX", txUnits:  0, atpDate: "N/A",     transit: "4 days", recommended: false },
];

export const FULFILLMENT_OPTIONS = [
  {
    id: "OPT-A",
    label: "Priority 2-Wave — Chicago DC Only",
    sublabel: "Recommended",
    recommended: true,
    coverage: "12/12 units — 2 waves (8 + 4)",
    shipDate: "May 2 + May 3, 2026",
    deliveryDate: "May 2 / May 3, 2026",
    shippingCost: 1_840,
    costLabel: "$1,840",
    transitDays: 2,
    carbonKg: 124,
    csatPct: 87,
    csatLabel: "87% acceptance rate",
    notes: "Two priority ground waves from Chicago DC — 8 units May 2, 4 units May 3. Avoids split-ship surcharge. Meridian 87% 2-wave acceptance.",
    borderClass: "border-green-500/50",
    badgeClass: "bg-green-500/15 text-green-400",
  },
  {
    id: "OPT-B",
    label: "Consolidated Single Wave — Chicago DC",
    sublabel: "Standard",
    recommended: false,
    coverage: "12/12 units (1 wave)",
    shipDate: "May 5, 2026",
    deliveryDate: "May 5, 2026",
    shippingCost: 2_120,
    costLabel: "$2,120",
    transitDays: 4,
    carbonKg: 98,
    csatPct: 74,
    csatLabel: "74% CSAT prediction",
    notes: "Single consolidated shipment. Lower carbon footprint but 3-day later delivery vs. Option A. Misses RUSH delivery window.",
    borderClass: "border-white/10",
    badgeClass: "bg-slate-500/15 text-slate-400",
  },
  {
    id: "OPT-C",
    label: "Air Express — Chicago O'Hare",
    sublabel: "Expedite",
    recommended: false,
    coverage: "12/12 units (1 flight)",
    shipDate: "May 1, 2026",
    deliveryDate: "May 1, 2026",
    shippingCost: 3_400,
    costLabel: "$3,400",
    transitDays: 1,
    carbonKg: 412,
    csatPct: 91,
    csatLabel: "91% CSAT prediction",
    notes: "Next-day air freight from O'Hare. Earliest possible delivery. $1,560 premium vs. Option A. 3.3× carbon footprint.",
    borderClass: "border-white/10",
    badgeClass: "bg-slate-500/15 text-slate-400",
  },
];

// ─── Credit profile summary ─────────────────────────────────────────────────
export const CREDIT_PROFILE = {
  limit: 500_000,
  limitLabel: "$500K",
  currentExposure: 459_500,
  currentExposurePct: 91.9,
  orderValue: 429_711,
  projectedExposure: 889_211,
  projectedExposurePct: 177.8,
  tempLimit: 950_000,
  tempLimitLabel: "$950K",
  tempLimitDays: 60,
  rating: "A+",
  yearsSince: 7,
  annualSpend: "$28.4M",
  avgDaysToPay: 32,
  latePayments: 0,
  arAging: {
    current: 148_200,
    days30: 52_400,
    days60: 0,
    days90plus: 0,
  },
};

// ─── Order release downstream actions ──────────────────────────────────────
export const RELEASE_ACTIONS = [
  { id: "ACT-001", agentCode: "OTC-AGT-005", label: "Customer Order Confirmation", detail: "Confirmation email queued to j.davis@meridian-mfg.com. Delivery promise: May 2–3, 2026. ERP-TXN-2026-78432 reference included.", icon: "mail",     status: "complete" as const },
  { id: "ACT-002", agentCode: "OTC-AGT-005", label: "Carrier Booking Confirmed",   detail: "2-wave ground booking confirmed. Chicago DC pick waves scheduled May 2 (8 units) + May 3 (4 units). Tracking IDs pending.",         icon: "truck",    status: "complete" as const },
  { id: "ACT-003", agentCode: "OTC-AGT-007", label: "Risk Register Update",        detail: "Temp credit limit $950K / 60 days logged to risk register. Auto-reverts Jun 13, 2026. LOW risk classification applied.",            icon: "shield",   status: "complete" as const },
  { id: "ACT-004", agentCode: "OTC-AGT-012", label: "AR Update",                   detail: "New receivable $429,711 + $1,840 RUSH surcharge created. Expected inbound within 30 days — reduces exposure post-payment.",          icon: "trending", status: "pending"  as const },
  { id: "ACT-005", agentCode: "OTC-AGT-006", label: "Invoice Draft Scheduled",     detail: "Invoice $429,711 + RUSH surcharge $1,840 drafted. Release-to-billing triggered on first pick scan at Chicago DC.",                   icon: "file",     status: "pending"  as const },
];

// ─── Pipeline step definitions ──────────────────────────────────────────────
export const OTC_ORDER_PIPELINE_STEPS = [
  {
    role: "parallel_validation",
    label: "Parallel Validation",
    agents: ["OTC-AGT-002", "OTC-AGT-003", "OTC-AGT-004"],
    description: "3 agents running concurrently — credit, inventory, address checks",
    color: "text-orange-400",
    bgColor: "bg-orange-500/10",
    borderColor: "border-orange-500/20",
  },
  {
    role: "resolution_synthesis",
    label: "Resolution Synthesis",
    agents: ["OTC-AGT-002"],
    description: "OTC-AGT-002 synthesising all 3 resolutions — 8/8 checks clearing",
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/20",
  },
  {
    role: "order_release",
    label: "Order Release",
    agents: ["OTC-AGT-002"],
    description: "OTC-AGT-002 releasing ORD-2026-78432 into ERP — pick ticket + notifications",
    color: "text-green-400",
    bgColor: "bg-green-500/10",
    borderColor: "border-green-500/20",
  },
] as const;

// ─── Pipeline state types ────────────────────────────────────────────────────
export interface OrderRunResult {
  role: string;
  agentCode: string;
  success: boolean;
  message: string | null;
  completedAt: string;
}

export interface OrderLogEntry {
  timestamp: string;
  agentCode: string;
  agentName: string;
  message: string;
  type: "info" | "progress" | "complete" | "error";
}

/** Per-check typed status — keyed by VAL-00X check ID */
export type ValidationStepStatus = "pass" | "hold" | "cleared" | "warn";

export interface CreditPanelState {
  decision: "pending" | "approved" | "escalated";
  exposurePct: number | null;
  projectedPct: number | null;
  approvedLimit: number | null;
  approvedLimitDays: number | null;
  riskScore: string | null;
}

export interface InventoryPanelState {
  optionSelected: string | null;
  atpDate: string | null;
  splitShipAvoided: boolean;
  savingsAmount: number;
  pickTickets: string[];
}

export interface AddressPanelState {
  confirmed: boolean;
  originalAddress: string;
  correctedAddress: string | null;
  confidenceScore: number | null;
}

export interface AuditTimelineEvent {
  time: string;
  agent: string;
  role: string;
  event: string;
  elapsedMs: number;
}

export interface OrderPipelineState {
  status: "idle" | "running" | "complete" | "error";
  currentRole: string | null;
  currentStep: number;
  results: OrderRunResult[];
  logEntries: OrderLogEntry[];
  startedAt: string | null;
  completedAt: string | null;
  elapsedSeconds: number;
  error: string | null;
  parallelAgentsRunning: string[];
  resolvedChecks: string[];
  // ── Typed structured panels ──────────────────────────────────────────────
  validationSteps: Record<string, ValidationStepStatus>;
  creditPanel: CreditPanelState;
  inventoryPanel: InventoryPanelState;
  addressPanel: AddressPanelState;
  auditTimeline: AuditTimelineEvent[];
}

const _initialCreditPanel: CreditPanelState = {
  decision: "pending",
  exposurePct: 91.9,
  projectedPct: 177.8,
  approvedLimit: null,
  approvedLimitDays: null,
  riskScore: null,
};

const _initialInventoryPanel: InventoryPanelState = {
  optionSelected: null,
  atpDate: null,
  splitShipAvoided: false,
  savingsAmount: 0,
  pickTickets: [],
};

const _initialAddressPanel: AddressPanelState = {
  confirmed: false,
  originalAddress: "2847 Industrial Parkway, Suite 110, Detroit, MI 48210",
  correctedAddress: null,
  confidenceScore: null,
};

function _initialValidationSteps(): Record<string, ValidationStepStatus> {
  const steps: Record<string, ValidationStepStatus> = {};
  VALIDATION_CHECKS.forEach(c => {
    steps[c.checkId] = c.initialStatus === "PASS" ? "pass"
      : c.initialStatus === "HOLD" ? "hold"
      : "warn";
  });
  return steps;
}

const _cache: OrderPipelineState = {
  status: "idle",
  currentRole: null,
  currentStep: 0,
  results: [],
  logEntries: [],
  startedAt: null,
  completedAt: null,
  elapsedSeconds: 0,
  error: null,
  parallelAgentsRunning: [],
  resolvedChecks: [],
  validationSteps: _initialValidationSteps(),
  creditPanel: { ..._initialCreditPanel },
  inventoryPanel: { ..._initialInventoryPanel },
  addressPanel: { ..._initialAddressPanel },
  auditTimeline: [],
};

export function getCachedOtcOrderPipeline(): OrderPipelineState {
  return {
    ..._cache,
    results:               [..._cache.results],
    logEntries:            [..._cache.logEntries],
    parallelAgentsRunning: [..._cache.parallelAgentsRunning],
    resolvedChecks:        [..._cache.resolvedChecks],
    validationSteps:       { ..._cache.validationSteps },
    creditPanel:           { ..._cache.creditPanel },
    inventoryPanel:        { ..._cache.inventoryPanel, pickTickets: [..._cache.inventoryPanel.pickTickets] },
    addressPanel:          { ..._cache.addressPanel },
    auditTimeline:         [..._cache.auditTimeline],
  };
}

type Listener = (state: OrderPipelineState) => void;
const _listeners = new Set<Listener>();
function notify() {
  const s = getCachedOtcOrderPipeline();
  _listeners.forEach(fn => fn(s));
}

let _timerInterval: ReturnType<typeof setInterval> | null = null;

export interface OtcOrderPipelineHook {
  status: OrderPipelineState["status"];
  logs: OrderLogEntry[];
  currentStep: number;
  isRunning: boolean;
  trigger: () => void;
  state: OrderPipelineState;
}

function agentCodeFromName(name: string): string {
  if (name.includes("Credit") || name.includes("Risk")) return "OTC-AGT-003";
  if (name.includes("Inventory") || name.includes("Availability")) return "OTC-AGT-004";
  return "OTC-AGT-002";
}

export function useOtcOrderPipeline(): OtcOrderPipelineHook {
  const [state, setState] = useState<OrderPipelineState>(() => getCachedOtcOrderPipeline());

  useEffect(() => {
    const listener: Listener = (s) => setState({ ...s });
    _listeners.add(listener);
    return () => { _listeners.delete(listener); };
  }, []);

  const trigger = useCallback(() => {
    if (_cache.status === "running") return;

    _cache.status = "running";
    _cache.currentRole = null;
    _cache.currentStep = 0;
    _cache.results = [];
    _cache.logEntries = [];
    _cache.startedAt = new Date().toISOString();
    _cache.completedAt = null;
    _cache.elapsedSeconds = 0;
    _cache.error = null;
    _cache.parallelAgentsRunning = [];
    _cache.resolvedChecks = [];
    _cache.validationSteps = _initialValidationSteps();
    _cache.creditPanel    = { ..._initialCreditPanel };
    _cache.inventoryPanel = { ..._initialInventoryPanel, pickTickets: [] };
    _cache.addressPanel   = { ..._initialAddressPanel };
    _cache.auditTimeline  = [];
    notify();

    const startTime = Date.now();
    if (_timerInterval) clearInterval(_timerInterval);
    _timerInterval = setInterval(() => {
      if (_cache.status !== "running") { clearInterval(_timerInterval!); return; }
      _cache.elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
      notify();
    }, 1000);

    const addLog = (agentCode: string, agentName: string, message: string, type: OrderLogEntry["type"] = "info") => {
      _cache.logEntries.push({ timestamp: new Date().toISOString(), agentCode, agentName, message, type });
      notify();
    };

    const es = new EventSource("/demo-api/otc-order/live-run");

    es.addEventListener("run_start", (e: MessageEvent) => {
      const d = JSON.parse(e.data);
      addLog("SYSTEM", "Atlas Orchestrator", d.message, "info");
    });

    es.addEventListener("setup", (e: MessageEvent) => {
      const d = JSON.parse(e.data);
      addLog("SYSTEM", "Atlas Orchestrator", d.message, "info");
    });

    es.addEventListener("parallel_start", (e: MessageEvent) => {
      const d = JSON.parse(e.data);
      _cache.currentRole = "parallel_validation";
      _cache.currentStep = 1;
      _cache.parallelAgentsRunning = ["OTC-AGT-002", "OTC-AGT-003", "OTC-AGT-004"];
      addLog("SYSTEM", "Atlas Orchestrator", d.message, "info");
      notify();
    });

    es.addEventListener("agent_start", (e: MessageEvent) => {
      const d = JSON.parse(e.data);
      const code = agentCodeFromName(d.agentName);
      addLog(code, d.agentName, `▶ ${d.label || d.role}…`, "info");
      if (!d.parallel) {
        _cache.currentRole = d.role;
        const stepIdx = d.role === "resolution_synthesis" ? 1 : d.role === "order_release" ? 2 : 0;
        _cache.currentStep = stepIdx + 1;
        _cache.parallelAgentsRunning = [];
      }
      notify();
    });

    es.addEventListener("agent_event", (e: MessageEvent) => {
      const d = JSON.parse(e.data);
      const code = agentCodeFromName(d.agentName);
      const msg = d.type === "tool_call_result"
        ? `${d.tool || "check"} → ${d.data?.success ? "ok" : "error"}`
        : "Processing…";
      addLog(code, d.agentName, msg, "progress");
    });

    es.addEventListener("agent_complete", (e: MessageEvent) => {
      const d = JSON.parse(e.data);
      const code = agentCodeFromName(d.agentName);
      const now  = new Date().toISOString();
      const elapsed = Date.now() - startTime;

      if (!_cache.results.find(r => r.role === d.role)) {
        _cache.results.push({
          role: d.role, agentCode: code, success: d.success,
          message: d.message || null, completedAt: now,
        });
      }

      const checkMap: Record<string, string> = {
        credit_validation:    "VAL-002",
        inventory_validation: "VAL-003",
        address_validation:   "VAL-004",
      };
      if (checkMap[d.role] && !_cache.resolvedChecks.includes(checkMap[d.role])) {
        _cache.resolvedChecks.push(checkMap[d.role]);
        _cache.validationSteps[checkMap[d.role]] = "cleared";
      }

      // ── Populate typed structured panels ─────────────────────────────────
      if (d.role === "credit_validation" && d.success) {
        _cache.creditPanel = {
          decision:          "approved",
          exposurePct:       91.9,
          projectedPct:      177.8,
          approvedLimit:     950_000,
          approvedLimitDays: 60,
          riskScore:         "LOW",
        };
      }
      if (d.role === "inventory_validation" && d.success) {
        _cache.inventoryPanel = {
          optionSelected:   "OPT-A",
          atpDate:          "2026-05-02",
          splitShipAvoided: true,
          savingsAmount:    840,
          pickTickets:      ["PT-CHI-7842-A", "PT-CHI-7842-B", "PT-CHI-7842-C"],
        };
      }
      if (d.role === "address_validation" && d.success) {
        _cache.addressPanel = {
          confirmed:        true,
          originalAddress:  "2847 Industrial Parkway, Suite 110, Detroit, MI 48210",
          correctedAddress: "2847 Industrial Parkway, Detroit, MI 48210",
          confidenceScore:  96,
        };
      }

      // ── Append to audit timeline ──────────────────────────────────────────
      _cache.auditTimeline.push({
        time:      `T+${Math.floor(elapsed / 60000)}:${String(Math.floor((elapsed % 60000) / 1000)).padStart(2, "0")}`,
        agent:     code,
        role:      d.role,
        event:     `${d.role.replace(/_/g, " ")} — ${d.message || (d.success ? "resolved" : "failed")}`,
        elapsedMs: elapsed,
      });

      addLog(code, d.agentName, `${d.role.replace(/_/g, " ")} complete — ${d.success ? "✓" : "✗"}`, d.success ? "complete" : "error");
      notify();
    });

    es.addEventListener("parallel_complete", (e: MessageEvent) => {
      const d = JSON.parse(e.data);
      _cache.parallelAgentsRunning = [];
      _cache.resolvedChecks = ["VAL-002", "VAL-003", "VAL-004"];
      // Sync validationSteps with resolved checks
      ["VAL-002", "VAL-003", "VAL-004"].forEach(id => {
        _cache.validationSteps[id] = "cleared";
      });
      // Ensure typed panels have defaults if not already set by agent_complete
      if (_cache.creditPanel.decision === "pending")
        _cache.creditPanel = { decision: "approved", exposurePct: 91.9, projectedPct: 177.8, approvedLimit: 950_000, approvedLimitDays: 60, riskScore: "LOW" };
      if (!_cache.inventoryPanel.optionSelected)
        _cache.inventoryPanel = { optionSelected: "OPT-A", atpDate: "2026-05-02", splitShipAvoided: true, savingsAmount: 840, pickTickets: ["PT-CHI-7842-A", "PT-CHI-7842-B", "PT-CHI-7842-C"] };
      if (!_cache.addressPanel.confirmed)
        _cache.addressPanel = { confirmed: true, originalAddress: "2847 Industrial Parkway, Suite 110, Detroit, MI 48210", correctedAddress: "2847 Industrial Parkway, Detroit, MI 48210", confidenceScore: 96 };
      addLog("SYSTEM", "Atlas Orchestrator", d.message, "complete");
      notify();
    });

    es.addEventListener("run_complete", (_e: MessageEvent) => {
      _cache.status = "complete";
      _cache.currentRole = null;
      _cache.completedAt = new Date().toISOString();
      _cache.currentStep = 3;
      if (_timerInterval) clearInterval(_timerInterval);
      addLog("SYSTEM", "Atlas Orchestrator", `ORD-2026-78432 RELEASED — $429,711 — ship May 2–3, 2026 — all 8 checks cleared in ${_cache.elapsedSeconds}s`, "complete");
      es.close();
      notify();
    });

    es.addEventListener("error", (e: MessageEvent) => {
      let msg = "Order validation error";
      try { msg = JSON.parse(e.data)?.message || msg; } catch {}
      _cache.status = "error";
      _cache.error = msg;
      if (_timerInterval) clearInterval(_timerInterval);
      addLog("SYSTEM", "Atlas Orchestrator", `Error: ${msg}`, "error");
      es.close();
      notify();
    });

    es.onerror = () => {
      if (_cache.status === "running") {
        _cache.status = "error";
        _cache.error = "Connection to Atlas agents lost";
        if (_timerInterval) clearInterval(_timerInterval);
        notify();
      }
      es.close();
    };
  }, []);

  return {
    state,
    trigger,
    status: state.status,
    logs: state.logEntries,
    currentStep: state.currentStep,
    isRunning: state.status === "running",
  };
}
