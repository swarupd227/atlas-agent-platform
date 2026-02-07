import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { Bell, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

function Router() {
  return (
    <Switch>
      <Route path="/" component={Overview} />
      <Route path="/outcomes" component={Outcomes} />
      <Route path="/outcomes/:id" component={OutcomeDetail} />
      <Route path="/agents" component={Agents} />
      <Route path="/agents/:id" component={AgentDetail} />
      <Route path="/deployments" component={Deployments} />
      <Route path="/monitor" component={Monitor} />
      <Route path="/governance" component={Governance} />
      <Route path="/approvals" component={Approvals} />
      <Route path="/billing" component={Billing} />
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
          <SidebarProvider style={style as React.CSSProperties}>
            <div className="flex h-screen w-full">
              <AppSidebar />
              <div className="flex flex-col flex-1 min-w-0">
                <header className="flex items-center justify-between gap-2 p-2 border-b shrink-0 h-12">
                  <div className="flex items-center gap-2">
                    <SidebarTrigger data-testid="button-sidebar-toggle" />
                  </div>
                  <div className="flex items-center gap-1">
                    <Badge variant="outline" className="text-[10px] mr-2">Production</Badge>
                    <Button variant="ghost" size="icon" data-testid="button-notifications">
                      <Bell className="w-4 h-4" />
                    </Button>
                    <ThemeToggle />
                  </div>
                </header>
                <ScrollArea className="flex-1">
                  <Router />
                </ScrollArea>
              </div>
            </div>
          </SidebarProvider>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
