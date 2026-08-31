import { useEffect, lazy, Suspense } from "react";
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
import { ErrorBoundary } from "@/components/error-boundary";
import LoginPage from "@/pages/login";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
const Overview = lazy(() => import("@/pages/overview"));
const Outcomes = lazy(() => import("@/pages/outcomes"));
const Agents = lazy(() => import("@/pages/agents"));
const AgentDetail = lazy(() => import("@/pages/agent-detail"));
const Deployments = lazy(() => import("@/pages/deployments"));
const Monitor = lazy(() => import("@/pages/monitor"));
const Workspace = lazy(() => import("@/pages/workspace"));
const Files = lazy(() => import("@/pages/files"));
const Governance = lazy(() => import("@/pages/governance"));
const Approvals = lazy(() => import("@/pages/approvals"));
const Billing = lazy(() => import("@/pages/billing"));
const OutcomeDetail = lazy(() => import("@/pages/outcome-detail"));
const ReleaseDetail = lazy(() => import("@/pages/release-detail"));
const TraceDetail = lazy(() => import("@/pages/trace-detail"));
const DagRunMonitor = lazy(() => import("@/pages/dag-run-monitor"));
const AgentWizard = lazy(() => import("@/pages/agent-wizard"));
const EvalDetail = lazy(() => import("@/pages/eval-detail"));
const Evals = lazy(() => import("@/pages/evals"));
const EvalMetrics = lazy(() => import("@/pages/eval-metrics"));
const EvalMetricBuilder = lazy(() => import("@/pages/eval-metric-builder"));
const EvalSynthesizer = lazy(() => import("@/pages/eval-synthesizer"));
const EvalSimulator = lazy(() => import("@/pages/eval-simulator"));
const EvalRegression = lazy(() => import("@/pages/eval-regression"));
const EvalMonitor = lazy(() => import("@/pages/eval-monitor"));
const EvalRedteam = lazy(() => import("@/pages/eval-redteam"));
const EvalAnnotate = lazy(() => import("@/pages/eval-annotate"));
const EvalReports = lazy(() => import("@/pages/eval-reports"));
const EvalPrompts = lazy(() => import("@/pages/eval-prompts"));
const EvalMarketplace = lazy(() => import("@/pages/eval-marketplace"));
const EvalRuns = lazy(() => import("@/pages/eval-runs"));
const EvalRunDetail = lazy(() => import("@/pages/eval-run-detail"));
const EvalDatasets = lazy(() => import("@/pages/eval-datasets"));
const EvalTraceInspector = lazy(() => import("@/pages/eval-trace-inspector"));
const Templates = lazy(() => import("@/pages/templates"));
const TemplateDetail = lazy(() => import("@/pages/template-detail"));
const Journeys = lazy(() => import("@/pages/journeys"));
const Improvements = lazy(() => import("@/pages/improvements"));
const ImprovementLoop = lazy(() => import("@/pages/improvement-loop"));
const OutcomeDiscover = lazy(() => import("@/pages/outcome-discover"));
const Integrations = lazy(() => import("@/pages/integrations"));
const Admin = lazy(() => import("@/pages/admin"));
const Optimization = lazy(() => import("@/pages/optimization"));
const ApprovalDetail = lazy(() => import("@/pages/approval-detail"));
const Blueprints = lazy(() => import("@/pages/blueprints"));
const BlueprintDetail = lazy(() => import("@/pages/blueprint-detail"));
const ShadowReplay = lazy(() => import("@/pages/shadow-replay"));
const CanaryDeployment = lazy(() => import("@/pages/canary-deployment"));
const HealingOperations = lazy(() => import("@/pages/healing-operations"));
const RunbookAutomation = lazy(() => import("@/pages/runbook-automation"));
const AuditTrail = lazy(() => import("@/pages/audit-trail"));
const RunDetail = lazy(() => import("@/pages/run-detail"));
const McpServers = lazy(() => import("@/pages/mcp-servers"));
const RelayAgents = lazy(() => import("@/pages/relay-agents"));
const McpServerDetail = lazy(() => import("@/pages/mcp-server-detail"));
const ToolCatalog = lazy(() => import("@/pages/tool-catalog"));
const ToolDetail = lazy(() => import("@/pages/tool-detail"));
const McpResources = lazy(() => import("@/pages/mcp-resources"));
const McpResourceDetail = lazy(() => import("@/pages/mcp-resource-detail"));
const McpPrompts = lazy(() => import("@/pages/mcp-prompts"));
const McpPromptDetail = lazy(() => import("@/pages/mcp-prompt-detail"));
const RemoteAgents = lazy(() => import("@/pages/remote-agents"));
const AgentTeams = lazy(() => import("@/pages/agent-teams"));
const ApprovalGates = lazy(() => import("@/pages/approval-gates"));
const Marketplace = lazy(() => import("@/pages/marketplace"));
const MarketplaceDetail = lazy(() => import("@/pages/marketplace-detail"));
const MarketplacePublishers = lazy(() => import("@/pages/marketplace-publishers"));
const McpApps = lazy(() => import("@/pages/mcp-apps"));
const OntologyExplorer = lazy(() => import("@/pages/ontology"));
const PolicyEngine = lazy(() => import("@/pages/policy-engine"));
const SkillCatalog = lazy(() => import("@/pages/skills"));
const SkillStudio = lazy(() => import("@/pages/skill-studio"));
const SkillComposer = lazy(() => import("@/pages/skill-composer"));
const GoldenDatasets = lazy(() => import("@/pages/golden-datasets"));
const GoldenDatasetDetail = lazy(() => import("@/pages/golden-dataset-detail"));
const ContextStudio = lazy(() => import("@/pages/context-studio"));
const MemoryArchitecture = lazy(() => import("@/pages/memory-architecture"));
const RagPipeline = lazy(() => import("@/pages/rag-pipeline"));
const KnowledgeGraph = lazy(() => import("@/pages/knowledge-graph"));
const AutonomyEngine = lazy(() => import("@/pages/autonomy-engine"));
const OversightConsole = lazy(() => import("@/pages/oversight-console"));
const AgentPlayground = lazy(() => import("@/pages/agent-playground"));
const Pipelines = lazy(() => import("@/pages/pipelines"));
const KnowledgeBasesPage = lazy(() => import("@/pages/knowledge-bases"));
const KnowledgeBaseDetail = lazy(() => import("@/pages/knowledge-base-detail"));
const ModelProviders = lazy(() => import("@/pages/model-providers"));
const DeveloperPortal = lazy(() => import("@/pages/developer-portal"));
const AgentExport = lazy(() => import("@/pages/agent-export"));
const BlackRockDemo = lazy(() => import("@client-shared/pages/demo/blackrock-demo"));
const BlackRock2Demo = lazy(() => import("@client-shared/pages/demo/blackrock2-demo"));
const KinectiveDemo = lazy(() => import("@client-shared/pages/demo/kinective-demo"));
const MoodysDemo = lazy(() => import("@client-shared/pages/demo/moodys-demo"));
const HearstDemo = lazy(() => import("@client-shared/pages/demo/hearst-demo"));
const FitchDemo = lazy(() => import("@client-shared/pages/demo/fitch-demo"));
const FitchRWDemo = lazy(() => import("@client-shared/pages/demo/fitch-rw-demo"));
const OnespanDemo = lazy(() => import("@client-shared/pages/demo/onespan-demo"));
const BlackBookDemo = lazy(() => import("@client-shared/pages/demo/blackbook-demo"));
const LittlerDemo = lazy(() => import("@client-shared/pages/demo/littler-demo"));
const OtcQuoteDemo = lazy(() => import("@client-shared/pages/demo/otc-quote-demo"));
const OtcOrderDemo = lazy(() => import("@client-shared/pages/demo/otc-order-demo"));
const OtcFulfillmentDemo = lazy(() => import("@client-shared/pages/demo/otc-fulfillment-demo"));
const OtcCashDemo = lazy(() => import("@client-shared/pages/demo/otc-cash-demo"));
const OtcDisputeDemo = lazy(() => import("@client-shared/pages/demo/otc-dispute-demo"));
const HnpGovtDemo = lazy(() => import("@client-shared/pages/demo/hnp-govt-demo"));
const HnpSubDemo = lazy(() => import("@client-shared/pages/demo/hnp-sub-demo"));
const McgKbDemo = lazy(() => import("@client-shared/pages/demo/mcg-kb-demo"));
const ItTriageDemo = lazy(() => import("@client-shared/pages/demo/it-triage-demo"));
const SolifiDealerDemo = lazy(() => import("@client-shared/pages/demo/solifi-dealer-demo"));
const KinectiveGlSyncDemo = lazy(() => import("@client-shared/pages/demo/kinective-gl-sync-demo"));
const PkgSchedDemo = lazy(() => import("@client-shared/pages/demo/pkg-sched-demo"));
const SHHealthcareDemo = lazy(() => import("@client-shared/pages/demo/sh-healthcare-demo"));
const SHFinancialDemo = lazy(() => import("@client-shared/pages/demo/sh-financial-demo"));
const SHManufacturingDemo = lazy(() => import("@client-shared/pages/demo/sh-manufacturing-demo"));
const SHRetailDemo = lazy(() => import("@client-shared/pages/demo/sh-retail-demo"));
const SHEnergyDemo = lazy(() => import("@client-shared/pages/demo/sh-energy-demo"));
const SHInsuranceDemo = lazy(() => import("@client-shared/pages/demo/sh-insurance-demo"));
const AdvSupportDemo = lazy(() => import("@client-shared/pages/demo/adv-support-demo"));
const EscalationDemo = lazy(() => import("@client-shared/pages/demo/escalation-demo"));
const FpaDemo = lazy(() => import("@client-shared/pages/demo/fpa-demo"));
const PoStatusDemo = lazy(() => import("@client-shared/pages/demo/po-status-demo"));
const DemoCenter = lazy(() => import("@client-shared/pages/demo/demo-center"));
const ObservabilityPage = lazy(() => import("@/pages/observability"));
const FeedbackTracker = lazy(() => import("@/pages/feedback"));
const ProcessFlows = lazy(() => import("@/pages/process-flows"));
const BusinessCommandCenter = lazy(() => import("@/pages/business-command-center"));
const MyActions = lazy(() => import("@/pages/my-actions"));
const BusinessSettings = lazy(() => import("@/pages/business-settings"));
const MyWorkers = lazy(() => import("@/pages/my-workers"));
import { Shield, LogOut, Briefcase } from "lucide-react";
import { useRole } from "@/components/role-provider";

function HeaderControls() {
  const { securityMode, user, logout } = useAuth();

  if (securityMode === "production") {
    return (
      <div className="flex items-center gap-2">
        {/* Mobile (UX audit F-12): selectors and badges collapse below md so
            the header doesn't clip — icons and logout stay reachable. */}
        <div className="hidden md:flex items-center gap-2 flex-wrap">
          <IndustrySelector />
          <EnvironmentSelector />
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded-md border" data-testid="badge-security-mode">
            <Shield className="h-3 w-3" />
            Production
          </span>
          <span className="text-xs text-muted-foreground" data-testid="text-current-user">{user?.username} ({user?.role})</span>
        </div>
        <NotificationCenter />
        <button
          onClick={logout}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive px-2 py-1 rounded-md border hover:border-destructive/50 transition-colors"
          data-testid="button-logout"
        >
          <LogOut className="h-3 w-3" />
          <span className="hidden sm:inline">Logout</span>
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
    <div className="flex items-center gap-2">
      {/* Mobile (UX audit F-12): selectors collapse below md; the icon
          controls remain so the header never clips on narrow screens. */}
      <div className="hidden md:flex items-center gap-2 flex-wrap">
        <IndustrySelector />
        <EnvironmentSelector />
        {!isBusinessMode && <RoleSwitcher />}
        <BusinessModeBadge />
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded-md border" data-testid="badge-security-mode">
          <Shield className="h-3 w-3" />
          Demo
        </span>
      </div>
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

/** Fallback while a lazily-loaded route chunk downloads (UX audit F-7). */
function RouteFallback() {
  return (
    <div className="flex items-center justify-center min-h-[40vh] w-full" data-testid="route-loading">
      <div className="flex flex-col items-center gap-3">
        <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin motion-reduce:animate-none" aria-hidden="true" />
        <span className="text-xs text-muted-foreground">Loading…</span>
      </div>
    </div>
  );
}

function DashboardRouter() {
  const [location] = useLocation();
  return (
    <ErrorBoundary resetKey={location}>
    <Suspense fallback={<RouteFallback />}>
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
      <Route path="/journeys" component={Journeys} />
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
      <Route path="/evals/monitor" component={EvalMonitor} />
      <Route path="/evals/redteam" component={EvalRedteam} />
      <Route path="/evals/annotate" component={EvalAnnotate} />
      <Route path="/evals/reports" component={EvalReports} />
      <Route path="/evals/prompts" component={EvalPrompts} />
      <Route path="/evals/marketplace" component={EvalMarketplace} />
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
      <Route path="/dag-runs/:runId" component={DagRunMonitor} />
      <Route path="/runtime/runs/:id" component={RunDetail} />
      <Route path="/agents/:agentId/runs/:id" component={RunDetail} />
      <Route path="/monitor" component={Monitor} />
      <Route path="/workspace" component={Workspace} />
      <Route path="/files" component={Files} />
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
      <Route path="/integrations/relay-agents" component={RelayAgents} />
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
      <Route path="/demo/kinective-gl-sync" component={KinectiveGlSyncDemo} />
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
      <Route path="/demo/it-triage" component={ItTriageDemo} />
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
      <Route path="/demo/escalation" component={EscalationDemo} />
      <Route path="/demo/fpa" component={FpaDemo} />
      <Route path="/demo/po-status" component={PoStatusDemo} />
      <Route path="/feedback" component={FeedbackTracker} />
      <Route path="/admin" component={Admin} />
      <Route component={NotFound} />
    </Switch>
    </Suspense>
    </ErrorBoundary>
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
    <Suspense fallback={<RouteFallback />}>
      <Switch>
        <Route path="/agents/:id/export" component={AgentExport} />
        <Route>{() => <DashboardLayout />}</Route>
      </Switch>
    </Suspense>
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
