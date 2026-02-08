import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { RoleProvider } from "@/components/role-provider";
import { RoleSwitcher } from "@/components/role-switcher";
import { CommandPalette } from "@/components/command-palette";
import { GlobalSearch } from "@/components/global-search";
import { EnvironmentSelector } from "@/components/environment-selector";
import { NotificationCenter } from "@/components/notification-center";
import { ScrollArea } from "@/components/ui/scroll-area";
import NotFound from "@/pages/not-found";
import Overview from "@/pages/overview";
import Outcomes from "@/pages/outcomes";
import Agents from "@/pages/agents";
import AgentDetail from "@/pages/agent-detail";
import Deployments from "@/pages/deployments";
import Monitor from "@/pages/monitor";
import Governance from "@/pages/governance";
import Approvals from "@/pages/approvals";
import Billing from "@/pages/billing";
import OutcomeDetail from "@/pages/outcome-detail";
import ReleaseDetail from "@/pages/release-detail";
import TraceDetail from "@/pages/trace-detail";
import AgentWizard from "@/pages/agent-wizard";
import EvalDetail from "@/pages/eval-detail";
import Evals from "@/pages/evals";
import Templates from "@/pages/templates";
import TemplateDetail from "@/pages/template-detail";
import Improvements from "@/pages/improvements";
import OutcomeDiscover from "@/pages/outcome-discover";
import Integrations from "@/pages/integrations";
import Admin from "@/pages/admin";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Overview} />
      <Route path="/outcomes" component={Outcomes} />
      <Route path="/outcomes/discover" component={OutcomeDiscover} />
      <Route path="/outcomes/:id" component={OutcomeDetail} />
      <Route path="/agents" component={Agents} />
      <Route path="/templates" component={Templates} />
      <Route path="/templates/:id" component={TemplateDetail} />
      <Route path="/agents/wizard" component={AgentWizard} />
      <Route path="/agents/:id" component={AgentDetail} />
      <Route path="/evals" component={Evals} />
      <Route path="/evals/:id" component={EvalDetail} />
      <Route path="/deployments" component={Deployments} />
      <Route path="/deployments/:id" component={ReleaseDetail} />
      <Route path="/traces/:id" component={TraceDetail} />
      <Route path="/monitor" component={Monitor} />
      <Route path="/governance" component={Governance} />
      <Route path="/approvals" component={Approvals} />
      <Route path="/improvements" component={Improvements} />
      <Route path="/billing" component={Billing} />
      <Route path="/integrations" component={Integrations} />
      <Route path="/admin" component={Admin} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const style = {
    "--sidebar-width": "15rem",
    "--sidebar-width-icon": "3.5rem",
  };

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <RoleProvider>
            <SidebarProvider style={style as React.CSSProperties}>
              <div className="flex h-screen w-full">
                <AppSidebar />
                <div className="flex flex-col flex-1 min-w-0">
                  <header className="flex items-center justify-between gap-2 p-2 border-b shrink-0 h-12">
                    <div className="flex items-center gap-2 flex-wrap">
                      <SidebarTrigger data-testid="button-sidebar-toggle" />
                      <GlobalSearch />
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <EnvironmentSelector />
                      <RoleSwitcher />
                      <NotificationCenter />
                      <ThemeToggle />
                    </div>
                  </header>
                  <ScrollArea className="flex-1">
                    <Router />
                  </ScrollArea>
                </div>
              </div>
            </SidebarProvider>
            <CommandPalette />
            <Toaster />
          </RoleProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
