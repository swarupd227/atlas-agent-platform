import { Switch, Route, useLocation } from "wouter";
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
import { EnvironmentSelector, EnvironmentProvider } from "@/components/environment-selector";
import { NotificationCenter } from "@/components/notification-center";
import { EvidenceDrawerProvider } from "@/components/evidence-drawer";
import { IndustryProvider } from "@/components/industry-provider";
import { IndustryWorkspaceSelector } from "@/components/industry-workspace-selector";
import { IndustrySelector } from "@/components/industry-selector";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AuthProvider, useAuth } from "@/components/auth-provider";
import LoginPage from "@/pages/login";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
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
import ImprovementLoop from "@/pages/improvement-loop";
import OutcomeDiscover from "@/pages/outcome-discover";
import Integrations from "@/pages/integrations";
import Admin from "@/pages/admin";
import Optimization from "@/pages/optimization";
import ApprovalDetail from "@/pages/approval-detail";
import Blueprints from "@/pages/blueprints";
import BlueprintDetail from "@/pages/blueprint-detail";
import ShadowReplay from "@/pages/shadow-replay";
import CanaryDeployment from "@/pages/canary-deployment";
import HealingOperations from "@/pages/healing-operations";
import RunbookAutomation from "@/pages/runbook-automation";
import AuditTrail from "@/pages/audit-trail";
import RunDetail from "@/pages/run-detail";
import McpServers from "@/pages/mcp-servers";
import McpServerDetail from "@/pages/mcp-server-detail";
import ToolCatalog from "@/pages/tool-catalog";
import ToolDetail from "@/pages/tool-detail";
import McpResources from "@/pages/mcp-resources";
import McpResourceDetail from "@/pages/mcp-resource-detail";
import McpPrompts from "@/pages/mcp-prompts";
import McpPromptDetail from "@/pages/mcp-prompt-detail";
import RemoteAgents from "@/pages/remote-agents";
import AgentTeams from "@/pages/agent-teams";
import ApprovalGates from "@/pages/approval-gates";
import Marketplace from "@/pages/marketplace";
import MarketplaceDetail from "@/pages/marketplace-detail";
import MarketplacePublishers from "@/pages/marketplace-publishers";
import McpApps from "@/pages/mcp-apps";
import OntologyExplorer from "@/pages/ontology";
import PolicyEngine from "@/pages/policy-engine";
import SkillCatalog from "@/pages/skills";
import SkillStudio from "@/pages/skill-studio";
import SkillComposer from "@/pages/skill-composer";
import GoldenDatasets from "@/pages/golden-datasets";
import GoldenDatasetDetail from "@/pages/golden-dataset-detail";
import ContextStudio from "@/pages/context-studio";
import MemoryArchitecture from "@/pages/memory-architecture";
import RagPipeline from "@/pages/rag-pipeline";
import KnowledgeGraph from "@/pages/knowledge-graph";
import AutonomyEngine from "@/pages/autonomy-engine";
import OversightConsole from "@/pages/oversight-console";
import AgentPlayground from "@/pages/agent-playground";
import Pipelines from "@/pages/pipelines";
import KnowledgeBasesPage from "@/pages/knowledge-bases";
import KnowledgeBaseDetail from "@/pages/knowledge-base-detail";
import ModelProviders from "@/pages/model-providers";
import { Shield, LogOut } from "lucide-react";

function HeaderControls() {
  const { securityMode, user, logout } = useAuth();

  if (securityMode === "production") {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <IndustrySelector />
        <EnvironmentSelector />
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded-md border" data-testid="badge-security-mode">
          <Shield className="h-3 w-3" />
          Production
        </span>
        <NotificationCenter />
        <span className="text-xs text-muted-foreground" data-testid="text-current-user">{user?.username} ({user?.role})</span>
        <button
          onClick={logout}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive px-2 py-1 rounded-md border hover:border-destructive/50 transition-colors"
          data-testid="button-logout"
        >
          <LogOut className="h-3 w-3" />
          Logout
        </button>
        <ThemeToggle />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <IndustrySelector />
      <EnvironmentSelector />
      <RoleSwitcher />
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded-md border" data-testid="badge-security-mode">
        <Shield className="h-3 w-3" />
        Demo
      </span>
      <NotificationCenter />
      <ThemeToggle />
    </div>
  );
}

function DashboardRouter() {
  return (
    <Switch>
      <Route path="/dashboard" component={Overview} />
      <Route path="/outcomes" component={Outcomes} />
      <Route path="/outcomes/discover" component={OutcomeDiscover} />
      <Route path="/outcomes/:id" component={OutcomeDetail} />
      <Route path="/agents" component={Agents} />
      <Route path="/templates" component={Templates} />
      <Route path="/templates/:id" component={TemplateDetail} />
      <Route path="/agents/wizard" component={AgentWizard} />
      <Route path="/agents/teams" component={AgentTeams} />
      <Route path="/agents/remote" component={RemoteAgents} />
      <Route path="/agents/:id/playground" component={AgentPlayground} />
      <Route path="/agents/:id" component={AgentDetail} />
      <Route path="/blueprints" component={Blueprints} />
      <Route path="/blueprints/:id" component={BlueprintDetail} />
      <Route path="/evals" component={Evals} />
      <Route path="/evals/replay" component={ShadowReplay} />
      <Route path="/evals/:id" component={EvalDetail} />
      <Route path="/golden-datasets/:id" component={GoldenDatasetDetail} />
      <Route path="/golden-datasets" component={GoldenDatasets} />
      <Route path="/deployments" component={Deployments} />
      <Route path="/deployments/:id" component={ReleaseDetail} />
      <Route path="/traces/:id" component={TraceDetail} />
      <Route path="/runtime/runs/:id" component={RunDetail} />
      <Route path="/monitor" component={Monitor} />
      <Route path="/governance/policy-engine" component={PolicyEngine} />
      <Route path="/governance" component={Governance} />
      <Route path="/audit-trail" component={AuditTrail} />
      <Route path="/approvals/gates" component={ApprovalGates} />
      <Route path="/approvals" component={Approvals} />
      <Route path="/approvals/:id" component={ApprovalDetail} />
      <Route path="/improvements" component={Improvements} />
      <Route path="/improvement-loop" component={ImprovementLoop} />
      <Route path="/optimization" component={Optimization} />
      <Route path="/billing" component={Billing} />
      <Route path="/integrations/mcp-prompts/:id" component={McpPromptDetail} />
      <Route path="/integrations/mcp-prompts" component={McpPrompts} />
      <Route path="/integrations/mcp-resources/:id" component={McpResourceDetail} />
      <Route path="/integrations/mcp-resources" component={McpResources} />
      <Route path="/integrations/tool-catalog/:id" component={ToolDetail} />
      <Route path="/integrations/tool-catalog" component={ToolCatalog} />
      <Route path="/integrations/marketplace/publishers" component={MarketplacePublishers} />
      <Route path="/integrations/marketplace/:id" component={MarketplaceDetail} />
      <Route path="/integrations/marketplace" component={Marketplace} />
      <Route path="/integrations/mcp-servers/:id" component={McpServerDetail} />
      <Route path="/integrations/mcp-apps" component={McpApps} />
      <Route path="/integrations/mcp-servers" component={McpServers} />
      <Route path="/integrations" component={Integrations} />
      <Route path="/skills/composer/:id" component={SkillComposer} />
      <Route path="/skills/composer" component={SkillComposer} />
      <Route path="/skills/studio/:id" component={SkillStudio} />
      <Route path="/skills/studio" component={SkillStudio} />
      <Route path="/skills" component={SkillCatalog} />
      <Route path="/ontology" component={OntologyExplorer} />
      <Route path="/context-studio" component={ContextStudio} />
      <Route path="/memory-architecture" component={MemoryArchitecture} />
      <Route path="/rag-pipeline" component={RagPipeline} />
      <Route path="/knowledge-graph" component={KnowledgeGraph} />
      <Route path="/autonomy-engine" component={AutonomyEngine} />
      <Route path="/oversight-console" component={OversightConsole} />
      <Route path="/shadow-replay" component={ShadowReplay} />
      <Route path="/canary-deployment" component={CanaryDeployment} />
      <Route path="/pipelines" component={Pipelines} />
      <Route path="/knowledge-bases/:id" component={KnowledgeBaseDetail} />
      <Route path="/knowledge-bases" component={KnowledgeBasesPage} />
      <Route path="/healing-operations" component={HealingOperations} />
      <Route path="/runbook-automation" component={RunbookAutomation} />
      <Route path="/model-providers" component={ModelProviders} />
      <Route path="/admin" component={Admin} />
      <Route component={NotFound} />
    </Switch>
  );
}

function DashboardLayout() {
  const style = {
    "--sidebar-width": "15rem",
    "--sidebar-width-icon": "3.5rem",
  };

  return (
    <IndustryProvider>
      <RoleProvider>
        <EnvironmentProvider>
          <EvidenceDrawerProvider>
            <IndustryWorkspaceSelector />
            <SidebarProvider style={style as React.CSSProperties}>
              <div className="flex h-screen w-full">
                <AppSidebar />
                <div className="flex flex-col flex-1 min-w-0">
                  <header className="flex items-center justify-between gap-2 p-2 border-b shrink-0 h-12">
                    <div className="flex items-center gap-2 flex-wrap">
                      <SidebarTrigger data-testid="button-sidebar-toggle" />
                      <GlobalSearch />
                    </div>

                    <HeaderControls />
                  </header>
                  <div className="flex-1 overflow-y-auto overflow-x-hidden">
                    <DashboardRouter />
                  </div>
                </div>
              </div>
            </SidebarProvider>
            <CommandPalette />
          </EvidenceDrawerProvider>
        </EnvironmentProvider>
      </RoleProvider>
    </IndustryProvider>
  );
}

function AuthGate() {
  const { securityMode, isAuthenticated, isLoading } = useAuth();
  const [location] = useLocation();
  const isLanding = location === "/";

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground text-sm">Loading...</div>
      </div>
    );
  }

  if (isLanding) return <Landing />;

  if (securityMode === "production" && !isAuthenticated) {
    return <LoginPage />;
  }

  return <DashboardLayout />;
}

function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AuthProvider>
            <AuthGate />
          </AuthProvider>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
