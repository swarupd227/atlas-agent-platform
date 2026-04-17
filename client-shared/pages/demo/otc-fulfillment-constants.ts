import { useState, useEffect, useRef, useCallback } from "react";

// ─── Shared brand color ───────────────────────────────────────────────────────
export const OTC_FULFILLMENT_COLOR = "#E85D26";  // deep orange — distinct from #FF6B35 order

// ─── Types ────────────────────────────────────────────────────────────────────
export type PipelinePhase =
  | "idle"
  | "setup"
  | "disruption"     // OTC-AGT-005 active
  | "rerouting"      // OTC-AGT-007 active
  | "notification"   // OTC-AGT-012 active
  | "complete"
  | "error";

export interface FulfillmentLogEntry {
  timestamp: number;
  agentCode: string;
  type:      "info" | "tool_call" | "analysis" | "complete" | "error";
  message:   string;
}

export interface AgentStatus {
  code:        string;
  name:        string;
  label:       string;
  status:      "idle" | "running" | "complete" | "error";
  summary?:    string;
  deploymentId?: string;
}

export interface FulfillmentPipelineState {
  phase:        PipelinePhase;
  log:          FulfillmentLogEntry[];
  agents:       AgentStatus[];
  metrics: {
    total_affected:    number;
    priority_rerouted: number;
    sla_saved_pct:     number;
    cost_usd:          number;
    notified:          number;
    elapsed_secs:      number;
  };
  agentSummaries: Record<string, string>;
  error?:         string;
}

const AGENT_DEFS: Omit<AgentStatus, "status">[] = [
  { code: "OTC-AGT-005", name: "Fulfillment & Exception Agent",         label: "Disruption Assessment & Rerouting" },
  { code: "OTC-AGT-007", name: "Delivery Tracking & Confirmation Agent", label: "Carrier Signal & Routing Update"   },
  { code: "OTC-AGT-012", name: "Customer Communication & Notification Agent", label: "Customer Notification Dispatch"    },
];

function makeInitialState(): FulfillmentPipelineState {
  return {
    phase:   "idle",
    log:     [],
    agents:  AGENT_DEFS.map(a => ({ ...a, status: "idle" })),
    metrics: { total_affected: 847, priority_rerouted: 0, sla_saved_pct: 0, cost_usd: 0, notified: 0, elapsed_secs: 0 },
    agentSummaries: {},
  };
}

// ─── Main hook ────────────────────────────────────────────────────────────────
export function useOtcFulfillmentPipeline() {
  const [state, setState] = useState<FulfillmentPipelineState>(makeInitialState);
  const esRef   = useRef<EventSource | null>(null);
  const startTs = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const addLog = useCallback((agentCode: string, type: FulfillmentLogEntry["type"], message: string) => {
    setState(prev => ({
      ...prev,
      log: [...prev.log, { timestamp: Date.now(), agentCode, type, message }].slice(-120),
    }));
  }, []);

  const setAgentStatus = useCallback((code: string, status: AgentStatus["status"], summary?: string, deploymentId?: string) => {
    setState(prev => ({
      ...prev,
      agents: prev.agents.map(a =>
        a.code === code ? { ...a, status, ...(summary ? { summary } : {}), ...(deploymentId ? { deploymentId } : {}) } : a
      ),
    }));
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  const start = useCallback(() => {
    if (esRef.current) { esRef.current.close(); esRef.current = null; }
    stopTimer();
    setState(makeInitialState);
    startTs.current = Date.now();
    timerRef.current = setInterval(() => {
      setState(prev => ({
        ...prev,
        metrics: { ...prev.metrics, elapsed_secs: Math.floor((Date.now() - startTs.current) / 1000) },
      }));
    }, 1000);

    const es = new EventSource("/demo-api/otc-fulfillment/live-run");
    esRef.current = es;

    const on = (type: string, handler: (d: any) => void) => {
      es.addEventListener(type, (e: MessageEvent) => { try { handler(JSON.parse(e.data)); } catch {} });
    };

    on("run_start", (d) => {
      setState(prev => ({ ...prev, phase: "setup" }));
      addLog("ATLAS", "info", d.message ?? "Pipeline started");
    });

    on("setup", (d) => {
      addLog("ATLAS", "info", d.message ?? "Setting up agents…");
    });

    on("agent_start", (d) => {
      const code: string = d.agentCode ?? "";
      const phase: PipelinePhase =
        code === "OTC-AGT-005" ? "disruption" :
        code === "OTC-AGT-007" ? "rerouting"  : "notification";
      setState(prev => ({ ...prev, phase }));
      setAgentStatus(code, "running", undefined, d.deploymentId);
      addLog(code, "info", `▶ ${d.label ?? code} — step ${d.step}/${d.totalSteps}`);
    });

    on("agent_event", (d) => {
      const code = d.agentName?.includes("005") ? "OTC-AGT-005"
                 : d.agentName?.includes("007") ? "OTC-AGT-007"
                 : "OTC-AGT-012";
      if (d.type === "tool_call_result") {
        const icon = d.data?.success !== false ? "✓" : "✗";
        addLog(code, "tool_call", `${icon} ${d.tool}`);
      } else {
        addLog(code, "analysis", "↻ Reasoning…");
      }
    });

    on("agent_complete", (d) => {
      const code: string = d.agentCode ?? "";
      setAgentStatus(code, d.success ? "complete" : "error", d.summary);
      addLog(code, "complete", `${d.success ? "✔" : "✗"} ${code} ${d.success ? "complete" : "failed"}`);

      // Update live metrics from agent completions
      if (code === "OTC-AGT-005" && d.success) {
        setState(prev => ({
          ...prev,
          metrics: { ...prev.metrics, priority_rerouted: 312, sla_saved_pct: 92.6, cost_usd: 47200 },
          agentSummaries: { ...prev.agentSummaries, [code]: d.summary ?? "" },
        }));
      } else if (code === "OTC-AGT-012" && d.success) {
        setState(prev => ({
          ...prev,
          metrics: { ...prev.metrics, notified: 847 },
          agentSummaries: { ...prev.agentSummaries, [code]: d.summary ?? "" },
        }));
      } else {
        setState(prev => ({
          ...prev,
          agentSummaries: { ...prev.agentSummaries, [code]: d.summary ?? "" },
        }));
      }
    });

    on("agent_error", (d) => {
      const code: string = d.agentCode ?? "";
      setAgentStatus(code, "error");
      addLog(code, "error", `✗ ${d.message ?? "Agent error"}`);
      setState(prev => ({ ...prev, phase: "error", error: d.message }));
      stopTimer();
    });

    on("pipeline_complete", (d) => {
      stopTimer();
      setState(prev => ({
        ...prev,
        phase:   "complete",
        metrics: { ...prev.metrics, notified: d.metrics?.customers_notified ?? prev.metrics.notified },
        agentSummaries: d.agentSummaries ?? prev.agentSummaries,
      }));
      addLog("ATLAS", "complete", "✔ Pipeline complete — 847 customers notified, 312 shipments rerouted");
      es.close();
    });

    on("error", (d) => {
      stopTimer();
      setState(prev => ({ ...prev, phase: "error", error: d.message ?? "Pipeline error" }));
      addLog("ATLAS", "error", `✗ ${d.message ?? "Pipeline error"}`);
      es.close();
    });

    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) {
        stopTimer();
        setState(prev =>
          prev.phase !== "complete" && prev.phase !== "error"
            ? { ...prev, phase: "error", error: "Connection lost" }
            : prev
        );
      }
    };
  }, [addLog, setAgentStatus, stopTimer]);

  const reset = useCallback(() => {
    if (esRef.current) { esRef.current.close(); esRef.current = null; }
    stopTimer();
    setState(makeInitialState);
  }, [stopTimer]);

  useEffect(() => () => {
    if (esRef.current) esRef.current.close();
    stopTimer();
  }, [stopTimer]);

  return { state, start, reset };
}
