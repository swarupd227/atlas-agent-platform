import { useState, useCallback, useEffect, useRef } from "react";

// ─── Brand colors ─────────────────────────────────────────────────────────────
export const OTC_CASH_COLOR = "#10B981";

// ─── Scenario types ───────────────────────────────────────────────────────────
export type ScenarioKey = "main" | "vertex" | "regional";

export interface ScenarioInfo {
  label:       string;
  subtitle:    string;
  description: string;
  steps:       number;
  agentCodes:  string[];
  color:       string;
  badge:       string;
}

export const SCENARIO_INFO: Record<ScenarioKey, ScenarioInfo> = {
  main: {
    label:       "Month-End Batch Processing",
    subtitle:    "387 payments · $42.3M",
    badge:       "3-Agent Pipeline",
    description: "Full month-end cash application: ingest 387 payments, run intelligent auto-matching at 94%+ rate, and resolve GlobalTech's $2.3M complex EDI 820 payment covering 47 invoices with 3 deduction codes.",
    steps:       3,
    agentCodes:  ["OTC-AGT-009", "OTC-AGT-009", "OTC-AGT-006"],
    color:       "#10B981",
  },
  vertex: {
    label:       "Vertex Systems — Fuzzy Reference Match",
    subtitle:    "ACH · $487,200",
    badge:       "2-Agent Pipeline",
    description: "ACH payment flagged as exception due to a reference mismatch. Agent investigates open AR, runs PO cross-reference fuzzy matching to find the correct invoices, and posts the confirmed cash receipt.",
    steps:       2,
    agentCodes:  ["OTC-AGT-009", "OTC-AGT-006"],
    color:       "#6366F1",
  },
  regional: {
    label:       "Regional Supply Co — No Remittance",
    subtitle:    "Check · $127,000",
    badge:       "2-Agent Pipeline",
    description: "Check received with no remittance stub. Agent analyses open invoices, proposes oldest-first allocation, initiates automated customer chase, and posts provisionally to clear aging.",
    steps:       2,
    agentCodes:  ["OTC-AGT-009", "OTC-AGT-006"],
    color:       "#F59E0B",
  },
};

// ─── Pipeline types ───────────────────────────────────────────────────────────
export type CashPhase = "idle" | "setup" | "running" | "complete" | "error";

export interface CashLogEntry {
  timestamp: number;
  agentCode: string;
  type:      "info" | "tool_call" | "analysis" | "complete" | "error";
  message:   string;
}

export interface AgentStatus {
  code:          string;
  name:          string;
  label:         string;
  step:          number;
  status:        "idle" | "running" | "complete" | "error";
  summary?:      string;
  deploymentId?: string;
}

export interface CashPipelineState {
  phase:       CashPhase;
  scenarioKey: ScenarioKey | null;
  log:         CashLogEntry[];
  agents:      AgentStatus[];
  metrics:     Record<string, number | boolean | string>;
  agentSummaries: Record<string, string>;
  error?:      string;
  elapsed_secs: number;
}

function makeIdleState(): CashPipelineState {
  return {
    phase:       "idle",
    scenarioKey: null,
    log:         [],
    agents:      [],
    metrics:     {},
    agentSummaries: {},
    elapsed_secs: 0,
  };
}

// ─── JSON extraction ──────────────────────────────────────────────────────────
export function parseAgentJson(text: string): Record<string, unknown> | null {
  if (!text) return null;
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0, inString = false, escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\" && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          const candidate = text.slice(start, i + 1);
          const parsed = JSON.parse(candidate);
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
        } catch {
          const next = text.indexOf("{", i + 1);
          if (next === -1) return null;
          i = next - 1; depth = 0;
        }
        break;
      }
    }
  }
  return null;
}

// ─── Pipeline hook ────────────────────────────────────────────────────────────
export function useOtcCashPipeline() {
  const [state, setState] = useState<CashPipelineState>(makeIdleState);
  const esRef    = useRef<EventSource | null>(null);
  const startRef = useRef<number>(0);

  const addLog = (agentCode: string, type: CashLogEntry["type"], message: string) => {
    setState(prev => ({
      ...prev,
      log: [...prev.log, { timestamp: Date.now(), agentCode, type, message }],
    }));
  };

  const trigger = useCallback((scenarioKey: ScenarioKey) => {
    if (esRef.current) { esRef.current.close(); esRef.current = null; }

    const info = SCENARIO_INFO[scenarioKey];
    const initialAgents: AgentStatus[] = info.agentCodes.map((code, i) => ({
      code,
      name:   code === "OTC-AGT-009" ? "Cash Application & Reconciliation Agent" : "Billing & Collections Agent",
      label:  "Pending…",
      step:   i + 1,
      status: "idle",
    }));

    const seedMetrics: Record<string, number | boolean | string> = scenarioKey === "main"
      ? { total_amount: 42_313_847, total_payments: 387, match_rate_pct: 0, auto_matched_usd: 0, ar_reduction: 0, bank_rec_pct: 0 }
      : {};

    setState({
      phase:        "setup",
      scenarioKey,
      log:          [{ timestamp: Date.now(), agentCode: "ATLAS", type: "info", message: `Starting: ${info.label}` }],
      agents:       initialAgents,
      metrics:      seedMetrics,
      agentSummaries: {},
      elapsed_secs: 0,
    });
    startRef.current = Date.now();

    const es = new EventSource(`/demo-api/otc-cash/live-run?scenario=${scenarioKey}`);
    esRef.current = es;

    const elapsed = setInterval(() => {
      setState(prev => ({
        ...prev,
        elapsed_secs: Math.round((Date.now() - startRef.current) / 1000),
      }));
    }, 1000);

    es.addEventListener("run_start", (e) => {
      const d = JSON.parse(e.data);
      setState(prev => ({ ...prev, phase: "running" }));
      addLog("ATLAS", "info", d.message);
    });

    es.addEventListener("setup", (e) => {
      const d = JSON.parse(e.data);
      addLog("ATLAS", "info", d.message);
    });

    es.addEventListener("agent_start", (e) => {
      const d = JSON.parse(e.data);
      const stepIdx = (d.step ?? 1) - 1;
      setState(prev => ({
        ...prev,
        phase: "running",
        agents: prev.agents.map((a, i) =>
          i === stepIdx ? { ...a, label: d.label ?? a.label, status: "running", deploymentId: d.deploymentId } : a
        ),
      }));
      addLog(d.agentCode, "info", `▶ ${d.label}`);
    });

    es.addEventListener("agent_event", (e) => {
      const d = JSON.parse(e.data);
      if (d.type === "tool_call_result") {
        const agentCode = d.agentName?.includes("Billing") ? "OTC-AGT-006" : "OTC-AGT-009";
        addLog(agentCode, "tool_call", `⚙ ${d.tool}`);
      } else if (d.type === "analysis_step") {
        const agentCode = d.agentName?.includes("Billing") ? "OTC-AGT-006" : "OTC-AGT-009";
        addLog(agentCode, "analysis", `↻ Reasoning…`);
      }
    });

    es.addEventListener("agent_complete", (e) => {
      const d = JSON.parse(e.data);
      const stepIdx = (d.step ?? 1) - 1;
      const json = parseAgentJson(d.summary ?? "");
      setState(prev => {
        const updated = prev.agents.map((a, i) =>
          i === stepIdx ? { ...a, status: d.success ? "complete" : "error", summary: d.summary?.slice(0, 300) } : a
        );
        const metrics = { ...prev.metrics };
        if (json) {
          Object.entries(json).forEach(([k, v]) => {
            if (typeof v === "number" || typeof v === "boolean" || typeof v === "string") {
              metrics[k] = v;
            }
          });
        }
        return {
          ...prev,
          agents:  updated,
          metrics,
          agentSummaries: { ...prev.agentSummaries, [`${d.agentCode}-step${d.step}`]: d.summary ?? "" },
        };
      });
      addLog(d.agentCode, d.success ? "complete" : "error",
        d.success ? `✓ ${d.label}` : `✗ Error in ${d.label}`);
    });

    es.addEventListener("agent_error", (e) => {
      const d = JSON.parse(e.data);
      setState(prev => ({ ...prev, phase: "error", error: d.message }));
      addLog(d.agentCode ?? "ATLAS", "error", `✗ ${d.message}`);
    });

    es.addEventListener("pipeline_complete", (e) => {
      const d = JSON.parse(e.data);
      clearInterval(elapsed);
      setState(prev => ({
        ...prev,
        phase:       "complete",
        elapsed_secs: Math.round((Date.now() - startRef.current) / 1000),
        metrics:     { ...prev.metrics, ...(d.metrics ?? {}) },
      }));
      addLog("ATLAS", "complete", `✓ ${d.message}`);
      es.close();
    });

    es.addEventListener("error", (e) => {
      clearInterval(elapsed);
      const msg = (e as MessageEvent).data
        ? JSON.parse((e as MessageEvent).data)?.message
        : "SSE connection error";
      setState(prev => ({ ...prev, phase: "error", error: msg }));
      addLog("ATLAS", "error", `✗ ${msg}`);
      es.close();
    });

    es.onerror = () => {
      clearInterval(elapsed);
      if (es.readyState === EventSource.CLOSED) {
        setState(prev =>
          prev.phase === "complete" || prev.phase === "error"
            ? prev
            : { ...prev, phase: "error", error: "SSE connection lost" }
        );
      }
    };
  }, []);

  const reset = useCallback(() => {
    if (esRef.current) { esRef.current.close(); esRef.current = null; }
    fetch("/demo-api/otc-cash/reset", { method: "POST" }).catch(() => {});
    setState(makeIdleState());
  }, []);

  useEffect(() => () => { if (esRef.current) esRef.current.close(); }, []);

  return { state, trigger, reset };
}
