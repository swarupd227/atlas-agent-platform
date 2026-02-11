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
  Wrench,
  Sparkles,
  FlaskConical,
  Plug,
  ShieldCheck,
  RotateCcw,
  PenTool,
  ScrollText,
  ShieldQuestion,
  Store,
  AppWindow,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { useRole } from "./role-provider";
import { useIndustry } from "./industry-provider";

export function AppSidebar() {
  const [location] = useLocation();
  const { role, isRouteAllowed } = useRole();
  const { term, industry } = useIndustry();

  const platformNav = [
    { title: "Overview", url: "/dashboard", icon: LayoutDashboard },
    { title: "Outcome Builder", url: "/outcomes/discover", icon: Sparkles },
    { title: term("outcomes"), url: "/outcomes", icon: Target },
    { title: term("agents"), url: "/agents", icon: Bot },
    { title: term("templates"), url: "/templates", icon: Library },
    { title: term("blueprints"), url: "/blueprints", icon: PenTool },
    { title: term("evaluations"), url: "/evals", icon: FlaskConical },
    { title: term("deployments"), url: "/deployments", icon: Rocket },
    { title: term("monitor"), url: "/monitor", icon: Activity },
  ];

  const opsNav = [
    { title: "Optimization", url: "/optimization", icon: Zap },
    { title: "Ops", url: "/improvements", icon: Wrench },
    { title: "Self-Heal", url: "/improvement-loop", icon: RotateCcw },
    { title: term("governance"), url: "/governance", icon: Shield },
    { title: "Audit Trail", url: "/audit-trail", icon: ScrollText },
    { title: term("approvals"), url: "/approvals", icon: CheckCircle },
    { title: "Approval Gates", url: "/approvals/gates", icon: ShieldQuestion },
    { title: term("billing"), url: "/billing", icon: CreditCard },
    { title: "MCP Apps", url: "/integrations/mcp-apps", icon: AppWindow },
    { title: "Marketplace", url: "/integrations/marketplace", icon: Store },
    { title: "Integrations", url: "/integrations", icon: Plug },
    { title: "Admin", url: "/admin", icon: ShieldCheck },
  ];

  const isActive = (url: string) => {
    if (url === "/dashboard") return location === "/dashboard";
    if (url === "/outcomes") return location === "/outcomes" || (location.startsWith("/outcomes/") && !location.startsWith("/outcomes/discover"));
    if (url === "/outcomes/discover") return location === "/outcomes/discover";
    return location.startsWith(url);
  };

  const filteredPlatformNav = platformNav.filter((item) => isRouteAllowed(item.url));
  const filteredOpsNav = opsNav.filter((item) => isRouteAllowed(item.url));

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
        {filteredPlatformNav.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Platform</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {filteredPlatformNav.map((item) => (
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
        {filteredOpsNav.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Operations</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {filteredOpsNav.map((item) => (
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
