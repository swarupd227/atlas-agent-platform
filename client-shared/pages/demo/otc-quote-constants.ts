import { useState, useCallback, useEffect } from "react";

// ─── Agent identifiers ──────────────────────────────────────────────────────
export const OTC_AGT_001_NAME = "Quote & Configuration Agent";
export const OTC_AGT_011_NAME = "Contract & Pricing Compliance Agent";

// ─── Customer 360 context ───────────────────────────────────────────────────
export const MERIDIAN_CONTEXT = {
  name: "Meridian Manufacturing",
  tier: "Tier 1",
  annualSpend: 28_400_000,
  annualSpendLabel: "$28.4M",
  contractNumber: "MSA-2024-0892",
  contractExpiry: "December 2026",
  discountSchedule: [
    { threshold: "$0",  label: "Standard",  pct: 8 },
    { threshold: "$30M", label: "Silver",   pct: 10 },
    { threshold: "$35M", label: "Gold",     pct: 12 },
  ],
  ytdSpend: 21_700_000,
  ytdSpendLabel: "$21.7M",
  projectedSpend: 29_000_000,
  projectedSpendLabel: "$29M",
  creditStatus: "A+" as const,
  openAR: "$1.2M",
  openARStatus: "current" as const,
  avgDaysToPay: 32,
  lastQuote: { number: "Q-77891", value: "$340K", outcome: "Won" },
  rm: "Sarah Chen",
  rmTitle: "Regional VP",
  insightGap: 6_000_000,
  insightGapLabel: "$6M",
};

// ─── RFQ document with NLP entity positions ──────────────────────────────────
export interface RfqEntity {
  text: string;
  type: "product" | "pricing" | "delivery" | "timeline";
}

export const NOVATECH_RFQ_SEGMENTS: Array<{ text: string; entity?: RfqEntity["type"] }> = [
  { text: "From: Jim Davis, Procurement Director\nMeridian Manufacturing\n\nTo: NovaTech Industries — Sales\nDate: April 8, 2026\nSubject: Request for Quotation — Capital Equipment Package\n\nDear NovaTech Team,\n\nPlease provide a formal quotation for the following capital equipment package in support of our FY26 plant expansion programme.\n\n" },
  { text: "REQUIRED EQUIPMENT:\n• Model X-7200 Turbine Assembly x 4 (Series A) + x 3 (Series B) + additional accessories [Atlas note: X-7200 → X-7250 substitution applied due to supply discontinuation]\n• Series K Filtration Units — full package (30 line items)\n• Control Electronics Package including CX-series controllers and HMI panels", entity: "product" },
  { text: "\n\nPRICING REQUIREMENT:\nMeridian is ", },
  { text: "requesting 12% off current list pricing", entity: "pricing" },
  { text: " across all line items, consistent with our projected FY26 spend. We have a long-standing MSA (contract MSA-2024-0892) and believe our relationship warrants this tier.\n\nDELIVERY REQUIREMENTS:\nSplit delivery across ", },
  { text: "4 plants: Detroit (primary), Houston, Phoenix, Portland", entity: "delivery" },
  { text: ". Staggered commissioning schedule preferred.\n\nTIMELINE:\nAll units must be ", },
  { text: "delivered and commissioned by Q3 FY26 (September 30, 2026)", entity: "timeline" },
  { text: ". Order placement required no later than April 30, 2026 to meet this commitment.\n\nPlease include warranty terms, recommended spare parts schedule, and any applicable service agreements.\n\nRegards,\nJim Davis\nProcurement Director, Meridian Manufacturing\nj.davis@meridian-mfg.com | +1 313 555 0182" },
];

// ─── Extracted line items (47 SKUs across 3 families) ─────────────────────
export interface LineItem {
  lineNo: number;
  sku: string;
  description: string;
  family: "turbine" | "filtration" | "control";
  qty: number;
  unitListPrice: number;
  extendedListPrice: number;
  discountPct: number;
  unitNetPrice: number;
  extendedNetPrice: number;
  marginPct: number;
  leadTimeWeeks: number;
  compatible: boolean;
  substituted?: boolean;
  substituteFor?: string;
  addedByAi?: boolean;
  leadTimeAlert?: boolean;
}

// Total list = $487,200 | Volume discount 10% → $438,480 | Bundle -2% → $429,711
const D = 0.118; // effective discount applied uniformly for net price display

function mkItem(
  lineNo: number, sku: string, desc: string,
  family: LineItem["family"], qty: number, unitList: number,
  marginPct: number, leadTimeWeeks: number,
  opts: Partial<LineItem> = {}
): LineItem {
  const extList = qty * unitList;
  const unitNet = Math.round(unitList * (1 - D));
  const extNet = qty * unitNet;
  return {
    lineNo, sku, description: desc, family, qty,
    unitListPrice: unitList, extendedListPrice: extList,
    discountPct: Math.round(D * 100 * 10) / 10,
    unitNetPrice: unitNet, extendedNetPrice: extNet,
    marginPct, leadTimeWeeks, compatible: true, ...opts,
  };
}

export const LINE_ITEMS: LineItem[] = [
  // ── Turbine Assemblies (12 line items) ─────────────────────────────────
  mkItem( 1,"TX-7250-A","Turbine Assembly X-7250 Series A (SUBSTITUTED from X-7200)","turbine",4,18_500,32,6,{ substituted: true, substituteFor: "TX-7200-A" }),
  mkItem( 2,"TX-7250-B","Turbine Assembly X-7250 Series B (SUBSTITUTED from X-7200)","turbine",3,21_200,28,6,{ substituted: true, substituteFor: "TX-7200-B" }),
  mkItem( 3,"TX-7100-STD","Turbine Assembly X-7100 Standard","turbine",2,15_800,31,6),
  mkItem( 4,"TX-7300-HD","Turbine Assembly X-7300 Heavy Duty","turbine",1,38_600,35,10),
  mkItem( 5,"TX-6800-CMP","Turbine Assembly X-6800 Compact","turbine",1,12_400,29,6),
  mkItem( 6,"TX-INF-MON","Turbine Inlet Flow Monitor","turbine",2,4_200,22,4),
  mkItem( 7,"TX-BASE-PLT","Turbine Base Plate Assembly","turbine",4,3_600,26,3),
  mkItem( 8,"TX-SEAL-KIT","High-Pressure Seal Kit","turbine",4,1_850,38,2),
  mkItem( 9,"TX-COUP-FLX","Flexible Coupling Unit","turbine",2,5_200,24,4),
  mkItem(10,"TX-VIB-ISO","Vibration Isolator Set","turbine",4,2_100,33,2),
  mkItem(11,"TX-LUB-SYS","Lubrication System Module","turbine",2,8_900,29,5),
  mkItem(12,"TX-CTRL-ADT","Control Adapter Interface","turbine",2,3_260,27,3),
  // ── Filtration Systems (30 line items) ─────────────────────────────────
  mkItem(13,"FK-S200-STD","Series K-200 Filtration Unit Standard","filtration",2,5_800,28,4),
  mkItem(14,"FK-S200-HF","Series K-200 High-Flow Variant","filtration",1,6_900,26,4),
  mkItem(15,"FK-S150-STD","Series K-150 Filtration Unit Standard","filtration",2,4_200,30,3),
  mkItem(16,"FK-S150-HC","Series K-150 High-Capacity","filtration",1,5_100,27,3),
  mkItem(17,"FK-S300-PRO","Series K-300 Pro Filtration","filtration",1,8_400,31,6),
  mkItem(18,"FK-S300-HT","Series K-300 High-Temp Variant","filtration",1,9_200,29,6),
  mkItem(19,"FK-S100-BCK","Series K-100 Backup Unit","filtration",3,3_600,32,2),
  mkItem(20,"FK-PRE-FLT","Pre-Filter Housing Assembly","filtration",2,2_100,35,2),
  mkItem(21,"FK-BAG-P10","P10 Filter Bag (10-pack)","filtration",5,890,42,1),
  mkItem(22,"FK-CART-HE","HEPA Cartridge Assembly","filtration",4,1_200,38,2),
  mkItem(23,"FK-MBR-20","Membrane Pack 20-micron","filtration",2,2_400,33,3),
  mkItem(24,"FK-MBR-05","Membrane Pack 5-micron","filtration",2,2_800,31,3),
  mkItem(25,"FK-MANF-4W","4-Way Filter Manifold","filtration",1,3_600,28,3),
  mkItem(26,"FK-MANF-6W","6-Way Filter Manifold","filtration",1,4_200,27,3),
  mkItem(27,"FK-VLV-BLT","Ball Valve with Lock Tag","filtration",4,680,36,1),
  mkItem(28,"FK-VLV-CHK","Check Valve 2-inch","filtration",4,520,38,1),
  mkItem(29,"FK-GGE-DIF","Differential Pressure Gauge","filtration",6,450,40,1),
  mkItem(30,"FK-FLOW-MT","Flow Meter — Turbine Type","filtration",3,1_800,29,3),
  mkItem(31,"FK-PUMP-BT","Booster Pump Assembly","filtration",2,4_100,25,4),
  mkItem(32,"FK-PUMP-MT","Metering Pump Module","filtration",2,3_200,27,3),
  mkItem(33,"FK-SUMP-50","Sump Tank 50L","filtration",1,2_600,24,3),
  mkItem(34,"FK-SUMP-100","Sump Tank 100L","filtration",1,3_800,23,4),
  mkItem(35,"FK-CNTR-LV","Level Controller Module","filtration",2,1_100,31,2),
  mkItem(36,"FK-CNTR-PH","pH Controller Module","filtration",2,1_400,29,2),
  mkItem(37,"FK-BRKT-WM","Wall-Mount Bracket Kit","filtration",6,380,44,1),
  mkItem(38,"FK-PIPE-SS","SS Piping Spool 1m","filtration",8,420,35,1),
  mkItem(39,"FK-SEAL-OR","O-Ring Seal Pack","filtration",6,180,52,1),
  mkItem(40,"FK-LUBE-KT","Bearing Lubrication Kit","filtration",4,290,48,1),
  mkItem(41,"FK-WASH-DP","Wash-Down Panel Assembly","filtration",1,1_900,28,2),
  mkItem(42,"FK-ACS-SPR","Filter Cartridge Spare Set (AI-recommended)","filtration",1,950,41,1,{ addedByAi: true }),
  // ── Control Electronics (5 line items) ─────────────────────────────────
  mkItem(43,"CE-CX450-ENH","CX-450 Enhanced Process Controller","control",1,15_800,22,6,
    { substituted: true, substituteFor: "CE-CX440-STD" }),
  mkItem(44,"CE-CX250-MOD","CX-250 I/O Module Expansion","control",1,8_200,25,4),
  mkItem(45,"CE-PLC-SAFE","PLC Safety Controller","control",1,12_400,24,5),
  mkItem(46,"CE-HMI-10T","10-inch HMI Touchscreen Panel","control",1,7_600,26,4),
  mkItem(47,"CE-COMM-PRF","Profinet Communication Module","control",2,4_000,23,3),
];

// ─── Compatibility rules ────────────────────────────────────────────────────
export const COMPATIBILITY_RULES = [
  {
    id: "COMP-01",
    status: "substitution",
    title: "Turbine Model Substitution",
    detail: "X-7200 Series A/B (7 units) discontinued in APAC supply chain. Atlas recommends X-7250 Series A/B — identical performance spec, same price, shorter 6-week lead time vs 8-week for X-7200.",
    item: "TX-7200-A/B → TX-7250-A/B",
    severity: "amber" as const,
  },
  {
    id: "COMP-02",
    status: "substitution",
    title: "Controller Compatibility",
    detail: "CE-CX440-STD is not certified for X-7250 firmware v3.2+. Atlas substitutes CX-450-ENH (same price, fully certified for X-7250, 6-week lead time).",
    item: "CE-CX440-STD → CE-CX450-ENH",
    severity: "amber" as const,
  },
  {
    id: "COMP-03",
    status: "ok",
    title: "Bundle Compatibility: P-220",
    detail: "Turbine Assemblies + Series K Filtration qualifies for Package Discount P-220 (additional 2% off list after volume discount).",
    item: "TX-7250-* + FK-S*",
    severity: "green" as const,
  },
  {
    id: "MOQ-01",
    status: "ok",
    title: "Minimum Order Quantities",
    detail: "All 47 line items meet or exceed MOQ thresholds. No shortfall items.",
    item: "All SKUs",
    severity: "green" as const,
  },
];

// ─── Pricing waterfall ──────────────────────────────────────────────────────
export const PRICING_WATERFALL = {
  listPrice: 487_200,
  volumeDiscount: { pct: 10, amount: 48_720 },
  bundleDiscount: { label: "Bundle P-220", pct: 2, amount: 8_769 },
  netPrice: 429_711,
  effectiveDiscountPct: 11.8,
  customerRequested: { pct: 12, amount: 428_736 },
  delta: 975,
  deltaLabel: "$975 in NovaTech's favour",
  approvalNote: "Effective 11.8% — exceeds rep authority (8%), within Regional VP authority (15%)",
};

// ─── Delivery schedule ──────────────────────────────────────────────────────
export const DELIVERY_SCHEDULE = [
  { plant: "Detroit",  state: "MI", skus: 18, value: "$172,400", date: "August 15, 2026",  primary: true  },
  { plant: "Houston",  state: "TX", skus: 12, value: "$98,200",  date: "August 29, 2026",  primary: false },
  { plant: "Phoenix",  state: "AZ", skus: 10, value: "$86,700",  date: "September 12, 2026",primary: false },
  { plant: "Portland", state: "OR", skus:  8, value: "$72,411",  date: "September 26, 2026",primary: false },
];

// ─── Quote document metadata ────────────────────────────────────────────────
export const QUOTE_DOC = {
  quoteNumber: "Q-78432",
  issueDate: "April 8, 2026",
  validityDays: 30,
  validUntil: "May 8, 2026",
  totalListPrice: "$487,200",
  totalNetPrice: "$429,711",
  effectiveDiscount: "11.8%",
  skuCount: 48,
  customer: MERIDIAN_CONTEXT.name,
  contact: "Jim Davis, Procurement Director",
  contactEmail: "j.davis@meridian-mfg.com",
  approvalStatus: "APPROVED" as const,
  approver: "Sarah Chen, Regional VP",
  winProbability: 78,
  upsellPath: "Meridian needs $6M more spend to reach 12% discount tier. A follow-up including annual service contract ($1.8M) and FY27 planned expansion puts them at $35M+.",
};

// ─── 4-Step Pipeline definition ─────────────────────────────────────────────
export const OTC_PIPELINE_STEPS = [
  {
    role: "rfq_intake",
    label: "RFQ Parsing & Customer Context",
    agentCode: "OTC-AGT-001",
    agentCode2: "OTC-AGT-011",
    description: "OTC-AGT-001 parsing RFQ entities — OTC-AGT-011 loading Meridian MSA-2024-0892",
    color: "text-orange-400",
    bgColor: "bg-orange-500/10",
    borderColor: "border-orange-500/20",
  },
  {
    role: "product_config",
    label: "Product Configuration",
    agentCode: "OTC-AGT-001",
    description: "OTC-AGT-001 configuring 47 SKUs — compatibility engine running — bundle P-220 identified",
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/20",
  },
  {
    role: "pricing_optimisation",
    label: "Pricing & Discount Optimisation",
    agentCode: "OTC-AGT-011",
    description: "OTC-AGT-011 applying waterfall pricing — discount validated — approval routed to Sarah Chen",
    color: "text-violet-400",
    bgColor: "bg-violet-500/10",
    borderColor: "border-violet-500/20",
  },
  {
    role: "quote_generation",
    label: "Quote Document Generation",
    agentCode: "OTC-AGT-001",
    description: "OTC-AGT-001 generating Q-78432 — 48 SKUs — 4-plant delivery schedule",
    color: "text-green-400",
    bgColor: "bg-green-500/10",
    borderColor: "border-green-500/20",
  },
] as const;

// ─── Pipeline state types ────────────────────────────────────────────────────
export interface OtcRunResult {
  role: string;
  agentCode: string;
  success: boolean;
  message: string | null;
  completedAt: string;
}

export interface OtcLogEntry {
  timestamp: string;
  agentCode: string;
  agentName: string;
  message: string;
  type: "info" | "progress" | "complete" | "error";
}

export interface OtcPipelineState {
  status: "idle" | "running" | "complete" | "error";
  currentRole: string | null;
  currentStep: number;
  results: OtcRunResult[];
  logEntries: OtcLogEntry[];
  startedAt: string | null;
  completedAt: string | null;
  elapsedSeconds: number;
  error: string | null;
}

// ─── Module-level singleton (shared across screens) ────────────────────────
const _cache: OtcPipelineState = {
  status: "idle",
  currentRole: null,
  currentStep: 0,
  results: [],
  logEntries: [],
  startedAt: null,
  completedAt: null,
  elapsedSeconds: 0,
  error: null,
};

export function getCachedOtcPipeline(): OtcPipelineState {
  return { ..._cache, results: [..._cache.results], logEntries: [..._cache.logEntries] };
}

type Listener = (state: OtcPipelineState) => void;
const _listeners = new Set<Listener>();
function notify() {
  const s = getCachedOtcPipeline();
  _listeners.forEach(fn => fn(s));
}

let _timerInterval: ReturnType<typeof setInterval> | null = null;

export interface OtcQuotePipelineHook {
  // Top-level convenience fields (required API shape)
  status: OtcPipelineState["status"];
  logs: OtcLogEntry[];
  currentStep: number;
  isRunning: boolean;
  trigger: () => void;
  // Full state for screens that need granular access
  state: OtcPipelineState;
}

export function useOtcQuotePipeline(): OtcQuotePipelineHook {
  const [state, setState] = useState<OtcPipelineState>(() => getCachedOtcPipeline());

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
    notify();

    const startTime = Date.now();
    if (_timerInterval) clearInterval(_timerInterval);
    _timerInterval = setInterval(() => {
      if (_cache.status !== "running") { clearInterval(_timerInterval!); return; }
      _cache.elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
      notify();
    }, 1000);

    const addLog = (agentCode: string, agentName: string, message: string, type: OtcLogEntry["type"] = "info") => {
      _cache.logEntries.push({ timestamp: new Date().toISOString(), agentCode, agentName, message, type });
      notify();
    };

    const es = new EventSource("/demo-api/otc-quote/live-run");

    es.addEventListener("run_start", (e: MessageEvent) => {
      const d = JSON.parse(e.data);
      addLog("SYSTEM", "Atlas Orchestrator", d.message, "info");
    });

    es.addEventListener("setup", (e: MessageEvent) => {
      const d = JSON.parse(e.data);
      addLog("SYSTEM", "Atlas Orchestrator", d.message, "info");
    });

    es.addEventListener("agent_start", (e: MessageEvent) => {
      const d = JSON.parse(e.data);
      _cache.currentRole = d.role;
      const stepIdx = OTC_PIPELINE_STEPS.findIndex(s => s.role === d.role);
      _cache.currentStep = stepIdx >= 0 ? stepIdx + 1 : _cache.currentStep;
      const code = d.agentName?.includes("Pricing") || d.agentName?.includes("Contract") ? "OTC-AGT-011" : "OTC-AGT-001";
      addLog(code, d.agentName, `Starting ${d.label || d.role}…`, "info");
      notify();
    });

    es.addEventListener("agent_event", (e: MessageEvent) => {
      const d = JSON.parse(e.data);
      const code = d.agentName?.includes("Pricing") || d.agentName?.includes("Contract") ? "OTC-AGT-011" : "OTC-AGT-001";
      let msg = "";
      if (d.type === "tool_call_result") {
        msg = `${d.data?.tool || "catalog_lookup"} → ${d.data?.success ? "ok" : "error"}`;
      } else if (d.type === "analysis_step") {
        msg = "Processing…";
      } else {
        msg = "Processing…";
      }
      addLog(code, d.agentName, msg, "progress");
    });

    es.addEventListener("agent_complete", (e: MessageEvent) => {
      const d = JSON.parse(e.data);
      if (!_cache.results.find(r => r.role === d.role)) {
        const code = d.agentName?.includes("Pricing") || d.agentName?.includes("Contract") ? "OTC-AGT-011" : "OTC-AGT-001";
        _cache.results.push({ role: d.role, agentCode: code, success: d.success, message: d.message || null, completedAt: new Date().toISOString() });
      }
      const code = d.agentName?.includes("Pricing") || d.agentName?.includes("Contract") ? "OTC-AGT-011" : "OTC-AGT-001";
      addLog(code, d.agentName, `${d.role.replace(/_/g, " ")} complete — ${d.success ? "✓" : "✗"}`, d.success ? "complete" : "error");
      notify();
    });

    es.addEventListener("run_complete", (e: MessageEvent) => {
      const d = JSON.parse(e.data);
      _cache.status = "complete";
      _cache.currentRole = null;
      _cache.completedAt = new Date().toISOString();
      if (_timerInterval) clearInterval(_timerInterval);
      addLog("SYSTEM", "Atlas Orchestrator", `Quote Q-78432 generated — $${(d.totalPrice || 429711).toLocaleString()} net — ready for delivery`, "complete");
      es.close();
      notify();
    });

    es.addEventListener("error", (e: MessageEvent) => {
      let msg = "Quote configuration error";
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
