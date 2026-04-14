import { useState, useCallback, useEffect } from "react";

// ─── Agent identifiers ──────────────────────────────────────────────────────
export const OTC_AGT_002_NAME = "Order Validation & Promise Agent";
export const OTC_AGT_003_NAME = "Customer Credit & Risk Assessment Agent";
export const OTC_AGT_004_NAME = "Inventory Availability & Promise Agent";

// ─── Order under validation ─────────────────────────────────────────────────
export const ORDER_CONTEXT = {
  orderId: "ORD-2026-78432",
  quoteRef: "Q-78432",
  poNumber: "PO-MFG-2026-0441",
  customer: "Meridian Manufacturing",
  customerId: "CUST-00892",
  orderDate: "April 14, 2026",
  requestedShipDate: "April 21, 2026",
  orderType: "RUSH" as const,
  value: 429_711,
  valueLabel: "$429,711",
  lineCount: 12,
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
    detail: "System flagged split-ship: Chicago (8 units) + Atlanta (4 units). Chicago alone has all 12 units. Split unnecessary.",
    resolution: "Chicago-only fulfillment confirmed — 1-day transit, $840 split-ship surcharge avoided",
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
  { id: "WH-CHI", name: "Chicago DC",    city: "Chicago",  state: "IL", txUnits: 12, atpDate: "Apr 21",  transit: "1 day",  recommended: true  },
  { id: "WH-ATL", name: "Atlanta Hub",   city: "Atlanta",  state: "GA", txUnits:  4, atpDate: "Apr 24",  transit: "3 days", recommended: false },
  { id: "WH-DAL", name: "Dallas Center", city: "Dallas",   state: "TX", txUnits:  0, atpDate: "N/A",     transit: "4 days", recommended: false },
];

export const FULFILLMENT_OPTIONS = [
  {
    id: "OPT-A",
    label: "Chicago DC Only",
    recommended: true,
    coverage: "12/12 units",
    shipDate: "Apr 21, 2026",
    deliveryDate: "Apr 22, 2026",
    cost: "$0 surcharge",
    transitDays: 1,
  },
  {
    id: "OPT-B",
    label: "Chicago + Atlanta Split",
    recommended: false,
    coverage: "8 + 4 units",
    shipDate: "Apr 21, 2026",
    deliveryDate: "Apr 24, 2026",
    cost: "$840 surcharge",
    transitDays: 3,
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
  { id: "ACT-001", label: "ERP Transaction",        detail: "Order released into ERP. Pick ticket transmitted to Chicago DC.",              icon: "server",   status: "complete" as const },
  { id: "ACT-002", label: "Warehouse Notification", detail: "Pick list at Chicago DC. All 12 turbine units queued for April 21 ship.",        icon: "warehouse",status: "complete" as const },
  { id: "ACT-003", label: "Customer Confirmation",  detail: "Confirmation email queued to j.davis@meridian-mfg.com. Est. delivery Apr 22.", icon: "mail",     status: "complete" as const },
  { id: "ACT-004", label: "Invoice Draft",           detail: "Invoice $429,711 + RUSH surcharge $1,800. Pending ship confirmation.",          icon: "file",     status: "pending"  as const },
  { id: "ACT-005", label: "Credit Memo",             detail: "Temp limit $950K / 60 days logged to risk register. Auto-reverts May 14.",      icon: "shield",   status: "complete" as const },
  { id: "ACT-006", label: "AR Update",               detail: "Expected AR $200,600 inbound within 30 days — reduces exposure post-payment.", icon: "trending", status: "pending"  as const },
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
};

export function getCachedOtcOrderPipeline(): OrderPipelineState {
  return {
    ..._cache,
    results: [..._cache.results],
    logEntries: [..._cache.logEntries],
    parallelAgentsRunning: [..._cache.parallelAgentsRunning],
    resolvedChecks: [..._cache.resolvedChecks],
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
      if (!_cache.results.find(r => r.role === d.role)) {
        _cache.results.push({
          role: d.role,
          agentCode: code,
          success: d.success,
          message: d.message || null,
          completedAt: new Date().toISOString(),
        });
      }
      const checkMap: Record<string, string> = {
        credit_validation: "VAL-002",
        inventory_validation: "VAL-003",
        address_validation: "VAL-004",
      };
      if (checkMap[d.role] && !_cache.resolvedChecks.includes(checkMap[d.role])) {
        _cache.resolvedChecks.push(checkMap[d.role]);
      }
      addLog(code, d.agentName, `${d.role.replace(/_/g, " ")} complete — ${d.success ? "✓" : "✗"}`, d.success ? "complete" : "error");
      notify();
    });

    es.addEventListener("parallel_complete", (e: MessageEvent) => {
      const d = JSON.parse(e.data);
      _cache.parallelAgentsRunning = [];
      _cache.resolvedChecks = ["VAL-002", "VAL-003", "VAL-004"];
      addLog("SYSTEM", "Atlas Orchestrator", d.message, "complete");
      notify();
    });

    es.addEventListener("run_complete", (_e: MessageEvent) => {
      _cache.status = "complete";
      _cache.currentRole = null;
      _cache.completedAt = new Date().toISOString();
      _cache.currentStep = 3;
      if (_timerInterval) clearInterval(_timerInterval);
      addLog("SYSTEM", "Atlas Orchestrator", `ORD-2026-78432 RELEASED — $429,711 — ship Apr 21, 2026 — all 8 checks cleared in ${_cache.elapsedSeconds}s`, "complete");
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
