import { useEffect } from "react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import EvalMetrics from "@/pages/eval-metrics";
import EvalMetricBuilder from "@/pages/eval-metric-builder";
import EvalSynthesizer from "@/pages/eval-synthesizer";
import EvalSimulator from "@/pages/eval-simulator";
import EvalRegression from "@/pages/eval-regression";
import EvalRuns from "@/pages/eval-runs";
import EvalRunDetail from "@/pages/eval-run-detail";
import EvalDatasets from "@/pages/eval-datasets";
import EvalTraceInspector from "@/pages/eval-trace-inspector";
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
import DeveloperPortal from "@/pages/developer-portal";
import AgentExport from "@/pages/agent-export";
import BlackRockDemo from "@client-shared/pages/demo/blackrock-demo";
import BlackRock2Demo from "@client-shared/pages/demo/blackrock2-demo";
import KinectiveDemo from "@client-shared/pages/demo/kinective-demo";
import MoodysDemo from "@client-shared/pages/demo/moodys-demo";
import HearstDemo from "@client-shared/pages/demo/hearst-demo";
import FitchDemo from "@client-shared/pages/demo/fitch-demo";
import FitchRWDemo from "@client-shared/pages/demo/fitch-rw-demo";
import OnespanDemo from "@client-shared/pages/demo/onespan-demo";
import BlackBookDemo from "@client-shared/pages/demo/blackbook-demo";
import LittlerDemo from "@client-shared/pages/demo/littler-demo";
import OtcQuoteDemo from "@client-shared/pages/demo/otc-quote-demo";
import OtcOrderDemo from "@client-shared/pages/demo/otc-order-demo";
import OtcFulfillmentDemo from "@client-shared/pages/demo/otc-fulfillment-demo";
import OtcCashDemo from "@client-shared/pages/demo/otc-cash-demo";
import OtcDisputeDemo from "@client-shared/pages/demo/otc-dispute-demo";
import HnpGovtDemo from "@client-shared/pages/demo/hnp-govt-demo";
import HnpSubDemo from "@client-shared/pages/demo/hnp-sub-demo";
import McgKbDemo from "@client-shared/pages/demo/mcg-kb-demo";
import SolifiDealerDemo from "@client-shared/pages/demo/solifi-dealer-demo";
import PkgSchedDemo from "@client-shared/pages/demo/pkg-sched-demo";
import SHHealthcareDemo from "@client-shared/pages/demo/sh-healthcare-demo";
import SHFinancialDemo from "@client-shared/pages/demo/sh-financial-demo";
import SHManufacturingDemo from "@client-shared/pages/demo/sh-manufacturing-demo";
import SHRetailDemo from "@client-shared/pages/demo/sh-retail-demo";
import SHEnergyDemo from "@client-shared/pages/demo/sh-energy-demo";
import SHInsuranceDemo from "@client-shared/pages/demo/sh-insurance-demo";
import AdvSupportDemo from "@client-shared/pages/demo/adv-support-demo";
import DemoCenter from "@client-shared/pages/demo/demo-center";
import ObservabilityPage from "@/pages/observability";
import FeedbackTracker from "@/pages/feedback";
import ProcessFlows from "@/pages/process-flows";
import BusinessCommandCenter from "@/pages/business-command-center";
import MyActions from "@/pages/my-actions";
import BusinessSettings from "@/pages/business-settings";
import MyWorkers from "@/pages/my-workers";
import { Shield, LogOut, Briefcase } from "lucide-react";
import { useRole } from "@/components/role-provider";

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
    <BusinessModeAwareHeaderControls />
  );
}

function BusinessModeAwareHeaderControls() {
  const { isBusinessMode } = useRole();
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <IndustrySelector />
      <EnvironmentSelector />
      {!isBusinessMode && <RoleSwitcher />}
      <BusinessModeBadge />
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded-md border" data-testid="badge-security-mode">
        <Shield className="h-3 w-3" />
        Demo
      </span>
      <NotificationCenter />
      <ThemeToggle />
    </div>
  );
}

function DashboardHome() {
  const { isBusinessMode } = useRole();
  return isBusinessMode ? <BusinessCommandCenter /> : <Overview />;
}

function BusinessModeBadge() {
  const { isBusinessMode, setRole } = useRole();
  if (!isBusinessMode) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="inline-flex items-center gap-1.5 text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 px-2.5 py-1 rounded-md border border-primary/20 transition-colors cursor-pointer"
          data-testid="badge-business-mode"
        >
          <Briefcase className="h-3 w-3" />
          Business View
          <svg className="h-3 w-3 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel className="text-xs">Switch view</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-xs opacity-50 cursor-default" data-testid="menu-view-business">
          <Briefcase className="h-3 w-3 mr-2" />
          Business View ✓
        </DropdownMenuItem>
        <DropdownMenuItem
          className="text-xs cursor-pointer"
          onClick={() => setRole("ops_sre")}
          data-testid="menu-view-operator"
        >
          <LogOut className="h-3 w-3 mr-2 rotate-180" />
          Operator View
        </DropdownMenuItem>
        <DropdownMenuItem
          className="text-xs cursor-pointer"
          onClick={() => setRole("agent_engineer")}
          data-testid="menu-view-builder"
        >
          <Shield className="h-3 w-3 mr-2" />
          Builder / IT View
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function BusinessOnlyRoute({ component: Comp }: { component: React.ComponentType }) {
  const { isBusinessMode } = useRole();
  const [, navigate] = useLocation();
  useEffect(() => {
    if (!isBusinessMode) navigate("/dashboard");
  }, [isBusinessMode, navigate]);
  if (!isBusinessMode) return null;
  return <Comp />;
}

function DashboardRouter() {
  return (
    <Switch>
      <Route path="/dashboard" component={DashboardHome} />
      <Route path="/my-actions" component={MyActions} />
      <Route path="/actions" component={MyActions} />
      <Route path="/business-settings" component={BusinessSettings} />
      <Route path="/outcomes" component={Outcomes} />
      <Route path="/outcomes/discover" component={OutcomeDiscover} />
      <Route path="/outcomes/:id" component={OutcomeDetail} />
      <Route path="/my-workers">{() => <BusinessOnlyRoute component={MyWorkers} />}</Route>
      <Route path="/process-flows" component={ProcessFlows} />
      <Route path="/agents" component={Agents} />
      <Route path="/templates" component={Templates} />
      <Route path="/templates/:id" component={TemplateDetail} />
      <Route path="/agents/wizard" component={AgentWizard} />
      <Route path="/agents/teams" component={AgentTeams} />
      <Route path="/agents/remote" component={RemoteAgents} />
      <Route path="/agents/:id/playground" component={AgentPlayground} />
      <Route path="/agents/:id/export" component={AgentExport} />
      <Route path="/agents/:id" component={AgentDetail} />
      <Route path="/blueprints" component={Blueprints} />
      <Route path="/blueprints/:id" component={BlueprintDetail} />
      <Route path="/evals" component={Evals} />
      <Route path="/evals/metrics/new" component={EvalMetricBuilder} />
      <Route path="/evals/metrics/:id/edit" component={EvalMetricBuilder} />
      <Route path="/evals/metrics" component={EvalMetrics} />
      <Route path="/evals/synthesizer" component={EvalSynthesizer} />
      <Route path="/evals/simulator" component={EvalSimulator} />
      <Route path="/evals/regression" component={EvalRegression} />
      <Route path="/evals/datasets" component={EvalDatasets} />
      <Route path="/evals/runs" component={EvalRuns} />
      <Route path="/evals/runs/:id" component={EvalRunDetail} />
      <Route path="/evals/traces/:id" component={EvalTraceInspector} />
      <Route path="/evals/replay" component={ShadowReplay} />
      <Route path="/evals/:id" component={EvalDetail} />
      <Route path="/golden-datasets/:id" component={GoldenDatasetDetail} />
      <Route path="/golden-datasets" component={GoldenDatasets} />
      <Route path="/deployments" component={Deployments} />
      <Route path="/deployments/:id" component={ReleaseDetail} />
      <Route path="/traces/:id" component={TraceDetail} />
      <Route path="/runtime/runs/:id" component={RunDetail} />
      <Route path="/agents/:agentId/runs/:id" component={RunDetail} />
      <Route path="/monitor" component={Monitor} />
      <Route path="/observability" component={ObservabilityPage} />
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
      <Route path="/developer" component={DeveloperPortal} />
      <Route path="/demo" component={DemoCenter} />
      <Route path="/demo/blackrock" component={BlackRockDemo} />
      <Route path="/demo/blackrock2" component={BlackRock2Demo} />
      <Route path="/demo/kinective-coa" component={KinectiveDemo} />
      <Route path="/demo/kinective" component={KinectiveDemo} />
      <Route path="/demo/moodys" component={MoodysDemo} />
      <Route path="/demo/hearst" component={HearstDemo} />
      <Route path="/demo/fitch" component={FitchDemo} />
      <Route path="/demo/fitch-rw" component={FitchRWDemo} />
      <Route path="/demo/blackbook" component={BlackBookDemo} />
      <Route path="/demo/littler" component={LittlerDemo} />
      <Route path="/demo/otc-quote" component={OtcQuoteDemo} />
      <Route path="/demo/otc-order" component={OtcOrderDemo} />
      <Route path="/demo/otc-fulfillment" component={OtcFulfillmentDemo} />
      <Route path="/demo/otc-cash" component={OtcCashDemo} />
      <Route path="/demo/otc-dispute" component={OtcDisputeDemo} />
      <Route path="/demo/hnp-govt" component={HnpGovtDemo} />
      <Route path="/demo/hnp-sub" component={HnpSubDemo} />
      <Route path="/demo/mcg-kb" component={McgKbDemo} />
      <Route path="/demo/solifi-dealer" component={SolifiDealerDemo} />
      <Route path="/demo/pkg-sched" component={PkgSchedDemo} />
          <Route path="/demo/onespan" component={OnespanDemo} />
      <Route path="/demo/sh-healthcare" component={SHHealthcareDemo} />
      <Route path="/demo/sh-financial" component={SHFinancialDemo} />
      <Route path="/demo/sh-manufacturing" component={SHManufacturingDemo} />
      <Route path="/demo/sh-retail" component={SHRetailDemo} />
      <Route path="/demo/sh-energy" component={SHEnergyDemo} />
      <Route path="/demo/sh-insurance" component={SHInsuranceDemo} />
      <Route path="/demo/advantive-support" component={AdvSupportDemo} />
      <Route path="/feedback" component={FeedbackTracker} />
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

  return (
    <Switch>
      <Route path="/agents/:id/export" component={AgentExport} />
      <Route>{() => <DashboardLayout />}</Route>
    </Switch>
  );
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
