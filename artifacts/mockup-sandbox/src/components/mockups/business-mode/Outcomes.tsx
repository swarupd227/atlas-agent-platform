import {
  Plus,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  AlertTriangle,
  Zap,
  Target,
  Settings,
  Home,
  DollarSign,
  type LucideIcon,
} from "lucide-react";

interface NavItem {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  badge?: number;
}

const outcomes = [
  {
    id: 1,
    name: "Reduce invoice cycle time",
    description: "Cut the time to process and pay supplier invoices from 14 days to under 3 days",
    status: "on-track",
    progress: 83,
    saved: "$42,000",
    savedUnit: "/month",
    timeSaved: "18 hrs/wk",
    workers: 2,
    since: "Started 6 weeks ago",
    kpis: [
      { name: "Avg cycle time", current: "4.1 days", target: "3 days", progress: 83, trend: "down-good" },
      { name: "Invoices processed", current: "84/wk", target: "90/wk", progress: 93, trend: "up-good" },
    ],
    nextAction: null,
  },
  {
    id: 2,
    name: "Improve candidate screening",
    description: "Pre-qualify 500 applicants per week so HR focuses only on the best-fit candidates",
    status: "at-risk",
    progress: 61,
    saved: null,
    savedUnit: null,
    timeSaved: "12 hrs/wk",
    workers: 1,
    since: "Started 3 weeks ago",
    kpis: [
      { name: "Applications screened/week", current: "306", target: "500", progress: 61, trend: "up-good" },
      { name: "Screening accuracy", current: "88%", target: "92%", progress: 96, trend: "stable" },
    ],
    nextAction: "Your screening Digital Worker wants to adjust its criteria — approve to stay on track",
  },
  {
    id: 3,
    name: "Automate supplier onboarding",
    description: "Onboard new suppliers in under 48 hours, down from the current average of 9 days",
    status: "needs-review",
    progress: 94,
    saved: "$28,000",
    savedUnit: "/month",
    timeSaved: "8 hrs/supplier",
    workers: 1,
    since: "Started 10 weeks ago",
    kpis: [
      { name: "Avg onboarding time", current: "31 hrs", target: "48 hrs", progress: 100, trend: "down-good" },
      { name: "Suppliers onboarded", current: "24 this month", target: "20/month", progress: 100, trend: "up-good" },
    ],
    nextAction: null,
  },
];

function StatusPill({ status }: { status: string }) {
  const configs: Record<string, { label: string; cls: string }> = {
    "on-track": { label: "On Track", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" },
    "at-risk": { label: "At Risk — Needs Attention", cls: "bg-amber-500/15 text-amber-400 border-amber-500/20" },
    "needs-review": { label: "Needs Review", cls: "bg-violet-500/15 text-violet-400 border-violet-500/20" },
  };
  const { label, cls } = configs[status] || configs["on-track"];
  return (
    <span className={`text-[11px] px-2.5 py-0.5 rounded-full border font-medium ${cls}`}>{label}</span>
  );
}

function TrendIcon({ trend }: { trend: string }) {
  if (trend === "up-good") return <TrendingUp className="w-3 h-3 text-emerald-400" />;
  if (trend === "down-good") return <TrendingDown className="w-3 h-3 text-emerald-400" />;
  return <div className="w-3 h-3 rounded-full bg-slate-600" />;
}

function OutcomeCard({ o, expanded }: { o: typeof outcomes[0]; expanded?: boolean }) {
  return (
    <div className={`bg-slate-900 border rounded-2xl overflow-hidden transition-colors ${o.status === "at-risk" ? "border-amber-500/30" : "border-slate-800"}`}>
      <div className="p-5">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-base font-semibold text-white">{o.name}</span>
              <StatusPill status={o.status} />
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">{o.description}</p>
          </div>
          <div className="text-right shrink-0">
            {o.saved && (
              <div className="text-lg font-bold text-emerald-400">{o.saved}<span className="text-xs text-slate-500 font-normal">{o.savedUnit}</span></div>
            )}
            <div className="text-xs text-slate-500">{o.timeSaved} saved</div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mb-3">
          <div className="flex justify-between text-xs mb-1">
            <span className="text-slate-500">{o.since}</span>
            <span className={`font-medium ${o.status === "at-risk" ? "text-amber-400" : "text-emerald-400"}`}>{o.progress}% to target</span>
          </div>
          <div className="h-2 bg-slate-800 rounded-full">
            <div
              className={`h-2 rounded-full ${o.status === "at-risk" ? "bg-amber-500" : "bg-emerald-500"}`}
              style={{ width: `${Math.min(o.progress, 100)}%` }}
            />
          </div>
        </div>

        {/* Goals */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          {o.kpis.map((kpi) => (
            <div key={kpi.name} className="bg-slate-800/60 rounded-xl px-3 py-2.5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-slate-500">{kpi.name}</span>
                <TrendIcon trend={kpi.trend} />
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-sm font-semibold text-white">{kpi.current}</span>
                <span className="text-[10px] text-slate-600">of {kpi.target} target</span>
              </div>
              <div className="mt-1.5 h-1 bg-slate-700 rounded-full">
                <div className="h-1 bg-violet-500 rounded-full" style={{ width: `${Math.min(kpi.progress, 100)}%` }} />
              </div>
            </div>
          ))}
        </div>

        {/* Next action banner */}
        {o.nextAction && (
          <div className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <p className="text-xs text-amber-300 flex-1">{o.nextAction}</p>
            <button className="text-[11px] bg-amber-500 text-black font-medium px-3 py-1 rounded-lg hover:bg-amber-400 transition-colors shrink-0">Review</button>
          </div>
        )}

        <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-800">
          <span className="text-[11px] text-slate-600">{o.workers} Digital Worker{o.workers > 1 ? "s" : ""} running</span>
          <button className="text-xs text-violet-400 flex items-center gap-1 hover:text-violet-300">
            View details <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function Outcomes() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex">
      {/* Sidebar */}
      <aside className="w-56 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0">
        <div className="flex items-center gap-2.5 px-4 py-4 border-b border-slate-800">
          <div className="w-7 h-7 rounded-lg bg-violet-600 flex items-center justify-center">
            <Zap className="w-3.5 h-3.5 text-white" />
          </div>
          <div>
            <div className="text-xs font-semibold text-white">ATLAS</div>
            <div className="text-[10px] text-slate-500 leading-tight">Business</div>
          </div>
        </div>
        <nav className="flex-1 px-2 py-3 space-y-0.5">
          {[
            { icon: Home, label: "Home" },
            { icon: Target, label: "Outcomes", active: true },
            { icon: CheckCircle2, label: "My Actions", badge: 2 },
            { icon: Settings, label: "Settings" },
          ].map(({ icon: Icon, label, active, badge }: NavItem) => (
            <div
              key={label}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer text-sm transition-colors ${active ? "bg-violet-600/20 text-violet-300" : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"}`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="flex-1">{label}</span>
              {badge && (
                <span className="text-[10px] font-bold bg-amber-500 text-white rounded-full w-4 h-4 flex items-center justify-center">
                  {badge}
                </span>
              )}
            </div>
          ))}
        </nav>
      </aside>

      {/* Main */}
      <div className="flex-1 overflow-auto">
        <div className="px-6 py-5 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-white">Your Outcomes</h1>
            <p className="text-sm text-slate-500">What are your AI initiatives working toward?</p>
          </div>
          <button className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors">
            <Plus className="w-4 h-4" />
            Start a new outcome
          </button>
        </div>

        {/* Summary strip */}
        <div className="px-6 py-4 border-b border-slate-800 grid grid-cols-4 gap-3">
          {[
            { icon: Target, label: "Active outcomes", value: "3", color: "text-violet-400" },
            { icon: CheckCircle2, label: "On track", value: "2", color: "text-emerald-400" },
            { icon: AlertTriangle, label: "Need attention", value: "1", color: "text-amber-400" },
            { icon: DollarSign, label: "Value this month", value: "$70K", color: "text-emerald-400" },
          ].map(({ icon: Icon, label, value, color }) => (
            <div key={label} className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 flex items-center gap-2.5">
              <Icon className={`w-4 h-4 ${color}`} />
              <div>
                <div className={`text-base font-bold ${color}`}>{value}</div>
                <div className="text-[11px] text-slate-500">{label}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="p-6 space-y-4">
          {outcomes.map((o) => (
            <OutcomeCard key={o.id} o={o} />
          ))}
        </div>
      </div>
    </div>
  );
}
