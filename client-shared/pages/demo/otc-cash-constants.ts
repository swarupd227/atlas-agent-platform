import { useState, useCallback, useEffect } from "react";

// ─── Brand color ──────────────────────────────────────────────────────────────
export const OTC_CASH_COLOR = "#10B981"; // emerald — financial/treasury theme

// ─── Types ────────────────────────────────────────────────────────────────────
export type CashPhase =
  | "idle"
  | "setup"
  | "ingestion"        // OTC-AGT-009 step 1: auto-matching
  | "resolution"       // OTC-AGT-009 step 2: GlobalTech deep dive
  | "posting"          // OTC-AGT-006: AR posting + closure
  | "complete"
  | "error";

export interface CashLogEntry {
  timestamp:  number;
  agentCode:  string;
  type:       "info" | "tool_call" | "analysis" | "complete" | "error";
  message:    string;
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
  phase:   CashPhase;
  log:     CashLogEntry[];
  agents:  AgentStatus[];
  metrics: {
    total_amount:        number;
    total_payments:      number;
    match_rate_pct:      number;
    auto_matched_usd:    number;
    manual_review_usd:   number;
    deductions_usd:      number;
    unidentified_usd:    number;
    globaltech_invoices: number;
    ar_reduction:        number;
    bank_rec_pct:        number;
    elapsed_secs:        number;
  };
  agentSummaries: Record<string, string>;
  error?:         string;
}

const AGENT_DEFS: Omit<AgentStatus, "status">[] = [
  { code: "OTC-AGT-009", name: "Cash Application & Reconciliation Agent", label: "Payment Ingestion & Auto-Matching",   step: 1 },
  { code: "OTC-AGT-009", name: "Cash Application & Reconciliation Agent", label: "Complex Payment Resolution",          step: 2 },
  { code: "OTC-AGT-006", name: "Billing & Collections Agent",             label: "AR Posting & Invoice Closure",        step: 3 },
];

function makeInitialState(): CashPipelineState {
  return {
    phase:   "idle",
    log:     [],
    agents:  AGENT_DEFS.map(a => ({ ...a, status: "idle" })),
    metrics: {
      total_amount:        42_313_847,
      total_payments:      387,
      match_rate_pct:      0,
      auto_matched_usd:    0,
      manual_review_usd:   2_487_000,
      deductions_usd:      890_200,
      unidentified_usd:    127_000,
      globaltech_invoices: 47,
      ar_reduction:        0,
      bank_rec_pct:        0,
      elapsed_secs:        0,
    },
    agentSummaries: {},
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
  const [state, setState] = useState<CashPipelineState>(makeInitialState);
  const esRef = { current: null as EventSource | null };
  const startRef = { current: 0 };

  const addLog = (agentCode: string, type: CashLogEntry["type"], message: string) => {
    setState(prev => ({
      ...prev,
      log: [...prev.log, { timestamp: Date.now(), agentCode, type, message }],
    }));
  };

  const trigger = useCallback(() => {
    if (esRef.current) { esRef.current.close(); esRef.current = null; }

    setState(prev => ({
      ...makeInitialState(),
      phase: "setup",
      log: [{ timestamp: Date.now(), agentCode: "ATLAS", type: "info", message: "Connecting to Atlas Cash Application Command Center…" }],
    }));
    startRef.current = Date.now();

    const es = new EventSource("/demo-api/otc-cash/live-run");
    esRef.current = es;

    const elapsed = setInterval(() => {
      setState(prev => ({
        ...prev,
        metrics: { ...prev.metrics, elapsed_secs: Math.round((Date.now() - startRef.current) / 1000) },
      }));
    }, 1000);

    es.addEventListener("run_start", (e) => {
      const d = JSON.parse(e.data);
      setState(prev => ({ ...prev, phase: "ingestion" }));
      addLog("ATLAS", "info", d.message);
    });

    es.addEventListener("setup", (e) => {
      const d = JSON.parse(e.data);
      addLog("ATLAS", "info", d.message);
    });

    es.addEventListener("agent_start", (e) => {
      const d = JSON.parse(e.data);
      const stepIdx = (d.step ?? 1) - 1;
      const phase: CashPhase = stepIdx === 0 ? "ingestion" : stepIdx === 1 ? "resolution" : "posting";
      setState(prev => ({
        ...prev,
        phase,
        agents: prev.agents.map((a, i) => i === stepIdx ? { ...a, status: "running", deploymentId: d.deploymentId } : a),
      }));
      addLog(d.agentCode, "info", `▶ Starting: ${d.label}`);
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
        let metrics = { ...prev.metrics };
        // Update metrics from agent output
        if (json?.match_rate_pct) metrics.match_rate_pct = Number(json.match_rate_pct);
        if (json?.auto_matched_usd) metrics.auto_matched_usd = Number(json.auto_matched_usd);
        if (json?.ar_reduction) metrics.ar_reduction = Number(json.ar_reduction);
        if (json?.bank_rec_pct) metrics.bank_rec_pct = Number(json.bank_rec_pct);
        return {
          ...prev,
          agents:  updated,
          metrics,
          agentSummaries: { ...prev.agentSummaries, [`${d.agentCode}-step${d.step}`]: d.summary ?? "" },
        };
      });
      addLog(d.agentCode, d.success ? "complete" : "error", d.success ? `✓ Complete: ${d.label}` : `✗ Error in ${d.label}`);
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
        phase: "complete",
        metrics: {
          ...prev.metrics,
          match_rate_pct:   d.metrics?.match_rate_pct ?? prev.metrics.match_rate_pct,
          auto_matched_usd: d.metrics?.auto_matched_usd ?? prev.metrics.auto_matched_usd,
          ar_reduction:     d.metrics?.ar_reduction ?? prev.metrics.ar_reduction,
          bank_rec_pct:     d.metrics?.bank_rec_pct ?? prev.metrics.bank_rec_pct,
          elapsed_secs:     Math.round((Date.now() - startRef.current) / 1000),
        },
      }));
      addLog("ATLAS", "complete", `✓ Pipeline complete — ${d.message}`);
      es.close();
    });

    es.addEventListener("error", (e) => {
      clearInterval(elapsed);
      const msg = (e as MessageEvent).data ? JSON.parse((e as MessageEvent).data)?.message : "SSE connection error";
      setState(prev => ({ ...prev, phase: "error", error: msg }));
      addLog("ATLAS", "error", `✗ ${msg}`);
      es.close();
    });

    es.onerror = () => {
      clearInterval(elapsed);
      if (es.readyState === EventSource.CLOSED) {
        setState(prev => prev.phase === "complete" || prev.phase === "error" ? prev : { ...prev, phase: "error", error: "SSE connection lost" });
      }
    };
  }, []);

  const reset = useCallback(() => {
    if (esRef.current) { esRef.current.close(); esRef.current = null; }
    fetch("/demo-api/otc-cash/reset", { method: "POST" }).catch(() => {});
    setState(makeInitialState());
  }, []);

  useEffect(() => () => { if (esRef.current) esRef.current.close(); }, []);

  return { state, trigger, reset };
}
