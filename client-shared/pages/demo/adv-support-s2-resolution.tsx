import { Search, BookOpen, CheckCircle, XCircle, AlertCircle, FileText, CheckCircle2, Cpu } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { SupportPipelineState } from "./adv-support-constants";
import { ADV_SUPPORT_COLOR } from "./adv-support-constants";

const ACCENT = ADV_SUPPORT_COLOR;

const KB_RESULTS_A = [
  { id: "IQS-KB-9201-SQL", title: "InfinityQS v9.2 SQL Adapter Performance Tuning",  relevance: 0.74, version: "v9.2.x", note: "Written for v9.2 — v9.3 applicability unconfirmed" },
  { id: "IQS-RN-930",      title: "InfinityQS v9.3 Release Notes",                   relevance: 0.58, version: "v9.3.0", note: "Migration script reference — critical but incomplete" },
  { id: "IQS-KB-9300-UPG", title: "InfinityQS v9.3 Upgrade Checklist",              relevance: 0.55, version: "v9.3.0", note: "Confirms permission requirement, not error-specific" },
  { id: "IQS-KB-8944-XR",  title: "Xbar-R Chart Configuration Reference",           relevance: 0.62, version: "v8-9.x", note: "Connection pool context — partial match" },
];

const KB_RESULTS_B = [
  { id: "IQS-KB-9302-ALM", title: "InfinityQS v9.3 Alarm & Notification Configuration Guide", relevance: 0.91, version: "v9.3.0", note: "v9.3 SMTP credential vault — directly applicable" },
  { id: "IQS-KB-9201-ALM", title: "InfinityQS v9.2 Alarm Email Setup Reference",             relevance: 0.84, version: "v9.2.x", note: "Same SMTP pattern — v9.2 base reference" },
  { id: "IQS-RN-930",      title: "InfinityQS v9.3 Release Notes",                           relevance: 0.79, version: "v9.3.0", note: "SMTP credential migration break documented" },
  { id: "IQS-KB-9300-UPG", title: "InfinityQS v9.3 Upgrade Checklist",                      relevance: 0.76, version: "v9.3.0", note: "Alarm Settings re-configuration step included" },
];

const KB_RESULTS_C = [
  { id: "PF-KB-0821-SYNC", title: "ParityFactory v8.2 Data Sync Engine Reference",    relevance: 0.63, version: "v8.2.x", note: "Sync daemon reference — recovery requires T2" },
  { id: "PF-KB-FDA-CFR11", title: "ParityFactory 21 CFR Part 11 Compliance Guide",   relevance: 0.58, version: "v8.x–9.x", note: "Compliance guide — mandates human oversight" },
  { id: "PF-KB-0719-DR",   title: "ParityFactory Disaster Recovery Procedures",       relevance: 0.47, version: "v7.x–8.x", note: "Do not restart daemon without T2" },
  { id: "PF-RN-821",       title: "ParityFactory v8.2.1 Release Notes",               relevance: 0.41, version: "v8.2.1",   note: "Race condition fix reference" },
];

const HIST_A = [
  { id: "TKT-2025-18847", similarity: 0.81, version: "v9.2.1", resolved: "T1 autonomous", note: "v9.2 fix — may not apply to v9.3" },
  { id: "TKT-2026-00412", similarity: 0.64, version: "v9.3.0", resolved: "T2 escalation", note: "Same error code + version — was escalated!" },
];

const HIST_B = [
  { id: "TKT-2026-00108", similarity: 0.87, version: "v9.3.0", resolved: "T1 autonomous", note: "Confirmed v9.3 fix — SMTP re-entry, 12 min" },
  { id: "TKT-2025-21034", similarity: 0.91, version: "v9.2.0", resolved: "T1 autonomous", note: "Same root cause (v9.2) — T1 resolved in 8 min" },
];

const HIST_C = [
  { id: "TKT-2025-14892", similarity: 0.58, version: "v8.1.3", resolved: "T2 escalation", note: "FDA context — T2 + compliance team required" },
  { id: "TKT-2024-09341", similarity: 0.44, version: "v7.4.2", resolved: "T2 + compliance", note: "Prior regulatory hold case — pattern similar" },
];

interface Props { state: SupportPipelineState; }

export default function AdvSupportS2Resolution({ state }: Props) {
  const agentStatus = state.agents.find(a => a.code === "SUP-002")?.status ?? "idle";
  const isIdle    = agentStatus === "idle";
  const isRunning = agentStatus === "running";
  const isDone    = agentStatus === "complete";
  const kb_confidence = state.metrics.kb_confidence;
  const sc = state.scenario;

  const confidencePct = isDone ? Math.round(kb_confidence * 100) : 0;
  const gateResult = isDone ? (kb_confidence >= 0.65 ? "passed" : "failed") : "pending";

  const kbResults  = sc === "B" ? KB_RESULTS_B : sc === "C" ? KB_RESULTS_C : KB_RESULTS_A;
  const histResult = sc === "B" ? HIST_B       : sc === "C" ? HIST_C       : HIST_A;

  const bannerLabel = sc === "B"
    ? "KB RESOLUTION ATTEMPT — InfinityQS v9.3 Alarm SMTP"
    : sc === "C"
    ? "KB RESOLUTION ATTEMPT — ParityFactory FDA 21 CFR Part 11"
    : "KB RESOLUTION ATTEMPT — InfinityQS v9.3 / IQS-SQL-TMO-7891";

  const corpusLabel = sc === "C"
    ? "Searching Advantive Product KB + 18,400 historical T1 tickets for ParityFactory / FDA 21 CFR"
    : "Searching Advantive Product KB (8+ product lines) + 18,400 historical T1 tickets";

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Status banner — always visible */}
      <div
        className="rounded-lg border px-4 py-3 flex items-start gap-3"
        style={{ background: `${ACCENT}10`, borderColor: `${ACCENT}35` }}
        data-testid="kb-status-banner"
      >
        <Search className="w-5 h-5 shrink-0 mt-0.5" style={{ color: ACCENT }} />
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold" style={{ color: ACCENT }}>{bannerLabel}</span>
            {isRunning && <Badge variant="outline" className="text-[10px] border-amber-400/50 text-amber-400">SUP-002 Searching</Badge>}
            {isDone && gateResult === "passed" && <Badge variant="outline" className="text-[10px] border-emerald-500/50 text-emerald-400">Confidence Gate Passed → T1 Resolved</Badge>}
            {isDone && gateResult === "failed" && <Badge variant="outline" className="text-[10px] border-rose-500/50 text-rose-400">Confidence Gate Failed → Diagnostic</Badge>}
          </div>
          <p className="text-xs text-muted-foreground mt-1">{corpusLabel}</p>
        </div>
      </div>

      {/* Idle placeholder — gate all KB intel until SUP-002 starts */}
      {isIdle ? (
        <div className="flex flex-col items-center justify-center gap-3 py-12 text-center" data-testid="kb-idle-placeholder">
          <Cpu className="w-8 h-8" style={{ color: `${ACCENT}40` }} />
          <div className="text-sm text-muted-foreground/50 font-medium">SUP-002 standing by</div>
          <div className="text-xs text-muted-foreground/30">Waiting for SUP-001 triage to complete before KB search begins</div>
        </div>
      ) : (
        <>
          {/* T1 Autonomous Resolution success — Scenario B only */}
          {sc === "B" && isDone && gateResult === "passed" && (
            <div
              className="rounded-lg border px-5 py-4 flex items-start gap-4"
              style={{ background: "#052e1610", borderColor: "#22c55e40" }}
              data-testid="t1-resolved-panel"
            >
              <CheckCircle2 className="w-6 h-6 shrink-0 mt-0.5 text-emerald-400" />
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <span className="text-sm font-semibold text-emerald-400">T1 AUTONOMOUS RESOLUTION</span>
                  <Badge variant="outline" className="text-[10px] border-emerald-500/50 text-emerald-400">KB Confidence 0.89 ✓</Badge>
                  <Badge variant="outline" className="text-[10px] border-emerald-500/40 text-emerald-300">Answer Delivered</Badge>
                </div>
                <div className="text-xs text-muted-foreground leading-relaxed">
                  SUP-002 resolved this ticket autonomously — no T2 escalation needed. Resolution delivered to David Park.
                </div>
                <div className="mt-3 rounded bg-emerald-950/30 border border-emerald-500/20 px-4 py-3">
                  <div className="text-[10px] font-semibold text-emerald-400 mb-1.5">Resolution Delivered to Customer:</div>
                  <div className="text-[11px] text-muted-foreground">
                    InfinityQS v9.3 does not migrate SMTP credentials from v9.2 — they are stored in a new encrypted credential vault.
                    Navigate to <span className="font-mono text-emerald-300">Admin → Alarm Settings → Email Server Configuration</span>,
                    re-enter your SMTP host, port, username, and password, then click <span className="font-mono text-emerald-300">Test Email</span>.
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground/70">
                    <span>Sources: IQS-KB-9302-ALM · IQS-RN-930 · TKT-2026-00108</span>
                    <span className="ml-auto text-emerald-400">Est. fix time: 5 min</span>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {[
                    { label: "KB Confidence",   value: "0.89",        color: "text-emerald-400" },
                    { label: "Sources Cited",   value: "4 docs",      color: "text-emerald-300" },
                    { label: "Pipeline",        value: "SUP-001+002", color: "text-muted-foreground" },
                  ].map(m => (
                    <div key={m.label} className="rounded bg-muted/20 px-2 py-1.5 text-center">
                      <div className={`text-xs font-bold font-mono ${m.color}`}>{m.value}</div>
                      <div className="text-[9px] text-muted-foreground/60">{m.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* KB Search Results */}
            <div className="rounded-lg border border-border/40 bg-card/50 p-4">
              <div className="flex items-center gap-2 mb-3">
                <BookOpen className="w-4 h-4" style={{ color: ACCENT }} />
                <span className="text-sm font-semibold">Product Documentation Search</span>
                <Badge variant="outline" className="ml-auto text-[9px] text-muted-foreground border-border/50">{kbResults.length} results</Badge>
              </div>
              <div className="flex flex-col gap-2">
                {kbResults.map(r => (
                  <div key={r.id} className="flex items-start gap-2 py-1.5 border-b border-border/20 last:border-0" data-testid={`kb-result-${r.id}`}>
                    <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: r.relevance >= 0.70 ? ACCENT : r.relevance >= 0.55 ? "#f59e0b" : "#64748b" }} />
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
                {histResult.map(r => (
                  <div key={r.id} className="flex flex-col gap-1 py-2 border-b border-border/20 last:border-0" data-testid={`hist-result-${r.id}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-mono font-medium">{r.id}</span>
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className={`text-[9px] ${r.resolved.includes("T2") || r.resolved.includes("compliance") ? "border-rose-500/40 text-rose-400" : "border-emerald-500/40 text-emerald-400"}`}>
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
                {isDone && sc === "A" && (
                  <div className="rounded bg-rose-950/30 border border-rose-500/20 px-3 py-2 mt-1">
                    <span className="text-[10px] text-rose-400">⚠ Only 1 prior v9.3 case with IQS-SQL-TMO-7891 exists — escalated to T2. KB coverage insufficient.</span>
                  </div>
                )}
                {isDone && sc === "C" && (
                  <div className="rounded bg-rose-950/30 border border-rose-500/20 px-3 py-2 mt-1">
                    <span className="text-[10px] text-rose-400">⚠ Both prior FDA sync failure cases required T2 + compliance team. Regulatory protocol mandates T2 regardless of KB score.</span>
                  </div>
                )}
                {isDone && sc === "B" && (
                  <div className="rounded bg-emerald-950/20 border border-emerald-500/20 px-3 py-2 mt-1">
                    <span className="text-[10px] text-emerald-400">✔ TKT-2026-00108 confirms identical v9.3 fix resolved in 12 minutes — high confidence.</span>
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
                : isDone && gateResult === "passed"
                ? <CheckCircle className="w-4 h-4 text-emerald-400" />
                : <AlertCircle className="w-4 h-4 text-muted-foreground" />
              }
              <span className="text-sm font-semibold">Confidence Gate Assessment</span>
              {isDone && (
                <Badge
                  variant="outline"
                  className={`ml-auto text-[10px] ${gateResult === "passed" ? "border-emerald-500/50 text-emerald-400" : "border-rose-500/50 text-rose-400"}`}
                >
                  {gateResult === "passed" ? "GATE PASSED — T1 Autonomous Resolution" : "GATE FAILED — Route to Diagnostic"}
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
              <span className="text-lg font-bold font-mono" style={{ color: isDone ? (confidencePct >= 65 ? "#22c55e" : "#ef4444") : "#64748b" }}>
                {isDone ? `${confidencePct}%` : "--"}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                { label: ">80%",  desc: "Autonomous resolve", active: confidencePct > 80, color: "text-emerald-400" },
                { label: "65–80%", desc: "Additional pass",   active: confidencePct >= 65 && confidencePct <= 80, color: "text-amber-400" },
                { label: "<65%",  desc: "→ Diagnostic",       active: isDone && confidencePct < 65, color: "text-rose-400" },
              ].map(t => (
                <div
                  key={t.label}
                  className={`rounded border p-2 transition-all ${t.active ? "border-current bg-current/10" : "border-border/20 opacity-40"}`}
                >
                  <div className={`text-xs font-bold font-mono ${t.color}`}>{t.label}</div>
                  <div className="text-[10px] text-muted-foreground">{t.desc}</div>
                </div>
              ))}
            </div>

            {isDone && (
              <div className="mt-3 pt-3 border-t border-border/20 text-[11px] text-muted-foreground">
                {sc === "B" ? (
                  <>Final confidence: <span className="text-emerald-400 font-medium">0.89</span> (above 0.65 threshold). 4 corroborating sources. KB article IQS-KB-9302-ALM directly documents the v9.3 SMTP credential migration break. <span className="text-emerald-400 font-medium">T1 autonomous resolution delivered.</span></>
                ) : sc === "C" ? (
                  <>Final confidence: <span className="text-rose-400 font-medium">0.52</span> (below 0.65 minimum). Additionally, FDA 21 CFR Part 11 regulatory protocol mandates T2 engagement regardless of KB confidence in active validation windows. Routing to <span style={{ color: ACCENT }} className="font-medium">SUP-003 Diagnostic Reasoning Agent</span>.</>
                ) : (
                  <>Final confidence: <span className="text-rose-400 font-medium">0.58</span> (below 0.65 minimum). Additional search pass reached <span className="font-medium">0.61</span> — still below threshold. Routing to <span style={{ color: ACCENT }} className="font-medium">SUP-003 Diagnostic Reasoning Agent</span>.</>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
