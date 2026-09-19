import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Target,
  Bot,
  Rocket,
  Compass,
  Activity,
  Shield,
  CreditCard,
  CheckCircle,
  CheckCircle2,
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
  ChevronRight,
  ChevronDown,
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
  MoreHorizontal,
  Cpu,
  Code2,
  PlayCircle,
  MonitorCheck,
  Home,
  ListChecks,
  Radio,
  ShieldAlert,
  PenLine,
  ClipboardList,
  Store,
  Sparkles,
  Users,
  MessageSquareText,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useRole } from "./role-provider";
import { useAstraEnabled } from "@/astra/api";
import { type LucideIcon } from "lucide-react";
import { FeedbackTrigger } from "./feedback-modal";
import type { Agent, OutcomeContract } from "@shared/schema";

interface NavItem {
  title: string;
  url: string;
  icon: LucideIcon;
  badge?: number;
  /** Suffix for data-testid when the title changed but tests still use the old name. */
  testId?: string;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

interface NavGroup {
  label: string;
  icon: LucideIcon;
  items: NavItem[];
  defaultOpen?: boolean;
}

export function AppSidebar() {
  const { isBusinessMode } = useRole();
  if (isBusinessMode) return <BusinessModeSidebar />;
  return <FullAppSidebar />;
}

// The builder sidebar: a short, task-shaped nav (Work / Build / Review) with
// everything else one click away under "All tools". Every route stays
// reachable and filtered by isRouteAllowed; only the grouping changed.
function FullAppSidebar() {
  const [location] = useLocation();
  const { role, isRouteAllowed } = useRole();
  const { enabled: astraEnabled, isLoading: astraLoading } = useAstraEnabled();

  const { data: alertsData } = useQuery<any[]>({
    queryKey: ["/api/observability/alerts"],
    refetchInterval: 60000,
    staleTime: 30000,
  });
  const unacknowledgedAlerts = Array.isArray(alertsData)
    ? alertsData.filter((a: any) => !a.acknowledgedAt).length
    : 0;

  const { data: approvalsData } = useQuery<any[]>({
    queryKey: ["/api/approvals", "pending"],
    queryFn: () => fetch("/api/approvals?status=pending").then((r) => r.json()),
    refetchInterval: 60000,
    staleTime: 30000,
  });
  const pendingApprovalsCount = Array.isArray(approvalsData) ? approvalsData.length : 0;

  // The pages people use every day, grouped by what they are doing.
  const sections: NavSection[] = [
    {
      label: "",
      items: [
        { title: "Home", url: "/dashboard", icon: Home, testId: "overview" },
        { title: "Workspace", url: "/workspace", icon: Sparkles },
      ],
    },
    {
      label: "Work",
      items: [
        { title: "Journeys", url: "/journeys", icon: Compass },
        { title: "Teams", url: "/agents/teams", icon: Users },
        { title: "Agents", url: "/agents", icon: Bot },
        { title: "Outcomes", url: "/outcomes", icon: Target },
      ],
    },
    {
      label: "Build",
      items: [
        { title: "Process Flows", url: "/process-flows", icon: Workflow },
        { title: "Skills", url: "/skills", icon: Layers },
        { title: "Knowledge", url: "/knowledge-bases", icon: BookOpen },
        { title: "Ontology", url: "/ontology", icon: Network },
        { title: "Connections", url: "/integrations", icon: Plug, testId: "integrations" },
      ],
    },
    {
      label: "Review",
      items: [
        { title: "Approvals", url: "/approvals", icon: ShieldCheck, badge: pendingApprovalsCount || undefined },
        { title: "Monitor", url: "/monitor", icon: Activity },
        { title: "Fleet health", url: "/observability", icon: MonitorCheck, badge: unacknowledgedAlerts || undefined, testId: "fleet-health" },
        { title: "Audit trail", url: "/audit-trail", icon: ScrollText, testId: "audit-trail" },
      ],
    },
  ];

  // Everything else, still grouped the way it was, behind one toggle.
  const toolGroups: NavGroup[] = [
    {
      label: "Content",
      icon: FileText,
      items: [{ title: "Files", url: "/files", icon: FileText }],
    },
    {
      label: "Build",
      icon: Hammer,
      items: [
        { title: "Pipelines", url: "/pipelines", icon: Workflow },
        { title: "Blueprints", url: "/blueprints", icon: PenTool },
        { title: "Templates", url: "/templates", icon: Library },
        { title: "Context Engine", url: "/context-studio", icon: Brain },
        { title: "Memory Manager", url: "/memory-architecture", icon: Database },
        { title: "RAG Pipeline", url: "/rag-pipeline", icon: GitBranch },
        { title: "Knowledge Graph", url: "/knowledge-graph", icon: Network },
      ],
    },
    {
      label: "Evaluate",
      icon: FlaskConical,
      items: [
        { title: "Eval Studio", url: "/evals", icon: FlaskConical },
        { title: "Metric Library", url: "/evals/metrics", icon: ListChecks },
        { title: "Datasets", url: "/evals/datasets", icon: Database },
        { title: "Runs", url: "/evals/runs", icon: PlayCircle },
        { title: "Prod Monitor", url: "/evals/monitor", icon: Radio },
        { title: "Red Team", url: "/evals/redteam", icon: ShieldAlert },
        { title: "Annotate", url: "/evals/annotate", icon: PenLine },
        { title: "Reports", url: "/evals/reports", icon: ClipboardList },
        { title: "Prompts", url: "/evals/prompts", icon: GitBranch },
        { title: "Marketplace", url: "/evals/marketplace", icon: Store },
      ],
    },
    {
      label: "Operate",
      icon: Eye,
      items: [
        { title: "Deployments", url: "/deployments", icon: Rocket },
        { title: "Shadow Replay", url: "/shadow-replay", icon: GitCompare },
        { title: "Canary Deployment", url: "/canary-deployment", icon: GitBranch },
        { title: "Optimization", url: "/optimization", icon: Zap },
        { title: "Healing Center", url: "/healing-operations", icon: HeartPulse },
        { title: "Runbooks", url: "/runbook-automation", icon: FileText },
      ],
    },
    {
      label: "Govern",
      icon: Scale,
      items: [
        { title: "Governance", url: "/governance", icon: Shield },
        { title: "Autonomy Engine", url: "/autonomy-engine", icon: Gauge },
        { title: "Oversight Console", url: "/oversight-console", icon: Scale },
      ],
    },
    {
      label: "System",
      icon: Settings,
      items: [
        { title: "Model Providers", url: "/model-providers", icon: Cpu },
        { title: "Developer Portal", url: "/developer", icon: Code2 },
        { title: "Billing", url: "/billing", icon: CreditCard },
        { title: "Admin", url: "/admin", icon: ShieldCheck },
        { title: "Demo Center", url: "/demo", icon: PlayCircle, testId: "demo-center" },
      ],
    },
  ];

  const isActive = (url: string) => {
    if (url === "/dashboard") return location === "/dashboard";
    if (url === "/evals") return location === "/evals";
    if (url === "/outcomes") return location === "/outcomes" || location.startsWith("/outcomes/");
    if (url === "/agents/teams") return location === "/agents/teams" || location.startsWith("/agents/teams/");
    if (url === "/agents") return (location === "/agents" || location.startsWith("/agents/")) && !location.startsWith("/agents/teams");
    if (url === "/governance") return location === "/governance" || location.startsWith("/governance/");
    if (url === "/skills") return location === "/skills" || location.startsWith("/skills/");
    if (url === "/approvals") return location === "/approvals" || location.startsWith("/approvals/");
    if (url === "/integrations") return location === "/integrations" || location.startsWith("/integrations/");
    if (url === "/optimization") return location === "/optimization" || location === "/improvements" || location === "/improvement-loop";
    return location.startsWith(url);
  };

  const visibleSections = sections
    .map((s) => ({ ...s, items: s.items.filter((item) => isRouteAllowed(item.url)) }))
    .filter((s) => s.items.length > 0);
  const visibleToolGroups = toolGroups
    .map((g) => ({ ...g, items: g.items.filter((item) => isRouteAllowed(item.url)) }))
    .filter((g) => g.items.length > 0);
  const isAnyToolActive = visibleToolGroups.some((g) => g.items.some((item) => isActive(item.url)));

  return (
    <Sidebar className="astra-scope">
      <div className="astra-scope flex h-full min-h-0 flex-col bg-sidebar font-sans text-sidebar-foreground">
        <SidebarHeader className="gap-3 px-3 pb-2 pt-3.5">
          <Link href="/dashboard" className="flex items-center gap-2.5 rounded-md px-1">
            <span className="grid h-7 w-7 place-items-center rounded-[7px] bg-primary font-[family-name:var(--astra-display)] text-[15px] font-bold text-primary-foreground">A</span>
            <span className="flex flex-col leading-tight">
              <span className="font-[family-name:var(--astra-display)] text-[15px] font-semibold" data-testid="text-app-name">Astra Agents</span>
              <span className="font-mono text-[11px] text-muted-foreground">Agents platform</span>
            </span>
          </Link>
          {/* Hold the button's space while the flag loads, so the menu below never jumps. */}
          {astraLoading && <div className="h-9" aria-hidden="true" />}
          {astraEnabled && isRouteAllowed("/astra") && (
            <Link
              href="/astra"
              className="flex items-center gap-2 rounded-[9px] bg-foreground px-3 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
              data-testid="link-nav-ask-astra"
            >
              <MessageSquareText className="h-4 w-4" />
              Ask Astra
            </Link>
          )}
        </SidebarHeader>

        <SidebarContent className="gap-0 px-2 pb-3">
          {visibleSections.map((section) => (
            <SidebarGroup key={section.label || "home"} className="px-0 py-0">
              {section.label && <p className="px-2.5 pb-1 pt-3 font-mono text-[10.5px] font-medium uppercase tracking-[0.1em] text-muted-foreground">{section.label}</p>}
              <SidebarGroupContent>
                <SidebarMenu className="gap-px">
                  {section.items.map((item) => (
                    <NavLink key={item.url} item={item} active={isActive(item.url)} />
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}

          {visibleToolGroups.length > 0 && (
            <AllToolsSection
              key={role.id}
              groups={visibleToolGroups}
              isActive={isActive}
              defaultOpen={isAnyToolActive}
            />
          )}
        </SidebarContent>

        <SidebarFooter className="border-t px-2 pb-3 pt-1">
          <FeedbackTrigger />
        </SidebarFooter>
      </div>
    </Sidebar>
  );
}

const navTestId = (item: NavItem) => `link-nav-${item.testId ?? item.title.toLowerCase().replace(/\s+/g, "-")}`;

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        data-active={active}
        className="h-8 gap-2.5 rounded-[7px] px-2.5 text-[13.5px] hover:bg-sidebar-accent data-[active=true]:bg-card data-[active=true]:shadow-[0_0_0_1px_hsl(var(--border))] [&>svg]:text-muted-foreground data-[active=true]:[&>svg]:text-foreground"
      >
        <Link href={item.url} data-testid={navTestId(item)}>
          <item.icon className="h-4 w-4" />
          <span className="flex-1">{item.title}</span>
          {item.badge !== undefined && (
            <span
              className="ml-auto min-w-[18px] rounded-full bg-primary px-1.5 text-center font-mono text-[11px] font-medium leading-[18px] text-primary-foreground"
              data-testid={`badge-${item.title.toLowerCase().replace(/\s+/g, "-")}-count`}
            >
              {item.badge > 99 ? "99+" : item.badge}
            </span>
          )}
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function AllToolsSection({
  groups,
  isActive,
  defaultOpen,
}: {
  groups: NavGroup[];
  isActive: (url: string) => boolean;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    if (defaultOpen) setOpen(true);
  }, [defaultOpen]);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mt-3">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-[7px] px-2.5 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-sidebar-accent"
          data-testid="button-advanced-toggle"
          aria-label="All tools"
        >
          <MoreHorizontal className="h-4 w-4" />
          <span className="flex-1 text-left">All tools</span>
          <ChevronRight className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? "rotate-90" : ""}`} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="flex flex-col gap-0.5 pt-1">
          {groups.map((group) => (
            <CollapsibleNavGroup
              key={group.label}
              group={group}
              isActive={isActive}
              isGroupActive={group.items.some((item) => isActive(item.url))}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function CollapsibleNavGroup({
  group,
  isActive,
  isGroupActive,
}: {
  group: NavGroup;
  isActive: (url: string) => boolean;
  isGroupActive: boolean;
}) {
  const [open, setOpen] = useState(group.defaultOpen || isGroupActive);

  useEffect(() => {
    if (isGroupActive) {
      setOpen(true);
    }
  }, [isGroupActive]);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <SidebarGroup className="px-0 py-0">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-[7px] px-2.5 py-1 font-mono text-[10.5px] font-medium uppercase tracking-[0.1em] text-muted-foreground transition-colors hover:bg-sidebar-accent"
            data-testid={`button-group-${group.label.toLowerCase().replace(/\s+/g, "-")}`}
          >
            <span className="flex-1 text-left">{group.label}</span>
            <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${open ? "" : "-rotate-90"}`} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarGroupContent>
            <SidebarMenu className="gap-px">
              {group.items.map((item) => (
                <NavLink key={item.url} item={item} active={isActive(item.url)} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );
}

interface MyActionsBadge {
  needsDecisionCount: number;
}

function BusinessModeSidebar() {
  const [location] = useLocation();
  const { setRole } = useRole();

  const { data: myActionsData } = useQuery<MyActionsBadge>({
    queryKey: ["/api/my-actions"],
    refetchInterval: 60000,
    staleTime: 30000,
  });
  const pendingActions = myActionsData?.needsDecisionCount ?? 0;

  const isActive = (url: string) => {
    if (url === "/dashboard") return location === "/dashboard";
    if (url === "/actions") return location === "/actions" || location === "/my-actions";
    return location.startsWith(url);
  };

  const { data: workersData } = useQuery<Agent[]>({
    queryKey: ["/api/agents"],
    refetchInterval: 30000,
    staleTime: 20000,
  });
  const { data: workersOutcomesData } = useQuery<OutcomeContract[]>({
    queryKey: ["/api/outcomes"],
    staleTime: 60000,
  });
  const outcomeIdSet = new Set((workersOutcomesData || []).map((o) => o.id));
  const runningWorkersCount = Array.isArray(workersData)
    ? workersData.filter(
        (a) =>
          (a.status === "deployed" || a.status === "active") &&
          !!a.outcomeId &&
          outcomeIdSet.has(a.outcomeId)
      ).length
    : 0;

  const navItems = [
    { title: "Home", url: "/dashboard", icon: Home },
    { title: "Workspace", url: "/workspace", icon: Sparkles },
    { title: "Outcomes", url: "/outcomes", icon: Target },
    { title: "My Workers", url: "/my-workers", icon: Bot, badge: runningWorkersCount > 0 ? runningWorkersCount : undefined },
    { title: "Process Flows", url: "/process-flows", icon: Workflow },
    { title: "My Actions", url: "/actions", icon: CheckCircle2, badge: pendingActions > 0 ? pendingActions : undefined },
    { title: "Settings", url: "/business-settings", icon: Settings },
  ];

  return (
    <Sidebar className="astra-scope">
      <div className="astra-scope flex h-full min-h-0 flex-col bg-sidebar font-sans text-sidebar-foreground">
      <SidebarHeader className="px-3 pb-2 pt-3.5">
        <Link href="/dashboard" className="flex items-center gap-2.5 rounded-md px-1">
          <span className="grid h-7 w-7 place-items-center rounded-[7px] bg-primary font-[family-name:var(--astra-display)] text-[15px] font-bold text-primary-foreground">A</span>
          {/* One brand everywhere (UX audit F-3): business mode must not introduce a second name. */}
          <span className="flex flex-col leading-tight">
            <span className="font-[family-name:var(--astra-display)] text-[15px] font-semibold" data-testid="text-app-name-business">Astra Agents</span>
            <span className="font-mono text-[11px] text-muted-foreground">Business</span>
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup className="px-2">
          <SidebarGroupContent>
            <SidebarMenu className="gap-px">
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    data-active={isActive(item.url)}
                    className="h-8 gap-2.5 rounded-[7px] px-2.5 text-[13.5px] hover:bg-sidebar-accent data-[active=true]:bg-card data-[active=true]:shadow-[0_0_0_1px_hsl(var(--border))] [&>svg]:text-muted-foreground data-[active=true]:[&>svg]:text-foreground"
                  >
                    <Link href={item.url} data-testid={`link-business-nav-${item.title.toLowerCase().replace(/\s+/g, "-")}`}>
                      <item.icon className="w-4 h-4" />
                      <span className="flex-1">{item.title}</span>
                      {item.badge !== undefined && (
                        <span
                          className="ml-auto min-w-[18px] rounded-full bg-primary px-1.5 text-center font-mono text-[11px] font-medium leading-[18px] text-primary-foreground"
                          data-testid={`badge-${item.title.toLowerCase().replace(/\s+/g, "-")}-count`}
                        >
                          {item.badge > 99 ? "99+" : item.badge}
                        </span>
                      )}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="pb-3 pt-1 px-2 border-t mt-1">
        <div className="flex flex-col gap-0.5">
          <p className="px-3 py-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Switch Mode</p>
          <button
            type="button"
            onClick={() => setRole("ops_sre")}
            className="flex items-center gap-2 w-full px-3 py-2 text-xs text-muted-foreground hover:bg-sidebar-accent/50 rounded-md transition-colors"
            data-testid="button-switch-operator-mode"
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Operator View</span>
            <ChevronRight className="w-3.5 h-3.5 ml-auto" />
          </button>
          <button
            type="button"
            onClick={() => setRole("agent_engineer")}
            className="flex items-center gap-2 w-full px-3 py-2 text-xs text-muted-foreground hover:bg-sidebar-accent/50 rounded-md transition-colors"
            data-testid="button-switch-builder-mode"
          >
            <MoreHorizontal className="w-3.5 h-3.5" />
            <span>Builder / IT View</span>
            <ChevronRight className="w-3.5 h-3.5 ml-auto" />
          </button>
        </div>
      </SidebarFooter>
      </div>
    </Sidebar>
  );
}
