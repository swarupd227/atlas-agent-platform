import { eq, desc } from "drizzle-orm";
import { createHash } from "crypto";
import { db } from "./db";
import {
  users, agents, outcomeContracts, kpiDefinitions, deployments,
  runTraces, evalSuites, policies, approvals, auditEvents, invoices, outcomeEvents,
  agentTemplates, evalTestCases, evalRuns, evalCaseResults,
  improvementRecommendations, autonomousActionLogs, agentVersions,
  policyExceptions, complianceReports,
  policyTestCases,
  billingDisputes,
  type User, type InsertUser,
  type Agent, type InsertAgent,
  type OutcomeContract, type InsertOutcomeContract,
  type KpiDefinition, type InsertKpiDefinition,
  type Deployment, type InsertDeployment,
  type RunTrace, type InsertRunTrace,
  type EvalSuite, type InsertEvalSuite,
  type Policy, type InsertPolicy,
  type Approval, type InsertApproval,
  type AuditEvent, type InsertAuditEvent,
  type Invoice, type InsertInvoice,
  type OutcomeEvent, type InsertOutcomeEvent,
  type AgentTemplate, type InsertAgentTemplate,
  type EvalTestCase, type InsertEvalTestCase,
  type EvalRun, type InsertEvalRun,
  type EvalCaseResult, type InsertEvalCaseResult,
  type ImprovementRecommendation, type InsertImprovementRecommendation,
  type AutonomousActionLog, type InsertAutonomousActionLog,
  type AgentVersion,
  improvementCycles,
  type ImprovementCycle, type InsertImprovementCycle,
  type PolicyException, type InsertPolicyException,
  type ComplianceReport, type InsertComplianceReport,
  type PolicyTestCase, type InsertPolicyTestCase,
  patches,
  type Patch, type InsertPatch,
  experiments,
  type Experiment, type InsertExperiment,
  type BillingDispute, type InsertBillingDispute,
  blueprints,
  type Blueprint, type InsertBlueprint,
  loggingIntegrations,
  type LoggingIntegration, type InsertLoggingIntegration,
  toolConnectors,
  type ToolConnector, type InsertToolConnector,
  orgSettings,
  type OrgSettings,
  adminUsers,
  type AdminUser, type InsertAdminUser,
  environmentConfigs,
  type EnvironmentConfig,
  secretRotationPolicies,
  type SecretRotationPolicy, type InsertSecretRotationPolicy,
  adminWebhooks,
  type AdminWebhook, type InsertAdminWebhook,
  jobs,
  type Job, type InsertJob,
  runSteps,
  type RunStep, type InsertRunStep,
  incidents,
  type Incident, type InsertIncident,
  mcpServers,
  type McpServer, type InsertMcpServer,
  mcpServerTools,
  type McpServerTool, type InsertMcpServerTool,
  mcpServerResources,
  type McpServerResource, type InsertMcpServerResource,
  mcpServerPrompts,
  type McpServerPrompt, type InsertMcpServerPrompt,
  mcpServerAuth,
  type McpServerAuth, type InsertMcpServerAuth,
  remoteAgents,
  type RemoteAgent, type InsertRemoteAgent,
  agentTeams,
  type AgentTeam, type InsertAgentTeam,
  mcpElicitations,
  type McpElicitation, type InsertMcpElicitation,
  teamBlueprintNodes,
  type TeamBlueprintNode, type InsertTeamBlueprintNode,
  teamBlueprintEdges,
  type TeamBlueprintEdge, type InsertTeamBlueprintEdge,
  traceSpans,
  type TraceSpan, type InsertTraceSpan,
  mcpTranscripts,
  type McpTranscript, type InsertMcpTranscript,
  registrySources,
  type RegistrySource, type InsertRegistrySource,
  marketplaceServers,
  type MarketplaceServer, type InsertMarketplaceServer,
  trustedPublishers,
  type TrustedPublisher, type InsertTrustedPublisher,
  marketplaceInstallRequests,
  type MarketplaceInstallRequest, type InsertMarketplaceInstallRequest,
  platformSettings,
  type PlatformSetting, type InsertPlatformSetting,
  mcpApps,
  type McpApp, type InsertMcpApp,
  mcpAppConsents,
  type McpAppConsent, type InsertMcpAppConsent,
  mcpAppSessions,
  type McpAppSession, type InsertMcpAppSession,
  regulations,
  type Regulation, type InsertRegulation,
  regulatoryPolicies,
  type RegulatoryPolicy, type InsertRegulatoryPolicy,
  complianceControls,
  type ComplianceControl, type InsertComplianceControl,
  regulatoryChanges,
  type RegulatoryChange, type InsertRegulatoryChange,
} from "@shared/schema";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  getAgents(): Promise<Agent[]>;
  getAgent(id: string): Promise<Agent | undefined>;
  createAgent(agent: InsertAgent): Promise<Agent>;

  getOutcomes(): Promise<OutcomeContract[]>;
  getOutcome(id: string): Promise<OutcomeContract | undefined>;
  createOutcome(outcome: InsertOutcomeContract): Promise<OutcomeContract>;

  getKpis(): Promise<KpiDefinition[]>;
  getKpisByOutcome(outcomeId: string): Promise<KpiDefinition[]>;
  createKpi(kpi: InsertKpiDefinition): Promise<KpiDefinition>;
  updateKpi(id: string, data: Partial<KpiDefinition>): Promise<KpiDefinition | undefined>;
  deleteKpi(id: string): Promise<boolean>;

  updateOutcome(id: string, data: Partial<OutcomeContract>): Promise<OutcomeContract | undefined>;

  getDeployments(): Promise<Deployment[]>;
  getDeployment(id: string): Promise<Deployment | undefined>;
  createDeployment(deployment: InsertDeployment): Promise<Deployment>;
  updateDeployment(id: string, data: Partial<Deployment>): Promise<Deployment | undefined>;
  getDeploymentsByPromotedFrom(promotedFrom: string): Promise<Deployment[]>;

  getTraces(): Promise<RunTrace[]>;
  getTrace(id: string): Promise<RunTrace | undefined>;
  getTracesByAgent(agentId: string): Promise<RunTrace[]>;
  createTrace(trace: InsertRunTrace): Promise<RunTrace>;

  getEvalSuites(): Promise<EvalSuite[]>;
  getEvalsByAgent(agentId: string): Promise<EvalSuite[]>;
  createEvalSuite(suite: InsertEvalSuite): Promise<EvalSuite>;

  getPolicies(): Promise<Policy[]>;
  getPolicy(id: string): Promise<Policy | undefined>;
  createPolicy(policy: InsertPolicy): Promise<Policy>;
  updatePolicy(id: string, data: Partial<Policy>): Promise<Policy | undefined>;

  getApprovals(): Promise<Approval[]>;
  getApproval(id: string): Promise<Approval | undefined>;
  createApproval(approval: InsertApproval): Promise<Approval>;
  updateApproval(id: string, data: Partial<Approval>): Promise<Approval | undefined>;

  getAuditEvents(): Promise<AuditEvent[]>;
  createAuditEvent(event: InsertAuditEvent): Promise<AuditEvent>;

  getInvoices(): Promise<Invoice[]>;
  getInvoice(id: string): Promise<Invoice | undefined>;
  createInvoice(invoice: InsertInvoice): Promise<Invoice>;
  updateInvoice(id: string, data: Partial<Invoice>): Promise<Invoice | undefined>;

  getOutcomeEvents(): Promise<OutcomeEvent[]>;
  getOutcomeEvent(id: string): Promise<OutcomeEvent | undefined>;
  getOutcomeEventsByInvoice(invoiceId: string): Promise<OutcomeEvent[]>;
  getOutcomeEventsByOutcome(outcomeId: string): Promise<OutcomeEvent[]>;
  createOutcomeEvent(event: InsertOutcomeEvent): Promise<OutcomeEvent>;
  updateOutcomeEvent(id: string, data: Partial<OutcomeEvent>): Promise<OutcomeEvent | undefined>;

  getBillingDisputes(): Promise<BillingDispute[]>;
  getBillingDisputesByInvoice(invoiceId: string): Promise<BillingDispute[]>;
  createBillingDispute(dispute: InsertBillingDispute): Promise<BillingDispute>;
  updateBillingDispute(id: string, data: Partial<BillingDispute>): Promise<BillingDispute | undefined>;

  getAgentTemplates(): Promise<AgentTemplate[]>;
  getAgentTemplate(id: string): Promise<AgentTemplate | undefined>;
  createAgentTemplate(template: InsertAgentTemplate): Promise<AgentTemplate>;
  updateAgentTemplate(id: string, data: Partial<InsertAgentTemplate>): Promise<AgentTemplate | undefined>;
  deleteAgentTemplate(id: string): Promise<boolean>;

  getEvalSuite(id: string): Promise<EvalSuite | undefined>;
  updateEvalSuite(id: string, data: Partial<EvalSuite>): Promise<EvalSuite | undefined>;

  getEvalTestCases(suiteId: string): Promise<EvalTestCase[]>;
  createEvalTestCase(testCase: InsertEvalTestCase): Promise<EvalTestCase>;

  getEvalRuns(suiteId: string): Promise<EvalRun[]>;
  getEvalRunsBySuite(suiteId: string): Promise<EvalRun[]>;
  getAllEvalRuns(): Promise<EvalRun[]>;
  createEvalRun(run: InsertEvalRun): Promise<EvalRun>;

  getEvalCaseResults(runId: string): Promise<EvalCaseResult[]>;
  createEvalCaseResult(result: InsertEvalCaseResult): Promise<EvalCaseResult>;
  getEvalCaseResultsByCase(caseId: string): Promise<EvalCaseResult[]>;

  updateEvalTestCase(id: string, data: Partial<EvalTestCase>): Promise<EvalTestCase | undefined>;
  deleteEvalTestCase(id: string): Promise<boolean>;

  updateAgent(id: string, data: Partial<Agent>): Promise<Agent | undefined>;

  getImprovementRecommendations(): Promise<ImprovementRecommendation[]>;
  getImprovementRecommendationsByAgent(agentId: string): Promise<ImprovementRecommendation[]>;
  createImprovementRecommendation(rec: InsertImprovementRecommendation): Promise<ImprovementRecommendation>;
  updateImprovementRecommendation(id: string, data: Partial<ImprovementRecommendation>): Promise<ImprovementRecommendation | undefined>;

  getAutonomousActionLogs(): Promise<AutonomousActionLog[]>;
  getAutonomousActionLogsByAgent(agentId: string): Promise<AutonomousActionLog[]>;
  createAutonomousActionLog(log: InsertAutonomousActionLog): Promise<AutonomousActionLog>;

  getAgentVersions(agentId: string): Promise<AgentVersion[]>;

  getImprovementCycles(): Promise<ImprovementCycle[]>;
  getImprovementCyclesByAgent(agentId: string): Promise<ImprovementCycle[]>;
  createImprovementCycle(cycle: InsertImprovementCycle): Promise<ImprovementCycle>;
  updateImprovementCycle(id: string, data: Partial<ImprovementCycle>): Promise<ImprovementCycle | undefined>;

  getPolicyExceptions(): Promise<PolicyException[]>;
  getPolicyExceptionsByAgent(agentId: string): Promise<PolicyException[]>;
  createPolicyException(exception: InsertPolicyException): Promise<PolicyException>;
  updatePolicyException(id: string, data: Partial<PolicyException>): Promise<PolicyException | undefined>;

  getPolicyTestCases(policyId: string): Promise<PolicyTestCase[]>;
  createPolicyTestCase(testCase: InsertPolicyTestCase): Promise<PolicyTestCase>;

  getComplianceReports(): Promise<ComplianceReport[]>;
  createComplianceReport(report: InsertComplianceReport): Promise<ComplianceReport>;

  verifyAuditChainIntegrity(): Promise<{ valid: boolean; totalEvents: number; verifiedEvents: number; brokenAt?: number }>;

  getIncidents(): Promise<Incident[]>;
  getIncident(id: string): Promise<Incident | undefined>;
  getIncidentsByAgent(agentId: string): Promise<Incident[]>;
  createIncident(incident: InsertIncident): Promise<Incident>;
  updateIncident(id: string, data: Partial<Incident>): Promise<Incident | undefined>;

  getPatches(): Promise<Patch[]>;
  getPatchesByAgent(agentId: string): Promise<Patch[]>;
  createPatch(patch: InsertPatch): Promise<Patch>;
  updatePatch(id: string, data: Partial<Patch>): Promise<Patch | undefined>;

  getExperiments(): Promise<Experiment[]>;
  getExperimentsByAgent(agentId: string): Promise<Experiment[]>;
  createExperiment(experiment: InsertExperiment): Promise<Experiment>;
  updateExperiment(id: string, data: Partial<Experiment>): Promise<Experiment | undefined>;

  getBlueprints(): Promise<Blueprint[]>;
  getBlueprint(id: string): Promise<Blueprint | undefined>;
  getBlueprintsByAgent(agentId: string): Promise<Blueprint[]>;
  createBlueprint(blueprint: InsertBlueprint): Promise<Blueprint>;
  updateBlueprint(id: string, data: Partial<Blueprint>): Promise<Blueprint | undefined>;

  getLoggingIntegrations(): Promise<LoggingIntegration[]>;
  getLoggingIntegration(id: string): Promise<LoggingIntegration | undefined>;
  createLoggingIntegration(integration: InsertLoggingIntegration): Promise<LoggingIntegration>;
  updateLoggingIntegration(id: string, data: Partial<LoggingIntegration>): Promise<LoggingIntegration | undefined>;
  deleteLoggingIntegration(id: string): Promise<boolean>;

  getToolConnectors(): Promise<ToolConnector[]>;
  getToolConnector(id: string): Promise<ToolConnector | undefined>;
  createToolConnector(connector: InsertToolConnector): Promise<ToolConnector>;
  updateToolConnector(id: string, data: Partial<ToolConnector>): Promise<ToolConnector | undefined>;
  deleteToolConnector(id: string): Promise<boolean>;

  getOrgSettings(): Promise<OrgSettings | undefined>;
  updateOrgSettings(data: Partial<OrgSettings>): Promise<OrgSettings>;

  getAdminUsers(): Promise<AdminUser[]>;
  getAdminUser(id: string): Promise<AdminUser | undefined>;
  createAdminUser(user: InsertAdminUser): Promise<AdminUser>;
  updateAdminUser(id: string, data: Partial<AdminUser>): Promise<AdminUser | undefined>;
  deleteAdminUser(id: string): Promise<boolean>;

  getEnvironmentConfigs(): Promise<EnvironmentConfig[]>;
  getEnvironmentConfig(id: string): Promise<EnvironmentConfig | undefined>;
  updateEnvironmentConfig(id: string, data: Partial<EnvironmentConfig>): Promise<EnvironmentConfig | undefined>;

  getSecretRotationPolicies(): Promise<SecretRotationPolicy[]>;
  getSecretRotationPolicy(id: string): Promise<SecretRotationPolicy | undefined>;
  createSecretRotationPolicy(policy: InsertSecretRotationPolicy): Promise<SecretRotationPolicy>;
  updateSecretRotationPolicy(id: string, data: Partial<SecretRotationPolicy>): Promise<SecretRotationPolicy | undefined>;
  deleteSecretRotationPolicy(id: string): Promise<boolean>;

  getAdminWebhooks(): Promise<AdminWebhook[]>;
  getAdminWebhook(id: string): Promise<AdminWebhook | undefined>;
  createAdminWebhook(webhook: InsertAdminWebhook): Promise<AdminWebhook>;
  updateAdminWebhook(id: string, data: Partial<AdminWebhook>): Promise<AdminWebhook | undefined>;
  deleteAdminWebhook(id: string): Promise<boolean>;

  getJob(id: string): Promise<Job | undefined>;
  getJobsByAgent(agentId: string): Promise<Job[]>;
  createJob(job: InsertJob): Promise<Job>;
  updateJob(id: string, data: Partial<Job>): Promise<Job | undefined>;
  dequeueNextJob(): Promise<Job | undefined>;
  completeJob(id: string, result: Record<string, unknown>): Promise<Job | undefined>;
  failJob(id: string, error: string): Promise<Job | undefined>;

  getRunSteps(runId: string): Promise<RunStep[]>;
  createRunStep(step: InsertRunStep): Promise<RunStep>;
  updateRunStep(id: string, data: Partial<RunStep>): Promise<RunStep | undefined>;

  getPoliciesByScope(scopeType: string, scopeId?: string): Promise<Policy[]>;
  updateTrace(id: string, data: Partial<RunTrace>): Promise<RunTrace | undefined>;

  getMcpServers(): Promise<McpServer[]>;
  getMcpServer(id: string): Promise<McpServer | undefined>;
  createMcpServer(server: InsertMcpServer): Promise<McpServer>;
  updateMcpServer(id: string, data: Partial<McpServer>): Promise<McpServer | undefined>;
  deleteMcpServer(id: string): Promise<boolean>;

  getMcpServerTools(serverId: string): Promise<McpServerTool[]>;
  getAllMcpServerTools(): Promise<McpServerTool[]>;
  getMcpServerToolById(id: string): Promise<McpServerTool | undefined>;
  createMcpServerTool(tool: InsertMcpServerTool): Promise<McpServerTool>;
  updateMcpServerTool(id: string, data: Partial<McpServerTool>): Promise<McpServerTool | undefined>;
  deleteMcpServerToolsByServer(serverId: string): Promise<void>;

  getMcpServerResources(serverId: string): Promise<McpServerResource[]>;
  getAllMcpServerResources(): Promise<McpServerResource[]>;
  getMcpServerResourceById(id: string): Promise<McpServerResource | undefined>;
  createMcpServerResource(resource: InsertMcpServerResource): Promise<McpServerResource>;
  updateMcpServerResource(id: string, data: Partial<McpServerResource>): Promise<McpServerResource | undefined>;
  deleteMcpServerResourcesByServer(serverId: string): Promise<void>;

  getAllMcpServerPrompts(): Promise<McpServerPrompt[]>;
  getMcpServerPrompts(serverId: string): Promise<McpServerPrompt[]>;
  getMcpServerPromptById(id: string): Promise<McpServerPrompt | undefined>;
  createMcpServerPrompt(prompt: InsertMcpServerPrompt): Promise<McpServerPrompt>;
  updateMcpServerPrompt(id: string, data: Partial<McpServerPrompt>): Promise<McpServerPrompt | undefined>;
  deleteMcpServerPromptsByServer(serverId: string): Promise<void>;

  getMcpServerAuth(serverId: string): Promise<McpServerAuth | undefined>;
  upsertMcpServerAuth(auth: InsertMcpServerAuth): Promise<McpServerAuth>;

  getRemoteAgents(): Promise<RemoteAgent[]>;
  getRemoteAgent(id: string): Promise<RemoteAgent | undefined>;
  getRemoteAgentByAgentId(agentId: string): Promise<RemoteAgent | undefined>;
  createRemoteAgent(remote: InsertRemoteAgent): Promise<RemoteAgent>;
  updateRemoteAgent(id: string, data: Partial<RemoteAgent>): Promise<RemoteAgent | undefined>;
  deleteRemoteAgent(id: string): Promise<boolean>;

  getAgentTeamMembers(teamAgentId: string): Promise<AgentTeam[]>;
  createAgentTeamMember(member: InsertAgentTeam): Promise<AgentTeam>;
  deleteAgentTeamMember(id: string): Promise<boolean>;
  getAgentTeamsByMember(memberAgentId: string): Promise<AgentTeam[]>;

  getMcpElicitations(): Promise<McpElicitation[]>;
  getMcpElicitation(id: string): Promise<McpElicitation | undefined>;
  getMcpElicitationsByStatus(status: string): Promise<McpElicitation[]>;
  createMcpElicitation(elicitation: InsertMcpElicitation): Promise<McpElicitation>;
  updateMcpElicitation(id: string, data: Partial<McpElicitation>): Promise<McpElicitation | undefined>;

  getTeamBlueprintNodes(blueprintId: string): Promise<TeamBlueprintNode[]>;
  getTeamBlueprintNode(id: string): Promise<TeamBlueprintNode | undefined>;
  createTeamBlueprintNode(node: InsertTeamBlueprintNode): Promise<TeamBlueprintNode>;
  updateTeamBlueprintNode(id: string, data: Partial<TeamBlueprintNode>): Promise<TeamBlueprintNode | undefined>;
  deleteTeamBlueprintNode(id: string): Promise<boolean>;

  getTeamBlueprintEdges(blueprintId: string): Promise<TeamBlueprintEdge[]>;
  getTeamBlueprintEdge(id: string): Promise<TeamBlueprintEdge | undefined>;
  createTeamBlueprintEdge(edge: InsertTeamBlueprintEdge): Promise<TeamBlueprintEdge>;
  updateTeamBlueprintEdge(id: string, data: Partial<TeamBlueprintEdge>): Promise<TeamBlueprintEdge | undefined>;
  deleteTeamBlueprintEdge(id: string): Promise<boolean>;

  getTraceSpans(runId: string): Promise<TraceSpan[]>;
  getTraceSpan(id: string): Promise<TraceSpan | undefined>;
  createTraceSpan(span: InsertTraceSpan): Promise<TraceSpan>;
  updateTraceSpan(id: string, data: Partial<TraceSpan>): Promise<TraceSpan | undefined>;

  getMcpTranscripts(runId: string): Promise<McpTranscript[]>;
  createMcpTranscript(transcript: InsertMcpTranscript): Promise<McpTranscript>;

  getRegistrySources(): Promise<RegistrySource[]>;
  getRegistrySource(id: string): Promise<RegistrySource | undefined>;
  createRegistrySource(source: InsertRegistrySource): Promise<RegistrySource>;
  updateRegistrySource(id: string, data: Partial<RegistrySource>): Promise<RegistrySource | undefined>;
  deleteRegistrySource(id: string): Promise<boolean>;

  getMarketplaceServers(): Promise<MarketplaceServer[]>;
  getMarketplaceServer(id: string): Promise<MarketplaceServer | undefined>;
  createMarketplaceServer(server: InsertMarketplaceServer): Promise<MarketplaceServer>;
  updateMarketplaceServer(id: string, data: Partial<MarketplaceServer>): Promise<MarketplaceServer | undefined>;

  getTrustedPublishers(): Promise<TrustedPublisher[]>;
  getTrustedPublisher(id: string): Promise<TrustedPublisher | undefined>;
  createTrustedPublisher(publisher: InsertTrustedPublisher): Promise<TrustedPublisher>;
  updateTrustedPublisher(id: string, data: Partial<TrustedPublisher>): Promise<TrustedPublisher | undefined>;
  deleteTrustedPublisher(id: string): Promise<boolean>;

  getMarketplaceInstallRequests(): Promise<MarketplaceInstallRequest[]>;
  getMarketplaceInstallRequest(id: string): Promise<MarketplaceInstallRequest | undefined>;
  createMarketplaceInstallRequest(request: InsertMarketplaceInstallRequest): Promise<MarketplaceInstallRequest>;
  updateMarketplaceInstallRequest(id: string, data: Partial<MarketplaceInstallRequest>): Promise<MarketplaceInstallRequest | undefined>;

  getPlatformSettings(): Promise<PlatformSetting[]>;
  getPlatformSetting(key: string): Promise<PlatformSetting | undefined>;
  upsertPlatformSetting(setting: InsertPlatformSetting): Promise<PlatformSetting>;

  getMcpApps(): Promise<McpApp[]>;
  getMcpApp(id: string): Promise<McpApp | undefined>;
  createMcpApp(app: InsertMcpApp): Promise<McpApp>;
  updateMcpApp(id: string, data: Partial<McpApp>): Promise<McpApp | undefined>;
  deleteMcpApp(id: string): Promise<boolean>;
  getMcpAppsByServer(serverId: string): Promise<McpApp[]>;

  getMcpAppConsents(appId: string): Promise<McpAppConsent[]>;
  getMcpAppConsentByUser(appId: string, userId: string): Promise<McpAppConsent | undefined>;
  createMcpAppConsent(consent: InsertMcpAppConsent): Promise<McpAppConsent>;
  revokeMcpAppConsent(id: string): Promise<McpAppConsent | undefined>;

  getMcpAppSessions(appId: string): Promise<McpAppSession[]>;
  getMcpAppSession(id: string): Promise<McpAppSession | undefined>;
  createMcpAppSession(session: InsertMcpAppSession): Promise<McpAppSession>;
  updateMcpAppSession(id: string, data: Partial<McpAppSession>): Promise<McpAppSession | undefined>;

  getRegulations(): Promise<Regulation[]>;
  getRegulation(id: string): Promise<Regulation | undefined>;
  createRegulation(reg: InsertRegulation): Promise<Regulation>;
  updateRegulation(id: string, data: Partial<Regulation>): Promise<Regulation | undefined>;

  getRegulatoryPolicies(): Promise<RegulatoryPolicy[]>;
  getRegulatoryPoliciesByRegulation(regulationId: string): Promise<RegulatoryPolicy[]>;
  getRegulatoryPolicy(id: string): Promise<RegulatoryPolicy | undefined>;
  createRegulatoryPolicy(policy: InsertRegulatoryPolicy): Promise<RegulatoryPolicy>;
  updateRegulatoryPolicy(id: string, data: Partial<RegulatoryPolicy>): Promise<RegulatoryPolicy | undefined>;

  getComplianceControls(): Promise<ComplianceControl[]>;
  getComplianceControlsByRegulation(regulationId: string): Promise<ComplianceControl[]>;
  createComplianceControl(control: InsertComplianceControl): Promise<ComplianceControl>;

  getRegulatoryChanges(): Promise<RegulatoryChange[]>;
  getRegulatoryChangesByRegulation(regulationId: string): Promise<RegulatoryChange[]>;
  createRegulatoryChange(change: InsertRegulatoryChange): Promise<RegulatoryChange>;
  updateRegulatoryChange(id: string, data: Partial<RegulatoryChange>): Promise<RegulatoryChange | undefined>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string) {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string) {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(user: InsertUser) {
    const [created] = await db.insert(users).values(user).returning();
    return created;
  }

  async getAgents() {
    return db.select().from(agents);
  }

  async getAgent(id: string) {
    const [agent] = await db.select().from(agents).where(eq(agents.id, id));
    return agent;
  }

  async createAgent(agent: InsertAgent) {
    const [created] = await db.insert(agents).values(agent).returning();
    return created;
  }

  async getOutcomes() {
    return db.select().from(outcomeContracts);
  }

  async getOutcome(id: string) {
    const [outcome] = await db.select().from(outcomeContracts).where(eq(outcomeContracts.id, id));
    return outcome;
  }

  async createOutcome(outcome: InsertOutcomeContract) {
    const [created] = await db.insert(outcomeContracts).values(outcome).returning();
    return created;
  }

  async getKpis() {
    return db.select().from(kpiDefinitions);
  }

  async getKpisByOutcome(outcomeId: string) {
    return db.select().from(kpiDefinitions).where(eq(kpiDefinitions.outcomeId, outcomeId));
  }

  async createKpi(kpi: InsertKpiDefinition) {
    const [created] = await db.insert(kpiDefinitions).values(kpi).returning();
    return created;
  }

  async updateKpi(id: string, data: Partial<KpiDefinition>) {
    const [updated] = await db.update(kpiDefinitions).set(data).where(eq(kpiDefinitions.id, id)).returning();
    return updated;
  }

  async deleteKpi(id: string) {
    const result = await db.delete(kpiDefinitions).where(eq(kpiDefinitions.id, id));
    return true;
  }

  async updateOutcome(id: string, data: Partial<OutcomeContract>) {
    const [updated] = await db.update(outcomeContracts).set(data).where(eq(outcomeContracts.id, id)).returning();
    return updated;
  }

  async getDeployments() {
    return db.select().from(deployments);
  }

  async getDeployment(id: string) {
    const [deployment] = await db.select().from(deployments).where(eq(deployments.id, id));
    return deployment;
  }

  async createDeployment(deployment: InsertDeployment) {
    const [created] = await db.insert(deployments).values(deployment).returning();
    return created;
  }

  async updateDeployment(id: string, data: Partial<Deployment>) {
    const [updated] = await db.update(deployments).set(data).where(eq(deployments.id, id)).returning();
    return updated;
  }

  async getDeploymentsByPromotedFrom(promotedFrom: string) {
    return db.select().from(deployments).where(eq(deployments.promotedFrom, promotedFrom));
  }

  async getTraces() {
    return db.select().from(runTraces);
  }

  async getTrace(id: string) {
    const [trace] = await db.select().from(runTraces).where(eq(runTraces.id, id));
    return trace;
  }

  async getTracesByAgent(agentId: string) {
    return db.select().from(runTraces).where(eq(runTraces.agentId, agentId));
  }

  async createTrace(trace: InsertRunTrace) {
    const [created] = await db.insert(runTraces).values(trace).returning();
    return created;
  }

  async getEvalSuites() {
    return db.select().from(evalSuites);
  }

  async getEvalsByAgent(agentId: string) {
    return db.select().from(evalSuites).where(eq(evalSuites.agentId, agentId));
  }

  async createEvalSuite(suite: InsertEvalSuite) {
    const [created] = await db.insert(evalSuites).values(suite).returning();
    return created;
  }

  async getPolicies() {
    return db.select().from(policies);
  }

  async getPolicy(id: string) {
    const [policy] = await db.select().from(policies).where(eq(policies.id, id));
    return policy;
  }

  async createPolicy(policy: InsertPolicy) {
    const [created] = await db.insert(policies).values(policy).returning();
    return created;
  }

  async updatePolicy(id: string, data: Partial<Policy>) {
    const [updated] = await db.update(policies).set(data).where(eq(policies.id, id)).returning();
    return updated;
  }

  async getApprovals() {
    return db.select().from(approvals);
  }

  async getApproval(id: string) {
    const [approval] = await db.select().from(approvals).where(eq(approvals.id, id));
    return approval;
  }

  async createApproval(approval: InsertApproval) {
    const [created] = await db.insert(approvals).values(approval).returning();
    return created;
  }

  async updateApproval(id: string, data: Partial<Approval>) {
    const [updated] = await db.update(approvals).set(data).where(eq(approvals.id, id)).returning();
    return updated;
  }

  async getAuditEvents() {
    return db.select().from(auditEvents);
  }

  async createAuditEvent(event: InsertAuditEvent) {
    const [lastEvent] = await db.select({
      sequenceNum: auditEvents.sequenceNum,
      eventHash: auditEvents.eventHash,
    }).from(auditEvents).orderBy(desc(auditEvents.sequenceNum)).limit(1);

    const prevHash = lastEvent?.eventHash || "GENESIS";
    const seqNum = (lastEvent?.sequenceNum || 0) + 1;

    const canonicalObj: Record<string, unknown> = {
      action: event.action,
      actorId: event.actorId,
      actorType: event.actorType,
      details: event.details,
      objectId: event.objectId,
      objectType: event.objectType,
      sequenceNum: seqNum,
    };
    const canonicalPayload = JSON.stringify(canonicalObj, Object.keys(canonicalObj).sort());
    const eventHash = createHash("sha256").update(prevHash + canonicalPayload).digest("hex");

    const [created] = await db.insert(auditEvents).values({
      ...event,
      sequenceNum: seqNum,
      previousHash: prevHash,
      eventHash,
    }).returning();
    return created;
  }

  async getInvoices() {
    return db.select().from(invoices);
  }

  async getInvoice(id: string) {
    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id));
    return invoice;
  }

  async createInvoice(invoice: InsertInvoice) {
    const [created] = await db.insert(invoices).values(invoice).returning();
    return created;
  }

  async updateInvoice(id: string, data: Partial<Invoice>) {
    const [updated] = await db.update(invoices).set(data).where(eq(invoices.id, id)).returning();
    return updated;
  }

  async getOutcomeEvents() {
    return db.select().from(outcomeEvents);
  }

  async getOutcomeEvent(id: string) {
    const [event] = await db.select().from(outcomeEvents).where(eq(outcomeEvents.id, id));
    return event;
  }

  async getOutcomeEventsByInvoice(invoiceId: string) {
    return db.select().from(outcomeEvents).where(eq(outcomeEvents.invoiceId, invoiceId));
  }

  async getOutcomeEventsByOutcome(outcomeId: string) {
    return db.select().from(outcomeEvents).where(eq(outcomeEvents.outcomeId, outcomeId));
  }

  async createOutcomeEvent(event: InsertOutcomeEvent) {
    const [created] = await db.insert(outcomeEvents).values(event).returning();
    return created;
  }

  async updateOutcomeEvent(id: string, data: Partial<OutcomeEvent>) {
    const [updated] = await db.update(outcomeEvents).set(data).where(eq(outcomeEvents.id, id)).returning();
    return updated;
  }

  async getBillingDisputes() {
    return db.select().from(billingDisputes);
  }

  async getBillingDisputesByInvoice(invoiceId: string) {
    return db.select().from(billingDisputes).where(eq(billingDisputes.invoiceId, invoiceId));
  }

  async createBillingDispute(dispute: InsertBillingDispute) {
    const [created] = await db.insert(billingDisputes).values(dispute).returning();
    return created;
  }

  async updateBillingDispute(id: string, data: Partial<BillingDispute>) {
    const [updated] = await db.update(billingDisputes).set(data).where(eq(billingDisputes.id, id)).returning();
    return updated;
  }

  async getAgentTemplates() {
    return db.select().from(agentTemplates);
  }

  async getAgentTemplate(id: string) {
    const [template] = await db.select().from(agentTemplates).where(eq(agentTemplates.id, id));
    return template;
  }

  async createAgentTemplate(template: InsertAgentTemplate) {
    const [created] = await db.insert(agentTemplates).values(template).returning();
    return created;
  }

  async updateAgentTemplate(id: string, data: Partial<InsertAgentTemplate>) {
    const [updated] = await db.update(agentTemplates).set(data).where(eq(agentTemplates.id, id)).returning();
    return updated;
  }

  async deleteAgentTemplate(id: string) {
    const result = await db.delete(agentTemplates).where(eq(agentTemplates.id, id));
    return true;
  }

  async getEvalSuite(id: string) {
    const [suite] = await db.select().from(evalSuites).where(eq(evalSuites.id, id));
    return suite;
  }

  async updateEvalSuite(id: string, data: Partial<EvalSuite>) {
    const [updated] = await db.update(evalSuites).set(data).where(eq(evalSuites.id, id)).returning();
    return updated;
  }

  async getEvalTestCases(suiteId: string) {
    return db.select().from(evalTestCases).where(eq(evalTestCases.suiteId, suiteId));
  }

  async createEvalTestCase(testCase: InsertEvalTestCase) {
    const [created] = await db.insert(evalTestCases).values(testCase).returning();
    return created;
  }

  async getEvalRuns(suiteId: string) {
    return db.select().from(evalRuns).where(eq(evalRuns.suiteId, suiteId));
  }

  async getEvalRunsBySuite(suiteId: string) {
    return db.select().from(evalRuns).where(eq(evalRuns.suiteId, suiteId));
  }

  async getAllEvalRuns() {
    return db.select().from(evalRuns);
  }

  async createEvalRun(run: InsertEvalRun) {
    const [created] = await db.insert(evalRuns).values(run).returning();
    return created;
  }

  async getEvalCaseResults(runId: string) {
    return db.select().from(evalCaseResults).where(eq(evalCaseResults.runId, runId));
  }

  async createEvalCaseResult(result: InsertEvalCaseResult) {
    const [created] = await db.insert(evalCaseResults).values(result).returning();
    return created;
  }

  async getEvalCaseResultsByCase(caseId: string) {
    return db.select().from(evalCaseResults).where(eq(evalCaseResults.caseId, caseId));
  }

  async updateEvalTestCase(id: string, data: Partial<EvalTestCase>) {
    const [updated] = await db.update(evalTestCases).set(data).where(eq(evalTestCases.id, id)).returning();
    return updated;
  }

  async deleteEvalTestCase(id: string) {
    await db.delete(evalTestCases).where(eq(evalTestCases.id, id));
    return true;
  }

  async updateAgent(id: string, data: Partial<Agent>) {
    const [updated] = await db.update(agents).set(data).where(eq(agents.id, id)).returning();
    return updated;
  }

  async getImprovementRecommendations() {
    return db.select().from(improvementRecommendations);
  }

  async getImprovementRecommendationsByAgent(agentId: string) {
    return db.select().from(improvementRecommendations).where(eq(improvementRecommendations.agentId, agentId));
  }

  async createImprovementRecommendation(rec: InsertImprovementRecommendation) {
    const [created] = await db.insert(improvementRecommendations).values(rec).returning();
    return created;
  }

  async updateImprovementRecommendation(id: string, data: Partial<ImprovementRecommendation>) {
    const updateData = { ...data };
    if (updateData.status === "applied" && !updateData.appliedAt) {
      updateData.appliedAt = new Date();
    }
    if (updateData.status === "dismissed" && !updateData.dismissedAt) {
      updateData.dismissedAt = new Date();
    }
    const [updated] = await db.update(improvementRecommendations).set(updateData).where(eq(improvementRecommendations.id, id)).returning();
    return updated;
  }

  async getAutonomousActionLogs() {
    return db.select().from(autonomousActionLogs);
  }

  async getAutonomousActionLogsByAgent(agentId: string) {
    return db.select().from(autonomousActionLogs).where(eq(autonomousActionLogs.agentId, agentId));
  }

  async createAutonomousActionLog(log: InsertAutonomousActionLog) {
    const [created] = await db.insert(autonomousActionLogs).values(log).returning();
    return created;
  }

  async getAgentVersions(agentId: string) {
    return db.select().from(agentVersions).where(eq(agentVersions.agentId, agentId));
  }

  async getImprovementCycles() {
    return db.select().from(improvementCycles);
  }

  async getImprovementCycleById(id: string) {
    const [cycle] = await db.select().from(improvementCycles).where(eq(improvementCycles.id, id));
    return cycle;
  }

  async getImprovementCyclesByAgent(agentId: string) {
    return db.select().from(improvementCycles).where(eq(improvementCycles.agentId, agentId));
  }

  async createImprovementCycle(cycle: InsertImprovementCycle) {
    const [created] = await db.insert(improvementCycles).values(cycle).returning();
    return created;
  }

  async updateImprovementCycle(id: string, data: Partial<ImprovementCycle>) {
    const [updated] = await db.update(improvementCycles).set(data).where(eq(improvementCycles.id, id)).returning();
    return updated;
  }

  async getPolicyExceptions() {
    return db.select().from(policyExceptions);
  }

  async getPolicyExceptionsByAgent(agentId: string) {
    return db.select().from(policyExceptions).where(eq(policyExceptions.agentId, agentId));
  }

  async createPolicyException(exception: InsertPolicyException) {
    const [created] = await db.insert(policyExceptions).values(exception).returning();
    return created;
  }

  async updatePolicyException(id: string, data: Partial<PolicyException>) {
    const [updated] = await db.update(policyExceptions).set(data).where(eq(policyExceptions.id, id)).returning();
    return updated;
  }

  async getPolicyTestCases(policyId: string) {
    return db.select().from(policyTestCases).where(eq(policyTestCases.policyId, policyId));
  }

  async createPolicyTestCase(testCase: InsertPolicyTestCase) {
    const [result] = await db.insert(policyTestCases).values(testCase).returning();
    return result;
  }

  async getComplianceReports() {
    return db.select().from(complianceReports);
  }

  async createComplianceReport(report: InsertComplianceReport) {
    const [created] = await db.insert(complianceReports).values(report).returning();
    return created;
  }

  async verifyAuditChainIntegrity() {
    const events = await db.select().from(auditEvents);
    const sorted = events
      .filter(e => e.sequenceNum !== null)
      .sort((a, b) => (a.sequenceNum || 0) - (b.sequenceNum || 0));

    if (sorted.length === 0) {
      return { valid: true, totalEvents: events.length, verifiedEvents: 0 };
    }

    let valid = true;
    let brokenAt: number | undefined;

    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].previousHash !== sorted[i - 1].eventHash) {
        valid = false;
        brokenAt = sorted[i].sequenceNum || i;
        break;
      }
    }

    return { valid, totalEvents: events.length, verifiedEvents: sorted.length, brokenAt };
  }

  async getIncidents() {
    return db.select().from(incidents);
  }

  async getIncident(id: string) {
    const [incident] = await db.select().from(incidents).where(eq(incidents.id, id));
    return incident;
  }

  async getIncidentsByAgent(agentId: string) {
    return db.select().from(incidents).where(eq(incidents.agentId, agentId));
  }

  async createIncident(incident: InsertIncident) {
    const [created] = await db.insert(incidents).values(incident).returning();
    return created;
  }

  async updateIncident(id: string, data: Partial<Incident>) {
    const [updated] = await db.update(incidents).set(data).where(eq(incidents.id, id)).returning();
    return updated;
  }

  async getPatches() {
    return db.select().from(patches);
  }

  async getPatchesByAgent(agentId: string) {
    return db.select().from(patches).where(eq(patches.agentId, agentId));
  }

  async createPatch(patch: InsertPatch) {
    const [created] = await db.insert(patches).values(patch).returning();
    return created;
  }

  async updatePatch(id: string, data: Partial<Patch>) {
    const [updated] = await db.update(patches).set(data).where(eq(patches.id, id)).returning();
    return updated;
  }

  async getExperiments() {
    return db.select().from(experiments);
  }

  async getExperimentsByAgent(agentId: string) {
    return db.select().from(experiments).where(eq(experiments.agentId, agentId));
  }

  async createExperiment(experiment: InsertExperiment) {
    const [created] = await db.insert(experiments).values(experiment).returning();
    return created;
  }

  async updateExperiment(id: string, data: Partial<Experiment>) {
    const [updated] = await db.update(experiments).set(data).where(eq(experiments.id, id)).returning();
    return updated;
  }

  async getBlueprints() {
    return db.select().from(blueprints);
  }

  async getBlueprint(id: string) {
    const [blueprint] = await db.select().from(blueprints).where(eq(blueprints.id, id));
    return blueprint;
  }

  async getBlueprintsByAgent(agentId: string) {
    return db.select().from(blueprints).where(eq(blueprints.agentId, agentId));
  }

  async createBlueprint(blueprint: InsertBlueprint) {
    const [created] = await db.insert(blueprints).values(blueprint).returning();
    return created;
  }

  async updateBlueprint(id: string, data: Partial<Blueprint>) {
    const [updated] = await db.update(blueprints).set(data).where(eq(blueprints.id, id)).returning();
    return updated;
  }

  async getLoggingIntegrations() {
    return db.select().from(loggingIntegrations);
  }

  async getLoggingIntegration(id: string) {
    const [integration] = await db.select().from(loggingIntegrations).where(eq(loggingIntegrations.id, id));
    return integration;
  }

  async createLoggingIntegration(integration: InsertLoggingIntegration) {
    const [created] = await db.insert(loggingIntegrations).values(integration).returning();
    return created;
  }

  async updateLoggingIntegration(id: string, data: Partial<LoggingIntegration>) {
    const [updated] = await db.update(loggingIntegrations).set(data).where(eq(loggingIntegrations.id, id)).returning();
    return updated;
  }

  async deleteLoggingIntegration(id: string) {
    await db.delete(loggingIntegrations).where(eq(loggingIntegrations.id, id));
    return true;
  }

  async getToolConnectors() {
    return db.select().from(toolConnectors);
  }

  async getToolConnector(id: string) {
    const [connector] = await db.select().from(toolConnectors).where(eq(toolConnectors.id, id));
    return connector;
  }

  async createToolConnector(connector: InsertToolConnector) {
    const [created] = await db.insert(toolConnectors).values(connector).returning();
    return created;
  }

  async updateToolConnector(id: string, data: Partial<ToolConnector>) {
    const [updated] = await db.update(toolConnectors).set(data).where(eq(toolConnectors.id, id)).returning();
    return updated;
  }

  async deleteToolConnector(id: string) {
    await db.delete(toolConnectors).where(eq(toolConnectors.id, id));
    return true;
  }

  async getOrgSettings() {
    const [settings] = await db.select().from(orgSettings);
    return settings;
  }
  async updateOrgSettings(data: Partial<OrgSettings>) {
    const existing = await this.getOrgSettings();
    if (existing) {
      const [updated] = await db.update(orgSettings).set({ ...data, updatedAt: new Date() }).where(eq(orgSettings.id, existing.id)).returning();
      return updated;
    }
    const [created] = await db.insert(orgSettings).values({ ...data as any }).returning();
    return created;
  }

  async getAdminUsers() {
    return db.select().from(adminUsers);
  }
  async getAdminUser(id: string) {
    const [user] = await db.select().from(adminUsers).where(eq(adminUsers.id, id));
    return user;
  }
  async createAdminUser(user: InsertAdminUser) {
    const [created] = await db.insert(adminUsers).values(user).returning();
    return created;
  }
  async updateAdminUser(id: string, data: Partial<AdminUser>) {
    const [updated] = await db.update(adminUsers).set(data).where(eq(adminUsers.id, id)).returning();
    return updated;
  }
  async deleteAdminUser(id: string) {
    const result = await db.delete(adminUsers).where(eq(adminUsers.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getEnvironmentConfigs() {
    return db.select().from(environmentConfigs);
  }
  async getEnvironmentConfig(id: string) {
    const [config] = await db.select().from(environmentConfigs).where(eq(environmentConfigs.id, id));
    return config;
  }
  async updateEnvironmentConfig(id: string, data: Partial<EnvironmentConfig>) {
    const [updated] = await db.update(environmentConfigs).set({ ...data, updatedAt: new Date() }).where(eq(environmentConfigs.id, id)).returning();
    return updated;
  }

  async getSecretRotationPolicies() {
    return db.select().from(secretRotationPolicies);
  }
  async getSecretRotationPolicy(id: string) {
    const [policy] = await db.select().from(secretRotationPolicies).where(eq(secretRotationPolicies.id, id));
    return policy;
  }
  async createSecretRotationPolicy(policy: InsertSecretRotationPolicy) {
    const [created] = await db.insert(secretRotationPolicies).values(policy).returning();
    return created;
  }
  async updateSecretRotationPolicy(id: string, data: Partial<SecretRotationPolicy>) {
    const [updated] = await db.update(secretRotationPolicies).set(data).where(eq(secretRotationPolicies.id, id)).returning();
    return updated;
  }
  async deleteSecretRotationPolicy(id: string) {
    const result = await db.delete(secretRotationPolicies).where(eq(secretRotationPolicies.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getAdminWebhooks() {
    return db.select().from(adminWebhooks);
  }
  async getAdminWebhook(id: string) {
    const [webhook] = await db.select().from(adminWebhooks).where(eq(adminWebhooks.id, id));
    return webhook;
  }
  async createAdminWebhook(webhook: InsertAdminWebhook) {
    const [created] = await db.insert(adminWebhooks).values(webhook).returning();
    return created;
  }
  async updateAdminWebhook(id: string, data: Partial<AdminWebhook>) {
    const [updated] = await db.update(adminWebhooks).set(data).where(eq(adminWebhooks.id, id)).returning();
    return updated;
  }
  async deleteAdminWebhook(id: string) {
    const result = await db.delete(adminWebhooks).where(eq(adminWebhooks.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getJob(id: string) {
    const [job] = await db.select().from(jobs).where(eq(jobs.id, id));
    return job;
  }

  async getJobsByAgent(agentId: string) {
    return db.select().from(jobs).where(eq(jobs.agentId, agentId));
  }

  async createJob(job: InsertJob) {
    const [created] = await db.insert(jobs).values(job).returning();
    return created;
  }

  async updateJob(id: string, data: Partial<Job>) {
    const [updated] = await db.update(jobs).set(data).where(eq(jobs.id, id)).returning();
    return updated;
  }

  async dequeueNextJob() {
    const [job] = await db.select().from(jobs).where(eq(jobs.status, "queued")).limit(1);
    if (!job) return undefined;
    const [claimed] = await db
      .update(jobs)
      .set({ status: "processing", startedAt: new Date() })
      .where(eq(jobs.id, job.id))
      .returning();
    return claimed;
  }

  async completeJob(id: string, result: Record<string, unknown>) {
    const [updated] = await db
      .update(jobs)
      .set({ status: "completed", result, progress: 100, completedAt: new Date() })
      .where(eq(jobs.id, id))
      .returning();
    return updated;
  }

  async failJob(id: string, error: string) {
    const [updated] = await db
      .update(jobs)
      .set({ status: "failed", error, completedAt: new Date() })
      .where(eq(jobs.id, id))
      .returning();
    return updated;
  }

  async getRunSteps(runId: string) {
    return db.select().from(runSteps).where(eq(runSteps.runId, runId));
  }

  async createRunStep(step: InsertRunStep) {
    const [created] = await db.insert(runSteps).values(step).returning();
    return created;
  }

  async updateRunStep(id: string, data: Partial<RunStep>) {
    const [updated] = await db.update(runSteps).set(data).where(eq(runSteps.id, id)).returning();
    return updated;
  }

  async getPoliciesByScope(scopeType: string, scopeId?: string) {
    if (scopeId) {
      return db.select().from(policies).where(
        eq(policies.scopeType, scopeType)
      );
    }
    return db.select().from(policies).where(eq(policies.scopeType, scopeType));
  }

  async updateTrace(id: string, data: Partial<RunTrace>) {
    const [updated] = await db.update(runTraces).set(data).where(eq(runTraces.id, id)).returning();
    return updated;
  }

  async getMcpServers() {
    return db.select().from(mcpServers);
  }

  async getMcpServer(id: string) {
    const [server] = await db.select().from(mcpServers).where(eq(mcpServers.id, id));
    return server;
  }

  async createMcpServer(server: InsertMcpServer) {
    const [created] = await db.insert(mcpServers).values(server).returning();
    return created;
  }

  async updateMcpServer(id: string, data: Partial<McpServer>) {
    const [updated] = await db.update(mcpServers).set({ ...data, updatedAt: new Date() }).where(eq(mcpServers.id, id)).returning();
    return updated;
  }

  async deleteMcpServer(id: string) {
    const result = await db.delete(mcpServers).where(eq(mcpServers.id, id));
    return true;
  }

  async getMcpServerTools(serverId: string) {
    return db.select().from(mcpServerTools).where(eq(mcpServerTools.serverId, serverId));
  }

  async getAllMcpServerTools() {
    return db.select().from(mcpServerTools);
  }

  async getMcpServerToolById(id: string) {
    const [tool] = await db.select().from(mcpServerTools).where(eq(mcpServerTools.id, id));
    return tool;
  }

  async createMcpServerTool(tool: InsertMcpServerTool) {
    const [created] = await db.insert(mcpServerTools).values(tool).returning();
    return created;
  }

  async updateMcpServerTool(id: string, data: Partial<McpServerTool>) {
    const [updated] = await db.update(mcpServerTools).set(data).where(eq(mcpServerTools.id, id)).returning();
    return updated;
  }

  async deleteMcpServerToolsByServer(serverId: string) {
    await db.delete(mcpServerTools).where(eq(mcpServerTools.serverId, serverId));
  }

  async getMcpServerResources(serverId: string) {
    return db.select().from(mcpServerResources).where(eq(mcpServerResources.serverId, serverId));
  }

  async getAllMcpServerResources() {
    return db.select().from(mcpServerResources);
  }

  async getMcpServerResourceById(id: string) {
    const [resource] = await db.select().from(mcpServerResources).where(eq(mcpServerResources.id, id));
    return resource;
  }

  async createMcpServerResource(resource: InsertMcpServerResource) {
    const [created] = await db.insert(mcpServerResources).values(resource).returning();
    return created;
  }

  async updateMcpServerResource(id: string, data: Partial<McpServerResource>) {
    const [updated] = await db.update(mcpServerResources).set(data).where(eq(mcpServerResources.id, id)).returning();
    return updated;
  }

  async deleteMcpServerResourcesByServer(serverId: string) {
    await db.delete(mcpServerResources).where(eq(mcpServerResources.serverId, serverId));
  }

  async getAllMcpServerPrompts() {
    return db.select().from(mcpServerPrompts);
  }

  async getMcpServerPrompts(serverId: string) {
    return db.select().from(mcpServerPrompts).where(eq(mcpServerPrompts.serverId, serverId));
  }

  async getMcpServerPromptById(id: string) {
    const [prompt] = await db.select().from(mcpServerPrompts).where(eq(mcpServerPrompts.id, id));
    return prompt;
  }

  async createMcpServerPrompt(prompt: InsertMcpServerPrompt) {
    const [created] = await db.insert(mcpServerPrompts).values(prompt).returning();
    return created;
  }

  async updateMcpServerPrompt(id: string, data: Partial<McpServerPrompt>) {
    const [updated] = await db.update(mcpServerPrompts).set(data).where(eq(mcpServerPrompts.id, id)).returning();
    return updated;
  }

  async deleteMcpServerPromptsByServer(serverId: string) {
    await db.delete(mcpServerPrompts).where(eq(mcpServerPrompts.serverId, serverId));
  }

  async getMcpServerAuth(serverId: string) {
    const [auth] = await db.select().from(mcpServerAuth).where(eq(mcpServerAuth.serverId, serverId));
    return auth;
  }

  async upsertMcpServerAuth(auth: InsertMcpServerAuth) {
    const existing = await this.getMcpServerAuth(auth.serverId);
    if (existing) {
      const [updated] = await db.update(mcpServerAuth).set(auth).where(eq(mcpServerAuth.serverId, auth.serverId)).returning();
      return updated;
    }
    const [created] = await db.insert(mcpServerAuth).values(auth).returning();
    return created;
  }

  async getRemoteAgents() {
    return db.select().from(remoteAgents);
  }
  async getRemoteAgent(id: string) {
    const [r] = await db.select().from(remoteAgents).where(eq(remoteAgents.id, id));
    return r;
  }
  async getRemoteAgentByAgentId(agentId: string) {
    const [r] = await db.select().from(remoteAgents).where(eq(remoteAgents.agentId, agentId));
    return r;
  }
  async createRemoteAgent(remote: InsertRemoteAgent) {
    const [created] = await db.insert(remoteAgents).values(remote).returning();
    return created;
  }
  async updateRemoteAgent(id: string, data: Partial<RemoteAgent>) {
    const [updated] = await db.update(remoteAgents).set(data).where(eq(remoteAgents.id, id)).returning();
    return updated;
  }
  async deleteRemoteAgent(id: string) {
    await db.delete(remoteAgents).where(eq(remoteAgents.id, id));
    return true;
  }
  async getAgentTeamMembers(teamAgentId: string) {
    return db.select().from(agentTeams).where(eq(agentTeams.teamAgentId, teamAgentId));
  }
  async createAgentTeamMember(member: InsertAgentTeam) {
    const [created] = await db.insert(agentTeams).values(member).returning();
    return created;
  }
  async deleteAgentTeamMember(id: string) {
    await db.delete(agentTeams).where(eq(agentTeams.id, id));
    return true;
  }
  async getAgentTeamsByMember(memberAgentId: string) {
    return db.select().from(agentTeams).where(eq(agentTeams.memberAgentId, memberAgentId));
  }

  async getMcpElicitations() {
    return db.select().from(mcpElicitations).orderBy(desc(mcpElicitations.createdAt));
  }
  async getMcpElicitation(id: string) {
    const [r] = await db.select().from(mcpElicitations).where(eq(mcpElicitations.id, id));
    return r;
  }
  async getMcpElicitationsByStatus(status: string) {
    return db.select().from(mcpElicitations).where(eq(mcpElicitations.status, status)).orderBy(desc(mcpElicitations.createdAt));
  }
  async createMcpElicitation(elicitation: InsertMcpElicitation) {
    const [created] = await db.insert(mcpElicitations).values(elicitation).returning();
    return created;
  }
  async updateMcpElicitation(id: string, data: Partial<McpElicitation>) {
    const [updated] = await db.update(mcpElicitations).set(data).where(eq(mcpElicitations.id, id)).returning();
    return updated;
  }

  async getTeamBlueprintNodes(blueprintId: string) {
    return db.select().from(teamBlueprintNodes).where(eq(teamBlueprintNodes.blueprintId, blueprintId));
  }
  async getTeamBlueprintNode(id: string) {
    const [n] = await db.select().from(teamBlueprintNodes).where(eq(teamBlueprintNodes.id, id));
    return n;
  }
  async createTeamBlueprintNode(node: InsertTeamBlueprintNode) {
    const [created] = await db.insert(teamBlueprintNodes).values(node).returning();
    return created;
  }
  async updateTeamBlueprintNode(id: string, data: Partial<TeamBlueprintNode>) {
    const [updated] = await db.update(teamBlueprintNodes).set(data).where(eq(teamBlueprintNodes.id, id)).returning();
    return updated;
  }
  async deleteTeamBlueprintNode(id: string) {
    await db.delete(teamBlueprintEdges).where(
      eq(teamBlueprintEdges.sourceNodeId, id)
    );
    await db.delete(teamBlueprintEdges).where(
      eq(teamBlueprintEdges.targetNodeId, id)
    );
    await db.delete(teamBlueprintNodes).where(eq(teamBlueprintNodes.id, id));
    return true;
  }

  async getTeamBlueprintEdges(blueprintId: string) {
    return db.select().from(teamBlueprintEdges).where(eq(teamBlueprintEdges.blueprintId, blueprintId));
  }
  async getTeamBlueprintEdge(id: string) {
    const [e] = await db.select().from(teamBlueprintEdges).where(eq(teamBlueprintEdges.id, id));
    return e;
  }
  async createTeamBlueprintEdge(edge: InsertTeamBlueprintEdge) {
    const [created] = await db.insert(teamBlueprintEdges).values(edge).returning();
    return created;
  }
  async updateTeamBlueprintEdge(id: string, data: Partial<TeamBlueprintEdge>) {
    const [updated] = await db.update(teamBlueprintEdges).set(data).where(eq(teamBlueprintEdges.id, id)).returning();
    return updated;
  }
  async deleteTeamBlueprintEdge(id: string) {
    await db.delete(teamBlueprintEdges).where(eq(teamBlueprintEdges.id, id));
    return true;
  }

  async getTraceSpans(runId: string) {
    return db.select().from(traceSpans).where(eq(traceSpans.runId, runId)).orderBy(traceSpans.startedAt);
  }
  async getTraceSpan(id: string) {
    const [s] = await db.select().from(traceSpans).where(eq(traceSpans.id, id));
    return s;
  }
  async createTraceSpan(span: InsertTraceSpan) {
    const [created] = await db.insert(traceSpans).values(span).returning();
    return created;
  }
  async updateTraceSpan(id: string, data: Partial<TraceSpan>) {
    const [updated] = await db.update(traceSpans).set(data).where(eq(traceSpans.id, id)).returning();
    return updated;
  }

  async getMcpTranscripts(runId: string) {
    return db.select().from(mcpTranscripts).where(eq(mcpTranscripts.runId, runId)).orderBy(mcpTranscripts.sequenceNum);
  }
  async createMcpTranscript(transcript: InsertMcpTranscript) {
    const [created] = await db.insert(mcpTranscripts).values(transcript).returning();
    return created;
  }
  async getRegistrySources() {
    return db.select().from(registrySources);
  }
  async getRegistrySource(id: string) {
    const [source] = await db.select().from(registrySources).where(eq(registrySources.id, id));
    return source;
  }
  async createRegistrySource(source: InsertRegistrySource) {
    const [created] = await db.insert(registrySources).values(source).returning();
    return created;
  }
  async updateRegistrySource(id: string, data: Partial<RegistrySource>) {
    const [updated] = await db.update(registrySources).set(data).where(eq(registrySources.id, id)).returning();
    return updated;
  }
  async deleteRegistrySource(id: string) {
    const result = await db.delete(registrySources).where(eq(registrySources.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getMarketplaceServers() {
    return db.select().from(marketplaceServers);
  }
  async getMarketplaceServer(id: string) {
    const [server] = await db.select().from(marketplaceServers).where(eq(marketplaceServers.id, id));
    return server;
  }
  async createMarketplaceServer(server: InsertMarketplaceServer) {
    const [created] = await db.insert(marketplaceServers).values(server).returning();
    return created;
  }
  async updateMarketplaceServer(id: string, data: Partial<MarketplaceServer>) {
    const [updated] = await db.update(marketplaceServers).set(data).where(eq(marketplaceServers.id, id)).returning();
    return updated;
  }

  async getTrustedPublishers() {
    return db.select().from(trustedPublishers);
  }
  async getTrustedPublisher(id: string) {
    const [publisher] = await db.select().from(trustedPublishers).where(eq(trustedPublishers.id, id));
    return publisher;
  }
  async createTrustedPublisher(publisher: InsertTrustedPublisher) {
    const [created] = await db.insert(trustedPublishers).values(publisher).returning();
    return created;
  }
  async updateTrustedPublisher(id: string, data: Partial<TrustedPublisher>) {
    const [updated] = await db.update(trustedPublishers).set(data).where(eq(trustedPublishers.id, id)).returning();
    return updated;
  }
  async deleteTrustedPublisher(id: string) {
    const result = await db.delete(trustedPublishers).where(eq(trustedPublishers.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getMarketplaceInstallRequests() {
    return db.select().from(marketplaceInstallRequests);
  }
  async getMarketplaceInstallRequest(id: string) {
    const [request] = await db.select().from(marketplaceInstallRequests).where(eq(marketplaceInstallRequests.id, id));
    return request;
  }
  async createMarketplaceInstallRequest(request: InsertMarketplaceInstallRequest) {
    const [created] = await db.insert(marketplaceInstallRequests).values(request).returning();
    return created;
  }
  async updateMarketplaceInstallRequest(id: string, data: Partial<MarketplaceInstallRequest>) {
    const [updated] = await db.update(marketplaceInstallRequests).set(data).where(eq(marketplaceInstallRequests.id, id)).returning();
    return updated;
  }

  async getPlatformSettings() {
    return db.select().from(platformSettings);
  }
  async getPlatformSetting(key: string) {
    const [setting] = await db.select().from(platformSettings).where(eq(platformSettings.key, key));
    return setting;
  }
  async upsertPlatformSetting(setting: InsertPlatformSetting) {
    const [upserted] = await db
      .insert(platformSettings)
      .values(setting)
      .onConflictDoUpdate({
        target: platformSettings.key,
        set: { value: setting.value, description: setting.description, category: setting.category, updatedAt: new Date() },
      })
      .returning();
    return upserted;
  }
  async getMcpApps() {
    return db.select().from(mcpApps);
  }
  async getMcpApp(id: string) {
    const [app] = await db.select().from(mcpApps).where(eq(mcpApps.id, id));
    return app;
  }
  async createMcpApp(app: InsertMcpApp) {
    const [created] = await db.insert(mcpApps).values(app).returning();
    return created;
  }
  async updateMcpApp(id: string, data: Partial<McpApp>) {
    const [updated] = await db.update(mcpApps).set({ ...data, updatedAt: new Date() }).where(eq(mcpApps.id, id)).returning();
    return updated;
  }
  async deleteMcpApp(id: string) {
    const result = await db.delete(mcpApps).where(eq(mcpApps.id, id));
    return (result.rowCount ?? 0) > 0;
  }
  async getMcpAppsByServer(serverId: string) {
    return db.select().from(mcpApps).where(eq(mcpApps.serverId, serverId));
  }

  async getMcpAppConsents(appId: string) {
    return db.select().from(mcpAppConsents).where(eq(mcpAppConsents.appId, appId));
  }
  async getMcpAppConsentByUser(appId: string, userId: string) {
    const results = await db.select().from(mcpAppConsents).where(eq(mcpAppConsents.appId, appId));
    return results.find(c => c.userId === userId);
  }
  async createMcpAppConsent(consent: InsertMcpAppConsent) {
    const [created] = await db.insert(mcpAppConsents).values(consent).returning();
    return created;
  }
  async revokeMcpAppConsent(id: string) {
    const [updated] = await db.update(mcpAppConsents).set({ status: "revoked", revokedAt: new Date() }).where(eq(mcpAppConsents.id, id)).returning();
    return updated;
  }

  async getMcpAppSessions(appId: string) {
    return db.select().from(mcpAppSessions).where(eq(mcpAppSessions.appId, appId));
  }
  async getMcpAppSession(id: string) {
    const [session] = await db.select().from(mcpAppSessions).where(eq(mcpAppSessions.id, id));
    return session;
  }
  async createMcpAppSession(session: InsertMcpAppSession) {
    const [created] = await db.insert(mcpAppSessions).values(session).returning();
    return created;
  }
  async updateMcpAppSession(id: string, data: Partial<McpAppSession>) {
    const [updated] = await db.update(mcpAppSessions).set(data).where(eq(mcpAppSessions.id, id)).returning();
    return updated;
  }

  async getRegulations() {
    return db.select().from(regulations);
  }
  async getRegulation(id: string) {
    const [reg] = await db.select().from(regulations).where(eq(regulations.id, id));
    return reg;
  }
  async createRegulation(reg: InsertRegulation) {
    const [created] = await db.insert(regulations).values(reg).returning();
    return created;
  }
  async updateRegulation(id: string, data: Partial<Regulation>) {
    const [updated] = await db.update(regulations).set(data).where(eq(regulations.id, id)).returning();
    return updated;
  }

  async getRegulatoryPolicies() {
    return db.select().from(regulatoryPolicies);
  }
  async getRegulatoryPoliciesByRegulation(regulationId: string) {
    return db.select().from(regulatoryPolicies).where(eq(regulatoryPolicies.regulationId, regulationId));
  }
  async getRegulatoryPolicy(id: string) {
    const [policy] = await db.select().from(regulatoryPolicies).where(eq(regulatoryPolicies.id, id));
    return policy;
  }
  async createRegulatoryPolicy(policy: InsertRegulatoryPolicy) {
    const [created] = await db.insert(regulatoryPolicies).values(policy).returning();
    return created;
  }
  async updateRegulatoryPolicy(id: string, data: Partial<RegulatoryPolicy>) {
    const [updated] = await db.update(regulatoryPolicies).set(data).where(eq(regulatoryPolicies.id, id)).returning();
    return updated;
  }

  async getComplianceControls() {
    return db.select().from(complianceControls);
  }
  async getComplianceControlsByRegulation(regulationId: string) {
    return db.select().from(complianceControls).where(eq(complianceControls.regulationId, regulationId));
  }
  async createComplianceControl(control: InsertComplianceControl) {
    const [created] = await db.insert(complianceControls).values(control).returning();
    return created;
  }

  async getRegulatoryChanges() {
    return db.select().from(regulatoryChanges);
  }
  async getRegulatoryChangesByRegulation(regulationId: string) {
    return db.select().from(regulatoryChanges).where(eq(regulatoryChanges.regulationId, regulationId));
  }
  async createRegulatoryChange(change: InsertRegulatoryChange) {
    const [created] = await db.insert(regulatoryChanges).values(change).returning();
    return created;
  }
  async updateRegulatoryChange(id: string, data: Partial<RegulatoryChange>) {
    const [updated] = await db.update(regulatoryChanges).set(data).where(eq(regulatoryChanges.id, id)).returning();
    return updated;
  }
}

export const storage = new DatabaseStorage();
