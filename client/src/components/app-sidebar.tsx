import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import {
  LayoutDashboard,
  Target,
  Bot,
  Rocket,
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
  Building2,
  MapPin,
  Mail,
  UserX,
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
import { type LucideIcon } from "lucide-react";

interface NavItem {
  title: string;
  url: string;
  icon: LucideIcon;
}

interface NavGroup {
  label: string;
  icon: LucideIcon;
  items: NavItem[];
  defaultOpen?: boolean;
}

export function AppSidebar() {
  const [location] = useLocation();
  const { role, isRouteAllowed } = useRole();

  const primaryNav: NavItem[] = [
    { title: "Overview", url: "/dashboard", icon: LayoutDashboard },
    { title: "Outcomes", url: "/outcomes", icon: Target },
    { title: "Agents", url: "/agents", icon: Bot },
    { title: "Knowledge", url: "/knowledge-bases", icon: BookOpen },
    { title: "Deployments", url: "/deployments", icon: Rocket },
    { title: "Monitor", url: "/monitor", icon: Activity },
    { title: "Governance", url: "/governance", icon: Shield },
    { title: "Integrations", url: "/integrations", icon: Plug },
  ];

  const advancedGroups: NavGroup[] = [
    {
      label: "Build",
      icon: Hammer,
      items: [
        { title: "Pipelines", url: "/pipelines", icon: Workflow },
        { title: "Blueprints", url: "/blueprints", icon: PenTool },
        { title: "Templates", url: "/templates", icon: Library },
        { title: "Skills", url: "/skills", icon: Layers },
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
        { title: "Evaluations", url: "/evals", icon: FlaskConical },
        { title: "Eval Datasets", url: "/golden-datasets", icon: Database },
      ],
    },
    {
      label: "Operate",
      icon: Eye,
      items: [
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
        { title: "Autonomy Engine", url: "/autonomy-engine", icon: Gauge },
        { title: "Oversight Console", url: "/oversight-console", icon: Scale },
        { title: "Approvals", url: "/approvals", icon: CheckCircle },
        { title: "Audit Trail", url: "/audit-trail", icon: ScrollText },
      ],
    },
    {
      label: "System",
      icon: Settings,
      items: [
        { title: "Model Providers", url: "/model-providers", icon: Cpu },
        { title: "Developer Portal", url: "/developer", icon: Code2 },
        { title: "Billing", url: "/billing", icon: CreditCard },
        { title: "Ontology", url: "/ontology", icon: BookOpen },
        { title: "Admin", url: "/admin", icon: ShieldCheck },
      ],
    },
  ];

  const isActive = (url: string) => {
    if (url === "/dashboard") return location === "/dashboard";
    if (url === "/outcomes") return location === "/outcomes" || location.startsWith("/outcomes/");
    if (url === "/agents") return location === "/agents" || location.startsWith("/agents/");
    if (url === "/governance") return location === "/governance" || location.startsWith("/governance/");
    if (url === "/skills") return location === "/skills" || location.startsWith("/skills/");
    if (url === "/approvals") return location === "/approvals" || location.startsWith("/approvals/");
    if (url === "/integrations") return location === "/integrations" || location.startsWith("/integrations/");
    if (url === "/optimization") return location === "/optimization" || location === "/improvements" || location === "/improvement-loop";
    return location.startsWith(url);
  };

  const isGroupActive = (group: NavGroup) => {
    return group.items.some((item) => isActive(item.url));
  };

  const isAnyAdvancedActive = advancedGroups.some((g) =>
    g.items.some((item) => isRouteAllowed(item.url) && isActive(item.url))
  );
  const [advancedManuallyOpened, setAdvancedManuallyOpened] = useState(false);

  const filteredPrimaryNav = primaryNav.filter((item) => isRouteAllowed(item.url));

  const filteredAdvancedGroups = advancedGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => isRouteAllowed(item.url)),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <Link href="/dashboard">
          <div className="flex items-center gap-2 cursor-pointer">
            <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary">
              <Zap className="w-4 h-4 text-primary-foreground" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-sidebar-foreground" data-testid="text-app-name">ATLAS</span>
              <span className="text-[10px] text-muted-foreground leading-tight">Nous Agent Orchestrator Platform</span>
            </div>
          </div>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        {filteredPrimaryNav.length > 0 && (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {filteredPrimaryNav.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild data-active={isActive(item.url)}>
                      <Link href={item.url} data-testid={`link-nav-${item.title.toLowerCase()}`}>
                        <item.icon className="w-4 h-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {filteredAdvancedGroups.length > 0 && (
          <AdvancedSection
            key={role.id}
            groups={filteredAdvancedGroups}
            isActive={isActive}
            isGroupActive={isGroupActive}
            defaultOpen={isAnyAdvancedActive}
            forceCollapsed={!advancedManuallyOpened && !isAnyAdvancedActive}
            onManualToggle={() => setAdvancedManuallyOpened(true)}
          />
        )}
        <SidebarGroup className="py-0">
          <Collapsible defaultOpen={location.startsWith("/demo/")}>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-2 w-full px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider hover:bg-sidebar-accent/50 rounded-md transition-colors"
                data-testid="button-demo-toggle"
              >
                <PlayCircle className="w-3.5 h-3.5" />
                <span className="flex-1 text-left">Demo</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild data-active={location === "/demo/blackrock"}>
                      <Link href="/demo/blackrock" data-testid="link-nav-blackrock-demo">
                        <Building2 className="w-4 h-4" />
                        <span>AIM - Synthetic Worker</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild data-active={location.startsWith("/demo/blackrock2")}>
                      <Link href="/demo/blackrock2" data-testid="link-nav-blackrock2-demo">
                        <UserX className="w-4 h-4" />
                        <span>AIM - Portal Offboarding</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild data-active={location.startsWith("/demo/kinective-coa")}>
                      <Link href="/demo/kinective-coa" data-testid="link-nav-kinective-demo">
                        <MapPin className="w-4 h-4" />
                        <span>Kinective - Change of Address</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild data-active={location.startsWith("/demo/moodys")}>
                      <Link href="/demo/moodys" data-testid="link-nav-moodys-demo">
                        <FileText className="w-4 h-4" />
                        <span>Credit Assessment Package</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild data-active={location.startsWith("/demo/hearst")}>
                      <Link href="/demo/hearst" data-testid="link-nav-hearst-demo">
                        <Mail className="w-4 h-4" />
                        <span>Hearst - NBA Email Orchestration</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </Collapsible>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter />
    </Sidebar>
  );
}

function AdvancedSection({
  groups,
  isActive,
  isGroupActive,
  defaultOpen,
  forceCollapsed,
  onManualToggle,
}: {
  groups: NavGroup[];
  isActive: (url: string) => boolean;
  isGroupActive: (group: NavGroup) => boolean;
  defaultOpen: boolean;
  forceCollapsed?: boolean;
  onManualToggle?: () => void;
}) {
  const [open, setOpen] = useState(forceCollapsed ? false : defaultOpen);

  useEffect(() => {
    if (defaultOpen && !forceCollapsed) setOpen(true);
  }, [defaultOpen, forceCollapsed]);

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (newOpen && onManualToggle) onManualToggle();
  };

  return (
    <Collapsible open={open} onOpenChange={handleOpenChange}>
      <SidebarGroup className="py-0">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-2 w-full px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider hover:bg-sidebar-accent/50 rounded-md transition-colors"
            data-testid="button-advanced-toggle"
          >
            <MoreHorizontal className="w-3.5 h-3.5" />
            <span className="flex-1 text-left">Advanced</span>
            <ChevronRight
              className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="flex flex-col gap-0.5 pl-1">
            {groups.map((group) => (
              <CollapsibleNavGroup
                key={group.label}
                group={group}
                isActive={isActive}
                isGroupActive={isGroupActive(group)}
              />
            ))}
          </div>
        </CollapsibleContent>
      </SidebarGroup>
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
      <SidebarGroup className="py-0">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-2 w-full px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-sidebar-accent/50 rounded-md transition-colors"
            data-testid={`button-group-${group.label.toLowerCase().replace(/\s+/g, "-")}`}
          >
            <group.icon className="w-3.5 h-3.5" />
            <span className="flex-1 text-left">{group.label}</span>
            <ChevronDown
              className={`w-3 h-3 transition-transform duration-200 ${open ? "" : "-rotate-90"}`}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarGroupContent>
            <SidebarMenu>
              {group.items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild data-active={isActive(item.url)}>
                    <Link href={item.url} data-testid={`link-nav-${item.title.toLowerCase()}`}>
                      <item.icon className="w-4 h-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );
}
