export type GlSyncScenario = "happy" | "dimension_mismatch" | "control_total_variance";

export type AgentStatus = "idle" | "running" | "complete" | "error" | "skipped";

export interface AgentRun {
  index: number;
  id: string;
  name: string;
  role: string;
  status: AgentStatus;
  startedAt: string | null;
  completedAt: string | null;
  traceId: string | null;
  summary: string | null;
  toolCallCount: number;
}

export interface GlSyncRunStats {
  businessDate: string;
  entriesExtracted: number;
  entriesTransformed: number;
  entriesPosted: number;
  entriesExcepted: number;
  debitTotal: number;
  creditTotal: number;
  intacctTotal: number;
  controlHash: string;
  balanced: boolean;
  variance: number;
  jeId: string | null;
  deliveryId: string | null;
}

export interface GlSyncDemoState {
  scenario: GlSyncScenario;
  running: boolean;
  finalized: boolean;
  runStartedAt: number | null;
  agents: AgentRun[];
  stats: GlSyncRunStats;
  exceptions: { count: number; reason: string; accounts: string[] } | null;
  humanGate: { gateType: string; message: string; context: Record<string, any> } | null;
  generation: number;
}

export const GL_SYNC_AGENTS: Omit<AgentRun, "status" | "startedAt" | "completedAt" | "traceId" | "summary" | "toolCallCount">[] = [
  { index: 0, id: "a0000000-0000-4000-8000-000000000000", name: "Sync Orchestrator",           role: "Initiates cycle, checks idempotency & watermark, coordinates pod" },
  { index: 1, id: "a1000000-0000-4000-8000-000000000001", name: "GL Account Catalog Agent",    role: "Validates Symitar ↔ Intacct account crosswalk" },
  { index: 2, id: "a2000000-0000-4000-8000-000000000002", name: "Core GL Extraction Agent",    role: "Pulls prior-day GL movements from Symitar (PowerOn)" },
  { index: 3, id: "a3000000-0000-4000-8000-000000000003", name: "GL Transformation Agent",     role: "Maps core account codes to Intacct GL account IDs" },
  { index: 4, id: "a4000000-0000-4000-8000-000000000004", name: "Dimension & Compliance Agent",role: "Attaches branch/dept/cost-center dims, flags missing values" },
  { index: 5, id: "a5000000-0000-4000-8000-000000000005", name: "Journal Posting Agent",       role: "Posts transformed JE batch to Sage Intacct" },
  { index: 6, id: "a6000000-0000-4000-8000-000000000006", name: "Reconciliation Agent",        role: "Verifies control totals, updates watermark, delivers report" },
];

const YESTERDAY = () => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); };

function makeInitialAgents(): AgentRun[] {
  return GL_SYNC_AGENTS.map(a => ({
    ...a, status: "idle", startedAt: null, completedAt: null, traceId: null, summary: null, toolCallCount: 0,
  }));
}

function makeInitialStats(): GlSyncRunStats {
  return {
    businessDate: YESTERDAY(),
    entriesExtracted: 0, entriesTransformed: 0, entriesPosted: 0, entriesExcepted: 0,
    debitTotal: 0, creditTotal: 0, intacctTotal: 0,
    controlHash: "", balanced: false, variance: 0,
    jeId: null, deliveryId: null,
  };
}

let state: GlSyncDemoState = {
  scenario: "happy",
  running: false, finalized: false, runStartedAt: null,
  agents: makeInitialAgents(),
  stats: makeInitialStats(),
  exceptions: null, humanGate: null,
  generation: 0,
};

export function getGlSyncState(): GlSyncDemoState { return state; }
export function getGlSyncScenario(): GlSyncScenario { return state.scenario; }
export function isGlSyncRunning(): boolean { return state.running; }
export function getGlSyncGeneration(): number { return state.generation; }

export function resetGlSync(scenario: GlSyncScenario = "happy"): void {
  state = {
    scenario,
    running: false, finalized: false, runStartedAt: null,
    agents: makeInitialAgents(),
    stats: makeInitialStats(),
    exceptions: null, humanGate: null,
    generation: state.generation + 1,
  };
}

export function setGlSyncRunning(v: boolean): void { state.running = v; }
export function setGlSyncFinalized(v: boolean): void { state.finalized = v; }

export function setAgentStatus(index: number, status: AgentStatus, extras?: Partial<AgentRun>): void {
  const a = state.agents[index];
  if (!a) return;
  state.agents[index] = { ...a, status, ...extras };
}

export function updateStats(patch: Partial<GlSyncRunStats>): void {
  state.stats = { ...state.stats, ...patch };
}

export function setExceptions(e: GlSyncDemoState["exceptions"]): void { state.exceptions = e; }
export function setHumanGate(g: GlSyncDemoState["humanGate"]): void { state.humanGate = g; }
