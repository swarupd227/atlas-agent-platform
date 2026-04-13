import { useState, useEffect } from "react";
import { CheckCircle2, MessageSquare, Clock, User, AlertTriangle, FileText, ChevronDown, ChevronUp, Shield } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { FITCH_RW_COLOR, TARGET_ISSUER, TARGET_RATING, TARGET_ACTION } from "./fitch-rw-constants";

// SLA countdown — 4h from a fixed anchor so it ticks down live
const SLA_ANCHOR = Date.now() + 4 * 60 * 60 * 1000 + 23 * 60 * 1000; // 4h 23m from now

function useSLACountdown(deadlineMs: number) {
  const [remaining, setRemaining] = useState(deadlineMs - Date.now());
  useEffect(() => {
    const iv = setInterval(() => setRemaining(deadlineMs - Date.now()), 1000);
    return () => clearInterval(iv);
  }, [deadlineMs]);
  if (remaining <= 0) return "OVERDUE";
  const h = Math.floor(remaining / 3600000);
  const m = Math.floor((remaining % 3600000) / 60000);
  const s = Math.floor((remaining % 60000) / 1000);
  return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
}

const MEMO_PREVIEW = `RATING ACTION MEMORANDUM — COMMITTEE SUBMISSION

Issuer:       Boeing Company (BA)
CUSIP:        097023105
Sector:       Aerospace & Defense
Action:       Rating Watch Negative (RWN) Placement
Current IDR:  BBB-  (Investment Grade, Lowest Tier)

══════════════════════════════════════════════════════
EXECUTIVE SUMMARY
══════════════════════════════════════════════════════

Fitch Ratings places Boeing Co.'s (BA) Long-Term Issuer
Default Rating (IDR) of 'BBB-' on Rating Watch Negative
(RWN) following a 42-basis-point widening in 5-year CDS
spreads to 187 bps over the past seven trading days,
accompanied by an 18.4% equity drawdown and materially
negative news sentiment (score: -0.61).

The RWN designation signals elevated probability of a
one-notch downgrade to 'BB+' (sub-investment grade)
within a 6-month review horizon.

KEY RATING DRIVERS:
  • CDS spread 2.9× peer median (64 bps)
  • Free cash flow negative for trailing 4 quarters
  • 737 MAX production ramp delayed; unit cost pressure
  • Net debt / EBITDA above 6× vs BBB- threshold of 4×
  • News sentiment at -0.61 (3-month low)

PEER COMPARISON:
  Issuer          Rating   CDS    FCF Yield
  RTX Corp        BBB+      64bps  +3.2%
  Lockheed Martin A-        41bps  +4.8%
  Boeing Co.      BBB-     187bps  -1.7%  ← FLAGGED

METHODOLOGY: Corporate Rating Criteria, March 2024
             Aerospace & Defense Sector Addendum

RECOMMENDATION: Place on Rating Watch Negative.
                Initiate 6-month review process.`.trim();

interface ApprovalItem {
  id: string;
  issuer: string;
  action: string;
  rating: string;
  analyst: string;
  submittedAt: string;
  priority: "high" | "normal";
  memoPreview: string;
  status: "pending" | "approved" | "changes_requested";
  riskScore: number;
  riskLabel: string;
  slaDeadlineMs: number;
}

const QUEUE: ApprovalItem[] = [
  {
    id: "MEMO-2024-BA-001",
    issuer: TARGET_ISSUER,
    action: TARGET_ACTION,
    rating: TARGET_RATING,
    analyst: "ATLAS Agent 004",
    submittedAt: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
    priority: "high",
    memoPreview: MEMO_PREVIEW,
    status: "pending",
    riskScore: 78,
    riskLabel: "High",
    slaDeadlineMs: SLA_ANCHOR,
  },
];

const RECENT_COMPLETED = [
  { id: "MEMO-2024-GE-001",  issuer: "GE Aerospace",        action: "Outlook Stable → Negative", rating: "BBB",  resolvedBy: "J. Harrison", resolvedAt: "3h ago", outcome: "approved",  riskScore: 54, riskLabel: "Medium" },
  { id: "MEMO-2024-HON-002", issuer: "Honeywell Int'l",     action: "Affirmation — A Stable",    rating: "A",    resolvedBy: "M. Chen",    resolvedAt: "1d ago", outcome: "approved",  riskScore: 21, riskLabel: "Low"    },
  { id: "MEMO-2024-LMT-001", issuer: "Lockheed Martin",     action: "Upgrade Watch — A to A+",   rating: "A-",   resolvedBy: "S. Patel",   resolvedAt: "2d ago", outcome: "changes",   riskScore: 18, riskLabel: "Low"    },
];

function riskScoreStyle(label: string) {
  if (label === "High")   return { bg: "bg-red-500/10 border-red-500/20",    text: "text-red-400"    };
  if (label === "Medium") return { bg: "bg-amber-500/10 border-amber-500/20", text: "text-amber-400"  };
  return                         { bg: "bg-green-500/10 border-green-500/20", text: "text-green-400"  };
}

function RiskScoreBadge({ score, label }: { score: number; label: string }) {
  const style = riskScoreStyle(label);
  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border ${style.bg}`}>
      <Shield className={`w-3.5 h-3.5 ${style.text}`} />
      <div>
        <p className={`text-sm font-bold leading-none ${style.text}`}>{score}<span className="text-[10px] font-normal text-muted-foreground">/100</span></p>
        <p className={`text-[9px] font-medium uppercase tracking-wider ${style.text}`}>{label} Risk</p>
      </div>
    </div>
  );
}

function SLABadge({ deadlineMs, status }: { deadlineMs: number; status: string }) {
  const countdown = useSLACountdown(deadlineMs);
  const isOverdue = countdown === "OVERDUE";
  if (status !== "pending") return null;
  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border ${isOverdue ? "bg-red-500/10 border-red-500/20" : "bg-amber-500/10 border-amber-500/20"}`}>
      <Clock className={`w-3.5 h-3.5 ${isOverdue ? "text-red-400" : "text-amber-400"}`} />
      <div>
        <p className={`text-sm font-bold leading-none font-mono tabular-nums ${isOverdue ? "text-red-400" : "text-amber-400"}`}>{countdown}</p>
        <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">SLA Remaining</p>
      </div>
    </div>
  );
}

export default function FitchRWS4Approvals({ hasRun }: { hasRun: boolean }) {
  const { toast } = useToast();
  const [items, setItems] = useState(QUEUE);
  const [expanded, setExpanded] = useState<string | null>("MEMO-2024-BA-001");

  const handleApprove = (id: string, issuer: string, rating: string) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, status: "approved" as const } : i));
    toast({ title: "Rating Action Approved", description: `${issuer} ${rating} → ${TARGET_ACTION} approved for committee publication.`, duration: 4000 });
  };

  const handleRequestChanges = (id: string) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, status: "changes_requested" as const } : i));
    toast({ title: "Changes Requested", description: "Memo returned to analyst with review notes.", duration: 3000 });
  };

  const displayItems = hasRun ? items : QUEUE;
  const pendingItems  = displayItems.filter(i => i.status === "pending");
  const resolvedItems = hasRun ? items.filter(i => i.status !== "pending") : [];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-sm font-semibold">Rating Action Approval Queue</h2>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Expert validator review gate · ATLAS-generated memos pending analyst sign-off
        </p>
      </div>

      {/* Pending queue */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Pending Review ({pendingItems.length})
          </span>
          {!hasRun && (
            <span className="text-[10px] text-muted-foreground italic">Run the pipeline to generate a live memo</span>
          )}
        </div>

        {pendingItems.length === 0 && resolvedItems.length === 0 && !hasRun && (
          <div className="rounded-xl border border-dashed border-border/60 p-8 text-center">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center mx-auto mb-3" style={{ backgroundColor: `${FITCH_RW_COLOR}18` }}>
              <FileText className="w-5 h-5" style={{ color: FITCH_RW_COLOR }} />
            </div>
            <p className="text-sm font-medium">No memos pending</p>
            <p className="text-xs text-muted-foreground mt-1">
              Run the live pipeline to generate a Rating Watch memo for committee review.
            </p>
          </div>
        )}

        {pendingItems.map(item => (
          <div key={item.id} className="rounded-xl border bg-card overflow-hidden" data-testid={`approval-card-${item.id}`}>
            <div className="px-4 py-3 border-b border-border/40">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-[9px] font-mono text-muted-foreground">{item.id}</span>
                    {item.priority === "high" && (
                      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">
                        <AlertTriangle className="w-2.5 h-2.5" />High Priority
                      </span>
                    )}
                    <Badge className="text-[10px]" style={{ backgroundColor: `${FITCH_RW_COLOR}18`, color: FITCH_RW_COLOR, borderColor: `${FITCH_RW_COLOR}30` }}>
                      Pending Review
                    </Badge>
                  </div>
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <p className="text-sm font-semibold">{item.issuer}</p>
                    <span className="text-[11px] font-mono text-muted-foreground">{item.rating}</span>
                    <span className="text-[11px] text-amber-400">→ {item.action}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1"><User className="w-3 h-3" />{item.analyst}</span>
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" />Submitted {new Date(item.submittedAt).toLocaleTimeString()}</span>
                  </div>
                </div>

                {/* Risk score + SLA countdown side by side */}
                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                  <RiskScoreBadge score={item.riskScore} label={item.riskLabel} />
                  <SLABadge deadlineMs={item.slaDeadlineMs} status={item.status} />
                </div>
              </div>

              <button
                onClick={() => setExpanded(expanded === item.id ? null : item.id)}
                className="mt-2 text-[10px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                data-testid={`btn-expand-memo-${item.id}`}
              >
                {expanded === item.id ? <><ChevronUp className="w-3.5 h-3.5" />Collapse memo</> : <><ChevronDown className="w-3.5 h-3.5" />Read full memo</>}
              </button>
            </div>

            {expanded === item.id && (
              <div className="px-4 py-3 border-b border-border/30">
                <pre className="text-[10px] font-mono leading-relaxed text-muted-foreground whitespace-pre-wrap bg-muted/20 rounded-lg p-3 max-h-64 overflow-y-auto" data-testid="memo-text-preview">
                  {item.memoPreview}
                </pre>
              </div>
            )}

            <div className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <MessageSquare className="w-3 h-3" />
                <span>4 methodology checks passed · Peer comp included · Disclosure draft ready</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => handleRequestChanges(item.id)}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-medium border border-border/60 bg-muted/20 text-muted-foreground hover:text-foreground hover:border-border transition-all"
                  data-testid={`btn-request-changes-${item.id}`}
                >
                  Request Changes
                </button>
                <button
                  onClick={() => handleApprove(item.id, item.issuer, item.rating)}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-medium text-white transition-all hover:opacity-90 active:scale-95"
                  style={{ backgroundColor: FITCH_RW_COLOR }}
                  data-testid={`btn-approve-${item.id}`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5 inline mr-1" />
                  Approve & Publish
                </button>
              </div>
            </div>
          </div>
        ))}

        {resolvedItems.map(item => (
          <div key={item.id} className="rounded-xl border bg-card/50 px-4 py-3 flex items-center justify-between gap-3 opacity-70" data-testid={`approval-resolved-${item.id}`}>
            <div>
              <p className="text-[11px] font-semibold">{item.issuer} · {item.rating}</p>
              <p className="text-[10px] text-muted-foreground">{item.action}</p>
            </div>
            {item.status === "approved"
              ? <span className="text-[10px] px-2 py-1 rounded-full bg-green-500/10 text-green-400 border border-green-500/20 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />Approved</span>
              : <span className="text-[10px] px-2 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">Changes Requested</span>
            }
          </div>
        ))}
      </div>

      {/* Recently resolved */}
      <div className="space-y-2">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Recently Resolved</span>
        {RECENT_COMPLETED.map(item => {
          const style = riskScoreStyle(item.riskLabel);
          return (
            <div key={item.id} className="rounded-lg border bg-card/40 px-4 py-2.5 flex items-center justify-between gap-3" data-testid={`approval-recent-${item.id}`}>
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-[9px] font-mono text-muted-foreground/60 shrink-0">{item.id}</span>
                <div className="min-w-0">
                  <p className="text-[11px] font-medium truncate">{item.issuer}</p>
                  <p className="text-[10px] text-muted-foreground">{item.action}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className={`text-[10px] px-1.5 py-0.5 rounded border ${style.bg} ${style.text}`}>
                  {item.riskScore} · {item.riskLabel}
                </span>
                <span className="text-[10px] text-muted-foreground">{item.resolvedBy} · {item.resolvedAt}</span>
                {item.outcome === "approved"
                  ? <span className="px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 text-[10px]">Approved</span>
                  : <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 text-[10px]">Revised</span>
                }
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
