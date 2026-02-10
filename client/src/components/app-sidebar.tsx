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

const platformNav = [
  { title: "Overview", url: "/", icon: LayoutDashboard },
  { title: "Discover", url: "/outcomes/discover", icon: Sparkles },
  { title: "Outcomes", url: "/outcomes", icon: Target },
  { title: "Agents", url: "/agents", icon: Bot },
  { title: "Templates", url: "/templates", icon: Library },
  { title: "Blueprints", url: "/blueprints", icon: PenTool },
  { title: "Evals", url: "/evals", icon: FlaskConical },
  { title: "Deployments", url: "/deployments", icon: Rocket },
  { title: "Monitor", url: "/monitor", icon: Activity },
];

const opsNav = [
  { title: "Optimization", url: "/optimization", icon: Zap },
  { title: "Ops", url: "/improvements", icon: Wrench },
  { title: "Self-Heal", url: "/improvement-loop", icon: RotateCcw },
  { title: "Governance", url: "/governance", icon: Shield },
  { title: "Audit Trail", url: "/audit-trail", icon: ScrollText },
  { title: "Approvals", url: "/approvals", icon: CheckCircle },
  { title: "Billing", url: "/billing", icon: CreditCard },
  { title: "Integrations", url: "/integrations", icon: Plug },
  { title: "Admin", url: "/admin", icon: ShieldCheck },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { role, isRouteAllowed } = useRole();

  const isActive = (url: string) => {
    if (url === "/") return location === "/";
    if (url === "/outcomes") return location === "/outcomes" || (location.startsWith("/outcomes/") && !location.startsWith("/outcomes/discover"));
    if (url === "/outcomes/discover") return location === "/outcomes/discover";
    return location.startsWith(url);
  };

  const filteredPlatformNav = platformNav.filter((item) => isRouteAllowed(item.url));
  const filteredOpsNav = opsNav.filter((item) => isRouteAllowed(item.url));

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <Link href="/">
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
      <SidebarFooter className="p-4">
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
