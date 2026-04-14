import { useState } from "react";
import { CheckCircle2, AlertCircle, AlertTriangle, Clock, Zap, Users, ChevronDown, ChevronRight, ThumbsUp, ArrowUp, PauseCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  BLOCKING_ISSUES, VALIDATION_CHECKS, ORDER_CONTEXT, OTC_ORDER_PIPELINE_STEPS,
  type OrderPipelineState,
} from "./otc-order-constants";

interface Props {
  pipelineState: OrderPipelineState;
  onRunAndNavigate: () => void;
}

const SEV_COLOR: Record<string, string> = {
  HIGH:   "text-red-400",
  MEDIUM: "text-amber-400",
  LOW:    "text-yellow-400",
};

const SEV_BG: Record<string, string> = {
  HIGH:   "bg-red-500/8 border-red-500/20",
  MEDIUM: "bg-amber-500/8 border-amber-500/20",
  LOW:    "bg-yellow-500/8 border-yellow-500/20",
};

const CHECKLIST_META: Record<string, { agentCode?: string; resolveTime?: string }> = {
  "VAL-002": { agentCode: "OTC-AGT-003", resolveTime: "~1m12s" },
  "VAL-003": { agentCode: "OTC-AGT-004", resolveTime: "~38s"   },
  "VAL-004": { agentCode: "OTC-AGT-002", resolveTime: "~51s"   },
};

const ISSUE_ACTIONS: Record<string, Array<{ label: string; variant: "approve" | "escalate" | "hold" }>> = {
  "VAL-002": [
    { label: "Approve $950K Temp Limit",  variant: "approve"  },
    { label: "Escalate to Manager",        variant: "escalate" },
    { label: "Hold Order",                 variant: "hold"     },
  ],
  "VAL-003": [
    { label: "Confirm Chicago-Only",       variant: "approve"  },
    { label: "Approve Split-Ship",         variant: "escalate" },
    { label: "Re-evaluate",                variant: "hold"     },
  ],
  "VAL-004": [
    { label: "Confirm Corrected Address",  variant: "approve"  },
    { label: "Keep Original",              variant: "escalate" },
    { label: "Manual Review",              variant: "hold"     },
  ],
};

function CheckStatusIcon({ status }: { status: "PASS" | "HOLD" | "WARN" | "CLEARED" }) {
  if (status === "PASS" || status === "CLEARED")
    return <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />;
  if (status === "HOLD")
    return <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />;
  return <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
}

function ActionVariantIcon({ variant }: { variant: "approve" | "escalate" | "hold" }) {
  if (variant === "approve")  return <ThumbsUp className="w-2.5 h-2.5" />;
  if (variant === "escalate") return <ArrowUp   className="w-2.5 h-2.5" />;
  return <PauseCircle className="w-2.5 h-2.5" />;
}

function actionButtonClass(variant: "approve" | "escalate" | "hold", isResolved: boolean): string {
  if (isResolved && variant === "approve")
    return "flex items-center gap-1 px-2 py-1 rounded-md text-[9px] font-semibold border bg-green-500/15 text-green-400 border-green-500/25 cursor-default";
  if (variant === "approve")
    return "flex items-center gap-1 px-2 py-1 rounded-md text-[9px] font-semibold border bg-green-500/8 text-green-400/70 border-green-500/20 hover:bg-green-500/15 cursor-pointer";
  if (variant === "escalate")
    return "flex items-center gap-1 px-2 py-1 rounded-md text-[9px] font-semibold border bg-amber-500/8 text-amber-400/70 border-amber-500/20 hover:bg-amber-500/15 cursor-pointer";
  return "flex items-center gap-1 px-2 py-1 rounded-md text-[9px] font-semibold border bg-red-500/8 text-red-400/70 border-red-500/20 hover:bg-red-500/15 cursor-pointer";
}

export default function OtcOrderS1Validation({ pipelineState, onRunAndNavigate }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { status, resolvedChecks, parallelAgentsRunning, elapsedSeconds, results } = pipelineState;
  const isRunning = status === "running";
  const isComplete = status === "complete";

  const getCheckStatus = (checkId: string): "PASS" | "HOLD" | "WARN" | "CLEARED" => {
    const base = VALIDATION_CHECKS.find(c => c.checkId === checkId)?.initialStatus ?? "PASS";
    if ((isRunning || isComplete) && resolvedChecks.includes(checkId)) return "CLEARED";
    if (isComplete && base !== "PASS") return "CLEARED";
    return base;
  };

  const parallelDone = results.some(r =>
    r.role === "credit_validation" || r.role === "inventory_validation" || r.role === "address_validation"
  );

  const passCount = VALIDATION_CHECKS.filter(c => {
    const s = getCheckStatus(c.checkId);
    return s === "PASS" || s === "CLEARED";
  }).length;

  const toggleExpand = (id: string) => setExpandedId(prev => prev === id ? null : id);

  return (
    <div className="flex h-full min-h-0">
      {/* ── Left 30% — checklist ──────────────────────────────────────────── */}
      <div className="w-[30%] min-w-[220px] border-r border-border/40 flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-border/30 shrink-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-semibold text-foreground">Validation Checklist</span>
            <span className={`text-[10px] font-mono font-bold ${passCount === 8 ? "text-green-400" : "text-muted-foreground"}`}>
              {passCount}/8
            </span>
          </div>
          <div className="w-full h-1 rounded-full bg-muted/30">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${(passCount / 8) * 100}%`,
                background: passCount === 8 ? "#22c55e" : "#FF6B35",
              }}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
          {VALIDATION_CHECKS.map(check => {
            const s = getCheckStatus(check.checkId);
            const isBlocking = check.initialStatus !== "PASS";
            const meta = CHECKLIST_META[check.checkId];
            return (
              <div
                key={check.checkId}
                data-testid={`check-item-${check.checkId}`}
                className={`flex items-start gap-2 px-2 py-2 rounded-lg border transition-all duration-500 ${
                  s === "CLEARED" ? "bg-green-500/5 border-green-500/15"
                  : s === "HOLD"  ? "bg-red-500/8 border-red-500/20"
                  : s === "WARN"  ? "bg-amber-500/8 border-amber-500/15"
                  : "bg-muted/10 border-border/20"
                }`}
              >
                <CheckStatusIcon status={s} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1 flex-wrap">
                    <span className="text-[10px] font-mono text-muted-foreground/60">{check.checkId}</span>
                    {isBlocking && s !== "CLEARED" && (
                      <span className="text-[8px] px-1 rounded bg-red-500/15 text-red-400">HOLD</span>
                    )}
                    {s === "CLEARED" && (
                      <span className="text-[8px] px-1 rounded bg-green-500/15 text-green-400">CLEARED</span>
                    )}
                  </div>
                  <p className="text-[10px] text-foreground/80 leading-tight mt-0.5">{check.name}</p>
                  {/* Agent + timing attribution for blocking checks */}
                  {meta && (
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className={`text-[8px] font-mono font-semibold ${s === "CLEARED" ? "text-green-400/70" : "text-orange-400/70"}`}>
                        {meta.agentCode}
                      </span>
                      {s === "CLEARED" && meta.resolveTime && (
                        <span className="text-[8px] text-muted-foreground/50">{meta.resolveTime}</span>
                      )}
                    </div>
                  )}
                  {isRunning && isBlocking && s !== "CLEARED" && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
                      <span className="text-[9px] text-orange-400/80">Agent resolving…</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Elapsed + step indicator */}
        {(isRunning || isComplete) && (
          <div className="px-3 py-2 border-t border-border/30 shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3 text-muted-foreground/60" />
                <span className="text-[10px] font-mono text-muted-foreground">{elapsedSeconds}s</span>
              </div>
              {isComplete && (
                <span className="text-[9px] text-green-400 font-semibold">All clear ✓</span>
              )}
              {isRunning && (
                <span className="text-[9px] text-orange-400 animate-pulse">Running…</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Right 70% — resolution panels ────────────────────────────────── */}
      <div className="flex-1 min-w-0 overflow-y-auto px-5 py-4">

        {/* Order header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold text-foreground">{ORDER_CONTEXT.orderId}</span>
              <Badge className="text-[9px] px-1.5 py-0" style={{ background: "rgba(255,107,53,0.15)", color: "#FF6B35", borderColor: "rgba(255,107,53,0.3)" }}>
                RUSH
              </Badge>
              <span className="text-[10px] text-muted-foreground">{ORDER_CONTEXT.valueLabel}</span>
            </div>
            <p className="text-[10px] text-muted-foreground">{ORDER_CONTEXT.customer} · PO {ORDER_CONTEXT.poNumber} · Requested ship {ORDER_CONTEXT.requestedShipDate}</p>
          </div>
          {!isRunning && !isComplete && (
            <button
              data-testid="button-run-validation"
              onClick={onRunAndNavigate}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-white"
              style={{ background: "#FF6B35" }}
            >
              <Zap className="w-3 h-3" />
              Run Validation
            </button>
          )}
        </div>

        {/* Parallel agent status bar */}
        {(isRunning || isComplete) && (
          <div className="mb-4 px-3 py-2 rounded-lg border border-border/30 bg-muted/10">
            <div className="flex items-center gap-2 mb-2">
              <Users className="w-3.5 h-3.5 text-orange-400" />
              <span className="text-[11px] font-semibold">
                {parallelAgentsRunning.length > 0 ? "Parallel Validation — 3 agents running concurrently" : parallelDone ? "Parallel Validation Complete" : "Parallel Validation"}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {OTC_ORDER_PIPELINE_STEPS[0].agents.map((code) => {
                const agentDone = results.some(r =>
                  (code === "OTC-AGT-003" && r.role === "credit_validation") ||
                  (code === "OTC-AGT-004" && r.role === "inventory_validation") ||
                  (code === "OTC-AGT-002" && r.role === "address_validation")
                );
                const agentRunning = parallelAgentsRunning.includes(code);
                return (
                  <div
                    key={code}
                    data-testid={`parallel-agent-${code}`}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded-md border text-[10px] transition-all ${
                      agentDone    ? "border-green-500/25 bg-green-500/5"
                      : agentRunning ? "border-orange-500/30 bg-orange-500/5 animate-pulse"
                      : "border-border/20 bg-muted/10"
                    }`}
                  >
                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${agentDone ? "bg-green-400" : agentRunning ? "bg-orange-400" : "bg-muted-foreground/30"}`} />
                    <span className={agentDone ? "text-green-400" : agentRunning ? "text-orange-400" : "text-muted-foreground/60"}>{code}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Three blocking issue panels (expandable) */}
        <div className="grid grid-cols-1 gap-3">
          {BLOCKING_ISSUES.map(issue => {
            const resolved = (isRunning || isComplete) && resolvedChecks.includes(issue.checkId);
            const agentRunning = isRunning && parallelAgentsRunning.length > 0 && !resolved;
            const isExpanded = expandedId === issue.id;
            const actions = ISSUE_ACTIONS[issue.checkId] ?? [];

            return (
              <div
                key={issue.id}
                data-testid={`issue-panel-${issue.checkId}`}
                className={`rounded-lg border transition-all duration-500 ${
                  resolved ? "border-green-500/20 bg-green-500/5"
                  : agentRunning ? `${issue.borderColor} ${issue.bgColor}`
                  : "border-border/30 bg-muted/10"
                }`}
              >
                {/* Panel header (always visible) — click to expand */}
                <button
                  data-testid={`issue-expand-${issue.checkId}`}
                  onClick={() => toggleExpand(issue.id)}
                  className="w-full flex items-start justify-between gap-3 p-3 text-left"
                >
                  <div className="flex items-center gap-2">
                    {resolved
                      ? <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                      : <AlertCircle className={`w-4 h-4 shrink-0 ${SEV_COLOR[issue.severity]}`} />
                    }
                    <div>
                      <span className="text-[11px] font-semibold text-foreground">{issue.title}</span>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[9px] font-mono text-muted-foreground/60">{issue.checkId}</span>
                        <span className={`text-[9px] px-1 rounded ${SEV_BG[issue.severity]} ${SEV_COLOR[issue.severity]}`}>{issue.severity}</span>
                        <span className="text-[9px] font-mono font-semibold text-orange-400/80">{issue.agent}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {resolved && (
                      <Badge className="text-[9px] bg-green-500/15 text-green-400 border-green-500/20">
                        Resolved ✓
                      </Badge>
                    )}
                    {agentRunning && (
                      <Badge className="text-[9px] animate-pulse" style={{ background: "rgba(255,107,53,0.12)", color: "#FF6B35", borderColor: "rgba(255,107,53,0.25)" }}>
                        Agent running…
                      </Badge>
                    )}
                    {isExpanded
                      ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/40" />
                      : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40" />
                    }
                  </div>
                </button>

                {/* Expandable detail + actions */}
                {isExpanded && (
                  <div className="px-3 pb-3 border-t border-border/20 pt-2.5 space-y-2">
                    <p className="text-[10px] text-muted-foreground leading-relaxed">{issue.detail}</p>

                    {resolved ? (
                      <div className="px-2 py-1.5 rounded-md bg-green-500/8 border border-green-500/15">
                        <p className="text-[10px] text-green-300/90 leading-relaxed">{issue.resolution}</p>
                      </div>
                    ) : !isRunning && !isComplete ? (
                      <div className="px-2 py-1.5 rounded-md bg-muted/20 border border-border/20">
                        <p className="text-[10px] text-muted-foreground/60 italic">Awaiting parallel validation run…</p>
                      </div>
                    ) : null}

                    {/* Action buttons */}
                    {actions.length > 0 && (
                      <div className="pt-1">
                        <p className="text-[8px] text-muted-foreground/50 mb-1.5 font-semibold uppercase tracking-wide">
                          {resolved ? "Agent action taken" : "Available actions"}
                        </p>
                        <div className="flex items-center gap-2 flex-wrap">
                          {actions.map(act => (
                            <button
                              key={act.label}
                              data-testid={`action-${issue.checkId}-${act.variant}`}
                              className={actionButtonClass(act.variant, resolved)}
                              disabled={resolved && act.variant !== "approve"}
                            >
                              <ActionVariantIcon variant={act.variant} />
                              {act.label}
                              {resolved && act.variant === "approve" && " ✓"}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Step progress */}
        {(isRunning || isComplete) && (
          <div className="mt-4 grid grid-cols-3 gap-2">
            {OTC_ORDER_PIPELINE_STEPS.map((step, i) => {
              const done = isComplete || (i === 0 && parallelDone) ||
                (i === 1 && results.some(r => r.role === "resolution_synthesis")) ||
                (i === 2 && results.some(r => r.role === "order_release"));
              const active = isRunning && !done && (
                (i === 0 && parallelAgentsRunning.length > 0) ||
                (i === 1 && pipelineState.currentRole === "resolution_synthesis") ||
                (i === 2 && pipelineState.currentRole === "order_release")
              );
              return (
                <div
                  key={step.role}
                  data-testid={`pipeline-step-${i + 1}`}
                  className={`px-3 py-2 rounded-lg border text-[10px] transition-all ${
                    done   ? "border-green-500/20 bg-green-500/5"
                    : active ? `${step.borderColor} ${step.bgColor} animate-pulse`
                    : "border-border/20 bg-muted/10"
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className={`text-[9px] font-mono ${done ? "text-green-400" : active ? step.color : "text-muted-foreground/50"}`}>STEP {i + 1}</span>
                    {done && <CheckCircle2 className="w-2.5 h-2.5 text-green-400" />}
                  </div>
                  <p className={`font-medium leading-tight ${done ? "text-green-300/80" : active ? step.color : "text-muted-foreground/60"}`}>{step.label}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
