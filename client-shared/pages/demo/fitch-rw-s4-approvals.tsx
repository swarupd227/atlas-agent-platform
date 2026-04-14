import { useState, useEffect } from "react";
import {
  CheckCircle2, MessageSquare, Clock, User, AlertTriangle, FileText,
  Shield, TrendingDown, BarChart3, Activity, ChevronDown, ChevronUp,
  ArrowRight, CheckCheck, AlertCircle, Globe, Landmark,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { FITCH_RW_COLOR, TARGET_ISSUER, TARGET_RATING, TARGET_ACTION } from "./fitch-rw-constants";

const SLA_ANCHOR = Date.now() + 4 * 60 * 60 * 1000 + 23 * 60 * 1000;

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
  return `${h}h ${String(m).padStart(2,"0")}m ${String(s).padStart(2,"0")}s`;
}

const MEMO_TEXT = `RATING ACTION MEMORANDUM — COMMITTEE SUBMISSION

Issuer:       Boeing Company (BA)
CUSIP:        097023105
Sector:       Aerospace & Defense
Action:       Rating Watch Negative (RWN) Placement
Current IDR:  BBB-  (Investment Grade, Lowest Tier)

══════════════════════════════════════════════════
EXECUTIVE SUMMARY
══════════════════════════════════════════════════

Fitch Ratings places Boeing Co.'s (BA) Long-Term
Issuer Default Rating (IDR) of 'BBB-' on Rating Watch
Negative (RWN) following a 42-basis-point widening
in 5-year CDS spreads to 187 bps over the past seven
trading days, accompanied by an 18.4% equity drawdown
and materially negative news sentiment (score: -0.61).

The RWN designation signals elevated probability of a
one-notch downgrade to 'BB+' (sub-investment grade)
within a 6-month review horizon.

KEY RATING DRIVERS:
  • CDS spread 2.9× peer median (64 bps)
  • Free cash flow negative 4 trailing quarters
  • 737 MAX production ramp delayed; unit cost ↑
  • Net debt / EBITDA above 6× (threshold: 4×)
  • News sentiment at -0.61 (3-month low)

METHODOLOGY: Corporate Rating Criteria, March 2024
             Aerospace & Defense Sector Addendum

RECOMMENDATION: Place on Rating Watch Negative.
                Initiate 6-month review process.`.trim();

const SIGNALS = [
  { label: "5Y CDS Spread", value: "187 bps", delta: "+42 bps", status: "critical", note: "2.9× peer median (64 bps)" },
  { label: "Equity Drawdown", value: "−18.4%", delta: "7-day", status: "critical", note: "Implied vol 38.4%" },
  { label: "News Sentiment", value: "−0.61", delta: "3-mo low", status: "high", note: "32 articles · 50% negative" },
  { label: "Net Debt/EBITDA", value: "6.1×", delta: "vs 4× thr.", status: "high", note: "FCF negative 4Q trailing" },
];

const PEER_TABLE = [
  { issuer: "RTX Corp",        rating: "BBB+", cds: "64",   fcf: "+3.2%", flag: false },
  { issuer: "Lockheed Martin", rating: "A−",   cds: "41",   fcf: "+4.8%", flag: false },
  { issuer: "Boeing Co.",      rating: "BBB−", cds: "187",  fcf: "−1.7%", flag: true  },
  { issuer: "General Dynamics",rating: "A−",   cds: "38",   fcf: "+5.1%", flag: false },
];

const CHECKLIST = [
  { label: "Fitch Corporate Rating Criteria applied",   done: true  },
  { label: "Peer cohort comparison included",           done: true  },
  { label: "SEC 17g-7 disclosure draft generated",      done: true  },
  { label: "EU CRA-III Article 11 log filed",           done: true  },
  { label: "Analyst sign-off (committee quorum pending)",done: false },
];

const RECENT_COMPLETED = [
  { id: "MEMO-2024-GE-001",  issuer: "GE Aerospace",        action: "Outlook Stable → Negative", rating: "BBB",  resolvedBy: "J. Harrison", resolvedAt: "3h ago",  outcome: "approved", risk: 54, riskLabel: "Medium" },
  { id: "MEMO-2024-HON-002", issuer: "Honeywell Int'l",     action: "Affirmation — A Stable",    rating: "A",    resolvedBy: "M. Chen",    resolvedAt: "1d ago",  outcome: "approved", risk: 21, riskLabel: "Low"    },
  { id: "MEMO-2024-LMT-001", issuer: "Lockheed Martin",     action: "Upgrade Watch — A to A+",   rating: "A−",   resolvedBy: "S. Patel",   resolvedAt: "2d ago",  outcome: "changes",  risk: 18, riskLabel: "Low"    },
  { id: "MEMO-2024-NOC-001", issuer: "Northrop Grumman",    action: "Outlook Positive",          rating: "BBB+", resolvedBy: "R. Kim",     resolvedAt: "3d ago",  outcome: "approved", risk: 31, riskLabel: "Low"    },
  { id: "MEMO-2024-LHX-001", issuer: "L3Harris Technologies",action: "Affirmation — BBB Stable", rating: "BBB",  resolvedBy: "J. Harrison", resolvedAt: "4d ago", outcome: "approved", risk: 27, riskLabel: "Low"    },
  { id: "MEMO-2024-TDG-001", issuer: "TransDigm Group",     action: "Outlook Revised → Negative",rating: "BB+",  resolvedBy: "M. Chen",    resolvedAt: "5d ago",  outcome: "changes",  risk: 67, riskLabel: "High"   },
];

function signalColor(status: string) {
  if (status === "critical") return { bg: "bg-red-500/10 border-red-500/20", text: "text-red-400", dot: "bg-red-500" };
  if (status === "high")     return { bg: "bg-amber-500/10 border-amber-500/20", text: "text-amber-400", dot: "bg-amber-500" };
  return { bg: "bg-muted/40 border-border/40", text: "text-muted-foreground", dot: "bg-muted-foreground/40" };
}

function riskStyle(label: string) {
  if (label === "High")   return { bg: "bg-red-500/10 border-red-500/20",    text: "text-red-400"    };
  if (label === "Medium") return { bg: "bg-amber-500/10 border-amber-500/20", text: "text-amber-400"  };
  return                         { bg: "bg-green-500/10 border-green-500/20", text: "text-green-400"  };
}

interface ApprovalItem {
  id: string; issuer: string; action: string; rating: string;
  analyst: string; submittedAt: string; priority: "high" | "normal";
  status: "pending" | "approved" | "changes_requested";
  riskScore: number; riskLabel: string; slaDeadlineMs: number;
}

const QUEUE: ApprovalItem[] = [{
  id: "MEMO-2024-BA-001", issuer: TARGET_ISSUER, action: TARGET_ACTION,
  rating: TARGET_RATING, analyst: "ATLAS Agent 004",
  submittedAt: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
  priority: "high", status: "pending", riskScore: 78, riskLabel: "High",
  slaDeadlineMs: SLA_ANCHOR,
}];

export default function FitchRWS4Approvals({ hasRun }: { hasRun: boolean }) {
  const { toast } = useToast();
  const [items, setItems] = useState(QUEUE);
  const countdown = useSLACountdown(SLA_ANCHOR);

  const handleApprove = (id: string) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, status: "approved" as const } : i));
    toast({ title: "Rating Action Approved", description: `Boeing Co. BBB− → Rating Watch Negative approved for committee publication.`, duration: 4000 });
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
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold">Rating Action Approval Queue</h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Expert validator review gate · ATLAS-generated memos pending analyst sign-off
          </p>
        </div>
        {pendingItems.length > 0 && (
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border bg-amber-500/10 border-amber-500/20">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <div>
              <p className="text-sm font-bold leading-none font-mono tabular-nums text-amber-400">{countdown}</p>
              <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground">SLA Remaining</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Empty state ── */}
      {pendingItems.length === 0 && resolvedItems.length === 0 && !hasRun && (
        <div className="rounded-xl border border-dashed border-border/60 p-8 text-center">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center mx-auto mb-3" style={{ backgroundColor: `${FITCH_RW_COLOR}18` }}>
            <FileText className="w-5 h-5" style={{ color: FITCH_RW_COLOR }} />
          </div>
          <p className="text-sm font-medium">No memos pending</p>
          <p className="text-xs text-muted-foreground mt-1">Run the live pipeline to generate a Rating Watch memo for committee review.</p>
        </div>
      )}

      {/* ── Pending memos ── */}
      {pendingItems.map(item => (
        <div key={item.id} className="rounded-xl border bg-card overflow-hidden" data-testid={`approval-card-${item.id}`}>

          {/* Card header */}
          <div className="px-4 py-3 border-b border-border/40 flex items-start justify-between gap-3 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="text-[9px] font-mono text-muted-foreground">{item.id}</span>
                <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">
                  <AlertTriangle className="w-2.5 h-2.5" />High Priority
                </span>
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
            <div className="flex items-center gap-2 shrink-0">
              <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border bg-red-500/10 border-red-500/20`}>
                <Shield className="w-3.5 h-3.5 text-red-400" />
                <div>
                  <p className="text-sm font-bold leading-none text-red-400">{item.riskScore}<span className="text-[10px] font-normal text-muted-foreground">/100</span></p>
                  <p className="text-[9px] font-medium uppercase tracking-wider text-red-400">High Risk</p>
                </div>
              </div>
            </div>
          </div>

          {/* ── SPLIT BODY: memo left + panels right ── */}
          <div className="grid grid-cols-2 divide-x border-b border-border/30">

            {/* Left: Memo text */}
            <div className="p-4 flex flex-col gap-2">
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                <FileText className="w-3 h-3" />Memo Preview
              </div>
              <pre className="text-[10px] font-mono leading-relaxed text-muted-foreground whitespace-pre-wrap bg-muted/20 rounded-lg p-3 flex-1 overflow-y-auto max-h-72" data-testid="memo-text-preview">
                {MEMO_TEXT}
              </pre>
            </div>

            {/* Right: structured signal panels */}
            <div className="p-4 flex flex-col gap-3">

              {/* Market signals */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                  <Activity className="w-3 h-3" />Market Signals
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {SIGNALS.map(s => {
                    const c = signalColor(s.status);
                    return (
                      <div key={s.label} className={`rounded-lg border p-2.5 ${c.bg}`}>
                        <div className="flex items-center justify-between gap-1 mb-0.5">
                          <span className="text-[10px] text-muted-foreground">{s.label}</span>
                          <span className={`text-[9px] font-medium ${c.text}`}>{s.delta}</span>
                        </div>
                        <p className={`text-sm font-bold ${c.text}`}>{s.value}</p>
                        <p className="text-[9px] text-muted-foreground/70 mt-0.5">{s.note}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Peer comparison */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                  <BarChart3 className="w-3 h-3" />Peer Comparison
                </div>
                <div className="rounded-lg border border-border/40 overflow-hidden">
                  <table className="w-full text-[10px]">
                    <thead>
                      <tr className="bg-muted/20 text-muted-foreground">
                        <th className="text-left px-2.5 py-1.5 font-medium">Issuer</th>
                        <th className="text-center px-2 py-1.5 font-medium">Rating</th>
                        <th className="text-right px-2 py-1.5 font-medium">CDS</th>
                        <th className="text-right px-2.5 py-1.5 font-medium">FCF</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/20">
                      {PEER_TABLE.map(p => (
                        <tr key={p.issuer} className={p.flag ? "bg-red-500/5" : ""}>
                          <td className={`px-2.5 py-1.5 font-medium ${p.flag ? "text-red-400" : ""}`}>
                            {p.issuer}{p.flag && <span className="ml-1 text-[9px]">←</span>}
                          </td>
                          <td className="text-center px-2 py-1.5 font-mono text-muted-foreground">{p.rating}</td>
                          <td className={`text-right px-2 py-1.5 font-mono ${p.flag ? "text-red-400 font-semibold" : "text-muted-foreground"}`}>{p.cds}bp</td>
                          <td className={`text-right px-2.5 py-1.5 font-mono ${p.fcf.startsWith("−") || p.fcf.startsWith("-") ? "text-red-400" : "text-emerald-400"}`}>{p.fcf}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Compliance checklist */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                  <CheckCheck className="w-3 h-3" />Compliance Checklist
                </div>
                <div className="flex flex-col gap-1">
                  {CHECKLIST.map((c, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${c.done ? "bg-emerald-500 border-emerald-500" : "border-amber-500/50 bg-amber-500/10"}`}>
                        {c.done
                          ? <CheckCircle2 className="w-2.5 h-2.5 text-white" />
                          : <Clock className="w-2 h-2 text-amber-400" />
                        }
                      </div>
                      <span className={`text-[10px] ${c.done ? "text-muted-foreground" : "text-amber-400"}`}>{c.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Action row */}
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
              >Request Changes</button>
              <button
                onClick={() => handleApprove(item.id)}
                className="px-3 py-1.5 rounded-lg text-[11px] font-medium text-white transition-all hover:opacity-90 active:scale-95 flex items-center gap-1.5"
                style={{ backgroundColor: FITCH_RW_COLOR }}
                data-testid={`btn-approve-${item.id}`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />Approve & Publish
              </button>
            </div>
          </div>
        </div>
      ))}

      {/* Resolved items from this session */}
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

      {/* ── Recently Resolved ── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Recently Resolved</span>
          <span className="text-[10px] text-muted-foreground">{RECENT_COMPLETED.length} actions</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {RECENT_COMPLETED.map(item => {
            const rs = riskStyle(item.riskLabel);
            return (
              <div key={item.id} className="rounded-lg border bg-card/40 px-3 py-2.5 flex items-center justify-between gap-2" data-testid={`approval-recent-${item.id}`}>
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${item.outcome === "approved" ? "bg-green-500/10" : "bg-amber-500/10"}`}>
                    {item.outcome === "approved"
                      ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                      : <MessageSquare className="w-3.5 h-3.5 text-amber-400" />
                    }
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium truncate">{item.issuer}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{item.action}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[9px] text-muted-foreground/60">{item.resolvedBy} · {item.resolvedAt}</span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${rs.bg} ${rs.text}`}>{item.rating}</span>
                  {item.outcome === "approved"
                    ? <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-400">Approved</span>
                    : <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400">Revised</span>
                  }
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
