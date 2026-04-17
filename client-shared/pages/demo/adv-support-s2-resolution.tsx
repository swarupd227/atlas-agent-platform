import { Search, BookOpen, CheckCircle, XCircle, AlertCircle, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { SupportPipelineState } from "./adv-support-constants";
import { ADV_SUPPORT_COLOR } from "./adv-support-constants";

const ACCENT = ADV_SUPPORT_COLOR;

const KB_RESULTS = [
  { id: "IQS-KB-9201-SQL",  title: "InfinityQS v9.2 SQL Adapter Performance Tuning",    relevance: 0.74, version: "v9.2.x", note: "Written for v9.2 — v9.3 applicability unconfirmed" },
  { id: "IQS-RN-930",       title: "InfinityQS v9.3 Release Notes",                      relevance: 0.58, version: "v9.3.0", note: "Migration script reference — critical but incomplete" },
  { id: "IQS-KB-9300-UPG",  title: "InfinityQS v9.3 Upgrade Checklist",                 relevance: 0.55, version: "v9.3.0", note: "Confirms permission requirement, not error-specific" },
  { id: "IQS-KB-8944-XR",   title: "Xbar-R Chart Configuration Reference",              relevance: 0.62, version: "v8-9.x", note: "Connection pool context — partial match" },
];

const HIST_RESULTS = [
  { id: "TKT-2025-18847", similarity: 0.81, version: "v9.2.1", resolved: "T1 autonomous", note: "v9.2 fix — may not apply to v9.3" },
  { id: "TKT-2026-00412", similarity: 0.64, version: "v9.3.0", resolved: "T2 escalation", note: "Same error code + version — was escalated!" },
];

interface Props { state: SupportPipelineState; }

export default function AdvSupportS2Resolution({ state }: Props) {
  const isRunning = state.agents.find(a => a.code === "SUP-002")?.status === "running";
  const isDone    = state.agents.find(a => a.code === "SUP-002")?.status === "complete";
  const kb_confidence = state.metrics.kb_confidence;

  const confidencePct = isDone ? Math.round(kb_confidence * 100) : 0;
  const gateResult = isDone ? (kb_confidence < 0.65 ? "failed" : kb_confidence < 0.80 ? "additional_pass" : "resolved") : "pending";

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Status banner */}
      <div
        className="rounded-lg border px-4 py-3 flex items-start gap-3"
        style={{ background: `${ACCENT}10`, borderColor: `${ACCENT}35` }}
        data-testid="kb-status-banner"
      >
        <Search className="w-5 h-5 shrink-0 mt-0.5" style={{ color: ACCENT }} />
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold" style={{ color: ACCENT }}>KB RESOLUTION ATTEMPT</span>
            {isRunning && <Badge variant="outline" className="text-[10px] border-amber-400/50 text-amber-400">SUP-002 Searching</Badge>}
            {isDone && gateResult === "failed" && <Badge variant="outline" className="text-[10px] border-rose-500/50 text-rose-400">Confidence Gate Failed → Diagnostic</Badge>}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Searching Advantive Product KB (8+ product lines) + 18,400 historical T1 tickets for InfinityQS v9.3 / IQS-SQL-TMO-7891
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* KB Search Results */}
        <div className="rounded-lg border border-border/40 bg-card/50 p-4">
          <div className="flex items-center gap-2 mb-3">
            <BookOpen className="w-4 h-4" style={{ color: ACCENT }} />
            <span className="text-sm font-semibold">Product Documentation Search</span>
            <Badge variant="outline" className="ml-auto text-[9px] text-muted-foreground border-border/50">5 results</Badge>
          </div>
          <div className="flex flex-col gap-2">
            {KB_RESULTS.map(r => (
              <div key={r.id} className="flex items-start gap-2 py-1.5 border-b border-border/20 last:border-0" data-testid={`kb-result-${r.id}`}>
                <div
                  className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
                  style={{ background: r.relevance >= 0.70 ? ACCENT : r.relevance >= 0.55 ? "#f59e0b" : "#64748b" }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[11px] font-medium truncate">{r.title}</span>
                    <span className="text-[10px] font-mono shrink-0" style={{ color: ACCENT }}>{isDone ? r.relevance.toFixed(2) : "--"}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[9px] font-mono text-muted-foreground/60">{r.version}</span>
                    <span className="text-[9px] text-muted-foreground/50 truncate">{r.note}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Historical Resolutions */}
        <div className="rounded-lg border border-border/40 bg-card/50 p-4">
          <div className="flex items-center gap-2 mb-3">
            <FileText className="w-4 h-4" style={{ color: ACCENT }} />
            <span className="text-sm font-semibold">Historical Ticket Similarity</span>
            <Badge variant="outline" className="ml-auto text-[9px] text-muted-foreground border-border/50">18,400 searched</Badge>
          </div>
          <div className="flex flex-col gap-3">
            {HIST_RESULTS.map(r => (
              <div key={r.id} className="flex flex-col gap-1 py-2 border-b border-border/20 last:border-0" data-testid={`hist-result-${r.id}`}>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono font-medium">{r.id}</span>
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className={`text-[9px] ${r.resolved === "T2 escalation" ? "border-rose-500/40 text-rose-400" : "border-emerald-500/40 text-emerald-400"}`}>
                      {r.resolved}
                    </Badge>
                    <span className="text-[10px] font-mono" style={{ color: ACCENT }}>{isDone ? r.similarity.toFixed(2) : "--"}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[9px] border-border/40 text-muted-foreground">{r.version}</Badge>
                  <span className="text-[10px] text-muted-foreground/70">{r.note}</span>
                </div>
              </div>
            ))}
            {isDone && (
              <div className="rounded bg-rose-950/30 border border-rose-500/20 px-3 py-2 mt-1">
                <span className="text-[10px] text-rose-400">⚠ Only 1 prior v9.3 case with IQS-SQL-TMO-7891 exists — and it was escalated to T2. KB coverage insufficient.</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Confidence Gate */}
      <div className="rounded-lg border border-border/40 bg-card/50 p-4" data-testid="confidence-gate">
        <div className="flex items-center gap-2 mb-3">
          {isDone && gateResult === "failed"
            ? <XCircle className="w-4 h-4 text-rose-400" />
            : isDone
            ? <CheckCircle className="w-4 h-4 text-emerald-400" />
            : <AlertCircle className="w-4 h-4 text-muted-foreground" />
          }
          <span className="text-sm font-semibold">Confidence Gate Assessment</span>
          {isDone && (
            <Badge
              variant="outline"
              className={`ml-auto text-[10px] ${gateResult === "failed" ? "border-rose-500/50 text-rose-400" : "border-emerald-500/50 text-emerald-400"}`}
            >
              {gateResult === "failed" ? "GATE FAILED — Route to Diagnostic" : "GATE PASSED"}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-4 mb-3">
          <div className="flex-1 h-3 rounded-full bg-border/30 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-1000"
              style={{
                width: isDone ? `${confidencePct}%` : "0%",
                background: confidencePct < 65 ? "#ef4444" : confidencePct < 80 ? "#f59e0b" : "#22c55e",
              }}
            />
          </div>
          <span className="text-lg font-bold font-mono" style={{ color: isDone ? (confidencePct < 65 ? "#ef4444" : "#f59e0b") : "#64748b" }}>
            {isDone ? `${confidencePct}%` : "--"}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            { label: ">80%", desc: "Autonomous resolve", active: confidencePct >= 80, color: "text-emerald-400" },
            { label: "65–80%", desc: "Additional pass", active: confidencePct >= 65 && confidencePct < 80, color: "text-amber-400" },
            { label: "<65%", desc: "→ Diagnostic", active: isDone && confidencePct < 65, color: "text-rose-400" },
          ].map(t => (
            <div
              key={t.label}
              className={`rounded border p-2 transition-all ${t.active ? "border-current bg-current/10" : "border-border/20 opacity-40"}`}
              style={t.active ? { borderColor: t.color.replace("text-", "").replace("-400", ""), color: t.color.replace("text-", "") } : undefined}
            >
              <div className={`text-xs font-bold font-mono ${t.color}`}>{t.label}</div>
              <div className="text-[10px] text-muted-foreground">{t.desc}</div>
            </div>
          ))}
        </div>

        {isDone && (
          <div className="mt-3 pt-3 border-t border-border/20 text-[11px] text-muted-foreground">
            Final confidence: <span className="text-rose-400 font-medium">0.58</span> (below 0.65 minimum).
            Additional search pass reached <span className="font-medium">0.61</span> — still below threshold.
            Routing to <span style={{ color: ACCENT }} className="font-medium">SUP-003 Diagnostic Reasoning Agent</span>.
          </div>
        )}
      </div>
    </div>
  );
}
