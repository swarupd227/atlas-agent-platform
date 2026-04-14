import {
  LayoutDashboard,
  Target,
  Bot,
  Activity,
  Shield,
  CreditCard,
  CheckCircle,
  Zap,
  Library,
  FlaskConical,
  Plug,
  ShieldCheck,
  PenTool,
  ScrollText,
  BookOpen,
  Layers,
  Database,
  Settings,
  Eye,
  Hammer,
  Brain,
  GitBranch,
  Network,
  Gauge,
  Scale,
  GitCompare,
  HeartPulse,
  FileText,
  Workflow,
  Cpu,
  Code2,
  PlayCircle,
  MonitorCheck,
  Home,
  CheckCircle2,
  MoreHorizontal,
  ChevronRight,
  ArrowRight,
  Rocket,
} from "lucide-react";

const currentSidebar = [
  { group: "Primary", items: [
    { label: "Overview", icon: LayoutDashboard },
    { label: "Outcomes", icon: Target },
    { label: "Agents", icon: Bot },
    { label: "Knowledge", icon: BookOpen },
    { label: "Deployments", icon: Rocket },
    { label: "Monitor", icon: Activity },
    { label: "Fleet Health", icon: MonitorCheck },
    { label: "Governance", icon: Shield },
    { label: "Integrations", icon: Plug },
  ]},
  { group: "Build", items: [
    { label: "Pipelines", icon: Workflow },
    { label: "Blueprints", icon: PenTool },
    { label: "Templates", icon: Library },
    { label: "Skills", icon: Layers },
    { label: "Context Engine", icon: Brain },
    { label: "Memory Manager", icon: Database },
    { label: "RAG Pipeline", icon: GitBranch },
    { label: "Knowledge Graph", icon: Network },
  ]},
  { group: "Evaluate", items: [
    { label: "Evaluations", icon: FlaskConical },
    { label: "Eval Datasets", icon: Database },
  ]},
  { group: "Operate", items: [
    { label: "Shadow Replay", icon: GitCompare },
    { label: "Canary Deployment", icon: GitBranch },
    { label: "Optimization", icon: Zap },
    { label: "Healing Center", icon: HeartPulse },
    { label: "Runbooks", icon: FileText },
  ]},
  { group: "Govern", items: [
    { label: "Autonomy Engine", icon: Gauge },
    { label: "Oversight Console", icon: Scale },
    { label: "Approvals", icon: CheckCircle },
    { label: "Audit Trail", icon: ScrollText },
  ]},
  { group: "System", items: [
    { label: "Model Providers", icon: Cpu },
    { label: "Developer Portal", icon: Code2 },
    { label: "Billing", icon: CreditCard },
    { label: "Ontology", icon: BookOpen },
    { label: "Admin", icon: ShieldCheck },
  ]},
];

const businessNav = [
  { label: "Home", icon: Home, badge: null, active: false },
  { label: "Outcomes", icon: Target, badge: null, active: false },
  { label: "My Actions", icon: CheckCircle2, badge: 2, active: false },
  { label: "Settings", icon: Settings, badge: null, active: false },
];

const hiddenTerms = [
  "MCP Server", "RAG Pipeline", "Canary Deployment", "Shadow Replay", "Ontology Explorer",
  "Memory Manager", "Context Engine", "Knowledge Graph", "Eval Datasets", "Autonomy Engine",
  "Oversight Console", "Healing Center", "Runbooks", "Fleet Health", "Governance", "Audit Trail",
  "Pipelines", "Blueprints", "Model Providers", "Developer Portal",
];

const renamedTerms = [
  { from: "Agents", to: "Digital Workers" },
  { from: "Approval Gate", to: "Needs your review" },
  { from: "Outcome Contract", to: "AI Initiative" },
  { from: "KPI", to: "Goal" },
  { from: "Autonomy Mode", to: "Learning Mode / Auto" },
  { from: "Observability Alert", to: "Something to review" },
  { from: "Overview", to: "Home" },
  { from: "Approvals", to: "My Actions" },
  { from: "Health Score", to: "Reliability %" },
  { from: "Risk Tier", to: "Traffic light" },
  { from: "Drift Detection", to: "Performance change flagged" },
  { from: "Incident", to: "Issue flagged" },
];

export function SidebarComparison() {
  const totalItems = currentSidebar.reduce((sum, g) => sum + g.items.length, 0);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <div className="max-w-[1180px] mx-auto space-y-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-2">Sidebar: Before & After</h1>
          <p className="text-slate-400 text-sm">Progressive disclosure — same data, role-appropriate surface</p>
        </div>

        {/* Main comparison */}
        <div className="grid grid-cols-11 gap-6 items-start">
          {/* Current IT sidebar */}
          <div className="col-span-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-white">Current (IT / Builder)</h2>
              <span className="text-[11px] bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded-full">{totalItems} items</span>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-3 border-b border-slate-800">
                <div className="w-6 h-6 rounded-lg bg-violet-600 flex items-center justify-center">
                  <Zap className="w-3 h-3 text-white" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-white">ATLAS</div>
                  <div className="text-[9px] text-slate-500">Nous Agent Orchestrator</div>
                </div>
              </div>
              <div className="px-1.5 py-1.5 space-y-0 overflow-auto max-h-[520px]">
                {currentSidebar.map((g) => (
                  <div key={g.group}>
                    {g.group !== "Primary" && (
                      <div className="px-2 py-1 mt-1">
                        <span className="text-[9px] font-medium text-slate-600 uppercase tracking-wider">{g.group}</span>
                      </div>
                    )}
                    {g.items.map(({ label, icon: Icon }) => (
                      <div key={label} className="flex items-center gap-1.5 px-2 py-1 rounded-md text-slate-400 hover:text-slate-300">
                        <Icon className="w-3 h-3 shrink-0" />
                        <span className="text-[11px]">{label}</span>
                      </div>
                    ))}
                  </div>
                ))}
                <div className="border-t border-slate-800 mt-1 pt-1">
                  <div className="flex items-center gap-1.5 px-2 py-1 rounded-md text-slate-400">
                    <PlayCircle className="w-3 h-3 shrink-0" />
                    <span className="text-[11px]">Demo Center</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Arrow */}
          <div className="col-span-1 flex flex-col items-center justify-center pt-24 gap-3">
            <ArrowRight className="w-6 h-6 text-violet-400" />
            <div className="text-center">
              <div className="text-[10px] text-slate-500 leading-tight">Role-<br/>aware</div>
            </div>
          </div>

          {/* Business Mode sidebar */}
          <div className="col-span-3">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-white">Business Mode</h2>
              <span className="text-[11px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full">4 items</span>
            </div>
            <div className="bg-slate-900 border border-violet-500/30 rounded-2xl overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-3 border-b border-slate-800">
                <div className="w-6 h-6 rounded-lg bg-violet-600 flex items-center justify-center">
                  <Zap className="w-3 h-3 text-white" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-white">ATLAS</div>
                  <div className="text-[9px] text-violet-400">Business</div>
                </div>
              </div>
              <div className="px-1.5 py-2 space-y-0.5">
                {businessNav.map(({ label, icon: Icon, badge, active }) => (
                  <div
                    key={label}
                    className={`flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-colors ${active ? "bg-violet-600/20 text-violet-300" : "text-slate-400 hover:bg-slate-800"}`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span className="text-[12px] flex-1">{label}</span>
                    {badge && (
                      <span className="text-[9px] font-bold bg-amber-500 text-white rounded-full w-4 h-4 flex items-center justify-center">
                        {badge}
                      </span>
                    )}
                  </div>
                ))}
              </div>
              <div className="border-t border-slate-800 px-2 py-2 mx-1.5 mb-1.5">
                <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-slate-500 hover:bg-slate-800 cursor-pointer">
                  <MoreHorizontal className="w-3 h-3" />
                  <span className="text-[11px] flex-1">Advanced View</span>
                  <ChevronRight className="w-3 h-3" />
                </div>
              </div>
            </div>

            {/* Mode toggle concept */}
            <div className="mt-3 bg-violet-900/20 border border-violet-500/20 rounded-xl px-3 py-3">
              <p className="text-[11px] text-violet-300 font-medium mb-1">Mode toggle (footer)</p>
              <p className="text-[10px] text-slate-500 leading-relaxed">Persistent "Advanced View →" link in the sidebar footer lets business users escalate to the IT app when needed. No data loss, opens in new tab.</p>
            </div>
          </div>

          {/* Vocabulary map */}
          <div className="col-span-3">
            <h2 className="text-sm font-semibold text-white mb-3">Vocabulary Map</h2>
            <div className="space-y-2">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3">
                <div className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-2">Hidden from business users</div>
                <div className="flex flex-wrap gap-1">
                  {hiddenTerms.map((t) => (
                    <span key={t} className="text-[10px] px-2 py-0.5 bg-red-500/10 text-red-400 rounded-md line-through">{t}</span>
                  ))}
                </div>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3">
                <div className="text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-2">Renamed for clarity</div>
                <div className="space-y-1.5">
                  {renamedTerms.map(({ from, to }) => (
                    <div key={from} className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-500 line-through w-28 shrink-0">{from}</span>
                      <ChevronRight className="w-3 h-3 text-slate-700 shrink-0" />
                      <span className="text-[10px] text-emerald-400">{to}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Stat bar */}
        <div className="grid grid-cols-3 gap-4 pt-2">
          {[
            { label: "Nav items reduced", from: `${totalItems} items`, to: "4 items", pct: "87% reduction" },
            { label: "Technical terms hidden", from: "20+ shown", to: "0 shown", pct: "100% gone" },
            { label: "Terms renamed for business", from: "", to: "12 renamed", pct: "Plain English" },
          ].map(({ label, from, to, pct }) => (
            <div key={label} className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-center">
              <div className="text-sm font-semibold text-white mb-1">{pct}</div>
              <div className="text-[11px] text-slate-500">{label}</div>
              {from && <div className="text-[10px] text-slate-600 mt-1"><span className="line-through">{from}</span> → <span className="text-emerald-400">{to}</span></div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
