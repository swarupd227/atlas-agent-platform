import { useState, useCallback, useEffect } from "react";

// ─── Colors & brand ──────────────────────────────────────────────────────────
export const PKG_COLOR = "#00838F";

// ─── Agent identifiers ────────────────────────────────────────────────────────
export const PKG_AGT_001_CODE = "PKG-001";
export const PKG_AGT_002_CODE = "PKG-002";
export const PKG_AGT_003_CODE = "PKG-003";
export const PKG_AGT_004_CODE = "PKG-004";

export const PKG_AGT_001_NAME = "Production Order Intelligence Agent";
export const PKG_AGT_002_NAME = "Capacity & Constraint Mapping Agent";
export const PKG_AGT_003_NAME = "Schedule Optimization Agent";
export const PKG_AGT_004_NAME = "Schedule Proposal & Approval Agent";

// ─── Scenario context ─────────────────────────────────────────────────────────
export const SHIFT_CONTEXT = {
  plant:       "Westfield Packaging",
  shiftLabel:  "Day Shift",
  shiftDate:   "April 15, 2026",
  shiftHours:  "07:00 – 15:00",
  orderCount:  47,
  machineCount: 8,
  rushCount:   3,
  bFluteLevel: 62,
  oeeBaseline: 71.0,
  oeeTarget:   82.2,
};

// ─── Three RUSH orders ────────────────────────────────────────────────────────
export const RUSH_ORDERS = [
  {
    orderId:   "WP-2026-04150001",
    customer:  "FreshFarm Co",
    product:   "Corrugated RSC Box",
    flute:     "B",
    qty:       "12,000 units",
    deadline:  "13:00",
    riskScore: 91,
    machine:   "M1",
    scheduledComplete: "09:35",
  },
  {
    orderId:   "WP-2026-04150003",
    customer:  "GreenLeaf Produce",
    product:   "Produce Shipper Box",
    flute:     "B",
    qty:       "6,000 units",
    deadline:  "12:30",
    riskScore: 88,
    machine:   "M2",
    scheduledComplete: "09:30",
  },
  {
    orderId:   "WP-2026-04150002",
    customer:  "RetailEdge",
    product:   "Display Tray",
    flute:     "E",
    qty:       "8,500 units",
    deadline:  "14:00",
    riskScore: 84,
    machine:   "M4",
    scheduledComplete: "11:12",
  },
];

// ─── 8 machines ───────────────────────────────────────────────────────────────
export const MACHINES = [
  { id: "M1", label: "Corrugator Line 1", type: "Corrugator",   availPct: 100, note: null },
  { id: "M2", label: "Corrugator Line 2", type: "Corrugator",   availPct: 100, note: null },
  { id: "M3", label: "Corrugator Line 3", type: "Corrugator",   availPct:  81, note: "Maintenance 10:00–11:30 (90 min PM)" },
  { id: "M4", label: "Flexo Printer A",   type: "FlexoPrinter", availPct:  85, note: "85% throughput — minor drive belt repair" },
  { id: "M5", label: "Flexo Printer B",   type: "FlexoPrinter", availPct: 100, note: null },
  { id: "M6", label: "Die Cutter",        type: "DieCutter",    availPct: 100, note: null },
  { id: "M7", label: "Flexo Printer C",   type: "FlexoPrinter", availPct: 100, note: null },
  { id: "M8", label: "Stitcher/Gluer",    type: "StitcherGluer",availPct: 100, note: null },
];

// ─── Roll stock ────────────────────────────────────────────────────────────────
export const ROLL_STOCK = [
  { flute: "B", label: "B-Flute", pct: 62, status: "at_risk" as const },
  { flute: "A", label: "A-Flute", pct: 88, status: "ok"      as const },
  { flute: "C", label: "C-Flute", pct: 94, status: "ok"      as const },
  { flute: "E", label: "E-Flute", pct: 79, status: "ok"      as const },
];

// ─── 3 schedule alternatives ──────────────────────────────────────────────────
export const SCHEDULE_ALTERNATIVES = [
  {
    id:          "ALT-A",
    label:       "Alternative A",
    sublabel:    "OEE-Priority  ·  Recommended",
    recommended: true,
    oee:         82.2,
    oeeDelta:    "+11.2pp",
    otifOrders:  44,
    otifDelta:   "+4 orders",
    changeovers: 14,
    changeoverDelta: "-3",
    substrateWastePct: 8.5,
    substrateDelta:    "-8%",
    rushCoverage: "3/3",
    compositeScore: 87.4,
    description: "B-Flute orders front-loaded to 07:00–10:45; substrate batch clustering across corrugators; 3 fewer changeovers; all RUSH orders with comfortable margins.",
  },
  {
    id:          "ALT-B",
    label:       "Alternative B",
    sublabel:    "OTIF-Priority",
    recommended: false,
    oee:         79.6,
    oeeDelta:    "+8.6pp",
    otifOrders:  45,
    otifDelta:   "+5 orders",
    changeovers: 16,
    changeoverDelta: "-1",
    substrateWastePct: 8.9,
    substrateDelta:    "-10%",
    rushCoverage: "3/3",
    compositeScore: 83.1,
    description: "Orders sorted strictly by deadline proximity — highest OTIF but 2 additional changeovers vs. Alternative A. OEE 2.6pp lower.",
  },
  {
    id:          "ALT-C",
    label:       "Alternative C",
    sublabel:    "Balanced",
    recommended: false,
    oee:         78.3,
    oeeDelta:    "+7.3pp",
    otifOrders:  43,
    otifDelta:   "+3 orders",
    changeovers: 15,
    changeoverDelta: "-2",
    substrateWastePct: 9.0,
    substrateDelta:    "-9%",
    rushCoverage: "3/3",
    compositeScore: 79.8,
    description: "Conservative scheduling with 30-min buffers before maintenance windows. Recommended fallback if B-Flute resupply is delayed.",
  },
];

// ─── KPI projections (Alternative A vs baseline) ──────────────────────────────
export const KPI_PROJECTIONS = {
  baseline: { oee: 71.0, otifOrders: 40, changeovers: 17, substrateWastePct: 9.2 },
  projected: { oee: 82.2, otifOrders: 44, changeovers: 14, substrateWastePct: 8.5 },
  annualised: { revenueGain: 214000, changeoverSavings: 28000, otifGainPp: 8.5 },
  kiwiplanScheduleId: "KWP-SCHED-2026-0415-D",
  approvalId:         "APR-2026-04-15-001",
  approver:           "Sarah Kowalski",
  approverTitle:      "Day Shift Plant Planner",
};

// ─── Gantt slots for Alternative A (for S3 Proposal screen) ──────────────────
export const GANTT_MACHINES = [
  {
    id: "M1", label: "Corrugator Line 1",
    slots: [
      { start: "07:00", end: "09:35", type: "rush",       label: "WP-0001 · FreshFarm RSC · B-Flute (RUSH)" },
      { start: "09:35", end: "09:55", type: "changeover", label: "Changeover B→C" },
      { start: "09:55", end: "15:00", type: "standard",   label: "WP-0008 + WP-0004 · MegaStore/Apex · C-Flute" },
    ],
  },
  {
    id: "M2", label: "Corrugator Line 2",
    slots: [
      { start: "07:30", end: "09:30", type: "rush",       label: "WP-0003 · GreenLeaf Produce · B-Flute (RUSH)" },
      { start: "09:30", end: "09:44", type: "changeover", label: "Changeover B→A" },
      { start: "09:44", end: "15:00", type: "standard",   label: "WP-0010 + WP-0006 · Coastal/TechShip · A-Flute" },
    ],
  },
  {
    id: "M3", label: "Corrugator Line 3",
    slots: [
      { start: "07:00", end: "09:45", type: "standard",   label: "WP-0009 · OrchardFresh · B-Flute" },
      { start: "09:45", end: "10:00", type: "buffer",     label: "15-min maintenance buffer" },
      { start: "10:00", end: "11:30", type: "maintenance",label: "MAINTENANCE — Drive Belt PM (OSHA Lockout/Tagout)" },
      { start: "11:30", end: "15:00", type: "standard",   label: "WP-0005 · NutriPack · B-Flute" },
    ],
  },
  {
    id: "M4", label: "Flexo Printer A (85%)",
    slots: [
      { start: "09:00", end: "11:12", type: "rush",       label: "WP-0002 · RetailEdge Display Tray · E-Flute (RUSH)" },
      { start: "11:12", end: "11:28", type: "changeover", label: "Changeover E→B" },
      { start: "11:28", end: "15:00", type: "standard",   label: "WP-0007 · FoodMart · E-Flute" },
    ],
  },
  {
    id: "M5", label: "Flexo Printer B",
    slots: [
      { start: "07:00", end: "15:00", type: "standard",   label: "Multi-order batch · C-Flute · 22,000 units" },
    ],
  },
  {
    id: "M6", label: "Die Cutter",
    slots: [
      { start: "07:00", end: "15:00", type: "standard",   label: "Multi-order batch · A-Flute · 18,000 units" },
    ],
  },
  {
    id: "M7", label: "Flexo Printer C",
    slots: [
      { start: "07:00", end: "15:00", type: "standard",   label: "Multi-order batch · C-Flute · 20,000 units" },
    ],
  },
  {
    id: "M8", label: "Stitcher/Gluer",
    slots: [
      { start: "07:00", end: "15:00", type: "standard",   label: "Multi-order batch · A-Flute · 15,000 units" },
    ],
  },
];

// ─── Pipeline step definitions ────────────────────────────────────────────────
export const PKG_SCHED_PIPELINE_STEPS = [
  {
    role:        "order_intelligence",
    label:       "Order Intelligence",
    agentCode:   PKG_AGT_001_CODE,
    phase:       1,
    parallel:    true,
    color:       "text-teal-400",
    bgColor:     "bg-teal-500/10",
    borderColor: "border-teal-500/20",
  },
  {
    role:        "capacity_mapping",
    label:       "Capacity Mapping",
    agentCode:   PKG_AGT_002_CODE,
    phase:       1,
    parallel:    true,
    color:       "text-cyan-400",
    bgColor:     "bg-cyan-500/10",
    borderColor: "border-cyan-500/20",
  },
  {
    role:        "schedule_optimization",
    label:       "Schedule Optimization",
    agentCode:   PKG_AGT_003_CODE,
    phase:       2,
    parallel:    false,
    color:       "text-sky-400",
    bgColor:     "bg-sky-500/10",
    borderColor: "border-sky-500/20",
  },
  {
    role:        "schedule_proposal",
    label:       "Schedule Proposal",
    agentCode:   PKG_AGT_004_CODE,
    phase:       3,
    parallel:    false,
    color:       "text-emerald-400",
    bgColor:     "bg-emerald-500/10",
    borderColor: "border-emerald-500/20",
  },
] as const;

// ─── State types ──────────────────────────────────────────────────────────────
export interface PkgLogEntry {
  timestamp: string;
  agentCode: string;
  agentName: string;
  message:   string;
  type:      "info" | "progress" | "complete" | "error";
}

export interface PkgRunResult {
  role:        string;
  agentCode:   string;
  success:     boolean;
  message:     string | null;
  completedAt: string;
  phase:       number;
  parallel:    boolean;
}

export interface PkgPipelineState {
  status:        "idle" | "running" | "complete" | "error";
  phase:         number;
  logEntries:    PkgLogEntry[];
  results:       PkgRunResult[];
  startedAt:     string | null;
  completedAt:   string | null;
  elapsedSeconds: number;
  error:         string | null;
  parallelRunning: string[];
  // Phase-level completion flags
  phase1Done:    boolean;
  phase2Done:    boolean;
  phase3Done:    boolean;
}

// ─── In-process cache & listeners ────────────────────────────────────────────
const _cache: PkgPipelineState = {
  status:        "idle",
  phase:         0,
  logEntries:    [],
  results:       [],
  startedAt:     null,
  completedAt:   null,
  elapsedSeconds: 0,
  error:         null,
  parallelRunning: [],
  phase1Done:    false,
  phase2Done:    false,
  phase3Done:    false,
};

type Listener = (state: PkgPipelineState) => void;
const _listeners = new Set<Listener>();
function _notify() {
  const s = { ..._cache, logEntries: [..._cache.logEntries], results: [..._cache.results], parallelRunning: [..._cache.parallelRunning] };
  _listeners.forEach(fn => fn(s));
}

let _timerInterval: ReturnType<typeof setInterval> | null = null;

function _reset() {
  _cache.status = "idle";
  _cache.phase  = 0;
  _cache.logEntries = [];
  _cache.results    = [];
  _cache.startedAt  = null;
  _cache.completedAt = null;
  _cache.elapsedSeconds = 0;
  _cache.error   = null;
  _cache.parallelRunning = [];
  _cache.phase1Done = false;
  _cache.phase2Done = false;
  _cache.phase3Done = false;
  if (_timerInterval) { clearInterval(_timerInterval); _timerInterval = null; }
}

function _agentCodeFromRole(role: string): string {
  if (role === "order_intelligence")  return PKG_AGT_001_CODE;
  if (role === "capacity_mapping")    return PKG_AGT_002_CODE;
  if (role === "schedule_optimization") return PKG_AGT_003_CODE;
  if (role === "schedule_proposal")   return PKG_AGT_004_CODE;
  return "ATLAS";
}

function _agentNameFromRole(role: string): string {
  if (role === "order_intelligence")  return PKG_AGT_001_NAME;
  if (role === "capacity_mapping")    return PKG_AGT_002_NAME;
  if (role === "schedule_optimization") return PKG_AGT_003_NAME;
  if (role === "schedule_proposal")   return PKG_AGT_004_NAME;
  return "Atlas Orchestrator";
}

// ─── Hook ────────────────────────────────────────────────────────────────────
export interface PkgSchedPipelineHook {
  state:     PkgPipelineState;
  trigger:   () => void;
  reset:     () => void;
  isRunning: boolean;
  isComplete: boolean;
}

export function usePkgSchedPipeline(): PkgSchedPipelineHook {
  const [state, setState] = useState<PkgPipelineState>(() => ({ ..._cache, logEntries: [], results: [], parallelRunning: [] }));

  useEffect(() => {
    const listener: Listener = (s) => setState({ ...s });
    _listeners.add(listener);
    return () => { _listeners.delete(listener); };
  }, []);

  const reset = useCallback(() => {
    if (_cache.status === "running") return;
    _reset();
    _notify();
    fetch("/demo-api/pkg-sched/reset", { method: "POST" }).catch(() => {});
  }, []);

  const trigger = useCallback(() => {
    if (_cache.status === "running") return;
    _reset();
    _cache.status    = "running";
    _cache.startedAt = new Date().toISOString();
    _notify();

    const startTime = Date.now();
    if (_timerInterval) clearInterval(_timerInterval);
    _timerInterval = setInterval(() => {
      if (_cache.status !== "running") { clearInterval(_timerInterval!); return; }
      _cache.elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
      _notify();
    }, 1000);

    const addLog = (agentCode: string, agentName: string, message: string, type: PkgLogEntry["type"] = "info") => {
      _cache.logEntries.push({ timestamp: new Date().toISOString(), agentCode, agentName, message, type });
      _notify();
    };

    const es = new EventSource("/demo-api/pkg-sched/live-run");

    es.addEventListener("run_start", (e: MessageEvent) => {
      const d = JSON.parse(e.data);
      addLog("ATLAS", "Atlas Orchestrator", d.message, "info");
    });

    es.addEventListener("setup", (e: MessageEvent) => {
      const d = JSON.parse(e.data);
      addLog("ATLAS", "Atlas Orchestrator", d.message, "info");
    });

    es.addEventListener("parallel_start", (e: MessageEvent) => {
      const d = JSON.parse(e.data);
      _cache.phase = 1;
      _cache.parallelRunning = [PKG_AGT_001_CODE, PKG_AGT_002_CODE];
      addLog("ATLAS", "Atlas Orchestrator", d.message, "info");
      _notify();
    });

    es.addEventListener("agent_start", (e: MessageEvent) => {
      const d = JSON.parse(e.data);
      const code = _agentCodeFromRole(d.role);
      const name = _agentNameFromRole(d.role);
      addLog(code, name, `▶ ${d.label || d.role}…`, "info");
      if (!d.parallel) {
        _cache.phase = d.phase || _cache.phase;
        _cache.parallelRunning = [];
      }
      _notify();
    });

    es.addEventListener("agent_event", (e: MessageEvent) => {
      const d = JSON.parse(e.data);
      const code = d.agentCode || "ATLAS";
      const name = d.agentName || "Atlas";
      const msg  = d.label ?? (d.type === "tool_call_result" ? `${d.tool || "tool"} → ok` : "Processing…");
      addLog(code, name, msg, "progress");
    });

    es.addEventListener("agent_complete", (e: MessageEvent) => {
      const d = JSON.parse(e.data);
      const code    = _agentCodeFromRole(d.role);
      const name    = _agentNameFromRole(d.role);
      const now     = new Date().toISOString();
      const phaseN  = d.phase || (d.parallel ? 1 : _cache.phase);

      if (!_cache.results.find(r => r.role === d.role)) {
        _cache.results.push({
          role: d.role, agentCode: code, success: d.success ?? true,
          message: d.message || null, completedAt: now,
          phase: phaseN, parallel: !!d.parallel,
        });
      }

      addLog(code, name, `✓ ${d.message || d.role + " complete"}`, "complete");

      if (d.parallel) {
        const p1Roles = ["order_intelligence", "capacity_mapping"];
        const p1Done  = p1Roles.every(r => _cache.results.some(res => res.role === r));
        if (p1Done) { _cache.phase1Done = true; _cache.parallelRunning = []; }
      }
      if (d.role === "schedule_optimization") _cache.phase2Done = true;
      if (d.role === "schedule_proposal")     _cache.phase3Done = true;
      _notify();
    });

    es.addEventListener("parallel_complete", (e: MessageEvent) => {
      const d = JSON.parse(e.data);
      addLog("ATLAS", "Atlas Orchestrator", d.message, "info");
      _cache.phase1Done = true;
      _cache.parallelRunning = [];
      _notify();
    });

    es.addEventListener("run_complete", (e: MessageEvent) => {
      const d = JSON.parse(e.data);
      _cache.status       = "complete";
      _cache.completedAt  = new Date().toISOString();
      _cache.phase1Done   = true;
      _cache.phase2Done   = true;
      _cache.phase3Done   = true;
      _cache.parallelRunning = [];
      addLog("ATLAS", "Atlas Orchestrator", `Pipeline complete — Kiwiplan ${d.kiwiplanScheduleId} · OEE ${d.kpiSummary?.oee || "82.2%"}`, "complete");
      if (_timerInterval) { clearInterval(_timerInterval); _timerInterval = null; }
      _notify();
      es.close();
    });

    es.addEventListener("agent_error", (e: MessageEvent) => {
      const d = JSON.parse(e.data);
      _cache.status = "error";
      _cache.error  = d.message || "Pipeline error";
      addLog("ATLAS", "Atlas Orchestrator", `✗ ${_cache.error}`, "error");
      if (_timerInterval) { clearInterval(_timerInterval); _timerInterval = null; }
      _notify();
      es.close();
    });

    es.onerror = () => {
      if (_cache.status === "running") {
        _cache.status = "error";
        _cache.error  = "SSE connection lost";
        addLog("ATLAS", "Atlas Orchestrator", "✗ Connection to agent stream lost", "error");
        if (_timerInterval) { clearInterval(_timerInterval); _timerInterval = null; }
        _notify();
      }
      es.close();
    };
  }, []);

  return {
    state,
    trigger,
    reset,
    isRunning:  state.status === "running",
    isComplete: state.status === "complete",
  };
}
