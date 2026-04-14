import {
  CheckCircle,
  Clock,
  TrendingUp,
  AlertTriangle,
  ChevronRight,
  Zap,
  Target,
  ThumbsUp,
  ThumbsDown,
  MoreHorizontal,
  Home,
  Settings,
  Bell,
  type LucideIcon,
} from "lucide-react";

interface NavItem {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  badge?: number;
}

const outcomes = [
  { name: "Reduce invoice cycle time", progress: 83, target: "Cut from 14 days to 3 days", status: "on-track", saved: "$42K/mo", trend: "+8% this week" },
  { name: "Improve candidate screening", progress: 61, target: "Screen 500 applicants/week", status: "at-risk", saved: "18 hrs/wk", trend: "−3% this week" },
  { name: "Automate supplier onboarding", progress: 94, target: "Onboard in under 48 hours", status: "on-track", saved: "$28K/mo", trend: "+12% this week" },
];

const actions = [
  {
    id: 1,
    type: "approval",
    urgency: "today",
    title: "Schedule change in Plant A needs your approval",
    detail: "Your Digital Worker wants to reschedule 3 maintenance windows from next Monday to Thursday. This affects 12 workers.",
    impact: "Saves 4 hrs of downtime",
    time: "2 min ago",
  },
  {
    id: 2,
    type: "anomaly",
    urgency: "today",
    title: "Invoice agent flagged an unusual pattern — review?",
    detail: "Vendor Apex Corp submitted 3 invoices this week vs. their usual 1. Amounts look normal but the frequency is new.",
    impact: "Worth a quick look",
    time: "1 hr ago",
  },
  {
    id: 3,
    type: "recommendation",
    urgency: "this-week",
    title: "New optimization ready — save 6 hours/week",
    detail: "Your screening Digital Worker learned a faster way to categorize applications. Want to try it?",
    impact: "Est. 6 hrs saved/week",
    time: "3 hrs ago",
  },
];

const recentWins = [
  { text: "Invoice agent processed 84 invoices overnight — $0 manual effort", time: "Today, 6:02 AM" },
  { text: "Screening agent pre-qualified 47 candidates, saved HR team 9 hours", time: "Yesterday" },
  { text: "Supplier onboarding completed for 3 new vendors in 31 hours (target: 48h)", time: "2 days ago" },
];

function UrgencyDot({ urgency }: { urgency: string }) {
  return (
    <span className={`inline-block w-2 h-2 rounded-full shrink-0 mt-1.5 ${urgency === "today" ? "bg-amber-400" : "bg-slate-300"}`} />
  );
}

export function CommandCenter() {
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
            { icon: Home, label: "Home", active: true },
            { icon: Target, label: "Outcomes" },
            {
              icon: CheckCircle,
              label: "My Actions",
              badge: 2,
            },
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
        <div className="px-3 py-3 border-t border-slate-800">
          <div className="text-[10px] text-slate-500 px-1 mb-1">SWITCH MODE</div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-slate-400 hover:bg-slate-800 cursor-pointer">
            <MoreHorizontal className="w-3.5 h-3.5" />
            Advanced View →
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-h-0 overflow-auto">
        {/* Header */}
        <header className="flex items-center justify-between px-6 py-4 border-b border-slate-800 shrink-0">
          <div>
            <h1 className="text-lg font-semibold text-white">Good morning, Sarah</h1>
            <p className="text-sm text-slate-400">Tuesday, April 14 · 3 initiatives running</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Bell className="w-5 h-5 text-slate-400" />
              <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-amber-500 rounded-full text-[9px] font-bold text-white flex items-center justify-center">2</span>
            </div>
            <div className="w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center text-xs font-semibold text-white">SH</div>
          </div>
        </header>

        <div className="flex-1 p-6 space-y-6">
          {/* Stat strip */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "Value generated this month", value: "$94K", sub: "across 3 initiatives", color: "text-emerald-400", bg: "bg-emerald-500/10" },
              { label: "Outcomes on track", value: "2 of 3", sub: "1 needs attention", color: "text-violet-400", bg: "bg-violet-500/10" },
              { label: "Actions waiting for you", value: "2", sub: "1 due today", color: "text-amber-400", bg: "bg-amber-500/10" },
              { label: "Hours saved this week", value: "27 hrs", sub: "by your Digital Workers", color: "text-blue-400", bg: "bg-blue-500/10" },
            ].map(({ label, value, sub, color, bg }) => (
              <div key={label} className={`rounded-xl border border-slate-800 bg-slate-900 px-4 py-3.5 flex flex-col gap-1 cursor-pointer hover:border-slate-700 transition-colors`}>
                <span className="text-[11px] text-slate-500 leading-tight">{label}</span>
                <span className={`text-2xl font-bold ${color}`}>{value}</span>
                <span className="text-[11px] text-slate-500">{sub}</span>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-5 gap-4">
            {/* Outcomes summary */}
            <div className="col-span-3 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white">Your Outcomes</h2>
                <button className="text-xs text-violet-400 flex items-center gap-1">View all <ChevronRight className="w-3 h-3" /></button>
              </div>
              <div className="space-y-2">
                {outcomes.map((o) => (
                  <div key={o.name} className="bg-slate-900 border border-slate-800 rounded-xl p-4 hover:border-slate-700 transition-colors cursor-pointer">
                    <div className="flex items-start justify-between gap-3 mb-2.5">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-white truncate">{o.name}</div>
                        <div className="text-xs text-slate-500 mt-0.5">{o.target}</div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs font-medium text-emerald-400">{o.saved}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${o.status === "on-track" ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"}`}>
                          {o.status === "on-track" ? "On Track" : "At Risk"}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 bg-slate-800 rounded-full h-1.5">
                        <div
                          className={`h-1.5 rounded-full ${o.status === "on-track" ? "bg-emerald-500" : "bg-amber-500"}`}
                          style={{ width: `${o.progress}%` }}
                        />
                      </div>
                      <span className={`text-xs font-medium ${o.status === "on-track" ? "text-emerald-400" : "text-amber-400"}`}>{o.progress}% to target</span>
                      <span className="text-[11px] text-slate-500">{o.trend}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent wins */}
            <div className="col-span-2 space-y-3">
              <h2 className="text-sm font-semibold text-white">Recent Wins</h2>
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
                {recentWins.map((w, i) => (
                  <div key={i} className="flex gap-2.5">
                    <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0 mt-0.5">
                      <TrendingUp className="w-2.5 h-2.5 text-emerald-400" />
                    </div>
                    <div>
                      <p className="text-xs text-slate-300 leading-relaxed">{w.text}</p>
                      <p className="text-[10px] text-slate-600 mt-0.5">{w.time}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Actions preview */}
              <h2 className="text-sm font-semibold text-white pt-1">Actions Waiting for You</h2>
              <div className="space-y-2">
                {actions.slice(0, 2).map((a) => (
                  <div key={a.id} className="bg-slate-900 border border-slate-800 rounded-xl p-3 hover:border-slate-700 transition-colors cursor-pointer">
                    <div className="flex gap-2 mb-2">
                      <UrgencyDot urgency={a.urgency} />
                      <p className="text-xs font-medium text-white leading-snug">{a.title}</p>
                    </div>
                    <div className="flex gap-2 pl-4">
                      <button className="flex items-center gap-1 text-[11px] bg-violet-600/80 hover:bg-violet-600 text-white px-2.5 py-1 rounded-lg transition-colors">
                        <ThumbsUp className="w-3 h-3" /> Approve
                      </button>
                      <button className="flex items-center gap-1 text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 px-2.5 py-1 rounded-lg transition-colors">
                        <ThumbsDown className="w-3 h-3" /> Skip
                      </button>
                    </div>
                  </div>
                ))}
                <button className="w-full text-xs text-violet-400 py-2 flex items-center justify-center gap-1">
                  View all 3 actions <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
