import { useState, useEffect, useRef, useCallback } from "react";

// ─── Shared brand color ───────────────────────────────────────────────────────
export const ADV_SUPPORT_COLOR = "#C62A47";  // Advantive crimson — distinct from all other demos

// ─── Types ────────────────────────────────────────────────────────────────────
export type SupportPipelinePhase =
  | "idle"
  | "setup"
  | "triage"       // SUP-001 active
  | "resolution"   // SUP-002 active
  | "diagnostic"   // SUP-003 active
  | "escalation"   // SUP-004 active
  | "complete"
  | "error";

export interface SupportLogEntry {
  timestamp: number;
  agentCode: string;
  type:      "info" | "tool_call" | "analysis" | "complete" | "error";
  message:   string;
}

export interface SupportAgentStatus {
  code:          string;
  name:          string;
  label:         string;
  status:        "idle" | "running" | "complete" | "error";
  summary?:      string;
  deploymentId?: string;
}

export interface SupportPipelineState {
  phase:   SupportPipelinePhase;
  log:     SupportLogEntry[];
  agents:  SupportAgentStatus[];
  metrics: {
    intent_classified:    boolean;
    kb_confidence:        number;
    diagnostic_complete:  boolean;
    sf_case_created:      boolean;
    t2_assigned:          boolean;
    elapsed_secs:         number;
  };
  agentSummaries: Record<string, string>;
  error?:         string;
}

const AGENT_DEFS: Omit<SupportAgentStatus, "status">[] = [
  { code: "SUP-001", name: "Triage & Intent Classifier",   label: "Triage & Intent Classification"    },
  { code: "SUP-002", name: "Knowledge Resolution Agent",   label: "Knowledge Base Resolution Attempt" },
  { code: "SUP-003", name: "Diagnostic Reasoning Agent",   label: "Diagnostic Reasoning & Log Analysis" },
  { code: "SUP-004", name: "T1→T2 Escalation Packager",   label: "T1→T2 Escalation Packaging"        },
];

function makeInitialState(): SupportPipelineState {
  return {
    phase:   "idle",
    log:     [],
    agents:  AGENT_DEFS.map(a => ({ ...a, status: "idle" })),
    metrics: {
      intent_classified:   false,
      kb_confidence:       0,
      diagnostic_complete: false,
      sf_case_created:     false,
      t2_assigned:         false,
      elapsed_secs:        0,
    },
    agentSummaries: {},
  };
}

// ─── Utility: extract a brief 1-line summary from a tool result object ────────
function briefResult(result: unknown, maxLen = 120): string {
  if (!result || typeof result !== "object") return "";
  const top = result as Record<string, unknown>;
  const firstKey = Object.keys(top)[0];
  if (!firstKey) return "";
  const inner = top[firstKey];
  if (inner && typeof inner === "object" && !Array.isArray(inner)) {
    const pairs = Object.entries(inner as Record<string, unknown>)
      .filter(([, v]) => typeof v === "string" || typeof v === "number")
      .slice(0, 3)
      .map(([k, v]) => `${k}: ${String(v).slice(0, 40)}`);
    return pairs.join(" · ").slice(0, maxLen);
  }
  if (typeof inner === "string" || typeof inner === "number") {
    return String(inner).slice(0, maxLen);
  }
  return "";
}

// ─── Main hook ────────────────────────────────────────────────────────────────
export function useAdvSupportPipeline() {
  const [state, setState] = useState<SupportPipelineState>(makeInitialState);
  const esRef    = useRef<EventSource | null>(null);
  const startTs  = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const addLog = useCallback((agentCode: string, type: SupportLogEntry["type"], message: string) => {
    setState(prev => ({
      ...prev,
      log: [...prev.log, { timestamp: Date.now(), agentCode, type, message }].slice(-150),
    }));
  }, []);

  const setAgentStatus = useCallback((code: string, status: SupportAgentStatus["status"], summary?: string, deploymentId?: string) => {
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

    const es = new EventSource("/demo-api/advantive-support/live-run");
    esRef.current = es;

    const on = (type: string, handler: (d: any) => void) => {
      es.addEventListener(type, (e: MessageEvent) => { try { handler(JSON.parse(e.data)); } catch {} });
    };

    on("run_start", (d) => {
      setState(prev => ({ ...prev, phase: "setup" }));
      addLog("ATLAS", "info", d.message ?? "Support pipeline started");
    });

    on("setup", (d) => {
      addLog("ATLAS", "info", d.message ?? "Setting up agents…");
    });

    on("agent_start", (d) => {
      const code: string = d.agentCode ?? "";
      const phase: SupportPipelinePhase =
        code === "SUP-001" ? "triage"      :
        code === "SUP-002" ? "resolution"  :
        code === "SUP-003" ? "diagnostic"  : "escalation";
      setState(prev => ({ ...prev, phase }));
      setAgentStatus(code, "running", undefined, d.deploymentId);
      addLog(code, "info", `▶ ${d.label ?? code} — step ${d.step}/${d.totalSteps}`);
    });

    on("agent_event", (d) => {
      const code = d.agentCode ?? (
        d.agentName?.includes("001") ? "SUP-001" :
        d.agentName?.includes("002") ? "SUP-002" :
        d.agentName?.includes("003") ? "SUP-003" : "SUP-004"
      );
      if (d.type === "tool_call_start") {
        addLog(code, "analysis", `→ ${d.tool}`);
      } else if (d.type === "tool_call_result") {
        const ok = d.success !== false;
        const icon = ok ? "✔" : "✗";
        const detail = ok ? briefResult(d.result) : (d.error ?? "");
        const suffix = detail ? ` — ${detail}` : "";
        addLog(code, "tool_call", `${icon} ${d.tool}${suffix}`);
      }
    });

    on("agent_complete", (d) => {
      const code: string = d.agentCode ?? "";
      setAgentStatus(code, d.success ? "complete" : "error", d.summary);
      addLog(code, "complete", `${d.success ? "✔" : "✗"} ${code} ${d.success ? "complete" : "failed"}`);

      if (code === "SUP-001" && d.success) {
        setState(prev => ({ ...prev, metrics: { ...prev.metrics, intent_classified: true }, agentSummaries: { ...prev.agentSummaries, [code]: d.summary ?? "" } }));
      } else if (code === "SUP-002" && d.success) {
        setState(prev => ({ ...prev, metrics: { ...prev.metrics, kb_confidence: 0.58 }, agentSummaries: { ...prev.agentSummaries, [code]: d.summary ?? "" } }));
      } else if (code === "SUP-003" && d.success) {
        setState(prev => ({ ...prev, metrics: { ...prev.metrics, diagnostic_complete: true }, agentSummaries: { ...prev.agentSummaries, [code]: d.summary ?? "" } }));
      } else if (code === "SUP-004" && d.success) {
        setState(prev => ({ ...prev, metrics: { ...prev.metrics, sf_case_created: true, t2_assigned: true }, agentSummaries: { ...prev.agentSummaries, [code]: d.summary ?? "" } }));
      } else {
        setState(prev => ({ ...prev, agentSummaries: { ...prev.agentSummaries, [code]: d.summary ?? "" } }));
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
        metrics: {
          ...prev.metrics,
          sf_case_created: d.metrics?.salesforce_case ? true : prev.metrics.sf_case_created,
          t2_assigned:     d.metrics?.t2_specialist   ? true : prev.metrics.t2_assigned,
        },
        agentSummaries: d.agentSummaries ?? prev.agentSummaries,
      }));
      addLog("ATLAS", "complete", "✔ Pipeline complete — SF Case #00074821 created, Marcus Chen assigned, ISO audit covered");
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
