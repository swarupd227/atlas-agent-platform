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
  Settings,
  Eye,
  Hammer,
  Brain,
  GitBranch,
  Network,
  Gauge,
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
import { Badge } from "@/components/ui/badge";
import { useRole } from "./role-provider";
import { useIndustry } from "./industry-provider";
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
  const { industry } = useIndustry();

  const coreNav: NavItem[] = [
    { title: "Overview", url: "/dashboard", icon: LayoutDashboard },
    { title: "Agents", url: "/agents", icon: Bot },
    { title: "Outcomes", url: "/outcomes", icon: Target },
  ];

  const navGroups: NavGroup[] = [
    {
      label: "Build",
      icon: Hammer,
      defaultOpen: true,
      items: [
        { title: "Blueprints", url: "/blueprints", icon: PenTool },
        { title: "Templates", url: "/templates", icon: Library },
        { title: "Skills", url: "/skills", icon: Layers },
        { title: "Context Studio", url: "/context-studio", icon: Brain },
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
        { title: "Golden Datasets", url: "/golden-datasets", icon: Database },
      ],
    },
    {
      label: "Deploy & Observe",
      icon: Eye,
      items: [
        { title: "Deployments", url: "/deployments", icon: Rocket },
        { title: "Monitor", url: "/monitor", icon: Activity },
        { title: "Optimization", url: "/optimization", icon: Zap },
      ],
    },
    {
      label: "Govern",
      icon: Shield,
      items: [
        { title: "Governance", url: "/governance", icon: Shield },
        { title: "Autonomy Engine", url: "/autonomy-engine", icon: Gauge },
        { title: "Approvals", url: "/approvals", icon: CheckCircle },
        { title: "Audit Trail", url: "/audit-trail", icon: ScrollText },
      ],
    },
    {
      label: "System",
      icon: Settings,
      items: [
        { title: "Integrations", url: "/integrations", icon: Plug },
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

  const filteredCoreNav = coreNav.filter((item) => isRouteAllowed(item.url));

  const filteredGroups = navGroups
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
              <span className="text-sm font-semibold text-sidebar-foreground" data-testid="text-app-name">ALMP</span>
              <span className="text-[10px] text-muted-foreground leading-tight">Agent Lifecycle Mgmt</span>
            </div>
          </div>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        {filteredCoreNav.length > 0 && (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {filteredCoreNav.map((item) => (
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

        {filteredGroups.map((group) => (
          <CollapsibleNavGroup
            key={group.label}
            group={group}
            isActive={isActive}
            isGroupActive={isGroupActive(group)}
          />
        ))}
      </SidebarContent>
      <SidebarFooter className="p-4 space-y-3">
        {industry && (
          <div className="flex items-center gap-2" data-testid="sidebar-industry-indicator">
            <div
              className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
              style={{ backgroundColor: industry.color + "20", color: industry.color }}
            >
              <industry.icon className="w-3.5 h-3.5" />
            </div>
            <span className="text-[10px] text-muted-foreground truncate">{industry.shortLabel}</span>
          </div>
        )}
        <div className="flex items-center gap-2" data-testid="sidebar-role-indicator">
          <div className="w-7 h-7 rounded-md bg-muted flex items-center justify-center">
            <span className="text-xs font-medium text-muted-foreground" data-testid="text-role-initials">{role.initials}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-medium text-sidebar-foreground" data-testid="text-role-name">{role.label}</span>
            <Badge variant="outline" className="text-[10px] w-fit" data-testid="badge-role-type">{role.shortLabel}</Badge>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
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
            className="flex items-center gap-2 w-full px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider hover-elevate rounded-md"
            data-testid={`button-group-${group.label.toLowerCase().replace(/\s+/g, "-")}`}
          >
            <group.icon className="w-3.5 h-3.5" />
            <span className="flex-1 text-left">{group.label}</span>
            <ChevronRight
              className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
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
