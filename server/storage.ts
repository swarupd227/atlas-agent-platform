import { eq, desc, inArray, and, like, or } from "drizzle-orm";
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
  ontologyConcepts,
  type OntologyConcept, type InsertOntologyConcept,
  ontologyEnhancements,
  type OntologyEnhancement, type InsertOntologyEnhancement,
  skills,
  type Skill, type InsertSkill,
  skillVersions,
  type SkillVersion, type InsertSkillVersion,
  skillChains,
  type SkillChain, type InsertSkillChain,
  goldenDatasets,
  type GoldenDataset, type InsertGoldenDataset,
  goldenTestCases,
  type GoldenTestCase, type InsertGoldenTestCase,
  goldenDataRecords,
  type GoldenDataRecord, type InsertGoldenDataRecord,
  contextProfiles,
  type ContextProfile, type InsertContextProfile,
  memoryProfiles,
  type MemoryProfile, type InsertMemoryProfile,
  agentMemories,
  type AgentMemory, type InsertAgentMemory,
  ragPipelines,
  type RagPipeline, type InsertRagPipeline,
  knowledgeConnectors, type KnowledgeConnector, type InsertKnowledgeConnector,
  entityResolutions, type EntityResolution, type InsertEntityResolution,
  relationshipExtractions, type RelationshipExtraction, type InsertRelationshipExtraction,
  temporalGraphEntries, type TemporalGraphEntry, type InsertTemporalGraphEntry,
  autonomyProfiles, type AutonomyProfile, type InsertAutonomyProfile,
  oversightDecisions, type OversightDecision, type InsertOversightDecision,
  shadowTraces, type ShadowTrace, type InsertShadowTrace,
  shadowReplaySessions, type ShadowReplaySession, type InsertShadowReplaySession,
  canaryDeployments, type CanaryDeployment, type InsertCanaryDeployment,
  healingPipelines, type HealingPipeline, type InsertHealingPipeline,
  runbooks, type Runbook, type InsertRunbook,
  agentMcpServers, type AgentMcpServer, type InsertAgentMcpServer,
  agentPipelines, type AgentPipeline, type InsertAgentPipeline,
  pipelineRuns, type PipelineRun, type InsertPipelineRun,
  mcpParameterMatches, type McpParameterMatch, type InsertMcpParameterMatch,
  agentRuntimeRuns, type AgentRuntimeRun, type InsertAgentRuntimeRun,
  agentProposals, type AgentProposal, type InsertAgentProposal,
  agentApiKeys, type AgentApiKey, type InsertAgentApiKey,
  agentChannels, type AgentChannel, type InsertAgentChannel,
  knowledgeBases, type KnowledgeBase, type InsertKnowledgeBase,
  knowledgeSources, type KnowledgeSource, type InsertKnowledgeSource,
  knowledgeChunks, type KnowledgeChunk, type InsertKnowledgeChunk,
  agentKnowledgeBases, type AgentKnowledgeBase, type InsertAgentKnowledgeBase,
  autonomyDecisions, type AutonomyDecision, type InsertAutonomyDecision,
  decisionQualityProfiles, type DecisionQualityProfile, type InsertDecisionQualityProfile,
  autonomyBoundaryProposals, type AutonomyBoundaryProposal, type InsertAutonomyBoundaryProposal,
  contextEconomics, type ContextEconomics, type InsertContextEconomics,
  contextRecommendations, type ContextRecommendation, type InsertContextRecommendation,
  agentTriggers, type AgentTrigger, type InsertAgentTrigger,
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
  deleteOutcome(id: string): Promise<boolean>;

  getDeployments(): Promise<Deployment[]>;
  getDeployment(id: string): Promise<Deployment | undefined>;
  createDeployment(deployment: InsertDeployment): Promise<Deployment>;
  updateDeployment(id: string, data: Partial<Deployment>): Promise<Deployment | undefined>;
  getDeploymentsByAgentId(agentId: string, status?: string): Promise<Deployment[]>;
  getDeploymentsByPromotedFrom(promotedFrom: string): Promise<Deployment[]>;

  getTraces(): Promise<RunTrace[]>;
  getTrace(id: string): Promise<RunTrace | undefined>;
  getTracesByAgent(agentId: string): Promise<RunTrace[]>;
  getRecentCompletedTracesByAgent(agentId: string, limit?: number): Promise<RunTrace[]>;
  createTrace(trace: InsertRunTrace): Promise<RunTrace>;

  getEvalSuites(): Promise<EvalSuite[]>;
  getEvalsByAgent(agentId: string): Promise<EvalSuite[]>;
  createEvalSuite(suite: InsertEvalSuite): Promise<EvalSuite>;

  getPolicies(): Promise<Policy[]>;
  getPolicy(id: string): Promise<Policy | undefined>;
  createPolicy(policy: InsertPolicy): Promise<Policy>;
  updatePolicy(id: string, data: Partial<Policy>): Promise<Policy | undefined>;
  deletePolicy(id: string): Promise<boolean>;

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
  getEvalTestCase(id: string): Promise<EvalTestCase | undefined>;
  createEvalTestCase(testCase: InsertEvalTestCase): Promise<EvalTestCase>;

  getEvalRuns(suiteId: string): Promise<EvalRun[]>;
  getEvalRunsBySuite(suiteId: string): Promise<EvalRun[]>;
  getAllEvalRuns(): Promise<EvalRun[]>;
  createEvalRun(run: InsertEvalRun): Promise<EvalRun>;
  updateEvalRun(id: string, data: Partial<InsertEvalRun>): Promise<EvalRun | undefined>;
  getEvalSuitesBySkill(skillId: string): Promise<EvalSuite[]>;
  getEvalRunsBySkill(skillId: string): Promise<EvalRun[]>;
  getLatestEvalRunBySkill(skillId: string): Promise<EvalRun | undefined>;

  getEvalCaseResults(runId: string): Promise<EvalCaseResult[]>;
  createEvalCaseResult(result: InsertEvalCaseResult): Promise<EvalCaseResult>;
  getEvalCaseResultsByCase(caseId: string): Promise<EvalCaseResult[]>;

  updateEvalTestCase(id: string, data: Partial<EvalTestCase>): Promise<EvalTestCase | undefined>;
  deleteEvalTestCase(id: string): Promise<boolean>;

  updateAgent(id: string, data: Partial<Agent>): Promise<Agent | undefined>;
  deleteAgent(id: string): Promise<boolean>;

  getImprovementRecommendations(): Promise<ImprovementRecommendation[]>;
  getImprovementRecommendationsByAgent(agentId: string): Promise<ImprovementRecommendation[]>;
  createImprovementRecommendation(rec: InsertImprovementRecommendation): Promise<ImprovementRecommendation>;
  updateImprovementRecommendation(id: string, data: Partial<ImprovementRecommendation>): Promise<ImprovementRecommendation | undefined>;

  getAutonomousActionLogs(): Promise<AutonomousActionLog[]>;
  getAutonomousActionLogsByAgent(agentId: string): Promise<AutonomousActionLog[]>;
  createAutonomousActionLog(log: InsertAutonomousActionLog): Promise<AutonomousActionLog>;

  getAgentVersions(agentId: string): Promise<AgentVersion[]>;
  ensureAgentVersion(agentId: string, semver: string, status?: string): Promise<AgentVersion>;

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

  getAgentMcpServers(agentId: string): Promise<AgentMcpServer[]>;
  createAgentMcpServer(link: InsertAgentMcpServer): Promise<AgentMcpServer>;
  deleteAgentMcpServer(id: string): Promise<boolean>;
  getAgentMcpServerByIds(agentId: string, serverId: string): Promise<AgentMcpServer | undefined>;

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

  getAllOntologyConcepts(): Promise<OntologyConcept[]>;
  getOntologyConcepts(industryId: string): Promise<OntologyConcept[]>;
  getOntologyConcept(id: string): Promise<OntologyConcept | undefined>;
  createOntologyConcept(concept: InsertOntologyConcept): Promise<OntologyConcept>;
  updateOntologyConcept(id: string, data: Partial<OntologyConcept>): Promise<OntologyConcept | undefined>;
  deleteOntologyConcept(id: string): Promise<boolean>;

  getOntologyEnhancement(conceptId: string): Promise<OntologyEnhancement | undefined>;
  getOntologyEnhancements(conceptIds: string[]): Promise<OntologyEnhancement[]>;
  createOntologyEnhancement(enhancement: InsertOntologyEnhancement): Promise<OntologyEnhancement>;
  updateOntologyEnhancement(id: string, data: Partial<OntologyEnhancement>): Promise<OntologyEnhancement | undefined>;

  getSkills(): Promise<Skill[]>;
  getSkill(id: string): Promise<Skill | undefined>;
  getSkillsByIds(ids: string[]): Promise<Skill[]>;
  createSkill(skill: InsertSkill): Promise<Skill>;
  updateSkill(id: string, data: Partial<Skill>): Promise<Skill | undefined>;
  deleteSkill(id: string): Promise<boolean>;

  getSkillVersions(skillId: string): Promise<SkillVersion[]>;
  getSkillVersion(id: string): Promise<SkillVersion | undefined>;
  createSkillVersion(version: InsertSkillVersion): Promise<SkillVersion>;
  updateSkillVersion(id: string, data: Partial<SkillVersion>): Promise<SkillVersion | undefined>;

  getSkillChains(): Promise<SkillChain[]>;
  getSkillChain(id: string): Promise<SkillChain | undefined>;
  createSkillChain(chain: InsertSkillChain): Promise<SkillChain>;
  updateSkillChain(id: string, data: Partial<SkillChain>): Promise<SkillChain | undefined>;
  deleteSkillChain(id: string): Promise<boolean>;

  getGoldenDatasets(): Promise<GoldenDataset[]>;
  getGoldenDataset(id: string): Promise<GoldenDataset | undefined>;
  createGoldenDataset(dataset: InsertGoldenDataset): Promise<GoldenDataset>;
  updateGoldenDataset(id: string, data: Partial<GoldenDataset>): Promise<GoldenDataset | undefined>;
  deleteGoldenDataset(id: string): Promise<boolean>;

  getGoldenTestCases(datasetId: string): Promise<GoldenTestCase[]>;
  getGoldenTestCase(id: string): Promise<GoldenTestCase | undefined>;
  createGoldenTestCase(testCase: InsertGoldenTestCase): Promise<GoldenTestCase>;
  updateGoldenTestCase(id: string, data: Partial<GoldenTestCase>): Promise<GoldenTestCase | undefined>;
  deleteGoldenTestCase(id: string): Promise<boolean>;

  getGoldenDataRecords(datasetId: string): Promise<GoldenDataRecord[]>;
  createGoldenDataRecord(record: InsertGoldenDataRecord): Promise<GoldenDataRecord>;
  bulkCreateGoldenDataRecords(records: InsertGoldenDataRecord[]): Promise<GoldenDataRecord[]>;
  deleteGoldenDataRecord(id: string): Promise<boolean>;

  getContextProfiles(): Promise<ContextProfile[]>;
  getContextProfile(id: string): Promise<ContextProfile | undefined>;
  createContextProfile(profile: InsertContextProfile): Promise<ContextProfile>;
  updateContextProfile(id: string, data: Partial<InsertContextProfile>): Promise<ContextProfile | undefined>;
  deleteContextProfile(id: string): Promise<boolean>;

  getMemoryProfiles(): Promise<MemoryProfile[]>;
  getMemoryProfile(id: string): Promise<MemoryProfile | undefined>;
  createMemoryProfile(profile: InsertMemoryProfile): Promise<MemoryProfile>;
  updateMemoryProfile(id: string, data: Partial<InsertMemoryProfile>): Promise<MemoryProfile | undefined>;
  deleteMemoryProfile(id: string): Promise<boolean>;

  saveAgentMemory(agentId: string, memoryType: string, content: string, metadata?: any, expiresAt?: Date): Promise<AgentMemory>;
  getAgentMemories(agentId: string, memoryType: string, limit?: number): Promise<AgentMemory[]>;
  getAllAgentMemories(agentId: string): Promise<AgentMemory[]>;
  pruneExpiredMemories(agentId: string): Promise<number>;

  getRagPipelines(): Promise<RagPipeline[]>;
  getRagPipeline(id: string): Promise<RagPipeline | undefined>;
  createRagPipeline(pipeline: InsertRagPipeline): Promise<RagPipeline>;
  updateRagPipeline(id: string, data: Partial<InsertRagPipeline>): Promise<RagPipeline | undefined>;
  deleteRagPipeline(id: string): Promise<boolean>;

  getKnowledgeConnectors(): Promise<KnowledgeConnector[]>;
  getKnowledgeConnector(id: string): Promise<KnowledgeConnector | undefined>;
  createKnowledgeConnector(connector: InsertKnowledgeConnector): Promise<KnowledgeConnector>;
  updateKnowledgeConnector(id: string, data: Partial<InsertKnowledgeConnector>): Promise<KnowledgeConnector | undefined>;
  deleteKnowledgeConnector(id: string): Promise<boolean>;

  getEntityResolutions(): Promise<EntityResolution[]>;
  getEntityResolution(id: string): Promise<EntityResolution | undefined>;
  createEntityResolution(resolution: InsertEntityResolution): Promise<EntityResolution>;
  updateEntityResolution(id: string, data: Partial<InsertEntityResolution>): Promise<EntityResolution | undefined>;
  deleteEntityResolution(id: string): Promise<boolean>;

  getRelationshipExtractions(): Promise<RelationshipExtraction[]>;
  getRelationshipExtraction(id: string): Promise<RelationshipExtraction | undefined>;
  createRelationshipExtraction(extraction: InsertRelationshipExtraction): Promise<RelationshipExtraction>;
  updateRelationshipExtraction(id: string, data: Partial<InsertRelationshipExtraction>): Promise<RelationshipExtraction | undefined>;
  deleteRelationshipExtraction(id: string): Promise<boolean>;

  getTemporalGraphEntries(): Promise<TemporalGraphEntry[]>;
  getTemporalGraphEntry(id: string): Promise<TemporalGraphEntry | undefined>;
  createTemporalGraphEntry(entry: InsertTemporalGraphEntry): Promise<TemporalGraphEntry>;
  updateTemporalGraphEntry(id: string, data: Partial<InsertTemporalGraphEntry>): Promise<TemporalGraphEntry | undefined>;
  deleteTemporalGraphEntry(id: string): Promise<boolean>;

  getAutonomyProfiles(): Promise<AutonomyProfile[]>;
  getAutonomyProfile(id: string): Promise<AutonomyProfile | undefined>;
  createAutonomyProfile(profile: InsertAutonomyProfile): Promise<AutonomyProfile>;
  updateAutonomyProfile(id: string, data: Partial<InsertAutonomyProfile>): Promise<AutonomyProfile | undefined>;
  deleteAutonomyProfile(id: string): Promise<boolean>;

  getOversightDecisions(): Promise<OversightDecision[]>;
  getOversightDecision(id: string): Promise<OversightDecision | undefined>;
  createOversightDecision(decision: InsertOversightDecision): Promise<OversightDecision>;
  updateOversightDecision(id: string, data: Partial<InsertOversightDecision>): Promise<OversightDecision | undefined>;
  deleteOversightDecision(id: string): Promise<boolean>;

  getShadowTraces(): Promise<ShadowTrace[]>;
  getShadowTrace(id: string): Promise<ShadowTrace | undefined>;
  createShadowTrace(trace: InsertShadowTrace): Promise<ShadowTrace>;
  updateShadowTrace(id: string, data: Partial<InsertShadowTrace>): Promise<ShadowTrace | undefined>;
  deleteShadowTrace(id: string): Promise<boolean>;

  getShadowReplaySessions(): Promise<ShadowReplaySession[]>;
  getShadowReplaySession(id: string): Promise<ShadowReplaySession | undefined>;
  createShadowReplaySession(session: InsertShadowReplaySession): Promise<ShadowReplaySession>;
  updateShadowReplaySession(id: string, data: Partial<InsertShadowReplaySession>): Promise<ShadowReplaySession | undefined>;
  deleteShadowReplaySession(id: string): Promise<boolean>;

  getCanaryDeployments(): Promise<CanaryDeployment[]>;
  getCanaryDeployment(id: string): Promise<CanaryDeployment | undefined>;
  createCanaryDeployment(deployment: InsertCanaryDeployment): Promise<CanaryDeployment>;
  updateCanaryDeployment(id: string, data: Partial<InsertCanaryDeployment>): Promise<CanaryDeployment | undefined>;
  deleteCanaryDeployment(id: string): Promise<boolean>;

  getHealingPipelines(): Promise<HealingPipeline[]>;
  getHealingPipeline(id: string): Promise<HealingPipeline | undefined>;
  createHealingPipeline(pipeline: InsertHealingPipeline): Promise<HealingPipeline>;
  updateHealingPipeline(id: string, data: Partial<InsertHealingPipeline>): Promise<HealingPipeline | undefined>;
  deleteHealingPipeline(id: string): Promise<boolean>;

  getRunbooks(): Promise<Runbook[]>;
  getRunbook(id: string): Promise<Runbook | undefined>;
  createRunbook(runbook: InsertRunbook): Promise<Runbook>;
  updateRunbook(id: string, data: Partial<InsertRunbook>): Promise<Runbook | undefined>;
  deleteRunbook(id: string): Promise<boolean>;

  getAgentPipelines(): Promise<AgentPipeline[]>;
  getAgentPipeline(id: string): Promise<AgentPipeline | undefined>;
  createAgentPipeline(pipeline: InsertAgentPipeline): Promise<AgentPipeline>;
  updateAgentPipeline(id: string, data: Partial<InsertAgentPipeline>): Promise<AgentPipeline | undefined>;
  deleteAgentPipeline(id: string): Promise<boolean>;

  getPipelineRuns(pipelineId: string): Promise<PipelineRun[]>;
  getPipelineRun(id: string): Promise<PipelineRun | undefined>;
  createPipelineRun(run: InsertPipelineRun): Promise<PipelineRun>;
  updatePipelineRun(id: string, data: Partial<PipelineRun>): Promise<PipelineRun | undefined>;

  getMcpParameterMatches(serverId: string): Promise<McpParameterMatch[]>;
  createMcpParameterMatch(match: InsertMcpParameterMatch): Promise<McpParameterMatch>;
  deleteMcpParameterMatchesByServer(serverId: string): Promise<void>;

  getAgentRuntimeRuns(agentId?: string): Promise<AgentRuntimeRun[]>;
  getAgentRuntimeRun(id: string): Promise<AgentRuntimeRun | undefined>;
  createAgentRuntimeRun(run: InsertAgentRuntimeRun): Promise<AgentRuntimeRun>;
  updateAgentRuntimeRun(id: string, data: Partial<AgentRuntimeRun>): Promise<AgentRuntimeRun | undefined>;
  getActiveRuntimeRuns(): Promise<AgentRuntimeRun[]>;

  getAgentProposalByOutcome(outcomeId: string): Promise<AgentProposal | undefined>;
  createAgentProposal(proposal: InsertAgentProposal): Promise<AgentProposal>;
  updateAgentProposal(id: string, data: Partial<AgentProposal>): Promise<AgentProposal | undefined>;
  deleteAgentProposal(id: string): Promise<boolean>;

  getAgentApiKeys(agentId: string): Promise<AgentApiKey[]>;
  getAgentApiKey(id: string): Promise<AgentApiKey | undefined>;
  getAgentApiKeyByHash(keyHash: string): Promise<AgentApiKey | undefined>;
  createAgentApiKey(key: InsertAgentApiKey): Promise<AgentApiKey>;
  updateAgentApiKey(id: string, data: Partial<AgentApiKey>): Promise<AgentApiKey | undefined>;
  deleteAgentApiKey(id: string): Promise<boolean>;

  getAgentChannels(agentId: string): Promise<AgentChannel[]>;
  getAgentChannel(id: string): Promise<AgentChannel | undefined>;
  getAgentChannelByWebhook(webhookUrl: string): Promise<AgentChannel | undefined>;
  getAgentChannelByWebhookPath(webhookPath: string): Promise<AgentChannel | undefined>;
  getAgentChannelByToken(token: string, channelType: string): Promise<AgentChannel | undefined>;
  createAgentChannel(channel: InsertAgentChannel): Promise<AgentChannel>;
  updateAgentChannel(id: string, data: Partial<AgentChannel>): Promise<AgentChannel | undefined>;
  deleteAgentChannel(id: string): Promise<boolean>;

  getKnowledgeBases(): Promise<KnowledgeBase[]>;
  getKnowledgeBase(id: string): Promise<KnowledgeBase | undefined>;
  createKnowledgeBase(kb: InsertKnowledgeBase): Promise<KnowledgeBase>;
  updateKnowledgeBase(id: string, data: Partial<KnowledgeBase>): Promise<KnowledgeBase | undefined>;
  deleteKnowledgeBase(id: string): Promise<boolean>;

  getKnowledgeSources(kbId: string): Promise<KnowledgeSource[]>;
  getKnowledgeSource(id: string): Promise<KnowledgeSource | undefined>;
  createKnowledgeSource(source: InsertKnowledgeSource): Promise<KnowledgeSource>;
  updateKnowledgeSource(id: string, data: Partial<KnowledgeSource>): Promise<KnowledgeSource | undefined>;
  deleteKnowledgeSource(id: string): Promise<boolean>;

  getKnowledgeChunks(kbId: string): Promise<KnowledgeChunk[]>;
  getKnowledgeChunksBySource(sourceId: string): Promise<KnowledgeChunk[]>;
  createKnowledgeChunk(chunk: InsertKnowledgeChunk): Promise<KnowledgeChunk>;
  deleteKnowledgeChunksBySource(sourceId: string): Promise<boolean>;

  getAgentKnowledgeBases(agentId: string): Promise<AgentKnowledgeBase[]>;
  getKnowledgeBaseAgents(kbId: string): Promise<AgentKnowledgeBase[]>;
  createAgentKnowledgeBase(link: InsertAgentKnowledgeBase): Promise<AgentKnowledgeBase>;
  deleteAgentKnowledgeBase(id: string): Promise<boolean>;

  getAutonomyDecisions(filters?: { agentId?: string; decisionType?: string; industry?: string; outcome?: string }): Promise<AutonomyDecision[]>;
  getAutonomyDecision(id: string): Promise<AutonomyDecision | undefined>;
  createAutonomyDecision(decision: InsertAutonomyDecision): Promise<AutonomyDecision>;
  updateAutonomyDecision(id: string, data: Partial<AutonomyDecision>): Promise<AutonomyDecision | undefined>;

  getDecisionQualityProfiles(filters?: { agentId?: string; industry?: string; decisionType?: string }): Promise<DecisionQualityProfile[]>;
  getDecisionQualityProfile(id: string): Promise<DecisionQualityProfile | undefined>;
  createDecisionQualityProfile(profile: InsertDecisionQualityProfile): Promise<DecisionQualityProfile>;
  updateDecisionQualityProfile(id: string, data: Partial<DecisionQualityProfile>): Promise<DecisionQualityProfile | undefined>;

  getAutonomyBoundaryProposals(filters?: { status?: string; agentId?: string; industry?: string }): Promise<AutonomyBoundaryProposal[]>;
  getAutonomyBoundaryProposal(id: string): Promise<AutonomyBoundaryProposal | undefined>;
  createAutonomyBoundaryProposal(proposal: InsertAutonomyBoundaryProposal): Promise<AutonomyBoundaryProposal>;
  updateAutonomyBoundaryProposal(id: string, data: Partial<AutonomyBoundaryProposal>): Promise<AutonomyBoundaryProposal | undefined>;

  createContextEconomics(record: InsertContextEconomics): Promise<ContextEconomics>;
  getContextEconomicsByAgent(agentId: string): Promise<ContextEconomics[]>;
  getContextEconomicsByTrace(traceId: string): Promise<ContextEconomics | undefined>;
  getContextEconomicsByIndustry(industry: string): Promise<ContextEconomics[]>;

  createContextRecommendation(rec: InsertContextRecommendation): Promise<ContextRecommendation>;
  getContextRecommendations(agentId: string, status?: string): Promise<ContextRecommendation[]>;
  updateContextRecommendation(id: string, data: Partial<ContextRecommendation>): Promise<ContextRecommendation | undefined>;
  getContextRecommendation(id: string): Promise<ContextRecommendation | undefined>;

  getAgentTriggers(agentId: string): Promise<AgentTrigger[]>;
  getAgentTrigger(id: string): Promise<AgentTrigger | undefined>;
  createAgentTrigger(trigger: InsertAgentTrigger): Promise<AgentTrigger>;
  updateAgentTrigger(id: string, data: Partial<AgentTrigger>): Promise<AgentTrigger | undefined>;
  deleteAgentTrigger(id: string): Promise<boolean>;
  getAgentTriggersByType(triggerType: string): Promise<AgentTrigger[]>;
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
    return db.select().from(agents).orderBy(desc(agents.updatedAt), desc(agents.createdAt));
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

  async deleteOutcome(id: string) {
    await db.delete(kpiDefinitions).where(eq(kpiDefinitions.outcomeId, id));
    await db.delete(outcomeEvents).where(eq(outcomeEvents.outcomeId, id));
    await db.delete(billingDisputes).where(eq(billingDisputes.outcomeId, id));
    await db.delete(invoices).where(eq(invoices.outcomeId, id));
    await db.update(agents).set({ outcomeId: null }).where(eq(agents.outcomeId, id));
    await db.update(approvals).set({ outcomeId: null }).where(eq(approvals.outcomeId, id));
    const [deleted] = await db.delete(outcomeContracts).where(eq(outcomeContracts.id, id)).returning();
    return !!deleted;
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

  async getDeploymentsByAgentId(agentId: string, status?: string) {
    const conditions = [eq(deployments.agentId, agentId)];
    if (status) {
      conditions.push(eq(deployments.status, status));
    }
    return db.select().from(deployments).where(and(...conditions));
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
    return db.select().from(runTraces).where(eq(runTraces.agentId, agentId)).orderBy(desc(runTraces.startedAt));
  }

  async getRecentCompletedTracesByAgent(agentId: string, limitCount = 5) {
    return db.select().from(runTraces)
      .where(and(eq(runTraces.agentId, agentId), eq(runTraces.status, "completed")))
      .orderBy(desc(runTraces.startedAt))
      .limit(limitCount);
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

  async deletePolicy(id: string) {
    const [deleted] = await db.delete(policies).where(eq(policies.id, id)).returning();
    return !!deleted;
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
    return db.select().from(agentTemplates).orderBy(desc(agentTemplates.createdAt));
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

  async getEvalTestCase(id: string) {
    const [tc] = await db.select().from(evalTestCases).where(eq(evalTestCases.id, id));
    return tc;
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

  async updateEvalRun(id: string, data: Partial<InsertEvalRun>) {
    const [updated] = await db.update(evalRuns).set(data).where(eq(evalRuns.id, id)).returning();
    return updated;
  }

  async getEvalSuitesBySkill(skillId: string) {
    return db.select().from(evalSuites).where(eq(evalSuites.skillId, skillId));
  }

  async getEvalRunsBySkill(skillId: string) {
    return db.select().from(evalRuns).where(eq(evalRuns.skillId, skillId)).orderBy(desc(evalRuns.startedAt));
  }

  async getLatestEvalRunBySkill(skillId: string) {
    const [run] = await db.select().from(evalRuns).where(eq(evalRuns.skillId, skillId)).orderBy(desc(evalRuns.startedAt)).limit(1);
    return run;
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
    const [updated] = await db.update(agents).set({ ...data, updatedAt: new Date() }).where(eq(agents.id, id)).returning();
    return updated;
  }

  async deleteAgent(id: string): Promise<boolean> {
    await db.delete(agentApiKeys).where(eq(agentApiKeys.agentId, id));
    await db.delete(agentChannels).where(eq(agentChannels.agentId, id));
    await db.delete(agentMcpServers).where(eq(agentMcpServers.agentId, id));
    await db.delete(agentKnowledgeBases).where(eq(agentKnowledgeBases.agentId, id));
    await db.delete(agentTeams).where(
      or(eq(agentTeams.teamAgentId, id), eq(agentTeams.memberAgentId, id))
    );
    const [deleted] = await db.delete(agents).where(eq(agents.id, id)).returning();
    return !!deleted;
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

  async ensureAgentVersion(agentId: string, semver: string, status: string = "active"): Promise<AgentVersion> {
    const existing = await db.select().from(agentVersions)
      .where(and(eq(agentVersions.agentId, agentId), eq(agentVersions.semver, semver)));
    if (existing.length > 0) return existing[0];
    const [created] = await db.insert(agentVersions).values({ agentId, semver, status }).returning();
    return created;
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

  async getAllOntologyConcepts() {
    return db.select().from(ontologyConcepts);
  }
  async getOntologyConcepts(industryId: string) {
    return db.select().from(ontologyConcepts).where(eq(ontologyConcepts.industryId, industryId));
  }
  async getOntologyConcept(id: string) {
    const [concept] = await db.select().from(ontologyConcepts).where(eq(ontologyConcepts.id, id));
    return concept;
  }
  async createOntologyConcept(concept: InsertOntologyConcept) {
    const [created] = await db.insert(ontologyConcepts).values(concept).returning();
    return created;
  }
  async updateOntologyConcept(id: string, data: Partial<OntologyConcept>) {
    const [updated] = await db.update(ontologyConcepts).set(data).where(eq(ontologyConcepts.id, id)).returning();
    return updated;
  }
  async deleteOntologyConcept(id: string) {
    const result = await db.delete(ontologyConcepts).where(eq(ontologyConcepts.id, id)).returning();
    return result.length > 0;
  }

  async getOntologyEnhancement(conceptId: string) {
    const [enhancement] = await db.select().from(ontologyEnhancements).where(eq(ontologyEnhancements.conceptId, conceptId)).limit(1);
    return enhancement;
  }
  async getOntologyEnhancements(conceptIds: string[]) {
    if (conceptIds.length === 0) return [];
    return db.select().from(ontologyEnhancements).where(inArray(ontologyEnhancements.conceptId, conceptIds));
  }
  async createOntologyEnhancement(enhancement: InsertOntologyEnhancement) {
    const [created] = await db.insert(ontologyEnhancements).values(enhancement).returning();
    return created;
  }
  async updateOntologyEnhancement(id: string, data: Partial<OntologyEnhancement>) {
    const [updated] = await db.update(ontologyEnhancements).set(data).where(eq(ontologyEnhancements.id, id)).returning();
    return updated;
  }

  async getSkills() {
    return db.select().from(skills);
  }
  async getSkill(id: string) {
    const [skill] = await db.select().from(skills).where(eq(skills.id, id));
    return skill;
  }
  async getSkillsByIds(ids: string[]) {
    if (ids.length === 0) return [];
    return db.select().from(skills).where(inArray(skills.id, ids));
  }
  async createSkill(skill: InsertSkill) {
    const [created] = await db.insert(skills).values(skill).returning();
    return created;
  }
  async updateSkill(id: string, data: Partial<Skill>) {
    const [updated] = await db.update(skills).set(data).where(eq(skills.id, id)).returning();
    return updated;
  }
  async deleteSkill(id: string) {
    const result = await db.delete(skills).where(eq(skills.id, id));
    return true;
  }

  async getSkillVersions(skillId: string) {
    return db.select().from(skillVersions).where(eq(skillVersions.skillId, skillId)).orderBy(skillVersions.createdAt);
  }
  async getSkillVersion(id: string) {
    const [v] = await db.select().from(skillVersions).where(eq(skillVersions.id, id));
    return v;
  }
  async createSkillVersion(version: InsertSkillVersion) {
    const [created] = await db.insert(skillVersions).values(version).returning();
    return created;
  }
  async updateSkillVersion(id: string, data: Partial<SkillVersion>) {
    const [updated] = await db.update(skillVersions).set(data).where(eq(skillVersions.id, id)).returning();
    return updated;
  }

  async getSkillChains() {
    return db.select().from(skillChains).orderBy(skillChains.createdAt);
  }
  async getSkillChain(id: string) {
    const [chain] = await db.select().from(skillChains).where(eq(skillChains.id, id));
    return chain;
  }
  async createSkillChain(chain: InsertSkillChain) {
    const [created] = await db.insert(skillChains).values(chain).returning();
    return created;
  }
  async updateSkillChain(id: string, data: Partial<SkillChain>) {
    const [updated] = await db.update(skillChains).set(data).where(eq(skillChains.id, id)).returning();
    return updated;
  }
  async deleteSkillChain(id: string) {
    const result = await db.delete(skillChains).where(eq(skillChains.id, id));
    return (result as any).rowCount > 0;
  }

  async getGoldenDatasets() {
    return db.select().from(goldenDatasets).orderBy(desc(goldenDatasets.createdAt));
  }
  async getGoldenDataset(id: string) {
    const [dataset] = await db.select().from(goldenDatasets).where(eq(goldenDatasets.id, id));
    return dataset;
  }
  async createGoldenDataset(dataset: InsertGoldenDataset) {
    const [created] = await db.insert(goldenDatasets).values(dataset).returning();
    return created;
  }
  async updateGoldenDataset(id: string, data: Partial<GoldenDataset>) {
    const [updated] = await db.update(goldenDatasets).set({ ...data, lastUpdatedAt: new Date() }).where(eq(goldenDatasets.id, id)).returning();
    return updated;
  }
  async deleteGoldenDataset(id: string) {
    await db.delete(goldenTestCases).where(eq(goldenTestCases.datasetId, id));
    const result = await db.delete(goldenDatasets).where(eq(goldenDatasets.id, id));
    return (result as any).rowCount > 0;
  }

  async getGoldenTestCases(datasetId: string) {
    return db.select().from(goldenTestCases).where(eq(goldenTestCases.datasetId, datasetId)).orderBy(goldenTestCases.createdAt);
  }
  async getGoldenTestCase(id: string) {
    const [tc] = await db.select().from(goldenTestCases).where(eq(goldenTestCases.id, id));
    return tc;
  }
  async createGoldenTestCase(testCase: InsertGoldenTestCase) {
    const [created] = await db.insert(goldenTestCases).values(testCase).returning();
    await this.updateDatasetTestCaseCount(testCase.datasetId);
    return created;
  }
  async updateGoldenTestCase(id: string, data: Partial<GoldenTestCase>) {
    const [updated] = await db.update(goldenTestCases).set(data).where(eq(goldenTestCases.id, id)).returning();
    return updated;
  }
  async deleteGoldenTestCase(id: string) {
    const tc = await this.getGoldenTestCase(id);
    const result = await db.delete(goldenTestCases).where(eq(goldenTestCases.id, id));
    if (tc) await this.updateDatasetTestCaseCount(tc.datasetId);
    return (result as any).rowCount > 0;
  }

  private async updateDatasetTestCaseCount(datasetId: string) {
    const cases = await db.select().from(goldenTestCases).where(eq(goldenTestCases.datasetId, datasetId));
    const categories: Record<string, number> = { happyPath: 0, edgeCases: 0, adversarial: 0, complianceCritical: 0 };
    cases.forEach(c => {
      const cat = c.scenarioCategory === "happy_path" ? "happyPath" : c.scenarioCategory === "edge_case" ? "edgeCases" : c.scenarioCategory === "adversarial" ? "adversarial" : "complianceCritical";
      categories[cat]++;
    });
    await db.update(goldenDatasets).set({ testCaseCount: cases.length, scenarioCategories: categories }).where(eq(goldenDatasets.id, datasetId));
  }

  private async updateDatasetDataRecordCount(datasetId: string) {
    const records = await db.select().from(goldenDataRecords).where(eq(goldenDataRecords.datasetId, datasetId));
    await db.update(goldenDatasets).set({ dataRecordCount: records.length }).where(eq(goldenDatasets.id, datasetId));
  }

  async getGoldenDataRecords(datasetId: string): Promise<GoldenDataRecord[]> {
    return db.select().from(goldenDataRecords).where(eq(goldenDataRecords.datasetId, datasetId)).orderBy(desc(goldenDataRecords.createdAt));
  }
  async createGoldenDataRecord(record: InsertGoldenDataRecord): Promise<GoldenDataRecord> {
    const [created] = await db.insert(goldenDataRecords).values(record).returning();
    await this.updateDatasetDataRecordCount(record.datasetId);
    return created;
  }
  async bulkCreateGoldenDataRecords(records: InsertGoldenDataRecord[]): Promise<GoldenDataRecord[]> {
    if (records.length === 0) return [];
    const created = await db.insert(goldenDataRecords).values(records).returning();
    if (records.length > 0) await this.updateDatasetDataRecordCount(records[0].datasetId);
    return created;
  }
  async deleteGoldenDataRecord(id: string): Promise<boolean> {
    const [record] = await db.select().from(goldenDataRecords).where(eq(goldenDataRecords.id, id));
    const result = await db.delete(goldenDataRecords).where(eq(goldenDataRecords.id, id));
    if (record) await this.updateDatasetDataRecordCount(record.datasetId);
    return (result as any).rowCount > 0;
  }

  async getContextProfiles(): Promise<ContextProfile[]> {
    return db.select().from(contextProfiles).orderBy(desc(contextProfiles.createdAt));
  }

  async getContextProfile(id: string): Promise<ContextProfile | undefined> {
    const [profile] = await db.select().from(contextProfiles).where(eq(contextProfiles.id, id));
    return profile;
  }

  async createContextProfile(profile: InsertContextProfile): Promise<ContextProfile> {
    const [created] = await db.insert(contextProfiles).values(profile).returning();
    return created;
  }

  async updateContextProfile(id: string, data: Partial<InsertContextProfile>): Promise<ContextProfile | undefined> {
    const [updated] = await db.update(contextProfiles).set(data).where(eq(contextProfiles.id, id)).returning();
    return updated;
  }

  async deleteContextProfile(id: string): Promise<boolean> {
    const result = await db.delete(contextProfiles).where(eq(contextProfiles.id, id));
    return (result as any).rowCount > 0;
  }

  async getMemoryProfiles(): Promise<MemoryProfile[]> {
    return db.select().from(memoryProfiles).orderBy(desc(memoryProfiles.createdAt));
  }

  async getMemoryProfile(id: string): Promise<MemoryProfile | undefined> {
    const [profile] = await db.select().from(memoryProfiles).where(eq(memoryProfiles.id, id));
    return profile;
  }

  async createMemoryProfile(profile: InsertMemoryProfile): Promise<MemoryProfile> {
    const [created] = await db.insert(memoryProfiles).values(profile).returning();
    return created;
  }

  async updateMemoryProfile(id: string, data: Partial<InsertMemoryProfile>): Promise<MemoryProfile | undefined> {
    const [updated] = await db.update(memoryProfiles).set(data).where(eq(memoryProfiles.id, id)).returning();
    return updated;
  }

  async deleteMemoryProfile(id: string): Promise<boolean> {
    const result = await db.delete(memoryProfiles).where(eq(memoryProfiles.id, id));
    return (result as any).rowCount > 0;
  }

  async saveAgentMemory(agentId: string, memoryType: string, content: string, metadata?: any, expiresAt?: Date): Promise<AgentMemory> {
    const [created] = await db.insert(agentMemories).values({ agentId, memoryType, content, metadata, expiresAt }).returning();
    return created;
  }

  async getAgentMemories(agentId: string, memoryType: string, limit: number = 10): Promise<AgentMemory[]> {
    return db.select().from(agentMemories)
      .where(and(eq(agentMemories.agentId, agentId), eq(agentMemories.memoryType, memoryType)))
      .orderBy(desc(agentMemories.createdAt))
      .limit(limit);
  }

  async getAllAgentMemories(agentId: string): Promise<AgentMemory[]> {
    return db.select().from(agentMemories)
      .where(eq(agentMemories.agentId, agentId))
      .orderBy(desc(agentMemories.createdAt));
  }

  async pruneExpiredMemories(agentId: string): Promise<number> {
    const now = new Date();
    const all = await db.select().from(agentMemories).where(eq(agentMemories.agentId, agentId));
    const expiredIds = all.filter(m => m.expiresAt && m.expiresAt <= now).map(m => m.id);
    if (expiredIds.length === 0) return 0;
    await db.delete(agentMemories).where(inArray(agentMemories.id, expiredIds));
    return expiredIds.length;
  }

  async getRagPipelines(): Promise<RagPipeline[]> {
    return db.select().from(ragPipelines).orderBy(desc(ragPipelines.createdAt));
  }

  async getRagPipeline(id: string): Promise<RagPipeline | undefined> {
    const [pipeline] = await db.select().from(ragPipelines).where(eq(ragPipelines.id, id));
    return pipeline;
  }

  async createRagPipeline(pipeline: InsertRagPipeline): Promise<RagPipeline> {
    const [created] = await db.insert(ragPipelines).values(pipeline).returning();
    return created;
  }

  async updateRagPipeline(id: string, data: Partial<InsertRagPipeline>): Promise<RagPipeline | undefined> {
    const [updated] = await db.update(ragPipelines).set(data).where(eq(ragPipelines.id, id)).returning();
    return updated;
  }

  async deleteRagPipeline(id: string): Promise<boolean> {
    const result = await db.delete(ragPipelines).where(eq(ragPipelines.id, id));
    return (result as any).rowCount > 0;
  }

  async getKnowledgeConnectors(): Promise<KnowledgeConnector[]> {
    return db.select().from(knowledgeConnectors).orderBy(desc(knowledgeConnectors.createdAt));
  }

  async getKnowledgeConnector(id: string): Promise<KnowledgeConnector | undefined> {
    const [connector] = await db.select().from(knowledgeConnectors).where(eq(knowledgeConnectors.id, id));
    return connector;
  }

  async createKnowledgeConnector(connector: InsertKnowledgeConnector): Promise<KnowledgeConnector> {
    const [created] = await db.insert(knowledgeConnectors).values(connector).returning();
    return created;
  }

  async updateKnowledgeConnector(id: string, data: Partial<InsertKnowledgeConnector>): Promise<KnowledgeConnector | undefined> {
    const [updated] = await db.update(knowledgeConnectors).set(data).where(eq(knowledgeConnectors.id, id)).returning();
    return updated;
  }

  async deleteKnowledgeConnector(id: string): Promise<boolean> {
    const result = await db.delete(knowledgeConnectors).where(eq(knowledgeConnectors.id, id));
    return (result as any).rowCount > 0;
  }

  async getEntityResolutions(): Promise<EntityResolution[]> {
    return db.select().from(entityResolutions).orderBy(desc(entityResolutions.createdAt));
  }

  async getEntityResolution(id: string): Promise<EntityResolution | undefined> {
    const [resolution] = await db.select().from(entityResolutions).where(eq(entityResolutions.id, id));
    return resolution;
  }

  async createEntityResolution(resolution: InsertEntityResolution): Promise<EntityResolution> {
    const [created] = await db.insert(entityResolutions).values(resolution).returning();
    return created;
  }

  async updateEntityResolution(id: string, data: Partial<InsertEntityResolution>): Promise<EntityResolution | undefined> {
    const [updated] = await db.update(entityResolutions).set(data).where(eq(entityResolutions.id, id)).returning();
    return updated;
  }

  async deleteEntityResolution(id: string): Promise<boolean> {
    const result = await db.delete(entityResolutions).where(eq(entityResolutions.id, id));
    return (result as any).rowCount > 0;
  }

  async getRelationshipExtractions(): Promise<RelationshipExtraction[]> {
    return db.select().from(relationshipExtractions).orderBy(desc(relationshipExtractions.createdAt));
  }

  async getRelationshipExtraction(id: string): Promise<RelationshipExtraction | undefined> {
    const [extraction] = await db.select().from(relationshipExtractions).where(eq(relationshipExtractions.id, id));
    return extraction;
  }

  async createRelationshipExtraction(extraction: InsertRelationshipExtraction): Promise<RelationshipExtraction> {
    const [created] = await db.insert(relationshipExtractions).values(extraction).returning();
    return created;
  }

  async updateRelationshipExtraction(id: string, data: Partial<InsertRelationshipExtraction>): Promise<RelationshipExtraction | undefined> {
    const [updated] = await db.update(relationshipExtractions).set(data).where(eq(relationshipExtractions.id, id)).returning();
    return updated;
  }

  async deleteRelationshipExtraction(id: string): Promise<boolean> {
    const result = await db.delete(relationshipExtractions).where(eq(relationshipExtractions.id, id));
    return (result as any).rowCount > 0;
  }

  async getTemporalGraphEntries(): Promise<TemporalGraphEntry[]> {
    return db.select().from(temporalGraphEntries).orderBy(desc(temporalGraphEntries.createdAt));
  }

  async getTemporalGraphEntry(id: string): Promise<TemporalGraphEntry | undefined> {
    const [entry] = await db.select().from(temporalGraphEntries).where(eq(temporalGraphEntries.id, id));
    return entry;
  }

  async createTemporalGraphEntry(entry: InsertTemporalGraphEntry): Promise<TemporalGraphEntry> {
    const [created] = await db.insert(temporalGraphEntries).values(entry).returning();
    return created;
  }

  async updateTemporalGraphEntry(id: string, data: Partial<InsertTemporalGraphEntry>): Promise<TemporalGraphEntry | undefined> {
    const [updated] = await db.update(temporalGraphEntries).set(data).where(eq(temporalGraphEntries.id, id)).returning();
    return updated;
  }

  async deleteTemporalGraphEntry(id: string): Promise<boolean> {
    const result = await db.delete(temporalGraphEntries).where(eq(temporalGraphEntries.id, id));
    return (result as any).rowCount > 0;
  }

  async getAutonomyProfiles(): Promise<AutonomyProfile[]> {
    return db.select().from(autonomyProfiles).orderBy(desc(autonomyProfiles.createdAt));
  }

  async getAutonomyProfile(id: string): Promise<AutonomyProfile | undefined> {
    const [profile] = await db.select().from(autonomyProfiles).where(eq(autonomyProfiles.id, id));
    return profile;
  }

  async createAutonomyProfile(profile: InsertAutonomyProfile): Promise<AutonomyProfile> {
    const [created] = await db.insert(autonomyProfiles).values(profile).returning();
    return created;
  }

  async updateAutonomyProfile(id: string, data: Partial<InsertAutonomyProfile>): Promise<AutonomyProfile | undefined> {
    const [updated] = await db.update(autonomyProfiles).set(data).where(eq(autonomyProfiles.id, id)).returning();
    return updated;
  }

  async deleteAutonomyProfile(id: string): Promise<boolean> {
    const result = await db.delete(autonomyProfiles).where(eq(autonomyProfiles.id, id));
    return (result as any).rowCount > 0;
  }

  async getOversightDecisions(): Promise<OversightDecision[]> {
    return db.select().from(oversightDecisions).orderBy(desc(oversightDecisions.createdAt));
  }

  async getOversightDecision(id: string): Promise<OversightDecision | undefined> {
    const [decision] = await db.select().from(oversightDecisions).where(eq(oversightDecisions.id, id));
    return decision;
  }

  async createOversightDecision(decision: InsertOversightDecision): Promise<OversightDecision> {
    const [created] = await db.insert(oversightDecisions).values(decision).returning();
    return created;
  }

  async updateOversightDecision(id: string, data: Partial<InsertOversightDecision>): Promise<OversightDecision | undefined> {
    const [updated] = await db.update(oversightDecisions).set(data).where(eq(oversightDecisions.id, id)).returning();
    return updated;
  }

  async deleteOversightDecision(id: string): Promise<boolean> {
    const result = await db.delete(oversightDecisions).where(eq(oversightDecisions.id, id));
    return (result as any).rowCount > 0;
  }

  async getShadowTraces(): Promise<ShadowTrace[]> {
    return db.select().from(shadowTraces).orderBy(desc(shadowTraces.capturedAt));
  }

  async getShadowTrace(id: string): Promise<ShadowTrace | undefined> {
    const [trace] = await db.select().from(shadowTraces).where(eq(shadowTraces.id, id));
    return trace;
  }

  async createShadowTrace(trace: InsertShadowTrace): Promise<ShadowTrace> {
    const [created] = await db.insert(shadowTraces).values(trace).returning();
    return created;
  }

  async updateShadowTrace(id: string, data: Partial<InsertShadowTrace>): Promise<ShadowTrace | undefined> {
    const [updated] = await db.update(shadowTraces).set(data).where(eq(shadowTraces.id, id)).returning();
    return updated;
  }

  async deleteShadowTrace(id: string): Promise<boolean> {
    const result = await db.delete(shadowTraces).where(eq(shadowTraces.id, id));
    return (result as any).rowCount > 0;
  }

  async getShadowReplaySessions(): Promise<ShadowReplaySession[]> {
    return db.select().from(shadowReplaySessions).orderBy(desc(shadowReplaySessions.createdAt));
  }

  async getShadowReplaySession(id: string): Promise<ShadowReplaySession | undefined> {
    const [session] = await db.select().from(shadowReplaySessions).where(eq(shadowReplaySessions.id, id));
    return session;
  }

  async createShadowReplaySession(session: InsertShadowReplaySession): Promise<ShadowReplaySession> {
    const [created] = await db.insert(shadowReplaySessions).values(session).returning();
    return created;
  }

  async updateShadowReplaySession(id: string, data: Partial<InsertShadowReplaySession>): Promise<ShadowReplaySession | undefined> {
    const [updated] = await db.update(shadowReplaySessions).set(data).where(eq(shadowReplaySessions.id, id)).returning();
    return updated;
  }

  async deleteShadowReplaySession(id: string): Promise<boolean> {
    const result = await db.delete(shadowReplaySessions).where(eq(shadowReplaySessions.id, id));
    return (result as any).rowCount > 0;
  }

  async getCanaryDeployments(): Promise<CanaryDeployment[]> {
    return db.select().from(canaryDeployments).orderBy(desc(canaryDeployments.createdAt));
  }

  async getCanaryDeployment(id: string): Promise<CanaryDeployment | undefined> {
    const [deployment] = await db.select().from(canaryDeployments).where(eq(canaryDeployments.id, id));
    return deployment;
  }

  async createCanaryDeployment(deployment: InsertCanaryDeployment): Promise<CanaryDeployment> {
    const [created] = await db.insert(canaryDeployments).values(deployment).returning();
    return created;
  }

  async updateCanaryDeployment(id: string, data: Partial<InsertCanaryDeployment>): Promise<CanaryDeployment | undefined> {
    const [updated] = await db.update(canaryDeployments).set(data).where(eq(canaryDeployments.id, id)).returning();
    return updated;
  }

  async deleteCanaryDeployment(id: string): Promise<boolean> {
    const result = await db.delete(canaryDeployments).where(eq(canaryDeployments.id, id));
    return (result as any).rowCount > 0;
  }

  async getHealingPipelines(): Promise<HealingPipeline[]> {
    return db.select().from(healingPipelines).orderBy(desc(healingPipelines.createdAt));
  }

  async getHealingPipeline(id: string): Promise<HealingPipeline | undefined> {
    const [pipeline] = await db.select().from(healingPipelines).where(eq(healingPipelines.id, id));
    return pipeline;
  }

  async createHealingPipeline(pipeline: InsertHealingPipeline): Promise<HealingPipeline> {
    const [created] = await db.insert(healingPipelines).values(pipeline).returning();
    return created;
  }

  async updateHealingPipeline(id: string, data: Partial<InsertHealingPipeline>): Promise<HealingPipeline | undefined> {
    const [updated] = await db.update(healingPipelines).set(data).where(eq(healingPipelines.id, id)).returning();
    return updated;
  }

  async deleteHealingPipeline(id: string): Promise<boolean> {
    const result = await db.delete(healingPipelines).where(eq(healingPipelines.id, id));
    return (result as any).rowCount > 0;
  }

  async getRunbooks(): Promise<Runbook[]> {
    return db.select().from(runbooks).orderBy(desc(runbooks.createdAt));
  }

  async getRunbook(id: string): Promise<Runbook | undefined> {
    const [runbook] = await db.select().from(runbooks).where(eq(runbooks.id, id));
    return runbook;
  }

  async createRunbook(runbook: InsertRunbook): Promise<Runbook> {
    const [created] = await db.insert(runbooks).values(runbook).returning();
    return created;
  }

  async updateRunbook(id: string, data: Partial<InsertRunbook>): Promise<Runbook | undefined> {
    const [updated] = await db.update(runbooks).set(data).where(eq(runbooks.id, id)).returning();
    return updated;
  }

  async deleteRunbook(id: string): Promise<boolean> {
    const result = await db.delete(runbooks).where(eq(runbooks.id, id));
    return (result as any).rowCount > 0;
  }

  async getAgentMcpServers(agentId: string): Promise<AgentMcpServer[]> {
    return db.select().from(agentMcpServers).where(eq(agentMcpServers.agentId, agentId));
  }

  async createAgentMcpServer(link: InsertAgentMcpServer): Promise<AgentMcpServer> {
    const [created] = await db.insert(agentMcpServers).values(link).returning();
    return created;
  }

  async deleteAgentMcpServer(id: string): Promise<boolean> {
    const result = await db.delete(agentMcpServers).where(eq(agentMcpServers.id, id));
    return (result as any).rowCount > 0;
  }

  async getAgentMcpServerByIds(agentId: string, serverId: string): Promise<AgentMcpServer | undefined> {
    const [link] = await db.select().from(agentMcpServers).where(
      and(eq(agentMcpServers.agentId, agentId), eq(agentMcpServers.serverId, serverId))
    );
    return link;
  }

  async getAgentPipelines(): Promise<AgentPipeline[]> {
    return db.select().from(agentPipelines).orderBy(desc(agentPipelines.createdAt));
  }

  async getAgentPipeline(id: string): Promise<AgentPipeline | undefined> {
    const [pipeline] = await db.select().from(agentPipelines).where(eq(agentPipelines.id, id));
    return pipeline;
  }

  async createAgentPipeline(pipeline: InsertAgentPipeline): Promise<AgentPipeline> {
    const [created] = await db.insert(agentPipelines).values(pipeline).returning();
    return created;
  }

  async updateAgentPipeline(id: string, data: Partial<InsertAgentPipeline>): Promise<AgentPipeline | undefined> {
    const [updated] = await db.update(agentPipelines).set(data).where(eq(agentPipelines.id, id)).returning();
    return updated;
  }

  async deleteAgentPipeline(id: string): Promise<boolean> {
    const result = await db.delete(agentPipelines).where(eq(agentPipelines.id, id));
    return (result as any).rowCount > 0;
  }

  async getPipelineRuns(pipelineId: string): Promise<PipelineRun[]> {
    return db.select().from(pipelineRuns).where(eq(pipelineRuns.pipelineId, pipelineId)).orderBy(desc(pipelineRuns.createdAt));
  }

  async getPipelineRun(id: string): Promise<PipelineRun | undefined> {
    const [run] = await db.select().from(pipelineRuns).where(eq(pipelineRuns.id, id));
    return run;
  }

  async createPipelineRun(run: InsertPipelineRun): Promise<PipelineRun> {
    const [created] = await db.insert(pipelineRuns).values(run).returning();
    return created;
  }

  async updatePipelineRun(id: string, data: Partial<PipelineRun>): Promise<PipelineRun | undefined> {
    const [updated] = await db.update(pipelineRuns).set(data).where(eq(pipelineRuns.id, id)).returning();
    return updated;
  }

  async getMcpParameterMatches(serverId: string): Promise<McpParameterMatch[]> {
    return db.select().from(mcpParameterMatches).where(eq(mcpParameterMatches.serverId, serverId));
  }

  async createMcpParameterMatch(match: InsertMcpParameterMatch): Promise<McpParameterMatch> {
    const [created] = await db.insert(mcpParameterMatches).values(match).returning();
    return created;
  }

  async deleteMcpParameterMatchesByServer(serverId: string): Promise<void> {
    await db.delete(mcpParameterMatches).where(eq(mcpParameterMatches.serverId, serverId));
  }

  async getAgentRuntimeRuns(agentId?: string): Promise<AgentRuntimeRun[]> {
    if (agentId) {
      return db.select().from(agentRuntimeRuns).where(eq(agentRuntimeRuns.agentId, agentId)).orderBy(agentRuntimeRuns.startedAt);
    }
    return db.select().from(agentRuntimeRuns).orderBy(agentRuntimeRuns.startedAt);
  }

  async getAgentRuntimeRun(id: string): Promise<AgentRuntimeRun | undefined> {
    const [run] = await db.select().from(agentRuntimeRuns).where(eq(agentRuntimeRuns.id, id));
    return run;
  }

  async createAgentRuntimeRun(run: InsertAgentRuntimeRun): Promise<AgentRuntimeRun> {
    const [created] = await db.insert(agentRuntimeRuns).values(run).returning();
    return created;
  }

  async updateAgentRuntimeRun(id: string, data: Partial<AgentRuntimeRun>): Promise<AgentRuntimeRun | undefined> {
    const [updated] = await db.update(agentRuntimeRuns).set(data).where(eq(agentRuntimeRuns.id, id)).returning();
    return updated;
  }

  async getActiveRuntimeRuns(): Promise<AgentRuntimeRun[]> {
    return db.select().from(agentRuntimeRuns).where(eq(agentRuntimeRuns.status, "running"));
  }

  async getAgentProposalByOutcome(outcomeId: string): Promise<AgentProposal | undefined> {
    const [proposal] = await db.select().from(agentProposals).where(eq(agentProposals.outcomeId, outcomeId)).orderBy(desc(agentProposals.createdAt));
    return proposal;
  }

  async createAgentProposal(proposal: InsertAgentProposal): Promise<AgentProposal> {
    const [created] = await db.insert(agentProposals).values(proposal).returning();
    return created;
  }

  async updateAgentProposal(id: string, data: Partial<AgentProposal>): Promise<AgentProposal | undefined> {
    const [updated] = await db.update(agentProposals).set({ ...data, updatedAt: new Date() }).where(eq(agentProposals.id, id)).returning();
    return updated;
  }

  async deleteAgentProposal(id: string): Promise<boolean> {
    const result = await db.delete(agentProposals).where(eq(agentProposals.id, id)).returning();
    return result.length > 0;
  }

  async getAgentApiKeys(agentId: string): Promise<AgentApiKey[]> {
    return db.select().from(agentApiKeys).where(eq(agentApiKeys.agentId, agentId)).orderBy(desc(agentApiKeys.createdAt));
  }

  async getAgentApiKey(id: string): Promise<AgentApiKey | undefined> {
    const [key] = await db.select().from(agentApiKeys).where(eq(agentApiKeys.id, id));
    return key;
  }

  async getAgentApiKeyByHash(keyHash: string): Promise<AgentApiKey | undefined> {
    const [key] = await db.select().from(agentApiKeys).where(and(eq(agentApiKeys.keyHash, keyHash), eq(agentApiKeys.isActive, true)));
    return key;
  }

  async createAgentApiKey(key: InsertAgentApiKey): Promise<AgentApiKey> {
    const [created] = await db.insert(agentApiKeys).values(key).returning();
    return created;
  }

  async updateAgentApiKey(id: string, data: Partial<AgentApiKey>): Promise<AgentApiKey | undefined> {
    const [updated] = await db.update(agentApiKeys).set(data).where(eq(agentApiKeys.id, id)).returning();
    return updated;
  }

  async deleteAgentApiKey(id: string): Promise<boolean> {
    const result = await db.delete(agentApiKeys).where(eq(agentApiKeys.id, id)).returning();
    return result.length > 0;
  }

  async getAgentChannels(agentId: string): Promise<AgentChannel[]> {
    return db.select().from(agentChannels).where(eq(agentChannels.agentId, agentId)).orderBy(desc(agentChannels.createdAt));
  }

  async getAgentChannel(id: string): Promise<AgentChannel | undefined> {
    const [channel] = await db.select().from(agentChannels).where(eq(agentChannels.id, id));
    return channel;
  }

  async getAgentChannelByWebhook(webhookUrl: string): Promise<AgentChannel | undefined> {
    const [channel] = await db.select().from(agentChannels).where(eq(agentChannels.webhookUrl, webhookUrl));
    return channel;
  }

  async getAgentChannelByWebhookPath(webhookPath: string): Promise<AgentChannel | undefined> {
    const [channel] = await db.select().from(agentChannels).where(like(agentChannels.webhookUrl, `%${webhookPath}`));
    return channel;
  }

  async getAgentChannelByToken(token: string, channelType: string): Promise<AgentChannel | undefined> {
    const suffix = `/api/webhooks/${channelType}/${token}`;
    const all = await db.select().from(agentChannels).where(
      and(eq(agentChannels.channelType, channelType), like(agentChannels.webhookUrl, `%${suffix}`))
    );
    return all.find(ch => ch.webhookUrl?.endsWith(suffix));
  }

  async createAgentChannel(channel: InsertAgentChannel): Promise<AgentChannel> {
    const [created] = await db.insert(agentChannels).values(channel).returning();
    return created;
  }

  async updateAgentChannel(id: string, data: Partial<AgentChannel>): Promise<AgentChannel | undefined> {
    const [updated] = await db.update(agentChannels).set({ ...data, updatedAt: new Date() }).where(eq(agentChannels.id, id)).returning();
    return updated;
  }

  async deleteAgentChannel(id: string): Promise<boolean> {
    const result = await db.delete(agentChannels).where(eq(agentChannels.id, id)).returning();
    return result.length > 0;
  }

  async getKnowledgeBases(): Promise<KnowledgeBase[]> {
    return db.select().from(knowledgeBases).orderBy(desc(knowledgeBases.createdAt));
  }

  async getKnowledgeBase(id: string): Promise<KnowledgeBase | undefined> {
    const [kb] = await db.select().from(knowledgeBases).where(eq(knowledgeBases.id, id));
    return kb;
  }

  async createKnowledgeBase(kb: InsertKnowledgeBase): Promise<KnowledgeBase> {
    const [created] = await db.insert(knowledgeBases).values(kb).returning();
    return created;
  }

  async updateKnowledgeBase(id: string, data: Partial<KnowledgeBase>): Promise<KnowledgeBase | undefined> {
    const [updated] = await db.update(knowledgeBases).set({ ...data, updatedAt: new Date() }).where(eq(knowledgeBases.id, id)).returning();
    return updated;
  }

  async deleteKnowledgeBase(id: string): Promise<boolean> {
    await db.delete(knowledgeChunks).where(eq(knowledgeChunks.knowledgeBaseId, id));
    await db.delete(knowledgeSources).where(eq(knowledgeSources.knowledgeBaseId, id));
    await db.delete(agentKnowledgeBases).where(eq(agentKnowledgeBases.knowledgeBaseId, id));
    const result = await db.delete(knowledgeBases).where(eq(knowledgeBases.id, id)).returning();
    return result.length > 0;
  }

  async getKnowledgeSources(kbId: string): Promise<KnowledgeSource[]> {
    return db.select().from(knowledgeSources).where(eq(knowledgeSources.knowledgeBaseId, kbId)).orderBy(desc(knowledgeSources.createdAt));
  }

  async getKnowledgeSource(id: string): Promise<KnowledgeSource | undefined> {
    const [source] = await db.select().from(knowledgeSources).where(eq(knowledgeSources.id, id));
    return source;
  }

  async createKnowledgeSource(source: InsertKnowledgeSource): Promise<KnowledgeSource> {
    const [created] = await db.insert(knowledgeSources).values(source).returning();
    return created;
  }

  async updateKnowledgeSource(id: string, data: Partial<KnowledgeSource>): Promise<KnowledgeSource | undefined> {
    const [updated] = await db.update(knowledgeSources).set(data).where(eq(knowledgeSources.id, id)).returning();
    return updated;
  }

  async deleteKnowledgeSource(id: string): Promise<boolean> {
    await db.delete(knowledgeChunks).where(eq(knowledgeChunks.sourceId, id));
    const result = await db.delete(knowledgeSources).where(eq(knowledgeSources.id, id)).returning();
    return result.length > 0;
  }

  async getKnowledgeChunks(kbId: string): Promise<KnowledgeChunk[]> {
    return db.select().from(knowledgeChunks).where(eq(knowledgeChunks.knowledgeBaseId, kbId)).orderBy(knowledgeChunks.chunkIndex);
  }

  async getKnowledgeChunksBySource(sourceId: string): Promise<KnowledgeChunk[]> {
    return db.select().from(knowledgeChunks).where(eq(knowledgeChunks.sourceId, sourceId)).orderBy(knowledgeChunks.chunkIndex);
  }

  async createKnowledgeChunk(chunk: InsertKnowledgeChunk): Promise<KnowledgeChunk> {
    const [created] = await db.insert(knowledgeChunks).values(chunk).returning();
    return created;
  }

  async deleteKnowledgeChunksBySource(sourceId: string): Promise<boolean> {
    const result = await db.delete(knowledgeChunks).where(eq(knowledgeChunks.sourceId, sourceId)).returning();
    return result.length > 0;
  }

  async getAgentKnowledgeBases(agentId: string): Promise<AgentKnowledgeBase[]> {
    return db.select().from(agentKnowledgeBases).where(eq(agentKnowledgeBases.agentId, agentId));
  }

  async getKnowledgeBaseAgents(kbId: string): Promise<AgentKnowledgeBase[]> {
    return db.select().from(agentKnowledgeBases).where(eq(agentKnowledgeBases.knowledgeBaseId, kbId));
  }

  async createAgentKnowledgeBase(link: InsertAgentKnowledgeBase): Promise<AgentKnowledgeBase> {
    const [created] = await db.insert(agentKnowledgeBases).values(link).returning();
    return created;
  }

  async deleteAgentKnowledgeBase(id: string): Promise<boolean> {
    const result = await db.delete(agentKnowledgeBases).where(eq(agentKnowledgeBases.id, id)).returning();
    return result.length > 0;
  }

  async getAutonomyDecisions(filters?: { agentId?: string; decisionType?: string; industry?: string; outcome?: string }): Promise<AutonomyDecision[]> {
    const conditions = [];
    if (filters?.agentId) conditions.push(eq(autonomyDecisions.agentId, filters.agentId));
    if (filters?.decisionType) conditions.push(eq(autonomyDecisions.decisionType, filters.decisionType));
    if (filters?.industry) conditions.push(eq(autonomyDecisions.industry, filters.industry));
    if (filters?.outcome) conditions.push(eq(autonomyDecisions.outcome, filters.outcome));
    if (conditions.length > 0) {
      return db.select().from(autonomyDecisions).where(and(...conditions)).orderBy(desc(autonomyDecisions.createdAt));
    }
    return db.select().from(autonomyDecisions).orderBy(desc(autonomyDecisions.createdAt));
  }

  async getAutonomyDecision(id: string): Promise<AutonomyDecision | undefined> {
    const [decision] = await db.select().from(autonomyDecisions).where(eq(autonomyDecisions.id, id));
    return decision;
  }

  async createAutonomyDecision(decision: InsertAutonomyDecision): Promise<AutonomyDecision> {
    const [created] = await db.insert(autonomyDecisions).values(decision).returning();
    return created;
  }

  async updateAutonomyDecision(id: string, data: Partial<AutonomyDecision>): Promise<AutonomyDecision | undefined> {
    const [updated] = await db.update(autonomyDecisions).set(data).where(eq(autonomyDecisions.id, id)).returning();
    return updated;
  }

  async getDecisionQualityProfiles(filters?: { agentId?: string; industry?: string; decisionType?: string }): Promise<DecisionQualityProfile[]> {
    const conditions = [];
    if (filters?.agentId) conditions.push(eq(decisionQualityProfiles.agentId, filters.agentId));
    if (filters?.industry) conditions.push(eq(decisionQualityProfiles.industry, filters.industry));
    if (filters?.decisionType) conditions.push(eq(decisionQualityProfiles.decisionType, filters.decisionType));
    if (conditions.length > 0) {
      return db.select().from(decisionQualityProfiles).where(and(...conditions));
    }
    return db.select().from(decisionQualityProfiles);
  }

  async getDecisionQualityProfile(id: string): Promise<DecisionQualityProfile | undefined> {
    const [profile] = await db.select().from(decisionQualityProfiles).where(eq(decisionQualityProfiles.id, id));
    return profile;
  }

  async createDecisionQualityProfile(profile: InsertDecisionQualityProfile): Promise<DecisionQualityProfile> {
    const [created] = await db.insert(decisionQualityProfiles).values(profile).returning();
    return created;
  }

  async updateDecisionQualityProfile(id: string, data: Partial<DecisionQualityProfile>): Promise<DecisionQualityProfile | undefined> {
    const [updated] = await db.update(decisionQualityProfiles).set(data).where(eq(decisionQualityProfiles.id, id)).returning();
    return updated;
  }

  async getAutonomyBoundaryProposals(filters?: { status?: string; agentId?: string; industry?: string }): Promise<AutonomyBoundaryProposal[]> {
    const conditions = [];
    if (filters?.status) conditions.push(eq(autonomyBoundaryProposals.status, filters.status));
    if (filters?.agentId) conditions.push(eq(autonomyBoundaryProposals.agentId, filters.agentId));
    if (filters?.industry) conditions.push(eq(autonomyBoundaryProposals.industry, filters.industry));
    if (conditions.length > 0) {
      return db.select().from(autonomyBoundaryProposals).where(and(...conditions)).orderBy(desc(autonomyBoundaryProposals.createdAt));
    }
    return db.select().from(autonomyBoundaryProposals).orderBy(desc(autonomyBoundaryProposals.createdAt));
  }

  async getAutonomyBoundaryProposal(id: string): Promise<AutonomyBoundaryProposal | undefined> {
    const [proposal] = await db.select().from(autonomyBoundaryProposals).where(eq(autonomyBoundaryProposals.id, id));
    return proposal;
  }

  async createAutonomyBoundaryProposal(proposal: InsertAutonomyBoundaryProposal): Promise<AutonomyBoundaryProposal> {
    const [created] = await db.insert(autonomyBoundaryProposals).values(proposal).returning();
    return created;
  }

  async updateAutonomyBoundaryProposal(id: string, data: Partial<AutonomyBoundaryProposal>): Promise<AutonomyBoundaryProposal | undefined> {
    const [updated] = await db.update(autonomyBoundaryProposals).set(data).where(eq(autonomyBoundaryProposals.id, id)).returning();
    return updated;
  }

  async createContextEconomics(record: InsertContextEconomics): Promise<ContextEconomics> {
    const [created] = await db.insert(contextEconomics).values(record).returning();
    return created;
  }

  async getContextEconomicsByAgent(agentId: string): Promise<ContextEconomics[]> {
    return db.select().from(contextEconomics).where(eq(contextEconomics.agentId, agentId)).orderBy(desc(contextEconomics.createdAt));
  }

  async getContextEconomicsByTrace(traceId: string): Promise<ContextEconomics | undefined> {
    const [record] = await db.select().from(contextEconomics).where(eq(contextEconomics.traceId, traceId));
    return record;
  }

  async getContextEconomicsByIndustry(industry: string): Promise<ContextEconomics[]> {
    return db.select().from(contextEconomics).where(eq(contextEconomics.industry, industry)).orderBy(desc(contextEconomics.createdAt));
  }

  async createContextRecommendation(rec: InsertContextRecommendation): Promise<ContextRecommendation> {
    const [created] = await db.insert(contextRecommendations).values(rec).returning();
    return created;
  }

  async getContextRecommendations(agentId: string, status?: string): Promise<ContextRecommendation[]> {
    const conditions = [eq(contextRecommendations.agentId, agentId)];
    if (status) conditions.push(eq(contextRecommendations.status, status));
    return db.select().from(contextRecommendations).where(and(...conditions)).orderBy(desc(contextRecommendations.createdAt));
  }

  async updateContextRecommendation(id: string, data: Partial<ContextRecommendation>): Promise<ContextRecommendation | undefined> {
    const [updated] = await db.update(contextRecommendations).set(data).where(eq(contextRecommendations.id, id)).returning();
    return updated;
  }

  async getContextRecommendation(id: string): Promise<ContextRecommendation | undefined> {
    const [rec] = await db.select().from(contextRecommendations).where(eq(contextRecommendations.id, id));
    return rec;
  }

  async getAgentTriggers(agentId: string): Promise<AgentTrigger[]> {
    return db.select().from(agentTriggers).where(eq(agentTriggers.agentId, agentId)).orderBy(desc(agentTriggers.createdAt));
  }

  async getAgentTrigger(id: string): Promise<AgentTrigger | undefined> {
    const [trigger] = await db.select().from(agentTriggers).where(eq(agentTriggers.id, id));
    return trigger;
  }

  async createAgentTrigger(trigger: InsertAgentTrigger): Promise<AgentTrigger> {
    const [created] = await db.insert(agentTriggers).values(trigger).returning();
    return created;
  }

  async updateAgentTrigger(id: string, data: Partial<AgentTrigger>): Promise<AgentTrigger | undefined> {
    const [updated] = await db.update(agentTriggers).set(data).where(eq(agentTriggers.id, id)).returning();
    return updated;
  }

  async deleteAgentTrigger(id: string): Promise<boolean> {
    const result = await db.delete(agentTriggers).where(eq(agentTriggers.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getAgentTriggersByType(triggerType: string): Promise<AgentTrigger[]> {
    return db.select().from(agentTriggers).where(eq(agentTriggers.triggerType, triggerType));
  }
}

export const storage = new DatabaseStorage();
