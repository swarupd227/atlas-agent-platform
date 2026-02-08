import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
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
  Search,
  Sparkles,
  RefreshCw,
} from "lucide-react";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [, navigate] = useLocation();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
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

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search..." data-testid="input-command-search" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Quick Actions">
          <CommandItem
            onSelect={() => runCommand(() => navigate("/agents/wizard"))}
            data-testid="command-create-agent"
          >
            <Plus className="mr-2 h-4 w-4" />
            <span>Create Agent</span>
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => navigate("/evals"))}
            data-testid="command-run-eval"
          >
            <FlaskConical className="mr-2 h-4 w-4" />
            <span>Run Eval</span>
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => navigate("/deployments"))}
            data-testid="command-rollback"
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            <span>Rollback</span>
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => navigate("/monitor"))}
            data-testid="command-open-incident"
          >
            <AlertTriangle className="mr-2 h-4 w-4" />
            <span>Open Incident</span>
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => navigate("/outcomes/discover"))}
            data-testid="command-discover-outcome"
          >
            <Sparkles className="mr-2 h-4 w-4" />
            <span>Discover Outcome</span>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Navigate">
          <CommandItem onSelect={() => runCommand(() => navigate("/"))} data-testid="command-nav-overview">
            <LayoutDashboard className="mr-2 h-4 w-4" />
            <span>Overview</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => navigate("/outcomes/discover"))} data-testid="command-nav-discover">
            <Sparkles className="mr-2 h-4 w-4" />
            <span>Discover</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => navigate("/outcomes"))} data-testid="command-nav-outcomes">
            <Target className="mr-2 h-4 w-4" />
            <span>Outcomes</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => navigate("/agents"))} data-testid="command-nav-agents">
            <Bot className="mr-2 h-4 w-4" />
            <span>Agents</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => navigate("/templates"))} data-testid="command-nav-templates">
            <Library className="mr-2 h-4 w-4" />
            <span>Templates</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => navigate("/evals"))} data-testid="command-nav-evals">
            <FlaskConical className="mr-2 h-4 w-4" />
            <span>Evals</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => navigate("/deployments"))} data-testid="command-nav-deployments">
            <Rocket className="mr-2 h-4 w-4" />
            <span>Deployments</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => navigate("/monitor"))} data-testid="command-nav-monitor">
            <Activity className="mr-2 h-4 w-4" />
            <span>Monitor</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => navigate("/improvements"))} data-testid="command-nav-ops">
            <Wrench className="mr-2 h-4 w-4" />
            <span>Ops</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => navigate("/improvement-loop"))} data-testid="command-nav-self-heal">
            <RefreshCw className="mr-2 h-4 w-4" />
            <span>Self-Heal Loop</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => navigate("/governance"))} data-testid="command-nav-governance">
            <Shield className="mr-2 h-4 w-4" />
            <span>Governance</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => navigate("/approvals"))} data-testid="command-nav-approvals">
            <CheckCircle className="mr-2 h-4 w-4" />
            <span>Approvals</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => navigate("/billing"))} data-testid="command-nav-billing">
            <CreditCard className="mr-2 h-4 w-4" />
            <span>Billing</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => navigate("/integrations"))} data-testid="command-nav-integrations">
            <Plug className="mr-2 h-4 w-4" />
            <span>Integrations</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => navigate("/admin"))} data-testid="command-nav-admin">
            <ShieldCheck className="mr-2 h-4 w-4" />
            <span>Admin</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
