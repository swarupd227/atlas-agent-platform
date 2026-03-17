export type AgentKey =
  | "financialDataCollector"
  | "earningsAnalyzer"
  | "peerComparisonBuilder"
  | "esgProfileAgent"
  | "newsEventScanner"
  | "scorecardPrePopulation";

export type AgentStatus = "pending" | "running" | "complete" | "error";
export type PipelineStatus = "idle" | "running" | "complete";

export interface AgentState {
  status: AgentStatus;
  startedAt: string | null;
  completedAt: string | null;
  durationSec: number | null;
  stepCount: number;
}

export interface OverrideEntry {
  id: string;
  timestamp: string;
  field: string;
  agentValue: string;
  analystValue: string;
  note: string;
  type: "confirmed" | "overridden";
}

export interface MoodysState {
  status: PipelineStatus;
  startedAt: string | null;
  completedAt: string | null;
  packageConfirmed: boolean;
  confirmedAt: string | null;
  overrides: OverrideEntry[];
  toolCallLog: { timestamp: string; tool: string; agent: string; summary: string }[];
  agents: Record<AgentKey, AgentState>;
}

const INITIAL_AGENT: AgentState = {
  status: "pending",
  startedAt: null,
  completedAt: null,
  durationSec: null,
  stepCount: 0,
};

function freshState(): MoodysState {
  return {
    status: "idle",
    startedAt: null,
    completedAt: null,
    packageConfirmed: false,
    confirmedAt: null,
    overrides: [],
    toolCallLog: [],
    agents: {
      financialDataCollector: { ...INITIAL_AGENT },
      earningsAnalyzer: { ...INITIAL_AGENT },
      peerComparisonBuilder: { ...INITIAL_AGENT },
      esgProfileAgent: { ...INITIAL_AGENT },
      newsEventScanner: { ...INITIAL_AGENT },
      scorecardPrePopulation: { ...INITIAL_AGENT },
    },
  };
}

let state: MoodysState = freshState();

export function getMoodysState(): MoodysState {
  return state;
}

export function resetMoodysState(): void {
  state = freshState();
}

export function setMoodysPipelineStatus(s: PipelineStatus): void {
  state.status = s;
  if (s === "running") state.startedAt = new Date().toISOString();
  if (s === "complete") state.completedAt = new Date().toISOString();
}

export function setMoodysAgentStatus(agent: AgentKey, updates: Partial<AgentState>): void {
  state.agents[agent] = { ...state.agents[agent], ...updates };
}

export function logMoodysToolCall(agent: string, tool: string, summary: string): void {
  state.toolCallLog.push({ timestamp: new Date().toISOString(), tool, agent, summary });
  const agentKey = agent as AgentKey;
  if (state.agents[agentKey]) {
    state.agents[agentKey].stepCount += 1;
  }
}

export function addMoodysOverride(entry: Omit<OverrideEntry, "id">): OverrideEntry {
  const override: OverrideEntry = { id: `OVR-${Date.now()}`, ...entry };
  state.overrides.push(override);
  return override;
}

export function confirmMoodysPackage(): void {
  state.packageConfirmed = true;
  state.confirmedAt = new Date().toISOString();
}
