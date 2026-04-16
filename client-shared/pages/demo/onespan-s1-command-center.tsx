import { useState, useEffect } from "react";
import { Link } from "wouter";
import { AlertTriangle, CheckCircle2, Clock, FileText, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  ONESPAN_TRANSACTIONS, ONESPAN_KPI_DATA, ONESPAN_COLOR, ONESPAN_ACCENT,
  TARGET_TXN_ID, type OnespanTransaction,
} from "./onespan-constants";

function StatusPill({ status, stallHours }: { status: OnespanTransaction["status"]; stallHours: number }) {
  if (status === "declined") return (
    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 font-medium whitespace-nowrap">
      <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />Declined
    </span>
  );
  if (status === "stalled") return (
    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 whitespace-nowrap">
      <Clock className="w-2.5 h-2.5" />Stalled {stallHours}h
    </span>
  );
  if (status === "completed") return (
    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 whitespace-nowrap">
      <CheckCircle2 className="w-2.5 h-2.5" />Complete
    </span>
  );
  if (status === "in_review") return (
    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 whitespace-nowrap">
      <FileText className="w-2.5 h-2.5" />In Review
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-muted/30 text-muted-foreground border border-border/40 whitespace-nowrap">
      Pending
    </span>
  );
}

function PriorityBadge({ priority }: { priority: OnespanTransaction["priority"] }) {
  if (priority === "vip") return <Badge className="text-[9px] px-1 py-0" style={{ backgroundColor: `${ONESPAN_ACCENT}20`, color: ONESPAN_ACCENT, borderColor: `${ONESPAN_ACCENT}40` }}>VIP</Badge>;
  if (priority === "high") return <Badge variant="outline" className="text-[9px] px-1 py-0 text-orange-400 border-orange-400/30">HIGH</Badge>;
  return null;
}

function VersionCell({ sent, required }: { sent: string; required: string }) {
  const mismatch = sent !== required;
  return (
    <span className={`text-[10px] font-mono ${mismatch ? "text-red-400" : "text-muted-foreground"}`}>
      {sent}
      {mismatch && <span className="ml-1 text-muted-foreground/50">→ {required}</span>}
    </span>
  );
}

function RiskScoreCell({ score }: { score: number }) {
  const color =
    score >= 80 ? "text-red-400"
    : score >= 60 ? "text-amber-400"
    : score >= 40 ? "text-yellow-400"
    : "text-emerald-400";
  const bg =
    score >= 80 ? "bg-red-500/10 border-red-500/20"
    : score >= 60 ? "bg-amber-500/10 border-amber-500/20"
    : score >= 40 ? "bg-yellow-500/10 border-yellow-500/20"
    : "bg-emerald-500/10 border-emerald-500/20";
  return (
    <span className={`inline-flex items-center text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border ${color} ${bg}`} data-testid={`risk-${score}`}>
      {score}
    </span>
  );
}

function SLACountdown({ stallHours, status }: { stallHours: number; status: OnespanTransaction["status"] }) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (status !== "stalled" && status !== "declined") return;
    const id = setInterval(() => setTick(t => t + 1), 60_000);
    return () => clearInterval(id);
  }, [status]);

  if (status !== "stalled" && status !== "declined") return null;

  const escalationThresholdHours = 72;
  const remaining = escalationThresholdHours - stallHours;

  if (remaining <= 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[9px] text-red-400 font-medium">
        <ShieldAlert className="w-2.5 h-2.5" />SLA breached
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-0.5 text-[9px] font-mono ${remaining <= 12 ? "text-red-400" : "text-amber-400/70"}`}>
      <Clock className="w-2.5 h-2.5" />{remaining}h to esc.
    </span>
  );
}

function TxnRow({ txn }: { txn: OnespanTransaction }) {
  const isTarget = txn.id === TARGET_TXN_ID;
  return (
    <tr
      className={`border-b border-border/40 transition-colors ${isTarget ? "bg-red-500/5 hover:bg-red-500/8" : "hover:bg-muted/20"}`}
      data-testid={`row-txn-${txn.id}`}
    >
      <td className="py-2.5 pl-4 pr-2 whitespace-nowrap">
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-mono text-muted-foreground/60">{txn.id}</span>
          {isTarget && <AlertTriangle className="w-3 h-3 text-red-400 animate-pulse" />}
        </div>
      </td>
      <td className="py-2.5 px-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold">{txn.client}</span>
          <PriorityBadge priority={txn.priority} />
        </div>
        <span className="text-[10px] text-muted-foreground">{txn.product}</span>
      </td>
      <td className="py-2.5 px-2 text-right whitespace-nowrap">
        <span className="text-[11px] font-mono">${(txn.amount / 1_000_000).toFixed(1)}M</span>
      </td>
      <td className="py-2.5 px-2 text-center whitespace-nowrap">
        <VersionCell sent={txn.docVersion} required={txn.requiredVersion} />
      </td>
      <td className="py-2.5 px-2 text-center">
        <span className="text-[10px] text-muted-foreground">{txn.signerCount}</span>
      </td>
      <td className="py-2.5 px-2 text-center">
        <RiskScoreCell score={txn.riskScore} />
      </td>
      <td className="py-2.5 px-2 pr-4">
        <div className="flex flex-col gap-1">
          <StatusPill status={txn.status} stallHours={txn.stallHours} />
          <SLACountdown stallHours={txn.stallHours} status={txn.status} />
        </div>
      </td>
    </tr>
  );
}

export default function OnespanS1CommandCenter({ onRunPipeline }: { onRunPipeline: () => void }) {
  return (
    <div className="space-y-6">
      {/* VIP alert banner */}
      <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4" data-testid="banner-vip-alert">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-bold text-red-400">VIP Transaction Declined</span>
              <Badge style={{ backgroundColor: `${ONESPAN_ACCENT}20`, color: ONESPAN_ACCENT, borderColor: `${ONESPAN_ACCENT}40` }} className="text-[10px]">VIP</Badge>
              <Badge className="text-[10px] bg-red-500/10 text-red-400 border-red-500/20">Correctable</Badge>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              <span className="font-semibold text-foreground">{TARGET_TXN_ID}</span> — Meridian Capital Partners $1.2M Commercial Loan · Signer Sarah Keating (VP Treasury) declined ·&nbsp;
              Document v1.2 sent, v1.4 required (AML attestation clause, 2026-Q1 update) ·&nbsp;
              RM David Okafor not yet notified · <span className="text-red-400">AML compliance gap — immediate action required</span>
            </p>
          </div>
          <button
            onClick={onRunPipeline}
            className="shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-white transition-all hover:opacity-90 active:scale-95"
            style={{ backgroundColor: ONESPAN_COLOR }}
            data-testid="btn-run-from-alert"
          >
            Run ATLAS Pipeline →
          </button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {ONESPAN_KPI_DATA.map(kpi => (
          <div
            key={kpi.id}
            className="rounded-xl border border-border/50 bg-muted/10 p-4"
            data-testid={`kpi-${kpi.id}`}
          >
            <div className="text-[10px] text-muted-foreground mb-1">{kpi.label}</div>
            <div className="flex items-baseline gap-1">
              <span className={`text-xl font-bold ${kpi.alert ? "text-red-400" : "text-foreground"}`}>{kpi.value}</span>
              {kpi.unit && <span className="text-[11px] text-muted-foreground">{kpi.unit}</span>}
            </div>
            <div className="text-[10px] text-muted-foreground/60 mt-0.5">{kpi.sub}</div>
          </div>
        ))}
      </div>

      {/* Active Transactions */}
      <div className="rounded-xl border border-border/50 overflow-hidden">
        <div className="px-4 py-3 border-b border-border/50 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold" data-testid="heading-transactions">Active Agreement Transactions</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">Rolling 30 days · {ONESPAN_TRANSACTIONS.length} transactions · Risk score 0–100</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
            <span className="text-[11px] text-muted-foreground">Live</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/40 bg-muted/20">
                <th className="py-2 pl-4 pr-2 text-left text-[10px] font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">Transaction ID</th>
                <th className="py-2 px-2 text-left text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Client · Product</th>
                <th className="py-2 px-2 text-right text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Amount</th>
                <th className="py-2 px-2 text-center text-[10px] font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">Doc Ver</th>
                <th className="py-2 px-2 text-center text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Signers</th>
                <th className="py-2 px-2 text-center text-[10px] font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">Risk</th>
                <th className="py-2 px-2 pr-4 text-left text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Status · SLA</th>
              </tr>
            </thead>
            <tbody>
              {ONESPAN_TRANSACTIONS.map(txn => (
                <TxnRow key={txn.id} txn={txn} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Funnel mini-vis */}
      <div className="rounded-xl border border-border/50 p-4">
        <h3 className="text-sm font-semibold mb-3" data-testid="heading-funnel">30-Day Completion Funnel</h3>
        <div className="space-y-2">
          {[
            { stage: "Envelope Created",  pct: 100.0, count: 284 },
            { stage: "Sent to Signers",   pct: 95.4,  count: 271 },
            { stage: "First Open",        pct: 88.4,  count: 251 },
            { stage: "Partially Signed",  pct: 82.4,  count: 234 },
            { stage: "Fully Signed",      pct: 88.3,  count: 251 },
          ].map(row => (
            <div key={row.stage} className="flex items-center gap-3" data-testid={`funnel-${row.stage.toLowerCase().replace(/ /g, "-")}`}>
              <span className="text-[10px] text-muted-foreground w-32 shrink-0">{row.stage}</span>
              <div className="flex-1 h-2 rounded-full bg-muted/30 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${row.pct}%`, backgroundColor: row.pct < 88 ? ONESPAN_ACCENT : ONESPAN_COLOR }}
                />
              </div>
              <span className="text-[10px] font-mono text-muted-foreground w-10 text-right">{row.pct}%</span>
              <span className="text-[10px] text-muted-foreground/50 w-8 text-right">{row.count}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/40">
          <div className="w-3 h-0.5 rounded" style={{ backgroundColor: ONESPAN_COLOR }} />
          <span className="text-[10px] text-muted-foreground">Current: 88.3%</span>
          <div className="w-3 h-0.5 rounded bg-muted-foreground/30 ml-3" />
          <span className="text-[10px] text-muted-foreground">Peer benchmark: 92.5% (−4.2 ppt gap)</span>
        </div>
      </div>

      {/* Quick links */}
      <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
        <Link href="/agents"><span className="hover:text-foreground cursor-pointer transition-colors" data-testid="link-agents-registry">→ Agent Registry</span></Link>
        <span>·</span>
        <Link href="/knowledge-bases"><span className="hover:text-foreground cursor-pointer transition-colors" data-testid="link-kb">→ Knowledge Bases</span></Link>
        <span>·</span>
        <Link href="/analytics"><span className="hover:text-foreground cursor-pointer transition-colors" data-testid="link-analytics">→ Platform Analytics</span></Link>
      </div>
    </div>
  );
}
