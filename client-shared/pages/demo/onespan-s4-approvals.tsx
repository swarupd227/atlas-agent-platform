import { CheckCircle2, FileSignature, AlertTriangle, User, Clock, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { ONESPAN_COLOR, ONESPAN_ACCENT, TARGET_TXN_ID, TARGET_CLIENT } from "./onespan-constants";

interface PolicyCheck {
  policy: string;
  status: "PASS" | "VIOLATION" | "REMEDIATED";
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "N/A";
  detail: string;
}

const POLICY_CHECKS: PolicyCheck[] = [
  { policy: "AML Attestation Clause",             status: "REMEDIATED",  severity: "CRITICAL", detail: "Commercial loan >$500K now sent with v1.4 containing mandatory AML attestation (2026-Q1). Remediated by AGR-003." },
  { policy: "Document Version Currency",          status: "REMEDIATED",  severity: "HIGH",     detail: "Envelope resent with current required version v1.4. v1.2 (invalid) replaced." },
  { policy: "VIP Transaction SLA (4h alert)",     status: "REMEDIATED",  severity: "HIGH",     detail: "RM David Okafor notified by AGR-003 after 14h stall. SLA breach documented; process gap flagged." },
  { policy: "Signer Inactivity Alert (48h)",      status: "VIOLATION",   severity: "MEDIUM",   detail: "2 transactions (TXN-2026-00831, TXN-2026-00784) exceed 48h inactivity threshold without nudge." },
  { policy: "Envelope Audit Trail Completeness",  status: "PASS",        severity: "N/A",      detail: "All envelopes have complete audit trails including resend entry by AGR-003." },
  { policy: "eSignature Legal Validity",          status: "PASS",        severity: "N/A",      detail: "All completed agreements use OneSpan certified eSignature." },
];

function StatusBadge({ status }: { status: PolicyCheck["status"] }) {
  if (status === "PASS")
    return <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"><CheckCircle2 className="w-2.5 h-2.5" />Pass</span>;
  if (status === "REMEDIATED")
    return <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20"><CheckCircle2 className="w-2.5 h-2.5" />Remediated</span>;
  return <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20"><AlertTriangle className="w-2.5 h-2.5" />Open</span>;
}

function SeverityBadge({ severity }: { severity: PolicyCheck["severity"] }) {
  if (severity === "CRITICAL") return <Badge className="text-[9px] px-1 py-0 bg-red-500/10 text-red-400 border-red-500/20">CRITICAL</Badge>;
  if (severity === "HIGH")     return <Badge className="text-[9px] px-1 py-0 bg-orange-500/10 text-orange-400 border-orange-500/20">HIGH</Badge>;
  if (severity === "MEDIUM")   return <Badge className="text-[9px] px-1 py-0 bg-amber-500/10 text-amber-400 border-amber-500/20">MEDIUM</Badge>;
  return null;
}

function InterventionCard({ hasRun }: { hasRun: boolean }) {
  return (
    <div className="rounded-xl border border-border/50 overflow-hidden" data-testid="card-intervention">
      {/* Card header */}
      <div className="px-4 py-3 border-b border-border/50" style={{ background: `linear-gradient(135deg, ${ONESPAN_COLOR}12, transparent)` }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileSignature className="w-4 h-4" style={{ color: ONESPAN_COLOR }} />
            <span className="text-sm font-bold" data-testid="heading-intervention">Intervention Record — {TARGET_TXN_ID}</span>
          </div>
          {hasRun
            ? <Badge style={{ backgroundColor: `${ONESPAN_COLOR}20`, color: ONESPAN_COLOR, borderColor: `${ONESPAN_COLOR}40` }} className="text-[10px]">Completed by ATLAS</Badge>
            : <Badge variant="outline" className="text-[10px] text-muted-foreground">Awaiting Pipeline Run</Badge>}
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Deal context */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]">
          <div>
            <div className="text-muted-foreground mb-0.5">Client</div>
            <div className="font-semibold">{TARGET_CLIENT}</div>
          </div>
          <div>
            <div className="text-muted-foreground mb-0.5">Amount</div>
            <div className="font-semibold">$1,200,000</div>
          </div>
          <div>
            <div className="text-muted-foreground mb-0.5">Product</div>
            <div className="font-semibold">Commercial Loan</div>
          </div>
          <div>
            <div className="text-muted-foreground mb-0.5">Priority</div>
            <div style={{ color: ONESPAN_ACCENT }} className="font-bold">VIP</div>
          </div>
        </div>

        {/* Exception */}
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3">
          <div className="flex items-center gap-1.5 mb-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
            <span className="text-[11px] font-semibold text-red-400">Exception: DOCUMENT_VERSION_MISMATCH</span>
            <Badge className="text-[9px] px-1 py-0 bg-emerald-500/10 text-emerald-400 border-emerald-500/20 ml-auto">CORRECTABLE (98%)</Badge>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Document v1.2 sent — missing AML attestation clause added in v1.4 (2026-Q1 regulatory update). Signer Sarah Keating (VP Treasury) declined after viewing page 1–3 of 18.
          </p>
        </div>

        {/* Actions taken */}
        <div>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Actions Taken by ATLAS Agents</div>
          <div className="space-y-2">
            {[
              { agent: "AGR-001", action: "Portfolio health scan — VIP decline detected in 52h stall", status: hasRun, color: "text-blue-400" },
              { agent: "AGR-002", action: "Exception classified: DOCUMENT_VERSION_MISMATCH — confidence 98% — CORRECTABLE", status: hasRun, color: "text-violet-400" },
              { agent: "AGR-003", action: "Envelope resent with v1.4 to s.keating@meridian-capital.com — priority HIGH", status: hasRun, color: "text-amber-400" },
              { agent: "AGR-003", action: "CRM updated — INTERVENTION_ACTIVE — David Okafor attributed", status: hasRun, color: "text-amber-400" },
              { agent: "AGR-003", action: "RM David Okafor notified (email + inbox) — 2h response SLA", status: hasRun, color: "text-amber-400" },
              { agent: "AGR-003", action: "Helpdesk ticket created (auto-resolved) — AML attestation gap remediated", status: hasRun, color: "text-amber-400" },
              { agent: "AGR-004", action: "Portfolio ops report generated with systemic recommendations", status: hasRun, color: "text-emerald-400" },
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-2.5" data-testid={`action-item-${i}`}>
                <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${hasRun ? "bg-emerald-400" : "bg-muted-foreground/20"}`} />
                <span className={`text-[9px] font-bold shrink-0 w-14 ${item.color}`}>{item.agent}</span>
                <span className={`text-[11px] ${hasRun ? "text-foreground/80" : "text-muted-foreground/40"}`}>{item.action}</span>
                {hasRun && <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0 mt-0.5" />}
              </div>
            ))}
          </div>
        </div>

        {/* Signers */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-border/50 bg-muted/10 p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <User className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-[10px] font-semibold">Primary Signer</span>
            </div>
            <div className="text-[11px] font-semibold">Sarah Keating</div>
            <div className="text-[10px] text-muted-foreground">VP Treasury · Meridian Capital Partners</div>
            <div className="text-[10px] text-muted-foreground/60 mt-0.5">s.keating@meridian-capital.com</div>
            {hasRun && <div className="text-[10px] text-blue-400 mt-1">✉ Resend delivered — awaiting signature</div>}
          </div>
          <div className="rounded-lg border border-border/50 bg-muted/10 p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <User className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-[10px] font-semibold">Relationship Manager</span>
            </div>
            <div className="text-[11px] font-semibold">David Okafor</div>
            <div className="text-[10px] text-muted-foreground">RM · Commercial Banking</div>
            <div className="text-[10px] text-muted-foreground/60 mt-0.5">d.okafor@bank.com</div>
            {hasRun && <div className="text-[10px] text-emerald-400 mt-1">✓ Notified — 2h response SLA active</div>}
          </div>
        </div>

        {/* ETA */}
        {hasRun && (
          <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/10 p-3">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <span className="text-[11px] text-muted-foreground">Expected signing completion: <span className="text-foreground font-semibold">within 24 hours</span> · ETA auto-updated in CRM</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function OnespanS4Approvals({ hasRun }: { hasRun: boolean }) {
  const openViolations = POLICY_CHECKS.filter(c => c.status === "VIOLATION").length;
  const remediated     = POLICY_CHECKS.filter(c => c.status === "REMEDIATED").length;

  return (
    <div className="space-y-5">
      {/* Summary bar */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-border/50 bg-muted/10 p-3 text-center" data-testid="stat-remediated">
          <div className="text-xl font-bold text-emerald-400">{hasRun ? remediated : 0}</div>
          <div className="text-[10px] text-muted-foreground">Remediated</div>
        </div>
        <div className="rounded-xl border border-border/50 bg-muted/10 p-3 text-center" data-testid="stat-open">
          <div className="text-xl font-bold text-amber-400">{hasRun ? openViolations : "—"}</div>
          <div className="text-[10px] text-muted-foreground">Open Violations</div>
        </div>
        <div className="rounded-xl border border-border/50 bg-muted/10 p-3 text-center" data-testid="stat-pass">
          <div className="text-xl font-bold" style={{ color: ONESPAN_COLOR }}>
            {POLICY_CHECKS.filter(c => c.status === "PASS").length}
          </div>
          <div className="text-[10px] text-muted-foreground">Passing</div>
        </div>
      </div>

      {/* Intervention card */}
      <InterventionCard hasRun={hasRun} />

      {/* Policy compliance */}
      <div className="rounded-xl border border-border/50 overflow-hidden">
        <div className="px-4 py-3 border-b border-border/50">
          <h3 className="text-sm font-semibold" data-testid="heading-compliance">Policy Compliance Status</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">OneSpan Enterprise Agreement Policy v3.2 · {hasRun ? "Post-intervention state" : "Pre-intervention state"}</p>
        </div>
        <div className="divide-y divide-border/40">
          {POLICY_CHECKS.map((check, i) => (
            <div key={i} className="px-4 py-3 flex items-start gap-3" data-testid={`policy-row-${i}`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-semibold">{check.policy}</span>
                  <SeverityBadge severity={check.severity} />
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">{check.detail}</p>
              </div>
              <div className="shrink-0">
                <StatusBadge status={hasRun ? check.status : (check.status === "PASS" ? "PASS" : "VIOLATION")} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Systemic recommendations */}
      <div className="rounded-xl border border-border/50 p-4">
        <h3 className="text-sm font-semibold mb-3" data-testid="heading-recommendations">Systemic Recommendations — AGR-004</h3>
        <div className="space-y-2">
          {[
            { priority: "IMMEDIATE", action: "Implement pre-send document version validation gate", impact: "Eliminates ~42% of declines (version mismatch class)" },
            { priority: "HIGH",      action: "Deploy automated 48h signer nudge (SMS + email)", impact: "Expected to resolve 4–5 of 7 active stalls" },
            { priority: "HIGH",      action: "Activate VIP transaction RM alert at 4h stall threshold", impact: "Protects high-value deals with proactive human intervention" },
            { priority: "MEDIUM",    action: "Integrate document library version management into sender UI", impact: "Reduces operator error for template selection" },
          ].map((rec, i) => (
            <div key={i} className="flex items-start gap-3 py-2 border-b border-border/30 last:border-0" data-testid={`rec-${i}`}>
              <Badge className={`text-[9px] px-1.5 py-0.5 shrink-0 mt-0.5 ${
                rec.priority === "IMMEDIATE" ? "bg-red-500/10 text-red-400 border-red-500/20" :
                rec.priority === "HIGH"      ? "bg-orange-500/10 text-orange-400 border-orange-500/20" :
                                               "bg-muted/30 text-muted-foreground border-border/40"
              }`}>{rec.priority}</Badge>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-semibold">{rec.action}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">{rec.impact}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <Link href="/agents">
          <button className="text-[11px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1" data-testid="link-view-agents">
            View all agents <ExternalLink className="w-3 h-3" />
          </button>
        </Link>
      </div>
    </div>
  );
}
