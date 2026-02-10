import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useRole } from "@/components/role-provider";
import type { PermissionAction } from "@/components/role-provider";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import {
  Bot,
  FlaskConical,
  RotateCcw,
  AlertTriangle,
  Target,
  LayoutDashboard,
  Rocket,
  Activity,
  Shield,
  CreditCard,
  CheckCircle,
  Plug,
  ShieldCheck,
  Library,
  Wrench,
  Plus,
  Sparkles,
  RefreshCw,
  Play,
  Download,
  Zap,
  FileText,
} from "lucide-react";

interface CommandAction {
  label: string;
  icon: typeof Bot;
  action: () => void;
  permission?: PermissionAction;
  route?: string;
  shortcut?: string;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [, navigate] = useLocation();
  const { canPerform, isRouteAllowed } = useRole();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey) && e.shiftKey) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const runCommand = useCallback(
    (command: () => void) => {
      setOpen(false);
      command();
    },
    []
  );

  const quickActions: CommandAction[] = [
    {
      label: "Create Agent",
      icon: Plus,
      action: () => navigate("/agents/wizard"),
      permission: "create_modify_blueprints",
      route: "/agents",
    },
    {
      label: "Create Outcome",
      icon: Target,
      action: () => navigate("/outcomes/discover"),
      permission: "create_modify_outcomes",
      route: "/outcomes",
    },
    {
      label: "Run Eval",
      icon: FlaskConical,
      action: () => navigate("/evals"),
      permission: "view_traces",
      route: "/evals",
    },
    {
      label: "Start Shadow Replay",
      icon: Play,
      action: () => navigate("/agents"),
      permission: "deploy_staging_pilot",
      route: "/agents",
    },
    {
      label: "Rollback",
      icon: RotateCcw,
      action: () => navigate("/deployments"),
      permission: "deploy_staging_pilot",
      route: "/deployments",
    },
    {
      label: "Export Audit Bundle",
      icon: Download,
      action: () => navigate("/governance"),
      permission: "export_audit_bundle",
      route: "/governance",
    },
    {
      label: "Open Incident",
      icon: AlertTriangle,
      action: () => navigate("/monitor"),
      route: "/monitor",
    },
    {
      label: "Discover Outcome",
      icon: Sparkles,
      action: () => navigate("/outcomes/discover"),
      permission: "create_modify_outcomes",
      route: "/outcomes/discover",
    },
    {
      label: "Generate Patches",
      icon: Zap,
      action: () => navigate("/improvements"),
      permission: "create_modify_blueprints",
      route: "/improvements",
    },
  ];

  const navigationItems = [
    { label: "Overview", icon: LayoutDashboard, route: "/" },
    { label: "Discover", icon: Sparkles, route: "/outcomes/discover" },
    { label: "Outcomes", icon: Target, route: "/outcomes" },
    { label: "Agents", icon: Bot, route: "/agents" },
    { label: "Templates", icon: Library, route: "/templates" },
    { label: "Evals", icon: FlaskConical, route: "/evals" },
    { label: "Deployments", icon: Rocket, route: "/deployments" },
    { label: "Monitor", icon: Activity, route: "/monitor" },
    { label: "Optimization", icon: Wrench, route: "/improvements" },
    { label: "Self-Heal Loop", icon: RefreshCw, route: "/improvement-loop" },
    { label: "Governance", icon: Shield, route: "/governance" },
    { label: "Approvals", icon: CheckCircle, route: "/approvals" },
    { label: "Billing", icon: CreditCard, route: "/billing" },
    { label: "Integrations", icon: Plug, route: "/integrations" },
    { label: "Admin", icon: ShieldCheck, route: "/admin" },
  ];

  const filteredActions = quickActions.filter((a) => {
    if (a.permission && !canPerform(a.permission)) return false;
    if (a.route && !isRouteAllowed(a.route)) return false;
    return true;
  });

  const filteredNav = navigationItems.filter((n) => isRouteAllowed(n.route));

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search..." data-testid="input-command-palette" />
      <CommandList>
        <CommandEmpty>No matching commands.</CommandEmpty>
        {filteredActions.length > 0 && (
          <CommandGroup heading="Quick Actions">
            {filteredActions.map((a) => (
              <CommandItem
                key={a.label}
                onSelect={() => runCommand(a.action)}
                data-testid={`command-${a.label.toLowerCase().replace(/\s+/g, "-")}`}
              >
                <a.icon className="mr-2 h-4 w-4" />
                <span>{a.label}</span>
                {a.shortcut && <CommandShortcut>{a.shortcut}</CommandShortcut>}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        <CommandSeparator />
        <CommandGroup heading="Navigate">
          {filteredNav.map((n) => (
            <CommandItem
              key={n.route}
              onSelect={() => runCommand(() => navigate(n.route))}
              data-testid={`command-nav-${n.label.toLowerCase().replace(/\s+/g, "-")}`}
            >
              <n.icon className="mr-2 h-4 w-4" />
              <span>{n.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
