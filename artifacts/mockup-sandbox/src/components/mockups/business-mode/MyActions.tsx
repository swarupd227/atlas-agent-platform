import {
  ThumbsUp,
  ThumbsDown,
  MessageSquare,
  CheckCircle2,
  AlertTriangle,
  Lightbulb,
  Clock,
  ChevronRight,
  Zap,
  Target,
  Settings,
  Home,
  Filter,
  Bell,
} from "lucide-react";

type ActionType = "approval" | "anomaly" | "recommendation" | "learning";

const actions: Array<{
  id: number;
  type: ActionType;
  urgency: "today" | "this-week" | "fyi";
  title: string;
  context: string;
  impact: string;
  outcome: string;
  time: string;
  canApprove?: boolean;
  canDismiss?: boolean;
  canDelegate?: boolean;
  automationPrompt?: boolean;
}> = [
  {
    id: 1,
    type: "approval",
    urgency: "today",
    title: "Schedule change in Plant A needs your approval",
    context: "Your Digital Worker wants to reschedule 3 maintenance windows from next Monday to Thursday. This affects 12 workers and two suppliers.",
    impact: "Saves 4 hrs of downtime · Affects 12 workers",
    outcome: "Supplier onboarding",
    time: "2 min ago",
    canApprove: true,
    canDismiss: true,
    canDelegate: false,
  },
  {
    id: 2,
    type: "anomaly",
    urgency: "today",
    title: "Invoice agent flagged an unusual pattern — review?",
    context: "Vendor Apex Corp submitted 3 invoices this week vs. their usual 1 per week. Amounts look normal ($4,200 total) but the frequency change is new.",
    impact: "Worth a quick look · Low financial risk",
    outcome: "Reduce invoice cycle time",
    time: "1 hr ago",
    canApprove: false,
    canDismiss: true,
    canDelegate: true,
  },
  {
    id: 3,
    type: "recommendation",
    urgency: "this-week",
    title: "New optimization ready — save 6 hours/week",
    context: "Your screening Digital Worker learned a pattern: applicants from referral sources convert at 3x the rate of job board applicants. It wants to prioritize them. Estimated saving: 6 hrs/week.",
    impact: "Est. 6 hrs saved/week · Affects hiring speed",
    outcome: "Improve candidate screening",
    time: "3 hrs ago",
    canApprove: true,
    canDismiss: true,
    canDelegate: false,
    automationPrompt: true,
  },
  {
    id: 4,
    type: "learning",
    urgency: "fyi",
    title: "Automation suggestion: skip approvals for standard invoice batches?",
    context: "You've approved 8 standard invoice batches in a row with no changes. Your Digital Worker can handle these automatically. You'll still see a weekly summary.",
    impact: "Saves ~15 min per approval",
    outcome: "Reduce invoice cycle time",
    time: "Yesterday",
    canApprove: true,
    canDismiss: true,
    canDelegate: false,
  },
  {
    id: 5,
    type: "approval",
    urgency: "this-week",
    title: "New supplier Nexus Parts Co wants to start onboarding",
    context: "Nexus Parts Co was referred by your procurement team. Your Digital Worker can begin their onboarding checklist. Estimated completion: 28 hours.",
    impact: "28-hr completion (target: 48h)",
    outcome: "Automate supplier onboarding",
    time: "2 hrs ago",
    canApprove: true,
    canDismiss: true,
    canDelegate: false,
  },
];

const typeConfig: Record<ActionType, { icon: any; color: string; bg: string; label: string }> = {
  approval: { icon: CheckCircle2, color: "text-violet-400", bg: "bg-violet-500/10", label: "Needs approval" },
  anomaly: { icon: AlertTriangle, color: "text-amber-400", bg: "bg-amber-500/10", label: "Something to review" },
  recommendation: { icon: Lightbulb, color: "text-blue-400", bg: "bg-blue-500/10", label: "Recommendation" },
  learning: { icon: Zap, color: "text-emerald-400", bg: "bg-emerald-500/10", label: "Automation ready" },
};

const urgencyConfig = {
  today: { label: "Due today", cls: "bg-red-500/10 text-red-400" },
  "this-week": { label: "This week", cls: "bg-amber-500/10 text-amber-400" },
  fyi: { label: "FYI", cls: "bg-slate-700 text-slate-400" },
};

function ActionCard({ a }: { a: typeof actions[0] }) {
  const tc = typeConfig[a.type];
  const uc = urgencyConfig[a.urgency];
  const Icon = tc.icon;
  return (
    <div className={`bg-slate-900 border rounded-2xl p-4 hover:border-slate-700 transition-colors ${a.urgency === "today" ? "border-slate-700" : "border-slate-800"}`}>
      <div className="flex gap-3">
        <div className={`w-8 h-8 rounded-xl ${tc.bg} flex items-center justify-center shrink-0 mt-0.5`}>
          <Icon className={`w-4 h-4 ${tc.color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${uc.cls}`}>{uc.label}</span>
              <span className="text-[10px] text-slate-600">· {a.outcome} · {a.time}</span>
            </div>
          </div>
          <p className="text-sm font-semibold text-white mb-1.5 leading-snug">{a.title}</p>
          <p className="text-xs text-slate-400 leading-relaxed mb-2.5">{a.context}</p>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1 h-1 rounded-full bg-slate-600" />
            <span className="text-[11px] text-slate-500">{a.impact}</span>
          </div>
          <div className="flex items-center gap-2">
            {a.canApprove && (
              <button className="flex items-center gap-1.5 text-xs bg-violet-600 hover:bg-violet-500 text-white font-medium px-3 py-1.5 rounded-lg transition-colors">
                <ThumbsUp className="w-3.5 h-3.5" />
                {a.type === "recommendation" || a.type === "learning" ? "Try it" : "Approve"}
              </button>
            )}
            {a.canDismiss && (
              <button className="flex items-center gap-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium px-3 py-1.5 rounded-lg transition-colors">
                <ThumbsDown className="w-3.5 h-3.5" />
                Skip
              </button>
            )}
            {a.canDelegate && (
              <button className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-300 px-2 py-1.5 transition-colors">
                <MessageSquare className="w-3.5 h-3.5" />
                Ask IT
              </button>
            )}
            <button className="ml-auto text-xs text-slate-500 hover:text-slate-400 flex items-center gap-1">
              Details <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function MyActions() {
  const today = actions.filter((a) => a.urgency === "today");
  const thisWeek = actions.filter((a) => a.urgency === "this-week");
  const fyi = actions.filter((a) => a.urgency === "fyi");

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
            { icon: Target, label: "Outcomes" },
            { icon: CheckCircle2, label: "My Actions", active: true, badge: 2 },
            { icon: Settings, label: "Settings" },
          ].map(({ icon: Icon, label, active, badge }: any) => (
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
            <h1 className="text-lg font-semibold text-white">My Actions</h1>
            <p className="text-sm text-slate-500">5 items · 2 need your attention today</p>
          </div>
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-1.5 text-xs text-slate-400 bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg transition-colors">
              <Filter className="w-3.5 h-3.5" /> Filter
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {today.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-semibold text-red-400 uppercase tracking-widest">Due Today</span>
                <div className="flex-1 h-px bg-red-500/20" />
                <span className="text-[10px] text-slate-600">{today.length} items</span>
              </div>
              <div className="space-y-3">{today.map((a) => <ActionCard key={a.id} a={a} />)}</div>
            </div>
          )}

          {thisWeek.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-semibold text-amber-400 uppercase tracking-widest">This Week</span>
                <div className="flex-1 h-px bg-amber-500/20" />
                <span className="text-[10px] text-slate-600">{thisWeek.length} items</span>
              </div>
              <div className="space-y-3">{thisWeek.map((a) => <ActionCard key={a.id} a={a} />)}</div>
            </div>
          )}

          {fyi.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest">For Your Info</span>
                <div className="flex-1 h-px bg-slate-800" />
                <span className="text-[10px] text-slate-600">{fyi.length} items</span>
              </div>
              <div className="space-y-3">{fyi.map((a) => <ActionCard key={a.id} a={a} />)}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
